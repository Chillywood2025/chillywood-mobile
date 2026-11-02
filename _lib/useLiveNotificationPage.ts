import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { getCurrentNotificationActivityOwnerKey, getNotificationActivityOwnerKey, subscribeToNotificationActivity } from "./notificationActivity";
import { expireLiveNotificationActivity, isLiveNotificationActivity } from "./liveNotificationActivity";
import { readNotificationListPage, type NotificationRecord } from "./notifications";
import { subscribeToLiveUpdates } from "./sharedLiveUpdates";
import { createDiscoveryReadFence, type DiscoveryLiveInvalidation } from "./liveDiscoveryInvalidation";
import { createNotificationHintBudget } from "./notificationHintBudget";

/** An own-activity consumer, not a second notification transport or cache.
 * Retains actual read ownership across focus/session changes and expires only
 * sensitive live labels while current canonical authority is unavailable. */
export function useLiveNotificationPage(options: {
  authority: AccountSessionAuthorityBinding | null | undefined;
  enabled: boolean;
  refreshKey: number;
  limit?: number;
}) {
  const ownerKey = getNotificationActivityOwnerKey(options.authority);
  const limit = options.limit ?? 12;
  const enabled = options.enabled && !!ownerKey;
  // Focus/manual-refresh transitions must hide old authority during render,
  // before effects run (including a same-account return from the background).
  const scopeKey = JSON.stringify([ownerKey, enabled, options.refreshKey, limit]);
  const scope = useRef({ key: scopeKey, epoch: 0 });
  if (scope.current.key !== scopeKey) scope.current = { key: scopeKey, epoch: scope.current.epoch + 1 };
  const requestEpoch = scope.current.epoch;
  const optionsRef = useRef({ ownerKey, enabled, requestEpoch });
  optionsRef.current = { ownerKey, enabled, requestEpoch };
  const generation = useRef(0);
  const flight = useRef<{ controller: AbortController; generation: number; fence: ReturnType<typeof createDiscoveryReadFence> } | null>(null);
  const queued = useRef<(() => void) | null>(null);
  const itemsRef = useRef<{ ownerKey: string; requestEpoch: number; items: NotificationRecord[] }>({ ownerKey: "", requestEpoch: -1, items: [] });
  const [state, setState] = useState({ ownerKey: "", requestEpoch: -1, items: [] as NotificationRecord[], ready: false, notice: null as string | null });

  useEffect(() => {
    const epoch = ++generation.current;
    let active = true;
    let foreground = AppState.currentState === "active";
    const current = () => active && foreground && enabled && generation.current === epoch
      && optionsRef.current.enabled && optionsRef.current.ownerKey === ownerKey && optionsRef.current.requestEpoch === requestEpoch
      && getCurrentNotificationActivityOwnerKey() === ownerKey;
    const publish = (items: NotificationRecord[], ready: boolean, notice: string | null) => {
      if (!current()) return;
      itemsRef.current = { ownerKey, requestEpoch, items };
      setState({ ownerKey, requestEpoch, items, ready, notice });
    };
    if (itemsRef.current.ownerKey !== ownerKey) itemsRef.current = { ownerKey, requestEpoch, items: [] };
    const expire = (invalidation?: DiscoveryLiveInvalidation) => publish(expireLiveNotificationActivity(itemsRef.current.items, invalidation), true, null);
    const read = async () => {
      if (!current()) return;
      if (flight.current) { queued.current = read; return; }
      const owned = { controller: new AbortController(), generation: epoch, fence: createDiscoveryReadFence() };
      flight.current = owned;
      const deadline = setTimeout(() => {
        publish(expireLiveNotificationActivity(itemsRef.current.items), true, "Activity could not be refreshed. Please retry.");
        owned.controller.abort();
        // An ignored abort is not settlement; retain this source's ownership.
      }, 10_000);
      try {
        const page = await readNotificationListPage(options.authority!.userId, limit, null, owned.controller.signal);
        if (!current() || owned.controller.signal.aborted) return;
        if (page.status !== "resolved" || page.subjectUserId !== options.authority!.userId) throw new Error("activity_unavailable");
        publish(page.items.flatMap(item => !isLiveNotificationActivity(item) || owned.fence.allows(item.target.context)
          ? [item] : expireLiveNotificationActivity([item])), true, null);
      } catch {
        publish(expireLiveNotificationActivity(itemsRef.current.items), true, "Activity could not be refreshed. Please retry.");
      } finally {
        clearTimeout(deadline);
        if (flight.current === owned) {
          flight.current = null;
          const next = queued.current; queued.current = null; next?.();
        }
      }
    };
    const refresh = () => { if (current()) { expire(); void read(); } };
    const budget = createNotificationHintBudget(() => { void read(); }, 500);
    const hint = (invalidation?: DiscoveryLiveInvalidation) => { if (current()) {
      flight.current?.fence.invalidate(invalidation); expire(invalidation); budget.hint();
    } };
    const discovery = subscribeToLiveUpdates(enabled ? options.authority : null, "discovery", hint, { surface: "profile" });
    const activity = subscribeToNotificationActivity(enabled ? ownerKey : "", () => hint({ keys: [] }));
    let fallback: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!active) return;
      if (itemsRef.current.items.some(isLiveNotificationActivity)) refresh();
      fallback = setTimeout(tick, 30_000);
    };
    fallback = setTimeout(tick, 30_000);
    const lifecycle = AppState.addEventListener("change", next => {
      foreground = next === "active";
      if (foreground) refresh();
      else if (flight.current?.generation === epoch) flight.current.controller.abort();
    });
    if (current()) { publish(expireLiveNotificationActivity(itemsRef.current.items), false, null); void read(); }
    return () => {
      active = false; budget.stop(); discovery(); activity(); lifecycle.remove(); clearTimeout(fallback);
      if (queued.current === read) queued.current = null;
      if (flight.current?.generation === epoch) flight.current.controller.abort();
    };
  }, [enabled, ownerKey, options.authority, options.refreshKey, limit, requestEpoch]);

  const visible = enabled && state.requestEpoch === requestEpoch && state.ownerKey === ownerKey && getCurrentNotificationActivityOwnerKey() === ownerKey;
  return {
    items: visible ? state.items : [],
    ready: !enabled || (visible && state.ready),
    notice: visible ? state.notice : null,
    current: (id: string) => AppState.currentState === "active" && optionsRef.current.enabled && itemsRef.current.ownerKey === optionsRef.current.ownerKey
      && itemsRef.current.requestEpoch === optionsRef.current.requestEpoch
      && getCurrentNotificationActivityOwnerKey() === optionsRef.current.ownerKey
      ? itemsRef.current.items.find(item => item.id === id) : undefined,
  };
}
