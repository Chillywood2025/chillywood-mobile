import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../_lib/analytics";
import {
  getCachedMonetizationSnapshot,
  openManageSubscriptionFlow,
  purchaseMonetizationTarget,
  readMonetizationSnapshot,
  restoreMonetizationAccess,
  subscribeToMonetizationSnapshot,
  type MonetizationSnapshot,
} from "../_lib/monetization";
import { useSession } from "../_lib/session";

const buildStatusLabel = (snapshot: MonetizationSnapshot) => {
  if (!snapshot.configuration.shouldConfigure) return "Premium setup is not enabled in this build.";
  if (snapshot.status === "ready") return "Premium billing and entitlement checks are available.";
  if (snapshot.status === "store_unavailable") return "Billing is unavailable on this device or account.";
  if (snapshot.status === "partial") return "Premium setup is partially configured. Access checks stay cautious.";
  return "Premium is unavailable right now.";
};

const buildOfferLabel = (snapshot: MonetizationSnapshot) => {
  const target = snapshot.targets.premium_subscription;
  if (target.hasEntitlement) return "Premium is already active for this account.";
  if (target.offeringAvailable && target.packageCount > 0) return "A Premium subscription offer is configured.";
  if (snapshot.configuration.shouldConfigure) return "No Premium offer is available in the current store configuration.";
  return snapshot.configuration.reason ?? "Store configuration is required before purchases can run.";
};

export default function SubscribeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading: sessionLoading, isSignedIn, user } = useSession();
  const [snapshot, setSnapshot] = useState(() => getCachedMonetizationSnapshot());
  const [loading, setLoading] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToMonetizationSnapshot(() => {
      setSnapshot(getCachedMonetizationSnapshot());
    });
    return unsubscribe;
  }, []);

  const refreshSnapshot = useCallback(async (forceRefresh = true) => {
    setLoading(true);
    try {
      const nextSnapshot = await readMonetizationSnapshot({
        forceRefresh,
        userId: user?.id ?? null,
      });
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (sessionLoading) return;
    void refreshSnapshot(false);
  }, [refreshSnapshot, sessionLoading]);

  const premiumTarget = snapshot.targets.premium_subscription;
  const hasPremium = !!premiumTarget.hasEntitlement;
  const canPurchase = isSignedIn
    && snapshot.configuration.shouldConfigure
    && snapshot.canMakePayments
    && premiumTarget.offeringAvailable
    && premiumTarget.packageCount > 0
    && !hasPremium;
  const canRestore = isSignedIn && snapshot.configuration.shouldConfigure;
  const canManage = isSignedIn && snapshot.configuration.shouldConfigure;

  const statusLabel = useMemo(() => buildStatusLabel(snapshot), [snapshot]);
  const offerLabel = useMemo(() => buildOfferLabel(snapshot), [snapshot]);
  const activeProductLabel = useMemo(() => {
    if (!snapshot.activeProductIds.length) return "No active store product on this account.";
    return snapshot.activeProductIds.join(", ");
  }, [snapshot.activeProductIds]);

  const onSignIn = useCallback(() => {
    router.push({ pathname: "/(auth)/login", params: { redirectTo: "/subscribe" } });
  }, [router]);

  const onPurchase = useCallback(async () => {
    if (!isSignedIn) {
      onSignIn();
      return;
    }

    if (!canPurchase) {
      setNotice(snapshot.issues[0] ?? offerLabel);
      return;
    }

    setPurchaseBusy(true);
    setNotice("Opening the configured Premium offer...");
    trackEvent("premium_subscribe_purchase_requested", {
      source: "subscribe",
      snapshotStatus: snapshot.status,
      packageId: premiumTarget.recommendedPackageId ?? "recommended",
    });

    try {
      const result = await purchaseMonetizationTarget("premium_subscription", {
        userId: user?.id ?? null,
        packageId: premiumTarget.recommendedPackageId,
      });
      setNotice(result.message);
      setSnapshot(result.snapshot);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to start Premium purchase right now.");
    } finally {
      setPurchaseBusy(false);
    }
  }, [canPurchase, isSignedIn, offerLabel, onSignIn, premiumTarget.recommendedPackageId, snapshot, user?.id]);

  const onRestore = useCallback(async () => {
    if (!isSignedIn) {
      onSignIn();
      return;
    }

    if (!canRestore) {
      setNotice(snapshot.configuration.reason ?? "Restore purchases is unavailable in this build.");
      return;
    }

    setRestoreBusy(true);
    setNotice("Restoring purchases...");
    trackEvent("premium_subscribe_restore_requested", {
      source: "subscribe",
      snapshotStatus: snapshot.status,
    });

    try {
      const result = await restoreMonetizationAccess({ userId: user?.id ?? null });
      setNotice(result.message);
      setSnapshot(result.snapshot);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to restore purchases right now.");
    } finally {
      setRestoreBusy(false);
    }
  }, [canRestore, isSignedIn, onSignIn, snapshot.configuration.reason, snapshot.status, user?.id]);

  const onManage = useCallback(async () => {
    if (!isSignedIn) {
      onSignIn();
      return;
    }

    if (!canManage) {
      setNotice(snapshot.configuration.reason ?? "Subscription management is unavailable in this build.");
      return;
    }

    setManageBusy(true);
    try {
      const opened = await openManageSubscriptionFlow();
      setNotice(opened ? "Opened the platform subscription manager." : "Unable to open subscription management on this device.");
    } finally {
      setManageBusy(false);
    }
  }, [canManage, isSignedIn, onSignIn, snapshot.configuration.reason]);

  const busy = loading || purchaseBusy || restoreBusy || manageBusy;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top + 18, 28),
          paddingBottom: Math.max(insets.bottom + 28, 34),
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.82}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>PREMIUM</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroKicker}>CHI&apos;LLYWOOD PREMIUM</Text>
        <Text style={styles.heroTitle}>Premium access should feel real before it unlocks anything.</Text>
        <Text style={styles.heroBody}>
          Premium can unlock protected Watch-Party and playback surfaces only after the configured billing owner and backend entitlement truth say this account is active.
        </Text>
      </View>

      {sessionLoading ? (
        <View style={styles.card}>
          <ActivityIndicator color="#DC143C" />
          <Text style={styles.body}>Checking your session...</Text>
        </View>
      ) : !isSignedIn ? (
        <View style={styles.card}>
          <Text style={styles.cardKicker}>SIGN IN REQUIRED</Text>
          <Text style={styles.cardTitle}>Sign in before Premium can be checked.</Text>
          <Text style={styles.body}>
            Premium is account-owned. Chi&apos;llywood will not grant protected route access from a local-only or anonymous purchase state.
          </Text>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.88} onPress={onSignIn}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardKicker}>ACCESS STATUS</Text>
            <Text style={styles.cardTitle}>{hasPremium ? "Premium is active" : "Premium is not active"}</Text>
            <Text style={styles.body}>{statusLabel}</Text>

            <View style={styles.statusGrid}>
              <View style={styles.statusTile}>
                <Text style={styles.statusLabel}>Entitlement</Text>
                <Text style={styles.statusValue}>{hasPremium ? "Active" : "Missing"}</Text>
              </View>
              <View style={styles.statusTile}>
                <Text style={styles.statusLabel}>Store</Text>
                <Text style={styles.statusValue}>{snapshot.canMakePayments ? "Available" : "Unavailable"}</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Offer readiness</Text>
              <Text style={styles.infoText}>{offerLabel}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Active products</Text>
              <Text style={styles.infoText}>{activeProductLabel}</Text>
            </View>
            {snapshot.issues.length ? (
              <View style={styles.warningCard}>
                <Text style={styles.warningLabel}>Setup note</Text>
                <Text style={styles.warningText}>{snapshot.issues[0]}</Text>
              </View>
            ) : null}
          </View>

          {notice ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardKicker}>ACTIONS</Text>
            <Text style={styles.cardTitle}>Purchase and restore</Text>
            <Text style={styles.body}>
              These actions call the existing RevenueCat and entitlement owners. If the store or offer is not configured, the action stays blocked and no Premium access is granted.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, (!canPurchase || busy) && styles.primaryButtonDisabled]}
              activeOpacity={0.88}
              disabled={!canPurchase || busy}
              onPress={onPurchase}
            >
              {purchaseBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{hasPremium ? "Premium Active" : "Unlock Premium"}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, (!canRestore || busy) && styles.secondaryButtonDisabled]}
                activeOpacity={0.86}
                disabled={!canRestore || busy}
                onPress={onRestore}
              >
                {restoreBusy ? <ActivityIndicator color="#E5ECF8" /> : <Text style={styles.secondaryButtonText}>Restore</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, (!canManage || busy) && styles.secondaryButtonDisabled]}
                activeOpacity={0.86}
                disabled={!canManage || busy}
                onPress={onManage}
              >
                {manageBusy ? <ActivityIndicator color="#E5ECF8" /> : <Text style={styles.secondaryButtonText}>Manage</Text>}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.ghostButton, loading && styles.secondaryButtonDisabled]}
              activeOpacity={0.86}
              disabled={loading}
              onPress={() => {
                void refreshSnapshot(true);
              }}
            >
              <Text style={styles.ghostButtonText}>{loading ? "Checking..." : "Recheck Access"}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#06070B",
    paddingHorizontal: 18,
  },
  content: {
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backArrow: {
    color: "#C8D0E2",
    fontSize: 20,
    fontWeight: "800",
    paddingRight: 8,
  },
  kicker: {
    color: "#7B869E",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  headerSpacer: {
    width: 20,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(25,12,18,0.94)",
    padding: 20,
    gap: 10,
  },
  heroKicker: {
    color: "#FFB8C5",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "900",
  },
  heroBody: {
    color: "#D8E1F3",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(16,18,25,0.96)",
    padding: 18,
    gap: 12,
  },
  cardKicker: {
    color: "#8793AA",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  cardTitle: {
    color: "#F4F7FC",
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  body: {
    color: "#AEB8CB",
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "600",
  },
  statusGrid: {
    flexDirection: "row",
    gap: 10,
  },
  statusTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 13,
    gap: 4,
  },
  statusLabel: {
    color: "#8490A7",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  statusValue: {
    color: "#F5F8FE",
    fontSize: 16,
    fontWeight: "900",
  },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 13,
    gap: 4,
  },
  infoLabel: {
    color: "#8793AA",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  infoText: {
    color: "#E8EEFB",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  warningCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.25)",
    backgroundColor: "rgba(69,18,28,0.62)",
    padding: 13,
    gap: 4,
  },
  warningLabel: {
    color: "#FFD4DD",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  warningText: {
    color: "#FFE8ED",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  noticeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 14,
  },
  noticeText: {
    color: "#F2F6FF",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: "#DC143C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.56,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryButtonDisabled: {
    opacity: 0.56,
  },
  secondaryButtonText: {
    color: "#E5ECF8",
    fontSize: 13,
    fontWeight: "800",
  },
  ghostButton: {
    minHeight: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  ghostButtonText: {
    color: "#B9C4D8",
    fontSize: 13,
    fontWeight: "800",
  },
});
