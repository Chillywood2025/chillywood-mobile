import React, { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { readMerchReturnQueue, type MerchReturnQueuePage } from "../../_lib/merchReturnCases";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";
// Parent exact-session gate remounts on account replacement. Queue contains only
// case references already readable by this subject, never shipping/payment PII.
export function MerchReturnQueue({ role }: { role: "creator" | "buyer" }) {
  const router = useRouter(), generation = useRef(0), active = useRef(false), latch = useRef(false);
  const [page, setPage] = useState<MerchReturnQueuePage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(false), [expanded, setExpanded] = useState(false);
  const load = useCallback(async (cursor: string | null = null) => {
    if (!active.current || latch.current) return;
    const ticket = generation.current; latch.current = true; setBusy(true); setError(false);
    try { const result = await readMerchReturnQueue(role, cursor); if (active.current && generation.current === ticket) setPage(result); }
    catch { if (active.current && generation.current === ticket) setError(true); }
    finally { if (active.current && generation.current === ticket) { latch.current = false; setBusy(false); } }
  }, [role]);
  useFocusEffect(useCallback(() => { active.current = true; generation.current++; latch.current = false; setPage(null); setExpanded(false); void load();
    return () => { active.current = false; generation.current++; latch.current = false; setPage(null); }; }, [load]));
  const button = (label: string, onPress: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={onPress}><Text style={{ color: CHILLYWOOD_VISUAL.textPrimary, paddingVertical: 10 }}>{label}</Text></Pressable>;
  return <View style={{ padding: 12, gap: 8, backgroundColor: CHILLYWOOD_VISUAL.glassBackground }}>
    {button(page ? `Unresolved return / delivery cases (${page.totalCount})` : "Check return / delivery cases", () => { setExpanded(true); void load(); })}
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: CHILLYWOOD_VISUAL.textMuted }}>Case queue could not be refreshed. Try again; previous results may have changed.</Text> : null}
    {expanded && page ? <>
      <Text style={{ color: CHILLYWOOD_VISUAL.textMuted }}>Open and escalated cases across all your orders. Refresh to discover new or changed cases. Case decisions do not issue refunds.</Text>
      {button("Refresh case queue", () => void load())}
      {!page.cases.length ? <Text style={{ color: CHILLYWOOD_VISUAL.textMuted }}>No unresolved cases on this page.</Text> : null}
      {page.cases.map(item => <View key={item.id}><Text style={{ color: CHILLYWOOD_VISUAL.textMuted }}>{item.kind} · {item.status} · Order {item.orderId}</Text>
        {button(`Open case ${item.id}`, () => router.push({ pathname: role === "creator" ? "/merch/studio" : "/merch/orders", params: { orderId: item.orderId, caseId: item.id } }))}</View>)}
      {page.nextCursor ? button("Next case page", () => void load(page.nextCursor)) : null}
    </> : null}
  </View>;
}
