import { pickDeviceAttachments } from "./deviceAttachmentPicker";
import type { MediaPickerSource, MediaPickerOperation } from "./mediaPickerCoordinator";

import {
  getSocialAttachmentPickerTypes,
  getSocialAttachmentValidationMessage,
  type SocialAttachmentFile,
  type SocialAttachmentPickerScope,
} from "./socialAttachments";
import { UserFacingError } from "./userFacingErrors";
import { releasePickedMedia } from "./mediaPickerResources";

export async function pickSocialAttachmentFile(
  scope: SocialAttachmentPickerScope,
  source: MediaPickerSource = scope === "images" ? "photos" : "files",
  operation?: MediaPickerOperation,
  options?: { maximumBytes?: number },
): Promise<SocialAttachmentFile | null> {
  try {
    const files = await pickDeviceAttachments(source, { mimeTypes: getSocialAttachmentPickerTypes(scope), operation, maximumBytes: options?.maximumBytes });
    if (!files) return null;
    // Preserve real metadata, including a missing MIME; never invent JPEG bytes.
    const file = files[0];
    const validationMessage = getSocialAttachmentValidationMessage(file);
    if (validationMessage) {
      await releasePickedMedia(file);
      throw new UserFacingError("attachment_action", validationMessage);
    }
    return file;
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    throw new UserFacingError("attachment_action", "Unable to choose that attachment right now. Try again.");
  }
}
