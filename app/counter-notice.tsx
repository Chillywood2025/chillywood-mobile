import React, { useEffect, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  DMCA_ATTACHMENT_ALLOWED_MIME_TYPES,
  DMCA_ATTACHMENT_MAX_BYTES,
  readMyDmcaCounterNoticeCase,
  submitUploaderDmcaCounterNotice,
  type DmcaCounterNoticeCase,
  uploadDmcaCounterNoticeAttachment,
  validateDmcaAttachmentFile,
} from "../_lib/dmca";
import { useSession } from "../_lib/session";
import { LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const LAST_UPDATED = "May 22, 2026";

type PickedAttachment = {
  name: string;
  size: number;
  type: string;
  uri: string;
};

type ToggleRowProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

type FormPanelProps = {
  children: React.ReactNode;
  title: string;
  body?: string;
};

function FormPanel({ children, title, body }: FormPanelProps) {
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.fieldGroupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        {body ? <Text style={styles.groupHint}>{body}</Text> : null}
      </View>
      {children}
    </View>
  );
}

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

export default function CounterNoticePage() {
  const params = useLocalSearchParams<{ caseId?: string; contentId?: string }>();
  const { isLoading, isSignedIn, user } = useSession();
  const [caseId, setCaseId] = useState(String(params.caseId ?? "").trim());
  const [caseRecord, setCaseRecord] = useState<DmcaCounterNoticeCase | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState(user?.email ?? "");
  const [submitterPhone, setSubmitterPhone] = useState("");
  const [submitterAddress, setSubmitterAddress] = useState("");
  const [statement, setStatement] = useState("");
  const [contentLocation, setContentLocation] = useState(String(params.contentId ?? "").trim());
  const [goodFaithMistake, setGoodFaithMistake] = useState(false);
  const [jurisdictionConsent, setJurisdictionConsent] = useState(false);
  const [serviceAcceptance, setServiceAcceptance] = useState(false);
  const [signature, setSignature] = useState("");
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!submitterEmail && user?.email) setSubmitterEmail(user.email);
  }, [submitterEmail, user?.email]);

  useEffect(() => {
    if (caseRecord && !contentLocation) {
      setContentLocation(caseRecord.contentUrl || caseRecord.contentId || "");
    }
  }, [caseRecord, contentLocation]);

  const loadCase = async () => {
    if (caseLoading || !caseId.trim()) return;
    setCaseLoading(true);
    setNotice(null);
    try {
      const loaded = await readMyDmcaCounterNoticeCase(caseId);
      setCaseRecord(loaded);
      setContentLocation((current) => current || loaded.contentUrl || loaded.contentId || "");
      setNotice(`Case ${loaded.caseNumber || loaded.id} is available for your account.`);
    } catch (error) {
      setCaseRecord(null);
      const message = error instanceof Error ? error.message : "Unable to load that DMCA case.";
      setNotice(message);
      Alert.alert("Counter-notice", message);
    } finally {
      setCaseLoading(false);
    }
  };

  const pickAttachments = async () => {
    if (busy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: [...DMCA_ATTACHMENT_ALLOWED_MIME_TYPES],
      });
      if (result.canceled) return;
      const nextFiles = result.assets.map((asset) => {
        const picked = {
          name: asset.name || "counter-notice-evidence",
          size: Number(asset.size ?? 0),
          type: asset.mimeType || "application/octet-stream",
          uri: asset.uri,
        };
        validateDmcaAttachmentFile({
          fileName: picked.name,
          mimeType: picked.type,
          sizeBytes: picked.size,
        });
        return picked;
      });
      setAttachments((current) => [...current, ...nextFiles].slice(0, 6));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to attach that evidence file.";
      Alert.alert("Attachments", message);
    }
  };

  const submitCounterNotice = async () => {
    if (busy) return;
    if (!user?.id) {
      Alert.alert("Sign in required", "Counter-notice submission requires a signed-in uploader account.");
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const counterNotice = await submitUploaderDmcaCounterNotice({
        caseId,
        electronicSignature: signature,
        goodFaithMistakeStatement: goodFaithMistake,
        jurisdictionConsentStatement: jurisdictionConsent,
        removedMaterialDescription: statement,
        removedMaterialUrlOrLocation: contentLocation,
        serviceAcceptanceStatement: serviceAcceptance,
        submitterAddress,
        submitterEmail,
        submitterName,
        submitterPhone,
      });

      let uploadedCount = 0;
      for (const attachment of attachments) {
        const fileResponse = await fetch(attachment.uri);
        const fileData = await fileResponse.arrayBuffer();
        await uploadDmcaCounterNoticeAttachment({
          caseId,
          counterNoticeId: counterNotice.id,
          fileData,
          fileName: attachment.name,
          mimeType: attachment.type,
          sizeBytes: attachment.size,
          uploaderUserId: user.id,
        });
        uploadedCount += 1;
      }

      setAttachments([]);
      setNotice(`Counter-notice received.${uploadedCount ? ` ${uploadedCount} evidence file${uploadedCount === 1 ? "" : "s"} uploaded and queued for malware scanning.` : ""}`);
      Alert.alert("Counter-notice received", "Your counter-notice has been recorded for legal review.");
      await loadCase();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit this counter-notice right now.";
      setNotice(message);
      Alert.alert("Counter-notice not submitted", message);
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled = busy || !caseId.trim() || !caseRecord;

  if (isLoading) {
    return (
      <LegalPageShell
        eyebrow="Chi'llywood Copyright"
        title="Counter-Notice"
        subtitle="Loading account status."
      >
        <ActivityIndicator color="#DC143C" />
      </LegalPageShell>
    );
  }

  if (!isSignedIn) {
    return (
      <LegalPageShell
        eyebrow="Chi'llywood Copyright"
        title="Counter-Notice"
        subtitle="Submit a counter-notice for your own disabled content."
      >
        <LegalMeta label="Last updated" value={LAST_UPDATED} />
        <LegalSection title="Sign In Required">
          <LegalParagraph>
            Counter-notice self-service is available only to the signed-in uploader tied to a DMCA case. This protects claimant privacy and prevents unauthorized disputes.
          </LegalParagraph>
        </LegalSection>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push({ pathname: "/(auth)/login", params: { redirectTo: "/counter-notice" } })}
        >
          <Text style={styles.primaryButtonText}>Sign In</Text>
        </TouchableOpacity>
      </LegalPageShell>
    );
  }

  return (
    <LegalPageShell
      eyebrow="Chi'llywood Copyright"
      title="Counter-Notice"
      subtitle="For uploaders disputing a copyright takedown on their own content."
    >
      <LegalMeta label="Last updated" value={LAST_UPDATED} />
      <LegalSection title="Before You Submit">
        <LegalParagraph>
          This form is only for the uploader account tied to the DMCA case. It does not show claimant private contact information. False statements can have legal consequences.
        </LegalParagraph>
      </LegalSection>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.form}>
          <View style={styles.statusGrid}>
            <View style={styles.statusTile}>
              <Text style={styles.statusLabel}>Access</Text>
              <Text style={styles.statusValue}>Uploader Only</Text>
            </View>
            <View style={styles.statusTile}>
              <Text style={styles.statusLabel}>Case Check</Text>
              <Text style={styles.statusValue}>{caseRecord ? "Verified" : "Required"}</Text>
            </View>
            <View style={styles.statusTile}>
              <Text style={styles.statusLabel}>Evidence</Text>
              <Text style={styles.statusValue}>Private Review</Text>
            </View>
          </View>

          <FormPanel
            title="Case"
            body="Load your DMCA case first so the server can confirm ownership before submission."
          >
          <TextInput
            style={styles.input}
            value={caseId}
            onChangeText={(value) => {
              setCaseId(value);
              setCaseRecord(null);
              setNotice(null);
            }}
            placeholder="DMCA case id"
            placeholderTextColor="#7D879E"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.secondaryButton, (caseLoading || busy || !caseId.trim()) && styles.disabled]}
            disabled={caseLoading || busy || !caseId.trim()}
            onPress={() => {
              void loadCase();
            }}
          >
            {caseLoading ? <ActivityIndicator color="#F4F7FC" size="small" /> : <Text style={styles.secondaryButtonText}>Load My Case</Text>}
          </TouchableOpacity>

          {caseRecord ? (
            <View style={styles.caseBox}>
              <Text style={styles.caseTitle}>{caseRecord.caseNumber || caseRecord.id}</Text>
              <Text style={styles.caseText}>{`Status: ${caseRecord.status.replaceAll("_", " ")}`}</Text>
              <Text style={styles.caseText}>{`Content: ${caseRecord.contentType.replaceAll("_", " ")} · ${caseRecord.contentId || caseRecord.contentUrl || "location recorded"}`}</Text>
              <Text style={styles.caseText}>{caseRecord.publicSafeSummary || "No public-safe summary recorded."}</Text>
            </View>
          ) : null}
          </FormPanel>

          <FormPanel
            title="Submitter"
            body="Use the legal identity and contact address for the uploader submitting this counter-notice."
          >
          <TextInput style={styles.input} value={submitterName} onChangeText={setSubmitterName} placeholder="Legal name" placeholderTextColor="#7D879E" />
          <TextInput style={styles.input} value={submitterEmail} onChangeText={setSubmitterEmail} placeholder="Email address" placeholderTextColor="#7D879E" keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={styles.input} value={submitterPhone} onChangeText={setSubmitterPhone} placeholder="Phone optional" placeholderTextColor="#7D879E" keyboardType="phone-pad" />
          <TextInput style={[styles.input, styles.multiline]} value={submitterAddress} onChangeText={setSubmitterAddress} placeholder="Mailing address" placeholderTextColor="#7D879E" multiline />
          </FormPanel>

          <FormPanel
            title="Counter-Notice"
            body="Explain why the content was removed by mistake or misidentification."
          >
          <TextInput style={[styles.input, styles.largeInput]} value={statement} onChangeText={setStatement} placeholder="Counter-notice statement" placeholderTextColor="#7D879E" multiline />
          <TextInput style={styles.input} value={contentLocation} onChangeText={setContentLocation} placeholder="Content id, URL, or removed location" placeholderTextColor="#7D879E" autoCapitalize="none" />
          </FormPanel>

          <FormPanel
            title="Attachments"
            body="Optional supporting evidence is private to legal operators."
          >
          <View style={styles.attachmentBox}>
            <Text style={styles.boxTitle}>Evidence files</Text>
            <Text style={styles.boxText}>
              Optional screenshots, PDFs, images, or plain-text evidence. Files are private to legal operators and are queued for malware scanning before operators rely on them.
            </Text>
            <TouchableOpacity style={[styles.secondaryButton, busy && styles.disabled]} disabled={busy} onPress={pickAttachments}>
              <Text style={styles.secondaryButtonText}>Add Evidence Files</Text>
            </TouchableOpacity>
            {attachments.length ? attachments.map((attachment, index) => (
              <View key={`${attachment.uri}-${index}`} style={styles.attachmentRow}>
                <View style={styles.attachmentCopy}>
                  <Text style={styles.attachmentName}>{attachment.name}</Text>
                  <Text style={styles.attachmentMeta}>{`${attachment.type} · ${(attachment.size / 1024).toFixed(1)} KB`}</Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  disabled={busy}
                  onPress={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Text style={styles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            )) : (
              <Text style={styles.boxText}>No files selected. Maximum {(DMCA_ATTACHMENT_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB per file.</Text>
            )}
          </View>
          </FormPanel>

          <FormPanel
            title="Required Statements"
            body="These statements are required before the counter-notice can be recorded."
          >
          <ToggleRow
            active={goodFaithMistake}
            label="I have a good-faith belief that the material was removed or disabled because of mistake or misidentification."
            onPress={() => setGoodFaithMistake((current) => !current)}
          />
          <ToggleRow
            active={jurisdictionConsent}
            label="I consent to the jurisdiction and process terms described in Chi'llywood copyright policy for counter-notices."
            onPress={() => setJurisdictionConsent((current) => !current)}
          />
          <ToggleRow
            active={serviceAcceptance}
            label="I agree to accept service of process from the claimant or the claimant's agent where legally required."
            onPress={() => setServiceAcceptance((current) => !current)}
          />
          <TextInput style={styles.input} value={signature} onChangeText={setSignature} placeholder="Electronic signature" placeholderTextColor="#7D879E" />
          </FormPanel>

          {notice ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, submitDisabled && styles.disabled]}
            disabled={submitDisabled}
            onPress={() => {
              void submitCounterNotice();
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>{caseRecord ? "Submit Counter-Notice" : "Load case before submit"}</Text>
            )}
          </TouchableOpacity>
          {!caseRecord ? (
            <Text style={styles.disabledReason}>
              Submission unlocks after the backend confirms this case is tied to your signed-in uploader account.
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </LegalPageShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
    paddingBottom: 18,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusTile: {
    flexGrow: 1,
    flexBasis: "31%",
    minWidth: 96,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.055)",
    padding: 10,
    gap: 4,
  },
  statusLabel: {
    color: "#98A4BA",
    fontSize: 10.5,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  statusValue: {
    color: "#F4F7FC",
    fontSize: 12.5,
    fontWeight: "900",
  },
  fieldGroup: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 12,
    gap: 10,
  },
  fieldGroupHeader: {
    gap: 4,
  },
  groupTitle: {
    color: "#F4F7FC",
    fontSize: 14,
    fontWeight: "900",
  },
  groupHint: {
    color: "#98A4BA",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  input: {
    borderRadius: 8,
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
  caseBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(96,211,148,0.32)",
    backgroundColor: "rgba(96,211,148,0.1)",
    padding: 12,
    gap: 4,
  },
  caseTitle: {
    color: "#DFFBEA",
    fontSize: 13,
    fontWeight: "900",
  },
  caseText: {
    color: "#F4F7FC",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  attachmentBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 10,
  },
  boxTitle: {
    color: "#F4F7FC",
    fontSize: 12,
    fontWeight: "900",
  },
  boxText: {
    color: "#C8D0E2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  attachmentRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  attachmentCopy: {
    flex: 1,
    gap: 2,
  },
  attachmentName: {
    color: "#F4F7FC",
    fontSize: 12.5,
    fontWeight: "900",
  },
  attachmentMeta: {
    color: "#98A4BA",
    fontSize: 11,
    fontWeight: "700",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderRadius: 8,
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
  primaryButton: {
    borderRadius: 8,
    backgroundColor: "#DC143C",
    paddingVertical: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: "#F4F7FC",
    fontSize: 12.5,
    fontWeight: "900",
  },
  removeButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  removeButtonText: {
    color: "#FFE6EB",
    fontSize: 11,
    fontWeight: "900",
  },
  noticeBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
  },
  noticeText: {
    color: "#D9E3F9",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.68,
  },
  disabledReason: {
    color: "#D6A84F",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
});
