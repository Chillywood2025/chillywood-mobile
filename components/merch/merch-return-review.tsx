import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";
import React, { useCallback, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { createMerchCheckoutAttemptId } from "../../_lib/creatorMerch";
import { canReviewMerchReturnCases, MERCH_CASE_REJECTED, MerchCaseRejectedError, readMerchReturnQueue, respondMerchReturnCase, type MerchReturnCase } from "../../_lib/merchReturnCases";

// Permission-only read: opening public Support does not load private cases.
// This gate only controls presentation; every queue read/action checks again.
export function MerchReturnReviewGate() {
  const [allowed, setAllowed] = useState(false);
  useFocusEffect(useCallback(() => {
    let current = true; setAllowed(false);
    void canReviewMerchReturnCases().then(value => { if (current) setAllowed(value); });
    return () => { current = false; setAllowed(false); };
  }, []));
  return allowed ? <MerchReturnReview /> : null;
}

// Mount only under an exact-session key. Backend requires BOTH staff support
// management and refund-status authority, not generic moderator privileges.
export function MerchReturnReview() {
  const [cases, setCases] = useState<MerchReturnCase[] | null>(null), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [pending, setPending] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null), [total, setTotal] = useState(0);
  const [rejected, setRejected] = useState(false);
  const active = useRef(false), generation = useRef(0), latch = useRef(false);
  const operation = useRef<{ id: string; caseId: string; note: string; uncertain?: boolean } | null>(null);
  useFocusEffect(useCallback(() => {
    active.current = true; generation.current++; latch.current = false;
    setCases(null); setCursor(null); setTotal(0); setNote(""); setBusy(false); setError(false); setPending(operation.current !== null);
    return () => { if (operation.current) operation.current.uncertain = true; active.current = false; generation.current++; latch.current = false; setCases(null); setNote(""); };
  }, []));
  const run = async (caseId?: string, more = false) => {
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
      const result = await readMerchReturnQueue("staff", more ? cursor : null);
      if (active.current && ticket === generation.current) { setCases(result.cases); setCursor(result.nextCursor); setTotal(result.totalCount); setNote(""); }
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
    <Pressable accessibilityRole="button" accessibilityLabel="Open staff merch case review" disabled={busy || pending} onPress={() => void run()}><Text style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>Open staff merch case review</Text></Pressable>
    {cases ? <>
      <Text style={{ color: CHILLYWOOD_VISUAL.textMuted }}>{total} escalated cases. Refresh to discover new or changed cases; pages use a stable case order. Authorized staff only. Resolving a case records a support decision, not a refund. Provider disputes and other cases remain independent; other financial holds may still apply.</Text>
      <TextInput accessibilityLabel="Staff merch case resolution notes" value={note} onChangeText={setNote} editable={!busy && !pending} maxLength={2000} multiline style={{ color: CHILLYWOOD_VISUAL.textPrimary, borderColor: CHILLYWOOD_VISUAL.controlBorder, borderWidth: 1 }} />
      {!cases.length ? <Text style={{ color: CHILLYWOOD_VISUAL.textMuted }}>No escalated merch cases in this review queue.</Text> : null}
      {cursor ? <Pressable accessibilityRole="button" accessibilityLabel="Next staff case page" disabled={busy || pending} onPress={() => void run(undefined, true)}><Text style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>Next staff case page</Text></Pressable> : null}
      {cases.map(item => <View key={item.id}>
        <Text selectable style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>Order {item.orderId} · Case {item.id} · {item.kind} · {item.status}</Text>
        {item.events.map(event => <Text key={event.id} style={{ color: CHILLYWOOD_VISUAL.textMuted }}>{event.actorRole} · {event.action} · {event.note}</Text>)}
        {item.status === "escalated" ? <Pressable accessibilityRole="button" accessibilityLabel={`Resolve support case ${item.id}`} disabled={busy || pending || !note.trim()} onPress={() => void run(item.id)}><Text style={{ color: CHILLYWOOD_VISUAL.textPrimary, paddingVertical: 8 }}>Resolve support case {item.id} (no refund issued)</Text></Pressable> : null}
      </View>)}
    </> : null}
    {pending ? <Pressable accessibilityRole="button" accessibilityLabel="Retry same staff resolution" disabled={busy} onPress={() => void run()}><Text style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>Retry same staff resolution</Text></Pressable> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: "#ffaaaa" }}>{rejected ? MERCH_CASE_REJECTED : "Staff merch review is unavailable or the update could not be confirmed. Check your permissions or retry the same request; no refund is issued here."}</Text> : null}
  </View>;
}
