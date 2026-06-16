import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatPaidCreatorEventPrice,
  purchasePaidCreatorEventPass,
  resolvePaidCreatorEventPassAccess,
  type PaidCreatorEventAccess,
} from "../../_lib/paidCreatorEvents";
import { supabase } from "../../_lib/supabase";

type EventRow = {
  id: string;
  event_title: string | null;
  event_type: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  host_user_id: string | null;
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

const formatEventType = (value: string | null) => {
  if (value === "watch_party_live") return "Watch-Party Event";
  if (value === "live_watch_party") return "Live Watch-Party Event";
  if (value === "live_first") return "Live Event";
  return "Creator Event";
};

const LOCKED_COPY =
  "This pass unlocks this creator event only. It does not include Premium, subscriptions, VIP, paid videos, Watch-Party rooms, other events, or other creator content.";

export default function PaidCreatorEventRoute() {
  const router = useRouter();
  const { eventId: eventIdParam } = useLocalSearchParams<{ eventId?: string }>();
  const eventId = normalizeText(Array.isArray(eventIdParam) ? eventIdParam[0] : eventIdParam);
  const [loading, setLoading] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [access, setAccess] = useState<PaidCreatorEventAccess | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const [{ data: eventRow, error: eventError }, accessResult] = await Promise.all([
      (supabase as any)
        .from("creator_events")
        .select("id,event_title,event_type,status,starts_at,ends_at,host_user_id")
        .eq("id", eventId)
        .maybeSingle(),
      resolvePaidCreatorEventPassAccess(eventId),
    ]);
    if (eventError) setError("Unable to load this event right now.");
    setEvent((eventRow as EventRow | null) ?? null);
    setAccess(accessResult);
    setLoading(false);
  };

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      setError("Missing event id.");
      return;
    }
    let active = true;
    const run = async () => {
      await load();
      if (!active) return;
    };
    void run();
    return () => {
      active = false;
    };
  }, [eventId]);

  const onBuyEventPass = async () => {
    if (!eventId || purchaseLoading) return;
    setPurchaseLoading(true);
    setNotice("");
    setError("");
    try {
      const result = await purchasePaidCreatorEventPass({
        creatorEventId: eventId,
        sourceSurface: "event_page",
      });
      setAccess(result.access);
      setNotice(result.message);
      if (result.ok) await load();
    } catch {
      setError("Event pass checkout is not available right now.");
    } finally {
      setPurchaseLoading(false);
    }
  };

  const offer = access?.offer ?? null;
  const locked = !!access && !access.allowed && access.requiresPurchase;
  const soldOut = access?.reason === "sold_out";
  const unavailable = !!access && !access.allowed && !access.requiresPurchase;
  const title = event?.event_title || offer?.title || "Creator event";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.wrap}>
        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color="#DC143C" />
            <Text style={styles.body}>Loading event access...</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.kicker}>PAID EVENT</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>
              {formatEventType(event?.event_type ?? offer?.eventType ?? null)} · Starts {formatDate(event?.starts_at ?? offer?.startsAt ?? null)}
            </Text>
            <View style={styles.detailGrid}>
              <Text style={styles.detail}>Status: {event?.status || offer?.status || "Unavailable"}</Text>
              <Text style={styles.detail}>Ends: {formatDate(event?.ends_at ?? offer?.endsAt ?? null)}</Text>
              {offer ? (
                <>
                  <Text style={styles.detail}>Price: {formatPaidCreatorEventPrice(offer.priceCents, offer.currency)}</Text>
                  <Text style={styles.detail}>Sandbox Test · Google Play · No live payout</Text>
                  <Text style={styles.detail}>
                    Passes: {offer.passesSold}{offer.capacityLimit ? ` / ${offer.capacityLimit}` : ""}
                  </Text>
                </>
              ) : null}
            </View>

            {access?.allowed ? (
              <View style={styles.stateBox}>
                <Text style={styles.stateTitle}>Event pass confirmed</Text>
                <Text style={styles.body}>
                  You can access this creator event. This pass does not grant Premium, VIP, paid videos, Watch-Party rooms, other events, LiveKit host controls, or payout authority.
                </Text>
                <Text style={styles.detail}>Access reason: {access.reason}</Text>
              </View>
            ) : locked ? (
              <View style={styles.stateBox}>
                <Text style={styles.stateTitle}>Event pass required</Text>
                <Text style={styles.body}>{LOCKED_COPY}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sandbox Test Buy Event Pass"
                  testID="tester-event-pass-button"
                  onPress={onBuyEventPass}
                  style={[styles.primaryButton, purchaseLoading && styles.buttonDisabled]}
                  disabled={purchaseLoading || soldOut}
                >
                  {purchaseLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{soldOut ? "Sold Out" : "Sandbox Test Event Pass"}</Text>
                  )}
                </Pressable>
              </View>
            ) : unavailable ? (
              <View style={styles.stateBox}>
                <Text style={styles.stateTitle}>Event Pass Not Available</Text>
                <Text style={styles.body}>
                  This paid event cannot be purchased right now. Reason: {access?.reason || "unavailable"}.
                </Text>
              </View>
            ) : (
              <View style={styles.stateBox}>
                <Text style={styles.stateTitle}>Open Event</Text>
                <Text style={styles.body}>
                  This event is not currently configured as a paid event pass. Premium is separate from creator event passes.
                </Text>
              </View>
            )}

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#05070D",
  },
  wrap: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 18,
  },
  card: {
    borderRadius: 18,
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
  stateBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 14,
    gap: 10,
  },
  stateTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  notice: {
    color: "#A7F3D0",
    fontSize: 12,
    fontWeight: "800",
  },
  error: {
    color: "#FFB4C8",
    fontSize: 12,
    fontWeight: "800",
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC143C",
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});
