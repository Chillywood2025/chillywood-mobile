import type {
  RoomOptions,
  VideoCaptureOptions,
} from "livekit-client";

export const LIVE_VIDEO_DEFAULT_FPS = 30;
export const LIVE_VIDEO_MAX_FPS_V1 = 30;
export const PREMIUM_LIVE_MAX_HEIGHT_V1 = 720;
export const PREMIUM_LIVE_MAX_WIDTH_V1 = 1280;
export const VOD_FREE_MAX_HEIGHT_V1 = 480;
export const VOD_PREMIUM_MAX_HEIGHT_V1 = 1080;

export const ROOM_HEARTBEAT_MS = 15_000;
export const ROOM_MEMBERSHIP_ACTIVE_WINDOW_MS = 45_000;
export const ROOM_ACTIVITY_ACTIVE_WINDOW_MS = 15 * 60_000;
export const ROOM_SNAPSHOT_REFRESH_MS = 30_000;
export const ROOM_METRICS_REFRESH_MS = 60_000;
export const LIVE_COMMENT_FALLBACK_REFRESH_MS = 15_000;

export const HOME_SOFT_REFRESH_MS = 120_000;
export const CHANNEL_LIVE_STATUS_REFRESH_MS = 60_000;
export const STUDIO_DASHBOARD_REFRESH_MS = 120_000;
export const ANALYTICS_REFRESH_MODE = "manual_on_open_cache";

export const TYPING_THROTTLE_MS = 2_000;
export const READ_RECEIPT_THROTTLE_MS = 10_000;

export const LIVE_VIDEO_ENCODING_MAX_BITRATE_BPS = 1_700_000;

export const LIVE_VIDEO_CAPTURE_OPTIONS: VideoCaptureOptions = {
  frameRate: {
    ideal: LIVE_VIDEO_DEFAULT_FPS,
    max: LIVE_VIDEO_MAX_FPS_V1,
  },
  resolution: {
    width: PREMIUM_LIVE_MAX_WIDTH_V1,
    height: PREMIUM_LIVE_MAX_HEIGHT_V1,
    frameRate: LIVE_VIDEO_DEFAULT_FPS,
    aspectRatio: PREMIUM_LIVE_MAX_WIDTH_V1 / PREMIUM_LIVE_MAX_HEIGHT_V1,
  },
};

export const createLiveKitV1RoomOptions = (options: Pick<RoomOptions, "adaptiveStream" | "dynacast">): RoomOptions => ({
  ...options,
  videoCaptureDefaults: LIVE_VIDEO_CAPTURE_OPTIONS,
  publishDefaults: {
    // Keep the LiveKit camera publish path on SDK-supported simulcast layers.
    // Room-level dynacast/adaptive stream is scoped by each LiveKit room owner.
    simulcast: true,
    videoEncoding: {
      maxBitrate: LIVE_VIDEO_ENCODING_MAX_BITRATE_BPS,
      maxFramerate: LIVE_VIDEO_MAX_FPS_V1,
    },
  },
});
