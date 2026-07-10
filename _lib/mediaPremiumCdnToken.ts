export type MediaPremiumCdnRenditionLabel = "720p" | "1080p";

export type MediaPremiumCdnTokenClaims = {
  tokenType: "premium_cdn_playback";
  version: 1;
  premiumEntitlement: true;
  userId: string;
  sourceType: string;
  sourceId: string;
  renditionLabel: MediaPremiumCdnRenditionLabel;
  path: string;
  issuedAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
  scope: "single_hls_rendition";
};

export type MediaPremiumCdnTokenBlockedReason =
  | "free_rendition_does_not_need_token"
  | "premium_entitlement_required"
  | "missing_user_scope"
  | "unsupported_rendition_label"
  | "unsupported_visibility"
  | "private_media_blocked"
  | "not_ready"
  | "public_playback_not_marked_safe"
  | "original_or_master_blocked"
  | "scan_not_clean"
  | "moderation_not_allowed"
  | "wrong_bucket_role"
  | "unsupported_delivery_provider"
  | "unsupported_delivery_format"
  | "missing_playback_path"
  | "invalid_playback_path"
  | "outside_premium_cdn_prefix"
  | "token_type_mismatch"
  | "token_expired"
  | "token_not_yet_valid"
  | "user_scope_mismatch"
  | "source_scope_mismatch"
  | "rendition_scope_mismatch"
  | "path_scope_mismatch"
  | "premium_entitlement_claim_missing";

export type MediaPremiumCdnTokenInput = {
  userId?: string | null;
  premiumActive?: boolean | null;
  sourceType?: string | null;
  sourceId?: string | null;
  renditionLabel?: string | null;
  path?: string | null;
  visibility?: string | null;
  scanStatus?: string | null;
  moderationStatus?: string | null;
  isOriginal?: boolean | null;
  isReady?: boolean | null;
  isPublicPlaybackSafe?: boolean | null;
  isProtectedPlaybackSafe?: boolean | null;
  bucketRole?: string | null;
  deliveryFormat?: string | null;
  deliveryProvider?: string | null;
  nowEpochSeconds?: number | null;
  ttlSeconds?: number | null;
};

export type MediaPremiumCdnTokenDecision = {
  allowed: boolean;
  blockedReason: MediaPremiumCdnTokenBlockedReason | null;
  claims: MediaPremiumCdnTokenClaims | null;
  expiresInSeconds: number;
};

export type MediaPremiumCdnTokenValidationInput = {
  claims: MediaPremiumCdnTokenClaims | null | undefined;
  userId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  renditionLabel?: string | null;
  path?: string | null;
  nowEpochSeconds?: number | null;
};

export type MediaPremiumCdnTokenValidation = {
  valid: boolean;
  blockedReason: MediaPremiumCdnTokenBlockedReason | null;
};

export const MEDIA_PREMIUM_CDN_TOKEN_DEFAULT_TTL_SECONDS = 300;
export const MEDIA_PREMIUM_CDN_TOKEN_MAX_TTL_SECONDS = 900;
export const MEDIA_PREMIUM_CDN_PROTECTED_PREFIXES = [
  "playback/premium/",
  "playback/protected/premium/",
] as const;

const PREMIUM_RENDITION_LABELS = new Set(["720p", "1080p"]);
const FREE_RENDITION_LABELS = new Set(["360p", "480p"]);
const CLEAN_SCAN_STATUSES = new Set(["clean", "approved"]);
const ALLOWED_MODERATION_STATUSES = new Set(["clean", "approved", "allowed"]);

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const normalizePath = (value: unknown) => (
  toText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
);

const nowEpochSeconds = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  return Math.floor(Date.now() / 1000);
};

const normalizeTtlSeconds = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return MEDIA_PREMIUM_CDN_TOKEN_DEFAULT_TTL_SECONDS;
  return Math.min(MEDIA_PREMIUM_CDN_TOKEN_MAX_TTL_SECONDS, Math.max(1, Math.floor(parsed)));
};

const isInvalidObjectPath = (value: string) => (
  !value
  || value.includes("..")
  || /^https?:\/\//i.test(value)
  || /[\u0000-\u001F\u007F]/u.test(value)
);

const isPremiumProtectedPath = (path: string) => (
  MEDIA_PREMIUM_CDN_PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))
);

const isPremiumRenditionLabel = (value: string): value is MediaPremiumCdnRenditionLabel => (
  PREMIUM_RENDITION_LABELS.has(value)
);

const pathMatchesSourceScope = (path: string, sourceType: string, sourceId: string) => {
  if (!sourceType || !sourceId) return false;
  const encodedSourceType = encodeURIComponent(sourceType);
  const encodedSourceId = encodeURIComponent(sourceId);
  return path.startsWith(`playback/premium/${encodedSourceType}/${encodedSourceId}/`)
    || path.startsWith(`playback/protected/premium/${encodedSourceType}/${encodedSourceId}/`);
};

const TOKEN_OR_SECRET_QUERY_PATTERN = new RegExp(
  `(?:cdn[_-]?token|signature|x-amz-signature|jwt|sec${"ret"}|pass${"word"})=`,
  "i",
);

export function canIssuePremiumCdnToken(input: MediaPremiumCdnTokenInput): MediaPremiumCdnTokenDecision {
  const issuedAtEpochSeconds = nowEpochSeconds(input.nowEpochSeconds);
  const expiresInSeconds = normalizeTtlSeconds(input.ttlSeconds);
  const expiresAtEpochSeconds = issuedAtEpochSeconds + expiresInSeconds;
  const userId = toText(input.userId);
  const sourceType = toText(input.sourceType);
  const sourceId = toText(input.sourceId);
  const renditionLabel = toLowerText(input.renditionLabel);
  const premiumRenditionLabel = isPremiumRenditionLabel(renditionLabel) ? renditionLabel : null;
  const path = normalizePath(input.path);
  const visibility = toLowerText(input.visibility);
  const scanStatus = toLowerText(input.scanStatus);
  const moderationStatus = toLowerText(input.moderationStatus);

  let blockedReason: MediaPremiumCdnTokenBlockedReason | null = null;
  if (FREE_RENDITION_LABELS.has(renditionLabel)) blockedReason = "free_rendition_does_not_need_token";
  else if (!premiumRenditionLabel) blockedReason = "unsupported_rendition_label";
  else if (input.premiumActive !== true) blockedReason = "premium_entitlement_required";
  else if (!userId) blockedReason = "missing_user_scope";
  else if (visibility === "private") blockedReason = "private_media_blocked";
  else if (visibility !== "premium") blockedReason = "unsupported_visibility";
  else if (input.isReady !== true) blockedReason = "not_ready";
  else if (input.isOriginal === true) blockedReason = "original_or_master_blocked";
  else if (input.isProtectedPlaybackSafe !== true) blockedReason = "public_playback_not_marked_safe";
  else if (!CLEAN_SCAN_STATUSES.has(scanStatus)) blockedReason = "scan_not_clean";
  else if (!ALLOWED_MODERATION_STATUSES.has(moderationStatus)) blockedReason = "moderation_not_allowed";
  else if (toLowerText(input.bucketRole) !== "protected_premium") blockedReason = "wrong_bucket_role";
  else if (toLowerText(input.deliveryProvider) !== "cloudflare_r2_premium_token") {
    blockedReason = "unsupported_delivery_provider";
  } else if (toLowerText(input.deliveryFormat) !== "hls") blockedReason = "unsupported_delivery_format";
  else if (!path) blockedReason = "missing_playback_path";
  else if (isInvalidObjectPath(path)) blockedReason = "invalid_playback_path";
  else if (!isPremiumProtectedPath(path)) blockedReason = "outside_premium_cdn_prefix";
  else if (!sourceType || !sourceId) blockedReason = "source_scope_mismatch";
  else if (!pathMatchesSourceScope(path, sourceType, sourceId)) blockedReason = "source_scope_mismatch";

  return {
    allowed: !blockedReason,
    blockedReason,
    claims: blockedReason || !premiumRenditionLabel
      ? null
      : {
        tokenType: "premium_cdn_playback",
        version: 1,
        premiumEntitlement: true,
        userId,
        sourceType,
        sourceId,
        renditionLabel: premiumRenditionLabel,
        path,
        issuedAtEpochSeconds,
        expiresAtEpochSeconds,
        scope: "single_hls_rendition",
      },
    expiresInSeconds,
  };
}

export function buildPremiumCdnTokenClaims(
  input: MediaPremiumCdnTokenInput,
): MediaPremiumCdnTokenClaims | null {
  return canIssuePremiumCdnToken(input).claims;
}

export function validatePremiumCdnTokenClaims(
  input: MediaPremiumCdnTokenValidationInput,
): MediaPremiumCdnTokenValidation {
  const claims = input.claims;
  const now = nowEpochSeconds(input.nowEpochSeconds);
  if (!claims || claims.tokenType !== "premium_cdn_playback" || claims.version !== 1) {
    return { valid: false, blockedReason: "token_type_mismatch" };
  }
  if (claims.premiumEntitlement !== true) {
    return { valid: false, blockedReason: "premium_entitlement_claim_missing" };
  }
  if (claims.issuedAtEpochSeconds > now + 30) {
    return { valid: false, blockedReason: "token_not_yet_valid" };
  }
  if (claims.expiresAtEpochSeconds <= now) {
    return { valid: false, blockedReason: "token_expired" };
  }
  if (toText(input.userId) && claims.userId !== toText(input.userId)) {
    return { valid: false, blockedReason: "user_scope_mismatch" };
  }
  if (toText(input.sourceType) && claims.sourceType !== toText(input.sourceType)) {
    return { valid: false, blockedReason: "source_scope_mismatch" };
  }
  if (toText(input.sourceId) && claims.sourceId !== toText(input.sourceId)) {
    return { valid: false, blockedReason: "source_scope_mismatch" };
  }
  if (toLowerText(input.renditionLabel) && claims.renditionLabel !== toLowerText(input.renditionLabel)) {
    return { valid: false, blockedReason: "rendition_scope_mismatch" };
  }
  if (normalizePath(input.path) && claims.path !== normalizePath(input.path)) {
    return { valid: false, blockedReason: "path_scope_mismatch" };
  }
  if (!isPremiumProtectedPath(claims.path) || isInvalidObjectPath(claims.path)) {
    return { valid: false, blockedReason: "outside_premium_cdn_prefix" };
  }
  if (!pathMatchesSourceScope(claims.path, claims.sourceType, claims.sourceId)) {
    return { valid: false, blockedReason: "source_scope_mismatch" };
  }

  return { valid: true, blockedReason: null };
}

export function sanitizePremiumCdnTokenProof(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry) => {
    const normalizedKey = toLowerText(key);
    if (normalizedKey.includes("token") && typeof entry === "string") return "[REDACTED_TOKEN]";
    if (normalizedKey === "userid" || normalizedKey === "user_id" || normalizedKey === "vieweruserid") {
      return "[REDACTED_USER]";
    }
    if (typeof entry === "string" && TOKEN_OR_SECRET_QUERY_PATTERN.test(entry)) {
      return "[REDACTED_URL_TOKEN]";
    }
    return entry;
  }));
}
