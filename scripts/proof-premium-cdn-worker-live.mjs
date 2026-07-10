#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const defaultWorkerUrl = "https://premium-media-proof.chillywoodstream.com";
const workerUrl = (process.env.PREMIUM_CDN_WORKER_URL || defaultWorkerUrl).replace(/\/+$/g, "");
const now = Math.floor(Date.now() / 1000);
const proofPath = "playback/protected/premium/proof/hello/720p/hello.txt";
const proofUserId = "premium-proof-user";
const expectedProofText = "chillywood premium protected worker proof 2026-07-10";

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const loadSecret = () => {
  if (process.env.PREMIUM_CDN_TOKEN_SECRET_FILE) {
    const secretFile = process.env.PREMIUM_CDN_TOKEN_SECRET_FILE;
    if (!existsSync(secretFile)) {
      throw new Error("missing_PREMIUM_CDN_TOKEN_SECRET_FILE");
    }
    return readFileSync(secretFile, "utf8").trim();
  }
  if (process.env.PREMIUM_CDN_TOKEN_SECRET) {
    return process.env.PREMIUM_CDN_TOKEN_SECRET.trim();
  }
  throw new Error("missing_PREMIUM_CDN_TOKEN_SECRET_or_PREMIUM_CDN_TOKEN_SECRET_FILE");
};

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-premium-cdn-worker-live-proof-"));
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

const parseJsonSafely = async (response) => {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
};

const worker = await import("../workers/premium-media-access/worker.mjs");
const secret = loadSecret();
const loaded = compileHelpers();

const buildClaims = (overrides = {}) => {
  const claimPath = overrides.path ?? proofPath;
  const decision = loaded.premiumToken.canIssuePremiumCdnToken({
    userId: overrides.userId ?? proofUserId,
    premiumActive: overrides.premiumActive ?? true,
    sourceType: overrides.sourceType ?? "proof",
    sourceId: overrides.sourceId ?? "hello",
    renditionLabel: overrides.renditionLabel ?? "720p",
    path: claimPath,
    visibility: overrides.visibility ?? "premium",
    scanStatus: overrides.scanStatus ?? "clean",
    moderationStatus: overrides.moderationStatus ?? "allowed",
    isOriginal: overrides.isOriginal ?? false,
    isReady: overrides.isReady ?? true,
    isPublicPlaybackSafe: overrides.isPublicPlaybackSafe ?? true,
    bucketRole: overrides.bucketRole ?? "public_playback",
    deliveryFormat: overrides.deliveryFormat ?? "hls",
    deliveryProvider: overrides.deliveryProvider ?? "cloudflare_r2_custom_domain",
    nowEpochSeconds: overrides.nowEpochSeconds ?? now,
    ttlSeconds: overrides.ttlSeconds ?? 300,
  });
  if (!decision.claims) {
    throw new Error(`Unable to build live proof claims: ${decision.blockedReason}`);
  }
  return { ...decision.claims, ...overrides.claimPatch };
};

const sign = async (claims) => worker.signPremiumMediaAccessTokenForProof(claims, secret);

const fetchPath = async ({ requestPath, token, userId = proofUserId }) => {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (userId) headers.set("x-premium-user-id", userId);
  const response = await fetch(`${workerUrl}/${requestPath}`, { headers });
  const body = await parseJsonSafely(response);
  return {
    status: response.status,
    ok: response.ok,
    reason: body.json?.reason ?? null,
    text: body.text,
    header: response.headers.get("x-premium-media-access") ?? "",
  };
};

try {
  const validToken = await sign(buildClaims());
  const valid = await fetchPath({ requestPath: proofPath, token: validToken });
  requireProof(valid.status === 200, "valid Premium token + proof 720p path should return HTTP 200");
  requireProof(valid.text.trim() === expectedProofText, "valid Premium token should read expected harmless proof object");
  requireProof(valid.header === "allowed", "valid response should include protected access marker");

  const missingToken = await fetchPath({ requestPath: proofPath, token: "" });
  requireProof(missingToken.status === 403 && missingToken.reason === "missing_token", "missing token should be denied");

  const expiredToken = await sign(buildClaims({ nowEpochSeconds: now - 600, ttlSeconds: 60 }));
  const expired = await fetchPath({ requestPath: proofPath, token: expiredToken });
  requireProof(expired.status === 403 && expired.reason === "token_expired", "expired token should be denied");

  const wrongPath = await fetchPath({
    requestPath: "playback/protected/premium/proof/hello/720p/wrong.txt",
    token: validToken,
  });
  requireProof(wrongPath.status === 403 && wrongPath.reason === "path_scope_mismatch", "wrong path should be denied");

  const wrongSourceToken = await sign(buildClaims({ claimPatch: { sourceId: "wrong-source" } }));
  const wrongSource = await fetchPath({ requestPath: proofPath, token: wrongSourceToken });
  requireProof(wrongSource.status === 403 && wrongSource.reason === "source_scope_mismatch", "wrong source should be denied");

  const wrongRenditionToken = await sign(buildClaims({ claimPatch: { renditionLabel: "1080p" } }));
  const wrongRendition = await fetchPath({ requestPath: proofPath, token: wrongRenditionToken });
  requireProof(wrongRendition.status === 403 && wrongRendition.reason === "rendition_scope_mismatch", "wrong rendition should be denied");

  const nonPremiumToken = await sign(buildClaims({ claimPatch: { premiumEntitlement: false } }));
  const nonPremium = await fetchPath({ requestPath: proofPath, token: nonPremiumToken });
  requireProof(nonPremium.status === 403 && nonPremium.reason === "premium_entitlement_missing", "non-Premium token should be denied");

  const privatePath = await fetchPath({
    requestPath: "playback/protected/premium/proof/hello/private/720p/hello.txt",
    token: validToken,
  });
  requireProof(privatePath.status === 403 && privatePath.reason === "private_path_blocked", "private path should be denied");

  const originalPath = await fetchPath({
    requestPath: "playback/protected/premium/proof/hello/original/720p/hello.txt",
    token: validToken,
  });
  requireProof(originalPath.status === 403 && originalPath.reason === "original_path_blocked", "original path should be denied");

  const publicFree = await fetchPath({
    requestPath: "playback/public/auto/proof/hello/batch-001/480p/master.m3u8",
    token: "",
    userId: "",
  });
  requireProof(
    publicFree.status === 403 && publicFree.reason === "public_free_path_bypasses_premium_worker",
    "public 360p/480p path should not be forced through Premium Worker",
  );

  const sanitized = {
    workerUrl,
    proofPath,
    valid: { status: valid.status, header: valid.header, textMatches: valid.text.trim() === expectedProofText },
    missingToken: { status: missingToken.status, reason: missingToken.reason },
    expired: { status: expired.status, reason: expired.reason },
    wrongPath: { status: wrongPath.status, reason: wrongPath.reason },
    wrongSource: { status: wrongSource.status, reason: wrongSource.reason },
    wrongRendition: { status: wrongRendition.status, reason: wrongRendition.reason },
    nonPremium: { status: nonPremium.status, reason: nonPremium.reason },
    privatePath: { status: privatePath.status, reason: privatePath.reason },
    originalPath: { status: originalPath.status, reason: originalPath.reason },
    publicFree: { status: publicFree.status, reason: publicFree.reason },
    tokenPrinted: false,
    hdMediaGenerated: false,
    productionPlaybackSwitched: false,
  };
  assertNoTokenLikeOutput("live premium worker proof", sanitized);

  if (failures.length) {
    throw new Error(`Live Premium CDN Worker proof failed:\n- ${failures.join("\n- ")}`);
  }

  console.log(JSON.stringify({
    status: "passed",
    architecture: "cloudflare_worker_protected_r2_prefix",
    deployed: true,
    sanitized,
  }, null, 2));
} finally {
  loaded.cleanup();
}
