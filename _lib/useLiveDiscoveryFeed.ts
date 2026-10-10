import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from './accountSessionAuthority';
import { readRankedCircleSpectatorFeedItems } from './circleSpectatorFeed';
import { readPublicDiscoveryFeedItems, rankDiscoveryFeedItems, readRankedPublicDiscoveryFeedItems, type DiscoveryFeedItem, type DiscoveryFeedRankingSignals, type PublicDiscoveryFeedReadOptions } from './discoveryFeed';
import { useSession } from './session';

export const LIVE_DISCOVERY_REFRESH_MS = 30_000;
export const LIVE_DISCOVERY_READ_TIMEOUT_MS = 12_000;
export type LiveDiscoveryFeedOptions = Omit<PublicDiscoveryFeedReadOptions, 'itemId' | 'signal'> & {
  enabled?: boolean;
  includeCircle?: boolean;
};
const empty = () => ({ items: [] as DiscoveryFeedItem[], publicItems: [] as DiscoveryFeedItem[], circleItems: [] as DiscoveryFeedItem[], signals: {} as DiscoveryFeedRankingSignals });

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
    const guest = authorityStatus === 'signed_out' && authority === null;
    const enabled = settings.enabled !== false && focused && (guest || (authorityStatus === 'active' && !!authority && !authority.restoreOnly));
    const current = () => !disposed && latest.current === lifetime && enabled
      && AppState.currentState === 'active'
      && (guest ? getCurrentAccountSessionAuthoritySnapshot() === null : sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()));
    const clear = () => setState({ ...empty(), lifetime, loading: false, error: null });
    const run = (): Promise<void> => {
      if (!current()) return Promise.resolve();
      if (pending) return pending;
      const request = ++sequence;
      const ownedController = new AbortController();
      controller = ownedController;
      setState((old) => ({ ...(old.lifetime === lifetime ? old : empty()), lifetime, loading: old.lifetime !== lifetime || old.items.length === 0, error: null }));
      pending = (async () => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            Promise.all([
              guest
                ? readPublicDiscoveryFeedItems({ ...settings, signal: ownedController.signal }).then(items => ({ items: rankDiscoveryFeedItems(items), signals: {} }))
                : readRankedPublicDiscoveryFeedItems({ ...settings, signal: ownedController.signal }),
              settings.includeCircle && !guest ? readRankedCircleSpectatorFeedItems({ ...settings, signal: ownedController.signal }) : Promise.resolve(null),
            ]),
            new Promise<never>((_, reject) => { timeout = setTimeout(() => { ownedController.abort(); reject(new Error('Discovery read timed out.')); }, LIVE_DISCOVERY_READ_TIMEOUT_MS); }),
          ]);
          if (!current() || request !== sequence) return;
          const [publicResult, circleResult] = result;
          const publicItems = publicResult.items;
          const circleItems = circleResult?.items ?? [];
          const items = Array.from(new Map([...publicItems, ...circleItems].map((item) => [item.id, item])).values());
          setState({ lifetime, publicItems, circleItems, items, signals: publicResult.signals, loading: false, error: null });
        } catch {
          ownedController.abort();
          if (current() && request === sequence) setState({ ...empty(), lifetime, loading: false, error: 'Live discovery could not refresh. Please try again.' });
        } finally {
          clearTimeout(timeout);
          if (request === sequence) { pending = null; controller = null; }
        }
      })();
      return pending;
    };
    const owned = { lifetime, run };
    reloadRef.current = owned;
    clear();
    void run();
    const interval = enabled ? setInterval(() => { void run(); }, LIVE_DISCOVERY_REFRESH_MS) : null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
      else { ++sequence; controller?.abort(); controller = null; pending = null; clear(); }
    });
    return () => {
      disposed = true; ++sequence; controller?.abort();
      if (interval !== null) clearInterval(interval);
      subscription.remove();
      if (reloadRef.current === owned) reloadRef.current = null;
    };
  }, [authority, authorityStatus, focused, lifetime, optionsKey]);

  const reload = useCallback(() => reloadRef.current?.lifetime === lifetime ? reloadRef.current.run() : Promise.resolve(), [lifetime]);
  const visible = state.lifetime === lifetime && focused && options.enabled !== false
    && ((authorityStatus === 'signed_out' && authority === null && getCurrentAccountSessionAuthoritySnapshot() === null)
      || (authorityStatus === 'active' && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())));
  return { ...(visible ? state : { ...empty(), loading: false, error: null }), reload };
}
