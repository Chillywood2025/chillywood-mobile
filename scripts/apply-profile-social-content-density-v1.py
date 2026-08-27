#!/usr/bin/env python3
from pathlib import Path

path = Path("components/ProfileSocialFeedCard.tsx")
text = path.read_text()

def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return source.replace(old, new, 1)

def replace_between(source: str, start: str, end: str, replacement: str, label: str) -> str:
    a = source.find(start)
    if a < 0:
        raise RuntimeError(f"{label}: start marker missing")
    b = source.find(end, a)
    if b < 0:
        raise RuntimeError(f"{label}: end marker missing")
    return source[:a] + replacement + source[b:]

text = replace_once(
    text,
    'import { LinkedText } from "./social/linked-text";\n',
    'import { CreatorVideoCard } from "./creator-media/creator-video-card";\nimport { LinkedText } from "./social/linked-text";\n',
    "Profile social shared creator card import",
)

creator_branch = r'''  if (item.type === "creator_video" || item.type === "public_profile_creator_video") {
    return (
      <View style={styles.compactMediaTile}>
        <CreatorVideoCard
          video={item.video}
          mode="public"
          onOpen={() => onOpenCreatorVideo(item.video)}
        />
      </View>
    );
  }

'''
text = replace_between(
    text,
    '  if (item.type === "creator_video" || item.type === "public_profile_creator_video") {',
    '  if (item.type === "spectator_entry" || item.type === "public_profile_spectator_entry") {',
    creator_branch,
    "Profile social creator video card",
)

spectator_branch = r'''  if (item.type === "spectator_entry" || item.type === "public_profile_spectator_entry") {
    const title = String(item.discoveryItem.title ?? "").trim() || "Public live entry";

    return (
      <TouchableOpacity
        style={styles.compactDiscoveryTile}
        activeOpacity={0.9}
        onPress={() => onOpenDiscoveryItem(item.discoveryItem)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}`}
      >
        {item.discoveryItem.thumbnail_url ? (
          <Image source={{ uri: item.discoveryItem.thumbnail_url }} style={styles.mediaImage} />
        ) : (
          <View style={styles.compactMediaFallback}>
            <MaterialIcons name="live-tv" size={28} color="#EAF0FF" />
          </View>
        )}
        <View style={styles.mediaScrim} />
        <View style={styles.compactBadgeRow}>
          <Text style={[styles.mediaBadge, item.discoveryItem.live_state === "live" && styles.liveBadge]}>
            {getDiscoveryLiveLabel(item.discoveryItem)}
          </Text>
          <Text style={styles.mediaBadge}>{getDiscoveryAccessLabel(item.discoveryItem)}</Text>
        </View>
        <View style={styles.compactMediaCopy}>
          <Text style={styles.compactMediaKicker}>{getDiscoveryKicker(item)}</Text>
          <Text style={styles.compactMediaTitle} numberOfLines={2}>{title}</Text>
        </View>
      </TouchableOpacity>
    );
  }

'''
text = replace_between(
    text,
    '  if (item.type === "spectator_entry" || item.type === "public_profile_spectator_entry") {',
    '  return (\n    <View style={styles.card}>',
    spectator_branch,
    "Profile social spectator card",
)

style_anchor = '''  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(9,12,18,0.96)",
    overflow: "hidden",
  },
'''
style_replacement = style_anchor + '''  compactMediaTile: {
    width: 150,
  },
  compactDiscoveryTile: {
    width: 150,
    aspectRatio: 9 / 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#111723",
    overflow: "hidden",
  },
  compactMediaFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#121824",
  },
  compactBadgeRow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  compactMediaCopy: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingTop: 26,
    paddingBottom: 10,
    gap: 3,
    backgroundColor: "rgba(4,6,10,0.72)",
  },
  compactMediaKicker: {
    color: "#C7D0E0",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  compactMediaTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
'''
text = replace_once(text, style_anchor, style_replacement, "Profile social compact media styles")

path.write_text(text)
print("Applied compact media-first cards to creator-video and spectator entries in Profile social feed.")
