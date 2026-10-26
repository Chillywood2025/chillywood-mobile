import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { readCreatorEventForHostRoom } from "../../_lib/creatorEventBroadcast";
import type { CreatorEventSummary } from "../../_lib/liveEvents";
import { EventLifecycleControls } from "./event-lifecycle-controls";

/** Room identity is an input to an owner-only server read, never event ownership evidence. */
export function EventHostBroadcastControls({ roomId, active, stageActive, top, maxHeight }: {
  roomId: string; active: boolean; stageActive: boolean; top: number; maxHeight: number;
}) {
  const [event, setEvent] = useState<CreatorEventSummary | null>(null);
  const [eventRoomId, setEventRoomId] = useState("");
  const [status, setStatus] = useState<"loading" | "resolved" | "unavailable">("loading");
  const [expanded, setExpanded] = useState(true);
  const [authorityVersion, setAuthorityVersion] = useState(0);
  const generation = useRef(0), mounted = useRef(true);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const binding = useRef(getCurrentAccountSessionAuthoritySnapshot());
  const currentAuthority = getCurrentAccountSessionAuthoritySnapshot();
  const accountKey = `${currentAuthority?.userId ?? ""}:${currentAuthority?.sessionGeneration ?? ""}:${currentAuthority?.restoreOnly ?? true}`;
  const bound = active && eventRoomId === roomId && event?.hostUserId === currentAuthority?.userId
    && !currentAuthority?.restoreOnly && sameAccountSessionAuthority(binding.current, currentAuthority);
  const refresh = useCallback(async () => {
    const operation = ++generation.current, authority = getCurrentAccountSessionAuthoritySnapshot();
    setEvent(null); setEventRoomId(""); setStatus("loading");
    if (!active || !authority || authority.restoreOnly) { setStatus("unavailable"); return; }
    const current = () => mounted.current && generation.current === operation
      && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    try {
      const resolved = await readCreatorEventForHostRoom(roomId);
      if (!current()) return;
      if (!resolved || resolved.hostUserId !== authority.userId) { setStatus("unavailable"); return; }
      binding.current = authority; setEventRoomId(roomId); setEvent(resolved); setStatus("resolved");
    } catch { if (current()) setStatus("unavailable"); }
  }, [active, roomId]);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeToAccountSessionAuthority(() => {
      generation.current++; setEvent(null); setStatus("unavailable"); setAuthorityVersion(value => value + 1);
    });
    return () => { mounted.current = false; invalidate(); unsubscribe(); };
  }, [invalidate]);
  useEffect(() => { void refresh(); return invalidate; }, [refresh, accountKey, authorityVersion, invalidate]);
  if (!active) return null;
  return <View testID="event-host-broadcast-controls" style={[styles.panel, { top }, !expanded && styles.collapsed]}>
    <Pressable testID="event-host-controls-toggle" accessibilityRole="button" accessibilityLabel={`${expanded ? "Collapse" : "Expand"} event host controls`} accessibilityState={{ expanded }} style={styles.button} onPress={() => setExpanded(value => !value)}>
      <Text style={styles.title}>{expanded ? "Event host controls" : "Event controls"}</Text>
    </Pressable>
    {expanded ? <ScrollView style={{ maxHeight }} contentContainerStyle={styles.content} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {status === "loading" ? <><ActivityIndicator color="#DC143C" /><Text style={styles.body}>Verifying this room’s event…</Text></>
        : !bound || !event || status !== "resolved" ? <><Text accessibilityRole="alert" style={styles.body}>This room’s event could not be verified for your current account. Refresh before using event controls.</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh host event mapping" style={styles.button} onPress={() => void refresh()}><Text style={styles.title}>Refresh event</Text></Pressable></>
          : <>
            <Text style={styles.title}>{event.title}</Text>
            {["ended", "canceled", "expired"].includes(event.status) ? <Text style={styles.body}>This event is closed to live viewers. Broadcast shutdown has been requested; provider confirmation is still required before shutdown is complete.</Text> : null}
            <Text style={styles.body}>Keep this room open during the show. Leaving or returning to the event page disconnects this device’s camera and microphone.</Text>
            {stageActive ? <EventLifecycleControls key={`${roomId}:${event.id}:${accountKey}`} event={event} hasPaidOffer inHostRoom onChanged={next => {
              if (next.id === event.id && next.hostUserId === event.hostUserId && sameAccountSessionAuthority(binding.current, getCurrentAccountSessionAuthoritySnapshot())) setEvent(next);
            }} /> : <Text style={styles.body}>Continue to Live Stage and connect your camera or microphone using the room controls. Event broadcast controls appear here once the host stage is open; the server then verifies your live media.</Text>}
          </>}
    </ScrollView> : null}
  </View>;
}
const styles = StyleSheet.create({
  panel: { position: "absolute", left: 12, right: 12, zIndex: 121, elevation: 121, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(5,8,14,0.96)", padding: 10, gap: 8 },
  collapsed: { left: undefined, width: 170 }, content: { gap: 10, paddingBottom: 10 },
  button: { minHeight: 48, padding: 10, justifyContent: "center", borderRadius: 10, backgroundColor: "#84132D" },
  title: { color: "#fff", fontSize: 14, fontWeight: "800" }, body: { color: "#C6CDDB", fontSize: 13, lineHeight: 19 },
});
