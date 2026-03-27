import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type AccessSheetReason = "premium_required" | "party_pass_required";

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
  appDisplayName?: string;
  premiumUpsellTitle?: string;
  premiumUpsellBody?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function AccessSheet({
  visible,
  reason,
  appDisplayName,
  premiumUpsellTitle,
  premiumUpsellBody,
  busy,
  onConfirm,
  onClose,
}: AccessSheetProps) {
  const copy = getAccessSheetCopy({
    reason,
    appDisplayName,
    premiumUpsellTitle,
    premiumUpsellBody,
  });

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

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.86} disabled={busy}>
              <Text style={styles.secondaryText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, busy && styles.primaryButtonDisabled]} onPress={onConfirm} activeOpacity={0.9} disabled={busy}>
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
