import React, { useEffect, useMemo, useState } from "react";
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
  BETA_FEEDBACK_CATEGORIES,
  BETA_FEEDBACK_SEVERITIES,
  BETA_FEEDBACK_TYPES,
  type BetaFeedbackCategory,
  type BetaFeedbackSeverity,
  type BetaFeedbackType,
} from "../../_lib/betaProgram";

type BetaFeedbackSheetProps = {
  visible: boolean;
  title: string;
  description: string;
  busy?: boolean;
  defaultFeedbackType?: BetaFeedbackType;
  defaultCategory?: BetaFeedbackCategory;
  defaultSeverity?: BetaFeedbackSeverity;
  defaultSummary?: string;
  onSubmit: (input: {
    feedbackType: BetaFeedbackType;
    category: BetaFeedbackCategory;
    severity: BetaFeedbackSeverity;
    summary: string;
    details: string;
  }) => Promise<void> | void;
  onClose: () => void;
};

const formatLabel = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export function BetaFeedbackSheet({
  visible,
  title,
  description,
  busy = false,
  defaultFeedbackType = "bug",
  defaultCategory = "other",
  defaultSeverity = "major",
  defaultSummary = "",
  onSubmit,
  onClose,
}: BetaFeedbackSheetProps) {
  const [feedbackType, setFeedbackType] = useState<BetaFeedbackType>(defaultFeedbackType);
  const [category, setCategory] = useState<BetaFeedbackCategory>(defaultCategory);
  const [severity, setSeverity] = useState<BetaFeedbackSeverity>(defaultSeverity);
  const [summary, setSummary] = useState(defaultSummary);
  const [details, setDetails] = useState("");

  useEffect(() => {
    if (!visible) return;
    setFeedbackType(defaultFeedbackType);
    setCategory(defaultCategory);
    setSeverity(defaultSeverity);
    setSummary(defaultSummary);
    setDetails("");
  }, [defaultCategory, defaultFeedbackType, defaultSeverity, defaultSummary, visible]);

  const helperText = useMemo(
    () => "Feedback goes to the Chi'llywood support queue with route context attached so issues can be triaged quickly.",
    [],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.kicker}>SUPPORT FEEDBACK</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Feedback type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {BETA_FEEDBACK_TYPES.map((entry) => (
                <TouchableOpacity
                  key={entry}
                  style={[styles.chip, feedbackType === entry && styles.chipActive]}
                  activeOpacity={0.84}
                  onPress={() => setFeedbackType(entry)}
                >
                  <Text style={[styles.chipText, feedbackType === entry && styles.chipTextActive]}>{formatLabel(entry)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {BETA_FEEDBACK_CATEGORIES.map((entry) => (
                <TouchableOpacity
                  key={entry}
                  style={[styles.chip, category === entry && styles.chipActive]}
                  activeOpacity={0.84}
                  onPress={() => setCategory(entry)}
                >
                  <Text style={[styles.chipText, category === entry && styles.chipTextActive]}>{formatLabel(entry)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Severity</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {BETA_FEEDBACK_SEVERITIES.map((entry) => (
                <TouchableOpacity
                  key={entry}
                  style={[styles.chip, severity === entry && styles.chipActive]}
                  activeOpacity={0.84}
                  onPress={() => setSeverity(entry)}
                >
                  <Text style={[styles.chipText, severity === entry && styles.chipTextActive]}>{formatLabel(entry)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <TextInput
            value={summary}
            onChangeText={setSummary}
            style={styles.summaryInput}
            placeholder="Short summary"
            placeholderTextColor="#7D879E"
          />

          <TextInput
            value={details}
            onChangeText={setDetails}
            style={styles.detailsInput}
            placeholder="What happened, what you expected, and how to reproduce it"
            placeholderTextColor="#7D879E"
            multiline
          />

          <Text style={styles.helperText}>{helperText}</Text>

          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            activeOpacity={0.86}
            disabled={busy}
            onPress={() => {
              void onSubmit({
                feedbackType,
                category,
                severity,
                summary,
                details,
              });
            }}
          >
            <Text style={styles.primaryButtonText}>{busy ? "Sending…" : "Send Feedback"}</Text>
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
  section: {
    gap: 6,
  },
  sectionLabel: {
    color: "#C4CAD9",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: "rgba(220,20,60,0.4)",
    backgroundColor: "rgba(220,20,60,0.18)",
  },
  chipText: {
    color: "#C8D0E2",
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextActive: {
    color: "#FFE6EB",
  },
  summaryInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#F4F7FC",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "700",
  },
  detailsInput: {
    minHeight: 112,
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
