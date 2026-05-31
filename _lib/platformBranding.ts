import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

import type { Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "./supabase";

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
  | "watermark";

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
type PlatformBrandAssetUpdate = TablesUpdate<"platform_brand_assets">;
type PlatformBrandProfileRow = Tables<"platform_brand_profiles">;
type PlatformBrandProfileInsert = TablesInsert<"platform_brand_profiles">;
type PlatformBrandProfileUpdate = TablesUpdate<"platform_brand_profiles">;

type PublicPlatformBrandProfileRow = Omit<PlatformBrandProfileRow, "created_at">;

const PLATFORM_BRAND_ASSET_SELECT =
  "id,owner_user_id,asset_type,asset_state,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,width,height,duration_ms,file_size_bytes,original_file_name,moderation_status,moderation_reason,moderated_at,moderated_by,scan_status,scan_provider,scan_result,scanned_at,quarantined_at,created_at,updated_at,deleted_at";

const PLATFORM_BRAND_PROFILE_SELECT =
  "owner_user_id,hero_image_asset_id,hero_video_asset_id,hero_poster_asset_id,background_image_asset_id,avatar_asset_id,logo_asset_id,watermark_asset_id,spotlight_video_id,theme_preset,accent_color,hero_fit_mode,hero_focal_x,hero_focal_y,hero_crop_scale,background_fit_mode,background_focal_x,background_focal_y,overlay_strength,blur_strength,published_at,created_at,updated_at";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const PLATFORM_BRAND_UPLOAD_TIMEOUT_MS = 120000;

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
  if (videoAsset ? !VIDEO_MIME_TYPES.has(mimeType) : !IMAGE_MIME_TYPES.has(mimeType)) {
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
  if (asset.assetState === "published" && ["clean", "reported"].includes(asset.moderationStatus)) return "Published";
  if (asset.assetState === "draft" && ["clean", "reported"].includes(asset.moderationStatus)) return "Approved";
  if (asset.moderationStatus === "pending_review") return "Needs review";
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
    .createSignedUrl(path, PLATFORM_BRAND_SIGNED_URL_SECONDS);
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

async function preparePlatformBrandUploadUri(file: PlatformBrandAssetFile, assetType: PlatformBrandAssetType) {
  const sourceUri = toText(file.uri);
  if (!sourceUri) throw new Error("Choose a Platform asset first.");

  if (!sourceUri.startsWith("content://") || !FileSystem.cacheDirectory) {
    return { uri: sourceUri, cleanup: async () => undefined };
  }

  const cacheUri = `${FileSystem.cacheDirectory}platform-brand-${createClientId()}.${getFileExtension(file, assetType)}`;
  await withTimeout(
    FileSystem.copyAsync({ from: sourceUri, to: cacheUri }),
    20000,
    "Platform media took too long to prepare. Try again.",
  );

  return {
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
}) {
  const accessToken = await getSignedInAccessToken();
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
    if (result.status >= 200 && result.status < 300) return;
  } catch {
    // Fall back to the SDK path below; some platforms handle Expo File bodies better than uploadAsync.
  }

  const localFile = new File(input.uri);
  const upload = await supabase.storage
    .from(PLATFORM_BRAND_BUCKET)
    .upload(input.storagePath, localFile as unknown as Blob, {
      contentType: input.mimeType,
      upsert: false,
    });
  if (upload.error) throw upload.error;
}

async function assertPlatformBrandUploadReadable(storagePath: string, expectedSize: number) {
  if (expectedSize <= 0) return;
  const { data, error } = await supabase.storage
    .from(PLATFORM_BRAND_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) throw new Error("Platform media could not be verified after upload.");

  const response = await withTimeout(
    fetch(data.signedUrl, { headers: { Range: "bytes=0-0" } }),
    20000,
    "Platform media verification took too long. Try again.",
  );
  if (!response.ok) throw new Error("Platform media could not be verified after upload.");
  const body = await response.arrayBuffer();
  if (body.byteLength <= 0) throw new Error("Platform media could not be verified after upload.");
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

export async function readPlatformBrandStudio(ownerUserId: string): Promise<PlatformBrandingBundle> {
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
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(50)
      .returns<PlatformBrandAssetRow[]>(),
  ]);

  const profile = parseProfile(profileResult.data, normalizedOwnerId);
  const assets = assetResult.error || !assetResult.data
    ? []
    : await Promise.all(assetResult.data.map((row) => parseAsset(row)));
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

export async function readPublicPlatformBranding(ownerUserId: string): Promise<PlatformBrandingBundle | null> {
  const normalizedOwnerId = toText(ownerUserId);
  if (!normalizedOwnerId) return null;

  const { data: profileRow, error } = await supabase
    .rpc("read_public_platform_brand_profile", { profile_user_id: normalizedOwnerId })
    .maybeSingle();
  if (error || !profileRow) return null;

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
    .is("deleted_at", null)
    .returns<PlatformBrandAssetRow[]>();

  const assets = assetError || !assetRows
    ? []
    : await Promise.all(assetRows.map((row) => parseAsset(row)));
  return createBundle(profile, assets);
}

const toProfileUpsert = (
  ownerUserId: string,
  patch: Partial<PlatformBrandProfile>,
): PlatformBrandProfileInsert => ({
  owner_user_id: ownerUserId,
  hero_image_asset_id: patch.heroImageAssetId ?? undefined,
  hero_video_asset_id: patch.heroVideoAssetId ?? undefined,
  hero_poster_asset_id: patch.heroPosterAssetId ?? undefined,
  background_image_asset_id: patch.backgroundImageAssetId ?? undefined,
  avatar_asset_id: patch.avatarAssetId ?? undefined,
  logo_asset_id: patch.logoAssetId ?? undefined,
  watermark_asset_id: patch.watermarkAssetId ?? undefined,
  spotlight_video_id: patch.spotlightVideoId ?? undefined,
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
  published_at: patch.publishedAt ?? undefined,
  updated_at: new Date().toISOString(),
});

export async function savePlatformBrandProfileDraft(
  ownerUserId: string,
  patch: Partial<PlatformBrandProfile>,
): Promise<PlatformBrandProfile> {
  const normalizedOwnerId = toText(ownerUserId);
  if (!normalizedOwnerId) throw new Error("Sign in before saving Brand Studio changes.");

  const payload = toProfileUpsert(normalizedOwnerId, patch);
  const { data, error } = await supabase
    .from("platform_brand_profiles")
    .upsert(payload, { onConflict: "owner_user_id" })
    .select(PLATFORM_BRAND_PROFILE_SELECT)
    .returns<PlatformBrandProfileRow>()
    .single();

  if (error || !data) throw error ?? new Error("Unable to save Brand Studio changes.");
  return parseProfile(data, normalizedOwnerId);
}

export async function publishPlatformBrandProfile(
  ownerUserId: string,
  patch: Partial<PlatformBrandProfile>,
): Promise<PlatformBrandProfile> {
  const normalizedOwnerId = toText(ownerUserId);
  const publishedAt = new Date().toISOString();
  const profile = await savePlatformBrandProfileDraft(normalizedOwnerId, {
    ...patch,
    publishedAt,
  });
  const assetIds = Array.from(new Set([
    profile.heroImageAssetId,
    profile.heroVideoAssetId,
    profile.heroPosterAssetId,
    profile.backgroundImageAssetId,
    profile.avatarAssetId,
    profile.logoAssetId,
    profile.watermarkAssetId,
  ].filter(Boolean))) as string[];

  if (assetIds.length) {
    await supabase
      .from("platform_brand_assets")
      .update({ asset_state: "published" } satisfies PlatformBrandAssetUpdate)
      .eq("owner_user_id", normalizedOwnerId)
      .in("id", assetIds)
      .in("moderation_status", ["clean", "reported"])
      .is("deleted_at", null);
  }

  return profile;
}

export async function uploadPlatformBrandAsset(input: {
  ownerUserId: string;
  assetType: PlatformBrandAssetType;
  file: PlatformBrandAssetFile;
}): Promise<PlatformBrandAsset> {
  const ownerUserId = toText(input.ownerUserId);
  if (!ownerUserId) throw new Error("Sign in before choosing Platform media.");
  const validationMessage = getPlatformBrandAssetValidationMessage(input.file, input.assetType);
  if (validationMessage) throw new Error(validationMessage);

  const id = createClientId();
  const mimeType = inferMimeType(input.file, input.assetType);
  const extension = getFileExtension(input.file, input.assetType);
  const storagePath = `${ownerUserId}/${input.assetType}/${id}.${extension}`;
  const prepared = await preparePlatformBrandUploadUri(input.file, input.assetType);

  let fileSizeBytes = Math.max(0, Number(input.file.size ?? 0) || 0);
  try {
    fileSizeBytes = await getPreparedPlatformBrandFileSize(prepared.uri, fileSizeBytes);
    await uploadPlatformBrandFileToStorage({
      storagePath,
      uri: prepared.uri,
      mimeType,
    });
    await assertPlatformBrandUploadReadable(storagePath, fileSizeBytes);
  } finally {
    await prepared.cleanup();
  }

  const payload: PlatformBrandAssetInsert = {
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

  const { data, error } = await supabase
    .from("platform_brand_assets")
    .insert(payload)
    .select(PLATFORM_BRAND_ASSET_SELECT)
    .returns<PlatformBrandAssetRow>()
    .single();

  if (error || !data) {
    await supabase.storage.from(PLATFORM_BRAND_BUCKET).remove([storagePath]).catch(() => undefined);
    throw error ?? new Error("Unable to save Platform media right now.");
  }

  return parseAsset(data);
}

export async function removePlatformBrandAsset(asset: PlatformBrandAsset): Promise<void> {
  const assetId = toText(asset.id);
  if (!assetId) return;
  const update: PlatformBrandAssetUpdate = {
    asset_state: "archived",
    deleted_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("platform_brand_assets")
    .update(update)
    .eq("id", assetId)
    .eq("owner_user_id", asset.ownerUserId);
  if (error) throw error;
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

  const rpc = supabase.rpc as unknown as (
    fn: "review_platform_brand_asset",
    args: { p_asset_id: string; p_action: string; p_reason: string | null },
  ) => Promise<{ data: unknown; error: Error | null }>;

  const { data, error } = await rpc("review_platform_brand_asset", {
    p_asset_id: normalizedAssetId,
    p_action: action,
    p_reason: toText(reason) || null,
  });

  if (error) throw error;
  return parsePlatformBrandReviewResult(data);
}
