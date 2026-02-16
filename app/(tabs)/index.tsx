import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { titles } from "../data/titles";

const ACCENT = "#DC143C"; // Chillywood crimson
const BG = require("../../assets/images/chicago-skyline.jpg");

type ChipKey = "all" | "trending" | "new";

export default function Index() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ChipKey>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return titles.filter((t) => {
      const matchesChip = chip === "all" ? true : t.category === chip;
      const matchesQuery =
        q.length === 0
          ? true
          : `${t.title} ${t.synopsis ?? ""}`.toLowerCase().includes(q);

      return matchesChip && matchesQuery;
    });
  }, [query, chip]);

  const trending = useMemo(
    () => filtered.filter((t) => t.category === "trending"),
    [filtered]
  );
  const newReleases = useMemo(
    () => filtered.filter((t) => t.category === "new"),
    [filtered]
  );

  const openTitle = (id: string) => {
    router.push(`/title/${id}`);
  };

  const Chip = ({
    label,
    value,
  }: {
    label: string;
    value: ChipKey;
  }) => {
    const active = chip === value;
    return (
      <Pressable
        onPress={() => setChip(value)}
        style={[styles.chip, active && styles.chipActive]}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const PosterCard = ({ item }: any) => (
    <Pressable onPress={() => openTitle(item.id)} style={styles.poster}>
      <ImageBackground
        source={item.poster}
        style={styles.posterArt}
        imageStyle={styles.posterArtImg}
      >
        <View style={styles.posterFade} />
        <Text numberOfLines={2} style={styles.posterTitle}>
          {item.title}
        </Text>
      </ImageBackground>
    </Pressable>
  );

  const Row = ({
    title,
    data,
  }: {
    title: string;
    data: any[];
  }) => {
    if (!data || data.length === 0) return null;

    return (
      <View style={styles.row}>
        <Text style={styles.rowTitle}>{title}</Text>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 18 }}
          renderItem={({ item }) => <PosterCard item={item} />}
        />
      </View>
    );
  };

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />

      <FlatList
        data={[]} // we’re using ListHeaderComponent as the whole screen
        renderItem={null as any}
        ListHeaderComponent={
          <View style={styles.screen}>
            {/* Brand */}
            <Text style={styles.brand}>CHILLYWOOD</Text>
            <Text style={styles.tagline}>Stream the City</Text>

            {/* Search */}
            <View style={styles.searchWrap}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search titles, stories, vibes..."
                placeholderTextColor="rgba(255,255,255,0.55)"
                style={styles.search}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            {/* Chips */}
            <View style={styles.chips}>
              <Chip label="All" value="all" />
              <Chip label="Trending" value="trending" />
              <Chip label="New" value="new" />
            </View>

            {/* Rows */}
            <Row title="Trending in Chicago" data={trending} />
            <Row title="New Releases" data={newReleases} />

            {/* If search returns mixed results */}
            {query.trim().length > 0 && (
              <View style={styles.row}>
                <Text style={styles.rowTitle}>Search Results</Text>
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 18 }}
                  renderItem={({ item }) => <PosterCard item={item} />}
                />
              </View>
            )}

            {/* Spacer bottom */}
            <View style={{ height: 40 }} />
          </View>
        }
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  screen: { paddingTop: 52, paddingHorizontal: 18 },

  brand: {
    color: ACCENT,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1,
  },
  tagline: {
    color: "white",
    fontSize: 42,
    fontWeight: "900",
    marginTop: 6,
    marginBottom: 14,
  },

  searchWrap: { marginBottom: 12 },
  search: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    color: "white",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    fontSize: 16,
  },

  chips: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  chipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  chipText: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 13,
  },
  chipTextActive: { color: "white" },

  row: { marginBottom: 18 },
  rowTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 10,
  },

  poster: { width: 150, marginRight: 12 },
  posterArt: {
    height: 210,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  posterArtImg: { borderRadius: 18 },
  posterFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  posterTitle: {
    color: "white",
    fontWeight: "900",
    fontSize: 16,
    padding: 12,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
});
