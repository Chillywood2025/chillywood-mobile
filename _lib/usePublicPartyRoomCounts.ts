import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "./accountSessionAuthority";
import { normalizePartyCountTitleIds, readPublicPartyRoomCounts, type PublicPartyRoomCounts } from "./publicPartyRoomCounts";
import { useSession } from "./session";
import { subscribeToLiveUpdates } from "./sharedLiveUpdates";
import { createDiscoveryReadFence, type DiscoveryLiveInvalidation } from "./liveDiscoveryInvalidation";

/** Public title badges use the same current-source boundary as discovery cards.
 * Account, route, foreground and focus changes retire every pending response. */
export function usePublicPartyRoomCounts(titleIds: readonly string[]) {
  const { authority, authorityStatus } = useSession();
  const focused = useIsFocused();
  const key = JSON.stringify(normalizePartyCountTitleIds(titleIds));
  const owner = useMemo(() => ({ authority, authorityStatus, key, focused }), [authority, authorityStatus, key, focused]);
  const latest = useRef(owner); latest.current = owner;
  const [saved, setSaved] = useState<{ owner: typeof owner; counts: PublicPartyRoomCounts }>({ owner, counts: {} });
  const reloadRef = useRef<{ owner: typeof owner; run: () => Promise<void> } | null>(null);
  useEffect(() => {
    let disposed = false, pending = false, dirty = false, sequence = 0;
    let controller: AbortController | null = null;
    let lastStarted = -Infinity, trailing: ReturnType<typeof setTimeout> | undefined;
    const readFence = createDiscoveryReadFence();
    const enabled = focused && authorityStatus === "active" && !!authority && !authority.restoreOnly && key !== "[]";
    const current = () => !disposed && latest.current === owner && enabled && AppState.currentState === "active"
      && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    const clear = () => setSaved({ owner, counts: {} });
    const retire = () => { ++sequence; controller?.abort(); controller = null; pending = false; dirty = false; clearTimeout(trailing); trailing = undefined; clear(); };
    const arm = () => {
      dirty = true;
      if (!current() || trailing !== undefined) return;
      trailing = setTimeout(() => { trailing = undefined; if (dirty) void run(); }, Math.max(1, 500 - (Date.now() - lastStarted)));
    };
    const run = async (manual = false): Promise<void> => {
      if (!current()) return;
      if (pending) { dirty = true; return; }
      if (!manual && Date.now() - lastStarted < 500) { arm(); return; }
      clearTimeout(trailing); trailing = undefined; dirty = false; lastStarted = Date.now();
      readFence.begin();
      pending = true;
      const request = ++sequence;
      const owned = new AbortController(); controller = owned;
      let rejectAbort: () => void = () => {};
      const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(new Error("Public Party count read retired.")); });
      owned.signal.addEventListener("abort", rejectAbort, { once: true });
      const timeout = setTimeout(() => owned.abort(), 12_000);
      try {
        const counts = await Promise.race([readPublicPartyRoomCounts(JSON.parse(key), owned.signal), aborted]);
        if (current() && sequence === request && !readFence.full()) setSaved({ owner,
          counts: Object.fromEntries(Object.entries(counts).filter(([, count]) => readFence.allows(count))) });
      } catch {
        if (current() && sequence === request) clear();
      } finally {
        clearTimeout(timeout); owned.signal.removeEventListener("abort", rejectAbort);
        if (sequence === request) { pending = false; controller = null; if (dirty) arm(); }
      }
    };
    clear();
    const owned = { owner, run: () => run(true) }; reloadRef.current = owned;
    void run();
    const timer = enabled ? setInterval(() => { void run(); }, 30_000) : null;
    const onHint = (invalidation?: DiscoveryLiveInvalidation) => {
      if (!current()) return;
      if (pending) readFence.invalidate(invalidation);
      if (invalidation?.keys?.length) {
        const visibleFence = createDiscoveryReadFence(); visibleFence.invalidate(invalidation);
        setSaved(old => {
          if (old.owner !== owner) return { owner, counts: {} };
          const counts = Object.fromEntries(Object.entries(old.counts).filter(([, count]) => visibleFence.allows(count)));
          return Object.keys(counts).length === Object.keys(old.counts).length ? old : { owner, counts };
        });
      }
      void run();
    };
    const updates = enabled ? subscribeToLiveUpdates(authority, "discovery", onHint, { surface: "home" }) : () => {};
    const account = subscribeToAccountSessionAuthority(next => { if (!sameAccountSessionAuthority(authority, next)) retire(); });
    const app = AppState.addEventListener("change", state => { if (state === "active") void run(); else retire(); });
    return () => {
      disposed = true; ++sequence; controller?.abort();
      clearTimeout(trailing);
      if (timer !== null) clearInterval(timer);
      updates(); account(); app.remove();
      if (reloadRef.current === owned) reloadRef.current = null;
    };
  }, [authority, authorityStatus, focused, key, owner]);
  const reload = useCallback(() => reloadRef.current?.owner === owner ? reloadRef.current.run() : Promise.resolve(), [owner]);
  const visible = saved.owner === owner && focused && authorityStatus === "active" && AppState.currentState === "active"
    && !!authority && !authority.restoreOnly && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  return { counts: visible ? saved.counts : {}, reload };
}
