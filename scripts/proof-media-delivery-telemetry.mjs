#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const realDemoVideoId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const realDemoPath = "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4";
const proofStartedAt = "2026-07-09T01:00:00.000Z";
const proofEndedAt = "2026-07-09T01:00:12.500Z";
const proofCreatedAt = "2026-07-09T01:00:13.000Z";

const failures = [];
const fail = (message) => failures.push(message);
const assertProof = (condition, message) => {
  if (!condition) fail(message);
};

const compileTelemetryHelper = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-delivery-telemetry-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaDeliveryTelemetry.ts",
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
      path.join(outDir, "mediaDeliveryTelemetry.js"),
      path.join(outDir, "_lib", "mediaDeliveryTelemetry.js"),
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
    throw new Error("Compiled media delivery telemetry helper was not found.");
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const assertNoRawPrivateProofText = (label, value) => {
  const text = JSON.stringify(value);
  const disallowed = [
    /raw_user_private/i,
    /raw_creator_private/i,
    /raw_watch_party_private/i,
    /private-origin\.example/i,
    /X-Amz-Signature/i,
    /https?:\/\/private/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  ];
  for (const pattern of disallowed) {
    assertProof(!pattern.test(text), `${label} must not expose raw private proof text matching ${pattern}`);
  }
};

const assertNoFullUrlFields = (label, record) => {
  const text = JSON.stringify(record);
  assertProof(!/https?:\/\//i.test(text), `${label} telemetry record must not include full playback URLs`);
  assertProof(!/X-Amz-Signature/i.test(text), `${label} telemetry record must not include signed origin query material`);
};

const { helper, cleanup } = compileTelemetryHelper();

try {
  const estimatedBytes = helper.estimatePlaybackBytes({
    contentLengthBytes: 4372373,
    durationSeconds: 52.208333,
    secondsWatched: 12.5,
  });
  assertProof(Number.isInteger(estimatedBytes), "estimated playback bytes should be an integer");
  assertProof(estimatedBytes > 0 && estimatedBytes < 4372373, "estimated playback bytes should be bounded by content length");

  const cdnDemoEvent = helper.buildMediaDeliveryEvent({
    id: "proof_media_delivery_event_cdn_demo",
    userId: "raw_user_private_demo_viewer",
    videoId: realDemoVideoId,
    creatorId: "raw_creator_private_city_lights",
    sourceType: "creator_video",
    sourceId: realDemoVideoId,
    deliveryProvider: "cloudflare_r2_custom_domain",
    playbackUrlProvider: "cloudflare_r2_custom_domain",
    mediaDeliveryProvider: "cloudflare_r2_custom_domain",
    deliveryFormat: "hls",
    automationMode: "auto_detect",
    batchSize: 5,
    qualityLabel: "480p",
    renditionLabel: "480p",
    rolloutMode: "trusted_public",
    publicPlaybackSafe: true,
    cdnEligible: true,
    fallbackUsed: false,
    watchPartyId: null,
    freeOrPremium: "free",
    isPremiumUser: false,
    startedAt: proofStartedAt,
    endedAt: proofEndedAt,
    secondsWatched: 12.5,
    contentLengthBytes: 4372373,
    durationSeconds: 52.208333,
    cdnCacheStatus: "HIT",
    clientPlatform: "proof-node",
    appVersion: "proof-only",
    proofMode: true,
    eventType: "playback_progress",
    createdAt: proofCreatedAt,
  });
  assertProof(cdnDemoEvent.table_name === "media_delivery_events", "CDN demo event should target media_delivery_events shape");
  assertProof(cdnDemoEvent.delivery_provider === "cloudflare_r2_custom_domain", "CDN demo event should record Cloudflare custom-domain provider");
  assertProof(cdnDemoEvent.cdn_eligible === true, "CDN demo event should be CDN eligible");
  assertProof(cdnDemoEvent.fallback_used === false, "CDN demo event should not use fallback");
  assertProof(cdnDemoEvent.public_playback_safe === true, "CDN demo event should be explicitly public playback safe");
  assertProof(cdnDemoEvent.quality_label === "480p", "CDN demo event should record 480p/demo quality");
  assertProof(cdnDemoEvent.delivery_format === "hls", "CDN demo event should record HLS delivery format");
  assertProof(cdnDemoEvent.rollout_mode === "trusted_public", "CDN demo event should record rollout mode");
  assertProof(cdnDemoEvent.free_or_premium === "free", "CDN demo event should record free/Premium class");
  assertProof(cdnDemoEvent.estimated_bytes === estimatedBytes, "CDN demo event should use estimated byte calculation");
  assertProof(cdnDemoEvent.cdn_cache_status === "HIT", "CDN demo event should carry cache status when available");
  assertNoFullUrlFields("CDN demo event", cdnDemoEvent);

  const signedOriginFallbackEvent = helper.buildMediaDeliveryEvent({
    id: "proof_media_delivery_event_signed_origin_fallback",
    userId: "raw_user_private_fallback_viewer",
    videoId: "fallback_video",
    sourceType: "creator_video",
    sourceId: "fallback_video",
    deliveryProvider: "origin_signed_direct",
    playbackUrlProvider: "origin_signed_direct",
    mediaDeliveryProvider: "origin_signed_direct",
    deliveryFormat: "mp4",
    qualityLabel: "legacy",
    rolloutMode: "off",
    publicPlaybackSafe: false,
    cdnEligible: false,
    fallbackUsed: true,
    isPremiumUser: false,
    freeOrPremium: "free",
    startedAt: proofStartedAt,
    endedAt: proofEndedAt,
    bitrateBitsPerSecond: 800000,
    secondsWatched: 10,
    clientPlatform: "proof-node",
    appVersion: "proof-only",
    proofMode: true,
    eventType: "signed_origin_fallback",
    createdAt: proofCreatedAt,
  });
  assertProof(signedOriginFallbackEvent.fallback_used === true, "signed-origin fallback event should use fallback");
  assertProof(signedOriginFallbackEvent.cdn_eligible === false, "signed-origin fallback event should not be CDN eligible");
  assertProof(signedOriginFallbackEvent.estimated_bytes === 1000000, "signed-origin fallback event should estimate bytes from bitrate and seconds");
  assertNoFullUrlFields("signed-origin fallback event", signedOriginFallbackEvent);

  const blockedPrivateOriginalPremiumEvent = helper.buildMediaDeliveryEvent({
    id: "proof_media_delivery_event_blocked_private",
    userId: "raw_user_private_blocked_viewer",
    videoId: "blocked_video",
    creatorId: "raw_creator_private_blocked_owner",
    sourceType: "creator_video",
    sourceId: "blocked_video",
    deliveryProvider: "origin_signed_direct",
    playbackUrlProvider: "origin_signed_direct",
    mediaDeliveryProvider: "origin_signed_direct",
    deliveryFormat: "hls",
    qualityLabel: "original",
    renditionLabel: "source_master",
    rolloutMode: "trusted_public",
    publicPlaybackSafe: false,
    cdnEligible: false,
    fallbackUsed: true,
    blockedReason: "premium_requires_token_cdn",
    isPremiumUser: false,
    freeOrPremium: "premium",
    startedAt: proofStartedAt,
    clientPlatform: "proof-node",
    appVersion: "proof-only",
    proofMode: true,
    eventType: "blocked_playback_resolution",
    createdAt: proofCreatedAt,
  });
  assertProof(blockedPrivateOriginalPremiumEvent.blocked_reason === "premium_requires_token_cdn", "blocked event should carry blocked reason");
  assertProof(blockedPrivateOriginalPremiumEvent.cdn_eligible === false, "blocked event should not be CDN eligible");
  assertProof(blockedPrivateOriginalPremiumEvent.fallback_used === true, "blocked event should stay on fallback/block path");
  assertNoFullUrlFields("blocked private/original/Premium event", blockedPrivateOriginalPremiumEvent);

  const batchRolloutEvent = helper.buildMediaDeliveryEvent({
    id: "proof_media_delivery_event_batch_rollout",
    userId: "raw_user_private_batch_viewer",
    videoId: realDemoVideoId,
    creatorId: "raw_creator_private_city_lights",
    sourceType: "creator_video",
    sourceId: realDemoVideoId,
    deliveryProvider: "cloudflare_r2_custom_domain",
    playbackUrlProvider: "cloudflare_r2_custom_domain",
    mediaDeliveryProvider: "cloudflare_r2_custom_domain",
    deliveryFormat: "hls",
    automationMode: "auto_detect",
    batchSize: 5,
    qualityLabel: "480p",
    renditionLabel: "480p",
    rolloutMode: "batch",
    publicPlaybackSafe: true,
    cdnEligible: true,
    fallbackUsed: false,
    watchPartyId: null,
    freeOrPremium: "free",
    isPremiumUser: false,
    startedAt: proofStartedAt,
    endedAt: proofEndedAt,
    secondsWatched: 12.5,
    contentLengthBytes: 4372373,
    durationSeconds: 52.208333,
    cdnCacheStatus: "HIT",
    clientPlatform: "proof-node",
    appVersion: "proof-only",
    proofMode: true,
    eventType: "batch_rollout_playback_progress",
    createdAt: proofCreatedAt,
  });
  assertProof(batchRolloutEvent.rollout_mode === "batch", "batch rollout event should record batch rollout mode");
  assertProof(batchRolloutEvent.delivery_format === "hls", "batch rollout event should record HLS delivery format");
  assertProof(batchRolloutEvent.automation_mode === "auto_detect", "batch rollout event should record auto-detect automation mode");
  assertProof(batchRolloutEvent.batch_size === 5, "batch rollout event should record batch size");
  assertProof(batchRolloutEvent.cdn_cache_status === "HIT", "batch rollout event should carry cache status");
  assertNoFullUrlFields("batch rollout event", batchRolloutEvent);

  const sessionStart = helper.buildMediaPlaybackSessionStart({
    id: "proof_media_playback_session_start",
    userId: "raw_user_private_session_viewer",
    videoId: realDemoVideoId,
    creatorId: "raw_creator_private_city_lights",
    sourceType: "creator_video",
    sourceId: realDemoVideoId,
    deliveryProvider: "cloudflare_r2_custom_domain",
    playbackUrlProvider: "cloudflare_r2_custom_domain",
    mediaDeliveryProvider: "cloudflare_r2_custom_domain",
    deliveryFormat: "hls",
    qualityLabel: "480p",
    renditionLabel: "480p",
    rolloutMode: "trusted_public",
    publicPlaybackSafe: true,
    cdnEligible: true,
    fallbackUsed: false,
    watchPartyId: null,
    freeOrPremium: "free",
    isPremiumUser: false,
    startedAt: proofStartedAt,
    clientPlatform: "proof-node",
    appVersion: "proof-only",
    proofMode: true,
    createdAt: proofCreatedAt,
  });
  assertProof(sessionStart.table_name === "media_playback_sessions", "session start should target media_playback_sessions shape");
  assertProof(sessionStart.watch_party_id === null, "session start should support nullable Watch-Party id");
  assertProof(sessionStart.ended_at === null, "session start should not force ended_at");
  assertProof(sessionStart.seconds_watched === null, "session start should not force seconds_watched");

  const sessionEnd = helper.buildMediaPlaybackSessionEnd({
    ...sessionStart,
    id: "proof_media_playback_session_end",
    userId: "raw_user_private_session_viewer",
    videoId: realDemoVideoId,
    creatorId: "raw_creator_private_city_lights",
    sourceType: "creator_video",
    sourceId: realDemoVideoId,
    deliveryProvider: "cloudflare_r2_custom_domain",
    playbackUrlProvider: "cloudflare_r2_custom_domain",
    mediaDeliveryProvider: "cloudflare_r2_custom_domain",
    deliveryFormat: "hls",
    qualityLabel: "480p",
    renditionLabel: "480p",
    rolloutMode: "trusted_public",
    publicPlaybackSafe: true,
    cdnEligible: true,
    fallbackUsed: false,
    watchPartyId: "raw_watch_party_private_room",
    freeOrPremium: "free",
    isPremiumUser: false,
    startedAt: proofStartedAt,
    endedAt: proofEndedAt,
    contentLengthBytes: 4372373,
    durationSeconds: 52.208333,
    clientPlatform: "proof-node",
    appVersion: "proof-only",
    proofMode: true,
    createdAt: proofCreatedAt,
  });
  assertProof(sessionEnd.watch_party_id === "raw_watch_party_private_room", "session end should support non-null Watch-Party id before proof sanitization");
  assertProof(sessionEnd.video_id === realDemoVideoId, "session end should preserve video id");
  assertProof(sessionEnd.seconds_watched === 12.5, "session end should derive seconds watched from timestamps");
  assertProof(sessionEnd.estimated_bytes === estimatedBytes, "session end should estimate bytes from derived seconds");

  const sanitizerProbe = {
    user_id: "raw_user_private_probe",
    creator_id: "raw_creator_private_probe",
    watch_party_id: "raw_watch_party_private_probe",
    privateSignedUrl: `https://private-origin.example/source.mp4?X-Amz-${"Signature"}=redactedproof`,
    playback_url_provider: "origin_signed_direct",
  };
  const sanitizedProbe = helper.sanitizeMediaDeliveryTelemetryForProof(sanitizerProbe);
  assertProof(sanitizedProbe.user_id === "redacted:user", "sanitizer should redact user_id");
  assertProof(sanitizedProbe.creator_id === "redacted:creator", "sanitizer should redact creator_id");
  assertProof(sanitizedProbe.watch_party_id === "redacted:watch_party", "sanitizer should redact watch_party_id");
  assertProof(sanitizedProbe.privateSignedUrl === "redacted:url", "sanitizer should redact private signed URL-like values");
  assertProof(sanitizedProbe.playback_url_provider === "origin_signed_direct", "sanitizer should preserve provider labels that are not URLs");

  const sanitizedProof = helper.sanitizeMediaDeliveryTelemetryForProof({
    telemetryFoundation: {
      helperMode: "pure-source-proof-only",
      productionTelemetryWritesLive: false,
      backendWritesImplemented: false,
      productionPlaybackSwitched: false,
      tablesCreated: false,
      noLiveSavingsClaim: true,
      hlsTranscodingLive: false,
      realDemoPath,
    },
    cdnDemoEvent,
    signedOriginFallbackEvent,
    blockedPrivateOriginalPremiumEvent,
    batchRolloutEvent,
    sessionStart,
    sessionEnd,
    sanitizerProbe,
  });
  assertNoRawPrivateProofText("sanitized media delivery telemetry proof", sanitizedProof);

  if (failures.length) {
    console.error("Media delivery telemetry proof failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Media delivery telemetry proof passed.");
  console.log(JSON.stringify(sanitizedProof, null, 2));
} finally {
  cleanup();
}
