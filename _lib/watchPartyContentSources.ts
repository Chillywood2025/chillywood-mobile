import { readCreatorVideoForPlayer, type CreatorVideo } from "./creatorVideos";
import { readPublicDiscoveryFeedItem } from "./discoveryFeed";
import { isPubliclyReleasedTitle } from "./publicTitles";
import { resolveSpectatorAccess } from "./spectatorAccess";
import { readSpectatorPlaybackReadout } from "./spectatorPlayback";
import { supabase } from "./supabase";
import type { WatchPartyContentSourceType, WatchPartyState } from "./watchParty";

type TitleSourceRow = {
  id: string;
  title: string | null;
  poster_url: string | null;
  video_url: string | null;
  is_published: boolean | null;
  status: string | null;
  release_at: string | null;
  release_date: string | null;
};

type PublicCreatorVideoMetadataRow = {
  id: string;
  title: string | null;
};

type WatchPartyContentDisplayHandoff = {
  createdAt: number;
  displayName: string;
  sourceId: string;
  sourceType: WatchPartyContentSourceType;
};

export type CreatorVideoWatchPartyBlockReason =
  | "unavailable"
  | "draft"
  | "moderated"
  | "missing_source"
  | "ended";

export type WatchPartyResolvedContentSource = {
  sourceType: WatchPartyContentSourceType | null;
  sourceId: string | null;
  displayName: string | null;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  isPlayable: boolean;
  unavailableReason: CreatorVideoWatchPartyBlockReason | null;
  attributionLabel?: string | null;
  sourceEnded?: boolean;
};

export type WatchPartyResolvedContentDisplay = Pick<
  WatchPartyResolvedContentSource,
  "sourceType" | "sourceId" | "displayName" | "thumbnailUrl" | "attributionLabel" | "sourceEnded"
>;

const toText = (value: unknown) => String(value ?? "").trim();
const DISPLAY_HANDOFF_TTL_MS = 5 * 60 * 1000;
const DISPLAY_HANDOFF_MAX_ENTRIES = 20;
const contentDisplayHandoffs = new Map<string, WatchPartyContentDisplayHandoff>();

const normalizePartyId = (value: unknown) => toText(value).toUpperCase();

const pruneContentDisplayHandoffs = (now: number) => {
  for (const [partyId, handoff] of contentDisplayHandoffs) {
    if (now - handoff.createdAt > DISPLAY_HANDOFF_TTL_MS) contentDisplayHandoffs.delete(partyId);
  }
  while (contentDisplayHandoffs.size > DISPLAY_HANDOFF_MAX_ENTRIES) {
    const oldestPartyId = contentDisplayHandoffs.keys().next().value;
    if (typeof oldestPartyId !== "string") break;
    contentDisplayHandoffs.delete(oldestPartyId);
  }
};

export const rememberWatchPartyContentDisplayHandoff = (input: {
  partyId: string;
  sourceType: WatchPartyContentSourceType | null;
  sourceId: string | null;
  displayName: string | null;
}) => {
  const partyId = normalizePartyId(input.partyId);
  const sourceId = toText(input.sourceId);
  const displayName = toText(input.displayName).slice(0, 140);
  if (!partyId || !input.sourceType || !sourceId || !displayName) return;
  const now = Date.now();
  pruneContentDisplayHandoffs(now);
  contentDisplayHandoffs.delete(partyId);
  contentDisplayHandoffs.set(partyId, {
    createdAt: now,
    displayName,
    sourceId,
    sourceType: input.sourceType,
  });
  pruneContentDisplayHandoffs(now);
};

export const readWatchPartyContentDisplayHandoff = (input: {
  partyId: string;
  sourceType: WatchPartyContentSourceType | null;
  sourceId: string | null;
}) => {
  const partyId = normalizePartyId(input.partyId);
  const sourceId = toText(input.sourceId);
  const now = Date.now();
  pruneContentDisplayHandoffs(now);
  const handoff = contentDisplayHandoffs.get(partyId);
  if (!handoff || handoff.sourceType !== input.sourceType || handoff.sourceId !== sourceId) return null;
  return handoff.displayName;
};

const readPublicCreatorVideoMetadata = async (sourceId: string) => {
  const { data: rawData, error } = await supabase
    .from("videos")
    .select("id,title")
    .eq("id", sourceId)
    .eq("visibility", "public")
    .in("moderation_status", ["clean", "pending_review", "reported"])
    .maybeSingle();
  const data = rawData as PublicCreatorVideoMetadataRow | null;
  if (error || !data) return null;
  return data;
};

export const resolveWatchPartySourceType = (
  room: Pick<WatchPartyState, "sourceType" | "titleId"> | null | undefined,
): WatchPartyContentSourceType | null => {
  if (room?.sourceType === "creator_video") return "creator_video";
  if (room?.sourceType === "spectator_playback") return "spectator_playback";
  if (room?.sourceType === "platform_title") return "platform_title";
  return room?.titleId ? "platform_title" : null;
};

export const resolveWatchPartySourceId = (
  room: Pick<WatchPartyState, "sourceType" | "sourceId" | "titleId"> | null | undefined,
) => {
  const sourceType = resolveWatchPartySourceType(room);
  const sourceId = toText(room?.sourceId);
  const titleId = toText(room?.titleId);
  if (sourceType === "creator_video") return sourceId || null;
  if (sourceType === "spectator_playback") return sourceId || null;
  if (sourceType === "platform_title") return sourceId || titleId || null;
  return null;
};

export const getCreatorVideoWatchPartyBlockReason = (
  video: CreatorVideo | null | undefined,
): CreatorVideoWatchPartyBlockReason | null => {
  if (!video) return "unavailable";
  if (video.visibility !== "public") return "draft";
  if (video.moderationStatus === "hidden" || video.moderationStatus === "removed" || video.moderationStatus === "banned") {
    return "moderated";
  }
  if (!toText(video.playbackUrl)) return "missing_source";
  return null;
};

export const getCreatorVideoWatchPartyBlockCopy = (
  reason: CreatorVideoWatchPartyBlockReason | null,
) => {
  switch (reason) {
    case "draft":
      return {
        title: "This video is still a draft.",
        body: "Publish the creator video before starting a public Watch-Party Live room.",
      };
    case "moderated":
      return {
        title: "Creator video unavailable",
        body: "This upload is not available for Watch-Party Live right now.",
      };
    case "missing_source":
      return {
        title: "Creator video unavailable",
        body: "This upload does not have a playable source yet.",
      };
    case "unavailable":
      return {
        title: "Creator video unavailable",
        body: "Chi'llywood could not resolve this uploaded video for Watch-Party Live.",
      };
    case "ended":
      return {
        title: "Source live has ended",
        body: "This spectator source is not live anymore.",
      };
    default:
      return null;
  }
};

const readMetadataText = (metadata: unknown, keys: string[]) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = toText(record[key]);
    if (value) return value;
  }
  return "";
};

export async function resolveWatchPartyContentSource(
  room: WatchPartyState,
): Promise<WatchPartyResolvedContentSource> {
  const sourceType = resolveWatchPartySourceType(room);
  const sourceId = resolveWatchPartySourceId(room);
  return resolveWatchPartyContentSourceByParts({ sourceType, sourceId });
}

export async function resolveWatchPartyContentDisplay(
  room: WatchPartyState,
): Promise<WatchPartyResolvedContentDisplay> {
  const sourceType = resolveWatchPartySourceType(room);
  const sourceId = resolveWatchPartySourceId(room);
  return resolveWatchPartyContentDisplayByParts({ sourceType, sourceId });
}

export async function resolveWatchPartyContentDisplayByParts(input: {
  sourceType: WatchPartyContentSourceType | null;
  sourceId: string | null;
}): Promise<WatchPartyResolvedContentDisplay> {
  const sourceType = input.sourceType;
  const sourceId = toText(input.sourceId) || null;

  if (sourceType === "creator_video" && sourceId) {
    const video = await readPublicCreatorVideoMetadata(sourceId).catch(() => null);
    return {
      sourceType,
      sourceId,
      displayName: video?.title ?? null,
      thumbnailUrl: null,
      attributionLabel: null,
      sourceEnded: false,
    };
  }

  if (sourceType === "spectator_playback" && sourceId) {
    const item = await readPublicDiscoveryFeedItem(sourceId).catch(() => null);
    const displayName = toText(item?.title) || null;
    const platformName = item
      ? readMetadataText(item.metadata, [
        "platformName",
        "platform_name",
        "channelName",
        "channel_name",
        "creatorName",
        "creator_name",
      ]) || "this Platform"
      : null;
    return {
      sourceType,
      sourceId,
      displayName,
      thumbnailUrl: item?.thumbnail_url ?? null,
      attributionLabel: displayName && platformName ? `Watching ${displayName} from ${platformName}` : null,
      sourceEnded: item?.live_state === "ended",
    };
  }

  if (sourceType === "platform_title" && sourceId) {
    const result = await supabase
      .from("titles")
      .select("id,title,poster_url,is_published,status,release_at,release_date")
      .eq("id", sourceId)
      .maybeSingle();
    const candidate = result.data as Omit<TitleSourceRow, "video_url"> | null;
    const data = candidate && isPubliclyReleasedTitle(candidate) ? candidate : null;
    return {
      sourceType,
      sourceId,
      displayName: data?.title ? String(data.title) : null,
      thumbnailUrl: data?.poster_url ? String(data.poster_url) : null,
      attributionLabel: null,
      sourceEnded: false,
    };
  }

  return {
    sourceType,
    sourceId,
    displayName: null,
    thumbnailUrl: null,
    attributionLabel: null,
    sourceEnded: false,
  };
}

export async function resolveWatchPartyContentSourceByParts(input: {
  sourceType: WatchPartyContentSourceType | null;
  sourceId: string | null;
}): Promise<WatchPartyResolvedContentSource> {
  const sourceType = input.sourceType;
  const sourceId = toText(input.sourceId) || null;
  if (sourceType === "creator_video") {
    const [video, publicMetadataVideo] = sourceId
      ? await Promise.all([
        readCreatorVideoForPlayer(sourceId).catch(() => null),
        readPublicCreatorVideoMetadata(sourceId).catch(() => null),
      ])
      : [null, null];
    const unavailableReason = getCreatorVideoWatchPartyBlockReason(video);
    return {
      sourceType,
      sourceId,
      displayName: publicMetadataVideo?.title ?? video?.title ?? null,
      playbackUrl: video?.playbackUrl ?? null,
      thumbnailUrl: video?.thumbnailUrl ?? null,
      isPlayable: !unavailableReason,
      unavailableReason,
    };
  }

  if (sourceType === "spectator_playback" && sourceId) {
    const item = await readPublicDiscoveryFeedItem(sourceId).catch(() => null);
    if (!item) {
      return {
        sourceType,
        sourceId,
        displayName: null,
        playbackUrl: null,
        thumbnailUrl: null,
        isPlayable: false,
        unavailableReason: "unavailable",
        attributionLabel: null,
        sourceEnded: false,
      };
    }

    const decision = resolveSpectatorAccess(item);
    const playback = await readSpectatorPlaybackReadout(item, decision).catch(() => null);
    const displayName = toText(item.title) || "Spectator source";
    const platformName = readMetadataText(item.metadata, [
      "platformName",
      "platform_name",
      "channelName",
      "channel_name",
      "creatorName",
      "creator_name",
    ]) || "this Platform";
    const sourceEnded = item.live_state === "ended" || playback?.state === "ended";
    const isPlayable = playback?.canRenderPlayback === true && !!toText(playback.playbackUrl);

    return {
      sourceType,
      sourceId,
      displayName,
      playbackUrl: isPlayable ? playback?.playbackUrl ?? null : null,
      thumbnailUrl: item.thumbnail_url ?? null,
      isPlayable,
      unavailableReason: sourceEnded ? "ended" : isPlayable ? null : "unavailable",
      attributionLabel: `Watching ${displayName} from ${platformName}`,
      sourceEnded,
    };
  }

  if (sourceType === "platform_title" && sourceId) {
    const result = await supabase
      .from("titles")
      .select("id,title,poster_url,video_url,is_published,status,release_at,release_date")
      .eq("id", sourceId)
      .maybeSingle();
    const candidate = result.data as TitleSourceRow | null;
    const data = candidate && isPubliclyReleasedTitle(candidate) ? candidate : null;

    return {
      sourceType,
      sourceId,
      displayName: data?.title ? String(data.title) : null,
      playbackUrl: data?.video_url ? String(data.video_url) : null,
      thumbnailUrl: data?.poster_url ? String(data.poster_url) : null,
      isPlayable: !!data,
      unavailableReason: data ? null : "unavailable",
    };
  }

  return {
    sourceType: null,
    sourceId: null,
    displayName: null,
    playbackUrl: null,
    thumbnailUrl: null,
    isPlayable: false,
    unavailableReason: "unavailable",
  };
}
