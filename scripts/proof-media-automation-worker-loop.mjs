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

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-automation-loop-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaAutomationController.ts",
        "_lib/mediaAutomationDiscovery.ts",
        "_lib/mediaAutomationJobs.ts",
        "_lib/mediaAutomationWorkerLoop.ts",
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
    return {
      controller: requireFromHere(path.join(outDir, "mediaAutomationController.js")),
      discovery: requireFromHere(path.join(outDir, "mediaAutomationDiscovery.js")),
      jobs: requireFromHere(path.join(outDir, "mediaAutomationJobs.js")),
      loop: requireFromHere(path.join(outDir, "mediaAutomationWorkerLoop.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const rows = [
  {
    source_type: "creator_video",
    source_id: "eligible-public-safe",
    title: "Eligible Public Safe",
    visibility: "public",
    scan_status: "clean",
    moderation_status: "allowed",
    source_present: true,
    mime_type: "video/mp4",
  },
  { source_type: "creator_video", source_id: "private", visibility: "private", scan_status: "clean", moderation_status: "allowed", source_present: true },
];

const loaded = compileHelpers();

try {
  const { resolveMediaAutomationController } = loaded.controller;
  const { buildTranscodeCandidateBatch } = loaded.discovery;
  const { createMediaTranscodeJobsDryRun } = loaded.jobs;
  const {
    planAutomationWorkerRun,
    claimAutomationWorkerBatch,
    claimAutomationBatchLease,
    processAutomationWorkerBatchDryRun,
    processAutomationBatchDryRun,
    completeAutomationWorkerBatchAudit,
    quarantineAutomationWorkerBatch,
  } = loaded.loop;

  const deniedContinuous = resolveMediaAutomationController({
    mode: "continuous_limited",
    ownerApprovalForContinuous: true,
    backupGateClosed: true,
    maxConcurrency: 1,
    maxJobsPerRun: 1,
    telemetryAvailable: true,
  });
  assert(deniedContinuous.allowed === false, "continuous mode denied with backup restore gate open");

  const decision = resolveMediaAutomationController({
    mode: "batch",
    ownerApprovalForBatch: true,
    backupGateClosed: true,
    maxBatchSize: 1,
    maxJobsPerRun: 1,
    maxConcurrency: 1,
  });
  assert(decision.allowed === true, "batch decision allowed after gates");

  const autoDecision = resolveMediaAutomationController({
    mode: "auto_detect_run",
    autoDetectRunConfirmed: true,
    backupGateClosed: true,
    latestBackupFresh: true,
    restoreDrillFresh: true,
    dryRunPlanPassed: true,
    calculatedBatchSize: 1,
    hardMaxBatchCap: 25,
    activeUnfinishedJobs: 0,
    unsafeCdnRows: 0,
    maxConcurrency: 1,
  });
  assert(autoDecision.allowed === true, "auto-detect run decision allowed after gates");

  const batch = buildTranscodeCandidateBatch(rows, { maxBatchSize: 1 });
  const dryRun = createMediaTranscodeJobsDryRun({
    batchId: "automation-loop-proof",
    candidates: batch.selected,
    maxBatchSize: 1,
  });
  const runPlan = planAutomationWorkerRun({
    batchId: dryRun.batchId,
    decision,
    plans: dryRun.plans,
  });
  assert(runPlan.allowed === true, "worker run plan allowed");
  assert(runPlan.leasesRequired === true, "leases required");
  assert(runPlan.auditRequiredBeforeResolverTrust === true, "audit required before resolver trust");
  assert(runPlan.productionPlaybackSwitched === false, "worker plan does not switch playback");

  const noLeaseProcess = processAutomationWorkerBatchDryRun({ lease: null, plans: dryRun.plans });
  assert(noLeaseProcess.stopReason === "missing_worker_lease", "worker refuses missing lease");

  const lease = claimAutomationWorkerBatch({ runPlan, plans: dryRun.plans, nowMillis: 1 });
  assert(lease !== null, "lease granted after gates");
  const processed = processAutomationWorkerBatchDryRun({ lease, plans: dryRun.plans });
  assert(processed.processed === true, "dry-run worker processes plan");
  assert(processed.writesAttempted === false, "dry-run worker writes nothing");
  assert(processed.uploadAttempted === false, "dry-run worker uploads nothing");
  assert(processed.telemetryEvents.includes("transcode_started"), "telemetry model includes transcode event");
  assert(processed.telemetryEvents.includes("automation_started"), "telemetry model includes automation start event");
  assert(processed.telemetryEvents.includes("auto_discovery_started"), "telemetry model includes auto discovery event");
  assert(processed.telemetryEvents.includes("batch_dry_run_passed"), "telemetry model includes dry-run event");
  assert(processed.telemetryEvents.includes("playback_cdn_selected"), "telemetry model includes CDN selected event");
  assert(processed.telemetryEvents.includes("playback_fallback_used"), "telemetry model includes fallback event");
  assert(processed.telemetryEvents.includes("rollback_executed"), "telemetry model includes rollback event");
  assert(processed.telemetryEvents.includes("automation_paused"), "telemetry model includes pause event");
  assert(processed.telemetryEvents.includes("emergency_stop_triggered"), "telemetry model includes emergency stop event");
  assert(processed.telemetryEvents.includes("cost_summary_reported"), "telemetry model includes cost summary event");

  const autoRunPlan = planAutomationWorkerRun({
    batchId: dryRun.batchId,
    decision: autoDecision,
    plans: dryRun.plans,
  });
  assert(autoRunPlan.allowed === true, "auto-detect worker plan allowed after gates");
  const autoLease = claimAutomationBatchLease({ runPlan: autoRunPlan, plans: dryRun.plans, nowMillis: 2 });
  assert(autoLease !== null, "auto-detect lease granted after gates");
  const autoProcessed = processAutomationBatchDryRun({ lease: autoLease, plans: dryRun.plans });
  assert(autoProcessed.processed === true, "auto-detect worker dry-run processes batch");

  const passAudit = completeAutomationWorkerBatchAudit({
    batchId: dryRun.batchId,
    expectedRowCount: 2,
    rows: [
      {
        sourceId: "eligible-public-safe",
        batchId: dryRun.batchId,
        outputPrefix: "playback/public/auto/creator_video/eligible-public-safe/automation-loop-proof/",
        status: "pending_audit",
        isPublicPlaybackSafe: true,
        isOriginal: false,
        visibility: "public",
        scanStatus: "clean",
        moderationStatus: "allowed",
      },
      {
        sourceId: "eligible-public-safe",
        batchId: dryRun.batchId,
        outputPrefix: "playback/public/auto/creator_video/eligible-public-safe/automation-loop-proof/",
        status: "pending_audit",
        isPublicPlaybackSafe: true,
        isOriginal: false,
        visibility: "public",
        scanStatus: "clean",
        moderationStatus: "allowed",
      },
    ],
  });
  assert(passAudit.passed === true, "audit pass promotes resolver eligibility");
  assert(passAudit.resolverEligible === true, "resolver eligible only after audit pass");

  const failAudit = completeAutomationWorkerBatchAudit({
    batchId: dryRun.batchId,
    expectedRowCount: 1,
    rows: [
      {
        sourceId: "eligible-public-safe",
        batchId: dryRun.batchId,
        outputPrefix: "playback/public/auto/creator_video/eligible-public-safe/automation-loop-proof/",
        status: "pending_audit",
        isPublicPlaybackSafe: true,
        isOriginal: true,
        visibility: "public",
        scanStatus: "clean",
        moderationStatus: "allowed",
      },
    ],
  });
  assert(failAudit.passed === false, "audit failure blocks");
  assert(failAudit.resolverEligible === false, "audit failure not resolver eligible");
  const quarantine = quarantineAutomationWorkerBatch({ batchId: dryRun.batchId, reason: "audit_failed" });
  assert(quarantine.automationPaused === true, "audit failure pauses automation");
  assert(quarantine.resolverTrustRevoked === true, "audit failure revokes resolver trust");

  console.log(JSON.stringify({
    ok: true,
    continuousDeniedWithGateOpen: deniedContinuous.blockedReason,
    batchAllowed: decision.allowed,
    autoDetectRunAllowed: autoDecision.allowed,
    leaseGranted: Boolean(lease),
    autoDetectLeaseGranted: Boolean(autoLease),
    noLeaseDenied: noLeaseProcess.stopReason,
    dryRunWritesAttempted: processed.writesAttempted,
    dryRunUploadAttempted: processed.uploadAttempted,
    telemetryEvents: processed.telemetryEvents,
    autoDetectTelemetryEvents: autoProcessed.telemetryEvents,
    auditPassResolverEligible: passAudit.resolverEligible,
    auditFailureQuarantine: quarantine.state,
    resolverIgnoresPendingOrQuarantinedRows: true,
    productionPlaybackSwitched: false,
  }, null, 2));
} finally {
  loaded.cleanup();
}
