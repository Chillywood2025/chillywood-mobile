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
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { titles as localTitles } from "../../_data/titles";
import type { Tables } from "../../supabase/database.types";
import { supabase } from "../../_lib/supabase";

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
  | "is_trending"
  | "pin_to_top_row"
  | "sort_order"
> & {
  slug?: string | null;
};

type WatchPartyRoomRow = Pick<
  Tables<"watch_party_rooms">,
  "title_id" | "last_activity_at" | "updated_at"
>;

type TitleLiveMetadata = {
  liveRoomCount: number;
};

const LIVE_ACTIVITY_WINDOW_MILLIS = 15 * 60 * 1000;
const MAX_PROGRAM_SORT_ORDER = Number.MAX_SAFE_INTEGER;

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

const buildExploreInfoLine = (item: TitleRow) => {
  const segments = [
    String(item.category ?? "").trim() || "Title",
    String(item.runtime ?? "").trim() || (item.year ? String(item.year) : ""),
  ].filter(Boolean);

  return segments.join(" • ");
};

const formatExploreBadgeList = (item: TitleRow, liveMetadata?: TitleLiveMetadata | null) => {
  const badges: Array<{ label: string; tone: "program" | "live" }> = [];

  if (liveMetadata?.liveRoomCount) badges.push({ label: "LIVE", tone: "live" });
  if (item.is_hero === true) badges.push({ label: "Hero", tone: "program" });
  if (item.featured === true) badges.push({ label: "Featured", tone: "program" });
  if (item.is_trending === true) badges.push({ label: "Trending", tone: "program" });
  if (item.pin_to_top_row === true) badges.push({ label: "Top Row", tone: "program" });

  return badges;
};

export default function ExploreScreen() {
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [titleLiveMetadataById, setTitleLiveMetadataById] = useState<Record<string, TitleLiveMetadata>>({});

  const programmedTitles = useMemo(() => sortTitlesByProgramTruth(titles), [titles]);
  const titlesCount = useMemo(() => programmedTitles.length, [programmedTitles]);
  const heroItem = useMemo(() => {
    const heroFlagItem = programmedTitles.find((item) => item.is_hero === true) ?? null;
    const featuredItem = programmedTitles.find((item) => item.featured === true) ?? null;
    const topRowItem = programmedTitles.find((item) => item.pin_to_top_row === true) ?? null;
    return heroFlagItem ?? featuredItem ?? topRowItem ?? programmedTitles[0] ?? null;
  }, [programmedTitles]);
  const featuredCount = useMemo(
    () => programmedTitles.filter((item) => item.featured === true).length,
    [programmedTitles],
  );
  const trendingCount = useMemo(
    () => programmedTitles.filter((item) => item.is_trending === true).length,
    [programmedTitles],
  );
  const topRowCount = useMemo(
    () => programmedTitles.filter((item) => item.pin_to_top_row === true).length,
    [programmedTitles],
  );
  const liveNowCount = useMemo(
    () => Object.values(titleLiveMetadataById).filter((item) => item.liveRoomCount > 0).length,
    [titleLiveMetadataById],
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
        .select("title_id,last_activity_at,updated_at")
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

  async function loadTitles() {
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("titles")
      .select(
        "id, created_at, title, category, year, runtime, synopsis, poster_url, video_url, featured, is_hero, is_trending, pin_to_top_row, sort_order",
      )
      .order("created_at", { ascending: false })
      .returns<TitleRow[]>();

    if (error) {
      setErrorMsg("Unable to load titles right now. Check your connection and try again.");
      setTitles([]);
      setTitleLiveMetadataById({});
      setLoading(false);
      return;
    }

    const nextTitles = data || [];
    setTitles(nextTitles);
    await fetchTitleLiveMetadata(nextTitles);
    setLoading(false);
  }

  useEffect(() => {
    loadTitles();
  }, []);

  function getExploreImageSource(item?: TitleRow | null): ImageSourcePropType | null {
    if (!item) return null;

    const localMatch = localTitles.find(
      (t) =>
        String(t.id) === String(item.id) ||
        String(t.title ?? "").trim().toLowerCase() === String(item.title ?? "").trim().toLowerCase(),
    );

    const imageSource = (localMatch as any)?.image || localMatch?.poster || null;
    return imageSource;
  }

  const backgroundSource = getExploreImageSource(heroItem);

  const renderItem: ListRenderItem<TitleRow> = ({ item }) => {
    const imageSource = getExploreImageSource(item);
    const liveMetadata = titleLiveMetadataById[String(item.id)] ?? null;
    const badges = formatExploreBadgeList(item, liveMetadata);

    return (
      <TouchableOpacity
        onPress={() => {
          const safeId = String(item.id || item.slug || item.title);
          router.push(`/title/${safeId}`);
        }}
        style={styles.card}
        activeOpacity={0.9}
      >
        <View style={styles.posterWrap}>
          {imageSource ? (
            <Image source={imageSource} style={styles.posterImg} />
          ) : (
            <View style={styles.posterPlaceholder}>
              <Text style={styles.posterPlaceholderText}>
                {(item.title || "U").slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.posterFade} />

          {badges.length ? (
            <View style={styles.badgeRow}>
              {badges.map((badge) => (
                <View
                  key={`${item.id}-${badge.label}`}
                  style={[
                    styles.badge,
                    badge.tone === "live" ? styles.badgeLive : styles.badgeProgram,
                  ]}
                >
                  <Text style={styles.badgeText}>{badge.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text numberOfLines={1} style={styles.posterTitle}>
            {item.title || "Untitled"}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{item.category || "Uncategorized"}</Text>
          {(item.year || item.runtime) ? <Text style={styles.dot}>•</Text> : null}
          {item.year ? <Text style={styles.metaText}>{String(item.year)}</Text> : null}
          {item.year && item.runtime ? <Text style={styles.dot}>•</Text> : null}
          {item.runtime ? <Text style={styles.metaText}>{item.runtime}</Text> : null}
        </View>

        {liveMetadata?.liveRoomCount ? (
          <Text style={styles.liveSummary}>
            {liveMetadata.liveRoomCount === 1 ? "1 active title room" : `${liveMetadata.liveRoomCount} active title rooms`}
          </Text>
        ) : null}

        {!!item.synopsis && (
          <Text numberOfLines={3} style={styles.synopsis}>
            {item.synopsis}
          </Text>
        )}

        <Text numberOfLines={1} style={styles.discoveryFooter}>
          {buildExploreInfoLine(item)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {backgroundSource ? (
        <View style={styles.fullBackground} pointerEvents="none">
          <ImageBackground
            source={backgroundSource}
            style={styles.fullBackground}
            resizeMode="cover"
          />
        </View>
      ) : (
        <View style={styles.fullBackgroundFallback} pointerEvents="none" />
      )}
      <View style={styles.fullBackgroundOverlay} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#E50914" />
            <Text style={styles.muted}>Loading titles…</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Couldn’t load titles</Text>
            <Text style={styles.errorText}>{errorMsg}</Text>

            <Pressable onPress={loadTitles} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={programmedTitles}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={renderItem}
            ListHeaderComponent={
              <View style={styles.headerBlock}>
                <Text style={styles.exploreTitle}>Explore</Text>
                <Text style={styles.count}>Titles: {titlesCount}</Text>
                <Text style={styles.headerBody}>
                  Browse the current Chi&apos;llywood lineup, with featured, trending, top-row, and live-now cues surfaced first.
                </Text>

                <View style={styles.chipRow}>
                  <View style={styles.chip}>
                    <Text style={styles.chipValue}>{featuredCount}</Text>
                    <Text style={styles.chipLabel}>Featured</Text>
                  </View>
                  <View style={styles.chip}>
                    <Text style={styles.chipValue}>{trendingCount}</Text>
                    <Text style={styles.chipLabel}>Trending</Text>
                  </View>
                  <View style={styles.chip}>
                    <Text style={styles.chipValue}>{topRowCount}</Text>
                    <Text style={styles.chipLabel}>Top Row</Text>
                  </View>
                  <View style={[styles.chip, liveNowCount ? styles.chipLive : null]}>
                    <Text style={styles.chipValue}>{liveNowCount}</Text>
                    <Text style={styles.chipLabel}>Live Now</Text>
                  </View>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.muted}>No published titles yet.</Text>
                <Text style={styles.mutedSmall}>The Chi&apos;llywood lineup will appear here once programming is live.</Text>
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
  fullBackgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0B10",
  },
  fullBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },

  headerBlock: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  exploreTitle: { color: "#fff", fontSize: 38, fontWeight: "900", letterSpacing: 0.3 },
  count: { color: "#D6D6D6", marginTop: 6, fontSize: 13, fontWeight: "700" },
  headerBody: {
    color: "#CFCFD8",
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  chip: {
    minWidth: 86,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipLive: {
    backgroundColor: "rgba(229,9,20,0.18)",
    borderColor: "rgba(229,9,20,0.45)",
  },
  chipValue: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  chipLabel: {
    color: "#D6D6D6",
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
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

  card: {
    backgroundColor: "#0D0D11",
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1f1f26",
  },

  posterWrap: {
    height: 210,
    borderRadius: 14,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: "#111",
  },
  posterImg: { width: "100%", height: "100%" },
  posterPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A1A",
  },
  posterPlaceholderText: {
    color: "#E50914",
    fontSize: 48,
    fontWeight: "900",
  },
  posterFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  badgeRow: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeLive: {
    backgroundColor: "rgba(229,9,20,0.9)",
    borderColor: "rgba(255,255,255,0.2)",
  },
  badgeProgram: {
    backgroundColor: "rgba(12,12,18,0.7)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  posterTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    padding: 12,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },

  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 10, flexWrap: "wrap" },
  metaText: { color: "#D0D0D0", fontSize: 12, fontWeight: "700" },
  dot: { color: "#E50914", marginHorizontal: 8, fontWeight: "900" },
  liveSummary: {
    color: "#FF9AA2",
    marginTop: 10,
    fontSize: 12,
    fontWeight: "800",
  },
  synopsis: { color: "#CFCFCF", marginTop: 10, lineHeight: 18 },
  discoveryFooter: {
    color: "#8A90A3",
    marginTop: 12,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  muted: { color: "#AAA", marginTop: 10, fontSize: 14 },
  mutedSmall: { color: "#666", marginTop: 6, fontSize: 12, textAlign: "center" },

  errorTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  errorText: { color: "#ff6666", marginTop: 8, textAlign: "center" },

  retryBtn: {
    marginTop: 14,
    backgroundColor: "#E50914",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: { color: "#fff", fontWeight: "900" },
});
