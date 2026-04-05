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
import { supabase } from "../lib/_supabase";

type TitleRow = {
  id: string;
  slug?: string | null;
  created_at?: string;
  title: string;
  category?: string | null;
  year?: number | null;
  runtime?: string | null;
  synopsis?: string | null;
  poster_url?: string | null;
  video_thumbnail?: string | null;
  video_url?: string | null;
};

type TitleLiveMetadata = {
  liveRoomCount: number;
  commentCount: number;
  reactionsEnabled: boolean;
};

type WatchPartyRoomRow = {
  party_id?: string | null;
  title_id?: string | null;
  reactions_policy?: string | null;
  last_activity_at?: string | null;
  updated_at?: string | null;
};

type WatchPartyRoomMessageRow = {
  party_id?: string | null;
};

const LIVE_ACTIVITY_WINDOW_MILLIS = 15 * 60 * 1000;

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

export default function HomeScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentChannel, setCurrentChannel] = useState<UserChannelProfile | null>(null);
  const [myListIds, setMyListIds] = useState<string[]>([]);
  const [myListTitles, setMyListTitles] = useState<TitleRow[]>([]);
  const [myListLoading, setMyListLoading] = useState(true);
  const [watchProgress, setWatchProgress] = useState<WatchProgressMap>({});
  const [titleLiveMetadataById, setTitleLiveMetadataById] = useState<Record<string, TitleLiveMetadata>>({});

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
        .in("title_id", titleIds);

      if (roomError || !roomData) {
        setTitleLiveMetadataById({});
        return;
      }

      const activeRooms = (roomData as WatchPartyRoomRow[]).filter((row) => {
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
          .in("party_id", activePartyIds);

        (messageData as WatchPartyRoomMessageRow[] | null)?.forEach((row) => {
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
      .select("id, title, category, year, runtime, synopsis, poster_url, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setTitles([]);
      setTitleLiveMetadataById({});
      setError(error.message);
      return;
    }

    const nextTitles = (data as TitleRow[]) ?? [];
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
        .select("id, title, category, year, runtime, synopsis, poster_url, created_at")
        .in("id", ids);

      if (!error && data) {
        const byId = new Map((data as TitleRow[]).map((item) => [String(item.id), item]));
        const ordered = ids.map((id) => byId.get(id)).filter((item): item is TitleRow => !!item);
        setMyListTitles(ordered);
        setMyListLoading(false);
        return;
      }
    } catch {
      // fall through to local fallback
    }

    const fallbackLocal = ids
      .map((id) => {
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
        } as TitleRow;
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
      await Promise.all([fetchTitles(), fetchMyList(), fetchCurrentChannelProfile(), fetchWatchProgress()]);
      setLoading(false);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      Promise.all([fetchMyList(), fetchCurrentChannelProfile(), fetchWatchProgress()]).catch(() => {});
    }, []),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([fetchTitles(), fetchMyList(), fetchCurrentChannelProfile(), fetchWatchProgress()]);
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

  const spotlightItem = continueCandidates[0] ?? titles[0] ?? null;
  const spotlightIsContinueWatching = !!continueCandidates.length && !!spotlightItem;
  const spotlightImageSource = getImageUri(spotlightItem);
  const spotlightProgress = spotlightItem ? watchProgress[String(spotlightItem.id)] : undefined;
  const spotlightProgressPercent = spotlightProgress?.durationMillis
    ? Math.max(8, Math.min(100, Math.round((spotlightProgress.positionMillis / spotlightProgress.durationMillis) * 100)))
    : 42;
  const topRatedTitles = useMemo(() => titles.slice(0, 8), [titles]);
  const homeAvatarInitial = String(currentChannel?.displayName ?? "You").slice(0, 1).toUpperCase() || "Y";

  const browseTitles = useMemo(() => {
    const drama = titles.filter((item) => (item.category ?? "").toLowerCase().includes("drama"));
    return drama.length ? drama : titles.slice(0, 8);
  }, [titles]);

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
                  {spotlightIsContinueWatching ? "CONTINUE WATCHING" : "STREAM THE CITY"}
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Rated</Text>

            <FlatList
              horizontal
              data={topRatedTitles}
              keyExtractor={(item, idx) => `top-rated-${item.id}-${idx}`}
              renderItem={renderDiscoveryCard}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dramaRow}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse</Text>

            <FlatList
              horizontal
              data={browseTitles}
              keyExtractor={(item, idx) => `${item.id}-${idx}`}
              renderItem={renderDiscoveryCard}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dramaRow}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Favorites</Text>

            {myListLoading ? (
              <View style={styles.myListLoadingWrap}>
                <ActivityIndicator color="#E50914" />
              </View>
            ) : !myListTitles.length ? (
              <Text style={styles.myListEmpty}>No saved titles yet.</Text>
            ) : (
              <FlatList
                horizontal
                data={myListTitles}
                keyExtractor={(item, idx) => `${item.id}-${idx}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.myListRow}
                renderItem={({ item }) => {
                  const cardImage = getImageUri(item);
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
                      <TouchableOpacity style={styles.myListRemoveBtn} onPress={() => removeFromMyList(item)} activeOpacity={0.85}>
                        <Text style={styles.myListRemoveText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </View>

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
