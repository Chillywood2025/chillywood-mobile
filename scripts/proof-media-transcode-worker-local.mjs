#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const ffprobeCommand = process.env.FFPROBE_BIN || "ffprobe";
const ffmpegCommand = process.env.FFMPEG_BIN || "ffmpeg";
const migrationPath = "supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql";
const realDemoVideoId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const sourceMp4Path = "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4";
const sourceMp4Url = `https://media.chillywoodstream.com/${sourceMp4Path}`;
const sourceShaShort = "b670602fa00934ca";
const outputPrefix = "playback/public/proof-worker/chillywood-city-lights/v1-b670602fa00934ca-local-hls";
const hlsMasterPath = `${outputPrefix}/master.m3u8`;
const fallbackUrl = "origin-signed-direct-fallback";
const publicConfig = {
  deliveryProvider: "cloudflare_r2_custom_domain",
  cdnBaseUrl: "https://media.chillywoodstream.com",
  cdnSigningMode: "off",
  cdnPublicPlaybackPrefix: "playback/public/",
  cdnPrivatePlaybackDisabled: true,
  cdnAllowedPublicPlaybackPaths: [hlsMasterPath],
};
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

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-transcode-worker-helpers-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaDelivery.ts",
        "_lib/mediaDeliveryTelemetry.ts",
        "_lib/mediaTranscodeQueue.ts",
        "_lib/mediaRenditionMetadata.ts",
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
      mediaDelivery: loadCompiled("mediaDelivery.js"),
      mediaRenditionMetadata: loadCompiled("mediaRenditionMetadata.js"),
      telemetry: loadCompiled("mediaDeliveryTelemetry.js"),
      transcodeQueue: loadCompiled("mediaTranscodeQueue.js"),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const runFfprobeJson = (target) => (
  JSON.parse(execFileSync(
    ffprobeCommand,
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,width,height:format=duration",
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
  ))
);

const runFfmpegDecode = (target) => {
  execFileSync(
    ffmpegCommand,
    ["-v", "error", "-i", target, "-t", "1", "-f", "null", "-"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    },
  );
};

const downloadFile = async (url, targetPath) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`download failed ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  writeFileSync(targetPath, bytes);
  return bytes;
};

const generateRendition = (inputPath, outputRoot, rendition) => {
  const outputDir = path.join(outputRoot, rendition.label);
  mkdirSync(outputDir, { recursive: true });
  execFileSync(
    ffmpegCommand,
    [
      "-y",
      "-i",
      inputPath,
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
      timeout: 120000,
    },
  );
  const probe = runFfprobeJson(path.join(outputDir, "index.m3u8"));
  const videoStream = probe.streams?.find((stream) => Number(stream.width) > 0) ?? {};
  const segments = readdirSync(outputDir).filter((entry) => entry.endsWith(".ts")).sort();
  requireProof(segments.length > 0, `${rendition.label} should produce HLS segments`);
  return {
    ...rendition,
    outputDir,
    playlistPath: path.join(outputDir, "index.m3u8"),
    segmentPaths: segments.map((segment) => path.join(outputDir, segment)),
    width: Number(videoStream.width ?? 0),
    height: Number(videoStream.height ?? 0),
    duration: Number(probe.format?.duration ?? 0),
  };
};

const writeMasterManifest = (outputRoot, generatedRenditions) => {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const rendition of generatedRenditions) {
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${rendition.width}x${rendition.height}`);
    lines.push(`${rendition.label}/index.m3u8`);
  }
  const masterPath = path.join(outputRoot, "master.m3u8");
  writeFileSync(masterPath, `${lines.join("\n")}\n`);
  return masterPath;
};

const contentTypeFor = (filePath) => {
  if (filePath.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filePath.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
};

const cacheControlFor = (filePath) => {
  if (filePath.endsWith(".ts")) return "public, max-age=31536000, immutable";
  return "public, max-age=300";
};

const hasForbiddenPathSegment = (objectKey) => {
  const forbidden = new Set([
    "original",
    "originals",
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
  return objectKey
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .some((segment) => forbidden.has(segment));
};

const assertNoSignedOrSecretUrl = (label, value) => {
  const text = String(value ?? "");
  const sensitivePatterns = [
    /[?&]X-Amz-Signature=/i,
    /[?&]X-Amz-Credential=/i,
    /[?&]X-Amz-Security-Token=/i,
    /[?&](token|signature|credential|policy)=/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  ];
  for (const pattern of sensitivePatterns) {
    requireProof(!pattern.test(text), `${label} must not contain signed-origin or secret-like text matching ${pattern}`);
  }
};

const assertNoSecretLikeText = (label, value) => {
  const text = JSON.stringify(value);
  const secretPatterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b/,
    /\b(Bearer|service_role|password|access_key|api_key)\b/i,
  ];
  for (const pattern of secretPatterns) {
    requireProof(!pattern.test(text), `${label} output contains secret-like text matching ${pattern}`);
  }
};

const buildSimulatedUploadManifest = (outputRoot, generatedRenditions) => {
  const uploaded = [];
  const addFile = (relativePath) => {
    const localPath = path.join(outputRoot, relativePath);
    const key = `${outputPrefix}/${relativePath.split(path.sep).join("/")}`;
    requireProof(key.startsWith("playback/public/"), `proof worker upload key must stay under playback/public/: ${key}`);
    requireProof(!hasForbiddenPathSegment(key), `proof worker upload key must not use private/original/Premium prefixes: ${key}`);
    uploaded.push({
      key,
      contentType: contentTypeFor(localPath),
      cacheControl: cacheControlFor(localPath),
      byteLength: readFileSync(localPath).length,
    });
  };

  addFile("master.m3u8");
  for (const rendition of generatedRenditions) {
    addFile(path.join(rendition.label, "index.m3u8"));
    for (const segment of readdirSync(path.join(outputRoot, rendition.label)).filter((entry) => entry.endsWith(".ts")).sort()) {
      addFile(path.join(rendition.label, segment));
    }
  }
  return uploaded;
};

const buildTrustedRows = (generatedRenditions, durationMillis) => {
  const now = "2026-07-09T08:00:00.000Z";
  return generatedRenditions.map((rendition) => ({
    id: `local-worker-city-lights-${rendition.label}`,
    media_id: realDemoVideoId,
    video_id: realDemoVideoId,
    source_type: "creator_video",
    source_id: realDemoVideoId,
    rendition_label: rendition.label,
    delivery_format: "hls",
    delivery_provider: "cloudflare_r2_custom_domain",
    storage_provider: "cloudflare_r2",
    bucket_role: "public_playback",
    public_playback_path: hlsMasterPath,
    manifest_path: hlsMasterPath,
    variant_playlist_path: `${outputPrefix}/${rendition.label}/index.m3u8`,
    width: rendition.width,
    height: rendition.height,
    duration_ms: durationMillis,
    codec: "h264/aac",
    bitrate: rendition.bandwidth,
    file_size_bytes: null,
    cache_policy: "hls_manifest_short_ttl_segments_immutable",
    visibility: "public",
    scan_status: "clean",
    moderation_status: "clean",
    is_public_playback_safe: true,
    is_original: false,
    is_ready: true,
    created_at: now,
    updated_at: now,
    proof_mode: true,
    worker_version: "local-transcode-worker-proof-v1",
    source_hash: `sha256:${sourceShaShort}`,
  }));
};

const cloneWith = (row, overrides) => ({ ...row, ...overrides, id: `${row.id}-${Object.keys(overrides)[0]}` });

const sqlString = (value) => value === null ? "null" : `'${String(value).replace(/'/g, "''")}'`;

const insertReadyRenditionSql = (suffix, overrides = {}) => {
  const row = {
    mediaId: `worker-proof-media-${suffix}`,
    sourceId: `worker-proof-source-${suffix}`,
    renditionLabel: "480p",
    deliveryFormat: "hls",
    deliveryProvider: "cloudflare_r2_custom_domain",
    storageProvider: "cloudflare_r2",
    bucketRole: "public_playback",
    publicPlaybackPath: `playback/public/proof-worker/${suffix}/master.m3u8`,
    manifestPath: `playback/public/proof-worker/${suffix}/master.m3u8`,
    variantPlaylistPath: `playback/public/proof-worker/${suffix}/480p/index.m3u8`,
    width: 854,
    height: 480,
    durationMs: 52208,
    codec: "h264/aac",
    bitrate: 1600000,
    cachePolicy: "hls_manifest_short_ttl_segments_immutable",
    visibility: "public",
    scanStatus: "clean",
    moderationStatus: "allowed",
    publicSafe: true,
    isOriginal: false,
    isReady: true,
    workerVersion: "local-transcode-worker-proof-v1",
    sourceHash: `sha256:${sourceShaShort}`,
    ...overrides,
  };

  return `
    insert into public."media_renditions" (
      "media_id", "source_type", "source_id", "rendition_label",
      "delivery_format", "delivery_provider", "storage_provider", "bucket_role",
      "public_playback_path", "manifest_path", "variant_playlist_path",
      "width", "height", "duration_ms", "codec", "bitrate", "cache_policy",
      "visibility", "scan_status", "moderation_status", "is_public_playback_safe",
      "is_original", "is_ready", "worker_version", "source_hash"
    )
    values (
      ${sqlString(row.mediaId)}, 'proof_demo', ${sqlString(row.sourceId)},
      ${sqlString(row.renditionLabel)}, ${sqlString(row.deliveryFormat)},
      ${sqlString(row.deliveryProvider)}, ${sqlString(row.storageProvider)},
      ${sqlString(row.bucketRole)}, ${sqlString(row.publicPlaybackPath)},
      ${sqlString(row.manifestPath)}, ${sqlString(row.variantPlaylistPath)},
      ${row.width}, ${row.height}, ${row.durationMs}, ${sqlString(row.codec)},
      ${row.bitrate}, ${sqlString(row.cachePolicy)}, ${sqlString(row.visibility)},
      ${sqlString(row.scanStatus)}, ${sqlString(row.moderationStatus)},
      ${row.publicSafe ? "true" : "false"}, ${row.isOriginal ? "true" : "false"},
      ${row.isReady ? "true" : "false"}, ${sqlString(row.workerVersion)},
      ${sqlString(row.sourceHash)}
    );
  `;
};

const runDisposableDbWorkerProof = async () => {
  let embeddedPostgres;
  try {
    embeddedPostgres = await import("@electric-sql/pglite");
  } catch {
    return {
      status: "skipped",
      runtime: "pglite_unavailable",
      productionDbConnected: false,
    };
  }

  const db = new embeddedPostgres.PGlite();
  const exec = async (sql) => db.exec(sql);
  const query = async (sql) => (await db.query(sql)).rows;
  const resetRole = async () => {
    try {
      await exec("reset role;");
    } catch {
      // Best-effort reset after expected permission failures.
    }
  };
  const expectDenied = async (label, sql) => {
    await resetRole();
    try {
      await exec(sql);
      throw new Error(`${label} unexpectedly succeeded`);
    } catch (error) {
      await resetRole();
      if (String(error?.message ?? "").includes("unexpectedly succeeded")) throw error;
      return { label, denied: true, sqlState: String(error?.code ?? "error") };
    }
  };

  await exec(`
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
  `);
  await exec(read(migrationPath));

  const clientWriteDenials = [
    await expectDenied("anon/client insert trusted ready rendition row", `
      set role "anon";
      ${insertReadyRenditionSql("anon-denied")}
    `),
    await expectDenied("authenticated/client insert trusted transcode job as ready", `
      set role "authenticated";
      insert into public."media_transcode_jobs" (
        "source_type", "source_id", "input_provider", "input_path",
        "output_provider", "output_prefix", "status", "requested_renditions",
        "worker_version", "source_hash", "proof_mode"
      )
      values (
        'proof_demo', 'client-ready-job', 'cloudflare_r2_custom_domain',
        'playback/public/proof-worker/client/input.mp4',
        'cloudflare_r2_custom_domain', 'playback/public/proof-worker/client',
        'ready', '["360p"]'::jsonb, 'client-worker',
        'sha256:client', true
      );
    `),
  ];

  await exec(`
    reset role;
    set role "service_role";
    insert into public."media_transcode_jobs" (
      "source_type", "source_id", "input_provider", "input_path",
      "output_provider", "output_prefix", "status", "requested_renditions",
      "worker_version", "source_hash", "proof_mode"
    )
    values (
      'proof_demo', 'local-worker-source-safe', 'cloudflare_r2_custom_domain',
      '${sourceMp4Path}', 'cloudflare_r2_custom_domain', '${outputPrefix}',
      'queued', '["360p", "480p"]'::jsonb,
      'local-transcode-worker-proof-v1', 'sha256:${sourceShaShort}', true
    );
    update public."media_transcode_jobs"
    set "status" = 'probing', "started_at" = timezone('utc'::text, now())
    where "source_id" = 'local-worker-source-safe';
    update public."media_transcode_jobs"
    set "status" = 'transcoding'
    where "source_id" = 'local-worker-source-safe';
    update public."media_transcode_jobs"
    set "status" = 'uploading'
    where "source_id" = 'local-worker-source-safe';
    update public."media_transcode_jobs"
    set "status" = 'ready',
        "completed_renditions" = '["360p", "480p"]'::jsonb,
        "completed_at" = timezone('utc'::text, now())
    where "source_id" = 'local-worker-source-safe';
    ${insertReadyRenditionSql("safe-360", { renditionLabel: "360p", width: 640, height: 360, bitrate: 900000, variantPlaylistPath: `${outputPrefix}/360p/index.m3u8` })}
    ${insertReadyRenditionSql("safe-480", { renditionLabel: "480p", width: 854, height: 480, bitrate: 1600000, variantPlaylistPath: `${outputPrefix}/480p/index.m3u8` })}
    reset role;
  `);

  const unsafeDenials = [
    await expectDenied("original/master row cannot be public CDN eligible", `
      set role "service_role";
      ${insertReadyRenditionSql("original", {
        renditionLabel: "original",
        publicPlaybackPath: "playback/public/proof-worker/original/master.m3u8",
        manifestPath: "playback/public/proof-worker/original/master.m3u8",
        variantPlaylistPath: "playback/public/proof-worker/original/480p/index.m3u8",
        visibility: "private",
        bucketRole: "private_origin",
        publicSafe: false,
        isOriginal: true,
      })}
    `),
    await expectDenied("Premium/private row cannot be public CDN eligible without token mode", `
      set role "service_role";
      ${insertReadyRenditionSql("premium", { visibility: "premium" })}
    `),
    await expectDenied("unscanned row cannot be public CDN eligible", `
      set role "service_role";
      ${insertReadyRenditionSql("unscanned", { scanStatus: "pending_scan" })}
    `),
    await expectDenied("moderation-blocked row cannot be public CDN eligible", `
      set role "service_role";
      ${insertReadyRenditionSql("moderation-blocked", { moderationStatus: "blocked" })}
    `),
    await expectDenied("wrong bucket role row cannot be public CDN eligible", `
      set role "service_role";
      ${insertReadyRenditionSql("wrong-bucket", { bucketRole: "private_origin" })}
    `),
    await expectDenied("non-public prefix row cannot be public CDN eligible", `
      set role "service_role";
      ${insertReadyRenditionSql("non-public-prefix", {
        publicPlaybackPath: "private/proof-worker/master.m3u8",
        manifestPath: "private/proof-worker/master.m3u8",
        variantPlaylistPath: "private/proof-worker/480p/index.m3u8",
      })}
    `),
  ];

  await exec("reset role; set role \"anon\";");
  const resolverSafeSelectRows = await query(`
    select "rendition_label", "public_playback_path"
    from public."media_renditions"
    where "source_id" in ('worker-proof-source-safe-360', 'worker-proof-source-safe-480')
    order by "rendition_label";
  `);
  await resetRole();

  return {
    status: "passed",
    runtime: "pglite_disposable_local",
    productionDbConnected: false,
    clientWriteDenied: clientWriteDenials.every((entry) => entry.denied),
    serviceRoleWorkerWritePassed: true,
    resolverSafeSelectPassed: resolverSafeSelectRows.length === 2,
    unsafeRowsDenied: unsafeDenials.every((entry) => entry.denied),
    selectedRenditions: resolverSafeSelectRows.map((row) => row.rendition_label),
  };
};

const buildTelemetryProof = ({ telemetry, generatedRenditions, hlsResolution, sourceDurationSeconds }) => {
  const events = generatedRenditions.map((rendition) => telemetry.buildMediaDeliveryEvent({
    id: `local_worker_hls_event_${rendition.label}`,
    userId: "raw_user_private_local_worker_proof",
    videoId: realDemoVideoId,
    creatorId: "raw_creator_private_city_lights",
    sourceType: "creator_video",
    sourceId: realDemoVideoId,
    deliveryProvider: "cloudflare_r2_custom_domain",
    playbackUrlProvider: "cloudflare_r2_custom_domain",
    mediaDeliveryProvider: "cloudflare_r2_custom_domain",
    qualityLabel: rendition.label,
    renditionLabel: rendition.label,
    publicPlaybackSafe: hlsResolution.publicPlaybackSafe,
    cdnEligible: hlsResolution.cdnEligible,
    fallbackUsed: hlsResolution.fallbackUsed,
    watchPartyId: null,
    isPremiumUser: false,
    startedAt: "2026-07-09T08:00:00.000Z",
    endedAt: "2026-07-09T08:00:08.000Z",
    secondsWatched: 8,
    bitrateBitsPerSecond: rendition.bandwidth,
    durationSeconds: sourceDurationSeconds,
    cdnCacheStatus: "local-proof-not-edge-fetch",
    clientPlatform: "proof-node",
    appVersion: "proof-only",
    proofMode: true,
    eventType: "local_worker_hls_playback_progress",
    createdAt: "2026-07-09T08:00:08.000Z",
  }));

  return telemetry.sanitizeMediaDeliveryTelemetryForProof({
    deliveryFormat: "hls",
    productionTelemetryWritesLive: false,
    backendWritesImplemented: false,
    tableMigrationsCreated: false,
    events,
  });
};

const { mediaDelivery, mediaRenditionMetadata, telemetry, transcodeQueue, cleanup } = compileHelpers();
const workDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-transcode-worker-local-proof-"));

try {
  requireProof(outputPrefix.startsWith("playback/public/"), "local proof worker output prefix must stay under playback/public/");
  requireProof(!hasForbiddenPathSegment(outputPrefix), "local proof worker output prefix must not use private/original/Premium prefixes");

  let job = transcodeQueue.createProofMediaTranscodeJob({
    jobId: "proof_transcode_worker_local_city_lights_hls",
    sourceId: realDemoVideoId,
    sourceType: "creator_video",
    inputProvider: "cloudflare_r2_custom_domain",
    inputPath: sourceMp4Path,
    outputProvider: "cloudflare_r2_custom_domain",
    outputPrefix,
    requestedRenditions,
    now: new Date().toISOString(),
  });
  const statusHistory = [job.status];
  const transition = (status, patch = {}) => {
    job = transcodeQueue.transitionMediaTranscodeJob(job, status, {
      ...patch,
      now: new Date().toISOString(),
    });
    statusHistory.push(job.status);
  };

  transition("probing");
  const inputPath = path.join(workDir, "source.mp4");
  const sourceBytes = await downloadFile(sourceMp4Url, inputPath);
  const observedSourceSha = createHash("sha256").update(sourceBytes).digest("hex").slice(0, 16);
  requireProof(observedSourceSha === sourceShaShort, "local worker source hash should match approved City Lights proof object");
  const sourceProbe = runFfprobeJson(inputPath);
  const sourceVideo = sourceProbe.streams?.find((stream) => Number(stream.width) > 0) ?? {};
  const sourceWidth = Number(sourceVideo.width ?? 0);
  const sourceHeight = Number(sourceVideo.height ?? 0);
  const sourceDurationSeconds = Number(sourceProbe.format?.duration ?? 0);
  requireProof(sourceWidth === 854, "local worker source width should be 854");
  requireProof(sourceHeight === 480, "local worker source height should be 480");
  requireProof(sourceVideo.codec_name === "h264", "local worker source codec should be h264");

  transition("transcoding", {
    durationMillis: Math.round(sourceDurationSeconds * 1000),
    sourceWidth,
    sourceHeight,
    sourceCodec: String(sourceVideo.codec_name ?? ""),
  });

  const hlsOutputRoot = path.join(workDir, "hls");
  mkdirSync(hlsOutputRoot, { recursive: true });
  const supportedRenditions = requestedRenditions.filter((rendition) => sourceHeight >= rendition.height);
  requireProof(supportedRenditions.some((rendition) => rendition.label === "360p"), "local worker should support 360p for City Lights");
  requireProof(supportedRenditions.some((rendition) => rendition.label === "480p"), "local worker should support 480p for City Lights");
  const generatedRenditions = supportedRenditions.map((rendition) => generateRendition(inputPath, hlsOutputRoot, rendition));
  const masterLocalPath = writeMasterManifest(hlsOutputRoot, generatedRenditions);
  const masterText = readFileSync(masterLocalPath, "utf8");
  requireProof(masterText.includes("360p/index.m3u8"), "local worker master should include 360p variant");
  requireProof(masterText.includes("480p/index.m3u8"), "local worker master should include 480p variant");
  assertNoSignedOrSecretUrl("local worker HLS master", masterText);
  for (const rendition of generatedRenditions) {
    const playlistText = readFileSync(rendition.playlistPath, "utf8");
    requireProof(playlistText.includes("#EXTM3U"), `${rendition.label} playlist should be HLS`);
    assertNoSignedOrSecretUrl(`${rendition.label} variant playlist`, playlistText);
  }
  runFfmpegDecode(masterLocalPath);

  const queueRenditions = generatedRenditions.map((rendition) => transcodeQueue.buildMediaTranscodeRendition({
    label: rendition.label,
    width: rendition.width,
    height: rendition.height,
    bandwidth: rendition.bandwidth,
    playlistPath: `${outputPrefix}/${rendition.label}/index.m3u8`,
    segmentPaths: rendition.segmentPaths.map((segmentPath) => `${outputPrefix}/${rendition.label}/${path.basename(segmentPath)}`),
  }));
  const queueManifest = transcodeQueue.buildMediaTranscodeManifest({
    outputPrefix,
    masterPath: hlsMasterPath,
    renditions: queueRenditions,
    allowlistedForCdn: true,
  });

  transition("uploading", { completedRenditions: queueRenditions });
  const simulatedUploadManifest = buildSimulatedUploadManifest(hlsOutputRoot, generatedRenditions);
  requireProof(simulatedUploadManifest.some((entry) => entry.key === hlsMasterPath), "local worker simulated upload should include master manifest");
  requireProof(simulatedUploadManifest.some((entry) => entry.key.endsWith("/360p/index.m3u8")), "local worker simulated upload should include 360p playlist");
  requireProof(simulatedUploadManifest.some((entry) => entry.key.endsWith("/480p/index.m3u8")), "local worker simulated upload should include 480p playlist");
  requireProof(simulatedUploadManifest.some((entry) => entry.key.endsWith(".ts")), "local worker simulated upload should include HLS segments");
  requireProof(simulatedUploadManifest.every((entry) => entry.key.startsWith("playback/public/")), "local worker simulated upload keys must stay under playback/public/");
  requireProof(simulatedUploadManifest.every((entry) => !hasForbiddenPathSegment(entry.key)), "local worker simulated upload keys must not include forbidden private/original/Premium prefixes");
  transition("ready", { completedRenditions: queueRenditions });

  const trustedRows = buildTrustedRows(generatedRenditions, Math.round(sourceDurationSeconds * 1000));
  const trustedEligibility = trustedRows.map((row) => mediaRenditionMetadata.canUseTrustedRenditionForPublicCdn(row));
  requireProof(trustedEligibility.every((entry) => entry.cdnEligible), "local worker trusted rows should be public-CDN eligible after validation");
  const trustedAsset = mediaRenditionMetadata.buildMediaDeliveryAssetFromTrustedRendition(trustedRows[0]);
  const hlsResolution = await mediaDelivery.resolveMediaPlaybackDelivery({
    asset: trustedAsset,
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(hlsResolution.url === `https://media.chillywoodstream.com/${hlsMasterPath}`, "local worker ready trusted row should resolve to allowlisted HLS master");
  requireProof(hlsResolution.cdnEligible === true, "local worker ready trusted row should be CDN eligible");

  const blockedRows = [
    cloneWith(trustedRows[0], { is_ready: false }),
    cloneWith(trustedRows[0], { is_original: true, rendition_label: "original", visibility: "private", bucket_role: "private_origin" }),
    cloneWith(trustedRows[0], { visibility: "premium" }),
    cloneWith(trustedRows[0], { visibility: "private" }),
    cloneWith(trustedRows[0], { scan_status: "pending_scan" }),
    cloneWith(trustedRows[0], { moderation_status: "blocked" }),
    cloneWith(trustedRows[0], { bucket_role: "private_origin" }),
    cloneWith(trustedRows[0], {
      public_playback_path: "private/proof-worker/master.m3u8",
      manifest_path: "private/proof-worker/master.m3u8",
      variant_playlist_path: "private/proof-worker/360p/index.m3u8",
    }),
  ];
  const blockedReasons = blockedRows.map((row) => mediaRenditionMetadata.canUseTrustedRenditionForPublicCdn(row).blockedReason);
  for (const expectedReason of [
    "not_ready",
    "original_or_master_blocked",
    "premium_requires_token_cdn",
    "private_requires_token_cdn",
    "scan_not_clean",
    "moderation_not_allowed",
    "wrong_bucket_role",
    "non_playback_prefix",
  ]) {
    requireProof(blockedReasons.includes(expectedReason), `local worker blocked-row proof should include ${expectedReason}`);
  }

  const completedProofJobGate = transcodeQueue.canResolveCompletedProofTranscodeJob(job, queueManifest);
  requireProof(completedProofJobGate.canResolve === true, "completed local worker proof job should be allowed to publish manifest metadata");
  let failedJob = transcodeQueue.createProofMediaTranscodeJob({
    jobId: "proof_transcode_worker_local_failed_city_lights_hls",
    sourceId: realDemoVideoId,
    sourceType: "creator_video",
    inputProvider: "cloudflare_r2_custom_domain",
    inputPath: sourceMp4Path,
    outputProvider: "cloudflare_r2_custom_domain",
    outputPrefix,
    requestedRenditions,
    now: new Date().toISOString(),
  });
  failedJob = transcodeQueue.transitionMediaTranscodeJob(failedJob, "failed", {
    errorCode: "proof_validation_failed",
    errorMessage: "redacted local proof failure",
    now: new Date().toISOString(),
  });
  const failedProofJobGate = transcodeQueue.canResolveCompletedProofTranscodeJob(failedJob, queueManifest);
  requireProof(failedProofJobGate.canResolve === false, "failed local worker proof job cannot produce ready rendition rows");

  const telemetryProof = buildTelemetryProof({
    telemetry,
    generatedRenditions,
    hlsResolution,
    sourceDurationSeconds,
  });
  requireProof(telemetryProof.events.every((event) => event.proof_mode === true), "local worker telemetry proof must stay proof mode");
  requireProof(telemetryProof.events.every((event) => event.estimated_bytes > 0), "local worker telemetry proof should estimate bytes");

  const disposableDbWorkerProof = await runDisposableDbWorkerProof();
  requireProof(disposableDbWorkerProof.status === "passed", "disposable DB worker proof should pass through PGlite");
  requireProof(disposableDbWorkerProof.productionDbConnected === false, "local worker proof must not connect to production DB");

  const summary = {
    proof: "media-transcode-worker-local",
    proofMode: "local-transcode-worker-proof",
    workerRuntime: "local-node-ffmpeg-proof",
    source: {
      path: sourceMp4Path,
      sha256Short: observedSourceSha,
      width: sourceWidth,
      height: sourceHeight,
      codec: sourceVideo.codec_name,
      durationSeconds: sourceDurationSeconds,
      approvedSafeDemoOnly: true,
    },
    job: {
      jobId: job.jobId,
      statusHistory,
      finalStatus: job.status,
      completedProofJobGate,
      failedProofJobGate,
      readyRowsBeforeValidationAllowed: false,
    },
    hls: {
      masterPath: hlsMasterPath,
      generatedRenditions: generatedRenditions.map((rendition) => ({
        label: rendition.label,
        width: rendition.width,
        height: rendition.height,
        segmentCount: rendition.segmentPaths.length,
      })),
      localFfmpegDecodePassed: true,
      manifestsContainPrivateSignedUrls: false,
    },
    simulatedUpload: {
      uploadedToR2: false,
      simulatedObjectCount: simulatedUploadManifest.length,
      allKeysUnderPublicPrefix: simulatedUploadManifest.every((entry) => entry.key.startsWith("playback/public/")),
      forbiddenPrefixUsed: simulatedUploadManifest.some((entry) => hasForbiddenPathSegment(entry.key)),
    },
    trustedRenditions: {
      rowsBuiltInMemory: trustedRows.length,
      cdnEligibleRows: trustedEligibility.filter((entry) => entry.cdnEligible).length,
      blockedReasons,
      publicPlaybackPath: hlsMasterPath,
    },
    resolver: {
      provider: hlsResolution.provider,
      url: hlsResolution.url,
      cdnEligible: hlsResolution.cdnEligible,
      fallbackUsed: hlsResolution.fallbackUsed,
      productionPlaybackSwitched: false,
    },
    telemetryProof: {
      deliveryFormat: "hls",
      eventCount: telemetryProof.events.length,
      estimatedBytes: telemetryProof.events.map((event) => event.estimated_bytes),
      productionTelemetryWritesLive: false,
    },
    disposableDbWorkerProof,
    productionWorkerDeployed: false,
    productionQueueProcessorRun: false,
    productionDbWritesEnabled: false,
    productionRowsWritten: false,
    productionBackfillRun: false,
    productionPlaybackSwitched: false,
    productionCdnPlaybackLive: false,
    productionTranscodeServiceLive: false,
    pitrBackupGateRequired: true,
    noSecretsPrinted: true,
  };

  assertNoSecretLikeText("local worker proof summary", summary);

  if (failures.length) {
    console.error(JSON.stringify({ proof: "media-transcode-worker-local", failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  cleanup();
  rmSync(workDir, { recursive: true, force: true });
}
