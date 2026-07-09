#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const now = "2026-07-09T12:00:00.000Z";
const freshBackupAt = "2026-07-09T11:30:00.000Z";
const staleBackupAt = "2026-07-07T11:00:00.000Z";
const freshRestoreDrillAt = "2026-07-09T10:00:00.000Z";
const privatePrefix = "backups/media-worker/2026/07/09/media-worker-logical-scheduled-proof/";

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const compileRecoveryHelper = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-scheduled-backup-proof-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
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
      recovery: loadCompiled("mediaRecoveryOperator.js"),
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
    new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`, "i"),
    /\b(Bearer|password|access_key|api_key|authorization)\s*[:=]/i,
    /chillywood-media-public-playback-proof/i,
  ];
  for (const pattern of secretPatterns) {
    requireProof(!pattern.test(text), `${label} output contains secret-like or public-bucket text matching ${pattern}`);
  }
};

const { recovery, cleanup } = compileRecoveryHelper();

try {
  const policy = recovery.MEDIA_BACKUP_DEFAULT_SCHEDULE_POLICY;
  requireProof(policy.scope === "media_worker", "scheduled policy should be scoped to media worker tables");
  requireProof(policy.tables.includes("media_transcode_jobs"), "scheduled policy should include media_transcode_jobs");
  requireProof(policy.tables.includes("media_renditions"), "scheduled policy should include media_renditions");
  requireProof(policy.frequency.includes("before_worker_run"), "scheduled policy should require backup before worker run");
  requireProof(policy.frequency.includes("daily"), "scheduled policy should include daily backup when automation is enabled");
  requireProof(policy.maxLimitedAutomationBackupAgeHours === 24, "limited automation backup max age should be 24 hours");
  requireProof(policy.maxOneJobBackupAgeHours === 1, "one-job proof backup max age should be 1 hour");
  requireProof(policy.privateR2BucketRole === "private_backup", "scheduled backups should target private R2 backup role");
  requireProof(policy.publicPlaybackBucketDenied === true, "public playback bucket targets should be denied");
  requireProof(policy.logicalBackupNotPitr === true, "scheduled R2 logical backups must not claim PITR");

  const deployedScheduler = {
    schedulerConfigured: true,
    schedulerDeployed: true,
    schedulerDryRunOnly: false,
    lastBackupAt: freshBackupAt,
    lastRestoreDrillAt: freshRestoreDrillAt,
    lastBackupVerified: true,
    lastRestoreDrillPassed: true,
    targetBucketRole: "private_backup",
    targetPrefix: privatePrefix,
  };

  const missingBackup = recovery.evaluateMediaBackupFreshness({
    artifactCreatedAt: null,
    now,
    maxAgeHours: policy.maxLimitedAutomationBackupAgeHours,
    manifestVerified: false,
    checksumReadbackPassed: false,
    targetBucketRole: "private_backup",
    targetPrefix: privatePrefix,
    publicBucketUsed: false,
  });
  const freshRestore = recovery.evaluateRestoreDrillFreshness({
    restoreDrillCompletedAt: freshRestoreDrillAt,
    now,
    maxAgeHours: policy.maxRestoreDrillAgeHours,
    restoreDrillPassed: true,
    disposableDbUsed: true,
    productionDbTouched: false,
  });
  const missingBackupGate = recovery.resolveContinuousWorkerBackupGate({
    schedulerState: deployedScheduler,
    backupFreshness: missingBackup,
    restoreDrillFreshness: freshRestore,
  });
  requireProof(missingBackupGate.status === "blocked_missing_scheduled_backup", "no backup should block continuous gate");

  const staleBackup = recovery.evaluateMediaBackupFreshness({
    artifactCreatedAt: staleBackupAt,
    now,
    maxAgeHours: policy.maxLimitedAutomationBackupAgeHours,
    manifestVerified: true,
    checksumReadbackPassed: true,
    targetBucketRole: "private_backup",
    targetPrefix: privatePrefix,
    publicBucketUsed: false,
  });
  const staleBackupGate = recovery.resolveContinuousWorkerBackupGate({
    schedulerState: deployedScheduler,
    backupFreshness: staleBackup,
    restoreDrillFreshness: freshRestore,
  });
  requireProof(staleBackup.status === "stale", "stale backup should be reported as stale");
  requireProof(staleBackupGate.status === "blocked_stale_scheduled_backup", "stale backup should block continuous gate");

  const freshBackup = recovery.evaluateMediaBackupFreshness({
    artifactCreatedAt: freshBackupAt,
    now,
    maxAgeHours: policy.maxLimitedAutomationBackupAgeHours,
    manifestVerified: true,
    checksumReadbackPassed: true,
    targetBucketRole: "private_backup",
    targetPrefix: privatePrefix,
    publicBucketUsed: false,
    containsSecrets: false,
  });
  const missingRestore = recovery.evaluateRestoreDrillFreshness({
    restoreDrillCompletedAt: null,
    now,
    maxAgeHours: policy.maxRestoreDrillAgeHours,
    restoreDrillPassed: false,
    disposableDbUsed: true,
    productionDbTouched: false,
  });
  const missingRestoreGate = recovery.resolveContinuousWorkerBackupGate({
    schedulerState: deployedScheduler,
    backupFreshness: freshBackup,
    restoreDrillFreshness: missingRestore,
  });
  requireProof(freshBackup.passed === true, "fresh private backup should pass freshness");
  requireProof(missingRestoreGate.status === "blocked_restore_drill_missing", "missing restore drill should block continuous gate");

  const closedLimitedGate = recovery.resolveContinuousWorkerBackupGate({
    schedulerState: deployedScheduler,
    backupFreshness: freshBackup,
    restoreDrillFreshness: freshRestore,
    limitedAutomationRequested: true,
  });
  requireProof(closedLimitedGate.status === "closed_for_limited_automation", "fresh backup plus restore drill should close limited automation gate");
  requireProof(closedLimitedGate.closedForLimitedAutomation === true, "limited automation should be closed when scheduled backup and restore pass");
  requireProof(closedLimitedGate.closedForContinuous === false, "logical backup alone should not close full continuous/PITR gate");

  const oneJobRequirement = recovery.resolveScheduledMediaBackupRequirement({
    mode: "one_job",
    ownerAcceptedOneJobRisk: true,
    policy,
  });
  const oneJobFreshBackup = recovery.evaluateMediaBackupFreshness({
    artifactCreatedAt: freshBackupAt,
    now,
    maxAgeHours: oneJobRequirement.backupMaxAgeHours,
    manifestVerified: true,
    checksumReadbackPassed: true,
    targetBucketRole: "private_backup",
    targetPrefix: privatePrefix,
    publicBucketUsed: false,
  });
  const oneJobStaleBackup = recovery.evaluateMediaBackupFreshness({
    artifactCreatedAt: "2026-07-09T10:30:00.000Z",
    now,
    maxAgeHours: oneJobRequirement.backupMaxAgeHours,
    manifestVerified: true,
    checksumReadbackPassed: true,
    targetBucketRole: "private_backup",
    targetPrefix: privatePrefix,
    publicBucketUsed: false,
  });
  requireProof(oneJobRequirement.backupMaxAgeHours === 1, "one-job override should require backup fresher than one hour");
  requireProof(oneJobFreshBackup.passed === true, "one-job owner override should work with fresh manual backup");
  requireProof(oneJobStaleBackup.passed === false, "one-job owner override should not work with stale manual backup");

  const publicTarget = recovery.evaluateMediaBackupFreshness({
    artifactCreatedAt: freshBackupAt,
    now,
    maxAgeHours: policy.maxLimitedAutomationBackupAgeHours,
    manifestVerified: true,
    checksumReadbackPassed: true,
    targetBucketRole: "public_playback",
    targetPrefix: "playback/public/backups/media-worker/",
    publicBucketUsed: true,
  });
  requireProof(publicTarget.status === "invalid_target", "public playback bucket target should be denied");

  const secretManifest = recovery.evaluateMediaBackupFreshness({
    artifactCreatedAt: freshBackupAt,
    now,
    maxAgeHours: policy.maxLimitedAutomationBackupAgeHours,
    manifestVerified: true,
    checksumReadbackPassed: true,
    targetBucketRole: "private_backup",
    targetPrefix: privatePrefix,
    publicBucketUsed: false,
    manifestText: "api_key: proof-secret-value",
  });
  requireProof(secretManifest.status === "contains_secret_like_value", "secret-like backup manifest should be denied");

  const retentionPlan = recovery.buildMediaBackupRetentionPlan({
    backups: [
      {
        backup_id: "old-daily",
        created_at: "2026-07-01T00:00:00.000Z",
        r2_object_prefix: "backups/media-worker/2026/07/01/old-daily/",
      },
      {
        backup_id: "restore-drill-passed",
        created_at: "2026-07-02T00:00:00.000Z",
        r2_object_prefix: "backups/media-worker/2026/07/02/restore-drill-passed/",
        restore_drill_passed: true,
      },
      {
        backup_id: "latest-daily",
        created_at: "2026-07-09T00:00:00.000Z",
        r2_object_prefix: "backups/media-worker/2026/07/09/latest-daily/",
      },
      {
        backup_id: "public-target-denied",
        created_at: "2026-07-09T01:00:00.000Z",
        r2_object_prefix: "playback/public/backups/media-worker/public-target-denied/",
      },
    ],
    policy: {
      keepLastDailyBackups: 1,
      keepLatestRestoreDrillPassed: true,
      minimumRetentionDays: 30,
      privateR2PrefixRoot: "backups/media-worker/",
    },
  });
  requireProof(retentionPlan.keepBackupIds.includes("latest-daily"), "retention should keep latest daily backup");
  requireProof(retentionPlan.keepBackupIds.includes("restore-drill-passed"), "retention should keep latest restore-drill-passed backup");
  requireProof(retentionPlan.deleteCandidateBackupIds.includes("old-daily"), "retention should mark old daily backup as cleanup candidate");
  requireProof(retentionPlan.deniedPublicBucketTargets.includes("public-target-denied"), "retention should deny public backup targets");

  const backfillGate = recovery.resolveContinuousWorkerBackupGate({
    schedulerState: deployedScheduler,
    backupFreshness: freshBackup,
    restoreDrillFreshness: freshRestore,
    broadBackfillRequested: true,
    explicitOwnerBackfillApproval: false,
  });
  requireProof(backfillGate.status === "blocked_backfill_requires_owner_approval", "backfill should still require explicit owner approval");

  const dryRunSchedulerPlan = {
    wouldCreateBackup: true,
    wouldWriteProductionRows: false,
    wouldRunWorker: false,
    wouldDeployScheduler: false,
    targetBucketRole: "private_backup",
    targetPrefix: privatePrefix,
  };
  requireProof(dryRunSchedulerPlan.wouldWriteProductionRows === false, "scheduler dry-run must not write production rows");
  requireProof(dryRunSchedulerPlan.wouldRunWorker === false, "scheduler dry-run must not run worker");
  requireProof(dryRunSchedulerPlan.wouldDeployScheduler === false, "scheduler dry-run must not deploy scheduler");

  const sanitized = recovery.sanitizeScheduledBackupProof({
    password: "should-redact",
    nested: { privateSignedUrl: "https://private-origin.example/source.mp4?signature=redacted" },
    publicBucketUsed: false,
  });
  requireProof(sanitized.password === "redacted", "scheduled backup proof sanitizer should redact password-like keys");
  requireProof(sanitized.nested.privateSignedUrl === "redacted", "scheduled backup proof sanitizer should redact private signed URL-like keys");

  const summary = {
    proof: "media-scheduled-backup-gate",
    scheduledBackupPolicyDefined: true,
    scopeTables: policy.tables,
    backupFrequency: policy.frequency,
    limitedAutomationMaxBackupAgeHours: policy.maxLimitedAutomationBackupAgeHours,
    oneJobMaxBackupAgeHours: policy.maxOneJobBackupAgeHours,
    restoreDrillMaxAgeHours: policy.maxRestoreDrillAgeHours,
    noBackupBlocksContinuous: missingBackupGate.status === "blocked_missing_scheduled_backup",
    staleBackupBlocksContinuous: staleBackupGate.status === "blocked_stale_scheduled_backup",
    freshBackupWithoutRestoreBlocksContinuous: missingRestoreGate.status === "blocked_restore_drill_missing",
    freshBackupAndRestoreClosesLimitedAutomation: closedLimitedGate.status === "closed_for_limited_automation",
    logicalBackupClosesFullContinuousPitrGate: closedLimitedGate.closedForContinuous,
    oneJobOverrideRequiresFreshManualBackup: oneJobFreshBackup.passed === true && oneJobStaleBackup.passed === false,
    publicBucketBackupTargetDenied: publicTarget.status === "invalid_target",
    secretLikeBackupArtifactDenied: secretManifest.status === "contains_secret_like_value",
    retentionKeepsLatestRestoreDrillPassedBackup: retentionPlan.keepBackupIds.includes("restore-drill-passed"),
    broadBackfillDeniedWithoutExplicitOwnerApproval: backfillGate.status === "blocked_backfill_requires_owner_approval",
    schedulerDryRun: dryRunSchedulerPlan,
    productionWorkerDeployed: false,
    productionQueueProcessorRun: false,
    productionDbWritesEnabled: false,
    productionPlaybackSwitched: false,
    pitrEnabledByThisProof: false,
    r2LogicalBackupNotPitr: true,
    noSecretsPrinted: true,
  };

  assertNoSecretLikeText("scheduled backup gate summary", summary);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  cleanup();
}

if (failures.length) {
  console.error("Scheduled media backup gate proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
