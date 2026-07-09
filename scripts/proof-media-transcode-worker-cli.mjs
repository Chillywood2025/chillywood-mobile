#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const nodeCommand = process.execPath;
const cliPath = path.join(repoRoot, "scripts", "media-transcode-worker-cli.mjs");
const allowedSourceId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const nonAllowlistedSourceId = "00000000-0000-4000-8000-000000000000";
const safeBatchId = "worker-cli-proof-batch";
const safeOutputPrefix = `playback/public/worker-proof/chillywood-city-lights/${safeBatchId}/`;

const failures = [];

function requireProof(condition, message) {
  if (!condition) failures.push(message);
}

function assertNoSecretLikeText(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const patterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b/i,
    /\b(Bearer|password|access_key|api_key|authorization)\s*[:=]/i,
    /\bservice[_-]?role[_-]?key\b/i,
    /postgres(?:ql)?:\/\//i,
  ];
  for (const pattern of patterns) {
    requireProof(!pattern.test(text), `${label} contains secret-like value matching ${pattern}`);
  }
}

function runCli(args, env = {}) {
  const commandEnv = { ...process.env };
  for (const key of [
    "MEDIA_WORKER_SOURCE_ID",
    "MEDIA_WORKER_BATCH_ID",
    "MEDIA_WORKER_OUTPUT_PREFIX",
    "MEDIA_WORKER_MAX_JOBS",
    "MEDIA_WORKER_BACKFILL",
    "MEDIA_WORKER_BACKUP_GATE_STATE",
    "MEDIA_WORKER_RUN_ONE_CONFIRM",
    "MEDIA_WORKER_VERIFY_OUTPUT_PLAN_ONLY",
    "MEDIA_WORKER_AUDIT_READ_DB",
  ]) {
    delete commandEnv[key];
  }
  const result = spawnSync(nodeCommand, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...commandEnv,
      ...env,
    },
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  assertNoSecretLikeText(`cli ${args.join(" ")} output`, output);
  let payload = {};
  try {
    const jsonText = (result.stdout || "").trim().startsWith("{")
      ? result.stdout
      : result.stderr;
    payload = JSON.parse(jsonText || "{}");
  } catch {
    failures.push(`CLI output was not JSON for ${args.join(" ")}`);
  }
  return { status: result.status, payload, output };
}

const defaultRunOne = runCli(["--mode=run-one"]);
requireProof(defaultRunOne.status !== 0, "default run-one should be denied");
requireProof(defaultRunOne.payload.reason === "source_id_required", "default run-one should require explicit source id");

const missingDryRunSource = runCli(["--mode=dry-run"]);
requireProof(missingDryRunSource.status !== 0, "dry-run without source should be denied");
requireProof(missingDryRunSource.payload.reason === "source_id_required", "dry-run without source should report missing source");

const nonAllowlisted = runCli(["--mode=dry-run", `--source-id=${nonAllowlistedSourceId}`]);
requireProof(nonAllowlisted.status !== 0, "non-allowlisted source should be denied");
requireProof(nonAllowlisted.payload.reason === "source_not_allowlisted", "non-allowlisted source should report source_not_allowlisted");

const maxJobsDenied = runCli(["--mode=dry-run", `--source-id=${allowedSourceId}`, "--max-jobs=2"]);
requireProof(maxJobsDenied.status !== 0, "max jobs greater than one should be denied");
requireProof(maxJobsDenied.payload.reason === "max_jobs_must_be_one", "max jobs denial should be explicit");

const backfillDenied = runCli(["--mode=dry-run", `--source-id=${allowedSourceId}`, "--backfill=true"]);
requireProof(backfillDenied.status !== 0, "backfill should be denied");
requireProof(backfillDenied.payload.reason === "backfill_disabled_required", "backfill denial should be explicit");

const staleBackupDenied = runCli(["--mode=dry-run", `--source-id=${allowedSourceId}`], {
  MEDIA_WORKER_BACKUP_GATE_STATE: "stale",
});
requireProof(staleBackupDenied.status !== 0, "stale backup gate should be denied");
requireProof(staleBackupDenied.payload.reason === "backup_gate_not_closed", "stale backup gate denial should be explicit");

const dryRun = runCli([
  "--mode=dry-run",
  `--source-id=${allowedSourceId}`,
  `--batch-id=${safeBatchId}`,
]);
requireProof(dryRun.status === 0, "allowlisted dry-run should pass");
requireProof(dryRun.payload.dryRun === true, "dry-run should report dryRun=true");
requireProof(dryRun.payload.plan?.writesAttempted === false, "dry-run should do no writes");
requireProof(dryRun.payload.plan?.mediaUploaded === false, "dry-run should upload no media");
requireProof(dryRun.payload.plan?.expectedRenditions?.length === 2, "dry-run should plan two HLS renditions");
requireProof(dryRun.payload.plan?.auditBatch?.audit_pass_required_before_resolver_trust === true, "dry-run should require audit before resolver trust");

const runOneMissingConfirm = runCli(["--mode=run-one", `--source-id=${allowedSourceId}`]);
requireProof(runOneMissingConfirm.status !== 0, "run-one should require explicit confirmation");
requireProof(runOneMissingConfirm.payload.reason === "run_one_confirmation_missing", "run-one missing confirmation should be explicit");

const runOneConfirmedStillNoExecute = runCli([
  "--mode=run-one",
  `--source-id=${allowedSourceId}`,
  `--batch-id=${safeBatchId}`,
], {
  MEDIA_WORKER_RUN_ONE_CONFIRM: "I_UNDERSTAND_ONE_JOB",
});
requireProof(runOneConfirmedStillNoExecute.status !== 0, "run-one should not execute in infrastructure proof build");
requireProof(
  runOneConfirmedStillNoExecute.payload.reason === "run_one_execution_not_implemented_in_cli_infrastructure_build",
  "run-one confirmation should still remain infrastructure-only in this task",
);
requireProof(runOneConfirmedStillNoExecute.payload.plan?.maxJobsPerRun === 1, "run-one plan should remain one job only");
requireProof(runOneConfirmedStillNoExecute.payload.productionRowsWritten === false, "run-one proof should write no production rows");

const auditMissingScope = runCli(["--mode=audit", `--source-id=${allowedSourceId}`]);
requireProof(auditMissingScope.status !== 0, "audit should require batch id");
requireProof(auditMissingScope.payload.reason === "batch_id_required", "audit missing batch should be explicit");

const auditPlan = runCli([
  "--mode=audit",
  `--source-id=${allowedSourceId}`,
  `--batch-id=${safeBatchId}`,
  `--output-prefix=${safeOutputPrefix}`,
]);
requireProof(auditPlan.status === 0, "scoped audit plan should pass");
requireProof(auditPlan.payload.auditPlanOnly === true, "audit command should be plan-only by default");
requireProof(auditPlan.payload.writesAttempted === false, "audit plan should not write rows");

const verifyOutputPlan = runCli([
  "--mode=verify-output",
  `--source-id=${allowedSourceId}`,
  `--output-prefix=${safeOutputPrefix}`,
  "--plan-only=true",
]);
requireProof(verifyOutputPlan.status === 0, "verify-output plan-only should pass for safe prefix");
requireProof(verifyOutputPlan.payload.exactPrefixOnly === true, "verify-output should be exact-prefix scoped");

const rollbackPlan = runCli([
  "--mode=rollback-plan",
  `--source-id=${allowedSourceId}`,
  `--batch-id=${safeBatchId}`,
  `--output-prefix=${safeOutputPrefix}`,
]);
requireProof(rollbackPlan.status === 0, "scoped rollback plan should pass");
requireProof(rollbackPlan.payload.rollbackPlan?.targetOnlyExactBatch === true, "rollback should target exact batch");
requireProof(rollbackPlan.payload.rollbackPlan?.targetOnlyExactPrefix === true, "rollback should target exact prefix");
requireProof(rollbackPlan.payload.rollbackPlan?.execution === "plan_only_no_delete", "rollback command should not delete");

const broadRollbackDenied = runCli([
  "--mode=rollback-plan",
  `--source-id=${allowedSourceId}`,
  `--batch-id=${safeBatchId}`,
  "--output-prefix=playback/public/",
]);
requireProof(broadRollbackDenied.status !== 0, "broad rollback prefix should be denied");
requireProof(broadRollbackDenied.payload.reason === "unsafe_output_prefix_refused", "broad rollback denial should be prefix refusal");

const privatePrefixDenied = runCli([
  "--mode=verify-output",
  `--source-id=${allowedSourceId}`,
  "--output-prefix=playback/public/worker-proof/chillywood-city-lights/private/batch/",
  "--plan-only=true",
]);
requireProof(privatePrefixDenied.status !== 0, "private path segment should be denied");
requireProof(privatePrefixDenied.payload.reason === "unsafe_output_prefix_refused", "private segment denial should be explicit");

const publicBucketDeniedByBackupCommands = !dryRun.output.includes("chillywood-media-public-playback-proof")
  || dryRun.output.includes('"publicPlaybackBucket"');
requireProof(publicBucketDeniedByBackupCommands, "proof output should not target public playback bucket for backups");
requireProof(!dryRun.output.includes("productionPlaybackSwitched\": true"), "proof should not claim production playback switched");

const summary = {
  proof: "media-transcode-worker-cli",
  defaultRunOneDenied: defaultRunOne.status !== 0,
  missingSourceDenied: missingDryRunSource.status !== 0,
  nonAllowlistedSourceDenied: nonAllowlisted.payload.reason === "source_not_allowlisted",
  maxJobsGreaterThanOneDenied: maxJobsDenied.payload.reason === "max_jobs_must_be_one",
  backfillDenied: backfillDenied.payload.reason === "backfill_disabled_required",
  missingOrStaleBackupDenied: staleBackupDenied.payload.reason === "backup_gate_not_closed",
  dryRunDoesNoWrites: dryRun.payload.plan?.writesAttempted === false && dryRun.payload.plan?.mediaUploaded === false,
  runOneRequiresConfirmation: runOneMissingConfirm.payload.reason === "run_one_confirmation_missing",
  runOneInfrastructureOnlyNoProductionWrite: runOneConfirmedStillNoExecute.payload.productionRowsWritten === false,
  runOneIsOneJobOnly: runOneConfirmedStillNoExecute.payload.plan?.maxJobsPerRun === 1,
  auditRequiresBatchAndSource: auditMissingScope.payload.reason === "batch_id_required" && auditPlan.payload.sourceId === allowedSourceId,
  verifyOutputScoped: verifyOutputPlan.payload.exactPrefixOnly === true,
  rollbackPlanScoped: rollbackPlan.payload.rollbackPlan?.targetOnlyExactBatch === true
    && rollbackPlan.payload.rollbackPlan?.targetOnlyExactPrefix === true,
  broadPrefixRollbackDenied: broadRollbackDenied.payload.reason === "unsafe_output_prefix_refused",
  publicPrivateBucketSafetyEnforced: privatePrefixDenied.payload.reason === "unsafe_output_prefix_refused",
  productionPlaybackSwitched: false,
  productionWorkerDeployed: false,
  productionQueueProcessorRun: false,
  productionDbWritesEnabled: false,
  noSecretsPrinted: true,
};

assertNoSecretLikeText("media transcode worker CLI proof summary", summary);

if (failures.length > 0) {
  console.error(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
