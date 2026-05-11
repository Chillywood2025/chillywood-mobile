import type { DiscoveryFeedItem } from "./discoveryFeed";
import { isFeedItemPubliclyDiscoverable, isPublicSpectatorSafeRightsStatus } from "./discoveryFeed";
import type { SpectatorAccessDecision } from "./spectatorAccess";

export type SpectatorPlaybackState =
  | "loading"
  | "not_configured"
  | "waiting_for_egress"
  | "available"
  | "unavailable"
  | "ended"
  | "error"
  | "blocked_private"
  | "blocked_protected"
  | "blocked_title_rights"
  | "blocked_ticketed"
  | "blocked_premium_full_room"
  | "blocked_not_public_safe";

export type SpectatorPlaybackReadout = {
  state: SpectatorPlaybackState;
  title: string;
  copy: string;
  guardrails: string[];
  canRenderPlayback: boolean;
  publicHlsUrl: string | null;
  fullRoomRequiresPremium: boolean;
  fullRoomRequiresTicket: boolean;
  fullRoomTokenForSpectators: false;
};

type PlaybackSourceInput = {
  provedPublicHlsUrl?: string | null;
};

const BLOCKED_GUARDRAILS = [
  "No mic or camera controls",
  "No full LiveKit room token",
  "No HLS or Egress playback URL",
  "No real ad playback or CTV inventory",
  "No host controls or room mutation",
];

const WATCH_ONLY_GUARDRAILS = [
  "Watch-only spectator playback",
  "No mic or camera controls",
  "No full LiveKit room token",
  "No host controls or room mutation",
];

const normalizeText = (value: unknown) => String(value ?? "").trim();

const isProvedPublicHlsUrl = (value: unknown) => {
  const normalized = normalizeText(value);
  return /^https:\/\/[^?#]+\.m3u8(?:[?#].*)?$/i.test(normalized) ? normalized : null;
};

const blockedReadout = (
  state: SpectatorPlaybackState,
  title: string,
  copy: string,
  decision: SpectatorAccessDecision,
): SpectatorPlaybackReadout => ({
  state,
  title,
  copy,
  guardrails: BLOCKED_GUARDRAILS,
  canRenderPlayback: false,
  publicHlsUrl: null,
  fullRoomRequiresPremium: decision.requiresPremium,
  fullRoomRequiresTicket: decision.requiresTicket,
  fullRoomTokenForSpectators: false,
});

export function resolveSpectatorPlaybackState(
  item: DiscoveryFeedItem | null,
  decision: SpectatorAccessDecision | null,
  source: PlaybackSourceInput = {},
): SpectatorPlaybackReadout {
  if (!item || !decision) {
    return {
      state: "loading",
      title: "Checking spectator playback",
      copy: "Spectator playback is waiting on backed metadata.",
      guardrails: BLOCKED_GUARDRAILS,
      canRenderPlayback: false,
      publicHlsUrl: null,
      fullRoomRequiresPremium: true,
      fullRoomRequiresTicket: false,
      fullRoomTokenForSpectators: false,
    };
  }

  if (!isFeedItemPubliclyDiscoverable(item)) {
    return blockedReadout(
      "blocked_not_public_safe",
      "Spectator playback is blocked.",
      "This item is not public-safe discovery content.",
      decision,
    );
  }

  const rightsStatus = normalizeText(item.rights_status) || decision.rightsStatus;
  if (!isPublicSpectatorSafeRightsStatus(rightsStatus)) {
    const state: SpectatorPlaybackState = rightsStatus.includes("protected")
      ? "blocked_protected"
      : rightsStatus.includes("title")
        ? "blocked_title_rights"
        : "blocked_not_public_safe";

    return blockedReadout(
      state,
      "Spectator playback is blocked by rights.",
      "This content is not available for public spectator playback.",
      decision,
    );
  }

  const accessType = normalizeText(item.access_type) || decision.accessType;
  if (item.visibility === "private" || accessType === "private" || accessType === "invite_only") {
    return blockedReadout(
      "blocked_private",
      "Spectator playback is private.",
      "This room is not available for public spectator playback.",
      decision,
    );
  }

  if (decision.requiresTicket) {
    return blockedReadout(
      "blocked_ticketed",
      "Spectator playback is ticketed.",
      "Ticketed public playback needs a backed ticketing flow before it can be exposed.",
      decision,
    );
  }

  if (decision.requiresPremium) {
    return blockedReadout(
      "blocked_premium_full_room",
      "Full room access requires Premium.",
      "Spectator metadata is public-safe, but full Live First, Live Watch-Party, and Watch-Party Live access remains Premium-gated.",
      decision,
    );
  }

  if (item.live_state === "ended") {
    return blockedReadout(
      "ended",
      "This broadcast has ended.",
      "No public replay is available from spectator metadata.",
      decision,
    );
  }

  if (!item.is_spectator_enabled) {
    return blockedReadout(
      "not_configured",
      "Spectator playback is not configured.",
      "Spectator metadata is available, but broadcast playback has not been enabled for this item.",
      decision,
    );
  }

  if (!item.is_spectator_playback_enabled) {
    return blockedReadout(
      "waiting_for_egress",
      "Spectator playback is waiting on Egress/HLS proof.",
      "A real public-safe HLS delivery path must be proved before playback can appear here.",
      decision,
    );
  }

  const publicHlsUrl = isProvedPublicHlsUrl(source.provedPublicHlsUrl);
  if (!publicHlsUrl) {
    return blockedReadout(
      "waiting_for_egress",
      "Spectator playback is waiting on Egress/HLS proof.",
      "Playback is marked as intended, but no proved public-safe HLS URL is available to render.",
      decision,
    );
  }

  return {
    state: "available",
    title: "Spectator playback is available.",
    copy: "This item has a proved public-safe HLS source and remains watch-only for spectators.",
    guardrails: WATCH_ONLY_GUARDRAILS,
    canRenderPlayback: true,
    publicHlsUrl,
    fullRoomRequiresPremium: decision.requiresPremium,
    fullRoomRequiresTicket: decision.requiresTicket,
    fullRoomTokenForSpectators: false,
  };
}
