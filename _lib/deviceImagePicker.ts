import type { ImageUploadFile } from "./imageUploadPolicy";
import { UserFacingError } from "./userFacingErrors";

export type DeviceImageSource = "photos" | "files";

/** Both sources produce a cached image; callers retain their own validation and upload policy. */
export async function pickDeviceImage(source: DeviceImageSource): Promise<ImageUploadFile | null> {
  let file: ImageUploadFile;
  if (source === "photos") {
    const ImagePicker = await import("expo-image-picker").catch(() => {
      throw new UserFacingError("attachment_action", "Photo gallery needs the current app build. Install a rebuilt app, then try Photos again.");
    });
    // The system picker supports selected/limited access without requesting broad library access.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsMultipleSelection: false, allowsEditing: false,
      quality: 1, exif: false, base64: false, defaultTab: "photos", legacy: false,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return null;
    const asset = result.assets?.[0];
    file = { uri: asset?.uri ?? "", name: asset?.fileName, mimeType: asset?.mimeType, size: asset?.fileSize };
  } else {
    const DocumentPicker = await import("expo-document-picker").catch(() => {
      throw new UserFacingError("attachment_action", "Files needs the current app build. Install a rebuilt app, then try Files again.");
    });
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
      copyToCacheDirectory: true, multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets?.[0];
    file = { uri: asset?.uri ?? "", name: asset?.name, mimeType: asset?.mimeType, size: asset?.size };
  }
  if (!file.uri.trim()) throw new UserFacingError("attachment_action", "No readable image was returned. Please choose another photo.");
  // Native limited-access assets may omit both filename and MIME. Preserve the
  // real URI basename so existing upload inference can distinguish PNG/WebP.
  file.name ||= file.uri.split(/[?#]/, 1)[0].split("/").pop() || undefined;
  const mime = String(file.mimeType ?? "").trim().toLowerCase();
  const extension = (file.name || file.uri).split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
  const supportedMime = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];
  if (mime ? !supportedMime.includes(mime) : !["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension ?? "")) {
    throw new UserFacingError("attachment_action", "Choose a JPG, PNG, WebP, HEIC, or HEIF photo.");
  }
  // Preserve native MIME metadata; downstream uploaders validate size and normalize.
  return file;
}
