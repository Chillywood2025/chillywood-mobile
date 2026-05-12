import type { DiscoveryFeedItem } from "./discoveryFeed";
import { isFeedItemPubliclyDiscoverable, isPublicSpectatorSafeRightsStatus } from "./discoveryFeed";
import type { SpectatorAccessDecision } from "./spectatorAccess";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

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
  playbackUrl: string | null;
  fullRoomRequiresPremium: boolean;
  fullRoomRequiresTicket: boolean;
  fullRoomTokenForSpectators: false;
  rawHlsUrlVisibleToUsers: false;
};

type PlaybackSourceInput = {
  serverReadout?: ServerSpectatorPlaybackReadout | null;
};

type ServerSpectatorPlaybackReadout = {
  canRenderPlayback?: unknown;
  copy?: unknown;
  playbackUrl?: unknown;
  state?: unknown;
  title?: unknown;
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
const SPECTATOR_PLAYBACK_FUNCTION_URL = `${SUPABASE_URL.replace(/\/+$/g, "")}/functions/v1/spectator-playback`;

const isControlledPlaybackUrl = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const expectedBase = new URL(SPECTATOR_PLAYBACK_FUNCTION_URL);
    const expectedPath = `${expectedBase.pathname.replace(/\/+$/g, "")}/records/`;
    return parsed.protocol === "https:"
      && parsed.origin === expectedBase.origin
      && parsed.pathname.startsWith(expectedPath)
      && parsed.pathname.endsWith("/index.m3u8")
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
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
  playbackUrl: null,
  fullRoomRequiresPremium: decision.requiresPremium,
  fullRoomRequiresTicket: decision.requiresTicket,
  fullRoomTokenForSpectators: false,
  rawHlsUrlVisibleToUsers: false,
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
      playbackUrl: null,
      fullRoomRequiresPremium: true,
      fullRoomRequiresTicket: false,
      fullRoomTokenForSpectators: false,
      rawHlsUrlVisibleToUsers: false,
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

  const serverState = normalizeText(source.serverReadout?.state) as SpectatorPlaybackState;
  const controlledPlaybackUrl = isControlledPlaybackUrl(source.serverReadout?.playbackUrl);
  if (serverState === "available" && controlledPlaybackUrl && source.serverReadout?.canRenderPlayback === true) {
    return {
      state: "available",
      title: normalizeText(source.serverReadout.title) || "Spectator playback is available.",
      copy: normalizeText(source.serverReadout.copy)
        || "This item has a proved public-safe HLS source and remains watch-only for spectators.",
      guardrails: WATCH_ONLY_GUARDRAILS,
      canRenderPlayback: true,
      playbackUrl: controlledPlaybackUrl,
      fullRoomRequiresPremium: decision.requiresPremium,
      fullRoomRequiresTicket: decision.requiresTicket,
      fullRoomTokenForSpectators: false,
      rawHlsUrlVisibleToUsers: false,
    };
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
      "A public-safe playback record has not been approved for this item yet.",
      decision,
    );
  }

  const serverCopy = normalizeText(source.serverReadout?.copy);
  return blockedReadout(
    serverState || "waiting_for_egress",
    normalizeText(source.serverReadout?.title) || "Spectator playback is waiting on Egress/HLS proof.",
    serverCopy || "Playback is marked as intended, but no approved controlled playback endpoint is available to render.",
    decision,
  );
}

export async function readSpectatorPlaybackReadout(
  item: DiscoveryFeedItem,
  decision: SpectatorAccessDecision,
): Promise<SpectatorPlaybackReadout> {
  const baseReadout = resolveSpectatorPlaybackState(item, decision);
  if (
    baseReadout.state !== "waiting_for_egress"
    && baseReadout.state !== "not_configured"
    && baseReadout.state !== "unavailable"
  ) {
    return baseReadout;
  }

  try {
    const response = await fetch(SPECTATOR_PLAYBACK_FUNCTION_URL, {
      body: JSON.stringify({
        itemId: item.id,
        sourceRoomId: item.room_id ?? item.source_id ?? item.event_id ?? item.id,
      }),
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) return baseReadout;

    const serverReadout = await response.json().catch(() => null) as ServerSpectatorPlaybackReadout | null;
    return resolveSpectatorPlaybackState(item, decision, { serverReadout });
  } catch {
    return baseReadout;
  }
}
