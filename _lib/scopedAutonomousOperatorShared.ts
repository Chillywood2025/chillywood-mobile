import type { AutonomousApprovalLevel, AutonomousSystemId } from "./autonomousSystemsRegistry";

export type ScopedOperatorActionRisk = "read" | "safe_write" | "approval_required" | "forbidden";

export type ScopedOperatorActionDefinition = {
  actionId: string;
  approvalLevel: AutonomousApprovalLevel;
  risk: ScopedOperatorActionRisk;
  allowedWriteScope: readonly string[];
  forbiddenScope: readonly string[];
  reason: string;
};

export type ScopedOperatorPlan = {
  systemId: AutonomousSystemId;
  actionId: string;
  approvalLevel: AutonomousApprovalLevel;
  canAutoExecute: boolean;
  approvalRequired: boolean;
  reason: string;
  allowedWriteScope: readonly string[];
  forbiddenScope: readonly string[];
  rollbackPlan: string;
  killSwitchPlan: string;
};

export type ScopedOperatorApprovalRequestDraft = {
  system_id: AutonomousSystemId;
  action_id: string;
  approval_level: 3 | 4;
  requested_by_actor_type: "operator" | "livekit_operator" | "media_automation" | "rachi" | "admin" | "owner";
  title: string;
  reason: string;
  risk_summary: string;
  proposed_action: string;
  allowed_write_scope: readonly string[];
  forbidden_scope: readonly string[];
  rollback_plan: string;
  kill_switch_plan: string;
  proof_plan: string;
  validation_plan: string;
  metadata: Record<string, unknown>;
};

const SECRET_KEY_PATTERN = /(secret|token|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url)/i;

export const sanitizeScopedOperatorProof = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((entry) => sanitizeScopedOperatorProof(entry));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 160) return `${value.slice(0, 20)}...[redacted:${value.length}]`;
    return value;
  }

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    SECRET_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeScopedOperatorProof(entry),
  ]));
};

export const classifyScopedOperatorAction = (
  actionId: string,
  definitions: readonly ScopedOperatorActionDefinition[],
  unknownLevel: 3 | 4 = 3,
): ScopedOperatorActionDefinition => {
  const match = definitions.find((definition) => definition.actionId === actionId);
  if (match) return match;
  return {
    actionId,
    approvalLevel: unknownLevel,
    risk: "approval_required",
    allowedWriteScope: ["owner-approved scoped write only"],
    forbiddenScope: ["unknown autonomous mutation", "secret output", "approval bypass"],
    reason: "unknown actions default to owner approval",
  };
};

export const buildScopedOperatorPlan = (
  systemId: AutonomousSystemId,
  actionId: string,
  definitions: readonly ScopedOperatorActionDefinition[],
  rollbackPlan: string,
  killSwitchPlan: string,
  unknownLevel: 3 | 4 = 3,
): ScopedOperatorPlan => {
  const classification = classifyScopedOperatorAction(actionId, definitions, unknownLevel);
  return {
    systemId,
    actionId,
    approvalLevel: classification.approvalLevel,
    canAutoExecute: classification.risk !== "forbidden" && classification.approvalLevel <= 2,
    approvalRequired: classification.approvalLevel >= 3,
    reason: classification.reason,
    allowedWriteScope: classification.allowedWriteScope,
    forbiddenScope: classification.forbiddenScope,
    rollbackPlan,
    killSwitchPlan,
  };
};

export const canAutoExecuteScopedOperatorAction = (plan: ScopedOperatorPlan) => (
  plan.canAutoExecute && !plan.approvalRequired && plan.approvalLevel <= 2
);

export const buildScopedOperatorApprovalRequest = (
  plan: ScopedOperatorPlan,
  title: string,
  proofPlan: string,
  validationPlan: string,
  metadata: Record<string, unknown> = {},
): ScopedOperatorApprovalRequestDraft => {
  if (plan.approvalLevel < 3) {
    throw new Error("approval_request_requires_level_3_or_4_action");
  }

  return {
    system_id: plan.systemId,
    action_id: plan.actionId,
    approval_level: plan.approvalLevel === 4 ? 4 : 3,
    requested_by_actor_type: "operator",
    title,
    reason: plan.reason,
    risk_summary: `Level ${plan.approvalLevel} action for ${plan.systemId}; execution requires owner/super-admin approval, fresh preflight, exact scope match, and emergency-state check.`,
    proposed_action: plan.actionId,
    allowed_write_scope: plan.allowedWriteScope,
    forbidden_scope: plan.forbiddenScope,
    rollback_plan: plan.rollbackPlan,
    kill_switch_plan: plan.killSwitchPlan,
    proof_plan: proofPlan,
    validation_plan: validationPlan,
    metadata: sanitizeScopedOperatorProof(metadata) as Record<string, unknown>,
  };
};

export const assertNoForbiddenScopedOperatorMutation = (
  plan: ScopedOperatorPlan,
  actionDescription: string,
): void => {
  if (plan.approvalLevel >= 3 || !plan.canAutoExecute) {
    throw new Error(`${actionDescription}_requires_owner_approval`);
  }
  if (plan.forbiddenScope.some((scope) => /secret|bypass|broad|manual|fake|delete|ban|suspend|publish|rollback|owner role|auth\/RLS/i.test(scope))) {
    throw new Error(`${actionDescription}_contains_forbidden_scope`);
  }
};
