import type { CreatorVideo } from "./creatorVideos";

/** Source metadata permits opening Player; Player still resolves access and playback. */
export const hasCreatorVideoPreviewSource = (
  video: Pick<CreatorVideo, "playbackUrl" | "storagePath" | "storageObjectKey">,
) => {
  if (video.playbackUrl?.trim() || video.storagePath?.trim()) return true;
  const objectKey = video.storageObjectKey?.trim();
  // Owner list parsing also puts legacy playback URLs in storageObjectKey.
  // Do not promote those URLs (including placeholder fixtures) to ready media.
  return !!objectKey && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(objectKey);
};
