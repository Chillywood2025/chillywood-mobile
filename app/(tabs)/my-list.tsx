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
import { supabase } from "../lib/supabase";

type TitleRow = {
  id: string;
  title: string;
  category?: string | null;
  year?: number | null;
  runtime?: string | null;
  synopsis?: string | null;
  poster_url?: string | null;
};

export default function MyListScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<TitleRow[]>([]);

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

    if (!ids.length) {
      setItems([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("titles")
        .select("id,title,category,year,runtime,synopsis,poster_url")
        .in("id", ids);

      if (!error && data) {
        const byId = new Map((data as TitleRow[]).map((item) => [String(item.id), item]));
        const ordered = ids
          .map((id) => byId.get(id))
          .filter((item): item is TitleRow => !!item);

        if (ordered.length > 0) {
          setItems(ordered);
          return;
        }
      }
    } catch {
      // fallback below
    }

    const fallbackLocal = ids
      .map((id) => {
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
        } as TitleRow;
      })
      .filter((item): item is TitleRow => !!item);

    setItems(fallbackLocal);
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

  const openPlayer = useCallback((item: TitleRow) => {
    const safeId = String(item.id).trim();
    if (!safeId) return;
    router.push(`/player/${safeId}`);
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
        ListEmptyComponent={<Text style={styles.emptyText}>Your list is empty</Text>}
        renderItem={({ item }) => {
          const source = getImageSource(item);
          return (
            <TouchableOpacity style={styles.card} onPress={() => openPlayer(item)} activeOpacity={0.9}>
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
  emptyText: {
    color: "#9b9b9b",
    fontSize: 14,
    marginTop: 8,
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
