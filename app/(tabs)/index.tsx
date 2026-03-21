import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
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
      .select("id, title, category, year, runtime, synopsis, poster_url, video_url, created_at")
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

  const count = titles.length;

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Chillywood</Text>
      <Text style={styles.count}>Titles Count: {count}</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
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
      ) : (
        <FlatList
          data={titles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 28 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.muted}>No titles yet.</Text>
              <Text style={styles.mutedSmall}>
                When you add titles later, they’ll show up here automatically.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => {
                const safeId = item.id || item.slug || item.title;
                console.log("NAVIGATING WITH ID:", safeId);
                router.push(`/player/${safeId}`);
              }}
            >
              <View style={styles.posterWrap}>
                {item.poster_url ? (
                  <Image source={{ uri: item.poster_url }} style={styles.poster} />
                ) : (
                  <View style={styles.posterPlaceholder}>
                    <Text style={styles.posterPlaceholderText}>
                      {item.title?.slice(0, 1)?.toUpperCase() ?? "T"}
                    </Text>
                  </View>
                )}
                <View style={styles.posterFade} />
                <Text style={styles.posterTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  {(item.category ?? "title").toString().toUpperCase()}
                </Text>
                <Text style={styles.meta}>
                  {item.year ? String(item.year) : "—"}
                </Text>
                <Text style={styles.meta}>
                  {item.runtime ? item.runtime : "—"}
                </Text>
              </View>

              {!!item.synopsis && (
                <Text style={styles.synopsis} numberOfLines={3}>
                  {item.synopsis}
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  brand: {
    fontSize: 34,
    fontWeight: "900",
    color: "#b30000", // crimson
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  count: {
    color: "#999",
    marginBottom: 6,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  muted: { color: "#aaa", marginTop: 10 },
  mutedSmall: { color: "#777", marginTop: 6, textAlign: "center" },

  errorTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  errorMsg: { color: "#ff6b6b", marginTop: 8, textAlign: "center" },
  retryBtn: {
    marginTop: 14,
    backgroundColor: "#b30000",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "700" },

  card: {
    backgroundColor: "#0f0f0f",
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1c1c1c",
  },

  posterWrap: {
    borderRadius: 16,
    overflow: "hidden",
    height: 210,
    backgroundColor: "#111",
    justifyContent: "flex-end",
  },
  poster: { width: "100%", height: "100%" },
  posterPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#141414",
  },
  posterPlaceholderText: {
    fontSize: 56,
    color: "#b30000",
    fontWeight: "900",
  },
  posterFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  posterTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
    padding: 12,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },

  metaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  meta: {
    color: "#bbb",
    fontSize: 12,
    backgroundColor: "#151515",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#222",
  },
  synopsis: {
    color: "#cfcfcf",
    marginTop: 10,
    lineHeight: 18,
  },
});