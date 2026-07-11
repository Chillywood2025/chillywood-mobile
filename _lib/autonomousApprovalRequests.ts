import type { AutonomousApprovalLevel, AutonomousSystemId } from "./autonomousSystemsRegistry";

export type AutonomousApprovalRequesterType =
  | "admin"
  | "livekit_operator"
  | "media_automation"
  | "operator"
  | "owner"
  | "rachi";

export type AutonomousApprovalRequestStatus =
  | "approved"
  | "cancelled"
  | "denied"
  | "executed"
  | "expired"
  | "pending"
  | "superseded";

export type AutonomousApprovalRequest = {
  id: string;
  systemId: AutonomousSystemId;
  actionId: string;
  requestedByActorType: AutonomousApprovalRequesterType;
  requestedByActorId: string | null;
  approvalLevel: Extract<AutonomousApprovalLevel, 3 | 4>;
  status: AutonomousApprovalRequestStatus;
  title: string;
  reason: string;
  riskSummary: string;
  proposedAction: string;
  allowedWriteScope: readonly string[];
  forbiddenScope: readonly string[];
  rollbackPlan: string;
  killSwitchPlan: string;
  proofPlan: string;
  validationPlan: string;
  expiresAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  deniedBy: string | null;
  deniedAt: string | null;
  denialReason: string | null;
  executionResult: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AutonomousApprovalRequestDraft = Omit<
  AutonomousApprovalRequest,
  | "approvedAt"
  | "approvedBy"
  | "createdAt"
  | "denialReason"
  | "deniedAt"
  | "deniedBy"
  | "executionResult"
  | "id"
  | "status"
  | "updatedAt"
>;

export type AutonomousApprovalValidationResult = {
  ok: boolean;
  failures: string[];
};

const SECRET_KEY_PATTERN = /(secret|token|password|authorization|service[_-]?role|participant[_-]?token|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url)/i;
const LONG_SECRET_LIKE_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

const hasSecretLikeValue = (value: unknown): boolean => {
  if (typeof value === "string") return SECRET_KEY_PATTERN.test(value) || LONG_SECRET_LIKE_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(hasSecretLikeValue);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, entryValue]) => (
      SECRET_KEY_PATTERN.test(key) || hasSecretLikeValue(entryValue)
    ));
  }
  return false;
};

export const sanitizeAutonomousApprovalMetadata = (
  metadata: Record<string, unknown> | null | undefined,
) => {
  const safeEntries = Object.entries(metadata ?? {}).filter(([key, value]) => (
    !SECRET_KEY_PATTERN.test(key) && !hasSecretLikeValue(value)
  ));
  return Object.fromEntries(safeEntries);
};

export const validateAutonomousApprovalRequestDraft = (
  draft: AutonomousApprovalRequestDraft,
): AutonomousApprovalValidationResult => {
  const failures: string[] = [];

  if (draft.approvalLevel !== 3 && draft.approvalLevel !== 4) failures.push("approval_level_must_be_3_or_4");
  if (!draft.systemId) failures.push("system_id_required");
  if (!draft.actionId.trim()) failures.push("action_id_required");
  if (!draft.title.trim()) failures.push("title_required");
  if (!draft.reason.trim()) failures.push("reason_required");
  if (!draft.riskSummary.trim()) failures.push("risk_summary_required");
  if (!draft.proposedAction.trim()) failures.push("proposed_action_required");
  if (!draft.rollbackPlan.trim()) failures.push("rollback_plan_required");
  if (!draft.killSwitchPlan.trim()) failures.push("kill_switch_plan_required");
  if (!draft.proofPlan.trim()) failures.push("proof_plan_required");
  if (!draft.validationPlan.trim()) failures.push("validation_plan_required");
  if (!draft.allowedWriteScope.length) failures.push("allowed_write_scope_required");
  if (!draft.forbiddenScope.length) failures.push("forbidden_scope_required");
  if (hasSecretLikeValue(draft)) failures.push("secret_like_payload_blocked");

  const expiresAt = Date.parse(draft.expiresAt);
  if (!Number.isFinite(expiresAt)) failures.push("expires_at_required");
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) failures.push("expires_at_must_be_future");

  return { ok: failures.length === 0, failures };
};

export const canActorApproveAutonomousRequest = (input: {
  approverActorId?: string | null;
  approverRoles: readonly string[];
  request: Pick<AutonomousApprovalRequest, "approvalLevel" | "requestedByActorId" | "requestedByActorType" | "status">;
}) => {
  // Rachi can request/recommend but cannot approve itself.
  // Autonomous operators cannot approve their own Level 3/4 requests.
  if (input.request.status !== "pending") return false;
  if (input.request.requestedByActorId && input.approverActorId && input.request.requestedByActorId === input.approverActorId) return false;
  if (input.request.requestedByActorType === "rachi" && input.approverRoles.includes("rachi")) return false;
  if (input.request.requestedByActorType === "livekit_operator" && input.approverRoles.includes("livekit_operator")) return false;
  if (input.request.requestedByActorType === "media_automation" && input.approverRoles.includes("media_automation")) return false;
  if (input.request.approvalLevel === 4) return input.approverRoles.includes("owner") || input.approverRoles.includes("super_admin");
  return input.approverRoles.includes("owner") || input.approverRoles.includes("super_admin") || input.approverRoles.includes("approved_admin");
};

export const canExecuteApprovedAutonomousRequest = (input: {
  approvalFresh: boolean;
  approvedPreflightReran: boolean;
  request: Pick<AutonomousApprovalRequest, "expiresAt" | "status">;
}) => {
  if (input.request.status !== "approved") return false;
  if (Date.parse(input.request.expiresAt) <= Date.now()) return false;
  return input.approvalFresh && input.approvedPreflightReran;
};

export const buildAutonomousApprovalFoundationSummary = () => ({
  approvalExecutionStatus: "foundation_only",
  backingTruth: "platform_role_memberships",
  explicitOwnerSuperAdminBacking: "incomplete",
  rachiFinalAuthority: false,
  operatorSelfApprovalAllowed: false,
  sameRequesterApprovalAllowed: false,
  executionRequiresFreshPreflight: true,
  clientWritesDeniedByDefault: true,
});
