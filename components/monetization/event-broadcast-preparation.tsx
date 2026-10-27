import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { CreatorEventBroadcastPreparationError, prepareCreatorEventBroadcast, type CreatorEventBroadcastPreparation } from "../../_lib/creatorEventBroadcast";
import { controlCreatorEventBroadcast, creatorEventBroadcastStatusCopy } from "../../_lib/creatorEventBroadcastProducer";
import type { CreatorEventSummary } from "../../_lib/liveEvents";

export function EventBroadcastPreparation({ event, inHostRoom = false, recoveryOnly = false }: {
  event: CreatorEventSummary; inHostRoom?: boolean; recoveryOnly?: boolean;
}) {
  const router = useRouter();
  const [preparation, setPreparation] = useState<CreatorEventBroadcastPreparation | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const flight = useRef(false), active = useRef(true), generation = useRef(0);
  const binding = useRef(getCurrentAccountSessionAuthoritySnapshot());
  const canPrepare = !recoveryOnly && ["draft", "scheduled", "live_now"].includes(event.status);
  const recovery = inHostRoom && !canPrepare;
  const sourceKey = `${event.id}:${event.hostUserId}`;
  const currentSource = useRef(sourceKey);
  currentSource.current = sourceKey;
  const currentMode = useRef({ canPrepare, recovery, inHostRoom });
  currentMode.current = { canPrepare, recovery, inHostRoom };
  useEffect(() => {
    active.current = true; generation.current++; setPreparation(null); setNotice(""); setBusy(false); binding.current = getCurrentAccountSessionAuthoritySnapshot();
    const unsubscribe = subscribeToAccountSessionAuthority(() => { setPreparation(null); setNotice(""); setBusy(false); });
    return () => { active.current = false; unsubscribe(); };
  }, [event.id, event.hostUserId]);
  const prepare = async () => {
    if (!active.current || currentSource.current !== sourceKey || flight.current || !currentMode.current.canPrepare) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    const operation = generation.current;
    const current = () => active.current && currentSource.current === sourceKey && operation === generation.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    flight.current = true; setBusy(true); setNotice("");
    try {
      const next = await prepareCreatorEventBroadcast(event);
      if (!current() || !currentMode.current.canPrepare) return;
      binding.current = authority; setPreparation(next);
      setNotice(next.state === "broadcast_ready" ? inHostRoom
        ? "Verified broadcast ready. Keep this host room open and use Start verified event below."
        : "Verified broadcast ready. Enter the host room to keep your camera and microphone connected while starting the show."
        : next.state === "room_closed" ? "This host room has ended. Broadcast recovery is required before the show can start."
        : "Host room prepared. Enter to set up your camera and microphone. Protected playback and broadcast setup must be verified before the show can open.");
    } catch (error) { if (current()) setNotice(error instanceof CreatorEventBroadcastPreparationError ? error.message : "Broadcast preparation could not be confirmed. Refresh readiness before continuing."); }
    finally { flight.current = false; if (current()) setBusy(false); }
  };
  const openHostRoom = () => {
    if (!active.current || currentSource.current !== sourceKey || !currentMode.current.canPrepare || currentMode.current.inHostRoom) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    if (!preparation || preparation.creatorEventId !== event.id || preparation.hostUserId !== event.hostUserId
      || preparation.state === "room_closed" || authority?.userId !== event.hostUserId
      || !sameAccountSessionAuthority(binding.current, authority)) { setPreparation(null); return; }
    router.push({ pathname: "/watch-party/live-stage/[partyId]", params: { partyId: preparation.roomId, source: "creator-event" } });
  };
  const control = async (action: "start" | "refresh" | "stop") => {
    if (!active.current || currentSource.current !== sourceKey || flight.current || (action === "start" && !currentMode.current.canPrepare)
      || (!currentMode.current.recovery && (!preparation || preparation.creatorEventId !== event.id))) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot(), operation = generation.current;
    if (authority?.userId !== event.hostUserId || !sameAccountSessionAuthority(binding.current, authority)) return;
    const current = () => active.current && currentSource.current === sourceKey && operation === generation.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    flight.current = true; setBusy(true); setNotice("");
    try {
      const result = await controlCreatorEventBroadcast(event, action);
      if (!current()) return;
      setNotice(currentMode.current.recovery && result.state === "active"
        ? "The broadcast is still active. Stop it here, then refresh readiness until shutdown is confirmed."
        : creatorEventBroadcastStatusCopy(result));
      setPreparation(previous => previous ? { ...previous,
        state: result.state === "active" ? "broadcast_ready" : "awaiting_operator_setup", canStart: result.state === "active" } : previous);
    } catch { if (current()) setNotice("Broadcast status could not be confirmed. Refresh readiness to check the existing attempt before continuing."); }
    finally { flight.current = false; if (current()) setBusy(false); }
  };
  if (!canPrepare && !recovery) return null;
  return <View style={styles.panel} testID="event-broadcast-preparation">
    <Text style={styles.title}>{recovery ? "Confirm broadcast status" : "Prepare the show broadcast"}</Text>
    <Text style={styles.body}>{recovery ? "Check or stop this event’s existing broadcast here. Ending the show or losing the camera connection does not confirm that the provider has stopped broadcasting."
      : inHostRoom ? "Keep this host room open while broadcasting. Use the controls here to start the broadcast, verify readiness, then open the event to ticket holders." : "Use your private host room for camera and microphone setup. Start the broadcast and event from inside that room to keep your media connected."} Premium host access is separate from buyer tickets. Ticket holders use the event’s protected playback.</Text>
    {canPrepare ? <Pressable accessibilityRole="button" accessibilityLabel={preparation ? "Refresh host room preparation" : "Prepare event host room"} accessibilityState={{ disabled: busy, busy }} disabled={busy} style={styles.button} onPress={() => void prepare()}><Text style={styles.buttonText}>{preparation ? "Refresh host room preparation" : "Prepare event host room"}</Text></Pressable> : null}
    {!inHostRoom && preparation && preparation.state !== "room_closed" ? <Pressable accessibilityRole="button" accessibilityLabel="Enter event host room" disabled={busy} style={styles.button} onPress={openHostRoom}><Text style={styles.buttonText}>Enter event host room</Text></Pressable> : null}
    {recovery || (preparation && preparation.state !== "room_closed") ? <View style={styles.panel}>
      {canPrepare ? <Pressable accessibilityRole="button" accessibilityLabel="Start event broadcast" accessibilityState={{ disabled: busy, busy }} disabled={busy} style={styles.button} onPress={() => void control("start")}><Text style={styles.buttonText}>Start broadcast</Text></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh broadcast readiness" accessibilityState={{ disabled: busy, busy }} disabled={busy} style={styles.button} onPress={() => void control("refresh")}><Text style={styles.buttonText}>Refresh broadcast readiness</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Stop event broadcast" accessibilityState={{ disabled: busy, busy }} disabled={busy} style={styles.button} onPress={() => void control("stop")}><Text style={styles.buttonText}>Stop broadcast</Text></Pressable>
    </View> : null}
    {busy ? <ActivityIndicator color="#DC143C" /> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 10 }, title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  body: { color: "#C6CDDB", fontSize: 13, lineHeight: 19 }, notice: { color: "#F4BDCA", lineHeight: 20 },
  button: { minHeight: 48, padding: 12, borderRadius: 10, backgroundColor: "#84132D", justifyContent: "center" }, buttonText: { color: "#fff", fontWeight: "800" } });
