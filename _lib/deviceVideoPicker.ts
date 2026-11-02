import type { CreatorVideoFile } from "./creatorVideos";
import type { DeviceImageSource } from "./deviceImagePicker";
import { pickDeviceAttachments } from "./deviceAttachmentPicker";
import type { MediaPickerOperation } from "./mediaPickerCoordinator";

/** System media picker grants access only to the selected video. */
export async function pickDeviceVideo(source: DeviceImageSource, operation?: MediaPickerOperation, options?: { maximumBytes?: number }): Promise<CreatorVideoFile | null> {
  const files = await pickDeviceAttachments(source, { mimeTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"], mediaKind: "video", operation, maximumBytes: options?.maximumBytes });
  return files?.[0] ?? null;
}
