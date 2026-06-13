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
import { useSession } from "../../_lib/session";
import { buildUserChannelProfile, readUserProfileByUserId } from "../../_lib/userData";

const normalizeParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

export default function CreatorVipPassScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ creatorId?: string | string[] }>();
  const creatorId = normalizeParam(params.creatorId);
  const { isLoading: sessionLoading, user } = useSession();
  const viewerUserId = String(user?.id ?? "").trim();
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

  const handleGetVip = async () => {
    if (!creatorId || busy) return;
    if (!viewerUserId) {
      Alert.alert("Get VIP", "Sign in to get VIP for this creator's channel.");
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

  const offer = access?.offer ?? null;
  const isVip = access?.allowed === true;
  const needsPurchase = access?.requiresPurchase === true && !!offer;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: safeAreaInsets.top + 18, paddingBottom: safeAreaInsets.bottom + 32 }]}>
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
            <Text style={styles.kicker}>VIP</Text>
            <Text style={styles.title}>{creatorName}</Text>
            <Text style={styles.body}>
              VIP is active for this creator channel only. It does not unlock Chi'llwood Premium, paid videos, paid Watch-Party tickets, paid events, channel subscriptions, LiveKit authority, room permissions, payouts, or other creators' channels.
            </Text>
            <Text style={styles.meta}>Access reason: {access?.reason ?? "vip_active"}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.kicker}>VIP access required</Text>
            <Text style={styles.title}>{offer?.title ?? "VIP Pass"}</Text>
            <Text style={styles.body}>
              {needsPurchase
                ? `Get VIP for ${creatorName}'s channel for ${formatCreatorVipPassPrice(offer.priceCents, offer.currency)}. VIP is creator-specific and does not include Chi'llwood Premium, paid videos, paid Watch-Party tickets, paid events, channel subscriptions, or other creators' channels.`
                : "This creator has not enabled VIP yet."}
            </Text>
            {notice ? <Text style={styles.meta}>{notice}</Text> : null}
            {needsPurchase ? (
              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                activeOpacity={0.86}
                disabled={busy}
                onPress={handleGetVip}
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
