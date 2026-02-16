import { ResizeMode, Video } from "expo-av";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import titles from "../data/titles";

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const videoRef = useRef<Video>(null);

  const title = useMemo(() => titles.find((t) => t.id === id), [id]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  if (!title) {
    return (
      <View style={styles.screen}>
        <Text style={styles.h1}>Not found</Text>
        <Pressable onPress={() => router.back()} style={styles.btnGhost}>
          <Text style={styles.btnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  // ✅ If you used require(...) in titles.ts, this is a NUMBER.
  const source = title.video;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.titleText} numberOfLines={1}>
          {title.title}
        </Text>
      </View>

      <View style={styles.videoWrap}>
        {loading && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" />
            <Text style={styles.overlayText}>Loading…</Text>
          </View>
        )}

        {err && (
          <View style={styles.overlay}>
            <Text style={styles.errorText}>{err}</Text>
          </View>
        )}

        <Video
          ref={videoRef}
          style={styles.video}
          source={source}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay={false}
          isLooping={false}
          onLoadStart={() => {
            setLoading(true);
            setErr(null);
          }}
          onLoad={() => setLoading(false)}
          onError={(e) => {
            setLoading(false);
            setErr("Video failed to load. Check sample.mp4 + require path.");
            console.log("VIDEO ERROR:", e);
          }}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.btnPrimary}
          onPress={async () => {
            const status = await videoRef.current?.getStatusAsync();
            if (!status || !("isLoaded" in status) || !status.isLoaded) return;

            if (status.isPlaying) await videoRef.current?.pauseAsync();
            else await videoRef.current?.playAsync();
          }}
        >
          <Text style={styles.btnPrimaryText}>Play / Pause</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000", paddingTop: 48 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 12, marginBottom: 12 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" },
  backText: { color: "#fff", fontWeight: "800" },
  titleText: { flex: 1, color: "#fff", fontSize: 20, fontWeight: "900" },

  videoWrap: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
  },
  video: { width: "100%", height: "100%" },

  overlay: { position: "absolute", zIndex: 10, width: "100%", height: "100%", alignItems: "center", justifyContent: "center", gap: 10 },
  overlayText: { color: "#fff", opacity: 0.8 },
  errorText: { color: "#fff", opacity: 0.9, textAlign: "center", paddingHorizontal: 16 },

  actions: { padding: 16 },
  btnPrimary: { backgroundColor: "#b3002d", paddingVertical: 18, borderRadius: 16, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 18 },

  btnGhost: { marginTop: 14, backgroundColor: "rgba(255,255,255,0.08)", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, alignSelf: "flex-start" },
  btnText: { color: "#fff", fontWeight: "800" },
  h1: { color: "#fff", fontSize: 22, fontWeight: "900", paddingHorizontal: 16 },
});
