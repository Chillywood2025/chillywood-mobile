import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { readCreatorSubscriptionPriceRequests, type CreatorSubscriptionPriceRequest } from "../../_lib/creatorSubscriptionPriceRequests";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";
const styles = { card: { padding: 12, gap: 8, backgroundColor: CHILLYWOOD_VISUAL.glassBackground }, body: { color: CHILLYWOOD_VISUAL.textMuted } };
const labels = { pending_provisioning: "Pending store setup", approved: "Approved request", declined: "Declined", cancelled: "Cancelled" };
// Parent keys this panel to the exact authenticated session. Reads cannot grant
// purchase eligibility: only the available catalog prices control that.
export function SubscriptionPriceRequestStatus() {
  const [rows, setRows] = useState<CreatorSubscriptionPriceRequest[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const active = useRef(false), generation = useRef(0), latch = useRef(false);
  useFocusEffect(useCallback(() => { active.current = true; generation.current++; setRows(null); setError(false); setBusy(false); latch.current = false;
    return () => { active.current = false; generation.current++; setRows(null); }; }, []));
  const load = async () => {
    if (!active.current || latch.current) return;
    const ticket = generation.current; latch.current = true; setBusy(true); setError(false);
    try { const result = await readCreatorSubscriptionPriceRequests(); if (active.current && ticket === generation.current) setRows(result); }
    catch { if (active.current && ticket === generation.current) { setRows(null); setError(true); } }
    finally { if (active.current && ticket === generation.current) { latch.current = false; setBusy(false); } }
  };
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={busy ? "Checking price requests…" : rows ? "Refresh price requests" : "View my price requests"} disabled={busy} onPress={() => void load()}><Text style={{ color: CHILLYWOOD_VISUAL.textPrimary, paddingVertical: 10 }}>{busy ? "Checking price requests…" : rows ? "Refresh price requests" : "View my price requests"}</Text></Pressable>
    {error ? <Text accessibilityLiveRegion="polite" style={styles.body}>Price request status could not be loaded. Try again; this does not mean your request was lost.</Text> : null}
    {rows ? <><Text style={styles.body}>Latest 50 requests. Up to five may be pending at once. Approval alone does not enable sales; choose a verified available price above.</Text>
      {!rows.length ? <Text style={styles.body}>No recorded price requests.</Text> : null}
      {rows.map(row => <Text key={row.id} style={styles.body}>${(row.amountMinor / 100).toFixed(2)} USD monthly · {labels[row.status]} · {new Date(row.createdAt).toLocaleDateString()}</Text>)}
    </> : null}
  </View>;
}
