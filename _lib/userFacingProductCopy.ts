import type { OwnerControlCanaryResult } from "./adminOwnerControls";

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
    .replace(/\bchannel subscription(s?)\b/giu, (_match, plural: string) => `Platform Subscription${plural ? "s" : ""}`);
}

export function normalizeProductNotificationCopy(value: unknown, notificationType: unknown) {
  if (notificationType === "social_follow" && value === "Someone followed your channel.") {
    return "Someone followed your Platform.";
  }
  return normalizePlatformSubscriptionNotificationCopy(value, notificationType);
}

export const formatContentTypeLabel = (value: unknown) => (
  value === "channel" ? "Platform" : String(value ?? "").replaceAll("_", " ")
);

const LEGACY_DMCA_PLATFORM_REASON = "Missing backend piece: safe DMCA disable/restore route for channel-level takedowns; preserve evidence and use support/legal handling.";
const DMCA_PLATFORM_REASON = "Missing backend piece: safe DMCA disable/restore route for Platform-level takedowns; preserve evidence and use support/legal handling.";
const exactCopy = <T,>(value: T, oldCopy: string, newCopy: string): T | string => (
  value === oldCopy ? newCopy : value
);

// Normalize only known generated display fields; raw canary results and authority stay intact.
export function normalizeAdminCanaryDisplayCopy(result: OwnerControlCanaryResult): OwnerControlCanaryResult {
  if (result.key === "dmca_content_mutation_channel") {
    const oldActual = `channel: disable/hide/restore disabled. ${LEGACY_DMCA_PLATFORM_REASON}`;
    const newActual = `Platform: disable/hide/restore disabled. ${DMCA_PLATFORM_REASON}`;
    return {
      ...result,
      label: exactCopy(result.label, "DMCA content mutation: channel", "DMCA content mutation: Platform"),
      actual: exactCopy(result.actual, oldActual, newActual),
      message: exactCopy(result.message, oldActual, newActual),
      ...(result.details?.content_type === "channel" && result.details.reason === LEGACY_DMCA_PLATFORM_REASON ? {
        details: {
          ...result.details,
          reason: exactCopy(result.details.reason, LEGACY_DMCA_PLATFORM_REASON, DMCA_PLATFORM_REASON),
        },
      } : {}),
    };
  }
  if (result.key === "public_channel_sanitized_rpc") {
    return {
      ...result,
      label: exactCopy(result.label, "Public profile/channel sanitized RPCs working", "Public profile/Platform sanitized RPCs working"),
      expected: exactCopy(result.expected,
        "Public sanitized profile/channel RPC responds for a non-owner candidate.",
        "Public sanitized profile/Platform RPC responds for a non-owner candidate."),
    };
  }
  if (result.key === "legal_evidence_target_matrix") {
    const oldActual = "Legal Evidence preview matrix passed for user/account, profile/channel, creator video, profile post, comments/replies, attachment, chat thread, room/live metadata, reports, DMCA case, and date range.";
    const newActual = "Legal Evidence preview matrix passed for user/account, profile/Platform, creator video, profile post, comments/replies, attachment, chat thread, room/live metadata, reports, DMCA case, and date range.";
    return {
      ...result,
      actual: exactCopy(result.actual, oldActual, newActual),
      message: exactCopy(result.message, oldActual, newActual),
    };
  }
  return result;
}
