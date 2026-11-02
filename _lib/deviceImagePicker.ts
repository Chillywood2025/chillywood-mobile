import type { ImageUploadFile } from "./imageUploadPolicy";
import { UserFacingError } from "./userFacingErrors";
import { pickDeviceAttachments } from "./deviceAttachmentPicker";
import type { MediaPickerSource, MediaPickerOperation } from "./mediaPickerCoordinator";
import { releasePickedMedia } from "./mediaPickerResources";

export type DeviceImageSource = MediaPickerSource;

/** All sources produce a cached image; callers retain their own validation and upload policy. */
export async function pickDeviceImage(source: DeviceImageSource, operation?: MediaPickerOperation, options?: { maximumBytes?: number; allowHeicNormalization?: boolean }): Promise<ImageUploadFile | null> {
  const files = await pickDeviceAttachments(source, { mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"], operation, maximumBytes: options?.maximumBytes, allowHeicNormalization: options?.allowHeicNormalization });
  if (!files) return null;
  const file = files[0];
  if (!file.uri.trim()) throw new UserFacingError("attachment_action", "No readable image was returned. Please choose another photo.");
  // Native limited-access assets may omit both filename and MIME. Preserve the
  // real URI basename so existing upload inference can distinguish PNG/WebP.
  file.name ||= file.uri.split(/[?#]/, 1)[0].split("/").pop() || undefined;
  const mime = String(file.mimeType ?? "").trim().toLowerCase();
  const extension = (file.name || file.uri).split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
  const supportedMime = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];
  if (mime ? !supportedMime.includes(mime) : !["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension ?? "")) {
    await releasePickedMedia(file);
    throw new UserFacingError("attachment_action", "Choose a JPG, PNG, WebP, HEIC, or HEIF photo.");
  }
  // Preserve native MIME metadata; downstream uploaders validate size and normalize.
  return file;
}
