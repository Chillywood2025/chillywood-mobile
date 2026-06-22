import type { Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";
import {
  DEFAULT_APP_CONFIG,
  readAppConfig,
} from "./appConfig";
import {
  createSignedMediaDownload,
  deleteStoredMediaObject,
  getMediaStorageProviderBucket,
  normalizeMediaStorageProvider,
  uploadFileToMediaStorage,
  type MediaStorageProvider,
} from "./mediaStorage";
import { recordCreatorVideoUploadUsage } from "./platformUsage";
import { SUPABASE_ANON_KEY, SUPABASE_FUNCTIONS_URL, supabase } from "./supabase";
import {
  resolveCreatorContentAccess,
  type CreatorContentAccessResolution,
} from "./creatorMonetization";
import {
  createUnavailableVodPlaybackResolution,
  readVideoRenditionStatuses,
  recordOriginalVideoRendition,
  resolveSignedVideoPlaybackSource,
  type VodPlaybackResolution,
  type VodRenditionStatusItem,
} from "./vodQuality";

export const CREATOR_VIDEO_BUCKET = "creator-videos";
export const CREATOR_VIDEO_SIGNED_URL_SECONDS = 60 * 60;
export const CREATOR_VIDEO_CHANNEL_MOVIE_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
export const CREATOR_VIDEO_MAX_RUNTIME_LABEL = "2 hr 30 min";

export type CreatorVideoVisibility = "draft" | "circle" | "public";
export type CreatorVideoModerationStatus =
  | "clean"
  | "pending_review"
  | "reported"
  | "hidden"
  | "removed"
  | "banned";
export type CreatorVideoPublicClipTitlePosition = "top" | "center" | "bottom";
export type CreatorVideoPublicClipTitleStyle = "clean" | "bold" | "spotlight" | "trailer";
export type CreatorVideoPublicClipTemplatePreset =
  | "trailer"
  | "highlight"
  | "promo"
  | "event"
  | "reaction"
  | "platform_intro";

export type CreatorVideoPublicClipMetadata = {
  isPublic: boolean;
  titleText: string;
  subtitleText: string;
  titlePosition: CreatorVideoPublicClipTitlePosition;
  titleStyle: CreatorVideoPublicClipTitleStyle;
  templatePreset: CreatorVideoPublicClipTemplatePreset | null;
};

export type CreatorVideoVisibilityAccessReason =
  | "public_allowed"
  | "owner_allowed"
  | "circle_member_allowed"
  | "signed_out_requires_circle"
  | "circle_member_required"
  | "draft_owner_only"
  | "blocked"
  | "moderation_unavailable"
  | "media_unavailable"
  | "not_found"
  | "unavailable";

export type CreatorVideoVisibilityAccess = {
  allowed: boolean;
  visibility: CreatorVideoVisibility;
  reason: CreatorVideoVisibilityAccessReason;
  isOwner: boolean;
  isBlocked: boolean;
  isCircleMember: boolean;
  hasPlayableSource: boolean;
  viewerUserId: string | null;
  ownerUserId: string | null;
};

export type CreatorVideoFile = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

export type CreatorVideo = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  visibility: CreatorVideoVisibility;
  moderationStatus: CreatorVideoModerationStatus;
  moderationReason: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  playbackUrl: string;
  thumbnailUrl: string;
  storageProvider: MediaStorageProvider;
  storageBucket: string;
  storageObjectKey: string;
  storagePath: string;
  thumbStoragePath: string;
  mimeType: string;
  fileSizeBytes: number | null;
  playbackResolution: VodPlaybackResolution | null;
  playbackQualityLabel: string | null;
  paidContentAccess: CreatorContentAccessResolution | null;
  visibilityAccess: CreatorVideoVisibilityAccess | null;
  renditionStatuses: VodRenditionStatusItem[];
  publicClipMetadata: CreatorVideoPublicClipMetadata | null;
  createdAt: string;
  updatedAt: string;
};

type CreatorVideoRow = Tables<"videos">;
type CreatorVideoInsert = TablesInsert<"videos">;
type CreatorVideoUpdate = TablesUpdate<"videos">;
type PublicCreatorVideoCardAction = "list_by_owner" | "list_for_owners" | "list_latest";
type PublicCreatorVideoCardRow = {
  id?: unknown;
  ownerId?: unknown;
  title?: unknown;
  description?: unknown;
  visibility?: unknown;
  moderationStatus?: unknown;
  moderationReason?: unknown;
  moderatedAt?: unknown;
  moderatedBy?: unknown;
  thumbnailUrl?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  clip_metadata_public?: unknown;
  clip_title_text?: unknown;
  clip_subtitle_text?: unknown;
  clip_template_preset?: unknown;
  clip_title_style?: unknown;
  clip_title_position?: unknown;
};

const CREATOR_VIDEO_SELECT =
  "id,owner_id,title,description,playback_url,thumb_url,created_at,visibility,moderation_status,moderation_reason,moderated_at,moderated_by,storage_provider,storage_bucket,storage_object_key,storage_path,thumb_storage_path,mime_type,file_size_bytes,updated_at";
const PUBLIC_CREATOR_VIDEO_CARDS_URL = `${SUPABASE_FUNCTIONS_URL.replace(/\/+$/g, "")}/functions/v1/public-creator-video-cards`;

const toText = (value: unknown) => String(value ?? "").trim();

const logCreatorVideoUpload = (event: string, details?: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log("[creator-video-upload]", event, details ?? {});
};

export const formatCreatorVideoFileSize = (size?: number | null) => {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return "";
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
};

export const getCreatorVideoUploadLimitLabel = () =>
  formatCreatorVideoFileSize(CREATOR_VIDEO_CHANNEL_MOVIE_UPLOAD_LIMIT_BYTES) || "5 GB";

export const getCreatorVideoUploadLimitBytes = (maxUploadSizeMb?: number | null) => {
  const normalizedMb = typeof maxUploadSizeMb === "number" && Number.isFinite(maxUploadSizeMb) && maxUploadSizeMb > 0
    ? Math.floor(maxUploadSizeMb)
    : DEFAULT_APP_CONFIG.runtimeControls.max_upload_size_mb;
  return normalizedMb * 1024 * 1024;
};

export const getCreatorVideoRuntimeUploadLimitLabel = (maxUploadSizeMb?: number | null) =>
  formatCreatorVideoFileSize(getCreatorVideoUploadLimitBytes(maxUploadSizeMb)) || getCreatorVideoUploadLimitLabel();

export const isCreatorVideoFileOverChannelMovieLimit = (
  file: CreatorVideoFile,
  maxUploadSizeMb?: number | null,
) =>
  typeof file.size === "number"
    && Number.isFinite(file.size)
    && file.size > getCreatorVideoUploadLimitBytes(maxUploadSizeMb);

export const getCreatorVideoTooLargeMessage = (size?: number | null, maxUploadSizeMb?: number | null) => {
  const fileSize = formatCreatorVideoFileSize(size);
  const limit = getCreatorVideoRuntimeUploadLimitLabel(maxUploadSizeMb);
  return fileSize
    ? `This video is ${fileSize}. Platform videos support full movies up to ${CREATOR_VIDEO_MAX_RUNTIME_LABEL}; the current upload limit is ${limit}.`
    : `Platform videos support full movies up to ${CREATOR_VIDEO_MAX_RUNTIME_LABEL}; the current upload limit is ${limit}.`;
};

export const getCreatorVideoStorageLimitMessage = (size?: number | null) => {
  const fileSize = formatCreatorVideoFileSize(size);
  return fileSize
    ? `This ${fileSize} movie is above the current upload limit. Increase the creator video upload limit, then try again.`
    : "This movie is above the current upload limit. Increase the creator video upload limit, then try again.";
};

const normalizeVisibility = (value: unknown): CreatorVideoVisibility => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "public") return "public";
  if (normalized === "circle" || normalized === "circle_only" || normalized === "private") return "circle";
  return "draft";
};

const normalizeVisibilityAccessReason = (value: unknown): CreatorVideoVisibilityAccessReason => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "public_allowed"
    || normalized === "owner_allowed"
    || normalized === "circle_member_allowed"
    || normalized === "signed_out_requires_circle"
    || normalized === "circle_member_required"
    || normalized === "draft_owner_only"
    || normalized === "blocked"
    || normalized === "moderation_unavailable"
    || normalized === "media_unavailable"
    || normalized === "not_found"
  ) {
    return normalized;
  }
  return "unavailable";
};

const normalizeVisibilityAccess = (value: unknown): CreatorVideoVisibilityAccess => {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    allowed: row.allowed === true,
    visibility: normalizeVisibility(row.visibility),
    reason: normalizeVisibilityAccessReason(row.reason),
    isOwner: row.is_owner === true || row.isOwner === true,
    isBlocked: row.is_blocked === true || row.isBlocked === true,
    isCircleMember: row.is_circle_member === true || row.isCircleMember === true,
    hasPlayableSource: row.has_playable_source === true || row.hasPlayableSource === true,
    viewerUserId: toText(row.viewer_user_id ?? row.viewerUserId) || null,
    ownerUserId: toText(row.owner_user_id ?? row.ownerUserId) || null,
  };
};

const normalizeModerationStatus = (value: unknown): CreatorVideoModerationStatus => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "pending_review"
    || normalized === "reported"
    || normalized === "hidden"
    || normalized === "removed"
    || normalized === "banned"
  ) {
    return normalized;
  }
  return "clean";
};

const normalizePublicClipTitlePosition = (value: unknown): CreatorVideoPublicClipTitlePosition => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "top" || normalized === "center") return normalized;
  return "bottom";
};

const normalizePublicClipTitleStyle = (value: unknown): CreatorVideoPublicClipTitleStyle => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "bold" || normalized === "spotlight" || normalized === "trailer") return normalized;
  return "clean";
};

const normalizePublicClipTemplatePreset = (value: unknown): CreatorVideoPublicClipTemplatePreset | null => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "trailer"
    || normalized === "highlight"
    || normalized === "promo"
    || normalized === "event"
    || normalized === "reaction"
    || normalized === "platform_intro"
  ) {
    return normalized;
  }
  return null;
};

const createClientId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const next = char === "x" ? rand : (rand & 0x3) | 0x8;
    return next.toString(16);
  });

const getFileExtension = (file: CreatorVideoFile) => {
  const name = toText(file.name).toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
  if (ext) return ext.replace(/[^a-z0-9]/g, "") || "mp4";
  const mime = toText(file.mimeType).toLowerCase();
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("x-m4v")) return "m4v";
  return "mp4";
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

async function createSupabaseSignedUrl(path: string) {
  const normalizedPath = toText(path);
  if (!normalizedPath) return "";
  if (isHttpUrl(normalizedPath)) return normalizedPath;

  const { data, error } = await supabase.storage
    .from(CREATOR_VIDEO_BUCKET)
    .createSignedUrl(normalizedPath, CREATOR_VIDEO_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
}

async function createCreatorVideoPlaybackUrl(input: {
  id: string;
  storageProvider: MediaStorageProvider;
  storageBucket: string;
  storageObjectKey: string;
  storagePath: string;
  playbackUrl: string;
}) {
  if (input.storageProvider === "s3" && input.storageObjectKey) {
    return createSignedMediaDownload({
      surfaceType: "creator_video",
      provider: input.storageProvider,
      bucket: input.storageBucket,
      objectKey: input.storageObjectKey,
      recordId: input.id,
    }).catch(() => "");
  }
  return createSupabaseSignedUrl(input.storagePath || input.playbackUrl);
}

async function createCreatorVideoThumbnailUrl(input: {
  id: string;
  storageProvider: MediaStorageProvider;
  storageBucket: string;
  thumbStoragePath: string;
  thumbUrl: string;
}) {
  const thumbnailPath = toText(input.thumbStoragePath);
  if (!thumbnailPath) return toText(input.thumbUrl);

  if (input.storageProvider === "s3") {
    const signedThumbnailUrl = await createSignedMediaDownload({
      surfaceType: "creator_video",
      provider: input.storageProvider,
      bucket: input.storageBucket,
      objectKey: thumbnailPath,
      recordId: input.id,
    }).catch(() => "");
    if (signedThumbnailUrl) return signedThumbnailUrl;
  }

  return createSupabaseSignedUrl(thumbnailPath);
}

async function parseCreatorVideo(
  row: CreatorVideoRow,
  options?: { resolveLegacyPlaybackUrl?: boolean },
): Promise<CreatorVideo> {
  const id = toText(row.id);
  const storagePath = toText(row.storage_path);
  const storageProvider = normalizeMediaStorageProvider(row.storage_provider);
  const storageBucket = getMediaStorageProviderBucket({
    provider: storageProvider,
    bucket: row.storage_bucket,
    fallbackBucket: CREATOR_VIDEO_BUCKET,
  });
  const storageObjectKey = toText(row.storage_object_key) || storagePath || toText(row.playback_url);
  const playbackUrl = options?.resolveLegacyPlaybackUrl === true
    ? await createCreatorVideoPlaybackUrl({
      id,
      storageProvider,
      storageBucket,
      storageObjectKey,
      storagePath,
      playbackUrl: toText(row.playback_url),
    })
    : "";
  const thumbnailUrl = await createCreatorVideoThumbnailUrl({
    id,
    storageProvider,
    storageBucket,
    thumbStoragePath: toText(row.thumb_storage_path),
    thumbUrl: toText(row.thumb_url),
  });

  return {
    id,
    ownerId: toText(row.owner_id),
    title: toText(row.title) || "Untitled Video",
    description: toText(row.description),
    visibility: normalizeVisibility(row.visibility),
    moderationStatus: normalizeModerationStatus(row.moderation_status),
    moderationReason: toText(row.moderation_reason) || null,
    moderatedAt: toText(row.moderated_at) || null,
    moderatedBy: toText(row.moderated_by) || null,
    playbackUrl,
    thumbnailUrl,
    storageProvider,
    storageBucket,
    storageObjectKey,
    storagePath,
    thumbStoragePath: toText(row.thumb_storage_path),
    mimeType: toText(row.mime_type),
    fileSizeBytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null,
    playbackResolution: null,
    playbackQualityLabel: null,
    paidContentAccess: null,
    visibilityAccess: null,
    renditionStatuses: [],
    publicClipMetadata: null,
    createdAt: toText(row.created_at) || new Date().toISOString(),
    updatedAt: toText(row.updated_at) || toText(row.created_at) || new Date().toISOString(),
  };
}

const parsePublicClipMetadata = (row: PublicCreatorVideoCardRow): CreatorVideoPublicClipMetadata | null => {
  if (row.clip_metadata_public !== true) return null;
  const templatePreset = normalizePublicClipTemplatePreset(row.clip_template_preset);
  const titleText = toText(row.clip_title_text);
  const subtitleText = toText(row.clip_subtitle_text);
  if (!titleText && !subtitleText && !templatePreset) return null;

  return {
    isPublic: true,
    titleText,
    subtitleText,
    titlePosition: normalizePublicClipTitlePosition(row.clip_title_position),
    titleStyle: normalizePublicClipTitleStyle(row.clip_title_style),
    templatePreset,
  };
};

const parsePublicCreatorVideoCard = (row: PublicCreatorVideoCardRow): CreatorVideo => ({
  id: toText(row.id),
  ownerId: toText(row.ownerId),
  title: toText(row.title) || "Untitled Video",
  description: toText(row.description),
  visibility: "public",
  moderationStatus: normalizeModerationStatus(row.moderationStatus),
  moderationReason: toText(row.moderationReason) || null,
  moderatedAt: toText(row.moderatedAt) || null,
  moderatedBy: toText(row.moderatedBy) || null,
  playbackUrl: "",
  thumbnailUrl: toText(row.thumbnailUrl),
  storageProvider: "supabase",
  storageBucket: "",
  storageObjectKey: "",
  storagePath: "",
  thumbStoragePath: "",
  mimeType: toText(row.mimeType),
  fileSizeBytes: typeof row.fileSizeBytes === "number" ? row.fileSizeBytes : null,
  playbackResolution: null,
  playbackQualityLabel: null,
  paidContentAccess: null,
  visibilityAccess: null,
  renditionStatuses: [],
  publicClipMetadata: parsePublicClipMetadata(row),
  createdAt: toText(row.createdAt) || new Date().toISOString(),
  updatedAt: toText(row.updatedAt) || toText(row.createdAt) || new Date().toISOString(),
});

async function readPublicCreatorVideoCards(input: {
  action: PublicCreatorVideoCardAction;
  ownerId?: string;
  ownerIds?: string[];
  limit?: number;
}): Promise<CreatorVideo[]> {
  const response = await fetch(PUBLIC_CREATOR_VIDEO_CARDS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null) as { videos?: PublicCreatorVideoCardRow[] } | null;
  if (!response.ok || !Array.isArray(payload?.videos)) return [];
  return payload.videos.map(parsePublicCreatorVideoCard).filter((video) => !!video.id && video.visibility === "public");
}

async function attachRenditionStatuses(videos: CreatorVideo[]): Promise<CreatorVideo[]> {
  if (!videos.length) return videos;
  const statusMap = await readVideoRenditionStatuses(videos.map((video) => video.id));
  if (!statusMap.size) return videos;
  return videos.map((video) => ({
    ...video,
    renditionStatuses: statusMap.get(video.id) ?? video.renditionStatuses,
  }));
}

async function getRequiredUserId() {
  const { data, error } = await supabase.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId) {
    throw new Error("Sign in before managing creator videos.");
  }
  return userId;
}

export async function readCreatorVideos(
  ownerId: string,
  options?: { includeDrafts?: boolean; limit?: number },
): Promise<CreatorVideo[]> {
  const normalizedOwnerId = toText(ownerId);
  if (!normalizedOwnerId) return [];

  let query = supabase
    .from("videos")
    .select(CREATOR_VIDEO_SELECT)
    .eq("owner_id", normalizedOwnerId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 24);
  if (!options?.includeDrafts) {
    query = query.neq("visibility", "draft");
  }

  const { data, error } = await query.returns<CreatorVideoRow[]>();
  if (error || !data) return [];
  return attachRenditionStatuses(await Promise.all(data.map((row) => parseCreatorVideo(row))));
}

export async function readCreatorVideosForOwners(
  ownerIds: string[],
  options?: { limit?: number },
): Promise<CreatorVideo[]> {
  const normalizedOwnerIds = Array.from(
    new Set(ownerIds.map(toText).filter(Boolean)),
  ).slice(0, 100);
  if (!normalizedOwnerIds.length) return [];

  const limit = Math.max(1, Math.min(50, Math.floor(Number(options?.limit ?? 12))));
  return readPublicCreatorVideoCards({
    action: "list_for_owners",
    ownerIds: normalizedOwnerIds,
    limit,
  }).catch(() => []);
}

export async function readCreatorVideoForOwner(videoId: string): Promise<CreatorVideo | null> {
  const ownerId = await getRequiredUserId();
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) return null;

  const { data, error } = await supabase
    .from("videos")
    .select(CREATOR_VIDEO_SELECT)
    .eq("id", normalizedVideoId)
    .eq("owner_id", ownerId)
    .returns<CreatorVideoRow>()
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return parseCreatorVideo(data);
}

export async function readLatestPublicCreatorVideos(
  options?: { limit?: number },
): Promise<CreatorVideo[]> {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(options?.limit ?? 12))));
  return readPublicCreatorVideoCards({
    action: "list_latest",
    limit,
  }).catch(() => []);
}

export async function resolveCreatorVideoVisibilityAccess(videoId: string): Promise<CreatorVideoVisibilityAccess | null> {
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) return null;

  const { data, error } = await (supabase as any).rpc("resolve_creator_video_visibility_access", {
    p_video_id: normalizedVideoId,
  });
  if (error) throw error;
  return normalizeVisibilityAccess(data);
}

function createLockedCreatorVideo(
  videoId: string,
  access: CreatorVideoVisibilityAccess,
): CreatorVideo {
  const title = access.reason === "draft_owner_only"
    ? "Draft creator video"
    : access.reason === "blocked"
      ? "Creator video unavailable"
      : "Private creator video";
  const description = access.reason === "circle_member_required" || access.reason === "signed_out_requires_circle"
    ? "This creator video is private to the creator's Chi'lly Circle."
    : access.reason === "draft_owner_only"
      ? "This creator video is saved as a draft and only the creator can view it."
      : "This creator video is unavailable.";
  const now = new Date().toISOString();

  return {
    id: videoId,
    ownerId: access.ownerUserId ?? "",
    title,
    description,
    visibility: access.visibility,
    moderationStatus: access.reason === "moderation_unavailable" ? "hidden" : "clean",
    moderationReason: null,
    moderatedAt: null,
    moderatedBy: null,
    playbackUrl: "",
    thumbnailUrl: "",
    storageProvider: "supabase",
    storageBucket: CREATOR_VIDEO_BUCKET,
    storageObjectKey: "",
    storagePath: "",
    thumbStoragePath: "",
    mimeType: "",
    fileSizeBytes: null,
    playbackResolution: createUnavailableVodPlaybackResolution(videoId, access.reason),
    playbackQualityLabel: null,
    paidContentAccess: null,
    visibilityAccess: access,
    renditionStatuses: [],
    publicClipMetadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function readCreatorVideoForPlayer(videoId: string): Promise<CreatorVideo | null> {
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) return null;

  const visibilityAccess = await resolveCreatorVideoVisibilityAccess(normalizedVideoId).catch(() => null);
  if (visibilityAccess && !visibilityAccess.allowed) {
    return createLockedCreatorVideo(normalizedVideoId, visibilityAccess);
  }

  const { data, error } = await supabase
    .from("videos")
    .select(CREATOR_VIDEO_SELECT)
    .eq("id", normalizedVideoId)
    .in("moderation_status", ["clean", "reported"])
    .returns<CreatorVideoRow>()
    .maybeSingle();

  if (error || !data) return null;
  const row = data as CreatorVideoRow;
  const parsed = await parseCreatorVideo(row, { resolveLegacyPlaybackUrl: false });
  const parsedWithAccess = {
    ...parsed,
    visibilityAccess: visibilityAccess ?? {
      allowed: true,
      visibility: parsed.visibility,
      reason: parsed.visibility === "circle" ? "circle_member_allowed" as const : "public_allowed" as const,
      isOwner: false,
      isBlocked: false,
      isCircleMember: parsed.visibility === "circle",
      hasPlayableSource: !!(parsed.storagePath || parsed.storageObjectKey),
      viewerUserId: null,
      ownerUserId: parsed.ownerId,
    },
  };

  const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const viewerUserId = toText(authData.user?.id);
  const viewerOwnsVideo = !!viewerUserId && viewerUserId === parsedWithAccess.ownerId;
  if (parsedWithAccess.visibility === "draft" && !viewerOwnsVideo) {
    return createLockedCreatorVideo(normalizedVideoId, {
      allowed: false,
      visibility: "draft",
      reason: "draft_owner_only",
      isOwner: false,
      isBlocked: false,
      isCircleMember: false,
      hasPlayableSource: false,
      viewerUserId: viewerUserId || null,
      ownerUserId: parsedWithAccess.ownerId,
    });
  }

  const paidContentAccess = await resolveCreatorContentAccess({
    contentType: "creator_video",
    contentId: parsedWithAccess.id,
  });
  if (paidContentAccess.resolverStatus === "resolved" && !paidContentAccess.allowed) {
    return {
      ...parsedWithAccess,
      playbackUrl: "",
      playbackResolution: createUnavailableVodPlaybackResolution(parsedWithAccess.id, paidContentAccess.reason),
      playbackQualityLabel: null,
      paidContentAccess,
    };
  }

  const playbackResolution = await resolveSignedVideoPlaybackSource({
    videoId: parsedWithAccess.id,
    storageProvider: parsedWithAccess.storageProvider,
    fallbackBucket: parsedWithAccess.storageBucket,
  });
  const legacyPlaybackUrl = !playbackResolution.defaultPlaybackUrl && (
    playbackResolution.legacyPlaybackAllowed
    || playbackResolution.legacyQualityEnforcement === "resolver_unavailable"
  )
    ? await createCreatorVideoPlaybackUrl({
      id: parsedWithAccess.id,
      storageProvider: parsedWithAccess.storageProvider,
      storageBucket: parsedWithAccess.storageBucket,
      storageObjectKey: parsedWithAccess.storageObjectKey,
      storagePath: parsedWithAccess.storagePath,
      playbackUrl: toText(row.playback_url),
    })
    : "";

  return {
    ...parsedWithAccess,
    playbackUrl: playbackResolution.defaultPlaybackUrl || legacyPlaybackUrl,
    playbackResolution,
    playbackQualityLabel: playbackResolution.defaultPlaybackQuality ?? (legacyPlaybackUrl ? "legacy_single_file" : null),
    paidContentAccess,
    renditionStatuses: playbackResolution.renditionStatuses.length
      ? playbackResolution.renditionStatuses
      : parsed.renditionStatuses,
  };
}

export async function uploadCreatorVideo(input: {
  file: CreatorVideoFile;
  title: string;
  description?: string;
  thumbUrl?: string;
  visibility: CreatorVideoVisibility;
  maxUploadSizeMb?: number | null;
}): Promise<CreatorVideo> {
  const ownerId = await getRequiredUserId();
  const title = toText(input.title);
  const fileUri = toText(input.file.uri);
  if (!title) throw new Error("Video title is required.");
  if (!fileUri) throw new Error("Choose a video file before uploading.");
  const runtimeUploadLimitMb = typeof input.maxUploadSizeMb === "number" && Number.isFinite(input.maxUploadSizeMb)
    ? input.maxUploadSizeMb
    : (await readAppConfig().catch(() => DEFAULT_APP_CONFIG)).runtimeControls.max_upload_size_mb;
  if (isCreatorVideoFileOverChannelMovieLimit(input.file, runtimeUploadLimitMb)) {
    throw new Error(getCreatorVideoTooLargeMessage(input.file.size, runtimeUploadLimitMb));
  }

  const id = createClientId();
  const mimeType = toText(input.file.mimeType) || "video/mp4";
  const storagePath = `${ownerId}/${id}/source.${getFileExtension(input.file)}`;
  let uploadedObject: {
    provider: MediaStorageProvider;
    bucket: string;
    objectKey: string;
  } | null = null;

  try {
    logCreatorVideoUpload("storage_upload_start", {
      id,
      name: toText(input.file.name) || "unnamed",
      mimeType,
      size: input.file.size ?? null,
      visibility: normalizeVisibility(input.visibility),
    });
    uploadedObject = await uploadFileToMediaStorage({
      surfaceType: "creator_video",
      uri: fileUri,
      objectKey: storagePath,
      mimeType,
      fileName: input.file.name,
      sizeBytes: input.file.size,
    });
  } catch (error) {
    logCreatorVideoUpload("storage_upload_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }

  logCreatorVideoUpload("storage_upload_succeeded", { id });
  if (!uploadedObject) throw new Error("Video upload could not be completed. Try again.");

  const payload: CreatorVideoInsert = {
    id,
    owner_id: ownerId,
    title,
    description: toText(input.description) || null,
    playback_url: null,
    thumb_url: toText(input.thumbUrl) || null,
    visibility: normalizeVisibility(input.visibility),
    moderation_status: "clean",
    storage_provider: uploadedObject.provider,
    storage_bucket: uploadedObject.bucket,
    storage_object_key: uploadedObject.objectKey,
    storage_path: uploadedObject.objectKey,
    thumb_storage_path: null,
    mime_type: mimeType,
    file_size_bytes: typeof input.file.size === "number" ? input.file.size : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("videos")
    .insert(payload)
    .select(CREATOR_VIDEO_SELECT)
    .returns<CreatorVideoRow>()
    .single();

  if (error || !data) {
    logCreatorVideoUpload("metadata_insert_failed", {
      id,
      message: error instanceof Error ? error.message : "missing data",
    });
    await deleteStoredMediaObject({
      surfaceType: "creator_video",
      provider: uploadedObject.provider,
      bucket: uploadedObject.bucket,
      objectKey: uploadedObject.objectKey,
    }).catch(() => undefined);
    throw error ?? new Error("Unable to save uploaded video metadata.");
  }

  logCreatorVideoUpload("metadata_insert_succeeded", { id, visibility: payload.visibility });
  await recordOriginalVideoRendition(id);

  const createdVideo = await parseCreatorVideo(data);
  try {
    const usageResult = await recordCreatorVideoUploadUsage(createdVideo.id);
    logCreatorVideoUpload("usage_metering_recorded", {
      id: createdVideo.id,
      status: usageResult.status,
      usageEventRecorded: usageResult.usageEventRecorded,
      storageEventRecorded: usageResult.storageEventRecorded,
    });
  } catch (usageError) {
    logCreatorVideoUpload("usage_metering_failed", {
      id: createdVideo.id,
      message: usageError instanceof Error ? usageError.message : "unknown",
    });
  }

  return createdVideo;
}

export async function updateCreatorVideoMetadata(
  videoId: string,
  patch: {
    title?: string;
    description?: string;
    thumbUrl?: string;
    visibility?: CreatorVideoVisibility;
  },
): Promise<CreatorVideo> {
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) throw new Error("Missing creator video id.");

  const update: CreatorVideoUpdate = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) update.title = toText(patch.title) || "Untitled Video";
  if (patch.description !== undefined) update.description = toText(patch.description) || null;
  if (patch.thumbUrl !== undefined) update.thumb_url = toText(patch.thumbUrl) || null;
  if (patch.visibility !== undefined) update.visibility = normalizeVisibility(patch.visibility);

  const { data, error } = await supabase
    .from("videos")
    .update(update)
    .eq("id", normalizedVideoId)
    .select(CREATOR_VIDEO_SELECT)
    .returns<CreatorVideoRow>()
    .single();

  if (error || !data) throw error ?? new Error("Unable to update creator video.");
  return parseCreatorVideo(data);
}

export async function moderateCreatorVideo(input: {
  videoId: string;
  moderationStatus: CreatorVideoModerationStatus;
  reason?: string | null;
}): Promise<CreatorVideo> {
  const normalizedVideoId = toText(input.videoId);
  if (!normalizedVideoId) throw new Error("Missing creator video id.");

  const { data: sessionData } = await supabase.auth.getSession();
  const moderatedBy = toText(sessionData.session?.user?.id) || null;

  const update: CreatorVideoUpdate = {
    moderation_status: normalizeModerationStatus(input.moderationStatus),
    moderation_reason: toText(input.reason) || null,
    moderated_at: new Date().toISOString(),
    moderated_by: moderatedBy,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("videos")
    .update(update)
    .eq("id", normalizedVideoId)
    .select(CREATOR_VIDEO_SELECT)
    .returns<CreatorVideoRow>()
    .single();

  if (error || !data) throw error ?? new Error("Unable to update creator video moderation status.");
  return parseCreatorVideo(data);
}

export async function deleteCreatorVideo(
  video: Pick<CreatorVideo, "id" | "storageProvider" | "storageBucket" | "storageObjectKey" | "storagePath" | "thumbStoragePath">,
): Promise<void> {
  const videoId = toText(video.id);
  if (!videoId) return;

  const { error } = await supabase.from("videos").delete().eq("id", videoId);
  if (error) throw error;

  const provider = normalizeMediaStorageProvider(video.storageProvider);
  const objectKey = toText(video.storageObjectKey) || toText(video.storagePath);
  const thumbnailPath = toText(video.thumbStoragePath);
  if (provider === "s3" && objectKey) {
    await deleteStoredMediaObject({
      surfaceType: "creator_video",
      provider,
      bucket: toText(video.storageBucket),
      objectKey,
      recordId: videoId,
    }).catch(() => undefined);
    if (thumbnailPath) {
      await supabase.storage.from(CREATOR_VIDEO_BUCKET).remove([thumbnailPath]).catch(() => undefined);
    }
  } else {
    const paths = [toText(video.storagePath), thumbnailPath].filter(Boolean);
    if (paths.length) {
      await supabase.storage.from(CREATOR_VIDEO_BUCKET).remove(paths).catch(() => undefined);
    }
  }
}
