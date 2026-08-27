#!/usr/bin/env python3
from pathlib import Path

path = Path("app/(tabs)/explore.tsx")
text = path.read_text()

def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return source.replace(old, new, 1)

def replace_between(source: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = source.find(start)
    if start_index < 0:
        raise RuntimeError(f"{label}: start marker missing")
    end_index = source.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{label}: end marker missing")
    return source[:start_index] + replacement + source[end_index:]

text = replace_once(
    text,
    'import { MainTabTopBar } from "../../components/navigation/main-tab-top-bar";\n',
    'import { MainTabTopBar } from "../../components/navigation/main-tab-top-bar";\nimport { CreatorVideoCard } from "../../components/creator-media/creator-video-card";\n',
    "Explore creator card import",
)

new_discovery = r'''  const renderDiscoveryCard = (item: DiscoveryFeedItem, labelOverride?: string) => {
    const thumbnail = remoteImageSource(item.thumbnail_url);
    const label = labelOverride ?? getDiscoveryLiveLabel(item);
    const accessLabel = getDiscoveryAccessLabel(item);
    const rankingReason = scoreDiscoveryFeedItem(item, sections.discoverySignals).reason;
    const title = String(item.title ?? "").trim() || "Untitled";

    return (
      <TouchableOpacity
        key={`feed-${item.id}`}
        testID={`explore-discovery-card-${rankingReason}-${item.id}`}
        style={styles.discoveryCard}
        activeOpacity={0.9}
        onPress={() => openDiscoveryFeedItem(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}`}
      >
        <View style={styles.discoveryThumb}>
          {thumbnail ? (
            <Image source={thumbnail} style={styles.discoveryThumbImage} />
          ) : (
            <Text style={styles.discoveryThumbInitial}>{title.slice(0, 1).toUpperCase()}</Text>
          )}
          <View style={styles.discoveryScrim} />
          <View style={styles.discoveryOverlayBadgeRow}>
            <Text style={[styles.smallBadge, label === "Live" && styles.smallBadgeLive]}>{label}</Text>
            <Text style={styles.smallBadge}>{accessLabel}</Text>
          </View>
          <View style={styles.discoveryOverlayCopy}>
            <Text style={styles.discoveryCardTitle} numberOfLines={2}>{title}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

'''
text = replace_between(
    text,
    '  const renderDiscoveryCard = (item: DiscoveryFeedItem, labelOverride?: string) => {',
    '  const renderCreatorVideoCard = (video: CreatorVideo, label = "Creator Video") => {',
    new_discovery,
    "Explore discovery media cards",
)

new_creator = r'''  const renderCreatorVideoCard = (video: CreatorVideo, label = "Creator Video") => (
    <View key={`${label}-${video.id}`} style={styles.creatorVideoTile}>
      <CreatorVideoCard
        video={video}
        mode="public"
        onOpen={() => openCreatorVideo(video)}
      />
    </View>
  );

'''
text = replace_between(
    text,
    '  const renderCreatorVideoCard = (video: CreatorVideo, label = "Creator Video") => {',
    '  const renderEventCard = (event: CreatorEventSummary, replay = false) => (',
    new_creator,
    "Explore creator video cards",
)

new_event = r'''  const renderEventCard = (event: CreatorEventSummary, replay = false) => (
    <TouchableOpacity
      key={`${replay ? "replay-event" : "event"}-${event.id}`}
      style={styles.discoveryCard}
      activeOpacity={0.9}
      onPress={() => openChannel(event.hostUserId)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${event.eventTitle}`}
    >
      <View style={[styles.discoveryThumb, styles.eventThumb, event.isLiveNow && styles.eventThumbLive]}>
        <Text style={styles.eventThumbText}>{event.isLiveNow ? "LIVE" : replay ? "REPLAY" : "EVENT"}</Text>
        <View style={styles.discoveryScrim} />
        <View style={styles.discoveryOverlayBadgeRow}>
          <Text style={[styles.smallBadge, event.isLiveNow && styles.smallBadgeLive]}>
            {event.isLiveNow ? "Live" : replay ? "Replay" : "Upcoming"}
          </Text>
          <Text style={styles.smallBadge}>{formatEventMode(event)}</Text>
        </View>
        <View style={styles.discoveryOverlayCopy}>
          <Text style={styles.discoveryCardTitle} numberOfLines={2}>{event.eventTitle}</Text>
          <Text style={styles.discoveryCardBody} numberOfLines={1}>
            {replay ? formatDateTime(event.replay.replayAvailableAt) : formatDateTime(event.startsAt)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

'''
text = replace_between(
    text,
    '  const renderEventCard = (event: CreatorEventSummary, replay = false) => (',
    '  const renderPeopleResult = (person: PublicPeopleSearchResult) => {',
    new_event,
    "Explore event media cards",
)

old_styles = '''  discoveryCard: {
    width: 158,
    minHeight: 202,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(10,12,18,0.88)",
    padding: 10,
    gap: 8,
  },
  discoveryThumb: {
    height: 82,
    borderRadius: 8,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
'''
new_styles = '''  discoveryCard: {
    width: 150,
    aspectRatio: 9 / 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(10,12,18,0.88)",
    overflow: "hidden",
  },
  creatorVideoTile: {
    width: 150,
  },
  discoveryThumb: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  discoveryScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,5,10,0.24)",
  },
  discoveryOverlayBadgeRow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  discoveryOverlayCopy: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingTop: 28,
    paddingBottom: 10,
    gap: 3,
    backgroundColor: "rgba(3,5,10,0.72)",
  },
'''
text = replace_once(text, old_styles, new_styles, "Explore compact card styles")
text = replace_once(
    text,
    '  eventThumb: {\n    height: 82,\n    borderRadius: 8,\n    alignItems: "center",\n    justifyContent: "center",\n    backgroundColor: "rgba(115,134,255,0.2)",\n  },\n',
    '  eventThumb: {\n    backgroundColor: "rgba(115,134,255,0.2)",\n  },\n',
    "Explore event tile style",
)

path.write_text(text)
print("Applied compact media-first cards to Explore creator, discovery, live, event, and replay rails.")
