import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  type ImageSourcePropType,
  type ListRenderItem,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { titles as localTitles } from "../../_data/titles";
import {
  readCreatorVideos,
  readLatestPublicCreatorVideos,
  type CreatorVideo,
} from "../../_lib/creatorVideos";
import {
  getDiscoveryAccessLabel,
  getDiscoveryLiveLabel,
  rankDiscoveryFeedItems,
  readPublicDiscoveryFeedItems,
  type DiscoveryFeedItem,
} from "../../_lib/discoveryFeed";
import { readLatestPublicEventSummaries, type CreatorEventSummary } from "../../_lib/liveEvents";
import { RACHI_OFFICIAL_ACCOUNT } from "../../_lib/officialAccounts";
import { ROOM_ACTIVITY_ACTIVE_WINDOW_MS } from "../../_lib/performancePolicy";
import { supabase } from "../../_lib/supabase";
import { MainTabTopBar } from "../../components/navigation/main-tab-top-bar";
import type { Tables } from "../../supabase/database.types";

type TitleRow = Pick<
  Tables<"titles">,
  | "id"
  | "created_at"
  | "title"
  | "category"
  | "year"
  | "runtime"
  | "synopsis"
  | "poster_url"
  | "video_url"
  | "featured"
  | "is_hero"
  | "pin_to_top_row"
  | "sort_order"
> & {
  slug?: string | null;
};

type WatchPartyRoomRow = Pick<
  Tables<"watch_party_rooms">,
  "title_id" | "is_active" | "last_activity_at" | "updated_at"
>;

type TitleLiveMetadata = {
  liveRoomCount: number;
};

type ExploreBackedSections = {
  discoveryItems: DiscoveryFeedItem[];
  creatorVideos: CreatorVideo[];
  rachiOriginals: CreatorVideo[];
  publicEvents: CreatorEventSummary[];
};

const MAX_PROGRAM_SORT_ORDER = Number.MAX_SAFE_INTEGER;
const EXPLORE_BACKED_NOW = [
  "Titles",
  "Public discovery",
  "Creator video cards",
  "Rachi public-safe originals",
  "Creator event summaries",
] as const;
const CHILLYWOOD_BACKGROUND_SOURCE = require("../../assets/images/chillywood-branded-background.png");

const emptyBackedSections: ExploreBackedSections = {
  discoveryItems: [],
  creatorVideos: [],
  rachiOriginals: [],
  publicEvents: [],
};

const toTimestamp = (value?: string | null) => {
  const parsed = Date.parse(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const toProgramSortOrder = (value?: number | null) => (
  typeof value === "number" && Number.isFinite(value) ? value : MAX_PROGRAM_SORT_ORDER
);

const sortTitlesByProgramTruth = (items: TitleRow[]) => {
  return [...items].sort((a, b) => {
    const sortDelta = toProgramSortOrder(a.sort_order) - toProgramSortOrder(b.sort_order);
    if (sortDelta !== 0) return sortDelta;
    return toTimestamp(b.created_at) - toTimestamp(a.created_at);
  });
};

const isHttpUrl = (value?: string | null) => /^https?:\/\//i.test(String(value ?? "").trim());

const remoteImageSource = (value?: string | null): ImageSourcePropType | null => (
  isHttpUrl(value) ? { uri: String(value).trim() } : null
);

const buildExploreInfoLine = (item: TitleRow) => {
  const segments = [
    String(item.category ?? "").trim() || "Title",
    String(item.runtime ?? "").trim() || (item.year ? String(item.year) : ""),
  ].filter(Boolean);

  return segments.join(" • ");
};

const formatTitleBadgeList = (item: TitleRow, liveMetadata?: TitleLiveMetadata | null) => {
  const badges: Array<{ label: string; tone: "program" | "live" }> = [];

  if (liveMetadata?.liveRoomCount) badges.push({ label: "Live", tone: "live" });
  if (item.is_hero === true) badges.push({ label: "Hero", tone: "program" });
  if (item.featured === true) badges.push({ label: "Featured", tone: "program" });
  if (item.pin_to_top_row === true) badges.push({ label: "Top Row", tone: "program" });

  return badges;
};

const matchesExploreSearch = (item: TitleRow, rawQuery: string) => {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  return [
    item.title,
    item.category,
    item.synopsis,
    item.year,
    item.runtime,
  ].some((value) => String(value ?? "").toLowerCase().includes(query));
};

const formatEventMode = (event: CreatorEventSummary) => {
  if (event.eventType === "live_watch_party") return "Live Watch-Party";
  if (event.eventType === "watch_party_live") return "Watch-Party Live";
  return "Live First";
};

const formatDateTime = (value?: string | null) => {
  const timestamp = Date.parse(String(value ?? "").trim());
  if (!Number.isFinite(timestamp)) return "Time not set";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
};

const fetchBackedTitles = async () => {
  const { data, error } = await supabase
    .from("titles")
    .select(
      "id, created_at, title, category, year, runtime, synopsis, poster_url, video_url, featured, is_hero, pin_to_top_row, sort_order",
    )
    .order("created_at", { ascending: false })
    .returns<TitleRow[]>();

  if (error) {
    return {
      titles: [] as TitleRow[],
      error: "Unable to load titles right now. Check your connection and try again.",
    };
  }

  return {
    titles: data || [],
    error: null,
  };
};

export default function ExploreScreen() {
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [sections, setSections] = useState<ExploreBackedSections>(emptyBackedSections);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [titleLiveMetadataById, setTitleLiveMetadataById] = useState<Record<string, TitleLiveMetadata>>({});

  const programmedTitles = useMemo(() => sortTitlesByProgramTruth(titles), [titles]);
  const filteredTitles = useMemo(
    () => programmedTitles.filter((item) => matchesExploreSearch(item, searchQuery)),
    [programmedTitles, searchQuery],
  );
  const titlesCount = programmedTitles.length;
  const visibleTitlesCount = filteredTitles.length;
  const hasSearchQuery = searchQuery.trim().length > 0;
  const heroItem = useMemo(() => {
    const heroFlagItem = programmedTitles.find((item) => item.is_hero === true) ?? null;
    const featuredItem = programmedTitles.find((item) => item.featured === true) ?? null;
    const topRowItem = programmedTitles.find((item) => item.pin_to_top_row === true) ?? null;
    return heroFlagItem ?? featuredItem ?? topRowItem ?? programmedTitles[0] ?? null;
  }, [programmedTitles]);
  const featuredCount = programmedTitles.filter((item) => item.featured === true).length;
  const topRowCount = programmedTitles.filter((item) => item.pin_to_top_row === true).length;
  const liveTitleCount = Object.values(titleLiveMetadataById).filter((item) => item.liveRoomCount > 0).length;

  const rankedDiscoveryItems = useMemo(
    () => rankDiscoveryFeedItems(sections.discoveryItems),
    [sections.discoveryItems],
  );
  const liveDiscoveryItems = useMemo(
    () => rankedDiscoveryItems.filter((item) => item.live_state === "live").slice(0, 8),
    [rankedDiscoveryItems],
  );
  const platformDiscoveryItems = useMemo(
    () => rankedDiscoveryItems.filter((item) => item.item_type === "channel_update").slice(0, 8),
    [rankedDiscoveryItems],
  );
  const replayDiscoveryItems = useMemo(
    () => rankedDiscoveryItems
      .filter((item) => item.live_state === "replay_available_later" || item.item_type === "replay_later")
      .slice(0, 8),
    [rankedDiscoveryItems],
  );
  const creatorDiscoveryVideos = useMemo(
    () => sections.creatorVideos
      .filter((video) => video.ownerId !== RACHI_OFFICIAL_ACCOUNT.userId)
      .slice(0, 8),
    [sections.creatorVideos],
  );
  const liveEvents = useMemo(
    () => sections.publicEvents.filter((event) => event.isLiveNow).slice(0, 6),
    [sections.publicEvents],
  );
  const scheduledEvents = useMemo(
    () => sections.publicEvents.filter((event) => event.isUpcoming).slice(0, 8),
    [sections.publicEvents],
  );
  const replayEvents = useMemo(
    () => sections.publicEvents.filter((event) => event.replay.isReplayAvailableNow).slice(0, 8),
    [sections.publicEvents],
  );

  async function fetchTitleLiveMetadata(nextTitles: TitleRow[]) {
    const titleIds = nextTitles.map((item) => String(item.id)).filter(Boolean);
    if (!titleIds.length) {
      setTitleLiveMetadataById({});
      return;
    }

    try {
      const { data: roomData, error: roomError } = await supabase
        .from("watch_party_rooms")
        .select("title_id,is_active,last_activity_at,updated_at")
        .eq("is_active", true)
        .eq("room_type", "title")
        .in("title_id", titleIds)
        .returns<WatchPartyRoomRow[]>();

      if (roomError || !roomData) {
        setTitleLiveMetadataById({});
        return;
      }

      const activeRooms = roomData.filter((row) => {
        if (row.is_active !== true) return false;
        const activitySource = String(row.last_activity_at ?? row.updated_at ?? "").trim();
        if (!activitySource) return false;
        const activityAt = Date.parse(activitySource);
        if (!Number.isFinite(activityAt)) return false;
        return Date.now() - activityAt <= ROOM_ACTIVITY_ACTIVE_WINDOW_MS;
      });

      const nextMetadata: Record<string, TitleLiveMetadata> = {};
      activeRooms.forEach((row) => {
        const titleId = String(row.title_id ?? "").trim();
        if (!titleId) return;
        const current = nextMetadata[titleId] ?? { liveRoomCount: 0 };
        current.liveRoomCount += 1;
        nextMetadata[titleId] = current;
      });

      setTitleLiveMetadataById(nextMetadata);
    } catch {
      setTitleLiveMetadataById({});
    }
  }

  async function loadExplore(options?: { refresh?: boolean }) {
    if (options?.refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg(null);

    const [
      titleResult,
      publicDiscoveryItems,
      latestCreatorVideos,
      rachiOriginals,
      publicEvents,
    ] = await Promise.all([
      fetchBackedTitles(),
      readPublicDiscoveryFeedItems({ surface: "home", limit: 36 }).catch(() => [] as DiscoveryFeedItem[]),
      readLatestPublicCreatorVideos({ limit: 12 }).catch(() => [] as CreatorVideo[]),
      readCreatorVideos(RACHI_OFFICIAL_ACCOUNT.userId, { includeDrafts: false, limit: 12 }).catch(() => [] as CreatorVideo[]),
      readLatestPublicEventSummaries({ limit: 24 }).catch(() => [] as CreatorEventSummary[]),
    ]);

    setTitles(titleResult.titles);
    setErrorMsg(titleResult.error);
    setSections({
      discoveryItems: publicDiscoveryItems,
      creatorVideos: latestCreatorVideos,
      rachiOriginals,
      publicEvents,
    });
    await fetchTitleLiveMetadata(titleResult.titles);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void loadExplore();
  }, []);

  function getExploreImageSource(item?: TitleRow | null): ImageSourcePropType | null {
    if (!item) return null;

    const localMatch = localTitles.find(
      (t) =>
        String(t.id) === String(item.id) ||
        String(t.title ?? "").trim().toLowerCase() === String(item.title ?? "").trim().toLowerCase(),
    );

    const localSource = (localMatch as any)?.image || localMatch?.poster || null;
    return localSource || remoteImageSource(item.poster_url);
  }

  const backgroundSource = getExploreImageSource(heroItem) ?? CHILLYWOOD_BACKGROUND_SOURCE;

  function openCreatorVideo(video: CreatorVideo) {
    router.push({
      pathname: "/player/[id]",
      params: {
        id: video.id,
        source: "creator-video",
      },
    });
  }

  function openChannel(userId?: string | null) {
    const safeUserId = String(userId ?? "").trim();
    if (!safeUserId) return;
    router.push({
      pathname: "/channel/[userId]",
      params: { userId: safeUserId },
    });
  }

  function openDiscoveryFeedItem(item: DiscoveryFeedItem) {
    const mediaId = String(item.media_id ?? "").trim();
    if (item.item_type === "creator_upload" && mediaId) {
      router.push({
        pathname: "/player/[id]",
        params: {
          id: mediaId,
          source: "creator-video",
        },
      });
      return;
    }

    const channelUserId = String(item.channel_user_id ?? item.owner_user_id ?? item.host_user_id ?? "").trim();
    if (item.item_type === "channel_update" && channelUserId) {
      openChannel(channelUserId);
      return;
    }

    router.push(`/spectate/${encodeURIComponent(item.id)}` as any);
  }

  const renderBackedSection = (
    title: string,
    meta: string,
    hasRows: boolean,
    emptyTitle: string,
    emptyText: string,
    children: React.ReactNode,
  ) => (
    <View style={styles.discoverySection}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionMeta}>{meta}</Text>
      </View>
      {hasRows ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.discoveryRail}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.inlineEmpty}>
          <Text style={styles.inlineEmptyTitle}>{emptyTitle}</Text>
          <Text style={styles.inlineEmptyText}>{emptyText}</Text>
        </View>
      )}
    </View>
  );

  const renderDiscoveryCard = (item: DiscoveryFeedItem, labelOverride?: string) => {
    const thumbnail = remoteImageSource(item.thumbnail_url);
    const label = labelOverride ?? getDiscoveryLiveLabel(item);
    const accessLabel = getDiscoveryAccessLabel(item);
    const title = String(item.title ?? "").trim() || "Untitled";
    const subtitle = String(item.subtitle ?? "").trim() || String(item.category_key ?? "").trim() || "Public discovery";

    return (
      <TouchableOpacity
        key={`feed-${item.id}`}
        style={styles.discoveryCard}
        activeOpacity={0.88}
        onPress={() => openDiscoveryFeedItem(item)}
      >
        <View style={styles.discoveryThumb}>
          {thumbnail ? (
            <Image source={thumbnail} style={styles.discoveryThumbImage} />
          ) : (
            <Text style={styles.discoveryThumbInitial}>{title.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.smallBadgeRow}>
          <Text style={[styles.smallBadge, label === "Live" && styles.smallBadgeLive]}>{label}</Text>
          <Text style={styles.smallBadge}>{accessLabel}</Text>
        </View>
        <Text style={styles.discoveryCardTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.discoveryCardBody} numberOfLines={2}>{subtitle}</Text>
      </TouchableOpacity>
    );
  };

  const renderCreatorVideoCard = (video: CreatorVideo, label = "Creator Video") => {
    const thumbnail = remoteImageSource(video.thumbnailUrl);
    const title = video.title || "Untitled Video";

    return (
      <TouchableOpacity
        key={`${label}-${video.id}`}
        style={styles.discoveryCard}
        activeOpacity={0.88}
        onPress={() => openCreatorVideo(video)}
      >
        <View style={styles.discoveryThumb}>
          {thumbnail ? (
            <Image source={thumbnail} style={styles.discoveryThumbImage} />
          ) : (
            <Text style={styles.discoveryThumbInitial}>{title.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.smallBadgeRow}>
          <Text style={styles.smallBadge}>Public</Text>
          <Text style={styles.smallBadge}>{label}</Text>
        </View>
        <Text style={styles.discoveryCardTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.discoveryCardBody} numberOfLines={2}>
          {video.publicClipMetadata?.subtitleText || video.description || "Public creator video card."}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderEventCard = (event: CreatorEventSummary, replay = false) => (
    <TouchableOpacity
      key={`${replay ? "replay-event" : "event"}-${event.id}`}
      style={styles.discoveryCard}
      activeOpacity={0.88}
      onPress={() => openChannel(event.hostUserId)}
    >
      <View style={[styles.eventThumb, event.isLiveNow && styles.eventThumbLive]}>
        <Text style={styles.eventThumbText}>{event.isLiveNow ? "LIVE" : replay ? "REPLAY" : "EVENT"}</Text>
      </View>
      <View style={styles.smallBadgeRow}>
        <Text style={[styles.smallBadge, event.isLiveNow && styles.smallBadgeLive]}>
          {event.isLiveNow ? "Live" : replay ? "Replay" : "Upcoming"}
        </Text>
        <Text style={styles.smallBadge}>{formatEventMode(event)}</Text>
      </View>
      <Text style={styles.discoveryCardTitle} numberOfLines={2}>{event.eventTitle}</Text>
      <Text style={styles.discoveryCardBody} numberOfLines={2}>
        {replay ? formatDateTime(event.replay.replayAvailableAt) : formatDateTime(event.startsAt)}
      </Text>
    </TouchableOpacity>
  );

  const renderTitleItem: ListRenderItem<TitleRow> = ({ item }) => {
    const imageSource = getExploreImageSource(item);
    const liveMetadata = titleLiveMetadataById[String(item.id)] ?? null;
    const badges = formatTitleBadgeList(item, liveMetadata);

    return (
      <TouchableOpacity
        onPress={() => {
          const safeId = String(item.id || item.slug || item.title);
          router.push(`/title/${safeId}`);
        }}
        style={styles.titleCard}
        activeOpacity={0.9}
      >
        <View style={styles.titlePoster}>
          {imageSource ? (
            <Image source={imageSource} style={styles.titlePosterImage} />
          ) : (
            <Text style={styles.titlePosterInitial}>{(item.title || "U").slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.titleCopy}>
          <View style={styles.smallBadgeRow}>
            {badges.length ? badges.slice(0, 3).map((badge) => (
              <Text
                key={`${item.id}-${badge.label}`}
                style={[styles.smallBadge, badge.tone === "live" && styles.smallBadgeLive]}
              >
                {badge.label}
              </Text>
            )) : (
              <Text style={styles.smallBadge}>Title</Text>
            )}
          </View>
          <Text numberOfLines={2} style={styles.titleName}>{item.title || "Untitled"}</Text>
          <Text numberOfLines={1} style={styles.titleMeta}>{buildExploreInfoLine(item)}</Text>
          {liveMetadata?.liveRoomCount ? (
            <Text style={styles.liveSummary}>
              {liveMetadata.liveRoomCount === 1 ? "1 active title room" : `${liveMetadata.liveRoomCount} active title rooms`}
            </Text>
          ) : null}
          {!!item.synopsis && (
            <Text numberOfLines={2} style={styles.titleSynopsis}>{item.synopsis}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.fullBackground} pointerEvents="none">
        <ImageBackground
          source={backgroundSource}
          style={styles.fullBackground}
          resizeMode="cover"
        />
      </View>
      <View style={styles.fullBackgroundOverlay} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#E50914" />
            <Text style={styles.muted}>Loading Explore...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredTitles}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={renderTitleItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadExplore({ refresh: true })} tintColor="#E50914" />}
            ListHeaderComponent={
              <View style={styles.headerBlock}>
                <MainTabTopBar surface="explore" label="EXPLORE" style={styles.mainTabTopBar} />
                <Text style={styles.exploreTitle}>Explore</Text>
                <Text style={styles.count}>
                  {hasSearchQuery ? `Showing ${visibleTitlesCount} of ${titlesCount} titles` : `Titles: ${titlesCount}`}
                </Text>
                <Text style={styles.headerBody}>
                  Search titles, public Platforms, creator videos, Originals, events, and replays from current public sources.
                </Text>
                {errorMsg ? (
                  <View style={styles.inlineError}>
                    <Text style={styles.inlineErrorTitle}>Titles could not refresh</Text>
                    <Text style={styles.inlineErrorText}>{errorMsg}</Text>
                    <Pressable onPress={() => void loadExplore({ refresh: true })} style={styles.retryBtn}>
                      <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.scopeChipRow}>
                  {EXPLORE_BACKED_NOW.map((label) => (
                    <View key={label} style={styles.scopeChip}>
                      <Text style={styles.scopeChipText}>{label}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.searchShell}>
                  <Text style={styles.searchLabel}>Search titles</Text>
                  <TextInput
                    testID="explore-title-search-input"
                    accessibilityLabel="Search Chi'llwood titles"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search title, category, or description"
                    placeholderTextColor="#858C9D"
                    style={styles.searchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                  />
                </View>

                <View style={styles.statRow}>
                  <View style={styles.statPill}>
                    <Text style={styles.statValue}>{featuredCount}</Text>
                    <Text style={styles.statLabel}>Featured</Text>
                  </View>
                  <View style={styles.statPill}>
                    <Text style={styles.statValue}>{topRowCount}</Text>
                    <Text style={styles.statLabel}>Top Row</Text>
                  </View>
                  <View style={[styles.statPill, liveTitleCount ? styles.statPillLive : null]}>
                    <Text style={styles.statValue}>{liveTitleCount}</Text>
                    <Text style={styles.statLabel}>Title Rooms</Text>
                  </View>
                </View>

                {renderBackedSection(
                  "Live Now",
                  `${liveDiscoveryItems.length + liveEvents.length} ready`,
                  liveDiscoveryItems.length + liveEvents.length > 0,
                  "No public live rooms right now",
                  "Live rooms appear here when current public sources say they are live.",
                  <>
                    {liveDiscoveryItems.map((item) => renderDiscoveryCard(item, "Live"))}
                    {liveEvents.map((event) => renderEventCard(event))}
                  </>,
                )}

                {renderBackedSection(
                  "Platforms",
                  `${platformDiscoveryItems.length} ready`,
                  platformDiscoveryItems.length > 0,
                  "No public Platforms yet",
                  "Platform cards appear after public discovery identifies a public Platform update.",
                  platformDiscoveryItems.map((item) => renderDiscoveryCard(item, "Platform")),
                )}

                {renderBackedSection(
                  "Creator Videos",
                  `${creatorDiscoveryVideos.length} ready`,
                  creatorDiscoveryVideos.length > 0,
                  "No public creator videos yet",
                  "Creator video cards come only from the public creator-video resolver.",
                  creatorDiscoveryVideos.map((video) => renderCreatorVideoCard(video)),
                )}

                {renderBackedSection(
                  "Chi'llwood Originals",
                  `${sections.rachiOriginals.length} ready`,
                  sections.rachiOriginals.length > 0,
                  "No public Originals yet",
                  "Rachi Originals appear here only from the official public-safe creator video list.",
                  sections.rachiOriginals.map((video) => renderCreatorVideoCard(video, "Rachi")),
                )}

                {renderBackedSection(
                  "Events",
                  `${scheduledEvents.length} ready`,
                  scheduledEvents.length > 0,
                  "No scheduled public events",
                  "Events appear here after creator event summaries are public and scheduled.",
                  scheduledEvents.map((event) => renderEventCard(event)),
                )}

                {renderBackedSection(
                  "Replays",
                  `${replayDiscoveryItems.length + replayEvents.length} ready`,
                  replayDiscoveryItems.length + replayEvents.length > 0,
                  "No public replays yet",
                  "Replay cards appear only after a replay feed row or event replay is public and available.",
                  <>
                    {replayDiscoveryItems.map((item) => renderDiscoveryCard(item, "Replay"))}
                    {replayEvents.map((event) => renderEventCard(event, true))}
                  </>,
                )}

                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Titles</Text>
                  <Text style={styles.sectionMeta}>Backed</Text>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.centerCard}>
                <Text style={styles.muted}>{hasSearchQuery ? "No matching titles." : "No published titles yet."}</Text>
                <Text style={styles.mutedSmall}>
                  {hasSearchQuery
                    ? "Try another title, category, year, runtime, or description."
                    : "Chi'llwood titles will appear here once public programming is available."}
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fullBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  fullBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  centerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 16,
    marginTop: 4,
  },
  headerBlock: {
    paddingTop: 10,
    paddingBottom: 16,
    gap: 12,
  },
  mainTabTopBar: {
    marginBottom: 2,
  },
  exploreTitle: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
  },
  count: {
    color: "#D6D6D6",
    fontSize: 13,
    fontWeight: "800",
  },
  headerBody: {
    color: "#CFCFD8",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  scopeChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scopeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.32)",
    backgroundColor: "rgba(229,9,20,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  scopeChipText: {
    color: "#FFE8EA",
    fontSize: 11,
    fontWeight: "900",
  },
  searchShell: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.14)",
    backgroundColor: "rgba(9,12,20,0.78)",
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  searchLabel: {
    color: "#A8AFBF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  searchInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.055)",
    color: "#FFFFFF",
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "700",
  },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statPill: {
    minWidth: 92,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.075)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statPillLive: {
    backgroundColor: "rgba(229,9,20,0.18)",
    borderColor: "rgba(229,9,20,0.45)",
  },
  statValue: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  statLabel: {
    color: "#D6D6D6",
    marginTop: 4,
    fontSize: 11,
    fontWeight: "800",
  },
  discoverySection: {
    gap: 9,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 2,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  sectionMeta: {
    color: "#9DA7BB",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  discoveryRail: {
    gap: 10,
    paddingRight: 6,
  },
  discoveryCard: {
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
  discoveryThumbImage: {
    width: "100%",
    height: "100%",
  },
  discoveryThumbInitial: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
  },
  eventThumb: {
    height: 82,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(115,134,255,0.2)",
  },
  eventThumbLive: {
    backgroundColor: "rgba(229,9,20,0.28)",
  },
  eventThumbText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  discoveryCardTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  discoveryCardBody: {
    color: "#BFC7D7",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  smallBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  smallBadge: {
    overflow: "hidden",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#EAF0FF",
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  smallBadgeLive: {
    borderColor: "rgba(229,9,20,0.55)",
    backgroundColor: "rgba(229,9,20,0.2)",
  },
  inlineEmpty: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  inlineEmptyTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  inlineEmptyText: {
    color: "#BFC7D7",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  inlineError: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.3)",
    backgroundColor: "rgba(229,9,20,0.12)",
    padding: 12,
    gap: 6,
  },
  inlineErrorTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  inlineErrorText: {
    color: "#FFDDE0",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  retryBtn: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: 12,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  retryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  list: {
    flex: 1,
    backgroundColor: "transparent",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    backgroundColor: "transparent",
  },
  titleCard: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(13,13,17,0.92)",
  },
  titlePoster: {
    width: 74,
    height: 108,
    borderRadius: 8,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#171A22",
  },
  titlePosterImage: {
    width: "100%",
    height: "100%",
  },
  titlePosterInitial: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  titleName: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
  },
  titleMeta: {
    color: "#D6D6D6",
    fontSize: 12,
    fontWeight: "700",
  },
  liveSummary: {
    color: "#FFB8BE",
    fontSize: 11,
    fontWeight: "900",
  },
  titleSynopsis: {
    color: "#BFC7D7",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  muted: {
    color: "#D6D6D6",
    marginTop: 10,
    fontSize: 13,
    fontWeight: "800",
  },
  mutedSmall: {
    color: "#AEB6C6",
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
});
