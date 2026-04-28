import type { CreatorVideo } from "./creatorVideos";

const CREATOR_VIDEO_SCHEME = "chillywoodmobile";

const toText = (value: unknown) => String(value ?? "").trim();

export function buildCreatorVideoPlayerPath(videoId: string) {
  const normalizedId = encodeURIComponent(toText(videoId));
  return `/player/${normalizedId}?source=creator-video`;
}

export function buildCreatorVideoDeepLink(videoId: string) {
  return `${CREATOR_VIDEO_SCHEME}://${buildCreatorVideoPlayerPath(videoId).replace(/^\//, "")}`;
}

export function isCreatorVideoPubliclyShareable(video: Pick<CreatorVideo, "visibility" | "moderationStatus"> | null | undefined) {
  if (!video) return false;
  return video.visibility === "public" && (video.moderationStatus === "clean" || video.moderationStatus === "reported");
}
