import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COGNITIVE_OWNER_CONTROL_CENTER_FOUNDATION } from "../../_lib/cognitivePlatformFoundation";
import {
  parseLiveCognitiveStatusResponse,
  type LiveCognitiveStatus,
} from "../../_lib/cognitiveAdminStatus";
import { supabase } from "../../_lib/supabase";

const REQUIRED_READ_PERMISSION = "admin.cognitive.read";

const SOURCE_STATUS_ROWS = [
  ["System", "product_intelligence_operator"],
  ["Activation", "Off"],
  ["Deployment", "Collective governance source complete · not deployed"],
  ["Scheduler", "None"],
  ["Model credential", "None"],
  ["Tool credential", "None"],
  ["Database", "No live memory · local migration only"],
  ["Research", "No live research"],
  ["Execution", "No execution authority"],
  ["Evaluator", "No live evaluator"],
] as const;

export const CognitiveControlCenterFoundation = () => {
  const [liveStatus, setLiveStatus] = useState<LiveCognitiveStatus | null>(null);
  const [readbackState, setReadbackState] = useState<"loading" | "live" | "source_only">("loading");

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const { data, error } = await supabase.functions.invoke(
        "cognitive-governance-control",
        { body: { action: "status" } },
      );
      if (cancelled) return;
      const status = error ? null : parseLiveCognitiveStatusResponse(data);
      if (!status) {
        setReadbackState("source_only");
        return;
      }
      setLiveStatus(status);
      setReadbackState("live");
    };
    void read();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusRows = useMemo(() => {
    if (!liveStatus) return SOURCE_STATUS_ROWS;
    return [
      ["System", "product_intelligence_operator"],
      ["Readback", "Live backend status"],
      ["Deployment", liveStatus.deploymentState],
      ["Scheduler", liveStatus.schedulerState],
      ["Emergency stop", liveStatus.emergencyStop ? "Active" : "Inactive"],
      ["Pending approvals", String(liveStatus.pendingApprovalCount)],
      ["Decision manifests", String(liveStatus.latestDecisionCount)],
      [
        "Public research",
        liveStatus.switches.cognitive_research_enabled ? "Enabled" : "Off",
      ],
      [
        "Collective deliberation",
        liveStatus.switches.cognitive_collective_deliberation_enabled
          ? "Enabled"
          : "Off",
      ],
      [
        "Draft-PR executor",
        liveStatus.switches.cognitive_draft_pr_executor_enabled
          ? "Enabled"
          : "Off",
      ],
      ["Level 2 repairs", "Off"],
      ["User-derived memory", "Off"],
    ] as const;
  }, [liveStatus]);

  return (
  <View testID="admin-cognitive-control-center" style={styles.surface}>
    <View style={styles.hero}>
      <Text style={styles.kicker}>
        {readbackState === "live" ? "LIVE BACKEND READBACK · READ ONLY" : "SOURCE MANIFEST · READ ONLY"}
      </Text>
      <Text style={styles.title}>Cognitive Intelligence Foundation</Text>
      <Text style={styles.body}>
        {readbackState === "live"
          ? "Backend-authoritative cognitive status. This screen exposes no credential and grants no execution authority."
          : "This source manifest describes an undeployed scaffold. It is not live system status and has no memory, research, evaluator, scheduler, credentials, or production authority."}
      </Text>
      <Text style={styles.muted}>
        Access contract: Owner, Super Admin, or a scoped Admin with {REQUIRED_READ_PERMISSION}. The future backend remains authoritative.
      </Text>
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {readbackState === "live" ? "LIVE READBACK" : "OFF"}
          </Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {readbackState === "live"
              ? liveStatus?.deploymentState.toUpperCase()
              : "NOT DEPLOYED"}
          </Text>
        </View>
        <View style={styles.pill}><Text style={styles.pillText}>NO SELF-APPROVAL</Text></View>
      </View>
    </View>

    <View style={styles.grid}>
      {statusRows.map(([label, value]) => (
        <View key={label} style={styles.statusRow}>
          <Text style={styles.statusLabel}>{label}</Text>
          <Text style={styles.statusValue}>{value}</Text>
        </View>
      ))}
    </View>

    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Owner readback</Text>
      <View style={styles.wrap}>
        {COGNITIVE_OWNER_CONTROL_CENTER_FOUNDATION.visibleSections.map((label) => (
          <View key={label} style={styles.readChip}><Text style={styles.readChipText}>{label}</Text></View>
        ))}
      </View>
    </View>

    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Future controls</Text>
      <Text style={styles.muted}>
        Visible for contract review only. Change controls remain disabled in this
        client; live state is read from the backend and cannot be changed here.
      </Text>
      <View style={styles.controlGrid}>
        {COGNITIVE_OWNER_CONTROL_CENTER_FOUNDATION.disabledControls.map((label) => (
          <TouchableOpacity
            key={label}
            testID={`cognitive-disabled-${label.replace(/\s+/gu, "-")}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            style={styles.disabledButton}
          >
            <Text style={styles.disabledText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>

    <View style={styles.boundary}>
      <Text style={styles.boundaryTitle}>Hard boundary</Text>
      <Text style={styles.boundaryText}>
        No money, user-rights, auth/RLS, moderation, public release, OTA, store, pricing, provider-product, or owner-role action.
      </Text>
    </View>
  </View>
  );
};

const styles = StyleSheet.create({
  surface: { gap: 14 },
  hero: { borderRadius: 22, padding: 20, gap: 8, backgroundColor: "rgba(20,16,35,0.96)", borderWidth: 1, borderColor: "rgba(197,96,255,0.45)" },
  kicker: { color: "#D9A7FF", fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: "#FFFFFF", fontSize: 30, fontWeight: "900" },
  body: { color: "#D7D2E1", fontSize: 15, lineHeight: 22 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.08)" },
  pillText: { color: "#F1E7FA", fontSize: 11, fontWeight: "800" },
  grid: { gap: 8 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", gap: 16, padding: 14, borderRadius: 14, backgroundColor: "rgba(10,10,18,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  statusLabel: { color: "#A9A2B4", fontSize: 13, fontWeight: "700" },
  statusValue: { color: "#FFFFFF", flex: 1, textAlign: "right", fontSize: 13, fontWeight: "800" },
  card: { gap: 10, borderRadius: 18, padding: 16, backgroundColor: "rgba(10,10,18,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  sectionTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  muted: { color: "#AAA3B5", lineHeight: 20 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  readChip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "rgba(82,192,255,0.12)" },
  readChipText: { color: "#BCE8FF", fontSize: 12, fontWeight: "700" },
  controlGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  disabledButton: { opacity: 0.48, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  disabledText: { color: "#D6D0DD", fontWeight: "800", textTransform: "capitalize" },
  boundary: { borderRadius: 16, padding: 16, backgroundColor: "rgba(110,18,38,0.35)", borderWidth: 1, borderColor: "rgba(255,77,110,0.45)" },
  boundaryTitle: { color: "#FFB3C2", fontSize: 15, fontWeight: "900", marginBottom: 4 },
  boundaryText: { color: "#F5DDE3", lineHeight: 20 },
});
