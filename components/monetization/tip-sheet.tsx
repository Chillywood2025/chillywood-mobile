import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { trackEvent } from "../../_lib/analytics";
import {
  purchaseCreatorTipWithGooglePlay,
  type CreatorTipPublicStatus,
} from "../../_lib/creatorTips";
import { formatMonetizationCurrency } from "../../_lib/creatorMonetization";
import { useSession } from "../../_lib/session";

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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const amounts = useMemo(() => {
    const values = tipStatus?.suggestedAmountsCents?.length ? tipStatus.suggestedAmountsCents : DEFAULT_AMOUNTS;
    return Array.from(new Set(values.filter((amount) => amount > 0))).slice(0, 6);
  }, [tipStatus?.suggestedAmountsCents]);

  useEffect(() => {
    if (!visible) return;
    const defaultAmount = tipStatus?.defaultAmountCents && tipStatus.defaultAmountCents > 0
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
  }, [amounts, creatorId, sourceSurface, tipStatus?.defaultAmountCents, visible]);

  const parsedCustomAmount = Math.round(Number(customAmount.replace(/[^0-9.]/g, "")) * 100);
  const amountCents = customAmount.trim() ? parsedCustomAmount : selectedAmount;
  const minAmount = tipStatus?.minAmountCents ?? 100;
  const maxAmount = tipStatus?.maxAmountCents ?? 50000;
  const amountValid = Number.isInteger(amountCents) && amountCents >= minAmount && amountCents <= maxAmount;
  const canTipInSandbox = sandboxTester || tipStatus?.canTip === true;
  const canSubmit = canTipInSandbox && !!user?.id && amountValid && !busy;

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
      const result = await purchaseCreatorTipWithGooglePlay({
        amountCents,
        creatorId,
        currency: tipStatus?.currency ?? "usd",
        privateNote: privateNote.trim() ? privateNote.trim() : null,
        sourceSurface,
        userId: String(user.id),
      });

      if (!result.ok) {
        setNotice(result.message || "Sandbox tip is unavailable right now.");
        return;
      }

      setNotice(
        sandboxTester || tipStatus?.testMode
          ? `Sandbox tip complete. No money moved. No payout created. ${new Date().toLocaleString()}`
          : result.message,
      );
    } catch {
      setNotice("Google Play sandbox tip could not be started. Try again later.");
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
          <View style={styles.creatorRow}>
            <View style={styles.avatarWrap}>
              {creatorAvatarUrl ? (
                <Image source={{ uri: creatorAvatarUrl }} style={styles.avatar} />
              ) : (
                <Text style={styles.avatarInitial}>{(creatorName || "C").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.creatorCopy}>
              <Text style={styles.kicker}>CREATOR TIP</Text>
              <Text style={styles.title}>Tip {creatorName || "creator"}</Text>
              <Text style={styles.body}>Tips use Google Play sandbox on Android and do not unlock content, badges, room access, VIP, or perks.</Text>
            </View>
          </View>

          {tipStatus?.testMode || sandboxTester ? <Text style={styles.testMode}>Sandbox Test · Google Play · No live payout</Text> : null}

          <View style={styles.amountGrid}>
            {amounts.map((amount) => (
              <TouchableOpacity
                key={amount}
                testID="tip-amount-option"
                activeOpacity={0.86}
                style={[styles.amountButton, !customAmount.trim() && selectedAmount === amount && styles.amountButtonActive]}
                onPress={() => {
                  setCustomAmount("");
                  setSelectedAmount(amount);
                }}
              >
                <Text style={[styles.amountText, !customAmount.trim() && selectedAmount === amount && styles.amountTextActive]}>
                  {formatMonetizationCurrency(amount, tipStatus?.currency ?? "usd")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            value={customAmount}
            onChangeText={setCustomAmount}
            keyboardType="decimal-pad"
            placeholder="Custom amount"
            placeholderTextColor="#8791A3"
            style={styles.input}
          />
          <TextInput
            value={privateNote}
            onChangeText={(value) => setPrivateNote(value.slice(0, 280))}
            placeholder="Private note, optional"
            placeholderTextColor="#8791A3"
            multiline
            style={[styles.input, styles.noteInput]}
          />

          <Text style={styles.policyCopy} testID="tip-no-content-unlock-copy">
            Tips are contributions only. They do not unlock videos, events, rooms, VIP, subscriptions, badges, or public rewards. Merchandise uses Stripe separately.
          </Text>

          {notice ? <Text style={styles.notice} testID="tip-success-receipt">{notice}</Text> : null}

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={!canSubmit}
            style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
            onPress={startCheckout}
            testID="tip-confirm-button"
            accessibilityRole="button"
            accessibilityLabel="Sandbox Test Tip Creator"
          >
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.primaryButtonText}>Opening Google Play</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>{tipStatus?.testMode || sandboxTester ? "Sandbox Test Tip" : "Continue to tip"}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} style={styles.secondaryButton} onPress={onClose}>
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
