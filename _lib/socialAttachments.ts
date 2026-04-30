import type { Tables, TablesInsert } from "../supabase/database.types";
import {
  createSignedMediaDownload,
  deleteStoredMediaObject,
  getMediaStorageProviderBucket,
  normalizeMediaStorageProvider,
  uploadFileToMediaStorage,
  type MediaStorageProvider,
} from "./mediaStorage";
import { supabase } from "./supabase";

export const SOCIAL_ATTACHMENT_BUCKET = "social-attachments";
export const SOCIAL_ATTACHMENT_SIGNED_URL_SECONDS = 60 * 60;
export const SOCIAL_ATTACHMENT_MAX_BYTES = 250 * 1024 * 1024;
export const SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE = "This attachment is too large for comments/chat right now.";

export const SOCIAL_ATTACHMENT_PICKER_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export type SocialAttachmentSurfaceType =
  | "profile_post"
  | "profile_post_comment"
  | "creator_video_comment"
  | "chat_message"
  | "watch_party_room_message";

export type SocialAttachmentKind = "image" | "video" | "audio" | "document" | "file";

export type SocialAttachmentFile = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

export type SocialAttachment = {
  id: string;
  ownerUserId: string;
  surfaceType: SocialAttachmentSurfaceType;
  surfaceId: string;
  storageProvider: MediaStorageProvider;
  storageBucket: string;
  storageObjectKey: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  originalFileName: string | null;
  moderationStatus: "clean" | "reported" | "hidden" | "removed";
  moderationReason: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  signedUrl: string;
};

type SocialAttachmentRow = Tables<"social_attachments">;
type SocialAttachmentInsert = TablesInsert<"social_attachments">;

const SOCIAL_ATTACHMENT_SELECT =
  "id,owner_user_id,surface_type,surface_id,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,size_bytes,original_file_name,moderation_status,moderation_reason,moderated_at,moderated_by,created_at,updated_at";

const toText = (value: unknown) => String(value ?? "").trim();

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

export const formatSocialAttachmentFileSize = (size?: number | null) => {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return "";
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
};

export const getSocialAttachmentLimitLabel = () =>
  formatSocialAttachmentFileSize(SOCIAL_ATTACHMENT_MAX_BYTES) || "250 MB";

export const isSocialAttachmentFileOverLimit = (file: SocialAttachmentFile) =>
  typeof file.size === "number"
    && Number.isFinite(file.size)
    && file.size > SOCIAL_ATTACHMENT_MAX_BYTES;

const inferMimeType = (file: SocialAttachmentFile) => {
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
    case "gif":
      return "image/gif";
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
};

const getFileExtension = (file: SocialAttachmentFile) => {
  const extension = getExtensionFromName(file.name);
  if (extension) return extension;

  const mimeType = inferMimeType(file);
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("quicktime")) return "mov";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("text")) return "txt";
  if (mimeType.includes("wordprocessingml")) return "docx";
  if (mimeType.includes("msword")) return "doc";
  if (mimeType.includes("spreadsheetml")) return "xlsx";
  if (mimeType.includes("presentationml")) return "pptx";
  if (mimeType.includes("mp4")) return "mp4";
  return "bin";
};

export const getSocialAttachmentKind = (mimeType?: string | null): SocialAttachmentKind => {
  const normalized = toText(mimeType).toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  if (
    normalized === "application/pdf"
    || normalized.includes("word")
    || normalized.includes("excel")
    || normalized.includes("spreadsheet")
    || normalized.includes("powerpoint")
    || normalized.includes("presentation")
    || normalized === "text/plain"
  ) {
    return "document";
  }
  return "file";
};

export const getReadableSocialAttachmentName = (input: {
  originalFileName?: string | null;
  storagePath?: string | null;
  name?: string | null;
}) => {
  const fromOriginal = toText(input.originalFileName);
  if (fromOriginal) return fromOriginal;
  const fromName = toText(input.name);
  if (fromName) return fromName;
  const path = toText(input.storagePath);
  if (!path) return "Attachment";
  return path.split("/").pop() || "Attachment";
};

export const getSocialAttachmentValidationMessage = (file: SocialAttachmentFile | null | undefined) => {
  if (!file || !toText(file.uri)) return "Choose an attachment before posting.";
  if (isSocialAttachmentFileOverLimit(file)) return SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE;
  return null;
};

async function getSignedInUserSession() {
  const { data, error } = await supabase.auth.getSession();
  const userId = toText(data.session?.user?.id);
  if (error || !userId) {
    throw new Error("Sign in before adding attachments.");
  }
  return { userId };
}

async function createSupabaseSignedUrl(path: string) {
  const normalizedPath = toText(path);
  if (!normalizedPath) return "";

  const { data, error } = await supabase.storage
    .from(SOCIAL_ATTACHMENT_BUCKET)
    .createSignedUrl(normalizedPath, SOCIAL_ATTACHMENT_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
}

const normalizeModerationStatus = (value: unknown): SocialAttachment["moderationStatus"] => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "reported" || normalized === "hidden" || normalized === "removed") return normalized;
  return "clean";
};

async function parseSocialAttachment(row: SocialAttachmentRow): Promise<SocialAttachment> {
  const storagePath = toText(row.storage_path);
  const storageProvider = normalizeMediaStorageProvider(row.storage_provider);
  const storageBucket = getMediaStorageProviderBucket({
    provider: storageProvider,
    bucket: row.storage_bucket,
    fallbackBucket: SOCIAL_ATTACHMENT_BUCKET,
  });
  const storageObjectKey = toText(row.storage_object_key) || storagePath;
  const signedUrl = storageProvider === "s3" && storageObjectKey
    ? await createSignedMediaDownload({
      surfaceType: "social_attachment",
      provider: storageProvider,
      bucket: storageBucket,
      objectKey: storageObjectKey,
      recordId: toText(row.id),
    }).catch(() => "")
    : await createSupabaseSignedUrl(storagePath);

  return {
    id: toText(row.id),
    ownerUserId: toText(row.owner_user_id),
    surfaceType: toText(row.surface_type) as SocialAttachmentSurfaceType,
    surfaceId: toText(row.surface_id),
    storageProvider,
    storageBucket,
    storageObjectKey,
    storagePath,
    mimeType: toText(row.mime_type) || "application/octet-stream",
    sizeBytes: Math.max(0, Number(row.size_bytes ?? 0) || 0),
    originalFileName: toText(row.original_file_name) || null,
    moderationStatus: normalizeModerationStatus(row.moderation_status),
    moderationReason: toText(row.moderation_reason) || null,
    moderatedAt: toText(row.moderated_at) || null,
    moderatedBy: toText(row.moderated_by) || null,
    createdAt: toText(row.created_at) || new Date().toISOString(),
    updatedAt: toText(row.updated_at) || toText(row.created_at) || new Date().toISOString(),
    signedUrl,
  };
}

export async function readSocialAttachmentsForSurfaces(
  surfaceType: SocialAttachmentSurfaceType,
  surfaceIds: string[],
): Promise<Map<string, SocialAttachment[]>> {
  const normalizedSurfaceIds = Array.from(new Set(surfaceIds.map(toText).filter(Boolean)));
  const empty = new Map<string, SocialAttachment[]>();
  if (!normalizedSurfaceIds.length) return empty;

  const { data, error } = await supabase
    .from("social_attachments")
    .select(SOCIAL_ATTACHMENT_SELECT)
    .eq("surface_type", surfaceType)
    .in("surface_id", normalizedSurfaceIds)
    .is("deleted_at", null)
    .in("moderation_status", ["clean", "reported"])
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(200, normalizedSurfaceIds.length * 4)))
    .returns<SocialAttachmentRow[]>();

  if (error || !data) return empty;

  const attachments = await Promise.all(data.map(parseSocialAttachment));
  return attachments.reduce((map, attachment) => {
    const current = map.get(attachment.surfaceId) ?? [];
    current.push(attachment);
    map.set(attachment.surfaceId, current);
    return map;
  }, new Map<string, SocialAttachment[]>());
}

export async function createSocialAttachmentForSurface(input: {
  surfaceType: SocialAttachmentSurfaceType;
  surfaceId: string;
  file: SocialAttachmentFile;
}): Promise<SocialAttachment> {
  const surfaceId = toText(input.surfaceId);
  const validationMessage = getSocialAttachmentValidationMessage(input.file);
  if (!surfaceId) throw new Error("Attachment target is missing.");
  if (validationMessage) throw new Error(validationMessage);

  const { userId } = await getSignedInUserSession();
  const id = createClientId();
  const mimeType = inferMimeType(input.file);
  const fileName = getReadableSocialAttachmentName({ name: input.file.name });
  const storagePath = `${userId}/${input.surfaceType}/${surfaceId}/${id}.${getFileExtension(input.file)}`;

  const uploadedObject = await uploadFileToMediaStorage({
    surfaceType: "social_attachment",
    uri: toText(input.file.uri),
    objectKey: storagePath,
    mimeType,
    fileName,
    sizeBytes: input.file.size,
  });

  const payload: SocialAttachmentInsert = {
    id,
    owner_user_id: userId,
    surface_type: input.surfaceType,
    surface_id: surfaceId,
    storage_provider: uploadedObject.provider,
    storage_bucket: uploadedObject.bucket,
    storage_object_key: uploadedObject.objectKey,
    storage_path: uploadedObject.objectKey,
    mime_type: mimeType,
    size_bytes: Math.max(0, Number(input.file.size ?? 0) || 0),
    original_file_name: fileName,
    moderation_status: "clean",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("social_attachments")
    .insert(payload)
    .select(SOCIAL_ATTACHMENT_SELECT)
    .returns<SocialAttachmentRow>()
    .single();

  if (error || !data) {
    await deleteStoredMediaObject({
      surfaceType: "social_attachment",
      provider: uploadedObject.provider,
      bucket: uploadedObject.bucket,
      objectKey: uploadedObject.objectKey,
    }).catch(() => undefined);
    throw error ?? new Error("Unable to save this attachment right now.");
  }

  return parseSocialAttachment(data);
}

export async function deleteSocialAttachment(
  attachment: Pick<SocialAttachment, "id" | "storageProvider" | "storageBucket" | "storageObjectKey" | "storagePath">,
): Promise<void> {
  const id = toText(attachment.id);
  if (!id) return;

  const { error } = await supabase
    .from("social_attachments")
    .delete()
    .eq("id", id);

  if (error) throw error;
  const provider = normalizeMediaStorageProvider(attachment.storageProvider);
  const objectKey = toText(attachment.storageObjectKey) || toText(attachment.storagePath);
  if (provider === "s3" && objectKey) {
    await deleteStoredMediaObject({
      surfaceType: "social_attachment",
      provider,
      bucket: toText(attachment.storageBucket),
      objectKey,
      recordId: id,
    }).catch(() => undefined);
  } else if (objectKey) {
    await supabase.storage.from(SOCIAL_ATTACHMENT_BUCKET).remove([objectKey]).catch(() => undefined);
  }
}
