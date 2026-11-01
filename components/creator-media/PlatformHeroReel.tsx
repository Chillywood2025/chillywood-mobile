import React, { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";

/** The parent keys this component by viewer authority and immutable asset identity.
 * No autoplay, background audio, caching or external playback of signed media. */
export function PlatformHeroReel({ uri, label }: { uri: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const player = useVideoPlayer({ uri, useCaching: false }, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.allowsExternalPlayback = false;
    instance.staysActiveInBackground = false;
    instance.showNowPlayingNotification = false;
  });
  const pause = useCallback(() => { try { player.pause(); } catch { /* Native release may precede focus cleanup. */ } setPlaying(false); }, [player]);
  useFocusEffect(useCallback(() => () => pause(), [pause]));
  useEffect(() => {
    const background = AppState.addEventListener("change", (state) => { if (state !== "active") pause(); });
    const status = player.addListener("statusChange", (event) => {
      if (event.status === "error") { pause(); setFailed(true); }
    });
    const playback = player.addListener("playingChange", (event) => setPlaying(event.isPlaying));
    return () => { background.remove(); status.remove(); playback.remove(); };
  }, [pause, player]);
  if (failed) return <Text style={styles.notice}>Hero Reel could not play. Refresh the Platform to try again.</Text>;
  return <View style={styles.container}>
    <VideoView testID="platform-hero-reel" player={player} style={styles.video}
      nativeControls contentFit="contain" surfaceType="textureView"
      allowsFullscreen={false} allowsPictureInPicture={false} />
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${playing ? "Pause" : "Play"} ${label} Hero Reel`}
      style={styles.action} onPress={() => {
        if (AppState.currentState !== "active") return;
        if (playing) pause(); else { try { player.play(); setPlaying(true); } catch { setFailed(true); } }
      }}>
      <Text style={styles.actionText}>{playing ? "Pause Hero Reel" : "Play Hero Reel"}</Text>
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  container: { width: "100%", marginVertical: 12, borderRadius: 14, overflow: "hidden", backgroundColor: "#080b12" },
  video: { width: "100%", aspectRatio: 16 / 9 },
  action: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12 },
  actionText: { color: "#fff", fontWeight: "700" },
  notice: { color: "#cbd5e1", paddingVertical: 12 },
});
