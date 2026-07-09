#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const ffprobeCommand = process.env.FFPROBE_BIN || "ffprobe";
const ffmpegCommand = process.env.FFMPEG_BIN || "ffmpeg";
const fallbackUrl = "origin-signed-direct-fallback";
const realDemoVideoId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const realDemoTitle = "Chi'llywood City Lights";
const realDemoPath = "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4";
const realDemoUrl = `https://media.chillywoodstream.com/${realDemoPath}`;
const generatedDemoPath = "playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4";
const publicConfig = {
  deliveryProvider: "cloudflare_r2_custom_domain",
  cdnBaseUrl: "https://media.chillywoodstream.com",
  cdnSigningMode: "off",
  cdnPublicPlaybackPrefix: "playback/public/",
  cdnPrivatePlaybackDisabled: true,
  cdnAllowedPublicPlaybackPaths: [realDemoPath],
};

const failures = [];
const addFailure = (message) => failures.push(message);
const requireProof = (condition, message) => {
  if (!condition) addFailure(message);
};

const compileHelper = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-delivery-real-demo-"));
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
  return { response, bytes, headers: headerSubset(response) };
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

const runFfprobe = (url) => (
  execFileSync(
    ffprobeCommand,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height:format=duration",
      "-of",
      "json",
      url,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    },
  )
);

const runFfprobeFrameCount = (url) => (
  execFileSync(
    ffprobeCommand,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "json",
      url,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    },
  )
);

const runFfmpegDecode = (url) => {
  execFileSync(
    ffmpegCommand,
    ["-v", "error", "-i", url, "-t", "0.5", "-f", "null", "-"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    },
  );
};

const { helper, cleanup } = compileHelper();

try {
  const realDemoResolution = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: realDemoPath,
      publicPlaybackSafe: true,
      accessTier: "free",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(realDemoResolution.url === realDemoUrl, "real demo should resolve to the public custom-domain URL");
  requireProof(realDemoResolution.provider === "cloudflare_r2_custom_domain", "real demo should use Cloudflare R2 custom-domain provider");
  requireProof(realDemoResolution.cdnEligible === true, "real demo should be CDN eligible");
  requireProof(realDemoResolution.fallbackUsed === false, "real demo should not use signed-origin fallback");
  requireProof(realDemoResolution.publicPlaybackSafe === true, "real demo should carry explicit publicPlaybackSafe metadata");
  assertNoSignedOrSecretUrl("real demo URL", realDemoResolution.url);

  const nonAllowlistedPublic = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: generatedDemoPath,
      publicPlaybackSafe: true,
      accessTier: "free",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(nonAllowlistedPublic.url === fallbackUrl, "non-allowlisted public-safe path should keep fallback in real demo proof config");
  requireProof(nonAllowlistedPublic.blockedReason === "not_in_public_playback_allowlist", "non-allowlisted public-safe path should report allowlist block");

  const blockedAssets = [
    {
      label: "private prefix",
      asset: {
        path: "private/chillywood-city-lights.mp4",
        publicPlaybackSafe: true,
        accessTier: "private",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
    },
    {
      label: "original path",
      asset: {
        path: "playback/public/originals/chillywood-city-lights-source.mp4",
        publicPlaybackSafe: true,
        accessTier: "free",
        qualityLabel: "original",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
    },
    {
      label: "premium-only path",
      asset: {
        path: "playback/public/demo/chillywood-city-lights/v1/premium.mp4",
        publicPlaybackSafe: true,
        accessTier: "premium",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
    },
    {
      label: "unscanned path",
      asset: {
        path: "playback/public/demo/chillywood-city-lights/v1/pending.mp4",
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "pending_scan",
        moderationStatus: "clean",
      },
    },
    {
      label: "moderation-blocked path",
      asset: {
        path: "playback/public/demo/chillywood-city-lights/v1/hidden.mp4",
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "clean",
        moderationStatus: "hidden",
      },
    },
    {
      label: "default production creator-video path",
      asset: {
        path: "owner-id/video-id/source.mp4",
        publicPlaybackSafe: false,
        accessTier: "free",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
    },
  ];

  const blockedResults = [];
  for (const entry of blockedAssets) {
    const blocked = await helper.resolveMediaPlaybackDelivery({
      asset: entry.asset,
      config: publicConfig,
      fallbackUrl,
    });
    requireProof(blocked.url === fallbackUrl, `${entry.label} should keep signed-origin fallback`);
    requireProof(blocked.cdnEligible === false, `${entry.label} should not be CDN eligible`);
    requireProof(blocked.fallbackUsed === true, `${entry.label} should use fallback`);
    requireProof(!String(blocked.url ?? "").includes("media.chillywoodstream.com"), `${entry.label} should not return the public custom-domain URL`);
    blockedResults.push({
      label: entry.label,
      provider: blocked.provider,
      cdnEligible: blocked.cdnEligible,
      fallbackUsed: blocked.fallbackUsed,
      blockedReason: blocked.blockedReason,
      publicPlaybackSafe: blocked.publicPlaybackSafe,
    });
  }

  const fullFetch = await fetchBytes(realDemoUrl);
  requireProof(fullFetch.response.status === 200, "real demo full fetch should return HTTP 200");
  requireProof(fullFetch.bytes.length === 4372373, "real demo full fetch should return the expected byte count");
  requireProof(/^video\/mp4\b/i.test(fullFetch.headers.contentType), "real demo should return Content-Type video/mp4");
  requireProof(
    fullFetch.headers.cacheControl.includes("max-age=31536000") && fullFetch.headers.cacheControl.includes("immutable"),
    "real demo should carry immutable versioned cache metadata",
  );

  const warmFetch = await fetchBytes(realDemoUrl);
  const rangeFetch = await fetchBytes(realDemoUrl, { headers: { Range: "bytes=0-1023" } });
  requireProof([200, 206].includes(rangeFetch.response.status), "real demo range fetch should return HTTP 206 or 200");
  requireProof(rangeFetch.bytes.length > 0, "real demo range fetch should return bytes");
  if (rangeFetch.response.status === 206) {
    requireProof(rangeFetch.headers.contentRange.startsWith("bytes 0-"), "real demo range fetch should include Content-Range");
  }

  let ffprobeParsed = {};
  let decodedFrameCount = 0;
  try {
    ffprobeParsed = JSON.parse(runFfprobe(realDemoUrl));
    const firstVideoStream = ffprobeParsed.streams?.[0] ?? {};
    requireProof(firstVideoStream.codec_name === "h264", "real demo should be H.264");
    requireProof(Number(firstVideoStream.width) === 854, "real demo width should be 854");
    requireProof(Number(firstVideoStream.height) === 480, "real demo height should be 480");
    requireProof(Number(ffprobeParsed.format?.duration ?? 0) > 0, "real demo should have positive duration");
  } catch (error) {
    addFailure(`ffprobe real demo proof failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  }

  try {
    runFfmpegDecode(realDemoUrl);
  } catch (error) {
    addFailure(`ffmpeg real demo decode failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  }

  try {
    const frameProbe = JSON.parse(runFfprobeFrameCount(realDemoUrl));
    decodedFrameCount = Number(frameProbe.streams?.[0]?.nb_read_frames ?? 0);
    requireProof(decodedFrameCount > 0, "real demo should decode at least one video frame");
  } catch (error) {
    addFailure(`ffprobe real demo frame-count proof failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  }

  const forbiddenPublicProbes = [];
  for (const prefix of ["originals", "uploads", "private", "premium", "processing", "moderation-blocked", "unscanned"]) {
    const probeUrl = `https://media.chillywoodstream.com/${prefix}/proof.txt`;
    const probe = await fetch(probeUrl, { method: "GET", signal: AbortSignal.timeout(10000) });
    const probeHeaders = headerSubset(probe);
    forbiddenPublicProbes.push({ prefix, status: probe.status, cfCacheStatus: probeHeaders.cfCacheStatus });
    requireProof(probe.status === 404 || probe.status === 403, `${prefix}/ public probe should be inaccessible`);
  }

  const proofSummary = {
    mediaIdentification: {
      sourceType: "creator_video",
      sourceId: realDemoVideoId,
      title: realDemoTitle,
      currentPlaybackSource: "public unsigned playback_url",
      sourceHost: "download.blender.org",
      sourceFile: "sintel_trailer-480p.mp4",
      visibility: "public",
      moderationStatus: "clean",
      premiumOnly: false,
      storageObjectKeyPresent: false,
      storagePathPresent: false,
    },
    realDemoPlaybackProof: {
      provider: realDemoResolution.provider,
      cdnEligible: realDemoResolution.cdnEligible,
      publicPlaybackSafe: realDemoResolution.publicPlaybackSafe,
      productionPlaybackSwitched: false,
      playbackUrlHost: new URL(realDemoResolution.url).host,
      playbackStarted: fullFetch.response.status === 200 && fullFetch.bytes.length > 0,
      rangePlaybackSupported: rangeFetch.response.status === 206,
      decoded: decodedFrameCount > 0,
      decodedFrameCount,
    },
    realDemo: {
      path: realDemoPath,
      url: realDemoResolution.url,
      provider: realDemoResolution.provider,
      cdnEligible: realDemoResolution.cdnEligible,
      fallbackUsed: realDemoResolution.fallbackUsed,
      publicPlaybackSafe: realDemoResolution.publicPlaybackSafe,
    },
    fullFetch: {
      ...fullFetch.headers,
      bytes: fullFetch.bytes.length,
    },
    warmFetch: {
      ...warmFetch.headers,
      bytes: warmFetch.bytes.length,
    },
    rangeFetch: {
      ...rangeFetch.headers,
      bytes: rangeFetch.bytes.length,
    },
    ffprobe: {
      codec: ffprobeParsed.streams?.[0]?.codec_name ?? "",
      width: ffprobeParsed.streams?.[0]?.width ?? "",
      height: ffprobeParsed.streams?.[0]?.height ?? "",
      duration: ffprobeParsed.format?.duration ?? "",
    },
    ffmpegDecode: "passed",
    nonAllowlistedPublic: {
      provider: nonAllowlistedPublic.provider,
      cdnEligible: nonAllowlistedPublic.cdnEligible,
      fallbackUsed: nonAllowlistedPublic.fallbackUsed,
      blockedReason: nonAllowlistedPublic.blockedReason,
      publicPlaybackSafe: nonAllowlistedPublic.publicPlaybackSafe,
    },
    blockedResults,
    forbiddenPublicProbes,
  };

  assertNoSecretLikeText("real demo media delivery proof", proofSummary);

  if (failures.length) {
    console.error("Real demo media delivery proof failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Real demo media delivery proof passed.");
  console.log(JSON.stringify(proofSummary, null, 2));
} finally {
  cleanup();
}
