import { isCanonicalPartyRoomMetadata, readPublicDiscoveryFeedItem, type DiscoveryFeedItem } from "./discoveryFeed";
import { readCircleSpectatorFeedItem } from "./circleSpectatorFeed";

// Metadata visibility grants no spectator playback, membership or media role.
// The destination must still pass the normal room and content admission gates.
export function readCanonicalPartyRoomDestination(item: DiscoveryFeedItem, lane: "public" | "circle") {
  if (!isCanonicalPartyRoomMetadata(item)
    || (lane === "public" ? item.visibility !== "public" || item.is_publicly_discoverable !== true
      : item.visibility !== "circle" || item.is_publicly_discoverable !== false)) return null;
  const metadata = item.metadata as Record<string, string>;
  return { partyId: item.room_id!, hostUserId: item.host_user_id!, sourceType: metadata.content_source_type,
    sourceId: metadata.content_source_id, publicationId: metadata.publication_id };
}

export async function readCurrentPartyRoomDiscoveryDestination(itemId: string, lane: string) {
  if (!itemId || (lane !== "public" && lane !== "circle")) return null;
  const item = await (lane === "public" ? readPublicDiscoveryFeedItem(itemId) : readCircleSpectatorFeedItem(itemId));
  return item?.id === itemId ? readCanonicalPartyRoomDestination(item, lane) : null;
}
