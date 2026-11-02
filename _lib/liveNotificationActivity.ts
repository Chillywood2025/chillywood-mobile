import { discoveryHintKey, type DiscoveryLiveInvalidation, type createDiscoveryReadFence } from "./liveDiscoveryInvalidation";
import type { NotificationRecord, NotificationSummary } from "./notifications";

export const isLiveNotificationActivity = (notification: Pick<NotificationRecord, "notificationType">) =>
  ["followed_creator_live", "circle_friend_live", "live_room_member_joined"].includes(notification.notificationType);

export function canOpenLiveNotificationActivity(notification: NotificationRecord) {
  if (!isLiveNotificationActivity(notification)) return true;
  const context = notification.target.context;
  return !notification.isExpired && !!context && typeof context === "object" && !Array.isArray(context)
    && context.live_discovery_state === "live";
}

export function expireLiveNotificationActivity(items: NotificationRecord[], invalidation?: DiscoveryLiveInvalidation): NotificationRecord[] {
  return items.map(notification => isLiveNotificationActivity(notification)
    && (invalidation?.keys == null || (invalidation.keys.length > 0
      && (!discoveryHintKey(notification.target.context) || invalidation.keys.includes(discoveryHintKey(notification.target.context)!)))) ? {
    ...notification,
    title: notification.notificationType === "live_room_member_joined" ? "Live attendance update" : "Live notification",
    body: "Current availability could not be confirmed.",
    target: { ...notification.target, context: { live_discovery_state: "unavailable",
      ...(discoveryHintKey(notification.target.context) ? { discovery_hint_key: discoveryHintKey(notification.target.context) } : {}) } },
  } : notification);
}

/** The complete canonical footprint, not recent loaded notices, decides whether
 * a held aggregate may have crossed a privacy withdrawal. Old+new keys catch
 * removals and newly counted rows. Overflow/legacy absence is conservative. */
export function canAcceptLiveNotificationSummary(previous: NotificationSummary, next: NotificationSummary,
  fence: ReturnType<typeof createDiscoveryReadFence>) {
  if (fence.allows({})) return true; // No authority change since this read began.
  if (next.liveHintKeysComplete !== true) return false;
  const relevant = [previous, next].filter(summary => summary.hasLiveActivity === true
    || summary.categories.includes("creator_went_live"));
  return relevant.every(summary => summary.liveHintKeysComplete === true
    && Array.isArray(summary.liveHintKeys) && summary.liveHintKeys.every(key => fence.allows({ discoveryHintKey: key })));
}
