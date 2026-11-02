import type { ImageUploadFile } from "./imageUploadPolicy";
import { runNativeMediaPicker, type MediaPickerSource, type MediaPickerOperation } from "./mediaPickerCoordinator";
import { UserFacingError } from "./userFacingErrors";

export type DeviceAttachmentPickerOptions = {
  mimeTypes: string[];
  multiple?: boolean;
  selectionLimit?: number;
  mediaKind?: "image" | "video";
  /** Native Gallery import bound; surface validation still applies to all sources. */
  maximumBytes?: number;
  /** Profile limits apply after HEIC conversion, not to its original bytes. */
  allowHeicNormalization?: boolean;
  operation?: MediaPickerOperation;
};

const basename = (uri: string) => uri.split(/[?#]/, 1)[0].split("/").pop() || undefined;

/** Selected-item access only. This is the system picker, not a local-only/OEM gallery promise. */
export async function pickDeviceAttachments(
  source: MediaPickerSource,
  options: DeviceAttachmentPickerOptions,
): Promise<ImageUploadFile[] | null> {
  return runNativeMediaPicker(async (isCurrent) => {
    const limit = Math.max(0, Math.floor(options.selectionLimit ?? (options.multiple ? 6 : 1)));
    if (!limit) return null;
    let files: ImageUploadFile[];
    try {
      if (source === "gallery") {
        if (options.multiple) throw new UserFacingError("attachment_action", "Choose Photos or Files to select multiple attachments.");
        const { pickDeviceGalleryAttachment } = await import("./deviceGalleryPicker");
        if (!isCurrent()) return null;
        const asset = await pickDeviceGalleryAttachment(options.mediaKind ?? "image", isCurrent, options.operation, options.maximumBytes, options.allowHeicNormalization);
        if (!asset || !isCurrent()) return null;
        files = [asset];
      } else if (source === "files") {
        const picker = await import("expo-document-picker").catch(() => {
          throw new UserFacingError("attachment_action", "Files needs the current app build. Install a rebuilt app, then try Files again.");
        });
        if (!isCurrent()) return null;
        const result = await picker.getDocumentAsync({ type: options.mimeTypes, multiple: options.multiple ?? false, copyToCacheDirectory: true });
        if (!isCurrent() || result.canceled) return null;
        files = result.assets.map((asset) => ({ uri: asset.uri, name: asset.name || basename(asset.uri), mimeType: asset.mimeType, size: asset.size }));
      } else {
        const picker = await import("expo-image-picker").catch(() => {
          throw new UserFacingError("attachment_action", "Photo gallery and camera need the current app build. Install a rebuilt app, then try again.");
        });
        if (!isCurrent()) return null;
        const video = options.mediaKind === "video";
        if (video && source === "camera") throw new UserFacingError("attachment_action", "Choose an existing video from your library or Files. Video recording is not available here.");
        const pickerOptions = {
          mediaTypes: video ? ["videos" as const] : ["images" as const],
          allowsEditing: false, allowsMultipleSelection: source === "photos" && (options.multiple ?? false),
          selectionLimit: limit, quality: 1, exif: false, base64: false, legacy: false,
          preferredAssetRepresentationMode: picker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
          // Expo 17's Passthrough branch accesses PHAsset resources without cloud
          // download options. HighestQuality uses its supported export path;
          // this can transcode and is disclosed by the shared video source sheet.
          ...(video ? { videoExportPreset: picker.VideoExportPreset.HighestQuality } : {}),
        };
        if (source === "camera") {
          const permission = await picker.requestCameraPermissionsAsync();
          if (!isCurrent()) return null;
          if (!permission.granted) throw new UserFacingError("attachment_action", permission.canAskAgain
            ? "Camera access was not allowed. You can try again or choose a photo from the library or Files."
            : "Camera access is off. Enable it in your device settings, or choose the photo library or Files.");
        }
        if (!isCurrent()) return null;
        const result = source === "camera" ? await picker.launchCameraAsync(pickerOptions) : await picker.launchImageLibraryAsync(pickerOptions);
        if (!isCurrent() || result.canceled) return null;
        files = result.assets.map((asset) => ({ uri: asset.uri, name: asset.fileName || basename(asset.uri), mimeType: asset.mimeType, size: asset.fileSize }));
      }
      if (!files.length || files.some((file) => !file.uri?.trim())) {
        throw new UserFacingError("attachment_action", "No readable attachment was returned. Please choose another file.");
      }
      // Files providers need not honor a selection count. Never silently drop evidence.
      if (files.length > limit) throw new UserFacingError("attachment_action", `Choose up to ${limit} ${limit === 1 ? "attachment" : "attachments"} at a time.`);
      return files;
    } catch (error) {
      if (!isCurrent()) return null;
      if (error instanceof UserFacingError) throw error;
      throw new UserFacingError("attachment_action", "Unable to open or import that attachment. If it is stored in the cloud, download it to your device and try again, or choose Files.");
    }
  }, options.operation);
}
