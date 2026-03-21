import { ImageSourcePropType } from "react-native";

const FALLBACK_POSTER: ImageSourcePropType = require("../assets/images/chicago-skyline.jpg");
const FALLBACK_VIDEO = require("../assets/videos/sample.mp4");

const toRemoteSource = (value: unknown) => {
  const url = (value ?? "").toString().trim();
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    return { uri: url };
  }
  return null;
};

export function getPosterSource(item: any): ImageSourcePropType | { uri: string } {
  const posterSource = toRemoteSource(item?.poster_url);
  if (posterSource) return posterSource;
  const thumbnailSource = toRemoteSource(item?.thumbnail_url);
  if (thumbnailSource) return thumbnailSource;
  if (item?.poster) return item.poster;
  return FALLBACK_POSTER;
}

export function getVideoSource(item: any): any {
  const videoSource = toRemoteSource(item?.video_url);
  if (videoSource) return videoSource;
  const previewSource = toRemoteSource(item?.preview_video_url);
  if (previewSource) return previewSource;
  if (item?.video) return item.video;
  return FALLBACK_VIDEO;
}
