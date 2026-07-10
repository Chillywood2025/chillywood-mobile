#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const fallbackUrl = "origin-signed-direct-fallback";

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-premium-cdn-token-proof-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaDelivery.ts",
        "_lib/mediaRenditionMetadata.ts",
        "_lib/mediaPremiumCdnToken.ts",
        "_lib/mediaPlaybackCdnEligibility.ts",
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
      premiumToken: loadCompiled("mediaPremiumCdnToken.js"),
      playbackCdnEligibility: loadCompiled("mediaPlaybackCdnEligibility.js"),
      renditionMetadata: loadCompiled("mediaRenditionMetadata.js"),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const assertNoSecretLikeText = (label, value) => {
  const text = JSON.stringify(value);
  const secretPatterns = [
    new RegExp(`\\bA${"KIA"}[0-9A-Z]{16}\\b`),
    new RegExp(`\\bA${"SIA"}[0-9A-Z]{16}\\b`),
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`),
    /\bpostgres(?:ql)?:\/\/[^/\s:]+:[^@\s]+@/i,
    new RegExp(`\\b(service_${"role"}|pass${"word"}|sec${"ret"}_access_key|api_key)\\b`, "i"),
  ];
  for (const pattern of secretPatterns) {
    requireProof(!pattern.test(text), `${label} output contains secret-like text matching ${pattern}`);
  }
};

const loaded = compileHelpers();

try {
  const {
    canIssuePremiumCdnToken,
    validatePremiumCdnTokenClaims,
    sanitizePremiumCdnTokenProof,
  } = loaded.premiumToken;
  const {
    canUseAuditedPublicRenditionForCdnPlayback,
    resolveTrustedRenditionPlaybackSource,
    sanitizeCdnEligibilityProof,
  } = loaded.playbackCdnEligibility;

  const now = 1783632000;
  const basePremiumRendition = {
    id: "premium-720-row",
    media_id: "premium-hd-source",
    video_id: "premium-hd-source",
    source_type: "creator_video",
    source_id: "premium-hd-source",
    rendition_label: "720p",
    delivery_format: "hls",
    delivery_provider: "cloudflare_r2_custom_domain",
    storage_provider: "cloudflare_r2",
    bucket_role: "public_playback",
    public_playback_path: "playback/premium/creator_video/premium-hd-source/batch-001/720p/master.m3u8",
    manifest_path: "playback/premium/creator_video/premium-hd-source/batch-001/720p/master.m3u8",
    variant_playlist_path: "playback/premium/creator_video/premium-hd-source/batch-001/720p/index.m3u8",
    width: 1280,
    height: 720,
    duration_ms: 60000,
    codec: "h264/aac",
    bitrate: 2800000,
    file_size_bytes: null,
    cache_policy: "hls_manifest_token_short_ttl_segments_immutable",
    visibility: "premium",
    scan_status: "clean",
    moderation_status: "allowed",
    is_public_playback_safe: true,
    is_original: false,
    is_ready: true,
    created_at: "2026-07-09T00:00:00.000Z",
    updated_at: "2026-07-09T00:00:00.000Z",
    proof_mode: false,
    audit_status: "passed",
  };
  const premiumConfig = {
    enabled: true,
    killSwitch: false,
    rolloutMode: "trusted_public",
    allowedSourceIds: [],
    deniedSourceIds: [],
    requireAuditPassed: true,
    requireBackupFresh: false,
    fallbackToOrigin: true,
    playbackDeliveryProvider: "cloudflare_r2_custom_domain",
    maxBatchSize: 0,
    percentRollout: 0,
    cdnBaseUrl: "https://media.chillywoodstream.com",
    cdnPublicPlaybackPrefix: "playback/public/",
    cdnPrivatePlaybackDisabled: true,
    cdnSigningMode: "token",
    viewerUserId: "premium-proof-user",
    viewerPremiumActive: true,
    premiumTokenTtlSeconds: 300,
    backupGate: null,
  };
  const tokenInput = {
    userId: premiumConfig.viewerUserId,
    premiumActive: true,
    sourceType: basePremiumRendition.source_type,
    sourceId: basePremiumRendition.source_id,
    renditionLabel: "720p",
    path: basePremiumRendition.manifest_path,
    visibility: basePremiumRendition.visibility,
    scanStatus: basePremiumRendition.scan_status,
    moderationStatus: basePremiumRendition.moderation_status,
    isOriginal: basePremiumRendition.is_original,
    isReady: basePremiumRendition.is_ready,
    isPublicPlaybackSafe: basePremiumRendition.is_public_playback_safe,
    bucketRole: basePremiumRendition.bucket_role,
    deliveryFormat: basePremiumRendition.delivery_format,
    deliveryProvider: basePremiumRendition.delivery_provider,
    nowEpochSeconds: now,
    ttlSeconds: 300,
  };

  const freeUser720 = canIssuePremiumCdnToken({ ...tokenInput, premiumActive: false });
  requireProof(!freeUser720.allowed && freeUser720.blockedReason === "premium_entitlement_required", "free user cannot get 720p token");

  const premiumUser720 = canIssuePremiumCdnToken(tokenInput);
  requireProof(premiumUser720.allowed === true && !!premiumUser720.claims, "Premium user can get scoped 720p token claims");
  requireProof(premiumUser720.claims?.sourceId === "premium-hd-source", "720p token claims are source scoped");
  requireProof(premiumUser720.claims?.path === basePremiumRendition.manifest_path, "720p token claims are path scoped");

  const premiumUser1080 = canIssuePremiumCdnToken({
    ...tokenInput,
    renditionLabel: "1080p",
    path: "playback/premium/creator_video/premium-hd-source/batch-001/1080p/master.m3u8",
  });
  requireProof(premiumUser1080.allowed === true && premiumUser1080.claims?.renditionLabel === "1080p", "Premium user can get scoped 1080p token claims");

  const wrongSource = validatePremiumCdnTokenClaims({
    claims: premiumUser720.claims,
    userId: premiumConfig.viewerUserId,
    sourceType: "creator_video",
    sourceId: "wrong-source",
    renditionLabel: "720p",
    path: basePremiumRendition.manifest_path,
    nowEpochSeconds: now + 60,
  });
  requireProof(!wrongSource.valid && wrongSource.blockedReason === "source_scope_mismatch", "token fails wrong source");

  const wrongPath = validatePremiumCdnTokenClaims({
    claims: premiumUser720.claims,
    userId: premiumConfig.viewerUserId,
    sourceType: "creator_video",
    sourceId: "premium-hd-source",
    renditionLabel: "720p",
    path: "playback/premium/creator_video/premium-hd-source/batch-001/1080p/master.m3u8",
    nowEpochSeconds: now + 60,
  });
  requireProof(!wrongPath.valid && wrongPath.blockedReason === "path_scope_mismatch", "token fails wrong path");

  const expired = validatePremiumCdnTokenClaims({
    claims: premiumUser720.claims,
    userId: premiumConfig.viewerUserId,
    sourceType: "creator_video",
    sourceId: "premium-hd-source",
    renditionLabel: "720p",
    path: basePremiumRendition.manifest_path,
    nowEpochSeconds: now + 301,
  });
  requireProof(!expired.valid && expired.blockedReason === "token_expired", "token fails expired");

  const wrongPrefix = canIssuePremiumCdnToken({
    ...tokenInput,
    path: "playback/public/auto/creator_video/premium-hd-source/batch-001/720p/master.m3u8",
  });
  requireProof(!wrongPrefix.allowed && wrongPrefix.blockedReason === "outside_premium_cdn_prefix", "Premium HD token requires protected Premium prefix");

  for (const [label, patch, expectedReason] of [
    ["private row", { visibility: "private" }, "private_media_blocked"],
    ["original row", { isOriginal: true }, "original_or_master_blocked"],
    ["unscanned row", { scanStatus: "unscanned" }, "scan_not_clean"],
    ["moderation blocked row", { moderationStatus: "blocked" }, "moderation_not_allowed"],
  ]) {
    const denied = canIssuePremiumCdnToken({ ...tokenInput, ...patch });
    requireProof(!denied.allowed && denied.blockedReason === expectedReason, `${label} denied for Premium CDN token`);
  }

  const unsignedPremium = await resolveTrustedRenditionPlaybackSource({
    rendition: basePremiumRendition,
    config: { ...premiumConfig, cdnSigningMode: "off" },
    fallbackUrl,
  });
  requireProof(unsignedPremium.url === fallbackUrl, "Premium HD falls back when signing mode is off");
  requireProof(unsignedPremium.blockedReason === "premium_requires_token_cdn", "Premium HD unsigned CDN is blocked");

  const noSigner = await resolveTrustedRenditionPlaybackSource({
    rendition: basePremiumRendition,
    config: premiumConfig,
    fallbackUrl,
  });
  requireProof(noSigner.url === fallbackUrl, "Premium HD falls back when token signer is unavailable");
  requireProof(noSigner.blockedReason === "premium_token_signer_unavailable", "Premium HD requires tokenized URL signer");

  const premiumResolved = await resolveTrustedRenditionPlaybackSource({
    rendition: basePremiumRendition,
    config: premiumConfig,
    fallbackUrl,
    resolvePremiumTokenizedUrl: (claims) => {
      const redactedQuery = `cdn_${"token"}=REDACTED`;
      return `https://media.chillywoodstream.com/${claims.path}?${redactedQuery}`;
    },
  });
  requireProof(premiumResolved.cdnEligible === true, "Premium HD can resolve when token mode and signer succeed");
  requireProof(premiumResolved.fallbackUsed === false, "Premium HD tokenized resolution should not use fallback");
  requireProof(premiumResolved.premiumTokenRequired === true, "Premium HD marks token required");
  requireProof(premiumResolved.premiumTokenEligible === true, "Premium HD marks token eligible");

  const freeFixture = loaded.renditionMetadata
    .buildCityLightsTrustedHlsRenditionFixtures("2026-07-09T00:00:00.000Z")[0];
  const public360 = {
    ...freeFixture,
    audit_status: "passed",
    public_playback_path: "playback/public/auto/creator_video/free-source/batch-001/master.m3u8",
    manifest_path: "playback/public/auto/creator_video/free-source/batch-001/master.m3u8",
    variant_playlist_path: "playback/public/auto/creator_video/free-source/batch-001/360p/index.m3u8",
  };
  const publicFree = canUseAuditedPublicRenditionForCdnPlayback(public360, {
    ...premiumConfig,
    cdnSigningMode: "off",
    viewerPremiumActive: false,
  });
  requireProof(publicFree.cdnEligible === true, "public 360p/480p remains unsigned CDN eligible without Premium token");
  requireProof(publicFree.premiumTokenRequired === false, "public free rendition does not require Premium token");

  const sanitized = {
    tokenDecision: sanitizePremiumCdnTokenProof(premiumUser720),
    premiumResolved: sanitizeCdnEligibilityProof(premiumResolved),
  };
  assertNoSecretLikeText("premium token proof", sanitized);
  requireProof(!JSON.stringify(sanitized).includes("premium-proof-user"), "sanitized proof should redact user scope");
  requireProof(!JSON.stringify(sanitized).includes(`cdn_${"token"}=REDACTED`), "sanitized proof should not include token query text");

  if (failures.length) {
    throw new Error(`Premium CDN token proof failed:\n- ${failures.join("\n- ")}`);
  }

  console.log(JSON.stringify({
    status: "passed",
    cases: {
      freeUserHdDenied: true,
      premiumUser720Scoped: true,
      premiumUser1080Scoped: true,
      wrongSourceDenied: true,
      wrongPathDenied: true,
      expiredDenied: true,
      privateOriginalUnscannedModerationBlockedDenied: true,
      publicSdUnsignedStillWorks: true,
      noTokenOrSecretPrinted: true,
    },
    sanitized,
  }, null, 2));
} finally {
  loaded.cleanup();
}
