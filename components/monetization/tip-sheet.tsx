import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { trackEvent } from "../../_lib/analytics";
import { createBoundedVisibleReadGate } from "../../_lib/boundedVisibleReadGate";
import {
  listIosStoreProductsForConcept,
  type IosStoreProductKey,
} from "../../_lib/iosAppStoreCommerce";
import { readRevenueCatNonSubscriptionProducts } from "../../_lib/revenuecat";
import {
  purchaseCreatorTipWithStore,
  type CreatorTipPublicStatus,
} from "../../_lib/creatorTips";
import { formatMonetizationCurrency } from "../../_lib/creatorMonetization";
import { useSession } from "../../_lib/session";
import { MoneyScopeInfoButton } from "./MoneyScopeInfoButton";
import { CreatorMoneyHeader, MoneyScopeStrip, MoneyStatusChip, MoneySuccessReceipt } from "./money-ui";

type TipSheetProps = {
  visible: boolean;
  creatorId: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  sourceSurface: string;
  tipStatus: CreatorTipPublicStatus | null;
  sandboxTester?: boolean;
  onClose: () => void;
};

const DEFAULT_AMOUNTS = [100, 300, 500, 1000];
const STORE_NAME = Platform.OS === "ios" ? "App Store" : "Google Play";

type IosTipOption = {
  stableKey: IosStoreProductKey;
  productId: string;
  referencePriceMinor: number;
  priceLabel: string;
};

export function TipSheet({
  visible,
  creatorId,
  creatorName,
  creatorAvatarUrl,
  sourceSurface,
  tipStatus,
  sandboxTester = false,
  onClose,
}: TipSheetProps) {
  const { user } = useSession();
  const [selectedAmount, setSelectedAmount] = useState(300);
  const [customAmount, setCustomAmount] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [selectedIosTipKey, setSelectedIosTipKey] = useState<IosStoreProductKey>("tip_tier_1");
  const [iosProductPriceLabels, setIosProductPriceLabels] = useState<Record<string, string>>({});
  const [iosPricesLoading, setIosPricesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const providerReadGateRef = useRef(createBoundedVisibleReadGate());
  const openingResetGateRef = useRef(createBoundedVisibleReadGate());

  const iosTipCatalog = useMemo(() => {
    if (Platform.OS !== "ios") return [] as Omit<IosTipOption, "priceLabel">[];
    return listIosStoreProductsForConcept("creator_tip").map((entry) => ({
      stableKey: entry.stableKey,
      productId: entry.productId,
      referencePriceMinor: entry.referencePriceMinor,
    }));
  }, []);
  const iosProductIdSignature = useMemo(
    () => iosTipCatalog.map((option) => option.productId).join("\u001f"),
    [iosTipCatalog],
  );

  const iosTipOptions = useMemo(() => {
    return iosTipCatalog.map((entry) => ({
      stableKey: entry.stableKey,
      productId: entry.productId,
      referencePriceMinor: entry.referencePriceMinor,
      priceLabel: iosProductPriceLabels[entry.productId] ?? formatMonetizationCurrency(
        entry.referencePriceMinor,
        tipStatus?.currency ?? "usd",
      ),
    }));
  }, [iosProductPriceLabels, iosTipCatalog, tipStatus?.currency]);

  const selectedIosProduct = iosTipOptions.find((option) => option.stableKey === selectedIosTipKey)
    ?? iosTipOptions[0]
    ?? null;

  const amounts = useMemo(() => {
    if (Platform.OS === "ios") {
      return iosTipOptions.map((entry) => entry.referencePriceMinor);
    }
    const values = tipStatus?.suggestedAmountsCents?.length ? tipStatus.suggestedAmountsCents : DEFAULT_AMOUNTS;
    return Array.from(new Set(values.filter((amount) => amount > 0))).slice(0, 6);
  }, [iosTipOptions, tipStatus?.suggestedAmountsCents]);

  useEffect(() => {
    if (!providerReadGateRef.current.shouldRun(visible)) return;
    const productIds = iosProductIdSignature.split("\u001f").filter(Boolean);
    if (Platform.OS === "ios" && productIds.length > 0) {
      let active = true;
      setIosPricesLoading(true);
      const run = async () => {
        try {
          const products = await readRevenueCatNonSubscriptionProducts(productIds);
          const next: Record<string, string> = {};
          for (const product of products) {
            const identifier = String((product as { identifier?: unknown }).identifier ?? "").trim();
            if (!identifier) continue;
            const safePrice = typeof (product as { priceString?: unknown }).priceString === "string"
              ? String((product as { priceString?: unknown }).priceString).trim()
              : "";
            if (safePrice) {
              next[identifier] = safePrice;
            }
          }
          if (active) {
            setIosProductPriceLabels((current) => {
              const nextEntries = Object.entries(next);
              const unchanged = Object.keys(current).length === nextEntries.length
                && nextEntries.every(([key, value]) => current[key] === value);
              return unchanged ? current : next;
            });
          }
        } finally {
          if (active) setIosPricesLoading(false);
        }
      };
      void run();
      return () => {
        active = false;
      };
    }
  }, [iosProductIdSignature, visible]);

  useEffect(() => {
    if (!openingResetGateRef.current.shouldRun(visible)) return;
    const iosDefault = iosTipCatalog[0];
    if (Platform.OS === "ios" && iosDefault) {
      setSelectedIosTipKey(iosDefault.stableKey);
      setSelectedAmount(iosDefault.referencePriceMinor);
    }

    const defaultAmount = Platform.OS === "ios"
      ? iosTipCatalog[0]?.referencePriceMinor ?? 99
      : tipStatus?.defaultAmountCents && tipStatus.defaultAmountCents > 0
        ? tipStatus.defaultAmountCents
        : amounts[0] ?? 300;
    setSelectedAmount(defaultAmount);
    setCustomAmount("");
    setPrivateNote("");
    setNotice("");
    trackEvent("tip_sheet_opened", {
      creator_id: creatorId,
      route_name: "channel",
      source_surface: sourceSurface,
    });
  }, [amounts, creatorId, iosTipCatalog, sourceSurface, tipStatus?.defaultAmountCents, visible]);

  const amountCents = Platform.OS === "ios"
    ? (selectedIosProduct?.referencePriceMinor ?? selectedAmount)
    : Math.round(Number(customAmount.replace(/[^0-9.]/g, "")) * 100) || selectedAmount;
  const minAmount = Platform.OS === "ios" ? amounts[0] ?? 99 : tipStatus?.minAmountCents ?? 100;
  const maxAmount = Platform.OS === "ios" ? amounts.at(-1) ?? 999 : tipStatus?.maxAmountCents ?? 50000;
  const amountValid = Platform.OS === "ios"
    ? selectedIosProduct != null
      && Number.isInteger(amountCents)
      && amountCents > 0
    : Number.isInteger(amountCents)
      && amountCents >= minAmount
      && amountCents <= maxAmount;
  const showSandboxCopy = sandboxTester || tipStatus?.testMode === true;
  const canTipInSandbox = sandboxTester || tipStatus?.canTip === true;

  const startCheckout = async () => {
    if (!user?.id) {
      Alert.alert("Sign in to tip", "Sign in before sending a creator tip.");
      return;
    }

    if (!canTipInSandbox) {
      setNotice("Tips are unavailable for this creator right now.");
      return;
    }

    if (!amountValid) {
      setNotice(`Choose an amount from ${formatMonetizationCurrency(minAmount)} to ${formatMonetizationCurrency(maxAmount)}.`);
      return;
    }

    setBusy(true);
    setNotice("");
    trackEvent("tip_payment_started", {
      creator_id: creatorId,
      feature_key: "tips",
      offer_type: "tip",
      price_bucket: amountCents < 500 ? "under_5" : amountCents < 1000 ? "under_10" : "10_plus",
      route_name: "channel",
      source_surface: sourceSurface,
    });

    try {
      const result = await purchaseCreatorTipWithStore({
        amountCents,
        creatorId,
        currency: tipStatus?.currency ?? "usd",
        iosStoreProductKey: Platform.OS === "ios" ? selectedIosProduct?.stableKey : undefined,
        privateNote: privateNote.trim() ? privateNote.trim() : null,
        sourceSurface,
        userId: String(user.id),
      });

      if (!result.ok) {
        setNotice(result.message || "Tips are unavailable right now.");
        return;
      }

      setNotice(
        showSandboxCopy
          ? `Sandbox tip complete. ${new Date().toLocaleString()}`
          : result.message,
      );
    } catch {
      setNotice(`${STORE_NAME} tip could not be started. Try again later.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={styles.sheet} testID="tip-sheet">
          <View style={styles.handle} />
          <CreatorMoneyHeader
            kicker="Creator support"
            title={`Tip ${creatorName || "creator"}`}
            creatorName={creatorName || "Creator"}
            imageUrl={creatorAvatarUrl}
            body="Send a contribution directly from this creator's Platform. Tips are support only and never unlock paid access."
            tone="premium"
          />

          {showSandboxCopy ? <MoneyStatusChip label={`Sandbox Test · ${STORE_NAME}`} tone="warning" /> : null}

          <View style={styles.amountGrid}>
            {Platform.OS === "ios" ? (
              iosTipOptions.map((option) => {
                const isSelected = option.stableKey === selectedIosTipKey;
                return (
                  <TouchableOpacity
                    key={option.stableKey}
                    testID="tip-amount-option"
                    activeOpacity={0.86}
                    style={[styles.amountButton, isSelected && styles.amountButtonActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${option.priceLabel} App Store tip amount`}
                    onPress={() => {
                      setCustomAmount("");
                      setSelectedAmount(option.referencePriceMinor);
                      setSelectedIosTipKey(option.stableKey);
                    }}
                  >
                    <Text style={[styles.amountText, isSelected && styles.amountTextActive]}>
                      {iosPricesLoading ? option.priceLabel : option.priceLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              amounts.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  testID="tip-amount-option"
                  activeOpacity={0.86}
                  style={[styles.amountButton, !customAmount.trim() && selectedAmount === amount && styles.amountButtonActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${formatMonetizationCurrency(amount, tipStatus?.currency ?? "usd")} tip amount`}
                  onPress={() => {
                    setCustomAmount("");
                    setSelectedAmount(amount);
                  }}
                >
                  <Text style={[styles.amountText, !customAmount.trim() && selectedAmount === amount && styles.amountTextActive]}>
                    {formatMonetizationCurrency(amount, tipStatus?.currency ?? "usd")}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {Platform.OS !== "ios" ? (
            <TextInput
              value={customAmount}
              onChangeText={setCustomAmount}
              keyboardType="decimal-pad"
              placeholder="Custom amount"
              placeholderTextColor="#8791A3"
              style={styles.input}
              accessibilityLabel="Custom tip amount"
            />
          ) : null}
          <TextInput
            value={privateNote}
            onChangeText={(value) => setPrivateNote(value.slice(0, 280))}
            placeholder="Private note, optional"
            placeholderTextColor="#8791A3"
            multiline
            style={[styles.input, styles.noteInput]}
            accessibilityLabel="Private note for creator"
          />

          <MoneyScopeStrip
            includes="A private creator-support contribution."
            excludes="Tips do not unlock videos, events, rooms, VIP, subscriptions, badges, public rewards, or merchandise."
            excludesTestID="tip-no-content-unlock-copy"
          />
          <MoneyScopeInfoButton scope="creator_tip" label="What am I buying?" />

          {notice ? <MoneySuccessReceipt title="Tip status" body={notice} testID="tip-success-receipt" /> : null}

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={busy}
            style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
            onPress={startCheckout}
            testID="tip-confirm-button"
            accessibilityRole="button"
            accessibilityLabel={showSandboxCopy ? "Sandbox Test Tip Creator" : "Send creator tip"}
          >
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.primaryButtonText}>{`Opening ${STORE_NAME}`}</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>{showSandboxCopy ? "Sandbox Test Tip" : "Continue to tip"}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            disabled={busy}
            style={styles.secondaryButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close tip sheet"
            testID="tip-sheet-not-now-button"
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2,4,10,0.62)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    backgroundColor: "#111722",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 14,
  },
  handle: {
    alignSelf: "center",
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    marginBottom: 4,
  },
  creatorRow: {
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
  },
  avatarWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#243043",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    color: "#F8FAFF",
    fontSize: 22,
    fontWeight: "900",
  },
  creatorCopy: {
    flex: 1,
    gap: 3,
  },
  kicker: {
    color: "#81D4FA",
    fontSize: 11,
    fontWeight: "900",
  },
  title: {
    color: "#F8FAFF",
    fontSize: 23,
    fontWeight: "900",
  },
  body: {
    color: "#B8C4D8",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  testMode: {
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: "#FFE9B7",
    backgroundColor: "rgba(245,190,77,0.16)",
    fontSize: 12,
    fontWeight: "900",
  },
  amountGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  amountButton: {
    minWidth: 82,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  amountButtonActive: {
    borderColor: "#7ED7FF",
    backgroundColor: "rgba(126,215,255,0.18)",
  },
  amountText: {
    color: "#DCE7F7",
    fontSize: 15,
    fontWeight: "900",
  },
  amountTextActive: {
    color: "#F8FAFF",
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#F8FAFF",
    paddingHorizontal: 13,
    fontSize: 15,
    fontWeight: "800",
  },
  noteInput: {
    minHeight: 74,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  policyCopy: {
    color: "#9CA8BA",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  notice: {
    color: "#FFCFD6",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  primaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#E84367",
  },
  primaryButtonDisabled: {
    opacity: 0.48,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#C8D3E4",
    fontSize: 14,
    fontWeight: "900",
  },
});
