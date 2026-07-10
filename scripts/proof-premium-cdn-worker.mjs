#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const proofKeyMaterial = "proof-hmac-key-material-for-premium-worker";
const now = 1783632000;

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-premium-cdn-worker-proof-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaPremiumCdnToken.ts",
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
    return {
      premiumToken: requireFromHere(path.join(outDir, "mediaPremiumCdnToken.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const assertNoTokenLikeOutput = (label, value) => {
  const text = JSON.stringify(value);
  const tokenLikePatterns = [
    /[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,
    new RegExp(`\\bA${"KIA"}[0-9A-Z]{16}\\b`),
    new RegExp(`\\bA${"SIA"}[0-9A-Z]{16}\\b`),
    new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`),
    /\bpostgres(?:ql)?:\/\/[^/\s:]+:[^@\s]+@/i,
  ];
  for (const pattern of tokenLikePatterns) {
    requireProof(!pattern.test(text), `${label} contains token/credential-like output matching ${pattern}`);
  }
};

const worker = await import("../workers/premium-media-access/worker.mjs");
const loaded = compileHelpers();

const env = {
  PREMIUM_CDN_TOKEN_SECRET: proofKeyMaterial,
  PREMIUM_MEDIA_ALLOWED_PREFIX: "playback/protected/premium/",
  PREMIUM_MEDIA_REQUIRE_USER_HEADER: "false",
};

const buildClaims = (overrides = {}) => {
  const basePath = overrides.path ?? "playback/protected/premium/creator_video/premium-source-001/batch-001/720p/master.m3u8";
  const decision = loaded.premiumToken.canIssuePremiumCdnToken({
    userId: overrides.userId ?? "premium-user-001",
    premiumActive: overrides.premiumActive ?? true,
    sourceType: overrides.sourceType ?? "creator_video",
    sourceId: overrides.sourceId ?? "premium-source-001",
    renditionLabel: overrides.renditionLabel ?? "720p",
    path: basePath,
    visibility: overrides.visibility ?? "premium",
    scanStatus: overrides.scanStatus ?? "clean",
    moderationStatus: overrides.moderationStatus ?? "allowed",
    isOriginal: overrides.isOriginal ?? false,
    isReady: overrides.isReady ?? true,
    isPublicPlaybackSafe: overrides.isPublicPlaybackSafe ?? false,
    isProtectedPlaybackSafe: overrides.isProtectedPlaybackSafe ?? true,
    bucketRole: overrides.bucketRole ?? "protected_premium",
    deliveryFormat: overrides.deliveryFormat ?? "hls",
    deliveryProvider: overrides.deliveryProvider ?? "cloudflare_r2_premium_token",
    nowEpochSeconds: overrides.nowEpochSeconds ?? now,
    ttlSeconds: overrides.ttlSeconds ?? 300,
  });
  if (!decision.claims) {
    throw new Error(`Unable to build proof claims: ${decision.blockedReason}`);
  }
  return { ...decision.claims, ...overrides.claimPatch };
};

const sign = async (claims) => worker.signPremiumMediaAccessTokenForProof(claims, proofKeyMaterial);

const verify = async ({ requestPath, token, userId = "premium-user-001", proofEnv = env }) => {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (userId) headers.set("x-premium-user-id", userId);
  return worker.verifyPremiumMediaRequest({
    request: new Request(`https://media.chillywoodstream.com/${requestPath}`, { headers }),
    env: proofEnv,
    nowEpochSeconds: now + 60,
  });
};

try {
  const claims720 = buildClaims();
  const token720 = await sign(claims720);
  const valid720 = await verify({ requestPath: claims720.path, token: token720 });
  requireProof(valid720.allowed === true, "valid Premium token + matching 720p path should be allowed");
  requireProof(valid720.reason === "allowed", "valid 720p reason should be allowed");
  const valid720WithoutUserHeader = await verify({ requestPath: claims720.path, token: token720, userId: "" });
  requireProof(
    valid720WithoutUserHeader.allowed === true,
    "valid Premium token should work without custom user header for native HLS child requests",
  );

  const claims1080 = buildClaims({
    renditionLabel: "1080p",
    path: "playback/protected/premium/creator_video/premium-source-001/batch-001/1080p/master.m3u8",
  });
  const valid1080 = await verify({ requestPath: claims1080.path, token: await sign(claims1080) });
  requireProof(valid1080.allowed === true, "valid Premium token + matching 1080p path should be allowed");

  const missingToken = await verify({ requestPath: claims720.path, token: "" });
  requireProof(missingToken.allowed === false && missingToken.reason === "missing_token", "missing token should be denied");

  const expiredClaims = buildClaims({
    nowEpochSeconds: now - 600,
    ttlSeconds: 60,
  });
  const expired = await verify({ requestPath: expiredClaims.path, token: await sign(expiredClaims) });
  requireProof(expired.allowed === false && expired.reason === "token_expired", "expired token should be denied");

  const wrongSourceClaims = buildClaims({ claimPatch: { sourceId: "wrong-source" } });
  const wrongSource = await verify({ requestPath: claims720.path, token: await sign(wrongSourceClaims) });
  requireProof(wrongSource.allowed === false && wrongSource.reason === "source_scope_mismatch", "wrong source should be denied");

  const wrongPath = await verify({
    requestPath: "playback/protected/premium/creator_video/premium-source-001/batch-001/720p/other.m3u8",
    token: token720,
  });
  requireProof(wrongPath.allowed === false && wrongPath.reason === "path_scope_mismatch", "wrong path should be denied");

  const wrongRenditionClaims = buildClaims({ claimPatch: { renditionLabel: "1080p" } });
  const wrongRendition = await verify({ requestPath: claims720.path, token: await sign(wrongRenditionClaims) });
  requireProof(wrongRendition.allowed === false && wrongRendition.reason === "rendition_scope_mismatch", "wrong rendition should be denied");

  const nonPremiumClaims = buildClaims({ claimPatch: { premiumEntitlement: false } });
  const nonPremium = await verify({ requestPath: claims720.path, token: await sign(nonPremiumClaims) });
  requireProof(nonPremium.allowed === false && nonPremium.reason === "premium_entitlement_missing", "non-Premium token should be denied");

  const privatePath = "playback/protected/premium/creator_video/premium-source-001/private/720p/master.m3u8";
  const privateOriginal = await verify({ requestPath: privatePath, token: token720 });
  requireProof(privateOriginal.allowed === false && privateOriginal.reason === "private_path_blocked", "private path should be denied");

  const originalPath = "playback/protected/premium/creator_video/premium-source-001/original/720p/master.m3u8";
  const original = await verify({ requestPath: originalPath, token: token720 });
  requireProof(original.allowed === false && original.reason === "original_path_blocked", "original path should be denied");

  const unscannedPath = "playback/protected/premium/creator_video/premium-source-001/unscanned/720p/master.m3u8";
  const unscanned = await verify({ requestPath: unscannedPath, token: token720 });
  requireProof(unscanned.allowed === false && unscanned.reason === "unscanned_path_blocked", "unscanned path should be denied");

  const blockedPath = "playback/protected/premium/creator_video/premium-source-001/moderation-blocked/720p/master.m3u8";
  const moderationBlocked = await verify({ requestPath: blockedPath, token: token720 });
  requireProof(
    moderationBlocked.allowed === false && moderationBlocked.reason === "moderation-blocked_path_blocked",
    "moderation-blocked path should be denied",
  );

  const publicFree = await verify({
    requestPath: "playback/public/auto/creator_video/free-source/batch-001/480p/master.m3u8",
    token: "",
    userId: "",
  });
  requireProof(
    publicFree.allowed === false && publicFree.reason === "public_free_path_bypasses_premium_worker",
    "public 360p/480p path should not require Premium worker",
  );

  const fetchNow = Math.floor(Date.now() / 1000);
  const fetchClaims = buildClaims({
    nowEpochSeconds: fetchNow,
    ttlSeconds: 300,
  });
  const fetchToken = await sign(fetchClaims);
  const mockBucket = {
    async get(key) {
      if (key === fetchClaims.path) {
        return {
          body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720\nindex.m3u8\n",
          httpMetadata: { contentType: "application/vnd.apple.mpegurl" },
        };
      }
      if (key.endsWith("/index.m3u8")) {
        return {
          body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:4.0,\nsegment-000.ts\n#EXT-X-ENDLIST\n",
          httpMetadata: { contentType: "application/vnd.apple.mpegurl" },
        };
      }
      if (key.endsWith("/segment-000.ts")) {
        return {
          body: "proof-segment",
          httpMetadata: { contentType: "video/mp2t" },
        };
      }
      if (key.includes("absolute-uri-proof")) {
        return {
          body: "#EXTM3U\nhttps://private.example.invalid/segment.ts\n",
          httpMetadata: { contentType: "application/vnd.apple.mpegurl" },
        };
      }
      return {
        body: "",
        httpMetadata: { contentType: "application/octet-stream" },
      };
    },
  };
  const fetchResponse = await worker.default.fetch(
    new Request(`https://media.chillywoodstream.com/${fetchClaims.path}`, {
      headers: {
        authorization: `Bearer ${fetchToken}`,
        "x-premium-user-id": "premium-user-001",
      },
    }),
    {
      ...env,
      PREMIUM_MEDIA_R2_BUCKET: mockBucket,
    },
  );
  requireProof(fetchResponse.status === 200, "Worker should proxy matching protected object when token and bucket pass");
  requireProof(fetchResponse.headers.get("x-premium-media-access") === "allowed", "Worker response should mark protected access allowed");
  const rewrittenManifest = await fetchResponse.text();
  requireProof(/index\.m3u8\?token=/.test(rewrittenManifest), "Worker should rewrite HLS child playlist URI with child-scoped token");
  requireProof(!rewrittenManifest.includes("private.example"), "rewritten manifest should not contain private absolute URLs");
  const childToken = rewrittenManifest.match(/token=([A-Za-z0-9._-]+)/)?.[1] ?? "";
  requireProof(!!childToken, "rewritten child playlist should contain a scoped token");
  const childPlaylistPath = `${fetchClaims.path.split("/").slice(0, -1).join("/")}/index.m3u8`;
  const childPlaylistResponse = await worker.default.fetch(
    new Request(`https://media.chillywoodstream.com/${childPlaylistPath}?token=${childToken}`),
    {
      ...env,
      PREMIUM_MEDIA_R2_BUCKET: mockBucket,
    },
  );
  requireProof(childPlaylistResponse.status === 200, "rewritten child playlist token should be accepted without user header");
  const childPlaylist = await childPlaylistResponse.text();
  requireProof(/segment-000\.ts\?token=/.test(childPlaylist), "Worker should rewrite HLS segment URI with child-scoped token");
  const segmentToken = childPlaylist.match(/token=([A-Za-z0-9._-]+)/)?.[1] ?? "";
  const segmentPath = `${fetchClaims.path.split("/").slice(0, -1).join("/")}/segment-000.ts`;
  const segmentResponse = await worker.default.fetch(
    new Request(`https://media.chillywoodstream.com/${segmentPath}?token=${segmentToken}`),
    {
      ...env,
      PREMIUM_MEDIA_R2_BUCKET: mockBucket,
    },
  );
  requireProof(segmentResponse.status === 200, "rewritten segment token should be accepted without user header");

  const absoluteUriClaims = buildClaims({
    path: "playback/protected/premium/creator_video/premium-source-001/batch-001/720p/absolute-uri-proof/master.m3u8",
    nowEpochSeconds: fetchNow,
    ttlSeconds: 300,
  });
  const absoluteUriResponse = await worker.default.fetch(
    new Request(`https://media.chillywoodstream.com/${absoluteUriClaims.path}`, {
      headers: { authorization: `Bearer ${await sign(absoluteUriClaims)}` },
    }),
    {
      ...env,
      PREMIUM_MEDIA_R2_BUCKET: mockBucket,
    },
  );
  requireProof(absoluteUriResponse.status === 403, "Worker should deny manifests containing absolute child URLs");

  const deniedLog = worker.buildRedactedPremiumMediaLog({
    ...missingToken,
    claims: null,
  });
  const allowedLog = worker.buildRedactedPremiumMediaLog({
    ...valid720,
    claims: null,
  });
  const sanitized = {
    valid720: {
      allowed: valid720.allowed,
      reason: valid720.reason,
      path: valid720.path,
      renditionLabel: valid720.renditionLabel,
      tokenPresent: valid720.tokenPresent,
    },
    valid1080: {
      allowed: valid1080.allowed,
      reason: valid1080.reason,
      path: valid1080.path,
      renditionLabel: valid1080.renditionLabel,
      tokenPresent: valid1080.tokenPresent,
    },
    missingToken: deniedLog,
    publicFree: {
      allowed: publicFree.allowed,
      reason: publicFree.reason,
    },
    allowedLog,
    fetchStatus: fetchResponse.status,
    rewrittenChildPlaylist: true,
    rewrittenSegment: true,
    validWithoutUserHeader: valid720WithoutUserHeader.allowed,
    absoluteManifestUriDenied: absoluteUriResponse.status === 403,
  };
  assertNoTokenLikeOutput("premium worker proof", sanitized);
  requireProof(!JSON.stringify(sanitized).includes(token720), "sanitized proof output must not include raw token");

  if (failures.length) {
    throw new Error(`Premium CDN Worker proof failed:\n- ${failures.join("\n- ")}`);
  }

  console.log(JSON.stringify({
    status: "passed",
    architecture: "cloudflare_worker_protected_r2_prefix",
    deployed: false,
    cases: {
      valid720Allowed: true,
      valid720WithoutUserHeaderAllowed: true,
      valid1080Allowed: true,
      missingTokenDenied: true,
      expiredTokenDenied: true,
      wrongSourceDenied: true,
      wrongPathDenied: true,
      wrongRenditionDenied: true,
      nonPremiumDenied: true,
      privateOriginalUnscannedModerationBlockedDenied: true,
      tokenValueNotPrinted: true,
      publicSdBypassesPremiumWorker: true,
      hlsManifestsRewriteChildTokens: true,
      absoluteManifestUrisDenied: true,
    },
    sanitized,
  }, null, 2));
} finally {
  loaded.cleanup();
}
