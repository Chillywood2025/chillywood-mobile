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
  formatChannelSubscriptionPrice,
  purchaseChannelSubscription,
  resolveChannelSubscriptionAccess,
  type ChannelSubscriptionAccess,
} from "../../_lib/channelSubscriptions";
import { CREATOR_MONEY_ROUTE_TARGETS } from "../../_lib/creatorMonetizationRouteTargets";
import { resolvePlatformDisplayIdentity } from "../../_lib/platformIdentity";
import { buildUserChannelProfile, readUserProfileByUserId } from "../../_lib/userData";
import { useSession } from "../../_lib/session";
import { MoneyScopeInfoButton } from "../../components/monetization/MoneyScopeInfoButton";
import { MoneyScopeStrip, MoneyStatusChip } from "../../components/monetization/money-ui";

const normalizeParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

export default function ChannelSubscriptionScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ creatorId?: string | string[] }>();
  const creatorId = normalizeParam(params.creatorId);
  const { isLoading: sessionLoading, user } = useSession();
  const viewerUserId = String(user?.id ?? "").trim();
  const isOwner = !!creatorId && viewerUserId === creatorId;
  const [access, setAccess] = useState<ChannelSubscriptionAccess | null>(null);
  const [creatorName, setCreatorName] = useState("Creator");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAccess = async () => {
    if (!creatorId || sessionLoading) return;
    setLoading(true);
    setNotice(null);
    const [nextAccess, profile] = await Promise.all([
      resolveChannelSubscriptionAccess(creatorId).catch(() => null),
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

  const handleSubscribe = async () => {
    if (!creatorId || busy) return;
    if (isOwner) {
      Alert.alert("Owner preview", "You manage this creator subscription from Platform Studio. Owners cannot buy their own creator subscription.");
      return;
    }
    if (!viewerUserId) {
      Alert.alert("Subscribe", "Sign in to subscribe to this creator Platform.");
      return;
    }
    try {
      setBusy(true);
      const result = await purchaseChannelSubscription({
        creatorId,
        sourceSurface: "creator_channel_subscriber_area",
      });
      setAccess(result.access);
      setNotice(result.message);
      if (!result.ok) {
        Alert.alert("Subscribe", result.message);
      }
    } catch (error) {
      Alert.alert(
        "Subscribe",
        error instanceof Error && error.message
          ? error.message
          : "Platform Subscription checkout is not available right now.",
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
  const subscribed = access?.allowed === true || isOwner;
  const needsPurchase = !isOwner && access?.requiresPurchase === true && !!offer;

  return (
    <View style={styles.screen} testID="screen-channel-subscription">
      <ScrollView
        testID="subscriber-area-screen"
        contentContainerStyle={[styles.content, { paddingTop: safeAreaInsets.top + 18, paddingBottom: safeAreaInsets.bottom + 32 }]}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.82} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Platform Subscription</Text>
        </View>

        {loading || sessionLoading ? (
          <View style={styles.card}>
            <ActivityIndicator color="#DC143C" />
            <Text style={styles.body}>Checking subscriber status...</Text>
          </View>
        ) : subscribed ? (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.kicker}>{isOwner ? "Owner preview" : "Subscribed"}</Text>
              <MoneyStatusChip
                label={isOwner ? "Owner preview" : "Subscribed"}
                tone={isOwner ? "premium" : "success"}
                testID={isOwner ? "subscriber-area-owner-preview-badge" : "subscriber-area-subscribed-badge"}
              />
            </View>
            <Text style={styles.title}>Platform Subscription active</Text>
            <Text style={styles.platformName}>{creatorName}</Text>
	            <Text style={styles.body}>
	              {"Your recurring creator subscription is active for this Platform and includes this creator's ordinary Paid Videos while access remains active."}
	            </Text>
            <MoneyScopeStrip
              includes="Creator subscriber access and this creator's ordinary Paid Videos while the subscription is active."
              excludes="VIP-only content, Chi'llywood Premium, paid Watch-Party Seat Passes, Event Passes, LiveKit authority, payouts, or other creators."
              includesTestID="subscriber-area-includes-list"
              excludesTestID="subscriber-area-does-not-include-list"
            />
            <MoneyScopeInfoButton scope="channel_subscription" label="What does this include?" />
            {access?.currentPeriodEnd ? (
              <Text style={styles.meta}>Current period ends {new Date(access.currentPeriodEnd).toLocaleString()}.</Text>
            ) : null}
            <Text style={styles.meta}>Included video access ends when the subscription becomes inactive. Paid Videos purchased separately keep their own grant lifecycle.</Text>
            <Text style={styles.meta}>{"This does not include Chi'llywood Premium or VIP-only content."}</Text>
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateTitle}>No subscriber-only posts yet</Text>
              <Text style={styles.emptyStateBody}>{isOwner ? "Subscriber-only posts can be managed from Platform Studio when the post system is backed." : "Subscriber-only posts coming later."}</Text>
            </View>
            {isOwner ? (
              <View style={styles.ownerActionStack}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  activeOpacity={0.86}
                  onPress={() => router.push(CREATOR_MONEY_ROUTE_TARGETS.platformSubscription.ownerTarget as unknown as Parameters<typeof router.push>[0])}
                  testID="subscriber-area-manage-offer-button"
                  accessibilityRole="button"
                  accessibilityLabel="Manage subscription offer"
                >
                  <Text style={styles.secondaryButtonText}>Manage subscription offer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ghostButton}
                  activeOpacity={0.86}
                  onPress={openPublicPreview}
                  testID="subscriber-area-preview-button"
                  accessibilityRole="button"
                  accessibilityLabel="Preview subscriber experience"
                >
                  <Text style={styles.ghostButtonText}>Preview subscriber experience</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.card} testID="subscriber-area-access-denied-state">
            <Text style={styles.kicker}>Platform Subscription required</Text>
            <Text style={styles.title}>{offer?.title ?? "Platform Subscription"}</Text>
            <Text style={styles.body}>
              {needsPurchase
                ? `Start a recurring Platform Subscription to ${creatorName}'s Platform for ${formatChannelSubscriptionPrice(offer.priceCents, offer.currency)}. While active, it includes this creator's subscriber access and ordinary Paid Videos. It does not include VIP-only content, Premium, paid Watch-Party Seat Passes, Event Passes, or other creators.`
                : "Platform Subscription purchases are temporarily unavailable while setup is being finalized. Subscriber access stays locked until access is verified."}
            </Text>
            <MoneyScopeStrip
              includes="Subscriber access and this creator's ordinary Paid Videos while active."
              excludes="VIP-only content, Premium, Watch-Party Seat Passes, Event Passes, payouts, and other creators stay separate."
            />
            <MoneyScopeInfoButton scope="channel_subscription" label="What does this unlock?" />
            {notice ? <Text style={styles.meta}>{notice}</Text> : null}
            <View style={styles.ownerActionStack}>
              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                activeOpacity={0.86}
                disabled={busy}
                onPress={needsPurchase ? handleSubscribe : loadAccess}
                testID="subscriber-area-subscribe-button"
                accessibilityRole="button"
                accessibilityLabel={needsPurchase ? "Start Platform Subscription" : "Refresh Platform Subscription status"}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{needsPurchase ? "Start Platform Subscription" : "Refresh status"}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.86}
                onPress={openPublicPreview}
                testID="subscriber-area-back-to-channel-button"
                accessibilityRole="button"
                accessibilityLabel="Back to creator channel"
              >
                <Text style={styles.secondaryButtonText}>Back to channel</Text>
              </TouchableOpacity>
            </View>
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
