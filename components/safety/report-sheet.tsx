import React, { useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  SAFETY_REPORT_CATEGORIES,
  type SafetyReportCategory,
} from "../../_lib/moderation";

type ReportSheetProps = {
  visible: boolean;
  title: string;
  description: string;
  busy?: boolean;
  onSubmit: (input: { category: SafetyReportCategory; note: string }) => Promise<void> | void;
  onClose: () => void;
};

const formatCategoryLabel = (category: SafetyReportCategory) =>
  category === "copyright" ? "Copyright" : category.replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

export function ReportSheet({
  visible,
  title,
  description,
  busy = false,
  onSubmit,
  onClose,
}: ReportSheetProps) {
  const [category, setCategory] = useState<SafetyReportCategory>("safety");
  const [note, setNote] = useState("");

  const helperText = useMemo(
    () => "Reports are logged for Chi'llywood moderation review. Device capture controls remain best-effort.",
    [],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.kicker}>SAFETY REPORT</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {SAFETY_REPORT_CATEGORIES.map((entry) => (
              <TouchableOpacity
                key={entry}
                style={[styles.categoryChip, category === entry && styles.categoryChipActive]}
                activeOpacity={0.84}
                onPress={() => setCategory(entry)}
              >
                <Text style={[styles.categoryChipText, category === entry && styles.categoryChipTextActive]}>
                  {formatCategoryLabel(entry)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TextInput
            value={note}
            onChangeText={setNote}
            style={styles.input}
            placeholder="Optional note for the moderation team"
            placeholderTextColor="#7D879E"
            multiline
          />

          <Text style={styles.helperText}>{helperText}</Text>

          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            activeOpacity={0.86}
            disabled={busy}
            onPress={() => {
              void onSubmit({ category, note });
            }}
          >
            <Text style={styles.primaryButtonText}>{busy ? "Sending…" : "Send Report"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.82} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,13,18,0.98)",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 12,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  kicker: {
    color: "#7B869E",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: "#F4F7FC",
    fontSize: 20,
    fontWeight: "900",
  },
  description: {
    color: "#A5B0C7",
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "600",
  },
  categoryRow: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryChipActive: {
    borderColor: "rgba(220,20,60,0.4)",
    backgroundColor: "rgba(220,20,60,0.18)",
  },
  categoryChipText: {
    color: "#C8D0E2",
    fontSize: 12,
    fontWeight: "800",
  },
  categoryChipTextActive: {
    color: "#FFE6EB",
  },
  input: {
    minHeight: 98,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#F4F7FC",
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
    fontSize: 14,
    fontWeight: "600",
  },
  helperText: {
    color: "#8F99B1",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  primaryButton: {
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#C8D0E2",
    fontSize: 13,
    fontWeight: "800",
  },
});
