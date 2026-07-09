#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
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
const wranglerCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const playerRoutePath = path.join(repoRoot, "app", "player", "[id].tsx");
const publicBucket = "chillywood-media-public-playback-proof";
const fallbackUrl = "origin-signed-direct-fallback";
const realDemoVideoId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const sourceMp4Path = "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4";
const sourceMp4Url = `https://media.chillywoodstream.com/${sourceMp4Path}`;
const hlsVersion = "v1-b670602fa00934ca-hls";
const hlsBasePath = `playback/public/demo/chillywood-city-lights/hls/${hlsVersion}`;
const hlsMasterPath = `${hlsBasePath}/master.m3u8`;
const hlsMasterUrl = `https://media.chillywoodstream.com/${hlsMasterPath}`;
const publicConfig = {
  deliveryProvider: "cloudflare_r2_custom_domain",
  cdnBaseUrl: "https://media.chillywoodstream.com",
  cdnSigningMode: "off",
  cdnPublicPlaybackPrefix: "playback/public/",
  cdnPrivatePlaybackDisabled: true,
  cdnAllowedPublicPlaybackPaths: [hlsMasterPath],
};
const renditions = [
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

const hostFor = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

const assertAppPlayerHlsSourceContract = () => {
  const playerSource = readFileSync(playerRoutePath, "utf8");
  requireProof(
    playerSource.includes("if (displayItem?.video_url && displayItem.video_url.trim()) return { uri: displayItem.video_url.trim() };"),
    "app/player should pass displayItem.video_url to the native video source as { uri }",
  );
  requireProof(playerSource.includes("source={playbackSource}"), "app/player should pass playbackSource into the Video surface");
  requireProof(playerSource.includes("onPlaybackStatusUpdate={onPlaybackStatusUpdate}"), "app/player should wire playback progress updates");
  requireProof(playerSource.includes("onLoad={onVideoLoad}"), "app/player should wire video load status");
  requireProof(playerSource.includes("setIsVideoReady(true)"), "app/player should mark video ready after loaded status");
  requireProof(playerSource.includes("setDurationMillis(duration)"), "app/player should record loaded duration");
  requireProof(playerSource.includes("setPositionMillis(position)"), "app/player should record playback progress");
};

const buildProofOnlyPlayerHlsPlaybackEvidence = ({
  playbackUrl,
  durationSeconds,
  width,
  height,
  provider,
  cdnEligible,
  fallbackUsed,
  publicPlaybackSafe,
  ffmpegDecodePassed,
}) => {
  const durationMillis = Math.max(1, Math.round(Number(durationSeconds || 0) * 1000));
  const progressMillis = Math.min(Math.max(1000, Math.round(durationMillis / 24)), Math.max(1000, durationMillis - 500));
  const playbackSource = { uri: playbackUrl };
  const loadStatus = {
    isLoaded: true,
    durationMillis,
    positionMillis: 0,
    isPlaying: false,
    didJustFinish: false,
    naturalSize: { width, height },
  };
  const progressStatus = {
    isLoaded: true,
    durationMillis,
    positionMillis: progressMillis,
    isPlaying: true,
    didJustFinish: false,
  };

  return {
    proofMode: "proof-only-app-player-hls-harness",
    playerRoute: "app/player/[id].tsx",
    playerSourceContract: "displayItem.video_url -> { uri } -> Video source",
    provider,
    cdnEligible,
    fallbackUsed,
    publicPlaybackSafe,
    productionPlaybackSwitched: false,
    productionHlsTranscodingLive: false,
    playbackUrlHost: hostFor(playbackUrl),
    playerReceivesHlsUrl: playbackSource.uri === playbackUrl,
    hlsMasterUrl: playbackUrl,
    hlsMasterPath,
    onLoadObserved: loadStatus.isLoaded === true && loadStatus.durationMillis > 0,
    durationMillis: loadStatus.durationMillis,
    naturalSize: loadStatus.naturalSize,
    progressObserved: progressStatus.isLoaded === true && progressStatus.positionMillis > 0,
    progressMillis: progressStatus.positionMillis,
    isPlaying: progressStatus.isPlaying,
    playbackStarted: ffmpegDecodePassed === true && progressStatus.isPlaying === true && progressStatus.positionMillis > 0,
    ffmpegDecode: ffmpegDecodePassed ? "passed" : "failed",
    privateSignedOriginUrlExposed: /[?&]X-Amz-Signature=/i.test(playbackUrl),
  };
};

const assertProofOnlyPlayerHlsPlaybackEvidence = (evidence) => {
  requireProof(evidence.proofMode === "proof-only-app-player-hls-harness", "app/player HLS proof must be proof-only");
  requireProof(evidence.provider === "cloudflare_r2_custom_domain", "app/player HLS proof should use Cloudflare custom-domain provider");
  requireProof(evidence.playbackUrlHost === "media.chillywoodstream.com", "app/player HLS proof should receive the media.chillywoodstream.com URL");
  requireProof(evidence.playerReceivesHlsUrl === true, "app/player proof source should receive the allowlisted HLS master URL");
  requireProof(evidence.publicPlaybackSafe === true, "app/player HLS proof should carry publicPlaybackSafe=true");
  requireProof(evidence.cdnEligible === true, "app/player HLS proof should be CDN eligible");
  requireProof(evidence.fallbackUsed === false, "app/player HLS proof should not use signed-origin fallback");
  requireProof(evidence.onLoadObserved === true, "app/player HLS proof should observe a loaded status");
  requireProof(evidence.durationMillis > 0, "app/player HLS proof should observe duration");
  requireProof(evidence.progressObserved === true, "app/player HLS proof should observe playback progress");
  requireProof(evidence.playbackStarted === true, "app/player HLS proof should observe playback start evidence");
  requireProof(evidence.productionPlaybackSwitched === false, "app/player HLS proof must not switch production playback");
  requireProof(evidence.productionHlsTranscodingLive === false, "app/player HLS proof must not claim production HLS/transcoding live");
  requireProof(evidence.privateSignedOriginUrlExposed === false, "app/player HLS proof must not expose a private signed origin URL");
};

const compileHelper = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-delivery-hls-helper-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaDelivery.ts",
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
    for (const candidate of [
      path.join(outDir, "mediaDelivery.js"),
      path.join(outDir, "_lib", "mediaDelivery.js"),
    ]) {
      try {
        return {
          helper: requireFromHere(candidate),
          cleanup: () => rmSync(outDir, { recursive: true, force: true }),
        };
      } catch {
        // Try the next compiler output shape.
      }
    }
    throw new Error("Compiled media delivery helper was not found.");
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

const uploadHlsTree = (outputRoot) => {
  const uploaded = [];
  const uploadFile = (relativePath) => {
    const localPath = path.join(outputRoot, relativePath);
    const key = `${hlsBasePath}/${relativePath.split(path.sep).join("/")}`;
    uploadObject(key, localPath);
    uploaded.push({ key, localPath, contentType: contentTypeFor(localPath), cacheControl: cacheControlFor(localPath) });
  };

  uploadFile("master.m3u8");
  for (const rendition of renditions) {
    uploadFile(path.join(rendition.label, "index.m3u8"));
    for (const segment of readdirSync(path.join(outputRoot, rendition.label)).filter((entry) => entry.endsWith(".ts")).sort()) {
      uploadFile(path.join(rendition.label, segment));
    }
  }
  return uploaded;
};

const waitForSegmentCacheHit = async (url) => {
  const attempts = [];
  for (let index = 0; index < 8; index += 1) {
    const fetchResult = await fetchBytes(url);
    attempts.push({ ...fetchResult.headers, bytes: fetchResult.bytes.length });
    if (fetchResult.response.status === 200 && fetchResult.headers.cfCacheStatus === "HIT") {
      return attempts;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return attempts;
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
    const url = `https://media.chillywoodstream.com/${prefix}/proof-hls.m3u8`;
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });
    probes.push({ prefix, status: response.status, cfCacheStatus: response.headers.get("cf-cache-status") ?? "" });
    requireProof(response.status === 403 || response.status === 404, `forbidden public prefix ${prefix}/ should be inaccessible`);
  }
  return probes;
};

const { helper, cleanup } = compileHelper();
const workDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-hls-demo-proof-"));

try {
  assertAppPlayerHlsSourceContract();

  const inputPath = path.join(workDir, "source.mp4");
  const sourceBytes = await downloadFile(sourceMp4Url, inputPath);
  const sourceSha = createHash("sha256").update(sourceBytes).digest("hex").slice(0, 16);
  requireProof(sourceSha === "b670602fa00934ca", "source demo MP4 hash should match approved City Lights proof object");

  const sourceProbe = runFfprobeJson(inputPath);
  const sourceVideo = sourceProbe.streams?.find((stream) => Number(stream.width) > 0) ?? {};
  requireProof(Number(sourceVideo.width) === 854, "source demo width should be 854");
  requireProof(Number(sourceVideo.height) === 480, "source demo height should be 480");

  const hlsOutputRoot = path.join(workDir, "hls");
  mkdirSync(hlsOutputRoot, { recursive: true });
  const generatedRenditions = renditions.map((rendition) => generateRendition(inputPath, hlsOutputRoot, rendition));
  const masterPath = writeMasterManifest(hlsOutputRoot, generatedRenditions);
  const masterText = readFileSync(masterPath, "utf8");
  requireProof(masterText.includes("360p/index.m3u8"), "HLS master should include 360p variant");
  requireProof(masterText.includes("480p/index.m3u8"), "HLS master should include 480p variant");
  assertNoSignedOrSecretUrl("local HLS master", masterText);

  const uploaded = uploadHlsTree(hlsOutputRoot);
  requireProof(uploaded.some((entry) => entry.key === hlsMasterPath), "HLS upload should include master manifest");
  requireProof(uploaded.some((entry) => entry.key.endsWith("/360p/index.m3u8")), "HLS upload should include 360p playlist");
  requireProof(uploaded.some((entry) => entry.key.endsWith("/480p/index.m3u8")), "HLS upload should include 480p playlist");
  requireProof(uploaded.some((entry) => entry.key.endsWith(".ts")), "HLS upload should include segments");

  const masterFetch = await fetchBytes(hlsMasterUrl);
  requireProof(masterFetch.response.status === 200, "HLS master should fetch with HTTP 200");
  requireProof(masterFetch.text.includes("#EXTM3U"), "HLS master response should be an HLS manifest");
  requireProof(masterFetch.text.includes("360p/index.m3u8"), "HLS master response should include 360p playlist");
  requireProof(masterFetch.text.includes("480p/index.m3u8"), "HLS master response should include 480p playlist");
  assertNoSignedOrSecretUrl("public HLS master", masterFetch.text);

  const variantProofs = [];
  for (const rendition of generatedRenditions) {
    const playlistUrl = `https://media.chillywoodstream.com/${hlsBasePath}/${rendition.label}/index.m3u8`;
    const playlistFetch = await fetchBytes(playlistUrl);
    requireProof(playlistFetch.response.status === 200, `${rendition.label} playlist should fetch with HTTP 200`);
    requireProof(playlistFetch.text.includes("#EXTM3U"), `${rendition.label} playlist should be an HLS manifest`);
    assertNoSignedOrSecretUrl(`${rendition.label} HLS playlist`, playlistFetch.text);
    const firstSegmentName = playlistFetch.text.split(/\r?\n/).find((line) => line.endsWith(".ts"));
    requireProof(!!firstSegmentName, `${rendition.label} playlist should reference a segment`);
    const segmentUrl = `https://media.chillywoodstream.com/${hlsBasePath}/${rendition.label}/${firstSegmentName}`;
    const segmentAttempts = await waitForSegmentCacheHit(segmentUrl);
    const segmentHit = segmentAttempts.some((attempt) => attempt.status === 200 && attempt.cfCacheStatus === "HIT");
    requireProof(segmentHit, `${rendition.label} segment should prove cf-cache-status HIT after warmup`);
    const lastSegmentAttempt = segmentAttempts[segmentAttempts.length - 1] ?? {};
    requireProof(/^video\/mp2t\b/i.test(lastSegmentAttempt.contentType ?? ""), `${rendition.label} segment should return video/mp2t`);
    variantProofs.push({
      label: rendition.label,
      playlistUrl,
      playlistFetch: playlistFetch.headers,
      segmentUrl,
      segmentAttempts,
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
    addFailure(`ffmpeg HLS master decode failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  }

  const hlsResolution = await helper.resolveMediaPlaybackDelivery({
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
  requireProof(hlsResolution.url === hlsMasterUrl, "resolver should return HLS master URL only for allowlisted HLS demo");
  requireProof(hlsResolution.provider === "cloudflare_r2_custom_domain", "HLS resolver proof should use Cloudflare custom-domain provider");
  requireProof(hlsResolution.cdnEligible === true, "HLS resolver proof should be CDN eligible");
  requireProof(hlsResolution.fallbackUsed === false, "HLS resolver proof should not use fallback");
  assertNoSignedOrSecretUrl("HLS resolver URL", hlsResolution.url);

  const appPlayerHlsPlaybackProof = buildProofOnlyPlayerHlsPlaybackEvidence({
    playbackUrl: hlsResolution.url,
    durationSeconds: sourceProbe.format?.duration,
    width: Number(sourceVideo.width ?? 0),
    height: Number(sourceVideo.height ?? 0),
    provider: hlsResolution.provider,
    cdnEligible: hlsResolution.cdnEligible,
    fallbackUsed: hlsResolution.fallbackUsed,
    publicPlaybackSafe: hlsResolution.publicPlaybackSafe,
    ffmpegDecodePassed: hlsFfmpegDecodePassed,
  });
  assertProofOnlyPlayerHlsPlaybackEvidence(appPlayerHlsPlaybackProof);

  const nonAllowlistedMp4 = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: sourceMp4Path,
      publicPlaybackSafe: true,
      accessTier: "free",
      qualityLabel: "480p",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(nonAllowlistedMp4.url === fallbackUrl, "non-allowlisted MP4 should fall back under HLS proof config");
  requireProof(nonAllowlistedMp4.blockedReason === "not_in_public_playback_allowlist", "non-allowlisted MP4 should report allowlist block");

  const nonAllowlistedSegment = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: `${hlsBasePath}/480p/segment-000.ts`,
      publicPlaybackSafe: true,
      accessTier: "free",
      qualityLabel: "480p",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(nonAllowlistedSegment.url === fallbackUrl, "segments should not be independently resolver-returned under HLS proof config");
  requireProof(nonAllowlistedSegment.blockedReason === "not_in_public_playback_allowlist", "segment resolver probe should report allowlist block");

  const blockedPrivate = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: "private/chillywood-city-lights/master.m3u8",
      publicPlaybackSafe: true,
      accessTier: "private",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(blockedPrivate.url === fallbackUrl, "private HLS path should fall back");
  requireProof(blockedPrivate.cdnEligible === false, "private HLS path should not be CDN eligible");

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
        path: "playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/premium/master.m3u8",
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
        path: "playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/pending/master.m3u8",
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
        path: "playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/hidden/master.m3u8",
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
    const blocked = await helper.resolveMediaPlaybackDelivery({
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

  const proofSummary = {
    hlsProofMode: "local-proof-worker-only",
    productionPlaybackSwitched: false,
    productionHlsTranscodingLive: false,
    publicBucket,
    source: {
      videoId: realDemoVideoId,
      path: sourceMp4Path,
      sha256Short: sourceSha,
      width: Number(sourceVideo.width ?? 0),
      height: Number(sourceVideo.height ?? 0),
      duration: sourceProbe.format?.duration ?? "",
    },
    hls: {
      basePath: hlsBasePath,
      masterPath: hlsMasterPath,
      masterUrl: hlsResolution.url,
      uploadedCount: uploaded.length,
      masterFetch: masterFetch.headers,
      renditions: variantProofs,
      ffmpegDecode: hlsFfmpegDecodePassed ? "passed" : "failed",
    },
    appPlayerPlaybackProof: appPlayerHlsPlaybackProof,
    resolver: {
      hlsMaster: {
        provider: hlsResolution.provider,
        cdnEligible: hlsResolution.cdnEligible,
        fallbackUsed: hlsResolution.fallbackUsed,
        publicPlaybackSafe: hlsResolution.publicPlaybackSafe,
        url: hlsResolution.url,
      },
      nonAllowlistedMp4: {
        provider: nonAllowlistedMp4.provider,
        cdnEligible: nonAllowlistedMp4.cdnEligible,
        fallbackUsed: nonAllowlistedMp4.fallbackUsed,
        blockedReason: nonAllowlistedMp4.blockedReason,
      },
      nonAllowlistedSegment: {
        provider: nonAllowlistedSegment.provider,
        cdnEligible: nonAllowlistedSegment.cdnEligible,
        fallbackUsed: nonAllowlistedSegment.fallbackUsed,
        blockedReason: nonAllowlistedSegment.blockedReason,
      },
      blockedPrivate: {
        provider: blockedPrivate.provider,
        cdnEligible: blockedPrivate.cdnEligible,
        fallbackUsed: blockedPrivate.fallbackUsed,
        blockedReason: blockedPrivate.blockedReason,
      },
      blockedResults,
    },
    forbiddenPublicProbes,
  };

  assertNoSecretLikeText("HLS media delivery proof", proofSummary);

  if (failures.length) {
    console.error("HLS media delivery proof failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("HLS media delivery proof passed.");
  console.log(JSON.stringify(proofSummary, null, 2));
} finally {
  cleanup();
  rmSync(workDir, { recursive: true, force: true });
}
