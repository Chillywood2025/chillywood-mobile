import React, { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { readCreatorAuctionHeldEarnings, type CreatorAuctionHeldPage } from "../../_lib/creatorAuctionHeldEarnings";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";
const reasons: Record<string, string> = {
  tax_service_fee_unverified: "Tax service fees still need verification",
  not_payable_source_only: "Payout release is not enabled", tax_unverified: "Tax amount needs verification", store_obligation_unverified: "Store obligations need verification",
  refund_adjustment_unverified: "Refund adjustments need verification", provider_balance_pending: "Provider funds are pending", payment_or_dispute_reconciliation: "Payment or dispute review is required",
  provider_costs_unverified: "Provider costs need verification", recipient_qualification_required: "Creator payout eligibility needs verification", fulfillment_or_qualification_review: "Fulfillment or eligibility review is required", provider_refresh_required: "Provider review needs refreshed verification", sandbox_not_payable: "Sandbox records are not payable", fulfillment_clearance_unqualified: "Fulfillment has not been cleared", adjustments_unqualified: "Adjustments need verification",
  observation_missing: "Verified costs have not been recorded", costs_unverified: "Verified costs have not been recorded",
};
const amount = (value: number | null) => value === null ? "Not yet verified" : `$${(value / 100).toFixed(2)} USD`;
// Separate observation-only card; never added to withdrawable ledger balances.
export function CreatorAuctionHeldEarnings() {
  const [page, setPage] = useState<CreatorAuctionHeldPage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const active = useRef(false), generation = useRef(0), latch = useRef(false);
  useFocusEffect(useCallback(() => { active.current = true; generation.current++; latch.current = false; setPage(null); setBusy(false); setError(false);
    return () => { active.current = false; generation.current++; setPage(null); }; }, []));
  const load = async (cursor: string | null = null) => {
    if (!active.current || latch.current) return;
    const ticket = generation.current; latch.current = true; setBusy(true); setError(false);
    try { const result = await readCreatorAuctionHeldEarnings(cursor); if (active.current && ticket === generation.current) setPage(result); }
    catch { if (active.current && ticket === generation.current) setError(true); }
    finally { if (active.current && ticket === generation.current) { latch.current = false; setBusy(false); } }
  };
  const body = { color: CHILLYWOOD_VISUAL.textMuted };
  const button = (label: string, cursor: string | null = null) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={() => void load(cursor)}><Text style={{ color: CHILLYWOOD_VISUAL.textPrimary, paddingVertical: 10 }}>{label}</Text></Pressable>;
  return <View testID="creator-auction-held-earnings" style={{ padding: 12, gap: 8, backgroundColor: CHILLYWOOD_VISUAL.glassBackground }}>
    <Text accessibilityRole="header" style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>Auction earnings under review</Text>
    <Text style={body}>Separate held observations, not available earnings. These amounts are not added to the balances above. No bank payout or cash-out is available here.</Text>
    {button(page ? "Refresh held auction details" : "View held auction details")}
    {error ? <Text accessibilityLiveRegion="polite" style={body}>Held auction details could not be refreshed. Try again; previous observations may have changed.</Text> : null}
    {page ? <>
      {!page.entries.length ? <Text style={body}>No auction settlement records on this page. This does not confirm that other earnings are available.</Text> : null}
      {page.entries.map(entry => <View key={entry.id} style={{ gap: 6 }}>
        <Text selectable style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>{entry.lane === "event" ? "Event auction" : "Room seat auction"} · {entry.id}</Text>
        <Text style={body}>Creator held estimate: {amount(entry.creatorMinor)} · Net after recorded costs: {amount(entry.netMinor)}</Text>
        {entry.recoveryObligationMinor !== null && entry.recoveryObligationMinor > 0 ? <Text style={body}>Recorded recovery adjustment: {amount(entry.recoveryObligationMinor)}. This is not a payable balance.</Text> : null}
        <Text style={body}>{entry.observedAt ? `Cost observation recorded ${new Date(entry.observedAt).toLocaleString()}.` : "Costs have not yet been verified."} {entry.lastCheckedAt ? `Provider review checked ${new Date(entry.lastCheckedAt).toLocaleString()}.` : "Provider review has not been recorded."} {entry.providerRefreshStatus === "fresh" ? "A recorded check is not payout authorization." : "Needs refreshed verification."}</Text>
        <Text style={body}>Why held: {[...new Set(entry.holdReasons.map(reason => reasons[reason] ?? "Additional verification is required")), "Payout release is not enabled"].filter((value,index,list) => list.indexOf(value) === index).join("; ")}.</Text>
      </View>)}
      {page.nextCursor ? button("Next held auction page", page.nextCursor) : null}
    </> : null}
  </View>;
}
