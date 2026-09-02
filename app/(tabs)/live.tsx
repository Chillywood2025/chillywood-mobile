import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getDiscoveryAccessLabel,
  getDiscoveryItemDestination,
  readRankedPublicDiscoveryFeedItems,
  type DiscoveryFeedItem,
} from "../../_lib/discoveryFeed";
import { readLatestPublicEventSummaries, type CreatorEventSummary } from "../../_lib/liveEvents";
import {
  getRuntimeControlBlockedCopy,
  isRuntimeControlBlockedAccess,
  LIVE_FIRST_PREMIUM_UPSELL_COPY,
  requireLiveFirstPremium,
  type PremiumWatchPartyFeatureAccessDecision,
} from "../../_lib/premiumWatchPartyAccess";
import { AccessSheet, type AccessSheetActionFeedback } from "../../components/monetization/access-sheet";
import { MainTabTopBar } from "../../components/navigation/main-tab-top-bar";

const CHILLYWOOD_BACKGROUND_SOURCE = require("../../assets/images/chillywood-branded-background.png");

const formatDateTime = (value?: string | null) => {
  const timestamp = Date.parse(String(value ?? "").trim());
  if (!Number.isFinite(timestamp)) return "Time not set";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
};

const formatEventMode = (event: CreatorEventSummary) => {
  if (event.eventType === "live_watch_party") return "Live Watch-Party";
  if (event.eventType === "watch_party_live") return "Watch-Party Live";
  return "Live First";
};

export default function LiveTabScreen() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [premiumGate, setPremiumGate] = useState<PremiumWatchPartyFeatureAccessDecision | null>(null);
  const [premiumGateVisible, setPremiumGateVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [discoveryItems, setDiscoveryItems] = useState<DiscoveryFeedItem[]>([]);
  const [events, setEvents] = useState<CreatorEventSummary[]>([]);

  const liveItems = useMemo(
    () => discoveryItems.filter((item) => item.live_state === "live").slice(0, 10),
    [discoveryItems],
  );
  const liveEvents = useMemo(() => events.filter((event) => event.isLiveNow).slice(0, 8), [events]);
  const upcomingEvents = useMemo(() => events.filter((event) => event.isUpcoming).slice(0, 10), [events]);

  const loadLive = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setErrorMsg(null);

    try {
      const [rankedDiscovery, publicEvents] = await Promise.all([
        readRankedPublicDiscoveryFeedItems({ surface: "home", limit: 40 }),
        readLatestPublicEventSummaries({ limit: 32 }),
      ]);
      setDiscoveryItems(rankedDiscovery.items);
      setEvents(publicEvents);
    } catch {
      setDiscoveryItems([]);
      setEvents([]);
      setErrorMsg("Live discovery could not refresh right now. Pull down to try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLive(false);
    }, [loadLive]),
  );

  const openLiveWatchParty = async () => {
    const access = await requireLiveFirstPremium({ accessKey: "bottom-live-tab" }).catch(() => null);
    if (!access?.allowed) {
      if (isRuntimeControlBlockedAccess(access)) {
        const copy = getRuntimeControlBlockedCopy(access);
        Alert.alert(copy.title, copy.message);
        return;
      }
      if (access) {
        setPremiumGate(access);
        setPremiumGateVisible(true);
      } else {
        router.push({ pathname: "/subscribe", params: { source: "bottom-live-tab" } });
      }
      return;
    }
    router.push({ pathname: "/watch-party", params: { mode: "live", source: "bottom-live-tab" } });
  };

  const recheckLiveAccessAfterPremiumAction = async (): Promise<AccessSheetActionFeedback> => {
    const access = await requireLiveFirstPremium({ accessKey: "bottom-live-tab" }).catch(() => null);
    if (access?.allowed) {
      setPremiumGate(null);
      setPremiumGateVisible(false);
      router.push({ pathname: "/watch-party", params: { mode: "live", source: "bottom-live-tab" } });
      return { message: "Premium is active. Opening Live...", tone: "success" };
    }
    if (access) setPremiumGate(access);
    return {
      message: access?.monetization.issues[0]
        ?? "Premium purchase was checked, but entitlement readback is not active yet. Recheck access after sync completes.",
      tone: "error",
    };
  };

  const openEvent = (eventId?: string | null) => {
    const id = String(eventId ?? "").trim();
    if (!id) return;
    router.push({ pathname: "/event/[eventId]", params: { eventId: id } });
  };

  const openDiscoveryItem = (item: DiscoveryFeedItem) => {
    router.push(getDiscoveryItemDestination(item) as any);
  };

  const totalLiveNow = liveItems.length + liveEvents.length;

  return (
    <ImageBackground source={CHILLYWOOD_BACKGROUND_SOURCE} style={styles.screenBackground} resizeMode="cover">
      <View style={styles.backgroundOverlay} pointerEvents="none" />
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadLive(true)} tintColor="#E50914" />}
        >
          <MainTabTopBar surface="live" label="LIVE" style={styles.mainTabTopBar} />
          <View style={styles.heroHeader}>
            <View style={styles.heroTopRow}>
              <Text style={styles.kicker}>LIVE HUB</Text>
              <View style={styles.statusPill}>
                <View style={styles.statusDot} />
                <Text style={styles.statusPillText}>{loading ? "Checking" : `${totalLiveNow} live`}</Text>
              </View>
            </View>
            <Text style={styles.title}>Live</Text>
            <Text style={styles.heroSubtitle}>Watch what is live now, see upcoming events, start a people-first room, or enter a Watch-Party code.</Text>
          </View>

          {errorMsg ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Live discovery unavailable</Text>
              <Text style={styles.errorBody}>{errorMsg}</Text>
              <Pressable style={styles.secondaryButton} onPress={() => void loadLive(true)} accessibilityRole="button">
                <Text style={styles.buttonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.quickActions}>
            <Pressable style={styles.primaryButton} onPress={() => void openLiveWatchParty()} accessibilityRole="button" testID="live-tab-open-live-button">
              <MaterialIcons name="videocam" size={19} color="#FFFFFF" />
              <Text style={styles.buttonText}>Start Live</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.push({ pathname: "/watch-party", params: { source: "bottom-live-tab" } })}
              accessibilityRole="button"
              testID="live-tab-enter-code-button"
            >
              <MaterialIcons name="confirmation-number" size={18} color="#FFFFFF" />
              <Text style={styles.buttonText}>Enter Code</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push("/(tabs)/explore")} accessibilityRole="button">
              <MaterialIcons name="explore" size={18} color="#FFFFFF" />
              <Text style={styles.buttonText}>Explore</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Live Now</Text>
              <Text style={styles.sectionMeta}>{totalLiveNow} available</Text>
            </View>
            {loading ? (
              <View style={styles.loadingRow}><ActivityIndicator color="#E50914" /><Text style={styles.muted}>Loading live discovery...</Text></View>
            ) : liveItems.length || liveEvents.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {liveItems.map((item) => {
                  const title = String(item.title ?? "").trim() || "Live Now";
                  return (
                    <TouchableOpacity key={`live-${item.id}`} style={styles.discoveryCard} activeOpacity={0.88} onPress={() => openDiscoveryItem(item)} accessibilityRole="button" accessibilityLabel={`Open ${title}`}>
                      <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>
                      <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
                      <Text style={styles.cardBody} numberOfLines={2}>{String(item.subtitle ?? "").trim() || "Public live experience"}</Text>
                      <Text style={styles.cardMeta}>{getDiscoveryAccessLabel(item)}</Text>
                    </TouchableOpacity>
                  );
                })}
                {liveEvents.map((event) => (
                  <TouchableOpacity key={`event-${event.id}`} style={styles.discoveryCard} activeOpacity={0.88} onPress={() => openEvent(event.id)} accessibilityRole="button" accessibilityLabel={`Open ${event.eventTitle}`}>
                    <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE EVENT</Text></View>
                    <Text style={styles.cardTitle} numberOfLines={2}>{event.eventTitle}</Text>
                    <Text style={styles.cardBody}>{formatEventMode(event)}</Text>
                    <Text style={styles.cardMeta}>Open Event</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>Nothing public is live right now</Text>
                <Text style={styles.emptyStateBody}>Pull down to refresh, start your own Live room, or Explore other content.</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Events</Text>
              <Text style={styles.sectionMeta}>{upcomingEvents.length} scheduled</Text>
            </View>
            {upcomingEvents.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {upcomingEvents.map((event) => (
                  <TouchableOpacity key={`upcoming-${event.id}`} style={styles.discoveryCard} activeOpacity={0.88} onPress={() => openEvent(event.id)} accessibilityRole="button" accessibilityLabel={`Open ${event.eventTitle}`}>
                    <View style={styles.upcomingBadge}><Text style={styles.upcomingBadgeText}>UPCOMING</Text></View>
                    <Text style={styles.cardTitle} numberOfLines={2}>{event.eventTitle}</Text>
                    <Text style={styles.cardBody}>{formatEventMode(event)}</Text>
                    <Text style={styles.cardMeta}>{formatDateTime(event.startsAt)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>No upcoming public events yet</Text>
                <Text style={styles.emptyStateBody}>Scheduled public creator events will appear here automatically.</Text>
              </View>
            )}
          </View>

          <View style={styles.disclosureCard}>
            <Pressable
              style={styles.disclosureHeader}
              onPress={() => setDetailsOpen((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={detailsOpen ? "Hide how Live works" : "Show how Live works"}
              accessibilityState={{ expanded: detailsOpen }}
              testID="live-tab-how-live-works-toggle"
            >
              <View style={styles.disclosureCopy}>
                <Text style={styles.disclosureTitle}>How Live works</Text>
                <Text style={styles.disclosureSubtitle}>Choose the path that matches what you want to do.</Text>
              </View>
              <MaterialIcons name={detailsOpen ? "expand-less" : "expand-more"} size={26} color="#FFFFFF" />
            </Pressable>
            {detailsOpen ? (
              <View style={styles.detailList}>
                <Text style={styles.detailText}>Start Live opens the people-first Live Watch-Party path.</Text>
                <Text style={styles.detailText}>Enter Code joins an existing Watch-Party Live room.</Text>
                <Text style={styles.detailText}>Live Now is backed by public discovery and public creator-event data.</Text>
                <Text style={styles.detailText}>Upcoming Events opens the exact Event so viewers can see its access and schedule.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      {premiumGate?.reason === "premium_required" ? (
        <AccessSheet
          visible={premiumGateVisible}
          reason="premium_required"
          gate={premiumGate}
          premiumUpsellTitle={LIVE_FIRST_PREMIUM_UPSELL_COPY.title}
          premiumUpsellBody={LIVE_FIRST_PREMIUM_UPSELL_COPY.message}
          sheetTestID="live-tab-premium-gate-sheet"
          primaryActionTestID="live-tab-start-sandbox-premium-test"
          recheckActionTestID="live-tab-premium-recheck-access"
          onPurchaseResult={(result) => result.ok ? recheckLiveAccessAfterPremiumAction() : { message: result.message, tone: "error" as const }}
          onRestoreResult={(result) => result.ok ? recheckLiveAccessAfterPremiumAction() : { message: result.message, tone: "error" as const }}
          onClose={() => setPremiumGateVisible(false)}
        />
      ) : null}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screenBackground: { flex: 1, backgroundColor: "#050505" },
  backgroundOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.66)" },
  safe: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 112, gap: 14 },
  mainTabTopBar: { marginBottom: 2 },
  heroHeader: { gap: 8 },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  kicker: { color: "#FF9AA2", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  title: { color: "#FFFFFF", fontSize: 36, fontWeight: "900" },
  heroSubtitle: { color: "#C7CEDD", fontSize: 14, lineHeight: 20, fontWeight: "600" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.07)", paddingHorizontal: 10, paddingVertical: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#59E6A9" },
  statusPillText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryButton: { minHeight: 42, borderRadius: 12, backgroundColor: "#E50914", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 14 },
  secondaryButton: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)", backgroundColor: "rgba(255,255,255,0.08)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 14, alignSelf: "flex-start" },
  buttonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  section: { gap: 9 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  sectionMeta: { color: "#9DA7BB", fontSize: 10, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  rail: { gap: 10, paddingRight: 4 },
  discoveryCard: { width: 180, minHeight: 156, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.11)", backgroundColor: "rgba(10,12,18,0.9)", padding: 12, gap: 8 },
  liveBadge: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#E50914", paddingHorizontal: 8, paddingVertical: 4 },
  liveBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  upcomingBadge: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 8, paddingVertical: 4 },
  upcomingBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  cardTitle: { color: "#FFFFFF", fontSize: 15, lineHeight: 19, fontWeight: "900" },
  cardBody: { color: "#C7CEDD", fontSize: 12, lineHeight: 17, fontWeight: "600" },
  cardMeta: { color: "#FFB2B8", fontSize: 11, fontWeight: "800", marginTop: "auto" },
  loadingRow: { minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: "#AEB7C8", fontSize: 12, fontWeight: "700" },
  emptyState: { borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.035)", padding: 13, gap: 4 },
  emptyStateTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  emptyStateBody: { color: "#AEB7C8", fontSize: 12, lineHeight: 17, fontWeight: "600" },
  errorCard: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(229,9,20,0.32)", backgroundColor: "rgba(229,9,20,0.12)", padding: 13, gap: 8 },
  errorTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  errorBody: { color: "#FFDDE0", fontSize: 12, lineHeight: 17, fontWeight: "600" },
  disclosureCard: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.052)", overflow: "hidden" },
  disclosureHeader: { minHeight: 58, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  disclosureCopy: { flex: 1, gap: 2 },
  disclosureTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  disclosureSubtitle: { color: "#AEB7C8", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  detailList: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", padding: 13, gap: 7 },
  detailText: { color: "#D6DCEA", fontSize: 12, lineHeight: 17, fontWeight: "700" },
});
