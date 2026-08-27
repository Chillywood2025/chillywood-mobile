#!/usr/bin/env python3
from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return source.replace(old, new, 1)


def replace_between(source: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = source.find(start_marker)
    if start < 0:
        raise RuntimeError(f"{label}: start marker missing")
    end = source.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"{label}: end marker missing")
    return source[:start] + replacement + source[end:]


card_path = Path("components/creator-media/creator-video-card.tsx")
studio_path = Path("app/channel-settings.tsx")
home_path = Path("app/(tabs)/index.tsx")
guard_path = Path("scripts/guard-clip-studio-policy.mjs")

card = card_path.read_text()
studio = studio_path.read_text()
home = home_path.read_text()
guard = guard_path.read_text()

# Shared creator/video card: compact is now the default presentation everywhere.
card = replace_once(
    card,
    'type CreatorVideoCardMode = "owner" | "public";\n',
    'type CreatorVideoCardMode = "owner" | "public";\ntype CreatorVideoCardVariant = "compact" | "detail";\n',
    "card variant type",
)
card = replace_once(
    card,
    '  mode: CreatorVideoCardMode;\n',
    '  mode: CreatorVideoCardMode;\n  variant?: CreatorVideoCardVariant;\n',
    "card variant prop",
)
card = replace_once(
    card,
    '  mode,\n  clipEdit,\n',
    '  mode,\n  variant = "compact",\n  clipEdit,\n',
    "card variant default",
)
compact_block = '''  if (variant === "compact") {
    const compactStatus = accessLabel
      || (featured ? "Featured" : formatVisibilityLabel(video, ownerMode));
    const compactSecondary = moderationLabel
      || (!playable ? "Media unavailable" : null);

    return (
      <View style={[styles.compactCard, !playable && styles.cardUnavailable]}>
        <TouchableOpacity
          style={styles.compactPreview}
          activeOpacity={0.9}
          onPress={playable ? onOpen : ownerMode ? onOpenActions : undefined}
          onLongPress={ownerMode ? onOpenActions : onShare}
          disabled={!playable && !ownerMode}
          accessibilityRole="button"
          accessibilityLabel={ownerMode ? `Open ${displayTitle}. Hold for content actions.` : `Open ${publicDisplayTitle}`}
        >
          <StableImage
            expectedWidth="100%"
            expectedHeight="100%"
            source={video.thumbnailUrl ? { uri: video.thumbnailUrl } : null}
            containerStyle={styles.thumbnailFrame}
            borderRadius={0}
            resizeMode="cover"
          />
          {!video.thumbnailUrl ? (
            <View style={styles.compactFallbackPreview}>
              <AppText scale="caption" style={styles.compactFallbackKicker}>{"Chi'llywood"}</AppText>
              <AppText scale="subhead" style={styles.compactFallbackTitle} numberOfLines={2}>{publicDisplayTitle}</AppText>
            </View>
          ) : null}
          <View style={styles.compactShade} />
          <View style={styles.compactStatusPill}>
            <AppText scale="caption" style={styles.compactStatusText} numberOfLines={1}>{compactStatus}</AppText>
          </View>
          {ownerMode && onOpenActions ? (
            <TouchableOpacity
              style={styles.compactOverflowButton}
              activeOpacity={0.84}
              onPress={onOpenActions}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={`Open actions for ${displayTitle}`}
              testID="creator-video-card-overflow-button"
            >
              <AppText scale="subhead" style={styles.compactOverflowText}>•••</AppText>
            </TouchableOpacity>
          ) : null}
          <View pointerEvents="none" style={styles.compactBottomCopy}>
            <AppText scale="subhead" style={styles.compactTitle} numberOfLines={2}>{publicDisplayTitle}</AppText>
            {compactSecondary ? (
              <AppText scale="caption" style={styles.compactMeta} numberOfLines={1}>{compactSecondary}</AppText>
            ) : ownerMode && updatedDate ? (
              <AppText scale="caption" style={styles.compactMeta} numberOfLines={1}>{`Updated ${updatedDate}`}</AppText>
            ) : null}
          </View>
        </TouchableOpacity>
      </View>
    );
  }

'''
card = replace_once(
    card,
    '  return (\n    <View style={[styles.card, !playable && styles.cardUnavailable]}>',
    compact_block + '  return (\n    <View style={[styles.card, !playable && styles.cardUnavailable]}>',
    "compact card return",
)
card_styles = '''  compactCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(8,10,16,0.96)",
    overflow: "hidden",
  },
  compactPreview: {
    width: "100%",
    aspectRatio: 9 / 16,
    backgroundColor: "#080A10",
  },
  compactFallbackPreview: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: 11,
    paddingBottom: 52,
    backgroundColor: "#10141E",
  },
  compactFallbackKicker: {
    color: "#A6B0C4",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  compactFallbackTitle: {
    color: "#F4F7FC",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    marginTop: 3,
  },
  compactShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.13)",
  },
  compactStatusPill: {
    position: "absolute",
    top: 8,
    left: 8,
    maxWidth: "64%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(5,7,12,0.76)",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  compactStatusText: {
    color: "#F8FAFF",
    fontSize: 9.5,
    fontWeight: "900",
  },
  compactOverflowButton: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(5,7,12,0.76)",
  },
  compactOverflowText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 17,
    fontWeight: "900",
    marginTop: -4,
  },
  compactBottomCopy: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingTop: 28,
    paddingBottom: 10,
    gap: 2,
    backgroundColor: "rgba(4,6,10,0.72)",
  },
  compactTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  compactMeta: {
    color: "#C7D0E0",
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "700",
  },
'''
card = replace_once(
    card,
    '  cardUnavailable: {\n    borderColor: "rgba(255,255,255,0.08)",\n    opacity: 0.92,\n  },\n',
    '  cardUnavailable: {\n    borderColor: "rgba(255,255,255,0.08)",\n    opacity: 0.92,\n  },\n' + card_styles,
    "compact card styles",
)

# Platform Studio Content becomes row/shelf based instead of a giant vertical admin-card list.
new_content_panel = r'''  const renderContentPanel = () => {
    const query = contentSearchQuery.trim().toLowerCase();
    const sortedVideos = [...creatorVideos]
      .filter((video) => !query || `${video.title} ${video.description}`.toLowerCase().includes(query))
      .sort((a, b) => {
        const diff = getCreatorVideoCreatedTimestamp(a) - getCreatorVideoCreatedTimestamp(b);
        return contentSort === "oldest" ? diff : -diff;
      });
    const featuredVideos = activeBrandProfile?.spotlightVideoId
      ? sortedVideos.filter((video) => video.id === activeBrandProfile.spotlightVideoId)
      : [];
    const publishedVideos = sortedVideos.filter((video) => video.visibility === "public");
    const draftVideos = sortedVideos.filter((video) => video.visibility === "draft");
    const circleVideos = sortedVideos.filter((video) => video.visibility === "circle");
    const paidVideos = sortedVideos.filter((video) => {
      const offer = paidVideoOfferByVideoId.get(video.id);
      return !!offer?.isPaid && (offer.status === "sandbox" || offer.status === "active");
    });
    const needsAttentionVideos = sortedVideos.filter((video) => (
      ["hidden", "removed", "banned"].includes(video.moderationStatus)
      || video.renditionStatuses.some((rendition) => rendition.status === "failed")
    ));
    const searchedReplays = creatorReplays.filter((replay) => (
      !query || `${replay.title} ${replay.description ?? ""}`.toLowerCase().includes(query)
    ));
    const processingReplays = searchedReplays.filter((replay) => (
      ["requested", "recording_active", "recording_stopping", "processing_replay"].includes(replay.saveStatus)
    ));
    const attentionReplays = searchedReplays.filter((replay) => (
      ["failed", "recording_not_started"].includes(replay.saveStatus) || replay.moderationStatus === "hidden"
    ));
    const searchedEvents = creatorEvents.filter((event) => (
      !query || `${event.eventTitle} ${formatEventTypeLabel(event.eventType)}`.toLowerCase().includes(query)
    ));
    const videoShelves = [
      { key: "recent", title: "Recent Uploads", items: sortedVideos },
      { key: "featured", title: "Featured", items: featuredVideos },
      { key: "published", title: "Published", items: publishedVideos },
      { key: "drafts", title: "Drafts", items: draftVideos },
      { key: "paid", title: "Paid Videos", items: paidVideos },
      { key: "circle", title: "Chi'lly Circle", items: circleVideos },
      { key: "attention", title: "Needs Attention", items: needsAttentionVideos },
    ].filter((shelf) => shelf.items.length > 0);
    const totalContentItems = creatorVideos.length + creatorReplays.length + creatorEvents.length;
    const hasVisibleRows = videoShelves.length > 0 || searchedReplays.length > 0 || searchedEvents.length > 0;

    const renderOwnedContentTile = (video: CreatorVideo) => (
      <View key={video.id} style={styles.contentShelfCard}>
        <CreatorVideoCard
          video={video}
          mode="owner"
          clipEdit={creatorVideoClipEdits[video.id] ?? null}
          featured={activeBrandProfile?.spotlightVideoId === video.id}
          accessLabel={(() => {
            const offer = paidVideoOfferByVideoId.get(video.id);
            return offer?.isPaid && (offer.status === "sandbox" || offer.status === "active") ? "Paid Video" : null;
          })()}
          busy={videoSaving || brandSaving}
          onOpen={() => router.push({ pathname: "/player/[id]", params: { id: video.id, source: "creator-video" } })}
          onEdit={() => openClipStudioForVideo(video)}
          onEditClip={() => openClipStudioForVideo(video)}
          onSetFeatured={() => { void publishSpotlightVideo(video); }}
          onClearFeatured={() => { void publishSpotlightVideo(null); }}
          onToggleVisibility={() => onToggleVideoVisibility(video)}
          onDelete={() => onDeleteVideo(video)}
          onOpenActions={() => setSelectedContentActionVideo(video)}
        />
      </View>
    );

    const openReplayVisibility = (replay: CreatorReplayLibraryItem) => {
      Alert.alert(
        "Replay visibility",
        "Choose where this replay belongs.",
        [
          { text: "Draft", onPress: () => { void updateReplayVisibility(replay, "draft"); } },
          { text: "Chi'lly Circle", onPress: () => { void updateReplayVisibility(replay, "circle"); } },
          { text: "Public", onPress: () => { if (replay.saveStatus === "ready") void updateReplayVisibility(replay, "public"); } },
        ],
      );
    };

    const openReplayActions = (replay: CreatorReplayLibraryItem) => {
      Alert.alert(
        replay.title,
        `${formatCreatorReplayVisibilityLabel(replay.visibility)} · ${formatCreatorReplayStatusLabel(replay.saveStatus)}`,
        [
          {
            text: replay.saveStatus === "ready" ? "Open" : "View State",
            onPress: () => router.push({ pathname: "/player/replay/[replayId]", params: { replayId: replay.id } } as unknown as Parameters<typeof router.push>[0]),
          },
          { text: "Visibility", onPress: () => openReplayVisibility(replay) },
          { text: "Delete", style: "destructive", onPress: () => deleteReplay(replay) },
        ],
      );
    };

    const renderReplayShelf = (title: string, rows: CreatorReplayLibraryItem[]) => {
      if (!rows.length) return null;
      return (
        <View style={styles.contentShelf}>
          <View style={styles.contentShelfHeader}>
            <Text style={styles.contentShelfTitle}>{title}</Text>
            <Text style={styles.contentShelfCount}>{rows.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contentShelfRow}>
            {rows.map((replay) => (
              <TouchableOpacity
                key={replay.id}
                style={styles.contentReplayCard}
                activeOpacity={0.88}
                onPress={() => openReplayActions(replay)}
                accessibilityRole="button"
                accessibilityLabel={`Manage replay ${replay.title}`}
              >
                <View style={styles.contentReplayPoster}>
                  <Text style={styles.contentReplayKicker}>REPLAY</Text>
                  <Text style={styles.contentReplayTitle} numberOfLines={3}>{replay.title}</Text>
                  <View style={styles.contentReplayBottom}>
                    <Text style={styles.contentReplayMeta} numberOfLines={1}>{formatCreatorReplayVisibilityLabel(replay.visibility)}</Text>
                    <Text style={styles.contentReplayMeta} numberOfLines={1}>{formatCreatorReplayStatusLabel(replay.saveStatus)}</Text>
                  </View>
                </View>
                <View style={styles.contentShelfOverflow}><Text style={styles.contentShelfOverflowText}>•••</Text></View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      );
    };

    return (
      <View style={[styles.panel, styles.creatorContentPanel]}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderCopy}>
            <Text style={styles.panelTitle}>Content</Text>
            <Text style={styles.panelSubtitle}>A clean library of your uploads, drafts, paid videos, Circle media, replays, and events.</Text>
          </View>
          <AppActionButton
            accessibilityLabel="Add Video to Content Library"
            label="Add Video"
            onPress={openClipStudioForNew}
            testID="content-library-add-video-button"
            variant="primary"
          />
        </View>

        {videoNotice ? <View style={styles.noticeCard}><Text style={styles.noticeText}>{videoNotice}</Text></View> : null}

        <View style={styles.contentLibraryStatsRow}>
          {[
            `All ${totalContentItems}`,
            `Published ${publishedVideoCount}`,
            `Drafts ${draftVideoCount}`,
            `Paid ${paidVideos.length}`,
            `Circle ${circleVideoCount}`,
            `Replays ${replayCount}`,
          ].map((label) => (
            <View key={label} style={styles.contentLibraryStatPill}><Text style={styles.contentLibraryStatText}>{label}</Text></View>
          ))}
        </View>

        <TextInput
          style={[styles.input, styles.contentSearchInput]}
          placeholder="Search your content"
          placeholderTextColor="#8d8d8d"
          value={contentSearchQuery}
          onChangeText={setContentSearchQuery}
          autoCapitalize="none"
        />

        {videosLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading content...</Text>
          </View>
        ) : videosLoadError ? (
          <AppEmptyState actionLabel="Retry" body={videosLoadError} onAction={() => { void loadCreatorVideos(); }} title="Content couldn't refresh" />
        ) : hasVisibleRows ? (
          <>
            {videoShelves.map((shelf) => (
              <View key={shelf.key} style={styles.contentShelf} testID={`content-shelf-${shelf.key}`}>
                <View style={styles.contentShelfHeader}>
                  <Text style={styles.contentShelfTitle}>{shelf.title}</Text>
                  <Text style={styles.contentShelfCount}>{shelf.items.length}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contentShelfRow}>
                  {shelf.items.map(renderOwnedContentTile)}
                </ScrollView>
              </View>
            ))}

            {renderReplayShelf("Replays", searchedReplays)}
            {processingReplays.length !== searchedReplays.length ? renderReplayShelf("Processing", processingReplays) : null}
            {attentionReplays.length ? renderReplayShelf("Replay Needs Attention", attentionReplays) : null}

            {searchedEvents.length ? (
              <View style={styles.contentShelf} testID="content-shelf-events">
                <View style={styles.contentShelfHeader}>
                  <Text style={styles.contentShelfTitle}>Events</Text>
                  <Text style={styles.contentShelfCount}>{searchedEvents.length}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contentShelfRow}>
                  {searchedEvents.map((event) => (
                    <TouchableOpacity
                      key={event.id}
                      style={styles.contentEventCard}
                      activeOpacity={0.88}
                      onPress={() => router.push(`/event/${event.id}`)}
                    >
                      <Text style={styles.contentReplayKicker}>{formatEventStatusLabel(event.status).toUpperCase()}</Text>
                      <Text style={styles.contentReplayTitle} numberOfLines={3}>{event.eventTitle}</Text>
                      <View style={styles.contentReplayBottom}>
                        <Text style={styles.contentReplayMeta} numberOfLines={1}>{formatEventTypeLabel(event.eventType)}</Text>
                        <Text style={styles.contentReplayMeta} numberOfLines={1}>{formatIsoDate(event.startsAt)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        ) : (
          <AppEmptyState title={query ? "No matching content" : "No content yet"} body={query ? "Try another search." : "Open Clip Studio to add your first Platform video."} />
        )}

        <View style={styles.contentCreateFooter}>
          <View style={styles.studioActionRowCopy}>
            <Text style={styles.studioActionRowTitle}>Create something new</Text>
            <Text style={styles.studioActionRowBody}>Clip Studio handles video, cover, title card, draft, and publish.</Text>
          </View>
          <AppActionButton label="Open Clip Studio" onPress={openClipStudioForNew} />
        </View>
      </View>
    );
  };

'''
studio = replace_between(
    studio,
    '  const renderContentPanel = () => {',
    '  const renderClipStudioTab = () => {',
    new_content_panel,
    "Platform Studio content shelves",
)

studio = replace_once(
    studio,
    '        onEditVideo(video);\n',
    '        openClipStudioForVideo(video);\n',
    "content action sheet edit route",
)

studio_content_styles = '''  contentLibraryStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 4,
    marginBottom: 4,
  },
  contentLibraryStatPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  contentLibraryStatText: {
    color: "#DCE3F1",
    fontSize: 10.5,
    fontWeight: "800",
  },
  contentSearchInput: {
    marginTop: 8,
    marginBottom: 2,
  },
  contentShelf: {
    marginTop: 14,
    gap: 8,
  },
  contentShelfHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  contentShelfTitle: {
    color: "#F7F9FF",
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "900",
  },
  contentShelfCount: {
    color: "#8E9AAF",
    fontSize: 11,
    fontWeight: "800",
  },
  contentShelfRow: {
    gap: 9,
    paddingRight: 8,
  },
  contentShelfCard: {
    width: 150,
  },
  contentReplayCard: {
    width: 150,
    aspectRatio: 9 / 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(126,215,255,0.18)",
    backgroundColor: "rgba(10,14,22,0.94)",
    overflow: "hidden",
  },
  contentEventCard: {
    width: 150,
    aspectRatio: 9 / 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(18,10,18,0.94)",
    padding: 11,
    justifyContent: "flex-end",
    gap: 7,
  },
  contentReplayPoster: {
    flex: 1,
    padding: 11,
    paddingTop: 44,
    justifyContent: "flex-end",
    gap: 7,
  },
  contentReplayKicker: {
    color: "#AAB5C9",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  contentReplayTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  contentReplayBottom: {
    gap: 2,
  },
  contentReplayMeta: {
    color: "#B7C1D4",
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "700",
  },
  contentShelfOverflow: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(5,7,12,0.74)",
  },
  contentShelfOverflowText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "900",
    marginTop: -4,
  },
  contentCreateFooter: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
'''
studio = replace_once(
    studio,
    '  creatorContentPanel: {\n    borderColor: "rgba(220,20,60,0.26)",\n    backgroundColor: "rgba(30,13,24,0.92)",\n  },\n',
    '  creatorContentPanel: {\n    borderColor: "rgba(220,20,60,0.26)",\n    backgroundColor: "rgba(30,13,24,0.92)",\n  },\n' + studio_content_styles,
    "content shelf styles",
)

# Home discovery/live cards become compact, media-first tiles; rows stay horizontal.
new_feed_item = r'''  function renderFeedItemCard(item: DiscoveryFeedItem) {
    const title = String(item.title ?? "").trim() || "Public activity";
    const accessLabel = getDiscoveryAccessLabel(item);
    const liveLabel = getDiscoveryLiveLabel(item);
    const isCircleSpectatorItem = item.visibility === "circle" || item.visibility === "chilly_circle" || item.access_type === "circle";
    const rankingReason = isCircleSpectatorItem
      ? scoreCircleSpectatorFeedItem(item, circleSpectatorSignals).reason
      : scoreDiscoveryFeedItem(item, homeDiscoverySignals).reason;
    const rankingLabel = getDiscoveryRankingReasonLabel(rankingReason);

    return (
      <TouchableOpacity
        key={`feed-item-${item.id}`}
        testID={`home-discovery-card-${rankingReason}-${item.id}`}
        style={styles.feedActivityCard}
        activeOpacity={0.9}
        onPress={() => openDiscoveryFeedItem(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}`}
      >
        <View style={styles.feedActivityThumb}>
          <StableImage
            expectedWidth="100%"
            expectedHeight="100%"
            source={item.thumbnail_url ? { uri: item.thumbnail_url } : null}
            borderRadius={0}
            resizeMode="cover"
          />
          <View style={styles.feedActivityScrim} />
          <View style={styles.feedCompactBadgeRow}>
            <AppText scale="caption" style={[styles.feedCompactBadge, item.live_state === "live" ? styles.feedActivityLiveBadge : null]}>{liveLabel}</AppText>
            <AppText scale="caption" style={styles.feedCompactBadge}>{accessLabel}</AppText>
          </View>
          <View style={styles.feedCompactCopy}>
            <AppText scale="subhead" style={styles.feedCompactTitle} numberOfLines={2}>{title}</AppText>
            <AppText scale="caption" style={styles.feedCompactMeta} numberOfLines={1}>{rankingLabel}</AppText>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

'''
home = replace_between(home, '  function renderFeedItemCard(item: DiscoveryFeedItem) {', '  function renderEventCard(event: CreatorEventSummary) {', new_feed_item, "Home compact discovery cards")

new_event_card = r'''  function renderEventCard(event: CreatorEventSummary) {
    return (
      <TouchableOpacity
        key={`event-${event.id}`}
        style={styles.feedEventCard}
        activeOpacity={0.9}
        onPress={() => openChannel(event.hostUserId)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${event.eventTitle}`}
      >
        <View style={styles.feedEventBadgeRow}>
          <AppText scale="caption" style={[styles.feedEventBadge, event.isLiveNow ? styles.feedActivityLiveBadge : null]}>{event.isLiveNow ? "Live" : "Upcoming"}</AppText>
          <AppText scale="caption" style={styles.feedEventBadge}>{formatCreatorEventMode(event)}</AppText>
        </View>
        <View style={styles.feedEventCompactCopy}>
          <AppText scale="subhead" style={styles.feedEventTitle} numberOfLines={3}>{event.eventTitle}</AppText>
          <AppText scale="caption" style={styles.feedEventMeta} numberOfLines={1}>{formatFeedDate(event.startsAt)}</AppText>
        </View>
      </TouchableOpacity>
    );
  }

'''
home = replace_between(home, '  function renderEventCard(event: CreatorEventSummary) {', '  function renderHomeEventRail(input: {', new_event_card, "Home compact event cards")

home = replace_once(home, '  followingVideoCardWrap: {\n    width: 284,\n    marginRight: 12,\n  },', '  followingVideoCardWrap: {\n    width: 150,\n    marginRight: 8,\n  },', "Home creator card width")
home = replace_once(home, '  feedActivityCard: {\n    width: 282,', '  feedActivityCard: {\n    width: 150,', "Home discovery card width")
home = replace_once(home, '    borderRadius: 20,\n    borderWidth: 1,', '    borderRadius: 14,\n    borderWidth: 1,', "Home discovery card radius")
home = replace_once(home, '  feedActivityThumb: {\n    width: "100%",\n    aspectRatio: 16 / 9,', '  feedActivityThumb: {\n    width: "100%",\n    aspectRatio: 9 / 16,', "Home discovery poster ratio")
home = replace_once(home, '  feedEventCard: {\n    width: 282,', '  feedEventCard: {\n    width: 150,\n    aspectRatio: 9 / 16,', "Home event card width")
home_compact_styles = '''  feedCompactBadgeRow: {
    position: "absolute",
    top: 7,
    left: 7,
    right: 7,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  feedCompactBadge: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(5,7,12,0.72)",
    color: "#F4F7FC",
    fontSize: 9,
    fontWeight: "900",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  feedCompactCopy: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 9,
    paddingTop: 26,
    paddingBottom: 9,
    gap: 2,
    backgroundColor: "rgba(4,6,10,0.72)",
  },
  feedCompactTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  feedCompactMeta: {
    color: "#C3CDDE",
    fontSize: 9.5,
    fontWeight: "700",
  },
  feedEventCompactCopy: {
    marginTop: "auto",
    gap: 6,
  },
'''
home = replace_once(home, '  feedActivityCopy: {\n    paddingHorizontal: 14,\n    paddingVertical: 14,\n    gap: 8,\n  },\n', home_compact_styles + '  feedActivityCopy: {\n    paddingHorizontal: 9,\n    paddingVertical: 9,\n    gap: 4,\n  },\n', "Home compact styles")

# Regression guard: compact presentation must remain the default and shelves must remain categorized.
guard_anchor = 'for (const needle of ["Set Featured", "Remove Featured"]) {'
guard_add = '''for (const needle of [
  'type CreatorVideoCardVariant = "compact" | "detail";',
  'variant = "compact"',
  'styles.compactPreview',
]) {
  if (!creatorVideoCard.includes(needle)) {
    throw new Error(`Clip Studio guard failed: compact creator content card contract is missing "${needle}".`);
  }
}

for (const needle of [
  'title: "Recent Uploads"',
  'title: "Featured"',
  'title: "Published"',
  'title: "Drafts"',
  'title: "Paid Videos"',
  'title: "Chi\'lly Circle"',
  'title: "Needs Attention"',
  'content-shelf-events',
]) {
  if (!studio.includes(needle)) {
    throw new Error(`Clip Studio guard failed: Content shelf contract is missing "${needle}".`);
  }
}

'''
guard = replace_once(guard, guard_anchor, guard_add + guard_anchor, "content density guard")

card_path.write_text(card)
studio_path.write_text(studio)
home_path.write_text(home)
guard_path.write_text(guard)
print("Applied compact content cards, Platform Studio shelves, and Home density cleanup.")
