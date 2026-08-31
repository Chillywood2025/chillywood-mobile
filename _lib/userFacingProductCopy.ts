const PLATFORM_SUBSCRIPTION_NOTIFICATION_TYPE = /^channel_subscription(?:_|$)/u;

export function normalizePlatformSubscriptionNotificationCopy(
  value: unknown,
  notificationType: unknown,
) {
  const copy = typeof value === "string" ? value.trim() : "";
  const type = typeof notificationType === "string" ? notificationType.trim().toLowerCase() : "";
  if (!copy || !PLATFORM_SUBSCRIPTION_NOTIFICATION_TYPE.test(type)) return copy;

  return copy
    .replaceAll("Channel Subscriptions", "Platform Subscriptions")
    .replaceAll("Channel Subscription", "Platform Subscription")
    .replaceAll("channel subscriptions", "Platform Subscriptions")
    .replaceAll("channel subscription", "Platform Subscription");
}
