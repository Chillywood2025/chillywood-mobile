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
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-premium-hd-resolver-proof-"));
  try {
    execFileSync(npxCommand, [
      "tsc",
      "_lib/mediaDelivery.ts",
      "_lib/mediaRenditionMetadata.ts",
      "_lib/mediaPremiumCdnToken.ts",
      "_lib/mediaPlaybackCdnEligibility.ts",
      "--target", "ES2020",
      "--module", "commonjs",
      "--moduleResolution", "node",
      "--outDir", outDir,
      "--strict",
      "--skipLibCheck",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const requireFromHere = createRequire(import.meta.url);
    return {
      eligibility: requireFromHere(path.join(outDir, "mediaPlaybackCdnEligibility.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const assertNoTokenLikeOutput = (value) => {
  const text = JSON.stringify(value);
  const patterns = [
    /[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,
    /\bBearer\s+[A-Za-z0-9._-]+\b/i,
    new RegExp(`\\bX-Amz-${"Signature"}=`, "i"),
    /\bpostgres(?:ql)?:\/\//i,
  ];
  for (const pattern of patterns) requireProof(!pattern.test(text), `resolver proof contains secret-like value matching ${pattern}`);
};

const premiumRow = {
  id: "premium-hd-720-row",
  media_id: "premium-hd-source",
  video_id: "premium-hd-source",
  source_type: "creator_video",
  source_id: "premium-hd-source",
  rendition_label: "720p",
  delivery_format: "hls",
  delivery_provider: "cloudflare_r2_premium_token",
  storage_provider: "cloudflare_r2",
  bucket_role: "protected_premium",
  public_playback_path: "",
  protected_playback_path: "playback/protected/premium/creator_video/premium-hd-source/batch-001/720p/master.m3u8",
  manifest_path: "playback/protected/premium/creator_video/premium-hd-source/batch-001/720p/master.m3u8",
  variant_playlist_path: "playback/protected/premium/creator_video/premium-hd-source/batch-001/720p/index.m3u8",
  width: 1280,
  height: 720,
  duration_ms: 60000,
  codec: "h264/aac",
  bitrate: 3000000,
  file_size_bytes: 12345,
  cache_policy: "premium_hls_worker_token_manifests_60_segments_immutable",
  visibility: "premium",
  scan_status: "clean",
  moderation_status: "allowed",
  is_public_playback_safe: false,
  is_protected_playback_safe: true,
  is_original: false,
  is_ready: true,
  created_at: "2026-07-10T00:00:00.000Z",
  updated_at: "2026-07-10T00:00:00.000Z",
  proof_mode: false,
  audit_status: "passed",
};

const freePublicRow = {
  ...premiumRow,
  id: "free-public-480-row",
  rendition_label: "480p",
  delivery_provider: "cloudflare_r2_custom_domain",
  bucket_role: "public_playback",
  public_playback_path: "playback/public/auto/creator_video/free-source/batch-001/master.m3u8",
  protected_playback_path: null,
  manifest_path: "playback/public/auto/creator_video/free-source/batch-001/master.m3u8",
  variant_playlist_path: "playback/public/auto/creator_video/free-source/batch-001/480p/index.m3u8",
  visibility: "public",
  is_public_playback_safe: true,
  is_protected_playback_safe: false,
  source_id: "free-source",
  media_id: "free-source",
  video_id: "free-source",
  width: 854,
  height: 480,
};

const config = {
  enabled: true,
  killSwitch: false,
  rolloutMode: "trusted_public",
  allowedSourceIds: [],
  deniedSourceIds: [],
  requireAuditPassed: true,
  requireBackupFresh: false,
  fallbackToOrigin: true,
  playbackDeliveryProvider: "cloudflare_r2_premium_token",
  maxBatchSize: 0,
  percentRollout: 0,
  cdnBaseUrl: "https://media.chillywoodstream.com",
  cdnPublicPlaybackPrefix: "playback/public/",
  cdnPrivatePlaybackDisabled: true,
  cdnSigningMode: "token",
  viewerUserId: "premium-user",
  viewerPremiumActive: true,
  premiumTokenTtlSeconds: 300,
  backupGate: null,
};

const loaded = compileHelpers();

try {
  const { resolveTrustedRenditionPlaybackSource, sanitizeCdnEligibilityProof } = loaded.eligibility;

  const premiumResolved = await resolveTrustedRenditionPlaybackSource({
    rendition: premiumRow,
    config,
    fallbackUrl,
    resolvePremiumTokenizedUrl: (claims) => `https://premium-media-proof.chillywoodstream.com/${claims.path}?token=[REDACTED_TOKEN]`,
  });
  requireProof(premiumResolved.cdnEligible === true, "Premium active viewer resolves HD CDN");
  requireProof(premiumResolved.fallbackUsed === false, "Premium active viewer does not fallback for HD");
  requireProof(premiumResolved.provider === "cloudflare_r2_premium_token", "Premium HD uses protected token provider");
  requireProof(premiumResolved.premiumTokenRequired === true, "Premium HD requires token");
  requireProof(premiumResolved.premiumTokenEligible === true, "Premium HD token claims are eligible");

  const freeViewer = await resolveTrustedRenditionPlaybackSource({
    rendition: premiumRow,
    config: { ...config, viewerPremiumActive: false },
    fallbackUrl,
    resolvePremiumTokenizedUrl: (claims) => `https://premium-media-proof.chillywoodstream.com/${claims.path}?token=[REDACTED_TOKEN]`,
  });
  requireProof(freeViewer.url === fallbackUrl, "free viewer falls back instead of receiving HD");
  requireProof(freeViewer.blockedReason === "premium_entitlement_required", "free viewer is denied by Premium entitlement gate");

  const noSigner = await resolveTrustedRenditionPlaybackSource({
    rendition: premiumRow,
    config,
    fallbackUrl,
  });
  requireProof(noSigner.url === fallbackUrl, "missing token signer falls back");
  requireProof(noSigner.blockedReason === "premium_token_signer_unavailable", "missing token signer is explicit");

  const killSwitch = await resolveTrustedRenditionPlaybackSource({
    rendition: premiumRow,
    config: { ...config, killSwitch: true },
    fallbackUrl,
  });
  requireProof(killSwitch.url === fallbackUrl && killSwitch.blockedReason === "kill_switch_enabled", "kill switch preserves fallback");

  const privateRow = { ...premiumRow, visibility: "private" };
  const privateResolved = await resolveTrustedRenditionPlaybackSource({ rendition: privateRow, config, fallbackUrl });
  requireProof(privateResolved.url === fallbackUrl, "private row falls back/blocks");

  const originalRow = { ...premiumRow, is_original: true };
  const originalResolved = await resolveTrustedRenditionPlaybackSource({ rendition: originalRow, config, fallbackUrl });
  requireProof(originalResolved.url === fallbackUrl && originalResolved.blockedReason === "original_or_master_blocked", "original row blocked");

  const freePublic = await resolveTrustedRenditionPlaybackSource({
    rendition: freePublicRow,
    config: { ...config, playbackDeliveryProvider: "cloudflare_r2_custom_domain", cdnSigningMode: "off" },
    fallbackUrl,
  });
  requireProof(freePublic.cdnEligible === true, "free 480p public CDN still works unsigned");

  const sanitized = {
    premiumResolved: sanitizeCdnEligibilityProof(premiumResolved),
    freeViewer: sanitizeCdnEligibilityProof(freeViewer),
    noSigner: sanitizeCdnEligibilityProof(noSigner),
    killSwitch: sanitizeCdnEligibilityProof(killSwitch),
    freePublic: sanitizeCdnEligibilityProof(freePublic),
  };
  assertNoTokenLikeOutput(sanitized);
  requireProof(!JSON.stringify(sanitized).includes("token=[REDACTED_TOKEN]"), "sanitized output should not contain token query");

  if (failures.length) throw new Error(`Premium HD resolver proof failed:\n- ${failures.join("\n- ")}`);
  console.log(JSON.stringify({
    status: "passed",
    cases: {
      premiumUserTokenizedHd: true,
      freeUserHdDenied: true,
      missingSignerFallback: true,
      killSwitchFallback: true,
      privateOriginalBlocked: true,
      freePublicSdStillUnsigned: true,
      noTokenPrinted: true,
    },
    sanitized,
  }, null, 2));
} finally {
  loaded.cleanup();
}
