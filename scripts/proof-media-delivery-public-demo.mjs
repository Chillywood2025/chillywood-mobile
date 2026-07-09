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
const demoProofPath = "playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4";
const demoProofUrl = "https://media.chillywoodstream.com/playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4";
const publicConfig = {
  deliveryProvider: "cloudflare_r2_custom_domain",
  cdnBaseUrl: "https://media.chillywoodstream.com",
  cdnSigningMode: "off",
  cdnPublicPlaybackPrefix: "playback/public/",
  cdnPrivatePlaybackDisabled: true,
};

const failures = [];
const addFailure = (message) => failures.push(message);
const requireProof = (condition, message) => {
  if (!condition) addFailure(message);
};

const compileHelper = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-delivery-public-demo-"));
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
    signal: AbortSignal.timeout(20000),
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
  const resolution = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: demoProofPath,
      publicPlaybackSafe: true,
      accessTier: "free",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(resolution.url === demoProofUrl, "safe demo proof video should resolve to the public custom-domain URL");
  requireProof(resolution.provider === "cloudflare_r2_custom_domain", "safe demo proof video should use the Cloudflare R2 custom-domain provider");
  requireProof(resolution.cdnEligible === true, "safe demo proof video should be CDN eligible");
  requireProof(resolution.fallbackUsed === false, "safe demo proof video should not use signed-origin fallback");
  requireProof(resolution.publicPlaybackSafe === true, "safe demo proof video should carry explicit publicPlaybackSafe metadata");
  assertNoSignedOrSecretUrl("safe demo proof video URL", resolution.url);

  const blockedAssets = [
    {
      label: "private prefix",
      asset: {
        path: "private/proof-video.mp4",
        publicPlaybackSafe: true,
        accessTier: "private",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
    },
    {
      label: "original path",
      asset: {
        path: "playback/public/originals/source.mp4",
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
        path: "playback/public/demo/proof-video/v1/premium.mp4",
        publicPlaybackSafe: true,
        accessTier: "premium",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
    },
    {
      label: "unscanned path",
      asset: {
        path: "playback/public/demo/proof-video/v1/pending.mp4",
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "pending_scan",
        moderationStatus: "clean",
      },
    },
    {
      label: "moderation-blocked path",
      asset: {
        path: "playback/public/demo/proof-video/v1/hidden.mp4",
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

  const fullFetch = await fetchBytes(demoProofUrl);
  requireProof(fullFetch.response.status === 200, "safe demo proof video full fetch should return HTTP 200");
  requireProof(fullFetch.bytes.length > 0, "safe demo proof video full fetch should return bytes");
  requireProof(/^video\/mp4\b/i.test(fullFetch.headers.contentType), "safe demo proof video should return Content-Type video/mp4");
  requireProof(
    fullFetch.headers.cacheControl.includes("max-age=31536000") && fullFetch.headers.cacheControl.includes("immutable"),
    "safe demo proof video should carry immutable versioned cache metadata",
  );

  const rangeFetch = await fetchBytes(demoProofUrl, { headers: { Range: "bytes=0-1023" } });
  requireProof([200, 206].includes(rangeFetch.response.status), "safe demo proof video range fetch should return HTTP 206 or 200");
  requireProof(rangeFetch.bytes.length > 0, "safe demo proof video range fetch should return bytes");
  if (rangeFetch.response.status === 206) {
    requireProof(rangeFetch.headers.contentRange.startsWith("bytes 0-"), "safe demo proof video range fetch should include Content-Range");
  }

  let ffprobeParsed = {};
  try {
    ffprobeParsed = JSON.parse(runFfprobe(demoProofUrl));
    const firstVideoStream = ffprobeParsed.streams?.[0] ?? {};
    requireProof(firstVideoStream.codec_name === "h264", "safe demo proof video should be H.264");
    requireProof(Number(firstVideoStream.width) === 320, "safe demo proof video width should be 320");
    requireProof(Number(firstVideoStream.height) === 180, "safe demo proof video height should be 180");
    requireProof(Number(ffprobeParsed.format?.duration ?? 0) > 0, "safe demo proof video should have positive duration");
  } catch (error) {
    addFailure(`ffprobe public demo proof failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  }

  try {
    runFfmpegDecode(demoProofUrl);
  } catch (error) {
    addFailure(`ffmpeg public demo decode failed: ${error instanceof Error ? error.message : "unknown_error"}`);
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
    demoProof: {
      path: demoProofPath,
      url: resolution.url,
      provider: resolution.provider,
      cdnEligible: resolution.cdnEligible,
      fallbackUsed: resolution.fallbackUsed,
      publicPlaybackSafe: resolution.publicPlaybackSafe,
    },
    fullFetch: {
      ...fullFetch.headers,
      bytes: fullFetch.bytes.length,
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
    blockedResults,
    forbiddenPublicProbes,
  };

  assertNoSecretLikeText("public demo media delivery proof", proofSummary);

  if (failures.length) {
    console.error("Public demo media delivery proof failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Public demo media delivery proof passed.");
  console.log(JSON.stringify(proofSummary, null, 2));
} finally {
  cleanup();
}
