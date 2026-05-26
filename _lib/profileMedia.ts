import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import type { ImagePickerAsset } from "expo-image-picker";

import type { TablesUpdate } from "../supabase/database.types";
import {
  normalizeProfileAppearanceFitMode,
  normalizeProfileAppearanceNumber,
  normalizeProfileMediaStatus,
  normalizeUserProfile,
  readUserProfile,
  saveUserProfile,
  USER_PROFILES_TABLE,
  type ProfileAppearanceFitMode,
  type ProfileMediaStatus,
  type UserProfile,
} from "./userData";
import { supabase } from "./supabase";

export const PROFILE_MEDIA_BUCKET = "profile-media";
export const PROFILE_AVATAR_MAX_BYTES = 10 * 1024 * 1024;
export const PROFILE_BACKGROUND_MAX_BYTES = 20 * 1024 * 1024;

export type ProfileMediaKind = "avatar" | "background";

export type ProfileMediaImageFile = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

type UserProfileUpdate = TablesUpdate<"user_profiles">;

const PROFILE_MEDIA_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const toText = (value: unknown) => String(value ?? "").trim();

const createClientId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const next = Math.floor(Math.random() * 16);
    const value = char === "x" ? next : (next & 0x3) | 0x8;
    return value.toString(16);
  });

const profileMediaLimitForKind = (kind: ProfileMediaKind) => (
  kind === "avatar" ? PROFILE_AVATAR_MAX_BYTES : PROFILE_BACKGROUND_MAX_BYTES
);

const friendlyKindLabel = (kind: ProfileMediaKind) => (
  kind === "avatar" ? "Profile photo" : "Profile background"
);

const imageFileNameFromUri = (uri: string, kind: ProfileMediaKind) => {
  const name = uri.split("/").pop()?.trim();
  return name || `${kind}-${Date.now()}.jpg`;
};

const inferMimeType = (file: ProfileMediaImageFile) => {
  const explicit = toText(file.mimeType).toLowerCase();
  if (explicit) return explicit;

  const source = `${file.name ?? ""} ${file.uri}`.toLowerCase();
  if (source.includes(".webp")) return "image/webp";
  if (source.includes(".png")) return "image/png";
  return "image/jpeg";
};

const extensionFromMimeType = (mimeType: string) => {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
};

const getFileSize = async (file: ProfileMediaImageFile) => {
  const explicit = Number(file.size);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const info = await FileSystem.getInfoAsync(file.uri).catch(() => null);
  const size = Number(info && "size" in info ? info.size : 0);
  return Number.isFinite(size) && size > 0 ? size : null;
};

const validateProfileMediaFile = async (kind: ProfileMediaKind, file: ProfileMediaImageFile) => {
  const uri = toText(file.uri);
  if (!uri) throw new Error(`Choose a ${kind === "avatar" ? "photo" : "background"} before saving.`);

  const mimeType = inferMimeType(file);
  if (!PROFILE_MEDIA_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  const size = await getFileSize(file);
  const maxSize = profileMediaLimitForKind(kind);
  if (typeof size === "number" && size > maxSize) {
    const maxMb = Math.floor(maxSize / (1024 * 1024));
    throw new Error(`${friendlyKindLabel(kind)} images can be ${maxMb} MB or smaller.`);
  }

  return { uri, mimeType, size };
};

const getSignedInUserId = async () => {
  const { data, error } = await supabase.auth.getSession();
  const userId = toText(data.session?.user?.id);
  if (error || !userId) throw new Error("Sign in before changing Profile appearance.");
  return userId;
};

const loadImagePicker = async () => {
  try {
    return await import("expo-image-picker");
  } catch {
    throw new Error("Photo gallery needs the current app build. Install a rebuilt app, then try again.");
  }
};

const buildProfileMediaObjectKey = (userId: string, kind: ProfileMediaKind, mimeType: string) => (
  `${userId}/${kind}/${Date.now()}-${createClientId()}.${extensionFromMimeType(mimeType)}`
);

const buildProfileMediaFileFromImageAsset = (
  kind: ProfileMediaKind,
  asset: ImagePickerAsset,
): ProfileMediaImageFile => ({
  uri: asset.uri,
  name: asset.fileName || imageFileNameFromUri(asset.uri, kind),
  mimeType: asset.mimeType || "image/jpeg",
  size: asset.fileSize,
});

const extractProfileMediaObjectKey = (url?: string | null) => {
  const normalizedUrl = toText(url);
  const marker = `/storage/v1/object/public/${PROFILE_MEDIA_BUCKET}/`;
  const index = normalizedUrl.indexOf(marker);
  if (index < 0) return null;
  const rawKey = normalizedUrl.slice(index + marker.length).split("?")[0] ?? "";
  if (!rawKey) return null;
  try {
    return decodeURIComponent(rawKey);
  } catch {
    return rawKey;
  }
};

const deleteOwnedProfileMediaObject = async (userId: string, url?: string | null) => {
  const objectKey = extractProfileMediaObjectKey(url);
  if (!objectKey || !objectKey.startsWith(`${userId}/`)) return;
  await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove([objectKey]).catch(() => undefined);
};

const shouldCleanupProfileMediaObject = (status?: ProfileMediaStatus | null) => {
  const normalized = normalizeProfileMediaStatus(status);
  return normalized === "active" || normalized === "user_removed";
};

async function updateProfileAppearance(
  userId: string,
  existingProfile: UserProfile,
  patch: UserProfileUpdate,
  nextProfile: UserProfile,
) {
  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .update(patch)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to save Profile appearance right now.");
  }
  if (!data) {
    throw new Error("Profile appearance could not be saved for this account.");
  }

  const normalized = normalizeUserProfile({
    ...existingProfile,
    ...nextProfile,
  });
  await saveUserProfile(normalized);
  return normalized;
}

export async function pickProfileMediaImage(kind: ProfileMediaKind): Promise<ProfileMediaImageFile | null> {
  const ImagePicker = await loadImagePicker();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: kind === "avatar" ? [1, 1] : [16, 9],
    quality: 0.92,
    exif: false,
    base64: false,
    defaultTab: "photos",
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.uri) throw new Error(`Choose a ${kind === "avatar" ? "photo" : "background"} before saving.`);
  return buildProfileMediaFileFromImageAsset(kind, asset);
}

export async function uploadProfileMedia(kind: ProfileMediaKind, file: ProfileMediaImageFile): Promise<UserProfile> {
  const userId = await getSignedInUserId();
  const existingProfile = await readUserProfile();
  const { uri, mimeType } = await validateProfileMediaFile(kind, file);
  const objectKey = buildProfileMediaObjectKey(userId, kind, mimeType);
  const uploadBody = new File(uri);

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_MEDIA_BUCKET)
    .upload(objectKey, uploadBody as unknown as Blob, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || `Unable to upload this ${kind === "avatar" ? "photo" : "background"} right now.`);
  }

  const publicUrl = toText(supabase.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(objectKey).data.publicUrl);
  if (!publicUrl) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove([objectKey]).catch(() => undefined);
    throw new Error("Unable to prepare this Profile image for display.");
  }

  const now = new Date().toISOString();
  const oldUrl = kind === "avatar" ? existingProfile.avatarUrl : existingProfile.profileBackgroundUrl;
  const oldStatus = kind === "avatar"
    ? existingProfile.profileAvatarMediaStatus
    : existingProfile.profileBackgroundMediaStatus;
  const patch: UserProfileUpdate = kind === "avatar"
    ? {
        avatar_url: publicUrl,
        profile_avatar_media_status: "active",
        profile_avatar_media_flagged_at: null,
        profile_avatar_fit_mode: "fill",
        profile_avatar_focal_x: 0.5,
        profile_avatar_focal_y: 0.5,
        profile_media_updated_at: now,
        updated_at: now,
      }
    : {
        profile_background_url: publicUrl,
        profile_background_media_status: "active",
        profile_background_media_flagged_at: null,
        profile_background_fit_mode: "fill",
        profile_background_focal_x: 0.5,
        profile_background_focal_y: 0.5,
        profile_background_overlay_strength: 0.58,
        profile_media_updated_at: now,
        updated_at: now,
      };
  const nextProfile = kind === "avatar"
    ? normalizeUserProfile({
        ...existingProfile,
        avatarUrl: publicUrl,
        profileAvatarMediaStatus: "active",
        profileAvatarMediaFlaggedAt: undefined,
        profileAvatarFitMode: "fill",
        profileAvatarFocalX: 0.5,
        profileAvatarFocalY: 0.5,
      })
    : normalizeUserProfile({
        ...existingProfile,
        profileBackgroundUrl: publicUrl,
        profileBackgroundMediaStatus: "active",
        profileBackgroundMediaFlaggedAt: undefined,
        profileBackgroundFitMode: "fill",
        profileBackgroundFocalX: 0.5,
        profileBackgroundFocalY: 0.5,
        profileBackgroundOverlayStrength: 0.58,
      });

  try {
    const saved = await updateProfileAppearance(userId, existingProfile, patch, nextProfile);
    if (shouldCleanupProfileMediaObject(oldStatus)) {
      await deleteOwnedProfileMediaObject(userId, oldUrl);
    }
    return saved;
  } catch (error) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove([objectKey]).catch(() => undefined);
    throw error;
  }
}

export async function removeProfileMedia(kind: ProfileMediaKind): Promise<UserProfile> {
  const userId = await getSignedInUserId();
  const existingProfile = await readUserProfile();
  const removedUrl = kind === "avatar" ? existingProfile.avatarUrl : existingProfile.profileBackgroundUrl;
  const removedStatus = kind === "avatar"
    ? existingProfile.profileAvatarMediaStatus
    : existingProfile.profileBackgroundMediaStatus;
  const now = new Date().toISOString();
  const patch: UserProfileUpdate = kind === "avatar"
    ? {
        avatar_url: null,
        profile_avatar_media_status: "user_removed",
        profile_avatar_media_flagged_at: null,
        profile_avatar_fit_mode: "fill",
        profile_avatar_focal_x: 0.5,
        profile_avatar_focal_y: 0.5,
        profile_media_updated_at: now,
        updated_at: now,
      }
    : {
        profile_background_url: null,
        profile_background_media_status: "user_removed",
        profile_background_media_flagged_at: null,
        profile_background_fit_mode: "fill",
        profile_background_focal_x: 0.5,
        profile_background_focal_y: 0.5,
        profile_background_overlay_strength: 0.58,
        profile_media_updated_at: now,
        updated_at: now,
      };
  const nextProfile = kind === "avatar"
    ? normalizeUserProfile({
        ...existingProfile,
        avatarUrl: undefined,
        profileAvatarMediaStatus: "user_removed",
        profileAvatarMediaFlaggedAt: undefined,
        profileAvatarFitMode: "fill",
        profileAvatarFocalX: 0.5,
        profileAvatarFocalY: 0.5,
      })
    : normalizeUserProfile({
        ...existingProfile,
        profileBackgroundUrl: undefined,
        profileBackgroundMediaStatus: "user_removed",
        profileBackgroundMediaFlaggedAt: undefined,
        profileBackgroundFitMode: "fill",
        profileBackgroundFocalX: 0.5,
        profileBackgroundFocalY: 0.5,
        profileBackgroundOverlayStrength: 0.58,
      });

  const saved = await updateProfileAppearance(userId, existingProfile, patch, nextProfile);
  if (shouldCleanupProfileMediaObject(removedStatus)) {
    await deleteOwnedProfileMediaObject(userId, removedUrl);
  }
  return saved;
}

export async function updateProfileMediaFitMode(
  kind: ProfileMediaKind,
  fitMode: ProfileAppearanceFitMode,
): Promise<UserProfile> {
  const userId = await getSignedInUserId();
  const existingProfile = await readUserProfile();
  const normalizedFitMode = normalizeProfileAppearanceFitMode(fitMode);
  const now = new Date().toISOString();
  const patch: UserProfileUpdate = kind === "avatar"
    ? {
        profile_avatar_fit_mode: normalizedFitMode,
        profile_avatar_focal_x: normalizeProfileAppearanceNumber(existingProfile.profileAvatarFocalX, 0.5),
        profile_avatar_focal_y: normalizeProfileAppearanceNumber(existingProfile.profileAvatarFocalY, 0.5),
        profile_media_updated_at: now,
        updated_at: now,
      }
    : {
        profile_background_fit_mode: normalizedFitMode,
        profile_background_focal_x: normalizeProfileAppearanceNumber(existingProfile.profileBackgroundFocalX, 0.5),
        profile_background_focal_y: normalizeProfileAppearanceNumber(existingProfile.profileBackgroundFocalY, 0.5),
        profile_background_overlay_strength: normalizeProfileAppearanceNumber(
          existingProfile.profileBackgroundOverlayStrength,
          0.58,
          0,
          0.9,
        ),
        profile_media_updated_at: now,
        updated_at: now,
      };
  const nextProfile = kind === "avatar"
    ? normalizeUserProfile({
        ...existingProfile,
        profileAvatarFitMode: normalizedFitMode,
      })
    : normalizeUserProfile({
        ...existingProfile,
        profileBackgroundFitMode: normalizedFitMode,
      });

  return updateProfileAppearance(userId, existingProfile, patch, nextProfile);
}
