import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { trackEvent } from "../_lib/analytics";
import {
  getCachedMonetizationSnapshot,
  readMonetizationSnapshot,
  subscribeToMonetizationSnapshot,
} from "../_lib/monetization";
import { supabase } from "../_lib/supabase";
import { useSession } from "../_lib/session";

export default function SettingsScreen() {
  const router = useRouter();
  const { isLoading, isSignedIn, user } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [monetizationSnapshot, setMonetizationSnapshot] = useState(() => getCachedMonetizationSnapshot());
  const [monetizationLoading, setMonetizationLoading] = useState(false);

  useEffect(() => {
    if (isLoading || isSignedIn) return;
    router.replace("/(auth)/login");
  }, [isLoading, isSignedIn, router]);

  useEffect(() => {
    const unsubscribe = subscribeToMonetizationSnapshot(() => {
      setMonetizationSnapshot(getCachedMonetizationSnapshot());
    });
    return unsubscribe;
  }, []);

  const refreshMonetizationStatus = useCallback(async (forceRefresh = true) => {
    setMonetizationLoading(true);
    try {
      const snapshot = await readMonetizationSnapshot({ forceRefresh });
      setMonetizationSnapshot(snapshot);
    } finally {
      setMonetizationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoading || !isSignedIn) return;
    void refreshMonetizationStatus(false);
  }, [isLoading, isSignedIn, refreshMonetizationStatus]);

  const monetizationStatusLabel = useMemo(() => {
    if (!monetizationSnapshot.configuration.shouldConfigure) return "Deferred in this build";
    if (monetizationSnapshot.status === "ready") return "Configured for later rollout";
    if (monetizationSnapshot.status === "store_unavailable") return "Not active in this build";
    if (monetizationSnapshot.status === "partial") return "Deferred setup in progress";
    return "Deferred in this build";
  }, [monetizationSnapshot.configuration.shouldConfigure, monetizationSnapshot.status]);

  const planLabel = useMemo(() => (
    monetizationSnapshot.targets.premium_subscription?.hasEntitlement ? "Premium active on this account" : "Not enabled in this build"
  ), [monetizationSnapshot.targets.premium_subscription?.hasEntitlement]);

  const entitlementsLabel = useMemo(() => (
    monetizationSnapshot.activeEntitlementIds.length
      ? monetizationSnapshot.activeEntitlementIds.join(", ")
      : "None active in this build"
  ), [monetizationSnapshot.activeEntitlementIds]);

  const offeringsLabel = useMemo(() => {
    if (monetizationSnapshot.currentOfferingId) return monetizationSnapshot.currentOfferingId;
    if (monetizationSnapshot.availableOfferingIds.length) {
      return `${monetizationSnapshot.availableOfferingIds.length} deferred setup item${monetizationSnapshot.availableOfferingIds.length === 1 ? "" : "s"} found`;
    }
    return "No tester-facing premium rollout is enabled";
  }, [monetizationSnapshot.availableOfferingIds, monetizationSnapshot.currentOfferingId]);

  const issueLabel = useMemo(() => (
    monetizationSnapshot.targets.premium_subscription?.hasEntitlement
      ? "This account already has Premium access, but tester-facing billing remains deferred in this build."
      : "Premium surfaces stay locked honestly while billing is deferred for testing and store readiness."
  ), [monetizationSnapshot.targets.premium_subscription?.hasEntitlement]);

  const onPressSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    trackEvent("auth_sign_out_requested", {
      source: "settings",
    });

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        trackEvent("auth_sign_out_failed", {
          reason: error.message,
          source: "settings",
        });
        Alert.alert("Log Out", error.message);
        return;
      }

      trackEvent("auth_sign_out_success", {
        source: "settings",
      });
      router.replace("/(auth)/login");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to log out right now.";
      trackEvent("auth_sign_out_failed", {
        reason: message,
        source: "settings",
      });
      Alert.alert("Log Out", message);
    } finally {
      setSigningOut(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#DC143C" />
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.82}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>SETTINGS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>ACCOUNT</Text>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.body}>
          Keep sign-out and account-level access here without changing the role of your owner profile/control hub.
        </Text>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Signed in as</Text>
          <Text style={styles.identityValue}>{String(user?.email ?? "Unknown account")}</Text>
        </View>
        <TouchableOpacity
          style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
          activeOpacity={0.86}
          onPress={onPressSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Log out"
          testID="settings-logout-button"
        >
          <Text style={styles.signOutButtonText}>{signingOut ? "Logging out..." : "Log Out"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>PREMIUM PREVIEW</Text>
        <Text style={styles.secondaryTitle}>Premium Coming Soon</Text>
        <Text style={styles.body}>
          Premium features are not enabled in this build yet. This screen stays informational only while Public v1 testing and store readiness continue.
        </Text>

        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Build access</Text>
          <Text style={styles.identityValue}>{planLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Snapshot</Text>
          <Text style={styles.identityValue}>{monetizationStatusLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Active premium access</Text>
          <Text style={styles.identityValue}>{entitlementsLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Rollout state</Text>
          <Text style={styles.identityValue}>{offeringsLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Build note</Text>
          <Text style={styles.statusNote}>{issueLabel}</Text>
        </View>

        <View style={styles.utilityRow}>
          <TouchableOpacity
            style={[styles.utilityButton, monetizationLoading && styles.utilityButtonDisabled]}
            onPress={() => {
              void refreshMonetizationStatus(true);
            }}
            activeOpacity={0.86}
            disabled={monetizationLoading}
          >
            {monetizationLoading
              ? <ActivityIndicator color="#E5ECF8" size="small" />
              : <Text style={styles.utilityButtonText}>Refresh snapshot</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#06070B",
    paddingTop: 56,
    paddingHorizontal: 18,
  },
  content: {
    gap: 14,
    paddingBottom: 28,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06070B",
    gap: 10,
  },
  loadingText: {
    color: "#F4F7FC",
    fontSize: 13,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  backArrow: {
    color: "#aaa",
    fontSize: 20,
    fontWeight: "700",
    paddingRight: 8,
  },
  kicker: {
    color: "#555",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headerSpacer: {
    width: 18,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 18,
    gap: 12,
  },
  cardKicker: {
    color: "#7B7B7B",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
  },
  secondaryTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  body: {
    color: "#B8C1D6",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  identityBlock: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    gap: 4,
  },
  identityLabel: {
    color: "#7A859A",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  identityValue: {
    color: "#F4F7FC",
    fontSize: 14,
    fontWeight: "700",
  },
  statusNote: {
    color: "#D9E3F9",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  signOutButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#DC143C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  signOutButtonDisabled: {
    opacity: 0.72,
  },
  signOutButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  utilityRow: {
    flexDirection: "row",
    gap: 10,
  },
  utilityButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  utilityButtonDisabled: {
    opacity: 0.72,
  },
  utilityButtonText: {
    color: "#F4F7FC",
    fontSize: 12.5,
    fontWeight: "800",
  },
});
