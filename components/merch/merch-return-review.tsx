import React, { useCallback, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { createMerchCheckoutAttemptId } from "../../_lib/creatorMerch";
import { MERCH_CASE_REJECTED, MerchCaseRejectedError, readMerchReturnReviewCases, respondMerchReturnCase, type MerchReturnCase } from "../../_lib/merchReturnCases";

// Mount only under an exact-session key. Backend requires BOTH staff support
// management and refund-status authority, not generic moderator privileges.
export function MerchReturnReview() {
  const [cases, setCases] = useState<MerchReturnCase[] | null>(null), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [pending, setPending] = useState(false);
  const [rejected, setRejected] = useState(false);
  const active = useRef(false), generation = useRef(0), latch = useRef(false);
  const operation = useRef<{ id: string; caseId: string; note: string; uncertain?: boolean } | null>(null);
  useFocusEffect(useCallback(() => {
    active.current = true; generation.current++; latch.current = false;
    setCases(null); setNote(""); setBusy(false); setError(false); setPending(operation.current !== null);
    return () => { if (operation.current) operation.current.uncertain = true; active.current = false; generation.current++; latch.current = false; setCases(null); setNote(""); };
  }, []));
  const run = async (caseId?: string) => {
    if (!active.current || latch.current) return;
    const ticket = generation.current; latch.current = true; setBusy(true); setError(false); setRejected(false);
    try {
      if (caseId || operation.current) {
        const op = operation.current ?? { id: createMerchCheckoutAttemptId(), caseId: caseId!, note: note.trim() };
        if (!op.note) return;
        operation.current = op; setPending(true);
        await respondMerchReturnCase(op.caseId, op.id, "staff_resolve", op.note);
        if (!active.current || ticket !== generation.current) return;
        operation.current = null; setPending(false); setNote("");
      }
      const result = await readMerchReturnReviewCases();
      if (active.current && ticket === generation.current) setCases(result);
    } catch (error) {
      if (active.current && ticket === generation.current) {
        if (error instanceof MerchCaseRejectedError && operation.current && !operation.current.uncertain) { operation.current = null; setPending(false); setRejected(true); }
        else if (operation.current) operation.current.uncertain = true;
        setError(true);
      }
    }
    finally { if (active.current && ticket === generation.current) { latch.current = false; setBusy(false); } }
  };
  return <View style={{ gap: 8, padding: 16 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open staff merch case review" disabled={busy || pending} onPress={() => void run()}><Text style={{ color: "#fff" }}>Open staff merch case review</Text></Pressable>
    {cases ? <>
      <Text style={{ color: "#bbb" }}>Authorized staff only. Resolving a case records a support decision, not a refund. Provider disputes and other cases remain independent; other financial holds may still apply.</Text>
      <TextInput accessibilityLabel="Staff merch case resolution notes" value={note} onChangeText={setNote} editable={!busy && !pending} maxLength={2000} multiline style={{ color: "#fff", borderColor: "#888", borderWidth: 1 }} />
      {!cases.length ? <Text style={{ color: "#bbb" }}>No escalated merch cases in this review queue.</Text> : null}
      {cases.map(item => <View key={item.id}>
        <Text selectable style={{ color: "#fff" }}>Order {item.orderId} · Case {item.id} · {item.kind} · {item.status}</Text>
        {item.events.map(event => <Text key={event.id} style={{ color: "#bbb" }}>{event.actorRole} · {event.action} · {event.note}</Text>)}
        {item.status === "escalated" ? <Pressable accessibilityRole="button" accessibilityLabel={`Resolve support case ${item.id}`} disabled={busy || pending || !note.trim()} onPress={() => void run(item.id)}><Text style={{ color: "#fff", paddingVertical: 8 }}>Resolve support case {item.id} (no refund issued)</Text></Pressable> : null}
      </View>)}
    </> : null}
    {pending ? <Pressable accessibilityRole="button" accessibilityLabel="Retry same staff resolution" disabled={busy} onPress={() => void run()}><Text style={{ color: "#fff" }}>Retry same staff resolution</Text></Pressable> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: "#ffaaaa" }}>{rejected ? MERCH_CASE_REJECTED : "Staff merch review is unavailable or the update could not be confirmed. Check your permissions or retry the same request; no refund is issued here."}</Text> : null}
  </View>;
}
