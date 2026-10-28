import type { DiscoveryFeedItem } from "./discoveryFeed";
import type { CreatorEventSummary } from "./liveEvents";

export type LiveTabDiscoveryBuckets = {
  liveItems: DiscoveryFeedItem[];
  liveEvents: CreatorEventSummary[];
  upcomingEvents: CreatorEventSummary[];
  awaitingEvents: CreatorEventSummary[];
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
    awaitingEvents: events
      // A late host has not started or canceled the event merely because its
      // scheduled time passed. Keep a separate bounded lane, never live-now.
      .filter((event) => event.status === "scheduled" && !event.isUpcoming
        && event.startsAt !== null && Number.isFinite(Date.parse(event.startsAt)))
      .slice(0, 8),
  };
}
