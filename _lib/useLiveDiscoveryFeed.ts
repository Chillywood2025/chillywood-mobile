import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from './accountSessionAuthority';
import { readCircleSpectatorFeedItems } from './circleSpectatorFeed';
import { readPublicDiscoveryFeedItems, rankDiscoveryFeedItems, rankCircleSpectatorFeedItems, type DiscoveryFeedItem, type DiscoveryFeedRankingSignals, type PublicDiscoveryFeedReadOptions } from './discoveryFeed';
import { readDiscoveryCandidateRankingSignals } from './discoveryRankingSignals';
import { useSession } from './session';
import { getDiscoveryLiveUpdateInterest, isDiscoveryLiveUpdateConnected, subscribeToLiveUpdates } from './sharedLiveUpdates';
import { readSharedLiveSnapshot } from './sharedLiveRead';

export const LIVE_DISCOVERY_REFRESH_MS = 30_000;
export const LIVE_DISCOVERY_READ_TIMEOUT_MS = 12_000;
export const LIVE_DISCOVERY_HEALTHY_HEAD_REFRESH_MS = 120_000;
export type LiveDiscoveryFeedOptions = Omit<PublicDiscoveryFeedReadOptions, 'itemId' | 'itemIds' | 'signal'> & {
  enabled?: boolean;
  includeCircle?: boolean;
  /** Only card rails with an explicit new-items button should opt in. */
  preserveBrowsePosition?: boolean;
};
const empty = () => ({ items: [] as DiscoveryFeedItem[], publicItems: [] as DiscoveryFeedItem[], circleItems: [] as DiscoveryFeedItem[], signals: {} as DiscoveryFeedRankingSignals, ready: false, pendingItemCount: 0 });
const settledValue = <T,>(result: PromiseSettledResult<T>): T => {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
};

// Read-only refresh; audience and playback access continue to be enforced by the existing views and destinations.
export function useLiveDiscoveryFeed(options: LiveDiscoveryFeedOptions = {}) {
  const { authority, authorityStatus } = useSession();
  const focused = useIsFocused();
  const optionsKey = JSON.stringify(options);
  const lifetime = useMemo(() => ({ authority, authorityStatus, optionsKey }), [authority, authorityStatus, optionsKey]);
  const latest = useRef(lifetime);
  latest.current = lifetime;
  const reloadRef = useRef<{ lifetime: object; run: () => Promise<void> } | null>(null);
  const [state, setState] = useState(() => ({ ...empty(), lifetime, loading: true, error: null as string | null }));

  useEffect(() => {
    const settings = JSON.parse(optionsKey) as LiveDiscoveryFeedOptions;
    let disposed = false;
    let sequence = 0;
    let pending: Promise<void> | null = null;
    let controller: AbortController | null = null;
    let snapshot = empty();
    let lastAutomaticRead = -Infinity;
    let lastHeadRead = -Infinity;
    let acceptRequested = false;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const guest = authorityStatus === 'signed_out' && authority === null;
    const enabled = settings.enabled !== false && focused && (guest || (authorityStatus === 'active' && !!authority && !authority.restoreOnly));
    const current = () => !disposed && latest.current === lifetime && enabled
      && AppState.currentState === 'active'
      && (guest ? getCurrentAccountSessionAuthoritySnapshot() === null : sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()));
    const clear = () => { snapshot = empty(); setState({ ...snapshot, lifetime, loading: false, error: null }); };
    const arm = () => {
      dirty = true;
      if (!current() || trailing !== undefined) return;
      trailing = setTimeout(() => { trailing = undefined; if (dirty) void run(); }, Math.max(1_000, 10_000 - (Date.now() - lastAutomaticRead)));
    };
    const run = (acceptNew = false, periodic = false): Promise<void> => {
      if (!current()) return Promise.resolve();
      if (pending) {
        // A tap during an automatic refresh must not disappear into its stale
        // snapshot. Reread after it settles before accepting new cards.
        if (acceptNew) {
          acceptRequested = true;
          return pending.then(() => { if (!acceptRequested || !current()) return; acceptRequested = false; return run(true); });
        }
        arm(); return pending;
      }
      if (!acceptNew && Date.now() - lastAutomaticRead < 10_000) { arm(); return Promise.resolve(); }
      dirty = false;
      if (trailing !== undefined) clearTimeout(trailing);
      trailing = undefined;
      lastAutomaticRead = Date.now();
      const stable = settings.preserveBrowsePosition === true && settings.liveOnly === true && snapshot.ready && !acceptNew;
      const previous = snapshot;
      // Healthy push reduces expensive head/ranking polling, not visibility
      // checks. Pinned cards still revalidate every30s and open/join is canonical.
      const refreshHead = !stable || !periodic || !isDiscoveryLiveUpdateConnected(authority, getDiscoveryLiveUpdateInterest(settings))
        || Date.now() - lastHeadRead >= LIVE_DISCOVERY_HEALTHY_HEAD_REFRESH_MS;
      if (refreshHead) lastHeadRead = Date.now();
      const request = ++sequence;
      const ownedController = new AbortController();
      controller = ownedController;
      setState((old) => ({ ...(old.lifetime === lifetime ? old : empty()), lifetime, loading: old.lifetime !== lifetime || old.items.length === 0, error: null }));
      pending = (async () => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let rejectAbort: () => void = () => {};
        const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(new Error('Discovery read retired.')); });
        ownedController.signal.addEventListener('abort', rejectAbort, { once: true });
        try {
          timeout = setTimeout(() => ownedController.abort(), LIVE_DISCOVERY_READ_TIMEOUT_MS);
          const result = await Promise.race([
            readSharedLiveSnapshot(JSON.stringify([authority?.userId, authority?.accountId, authority?.sessionGeneration, guest]),
              JSON.stringify([settings, refreshHead, stable ? previous.publicItems.map(item => item.id) : [], stable ? previous.circleItems.map(item => item.id) : []]),
              ownedController.signal, async sharedSignal => {
                // An early failure must not release shared ownership while a
                // sibling source still runs, even if it ignores cancellation.
                const reads = await Promise.allSettled([
              refreshHead ? readPublicDiscoveryFeedItems({ ...settings, signal: sharedSignal }) : Promise.resolve(previous.publicItems),
              !refreshHead ? Promise.resolve(previous.circleItems)
                : settings.includeCircle && !guest ? readCircleSpectatorFeedItems({ ...settings, signal: sharedSignal }) : Promise.resolve([]),
              stable && previous.publicItems.length
                ? readPublicDiscoveryFeedItems({ ...settings, itemIds: previous.publicItems.map(item => item.id), limit: 50, signal: sharedSignal })
                : Promise.resolve(null),
              stable && previous.circleItems.length && settings.includeCircle && !guest
                ? readCircleSpectatorFeedItems({ ...settings, itemIds: previous.circleItems.map(item => item.id), limit: 50, signal: sharedSignal }).then(items => rankCircleSpectatorFeedItems(items))
                : Promise.resolve(null),
                ]);
                const publicRows = settledValue(reads[0]), circleRows = settledValue(reads[1]);
                const publicPinned = settledValue(reads[2]), circlePinned = settledValue(reads[3]);
                if (sharedSignal.aborted) throw new Error('Discovery read retired.');
                const signals = !refreshHead ? previous.signals : guest ? {} : await readDiscoveryCandidateRankingSignals([...publicRows, ...circleRows], sharedSignal);
                return [{ items: rankDiscoveryFeedItems(publicRows, signals), signals }, { items: rankCircleSpectatorFeedItems(circleRows, signals) }, publicPinned, circlePinned] as const;
              }),
            aborted,
          ]);
          if (!current() || request !== sequence) return;
          const [publicResult, circleResult, currentPublic, currentCircle] = result;
          const inPreviousOrder = (before: DiscoveryFeedItem[], now: DiscoveryFeedItem[]) => {
            const byId = new Map(now.map(item => [item.id, item]));
            return before.flatMap(item => { const currentItem = byId.get(item.id); return currentItem ? [currentItem] : []; });
          };
          const publicItems = stable ? inPreviousOrder(previous.publicItems, currentPublic ?? []) : publicResult.items;
          const circleItems = stable ? inPreviousOrder(previous.circleItems, currentCircle ?? []) : circleResult?.items ?? [];
          const items = Array.from(new Map([...publicItems, ...circleItems].map((item) => [item.id, item])).values());
          const visibleIds = new Set(items.map(item => item.id));
          const pendingItemCount = !refreshHead ? previous.pendingItemCount : stable ? new Set([...publicResult.items, ...(circleResult?.items ?? [])].filter(item => !visibleIds.has(item.id)).map(item => item.id)).size : 0;
          snapshot = { publicItems, circleItems, items, signals: refreshHead ? publicResult.signals : previous.signals, ready: true, pendingItemCount };
          setState({ ...snapshot, lifetime, loading: false, error: null });
        } catch {
          ownedController.abort();
          if (current() && request === sequence) {
            snapshot = empty();
            setState({ ...snapshot, lifetime, loading: false, error: 'Live discovery could not refresh. Please try again.' });
          }
        } finally {
          clearTimeout(timeout);
          ownedController.signal.removeEventListener('abort', rejectAbort);
          if (request === sequence) { pending = null; controller = null; if (dirty) arm(); }
        }
      })();
      return pending;
    };
    const owned = { lifetime, run: () => run(true) };
    reloadRef.current = owned;
    clear();
    void run();
    const interval = enabled ? setInterval(() => { void run(false, true); }, LIVE_DISCOVERY_REFRESH_MS) : null;
    const updates = enabled && !guest ? subscribeToLiveUpdates(authority, 'discovery', () => { void run(); }, getDiscoveryLiveUpdateInterest(settings)) : () => {};
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { lastAutomaticRead = -Infinity; void run(); }
      else { ++sequence; controller?.abort(); controller = null; pending = null; dirty = false; if (trailing !== undefined) clearTimeout(trailing); trailing = undefined; clear(); }
    });
    return () => {
      disposed = true; ++sequence; controller?.abort();
      if (trailing !== undefined) clearTimeout(trailing);
      if (interval !== null) clearInterval(interval);
      subscription.remove();
      updates();
      if (reloadRef.current === owned) reloadRef.current = null;
    };
  }, [authority, authorityStatus, focused, lifetime, optionsKey]);

  const reload = useCallback(() => reloadRef.current?.lifetime === lifetime ? reloadRef.current.run() : Promise.resolve(), [lifetime]);
  const visible = state.lifetime === lifetime && focused && options.enabled !== false
    && ((authorityStatus === 'signed_out' && authority === null && getCurrentAccountSessionAuthoritySnapshot() === null)
      || (authorityStatus === 'active' && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())));
  return { ...(visible ? state : { ...empty(), loading: false, error: null }), reload };
}
