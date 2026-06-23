import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  resolveCreatorReplayPlayback,
  type CreatorReplayPlaybackReadout,
} from "../../../_lib/creatorReplays";

const BG = "#090A10";
const ACCENT = "#DC143C";
const CHILLYWOOD_BACKGROUND_SOURCE = require("../../../assets/images/chillywood-branded-background.png");

const emptyReadout = (state: CreatorReplayPlaybackReadout["state"], title: string, copy: string): CreatorReplayPlaybackReadout => ({
  canRenderPlayback: false,
  copy,
  fullRoomTokenForSpectators: false,
  liveKitPublishAuthorityGranted: false,
  playbackUrl: null,
  rawHlsUrlReturned: false,
  state,
  title,
});

export default function CreatorReplayPlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ replayId?: string }>();
  const replayId = String(Array.isArray(params.replayId) ? params.replayId[0] : params.replayId ?? "").trim();
  const [loading, setLoading] = useState(true);
  const [readout, setReadout] = useState<CreatorReplayPlaybackReadout>(() => (
    emptyReadout("processing", "Checking replay", "Checking controlled replay playback.")
  ));

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const nextReadout = await resolveCreatorReplayPlayback(replayId).catch((error) => (
        emptyReadout(
          "error",
          "Replay unavailable",
          error instanceof Error ? error.message : "Replay playback is unavailable right now.",
        )
      ));
      if (!active) return;
      setReadout(nextReadout);
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [replayId]);

  const source = useMemo(() => (
    readout.canRenderPlayback && readout.playbackUrl ? { uri: readout.playbackUrl } : null
  ), [readout.canRenderPlayback, readout.playbackUrl]);

  const player = useVideoPlayer(source, (createdPlayer) => {
    createdPlayer.loop = false;
    if (source) createdPlayer.play();
  });

  const stateLabel = readout.state === "ready"
    ? "Ready Replay"
    : readout.state === "processing"
      ? "Processing"
      : readout.state === "failed"
        ? "Failed"
        : readout.state === "locked_private"
          ? "Private"
          : readout.state === "blocked_by_rights"
            ? "Rights Blocked"
            : "Unavailable";

  return (
    <ImageBackground source={CHILLYWOOD_BACKGROUND_SOURCE} style={styles.background} resizeMode="cover">
      <View style={styles.scrim} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.84} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.topCopy}>
            <Text style={styles.kicker}>Content Library Replay</Text>
            <Text style={styles.title} numberOfLines={1}>{readout.title}</Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{stateLabel}</Text>
          </View>
        </View>

        <View style={styles.playerFrame}>
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={ACCENT} />
              <Text style={styles.stateTitle}>Checking replay</Text>
              <Text style={styles.stateCopy}>Loading controlled playback state.</Text>
            </View>
          ) : source ? (
            <VideoView
              allowsFullscreen
              allowsPictureInPicture
              contentFit="contain"
              nativeControls
              player={player}
              style={styles.video}
            />
          ) : (
            <View style={styles.centerState}>
              <Text style={styles.stateTitle}>{readout.title}</Text>
              <Text style={styles.stateCopy}>{readout.copy}</Text>
            </View>
          )}
        </View>

        <View style={styles.guardrailCard}>
          <Text style={styles.guardrailTitle}>Playback Safety</Text>
          <Text style={styles.guardrailCopy}>
            Controlled replay playback only. No raw HLS URL, storage path, LiveKit token, full-room token, publish authority, or host controls are exposed here.
          </Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: BG,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  safe: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    color: "#93A2BF",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: "rgba(220,20,60,0.18)",
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.32)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusText: {
    color: "#FFDCE4",
    fontSize: 11,
    fontWeight: "900",
  },
  playerFrame: {
    flex: 1,
    minHeight: 260,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  stateTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  stateCopy: {
    color: "#B8C2D8",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  guardrailCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.07)",
    padding: 14,
    gap: 6,
  },
  guardrailTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  guardrailCopy: {
    color: "#AAB6CE",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
});
