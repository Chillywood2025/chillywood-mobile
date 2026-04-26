import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "./supabase";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";

export const CREATOR_VIDEO_BUCKET = "creator-videos";
export const CREATOR_VIDEO_SIGNED_URL_SECONDS = 60 * 60;

export type CreatorVideoVisibility = "draft" | "public";
export type CreatorVideoModerationStatus =
  | "clean"
  | "pending_review"
  | "reported"
  | "hidden"
  | "removed"
  | "banned";

export type CreatorVideoFile = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

export type CreatorVideo = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  visibility: CreatorVideoVisibility;
  moderationStatus: CreatorVideoModerationStatus;
  moderationReason: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  playbackUrl: string;
  thumbnailUrl: string;
  storagePath: string;
  thumbStoragePath: string;
  mimeType: string;
  fileSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
};

type CreatorVideoRow = Tables<"videos">;
type CreatorVideoInsert = TablesInsert<"videos">;
type CreatorVideoUpdate = TablesUpdate<"videos">;

const CREATOR_VIDEO_SELECT =
  "id,owner_id,title,description,playback_url,thumb_url,created_at,visibility,moderation_status,moderation_reason,moderated_at,moderated_by,storage_path,thumb_storage_path,mime_type,file_size_bytes,updated_at";

const toText = (value: unknown) => String(value ?? "").trim();

const logCreatorVideoUpload = (event: string, details?: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log("[creator-video-upload]", event, details ?? {});
};

const normalizeVisibility = (value: unknown): CreatorVideoVisibility => (
  toText(value).toLowerCase() === "public" ? "public" : "draft"
);

const normalizeModerationStatus = (value: unknown): CreatorVideoModerationStatus => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "pending_review"
    || normalized === "reported"
    || normalized === "hidden"
    || normalized === "removed"
    || normalized === "banned"
  ) {
    return normalized;
  }
  return "clean";
};

const createClientId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const next = char === "x" ? rand : (rand & 0x3) | 0x8;
    return next.toString(16);
  });

const getFileExtension = (file: CreatorVideoFile) => {
  const name = toText(file.name).toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
  if (ext) return ext.replace(/[^a-z0-9]/g, "") || "mp4";
  const mime = toText(file.mimeType).toLowerCase();
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("x-m4v")) return "m4v";
  return "mp4";
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

async function createSignedUrl(path: string) {
  const normalizedPath = toText(path);
  if (!normalizedPath) return "";
  if (isHttpUrl(normalizedPath)) return normalizedPath;

  const { data, error } = await supabase.storage
    .from(CREATOR_VIDEO_BUCKET)
    .createSignedUrl(normalizedPath, CREATOR_VIDEO_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
}

const encodeStoragePath = (path: string) => path
  .split("/")
  .map((part) => encodeURIComponent(part))
  .join("/");

async function uploadLocalFileToStorage(input: {
  uri: string;
  storagePath: string;
  mimeType: string;
  fileName?: string | null;
}) {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error("Sign in before uploading creator videos.");
  }

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${CREATOR_VIDEO_BUCKET}/${encodeStoragePath(input.storagePath)}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    apikey: SUPABASE_ANON_KEY,
    "x-upsert": "false",
  };
  const parseStorageError = (body: string) => {
    let message = "Unable to upload the selected video file.";
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string };
      message = toText(parsed.message) || toText(parsed.error) || message;
    } catch {
      message = toText(body) || message;
    }
    return message;
  };

  try {
    const localFile = new File(input.uri);
    const { error } = await supabase.storage
      .from(CREATOR_VIDEO_BUCKET)
      .upload(input.storagePath, localFile, {
        contentType: input.mimeType,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;
    return;
  } catch (error) {
    logCreatorVideoUpload("file_object_upload_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  try {
    const result = await FileSystem.uploadAsync(uploadUrl, input.uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        ...headers,
        "Content-Type": input.mimeType,
        "cache-control": "max-age=3600",
      },
    });

    if (result.status < 200 || result.status >= 300) {
      throw new Error(parseStorageError(result.body));
    }
    return;
  } catch (error) {
    logCreatorVideoUpload("native_upload_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  const formData = new FormData();
  formData.append("cacheControl", "3600");
  formData.append("", {
    uri: input.uri,
    name: toText(input.fileName) || `creator-video.${input.mimeType.split("/").pop() || "mp4"}`,
    type: input.mimeType,
  } as unknown as Blob);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(parseStorageError(body));
  }
}

async function parseCreatorVideo(row: CreatorVideoRow): Promise<CreatorVideo> {
  const storagePath = toText(row.storage_path);
  const playbackPath = storagePath || toText(row.playback_url);
  const thumbnailPath = toText(row.thumb_storage_path);
  const thumbnailFallback = toText(row.thumb_url);

  return {
    id: toText(row.id),
    ownerId: toText(row.owner_id),
    title: toText(row.title) || "Untitled Video",
    description: toText(row.description),
    visibility: normalizeVisibility(row.visibility),
    moderationStatus: normalizeModerationStatus(row.moderation_status),
    moderationReason: toText(row.moderation_reason) || null,
    moderatedAt: toText(row.moderated_at) || null,
    moderatedBy: toText(row.moderated_by) || null,
    playbackUrl: await createSignedUrl(playbackPath),
    thumbnailUrl: thumbnailPath ? await createSignedUrl(thumbnailPath) : thumbnailFallback,
    storagePath,
    thumbStoragePath: thumbnailPath,
    mimeType: toText(row.mime_type),
    fileSizeBytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null,
    createdAt: toText(row.created_at) || new Date().toISOString(),
    updatedAt: toText(row.updated_at) || toText(row.created_at) || new Date().toISOString(),
  };
}

async function getRequiredUserId() {
  const { data, error } = await supabase.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId) {
    throw new Error("Sign in before managing creator videos.");
  }
  return userId;
}

export async function readCreatorVideos(
  ownerId: string,
  options?: { includeDrafts?: boolean; limit?: number },
): Promise<CreatorVideo[]> {
  const normalizedOwnerId = toText(ownerId);
  if (!normalizedOwnerId) return [];

  let query = supabase
    .from("videos")
    .select(CREATOR_VIDEO_SELECT)
    .eq("owner_id", normalizedOwnerId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 24);

  if (!options?.includeDrafts) {
    query = query
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"]);
  }

  const { data, error } = await query.returns<CreatorVideoRow[]>();
  if (error || !data) return [];
  return Promise.all(data.map(parseCreatorVideo));
}

export async function readCreatorVideoForPlayer(videoId: string): Promise<CreatorVideo | null> {
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) return null;

  const { data, error } = await supabase
    .from("videos")
    .select(CREATOR_VIDEO_SELECT)
    .eq("id", normalizedVideoId)
    .in("moderation_status", ["clean", "reported"])
    .returns<CreatorVideoRow>()
    .maybeSingle();

  if (error || !data) return null;
  return parseCreatorVideo(data);
}

export async function uploadCreatorVideo(input: {
  file: CreatorVideoFile;
  title: string;
  description?: string;
  thumbUrl?: string;
  visibility: CreatorVideoVisibility;
}): Promise<CreatorVideo> {
  const ownerId = await getRequiredUserId();
  const title = toText(input.title);
  const fileUri = toText(input.file.uri);
  if (!title) throw new Error("Video title is required.");
  if (!fileUri) throw new Error("Choose a video file before uploading.");

  const id = createClientId();
  const mimeType = toText(input.file.mimeType) || "video/mp4";
  const storagePath = `${ownerId}/${id}/source.${getFileExtension(input.file)}`;

  try {
    logCreatorVideoUpload("storage_upload_start", {
      id,
      name: toText(input.file.name) || "unnamed",
      mimeType,
      size: input.file.size ?? null,
      visibility: normalizeVisibility(input.visibility),
    });
    await uploadLocalFileToStorage({
      uri: fileUri,
      storagePath,
      mimeType,
      fileName: input.file.name,
    });
  } catch (error) {
    logCreatorVideoUpload("storage_upload_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }

  logCreatorVideoUpload("storage_upload_succeeded", { id });

  const payload: CreatorVideoInsert = {
    id,
    owner_id: ownerId,
    title,
    description: toText(input.description) || null,
    playback_url: null,
    thumb_url: toText(input.thumbUrl) || null,
    visibility: normalizeVisibility(input.visibility),
    moderation_status: "clean",
    storage_path: storagePath,
    thumb_storage_path: null,
    mime_type: mimeType,
    file_size_bytes: typeof input.file.size === "number" ? input.file.size : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("videos")
    .insert(payload)
    .select(CREATOR_VIDEO_SELECT)
    .returns<CreatorVideoRow>()
    .single();

  if (error || !data) {
    logCreatorVideoUpload("metadata_insert_failed", {
      id,
      message: error instanceof Error ? error.message : "missing data",
    });
    await supabase.storage.from(CREATOR_VIDEO_BUCKET).remove([storagePath]).catch(() => undefined);
    throw error ?? new Error("Unable to save uploaded video metadata.");
  }

  logCreatorVideoUpload("metadata_insert_succeeded", { id, visibility: payload.visibility });

  return parseCreatorVideo(data);
}

export async function updateCreatorVideoMetadata(
  videoId: string,
  patch: {
    title?: string;
    description?: string;
    thumbUrl?: string;
    visibility?: CreatorVideoVisibility;
  },
): Promise<CreatorVideo> {
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) throw new Error("Missing creator video id.");

  const update: CreatorVideoUpdate = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) update.title = toText(patch.title) || "Untitled Video";
  if (patch.description !== undefined) update.description = toText(patch.description) || null;
  if (patch.thumbUrl !== undefined) update.thumb_url = toText(patch.thumbUrl) || null;
  if (patch.visibility !== undefined) update.visibility = normalizeVisibility(patch.visibility);

  const { data, error } = await supabase
    .from("videos")
    .update(update)
    .eq("id", normalizedVideoId)
    .select(CREATOR_VIDEO_SELECT)
    .returns<CreatorVideoRow>()
    .single();

  if (error || !data) throw error ?? new Error("Unable to update creator video.");
  return parseCreatorVideo(data);
}

export async function moderateCreatorVideo(input: {
  videoId: string;
  moderationStatus: CreatorVideoModerationStatus;
  reason?: string | null;
}): Promise<CreatorVideo> {
  const normalizedVideoId = toText(input.videoId);
  if (!normalizedVideoId) throw new Error("Missing creator video id.");

  const { data: sessionData } = await supabase.auth.getSession();
  const moderatedBy = toText(sessionData.session?.user?.id) || null;

  const update: CreatorVideoUpdate = {
    moderation_status: normalizeModerationStatus(input.moderationStatus),
    moderation_reason: toText(input.reason) || null,
    moderated_at: new Date().toISOString(),
    moderated_by: moderatedBy,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("videos")
    .update(update)
    .eq("id", normalizedVideoId)
    .select(CREATOR_VIDEO_SELECT)
    .returns<CreatorVideoRow>()
    .single();

  if (error || !data) throw error ?? new Error("Unable to update creator video moderation status.");
  return parseCreatorVideo(data);
}

export async function deleteCreatorVideo(video: Pick<CreatorVideo, "id" | "storagePath" | "thumbStoragePath">): Promise<void> {
  const videoId = toText(video.id);
  if (!videoId) return;

  const { error } = await supabase.from("videos").delete().eq("id", videoId);
  if (error) throw error;

  const paths = [toText(video.storagePath), toText(video.thumbStoragePath)].filter(Boolean);
  if (paths.length) {
    await supabase.storage.from(CREATOR_VIDEO_BUCKET).remove(paths).catch(() => undefined);
  }
}
