import React from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { RouteBackedMonetizationProofConfig } from "../../_lib/routeBackedMonetizationVisualProof";
import { MoneyScopeInfoButton, type MoneyScopeKey } from "./MoneyScopeInfoButton";

type Props = {
  config: RouteBackedMonetizationProofConfig | null;
  surface: "paid_content" | "watch_party_ticket" | "live_access" | "live_seat" | "event_pass";
};

const SURFACE_COPY: Record<Props["surface"], { title: string; body: string }> = {
  paid_content: {
    title: "Paid content status",
    body: "Open the status path for this paid-access option. Tester-safe access can run where provider setup exists; live settlement stays off.",
  },
  watch_party_ticket: {
    title: "Watch-Party Seat Pass status",
    body: "Open the Seat Pass status path. Speaker controls still require host approval and no payout or publish authority is granted.",
  },
  live_access: {
    title: "Live access pass status",
    body: "Open the live access status path. It does not grant speaker, host, moderator, admin, or publish authority.",
  },
  live_seat: {
    title: "Live seat pass status",
    body: "Open the live seat status path. Host approval is still required for mic, camera, and publish.",
  },
  event_pass: {
    title: "Event pass status",
    body: "Open the event pass status path. Tester-safe purchase flows can run where provider setup exists; live settlement stays off.",
  },
};

const SCOPE_BY_SURFACE: Record<Props["surface"], MoneyScopeKey> = {
  event_pass: "event_pass",
  live_access: "live_watch_party_access_pass",
  live_seat: "live_watch_party_seat_pass",
  paid_content: "paid_creator_video",
  watch_party_ticket: "watch_party_ticket",
};

export function RouteBackedMonetizationProofCard({ config, surface }: Props) {
  const router = useRouter();
  if (!config) return null;
  const copy = SURFACE_COPY[surface];
  const safeFlags = [
    "Status flow active",
    "Tester-safe only",
    "Payouts off",
    "No cash-out",
    "No publish authority",
    "No host/admin authority",
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>MONEY FEATURE UNAVAILABLE</Text>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <MoneyScopeInfoButton scope={SCOPE_BY_SURFACE[surface]} label="What does this unlock?" />
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.86}
          onPress={() => router.push("/support" as Parameters<typeof router.push>[0])}
          accessibilityRole="button"
          accessibilityLabel="Open money support and status"
        >
          <Text style={styles.primaryButtonText}>Open status / support</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        <View style={styles.row}>
          <Text style={styles.label}>Product</Text>
          <Text style={styles.value}>{config.displayName || config.productType}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Tier</Text>
          <Text style={styles.value}>{config.priceLabel}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.value}>Status flow active</Text>
        </View>
      </View>
      <View style={styles.pills}>
        {safeFlags.map((flag) => (
          <View key={flag} style={styles.pill}>
            <Text style={styles.pillText}>{flag}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.finePrint}>
        Public purchase, payout, cash-out, publish, host, and admin authority are not enabled by this surface.
        {config.requiresHostApproval ? " Host approval is still required where applicable." : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(11,18,28,0.96)",
    padding: 14,
    gap: 9,
  },
  actionRow: {
    flexDirection: "row",
  },
  primaryButton: {
    borderRadius: 12,
    backgroundColor: "#E43D5C",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  kicker: {
    color: "#9ED6FF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  body: {
    color: "#D7DFEF",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  grid: {
    gap: 7,
  },
  row: {
    gap: 3,
  },
  label: {
    color: "#8E99AA",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  value: {
    color: "#F6F8FF",
    fontSize: 12,
    fontWeight: "800",
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(105,255,185,0.24)",
    backgroundColor: "rgba(25,120,83,0.18)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {
    color: "#BFFFE4",
    fontSize: 10,
    fontWeight: "900",
  },
  finePrint: {
    color: "#AEB8C8",
    fontSize: 10.5,
    fontWeight: "700",
    lineHeight: 15,
  },
});
