import React, { useCallback, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { createMerchCheckoutAttemptId } from "../../_lib/creatorMerch";
import { MERCH_CASE_ERROR, MERCH_CASE_REJECTED, MerchCaseRejectedError, readMerchReturnCases, respondMerchReturnCase, submitMerchReturnCase, type MerchCaseAction, type MerchCaseKind, type MerchReturnCase } from "../../_lib/merchReturnCases";

type Props = { orderId: string; manage: boolean; paymentStatus: string; deadline?: string | null; onChanged: () => void };
type Operation = { id: string; kind?: MerchCaseKind; caseId?: string; action?: MerchCaseAction; note: string; uncertain?: boolean };
function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}><Text style={{ color: "#fff", paddingVertical: 8 }}>{label}</Text></Pressable>;
}
// The order screen is keyed to exact session authority. Changing order/role also
// retires draft text and completion handlers rather than reusing a buyer claim.
export function MerchReturnCases(props: Props) {
  if (!["paid", "disputed", "partially_refunded", "refunded"].includes(props.paymentStatus)) return null;
  return <Cases key={`${props.orderId}:${props.manage}`} {...props} />;
}
function Cases({ orderId, manage, deadline, onChanged }: Props) {
  const [cases, setCases] = useState<MerchReturnCase[] | null>(null), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [pending, setPending] = useState(false);
  const [rejected, setRejected] = useState(false);
  const active = useRef(false), generation = useRef(0), latch = useRef(false), operation = useRef<Operation | null>(null);
  useFocusEffect(useCallback(() => {
    active.current = true; generation.current++; latch.current = false;
    setCases(null); setNote(""); setBusy(false); setError(false); setPending(operation.current !== null);
    return () => { if (operation.current) operation.current.uncertain = true; active.current = false; generation.current++; latch.current = false; setCases(null); setNote(""); };
  }, []));
  const load = async () => {
    if (!active.current || latch.current) return;
    const ticket = generation.current; latch.current = true; setBusy(true); setError(false); setRejected(false);
    try { const result = await readMerchReturnCases(orderId); if (active.current && ticket === generation.current) setCases(result.cases); }
    catch { if (active.current && ticket === generation.current) setError(true); }
    finally { if (active.current && ticket === generation.current) { latch.current = false; setBusy(false); } }
  };
  const submit = async (input?: Omit<Operation, "id" | "note">) => {
    if (!active.current || latch.current) return;
    // A transport failure retains the exact UUID and payload. It is never
    // silently reinterpreted as a different claim/response on a retry.
    const op = operation.current ?? (input ? { ...input, id: createMerchCheckoutAttemptId(), note: note.trim() } : null);
    if (!op || !op.note) return;
    operation.current = op; setPending(true);
    const ticket = generation.current; latch.current = true; setBusy(true); setError(false);
    try {
      if (op.kind) await submitMerchReturnCase(orderId, op.id, op.kind, op.note);
      else await respondMerchReturnCase(op.caseId!, op.id, op.action!, op.note);
      if (!active.current || ticket !== generation.current) return;
      operation.current = null; setPending(false); setNote("");
      const result = await readMerchReturnCases(orderId);
      if (active.current && ticket === generation.current) { setCases(result.cases); onChanged(); }
    } catch (error) {
      if (active.current && ticket === generation.current) {
        if (error instanceof MerchCaseRejectedError && !op.uncertain) { operation.current = null; setPending(false); setRejected(true); }
        else { op.uncertain = true; setRejected(false); }
        setError(true);
      }
    }
    finally { if (active.current && ticket === generation.current) { latch.current = false; setBusy(false); } }
  };
  const deadlineTime = deadline ? Date.parse(deadline) : NaN;
  const returnOpen = Number.isFinite(deadlineTime) && Date.now() < deadlineTime;
  const disabled = busy || pending || !note.trim();
  return <View style={{ gap: 8 }}>
    <Text accessibilityRole="header" style={{ color: "#fff", fontWeight: "600" }}>Returns and delivery help</Text>
    <Text style={{ color: "#bbb" }}>Opening a case does not issue a refund. Creators handle routine requests; Chi&apos;llywood staff review disputes. Unresolved cases keep affected earnings held.</Text>
    {Number.isFinite(deadlineTime) ? <Text style={{ color: "#eee" }}>Recorded return deadline: {new Date(deadlineTime).toLocaleString()} ({new Date(deadlineTime).toISOString()})</Text> : <Text style={{ color: "#bbb" }}>A verified return deadline is not available yet. You can still report non-delivery.</Text>}
    <Button label={cases ? "Refresh return cases" : "View return cases"} disabled={busy} onPress={() => void load()} />
    {cases ? <>
      {!cases.length ? <Text style={{ color: "#bbb" }}>No return or delivery cases for this order.</Text> : null}
      <Text style={{ color: "#bbb" }}>Describe the issue or response. Do not include payment details or a shipping address here; use the private order shipping details.</Text>
      <TextInput accessibilityLabel="Return case details" value={note} onChangeText={setNote} editable={!busy && !pending} maxLength={2000} multiline style={{ color: "#fff", borderColor: "#888", borderWidth: 1, padding: 8 }} />
      {!manage ? <>
        <Button label="Request return" disabled={disabled || !returnOpen} onPress={() => void submit({ kind: "return" })} />
        {!returnOpen ? <Text style={{ color: "#bbb" }}>The verified 30-day return window is not currently open. Delivery problems can still be reported for review.</Text> : null}
        <Button label="Report non-delivery" disabled={disabled} onPress={() => void submit({ kind: "non_delivery" })} />
      </> : null}
      {cases.map(item => <View key={item.id} style={{ gap: 4 }}>
        <Text selectable style={{ color: "#eee" }}>Case {item.id} · {item.kind === "return" ? "Return" : "Non-delivery"} · {item.status}</Text>
        {item.events.map(event => <Text key={event.id} style={{ color: "#bbb" }}>{event.actorRole} · {event.action} · {event.note}</Text>)}
        {item.status !== "closed" ? <>
          {manage ? <Button label={`Respond to case ${item.id}`} disabled={disabled} onPress={() => void submit({ caseId: item.id, action: "creator_response" })} /> : null}
          <Button label={`Ask staff to review case ${item.id}`} disabled={disabled || item.status === "escalated"} onPress={() => void submit({ caseId: item.id, action: "escalate" })} />
          {!manage ? <Button label={`Close my case ${item.id}`} disabled={disabled} onPress={() => void submit({ caseId: item.id, action: "buyer_close" })} /> : null}
        </> : null}
      </View>)}
    </> : null}
    {pending ? <Button label="Retry same case request" disabled={busy} onPress={() => void submit()} /> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: "#ffaaaa" }}>{rejected ? MERCH_CASE_REJECTED : MERCH_CASE_ERROR}</Text> : null}
  </View>;
}
