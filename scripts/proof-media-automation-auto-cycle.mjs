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

function runAutomationCli(mode, env = {}) {
  const result = spawnSync(nodeCommand, ["./scripts/media-automation-cli.mjs", `--mode=${mode}`, "--source=fixture"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  const text = result.stdout || result.stderr || "{}";
  let output;
  try {
    output = JSON.parse(text);
  } catch {
    throw new Error(`media automation CLI returned non-JSON output for ${mode}: ${text}`);
  }
  assertNoSecretLikeText(`media automation ${mode} output`, output);
  return { status: result.status, output };
}

const status = runAutomationCli("status");
assert(status.status === 0, "status passes");
assert(status.output.automationDefaultMode === "off", "automation defaults off");
assert(status.output.daemonLive === false, "daemon is not live");
assert(status.output.cronLive === false, "cron is not live");

const discovery = runAutomationCli("discover");
assert(discovery.status === 0, "discover passes");
assert(discovery.output.classificationCounts.eligible_needs_transcode > 0, "fixture discovers eligible work");
assert(discovery.output.classificationCounts.excluded_private > 0, "fixture excludes private media");
assert(discovery.output.classificationCounts.excluded_premium > 0, "fixture excludes Premium media");

const plan = runAutomationCli("plan-auto");
assert(plan.status === 0, "plan-auto passes");
assert(plan.output.calculatedBatchSize >= 1, "fixture calculates a positive safe batch");
assert(plan.output.calculatedBatchSize <= 25, "fixture enforces hard cap");
assert(plan.output.riskLevel === "low", "safe fixture batch remains low risk");

const dryRun = runAutomationCli("dry-run-auto");
assert(dryRun.status === 0, "dry-run-auto passes");
assert(dryRun.output.dryRun === true, "dry-run-auto is dry-run only");
assert(dryRun.output.productionRowsWritten === false, "dry-run-auto writes no rows");
assert(dryRun.output.selectedCandidates.length === dryRun.output.calculatedBatchSize, "dry-run selected count matches cap");

const deniedRun = runAutomationCli("run-auto");
assert(deniedRun.status !== 0, "run-auto denied without confirmation");
assert(deniedRun.output.reason === "auto_detect_batch_confirmation_missing", "run-auto requires confirmation");
assert(deniedRun.output.productionRowsWritten === false, "denied run-auto writes no rows");

const report = runAutomationCli("report");
assert(report.status === 0, "report passes");
assert(report.output.productionRowsWritten === false, "report writes no rows");
assert(report.output.productionPlaybackSwitched === false, "report does not switch playback");
assert(report.output.continuousAutomationEnabled === false, "continuous automation remains disabled");

console.log(JSON.stringify({
  ok: true,
  automationDefaultMode: status.output.automationDefaultMode,
  eligibleNeedsTranscode: discovery.output.classificationCounts.eligible_needs_transcode,
  excludedPrivate: discovery.output.classificationCounts.excluded_private,
  excludedPremium: discovery.output.classificationCounts.excluded_premium,
  calculatedBatchSize: plan.output.calculatedBatchSize,
  dryRunWritesRows: dryRun.output.productionRowsWritten,
  runAutoRequiresConfirmation: deniedRun.output.reason,
  daemonLive: false,
  cronLive: false,
  continuousAutomationEnabled: false,
  noSecretsPrinted: true,
}, null, 2));
