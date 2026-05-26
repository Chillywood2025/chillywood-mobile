import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import {
  getSocialAttachmentPickerTypes,
  getSocialAttachmentValidationMessage,
  type SocialAttachmentFile,
  type SocialAttachmentPickerScope,
} from "./socialAttachments";

const imageFileNameFromUri = (uri: string) => {
  const name = uri.split("/").pop()?.trim();
  return name || `photo-${Date.now()}.jpg`;
};

const buildSocialAttachmentFileFromImageAsset = (asset: ImagePicker.ImagePickerAsset): SocialAttachmentFile => ({
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
  if (scope === "images") {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 1,
      exif: false,
      base64: false,
      defaultTab: "photos",
    });

    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset?.uri) throw new Error("Choose a photo before posting.");

    const file = buildSocialAttachmentFileFromImageAsset(asset);
    const validationMessage = getSocialAttachmentValidationMessage(file);
    if (validationMessage) throw new Error(validationMessage);
    return file;
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: getSocialAttachmentPickerTypes("files"),
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.uri) throw new Error("Choose an attachment before posting.");

  const file = buildSocialAttachmentFileFromDocumentAsset(asset);
  const validationMessage = getSocialAttachmentValidationMessage(file);
  if (validationMessage) throw new Error(validationMessage);
  return file;
}
