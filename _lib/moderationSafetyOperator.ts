import {
  assertNoForbiddenScopedOperatorMutation,
  buildScopedOperatorApprovalRequest,
  buildScopedOperatorPlan,
  canAutoExecuteScopedOperatorAction,
  sanitizeScopedOperatorProof,
  type ScopedOperatorActionDefinition,
} from "./scopedAutonomousOperatorShared";

const SYSTEM_ID = "moderation_safety_operator" as const;

export const moderationSafetyOperatorActions = [
  {
    actionId: "queue_health",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["moderation_health_snapshots", "moderation_operator_events"],
    forbiddenScope: ["ban user", "delete content", "hidden enforcement"],
    reason: "record moderation queue health only",
  },
  {
    actionId: "stale_case_scan",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["moderation_stale_case_findings", "moderation_required_review_flags"],
    forbiddenScope: ["case closure without review", "user rights change"],
    reason: "record stale case findings for staff review",
  },
  {
    actionId: "duplicate_report_scan",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["moderation_duplicate_report_detections", "moderation_case_priority_flags"],
    forbiddenScope: ["delete reports", "hide reports from audit"],
    reason: "record duplicate report detection without enforcement",
  },
  {
    actionId: "recommend_safety_action",
    approvalLevel: 2,
    risk: "safe_write",
    allowedWriteScope: ["safety_review_recommendations", "moderation_required_review_flags"],
    forbiddenScope: ["permanent ban", "suspend account", "delete content", "disable live/uploads"],
    reason: "write recommendation/review flags only",
  },
  {
    actionId: "ban_suspend_restrict_or_delete_content",
    approvalLevel: 3,
    risk: "approval_required",
    allowedWriteScope: ["staff/owner-approved enforcement scope only"],
    forbiddenScope: ["hidden enforcement", "no appeal/review trail", "public/private exposure mutation"],
    reason: "account rights and content enforcement require approval and audit",
  },
] as const satisfies readonly ScopedOperatorActionDefinition[];

export const classifyModerationSafetyHealth = (input: { staleCaseCount?: number; urgentReviewCount?: number }) => {
  if ((input.urgentReviewCount ?? 0) > 0) return "needs_review";
  if ((input.staleCaseCount ?? 0) > 25) return "degraded";
  return "healthy";
};

export const classifyModerationSafetyApprovalLevel = (actionId: string) => buildModerationSafetyPlan(actionId).approvalLevel;

export const buildModerationSafetyPlan = (actionId: string) => buildScopedOperatorPlan(
  SYSTEM_ID,
  actionId,
  moderationSafetyOperatorActions,
  "mark moderation finding superseded after review; enforcement remains separately audited",
  "moderation_safety_operator emergency stop blocks safe writes; read/report remains available",
  3,
);

export const canAutoExecuteModerationSafety = (actionId: string) => (
  canAutoExecuteScopedOperatorAction(buildModerationSafetyPlan(actionId))
);

export const buildModerationSafetyApprovalRequest = (actionId: string, metadata: Record<string, unknown> = {}) => (
  buildScopedOperatorApprovalRequest(
    buildModerationSafetyPlan(actionId),
    "Moderation / Safety Operator approval request",
    "Run proof:moderation-safety-operator and guard:moderation-safety-operator before execution.",
    "Re-run queue/case preflight, verify exact enforcement scope, confirm appeal/review trail, and confirm emergency_stop is false.",
    metadata,
  )
);

export const sanitizeModerationSafetyProof = sanitizeScopedOperatorProof;

export const assertNoForbiddenModerationSafetyMutation = (actionId: string) => (
  assertNoForbiddenScopedOperatorMutation(buildModerationSafetyPlan(actionId), "moderation_safety_operator")
);
