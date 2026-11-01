import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIsFocused } from "@react-navigation/native";
import { Pressable, Text, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { readOwnerReconciliationHealth, RECONCILIATION_ALERTS, type ReconciliationHealth } from "../../_lib/ownerReconciliationHealth";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

const snapshotKey = () => {
  const session = getCurrentAccountSessionAuthoritySnapshot();
  return session && !session.restoreOnly ? JSON.stringify(session) : "";
};
export function OwnerReconciliationHealthPanel({ isOwner, ownerSessionKey }: { isOwner: boolean; ownerSessionKey: string }) {
  const sessionKey = useSyncExternalStore(subscribeToAccountSessionAuthority, snapshotKey, () => "");
  const focused = useIsFocused();
  const eligible = isOwner && focused && !!sessionKey && ownerSessionKey === sessionKey;
  const [state, setState] = useState<{ key: string; health: ReconciliationHealth | null; busy: boolean; error: boolean }>({ key: "", health: null, busy: false, error: false });
  const generation = useRef(0);
  const retire = useCallback(() => {
    generation.current++;
    setState({ key: "", health: null, busy: false, error: false });
  }, []);
  const load = useCallback(async () => {
    if (!eligible) return;
    const ticket = ++generation.current;
    setState({ key: sessionKey, health: null, busy: true, error: false });
    try {
      const health = await readOwnerReconciliationHealth();
      if (ticket === generation.current && snapshotKey() === sessionKey) setState({ key: sessionKey, health, busy: false, error: false });
    } catch {
      if (ticket === generation.current && snapshotKey() === sessionKey) setState({ key: sessionKey, health: null, busy: false, error: true });
    }
  }, [eligible, sessionKey]);
  useEffect(() => { if (eligible) void load(); return retire; }, [eligible, load, retire]);
  if (!eligible) return null;
  const current = state.key === sessionKey ? state : null;
  const body = { color: CHILLYWOOD_VISUAL.textMuted };
  return <View testID="owner-reconciliation-health" style={{ padding: 16, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.glassBorder, backgroundColor: CHILLYWOOD_VISUAL.glassBackground }}>
    <Text accessibilityRole="header" style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>Merchandise checks · Owner only</Text>
    <Text style={body}>Sandbox cost-queue measurements and mode-bound shipment health. This does not enable payments, release earnings or certify live-provider capacity.</Text>
    {current?.busy || !current ? <Text accessibilityLiveRegion="polite" style={body}>Checking reconciliation health…</Text> : null}
    {current?.error ? <Text accessibilityLiveRegion="polite" style={body}>Reconciliation health is unavailable. Refresh to try again.</Text> : null}
    {current?.health ? <>
      <Text style={body}>Observed {new Date(current.health.observedAt).toLocaleString()}</Text>
      <Text style={body}>{current.health.eligible} eligible orders · {current.health.due} due · {current.health.assigned} tracked shipments</Text>
      <Text style={body}>Runs started in the last six hours: {current.health.runs}. Completed checks: {current.health.completed}. Incomplete checks: {current.health.incomplete}.</Text>
      {current.health.alerts.map(alert => <Text key={alert} accessibilityLiveRegion="polite" style={body}>{RECONCILIATION_ALERTS[alert]}</Text>)}
      {!current.health.alerts.length ? <Text style={body}>No current queue warnings. This is not financial clearance or a live-provider qualification.</Text> : null}
    </> : null}
    <Text style={body}>The health monitor sends new warnings and recovery notices to the owner’s in-app notifications. Push delivery follows account notification preferences and still needs device verification before unattended activation.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Refresh reconciliation health" disabled={current?.busy === true} onPress={() => void load()} style={{ paddingVertical: 10 }}>
      <Text style={{ color: CHILLYWOOD_VISUAL.textPrimary }}>{current?.busy ? "Checking…" : "Refresh reconciliation health"}</Text>
    </Pressable>
  </View>;
}
