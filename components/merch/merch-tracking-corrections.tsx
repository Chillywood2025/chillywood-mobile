import React, { useCallback, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";
import { createMerchCheckoutAttemptId } from "../../_lib/creatorMerch";
import { canReviewMerchReturnCases } from "../../_lib/merchReturnCases";
import { approveTrackingCorrection, declineTrackingCorrection, readTrackingCorrectionQueue, readTrackingCorrections, requestTrackingCorrection, TrackingCorrectionRejected, trackingCorrectionError, type TrackingCorrectionPage } from "../../_lib/merchTrackingCorrections";

const textStyle = { color: CHILLYWOOD_VISUAL.textPrimary };
const inputStyle = { ...textStyle, borderColor: CHILLYWOOD_VISUAL.controlBorder, borderWidth: 1, padding: 8 };
type Operation = { id: string; target: string; carrier: string; number: string; note: string; action: "approve" | "decline"; uncertain?: boolean };
export function MerchTrackingCorrectionReviewGate() {
  const [allowed, setAllowed] = useState(false);
  useFocusEffect(useCallback(() => {
    let current = true; setAllowed(false);
    void canReviewMerchReturnCases().then(value => { if (current) setAllowed(value); });
    return () => { current = false; setAllowed(false); };
  }, []));
  return allowed ? <MerchTrackingCorrections staff /> : null;
}
// Parent is exact-account/session keyed. No operation survives an account switch.
export function MerchTrackingCorrections({ orderId, manage = false, staff = false, onChanged }: { orderId?: string; manage?: boolean; staff?: boolean; onChanged?: () => void }) {
  const [page, setPage] = useState<TrackingCorrectionPage | null>(null);
  const [carrier, setCarrier] = useState("usps"), [number, setNumber] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const active = useRef(false), generation = useRef(0), latch = useRef(false), operation = useRef<Operation | null>(null);
  const run = async (target?: string, more = false, action: "approve" | "decline" = "decline") => {
    if (!active.current || latch.current || (!staff && !orderId)) return;
    const ticket = generation.current; latch.current = true; setBusy(true); setError("");
    try {
      if (target || operation.current) {
        const op = operation.current ?? { id: createMerchCheckoutAttemptId(), target: target!, carrier, number: number.trim(), note: note.trim(), action };
        operation.current = op; setPending(true);
        if (staff) await (op.action === "approve" ? approveTrackingCorrection : declineTrackingCorrection)(op.target, op.id, op.note);
        else await requestTrackingCorrection(orderId!, op.id, op.carrier, op.number, op.note);
        if (!active.current || ticket !== generation.current) return;
        operation.current = null; setPending(false); setNote(""); setNumber(""); onChanged?.();
      }
      const result = staff ? await readTrackingCorrectionQueue(more ? page?.nextCursor ?? null : null) : await readTrackingCorrections(orderId!);
      if (active.current && ticket === generation.current) { setPage(result); onChanged?.(); }
    } catch (cause) {
      if (active.current && ticket === generation.current) {
        if (cause instanceof TrackingCorrectionRejected && operation.current && !operation.current.uncertain) { operation.current = null; setPending(false); }
        else if (operation.current) operation.current.uncertain = true;
        setError(trackingCorrectionError(cause));
      }
    } finally { if (active.current && ticket === generation.current) { latch.current = false; setBusy(false); } }
  };
  useFocusEffect(useCallback(() => {
    active.current = true; generation.current++; latch.current = false;
    setPage(null); setBusy(false); setError(""); setNote(""); setNumber(""); setPending(operation.current !== null);
    return () => { if (operation.current) operation.current.uncertain = true; active.current = false; generation.current++; latch.current = false; setPage(null); setNote(""); setNumber(""); };
  // Reset private readback when the order or review mode changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, staff]));
  const hasPending = page?.requests.some(item => item.status === "pending_review") ?? false;
  return <View style={{ gap: 8, paddingVertical: 8 }}>
    <Pressable accessibilityRole="button" disabled={busy || pending} onPress={() => void run()}><Text style={textStyle}>{staff ? "Open staff tracking correction review" : "Review or request a tracking correction"}</Text></Pressable>
    {page ? <>
      <Text style={{ color: CHILLYWOOD_VISUAL.textMuted }}>Only authorized staff can approve replacement before any verified delivery and without a shipping-address conflict. A request is not approval. Shipment verification and earnings remain held until required checks pass; declined proposals remain held for review. Approval does not confirm delivery, reset an existing return deadline or issue a refund.</Text>
      {page.requests.map(item => <View key={item.id} style={{ gap: 4 }}>
        {staff ? <Text selectable style={textStyle}>Order {item.orderId}</Text> : null}
        <Text style={textStyle}>{item.carrier.toUpperCase()} · {item.trackingNumber} · {item.status === "pending_review" ? "Awaiting staff review; not corrected" : item.status === "approved" ? "Replacement approved; check current shipment verification" : item.status === "superseded" ? "Another proposal replaced this shipment identity; see current tracking" : "Correction declined; shipment verification still needs review"}</Text>
        <Text style={textStyle}>{item.note}</Text>
        {item.reviewNote ? <Text style={textStyle}>Staff: {item.reviewNote}</Text> : null}
        {staff && item.status === "pending_review" ? <Pressable accessibilityRole="button" accessibilityLabel={`Decline proposal ${item.id} (keep verification hold)`} disabled={busy || pending || !note.trim()} onPress={() => void run(item.id)}><Text style={textStyle}>Decline proposal {item.id} (keep verification hold)</Text></Pressable> : null}
        {staff && item.status === "pending_review" ? <Pressable accessibilityRole="button" accessibilityLabel={`Approve pre-delivery correction ${item.id}`} disabled={busy || pending || !note.trim()} onPress={() => void run(item.id, false, "approve")}><Text style={textStyle}>Approve pre-delivery correction {item.id} (delivery still unverified)</Text></Pressable> : null}
      </View>)}
      {!page.requests.length ? <Text style={textStyle}>No correction requests.</Text> : null}
      {staff || manage && !hasPending ? <>
        {!staff ? <>
          <Text style={textStyle}>Proposed carrier and tracking number (not an assignment)</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>{["usps", "ups", "fedex"].map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: carrier === value }} disabled={busy || pending} onPress={() => setCarrier(value)}><Text style={textStyle}>{carrier === value ? "✓ " : ""}{value.toUpperCase()}</Text></Pressable>)}</View>
          <TextInput accessibilityLabel="Proposed tracking number" value={number} onChangeText={setNumber} editable={!busy && !pending} autoCapitalize="characters" maxLength={64} style={inputStyle} />
        </> : null}
        <TextInput accessibilityLabel={staff ? "Tracking correction staff review note" : "Reason for tracking correction"} value={note} onChangeText={setNote} editable={!busy && !pending} maxLength={2000} multiline style={inputStyle} />
        {!staff ? <Pressable accessibilityRole="button" disabled={busy || pending || !note.trim() || !/^[A-Za-z0-9]{6,64}$/.test(number.trim())} onPress={() => void run(orderId)}><Text style={textStyle}>Request correction review</Text></Pressable> : null}
      </> : null}
      {staff && page.nextCursor ? <Pressable accessibilityRole="button" disabled={busy || pending} onPress={() => void run(undefined, true)}><Text style={textStyle}>Next tracking correction page</Text></Pressable> : null}
    </> : null}
    {pending ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run()}><Text style={textStyle}>Retry same correction request</Text></Pressable> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: "#ffaaaa" }}>{error}</Text> : null}
  </View>;
}
