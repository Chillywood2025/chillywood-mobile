export type WatchPartyViewerAuthority = {
  allowed: boolean;
  hostAuthority: boolean;
  paidSeatRequired: boolean;
  speakerEligible: boolean;
  expiresAt: string | null;
  reason: string;
};

export type LiveKitTokenTtlInput = {
  authorityExpiresAt?: string | null;
  baselineTtlSeconds?: number | null;
  nowMillis?: number;
  paidSeatRequired: boolean;
  seatRefreshSeconds?: number;
};

const DEFAULT_LIVEKIT_TOKEN_TTL_SECONDS = 60 * 60;
export const PAID_SEAT_TOKEN_REFRESH_SECONDS = 30;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const normalizeText = (value: unknown) => String(value ?? "").trim();

const positiveWholeSeconds = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const normalizeWatchPartyViewerAuthority = (
  value: unknown,
): WatchPartyViewerAuthority | null => {
  if (
    !isRecord(value) ||
    typeof value.allowed !== "boolean" ||
    typeof value.hostAuthority !== "boolean" ||
    typeof value.paidSeatRequired !== "boolean"
  ) {
    return null;
  }
  const expiresAt = value.expiresAt === null || value.expiresAt === undefined
    ? null
    : normalizeText(value.expiresAt);
  if (expiresAt !== null && !expiresAt) return null;
  if (value.allowed && value.paidSeatRequired && expiresAt === null) return null;
  const reason = normalizeText(value.reason);
  if (!reason) return null;
  return {
    allowed: value.allowed,
    hostAuthority: value.hostAuthority,
    paidSeatRequired: value.paidSeatRequired,
    speakerEligible: typeof value.speakerEligible === "boolean"
      ? value.speakerEligible
      : value.hostAuthority || !value.paidSeatRequired,
    expiresAt,
    reason,
  };
};

export const resolveLiveKitTokenTtlSeconds = (
  input: LiveKitTokenTtlInput,
): number | null => {
  const baselineTtlSeconds = positiveWholeSeconds(
    input.baselineTtlSeconds,
    DEFAULT_LIVEKIT_TOKEN_TTL_SECONDS,
  );
  if (!input.paidSeatRequired) return baselineTtlSeconds;

  const refreshSeconds = positiveWholeSeconds(
    input.seatRefreshSeconds,
    PAID_SEAT_TOKEN_REFRESH_SECONDS,
  );
  let ttlSeconds = Math.min(baselineTtlSeconds, refreshSeconds);
  if (input.authorityExpiresAt !== null && input.authorityExpiresAt !== undefined) {
    const expiryMillis = Date.parse(normalizeText(input.authorityExpiresAt));
    if (!Number.isFinite(expiryMillis)) return null;
    const nowMillis = Number.isFinite(input.nowMillis) ? Number(input.nowMillis) : Date.now();
    const remainingSeconds = Math.floor((expiryMillis - nowMillis) / 1000);
    if (remainingSeconds <= 0) return null;
    ttlSeconds = Math.min(ttlSeconds, remainingSeconds);
  }
  return ttlSeconds > 0 ? ttlSeconds : null;
};
