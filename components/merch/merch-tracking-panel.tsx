import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";
import { MerchTrackingCorrections } from "./merch-tracking-corrections";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { assignMerchTracking, merchTrackingError, readMerchTracking, type MerchTracking, type MerchTrackingCarrier } from "../../_lib/merchTracking";

export type MerchTrackingPanelProps = {
  orderId: string;
  trackingMode: "tracked" | "untracked" | null;
  manage: boolean;
  paymentStatus: string;
  onChanged: () => void | Promise<void>;
};

function Button({ label, onPress, disabled = false, selected }: { label: string; onPress: () => void; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={[styles.button, selected && styles.selected, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

// A changed order or permission context cannot retain another order's draft or
// private tracking projection. The containing order screen is session-keyed.
export function MerchTrackingPanel(props: MerchTrackingPanelProps) {
  if (props.trackingMode !== "tracked") return null;
  return <TrackingPanel key={`${props.orderId}:${props.manage}:${props.paymentStatus}`} {...props} />;
}

function TrackingPanel({ orderId, manage, paymentStatus, onChanged }: MerchTrackingPanelProps) {
  const [tracking, setTracking] = useState<MerchTracking | null>(null);
  const [carrier, setCarrier] = useState<MerchTrackingCarrier>("usps");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const generation = useRef(0), active = useRef(false), latch = useRef(false);
  const load = useCallback(async () => {
    if (!active.current || latch.current) return;
    const ticket = generation.current;
    latch.current = true; setBusy(true); setError(null);
    try { const value = await readMerchTracking(orderId); if (active.current && ticket === generation.current) setTracking(value); }
    catch (cause) { if (active.current && ticket === generation.current) setError(merchTrackingError(cause)); }
    finally { if (ticket === generation.current) { latch.current = false; if (active.current) setBusy(false); } }
  }, [orderId]);
  useFocusEffect(useCallback(() => {
    active.current = true; generation.current++; latch.current = false;
    setTracking(null); setError(null); void load();
    return () => { active.current = false; generation.current++; latch.current = false; };
  }, [load]));
  const save = async () => {
    if (!active.current || latch.current || !manage || paymentStatus !== "paid" || !tracking || tracking.assigned || error) return;
    const ticket = generation.current;
    latch.current = true; setBusy(true); setError(null);
    try {
      const value = await assignMerchTracking({ orderId, carrier, trackingNumber: number });
      if (!active.current || ticket !== generation.current) return;
      setTracking(value); setNumber(""); await onChanged();
    } catch (cause) {
      if (active.current && ticket === generation.current) setError(merchTrackingError(cause));
    } finally { if (ticket === generation.current) { latch.current = false; if (active.current) setBusy(false); } }
  };
  const statuses: Record<string, string> = {
    pending: "Awaiting carrier update", registered: "Awaiting carrier update", PRE_TRANSIT: "Label information received",
    TRANSIT: "In transit", DELIVERED: "Carrier reports delivered", RETURNED: "Returning to sender",
    FAILURE: "Delivery exception", UNKNOWN: "No carrier information", review: "Tracking needs review",
  };
  const corroborated = tracking?.confidence === "corroborated";
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.heading}>Shipment tracking</Text>
    <Text style={styles.notice}>Sandbox preview — no physical shipment or payout is created here.</Text>
    {busy ? <ActivityIndicator accessibilityLabel="Loading shipment tracking" /> : null}
    {tracking ? <>
      {!tracking.providerConfigured ? <Text style={styles.notice}>Automatic tracking setup is pending. Saved tracking numbers do not yet confirm delivery.</Text> : null}
      {tracking.assigned ? <>
        <Text selectable style={styles.body}>{(tracking.carrier || "Carrier").toUpperCase()} · {tracking.trackingNumber || "Tracking assigned"}</Text>
        <Text style={styles.body}>{statuses[tracking.status || ""] || "Awaiting a verified tracking update"}</Text>
        {tracking.deliveryAt ? <Text style={styles.body}>Carrier delivery time: {new Date(tracking.deliveryAt).toLocaleString()}</Text> : null}
        <Text style={styles.notice}>{corroborated ? "Carrier delivery is corroborated against this order's country and postal code, not its exact street address. This is not proof of package contents; return, dispute and other earnings holds still apply." : "Delivery verification is pending or needs review. The tracked return window does not switch to purchase-date timing."}</Text>
        {tracking.reviewReason ? <Text style={styles.notice}>Shipping evidence needs review. Contact support if tracking details are incorrect.</Text> : null}
        {manage ? <Text style={styles.notice}>Tracking is bound to this order and cannot be replaced or removed here. Request a correction review below; a request does not replace tracking or release earnings.</Text> : null}
        <MerchTrackingCorrections key={orderId} orderId={orderId} manage={manage && paymentStatus === "paid"} onChanged={() => { void load(); onChanged?.(); }} />
      </> : manage && paymentStatus === "paid" ? <>
        <Text style={styles.notice}>Add the carrier and tracking number for this order only. Check carefully: the assignment cannot be edited or deleted here.</Text>
        <View style={styles.row}>{(["usps", "ups", "fedex"] as const).map(value => <Button key={value} label={value === "fedex" ? "FedEx" : value.toUpperCase()} selected={carrier === value} disabled={busy} onPress={() => setCarrier(value)} />)}</View>
        <TextInput accessibilityLabel="Order tracking number" value={number} onChangeText={setNumber} editable={!busy} maxLength={64} autoCapitalize="characters" autoCorrect={false} placeholder="Tracking number" placeholderTextColor={CHILLYWOOD_VISUAL.textMuted} style={styles.input} />
        <Button label="Assign tracking to this order" disabled={busy || !!error || !/^[A-Za-z0-9]{6,64}$/.test(number.trim())} onPress={() => void save()} />
      </> : <Text style={styles.body}>{manage ? "Tracking assignment is available after payment is confirmed." : "The seller has not assigned tracking yet."}</Text>}
    </> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    <Button label="Refresh shipment tracking" disabled={busy} onPress={() => void load()} />
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: CHILLYWOOD_VISUAL.controlBorder },
  heading: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 17, fontWeight: "600" },
  body: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 14 }, notice: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 13, lineHeight: 19 },
  error: { color: "#ffaaaa", fontSize: 14 }, row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  button: { backgroundColor: CHILLYWOOD_VISUAL.controlBackground, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  selected: { backgroundColor: CHILLYWOOD_VISUAL.accentPurple }, disabled: { opacity: 0.45 },
  buttonText: { color: CHILLYWOOD_VISUAL.textPrimary, fontWeight: "600" },
  input: { color: CHILLYWOOD_VISUAL.textPrimary, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, padding: 12, borderRadius: 8 },
});
