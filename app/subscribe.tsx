import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, ImageBackground, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../_lib/analytics";
import {
  getCachedMonetizationSnapshot,
  hasCurrentStorePremiumSubscription,
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
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../_lib/accountSessionAuthority";
import { resolvePremiumPurchaseReadiness } from "../_lib/premiumPurchaseReadiness.mjs";
import { useSession } from "../_lib/session";
import {
  CHILLYWOOD_VISUAL,
  ChillywoodPrimaryActionFill,
} from "../components/ui/chillywood-visual-system";

const FRIENDLY_UNAVAILABLE_MESSAGE =
  "Premium purchases are temporarily unavailable while setup is being finalized.";
const PREMIUM_BODY =
  "Watch-Party Live, Live Watch-Party, creator tools, and ad-free viewing.";
const PREMIUM_PURCHASE_PREVIEW_NOTICE =
  "Purchase preview is active. Your store will not charge a payment method.";
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
    storePremiumActive: hasCurrentStorePremiumSubscription(snapshot),
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
  const { isLoading: sessionLoading, isSignedIn, user, authority, authorityStatus } = useSession();
  const betaProgram = useOptionalBetaProgram();
  const ownerKey = !sessionLoading && isSignedIn && authorityStatus === "active" && authority && !authority.restoreOnly
    && authority.userId === user?.id
    ? JSON.stringify([authority.userId, authority.accountId, authority.sessionGeneration]) : "unavailable";
  const scopeRef = useRef({ key: ownerKey, readGeneration: 0 });
  if (scopeRef.current.key !== ownerKey) scopeRef.current = { key: ownerKey, readGeneration: 0 };
  const scope = scopeRef.current;
  const actionRef = useRef<typeof scope | null>(null);
  const mountedRef = useRef(true);
  const currentOwner = useCallback(() => mountedRef.current && scopeRef.current === scope && ownerKey !== "unavailable"
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()), [authority, ownerKey, scope]);
  const [snapshotState, setSnapshotState] = useState(() => ({ key: ownerKey, value: getCachedMonetizationSnapshot() }));
  const snapshot = snapshotState.key === ownerKey ? snapshotState.value : getCachedMonetizationSnapshot();
  const setSnapshot = useCallback((value: MonetizationSnapshot) => {
    if (currentOwner() && value.userId === authority?.userId) setSnapshotState({ key: ownerKey, value });
  }, [authority?.userId, currentOwner, ownerKey]);
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
  const [snapshotReadFailed, setSnapshotReadFailed] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; scopeRef.current.readGeneration += 1; };
  }, []);

  useEffect(() => {
    setLoading(false); setSnapshotReadFailed(false); setPurchaseBusy(false); setRestoreBusy(false); setManageBusy(false); setNotice(null);
  }, [ownerKey]);

  useEffect(() => {
    const unsubscribe = subscribeToMonetizationSnapshot(() => {
      setSnapshot(getCachedMonetizationSnapshot());
    });
    return unsubscribe;
  }, [setSnapshot]);

  const activePurchaseMode = sandboxMode.enabled ? INTERNAL_TESTER_SANDBOX_PURCHASE_MODE : "public";

  const refreshSnapshot = useCallback(async (forceRefresh = true, mode: MonetizationPurchaseMode = activePurchaseMode) => {
    if (!currentOwner()) return null;
    const generation = ++scope.readGeneration;
    const current = () => currentOwner() && generation === scope.readGeneration;
    setLoading(true);
    try {
      const nextSnapshot = await readMonetizationSnapshot({
        forceRefresh,
        purchaseMode: mode,
        userId: user?.id ?? null,
        expectedAuthority: authority,
      });
      if (!current()) return null;
      setSnapshotReadFailed(false);
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch {
      if (current()) {
        setSnapshotReadFailed(true);
        setNotice("Unable to check Premium status. Try again or restore purchases.");
      }
      return null;
    } finally {
      if (current()) setLoading(false);
    }
  }, [activePurchaseMode, authority, currentOwner, scope, setSnapshot, user?.id]);

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
        if (!active || !currentOwner()) return;
        setSandboxMode(state);
        void refreshSnapshot(false, state.mode);
      })
      .catch(() => {
        if (!active || !currentOwner()) return;
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
  }, [betaProgram?.isActive, currentOwner, isSignedIn, refreshSnapshot, sessionLoading, user?.email, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (sessionLoading) return undefined;
      void refreshSnapshot(true, activePurchaseMode);
      return () => { scope.readGeneration += 1; };
    }, [activePurchaseMode, refreshSnapshot, scope, sessionLoading]),
  );

  useEffect(() => {
    if (sessionLoading) return undefined;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshSnapshot(true, activePurchaseMode);
      }
    });
    return () => subscription.remove();
  }, [activePurchaseMode, refreshSnapshot, sessionLoading]);

  const toggleAccordion = useCallback((id: string) => {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  const premiumTarget = snapshot.targets.premium_subscription;
  const hasPremium = currentOwner() && !snapshotReadFailed && !!premiumTarget.hasEntitlement;
  const currentStorePremiumActive = currentOwner() && hasCurrentStorePremiumSubscription(snapshot);
  const premiumVerificationPending = currentStorePremiumActive && !hasPremium;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained subscription state contract; the current render path intentionally does not read it.
  const premiumActiveOutsideCurrentStore = hasPremium && !currentStorePremiumActive;
  const purchaseReadiness = snapshotReadFailed
    ? { ready: false, message: "Unable to check Premium status. Recheck or restore purchases before continuing." }
    : buildPurchaseReadiness(snapshot, activePurchaseMode, sandboxMode, isSignedIn);
  const purchaseReady = !snapshotReadFailed && purchaseReadiness.ready;
  const sandboxPurchaseAvailable = sandboxMode.enabled && purchaseReady && !hasPremium;
  const sandboxBlockedReason = purchaseReadiness.message;
  const canPurchase = currentOwner() && purchaseReady && !hasPremium;
  const canRestore = currentOwner() && snapshot.configuration.shouldConfigure;
  const canManage = currentOwner() && snapshot.configuration.shouldConfigure && currentStorePremiumActive;
  const busy = loading || purchaseBusy || restoreBusy || manageBusy;
  const purchaseStatusLabel = premiumVerificationPending ? "Verification pending" : hasPremium
    ? "Entitled"
    : sandboxMode.enabled
      ? purchaseReady ? "Purchase available" : "Temporarily unavailable"
      : purchaseReady ? "Available" : "Temporarily unavailable";
  const purchaseStatusTone = purchaseReady || hasPremium ? "default" : "warning";
  const availabilitySummary = premiumVerificationPending ? purchaseReadiness.message : hasPremium
    ? currentStorePremiumActive
      ? `An active Premium subscription is present on ${STORE_PROVIDER_NAME}.`
      : `Premium is active for this account, but there is no active ${STORE_PROVIDER_NAME} Premium subscription to manage on this device.`
    : purchaseReady
      ? sandboxMode.enabled
        ? `Premium is available through ${STORE_PROVIDER_NAME} for this account.`
        : "A verified store subscription is ready for this account."
      : FRIENDLY_UNAVAILABLE_MESSAGE;
  const primaryActionLabel = premiumVerificationPending ? "Recheck Premium status" : hasPremium
    ? currentStorePremiumActive ? "Manage subscription" : "Done"
    : purchaseReady
      ? "Start Premium"
      : "Check purchase availability";
  const primaryActionBusy = hasPremium && currentStorePremiumActive ? manageBusy : purchaseBusy;

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

  const onRecheckPendingPremium = useCallback(async () => {
    if (!currentOwner() || actionRef.current === scope) return;
    actionRef.current = scope;
    setPurchaseBusy(true);
    setNotice("Checking Premium status…");
    try {
      const nextSnapshot = await refreshSnapshot(true, activePurchaseMode);
      if (!nextSnapshot || !currentOwner()) return;
      setNotice(buildPurchaseReadiness(nextSnapshot, activePurchaseMode, sandboxMode, true).message);
    } finally {
      if (actionRef.current === scope) actionRef.current = null;
      if (currentOwner()) setPurchaseBusy(false);
    }
  }, [activePurchaseMode, currentOwner, refreshSnapshot, sandboxMode, scope]);

  const onPurchase = useCallback(async () => {
    if (!isSignedIn) {
      onSignIn();
      return;
    }
    const initiatingAuthority = getCurrentAccountSessionAuthoritySnapshot();
    if (
      !currentOwner() || actionRef.current === scope || !initiatingAuthority
      || initiatingAuthority.restoreOnly
      || initiatingAuthority.userId !== user?.id
    ) {
      setNotice("Recheck the signed-in account before starting Premium.");
      return;
    }

    actionRef.current = scope;
    setPurchaseBusy(true);
    try {
      let requestedPurchaseMode: MonetizationPurchaseMode = activePurchaseMode;
      let requestedPackageId = premiumTarget.recommendedPackageId;

      if (!canPurchase) {
        setNotice(`Checking ${STORE_PROVIDER_NAME} purchase availability...`);
        setExpanded((current) => ({ ...current, "purchase-details": true }));

        try {
          const nextSandboxMode = await resolveInternalTesterSandboxPurchaseMode({
            userId: user?.id ?? null,
            email: user?.email ?? null,
            betaAccessActive: betaProgram?.isActive === true,
          });
          if (!currentOwner()) return;
          requestedPurchaseMode = nextSandboxMode.enabled
            ? INTERNAL_TESTER_SANDBOX_PURCHASE_MODE
            : "public";
          setSandboxMode(nextSandboxMode);

          const nextSnapshot = await refreshSnapshot(true, requestedPurchaseMode);
          if (!nextSnapshot || !currentOwner()) return;
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
          if (currentOwner()) setNotice(`Unable to verify ${STORE_PROVIDER_NAME} purchase availability right now. Try again.`);
          return;
        }
      }

      if (!currentOwner()) return;
      setNotice(`Opening ${STORE_PROVIDER_NAME}…`);
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
          initiatingAuthority,
          onPhase: (phase) => {
            if (!currentOwner()) return;
            setNotice(phase === "store_processing"
              ? `${STORE_PROVIDER_NAME} is processing the subscription…`
              : phase === "restoring_existing"
                ? "Existing subscription found. Restoring it to this account…"
                : "Verifying Premium access…");
          },
        });
        if (!currentOwner()) return;
        setNotice(result.message);
        setSnapshot(getCachedMonetizationSnapshot());
      } catch {
        if (currentOwner()) setNotice("Unable to start Premium purchase right now.");
      }
    } finally {
      if (actionRef.current === scope) actionRef.current = null;
      if (currentOwner()) setPurchaseBusy(false);
    }
  }, [
    activePurchaseMode,
    betaProgram?.isActive,
    canPurchase,
    currentOwner,
    isSignedIn,
    onSignIn,
    premiumTarget.recommendedPackageId,
    refreshSnapshot,
    scope,
    setSnapshot,
    snapshot.status,
    user?.email,
    user?.id,
  ]);

  const onRestore = useCallback(async () => {
    if (!isSignedIn) {
      onSignIn();
      return;
    }
    const initiatingAuthority = getCurrentAccountSessionAuthoritySnapshot();
    if (
      !currentOwner() || actionRef.current === scope || !initiatingAuthority
      || initiatingAuthority.restoreOnly
      || initiatingAuthority.userId !== user?.id
    ) {
      setNotice("Recheck the signed-in account before restoring purchases.");
      return;
    }

    if (!canRestore) {
      setNotice("Restore purchases is temporarily unavailable while setup is being finalized.");
      return;
    }

    actionRef.current = scope;
    setRestoreBusy(true);
    setNotice("Restoring purchases...");
    trackEvent("premium_subscribe_restore_requested", {
      source: "subscribe",
      snapshotStatus: snapshot.status,
    });

    try {
      const result = await restoreMonetizationAccess({
        purchaseMode: activePurchaseMode,
        userId: user?.id ?? null,
        initiatingAuthority,
        onPhase: (phase) => {
          if (!currentOwner()) return;
          setNotice(phase === "verifying_authority"
            ? "Verifying restored Premium access…"
            : "Restoring purchases for this account…");
        },
      });
      if (!currentOwner()) return;
      const currentSnapshot = getCachedMonetizationSnapshot();
      setNotice(currentSnapshot.targets.premium_subscription.hasEntitlement
        ? "Purchases restored. Premium is active."
        : result.message);
      setSnapshot(currentSnapshot);
    } catch {
      if (currentOwner()) setNotice("Unable to restore purchases right now.");
    } finally {
      if (actionRef.current === scope) actionRef.current = null;
      if (currentOwner()) setRestoreBusy(false);
    }
  }, [activePurchaseMode, canRestore, currentOwner, isSignedIn, onSignIn, scope, setSnapshot, snapshot.status, user?.id]);

  const onManage = useCallback(async () => {
    if (!isSignedIn) {
      onSignIn();
      return;
    }

    if (!canManage) {
      setNotice(`There is no active ${STORE_PROVIDER_NAME} Premium subscription to manage on this device.`);
      return;
    }

    setManageBusy(true);
    try {
      const opened = await openManageSubscriptionFlow();
      if (!currentOwner()) return;
      setNotice(opened ? `Opened the ${STORE_PROVIDER_NAME} subscription manager.` : `Unable to open ${STORE_PROVIDER_NAME} subscription management on this device.`);
    } finally {
      if (currentOwner()) setManageBusy(false);
    }
  }, [canManage, currentOwner, isSignedIn, onSignIn]);

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
          <Text style={styles.heroKicker}>Chi&apos;llywood Premium</Text>
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
            Premium is account-owned. Sign in so Chi&apos;llywood can check your subscription or restore purchases safely.
          </Text>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.88} onPress={onSignIn}>
            <ChillywoodPrimaryActionFill radius={14} />
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.card} testID="premium-status-card" collapsable={false}>
            <View testID={hasPremium ? "premium-active-receipt" : undefined}>
              <Text style={styles.cardTitle}>{premiumVerificationPending ? "Premium verification is pending." : hasPremium ? "Premium is active." : "Premium is not active."}</Text>
              <Text style={styles.body}>
                {premiumVerificationPending ? purchaseReadiness.message : hasPremium
                  ? currentStorePremiumActive
                    ? `Your Premium access is active and managed through ${STORE_PROVIDER_NAME}.`
                    : `Your Premium access is active on this account. There is no active ${STORE_PROVIDER_NAME} Premium subscription on this device to manage.`
                  : purchaseReady ? "Choose Premium to continue." : FRIENDLY_UNAVAILABLE_MESSAGE}
              </Text>
            </View>
            {sandboxMode.enabled && !hasPremium && !premiumVerificationPending ? (
              <View style={styles.sandboxNotice}>
                <Text style={styles.sandboxNoticeText}>{PREMIUM_PURCHASE_PREVIEW_NOTICE}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
              activeOpacity={0.88}
              disabled={busy}
              onPress={premiumVerificationPending ? onRecheckPendingPremium : hasPremium ? (currentStorePremiumActive ? onManage : onSecondaryClose) : onPurchase}
              testID="premium-purchase-button"
              accessibilityRole="button"
              accessibilityLabel={premiumVerificationPending ? "Recheck Premium status" : hasPremium
                ? currentStorePremiumActive
                  ? `Manage Chi'llywood Premium subscription in ${STORE_PROVIDER_NAME}`
                  : "Done with Chi'llywood Premium"
                : "Start Chi'llywood Premium purchase"}
              accessibilityHint={!hasPremium && !purchaseReady
                ? "Checks purchase availability and explains any remaining setup issue."
                : undefined}
              accessibilityState={{ disabled: busy }}
            >
              <ChillywoodPrimaryActionFill opacity={busy ? 0.56 : 1} radius={14} />
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
            <View style={styles.noticeCard} accessibilityLiveRegion="polite">
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <PremiumAccordion
            id="purchase-details"
            title="Purchase details"
            summary="Current Premium access and store availability"
            expanded={expanded}
            onToggle={toggleAccordion}
          >
            <StatusLine
              label="Premium status"
              value={hasPremium ? "Active" : "Not active"}
              body={hasPremium ? "Entitlement readback shows Premium active." : "Premium remains locked until an entitlement is confirmed."}
              tone={hasPremium ? "default" : "muted"}
            />
            {hasPremium ? (
              <StatusLine
                label={`${STORE_PROVIDER_NAME} Premium subscription`}
                value={currentStorePremiumActive ? "Active here" : "Not on this store"}
                body={currentStorePremiumActive
                  ? `This device can open ${STORE_PROVIDER_NAME} subscription management for the active Premium product.`
                  : `Premium authority is active for the account, but ${STORE_PROVIDER_NAME} has no active Premium product to manage here.`}
                tone={currentStorePremiumActive ? "default" : "muted"}
              />
            ) : null}
            <StatusLine
              label="Purchase readiness"
              value={purchaseStatusLabel}
              body={availabilitySummary}
              tone={purchaseStatusTone}
            />
            <StatusLine
              label="Store availability"
              value={sandboxPurchaseAvailable ? "Available" : "Unavailable"}
              body={sandboxPurchaseAvailable
                ? `Premium can be purchased through ${STORE_PROVIDER_NAME} for this account.`
                : sandboxBlockedReason}
              tone={sandboxPurchaseAvailable ? "default" : "muted"}
            />
            <StatusLine
              label={`${STORE_PROVIDER_NAME} connection`}
              value={sandboxMode.storePurchaseRailReadbackComplete
                ? sandboxMode.storePurchaseRailState === "sandbox_only" ? "Available" : "Unavailable"
                : "Unavailable"}
              body={sandboxMode.storePurchaseRailReadbackComplete
                ? sandboxMode.storePurchaseRailState === "sandbox_only"
                  ? "The store connection is available for this purchase."
                  : `The ${STORE_PROVIDER_NAME} purchase connection is not available right now.`
                : "The store connection could not be verified. No purchase can begin until it is available."}
              tone={sandboxMode.storePurchaseRailReadbackComplete && sandboxMode.storePurchaseRailState === "sandbox_only"
                ? "default"
                : "warning"}
            />
            <StatusLine
              label="Store service"
              value={snapshot.configuration.shouldConfigure ? "Available" : "Unavailable"}
              body={snapshot.configuration.shouldConfigure ? "The subscription service is available." : "The subscription service is unavailable right now."}
              tone={snapshot.configuration.shouldConfigure ? "default" : "warning"}
            />
            <StatusLine
              label={`${STORE_PROVIDER_NAME} billing`}
              value={snapshot.canMakePayments ? "Yes" : "No"}
              body={snapshot.canMakePayments ? "Purchases can be attempted on this device/account." : "Billing cannot make purchases on this device/account right now."}
              tone={snapshot.canMakePayments ? "default" : "warning"}
            />
            <StatusLine
              label="Premium plan"
              value={premiumTarget.offeringAvailable && premiumTarget.packageCount > 0 ? "Available" : "Unavailable"}
              body={premiumTarget.offeringAvailable && premiumTarget.packageCount > 0
                ? "A Premium plan is available for this account."
                : "A Premium plan could not be loaded right now."}
              tone={premiumTarget.offeringAvailable ? "default" : "warning"}
            />
            <StatusLine
              label="Plan options"
              value={premiumTarget.packageCount > 0 ? "Available" : "Unavailable"}
              body={premiumTarget.packageCount > 0 ? "Your store will show the available plan, price, and renewal terms." : "No purchasable Premium plan is available right now."}
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.glassBorder,
    backgroundColor: CHILLYWOOD_VISUAL.glassBackground,
    padding: 18,
    gap: 8,
    shadowColor: CHILLYWOOD_VISUAL.primaryGlow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 16,
    elevation: 8,
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.glassBorder,
    backgroundColor: CHILLYWOOD_VISUAL.glassBackground,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
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
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.primaryBorder,
    backgroundColor: CHILLYWOOD_VISUAL.accentBlue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    overflow: "hidden",
    shadowColor: CHILLYWOOD_VISUAL.primaryGlow,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.34,
    shadowRadius: 14,
    elevation: 10,
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
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
    padding: 14,
  },
  noticeText: {
    color: "#F2F6FF",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  accordion: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.glassBorder,
    backgroundColor: CHILLYWOOD_VISUAL.glassBackground,
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
    borderTopColor: CHILLYWOOD_VISUAL.controlBorder,
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
