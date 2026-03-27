import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  type ImageSourcePropType,
  ListRenderItem,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { titles as localTitles } from "../../_data/titles";
import { supabase } from "../lib/_supabase";

type TitleRow = {
  id: string;
  slug?: string | null;
  created_at?: string;
  title: string | null;
  category: string | null;
  year: number | null;
  runtime: string | null;
  synopsis: string | null;
  poster_url: string | null;
  video_url: string | null;
};

export default function ExploreScreen() {
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const titlesCount = useMemo(() => titles.length, [titles]);

  async function loadTitles() {
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("titles")
      .select("id, created_at, title, category, year, runtime, synopsis, poster_url, video_url")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(error.message || "Couldn’t load titles.");
      setTitles([]);
      setLoading(false);
      return;
    }

    setTitles((data as TitleRow[]) || []);
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

  const heroItem = titles[0] ?? null;
  const backgroundSource = getExploreImageSource(heroItem);

  const renderItem: ListRenderItem<TitleRow> = ({ item }) => {
    const imageSource = getExploreImageSource(item);

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

        {!!item.synopsis && (
          <Text numberOfLines={3} style={styles.synopsis}>
            {item.synopsis}
          </Text>
        )}
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
            data={titles}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={renderItem}
            ListHeaderComponent={
              <View style={styles.headerBlock}>
                <Text style={styles.exploreTitle}>Explore</Text>
                <Text style={styles.count}>Titles: {titlesCount}</Text>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.muted}>No titles yet.</Text>
                <Text style={styles.mutedSmall}>Add rows in Supabase → table “titles”.</Text>
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

  synopsis: { color: "#CFCFCF", marginTop: 10, lineHeight: 18 },

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
