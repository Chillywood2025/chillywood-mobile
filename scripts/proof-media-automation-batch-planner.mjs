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
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-automation-batch-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaAutomationDiscovery.ts",
        "_lib/mediaAutomationJobs.ts",
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
      jobs: requireFromHere(path.join(outDir, "mediaAutomationJobs.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const buildRows = (eligibleCount) => {
  const rows = [];
  for (let index = 0; index < eligibleCount; index += 1) {
    rows.push({
      source_type: "creator_video",
      source_id: `eligible-${String(index).padStart(4, "0")}`,
      title: `Eligible ${index}`,
      visibility: "public",
      scan_status: "clean",
      moderation_status: "allowed",
      source_present: true,
      mime_type: "video/mp4",
      current_playback_source: "signed-origin-fallback",
    });
  }
  rows.push(
    { source_type: "creator_video", source_id: "already-audited", visibility: "public", scan_status: "clean", moderation_status: "allowed", source_present: true, has_audited_hls: true },
    { source_type: "creator_video", source_id: "private", visibility: "private", scan_status: "clean", moderation_status: "allowed", source_present: true },
    { source_type: "creator_video", source_id: "premium", visibility: "public", scan_status: "clean", moderation_status: "allowed", source_present: true, paid_or_premium_locked: true },
    { source_type: "creator_video", source_id: "original", visibility: "public", scan_status: "clean", moderation_status: "allowed", source_present: true, is_original_only: true },
    { source_type: "creator_video", source_id: "pending-audit", visibility: "public", scan_status: "pending_scan", moderation_status: "allowed", source_present: true },
    { source_type: "creator_video", source_id: "wrong-prefix", visibility: "public", scan_status: "clean", moderation_status: "blocked", source_present: true },
    { source_type: "creator_video", source_id: "denied-source", visibility: "public", scan_status: "clean", moderation_status: "allowed", source_present: true },
  );
  return rows;
};

const loaded = compileHelpers();

try {
  const { buildTranscodeCandidateBatch } = loaded.discovery;
  const { createMediaTranscodeJobsDryRun, sanitizeJobPlanProof } = loaded.jobs;
  const rows = buildRows(1000);

  const capOne = buildTranscodeCandidateBatch(rows, { maxBatchSize: 1, deniedSourceIds: ["denied-source"] });
  assert(capOne.selected.length === 1, "cap one selects one");

  const capFive = buildTranscodeCandidateBatch(rows, { maxBatchSize: 5, deniedSourceIds: ["denied-source"] });
  assert(capFive.selected.length === 5, "cap five selects five");

  const capHundred = buildTranscodeCandidateBatch(rows, { maxBatchSize: 100, deniedSourceIds: ["denied-source"] });
  assert(capHundred.selected.length === 100, "cap hundred selects hundred");
  assert(capHundred.candidates.length === 1007, "fixture contains blocked rows too");
  assert(!capHundred.selected.some((candidate) => candidate.sourceId === "private"), "private excluded");
  assert(!capHundred.selected.some((candidate) => candidate.sourceId === "premium"), "premium excluded");
  assert(!capHundred.selected.some((candidate) => candidate.sourceId === "original"), "original excluded");
  assert(!capHundred.selected.some((candidate) => candidate.sourceId === "already-audited"), "already audited skipped");
  assert(!capHundred.selected.some((candidate) => candidate.sourceId === "denied-source"), "denied excluded");

  const dryRun = createMediaTranscodeJobsDryRun({
    batchId: "automation-batch-proof",
    candidates: capFive.selected,
    maxBatchSize: 5,
  });
  assert(dryRun.plans.length === 5, "dry run builds five job plans");
  assert(dryRun.mutationAttempted === false, "dry run does not mutate");
  assert(dryRun.productionRowsWritten === false, "dry run writes no production rows");
  assert(dryRun.maxBatchCapEnforced === true, "max batch cap enforced");
  assert(dryRun.plans.every((plan) => plan.valid), "plans must be valid");
  assert(dryRun.plans.every((plan) => plan.outputPrefix.startsWith("playback/public/auto/")), "output prefix safe");
  assert(dryRun.plans.every((plan) => plan.rollbackScope.includes(plan.outputPrefix)), "rollback exact prefix required");

  const summary = sanitizeJobPlanProof({
    ok: true,
    oneThousandEligibleFixtureRows: true,
    capOneSelected: capOne.selected.length,
    capFiveSelected: capFive.selected.length,
    capHundredSelected: capHundred.selected.length,
    blockedCounts: capHundred.blockedCounts,
    dryRunPlans: dryRun.plans.length,
    mutationAttempted: dryRun.mutationAttempted,
    productionRowsWritten: dryRun.productionRowsWritten,
    rollbackPlanRequired: dryRun.plans.every((plan) => plan.rollbackScope.includes("exact_prefix=")),
  });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  loaded.cleanup();
}
