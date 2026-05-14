import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  DMCA_CONTENT_TYPES,
  submitDmcaNotice,
  type DmcaContentType,
} from "../_lib/dmca";
import { LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const LAST_UPDATED = "May 14, 2026";

type ToggleRowProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

function ToggleRow({ active, label, onPress }: ToggleRowProps) {
  return (
    <TouchableOpacity style={styles.toggleRow} activeOpacity={0.84} onPress={onPress}>
      <View style={[styles.checkbox, active && styles.checkboxActive]}>
        <Text style={styles.checkboxMark}>{active ? "✓" : ""}</Text>
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function CopyrightReportPage() {
  const [reporterName, setReporterName] = useState("");
  const [reporterCompany, setReporterCompany] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [reporterAddress, setReporterAddress] = useState("");
  const [reporterIsOwner, setReporterIsOwner] = useState(true);
  const [authorizedAgentName, setAuthorizedAgentName] = useState("");
  const [copyrightedWorkDescription, setCopyrightedWorkDescription] = useState("");
  const [copyrightedWorkUrls, setCopyrightedWorkUrls] = useState("");
  const [contentType, setContentType] = useState<DmcaContentType>("creator_video");
  const [contentId, setContentId] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [goodFaithStatement, setGoodFaithStatement] = useState(false);
  const [accuracyStatement, setAccuracyStatement] = useState(false);
  const [electronicSignature, setElectronicSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [submittedCaseNumber, setSubmittedCaseNumber] = useState<string | null>(null);

  const workUrls = useMemo(
    () => copyrightedWorkUrls
      .split(/\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean),
    [copyrightedWorkUrls],
  );

  const submitNotice = async () => {
    if (busy) return;
    try {
      setBusy(true);
      setSubmittedCaseNumber(null);
      const result = await submitDmcaNotice({
        reporterName,
        reporterCompany,
        reporterEmail,
        reporterPhone,
        reporterAddress,
        reporterIsOwner,
        authorizedAgentName,
        copyrightedWorkDescription,
        copyrightedWorkUrls: workUrls,
        contentType,
        contentId,
        contentUrl,
        goodFaithStatement,
        accuracyPenaltyPerjuryStatement: accuracyStatement,
        electronicSignature,
      });
      setSubmittedCaseNumber(result.caseNumber);
      Alert.alert("Copyright report received", `Case ${result.caseNumber} has been recorded for review.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit this copyright report right now.";
      Alert.alert("Copyright report not submitted", message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LegalPageShell
      eyebrow="Chi'llywood Copyright"
      title="Report Copyright Infringement"
      subtitle="Submit a formal copyright notice for Chi'llywood review."
    >
      <LegalMeta label="Last updated" value={LAST_UPDATED} />
      <LegalSection title="Before You Submit">
        <LegalParagraph>
          Use this form only for copyright or media-rights reports. False or abusive reports can lead to account action or legal consequences. If this is harassment, threats, scams, impersonation, or another safety issue, use the in-app report path or Support instead.
        </LegalParagraph>
      </LegalSection>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView scrollEnabled={false} contentContainerStyle={styles.form}>
          <Text style={styles.groupTitle}>Reporter</Text>
          <TextInput style={styles.input} value={reporterName} onChangeText={setReporterName} placeholder="Copyright owner or authorized agent name" placeholderTextColor="#7D879E" />
          <TextInput style={styles.input} value={reporterCompany} onChangeText={setReporterCompany} placeholder="Company or organization (optional)" placeholderTextColor="#7D879E" />
          <TextInput style={styles.input} value={reporterEmail} onChangeText={setReporterEmail} placeholder="Email address" placeholderTextColor="#7D879E" keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={styles.input} value={reporterPhone} onChangeText={setReporterPhone} placeholder="Phone (optional)" placeholderTextColor="#7D879E" keyboardType="phone-pad" />
          <TextInput style={[styles.input, styles.multiline]} value={reporterAddress} onChangeText={setReporterAddress} placeholder="Mailing address (recommended for formal notices)" placeholderTextColor="#7D879E" multiline />

          <View style={styles.choiceRow}>
            <TouchableOpacity style={[styles.choice, reporterIsOwner && styles.choiceActive]} onPress={() => setReporterIsOwner(true)}>
              <Text style={[styles.choiceText, reporterIsOwner && styles.choiceTextActive]}>Owner</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.choice, !reporterIsOwner && styles.choiceActive]} onPress={() => setReporterIsOwner(false)}>
              <Text style={[styles.choiceText, !reporterIsOwner && styles.choiceTextActive]}>Authorized Agent</Text>
            </TouchableOpacity>
          </View>
          {!reporterIsOwner ? (
            <TextInput style={styles.input} value={authorizedAgentName} onChangeText={setAuthorizedAgentName} placeholder="Authorized agent name" placeholderTextColor="#7D879E" />
          ) : null}

          <Text style={styles.groupTitle}>Copyrighted Work</Text>
          <TextInput style={[styles.input, styles.largeInput]} value={copyrightedWorkDescription} onChangeText={setCopyrightedWorkDescription} placeholder="Describe the copyrighted work you claim was infringed" placeholderTextColor="#7D879E" multiline />
          <TextInput style={[styles.input, styles.multiline]} value={copyrightedWorkUrls} onChangeText={setCopyrightedWorkUrls} placeholder="Copyrighted work URL(s), separated by lines or commas (optional)" placeholderTextColor="#7D879E" multiline autoCapitalize="none" />

          <Text style={styles.groupTitle}>Allegedly Infringing Content</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
            {DMCA_CONTENT_TYPES.map((entry) => (
              <TouchableOpacity
                key={entry}
                style={[styles.typeChip, contentType === entry && styles.typeChipActive]}
                onPress={() => setContentType(entry)}
              >
                <Text style={[styles.typeChipText, contentType === entry && styles.typeChipTextActive]}>
                  {entry.replaceAll("_", " ")}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput style={styles.input} value={contentId} onChangeText={setContentId} placeholder="Content id, if known" placeholderTextColor="#7D879E" autoCapitalize="none" />
          <TextInput style={styles.input} value={contentUrl} onChangeText={setContentUrl} placeholder="Chi'llywood URL or location" placeholderTextColor="#7D879E" autoCapitalize="none" />

          <Text style={styles.groupTitle}>Required Statements</Text>
          <ToggleRow
            active={goodFaithStatement}
            label="I have a good-faith belief that the reported use is not authorized by the copyright owner, the owner's agent, or the law."
            onPress={() => setGoodFaithStatement((current) => !current)}
          />
          <ToggleRow
            active={accuracyStatement}
            label="I state under penalty of perjury that the information in this notice is accurate and that I am authorized to act for the copyright owner."
            onPress={() => setAccuracyStatement((current) => !current)}
          />
          <TextInput style={styles.input} value={electronicSignature} onChangeText={setElectronicSignature} placeholder="Electronic signature" placeholderTextColor="#7D879E" />

          {submittedCaseNumber ? (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>Case recorded</Text>
              <Text style={styles.successText}>{submittedCaseNumber}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={[styles.primaryButton, busy && styles.disabled]} disabled={busy} onPress={submitNotice}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Submit Copyright Notice</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LegalPageShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
  },
  groupTitle: {
    color: "#F4F7FC",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 8,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#F4F7FC",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "700",
  },
  multiline: {
    minHeight: 74,
    textAlignVertical: "top",
  },
  largeInput: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  choiceRow: {
    flexDirection: "row",
    gap: 8,
  },
  choice: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 12,
    alignItems: "center",
  },
  choiceActive: {
    borderColor: "rgba(220,20,60,0.45)",
    backgroundColor: "rgba(220,20,60,0.18)",
  },
  choiceText: {
    color: "#C8D0E2",
    fontSize: 13,
    fontWeight: "900",
  },
  choiceTextActive: {
    color: "#FFE6EB",
  },
  typeRow: {
    gap: 8,
  },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeChipActive: {
    borderColor: "rgba(220,20,60,0.45)",
    backgroundColor: "rgba(220,20,60,0.18)",
  },
  typeChipText: {
    color: "#C8D0E2",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  typeChipTextActive: {
    color: "#FFE6EB",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: "#DC143C",
    borderColor: "#DC143C",
  },
  checkboxMark: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  toggleLabel: {
    flex: 1,
    color: "#C8D0E2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  successBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(96,211,148,0.35)",
    backgroundColor: "rgba(96,211,148,0.12)",
    padding: 12,
    gap: 4,
  },
  successTitle: {
    color: "#DFFBEA",
    fontSize: 12,
    fontWeight: "900",
  },
  successText: {
    color: "#F4F7FC",
    fontSize: 14,
    fontWeight: "900",
  },
  primaryButton: {
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingVertical: 14,
    alignItems: "center",
  },
  disabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
});
