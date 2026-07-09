#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";

const nodeCommand = process.execPath;
const cliScript = "./scripts/media-automation-cli.mjs";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const runCli = (args, env = {}) => {
  const result = spawnSync(nodeCommand, [cliScript, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });
  const outputText = result.stdout || result.stderr || "{}";
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error(`CLI returned non-JSON output: ${outputText}`);
  }
  return {
    status: result.status,
    output: parsed,
    text: outputText,
  };
};

const assertNoSecretLikeText = (label, value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const patterns = [
    /postgres(?:ql)?:\/\//i,
    /X-Amz-Signature=/i,
    /\bservice[_-]?role\b/i,
    /\bBearer\s+[A-Za-z0-9._-]+/i,
    /\beyJ[A-Za-z0-9_-]{20,}\./,
  ];
  const match = patterns.find((pattern) => pattern.test(text));
  assert(!match, `${label} contained secret-like text`);
};

const status = runCli(["--mode=status"]);
assert(status.status === 0, "status should pass");
assert(status.output.automationDefaultMode === "off", "automation defaults off");
assert(status.output.manualSourceIdsRequired === false, "status says manual source ids not required");
assert(status.output.manualBatchSizeRequired === false, "status says manual batch size not required");

const discover = runCli(["--mode=discover"]);
assert(discover.status === 0, "discover should pass");
assert(discover.output.readOnly === true, "discover is read-only");
assert(discover.output.manualSourceIdsRequired === false, "discover does not require manual source ids");
assert(discover.output.candidates.some((candidate) => candidate.classification === "eligible_needs_transcode"), "discover includes public-safe candidates");
assert(discover.output.candidates.some((candidate) => candidate.classification === "excluded_private"), "discover excludes private candidates");

const planAuto = runCli(["--mode=plan-auto"]);
assert(planAuto.status === 0, "plan-auto should pass");
assert(planAuto.output.manualSourceIdsRequired === false, "plan-auto does not require manual source ids");
assert(planAuto.output.manualBatchSizeRequired === false, "plan-auto does not require manual batch size");
assert(planAuto.output.calculatedBatchSize === 1, "first auto plan chooses safe batch size one");
assert(planAuto.output.selectedCount === 1, "plan-auto selects one candidate");
assert(planAuto.output.productionRowsWritten === false, "plan-auto writes no production rows");

const dryRunAuto = runCli(["--mode=dry-run-auto"]);
assert(dryRunAuto.status === 0, "dry-run-auto should pass");
assert(dryRunAuto.output.dryRun === true, "dry-run-auto marks dry run");
assert(dryRunAuto.output.workerRun === false, "dry-run-auto does not run worker");
assert(dryRunAuto.output.backfillRun === false, "dry-run-auto does not backfill");

const runAutoMissingConfirm = runCli(["--mode=run-auto"]);
assert(runAutoMissingConfirm.status !== 0, "run-auto denied without confirmation");
assert(runAutoMissingConfirm.output.reason === "auto_detect_batch_confirmation_missing", "run-auto requires confirmation");

const runAutoWithConfirm = runCli(["--mode=run-auto"], {
  MEDIA_AUTOMATION_RUN_CONFIRM: "I_UNDERSTAND_AUTO_DETECT_BATCH",
});
assert(runAutoWithConfirm.status !== 0, "source-proof run-auto still fails closed");
assert(runAutoWithConfirm.output.reason === "batch_execution_not_enabled_in_source_proof_build", "run-auto execution not enabled");
assert(runAutoWithConfirm.output.futureConfirmationPassed === true, "confirmation was recognized");

const auditDenied = runCli(["--mode=audit"]);
assert(auditDenied.status !== 0, "audit requires batch/source scope");
assert(auditDenied.output.reason === "source_id_required", "audit requires source id");

const audit = runCli(["--mode=audit", "--source-id=auto-public-safe-001", "--batch-id=automation-cli-auto-detect"]);
assert(audit.status === 0, "scoped audit plan should pass");
assert(audit.output.auditPlanOnly === true, "audit is plan-only");

const rollback = runCli([
  "--mode=rollback-plan",
  "--source-id=auto-public-safe-001",
  "--batch-id=automation-cli-auto-detect",
  "--output-prefix=playback/public/auto/creator_video/auto-public-safe-001/automation-cli-auto-detect/",
]);
assert(rollback.status === 0, "scoped rollback plan should pass");
assert(rollback.output.broadDeleteAllowed === false, "rollback denies broad delete");

const rollbackBroad = runCli([
  "--mode=rollback-plan",
  "--source-id=auto-public-safe-001",
  "--batch-id=automation-cli-auto-detect",
  "--output-prefix=playback/public/auto/",
]);
assert(rollbackBroad.status !== 0, "broad rollback prefix denied");

const emergencyStop = runCli(["--mode=emergency-stop"]);
assert(emergencyStop.status === 0, "emergency-stop command should pass");
assert(emergencyStop.output.emergencyStopActive === true, "emergency stop active");

for (const proof of [status, discover, planAuto, dryRunAuto, runAutoMissingConfirm, runAutoWithConfirm, audit, rollback, emergencyStop]) {
  assertNoSecretLikeText("media automation CLI proof", proof.output);
}

const summary = {
  ok: true,
  defaultAutomationOff: status.output.automationDefaultMode === "off",
  discoverReadOnly: discover.output.readOnly,
  manualSourceIdsRequired: planAuto.output.manualSourceIdsRequired,
  manualBatchSizeRequired: planAuto.output.manualBatchSizeRequired,
  calculatedBatchSize: planAuto.output.calculatedBatchSize,
  dryRunWritesNothing: dryRunAuto.output.productionRowsWritten === false,
  runAutoRequiresConfirmation: runAutoMissingConfirm.output.reason,
  runAutoFailClosedAfterConfirmation: runAutoWithConfirm.output.reason,
  auditRequiresScope: auditDenied.output.reason,
  rollbackScoped: rollback.output.broadDeleteAllowed === false,
  broadPrefixDenied: rollbackBroad.output.reason,
  emergencyStopActive: emergencyStop.output.emergencyStopActive,
  productionPlaybackSwitched: false,
  daemonDeployed: false,
  cronSchedulerAdded: false,
};

assertNoSecretLikeText("media automation CLI summary", summary);
execFileSync(nodeCommand, ["-e", "process.exit(0)"]);
console.log(JSON.stringify(summary, null, 2));
