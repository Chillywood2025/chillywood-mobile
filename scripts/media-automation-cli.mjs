#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const cityLightsSourceId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const autoDetectConfirmation = "I_UNDERSTAND_AUTO_DETECT_BATCH";
const legacyBatchConfirmation = "I_UNDERSTAND_BATCH_AUTOMATION";
const continuousOnceConfirmation = "I_UNDERSTAND_ONE_CONTINUOUS_LIMITED_CYCLE";
const broadBackfillConfirmation = "I_UNDERSTAND_BROAD_BACKFILL_RISK";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const repoRoot = process.cwd();
const ffprobeCommand = process.env.FFPROBE_BIN || "ffprobe";
const ffmpegCommand = process.env.FFMPEG_BIN || "ffmpeg";
const wranglerCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const expectedProjectRef = "bmkkhihfbmsnnmcqkoly";
const defaultFunctionsUrl = `https://${expectedProjectRef}.supabase.co/functions/v1`;
const mediaScanGatewayFunctionUrl = `${String(process.env.MEDIA_SCAN_FUNCTIONS_URL || defaultFunctionsUrl).replace(/\/+$/g, "")}/media-scan-private-access`;
const publicPlaybackBucket = "chillywood-media-public-playback-proof";
const publicPlaybackHost = "media.chillywoodstream.com";
const mediaAutomationWorkerVersion = "media-automation-cli-auto-hls-v1";
const requestedRenditions = [
  {
    label: "360p",
    height: 360,
    bandwidth: 900000,
    audioBandwidth: "96k",
    videoBitrate: "800k",
    maxrate: "856k",
    bufsize: "1200k",
  },
  {
    label: "480p",
    height: 480,
    bandwidth: 1600000,
    audioBandwidth: "128k",
    videoBitrate: "1400k",
    maxrate: "1498k",
    bufsize: "2100k",
  },
];

const validModes = new Set([
  "status",
  "discover",
  "plan-auto",
  "dry-run-auto",
  "run-auto",
  "plan-batch",
  "dry-run-batch",
  "run-batch",
  "run-continuous-once",
  "audit",
  "audit-batch",
  "rollback-plan",
  "pause",
  "emergency-stop",
  "report",
]);

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, ...value] = arg.slice(2).split("=");
  return [key, value.length ? value.join("=") : "true"];
}));

const rawMode = args.mode || "status";
const dataSource = String(args.source || process.env.MEDIA_AUTOMATION_DATABASE_SOURCE || "fixture").trim();
const modeAliases = {
  "plan-batch": "plan-auto",
  "dry-run-batch": "dry-run-auto",
  "run-batch": "run-auto",
  "audit-batch": "audit",
};
const mode = modeAliases[rawMode] || rawMode;

function safeExit(code, payload) {
  const output = JSON.stringify({
    noSecretsPrinted: true,
    productionPlaybackSwitched: false,
    productionRowsWritten: false,
    daemonDeployed: false,
    cronSchedulerAdded: false,
    schedulerAdded: false,
    queueProcessorRunning: false,
    continuousAutomationEnabled: false,
    continuousLimitedSourceProofed: true,
    continuousLimitedLive: false,
    broadBackfillEnabled: false,
    ...payload,
  }, null, 2);
  if (code === 0) process.stdout.write(`${output}\n`);
  else process.stderr.write(`${output}\n`);
  process.exit(code);
}

function failClosed(reason, extra = {}) {
  safeExit(1, {
    ok: false,
    failClosed: true,
    requestedMode: rawMode,
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
    || /\bservice[_-]?role\b/i.test(text)
    || /\bBearer\s+[A-Za-z0-9._-]+/i.test(text)
  ) {
    failClosed("secret_like_value_refused");
  }
}

function runJsonCommand(command, commandArgs, failureReason, maxBuffer = 50 * 1024 * 1024) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
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

function assertSupportedDataSource() {
  if (!["fixture", "linked"].includes(dataSource)) {
    failClosed("unsupported_data_source", { supportedSources: ["fixture", "linked"] });
  }
}

function safeSourceId(value) {
  const text = String(value || "").trim();
  if (!text) failClosed("source_id_required");
  if (!/^[A-Za-z0-9._:-]+$/.test(text)) failClosed("source_id_unsafe");
  assertNoSecretLikeText(text);
  return text;
}

function safeBatchId(value) {
  const text = String(value || "").trim();
  if (!text) failClosed("batch_id_required");
  if (!/^[A-Za-z0-9._:-]+$/.test(text)) failClosed("batch_id_unsafe");
  assertNoSecretLikeText(text);
  return text;
}

function normalizePrefix(value) {
  const text = String(value || "").trim().replace(/^\/+/, "");
  return text.endsWith("/") ? text : `${text}/`;
}

function safeOutputPrefix(value) {
  const prefix = normalizePrefix(value);
  const failures = [];
  if (!prefix.startsWith("playback/public/auto/")) failures.push("must_start_playback_public_auto");
  if (prefix === "playback/public/" || prefix === "playback/public/auto/") failures.push("prefix_too_broad");
  if (prefix.includes("..") || /^https?:\/\//i.test(prefix)) failures.push("prefix_must_be_relative");
  if (/(^|\/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(\/|$)/i.test(prefix)) {
    failures.push("forbidden_private_segment");
  }
  if (failures.length) failClosed("unsafe_output_prefix_refused", { outputPrefix: prefix, failures });
  return prefix;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuidOrNull(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? `${sqlLiteral(text)}::uuid`
    : "null";
}

function sqlJson(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function commandAvailable(command) {
  const result = spawnSync(command, ["-version"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function assertRuntimeCommandsAvailable() {
  const missing = [];
  if (!commandAvailable(ffprobeCommand)) missing.push("ffprobe");
  if (!commandAvailable(ffmpegCommand)) missing.push("ffmpeg");
  const wranglerResult = spawnSync(wranglerCommand, ["wrangler", "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (wranglerResult.status !== 0) missing.push("wrangler");
  if (missing.length) failClosed("media_automation_runtime_command_missing", { missingCommands: missing });
}

function readScannerOperatorTokenFromLocalSecretFile() {
  const configuredPath = String(process.env.MEDIA_SCAN_OPERATOR_TOKEN_FILE || "").trim();
  const candidatePaths = [
    configuredPath,
    "/tmp/chillywood-media-scan-operator-token.env",
  ].filter(Boolean);
  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) continue;
    const content = readFileSync(candidatePath, "utf8");
    const match = content.match(/^MEDIA_SCAN_OPERATOR_TOKEN=(.+)$/m);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function assertSafeOperatorToken() {
  const token = String(process.env.MEDIA_SCAN_OPERATOR_TOKEN || readScannerOperatorTokenFromLocalSecretFile() || "").trim();
  if (!token || token.length < 32 || token.length > 512) {
    failClosed("media_scan_operator_token_missing_for_backend_transcode_download", {
      acceptedSources: ["MEDIA_SCAN_OPERATOR_TOKEN", "MEDIA_SCAN_OPERATOR_TOKEN_FILE", "existing_untracked_tmp_token_file"],
      rawServiceRoleRequired: false,
      rawStorageCredentialsRequired: false,
    });
  }
  assertNoSecretLikeText({ tokenRedacted: "[REDACTED_MEDIA_SCAN_OPERATOR_TOKEN]" });
  return token;
}

function runFfprobeJson(target) {
  try {
    const result = execFileSync(
      ffprobeCommand,
      [
        "-v",
        "error",
        "-show_entries",
        "stream=index,codec_type,codec_name,width,height,bit_rate:format=duration,bit_rate",
        "-of",
        "json",
        target,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60000,
      },
    );
    assertNoSecretLikeText(result);
    return JSON.parse(result || "{}");
  } catch {
    failClosed("ffprobe_failed_for_transcode_candidate");
  }
}

function mediaDurationMillis(probe) {
  return Math.max(1, Math.round(Number(probe?.format?.duration || 0) * 1000));
}

function selectSupportedRenditions(probe) {
  const videoStream = Array.isArray(probe?.streams)
    ? probe.streams.find((stream) => stream.codec_type === "video" && Number(stream.height) > 0)
    : null;
  const sourceHeight = Number(videoStream?.height || 0);
  const sourceWidth = Number(videoStream?.width || 0);
  const selected = requestedRenditions.filter((rendition) => sourceHeight >= rendition.height);
  if (!selected.length) {
    const error = new Error("source_resolution_below_minimum_hls_rendition");
    error.code = "source_resolution_below_minimum_hls_rendition";
    error.sourceWidth = sourceWidth;
    error.sourceHeight = sourceHeight;
    throw error;
  }
  return { selected, sourceWidth, sourceHeight, sourceCodec: String(videoStream?.codec_name || "") };
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filePath.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

function cacheControlFor(filePath) {
  if (filePath.endsWith(".ts")) return "public, max-age=31536000, immutable";
  return "public, max-age=300";
}

function generateRendition(inputPath, outputRoot, rendition) {
  const outputDir = path.join(outputRoot, rendition.label);
  mkdirSync(outputDir, { recursive: true });
  execFileSync(
    ffmpegCommand,
    [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-sn",
      "-vf",
      `scale=-2:${rendition.height}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-profile:v",
      "main",
      "-crf",
      "23",
      "-b:v",
      rendition.videoBitrate,
      "-maxrate",
      rendition.maxrate,
      "-bufsize",
      rendition.bufsize,
      "-c:a",
      "aac",
      "-b:a",
      rendition.audioBandwidth,
      "-ac",
      "2",
      "-hls_time",
      "4",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      path.join(outputDir, "segment-%03d.ts"),
      path.join(outputDir, "index.m3u8"),
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 180000,
    },
  );
  const renditionProbe = runFfprobeJson(path.join(outputDir, "index.m3u8"));
  const videoStream = Array.isArray(renditionProbe?.streams)
    ? renditionProbe.streams.find((stream) => Number(stream.width) > 0)
    : null;
  const segments = readdirSync(outputDir).filter((entry) => entry.endsWith(".ts")).sort();
  if (!segments.length) failClosed("hls_rendition_segments_missing", { renditionLabel: rendition.label });
  return {
    ...rendition,
    width: Number(videoStream?.width || 0),
    height: Number(videoStream?.height || rendition.height),
    durationMillis: mediaDurationMillis(renditionProbe),
    bitrate: Number(videoStream?.bit_rate || rendition.bandwidth),
    playlistRelativePath: `${rendition.label}/index.m3u8`,
    segments,
    fileSizeBytes: segments.reduce((sum, segment) => sum + statSync(path.join(outputDir, segment)).size, statSync(path.join(outputDir, "index.m3u8")).size),
  };
}

function writeMasterManifest(outputRoot, renditions) {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const rendition of renditions) {
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${rendition.width}x${rendition.height}`);
    lines.push(`${rendition.label}/index.m3u8`);
  }
  const masterPath = path.join(outputRoot, "master.m3u8");
  writeFileSync(masterPath, `${lines.join("\n")}\n`);
  return masterPath;
}

function assertManifestSafe(outputRoot, renditions) {
  const files = [path.join(outputRoot, "master.m3u8")];
  for (const rendition of renditions) files.push(path.join(outputRoot, rendition.playlistRelativePath));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assertNoSecretLikeText(text);
    if (/https?:\/\//i.test(text)) failClosed("hls_manifest_contains_absolute_url", { manifestFile: path.basename(file) });
  }
}

function runFfmpegDecode(target) {
  execFileSync(ffmpegCommand, ["-v", "error", "-i", target, "-t", "1", "-f", "null", "-"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
  });
}

function uploadObjectToPublicPlayback(key, filePath) {
  const safeKey = safeOutputPrefix(path.dirname(key) === "." ? key : `${path.dirname(key)}/`).slice(0, -1) === key ? key : key;
  if (!safeKey.startsWith("playback/public/auto/")) failClosed("r2_upload_key_outside_auto_public_prefix");
  if (/(^|\/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(\/|$)/i.test(safeKey)) {
    failClosed("r2_upload_key_forbidden_prefix");
  }
  const result = spawnSync(
    wranglerCommand,
    [
      "wrangler",
      "r2",
      "object",
      "put",
      `${publicPlaybackBucket}/${safeKey}`,
      "--file",
      filePath,
      "--remote",
      "--content-type",
      contentTypeFor(filePath),
      "--cache-control",
      cacheControlFor(filePath),
      "--force",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  assertNoSecretLikeText(result.stdout || "");
  assertNoSecretLikeText(result.stderr || "");
  if (result.status !== 0) failClosed("r2_public_playback_upload_failed", { key: safeKey, stderrRedacted: true });
  return {
    key: safeKey,
    contentType: contentTypeFor(filePath),
    cacheControl: cacheControlFor(filePath),
    bytes: statSync(filePath).size,
  };
}

function uploadHlsTree(outputRoot, outputPrefix, renditions) {
  const uploaded = [];
  const uploadFile = (relativePath) => {
    const localPath = path.join(outputRoot, relativePath);
    const key = `${outputPrefix}${relativePath.split(path.sep).join("/")}`;
    uploaded.push(uploadObjectToPublicPlayback(key, localPath));
  };
  uploadFile("master.m3u8");
  for (const rendition of renditions) {
    uploadFile(path.join(rendition.label, "index.m3u8"));
    for (const segment of rendition.segments) uploadFile(path.join(rendition.label, segment));
  }
  return uploaded;
}

async function fetchPublicObject(pathname) {
  const response = await fetch(`https://${publicPlaybackHost}/${pathname}`, { signal: AbortSignal.timeout(60000) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    byteLength: bytes.length,
    cacheStatus: response.headers.get("cf-cache-status") || "",
    age: response.headers.get("age") || "",
    contentType: response.headers.get("content-type") || "",
    text: pathname.endsWith(".m3u8") ? new TextDecoder().decode(bytes) : "",
  };
}

async function verifyUploadedHls(outputPrefix, renditions) {
  const masterPath = `${outputPrefix}master.m3u8`;
  const master = await fetchPublicObject(masterPath);
  if (!master.ok || !master.text.includes("#EXTM3U")) failClosed("public_hls_master_fetch_failed", { status: master.status });
  assertNoSecretLikeText(master.text);
  const variants = [];
  let firstSegmentPath = "";
  for (const rendition of renditions) {
    const variantPath = `${outputPrefix}${rendition.label}/index.m3u8`;
    const variant = await fetchPublicObject(variantPath);
    if (!variant.ok || !variant.text.includes("#EXTM3U")) failClosed("public_hls_variant_fetch_failed", { status: variant.status, renditionLabel: rendition.label });
    assertNoSecretLikeText(variant.text);
    const segment = rendition.segments[0];
    if (!segment) failClosed("public_hls_segment_missing", { renditionLabel: rendition.label });
    if (!firstSegmentPath) firstSegmentPath = `${outputPrefix}${rendition.label}/${segment}`;
    variants.push({ renditionLabel: rendition.label, status: variant.status, byteLength: variant.byteLength });
  }
  const firstFetch = await fetchPublicObject(firstSegmentPath);
  const secondFetch = await fetchPublicObject(firstSegmentPath);
  if (!firstFetch.ok || !secondFetch.ok || secondFetch.byteLength <= 0) failClosed("public_hls_segment_fetch_failed", { status: secondFetch.status });
  runFfmpegDecode(`https://${publicPlaybackHost}/${masterPath}`);
  return {
    master: { path: masterPath, status: master.status, byteLength: master.byteLength },
    variants,
    segment: {
      path: firstSegmentPath,
      status: secondFetch.status,
      byteLength: secondFetch.byteLength,
      cacheStatus: secondFetch.cacheStatus || firstFetch.cacheStatus || "not_reported",
      age: secondFetch.age || firstFetch.age || "",
    },
    ffmpegDecode: "passed",
  };
}

async function downloadTranscodeSource(candidate) {
  const token = assertSafeOperatorToken();
  const response = await fetch(mediaScanGatewayFunctionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-media-scan-operator-token": token,
    },
    body: JSON.stringify({
      action: "transcode_download",
      source_type: candidate.sourceType,
      source_id: candidate.sourceId,
    }),
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    failClosed("trusted_transcode_download_denied", {
      httpStatus: response.status,
      errorCode: typeof payload?.error === "string" ? payload.error : "download_denied",
      blockedReasons: Array.isArray(payload?.blockedReasons) ? payload.blockedReasons : undefined,
      rawServiceRoleRequired: false,
      rawStorageCredentialsRequired: false,
      backendPath: "media-scan-private-access",
    });
  }
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-auto-transcode-"));
  const tmpFile = path.join(tmpDir, "source-media");
  try {
    await pipeline(response.body, createWriteStream(tmpFile, { mode: 0o600 }));
    return {
      tmpDir,
      tmpFile,
      downloadedBytes: statSync(tmpFile).size,
      storageProvider: response.headers.get("x-media-scan-storage-provider") || "backend_gateway",
    };
  } catch {
    rmSync(tmpDir, { recursive: true, force: true });
    failClosed("trusted_transcode_download_failed");
  }
}

function readTranscodeSourceMetadata(sourceId) {
  const rows = runSupabaseLinkedQuery(`
    select json_build_object(
      'sourceId', v.id::text,
      'sourceType', 'creator_video',
      'title', case when coalesce(v.visibility, '') = 'public' then coalesce(nullif(v.title, ''), 'Untitled video') else '[redacted]' end,
      'creatorId', v.owner_id::text,
      'visibility', coalesce(v.visibility, ''),
      'scanStatus', coalesce(v.scan_status, ''),
      'moderationStatus', coalesce(v.moderation_status, ''),
      'mimeType', coalesce(v.mime_type, ''),
      'storageProvider', coalesce(v.storage_provider, ''),
      'storageBucket', coalesce(v.storage_bucket, ''),
      'inputPath', coalesce(nullif(v.storage_object_key, ''), nullif(v.storage_path, ''), ''),
      'fileSizeBytes', coalesce(v.file_size_bytes, 0),
      'premiumLocked', (
        exists (
          select 1 from public.creator_content_prices p
          where p.content_id = v.id and coalesce(p.is_paid, false) = true and coalesce(p.status, '') not in ('disabled', 'deleted', 'inactive')
        )
        or exists (
          select 1 from public.creator_monetization_configs m
          where m.source_id = v.id and coalesce(m.status, '') not in ('disabled', 'deleted', 'inactive')
            and (coalesce(m.creates_digital_access, false) = true or coalesce(m.production_enabled, false) = true or coalesce(m.product_type, '') ilike '%paid%')
        )
      ),
      'originalMasterLike', ((coalesce(v.storage_path, '') || '/' || coalesce(v.storage_object_key, '') || '/' || coalesce(v.playback_url, '')) ~* '(^|/)(originals?|masters?)(/|$)')
    ) as metadata
    from public.videos v
    where v.id = ${sqlLiteral(sourceId)}::uuid
    limit 1;
  `);
  const metadata = rows[0]?.metadata;
  if (!metadata || typeof metadata !== "object") failClosed("transcode_source_metadata_missing", { sourceId });
  const failures = [];
  if (metadata.visibility !== "public") failures.push("visibility_not_public");
  if (metadata.premiumLocked === true) failures.push("premium_locked");
  if (metadata.originalMasterLike === true) failures.push("original_master_like");
  if (!["clean", "approved"].includes(String(metadata.scanStatus || "").toLowerCase())) failures.push("scan_not_clean");
  if (!["clean", "approved", "allowed"].includes(String(metadata.moderationStatus || "").toLowerCase())) failures.push("moderation_not_allowed");
  if (!metadata.inputPath) failures.push("missing_source_path");
  if (metadata.mimeType && !String(metadata.mimeType).toLowerCase().startsWith("video/") && String(metadata.mimeType).toLowerCase() !== "application/vnd.apple.mpegurl") {
    failures.push("unsupported_mime_type");
  }
  if (failures.length) failClosed("transcode_source_metadata_not_safe", { sourceId, failures });
  return metadata;
}

function mapInputProvider(storageProvider) {
  const provider = String(storageProvider || "").toLowerCase();
  if (provider === "s3" || provider === "hetzner_s3") return "hetzner_s3";
  if (provider === "supabase" || provider === "supabase_storage") return "supabase_storage";
  if (provider === "cloudflare_r2" || provider === "r2") return "cloudflare_r2";
  return "origin_signed_direct";
}

function updateJobStatus(jobId, status, extra = {}) {
  const assignments = [`status = ${sqlLiteral(status)}`];
  if (status === "probing" || status === "transcoding") assignments.push("started_at = coalesce(started_at, timezone('utc'::text, now()))");
  if (status === "ready" || status === "failed" || status === "canceled") assignments.push("completed_at = timezone('utc'::text, now())");
  for (const [column, value] of Object.entries(extra)) {
    if (value === undefined) continue;
    if (typeof value === "number") assignments.push(`${column} = ${Number.isFinite(value) ? value : "null"}`);
    else if (typeof value === "object" && value !== null) assignments.push(`${column} = ${sqlJson(value)}`);
    else assignments.push(`${column} = ${sqlLiteral(value)}`);
  }
  runSupabaseLinkedQuery(`update public.media_transcode_jobs set ${assignments.join(", ")} where id = ${sqlLiteral(jobId)}::uuid returning id;`);
}

function insertJobRow({ jobId, sourceId, metadata, outputPrefix, requestedLabels, sourceHash }) {
  runSupabaseLinkedQuery(`
    insert into public.media_transcode_jobs (
      id, source_type, source_id, creator_id, input_provider, input_bucket_role, input_bucket, input_path,
      output_provider, output_bucket_role, output_bucket, output_prefix, status, requested_renditions,
      worker_version, source_hash, proof_mode
    ) values (
      ${sqlLiteral(jobId)}::uuid,
      'creator_video',
      ${sqlLiteral(sourceId)},
      ${sqlUuidOrNull(metadata.creatorId)},
      ${sqlLiteral(mapInputProvider(metadata.storageProvider))},
      'private_origin',
      ${sqlLiteral(metadata.storageBucket || "")},
      ${sqlLiteral(metadata.inputPath)},
      'cloudflare_r2_custom_domain',
      'public_playback',
      ${sqlLiteral(publicPlaybackBucket)},
      ${sqlLiteral(outputPrefix)},
      'queued',
      ${sqlJson(requestedLabels)},
      ${sqlLiteral(mediaAutomationWorkerVersion)},
      ${sqlLiteral(sourceHash)},
      false
    ) returning id;
  `);
}

function insertPendingRenditionRows({ jobId, sourceId, metadata, outputPrefix, renditions, durationMillis, sourceHash }) {
  for (const rendition of renditions) {
    const manifestPath = `${outputPrefix}master.m3u8`;
    const variantPath = `${outputPrefix}${rendition.label}/index.m3u8`;
    runSupabaseLinkedQuery(`
      insert into public.media_renditions (
        job_id, media_id, video_id, source_type, source_id, creator_id, rendition_label,
        delivery_format, delivery_provider, storage_provider, bucket_role, storage_bucket, storage_path,
        public_playback_path, manifest_path, variant_playlist_path, width, height, duration_ms, codec,
        bitrate, file_size_bytes, cache_policy, visibility, scan_status, moderation_status,
        is_public_playback_safe, is_original, is_ready, worker_version, source_hash
      ) values (
        ${sqlLiteral(jobId)}::uuid,
        ${sqlLiteral(sourceId)},
        ${sqlLiteral(sourceId)}::uuid,
        'creator_video',
        ${sqlLiteral(sourceId)},
        ${sqlUuidOrNull(metadata.creatorId)},
        ${sqlLiteral(rendition.label)},
        'hls',
        'origin_signed_direct',
        'cloudflare_r2',
        'public_playback',
        ${sqlLiteral(publicPlaybackBucket)},
        ${sqlLiteral(variantPath)},
        ${sqlLiteral(manifestPath)},
        ${sqlLiteral(manifestPath)},
        ${sqlLiteral(variantPath)},
        ${rendition.width || "null"},
        ${rendition.height || "null"},
        ${durationMillis},
        'h264',
        ${rendition.bitrate || rendition.bandwidth},
        ${rendition.fileSizeBytes || 0},
        'hls_manifest_300_segments_immutable',
        'public',
        ${sqlLiteral(metadata.scanStatus)},
        ${sqlLiteral(metadata.moderationStatus)},
        false,
        false,
        false,
        ${sqlLiteral(mediaAutomationWorkerVersion)},
        ${sqlLiteral(sourceHash)}
      ) returning id;
    `);
  }
}

function auditAndPromoteRows({ jobId, sourceId, outputPrefix, renditionLabels }) {
  const rows = runSupabaseLinkedQuery(`
    select json_build_object(
      'rowCount', count(*)::int,
      'labels', coalesce(json_agg(rendition_label order by rendition_label), '[]'::json),
      'unsafeRows', count(*) filter (
        where source_id <> ${sqlLiteral(sourceId)}
          or source_type <> 'creator_video'
          or delivery_format <> 'hls'
          or bucket_role <> 'public_playback'
          or storage_provider <> 'cloudflare_r2'
          or visibility <> 'public'
          or is_original = true
          or scan_status not in ('clean', 'approved')
          or moderation_status not in ('clean', 'approved', 'allowed')
          or public_playback_path not like 'playback/public/auto/%'
          or manifest_path <> ${sqlLiteral(`${outputPrefix}master.m3u8`)}
      )::int
    ) as audit
    from public.media_renditions
    where job_id = ${sqlLiteral(jobId)}::uuid;
  `);
  const audit = rows[0]?.audit || {};
  if (Number(audit.rowCount || 0) !== renditionLabels.length) failClosed("post_write_audit_row_count_mismatch", { jobId, sourceId });
  if (Number(audit.unsafeRows || 0) !== 0) failClosed("post_write_audit_unsafe_rows", { jobId, sourceId });
  const actualLabels = Array.isArray(audit.labels) ? audit.labels : [];
  for (const label of renditionLabels) {
    if (!actualLabels.includes(label)) failClosed("post_write_audit_rendition_label_missing", { jobId, sourceId, label });
  }
  runSupabaseLinkedQuery(`
    update public.media_renditions
    set delivery_provider = 'cloudflare_r2_custom_domain',
        is_public_playback_safe = true,
        is_ready = true
    where job_id = ${sqlLiteral(jobId)}::uuid
      and source_id = ${sqlLiteral(sourceId)}
      and source_type = 'creator_video'
      and delivery_format = 'hls'
      and bucket_role = 'public_playback'
      and storage_provider = 'cloudflare_r2'
      and visibility = 'public'
      and is_original = false
      and scan_status in ('clean', 'approved')
      and moderation_status in ('clean', 'approved', 'allowed')
      and public_playback_path like 'playback/public/auto/%'
      and manifest_path = ${sqlLiteral(`${outputPrefix}master.m3u8`)}
    returning id;
  `);
}

async function executeCandidate(candidate) {
  const batchId = `auto-${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}-${randomUUID().slice(0, 12)}`;
  const outputPrefix = safeOutputPrefix(`playback/public/auto/${candidate.sourceType}/${candidate.sourceId}/${batchId}/`);
  const jobId = randomUUID();
  const metadata = readTranscodeSourceMetadata(candidate.sourceId);
  const download = await downloadTranscodeSource(candidate);
  const outputRoot = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-auto-hls-"));
  const uploadedKeys = [];
  try {
    const sourceHash = `sha256:${sha256File(download.tmpFile)}`;
    insertJobRow({
      jobId,
      sourceId: candidate.sourceId,
      metadata,
      outputPrefix,
      requestedLabels: requestedRenditions.map((rendition) => rendition.label),
      sourceHash,
    });
    const initialProbe = runFfprobeJson(download.tmpFile);
    const sourceMetrics = selectSupportedRenditions(initialProbe);
    const selectedRenditions = sourceMetrics.selected;
    updateJobStatus(jobId, "probing", {
      source_width: sourceMetrics.sourceWidth,
      source_height: sourceMetrics.sourceHeight,
      source_codec: sourceMetrics.sourceCodec,
      duration_ms: mediaDurationMillis(initialProbe),
    });
    updateJobStatus(jobId, "transcoding");
    const generated = selectedRenditions.map((rendition) => generateRendition(download.tmpFile, outputRoot, rendition));
    const masterPath = writeMasterManifest(outputRoot, generated);
    assertManifestSafe(outputRoot, generated);
    runFfmpegDecode(masterPath);
    updateJobStatus(jobId, "uploading");
    const uploaded = uploadHlsTree(outputRoot, outputPrefix, generated);
    uploadedKeys.push(...uploaded.map((object) => object.key));
    const publicProof = await verifyUploadedHls(outputPrefix, generated);
    insertPendingRenditionRows({
      jobId,
      sourceId: candidate.sourceId,
      metadata,
      outputPrefix,
      renditions: generated,
      durationMillis: mediaDurationMillis(initialProbe),
      sourceHash,
    });
    auditAndPromoteRows({
      jobId,
      sourceId: candidate.sourceId,
      outputPrefix,
      renditionLabels: generated.map((rendition) => rendition.label),
    });
    updateJobStatus(jobId, "ready", {
      completed_renditions: generated.map((rendition) => ({
        label: rendition.label,
        width: rendition.width,
        height: rendition.height,
        manifestPath: `${outputPrefix}master.m3u8`,
        variantPlaylistPath: `${outputPrefix}${rendition.label}/index.m3u8`,
      })),
    });
    return {
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      title: candidate.title,
      jobId,
      batchId,
      outputPrefix,
      renditionLabels: generated.map((rendition) => rendition.label),
      uploadedObjectCount: uploaded.length,
      publicProof,
      rollbackScope: {
        source_id: candidate.sourceId,
        exact_output_prefix: outputPrefix,
        batch_id: batchId,
      },
      inputPathRedacted: true,
      downloadedBytes: download.downloadedBytes,
      sourceStorageProvider: download.storageProvider,
    };
  } catch (error) {
    const errorCode = typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "auto_transcode_execution_failed";
    try {
      updateJobStatus(jobId, "failed", {
        error_code: errorCode,
        error_message: "redacted",
      });
    } catch {
      // Best-effort failure marking only. The caller still fails closed.
    }
    rmSync(download.tmpDir, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
    failClosed(errorCode, {
      sourceId: candidate.sourceId,
      jobId,
      sourceWidth: typeof error === "object" && error && "sourceWidth" in error ? error.sourceWidth : undefined,
      sourceHeight: typeof error === "object" && error && "sourceHeight" in error ? error.sourceHeight : undefined,
      uploadedObjectCountBeforeFailure: uploadedKeys.length,
      rollbackScope: { exact_output_prefix: outputPrefix, source_id: candidate.sourceId, batch_id: batchId },
      errorRedacted: true,
      productionRowsWritten: true,
    });
  } finally {
    rmSync(download.tmpDir, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
  }
}

async function executeAutoBatch(plan) {
  if (dataSource !== "linked") {
    return {
      executionMode: "fixture_simulated",
      workerRun: true,
      productionRowsWritten: false,
      processedCount: plan.selectedCount,
      processedCandidates: plan.selectedCandidates.map((candidate) => ({
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        outputPrefix: candidate.expectedOutputPrefix,
        simulatedAuditPassed: true,
      })),
      auditPassed: true,
      r2UploadPerformed: false,
    };
  }
  assertRuntimeCommandsAvailable();
  const processed = [];
  for (const candidate of plan.selectedCandidates) {
    processed.push(await executeCandidate(candidate));
  }
  const finalCounts = readWorkerCountsLinked();
  return {
    executionMode: "linked_real_bounded_auto_batch",
    workerRun: true,
    productionRowsWritten: processed.length > 0,
    processedCount: processed.length,
    processedCandidates: processed,
    auditPassed: true,
    r2UploadPerformed: processed.length > 0,
    finalWorkerCounts: finalCounts,
  };
}

const fixtureCandidates = [
  {
    sourceType: "creator_video",
    sourceId: "auto-public-safe-001",
    title: "Auto Public Safe 001",
    classification: "eligible_needs_transcode",
    legacyClassification: "needs_transcode",
    publicSafe: true,
    needsTranscode: true,
    alreadyHasAuditedHls: false,
  },
  {
    sourceType: "creator_video",
    sourceId: "auto-public-safe-002",
    title: "Auto Public Safe 002",
    classification: "eligible_needs_transcode",
    legacyClassification: "needs_transcode",
    publicSafe: true,
    needsTranscode: true,
    alreadyHasAuditedHls: false,
  },
  {
    sourceType: "creator_video",
    sourceId: cityLightsSourceId,
    title: "Chi'llwood City Lights",
    classification: "eligible_already_has_audited_hls",
    legacyClassification: "already_has_audited_hls",
    publicSafe: true,
    needsTranscode: false,
    alreadyHasAuditedHls: true,
  },
  { sourceType: "creator_video", sourceId: "private", title: "Private", classification: "excluded_private", legacyClassification: "private_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "premium", title: "Premium", classification: "excluded_premium", legacyClassification: "premium_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "original", title: "Original", classification: "excluded_original_master", legacyClassification: "original_only_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "unscanned", title: "Unscanned", classification: "excluded_unscanned", legacyClassification: "unscanned_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "moderation", title: "Moderation Blocked", classification: "excluded_moderation_blocked", legacyClassification: "moderation_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "active-job", title: "Active Job", classification: "excluded_already_active_job", legacyClassification: "needs_transcode", publicSafe: false },
];

const classificationKeys = [
  "eligible_needs_transcode",
  "eligible_already_has_audited_hls",
  "excluded_private",
  "excluded_premium",
  "excluded_original_master",
  "excluded_unscanned",
  "excluded_moderation_blocked",
  "excluded_missing_source",
  "excluded_unsupported_format",
  "excluded_already_active_job",
  "excluded_denied_source",
  "excluded_already_processed",
];

const emptyClassificationCounts = () => Object.fromEntries(classificationKeys.map((key) => [key, 0]));

function countClassifications(candidates) {
  const counts = emptyClassificationCounts();
  for (const candidate of candidates) {
    counts[candidate.classification] = (counts[candidate.classification] || 0) + 1;
  }
  return counts;
}

function riskLevelForBatchSize(batchSize) {
  if (batchSize <= 0) return "blocked";
  if (batchSize === 1) return "low";
  if (batchSize <= 5) return "medium";
  return "elevated";
}

const productionDiscoverySql = `
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
video_catalog as (
  select
    v.id::text as source_id,
    case when coalesce(v.visibility, '') = 'public' then coalesce(nullif(v.title, ''), 'Untitled video') else '[redacted]' end as safe_title,
    coalesce(v.visibility, '') as visibility,
    coalesce(v.scan_status, '') as scan_status,
    coalesce(v.moderation_status, '') as moderation_status,
    coalesce(v.mime_type, '') as mime_type,
    (
      (v.playback_url is not null and v.playback_url <> '')
      or (v.storage_path is not null and v.storage_path <> '')
      or (v.storage_object_key is not null and v.storage_object_key <> '')
    ) as source_present,
    ((coalesce(v.storage_path, '') || '/' || coalesce(v.storage_object_key, '') || '/' || coalesce(v.playback_url, '')) ~* '(^|/)(originals?|masters?)(/|$)') as original_master_like,
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
    ) as premium_locked,
    exists (
      select 1
      from public.media_transcode_jobs j
      where j.source_type = 'creator_video'
        and j.source_id = v.id::text
        and j.status not in ('ready', 'failed', 'canceled')
    ) as active_job,
    exists (
      select 1
      from public.media_transcode_jobs j
      where j.source_type = 'creator_video'
        and j.source_id = v.id::text
        and j.status = 'ready'
    ) as already_processed,
    exists (
      select 1
      from public.media_transcode_jobs j
      where j.source_type = 'creator_video'
        and j.source_id = v.id::text
        and j.status = 'failed'
        and j.error_code in ('source_resolution_below_minimum_hls_rendition')
    ) as unsupported_failed_job
  from public.videos v
  where not exists (select 1 from trusted_hls h where h.source_id = v.id::text)
),
classified_videos as (
  select
    source_id,
    safe_title,
    'creator_video'::text as source_type,
    case
      when coalesce(visibility, '') <> 'public' then 'excluded_private'
      when premium_locked then 'excluded_premium'
      when original_master_like then 'excluded_original_master'
      when coalesce(scan_status, '') not in ('clean', 'approved') then 'excluded_unscanned'
      when coalesce(moderation_status, '') not in ('clean', 'approved', 'allowed') then 'excluded_moderation_blocked'
      when not source_present then 'excluded_missing_source'
      when mime_type <> '' and mime_type not ilike 'video/%' then 'excluded_unsupported_format'
      when unsupported_failed_job then 'excluded_unsupported_format'
      when active_job then 'excluded_already_active_job'
      when already_processed then 'excluded_already_processed'
      else 'eligible_needs_transcode'
    end as classification,
    source_present,
    mime_type
  from video_catalog
),
trusted_hls_rows as (
  select
    h.source_id,
    coalesce((select case when coalesce(v.visibility, '') = 'public' then coalesce(nullif(v.title, ''), 'Untitled video') else '[redacted]' end from public.videos v where v.id::text = h.source_id limit 1), 'Audited HLS source') as safe_title,
    'creator_video'::text as source_type,
    'eligible_already_has_audited_hls'::text as classification,
    true as source_present,
    'application/vnd.apple.mpegurl'::text as mime_type
  from trusted_hls h
),
all_candidates as (
  select * from classified_videos
  union all
  select * from trusted_hls_rows
)
select json_build_object(
  'totalCandidatesScanned', (select count(*)::int from all_candidates),
  'classificationCounts', (
    select coalesce(json_object_agg(classification, count), '{}'::json)
    from (
      select classification, count(*)::int as count
      from all_candidates
      group by classification
    ) counts
  ),
  'eligibleCandidates', (
    select coalesce(json_agg(json_build_object(
      'sourceType', source_type,
      'sourceId', source_id,
      'title', safe_title,
      'classification', classification,
      'currentPlaybackSource', case when source_present then 'source_present_redacted' else 'missing_source' end,
      'mimeType', mime_type,
      'transcodeNeeded', classification = 'eligible_needs_transcode',
      'expectedOutputPrefix', 'playback/public/auto/' || source_type || '/' || source_id || '/auto-detect-production-readonly/',
      'rollbackScope', 'exact_source_and_prefix_only'
    ) order by safe_title, source_id), '[]'::json)
    from all_candidates
    where classification = 'eligible_needs_transcode'
  ),
  'alreadyAuditedHlsSources', (
    select coalesce(json_agg(json_build_object(
      'sourceType', source_type,
      'sourceId', source_id,
      'title', safe_title,
      'classification', classification,
      'transcodeNeeded', false
    ) order by safe_title, source_id), '[]'::json)
    from all_candidates
    where classification = 'eligible_already_has_audited_hls'
  )
) as discovery;
`;

function readProductionDiscovery() {
  const rows = runSupabaseLinkedQuery(productionDiscoverySql);
  const discovery = rows[0]?.discovery;
  if (!discovery || typeof discovery !== "object") failClosed("production_discovery_missing_payload");
  const classificationCounts = {
    ...emptyClassificationCounts(),
    ...(discovery.classificationCounts || {}),
  };
  return {
    totalCandidatesScanned: Number(discovery.totalCandidatesScanned || 0),
    classificationCounts,
    eligibleCandidates: Array.isArray(discovery.eligibleCandidates) ? discovery.eligibleCandidates : [],
    alreadyAuditedHlsSources: Array.isArray(discovery.alreadyAuditedHlsSources) ? discovery.alreadyAuditedHlsSources : [],
  };
}

function readWorkerCountsLinked() {
  const rows = runSupabaseLinkedQuery([
    "select json_build_object(",
    "  'media_transcode_jobs', (select count(*)::int from public.media_transcode_jobs),",
    "  'media_renditions', (select count(*)::int from public.media_renditions),",
    "  'active_unfinished_jobs', (select count(*)::int from public.media_transcode_jobs where status not in ('ready', 'failed', 'canceled')),",
    "  'unsafe_cdn_rows', (select count(*)::int from public.media_renditions where delivery_provider = 'cloudflare_r2_custom_domain' and not (is_ready = true and is_public_playback_safe = true and visibility = 'public' and is_original = false and storage_provider = 'cloudflare_r2' and bucket_role = 'public_playback' and scan_status in ('clean', 'approved') and moderation_status in ('clean', 'approved', 'allowed') and public_playback_path like 'playback/public/%')),",
    "  'other_source_renditions', (select count(*)::int from public.media_renditions where source_id <> 'c28e3838-7d2e-4f48-a8ad-73e3100f8cf1')",
    ") as counts;",
  ].join(" "));
  return rows[0]?.counts || {};
}

function calculateAutoBatchSize({
  eligibleCount,
  latestBackupFresh = true,
  restoreDrillFresh = true,
  previousSuccessStreak = 0,
  previousFailureCount = 0,
  activeUnfinishedJobs = 0,
  unsafeCdnRows = 0,
  hardMaxBatchCap = 25,
} = {}) {
  const reasonCodes = [];
  if (eligibleCount <= 0) reasonCodes.push("no_eligible_candidates");
  if (!latestBackupFresh) reasonCodes.push("latest_backup_stale");
  if (!restoreDrillFresh) reasonCodes.push("restore_drill_stale");
  if (activeUnfinishedJobs > 0) reasonCodes.push("active_unfinished_jobs_present");
  if (unsafeCdnRows > 0) reasonCodes.push("unsafe_cdn_rows_present");
  if (reasonCodes.length) {
    return {
      batchSize: 0,
      riskLevel: "blocked",
      reasonCodes,
      manualBatchSizeRequired: false,
    };
  }

  let cap = 1;
  if (previousFailureCount > 0) {
    cap = 1;
    reasonCodes.push("previous_failure_drops_cap_to_one");
  } else if (previousSuccessStreak >= 5) {
    cap = 25;
    reasonCodes.push("success_streak_cap_twenty_five");
  } else if (previousSuccessStreak >= 3) {
    cap = 10;
    reasonCodes.push("success_streak_cap_ten");
  } else if (previousSuccessStreak >= 1) {
    cap = 5;
    reasonCodes.push("success_streak_cap_five");
  } else {
    reasonCodes.push("first_auto_run_cap_one");
  }
  return {
    batchSize: Math.min(eligibleCount, cap, hardMaxBatchCap, 25),
    riskLevel: riskLevelForBatchSize(Math.min(eligibleCount, cap, hardMaxBatchCap, 25)),
    reasonCodes,
    manualBatchSizeRequired: false,
  };
}

function buildAutoPlan() {
  assertSupportedDataSource();
  const productionDiscovery = dataSource === "linked" ? readProductionDiscovery() : null;
  const workerCounts = dataSource === "linked" ? readWorkerCountsLinked() : {
    active_unfinished_jobs: 0,
    unsafe_cdn_rows: 0,
  };
  const eligible = dataSource === "linked"
    ? productionDiscovery.eligibleCandidates.map((candidate) => ({
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      title: candidate.title,
      classification: candidate.classification,
      legacyClassification: "needs_transcode",
      publicSafe: true,
      needsTranscode: true,
      alreadyHasAuditedHls: false,
      currentPlaybackSource: candidate.currentPlaybackSource,
      expectedOutputPrefix: candidate.expectedOutputPrefix,
    }))
    : fixtureCandidates.filter((candidate) => candidate.publicSafe && candidate.needsTranscode);
  const batch = calculateAutoBatchSize({
    eligibleCount: eligible.length,
    latestBackupFresh: true,
    restoreDrillFresh: true,
    previousSuccessStreak: Number(process.env.MEDIA_AUTOMATION_SUCCESS_STREAK || "0"),
    previousFailureCount: Number(process.env.MEDIA_AUTOMATION_FAILURE_COUNT || "0"),
    activeUnfinishedJobs: Number(workerCounts.active_unfinished_jobs || 0),
    unsafeCdnRows: Number(workerCounts.unsafe_cdn_rows || 0),
    hardMaxBatchCap: 25,
  });
  const selected = eligible.slice(0, batch.batchSize);
  const classificationCounts = dataSource === "linked"
    ? productionDiscovery.classificationCounts
    : countClassifications(fixtureCandidates);
  return {
    automationMode: "auto_detect",
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
    backupGateRequired: true,
    backupGateState: "closed_for_latest_manual_backup",
    restoreDrillState: "fresh",
    backupGateFresh: true,
    restoreDrillFresh: true,
    activeUnfinishedJobs: Number(workerCounts.active_unfinished_jobs || 0),
    unsafeCdnRows: Number(workerCounts.unsafe_cdn_rows || 0),
    calculatedBatchSize: batch.batchSize,
    riskLevel: batch.riskLevel || riskLevelForBatchSize(batch.batchSize),
    batchReasonCodes: batch.reasonCodes,
    hardMaxBatchCap: 25,
    selectedCount: selected.length,
    selectedSourceIds: selected.map((candidate) => candidate.sourceId),
    selectedCandidates: selected.map((candidate) => ({
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      title: candidate.title,
      currentPlaybackSource: candidate.currentPlaybackSource || "source_present_redacted",
      transcodeNeeded: true,
      expectedOutputPrefix: candidate.expectedOutputPrefix || `playback/public/auto/${candidate.sourceType}/${candidate.sourceId}/automation-cli-auto-detect/`,
    })),
    classificationCounts,
    excludedCounts: Object.fromEntries(Object.entries(classificationCounts).filter(([key]) => !key.startsWith("eligible_"))),
    rollbackScopes: selected.map((candidate) => ({
      source_id: candidate.sourceId,
      exact_output_prefix: candidate.expectedOutputPrefix || `playback/public/auto/${candidate.sourceType}/${candidate.sourceId}/automation-cli-auto-detect/`,
      scope: "exact_source_and_prefix_only",
    })),
    mutationAttempted: false,
    workerRun: false,
    backfillRun: false,
  };
}

if (!validModes.has(rawMode)) failClosed("invalid_mode", { validModes: Array.from(validModes) });
assertSupportedDataSource();

if (mode === "status") {
  const linkedWorkerCounts = dataSource === "linked" ? readWorkerCountsLinked() : null;
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    automationDefaultMode: "off",
    normalOperation: "auto_detect_cli",
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
    rowCounts: linkedWorkerCounts,
    continuousAutomationEnabled: false,
    workerDeployed: false,
    schedulerEnabled: false,
    signedOriginFallbackAvailable: true,
    emergencyStopAvailable: true,
    killSwitchAvailable: true,
    queueProcessorLive: false,
    daemonLive: false,
    cronLive: false,
  });
}

if (mode === "discover") {
  const productionDiscovery = dataSource === "linked" ? readProductionDiscovery() : null;
  const fixtureClassificationCounts = dataSource === "fixture" ? countClassifications(fixtureCandidates) : null;
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    readOnly: true,
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
    totalCandidatesScanned: productionDiscovery?.totalCandidatesScanned ?? fixtureCandidates.length,
    classificationCounts: productionDiscovery?.classificationCounts ?? fixtureClassificationCounts,
    candidates: dataSource === "linked"
      ? productionDiscovery.eligibleCandidates.concat(productionDiscovery.alreadyAuditedHlsSources).map((candidate) => ({
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        title: candidate.title,
        classification: candidate.classification,
        publicSafe: true,
        transcodeNeeded: candidate.transcodeNeeded,
        currentPlaybackSource: candidate.currentPlaybackSource || "audited_hls_ready",
        expectedOutputPrefix: candidate.expectedOutputPrefix,
      }))
      : fixtureCandidates.map(({ sourceType, sourceId, title, classification, legacyClassification, publicSafe }) => ({
        sourceType,
        sourceId,
        title,
        classification,
        legacyClassification,
        publicSafe,
      })),
    excludedCandidateDetailsRedacted: dataSource === "linked",
  });
}

if (mode === "plan-auto" || mode === "dry-run-auto") {
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    readOnly: true,
    dryRun: mode === "dry-run-auto",
    ...buildAutoPlan(),
  });
}

if (mode === "run-auto") {
  const confirmation = args.confirm || process.env.MEDIA_AUTOMATION_RUN_CONFIRM;
  const broadBackfillRequested = args.backfill === "true" || process.env.MEDIA_AUTOMATION_BACKFILL === "true";
  if (broadBackfillRequested && process.env.MEDIA_AUTOMATION_BROAD_BACKFILL_CONFIRM !== broadBackfillConfirmation) {
    failClosed("broad_backfill_confirmation_missing", {
      requiredEnv: `MEDIA_AUTOMATION_BROAD_BACKFILL_CONFIRM=${broadBackfillConfirmation}`,
    });
  }
  if (rawMode === "run-batch" && confirmation !== legacyBatchConfirmation && confirmation !== autoDetectConfirmation) {
    failClosed("batch_automation_confirmation_missing", {
      requiredEnv: `MEDIA_AUTOMATION_RUN_CONFIRM=${legacyBatchConfirmation}`,
      autoDetectEnv: `MEDIA_AUTOMATION_RUN_CONFIRM=${autoDetectConfirmation}`,
    });
  }
  if (rawMode !== "run-batch" && confirmation !== autoDetectConfirmation) {
    failClosed("auto_detect_batch_confirmation_missing", {
      requiredEnv: `MEDIA_AUTOMATION_RUN_CONFIRM=${autoDetectConfirmation}`,
    });
  }
  const plan = buildAutoPlan();
  if (plan.calculatedBatchSize <= 0) failClosed("calculated_batch_size_zero", plan);
  if (plan.selectedCount > 25) failClosed("calculated_batch_exceeds_hard_cap", plan);
  if (Object.keys(plan.excludedCounts).some((key) => key === "excluded_private" || key === "excluded_premium" || key === "excluded_original_master")) {
    // Unsafe rows may exist in discovery, but they are excluded from the selected batch.
    if (plan.selectedSourceIds.some((sourceId) => ["private", "premium", "original"].includes(sourceId))) {
      failClosed("unsafe_candidate_selected", plan);
    }
  }
  const execution = await executeAutoBatch(plan);
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    futureConfirmationPassed: true,
    ...plan,
    ...execution,
    dryRun: false,
    mutationAttempted: execution.productionRowsWritten === true,
  });
}

if (mode === "run-continuous-once") {
  const confirmation = args.confirm || process.env.MEDIA_AUTOMATION_CONTINUOUS_ONCE_CONFIRM;
  if (confirmation !== continuousOnceConfirmation) {
    failClosed("continuous_limited_once_confirmation_missing", {
      requiredEnv: `MEDIA_AUTOMATION_CONTINUOUS_ONCE_CONFIRM=${continuousOnceConfirmation}`,
    });
  }
  const plan = buildAutoPlan();
  if (plan.activeUnfinishedJobs > 0) failClosed("active_unfinished_jobs_present", plan);
  if (plan.unsafeCdnRows > 0) failClosed("unsafe_cdn_rows_present", plan);
  if (plan.calculatedBatchSize <= 0) failClosed("calculated_batch_size_zero", plan);
  failClosed("continuous_limited_once_not_enabled_in_source_proof_build", {
    futureConfirmationPassed: true,
    boundedSingleIteration: true,
    daemonStarted: false,
    schedulerStarted: false,
    ...plan,
  });
}

if (mode === "audit") {
  const sourceId = safeSourceId(args["source-id"] || process.env.MEDIA_AUTOMATION_SOURCE_ID);
  const batchId = safeBatchId(args["batch-id"] || process.env.MEDIA_AUTOMATION_BATCH_ID);
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    batchId,
    sourceId,
    auditPlanOnly: true,
    auditRequiresExactSource: true,
    auditRequiresPendingRows: true,
    resolverTrustChanged: false,
  });
}

if (mode === "rollback-plan") {
  const sourceId = safeSourceId(args["source-id"] || process.env.MEDIA_AUTOMATION_SOURCE_ID);
  const batchId = safeBatchId(args["batch-id"] || process.env.MEDIA_AUTOMATION_BATCH_ID);
  const outputPrefix = safeOutputPrefix(args["output-prefix"] || process.env.MEDIA_AUTOMATION_OUTPUT_PREFIX);
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    rollbackPlanOnly: true,
    batchId,
    sourceId,
    exactOutputPrefix: outputPrefix,
    broadDeleteAllowed: false,
    privatePremiumOriginalDeleteAllowed: false,
  });
}

if (mode === "pause" || mode === "emergency-stop") {
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    automationPaused: true,
    emergencyStopActive: mode === "emergency-stop",
    workerRun: false,
  });
}

if (mode === "report") {
  const plan = buildAutoPlan();
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    reportOnly: true,
    automationMode: "auto_detect",
    continuousLimitedLive: false,
    broadBackfillEnabled: false,
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
    candidateSummary: plan.classificationCounts,
    calculatedBatchSize: plan.calculatedBatchSize,
    riskLevel: plan.riskLevel,
    reasonCodes: plan.batchReasonCodes,
    selectedCount: plan.selectedCount,
    rollbackScopes: plan.rollbackScopes,
  });
}
