import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ImageBackground, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../_lib/analytics";
import {
  getCachedMonetizationSnapshot,
  INTERNAL_TESTER_SANDBOX_PURCHASE_MODE,
  isPremiumPurchaseShellAvailableForMode,
  openManageSubscriptionFlow,
  purchaseMonetizationTarget,
  readMonetizationSnapshot,
  resolveInternalTesterSandboxPurchaseMode,
  restoreMonetizationAccess,
  subscribeToMonetizationSnapshot,
  type InternalTesterSandboxPurchaseModeState,
  type MonetizationSnapshot,
  type MonetizationPurchaseMode,
} from "../_lib/monetization";
import { useOptionalBetaProgram } from "../_lib/betaProgram";
import { resolvePremiumPurchaseReadiness } from "../_lib/premiumPurchaseReadiness.mjs";
import { useSession } from "../_lib/session";

const FRIENDLY_UNAVAILABLE_MESSAGE =
  "Premium purchases are temporarily unavailable while setup is being finalized.";
const PREMIUM_BODY =
  "Watch-Party Live, Live Watch-Party, creator tools, and ad-free viewing.";
const PREMIUM_SANDBOX_NOTICE =
  "Sandbox test mode — no real money is charged.";
const CHILLYWOOD_BACKGROUND_SOURCE = require("../assets/images/chillywood-branded-background.png");
const STORE_PROVIDER_NAME = Platform.OS === "ios" ? "App Store" : "Google Play";
const STORE_PROVIDER_PAIR = `${STORE_PROVIDER_NAME} / RevenueCat`;

const buildPurchaseReadiness = (
  snapshot: MonetizationSnapshot,
  purchaseMode: MonetizationPurchaseMode,
  sandboxMode: InternalTesterSandboxPurchaseModeState,
  isSignedIn: boolean,
) => {
  const target = snapshot.targets.premium_subscription;
  return resolvePremiumPurchaseReadiness({
    isSignedIn,
    hasPremium: target.hasEntitlement,
    purchaseMode,
    purchaseShellAvailable: isPremiumPurchaseShellAvailableForMode(purchaseMode),
    sandboxModeReason: sandboxMode.reason,
    storeName: STORE_PROVIDER_NAME,
    storePurchaseRailReadbackComplete: sandboxMode.storePurchaseRailReadbackComplete,
    storePurchaseRailState: sandboxMode.storePurchaseRailState,
    revenueCatConfigured: snapshot.configuration.shouldConfigure,
    configurationReason: snapshot.configuration.reason,
    canMakePayments: snapshot.canMakePayments,
    offeringAvailable: target.offeringAvailable,
    packageCount: target.packageCount,
  });
};

function PremiumAccordion({
  id,
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = !!expanded[id];

  return (
    <View style={styles.accordion}>
      <TouchableOpacity
        style={styles.accordionHeader}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => onToggle(id)}
      >
        <View style={styles.accordionCopy}>
          <Text style={styles.accordionTitle}>{title}</Text>
          <Text style={styles.accordionSummary}>{summary}</Text>
        </View>
        <Text style={styles.chevron}>{isOpen ? "⌄" : "›"}</Text>
      </TouchableOpacity>
      {isOpen ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

function StatusLine({
  label,
  value,
  body,
  tone = "default",
}: {
  label: string;
  value: string;
  body: string;
  tone?: "default" | "muted" | "warning";
}) {
  return (
    <View style={styles.statusLine}>
      <View style={styles.statusLineCopy}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusBody}>{body}</Text>
      </View>
      <View style={[
        styles.statusPill,
        tone === "muted" && styles.statusPillMuted,
        tone === "warning" && styles.statusPillWarning,
      ]}>
        <Text style={[
          styles.statusPillText,
          tone === "muted" && styles.statusPillTextMuted,
          tone === "warning" && styles.statusPillTextWarning,
        ]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function SubscribeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading: sessionLoading, isSignedIn, user } = useSession();
  const betaProgram = useOptionalBetaProgram();
  const [snapshot, setSnapshot] = useState(() => getCachedMonetizationSnapshot());
  const [sandboxMode, setSandboxMode] = useState<InternalTesterSandboxPurchaseModeState>({
    enabled: false,
    mode: "public",
    label: "Provider sandbox purchases",
    reason: "Checking tester access.",
    allowedRoles: [],
    liveMoneyEnabled: false,
    payoutsEnabled: false,
    cashoutEnabled: false,
    providerSandboxCandidate: false,
    storePurchaseRailState: "off",
    storePurchaseRailReadbackComplete: false,
  });
  const [loading, setLoading] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubscribe = subscribeToMonetizationSnapshot(() => {
      setSnapshot(getCachedMonetizationSnapshot());
    });
    return unsubscribe;
  }, []);

  const activePurchaseMode = sandboxMode.enabled ? INTERNAL_TESTER_SANDBOX_PURCHASE_MODE : "public";

  const refreshSnapshot = useCallback(async (forceRefresh = true, mode: MonetizationPurchaseMode = activePurchaseMode) => {
    setLoading(true);
    try {
      const nextSnapshot = await readMonetizationSnapshot({
        forceRefresh,
        purchaseMode: mode,
        userId: user?.id ?? null,
      });
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } finally {
      setLoading(false);
    }
  }, [activePurchaseMode, user?.id]);

  useEffect(() => {
    if (sessionLoading || !isSignedIn) {
      setSandboxMode((current) => current.enabled ? {
        enabled: false,
        mode: "public",
        label: current.label,
        reason: `Sign in before starting a ${STORE_PROVIDER_PAIR} sandbox Premium purchase.`,
        allowedRoles: [],
        liveMoneyEnabled: false,
        payoutsEnabled: false,
        cashoutEnabled: false,
        providerSandboxCandidate: false,
        storePurchaseRailState: "off",
        storePurchaseRailReadbackComplete: false,
      } : current);
      return;
    }

    let active = true;
    resolveInternalTesterSandboxPurchaseMode({
      userId: user?.id ?? null,
      email: user?.email ?? null,
      betaAccessActive: betaProgram?.isActive === true,
    })
      .then((state) => {
        if (!active) return;
        setSandboxMode(state);
        void refreshSnapshot(false, state.mode);
      })
      .catch(() => {
        if (!active) return;
        setSandboxMode({
          enabled: false,
          mode: "public",
          label: "Provider sandbox purchases",
          reason: "Unable to confirm provider-backed sandbox purchase access right now.",
          allowedRoles: [],
          liveMoneyEnabled: false,
          payoutsEnabled: false,
          cashoutEnabled: false,
          providerSandboxCandidate: false,
          storePurchaseRailState: "off",
          storePurchaseRailReadbackComplete: false,
        });
      });

    return () => {
      active = false;
    };
  }, [betaProgram?.isActive, isSignedIn, refreshSnapshot, sessionLoading, user?.email, user?.id]);

  useEffect(() => {
    if (sessionLoading) return;
    void refreshSnapshot(false, activePurchaseMode);
  }, [activePurchaseMode, refreshSnapshot, sessionLoading]);

  const toggleAccordion = useCallback((id: string) => {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  const premiumTarget = snapshot.targets.premium_subscription;
  const hasPremium = !!premiumTarget.hasEntitlement;
  const purchaseReadiness = buildPurchaseReadiness(snapshot, activePurchaseMode, sandboxMode, isSignedIn);
  const purchaseReady = purchaseReadiness.ready;
  const sandboxPurchaseAvailable = sandboxMode.enabled && purchaseReady && !hasPremium;
  const sandboxBlockedReason = purchaseReadiness.message;
  const canPurchase = isSignedIn && purchaseReady && !hasPremium;
  const canRestore = isSignedIn && snapshot.configuration.shouldConfigure;
  const canManage = isSignedIn && snapshot.configuration.shouldConfigure;
  const busy = loading || purchaseBusy || restoreBusy || manageBusy;
  const purchaseStatusLabel = sandboxMode.enabled && !hasPremium
    ? purchaseReady ? "Sandbox test available" : "Sandbox setup unavailable"
    : purchaseReady || hasPremium ? "Available" : "Temporarily unavailable";
  const purchaseStatusTone = purchaseReady || hasPremium ? "default" : "warning";
  const availabilitySummary = purchaseReady
    ? sandboxMode.enabled
      ? `${STORE_PROVIDER_PAIR} sandbox purchase can open when billing and the Premium offering are available.`
      : "A verified store subscription is ready for this account."
    : FRIENDLY_UNAVAILABLE_MESSAGE;
  const primaryActionLabel = hasPremium
    ? "Manage subscription"
    : purchaseReady
      ? sandboxMode.enabled ? "Start Sandbox Premium Test" : "Start Premium"
      : "Check Sandbox Purchase Setup";
  const primaryActionBusy = hasPremium ? manageBusy : purchaseBusy;

  const onSignIn = useCallback(() => {
    router.push({ pathname: "/(auth)/login", params: { redirectTo: "/subscribe" } });
  }, [router]);

  const onClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }, [router]);

  const onSecondaryClose = useCallback(() => {
    router.replace("/");
  }, [router]);

  const onPurchase = useCallback(async () => {
    if (!isSignedIn) {
      onSignIn();
      return;
    }

    let requestedPurchaseMode = activePurchaseMode;
    let requestedPackageId = premiumTarget.recommendedPackageId;

    if (!canPurchase) {
      setNotice(`Checking ${STORE_PROVIDER_NAME} sandbox purchase availability...`);
      setExpanded((current) => ({ ...current, "testing-details": true }));

      try {
        const nextSandboxMode = await resolveInternalTesterSandboxPurchaseMode({
          userId: user?.id ?? null,
          email: user?.email ?? null,
          betaAccessActive: betaProgram?.isActive === true,
        });
        requestedPurchaseMode = nextSandboxMode.enabled
          ? INTERNAL_TESTER_SANDBOX_PURCHASE_MODE
          : "public";
        setSandboxMode(nextSandboxMode);

        const nextSnapshot = await refreshSnapshot(true, requestedPurchaseMode);
        setSnapshot(nextSnapshot);
        requestedPackageId = nextSnapshot.targets.premium_subscription.recommendedPackageId;
        const nextReadiness = buildPurchaseReadiness(
          nextSnapshot,
          requestedPurchaseMode,
          nextSandboxMode,
          true,
        );

        if (!nextReadiness.ready) {
          setNotice(nextReadiness.message);
          return;
        }
      } catch {
        setNotice(`Unable to verify ${STORE_PROVIDER_NAME} sandbox purchase availability right now. Try again.`);
        return;
      }
    }

    setPurchaseBusy(true);
    setNotice("Opening Premium...");
    trackEvent("premium_subscribe_purchase_requested", {
      source: "subscribe",
      snapshotStatus: snapshot.status,
      packageId: requestedPackageId ?? "recommended",
      purchaseMode: requestedPurchaseMode,
    });

    try {
      const result = await purchaseMonetizationTarget("premium_subscription", {
        userId: user?.id ?? null,
        packageId: requestedPackageId,
        purchaseMode: requestedPurchaseMode,
      });
      setNotice(result.ok ? result.message : FRIENDLY_UNAVAILABLE_MESSAGE);
      setSnapshot(result.snapshot);
    } catch {
      setNotice("Unable to start Premium purchase right now.");
    } finally {
      setPurchaseBusy(false);
    }
  }, [
    activePurchaseMode,
    betaProgram?.isActive,
    canPurchase,
    isSignedIn,
    onSignIn,
    premiumTarget.recommendedPackageId,
    refreshSnapshot,
    snapshot.status,
    user?.email,
    user?.id,
  ]);

  const onRestore = useCallback(async () => {
    if (!isSignedIn) {
      onSignIn();
      return;
    }

    if (!canRestore) {
      setNotice("Restore purchases is temporarily unavailable while setup is being finalized.");
      return;
    }

    setRestoreBusy(true);
    setNotice("Restoring purchases...");
    trackEvent("premium_subscribe_restore_requested", {
      source: "subscribe",
      snapshotStatus: snapshot.status,
    });

    try {
      const result = await restoreMonetizationAccess({ purchaseMode: activePurchaseMode, userId: user?.id ?? null });
      const restoredPremium = !!result.snapshot.targets.premium_subscription.hasEntitlement;
      setNotice(restoredPremium ? "Purchases restored. Premium is active." : "Restore complete. Premium is not active.");
      setSnapshot(result.snapshot);
    } catch {
      setNotice("Unable to restore purchases right now.");
    } finally {
      setRestoreBusy(false);
    }
  }, [activePurchaseMode, canRestore, isSignedIn, onSignIn, snapshot.status, user?.id]);

  const onManage = useCallback(async () => {
    if (!isSignedIn) {
      onSignIn();
      return;
    }

    if (!canManage) {
      setNotice("Subscription management is temporarily unavailable while setup is being finalized.");
      return;
    }

    setManageBusy(true);
    try {
      const opened = await openManageSubscriptionFlow();
      setNotice(opened ? "Opened the platform subscription manager." : "Unable to open subscription management on this device.");
    } finally {
      setManageBusy(false);
    }
  }, [canManage, isSignedIn, onSignIn]);

  return (
    <ImageBackground source={CHILLYWOOD_BACKGROUND_SOURCE} style={styles.background} resizeMode="cover">
      <View style={styles.routeContainer} testID="screen-premium" collapsable={false}>
      <View style={styles.backgroundOverlay} />
      <ScrollView
        testID="premium-screen"
        collapsable={false}
        style={[styles.screen, { marginTop: insets.top }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 18,
            paddingBottom: Math.max(insets.bottom + 28, 34),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} activeOpacity={0.82}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>PREMIUM</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroCard} testID="premium-not-creator-offer-copy" collapsable={false}>
          <Text style={styles.heroKicker}>Chi’llywood Premium</Text>
        <Text style={styles.heroTitle}>Premium</Text>
        <Text style={styles.heroBody}>{hasPremium ? "Your Premium access is active." : PREMIUM_BODY}</Text>
      </View>

      {sessionLoading ? (
        <View style={styles.card} testID="premium-loading-state" collapsable={false}>
          <ActivityIndicator color="#DC143C" />
          <Text style={styles.body}>Checking your session...</Text>
        </View>
      ) : !isSignedIn ? (
        <View style={styles.card} testID="premium-purchase-state" collapsable={false}>
          <Text style={styles.cardKicker}>SIGN IN REQUIRED</Text>
          <Text style={styles.cardTitle}>Sign in before Premium can be checked.</Text>
          <Text style={styles.body}>
            Premium is account-owned. Sign in so Chi’llywood can check your subscription or restore purchases safely.
          </Text>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.88} onPress={onSignIn}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.card} testID="premium-status-card" collapsable={false}>
            <View testID={hasPremium ? "premium-active-receipt" : undefined}>
              <Text style={styles.cardTitle}>{hasPremium ? "Premium is active." : "Premium is not active."}</Text>
              <Text style={styles.body}>
                {hasPremium
                  ? "Your Premium access is active on this account."
                  : purchaseReady ? "Choose Premium to continue." : FRIENDLY_UNAVAILABLE_MESSAGE}
              </Text>
            </View>
            {sandboxMode.enabled && !hasPremium ? (
              <View style={styles.sandboxNotice}>
                <Text style={styles.sandboxNoticeText}>{PREMIUM_SANDBOX_NOTICE}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
              activeOpacity={0.88}
              disabled={busy}
              onPress={hasPremium ? onManage : onPurchase}
              testID="premium-purchase-button"
              accessibilityRole="button"
              accessibilityLabel={hasPremium ? "Manage Chi'llywood Premium subscription" : "Start Chi'llywood Premium purchase"}
              accessibilityHint={!hasPremium && !purchaseReady
                ? "Checks purchase availability and explains any remaining setup issue."
                : undefined}
              accessibilityState={{ disabled: busy }}
            >
              {primaryActionBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{primaryActionLabel}</Text>
              )}
            </TouchableOpacity>

            {!hasPremium && !purchaseReady ? (
              <Text
                style={styles.purchaseBlockedReason}
                testID="premium-purchase-blocked-reason"
                accessibilityLiveRegion="polite"
              >
                {purchaseReadiness.message}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.secondaryButton, busy && styles.secondaryButtonDisabled]}
              activeOpacity={0.86}
              disabled={busy}
              onPress={onSecondaryClose}
              accessibilityRole="button"
              accessibilityLabel={hasPremium ? "Done with Premium" : "Not now"}
            >
              <Text style={styles.secondaryButtonText}>{hasPremium ? "Done" : "Not now"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.restoreLink, (busy || !canRestore) && styles.secondaryButtonDisabled]}
              activeOpacity={0.86}
              disabled={busy || !canRestore}
              onPress={onRestore}
              testID="premium-restore-button"
              accessibilityRole="button"
              accessibilityLabel="Restore Premium purchases"
            >
              {restoreBusy ? (
                <ActivityIndicator color="#E5ECF8" size="small" />
              ) : (
                <Text style={styles.restoreLinkText}>
                  {hasPremium ? "Restore purchases" : "Already subscribed? "}
                  {!hasPremium ? <Text style={styles.restoreLinkAction}>Restore</Text> : null}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {notice ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <PremiumAccordion
            id="testing-details"
            title="Testing details"
            summary="Sandbox availability and purchase diagnostics"
            expanded={expanded}
            onToggle={toggleAccordion}
          >
            <StatusLine
              label="Premium status"
              value={hasPremium ? "Active" : "Not active"}
              body={hasPremium ? "Entitlement readback shows Premium active." : "Premium remains locked until an entitlement is confirmed."}
              tone={hasPremium ? "default" : "muted"}
            />
            <StatusLine
              label="Purchase readiness"
              value={purchaseStatusLabel}
              body={availabilitySummary}
              tone={purchaseStatusTone}
            />
            <StatusLine
              label="Sandbox availability"
              value={sandboxPurchaseAvailable ? "Ready" : "Not ready"}
              body={sandboxPurchaseAvailable
                ? `Provider-backed ${STORE_PROVIDER_PAIR} sandbox purchase is available. Internal tester role is not required for this path.`
                : sandboxBlockedReason}
              tone={sandboxPurchaseAvailable ? "default" : "muted"}
            />
            <StatusLine
              label={`${STORE_PROVIDER_NAME} server rail`}
              value={sandboxMode.storePurchaseRailReadbackComplete
                ? sandboxMode.storePurchaseRailState === "sandbox_only" ? "Sandbox only" : "Off"
                : "Unavailable"}
              body={sandboxMode.storePurchaseRailReadbackComplete
                ? sandboxMode.storePurchaseRailState === "sandbox_only"
                  ? "The bounded sandbox server rail is enabled; live money remains separate and off."
                  : "The sandbox server rail is not enabled, so StoreKit will not open."
                : "The server rail could not be verified. Purchases fail closed until readback succeeds."}
              tone={sandboxMode.storePurchaseRailReadbackComplete && sandboxMode.storePurchaseRailState === "sandbox_only"
                ? "default"
                : "warning"}
            />
            <StatusLine
              label="RevenueCat configured"
              value={snapshot.configuration.shouldConfigure ? "Yes" : "No"}
              body={snapshot.configuration.shouldConfigure ? `Mode: ${snapshot.configuration.mode}.` : snapshot.configuration.reason ?? "RevenueCat is not configured."}
              tone={snapshot.configuration.shouldConfigure ? "default" : "warning"}
            />
            <StatusLine
              label={`${STORE_PROVIDER_NAME} billing`}
              value={snapshot.canMakePayments ? "Yes" : "No"}
              body={snapshot.canMakePayments ? "Purchases can be attempted on this device/account." : "Billing cannot make purchases on this device/account right now."}
              tone={snapshot.canMakePayments ? "default" : "warning"}
            />
            <StatusLine
              label="Premium offering"
              value={premiumTarget.offeringAvailable ? premiumTarget.resolvedOfferingId ?? "Available" : "Missing"}
              body={`Configured offering: ${premiumTarget.configuredOfferingId}. Current offering: ${snapshot.currentOfferingId ?? "none"}.`}
              tone={premiumTarget.offeringAvailable ? "default" : "warning"}
            />
            <StatusLine
              label="Premium packages"
              value={String(premiumTarget.packageCount)}
              body={premiumTarget.packageCount > 0 ? `Packages: ${premiumTarget.availablePackageIds.join(", ") || "available"}.` : "No purchasable Premium package was returned."}
              tone={premiumTarget.packageCount > 0 ? "default" : "warning"}
            />
            <StatusLine
              label="Tester-role diagnostic"
              value={sandboxMode.allowedRoles.length > 0 ? "Present" : "Not required"}
              body={sandboxMode.allowedRoles.length > 0
                ? `Diagnostics: ${sandboxMode.allowedRoles.join(", ")}. Provider-backed sandbox purchase does not require this role.`
                : `No owner/operator/internal-tester role is required when ${STORE_PROVIDER_PAIR} sandbox purchase is available.`}
              tone="muted"
            />
            <StatusLine
              label="Money safety flags"
              value={sandboxMode.liveMoneyEnabled || sandboxMode.payoutsEnabled || sandboxMode.cashoutEnabled ? "Blocked" : "Off"}
              body={`liveMoney=${sandboxMode.liveMoneyEnabled ? "on" : "off"}; payouts=${sandboxMode.payoutsEnabled ? "on" : "off"}; cashout=${sandboxMode.cashoutEnabled ? "on" : "off"}.`}
              tone={sandboxMode.liveMoneyEnabled || sandboxMode.payoutsEnabled || sandboxMode.cashoutEnabled ? "warning" : "default"}
            />
            <StatusLine
              label="Annual setup"
              value="Pending"
              body="Annual Premium setup is still being finalized. Use the available monthly/test path where supported."
              tone="muted"
            />
            <TouchableOpacity
              style={[styles.ghostButton, loading && styles.secondaryButtonDisabled]}
              activeOpacity={0.86}
              disabled={loading}
              onPress={() => {
                void refreshSnapshot(true);
              }}
            >
              <Text style={styles.ghostButtonText}>{loading ? "Checking..." : "Recheck status"}</Text>
            </TouchableOpacity>
          </PremiumAccordion>
        </>
      )}
      </ScrollView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: "#06070B",
  },
  routeContainer: {
    flex: 1,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,5,10,0.72)",
  },
  screen: {
    flex: 1,
    backgroundColor: "transparent",
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(16,18,25,0.96)",
    padding: 18,
    gap: 8,
  },
  heroKicker: {
    color: "#FFB8C5",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
  },
  heroBody: {
    color: "#D8E1F3",
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "600",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(16,18,25,0.96)",
    padding: 16,
    gap: 12,
  },
  cardKicker: {
    color: "#8793AA",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  sandboxNotice: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(112,211,166,0.28)",
    backgroundColor: "rgba(25,69,49,0.32)",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  sandboxNoticeText: {
    color: "#DDF9EB",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  sandboxKicker: {
    color: "#CFF7E3",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  sandboxTitle: {
    color: "#F6FFF9",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  sandboxBody: {
    color: "#CFEADA",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  sandboxDetail: {
    color: "#AFCBBC",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  cardTitle: {
    color: "#F4F7FC",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  body: {
    color: "#AEB8CB",
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "600",
  },
  statusLine: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statusLineCopy: {
    flex: 1,
    gap: 4,
  },
  statusLabel: {
    color: "#F4F7FC",
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "900",
  },
  statusBody: {
    color: "#9CA7BA",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  statusPill: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(112,211,166,0.26)",
    backgroundColor: "rgba(112,211,166,0.12)",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillMuted: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  statusPillWarning: {
    borderColor: "rgba(244,181,84,0.32)",
    backgroundColor: "rgba(244,181,84,0.12)",
  },
  statusPillText: {
    color: "#CFF7E3",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
  },
  statusPillTextMuted: {
    color: "#C4CEE2",
  },
  statusPillTextWarning: {
    color: "#FFE0A8",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
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
  purchaseBlockedReason: {
    color: "#FFE0A8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryButton: {
    flex: 1,
    minWidth: 142,
    minHeight: 46,
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
  restoreLink: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  restoreLinkText: {
    color: "#B8C3D8",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  restoreLinkAction: {
    color: "#F4F7FC",
    fontWeight: "900",
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
  noticeCard: {
    borderRadius: 14,
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
  accordion: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(15,17,24,0.95)",
    overflow: "hidden",
  },
  accordionHeader: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  accordionCopy: {
    flex: 1,
    gap: 4,
  },
  accordionTitle: {
    color: "#F6F8FE",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  accordionSummary: {
    color: "#9EA9BC",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "600",
  },
  chevron: {
    color: "#DCE4F2",
    fontSize: 23,
    lineHeight: 24,
    fontWeight: "700",
  },
  accordionBody: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 9,
  },
  unlockRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  unlockDot: {
    color: "#FFB8C5",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  unlockText: {
    flex: 1,
    color: "#E7EDF8",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
});
