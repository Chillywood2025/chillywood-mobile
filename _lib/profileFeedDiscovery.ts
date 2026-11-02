import { isDiscoveryFeedItemEligibleForRanking, type DiscoveryFeedItem } from "./discoveryFeed";
import type { ProfileSocialFeedItem } from "./profileSocialFeed";

/** A paginated social snapshot is not a continued grant to display a live card.
 * Keep relationship/post order, but source every suggestion from the current
 * account-bound canonical public reader, never the older page's metadata. */
export function reconcileProfileFeedDiscovery(
  paged: readonly ProfileSocialFeedItem[], current: readonly DiscoveryFeedItem[], ownerUserId: string,
): ProfileSocialFeedItem[] {
  const items = paged.filter(item => !("discoveryItem" in item));
  const videoIds = new Set(items.flatMap(item => "video" in item ? [item.video.id] : []));
  const suggestions = Array.from(new Map(current.filter(item => isDiscoveryFeedItemEligibleForRanking(item)
    && ![item.owner_user_id, item.channel_user_id, item.host_user_id].includes(ownerUserId)
    && !videoIds.has(item.media_id ?? "")).map(item => [item.id, item])).values()).slice(0, 4);
  suggestions.forEach((discoveryItem, index) => items.splice(Math.min(items.length, 4 + index * 6), 0, {
    id: discoveryItem.item_type === "creator_upload" && discoveryItem.media_id
      ? `relationship-creator_video-${discoveryItem.media_id}` : `suggested-${discoveryItem.id}`,
    mode: "own_profile_social_feed", type: "spectator_entry", discoveryItem,
    actor: null, sourceContext: "discovery", rankScore: 0,
    rankTime: discoveryItem.published_at ?? discoveryItem.created_at,
  }));
  return items;
}
