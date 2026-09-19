export const IOS_VOIP_DISPATCH_ENABLED_ENV = "IOS_VOIP_PUSH_DISPATCH_ENABLED";
export const IOS_VOIP_TOPIC_SUFFIX = ".voip";
export const IOS_VOIP_TOKEN_PROVIDER = "apns_voip";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const INVALID_TOKEN_REASONS = new Set([
  "BadDeviceToken",
  "DeviceTokenNotForTopic",
  "Unregistered",
]);

const toText = (value) => String(value ?? "").trim();

export const isIosVoipDispatchExplicitlyEnabled = (value) => (
  ENABLED_VALUES.has(toText(value).toLowerCase())
);

export const normalizeApnsEnvironment = (value) => (
  toText(value).toLowerCase() === "production" ? "production" : "development"
);

export const normalizeIosVoipCallType = (value) => (
  toText(value).toLowerCase() === "video" ? "video" : "voice"
);

export const buildIosVoipTopic = (bundleIdentifier) => {
  const bundleId = toText(bundleIdentifier);
  return bundleId ? `${bundleId}${IOS_VOIP_TOPIC_SUFFIX}` : "";
};

export const buildIosVoipApnsPayload = (input) => {
  const callInviteId = toText(input.callInviteId);
  const threadId = toText(input.threadId);
  const recipientUserId = toText(input.recipientUserId);
  const recipientAccountId = toText(input.recipientAccountId);
  const recipientSessionGeneration = toText(input.recipientSessionGeneration);
  const recipientInstallId = toText(input.recipientInstallId);
  const presentationAttemptId = toText(input.presentationAttemptId).toLowerCase();
  const presentationAckToken = toText(input.presentationAckToken);
  const presentationAckUrl = toText(input.presentationAckUrl);
  const action = toText(input.action).toLowerCase() || "incoming";
  if (!callInviteId || !threadId || !recipientUserId || recipientAccountId !== recipientUserId
    || !recipientSessionGeneration || !recipientInstallId) {
    throw new Error("invalid_voip_payload_scope");
  }
  let parsedAckUrl;
  try {
    parsedAckUrl = new URL(presentationAckUrl);
  } catch {
    throw new Error("invalid_voip_presentation_ack_scope");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(presentationAttemptId)
    || !/^[A-Za-z0-9_-]{43}$/u.test(presentationAckToken)
    || parsedAckUrl.protocol !== "https:"
    || !parsedAckUrl.pathname.endsWith("/functions/v1/ios-voip-call-dispatch")
    || parsedAckUrl.username
    || parsedAckUrl.password
    || parsedAckUrl.search
    || parsedAckUrl.hash
  ) {
    throw new Error("invalid_voip_presentation_ack_scope");
  }
  if (action !== "incoming") throw new Error("non_incoming_voip_payload_denied");

  const callerName = toText(input.callerName).slice(0, 80) || "Chi'llywood caller";
  const callType = normalizeIosVoipCallType(input.callType);
  return {
    aps: {
      "content-available": 1,
    },
    action: "incoming",
    callInviteId,
    callType,
    callUuid: callInviteId,
    callerName,
    expiresAt: toText(input.expiresAt),
    path: `/chat/${encodeURIComponent(threadId)}?callInviteId=${encodeURIComponent(callInviteId)}`,
    presentationAckToken,
    presentationAckUrl: parsedAckUrl.toString(),
    presentationAttemptId,
    recipientAccountId,
    recipientInstallId,
    recipientSessionGeneration,
    recipientUserId,
    threadId,
  };
};

export const isApnsInvalidVoipTokenReason = (value) => INVALID_TOKEN_REASONS.has(toText(value));

export const sanitizeApnsProviderReason = (value, fallback = "apns_provider_error") => {
  const normalized = toText(value).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
  return normalized || fallback;
};
