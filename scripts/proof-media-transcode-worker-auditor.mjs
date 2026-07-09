#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const sourceId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const batchId = "proof-worker-batch-city-lights-operator-one-job";
const exactR2Prefix = "playback/public/proof-worker/chillywood-city-lights/v1-b670602fa00934ca-local-hls/";
const nowMillis = Date.UTC(2026, 6, 9, 12, 30, 0);

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-transcode-auditor-proof-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaTranscodeOperator.ts",
        "_lib/mediaTranscodeWorkerSafety.ts",
        "_lib/mediaRecoveryOperator.ts",
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
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const requireFromHere = createRequire(import.meta.url);
    const loadCompiled = (fileName) => {
      for (const candidate of [
        path.join(outDir, fileName),
        path.join(outDir, "_lib", fileName),
      ]) {
        try {
          return requireFromHere(candidate);
        } catch {
          // Try the next compiler output layout.
        }
      }
      throw new Error(`Compiled helper ${fileName} was not found.`);
    };

    return {
      workerSafety: loadCompiled("mediaTranscodeWorkerSafety.js"),
      recoveryOperator: loadCompiled("mediaRecoveryOperator.js"),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const assertNoSecretLikeText = (label, value) => {
  const text = JSON.stringify(value);
  const secretPatterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b/,
    /\b(Bearer|password|access_key|api_key)\b/i,
  ];
  for (const pattern of secretPatterns) {
    requireProof(!pattern.test(text), `${label} output contains secret-like text matching ${pattern}`);
  }
};

const buildPendingRow = (overrides = {}) => ({
  id: overrides.id ?? "proof-row-480p",
  batch_id: overrides.batch_id ?? batchId,
  source_id: overrides.source_id ?? sourceId,
  rendition_label: overrides.rendition_label ?? "480p",
  public_playback_path: overrides.public_playback_path ?? `${exactR2Prefix}master.m3u8`,
  manifest_path: overrides.manifest_path ?? `${exactR2Prefix}master.m3u8`,
  variant_playlist_path: overrides.variant_playlist_path ?? `${exactR2Prefix}480p/index.m3u8`,
  visibility: overrides.visibility ?? "public",
  scan_status: overrides.scan_status ?? "clean",
  moderation_status: overrides.moderation_status ?? "allowed",
  bucket_role: overrides.bucket_role ?? "public_playback",
  is_original: overrides.is_original ?? false,
  is_public_playback_safe: overrides.is_public_playback_safe ?? true,
  worker_status: overrides.worker_status ?? "pending_audit",
  resolver_ready: overrides.resolver_ready ?? false,
});

const { workerSafety, recoveryOperator, cleanup } = compileHelpers();

try {
  const leaseDecision = workerSafety.requestTranscodeWorkerLease({
    mode: "one_job",
    requestedSourceId: sourceId,
    allowedSourceIds: [sourceId],
    maxJobsPerRun: 1,
    backupGateStatus: "blocked",
    ownerOneJobOverride: true,
    sourceAllowedForProcessing: true,
    backfillEnabled: false,
    operatorRunId: "worker-auditor-proof",
    nowMillis,
  });

  const lease = leaseDecision.lease;
  requireProof(!!lease, "operator should grant one-job lease for allowlisted proof source");

  const missingLease = workerSafety.validateTranscodeWorkerLease({
    lease: null,
    sourceId,
    nowMillis,
    completedJobCount: 0,
  });
  requireProof(missingLease.blockedReason === "missing_operator_lease", "worker should refuse without lease");

  const wrongSource = workerSafety.validateTranscodeWorkerLease({
    lease,
    sourceId: "wrong-source",
    nowMillis,
    completedJobCount: 0,
  });
  requireProof(wrongSource.blockedReason === "lease_source_mismatch", "worker should refuse source mismatch");

  const maxJobsExceeded = workerSafety.validateTranscodeWorkerLease({
    lease,
    sourceId,
    nowMillis,
    completedJobCount: 1,
  });
  requireProof(maxJobsExceeded.blockedReason === "max_job_count_exceeded", "worker should refuse after one job");

  const expiredLease = workerSafety.validateTranscodeWorkerLease({
    lease,
    sourceId,
    nowMillis: lease.expiresAtMillis + 1,
    completedJobCount: 0,
  });
  requireProof(expiredLease.blockedReason === "lease_expired_or_job_stalled", "lease should expire if job stalls");

  const validLease = workerSafety.validateTranscodeWorkerLease({
    lease,
    sourceId,
    nowMillis,
    completedJobCount: 0,
  });
  requireProof(validLease.valid === true, "valid one-job lease should pass before first job");

  requireProof(workerSafety.canWorkerWriteRenditionStatus("pending_audit") === true, "worker can write pending_audit rows only");
  requireProof(workerSafety.canWorkerWriteRenditionStatus("ready") === false, "worker cannot mark rows ready before audit");
  requireProof(workerSafety.canResolverTrustWorkerWrittenRows({ auditPassed: false, rowStatus: "pending_audit" }) === false, "resolver ignores pending_audit rows");

  const safeRows = [
    buildPendingRow({ id: "proof-row-360p", rendition_label: "360p", variant_playlist_path: `${exactR2Prefix}360p/index.m3u8` }),
    buildPendingRow({ id: "proof-row-480p", rendition_label: "480p", variant_playlist_path: `${exactR2Prefix}480p/index.m3u8` }),
  ];
  const auditPass = recoveryOperator.auditMediaRecoveryBatch({
    batchId,
    sourceId,
    expectedRowCount: 2,
    exactR2Prefix,
    rows: safeRows,
  });
  requireProof(auditPass.passed === true, "safe pending rows should pass auditor");
  requireProof(auditPass.resolverTrustAllowed === true, "audit pass should allow resolver trust");
  requireProof(auditPass.rollbackPlan.exact_r2_prefix === exactR2Prefix, "rollback plan should be scoped to exact R2 prefix");
  requireProof(auditPass.rollbackPlan.batch_id === batchId, "rollback plan should be scoped to exact batch_id");

  const trustedRows = safeRows.map((row) => recoveryOperator.applyMediaRecoveryAuditResult(row, auditPass));
  requireProof(
    trustedRows.every((row) => row.worker_status === "audit_passed" && row.resolver_ready === true),
    "auditor pass should be required before resolver-ready rows",
  );

  const unsafeRows = [
    buildPendingRow({ id: "unsafe-original", is_original: true }),
    buildPendingRow({ id: "unsafe-premium", visibility: "premium" }),
    buildPendingRow({ id: "unsafe-private-prefix", public_playback_path: "private/proof/master.m3u8", manifest_path: "private/proof/master.m3u8" }),
    buildPendingRow({ id: "unsafe-unscanned", scan_status: "unscanned" }),
    buildPendingRow({ id: "unsafe-moderation", moderation_status: "blocked" }),
    buildPendingRow({ id: "unsafe-ready-before-audit", resolver_ready: true }),
  ];
  const auditFail = recoveryOperator.auditMediaRecoveryBatch({
    batchId,
    sourceId,
    expectedRowCount: unsafeRows.length,
    exactR2Prefix,
    rows: unsafeRows,
  });
  requireProof(auditFail.passed === false, "unsafe rows should fail auditor");
  requireProof(auditFail.state === "quarantined", "audit failure should quarantine");
  requireProof(auditFail.resolverTrustAllowed === false, "audit failure should block resolver trust");
  requireProof(auditFail.failures.some((failure) => failure.startsWith("original_or_master_public_playback_blocked")), "auditor should block original/master public playback");
  requireProof(auditFail.failures.some((failure) => failure.startsWith("premium_or_private_public_playback_blocked")), "auditor should block Premium/private public playback");
  requireProof(auditFail.failures.some((failure) => failure.startsWith("scan_not_clean")), "auditor should block unscanned rows");
  requireProof(auditFail.failures.some((failure) => failure.startsWith("moderation_not_allowed")), "auditor should block moderation-blocked rows");
  requireProof(auditFail.failures.some((failure) => failure.startsWith("unexpected_ready_row_before_audit")), "auditor should block unexpected ready rows");

  const quarantinedRows = unsafeRows.map((row) => recoveryOperator.applyMediaRecoveryAuditResult(row, auditFail));
  requireProof(
    quarantinedRows.every((row) => row.worker_status === "quarantined" && row.resolver_ready === false),
    "quarantined rows should not be resolver-ready",
  );

  const quarantine = workerSafety.quarantineTranscodeWorkerBatch({
    batchId,
    reason: "audit_failed",
    r2Prefix: exactR2Prefix,
  });
  requireProof(quarantine.disabled === true && quarantine.state === "quarantined", "quarantine should auto-disable worker lane");
  requireProof(quarantine.rollbackPlan.deleteOnlyExactPrefix === true, "quarantine rollback should delete only exact prefix");

  const auditPassAutoDisable = workerSafety.completeTranscodeWorkerLease({
    lease,
    success: true,
    auditPassed: true,
  });
  const auditFailAutoDisable = workerSafety.completeTranscodeWorkerLease({
    lease,
    failed: true,
    auditFailed: true,
  });
  requireProof(auditPassAutoDisable.disabled === true, "audit pass should auto-disable one-job lane");
  requireProof(auditFailAutoDisable.disabled === true && auditFailAutoDisable.state === "quarantined", "audit fail should quarantine and auto-disable one-job lane");

  const summary = {
    proof: process.argv.includes("--alias=media-recovery-operator")
      ? "media-recovery-operator"
      : "media-transcode-worker-auditor",
    operatorLeaseRequired: missingLease.blockedReason === "missing_operator_lease",
    leaseSourceMismatchDenied: wrongSource.blockedReason === "lease_source_mismatch",
    maxJobsExceededDenied: maxJobsExceeded.blockedReason === "max_job_count_exceeded",
    leaseExpiryBlocksStalledJob: expiredLease.blockedReason === "lease_expired_or_job_stalled",
    workerWritesPendingAuditOnly: workerSafety.canWorkerWriteRenditionStatus("pending_audit") === true
      && workerSafety.canWorkerWriteRenditionStatus("ready") === false,
    auditPassRequiredBeforeResolverTrust: workerSafety.canResolverTrustWorkerWrittenRows({
      auditPassed: false,
      rowStatus: "pending_audit",
    }) === false,
    auditPassAllowsResolverTrust: auditPass.passed === true && recoveryOperator.canResolverTrustAuditedRows(auditPass) === true,
    auditFailureQuarantines: auditFail.state === "quarantined",
    rollbackPlanScopedToBatchAndPrefix: quarantine.rollbackPlan.batchId === batchId
      && quarantine.rollbackPlan.r2Prefix === exactR2Prefix
      && quarantine.rollbackPlan.deleteOnlyExactPrefix === true,
    resolverIgnoresPendingOrQuarantinedRows: quarantinedRows.every((row) => row.resolver_ready === false),
    autoDisableAfterAuditPassOrFailure: auditPassAutoDisable.disabled === true && auditFailAutoDisable.disabled === true,
    productionWorkerDeployed: false,
    productionQueueProcessorRun: false,
    productionDbWritesEnabled: false,
    productionRowsWritten: false,
    productionPlaybackSwitched: false,
    noSecretsPrinted: true,
  };

  assertNoSecretLikeText("worker auditor proof summary", summary);

  if (failures.length > 0) {
    console.error(JSON.stringify({ ...summary, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  cleanup();
}
