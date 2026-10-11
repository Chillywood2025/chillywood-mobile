import { isDiscoveryFeedItemEligibleForRanking } from "./discoveryFeed";
import { useLiveDiscoveryFeed } from "./useLiveDiscoveryFeed";

/** A Profile's status belongs to this creator, never to its broader social feed or route hints. */
export function useProfileLiveState(creatorUserId: string, enabled: boolean) {
  const feed = useLiveDiscoveryFeed({
    surface: "profile", creatorUserId, liveOnly: true, includeCircle: false,
    enabled: enabled && !!creatorUserId, limit: 50,
  });
  const items = enabled && feed.ready ? Array.from(new Map(feed.items.filter((item) => (
    item.live_state === "live"
    && (item.owner_user_id === creatorUserId || item.channel_user_id === creatorUserId)
    && isDiscoveryFeedItemEligibleForRanking(item)
  )).map((item) => [item.id, item])).values()) : [];
  const status = !enabled ? "unavailable" : feed.error ? "error"
    : !feed.ready ? "checking" : items.length ? "live" : "offline";
  const label = status === "live" ? "LIVE NOW" : status === "offline" ? "OFF AIR"
    : status === "checking" ? "CHECKING LIVE" : status === "error" ? "LIVE UNAVAILABLE" : "PROFILE";
  return { ...feed, items, status, label, isLive: status === "live" };
}

export type ProfileLiveState = ReturnType<typeof useProfileLiveState>;
