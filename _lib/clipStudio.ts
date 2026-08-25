import * as FileSystem from "expo-file-system/legacy";

import type { Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";
import { CREATOR_VIDEO_BUCKET, formatCreatorVideoFileSize, type CreatorVideoFile } from "./creatorVideos";
import {
  deleteStoredMediaObject,
  getMediaStorageProviderBucket,
  normalizeMediaStorageProvider,
  uploadFileToMediaStorage,
  usesPrivateOriginMediaGateway,
} from "./mediaStorage";
import { supabase } from "./supabase";

export const CLIP_STUDIO_COVER_MAX_BYTES = 20 * 1024 * 1024;
export const CLIP_STUDIO_TITLE_OVERLAY_MAX_LENGTH = 80;
export const CLIP_STUDIO_SUBTITLE_OVERLAY_MAX_LENGTH = 140;

export type ClipStudioFormat = "vertical_9_16" | "square_1_1" | "landscape_16_9";
export type ClipStudioFitMode = "fill" | "fit" | "center";
export type ClipStudioOverlayPosition = "top" | "center" | "bottom";
export type ClipStudioOverlayStyle = "clean" | "bold" | "spotlight" | "trailer";
export type ClipStudioTemplatePreset =
  | "trailer"
  | "highlight"
  | "promo"
  | "event"
  | "reaction"
  | "platform_intro";

export type ClipStudioEdit = {
  videoId: string;
  ownerUserId: string;
  clipFormat: ClipStudioFormat;
  fitMode: ClipStudioFitMode;
  trimStartMs: number | null;
  trimEndMs: number | null;
  coverStoragePath: string | null;
  coverMimeType: string | null;
  coverFileSizeBytes: number | null;
  titleOverlayText: string;
  titleOverlaySubtitle: string;
  titleOverlayPosition: ClipStudioOverlayPosition;
  titleOverlayStyle: ClipStudioOverlayStyle;
  templatePreset: ClipStudioTemplatePreset;
  brandMarkEnabled: boolean;
  brandAssetId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClipStudioEditPatch = Partial<
  Pick<
    ClipStudioEdit,
    | "clipFormat"
    | "fitMode"
    | "trimStartMs"
    | "trimEndMs"
    | "coverStoragePath"
    | "coverMimeType"
    | "coverFileSizeBytes"
    | "titleOverlayText"
    | "titleOverlaySubtitle"
    | "titleOverlayPosition"
    | "titleOverlayStyle"
    | "templatePreset"
    | "brandMarkEnabled"
    | "brandAssetId"
  >
>;

export type ClipStudioCoverUpload = {
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  signedUrl: string;
};

export type ClipStudioTemplatePresetConfig = {
  preset: ClipStudioTemplatePreset;
  titleOverlayStyle: ClipStudioOverlayStyle;
  titleOverlayPosition: ClipStudioOverlayPosition;
  clipFormat: ClipStudioFormat;
  fitMode: ClipStudioFitMode;
  coverLayoutSuggestion: string;
  formatSuggestion: string;
};

type ClipStudioEditRow = Tables<"creator_clip_edits">;
type ClipStudioEditInsert = TablesInsert<"creator_clip_edits">;
type ClipStudioEditUpdate = TablesUpdate<"creator_clip_edits">;
type CreatorVideoOwnerRow = Pick<
  Tables<"videos">,
  "id" | "owner_id" | "thumb_storage_path" | "storage_provider" | "storage_bucket"
>;

const CLIP_STUDIO_EDIT_SELECT =
  "video_id,owner_user_id,clip_format,fit_mode,trim_start_ms,trim_end_ms,cover_storage_path,cover_mime_type,cover_file_size_bytes,title_overlay_text,title_overlay_subtitle,title_overlay_position,title_overlay_style,template_preset,brand_mark_enabled,brand_asset_id,created_at,updated_at";

const COVER_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CLIP_STUDIO_COVER_UPLOAD_TIMEOUT_MS = 30000;

const toText = (value: unknown) => String(value ?? "").trim();

const createClientId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const next = char === "x" ? rand : (rand & 0x3) | 0x8;
    return next.toString(16);
  });

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

async function prepareCoverUploadUri(file: CreatorVideoFile): Promise<{ uri: string; cleanup: () => Promise<void> }> {
  const normalizedUri = toText(file.uri);
  if (!normalizedUri.startsWith("content://") || !FileSystem.cacheDirectory) {
    return { uri: normalizedUri, cleanup: async () => undefined };
  }

  const cacheUri = `${FileSystem.cacheDirectory}clip-cover-${createClientId()}.${getCoverExtension(file)}`;
  await withTimeout(
    FileSystem.copyAsync({ from: normalizedUri, to: cacheUri }),
    CLIP_STUDIO_COVER_UPLOAD_TIMEOUT_MS,
    "Cover image preparation took too long. Try again.",
  );

  return {
    uri: cacheUri,
    cleanup: async () => {
      await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => undefined);
    },
  };
}

const getExtensionFromName = (name?: string | null) => {
  const normalized = toText(name).toLowerCase();
  if (!normalized.includes(".")) return "";
  return normalized.split(".").pop()?.replace(/[^a-z0-9]/g, "") ?? "";
};

const inferCoverMimeType = (file: CreatorVideoFile) => {
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
    default:
      return "image/jpeg";
  }
};

const getCoverExtension = (file: CreatorVideoFile) => {
  const extension = getExtensionFromName(file.name);
  if (extension === "jpeg") return "jpg";
  if (extension) return extension;
  const mimeType = inferCoverMimeType(file);
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
};

export const getClipStudioCoverLimitLabel = () =>
  formatCreatorVideoFileSize(CLIP_STUDIO_COVER_MAX_BYTES) || "20 MB";

export const getClipStudioCoverValidationMessage = (file: CreatorVideoFile | null | undefined) => {
  if (!file || !toText(file.uri)) return "Choose a cover image first.";
  const mimeType = inferCoverMimeType(file);
  if (!COVER_IMAGE_MIME_TYPES.has(mimeType)) {
    return "Choose a JPG, PNG, or WebP cover image.";
  }

  const size = Number(file.size ?? 0);
  if (Number.isFinite(size) && size > CLIP_STUDIO_COVER_MAX_BYTES) {
    return `This cover is ${formatCreatorVideoFileSize(size)}. Cover images support up to ${getClipStudioCoverLimitLabel()}.`;
  }
  return null;
};

export const getClipStudioTitleOverlayValidationMessage = (title: unknown, subtitle: unknown) => {
  const normalizedTitle = toText(title);
  const normalizedSubtitle = toText(subtitle);
  if (normalizedTitle.length > CLIP_STUDIO_TITLE_OVERLAY_MAX_LENGTH) {
    return `Keep the title card title to ${CLIP_STUDIO_TITLE_OVERLAY_MAX_LENGTH} characters or fewer.`;
  }
  if (normalizedSubtitle.length > CLIP_STUDIO_SUBTITLE_OVERLAY_MAX_LENGTH) {
    return `Keep the title card subtitle to ${CLIP_STUDIO_SUBTITLE_OVERLAY_MAX_LENGTH} characters or fewer.`;
  }
  return null;
};

export const normalizeClipStudioFormat = (value: unknown): ClipStudioFormat => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "square_1_1" || normalized === "landscape_16_9") return normalized;
  return "vertical_9_16";
};

export const normalizeClipStudioFitMode = (value: unknown): ClipStudioFitMode => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "fit" || normalized === "center") return normalized;
  return "fill";
};

export const normalizeClipStudioOverlayPosition = (value: unknown): ClipStudioOverlayPosition => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "top" || normalized === "center") return normalized;
  return "bottom";
};

export const normalizeClipStudioOverlayStyle = (value: unknown): ClipStudioOverlayStyle => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "bold" || normalized === "spotlight" || normalized === "trailer") return normalized;
  return "clean";
};

export const normalizeClipStudioTemplatePreset = (value: unknown): ClipStudioTemplatePreset => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "trailer"
    || normalized === "promo"
    || normalized === "event"
    || normalized === "reaction"
    || normalized === "platform_intro"
  ) {
    return normalized;
  }
  return "highlight";
};

export const formatClipStudioFormatLabel = (format: ClipStudioFormat) => {
  if (format === "square_1_1") return "Square 1:1";
  if (format === "landscape_16_9") return "Landscape 16:9";
  return "Vertical 9:16";
};

export const formatClipStudioTemplateLabel = (preset: ClipStudioTemplatePreset) => {
  switch (preset) {
    case "trailer":
      return "Trailer";
    case "promo":
      return "Promo";
    case "event":
      return "Event";
    case "reaction":
      return "Reaction";
    case "platform_intro":
      return "Platform Intro";
    default:
      return "Highlight";
  }
};

export const getClipStudioTemplatePresetConfig = (
  preset: unknown,
): ClipStudioTemplatePresetConfig => {
  const normalizedPreset = normalizeClipStudioTemplatePreset(preset);
  switch (normalizedPreset) {
    case "trailer":
      return {
        preset: "trailer",
        titleOverlayStyle: "trailer",
        titleOverlayPosition: "center",
        clipFormat: "landscape_16_9",
        fitMode: "fill",
        coverLayoutSuggestion: "Centered title with a cinematic cover crop.",
        formatSuggestion: "Landscape 16:9",
      };
    case "promo":
      return {
        preset: "promo",
        titleOverlayStyle: "bold",
        titleOverlayPosition: "bottom",
        clipFormat: "vertical_9_16",
        fitMode: "fill",
        coverLayoutSuggestion: "Strong lower title over a phone-first cover.",
        formatSuggestion: "Vertical 9:16",
      };
    case "event":
      return {
        preset: "event",
        titleOverlayStyle: "spotlight",
        titleOverlayPosition: "top",
        clipFormat: "landscape_16_9",
        fitMode: "fit",
        coverLayoutSuggestion: "Top title with room for venue or stage visuals.",
        formatSuggestion: "Landscape 16:9",
      };
    case "reaction":
      return {
        preset: "reaction",
        titleOverlayStyle: "clean",
        titleOverlayPosition: "bottom",
        clipFormat: "vertical_9_16",
        fitMode: "fit",
        coverLayoutSuggestion: "Readable lower title while keeping the subject visible.",
        formatSuggestion: "Vertical 9:16",
      };
    case "platform_intro":
      return {
        preset: "platform_intro",
        titleOverlayStyle: "spotlight",
        titleOverlayPosition: "center",
        clipFormat: "square_1_1",
        fitMode: "center",
        coverLayoutSuggestion: "Centered title for a branded intro card.",
        formatSuggestion: "Square 1:1",
      };
    default:
      return {
        preset: "highlight",
        titleOverlayStyle: "clean",
        titleOverlayPosition: "bottom",
        clipFormat: "vertical_9_16",
        fitMode: "fill",
        coverLayoutSuggestion: "Simple lower title over the selected cover.",
        formatSuggestion: "Vertical 9:16",
      };
  }
};

const parseClipEdit = (row: ClipStudioEditRow): ClipStudioEdit => ({
  videoId: toText(row.video_id),
  ownerUserId: toText(row.owner_user_id),
  clipFormat: normalizeClipStudioFormat(row.clip_format),
  fitMode: normalizeClipStudioFitMode(row.fit_mode),
  trimStartMs: typeof row.trim_start_ms === "number" ? row.trim_start_ms : null,
  trimEndMs: typeof row.trim_end_ms === "number" ? row.trim_end_ms : null,
  coverStoragePath: toText(row.cover_storage_path) || null,
  coverMimeType: toText(row.cover_mime_type) || null,
  coverFileSizeBytes: typeof row.cover_file_size_bytes === "number" ? row.cover_file_size_bytes : null,
  titleOverlayText: toText(row.title_overlay_text),
  titleOverlaySubtitle: toText(row.title_overlay_subtitle),
  titleOverlayPosition: normalizeClipStudioOverlayPosition(row.title_overlay_position),
  titleOverlayStyle: normalizeClipStudioOverlayStyle(row.title_overlay_style),
  templatePreset: normalizeClipStudioTemplatePreset(row.template_preset),
  brandMarkEnabled: row.brand_mark_enabled === true,
  brandAssetId: toText(row.brand_asset_id) || null,
  createdAt: toText(row.created_at) || new Date().toISOString(),
  updatedAt: toText(row.updated_at) || toText(row.created_at) || new Date().toISOString(),
});

async function getRequiredUserId() {
  const { data, error } = await supabase.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId) throw new Error("Sign in before using Clip Studio.");
  return userId;
}

const toUpsertPayload = (ownerUserId: string, videoId: string, patch: ClipStudioEditPatch): ClipStudioEditInsert => ({
  video_id: videoId,
  owner_user_id: ownerUserId,
  clip_format: normalizeClipStudioFormat(patch.clipFormat),
  fit_mode: normalizeClipStudioFitMode(patch.fitMode),
  trim_start_ms: patch.trimStartMs ?? null,
  trim_end_ms: patch.trimEndMs ?? null,
  cover_storage_path: patch.coverStoragePath ?? null,
  cover_mime_type: patch.coverMimeType ?? null,
  cover_file_size_bytes: patch.coverFileSizeBytes ?? null,
  title_overlay_text: toText(patch.titleOverlayText) || null,
  title_overlay_subtitle: toText(patch.titleOverlaySubtitle) || null,
  title_overlay_position: normalizeClipStudioOverlayPosition(patch.titleOverlayPosition),
  title_overlay_style: normalizeClipStudioOverlayStyle(patch.titleOverlayStyle),
  template_preset: normalizeClipStudioTemplatePreset(patch.templatePreset),
  brand_mark_enabled: patch.brandMarkEnabled === true,
  brand_asset_id: patch.brandAssetId ?? null,
  updated_at: new Date().toISOString(),
});

export async function readClipStudioEdit(videoId: string): Promise<ClipStudioEdit | null> {
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) return null;

  const { data, error } = await supabase
    .from("creator_clip_edits")
    .select(CLIP_STUDIO_EDIT_SELECT)
    .eq("video_id", normalizedVideoId)
    .maybeSingle()
    .returns<ClipStudioEditRow | null>();

  if (error || !data) return null;
  return parseClipEdit(data);
}

export async function readClipStudioEditsForVideos(videoIds: string[]): Promise<Map<string, ClipStudioEdit>> {
  const normalizedVideoIds = Array.from(new Set(videoIds.map(toText).filter(Boolean))).slice(0, 100);
  if (!normalizedVideoIds.length) return new Map();

  const { data, error } = await supabase
    .from("creator_clip_edits")
    .select(CLIP_STUDIO_EDIT_SELECT)
    .in("video_id", normalizedVideoIds)
    .returns<ClipStudioEditRow[]>();

  if (error || !data) return new Map();
  return new Map(data.map((row) => {
    const edit = parseClipEdit(row);
    return [edit.videoId, edit];
  }));
}

export async function saveClipStudioEdit(
  videoId: string,
  patch: ClipStudioEditPatch,
): Promise<ClipStudioEdit> {
  const ownerUserId = await getRequiredUserId();
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) throw new Error("Choose or save a video before saving Clip Studio settings.");

  const payload = toUpsertPayload(ownerUserId, normalizedVideoId, patch);
  const { data, error } = await supabase
    .from("creator_clip_edits")
    .upsert(payload, { onConflict: "video_id" })
    .select(CLIP_STUDIO_EDIT_SELECT)
    .returns<ClipStudioEditRow>()
    .single();

  if (error || !data) throw error ?? new Error("Unable to save Clip Studio settings.");
  return parseClipEdit(data);
}

export async function uploadClipStudioCoverImage(input: {
  videoId: string;
  file: CreatorVideoFile;
}): Promise<ClipStudioCoverUpload> {
  const ownerUserId = await getRequiredUserId();
  const normalizedVideoId = toText(input.videoId);
  if (!normalizedVideoId) throw new Error("Save the video before choosing a cover image.");

  const validationMessage = getClipStudioCoverValidationMessage(input.file);
  if (validationMessage) throw new Error(validationMessage);

  const { data: videoRow, error: videoError } = await supabase
    .from("videos")
    .select("id,owner_id,thumb_storage_path,storage_provider,storage_bucket")
    .eq("id", normalizedVideoId)
    .single()
    .returns<CreatorVideoOwnerRow>();
  if (videoError || !videoRow || toText(videoRow.owner_id) !== ownerUserId) {
    throw new Error("This account cannot update that creator video cover.");
  }

  const mimeType = inferCoverMimeType(input.file);
  const storagePath = `${ownerUserId}/${normalizedVideoId}/cover-${createClientId()}.${getCoverExtension(input.file)}`;
  const preparedCover = await prepareCoverUploadUri(input.file);
  // Newly uploaded covers are malware-pending. Use the already-selected local
  // image for the immediate editor preview; remote delivery remains blocked
  // until the exact cover scan job is clean.
  const signedUrl = toText(input.file.uri);
  let uploadedObject: Awaited<ReturnType<typeof uploadFileToMediaStorage>> | null = null;

  try {
    uploadedObject = await uploadFileToMediaStorage({
      surfaceType: "creator_video",
      objectKey: storagePath,
      uri: preparedCover.uri,
      mimeType,
      fileName: input.file.name,
      sizeBytes: input.file.size,
      maximumSizeBytes: CLIP_STUDIO_COVER_MAX_BYTES,
      tooLargeMessage: `Cover images support up to ${getClipStudioCoverLimitLabel()}.`,
    });
  } catch (error) {
    if (uploadedObject) {
      await deleteStoredMediaObject({
        surfaceType: "creator_video",
        provider: uploadedObject.provider,
        bucket: uploadedObject.bucket,
        objectKey: uploadedObject.objectKey,
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    await preparedCover.cleanup();
  }
  if (!uploadedObject) throw new Error("Cover upload failed. Try again.");

  const previousCoverPath = toText(videoRow.thumb_storage_path);
  let coverMetadataCommitted = false;
  try {
    const update: TablesUpdate<"videos"> = {
      thumb_storage_path: uploadedObject.objectKey,
      thumb_url: null,
      updated_at: new Date().toISOString(),
    };
    const updateRequest = supabase
      .from("videos")
      .update(update)
      .eq("id", normalizedVideoId);
    const guardedUpdateRequest = previousCoverPath
      ? updateRequest.eq("thumb_storage_path", previousCoverPath)
      : updateRequest.is("thumb_storage_path", null);
    const { data: updatedVideo, error: updateError } = await guardedUpdateRequest
      .select("thumb_storage_path")
      .single()
      .returns<{ thumb_storage_path: string | null }>();
    if (updateError || toText(updatedVideo?.thumb_storage_path) !== uploadedObject.objectKey) {
      throw updateError ?? new Error("The creator video cover changed before this upload completed.");
    }
    coverMetadataCommitted = true;
  } catch (error) {
    // A response can fail after Postgres commits. Re-read before deleting the
    // new object so a lost response cannot leave the row pointing at bytes we
    // then remove.
    const { data: currentVideo } = await supabase
      .from("videos")
      .select("thumb_storage_path")
      .eq("id", normalizedVideoId)
      .maybeSingle()
      .returns<{ thumb_storage_path: string | null }>();
    coverMetadataCommitted = toText(currentVideo?.thumb_storage_path) === uploadedObject.objectKey;
    if (!coverMetadataCommitted) {
      await deleteStoredMediaObject({
        surfaceType: "creator_video",
        provider: uploadedObject.provider,
        bucket: uploadedObject.bucket,
        objectKey: uploadedObject.objectKey,
      }).catch(() => undefined);
      throw error;
    }
  }

  // The new cover is authoritative before the old one is retired. Old-object
  // cleanup is best-effort: gateway delivery no longer recognizes a detached
  // key, so a provider failure cannot break the newly committed cover or make
  // the previous private object newly readable.
  if (coverMetadataCommitted && previousCoverPath && previousCoverPath !== uploadedObject.objectKey) {
    const previousProvider = normalizeMediaStorageProvider(videoRow.storage_provider);
    const previousBucket = getMediaStorageProviderBucket({
      provider: previousProvider,
      bucket: videoRow.storage_bucket,
      fallbackBucket: CREATOR_VIDEO_BUCKET,
    });
    if (usesPrivateOriginMediaGateway(previousProvider)) {
      await deleteStoredMediaObject({
        surfaceType: "creator_video",
        provider: previousProvider,
        bucket: previousBucket,
        objectKey: previousCoverPath,
        recordId: normalizedVideoId,
      }).catch(() => undefined);
    } else if (previousCoverPath.startsWith(`${ownerUserId}/${normalizedVideoId}/cover-`)) {
      await supabase.storage
        .from(CREATOR_VIDEO_BUCKET)
        .remove([previousCoverPath])
        .catch(() => undefined);
    }
  }

  return {
    storagePath: uploadedObject.objectKey,
    mimeType,
    fileSizeBytes: uploadedObject.sizeBytes,
    signedUrl,
  };
}
