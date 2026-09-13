const PLATFORM_SUBSCRIPTION_NOTIFICATION_TYPE = /^channel_subscription(?:_|$)/u;
const INTERNAL_PLATFORM_SUBSCRIPTION_PREFIX = /^(?:sandbox\s+proof\s+record|sandbox\s+test|test\s+mode|proof(?:-only)?)\s*:\s*/iu;

export function normalizePlatformSubscriptionNotificationCopy(
  value: unknown,
  notificationType: unknown,
) {
  const copy = typeof value === "string" ? value.trim() : "";
  const type = typeof notificationType === "string" ? notificationType.trim().toLowerCase() : "";
  if (!copy || !PLATFORM_SUBSCRIPTION_NOTIFICATION_TYPE.test(type)) return copy;

  const customerCopy = copy.replace(INTERNAL_PLATFORM_SUBSCRIPTION_PREFIX, "");
  const sentenceCaseCopy = customerCopy === copy
    ? customerCopy
    : customerCopy.replace(/^./u, (character) => character.toUpperCase());

  return sentenceCaseCopy
    .replaceAll("Channel Subscriptions", "Platform Subscriptions")
    .replaceAll("Channel Subscription", "Platform Subscription")
    .replaceAll("channel subscriptions", "Platform Subscriptions")
    .replaceAll("channel subscription", "Platform Subscription");
}
