import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  type ImageSourcePropType,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { CHILLYWOOD_VISUAL, ChillywoodPrimaryActionFill } from "../../components/ui/chillywood-visual-system";

import { titles as localTitles } from "../../_data/titles";
import { readFollowedChannelUserIds } from "../../_lib/channelAudience";
import { isCurrentAuthorityRequest, resolveMainTabBrandRevealHeight } from "../../_lib/customerExperiencePresentation";
import {
  readMyUnlockedPaidVideoLibraryItems,
  type UnlockedPaidVideoLibraryItem,
} from "../../_lib/creatorPaidVideos";
import {
  formatCreatorReplaySourceLabel,
  formatCreatorReplayStatusLabel,
  readCreatorReplayLibraryItems,
  type CreatorReplayLibraryItem,
} from "../../_lib/creatorReplays";
import { supabase } from "../../_lib/supabase";
import { useSession } from "../../_lib/session";
import { filterPubliclyReleasedTitles } from "../../_lib/publicTitles";
import {
  buildUserChannelProfile,
  readWatchProgressState,
  readMyListState,
  setMyListTitleSaved,
  readUserProfileByUserId,
  type UserChannelProfile,
  type WatchProgressEntry,
} from "../../_lib/userData";
import { MainTabTopBar } from "../../components/navigation/main-tab-top-bar";
import { ProfileMediaImage as Image } from "../../components/ui/ProfileMediaImage";
import type { Tables } from "../../supabase/database.types";

type TitleRow = Pick<
  Tables<"titles">,
  | "id"
  | "title"
  | "category"
  | "year"
  | "runtime"
  | "synopsis"
  | "poster_url"
  | "is_published"
  | "status"
  | "release_at"
  | "release_date"
>;

type ContinueWatchingTitle = TitleRow & { progress: WatchProgressEntry };

const CHILLYWOOD_BACKGROUND_SOURCE = require("../../assets/images/chillywood-branded-background.png");
const isHttpUrl = (value?: string | null) => /^https?:\/\//i.test(String(value ?? "").trim());
const remoteImageSource = (value?: string | null): ImageSourcePropType | null => (
  isHttpUrl(value) ? { uri: String(value).trim() } : null
);
const toTitleIds = (ids: string[]) => Array.from(new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean)));

async function readTitlesByIds(ids: string[]): Promise<TitleRow[]> {
  const normalizedIds = toTitleIds(ids);
  if (!normalizedIds.length) return [];

  try {
    const { data, error } = await supabase
      .from("titles")
      .select("id,title,category,year,runtime,synopsis,poster_url,is_published,status,release_at,release_date")
      .in("id", normalizedIds)
      .eq("is_published", true)
      .eq("status", "published")
      .returns<TitleRow[]>();
    if (!error && data) {
      const byId = new Map(filterPubliclyReleasedTitles(data).map((item) => [String(item.id), item]));
      return normalizedIds.map((id) => byId.get(id)).filter((item): item is TitleRow => !!item);
    }
  } catch {
    // Preserve only rows already present on-device when the backed title read is unavailable.
  }

  const fallback = normalizedIds
    .map((id): TitleRow | null => {
      const localMatch = localTitles.find((item: any) => String(item.id) === String(id));
      if (!localMatch) return null;
      return {
        id: String((localMatch as any).id),
        title: String((localMatch as any).title ?? "Untitled"),
        category: (localMatch as any).genre ?? null,
        year: (localMatch as any).year ? Number((localMatch as any).year) : null,
        runtime: (localMatch as any).runtime ?? null,
        synopsis: (localMatch as any).description ?? null,
        poster_url: null,
        is_published: true,
        status: "published",
        release_at: null,
        release_date: null,
      };
    })
    .filter((item): item is TitleRow => !!item);
  if (fallback.length !== normalizedIds.length) throw new Error("Title details unavailable");
  return fallback;
}

const formatProgressLabel = (entry: WatchProgressEntry) => {
  const position = Number(entry.positionMillis ?? 0);
  const duration = Number(entry.durationMillis ?? 0);
  if (Number.isFinite(position) && Number.isFinite(duration) && position > 0 && duration > 0) {
    return `${Math.max(1, Math.min(99, Math.round((position / duration) * 100)))}% watched`;
  }
  return "In progress";
};

export default function MyListScreen() {
  const bottomTabBarHeight = useBottomTabBarHeight();
  const { height: viewportHeight } = useWindowDimensions();
  const brandRevealHeight = resolveMainTabBrandRevealHeight(viewportHeight);
  const { isLoading: sessionLoading, user, authority } = useSession();
  const viewerUserId = String(user?.id ?? "").trim();
  const viewerAuthorityKey = `${viewerUserId}:${authority?.sessionGeneration ?? ""}`;
  const hasLoadedRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const currentViewerUserIdRef = useRef(viewerAuthorityKey);
  currentViewerUserIdRef.current = viewerAuthorityKey;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedTitles, setSavedTitles] = useState<TitleRow[]>([]);
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingTitle[]>([]);
  const [followedPlatforms, setFollowedPlatforms] = useState<UserChannelProfile[]>([]);
  const [savedReplays, setSavedReplays] = useState<CreatorReplayLibraryItem[]>([]);
  const [unlockedVideos, setUnlockedVideos] = useState<UnlockedPaidVideoLibraryItem[]>([]);
  const [librarySubjectUserId, setLibrarySubjectUserId] = useState("__unresolved__");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const removingIdsRef = useRef(new Set<string>());
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [hasUnknownSync, setHasUnknownSync] = useState(false);
  const [hasSyncConflict, setHasSyncConflict] = useState(false);
  const [syncRetryBusy, setSyncRetryBusy] = useState(false);
  const syncRetryOwnerRef = useRef({ key: viewerAuthorityKey, busy: false });
  if (syncRetryOwnerRef.current.key !== viewerAuthorityKey) syncRetryOwnerRef.current = { key: viewerAuthorityKey, busy: false };
  const syncRetryOwner = syncRetryOwnerRef.current;

  const libraryIdentityPending = librarySubjectUserId !== viewerAuthorityKey;
  const visibleSavedTitles = libraryIdentityPending ? [] : savedTitles;
  const visibleContinueWatching = libraryIdentityPending ? [] : continueWatching;
  const visibleFollowedPlatforms = libraryIdentityPending ? [] : followedPlatforms;
  const visibleSavedReplays = libraryIdentityPending ? [] : savedReplays;
  const visibleUnlockedVideos = libraryIdentityPending ? [] : unlockedVideos;
  const savedTitleCount = visibleSavedTitles.length;
  const continueWatchingCount = visibleContinueWatching.length;
  const followedPlatformCount = visibleFollowedPlatforms.length;
  const savedReplayCount = visibleSavedReplays.length;
  const unlockedVideoCount = visibleUnlockedVideos.length;
  const hasLibraryRows = savedTitleCount + continueWatchingCount + followedPlatformCount + savedReplayCount + unlockedVideoCount > 0;

  const getImageSource = useCallback((item?: TitleRow | null): ImageSourcePropType | null => {
    if (!item) return null;
    const localMatch = localTitles.find(
      (entry: any) => String(entry.id) === String(item.id)
        || String(entry.title ?? "").trim().toLowerCase() === String(item.title ?? "").trim().toLowerCase(),
    );
    return (localMatch as any)?.image || localMatch?.poster || remoteImageSource(item.poster_url);
  }, []);

  const loadLibrary = useCallback(async (retryUnknown = false, useAccountVersion = false) => {
    const requestedViewerUserId = viewerUserId;
    const generation = ++loadGenerationRef.current;
    setErrorMsg(null);
    try {
      const [{ data: authData }, savedState, progressState, followedIds, unlockedResult] = await Promise.all([
        supabase.auth.getUser(),
        readMyListState(useAccountVersion ? { useAccountVersion: true } : retryUnknown ? { retryUnknown: true } : undefined).catch(() => null),
        readWatchProgressState(useAccountVersion ? { useAccountVersion: true } : retryUnknown ? { retryUnknown: true } : undefined).catch(() => null),
        readFollowedChannelUserIds({ limit: 24 }).catch(() => null),
        readMyUnlockedPaidVideoLibraryItems(24).catch(() => ({ status: "unavailable" as const, subjectUserId: null, items: [] })),
      ]);
      const userId = String(authData.user?.id ?? "").trim();
      const savedIds = savedState?.ids ?? null;
      const progressMap = progressState?.progress ?? null;
      if (!isCurrentAuthorityRequest({
        generation,
        currentGeneration: loadGenerationRef.current,
        requestedAuthorityKey: viewerAuthorityKey,
        currentAuthorityKey: currentViewerUserIdRef.current,
      })
        || userId !== requestedViewerUserId
        || (unlockedResult.status === "resolved" && String(unlockedResult.subjectUserId ?? "").trim() !== requestedViewerUserId)
      ) {
        return false;
      }
      const progressEntries = Object.entries(progressMap ?? {})
        .filter(([, entry]) => Number(entry?.positionMillis ?? 0) > 0)
        .sort(([, left], [, right]) => Number(right?.updatedAt ?? 0) - Number(left?.updatedAt ?? 0))
        .slice(0, 12);
      const progressIds = progressEntries.map(([id]) => id);
      const progressById = new Map(progressEntries);

      const [nextSavedTitles, nextContinueTitles, nextPlatformProfiles, nextReplays] = await Promise.all([
        savedIds && (savedState?.readStatus !== "offline" || savedIds.length > 0) ? readTitlesByIds(savedIds).catch(() => null) : null,
        progressMap && (progressState?.readStatus !== "offline" || progressIds.length > 0) ? readTitlesByIds(progressIds).catch(() => null) : null,
        followedIds ? Promise.all(followedIds.map(async (platformUserId) => {
          const profile = await readUserProfileByUserId(platformUserId);
          if (!profile) throw new Error("Platform profile unavailable");
          return buildUserChannelProfile({ id: platformUserId, profile });
        })).catch(() => null) : null,
        userId ? readCreatorReplayLibraryItems(userId).catch(() => null) : Promise.resolve([]),
      ]);
      if (!isCurrentAuthorityRequest({
        generation,
        currentGeneration: loadGenerationRef.current,
        requestedAuthorityKey: viewerAuthorityKey,
        currentAuthorityKey: currentViewerUserIdRef.current,
      })) {
        return false;
      }

      if (nextSavedTitles) setSavedTitles(nextSavedTitles);
      if (nextContinueTitles) setContinueWatching(nextContinueTitles
        .map((title): ContinueWatchingTitle | null => {
          const progress = progressById.get(String(title.id));
          return progress ? { ...title, progress } : null;
        })
        .filter((item): item is ContinueWatchingTitle => !!item));
      if (nextPlatformProfiles) setFollowedPlatforms(nextPlatformProfiles);
      if (nextReplays) setSavedReplays(nextReplays);
      if (unlockedResult.status === "resolved") {
        setUnlockedVideos(unlockedResult.items);
      }
      setLibrarySubjectUserId(viewerAuthorityKey);
      setHasUnknownSync(previous => savedState?.syncStatus === "unknown" || progressState?.syncStatus === "unknown"
        || (!(savedState && progressState) && previous));
      setHasSyncConflict(previous => savedState?.syncStatus === "conflict" || progressState?.syncStatus === "conflict"
        || (!(savedState && progressState) && previous));

      setErrorMsg(unlockedResult.status === "unavailable"
        ? "Unlocked content could not be verified. Your current Library is preserved; try again before purchasing anything again."
        : savedState?.syncStatus === "conflict" || progressState?.syncStatus === "conflict"
          ? "Library changed on another device. Your local changes have not overwritten it. Use the account version before making a new choice."
        : savedState?.syncStatus === "unknown" || progressState?.syncStatus === "unknown"
          ? "Showing this device’s Library. An account update could not be confirmed; check again before retrying."
        : savedState?.readStatus === "offline" || progressState?.readStatus === "offline" || [nextSavedTitles, nextContinueTitles, nextPlatformProfiles, nextReplays].some((section) => section === null)
          ? "Some Library sections could not refresh. Current items remain visible; please retry."
          : savedState?.syncStatus === "pending" || progressState?.syncStatus === "pending" ? "Showing this device’s Library. Account sync is pending." : null);
      return true;
    } catch {
      if (!isCurrentAuthorityRequest({
        generation,
        currentGeneration: loadGenerationRef.current,
        requestedAuthorityKey: viewerAuthorityKey,
        currentAuthorityKey: currentViewerUserIdRef.current,
      })) {
        return false;
      }
      setErrorMsg("Unable to refresh Library right now. Current items remain visible; check your connection and try again.");
      setLibrarySubjectUserId(viewerAuthorityKey);
      return true;
    }
  }, [viewerUserId, viewerAuthorityKey]);

  const bootstrap = useCallback(async () => {
    if (sessionLoading) return;
    if (!hasLoadedRef.current) setLoading(true);
    const loadedCurrentAccount = await loadLibrary();
    if (!loadedCurrentAccount) return;
    hasLoadedRef.current = true;
    setLoading(false);
  }, [loadLibrary, sessionLoading]);

  useEffect(() => {
    loadGenerationRef.current += 1;
    hasLoadedRef.current = false;
    setSavedTitles([]);
    setContinueWatching([]);
    setFollowedPlatforms([]);
    setSavedReplays([]);
    setUnlockedVideos([]);
    setLibrarySubjectUserId("__unresolved__");
    setErrorMsg(null);
    setLoading(true);
    removingIdsRef.current = new Set();
    setRemovingIds([]);
    setHasUnknownSync(false);
    setHasSyncConflict(false);
    setSyncRetryBusy(false);
  }, [viewerAuthorityKey]);

  useEffect(() => () => {
    loadGenerationRef.current += 1;
    removingIdsRef.current = new Set();
    syncRetryOwnerRef.current = { key: "__unmounted__", busy: false };
  }, []);

  useFocusEffect(useCallback(() => {
    void bootstrap();
  }, [bootstrap]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLibrary();
    setRefreshing(false);
  }, [loadLibrary]);

  const retryAccountSync = async (useAccountVersion = false) => {
    if (syncRetryOwnerRef.current !== syncRetryOwner || syncRetryOwner.busy) return;
    syncRetryOwner.busy = true;
    setSyncRetryBusy(true);
    try {
      await loadLibrary(!useAccountVersion, useAccountVersion);
    } finally {
      if (syncRetryOwnerRef.current === syncRetryOwner) {
        syncRetryOwner.busy = false;
        setSyncRetryBusy(false);
      }
    }
  };

  const openTitleDetails = (item: TitleRow) => {
    const id = String(item.id).trim();
    if (id) router.push(`/title/${id}`);
  };
  const removeSavedTitle = async (id: string) => {
    if (removingIdsRef.current.has(id) || currentViewerUserIdRef.current !== viewerAuthorityKey) return;
    const authority = viewerAuthorityKey;
    const removals = removingIdsRef.current;
    removals.add(id);
    setRemovingIds([...removals]);
    // A pre-removal Library read must not resurrect this card.
    loadGenerationRef.current += 1;
    try {
      const result = await setMyListTitleSaved(id, false);
      if (currentViewerUserIdRef.current !== authority || removingIdsRef.current !== removals) return;
      loadGenerationRef.current += 1;
      setSavedTitles((items) => items.filter((item) => result.ids.includes(String(item.id))));
      if (result.syncStatus === "unknown") setHasUnknownSync(true);
      if (result.syncStatus === "conflict") setHasSyncConflict(true);
      setErrorMsg(result.syncStatus === "conflict" ? "Saved changed on another device. Use the account version before making a new choice." : result.syncStatus === "unknown" ? "Removed on this device. The account update could not be confirmed; check again before retrying." : result.syncStatus === "pending" ? "Removed on this device. Account sync is pending." : null);
    } catch {
      if (currentViewerUserIdRef.current === authority && removingIdsRef.current === removals) {
        setErrorMsg("Unable to remove this title from Saved. Please try again.");
      }
    } finally {
      removals.delete(id);
      if (removingIdsRef.current === removals) setRemovingIds([...removals]);
    }
  };
  const openPlayer = (item: TitleRow) => {
    const id = String(item.id).trim();
    if (id) router.push(`/player/${id}`);
  };
  const openPlatform = (platform: UserChannelProfile) => {
    const userId = String(platform.id).trim();
    if (userId) router.push({ pathname: "/channel/[userId]", params: { userId } });
  };
  const openReplay = (replay: CreatorReplayLibraryItem) => {
    const replayId = String(replay.id).trim();
    if (replayId) router.push({ pathname: "/player/replay/[replayId]", params: { replayId } });
  };
  const openUnlockedVideo = (video: UnlockedPaidVideoLibraryItem) => {
    if (video.id) router.push({ pathname: "/player/[id]", params: { id: video.id, source: "creator-video" } });
  };

  const renderSection = (
    title: string,
    meta: string,
    hasRows: boolean,
    emptyTitle: string,
    emptyText: string,
    children: React.ReactNode,
  ) => (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionMeta}>{meta}</Text>
      </View>
      {hasRows ? children : (
        <View style={styles.emptyInline}>
          <Text style={styles.emptyInlineTitle}>{errorMsg ? "Unable to verify this section" : emptyTitle}</Text>
          <Text style={styles.emptyInlineText}>{errorMsg ? "Retry to check your Library." : emptyText}</Text>
        </View>
      )}
    </View>
  );

  const renderTitleRail = <T extends TitleRow,>(items: T[], openItem: (item: T) => void, metaForItem: (item: T) => string, removable = false) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {items.map((item) => {
        const source = getImageSource(item);
        return (
          <View key={item.id} style={styles.titleCard}>
            <TouchableOpacity style={styles.titleOpenContent} activeOpacity={0.9} onPress={() => openItem(item)} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`}>
              <View style={styles.posterWrap}>
                {source ? <Image source={source} style={styles.poster} /> : <Text style={styles.posterInitial}>{String(item.title ?? "U").slice(0, 1).toUpperCase()}</Text>}
              </View>
              <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>{metaForItem(item)}</Text>
            </TouchableOpacity>
            {removable ? (
              <TouchableOpacity
                style={styles.removeSavedButton}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.title} from Saved`}
                disabled={removingIds.includes(String(item.id))}
                onPress={() => { void removeSavedTitle(String(item.id)); }}
              >
                <Text style={styles.meta}>{removingIds.includes(String(item.id)) ? "Removing…" : "Remove from Saved"}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );

  return (
    <ImageBackground source={CHILLYWOOD_BACKGROUND_SOURCE} style={styles.screenBackground} resizeMode="cover">
      <View style={styles.backgroundOverlay} pointerEvents="none" />
      <SafeAreaView style={styles.safe}>
        {loading || libraryIdentityPending ? (
          <View style={styles.center}>
            <ActivityIndicator color="#E50914" />
            <Text style={styles.loadingText}>Loading Library...</Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingBottom: bottomTabBarHeight + 24 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />}
          >
            <MainTabTopBar surface="library" label="SAVED" style={styles.mainTabTopBar} />
            <View
              testID="main-tab-library-brand-reveal"
              style={[styles.brandRevealSpacer, { height: brandRevealHeight }]}
            />
            <View style={styles.headerBlock}>
              <Text style={styles.header}>My Library</Text>
              <Text style={styles.headerBody}>Saved titles, unlocked creator videos, watch progress, followed Platforms, and saved replays live here.</Text>
              <View style={styles.libraryScopeRow}>
                {[
                  [savedTitleCount, "Saved"],
                  [unlockedVideoCount, "Unlocked"],
                  [continueWatchingCount, "Continue"],
                  [followedPlatformCount, "Platforms"],
                  [savedReplayCount, "Replays"],
                ].map(([value, label]) => (
                  <View key={String(label)} style={styles.scopePill}>
                    <Text style={styles.scopePillValue}>{value}</Text>
                    <Text style={styles.scopePillLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {errorMsg ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Library could not fully refresh</Text>
                <Text style={styles.errorText}>{errorMsg}</Text>
                <TouchableOpacity style={styles.emptyButton} activeOpacity={0.86} onPress={onRefresh}><ChillywoodPrimaryActionFill radius={12} /><Text style={styles.emptyButtonText}>Retry</Text></TouchableOpacity>
              </View>
            ) : null}
            {hasUnknownSync ? (
              <TouchableOpacity style={styles.emptyButton} accessibilityRole="button" accessibilityLabel="Retry account sync" disabled={syncRetryBusy} onPress={() => retryAccountSync()}>
                <ChillywoodPrimaryActionFill radius={12} />
                <Text style={styles.emptyButtonText}>{syncRetryBusy ? "Syncing…" : "Retry account sync"}</Text>
              </TouchableOpacity>
            ) : null}

            {hasSyncConflict ? (
              <TouchableOpacity style={styles.emptyButton} accessibilityRole="button" accessibilityLabel="Use account Library version" disabled={syncRetryBusy} onPress={() => retryAccountSync(true)}>
                <ChillywoodPrimaryActionFill radius={12} />
                <Text style={styles.emptyButtonText}>{syncRetryBusy ? "Syncing…" : "Use account Library version"}</Text>
              </TouchableOpacity>
            ) : null}
            {renderSection("Saved", `${savedTitleCount} saved`, savedTitleCount > 0, "No saved titles yet", "Save a title from Home or Explore and it will appear here.", renderTitleRail(visibleSavedTitles, openTitleDetails, (item) => item.runtime || item.category || "Saved", true))}
            {renderSection(
              "Unlocked Creator Videos",
              `${unlockedVideoCount} unlocked`,
              unlockedVideoCount > 0,
              "No unlocked creator videos",
              "Creator videos you purchase appear here while current access remains valid.",
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {visibleUnlockedVideos.map((video) => (
                  <TouchableOpacity
                    key={video.id}
                    style={styles.unlockedCard}
                    activeOpacity={0.88}
                    onPress={() => openUnlockedVideo(video)}
                    accessibilityRole="button"
                    accessibilityLabel={`${video.title}. Unlocked creator video. Open in Chi'llywood Player.`}
                    testID="library-unlocked-video-open-button"
                  >
                    <View style={styles.unlockedThumb}>
                      {remoteImageSource(video.thumbnailUrl)
                        ? <Image source={remoteImageSource(video.thumbnailUrl)!} style={styles.poster} />
                        : <Text style={styles.posterInitial}>{String(video.title || "U").slice(0, 1).toUpperCase()}</Text>}
                    </View>
                    <Text style={styles.itemTitle} numberOfLines={2}>{video.title}</Text>
                    <Text style={styles.unlockedStatus}>Unlocked</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>,
            )}
            {renderSection("Continue Watching", `${continueWatchingCount} in progress`, continueWatchingCount > 0, "No watch progress yet", "Titles appear here after playback writes progress for your account or this device.", renderTitleRail(visibleContinueWatching, openPlayer, (item) => formatProgressLabel(item.progress)))}

            {renderSection(
              "Saved Replays",
              `${savedReplayCount} saved`,
              savedReplayCount > 0,
              "No saved replays yet",
              "Replays you save from Live Stage or Watch-Party Live will appear here.",
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {visibleSavedReplays.map((replay) => (
                  <TouchableOpacity key={replay.id} style={styles.replayCard} activeOpacity={0.88} onPress={() => openReplay(replay)} accessibilityRole="button" accessibilityLabel={`Open replay ${replay.title}`}>
                    <View style={styles.replayThumb}>
                      {remoteImageSource(replay.thumbnailUrl) ? <Image source={remoteImageSource(replay.thumbnailUrl)!} style={styles.poster} /> : <Text style={styles.replayIcon}>▶</Text>}
                    </View>
                    <Text style={styles.itemTitle} numberOfLines={2}>{replay.title}</Text>
                    <Text style={styles.meta}>{formatCreatorReplaySourceLabel(replay.sourceType)}</Text>
                    <Text style={styles.replayStatus}>{formatCreatorReplayStatusLabel(replay.saveStatus)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>,
            )}

            {renderSection(
              "Platforms",
              `${followedPlatformCount} followed`,
              followedPlatformCount > 0,
              "No followed Platforms yet",
              "Follow a public Platform and it will appear here.",
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {visibleFollowedPlatforms.map((platform) => (
                  <TouchableOpacity key={platform.id} style={styles.platformCard} activeOpacity={0.88} onPress={() => openPlatform(platform)} accessibilityRole="button" accessibilityLabel={`Open Platform ${platform.displayName}`}>
                    <View style={styles.platformAvatar}>
                      {platform.avatarUrl ? <Image source={{ uri: platform.avatarUrl }} style={styles.platformAvatarImage} /> : <Text style={styles.platformAvatarInitial}>{String(platform.displayName ?? "P").slice(0, 1).toUpperCase()}</Text>}
                    </View>
                    <Text style={styles.platformName} numberOfLines={2}>{platform.displayName}</Text>
                    <Text style={styles.platformMeta} numberOfLines={2}>{platform.tagline || platform.role || "Followed Platform"}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>,
            )}

            {!hasLibraryRows && !errorMsg ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Nothing saved yet</Text>
                <Text style={styles.emptyText}>Saved titles, unlocked creator videos, progress, replays, and followed Platforms will appear here.</Text>
                <TouchableOpacity style={styles.emptyButton} activeOpacity={0.86} onPress={() => router.push("/(tabs)/explore")}><ChillywoodPrimaryActionFill radius={12} /><Text style={styles.emptyButtonText}>Explore</Text></TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screenBackground: { flex: 1, backgroundColor: "#050505" },
  backgroundOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.68)" },
  safe: { flex: 1, backgroundColor: "transparent" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  loadingText: { color: "#b7b7b7", marginTop: 10, fontSize: 13 },
  content: { paddingHorizontal: 16, paddingTop: 10, gap: 14 },
  mainTabTopBar: { marginBottom: 2 },
  brandRevealSpacer: { backgroundColor: "transparent" },
  headerBlock: { gap: 9 },
  header: { color: "#fff", fontSize: 34, fontWeight: "900" },
  headerBody: { color: "#bfc6d4", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  libraryScopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  scopePill: { minWidth: 84, flexGrow: 1, borderRadius: 12, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, paddingHorizontal: 12, paddingVertical: 10 },
  scopePillValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  scopePillLabel: { color: "#CBD3E1", fontSize: 11, lineHeight: 16, fontWeight: "800", marginTop: 3 },
  section: { gap: 9 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  sectionMeta: { color: "#9DA7BB", fontSize: 10, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  rail: { gap: 10, paddingRight: 4 },
  titleCard: { width: 132, borderRadius: 12, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, padding: 9, gap: 7 },
  titleOpenContent: { gap: 7 },
  removeSavedButton: { minHeight: 44, justifyContent: "center" },
  posterWrap: { width: "100%", height: 150, borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#171A22" },
  poster: { width: "100%", height: "100%" },
  posterInitial: { color: "#FFFFFF", fontSize: 30, fontWeight: "900" },
  itemTitle: { color: "#fff", fontSize: 13, lineHeight: 17, fontWeight: "900" },
  meta: { color: "#bfbfbf", fontSize: 11, lineHeight: 15, fontWeight: "700" },
  replayCard: { width: 156, borderRadius: 12, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, padding: 9, gap: 7 },
  replayThumb: { height: 92, borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#171A22" },
  replayIcon: { color: "#FFFFFF", fontSize: 28, fontWeight: "900" },
  replayStatus: { color: "#FF9AA2", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  unlockedCard: { width: 156, borderRadius: 8, borderWidth: 1, borderColor: "rgba(124,224,163,0.28)", backgroundColor: "rgba(12,30,22,0.9)", padding: 9, gap: 7 },
  unlockedThumb: { height: 92, borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#171A22" },
  unlockedStatus: { color: "#9AF2BC", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  platformCard: { width: 150, minHeight: 166, borderRadius: 12, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, padding: 10, gap: 8 },
  platformAvatar: { width: 58, height: 58, borderRadius: 29, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(110,33,255,0.28)" },
  platformAvatarImage: { width: "100%", height: "100%" },
  platformAvatarInitial: { color: "#fff", fontSize: 22, fontWeight: "900" },
  platformName: { color: "#fff", fontSize: 13, lineHeight: 17, fontWeight: "900" },
  platformMeta: { color: "#bfc6d4", fontSize: 11, lineHeight: 16, fontWeight: "600" },
  emptyInline: { borderRadius: 12, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  emptyInlineTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  emptyInlineText: { color: "#BFC7D7", fontSize: 11, lineHeight: 16, fontWeight: "600" },
  emptyCard: { borderRadius: 16, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.glassBorder, backgroundColor: CHILLYWOOD_VISUAL.glassBackground, padding: 16, gap: 10 },
  emptyTitle: { color: "#fff", fontSize: 18, lineHeight: 23, fontWeight: "900" },
  emptyText: { color: "#bfc6d4", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  emptyButton: { alignSelf: "flex-start", minHeight: 42, borderRadius: 12, backgroundColor: "#6E21FF", alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginTop: 2, overflow: "hidden", borderWidth: 1, borderColor: "rgba(91,214,255,0.72)" },
  emptyButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  errorCard: { borderRadius: 8, borderWidth: 1, borderColor: "rgba(229,9,20,0.3)", backgroundColor: "rgba(229,9,20,0.12)", padding: 12, gap: 7 },
  errorTitle: { color: "#fff", fontSize: 13, fontWeight: "900" },
  errorText: { color: "#FFDDE0", fontSize: 12, lineHeight: 17, fontWeight: "600" },
});
