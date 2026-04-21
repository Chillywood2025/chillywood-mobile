import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../_lib/analytics";
import {
  getCachedMonetizationSnapshot,
  readMonetizationSnapshot,
  subscribeToMonetizationSnapshot,
} from "../_lib/monetization";
import { getRuntimeLegalConfig, getSupportRoutePath } from "../_lib/runtimeConfig";
import { supabase } from "../_lib/supabase";
import { useSession } from "../_lib/session";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, isSignedIn, user } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [monetizationSnapshot, setMonetizationSnapshot] = useState(() => getCachedMonetizationSnapshot());
  const [monetizationLoading, setMonetizationLoading] = useState(false);
  const legalConfig = useMemo(() => getRuntimeLegalConfig(), []);
  const supportRoutePath = useMemo(() => getSupportRoutePath(), []);

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
    if (!monetizationSnapshot.configuration.shouldConfigure) return "Premium is not enabled on this build";
    if (monetizationSnapshot.status === "ready") return "Premium can resolve on supported locked routes";
    if (monetizationSnapshot.status === "store_unavailable") return "Premium billing is unavailable on this device";
    if (monetizationSnapshot.status === "partial") return "Premium configuration is still being finalized";
    return "Premium is not currently available";
  }, [monetizationSnapshot.configuration.shouldConfigure, monetizationSnapshot.status]);

  const planLabel = useMemo(() => (
    monetizationSnapshot.targets.premium_subscription?.hasEntitlement ? "Premium is active on this account" : "No active Premium access on this account"
  ), [monetizationSnapshot.targets.premium_subscription?.hasEntitlement]);

  const entitlementsLabel = useMemo(() => (
    monetizationSnapshot.targets.premium_subscription?.hasEntitlement
      ? "This account already clears Premium-gated routes."
      : "Premium-gated routes still need an active Premium entitlement."
  ), [monetizationSnapshot.targets.premium_subscription?.hasEntitlement]);

  const offeringsLabel = useMemo(() => {
    if (monetizationSnapshot.currentOfferingId) return "A Premium offer is configured for supported unlock surfaces";
    if (monetizationSnapshot.availableOfferingIds.length) return "Premium offer configuration is present for supported unlock surfaces";
    return "No premium offer is currently available";
  }, [monetizationSnapshot.availableOfferingIds, monetizationSnapshot.currentOfferingId]);

  const issueLabel = useMemo(() => (
    monetizationSnapshot.targets.premium_subscription?.hasEntitlement
      ? "Settings stays read-only here. New Premium purchases still begin from supported locked routes, not from this screen."
      : "Settings can confirm current Premium posture on this account, but purchase entry still begins from supported locked routes instead of this screen."
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

  const openExternalDestination = useCallback(async (url: string, label: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(label, `Unable to open ${label.toLowerCase()} right now.`);
        return;
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert(label, `Unable to open ${label.toLowerCase()} right now.`);
    }
  }, []);

  const openSupportFallback = useCallback((topic: "privacy" | "terms" | "account-deletion") => {
    router.push({
      pathname: supportRoutePath as Parameters<typeof router.push>[0] extends { pathname: infer P } ? P : "/support",
      params: { topic },
    } as Parameters<typeof router.push>[0]);
  }, [router, supportRoutePath]);

  const onPressPrivacyPolicy = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "privacy_policy",
      destination: legalConfig.privacyPolicyUrl ? "external" : "support",
    });

    if (legalConfig.privacyPolicyUrl) {
      void openExternalDestination(legalConfig.privacyPolicyUrl, "Privacy Policy");
      return;
    }

    openSupportFallback("privacy");
  }, [legalConfig.privacyPolicyUrl, openExternalDestination, openSupportFallback]);

  const onPressTerms = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "terms_of_use",
      destination: legalConfig.termsOfServiceUrl ? "external" : "support",
    });

    if (legalConfig.termsOfServiceUrl) {
      void openExternalDestination(legalConfig.termsOfServiceUrl, "Terms of Use");
      return;
    }

    openSupportFallback("terms");
  }, [legalConfig.termsOfServiceUrl, openExternalDestination, openSupportFallback]);

  const onPressAccountDeletion = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "account_deletion",
      destination: legalConfig.accountDeletionUrl ? "external" : "support",
    });

    if (legalConfig.accountDeletionUrl) {
      void openExternalDestination(legalConfig.accountDeletionUrl, "Account Deletion");
      return;
    }

    openSupportFallback("account-deletion");
  }, [legalConfig.accountDeletionUrl, openExternalDestination, openSupportFallback]);

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#DC143C" />
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top + 16, 24),
          paddingBottom: Math.max(insets.bottom + 28, 28),
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.82}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>SETTINGS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>ACCOUNT</Text>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.body}>
          Keep sign-out and account-level access here. Public channel presentation still stays on your profile surface.
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
        <Text style={styles.cardKicker}>LEGAL & SUPPORT</Text>
        <Text style={styles.secondaryTitle}>Privacy, terms, and account help</Text>
        <Text style={styles.body}>
          Open the current policy pages or start an account-deletion request from the canonical account-help path.
        </Text>
        <View style={styles.utilityRow}>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressPrivacyPolicy}>
            <Text style={styles.utilityButtonText}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressTerms}>
            <Text style={styles.utilityButtonText}>Terms of Use</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.secondaryActionButton} activeOpacity={0.86} onPress={onPressAccountDeletion}>
          <Text style={styles.secondaryActionButtonText}>Request Account Deletion</Text>
        </TouchableOpacity>
        <Text style={styles.metaText}>
          If a public legal link is not configured on this build yet, Settings hands off to Chi&apos;llywood Support so the request still lands on the official help path.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>PREMIUM ACCOUNT</Text>
        <Text style={styles.secondaryTitle}>Premium access on this account</Text>
        <Text style={styles.body}>
          Settings shows the current Premium posture for this signed-in account. Purchase entry still begins from supported locked routes, so this surface stays read-only and status-first.
        </Text>

        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Account status</Text>
          <Text style={styles.identityValue}>{planLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Current purchase posture</Text>
          <Text style={styles.identityValue}>{monetizationStatusLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Premium route access</Text>
          <Text style={styles.identityValue}>{entitlementsLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Offer readiness</Text>
          <Text style={styles.identityValue}>{offeringsLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Purchase entry</Text>
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
              : <Text style={styles.utilityButtonText}>Refresh status</Text>}
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
    paddingHorizontal: 18,
  },
  content: {
    gap: 14,
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
  secondaryActionButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.34)",
    backgroundColor: "rgba(220,20,60,0.14)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryActionButtonText: {
    color: "#FFE4EA",
    fontSize: 13,
    fontWeight: "900",
  },
  metaText: {
    color: "#8D97AE",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
});
