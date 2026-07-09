export type MediaTranscodeOperatorMode =
  | "disabled"
  | "dry_run"
  | "one_job"
  | "continuous";

export type MediaTranscodeOperatorState =
  | "disabled"
  | "dry_run_only"
  | "ready_for_one_job"
  | "running_one_job"
  | "auditing"
  | "passed"
  | "failed"
  | "quarantined"
  | "paused"
  | "emergency_stop";

export type MediaTranscodeBackupGateStatus = "closed" | "partial" | "blocked";
export type MediaTranscodeOperatorRequester = "operator" | "worker" | "auditor";

export type MediaTranscodeOperatorGateResult = {
  gate: string;
  passed: boolean;
  blockedReason: string | null;
};

export type MediaTranscodeWorkerLease = {
  leaseId: string;
  operatorRunId: string;
  mode: Extract<MediaTranscodeOperatorMode, "one_job" | "continuous">;
  sourceId: string;
  maxJobs: number;
  completedJobs: number;
  grantedAtMillis: number;
  expiresAtMillis: number;
  state: "running_one_job" | "paused" | "emergency_stop";
};

export type MediaTranscodeOperatorDecision = {
  mode: MediaTranscodeOperatorMode;
  state: MediaTranscodeOperatorState;
  allowed: boolean;
  canRunWorker: boolean;
  canWriteRows: boolean;
  workerWriteStatus: "none" | "pending_audit";
  resolverTrustAllowed: boolean;
  auditRequiredBeforeResolverTrust: boolean;
  autoDisableAfterRun: boolean;
  blockedReason: string | null;
  gates: MediaTranscodeOperatorGateResult[];
  lease: MediaTranscodeWorkerLease | null;
};

export type MediaTranscodeOperatorInput = {
  mode?: MediaTranscodeOperatorMode | null;
  requester?: MediaTranscodeOperatorRequester | null;
  sourceId?: string | null;
  allowedSourceIds?: string[] | null;
  maxJobsPerRun?: number | null;
  backfillEnabled?: boolean | null;
  backupGateStatus?: MediaTranscodeBackupGateStatus | null;
  ownerOneJobOverride?: boolean | null;
  sourceAllowedForProcessing?: boolean | null;
  emergencyStop?: boolean | null;
  operatorRunId?: string | null;
  leaseTtlMillis?: number | null;
  nowMillis?: number | null;
};

export type MediaTranscodeOperatorCompletionInput = {
  mode: MediaTranscodeOperatorMode;
  success?: boolean | null;
  failed?: boolean | null;
  auditPassed?: boolean | null;
  auditFailed?: boolean | null;
  emergencyStop?: boolean | null;
};

export type MediaTranscodeOperatorAutoDisableResult = {
  mode: MediaTranscodeOperatorMode;
  state: MediaTranscodeOperatorState;
  disabled: boolean;
  quarantine: boolean;
  reason: string | null;
};

export const MEDIA_TRANSCODE_OPERATOR_DEFAULT_MODE: MediaTranscodeOperatorMode = "disabled";
export const MEDIA_TRANSCODE_OPERATOR_PENDING_AUDIT_STATUS = "pending_audit" as const;
export const MEDIA_TRANSCODE_OPERATOR_ONE_JOB_MAX_JOBS = 1;
export const MEDIA_TRANSCODE_OPERATOR_DEFAULT_LEASE_TTL_MILLIS = 15 * 60 * 1000;

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeMode = (mode: unknown): MediaTranscodeOperatorMode => {
  const value = toText(mode).toLowerCase();
  if (value === "dry_run" || value === "one_job" || value === "continuous") return value;
  return MEDIA_TRANSCODE_OPERATOR_DEFAULT_MODE;
};

const normalizeBackupGate = (value: unknown): MediaTranscodeBackupGateStatus => {
  const text = toText(value).toLowerCase();
  if (text === "closed" || text === "partial") return text;
  return "blocked";
};

const buildGate = (
  gate: string,
  passed: boolean,
  blockedReason: string | null = null,
): MediaTranscodeOperatorGateResult => ({
  gate,
  passed,
  blockedReason: passed ? null : blockedReason,
});

const firstBlockedReason = (gates: MediaTranscodeOperatorGateResult[]) => (
  gates.find((gate) => !gate.passed)?.blockedReason ?? null
);

const buildLease = (input: {
  mode: Extract<MediaTranscodeOperatorMode, "one_job" | "continuous">;
  sourceId: string;
  maxJobs: number;
  operatorRunId: string;
  nowMillis: number;
  leaseTtlMillis: number;
}): MediaTranscodeWorkerLease => ({
  leaseId: `${input.operatorRunId}:${input.sourceId}:${input.nowMillis}`,
  operatorRunId: input.operatorRunId,
  mode: input.mode,
  sourceId: input.sourceId,
  maxJobs: input.maxJobs,
  completedJobs: 0,
  grantedAtMillis: input.nowMillis,
  expiresAtMillis: input.nowMillis + input.leaseTtlMillis,
  state: input.mode === "one_job" ? "running_one_job" : "paused",
});

export function resolveMediaTranscodeOperatorDecision(
  input: MediaTranscodeOperatorInput = {},
): MediaTranscodeOperatorDecision {
  const mode = normalizeMode(input.mode);
  const requester = toText(input.requester || "operator") as MediaTranscodeOperatorRequester;
  const sourceId = toText(input.sourceId);
  const allowedSourceIds = new Set((input.allowedSourceIds ?? []).map((id) => toText(id)).filter(Boolean));
  const maxJobsPerRun = Number(input.maxJobsPerRun ?? MEDIA_TRANSCODE_OPERATOR_ONE_JOB_MAX_JOBS);
  const backupGateStatus = normalizeBackupGate(input.backupGateStatus);
  const emergencyStop = input.emergencyStop === true;
  const ownerOneJobOverride = input.ownerOneJobOverride === true;
  const sourceAllowedForProcessing = input.sourceAllowedForProcessing === true;
  const backfillEnabled = input.backfillEnabled === true;
  const nowMillis = Number.isFinite(Number(input.nowMillis)) ? Number(input.nowMillis) : Date.now();
  const leaseTtlMillis = Number.isFinite(Number(input.leaseTtlMillis))
    ? Math.max(1, Number(input.leaseTtlMillis))
    : MEDIA_TRANSCODE_OPERATOR_DEFAULT_LEASE_TTL_MILLIS;
  const operatorRunId = toText(input.operatorRunId) || "media-transcode-operator-proof-run";
  const gates: MediaTranscodeOperatorGateResult[] = [];

  if (emergencyStop) {
    gates.push(buildGate("emergency_stop_always_blocks", false, "emergency_stop"));
    return {
      mode,
      state: "emergency_stop",
      allowed: false,
      canRunWorker: false,
      canWriteRows: false,
      workerWriteStatus: "none",
      resolverTrustAllowed: false,
      auditRequiredBeforeResolverTrust: true,
      autoDisableAfterRun: true,
      blockedReason: "emergency_stop",
      gates,
      lease: null,
    };
  }

  if (mode === "disabled") {
    gates.push(buildGate("default_mode_disabled", false, "operator_disabled"));
    return {
      mode,
      state: "disabled",
      allowed: false,
      canRunWorker: false,
      canWriteRows: false,
      workerWriteStatus: "none",
      resolverTrustAllowed: false,
      auditRequiredBeforeResolverTrust: true,
      autoDisableAfterRun: true,
      blockedReason: "operator_disabled",
      gates,
      lease: null,
    };
  }

  if (requester === "worker") {
    gates.push(buildGate("worker_cannot_self_enable", false, "worker_cannot_self_enable"));
    return {
      mode,
      state: "paused",
      allowed: false,
      canRunWorker: false,
      canWriteRows: false,
      workerWriteStatus: "none",
      resolverTrustAllowed: false,
      auditRequiredBeforeResolverTrust: true,
      autoDisableAfterRun: true,
      blockedReason: "worker_cannot_self_enable",
      gates,
      lease: null,
    };
  }

  if (mode === "dry_run") {
    gates.push(buildGate("dry_run_plan_only_no_writes", true));
    return {
      mode,
      state: "dry_run_only",
      allowed: true,
      canRunWorker: false,
      canWriteRows: false,
      workerWriteStatus: "none",
      resolverTrustAllowed: false,
      auditRequiredBeforeResolverTrust: true,
      autoDisableAfterRun: true,
      blockedReason: null,
      gates,
      lease: null,
    };
  }

  if (mode === "continuous") {
    gates.push(buildGate(
      "continuous_requires_backup_gate_closed",
      backupGateStatus === "closed",
      "backup_gate_not_closed_for_continuous",
    ));
    gates.push(buildGate("continuous_backfill_must_be_explicitly_reviewed", !backfillEnabled, "backfill_disabled_required"));
    const blockedReason = firstBlockedReason(gates);
    return {
      mode,
      state: blockedReason ? "paused" : "paused",
      allowed: !blockedReason,
      canRunWorker: !blockedReason,
      canWriteRows: !blockedReason,
      workerWriteStatus: blockedReason ? "none" : MEDIA_TRANSCODE_OPERATOR_PENDING_AUDIT_STATUS,
      resolverTrustAllowed: false,
      auditRequiredBeforeResolverTrust: true,
      autoDisableAfterRun: false,
      blockedReason,
      gates,
      lease: blockedReason ? null : buildLease({
        mode: "continuous",
        sourceId: sourceId || "continuous",
        maxJobs: Math.max(1, maxJobsPerRun),
        operatorRunId,
        nowMillis,
        leaseTtlMillis,
      }),
    };
  }

  gates.push(buildGate("one_job_requires_source_allowlist", !!sourceId && allowedSourceIds.has(sourceId), "source_not_allowlisted"));
  gates.push(buildGate("one_job_requires_max_jobs_per_run_one", maxJobsPerRun === MEDIA_TRANSCODE_OPERATOR_ONE_JOB_MAX_JOBS, "max_jobs_per_run_must_be_one"));
  gates.push(buildGate("one_job_requires_backfill_disabled", !backfillEnabled, "backfill_disabled_required"));
  gates.push(buildGate(
    "one_job_requires_backup_gate_or_owner_override",
    backupGateStatus === "closed" || ownerOneJobOverride,
    "backup_gate_blocked_without_owner_one_job_override",
  ));
  gates.push(buildGate("one_job_requires_source_allowed_for_processing", sourceAllowedForProcessing, "source_not_allowed_for_processing"));

  const blockedReason = firstBlockedReason(gates);
  return {
    mode,
    state: blockedReason ? "paused" : "ready_for_one_job",
    allowed: !blockedReason,
    canRunWorker: !blockedReason,
    canWriteRows: !blockedReason,
    workerWriteStatus: blockedReason ? "none" : MEDIA_TRANSCODE_OPERATOR_PENDING_AUDIT_STATUS,
    resolverTrustAllowed: false,
    auditRequiredBeforeResolverTrust: true,
    autoDisableAfterRun: true,
    blockedReason,
    gates,
    lease: blockedReason ? null : buildLease({
      mode: "one_job",
      sourceId,
      maxJobs: MEDIA_TRANSCODE_OPERATOR_ONE_JOB_MAX_JOBS,
      operatorRunId,
      nowMillis,
      leaseTtlMillis,
    }),
  };
}

export function resolveOperatorAutoDisable(
  input: MediaTranscodeOperatorCompletionInput,
): MediaTranscodeOperatorAutoDisableResult {
  if (input.emergencyStop === true) {
    return {
      mode: "disabled",
      state: "emergency_stop",
      disabled: true,
      quarantine: false,
      reason: "emergency_stop",
    };
  }

  if (input.auditFailed === true || input.failed === true) {
    return {
      mode: "disabled",
      state: input.auditFailed === true ? "quarantined" : "failed",
      disabled: input.mode === "one_job",
      quarantine: input.auditFailed === true,
      reason: input.auditFailed === true ? "audit_failed" : "job_failed",
    };
  }

  if (input.auditPassed === true || input.success === true) {
    return {
      mode: input.mode === "one_job" ? "disabled" : input.mode,
      state: input.auditPassed === true ? "passed" : "passed",
      disabled: input.mode === "one_job",
      quarantine: false,
      reason: input.mode === "one_job" ? "one_job_auto_disabled_after_success" : null,
    };
  }

  return {
    mode: input.mode,
    state: "auditing",
    disabled: false,
    quarantine: false,
    reason: "awaiting_audit",
  };
}
