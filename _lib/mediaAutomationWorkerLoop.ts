import type { MediaAutomationControllerDecision } from "./mediaAutomationController";
import type { MediaAutomationJobPlan } from "./mediaAutomationJobs";

export type MediaAutomationWorkerRunPlan = {
  batchId: string;
  allowed: boolean;
  stopReason: string | null;
  maxConcurrency: number;
  maxJobsPerRun: number;
  jobCount: number;
  leasesRequired: true;
  auditRequiredBeforeResolverTrust: true;
  rollbackRequired: true;
  telemetryRequired: true;
  productionPlaybackSwitched: false;
};

export type MediaAutomationWorkerLease = {
  leaseId: string;
  batchId: string;
  sourceIds: string[];
  maxJobs: number;
  expiresAtMillis: number;
};

export type MediaAutomationAuditRow = {
  sourceId: string;
  batchId: string;
  outputPrefix: string;
  status: "pending_audit" | "audit_passed" | "audit_failed" | "quarantined";
  isPublicPlaybackSafe: boolean;
  isOriginal: boolean;
  visibility: "public" | "premium" | "private" | string;
  scanStatus: string;
  moderationStatus: string;
};

export type MediaAutomationBatchAuditResult = {
  batchId: string;
  passed: boolean;
  resolverEligible: boolean;
  quarantine: boolean;
  failures: string[];
};

export const MEDIA_AUTOMATION_TELEMETRY_EVENTS = [
  "auto_discovery_started",
  "candidate_classified",
  "batch_planned",
  "batch_dry_run_passed",
  "batch_started",
  "candidate_discovered",
  "job_planned",
  "job_claimed",
  "job_transcode_started",
  "transcode_started",
  "job_transcode_completed",
  "transcode_completed",
  "output_uploaded",
  "audit_passed",
  "audit_failed",
  "resolver_eligible",
  "playback_started",
  "playback_cdn_selected",
  "playback_fallback",
  "playback_fallback_used",
  "rollback_planned",
  "rollback_executed",
] as const;

const ALLOWED_SCAN = new Set(["clean", "approved"]);
const ALLOWED_MODERATION = new Set(["clean", "approved", "allowed"]);

const safePrefix = (prefix: string) => (
  prefix.startsWith("playback/public/auto/")
  && !prefix.includes("..")
  && !/(^|\/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(\/|$)/i.test(prefix)
);

export function resolveAutomationWorkerStopReason(input: {
  decision: MediaAutomationControllerDecision;
  plans: MediaAutomationJobPlan[];
}): string | null {
  if (!input.decision.allowed) return input.decision.blockedReason ?? "automation_not_allowed";
  if (!input.decision.canRunWorker) return "worker_not_allowed";
  if (input.plans.length === 0) return "no_jobs_selected";
  if (input.plans.length > input.decision.maxJobsPerRun) return "max_jobs_per_run_exceeded";
  if (input.plans.some((plan) => !plan.valid)) return "invalid_job_plan";
  return null;
}

export function planAutomationWorkerRun(input: {
  batchId: string;
  decision: MediaAutomationControllerDecision;
  plans: MediaAutomationJobPlan[];
}): MediaAutomationWorkerRunPlan {
  const stopReason = resolveAutomationWorkerStopReason(input);
  return {
    batchId: input.batchId,
    allowed: !stopReason,
    stopReason,
    maxConcurrency: input.decision.maxConcurrency,
    maxJobsPerRun: input.decision.maxJobsPerRun,
    jobCount: input.plans.length,
    leasesRequired: true,
    auditRequiredBeforeResolverTrust: true,
    rollbackRequired: true,
    telemetryRequired: true,
    productionPlaybackSwitched: false,
  };
}

export function claimAutomationWorkerBatch(input: {
  runPlan: MediaAutomationWorkerRunPlan;
  plans: MediaAutomationJobPlan[];
  nowMillis: number;
  leaseTtlMillis?: number | null;
}): MediaAutomationWorkerLease | null {
  if (!input.runPlan.allowed) return null;
  const ttl = Math.max(1, Number(input.leaseTtlMillis ?? 15 * 60 * 1000));
  return {
    leaseId: `${input.runPlan.batchId}:${input.nowMillis}`,
    batchId: input.runPlan.batchId,
    sourceIds: input.plans.map((plan) => plan.sourceId),
    maxJobs: input.runPlan.maxJobsPerRun,
    expiresAtMillis: input.nowMillis + ttl,
  };
}

export function claimAutomationBatchLease(input: {
  runPlan: MediaAutomationWorkerRunPlan;
  plans: MediaAutomationJobPlan[];
  nowMillis: number;
  leaseTtlMillis?: number | null;
}): MediaAutomationWorkerLease | null {
  return claimAutomationWorkerBatch(input);
}

export function processAutomationWorkerBatchDryRun(input: {
  lease: MediaAutomationWorkerLease | null;
  plans: MediaAutomationJobPlan[];
}): {
  processed: boolean;
  writesAttempted: false;
  uploadAttempted: false;
  telemetryEvents: string[];
  stopReason: string | null;
} {
  if (!input.lease) {
    return {
      processed: false,
      writesAttempted: false,
      uploadAttempted: false,
      telemetryEvents: [],
      stopReason: "missing_worker_lease",
    };
  }
  if (input.plans.length > input.lease.maxJobs) {
    return {
      processed: false,
      writesAttempted: false,
      uploadAttempted: false,
      telemetryEvents: [],
      stopReason: "lease_max_jobs_exceeded",
    };
  }
  const leaseSources = new Set(input.lease.sourceIds);
  if (input.plans.some((plan) => !leaseSources.has(plan.sourceId))) {
    return {
      processed: false,
      writesAttempted: false,
      uploadAttempted: false,
      telemetryEvents: [],
      stopReason: "source_differs_from_lease",
    };
  }
  return {
    processed: true,
    writesAttempted: false,
    uploadAttempted: false,
    telemetryEvents: [...MEDIA_AUTOMATION_TELEMETRY_EVENTS],
    stopReason: null,
  };
}

export function processAutomationBatchDryRun(input: {
  lease: MediaAutomationWorkerLease | null;
  plans: MediaAutomationJobPlan[];
}): ReturnType<typeof processAutomationWorkerBatchDryRun> {
  return processAutomationWorkerBatchDryRun(input);
}

export function completeAutomationWorkerBatchAudit(input: {
  batchId: string;
  expectedRowCount: number;
  rows: MediaAutomationAuditRow[];
}): MediaAutomationBatchAuditResult {
  const failures: string[] = [];
  if (input.rows.length !== input.expectedRowCount) failures.push("unexpected_row_count");
  for (const row of input.rows) {
    if (row.batchId !== input.batchId) failures.push("unexpected_batch_id");
    if (!safePrefix(row.outputPrefix)) failures.push("unsafe_output_prefix");
    if (row.status !== "pending_audit" && row.status !== "audit_passed") failures.push("row_not_pending_or_passed");
    if (row.isPublicPlaybackSafe !== true) failures.push("row_not_public_playback_safe");
    if (row.isOriginal === true) failures.push("original_row_blocked");
    if (row.visibility !== "public") failures.push("private_or_premium_row_blocked");
    if (!ALLOWED_SCAN.has(row.scanStatus)) failures.push("scan_not_clean");
    if (!ALLOWED_MODERATION.has(row.moderationStatus)) failures.push("moderation_not_allowed");
  }

  return {
    batchId: input.batchId,
    passed: failures.length === 0,
    resolverEligible: failures.length === 0,
    quarantine: failures.length > 0,
    failures: Array.from(new Set(failures)),
  };
}

export function quarantineAutomationWorkerBatch(input: {
  batchId: string;
  reason: string;
}): {
  batchId: string;
  state: "quarantined";
  automationPaused: true;
  resolverTrustRevoked: true;
  reason: string;
} {
  return {
    batchId: input.batchId,
    state: "quarantined",
    automationPaused: true,
    resolverTrustRevoked: true,
    reason: input.reason,
  };
}
