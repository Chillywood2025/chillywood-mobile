import { File } from "expo-file-system";
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
import { SUPABASE_URL, supabase } from "./supabase";
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

const RACHI_PROFILE_MEDIA_PREFIX = "official/rachi/avatar";
const RACHI_PROFILE_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

const getImageFileSize = async (file: ProfileMediaImageFile) => {
  const explicit = Number(file.size);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const info = await FileSystem.getInfoAsync(file.uri).catch(() => null);
  const size = Number(info && "size" in info ? info.size : 0);
  return Number.isFinite(size) && size > 0 ? size : null;
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

const removeOfficialRachiProfileMediaObject = async (url?: string | null) => {
  const objectKey = extractOfficialRachiProfileMediaKey(url);
  if (!objectKey) return;
  const { error } = await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove([objectKey]);
  if (error) throw new Error(error.message || "Unable to remove Rachi's previous profile picture.");
};

const uploadOfficialRachiProfileMedia = async (file: ProfileMediaImageFile) => {
  const uri = toText(file.uri);
  if (!uri) throw new Error("Choose a photo before saving Rachi's profile picture.");

  const mimeType = inferImageMimeType(file);
  if (!RACHI_PROFILE_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  const size = await getImageFileSize(file);
  if (typeof size === "number" && size > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error("Rachi profile pictures can be 10 MB or smaller.");
  }

  const objectKey = `${RACHI_PROFILE_MEDIA_PREFIX}/${Date.now()}-${createClientId()}.${imageExtensionForMimeType(mimeType)}`;
  const uploadBody = new File(uri);
  const { error: uploadError } = await supabase.storage
    .from(PROFILE_MEDIA_BUCKET)
    .upload(objectKey, uploadBody as unknown as Blob, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Unable to upload Rachi's profile picture right now.");
  }

  const publicUrl = `${SUPABASE_URL.replace(/\/+$/g, "")}/functions/v1/profile-media-public?ownerUserId=${RACHI_OFFICIAL_ACCOUNT.userId}&objectKey=${objectKey}`;
  if (!publicUrl) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove([objectKey]).catch(() => undefined);
    throw new Error("Unable to prepare Rachi's profile picture for display.");
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
  reason?: string;
}): Promise<OfficialRachiPostResult> {
  const body = toText(input.body);
  if (!body) throw new Error("Write a Rachi update before publishing.");

  const { data, error } = await supabase.rpc("admin_create_official_rachi_post", {
    p_body: body,
    p_visibility: "public",
    p_reason: toText(input.reason) || "Official Rachi update",
  });

  if (error) throw error;
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
  const avatarUrl = toText(input.avatarUrl);
  const { data, error } = await supabase.rpc("admin_update_official_rachi_profile_image", {
    p_avatar_url: avatarUrl,
    p_reason: toText(input.reason) || "Official Rachi profile photo update",
  });

  if (error) throw error;
  return parseOfficialRachiProfileImageResult((data ?? null) as Json | null);
}

export async function chooseOfficialRachiProfileImageFromGallery(input?: {
  previousAvatarUrl?: string | null;
}): Promise<OfficialRachiProfileImage | null> {
  const file = await pickProfileMediaImage("avatar");
  if (!file) return null;

  const uploaded = await uploadOfficialRachiProfileMedia(file);
  let saved: OfficialRachiProfileImage;
  try {
    saved = await updateOfficialRachiProfileImage({
      avatarUrl: uploaded.publicUrl,
      reason: "Update official Rachi profile photo from gallery",
    });
  } catch (error) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove([uploaded.objectKey]).catch(() => undefined);
    throw error;
  }
  await removeOfficialRachiProfileMediaObject(input?.previousAvatarUrl);
  return saved;
}

export async function clearOfficialRachiProfileImage(input?: {
  previousAvatarUrl?: string | null;
}): Promise<OfficialRachiProfileImage> {
  const saved = await updateOfficialRachiProfileImage({
    avatarUrl: null,
    reason: "Clear official Rachi profile photo",
  });
  await removeOfficialRachiProfileMediaObject(input?.previousAvatarUrl);
  return saved;
}
