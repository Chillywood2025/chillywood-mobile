import { readCreatorVideoForPlayer, type CreatorVideo } from "./creatorVideos";
import { readPublicDiscoveryFeedItem } from "./discoveryFeed";
import { resolveSpectatorAccess } from "./spectatorAccess";
import { readSpectatorPlaybackReadout } from "./spectatorPlayback";
import { supabase } from "./supabase";
import type { WatchPartyContentSourceType, WatchPartyState } from "./watchParty";

type TitleSourceRow = {
  id: string;
  title: string | null;
  poster_url: string | null;
  video_url: string | null;
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

const toText = (value: unknown) => String(value ?? "").trim();

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

export async function resolveWatchPartyContentSourceByParts(input: {
  sourceType: WatchPartyContentSourceType | null;
  sourceId: string | null;
}): Promise<WatchPartyResolvedContentSource> {
  const sourceType = input.sourceType;
  const sourceId = toText(input.sourceId) || null;
  if (sourceType === "creator_video") {
    const video = sourceId ? await readCreatorVideoForPlayer(sourceId) : null;
    const unavailableReason = getCreatorVideoWatchPartyBlockReason(video);
    return {
      sourceType,
      sourceId,
      displayName: video?.title ?? null,
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
      .select("id,title,poster_url,video_url")
      .eq("id", sourceId)
      .maybeSingle();
    const data = result.data as TitleSourceRow | null;

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
