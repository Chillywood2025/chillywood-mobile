export const MEDIA_DELIVERY_PROVIDER_ORIGIN_SIGNED_DIRECT = "origin_signed_direct" as const;
export const MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN = "cloudflare_r2_custom_domain" as const;
export const MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX_DEFAULT = "playback/public/";

export type MediaDeliveryProvider =
  | typeof MEDIA_DELIVERY_PROVIDER_ORIGIN_SIGNED_DIRECT
  | typeof MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN;

export type MediaCdnSigningMode = "off" | "token";

export type MediaDeliveryBlockedReason =
  | "delivery_provider_disabled"
  | "missing_cdn_base_url"
  | "invalid_cdn_base_url"
  | "private_cdn_delivery_not_disabled"
  | "invalid_cdn_signing_mode"
  | "missing_path"
  | "invalid_path"
  | "absolute_url_not_allowed"
  | "outside_public_playback_prefix"
  | "not_in_public_playback_allowlist"
  | "public_playback_not_marked_safe"
  | "forbidden_private_prefix"
  | "original_or_master_blocked"
  | "unscanned_blocked"
  | "moderation_blocked"
  | "private_asset_blocked"
  | "premium_requires_token_cdn";

export type MediaDeliveryConfig = {
  originProvider: string;
  deliveryProvider: MediaDeliveryProvider;
  cdnBaseUrl: string;
  cdnSigningMode: MediaCdnSigningMode | string;
  cdnPublicPlaybackPrefix: string;
  cdnPrivatePlaybackDisabled: boolean;
  cdnAllowedPublicPlaybackPaths: string[];
};

export type MediaDeliveryAssetInput = {
  path?: string | null;
  publicPlaybackSafe?: boolean | null;
  accessTier?: string | null;
  qualityLabel?: string | null;
  scanStatus?: string | null;
  moderationStatus?: string | null;
  isOriginal?: boolean | null;
  isMaster?: boolean | null;
  isUnscanned?: boolean | null;
  isModerationBlocked?: boolean | null;
  isPrivate?: boolean | null;
  isPremiumOnly?: boolean | null;
};

export type MediaDeliveryAssetClassification = {
  path: string;
  publicPlaybackSafe: boolean;
  accessTier: string;
  qualityLabel: string;
  startsWithPublicPlaybackPrefix: boolean;
  isOriginalOrMaster: boolean;
  isUnscanned: boolean;
  isModerationBlocked: boolean;
  isPrivate: boolean;
  isPremiumOnly: boolean;
  forbiddenPathSegment: string | null;
  blockedReason: MediaDeliveryBlockedReason | null;
};

export type MediaDeliveryEligibility = {
  provider: MediaDeliveryProvider;
  cdnEligible: boolean;
  fallbackUsed: boolean;
  blockedReason: MediaDeliveryBlockedReason | null;
  publicPlaybackSafe: boolean;
  classification: MediaDeliveryAssetClassification;
};

export type MediaPlaybackDeliveryResolution = MediaDeliveryEligibility & {
  url: string;
};

type MediaDeliveryConfigInput = Partial<MediaDeliveryConfig>;

const PUBLIC_SCAN_STATUSES = new Set(["clean", "manual_review"]);
const MODERATION_BLOCKED_STATUSES = new Set([
  "pending_review",
  "hidden",
  "removed",
  "banned",
  "blocked",
  "moderation_blocked",
  "moderation-blocked",
]);
const FORBIDDEN_PUBLIC_CDN_SEGMENTS = new Set([
  "original",
  "originals",
  "master",
  "masters",
  "source",
  "sources",
  "uploads",
  "private",
  "premium",
  "processing",
  "moderation-blocked",
  "moderation_blocked",
  "unscanned",
]);

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const readProcessEnv = (name: string) => {
  const processLike = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return toText(processLike?.env?.[name]);
};

const normalizeBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  return toLowerText(value) === "true";
};

const normalizeDeliveryProvider = (value: unknown): MediaDeliveryProvider => (
  toLowerText(value) === MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN
    ? MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN
    : MEDIA_DELIVERY_PROVIDER_ORIGIN_SIGNED_DIRECT
);

const normalizeSigningMode = (value: unknown): MediaCdnSigningMode | string => (
  toLowerText(value) || "off"
);

const normalizeAssetPath = (value: unknown) => (
  toText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
);

const normalizePrefix = (value: unknown) => {
  const prefix = normalizeAssetPath(value) || MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX_DEFAULT;
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
};

const normalizeAllowedPublicPlaybackPaths = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((entry) => normalizeAssetPath(entry)).filter(Boolean)),
  );
};

const isInvalidObjectPath = (value: string) => (
  !value
  || value.includes("..")
  || /[\u0000-\u001F\u007F]/u.test(value)
);

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const findForbiddenPathSegment = (path: string) => (
  path
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .find((segment) => FORBIDDEN_PUBLIC_CDN_SEGMENTS.has(segment)) ?? null
);

export function readMediaDeliveryConfig(overrides: MediaDeliveryConfigInput = {}): MediaDeliveryConfig {
  return {
    originProvider: toLowerText(overrides.originProvider ?? readProcessEnv("MEDIA_ORIGIN_PROVIDER")),
    deliveryProvider: normalizeDeliveryProvider(
      overrides.deliveryProvider ?? readProcessEnv("MEDIA_DELIVERY_PROVIDER"),
    ),
    cdnBaseUrl: toText(overrides.cdnBaseUrl ?? readProcessEnv("MEDIA_CDN_BASE_URL")),
    cdnSigningMode: normalizeSigningMode(
      overrides.cdnSigningMode ?? readProcessEnv("MEDIA_CDN_SIGNING_MODE"),
    ),
    cdnPublicPlaybackPrefix: normalizePrefix(
      overrides.cdnPublicPlaybackPrefix ?? readProcessEnv("MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX"),
    ),
    cdnPrivatePlaybackDisabled: normalizeBoolean(
      overrides.cdnPrivatePlaybackDisabled ?? readProcessEnv("MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED"),
    ),
    cdnAllowedPublicPlaybackPaths: normalizeAllowedPublicPlaybackPaths(
      overrides.cdnAllowedPublicPlaybackPaths,
    ),
  };
}

export function classifyMediaDeliveryAsset(
  input: MediaDeliveryAssetInput,
  configInput: MediaDeliveryConfigInput = {},
): MediaDeliveryAssetClassification {
  const config = readMediaDeliveryConfig(configInput);
  const path = normalizeAssetPath(input.path);
  const accessTier = toLowerText(input.accessTier);
  const qualityLabel = toLowerText(input.qualityLabel);
  const scanStatus = toLowerText(input.scanStatus);
  const moderationStatus = toLowerText(input.moderationStatus);
  const forbiddenPathSegment = findForbiddenPathSegment(path);
  const startsWithPublicPlaybackPrefix = path.startsWith(config.cdnPublicPlaybackPrefix);
  const isOriginalOrMaster = input.isOriginal === true
    || input.isMaster === true
    || qualityLabel === "original"
    || forbiddenPathSegment === "original"
    || forbiddenPathSegment === "originals"
    || forbiddenPathSegment === "master"
    || forbiddenPathSegment === "masters"
    || forbiddenPathSegment === "source"
    || forbiddenPathSegment === "sources";
  const isUnscanned = input.isUnscanned === true
    || forbiddenPathSegment === "unscanned"
    || (!!scanStatus && !PUBLIC_SCAN_STATUSES.has(scanStatus));
  const isModerationBlocked = input.isModerationBlocked === true
    || forbiddenPathSegment === "moderation-blocked"
    || forbiddenPathSegment === "moderation_blocked"
    || MODERATION_BLOCKED_STATUSES.has(moderationStatus);
  const isPrivate = input.isPrivate === true
    || accessTier === "private"
    || accessTier === "owner"
    || forbiddenPathSegment === "private";
  const isPremiumOnly = input.isPremiumOnly === true
    || accessTier === "premium"
    || forbiddenPathSegment === "premium";
  const publicPlaybackSafe = input.publicPlaybackSafe === true;

  let blockedReason: MediaDeliveryBlockedReason | null = null;
  if (!path) blockedReason = "missing_path";
  else if (isAbsoluteUrl(path)) blockedReason = "absolute_url_not_allowed";
  else if (isInvalidObjectPath(path)) blockedReason = "invalid_path";
  else if (!startsWithPublicPlaybackPrefix) blockedReason = "outside_public_playback_prefix";
  else if (!publicPlaybackSafe) blockedReason = "public_playback_not_marked_safe";
  else if (isOriginalOrMaster) blockedReason = "original_or_master_blocked";
  else if (isUnscanned) blockedReason = "unscanned_blocked";
  else if (isModerationBlocked) blockedReason = "moderation_blocked";
  else if (isPrivate) blockedReason = "private_asset_blocked";
  else if (isPremiumOnly) blockedReason = "premium_requires_token_cdn";
  else if (forbiddenPathSegment) blockedReason = "forbidden_private_prefix";

  return {
    path,
    publicPlaybackSafe,
    accessTier,
    qualityLabel,
    startsWithPublicPlaybackPrefix,
    isOriginalOrMaster,
    isUnscanned,
    isModerationBlocked,
    isPrivate,
    isPremiumOnly,
    forbiddenPathSegment,
    blockedReason,
  };
}

export function canUseCloudflareR2PublicPlayback(
  input: MediaDeliveryAssetInput,
  configInput: MediaDeliveryConfigInput = {},
): MediaDeliveryEligibility {
  const config = readMediaDeliveryConfig(configInput);
  const classification = classifyMediaDeliveryAsset(input, config);
  let blockedReason = classification.blockedReason;

  if (!blockedReason && config.deliveryProvider !== MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN) {
    blockedReason = "delivery_provider_disabled";
  } else if (!blockedReason && !config.cdnBaseUrl) {
    blockedReason = "missing_cdn_base_url";
  } else if (!blockedReason && !isValidHttpsBaseUrl(config.cdnBaseUrl)) {
    blockedReason = "invalid_cdn_base_url";
  } else if (!blockedReason && config.cdnPrivatePlaybackDisabled !== true) {
    blockedReason = "private_cdn_delivery_not_disabled";
  } else if (!blockedReason && config.cdnSigningMode !== "off" && config.cdnSigningMode !== "token") {
    blockedReason = "invalid_cdn_signing_mode";
  } else if (
    !blockedReason
    && config.cdnAllowedPublicPlaybackPaths.length > 0
    && !config.cdnAllowedPublicPlaybackPaths.includes(classification.path)
  ) {
    blockedReason = "not_in_public_playback_allowlist";
  }

  return {
    provider: blockedReason ? MEDIA_DELIVERY_PROVIDER_ORIGIN_SIGNED_DIRECT : MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN,
    cdnEligible: !blockedReason,
    fallbackUsed: !!blockedReason,
    blockedReason,
    publicPlaybackSafe: classification.publicPlaybackSafe,
    classification,
  };
}

export function resolveCloudflareR2PublicPlaybackUrl(
  input: MediaDeliveryAssetInput,
  configInput: MediaDeliveryConfigInput = {},
): string {
  const config = readMediaDeliveryConfig(configInput);
  const eligibility = canUseCloudflareR2PublicPlayback(input, config);
  if (!eligibility.cdnEligible) return "";

  const baseUrl = config.cdnBaseUrl.endsWith("/") ? config.cdnBaseUrl : `${config.cdnBaseUrl}/`;
  const encodedPath = eligibility.classification.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return new URL(encodedPath, baseUrl).toString();
}

export async function resolveMediaPlaybackDelivery(input: {
  asset: MediaDeliveryAssetInput;
  config?: MediaDeliveryConfigInput;
  fallbackUrl?: string | null;
  resolveFallbackUrl?: () => string | Promise<string>;
}): Promise<MediaPlaybackDeliveryResolution> {
  const config = readMediaDeliveryConfig(input.config);
  const eligibility = canUseCloudflareR2PublicPlayback(input.asset, config);
  const cdnUrl = eligibility.cdnEligible
    ? resolveCloudflareR2PublicPlaybackUrl(input.asset, config)
    : "";

  if (cdnUrl) {
    return {
      ...eligibility,
      provider: MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN,
      cdnEligible: true,
      fallbackUsed: false,
      blockedReason: null,
      url: cdnUrl,
    };
  }

  const fallbackUrl = input.resolveFallbackUrl
    ? await input.resolveFallbackUrl()
    : toText(input.fallbackUrl);

  return {
    ...eligibility,
    provider: MEDIA_DELIVERY_PROVIDER_ORIGIN_SIGNED_DIRECT,
    cdnEligible: false,
    fallbackUsed: true,
    url: toText(fallbackUrl),
  };
}

function isValidHttpsBaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !!parsed.hostname;
  } catch {
    return false;
  }
}
