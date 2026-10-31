import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIsFocused } from "@react-navigation/native";
import { Pressable, Text, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { COMMERCE_READINESS_FEATURES, COMMERCE_READINESS_REASONS, readOwnerCommerceReadiness, type OwnerCommerceReadinessItem } from "../../_lib/ownerCommerceReadiness";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

const snapshotKey = () => {
  const session = getCurrentAccountSessionAuthoritySnapshot();
  return session && !session.restoreOnly ? JSON.stringify(session) : "";
};
// The host supplies verified Owner membership; the RPC independently enforces it.
export function OwnerCommerceReadinessPanel({ isOwner, ownerSessionKey }: { isOwner: boolean; ownerSessionKey: string }) {
  const sessionKey = useSyncExternalStore(subscribeToAccountSessionAuthority, snapshotKey, () => "");
  const focused = useIsFocused();
  const eligible = isOwner && focused && !!sessionKey && ownerSessionKey === sessionKey;
  const [state, setState] = useState<{ key: string; items: OwnerCommerceReadinessItem[] | null; busy: boolean; error: boolean }>({ key: "", items: null, busy: false, error: false });
  const generation = useRef(0);
  const retire = useCallback(() => {
    generation.current++;
    setState({ key: "", items: null, busy: false, error: false });
  }, []);
  const load = useCallback(async () => {
    if (!eligible) return;
    const ticket = ++generation.current;
    setState({ key: sessionKey, items: null, busy: true, error: false });
    try {
      const items = await readOwnerCommerceReadiness();
      if (ticket === generation.current && snapshotKey() === sessionKey) setState({ key: sessionKey, items, busy: false, error: false });
    } catch {
      if (ticket === generation.current && snapshotKey() === sessionKey) setState({ key: sessionKey, items: null, busy: false, error: true });
    }
  }, [eligible, sessionKey]);
  useEffect(() => {
    if (eligible) void load();
    return retire;
  }, [eligible, load, retire]);
  if (!eligible) return null;
  const current = state.key === sessionKey ? state : null;
  const body = { color: CHILLYWOOD_VISUAL.textMuted };
  return <View testID="owner-commerce-readiness" style={{ padding: 16, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.glassBorder, backgroundColor: CHILLYWOOD_VISUAL.glassBackground }}>
    <Text accessibilityRole="header" style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>Commerce setup · Owner only</Text>
    <Text style={body}>Read-only checklist for merchandise and auctions. This is not launch approval or payout authorization.</Text>
    {current?.busy || !current ? <Text accessibilityLiveRegion="polite" style={body}>Checking setup status…</Text> : null}
    {current?.error ? <Text accessibilityLiveRegion="polite" style={body}>Commerce setup status is unavailable. Nothing has been enabled. Refresh to try again.</Text> : null}
    {current?.items?.map(item => <View key={item.feature} style={{ gap: 4 }}>
      <Text style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>{COMMERCE_READINESS_FEATURES[item.feature]} · Blocked</Text>
      <Text style={body}>{COMMERCE_READINESS_REASONS[item.reason]}. Actual tax-service fees are not yet verified.</Text>
    </View>)}
    <Text style={body}>Registration evidence, sandbox verification, and app-store tax handling: not verified by this check. Provider configuration is not confirmed unless separately verified. Unknown does not mean no tax is due.</Text>
    <Text style={body}>Next: establish tax responsibility by sales type and location, then verify any required registration and provider setup. This panel cannot register, file, purchase a tax service, or turn on payments.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Refresh commerce setup status" disabled={current?.busy === true} onPress={() => void load()} style={{ paddingVertical: 10 }}>
      <Text style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>{current?.busy ? "Checking…" : "Refresh setup status"}</Text>
    </Pressable>
  </View>;
}
