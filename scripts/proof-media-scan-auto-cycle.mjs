#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const nodeCommand = process.execPath;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function assertNoSecretLikeText(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = [
    /postgres(?:ql)?:\/\//i,
    new RegExp(`X-Amz-${"Signature"}=`, "i"),
    /\bservice[_-]?role\s*[:=]/i,
    /\bBearer\s+[A-Za-z0-9._-]+/i,
    /https?:\/\/(?!media\.chillywoodstream\.com\b)[^\s"']+/i,
  ];
  const match = forbidden.find((pattern) => pattern.test(text));
  assert(!match, `${label} contained secret/private URL-like text`);
}

function runScanCli(args, env = {}) {
  const result = spawnSync(nodeCommand, ["./scripts/media-scan-cli.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  const text = result.stdout || result.stderr || "{}";
  let output;
  try {
    output = JSON.parse(text);
  } catch {
    throw new Error(`media scan CLI returned non-JSON output: ${text}`);
  }
  assertNoSecretLikeText("media scan auto-cycle output", output);
  return { status: result.status, output };
}

const status = runScanCli(["--mode=status", "--source=fixture"]);
assert(status.status === 0, "status fixture passes");
assert(status.output.scanCandidateCount >= 1, "fixture exposes public scan candidates");
assert(status.output.skippedPrivateCount >= 1, "fixture skips private media");
assert(status.output.skippedPremiumCount >= 1, "fixture skips Premium media");

const dryRun = runScanCli(["--mode=dry-run", "--source=fixture", "--maxJobs=5"]);
assert(dryRun.status === 0, "dry-run fixture passes");
assert(dryRun.output.plan.plannedJobCount > 0, "dry-run selects public scan candidates");
assert(dryRun.output.plan.productionRowsWritten === false, "dry-run writes no rows");
assert(dryRun.output.plan.mediaProcessed === false, "dry-run processes no media");
assert(dryRun.output.plan.transcodeStarted === false, "dry-run does not transcode");

const deniedWithoutConfirmation = runScanCli(["--mode=run-auto", "--source=fixture"]);
assert(deniedWithoutConfirmation.status !== 0, "run-auto denied without confirmation");
assert(
  deniedWithoutConfirmation.output.reason === "media_scan_run_auto_confirmation_missing",
  "run-auto requires explicit confirmation",
);

const confirmedDenied = runScanCli(["--mode=run-auto", "--source=fixture"], {
  MEDIA_SCAN_AUTO_CONFIRM: "I_UNDERSTAND_PUBLIC_SCAN_BATCH",
});
assert(confirmedDenied.status !== 0, "confirmed run-auto remains fail-closed without trusted writer");
assert(
  confirmedDenied.output.reason === "production_scan_batch_write_not_enabled_in_this_source_proof_build",
  "confirmed run-auto requires trusted scanner write path",
);
assert(confirmedDenied.output.selectedPublicScanCandidates > 0, "confirmed run-auto builds selected candidate count");
assert(confirmedDenied.output.productionRowsWritten === false, "confirmed run-auto writes no rows");
assert(confirmedDenied.output.mediaProcessed === false, "confirmed run-auto processes no media");
assert(confirmedDenied.output.transcodeStarted === false, "confirmed run-auto does not transcode");
assert(confirmedDenied.output.playbackSwitched === false, "confirmed run-auto does not switch playback");
assert(confirmedDenied.output.plan.skippedSummary.scan_skipped_private >= 1, "confirmed run-auto skips private rows");
assert(confirmedDenied.output.plan.skippedSummary.scan_skipped_premium >= 1, "confirmed run-auto skips Premium rows");

console.log(JSON.stringify({
  ok: true,
  runAutoRequiresConfirmation: deniedWithoutConfirmation.output.reason,
  confirmedRunAutoBlocked: confirmedDenied.output.reason,
  selectedPublicScanCandidates: confirmedDenied.output.selectedPublicScanCandidates,
  privateSkipped: confirmedDenied.output.plan.skippedSummary.scan_skipped_private,
  premiumSkipped: confirmedDenied.output.plan.skippedSummary.scan_skipped_premium,
  productionRowsWritten: false,
  mediaProcessed: false,
  transcodeStarted: false,
  playbackSwitched: false,
  noSecretsPrinted: true,
}, null, 2));
