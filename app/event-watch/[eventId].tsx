import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { VideoView, useVideoPlayer, type VideoPlayer } from "expo-video";
import { ActivityIndicator, AppState, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../../_lib/session";
import { subscribeToAccountSessionAuthority, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { creatorEventPlaybackUnavailableCopy, readCreatorEventPlayback, type CreatorEventPlayback } from "../../_lib/creatorEventPlayback";
import { AppBackButton } from "../../components/navigation/app-back-button";
import { CHILLYWOOD_VISUAL } from "../../components/ui/chillywood-visual-system";

function VerifiedEventVideo({ playback, onUnavailable, onPlayer, resumePosition }: {
  playback: Extract<CreatorEventPlayback, { allowed: true }>; onUnavailable: () => void;
  onPlayer: (player: VideoPlayer | null) => void; resumePosition: number;
}) {
  const [waiting, setWaiting] = useState(true);
  const firstFrameRef = useRef(false);
  const readinessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReadinessDeadline = useCallback(() => {
    if (readinessTimerRef.current !== null) clearTimeout(readinessTimerRef.current);
    readinessTimerRef.current = null;
  }, []);
  const armReadinessDeadline = useCallback(() => {
    clearReadinessDeadline(); setWaiting(true);
    readinessTimerRef.current = setTimeout(onUnavailable, 20_000);
  }, [clearReadinessDeadline, onUnavailable]);
  const firstFrame = useCallback(() => {
    firstFrameRef.current = true; clearReadinessDeadline(); setWaiting(false);
  }, [clearReadinessDeadline]);
  const player = useVideoPlayer({ uri: playback.playbackUrl, contentType: "hls" }, instance => {
    instance.staysActiveInBackground = false;
    if (playback.kind === "replay" && resumePosition > 0) instance.currentTime = resumePosition;
    instance.play();
  });
  useEffect(() => {
    onPlayer(player);
    armReadinessDeadline();
    const listener = player.addListener("statusChange", ({ status }) => {
      if (status === "error") { clearReadinessDeadline(); onUnavailable(); }
      else if (status === "loading") armReadinessDeadline();
      else if (status === "readyToPlay" && firstFrameRef.current) { clearReadinessDeadline(); setWaiting(false); }
    });
    return () => { onPlayer(null); clearReadinessDeadline(); listener.remove(); try { player.pause(); } catch { /* Hook cleanup may already have released the native player. */ } };
  }, [armReadinessDeadline, clearReadinessDeadline, onPlayer, onUnavailable, player]);
  return <View>
    <VideoView testID="event-watch-video" player={player} style={styles.video} nativeControls allowsPictureInPicture={false} contentFit="contain" onFirstFrameRender={firstFrame} accessibilityLabel={playback.kind === "live" ? "Live event video" : "Event replay video"} />
    {waiting ? <View testID="event-watch-buffering" accessibilityLiveRegion="polite"><ActivityIndicator color="#DC143C" /><Text style={styles.body}>Loading event video…</Text></View> : null}
  </View>;
}

export default function EventWatchScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = String(Array.isArray(params.eventId) ? params.eventId[0] : params.eventId ?? "").trim();
  const { user, authority, isLoading } = useSession();
  const key = `${eventId}:${user?.id ?? ""}:${authority?.sessionGeneration ?? ""}:${authority?.restoreOnly ?? true}`;
  return <EventWatchSession key={key} eventId={eventId} authority={authority} sessionLoading={isLoading} />;
}

function EventWatchSession({ eventId, authority, sessionLoading }: {
  eventId: string; authority: ReturnType<typeof useSession>["authority"]; sessionLoading: boolean;
}) {
  const router = useRouter();
  const [readout, setReadout] = useState<CreatorEventPlayback | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [authorityCurrent, setAuthorityCurrent] = useState(true);
  const [focused, setFocused] = useState(false);
  const activeRef = useRef(true);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const playerRef = useRef<VideoPlayer | null>(null);
  const resumeRef = useRef<{ playbackIdentity: string; position: number } | null>(null);
  const bindPlayer = useCallback((player: VideoPlayer | null) => { playerRef.current = player; }, []);
  const stop = useCallback((preserveReplayPosition = false) => {
    if (!preserveReplayPosition) resumeRef.current = null;
    requestRef.current += 1; abortRef.current?.abort(); setReadout(null);
  }, []);
  useFocusEffect(useCallback(() => { setFocused(true); return () => { stop(); setFocused(false); }; }, [stop]));
  useEffect(() => {
    activeRef.current = true;
    const subscription = AppState.addEventListener("change", state => { stop(); setForeground(state === "active"); });
    const unsubscribe = subscribeToAccountSessionAuthority(next => {
      if (!sameAccountSessionAuthority(authority, next)) { stop(); setAuthorityCurrent(false); }
    });
    return () => { activeRef.current = false; requestRef.current += 1; abortRef.current?.abort(); subscription.remove(); unsubscribe(); };
  }, [authority, stop]);
  useEffect(() => {
    const generation = ++requestRef.current, controller = new AbortController(); abortRef.current = controller;
    setReadout(null); setLoading(true);
    if (!focused || !foreground || !authorityCurrent || sessionLoading) { setLoading(false); return () => controller.abort(); }
    void readCreatorEventPlayback(eventId, controller.signal).then(result => {
      if (!activeRef.current || controller.signal.aborted || generation !== requestRef.current) return;
      if (!result.allowed || result.kind !== "replay" || result.playbackIdentity !== resumeRef.current?.playbackIdentity) resumeRef.current = null;
      setReadout(result); setLoading(false);
    });
    return () => controller.abort();
  }, [attempt, authorityCurrent, eventId, focused, foreground, sessionLoading]);
  useEffect(() => {
    if (!readout?.allowed) return;
    const timer = setTimeout(() => {
      let position = 0;
      try { position = playerRef.current?.currentTime ?? 0; } catch { /* Native source may already be unavailable. */ }
      resumeRef.current = readout.kind === "replay" && Number.isFinite(position) && position > 0
        ? { playbackIdentity: readout.playbackIdentity, position } : null;
      stop(true); setAttempt(value => value + 1);
    }, Math.max(0, Date.parse(readout.expiresAt) - Date.now() - 30_000));
    return () => clearTimeout(timer);
  }, [readout, stop]);
  const playbackFailed = useCallback(() => { stop(); setLoading(false); }, [stop]);
  const playback = foreground && focused && authorityCurrent && readout?.allowed && Date.parse(readout.expiresAt) > Date.now() ? readout : null;
  return <ImageBackground source={require("../../assets/images/chillywood-branded-background.png")} style={styles.screen} resizeMode="cover">
    <View pointerEvents="none" style={styles.overlay} /><SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppBackButton testID="event-watch-back" accessibilityLabel="Back to event" onPress={() => {
          stop(); if (router.canGoBack()) router.back(); else if (eventId) router.replace({ pathname: "/event/[eventId]", params: { eventId } }); else router.replace("/purchases");
        }} />
        <Text style={styles.heading}>{playback?.kind === "replay" ? "Event replay" : "Watch event"}</Text>
        <Text style={styles.body}>Watch-only access for this event. Speaking, hosting and other purchases are separate.</Text>
        {playback ? <VerifiedEventVideo key={playback.playbackUrl} playback={playback} onUnavailable={playbackFailed} onPlayer={bindPlayer}
          resumePosition={playback.kind === "replay" && resumeRef.current?.playbackIdentity === playback.playbackIdentity ? resumeRef.current.position : 0} />
          : loading || sessionLoading ? <View testID="event-watch-loading" style={styles.card}><ActivityIndicator color="#DC143C" /><Text style={styles.body}>Checking event access…</Text></View>
            : <View testID="event-watch-unavailable" style={styles.card}><Text style={styles.title} accessibilityRole="alert">Event playback unavailable</Text><Text style={styles.body}>{creatorEventPlaybackUnavailableCopy(readout && !readout.allowed ? readout.reason : "playback_unavailable")}</Text></View>}
        <View style={styles.actions}>
          <Pressable testID="event-watch-retry" accessibilityRole="button" style={styles.button} onPress={() => { stop(); setAttempt(value => value + 1); }}><Text style={styles.buttonText}>Refresh access</Text></Pressable>
          <Pressable testID="event-watch-tickets" accessibilityRole="button" style={styles.button} onPress={() => { stop(); router.push("/purchases"); }}><Text style={styles.buttonText}>Purchases &amp; My Tickets</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  </ImageBackground>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.76)" },
  content: { flexGrow: 1, padding: 20, paddingBottom: 40, gap: 18 }, heading: { color: "#fff", fontSize: 26, fontWeight: "900" },
  body: { color: "#C6CDDB", fontSize: 14, lineHeight: 21 }, title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  card: { gap: 12, padding: 18, backgroundColor: CHILLYWOOD_VISUAL.glassBackground, borderRadius: 14 },
  video: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  button: { minHeight: 44, justifyContent: "center", padding: 12, borderRadius: 12, backgroundColor: "rgba(220,20,60,0.3)", borderWidth: 1, borderColor: "#DC143C" }, buttonText: { color: "#fff", fontWeight: "700" },
});
