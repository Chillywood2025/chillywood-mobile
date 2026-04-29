import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

import type { Tables, TablesInsert } from "../supabase/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "./supabase";

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
  | "chat_message";

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
  storageBucket: string;
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
  "id,owner_user_id,surface_type,surface_id,storage_bucket,storage_path,mime_type,size_bytes,original_file_name,moderation_status,moderation_reason,moderated_at,moderated_by,created_at,updated_at";

const toText = (value: unknown) => String(value ?? "").trim();

const createClientId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const next = char === "x" ? rand : (rand & 0x3) | 0x8;
    return next.toString(16);
  });

const encodeStoragePath = (path: string) => path
  .split("/")
  .map((part) => encodeURIComponent(part))
  .join("/");

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
  const accessToken = toText(data.session?.access_token);
  if (error || !userId || !accessToken) {
    throw new Error("Sign in before adding attachments.");
  }
  return { userId, accessToken };
}

async function createSignedUrl(path: string) {
  const normalizedPath = toText(path);
  if (!normalizedPath) return "";

  const { data, error } = await supabase.storage
    .from(SOCIAL_ATTACHMENT_BUCKET)
    .createSignedUrl(normalizedPath, SOCIAL_ATTACHMENT_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
}

const shouldVerifyUploadBytes = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
};

async function uploadedObjectHasReadableBytes(input: {
  storagePath: string;
  expectedSize?: number | null;
}) {
  if (!shouldVerifyUploadBytes(input.expectedSize)) return true;

  const signedUrl = await createSignedUrl(input.storagePath);
  if (!signedUrl) return true;

  try {
    const head = await fetch(signedUrl, { method: "HEAD" });
    const contentLength = Number(head.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 0) return true;

    const rangeProbe = await fetch(signedUrl, { headers: { Range: "bytes=0-0" } });
    if (rangeProbe.status === 416) return false;
    if (!rangeProbe.ok) return true;

    const body = await rangeProbe.arrayBuffer();
    return body.byteLength > 0;
  } catch {
    return true;
  }
}

async function assertUploadedObjectReadable(input: {
  storagePath: string;
  expectedSize?: number | null;
}) {
  const hasBytes = await uploadedObjectHasReadableBytes(input);
  if (hasBytes) return;

  await supabase.storage.from(SOCIAL_ATTACHMENT_BUCKET).remove([input.storagePath]).catch(() => undefined);
  throw new Error("Uploaded attachment was empty after upload.");
}

async function uploadLocalFileToStorage(input: {
  uri: string;
  storagePath: string;
  mimeType: string;
  fileName?: string | null;
  expectedSize?: number | null;
  accessToken: string;
}) {
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SOCIAL_ATTACHMENT_BUCKET}/${encodeStoragePath(input.storagePath)}`;
  const headers = {
    Authorization: `Bearer ${input.accessToken}`,
    apikey: SUPABASE_ANON_KEY,
    "x-upsert": "false",
  };
  const parseStorageError = (body: string) => {
    let message = "Unable to upload this attachment.";
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
      .from(SOCIAL_ATTACHMENT_BUCKET)
      .upload(input.storagePath, localFile, {
        contentType: input.mimeType,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;
    await assertUploadedObjectReadable({
      storagePath: input.storagePath,
      expectedSize: input.expectedSize,
    });
    return;
  } catch {
    // Fall through to the native uploader for Android content/file URI coverage.
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
    await assertUploadedObjectReadable({
      storagePath: input.storagePath,
      expectedSize: input.expectedSize,
    });
    return;
  } catch {
    // Fall through to FormData for platforms where binary upload is unavailable.
  }

  const formData = new FormData();
  formData.append("cacheControl", "3600");
  formData.append("", {
    uri: input.uri,
    name: toText(input.fileName) || `attachment.${input.mimeType.split("/").pop() || "bin"}`,
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

  await assertUploadedObjectReadable({
    storagePath: input.storagePath,
    expectedSize: input.expectedSize,
  });
}

const normalizeModerationStatus = (value: unknown): SocialAttachment["moderationStatus"] => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "reported" || normalized === "hidden" || normalized === "removed") return normalized;
  return "clean";
};

async function parseSocialAttachment(row: SocialAttachmentRow): Promise<SocialAttachment> {
  const storagePath = toText(row.storage_path);
  return {
    id: toText(row.id),
    ownerUserId: toText(row.owner_user_id),
    surfaceType: toText(row.surface_type) as SocialAttachmentSurfaceType,
    surfaceId: toText(row.surface_id),
    storageBucket: toText(row.storage_bucket) || SOCIAL_ATTACHMENT_BUCKET,
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
    signedUrl: await createSignedUrl(storagePath),
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

  const { userId, accessToken } = await getSignedInUserSession();
  const id = createClientId();
  const mimeType = inferMimeType(input.file);
  const fileName = getReadableSocialAttachmentName({ name: input.file.name });
  const storagePath = `${userId}/${input.surfaceType}/${surfaceId}/${id}.${getFileExtension(input.file)}`;

  await uploadLocalFileToStorage({
    uri: toText(input.file.uri),
    storagePath,
    mimeType,
    fileName,
    expectedSize: input.file.size,
    accessToken,
  });

  const payload: SocialAttachmentInsert = {
    id,
    owner_user_id: userId,
    surface_type: input.surfaceType,
    surface_id: surfaceId,
    storage_bucket: SOCIAL_ATTACHMENT_BUCKET,
    storage_path: storagePath,
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
    await supabase.storage.from(SOCIAL_ATTACHMENT_BUCKET).remove([storagePath]).catch(() => undefined);
    throw error ?? new Error("Unable to save this attachment right now.");
  }

  return parseSocialAttachment(data);
}

export async function deleteSocialAttachment(attachment: Pick<SocialAttachment, "id" | "storagePath">): Promise<void> {
  const id = toText(attachment.id);
  if (!id) return;

  const { error } = await supabase
    .from("social_attachments")
    .delete()
    .eq("id", id);

  if (error) throw error;
  const storagePath = toText(attachment.storagePath);
  if (storagePath) {
    await supabase.storage.from(SOCIAL_ATTACHMENT_BUCKET).remove([storagePath]).catch(() => undefined);
  }
}
