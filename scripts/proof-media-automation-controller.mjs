#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const noSecretLikeText = (label, value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const patterns = [
    /postgres(?:ql)?:\/\//i,
    new RegExp(`X-Amz-${"Signature"}=`, "i"),
    /\bservice[_-]?role\b/i,
    /\bBearer\s+[A-Za-z0-9._-]+/i,
    /\beyJ[A-Za-z0-9_-]{20,}\./,
  ];
  const match = patterns.find((pattern) => pattern.test(text));
  assert(!match, `${label} contained secret-like text`);
};

const compileController = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-automation-controller-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaAutomationController.ts",
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
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      },
    );
    const requireFromHere = createRequire(import.meta.url);
    const helper = requireFromHere(path.join(outDir, "mediaAutomationController.js"));
    return { helper, cleanup: () => rmSync(outDir, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const loaded = compileController();

try {
  const {
    resolveMediaAutomationController,
    sanitizeMediaAutomationControllerProof,
  } = loaded.helper;

  const defaultOff = resolveMediaAutomationController();
  assert(defaultOff.mode === "off", "default mode must be off");
  assert(defaultOff.allowed === false, "default mode must not allow automation");
  assert(defaultOff.canRunWorker === false, "default mode must not run worker");

  const emergencyStop = resolveMediaAutomationController({
    mode: "batch",
    emergencyStop: true,
    backupGateClosed: true,
    ownerApprovalForBatch: true,
    maxBatchSize: 5,
    maxJobsPerRun: 5,
  });
  assert(emergencyStop.state === "emergency_stop", "emergency stop must win");
  assert(emergencyStop.blockedReason === "emergency_stop", "emergency stop must block");

  const emergencyMode = resolveMediaAutomationController({ mode: "emergency_stop" });
  assert(emergencyMode.state === "emergency_stop", "emergency_stop mode must block");

  const dryRun = resolveMediaAutomationController({ mode: "dry_run" });
  assert(dryRun.allowed === true, "dry run should be allowed");
  assert(dryRun.canWriteJobs === false, "dry run must not write jobs");
  assert(dryRun.canRunWorker === false, "dry run must not run worker");

  const autoDetect = resolveMediaAutomationController({ mode: "auto_detect" });
  assert(autoDetect.allowed === true, "auto detect planning should be allowed");
  assert(autoDetect.canDiscover === true, "auto detect discovers candidates");
  assert(autoDetect.canPlanJobs === true, "auto detect plans jobs");
  assert(autoDetect.canWriteJobs === false, "auto detect must not write jobs");
  assert(autoDetect.canRunWorker === false, "auto detect must not run worker");

  const autoDetectRunDenied = resolveMediaAutomationController({
    mode: "auto_detect_run",
    backupGateClosed: true,
    latestBackupFresh: true,
    restoreDrillFresh: true,
    calculatedBatchSize: 1,
    hardMaxBatchCap: 25,
    dryRunPlanPassed: true,
    activeUnfinishedJobs: 0,
    unsafeCdnRows: 0,
  });
  assert(
    autoDetectRunDenied.blockedReason === "auto_detect_run_confirmation_required",
    "auto detect run requires explicit confirmation",
  );

  const autoDetectRunAllowed = resolveMediaAutomationController({
    mode: "auto_detect_run",
    autoDetectRunConfirmed: true,
    backupGateClosed: true,
    latestBackupFresh: true,
    restoreDrillFresh: true,
    calculatedBatchSize: 1,
    hardMaxBatchCap: 25,
    dryRunPlanPassed: true,
    activeUnfinishedJobs: 0,
    unsafeCdnRows: 0,
  });
  assert(autoDetectRunAllowed.allowed === true, "auto detect run passes only with gates and confirmation");
  assert(autoDetectRunAllowed.maxJobsPerRun === 1, "auto detect run uses calculated batch size");

  const autoDetectUnsafeRows = resolveMediaAutomationController({
    mode: "auto_detect_run",
    autoDetectRunConfirmed: true,
    backupGateClosed: true,
    latestBackupFresh: true,
    restoreDrillFresh: true,
    calculatedBatchSize: 1,
    hardMaxBatchCap: 25,
    dryRunPlanPassed: true,
    activeUnfinishedJobs: 0,
    unsafeCdnRows: 1,
  });
  assert(autoDetectUnsafeRows.blockedReason === "unsafe_cdn_rows_present", "unsafe CDN rows block auto run");

  const oneJobDenied = resolveMediaAutomationController({
    mode: "one_job",
    backupGateClosed: true,
    maxJobsPerRun: 1,
  });
  assert(oneJobDenied.blockedReason === "source_allowlist_required", "one job requires allowlist");

  const oneJobAllowed = resolveMediaAutomationController({
    mode: "one_job",
    sourceAllowlistCount: 1,
    backupGateClosed: true,
    maxJobsPerRun: 1,
  });
  assert(oneJobAllowed.allowed === true, "one job should pass with allowlist and backup gate");
  assert(oneJobAllowed.maxJobsPerRun === 1, "one job must stay one job");

  const batchDenied = resolveMediaAutomationController({
    mode: "batch",
    backupGateClosed: true,
    maxBatchSize: 5,
    maxJobsPerRun: 5,
  });
  assert(batchDenied.blockedReason === "owner_batch_approval_required", "batch requires owner approval");

  const batchAllowed = resolveMediaAutomationController({
    mode: "batch",
    ownerApprovalForBatch: true,
    backupGateClosed: true,
    maxBatchSize: 5,
    maxJobsPerRun: 5,
  });
  assert(batchAllowed.allowed === true, "batch passes only after owner approval and backup gate");

  const continuousDenied = resolveMediaAutomationController({
    mode: "continuous_limited",
    ownerApprovalForContinuous: true,
    backupGateClosed: true,
    maxConcurrency: 1,
    maxJobsPerRun: 10,
    telemetryAvailable: true,
  });
  assert(
    continuousDenied.blockedReason === "scheduled_backup_restore_gate_not_closed",
    "continuous limited requires scheduled backup restore gate",
  );

  const continuousPaused = resolveMediaAutomationController({ mode: "continuous_paused" });
  assert(continuousPaused.state === "paused", "continuous paused state must pause");
  assert(continuousPaused.canRunWorker === false, "continuous paused cannot run worker");

  const continuousAllowed = resolveMediaAutomationController({
    mode: "continuous_limited",
    scheduledBackupRestoreGateClosed: true,
    backupGateClosed: true,
    latestBackupFresh: true,
    restoreDrillFresh: true,
    maxConcurrency: 1,
    maxJobsPerRun: 10,
    telemetryAvailable: true,
    activeUnfinishedJobs: 0,
    activeUnfinishedJobThreshold: 0,
    unsafeCdnRows: 0,
    cacheValidationPassed: true,
    outputValidationPassed: true,
  });
  assert(continuousAllowed.allowed === true, "continuous limited model only passes with every gate");

  const continuousAuditFailure = resolveMediaAutomationController({
    mode: "continuous_limited",
    scheduledBackupRestoreGateClosed: true,
    backupGateClosed: true,
    latestBackupFresh: true,
    restoreDrillFresh: true,
    maxConcurrency: 1,
    maxJobsPerRun: 10,
    telemetryAvailable: true,
    auditFailed: true,
  });
  assert(continuousAuditFailure.blockedReason === "audit_failed_pause", "audit failure pauses continuous limited");

  const continuousPrivateCandidate = resolveMediaAutomationController({
    mode: "continuous_limited",
    scheduledBackupRestoreGateClosed: true,
    backupGateClosed: true,
    latestBackupFresh: true,
    restoreDrillFresh: true,
    maxConcurrency: 1,
    maxJobsPerRun: 10,
    telemetryAvailable: true,
    privateCandidateDetected: true,
  });
  assert(continuousPrivateCandidate.blockedReason === "private_candidate_detected", "private candidates pause continuous limited");

  const continuousFullBlocked = resolveMediaAutomationController({
    mode: "continuous_full_blocked",
    ownerApprovalForContinuous: true,
    scheduledBackupRestoreGateClosed: true,
  });
  assert(continuousFullBlocked.allowed === false, "continuous full remains blocked");

  const continuousBlocked = resolveMediaAutomationController({ mode: "continuous_blocked" });
  assert(continuousBlocked.allowed === false, "continuous blocked mode cannot run");

  const summary = sanitizeMediaAutomationControllerProof({
    ok: true,
    defaultOff: defaultOff.blockedReason,
    emergencyStop: emergencyStop.blockedReason,
    emergencyMode: emergencyMode.blockedReason,
    dryRunWritesJobs: dryRun.canWriteJobs,
    autoDetectPlansWithoutWrites: autoDetect.canPlanJobs && !autoDetect.canWriteJobs,
    autoDetectRunRequiresConfirmation: autoDetectRunDenied.blockedReason,
    autoDetectRunAllowed: autoDetectRunAllowed.allowed,
    unsafeCdnRowsBlockAutoRun: autoDetectUnsafeRows.blockedReason,
    oneJobAllowed: oneJobAllowed.allowed,
    batchAllowed: batchAllowed.allowed,
    continuousLimitedRequiresGate: continuousDenied.blockedReason,
    continuousPaused: continuousPaused.blockedReason,
    continuousAuditFailure: continuousAuditFailure.blockedReason,
    continuousPrivateCandidate: continuousPrivateCandidate.blockedReason,
    continuousFullBlocked: continuousFullBlocked.blockedReason,
    continuousBlocked: continuousBlocked.blockedReason,
    productionPlaybackSwitched: false,
    daemonDeployed: false,
  });
  noSecretLikeText("controller proof", summary);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  loaded.cleanup();
}
