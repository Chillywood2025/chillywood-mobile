#!/usr/bin/env python3
from pathlib import Path
p = Path("scripts/apply-content-card-density-v1.py")
s = p.read_text()
selector_old = "home = replace_once(home, '    borderRadius: 20,\\n    borderWidth: 1,', '    borderRadius: 14,\\n    borderWidth: 1,', \"Home discovery card radius\")"
selector_new = "home = replace_once(home, '  feedActivityCard: {\\n    width: 150,\\n    borderRadius: 20,\\n    borderWidth: 1,', '  feedActivityCard: {\\n    width: 150,\\n    borderRadius: 14,\\n    borderWidth: 1,', \"Home discovery card radius\")"
if s.count(selector_old) != 1:
    raise SystemExit(f"selector patch expected 1 match, found {s.count(selector_old)}")
s = s.replace(selector_old, selector_new, 1)
lines = s.splitlines()
guard_start = next((i for i, line in enumerate(lines) if line.startswith("guard_add =")), -1)
if guard_start < 0:
    raise SystemExit("guard_add marker missing")
quote_matches = [i for i, line in enumerate(lines) if i > guard_start and "title:" in line and "Chi" in line and "Circle" in line]
if len(quote_matches) != 1:
    raise SystemExit(f"quote patch expected 1 guard candidate, found {len(quote_matches)}")
i = quote_matches[0]
lines[i] = "  'key: \\\"circle\\\"',"
s = "\n".join(lines) + ("\n" if s.endswith("\n") else "")

channel_patch_marker = "# Public Platform content uses the same compact native media-card contract."
if channel_patch_marker not in s:
    s += r'''

# Public Platform content uses the same compact native media-card contract.
channel_path = Path("app/channel/[userId].tsx")
channel = channel_path.read_text()
channel = replace_once(
    channel,
    'import { CreatorContentActionSheet, type CreatorContentActionSheetVisibilityAction } from "../../components/creator-media/CreatorContentActionSheet";\n',
    'import { CreatorContentActionSheet, type CreatorContentActionSheetVisibilityAction } from "../../components/creator-media/CreatorContentActionSheet";\nimport { CreatorVideoCard } from "../../components/creator-media/creator-video-card";\n',
    "public Platform compact card import",
)

channel_card_renderers = r'''  const renderFeaturedVideoCard = (video: CreatorVideo) => (
    <View key={video.id} style={styles.platformContentTile} testID="platform-content-card">
      <CreatorVideoCard
        video={video}
        mode={showOwnerControls ? "owner" : "public"}
        featured
        onOpen={() => openPlayer(video)}
        onShare={() => { void shareSelectedVideo(video); }}
        onOpenActions={showOwnerControls ? () => setSelectedVideoAction(video) : undefined}
      />
    </View>
  );

  const renderLatestUploadCard = (video: CreatorVideo) => (
    <View key={video.id} style={styles.platformContentTile} testID="platform-content-card">
      <CreatorVideoCard
        video={video}
        mode={showOwnerControls ? "owner" : "public"}
        onOpen={() => openPlayer(video)}
        onShare={() => { void shareSelectedVideo(video); }}
        onOpenActions={showOwnerControls ? () => setSelectedVideoAction(video) : undefined}
      />
    </View>
  );

'''
channel = replace_between(
    channel,
    '  const renderFeaturedVideoCard = (video: CreatorVideo) => (',
    '  const renderFeatured = () => (',
    channel_card_renderers,
    "public Platform compact content renderers",
)

channel_featured = r'''  const renderFeatured = () => (
    <AppSection title="Featured" statusLabel={featuredVideo ? platformVideoVisibilityLabel(featuredVideo) : "Empty"} statusTone={featuredVideo ? "success" : "muted"}>
      {featuredVideo ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.shelfScroll}
          contentContainerStyle={styles.shelfRow}
        >
          {renderFeaturedVideoCard(featuredVideo)}
        </ScrollView>
      ) : (
        <AppEmptyState
          actionLabel={showOwnerControls ? "Open Platform Studio" : undefined}
          body="This Platform has not published videos yet."
          onAction={showOwnerControls ? openStudio : undefined}
          title="No featured video"
        />
      )}
    </AppSection>
  );

'''
channel = replace_between(
    channel,
    '  const renderFeatured = () => (',
    '  const renderLatestUploads = () => (',
    channel_featured,
    "public Platform Featured shelf",
)

channel = replace_once(
    channel,
    '  shelfRow: {\n    paddingHorizontal: 18,\n    gap: 12,\n  },\n',
    '  shelfRow: {\n    paddingHorizontal: 18,\n    gap: 9,\n  },\n  platformContentTile: {\n    width: 150,\n  },\n',
    "public Platform compact tile style",
)
channel_path.write_text(channel)
print("Applied compact native content cards to the public Platform surface.")
'''

p.write_text(s)
print("Patched content transform selectors, shelf guards, and public Platform card coverage")
