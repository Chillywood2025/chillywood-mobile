import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { MERCH_SHIPPING_ERROR, readMerchFulfillmentAddress, type MerchFulfillmentAddress } from "../../_lib/merchFulfillmentAddress";

type Props = { orderId: string; paymentStatus: string; refundedAmountMinor: number; fulfillmentStatus: string };
// The parent is exact-session keyed. A changed order/status also unmounts all PII.
export function MerchShippingDetails(props: Props) {
  if (props.paymentStatus !== "paid" || props.refundedAmountMinor !== 0 || ["blocked", "canceled"].includes(props.fulfillmentStatus)) return null;
  return <ShippingDetails key={`${props.orderId}:${props.paymentStatus}:${props.fulfillmentStatus}`} orderId={props.orderId} />;
}

function ShippingDetails({ orderId }: { orderId: string }) {
  const [details, setDetails] = useState<MerchFulfillmentAddress | null>(null);
  const [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const active = useRef(false), generation = useRef(0), latch = useRef(false);
  useFocusEffect(useCallback(() => {
    active.current = true; generation.current++; latch.current = false;
    setDetails(null); setError(false); setBusy(false);
    return () => { active.current = false; generation.current++; latch.current = false; setDetails(null); };
  }, []));
  const show = async () => {
    if (!active.current || latch.current) return;
    const ticket = ++generation.current;
    latch.current = true; setBusy(true); setDetails(null); setError(false);
    try {
      const result = await readMerchFulfillmentAddress(orderId);
      if (active.current && ticket === generation.current) setDetails(result);
    } catch { if (active.current && ticket === generation.current) setError(true); }
    finally { if (active.current && ticket === generation.current) { setBusy(false); latch.current = false; } }
  };
  const hide = () => { generation.current++; latch.current = false; setDetails(null); setError(false); setBusy(false); };
  return <View style={{ gap: 8 }}>
    <Text accessibilityRole="header" style={{ color: CHILLYWOOD_VISUAL.textPrimary, fontWeight: "600" }}>Shipping details</Text>
    <Text style={{ color: CHILLYWOOD_VISUAL.textMuted }}>Private checkout shipping details for this order only. Sandbox preview; no shipment is created.</Text>
    {details?.status === "available" ? <>
      {details.lines.map((line, index) => <Text key={index} selectable style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>{line}</Text>)}
      <Pressable accessibilityRole="button" accessibilityLabel="Hide shipping details" onPress={hide}><Text style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>Hide shipping details</Text></Pressable>
    </> : <Pressable accessibilityRole="button" accessibilityLabel="View shipping details" disabled={busy} onPress={() => void show()}><Text style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>View shipping details</Text></Pressable>}
    {busy ? <ActivityIndicator accessibilityLabel="Loading shipping details" /> : null}
    {details?.status === "unavailable" ? <Text style={{ color: CHILLYWOOD_VISUAL.textMuted }}>No verified shipping address is available. Do not guess a destination; contact support.</Text> : null}
    {details?.status === "review_required" ? <Text style={{ color: CHILLYWOOD_VISUAL.textMuted }}>Shipping details need review. Do not ship until support resolves the conflicting evidence.</Text> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: "#ffaaaa" }}>{MERCH_SHIPPING_ERROR}</Text> : null}
  </View>;
}
