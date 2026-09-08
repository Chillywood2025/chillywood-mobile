import type { DiscoveryFeedItem } from "./discoveryFeed";
import type { CreatorEventSummary } from "./liveEvents";

export type LiveTabDiscoveryBuckets = {
  liveItems: DiscoveryFeedItem[];
  liveEvents: CreatorEventSummary[];
  upcomingEvents: CreatorEventSummary[];
};

export function buildLiveTabDiscoveryBuckets(
  discoveryItems: DiscoveryFeedItem[],
  events: CreatorEventSummary[],
): LiveTabDiscoveryBuckets {
  const liveItems = discoveryItems
    .filter((item) => item.live_state === "live")
    .slice(0, 10);
  const renderedLiveEventIds = new Set(
    liveItems
      .map((item) => String(item.event_id ?? "").trim())
      .filter(Boolean),
  );

  return {
    liveItems,
    liveEvents: events
      .filter((event) => event.isLiveNow && !renderedLiveEventIds.has(event.id))
      .slice(0, 8),
    upcomingEvents: events
      .filter((event) => event.isUpcoming)
      .slice(0, 10),
  };
}
