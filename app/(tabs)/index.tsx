import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import { titles as localTitles } from "../../_data/titles";
import { supabase } from "../lib/supabase";

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

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function fetchTitles() {
    setError(null);

    const { data, error } = await supabase
      .from("titles")
      .select("id, title, category, year, runtime, synopsis, poster_url, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setTitles([]);
      setError(error.message);
      return;
    }

    setTitles((data as TitleRow[]) ?? []);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchTitles();
      setLoading(false);
    })();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await fetchTitles();
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

  const heroItem = titles[0];
  const continueItem = titles[1] ?? titles[0];
  const heroImageSource = getImageUri(heroItem);
  const continueImageSource = getImageUri(continueItem);

  const dramaTitles = useMemo(() => {
    const drama = titles.filter((item) => (item.category ?? "").toLowerCase().includes("drama"));
    return drama.length ? drama : titles.slice(0, 8);
  }, [titles]);

  return (
    <ImageBackground
      source={heroImageSource || undefined}
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
          {heroItem ? (
            <View style={styles.heroWrap}>
              {heroImageSource ? (
                <Image source={heroImageSource} style={styles.heroImage} />
              ) : (
                <View style={styles.heroFallback} />
              )}

              <View style={styles.heroOverlay} />

              <View style={styles.heroContent}>
                <Text style={styles.topBrand}>STREAM THE CITY</Text>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {heroItem.title}
                </Text>
                <Text style={styles.heroSubtitle} numberOfLines={2}>
                  {heroItem.synopsis || "A cinematic story from the city streets."}
                </Text>

                <TouchableOpacity style={styles.playBtn} onPress={() => openPlayer(heroItem)} activeOpacity={0.9}>
                  <Text style={styles.playBtnText}>Play</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Continue Watching</Text>

            {continueItem ? (
              <TouchableOpacity style={styles.continueCard} onPress={() => openPlayer(continueItem)} activeOpacity={0.9}>
                {continueImageSource ? (
                  <Image source={continueImageSource} style={styles.continueImage} />
                ) : (
                  <View style={styles.continueFallback} />
                )}
                <View style={styles.continueOverlay} />

                <View style={styles.continueContent}>
                  <Text style={styles.continueTitle} numberOfLines={1}>
                    {continueItem.title}
                  </Text>
                  <Text style={styles.continueSub} numberOfLines={1}>
                    {continueItem.runtime || "In Progress"}
                  </Text>
                </View>

                <View style={styles.continueProgressTrack}>
                  <View style={styles.continueProgressFill} />
                </View>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Drama</Text>

            <FlatList
              horizontal
              data={dramaTitles}
              keyExtractor={(item, idx) => `${item.id}-${idx}`}
              renderItem={({ item }) => {
                const dramaImageSource = getImageUri(item);

                return (
                  <TouchableOpacity style={styles.dramaCard} onPress={() => openPlayer(item)} activeOpacity={0.9}>
                    {dramaImageSource ? (
                      <Image source={dramaImageSource} style={styles.dramaImage} />
                    ) : (
                      <View style={styles.dramaFallback} />
                    )}
                    <View style={styles.dramaOverlay} />

                    <View style={styles.dramaMeta}>
                      <Text style={styles.dramaTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.dramaRuntime} numberOfLines={1}>
                        {item.runtime || "—"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dramaRow}
            />
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
    paddingBottom: 28,
    backgroundColor: "transparent",
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
    marginBottom: 24,
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

  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 12,
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
    height: 84,
    backgroundColor: "rgba(0,0,0,0.7)",
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
});
