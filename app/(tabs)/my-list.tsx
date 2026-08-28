import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  type ImageSourcePropType,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { titles as localTitles } from "../../_data/titles";
import { readFollowedChannelUserIds } from "../../_lib/channelAudience";
import {
  formatCreatorReplaySourceLabel,
  formatCreatorReplayStatusLabel,
  readCreatorReplayLibraryItems,
  type CreatorReplayLibraryItem,
} from "../../_lib/creatorReplays";
import { supabase } from "../../_lib/supabase";
import {
  buildUserChannelProfile,
  readMergedWatchProgress,
  readMyListIds,
  readUserProfileByUserId,
  type UserChannelProfile,
  type WatchProgressEntry,
} from "../../_lib/userData";
import { MainTabTopBar } from "../../components/navigation/main-tab-top-bar";
import { ProfileMediaImage as Image } from "../../components/ui/ProfileMediaImage";
import type { Tables } from "../../supabase/database.types";

type TitleRow = Pick<
  Tables<"titles">,
  "id" | "title" | "category" | "year" | "runtime" | "synopsis" | "poster_url"
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
      .select("id,title,category,year,runtime,synopsis,poster_url")
      .in("id", normalizedIds)
      .returns<TitleRow[]>();
    if (!error && data) {
      const byId = new Map(data.map((item) => [String(item.id), item]));
      return normalizedIds.map((id) => byId.get(id)).filter((item): item is TitleRow => !!item);
    }
  } catch {
    // Preserve only rows already present on-device when the backed title read is unavailable.
  }

  return normalizedIds
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
      };
    })
    .filter((item): item is TitleRow => !!item);
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedTitles, setSavedTitles] = useState<TitleRow[]>([]);
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingTitle[]>([]);
  const [followedPlatforms, setFollowedPlatforms] = useState<UserChannelProfile[]>([]);
  const [savedReplays, setSavedReplays] = useState<CreatorReplayLibraryItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const savedTitleCount = savedTitles.length;
  const continueWatchingCount = continueWatching.length;
  const followedPlatformCount = followedPlatforms.length;
  const savedReplayCount = savedReplays.length;
  const hasLibraryRows = savedTitleCount + continueWatchingCount + followedPlatformCount + savedReplayCount > 0;

  const getImageSource = useCallback((item?: TitleRow | null): ImageSourcePropType | null => {
    if (!item) return null;
    const localMatch = localTitles.find(
      (entry: any) => String(entry.id) === String(item.id)
        || String(entry.title ?? "").trim().toLowerCase() === String(item.title ?? "").trim().toLowerCase(),
    );
    return (localMatch as any)?.image || localMatch?.poster || remoteImageSource(item.poster_url);
  }, []);

  const backgroundSource = useMemo(
    () => getImageSource(savedTitles[0] ?? continueWatching[0] ?? null) ?? CHILLYWOOD_BACKGROUND_SOURCE,
    [continueWatching, getImageSource, savedTitles],
  );

  const loadLibrary = useCallback(async () => {
    setErrorMsg(null);
    try {
      const [{ data: authData }, savedIds, progressMap, followedIds] = await Promise.all([
        supabase.auth.getUser(),
        readMyListIds().catch(() => [] as string[]),
        readMergedWatchProgress().catch(() => ({})),
        readFollowedChannelUserIds({ limit: 24 }).catch(() => [] as string[]),
      ]);
      const userId = String(authData.user?.id ?? "").trim();
      const progressEntries = Object.entries(progressMap)
        .filter(([, entry]) => Number(entry?.positionMillis ?? 0) > 0)
        .sort(([, left], [, right]) => Number(right?.updatedAt ?? 0) - Number(left?.updatedAt ?? 0))
        .slice(0, 12);
      const progressIds = progressEntries.map(([id]) => id);
      const progressById = new Map(progressEntries);

      const [nextSavedTitles, nextContinueTitles, nextPlatformProfiles, nextReplays] = await Promise.all([
        readTitlesByIds(savedIds),
        readTitlesByIds(progressIds),
        Promise.all(followedIds.map(async (platformUserId) => {
          const profile = await readUserProfileByUserId(platformUserId).catch(() => null);
          return profile ? buildUserChannelProfile({ id: platformUserId, profile }) : null;
        })),
        userId ? readCreatorReplayLibraryItems(userId).catch(() => [] as CreatorReplayLibraryItem[]) : Promise.resolve([]),
      ]);

      setSavedTitles(nextSavedTitles);
      setContinueWatching(nextContinueTitles
        .map((title): ContinueWatchingTitle | null => {
          const progress = progressById.get(String(title.id));
          return progress ? { ...title, progress } : null;
        })
        .filter((item): item is ContinueWatchingTitle => !!item));
      setFollowedPlatforms(nextPlatformProfiles.filter((item): item is UserChannelProfile => !!item));
      setSavedReplays(nextReplays);

      const expectedRows = savedIds.length + progressIds.length + followedIds.length + nextReplays.length;
      const resolvedRows = nextSavedTitles.length + nextContinueTitles.length + nextPlatformProfiles.filter(Boolean).length + nextReplays.length;
      setErrorMsg(expectedRows > 0 && resolvedRows === 0 ? "Some Library items could not be shown right now." : null);
    } catch {
      setSavedTitles([]);
      setContinueWatching([]);
      setFollowedPlatforms([]);
      setSavedReplays([]);
      setErrorMsg("Unable to refresh Library right now. Check your connection and try again.");
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    await loadLibrary();
    setLoading(false);
  }, [loadLibrary]);

  useFocusEffect(useCallback(() => {
    void bootstrap();
  }, [bootstrap]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLibrary();
    setRefreshing(false);
  }, [loadLibrary]);

  const openTitleDetails = (item: TitleRow) => {
    const id = String(item.id).trim();
    if (id) router.push(`/title/${id}`);
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
          <Text style={styles.emptyInlineTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyInlineText}>{emptyText}</Text>
        </View>
      )}
    </View>
  );

  const renderTitleRail = <T extends TitleRow,>(items: T[], openItem: (item: T) => void, metaForItem: (item: T) => string) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {items.map((item) => {
        const source = getImageSource(item);
        return (
          <TouchableOpacity key={item.id} style={styles.titleCard} activeOpacity={0.9} onPress={() => openItem(item)} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`}>
            <View style={styles.posterWrap}>
              {source ? <Image source={source} style={styles.poster} /> : <Text style={styles.posterInitial}>{String(item.title ?? "U").slice(0, 1).toUpperCase()}</Text>}
            </View>
            <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.meta} numberOfLines={1}>{metaForItem(item)}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <ImageBackground source={backgroundSource} style={styles.screenBackground} resizeMode="cover">
      <View style={styles.backgroundOverlay} pointerEvents="none" />
      <SafeAreaView style={styles.safe}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#E50914" />
            <Text style={styles.loadingText}>Loading Library...</Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />}
          >
            <MainTabTopBar surface="library" label="SAVED" style={styles.mainTabTopBar} />
            <View style={styles.headerBlock}>
              <Text style={styles.header}>My Library</Text>
              <Text style={styles.headerBody}>Saved titles, watch progress, followed Platforms, and saved replays live here.</Text>
              <View style={styles.libraryScopeRow}>
                {[
                  [savedTitleCount, "Saved"],
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
                <TouchableOpacity style={styles.emptyButton} activeOpacity={0.86} onPress={onRefresh}><Text style={styles.emptyButtonText}>Retry</Text></TouchableOpacity>
              </View>
            ) : null}

            {renderSection("Saved", `${savedTitleCount} saved`, savedTitleCount > 0, "No saved titles yet", "Save a title from Home or Explore and it will appear here.", renderTitleRail(savedTitles, openTitleDetails, (item) => item.runtime || item.category || "Saved"))}
            {renderSection("Continue Watching", `${continueWatchingCount} ready`, continueWatchingCount > 0, "No watch progress yet", "Titles appear here after playback writes progress for your account or this device.", renderTitleRail(continueWatching, openPlayer, (item) => formatProgressLabel(item.progress)))}

            {renderSection(
              "Saved Replays",
              `${savedReplayCount} saved`,
              savedReplayCount > 0,
              "No saved replays yet",
              "Replays you save from Live Stage or Watch-Party Live will appear here.",
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {savedReplays.map((replay) => (
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
                {followedPlatforms.map((platform) => (
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

            {!hasLibraryRows ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Nothing saved yet</Text>
                <Text style={styles.emptyText}>Saved titles, progress, replays, and followed Platforms will appear here.</Text>
                <TouchableOpacity style={styles.emptyButton} activeOpacity={0.86} onPress={() => router.push("/(tabs)/explore")}><Text style={styles.emptyButtonText}>Explore</Text></TouchableOpacity>
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
  content: { paddingHorizontal: 16, paddingBottom: 96, paddingTop: 10, gap: 14 },
  mainTabTopBar: { marginBottom: 2 },
  headerBlock: { gap: 9 },
  header: { color: "#fff", fontSize: 34, fontWeight: "900" },
  headerBody: { color: "#bfc6d4", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  libraryScopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  scopePill: { minWidth: 84, flexGrow: 1, borderRadius: 8, borderWidth: 1, borderColor: "rgba(229,9,20,0.32)", backgroundColor: "rgba(229,9,20,0.12)", paddingHorizontal: 12, paddingVertical: 10 },
  scopePillValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  scopePillLabel: { color: "#CBD3E1", fontSize: 11, lineHeight: 16, fontWeight: "800", marginTop: 3 },
  section: { gap: 9 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  sectionMeta: { color: "#9DA7BB", fontSize: 10, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  rail: { gap: 10, paddingRight: 4 },
  titleCard: { width: 132, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(10,12,18,0.88)", padding: 9, gap: 7 },
  posterWrap: { width: "100%", height: 150, borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#171A22" },
  poster: { width: "100%", height: "100%" },
  posterInitial: { color: "#FFFFFF", fontSize: 30, fontWeight: "900" },
  itemTitle: { color: "#fff", fontSize: 13, lineHeight: 17, fontWeight: "900" },
  meta: { color: "#bfbfbf", fontSize: 11, lineHeight: 15, fontWeight: "700" },
  replayCard: { width: 156, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(10,12,18,0.88)", padding: 9, gap: 7 },
  replayThumb: { height: 92, borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#171A22" },
  replayIcon: { color: "#FFFFFF", fontSize: 28, fontWeight: "900" },
  replayStatus: { color: "#FF9AA2", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  platformCard: { width: 150, minHeight: 166, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(10,12,18,0.88)", padding: 10, gap: 8 },
  platformAvatar: { width: 58, height: 58, borderRadius: 29, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,9,20,0.2)" },
  platformAvatarImage: { width: "100%", height: "100%" },
  platformAvatarInitial: { color: "#fff", fontSize: 22, fontWeight: "900" },
  platformName: { color: "#fff", fontSize: 13, lineHeight: 17, fontWeight: "900" },
  platformMeta: { color: "#bfc6d4", fontSize: 11, lineHeight: 16, fontWeight: "600" },
  emptyInline: { borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  emptyInlineTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  emptyInlineText: { color: "#BFC7D7", fontSize: 11, lineHeight: 16, fontWeight: "600" },
  emptyCard: { borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", padding: 16, gap: 10 },
  emptyTitle: { color: "#fff", fontSize: 18, lineHeight: 23, fontWeight: "900" },
  emptyText: { color: "#bfc6d4", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  emptyButton: { alignSelf: "flex-start", minHeight: 42, borderRadius: 12, backgroundColor: "#E50914", alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginTop: 2 },
  emptyButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  errorCard: { borderRadius: 8, borderWidth: 1, borderColor: "rgba(229,9,20,0.3)", backgroundColor: "rgba(229,9,20,0.12)", padding: 12, gap: 7 },
  errorTitle: { color: "#fff", fontSize: 13, fontWeight: "900" },
  errorText: { color: "#FFDDE0", fontSize: 12, lineHeight: 17, fontWeight: "600" },
});
