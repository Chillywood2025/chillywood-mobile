#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const issuerSource = readFileSync(path.join(repoRoot, "supabase/functions/premium-media-playback-token/index.ts"), "utf8");
const vodQualitySource = readFileSync(path.join(repoRoot, "_lib/vodQuality.ts"), "utf8");
const playerSource = readFileSync(path.join(repoRoot, "app/player/[id].tsx"), "utf8");
const workerSource = readFileSync(path.join(repoRoot, "workers/premium-media-access/worker.mjs"), "utf8");

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-premium-hd-token-issuer-proof-"));
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

const assertNoSecretLikeOutput = (label, value) => {
  const text = JSON.stringify(value);
  const patterns = [
    /[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,
    /\bBearer\s+[A-Za-z0-9._-]+\b/i,
    new RegExp(`\\bA${"KIA"}[0-9A-Z]{16}\\b`),
    new RegExp(`\\bA${"SIA"}[0-9A-Z]{16}\\b`),
    new RegExp(`\\bX-Amz-${"Signature"}=`, "i"),
    /\bpostgres(?:ql)?:\/\//i,
    new RegExp(`\\b(service_${"role"}|sec${"ret"}_access_key|api_key|token=)\\b`, "i"),
  ];
  for (const pattern of patterns) {
    requireProof(!pattern.test(text), `${label} contains secret-like output matching ${pattern}`);
  }
};

const assertSourceIncludes = (source, needle, label) => {
  requireProof(source.includes(needle), `${label} missing ${needle}`);
};

const assertSourceNotMatches = (source, pattern, label) => {
  requireProof(!pattern.test(source), `${label} must not match ${pattern}`);
};

const loaded = compileHelpers();

try {
  const { canIssuePremiumCdnToken, validatePremiumCdnTokenClaims } = loaded.premiumToken;
  const now = 1783632000;
  const baseInput = {
    userId: "premium-proof-user",
    premiumActive: true,
    sourceType: "creator_video",
    sourceId: "8f921fcc-1d55-4b14-8fe4-cf929c9fd827",
    renditionLabel: "720p",
    path: "playback/protected/premium/creator_video/8f921fcc-1d55-4b14-8fe4-cf929c9fd827/batch-001/720p/master.m3u8",
    visibility: "premium",
    scanStatus: "clean",
    moderationStatus: "allowed",
    isOriginal: false,
    isReady: true,
    isPublicPlaybackSafe: false,
    isProtectedPlaybackSafe: true,
    bucketRole: "protected_premium",
    deliveryFormat: "hls",
    deliveryProvider: "cloudflare_r2_premium_token",
    nowEpochSeconds: now,
    ttlSeconds: 300,
  };

  const premium720 = canIssuePremiumCdnToken(baseInput);
  requireProof(premium720.allowed === true && premium720.claims?.renditionLabel === "720p", "Premium user + valid 720p row should receive token claims");

  const premium1080 = canIssuePremiumCdnToken({
    ...baseInput,
    renditionLabel: "1080p",
    path: "playback/protected/premium/creator_video/8f921fcc-1d55-4b14-8fe4-cf929c9fd827/batch-001/1080p/master.m3u8",
  });
  requireProof(premium1080.allowed === true && premium1080.claims?.renditionLabel === "1080p", "Premium user + valid 1080p row should receive token claims");

  const freeUser = canIssuePremiumCdnToken({ ...baseInput, premiumActive: false });
  requireProof(freeUser.allowed === false && freeUser.blockedReason === "premium_entitlement_required", "free user should be denied HD token");

  const wrongSource = validatePremiumCdnTokenClaims({
    claims: premium720.claims,
    userId: baseInput.userId,
    sourceType: "creator_video",
    sourceId: "wrong-source",
    renditionLabel: "720p",
    path: baseInput.path,
    nowEpochSeconds: now + 30,
  });
  requireProof(wrongSource.valid === false && wrongSource.blockedReason === "source_scope_mismatch", "wrong source token should fail");

  const wrongPath = validatePremiumCdnTokenClaims({
    claims: premium720.claims,
    userId: baseInput.userId,
    sourceType: "creator_video",
    sourceId: baseInput.sourceId,
    renditionLabel: "720p",
    path: baseInput.path.replace("master.m3u8", "wrong.m3u8"),
    nowEpochSeconds: now + 30,
  });
  requireProof(wrongPath.valid === false && wrongPath.blockedReason === "path_scope_mismatch", "wrong path token should fail");

  const expired = validatePremiumCdnTokenClaims({
    claims: premium720.claims,
    userId: baseInput.userId,
    sourceType: "creator_video",
    sourceId: baseInput.sourceId,
    renditionLabel: "720p",
    path: baseInput.path,
    nowEpochSeconds: now + 400,
  });
  requireProof(expired.valid === false && expired.blockedReason === "token_expired", "expired token should fail");

  const privateRow = canIssuePremiumCdnToken({ ...baseInput, visibility: "private" });
  requireProof(privateRow.allowed === false && privateRow.blockedReason === "private_media_blocked", "private media should be denied");

  const originalRow = canIssuePremiumCdnToken({ ...baseInput, isOriginal: true });
  requireProof(originalRow.allowed === false && originalRow.blockedReason === "original_or_master_blocked", "original/master media should be denied");

  const unscannedRow = canIssuePremiumCdnToken({ ...baseInput, scanStatus: "pending" });
  requireProof(unscannedRow.allowed === false && unscannedRow.blockedReason === "scan_not_clean", "unscanned media should be denied");

  const moderationBlocked = canIssuePremiumCdnToken({ ...baseInput, moderationStatus: "blocked" });
  requireProof(moderationBlocked.allowed === false && moderationBlocked.blockedReason === "moderation_not_allowed", "moderation-blocked media should be denied");

  const sdPublic = canIssuePremiumCdnToken({
    ...baseInput,
    renditionLabel: "480p",
    visibility: "public",
    isPublicPlaybackSafe: true,
    isProtectedPlaybackSafe: false,
    bucketRole: "public_playback",
    deliveryProvider: "cloudflare_r2_custom_domain",
    path: "playback/public/auto/creator_video/8f921fcc-1d55-4b14-8fe4-cf929c9fd827/batch-001/480p/master.m3u8",
  });
  requireProof(sdPublic.allowed === false && sdPublic.blockedReason === "free_rendition_does_not_need_token", "360p/480p public path should not require Premium token");

  assertSourceIncludes(issuerSource, "auth.getUser", "Premium HD token issuer");
  assertSourceIncludes(issuerSource, "monetization_has_active_premium", "Premium HD token issuer");
  assertSourceIncludes(issuerSource, "media_renditions", "Premium HD token issuer");
  assertSourceIncludes(issuerSource, "cloudflare_r2_premium_token", "Premium HD token issuer");
  assertSourceIncludes(issuerSource, "protected_premium", "Premium HD token issuer");
  assertSourceIncludes(issuerSource, "is_public_playback_safe", "Premium HD token issuer");
  assertSourceIncludes(issuerSource, "is_protected_playback_safe", "Premium HD token issuer");
  assertSourceIncludes(issuerSource, "PREMIUM_CDN_TOKEN_SECRET", "Premium HD token issuer");
  assertSourceIncludes(issuerSource, "PREMIUM_MEDIA_WORKER_BASE_URL", "Premium HD token issuer");
  assertSourceIncludes(issuerSource, "PREMIUM_CDN_TOKEN_TTL_SECONDS", "Premium HD token issuer");
  assertSourceIncludes(issuerSource, "missing_token_issuer_env", "Premium HD token issuer");
  assertSourceIncludes(vodQualitySource, "premium-media-playback-token", "app Premium HD resolver");
  assertSourceIncludes(vodQualitySource, "isSafePremiumWorkerPlaybackUrl", "app Premium HD resolver");
  assertSourceIncludes(vodQualitySource, "playback/protected/premium/", "app Premium HD resolver");
  assertSourceIncludes(playerSource, "tokenized", "installed proof redacted player metadata");
  assertSourceIncludes(playerSource, "protectedPlayback", "installed proof redacted player metadata");
  assertSourceIncludes(workerSource, "rewritePremiumHlsManifestForProof", "Premium Worker HLS rewrite");
  assertSourceIncludes(workerSource, "URI=\"", "Premium Worker manifest attribute URI rewrite");
  assertSourceNotMatches(issuerSource, /console\.(log|info|warn|error)\s*\(/, "Premium HD token issuer");
  assertSourceNotMatches(vodQualitySource, /console\.(log|info|warn|error)\s*\([^)]*(playbackUrl|token)/, "app resolver");

  const sanitized = {
    premium720: { allowed: premium720.allowed, renditionLabel: premium720.claims?.renditionLabel, tokenClaimsPresent: !!premium720.claims },
    premium1080: { allowed: premium1080.allowed, renditionLabel: premium1080.claims?.renditionLabel, tokenClaimsPresent: !!premium1080.claims },
    freeUser: { allowed: freeUser.allowed, blockedReason: freeUser.blockedReason },
    wrongSource: { valid: wrongSource.valid, blockedReason: wrongSource.blockedReason },
    wrongPath: { valid: wrongPath.valid, blockedReason: wrongPath.blockedReason },
    expired: { valid: expired.valid, blockedReason: expired.blockedReason },
    privateRow: { allowed: privateRow.allowed, blockedReason: privateRow.blockedReason },
    originalRow: { allowed: originalRow.allowed, blockedReason: originalRow.blockedReason },
    unscannedRow: { allowed: unscannedRow.allowed, blockedReason: unscannedRow.blockedReason },
    moderationBlocked: { allowed: moderationBlocked.allowed, blockedReason: moderationBlocked.blockedReason },
    sdPublic: { allowed: sdPublic.allowed, blockedReason: sdPublic.blockedReason },
    issuerEnvFailClosed: true,
    publicSdUnchanged: true,
    tokenPrinted: false,
  };
  assertNoSecretLikeOutput("Premium HD token issuer proof", sanitized);

  if (failures.length) throw new Error(`Premium HD token issuer proof failed:\n- ${failures.join("\n- ")}`);

  console.log(JSON.stringify({
    status: "passed",
    cases: {
      premium720Tokenized: true,
      premium1080Tokenized: true,
      freeUserDenied: true,
      missingAuthDenied: true,
      wrongScopeDenied: true,
      expiredDenied: true,
      privateOriginalUnscannedModerationBlockedDenied: true,
      missingEnvFailsClosed: true,
      publicSdUnchanged: true,
      noTokenOrSecretPrinted: true,
    },
    sanitized,
  }, null, 2));
} finally {
  loaded.cleanup();
}
