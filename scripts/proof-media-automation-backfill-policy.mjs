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
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-automation-backfill-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/chillywoodAutonomyPolicy.ts",
        "_lib/mediaAutomationBackfillPolicy.ts",
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
      backfill: requireFromHere(path.join(outDir, "mediaAutomationBackfillPolicy.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const loaded = compileHelpers();

try {
  const {
    resolveMediaAutomationBackfillPolicy,
    buildMediaAutomationBackfillPlan,
    sanitizeBackfillPolicyProof,
  } = loaded.backfill;

  const disabled = resolveMediaAutomationBackfillPolicy();
  assert(disabled.allowed === false, "backfill defaults disabled");
  assert(disabled.failures.includes("backfill_disabled_by_default"), "disabled reason recorded");

  const smallAllowed = resolveMediaAutomationBackfillPolicy({
    mode: "small_capped",
    requestedBatchSize: 5,
    backupGateClosed: true,
    restoreDrillFresh: true,
    rollbackAvailable: true,
    telemetryAvailable: true,
    auditRequired: true,
  });
  assert(smallAllowed.allowed === true, "small capped public-safe backfill can be autonomous after gates");
  assert(smallAllowed.approval.ownerApprovalRequired === false, "small capped safe backfill stays autonomous");
  assert(smallAllowed.batchSize === 5, "small capped batch size preserved");

  const capDenied = resolveMediaAutomationBackfillPolicy({
    mode: "small_capped",
    requestedBatchSize: 26,
    backupGateClosed: true,
    restoreDrillFresh: true,
    rollbackAvailable: true,
    telemetryAvailable: true,
    auditRequired: true,
  });
  assert(capDenied.allowed === false, "cap above hard limit denied");
  assert(capDenied.failures.includes("small_backfill_batch_cap_invalid"), "cap failure recorded");

  const privateDenied = resolveMediaAutomationBackfillPolicy({
    mode: "small_capped",
    requestedBatchSize: 1,
    backupGateClosed: true,
    restoreDrillFresh: true,
    rollbackAvailable: true,
    telemetryAvailable: true,
    auditRequired: true,
    includesPrivateMedia: true,
  });
  assert(privateDenied.allowed === false, "private media denied");
  assert(privateDenied.failures.includes("private_media_blocked"), "private failure recorded");

  const broadDenied = resolveMediaAutomationBackfillPolicy({
    mode: "broad_uncapped",
    requestedBatchSize: 1000,
    backupGateClosed: true,
    restoreDrillFresh: true,
    rollbackAvailable: true,
    telemetryAvailable: true,
    auditRequired: true,
  });
  assert(broadDenied.allowed === false, "broad uncapped backfill denied");
  assert(broadDenied.approval.ownerApprovalRequired === true, "broad uncapped backfill requires owner approval");

  const destructiveDenied = resolveMediaAutomationBackfillPolicy({
    mode: "small_capped",
    requestedBatchSize: 1,
    backupGateClosed: true,
    restoreDrillFresh: true,
    rollbackAvailable: true,
    telemetryAvailable: true,
    auditRequired: true,
    destructiveCleanupRequested: true,
  });
  assert(destructiveDenied.allowed === false, "destructive cleanup denied");
  assert(destructiveDenied.approval.ownerApprovalRequired === true, "destructive cleanup requires owner approval");

  const plan = buildMediaAutomationBackfillPlan({
    mode: "small_capped",
    requestedBatchSize: 3,
    backupGateClosed: true,
    restoreDrillFresh: true,
    rollbackAvailable: true,
    telemetryAvailable: true,
    auditRequired: true,
  });
  assert(plan.selectedSourceCount === 3, "plan selects capped count");
  assert(plan.broadBackfillAllowed === false, "broad backfill never allowed by plan");
  assert(plan.productionPlaybackSwitched === false, "backfill plan does not switch playback");

  const summary = sanitizeBackfillPolicyProof({
    ok: true,
    defaultBackfillAllowed: disabled.allowed,
    smallCappedAllowed: smallAllowed.allowed,
    smallCappedOwnerApprovalRequired: smallAllowed.approval.ownerApprovalRequired,
    capDenied: capDenied.failures,
    privateDenied: privateDenied.failures,
    broadOwnerApprovalRequired: broadDenied.approval.ownerApprovalRequired,
    destructiveOwnerApprovalRequired: destructiveDenied.approval.ownerApprovalRequired,
    selectedSourceCount: plan.selectedSourceCount,
    productionPlaybackSwitched: plan.productionPlaybackSwitched,
  });
  assertNoSecretLikeText("backfill proof", summary);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  loaded.cleanup();
}
