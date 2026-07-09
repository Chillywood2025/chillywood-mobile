#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const fallbackUrl = "origin-signed-direct-fallback";
const publicProofPath = "playback/public/proof/hello.txt";
const publicProofUrl = "https://media.chillywoodstream.com/playback/public/proof/hello.txt";
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
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-delivery-proof-"));
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
    const candidates = [
      path.join(outDir, "mediaDelivery.js"),
      path.join(outDir, "_lib", "mediaDelivery.js"),
    ];
    for (const candidate of candidates) {
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

const assertNoSecretLikeText = (label, value) => {
  const text = JSON.stringify(value);
  const secretPatterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b/,
    /\b(Bearer|service_role|secret|password|access_key|api_key)\b/i,
  ];
  for (const pattern of secretPatterns) {
    requireProof(!pattern.test(text), `${label} output contains secret-like text matching ${pattern}`);
  }
};

const { helper, cleanup } = compileHelper();

try {
  const safePublic = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: publicProofPath,
      publicPlaybackSafe: true,
      accessTier: "free",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(
    safePublic.url === publicProofUrl,
    "public safe proof object should resolve to media.chillywoodstream.com",
  );
  requireProof(safePublic.provider === "cloudflare_r2_custom_domain", "public safe proof object should use Cloudflare R2 custom-domain provider");
  requireProof(safePublic.cdnEligible === true, "public safe proof object should be CDN eligible");
  requireProof(safePublic.fallbackUsed === false, "public safe proof object should not use fallback");

  const safeDemoProof = await helper.resolveMediaPlaybackDelivery({
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
  requireProof(safeDemoProof.url === demoProofUrl, "safe demo proof video should resolve to media.chillywoodstream.com");
  requireProof(safeDemoProof.provider === "cloudflare_r2_custom_domain", "safe demo proof video should use Cloudflare R2 custom-domain provider");
  requireProof(safeDemoProof.cdnEligible === true, "safe demo proof video should be CDN eligible");
  requireProof(safeDemoProof.fallbackUsed === false, "safe demo proof video should not use fallback");

  const defaultCreatorVideo = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: "owner-id/video-id/source.mp4",
      publicPlaybackSafe: false,
      accessTier: "free",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(defaultCreatorVideo.url === fallbackUrl, "default creator-video source path should keep signed origin fallback");
  requireProof(defaultCreatorVideo.provider === "origin_signed_direct", "default creator-video source path should keep origin signed provider");
  requireProof(defaultCreatorVideo.cdnEligible === false, "default creator-video source path should not be CDN eligible");
  requireProof(defaultCreatorVideo.fallbackUsed === true, "default creator-video source path should use fallback");

  const privatePath = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: "private/source.mp4",
      publicPlaybackSafe: true,
      accessTier: "private",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(privatePath.url === fallbackUrl, "private path should fall back to signed origin placeholder");
  requireProof(privatePath.provider === "origin_signed_direct", "private path should keep origin signed provider");
  requireProof(privatePath.cdnEligible === false, "private path should not be CDN eligible");
  requireProof(
    privatePath.blockedReason === "outside_public_playback_prefix",
    "private path should be blocked before any CDN URL is built",
  );

  const originalPath = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: "playback/public/originals/source.mp4",
      publicPlaybackSafe: true,
      qualityLabel: "original",
      accessTier: "free",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(originalPath.url === fallbackUrl, "original path should fall back to signed origin placeholder");
  requireProof(originalPath.blockedReason === "original_or_master_blocked", "original path should be blocked from public CDN");

  const premiumPath = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: "playback/public/proof/hd.m3u8",
      publicPlaybackSafe: true,
      accessTier: "premium",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(premiumPath.url === fallbackUrl, "Premium path should fall back to signed origin placeholder");
  requireProof(premiumPath.blockedReason === "premium_requires_token_cdn", "Premium path should require signed/token CDN before public CDN");

  const missingConfig = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: "playback/public/proof/hello.txt",
      publicPlaybackSafe: true,
      accessTier: "free",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: {
      deliveryProvider: "origin_signed_direct",
      cdnBaseUrl: "",
      cdnPrivatePlaybackDisabled: true,
    },
    fallbackUrl,
  });
  requireProof(missingConfig.url === fallbackUrl, "missing or disabled CDN config should fall back");
  requireProof(missingConfig.blockedReason === "delivery_provider_disabled", "disabled CDN config should report provider disabled");

  const unsafePublic = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: "playback/public/proof/hello.txt",
      publicPlaybackSafe: false,
      accessTier: "free",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: publicConfig,
    fallbackUrl,
  });
  requireProof(unsafePublic.url === fallbackUrl, "public prefix without explicit publicPlaybackSafe should fall back");
  requireProof(unsafePublic.blockedReason === "public_playback_not_marked_safe", "unsafe public prefix should report explicit safety block");

  const invalidSigningMode = await helper.resolveMediaPlaybackDelivery({
    asset: {
      path: "playback/public/proof/hello.txt",
      publicPlaybackSafe: true,
      accessTier: "free",
      scanStatus: "clean",
      moderationStatus: "clean",
    },
    config: {
      ...publicConfig,
      cdnSigningMode: "invalid",
    },
    fallbackUrl,
  });
  requireProof(invalidSigningMode.url === fallbackUrl, "invalid CDN signing mode should fall back");
  requireProof(invalidSigningMode.blockedReason === "invalid_cdn_signing_mode", "invalid CDN signing mode should report invalid signing block");

  const proofSummary = {
    safePublic: {
      provider: safePublic.provider,
      cdnEligible: safePublic.cdnEligible,
      fallbackUsed: safePublic.fallbackUsed,
      publicPlaybackSafe: safePublic.publicPlaybackSafe,
      url: safePublic.url,
    },
    safeDemoProof: {
      provider: safeDemoProof.provider,
      cdnEligible: safeDemoProof.cdnEligible,
      fallbackUsed: safeDemoProof.fallbackUsed,
      publicPlaybackSafe: safeDemoProof.publicPlaybackSafe,
      url: safeDemoProof.url,
    },
    defaultCreatorVideo: {
      provider: defaultCreatorVideo.provider,
      cdnEligible: defaultCreatorVideo.cdnEligible,
      fallbackUsed: defaultCreatorVideo.fallbackUsed,
      blockedReason: defaultCreatorVideo.blockedReason,
      publicPlaybackSafe: defaultCreatorVideo.publicPlaybackSafe,
    },
    privatePath: {
      provider: privatePath.provider,
      cdnEligible: privatePath.cdnEligible,
      fallbackUsed: privatePath.fallbackUsed,
      blockedReason: privatePath.blockedReason,
      publicPlaybackSafe: privatePath.publicPlaybackSafe,
    },
    originalPath: {
      provider: originalPath.provider,
      cdnEligible: originalPath.cdnEligible,
      fallbackUsed: originalPath.fallbackUsed,
      blockedReason: originalPath.blockedReason,
      publicPlaybackSafe: originalPath.publicPlaybackSafe,
    },
    premiumPath: {
      provider: premiumPath.provider,
      cdnEligible: premiumPath.cdnEligible,
      fallbackUsed: premiumPath.fallbackUsed,
      blockedReason: premiumPath.blockedReason,
      publicPlaybackSafe: premiumPath.publicPlaybackSafe,
    },
    missingConfig: {
      provider: missingConfig.provider,
      cdnEligible: missingConfig.cdnEligible,
      fallbackUsed: missingConfig.fallbackUsed,
      blockedReason: missingConfig.blockedReason,
      publicPlaybackSafe: missingConfig.publicPlaybackSafe,
    },
    unsafePublic: {
      provider: unsafePublic.provider,
      cdnEligible: unsafePublic.cdnEligible,
      fallbackUsed: unsafePublic.fallbackUsed,
      blockedReason: unsafePublic.blockedReason,
      publicPlaybackSafe: unsafePublic.publicPlaybackSafe,
    },
    invalidSigningMode: {
      provider: invalidSigningMode.provider,
      cdnEligible: invalidSigningMode.cdnEligible,
      fallbackUsed: invalidSigningMode.fallbackUsed,
      blockedReason: invalidSigningMode.blockedReason,
      publicPlaybackSafe: invalidSigningMode.publicPlaybackSafe,
    },
  };

  assertNoSecretLikeText("media delivery resolver proof", proofSummary);

  if (failures.length) {
    console.error("Media delivery resolver proof failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Media delivery resolver proof passed.");
  console.log(JSON.stringify(proofSummary, null, 2));
} finally {
  cleanup();
}
