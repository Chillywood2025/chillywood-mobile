import * as DocumentPicker from "expo-document-picker";
import type { ImagePickerAsset } from "expo-image-picker";

import {
  getSocialAttachmentPickerTypes,
  getSocialAttachmentValidationMessage,
  type SocialAttachmentFile,
  type SocialAttachmentPickerScope,
} from "./socialAttachments";
import { UserFacingError } from "./userFacingErrors";

const imageFileNameFromUri = (uri: string) => {
  const name = uri.split("/").pop()?.trim();
  return name || `photo-${Date.now()}.jpg`;
};

const loadImagePicker = async () => {
  try {
    return await import("expo-image-picker");
  } catch {
    throw new UserFacingError(
      "attachment_action",
      "Photo gallery needs the current app build. Install a rebuilt app, then try Photos again.",
    );
  }
};

const buildSocialAttachmentFileFromImageAsset = (asset: ImagePickerAsset): SocialAttachmentFile => ({
  uri: asset.uri,
  name: asset.fileName || imageFileNameFromUri(asset.uri),
  mimeType: asset.mimeType || "image/jpeg",
  size: asset.fileSize,
});

const buildSocialAttachmentFileFromDocumentAsset = (asset: DocumentPicker.DocumentPickerAsset): SocialAttachmentFile => ({
  uri: asset.uri,
  name: asset.name,
  mimeType: asset.mimeType,
  size: asset.size,
});

export async function pickSocialAttachmentFile(scope: SocialAttachmentPickerScope) {
  try {
    if (scope === "images") {
      const ImagePicker = await loadImagePicker();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 1,
        exif: false,
        base64: false,
        defaultTab: "photos",
        legacy: false,
      });

      if (result.canceled) return null;
      const asset = result.assets[0];
      if (!asset?.uri) throw new UserFacingError("attachment_action", "Choose a photo before posting.");

      const file = buildSocialAttachmentFileFromImageAsset(asset);
      const validationMessage = getSocialAttachmentValidationMessage(file);
      if (validationMessage) throw new UserFacingError("attachment_action", validationMessage);
      return file;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: getSocialAttachmentPickerTypes("files"),
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset?.uri) throw new UserFacingError("attachment_action", "Choose an attachment before posting.");

    const file = buildSocialAttachmentFileFromDocumentAsset(asset);
    const validationMessage = getSocialAttachmentValidationMessage(file);
    if (validationMessage) throw new UserFacingError("attachment_action", validationMessage);
    return file;
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    throw new UserFacingError("attachment_action", "Unable to choose that attachment right now. Try again.");
  }
}
