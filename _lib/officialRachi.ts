import * as FileSystem from "expo-file-system/legacy";

import type { Json } from "../supabase/database.types";

import { RACHI_OFFICIAL_ACCOUNT } from "./officialAccounts";
import { readCreatorVideos, type CreatorVideo } from "./creatorVideos";
import {
  pickProfileMediaImage,
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_MEDIA_BUCKET,
  type ProfileMediaImageFile,
} from "./profileMedia";
import { readProfilePosts, type ProfilePost } from "./profilePosts";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import {
  assertAccountBoundSupabaseMutationSubjectCurrent,
  captureAccountBoundSupabaseMutationSubject,
  isAccountBoundSupabaseMutationOutcomeAmbiguous,
  invokeAccountBoundSupabaseMutationRpc,
  type AccountBoundSupabaseMutationSubject,
} from "./accountBoundSupabaseMutation";
import {
  getCurrentAccountSessionAuthoritySnapshot,
  sameAccountSessionAuthority,
} from "./accountSessionAuthority";
import { readUserProfileByUserId } from "./userData";

export type OfficialRachiPostResult = ProfilePost & {
  auditId: string | null;
  actorRole: string | null;
};

export type OfficialRachiProfileImage = {
  avatarUrl: string | null;
  auditId?: string | null;
  actorRole?: string | null;
  updatedAt?: string | null;
};

const toText = (value: unknown) => String(value ?? "").trim();
const OFFICIAL_RACHI_POST_OPERATION_KEY_PATTERN = /^rachi-post:[0-9a-f]{32}$/u;

export const createOfficialRachiPostOperationKey = () => {
  let random = "";
  for (let index = 0; index < 32; index += 1) {
    random += Math.floor(Math.random() * 16).toString(16);
  }
  return `rachi-post:${random}`;
};

const RACHI_PROFILE_MEDIA_PREFIX = "official/rachi/avatar";
const RACHI_PROFILE_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const RACHI_PROFILE_MEDIA_UPLOAD_TIMEOUT_MS = 60000;

const createClientId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const next = Math.floor(Math.random() * 16);
    const value = char === "x" ? next : (next & 0x3) | 0x8;
    return value.toString(16);
  });

const inferImageMimeType = (file: ProfileMediaImageFile) => {
  const explicit = toText(file.mimeType).toLowerCase();
  if (explicit) return explicit;

  const source = `${file.name ?? ""} ${file.uri}`.toLowerCase();
  if (source.includes(".webp")) return "image/webp";
  if (source.includes(".png")) return "image/png";
  return "image/jpeg";
};

const imageExtensionForMimeType = (mimeType: string) => {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
};

const encodeStoragePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

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

const getImageFileSize = async (file: ProfileMediaImageFile) => {
  const explicit = Number(file.size);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const info = await FileSystem.getInfoAsync(file.uri).catch(() => null);
  const size = Number(info && "size" in info ? info.size : 0);
  return Number.isFinite(size) && size > 0 ? size : null;
};

const prepareOfficialRachiProfileMediaUpload = async (
  file: ProfileMediaImageFile,
  mimeType: string,
) => {
  const sourceUri = toText(file.uri);
  if (!sourceUri) throw new Error("Choose a photo before saving Rachi's profile picture.");

  if (!sourceUri.startsWith("content://") || !FileSystem.cacheDirectory) {
    return { uri: sourceUri, cleanup: async () => undefined };
  }

  const cacheUri = `${FileSystem.cacheDirectory}official-rachi-${createClientId()}.${imageExtensionForMimeType(mimeType)}`;
  await withTimeout(
    FileSystem.copyAsync({ from: sourceUri, to: cacheUri }),
    20000,
    "Rachi's profile picture took too long to prepare. Try again.",
  );
  return {
    uri: cacheUri,
    cleanup: async () => {
      await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => undefined);
    },
  };
};

const getPreparedOfficialRachiProfileMediaSize = async (
  uri: string,
  fallback?: number | null,
) => {
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  if (info) {
    const size = Number("size" in info ? info.size : 0);
    return Number.isFinite(size) && size > 0 ? size : 0;
  }
  const parsed = Number(fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const officialRachiUploadResponseMatches = (body: string, objectKey: string) => {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const responseKey = toText(parsed.Key ?? parsed.key);
    const responseId = toText(parsed.Id ?? parsed.id);
    return responseId.length > 0 && responseKey === `${PROFILE_MEDIA_BUCKET}/${objectKey}`;
  } catch {
    return false;
  }
};

const extractOfficialRachiProfileMediaKey = (url?: string | null) => {
  const normalizedUrl = toText(url);
  const proxyMarker = "/functions/v1/profile-media-public?";
  const proxyIndex = normalizedUrl.indexOf(proxyMarker);
  if (proxyIndex >= 0) {
    const query = normalizedUrl.slice(proxyIndex + proxyMarker.length);
    const encodedKey = query.split("&").find((part) => part.startsWith("objectKey="))?.slice("objectKey=".length) ?? "";
    try {
      const key = decodeURIComponent(encodedKey);
      return key.startsWith(`${RACHI_PROFILE_MEDIA_PREFIX}/`) ? key : null;
    } catch {
      return null;
    }
  }
  const marker = `/storage/v1/object/public/${PROFILE_MEDIA_BUCKET}/`;
  const index = normalizedUrl.indexOf(marker);
  if (index < 0) return null;
  const rawKey = normalizedUrl.slice(index + marker.length).split("?")[0] ?? "";
  if (!rawKey.startsWith(`${RACHI_PROFILE_MEDIA_PREFIX}/`)) return null;
  try {
    return decodeURIComponent(rawKey);
  } catch {
    return rawKey;
  }
};

const removeOfficialRachiProfileMediaObject = async (
  subject: AccountBoundSupabaseMutationSubject,
  url?: string | null,
) => {
  const objectKey = extractOfficialRachiProfileMediaKey(url);
  if (!objectKey) return;
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const response = await fetch(
    `${SUPABASE_URL.replace(/\/+$/g, "")}/storage/v1/object/${PROFILE_MEDIA_BUCKET}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${subject.accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [objectKey] }),
    },
  );
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (!response.ok) throw new Error("Unable to remove Rachi's previous profile picture.");
};

const uploadOfficialRachiProfileMedia = async (
  subject: AccountBoundSupabaseMutationSubject,
  file: ProfileMediaImageFile,
) => {
  const uri = toText(file.uri);
  if (!uri) throw new Error("Choose a photo before saving Rachi's profile picture.");

  const mimeType = inferImageMimeType(file);
  if (!RACHI_PROFILE_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  const selectedSize = await getImageFileSize(file);
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (typeof selectedSize === "number" && selectedSize > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error("Rachi profile pictures can be 10 MB or smaller.");
  }

  const objectKey = `${RACHI_PROFILE_MEDIA_PREFIX}/${Date.now()}-${createClientId()}.${imageExtensionForMimeType(mimeType)}`;
  const publicUrl = `${SUPABASE_URL.replace(/\/+$/g, "")}/functions/v1/profile-media-public?ownerUserId=${RACHI_OFFICIAL_ACCOUNT.userId}&objectKey=${objectKey}`;
  const prepared = await prepareOfficialRachiProfileMediaUpload(file, mimeType);
  let uploaded = false;
  try {
    const preparedSize = await getPreparedOfficialRachiProfileMediaSize(prepared.uri, selectedSize);
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    if (preparedSize <= 0) {
      throw new Error("Rachi's selected profile picture did not contain readable image data.");
    }
    if (preparedSize > PROFILE_AVATAR_MAX_BYTES) {
      throw new Error("Rachi profile pictures can be 10 MB or smaller.");
    }

    const uploadUrl = `${SUPABASE_URL.replace(/\/+$/g, "")}/storage/v1/object/${PROFILE_MEDIA_BUCKET}/${encodeStoragePath(objectKey)}`;
    const result = await withTimeout(
      FileSystem.uploadAsync(uploadUrl, prepared.uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${subject.accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": mimeType,
          "x-upsert": "false",
        },
      }),
      RACHI_PROFILE_MEDIA_UPLOAD_TIMEOUT_MS,
      "Rachi's profile picture upload took too long. Try again.",
    );
    if (result.status < 200 || result.status >= 300) {
      throw new Error("Unable to upload Rachi's profile picture right now.");
    }
    uploaded = true;
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    if (!officialRachiUploadResponseMatches(result.body, objectKey)) {
      throw new Error("Rachi's profile picture could not be verified after upload.");
    }
  } catch (error) {
    if (uploaded) {
      await removeOfficialRachiProfileMediaObject(subject, publicUrl).catch(() => undefined);
    }
    throw error;
  } finally {
    await prepared.cleanup();
  }

  return { objectKey, publicUrl };
};

const parseOfficialRachiPostResult = (payload: Json | null): OfficialRachiPostResult => {
  const record = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<string, unknown>;
  return {
    id: toText(record.id),
    userId: toText(record.userId) || RACHI_OFFICIAL_ACCOUNT.userId,
    body: toText(record.body),
    visibility: "public",
    moderationStatus: "clean",
    moderationReason: toText(record.moderationReason) || null,
    moderatedAt: toText(record.moderatedAt) || null,
    moderatedBy: toText(record.moderatedBy) || null,
    createdAt: toText(record.createdAt) || new Date().toISOString(),
    updatedAt: toText(record.updatedAt) || toText(record.createdAt) || new Date().toISOString(),
    attachments: [],
    auditId: toText(record.auditId) || null,
    actorRole: toText(record.actorRole) || null,
  };
};

const parseOfficialRachiProfileImageResult = (payload: Json | null): OfficialRachiProfileImage => {
  const record = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<string, unknown>;
  return {
    avatarUrl: toText(record.avatarUrl) || null,
    auditId: toText(record.auditId) || null,
    actorRole: toText(record.actorRole) || null,
    updatedAt: toText(record.updatedAt) || null,
  };
};

export async function createOfficialRachiPost(input: {
  body: string;
  operationKey: string;
  reason?: string;
}): Promise<OfficialRachiPostResult> {
  const initiatingAuthority = getCurrentAccountSessionAuthoritySnapshot();
  if (!initiatingAuthority || initiatingAuthority.restoreOnly) {
    throw new Error("Recheck the signed-in operator account before publishing Rachi's update.");
  }
  const body = toText(input.body);
  if (!body) throw new Error("Write a Rachi update before publishing.");
  const operationKey = toText(input.operationKey).toLowerCase();
  if (!OFFICIAL_RACHI_POST_OPERATION_KEY_PATTERN.test(operationKey)) {
    throw new Error("A valid Rachi publish request is required.");
  }
  const subject = await captureAccountBoundSupabaseMutationSubject(initiatingAuthority.userId);
  if (!sameAccountSessionAuthority(initiatingAuthority, subject.authority)) {
    throw new Error("The signed-in operator account changed before publishing Rachi's update.");
  }

  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<Json>(
    subject,
    "admin_create_official_rachi_post",
    {
      p_body: body,
      p_operation_key: operationKey,
      p_visibility: "public",
      p_reason: toText(input.reason) || "Official Rachi update",
    },
  );

  if (error) {
    if (isAccountBoundSupabaseMutationOutcomeAmbiguous(error)) {
      throw new Error("Rachi's update is still being verified. Retrying the same update is safe.");
    }
    throw error;
  }
  return parseOfficialRachiPostResult((data ?? null) as Json | null);
}

export async function readOfficialRachiPosts(options?: { includeDrafts?: boolean; limit?: number }): Promise<ProfilePost[]> {
  return readProfilePosts(RACHI_OFFICIAL_ACCOUNT.userId, {
    includeDrafts: false,
    limit: options?.limit ?? 8,
  });
}

export async function readOfficialRachiOriginals(options?: { limit?: number }): Promise<CreatorVideo[]> {
  return readCreatorVideos(RACHI_OFFICIAL_ACCOUNT.userId, {
    includeDrafts: false,
    limit: options?.limit ?? 12,
  });
}

export async function readOfficialRachiProfileImage(): Promise<OfficialRachiProfileImage> {
  const profile = await readUserProfileByUserId(RACHI_OFFICIAL_ACCOUNT.userId).catch(() => null);
  return {
    avatarUrl: toText(profile?.avatarUrl) || null,
  };
}

export async function updateOfficialRachiProfileImage(input: {
  avatarUrl: string | null;
  reason?: string;
}): Promise<OfficialRachiProfileImage> {
  const subject = await captureAccountBoundSupabaseMutationSubject();
  return updateOfficialRachiProfileImageWithSubject(subject, input);
}

const updateOfficialRachiProfileImageWithSubject = async (
  subject: AccountBoundSupabaseMutationSubject,
  input: { avatarUrl: string | null; reason?: string },
): Promise<OfficialRachiProfileImage> => {
  const avatarUrl = toText(input.avatarUrl);
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<Json>(
    subject,
    "admin_update_official_rachi_profile_image",
    {
      p_avatar_url: avatarUrl,
      p_reason: toText(input.reason) || "Official Rachi profile photo update",
    },
  );

  if (error) throw error;
  return parseOfficialRachiProfileImageResult((data ?? null) as Json | null);
};

export async function chooseOfficialRachiProfileImageFromGallery(input?: {
  previousAvatarUrl?: string | null;
}): Promise<OfficialRachiProfileImage | null> {
  const initiatingAuthority = getCurrentAccountSessionAuthoritySnapshot();
  if (!initiatingAuthority || initiatingAuthority.restoreOnly) {
    throw new Error("Recheck the signed-in operator account before choosing Rachi's profile picture.");
  }
  const file = await pickProfileMediaImage("avatar");
  if (!file) return null;
  if (!sameAccountSessionAuthority(initiatingAuthority, getCurrentAccountSessionAuthoritySnapshot())) {
    throw new Error("The signed-in operator account changed before the picture was selected.");
  }
  const subject = await captureAccountBoundSupabaseMutationSubject(initiatingAuthority.userId);
  if (!sameAccountSessionAuthority(initiatingAuthority, subject.authority)) {
    throw new Error("The signed-in operator account changed before the picture could be saved.");
  }

  const uploaded = await uploadOfficialRachiProfileMedia(subject, file);
  let saved: OfficialRachiProfileImage;
  try {
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    saved = await updateOfficialRachiProfileImageWithSubject(subject, {
      avatarUrl: uploaded.publicUrl,
      reason: "Update official Rachi profile photo from gallery",
    });
  } catch (error) {
    if (isAccountBoundSupabaseMutationOutcomeAmbiguous(error)) {
      const authoritative = await readOfficialRachiProfileImage().catch(() => null);
      if (toText(authoritative?.avatarUrl) === uploaded.publicUrl) {
        await removeOfficialRachiProfileMediaObject(subject, input?.previousAvatarUrl).catch(() => undefined);
        return authoritative as OfficialRachiProfileImage;
      }
      throw new Error("Rachi's profile picture is still being verified. Refresh before trying again.");
    }
    await removeOfficialRachiProfileMediaObject(subject, uploaded.publicUrl).catch(() => undefined);
    throw error;
  }
  await removeOfficialRachiProfileMediaObject(subject, input?.previousAvatarUrl).catch(() => undefined);
  return saved;
}

export async function clearOfficialRachiProfileImage(input?: {
  previousAvatarUrl?: string | null;
}): Promise<OfficialRachiProfileImage> {
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const saved = await updateOfficialRachiProfileImageWithSubject(subject, {
    avatarUrl: null,
    reason: "Clear official Rachi profile photo",
  });
  await removeOfficialRachiProfileMediaObject(subject, input?.previousAvatarUrl).catch(() => undefined);
  return saved;
}
