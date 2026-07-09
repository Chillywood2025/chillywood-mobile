export type MediaDeliveryTelemetryTableName =
  | "media_delivery_events"
  | "media_playback_sessions";

export type MediaDeliveryTelemetryRecord = {
  id: string;
  user_id: string | null;
  video_id: string;
  creator_id: string | null;
  source_type: string;
  source_id: string;
  delivery_provider: string;
  playback_url_provider: string;
  media_delivery_provider: string;
  delivery_format: string;
  automation_mode: string | null;
  batch_size: number | null;
  quality_label: string;
  rendition_label: string | null;
  rollout_mode: string | null;
  public_playback_safe: boolean;
  cdn_eligible: boolean;
  fallback_used: boolean;
  blocked_reason: string | null;
  watch_party_id: string | null;
  free_or_premium: string | null;
  is_premium_user: boolean | null;
  started_at: string;
  ended_at: string | null;
  seconds_watched: number | null;
  estimated_bytes: number | null;
  cdn_cache_status: string | null;
  client_platform: string | null;
  app_version: string | null;
  proof_mode: boolean;
};

export type MediaDeliveryEvent = MediaDeliveryTelemetryRecord & {
  table_name: "media_delivery_events";
  event_type: string;
  created_at: string;
};

export type MediaPlaybackSession = MediaDeliveryTelemetryRecord & {
  table_name: "media_playback_sessions";
  created_at: string;
};

export type PlaybackByteEstimateInput = {
  contentLengthBytes?: number | null;
  durationSeconds?: number | null;
  secondsWatched?: number | null;
  bitrateBitsPerSecond?: number | null;
};

export type MediaDeliveryTelemetryInput = {
  id?: string | null;
  userId?: string | null;
  videoId?: string | null;
  creatorId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  deliveryProvider?: string | null;
  playbackUrlProvider?: string | null;
  mediaDeliveryProvider?: string | null;
  deliveryFormat?: string | null;
  automationMode?: string | null;
  batchSize?: number | null;
  qualityLabel?: string | null;
  renditionLabel?: string | null;
  rolloutMode?: string | null;
  publicPlaybackSafe?: boolean | null;
  cdnEligible?: boolean | null;
  fallbackUsed?: boolean | null;
  blockedReason?: string | null;
  watchPartyId?: string | null;
  freeOrPremium?: string | null;
  isPremiumUser?: boolean | null;
  startedAt?: string | Date | null;
  endedAt?: string | Date | null;
  secondsWatched?: number | null;
  estimatedBytes?: number | null;
  cdnCacheStatus?: string | null;
  clientPlatform?: string | null;
  appVersion?: string | null;
  proofMode?: boolean | null;
  eventType?: string | null;
  contentLengthBytes?: number | null;
  durationSeconds?: number | null;
  bitrateBitsPerSecond?: number | null;
  createdAt?: string | Date | null;
};

const toText = (value: unknown) => String(value ?? "").trim();

const nullableText = (value: unknown) => {
  const text = toText(value);
  return text || null;
};

const normalizedText = (value: unknown, fallback: string) => {
  const text = toText(value);
  return text || fallback;
};

const normalizeBoolean = (value: unknown) => value === true;

const normalizeNullableBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  return null;
};

const normalizeFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
};

const normalizeNonNegativeInteger = (value: unknown): number | null => {
  const numericValue = normalizeFiniteNumber(value);
  if (numericValue === null || numericValue < 0) return null;
  return Math.ceil(numericValue);
};

const normalizeNonNegativeSeconds = (value: unknown): number | null => {
  const numericValue = normalizeFiniteNumber(value);
  if (numericValue === null || numericValue < 0) return null;
  return numericValue;
};

const normalizeIsoTimestamp = (value: string | Date | null | undefined, fallback: string) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const text = toText(value);
  if (!text) return fallback;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
};

const secondsBetween = (startedAt: string, endedAt: string | null) => {
  if (!endedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs < startedMs) return null;
  return (endedMs - startedMs) / 1000;
};

export function estimatePlaybackBytes(input: PlaybackByteEstimateInput): number | null {
  const contentLengthBytes = normalizeNonNegativeInteger(input.contentLengthBytes);
  const durationSeconds = normalizeNonNegativeSeconds(input.durationSeconds);
  const secondsWatched = normalizeNonNegativeSeconds(input.secondsWatched);
  const bitrateBitsPerSecond = normalizeNonNegativeSeconds(input.bitrateBitsPerSecond);

  if (contentLengthBytes !== null && secondsWatched !== null && durationSeconds !== null && durationSeconds > 0) {
    const ratio = Math.min(1, secondsWatched / durationSeconds);
    return Math.min(contentLengthBytes, Math.ceil(contentLengthBytes * ratio));
  }

  if (secondsWatched !== null && bitrateBitsPerSecond !== null) {
    return Math.ceil((secondsWatched * bitrateBitsPerSecond) / 8);
  }

  return contentLengthBytes;
}

const estimateFromTelemetryInput = (
  input: MediaDeliveryTelemetryInput,
  startedAt: string,
  endedAt: string | null,
) => {
  const explicitEstimate = normalizeNonNegativeInteger(input.estimatedBytes);
  if (explicitEstimate !== null) return explicitEstimate;

  const secondsWatched = normalizeNonNegativeSeconds(input.secondsWatched) ?? secondsBetween(startedAt, endedAt);
  return estimatePlaybackBytes({
    contentLengthBytes: input.contentLengthBytes,
    durationSeconds: input.durationSeconds,
    secondsWatched,
    bitrateBitsPerSecond: input.bitrateBitsPerSecond,
  });
};

const buildBaseTelemetryRecord = (
  input: MediaDeliveryTelemetryInput,
  defaultId: string,
): MediaDeliveryTelemetryRecord => {
  const createdAt = normalizeIsoTimestamp(input.createdAt, new Date().toISOString());
  const startedAt = normalizeIsoTimestamp(input.startedAt, createdAt);
  const endedAt = input.endedAt ? normalizeIsoTimestamp(input.endedAt, createdAt) : null;
  const secondsWatched = normalizeNonNegativeSeconds(input.secondsWatched) ?? secondsBetween(startedAt, endedAt);

  return {
    id: normalizedText(input.id, defaultId),
    user_id: nullableText(input.userId),
    video_id: normalizedText(input.videoId, "unknown_video"),
    creator_id: nullableText(input.creatorId),
    source_type: normalizedText(input.sourceType, "unknown"),
    source_id: normalizedText(input.sourceId, "unknown_source"),
    delivery_provider: normalizedText(input.deliveryProvider, "unknown"),
    playback_url_provider: normalizedText(input.playbackUrlProvider, "unknown"),
    media_delivery_provider: normalizedText(input.mediaDeliveryProvider, input.deliveryProvider ?? "unknown"),
    delivery_format: normalizedText(input.deliveryFormat, "unknown"),
    automation_mode: nullableText(input.automationMode),
    batch_size: normalizeNonNegativeInteger(input.batchSize),
    quality_label: normalizedText(input.qualityLabel, "unknown"),
    rendition_label: nullableText(input.renditionLabel),
    rollout_mode: nullableText(input.rolloutMode),
    public_playback_safe: normalizeBoolean(input.publicPlaybackSafe),
    cdn_eligible: normalizeBoolean(input.cdnEligible),
    fallback_used: normalizeBoolean(input.fallbackUsed),
    blocked_reason: nullableText(input.blockedReason),
    watch_party_id: nullableText(input.watchPartyId),
    free_or_premium: nullableText(input.freeOrPremium),
    is_premium_user: normalizeNullableBoolean(input.isPremiumUser),
    started_at: startedAt,
    ended_at: endedAt,
    seconds_watched: secondsWatched,
    estimated_bytes: estimateFromTelemetryInput(input, startedAt, endedAt),
    cdn_cache_status: nullableText(input.cdnCacheStatus),
    client_platform: nullableText(input.clientPlatform),
    app_version: nullableText(input.appVersion),
    proof_mode: normalizeBoolean(input.proofMode),
  };
};

export function buildMediaDeliveryEvent(input: MediaDeliveryTelemetryInput): MediaDeliveryEvent {
  const createdAt = normalizeIsoTimestamp(input.createdAt, new Date().toISOString());
  return {
    table_name: "media_delivery_events",
    ...buildBaseTelemetryRecord(input, "media_delivery_event_unpersisted"),
    event_type: normalizedText(input.eventType, "playback_progress"),
    created_at: createdAt,
  };
}

export function buildMediaPlaybackSessionStart(input: MediaDeliveryTelemetryInput): MediaPlaybackSession {
  const createdAt = normalizeIsoTimestamp(input.createdAt, new Date().toISOString());
  return {
    table_name: "media_playback_sessions",
    ...buildBaseTelemetryRecord(
      {
        ...input,
        endedAt: null,
        secondsWatched: null,
      },
      "media_playback_session_unpersisted",
    ),
    created_at: createdAt,
  };
}

export function buildMediaPlaybackSessionEnd(input: MediaDeliveryTelemetryInput): MediaPlaybackSession {
  const createdAt = normalizeIsoTimestamp(input.createdAt, new Date().toISOString());
  return {
    table_name: "media_playback_sessions",
    ...buildBaseTelemetryRecord(input, "media_playback_session_unpersisted"),
    created_at: createdAt,
  };
}

const isIdentifierKey = (key: string) => (
  key === "user_id"
  || key === "userId"
  || key === "creator_id"
  || key === "creatorId"
  || key === "watch_party_id"
  || key === "watchPartyId"
);

const redactedIdentifier = (key: string) => {
  if (key === "user_id" || key === "userId") return "redacted:user";
  if (key === "creator_id" || key === "creatorId") return "redacted:creator";
  return "redacted:watch_party";
};

const looksLikePrivateUrl = (value: string) => (
  /^https?:\/\//i.test(value)
  || /[?&](X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|Expires|Key-Pair-Id)=/i.test(value)
  || /[?&](token|signature|credential|policy)=/i.test(value)
);

type SanitizedTelemetryValue =
  | string
  | number
  | boolean
  | null
  | SanitizedTelemetryValue[]
  | { [key: string]: SanitizedTelemetryValue };

const sanitizeValueForProof = (value: unknown, key = ""): SanitizedTelemetryValue => {
  if (isIdentifierKey(key)) return value ? redactedIdentifier(key) : null;

  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (looksLikePrivateUrl(value)) return "redacted:url";
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => sanitizeValueForProof(entry));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValueForProof(entryValue, entryKey),
      ]),
    );
  }
  return String(value);
};

export function sanitizeMediaDeliveryTelemetryForProof(value: unknown): SanitizedTelemetryValue {
  return sanitizeValueForProof(value);
}
