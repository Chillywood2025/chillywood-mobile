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
const wranglerCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const ffprobeCommand = process.env.FFPROBE_BIN || "ffprobe";
const ffmpegCommand = process.env.FFMPEG_BIN || "ffmpeg";
const publicBucket = "chillywood-media-public-playback-proof";
const fallbackUrl = "origin-signed-direct-fallback";
const realDemoVideoId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const sourceMp4Path = "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4";
const sourceMp4Url = `https://media.chillywoodstream.com/${sourceMp4Path}`;
const sourceShaShort = "b670602fa00934ca";
const queueProofVersion = "v1-b670602fa00934ca-queue-hls";
const outputPrefixForGuard = "playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls";
const outputPrefix = `playback/public/proof-transcode/chillywood-city-lights/${queueProofVersion}`;
const hlsMasterPath = `${outputPrefix}/master.m3u8`;
const hlsMasterUrl = `https://media.chillywoodstream.com/${hlsMasterPath}`;
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
const addFailure = (message) => failures.push(message);
const requireProof = (condition, message) => {
  if (!condition) addFailure(message);
};

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-transcode-queue-helpers-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaDelivery.ts",
        "_lib/mediaDeliveryTelemetry.ts",
        "_lib/mediaTranscodeQueue.ts",
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
          // Try the next compiler output shape.
        }
      }
      throw new Error(`Compiled helper ${fileName} was not found.`);
    };

    return {
      mediaDelivery: loadCompiled("mediaDelivery.js"),
      telemetry: loadCompiled("mediaDeliveryTelemetry.js"),
      transcodeQueue: loadCompiled("mediaTranscodeQueue.js"),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const headerSubset = (response) => ({
  status: response.status,
  cacheControl: response.headers.get("cache-control") ?? "",
  contentType: response.headers.get("content-type") ?? "",
  contentLength: response.headers.get("content-length") ?? "",
  contentRange: response.headers.get("content-range") ?? "",
  cfCacheStatus: response.headers.get("cf-cache-status") ?? "",
  age: response.headers.get("age") ?? "",
});

const fetchBytes = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30000),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { response, bytes, text: new TextDecoder().decode(bytes), headers: headerSubset(response) };
};

const assertNoSignedOrSecretUrl = (label, value) => {
  const text = String(value ?? "");
  const sensitivePatterns = [
    /[?&]X-Amz-Signature=/i,
    /[?&]X-Amz-Credential=/i,
    /[?&]X-Amz-Security-Token=/i,
    /[?&]Expires=/i,
    /[?&]Key-Pair-Id=/i,
    /[?&](token|signature|credential|policy)=/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  ];
  for (const pattern of sensitivePatterns) {
    requireProof(!pattern.test(text), `${label} must not contain signed-origin or secret-like query text matching ${pattern}`);
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

const runFfmpegDecode = (url) => {
  execFileSync(
    ffmpegCommand,
    ["-v", "error", "-i", url, "-t", "1", "-f", "null", "-"],
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
    duration: probe.format?.duration ?? "",
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

const sleepSync = (milliseconds) => {
  const waitBuffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(waitBuffer), 0, 0, milliseconds);
};

const uploadObject = (key, filePath) => {
  requireProof(key.startsWith("playback/public/"), `proof worker upload key must stay under playback/public/: ${key}`);
  requireProof(!hasForbiddenPathSegment(key), `proof worker upload key must not use private/original/Premium prefixes: ${key}`);

  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      execFileSync(
        wranglerCommand,
        [
          "wrangler",
          "r2",
          "object",
          "put",
          `${publicBucket}/${key}`,
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
        },
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 4) sleepSync(attempt * 1000);
    }
  }

  const errorText = lastError instanceof Error ? lastError.message : "unknown_error";
  throw new Error(`wrangler upload failed for ${key}: ${errorText}`);
};

const uploadHlsTree = (outputRoot, generatedRenditions) => {
  const uploaded = [];
  const uploadFile = (relativePath) => {
    const localPath = path.join(outputRoot, relativePath);
    const key = `${outputPrefix}/${relativePath.split(path.sep).join("/")}`;
    uploadObject(key, localPath);
    uploaded.push({
      key,
      contentType: contentTypeFor(localPath),
      cacheControl: cacheControlFor(localPath),
    });
  };

  uploadFile("master.m3u8");
  for (const rendition of generatedRenditions) {
    uploadFile(path.join(rendition.label, "index.m3u8"));
    for (const segment of readdirSync(path.join(outputRoot, rendition.label)).filter((entry) => entry.endsWith(".ts")).sort()) {
      uploadFile(path.join(rendition.label, segment));
    }
  }
  return uploaded;
};

const waitForSegmentCacheBehavior = async (url) => {
  const attempts = [];
  for (let index = 0; index < 8; index += 1) {
    const fetchResult = await fetchBytes(url);
    attempts.push({ ...fetchResult.headers, bytes: fetchResult.bytes.length });
    if (fetchResult.response.status === 200 && fetchResult.headers.cfCacheStatus === "HIT") {
      return { hit: true, attempts };
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return { hit: false, attempts };
};

const fetchForbiddenPublicPrefixProbes = async () => {
  const forbiddenPrefixes = [
    "originals",
    "uploads",
    "private",
    "premium",
    "processing",
    "moderation-blocked",
    "unscanned",
  ];

  const probes = [];
  for (const prefix of forbiddenPrefixes) {
    const url = `https://media.chillywoodstream.com/${prefix}/proof-transcode-queue.m3u8`;
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });
    probes.push({ prefix, status: response.status, cfCacheStatus: response.headers.get("cf-cache-status") ?? "" });
    requireProof(response.status === 403 || response.status === 404, `forbidden public prefix ${prefix}/ should be inaccessible`);
  }
  return probes;
};

const buildTelemetryProof = ({
  telemetry,
  variantProofs,
  hlsResolution,
  sourceDurationSeconds,
}) => {
  const events = variantProofs.map((variant) => {
    const firstSegmentAttempt = variant.segmentCache.attempts.find((attempt) => attempt.status === 200) ?? {};
    const cacheStatus = variant.segmentCache.hit
      ? "HIT"
      : (firstSegmentAttempt.cfCacheStatus || "not_present");
    return telemetry.buildMediaDeliveryEvent({
      id: `proof_transcode_queue_hls_event_${variant.label}`,
      userId: "raw_user_private_transcode_queue_proof",
      videoId: realDemoVideoId,
      creatorId: "raw_creator_private_city_lights",
      sourceType: "creator_video",
      sourceId: realDemoVideoId,
      deliveryProvider: "cloudflare_r2_custom_domain",
      playbackUrlProvider: "cloudflare_r2_custom_domain",
      mediaDeliveryProvider: "cloudflare_r2_custom_domain",
      qualityLabel: variant.label,
      renditionLabel: variant.label,
      publicPlaybackSafe: hlsResolution.publicPlaybackSafe,
      cdnEligible: hlsResolution.cdnEligible,
      fallbackUsed: hlsResolution.fallbackUsed,
      watchPartyId: null,
      isPremiumUser: false,
      startedAt: "2026-07-09T02:00:00.000Z",
      endedAt: "2026-07-09T02:00:08.000Z",
      secondsWatched: 8,
      contentLengthBytes: Number(firstSegmentAttempt.bytes ?? 0),
      durationSeconds: Number(sourceDurationSeconds || 0) || null,
      cdnCacheStatus: cacheStatus,
      clientPlatform: "proof-node",
      appVersion: "proof-only",
      proofMode: true,
      eventType: "hls_rendition_playback_progress",
      createdAt: "2026-07-09T02:00:08.000Z",
    });
  });

  const sanitized = telemetry.sanitizeMediaDeliveryTelemetryForProof({
    deliveryFormat: "hls",
    productionTelemetryWritesLive: false,
    backendWritesImplemented: false,
    tableMigrationsCreated: false,
    events,
  });
  return sanitized;
};

const { mediaDelivery, telemetry, transcodeQueue, cleanup } = compileHelpers();
const workDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-transcode-queue-hls-proof-"));

try {
  requireProof(outputPrefix === outputPrefixForGuard, "proof queue output prefix should stay on the approved public-safe proof path");
  let job = transcodeQueue.createProofMediaTranscodeJob({
    jobId: "proof_transcode_queue_city_lights_hls",
    sourceId: realDemoVideoId,
    sourceType: "creator_video",
    inputProvider: "cloudflare_r2_custom_domain",
    inputPath: sourceMp4Path,
    outputProvider: "cloudflare_r2_custom_domain",
    outputPrefix,
    requestedRenditions,
    now: new Date().toISOString(),
  });
  const queuedJob = job;
  const statusHistory = [job.status];
  const transition = (status, patch = {}) => {
    job = transcodeQueue.transitionMediaTranscodeJob(job, status, {
      ...patch,
      now: new Date().toISOString(),
    });
    statusHistory.push(job.status);
  };

  const inputPath = path.join(workDir, "source.mp4");
  transition("probing");
  const sourceBytes = await downloadFile(sourceMp4Url, inputPath);
  const observedSourceSha = createHash("sha256").update(sourceBytes).digest("hex").slice(0, 16);
  requireProof(observedSourceSha === sourceShaShort, "source demo MP4 hash should match approved City Lights proof object");
  const sourceProbe = runFfprobeJson(inputPath);
  const sourceVideo = sourceProbe.streams?.find((stream) => Number(stream.width) > 0) ?? {};
  const sourceWidth = Number(sourceVideo.width ?? 0);
  const sourceHeight = Number(sourceVideo.height ?? 0);
  const sourceDurationSeconds = Number(sourceProbe.format?.duration ?? 0);
  requireProof(sourceWidth === 854, "source demo width should be 854");
  requireProof(sourceHeight === 480, "source demo height should be 480");
  requireProof(sourceVideo.codec_name === "h264", "source demo codec should be h264");
  transition("transcoding", {
    durationMillis: Math.round(sourceDurationSeconds * 1000),
    sourceWidth,
    sourceHeight,
    sourceCodec: String(sourceVideo.codec_name ?? ""),
  });

  const hlsOutputRoot = path.join(workDir, "hls");
  mkdirSync(hlsOutputRoot, { recursive: true });
  const supportedRenditions = requestedRenditions.filter((rendition) => sourceHeight >= rendition.height);
  requireProof(supportedRenditions.some((rendition) => rendition.label === "360p"), "proof queue should request and support 360p");
  requireProof(supportedRenditions.some((rendition) => rendition.label === "480p"), "proof queue should request and support 480p");
  const generatedRenditions = supportedRenditions.map((rendition) => generateRendition(inputPath, hlsOutputRoot, rendition));
  const masterLocalPath = writeMasterManifest(hlsOutputRoot, generatedRenditions);
  const masterText = readFileSync(masterLocalPath, "utf8");
  requireProof(masterText.includes("360p/index.m3u8"), "proof queue HLS master should include 360p variant");
  requireProof(masterText.includes("480p/index.m3u8"), "proof queue HLS master should include 480p variant");
  assertNoSignedOrSecretUrl("local proof queue HLS master", masterText);

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
  const uploaded = uploadHlsTree(hlsOutputRoot, generatedRenditions);
  requireProof(uploaded.some((entry) => entry.key === hlsMasterPath), "proof queue upload should include master manifest");
  requireProof(uploaded.some((entry) => entry.key.endsWith("/360p/index.m3u8")), "proof queue upload should include 360p playlist");
  requireProof(uploaded.some((entry) => entry.key.endsWith("/480p/index.m3u8")), "proof queue upload should include 480p playlist");
  requireProof(uploaded.some((entry) => entry.key.endsWith(".ts")), "proof queue upload should include HLS segments");
  requireProof(uploaded.every((entry) => entry.key.startsWith("playback/public/")), "proof queue uploads must stay under playback/public/");
  requireProof(uploaded.every((entry) => !hasForbiddenPathSegment(entry.key)), "proof queue uploads must not include forbidden private/original/Premium prefixes");
  transition("ready", { completedRenditions: queueRenditions });

  const completedProofGate = transcodeQueue.canResolveCompletedProofTranscodeJob(job, queueManifest);
  requireProof(completedProofGate.canResolve === true, "ready proof queue job should be eligible to resolve the allowlisted HLS master");
  const queuedProofGate = transcodeQueue.canResolveCompletedProofTranscodeJob(queuedJob, null);
  requireProof(queuedProofGate.canResolve === false, "queued proof job should not resolve");
  requireProof(queuedProofGate.blockedReason === "transcode_job_not_ready", "queued proof job should report not ready");
  const failedJob = transcodeQueue.transitionMediaTranscodeJob(queuedJob, "failed", {
    errorCode: "proof_failure",
    errorMessage: "not uploaded",
    now: new Date().toISOString(),
  });
  const failedProofGate = transcodeQueue.canResolveCompletedProofTranscodeJob(failedJob, queueManifest);
  requireProof(failedProofGate.canResolve === false, "failed proof job should not resolve");
  requireProof(failedProofGate.blockedReason === "transcode_job_not_ready", "failed proof job should report not ready");

  const proofResult = transcodeQueue.buildMediaTranscodeProofResult({
    job,
    manifest: queueManifest,
    statusHistory,
  });
  requireProof(proofResult.productionDbWritesEnabled === false, "proof queue result must not enable production DB writes");
  requireProof(proofResult.productionPlaybackSwitched === false, "proof queue result must not switch production playback");
  requireProof(proofResult.productionTranscodeServiceLive === false, "proof queue result must not claim production transcode service live");

  const masterFetch = await fetchBytes(hlsMasterUrl);
  requireProof(masterFetch.response.status === 200, "proof queue HLS master should fetch with HTTP 200");
  requireProof(masterFetch.text.includes("#EXTM3U"), "proof queue HLS master response should be an HLS manifest");
  requireProof(masterFetch.text.includes("360p/index.m3u8"), "proof queue HLS master response should include 360p playlist");
  requireProof(masterFetch.text.includes("480p/index.m3u8"), "proof queue HLS master response should include 480p playlist");
  requireProof(/mpegurl/i.test(masterFetch.headers.contentType), "proof queue HLS master should return an mpegurl content type");
  assertNoSignedOrSecretUrl("public proof queue HLS master", masterFetch.text);

  const variantProofs = [];
  for (const rendition of generatedRenditions) {
    const playlistUrl = `https://media.chillywoodstream.com/${outputPrefix}/${rendition.label}/index.m3u8`;
    const playlistFetch = await fetchBytes(playlistUrl);
    requireProof(playlistFetch.response.status === 200, `${rendition.label} proof queue playlist should fetch with HTTP 200`);
    requireProof(playlistFetch.text.includes("#EXTM3U"), `${rendition.label} proof queue playlist should be an HLS manifest`);
    assertNoSignedOrSecretUrl(`${rendition.label} proof queue HLS playlist`, playlistFetch.text);
    const firstSegmentName = playlistFetch.text.split(/\r?\n/).find((line) => line.endsWith(".ts"));
    requireProof(!!firstSegmentName, `${rendition.label} proof queue playlist should reference a segment`);
    const segmentUrl = `https://media.chillywoodstream.com/${outputPrefix}/${rendition.label}/${firstSegmentName}`;
    const segmentCache = await waitForSegmentCacheBehavior(segmentUrl);
    const lastSegmentAttempt = segmentCache.attempts[segmentCache.attempts.length - 1] ?? {};
    requireProof(segmentCache.attempts.some((attempt) => attempt.status === 200), `${rendition.label} proof queue segment should fetch with HTTP 200`);
    requireProof(/^video\/mp2t\b/i.test(lastSegmentAttempt.contentType ?? ""), `${rendition.label} proof queue segment should return video/mp2t`);
    requireProof(/max-age=31536000/i.test(lastSegmentAttempt.cacheControl ?? ""), `${rendition.label} proof queue segment should carry immutable cache metadata`);
    variantProofs.push({
      label: rendition.label,
      playlistUrl,
      playlistFetch: playlistFetch.headers,
      segmentUrl,
      segmentCache,
      width: rendition.width,
      height: rendition.height,
      segmentCount: rendition.segmentPaths.length,
    });
  }

  const forbiddenPublicProbes = await fetchForbiddenPublicPrefixProbes();

  let hlsFfmpegDecodePassed = false;
  try {
    runFfmpegDecode(hlsMasterUrl);
    hlsFfmpegDecodePassed = true;
  } catch (error) {
    addFailure(`ffmpeg proof queue HLS master decode failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  }

  const hlsResolution = await mediaDelivery.resolveMediaPlaybackDelivery({
    asset: {
      path: hlsMasterPath,
      publicPlaybackSafe: true,
      accessTier: "free",
      qualityLabel: "hls",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(hlsResolution.url === hlsMasterUrl, "resolver should return proof queue HLS master URL only for the completed allowlisted proof job");
  requireProof(hlsResolution.provider === "cloudflare_r2_custom_domain", "proof queue resolver should use Cloudflare custom-domain provider");
  requireProof(hlsResolution.cdnEligible === true, "proof queue resolver should be CDN eligible");
  requireProof(hlsResolution.fallbackUsed === false, "proof queue resolver should not use fallback for completed allowlisted job");
  assertNoSignedOrSecretUrl("proof queue HLS resolver URL", hlsResolution.url);

  const nonAllowlistedOutput = await mediaDelivery.resolveMediaPlaybackDelivery({
    asset: {
      path: "playback/public/proof-transcode/chillywood-city-lights/not-allowlisted/master.m3u8",
      publicPlaybackSafe: true,
      accessTier: "free",
      qualityLabel: "hls",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(nonAllowlistedOutput.url === fallbackUrl, "non-allowlisted proof queue output should fall back");
  requireProof(nonAllowlistedOutput.blockedReason === "not_in_public_playback_allowlist", "non-allowlisted proof queue output should report allowlist block");

  const blockedResults = [];
  const blockedAssets = [
    {
      label: "private prefix",
      expectedBlockedReason: "outside_public_playback_prefix",
      asset: {
        path: "private/chillywood-city-lights/master.m3u8",
        publicPlaybackSafe: true,
        accessTier: "private",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
    },
    {
      label: "original path",
      expectedBlockedReason: "original_or_master_blocked",
      asset: {
        path: "playback/public/originals/chillywood-city-lights/master.m3u8",
        publicPlaybackSafe: true,
        accessTier: "free",
        qualityLabel: "original",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
    },
    {
      label: "premium-only path",
      expectedBlockedReason: "premium_requires_token_cdn",
      asset: {
        path: "playback/public/proof-transcode/chillywood-city-lights/premium/master.m3u8",
        publicPlaybackSafe: true,
        accessTier: "premium",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
    },
    {
      label: "unscanned path",
      expectedBlockedReason: "unscanned_blocked",
      asset: {
        path: "playback/public/proof-transcode/chillywood-city-lights/unscanned/master.m3u8",
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "pending_scan",
        moderationStatus: "clean",
      },
    },
    {
      label: "moderation-blocked path",
      expectedBlockedReason: "moderation_blocked",
      asset: {
        path: "playback/public/proof-transcode/chillywood-city-lights/moderation-blocked/master.m3u8",
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "clean",
        moderationStatus: "hidden",
      },
    },
    {
      label: "default production creator-video path",
      expectedBlockedReason: "outside_public_playback_prefix",
      asset: {
        path: "owner-id/video-id/source.mp4",
        publicPlaybackSafe: false,
        accessTier: "free",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
    },
  ];

  for (const entry of blockedAssets) {
    const blocked = await mediaDelivery.resolveMediaPlaybackDelivery({
      asset: entry.asset,
      config: publicConfig,
      fallbackUrl,
    });
    requireProof(blocked.url === fallbackUrl, `${entry.label} should use signed-origin fallback`);
    requireProof(blocked.cdnEligible === false, `${entry.label} should not be CDN eligible`);
    requireProof(blocked.fallbackUsed === true, `${entry.label} should report fallback`);
    requireProof(blocked.blockedReason === entry.expectedBlockedReason, `${entry.label} should report ${entry.expectedBlockedReason}`);
    blockedResults.push({
      label: entry.label,
      provider: blocked.provider,
      cdnEligible: blocked.cdnEligible,
      fallbackUsed: blocked.fallbackUsed,
      blockedReason: blocked.blockedReason,
      publicPlaybackSafe: blocked.publicPlaybackSafe,
    });
  }

  const telemetryProof = buildTelemetryProof({
    telemetry,
    variantProofs,
    hlsResolution,
    sourceDurationSeconds,
  });
  assertNoSecretLikeText("proof queue telemetry summary", telemetryProof);
  requireProof(telemetryProof.deliveryFormat === "hls", "proof queue telemetry summary should identify HLS delivery format");
  requireProof(telemetryProof.productionTelemetryWritesLive === false, "proof queue telemetry must not claim production telemetry writes");

  const proofSummary = {
    proofMode: "proof-only-transcode-queue-hls",
    productionTranscodeServiceLive: false,
    productionDbWritesEnabled: false,
    productionPlaybackSwitched: false,
    publicBucket,
    source: {
      videoId: realDemoVideoId,
      path: sourceMp4Path,
      sha256Short: observedSourceSha,
      width: sourceWidth,
      height: sourceHeight,
      codec: sourceVideo.codec_name ?? "",
      duration: sourceProbe.format?.duration ?? "",
    },
    job: {
      jobId: job.jobId,
      status: job.status,
      statusHistory,
      inputProvider: job.inputProvider,
      inputPath: job.inputPath,
      outputProvider: job.outputProvider,
      outputPrefix: job.outputPrefix,
      requestedRenditions: job.requestedRenditions.map((rendition) => rendition.label),
      completedRenditions: job.completedRenditions.map((rendition) => rendition.label),
      durationMillis: job.durationMillis,
      sourceWidth: job.sourceWidth,
      sourceHeight: job.sourceHeight,
      sourceCodec: job.sourceCodec,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      productionDbWritesEnabled: job.productionDbWritesEnabled,
      productionPlaybackSwitched: job.productionPlaybackSwitched,
      productionTranscodeServiceLive: job.productionTranscodeServiceLive,
    },
    hls: {
      outputPrefix,
      masterPath: hlsMasterPath,
      masterUrl: hlsResolution.url,
      uploadedCount: uploaded.length,
      masterFetch: masterFetch.headers,
      renditions: variantProofs,
      ffmpegDecode: hlsFfmpegDecodePassed ? "passed" : "failed",
      segmentCacheHitObserved: variantProofs.some((variant) => variant.segmentCache.hit),
      segmentCacheBehavior: variantProofs.map((variant) => ({
        label: variant.label,
        hit: variant.segmentCache.hit,
        attempts: variant.segmentCache.attempts.map((attempt) => ({
          status: attempt.status,
          cacheControl: attempt.cacheControl,
          contentType: attempt.contentType,
          cfCacheStatus: attempt.cfCacheStatus,
          age: attempt.age,
          bytes: attempt.bytes,
        })),
      })),
    },
    resolver: {
      completedProofJobGate: completedProofGate,
      queuedProofJobGate: queuedProofGate,
      failedProofJobGate: failedProofGate,
      hlsMaster: {
        provider: hlsResolution.provider,
        cdnEligible: hlsResolution.cdnEligible,
        fallbackUsed: hlsResolution.fallbackUsed,
        publicPlaybackSafe: hlsResolution.publicPlaybackSafe,
        url: hlsResolution.url,
      },
      nonAllowlistedOutput: {
        provider: nonAllowlistedOutput.provider,
        cdnEligible: nonAllowlistedOutput.cdnEligible,
        fallbackUsed: nonAllowlistedOutput.fallbackUsed,
        blockedReason: nonAllowlistedOutput.blockedReason,
      },
      blockedResults,
    },
    telemetryProof,
    forbiddenPublicProbes,
  };

  assertNoSecretLikeText("proof transcode queue HLS summary", proofSummary);

  if (failures.length) {
    console.error("Proof transcode queue HLS failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Proof transcode queue HLS passed.");
  console.log(JSON.stringify(proofSummary, null, 2));
} finally {
  cleanup();
  rmSync(workDir, { recursive: true, force: true });
}
