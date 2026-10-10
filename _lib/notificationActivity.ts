import {
  getCurrentAccountSessionAuthoritySnapshot,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import { supabase } from "./supabase";

const listeners = new Set<{ ownerKey: string; listener: () => void }>();
let channelSequence = 0;

export function getNotificationActivityOwnerKey(authority?: AccountSessionAuthorityBinding | null) {
  if (!authority || authority.state !== "ACTIVE" || authority.restoreOnly !== false
    || !authority.userId || authority.accountId !== authority.userId || !authority.sessionGeneration) return "";
  return JSON.stringify([authority.userId, authority.accountId, authority.sessionGeneration]);
}

export function getCurrentNotificationActivityOwnerKey() {
  return getNotificationActivityOwnerKey(getCurrentAccountSessionAuthoritySnapshot());
}

export function invalidateNotificationActivity(ownerKey: string) {
  // A receipt is only a reason to reread current durable activity. It carries
  // no row, unread count, or authority across an account/session replacement.
  if (!ownerKey || ownerKey !== getCurrentNotificationActivityOwnerKey()) return;
  for (const entry of listeners) {
    if (entry.ownerKey !== ownerKey) continue;
    try { entry.listener(); } catch { /* One retired consumer cannot interrupt delivery. */ }
  }
}

export function subscribeToNotificationActivity(ownerKey: string, listener: () => void) {
  const entry = { ownerKey, listener };
  if (ownerKey) listeners.add(entry);
  return () => { listeners.delete(entry); };
}

export function subscribeToNotificationActivityChanges(authority?: AccountSessionAuthorityBinding | null) {
  const ownerKey = getNotificationActivityOwnerKey(authority);
  if (!ownerKey || ownerKey !== getCurrentNotificationActivityOwnerKey()) return () => {};
  const userId = authority!.userId;
  let active = true;
  const ownsSubscription = () => active && ownerKey === getCurrentNotificationActivityOwnerKey();
  const onChange = (payload: { new: Record<string, unknown> }) => {
    if (ownsSubscription() && payload.new?.user_id === userId) invalidateNotificationActivity(ownerKey);
  };
  // RLS authorizes each row; the exact user filter and owner recheck also keep
  // delayed callbacks inside their original account/session. Do not subscribe
  // to DELETE, whose CDC payload lacks the same row-level authorization.
  const channel = supabase.channel(`notification-activity-${++channelSequence}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, onChange)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, onChange)
    .subscribe((status) => {
      // Includes reconnection: reread durable state instead of assuming every
      // change was received while the transport was unavailable.
      if (status === "SUBSCRIBED" && ownsSubscription()) invalidateNotificationActivity(ownerKey);
    });
  return () => {
    active = false;
    void supabase.removeChannel(channel).catch(() => {});
  };
}
