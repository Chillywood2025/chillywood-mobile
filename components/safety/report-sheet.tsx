import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type SafetyReportCategory } from "../../_lib/moderation";

type ReportSheetProps = {
  visible: boolean;
  title: string;
  description: string;
  busy?: boolean;
  onSubmit: (input: {
    category: SafetyReportCategory;
    note: string;
  }) => Promise<void> | void;
  onClose: () => void;
};

type ReportSheetCategoryOption = {
  key: string;
  label: string;
  description: string;
  backedCategory: SafetyReportCategory;
};

const REPORT_SHEET_CATEGORY_OPTIONS: readonly ReportSheetCategoryOption[] = [
  {
    key: "harassment_bullying",
    label: "Harassment or bullying",
    description:
      "Targeted abuse, stalking, hostile contact, or repeated unwanted behavior.",
    backedCategory: "harassment",
  },
  {
    key: "hate_discrimination",
    label: "Hate or discrimination",
    description:
      "Attacks or exclusion based on protected traits, identity, or community.",
    backedCategory: "abuse",
  },
  {
    key: "threats_violence",
    label: "Threats or violence",
    description:
      "Threats, violent behavior, weapons, live danger, or immediate safety risk.",
    backedCategory: "safety",
  },
  {
    key: "sexual_exploitation",
    label: "Sexual content or exploitation",
    description:
      "Non-consensual sexual content, exploitation, or sexual safety concerns.",
    backedCategory: "safety",
  },
  {
    key: "self_harm_danger",
    label: "Self-harm or dangerous behavior",
    description:
      "Self-harm, suicide, dangerous behavior, or a live emergency concern.",
    backedCategory: "safety",
  },
  {
    key: "minor_safety",
    label: "Minor safety",
    description:
      "Child/minor safety, exploitation, grooming, or age-related risk.",
    backedCategory: "safety",
  },
  {
    key: "illegal_activity",
    label: "Illegal activity",
    description:
      "Illegal goods, criminal activity, exploitation, or severe platform abuse.",
    backedCategory: "safety",
  },
  {
    key: "spam_scam",
    label: "Spam or scam",
    description:
      "Spam, phishing, malware, fake giveaways, or manipulative promotion.",
    backedCategory: "safety",
  },
  {
    key: "impersonation",
    label: "Impersonation",
    description:
      "Fake person, creator, brand, official account, or false affiliation.",
    backedCategory: "impersonation",
  },
  {
    key: "privacy_doxxing",
    label: "Privacy violation/doxxing",
    description:
      "Private information, doxxing, unwanted personal data, or privacy invasion.",
    backedCategory: "safety",
  },
  {
    key: "copyright_dmca",
    label: "Copyright/DMCA",
    description:
      "Copyright, stolen media, unauthorized upload, or formal rights concern.",
    backedCategory: "copyright",
  },
  {
    key: "deceptive_content",
    label: "Misinformation or deceptive content",
    description:
      "Deceptive claims, misleading identity, or harmful false context.",
    backedCategory: "other",
  },
  {
    key: "graphic_violent_content",
    label: "Graphic/violent content",
    description:
      "Graphic injury, gore, violent imagery, or shocking unsafe content.",
    backedCategory: "safety",
  },
  {
    key: "fraud_payment",
    label: "Fraud/payment concern",
    description:
      "Suspicious paid access, refund/access issue, or payment-related abuse.",
    backedCategory: "safety",
  },
  {
    key: "live_safety",
    label: "Live safety issue",
    description:
      "Unsafe live behavior, room abuse, dangerous participant, or live disruption.",
    backedCategory: "safety",
  },
  {
    key: "other",
    label: "Other",
    description: "Something else that needs moderation review.",
    backedCategory: "other",
  },
];

const REPORT_SHEET_HELPER_TEXT =
  "Your report goes to the moderation team. Your identity stays private from the reported person by default. A report does not remove content automatically; urgent safety concerns may be escalated for temporary action while they are reviewed.";
const REPORT_SHEET_GOOD_FAITH_TEXT =
  "Please report in good faith. Repeated false or abusive reports may be rate-limited or reviewed.";

export function ReportSheet({
  visible,
  title,
  description,
  busy = false,
  onSubmit,
  onClose,
}: ReportSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [categoryKey, setCategoryKey] = useState<string>("harassment_bullying");
  const [note, setNote] = useState("");

  const categoryOption =
    REPORT_SHEET_CATEGORY_OPTIONS.find((entry) => entry.key === categoryKey) ??
    REPORT_SHEET_CATEGORY_OPTIONS[0];

  useEffect(() => {
    if (!visible) {
      setCategoryKey("harassment_bullying");
      setNote("");
    }
  }, [visible]);

  const closeAndReset = () => {
    if (busy) return;
    setCategoryKey("harassment_bullying");
    setNote("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closeAndReset}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            accessible={false}
            disabled={busy}
            onPress={closeAndReset}
          />
          <View style={styles.sheet} accessibilityViewIsModal>
            <ScrollView
              style={styles.sheetScroller}
              contentContainerStyle={[
                styles.sheetContent,
                {
                  paddingBottom: Math.max(insets.bottom, 16),
                  paddingLeft: Math.max(insets.left, 18),
                  paddingRight: Math.max(insets.right, 18),
                },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.handle} accessible={false} />
              <Text style={styles.kicker}>SAFETY REPORT</Text>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <Text style={styles.description}>{description}</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                {REPORT_SHEET_CATEGORY_OPTIONS.map((entry) => (
                  <TouchableOpacity
                    key={entry.key}
                    style={[
                      styles.categoryChip,
                      categoryKey === entry.key && styles.categoryChipActive,
                      busy && styles.buttonDisabled,
                    ]}
                    activeOpacity={0.84}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityLabel={entry.label}
                    accessibilityHint={entry.description}
                    accessibilityState={{
                      selected: categoryKey === entry.key,
                      disabled: busy,
                    }}
                    onPress={() => setCategoryKey(entry.key)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        categoryKey === entry.key &&
                          styles.categoryChipTextActive,
                      ]}
                    >
                      {entry.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.categoryHelp}>
                <Text style={styles.categoryHelpTitle}>
                  {categoryOption.label}
                </Text>
                <Text style={styles.categoryHelpText}>
                  {categoryOption.description}
                </Text>
              </View>

              <TextInput
                value={note}
                onChangeText={setNote}
                style={styles.input}
                placeholder="Optional note for the moderation team"
                placeholderTextColor="#7D879E"
                accessibilityLabel="Optional report details"
                accessibilityHint="Add information that may help the moderation team review this report."
                editable={!busy}
                multiline
              />

              <Text style={styles.helperText}>{REPORT_SHEET_HELPER_TEXT}</Text>
              <Text style={styles.helperText}>
                {REPORT_SHEET_GOOD_FAITH_TEXT}
              </Text>

              {categoryOption.backedCategory === "copyright" ? (
                <View style={styles.formalNoticeBox}>
                  <Text style={styles.formalNoticeTitle}>
                    Formal copyright notice
                  </Text>
                  <Text style={styles.formalNoticeText}>
                    A DMCA-style copyright notice needs ownership, signature,
                    and good-faith statements. Open the dedicated copyright
                    report form for that process.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.formalNoticeButton,
                      busy && styles.buttonDisabled,
                    ]}
                    activeOpacity={0.86}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Open Copyright Report"
                    accessibilityState={{ disabled: busy }}
                    onPress={() => {
                      if (busy) return;
                      closeAndReset();
                      router.push(
                        "/copyright-report" as Parameters<
                          typeof router.push
                        >[0],
                      );
                    }}
                  >
                    <Text style={styles.formalNoticeButtonText}>
                      Open Copyright Report
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                activeOpacity={0.86}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={busy ? "Sending report" : "Send Report"}
                accessibilityState={{ disabled: busy, busy }}
                onPress={() => {
                  const selectedCategoryNote = `Selected report category: ${categoryOption.label}.`;
                  const normalizedNote = note.trim();
                  void onSubmit({
                    category: categoryOption.backedCategory,
                    note: normalizedNote
                      ? `${selectedCategoryNote}\n${normalizedNote}`
                      : selectedCategoryNote,
                  });
                }}
              >
                <Text style={styles.primaryButtonText}>
                  {busy ? "Sending…" : "Send Report"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, busy && styles.buttonDisabled]}
                activeOpacity={0.82}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Cancel report"
                accessibilityState={{ disabled: busy }}
                onPress={closeAndReset}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoider: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,13,18,0.98)",
    paddingTop: 10,
    overflow: "hidden",
  },
  sheetScroller: {
    flexGrow: 0,
  },
  sheetContent: {
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
    minWidth: 48,
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
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
  categoryHelp: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  categoryHelpTitle: {
    color: "#F4F7FC",
    fontSize: 12,
    fontWeight: "900",
  },
  categoryHelpText: {
    color: "#A5B0C7",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
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
  formalNoticeBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.28)",
    backgroundColor: "rgba(220,20,60,0.1)",
    padding: 12,
    gap: 8,
  },
  formalNoticeTitle: {
    color: "#FFE6EB",
    fontSize: 12,
    fontWeight: "900",
  },
  formalNoticeText: {
    color: "#C8D0E2",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  formalNoticeButton: {
    minHeight: 48,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
  },
  formalNoticeButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  primaryButton: {
    minHeight: 48,
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
    minHeight: 48,
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
