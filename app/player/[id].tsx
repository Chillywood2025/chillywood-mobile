import { useLocalSearchParams, useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import titles from "../data/titles";

export default function PlayerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const item = useMemo(
    () => titles.find((t) => t.id === id),
    [id]
  );

  const source = item?.video;

  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  if (!item || !source) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Video not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.videoWrap}>
        <VideoView
          style={styles.video}
          player={player}
          allowsFullscreen
        />

        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{item.title}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.btnPrimary} onPress={() => player.play()}>
          <Text style={styles.btnPrimaryText}>Play</Text>
        </Pressable>

        <Pressable style={styles.btnGhost} onPress={() => player.pause()}>
          <Text style={styles.btnText}>Pause</Text>
        </Pressable>

        <Pressable style={styles.btnGhost} onPress={() => router.back()}>
          <Text style={styles.btnText}>Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: 12,
  },

  videoWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },

  video: {
    width: "100%",
    height: "100%",
  },

  overlay: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.4)",
  },

  overlayText: {
    color: "#fff",
    fontWeight: "800",
  },

  actions: {
    padding: 16,
  },

  btnPrimary: {
    backgroundColor: "#b3002d",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
  },

  btnPrimaryText: {
    color: "#fff",
    fontWeight: "900",
  },

  btnGhost: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
  },

  btnText: {
    color: "#fff",
    fontWeight: "800",
  },

  errorText: {
    color: "#fff",
    textAlign: "center",
    marginTop: 40,
  },
});