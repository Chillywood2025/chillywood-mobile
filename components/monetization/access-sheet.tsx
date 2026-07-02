import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { trackEvent } from "../../_lib/analytics";
import {
  INTERNAL_TESTER_SANDBOX_PURCHASE_MODE,
  openManageSubscriptionFlow,
  purchaseBlockedAccess,
  readMonetizationAccessSheetState,
  resolveInternalTesterSandboxPurchaseMode,
  restoreMonetizationAccess,
  type InternalTesterSandboxPurchaseModeState,
  type MonetizationAccessPurchaseOutcome,
  type MonetizationAccessSheetState,
  type MonetizationGateResolution,
  type MonetizationPurchaseMode,
  type MonetizationRestoreOutcome,
} from "../../_lib/monetization";
import { useOptionalBetaProgram } from "../../_lib/betaProgram";
import { useSession } from "../../_lib/session";
import { MoneyScopeInfoButton } from "./MoneyScopeInfoButton";
import { MoneyOfferCard, MoneyStatusChip } from "./money-ui";

export type AccessSheetReason = "premium_required" | "party_pass_required";
export type AccessSheetStatusTone = "neutral" | "success" | "error";
export type AccessSheetActionFeedback = {
  message?: string;
  tone?: AccessSheetStatusTone;
};

type AccessSheetGate = {
  reason?: string | null;
  monetization?: MonetizationGateResolution | null;
};

export const getAccessSheetCopy = (options: {
  reason: AccessSheetReason;
  appDisplayName?: string;
  premiumUpsellTitle?: string;
  premiumUpsellBody?: string;
}) => {
  const appDisplayName = String(options.appDisplayName ?? "Chi'llywood").trim() || "Chi'llywood";
  if (options.reason === "premium_required") {
    return {
      title: String(options.premiumUpsellTitle ?? "").trim() || "Go Premium",
      body: String(options.premiumUpsellBody ?? "").trim()
        || `Premium unlocks premium titles and premium-entry rooms inside ${appDisplayName}, while keeping playback ad-free.`,
      actionLabel: "Unlock Premium",
      kicker: "PREMIUM ACCESS",
    };
  }

  return {
    title: "Unlock This Room",
    body: `This room uses Party Pass access. Unlock it once and jump back in without breaking the ${appDisplayName} flow.`,
    actionLabel: "Get Party Pass",
    kicker: "PARTY PASS",
  };
};

export const getAccessSheetEntryLabel = (options: {
  reason: AccessSheetReason;
  canPurchase?: boolean;
}) => {
  if (options.reason === "premium_required") {
    return options.canPurchase ? "Unlock Premium" : "View Premium Access";
  }

  return options.canPurchase ? "Get Party Pass" : "View Room Access";
};

type AccessSheetProps = {
  visible: boolean;
  reason: AccessSheetReason;
  gate?: AccessSheetGate | null;
  appDisplayName?: string;
  premiumUpsellTitle?: string;
  premiumUpsellBody?: string;
  deferredMonetization?: boolean;
  kickerOverride?: string;
  titleOverride?: string;
  bodyOverride?: string;
  actionLabelOverride?: string;
  onPurchaseResult?: (result: MonetizationAccessPurchaseOutcome) => AccessSheetActionFeedback | Promise<AccessSheetActionFeedback | void> | void;
  onRestoreResult?: (result: MonetizationRestoreOutcome) => AccessSheetActionFeedback | Promise<AccessSheetActionFeedback | void> | void;
  onClose: () => void;
};

export function AccessSheet({
  visible,
  reason,
  gate,
  appDisplayName,
  premiumUpsellTitle,
  premiumUpsellBody,
  deferredMonetization = false,
  kickerOverride,
  titleOverride,
  bodyOverride,
  actionLabelOverride,
  onPurchaseResult,
  onRestoreResult,
  onClose,
}: AccessSheetProps) {
  const [sheetState, setSheetState] = useState<MonetizationAccessSheetState | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<AccessSheetStatusTone>("neutral");
  const { user } = useSession();
  const betaProgram = useOptionalBetaProgram();
  const [sandboxMode, setSandboxMode] = useState<InternalTesterSandboxPurchaseModeState>({
    enabled: false,
    mode: "public",
    label: "Internal tester sandbox purchases",
    reason: "Checking tester access.",
    allowedRoles: [],
    liveMoneyEnabled: false,
    payoutsEnabled: false,
  });

  const resolvePurchaseMode = useCallback(async (): Promise<MonetizationPurchaseMode> => {
    const state = await resolveInternalTesterSandboxPurchaseMode({
      userId: user?.id ?? null,
      email: user?.email ?? null,
      betaAccessActive: betaProgram?.isActive === true,
    });
    setSandboxMode(state);
    return state.enabled ? INTERNAL_TESTER_SANDBOX_PURCHASE_MODE : "public";
  }, [betaProgram?.isActive, user?.email, user?.id]);

  const loadSheetState = useCallback(async () => {
    const purchaseMode = await resolvePurchaseMode();
    const nextState = await readMonetizationAccessSheetState({
      gate,
      purchaseMode,
      userId: user?.id ?? null,
      appDisplayName,
      premiumUpsellTitle,
      premiumUpsellBody,
    });
    setSheetState(nextState);
    return nextState;
  }, [appDisplayName, gate, premiumUpsellBody, premiumUpsellTitle, resolvePurchaseMode, user?.id]);

  useEffect(() => {
    if (!visible) return;

    let active = true;
    setLoadingState(true);

    loadSheetState()
      .catch(() => {
        if (!active) return;
        setSheetState(null);
        setStatusTone("error");
        setStatusMessage(
          deferredMonetization
            ? "Unable to load the current Premium access status right now."
            : "Unable to load the current Chi'llywood purchase options.",
        );
      })
      .finally(() => {
        if (active) setLoadingState(false);
      });

    return () => {
      active = false;
    };
  }, [deferredMonetization, loadSheetState, visible]);

  useEffect(() => {
    if (visible) return;
    setStatusMessage("");
    setStatusTone("neutral");
  }, [visible]);

  const baseCopy = useMemo(() => (
    sheetState?.presentation
      ?? getAccessSheetCopy({
          reason,
          appDisplayName,
          premiumUpsellTitle,
          premiumUpsellBody,
        })
  ), [appDisplayName, premiumUpsellBody, premiumUpsellTitle, reason, sheetState?.presentation]);

  const copy = {
    kicker: deferredMonetization
      ? (reason === "premium_required" ? "PREMIUM ACCESS" : "ROOM ACCESS")
      : (kickerOverride ?? baseCopy.kicker),
    title: deferredMonetization
      ? (reason === "premium_required" ? "Premium access is not currently available" : "Room access is not currently available")
      : (titleOverride ?? baseCopy.title),
    body: deferredMonetization
      ? (
          reason === "premium_required"
            ? "Premium access is not currently available for this title on this device or account. Access will appear here when it becomes available."
            : "Party Pass access is not currently available for this room on this device or account. Access will appear here when it becomes available."
        )
      : (bodyOverride ?? baseCopy.body),
    actionLabel: deferredMonetization
      ? "Got it"
      : (
          sheetState?.primaryAction === "retry"
            ? sheetState.primaryLabel
            : actionLabelOverride ?? sheetState?.primaryLabel ?? baseCopy.actionLabel
        ),
  };
  const busy = loadingState || purchaseBusy || restoreBusy || manageBusy;
  const analyticsPayload = useMemo(() => ({
    reason,
    gateReason: String(gate?.reason ?? "").trim().toLowerCase() || "unknown",
    primaryTargetId: gate?.monetization?.primaryTargetId ?? "none",
    purchaseTargetId: gate?.monetization?.purchaseTargetId ?? "none",
    snapshotStatus: sheetState?.snapshot.status ?? "unknown",
    canPurchase: sheetState?.snapshot.canMakePayments ?? false,
    offeringAvailable: !!sheetState?.offer,
    kicker: copy.kicker,
  }), [
    copy.kicker,
    gate?.monetization?.primaryTargetId,
    gate?.monetization?.purchaseTargetId,
    gate?.reason,
    reason,
    sheetState?.offer,
    sheetState?.snapshot.canMakePayments,
    sheetState?.snapshot.status,
  ]);
  const onCloseTracked = useCallback((source: "backdrop" | "button" | "system") => {
    trackEvent("monetization_paywall_dismissed", {
      ...analyticsPayload,
      source,
    });
    onClose();
  }, [analyticsPayload, onClose]);
  const opensPremiumManagement = reason === "premium_required"
    || gate?.monetization?.primaryTargetId === "premium_subscription"
    || gate?.monetization?.purchaseTargetId === "premium_subscription";
  const openPremiumManagement = useCallback((source: "primary" | "utility" | "fallback") => {
    trackEvent("monetization_manage_premium_opened", {
      ...analyticsPayload,
      source,
    });
    onClose();
    router.push("/subscribe" as Parameters<typeof router.push>[0]);
  }, [analyticsPayload, onClose]);

  const statusToneStyle = statusTone === "success"
    ? styles.statusCardSuccess
    : statusTone === "error"
      ? styles.statusCardError
      : styles.statusCardNeutral;
  const statusTextStyle = statusTone === "success"
    ? styles.statusTextSuccess
    : statusTone === "error"
      ? styles.statusTextError
      : styles.statusTextNeutral;
  const helperToneStyle = deferredMonetization
    ? styles.helperCardNeutral
    : sheetState?.helperTone === "warning" ? styles.helperCardWarning : styles.helperCardNeutral;
  const helperTextStyle = deferredMonetization
    ? styles.helperTextNeutral
    : sheetState?.helperTone === "warning" ? styles.helperTextWarning : styles.helperTextNeutral;

  const onPrimaryPress = useCallback(async () => {
    if (deferredMonetization) {
      onCloseTracked("button");
      return;
    }

    setStatusMessage("");
    setStatusTone("neutral");

    if (sheetState?.primaryDisabled) {
      setStatusTone("error");
      setStatusMessage(sheetState.helperBody || "This access path needs provider/setup resolution. Restore, manage, or recheck status from this sheet.");
      await loadSheetState().catch(() => undefined);
      return;
    }

    if (sheetState?.primaryAction === "retry" || !gate) {
      if (opensPremiumManagement && (
        sandboxMode.enabled
        || sheetState?.primaryLabel.toLowerCase().includes("premium")
        || sheetState?.primaryLabel.toLowerCase().includes("status")
      )) {
        openPremiumManagement("primary");
        return;
      }

      setLoadingState(true);
      try {
        await loadSheetState();
      } catch {
        setStatusTone("error");
        setStatusMessage("Unable to refresh this offer right now.");
      } finally {
        setLoadingState(false);
      }
      return;
    }

    setPurchaseBusy(true);
    trackEvent("monetization_purchase_started", analyticsPayload);
    try {
      const purchaseMode = sandboxMode.enabled ? INTERNAL_TESTER_SANDBOX_PURCHASE_MODE : await resolvePurchaseMode();
      const result = await purchaseBlockedAccess({ gate, purchaseMode, userId: user?.id ?? null });
      trackEvent(result.ok ? "monetization_purchase_success" : "monetization_purchase_failed", {
        ...analyticsPayload,
        message: result.message,
        packageId: result.packageId ?? "none",
        productId: result.productId ?? "none",
        targetId: result.targetId ?? "none",
      });
      let feedback: AccessSheetActionFeedback = {
        message: result.ok ? "Purchase completed. Rechecking access…" : result.message,
        tone: result.ok ? "success" : "error",
      };

      if (onPurchaseResult) {
        const nextFeedback = await onPurchaseResult(result);
        if (nextFeedback?.message || nextFeedback?.tone) {
          feedback = {
            ...feedback,
            ...nextFeedback,
          };
        }
      }

      setStatusTone(feedback.tone ?? "neutral");
      setStatusMessage(feedback.message ?? "");
      await loadSheetState();
    } catch {
      trackEvent("monetization_purchase_failed", {
        ...analyticsPayload,
        message: "Unable to complete this purchase right now.",
      });
      setStatusTone("error");
      setStatusMessage("Unable to complete this purchase right now.");
    } finally {
      setPurchaseBusy(false);
    }
  }, [
    analyticsPayload,
    deferredMonetization,
    gate,
    loadSheetState,
    onCloseTracked,
    onPurchaseResult,
    openPremiumManagement,
    opensPremiumManagement,
    resolvePurchaseMode,
    sandboxMode.enabled,
    sheetState?.primaryLabel,
    sheetState?.primaryAction,
    sheetState?.primaryDisabled,
    user?.id,
  ]);

  const onRestorePress = useCallback(async () => {
    setRestoreBusy(true);
    setStatusMessage("");
    setStatusTone("neutral");
    trackEvent("monetization_restore_started", analyticsPayload);

    try {
      const purchaseMode = sandboxMode.enabled ? INTERNAL_TESTER_SANDBOX_PURCHASE_MODE : await resolvePurchaseMode();
      const result = await restoreMonetizationAccess({ purchaseMode, userId: user?.id ?? null });
      trackEvent("monetization_restore_result", {
        ...analyticsPayload,
        ok: result.ok,
        message: result.message,
        activeEntitlementCount: result.snapshot.activeEntitlementIds.length,
      });
      let feedback: AccessSheetActionFeedback = {
        message: result.ok ? "Purchases restored. Rechecking access…" : result.message,
        tone: result.ok ? "success" : "error",
      };

      if (onRestoreResult) {
        const nextFeedback = await onRestoreResult(result);
        if (nextFeedback?.message || nextFeedback?.tone) {
          feedback = {
            ...feedback,
            ...nextFeedback,
          };
        }
      }

      setStatusTone(feedback.tone ?? "neutral");
      setStatusMessage(feedback.message ?? "");
      await loadSheetState();
    } catch {
      trackEvent("monetization_restore_result", {
        ...analyticsPayload,
        ok: false,
        message: "Unable to restore purchases right now.",
      });
      setStatusTone("error");
      setStatusMessage("Unable to restore purchases right now.");
    } finally {
      setRestoreBusy(false);
    }
  }, [analyticsPayload, loadSheetState, onRestoreResult, resolvePurchaseMode, sandboxMode.enabled, user?.id]);

  const onManagePress = useCallback(async () => {
    setManageBusy(true);
    setStatusMessage("");
    setStatusTone("neutral");

    try {
      if (opensPremiumManagement || sandboxMode.enabled) {
        openPremiumManagement("utility");
        return;
      }
      const opened = await openManageSubscriptionFlow();
      trackEvent("monetization_manage_subscription_opened", {
        ...analyticsPayload,
        opened,
      });
      if (opened) {
        setStatusTone("neutral");
        setStatusMessage("Subscription management opened.");
      } else {
        openPremiumManagement("fallback");
      }
    } finally {
      setManageBusy(false);
    }
  }, [analyticsPayload, openPremiumManagement, opensPremiumManagement, sandboxMode.enabled]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => onCloseTracked("system")}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onCloseTracked("backdrop")} />
        <View style={styles.sheet}>
          <Text style={styles.kicker}>{copy.kicker}</Text>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>

          {!deferredMonetization && sandboxMode.enabled ? (
            <View style={styles.sandboxCard}>
              <MoneyStatusChip label="Sandbox test mode" tone="warning" />
              <Text style={styles.sandboxText}>Google Play / RevenueCat sandbox test only.</Text>
              <Text style={styles.sandboxDetailText}>
                No production money, payout, cash-out, withdrawal, transfer, or payable balance is enabled.
              </Text>
            </View>
          ) : null}

          {!deferredMonetization && sheetState?.offer ? (
            <MoneyOfferCard
              kicker={sheetState.offer.badge}
              title={sheetState.offer.title}
              price={sheetState.offer.priceLabel}
              body={sheetState.offer.detail}
              statusLabel={reason === "premium_required" ? "App-wide" : "Room access"}
              statusTone={reason === "premium_required" ? "premium" : "success"}
            >
              {sheetState.offer.caption ? <Text style={styles.offerCaption}>{sheetState.offer.caption}</Text> : null}
            </MoneyOfferCard>
          ) : null}

          {!deferredMonetization ? (
            <MoneyScopeInfoButton
              scope={reason === "premium_required" ? "premium" : "watch_party_ticket"}
              label={reason === "premium_required" ? "What does Premium unlock?" : "What does this unlock?"}
            />
          ) : null}

          {sheetState || deferredMonetization ? (
            <View style={[styles.helperCard, helperToneStyle]}>
              <Text style={styles.helperKicker}>
                {deferredMonetization ? "ACCESS STATUS" : sheetState?.helperKicker}
              </Text>
              <Text style={[styles.helperText, helperTextStyle]}>
                {deferredMonetization
                  ? "This surface explains the current gate and routes you back to status, restore, manage, or support flows instead of leaving a dead end."
                  : sheetState?.helperBody}
              </Text>
            </View>
          ) : null}

          {statusMessage ? (
            <View style={[styles.statusCard, statusToneStyle]}>
              <Text style={[styles.statusText, statusTextStyle]}>{statusMessage}</Text>
            </View>
          ) : null}

          {!deferredMonetization && (sheetState?.canRestore || sheetState?.canManage) ? (
            <View style={styles.utilityRow}>
              {sheetState?.canRestore ? (
                <TouchableOpacity
                  style={[styles.utilityButton, restoreBusy && styles.utilityButtonDisabled]}
                  onPress={() => {
                    void onRestorePress();
                  }}
                  activeOpacity={0.86}
                  disabled={busy}
                >
                  {restoreBusy ? <ActivityIndicator color="#E5ECF8" size="small" /> : <Text style={styles.utilityText}>Restore purchases</Text>}
                </TouchableOpacity>
              ) : null}
              {sheetState?.canManage ? (
                <TouchableOpacity
                  style={[styles.utilityButton, manageBusy && styles.utilityButtonDisabled]}
                  onPress={() => {
                    void onManagePress();
                  }}
                  activeOpacity={0.86}
                  disabled={busy}
                >
                  {manageBusy ? <ActivityIndicator color="#E5ECF8" size="small" /> : <Text style={styles.utilityText}>{opensPremiumManagement ? "Manage Premium" : "Manage subscription"}</Text>}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => onCloseTracked("button")} activeOpacity={0.86} disabled={busy}>
              <Text style={styles.secondaryText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
              onPress={() => {
                void onPrimaryPress();
              }}
              activeOpacity={0.9}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryText}>{copy.actionLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(6,8,14,0.72)",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 18,
  },
  sheet: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(10,12,18,0.98)",
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8,
  },
  kicker: {
    color: "#A7B3CA",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: "#F3F6FB",
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    color: "#AAB4C7",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  offerCard: {
    marginTop: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    gap: 4,
  },
  offerBadge: {
    color: "#C9D6EF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  offerTitle: {
    color: "#F5F7FC",
    fontSize: 17,
    fontWeight: "900",
  },
  offerPrice: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
  },
  offerDetail: {
    color: "#B7C2D6",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  offerCaption: {
    color: "#7E8AA2",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  helperCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 4,
  },
  sandboxCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(112,211,166,0.26)",
    backgroundColor: "rgba(25,69,49,0.3)",
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 4,
  },
  sandboxKicker: {
    color: "#CFF7E3",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  sandboxText: {
    color: "#DDF7E8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  sandboxDetailText: {
    color: "#BFECD2",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  helperCardNeutral: {
    borderColor: "rgba(92,116,168,0.2)",
    backgroundColor: "rgba(19,27,42,0.66)",
  },
  helperCardWarning: {
    borderColor: "rgba(220,20,60,0.24)",
    backgroundColor: "rgba(69,18,28,0.72)",
  },
  helperKicker: {
    color: "#BFD1F6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  helperText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  helperTextNeutral: {
    color: "#DCE6FB",
  },
  helperTextWarning: {
    color: "#FFDCE2",
  },
  statusCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  statusCardNeutral: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  statusCardSuccess: {
    borderColor: "rgba(54,194,125,0.28)",
    backgroundColor: "rgba(16,59,38,0.78)",
  },
  statusCardError: {
    borderColor: "rgba(220,20,60,0.28)",
    backgroundColor: "rgba(69,18,28,0.72)",
  },
  statusText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  statusTextNeutral: {
    color: "#E5ECF8",
  },
  statusTextSuccess: {
    color: "#D8FFEA",
  },
  statusTextError: {
    color: "#FFDCE2",
  },
  utilityRow: {
    flexDirection: "row",
    gap: 10,
  },
  utilityButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
  },
  utilityButtonDisabled: {
    opacity: 0.7,
  },
  utilityText: {
    color: "#E5ECF8",
    fontSize: 12.5,
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC143C",
  },
  primaryButtonDisabled: {
    opacity: 0.68,
  },
  primaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  secondaryText: {
    color: "#E5ECF8",
    fontSize: 14,
    fontWeight: "800",
  },
});
