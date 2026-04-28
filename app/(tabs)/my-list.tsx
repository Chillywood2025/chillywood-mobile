import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    type ImageSourcePropType,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { titles as localTitles } from "../../_data/titles";
import { readMyListIds } from "../../_lib/userData";
import type { Tables } from "../../supabase/database.types";
import { supabase } from "../../_lib/supabase";

type TitleRow = Pick<
  Tables<"titles">,
  "id" | "title" | "category" | "year" | "runtime" | "synopsis" | "poster_url"
>;

export default function MyListScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<TitleRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getImageSource = useCallback((item?: TitleRow | null): ImageSourcePropType | null => {
    if (!item) return null;

    const localMatch = localTitles.find(
      (entry: any) =>
        String(entry.id) === String(item.id) ||
        String(entry.title ?? "").trim().toLowerCase() === String(item.title ?? "").trim().toLowerCase(),
    );

    const source = (localMatch as any)?.image || localMatch?.poster || null;
    return source;
  }, []);

  const loadMyList = useCallback(async () => {
    const ids = await readMyListIds().catch(() => [] as string[]);
    setErrorMsg(null);

    if (!ids.length) {
      setItems([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("titles")
        .select("id,title,category,year,runtime,synopsis,poster_url")
        .in("id", ids)
        .returns<TitleRow[]>();

      if (!error && data) {
        const byId = new Map(data.map((item) => [String(item.id), item]));
        const ordered = ids
          .map((id) => byId.get(id))
          .filter((item): item is TitleRow => !!item);

        setItems(ordered);
        return;
      }
    } catch {
      // fallback below
    }

    const fallbackLocal = ids
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

    setItems(fallbackLocal);
    if (!fallbackLocal.length) {
      setErrorMsg("Unable to refresh My List right now. Check your connection and try again.");
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    await loadMyList();
    setLoading(false);
  }, [loadMyList]);

  useFocusEffect(
    useCallback(() => {
      bootstrap().catch(() => setLoading(false));
    }, [bootstrap]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMyList();
    setRefreshing(false);
  }, [loadMyList]);

  const openTitleDetails = useCallback((item: TitleRow) => {
    const safeId = String(item.id).trim();
    if (!safeId) return;
    router.push(`/title/${safeId}`);
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color="#E50914" />
          <Text style={styles.loadingText}>Loading My List…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={items}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />}
        ListHeaderComponent={<Text style={styles.header}>My List</Text>}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {errorMsg ? "My List couldn’t refresh" : "Your list is ready when you are"}
            </Text>
            <Text style={styles.emptyText}>
              {errorMsg
                ? errorMsg
                : "Save a title from Home or Explore and it will appear here for quick access."}
            </Text>
            {errorMsg ? (
              <TouchableOpacity style={styles.emptyButton} activeOpacity={0.86} onPress={onRefresh}>
                <Text style={styles.emptyButtonText}>Retry</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.emptyButton}
                activeOpacity={0.86}
                onPress={() => router.push("/(tabs)/explore")}
              >
                <Text style={styles.emptyButtonText}>Browse Titles</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const source = getImageSource(item);
          return (
            <TouchableOpacity style={styles.card} onPress={() => openTitleDetails(item)} activeOpacity={0.9}>
              {source ? (
                <Image source={source} style={styles.poster} />
              ) : (
                <View style={styles.posterFallback} />
              )}
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>{item.runtime || item.category || "Saved"}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#050505",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  loadingText: {
    color: "#b7b7b7",
    marginTop: 10,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 96,
    paddingTop: 10,
  },
  header: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    marginBottom: 14,
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 18,
    marginTop: 6,
    gap: 10,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
  },
  emptyText: {
    color: "#bfc6d4",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  emptyButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    marginTop: 2,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  gridRow: {
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    marginBottom: 14,
  },
  poster: {
    width: "100%",
    height: 210,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
    backgroundColor: "#111",
  },
  posterFallback: {
    width: "100%",
    height: 210,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
    backgroundColor: "#1A1A1A",
  },
  title: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },
  meta: {
    color: "#bfbfbf",
    fontSize: 12,
    marginTop: 4,
  },
});
