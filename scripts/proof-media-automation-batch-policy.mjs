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
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-automation-batch-policy-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaAutomationDiscovery.ts",
        "_lib/mediaAutomationBatchPolicy.ts",
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
      discovery: requireFromHere(path.join(outDir, "mediaAutomationDiscovery.js")),
      batchPolicy: requireFromHere(path.join(outDir, "mediaAutomationBatchPolicy.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const rows = Array.from({ length: 40 }, (_, index) => ({
  source_type: "creator_video",
  source_id: `eligible-auto-${index}`,
  title: `Eligible Auto ${index}`,
  visibility: "public",
  scan_status: "clean",
  moderation_status: "allowed",
  source_present: true,
  mime_type: "video/mp4",
}));

const loaded = compileHelpers();

try {
  const { classifyMediaAutomationCandidate } = loaded.discovery;
  const {
    calculateAutoBatchSize,
    resolveBatchRiskLevel,
    buildAutoBatchPlan,
    sanitizeBatchPolicyProof,
  } = loaded.batchPolicy;

  const candidates = rows.map((row) => classifyMediaAutomationCandidate(row));

  const firstAuto = calculateAutoBatchSize({
    eligible_count: 40,
    latest_backup_age_minutes: 10,
    restore_drill_age_minutes: 10,
    previous_success_streak: 0,
    previous_failure_count: 0,
    active_unfinished_jobs: 0,
    unsafe_cdn_rows: 0,
  });
  assert(firstAuto.batchSize === 1, "first auto run max must be 1");
  assert(firstAuto.manualBatchSizeRequired === false, "manual batch size not required");
  assert(firstAuto.reasonCodes.includes("first_auto_run_cap_one"), "first run reason recorded");

  const successOne = calculateAutoBatchSize({
    eligible_count: 40,
    latest_backup_age_minutes: 10,
    restore_drill_age_minutes: 10,
    previous_success_streak: 1,
  });
  assert(successOne.batchSize === 5, "one clean run raises cap to five");

  const successThree = calculateAutoBatchSize({
    eligible_count: 40,
    latest_backup_age_minutes: 10,
    restore_drill_age_minutes: 10,
    previous_success_streak: 3,
  });
  assert(successThree.batchSize === 10, "repeated clean runs raise cap to ten");

  const successFive = calculateAutoBatchSize({
    eligible_count: 40,
    latest_backup_age_minutes: 10,
    restore_drill_age_minutes: 10,
    previous_success_streak: 5,
    hard_max_batch_cap: 25,
  });
  assert(successFive.batchSize === 25, "hard max without owner override is 25");

  const failureDrops = calculateAutoBatchSize({
    eligible_count: 40,
    latest_backup_age_minutes: 10,
    restore_drill_age_minutes: 10,
    previous_success_streak: 5,
    previous_failure_count: 1,
  });
  assert(failureDrops.batchSize === 1, "failure drops cap back to one");

  const activeBlocked = calculateAutoBatchSize({ eligible_count: 40, latest_backup_age_minutes: 10, restore_drill_age_minutes: 10, active_unfinished_jobs: 1 });
  assert(activeBlocked.batchSize === 0, "active unfinished jobs block");
  assert(activeBlocked.reasonCodes.includes("active_unfinished_jobs_present"), "active job reason recorded");

  const unsafeBlocked = calculateAutoBatchSize({ eligible_count: 40, latest_backup_age_minutes: 10, restore_drill_age_minutes: 10, unsafe_cdn_rows: 1 });
  assert(unsafeBlocked.batchSize === 0, "unsafe CDN rows block");

  const staleBackup = calculateAutoBatchSize({ eligible_count: 40, latest_backup_age_minutes: 24 * 60 + 1, restore_drill_age_minutes: 10 });
  assert(staleBackup.batchSize === 0, "stale backup blocks");

  const staleRestore = calculateAutoBatchSize({ eligible_count: 40, latest_backup_age_minutes: 10, restore_drill_age_minutes: 24 * 60 + 1 });
  assert(staleRestore.batchSize === 0, "stale restore drill blocks");

  const plan = buildAutoBatchPlan(candidates, {
    latest_backup_age_minutes: 10,
    restore_drill_age_minutes: 10,
    previous_success_streak: 1,
    active_unfinished_jobs: 0,
    unsafe_cdn_rows: 0,
  });
  assert(plan.selected.length === 5, "auto batch plan selects calculated cap");
  assert(plan.manualSourceIdsRequired === false, "manual source ids not required");
  assert(plan.manualBatchSizeRequired === false, "manual batch size not required");
  assert(plan.mutationAttempted === false, "plan does not mutate");
  assert(plan.productionPlaybackSwitched === false, "plan does not switch playback");
  assert(resolveBatchRiskLevel(plan.batchSize) === "medium", "risk level calculated");

  const summary = sanitizeBatchPolicyProof({
    ok: true,
    firstAutoBatchSize: firstAuto.batchSize,
    oneCleanRunBatchSize: successOne.batchSize,
    repeatedCleanRunBatchSize: successThree.batchSize,
    fiveCleanRunBatchSize: successFive.batchSize,
    failureDropsBatchSize: failureDrops.batchSize,
    activeUnfinishedJobsBatchSize: activeBlocked.batchSize,
    unsafeCdnRowsBatchSize: unsafeBlocked.batchSize,
    staleBackupBatchSize: staleBackup.batchSize,
    staleRestoreDrillBatchSize: staleRestore.batchSize,
    maxCapEnforced: successFive.batchSize <= 25,
    manualSourceIdsRequired: plan.manualSourceIdsRequired,
    manualBatchSizeRequired: plan.manualBatchSizeRequired,
    mutationAttempted: plan.mutationAttempted,
    productionPlaybackSwitched: plan.productionPlaybackSwitched,
  });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  loaded.cleanup();
}
