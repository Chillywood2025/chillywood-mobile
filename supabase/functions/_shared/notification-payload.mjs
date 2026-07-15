/**
 * Shared Expo push payload policy.
 *
 * Keep this module free of provider credentials so the same pure builder can be
 * exercised by local source proofs without loading an Edge Function runtime.
 */

export const IOS_NOTIFICATION_CATEGORIES = Object.freeze({
  activity: "chillywood_activity",
  missedCall: "chillywood_missed_call",
});

const IOS_INTERRUPTION_LEVELS = new Set(["active", "passive", "time-sensitive"]);

const normalizePlatform = (value) => String(value ?? "").trim().toLowerCase() === "ios" ? "ios" : "android";

/**
 * @param {{
 *   androidChannelId?: string;
 *   badge?: number;
 *   body: string;
 *   categoryId?: string;
 *   data: Record<string, unknown>;
 *   interruptionLevel?: "active" | "passive" | "time-sensitive";
 *   platform: "android" | "ios";
 *   priority?: "default" | "normal" | "high";
 *   sound?: string | null;
 *   title: string;
 *   to: string;
 *   ttl?: number;
 * }} input
 */
export const buildPlatformExpoPushMessage = (input) => {
  const platform = normalizePlatform(input.platform);
  const message = {
    body: String(input.body ?? ""),
    data: input.data && typeof input.data === "object" ? input.data : {},
    priority: input.priority ?? "high",
    title: String(input.title ?? ""),
    to: String(input.to ?? ""),
  };

  if (Number.isFinite(input.ttl) && input.ttl >= 0) {
    message.ttl = Math.floor(input.ttl);
  }

  if (platform === "android") {
    const channelId = String(input.androidChannelId ?? "").trim();
    if (channelId) message.channelId = channelId;
    if (input.sound !== null) message.sound = input.sound ?? "default";
    return message;
  }

  const categoryId = String(input.categoryId ?? "").trim();
  const interruptionLevel = IOS_INTERRUPTION_LEVELS.has(input.interruptionLevel)
    ? input.interruptionLevel
    : "active";
  const badge = Number.isFinite(input.badge) && input.badge >= 0
    ? Math.floor(input.badge)
    : 1;

  message.badge = badge;
  if (categoryId) message.categoryId = categoryId;
  message.interruptionLevel = interruptionLevel;
  if (input.sound !== null) message.sound = input.sound ?? "default";
  return message;
};
