import React, { useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

type PreRollAdModalProps = {
  visible: boolean;
  durationSeconds?: number;
  onComplete: () => void;
};

export default function PreRollAdModal({
  visible,
  durationSeconds = 3,
  onComplete,
}: PreRollAdModalProps) {
  const [remaining, setRemaining] = useState(durationSeconds);

  useEffect(() => {
    if (!visible) {
      setRemaining(durationSeconds);
      return;
    }

    setRemaining(durationSeconds);
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [durationSeconds, onComplete, visible]);

  const countdown = useMemo(() => Math.max(0, remaining), [remaining]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>SPONSORED</Text>
          <Text style={styles.title}>Pre-roll Ad Placeholder</Text>
          <Text style={styles.sub}>Playback starts in {countdown}s</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(18,18,18,0.98)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },
  kicker: {
    color: "#888",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "800",
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },
  sub: {
    color: "#aaa",
    fontSize: 13,
  },
});
