import { Platform } from "react-native";
import type { ImageUploadFile } from "./imageUploadPolicy";
import { UserFacingError } from "./userFacingErrors";
import type { MediaPickerOperation } from "./mediaPickerCoordinator";
import { ownPickedMedia, releasePickedMedia } from "./mediaPickerResources";

export type DeviceGalleryCapability = {
  available: boolean;
  reason?: "different_platform" | "requires_native_build" | "no_gallery_handler";
};

const loadGalleryModule = async () => {
  try { return (await import("../modules/chillywood-gallery-picker")).default; }
  catch { return null; }
};

export async function getDeviceGalleryCapability(kind: "image" | "video" = "image"): Promise<DeviceGalleryCapability> {
  if (Platform.OS !== "android") return { available: false, reason: "different_platform" };
  const native = await loadGalleryModule();
  if (!native) return { available: false, reason: "requires_native_build" };
  try {
    const result = native.capabilities(kind);
    return result.apiVersion === 1 && result.available && result.maximumSelection === 1 && result.localOnly === false
      ? { available: true } : { available: false, reason: "no_gallery_handler" };
  } catch { return { available: false, reason: "no_gallery_handler" }; }
}

/** Called only inside the shared native lease. A gallery app need not be local-only. */
export async function pickDeviceGalleryAttachment(
  kind: "image" | "video",
  isCurrent: () => boolean,
  operation?: MediaPickerOperation,
  maximumBytes = (kind === "video" ? 5 * 1024 : 250) * 1024 * 1024,
  allowHeicNormalization = false,
): Promise<ImageUploadFile | null> {
  if (Platform.OS !== "android") throw new UserFacingError("attachment_action", "Gallery apps are an Android option. Choose the photo library or Files on this device.");
  const native = await loadGalleryModule();
  if (!isCurrent()) return null;
  if (!native) throw new UserFacingError("attachment_action", "Gallery apps need an updated Android app build. Choose the system photo library or Files for now.");
  const capability = native.capabilities(kind);
  if (capability.apiVersion !== 1 || !capability.available || capability.maximumSelection !== 1 || capability.localOnly !== false) {
    throw new UserFacingError("attachment_action", "No installed gallery app supports this selection. Choose the system photo library or Files.");
  }
  if (!isCurrent()) return null;
  // Import limits bound disk writes; each existing surface still enforces its
  // narrower image/video/evidence validation before saving or uploading.
  const requestId = `gallery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let cancellationRequested = false;
  const requestCancellation = () => {
    if (cancellationRequested || isCurrent()) return;
    cancellationRequested = true;
    // Cancellation marks the native request and closes only its import stream.
    // It never resolves our promise or releases the lease while native is open.
    void native.cancelRequestAsync(requestId).catch(() => undefined);
  };
  const monitor = setInterval(requestCancellation, 250);
  const result = await native.launchGalleryAsync({ requestId, mediaKind: kind, maximumBytes,
    ...(allowHeicNormalization && kind === "image" ? { heicMaximumBytes: 250 * 1024 * 1024 } : {}),
  }).catch((error: unknown) => {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const messages: Record<string, string> = {
      GALLERY_TOO_LARGE: "This attachment is too large for Gallery import. Choose Files to use the existing upload checks, or select a smaller file.",
      GALLERY_CACHE_FULL: "Gallery import storage is full. Finish or discard pending selections, or choose Files.",
      GALLERY_IMPORT_TIMEOUT: "The gallery took too long to import this attachment. Download it to the device or choose Files, then try again.",
      GALLERY_UNAVAILABLE: "No installed gallery app supports this selection. Choose the system photo library or Files.",
      GALLERY_WRONG_TYPE: "The gallery did not identify a supported attachment. Choose the system photo library or Files.",
    };
    if (messages[code]) throw new UserFacingError("attachment_action", messages[code]);
    throw error;
  })
    .finally(() => clearInterval(monitor));
  if (result.canceled) return null;
  const release = () => native.discardSelectionAsync(result.selectionId);
  if (operation) operation.ownResource(result.asset, release);
  else ownPickedMedia(result.asset, release);
  if (!isCurrent()) {
    await releasePickedMedia(result.asset);
    return null;
  }
  return result.asset;
}
