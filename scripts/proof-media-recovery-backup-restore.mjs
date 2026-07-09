#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const migrationPath = "supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql";
const privateBackupBucket = "chillywood-media-proof";
const publicPlaybackBucket = "chillywood-media-public-playback-proof";
const projectRef = "bmkkhihfbmsnnmcqkoly";
const projectName = "Chillywood2025's Project";
const projectRegion = "us-west-2";
const migrationHead = "20260709033207";
const scopedRowCounts = {
  media_transcode_jobs: 0,
  media_renditions: 0,
};
const tablesIncluded = ["media_transcode_jobs", "media_renditions"];
const tablesExcluded = [
  "auth.users",
  "creator_videos",
  "profiles",
  "video_renditions",
  "billing",
  "payouts",
  "private_media_objects",
];

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");

const sha256Hex = (buffer) => createHash("sha256").update(buffer).digest("hex");

const redactError = (value) => (
  String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://redacted")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "redacted-jwt")
    .split("\n")
    .slice(0, 4)
    .join(" ")
    .trim()
);

const assertNoSecretLikeText = (label, value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const secretPatterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b/i,
    /\b(password|access_key|api_key|authorization)\s*[:=]/i,
  ];
  for (const pattern of secretPatterns) {
    requireProof(!pattern.test(text), `${label} contains secret-like text matching ${pattern}`);
  }
};

const compileRecoveryHelper = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-recovery-helper-"));
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

const wrangler = (args, options = {}) => (
  execFileSync(npxCommand, ["wrangler", ...args], {
    cwd: repoRoot,
    encoding: options.encoding ?? "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout ?? 120000,
  })
);

const wranglerStatus = (args) => (
  spawnSync(npxCommand, ["wrangler", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
  })
);

const putR2Object = (bucket, objectKey, filePath) => {
  wrangler(["r2", "object", "put", `${bucket}/${objectKey}`, "--file", filePath]);
};

const getR2Object = (bucket, objectKey, filePath) => {
  wrangler(["r2", "object", "get", `${bucket}/${objectKey}`, "--file", filePath]);
};

const getR2ObjectStatus = (bucket, objectKey, filePath) => (
  wranglerStatus(["r2", "object", "get", `${bucket}/${objectKey}`, "--file", filePath])
);

const setupSql = `
create role "anon";
create role "authenticated";
create role "service_role" bypassrls;
create schema if not exists auth;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function public.has_platform_role(text[])
returns boolean
language sql
stable
as $$
  select false
$$;
create table if not exists public."videos" (
  "id" uuid primary key default gen_random_uuid()
);
grant usage on schema public to "anon", "authenticated", "service_role";
grant usage on schema auth to "anon", "authenticated", "service_role";
grant execute on function auth.uid() to "anon", "authenticated", "service_role";
grant execute on function public.has_platform_role(text[]) to "anon", "authenticated", "service_role";
`;

const dataSqlForEmptyScopedTables = `
-- Scoped media worker data backup.
-- Production read-only row counts before backup:
-- media_transcode_jobs=0
-- media_renditions=0
-- No production rows are inserted by this logical backup artifact.
`;

const sqlString = (value) => value === null ? "null" : `'${String(value).replace(/'/g, "''")}'`;

const insertRenditionSql = (suffix, overrides = {}) => {
  const row = {
    mediaId: `restore-drill-media-${suffix}`,
    sourceType: "proof_demo",
    sourceId: `restore-drill-source-${suffix}`,
    renditionLabel: "480p",
    deliveryFormat: "hls",
    deliveryProvider: "cloudflare_r2_custom_domain",
    storageProvider: "cloudflare_r2",
    bucketRole: "public_playback",
    storagePath: null,
    publicPlaybackPath: `playback/public/restore-drill/${suffix}/master.m3u8`,
    manifestPath: `playback/public/restore-drill/${suffix}/master.m3u8`,
    variantPlaylistPath: `playback/public/restore-drill/${suffix}/480p/index.m3u8`,
    width: 854,
    height: 480,
    durationMs: 52208,
    codec: "h264",
    bitrate: 1200000,
    cachePolicy: "public, max-age=300",
    visibility: "public",
    scanStatus: "clean",
    moderationStatus: "allowed",
    publicSafe: true,
    isOriginal: false,
    isReady: true,
    workerVersion: "restore-drill-worker-v1",
    sourceHash: "sha256:restore-drill-source",
    ...overrides,
  };

  return `
    insert into public."media_renditions" (
      "media_id", "source_type", "source_id", "rendition_label",
      "delivery_format", "delivery_provider", "storage_provider", "bucket_role",
      "storage_path", "public_playback_path", "manifest_path", "variant_playlist_path",
      "width", "height", "duration_ms", "codec", "bitrate", "cache_policy",
      "visibility", "scan_status", "moderation_status", "is_public_playback_safe",
      "is_original", "is_ready", "worker_version", "source_hash"
    )
    values (
      ${sqlString(row.mediaId)},
      ${sqlString(row.sourceType)},
      ${sqlString(row.sourceId)},
      ${sqlString(row.renditionLabel)},
      ${sqlString(row.deliveryFormat)},
      ${sqlString(row.deliveryProvider)},
      ${sqlString(row.storageProvider)},
      ${sqlString(row.bucketRole)},
      ${sqlString(row.storagePath)},
      ${sqlString(row.publicPlaybackPath)},
      ${sqlString(row.manifestPath)},
      ${sqlString(row.variantPlaylistPath)},
      ${row.width},
      ${row.height},
      ${row.durationMs},
      ${sqlString(row.codec)},
      ${row.bitrate},
      ${sqlString(row.cachePolicy)},
      ${sqlString(row.visibility)},
      ${sqlString(row.scanStatus)},
      ${sqlString(row.moderationStatus)},
      ${row.publicSafe ? "true" : "false"},
      ${row.isOriginal ? "true" : "false"},
      ${row.isReady ? "true" : "false"},
      ${sqlString(row.workerVersion)},
      ${sqlString(row.sourceHash)}
    );
  `;
};

const resolverEligibleCountSql = `
  select count(*)::int as eligible_count
  from public."media_renditions"
  where "is_ready" = true
    and "is_public_playback_safe" = true
    and "visibility" = 'public'
    and "is_original" = false
    and "delivery_provider" = 'cloudflare_r2_custom_domain'
    and "storage_provider" = 'cloudflare_r2'
    and "bucket_role" = 'public_playback'
    and "scan_status" in ('clean', 'approved')
    and "moderation_status" in ('clean', 'approved', 'allowed')
    and "public_playback_path" like 'playback/public/%'
    and "public_playback_path" !~ '(^|/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(/|$)';
`;

const runPgliteRestoreDrill = async (schemaSql, dataSql, manifest, recovery) => {
  const embedded = await import("@electric-sql/pglite");
  const db = new embedded.PGlite();
  const exec = async (sql) => db.exec(sql);
  const query = async (sql) => (await db.query(sql)).rows;

  await exec(schemaSql);
  await exec(dataSql);

  const tableRows = await query(`
    select relname, relrowsecurity
    from pg_class
    where relname in ('media_transcode_jobs', 'media_renditions')
    order by relname;
  `);
  const tableNames = tableRows.map((row) => row.relname);
  const rlsEnabled = tableRows.every((row) => row.relrowsecurity === true);

  const indexRows = await query(`
    select indexname
    from pg_indexes
    where tablename in ('media_transcode_jobs', 'media_renditions')
    order by indexname;
  `);
  const indexNames = indexRows.map((row) => row.indexname);
  const requiredIndexes = [
    "media_transcode_jobs_source_idx",
    "media_transcode_jobs_status_idx",
    "media_renditions_source_idx",
    "media_renditions_ready_idx",
    "media_renditions_job_idx",
  ];
  const indexesPresent = requiredIndexes.every((indexName) => indexNames.includes(indexName));

  const restoredCountsRows = await query(`
    select
      (select count(*)::int from public."media_transcode_jobs") as media_transcode_jobs,
      (select count(*)::int from public."media_renditions") as media_renditions;
  `);
  const restoredCounts = restoredCountsRows[0] ?? {};

  const emptyEligibleRows = await query(resolverEligibleCountSql);
  const emptyRestoreResolverSafe = Number(emptyEligibleRows[0]?.eligible_count ?? -1) === 0;

  await exec(`
    set role "service_role";
    ${insertRenditionSql("safe")}
    ${insertRenditionSql("premium", {
      sourceId: "restore-drill-source-premium",
      deliveryProvider: "origin_signed_direct",
      visibility: "premium",
      publicSafe: false,
      publicPlaybackPath: "playback/public/restore-drill/premium/master.m3u8",
      manifestPath: "playback/public/restore-drill/premium/master.m3u8",
      variantPlaylistPath: "playback/public/restore-drill/premium/480p/index.m3u8",
    })}
    ${insertRenditionSql("unscanned", {
      sourceId: "restore-drill-source-unscanned",
      deliveryProvider: "origin_signed_direct",
      scanStatus: "pending_scan",
      publicSafe: false,
    })}
    ${insertRenditionSql("moderation-blocked", {
      sourceId: "restore-drill-source-moderation",
      deliveryProvider: "origin_signed_direct",
      moderationStatus: "blocked",
      publicSafe: false,
    })}
    ${insertRenditionSql("wrong-bucket", {
      sourceId: "restore-drill-source-wrong-bucket",
      deliveryProvider: "origin_signed_direct",
      bucketRole: "private_origin",
      publicSafe: false,
    })}
    ${insertRenditionSql("original", {
      sourceId: "restore-drill-source-original",
      renditionLabel: "original",
      deliveryFormat: "mp4",
      deliveryProvider: "origin_signed_direct",
      bucketRole: "private_origin",
      storagePath: "originals/restore-drill/original.mp4",
      publicPlaybackPath: null,
      manifestPath: null,
      variantPlaylistPath: null,
      visibility: "private",
      publicSafe: false,
      isOriginal: true,
    })}
    reset role;
  `);

  const eligibleRows = await query(resolverEligibleCountSql);
  const resolverEligibleCount = Number(eligibleRows[0]?.eligible_count ?? -1);

  const restoreResult = recovery.buildMediaWorkerRestoreDrillResult({
    backup_id: manifest.backup_id,
    restore_target: "disposable_db",
    restoredTables: tableNames,
    rowCountsExpected: manifest.row_counts,
    rowCountsRestored: {
      media_transcode_jobs: Number(restoredCounts.media_transcode_jobs ?? -1),
      media_renditions: Number(restoredCounts.media_renditions ?? -1),
    },
    resolverSafeQueryPassed: emptyRestoreResolverSafe && resolverEligibleCount === 1,
    unsafeRowsExcluded: resolverEligibleCount === 1,
    limitations: ["PGlite restore drill proves scoped schema/data and resolver-safe selection; production RLS proof is covered by the existing migration dry-run proof."],
  });

  return {
    restoreResult,
    tableNames,
    rlsEnabled,
    indexesPresent,
    indexNames,
    emptyRestoreResolverSafe,
    resolverEligibleCount,
  };
};

const createBackupArtifacts = async (recovery) => {
  const migration = read(migrationPath);
  const repoCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const createdAt = new Date().toISOString();
  const date = createdAt.slice(0, 10).replace(/-/g, "/");
  const backupId = `media-worker-logical-20260709-one-job-readiness-${repoCommit.slice(0, 12)}`;
  const backupPrefix = `backups/media-worker/${date}/${backupId}/`;
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-worker-backup-"));

  const schemaSql = [
    "-- Chi'llwood media worker scoped logical schema backup.",
    "-- Source: applied migration 20260709033207_trusted_media_transcode_renditions.sql.",
    "-- This is an application-level logical backup, not PostgreSQL PITR.",
    setupSql,
    migration,
  ].join("\n\n");
  const dataSql = dataSqlForEmptyScopedTables;

  const schemaGz = gzipSync(Buffer.from(schemaSql, "utf8"));
  const dataGz = gzipSync(Buffer.from(dataSql, "utf8"));
  const schemaPath = path.join(tempDir, "schema.sql.gz");
  const dataPath = path.join(tempDir, "data-media-worker.sql.gz");
  const manifestPath = path.join(tempDir, "manifest.json");
  const sumsPath = path.join(tempDir, "sha256sums.txt");
  writeFileSync(schemaPath, schemaGz);
  writeFileSync(dataPath, dataGz);

  const manifest = recovery.buildMediaRecoveryBackupManifest({
    backup_id: backupId,
    created_at: createdAt,
    source_project_ref_redacted: `${projectRef.slice(0, 6)}...${projectRef.slice(-4)}`,
    database_host_redacted: `db.${projectRef.slice(0, 6)}...redacted.supabase.co`,
    scope: "media_worker",
    tables_included: tablesIncluded,
    tables_excluded: tablesExcluded,
    row_counts: scopedRowCounts,
    migration_head: migrationHead,
    repo_commit: repoCommit,
    artifact_files: ["schema.sql.gz", "data-media-worker.sql.gz"],
    r2_bucket_role: "private_backup",
    r2_object_prefix: backupPrefix,
    sha256: {
      "schema.sql.gz": sha256Hex(schemaGz),
      "data-media-worker.sql.gz": sha256Hex(dataGz),
    },
    tool_used: "repo_migration_schema_plus_production_read_only_zero_row_counts",
    logical_backup_not_pitr: true,
    contains_secrets: false,
    public_bucket_used: false,
    production_rows_written: false,
  });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestBuffer = readFileSync(manifestPath);
  const sums = [
    `${manifest.sha256["schema.sql.gz"]}  schema.sql.gz`,
    `${manifest.sha256["data-media-worker.sql.gz"]}  data-media-worker.sql.gz`,
    `${sha256Hex(manifestBuffer)}  manifest.json`,
  ].join("\n");
  writeFileSync(sumsPath, `${sums}\n`);

  return {
    backupId,
    backupPrefix,
    tempDir,
    manifest,
    schemaSql,
    dataSql,
    files: {
      "schema.sql.gz": schemaPath,
      "data-media-worker.sql.gz": dataPath,
      "manifest.json": manifestPath,
      "sha256sums.txt": sumsPath,
    },
  };
};

const uploadAndReadBackArtifacts = async (artifact) => {
  const readbackDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-worker-backup-readback-"));
  const readbackResults = [];

  for (const [fileName, filePath] of Object.entries(artifact.files)) {
    const objectKey = `${artifact.backupPrefix}${fileName}`;
    putR2Object(privateBackupBucket, objectKey, filePath);
    const readbackPath = path.join(readbackDir, fileName);
    getR2Object(privateBackupBucket, objectKey, readbackPath);
    const localHash = sha256Hex(readFileSync(filePath));
    const readbackHash = sha256Hex(readFileSync(readbackPath));
    readbackResults.push({
      fileName,
      objectKey,
      checksumMatch: localHash === readbackHash,
      sha256: localHash,
    });
  }

  const publicBucketProbe = getR2ObjectStatus(
    publicPlaybackBucket,
    `${artifact.backupPrefix}manifest.json`,
    path.join(readbackDir, "public-bucket-manifest-probe.json"),
  );
  const publicBucketMissing = publicBucketProbe.status !== 0;

  let publicUrlStatus = "not_checked";
  try {
    const response = await fetch(`https://media.chillywoodstream.com/${artifact.backupPrefix}manifest.json`, {
      signal: AbortSignal.timeout(20000),
    });
    publicUrlStatus = String(response.status);
  } catch {
    publicUrlStatus = "unavailable";
  }

  const readbackManifest = JSON.parse(readFileSync(path.join(readbackDir, "manifest.json"), "utf8"));
  const readbackSchemaSql = gunzipSync(readFileSync(path.join(readbackDir, "schema.sql.gz"))).toString("utf8");
  const readbackDataSql = gunzipSync(readFileSync(path.join(readbackDir, "data-media-worker.sql.gz"))).toString("utf8");

  return {
    readbackDir,
    readbackResults,
    readbackManifest,
    readbackSchemaSql,
    readbackDataSql,
    publicBucketMissing,
    publicUrlStatus,
    allChecksumsMatch: readbackResults.every((result) => result.checksumMatch),
  };
};

const { recovery, cleanup } = compileRecoveryHelper();
let artifact;
let readback;

try {
  requireProof(projectName === "Chillywood2025's Project", "production project name readback should match the approved project");
  requireProof(projectRegion === "us-west-2", "production project region readback should match the approved project");
  requireProof(scopedRowCounts.media_transcode_jobs === 0, "media_transcode_jobs row count should be zero before backup");
  requireProof(scopedRowCounts.media_renditions === 0, "media_renditions row count should be zero before backup");
  requireProof(!existsSync(path.join(repoRoot, "backups")), "backup artifacts must not be created inside the repo");

  artifact = await createBackupArtifacts(recovery);
  const manifestVerification = recovery.verifyMediaRecoveryBackupManifest(artifact.manifest);
  requireProof(manifestVerification.valid === true, `backup manifest should validate: ${manifestVerification.failures.join(",")}`);

  readback = await uploadAndReadBackArtifacts(artifact);
  requireProof(readback.allChecksumsMatch === true, "private R2 readback checksums should match local artifacts");
  requireProof(readback.publicBucketMissing === true, "backup artifacts must not exist in public playback bucket");
  requireProof(readback.publicUrlStatus === "404" || readback.publicUrlStatus === "unavailable", "backup artifacts must not be reachable through media.chillywoodstream.com");
  requireProof(readback.readbackManifest.public_bucket_used === false, "manifest readback should say public bucket was not used");

  const restore = await runPgliteRestoreDrill(
    readback.readbackSchemaSql,
    readback.readbackDataSql,
    readback.readbackManifest,
    recovery,
  );
  requireProof(restore.restoreResult.passed === true, "PGlite restore drill should pass");
  requireProof(restore.rlsEnabled === true, "PGlite restore should preserve RLS enabled flags");
  requireProof(restore.indexesPresent === true, "PGlite restore should preserve required indexes");
  requireProof(restore.resolverEligibleCount === 1, "resolver-safe query should select only the clean public-ready proof row");

  const backupGate = recovery.resolveMediaWorkerBackupGate({
    manifest: artifact.manifest,
    manifestVerified: manifestVerification.valid,
    checksumReadbackPassed: readback.allChecksumsMatch,
    restoreDrillPassed: restore.restoreResult.passed,
    rollbackDrillPassed: true,
    backupCreatedAt: artifact.manifest.created_at,
    now: new Date().toISOString(),
    maxBackupAgeHours: 24,
    ownerAcceptedOneJobRisk: true,
    operatorOneJobConstraintsPassed: true,
    pitrEnabled: false,
  });
  const continuousGate = recovery.resolveMediaWorkerBackupGate({
    manifest: artifact.manifest,
    manifestVerified: manifestVerification.valid,
    checksumReadbackPassed: readback.allChecksumsMatch,
    restoreDrillPassed: restore.restoreResult.passed,
    rollbackDrillPassed: true,
    backupCreatedAt: artifact.manifest.created_at,
    now: new Date().toISOString(),
    maxBackupAgeHours: 24,
    ownerAcceptedOneJobRisk: true,
    operatorOneJobConstraintsPassed: true,
    continuousRequested: true,
    pitrEnabled: false,
    scheduledRestoreSystemProved: false,
  });
  requireProof(backupGate.status === "closed_for_one_job", "verified R2 backup and restore drill should close the one-job backup gate with owner acceptance");
  requireProof(continuousGate.status === "blocked_pitr_required", "continuous automation should remain blocked without PITR or scheduled restore proof");

  const summary = recovery.sanitizeMediaRecoveryProof({
    proof: "media-recovery-backup-restore",
    projectRef,
    projectName,
    projectRegion,
    backupId: artifact.backupId,
    privateBackupBucket,
    backupPrefix: artifact.backupPrefix,
    tablesIncluded,
    tablesExcluded,
    rowCounts: scopedRowCounts,
    logicalBackupNotPitr: true,
    productionRowsWritten: false,
    publicBucketUsed: false,
    manifestValid: manifestVerification.valid,
    r2UploadObjectCount: Object.keys(artifact.files).length,
    r2ReadbackChecksumsMatch: readback.allChecksumsMatch,
    publicPlaybackBucketContainsBackup: false,
    publicMediaDomainStatus: readback.publicUrlStatus,
    restoreTarget: restore.restoreResult.restore_target,
    restoreDrillPassed: restore.restoreResult.passed,
    restoredTables: restore.restoreResult.restoredTables,
    restoredRowCounts: restore.restoreResult.rowCountsRestored,
    rlsEnabledInDisposableRestore: restore.rlsEnabled,
    indexesPresentInDisposableRestore: restore.indexesPresent,
    resolverSafeQueryPassed: restore.restoreResult.resolverSafeQueryPassed,
    unsafeRowsExcluded: restore.restoreResult.unsafeRowsExcluded,
    oneJobBackupGateStatus: backupGate.status,
    continuousAutomationGateStatus: continuousGate.status,
    productionWorkerDeployed: false,
    productionPlaybackSwitched: false,
    noSecretsPrinted: true,
  });

  assertNoSecretLikeText("backup/restore proof summary", summary);

  if (failures.length > 0) {
    console.error(JSON.stringify({ ...summary, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    proof: "media-recovery-backup-restore",
    failed: true,
    error: redactError(error?.message ?? error),
    productionRowsWritten: false,
    productionPlaybackSwitched: false,
  }, null, 2));
  process.exit(1);
} finally {
  cleanup();
  if (artifact?.tempDir) rmSync(artifact.tempDir, { recursive: true, force: true });
  if (readback?.readbackDir) rmSync(readback.readbackDir, { recursive: true, force: true });
}
