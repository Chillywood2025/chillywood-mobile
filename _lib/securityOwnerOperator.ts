import {
  assertNoForbiddenScopedOperatorMutation,
  buildScopedOperatorApprovalRequest,
  buildScopedOperatorPlan,
  canAutoExecuteScopedOperatorAction,
  sanitizeScopedOperatorProof,
  type ScopedOperatorActionDefinition,
} from "./scopedAutonomousOperatorShared";

const SYSTEM_ID = "security_owner_operator" as const;

export const securityOwnerOperatorActions = [
  {
    actionId: "owner_role_integrity_check",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["owner_authority_integrity_findings", "security_operator_events"],
    forbiddenScope: ["assign owner role", "revoke owner role", "auth/RLS mutation"],
    reason: "record owner/super-admin role integrity findings only",
  },
  {
    actionId: "approval_integrity_check",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["approval_integrity_findings", "security_health_snapshots"],
    forbiddenScope: ["approve request", "self-approval", "delete audit rows"],
    reason: "record autonomous approval integrity findings only",
  },
  {
    actionId: "secret_scan_status_record",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["secret_scan_findings", "security_required_review_flags"],
    forbiddenScope: ["secret output", "secret rotation"],
    reason: "record redacted secret-scan status only",
  },
  {
    actionId: "owner_role_mutation",
    approvalLevel: 4,
    risk: "approval_required",
    allowedWriteScope: ["owner-approved server-side owner role change only"],
    forbiddenScope: ["autonomous owner role assignment", "client privileged write"],
    reason: "owner role mutation is never autonomous",
  },
  {
    actionId: "auth_rls_policy_mutation",
    approvalLevel: 4,
    risk: "approval_required",
    allowedWriteScope: ["owner-approved auth/RLS change only"],
    forbiddenScope: ["autonomous auth/RLS mutation", "RLS weakening"],
    reason: "auth/RLS mutation requires owner approval and security preflight",
  },
] as const satisfies readonly ScopedOperatorActionDefinition[];

export const classifySecurityOwnerHealth = (input: { criticalFindingCount?: number; warningCount?: number }) => {
  if ((input.criticalFindingCount ?? 0) > 0) return "critical";
  if ((input.warningCount ?? 0) > 0) return "degraded";
  return "healthy";
};

export const classifySecurityOwnerApprovalLevel = (actionId: string) => buildSecurityOwnerPlan(actionId).approvalLevel;

export const buildSecurityOwnerPlan = (actionId: string) => buildScopedOperatorPlan(
  SYSTEM_ID,
  actionId,
  securityOwnerOperatorActions,
  "mark security finding superseded after review; never delete audit rows",
  "security_owner_operator emergency stop blocks safe writes; read/report remains available",
  4,
);

export const canAutoExecuteSecurityOwner = (actionId: string) => (
  canAutoExecuteScopedOperatorAction(buildSecurityOwnerPlan(actionId))
);

export const buildSecurityOwnerApprovalRequest = (actionId: string, metadata: Record<string, unknown> = {}) => (
  buildScopedOperatorApprovalRequest(
    buildSecurityOwnerPlan(actionId),
    "Security / Owner Operator approval request",
    "Run proof:security-owner-operator and guard:security-owner-operator before execution.",
    "Re-run owner/super-admin verification, self-approval checks, secret scan, exact scope check, and emergency-state check.",
    metadata,
  )
);

export const sanitizeSecurityOwnerProof = sanitizeScopedOperatorProof;

export const assertNoForbiddenSecurityOwnerMutation = (actionId: string) => (
  assertNoForbiddenScopedOperatorMutation(buildSecurityOwnerPlan(actionId), "security_owner_operator")
);
