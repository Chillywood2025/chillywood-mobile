import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  formatCreatorVipPassPrice,
  purchaseCreatorVipPass,
  resolveCreatorVipPassAccess,
  type CreatorVipPassAccess,
} from "../../_lib/creatorVipPasses";
import { CREATOR_MONEY_ROUTE_TARGETS } from "../../_lib/creatorMonetizationRouteTargets";
import { resolvePlatformDisplayIdentity } from "../../_lib/platformIdentity";
import { useSession } from "../../_lib/session";
import { buildUserChannelProfile, readUserProfileByUserId } from "../../_lib/userData";
import { MoneyScopeInfoButton } from "../../components/monetization/MoneyScopeInfoButton";
import { MoneyScopeStrip, MoneyStatusChip } from "../../components/monetization/money-ui";

const normalizeParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

export default function CreatorVipPassScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ creatorId?: string | string[] }>();
  const creatorId = normalizeParam(params.creatorId);
  const { isLoading: sessionLoading, user } = useSession();
  const viewerUserId = String(user?.id ?? "").trim();
  const isOwner = !!creatorId && viewerUserId === creatorId;
  const [access, setAccess] = useState<CreatorVipPassAccess | null>(null);
  const [creatorName, setCreatorName] = useState("Creator");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAccess = async () => {
    if (!creatorId || sessionLoading) return;
    setLoading(true);
    setNotice(null);
    const [nextAccess, profile] = await Promise.all([
      resolveCreatorVipPassAccess(creatorId).catch(() => null),
      readUserProfileByUserId(creatorId).catch(() => null),
    ]);
    setAccess(nextAccess);
    const channelProfile = buildUserChannelProfile({
      id: creatorId,
      profile,
      fallbackDisplayName: "Creator",
    });
    setCreatorName(resolvePlatformDisplayIdentity({
      channel: channelProfile,
      profile,
      fallbackDisplayName: "Untitled Platform",
    }).displayName);
    setLoading(false);
  };

  useEffect(() => {
    void loadAccess();
  }, [creatorId, sessionLoading]);

  const handleGetVip = async () => {
    if (!creatorId || busy) return;
    if (isOwner) {
      Alert.alert("Owner preview", "You manage VIP from Platform Studio. Owners cannot buy their own creator VIP pass.");
      return;
    }
    if (!viewerUserId) {
      Alert.alert("Get VIP", "Sign in to get VIP for this creator Platform.");
      return;
    }
    try {
      setBusy(true);
      const result = await purchaseCreatorVipPass({
        creatorId,
        sourceSurface: "creator_channel_vip_area",
      });
      setAccess(result.access);
      setNotice(result.message);
      if (!result.ok) {
        Alert.alert("Get VIP", result.message);
      }
    } catch (error) {
      Alert.alert(
        "Get VIP",
        error instanceof Error && error.message
          ? error.message
          : "VIP Pass checkout is not available right now.",
      );
      await loadAccess();
    } finally {
      setBusy(false);
    }
  };

  const openPublicPreview = () => {
    if (!creatorId) return;
    router.push({
      pathname: "/channel/[userId]",
      params: { userId: creatorId, preview: "public" },
    } as unknown as Parameters<typeof router.push>[0]);
  };

  const offer = access?.offer ?? null;
  const isVip = access?.allowed === true || isOwner;
  const needsPurchase = !isOwner && access?.requiresPurchase === true && !!offer;

  return (
    <View style={styles.screen} testID="screen-vip-pass">
      <ScrollView
        testID="vip-area-screen"
        contentContainerStyle={[styles.content, { paddingTop: safeAreaInsets.top + 18, paddingBottom: safeAreaInsets.bottom + 32 }]}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.82} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>VIP Area</Text>
        </View>

        {loading || sessionLoading ? (
          <View style={styles.card}>
            <ActivityIndicator color="#DC143C" />
            <Text style={styles.body}>Checking VIP status...</Text>
          </View>
        ) : isVip ? (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.kicker}>{isOwner ? "Owner preview" : "VIP active"}</Text>
              <MoneyStatusChip
                label={isOwner ? "Owner preview" : "VIP active"}
                tone={isOwner ? "premium" : "vip"}
                testID={isOwner ? "vip-area-owner-preview-badge" : "vip-area-active-badge"}
              />
            </View>
            <Text style={styles.title}>VIP Area</Text>
            <Text style={styles.platformName}>{creatorName}</Text>
            <Text style={styles.body}>
              VIP is active for this creator's Platform only.
            </Text>
            <MoneyScopeStrip
              includes="Creator-specific VIP access for this Platform."
              excludes="Chi'llywood Premium, subscriptions, paid videos, paid Watch-Party tickets, paid events, LiveKit authority, room permissions, payouts, or other creators."
              includesTestID="vip-area-includes-list"
              excludesTestID="vip-area-does-not-include-list"
            />
            <MoneyScopeInfoButton scope="vip_pass" label="What does VIP include?" />
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateTitle}>No VIP perks yet</Text>
              <Text style={styles.emptyStateBody}>{isOwner ? "VIP perks can be managed from Platform Studio when the perk system is backed." : "VIP perks coming later."}</Text>
            </View>
            {isOwner ? (
              <View style={styles.ownerActionStack}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  activeOpacity={0.86}
                  onPress={() => router.push(CREATOR_MONEY_ROUTE_TARGETS.vipPass.ownerTarget as unknown as Parameters<typeof router.push>[0])}
                  testID="vip-area-manage-offer-button"
                  accessibilityRole="button"
                  accessibilityLabel="Manage VIP offer"
                >
                  <Text style={styles.secondaryButtonText}>Manage VIP offer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ghostButton}
                  activeOpacity={0.86}
                  onPress={openPublicPreview}
                  testID="vip-area-preview-button"
                  accessibilityRole="button"
                  accessibilityLabel="Preview VIP experience"
                >
                  <Text style={styles.ghostButtonText}>Preview VIP experience</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.card} testID="vip-area-access-denied-state">
            <Text style={styles.kicker}>VIP access required</Text>
            <Text style={styles.title}>{offer?.title ?? "VIP Pass"}</Text>
            <Text style={styles.body}>
              {needsPurchase
                ? `Get VIP access for ${creatorName}'s Platform for ${formatCreatorVipPassPrice(offer.priceCents, offer.currency)}. VIP is creator-specific and does not include Chi'llywood Premium, paid videos, Watch-Party tickets, paid events, subscriptions, or other creators.`
                : "This creator has not enabled VIP yet."}
            </Text>
            <MoneyScopeStrip
              includes="Creator-specific VIP access for this Platform when active."
              excludes="Chi'llywood Premium, subscriptions, paid videos, Watch-Party tickets, paid events, room authority, payouts, and other creators stay separate."
            />
            <MoneyScopeInfoButton scope="vip_pass" label="What does this unlock?" />
            {notice ? <Text style={styles.meta}>{notice}</Text> : null}
            <Text style={styles.meta}>VIP does not unlock Chi'llywood Premium.</Text>
            {needsPurchase ? (
              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                activeOpacity={0.86}
                disabled={busy}
                onPress={handleGetVip}
                testID="vip-area-get-vip-button"
                accessibilityRole="button"
                accessibilityLabel="Get Creator VIP"
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Get VIP</Text>}
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07080D",
  },
  content: {
    paddingHorizontal: 18,
    gap: 18,
  },
  header: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  backButtonText: {
    color: "#F8FAFF",
    fontSize: 24,
    fontWeight: "900",
  },
  headerTitle: {
    color: "#F8FAFF",
    fontSize: 17,
    fontWeight: "900",
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(13,17,27,0.96)",
    padding: 18,
    gap: 12,
  },
  kicker: {
    color: "#F2C25B",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  title: {
    color: "#F8FAFF",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
  },
  platformName: {
    color: "#B9C8DE",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "900",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statusPill: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: "#BFFFE8",
    backgroundColor: "rgba(57,217,138,0.14)",
    fontSize: 11,
    fontWeight: "900",
  },
  statusPillOwner: {
    color: "#D6F8FF",
    backgroundColor: "rgba(126,215,255,0.16)",
  },
  body: {
    color: "#D7E2F3",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  meta: {
    color: "#9BA8BC",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
  },
  scopeGrid: {
    gap: 10,
  },
  scopeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    padding: 12,
    gap: 4,
  },
  scopeTitle: {
    color: "#F8FAFF",
    fontSize: 13,
    fontWeight: "900",
  },
  scopeBody: {
    color: "#AEB9CF",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  emptyStateCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.22)",
    backgroundColor: "rgba(242,194,91,0.08)",
    padding: 12,
    gap: 4,
  },
  emptyStateTitle: {
    color: "#F8FAFF",
    fontSize: 14,
    fontWeight: "900",
  },
  emptyStateBody: {
    color: "#B9C4D8",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  ownerActionStack: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC143C",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  ghostButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(126,215,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(126,215,255,0.18)",
    paddingHorizontal: 16,
  },
  ghostButtonText: {
    color: "#D6F8FF",
    fontSize: 15,
    fontWeight: "900",
  },
  buttonDisabled: {
    opacity: 0.72,
  },
});
