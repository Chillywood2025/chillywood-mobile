import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    type ImageSourcePropType,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
  const savedTitleCount = items.length;

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
          <Text style={styles.loadingText}>Loading Library…</Text>
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
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={styles.header}>Library</Text>
            <Text style={styles.headerBody}>
              Saved titles live here now. Following, replays, events, clips, and broader My Stuff sections appear only after real saved rows exist.
            </Text>
            <View style={styles.libraryScopeRow}>
              <View style={styles.scopePill}>
                <Text style={styles.scopePillValue}>{savedTitleCount}</Text>
                <Text style={styles.scopePillLabel}>Saved titles</Text>
              </View>
              <View style={[styles.scopePill, styles.scopePillMuted]}>
                <Text style={styles.scopePillValue}>Future</Text>
                <Text style={styles.scopePillLabel}>Platforms, replays, events, clips</Text>
              </View>
            </View>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Saved</Text>
              <Text style={styles.sectionMeta}>Backed now</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {errorMsg ? "Library couldn’t refresh" : "Your Library is ready when you are"}
            </Text>
            <Text style={styles.emptyText}>
              {errorMsg
                ? errorMsg
                : "Save a title from Home or Explore and it will appear here. Other Library sections will appear only when real saved items exist."}
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
  headerBlock: {
    marginBottom: 14,
    gap: 8,
  },
  header: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
  },
  headerBody: {
    color: "#bfc6d4",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  libraryScopeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  scopePill: {
    minWidth: 120,
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.32)",
    backgroundColor: "rgba(229,9,20,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scopePillMuted: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  scopePillValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  scopePillLabel: {
    color: "#CBD3E1",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    marginTop: 3,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  sectionMeta: {
    color: "#9DA7BB",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
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
