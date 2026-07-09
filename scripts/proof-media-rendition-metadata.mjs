#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const fallbackUrl = "origin-signed-direct-fallback";
const cityLightsVideoId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const cityLightsHlsMasterPath =
  "playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8";
const cityLightsHlsMasterUrl = `https://media.chillywoodstream.com/${cityLightsHlsMasterPath}`;
const publicConfig = {
  deliveryProvider: "cloudflare_r2_custom_domain",
  cdnBaseUrl: "https://media.chillywoodstream.com",
  cdnSigningMode: "off",
  cdnPublicPlaybackPrefix: "playback/public/",
  cdnPrivatePlaybackDisabled: true,
  cdnAllowedPublicPlaybackPaths: [cityLightsHlsMasterPath],
};

const failures = [];
const addFailure = (message) => failures.push(message);
const requireProof = (condition, message) => {
  if (!condition) addFailure(message);
};

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-rendition-metadata-proof-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaDelivery.ts",
        "_lib/mediaRenditionMetadata.ts",
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

const { mediaDelivery, renditionMetadata, cleanup } = compileHelpers();

const resolveTrustedRendition = async (row) => {
  const trustedGate = renditionMetadata.canUseTrustedRenditionForPublicCdn(row);
  if (!trustedGate.cdnEligible) {
    return {
      provider: "origin_signed_direct",
      cdnEligible: false,
      fallbackUsed: true,
      blockedReason: trustedGate.blockedReason,
      publicPlaybackSafe: trustedGate.publicPlaybackSafe,
      url: fallbackUrl,
    };
  }

  return mediaDelivery.resolveMediaPlaybackDelivery({
    asset: renditionMetadata.buildMediaDeliveryAssetFromTrustedRendition(row),
    config: publicConfig,
    fallbackUrl,
  });
};

try {
  const fixtures = renditionMetadata.buildCityLightsTrustedHlsRenditionFixtures("2026-07-09T00:00:00.000Z");
  requireProof(fixtures.length === 2, "City Lights trusted HLS fixture should include 360p and 480p rows");

  const trustedResults = [];
  for (const fixture of fixtures) {
    const trustedGate = renditionMetadata.canUseTrustedRenditionForPublicCdn(fixture);
    requireProof(trustedGate.cdnEligible === true, `${fixture.rendition_label} trusted fixture should be CDN eligible`);
    requireProof(trustedGate.blockedReason === null, `${fixture.rendition_label} trusted fixture should not be blocked`);
    requireProof(
      trustedGate.classification.playbackPath === cityLightsHlsMasterPath,
      `${fixture.rendition_label} trusted fixture should use the HLS master playback path`,
    );

    const resolution = await resolveTrustedRendition(fixture);
    requireProof(
      resolution.url === cityLightsHlsMasterUrl,
      `${fixture.rendition_label} trusted fixture should resolve to media.chillywoodstream.com HLS master`,
    );
    requireProof(
      resolution.provider === "cloudflare_r2_custom_domain"
        && resolution.cdnEligible === true
        && resolution.fallbackUsed === false,
      `${fixture.rendition_label} trusted fixture should use Cloudflare custom-domain provider`,
    );
    trustedResults.push({
      label: fixture.rendition_label,
      path: trustedGate.classification.playbackPath,
      provider: resolution.provider,
      cdnEligible: resolution.cdnEligible,
    });
  }

  const baseFixture = fixtures[1];
  const blockedCases = [
    {
      label: "not-ready rendition",
      row: { ...baseFixture, id: "blocked-not-ready", is_ready: false },
      expectedReason: "not_ready",
    },
    {
      label: "original/master row",
      row: {
        ...baseFixture,
        id: "blocked-original",
        rendition_label: "original",
        is_original: true,
      },
      expectedReason: "original_or_master_blocked",
    },
    {
      label: "Premium row",
      row: {
        ...baseFixture,
        id: "blocked-premium",
        visibility: "premium",
      },
      expectedReason: "premium_requires_token_cdn",
    },
    {
      label: "private row",
      row: {
        ...baseFixture,
        id: "blocked-private",
        visibility: "private",
      },
      expectedReason: "private_requires_token_cdn",
    },
    {
      label: "unsafe scan state",
      row: {
        ...baseFixture,
        id: "blocked-unscanned",
        scan_status: "unscanned",
      },
      expectedReason: "scan_not_clean",
    },
    {
      label: "moderation blocked state",
      row: {
        ...baseFixture,
        id: "blocked-moderation",
        moderation_status: "hidden",
      },
      expectedReason: "moderation_not_allowed",
    },
    {
      label: "wrong bucket role",
      row: {
        ...baseFixture,
        id: "blocked-private-origin",
        bucket_role: "private_origin",
      },
      expectedReason: "wrong_bucket_role",
    },
    {
      label: "non-playback prefix",
      row: {
        ...baseFixture,
        id: "blocked-non-playback-prefix",
        public_playback_path: "renditions/chillywood-city-lights/hls/master.m3u8",
        manifest_path: "renditions/chillywood-city-lights/hls/master.m3u8",
        variant_playlist_path: "renditions/chillywood-city-lights/hls/480p/index.m3u8",
      },
      expectedReason: "non_playback_prefix",
    },
  ];

  const blockedResults = [];
  for (const blockedCase of blockedCases) {
    const trustedGate = renditionMetadata.canUseTrustedRenditionForPublicCdn(blockedCase.row);
    const resolution = await resolveTrustedRendition(blockedCase.row);
    requireProof(
      trustedGate.cdnEligible === false
        && trustedGate.blockedReason === blockedCase.expectedReason,
      `${blockedCase.label} should block at trusted metadata gate with ${blockedCase.expectedReason}`,
    );
    requireProof(
      resolution.url === fallbackUrl
        && resolution.provider === "origin_signed_direct"
        && resolution.cdnEligible === false
        && resolution.fallbackUsed === true,
      `${blockedCase.label} should fall back without public CDN URL`,
    );
    blockedResults.push({
      label: blockedCase.label,
      blockedReason: resolution.blockedReason,
    });
  }

  const nonAllowlistedRow = {
    ...baseFixture,
    id: "blocked-non-allowlisted",
    public_playback_path: "playback/public/proof-transcode/chillywood-city-lights/not-allowlisted/master.m3u8",
    manifest_path: "playback/public/proof-transcode/chillywood-city-lights/not-allowlisted/master.m3u8",
    variant_playlist_path: "playback/public/proof-transcode/chillywood-city-lights/not-allowlisted/480p/index.m3u8",
  };
  const nonAllowlistedGate = renditionMetadata.canUseTrustedRenditionForPublicCdn(nonAllowlistedRow);
  const nonAllowlistedResolution = await resolveTrustedRendition(nonAllowlistedRow);
  requireProof(nonAllowlistedGate.cdnEligible === true, "non-allowlisted row should pass trusted metadata gate before resolver allowlist");
  requireProof(
    nonAllowlistedResolution.url === fallbackUrl
      && nonAllowlistedResolution.blockedReason === "not_in_public_playback_allowlist",
    "non-allowlisted trusted row should fall back at media delivery allowlist",
  );

  const defaultCreatorVideo = await mediaDelivery.resolveMediaPlaybackDelivery({
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
  requireProof(defaultCreatorVideo.url === fallbackUrl, "default production creator-video path should keep signed-origin fallback");
  requireProof(defaultCreatorVideo.provider === "origin_signed_direct", "default production creator-video path should keep origin provider");
  requireProof(defaultCreatorVideo.cdnEligible === false, "default production creator-video path should not be CDN eligible");

  const proofSummary = {
    proof: "trusted-media-rendition-metadata",
    sourceType: "creator_video",
    sourceId: cityLightsVideoId,
    deliveryFormat: "hls",
    hlsMasterUrl: cityLightsHlsMasterUrl,
    trustedResults,
    blockedResults,
    nonAllowlistedResult: {
      blockedReason: nonAllowlistedResolution.blockedReason,
      fallbackUsed: nonAllowlistedResolution.fallbackUsed,
    },
    defaultCreatorVideoFallback: {
      provider: defaultCreatorVideo.provider,
      cdnEligible: defaultCreatorVideo.cdnEligible,
      fallbackUsed: defaultCreatorVideo.fallbackUsed,
      blockedReason: defaultCreatorVideo.blockedReason,
    },
    productionVideoRenditionWritesLive: false,
    productionDbWritesEnabled: false,
    productionPlaybackSwitched: false,
    productionTranscodeServiceLive: false,
  };

  assertNoSecretLikeText("trusted rendition metadata proof", proofSummary);

  if (failures.length) {
    console.error("Trusted media rendition metadata proof failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(JSON.stringify(proofSummary, null, 2));
  console.log("Trusted media rendition metadata proof passed.");
} finally {
  cleanup();
}
