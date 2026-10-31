import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

import type { Tables, TablesInsert } from "../supabase/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "./supabase";
import {
  captureAccountBoundSupabaseMutationSubject,
  invokeAccountBoundSupabaseMutationRpc,
  runCurrentAccountBoundSupabaseMutationRpc,
} from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { UserFacingError } from "./userFacingErrors";

export const PLATFORM_BRAND_BUCKET = "platform-brand-assets";
export const PLATFORM_BRAND_SIGNED_URL_SECONDS = 60 * 60;
export const PLATFORM_BRAND_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const PLATFORM_BRAND_VIDEO_MAX_BYTES = 250 * 1024 * 1024;

export type PlatformBrandAssetType =
  | "hero_image"
  | "hero_video"
  | "hero_poster"
  | "background_image"
  | "avatar"
  | "logo"
  | "watermark"
  | "merch_product_image";

export type PlatformBrandFitMode = "fill" | "fit" | "center";
export type PlatformBrandThemePreset = "city_night" | "studio_red" | "clean_dark" | "spotlight" | "classic";
export type PlatformBrandAssetState = "draft" | "published" | "archived";
export type PlatformBrandModerationStatus = "pending_review" | "clean" | "reported" | "hidden" | "removed" | "rejected";
export type PlatformBrandScanStatus =
  | "pending_scan"
  | "scanning"
  | "clean"
  | "malware_detected"
  | "scan_failed"
  | "manual_review"
  | "quarantined"
  | "skipped";
export type PlatformBrandReviewAction = "approve" | "reject" | "archive";

export type PlatformBrandAssetFile = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

export type PlatformBrandAsset = {
  id: string;
  ownerUserId: string;
  assetType: PlatformBrandAssetType;
  assetState: PlatformBrandAssetState;
  storageProvider: string;
  storageBucket: string;
  storageObjectKey: string;
  storagePath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fileSizeBytes: number;
  originalFileName: string | null;
  moderationStatus: PlatformBrandModerationStatus;
  moderationReason: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  scanStatus: PlatformBrandScanStatus;
  scanProvider: string | null;
  scanResult: string | null;
  scannedAt: string | null;
  quarantinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  signedUrl: string;
};

export type PlatformBrandProfile = {
  ownerUserId: string;
  heroImageAssetId: string | null;
  heroVideoAssetId: string | null;
  heroPosterAssetId: string | null;
  backgroundImageAssetId: string | null;
  avatarAssetId: string | null;
  logoAssetId: string | null;
  watermarkAssetId: string | null;
  spotlightVideoId: string | null;
  themePreset: PlatformBrandThemePreset;
  accentColor: string;
  heroFitMode: PlatformBrandFitMode;
  heroFocalX: number;
  heroFocalY: number;
  heroCropScale: number;
  backgroundFitMode: PlatformBrandFitMode;
  backgroundFocalX: number;
  backgroundFocalY: number;
  overlayStrength: number;
  blurStrength: number;
  publishedAt: string | null;
  updatedAt: string;
};

export type PlatformBrandingBundle = {
  profile: PlatformBrandProfile;
  assets: PlatformBrandAsset[];
  heroImage: PlatformBrandAsset | null;
  heroVideo: PlatformBrandAsset | null;
  heroPoster: PlatformBrandAsset | null;
  backgroundImage: PlatformBrandAsset | null;
  avatar: PlatformBrandAsset | null;
  logo: PlatformBrandAsset | null;
  watermark: PlatformBrandAsset | null;
};

export type PlatformBrandPublishReadbackStatus = {
  selectedAssetIds: string[];
  selectedCount: number;
  publicReadyCount: number;
  publicReturnedCount: number;
  waitingScanCount: number;
  waitingReviewCount: number;
  blockedCount: number;
  notPublishedCount: number;
  publicReadbackMissingCount: number;
};

export type PlatformBrandReviewResult = {
  id: string;
  ownerUserId: string;
  assetType: PlatformBrandAssetType;
  assetState: PlatformBrandAssetState;
  moderationStatus: PlatformBrandModerationStatus;
  moderationReason: string | null;
  moderatedAt: string | null;
  reviewEventId: string | null;
};

type PlatformBrandAssetRow = Tables<"platform_brand_assets">;
type PlatformBrandAssetInsert = TablesInsert<"platform_brand_assets">;
type PlatformBrandProfileRow = Tables<"platform_brand_profiles">;
type PlatformBrandProfileInsert = TablesInsert<"platform_brand_profiles">;

type PublicPlatformBrandProfileRow = Omit<PlatformBrandProfileRow, "created_at">;

const PLATFORM_BRAND_ASSET_SELECT =
  "id,owner_user_id,asset_type,asset_state,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,width,height,duration_ms,file_size_bytes,original_file_name,moderation_status,moderation_reason,moderated_at,moderated_by,scan_status,scan_provider,scan_result,scanned_at,quarantined_at,created_at,updated_at,deleted_at";

const PLATFORM_BRAND_PROFILE_SELECT =
  "owner_user_id,hero_image_asset_id,hero_video_asset_id,hero_poster_asset_id,background_image_asset_id,avatar_asset_id,logo_asset_id,watermark_asset_id,spotlight_video_id,theme_preset,accent_color,hero_fit_mode,hero_focal_x,hero_focal_y,hero_crop_scale,background_fit_mode,background_focal_x,background_focal_y,overlay_strength,blur_strength,published_at,created_at,updated_at";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const PLATFORM_BRAND_UPLOAD_TIMEOUT_MS = 120000;
const PLATFORM_BRAND_PUBLIC_SCAN_STATUSES: PlatformBrandScanStatus[] = ["clean"];

const toText = (value: unknown) => String(value ?? "").trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const createClientId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const next = char === "x" ? rand : (rand & 0x3) | 0x8;
    return next.toString(16);
  });

const getExtensionFromName = (name?: string | null) => {
  const normalized = toText(name).toLowerCase();
  if (!normalized.includes(".")) return "";
  return normalized.split(".").pop()?.replace(/[^a-z0-9]/g, "") ?? "";
};

const encodeStoragePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

const inferMimeType = (file: PlatformBrandAssetFile, assetType: PlatformBrandAssetType) => {
  const provided = toText(file.mimeType).toLowerCase();
  if (provided) return provided;

  switch (getExtensionFromName(file.name)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "mp4":
    case "m4v":
      return "video/mp4";
    default:
      return assetType === "hero_video" ? "video/mp4" : "image/jpeg";
  }
};

const getFileExtension = (file: PlatformBrandAssetFile, assetType: PlatformBrandAssetType) => {
  const extension = getExtensionFromName(file.name);
  if (extension) return extension === "jpeg" ? "jpg" : extension;
  const mimeType = inferMimeType(file, assetType);
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("quicktime")) return "mov";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  return "jpg";
};

const normalizeAssetType = (value: unknown): PlatformBrandAssetType => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "hero_video"
    || normalized === "hero_poster"
    || normalized === "background_image"
    || normalized === "avatar"
    || normalized === "logo"
    || normalized === "watermark"
    || normalized === "merch_product_image"
  ) {
    return normalized;
  }
  return "hero_image";
};

const normalizeAssetState = (value: unknown): PlatformBrandAssetState => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "published" || normalized === "archived") return normalized;
  return "draft";
};

const normalizeModerationStatus = (value: unknown): PlatformBrandModerationStatus => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "clean"
    || normalized === "reported"
    || normalized === "hidden"
    || normalized === "removed"
    || normalized === "rejected"
  ) {
    return normalized;
  }
  return "pending_review";
};

const normalizeScanStatus = (value: unknown): PlatformBrandScanStatus => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "scanning"
    || normalized === "clean"
    || normalized === "malware_detected"
    || normalized === "scan_failed"
    || normalized === "manual_review"
    || normalized === "quarantined"
    || normalized === "skipped"
  ) {
    return normalized;
  }
  return "pending_scan";
};

export const normalizePlatformBrandFitMode = (value: unknown): PlatformBrandFitMode => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "fit" || normalized === "center") return normalized;
  return "fill";
};

export const normalizePlatformBrandThemePreset = (value: unknown): PlatformBrandThemePreset => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "studio_red"
    || normalized === "clean_dark"
    || normalized === "spotlight"
    || normalized === "classic"
  ) {
    return normalized;
  }
  return "city_night";
};

export const formatPlatformBrandFileSize = (size?: number | null) => {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return "";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
};

export const getPlatformBrandAssetLimitLabel = (assetType: PlatformBrandAssetType) =>
  formatPlatformBrandFileSize(assetType === "hero_video" ? PLATFORM_BRAND_VIDEO_MAX_BYTES : PLATFORM_BRAND_IMAGE_MAX_BYTES);

export const getPlatformBrandAssetValidationMessage = (
  file: PlatformBrandAssetFile | null | undefined,
  assetType: PlatformBrandAssetType,
) => {
  if (!file || !toText(file.uri)) return "Choose a Platform asset first.";
  const mimeType = inferMimeType(file, assetType);
  const videoAsset = assetType === "hero_video";
  if (videoAsset ? !VIDEO_MIME_TYPES.has(mimeType) : (!IMAGE_MIME_TYPES.has(mimeType)
    && !["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"].includes(mimeType)
    && !(!toText(file.mimeType) && /\.hei[cf]$/i.test(toText(file.name) || toText(file.uri))))) {
    return videoAsset ? "Choose an MP4, MOV, or WebM video." : "Choose a JPG, PNG, or WebP image.";
  }

  const size = Number(file.size ?? 0);
  const maxBytes = videoAsset ? PLATFORM_BRAND_VIDEO_MAX_BYTES : PLATFORM_BRAND_IMAGE_MAX_BYTES;
  if (Number.isFinite(size) && size > maxBytes) {
    return `This file is ${formatPlatformBrandFileSize(size)}. Platform ${videoAsset ? "Hero Reel" : "images"} support up to ${getPlatformBrandAssetLimitLabel(assetType)}.`;
  }
  return null;
};

export const formatPlatformBrandAssetStatus = (asset?: PlatformBrandAsset | null) => {
  if (!asset) return "Not set";
  if (asset.deletedAt) return "Removed";
  if (asset.scanStatus === "pending_scan" || asset.scanStatus === "scanning") return "Checking";
  if (asset.scanStatus === "malware_detected" || asset.scanStatus === "scan_failed" || asset.scanStatus === "quarantined") return "Blocked";
  if (asset.assetState === "published" && ["clean", "reported"].includes(asset.moderationStatus)) return "Published";
  if (asset.assetState === "draft" && ["clean", "reported"].includes(asset.moderationStatus)) return "Approved";
  if (asset.moderationStatus === "pending_review") return "Ready to publish";
  if (asset.moderationStatus === "rejected" || asset.moderationStatus === "removed" || asset.moderationStatus === "hidden") {
    return "Needs changes";
  }
  return asset.assetState === "draft" ? "Draft" : "Ready";
};

export const formatPlatformBrandScanStatus = (asset?: PlatformBrandAsset | null) => {
  if (!asset) return "Not queued";
  switch (asset.scanStatus) {
    case "clean":
      return "Safety clear";
    case "manual_review":
    case "skipped":
      return "Safety reviewed";
    case "scanning":
      return "Checking";
    case "malware_detected":
      return "Blocked";
    case "scan_failed":
    case "quarantined":
      return "Safety failed";
    default:
      return "Safety pending";
  }
};

const createDefaultPlatformBrandProfile = (ownerUserId: string): PlatformBrandProfile => ({
  ownerUserId,
  heroImageAssetId: null,
  heroVideoAssetId: null,
  heroPosterAssetId: null,
  backgroundImageAssetId: null,
  avatarAssetId: null,
  logoAssetId: null,
  watermarkAssetId: null,
  spotlightVideoId: null,
  themePreset: "city_night",
  accentColor: "#DC143C",
  heroFitMode: "fill",
  heroFocalX: 0.5,
  heroFocalY: 0.5,
  heroCropScale: 1,
  backgroundFitMode: "fill",
  backgroundFocalX: 0.5,
  backgroundFocalY: 0.5,
  overlayStrength: 0.7,
  blurStrength: 0,
  publishedAt: null,
  updatedAt: new Date().toISOString(),
});

const parseProfile = (row: PlatformBrandProfileRow | PublicPlatformBrandProfileRow | null | undefined, ownerUserId: string) => {
  if (!row) return createDefaultPlatformBrandProfile(ownerUserId);
  return {
    ownerUserId: toText(row.owner_user_id) || ownerUserId,
    heroImageAssetId: toText(row.hero_image_asset_id) || null,
    heroVideoAssetId: toText(row.hero_video_asset_id) || null,
    heroPosterAssetId: toText(row.hero_poster_asset_id) || null,
    backgroundImageAssetId: toText(row.background_image_asset_id) || null,
    avatarAssetId: toText(row.avatar_asset_id) || null,
    logoAssetId: toText(row.logo_asset_id) || null,
    watermarkAssetId: toText(row.watermark_asset_id) || null,
    spotlightVideoId: toText(row.spotlight_video_id) || null,
    themePreset: normalizePlatformBrandThemePreset(row.theme_preset),
    accentColor: /^#[0-9a-f]{6}$/i.test(toText(row.accent_color)) ? toText(row.accent_color) : "#DC143C",
    heroFitMode: normalizePlatformBrandFitMode(row.hero_fit_mode),
    heroFocalX: clamp(row.hero_focal_x, 0.5, 0, 1),
    heroFocalY: clamp(row.hero_focal_y, 0.5, 0, 1),
    heroCropScale: clamp(row.hero_crop_scale, 1, 1, 3),
    backgroundFitMode: normalizePlatformBrandFitMode(row.background_fit_mode),
    backgroundFocalX: clamp(row.background_focal_x, 0.5, 0, 1),
    backgroundFocalY: clamp(row.background_focal_y, 0.5, 0, 1),
    overlayStrength: clamp(row.overlay_strength, 0.7, 0, 1),
    blurStrength: clamp(row.blur_strength, 0, 0, 1),
    publishedAt: toText(row.published_at) || null,
    updatedAt: toText(row.updated_at) || new Date().toISOString(),
  } satisfies PlatformBrandProfile;
};

async function createPlatformBrandSignedUrl(asset: Pick<PlatformBrandAssetRow, "storage_bucket" | "storage_path">) {
  const bucket = toText(asset.storage_bucket) || PLATFORM_BRAND_BUCKET;
  const path = toText(asset.storage_path);
  if (!path) return "";
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, PLATFORM_BRAND_SIGNED_URL_SECONDS)
    .catch(() => ({ data: null, error: true }));
  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
}

async function parseAsset(row: PlatformBrandAssetRow): Promise<PlatformBrandAsset> {
  const scanRow = row as PlatformBrandAssetRow & {
    scan_status?: unknown;
    scan_provider?: unknown;
    scan_result?: unknown;
    scanned_at?: unknown;
    quarantined_at?: unknown;
  };
  return {
    id: toText(row.id),
    ownerUserId: toText(row.owner_user_id),
    assetType: normalizeAssetType(row.asset_type),
    assetState: normalizeAssetState(row.asset_state),
    storageProvider: toText(row.storage_provider) || "supabase",
    storageBucket: toText(row.storage_bucket) || PLATFORM_BRAND_BUCKET,
    storageObjectKey: toText(row.storage_object_key),
    storagePath: toText(row.storage_path),
    mimeType: toText(row.mime_type) || "image/jpeg",
    width: typeof row.width === "number" ? row.width : null,
    height: typeof row.height === "number" ? row.height : null,
    durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
    fileSizeBytes: Math.max(0, Number(row.file_size_bytes ?? 0) || 0),
    originalFileName: toText(row.original_file_name) || null,
    moderationStatus: normalizeModerationStatus(row.moderation_status),
    moderationReason: toText(row.moderation_reason) || null,
    moderatedAt: toText(row.moderated_at) || null,
    moderatedBy: toText(row.moderated_by) || null,
    scanStatus: normalizeScanStatus(scanRow.scan_status),
    scanProvider: toText(scanRow.scan_provider) || null,
    scanResult: toText(scanRow.scan_result) || null,
    scannedAt: toText(scanRow.scanned_at) || null,
    quarantinedAt: toText(scanRow.quarantined_at) || null,
    createdAt: toText(row.created_at) || new Date().toISOString(),
    updatedAt: toText(row.updated_at) || toText(row.created_at) || new Date().toISOString(),
    deletedAt: toText(row.deleted_at) || null,
    signedUrl: await createPlatformBrandSignedUrl(row),
  };
}

async function getSignedInAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = toText(data.session?.access_token);
  if (error || !accessToken) throw new Error("Sign in before saving Platform media.");
  return accessToken;
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

async function preparePlatformBrandUploadUri(file: PlatformBrandAssetFile, assetType: PlatformBrandAssetType): Promise<{ file: PlatformBrandAssetFile; uri: string; cleanup: () => Promise<void> }> {
  if (assetType !== "hero_video" && (["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"].includes(inferMimeType(file, assetType)) || /\.hei[cf]$/i.test(toText(file.name) || toText(file.uri)))) {
    const { normalizeImageUploadFile } = await import("./imageUploadNormalization");
    const normalized = await normalizeImageUploadFile(file);
    try {
      if (!IMAGE_MIME_TYPES.has(inferMimeType(normalized.file, assetType))) throw new Error("Unable to prepare this Platform image.");
      const validation = getPlatformBrandAssetValidationMessage(normalized.file, assetType);
      if (validation) throw new Error(validation);
      const prepared = await preparePlatformBrandUploadUri(normalized.file, assetType);
      return { ...prepared, cleanup: async () => { try { await prepared.cleanup(); } finally { await normalized.cleanup(); } } };
    } catch (error) {
      await normalized.cleanup();
      throw error;
    }
  }

  const sourceUri = toText(file.uri);
  if (!sourceUri) throw new Error("Choose a Platform asset first.");

  if (!sourceUri.startsWith("content://") || !FileSystem.cacheDirectory) {
    return { file, uri: sourceUri, cleanup: async () => undefined };
  }

  const cacheUri = `${FileSystem.cacheDirectory}platform-brand-${createClientId()}.${getFileExtension(file, assetType)}`;
  await withTimeout(
    FileSystem.copyAsync({ from: sourceUri, to: cacheUri }),
    20000,
    "Platform media took too long to prepare. Try again.",
  );

  return {
    file,
    uri: cacheUri,
    cleanup: async () => {
      await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => undefined);
    },
  };
}

async function getPreparedPlatformBrandFileSize(uri: string, fallback?: number | null) {
  const parsed = Number(fallback);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  const size = Number(info && "size" in info ? info.size : 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

async function uploadPlatformBrandFileToStorage(input: {
  storagePath: string;
  uri: string;
  mimeType: string;
  accessToken: string;
  assertOperationCurrent?: () => void;
}) {
  const accessToken = input.accessToken;
  input.assertOperationCurrent?.();
  const uploadUrl = `${SUPABASE_URL.replace(/\/+$/g, "")}/storage/v1/object/${PLATFORM_BRAND_BUCKET}/${encodeStoragePath(input.storagePath)}`;

  try {
    const result = await withTimeout(
      FileSystem.uploadAsync(uploadUrl, input.uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": input.mimeType,
          "x-upsert": "false",
        },
      }),
      PLATFORM_BRAND_UPLOAD_TIMEOUT_MS,
      "Platform media upload took too long. Try again.",
    );
    input.assertOperationCurrent?.();
    if (result.status >= 200 && result.status < 300) return;
  } catch {
    // Fall back to the SDK path below; some platforms handle Expo File bodies better than uploadAsync.
  }

  input.assertOperationCurrent?.();
  const localFile = new File(input.uri);
  const upload = await supabase.storage
    .from(PLATFORM_BRAND_BUCKET)
    .upload(input.storagePath, localFile as unknown as Blob, {
      contentType: input.mimeType,
      upsert: false,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  if (upload.error) throw upload.error;
}

const createBundle = (profile: PlatformBrandProfile, assets: PlatformBrandAsset[]): PlatformBrandingBundle => {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    profile,
    assets,
    heroImage: profile.heroImageAssetId ? assetById.get(profile.heroImageAssetId) ?? null : null,
    heroVideo: profile.heroVideoAssetId ? assetById.get(profile.heroVideoAssetId) ?? null : null,
    heroPoster: profile.heroPosterAssetId ? assetById.get(profile.heroPosterAssetId) ?? null : null,
    backgroundImage: profile.backgroundImageAssetId ? assetById.get(profile.backgroundImageAssetId) ?? null : null,
    avatar: profile.avatarAssetId ? assetById.get(profile.avatarAssetId) ?? null : null,
    logo: profile.logoAssetId ? assetById.get(profile.logoAssetId) ?? null : null,
    watermark: profile.watermarkAssetId ? assetById.get(profile.watermarkAssetId) ?? null : null,
  };
};

const getProfileSelectedAssetIds = (profile: PlatformBrandProfile | null | undefined) =>
  Array.from(new Set([
    profile?.heroImageAssetId,
    profile?.heroVideoAssetId,
    profile?.heroPosterAssetId,
    profile?.backgroundImageAssetId,
    profile?.avatarAssetId,
    profile?.logoAssetId,
    profile?.watermarkAssetId,
  ].filter(Boolean))) as string[];

export async function readPlatformBrandStudio(ownerUserId: string, options?: { throwOnUnavailable?: boolean }): Promise<PlatformBrandingBundle> {
  const normalizedOwnerId = toText(ownerUserId);
  const emptyProfile = createDefaultPlatformBrandProfile(normalizedOwnerId);
  if (!normalizedOwnerId) return createBundle(emptyProfile, []);

  const [profileResult, assetResult] = await Promise.all([
    supabase
      .from("platform_brand_profiles")
      .select(PLATFORM_BRAND_PROFILE_SELECT)
      .eq("owner_user_id", normalizedOwnerId)
      .maybeSingle()
      .returns<PlatformBrandProfileRow | null>(),
    supabase
      .from("platform_brand_assets")
      .select(PLATFORM_BRAND_ASSET_SELECT)
      .eq("owner_user_id", normalizedOwnerId)
      .neq("asset_type", "merch_product_image")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(50)
      .returns<PlatformBrandAssetRow[]>(),
  ]);

  if (options?.throwOnUnavailable && (profileResult.error || assetResult.error)) {
    throw new Error("Brand Studio could not be loaded. Please try again.");
  }

  const profile = parseProfile(profileResult.data, normalizedOwnerId);
  const assetRows = assetResult.error || !assetResult.data ? [] : [...assetResult.data];
  // The recent-media list is bounded, but a still-selected older asset must not
  // disappear from its preview or adjustment controls when more media is uploaded.
  const loadedIds = new Set(assetRows.map((row) => row.id));
  const missingSelectedIds = getProfileSelectedAssetIds(profile).filter((id) => !loadedIds.has(id));
  if (missingSelectedIds.length) {
    const selectedResult = await supabase
      .from("platform_brand_assets")
      .select(PLATFORM_BRAND_ASSET_SELECT)
      .eq("owner_user_id", normalizedOwnerId)
      .in("id", missingSelectedIds)
      .is("deleted_at", null)
      .returns<PlatformBrandAssetRow[]>();
    if (selectedResult.error && options?.throwOnUnavailable) {
      throw new Error("Selected Brand Studio media could not be loaded. Please try again.");
    }
    if (!selectedResult.error && selectedResult.data) assetRows.push(...selectedResult.data);
  }
  const assets = await Promise.all(assetRows.map((row) => parseAsset(row)));
  return createBundle(profile, assets);
}

export async function readPlatformBrandReviewQueue(limit = 24): Promise<PlatformBrandAsset[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 24)));
  const { data, error } = await supabase
    .from("platform_brand_assets")
    .select(PLATFORM_BRAND_ASSET_SELECT)
    .is("deleted_at", null)
    .in("moderation_status", ["pending_review", "rejected", "hidden"])
    .order("updated_at", { ascending: false })
    .limit(safeLimit)
    .returns<PlatformBrandAssetRow[]>();

  if (error || !data) return [];
  return Promise.all(data.map((row) => parseAsset(row)));
}

export async function readPublicPlatformBranding(ownerUserId: string, options?: { throwOnUnavailable?: boolean }): Promise<PlatformBrandingBundle | null> {
  const normalizedOwnerId = toText(ownerUserId);
  if (!normalizedOwnerId) return null;

  const { data: profileRow, error } = await supabase
    .rpc("read_public_platform_brand_profile", { profile_user_id: normalizedOwnerId })
    .maybeSingle();
  if (error) {
    if (options?.throwOnUnavailable) throw new Error("Platform appearance could not be loaded. Please try again.");
    return null;
  }
  if (!profileRow) return null;

  const profile = parseProfile(profileRow as PublicPlatformBrandProfileRow, normalizedOwnerId);
  const assetIds = Array.from(new Set([
    profile.heroImageAssetId,
    profile.heroVideoAssetId,
    profile.heroPosterAssetId,
    profile.backgroundImageAssetId,
    profile.avatarAssetId,
    profile.logoAssetId,
    profile.watermarkAssetId,
  ].filter(Boolean))) as string[];

  if (!assetIds.length) return createBundle(profile, []);

  const { data: assetRows, error: assetError } = await supabase
    .from("platform_brand_assets")
    .select(PLATFORM_BRAND_ASSET_SELECT)
    .in("id", assetIds)
    .eq("asset_state", "published")
    .in("moderation_status", ["clean", "reported"])
    .in("scan_status", PLATFORM_BRAND_PUBLIC_SCAN_STATUSES)
    .is("deleted_at", null)
    .returns<PlatformBrandAssetRow[]>();

  if (assetError && options?.throwOnUnavailable) throw new Error("Platform media could not be loaded. Please try again.");

  const assets = assetError || !assetRows
    ? []
    : await Promise.all(assetRows.map((row) => parseAsset(row)));
  if (options?.throwOnUnavailable && assets.some((asset) => !toText(asset.signedUrl))) {
    throw new Error("Platform media could not be loaded. Please try again.");
  }
  return createBundle(profile, assets);
}

export async function resolveBrandPublishReadbackStatus(
  ownerUserId: string,
  selectedAssetIds?: string[] | null,
): Promise<PlatformBrandPublishReadbackStatus> {
  const normalizedOwnerId = toText(ownerUserId);
  if (!normalizedOwnerId) {
    return {
      selectedAssetIds: [],
      selectedCount: 0,
      publicReadyCount: 0,
      publicReturnedCount: 0,
      waitingScanCount: 0,
      waitingReviewCount: 0,
      blockedCount: 0,
      notPublishedCount: 0,
      publicReadbackMissingCount: 0,
    };
  }

  const [studioBundle, publicBundle] = await Promise.all([
    readPlatformBrandStudio(normalizedOwnerId),
    readPublicPlatformBranding(normalizedOwnerId).catch(() => null),
  ]);
  const selectedIds = Array.from(new Set((selectedAssetIds?.length ? selectedAssetIds : getProfileSelectedAssetIds(studioBundle.profile))
    .map(toText)
    .filter(Boolean)));
  const selectedIdSet = new Set(selectedIds);
  const selectedAssets = studioBundle.assets.filter((asset) => selectedIdSet.has(asset.id));
  const publicAssetIds = new Set([
    ...getProfileSelectedAssetIds(publicBundle?.profile),
    ...(publicBundle?.assets ?? []).map((asset) => asset.id),
  ].map(toText).filter(Boolean));

  let waitingScanCount = 0;
  let waitingReviewCount = 0;
  let blockedCount = 0;
  let notPublishedCount = 0;
  let publicReadyCount = 0;

  selectedAssets.forEach((asset) => {
    const scanSafe = PLATFORM_BRAND_PUBLIC_SCAN_STATUSES.includes(asset.scanStatus);
    const moderationSafe = ["clean", "reported"].includes(asset.moderationStatus);
    const published = asset.assetState === "published";
    if (asset.deletedAt || ["malware_detected", "scan_failed", "quarantined"].includes(asset.scanStatus) || ["rejected", "hidden", "removed"].includes(asset.moderationStatus)) {
      blockedCount += 1;
      return;
    }
    if (!scanSafe) {
      waitingScanCount += 1;
      return;
    }
    if (!moderationSafe) {
      waitingReviewCount += 1;
      return;
    }
    if (!published) {
      notPublishedCount += 1;
      return;
    }
    publicReadyCount += 1;
  });

  const publicReturnedCount = selectedIds.filter((assetId) => publicAssetIds.has(assetId)).length;
  return {
    selectedAssetIds: selectedIds,
    selectedCount: selectedIds.length,
    publicReadyCount,
    publicReturnedCount,
    waitingScanCount,
    waitingReviewCount,
    blockedCount,
    notPublishedCount,
    publicReadbackMissingCount: Math.max(0, publicReadyCount - publicReturnedCount),
  };
}

const toProfileUpsert = (
  ownerUserId: string,
  patch: Partial<PlatformBrandProfile>,
): PlatformBrandProfileInsert => ({
  owner_user_id: ownerUserId,
  hero_image_asset_id: patch.heroImageAssetId === undefined ? undefined : patch.heroImageAssetId,
  hero_video_asset_id: patch.heroVideoAssetId === undefined ? undefined : patch.heroVideoAssetId,
  hero_poster_asset_id: patch.heroPosterAssetId === undefined ? undefined : patch.heroPosterAssetId,
  background_image_asset_id: patch.backgroundImageAssetId === undefined ? undefined : patch.backgroundImageAssetId,
  avatar_asset_id: patch.avatarAssetId === undefined ? undefined : patch.avatarAssetId,
  logo_asset_id: patch.logoAssetId === undefined ? undefined : patch.logoAssetId,
  watermark_asset_id: patch.watermarkAssetId === undefined ? undefined : patch.watermarkAssetId,
  spotlight_video_id: patch.spotlightVideoId === undefined ? undefined : patch.spotlightVideoId,
  theme_preset: patch.themePreset,
  accent_color: patch.accentColor,
  hero_fit_mode: patch.heroFitMode,
  hero_focal_x: patch.heroFocalX,
  hero_focal_y: patch.heroFocalY,
  hero_crop_scale: patch.heroCropScale,
  background_fit_mode: patch.backgroundFitMode,
  background_focal_x: patch.backgroundFocalX,
  background_focal_y: patch.backgroundFocalY,
  overlay_strength: patch.overlayStrength,
  blur_strength: patch.blurStrength,
  // Publication metadata is server-owned, including when saving a previously published draft.
  updated_at: new Date().toISOString(),
});

export async function savePlatformBrandProfileDraft(
  ownerUserId: string,
  patch: Partial<PlatformBrandProfile>,
): Promise<PlatformBrandProfile> {
  const normalizedOwnerId = toText(ownerUserId);
  if (!normalizedOwnerId) throw new Error("Sign in before saving Brand Studio changes.");

  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const assertCurrentOwner = () => {
    if (!authority || authority.state !== "ACTIVE" || authority.restoreOnly || authority.userId !== normalizedOwnerId
      || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) {
      throw new UserFacingError("brand_draft", "The signed-in account changed. Reopen Brand Studio before saving.");
    }
  };
  assertCurrentOwner();
  const subject = await captureAccountBoundSupabaseMutationSubject(normalizedOwnerId);
  assertCurrentOwner();
  // This read-only RPC and the separate public snapshot ship in the same
  // atomic Studio migration. Until that contract is available, an upsert to
  // an already published legacy row would change the visitor's presentation.
  // Do not cache this check or fall back to the old public/profile readers.
  const { data: identity, error: capabilityError } = await invokeAccountBoundSupabaseMutationRpc<{
    user_id?: string;
  }[]>(subject, "read_public_platform_identity", { profile_user_id: normalizedOwnerId });
  assertCurrentOwner();
  if (capabilityError || !Array.isArray(identity) || identity.length !== 1
    || toText(identity[0]?.user_id) !== normalizedOwnerId) {
    throw new UserFacingError("brand_draft", "Brand draft saving is temporarily unavailable. Your edits have not been saved. Please try again later.");
  }

  const payload = toProfileUpsert(normalizedOwnerId, patch);
  const { data, error } = await supabase
    .from("platform_brand_profiles")
    .upsert(payload, { onConflict: "owner_user_id" })
    .setHeader("Authorization", `Bearer ${subject.accessToken}`)
    .select(PLATFORM_BRAND_PROFILE_SELECT)
    .returns<PlatformBrandProfileRow>()
    .single();

  // A dispatched request may settle after navigation/session replacement.
  // Keep its initiating token and reject stale acknowledgement; do not claim
  // that this client-side check cancels a database write already in flight.
  assertCurrentOwner();
  if (error || !data) throw error ?? new Error("Unable to save Brand Studio changes.");
  return parseProfile(data, normalizedOwnerId);
}

export async function publishPlatformBrandProfile(
  ownerUserId: string,
  patch: Partial<PlatformBrandProfile>,
): Promise<PlatformBrandProfile> {
  const normalizedOwnerId = toText(ownerUserId);
  if (!normalizedOwnerId) throw new Error("Sign in before publishing Brand Studio changes.");
  const payload = toProfileUpsert(normalizedOwnerId, patch);
  // Publication is one owner-bound transaction. Client timestamps never publish a draft.
  delete payload.published_at;
  delete payload.updated_at;
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<Record<string, unknown>>(
    "publish_platform_brand_profile",
    { p_profile: payload },
    normalizedOwnerId,
  );
  if (String(error?.message ?? "").includes("brand_publish_asset_not_ready")) {
    throw new Error("Some selected media is not ready to publish. Your public Platform has not changed. Try again when the media is ready.");
  }
  if (error || !data || toText(data.owner_user_id) !== normalizedOwnerId || !toText(data.published_at)) {
    throw new Error("Brand Studio changes could not be published. Check your connection and try again.");
  }
  return parseProfile(data as PlatformBrandProfileRow, normalizedOwnerId);
}

// Retained only by the initiating screen/session, never persisted or shared.
export type PlatformBrandUploadAttempt = {
  fileUri?: string;
  payload?: PlatformBrandAssetInsert;
};

export async function uploadPlatformBrandAsset(input: {
  ownerUserId: string;
  assetType: PlatformBrandAssetType;
  file: PlatformBrandAssetFile;
  attempt?: PlatformBrandUploadAttempt;
  // A caller with an exact account-bound operation can freeze the upload token.
  accessToken?: string;
  assertOperationCurrent?: () => void;
}): Promise<PlatformBrandAsset> {
  input.assertOperationCurrent?.();
  const ownerUserId = toText(input.ownerUserId);
  if (!ownerUserId) throw new Error("Sign in before choosing Platform media.");
  const validationMessage = getPlatformBrandAssetValidationMessage(input.file, input.assetType);
  if (validationMessage) throw new Error(validationMessage);
  const accessToken = input.accessToken ?? await getSignedInAccessToken();
  input.assertOperationCurrent?.();

  const pending = input.attempt?.payload;
  if (pending && (pending.owner_user_id !== ownerUserId || pending.asset_type !== input.assetType
    || input.attempt?.fileUri !== input.file.uri)) {
    throw new Error("The Platform media source changed before this upload could be retried.");
  }
  const id = pending?.id ?? createClientId();
  let mimeType = pending?.mime_type ?? inferMimeType(input.file, input.assetType);
  let storagePath = pending?.storage_path ?? `${ownerUserId}/${input.assetType}/${id}.${getFileExtension(input.file, input.assetType)}`;
  let fileSizeBytes = pending?.file_size_bytes ?? Math.max(0, Number(input.file.size ?? 0) || 0);
  if (!pending) {
    const prepared = await preparePlatformBrandUploadUri(input.file, input.assetType);
    try {
      input.assertOperationCurrent?.();
      mimeType = inferMimeType(prepared.file, input.assetType);
      storagePath = `${ownerUserId}/${input.assetType}/${id}.${getFileExtension(prepared.file, input.assetType)}`;
      fileSizeBytes = await getPreparedPlatformBrandFileSize(prepared.uri, prepared.file.size);
      const preparedValidation = getPlatformBrandAssetValidationMessage({ ...prepared.file, size: fileSizeBytes }, input.assetType);
      if (preparedValidation) throw new Error(preparedValidation);
      input.assertOperationCurrent?.();
      await uploadPlatformBrandFileToStorage({ storagePath, uri: prepared.uri, mimeType,
        accessToken, assertOperationCurrent: input.assertOperationCurrent });
      input.assertOperationCurrent?.();
    } finally {
      await prepared.cleanup();
    }
  }
  input.assertOperationCurrent?.();

  const payload: PlatformBrandAssetInsert = pending ?? {
    id,
    owner_user_id: ownerUserId,
    asset_type: input.assetType,
    asset_state: "draft",
    storage_provider: "supabase",
    storage_bucket: PLATFORM_BRAND_BUCKET,
    storage_object_key: storagePath,
    storage_path: storagePath,
    mime_type: mimeType,
    file_size_bytes: fileSizeBytes,
    original_file_name: toText(input.file.name) || null,
    moderation_status: "pending_review",
    updated_at: new Date().toISOString(),
  };
  if (input.attempt) {
    input.attempt.fileUri = input.file.uri;
    input.attempt.payload = payload;
  }

  const matchesUpload = (row: PlatformBrandAssetRow | null | undefined) => !!row
    && row.id === id && row.owner_user_id === ownerUserId
    && row.asset_type === input.assetType && row.storage_provider === "supabase"
    && row.storage_bucket === PLATFORM_BRAND_BUCKET
    && row.storage_object_key === storagePath && row.storage_path === storagePath
    && row.deleted_at === null;
  const readUpload = async () => {
    input.assertOperationCurrent?.();
    const result = await supabase.from("platform_brand_assets")
      .select(PLATFORM_BRAND_ASSET_SELECT)
      .eq("id", id).eq("owner_user_id", ownerUserId)
      .setHeader("Authorization", `Bearer ${accessToken}`)
      .maybeSingle().returns<PlatformBrandAssetRow | null>();
    input.assertOperationCurrent?.();
    return result;
  };
  const unconfirmed = () => new Error("Platform media registration could not be confirmed. Retry to check the same upload.");
  let data: PlatformBrandAssetRow | null = null;
  if (pending) {
    const readback = await readUpload();
    if (readback.error || (readback.data !== null && !matchesUpload(readback.data))) throw unconfirmed();
    data = readback.data;
  }

  // Registration captures the uploaded object's immutable incarnation and
  // queues scanning. Private storage SELECT requires this row, so signing (or
  // range-reading) before registration can never verify a new upload.
  if (!data) {
    input.assertOperationCurrent?.();
    const { data: insertedData, error } = await Promise.resolve(supabase
      .from("platform_brand_assets")
      .insert(payload)
      .setHeader("Authorization", `Bearer ${accessToken}`)
      .select(PLATFORM_BRAND_ASSET_SELECT)
      .returns<PlatformBrandAssetRow>()
      .single())
      .catch((error: unknown) => ({ data: null, error }));
    input.assertOperationCurrent?.();
    data = insertedData;
    if (error || !matchesUpload(data)) {
      // A lost acknowledgement does not prove the transaction failed. Never
      // delete these bytes or create a replacement row on that inference.
      const readback = await readUpload();
      if (readback.error || !matchesUpload(readback.data)) throw unconfirmed();
      data = readback.data;
    }
  }

  // Preview failure is not registration failure. parseAsset may return an
  // empty signed URL; neither this nor successful signing marks media clean
  // or publishes it. Only the scanner and publication gates establish safety.
  const asset = await parseAsset(data!);
  input.assertOperationCurrent?.();
  return asset;
}

// A bounded recent-media list cannot prove deletion by omission. Only this
// exact owner-scoped tombstone read can reconcile an uncertain acknowledgement.
export async function readPlatformBrandAssetRemovalStatus(asset: PlatformBrandAsset): Promise<"removed" | "present" | "unknown"> {
  const ownerId = toText(asset.ownerUserId);
  const assetId = toText(asset.id);
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const isCurrent = () => !!authority && authority.state === "ACTIVE" && !authority.restoreOnly
    && authority.userId === ownerId
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  if (!assetId || !ownerId || !isCurrent()) return "unknown";
  const { data, error } = await supabase.from("platform_brand_assets")
    .select("id,owner_user_id,deleted_at,asset_state")
    .eq("id", assetId).eq("owner_user_id", ownerId).maybeSingle();
  if (!isCurrent() || error || !data || data.id !== assetId || data.owner_user_id !== ownerId) return "unknown";
  if (data.deleted_at === null) return "present";
  return data.asset_state === "archived" && typeof data.deleted_at === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.deleted_at) && Number.isFinite(Date.parse(data.deleted_at)) ? "removed" : "unknown";
}

export async function removePlatformBrandAsset(asset: PlatformBrandAsset): Promise<void> {
  const assetId = toText(asset.id);
  if (!assetId) return;
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<{ assetId?: string; deletedAt?: string }>(
    "remove_platform_brand_asset", { p_asset_id: assetId }, asset.ownerUserId,
  );
  if (error) {
    if (error.message === "brand_asset_in_use") {
      throw new UserFacingError("brand_draft", "Remove this media from your Platform design and publish the change before deleting it.");
    }
    throw error;
  }
  if (toText(data?.assetId) !== assetId || typeof data?.deletedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.deletedAt) || !Number.isFinite(Date.parse(data.deletedAt))) {
    throw new Error("Platform media could not be removed. Please try again.");
  }
}

const parsePlatformBrandReviewResult = (value: unknown): PlatformBrandReviewResult => {
  const row = isRecord(value) ? value : {};
  return {
    id: toText(row.id),
    ownerUserId: toText(row.ownerUserId),
    assetType: normalizeAssetType(row.assetType),
    assetState: normalizeAssetState(row.assetState),
    moderationStatus: normalizeModerationStatus(row.moderationStatus),
    moderationReason: toText(row.moderationReason) || null,
    moderatedAt: toText(row.moderatedAt) || null,
    reviewEventId: toText(row.reviewEventId) || null,
  };
};

export async function reviewPlatformBrandAsset(
  assetId: string,
  action: PlatformBrandReviewAction,
  reason?: string | null,
): Promise<PlatformBrandReviewResult> {
  const normalizedAssetId = toText(assetId);
  if (!normalizedAssetId) throw new Error("Choose a Platform asset before reviewing it.");

  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("review_platform_brand_asset", {
    p_asset_id: normalizedAssetId,
    p_action: action,
    p_reason: toText(reason) || null,
  });

  if (error) throw error;
  return parsePlatformBrandReviewResult(data);
}
