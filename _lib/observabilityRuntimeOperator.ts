import {
  assertNoForbiddenScopedOperatorMutation,
  buildScopedOperatorApprovalRequest,
  buildScopedOperatorPlan,
  canAutoExecuteScopedOperatorAction,
  sanitizeScopedOperatorProof,
  type ScopedOperatorActionDefinition,
} from "./scopedAutonomousOperatorShared";

const SYSTEM_ID = "observability_runtime_operator" as const;

export const observabilityRuntimeOperatorActions = [
  {
    actionId: "crash_health",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["runtime_health_snapshots", "observability_operator_events"],
    forbiddenScope: ["delete crash evidence", "silence crash reporting", "raw stack traces"],
    reason: "record redacted crash health summary only",
  },
  {
    actionId: "record_crash_cluster_finding",
    approvalLevel: 2,
    risk: "safe_write",
    allowedWriteScope: ["crash_cluster_findings", "observability_required_review_flags"],
    forbiddenScope: ["delete crash evidence", "raw secrets", "auth/session tokens", "user PII beyond allowed hashes"],
    reason: "record redacted crash cluster finding with signature hash",
  },
  {
    actionId: "record_js_error_finding",
    approvalLevel: 2,
    risk: "safe_write",
    allowedWriteScope: ["js_error_findings", "observability_required_review_flags"],
    forbiddenScope: ["raw error messages containing secrets", "auth/session tokens", "user PII beyond allowed hashes"],
    reason: "record redacted JS error cluster finding with signature hash",
  },
  {
    actionId: "record_performance_regression",
    approvalLevel: 2,
    risk: "safe_write",
    allowedWriteScope: ["performance_regression_findings", "runtime_health_snapshots"],
    forbiddenScope: ["hidden user tracking", "provider config mutation"],
    reason: "record app startup, screen render, Firebase Performance, or network timing regression",
  },
  {
    actionId: "analytics_delivery_health",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["analytics_delivery_findings", "runtime_health_snapshots"],
    forbiddenScope: ["provider key output", "analytics schema mutation"],
    reason: "record analytics delivery health only",
  },
  {
    actionId: "record_release_anomaly",
    approvalLevel: 2,
    risk: "safe_write",
    allowedWriteScope: ["release_health_findings", "observability_required_review_flags"],
    forbiddenScope: ["publish OTA", "rollback OTA", "fake installed proof", "hide emergency launch"],
    reason: "record release diagnostics anomaly without release execution",
  },
  {
    actionId: "backend_error_rate_report",
    approvalLevel: 2,
    risk: "safe_write",
    allowedWriteScope: ["backend_error_rate_findings", "runtime_health_snapshots"],
    forbiddenScope: ["secret output", "provider credential output", "service-role logging"],
    reason: "record backend or Edge Function error-rate summary only",
  },
  {
    actionId: "remote_config_or_feature_flag_mutation",
    approvalLevel: 3,
    risk: "approval_required",
    allowedWriteScope: ["owner-approved Remote Config or feature flag mutation only"],
    forbiddenScope: ["silent Remote Config mutation", "provider secret mutation", "approval bypass"],
    reason: "Remote Config or feature flag mutation requires owner approval",
  },
  {
    actionId: "provider_analytics_config_mutation",
    approvalLevel: 3,
    risk: "approval_required",
    allowedWriteScope: ["owner-approved provider analytics config mutation only"],
    forbiddenScope: ["provider key output", "secret rotation", "analytics provider mutation without approval"],
    reason: "Provider analytics config mutation requires owner approval",
  },
  {
    actionId: "production_ota_publish",
    approvalLevel: 4,
    risk: "approval_required",
    allowedWriteScope: ["owner-approved production OTA publish only"],
    forbiddenScope: ["automatic public release without owner approval", "fake installed proof"],
    reason: "Production OTA publish requires owner approval and release preflight",
  },
  {
    actionId: "production_ota_rollback",
    approvalLevel: 4,
    risk: "approval_required",
    allowedWriteScope: ["owner-approved production OTA rollback only"],
    forbiddenScope: ["automatic public rollback without owner approval", "fake installed proof"],
    reason: "Production OTA rollback requires owner approval and release preflight",
  },
] as const satisfies readonly ScopedOperatorActionDefinition[];

export const classifyObservabilityHealth = (input: {
  crashClusterCount?: number;
  jsErrorCount?: number;
  performanceRegressionCount?: number;
  backendErrorRatePercent?: number;
  emergencyLaunchCount?: number;
}) => {
  if ((input.crashClusterCount ?? 0) > 0 || (input.emergencyLaunchCount ?? 0) > 0 || (input.backendErrorRatePercent ?? 0) >= 10) return "critical";
  if ((input.jsErrorCount ?? 0) > 0 || (input.performanceRegressionCount ?? 0) > 0 || (input.backendErrorRatePercent ?? 0) >= 3) return "degraded";
  return "healthy";
};

export const classifyObservabilityApprovalLevel = (actionId: string) => (
  buildObservabilityWatchPlan(actionId).approvalLevel
);

export const buildObservabilityWatchPlan = (actionId: string) => {
  const unknownLevel = /publish|rollback/i.test(actionId) ? 4 : 3;
  return buildScopedOperatorPlan(
    SYSTEM_ID,
    actionId,
    observabilityRuntimeOperatorActions,
    "mark observability finding superseded after review; never delete crash evidence",
    "observability_runtime_operator emergency stop blocks safe writes; read/report remains available",
    unknownLevel,
  );
};

export const canAutoExecuteObservabilityAction = (actionId: string) => (
  canAutoExecuteScopedOperatorAction(buildObservabilityWatchPlan(actionId))
);

export const buildObservabilityApprovalRequest = (actionId: string, metadata: Record<string, unknown> = {}) => (
  buildScopedOperatorApprovalRequest(
    buildObservabilityWatchPlan(actionId),
    "Observability / Runtime Health Operator approval request",
    "Run proof:observability-runtime-operator and guard:observability-runtime-operator before execution.",
    "Re-run release diagnostics, observability preflight, exact scope check, and emergency-state check before execution.",
    metadata,
  )
);

export const sanitizeObservabilityProof = sanitizeScopedOperatorProof;

export const assertNoForbiddenObservabilityMutation = (actionId: string) => (
  assertNoForbiddenScopedOperatorMutation(buildObservabilityWatchPlan(actionId), "observability_runtime_operator")
);
