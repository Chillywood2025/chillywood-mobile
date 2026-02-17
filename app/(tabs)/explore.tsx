// app/(tabs)/explore.tsx
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

type TitleRow = {
  id: string;
  created_at?: string;
  title: string | null;
  category: string | null;
  year: number | null;
  runtime: string | null;
  synopsis: string | null;
  poster_url: string | null;
  video_url: string | null;
};

const FALLBACK_POSTER =
  "https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?auto=format&fit=crop&w=800&q=60";

export default function ExploreScreen() {
  const router = useRouter();

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

  function openTitle(item: TitleRow) {
    // We’ll build this screen next if you want.
    // For now it still navigates cleanly.
    router.push(`/title/${item.id}`);
  }

  function renderItem({ item }: { item: TitleRow }) {
    const poster = item.poster_url?.trim() ? item.poster_url : FALLBACK_POSTER;

    return (
      <Pressable onPress={() => openTitle(item)} style={styles.card}>
        <View style={styles.posterWrap}>
          <Image source={{ uri: poster }} style={styles.posterImg} />
          <View style={styles.posterFade} />
          <Text numberOfLines={1} style={styles.posterTitle}>
            {item.title || "Untitled"}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {item.category || "Uncategorized"}
          </Text>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.metaText}>
            {item.year ? String(item.year) : "Year ?"}
          </Text>
          {!!item.runtime && (
            <>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.metaText}>{item.runtime}</Text>
            </>
          )}
        </View>

        {!!item.synopsis && (
          <Text numberOfLines={3} style={styles.synopsis}>
            {item.synopsis}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>Chillywood</Text>
        <Text style={styles.count}>Titles: {titlesCount}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
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
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.muted}>No titles yet.</Text>
              <Text style={styles.mutedSmall}>
                Add rows in Supabase → table “titles”.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 },
  brand: { color: "#b30000", fontSize: 40, fontWeight: "900", letterSpacing: 0.4 },
  count: { color: "#888", marginTop: 6, fontSize: 16 },

  listContent: { paddingHorizontal: 18, paddingBottom: 24 },

  card: {
    backgroundColor: "#0b0b0b",
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#151515",
  },

  posterWrap: {
    height: 210,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  posterImg: { width: "100%", height: "100%" },
  posterFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
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

  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  metaText: { color: "#bbb", fontSize: 12 },
  dot: { color: "#444", marginHorizontal: 8 },

  synopsis: { color: "#cfcfcf", marginTop: 10, lineHeight: 18 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  muted: { color: "#aaa", marginTop: 10, fontSize: 14 },
  mutedSmall: { color: "#666", marginTop: 6, fontSize: 12 },

  errorTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  errorText: { color: "#ff6666", marginTop: 8, textAlign: "center" },

  retryBtn: {
    marginTop: 14,
    backgroundColor: "#b30000",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: { color: "#fff", fontWeight: "900" },
});