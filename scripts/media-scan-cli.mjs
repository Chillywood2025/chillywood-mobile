#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const validModes = new Set(["status", "plan", "dry-run", "run-one", "run-auto", "audit"]);
const runOneConfirmValue = "I_UNDERSTAND_PUBLIC_SCAN_ONE";
const runAutoConfirmValue = "I_UNDERSTAND_PUBLIC_SCAN_BATCH";
const expectedProjectRef = "bmkkhihfbmsnnmcqkoly";
const defaultFunctionsUrl = `https://${expectedProjectRef}.supabase.co/functions/v1`;
const mediaStorageFunctionUrl = `${String(process.env.MEDIA_SCAN_FUNCTIONS_URL || defaultFunctionsUrl).replace(/\/+$/g, "")}/media-storage`;
const privateDownloadMode = String(process.env.MEDIA_SCAN_PRIVATE_DOWNLOAD_MODE || "media-storage-function").trim();

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, ...value] = arg.slice(2).split("=");
  return [key, value.length ? value.join("=") : "true"];
}));

const mode = String(args.mode || "status").trim();
const dataSource = String(args.source || process.env.MEDIA_SCAN_DATABASE_SOURCE || "fixture").trim();
const defaultMaxJobs = mode === "run-auto" ? "5" : "1";
const maxJobs = Number.parseInt(String(args.maxJobs || process.env.MEDIA_SCAN_MAX_JOBS || defaultMaxJobs), 10);

function safeExit(code, payload) {
  const output = JSON.stringify({
    ...payload,
    noSecretsPrinted: true,
    readOnly: !["run-one", "run-auto"].includes(mode),
    mutationAttempted: false,
    productionRowsWritten: false,
    mediaProcessed: false,
    transcodeStarted: false,
    playbackSwitched: false,
    privateMediaExposed: false,
    premiumMediaExposed: false,
  }, null, 2);
  if (code === 0) process.stdout.write(`${output}\n`);
  else process.stderr.write(`${output}\n`);
  process.exit(code);
}

function failClosed(reason, extra = {}) {
  safeExit(1, {
    ok: false,
    failClosed: true,
    mode,
    reason,
    ...extra,
  });
}

function assertNoSecretLikeText(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (
    /postgres(?:ql)?:\/\//i.test(text)
    || new RegExp(`X-Amz-${"Signature"}=`, "i").test(text)
    || /\bservice[_-]?role\b/i.test(text.replaceAll("service_role_media_scan_rpc_required", "trusted_rpc_required"))
    || /\bBearer\s+[A-Za-z0-9._-]+/i.test(text)
    || /https?:\/\/(?!media\.chillywoodstream\.com\b)[^\s"']+/i.test(text)
  ) {
    failClosed("secret_or_private_url_like_value_refused");
  }
}

function assertSafeDownloadToken() {
  const token = String(process.env.MEDIA_SCAN_DOWNLOAD_ACCESS_TOKEN || "").trim();
  if (!token) {
    failClosed("trusted_scan_download_access_missing", {
      missingCredential: "MEDIA_SCAN_DOWNLOAD_ACCESS_TOKEN",
      acceptedDownloadMode: privateDownloadMode,
      rawServiceRoleRequired: false,
      backendPath: "media-storage create_download_url",
    });
  }
  assertNoSecretLikeText({ tokenPresent: true });
  return token;
}

function runJsonCommand(command, commandArgs, failureReason, maxBuffer = 50 * 1024 * 1024) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    failClosed(failureReason, { stderrRedacted: true });
  }
  assertNoSecretLikeText(result.stdout);
  assertNoSecretLikeText(result.stderr);
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
    "supabase_linked_read_only_query_failed",
  );
  if (!Array.isArray(parsed.rows)) failClosed("supabase_linked_query_missing_rows");
  return parsed.rows;
}

function sqlLiteral(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function readStorageMetadataForSource(sourceId) {
  if (!/^[0-9a-fA-F-]{36}$/.test(String(sourceId || ""))) {
    failClosed("source_id_unsafe_for_storage_metadata_lookup");
  }
  const rows = runSupabaseLinkedQuery(`
    select
      coalesce(storage_provider, '') as storage_provider,
      coalesce(storage_bucket, '') as storage_bucket,
      coalesce(
        nullif(storage_object_key, ''),
        case when coalesce(storage_path, '') !~* '^https?://' then nullif(storage_path, '') else '' end
      ) as storage_object_key
    from public.videos
    where id = ${sqlLiteral(sourceId)}::uuid
    limit 1;
  `);
  const row = rows[0] || {};
  return {
    storage_provider: row.storage_provider,
    storage_bucket: row.storage_bucket,
    storage_object_key: row.storage_object_key,
  };
}

async function runFfprobeLocalFile(filePath) {
  const versionResult = spawnSync("ffprobe", ["-version"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (versionResult.status !== 0) {
    return {
      status: "scan_failed",
      scannerName: "ffprobe",
      scannerVersion: "unavailable",
      scannerType: "ffprobe_media_readability",
      proof: { observedReadable: false, decodedStreams: 0, errorCode: "ffprobe_unavailable" },
    };
  }
  const scannerVersion = (versionResult.stdout || "ffprobe").split(/\r?\n/)[0]?.trim() || "ffprobe";
  const result = spawnSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type",
    "-of",
    "json",
    filePath,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    return {
      status: "scan_failed",
      scannerName: "ffprobe",
      scannerVersion,
      scannerType: "ffprobe_media_readability",
      proof: { observedReadable: false, decodedStreams: 0, errorCode: "ffprobe_failed" },
    };
  }
  const parsed = JSON.parse(result.stdout || "{}");
  const decodedStreams = Array.isArray(parsed.streams) ? parsed.streams.length : 0;
  const durationMillis = Math.round(Number(parsed.format?.duration || 0) * 1000);
  return {
    status: decodedStreams > 0 ? "clean" : "scan_failed",
    scannerName: "ffprobe",
    scannerVersion,
    scannerType: "ffprobe_media_readability",
    proof: {
      observedReadable: decodedStreams > 0,
      decodedStreams,
      durationMillis,
      errorCode: decodedStreams > 0 ? null : "ffprobe_no_streams",
    },
  };
}

async function downloadViaMediaStorageFunction(row) {
  if (privateDownloadMode !== "media-storage-function") {
    failClosed("unsupported_private_scan_download_mode", {
      privateDownloadMode,
      supportedModes: ["media-storage-function"],
    });
  }
  const storage = {
    ...row,
    ...(row.storage_provider && row.storage_bucket && row.storage_object_key ? {} : readStorageMetadataForSource(row.source_id)),
  };
  const provider = String(storage.storage_provider || "").trim().toLowerCase();
  const bucket = String(storage.storage_bucket || "").trim();
  const objectKey = String(storage.storage_object_key || "").trim();
  if (provider !== "s3") {
    failClosed("trusted_scan_download_provider_not_supported_by_media_storage_path", {
      storageProvider: provider || "missing",
      supportedProvider: "s3",
      fallbackRequired: provider === "supabase" ? "service_role_storage_worker_or_new_backend_stream_function" : "provider_specific_trusted_worker",
    });
  }
  if (!bucket || !objectKey) failClosed("trusted_scan_download_missing_object_metadata");
  const accessToken = assertSafeDownloadToken();
  const response = await fetch(mediaStorageFunctionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: "create_download_url",
      surfaceType: "creator_video",
      bucket,
      objectKey,
      recordId: row.source_id,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    failClosed("trusted_scan_download_function_denied", {
      httpStatus: response.status,
      errorCode: typeof payload?.error === "string" ? payload.error : "download_denied",
    });
  }
  const downloadUrl = String(payload.downloadUrl || "").trim();
  if (!downloadUrl) failClosed("trusted_scan_download_function_missing_url");
  assertNoSecretLikeText({ downloadUrlRedacted: "[REDACTED_SIGNED_URL]" });
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-scan-download-"));
  const tmpFile = path.join(tmpDir, "candidate-media");
  try {
    const download = await fetch(downloadUrl);
    if (!download.ok || !download.body) {
      failClosed("trusted_scan_download_fetch_failed", { httpStatus: download.status });
    }
    await pipeline(download.body, createWriteStream(tmpFile, { mode: 0o600 }));
    const fileStat = await stat(tmpFile);
    const scanResult = await runFfprobeLocalFile(tmpFile);
    return {
      tmpDir,
      scanResult,
      downloadedBytes: fileStat.size,
    };
  } catch (error) {
    rmSync(tmpDir, { recursive: true, force: true });
    if (error && typeof error === "object" && "message" in error) {
      failClosed("trusted_scan_download_or_ffprobe_failed", { errorCode: "download_or_ffprobe_failed" });
    }
    throw error;
  }
}

function assertSupportedModeAndSource() {
  if (!validModes.has(mode)) failClosed("invalid_mode", { validModes: Array.from(validModes) });
  if (!["fixture", "linked"].includes(dataSource)) {
    failClosed("unsupported_data_source", { supportedSources: ["fixture", "linked"] });
  }
}

function compileHelper() {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-scan-automation-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaScanAutomation.ts",
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
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      },
    );
    const requireFromHere = createRequire(import.meta.url);
    return {
      helper: requireFromHere(path.join(outDir, "mediaScanAutomation.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
}

const productionCatalogSql = `
with trusted_hls as (
  select distinct r.source_id
  from public.media_renditions r
  where r.source_type = 'creator_video'
    and r.delivery_format = 'hls'
    and r.delivery_provider = 'cloudflare_r2_custom_domain'
    and r.is_ready = true
    and r.is_public_playback_safe = true
    and r.visibility = 'public'
    and r.is_original = false
    and r.bucket_role = 'public_playback'
    and r.public_playback_path like 'playback/public/%'
    and r.scan_status in ('clean', 'approved')
    and r.moderation_status in ('clean', 'approved', 'allowed')
),
catalog as (
  select
    'creator_video'::text as source_type,
    v.id::text as source_id,
    case when coalesce(v.visibility, '') = 'public' then coalesce(nullif(v.title, ''), 'Untitled video') else '[redacted]' end as title,
    coalesce(v.visibility, '') as visibility,
    coalesce(v.scan_status, '') as scan_status,
    coalesce(v.moderation_status, '') as moderation_status,
    coalesce(v.mime_type, '') as mime_type,
    (
      (v.playback_url is not null and v.playback_url <> '')
      or (v.storage_path is not null and v.storage_path <> '')
      or (v.storage_object_key is not null and v.storage_object_key <> '')
    ) as source_present,
    ((coalesce(v.storage_path, '') || '/' || coalesce(v.storage_object_key, '') || '/' || coalesce(v.playback_url, '')) ~* '(^|/)(originals?|masters?)(/|$)') as is_original_only,
    (
      exists (
        select 1
        from public.creator_content_prices p
        where p.content_id = v.id
          and coalesce(p.is_paid, false) = true
          and coalesce(p.status, '') not in ('disabled', 'deleted', 'inactive')
      )
      or exists (
        select 1
        from public.creator_monetization_configs m
        where m.source_id = v.id
          and coalesce(m.status, '') not in ('disabled', 'deleted', 'inactive')
          and (
            coalesce(m.creates_digital_access, false) = true
            or coalesce(m.production_enabled, false) = true
            or coalesce(m.product_type, '') ilike '%paid%'
          )
      )
    ) as paid_or_premium_locked,
    false as has_active_job,
    exists (select 1 from trusted_hls h where h.source_id = v.id::text) as has_audited_hls
  from public.videos v
)
select json_agg(to_jsonb(catalog) order by title, source_id) as catalog
from catalog;
`;

const fixtureRows = [
  {
    source_type: "creator_video",
    source_id: "public-unscanned",
    title: "Public Unscanned",
    visibility: "public",
    scan_status: "manual_review",
    moderation_status: "allowed",
    mime_type: "video/mp4",
    source_present: true,
  },
  { source_type: "creator_video", source_id: "private", title: "Private", visibility: "private", scan_status: "manual_review", moderation_status: "allowed", mime_type: "video/mp4", source_present: true },
  { source_type: "creator_video", source_id: "premium", title: "Premium", visibility: "public", scan_status: "manual_review", moderation_status: "allowed", mime_type: "video/mp4", source_present: true, paid_or_premium_locked: true },
  { source_type: "creator_video", source_id: "missing", title: "Missing", visibility: "public", scan_status: "manual_review", moderation_status: "allowed", mime_type: "video/mp4", source_present: false },
  { source_type: "creator_video", source_id: "unsupported", title: "Unsupported", visibility: "public", scan_status: "manual_review", moderation_status: "allowed", mime_type: "application/octet-stream", source_present: true },
  { source_type: "creator_video", source_id: "blocked", title: "Blocked", visibility: "public", scan_status: "manual_review", moderation_status: "blocked", mime_type: "video/mp4", source_present: true },
];

function readCatalogRows() {
  if (dataSource === "fixture") return fixtureRows;
  const rows = runSupabaseLinkedQuery(productionCatalogSql);
  const catalog = rows[0]?.catalog;
  if (!Array.isArray(catalog)) failClosed("production_catalog_missing_payload");
  return catalog;
}

function selectedScanRows(rows) {
  const loaded = compileHelper();
  try {
    const classifications = rows.map((row) => loaded.helper.classifyMediaScanCandidate(row));
    return rows
      .map((row, index) => ({ row, classification: classifications[index] }))
      .filter((entry) => entry.classification.canScan)
      .slice(0, Math.max(1, Math.min(Number.isFinite(maxJobs) ? maxJobs : 1, 25)));
  } finally {
    loaded.cleanup();
  }
}

function commandAvailable(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0;
}

function summarizeCandidate(result) {
  const publicSafeToIdentify = result.canScan || result.scanState === "scan_skipped_already_audited_hls";
  return {
    sourceType: result.sourceType,
    sourceId: publicSafeToIdentify ? result.sourceId : "[redacted]",
    title: publicSafeToIdentify ? result.title : "[redacted]",
    scanState: result.scanState,
    canScan: result.canScan,
    moderationAllowed: result.moderationAllowed,
    nextStep: result.nextStep,
  };
}

function summarizeSkippedCounts(skipped) {
  return skipped.reduce((next, result) => {
    next[result.scanState] = (next[result.scanState] || 0) + 1;
    return next;
  }, {});
}

function buildScanOutput() {
  const loaded = compileHelper();
  try {
    const rows = readCatalogRows();
    const classifications = rows.map((row) => loaded.helper.classifyMediaScanCandidate(row));
    const counts = classifications.reduce((next, result) => {
      next[result.scanState] = (next[result.scanState] || 0) + 1;
      return next;
    }, {});
    const plan = loaded.helper.buildMediaScanJobPlan(rows, { maxJobs: Number.isFinite(maxJobs) ? maxJobs : 1 });
    const sanitized = loaded.helper.sanitizeMediaScanProof({
      totalRows: rows.length,
      scanStateCounts: counts,
      scanCandidateCount: classifications.filter((result) => result.canScan).length,
      skippedPrivateCount: classifications.filter((result) => result.scanState === "scan_skipped_private").length,
      skippedPremiumCount: classifications.filter((result) => result.scanState === "scan_skipped_premium").length,
      scannerTypesAvailable: {
        ffprobe: commandAvailable("ffprobe"),
        clamscan: commandAvailable("clamscan"),
      },
      scannerTypeSelected: "ffprobe_media_readability",
      scannerTypeDisclosure: "ffprobe_media_readability_only_not_malware_or_content_moderation",
      classifications: classifications.map(summarizeCandidate),
      plan: {
        scannerType: plan.scannerType,
        totalCandidates: plan.totalCandidates,
        plannedJobCount: plan.plannedJobCount,
        jobs: plan.jobs.map((job) => ({
          ...job,
          trustedWritePath: "trusted_media_scan_rpc_required",
        })),
        skippedSummary: summarizeSkippedCounts(plan.skipped),
        mutationAttempted: plan.mutationAttempted,
        productionRowsWritten: plan.productionRowsWritten,
        mediaProcessed: plan.mediaProcessed,
        transcodeStarted: plan.transcodeStarted,
        playbackSwitched: plan.playbackSwitched,
      },
      trustedWritePolicy: "production_clean_write_requires_existing_service_role_media_scan_rpc",
      mutationAttempted: false,
      productionRowsWritten: false,
      mediaProcessed: false,
      transcodeStarted: false,
      playbackSwitched: false,
    });
    assertNoSecretLikeText(sanitized);
    return sanitized;
  } finally {
    loaded.cleanup();
  }
}

assertSupportedModeAndSource();

if (mode === "run-one") {
  if (process.env.MEDIA_SCAN_RUN_ONE_CONFIRM !== runOneConfirmValue) {
    failClosed("media_scan_run_one_confirmation_missing", {
      requiredConfirmationEnv: "MEDIA_SCAN_RUN_ONE_CONFIRM",
      requiredConfirmationValue: runOneConfirmValue,
    });
  }
  if (dataSource === "linked") {
    const selected = selectedScanRows(readCatalogRows())[0];
    if (!selected) failClosed("no_public_scan_candidate_available");
    const download = await downloadViaMediaStorageFunction(selected.row);
    try {
      failClosed("trusted_scan_result_write_authority_missing", {
        trustedDownloadPassed: true,
        selectedSource: {
          sourceType: selected.classification.sourceType,
          sourceId: selected.classification.sourceId,
          title: selected.classification.title,
        },
        scannerTypeSelected: "ffprobe_media_readability",
        scannerTypeDisclosure: "ffprobe_media_readability_only_not_malware_or_content_moderation",
        downloadedBytes: download.downloadedBytes,
        scanResult: {
          status: download.scanResult.status,
          scannerName: download.scanResult.scannerName,
          scannerVersion: download.scanResult.scannerVersion,
          scannerType: download.scanResult.scannerType,
          proof: download.scanResult.proof,
        },
        missingCredential: "trusted scan completion authority",
        productionRowsWritten: false,
      });
    } finally {
      rmSync(download.tmpDir, { recursive: true, force: true });
    }
  }
  failClosed("production_scan_write_not_enabled_in_this_source_proof_build", {
    trustedWriteRequired: true,
    acceptedConfirmation: true,
  });
}

if (mode === "run-auto") {
  if (process.env.MEDIA_SCAN_AUTO_CONFIRM !== runAutoConfirmValue) {
    failClosed("media_scan_run_auto_confirmation_missing", {
      requiredConfirmationEnv: "MEDIA_SCAN_AUTO_CONFIRM",
      requiredConfirmationValue: runAutoConfirmValue,
    });
  }
  const output = buildScanOutput();
  if (dataSource === "linked") {
    const selected = selectedScanRows(readCatalogRows());
    if (selected.length > 0) {
      const firstStorage = readStorageMetadataForSource(selected[0].row.source_id);
      const firstProvider = String(firstStorage.storage_provider || "").trim().toLowerCase();
      if (firstProvider === "s3" && !process.env.MEDIA_SCAN_DOWNLOAD_ACCESS_TOKEN) {
        failClosed("trusted_scan_download_access_missing", {
          missingCredential: "MEDIA_SCAN_DOWNLOAD_ACCESS_TOKEN",
          acceptedConfirmation: true,
          rawServiceRoleRequired: false,
          backendPath: "media-storage create_download_url",
          selectedPublicScanCandidates: selected.length,
          skippedPrivateCount: output.skippedPrivateCount,
          skippedPremiumCount: output.skippedPremiumCount,
          scannerTypeSelected: output.scannerTypeSelected,
          scannerTypeDisclosure: output.scannerTypeDisclosure,
          plan: output.plan,
        });
      }
    }
  }
  failClosed("production_scan_batch_write_not_enabled_in_this_source_proof_build", {
    trustedWriteRequired: true,
    acceptedConfirmation: true,
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    selectedPublicScanCandidates: output.plan.plannedJobCount,
    skippedPrivateCount: output.skippedPrivateCount,
    skippedPremiumCount: output.skippedPremiumCount,
    scannerTypeSelected: output.scannerTypeSelected,
    scannerTypeDisclosure: output.scannerTypeDisclosure,
    plan: output.plan,
  });
}

const output = buildScanOutput();

if (mode === "status") {
  safeExit(0, {
    ok: true,
    mode,
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    totalRows: output.totalRows,
    scanStateCounts: output.scanStateCounts,
    scanCandidateCount: output.scanCandidateCount,
    skippedPrivateCount: output.skippedPrivateCount,
    skippedPremiumCount: output.skippedPremiumCount,
    scannerTypesAvailable: output.scannerTypesAvailable,
    scannerTypeSelected: output.scannerTypeSelected,
    scannerTypeDisclosure: output.scannerTypeDisclosure,
  });
}

if (mode === "plan" || mode === "dry-run") {
  safeExit(0, {
    ok: true,
    mode,
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    ...output,
    dryRunOnly: mode === "dry-run",
    runOneRequiresConfirmation: true,
    requiredConfirmationEnv: "MEDIA_SCAN_RUN_ONE_CONFIRM",
    requiredConfirmationValue: runOneConfirmValue,
  });
}

if (mode === "audit") {
  safeExit(0, {
    ok: true,
    mode,
    auditOnly: true,
    writtenResultAudited: false,
    reason: "no_scan_result_written_by_this_source_proof_task",
    trustedWritePolicy: output.trustedWritePolicy,
  });
}
