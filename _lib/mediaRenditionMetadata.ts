import type { MediaDeliveryAssetInput } from "./mediaDelivery";

export const TRUSTED_RENDITION_PUBLIC_PLAYBACK_PREFIX = "playback/public/";
export const TRUSTED_RENDITION_CITY_LIGHTS_VIDEO_ID = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
export const TRUSTED_RENDITION_CITY_LIGHTS_HLS_MASTER_PATH =
  "playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8";

export type TrustedMediaRenditionDeliveryFormat = "mp4" | "hls";
export type TrustedMediaRenditionDeliveryProvider =
  | "origin_signed_direct"
  | "cloudflare_r2_custom_domain";
export type TrustedMediaRenditionStorageProvider = "cloudflare_r2" | "hetzner_s3" | "supabase_storage" | "unknown";
export type TrustedMediaRenditionBucketRole = "public_playback" | "private_origin";
export type TrustedMediaRenditionVisibility = "public" | "premium" | "private";
export type TrustedMediaRenditionScanStatus = "clean" | "approved" | "pending" | "failed" | "unscanned" | string;
export type TrustedMediaRenditionModerationStatus =
  | "clean"
  | "approved"
  | "allowed"
  | "pending_review"
  | "hidden"
  | "blocked"
  | string;

export type TrustedMediaRenditionMetadata = {
  id: string;
  media_id: string;
  video_id: string;
  source_type: string;
  source_id: string;
  rendition_label: string;
  delivery_format: TrustedMediaRenditionDeliveryFormat;
  delivery_provider: TrustedMediaRenditionDeliveryProvider;
  storage_provider: TrustedMediaRenditionStorageProvider;
  bucket_role: TrustedMediaRenditionBucketRole;
  public_playback_path: string;
  manifest_path: string | null;
  variant_playlist_path: string | null;
  width: number;
  height: number;
  duration_ms: number;
  codec: string;
  bitrate: number;
  file_size_bytes: number | null;
  cache_policy: string;
  visibility: TrustedMediaRenditionVisibility;
  scan_status: TrustedMediaRenditionScanStatus;
  moderation_status: TrustedMediaRenditionModerationStatus;
  is_public_playback_safe: boolean;
  is_original: boolean;
  is_ready: boolean;
  created_at: string;
  updated_at: string;
  proof_mode: boolean;
};

export type TrustedMediaRenditionBlockedReason =
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
  | "invalid_dimensions";

export type TrustedMediaRenditionClassification = {
  playbackPath: string;
  manifestPath: string;
  variantPlaylistPath: string;
  publicPlaybackSafe: boolean;
  isOriginalOrMaster: boolean;
  startsWithPublicPlaybackPrefix: boolean;
  forbiddenPathSegment: string | null;
  blockedReason: TrustedMediaRenditionBlockedReason | null;
};

export type TrustedMediaRenditionEligibility = {
  provider: TrustedMediaRenditionDeliveryProvider;
  cdnEligible: boolean;
  fallbackUsed: boolean;
  blockedReason: TrustedMediaRenditionBlockedReason | null;
  publicPlaybackSafe: boolean;
  classification: TrustedMediaRenditionClassification;
};

const PUBLIC_SCAN_STATUSES = new Set(["clean", "approved"]);
const PUBLIC_MODERATION_STATUSES = new Set(["clean", "approved", "allowed"]);
const ORIGINAL_OR_MASTER_LABELS = new Set(["original", "master", "source"]);
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

const normalizeObjectPath = (value: unknown) => (
  toText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
);

const isInvalidObjectPath = (value: string) => (
  !value
  || value.includes("..")
  || /^https?:\/\//i.test(value)
  || /[\u0000-\u001F\u007F]/u.test(value)
);

const findForbiddenPathSegment = (path: string) => (
  path
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .find((segment) => FORBIDDEN_PUBLIC_CDN_SEGMENTS.has(segment)) ?? null
);

const dirname = (path: string) => path.split("/").slice(0, -1).join("/");

export function classifyTrustedMediaRendition(
  row: TrustedMediaRenditionMetadata,
): TrustedMediaRenditionClassification {
  const manifestPath = normalizeObjectPath(row.manifest_path);
  const publicPlaybackPath = normalizeObjectPath(row.public_playback_path);
  const playbackPath = row.delivery_format === "hls" ? manifestPath : publicPlaybackPath;
  const variantPlaylistPath = normalizeObjectPath(row.variant_playlist_path);
  const forbiddenPathSegment = findForbiddenPathSegment(playbackPath);
  const renditionLabel = toLowerText(row.rendition_label);
  const isOriginalOrMaster = row.is_original === true
    || ORIGINAL_OR_MASTER_LABELS.has(renditionLabel)
    || forbiddenPathSegment === "original"
    || forbiddenPathSegment === "originals"
    || forbiddenPathSegment === "master"
    || forbiddenPathSegment === "masters"
    || forbiddenPathSegment === "source"
    || forbiddenPathSegment === "sources";
  const startsWithPublicPlaybackPrefix = playbackPath.startsWith(TRUSTED_RENDITION_PUBLIC_PLAYBACK_PREFIX);

  let blockedReason: TrustedMediaRenditionBlockedReason | null = null;
  if (row.is_ready !== true) blockedReason = "not_ready";
  else if (isOriginalOrMaster) blockedReason = "original_or_master_blocked";
  else if (row.is_public_playback_safe !== true) blockedReason = "public_playback_not_marked_safe";
  else if (!PUBLIC_SCAN_STATUSES.has(toLowerText(row.scan_status))) blockedReason = "scan_not_clean";
  else if (!PUBLIC_MODERATION_STATUSES.has(toLowerText(row.moderation_status))) blockedReason = "moderation_not_allowed";
  else if (row.visibility === "premium") blockedReason = "premium_requires_token_cdn";
  else if (row.visibility === "private") blockedReason = "private_requires_token_cdn";
  else if (row.bucket_role !== "public_playback") blockedReason = "wrong_bucket_role";
  else if (row.storage_provider !== "cloudflare_r2") blockedReason = "unsupported_storage_provider";
  else if (row.delivery_provider !== "cloudflare_r2_custom_domain") blockedReason = "unsupported_delivery_provider";
  else if (!playbackPath) blockedReason = "missing_public_playback_path";
  else if (isInvalidObjectPath(playbackPath)) blockedReason = "invalid_public_playback_path";
  else if (!startsWithPublicPlaybackPrefix) blockedReason = "non_playback_prefix";
  else if (forbiddenPathSegment) blockedReason = "forbidden_private_prefix";
  else if (row.width <= 0 || row.height <= 0 || row.duration_ms <= 0 || row.bitrate <= 0) {
    blockedReason = "invalid_dimensions";
  } else if (row.delivery_format === "hls" && !manifestPath) {
    blockedReason = "missing_manifest_path";
  } else if (row.delivery_format === "hls" && (publicPlaybackPath !== manifestPath || !manifestPath.endsWith("/master.m3u8"))) {
    blockedReason = "manifest_path_mismatch";
  } else if (
    row.delivery_format === "hls"
    && variantPlaylistPath
    && !variantPlaylistPath.startsWith(`${dirname(manifestPath)}/`)
  ) {
    blockedReason = "variant_path_mismatch";
  }

  return {
    playbackPath,
    manifestPath,
    variantPlaylistPath,
    publicPlaybackSafe: row.is_public_playback_safe === true,
    isOriginalOrMaster,
    startsWithPublicPlaybackPrefix,
    forbiddenPathSegment,
    blockedReason,
  };
}

export function canUseTrustedRenditionForPublicCdn(
  row: TrustedMediaRenditionMetadata,
): TrustedMediaRenditionEligibility {
  const classification = classifyTrustedMediaRendition(row);
  return {
    provider: classification.blockedReason ? "origin_signed_direct" : "cloudflare_r2_custom_domain",
    cdnEligible: !classification.blockedReason,
    fallbackUsed: !!classification.blockedReason,
    blockedReason: classification.blockedReason,
    publicPlaybackSafe: classification.publicPlaybackSafe,
    classification,
  };
}

export function buildMediaDeliveryAssetFromTrustedRendition(
  row: TrustedMediaRenditionMetadata,
): MediaDeliveryAssetInput {
  const classification = classifyTrustedMediaRendition(row);
  return {
    path: classification.playbackPath,
    publicPlaybackSafe: row.is_public_playback_safe,
    accessTier: row.visibility === "public" ? "free" : row.visibility,
    qualityLabel: row.rendition_label,
    scanStatus: row.scan_status,
    moderationStatus: row.moderation_status,
    isOriginal: row.is_original,
    isMaster: toLowerText(row.rendition_label) === "master",
    isUnscanned: !PUBLIC_SCAN_STATUSES.has(toLowerText(row.scan_status)),
    isModerationBlocked: !PUBLIC_MODERATION_STATUSES.has(toLowerText(row.moderation_status)),
    isPrivate: row.visibility === "private",
    isPremiumOnly: row.visibility === "premium",
  };
}

export function buildCityLightsTrustedHlsRenditionFixtures(
  now = "2026-07-09T00:00:00.000Z",
): TrustedMediaRenditionMetadata[] {
  const base = {
    media_id: TRUSTED_RENDITION_CITY_LIGHTS_VIDEO_ID,
    video_id: TRUSTED_RENDITION_CITY_LIGHTS_VIDEO_ID,
    source_type: "creator_video",
    source_id: TRUSTED_RENDITION_CITY_LIGHTS_VIDEO_ID,
    delivery_format: "hls" as const,
    delivery_provider: "cloudflare_r2_custom_domain" as const,
    storage_provider: "cloudflare_r2" as const,
    bucket_role: "public_playback" as const,
    public_playback_path: TRUSTED_RENDITION_CITY_LIGHTS_HLS_MASTER_PATH,
    manifest_path: TRUSTED_RENDITION_CITY_LIGHTS_HLS_MASTER_PATH,
    duration_ms: 52208,
    codec: "h264/aac",
    file_size_bytes: null,
    cache_policy: "hls_manifest_short_ttl_segments_immutable",
    visibility: "public" as const,
    scan_status: "clean",
    moderation_status: "clean",
    is_public_playback_safe: true,
    is_original: false,
    is_ready: true,
    created_at: now,
    updated_at: now,
    proof_mode: true,
  };

  return [
    {
      ...base,
      id: "city-lights-proof-hls-360p",
      rendition_label: "360p",
      variant_playlist_path:
        "playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/360p/index.m3u8",
      width: 640,
      height: 360,
      bitrate: 900000,
    },
    {
      ...base,
      id: "city-lights-proof-hls-480p",
      rendition_label: "480p",
      variant_playlist_path:
        "playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/480p/index.m3u8",
      width: 854,
      height: 480,
      bitrate: 1600000,
    },
  ];
}
