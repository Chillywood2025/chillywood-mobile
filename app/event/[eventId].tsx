import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatPaidCreatorEventPrice,
  purchasePaidCreatorEventPass,
  resolvePaidCreatorEventPassAccess,
  type PaidCreatorEventAccess,
} from "../../_lib/paidCreatorEvents";
import { buildSafetyReportContext, submitSafetyReport } from "../../_lib/moderation";
import { createActionSingleFlightLatch } from "../../_lib/actionSingleFlight.mjs";
import { readCircleSpectatorFeedItems } from "../../_lib/circleSpectatorFeed";
import { formatOneTimePrice, resolveEventCustomerPresentation } from "../../_lib/customerExperiencePresentation";
import { readPublicDiscoveryFeedItems, type DiscoveryFeedItem } from "../../_lib/discoveryFeed";
import { supabase } from "../../_lib/supabase";
import { MoneyScopeInfoButton } from "../../components/monetization/MoneyScopeInfoButton";
import { MoneyOfferCard, MoneyScopeStrip, MoneyStatusChip, MoneySuccessReceipt } from "../../components/monetization/money-ui";
import { ReportSheet } from "../../components/safety/report-sheet";

type EventRow = {
  id: string;
  event_title: string | null;
  event_type: string | null;
  visibility: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  host_user_id: string | null;
};

type EventDestination = {
  itemId: string;
  kind: "live" | "replay";
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
  "An Event Pass gives access to this exact Event only. It does not include Party Room, Live Stage, a speaking seat, host/moderator authority, Chi'llywood Premium, subscriptions, VIP, paid videos, other Events, or other creator content.";

const unavailableEventPassCopy = (status: string | null | undefined) => {
  const normalized = normalizeText(status).toLowerCase();
  if (normalized === "ended" || normalized === "expired") {
    return "This Event Pass is no longer available because the event has ended or expired. Event access stays locked until access is verified.";
  }
  if (normalized === "canceled" || normalized === "cancelled") {
    return "This Event Pass is no longer available because the event was canceled. Event access stays locked until access is verified.";
  }
  if (normalized === "removed" || normalized === "unsafe" || normalized === "blocked") {
    return "This Event Pass is unavailable for safety or policy reasons. Event access stays locked until access is verified.";
  }
  return "Event Pass purchases are temporarily unavailable while setup is being finalized. Event access stays locked until access is verified.";
};

export default function PaidCreatorEventRoute() {
  const router = useRouter();
  const { eventId: eventIdParam } = useLocalSearchParams<{ eventId?: string }>();
  const eventId = normalizeText(Array.isArray(eventIdParam) ? eventIdParam[0] : eventIdParam);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [access, setAccess] = useState<PaidCreatorEventAccess | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [destination, setDestination] = useState<EventDestination | null>(null);
  const loadGenerationRef = useRef(0);
  const purchaseLatchRef = useRef(createActionSingleFlightLatch());

  const load = React.useCallback(async (options?: { preserveRendered?: boolean }) => {
    const generation = ++loadGenerationRef.current;
    if (options?.preserveRendered) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [{ data: eventRow, error: eventError }, accessResult, publicItems, circleItems] = await Promise.all([
        (supabase as any)
          .from("creator_events")
          .select("id,event_title,event_type,visibility,status,starts_at,ends_at,host_user_id")
          .eq("id", eventId)
          .maybeSingle(),
        resolvePaidCreatorEventPassAccess(eventId),
        readPublicDiscoveryFeedItems({ limit: 50 }).catch(() => [] as DiscoveryFeedItem[]),
        readCircleSpectatorFeedItems({ limit: 50 }).catch(() => [] as DiscoveryFeedItem[]),
      ]);
      if (generation !== loadGenerationRef.current) return;
      if (eventError) setError("Unable to load this Event right now.");
      const nextEvent = (eventRow as EventRow | null) ?? null;
      const eventItems = [...publicItems, ...circleItems]
        .filter((item) => normalizeText(item.event_id) === eventId);
      const liveItem = eventItems.find((item) => item.live_state === "live") ?? null;
      const replayItem = eventItems.find((item) => item.item_type === "replay_later") ?? null;
      setEvent(nextEvent);
      setAccess(accessResult);
      setDestination(liveItem
        ? { itemId: liveItem.id, kind: "live" }
        : replayItem
          ? { itemId: replayItem.id, kind: "replay" }
          : null);
    } catch {
      if (generation === loadGenerationRef.current) {
        setError("Unable to load this Event right now. Pull down to try again.");
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [eventId]);

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
      loadGenerationRef.current += 1;
    };
  }, [eventId, load]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && eventId) void load({ preserveRendered: true });
    });
    return () => subscription.remove();
  }, [eventId, load]);

  const onBuyEventPass = async () => {
    if (!eventId || !purchaseLatchRef.current.tryAcquire()) return;
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
      setError("Event Pass checkout is not available right now.");
    } finally {
      purchaseLatchRef.current.release();
      setPurchaseLoading(false);
    }
  };

  const offer = access?.offer ?? null;
  const locked = !!access && !access.allowed && access.requiresPurchase;
  const soldOut = access?.reason === "sold_out";
  const unavailable = !!access && !access.allowed && !access.requiresPurchase;
  const confirmedEventPass = !!access?.allowed
    && access.reason === "event_pass_confirmed"
    && !!access.passId;
  const creatorPreview = !!access?.allowed && access.reason === "creator_or_admin";
  const freeEvent = !!access?.allowed && access.reason === "free_event";
  const title = event?.event_title || offer?.title || "Creator event";
  const normalizedEventStatus = normalizeText(event?.status ?? offer?.status).toLowerCase();
  const terminalEventState = ["canceled", "cancelled", "ended", "replay_available", "expired"].includes(normalizedEventStatus);
  const accessUnavailable = unavailable && !terminalEventState;
  const hasEventAccess = confirmedEventPass || creatorPreview || freeEvent;
  const priceLabel = offer ? formatPaidCreatorEventPrice(offer.priceCents, offer.currency) : null;
  const oneTimePriceLabel = priceLabel ? formatOneTimePrice(priceLabel) : null;
  const customerState = resolveEventCustomerPresentation({
    status: event?.status ?? offer?.status,
    startsAt: event?.starts_at ?? offer?.startsAt,
    isPaid: !!offer,
    accessAllowed: hasEventAccess,
    requiresPurchase: locked,
    soldOut,
    priceLabel: oneTimePriceLabel,
    hasLiveDestination: destination?.kind === "live",
    hasReplayDestination: destination?.kind === "replay",
  });
  const canPurchaseEventPass = locked
    && !terminalEventState
    && customerState.action === "buy_pass";
  const audienceLabel = event?.visibility === "circle"
    ? "Chi'lly Circle Event"
    : event?.visibility === "private"
      ? "Private Event"
      : "Public Event";
  const openAuthorizedDestination = () => {
    if (!destination?.itemId) return;
    router.push(`/spectate/${encodeURIComponent(destination.itemId)}` as Parameters<typeof router.push>[0]);
  };

  const onSubmitEventReport = async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!eventId || reportBusy) return;
    setReportBusy(true);
    try {
      await submitSafetyReport({
        targetType: "event",
        targetId: eventId,
        category: input.category,
        note: input.note,
        context: buildSafetyReportContext({
          sourceSurface: "event-detail",
          sourceRoute: `/event/${eventId}`,
          targetLabel: title,
          targetRoleLabel: "Creator event",
          context: {
            eventType: event?.event_type ?? offer?.eventType ?? null,
            status: event?.status ?? offer?.status ?? null,
            hostUserId: event?.host_user_id ?? null,
            paidAccessReason: access?.reason ?? null,
          },
        }),
      });
      setReportVisible(false);
      Alert.alert("Report sent", "Thanks. The moderation team will review this event report.");
    } catch {
      Alert.alert("Report unavailable", "This event report could not be sent right now.");
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="screen-event">
      <ScrollView
        contentContainerStyle={styles.wrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load({ preserveRendered: true })} tintColor="#DC143C" />}
      >
        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color="#DC143C" />
            <Text style={styles.body}>Loading event access...</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.kicker}>EVENT</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{formatEventType(event?.event_type ?? offer?.eventType ?? null)}</Text>
            <View style={styles.detailGrid}>
              <Text style={styles.detail}>{audienceLabel}</Text>
              <Text style={styles.detail}>Starts {formatDate(event?.starts_at ?? offer?.startsAt ?? null)}</Text>
              <Text style={styles.detail}>Ends: {formatDate(event?.ends_at ?? offer?.endsAt ?? null)}</Text>
              {offer ? (
                <>
                  <Text style={styles.detail}>Event Pass · {oneTimePriceLabel}</Text>
                </>
              ) : null}
            </View>

            {confirmedEventPass ? (
              <View testID="event-pass-access-granted-state">
                <MoneySuccessReceipt
                  title="Event Pass active"
                  body="You have access to this Event. It does not grant generic Party Room or Live Stage access, speaking, host, moderator, camera, microphone, or LiveKit publish authority."
                  testID="event-pass-success-receipt"
                />
              </View>
            ) : null}

            {canPurchaseEventPass ? (
              <MoneyOfferCard
                testID="event-pass-lock-card"
                kicker="Event Pass"
                title={customerState.headline}
                price={oneTimePriceLabel}
                body={`${customerState.body} ${LOCKED_COPY}`}
                statusLabel={customerState.statusLabel}
                statusTone={soldOut ? "warning" : "premium"}
              >
                <MoneyScopeStrip
                  includes="Access to this creator event only."
                  excludes="Party Room Pass, Live Stage Pass, Live Stage Seat Pass, Chi'llywood Premium, VIP, subscriptions, paid videos, other Events, and host authority stay separate."
                />
                <MoneyScopeInfoButton scope="event_pass" label="What does this unlock?" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={customerState.actionLabel ?? "Get Event Pass"}
                  accessibilityState={{ disabled: purchaseLoading || soldOut, busy: purchaseLoading }}
                  testID="event-pass-purchase-button"
                  onPress={onBuyEventPass}
                  style={[styles.primaryButton, purchaseLoading && styles.buttonDisabled]}
                  disabled={purchaseLoading || soldOut}
                >
                  {purchaseLoading ? (
                    <View style={styles.busyRow}>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.primaryButtonText}>
                        {`Opening ${Platform.OS === "ios" ? "App Store" : "Google Play"}`}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryButtonText}>{soldOut ? "Sold Out" : customerState.actionLabel ?? "Get Event Pass"}</Text>
                  )}
                </Pressable>
              </MoneyOfferCard>
            ) : accessUnavailable ? (
              <View style={styles.stateBox} testID="event-pass-access-denied-state">
                <View style={styles.stateHeaderRow}>
                  <Text style={styles.stateTitle}>Event Pass Not Available</Text>
                  <MoneyStatusChip label="Unavailable" tone="warning" />
                </View>
                <Text style={styles.body}>
                  {unavailableEventPassCopy(event?.status || offer?.status || access?.reason)}
                </Text>
              </View>
            ) : event ? (
              <View style={styles.stateBox} testID={creatorPreview ? "event-creator-preview-state" : "event-customer-state"}>
                <View style={styles.stateHeaderRow}>
                  <Text style={styles.stateTitle}>{customerState.headline}</Text>
                  <MoneyStatusChip label={customerState.statusLabel} tone={customerState.action === "open_live" ? "success" : "neutral"} />
                </View>
                <Text style={styles.body}>{customerState.body}</Text>
                {customerState.action === "open_live" || customerState.action === "open_replay" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={customerState.actionLabel ?? "Open Event"}
                    testID={customerState.action === "open_live" ? "event-open-live-button" : "event-open-replay-button"}
                    onPress={openAuthorizedDestination}
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>{customerState.actionLabel}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.stateBox} testID="event-unavailable-state">
                <Text style={styles.stateTitle}>Event unavailable</Text>
                <Text style={styles.body}>This Event could not be found or is not available to this account.</Text>
              </View>
            )}

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Report event"
              testID="event-report-button"
              onPress={() => setReportVisible(true)}
              style={styles.reportButton}
            >
              <Text style={styles.reportButtonText}>Report Event</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              testID="event-back-button"
              onPress={() => router.back()}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <ReportSheet
        visible={reportVisible}
        title="Report event"
        description="Send a safety report for this event if it seems abusive, unsafe, fraudulent, infringing, or otherwise violates policy."
        busy={reportBusy}
        onSubmit={onSubmitEventReport}
        onClose={() => setReportVisible(false)}
      />
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
  stateHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
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
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  reportButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,180,200,0.3)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,20,60,0.08)",
    paddingHorizontal: 16,
  },
  reportButtonText: {
    color: "#FFD6E0",
    fontSize: 13,
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
