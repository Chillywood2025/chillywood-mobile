import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    buildUserChannelProfile,
    readMyListIds,
    readMergedWatchProgress,
    readUserProfile,
    toggleMyListTitle,
    type WatchProgressMap,
    type UserChannelProfile,
} from "../../_lib/userData";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveBrandingConfig,
    resolveFeatureConfig,
    resolveHomeConfig,
} from "../../_lib/appConfig";
import { getSafePartyUserId } from "../../_lib/watchParty";

import {
    ActivityIndicator,
    FlatList,
    Image,
    ImageBackground,
    type ImageSourcePropType,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { titles as localTitles } from "../../_data/titles";
import type { Tables } from "../../supabase/database.types";
import { supabase } from "../lib/_supabase";

type TitleRow = Omit<
  Pick<
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
    | "is_trending"
    | "pin_to_top_row"
    | "sort_order"
  >,
  "created_at"
> & {
  created_at?: string | null;
  slug?: string | null;
  video_thumbnail?: string | null;
};

type TitleLiveMetadata = {
  liveRoomCount: number;
  commentCount: number;
  reactionsEnabled: boolean;
};

type WatchPartyRoomRow = Pick<
  Tables<"watch_party_rooms">,
  "party_id" | "title_id" | "reactions_policy" | "last_activity_at" | "updated_at"
>;

type WatchPartyRoomMessageRow = Pick<Tables<"watch_party_room_messages">, "party_id">;

const LIVE_ACTIVITY_WINDOW_MILLIS = 15 * 60 * 1000;
const MAX_PROGRAM_SORT_ORDER = Number.MAX_SAFE_INTEGER;

const formatAddedDate = (value?: string | null) => {
  if (!value) return "Added recently";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Added recently";
  return `Added ${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
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

const buildDiscoveryInfoLine = (item: TitleRow) => {
  const segments = [
    String(item.category ?? "").trim() || "Title",
    String(item.runtime ?? "").trim() || (item.year ? String(item.year) : ""),
  ].filter(Boolean);

  return segments.join(" • ");
};

export default function HomeScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentChannel, setCurrentChannel] = useState<UserChannelProfile | null>(null);
  const [myListIds, setMyListIds] = useState<string[]>([]);
  const [myListTitles, setMyListTitles] = useState<TitleRow[]>([]);
  const [myListLoading, setMyListLoading] = useState(true);
  const [watchProgress, setWatchProgress] = useState<WatchProgressMap>({});
  const [titleLiveMetadataById, setTitleLiveMetadataById] = useState<Record<string, TitleLiveMetadata>>({});
  const homeConfig = resolveHomeConfig(appConfig);
  const brandingConfig = resolveBrandingConfig(appConfig);
  const featureConfig = resolveFeatureConfig(appConfig);
  const maxRailItems = Math.max(1, homeConfig.maxItemsPerRail || 8);
  const canShowContinueWatching = featureConfig.continueWatchingEnabled && homeConfig.enabledRails.continue_watching;

  async function fetchHomeConfig() {
    const nextConfig = await readAppConfig().catch(() => DEFAULT_APP_CONFIG);
    setAppConfig(nextConfig);
  }

  async function fetchTitleLiveMetadata(nextTitles: TitleRow[]) {
    const titleIds = nextTitles.map((item) => String(item.id)).filter(Boolean);
    if (!titleIds.length) {
      setTitleLiveMetadataById({});
      return;
    }

    try {
      const { data: roomData, error: roomError } = await supabase
        .from("watch_party_rooms")
        .select("party_id,title_id,reactions_policy,last_activity_at,updated_at")
        .eq("room_type", "title")
        .in("title_id", titleIds)
        .returns<WatchPartyRoomRow[]>();

      if (roomError || !roomData) {
        setTitleLiveMetadataById({});
        return;
      }

      const activeRooms = roomData.filter((row) => {
        const activitySource = String(row.last_activity_at ?? row.updated_at ?? "").trim();
        if (!activitySource) return false;
        const activityAt = Date.parse(activitySource);
        if (!Number.isFinite(activityAt)) return false;
        return Date.now() - activityAt <= LIVE_ACTIVITY_WINDOW_MILLIS;
      });

      if (!activeRooms.length) {
        setTitleLiveMetadataById({});
        return;
      }

      const activePartyIds = activeRooms.map((row) => String(row.party_id ?? "").trim()).filter(Boolean);
      const messageCountByPartyId: Record<string, number> = {};

      if (activePartyIds.length) {
        const { data: messageData } = await supabase
          .from("watch_party_room_messages")
          .select("party_id")
          .in("party_id", activePartyIds)
          .returns<WatchPartyRoomMessageRow[]>();

        messageData?.forEach((row) => {
          const partyId = String(row.party_id ?? "").trim();
          if (!partyId) return;
          messageCountByPartyId[partyId] = (messageCountByPartyId[partyId] ?? 0) + 1;
        });
      }

      const nextMetadata: Record<string, TitleLiveMetadata> = {};

      activeRooms.forEach((row) => {
        const titleId = String(row.title_id ?? "").trim();
        const partyId = String(row.party_id ?? "").trim();
        if (!titleId || !partyId) return;

        const current = nextMetadata[titleId] ?? {
          liveRoomCount: 0,
          commentCount: 0,
          reactionsEnabled: false,
        };

        current.liveRoomCount += 1;
        current.commentCount += messageCountByPartyId[partyId] ?? 0;
        current.reactionsEnabled = current.reactionsEnabled || String(row.reactions_policy ?? "").trim().toLowerCase() !== "muted";
        nextMetadata[titleId] = current;
      });

      setTitleLiveMetadataById(nextMetadata);
    } catch {
      setTitleLiveMetadataById({});
    }
  }

  async function fetchTitles() {
    setError(null);

    const { data, error } = await supabase
      .from("titles")
      .select(
        "id, title, category, year, runtime, synopsis, poster_url, created_at, featured, is_hero, is_trending, pin_to_top_row, sort_order",
      )
      .order("created_at", { ascending: false })
      .returns<TitleRow[]>();

    if (error) {
      setTitles([]);
      setTitleLiveMetadataById({});
      setError(error.message);
      return;
    }

    const nextTitles = data ?? [];
    setTitles(nextTitles);
    await fetchTitleLiveMetadata(nextTitles);
  }

  async function fetchWatchProgress() {
    const nextProgress = await readMergedWatchProgress().catch(() => ({} as WatchProgressMap));
    setWatchProgress(nextProgress);
  }

  async function fetchMyList() {
    setMyListLoading(true);

    const ids = await readMyListIds().catch(() => [] as string[]);
    setMyListIds(ids);

    if (!ids.length) {
      setMyListTitles([]);
      setMyListLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("titles")
        .select(
          "id, title, category, year, runtime, synopsis, poster_url, created_at, featured, is_hero, is_trending, pin_to_top_row, sort_order",
        )
        .in("id", ids)
        .returns<TitleRow[]>();

      if (!error && data) {
        const byId = new Map(data.map((item) => [String(item.id), item]));
        const ordered = ids.map((id) => byId.get(id)).filter((item): item is TitleRow => !!item);
        setMyListTitles(ordered);
        setMyListLoading(false);
        return;
      }
    } catch {
      // fall through to local fallback
    }

    const fallbackLocal = ids
      .map((id): TitleRow | null => {
        const localMatch = localTitles.find((item: any) => String(item.id) === id);
        if (!localMatch) return null;
        return {
          id,
          title: String((localMatch as any).title ?? "Untitled"),
          category: (localMatch as any).genre ?? null,
          year: (localMatch as any).year ?? null,
          runtime: (localMatch as any).runtime ?? null,
          synopsis: (localMatch as any).description ?? null,
          poster_url: null,
          created_at: null,
          video_url: null,
          featured: null,
          is_hero: null,
          is_trending: null,
          pin_to_top_row: null,
          sort_order: null,
          slug: null,
          video_thumbnail: null,
        };
      })
      .filter((item): item is TitleRow => !!item);

    setMyListTitles(fallbackLocal);
    setMyListLoading(false);
  }

  async function fetchCurrentChannelProfile() {
    const [profile, userId] = await Promise.all([
      readUserProfile().catch(() => null),
      getSafePartyUserId().catch(() => ""),
    ]);

    const nextChannel = buildUserChannelProfile({
      id: userId,
      profile,
      fallbackDisplayName: "You",
      isLive: false,
    });

    setCurrentChannel(nextChannel);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchHomeConfig(), fetchTitles(), fetchMyList(), fetchCurrentChannelProfile(), fetchWatchProgress()]);
      setLoading(false);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      Promise.all([fetchHomeConfig(), fetchMyList(), fetchCurrentChannelProfile(), fetchWatchProgress()]).catch(() => {});
    }, []),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([fetchHomeConfig(), fetchTitles(), fetchMyList(), fetchCurrentChannelProfile(), fetchWatchProgress()]);
    setRefreshing(false);
  }

  async function removeFromMyList(item: TitleRow) {
    const nextIds = await toggleMyListTitle(String(item.id), {
      title: item.title ?? undefined,
      posterUrl: item.poster_url ?? undefined,
    }).catch(() => myListIds);

    setMyListIds(nextIds);
    setMyListTitles((prev) => prev.filter((entry) => String(entry.id) !== String(item.id)));
  }

  function getImageUri(item?: TitleRow | null): ImageSourcePropType | null {
    if (!item) return null;
    const localMatch = localTitles.find(
      (t) =>
        String(t.id) === String(item.id) ||
        String(t.title ?? "").trim().toLowerCase() === String(item.title ?? "").trim().toLowerCase(),
    );
    const imageSource = (localMatch as any)?.image || localMatch?.poster || null;
    return imageSource;
  }

  function openPlayer(item: TitleRow) {
    const safeId = String(item.id || item.slug || item.title);
    router.push(`/player/${safeId}`);
  }

  function openTitleDetails(item: TitleRow) {
    const safeId = String(item.id || item.slug || item.title);
    router.push({
      pathname: "/title/[id]",
      params: { id: safeId },
    });
  }

  function openWatchParty() {
    router.push({ pathname: "/watch-party", params: { mode: "live" } });
  }

  function openOwnProfile() {
    if (!currentChannel?.id) return;

    router.push({
      pathname: "/profile/[userId]",
      params: {
        userId: currentChannel.id,
        displayName: currentChannel.displayName,
        role: currentChannel.role,
        isLive: "0",
        self: "1",
        ...(currentChannel.avatarUrl ? { avatarUrl: currentChannel.avatarUrl } : {}),
        ...(currentChannel.tagline ? { tagline: currentChannel.tagline } : {}),
      },
    });
  }

  function openSettings() {
    router.push("/settings");
  }

  const continueCandidates = useMemo(() => {
    return titles
      .filter((item) => {
        const progressEntry = watchProgress[String(item.id)];
        return !!progressEntry && progressEntry.positionMillis > 0;
      })
      .sort((a, b) => {
        const aUpdated = watchProgress[String(a.id)]?.updatedAt ?? 0;
        const bUpdated = watchProgress[String(b.id)]?.updatedAt ?? 0;
        return bUpdated - aUpdated;
      });
  }, [titles, watchProgress]);

  const latestTitles = useMemo(() => {
    return [...titles].sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at));
  }, [titles]);

  const programmedTitles = useMemo(() => sortTitlesByProgramTruth(titles), [titles]);

  const programmedHeroItem = useMemo(() => {
    const manualHeroTitleId = String(homeConfig.manualHeroTitleId ?? "").trim();
    const manualHeroItem = manualHeroTitleId
      ? programmedTitles.find((item) => String(item.id ?? "").trim() === manualHeroTitleId) ?? null
      : null;
    const heroFlagItem = programmedTitles.find((item) => item.is_hero === true) ?? null;

    if (homeConfig.heroMode === "manual_title") {
      return manualHeroItem ?? heroFlagItem ?? latestTitles[0] ?? null;
    }

    if (homeConfig.heroMode === "hero_flag") {
      return heroFlagItem ?? latestTitles[0] ?? null;
    }

    return latestTitles[0] ?? null;
  }, [homeConfig.heroMode, homeConfig.manualHeroTitleId, latestTitles, programmedTitles]);

  const topPicksRail = useMemo(() => {
    const sourceTitles = (() => {
      switch (homeConfig.topPicksSource) {
        case "top_row":
          return programmedTitles.filter((item) => item.pin_to_top_row === true);
        case "featured":
          return programmedTitles.filter((item) => item.featured === true);
        case "trending":
          return programmedTitles.filter((item) => item.is_trending === true);
        default:
          return latestTitles;
      }
    })();

    const usingConfiguredSource = sourceTitles.length > 0;
    const data = (usingConfiguredSource ? sourceTitles : latestTitles).slice(0, maxRailItems);
    const sourceLabel = usingConfiguredSource ? homeConfig.topPicksSource : "recent";
    const title = sourceLabel === "featured"
      ? "Featured Picks"
      : sourceLabel === "trending"
        ? "Trending Now"
        : sourceLabel === "top_row"
          ? "Top Row"
          : "Top Picks";

    return { data, title };
  }, [homeConfig.topPicksSource, latestTitles, maxRailItems, programmedTitles]);

  const continueWatchingTitles = useMemo(
    () => continueCandidates.slice(0, maxRailItems),
    [continueCandidates, maxRailItems],
  );

  const spotlightItem = (canShowContinueWatching ? continueCandidates[0] : null) ?? programmedHeroItem ?? null;
  const spotlightIsContinueWatching = canShowContinueWatching && !!continueCandidates.length && !!spotlightItem;
  const spotlightImageSource = getImageUri(spotlightItem);
  const spotlightProgress = spotlightItem ? watchProgress[String(spotlightItem.id)] : undefined;
  const spotlightProgressPercent = spotlightProgress?.durationMillis
    ? Math.max(8, Math.min(100, Math.round((spotlightProgress.positionMillis / spotlightProgress.durationMillis) * 100)))
    : 42;
  const homeAvatarInitial = String(currentChannel?.displayName ?? "You").slice(0, 1).toUpperCase() || "Y";

  const browseTitles = useMemo(() => {
    const browseQuery = String(homeConfig.browseCategoryQuery ?? "").trim().toLowerCase();
    const matchingTitles = browseQuery
      ? titles.filter((item) => String(item.category ?? "").trim().toLowerCase().includes(browseQuery))
      : titles;
    const sourceTitles = matchingTitles.length ? matchingTitles : titles;
    return sourceTitles.slice(0, maxRailItems);
  }, [homeConfig.browseCategoryQuery, maxRailItems, titles]);

  const favoriteTitles = useMemo(() => myListTitles.slice(0, maxRailItems), [maxRailItems, myListTitles]);

  function renderDiscoveryRail(title: string, data: TitleRow[], keyPrefix: string) {
    if (!data.length) return null;

    return (
      <View key={keyPrefix} style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>

        <FlatList
          horizontal
          data={data}
          keyExtractor={(item, idx) => `${keyPrefix}-${item.id}-${idx}`}
          renderItem={renderDiscoveryCard}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dramaRow}
        />
      </View>
    );
  }

  const renderDiscoveryCard = ({ item }: { item: TitleRow }) => {
    const cardImageSource = getImageUri(item);
    const liveMetadata = titleLiveMetadataById[String(item.id)];
    const infoLine = buildDiscoveryInfoLine(item);
    const addedLabel = formatAddedDate(item.created_at);

    return (
      <TouchableOpacity style={styles.dramaCard} onPress={() => openTitleDetails(item)} activeOpacity={0.9}>
        {cardImageSource ? (
          <Image source={cardImageSource} style={styles.dramaImage} />
        ) : (
          <View style={styles.dramaFallback} />
        )}
        <View style={styles.dramaOverlay} />

        {liveMetadata?.liveRoomCount ? (
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        ) : null}

        <View style={styles.dramaMeta}>
          <Text style={styles.dramaTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.dramaRuntime} numberOfLines={1}>
            {infoLine}
          </Text>
          <Text style={styles.dramaDate} numberOfLines={1}>
            {addedLabel}
          </Text>
          {liveMetadata?.liveRoomCount ? (
            <View style={styles.dramaLiveMetaRow}>
              <Text style={styles.dramaLiveMetaText}>
                {liveMetadata.commentCount} comment{liveMetadata.commentCount === 1 ? "" : "s"}
              </Text>
              {liveMetadata.reactionsEnabled ? (
                <Text style={styles.dramaLiveMetaText}>Reactions live</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ImageBackground
      source={spotlightImageSource || undefined}
      style={styles.screenBackground}
      resizeMode="cover"
    >
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#E50914" />
          <Text style={styles.muted}>Loading titles…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn’t load titles</Text>
          <Text style={styles.errorMsg}>{error}</Text>

          <Pressable style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : !titles.length ? (
        <View style={styles.center}>
          <Text style={styles.muted}>No titles yet.</Text>
          <Text style={styles.mutedSmall}>When you add titles later, they’ll show up here automatically.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.utilityRow, { marginTop: Math.max(safeAreaInsets.top, 8) }]}>
            <Text style={styles.utilityKicker}>HOME</Text>
            <View style={styles.utilityActions}>
              <TouchableOpacity
                style={styles.utilitySettingsButton}
                onPress={openSettings}
                activeOpacity={0.86}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
              >
                <Text style={styles.utilitySettingsText}>Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.profileAvatarButton, !currentChannel?.id && styles.profileAvatarButtonDisabled]}
                onPress={openOwnProfile}
                activeOpacity={0.86}
                disabled={!currentChannel?.id}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Open your channel"
              >
                {currentChannel?.avatarUrl ? (
                  <Image source={{ uri: currentChannel.avatarUrl }} style={styles.profileAvatarImage} />
                ) : (
                  <View style={styles.profileAvatarFallback}>
                    <Text style={styles.profileAvatarInitial}>{homeAvatarInitial}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {spotlightItem ? (
            <View style={styles.heroWrap}>
              {spotlightImageSource ? (
                <Image source={spotlightImageSource} style={styles.heroImage} />
              ) : (
                <View style={styles.heroFallback} />
              )}

              <View style={styles.heroOverlay} />

              <View style={styles.heroContent}>
                <Text style={styles.topBrand}>
                  {spotlightIsContinueWatching ? "CONTINUE WATCHING" : brandingConfig.homeHeroKicker}
                </Text>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {spotlightItem.title}
                </Text>
                <Text style={styles.heroSubtitle} numberOfLines={2}>
                  {spotlightIsContinueWatching
                    ? spotlightItem.synopsis || "Pick up where you left off without losing your place."
                    : spotlightItem.synopsis || "A cinematic story from the city streets."}
                </Text>

                <View style={styles.heroMetaRow}>
                  <Text style={styles.heroMetaText}>{buildDiscoveryInfoLine(spotlightItem)}</Text>
                  <Text style={styles.heroMetaDot}>•</Text>
                  <Text style={styles.heroMetaText}>{formatAddedDate(spotlightItem.created_at)}</Text>
                </View>

                {spotlightIsContinueWatching ? (
                  <View style={styles.heroProgressWrap}>
                    <View style={styles.heroProgressTrack}>
                      <View style={[styles.heroProgressFill, { width: `${spotlightProgressPercent}%` }]} />
                    </View>
                    <Text style={styles.heroProgressText}>
                      {spotlightProgress?.durationMillis
                        ? `${Math.round(spotlightProgressPercent)}% complete`
                        : "Resume where you left off"}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.heroActionRow}>
                  <TouchableOpacity style={styles.playBtn} onPress={() => openPlayer(spotlightItem)} activeOpacity={0.9}>
                    <Text style={styles.playBtnText}>{spotlightIsContinueWatching ? "Resume" : "Play"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.watchPartyBtn} onPress={openWatchParty} activeOpacity={0.9}>
                    <Text style={styles.watchPartyBtnText}>Live Watch-Party</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          {homeConfig.railOrder.map((railKey) => {
            if (!homeConfig.enabledRails[railKey]) return null;

            if (railKey === "top_picks") {
              return renderDiscoveryRail(topPicksRail.title, topPicksRail.data, "top-picks");
            }

            if (railKey === "browse") {
              return renderDiscoveryRail(
                String(homeConfig.browseCategoryLabel ?? "").trim() || "Browse",
                browseTitles,
                "browse",
              );
            }

            if (railKey === "continue_watching") {
              if (!canShowContinueWatching || !continueWatchingTitles.length) return null;
              return renderDiscoveryRail("Continue Watching", continueWatchingTitles, "continue-watching");
            }

            if (railKey === "favorites") {
              if (!featureConfig.favoritesEnabled) return null;

              return (
                <View key="favorites" style={styles.section}>
                  <Text style={styles.sectionTitle}>Favorites</Text>

                  {myListLoading ? (
                    <View style={styles.myListLoadingWrap}>
                      <ActivityIndicator color="#E50914" />
                    </View>
                  ) : !favoriteTitles.length ? (
                    <Text style={styles.myListEmpty}>No saved titles yet.</Text>
                  ) : (
                    <FlatList
                      horizontal
                      data={favoriteTitles}
                      keyExtractor={(item, idx) => `${item.id}-${idx}`}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.myListRow}
                      renderItem={({ item }) => {
                        const cardImage = getImageUri(item);
                        const infoLine = buildDiscoveryInfoLine(item);
                        const addedLabel = formatAddedDate(item.created_at);
                        const liveMetadata = titleLiveMetadataById[String(item.id)];

                        return (
                          <View style={styles.myListCard}>
                            <TouchableOpacity style={styles.myListPosterWrap} onPress={() => openTitleDetails(item)} activeOpacity={0.9}>
                              {cardImage ? (
                                <Image source={cardImage} style={styles.myListImage} />
                              ) : (
                                <View style={styles.myListFallback} />
                              )}
                            </TouchableOpacity>
                            <Text style={styles.myListTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.myListMeta} numberOfLines={1}>{infoLine}</Text>
                            <Text style={styles.myListDate} numberOfLines={1}>{addedLabel}</Text>
                            {liveMetadata?.liveRoomCount ? (
                              <View style={styles.myListLiveMetaRow}>
                                <Text style={styles.myListLiveMetaText}>
                                  {liveMetadata.commentCount} comment{liveMetadata.commentCount === 1 ? "" : "s"}
                                </Text>
                                {liveMetadata.reactionsEnabled ? (
                                  <Text style={styles.myListLiveMetaText}>Reactions live</Text>
                                ) : null}
                              </View>
                            ) : null}
                            <TouchableOpacity style={styles.myListRemoveBtn} onPress={() => removeFromMyList(item)} activeOpacity={0.85}>
                              <Text style={styles.myListRemoveText}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      }}
                    />
                  )}
                </View>
              );
            }

            return null;
          })}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Chi&apos;llywood Originals</Text>
            <View style={styles.originalsPlaceholder}>
              <Text style={styles.originalsPlaceholderTitle}>Reserved for Chi&apos;llywood-owned originals</Text>
              <Text style={styles.originalsPlaceholderBody}>
                This lower Home area is intentionally left open for future original drops, curated rails, and platform-owned premieres.
              </Text>
            </View>
          </View>

        </ScrollView>
      )}
    </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screenBackground: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 28,
    backgroundColor: "transparent",
  },
  utilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
  },
  utilityKicker: {
    color: "#8D98AE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  utilityActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  utilitySettingsButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(12,12,16,0.84)",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  utilitySettingsText: {
    color: "#F4F7FC",
    fontSize: 12.5,
    fontWeight: "800",
  },
  profileAvatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(12,12,16,0.84)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarButtonDisabled: {
    opacity: 0.5,
  },
  profileAvatarImage: {
    width: "100%",
    height: "100%",
  },
  profileAvatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  profileAvatarInitial: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  muted: {
    color: "#aaa",
    marginTop: 10,
  },
  mutedSmall: {
    color: "#777",
    marginTop: 6,
    textAlign: "center",
  },
  errorTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  errorMsg: {
    color: "#ff6b6b",
    marginTop: 8,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 14,
    backgroundColor: "#E50914",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
  },

  heroWrap: {
    height: 460,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 18,
    borderRadius: 20,
    overflow: "hidden",
    justifyContent: "flex-end",
    position: "relative",
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  heroFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1A1A1A",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  heroContent: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  topBrand: {
    color: "#EAEAEA",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 10,
    textAlign: "left",
  },
  heroTitle: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    marginBottom: 8,
  },
  heroSubtitle: {
    color: "#D6D6D6",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  heroMetaText: {
    color: "#E8EDF8",
    fontSize: 11,
    fontWeight: "800",
  },
  heroMetaDot: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "900",
  },
  heroProgressWrap: {
    marginBottom: 14,
  },
  heroProgressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  heroProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#E50914",
  },
  heroProgressText: {
    color: "#DDE5F7",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 8,
  },
  playBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#E50914",
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 999,
  },
  playBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  heroActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  watchPartyBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    backgroundColor: "rgba(0,0,0,0.52)",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
  },
  watchPartyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },

  section: {
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 10,
  },

  continueCard: {
    height: 150,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1f1f1f",
    backgroundColor: "#111",
  },
  continueImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  continueFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1A1A1A",
  },
  continueOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  continueContent: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  continueTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  continueSub: {
    color: "#cfcfcf",
    fontSize: 12,
  },
  continueProgressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  continueProgressFill: {
    width: "42%",
    height: "100%",
    backgroundColor: "#E50914",
  },

  dramaRow: {
    paddingRight: 8,
  },
  dramaCard: {
    width: 150,
    height: 210,
    marginRight: 12,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1f1f1f",
    backgroundColor: "#111",
    position: "relative",
  },
  dramaImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  dramaFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1A1A1A",
  },
  dramaOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 118,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    borderRadius: 999,
    backgroundColor: "#E50914",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  dramaMeta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 8,
  },
  dramaTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  dramaRuntime: {
    color: "#c3c3c3",
    fontSize: 12,
    marginTop: 4,
  },
  dramaDate: {
    color: "#98A3BA",
    fontSize: 10.5,
    marginTop: 4,
    fontWeight: "700",
  },
  dramaLiveMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  dramaLiveMetaText: {
    color: "#E7EDF9",
    fontSize: 10.5,
    fontWeight: "800",
  },

  originalsPlaceholder: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(10,12,18,0.72)",
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 6,
  },
  originalsPlaceholderTitle: {
    color: "#F2F5FC",
    fontSize: 15,
    fontWeight: "900",
  },
  originalsPlaceholderBody: {
    color: "#97A3B8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },

  myListLoadingWrap: {
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  myListEmpty: {
    color: "#b5b5b5",
    fontSize: 13,
    marginTop: 4,
  },
  myListRow: {
    paddingRight: 8,
  },
  myListCard: {
    width: 150,
    marginRight: 12,
  },
  myListPosterWrap: {
    width: "100%",
    height: 170,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1f1f1f",
    backgroundColor: "#111",
  },
  myListImage: {
    width: "100%",
    height: "100%",
  },
  myListFallback: {
    flex: 1,
    backgroundColor: "#1A1A1A",
  },
  myListTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  myListMeta: {
    color: "#C0C8D8",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  myListDate: {
    color: "#8E98AE",
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: 2,
  },
  myListLiveMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  myListLiveMetaText: {
    color: "#F0D6DE",
    fontSize: 10.5,
    fontWeight: "800",
  },
  myListRemoveBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(229,9,20,0.18)",
    borderColor: "rgba(229,9,20,0.45)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  myListRemoveText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
});
