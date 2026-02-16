import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { titles } from "../data/titles";

const ACCENT = "#DC143C";

export default function TitleDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const title = titles.find((t) => t.id === id);

  if (!title) {
    return (
      <View style={styles.screen}>
        <Text style={styles.h1}>Not found</Text>
        <Pressable onPress={() => router.back()} style={styles.btnGhost}>
          <Text style={styles.btnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 28 }}>
      <Image source={title.poster} style={styles.hero} />

      <View style={styles.content}>
        <Text style={styles.h1}>{title.title}</Text>

        <Text style={styles.meta}>
          {(title.year ?? "—") + " • " + (title.runtime ?? "—")}
        </Text>

        <View style={styles.actions}>
          <Pressable
            style={styles.btnPrimary}
            onPress={() => router.push(`/player/${title.id}`)}
          >
            <Text style={styles.btnPrimaryText}>Play</Text>
          </Pressable>

          <Pressable style={styles.btnGhost} onPress={() => {}}>
            <Text style={styles.btnText}>My List</Text>
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
  hero: { width: "100%", height: 420, resizeMode: "cover" },
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