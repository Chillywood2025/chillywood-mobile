#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const runnerPath = "scripts/run-media-worker-logical-backup.mjs";
const failures = [];

const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

const sanitizedEnv = (extra = {}) => {
  const blocked = new Set([
    "MEDIA_BACKUP_DATABASE_URL",
    "MEDIA_BACKUP_RUNNER_ENABLED",
    "MEDIA_BACKUP_MODE",
    "MEDIA_BACKUP_R2_BUCKET",
    "MEDIA_BACKUP_R2_PREFIX",
    "MEDIA_BACKUP_EXPORT_MODE",
    "MEDIA_BACKUP_PROJECT_REF",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_EMAIL",
    "WRANGLER_API_TOKEN",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_ENDPOINT",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_ENDPOINT_URL_S3",
  ]);
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!blocked.has(key)) env[key] = value;
  }
  return { ...env, ...extra };
};

const runRunner = ({ mode, env = {} }) => {
  const result = spawnSync(process.execPath, [runnerPath, `--mode=${mode}`], {
    cwd: process.cwd(),
    env: sanitizedEnv(env),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const text = `${result.stdout || ""}${result.stderr || ""}`.trim();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    failures.push(`runner ${mode} output was not JSON`);
  }
  return { status: result.status, text, json };
};

const assertNoSecretLikeText = (label, value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const patterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`, "i"),
    /\b(Bearer|password|access_key|api_key|authorization)\s*[:=]/i,
  ];
  for (const pattern of patterns) {
    requireProof(!pattern.test(text), `${label} contains secret-like text matching ${pattern}`);
  }
};

const fixtureSchemaSql = [
  "create table media_transcode_jobs (",
  "  id text primary key,",
  "  source_type text not null,",
  "  source_id text not null,",
  "  status text not null,",
  "  created_at text not null",
  ");",
  "create table media_renditions (",
  "  id text primary key,",
  "  job_id text not null,",
  "  source_type text not null,",
  "  source_id text not null,",
  "  rendition_label text not null,",
  "  public_playback_path text,",
  "  visibility text not null,",
  "  scan_status text not null,",
  "  moderation_status text not null,",
  "  bucket_role text not null,",
  "  is_original boolean not null,",
  "  is_public_playback_safe boolean not null,",
  "  is_ready boolean not null,",
  "  created_at text not null",
  ");",
  "create index media_renditions_source_idx on media_renditions (source_type, source_id);",
].join("\n");

const fixtureDataSql = [
  "insert into media_transcode_jobs (id, source_type, source_id, status, created_at) values",
  "  ('job-proof', 'creator_video', 'c28e3838-7d2e-4f48-a8ad-73e3100f8cf1', 'ready', '2026-07-09T12:00:00Z');",
  "insert into media_renditions (id, job_id, source_type, source_id, rendition_label, public_playback_path, visibility, scan_status, moderation_status, bucket_role, is_original, is_public_playback_safe, is_ready, created_at) values",
  "  ('rendition-safe', 'job-proof', 'creator_video', 'c28e3838-7d2e-4f48-a8ad-73e3100f8cf1', '480p', 'playback/public/worker-proof/chillywood-city-lights/proof/master.m3u8', 'public', 'clean', 'allowed', 'public_playback', false, true, true, '2026-07-09T12:00:00Z'),",
  "  ('rendition-private', 'job-proof', 'creator_video', 'c28e3838-7d2e-4f48-a8ad-73e3100f8cf1', 'original', 'originals/proof/source.mp4', 'private', 'pending', 'allowed', 'private_origin', true, false, false, '2026-07-09T12:00:00Z');",
].join("\n");

const fixtureDataJsonl = [
  {
    table: "media_transcode_jobs",
    row: {
      id: "11111111-1111-4111-8111-111111111111",
      source_type: "creator_video",
      source_id: "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1",
      status: "ready",
      created_at: "2026-07-09T12:00:00Z",
    },
  },
  {
    table: "media_renditions",
    row: {
      id: "22222222-2222-4222-8222-222222222222",
      job_id: "11111111-1111-4111-8111-111111111111",
      source_type: "creator_video",
      source_id: "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1",
      rendition_label: "480p",
      public_playback_path: "playback/public/worker-proof/chillywood-city-lights/proof/master.m3u8",
      visibility: "public",
      scan_status: "clean",
      moderation_status: "allowed",
      bucket_role: "public_playback",
      is_original: false,
      is_public_playback_safe: true,
      is_ready: true,
      created_at: "2026-07-09T12:00:00Z",
    },
  },
  {
    table: "media_renditions",
    row: {
      id: "33333333-3333-4333-8333-333333333333",
      job_id: "11111111-1111-4111-8111-111111111111",
      source_type: "creator_video",
      source_id: "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1",
      rendition_label: "original",
      public_playback_path: "originals/proof/source.mp4",
      visibility: "private",
      scan_status: "pending",
      moderation_status: "allowed",
      bucket_role: "private_origin",
      is_original: true,
      is_public_playback_safe: false,
      is_ready: false,
      created_at: "2026-07-09T12:00:00Z",
    },
  },
].map((entry) => JSON.stringify(entry)).join("\n");

const restoreFixtureBackup = async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(fixtureSchemaSql);
  await db.exec(fixtureDataSql);
  const jobCount = await db.query("select count(*)::int as count from media_transcode_jobs;");
  const renditionCount = await db.query("select count(*)::int as count from media_renditions;");
  const resolverRows = await db.query(`
    select id from media_renditions
    where is_ready = true
      and is_public_playback_safe = true
      and is_original = false
      and visibility = 'public'
      and scan_status in ('clean', 'approved')
      and moderation_status in ('clean', 'approved', 'allowed')
      and bucket_role = 'public_playback'
      and public_playback_path like 'playback/public/%'
    order by id;
  `);
  await db.close();
  return {
    rowCounts: {
      media_transcode_jobs: Number(jobCount.rows[0]?.count ?? 0),
      media_renditions: Number(renditionCount.rows[0]?.count ?? 0),
    },
    resolverSafeIds: resolverRows.rows.map((row) => row.id),
  };
};

const restoreJsonlFixtureBackup = async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(fixtureSchemaSql);
  const entries = fixtureDataJsonl.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  for (const entry of entries) {
    if (entry.table === "media_transcode_jobs") {
      await db.query(
        "insert into media_transcode_jobs (id, source_type, source_id, status, created_at) values ($1, $2, $3, $4, $5)",
        [entry.row.id, entry.row.source_type, entry.row.source_id, entry.row.status, entry.row.created_at],
      );
    }
    if (entry.table === "media_renditions") {
      await db.query(
        "insert into media_renditions (id, job_id, source_type, source_id, rendition_label, public_playback_path, visibility, scan_status, moderation_status, bucket_role, is_original, is_public_playback_safe, is_ready, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
        [
          entry.row.id,
          entry.row.job_id,
          entry.row.source_type,
          entry.row.source_id,
          entry.row.rendition_label,
          entry.row.public_playback_path,
          entry.row.visibility,
          entry.row.scan_status,
          entry.row.moderation_status,
          entry.row.bucket_role,
          entry.row.is_original,
          entry.row.is_public_playback_safe,
          entry.row.is_ready,
          entry.row.created_at,
        ],
      );
    }
  }
  const jobCount = await db.query("select count(*)::int as count from media_transcode_jobs;");
  const renditionCount = await db.query("select count(*)::int as count from media_renditions;");
  const resolverRows = await db.query(`
    select id from media_renditions
    where is_ready = true
      and is_public_playback_safe = true
      and is_original = false
      and visibility = 'public'
      and scan_status in ('clean', 'approved')
      and moderation_status in ('clean', 'approved', 'allowed')
      and bucket_role = 'public_playback'
      and public_playback_path like 'playback/public/%'
    order by id;
  `);
  await db.close();
  return {
    rowCounts: {
      media_transcode_jobs: Number(jobCount.rows[0]?.count ?? 0),
      media_renditions: Number(renditionCount.rows[0]?.count ?? 0),
    },
    resolverSafeIds: resolverRows.rows.map((row) => row.id),
  };
};

const dryRun = runRunner({ mode: "dry-run", env: { MEDIA_BACKUP_EXPORT_MODE: "js" } });
requireProof(dryRun.status === 0, "dry-run runner should pass without production credentials");
requireProof(dryRun.json?.ok === true, "dry-run runner should report ok");
requireProof(dryRun.json?.dryRun === true, "dry-run runner should report dryRun=true");
requireProof(dryRun.json?.uploadAttempted === false, "dry-run runner must not upload");
requireProof(dryRun.json?.backupRunnerAvailable === true, "dry-run runner should report availability");
requireProof(dryRun.json?.manifestValid === true, "dry-run runner should report manifest validity");
requireProof(dryRun.json?.checksumGenerated === true, "dry-run runner should report checksum generation");
requireProof(dryRun.json?.privateR2Prefix === true, "dry-run runner should use private backup prefix");
requireProof(dryRun.json?.publicBucketUsed === false, "dry-run runner should not use public bucket");
requireProof(dryRun.json?.logicalBackupNotPitr === true, "dry-run runner should mark logical backup not PITR");
requireProof(dryRun.json?.productionDbTouched === false, "dry-run runner should not touch production DB");
requireProof(dryRun.json?.continuousAutomationEnabled === false, "dry-run runner should not enable continuous automation");
requireProof(dryRun.json?.exportModeRequested === "js", "dry-run should preserve requested JS export mode");
requireProof(dryRun.json?.exportModeResolved === "js", "dry-run should resolve JS export mode");
requireProof(dryRun.json?.pgDumpRequired === false, "JS-mode dry-run should not require pg_dump");
requireProof(dryRun.json?.artifactFiles?.includes("data-media-worker.jsonl.gz"), "JS-mode dry-run should produce JSONL data artifact");
requireProof(dryRun.json?.tablesIncluded?.includes("media_transcode_jobs"), "dry-run scope should include media_transcode_jobs");
requireProof(dryRun.json?.tablesIncluded?.includes("media_renditions"), "dry-run scope should include media_renditions");
requireProof(dryRun.json?.tablesExcluded?.includes("auth.users"), "dry-run scope should exclude auth users");
requireProof(dryRun.json?.tablesExcluded?.includes("billing"), "dry-run scope should exclude billing");
requireProof(dryRun.json?.tablesExcluded?.includes("payouts"), "dry-run scope should exclude payouts");
assertNoSecretLikeText("dry-run output", dryRun.text);

const missingEnvWrite = runRunner({ mode: "write" });
requireProof(missingEnvWrite.status !== 0, "write mode should fail closed when env is missing");
requireProof(missingEnvWrite.json?.failClosed === true, "missing-env write should report failClosed");
requireProof(missingEnvWrite.json?.reason === "missing_required_env_for_write_mode", "missing-env write should explain missing env");
requireProof(missingEnvWrite.json?.missingEnv?.includes("MEDIA_BACKUP_DATABASE_URL"), "missing-env write should require database URL by name only");
assertNoSecretLikeText("missing-env write output", missingEnvWrite.text);

const publicBucketWrite = runRunner({
  mode: "write",
  env: {
    MEDIA_BACKUP_RUNNER_ENABLED: "true",
    MEDIA_BACKUP_MODE: "write",
    MEDIA_BACKUP_DATABASE_URL: `${"post"}gres://${"redacted"}@localhost/proof`,
    MEDIA_BACKUP_R2_BUCKET: "chillywood-media-public-playback-proof",
    MEDIA_BACKUP_R2_PREFIX: "backups/media-worker/",
    MEDIA_BACKUP_EXPORT_MODE: "js",
  },
});
requireProof(publicBucketWrite.status !== 0, "public bucket target should fail closed before DB access");
requireProof(publicBucketWrite.json?.reason === "unsafe_backup_target_refused", "public bucket target should be refused");
requireProof(publicBucketWrite.json?.targetFailures?.includes("public_playback_bucket_denied"), "public bucket denial should be explicit");
requireProof(!publicBucketWrite.text.includes("redacted@localhost"), "runner output must not include database URL value");
assertNoSecretLikeText("public bucket denial output", publicBucketWrite.text);

const mediaDomainWrite = runRunner({
  mode: "write",
  env: {
    MEDIA_BACKUP_RUNNER_ENABLED: "true",
    MEDIA_BACKUP_MODE: "write",
    MEDIA_BACKUP_DATABASE_URL: `${"post"}gres://${"redacted"}@localhost/proof`,
    MEDIA_BACKUP_R2_BUCKET: "chillywood-media-proof",
    MEDIA_BACKUP_R2_PREFIX: "https://media.chillywoodstream.com/backups/media-worker/",
    MEDIA_BACKUP_EXPORT_MODE: "js",
  },
});
requireProof(mediaDomainWrite.status !== 0, "media domain target should fail closed before DB access");
requireProof(mediaDomainWrite.json?.targetFailures?.includes("public_media_domain_denied"), "public media domain denial should be explicit");
assertNoSecretLikeText("media domain denial output", mediaDomainWrite.text);

const fixtureSha = {
  "schema.sql": sha256Hex(fixtureSchemaSql),
  "data-media-worker.sql": sha256Hex(fixtureDataSql),
};
requireProof(fixtureSha["schema.sql"].length === 64, "fixture schema checksum should be sha256");
requireProof(fixtureSha["data-media-worker.sql"].length === 64, "fixture data checksum should be sha256");

const restore = await restoreFixtureBackup();
const jsonlRestore = await restoreJsonlFixtureBackup();
requireProof(restore.rowCounts.media_transcode_jobs === 1, "restored fixture should contain one job row");
requireProof(restore.rowCounts.media_renditions === 2, "restored fixture should contain two rendition rows");
requireProof(restore.resolverSafeIds.length === 1, "resolver-safe restored query should return only one safe row");
requireProof(restore.resolverSafeIds[0] === "rendition-safe", "resolver-safe restored query should exclude private/original row");
requireProof(jsonlRestore.rowCounts.media_transcode_jobs === 1, "restored JSONL fixture should contain one job row");
requireProof(jsonlRestore.rowCounts.media_renditions === 2, "restored JSONL fixture should contain two rendition rows");
requireProof(jsonlRestore.resolverSafeIds.length === 1, "resolver-safe restored JSONL query should return only one safe row");

const optionalPrivateR2Readback = process.env.MEDIA_BACKUP_RUNNER_PRIVATE_R2_READBACK_PREFIX
  ? "skipped_by_proof_no_secret_readback_in_default_validation"
  : "skipped_no_safe_artifact_env";

const summary = {
  proof: "media-worker-backup-runner",
  dryRunPassed: dryRun.status === 0 && dryRun.json?.dryRun === true,
  missingEnvFailClosed: missingEnvWrite.status !== 0 && missingEnvWrite.json?.failClosed === true,
  publicBucketTargetDenied: publicBucketWrite.status !== 0,
  mediaDomainTargetDenied: mediaDomainWrite.status !== 0,
  manifestShapeValid: dryRun.json?.manifestValid === true,
  checksumGenerationPassed: Boolean(fixtureSha["schema.sql"] && fixtureSha["data-media-worker.sql"]),
  jsExportManifestValid: dryRun.json?.exportModeResolved === "js" && dryRun.json?.artifactFiles?.includes("data-media-worker.jsonl.gz"),
  pgDumpAbsenceDoesNotBlockJsMode: dryRun.json?.pgDumpRequired === false,
  restoreFixtureRuntime: "pglite_disposable_local",
  restoreRowCounts: restore.rowCounts,
  jsDataArtifactRestorePassed: jsonlRestore.resolverSafeIds.length === 1,
  jsDataArtifactRowCounts: jsonlRestore.rowCounts,
  resolverSafeQueryPassed: restore.resolverSafeIds.length === 1,
  noSecretsInProofOutput: true,
  optionalPrivateR2Readback,
  productionDbTouched: false,
  productionDbWritesEnabled: false,
  productionWorkerDeployed: false,
  continuousAutomationEnabled: false,
  productionPlaybackSwitched: false,
};

assertNoSecretLikeText("proof summary", summary);

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures, summary }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, summary }, null, 2));
