export type MediaAutomationMode =
  | "off"
  | "dry_run"
  | "one_job"
  | "batch"
  | "continuous_limited"
  | "continuous_full_blocked";

export type MediaAutomationState =
  | "off"
  | "dry_run_only"
  | "ready_for_one_job"
  | "ready_for_batch"
  | "ready_for_limited_continuous"
  | "blocked"
  | "paused"
  | "emergency_stop";

export type MediaAutomationGateResult = {
  gate: string;
  passed: boolean;
  blockedReason: string | null;
};

export type MediaAutomationControllerInput = {
  mode?: MediaAutomationMode | null;
  emergencyStop?: boolean | null;
  backupGateClosed?: boolean | null;
  scheduledBackupRestoreGateClosed?: boolean | null;
  ownerApprovalForBatch?: boolean | null;
  ownerApprovalForContinuous?: boolean | null;
  sourceAllowlistCount?: number | null;
  maxBatchSize?: number | null;
  maxJobsPerRun?: number | null;
  maxConcurrency?: number | null;
  backfillRequested?: boolean | null;
  broadBackfillApproved?: boolean | null;
  auditRequired?: boolean | null;
  rollbackAvailable?: boolean | null;
  telemetryAvailable?: boolean | null;
  killSwitchOn?: boolean | null;
  signedOriginFallbackAvailable?: boolean | null;
};

export type MediaAutomationControllerDecision = {
  mode: MediaAutomationMode;
  state: MediaAutomationState;
  allowed: boolean;
  canDiscover: boolean;
  canPlanJobs: boolean;
  canWriteJobs: boolean;
  canRunWorker: boolean;
  canTrustResolverRows: boolean;
  playbackKillSwitchOn: boolean;
  signedOriginFallbackRequired: true;
  blockedReason: string | null;
  maxJobsPerRun: number;
  maxConcurrency: number;
  maxBatchSize: number;
  gates: MediaAutomationGateResult[];
};

export const MEDIA_AUTOMATION_DEFAULT_MODE: MediaAutomationMode = "off";
export const MEDIA_AUTOMATION_DEFAULT_MAX_CONCURRENCY = 1;
export const MEDIA_AUTOMATION_DEFAULT_MAX_JOBS_PER_RUN = 1;

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeMode = (value: unknown): MediaAutomationMode => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "dry_run"
    || normalized === "one_job"
    || normalized === "batch"
    || normalized === "continuous_limited"
    || normalized === "continuous_full_blocked"
  ) {
    return normalized;
  }
  return "off";
};

const normalizeNonNegativeInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
};

const gate = (gateName: string, passed: boolean, blockedReason: string | null = null): MediaAutomationGateResult => ({
  gate: gateName,
  passed,
  blockedReason: passed ? null : blockedReason,
});

const firstBlockedReason = (gates: MediaAutomationGateResult[]) => (
  gates.find((entry) => !entry.passed)?.blockedReason ?? null
);

const commonSafetyGates = (input: MediaAutomationControllerInput): MediaAutomationGateResult[] => [
  gate("signed_origin_fallback_required", input.signedOriginFallbackAvailable !== false, "signed_origin_fallback_missing"),
  gate("audit_required_before_resolver_trust", input.auditRequired !== false, "audit_required_missing"),
  gate("rollback_plan_required", input.rollbackAvailable !== false, "rollback_plan_missing"),
  gate("broad_backfill_disabled_by_default", input.backfillRequested !== true, "broad_backfill_denied"),
  gate("playback_kill_switch_available", input.killSwitchOn !== false || input.killSwitchOn === false, null),
];

export function resolveMediaAutomationController(
  input: MediaAutomationControllerInput = {},
): MediaAutomationControllerDecision {
  const mode = normalizeMode(input.mode);
  const maxJobsPerRun = normalizeNonNegativeInteger(input.maxJobsPerRun, MEDIA_AUTOMATION_DEFAULT_MAX_JOBS_PER_RUN);
  const maxConcurrency = normalizeNonNegativeInteger(input.maxConcurrency, MEDIA_AUTOMATION_DEFAULT_MAX_CONCURRENCY);
  const maxBatchSize = normalizeNonNegativeInteger(input.maxBatchSize, 0);
  const gates: MediaAutomationGateResult[] = [];

  if (input.emergencyStop === true) {
    gates.push(gate("emergency_stop_overrides_all_modes", false, "emergency_stop"));
    return {
      mode,
      state: "emergency_stop",
      allowed: false,
      canDiscover: false,
      canPlanJobs: false,
      canWriteJobs: false,
      canRunWorker: false,
      canTrustResolverRows: false,
      playbackKillSwitchOn: true,
      signedOriginFallbackRequired: true,
      blockedReason: "emergency_stop",
      maxJobsPerRun,
      maxConcurrency,
      maxBatchSize,
      gates,
    };
  }

  if (mode === "off") {
    gates.push(gate("default_mode_off", false, "automation_off"));
    return {
      mode,
      state: "off",
      allowed: false,
      canDiscover: true,
      canPlanJobs: false,
      canWriteJobs: false,
      canRunWorker: false,
      canTrustResolverRows: false,
      playbackKillSwitchOn: input.killSwitchOn !== false,
      signedOriginFallbackRequired: true,
      blockedReason: "automation_off",
      maxJobsPerRun,
      maxConcurrency,
      maxBatchSize,
      gates,
    };
  }

  if (mode === "continuous_full_blocked") {
    gates.push(gate("continuous_full_requires_future_owner_approval", false, "continuous_full_blocked"));
    return {
      mode,
      state: "blocked",
      allowed: false,
      canDiscover: true,
      canPlanJobs: true,
      canWriteJobs: false,
      canRunWorker: false,
      canTrustResolverRows: false,
      playbackKillSwitchOn: input.killSwitchOn !== false,
      signedOriginFallbackRequired: true,
      blockedReason: "continuous_full_blocked",
      maxJobsPerRun,
      maxConcurrency,
      maxBatchSize,
      gates,
    };
  }

  gates.push(...commonSafetyGates(input));

  if (mode === "dry_run") {
    gates.push(gate("dry_run_writes_nothing", true));
    const blockedReason = firstBlockedReason(gates);
    return {
      mode,
      state: blockedReason ? "blocked" : "dry_run_only",
      allowed: !blockedReason,
      canDiscover: !blockedReason,
      canPlanJobs: !blockedReason,
      canWriteJobs: false,
      canRunWorker: false,
      canTrustResolverRows: false,
      playbackKillSwitchOn: input.killSwitchOn !== false,
      signedOriginFallbackRequired: true,
      blockedReason,
      maxJobsPerRun,
      maxConcurrency,
      maxBatchSize,
      gates,
    };
  }

  if (mode === "one_job") {
    gates.push(gate("one_job_requires_source_allowlist", (input.sourceAllowlistCount ?? 0) > 0, "source_allowlist_required"));
    gates.push(gate("one_job_requires_max_jobs_one", maxJobsPerRun === 1, "max_jobs_per_run_must_be_one"));
    gates.push(gate("one_job_requires_backup_gate_closed", input.backupGateClosed === true, "backup_gate_not_closed"));
    const blockedReason = firstBlockedReason(gates);
    return {
      mode,
      state: blockedReason ? "blocked" : "ready_for_one_job",
      allowed: !blockedReason,
      canDiscover: !blockedReason,
      canPlanJobs: !blockedReason,
      canWriteJobs: !blockedReason,
      canRunWorker: !blockedReason,
      canTrustResolverRows: false,
      playbackKillSwitchOn: input.killSwitchOn === true,
      signedOriginFallbackRequired: true,
      blockedReason,
      maxJobsPerRun,
      maxConcurrency,
      maxBatchSize,
      gates,
    };
  }

  if (mode === "batch") {
    gates.push(gate("batch_requires_owner_approval", input.ownerApprovalForBatch === true, "owner_batch_approval_required"));
    gates.push(gate("batch_requires_max_batch_size", maxBatchSize > 0, "max_batch_size_required"));
    gates.push(gate("batch_requires_backup_gate_closed", input.backupGateClosed === true, "backup_gate_not_closed"));
    gates.push(gate("batch_requires_max_jobs_cap", maxJobsPerRun > 0 && maxJobsPerRun <= maxBatchSize, "max_jobs_per_run_invalid"));
    const blockedReason = firstBlockedReason(gates);
    return {
      mode,
      state: blockedReason ? "blocked" : "ready_for_batch",
      allowed: !blockedReason,
      canDiscover: !blockedReason,
      canPlanJobs: !blockedReason,
      canWriteJobs: !blockedReason,
      canRunWorker: !blockedReason,
      canTrustResolverRows: false,
      playbackKillSwitchOn: input.killSwitchOn === true,
      signedOriginFallbackRequired: true,
      blockedReason,
      maxJobsPerRun,
      maxConcurrency,
      maxBatchSize,
      gates,
    };
  }

  gates.push(gate("continuous_limited_requires_owner_approval", input.ownerApprovalForContinuous === true, "owner_continuous_approval_required"));
  gates.push(gate("continuous_limited_requires_scheduled_backup_restore", input.scheduledBackupRestoreGateClosed === true, "scheduled_backup_restore_gate_not_closed"));
  gates.push(gate("continuous_limited_requires_backup_gate_closed", input.backupGateClosed === true, "backup_gate_not_closed"));
  gates.push(gate("continuous_limited_requires_concurrency_cap", maxConcurrency > 0 && maxConcurrency <= 2, "max_concurrency_invalid"));
  gates.push(gate("continuous_limited_requires_job_cap", maxJobsPerRun > 0 && maxJobsPerRun <= 25, "max_jobs_per_run_invalid"));
  gates.push(gate("continuous_limited_requires_telemetry", input.telemetryAvailable === true, "telemetry_required"));
  const blockedReason = firstBlockedReason(gates);

  return {
    mode,
    state: blockedReason ? "blocked" : "ready_for_limited_continuous",
    allowed: !blockedReason,
    canDiscover: !blockedReason,
    canPlanJobs: !blockedReason,
    canWriteJobs: !blockedReason,
    canRunWorker: !blockedReason,
    canTrustResolverRows: false,
    playbackKillSwitchOn: input.killSwitchOn === true,
    signedOriginFallbackRequired: true,
    blockedReason,
    maxJobsPerRun,
    maxConcurrency,
    maxBatchSize,
    gates,
  };
}

export function sanitizeMediaAutomationControllerProof<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (typeof entry !== "string") return entry;
    if (/postgres(?:ql)?:\/\//i.test(entry)) return "[REDACTED_DB_URL]";
    if (/X-Amz-Signature=/i.test(entry)) return "[REDACTED_SIGNED_URL]";
    if (/eyJ[A-Za-z0-9_-]{20,}\./.test(entry)) return "[REDACTED_TOKEN]";
    return entry;
  })) as T;
}
