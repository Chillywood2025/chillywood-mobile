export type MediaRecoveryAuditStatus =
  | "pending_audit"
  | "audit_passed"
  | "audit_failed"
  | "quarantined";

export type MediaRecoveryAuditRow = {
  id: string;
  batch_id: string;
  source_id: string;
  rendition_label: string;
  public_playback_path: string;
  manifest_path: string | null;
  variant_playlist_path: string | null;
  visibility: "public" | "premium" | "private" | string;
  scan_status: "clean" | "approved" | "pending" | "unscanned" | string;
  moderation_status: "clean" | "approved" | "allowed" | "blocked" | "hidden" | string;
  bucket_role: "public_playback" | "private_origin" | string;
  is_original: boolean;
  is_public_playback_safe: boolean;
  worker_status: MediaRecoveryAuditStatus;
  resolver_ready: boolean;
};

export type MediaRecoveryRollbackPlan = {
  batch_id: string;
  exact_r2_prefix: string;
  row_ids: string[];
  delete_only_exact_prefix: true;
  revoke_resolver_trust: true;
  delete_private_origin_media: false;
};

export type MediaRecoveryAuditResult = {
  batch_id: string;
  source_id: string;
  passed: boolean;
  state: "passed" | "quarantined";
  resolverTrustAllowed: boolean;
  checkedRowCount: number;
  expectedRowCount: number;
  failures: string[];
  rollbackPlan: MediaRecoveryRollbackPlan;
};

export type MediaRecoveryAuditInput = {
  batchId: string;
  sourceId: string;
  expectedRowCount: number;
  exactR2Prefix: string;
  rows: MediaRecoveryAuditRow[];
};

export type MediaWorkerBackupGateStatus =
  | "blocked_missing_backup"
  | "blocked_stale_backup"
  | "blocked_restore_drill_missing"
  | "one_job_owner_override_available"
  | "closed_for_one_job"
  | "closed_for_continuous"
  | "blocked_pitr_required";

export type MediaBackupScheduleFrequency =
  | "before_worker_run"
  | "daily";

export type MediaBackupSchedulePolicy = {
  scope: "media_worker";
  tables: string[];
  frequency: MediaBackupScheduleFrequency[];
  maxLimitedAutomationBackupAgeHours: number;
  maxOneJobBackupAgeHours: number;
  maxRestoreDrillAgeHours: number;
  privateR2BucketRole: "private_backup";
  privateR2PrefixRoot: string;
  publicPlaybackBucketDenied: true;
  logicalBackupNotPitr: true;
  continuousRequiresScheduledBackupAndRestoreDrill: true;
};

export type MediaBackupFreshnessStatus =
  | "missing"
  | "stale"
  | "fresh"
  | "invalid_target"
  | "contains_secret_like_value";

export type MediaBackupFreshnessResult = {
  status: MediaBackupFreshnessStatus;
  passed: boolean;
  checkedAt: string;
  artifactCreatedAt: string | null;
  ageHours: number | null;
  maxAgeHours: number;
  privateBackupTarget: boolean;
  logicalBackupNotPitr: true;
  failures: string[];
};

export type MediaBackupRetentionPolicy = {
  keepLastDailyBackups: number;
  keepLatestRestoreDrillPassed: true;
  minimumRetentionDays: number;
  privateR2PrefixRoot: string;
};

export type MediaBackupRetentionPlan = {
  keepBackupIds: string[];
  deleteCandidateBackupIds: string[];
  latestRestoreDrillPassedBackupId: string | null;
  deniedPublicBucketTargets: string[];
  privateR2PrefixRoot: string;
};

export type MediaBackupSchedulerState = {
  schedulerConfigured: boolean;
  schedulerDeployed: boolean;
  schedulerDryRunOnly: boolean;
  actualBackupRunnerAvailable?: boolean;
  lastBackupAt: string | null;
  lastRestoreDrillAt: string | null;
  lastBackupVerified: boolean;
  lastRestoreDrillPassed: boolean;
  latestScheduledBackupVerified?: boolean;
  restoreDrillFresh?: boolean;
  continuousAutomationAllowed?: boolean;
  targetBucketRole: "private_backup" | "public_playback" | string;
  targetPrefix: string;
};

export type MediaScheduledBackupRequirementResult = {
  required: boolean;
  backupMaxAgeHours: number;
  restoreDrillMaxAgeHours: number;
  ownerAcceptanceRequired: boolean;
  pitrStillRequiredForBroadBackfill: boolean;
  logicalBackupNotPitr: true;
  reasons: string[];
};

export type MediaContinuousWorkerBackupGateResult = {
  status:
    | "blocked_missing_scheduled_backup"
    | "blocked_stale_scheduled_backup"
    | "blocked_restore_drill_missing"
    | "blocked_scheduler_not_deployed"
    | "blocked_public_backup_target"
    | "blocked_backfill_requires_owner_approval"
    | "closed_for_limited_automation"
    | "closed_for_continuous_with_pitr";
  closedForLimitedAutomation: boolean;
  closedForContinuous: boolean;
  ownerApprovalRequired: boolean;
  logicalBackupNotPitr: true;
  failures: string[];
};

export type MediaRecoveryBackupManifest = {
  backup_id: string;
  created_at: string;
  source_project_ref_redacted: string;
  database_host_redacted: string;
  scope: "media_worker";
  tables_included: string[];
  tables_excluded: string[];
  row_counts: Record<string, number>;
  migration_head: string;
  repo_commit: string;
  artifact_files: string[];
  r2_bucket_role: "private_backup";
  r2_object_prefix: string;
  sha256: Record<string, string>;
  tool_used: string;
  logical_backup_not_pitr: true;
  contains_secrets: false;
  public_bucket_used: false;
  production_rows_written: false;
};

export type MediaRecoveryBackupManifestVerification = {
  valid: boolean;
  failures: string[];
  logicalBackupNotPitr: boolean;
  publicBucketUsed: boolean;
  containsSecrets: boolean;
  privateBackupPrefix: boolean;
};

export type MediaWorkerBackupGateInput = {
  manifest?: MediaRecoveryBackupManifest | null;
  manifestVerified: boolean;
  checksumReadbackPassed: boolean;
  restoreDrillPassed: boolean;
  rollbackDrillPassed?: boolean;
  backupCreatedAt: string;
  now: string;
  maxBackupAgeHours: number;
  ownerAcceptedOneJobRisk?: boolean;
  operatorOneJobConstraintsPassed?: boolean;
  continuousRequested?: boolean;
  pitrEnabled?: boolean;
  scheduledRestoreSystemProved?: boolean;
};

export type MediaWorkerBackupGateResult = {
  status: MediaWorkerBackupGateStatus;
  closedForOneJob: boolean;
  closedForContinuous: boolean;
  ownerAcceptanceRequired: boolean;
  logicalBackupNotPitr: true;
  failures: string[];
};

export type MediaWorkerRestoreDrillResult = {
  backup_id: string;
  restore_target: "disposable_db";
  restoredTables: string[];
  rowCountsExpected: Record<string, number>;
  rowCountsRestored: Record<string, number>;
  rowCountsMatch: boolean;
  resolverSafeQueryPassed: boolean;
  unsafeRowsExcluded: boolean;
  productionDbTouched: false;
  passed: boolean;
  limitations: string[];
};

export type MediaWorkerRollbackPlanInput = {
  batchId: string;
  exactR2Prefix: string;
  rows: MediaRecoveryAuditRow[];
  expectedRowCount?: number;
};

export type MediaWorkerRollbackPlan = {
  batch_id: string;
  exact_r2_prefix: string;
  allowed: boolean;
  failures: string[];
  affected_row_ids: string[];
  preserved_row_ids: string[];
  delete_only_exact_prefix: true;
  revoke_resolver_trust: true;
  delete_private_origin_media: false;
};

const PUBLIC_PREFIX = "playback/public/";
const ALLOWED_SCAN_STATUSES = new Set(["clean", "approved"]);
const ALLOWED_MODERATION_STATUSES = new Set(["clean", "approved", "allowed"]);
const FORBIDDEN_PUBLIC_SEGMENTS = new Set([
  "original",
  "originals",
  "master",
  "masters",
  "source",
  "sources",
  "uploads",
  "private",
  "premium",
  "processing",
  "moderation-blocked",
  "moderation_blocked",
  "unscanned",
]);

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const normalizeObjectPath = (value: unknown) => (
  toText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
);

const findForbiddenSegment = (path: string) => (
  path
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .find((segment) => FORBIDDEN_PUBLIC_SEGMENTS.has(segment)) ?? null
);

const rowPlaybackPaths = (row: MediaRecoveryAuditRow) => [
  row.public_playback_path,
  row.manifest_path,
  row.variant_playlist_path,
]
  .map((value) => normalizeObjectPath(value))
  .filter(Boolean);

const isSecretLikeText = (value: string) => (
  /\bAKIA[0-9A-Z]{16}\b/.test(value)
  || /\bASIA[0-9A-Z]{16}\b/.test(value)
  || /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/.test(value)
  || new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`, "i").test(value)
  || /\b(password|access_key|api_key|authorization)\s*[:=]/i.test(value)
);

const isValidSha256 = (value: unknown) => /^[a-f0-9]{64}$/i.test(toText(value));

const hasBroadBackupOrRollbackPrefix = (prefix: string) => {
  const normalized = normalizeObjectPath(prefix);
  if (!normalized.startsWith(PUBLIC_PREFIX)) return false;
  const segments = normalized.split("/").filter(Boolean);
  return normalized === PUBLIC_PREFIX
    || normalized === "playback/public"
    || segments.length < 5
    || /^(playback\/public\/?(?:\*|\*\*)?)$/i.test(normalized);
};

const isSafePrivateBackupPrefix = (prefix: string) => {
  const normalized = normalizeObjectPath(prefix);
  return normalized.startsWith("backups/media-worker/")
    && !normalized.includes("..")
    && !normalized.startsWith(PUBLIC_PREFIX)
    && !findForbiddenSegment(normalized);
};

const hoursBetween = (older: string | null | undefined, newer: string | null | undefined) => {
  const olderTime = Date.parse(toText(older));
  const newerTime = Date.parse(toText(newer));
  if (!Number.isFinite(olderTime) || !Number.isFinite(newerTime)) return null;
  return Math.max(0, (newerTime - olderTime) / (60 * 60 * 1000));
};

export const MEDIA_BACKUP_DEFAULT_SCHEDULE_POLICY: MediaBackupSchedulePolicy = {
  scope: "media_worker",
  tables: ["media_transcode_jobs", "media_renditions"],
  frequency: ["before_worker_run", "daily"],
  maxLimitedAutomationBackupAgeHours: 24,
  maxOneJobBackupAgeHours: 1,
  maxRestoreDrillAgeHours: 24,
  privateR2BucketRole: "private_backup",
  privateR2PrefixRoot: "backups/media-worker/",
  publicPlaybackBucketDenied: true,
  logicalBackupNotPitr: true,
  continuousRequiresScheduledBackupAndRestoreDrill: true,
};

export const MEDIA_BACKUP_DEFAULT_RETENTION_POLICY: MediaBackupRetentionPolicy = {
  keepLastDailyBackups: 7,
  keepLatestRestoreDrillPassed: true,
  minimumRetentionDays: 30,
  privateR2PrefixRoot: "backups/media-worker/",
};

export function resolveScheduledMediaBackupRequirement(input: {
  mode: "one_job" | "limited_automation" | "continuous" | "backfill";
  ownerAcceptedOneJobRisk?: boolean | null;
  explicitOwnerApproval?: boolean | null;
  policy?: MediaBackupSchedulePolicy | null;
}): MediaScheduledBackupRequirementResult {
  const policy = input.policy ?? MEDIA_BACKUP_DEFAULT_SCHEDULE_POLICY;
  const reasons: string[] = [];
  const mode = input.mode;

  if (mode === "one_job") {
    reasons.push("fresh_manual_backup_required_before_one_job");
    if (input.ownerAcceptedOneJobRisk !== true) reasons.push("owner_one_job_acceptance_required");
    return {
      required: true,
      backupMaxAgeHours: policy.maxOneJobBackupAgeHours,
      restoreDrillMaxAgeHours: policy.maxRestoreDrillAgeHours,
      ownerAcceptanceRequired: input.ownerAcceptedOneJobRisk !== true,
      pitrStillRequiredForBroadBackfill: true,
      logicalBackupNotPitr: true,
      reasons,
    };
  }

  if (mode === "backfill") {
    reasons.push("backfill_requires_pitr_or_scheduled_restore_system");
    if (input.explicitOwnerApproval !== true) reasons.push("explicit_owner_backfill_approval_required");
    return {
      required: true,
      backupMaxAgeHours: policy.maxOneJobBackupAgeHours,
      restoreDrillMaxAgeHours: policy.maxRestoreDrillAgeHours,
      ownerAcceptanceRequired: input.explicitOwnerApproval !== true,
      pitrStillRequiredForBroadBackfill: true,
      logicalBackupNotPitr: true,
      reasons,
    };
  }

  reasons.push("scheduled_backup_and_restore_drill_required_for_limited_automation");
  return {
    required: true,
    backupMaxAgeHours: policy.maxLimitedAutomationBackupAgeHours,
    restoreDrillMaxAgeHours: policy.maxRestoreDrillAgeHours,
    ownerAcceptanceRequired: mode === "continuous",
    pitrStillRequiredForBroadBackfill: true,
    logicalBackupNotPitr: true,
    reasons,
  };
}

export function evaluateMediaBackupFreshness(input: {
  artifactCreatedAt?: string | null;
  now: string;
  maxAgeHours: number;
  manifestVerified?: boolean | null;
  checksumReadbackPassed?: boolean | null;
  targetBucketRole?: string | null;
  targetPrefix?: string | null;
  publicBucketUsed?: boolean | null;
  containsSecrets?: boolean | null;
  manifestText?: string | null;
}): MediaBackupFreshnessResult {
  const failures: string[] = [];
  const targetPrefix = normalizeObjectPath(input.targetPrefix);
  const privateBackupTarget = input.targetBucketRole === "private_backup"
    && input.publicBucketUsed !== true
    && isSafePrivateBackupPrefix(targetPrefix);
  const ageHours = hoursBetween(input.artifactCreatedAt, input.now);
  const maxAgeHours = Math.max(0, Number(input.maxAgeHours));

  if (!input.artifactCreatedAt || ageHours === null) failures.push("missing_or_invalid_backup_timestamp");
  if (ageHours !== null && maxAgeHours > 0 && ageHours > maxAgeHours) failures.push("backup_stale");
  if (input.manifestVerified !== true) failures.push("backup_manifest_not_verified");
  if (input.checksumReadbackPassed !== true) failures.push("backup_checksum_readback_missing");
  if (!privateBackupTarget) failures.push("backup_target_must_be_private_r2_media_worker_prefix");
  if (input.containsSecrets === true) failures.push("backup_manifest_contains_secret");
  if (input.manifestText && isSecretLikeText(input.manifestText)) failures.push("backup_manifest_contains_secret_like_text");
  if (input.manifestText && /media\.chillywoodstream\.com|chillywood-media-public-playback-proof/i.test(input.manifestText)) {
    failures.push("backup_manifest_references_public_delivery_surface");
  }

  let status: MediaBackupFreshnessStatus = "fresh";
  if (failures.includes("missing_or_invalid_backup_timestamp")) status = "missing";
  else if (failures.includes("backup_manifest_contains_secret") || failures.includes("backup_manifest_contains_secret_like_text")) {
    status = "contains_secret_like_value";
  } else if (failures.includes("backup_target_must_be_private_r2_media_worker_prefix")) status = "invalid_target";
  else if (failures.includes("backup_stale")) status = "stale";

  return {
    status,
    passed: failures.length === 0,
    checkedAt: input.now,
    artifactCreatedAt: input.artifactCreatedAt ?? null,
    ageHours,
    maxAgeHours,
    privateBackupTarget,
    logicalBackupNotPitr: true,
    failures,
  };
}

export function evaluateRestoreDrillFreshness(input: {
  restoreDrillCompletedAt?: string | null;
  now: string;
  maxAgeHours: number;
  restoreDrillPassed?: boolean | null;
  disposableDbUsed?: boolean | null;
  productionDbTouched?: boolean | null;
}): MediaBackupFreshnessResult {
  const ageHours = hoursBetween(input.restoreDrillCompletedAt, input.now);
  const failures: string[] = [];
  const maxAgeHours = Math.max(0, Number(input.maxAgeHours));

  if (!input.restoreDrillCompletedAt || ageHours === null) failures.push("missing_or_invalid_restore_drill_timestamp");
  if (ageHours !== null && maxAgeHours > 0 && ageHours > maxAgeHours) failures.push("restore_drill_stale");
  if (input.restoreDrillPassed !== true) failures.push("restore_drill_not_passed");
  if (input.disposableDbUsed !== true) failures.push("restore_drill_must_use_disposable_db");
  if (input.productionDbTouched === true) failures.push("restore_drill_must_not_touch_production_db");

  return {
    status: failures.includes("missing_or_invalid_restore_drill_timestamp")
      ? "missing"
      : failures.includes("restore_drill_stale") ? "stale" : "fresh",
    passed: failures.length === 0,
    checkedAt: input.now,
    artifactCreatedAt: input.restoreDrillCompletedAt ?? null,
    ageHours,
    maxAgeHours,
    privateBackupTarget: true,
    logicalBackupNotPitr: true,
    failures,
  };
}

export function resolveContinuousWorkerBackupGate(input: {
  schedulerState: MediaBackupSchedulerState;
  backupFreshness: MediaBackupFreshnessResult;
  restoreDrillFreshness: MediaBackupFreshnessResult;
  pitrEnabled?: boolean | null;
  limitedAutomationRequested?: boolean | null;
  broadBackfillRequested?: boolean | null;
  explicitOwnerBackfillApproval?: boolean | null;
}): MediaContinuousWorkerBackupGateResult {
  const failures: string[] = [];
  const scheduler = input.schedulerState;

  if (scheduler.schedulerConfigured !== true || scheduler.schedulerDeployed !== true) {
    failures.push("scheduled_backup_not_deployed");
  }
  if (scheduler.schedulerDryRunOnly === true) failures.push("scheduled_backup_is_dry_run_only");
  if (scheduler.actualBackupRunnerAvailable === false) failures.push("backup_runner_not_available");
  if (scheduler.latestScheduledBackupVerified === false) failures.push("latest_scheduled_backup_not_verified");
  if (scheduler.restoreDrillFresh === false) failures.push("restore_drill_not_fresh");
  if (scheduler.continuousAutomationAllowed === true && input.pitrEnabled !== true && input.limitedAutomationRequested !== true) {
    failures.push("continuous_automation_requires_pitr_or_limited_mode");
  }
  if (scheduler.targetBucketRole !== "private_backup" || !isSafePrivateBackupPrefix(scheduler.targetPrefix)) {
    failures.push("scheduled_backup_target_must_be_private_r2");
  }
  if (!input.backupFreshness.passed) failures.push(...input.backupFreshness.failures);
  if (!input.restoreDrillFreshness.passed) failures.push(...input.restoreDrillFreshness.failures);
  if (input.broadBackfillRequested === true && input.explicitOwnerBackfillApproval !== true) {
    failures.push("broad_backfill_requires_explicit_owner_approval");
  }

  if (failures.includes("scheduled_backup_target_must_be_private_r2")) {
    return {
      status: "blocked_public_backup_target",
      closedForLimitedAutomation: false,
      closedForContinuous: false,
      ownerApprovalRequired: true,
      logicalBackupNotPitr: true,
      failures,
    };
  }
  if (failures.includes("scheduled_backup_not_deployed") || failures.includes("scheduled_backup_is_dry_run_only")) {
    return {
      status: "blocked_scheduler_not_deployed",
      closedForLimitedAutomation: false,
      closedForContinuous: false,
      ownerApprovalRequired: true,
      logicalBackupNotPitr: true,
      failures,
    };
  }
  if (!input.backupFreshness.passed) {
    return {
      status: input.backupFreshness.status === "missing" ? "blocked_missing_scheduled_backup" : "blocked_stale_scheduled_backup",
      closedForLimitedAutomation: false,
      closedForContinuous: false,
      ownerApprovalRequired: true,
      logicalBackupNotPitr: true,
      failures,
    };
  }
  if (!input.restoreDrillFreshness.passed) {
    return {
      status: "blocked_restore_drill_missing",
      closedForLimitedAutomation: false,
      closedForContinuous: false,
      ownerApprovalRequired: true,
      logicalBackupNotPitr: true,
      failures,
    };
  }
  if (failures.includes("broad_backfill_requires_explicit_owner_approval")) {
    return {
      status: "blocked_backfill_requires_owner_approval",
      closedForLimitedAutomation: false,
      closedForContinuous: false,
      ownerApprovalRequired: true,
      logicalBackupNotPitr: true,
      failures,
    };
  }

  return {
    status: input.pitrEnabled === true ? "closed_for_continuous_with_pitr" : "closed_for_limited_automation",
    closedForLimitedAutomation: true,
    closedForContinuous: input.pitrEnabled === true,
    ownerApprovalRequired: input.pitrEnabled !== true,
    logicalBackupNotPitr: true,
    failures,
  };
}

export function buildMediaBackupRetentionPlan(input: {
  backups: Array<{
    backup_id: string;
    created_at: string;
    r2_object_prefix: string;
    restore_drill_passed?: boolean | null;
  }>;
  policy?: MediaBackupRetentionPolicy | null;
}): MediaBackupRetentionPlan {
  const policy = input.policy ?? MEDIA_BACKUP_DEFAULT_RETENTION_POLICY;
  const sorted = [...input.backups]
    .filter((backup) => toText(backup.backup_id))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const safeBackups = sorted.filter((backup) => isSafePrivateBackupPrefix(backup.r2_object_prefix));
  const keep = new Set(safeBackups.slice(0, Math.max(1, policy.keepLastDailyBackups)).map((backup) => backup.backup_id));
  const latestRestoreDrillPassed = safeBackups.find((backup) => backup.restore_drill_passed === true) ?? null;
  const deniedPublicBucketTargets = sorted
    .filter((backup) => !isSafePrivateBackupPrefix(backup.r2_object_prefix))
    .map((backup) => backup.backup_id);

  if (latestRestoreDrillPassed && policy.keepLatestRestoreDrillPassed) {
    keep.add(latestRestoreDrillPassed.backup_id);
  }

  return {
    keepBackupIds: [...keep],
    deleteCandidateBackupIds: safeBackups
      .filter((backup) => !keep.has(backup.backup_id))
      .map((backup) => backup.backup_id),
    latestRestoreDrillPassedBackupId: latestRestoreDrillPassed?.backup_id ?? null,
    deniedPublicBucketTargets,
    privateR2PrefixRoot: policy.privateR2PrefixRoot,
  };
}

export function sanitizeScheduledBackupProof<T>(value: T): T {
  return sanitizeMediaRecoveryProof(value);
}

export function buildMediaRecoveryBackupManifest(
  input: MediaRecoveryBackupManifest,
): MediaRecoveryBackupManifest {
  return {
    ...input,
    scope: "media_worker",
    r2_bucket_role: "private_backup",
    logical_backup_not_pitr: true,
    contains_secrets: false,
    public_bucket_used: false,
    production_rows_written: false,
  };
}

export function verifyMediaRecoveryBackupManifest(
  manifest: MediaRecoveryBackupManifest,
): MediaRecoveryBackupManifestVerification {
  const failures: string[] = [];

  if (!toText(manifest.backup_id)) failures.push("missing_backup_id");
  if (manifest.scope !== "media_worker") failures.push("invalid_scope");
  if (manifest.logical_backup_not_pitr !== true) failures.push("logical_backup_must_not_claim_pitr");
  if (manifest.contains_secrets !== false) failures.push("manifest_claims_or_contains_secrets");
  if (manifest.public_bucket_used !== false) failures.push("public_bucket_must_not_be_used");
  if (manifest.production_rows_written !== false) failures.push("production_rows_must_not_be_written");
  if (manifest.r2_bucket_role !== "private_backup") failures.push("backup_bucket_role_must_be_private_backup");
  if (!isSafePrivateBackupPrefix(manifest.r2_object_prefix)) failures.push("backup_prefix_must_be_private_media_worker_prefix");

  for (const tableName of ["media_transcode_jobs", "media_renditions"]) {
    if (!manifest.tables_included.includes(tableName)) failures.push(`missing_required_table:${tableName}`);
    if (typeof manifest.row_counts[tableName] !== "number") failures.push(`missing_row_count:${tableName}`);
  }

  for (const fileName of manifest.artifact_files) {
    const objectKey = `${normalizeObjectPath(manifest.r2_object_prefix).replace(/\/?$/, "/")}${fileName}`;
    if (!isSafePrivateBackupPrefix(objectKey)) failures.push(`artifact_outside_private_backup_prefix:${fileName}`);
    if (!isValidSha256(manifest.sha256[fileName])) failures.push(`missing_or_invalid_sha256:${fileName}`);
  }

  const serialized = JSON.stringify(manifest);
  if (isSecretLikeText(serialized)) failures.push("manifest_contains_secret_like_text");
  if (/media\.chillywoodstream\.com/i.test(serialized)) failures.push("backup_manifest_must_not_use_public_media_domain");
  if (/chillywood-media-public-playback-proof/i.test(serialized)) failures.push("backup_manifest_must_not_use_public_playback_bucket");

  return {
    valid: failures.length === 0,
    failures,
    logicalBackupNotPitr: manifest.logical_backup_not_pitr === true,
    publicBucketUsed: manifest.public_bucket_used,
    containsSecrets: manifest.contains_secrets,
    privateBackupPrefix: isSafePrivateBackupPrefix(manifest.r2_object_prefix),
  };
}

export function resolveMediaWorkerBackupGate(
  input: MediaWorkerBackupGateInput,
): MediaWorkerBackupGateResult {
  const failures: string[] = [];
  if (!input.manifest) failures.push("missing_backup");
  if (!input.manifestVerified) failures.push("backup_manifest_not_verified");
  if (!input.checksumReadbackPassed) failures.push("backup_checksum_readback_missing");

  const backupTime = Date.parse(input.backupCreatedAt);
  const nowTime = Date.parse(input.now);
  const maxAgeMillis = Math.max(0, input.maxBackupAgeHours) * 60 * 60 * 1000;
  const stale = !Number.isFinite(backupTime)
    || !Number.isFinite(nowTime)
    || (maxAgeMillis > 0 && nowTime - backupTime > maxAgeMillis);

  if (!input.manifest) {
    return {
      status: "blocked_missing_backup",
      closedForOneJob: false,
      closedForContinuous: false,
      ownerAcceptanceRequired: true,
      logicalBackupNotPitr: true,
      failures,
    };
  }

  if (stale) {
    return {
      status: "blocked_stale_backup",
      closedForOneJob: false,
      closedForContinuous: false,
      ownerAcceptanceRequired: true,
      logicalBackupNotPitr: true,
      failures: [...failures, "backup_stale_or_invalid_timestamp"],
    };
  }

  if (!input.restoreDrillPassed || !input.rollbackDrillPassed) {
    return {
      status: "blocked_restore_drill_missing",
      closedForOneJob: false,
      closedForContinuous: false,
      ownerAcceptanceRequired: true,
      logicalBackupNotPitr: true,
      failures: [
        ...failures,
        !input.restoreDrillPassed ? "restore_drill_missing" : "",
        !input.rollbackDrillPassed ? "rollback_drill_missing" : "",
      ].filter(Boolean),
    };
  }

  if (input.continuousRequested) {
    if (input.pitrEnabled || input.scheduledRestoreSystemProved) {
      return {
        status: "closed_for_continuous",
        closedForOneJob: true,
        closedForContinuous: true,
        ownerAcceptanceRequired: false,
        logicalBackupNotPitr: true,
        failures,
      };
    }
    return {
      status: "blocked_pitr_required",
      closedForOneJob: true,
      closedForContinuous: false,
      ownerAcceptanceRequired: true,
      logicalBackupNotPitr: true,
      failures: [...failures, "continuous_requires_pitr_or_scheduled_restore_system"],
    };
  }

  if (!input.ownerAcceptedOneJobRisk || !input.operatorOneJobConstraintsPassed) {
    return {
      status: "one_job_owner_override_available",
      closedForOneJob: false,
      closedForContinuous: false,
      ownerAcceptanceRequired: true,
      logicalBackupNotPitr: true,
      failures,
    };
  }

  return {
    status: "closed_for_one_job",
    closedForOneJob: true,
    closedForContinuous: false,
    ownerAcceptanceRequired: false,
    logicalBackupNotPitr: true,
    failures,
  };
}

export function buildMediaWorkerRestoreDrillResult(
  input: Omit<MediaWorkerRestoreDrillResult, "rowCountsMatch" | "passed" | "productionDbTouched">,
): MediaWorkerRestoreDrillResult {
  const expected = input.rowCountsExpected;
  const restored = input.rowCountsRestored;
  const rowCountsMatch = Object.keys(expected).every((tableName) => expected[tableName] === restored[tableName]);

  return {
    ...input,
    rowCountsMatch,
    productionDbTouched: false,
    passed: rowCountsMatch
      && input.resolverSafeQueryPassed
      && input.unsafeRowsExcluded
      && input.restore_target === "disposable_db",
  };
}

export function buildMediaWorkerRollbackPlan(
  input: MediaWorkerRollbackPlanInput,
): MediaWorkerRollbackPlan {
  const batchId = toText(input.batchId);
  const exactR2Prefix = normalizeObjectPath(input.exactR2Prefix).replace(/\/?$/, "/");
  const batchRows = input.rows.filter((row) => row.batch_id === batchId);
  const preservedRows = input.rows.filter((row) => row.batch_id !== batchId);
  const failures: string[] = [];

  if (!batchId) failures.push("missing_batch_id");
  if (batchRows.length === 0) failures.push("no_rows_for_batch");
  if (typeof input.expectedRowCount === "number" && batchRows.length !== input.expectedRowCount) {
    failures.push("row_count_mismatch");
  }
  if (!exactR2Prefix.startsWith(PUBLIC_PREFIX)) failures.push("rollback_prefix_must_be_public_playback");
  if (hasBroadBackupOrRollbackPrefix(exactR2Prefix)) failures.push("rollback_prefix_too_broad");
  if (findForbiddenSegment(exactR2Prefix)) failures.push("rollback_prefix_contains_forbidden_segment");

  for (const row of batchRows) {
    if (row.is_original) failures.push(`original_or_master_rollback_denied:${row.id}`);
    if (row.visibility === "premium" || row.visibility === "private") {
      failures.push(`premium_or_private_rollback_denied:${row.id}`);
    }
    for (const rowPath of rowPlaybackPaths(row)) {
      if (!rowPath.startsWith(exactR2Prefix)) failures.push(`row_path_outside_exact_prefix:${row.id}`);
      const forbiddenSegment = findForbiddenSegment(rowPath);
      if (forbiddenSegment) failures.push(`row_path_contains_forbidden_segment:${row.id}:${forbiddenSegment}`);
    }
  }

  return {
    batch_id: batchId,
    exact_r2_prefix: exactR2Prefix,
    allowed: failures.length === 0,
    failures,
    affected_row_ids: batchRows.map((row) => row.id),
    preserved_row_ids: preservedRows.map((row) => row.id),
    delete_only_exact_prefix: true,
    revoke_resolver_trust: true,
    delete_private_origin_media: false,
  };
}

export function sanitizeMediaRecoveryProof<T>(value: T): T {
  const redact = (raw: unknown): unknown => {
    if (Array.isArray(raw)) return raw.map((entry) => redact(entry));
    if (raw && typeof raw === "object") {
      return Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).map(([key, entry]) => {
          if (
            key !== "noSecretsPrinted"
            && (/(^|_)(token|secret|password|authorization)($|_)/i.test(key)
              || /signed.*url|private.*url/i.test(key))
          ) {
            return [key, "redacted"];
          }
          return [key, redact(entry)];
        }),
      );
    }
    if (typeof raw === "string") {
      return raw
        .replace(new RegExp(`${"postgres"}(?:ql)?:\\/\\/[^\\s"']+`, "gi"), `${"postgresql"}://redacted`)
        .replace(/https:\/\/[^?\s"']+\?[^"\s']+/gi, "https://redacted-url")
        .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "redacted-jwt")
        .replace(new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`, "gi"), `X-Amz-${"Signature"}=redacted`);
    }
    return raw;
  };

  return redact(value) as T;
}

export function buildMediaRecoveryRollbackPlan(input: {
  batchId: string;
  exactR2Prefix: string;
  rows: MediaRecoveryAuditRow[];
}): MediaRecoveryRollbackPlan {
  return {
    batch_id: input.batchId,
    exact_r2_prefix: normalizeObjectPath(input.exactR2Prefix),
    row_ids: input.rows.map((row) => row.id),
    delete_only_exact_prefix: true,
    revoke_resolver_trust: true,
    delete_private_origin_media: false,
  };
}

export function auditMediaRecoveryBatch(
  input: MediaRecoveryAuditInput,
): MediaRecoveryAuditResult {
  const batchId = toText(input.batchId);
  const sourceId = toText(input.sourceId);
  const exactR2Prefix = normalizeObjectPath(input.exactR2Prefix);
  const rows = input.rows.filter((row) => row.batch_id === batchId);
  const failures: string[] = [];

  if (rows.length !== input.expectedRowCount) {
    failures.push("row_count_mismatch");
  }

  for (const row of rows) {
    if (row.source_id !== sourceId) failures.push(`source_id_mismatch:${row.id}`);
    if (row.resolver_ready === true) failures.push(`unexpected_ready_row_before_audit:${row.id}`);
    if (row.worker_status !== "pending_audit") failures.push(`row_not_pending_audit:${row.id}`);
    if (row.is_original === true) failures.push(`original_or_master_public_playback_blocked:${row.id}`);
    if (row.visibility === "premium" || row.visibility === "private") {
      failures.push(`premium_or_private_public_playback_blocked:${row.id}`);
    }
    if (row.bucket_role !== "public_playback") failures.push(`wrong_bucket_role:${row.id}`);
    if (row.is_public_playback_safe !== true) failures.push(`not_public_playback_safe:${row.id}`);
    if (!ALLOWED_SCAN_STATUSES.has(toLowerText(row.scan_status))) failures.push(`scan_not_clean:${row.id}`);
    if (!ALLOWED_MODERATION_STATUSES.has(toLowerText(row.moderation_status))) {
      failures.push(`moderation_not_allowed:${row.id}`);
    }

    for (const path of rowPlaybackPaths(row)) {
      if (!path.startsWith(PUBLIC_PREFIX)) failures.push(`non_public_playback_prefix:${row.id}`);
      if (!path.startsWith(exactR2Prefix)) failures.push(`outside_exact_r2_prefix:${row.id}`);
      const forbiddenSegment = findForbiddenSegment(path);
      if (forbiddenSegment) failures.push(`forbidden_private_prefix:${row.id}:${forbiddenSegment}`);
    }
  }

  const passed = failures.length === 0;
  return {
    batch_id: batchId,
    source_id: sourceId,
    passed,
    state: passed ? "passed" : "quarantined",
    resolverTrustAllowed: passed,
    checkedRowCount: rows.length,
    expectedRowCount: input.expectedRowCount,
    failures,
    rollbackPlan: buildMediaRecoveryRollbackPlan({
      batchId,
      exactR2Prefix,
      rows,
    }),
  };
}

export function canResolverTrustAuditedRows(
  result: MediaRecoveryAuditResult,
): boolean {
  return result.passed === true
    && result.resolverTrustAllowed === true
    && result.failures.length === 0
    && result.checkedRowCount === result.expectedRowCount;
}

export function applyMediaRecoveryAuditResult(
  row: MediaRecoveryAuditRow,
  result: MediaRecoveryAuditResult,
): MediaRecoveryAuditRow {
  if (!result.passed) {
    return {
      ...row,
      worker_status: "quarantined",
      resolver_ready: false,
    };
  }

  return {
    ...row,
    worker_status: "audit_passed",
    resolver_ready: true,
  };
}
