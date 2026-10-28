import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { manageCreatorEventLifecycle, type CreatorEventLifecycleAction } from "../../_lib/creatorEventJourney";
import { EventScheduleInputError, parseZonedEventScheduleInput } from "../../_lib/eventSchedule";
import type { CreatorEventSummary } from "../../_lib/liveEvents";
import { EventBroadcastPreparation } from "./event-broadcast-preparation";

export function EventLifecycleControls({ event, hasPaidOffer, onChanged, inHostRoom = false }: {
  event: CreatorEventSummary; hasPaidOffer: boolean; onChanged: (event: CreatorEventSummary) => void; inHostRoom?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [newStart, setNewStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(true), flight = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const act = async (action: CreatorEventLifecycleAction) => {
    if (flight.current) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    const current = () => active.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    flight.current = true; setBusy(true); setNotice("");
    try {
      const startsAt = action === "reschedule" || action === "delay"
        ? parseZonedEventScheduleInput(newStart, event.timeZone, "reject", "Updated start") : null;
      if (action === "reschedule" && !startsAt) throw new EventScheduleInputError("Enter the new start time before rescheduling.");
      if (["delay", "reschedule", "cancel", "mark_no_show"].includes(action) && !message.trim()) throw new EventScheduleInputError("Add a short update for your buyers before changing this event.");
      // The server compares each buyer's original or explicitly accepted terms.
      // A creator checkbox cannot decide or waive a buyer's remedy eligibility.
      const saved = await manageCreatorEventLifecycle(event, action, { startsAt, message });
      if (!current()) return;
      onChanged(saved); setMessage(""); setNewStart("");
      setNotice(action === "start" ? "This event is live on its verified broadcast." : action === "stop_sales" ? "New ticket sales paused. Existing purchases keep their recorded terms."
        : "Event update saved. Original purchase terms and buyer choices remain recorded. Affected buyers can request refund review, subject to the payment provider’s process.");
    } catch (error) { if (current()) setNotice(error instanceof EventScheduleInputError ? error.message : "This event action could not be confirmed. Refresh before retrying. Starting requires a real active broadcast linked to this event."); }
    finally { flight.current = false; if (current()) setBusy(false); }
  };
  const actions: [CreatorEventLifecycleAction, string][] = [];
  if (event.status === "draft") actions.push(["publish", "Publish event schedule"]);
  if (event.status === "scheduled") actions.push(["start", "Start verified event"], ["delay", "Delay event"], ["reschedule", "Reschedule event"], ["mark_no_show", "Mark event no-show"]);
  if (event.status === "live_now") actions.push(["end", "End event"]);
  if (!["ended", "expired", "canceled"].includes(event.status)) actions.push(["cancel", "Cancel event"]);
  if (hasPaidOffer) actions.push(["stop_sales", "Pause new sales"]);
  return <View style={styles.panel} testID="event-lifecycle-controls">
    <EventBroadcastPreparation event={event} inHostRoom={inHostRoom} />
    <Text style={styles.title}>Manage this event</Text>
    <Text style={styles.body}>Starting requires an active, authorized broadcast already linked to this event. A scheduled time alone never grants media access.</Text>
    {event.status === "scheduled" ? <TextInput style={styles.input} value={newStart} onChangeText={setNewStart} editable={!busy} placeholder={`Updated start in ${event.timeZone}`} placeholderTextColor="#9AA5B8" accessibilityLabel="Updated event start time" autoCapitalize="none" autoCorrect={false} /> : null}
    {event.status === "scheduled" && hasPaidOffer ? <Text style={styles.body}>An earlier start, a delay of 30 minutes or more, or a change of date in the event’s time zone gives affected buyers a choice: keep the new schedule or request provider refund review. Smaller changes accumulate against their original or explicitly accepted schedule. A buyer must choose; silence does not accept a change.</Text> : null}
    <TextInput style={styles.input} value={message} onChangeText={setMessage} editable={!busy} placeholder="Update for your buyers" placeholderTextColor="#9AA5B8" accessibilityLabel="Event update message for buyers" multiline />
    <Text style={styles.body}>Review and republish ticket terms before reopening sales. Cancellation makes buyers eligible for refund review immediately. If a verified broadcast has not begun 30 minutes after the advertised start, no-show refund review becomes available. Accepting a new schedule keeps later cancellation and no-show protection. The payment provider decides the outcome and timing; these controls do not issue money.</Text>
    {notice ? <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
    {busy ? <ActivityIndicator color="#DC143C" /> : null}
    <View style={styles.actions}>{actions.map(([action, label]) => <Pressable key={action} onPress={() => void act(action)} disabled={busy} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy, busy }} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>)}</View>
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 10, marginTop: 12 }, title: { color: "#fff", fontSize: 16, fontWeight: "800" }, body: { color: "#C6CDDB", fontSize: 13, lineHeight: 19 },
  input: { minHeight: 48, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#596174", color: "#fff" }, notice: { color: "#F4BDCA", lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { minHeight: 48, padding: 12, borderRadius: 10, backgroundColor: "#84132D", justifyContent: "center" }, buttonText: { color: "#fff", fontWeight: "800" }, disabled: { opacity: 0.45 } });
