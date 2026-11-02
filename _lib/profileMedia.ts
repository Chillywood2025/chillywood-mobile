import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { withPickedMediaRead } from "./mediaPickerResources";
import { prepareMediaUploadCopy } from "./prepareMediaUploadCopy";
import { pickDeviceImage, type DeviceImageSource } from "./deviceImagePicker";
import type { MediaPickerOperation } from "./mediaPickerCoordinator";
import { createClient } from "@supabase/supabase-js";
import { captureAccountBoundSupabaseMutationSubject, assertAccountBoundSupabaseMutationSubjectCurrent } from "./accountBoundSupabaseMutation";
import { sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";

import type { Database, TablesUpdate } from "../supabase/database.types";
import { normalizeImageUploadFile } from "./imageUploadNormalization";
import {
  normalizeProfileAppearanceFitMode,
  normalizeProfileAppearanceNumber,
  normalizeProfileMediaStatus,
  normalizeUserProfile,
  readUserProfile,
  cacheAcknowledgedUserProfile,
  USER_PROFILES_TABLE,
  type ProfileAppearanceFitMode,
  type ProfileMediaStatus,
  type UserProfile,
} from "./userData";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import { reportRuntimeError } from "./logger";

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
  owner?: ProfileMediaRemovalOwner;
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

type ProfileMediaRemovalOwner = {
  authority: AccountSessionAuthorityBinding;
  isCurrent: () => boolean;
};

const captureProfileMediaOperation = async (owner?: ProfileMediaRemovalOwner) => {
  if (owner && !owner.isCurrent()) throw new Error("The Profile action is no longer current.");
  const subject = await captureAccountBoundSupabaseMutationSubject();
  if (owner && (!owner.isCurrent() || !sameAccountSessionAuthority(owner.authority, subject.authority))) {
    throw new Error("The signed-in account changed before this action finished.");
  }
  // Every request (including retries/cleanup) keeps the initiating token. The
  // shared SDK client may adopt another account while a native upload is held.
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${subject.accessToken}` } },
  });
  return { subject, client, owner };
};
type ProfileMediaOperation = Awaited<ReturnType<typeof captureProfileMediaOperation>>;
const assertMediaOperationCurrent = (operation: ProfileMediaOperation) => {
  if (operation.owner && !operation.owner.isCurrent()) throw new Error("The Profile action is no longer current.");
  assertAccountBoundSupabaseMutationSubjectCurrent(operation.subject);
};
class ProfileAppearanceWriteRejectedError extends Error {}

const buildProfileMediaObjectKey = (userId: string, kind: ProfileMediaKind, mimeType: string) => (
  `${userId}/${kind}/${Date.now()}-${createClientId()}.${extensionFromMimeType(mimeType)}`
);

const extractProfileMediaObjectKey = (url?: string | null) => {
  const normalizedUrl = toText(url);
  const proxyMarker = "/functions/v1/profile-media-public?";
  const proxyIndex = normalizedUrl.indexOf(proxyMarker);
  if (proxyIndex >= 0) {
    const query = normalizedUrl.slice(proxyIndex + proxyMarker.length);
    const rawKey = query.split("&").find((part) => part.startsWith("objectKey="))?.slice("objectKey=".length) ?? "";
    if (!rawKey) return null;
    try {
      return decodeURIComponent(rawKey);
    } catch {
      return null;
    }
  }
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

const deleteOwnedProfileMediaObject = async (operation: ProfileMediaOperation, userId: string, url?: string | null) => {
  const objectKey = extractProfileMediaObjectKey(url);
  if (!objectKey || !objectKey.startsWith(`${userId}/`)) return;
  assertMediaOperationCurrent(operation);
  const { error } = await operation.client.storage.from(PROFILE_MEDIA_BUCKET).remove([objectKey]);
  if (error) throw new Error(error.message || "Unable to remove this Profile image right now.");
};

const cleanupReplacedProfileMedia = async (operation: ProfileMediaOperation, userId: string, url?: string | null) => {
  try {
    await deleteOwnedProfileMediaObject(operation, userId, url);
  } catch {
    // Metadata is already committed. Do not report the save as failed or invite
    // a second upload. Retained objects need owner-scoped storage reconciliation;
    // no object key, private URL, or credential is included in this diagnostic.
    reportRuntimeError("profile-media-cleanup-pending", new Error("Profile saved; old image cleanup requires reconciliation."));
  }
};

const buildProfileMediaReadUrl = (objectKey: string) => (
  `${SUPABASE_URL.replace(/\/+$/g, "")}/functions/v1/profile-media-public?ownerUserId=${objectKey.split("/", 1)[0]}&objectKey=${objectKey}`
);

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
  return prepareMediaUploadCopy({
    sourceUri,
    destinationUri: cacheUri,
    waitForCopy: (copy) => withTimeout(copy, 20000, "Profile image took too long to prepare. Try again."),
  });
}

async function getPreparedProfileMediaFileSize(uri: string, fallback?: number | null) {
  const parsed = Number(fallback);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  const size = Number(info && "size" in info ? info.size : 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

async function uploadProfileMediaFileToStorage(operation: ProfileMediaOperation, input: {
  objectKey: string;
  uri: string;
  mimeType: string;
}) {
  assertMediaOperationCurrent(operation);
  const accessToken = operation.subject.accessToken;
  const uploadUrl = `${SUPABASE_URL.replace(/\/+$/g, "")}/storage/v1/object/${PROFILE_MEDIA_BUCKET}/${encodeStoragePath(input.objectKey)}`;

  try {
    // A timeout only retires this wait, not the native reader of the picked URI.
    const result = await withTimeout(
      withPickedMediaRead(input.uri, () => FileSystem.uploadAsync(uploadUrl, input.uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": input.mimeType,
          "x-upsert": "false",
        },
      })),
      PROFILE_MEDIA_UPLOAD_TIMEOUT_MS,
      "Profile image upload took too long. Try again.",
    );
    if (result.status >= 200 && result.status < 300) return;
  } catch {
    // Fall back to the SDK path below; some native builds handle Expo File bodies better.
  }

  assertMediaOperationCurrent(operation);
  const { error } = await withPickedMediaRead(input.uri, () => {
    const uploadBody = new File(input.uri);
    return operation.client.storage
      .from(PROFILE_MEDIA_BUCKET)
      .upload(input.objectKey, uploadBody as unknown as Blob, {
        contentType: input.mimeType,
        upsert: false,
      });
  });
  if (error) throw error;
}

async function assertProfileMediaUploadReadable(operation: ProfileMediaOperation, objectKey: string, expectedSize: number) {
  if (expectedSize <= 0) return;
  assertMediaOperationCurrent(operation);
  const { data, error } = await operation.client.storage
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
  operation: ProfileMediaOperation,
  userId: string,
  existingProfile: UserProfile,
  patch: UserProfileUpdate,
  nextProfile: UserProfile,
) {
  assertMediaOperationCurrent(operation);
  const { data, error } = await operation.client
    .from(USER_PROFILES_TABLE)
    .update(patch)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  assertMediaOperationCurrent(operation);

  if (error) {
    // SDK transport errors can also arrive in `error`; only explicit database
    // rejection receipts prove that the uploaded object is unreferenced.
    const message = error.message || "Unable to save Profile appearance right now.";
    if (["42501", "23505", "23514", "23502", "22P02"].includes(error.code)) {
      throw new ProfileAppearanceWriteRejectedError(message);
    }
    throw new Error(message);
  }
  if (!data) {
    throw new ProfileAppearanceWriteRejectedError("Profile appearance could not be saved for this account.");
  }

  const normalized = normalizeUserProfile({
    ...existingProfile,
    ...nextProfile,
  });
  const cachePatch = Object.fromEntries(Object.entries(normalized).filter(([key]) =>
    Object.prototype.hasOwnProperty.call(patch, key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)),
  )) as Partial<UserProfile>;
  return cacheAcknowledgedUserProfile(cachePatch, operation.subject.authority, operation.client);
}

export async function pickProfileMediaImage(kind: ProfileMediaKind, source: DeviceImageSource = "photos", operation?: MediaPickerOperation): Promise<ProfileMediaImageFile | null> {
  return pickDeviceImage(source, operation, { maximumBytes: kind === "avatar" ? PROFILE_AVATAR_MAX_BYTES : PROFILE_BACKGROUND_MAX_BYTES, allowHeicNormalization: true });
}

export async function uploadProfileMedia(
  kind: ProfileMediaKind,
  file: ProfileMediaImageFile,
  options: ProfileMediaUploadOptions = {},
): Promise<UserProfile> {
  const operation = await captureProfileMediaOperation(options.owner);
  const userId = operation.subject.authority.userId;
  const existingProfile = await readUserProfile(userId);
  assertMediaOperationCurrent(operation);
  const nextFitMode = normalizeProfileAppearanceFitMode(options.fitMode);
  const normalized = await normalizeImageUploadFile(file);
  const objectKey = await (async () => {
    try {
      const { uri, mimeType, size } = await validateProfileMediaFile(kind, normalized.file);
      const nextObjectKey = buildProfileMediaObjectKey(userId, kind, mimeType);
      const prepared = await prepareProfileMediaUploadUri({ ...normalized.file, uri }, kind, mimeType);

      try {
        const preparedSize = await getPreparedProfileMediaFileSize(prepared.uri, size);
        await uploadProfileMediaFileToStorage(operation, {
          objectKey: nextObjectKey,
          uri: prepared.uri,
          mimeType,
        });
        await assertProfileMediaUploadReadable(operation, nextObjectKey, preparedSize);
        return nextObjectKey;
      } catch (error) {
        await operation.client.storage.from(PROFILE_MEDIA_BUCKET).remove([nextObjectKey]).catch(() => undefined);
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

  const publicUrl = buildProfileMediaReadUrl(objectKey);
  if (!publicUrl) {
    await operation.client.storage.from(PROFILE_MEDIA_BUCKET).remove([objectKey]).catch(() => undefined);
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

  // A lost response/account transition does not prove that the row write failed.
  // Never delete a newly uploaded object that a committed row may now reference.
  let saved: UserProfile;
  try {
    saved = await updateProfileAppearance(operation, userId, existingProfile, patch, nextProfile);
  } catch (error) {
    if (error instanceof ProfileAppearanceWriteRejectedError) {
      await cleanupReplacedProfileMedia(operation, userId, publicUrl);
    } else {
      reportRuntimeError("profile-media-upload-reconciliation-pending", new Error("Profile image upload requires reconciliation after an unconfirmed save."));
    }
    throw error;
  }
  if (shouldCleanupProfileMediaObject(oldStatus)) {
    await cleanupReplacedProfileMedia(operation, userId, oldUrl);
  }
  return saved;
}

export async function removeProfileMedia(kind: ProfileMediaKind, owner: ProfileMediaRemovalOwner): Promise<UserProfile> {
  if (!owner) throw new Error("The Profile action requires its initiating account.");
  const operation = await captureProfileMediaOperation(owner);
  const userId = operation.subject.authority.userId;
  const existingProfile = await readUserProfile(userId);
  assertMediaOperationCurrent(operation);
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

  const saved = await updateProfileAppearance(operation, userId, existingProfile, patch, nextProfile);
  if (shouldCleanupProfileMediaObject(removedStatus)) {
    await cleanupReplacedProfileMedia(operation, userId, removedUrl);
  }
  return saved;
}

export async function updateProfileMediaFitMode(
  kind: ProfileMediaKind,
  fitMode: ProfileAppearanceFitMode,
): Promise<UserProfile> {
  const operation = await captureProfileMediaOperation();
  const userId = operation.subject.authority.userId;
  const existingProfile = await readUserProfile(userId);
  assertMediaOperationCurrent(operation);
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

  return updateProfileAppearance(operation, userId, existingProfile, patch, nextProfile);
}
