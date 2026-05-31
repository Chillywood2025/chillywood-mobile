import React, { useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
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
  DMCA_CONTENT_TYPES,
  submitDmcaNotice,
  type DmcaContentType,
  uploadDmcaPublicNoticeAttachment,
  validateDmcaAttachmentFile,
} from "../_lib/dmca";
import { LEGAL_SUPPORT_EMAIL } from "../_lib/legalPolicies";
import { getUserFacingErrorMessage } from "../_lib/userFacingErrors";
import { LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const LAST_UPDATED = "May 22, 2026";

type ToggleRowProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

type PickedAttachment = {
  name: string;
  size: number;
  type: string;
  uri: string;
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

export default function CopyrightReportPage() {
  const [reporterName, setReporterName] = useState("");
  const [reporterCompany, setReporterCompany] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [reporterAddress, setReporterAddress] = useState("");
  const [reporterIsOwner, setReporterIsOwner] = useState(true);
  const [authorizedAgentName, setAuthorizedAgentName] = useState("");
  const [copyrightOwnerName, setCopyrightOwnerName] = useState("");
  const [copyrightedWorkDescription, setCopyrightedWorkDescription] = useState("");
  const [copyrightedWorkUrls, setCopyrightedWorkUrls] = useState("");
  const [infringingMaterialDescription, setInfringingMaterialDescription] = useState("");
  const [contentType, setContentType] = useState<DmcaContentType>("creator_video");
  const [contentId, setContentId] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [goodFaithStatement, setGoodFaithStatement] = useState(false);
  const [accuracyStatement, setAccuracyStatement] = useState(false);
  const [electronicSignature, setElectronicSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [submittedCaseNumber, setSubmittedCaseNumber] = useState<string | null>(null);
  const [submittedAttachmentCount, setSubmittedAttachmentCount] = useState(0);
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);

  const workUrls = useMemo(
    () => copyrightedWorkUrls
      .split(/\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean),
    [copyrightedWorkUrls],
  );

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
          name: asset.name || "dmca-evidence",
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
      const message = getUserFacingErrorMessage(error, "Unable to attach that evidence file.");
      Alert.alert("Attachments", message);
    }
  };

  const submitNotice = async () => {
    if (busy) return;
    try {
      setBusy(true);
      setSubmittedCaseNumber(null);
      setSubmittedAttachmentCount(0);
      const result = await submitDmcaNotice({
        reporterName,
        reporterCompany,
        reporterEmail,
        reporterPhone,
        reporterAddress,
        reporterIsOwner,
        authorizedAgentName,
        copyrightOwnerName,
        copyrightedWorkDescription,
        copyrightedWorkUrls: workUrls,
        infringingMaterialDescription,
        contentType,
        contentId,
        contentUrl,
        goodFaithStatement,
        accuracyPenaltyPerjuryStatement: accuracyStatement,
        electronicSignature,
      });
      let uploadedCount = 0;
      if (attachments.length) {
        if (!result.id || !result.attachmentToken) {
          throw new Error("Case was recorded, but the attachment upload token was not returned.");
        }
        for (const attachment of attachments) {
          const fileResponse = await fetch(attachment.uri);
          const fileData = await fileResponse.arrayBuffer();
          await uploadDmcaPublicNoticeAttachment({
            attachmentToken: result.attachmentToken,
            caseId: result.id,
            fileData,
            fileName: attachment.name,
            mimeType: attachment.type,
            sizeBytes: attachment.size,
          });
          uploadedCount += 1;
        }
      }
      setSubmittedCaseNumber(result.caseNumber);
      setSubmittedAttachmentCount(uploadedCount);
      setAttachments([]);
      Alert.alert(
        "Copyright report received",
        `Case ${result.caseNumber} has been recorded for review.${uploadedCount ? ` ${uploadedCount} evidence file${uploadedCount === 1 ? "" : "s"} uploaded and queued for malware scanning.` : ""}`,
      );
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "Unable to submit this copyright report right now.");
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
        <View style={styles.form}>
          <View style={styles.statusGrid}>
            <View style={styles.statusTile}>
              <Text style={styles.statusLabel}>Access</Text>
              <Text style={styles.statusValue}>Public Intake</Text>
            </View>
            <View style={styles.statusTile}>
              <Text style={styles.statusLabel}>Evidence</Text>
              <Text style={styles.statusValue}>Private Review</Text>
            </View>
            <View style={styles.statusTile}>
              <Text style={styles.statusLabel}>Scan Status</Text>
              <Text style={styles.statusValue}>Manual Review</Text>
            </View>
          </View>

          <FormPanel
            title="Reporter"
            body="Tell legal operators who is submitting the notice and how to reach you."
          >
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
          </FormPanel>

          <FormPanel
            title="Copyrighted Work"
            body="Describe the original work and add source links when you have them."
          >
          <TextInput style={styles.input} value={copyrightOwnerName} onChangeText={setCopyrightOwnerName} placeholder="Copyright owner name" placeholderTextColor="#7D879E" />
          <TextInput style={[styles.input, styles.largeInput]} value={copyrightedWorkDescription} onChangeText={setCopyrightedWorkDescription} placeholder="Describe the copyrighted work you claim was infringed" placeholderTextColor="#7D879E" multiline />
          <TextInput style={[styles.input, styles.multiline]} value={copyrightedWorkUrls} onChangeText={setCopyrightedWorkUrls} placeholder="Copyrighted work URL(s), separated by lines or commas (optional)" placeholderTextColor="#7D879E" multiline autoCapitalize="none" />
          </FormPanel>

          <FormPanel
            title="Allegedly Infringing Content"
            body="Point us to the Chi'llywood content and choose the closest content type."
          >
          <TextInput style={[styles.input, styles.largeInput]} value={infringingMaterialDescription} onChangeText={setInfringingMaterialDescription} placeholder="Describe the allegedly infringing material" placeholderTextColor="#7D879E" multiline />
          <View style={styles.typeRow}>
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
          </View>
          <TextInput style={styles.input} value={contentId} onChangeText={setContentId} placeholder="Content id, if known" placeholderTextColor="#7D879E" autoCapitalize="none" />
          <TextInput style={styles.input} value={contentUrl} onChangeText={setContentUrl} placeholder="Chi'llywood URL or location" placeholderTextColor="#7D879E" autoCapitalize="none" />
          </FormPanel>

          <FormPanel
            title="Attachments"
            body="Evidence files are private to legal operators and never public-read."
          >
          <View style={styles.attachmentBox}>
            <Text style={styles.disabledTitle}>Evidence files</Text>
            <Text style={styles.disabledText}>
              Optional screenshots, PDFs, WebP/JPEG/PNG images, or plain-text notes. Files are private to legal operators and are queued for malware scanning before operators rely on them.
            </Text>
            <TouchableOpacity style={[styles.secondaryButton, busy && styles.disabled]} disabled={busy} onPress={pickAttachments}>
              <Text style={styles.secondaryButtonText}>Add Evidence Files</Text>
            </TouchableOpacity>
            {attachments.length ? (
              <View style={styles.attachmentList}>
                {attachments.map((attachment, index) => (
                  <View key={`${attachment.uri}-${index}`} style={styles.attachmentRow}>
                    <View style={styles.attachmentCopy}>
                      <Text style={styles.attachmentName}>{attachment.name}</Text>
                      <Text style={styles.attachmentMeta}>
                        {`${attachment.type} · ${(attachment.size / 1024).toFixed(1)} KB`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeButton}
                      disabled={busy}
                      onPress={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.disabledText}>
                No files selected. Maximum {(DMCA_ATTACHMENT_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB per file.
              </Text>
            )}
          </View>
          </FormPanel>

          <FormPanel
            title="Required Statements"
            body="These statements are required before a formal notice can be submitted."
          >
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
          </FormPanel>

          {submittedCaseNumber ? (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>Case recorded</Text>
              <Text style={styles.successText}>{submittedCaseNumber}</Text>
              <Text style={styles.successMeta}>
                {submittedAttachmentCount
                  ? `${submittedAttachmentCount} evidence file${submittedAttachmentCount === 1 ? "" : "s"} uploaded; scan status pending.`
                  : `No evidence files uploaded. Supporting files can still be sent to ${LEGAL_SUPPORT_EMAIL} with the case number.`}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity style={[styles.primaryButton, busy && styles.disabled]} disabled={busy} onPress={submitNotice}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Submit Copyright Notice</Text>}
          </TouchableOpacity>
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
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choice: {
    flex: 1,
    minWidth: 130,
    borderRadius: 8,
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
    flexDirection: "row",
    flexWrap: "wrap",
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
  successBox: {
    borderRadius: 8,
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
  successMeta: {
    color: "#DFFBEA",
    fontSize: 12,
    lineHeight: 17,
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
  attachmentList: {
    gap: 8,
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
  disabledBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 4,
  },
  disabledTitle: {
    color: "#F4F7FC",
    fontSize: 12,
    fontWeight: "900",
  },
  disabledText: {
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
  disabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
});
