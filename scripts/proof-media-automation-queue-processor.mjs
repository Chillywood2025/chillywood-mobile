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

const assertNoSecretLikeText = (label, value) => {
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

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-automation-queue-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaAutomationController.ts",
        "_lib/mediaAutomationDiscovery.ts",
        "_lib/mediaAutomationQueueProcessor.ts",
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
      { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
    );
    const requireFromHere = createRequire(import.meta.url);
    return {
      controller: requireFromHere(path.join(outDir, "mediaAutomationController.js")),
      discovery: requireFromHere(path.join(outDir, "mediaAutomationDiscovery.js")),
      queue: requireFromHere(path.join(outDir, "mediaAutomationQueueProcessor.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const loaded = compileHelpers();

try {
  const { resolveMediaAutomationController } = loaded.controller;
  const { discoverEligibleMediaCandidates } = loaded.discovery;
  const {
    discoverQueuedMediaAutomationWork,
    resolveQueueProcessorStopReason,
    claimAutomationQueueItem,
    processAutomationQueueItemDryRun,
    completeAutomationQueueItem,
    failAutomationQueueItem,
    quarantineAutomationQueueItem,
    sanitizeQueueProcessorProof,
  } = loaded.queue;

  const candidates = discoverEligibleMediaCandidates([
    {
      source_type: "creator_video",
      source_id: "public-safe-queue-001",
      title: "Public Safe Queue 001",
      visibility: "public",
      scan_status: "clean",
      moderation_status: "allowed",
      source_present: true,
      mime_type: "video/mp4",
    },
    {
      source_type: "creator_video",
      source_id: "private-queue-001",
      title: "Private Queue 001",
      visibility: "private",
      scan_status: "clean",
      moderation_status: "allowed",
      source_present: true,
      mime_type: "video/mp4",
    },
  ]);

  const decisionOff = resolveMediaAutomationController();
  const queued = discoverQueuedMediaAutomationWork({
    candidates,
    batchId: "queue-proof",
    maxJobsPerRun: 1,
  });
  assert(queued.length === 1, "only public-safe eligible candidate should be queued");

  const offStop = resolveQueueProcessorStopReason({
    decision: decisionOff,
    queueItems: queued,
    backupGateClosed: true,
    killSwitchAvailable: true,
  });
  assert(offStop === "automation_off", "default off blocks queue processor");

  const decision = resolveMediaAutomationController({
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
  assert(decision.allowed === true, "controller allows bounded auto run after gates");

  const missingBackupStop = resolveQueueProcessorStopReason({
    decision,
    queueItems: queued,
    backupGateClosed: false,
    killSwitchAvailable: true,
  });
  assert(missingBackupStop === "backup_gate_not_closed", "backup gate required");

  const missingKillSwitchStop = resolveQueueProcessorStopReason({
    decision,
    queueItems: queued,
    backupGateClosed: true,
    killSwitchAvailable: false,
  });
  assert(missingKillSwitchStop === "kill_switch_missing", "kill switch required");

  const unsafeStop = resolveQueueProcessorStopReason({
    decision,
    queueItems: [{ ...queued[0], privateOrPremiumOrOriginal: true }],
    backupGateClosed: true,
    killSwitchAvailable: true,
  });
  assert(unsafeStop === "unsafe_queue_item_blocked", "unsafe queue items blocked");

  const claim = claimAutomationQueueItem({
    decision,
    queueItems: queued,
    backupGateClosed: true,
    killSwitchAvailable: true,
    nowMillis: 1000,
  });
  assert(claim.lease !== null, "queue lease granted after gates");
  assert(claim.claimedItems[0].status === "claimed", "queue item claimed");

  const noLease = processAutomationQueueItemDryRun({ lease: null, queueItems: queued });
  assert(noLease.stopReason === "missing_queue_lease", "queue processor refuses missing lease");

  const dryRun = processAutomationQueueItemDryRun({ lease: claim.lease, queueItems: claim.claimedItems });
  assert(dryRun.processed === true, "queue dry-run processes claimed item");
  assert(dryRun.writesAttempted === false, "queue dry-run writes nothing");
  assert(dryRun.uploadAttempted === false, "queue dry-run uploads nothing");
  assert(dryRun.resolverTrustChanged === false, "queue dry-run does not trust resolver rows");

  const completed = completeAutomationQueueItem({ queueItem: claim.claimedItems[0], auditPassed: true });
  assert(completed.status === "completed", "audit pass completes item");
  assert(completed.auditStatus === "audit_passed", "audit pass status recorded");

  const failed = failAutomationQueueItem({ queueItem: claim.claimedItems[0], retryCapReached: true });
  assert(failed.status === "dead_letter", "retry cap sends item to dead letter");

  const quarantine = quarantineAutomationQueueItem({ queueItem: claim.claimedItems[0], reason: "audit_failed" });
  assert(quarantine.automationPaused === true, "quarantine pauses automation");
  assert(quarantine.resolverTrustRevoked === true, "quarantine revokes resolver trust");

  const summary = sanitizeQueueProcessorProof({
    ok: true,
    defaultStopReason: offStop,
    queuedCount: queued.length,
    missingBackupStop,
    missingKillSwitchStop,
    unsafeStop,
    leaseGranted: claim.lease !== null,
    noLeaseStop: noLease.stopReason,
    dryRunWritesAttempted: dryRun.writesAttempted,
    dryRunUploadAttempted: dryRun.uploadAttempted,
    resolverTrustChanged: dryRun.resolverTrustChanged,
    completedStatus: completed.status,
    deadLetterStatus: failed.status,
    quarantineState: quarantine.queueItem.status,
    automationPaused: quarantine.automationPaused,
    productionPlaybackSwitched: false,
  });
  assertNoSecretLikeText("queue processor proof", summary);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  loaded.cleanup();
}
