import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type BetaWelcomeSheetProps = {
  visible: boolean;
  busy?: boolean;
  onPrimaryPress: () => void;
  onDismiss: () => void;
};

export function BetaWelcomeSheet({
  visible,
  busy = false,
  onPrimaryPress,
  onDismiss,
}: BetaWelcomeSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.kicker}>WELCOME TO THE CLOSED BETA</Text>
          <Text style={styles.title}>Help tighten the most important Chi&apos;llywood flows.</Text>
          <Text style={styles.body}>
            Focus on sign-in, title playback, watch-party create/join, communication room entry, reconnect behavior, and feedback capture. This beta is for learning and fixing, not public polish.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            activeOpacity={0.86}
            disabled={busy}
            onPress={onPrimaryPress}
          >
            <Text style={styles.primaryButtonText}>{busy ? "Saving…" : "Open Beta Guide"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            activeOpacity={0.82}
            disabled={busy}
            onPress={onDismiss}
          >
            <Text style={styles.secondaryButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,13,19,0.98)",
    padding: 22,
    gap: 12,
  },
  kicker: {
    color: "#7B869E",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: "#F4F7FC",
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    color: "#A9B3C8",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#C8D0E2",
    fontSize: 13,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
