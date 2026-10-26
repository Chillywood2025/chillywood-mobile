import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { CreatorEventBroadcastPreparationError, prepareCreatorEventBroadcast, type CreatorEventBroadcastPreparation } from "../../_lib/creatorEventBroadcast";
import { controlCreatorEventBroadcast, creatorEventBroadcastStatusCopy } from "../../_lib/creatorEventBroadcastProducer";
import type { CreatorEventSummary } from "../../_lib/liveEvents";

export function EventBroadcastPreparation({ event, inHostRoom = false }: { event: CreatorEventSummary; inHostRoom?: boolean }) {
  const router = useRouter();
  const [preparation, setPreparation] = useState<CreatorEventBroadcastPreparation | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const flight = useRef(false), active = useRef(true), generation = useRef(0);
  const binding = useRef(getCurrentAccountSessionAuthoritySnapshot());
  useEffect(() => {
    active.current = true; generation.current++; setPreparation(null); setNotice(""); setBusy(false); binding.current = getCurrentAccountSessionAuthoritySnapshot();
    const unsubscribe = subscribeToAccountSessionAuthority(() => { setPreparation(null); setNotice(""); setBusy(false); });
    return () => { active.current = false; unsubscribe(); };
  }, [event.id, event.hostUserId]);
  const prepare = async () => {
    if (flight.current) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    const operation = generation.current;
    const current = () => active.current && operation === generation.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    flight.current = true; setBusy(true); setNotice("");
    try {
      const next = await prepareCreatorEventBroadcast(event);
      if (!current()) return;
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
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    if (!preparation || preparation.creatorEventId !== event.id || preparation.hostUserId !== event.hostUserId
      || preparation.state === "room_closed" || authority?.userId !== event.hostUserId
      || !sameAccountSessionAuthority(binding.current, authority)) { setPreparation(null); return; }
    router.push({ pathname: "/watch-party/live-stage/[partyId]", params: { partyId: preparation.roomId, source: "creator-event" } });
  };
  const control = async (action: "start" | "refresh" | "stop") => {
    if (flight.current || !preparation || preparation.creatorEventId !== event.id) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot(), operation = generation.current;
    if (authority?.userId !== event.hostUserId || !sameAccountSessionAuthority(binding.current, authority)) return;
    const current = () => active.current && operation === generation.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    flight.current = true; setBusy(true); setNotice("");
    try {
      const result = await controlCreatorEventBroadcast(event, action);
      if (!current()) return;
      setNotice(creatorEventBroadcastStatusCopy(result));
      setPreparation(previous => previous ? { ...previous,
        state: result.state === "active" ? "broadcast_ready" : "awaiting_operator_setup", canStart: result.state === "active" } : previous);
    } finally { flight.current = false; if (current()) setBusy(false); }
  };
  if (!["draft", "scheduled", "live_now"].includes(event.status)) return null;
  return <View style={styles.panel} testID="event-broadcast-preparation">
    <Text style={styles.title}>Prepare the show broadcast</Text>
    <Text style={styles.body}>{inHostRoom ? "Keep this host room open while broadcasting. Use the controls here to start the broadcast, verify readiness, then open the event to ticket holders." : "Use your private host room for camera and microphone setup. Start the broadcast and event from inside that room to keep your media connected."} Premium host access is separate from buyer tickets. Ticket holders use the event’s protected playback.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={preparation ? "Refresh host room preparation" : "Prepare event host room"} accessibilityState={{ disabled: busy, busy }} disabled={busy} style={styles.button} onPress={() => void prepare()}><Text style={styles.buttonText}>{preparation ? "Refresh host room preparation" : "Prepare event host room"}</Text></Pressable>
    {!inHostRoom && preparation && preparation.state !== "room_closed" ? <Pressable accessibilityRole="button" accessibilityLabel="Enter event host room" disabled={busy} style={styles.button} onPress={openHostRoom}><Text style={styles.buttonText}>Enter event host room</Text></Pressable> : null}
    {preparation && preparation.state !== "room_closed" ? <View style={styles.panel}>
      <Pressable accessibilityRole="button" accessibilityLabel="Start event broadcast" disabled={busy} style={styles.button} onPress={() => void control("start")}><Text style={styles.buttonText}>Start broadcast</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh broadcast readiness" disabled={busy} style={styles.button} onPress={() => void control("refresh")}><Text style={styles.buttonText}>Refresh broadcast readiness</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Stop event broadcast" disabled={busy} style={styles.button} onPress={() => void control("stop")}><Text style={styles.buttonText}>Stop broadcast</Text></Pressable>
    </View> : null}
    {busy ? <ActivityIndicator color="#DC143C" /> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 10 }, title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  body: { color: "#C6CDDB", fontSize: 13, lineHeight: 19 }, notice: { color: "#F4BDCA", lineHeight: 20 },
  button: { minHeight: 48, padding: 12, borderRadius: 10, backgroundColor: "#84132D", justifyContent: "center" }, buttonText: { color: "#fff", fontWeight: "800" } });
