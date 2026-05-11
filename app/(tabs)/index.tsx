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
    resolveMonetizationConfig,
} from "../../_lib/appConfig";
import { getWritablePartyUserId } from "../../_lib/watchParty";
import {
    getRuntimeControlBlockedCopy,
    isRuntimeControlBlockedAccess,
    LIVE_FIRST_PREMIUM_UPSELL_COPY,
    requireLiveFirstPremium,
    type PremiumWatchPartyFeatureAccessDecision,
} from "../../_lib/premiumWatchPartyAccess";

import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    ImageBackground,
    type ImageSourcePropType,
    Pressable,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { titles as localTitles } from "../../_data/titles";
import type { Tables } from "../../supabase/database.types";
import { supabase } from "../../_lib/supabase";
import { readFollowedChannelUserIds } from "../../_lib/channelAudience";
import {
    readCreatorVideosForOwners,
    readLatestPublicCreatorVideos,
    type CreatorVideo,
} from "../../_lib/creatorVideos";
import { buildCreatorVideoDeepLink, isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";
import {
    getDiscoveryAccessLabel,
    getDiscoveryLiveLabel,
    rankDiscoveryFeedItems,
    readPublicDiscoveryFeedItems,
    type DiscoveryFeedItem,
} from "../../_lib/discoveryFeed";
import { readActiveFriendUserIds } from "../../_lib/friendGraph";
import { readLatestPublicEventSummaries, type CreatorEventSummary } from "../../_lib/liveEvents";
import { CreatorVideoCard } from "../../components/creator-media/creator-video-card";
import { AccessSheet } from "../../components/monetization/access-sheet";
import { NativeAdSlot } from "../../components/ads/NativeAdSlot";

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
const HOME_NATIVE_AD_FORBIDDEN_CONTEXTS = {
  activeVideoPlayback: false,
  activeLiveKitRoom: false,
  typingOrCommenting: false,
  uploadActive: false,
  paymentOrSubscriptionScreenActive: false,
  adminSurfaceActive: false,
  channelStudioSurfaceActive: false,
};

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

const formatFeedDate = (value?: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Time TBD";
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "Time TBD";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const formatCreatorEventMode = (event: CreatorEventSummary) => {
  if (event.eventType === "live_watch_party") return "Live Watch-Party";
  if (event.eventType === "watch_party_live") return "Watch-Party Live";
  return "Live First";
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
  const [followedChannelCount, setFollowedChannelCount] = useState(0);
  const [followingVideos, setFollowingVideos] = useState<CreatorVideo[]>([]);
  const [followingFeedLoading, setFollowingFeedLoading] = useState(true);
  const [followingFeedError, setFollowingFeedError] = useState<string | null>(null);
  const [homeLiveEvents, setHomeLiveEvents] = useState<CreatorEventSummary[]>([]);
  const [homeUpcomingEvents, setHomeUpcomingEvents] = useState<CreatorEventSummary[]>([]);
  const [circleVideos, setCircleVideos] = useState<CreatorVideo[]>([]);
  const [latestPublicVideos, setLatestPublicVideos] = useState<CreatorVideo[]>([]);
  const [homeDiscoveryItems, setHomeDiscoveryItems] = useState<DiscoveryFeedItem[]>([]);
  const [homeDiscoveryLoading, setHomeDiscoveryLoading] = useState(true);
  const [homeDiscoveryError, setHomeDiscoveryError] = useState<string | null>(null);
  const [liveFirstPremiumGate, setLiveFirstPremiumGate] = useState<PremiumWatchPartyFeatureAccessDecision | null>(null);
  const [liveFirstPremiumSheetVisible, setLiveFirstPremiumSheetVisible] = useState(false);
  const homeConfig = resolveHomeConfig(appConfig);
  const brandingConfig = resolveBrandingConfig(appConfig);
  const featureConfig = resolveFeatureConfig(appConfig);
  const monetizationConfig = resolveMonetizationConfig(appConfig);
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
      setError("Unable to refresh Home right now. Check your connection and try again.");
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
      getWritablePartyUserId().catch(() => null),
    ]);

    const signedInUserId = String(userId ?? "").trim();
    if (!signedInUserId) {
      setCurrentChannel(null);
      return;
    }

    const nextChannel = buildUserChannelProfile({
      id: signedInUserId,
      profile,
      fallbackDisplayName: "You",
      isLive: false,
    });

    setCurrentChannel(nextChannel);
  }

  async function fetchFollowingFeed() {
    setFollowingFeedLoading(true);
    setFollowingFeedError(null);

    try {
      const followedChannelIds = await readFollowedChannelUserIds({ limit: 50 });
      setFollowedChannelCount(followedChannelIds.length);

      if (!followedChannelIds.length) {
        setFollowingVideos([]);
        return;
      }

      const videos = await readCreatorVideosForOwners(followedChannelIds, { limit: 12 });
      setFollowingVideos(videos);
    } catch {
      setFollowedChannelCount(0);
      setFollowingVideos([]);
      setFollowingFeedError("Unable to load followed creator uploads right now.");
    } finally {
      setFollowingFeedLoading(false);
    }
  }

  async function fetchDiscoveryFeedV1() {
    setHomeDiscoveryLoading(true);
    setHomeDiscoveryError(null);

    try {
      const [publicEvents, latestVideos, circleUserIds, discoveryRows] = await Promise.all([
        readLatestPublicEventSummaries({ limit: 24 }),
        readLatestPublicCreatorVideos({ limit: 12 }),
        readActiveFriendUserIds().catch(() => [] as string[]),
        readPublicDiscoveryFeedItems({ surface: "home", limit: 24 }).catch(() => [] as DiscoveryFeedItem[]),
      ]);
      const uniqueCircleUserIds = Array.from(new Set(circleUserIds.map((id) => String(id ?? "").trim()).filter(Boolean)));
      const circleUploads = uniqueCircleUserIds.length
        ? await readCreatorVideosForOwners(uniqueCircleUserIds, { limit: 12 }).catch(() => [] as CreatorVideo[])
        : [];

      setHomeLiveEvents(publicEvents.filter((event) => event.isLiveNow).slice(0, 8));
      setHomeUpcomingEvents(publicEvents.filter((event) => event.isUpcoming).slice(0, 8));
      setLatestPublicVideos(latestVideos);
      setCircleVideos(circleUploads);
      setHomeDiscoveryItems(rankDiscoveryFeedItems(discoveryRows, { chillyCircleUserIds: uniqueCircleUserIds }));
    } catch {
      setHomeLiveEvents([]);
      setHomeUpcomingEvents([]);
      setLatestPublicVideos([]);
      setCircleVideos([]);
      setHomeDiscoveryItems([]);
      setHomeDiscoveryError("Discovery feed is unavailable right now.");
    } finally {
      setHomeDiscoveryLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        fetchHomeConfig(),
        fetchTitles(),
        fetchMyList(),
        fetchCurrentChannelProfile(),
        fetchWatchProgress(),
        fetchFollowingFeed(),
        fetchDiscoveryFeedV1(),
      ]);
      setLoading(false);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        fetchHomeConfig(),
        fetchMyList(),
        fetchCurrentChannelProfile(),
        fetchWatchProgress(),
        fetchFollowingFeed(),
        fetchDiscoveryFeedV1(),
      ]).catch(() => {});
    }, []),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      fetchHomeConfig(),
      fetchTitles(),
      fetchMyList(),
      fetchCurrentChannelProfile(),
      fetchWatchProgress(),
      fetchFollowingFeed(),
      fetchDiscoveryFeedV1(),
    ]);
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

  function openSpectatorMetadata(itemId?: string | null) {
    const safeItemId = String(itemId ?? "").trim();
    if (!safeItemId) return;
    router.push(`/spectate/${encodeURIComponent(safeItemId)}` as any);
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

    openSpectatorMetadata(item.id);
  }

  async function shareCreatorVideo(video: CreatorVideo) {
    if (!isCreatorVideoPubliclyShareable(video)) return;

    try {
      await Share.share({
        message: `Watch ${video.title} on Chi'llywood: ${buildCreatorVideoDeepLink(video.id)}`,
      });
    } catch {
      // The Home feed stays quiet if the native share sheet is unavailable.
    }
  }

  function openTitleDetails(item: TitleRow) {
    const safeId = String(item.id || item.slug || item.title);
    router.push({
      pathname: "/title/[id]",
      params: { id: safeId },
    });
  }

  async function openWatchParty() {
    const access = await requireLiveFirstPremium({ accessKey: "home-live-entry" }).catch(() => null);
    if (!access?.allowed) {
      if (isRuntimeControlBlockedAccess(access)) {
        const copy = getRuntimeControlBlockedCopy(access);
        Alert.alert(copy.title, copy.message);
        setLiveFirstPremiumGate(null);
        setLiveFirstPremiumSheetVisible(false);
        return;
      }
      if (access) setLiveFirstPremiumGate(access);
      setLiveFirstPremiumSheetVisible(true);
      return;
    }

    setLiveFirstPremiumGate(null);
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
  const livePulse = useMemo(() => {
    const liveEntries = Object.values(titleLiveMetadataById);
    const liveRoomCount = liveEntries.reduce((total, entry) => total + entry.liveRoomCount, 0);
    const liveCommentCount = liveEntries.reduce((total, entry) => total + entry.commentCount, 0);

    return {
      liveTitleCount: liveEntries.length,
      liveRoomCount,
      liveCommentCount,
      reactionsLive: liveEntries.some((entry) => entry.reactionsEnabled),
    };
  }, [titleLiveMetadataById]);
  const liveDiscoveryItems = useMemo(
    () => homeDiscoveryItems.filter((item) => item.live_state === "live").slice(0, 8),
    [homeDiscoveryItems],
  );
  const upcomingDiscoveryItems = useMemo(
    () => homeDiscoveryItems.filter((item) => item.live_state === "scheduled").slice(0, 8),
    [homeDiscoveryItems],
  );
  const homePulseTitle = livePulse.liveRoomCount
    ? `${livePulse.liveRoomCount} live room${livePulse.liveRoomCount === 1 ? "" : "s"} moving now`
    : continueWatchingTitles.length
      ? `${continueWatchingTitles.length} title${continueWatchingTitles.length === 1 ? "" : "s"} ready to resume`
      : `${titles.length} title${titles.length === 1 ? "" : "s"} ready on Home`;
  const homePulseBody = livePulse.liveRoomCount
    ? `${livePulse.liveTitleCount} title${livePulse.liveTitleCount === 1 ? "" : "s"} already have watch-party activity${livePulse.liveCommentCount ? ` and ${livePulse.liveCommentCount} live comment${livePulse.liveCommentCount === 1 ? "" : "s"}` : ""}.`
    : favoriteTitles.length
      ? `${favoriteTitles.length} saved title${favoriteTitles.length === 1 ? "" : "s"} stay close, and fresh picks are ready below.`
      : "Fresh picks, featured drops, and live watch-party entry stay ready from Home.";
  const homePulsePills = [
    livePulse.liveRoomCount
      ? `${livePulse.liveRoomCount} live room${livePulse.liveRoomCount === 1 ? "" : "s"}`
      : "No live rooms",
    favoriteTitles.length
      ? `${favoriteTitles.length} saved`
      : "Build your list",
    canShowContinueWatching && continueWatchingTitles.length
      ? `${continueWatchingTitles.length} resume`
      : "Fresh picks ready",
    ...(livePulse.reactionsLive ? ["Reactions live"] : []),
  ];

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

  function renderFeedItemCard(item: DiscoveryFeedItem) {
    const title = String(item.title ?? "").trim() || "Public activity";
    const subtitle = String(item.subtitle ?? "").trim();
    const ownerId = String(item.channel_user_id ?? item.owner_user_id ?? item.host_user_id ?? "").trim();
    const accessLabel = getDiscoveryAccessLabel(item);
    const liveLabel = getDiscoveryLiveLabel(item);
    const scheduleLabel = formatFeedDate(item.starts_at ?? item.published_at ?? item.created_at);

    return (
      <TouchableOpacity
        key={`feed-item-${item.id}`}
        style={styles.feedActivityCard}
        activeOpacity={0.88}
        onPress={() => openDiscoveryFeedItem(item)}
      >
        <View style={styles.feedActivityThumb}>
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={styles.feedActivityImage} />
          ) : (
            <View style={styles.feedActivityFallback}>
              <Text style={styles.feedActivityInitial}>{title.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.feedActivityScrim} />
          <View style={styles.feedActivityBadgeRow}>
            <Text style={[styles.feedActivityBadge, item.live_state === "live" ? styles.feedActivityLiveBadge : null]}>
              {liveLabel}
            </Text>
            <Text style={styles.feedActivityBadge}>{accessLabel}</Text>
          </View>
        </View>
        <View style={styles.feedActivityCopy}>
          <Text style={styles.feedActivityTitle} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.feedActivitySubtitle} numberOfLines={2}>{subtitle}</Text> : null}
          <Text style={styles.feedActivityMeta} numberOfLines={1}>{scheduleLabel}</Text>
          <View style={styles.feedActivityActionRow}>
            <Text style={styles.feedActivityActionText}>
              {item.item_type === "creator_upload" ? "Open" : "View Details"}
            </Text>
            {ownerId ? (
              <TouchableOpacity
                style={styles.feedActivityGhostButton}
                activeOpacity={0.82}
                onPress={(event) => {
                  event.stopPropagation();
                  openChannel(ownerId);
                }}
              >
                <Text style={styles.feedActivityGhostText}>Channel</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderEventCard(event: CreatorEventSummary) {
    return (
      <TouchableOpacity
        key={`event-${event.id}`}
        style={styles.feedEventCard}
        activeOpacity={0.88}
        onPress={() => openChannel(event.hostUserId)}
      >
        <View style={styles.feedEventBadgeRow}>
          <Text style={[styles.feedEventBadge, event.isLiveNow ? styles.feedActivityLiveBadge : null]}>
            {event.isLiveNow ? "Live" : "Upcoming"}
          </Text>
          <Text style={styles.feedEventBadge}>{formatCreatorEventMode(event)}</Text>
          <Text style={styles.feedEventBadge}>Public</Text>
        </View>
        <Text style={styles.feedEventTitle} numberOfLines={2}>{event.eventTitle}</Text>
        <Text style={styles.feedEventMeta}>{formatFeedDate(event.startsAt)}</Text>
        <Text style={styles.feedEventCopy} numberOfLines={2}>
          Public event metadata only. Full room entry remains gated by the room route.
        </Text>
      </TouchableOpacity>
    );
  }

  function renderHomeEventRail(input: {
    title: string;
    subtitle: string;
    feedItems: DiscoveryFeedItem[];
    events: CreatorEventSummary[];
    emptyTitle: string;
    emptyText: string;
  }) {
    const hasRows = input.feedItems.length > 0 || input.events.length > 0;

    return (
      <View style={styles.section}>
        <View style={styles.followingHeaderRow}>
          <View style={styles.followingHeaderCopy}>
            <Text style={styles.sectionTitle}>{input.title}</Text>
            <Text style={styles.followingSubtitle}>{input.subtitle}</Text>
          </View>
          {homeDiscoveryLoading ? <ActivityIndicator color="#E50914" /> : null}
        </View>

        {homeDiscoveryError ? (
          <View style={styles.followingEmptyCard}>
            <Text style={styles.followingEmptyTitle}>Discovery unavailable</Text>
            <Text style={styles.followingEmptyText}>{homeDiscoveryError}</Text>
          </View>
        ) : hasRows ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.feedActivityRow}
          >
            {input.feedItems.map(renderFeedItemCard)}
            {input.events.map(renderEventCard)}
          </ScrollView>
        ) : (
          <View style={styles.followingEmptyCard}>
            <Text style={styles.followingEmptyTitle}>{input.emptyTitle}</Text>
            <Text style={styles.followingEmptyText}>{input.emptyText}</Text>
          </View>
        )}
      </View>
    );
  }

  function renderCreatorVideoRail(input: {
    title: string;
    subtitle: string;
    videos: CreatorVideo[];
    loading?: boolean;
    emptyTitle: string;
    emptyText: string;
    keyPrefix: string;
  }) {
    return (
      <View style={styles.section}>
        <View style={styles.followingHeaderRow}>
          <View style={styles.followingHeaderCopy}>
            <Text style={styles.sectionTitle}>{input.title}</Text>
            <Text style={styles.followingSubtitle}>{input.subtitle}</Text>
          </View>
          {input.loading ? <ActivityIndicator color="#E50914" /> : null}
        </View>

        {input.loading ? (
          <View style={styles.followingEmptyCard}>
            <Text style={styles.followingEmptyTitle}>Checking public uploads</Text>
            <Text style={styles.followingEmptyText}>Only real public creator uploads appear here.</Text>
          </View>
        ) : input.videos.length ? (
          <FlatList
            horizontal
            data={input.videos}
            keyExtractor={(item) => `${input.keyPrefix}-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.followingVideoRow}
            renderItem={({ item }) => (
              <View style={styles.followingVideoCardWrap}>
                <CreatorVideoCard
                  video={item}
                  mode="public"
                  onOpen={() => openCreatorVideo(item)}
                  onShare={isCreatorVideoPubliclyShareable(item) ? () => {
                    void shareCreatorVideo(item);
                  } : undefined}
                />
              </View>
            )}
          />
        ) : (
          <View style={styles.followingEmptyCard}>
            <Text style={styles.followingEmptyTitle}>{input.emptyTitle}</Text>
            <Text style={styles.followingEmptyText}>{input.emptyText}</Text>
          </View>
        )}
      </View>
    );
  }

  const renderFollowingFeed = () => (
    <View style={styles.section}>
      <View style={styles.followingHeaderRow}>
        <View style={styles.followingHeaderCopy}>
          <Text style={styles.sectionTitle}>Channels You Follow</Text>
          <Text style={styles.followingSubtitle}>
            {followedChannelCount
              ? "Latest public creator uploads from channels you follow."
              : "Follow creators to see their latest uploads here."}
          </Text>
        </View>
        {followingFeedLoading ? <ActivityIndicator color="#E50914" /> : null}
      </View>

      {followingFeedError ? (
        <View style={styles.followingEmptyCard}>
          <Text style={styles.followingEmptyTitle}>Followed uploads unavailable</Text>
          <Text style={styles.followingEmptyText}>{followingFeedError}</Text>
        </View>
      ) : followingFeedLoading ? (
        <View style={styles.followingEmptyCard}>
          <Text style={styles.followingEmptyTitle}>Checking followed creators</Text>
          <Text style={styles.followingEmptyText}>Only real public creator uploads appear here.</Text>
        </View>
      ) : followingVideos.length ? (
        <FlatList
          horizontal
          data={followingVideos}
          keyExtractor={(item) => `following-video-${item.id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.followingVideoRow}
          renderItem={({ item }) => (
            <View style={styles.followingVideoCardWrap}>
              <CreatorVideoCard
                video={item}
                mode="public"
                onOpen={() => openCreatorVideo(item)}
                onShare={isCreatorVideoPubliclyShareable(item) ? () => {
                  void shareCreatorVideo(item);
                } : undefined}
              />
            </View>
          )}
        />
      ) : (
        <View style={styles.followingEmptyCard}>
          <Text style={styles.followingEmptyTitle}>
            {followedChannelCount ? "No new followed uploads yet" : "Follow creators to see their latest uploads here."}
          </Text>
          <Text style={styles.followingEmptyText}>
            {followedChannelCount
              ? "The channels you follow have no public clean creator videos ready for Home."
              : "Following is a creator/audience relationship, not Chi'lly Circle."}
          </Text>
          <TouchableOpacity
            style={styles.followingEmptyButton}
            activeOpacity={0.86}
            onPress={() => router.push("/(tabs)/explore")}
          >
            <Text style={styles.followingEmptyButtonText}>Explore</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

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
          <Text style={styles.muted}>Loading tonight&apos;s picks…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Home couldn&apos;t refresh</Text>
          <Text style={styles.errorMsg}>{error}</Text>

          <Pressable style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
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

          <View style={styles.homePulseCard}>
            <Text style={styles.homePulseKicker}>DISCOVERY PULSE</Text>
            <Text style={styles.homePulseTitle}>{homePulseTitle}</Text>
            <Text style={styles.homePulseBody}>{homePulseBody}</Text>
            <View style={styles.homePulseMetaRow}>
              {homePulsePills.map((pill) => (
                <View key={pill} style={styles.homePulsePill}>
                  <Text style={styles.homePulsePillText}>{pill}</Text>
                </View>
              ))}
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

          {renderHomeEventRail({
            title: "Live Now",
            subtitle: "Public, rights-safe live metadata from backed discovery rows and creator events.",
            feedItems: liveDiscoveryItems,
            events: homeLiveEvents,
            emptyTitle: "No public live rooms right now",
            emptyText: "Live rooms appear here only when a real public, clean, rights-safe source exists.",
          })}

          {renderFollowingFeed()}

          {renderCreatorVideoRail({
            title: "From Your Chi'lly Circle",
            subtitle: "Public uploads from active Circle friends when privacy allows.",
            videos: circleVideos,
            loading: homeDiscoveryLoading,
            emptyTitle: "No public Circle activity yet",
            emptyText: "Private Circle activity stays private; only public creator uploads can appear here.",
            keyPrefix: "circle-video",
          })}

          {renderHomeEventRail({
            title: "Upcoming Events",
            subtitle: "Public creator events from backed event and discovery read models.",
            feedItems: upcomingDiscoveryItems,
            events: homeUpcomingEvents,
            emptyTitle: "No upcoming public events yet",
            emptyText: "Scheduled public creator events will appear here when they are backed.",
          })}

          {renderCreatorVideoRail({
            title: "Latest Public Uploads",
            subtitle: "Fresh public creator uploads only; no drafts, private videos, or protected playback.",
            videos: latestPublicVideos,
            loading: homeDiscoveryLoading,
            emptyTitle: "No public uploads ready",
            emptyText: "Creator uploads appear here only after they are public and moderation-safe.",
            keyPrefix: "latest-public-video",
          })}

          <NativeAdSlot
            surface="home"
            routePath="/"
            forbiddenContexts={HOME_NATIVE_AD_FORBIDDEN_CONTEXTS}
          />

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
                    <Text style={styles.myListEmpty}>Saved titles land here.</Text>
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
              <Text style={styles.originalsPlaceholderTitle}>More Chi&apos;llywood drops land here next</Text>
              <Text style={styles.originalsPlaceholderBody}>
                This rail stays reserved for Chi&apos;llywood-owned originals, curated drops, and platform premieres when they are actually ready.
              </Text>
            </View>
          </View>

        </ScrollView>
      )}
    </View>
    <AccessSheet
      visible={liveFirstPremiumSheetVisible}
      reason="premium_required"
      gate={liveFirstPremiumGate}
      appDisplayName={brandingConfig.appDisplayName}
      premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
      premiumUpsellBody={monetizationConfig.premiumUpsellBody}
      titleOverride={LIVE_FIRST_PREMIUM_UPSELL_COPY.title}
      bodyOverride={LIVE_FIRST_PREMIUM_UPSELL_COPY.message}
      onClose={() => setLiveFirstPremiumSheetVisible(false)}
    />
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
  homePulseCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.16)",
    backgroundColor: "rgba(9,12,20,0.82)",
    paddingHorizontal: 17,
    paddingVertical: 15,
    gap: 9,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  homePulseKicker: {
    color: "#9AA8C4",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  homePulseTitle: {
    color: "#F5F8FF",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
  },
  homePulseBody: {
    color: "#C4CFE2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  homePulseMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  homePulsePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  homePulsePillText: {
    color: "#E2E9F7",
    fontSize: 11,
    fontWeight: "800",
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
    marginBottom: 20,
    borderRadius: 22,
    overflow: "hidden",
    justifyContent: "flex-end",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
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
    paddingHorizontal: 17,
    paddingBottom: 19,
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
    flexWrap: "wrap",
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
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 10,
  },
  followingHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  followingHeaderCopy: {
    flex: 1,
  },
  followingSubtitle: {
    color: "#AAB4C8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: -4,
    marginBottom: 10,
  },
  followingVideoRow: {
    paddingRight: 10,
  },
  followingVideoCardWrap: {
    width: 284,
    marginRight: 12,
  },
  followingEmptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(10,12,18,0.72)",
    paddingHorizontal: 16,
    paddingVertical: 17,
    gap: 8,
  },
  followingEmptyTitle: {
    color: "#F2F5FC",
    fontSize: 15,
    fontWeight: "900",
  },
  followingEmptyText: {
    color: "#97A3B8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  followingEmptyButton: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.22)",
    backgroundColor: "rgba(115,134,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  followingEmptyButtonText: {
    color: "#E5EAFF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  feedActivityRow: {
    paddingRight: 10,
    gap: 12,
  },
  feedActivityCard: {
    width: 282,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(10,12,18,0.76)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
  },
  feedActivityThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#151A25",
  },
  feedActivityImage: {
    width: "100%",
    height: "100%",
  },
  feedActivityFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#151A25",
  },
  feedActivityInitial: {
    color: "#F7FAFF",
    fontSize: 34,
    fontWeight: "900",
  },
  feedActivityScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,5,10,0.16)",
  },
  feedActivityBadgeRow: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  feedActivityBadge: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    color: "#F2F6FF",
    fontSize: 10.5,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  feedActivityLiveBadge: {
    backgroundColor: "#E50914",
    color: "#fff",
  },
  feedActivityCopy: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  feedActivityTitle: {
    color: "#F7FAFF",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  feedActivitySubtitle: {
    color: "#AAB5CA",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  feedActivityMeta: {
    color: "#8E99B0",
    fontSize: 11.5,
    fontWeight: "800",
  },
  feedActivityActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  feedActivityActionText: {
    color: "#FFE4EA",
    fontSize: 12.5,
    fontWeight: "900",
  },
  feedActivityGhostButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  feedActivityGhostText: {
    color: "#EEF4FF",
    fontSize: 11.5,
    fontWeight: "900",
  },
  feedEventCard: {
    width: 282,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(126,215,255,0.18)",
    backgroundColor: "rgba(12,18,28,0.86)",
    paddingHorizontal: 15,
    paddingVertical: 15,
    gap: 9,
  },
  feedEventBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  feedEventBadge: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(126,215,255,0.12)",
    color: "#D7F4FF",
    fontSize: 10.5,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  feedEventTitle: {
    color: "#F7FAFF",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  feedEventMeta: {
    color: "#C1CCDE",
    fontSize: 12,
    fontWeight: "800",
  },
  feedEventCopy: {
    color: "#92A0B7",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
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
