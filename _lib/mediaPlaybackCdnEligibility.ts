import {
  MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX_DEFAULT,
  MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN,
  MEDIA_DELIVERY_PROVIDER_ORIGIN_SIGNED_DIRECT,
  resolveCloudflareR2PublicPlaybackUrl,
  type MediaDeliveryProvider,
} from "./mediaDelivery";
import {
  buildMediaDeliveryAssetFromTrustedRendition,
  canUseTrustedRenditionForPublicCdn,
  type TrustedMediaRenditionMetadata,
} from "./mediaRenditionMetadata";

export type MediaPlaybackCdnRolloutMode = "off" | "canary" | "batch" | "trusted_public";
export type MediaPlaybackCdnAuditStatus = "pending" | "passed" | "failed" | "quarantined" | string;

export type MediaPlaybackCdnBackupGate = {
  status?: string | null;
  fresh?: boolean | null;
  closed?: boolean | null;
  latestBackupVerified?: boolean | null;
  restoreDrillPassed?: boolean | null;
};

export type AuditedMediaRenditionForPlayback = TrustedMediaRenditionMetadata & {
  audit_status?: MediaPlaybackCdnAuditStatus | null;
  auditStatus?: MediaPlaybackCdnAuditStatus | null;
  batch_id?: string | null;
  batchId?: string | null;
};

export type MediaPlaybackCdnConfig = {
  enabled: boolean;
  killSwitch: boolean;
  rolloutMode: MediaPlaybackCdnRolloutMode;
  allowedSourceIds: string[];
  deniedSourceIds: string[];
  requireAuditPassed: boolean;
  requireBackupFresh: boolean;
  fallbackToOrigin: boolean;
  playbackDeliveryProvider: MediaDeliveryProvider;
  maxBatchSize: number;
  percentRollout: number;
  cdnBaseUrl: string;
  cdnPublicPlaybackPrefix: string;
  cdnPrivatePlaybackDisabled: boolean;
  cdnSigningMode: "off" | "token" | string;
  backupGate: MediaPlaybackCdnBackupGate | null;
};

export type MediaPlaybackCdnConfigInput = Partial<MediaPlaybackCdnConfig>;

export type MediaPlaybackCdnBlockedReason =
  | "missing_trusted_rendition"
  | "global_cdn_disabled"
  | "kill_switch_enabled"
  | "rollout_mode_off"
  | "source_denied"
  | "source_not_allowed"
  | "batch_limit_missing"
  | "batch_cap_exceeded"
  | "backup_gate_not_fresh"
  | "audit_not_passed"
  | "unsupported_rollout_delivery_provider"
  | "unsupported_delivery_format"
  | "missing_cdn_base_url"
  | "invalid_cdn_base_url"
  | "private_cdn_delivery_not_disabled"
  | "invalid_cdn_signing_mode"
  | "not_ready"
  | "public_playback_not_marked_safe"
  | "scan_not_clean"
  | "moderation_not_allowed"
  | "wrong_bucket_role"
  | "unsupported_storage_provider"
  | "unsupported_delivery_provider"
  | "missing_public_playback_path"
  | "invalid_public_playback_path"
  | "non_playback_prefix"
  | "forbidden_private_prefix"
  | "original_or_master_blocked"
  | "premium_requires_token_cdn"
  | "private_requires_token_cdn"
  | "missing_manifest_path"
  | "manifest_path_mismatch"
  | "variant_path_mismatch"
  | "invalid_dimensions"
  | "cdn_url_unavailable"
  | "fallback_disabled";

export type MediaPlaybackCdnEligibility = {
  provider: MediaDeliveryProvider;
  cdnEligible: boolean;
  fallbackUsed: boolean;
  blockedReason: MediaPlaybackCdnBlockedReason | null;
  rolloutMode: MediaPlaybackCdnRolloutMode;
  sourceId: string;
  sourceAllowlisted: boolean;
  sourceDenied: boolean;
  deliveryFormat: string;
  renditionLabel: string;
  playbackPath: string;
  manifestPath: string;
  publicPlaybackSafe: boolean;
  auditPassed: boolean;
  backupGatePassed: boolean;
  fallbackAvailable: boolean;
  maxBatchSize: number;
  percentRollout: number;
};

export type MediaPlaybackCdnResolution = MediaPlaybackCdnEligibility & {
  url: string;
};

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const readProcessEnv = (name: string) => {
  const processLike = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return toText(processLike?.env?.[name]);
};

const normalizeBoolean = (value: unknown, defaultValue = false) => {
  if (typeof value === "boolean") return value;
  const normalized = toLowerText(value);
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return defaultValue;
};

const normalizeCsv = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(toText).filter(Boolean)));
  }
  return Array.from(new Set(toText(value).split(",").map((entry) => entry.trim()).filter(Boolean)));
};

const normalizeNonNegativeInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const parsed = Number(toText(value));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const normalizePercent = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.min(100, Math.max(0, value));
  const parsed = Number(toText(value));
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
};

const normalizeDeliveryProvider = (value: unknown): MediaDeliveryProvider => (
  toLowerText(value) === MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN
    ? MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN
    : MEDIA_DELIVERY_PROVIDER_ORIGIN_SIGNED_DIRECT
);

export function resolveCdnRolloutMode(value: unknown): MediaPlaybackCdnRolloutMode {
  const normalized = toLowerText(value);
  if (normalized === "canary" || normalized === "batch" || normalized === "trusted_public") {
    return normalized;
  }
  return "off";
}

const normalizePrefix = (value: unknown) => {
  const prefix = toText(value).replace(/\\/g, "/").replace(/^\/+/g, "") || MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX_DEFAULT;
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
};

const normalizeBackupGate = (value: MediaPlaybackCdnBackupGate | null | undefined): MediaPlaybackCdnBackupGate | null => {
  if (!value) return null;
  return {
    status: toLowerText(value.status),
    fresh: value.fresh === true,
    closed: value.closed === true,
    latestBackupVerified: value.latestBackupVerified === true,
    restoreDrillPassed: value.restoreDrillPassed === true,
  };
};

const normalizeAuditStatus = (row: AuditedMediaRenditionForPlayback | null | undefined) => (
  toLowerText(row?.audit_status ?? row?.auditStatus)
);

const isValidHttpsBaseUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !!parsed.hostname;
  } catch {
    return false;
  }
};

const isBackupGateFreshOrClosed = (backupGate: MediaPlaybackCdnBackupGate | null) => {
  if (!backupGate) return false;
  const status = toLowerText(backupGate.status);
  return backupGate.fresh === true
    || backupGate.closed === true
    || (
      backupGate.latestBackupVerified === true
      && backupGate.restoreDrillPassed === true
    )
    || status === "fresh"
    || status === "closed"
    || status === "closed_for_one_job"
    || status === "closed_for_latest_manual_backup";
};

export function readMediaPlaybackCdnConfig(
  overrides: MediaPlaybackCdnConfigInput = {},
): MediaPlaybackCdnConfig {
  return {
    enabled: normalizeBoolean(
      overrides.enabled ?? readProcessEnv("MEDIA_PLAYBACK_CDN_ENABLED"),
      false,
    ),
    killSwitch: normalizeBoolean(
      overrides.killSwitch ?? readProcessEnv("MEDIA_PLAYBACK_CDN_KILL_SWITCH"),
      true,
    ),
    rolloutMode: resolveCdnRolloutMode(
      overrides.rolloutMode ?? readProcessEnv("MEDIA_PLAYBACK_CDN_ROLLOUT_MODE"),
    ),
    allowedSourceIds: normalizeCsv(
      overrides.allowedSourceIds ?? readProcessEnv("MEDIA_PLAYBACK_CDN_ALLOWED_SOURCE_IDS"),
    ),
    deniedSourceIds: normalizeCsv(
      overrides.deniedSourceIds ?? readProcessEnv("MEDIA_PLAYBACK_CDN_DENIED_SOURCE_IDS"),
    ),
    requireAuditPassed: normalizeBoolean(
      overrides.requireAuditPassed ?? readProcessEnv("MEDIA_PLAYBACK_CDN_REQUIRE_AUDIT_PASSED"),
      true,
    ),
    requireBackupFresh: normalizeBoolean(
      overrides.requireBackupFresh ?? readProcessEnv("MEDIA_PLAYBACK_CDN_REQUIRE_BACKUP_FRESH"),
      true,
    ),
    fallbackToOrigin: normalizeBoolean(
      overrides.fallbackToOrigin ?? readProcessEnv("MEDIA_PLAYBACK_CDN_FALLBACK_TO_ORIGIN"),
      true,
    ),
    playbackDeliveryProvider: normalizeDeliveryProvider(
      overrides.playbackDeliveryProvider ?? readProcessEnv("MEDIA_PLAYBACK_CDN_DELIVERY_PROVIDER"),
    ),
    maxBatchSize: normalizeNonNegativeInteger(
      overrides.maxBatchSize ?? readProcessEnv("MEDIA_PLAYBACK_CDN_MAX_BATCH_SIZE"),
    ),
    percentRollout: normalizePercent(
      overrides.percentRollout ?? readProcessEnv("MEDIA_PLAYBACK_CDN_PERCENT_ROLLOUT"),
    ),
    cdnBaseUrl: toText(overrides.cdnBaseUrl ?? readProcessEnv("MEDIA_CDN_BASE_URL")),
    cdnPublicPlaybackPrefix: normalizePrefix(
      overrides.cdnPublicPlaybackPrefix ?? readProcessEnv("MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX"),
    ),
    cdnPrivatePlaybackDisabled: normalizeBoolean(
      overrides.cdnPrivatePlaybackDisabled ?? readProcessEnv("MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED"),
      true,
    ),
    cdnSigningMode: toLowerText(overrides.cdnSigningMode ?? readProcessEnv("MEDIA_CDN_SIGNING_MODE")) || "off",
    backupGate: normalizeBackupGate(overrides.backupGate),
  };
}

export function canUseAuditedPublicRenditionForCdnPlayback(
  row: AuditedMediaRenditionForPlayback | null | undefined,
  configInput: MediaPlaybackCdnConfigInput = {},
): MediaPlaybackCdnEligibility {
  const config = readMediaPlaybackCdnConfig(configInput);
  const sourceId = toText(row?.source_id);
  const sourceDenied = !!sourceId && config.deniedSourceIds.includes(sourceId);
  const sourceAllowlisted = !!sourceId && config.allowedSourceIds.includes(sourceId);
  const trustedGate = row ? canUseTrustedRenditionForPublicCdn(row) : null;
  const playbackPath = trustedGate?.classification.playbackPath ?? "";
  const manifestPath = trustedGate?.classification.manifestPath ?? "";
  const auditPassed = !config.requireAuditPassed || normalizeAuditStatus(row) === "passed";
  const backupGatePassed = !config.requireBackupFresh || isBackupGateFreshOrClosed(config.backupGate);
  const batchSourceCount = config.allowedSourceIds.length;
  const batchCapExceeded = config.maxBatchSize > 0 && batchSourceCount > config.maxBatchSize;

  let blockedReason: MediaPlaybackCdnBlockedReason | null = null;
  if (!row) blockedReason = "missing_trusted_rendition";
  else if (config.enabled !== true) blockedReason = "global_cdn_disabled";
  else if (config.killSwitch === true) blockedReason = "kill_switch_enabled";
  else if (config.rolloutMode === "off") blockedReason = "rollout_mode_off";
  else if (sourceDenied) blockedReason = "source_denied";
  else if (
    (config.rolloutMode === "canary" || config.rolloutMode === "batch")
    && !sourceAllowlisted
  ) blockedReason = "source_not_allowed";
  else if (config.rolloutMode === "batch" && config.maxBatchSize <= 0) blockedReason = "batch_limit_missing";
  else if (config.rolloutMode === "batch" && batchCapExceeded) blockedReason = "batch_cap_exceeded";
  else if (!backupGatePassed) blockedReason = "backup_gate_not_fresh";
  else if (!auditPassed) blockedReason = "audit_not_passed";
  else if (config.playbackDeliveryProvider !== MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN) {
    blockedReason = "unsupported_rollout_delivery_provider";
  } else if (row.delivery_format !== "hls") blockedReason = "unsupported_delivery_format";
  else if (!config.cdnBaseUrl) blockedReason = "missing_cdn_base_url";
  else if (!isValidHttpsBaseUrl(config.cdnBaseUrl)) blockedReason = "invalid_cdn_base_url";
  else if (config.cdnPrivatePlaybackDisabled !== true) blockedReason = "private_cdn_delivery_not_disabled";
  else if (config.cdnSigningMode !== "off" && config.cdnSigningMode !== "token") blockedReason = "invalid_cdn_signing_mode";
  else if (trustedGate?.blockedReason) blockedReason = trustedGate.blockedReason;

  return {
    provider: blockedReason
      ? MEDIA_DELIVERY_PROVIDER_ORIGIN_SIGNED_DIRECT
      : MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN,
    cdnEligible: !blockedReason,
    fallbackUsed: !!blockedReason,
    blockedReason,
    rolloutMode: config.rolloutMode,
    sourceId,
    sourceAllowlisted,
    sourceDenied,
    deliveryFormat: toText(row?.delivery_format),
    renditionLabel: toText(row?.rendition_label),
    playbackPath,
    manifestPath,
    publicPlaybackSafe: row?.is_public_playback_safe === true,
    auditPassed,
    backupGatePassed,
    fallbackAvailable: config.fallbackToOrigin === true,
    maxBatchSize: config.maxBatchSize,
    percentRollout: config.percentRollout,
  };
}

export async function resolveCdnPlaybackFallback(input: {
  eligibility: MediaPlaybackCdnEligibility;
  fallbackUrl?: string | null;
  resolveFallbackUrl?: () => string | Promise<string>;
  config?: MediaPlaybackCdnConfigInput;
}): Promise<MediaPlaybackCdnResolution> {
  const config = readMediaPlaybackCdnConfig(input.config);
  const fallbackAllowed = config.fallbackToOrigin === true;
  const fallbackUrl = fallbackAllowed
    ? toText(input.resolveFallbackUrl ? await input.resolveFallbackUrl() : input.fallbackUrl)
    : "";

  return {
    ...input.eligibility,
    provider: MEDIA_DELIVERY_PROVIDER_ORIGIN_SIGNED_DIRECT,
    cdnEligible: false,
    fallbackUsed: !!fallbackUrl || fallbackAllowed,
    blockedReason: input.eligibility.blockedReason ?? (fallbackAllowed ? null : "fallback_disabled"),
    fallbackAvailable: fallbackAllowed,
    url: fallbackUrl,
  };
}

export async function resolveTrustedRenditionPlaybackSource(input: {
  rendition: AuditedMediaRenditionForPlayback | null | undefined;
  config?: MediaPlaybackCdnConfigInput;
  fallbackUrl?: string | null;
  resolveFallbackUrl?: () => string | Promise<string>;
}): Promise<MediaPlaybackCdnResolution> {
  const config = readMediaPlaybackCdnConfig(input.config);
  const eligibility = canUseAuditedPublicRenditionForCdnPlayback(input.rendition, config);

  if (!eligibility.cdnEligible || !input.rendition) {
    return resolveCdnPlaybackFallback({
      eligibility,
      fallbackUrl: input.fallbackUrl,
      resolveFallbackUrl: input.resolveFallbackUrl,
      config,
    });
  }

  const cdnUrl = resolveCloudflareR2PublicPlaybackUrl(
    buildMediaDeliveryAssetFromTrustedRendition(input.rendition),
    {
      deliveryProvider: MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN,
      cdnBaseUrl: config.cdnBaseUrl,
      cdnSigningMode: config.cdnSigningMode,
      cdnPublicPlaybackPrefix: config.cdnPublicPlaybackPrefix,
      cdnPrivatePlaybackDisabled: config.cdnPrivatePlaybackDisabled,
      cdnAllowedPublicPlaybackPaths: [],
    },
  );

  if (!cdnUrl) {
    return resolveCdnPlaybackFallback({
      eligibility: { ...eligibility, blockedReason: "cdn_url_unavailable" },
      fallbackUrl: input.fallbackUrl,
      resolveFallbackUrl: input.resolveFallbackUrl,
      config,
    });
  }

  return {
    ...eligibility,
    provider: MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN,
    cdnEligible: true,
    fallbackUsed: false,
    blockedReason: null,
    fallbackAvailable: config.fallbackToOrigin === true,
    url: cdnUrl,
  };
}

export function sanitizeCdnEligibilityProof(value: MediaPlaybackCdnResolution | MediaPlaybackCdnEligibility) {
  const maybeUrl = "url" in value ? toText(value.url) : "";
  let urlHost = "";
  let urlPath = "";
  if (maybeUrl && /^https?:\/\//i.test(maybeUrl)) {
    try {
      const parsed = new URL(maybeUrl);
      urlHost = parsed.hostname;
      urlPath = parsed.pathname;
    } catch {
      urlHost = "invalid_url";
    }
  }

  return {
    provider: value.provider,
    deliveryFormat: value.deliveryFormat,
    cdnEligible: value.cdnEligible,
    fallbackUsed: value.fallbackUsed,
    blockedReason: value.blockedReason,
    rolloutMode: value.rolloutMode,
    sourceId: value.sourceId,
    sourceAllowlisted: value.sourceAllowlisted,
    sourceDenied: value.sourceDenied,
    renditionLabel: value.renditionLabel,
    playbackPath: value.playbackPath,
    manifestPath: value.manifestPath,
    publicPlaybackSafe: value.publicPlaybackSafe,
    auditPassed: value.auditPassed,
    backupGatePassed: value.backupGatePassed,
    fallbackAvailable: value.fallbackAvailable,
    maxBatchSize: value.maxBatchSize,
    percentRollout: value.percentRollout,
    urlHost,
    urlPath,
    urlPresent: !!maybeUrl,
    rawUrlRedacted: !!maybeUrl,
  };
}
