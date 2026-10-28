import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from './accountSessionAuthority';
import { readPublicUpcomingEventSummaries, type CreatorEventSummary, type PublicUpcomingEventReadOptions } from './liveEvents';
import { useSession } from './session';
import { getDiscoveryLiveUpdateInterest, subscribeToLiveUpdates } from './sharedLiveUpdates';

export const LIVE_UPCOMING_REFRESH_MS = 30_000;
export const LIVE_UPCOMING_HINT_MIN_MS = 10_000;
export const LIVE_UPCOMING_READ_TIMEOUT_MS = 12_000;
export type LiveUpcomingEventsOptions = Omit<PublicUpcomingEventReadOptions, 'signal'> & { enabled?: boolean };
const empty = () => ({ items: [] as CreatorEventSummary[], ready: false });

/** Hints invalidate only; every replacement is read through public event RLS. */
export function useLiveUpcomingEvents(options: LiveUpcomingEventsOptions = {}) {
  const { authority, authorityStatus } = useSession();
  const focused = useIsFocused();
  const optionsKey = JSON.stringify(options);
  const lifetime = useMemo(() => ({ authority, authorityStatus, optionsKey }), [authority, authorityStatus, optionsKey]);
  const latest = useRef(lifetime);
  latest.current = lifetime;
  const reloadRef = useRef<{ lifetime: object; run: () => Promise<void> } | null>(null);
  const [state, setState] = useState(() => ({ ...empty(), lifetime, loading: true, error: null as string | null }));

  useEffect(() => {
    const settings = JSON.parse(optionsKey) as LiveUpcomingEventsOptions;
    let disposed = false;
    let sequence = 0;
    let pending: Promise<void> | null = null;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dueAt = Infinity;
    let lastStarted = -Infinity;
    let hinted = false;
    let unsubscribe: (() => void) | null = null;
    const guest = authorityStatus === 'signed_out' && authority === null;
    const enabled = settings.enabled !== false && focused
      && (guest || (authorityStatus === 'active' && !!authority && !authority.restoreOnly));
    const current = () => !disposed && latest.current === lifetime && enabled && AppState.currentState === 'active'
      && (guest ? getCurrentAccountSessionAuthoritySnapshot() === null
        : sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()));
    const clear = () => setState({ ...empty(), lifetime, loading: false, error: null });
    const cancelTimer = () => { clearTimeout(timer); timer = undefined; dueAt = Infinity; };
    const arm = () => {
      if (!current()) return;
      const next = Math.max(Date.now(), lastStarted + (hinted ? LIVE_UPCOMING_HINT_MIN_MS : LIVE_UPCOMING_REFRESH_MS));
      // A due hint waits for the held read's completion, not a zero-delay loop.
      if (pending && next <= Date.now()) return;
      if (timer !== undefined && dueAt <= next) return;
      cancelTimer(); dueAt = next;
      timer = setTimeout(() => { timer = undefined; dueAt = Infinity; void run(false); }, Math.max(0, next - Date.now()));
    };
    const run = (manual: boolean, fromHint = false): Promise<void> => {
      if (!current()) return Promise.resolve();
      if (fromHint) hinted = true;
      if (pending) { if (!manual) arm(); return pending; }
      if (!manual && Date.now() < lastStarted + (hinted ? LIVE_UPCOMING_HINT_MIN_MS : LIVE_UPCOMING_REFRESH_MS)) { arm(); return Promise.resolve(); }
      cancelTimer(); lastStarted = Date.now(); hinted = false;
      const request = ++sequence;
      const ownedController = new AbortController();
      controller = ownedController;
      setState((old) => ({ ...(old.lifetime === lifetime ? old : empty()), lifetime, loading: old.lifetime !== lifetime || !old.ready, error: null }));
      pending = (async () => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let rejectAbort: () => void = () => {};
        const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(new Error('Upcoming read retired.')); });
        ownedController.signal.addEventListener('abort', rejectAbort, { once: true });
        try {
          timeout = setTimeout(() => ownedController.abort(), LIVE_UPCOMING_READ_TIMEOUT_MS);
          const items = await Promise.race([
            readPublicUpcomingEventSummaries({ ...settings, signal: ownedController.signal }),
            aborted,
          ]);
          if (current() && request === sequence) setState({ lifetime, items, ready: true, loading: false, error: null });
        } catch {
          ownedController.abort();
          if (current() && request === sequence) setState({ ...empty(), lifetime, loading: false, error: 'Upcoming events could not refresh. Please try again.' });
        } finally {
          clearTimeout(timeout);
          ownedController.signal.removeEventListener('abort', rejectAbort);
          if (request === sequence) { pending = null; controller = null; arm(); }
        }
      })();
      return pending;
    };
    const connect = () => {
      if (current() && authority && !unsubscribe) unsubscribe = subscribeToLiveUpdates(authority, 'discovery', () => { void run(false, true); },
        getDiscoveryLiveUpdateInterest({ creatorUserIds: settings.hostUserIds }));
    };
    const owned = { lifetime, run: () => run(true) };
    reloadRef.current = owned;
    clear(); void run(false); connect();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') { void run(false); connect(); }
      else {
        ++sequence; controller?.abort(); controller = null; pending = null;
        cancelTimer(); lastStarted = -Infinity; hinted = false; unsubscribe?.(); unsubscribe = null; clear();
      }
    });
    return () => {
      disposed = true; ++sequence; controller?.abort(); cancelTimer(); unsubscribe?.(); subscription.remove();
      if (reloadRef.current === owned) reloadRef.current = null;
    };
  }, [authority, authorityStatus, focused, lifetime, optionsKey]);

  const reload = useCallback(() => reloadRef.current?.lifetime === lifetime ? reloadRef.current.run() : Promise.resolve(), [lifetime]);
  const visible = state.lifetime === lifetime && focused && options.enabled !== false
    && ((authorityStatus === 'signed_out' && authority === null && getCurrentAccountSessionAuthoritySnapshot() === null)
      || (authorityStatus === 'active' && !!authority && !authority.restoreOnly
        && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())));
  return { ...(visible ? state : { ...empty(), loading: false, error: null }), reload };
}
