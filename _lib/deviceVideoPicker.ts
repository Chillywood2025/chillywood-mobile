import type { CreatorVideoFile } from "./creatorVideos";
import type { DeviceImageSource } from "./deviceImagePicker";

/** System media picker grants access only to the selected video. */
export async function pickDeviceVideo(source: DeviceImageSource): Promise<CreatorVideoFile | null> {
  if (source === "files") {
    const picker = await import("expo-document-picker");
    const result = await picker.getDocumentAsync({ type: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"], copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return asset ? { uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size } : null;
  }
  const picker = await import("expo-image-picker");
  const result = await picker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsEditing: false, allowsMultipleSelection: false,
    preferredAssetRepresentationMode: picker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return asset ? { uri: asset.uri, name: asset.fileName ?? asset.uri.split("/").pop(), mimeType: asset.mimeType, size: asset.fileSize } : null;
}
