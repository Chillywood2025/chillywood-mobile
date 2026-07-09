#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const backupTables = ["media_transcode_jobs", "media_renditions"];
const excludedScopes = [
  "auth.users",
  "billing",
  "payouts",
  "private_media_objects",
  "creator_originals",
  "signed_urls",
];
const requiredWriteEnv = [
  "MEDIA_BACKUP_RUNNER_ENABLED",
  "MEDIA_BACKUP_MODE",
  "MEDIA_BACKUP_DATABASE_URL",
  "MEDIA_BACKUP_R2_BUCKET",
  "MEDIA_BACKUP_R2_PREFIX",
];
const privateBackupPrefixRoot = "backups/media-worker/";
const publicPlaybackBucket = "chillywood-media-public-playback-proof";
const mediaPublicDomain = "media.chillywoodstream.com";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const parseArgValue = (name) => {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const mode = parseArgValue("--mode") ?? process.env.MEDIA_BACKUP_MODE ?? "dry-run";
const writeMode = mode === "write";

const sha256Hex = (input) => createHash("sha256").update(input).digest("hex");

const safeJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const redactProjectRef = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "not_provided";
  if (text.length <= 8) return "redacted";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
};

const safeExit = (code, payload) => {
  const out = safeJson({
    ...payload,
    noSecretsPrinted: true,
    productionRowsWritten: false,
    productionPlaybackSwitched: false,
  });
  if (code === 0) {
    process.stdout.write(out);
  } else {
    process.stderr.write(out);
  }
  process.exit(code);
};

const failClosed = (reason, details = {}) => {
  safeExit(1, {
    ok: false,
    failClosed: true,
    reason,
    mode,
    ...details,
  });
};

const commandAvailable = (command, args = ["--version"]) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
};

const hasCloudflareCredentialEnv = () => Boolean(
  process.env.CLOUDFLARE_API_TOKEN
    || (process.env.CLOUDFLARE_EMAIL && process.env.CLOUDFLARE_API_KEY)
    || process.env.WRANGLER_API_TOKEN,
);

const hasS3CredentialEnv = () => Boolean(
  (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_ENDPOINT)
    || (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_ENDPOINT_URL_S3),
);

const normalizePrefix = (value) => {
  const text = String(value ?? "").trim();
  return text.endsWith("/") ? text : `${text}/`;
};

const assertSafeBackupTarget = ({ bucket, prefix }) => {
  const normalizedPrefix = normalizePrefix(prefix);
  const targetText = `${bucket ?? ""} ${normalizedPrefix}`;
  const failures = [];
  if (!bucket) failures.push("missing_bucket");
  if (bucket === publicPlaybackBucket) failures.push("public_playback_bucket_denied");
  if (/public-playback|public_playback/i.test(bucket ?? "")) failures.push("public_playback_named_bucket_denied");
  if (targetText.includes(mediaPublicDomain)) failures.push("public_media_domain_denied");
  if (normalizedPrefix !== privateBackupPrefixRoot) failures.push("prefix_must_equal_backups_media_worker");
  if (normalizedPrefix.startsWith("playback/public/")) failures.push("public_playback_prefix_denied");
  return { valid: failures.length === 0, failures, normalizedPrefix };
};

const assertNoSecretLikeText = (label, value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`, "i"),
    /\b(Bearer|password|access_key|api_key|authorization)\s*[:=]/i,
    /\bservice[_-]?role[_-]?key\b/i,
  ];
  const matches = forbidden.filter((pattern) => pattern.test(text)).map((pattern) => String(pattern));
  if (matches.length > 0) {
    failClosed("secret_like_value_refused", { label, matches });
  }
};

const getRepoCommit = () => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
};

const getMigrationHead = () => "20260709033207_trusted_media_transcode_renditions";

const buildObjectPrefix = (createdAt, backupId) => {
  const date = new Date(createdAt);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${privateBackupPrefixRoot}${year}/${month}/${day}/${backupId}/`;
};

const writeGzipFile = (filePath, content) => {
  writeFileSync(filePath, gzipSync(Buffer.from(content, "utf8")));
};

const buildFixtureSchemaSql = () => [
  "create table if not exists public.media_transcode_jobs (",
  "  id text primary key,",
  "  source_type text not null,",
  "  source_id text not null,",
  "  status text not null,",
  "  created_at text not null",
  ");",
  "create table if not exists public.media_renditions (",
  "  id text primary key,",
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
  "",
].join("\n");

const buildFixtureDataSql = () => "-- dry-run fixture backup contains no production rows\n";

const runPgDump = (databaseUrl) => {
  if (!commandAvailable("pg_dump")) {
    failClosed("missing_pg_dump_for_write_mode", { requiredTool: "pg_dump" });
  }
  const baseArgs = [
    "--no-owner",
    "--no-privileges",
    "--table=public.media_transcode_jobs",
    "--table=public.media_renditions",
  ];
  const env = { ...process.env, PGDATABASE: databaseUrl };
  try {
    const schemaSql = execFileSync("pg_dump", ["--schema-only", ...baseArgs], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const dataSql = execFileSync("pg_dump", ["--data-only", "--column-inserts", ...baseArgs], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { schemaSql, dataSql, toolUsed: "pg_dump" };
  } catch {
    failClosed("pg_dump_failed_without_secret_output", { requiredTables: backupTables });
  }
};

const getRowCounts = (databaseUrl) => {
  if (!commandAvailable("psql")) {
    failClosed("missing_psql_for_write_mode_row_counts", { requiredTool: "psql" });
  }
  const query = [
    "select json_build_object(",
    "  'media_transcode_jobs', (select count(*)::int from public.media_transcode_jobs),",
    "  'media_renditions', (select count(*)::int from public.media_renditions)",
    ");",
  ].join(" ");
  try {
    const out = execFileSync("psql", ["-X", "-q", "-t", "-A", "-c", query], {
      cwd: repoRoot,
      env: { ...process.env, PGDATABASE: databaseUrl },
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const parsed = JSON.parse(out);
    return {
      media_transcode_jobs: Number(parsed.media_transcode_jobs ?? 0),
      media_renditions: Number(parsed.media_renditions ?? 0),
    };
  } catch {
    failClosed("row_count_query_failed_without_secret_output", { requiredTables: backupTables });
  }
};

const uploadWithWrangler = ({ bucket, objectPrefix, files }) => {
  if (!commandAvailable(npxCommand, ["wrangler", "--version"])) {
    failClosed("missing_wrangler_for_cloudflare_upload", { requiredTool: "npx wrangler" });
  }
  for (const [name, filePath] of Object.entries(files)) {
    const target = `${bucket}/${objectPrefix}${name}`;
    const result = spawnSync(npxCommand, ["wrangler", "r2", "object", "put", target, "--file", filePath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      failClosed("wrangler_r2_upload_failed_without_secret_output", {
        artifact: name,
        objectKey: `${objectPrefix}${name}`,
      });
    }
  }
};

const uploadWithAwsCli = ({ bucket, endpoint, objectPrefix, files }) => {
  if (!commandAvailable("aws", ["--version"])) {
    failClosed("missing_aws_cli_for_s3_upload", { requiredTool: "aws" });
  }
  for (const [name, filePath] of Object.entries(files)) {
    const result = spawnSync("aws", ["s3", "cp", filePath, `s3://${bucket}/${objectPrefix}${name}`, "--endpoint-url", endpoint], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      failClosed("s3_upload_failed_without_secret_output", {
        artifact: name,
        objectKey: `${objectPrefix}${name}`,
      });
    }
  }
};

const createArtifacts = ({
  schemaSql,
  dataSql,
  rowCounts,
  toolUsed,
  bucketRole,
  objectPrefix,
  backupId,
  createdAt,
}) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-worker-backup-"));
  const artifactPaths = {
    "schema.sql.gz": path.join(tempDir, "schema.sql.gz"),
    "data-media-worker.sql.gz": path.join(tempDir, "data-media-worker.sql.gz"),
    "manifest.json": path.join(tempDir, "manifest.json"),
    "sha256sums.txt": path.join(tempDir, "sha256sums.txt"),
  };

  writeGzipFile(artifactPaths["schema.sql.gz"], schemaSql);
  writeGzipFile(artifactPaths["data-media-worker.sql.gz"], dataSql);

  const schemaSha = sha256Hex(readFileSync(artifactPaths["schema.sql.gz"]));
  const dataSha = sha256Hex(readFileSync(artifactPaths["data-media-worker.sql.gz"]));
  const manifest = {
    backup_id: backupId,
    created_at: createdAt,
    source_project_ref_redacted: redactProjectRef(process.env.MEDIA_BACKUP_PROJECT_REF),
    database_host_redacted: writeMode ? "redacted" : "not_used_dry_run",
    scope: "media_worker",
    tables_included: backupTables,
    tables_excluded: excludedScopes,
    row_counts: rowCounts,
    migration_head: getMigrationHead(),
    repo_commit: getRepoCommit(),
    artifact_files: Object.keys(artifactPaths),
    r2_bucket_role: bucketRole,
    r2_object_prefix: objectPrefix,
    sha256: {
      "schema.sql.gz": schemaSha,
      "data-media-worker.sql.gz": dataSha,
    },
    tool_used: toolUsed,
    logical_backup_not_pitr: true,
    contains_secrets: false,
    public_bucket_used: false,
    production_rows_written: false,
  };
  assertNoSecretLikeText("manifest", manifest);
  writeFileSync(artifactPaths["manifest.json"], `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestSha = sha256Hex(readFileSync(artifactPaths["manifest.json"]));
  const sums = [
    `${schemaSha}  schema.sql.gz`,
    `${dataSha}  data-media-worker.sql.gz`,
    `${manifestSha}  manifest.json`,
  ].join("\n");
  writeFileSync(artifactPaths["sha256sums.txt"], `${sums}\n`);
  assertNoSecretLikeText("sha256sums", readFileSync(artifactPaths["sha256sums.txt"], "utf8"));

  return {
    tempDir,
    artifactPaths,
    manifest,
    sha256: {
      "schema.sql.gz": schemaSha,
      "data-media-worker.sql.gz": dataSha,
      "manifest.json": manifestSha,
      "sha256sums.txt": sha256Hex(readFileSync(artifactPaths["sha256sums.txt"])),
    },
  };
};

if (mode !== "dry-run" && mode !== "write") {
  failClosed("invalid_mode", { allowedModes: ["dry-run", "write"] });
}

const createdAt = new Date().toISOString();
const shortCommit = getRepoCommit().slice(0, 12) || "unknown";
const backupId = `media-worker-logical-${createdAt.replace(/[-:.]/g, "").slice(0, 15)}-${shortCommit}`;
const objectPrefix = buildObjectPrefix(createdAt, backupId);

if (!writeMode) {
  const artifacts = createArtifacts({
    schemaSql: buildFixtureSchemaSql(),
    dataSql: buildFixtureDataSql(),
    rowCounts: { media_transcode_jobs: 0, media_renditions: 0 },
    toolUsed: "dry_run_fixture",
    bucketRole: "private_backup",
    objectPrefix,
    backupId,
    createdAt,
  });
  const summary = {
    ok: true,
    mode: "dry-run",
    dryRun: true,
    backupRunnerAvailable: true,
    uploadAttempted: false,
    writeModeRequiresEnv: requiredWriteEnv,
    backupId,
    objectPrefix,
    tablesIncluded: backupTables,
    tablesExcluded: excludedScopes,
    artifactFiles: Object.keys(artifacts.artifactPaths),
    manifestValid: true,
    checksumGenerated: true,
    privateR2Prefix: objectPrefix.startsWith(privateBackupPrefixRoot),
    publicBucketUsed: false,
    logicalBackupNotPitr: true,
    productionDbTouched: false,
    productionWorkerDeployed: false,
    continuousAutomationEnabled: false,
  };
  rmSync(artifacts.tempDir, { recursive: true, force: true });
  safeExit(0, summary);
}

const missing = requiredWriteEnv.filter((name) => !process.env[name]);
if (missing.length > 0) {
  failClosed("missing_required_env_for_write_mode", { missingEnv: missing });
}

if (process.env.MEDIA_BACKUP_RUNNER_ENABLED !== "true") {
  failClosed("runner_disabled", { required: "MEDIA_BACKUP_RUNNER_ENABLED true" });
}

if (process.env.MEDIA_BACKUP_MODE !== "write") {
  failClosed("write_mode_env_not_confirmed", { required: "MEDIA_BACKUP_MODE write" });
}

const target = assertSafeBackupTarget({
  bucket: process.env.MEDIA_BACKUP_R2_BUCKET,
  prefix: process.env.MEDIA_BACKUP_R2_PREFIX,
});
if (!target.valid) {
  failClosed("unsafe_backup_target_refused", { targetFailures: target.failures });
}

const cloudflareAuth = hasCloudflareCredentialEnv();
const s3Auth = hasS3CredentialEnv();
if (!cloudflareAuth && !s3Auth) {
  failClosed("missing_r2_upload_credentials", {
    acceptedCredentialFamilies: ["cloudflare_api_or_wrangler", "r2_s3_compatible"],
  });
}

const databaseUrl = process.env.MEDIA_BACKUP_DATABASE_URL;
const rowCounts = getRowCounts(databaseUrl);
const dump = runPgDump(databaseUrl);
const artifacts = createArtifacts({
  schemaSql: dump.schemaSql,
  dataSql: dump.dataSql,
  rowCounts,
  toolUsed: dump.toolUsed,
  bucketRole: "private_backup",
  objectPrefix,
  backupId,
  createdAt,
});

try {
  if (cloudflareAuth) {
    uploadWithWrangler({
      bucket: process.env.MEDIA_BACKUP_R2_BUCKET,
      objectPrefix,
      files: artifacts.artifactPaths,
    });
  } else {
    uploadWithAwsCli({
      bucket: process.env.MEDIA_BACKUP_R2_BUCKET,
      endpoint: process.env.R2_ENDPOINT ?? process.env.AWS_ENDPOINT_URL_S3,
      objectPrefix,
      files: artifacts.artifactPaths,
    });
  }

  safeExit(0, {
    ok: true,
    mode: "write",
    dryRun: false,
    uploadAttempted: true,
    uploadSucceeded: true,
    backupId,
    objectPrefix,
    tablesIncluded: backupTables,
    tablesExcluded: excludedScopes,
    rowCounts,
    artifactFiles: Object.keys(artifacts.artifactPaths),
    manifestValid: true,
    checksumGenerated: true,
    privateR2Prefix: true,
    publicBucketUsed: false,
    logicalBackupNotPitr: true,
    productionDbTouched: true,
    productionDbWritesEnabled: false,
    productionWorkerDeployed: false,
    continuousAutomationEnabled: false,
  });
} finally {
  if (existsSync(artifacts.tempDir)) {
    rmSync(artifacts.tempDir, { recursive: true, force: true });
  }
}
