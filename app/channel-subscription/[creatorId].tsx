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
import { buildUserChannelProfile, readUserProfileByUserId } from "../../_lib/userData";
import { useSession } from "../../_lib/session";

const normalizeParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

export default function ChannelSubscriptionScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ creatorId?: string | string[] }>();
  const creatorId = normalizeParam(params.creatorId);
  const { isLoading: sessionLoading, user } = useSession();
  const viewerUserId = String(user?.id ?? "").trim();
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
    setCreatorName(buildUserChannelProfile({
      id: creatorId,
      profile,
      fallbackDisplayName: "Creator",
    }).displayName);
    setLoading(false);
  };

  useEffect(() => {
    void loadAccess();
  }, [creatorId, sessionLoading]);

  const handleSubscribe = async () => {
    if (!creatorId || busy) return;
    if (!viewerUserId) {
      Alert.alert("Subscribe", "Sign in to subscribe to this creator's channel.");
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
          : "Channel Subscription checkout is not available right now.",
      );
      await loadAccess();
    } finally {
      setBusy(false);
    }
  };

  const offer = access?.offer ?? null;
  const subscribed = access?.allowed === true;
  const needsPurchase = access?.requiresPurchase === true && !!offer;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: safeAreaInsets.top + 18, paddingBottom: safeAreaInsets.bottom + 32 }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.82} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscriber Area</Text>
        </View>

        {loading || sessionLoading ? (
          <View style={styles.card}>
            <ActivityIndicator color="#DC143C" />
            <Text style={styles.body}>Checking subscriber status...</Text>
          </View>
        ) : subscribed ? (
          <View style={styles.card}>
            <Text style={styles.kicker}>Subscribed</Text>
            <Text style={styles.title}>{creatorName}</Text>
	            <Text style={styles.body}>
	              {"Your creator channel subscription is active for this channel only. It does not unlock Chi'llwood Premium, VIP, paid videos, paid Watch-Party tickets, paid events, LiveKit authority, payouts, or other creators' channels."}
	            </Text>
            {access?.currentPeriodEnd ? (
              <Text style={styles.meta}>Current period ends {new Date(access.currentPeriodEnd).toLocaleString()}.</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.kicker}>Subscriber access required</Text>
            <Text style={styles.title}>{offer?.title ?? "Channel Subscription"}</Text>
            <Text style={styles.body}>
              {needsPurchase
                ? `Subscribe to ${creatorName}'s channel for ${formatChannelSubscriptionPrice(offer.priceCents, offer.currency)}. This does not include Chi'llwood Premium, VIP, paid videos, paid Watch-Party tickets, paid events, or other creators' channels.`
                : "This creator subscription is not available right now."}
            </Text>
            {notice ? <Text style={styles.meta}>{notice}</Text> : null}
            {needsPurchase ? (
              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                activeOpacity={0.86}
                disabled={busy}
                onPress={handleSubscribe}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Subscribe</Text>}
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
  buttonDisabled: {
    opacity: 0.72,
  },
});
