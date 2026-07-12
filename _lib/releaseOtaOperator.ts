import {
  assertNoForbiddenScopedOperatorMutation,
  buildScopedOperatorApprovalRequest,
  buildScopedOperatorPlan,
  canAutoExecuteScopedOperatorAction,
  sanitizeScopedOperatorProof,
  type ScopedOperatorActionDefinition,
} from "./scopedAutonomousOperatorShared";

const SYSTEM_ID = "release_ota_operator" as const;

export const releaseOtaOperatorActions = [
  {
    actionId: "health_snapshot",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["release_health_snapshots", "release_operator_events"],
    forbiddenScope: ["OTA publish", "OTA rollback", "store release mutation"],
    reason: "record release diagnostics health only",
  },
  {
    actionId: "emergency_launch_report",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["rollout_anomaly_findings", "release_required_review_flags"],
    forbiddenScope: ["hide emergency launch", "fake installed proof"],
    reason: "record emergency/embedded launch findings for review",
  },
  {
    actionId: "rollback_readiness_plan",
    approvalLevel: 2,
    risk: "safe_write",
    allowedWriteScope: ["rollback_readiness_records", "release_required_review_flags"],
    forbiddenScope: ["execute rollback", "publish production OTA"],
    reason: "write rollback readiness only, not a rollback",
  },
  {
    actionId: "production_ota_publish",
    approvalLevel: 4,
    risk: "approval_required",
    allowedWriteScope: ["owner-approved release publish only"],
    forbiddenScope: ["auto-publish production OTA without approval", "change runtimeVersion policy"],
    reason: "production OTA publishing requires owner approval and release preflight",
  },
  {
    actionId: "production_ota_rollback",
    approvalLevel: 4,
    risk: "approval_required",
    allowedWriteScope: ["owner-approved rollback only"],
    forbiddenScope: ["auto-rollback production OTA without approval", "fake installed proof"],
    reason: "production OTA rollback requires owner approval and fresh diagnostics",
  },
] as const satisfies readonly ScopedOperatorActionDefinition[];

export const classifyReleaseOtaHealth = (input: { emergencyLaunchCount?: number; rolloutAnomalyCount?: number }) => {
  if ((input.emergencyLaunchCount ?? 0) > 0) return "critical";
  if ((input.rolloutAnomalyCount ?? 0) > 0) return "degraded";
  return "healthy";
};

export const classifyReleaseOtaApprovalLevel = (actionId: string) => (
  buildReleaseOtaPlan(actionId).approvalLevel
);

export const buildReleaseOtaPlan = (actionId: string) => buildScopedOperatorPlan(
  SYSTEM_ID,
  actionId,
  releaseOtaOperatorActions,
  "mark release finding superseded; rollback/publish requires separate owner-approved action",
  "release_ota_operator emergency stop blocks safe writes; read/report remains available",
  4,
);

export const canAutoExecuteReleaseOta = (actionId: string) => (
  canAutoExecuteScopedOperatorAction(buildReleaseOtaPlan(actionId))
);

export const buildReleaseOtaApprovalRequest = (actionId: string, metadata: Record<string, unknown> = {}) => (
  buildScopedOperatorApprovalRequest(
    buildReleaseOtaPlan(actionId),
    "Release / OTA Operator approval request",
    "Run proof:release-ota-operator and guard:release-ota-operator before execution.",
    "Re-run release diagnostics, verify updateId/runtime/channel scope, and confirm emergency_stop is false.",
    metadata,
  )
);

export const sanitizeReleaseOtaProof = sanitizeScopedOperatorProof;

export const assertNoForbiddenReleaseOtaMutation = (actionId: string) => (
  assertNoForbiddenScopedOperatorMutation(buildReleaseOtaPlan(actionId), "release_ota_operator")
);
