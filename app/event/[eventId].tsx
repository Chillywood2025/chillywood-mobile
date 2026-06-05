import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  readRouteBackedMonetizationProofConfig,
  type RouteBackedMonetizationProofConfig,
} from "../../_lib/routeBackedMonetizationVisualProof";
import { supabase } from "../../_lib/supabase";
import { RouteBackedMonetizationProofCard } from "../../components/monetization/route-backed-monetization-proof-card";

type EventRow = {
  id: string;
  event_title: string | null;
  event_type: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const formatDate = (value: string | null) => {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) return "Not scheduled";
  return new Date(parsed).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function EventPassVisualProofRoute() {
  const router = useRouter();
  const { eventId: eventIdParam } = useLocalSearchParams<{ eventId?: string }>();
  const eventId = normalizeText(Array.isArray(eventIdParam) ? eventIdParam[0] : eventIdParam);
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [proofConfig, setProofConfig] = useState<RouteBackedMonetizationProofConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      const [{ data: eventRow, error: eventError }, config] = await Promise.all([
        (supabase as any)
          .from("creator_events")
          .select("id,event_title,event_type,status,starts_at,ends_at")
          .eq("id", eventId)
          .maybeSingle(),
        readRouteBackedMonetizationProofConfig({
          sourceId: eventId,
          sourceTypes: ["event"],
        }).catch(() => null),
      ]);
      if (!active) return;
      if (eventError) setError("Unable to load the event proof route right now.");
      setEvent((eventRow as EventRow | null) ?? null);
      setProofConfig(config);
      setLoading(false);
    };
    if (eventId) void load();
    else {
      setLoading(false);
      setError("Missing event id.");
    }
    return () => {
      active = false;
    };
  }, [eventId]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color="#DC143C" />
            <Text style={styles.body}>Loading event pass gate proof...</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.kicker}>EVENT PASS</Text>
            <Text style={styles.title}>{event?.event_title || "Event pass gate"}</Text>
            <Text style={styles.body}>
              This route is a read-only event-pass visual proof surface. Event pass access is viewing/entry only and cannot grant
              LiveKit publish, host, speaker, moderator, admin, payout, cash-out, withdrawal, transfer, or payable balance authority.
            </Text>
            <View style={styles.detailGrid}>
              <Text style={styles.detail}>Status: {event?.status || "Unavailable"}</Text>
              <Text style={styles.detail}>Type: {event?.event_type || "event"}</Text>
              <Text style={styles.detail}>Starts: {formatDate(event?.starts_at ?? null)}</Text>
              <Text style={styles.detail}>Ends: {formatDate(event?.ends_at ?? null)}</Text>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <RouteBackedMonetizationProofCard config={proofConfig} surface="event_pass" />
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.button}>
              <Text style={styles.buttonText}>Back</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#05070D",
  },
  wrap: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,25,0.96)",
    padding: 18,
    gap: 12,
  },
  kicker: {
    color: "#F9A8C2",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    color: "#D6DEEF",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
  },
  detailGrid: {
    gap: 5,
  },
  detail: {
    color: "#AEB8CA",
    fontSize: 12,
    fontWeight: "800",
  },
  error: {
    color: "#FFB4C8",
    fontSize: 12,
    fontWeight: "800",
  },
  button: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});
