import type { DiscoveryFeedItem } from "./discoveryFeed";
import { isFeedItemPubliclyDiscoverable, isPublicSpectatorSafeRightsStatus } from "./discoveryFeed";

// A discovery projection selects a destination, never a membership or a media
// role. The existing stage independently resolves session, room and pass access.
export function readCanonicalLiveStageRoomId(item: DiscoveryFeedItem, lane: "public" | "circle"): string | null {
  const metadata = item.metadata;
  if (item.source_type !== "live_stage_room" || item.item_type !== "live_room"
    || item.live_state !== "live" || item.ended_at || item.is_spectator_enabled !== true
    || !metadata || typeof metadata !== "object" || Array.isArray(metadata)
    || metadata.producer !== "canonical_live_stage_v1" || metadata.canonical_projection_active !== true
    || metadata.destination !== "live_stage") return null;
  const audienceAllowed = lane === "public"
    ? isFeedItemPubliclyDiscoverable(item)
    : item.visibility === "circle" && item.is_publicly_discoverable !== true
      && item.moderation_status === "clean" && isPublicSpectatorSafeRightsStatus(item.rights_status);
  if (!audienceAllowed) return null;
  const roomId = typeof item.room_id === "string" ? item.room_id.trim() : "";
  return roomId && roomId === item.source_id && roomId === metadata.room_id ? roomId : null;
}
