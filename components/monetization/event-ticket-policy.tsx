import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { readEventTicketPolicy, respondToEventSchedule, type EventScheduleChoice, type EventTicketPolicy as TicketPolicySnapshot, type EventTicketSchedule } from "../../_lib/creatorEventTicketPolicy";

const scheduleLabel = (schedule: EventTicketSchedule, point: "startsAt" | "endsAt" = "startsAt") => !schedule[point]
  ? "Not specified in the recorded terms" : `${new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: schedule.timeZone,
}).format(new Date(schedule[point]!))} (${schedule.timeZone})`;

export function EventTicketPolicy({ eventId, purchaseId, initiallyExpanded = false }: {
  eventId: string; purchaseId: string; initiallyExpanded?: boolean;
}) {
  const [authority, setAuthority] = useState(getCurrentAccountSessionAuthoritySnapshot);
  useEffect(() => subscribeToAccountSessionAuthority(setAuthority), []);
  const key = `${authority?.userId ?? ""}:${authority?.sessionGeneration ?? ""}:${eventId}:${purchaseId}`;
  const keyRef = useRef(key); keyRef.current = key;
  const serial = useRef(0), flight = useRef(false);
  const livePolicy = useRef<TicketPolicySnapshot | null>(null);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [state, setState] = useState<{ key: string; policy: TicketPolicySnapshot | null; busy: boolean; message: string }>({ key, policy: null, busy: false, message: "" });
  const current = useCallback(() => keyRef.current === key && !!authority && !authority.restoreOnly
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()), [authority, key]);
  const refresh = useCallback(async () => {
    if (!current() || flight.current) return;
    flight.current = true; const operation = ++serial.current;
    livePolicy.current = null;
    setState({ key, policy: null, busy: true, message: "" });
    const result = await readEventTicketPolicy(eventId, purchaseId);
    if (operation !== serial.current || !current()) return;
    flight.current = false;
    const valid = result.status === "resolved" && result.subjectUserId === authority?.userId && result.subjectSessionGeneration === authority?.sessionGeneration;
    livePolicy.current = valid ? result.policy : null;
    setState({ key, policy: valid ? result.policy : null, busy: false,
      message: valid ? "" : "Ticket changes could not be verified. Refresh before making a choice. Your recorded purchase terms remain in history." });
  }, [authority, current, eventId, key, purchaseId]);
  useEffect(() => {
    serial.current += 1; flight.current = false; livePolicy.current = null;
    setState({ key, policy: null, busy: false, message: "" });
    if (expanded) void refresh();
    return () => { serial.current += 1; flight.current = false; livePolicy.current = null; };
  }, [expanded, key, refresh]);
  const visible = state.key === key ? state : null;
  const policyGeneration = serial.current;
  const respond = async (selectedChoice: EventScheduleChoice) => {
    const policy = visible?.policy;
    if (!current() || !policy?.choiceRequired || flight.current
      || policyGeneration !== serial.current || livePolicy.current !== policy) return;
    flight.current = true; const operation = ++serial.current;
    livePolicy.current = null;
    setState({ key, policy: null, busy: true, message: "" });
    const result = await respondToEventSchedule(eventId, purchaseId, policy.currentRevision.id, selectedChoice);
    if (operation !== serial.current || !current()) return;
    if (result.status !== "resolved" || result.subjectUserId !== authority?.userId || result.subjectSessionGeneration !== authority?.sessionGeneration) {
      flight.current = false;
      setState({ key, policy: null, busy: false, message: "Your choice could not be confirmed. Refresh to check its outcome before choosing again. No refund has been confirmed." });
      return;
    }
    // Always fetch current state: a later change or cancellation may have raced
    // the saved choice. Never optimistically dismiss those protections.
    flight.current = false;
    await refresh();
  };
  if (!authority || authority.restoreOnly) return null;
  const policy = visible?.policy;
  return <View style={styles.section} testID={`event-ticket-policy-${purchaseId}`}>
    <Pressable accessibilityRole="button" accessibilityLabel="Review ticket changes and choices" accessibilityState={{ expanded }}
      testID={`ticket-policy-toggle-${purchaseId}`} style={styles.button} onPress={() => { if (current()) setExpanded(value => !value); }}>
      <Text style={styles.buttonText}>{expanded ? "Hide ticket changes" : "Review ticket changes and choices"}</Text>
    </Pressable>
    {expanded ? <>
      <Text style={styles.title}>Ticket schedule and protections</Text>
      {visible?.busy ? <ActivityIndicator color="#DC143C" /> : <Pressable testID={`ticket-policy-refresh-${purchaseId}`} accessibilityRole="button" style={styles.button} onPress={() => void refresh()}><Text style={styles.buttonText}>Refresh ticket changes</Text></Pressable>}
      {visible?.message ? <Text style={styles.body} accessibilityRole="alert">{visible.message}</Text> : null}
      {policy ? <>
        <Text style={styles.body}>{policy.originalSchedule ? `Purchased start: ${scheduleLabel(policy.originalSchedule)}` : "Original schedule details are unavailable. The current schedule does not replace historical purchase terms."}</Text>
        <Text style={styles.body}>Current advertised start: {scheduleLabel(policy.currentRevision)}</Text>
        <Text style={styles.body}>Current advertised end: {scheduleLabel(policy.currentRevision, "endsAt")}</Text>
        {policy.acceptedRevisionId ? <Text style={styles.meta}>{policy.acceptedRevisionId === policy.currentRevision.id
          ? "You explicitly kept your ticket for this schedule." : "Your earlier schedule acceptance remains in history; it does not accept a later change."}</Text>
          : <Text style={styles.meta}>No acceptance of a changed schedule is recorded here.</Text>}
        {policy.notice ? <Text style={styles.body}>A ticket update is recorded here. Reading it does not accept a changed schedule.</Text> : null}
        {policy.refundEligibility ? <Text style={styles.body}>Eligible for provider refund review: {policy.refundEligibility.reasons.map(reason => reason === "event_canceled" ? "show canceled" : reason === "event_no_show" ? "show did not begin within 30 minutes" : reason === "event_replay_unavailable" ? "promised replay missed its availability deadline" : "significant schedule change").join(", ")}. This is not a confirmed refund; the payment provider decides the outcome and timing.</Text> : null}
        {policy.refundEligibility?.reasons.includes("event_replay_unavailable") ? <Text style={styles.body}>This review eligibility remains if replay becomes available later. Your original purchased replay terms remain in history.</Text> : null}
        {policy.choiceRequired ? <>
          <Text style={styles.body}>The schedule changed significantly. Choose whether to keep this ticket for the exact schedule shown or record a request for provider refund review.</Text>
          <Pressable testID={`ticket-policy-keep-${purchaseId}`} accessibilityRole="button" style={styles.button} onPress={() => void respond("keep_ticket")}><Text style={styles.buttonText}>Keep ticket for this schedule</Text></Pressable>
          <Pressable testID={`ticket-policy-refund-${purchaseId}`} accessibilityRole="button" style={styles.button} onPress={() => void respond("request_refund_review")}><Text style={styles.buttonText}>Request provider refund review</Text></Pressable>
        </> : null}
        <Text style={styles.body}>Keeping a new schedule does not waive later cancellation or no-show protection. These choices do not execute a refund or grant entry.</Text>
        {policy.history.length ? <View><Text style={styles.title}>Your recorded choices</Text>{policy.history.map((entry, index) => <Text key={`${entry.revisionId}:${index}`} testID={`ticket-policy-history-${purchaseId}-${index}`} style={styles.meta}>
          {entry.choice === "keep_ticket" ? "Kept ticket" : "Requested provider refund review"} · {new Date(entry.createdAt).toLocaleString()}
          {"\n"}{entry.choice === "keep_ticket" ? "Accepted start" : "Reviewed start"}: {scheduleLabel(entry.schedule)}
          {"\n"}Recorded end: {scheduleLabel(entry.schedule, "endsAt")}
        </Text>)}</View> : null}
      </> : null}
    </> : null}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 10 }, title: { color: "#fff", fontSize: 15, fontWeight: "700" },
  body: { color: "#C6CDDB", fontSize: 14, lineHeight: 21 }, meta: { color: "#B6C0D0", fontSize: 12, lineHeight: 18 },
  button: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: "#DC143C", backgroundColor: "rgba(220,20,60,0.25)", padding: 12, alignSelf: "flex-start", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
