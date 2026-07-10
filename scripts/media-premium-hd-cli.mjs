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

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const ffmpegCommand = process.env.FFMPEG_BIN || "ffmpeg";
const ffprobeCommand = process.env.FFPROBE_BIN || "ffprobe";
const expectedProjectRef = "bmkkhihfbmsnnmcqkoly";
const defaultFunctionsUrl = `https://${expectedProjectRef}.supabase.co/functions/v1`;
const mediaScanGatewayFunctionUrl = `${String(process.env.MEDIA_SCAN_FUNCTIONS_URL || defaultFunctionsUrl).replace(/\/+$/g, "")}/media-scan-private-access`;
const protectedBucket = "chillywood-media-proof";
const protectedPrefix = "playback/protected/premium/";
const premiumWorkerHost = String(process.env.PREMIUM_MEDIA_WORKER_HOST || "premium-media.chillywoodstream.com")
  .trim()
  .replace(/^https?:\/\//i, "")
  .replace(/\/+$/g, "");
const workerVersion = "media-premium-hd-cli-v1";
const proofUserId = "premium-hd-proof-user";
const workerSecretDefaultFile = "/tmp/chillywood-premium-cdn-worker-proof-secret";
const scanOperatorDefaultFile = "/tmp/chillywood-media-scan-operator-token.env";

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, ...value] = arg.slice(2).split("=");
  return [key, value.length ? value.join("=") : "true"];
}));

const mode = String(args.mode || "plan").trim();
const validModes = new Set(["plan", "run", "audit", "report"]);
const confirmationValue = "I_UNDERSTAND_PREMIUM_HD_PROTECTED_BATCH";

const ladder = [
  { label: "720p", height: 720, bandwidth: 3000000, videoBitrate: "2600k", maxrate: "2782k", bufsize: "3900k", audioBandwidth: "128k" },
  { label: "1080p", height: 1080, bandwidth: 5800000, videoBitrate: "5200k", maxrate: "5564k", bufsize: "7800k", audioBandwidth: "160k" },
];

function safeExit(code, payload) {
  const output = JSON.stringify({
    noSecretsPrinted: true,
    tokensPrinted: false,
    signedUrlsPrinted: false,
    productionPlaybackSwitched: false,
    daemonDeployed: false,
    cronSchedulerAdded: false,
    schedulerAdded: false,
    ...payload,
  }, null, 2);
  if (code === 0) process.stdout.write(`${output}\n`);
  else process.stderr.write(`${output}\n`);
  process.exit(code);
}

function failClosed(reason, extra = {}) {
  safeExit(1, { ok: false, failClosed: true, mode, reason, ...extra });
}

function assertNoSecretLikeText(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (
    /postgres(?:ql)?:\/\//i.test(text)
    || /\bBearer\s+[A-Za-z0-9._-]+/i.test(text)
    || new RegExp(`\\bX-Amz-${"Signature"}=`, "i").test(text)
    || /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/.test(text)
    || /\b(service[_-]?role|secret_access_key|api_key|password)\b/i.test(text)
  ) {
    failClosed("secret_like_value_refused");
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function sqlUuidOrNull(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? `${sqlLiteral(text)}::uuid`
    : "null";
}

function runSupabaseLinkedQuery(sql) {
  const result = spawnSync(npxCommand, ["supabase", "db", "query", "--linked", "--output-format", "json", sql], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
    timeout: 120000,
  });
  assertNoSecretLikeText(result.stdout || "");
  assertNoSecretLikeText(result.stderr || "");
  if (result.status !== 0) failClosed("supabase_linked_query_failed", { stderrRedacted: true });
  try {
    return JSON.parse(result.stdout || "{}").rows || [];
  } catch {
    failClosed("supabase_linked_query_json_parse_failed");
  }
}

function commandAvailable(command) {
  return spawnSync(command, ["--version"], { cwd: repoRoot, stdio: "ignore" }).status === 0
    || spawnSync(command, ["-version"], { cwd: repoRoot, stdio: "ignore" }).status === 0;
}

function readTokenFromFile(filePath) {
  if (!filePath || !existsSync(filePath)) return "";
  const text = readFileSync(filePath, "utf8");
  const envMatch = text.match(/^MEDIA_SCAN_OPERATOR_TOKEN=(.+)$/m);
  return (envMatch?.[1] || text).trim();
}

function readScannerOperatorToken() {
  const token = String(process.env.MEDIA_SCAN_OPERATOR_TOKEN || readTokenFromFile(process.env.MEDIA_SCAN_OPERATOR_TOKEN_FILE || scanOperatorDefaultFile)).trim();
  if (!token || token.length < 32) {
    failClosed("media_scan_operator_token_missing", {
      acceptedSources: ["MEDIA_SCAN_OPERATOR_TOKEN", "MEDIA_SCAN_OPERATOR_TOKEN_FILE", "existing_untracked_tmp_token_file"],
      rawServiceRoleRequired: false,
      rawStorageCredentialsRequired: false,
    });
  }
  return token;
}

function readWorkerSecret() {
  const secretFile = String(process.env.PREMIUM_CDN_TOKEN_SECRET_FILE || workerSecretDefaultFile).trim();
  const secret = String(process.env.PREMIUM_CDN_TOKEN_SECRET || (secretFile && existsSync(secretFile) ? readFileSync(secretFile, "utf8") : "")).trim();
  if (!secret || secret.length < 32) {
    failClosed("premium_cdn_worker_proof_secret_missing", {
      acceptedSources: ["PREMIUM_CDN_TOKEN_SECRET", "PREMIUM_CDN_TOKEN_SECRET_FILE", "existing_untracked_tmp_secret_file"],
      tokenPrinted: false,
    });
  }
  return secret;
}

function readCounts() {
  const rows = runSupabaseLinkedQuery(`
    select json_build_object(
      'media_transcode_jobs', (select count(*)::int from public.media_transcode_jobs),
      'media_renditions', (select count(*)::int from public.media_renditions),
      'premium_hd_renditions', (select count(*)::int from public.media_renditions where delivery_provider = 'cloudflare_r2_premium_token' and rendition_label in ('720p', '1080p') and is_ready = true),
      'unsafe_public_hd_rows', (select count(*)::int from public.media_renditions where rendition_label in ('720p', '1080p') and (public_playback_path like 'playback/public/%' or visibility = 'public')),
      'active_unfinished_jobs', (select count(*)::int from public.media_transcode_jobs where status not in ('ready', 'failed', 'canceled')),
      'unsafe_cdn_rows', (select count(*)::int from public.media_renditions where delivery_provider = 'cloudflare_r2_custom_domain' and not (is_ready = true and is_public_playback_safe = true and visibility = 'public' and is_original = false and storage_provider = 'cloudflare_r2' and bucket_role = 'public_playback' and scan_status in ('clean', 'approved') and moderation_status in ('clean', 'approved', 'allowed') and public_playback_path like 'playback/public/%')),
      'private_count', (select count(*)::int from public.videos where coalesce(visibility, '') <> 'public'),
      'premium_count', (
        select count(*)::int from public.videos v
        where exists (select 1 from public.creator_content_prices p where p.content_id = v.id and coalesce(p.is_paid, false) = true and coalesce(p.status, '') not in ('disabled', 'deleted', 'inactive'))
           or exists (select 1 from public.creator_monetization_configs m where m.source_id = v.id and coalesce(m.status, '') not in ('disabled', 'deleted', 'inactive') and (coalesce(m.creates_digital_access, false) = true or coalesce(m.production_enabled, false) = true or coalesce(m.product_type, '') ilike '%paid%'))
      )
    ) as counts;
  `);
  return rows[0]?.counts || {};
}

function buildPlan() {
  const rows = runSupabaseLinkedQuery(`
    with public_hls_sources as (
      select
        r.source_type,
        r.source_id,
        max(coalesce(v.title, 'Untitled video')) as title,
        max(v.owner_id::text) as creator_id,
        max(j.source_width)::int as source_width,
        max(j.source_height)::int as source_height,
        max(j.source_codec) as source_codec,
        max(coalesce(v.scan_status, '')) as scan_status,
        max(coalesce(v.moderation_status, '')) as moderation_status,
        max(coalesce(v.visibility, '')) as visibility,
        bool_or(
          exists (select 1 from public.creator_content_prices p where p.content_id = v.id and coalesce(p.is_paid, false) = true and coalesce(p.status, '') not in ('disabled', 'deleted', 'inactive'))
          or exists (select 1 from public.creator_monetization_configs m where m.source_id = v.id and coalesce(m.status, '') not in ('disabled', 'deleted', 'inactive') and (coalesce(m.creates_digital_access, false) = true or coalesce(m.production_enabled, false) = true or coalesce(m.product_type, '') ilike '%paid%'))
        ) as premium_locked,
        coalesce(array_agg(distinct r.rendition_label order by r.rendition_label), array[]::text[]) as public_labels
      from public.media_renditions r
      join public.media_transcode_jobs j on j.id = r.job_id
      join public.videos v on v.id::text = r.source_id
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
      group by r.source_type, r.source_id
    ),
    existing_hd as (
      select source_type, source_id, coalesce(array_agg(distinct rendition_label order by rendition_label), array[]::text[]) as labels
      from public.media_renditions
      where source_type = 'creator_video'
        and delivery_format = 'hls'
        and rendition_label in ('720p', '1080p')
      group by source_type, source_id
    )
    select json_build_object(
      'sources', coalesce(json_agg(json_build_object(
        'sourceType', s.source_type,
        'sourceId', s.source_id,
        'title', s.title,
        'creatorId', s.creator_id,
        'sourceWidth', s.source_width,
        'sourceHeight', s.source_height,
        'sourceCodec', s.source_codec,
        'scanStatus', s.scan_status,
        'moderationStatus', s.moderation_status,
        'visibility', s.visibility,
        'premiumLocked', s.premium_locked,
        'publicLabels', s.public_labels,
        'existingHdLabels', coalesce(h.labels, array[]::text[])
      ) order by s.title, s.source_id), '[]'::json)
    ) as plan
    from public_hls_sources s
    left join existing_hd h on h.source_type = s.source_type and h.source_id = s.source_id;
  `);
  const sources = rows[0]?.plan?.sources || [];
  const classified = sources.map((source) => {
    const height = Number(source.sourceHeight || 0);
    const supported = ladder.filter((entry) => height >= entry.height).map((entry) => entry.label);
    const existing = Array.isArray(source.existingHdLabels) ? source.existingHdLabels : [];
    const missing = supported.filter((label) => !existing.includes(label));
    let classification = "already_complete_for_source";
    if (height < 720) classification = "no_hd_needed_low_source";
    else if (source.visibility !== "public" || source.premiumLocked === true) classification = "blocked_source_not_public_free";
    else if (!["clean", "approved"].includes(String(source.scanStatus || "").toLowerCase())) classification = "blocked_scan_not_clean";
    else if (!["clean", "approved", "allowed"].includes(String(source.moderationStatus || "").toLowerCase())) classification = "blocked_moderation_not_allowed";
    else if (missing.includes("1080p")) classification = "hd_missing_1080_source";
    else if (missing.includes("720p")) classification = "hd_missing_720_source";
    return {
      ...source,
      sourceHeight: height,
      sourceWidth: Number(source.sourceWidth || 0),
      supportedPremiumRenditions: supported,
      missingPremiumRenditions: missing,
      classification,
      expectedOutputPrefix: `${protectedPrefix}${source.sourceType}/${source.sourceId}/premium-hd-batch/`,
      rollbackScope: "exact_source_and_protected_prefix_only",
    };
  });
  const selected = classified.filter((source) => source.missingPremiumRenditions.length > 0 && source.classification.startsWith("hd_missing_"));
  const counts = {
    totalAuditedPublicSafeSources: classified.length,
    noHdNeededLowSource: classified.filter((source) => source.classification === "no_hd_needed_low_source").length,
    hdMissing720Source: classified.filter((source) => source.classification === "hd_missing_720_source").length,
    hdMissing1080Source: classified.filter((source) => source.classification === "hd_missing_1080_source").length,
    alreadyCompleteForSource: classified.filter((source) => source.classification === "already_complete_for_source").length,
    selectedHdCapableSources: selected.length,
    selectedRenditionCount: selected.reduce((sum, source) => sum + source.missingPremiumRenditions.length, 0),
  };
  return { classified, selected, counts, productionCounts: readCounts() };
}

function sanitizeSource(source) {
  const { creatorId: _creatorId, ...rest } = source;
  return {
    ...rest,
    creatorIdRedacted: !!source.creatorId,
  };
}

function sanitizePlan(plan) {
  return {
    ...plan,
    classified: plan.classified.map(sanitizeSource),
    selected: plan.selected.map(sanitizeSource),
  };
}

function runFfprobeJson(target) {
  try {
    const output = execFileSync(
      ffprobeCommand,
      ["-v", "error", "-show_entries", "stream=index,codec_type,codec_name,width,height,bit_rate:format=duration,bit_rate", "-of", "json", target],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 },
    );
    assertNoSecretLikeText(output);
    return JSON.parse(output || "{}");
  } catch {
    failClosed("ffprobe_failed");
  }
}

function durationMillis(probe) {
  return Math.max(1, Math.round(Number(probe?.format?.duration || 0) * 1000));
}

function sha256File(filePath) {
  return `sha256:${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
}

async function downloadSource(candidate) {
  const token = readScannerOperatorToken();
  const response = await fetch(mediaScanGatewayFunctionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-media-scan-operator-token": token,
    },
    body: JSON.stringify({
      action: "premium_hd_download",
      source_type: candidate.sourceType,
      source_id: candidate.sourceId,
    }),
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    failClosed("trusted_premium_hd_download_denied", {
      httpStatus: response.status,
      errorCode: typeof payload?.error === "string" ? payload.error : "download_denied",
      blockedReasons: Array.isArray(payload?.blockedReasons) ? payload.blockedReasons : undefined,
      rawServiceRoleRequired: false,
      rawStorageCredentialsRequired: false,
    });
  }
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-premium-hd-source-"));
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
    failClosed("trusted_premium_hd_download_failed");
  }
}

function generateRendition(inputPath, outputRoot, rendition) {
  const outputDir = path.join(outputRoot, rendition.label);
  mkdirSync(outputDir, { recursive: true });
  execFileSync(
    ffmpegCommand,
    [
      "-y",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-sn",
      "-vf", `scale=-2:${rendition.height}`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-profile:v", "main",
      "-crf", "22",
      "-b:v", rendition.videoBitrate,
      "-maxrate", rendition.maxrate,
      "-bufsize", rendition.bufsize,
      "-c:a", "aac",
      "-b:a", rendition.audioBandwidth,
      "-ac", "2",
      "-hls_time", "4",
      "-hls_playlist_type", "vod",
      "-hls_segment_filename", path.join(outputDir, "segment-%03d.ts"),
      path.join(outputDir, "index.m3u8"),
    ],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 240000 },
  );
  const variantPath = path.join(outputDir, "index.m3u8");
  const probe = runFfprobeJson(variantPath);
  const stream = Array.isArray(probe?.streams) ? probe.streams.find((entry) => Number(entry.width) > 0) : null;
  const segments = readdirSync(outputDir).filter((entry) => entry.endsWith(".ts")).sort();
  if (!segments.length) failClosed("premium_hd_segments_missing", { renditionLabel: rendition.label });
  const masterPath = path.join(outputDir, "master.m3u8");
  writeFileSync(masterPath, [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${Number(stream?.width || 0)}x${Number(stream?.height || rendition.height)}`,
    "index.m3u8",
    "",
  ].join("\n"));
  for (const file of [masterPath, variantPath]) {
    const text = readFileSync(file, "utf8");
    assertNoSecretLikeText(text);
    if (/https?:\/\//i.test(text)) failClosed("premium_hd_manifest_contains_absolute_url", { renditionLabel: rendition.label });
  }
  execFileSync(ffmpegCommand, ["-v", "error", "-i", masterPath, "-t", "1", "-f", "null", "-"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 90000,
  });
  return {
    ...rendition,
    width: Number(stream?.width || 0),
    height: Number(stream?.height || rendition.height),
    durationMillis: durationMillis(probe),
    bitrate: Number(stream?.bit_rate || rendition.bandwidth),
    segments,
    fileSizeBytes: statSync(masterPath).size + statSync(variantPath).size + segments.reduce((sum, segment) => sum + statSync(path.join(outputDir, segment)).size, 0),
  };
}

function assertProtectedKey(key) {
  const normalized = String(key || "").replace(/\\/g, "/").replace(/^\/+/g, "");
  if (!normalized.startsWith(protectedPrefix)) failClosed("premium_hd_key_outside_protected_prefix", { key: normalized });
  if (/(^|\/)(originals?|masters?|sources?|uploads|private|processing|moderation[-_]blocked|unscanned)(\/|$)/i.test(normalized)) {
    failClosed("premium_hd_key_forbidden_prefix", { key: normalized });
  }
  return normalized;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filePath.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

function cacheControlFor(filePath) {
  return filePath.endsWith(".m3u8") ? "private, max-age=60" : "private, max-age=31536000, immutable";
}

function uploadObject(key, filePath) {
  const safeKey = assertProtectedKey(key);
  const fileBytes = statSync(filePath).size;
  const result = spawnSync(npxCommand, [
    "wrangler", "r2", "object", "put", `${protectedBucket}/${safeKey}`,
    "--file", filePath,
    "--remote",
    "--content-type", contentTypeFor(filePath),
    "--cache-control", cacheControlFor(filePath),
    "--force",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300000,
    maxBuffer: 20 * 1024 * 1024,
  });
  assertNoSecretLikeText(result.stdout || "");
  assertNoSecretLikeText(result.stderr || "");
  if (result.status !== 0) {
    failClosed("premium_hd_r2_upload_failed", {
      key: safeKey,
      fileBytes,
      stderrSnippet: String(result.stderr || "").replace(/\x1b\[[0-9;]*m/g, "").slice(0, 500),
      stdoutSnippet: String(result.stdout || "").replace(/\x1b\[[0-9;]*m/g, "").slice(0, 200),
    });
  }
  return { key: safeKey, bytes: statSync(filePath).size, cacheControl: cacheControlFor(filePath), contentType: contentTypeFor(filePath) };
}

async function signWorkerToken(claims) {
  const secret = readWorkerSecret();
  const worker = await import("../workers/premium-media-access/worker.mjs");
  return worker.signPremiumMediaAccessTokenForProof(claims, secret);
}

async function fetchWorkerPath(pathname, { token = "", userId = proofUserId } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (userId) headers["x-premium-user-id"] = userId;
  const response = await fetch(`https://${premiumWorkerHost}/${pathname}`, { headers, signal: AbortSignal.timeout(60000) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    byteLength: bytes.length,
    contentType: response.headers.get("content-type") || "",
    accessHeader: response.headers.get("x-premium-media-access") || "",
    cacheControl: response.headers.get("cache-control") || "",
    text: pathname.endsWith(".m3u8") || pathname.endsWith(".txt") ? new TextDecoder().decode(bytes) : "",
    bytes,
  };
}

async function proveWorkerAccess(candidate, batchId, rendition, outputRoot) {
  const masterPath = `${protectedPrefix}${candidate.sourceType}/${candidate.sourceId}/${batchId}/${rendition.label}/master.m3u8`;
  const variantPath = `${protectedPrefix}${candidate.sourceType}/${candidate.sourceId}/${batchId}/${rendition.label}/index.m3u8`;
  const segmentPath = `${protectedPrefix}${candidate.sourceType}/${candidate.sourceId}/${batchId}/${rendition.label}/${rendition.segments[0]}`;
  const now = Math.floor(Date.now() / 1000);
  const claimsFor = (requestPath, label = rendition.label, patch = {}) => ({
    tokenType: "premium_cdn_playback",
    version: 1,
    premiumEntitlement: true,
    userId: proofUserId,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    renditionLabel: label,
    path: requestPath,
    issuedAtEpochSeconds: now,
    expiresAtEpochSeconds: now + 300,
    scope: "single_hls_rendition",
    ...patch,
  });
  const masterToken = await signWorkerToken(claimsFor(masterPath));
  const variantToken = await signWorkerToken(claimsFor(variantPath));
  const segmentToken = await signWorkerToken(claimsFor(segmentPath));
  const master = await fetchWorkerPath(masterPath, { token: masterToken });
  const variant = await fetchWorkerPath(variantPath, { token: variantToken });
  const segment = await fetchWorkerPath(segmentPath, { token: segmentToken });
  if (!master.ok || !master.text.includes("#EXTM3U")) failClosed("premium_hd_worker_master_fetch_failed", { status: master.status, renditionLabel: rendition.label });
  if (!variant.ok || !variant.text.includes("#EXTM3U")) failClosed("premium_hd_worker_variant_fetch_failed", { status: variant.status, renditionLabel: rendition.label });
  if (!segment.ok || segment.byteLength <= 0) failClosed("premium_hd_worker_segment_fetch_failed", { status: segment.status, renditionLabel: rendition.label });
  assertNoSecretLikeText(master.text);
  assertNoSecretLikeText(variant.text);
  const missingToken = await fetchWorkerPath(masterPath);
  const freeToken = await signWorkerToken(claimsFor(masterPath, rendition.label, { premiumEntitlement: false }));
  const freeDenied = await fetchWorkerPath(masterPath, { token: freeToken });
  const wrongPathToken = await signWorkerToken(claimsFor(`${protectedPrefix}${candidate.sourceType}/${candidate.sourceId}/${batchId}/${rendition.label}/wrong.m3u8`));
  const wrongPathDenied = await fetchWorkerPath(masterPath, { token: wrongPathToken });
  if (missingToken.status !== 403 || freeDenied.status !== 403 || wrongPathDenied.status !== 403) {
    failClosed("premium_hd_worker_denial_failed", {
      missingTokenStatus: missingToken.status,
      freeTokenStatus: freeDenied.status,
      wrongPathStatus: wrongPathDenied.status,
    });
  }
  const tmpProofDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-premium-hd-worker-proof-"));
  try {
    const localVariantDir = path.join(tmpProofDir, rendition.label);
    mkdirSync(localVariantDir, { recursive: true });
    writeFileSync(path.join(localVariantDir, "index.m3u8"), variant.text);
    writeFileSync(path.join(localVariantDir, rendition.segments[0]), segment.bytes);
    execFileSync(ffmpegCommand, ["-v", "error", "-i", path.join(localVariantDir, "index.m3u8"), "-t", "1", "-f", "null", "-"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });
  } finally {
    rmSync(tmpProofDir, { recursive: true, force: true });
  }
  return {
    renditionLabel: rendition.label,
    master: { status: master.status, byteLength: master.byteLength, path: masterPath },
    variant: { status: variant.status, byteLength: variant.byteLength, path: variantPath },
    segment: { status: segment.status, byteLength: segment.byteLength, path: segmentPath, cacheControl: segment.cacheControl },
    missingTokenDenied: missingToken.status === 403,
    freeTokenDenied: freeDenied.status === 403,
    wrongPathDenied: wrongPathDenied.status === 403,
    ffmpegDecodeViaWorkerBytes: "passed",
    localGeneratedDecode: existsSync(path.join(outputRoot, rendition.label, "master.m3u8")) ? "passed" : "not_recorded",
  };
}

function insertJob({ jobId, candidate, batchId, outputPrefix, labels, sourceHash, probe }) {
  runSupabaseLinkedQuery(`
    insert into public.media_transcode_jobs (
      id, source_type, source_id, creator_id, input_provider, input_bucket_role, input_bucket, input_path,
      output_provider, output_bucket_role, output_bucket, output_prefix, status, requested_renditions,
      completed_renditions, duration_ms, source_width, source_height, source_codec, worker_version, source_hash, proof_mode,
      started_at, completed_at
    ) values (
      ${sqlLiteral(jobId)}::uuid,
      ${sqlLiteral(candidate.sourceType)},
      ${sqlLiteral(candidate.sourceId)},
      ${sqlUuidOrNull(candidate.creatorId)},
      'origin_signed_direct',
      'private_origin',
      '',
      'redacted-private-source',
      'cloudflare_r2_premium_token',
      'protected_premium',
      ${sqlLiteral(protectedBucket)},
      ${sqlLiteral(outputPrefix)},
      'ready',
      ${sqlJson(labels)},
      ${sqlJson(labels.map((label) => ({ label, protected: true })))},
      ${durationMillis(probe)},
      ${Number(candidate.sourceWidth || 0)},
      ${Number(candidate.sourceHeight || 0)},
      ${sqlLiteral(candidate.sourceCodec || "")},
      ${sqlLiteral(workerVersion)},
      ${sqlLiteral(sourceHash)},
      false,
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    ) returning id;
  `);
}

function insertAndPromoteRenditions({ jobId, candidate, batchId, outputPrefix, renditions, durationMs, sourceHash }) {
  for (const rendition of renditions) {
    const manifestPath = `${outputPrefix}${rendition.label}/master.m3u8`;
    const variantPath = `${outputPrefix}${rendition.label}/index.m3u8`;
    runSupabaseLinkedQuery(`
      insert into public.media_renditions (
        job_id, media_id, video_id, source_type, source_id, creator_id, rendition_label,
        delivery_format, delivery_provider, storage_provider, bucket_role, storage_bucket, storage_path,
        public_playback_path, protected_playback_path, manifest_path, variant_playlist_path,
        width, height, duration_ms, codec, bitrate, file_size_bytes, cache_policy, visibility,
        scan_status, moderation_status, is_public_playback_safe, is_protected_playback_safe,
        is_original, is_ready, worker_version, source_hash
      ) values (
        ${sqlLiteral(jobId)}::uuid,
        ${sqlLiteral(candidate.sourceId)},
        ${sqlLiteral(candidate.sourceId)}::uuid,
        ${sqlLiteral(candidate.sourceType)},
        ${sqlLiteral(candidate.sourceId)},
        ${sqlUuidOrNull(candidate.creatorId)},
        ${sqlLiteral(rendition.label)},
        'hls',
        'origin_signed_direct',
        'cloudflare_r2',
        'protected_premium',
        ${sqlLiteral(protectedBucket)},
        ${sqlLiteral(variantPath)},
        null,
        ${sqlLiteral(manifestPath)},
        ${sqlLiteral(manifestPath)},
        ${sqlLiteral(variantPath)},
        ${rendition.width},
        ${rendition.height},
        ${durationMs},
        'h264/aac',
        ${rendition.bitrate || rendition.bandwidth},
        ${rendition.fileSizeBytes || 0},
        'premium_hls_worker_token_manifests_60_segments_immutable',
        'premium',
        ${sqlLiteral(candidate.scanStatus)},
        ${sqlLiteral(candidate.moderationStatus)},
        false,
        true,
        false,
        false,
        ${sqlLiteral(workerVersion)},
        ${sqlLiteral(sourceHash)}
      ) returning id;
    `);
  }
  const auditRows = runSupabaseLinkedQuery(`
    select json_build_object(
      'rowCount', count(*)::int,
      'unsafeRows', count(*) filter (
        where source_id <> ${sqlLiteral(candidate.sourceId)}
          or source_type <> ${sqlLiteral(candidate.sourceType)}
          or delivery_format <> 'hls'
          or bucket_role <> 'protected_premium'
          or storage_provider <> 'cloudflare_r2'
          or visibility <> 'premium'
          or is_original = true
          or is_public_playback_safe = true
          or is_protected_playback_safe <> true
          or scan_status not in ('clean', 'approved')
          or moderation_status not in ('clean', 'approved', 'allowed')
          or protected_playback_path not like ${sqlLiteral(`${outputPrefix}%`)}
          or manifest_path not like ${sqlLiteral(`${outputPrefix}%`)}
          or coalesce(public_playback_path, '') <> ''
      )::int,
      'labels', coalesce(json_agg(rendition_label order by rendition_label), '[]'::json)
    ) as audit
    from public.media_renditions
    where job_id = ${sqlLiteral(jobId)}::uuid;
  `);
  const audit = auditRows[0]?.audit || {};
  if (Number(audit.rowCount || 0) !== renditions.length || Number(audit.unsafeRows || 0) !== 0) {
    failClosed("premium_hd_post_write_audit_failed", { jobId, sourceId: candidate.sourceId, audit });
  }
  runSupabaseLinkedQuery(`
    update public.media_renditions
    set delivery_provider = 'cloudflare_r2_premium_token',
        is_ready = true
    where job_id = ${sqlLiteral(jobId)}::uuid
      and source_id = ${sqlLiteral(candidate.sourceId)}
      and source_type = ${sqlLiteral(candidate.sourceType)}
      and delivery_format = 'hls'
      and rendition_label in (${renditions.map((rendition) => sqlLiteral(rendition.label)).join(", ")})
      and bucket_role = 'protected_premium'
      and storage_provider = 'cloudflare_r2'
      and visibility = 'premium'
      and is_public_playback_safe = false
      and is_protected_playback_safe = true
      and is_original = false
      and scan_status in ('clean', 'approved')
      and moderation_status in ('clean', 'approved', 'allowed')
      and protected_playback_path like ${sqlLiteral(`${outputPrefix}%`)}
      and manifest_path like ${sqlLiteral(`${outputPrefix}%`)}
      and coalesce(public_playback_path, '') = ''
    returning id;
  `);
  return audit;
}

async function executeCandidate(candidate) {
  const labels = candidate.missingPremiumRenditions;
  const selectedRenditions = ladder.filter((entry) => labels.includes(entry.label));
  const batchId = `premium-hd-${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}-${randomUUID().slice(0, 12)}`;
  const outputPrefix = assertProtectedKey(`${protectedPrefix}${candidate.sourceType}/${candidate.sourceId}/${batchId}/`);
  const jobId = randomUUID();
  const download = await downloadSource(candidate);
  const outputRoot = mkdtempSync(path.join(os.tmpdir(), "chillywood-premium-hd-hls-"));
  try {
    const probe = runFfprobeJson(download.tmpFile);
    const stream = Array.isArray(probe?.streams) ? probe.streams.find((entry) => entry.codec_type === "video" && Number(entry.height) > 0) : null;
    const sourceHeight = Number(stream?.height || 0);
    for (const rendition of selectedRenditions) {
      if (sourceHeight < rendition.height) failClosed("premium_hd_fake_upscale_refused", { sourceId: candidate.sourceId, sourceHeight, renditionLabel: rendition.label });
    }
    const sourceHash = sha256File(download.tmpFile);
    const generated = selectedRenditions.map((rendition) => generateRendition(download.tmpFile, outputRoot, rendition));
    const uploaded = [];
    for (const rendition of generated) {
      uploaded.push(uploadObject(`${outputPrefix}${rendition.label}/master.m3u8`, path.join(outputRoot, rendition.label, "master.m3u8")));
      uploaded.push(uploadObject(`${outputPrefix}${rendition.label}/index.m3u8`, path.join(outputRoot, rendition.label, "index.m3u8")));
      for (const segment of rendition.segments) {
        uploaded.push(uploadObject(`${outputPrefix}${rendition.label}/${segment}`, path.join(outputRoot, rendition.label, segment)));
      }
    }
    const workerProofs = [];
    for (const rendition of generated) {
      workerProofs.push(await proveWorkerAccess(candidate, batchId, rendition, outputRoot));
    }
    insertJob({ jobId, candidate, batchId, outputPrefix, labels, sourceHash, probe });
    const audit = insertAndPromoteRenditions({
      jobId,
      candidate,
      batchId,
      outputPrefix,
      renditions: generated,
      durationMs: durationMillis(probe),
      sourceHash,
    });
    return {
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      title: candidate.title,
      batchId,
      jobId,
      outputPrefix,
      renditionLabels: generated.map((rendition) => rendition.label),
      uploadedObjectCount: uploaded.length,
      workerProofs: workerProofs.map((proof) => ({
        renditionLabel: proof.renditionLabel,
        masterStatus: proof.master.status,
        variantStatus: proof.variant.status,
        segmentStatus: proof.segment.status,
        freeTokenDenied: proof.freeTokenDenied,
        missingTokenDenied: proof.missingTokenDenied,
        wrongPathDenied: proof.wrongPathDenied,
        decode: proof.ffmpegDecodeViaWorkerBytes,
      })),
      rowAudit: audit,
      rollbackScope: {
        source_id: candidate.sourceId,
        exact_output_prefix: outputPrefix,
        batch_id: batchId,
      },
      sourceDownloadedViaBackendGateway: true,
      sourceStorageProvider: download.storageProvider,
      downloadedBytes: download.downloadedBytes,
    };
  } finally {
    rmSync(download.tmpDir, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
  }
}

async function run() {
  if (!validModes.has(mode)) failClosed("invalid_mode", { validModes: Array.from(validModes) });
  const plan = buildPlan();
  if (mode === "plan") {
    safeExit(0, {
      ok: true,
      readOnly: true,
      plan: sanitizePlan(plan),
      productionRowsWritten: false,
      mediaProcessed: false,
    });
  }
  if (mode === "audit" || mode === "report") {
    safeExit(0, {
      ok: true,
      readOnly: true,
      counts: readCounts(),
      planCounts: plan.counts,
      selectedRemaining: plan.selected.map((source) => ({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        title: source.title,
        missingPremiumRenditions: source.missingPremiumRenditions,
        classification: source.classification,
      })),
      productionRowsWritten: false,
      mediaProcessed: false,
    });
  }
  if (String(process.env.MEDIA_PREMIUM_HD_RUN_CONFIRM || "").trim() !== confirmationValue) {
    failClosed("premium_hd_run_confirmation_missing", {
      requiredEnv: "MEDIA_PREMIUM_HD_RUN_CONFIRM",
      requiredValue: confirmationValue,
      manualSourceIdsRequired: false,
      manualBatchSizeRequired: false,
    });
  }
  if (!commandAvailable(ffmpegCommand) || !commandAvailable(ffprobeCommand)) failClosed("ffmpeg_or_ffprobe_missing");
  if (Number(plan.productionCounts.active_unfinished_jobs || 0) !== 0) failClosed("active_unfinished_jobs_present", { counts: plan.productionCounts });
  if (Number(plan.productionCounts.unsafe_cdn_rows || 0) !== 0) failClosed("unsafe_cdn_rows_present", { counts: plan.productionCounts });
  if (Number(plan.productionCounts.unsafe_public_hd_rows || 0) !== 0) failClosed("unsafe_public_hd_rows_present", { counts: plan.productionCounts });
  if (!plan.selected.length) {
    safeExit(0, {
      ok: true,
      verdict: "pass_no_op",
      planCounts: plan.counts,
      productionRowsWritten: false,
      mediaProcessed: false,
    });
  }
  const maxSources = Number.parseInt(String(process.env.MEDIA_PREMIUM_HD_MAX_SOURCES || args.maxSources || "4"), 10);
  const selected = plan.selected.slice(0, Math.max(0, Math.min(maxSources, 4)));
  const processed = [];
  for (const candidate of selected) {
    processed.push(await executeCandidate(candidate));
  }
  safeExit(0, {
    ok: true,
    executionMode: "linked_real_premium_hd_protected_batch",
    sourceCount: processed.length,
    renditionCount: processed.reduce((sum, source) => sum + source.renditionLabels.length, 0),
    processed,
    finalCounts: readCounts(),
    productionRowsWritten: processed.length > 0,
    mediaProcessed: processed.length > 0,
    publicUnsignedHdExposure: false,
    protectedWorkerRequired: true,
    freeUserHdDenied: processed.every((source) => source.workerProofs.every((proof) => proof.freeTokenDenied)),
  });
}

await run();
