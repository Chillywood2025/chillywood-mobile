import type { DiscoveryFeedItem } from "./discoveryFeed";
import { isFeedItemPubliclyDiscoverable } from "./discoveryFeed";
import type { SpectatorPlaybackReadout } from "./spectatorPlayback";
import { supabase } from "./supabase";

export type SpectatorLaunchAction = "start_watch_party" | "start_live_reaction";
export type SpectatorLaunchKind = "content" | "live";

export type SpectatorLaunchEligibility = {
  kind: SpectatorLaunchKind;
  primaryAction: SpectatorLaunchAction;
  primaryLabel: "Start Watch-Party Live" | "Start Live Watch-Party";
  secondaryLabel: "Watch with your Chi’lly Circle";
  reactionLabel: "Start Reaction Room" | null;
  canStartWatchPartyLive: boolean;
  canStartLiveWatchParty: boolean;
  canShare: boolean;
  disabledReason: string | null;
};

export type SpectatorStartRoomResponse = {
  childRoomId: string;
  fullRoomTokenForSpectators: false;
  originalRoomPublishPermission?: false;
  originalRoomTokenReturned: false;
  route: string;
  roomType: "live" | "title";
  source?: {
    rootSourceId?: string | null;
    sourceItemId?: string | null;
    sourcePublicPlaybackId?: string | null;
    sourceType?: string | null;
  };
};

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();
const WATCH_PARTY_REUSE_DISABLED_COPY = "This live can’t be used for a watch party";

export const classifySpectatorLaunchKind = (item: DiscoveryFeedItem | null | undefined): SpectatorLaunchKind => {
  if (!item) return "content";
  const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
    ? item.metadata as Record<string, unknown>
    : {};
  const metadataSourceType = toLowerText(
    metadata.source_type
    ?? metadata.sourceType
    ?? metadata.room_type
    ?? metadata.roomType
    ?? metadata.source_kind
    ?? metadata.sourceKind,
  );
  if (
    item.item_type === "live_room"
    || metadataSourceType === "live_stage"
    || metadataSourceType === "live"
    || metadataSourceType === "live_room"
    || (item.source_type === "watch_party_room" && item.live_state === "live")
  ) {
    return "live";
  }
  return "content";
};

export const resolveSpectatorLaunchEligibility = (
  item: DiscoveryFeedItem | null | undefined,
  playback: SpectatorPlaybackReadout | null | undefined,
): SpectatorLaunchEligibility => {
  const kind = classifySpectatorLaunchKind(item);
  const isLive = kind === "live";
  const primaryAction: SpectatorLaunchAction = isLive ? "start_live_reaction" : "start_watch_party";
  const primaryLabel = isLive ? "Start Live Watch-Party" : "Start Watch-Party Live";
  const canRenderPlayback = playback?.canRenderPlayback === true && !!toText(playback.playbackUrl);
  const publicSafe = !!item && isFeedItemPubliclyDiscoverable(item);
  const sourceEnded = item?.live_state === "ended" || playback?.state === "ended";
  const protectedSource = item?.visibility === "private"
    || item?.access_type === "private"
    || item?.access_type === "invite_only"
    || item?.requires_ticket_to_watch === true
    || item?.requires_subscription_to_watch === true
    || item?.requires_premium_to_join === true;
  const spectatorAllowed = item?.allow_spectator_view === true
    && item?.is_spectator_enabled === true
    && item?.is_spectator_playback_enabled === true;
  const canStartWatchPartyLive = !isLive
    && publicSafe
    && spectatorAllowed
    && item?.allow_watch_party_from_spectator === true
    && !protectedSource
    && !sourceEnded
    && canRenderPlayback;
  const canStartLiveWatchParty = isLive
    && publicSafe
    && spectatorAllowed
    && item?.allow_live_reaction_rooms === true
    && !protectedSource
    && !sourceEnded
    && canRenderPlayback;

  let disabledReason: string | null = null;
  if (sourceEnded) {
    disabledReason = "Source live has ended";
  } else if (!publicSafe || protectedSource || !spectatorAllowed || !canRenderPlayback) {
    disabledReason = WATCH_PARTY_REUSE_DISABLED_COPY;
  } else if (isLive && item?.allow_live_reaction_rooms !== true) {
    disabledReason = WATCH_PARTY_REUSE_DISABLED_COPY;
  } else if (!isLive && item?.allow_watch_party_from_spectator !== true) {
    disabledReason = WATCH_PARTY_REUSE_DISABLED_COPY;
  }

  return {
    kind,
    primaryAction,
    primaryLabel,
    secondaryLabel: "Watch with your Chi’lly Circle",
    reactionLabel: isLive ? "Start Reaction Room" : null,
    canStartWatchPartyLive,
    canStartLiveWatchParty,
    canShare: publicSafe && item?.allow_public_share === true,
    disabledReason,
  };
};

const ERROR_MESSAGES: Record<string, string> = {
  blocked: "This source is not available to this account.",
  premium_required: "Premium is required before starting this watch party.",
  rate_limited: "Try again in a few minutes.",
  sign_in_required: "Sign in before starting a watch party.",
  source_ended: "Source live has ended",
  source_not_found: "This source is not available.",
  source_not_public: "This source is not public-safe.",
  source_reuse_disabled: WATCH_PARTY_REUSE_DISABLED_COPY,
};

export async function startSpectatorChildRoom(
  action: SpectatorLaunchAction,
  itemId: string,
): Promise<SpectatorStartRoomResponse> {
  const normalizedItemId = toText(itemId);
  if (!normalizedItemId) {
    throw Object.assign(new Error(ERROR_MESSAGES.source_not_found), { code: "source_not_found" });
  }

  const { data, error } = await supabase.functions.invoke("spectator-start-room", {
    body: {
      action,
      itemId: normalizedItemId,
    },
  });

  if (error) {
    const responseContext = error.context;
    const responsePayload = typeof Response !== "undefined" && responseContext instanceof Response
      ? await responseContext.clone().json().catch(() => null) as { error?: unknown; message?: unknown } | null
      : error.context as { error?: unknown; message?: unknown } | undefined;
    const code = toText(responsePayload?.error || error.name || "source_reuse_disabled");
    throw Object.assign(
      new Error(toText(responsePayload?.message) || ERROR_MESSAGES[code] || ERROR_MESSAGES.source_reuse_disabled),
      { code },
    );
  }

  const payload = (data ?? {}) as Partial<SpectatorStartRoomResponse>;
  const childRoomId = toText(payload.childRoomId);
  if (!childRoomId || payload.originalRoomTokenReturned !== false || payload.fullRoomTokenForSpectators !== false) {
    throw Object.assign(new Error(ERROR_MESSAGES.source_reuse_disabled), { code: "source_reuse_disabled" });
  }

  return {
    childRoomId,
    fullRoomTokenForSpectators: false,
    originalRoomPublishPermission: payload.originalRoomPublishPermission === false ? false : undefined,
    originalRoomTokenReturned: false,
    route: toText(payload.route),
    roomType: payload.roomType === "live" ? "live" : "title",
    source: payload.source,
  };
}

export const buildSpectatorDeepLink = (itemId: string) => (
  `chillywoodmobile://spectate/${encodeURIComponent(toText(itemId))}`
);
