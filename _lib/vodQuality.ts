import type { Json, Tables } from "../supabase/database.types";
import {
  VOD_FREE_MAX_HEIGHT_V1,
  VOD_PREMIUM_MAX_HEIGHT_V1,
} from "./performancePolicy";
import {
  createSignedMediaDownload,
  normalizeMediaStorageProvider,
  type MediaStorageProvider,
} from "./mediaStorage";
import { resolveMediaPlaybackDelivery } from "./mediaDelivery";
import {
  resolveTrustedRenditionPlaybackSource,
  sanitizeCdnEligibilityProof,
  type AuditedMediaRenditionForPlayback,
} from "./mediaPlaybackCdnEligibility";
import { supabase } from "./supabase";

export const VOD_RENDITION_QUALITY_LABELS = ["original", "360p", "480p", "720p", "1080p"] as const;
export const VOD_PLAYBACK_QUALITY_LABELS = ["360p", "480p", "720p", "1080p"] as const;
export const VOD_FREE_PLAYBACK_QUALITY_LABELS = ["360p", "480p"] as const;
export const VOD_PREMIUM_PLAYBACK_QUALITY_LABELS = ["720p", "1080p"] as const;

export type VodRenditionQualityLabel = typeof VOD_RENDITION_QUALITY_LABELS[number];
export type VodPlaybackQualityLabel = typeof VOD_PLAYBACK_QUALITY_LABELS[number];
export type VodRenditionStatus = "queued" | "processing" | "ready" | "failed" | "archived";
export type VodRenditionAccessTier = "owner" | "free" | "premium" | "private";

export type VodAllowedQuality = {
  id: string;
  qualityLabel: VodPlaybackQualityLabel;
  width: number | null;
  height: number | null;
  fps: number | null;
  bitrateKbps: number | null;
  codec: string | null;
  container: string | null;
  accessTier: VodRenditionAccessTier;
  storageBucket: string | null;
  storagePath: string | null;
  manifestPath: string | null;
};

export type VodRenditionStatusItem = {
  id: string;
  qualityLabel: VodRenditionQualityLabel;
  status: VodRenditionStatus;
  accessTier: VodRenditionAccessTier;
  width: number | null;
  height: number | null;
  fps: number | null;
  bitrateKbps: number | null;
  errorMessage: string | null;
  updatedAt: string | null;
};

export type VodPlaybackResolution = {
  status: "ok" | "not_found" | "not_allowed" | "unavailable";
  videoId: string;
  title: string | null;
  allowedQualities: VodAllowedQuality[];
  defaultQuality: VodPlaybackQualityLabel | null;
  defaultPlaybackUrl: string;
  defaultPlaybackQuality: VodPlaybackQualityLabel | "legacy_single_file" | null;
  isPremiumLockedAvailable: boolean;
  hdAvailable: boolean;
  legacySingleFileAvailable: boolean;
  legacyPlaybackAllowed: boolean;
  legacyQualityEnforcement: "resolver_renditions" | "pending_renditions" | "no_playable_source" | "resolver_unavailable";
  message: string;
  renditionStatuses: VodRenditionStatusItem[];
  deliveryMetadata: VodPlaybackDeliveryMetadata | null;
};

export type VideoRenditionRow = Tables<"video_renditions">;

export type VodPlaybackDeliveryMetadata = {
  provider: string;
  deliveryFormat: string;
  rolloutMode: string;
  sourceAllowlisted: boolean;
  sourceDenied: boolean;
  auditPassed: boolean;
  backupGatePassed: boolean;
  fallbackUsed: boolean;
  blockedReason: string | null;
  renditionLabel: string;
  cdnEligible: boolean;
  urlHost: string;
  rawUrlRedacted: boolean;
};

const toText = (value: unknown) => String(value ?? "").trim();

const toNumberOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

export const isVodPlaybackQualityLabel = (value: unknown): value is VodPlaybackQualityLabel => (
  VOD_PLAYBACK_QUALITY_LABELS.includes(toText(value) as VodPlaybackQualityLabel)
);

export const isVodRenditionQualityLabel = (value: unknown): value is VodRenditionQualityLabel => (
  VOD_RENDITION_QUALITY_LABELS.includes(toText(value) as VodRenditionQualityLabel)
);

export const isVodFreePlaybackQuality = (value: unknown) => (
  VOD_FREE_PLAYBACK_QUALITY_LABELS.includes(toText(value) as typeof VOD_FREE_PLAYBACK_QUALITY_LABELS[number])
);

export const isVodPremiumPlaybackQuality = (value: unknown) => (
  VOD_PREMIUM_PLAYBACK_QUALITY_LABELS.includes(toText(value) as typeof VOD_PREMIUM_PLAYBACK_QUALITY_LABELS[number])
);

const normalizeStatus = (value: unknown): VodRenditionStatus => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "queued"
    || normalized === "processing"
    || normalized === "ready"
    || normalized === "failed"
    || normalized === "archived"
  ) {
    return normalized;
  }
  return "queued";
};

const normalizeAccessTier = (value: unknown): VodRenditionAccessTier => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "owner" || normalized === "free" || normalized === "premium" || normalized === "private") {
    return normalized;
  }
  return "private";
};

const normalizeAllowedQuality = (value: unknown): VodAllowedQuality | null => {
  if (!isRecord(value)) return null;
  const qualityLabel = toText(value.quality_label);
  if (!isVodPlaybackQualityLabel(qualityLabel)) return null;

  return {
    id: toText(value.id),
    qualityLabel,
    width: toNumberOrNull(value.width),
    height: toNumberOrNull(value.height),
    fps: toNumberOrNull(value.fps),
    bitrateKbps: toNumberOrNull(value.bitrate_kbps),
    codec: toText(value.codec) || null,
    container: toText(value.container) || null,
    accessTier: normalizeAccessTier(value.access_tier),
    storageBucket: toText(value.storage_bucket) || null,
    storagePath: toText(value.storage_path) || null,
    manifestPath: toText(value.manifest_path) || null,
  };
};

const normalizeRenditionStatusItem = (value: unknown): VodRenditionStatusItem | null => {
  if (!isRecord(value)) return null;
  const qualityLabel = toText(value.quality_label);
  if (!isVodRenditionQualityLabel(qualityLabel)) return null;

  return {
    id: toText(value.id),
    qualityLabel,
    status: normalizeStatus(value.status),
    accessTier: normalizeAccessTier(value.access_tier),
    width: toNumberOrNull(value.width),
    height: toNumberOrNull(value.height),
    fps: toNumberOrNull(value.fps),
    bitrateKbps: toNumberOrNull(value.bitrate_kbps),
    errorMessage: toText(value.error_message) || null,
    updatedAt: toText(value.updated_at) || null,
  };
};

const normalizeResolutionPayload = (payload: Json | null | undefined, videoId: string): VodPlaybackResolution => {
  const body = isRecord(payload) ? payload : {};
  const allowedQualities = Array.isArray(body.allowed_qualities)
    ? body.allowed_qualities.map(normalizeAllowedQuality).filter((entry): entry is VodAllowedQuality => !!entry)
    : [];
  const defaultQuality = isVodPlaybackQualityLabel(body.default_quality) ? body.default_quality : null;
  const renditionStatuses = Array.isArray(body.rendition_statuses)
    ? body.rendition_statuses.map(normalizeRenditionStatusItem).filter((entry): entry is VodRenditionStatusItem => !!entry)
    : [];
  const normalizedStatus = toText(body.status).toLowerCase();
  const status: VodPlaybackResolution["status"] =
    normalizedStatus === "ok" || normalizedStatus === "not_found" || normalizedStatus === "not_allowed"
      ? normalizedStatus
      : "unavailable";
  const legacyQualityEnforcement = toText(body.legacy_quality_enforcement);

  return {
    status,
    videoId: toText(body.video_id) || videoId,
    title: toText(body.title) || null,
    allowedQualities,
    defaultQuality,
    defaultPlaybackUrl: "",
    defaultPlaybackQuality: null,
    isPremiumLockedAvailable: body.is_premium_locked_available === true,
    hdAvailable: body.hd_available === true,
    legacySingleFileAvailable: body.legacy_single_file_available === true,
    legacyPlaybackAllowed: body.legacy_playback_allowed === true,
    legacyQualityEnforcement:
      legacyQualityEnforcement === "resolver_renditions"
      || legacyQualityEnforcement === "pending_renditions"
      || legacyQualityEnforcement === "no_playable_source"
        ? legacyQualityEnforcement
        : "resolver_unavailable",
    message: toText(body.message) || "VOD playback resolver is not available.",
    renditionStatuses,
    deliveryMetadata: null,
  };
};

export const createUnavailableVodPlaybackResolution = (
  videoId: string,
  message = "VOD playback resolver is not available.",
): VodPlaybackResolution => ({
  status: "unavailable",
  videoId,
  title: null,
  allowedQualities: [],
  defaultQuality: null,
  defaultPlaybackUrl: "",
  defaultPlaybackQuality: null,
  isPremiumLockedAvailable: false,
  hdAvailable: false,
  legacySingleFileAvailable: false,
  legacyPlaybackAllowed: false,
  legacyQualityEnforcement: "resolver_unavailable",
  message,
  renditionStatuses: [],
  deliveryMetadata: null,
});

export async function resolveVideoPlayback(videoId: string): Promise<VodPlaybackResolution> {
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) return createUnavailableVodPlaybackResolution("", "Missing video id.");

  try {
    const { data, error } = await supabase.rpc("resolve_video_playback", { target_video_id: normalizedVideoId });
    if (error) {
      return createUnavailableVodPlaybackResolution(normalizedVideoId, "VOD playback resolver is pending migration.");
    }
    return normalizeResolutionPayload(data, normalizedVideoId);
  } catch {
    return createUnavailableVodPlaybackResolution(normalizedVideoId, "VOD playback resolver is pending migration.");
  }
}

export async function recordOriginalVideoRendition(videoId: string): Promise<void> {
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) return;
  try {
    await supabase.rpc("record_video_original_rendition", { p_video_id: normalizedVideoId });
  } catch {
    // The migration may not be applied in older environments; upload should not fail because status recording is pending.
  }
}

const createSupabaseSignedRenditionUrl = async (bucket: string, objectPath: string) => {
  if (!bucket || !objectPath) return "";
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 60 * 60);
  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
};

const MEDIA_RENDITION_PLAYBACK_SELECT = [
  "id",
  "media_id",
  "video_id",
  "source_type",
  "source_id",
  "rendition_label",
  "delivery_format",
  "delivery_provider",
  "storage_provider",
  "bucket_role",
  "public_playback_path",
  "manifest_path",
  "variant_playlist_path",
  "width",
  "height",
  "duration_ms",
  "codec",
  "bitrate",
  "file_size_bytes",
  "cache_policy",
  "visibility",
  "scan_status",
  "moderation_status",
  "is_public_playback_safe",
  "is_original",
  "is_ready",
  "created_at",
  "updated_at",
].join(",");

const normalizeTrustedMediaRenditionRow = (row: Record<string, unknown>): AuditedMediaRenditionForPlayback | null => {
  const sourceId = toText(row.source_id);
  const manifestPath = toText(row.manifest_path);
  if (!sourceId || !manifestPath) return null;

  return {
    id: toText(row.id),
    media_id: toText(row.media_id) || sourceId,
    video_id: toText(row.video_id) || sourceId,
    source_type: toText(row.source_type),
    source_id: sourceId,
    rendition_label: toText(row.rendition_label),
    delivery_format: toText(row.delivery_format) as AuditedMediaRenditionForPlayback["delivery_format"],
    delivery_provider: toText(row.delivery_provider) as AuditedMediaRenditionForPlayback["delivery_provider"],
    storage_provider: toText(row.storage_provider) as AuditedMediaRenditionForPlayback["storage_provider"],
    bucket_role: toText(row.bucket_role) as AuditedMediaRenditionForPlayback["bucket_role"],
    public_playback_path: toText(row.public_playback_path),
    manifest_path: manifestPath,
    variant_playlist_path: toText(row.variant_playlist_path) || null,
    width: toNumberOrNull(row.width) ?? 0,
    height: toNumberOrNull(row.height) ?? 0,
    duration_ms: toNumberOrNull(row.duration_ms) ?? 0,
    codec: toText(row.codec),
    bitrate: toNumberOrNull(row.bitrate) ?? 0,
    file_size_bytes: toNumberOrNull(row.file_size_bytes),
    cache_policy: toText(row.cache_policy),
    visibility: toText(row.visibility) as AuditedMediaRenditionForPlayback["visibility"],
    scan_status: toText(row.scan_status),
    moderation_status: toText(row.moderation_status),
    is_public_playback_safe: row.is_public_playback_safe === true,
    is_original: row.is_original === true,
    is_ready: row.is_ready === true,
    created_at: toText(row.created_at),
    updated_at: toText(row.updated_at),
    proof_mode: false,
    // Current production schema encodes audit pass through service-role worker writes,
    // DB constraints, post-write auditor proof, and the public-safe RLS policy.
    audit_status: "passed",
  };
};

async function readTrustedPublicHlsRenditionsForSource(input: {
  sourceType: "creator_video";
  sourceId: string;
}): Promise<AuditedMediaRenditionForPlayback[]> {
  const sourceId = toText(input.sourceId);
  if (!sourceId) return [];

  try {
    const mediaRenditionsClient = supabase as any;
    const { data, error } = await mediaRenditionsClient
      .from("media_renditions")
      .select(MEDIA_RENDITION_PLAYBACK_SELECT)
      .eq("source_type", input.sourceType)
      .eq("source_id", sourceId)
      .eq("delivery_format", "hls")
      .eq("delivery_provider", "cloudflare_r2_custom_domain")
      .eq("storage_provider", "cloudflare_r2")
      .eq("bucket_role", "public_playback")
      .eq("visibility", "public")
      .eq("is_ready", true)
      .eq("is_public_playback_safe", true)
      .eq("is_original", false)
      .in("scan_status", ["clean", "approved"])
      .in("moderation_status", ["clean", "approved", "allowed"])
      .order("height", { ascending: false })
      .limit(8);

    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[])
      .map(normalizeTrustedMediaRenditionRow)
      .filter((row): row is AuditedMediaRenditionForPlayback => !!row);
  } catch {
    return [];
  }
}

const normalizeDeliveryMetadata = (value: ReturnType<typeof sanitizeCdnEligibilityProof>): VodPlaybackDeliveryMetadata => ({
  provider: value.provider,
  deliveryFormat: value.deliveryFormat,
  rolloutMode: value.rolloutMode,
  sourceAllowlisted: value.sourceAllowlisted,
  sourceDenied: value.sourceDenied,
  auditPassed: value.auditPassed,
  backupGatePassed: value.backupGatePassed,
  fallbackUsed: value.fallbackUsed,
  blockedReason: value.blockedReason,
  renditionLabel: value.renditionLabel,
  cdnEligible: value.cdnEligible,
  urlHost: value.urlHost,
  rawUrlRedacted: value.rawUrlRedacted,
});

export async function createSignedVodRenditionUrl(input: {
  rendition: VodAllowedQuality;
  videoId: string;
  storageProvider: MediaStorageProvider | string;
  fallbackBucket: string;
  trustedRendition?: AuditedMediaRenditionForPlayback | null;
}): Promise<string> {
  const objectPath = toText(input.rendition.manifestPath) || toText(input.rendition.storagePath);
  const bucket = toText(input.rendition.storageBucket) || toText(input.fallbackBucket);
  if (!bucket || !objectPath) return "";
  const provider = normalizeMediaStorageProvider(input.storageProvider);
  const resolveFallbackUrl = () => (
    provider === "s3"
      ? createSignedMediaDownload({
        surfaceType: "creator_video",
        provider,
        bucket,
        objectKey: objectPath,
        recordId: input.videoId,
      }).catch(() => "")
      : createSupabaseSignedRenditionUrl(bucket, objectPath)
  );

  if (input.trustedRendition) {
    const trustedDelivery = await resolveTrustedRenditionPlaybackSource({
      rendition: input.trustedRendition,
      resolveFallbackUrl,
    });
    return trustedDelivery.url;
  }

  const delivery = await resolveMediaPlaybackDelivery({
    asset: {
      path: objectPath,
      publicPlaybackSafe: false,
      accessTier: input.rendition.accessTier,
      qualityLabel: input.rendition.qualityLabel,
    },
    resolveFallbackUrl,
  });
  return delivery.url;
}

export const pickDefaultVodQuality = (resolution: VodPlaybackResolution): VodAllowedQuality | null => {
  if (!resolution.allowedQualities.length) return null;
  if (resolution.defaultQuality) {
    const match = resolution.allowedQualities.find((entry) => entry.qualityLabel === resolution.defaultQuality);
    if (match) return match;
  }
  return resolution.allowedQualities[0] ?? null;
};

export async function resolveSignedVideoPlaybackSource(input: {
  videoId: string;
  storageProvider: MediaStorageProvider | string;
  fallbackBucket: string;
}): Promise<VodPlaybackResolution> {
  const resolution = await resolveVideoPlayback(input.videoId);
  const defaultRendition = pickDefaultVodQuality(resolution);
  let signedUrl = "";
  const resolveOriginRenditionUrl = async () => {
    if (signedUrl) return signedUrl;
    if (!defaultRendition) return "";
    signedUrl = await createSignedVodRenditionUrl({
      rendition: defaultRendition,
      videoId: input.videoId,
      storageProvider: input.storageProvider,
      fallbackBucket: input.fallbackBucket,
    });
    return signedUrl;
  };

  const trustedRenditions = await readTrustedPublicHlsRenditionsForSource({
    sourceType: "creator_video",
    sourceId: input.videoId,
  });
  for (const trustedRendition of trustedRenditions) {
    const trustedDelivery = await resolveTrustedRenditionPlaybackSource({
      rendition: trustedRendition,
      resolveFallbackUrl: resolveOriginRenditionUrl,
    });
    if (trustedDelivery.cdnEligible && trustedDelivery.url) {
      return {
        ...resolution,
        defaultPlaybackUrl: trustedDelivery.url,
        defaultPlaybackQuality: isVodPlaybackQualityLabel(trustedDelivery.renditionLabel)
          ? trustedDelivery.renditionLabel
          : defaultRendition?.qualityLabel ?? null,
        deliveryMetadata: normalizeDeliveryMetadata(sanitizeCdnEligibilityProof(trustedDelivery)),
      };
    }
  }

  if (!defaultRendition) return resolution;
  await resolveOriginRenditionUrl();

  return {
    ...resolution,
    defaultPlaybackUrl: signedUrl,
    defaultPlaybackQuality: signedUrl ? defaultRendition.qualityLabel : null,
    deliveryMetadata: null,
  };
}

export async function readVideoRenditionStatuses(videoIds: string[]): Promise<Map<string, VodRenditionStatusItem[]>> {
  const normalizedVideoIds = Array.from(new Set(videoIds.map(toText).filter(Boolean))).slice(0, 100);
  const statusMap = new Map<string, VodRenditionStatusItem[]>();
  if (!normalizedVideoIds.length) return statusMap;

  try {
    const { data, error } = await supabase
      .from("video_renditions")
      .select("id,video_id,quality_label,status,access_tier,width,height,fps,bitrate_kbps,error_message,updated_at")
      .in("video_id", normalizedVideoIds)
      .order("quality_label", { ascending: true })
      .returns<Pick<VideoRenditionRow,
        "id" | "video_id" | "quality_label" | "status" | "access_tier" | "width" | "height" | "fps" | "bitrate_kbps" | "error_message" | "updated_at"
      >[]>();

    if (error || !data) return statusMap;
    for (const row of data) {
      const videoId = toText(row.video_id);
      const statusItem = normalizeRenditionStatusItem({
        id: row.id,
        quality_label: row.quality_label,
        status: row.status,
        access_tier: row.access_tier,
        width: row.width,
        height: row.height,
        fps: row.fps,
        bitrate_kbps: row.bitrate_kbps,
        error_message: row.error_message,
        updated_at: row.updated_at,
      });
      if (!videoId || !statusItem) continue;
      const existing = statusMap.get(videoId) ?? [];
      existing.push(statusItem);
      statusMap.set(videoId, existing);
    }
  } catch {
    return statusMap;
  }

  return statusMap;
}

export const formatVodRenditionStatusSummary = (statuses: readonly VodRenditionStatusItem[]) => {
  if (!statuses.length) return "HD processing pipeline pending";
  const byQuality = new Map(statuses.map((entry) => [entry.qualityLabel, entry.status]));
  const parts = VOD_RENDITION_QUALITY_LABELS.map((quality) => {
    const status = byQuality.get(quality);
    if (!status) return `${quality}: pending`;
    return `${quality}: ${status.replace(/_/g, " ")}`;
  });
  return parts.join(" · ");
};

export const getVodQualityPolicyCopy = () => ({
  freeMax: `${VOD_FREE_MAX_HEIGHT_V1}p`,
  premiumMax: `${VOD_PREMIUM_MAX_HEIGHT_V1}p`,
  pending: "True VOD quality enforcement becomes complete when real 360p/480p/720p/1080p renditions exist.",
});
