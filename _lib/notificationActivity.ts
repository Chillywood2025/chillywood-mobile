import {
  getCurrentAccountSessionAuthoritySnapshot,
  subscribeToAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import { AppState } from "react-native";
import { supabase } from "./supabase";

export type NotificationActivityReason = "hint" | "confirmed";
const listeners = new Set<{ ownerKey: string; listener: (reason: NotificationActivityReason) => void }>();
type ActivityTransport = { references: number; dispose: () => void };
const transports = new Map<string, ActivityTransport>();
let channelSequence = 0;

export function getNotificationActivityOwnerKey(authority?: AccountSessionAuthorityBinding | null) {
  if (!authority || authority.state !== "ACTIVE" || authority.restoreOnly !== false
    || !authority.userId || authority.accountId !== authority.userId || !authority.sessionGeneration) return "";
  return JSON.stringify([authority.userId, authority.accountId, authority.sessionGeneration]);
}

export function getCurrentNotificationActivityOwnerKey() {
  return getNotificationActivityOwnerKey(getCurrentAccountSessionAuthoritySnapshot());
}

export function invalidateNotificationActivity(ownerKey: string, reason: NotificationActivityReason = "hint") {
  // A receipt is only a reason to reread current durable activity. It carries
  // no row, unread count, or authority across an account/session replacement.
  if (!ownerKey || ownerKey !== getCurrentNotificationActivityOwnerKey()) return;
  for (const entry of listeners) {
    if (entry.ownerKey !== ownerKey) continue;
    try { entry.listener(reason); } catch { /* One retired consumer cannot interrupt delivery. */ }
  }
}

export function subscribeToNotificationActivity(ownerKey: string, listener: (reason: NotificationActivityReason) => void) {
  const entry = { ownerKey, listener };
  if (ownerKey) listeners.add(entry);
  return () => { listeners.delete(entry); };
}

export function subscribeToNotificationActivityChanges(authority?: AccountSessionAuthorityBinding | null) {
  const ownerKey = getNotificationActivityOwnerKey(authority);
  if (!ownerKey || ownerKey !== getCurrentNotificationActivityOwnerKey()) return () => {};
  let transport = transports.get(ownerKey);
  if (!transport) {
    const userId = authority!.userId;
    let active = true;
    let generation = 0;
    let foreground = AppState.currentState === "active";
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const detach = () => {
      generation += 1;
      const previous = channel;
      channel = null;
      if (previous) void supabase.removeChannel(previous).catch(() => {});
    };
    const connect = () => {
      if (!active || !foreground || channel || ownerKey !== getCurrentNotificationActivityOwnerKey()) return;
      const connectedGeneration = ++generation;
      const ownsSubscription = () => active && foreground && generation === connectedGeneration
        && ownerKey === getCurrentNotificationActivityOwnerKey();
      const onChange = (payload: { new: Record<string, unknown> }) => {
        if (ownsSubscription() && payload.new?.user_id === userId) invalidateNotificationActivity(ownerKey);
      };
      // Existing RLS remains the authority. Never request DELETE: its CDC row
      // does not carry the same recipient authorization as INSERT/UPDATE.
      channel = supabase.channel(`notification-activity-${++channelSequence}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, onChange)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, onChange)
        .subscribe((status) => {
          if (status === "SUBSCRIBED" && ownsSubscription()) invalidateNotificationActivity(ownerKey);
        });
    };
    const lifecycle = AppState.addEventListener("change", state => {
      foreground = state === "active";
      if (foreground) connect(); else detach();
    });
    const unsubscribeAuthority = subscribeToAccountSessionAuthority(() => {
      if (ownerKey === getCurrentNotificationActivityOwnerKey()) return;
      // Retirement is permanent even if a delayed callback sees the same user.
      active = false;
      detach();
      // Existing holders still own disposal, but a newly mounted consumer must
      // not reuse their retired transport if this exact authority reappears.
      if (transports.get(ownerKey) === transport) transports.delete(ownerKey);
    });
    transport = { references: 0, dispose: () => {
      active = false;
      detach();
      lifecycle.remove();
      unsubscribeAuthority();
    } };
    transports.set(ownerKey, transport);
    connect();
  }
  const owned = transport;
  owned.references += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owned.references -= 1;
    if (!owned.references) {
      if (transports.get(ownerKey) === owned) transports.delete(ownerKey);
      owned.dispose();
    }
  };
}
