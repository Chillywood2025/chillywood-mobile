import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Audio } from "expo-av";
import { createVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "../../_lib/accountSessionAuthority";
import { ContentInspectionError, type InspectionTarget } from "../../_lib/contentInspection";
import { prepareInspectionMedia, type InspectionMediaLease, type InspectionMediaUnavailable } from "../../_lib/contentInspectionMedia";

export type ContentInspectionMediaViewerProps = { authority: AccountSessionAuthorityBinding; contextId: string; target: InspectionTarget; reason: string };
const unavailable: Record<InspectionMediaUnavailable, string> = {
  unsupported_media_inspection: "Original media inspection is not available for this target.",
  unavailable_original: "The original media is unavailable. Access cannot recover a missing original.",
  unsupported_format: "This original format cannot be rendered safely here.",
  quarantined_unrenderable: "This original is unsafe or lacks verified clean provenance and cannot be rendered.",
};

// Exported for synthetic lifecycle tests. No render state survives a changed
// selection, background transition, or exact-session authority retirement.
export function useInspectionMedia(props: ContentInspectionMediaViewerProps) {
  const { authority, contextId, target, reason } = props;
  const { targetType, targetId } = target;
  const selectionKey = JSON.stringify([authority.userId, authority.accountId, authority.sessionGeneration, authority.restoreOnly, contextId, targetType, targetId, reason]);
  const acceptedSelection = useRef("");
  const [lease, setLease] = useState<InspectionMediaLease | null>(null);
  const [message, setMessage] = useState("Checking original media access…");
  useEffect(() => {
    let current = true;
    let resource: InspectionMediaLease | null = null;
    const controller = new AbortController();
    const retire = () => {
      if (!current) return;
      current = false; controller.abort(); resource?.dispose(); resource = null;
      setLease(null); setMessage("Media access ended. Close and reopen inspection to check current access.");
    };
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") retire(); });
    const unsubscribe = subscribeToAccountSessionAuthority(next => { if (!sameAccountSessionAuthority(authority, next)) retire(); });
    setLease(null);
    if (Platform.OS === "web") setMessage("Original media playback is unavailable in this browser. Authenticated native media delivery requires Android or iOS; device playback has not yet been verified.");
    else if (authority.restoreOnly || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()) || AppState.currentState !== "active") retire();
    else {
      setMessage("Checking original media access…");
      void prepareInspectionMedia(authority, contextId, { targetType, targetId }, reason, controller.signal).then(result => {
        if (!current || controller.signal.aborted) { if (result.availability === "ready") result.dispose(); return; }
        if (result.availability !== "ready") { setMessage(unavailable[result.availability]); return; }
        resource = result;
        result.onDispose(() => { if (current) { setLease(null); setMessage("Media access expired or ended. Close and reopen to check current access."); } });
        if (!result.active()) { result.dispose(); return; }
        acceptedSelection.current = selectionKey; setLease(result); setMessage("");
      }).catch(error => {
        if (!current) return;
        resource?.dispose(); resource = null; setLease(null);
        setMessage(error instanceof ContentInspectionError ? error.message : "The original media could not be verified.");
      });
    }
    return () => { current = false; controller.abort(); resource?.dispose(); resource = null; subscription.remove(); unsubscribe(); };
  }, [authority, contextId, targetType, targetId, reason, selectionKey]);
  // Hide an old source during render itself, before effect cleanup runs.
  return { lease: acceptedSelection.current === selectionKey ? lease : null, message };
}

function OriginalVideo({ lease }: { lease: InspectionMediaLease }) {
  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  useEffect(() => {
    if (!lease.active()) return;
    let instance: VideoPlayer | null = null;
    let removeListener: (() => void) | undefined;
    const release = () => {
      const owned = instance; instance = null;
      removeListener?.(); removeListener = undefined;
      if (owned) { try { owned.pause(); } catch {} try { owned.release(); } catch {} }
      setPlayer(null);
    };
    const unsubscribe = lease.onDispose(release);
    try {
      instance = createVideoPlayer(null);
      instance.allowsExternalPlayback = false; instance.staysActiveInBackground = false;
      instance.showNowPlayingNotification = false; instance.loop = false;
      const listener = instance.addListener("statusChange", event => { if (event.status === "error") lease.dispose(); });
      removeListener = () => listener.remove();
      instance.replace({ ...lease.source, useCaching: false, contentType: "progressive" });
      if (lease.active() && instance) setPlayer(instance); else release();
    } catch { lease.dispose(); release(); }
    return () => { unsubscribe(); release(); };
  }, [lease]);
  if (!player || !lease.active()) return null;
  return <View><VideoView testID="inspection-original-video" player={player} style={styles.media} nativeControls={false} contentFit="contain" allowsFullscreen={false} allowsPictureInPicture={false} />
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Play original video" onPress={() => { if (lease.active()) { try { player.play(); } catch { lease.dispose(); } } }} style={styles.button}><Text style={styles.text}>Play</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Pause original video" onPress={() => { try { player.pause(); } catch { lease.dispose(); } }} style={styles.button}><Text style={styles.text}>Pause</Text></TouchableOpacity></View>;
}

function OriginalAudio({ lease }: { lease: InspectionMediaLease }) {
  const sound = useRef<Audio.Sound | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let current = true;
    const release = () => {
      current = false; const owned = sound.current; sound.current = null; setReady(false);
      if (owned) { owned.setOnPlaybackStatusUpdate(null); void owned.unloadAsync().catch(() => {}); }
    };
    const unsubscribe = lease.onDispose(release);
    if (lease.active()) {
      // downloadFirst=false: never create an inspection media file or asset cache.
      const owned = new Audio.Sound(); sound.current = owned;
      owned.setOnPlaybackStatusUpdate(status => { if (!status.isLoaded && status.error) lease.dispose(); });
      void owned.loadAsync(lease.source, { shouldPlay: false, isLooping: false }, false).then(() => {
        if (!current || !lease.active()) { void owned.unloadAsync().catch(() => {}); return; }
        setReady(true);
      }).catch(() => { if (current) lease.dispose(); else void owned.unloadAsync().catch(() => {}); });
    }
    return () => { unsubscribe(); release(); };
  }, [lease]);
  return <View><Text style={styles.text}>{ready ? "Original audio ready" : "Loading original audio…"}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Play original audio" disabled={!ready} onPress={() => { if (lease.active()) void sound.current?.playAsync().catch(() => lease.dispose()); }} style={styles.button}><Text style={styles.text}>Play</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Pause original audio" disabled={!ready} onPress={() => { void sound.current?.pauseAsync().catch(() => lease.dispose()); }} style={styles.button}><Text style={styles.text}>Pause</Text></TouchableOpacity></View>;
}

export function ContentInspectionMediaViewer(props: ContentInspectionMediaViewerProps) {
  const { lease, message } = useInspectionMedia(props);
  return <View testID="content-inspection-media-viewer">
    {message !== "" && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.text}>{message}</Text>}
    {lease?.active() && <>
      <Text style={styles.text}>Unchanged original media. Native format support varies; Android and iOS physical playback verification is pending.</Text>
      {lease.mediaKind === "image" ? <Image testID="inspection-original-image" source={lease.source} style={styles.media} contentFit="contain" cachePolicy="none" recyclingKey={lease.source.uri} transition={0} accessibilityLabel="Inspected original image" onError={() => lease.dispose()} />
        : lease.mediaKind === "video" ? <OriginalVideo lease={lease} /> : <OriginalAudio lease={lease} />}
    </>}
  </View>;
}
const styles = StyleSheet.create({ media: { width: "100%", height: 280 }, text: { color: "#C7D0DF", fontSize: 14 }, button: { padding: 12, minHeight: 44 } });
