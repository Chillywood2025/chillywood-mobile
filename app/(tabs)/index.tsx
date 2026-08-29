import { router, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    buildUserChannelProfile,
    readCachedUserProfile,
    readMergedWatchProgress,
    readUserProfile,
    readUserProfileByUserId,
    type WatchProgressMap,
    type UserChannelProfile,
} from "../../_lib/userData";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveFeatureConfig,
    resolveHomeConfig,
} from "../../_lib/appConfig";
import { getWritablePartyUserId } from "../../_lib/watchParty";

import {
    ActivityIndicator,
    FlatList,
    ImageBackground,
    type ImageSourcePropType,
    Pressable,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { titles as localTitles } from "../../_data/titles";
import type { Tables } from "../../supabase/database.types";
import { supabase } from "../../_lib/supabase";
import {
    readCreatorVideos,
    type CreatorVideo,
} from "../../_lib/creatorVideos";
import { readCreatorRelationshipFeedVideos } from "../../_lib/creatorFeed";
import { readRankedCircleSpectatorFeedItems } from "../../_lib/circleSpectatorFeed";
import { RACHI_OFFICIAL_ACCOUNT } from "../../_lib/officialAccounts";
import { readProfilePosts, type ProfilePost } from "../../_lib/profilePosts";
import { buildCreatorVideoDeepLink, isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";
import {
    getDiscoveryAccessLabel,
    getDiscoveryLiveLabel,
    getDiscoveryRankingReasonLabel,
    rankDiscoveryFeedItems,
    readRankedPublicDiscoveryFeedItems,
    scoreCircleSpectatorFeedItem,
    scoreDiscoveryFeedItem,
    type DiscoveryFeedItem,
    type DiscoveryFeedRankingSignals,
} from "../../_lib/discoveryFeed";
import { readLatestPublicEventSummaries, type CreatorEventSummary } from "../../_lib/liveEvents";
import { CreatorVideoCard } from "../../components/creator-media/creator-video-card";
import { NativeAdSlot } from "../../components/ads/NativeAdSlot";
import { ROOM_ACTIVITY_ACTIVE_WINDOW_MS } from "../../_lib/performancePolicy";
import { AppEmptyState, AppSection } from "../../components/ui/app-surface";
import { StableImage } from "../../components/ui/StableImage";
import { ProfileMediaImage as Image } from "../../components/ui/ProfileMediaImage";
import { AppText } from "../../components/ui/typography";
import { setMainTabHeaderProfileSnapshot } from "../../components/navigation/main-tab-profile-cache";
import { NotificationBellButton } from "../../components/notifications/notification-bell-button";

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
    | "content_access_rule"
    | "featured"
    | "is_hero"
    | "is_trending"
    | "is_published"
    | "pin_to_top_row"
    | "sort_order"
    | "status"
  >,
  "created_at"
> & {
  created_at?: string | null;
  slug?: string | null;
  video_thumbnail?: string | null;
};

type HomeActiveTitleRoomRow = Pick<
  Tables<"watch_party_rooms">,
  "party_id" | "title_id" | "is_active" | "last_activity_at" | "updated_at"
>;

const CHILLYWOOD_BACKGROUND_SOURCE = require("../../assets/images/chillywood-branded-background.png");
const HOME_CONTINUE_MIN_POSITION_MILLIS = 10_000;
const HOME_CONTINUE_COMPLETION_THRESHOLD = 0.94;
const HOME_CONTINUE_BLOCKED_TITLE_STATUSES = new Set([
  "archived",
  "blocked",
  "deleted",
  "draft",
  "private",
  "removed",
  "restricted",
  "scheduled",
  "unpublished",
]);
const HOME_CONTINUE_BLOCKED_ACCESS_RULES = new Set([
  "blocked",
  "deleted",
  "private",
  "removed",
  "restricted",
  "ticketed",
]);
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

const buildDiscoveryInfoLine = (item: TitleRow) => {
  const segments = [
    String(item.category ?? "").trim() || "Title",
    String(item.runtime ?? "").trim() || (item.year ? String(item.year) : ""),
  ].filter(Boolean);

  return segments.join(" • ");
};

const isEligibleContinueWatchingProgress = (entry?: WatchProgressMap[string]) => {
  const position = Number(entry?.positionMillis ?? 0);
  if (!Number.isFinite(position) || position < HOME_CONTINUE_MIN_POSITION_MILLIS) return false;

  const duration = Number(entry?.durationMillis ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return true;

  return position / duration < HOME_CONTINUE_COMPLETION_THRESHOLD;
};

const isAvailableContinueWatchingTitle = (item: TitleRow) => {
  if (!String(item.id ?? "").trim()) return false;
  if (item.is_published === false) return false;

  const status = String(item.status ?? "").trim().toLowerCase();
  if (HOME_CONTINUE_BLOCKED_TITLE_STATUSES.has(status)) return false;

  const accessRule = String(item.content_access_rule ?? "").trim().toLowerCase();
  if (HOME_CONTINUE_BLOCKED_ACCESS_RULES.has(accessRule)) return false;

  return true;
};

const getContinueLastWatchedAt = (entry?: WatchProgressMap[string]) => {
  const timestamp = Number(entry?.updatedAt ?? 0);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getContinueWatchingProgressPercent = (entry?: WatchProgressMap[string]) => {
  const position = Number(entry?.positionMillis ?? 0);
  const duration = Number(entry?.durationMillis ?? 0);
  if (!Number.isFinite(position) || position <= 0 || !Number.isFinite(duration) || duration <= 0) return 6;
  return Math.max(2, Math.min(94, Math.round((position / duration) * 100)));
};

const formatContinueWatchingLabel = (entry?: WatchProgressMap[string]) => {
  const duration = Number(entry?.durationMillis ?? 0);
  if (Number.isFinite(duration) && duration > 0) {
    return `${getContinueWatchingProgressPercent(entry)}% watched`;
  }
  return "In progress";
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
  const { height: viewportHeight } = useWindowDimensions();
  const brandRevealHeight = Math.max(120, Math.min(160, viewportHeight * 0.16));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentChannel, setCurrentChannel] = useState<UserChannelProfile | null>(null);
  const [watchProgress, setWatchProgress] = useState<WatchProgressMap>({});
  const [, setHomeActiveTitleRoomCount] = useState(0);
  const [homeLiveEvents, setHomeLiveEvents] = useState<CreatorEventSummary[]>([]);
  const [homeUpcomingEvents, setHomeUpcomingEvents] = useState<CreatorEventSummary[]>([]);
  const [followedFeedVideos, setFollowedFeedVideos] = useState<CreatorVideo[]>([]);
  const [circleFeedVideos, setCircleFeedVideos] = useState<CreatorVideo[]>([]);
  const [followedFeedPosts, setFollowedFeedPosts] = useState<ProfilePost[]>([]);
  const [circleFeedPosts, setCircleFeedPosts] = useState<ProfilePost[]>([]);
  const [circleSpectatorItems, setCircleSpectatorItems] = useState<DiscoveryFeedItem[]>([]);
  const [rachiOfficialPosts, setRachiOfficialPosts] = useState<ProfilePost[]>([]);
  const [rachiOriginals, setRachiOriginals] = useState<CreatorVideo[]>([]);
  const [rachiOfficialAvatarUrl, setRachiOfficialAvatarUrl] = useState("");
  const [homeDiscoveryItems, setHomeDiscoveryItems] = useState<DiscoveryFeedItem[]>([]);
  const [homeDiscoverySignals, setHomeDiscoverySignals] = useState<DiscoveryFeedRankingSignals>({});
  const [circleSpectatorSignals, setCircleSpectatorSignals] = useState<DiscoveryFeedRankingSignals>({});
  const [homeDiscoveryLoading, setHomeDiscoveryLoading] = useState(true);
  const [homeDiscoveryError, setHomeDiscoveryError] = useState<string | null>(null);
  const homeConfig = resolveHomeConfig(appConfig);
  const featureConfig = resolveFeatureConfig(appConfig);
  const canShowContinueWatching = featureConfig.continueWatchingEnabled && homeConfig.enabledRails.continue_watching;

  async function fetchHomeConfig() {
    const nextConfig = await readAppConfig().catch(() => DEFAULT_APP_CONFIG);
    setAppConfig(nextConfig);
  }

  async function fetchTitles() {
    setError(null);

    const { data, error } = await supabase
      .from("titles")
      .select(
        "id, title, category, year, runtime, synopsis, poster_url, content_access_rule, created_at, featured, is_hero, is_trending, is_published, pin_to_top_row, sort_order, status",
      )
      .order("created_at", { ascending: false })
      .returns<TitleRow[]>();

    if (error) {
      setTitles([]);
      setError("Unable to refresh Home right now. Check your connection and try again.");
      return;
    }

    const nextTitles = data ?? [];
    setTitles(nextTitles);
  }

  async function fetchHomeActiveTitleRoomCount() {
    try {
      const { data, error } = await supabase
        .from("watch_party_rooms")
        .select("party_id,title_id,is_active,last_activity_at,updated_at")
        .eq("is_active", true)
        .eq("room_type", "title")
        .returns<HomeActiveTitleRoomRow[]>();

      if (error || !data) {
        setHomeActiveTitleRoomCount(0);
        return;
      }

      const activeTitleRooms = data.filter((row) => {
        if (row.is_active !== true) return false;
        if (!String(row.title_id ?? "").trim()) return false;
        const activitySource = String(row.last_activity_at ?? row.updated_at ?? "").trim();
        if (!activitySource) return false;
        const activityAt = Date.parse(activitySource);
        if (!Number.isFinite(activityAt)) return false;
        return Date.now() - activityAt <= ROOM_ACTIVITY_ACTIVE_WINDOW_MS;
      });

      setHomeActiveTitleRoomCount(activeTitleRooms.length);
    } catch {
      setHomeActiveTitleRoomCount(0);
    }
  }

  async function fetchWatchProgress() {
    const nextProgress = await readMergedWatchProgress().catch(() => ({} as WatchProgressMap));
    setWatchProgress(nextProgress);
  }

  async function fetchCurrentChannelProfile() {
    const [cachedProfile, userId] = await Promise.all([
      readCachedUserProfile().catch(() => null),
      getWritablePartyUserId().catch(() => null),
    ]);

    const signedInUserId = String(userId ?? "").trim();
    if (!signedInUserId) {
      setCurrentChannel(null);
      setMainTabHeaderProfileSnapshot(null);
      return;
    }

    if (cachedProfile?.username) {
      const cachedChannel = buildUserChannelProfile({
        id: signedInUserId,
        profile: cachedProfile,
        fallbackDisplayName: "You",
        isLive: false,
      });

      setCurrentChannel((existingChannel) => {
        if (!cachedChannel.avatarUrl && existingChannel?.id === signedInUserId && existingChannel.avatarUrl) {
          return existingChannel;
        }
        return cachedChannel;
      });
      setMainTabHeaderProfileSnapshot(cachedChannel, !!cachedChannel.avatarUrl);
    }

    const profile = await readUserProfile().catch(() => cachedProfile);
    const nextChannel = buildUserChannelProfile({
      id: signedInUserId,
      profile,
      fallbackDisplayName: "You",
      isLive: false,
    });

    setCurrentChannel(nextChannel);
    setMainTabHeaderProfileSnapshot(nextChannel);
  }

  async function fetchDiscoveryFeedV1() {
    setHomeDiscoveryLoading(true);
    setHomeDiscoveryError(null);

    try {
      const [publicEvents, rankedDiscovery, rankedCircleSpectator, officialPosts, officialOriginals, officialProfile] = await Promise.all([
        readLatestPublicEventSummaries({ limit: 24 }),
        readRankedPublicDiscoveryFeedItems({ surface: "home", limit: 24 }).catch(() => ({
          items: [] as DiscoveryFeedItem[],
          signals: {} as DiscoveryFeedRankingSignals,
          generatedAt: new Date().toISOString(),
          viewerSpecific: false,
        })),
        readRankedCircleSpectatorFeedItems({ limit: 16 }).catch(() => ({
          items: [] as DiscoveryFeedItem[],
          signals: {} as DiscoveryFeedRankingSignals,
          generatedAt: new Date().toISOString(),
          viewerSpecific: true as const,
        })),
        readProfilePosts(RACHI_OFFICIAL_ACCOUNT.userId, { includeDrafts: false, limit: 3 }).catch(() => [] as ProfilePost[]),
        readCreatorVideos(RACHI_OFFICIAL_ACCOUNT.userId, { includeDrafts: false, limit: 12 }).catch(() => [] as CreatorVideo[]),
        readUserProfileByUserId(RACHI_OFFICIAL_ACCOUNT.userId).catch(() => null),
      ]);
      const [followedFeed, circleFeed] = await Promise.all([
        readCreatorRelationshipFeedVideos("followers", { limit: 12 }).catch(() => null),
        readCreatorRelationshipFeedVideos("circle", { limit: 12 }).catch(() => null),
      ]);

      setHomeLiveEvents(publicEvents.filter((event) => event.isLiveNow).slice(0, 8));
      setHomeUpcomingEvents(publicEvents.filter((event) => event.isUpcoming).slice(0, 8));
      setRachiOfficialPosts(officialPosts);
      setRachiOriginals(officialOriginals);
      setRachiOfficialAvatarUrl(String(officialProfile?.avatarUrl ?? RACHI_OFFICIAL_ACCOUNT.avatarUrl ?? "").trim());
      setFollowedFeedVideos(followedFeed?.videos ?? []);
      setCircleFeedVideos(circleFeed?.videos ?? []);
      setFollowedFeedPosts(followedFeed?.profilePosts ?? []);
      setCircleFeedPosts(circleFeed?.profilePosts ?? []);
      setCircleSpectatorItems(rankedCircleSpectator.items);
      setHomeDiscoverySignals(rankedDiscovery.signals);
      setCircleSpectatorSignals(rankedCircleSpectator.signals);
      setHomeDiscoveryItems(rankDiscoveryFeedItems(rankedDiscovery.items, rankedDiscovery.signals));
    } catch {
      setHomeLiveEvents([]);
      setHomeUpcomingEvents([]);
      setRachiOfficialPosts([]);
      setRachiOriginals([]);
      setRachiOfficialAvatarUrl("");
      setFollowedFeedVideos([]);
      setCircleFeedVideos([]);
      setFollowedFeedPosts([]);
      setCircleFeedPosts([]);
      setCircleSpectatorItems([]);
      setHomeDiscoveryItems([]);
      setHomeDiscoverySignals({});
      setCircleSpectatorSignals({});
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
        fetchCurrentChannelProfile(),
        fetchWatchProgress(),
        fetchHomeActiveTitleRoomCount(),
        fetchDiscoveryFeedV1(),
      ]);
      setLoading(false);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        fetchHomeConfig(),
        fetchCurrentChannelProfile(),
        fetchWatchProgress(),
        fetchHomeActiveTitleRoomCount(),
        fetchDiscoveryFeedV1(),
      ]).catch(() => {});
    }, []),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      fetchHomeConfig(),
      fetchTitles(),
      fetchCurrentChannelProfile(),
      fetchWatchProgress(),
      fetchHomeActiveTitleRoomCount(),
      fetchDiscoveryFeedV1(),
    ]);
    setRefreshing(false);
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

  function openProfile(userId?: string | null) {
    const safeUserId = String(userId ?? "").trim();
    if (!safeUserId) return;
    router.push({
      pathname: "/profile/[userId]",
      params: { userId: safeUserId },
    });
  }

  function openRachiProfile() {
    router.push({
      pathname: "/profile/[userId]",
      params: { userId: RACHI_OFFICIAL_ACCOUNT.userId },
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
    if ((item.item_type === "channel_update" || item.item_type === "creator_event") && channelUserId) {
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
        if (!isAvailableContinueWatchingTitle(item)) return false;
        const progressEntry = watchProgress[String(item.id)];
        return isEligibleContinueWatchingProgress(progressEntry);
      })
      .sort((a, b) => {
        const aLastWatchedAt = getContinueLastWatchedAt(watchProgress[String(a.id)]);
        const bLastWatchedAt = getContinueLastWatchedAt(watchProgress[String(b.id)]);
        return bLastWatchedAt - aLastWatchedAt;
      });
  }, [titles, watchProgress]);

  const continueWatchingHeroItem = canShowContinueWatching ? continueCandidates[0] ?? null : null;

  const homeAvatarInitial = String(currentChannel?.displayName ?? "You").slice(0, 1).toUpperCase() || "Y";
  const liveDiscoveryItems = useMemo(
    () => homeDiscoveryItems.filter((item) => item.live_state === "live").slice(0, 8),
    [homeDiscoveryItems],
  );
  const upcomingDiscoveryItems = useMemo(
    () => homeDiscoveryItems.filter((item) => item.live_state === "scheduled").slice(0, 8),
    [homeDiscoveryItems],
  );
  const circleLiveSpectatorItems = useMemo(
    () => circleSpectatorItems.filter((item) => item.live_state === "live").slice(0, 8),
    [circleSpectatorItems],
  );
  const circleWatchPartySpectatorItems = useMemo(
    () => circleSpectatorItems.filter((item) => item.live_state !== "live").slice(0, 8),
    [circleSpectatorItems],
  );

  function renderHomeHero() {
    const heroItem = continueWatchingHeroItem;
    const progress = heroItem ? watchProgress[String(heroItem.id)] : undefined;
    const progressPercent = heroItem ? getContinueWatchingProgressPercent(progress) : 0;
    const heroImageSource = (heroItem ? getImageUri(heroItem) : null) ?? CHILLYWOOD_BACKGROUND_SOURCE;

    const heroContent = (
      <ImageBackground
        source={heroImageSource}
        resizeMode="cover"
        imageStyle={styles.homeHeroImage}
        style={styles.homeHeroCard}
      >
        <View style={styles.homeHeroScrim}>
          {heroItem ? (
            <View testID="home-continue-watching-hero" style={styles.homeHeroContent}>
              <Text style={styles.homeHeroKicker}>CONTINUE WATCHING</Text>
              <Text style={styles.homeHeroTitle} numberOfLines={2}>{heroItem.title}</Text>
              <Text style={styles.homeHeroMeta} numberOfLines={1}>{buildDiscoveryInfoLine(heroItem)}</Text>
              <View style={styles.homeHeroProgressTrack}>
                <View style={[styles.homeHeroProgressFill, { width: `${progressPercent}%` }]} />
              </View>
              <View style={styles.homeHeroFooter}>
                <Text style={styles.homeHeroProgressText}>{formatContinueWatchingLabel(progress)}</Text>
                <View style={styles.homeHeroButton}>
                  <Text style={styles.homeHeroButtonText}>Resume</Text>
                </View>
              </View>
            </View>
          ) : (
            <View testID="home-branded-hero" style={styles.homeHeroContent}>
              <Text style={styles.homeHeroKicker}>Chi’llywood</Text>
              <Text style={styles.homeHeroTitle} numberOfLines={2}>Stream the city</Text>
              <Text style={styles.homeHeroMeta} numberOfLines={2}>
                Official updates, Originals, and live moments appear here when they are ready.
              </Text>
            </View>
          )}
        </View>
      </ImageBackground>
    );

    if (!heroItem) {
      return <View style={styles.homeHeroWrap}>{heroContent}</View>;
    }

    return (
      <TouchableOpacity
        testID="home-continue-watching-hero-action"
        style={styles.homeHeroWrap}
        activeOpacity={0.9}
        onPress={() => openPlayer(heroItem)}
        accessibilityRole="button"
        accessibilityLabel={`Resume ${heroItem.title}`}
      >
        {heroContent}
      </TouchableOpacity>
    );
  }

  function renderFeedItemCard(item: DiscoveryFeedItem) {
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

  function renderEventCard(event: CreatorEventSummary) {
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
      <AppSection
        statusLabel={homeDiscoveryLoading ? "Loading" : hasRows ? "Ready" : "Empty"}
        statusTone={homeDiscoveryLoading ? "muted" : hasRows ? "success" : "muted"}
        subtitle={input.subtitle}
        title={input.title}
      >

        {homeDiscoveryError ? (
          <AppEmptyState title="Discovery unavailable" body={homeDiscoveryError} />
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
          <AppEmptyState title={input.emptyTitle} body={input.emptyText} />
        )}
      </AppSection>
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
    loadingTitle?: string;
    loadingText?: string;
  }) {
    return (
      <AppSection
        statusLabel={input.loading ? "Loading" : input.videos.length ? "Ready" : "Empty"}
        statusTone={input.loading ? "muted" : input.videos.length ? "success" : "muted"}
        subtitle={input.subtitle}
        title={input.title}
      >

        {input.loading ? (
          <AppEmptyState
            title={input.loadingTitle ?? "Checking creator posts"}
            body={input.loadingText ?? "Only backed relationship feed items appear here."}
          />
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
          <AppEmptyState title={input.emptyTitle} body={input.emptyText} />
        )}
      </AppSection>
    );
  }

  function renderRelationshipPostCard(post: ProfilePost, keyPrefix: string) {
    const body = post.body.trim() || "Profile update";
    return (
      <TouchableOpacity
        key={`${keyPrefix}-post-${post.id}`}
        style={styles.feedEventCard}
        activeOpacity={0.88}
        onPress={() => openProfile(post.userId)}
        accessibilityRole="button"
        accessibilityLabel="Open Profile post"
      >
        <View style={styles.feedEventBadgeRow}>
          <AppText scale="caption" style={styles.feedEventBadge}>Profile Post</AppText>
          <AppText scale="caption" style={styles.feedEventBadge}>Posted</AppText>
        </View>
        <AppText scale="subhead" style={styles.feedEventTitle} numberOfLines={2}>
          Profile update
        </AppText>
        <AppText scale="footnote" style={styles.feedEventCopy} numberOfLines={3}>
          {body}
        </AppText>
        <AppText scale="caption" style={styles.feedEventMeta} numberOfLines={1}>
          {formatFeedDate(post.createdAt)}
        </AppText>
      </TouchableOpacity>
    );
  }

  function renderRelationshipFeedRail(input: {
    title: string;
    subtitle: string;
    videos: CreatorVideo[];
    posts: ProfilePost[];
    loading?: boolean;
    loadingTitle: string;
    loadingText: string;
    emptyTitle: string;
    emptyText: string;
    keyPrefix: string;
  }) {
    const hasRows = input.videos.length > 0 || input.posts.length > 0;
    return (
      <AppSection
        statusLabel={input.loading ? "Loading" : hasRows ? "Ready" : "Empty"}
        statusTone={input.loading ? "muted" : hasRows ? "success" : "muted"}
        subtitle={input.subtitle}
        title={input.title}
      >
        {input.loading ? (
          <AppEmptyState title={input.loadingTitle} body={input.loadingText} />
        ) : hasRows ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.feedActivityRow}
          >
            {input.posts.map((post) => renderRelationshipPostCard(post, input.keyPrefix))}
            {input.videos.map((video) => (
              <View key={`${input.keyPrefix}-video-${video.id}`} style={styles.followingVideoCardWrap}>
                <CreatorVideoCard
                  video={video}
                  mode="public"
                  onOpen={() => openCreatorVideo(video)}
                  onShare={isCreatorVideoPubliclyShareable(video) ? () => {
                    void shareCreatorVideo(video);
                  } : undefined}
                />
              </View>
            ))}
          </ScrollView>
        ) : (
          <AppEmptyState title={input.emptyTitle} body={input.emptyText} />
        )}
      </AppSection>
    );
  }

  function renderRachiOfficialUpdates() {
    return (
      <AppSection
        statusLabel={homeDiscoveryLoading ? "Loading" : rachiOfficialPosts.length ? "Official" : "Empty"}
        statusTone={rachiOfficialPosts.length ? "premium" : "muted"}
        subtitle="Rachi shares official Chi'llywood tips, announcements, and Originals notes."
        title="Rachi Official Updates"
      >

        {homeDiscoveryLoading ? (
          <AppEmptyState title="Checking Rachi updates" body="Public Rachi posts appear here after they are published." />
        ) : rachiOfficialPosts.length ? (
          <View style={styles.rachiUpdateStack}>
            {rachiOfficialPosts.map((post) => (
              <TouchableOpacity
                key={`rachi-post-${post.id}`}
                style={styles.rachiUpdateCard}
                activeOpacity={0.86}
                onPress={openRachiProfile}
                accessibilityRole="button"
                accessibilityLabel="Open Rachi official Profile"
              >
                <View style={styles.rachiIdentityRow}>
                  <View style={styles.rachiAvatar}>
                    {rachiOfficialAvatarUrl ? (
                      <StableImage
                        expectedWidth="100%"
                        expectedHeight="100%"
                        source={{ uri: rachiOfficialAvatarUrl }}
                        borderRadius={21}
                        resizeMode="cover"
                      />
                    ) : (
                      <AppText scale="title3" style={styles.rachiAvatarInitial}>R</AppText>
                    )}
                  </View>
                  <View style={styles.rachiIdentityCopy}>
                    <View style={styles.rachiNameRow}>
                      <AppText scale="subhead" style={styles.rachiName}>Rachi</AppText>
                      <View style={styles.rachiOfficialBadge}>
                        <AppText scale="caption" style={styles.rachiOfficialBadgeText}>Official Chi’llywood</AppText>
                      </View>
                    </View>
                    <AppText scale="caption" style={styles.rachiUpdateMeta}>{formatAddedDate(post.createdAt).replace("Added", "Posted")}</AppText>
                  </View>
                </View>
                <AppText scale="body" style={styles.rachiUpdateBody} numberOfLines={4}>{post.body}</AppText>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <AppEmptyState title="No Rachi updates yet" body="Official posts will appear here when Rachi publishes them." />
        )}
      </AppSection>
    );
  }

  return (
    <ImageBackground
      source={CHILLYWOOD_BACKGROUND_SOURCE}
      style={styles.screenBackground}
      resizeMode="cover"
    >
    <View style={styles.container} testID="auth-logged-in-home">
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#E50914" />
          <AppText scale="body" style={styles.muted}>Loading Home…</AppText>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <AppText scale="title3" style={styles.errorTitle}>Home couldn’t refresh</AppText>
          <AppText scale="body" style={styles.errorMsg}>{error}</AppText>

          <Pressable style={styles.retryBtn} onPress={onRefresh}>
            <AppText scale="body" style={styles.retryText}>Retry</AppText>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.utilityRow, { marginTop: Math.max(safeAreaInsets.top, 8) }]}>
            <View style={styles.utilityLabelGroup}>
              <TouchableOpacity
                testID="main-tab-home-settings-action"
                style={styles.utilitySettingsButton}
                onPress={openSettings}
                activeOpacity={0.86}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Settings"
              >
                <MaterialIcons name="settings" size={18} color="#F4F7FC" />
              </TouchableOpacity>
              <Text style={styles.utilityKicker}>HOME</Text>
            </View>
            <View style={styles.utilityActions}>
              <NotificationBellButton surface="main-tab-home" />
              <TouchableOpacity
                testID="main-tab-home-profile-entry"
                style={[styles.profileAvatarButton, !currentChannel?.id && styles.profileAvatarButtonDisabled]}
                onPress={openOwnProfile}
                activeOpacity={0.86}
                disabled={!currentChannel?.id}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Open your Profile"
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

          <View
            testID="home-brand-reveal"
            style={[styles.brandRevealSpacer, { height: brandRevealHeight }]}
          />

          {renderHomeEventRail({
            title: "Live Now",
            subtitle: "Public rooms and events that are live now.",
            feedItems: liveDiscoveryItems,
            events: homeLiveEvents,
            emptyTitle: "No public live rooms right now",
            emptyText: "Live rooms appear here when public rooms or events are live.",
          })}

          {renderRachiOfficialUpdates()}

          {renderCreatorVideoRail({
            title: "Chi'llywood Originals",
            subtitle: "Published Originals from Rachi's official Platform.",
            videos: rachiOriginals,
            loading: homeDiscoveryLoading,
            emptyTitle: "No Chi'llywood Originals yet",
            emptyText: "Rachi Originals appear here after official content is published.",
            keyPrefix: "rachi-original",
          })}

          {renderRelationshipFeedRail({
            title: "From Creators You Follow",
            subtitle: "Posted Profile updates and public creator videos from Platforms you follow.",
            videos: followedFeedVideos,
            posts: followedFeedPosts,
            loading: homeDiscoveryLoading,
            loadingTitle: "Checking follower feed",
            loadingText: "Only backed posted updates and public creator content from Platforms you follow appear here.",
            emptyTitle: "No follower feed posts yet",
            emptyText: "Posted Profile updates and public creator content appear here after followed creators publish.",
            keyPrefix: "followed-feed-video",
          })}

          {renderRelationshipFeedRail({
            title: "From Your Chi'lly Circle",
            subtitle: "Posted Profile updates and creator videos available through approved Circle relationships.",
            videos: circleFeedVideos,
            posts: circleFeedPosts,
            loading: homeDiscoveryLoading,
            loadingTitle: "Checking Chi'lly Circle feed",
            loadingText: "Only backed posted updates, public creator videos, or Circle-private videos allowed by your Circle relationship appear here.",
            emptyTitle: "No Circle feed posts yet",
            emptyText: "Circle feed posts appear here only when approved Chi'lly Circle and profile/video access rules allow them.",
            keyPrefix: "circle-feed-video",
          })}

          {renderHomeEventRail({
            title: "Circle Live Now",
            subtitle: "Private spectator lives available through your approved Chi'lly Circle relationships.",
            feedItems: circleLiveSpectatorItems,
            events: [],
            emptyTitle: "No Circle lives right now",
            emptyText: "Circle-private spectator lives appear here only when your approved Chi'lly Circle access allows them.",
          })}

          {renderHomeEventRail({
            title: "Circle Watch-Party Ready",
            subtitle: "Watch-only spectator sources available to your Chi'lly Circle.",
            feedItems: circleWatchPartySpectatorItems,
            events: [],
            emptyTitle: "No Circle watch-party sources yet",
            emptyText: "Circle-private spectator sources appear here only when backed access and playback rules allow them.",
          })}

          {renderHomeEventRail({
            title: "Upcoming Events",
            subtitle: "Public creator events scheduled for later.",
            feedItems: upcomingDiscoveryItems,
            events: homeUpcomingEvents,
            emptyTitle: "No upcoming public events yet",
            emptyText: "Scheduled public creator events will appear here when available.",
          })}

          <NativeAdSlot
            surface="home"
            routePath="/"
            forbiddenContexts={HOME_NATIVE_AD_FORBIDDEN_CONTEXTS}
          />
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
  brandRevealSpacer: {
    backgroundColor: "transparent",
  },
  utilityKicker: {
    color: "#8D98AE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0,
  },
  utilityLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  utilityActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  utilitySettingsButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(12,12,16,0.68)",
    alignItems: "center",
    justifyContent: "center",
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
  homeHeroWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 22,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(8,10,16,0.72)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  homeHeroCard: {
    minHeight: 410,
    justifyContent: "flex-end",
  },
  homeHeroImage: {
    borderRadius: 24,
  },
  homeHeroScrim: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 22,
    paddingVertical: 24,
    backgroundColor: "rgba(3,5,10,0.44)",
  },
  homeHeroContent: {
    gap: 9,
    maxWidth: 680,
  },
  homeHeroKicker: {
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(229,9,20,0.84)",
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  homeHeroTitle: {
    color: "#FFFFFF",
    fontSize: 37,
    lineHeight: 43,
    fontWeight: "900",
  },
  homeHeroMeta: {
    color: "#D8E0EF",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
  },
  homeHeroProgressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.18)",
    marginTop: 8,
  },
  homeHeroProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#E50914",
  },
  homeHeroFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 5,
  },
  homeHeroProgressText: {
    color: "#F3F7FF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  homeHeroButton: {
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: "#E50914",
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  homeHeroButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
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
    width: 150,
    marginRight: 8,
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
  rachiUpdateStack: {
    gap: 10,
  },
  rachiUpdateCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(18,12,18,0.82)",
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 10,
  },
  rachiIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  rachiAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(220,20,60,0.28)",
  },
  rachiAvatarImage: {
    width: "100%",
    height: "100%",
  },
  rachiAvatarInitial: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  rachiIdentityCopy: {
    flex: 1,
    gap: 4,
  },
  rachiNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  rachiName: {
    color: "#FFF6F8",
    fontSize: 15,
    fontWeight: "900",
  },
  rachiOfficialBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  rachiOfficialBadgeText: {
    color: "#F9FBFF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  rachiUpdateBody: {
    color: "#F6F8FF",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  rachiUpdateMeta: {
    color: "#9EA8BA",
    fontSize: 11.5,
    fontWeight: "800",
  },
  feedActivityRow: {
    paddingRight: 10,
    gap: 12,
  },
  feedActivityCard: {
    width: 150,
    borderRadius: 14,
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
    aspectRatio: 9 / 16,
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
  feedCompactBadgeRow: {
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
  feedActivityCopy: {
    paddingHorizontal: 9,
    paddingVertical: 9,
    gap: 4,
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
    width: 150,
    aspectRatio: 9 / 16,
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
