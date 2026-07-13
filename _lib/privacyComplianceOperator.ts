export const PRIVACY_COMPLIANCE_OPERATOR_ID = "privacy_compliance_operator" as const;

export type PrivacyComplianceFindingClass =
  | "privacy_request_review"
  | "export_plan_required"
  | "deletion_plan_required"
  | "legal_hold_blocks_action"
  | "pii_exposure_review"
  | "retention_policy_review";

const SECRET_KEY_PATTERN = /(secret|token|password|credential|authorization|service[_-]?role|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|pii|email|phone|address)/i;
const LONG_SECRET_LIKE_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

export const sanitizePrivacyComplianceProof = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizePrivacyComplianceProof);
  if (!value || typeof value !== "object") return typeof value === "string" ? value.replace(LONG_SECRET_LIKE_PATTERN, "[redacted]") : value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
    .map(([key, entry]) => [key, sanitizePrivacyComplianceProof(entry)]));
};

export const classifyPrivacyComplianceFinding = (text: string): PrivacyComplianceFindingClass => {
  const normalized = text.toLowerCase();
  if (normalized.includes("export")) return "export_plan_required";
  if (normalized.includes("delete") || normalized.includes("deletion")) return "deletion_plan_required";
  if (normalized.includes("hold")) return "legal_hold_blocks_action";
  if (normalized.includes("pii") || normalized.includes("exposure")) return "pii_exposure_review";
  if (normalized.includes("retention")) return "retention_policy_review";
  return "privacy_request_review";
};

export const buildPrivacyComplianceWatchPlan = () => ({
  systemId: PRIVACY_COMPLIANCE_OPERATOR_ID,
  checks: ["privacy_request_intake", "account_data_export_planning", "account_deletion_planning", "legal_hold_readback", "pii_exposure_findings"],
  forbidden: ["deleting account/data without approved flow", "exporting raw private data", "bypassing legal hold", "deleting audit/evidence", "fake compliance closure"],
});

export const buildPrivacyComplianceOwnerCommand = (finding: PrivacyComplianceFindingClass) => ({
  commandText: `Privacy Compliance Operator finding requires owner/legal review: ${finding}.`,
  normalizedIntent: "privacy_compliance",
  targetSystems: [PRIVACY_COMPLIANCE_OPERATOR_ID],
  approvalLevel: 3,
  allowedScope: ["planning/status rows", "redacted review flags", "approval request"],
  forbiddenScope: ["hidden deletion", "raw private export", "legal hold bypass", "auth/RLS mutation"],
});
