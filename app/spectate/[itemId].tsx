import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { readPublicDiscoveryFeedItem } from "../../_lib/discoveryFeed";
import { readCircleSpectatorFeedItem } from "../../_lib/circleSpectatorFeed";
import LegacySpectatorMetadataScreen from "../spectate-metadata/[itemId]";

type LiveLane = "public" | "circle";

type Resolution =
  | { state: "checking" }
  | { state: "legacy" }
  | { state: "live"; lane: LiveLane };

const normalizeParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

export default function SpectatorEntryScreen() {
  const params = useLocalSearchParams<{ itemId?: string | string[] }>();
  const itemId = normalizeParam(params.itemId);
  const [resolution, setResolution] = useState<Resolution>({ state: "checking" });

  useEffect(() => {
    let mounted = true;
    setResolution({ state: "checking" });

    const resolve = async () => {
      if (!itemId) {
        if (mounted) setResolution({ state: "legacy" });
        return;
      }

      const publicItem = await readPublicDiscoveryFeedItem(itemId).catch(() => null);
      if (!mounted) return;
      if (publicItem?.live_state === "live") {
        setResolution({ state: "live", lane: "public" });
        return;
      }

      const circleItem = publicItem ? null : await readCircleSpectatorFeedItem(itemId).catch(() => null);
      if (!mounted) return;
      if (circleItem?.live_state === "live") {
        setResolution({ state: "live", lane: "circle" });
        return;
      }

      setResolution({ state: "legacy" });
    };

    void resolve();
    return () => {
      mounted = false;
    };
  }, [itemId]);

  useEffect(() => {
    if (resolution.state !== "live" || !itemId) return;
    // Expo Router resolves this href to the immersive live route. A replace keeps
    // Back semantics anchored to the Home/Explore surface that opened Spectator.
    const href = `/spectate-live/${encodeURIComponent(itemId)}?lane=${resolution.lane}`;
    // Dynamic import avoids loading router mutation code while the legacy screen owns the route.
    void import("expo-router").then(({ router }) => router.replace(href as never));
  }, [itemId, resolution]);

  if (resolution.state === "legacy") {
    return <LegacySpectatorMetadataScreen />;
  }

  return (
    <View style={styles.screen}>
      <ActivityIndicator color="#FFFFFF" />
      <Text style={styles.copy}>{resolution.state === "live" ? "Opening live…" : "Checking live…"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#000",
  },
  copy: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "800",
  },
});
