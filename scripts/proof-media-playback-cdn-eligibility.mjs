#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const fallbackUrl = "origin-signed-direct-fallback";
const cityLightsSourceId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const workerProofMasterPath =
  "playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/master.m3u8";

const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-playback-cdn-eligibility-proof-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaDelivery.ts",
        "_lib/mediaRenditionMetadata.ts",
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
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`),
    /\bpostgres(?:ql)?:\/\/[^/\s:]+:[^@\s]+@/i,
    /\b(service_role|password|secret_access_key|api_key)\b/i,
  ];
  for (const pattern of secretPatterns) {
    requireProof(!pattern.test(text), `${label} output contains secret-like text matching ${pattern}`);
  }
};

const { playbackCdnEligibility, renditionMetadata, cleanup } = compileHelpers();

try {
  const [fixture360, fixture480] = renditionMetadata
    .buildCityLightsTrustedHlsRenditionFixtures("2026-07-09T00:00:00.000Z")
    .map((fixture) => ({
      ...fixture,
      audit_status: "passed",
      proof_mode: false,
      public_playback_path: workerProofMasterPath,
      manifest_path: workerProofMasterPath,
      variant_playlist_path: workerProofMasterPath.replace(
        "master.m3u8",
        `${fixture.rendition_label}/index.m3u8`,
      ),
    }));

  const validRow = fixture480;
  const closedBackupGate = {
    status: "closed_for_latest_manual_backup",
    latestBackupVerified: true,
    restoreDrillPassed: true,
  };
  const enabledTrustedPublicConfig = {
    enabled: true,
    killSwitch: false,
    rolloutMode: "trusted_public",
    allowedSourceIds: [],
    deniedSourceIds: [],
    playbackDeliveryProvider: "cloudflare_r2_custom_domain",
    maxBatchSize: 0,
    percentRollout: 0,
    cdnBaseUrl: "https://media.chillywoodstream.com",
    cdnPublicPlaybackPrefix: "playback/public/",
    cdnPrivatePlaybackDisabled: true,
    cdnSigningMode: "off",
    requireAuditPassed: true,
    requireBackupFresh: true,
    fallbackToOrigin: true,
    backupGate: closedBackupGate,
  };
  const canaryConfig = {
    ...enabledTrustedPublicConfig,
    rolloutMode: "canary",
    allowedSourceIds: [cityLightsSourceId],
  };
  const batchConfig = {
    ...enabledTrustedPublicConfig,
    rolloutMode: "batch",
    allowedSourceIds: [cityLightsSourceId, "future-public-safe-source"],
    maxBatchSize: 2,
  };

  const resolve = async (rendition, config = enabledTrustedPublicConfig) => (
    playbackCdnEligibility.resolveTrustedRenditionPlaybackSource({
      rendition,
      config,
      fallbackUrl,
    })
  );

  requireProof(playbackCdnEligibility.resolveCdnRolloutMode("canary") === "canary", "canary rollout mode should normalize");
  requireProof(playbackCdnEligibility.resolveCdnRolloutMode("batch") === "batch", "batch rollout mode should normalize");
  requireProof(playbackCdnEligibility.resolveCdnRolloutMode("trusted_public") === "trusted_public", "trusted_public rollout mode should normalize");
  requireProof(playbackCdnEligibility.resolveCdnRolloutMode("unexpected") === "off", "unexpected rollout mode should fail closed");

  const defaultOff = await resolve(validRow, {});
  requireProof(defaultOff.url === fallbackUrl, "rollout off should use signed-origin fallback");
  requireProof(defaultOff.blockedReason === "global_cdn_disabled", "rollout off should block with global_cdn_disabled");

  const killSwitch = await resolve(validRow, {
    ...enabledTrustedPublicConfig,
    killSwitch: true,
  });
  requireProof(killSwitch.url === fallbackUrl, "kill switch should use signed-origin fallback");
  requireProof(killSwitch.blockedReason === "kill_switch_enabled", "kill switch should block CDN eligibility");

  const canaryCityLights = await resolve(validRow, canaryConfig);
  requireProof(
    canaryCityLights.url === `https://media.chillywoodstream.com/${workerProofMasterPath}`,
    "canary rollout should resolve City Lights HLS master through media.chillywoodstream.com",
  );
  requireProof(canaryCityLights.cdnEligible === true, "canary City Lights should be CDN eligible");
  requireProof(canaryCityLights.sourceAllowlisted === true, "canary City Lights should be source allowlisted");

  const canaryOtherSource = await resolve(
    { ...validRow, id: "other-source-row", source_id: "not-city-lights" },
    canaryConfig,
  );
  requireProof(canaryOtherSource.url === fallbackUrl, "canary non-allowlisted source should fall back");
  requireProof(canaryOtherSource.blockedReason === "source_not_allowed", "canary non-allowlisted source should be blocked");

  const batchSelected = await resolve(validRow, batchConfig);
  requireProof(batchSelected.cdnEligible === true, "batch selected source should be CDN eligible");
  requireProof(batchSelected.maxBatchSize === 2, "batch selected source should carry max batch size");

  const batchUnselected = await resolve(
    { ...validRow, id: "batch-unselected-row", source_id: "batch-unselected-source" },
    batchConfig,
  );
  requireProof(batchUnselected.url === fallbackUrl, "batch unselected source should fall back");
  requireProof(batchUnselected.blockedReason === "source_not_allowed", "batch unselected source should be blocked");

  const batchCapExceeded = await resolve(validRow, {
    ...batchConfig,
    allowedSourceIds: [cityLightsSourceId, "future-public-safe-source", "overflow-source"],
    maxBatchSize: 2,
  });
  requireProof(batchCapExceeded.blockedReason === "batch_cap_exceeded", "batch cap should be enforced");

  const trustedPublic = await resolve(validRow, enabledTrustedPublicConfig);
  requireProof(
    trustedPublic.url === `https://media.chillywoodstream.com/${workerProofMasterPath}`,
    "trusted_public valid audited public row should resolve CDN HLS",
  );
  requireProof(trustedPublic.cdnEligible === true, "trusted_public valid audited public row should be CDN eligible");

  const genericTrustedPublicPath = "playback/public/worker-proof/generic-audited-source/batch-0001/master.m3u8";
  const genericTrustedPublic = await resolve(
    {
      ...validRow,
      id: "generic-trusted-public-row",
      media_id: "generic-audited-source",
      video_id: "generic-audited-source",
      source_id: "generic-audited-source",
      public_playback_path: genericTrustedPublicPath,
      manifest_path: genericTrustedPublicPath,
      variant_playlist_path: genericTrustedPublicPath.replace("master.m3u8", "480p/index.m3u8"),
    },
    enabledTrustedPublicConfig,
  );
  requireProof(
    genericTrustedPublic.url === `https://media.chillywoodstream.com/${genericTrustedPublicPath}`,
    "trusted_public should resolve a generic audited public-safe row, not only City Lights",
  );
  requireProof(genericTrustedPublic.cdnEligible === true, "generic trusted_public row should be CDN eligible");

  const oldEnv = {};
  for (const name of [
    "EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_ENABLED",
    "EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_KILL_SWITCH",
    "EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_ROLLOUT_MODE",
    "EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_DELIVERY_PROVIDER",
    "EXPO_PUBLIC_MEDIA_CDN_BASE_URL",
    "EXPO_PUBLIC_MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX",
    "EXPO_PUBLIC_MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED",
    "EXPO_PUBLIC_MEDIA_CDN_SIGNING_MODE",
    "EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_BACKUP_GATE_STATUS",
    "EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_BACKUP_LATEST_VERIFIED",
    "EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_RESTORE_DRILL_PASSED",
  ]) {
    oldEnv[name] = process.env[name];
  }
  process.env.EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_ENABLED = "true";
  process.env.EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_KILL_SWITCH = "false";
  process.env.EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_ROLLOUT_MODE = "trusted_public";
  process.env.EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_DELIVERY_PROVIDER = "cloudflare_r2_custom_domain";
  process.env.EXPO_PUBLIC_MEDIA_CDN_BASE_URL = "https://media.chillywoodstream.com";
  process.env.EXPO_PUBLIC_MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX = "playback/public/";
  process.env.EXPO_PUBLIC_MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED = "true";
  process.env.EXPO_PUBLIC_MEDIA_CDN_SIGNING_MODE = "off";
  process.env.EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_BACKUP_GATE_STATUS = "closed_for_latest_manual_backup";
  process.env.EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_BACKUP_LATEST_VERIFIED = "true";
  process.env.EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_RESTORE_DRILL_PASSED = "true";
  const prefixedEnvConfig = playbackCdnEligibility.readMediaPlaybackCdnConfig();
  const prefixedEnvResolution = await playbackCdnEligibility.resolveTrustedRenditionPlaybackSource({
    rendition: validRow,
    fallbackUrl,
  });
  for (const [name, value] of Object.entries(oldEnv)) {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
  requireProof(prefixedEnvConfig.enabled === true, "EXPO_PUBLIC rollout env should enable CDN playback");
  requireProof(prefixedEnvConfig.killSwitch === false, "EXPO_PUBLIC kill switch env should disable kill switch");
  requireProof(prefixedEnvConfig.rolloutMode === "trusted_public", "EXPO_PUBLIC rollout mode should be trusted_public");
  requireProof(
    prefixedEnvResolution.cdnEligible === true
      && prefixedEnvResolution.url === `https://media.chillywoodstream.com/${workerProofMasterPath}`,
    "EXPO_PUBLIC rollout env should resolve the audited City Lights HLS master",
  );

  const blockedCases = [
    {
      label: "audit pending",
      row: { ...validRow, id: "audit-pending-row", audit_status: "pending" },
      expectedReason: "audit_not_passed",
    },
    {
      label: "private row",
      row: { ...validRow, id: "private-row", visibility: "private" },
      expectedReason: "private_requires_token_cdn",
    },
    {
      label: "Premium row",
      row: { ...validRow, id: "premium-row", visibility: "premium" },
      expectedReason: "premium_requires_token_cdn",
    },
    {
      label: "original/master row",
      row: { ...validRow, id: "original-row", rendition_label: "original", is_original: true },
      expectedReason: "original_or_master_blocked",
    },
    {
      label: "unscanned row",
      row: { ...validRow, id: "unscanned-row", scan_status: "unscanned" },
      expectedReason: "scan_not_clean",
    },
    {
      label: "moderation blocked row",
      row: { ...validRow, id: "moderation-row", moderation_status: "blocked" },
      expectedReason: "moderation_not_allowed",
    },
    {
      label: "wrong prefix row",
      row: {
        ...validRow,
        id: "wrong-prefix-row",
        public_playback_path: "renditions/city-lights/master.m3u8",
        manifest_path: "renditions/city-lights/master.m3u8",
        variant_playlist_path: "renditions/city-lights/480p/index.m3u8",
      },
      expectedReason: "non_playback_prefix",
    },
    {
      label: "wrong bucket role row",
      row: { ...validRow, id: "wrong-bucket-role-row", bucket_role: "private_origin" },
      expectedReason: "wrong_bucket_role",
    },
    {
      label: "stale backup gate",
      row: validRow,
      config: {
        ...enabledTrustedPublicConfig,
        backupGate: { status: "stale", latestBackupVerified: true, restoreDrillPassed: false },
      },
      expectedReason: "backup_gate_not_fresh",
    },
    {
      label: "denied source",
      row: validRow,
      config: {
        ...enabledTrustedPublicConfig,
        deniedSourceIds: [cityLightsSourceId],
      },
      expectedReason: "source_denied",
    },
  ];

  const blockedResults = [];
  for (const blockedCase of blockedCases) {
    const result = await resolve(blockedCase.row, blockedCase.config ?? enabledTrustedPublicConfig);
    requireProof(result.url === fallbackUrl, `${blockedCase.label} should keep signed-origin fallback`);
    requireProof(
      result.provider === "origin_signed_direct"
        && result.cdnEligible === false
        && result.fallbackUsed === true,
      `${blockedCase.label} should not use public CDN`,
    );
    requireProof(
      result.blockedReason === blockedCase.expectedReason,
      `${blockedCase.label} should block with ${blockedCase.expectedReason}, got ${result.blockedReason}`,
    );
    blockedResults.push(playbackCdnEligibility.sanitizeCdnEligibilityProof(result));
  }

  const fallbackAvailable = await resolve(
    { ...validRow, id: "fallback-still-available", audit_status: "failed" },
    enabledTrustedPublicConfig,
  );
  requireProof(fallbackAvailable.url === fallbackUrl, "signed-origin fallback should remain available");
  requireProof(fallbackAvailable.fallbackAvailable === true, "fallback availability should be explicit");

  const sanitized = [
    playbackCdnEligibility.sanitizeCdnEligibilityProof(defaultOff),
    playbackCdnEligibility.sanitizeCdnEligibilityProof(canaryCityLights),
    playbackCdnEligibility.sanitizeCdnEligibilityProof(batchSelected),
    playbackCdnEligibility.sanitizeCdnEligibilityProof(trustedPublic),
    playbackCdnEligibility.sanitizeCdnEligibilityProof(genericTrustedPublic),
    playbackCdnEligibility.sanitizeCdnEligibilityProof(prefixedEnvResolution),
    ...blockedResults,
    playbackCdnEligibility.sanitizeCdnEligibilityProof(fallbackAvailable),
  ];
  assertNoSecretLikeText("CDN eligibility proof", sanitized);

  requireProof(fixture360.rendition_label === "360p", "360p trusted fixture should still be present");
  requireProof(fixture480.rendition_label === "480p", "480p trusted fixture should still be present");

  const summary = {
    proof: "media-playback-cdn-eligibility",
    rolloutOffFallback: defaultOff.blockedReason === "global_cdn_disabled" && defaultOff.url === fallbackUrl,
    killSwitchFallback: killSwitch.blockedReason === "kill_switch_enabled" && killSwitch.url === fallbackUrl,
    canaryCityLightsCdn: canaryCityLights.cdnEligible === true,
    canaryOtherSourceFallback: canaryOtherSource.blockedReason === "source_not_allowed",
    batchSelectedSourceCdn: batchSelected.cdnEligible === true,
    batchUnselectedSourceFallback: batchUnselected.blockedReason === "source_not_allowed",
    batchCapEnforced: batchCapExceeded.blockedReason === "batch_cap_exceeded",
    trustedPublicValidAuditedRowCdn: trustedPublic.cdnEligible === true,
    trustedPublicGenericAuditedRowCdn: genericTrustedPublic.cdnEligible === true,
    expoPublicEnvActivationCdn: prefixedEnvResolution.cdnEligible === true,
    blockedCaseCount: blockedResults.length,
    signedOriginFallbackAvailable: fallbackAvailable.fallbackAvailable === true,
    productionPlaybackSwitched: false,
    productionWorkerDeployed: false,
    productionBackfillRun: false,
    privatePremiumOriginalPublicCdnAllowed: false,
    sanitized,
  };

  assertNoSecretLikeText("summary", summary);

  if (failures.length) {
    console.error("Media playback CDN eligibility proof failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  cleanup();
}
