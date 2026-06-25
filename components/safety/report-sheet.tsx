import React, { useMemo, useState } from "react";
import { useRouter } from "expo-router";
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

type ReportSheetCategoryOption = {
  key: string;
  label: string;
  description: string;
  backedCategory: SafetyReportCategory;
  queue: "normal" | "urgent" | "legal" | "security" | "money_support";
};

const REPORT_SHEET_CATEGORY_OPTIONS: readonly ReportSheetCategoryOption[] = [
  {
    key: "harassment_bullying",
    label: "Harassment or bullying",
    description: "Targeted abuse, stalking, hostile contact, or repeated unwanted behavior.",
    backedCategory: "harassment",
    queue: "normal",
  },
  {
    key: "hate_discrimination",
    label: "Hate or discrimination",
    description: "Attacks or exclusion based on protected traits, identity, or community.",
    backedCategory: "abuse",
    queue: "normal",
  },
  {
    key: "threats_violence",
    label: "Threats or violence",
    description: "Threats, violent behavior, weapons, live danger, or immediate safety risk.",
    backedCategory: "safety",
    queue: "urgent",
  },
  {
    key: "sexual_exploitation",
    label: "Sexual content or exploitation",
    description: "Non-consensual sexual content, exploitation, or sexual safety concerns.",
    backedCategory: "safety",
    queue: "urgent",
  },
  {
    key: "self_harm_danger",
    label: "Self-harm or dangerous behavior",
    description: "Self-harm, suicide, dangerous behavior, or a live emergency concern.",
    backedCategory: "safety",
    queue: "urgent",
  },
  {
    key: "minor_safety",
    label: "Minor safety",
    description: "Child/minor safety, exploitation, grooming, or age-related risk.",
    backedCategory: "safety",
    queue: "urgent",
  },
  {
    key: "illegal_activity",
    label: "Illegal activity",
    description: "Illegal goods, criminal activity, exploitation, or severe platform abuse.",
    backedCategory: "safety",
    queue: "urgent",
  },
  {
    key: "spam_scam",
    label: "Spam or scam",
    description: "Spam, phishing, malware, fake giveaways, or manipulative promotion.",
    backedCategory: "safety",
    queue: "security",
  },
  {
    key: "impersonation",
    label: "Impersonation",
    description: "Fake person, creator, brand, official account, or false affiliation.",
    backedCategory: "impersonation",
    queue: "normal",
  },
  {
    key: "privacy_doxxing",
    label: "Privacy violation/doxxing",
    description: "Private information, doxxing, unwanted personal data, or privacy invasion.",
    backedCategory: "safety",
    queue: "urgent",
  },
  {
    key: "copyright_dmca",
    label: "Copyright/DMCA",
    description: "Copyright, stolen media, unauthorized upload, or formal rights concern.",
    backedCategory: "copyright",
    queue: "legal",
  },
  {
    key: "deceptive_content",
    label: "Misinformation or deceptive content",
    description: "Deceptive claims, misleading identity, or harmful false context.",
    backedCategory: "other",
    queue: "normal",
  },
  {
    key: "graphic_violent_content",
    label: "Graphic/violent content",
    description: "Graphic injury, gore, violent imagery, or shocking unsafe content.",
    backedCategory: "safety",
    queue: "urgent",
  },
  {
    key: "fraud_payment",
    label: "Fraud/payment concern",
    description: "Suspicious paid access, refund/access issue, or payment-related abuse.",
    backedCategory: "safety",
    queue: "money_support",
  },
  {
    key: "live_safety",
    label: "Live safety issue",
    description: "Unsafe live behavior, room abuse, dangerous participant, or live disruption.",
    backedCategory: "safety",
    queue: "urgent",
  },
  {
    key: "other",
    label: "Other",
    description: "Something else that needs moderation review.",
    backedCategory: "other",
    queue: "normal",
  },
];

export function ReportSheet({
  visible,
  title,
  description,
  busy = false,
  onSubmit,
  onClose,
}: ReportSheetProps) {
  const router = useRouter();
  const [categoryKey, setCategoryKey] = useState<string>("harassment_bullying");
  const [note, setNote] = useState("");

  const helperText = useMemo(
    () => "Your report goes to a scoped moderation queue. Reporter identity stays private by default, and reports do not remove content automatically unless urgent safety policy requires temporary escalation.",
    [],
  );
  const falseReportText = "Please report in good faith. Repeated false or abusive reports may be rate-limited or reviewed.";
  const categoryOption = REPORT_SHEET_CATEGORY_OPTIONS.find((entry) => entry.key === categoryKey) ?? REPORT_SHEET_CATEGORY_OPTIONS[0];

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
            {REPORT_SHEET_CATEGORY_OPTIONS.map((entry) => (
              <TouchableOpacity
                key={entry.key}
                style={[styles.categoryChip, categoryKey === entry.key && styles.categoryChipActive]}
                activeOpacity={0.84}
                onPress={() => setCategoryKey(entry.key)}
              >
                <Text style={[styles.categoryChipText, categoryKey === entry.key && styles.categoryChipTextActive]}>
                  {entry.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.categoryHelp}>
            <Text style={styles.categoryHelpTitle}>{categoryOption.label}</Text>
            <Text style={styles.categoryHelpText}>{categoryOption.description}</Text>
            <Text style={styles.categoryHelpMeta}>
              Review path: {categoryOption.queue.replace("_", " ")}
            </Text>
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            style={styles.input}
            placeholder="Optional note for the moderation team"
            placeholderTextColor="#7D879E"
            multiline
          />

          <Text style={styles.helperText}>{helperText}</Text>
          <Text style={styles.helperText}>{falseReportText}</Text>

          {categoryOption.backedCategory === "copyright" ? (
            <View style={styles.formalNoticeBox}>
              <Text style={styles.formalNoticeTitle}>Formal copyright notice</Text>
              <Text style={styles.formalNoticeText}>
                A DMCA-style copyright notice needs ownership, signature, and good-faith statements. Open the dedicated copyright report form for that process.
              </Text>
              <TouchableOpacity
                style={styles.formalNoticeButton}
                activeOpacity={0.86}
                onPress={() => {
                  onClose();
                  router.push("/copyright-report" as Parameters<typeof router.push>[0]);
                }}
              >
                <Text style={styles.formalNoticeButtonText}>Open Copyright Report</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            activeOpacity={0.86}
            disabled={busy}
            onPress={() => {
              const selectedCategoryNote = `Selected report category: ${categoryOption.label}. Queue: ${categoryOption.queue.replace("_", " ")}.`;
              const normalizedNote = note.trim();
              void onSubmit({
                category: categoryOption.backedCategory,
                note: normalizedNote ? `${selectedCategoryNote}\n${normalizedNote}` : selectedCategoryNote,
              });
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
  categoryHelpMeta: {
    color: "#7D879E",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textTransform: "uppercase",
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
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  formalNoticeButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
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
