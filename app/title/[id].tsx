import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { titles as localTitles } from "../../_data/titles";
import { supabase } from "../../_lib/supabase";
import { readMyListIds, toggleMyListTitle } from "../../_lib/userData";

const ACCENT = "#DC143C";

type TitleRow = {
  id: string;
  title: string;
  synopsis?: string | null;
  poster_url?: string | null;
  thumbnail_url?: string | null;
};

export default function TitleDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const cleanId = String(id ?? "").trim();
  const [item, setItem] = useState<TitleRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [myListIds, setMyListIds] = useState<string[]>([]);
  const [myListBusy, setMyListBusy] = useState(false);

  const localMatch = useMemo(
    () => localTitles.find((t: any) => String(t.id) === cleanId || String(t.title ?? "").toLowerCase() === cleanId.toLowerCase()) ?? null,
    [cleanId],
  );

  const titleId = String(item?.id ?? localMatch?.id ?? cleanId).trim();
  const inMyList = titleId ? myListIds.includes(titleId) : false;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);

      try {
        const { data } = await supabase
          .from("titles")
          .select("id,title,synopsis,poster_url,thumbnail_url")
          .eq("id", cleanId)
          .maybeSingle();

        if (active && data) {
          setItem(data as TitleRow);
        }
      } catch {
        // local fallback below
      }

      if (active && localMatch) {
        setItem((prev) => prev ?? {
          id: String((localMatch as any).id),
          title: String((localMatch as any).title ?? "Untitled"),
          synopsis: (localMatch as any).description ?? null,
          poster_url: null,
          thumbnail_url: null,
        });
      }

      if (active) setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [cleanId, localMatch]);

  useEffect(() => {
    let active = true;
    readMyListIds()
      .then((ids) => {
        if (active) setMyListIds(ids);
      })
      .catch(() => {
        if (active) setMyListIds([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const onToggleMyList = async () => {
    if (!titleId || myListBusy) return;
    setMyListBusy(true);
    try {
      const ids = await toggleMyListTitle(titleId, {
        title: item?.title ?? (localMatch as any)?.title,
      });
      setMyListIds(ids);
    } finally {
      setMyListBusy(false);
    }
  };

  const title = item ?? (localMatch
    ? {
      id: String((localMatch as any).id),
      title: String((localMatch as any).title ?? "Untitled"),
      synopsis: (localMatch as any).description ?? null,
      poster_url: null,
      thumbnail_url: null,
    }
    : null);

  if (loading) {
    return (
      <View style={styles.screenCenter}>
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.loadingText}>Loading title…</Text>
      </View>
    );
  }

  if (!title) {
    return (
      <View style={styles.screenCenter}>
        <Text style={styles.h1}>Not found</Text>
        <Pressable onPress={() => router.back()} style={styles.btnGhost}>
          <Text style={styles.btnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 28 }}>
      {localMatch?.poster ? (
        <Image source={localMatch.poster} style={styles.hero} />
      ) : (
        <View style={styles.heroFallback} />
      )}

      <View style={styles.content}>
        <Text style={styles.h1}>{title.title}</Text>

        <View style={styles.actions}>
          <Pressable
            style={styles.btnPrimary}
            onPress={() => router.push({ pathname: "/player/[id]", params: { id: String(title.id) } })}
          >
            <Text style={styles.btnPrimaryText}>Play</Text>
          </Pressable>

          <Pressable style={styles.btnGhost} onPress={onToggleMyList} disabled={myListBusy}>
            <Text style={styles.btnText}>{inMyList ? "✓ Favorites" : "+ Favorites"}</Text>
          </Pressable>

        </View>

        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.body}>{title.synopsis ?? "No synopsis yet."}</Text>

        <Pressable onPress={() => router.back()} style={[styles.btnGhost, { marginTop: 18 }]}>
          <Text style={styles.btnText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "black" },
  screenCenter: { flex: 1, backgroundColor: "black", alignItems: "center", justifyContent: "center", padding: 20 },
  loadingText: { color: "#9a9a9a", marginTop: 10 },
  hero: { width: "100%", height: 420, resizeMode: "cover" },
  heroFallback: { width: "100%", height: 420, backgroundColor: "#111" },
  content: { paddingHorizontal: 16, paddingTop: 14 },
  h1: { color: "white", fontSize: 40, fontWeight: "900" },
  meta: { color: "rgba(255,255,255,0.75)", marginTop: 6, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12, marginTop: 14, marginBottom: 12 },
  btnPrimary: {
    backgroundColor: ACCENT,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  btnPrimaryText: { color: "white", fontWeight: "900", fontSize: 16 },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  btnText: { color: "white", fontWeight: "900", fontSize: 16 },
  sectionTitle: { color: "white", fontSize: 18, fontWeight: "900", marginTop: 14 },
  body: { color: "rgba(255,255,255,0.85)", marginTop: 6, lineHeight: 20 },
});
