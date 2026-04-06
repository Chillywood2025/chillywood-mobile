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

import {
  openManageSubscriptionFlow,
  purchaseBlockedAccess,
  readMonetizationAccessSheetState,
  restoreMonetizationAccess,
  type MonetizationAccessPurchaseOutcome,
  type MonetizationAccessSheetState,
  type MonetizationGateResolution,
  type MonetizationRestoreOutcome,
} from "../../_lib/monetization";

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

type AccessSheetProps = {
  visible: boolean;
  reason: AccessSheetReason;
  gate?: AccessSheetGate | null;
  appDisplayName?: string;
  premiumUpsellTitle?: string;
  premiumUpsellBody?: string;
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

  const loadSheetState = useCallback(async () => {
    const nextState = await readMonetizationAccessSheetState({
      gate,
      appDisplayName,
      premiumUpsellTitle,
      premiumUpsellBody,
    });
    setSheetState(nextState);
    return nextState;
  }, [appDisplayName, gate, premiumUpsellBody, premiumUpsellTitle]);

  useEffect(() => {
    if (!visible) return;

    let active = true;
    setLoadingState(true);

    loadSheetState()
      .catch(() => {
        if (!active) return;
        setSheetState(null);
        setStatusTone("error");
        setStatusMessage("Unable to load the current Chi'llywood purchase options.");
      })
      .finally(() => {
        if (active) setLoadingState(false);
      });

    return () => {
      active = false;
    };
  }, [loadSheetState, visible]);

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
    kicker: kickerOverride ?? baseCopy.kicker,
    title: titleOverride ?? baseCopy.title,
    body: bodyOverride ?? baseCopy.body,
    actionLabel:
      sheetState?.primaryAction === "retry"
        ? sheetState.primaryLabel
        : actionLabelOverride ?? sheetState?.primaryLabel ?? baseCopy.actionLabel,
  };
  const busy = loadingState || purchaseBusy || restoreBusy || manageBusy;

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
  const helperToneStyle = sheetState?.helperTone === "warning" ? styles.helperCardWarning : styles.helperCardNeutral;
  const helperTextStyle = sheetState?.helperTone === "warning" ? styles.helperTextWarning : styles.helperTextNeutral;

  const onPrimaryPress = useCallback(async () => {
    if (sheetState?.primaryDisabled) return;

    setStatusMessage("");
    setStatusTone("neutral");

    if (sheetState?.primaryAction === "retry" || !gate) {
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
    try {
      const result = await purchaseBlockedAccess({ gate });
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
      setStatusTone("error");
      setStatusMessage("Unable to complete this purchase right now.");
    } finally {
      setPurchaseBusy(false);
    }
  }, [gate, loadSheetState, onPurchaseResult, sheetState?.primaryAction, sheetState?.primaryDisabled]);

  const onRestorePress = useCallback(async () => {
    setRestoreBusy(true);
    setStatusMessage("");
    setStatusTone("neutral");

    try {
      const result = await restoreMonetizationAccess();
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
      setStatusTone("error");
      setStatusMessage("Unable to restore purchases right now.");
    } finally {
      setRestoreBusy(false);
    }
  }, [loadSheetState, onRestoreResult]);

  const onManagePress = useCallback(async () => {
    setManageBusy(true);
    setStatusMessage("");
    setStatusTone("neutral");

    try {
      const opened = await openManageSubscriptionFlow();
      if (opened) {
        setStatusTone("neutral");
        setStatusMessage("Subscription management opened in Google Play.");
      } else {
        setStatusTone("error");
        setStatusMessage("Unable to open subscription management right now.");
      }
    } finally {
      setManageBusy(false);
    }
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.kicker}>{copy.kicker}</Text>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>

          {sheetState?.offer ? (
            <View style={styles.offerCard}>
              {sheetState.offer.badge ? <Text style={styles.offerBadge}>{sheetState.offer.badge}</Text> : null}
              <Text style={styles.offerTitle}>{sheetState.offer.title}</Text>
              <Text style={styles.offerPrice}>{sheetState.offer.priceLabel}</Text>
              <Text style={styles.offerDetail}>{sheetState.offer.detail}</Text>
              {sheetState.offer.caption ? <Text style={styles.offerCaption}>{sheetState.offer.caption}</Text> : null}
            </View>
          ) : null}

          {sheetState ? (
            <View style={[styles.helperCard, helperToneStyle]}>
              <Text style={styles.helperKicker}>{sheetState.helperKicker}</Text>
              <Text style={[styles.helperText, helperTextStyle]}>{sheetState.helperBody}</Text>
            </View>
          ) : null}

          {statusMessage ? (
            <View style={[styles.statusCard, statusToneStyle]}>
              <Text style={[styles.statusText, statusTextStyle]}>{statusMessage}</Text>
            </View>
          ) : null}

          {(sheetState?.canRestore || sheetState?.canManage) ? (
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
                  {manageBusy ? <ActivityIndicator color="#E5ECF8" size="small" /> : <Text style={styles.utilityText}>Manage subscription</Text>}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.86} disabled={busy}>
              <Text style={styles.secondaryText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, (busy || sheetState?.primaryDisabled) && styles.primaryButtonDisabled]}
              onPress={() => {
                void onPrimaryPress();
              }}
              activeOpacity={0.9}
              disabled={busy || sheetState?.primaryDisabled}
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
