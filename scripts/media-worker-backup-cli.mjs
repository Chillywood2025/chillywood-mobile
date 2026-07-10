#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const privateBackupBucket = "chillywood-media-proof";
const publicPlaybackBucket = "chillywood-media-public-playback-proof";
const privateBackupPrefixRoot = "backups/media-worker/";
const mediaPublicDomain = "media.chillywoodstream.com";
const expectedProjectRef = "bmkkhihfbmsnnmcqkoly";
const expectedProjectName = "Chillywood2025's Project";
const expectedProjectRegion = "us-west-2";
const defaultLatestBackupPrefix = "backups/media-worker/2026/07/10/media-worker-logical-20260710T024048-5de12265dded/";
const artifactFiles = ["schema.sql.gz", "data-media-worker.jsonl.gz", "manifest.json", "sha256sums.txt"];
const validModes = ["preflight", "status", "verify-latest", "restore-drill"];

const parseArgValue = (name) => {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const mode = parseArgValue("--mode") ?? "status";
const bucket = process.env.MEDIA_BACKUP_R2_BUCKET || privateBackupBucket;
const latestPrefix = normalizePrefix(process.env.MEDIA_BACKUP_LATEST_PREFIX || defaultLatestBackupPrefix);

function normalizePrefix(value) {
  const text = String(value ?? "").trim();
  return text.endsWith("/") ? text : `${text}/`;
}

const safeJson = (value) => `${JSON.stringify({
  ...value,
  noSecretsPrinted: true,
  productionRowsWritten: false,
  productionPlaybackSwitched: false,
}, null, 2)}\n`;

function safeExit(code, payload) {
  const output = safeJson(payload);
  if (code === 0) process.stdout.write(output);
  else process.stderr.write(output);
  process.exit(code);
}

function failClosed(reason, details = {}) {
  safeExit(1, {
    ok: false,
    failClosed: true,
    mode,
    reason,
    ...details,
  });
}

function assertNoSecretLikeText(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`, "i"),
    /\b(Bearer|password|access_key|api_key|authorization)\s*[:=]/i,
    /\bservice[_-]?role[_-]?key\b/i,
    /postgres(?:ql)?:\/\//i,
  ];
  const matches = forbidden.filter((pattern) => pattern.test(text)).map((pattern) => String(pattern));
  if (matches.length > 0) {
    failClosed("secret_like_value_refused", { label, matches });
  }
}

function assertSafeBackupTarget({ targetBucket = bucket, prefix = latestPrefix }) {
  const normalizedPrefix = normalizePrefix(prefix);
  const targetText = `${targetBucket ?? ""} ${normalizedPrefix}`;
  const failures = [];
  if (targetBucket !== privateBackupBucket) failures.push("bucket_must_be_private_proof_bucket");
  if (targetBucket === publicPlaybackBucket) failures.push("public_playback_bucket_denied");
  if (/public-playback|public_playback/i.test(targetBucket ?? "")) failures.push("public_playback_named_bucket_denied");
  if (targetText.includes(mediaPublicDomain)) failures.push("public_media_domain_denied");
  if (!normalizedPrefix.startsWith(privateBackupPrefixRoot)) failures.push("prefix_must_start_backups_media_worker");
  if (normalizedPrefix.startsWith("playback/public/")) failures.push("public_playback_prefix_denied");
  if (failures.length > 0) {
    failClosed("unsafe_backup_target_refused", { targetFailures: failures });
  }
  return normalizedPrefix;
}

function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function runJsonCommand(command, args, failureReason, maxBuffer = 20 * 1024 * 1024) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) failClosed(failureReason);
  try {
    return JSON.parse(result.stdout || "{}");
  } catch {
    failClosed(`${failureReason}_json_parse_failed`);
  }
}

function runSupabaseLinkedQuery(sql) {
  const parsed = runJsonCommand(
    npxCommand,
    ["supabase", "db", "query", "--linked", sql],
    "supabase_linked_query_failed_without_secret_output",
    50 * 1024 * 1024,
  );
  if (!Array.isArray(parsed.rows)) failClosed("supabase_linked_query_missing_rows");
  return parsed.rows;
}

function readSupabaseProject() {
  const projects = runJsonCommand(
    npxCommand,
    ["supabase", "projects", "list", "--output", "json"],
    "supabase_project_list_failed_without_secret_output",
  );
  const project = projects.find((entry) => entry.id === expectedProjectRef || entry.ref === expectedProjectRef);
  if (!project) failClosed("expected_supabase_project_not_found", { expectedProjectRef });
  const readback = {
    projectRef: project.id ?? project.ref,
    projectName: project.name,
    projectRegion: project.region,
    projectStatus: project.status,
  };
  if (readback.projectRef !== expectedProjectRef) failClosed("supabase_project_ref_mismatch", { expectedProjectRef });
  if (readback.projectName !== expectedProjectName) failClosed("supabase_project_name_mismatch", { expectedProjectName });
  if (readback.projectRegion !== expectedProjectRegion) failClosed("supabase_project_region_mismatch", { expectedProjectRegion });
  return readback;
}

function readWorkerCounts() {
  const rows = runSupabaseLinkedQuery([
    "select json_build_object(",
    "  'media_transcode_jobs', (select count(*)::int from public.media_transcode_jobs),",
    "  'media_renditions', (select count(*)::int from public.media_renditions),",
    "  'active_unfinished_jobs', (select count(*)::int from public.media_transcode_jobs where status not in ('ready', 'failed', 'canceled')),",
    "  'unsafe_cdn_rows', (select count(*)::int from public.media_renditions where delivery_provider = 'cloudflare_r2_custom_domain' and not (is_ready = true and is_public_playback_safe = true and visibility = 'public' and is_original = false and storage_provider = 'cloudflare_r2' and bucket_role = 'public_playback' and scan_status in ('clean', 'approved') and moderation_status in ('clean', 'approved', 'allowed') and public_playback_path like 'playback/public/%')),",
    "  'other_source_renditions', (select count(*)::int from public.media_renditions where source_id <> 'c28e3838-7d2e-4f48-a8ad-73e3100f8cf1')",
    ") as counts;",
  ].join(" "));
  return rows[0]?.counts ?? {};
}

function downloadLatestBackup() {
  assertSafeBackupTarget({ targetBucket: bucket, prefix: latestPrefix });
  if (!commandAvailable(npxCommand, ["wrangler", "--version"])) {
    failClosed("missing_wrangler_for_private_r2_readback", { requiredTool: "npx wrangler" });
  }
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-worker-backup-readback-"));
  const files = {};
  try {
    for (const file of artifactFiles) {
      const outputPath = path.join(tempDir, file);
      const result = spawnSync(npxCommand, ["wrangler", "r2", "object", "get", `${bucket}/${latestPrefix}${file}`, "--file", outputPath, "--remote"], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.status !== 0 || !existsSync(outputPath)) {
        failClosed("private_r2_backup_readback_failed", { artifact: file, objectKey: `${latestPrefix}${file}` });
      }
      files[file] = outputPath;
    }
    return { tempDir, files };
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function verifyDownloadedBackup(download) {
  const sumsText = readFileSync(download.files["sha256sums.txt"], "utf8");
  assertNoSecretLikeText("sha256sums", sumsText);
  const expected = new Map();
  for (const line of sumsText.trim().split("\n").filter(Boolean)) {
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i);
    if (!match) failClosed("invalid_sha256sums_line", { artifact: "sha256sums.txt" });
    expected.set(match[2].trim(), match[1].toLowerCase());
  }
  const checksumResults = {};
  for (const [name, hash] of expected.entries()) {
    if (!download.files[name]) failClosed("sha256_artifact_missing_from_readback", { artifact: name });
    checksumResults[name] = sha256File(download.files[name]) === hash;
  }
  const checksumsMatch = Object.values(checksumResults).every(Boolean);
  if (!checksumsMatch) failClosed("backup_checksum_mismatch", { checksumResults });

  const manifest = JSON.parse(readFileSync(download.files["manifest.json"], "utf8"));
  assertNoSecretLikeText("manifest", manifest);
  if (manifest.r2_object_prefix !== latestPrefix) {
    failClosed("manifest_prefix_mismatch", { manifestPrefix: manifest.r2_object_prefix, expectedPrefix: latestPrefix });
  }
  if (manifest.public_bucket_used !== false) failClosed("manifest_public_bucket_used_not_false");
  if (manifest.logical_backup_not_pitr !== true) failClosed("manifest_logical_backup_not_pitr_missing");
  if (manifest.contains_secrets !== false) failClosed("manifest_contains_secrets_not_false");
  const dataText = gunzipSync(readFileSync(download.files["data-media-worker.jsonl.gz"])).toString("utf8");
  assertNoSecretLikeText("data-media-worker.jsonl.gz", dataText);
  const dataRows = dataText.trim() ? dataText.trim().split("\n").map((line) => JSON.parse(line)) : [];
  return { manifest, checksumResults, checksumsMatch, dataRows };
}

function checkPublicExposure() {
  const publicBucketResult = spawnSync(npxCommand, ["wrangler", "r2", "object", "get", `${publicPlaybackBucket}/${latestPrefix}manifest.json`, "--file", path.join(os.tmpdir(), `chillywood-public-bucket-${randomUUID()}.json`), "--remote"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const mediaDomainResult = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", `https://${mediaPublicDomain}/${latestPrefix}manifest.json`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const mediaDomainStatus = (mediaDomainResult.stdout || "").trim();
  if (publicBucketResult.status === 0) failClosed("backup_artifact_found_in_public_playback_bucket");
  if (mediaDomainStatus !== "404") failClosed("backup_artifact_exposed_on_public_media_domain", { mediaDomainStatus });
  return {
    publicPlaybackBucketContainsBackup: false,
    mediaDomainHttpStatus: mediaDomainStatus,
  };
}

async function restoreIntoPglite(download, verification) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const quote = (name) => `"${String(name).replaceAll('"', '""')}"`;
  const normalize = (value) => (value && typeof value === "object" ? JSON.stringify(value) : value);
  await db.exec(gunzipSync(readFileSync(download.files["schema.sql.gz"])).toString("utf8"));
  for (const entry of verification.dataRows) {
    if (!["media_transcode_jobs", "media_renditions"].includes(entry.table)) {
      failClosed("restore_refused_unexpected_table", { table: entry.table });
    }
    const columns = Object.keys(entry.row).filter((key) => entry.row[key] !== undefined);
    const values = columns.map((key) => normalize(entry.row[key]));
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    await db.query(
      `insert into public.${quote(entry.table)} (${columns.map(quote).join(", ")}) values (${placeholders})`,
      values,
    );
  }
  const jobCount = await db.query("select count(*)::int as count from public.media_transcode_jobs;");
  const renditionCount = await db.query("select count(*)::int as count from public.media_renditions;");
  const resolverQuery = `
    select id from public.media_renditions
    where is_ready = true
      and is_public_playback_safe = true
      and is_original = false
      and visibility = 'public'
      and scan_status in ('clean', 'approved')
      and moderation_status in ('clean', 'approved', 'allowed')
      and bucket_role = 'public_playback'
      and public_playback_path like 'playback/public/%'
    order by id;
  `;
  const resolverRows = await db.query(resolverQuery);
  const template = verification.dataRows.find((entry) => entry.table === "media_renditions")?.row;
  if (template) {
    const unsafe = {
      ...template,
      id: randomUUID(),
      rendition_label: "original",
      delivery_format: "mp4",
      bucket_role: "private_origin",
      storage_path: "originals/proof/source.mp4",
      public_playback_path: null,
      manifest_path: null,
      variant_playlist_path: null,
      visibility: "private",
      scan_status: "pending_scan",
      moderation_status: "blocked",
      is_public_playback_safe: false,
      is_original: true,
      is_ready: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const columns = Object.keys(unsafe).filter((key) => unsafe[key] !== undefined);
    const values = columns.map((key) => normalize(unsafe[key]));
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    await db.query(
      `insert into public.media_renditions (${columns.map(quote).join(", ")}) values (${placeholders})`,
      values,
    );
  }
  const resolverRowsAfterUnsafe = await db.query(resolverQuery);
  await db.close();
  const restoredRowCounts = {
    media_transcode_jobs: Number(jobCount.rows[0]?.count ?? 0),
    media_renditions: Number(renditionCount.rows[0]?.count ?? 0),
  };
  return {
    restoreRuntime: "pglite_disposable_local",
    schemaApplied: true,
    dataRestored: true,
    restoredRowCounts,
    manifestRowCounts: verification.manifest.row_counts,
    rowCountsMatch: restoredRowCounts.media_transcode_jobs === verification.manifest.row_counts.media_transcode_jobs
      && restoredRowCounts.media_renditions === verification.manifest.row_counts.media_renditions,
    resolverSafeRows: resolverRows.rows.length,
    resolverSafeRowsAfterUnsafeInjection: resolverRowsAfterUnsafe.rows.length,
    unsafeRowsBlockedAfterInjection: resolverRowsAfterUnsafe.rows.length === resolverRows.rows.length,
    productionDbMutation: false,
  };
}

function validateMode() {
  if (!validModes.includes(mode)) failClosed("invalid_mode", { validModes });
  assertSafeBackupTarget({ targetBucket: bucket, prefix: latestPrefix });
}

function hasMediaWorkerWorkflowOrCron() {
  const workflowPath = path.join(repoRoot, ".github", "workflows", "media-worker-logical-backup.yml");
  return existsSync(workflowPath);
}

async function main() {
  validateMode();

  if (mode === "preflight") {
    const project = readSupabaseProject();
    const counts = readWorkerCounts();
    safeExit(0, {
      ok: true,
      mode,
      project,
      expectedProject: {
        projectRef: expectedProjectRef,
        projectName: expectedProjectName,
        projectRegion: expectedProjectRegion,
      },
      linkedSupabaseAvailable: true,
      rowCounts: counts,
      workerRunning: Number(counts.active_unfinished_jobs ?? 0) > 0,
      workerNotRunning: Number(counts.active_unfinished_jobs ?? 0) === 0,
      privateR2Target: bucket,
      latestBackupPrefix: latestPrefix,
      publicPlaybackBucketTargetDenied: bucket !== publicPlaybackBucket,
      publicMediaDomainTargetDenied: !latestPrefix.includes(mediaPublicDomain),
      mediaWorkerGitHubWorkflowExists: hasMediaWorkerWorkflowOrCron(),
      cronOrSchedulerAdded: false,
      productionPlaybackUnchanged: true,
      productionWorkerDeployed: false,
      continuousAutomationEnabled: false,
    });
  }

  if (mode === "status") {
    const project = readSupabaseProject();
    const counts = readWorkerCounts();
    safeExit(0, {
      ok: true,
      mode,
      project,
      latestBackupPrefix: latestPrefix,
      privateR2Bucket: bucket,
      rowCounts: counts,
      backupGateState: "closed_for_latest_manual_backup",
      continuousAutomationGateState: "blocked_cli_only_manual_backup_not_continuous",
      workerNotRunning: Number(counts.active_unfinished_jobs ?? 0) === 0,
      productionPlaybackUnchanged: true,
      productionWorkerDeployed: false,
      cronOrSchedulerAdded: false,
      mediaWorkerGitHubWorkflowExists: hasMediaWorkerWorkflowOrCron(),
    });
  }

  if (mode === "verify-latest") {
    const download = downloadLatestBackup();
    try {
      const verification = verifyDownloadedBackup(download);
      const publicExposure = checkPublicExposure();
      safeExit(0, {
        ok: true,
        mode,
        latestBackupPrefix: latestPrefix,
        privateR2Bucket: bucket,
        manifestParsed: true,
        backupId: verification.manifest.backup_id,
        rowCounts: verification.manifest.row_counts,
        artifactFiles: verification.manifest.artifact_files,
        checksumsMatch: verification.checksumsMatch,
        checksumResults: verification.checksumResults,
        objectKeysUnderPrivatePrefix: latestPrefix.startsWith(privateBackupPrefixRoot),
        publicBucketUsed: verification.manifest.public_bucket_used,
        logicalBackupNotPitr: verification.manifest.logical_backup_not_pitr,
        ...publicExposure,
        restoreDrillCommand: "npm run backup:media-worker:restore-drill",
        productionWorkerDeployed: false,
        continuousAutomationEnabled: false,
      });
    } finally {
      rmSync(download.tempDir, { recursive: true, force: true });
    }
  }

  if (mode === "restore-drill") {
    const download = downloadLatestBackup();
    try {
      const verification = verifyDownloadedBackup(download);
      const restore = await restoreIntoPglite(download, verification);
      if (!restore.rowCountsMatch || !restore.unsafeRowsBlockedAfterInjection) {
        failClosed("restore_drill_failed", { restore });
      }
      safeExit(0, {
        ok: true,
        mode,
        latestBackupPrefix: latestPrefix,
        privateR2Bucket: bucket,
        backupId: verification.manifest.backup_id,
        rowCounts: verification.manifest.row_counts,
        checksumsMatch: verification.checksumsMatch,
        ...restore,
        productionWorkerDeployed: false,
        continuousAutomationEnabled: false,
      });
    } finally {
      rmSync(download.tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  failClosed("media_worker_backup_cli_failed_without_secret_output", { error: error.message });
});
