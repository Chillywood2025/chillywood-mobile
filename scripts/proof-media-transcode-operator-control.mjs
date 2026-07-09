#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const proofSourceId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const nowMillis = Date.UTC(2026, 6, 9, 12, 0, 0);

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-transcode-operator-proof-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaTranscodeOperator.ts",
        "_lib/mediaTranscodeWorkerSafety.ts",
        "_lib/mediaRecoveryOperator.ts",
        "--target",
        "ES2020",
        "--module",
        "commonjs",
        "--moduleResolution",
        "node",
        "--outDir",
        outDir,
        "--strict",
        "--skipLibCheck",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const requireFromHere = createRequire(import.meta.url);
    const loadCompiled = (fileName) => {
      for (const candidate of [
        path.join(outDir, fileName),
        path.join(outDir, "_lib", fileName),
      ]) {
        try {
          return requireFromHere(candidate);
        } catch {
          // Try the next compiler output layout.
        }
      }
      throw new Error(`Compiled helper ${fileName} was not found.`);
    };

    return {
      operator: loadCompiled("mediaTranscodeOperator.js"),
      workerSafety: loadCompiled("mediaTranscodeWorkerSafety.js"),
      recoveryOperator: loadCompiled("mediaRecoveryOperator.js"),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const assertNoSecretLikeText = (label, value) => {
  const text = JSON.stringify(value);
  const secretPatterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b/,
    /\b(Bearer|password|access_key|api_key)\b/i,
  ];
  for (const pattern of secretPatterns) {
    requireProof(!pattern.test(text), `${label} output contains secret-like text matching ${pattern}`);
  }
};

const { operator, workerSafety, cleanup } = compileHelpers();

try {
  const defaultDecision = operator.resolveMediaTranscodeOperatorDecision();
  requireProof(defaultDecision.mode === "disabled", "default config should use disabled mode");
  requireProof(defaultDecision.allowed === false && defaultDecision.canRunWorker === false, "default config should block worker");

  const emergencyDecision = operator.resolveMediaTranscodeOperatorDecision({
    mode: "one_job",
    emergencyStop: true,
    sourceId: proofSourceId,
    allowedSourceIds: [proofSourceId],
    maxJobsPerRun: 1,
    backupGateStatus: "closed",
    sourceAllowedForProcessing: true,
  });
  requireProof(emergencyDecision.blockedReason === "emergency_stop", "emergency stop should deny even if enabled");
  requireProof(emergencyDecision.state === "emergency_stop", "emergency stop state should always win");

  const dryRunDecision = operator.resolveMediaTranscodeOperatorDecision({ mode: "dry_run" });
  requireProof(dryRunDecision.allowed === true, "dry_run should allow planning");
  requireProof(dryRunDecision.canWriteRows === false && dryRunDecision.canRunWorker === false, "dry_run cannot write rows or run worker");

  const missingAllowlist = operator.resolveMediaTranscodeOperatorDecision({
    mode: "one_job",
    sourceId: proofSourceId,
    allowedSourceIds: [],
    maxJobsPerRun: 1,
    backupGateStatus: "closed",
    sourceAllowedForProcessing: true,
  });
  requireProof(missingAllowlist.blockedReason === "source_not_allowlisted", "one_job without allowlist should be denied");

  const oneJobAllowed = workerSafety.requestTranscodeWorkerLease({
    mode: "one_job",
    requestedSourceId: proofSourceId,
    allowedSourceIds: [proofSourceId],
    maxJobsPerRun: 1,
    backupGateStatus: "blocked",
    ownerOneJobOverride: true,
    sourceAllowedForProcessing: true,
    backfillEnabled: false,
    nowMillis,
    operatorRunId: "operator-proof-one-job",
  });
  requireProof(oneJobAllowed.allowed === true, "one_job with owner override and allowlisted source should be allowed");
  requireProof(oneJobAllowed.lease?.sourceId === proofSourceId, "one_job should grant a source-bound lease");
  requireProof(oneJobAllowed.lease?.maxJobs === 1, "one_job lease must allow exactly one job");
  requireProof(oneJobAllowed.workerWriteStatus === "pending_audit", "worker can write pending_audit rows only");
  requireProof(oneJobAllowed.resolverTrustAllowed === false, "resolver trust is blocked before audit");

  const wrongSource = workerSafety.requestTranscodeWorkerLease({
    mode: "one_job",
    requestedSourceId: "wrong-source",
    allowedSourceIds: [proofSourceId],
    maxJobsPerRun: 1,
    backupGateStatus: "blocked",
    ownerOneJobOverride: true,
    sourceAllowedForProcessing: true,
    nowMillis,
  });
  requireProof(wrongSource.blockedReason === "source_not_allowlisted", "wrong source should be denied");

  const tooManyJobs = operator.resolveMediaTranscodeOperatorDecision({
    mode: "one_job",
    sourceId: proofSourceId,
    allowedSourceIds: [proofSourceId],
    maxJobsPerRun: 2,
    backupGateStatus: "closed",
    sourceAllowedForProcessing: true,
  });
  requireProof(tooManyJobs.blockedReason === "max_jobs_per_run_must_be_one", "max_jobs_per_run > 1 should be denied in proof mode");

  const backfillAttempt = operator.resolveMediaTranscodeOperatorDecision({
    mode: "one_job",
    sourceId: proofSourceId,
    allowedSourceIds: [proofSourceId],
    maxJobsPerRun: 1,
    backupGateStatus: "closed",
    sourceAllowedForProcessing: true,
    backfillEnabled: true,
  });
  requireProof(backfillAttempt.blockedReason === "backfill_disabled_required", "backfill attempt should be denied");

  const blockedBackupNoOverride = operator.resolveMediaTranscodeOperatorDecision({
    mode: "one_job",
    sourceId: proofSourceId,
    allowedSourceIds: [proofSourceId],
    maxJobsPerRun: 1,
    backupGateStatus: "blocked",
    sourceAllowedForProcessing: true,
  });
  requireProof(
    blockedBackupNoOverride.blockedReason === "backup_gate_blocked_without_owner_one_job_override",
    "blocked backup gate without one-job owner override should deny",
  );

  const continuousBlocked = operator.resolveMediaTranscodeOperatorDecision({
    mode: "continuous",
    sourceId: proofSourceId,
    backupGateStatus: "blocked",
  });
  requireProof(continuousBlocked.blockedReason === "backup_gate_not_closed_for_continuous", "continuous mode should be denied while backup gate is blocked");

  const workerSelfEnable = operator.resolveMediaTranscodeOperatorDecision({
    mode: "one_job",
    requester: "worker",
    sourceId: proofSourceId,
    allowedSourceIds: [proofSourceId],
    maxJobsPerRun: 1,
    backupGateStatus: "closed",
    sourceAllowedForProcessing: true,
  });
  requireProof(workerSelfEnable.blockedReason === "worker_cannot_self_enable", "worker cannot self-enable broadly");

  const auditPassAutoDisable = workerSafety.completeTranscodeWorkerLease({
    lease: oneJobAllowed.lease,
    auditPassed: true,
    success: true,
  });
  requireProof(auditPassAutoDisable.disabled === true, "one_job audit pass should auto-disable");
  requireProof(auditPassAutoDisable.state === "passed", "one_job audit pass should mark passed");

  const auditFailAutoDisable = workerSafety.completeTranscodeWorkerLease({
    lease: oneJobAllowed.lease,
    auditFailed: true,
    failed: true,
  });
  requireProof(auditFailAutoDisable.disabled === true, "one_job audit failure should auto-disable");
  requireProof(auditFailAutoDisable.state === "quarantined", "one_job audit failure should quarantine");

  const pendingResolverTrust = workerSafety.canResolverTrustWorkerWrittenRows({
    auditPassed: false,
    rowStatus: "pending_audit",
  });
  const quarantinedResolverTrust = workerSafety.canResolverTrustWorkerWrittenRows({
    auditPassed: false,
    rowStatus: "quarantined",
  });
  requireProof(pendingResolverTrust === false, "resolver should ignore pending_audit rows");
  requireProof(quarantinedResolverTrust === false, "resolver should ignore quarantined rows");

  const summary = {
    proof: process.argv.includes("--alias=media-transcode-worker-safety")
      ? "media-transcode-worker-safety"
      : "media-transcode-operator-control",
    defaultDisabled: defaultDecision.mode === "disabled" && defaultDecision.allowed === false,
    emergencyStopDenied: emergencyDecision.blockedReason === "emergency_stop",
    dryRunNoWrites: dryRunDecision.canWriteRows === false,
    oneJobLeaseGranted: !!oneJobAllowed.lease && oneJobAllowed.lease.maxJobs === 1,
    wrongSourceDenied: wrongSource.blockedReason === "source_not_allowlisted",
    maxJobsGreaterThanOneDenied: tooManyJobs.blockedReason === "max_jobs_per_run_must_be_one",
    backfillAttemptDenied: backfillAttempt.blockedReason === "backfill_disabled_required",
    backupGateBlockedWithoutOverrideDenied: blockedBackupNoOverride.blockedReason === "backup_gate_blocked_without_owner_one_job_override",
    backupGateBlockedWithOneJobOverrideAllowed: oneJobAllowed.allowed === true,
    continuousModeBlockedByBackupGate: continuousBlocked.blockedReason === "backup_gate_not_closed_for_continuous",
    workerSelfEnableDenied: workerSelfEnable.blockedReason === "worker_cannot_self_enable",
    workerWritesPendingAuditOnly: oneJobAllowed.workerWriteStatus === "pending_audit",
    auditPassAutoDisables: auditPassAutoDisable.disabled === true,
    auditFailureQuarantinesAndAutoDisables: auditFailAutoDisable.state === "quarantined" && auditFailAutoDisable.disabled === true,
    resolverIgnoresPendingOrQuarantinedRows: pendingResolverTrust === false && quarantinedResolverTrust === false,
    productionWorkerDeployed: false,
    productionQueueProcessorRun: false,
    productionDbWritesEnabled: false,
    productionPlaybackSwitched: false,
    selfAuditReplacesPitrForContinuousProduction: false,
    noSecretsPrinted: true,
  };

  assertNoSecretLikeText("operator proof summary", summary);

  if (failures.length > 0) {
    console.error(JSON.stringify({ ...summary, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  cleanup();
}
