import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { createVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "../../_lib/accountSessionAuthority";
import { paidVideoPlaybackSelectionKey, preparePaidVideoPlayback, type PaidVideoPlaybackLease, type PaidVideoPlaybackSelection } from "../../_lib/isolatedPaidVideoPlayback";

export type IsolatedPaidVideoPlayerProps = {
  authority: AccountSessionAuthorityBinding;
  selection: PaidVideoPlaybackSelection;
  focused: boolean;
  /** A current observed hold is a veto. False never establishes access. */
  blocked?: boolean;
};
type Owner = { retire: (notify: boolean) => void; current: () => boolean; player: VideoPlayer | null };
type Visible = { owner: Owner; key: string; requestId: number; player: VideoPlayer };

/** One native player belongs to one fresh, volatile admission lease. Neither a
 * receipt nor a successful SDK callback reaches this component as authority. */
export function IsolatedPaidVideoPlayer({ authority, selection, focused, blocked = false }: IsolatedPaidVideoPlayerProps) {
  const { userId, accountId, sessionGeneration, state, restoreOnly } = authority;
  const identity = useMemo(() => ({ userId, accountId, sessionGeneration, state, restoreOnly }), [userId, accountId, sessionGeneration, state, restoreOnly]);
  let selectionKey = "";
  try { selectionKey = paidVideoPlaybackSelectionKey(selection); } catch { /* Invalid reference metadata cannot open a source. */ }
  const key = JSON.stringify([userId, accountId, sessionGeneration, state, restoreOnly, selectionKey]);
  const latest = useRef({ selection, focused, blocked, key });
  latest.current = { selection, focused, blocked, key };
  const serial = useRef(0);
  const live = useRef<Owner | null>(null);
  const [request, setRequest] = useState<{ key: string; id: number } | null>(null);
  const [visible, setVisible] = useState<Visible | null>(null);
  const [frame, setFrame] = useState<Visible | null>(null);
  const [message, setMessage] = useState("Open this video to check current access.");
  const [, refreshAvailability] = useState(0);

  useEffect(() => {
    // Keep the closed-state controls current as well. Returning to the same
    // account/foreground enables explicit reopening; it never revives a lease.
    const subscription = AppState.addEventListener("change", next => {
      if (next !== "active") live.current?.retire(true);
      refreshAvailability(value => value + 1);
    });
    const unsubscribe = subscribeToAccountSessionAuthority(next => {
      if (!sameAccountSessionAuthority(identity, next)) live.current?.retire(true);
      refreshAvailability(value => value + 1);
    });
    return () => { subscription.remove(); unsubscribe(); };
  }, [identity]);

  useEffect(() => {
    if (!request || request.key !== key) return;
    if (!focused || blocked || !selectionKey || Platform.OS === "web" || AppState.currentState !== "active"
      || identity.restoreOnly || !sameAccountSessionAuthority(identity, getCurrentAccountSessionAuthoritySnapshot())) {
      setRequest(null); setVisible(null); setFrame(null); setMessage("This video is unavailable. Reopen to check access.");
      return;
    }
    let alive = true, lease: PaidVideoPlaybackLease | null = null;
    let unsubscribeLease: (() => void) | undefined, removeStatus: (() => void) | undefined;
    let loadingTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const destroy = (player: VideoPlayer) => {
      try { player.pause(); } catch {}
      // Clearing a null source cancels the pinned iOS loader and queues removal
      // on native main queues. It does not prove buffered bytes were erased.
      try { player.replace(null); } catch {}
      try { player.release(); } catch {}
    };
    const owner: Owner = {
      player: null,
      current: () => alive && live.current === owner && !controller.signal.aborted
        && latest.current.key === key && latest.current.focused && !latest.current.blocked
        && AppState.currentState === "active" && sameAccountSessionAuthority(identity, getCurrentAccountSessionAuthoritySnapshot())
        && !!lease?.active(),
      retire(notify) {
        if (!alive) return;
        alive = false; controller.abort(); clearTimeout(loadingTimer);
        unsubscribeLease?.(); unsubscribeLease = undefined; lease?.dispose(); lease = null;
        removeStatus?.(); removeStatus = undefined;
        const owned = owner.player; owner.player = null;
        if (owned) destroy(owned);
        if (notify && live.current === owner) {
          setVisible(null); setFrame(null); setRequest(null);
          setMessage("Playback access ended. Reopen to check current access.");
        }
      },
    };
    live.current = owner; setVisible(null); setFrame(null); setMessage("Checking current video access…");
    loadingTimer = setTimeout(() => owner.retire(true), 15_000);
    void preparePaidVideoPlayback(identity, latest.current.selection, controller.signal).then(async admitted => {
      if (!alive || controller.signal.aborted || latest.current.key !== key || !latest.current.focused || latest.current.blocked) {
        admitted.dispose(); return;
      }
      lease = admitted; unsubscribeLease = admitted.onDispose(() => owner.retire(true));
      if (!owner.current()) { owner.retire(true); return; }
      const player = createVideoPlayer(null); owner.player = player;
      player.allowsExternalPlayback = false; player.staysActiveInBackground = false;
      player.showNowPlayingNotification = false; player.loop = false;
      player.bufferOptions = { preferredForwardBufferDuration: 2, waitsToMinimizeStalling: true, maxBufferBytes: 512 * 1024 };
      const listener = player.addListener("statusChange", event => { if (event.status === "error") owner.retire(true); });
      removeStatus = () => listener.remove();
      try { await player.replaceAsync({ ...admitted.source, headers: { ...admitted.source.headers }, useCaching: false, contentType: "progressive" }); }
      catch { owner.retire(true); destroy(player); return; }
      if (!owner.current() || owner.player !== player) { destroy(player); return; }
      clearTimeout(loadingTimer);
      setVisible({ owner, key, requestId: request.id, player });
      setMessage("Ready to play. No frame has rendered yet.");
    }).catch(() => owner.retire(true));
    return () => { owner.retire(false); if (live.current === owner) live.current = null; };
  }, [request, key, selectionKey, identity, focused, blocked]);

  // A changed render selection/focus never shows the previous native view while
  // React is waiting to run effect cleanup.
  const shown = visible && request?.id === visible.requestId && visible.key === key && focused && !blocked
    && visible.owner === live.current && visible.owner.current() ? visible : null;
  const canOpen = !!selectionKey && focused && !blocked && Platform.OS !== "web" && !restoreOnly
    && AppState.currentState === "active" && sameAccountSessionAuthority(identity, getCurrentAccountSessionAuthoritySnapshot());
  const open = () => {
    if (!canOpen) return;
    live.current?.retire(false); setVisible(null); setFrame(null);
    setRequest({ key, id: ++serial.current });
  };
  const close = () => { live.current?.retire(true); setRequest(null); setVisible(null); setFrame(null); };
  return <View testID="paid-video-player">
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.text}>
      {Platform.OS === "web" ? "Authenticated video playback is unavailable in this browser."
        : !focused || blocked ? "Video playback is unavailable."
          : frame === shown && shown ? "First frame displayed." : message}
    </Text>
    {shown && <VideoView testID="paid-video-native-view" player={shown.player} style={styles.video} contentFit="contain"
      nativeControls={false} fullscreenOptions={{ enable: false }} allowsPictureInPicture={false}
      startsPictureInPictureAutomatically={false} allowsVideoFrameAnalysis={false}
      onFirstFrameRender={() => { if (shown.owner.current() && live.current === shown.owner) setFrame(shown); }} />}
    <Pressable testID="paid-video-open" accessibilityRole="button" accessibilityLabel="Open video and check access" disabled={!canOpen} accessibilityState={{ disabled: !canOpen }}
      onPress={open} style={styles.button}><Text style={styles.text}>{request ? "Reopen video" : "Open video"}</Text></Pressable>
    <Pressable testID="paid-video-play" accessibilityRole="button" accessibilityLabel="Play authorized video" disabled={!shown} accessibilityState={{ disabled: !shown }}
      onPress={() => { if (shown?.owner.current()) { try { shown.player.play(); } catch { shown.owner.retire(true); } } }}
      style={styles.button}><Text style={styles.text}>Play</Text></Pressable>
    <Pressable testID="paid-video-pause" accessibilityRole="button" accessibilityLabel="Pause video" disabled={!shown} accessibilityState={{ disabled: !shown }}
      onPress={() => { if (shown?.owner.current()) { try { shown.player.pause(); } catch { shown.owner.retire(true); } } }}
      style={styles.button}><Text style={styles.text}>Pause</Text></Pressable>
    <Pressable testID="paid-video-close" accessibilityRole="button" accessibilityLabel="Close video" disabled={!request} accessibilityState={{ disabled: !request }}
      onPress={close} style={styles.button}><Text style={styles.text}>Close</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ video: { width: "100%", height: 260 }, text: { color: "#D7DFEC", fontSize: 14 }, button: { padding: 12, minHeight: 44 } });
