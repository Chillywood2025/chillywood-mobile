import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import type { ImagePickerAsset } from "expo-image-picker";

import type { TablesUpdate } from "../supabase/database.types";
import { normalizeImageUploadFile } from "./imageUploadNormalization";
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
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "./supabase";

export const PROFILE_MEDIA_BUCKET = "profile-media";
export const PROFILE_AVATAR_MAX_BYTES = 10 * 1024 * 1024;
export const PROFILE_BACKGROUND_MAX_BYTES = 20 * 1024 * 1024;
const PROFILE_MEDIA_UPLOAD_TIMEOUT_MS = 60000;

export type ProfileMediaKind = "avatar" | "background";

export type ProfileMediaImageFile = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

type ProfileMediaUploadOptions = {
  fitMode?: ProfileAppearanceFitMode;
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

const encodeStoragePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

const getFileExtension = (file: ProfileMediaImageFile, mimeType: string) => {
  const name = toText(file.name).toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop()?.replace(/[^a-z0-9]/g, "") ?? "" : "";
  if (extension === "jpeg") return "jpg";
  if (extension === "jpg" || extension === "png" || extension === "webp") return extension;
  return extensionFromMimeType(mimeType);
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

const getSignedInAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = toText(data.session?.access_token);
  if (error || !accessToken) throw new Error("Sign in before changing Profile appearance.");
  return accessToken;
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

async function prepareProfileMediaUploadUri(
  file: ProfileMediaImageFile,
  kind: ProfileMediaKind,
  mimeType: string,
) {
  const sourceUri = toText(file.uri);
  if (!sourceUri) throw new Error(`Choose a ${kind === "avatar" ? "photo" : "background"} before saving.`);

  if (!sourceUri.startsWith("content://") || !FileSystem.cacheDirectory) {
    return { uri: sourceUri, cleanup: async () => undefined };
  }

  const cacheUri = `${FileSystem.cacheDirectory}profile-media-${kind}-${createClientId()}.${getFileExtension(file, mimeType)}`;
  await withTimeout(
    FileSystem.copyAsync({ from: sourceUri, to: cacheUri }),
    20000,
    "Profile image took too long to prepare. Try again.",
  );

  return {
    uri: cacheUri,
    cleanup: async () => {
      await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => undefined);
    },
  };
}

async function getPreparedProfileMediaFileSize(uri: string, fallback?: number | null) {
  const parsed = Number(fallback);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  const size = Number(info && "size" in info ? info.size : 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

async function uploadProfileMediaFileToStorage(input: {
  objectKey: string;
  uri: string;
  mimeType: string;
}) {
  const accessToken = await getSignedInAccessToken();
  const uploadUrl = `${SUPABASE_URL.replace(/\/+$/g, "")}/storage/v1/object/${PROFILE_MEDIA_BUCKET}/${encodeStoragePath(input.objectKey)}`;

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
      PROFILE_MEDIA_UPLOAD_TIMEOUT_MS,
      "Profile image upload took too long. Try again.",
    );
    if (result.status >= 200 && result.status < 300) return;
  } catch {
    // Fall back to the SDK path below; some native builds handle Expo File bodies better.
  }

  const uploadBody = new File(input.uri);
  const { error } = await supabase.storage
    .from(PROFILE_MEDIA_BUCKET)
    .upload(input.objectKey, uploadBody as unknown as Blob, {
      contentType: input.mimeType,
      upsert: false,
    });
  if (error) throw error;
}

async function assertProfileMediaUploadReadable(objectKey: string, expectedSize: number) {
  if (expectedSize <= 0) return;
  const { data, error } = await supabase.storage
    .from(PROFILE_MEDIA_BUCKET)
    .createSignedUrl(objectKey, 60);
  if (error || !data?.signedUrl) throw new Error("Profile image could not be verified after upload.");

  const response = await withTimeout(
    fetch(data.signedUrl, { headers: { Range: "bytes=0-0" } }),
    20000,
    "Profile image verification took too long. Try again.",
  );
  if (!response.ok) throw new Error("Profile image could not be verified after upload.");
  const body = await response.arrayBuffer();
  if (body.byteLength <= 0) throw new Error("Profile image could not be verified after upload.");
}

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
    allowsEditing: false,
    quality: 1,
    exif: false,
    base64: false,
    defaultTab: "photos",
    legacy: false,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.uri) throw new Error(`Choose a ${kind === "avatar" ? "photo" : "background"} before saving.`);
  return buildProfileMediaFileFromImageAsset(kind, asset);
}

export async function uploadProfileMedia(
  kind: ProfileMediaKind,
  file: ProfileMediaImageFile,
  options: ProfileMediaUploadOptions = {},
): Promise<UserProfile> {
  const userId = await getSignedInUserId();
  const existingProfile = await readUserProfile();
  const nextFitMode = normalizeProfileAppearanceFitMode(options.fitMode);
  const normalized = await normalizeImageUploadFile(file);
  const objectKey = await (async () => {
    try {
      const { uri, mimeType, size } = await validateProfileMediaFile(kind, normalized.file);
      const nextObjectKey = buildProfileMediaObjectKey(userId, kind, mimeType);
      const prepared = await prepareProfileMediaUploadUri({ ...normalized.file, uri }, kind, mimeType);

      try {
        const preparedSize = await getPreparedProfileMediaFileSize(prepared.uri, size);
        await uploadProfileMediaFileToStorage({
          objectKey: nextObjectKey,
          uri: prepared.uri,
          mimeType,
        });
        await assertProfileMediaUploadReadable(nextObjectKey, preparedSize);
        return nextObjectKey;
      } catch (error) {
        await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove([nextObjectKey]).catch(() => undefined);
        throw new Error(error instanceof Error && error.message
          ? error.message
          : `Unable to upload this ${kind === "avatar" ? "photo" : "background"} right now.`);
      } finally {
        await prepared.cleanup();
      }
    } finally {
      await normalized.cleanup();
    }
  })();

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
  const patch: UserProfileUpdate & Record<string, unknown> = kind === "avatar"
    ? {
        avatar_url: publicUrl,
        profile_avatar_media_status: "active",
        profile_avatar_media_flagged_at: null,
        profile_avatar_scan_status: "pending_scan",
        profile_avatar_scan_provider: "clamav",
        profile_avatar_scan_result: null,
        profile_avatar_scanned_at: null,
        profile_avatar_scan_error: null,
        profile_avatar_fit_mode: nextFitMode,
        profile_avatar_focal_x: 0.5,
        profile_avatar_focal_y: 0.5,
        profile_media_updated_at: now,
        updated_at: now,
      }
    : {
        profile_background_url: publicUrl,
        profile_background_media_status: "active",
        profile_background_media_flagged_at: null,
        profile_background_scan_status: "pending_scan",
        profile_background_scan_provider: "clamav",
        profile_background_scan_result: null,
        profile_background_scanned_at: null,
        profile_background_scan_error: null,
        profile_background_fit_mode: nextFitMode,
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
        profileAvatarFitMode: nextFitMode,
        profileAvatarFocalX: 0.5,
        profileAvatarFocalY: 0.5,
      })
    : normalizeUserProfile({
        ...existingProfile,
        profileBackgroundUrl: publicUrl,
        profileBackgroundMediaStatus: "active",
        profileBackgroundMediaFlaggedAt: undefined,
        profileBackgroundFitMode: nextFitMode,
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
  const patch: UserProfileUpdate & Record<string, unknown> = kind === "avatar"
    ? {
        avatar_url: null,
        profile_avatar_media_status: "user_removed",
        profile_avatar_media_flagged_at: null,
        profile_avatar_scan_status: "manual_review",
        profile_avatar_scan_provider: null,
        profile_avatar_scan_result: "user_removed",
        profile_avatar_scanned_at: null,
        profile_avatar_scan_error: null,
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
        profile_background_scan_status: "manual_review",
        profile_background_scan_provider: null,
        profile_background_scan_result: "user_removed",
        profile_background_scanned_at: null,
        profile_background_scan_error: null,
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
