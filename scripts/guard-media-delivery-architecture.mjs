#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));

const failures = [];
const fail = (message) => failures.push(message);

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const assertNotMatches = (source, pattern, label) => {
  const match = source.match(pattern);
  if (match) fail(`${label} must not match ${pattern}: ${match[0]}`);
};

const splitSentences = (source) => (
  source
    .split(/\n+/)
    .flatMap((line) => line.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.replace(/^[-*\d.]+\s*/, "").trim())
    .filter(Boolean)
);

const hasNegatingLanguage = (sentence) => (
  /\b(not|no|never|missing|pending|planned|target|future|foundation|blocked|fallback|without|until|exclude|excludes|excluded|cannot)\b/i.test(sentence)
  || /\bdoes not\b/i.test(sentence)
  || /\bdo not\b/i.test(sentence)
  || /\bmust not\b/i.test(sentence)
  || /\bnot live\b/i.test(sentence)
  || /\bnot closed\b/i.test(sentence)
  || /\bnot proved\b/i.test(sentence)
);

const claimSentences = (source, subjectPattern, claimPattern) => (
  splitSentences(source).filter((sentence) => (
    subjectPattern.test(sentence)
    && claimPattern.test(sentence)
    && !hasNegatingLanguage(sentence)
  ))
);

const architecture = read("docs/MEDIA_DELIVERY_SCALE_ARCHITECTURE.md");
const autonomousRegistry = read("_lib/autonomousSystemsRegistry.ts");
const vodDoc = read("docs/VOD_QUALITY_LADDER_AND_PLAYBACK_RESOLVER.md");
const mediaMigrationPlan = read("docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md");
const mediaTranscodeWorkerRunbook = read("docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md");
const mediaRecoveryOperatorRunbook = read("docs/MEDIA_RECOVERY_OPERATOR_RUNBOOK.md");
const mediaAutomationOperatorRunbook = read("docs/MEDIA_AUTOMATION_OPERATOR_RUNBOOK.md");
const mediaCatalogReadinessRunbook = read("docs/MEDIA_CATALOG_READINESS_RUNBOOK.md");
const wave2Doc = read("docs/WAVE2_CREATOR_MEDIA_CLOSURE_RUNBOOK.md");
const docsCorpus = [architecture, vodDoc, mediaMigrationPlan, mediaTranscodeWorkerRunbook, mediaRecoveryOperatorRunbook, mediaAutomationOperatorRunbook, mediaCatalogReadinessRunbook, wave2Doc].join("\n\n");
const mediaStatusCorpus = docsCorpus;

const mediaStorage = read("_lib/mediaStorage.ts");
const mediaDelivery = read("_lib/mediaDelivery.ts");
const mediaDeliveryTelemetry = read("_lib/mediaDeliveryTelemetry.ts");
const mediaTranscodeQueue = read("_lib/mediaTranscodeQueue.ts");
const mediaTranscodeOperator = read("_lib/mediaTranscodeOperator.ts");
const mediaTranscodeWorkerSafety = read("_lib/mediaTranscodeWorkerSafety.ts");
const mediaRecoveryOperator = read("_lib/mediaRecoveryOperator.ts");
const mediaRenditionMetadata = read("_lib/mediaRenditionMetadata.ts");
const mediaPlaybackCdnEligibility = read("_lib/mediaPlaybackCdnEligibility.ts");
const mediaPremiumCdnToken = read("_lib/mediaPremiumCdnToken.ts");
const premiumCdnWorker = read("workers/premium-media-access/worker.mjs");
const premiumCdnWorkerConfig = read("workers/premium-media-access/wrangler.toml");
const premiumHdTokenIssuerFunction = read("supabase/functions/premium-media-playback-token/index.ts");
const mediaAutomationController = read("_lib/mediaAutomationController.ts");
const mediaAutomationDiscovery = read("_lib/mediaAutomationDiscovery.ts");
const mediaAutomationBatchPolicy = read("_lib/mediaAutomationBatchPolicy.ts");
const mediaAutomationJobs = read("_lib/mediaAutomationJobs.ts");
const mediaAutomationWorkerLoop = read("_lib/mediaAutomationWorkerLoop.ts");
const chillywoodAutonomyPolicy = read("_lib/chillywoodAutonomyPolicy.ts");
const mediaAutomationBackfillPolicy = read("_lib/mediaAutomationBackfillPolicy.ts");
const mediaAutomationQueueProcessor = read("_lib/mediaAutomationQueueProcessor.ts");
const mediaCatalogReadiness = read("_lib/mediaCatalogReadiness.ts");
const mediaScanAutomation = read("_lib/mediaScanAutomation.ts");
const mediaStorageFunction = read("supabase/functions/media-storage/index.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const vodQuality = read("_lib/vodQuality.ts");
const performancePolicy = read("_lib/performancePolicy.ts");
const player = read("app/player/[id].tsx");
const watchPartyContentSources = read("_lib/watchPartyContentSources.ts");
const migration = read("supabase/migrations/202605140010_vod_quality_ladder_resolver.sql");
const trustedRenditionMigration = read("supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql");
const packageJson = read("package.json");
const mediaDeliveryResolverProof = read("scripts/proof-media-delivery-resolver.mjs");
const mediaDeliveryPublicDemoProof = read("scripts/proof-media-delivery-public-demo.mjs");
const mediaDeliveryRealDemoProof = read("scripts/proof-media-delivery-real-demo.mjs");
const mediaDeliveryHlsDemoProof = read("scripts/proof-media-delivery-hls-demo.mjs");
const mediaDeliveryTelemetryProof = read("scripts/proof-media-delivery-telemetry.mjs");
const mediaTranscodeQueueProof = read("scripts/proof-media-transcode-queue-hls.mjs");
const mediaTranscodeWorkerLocalProof = read("scripts/proof-media-transcode-worker-local.mjs");
const mediaTranscodeBackupGateProof = read("scripts/proof-media-transcode-backup-gate.mjs");
const mediaTranscodeOperatorProof = read("scripts/proof-media-transcode-operator-control.mjs");
const mediaTranscodeWorkerAuditorProof = read("scripts/proof-media-transcode-worker-auditor.mjs");
const mediaScheduledBackupGateProof = read("scripts/proof-media-scheduled-backup-gate.mjs");
const mediaWorkerBackupRunner = read("scripts/run-media-worker-logical-backup.mjs");
const mediaWorkerBackupCli = read("scripts/media-worker-backup-cli.mjs");
const mediaWorkerBackupRunnerProof = read("scripts/proof-media-worker-backup-runner.mjs");
const mediaTranscodeWorkerCli = read("scripts/media-transcode-worker-cli.mjs");
const mediaTranscodeWorkerCliProof = read("scripts/proof-media-transcode-worker-cli.mjs");
const mediaWorkerCliChecklist = read("docs/MEDIA_WORKER_CLI_OPERATING_CHECKLIST.md");
const mediaWorkerCliChecklistProof = read("scripts/proof-media-worker-cli-operating-checklist.mjs");
const mediaRecoveryBackupRestoreProof = read("scripts/proof-media-recovery-backup-restore.mjs");
const mediaWorkerRollbackDrillProof = read("scripts/proof-media-worker-rollback-drill.mjs");
const mediaRenditionMetadataProof = read("scripts/proof-media-rendition-metadata.mjs");
const mediaPlaybackCdnEligibilityProof = read("scripts/proof-media-playback-cdn-eligibility.mjs");
const mediaPremiumCdnTokenProof = read("scripts/proof-media-premium-cdn-token.mjs");
const premiumCdnWorkerProof = read("scripts/proof-premium-cdn-worker.mjs");
const premiumCdnWorkerLiveProof = read("scripts/proof-premium-cdn-worker-live.mjs");
const premiumHdTokenIssuerProof = read("scripts/proof-premium-hd-token-issuer.mjs");
const mediaCdnRolloutPlanner = read("scripts/media-cdn-rollout-planner.mjs");
const mediaCdnRolloutPlannerProof = read("scripts/proof-media-cdn-rollout-planner.mjs");
const mediaAutomationCli = read("scripts/media-automation-cli.mjs");
const mediaCatalogReadinessCli = read("scripts/media-catalog-readiness-cli.mjs");
const mediaScanCli = read("scripts/media-scan-cli.mjs");
const mediaScanPrivateAccessFunction = read("supabase/functions/media-scan-private-access/index.ts");
const mediaScanPrivateAccessProof = read("scripts/proof-media-scan-private-access.mjs");
const mediaAutomationControllerProof = read("scripts/proof-media-automation-controller.mjs");
const mediaAutomationDiscoveryProof = read("scripts/proof-media-automation-discovery.mjs");
const mediaAutomationBatchPolicyProof = read("scripts/proof-media-automation-batch-policy.mjs");
const mediaAutomationBackfillPolicyProof = read("scripts/proof-media-automation-backfill-policy.mjs");
const mediaAutomationQueueProcessorProof = read("scripts/proof-media-automation-queue-processor.mjs");
const mediaAutomationSchedulerTemplatesProof = read("scripts/proof-media-automation-scheduler-templates.mjs");
const mediaAutomationCliProof = read("scripts/proof-media-automation-cli.mjs");
const mediaAutomationBatchPlannerProof = read("scripts/proof-media-automation-batch-planner.mjs");
const mediaAutomationWorkerLoopProof = read("scripts/proof-media-automation-worker-loop.mjs");
const mediaCatalogReadinessProof = read("scripts/proof-media-catalog-readiness.mjs");
const mediaScanAutomationProof = read("scripts/proof-media-scan-automation.mjs");
const mediaRenditionMigrationPolicyProof = read("scripts/proof-media-rendition-migration-policy.mjs");
const mediaRenditionMigrationDryRunProof = read("scripts/proof-media-rendition-migration-dry-run.mjs");

const sourceCorpus = [
  mediaStorage,
  mediaDelivery,
  mediaDeliveryTelemetry,
  mediaTranscodeQueue,
  mediaTranscodeOperator,
  mediaTranscodeWorkerSafety,
  mediaRecoveryOperator,
  mediaRenditionMetadata,
  mediaPlaybackCdnEligibility,
  mediaPremiumCdnToken,
  premiumCdnWorker,
  premiumCdnWorkerConfig,
  premiumHdTokenIssuerFunction,
  mediaAutomationController,
  mediaAutomationDiscovery,
  mediaAutomationBatchPolicy,
  mediaAutomationJobs,
  mediaAutomationWorkerLoop,
  chillywoodAutonomyPolicy,
  mediaAutomationBackfillPolicy,
  mediaAutomationQueueProcessor,
  mediaCatalogReadiness,
  mediaScanAutomation,
  mediaCatalogReadinessCli,
  mediaScanCli,
  mediaAutomationCli,
  mediaTranscodeWorkerCli,
  mediaStorageFunction,
  creatorVideos,
  vodQuality,
  performancePolicy,
  player,
  watchPartyContentSources,
  migration,
].join("\n\n");
const deliveryClaimsCorpus = [docsCorpus, sourceCorpus].join("\n\n");

const hasTranscodeWorker = (
  exists("supabase/functions/media-transcode/index.ts")
  || exists("supabase/functions/transcode-worker/index.ts")
  || exists("scripts/media-transcode-worker.mjs")
  || /\bvideo_transcode_jobs\b/.test(migration)
);
const hasHlsDemoProofWorker = exists("scripts/proof-media-delivery-hls-demo.mjs");
const hasCdnPlaybackPath = /\b(CDN_PLAYBACK|cdnPlayback|createSignedCdn|signedCdn|cdn_base_url|cdn_url|CDN_BASE_URL|mediaPlaybackCdnEligibility|resolveTrustedRenditionPlaybackSource|cloudflare_r2_custom_domain)\b/.test(sourceCorpus);
const hasPlaybackTelemetry = /\b(media_bandwidth_events|record_media_playback_egress|cdn_access_logs|cdn_access_log|playback_egress_bytes|rendition_bytes_served|edge_bytes_served)\b/i.test(sourceCorpus);
const hasResumableUpload = /\b(createMultipartUpload|completeMultipartUpload|UploadPart|multipart_upload|tus|resumable_upload|direct_upload_session)\b/i.test(sourceCorpus);

if (!hasHlsDemoProofWorker) {
  fail("local HLS demo proof worker script must exist before docs can claim HLS demo proof");
}

assertIncludes(architecture, "Status: staged resolver helpers, proof scripts, architecture, and guard only.", "media delivery architecture doc");
assertIncludes(autonomousRegistry, "id: \"media_automation\"", "autonomous media system registry");
assertIncludes(autonomousRegistry, "private/Premium/original public exposure", "autonomous media public exposure boundary");
assertIncludes(autonomousRegistry, "backup/restore", "autonomous media backup gate");
assertIncludes(autonomousRegistry, "rollback/quarantine", "autonomous media rollback gate");
assertIncludes(autonomousRegistry, "broad_media_backfill_or_new_scheduler", "autonomous media Level 3 expansion gate");
assertIncludes(architecture, "Production backend transcode service status: no daemon, queue processor, cron, scheduler, or backend transcode service is live. Bounded CLI/operator transcode passes have produced audited public 360p/480p HLS rows and protected Premium HD rows, but no continuous worker or broad backfill is enabled.", "media delivery architecture doc");
assertIncludes(architecture, "Cloudflare custom domain/cache status: `media.chillywoodstream.com` is connected only to the separate public-playback proof bucket. Controlled audited public HLS playback is active for trusted eligible `media_renditions` rows; private/original/Premium media remains blocked from public CDN.", "media delivery architecture doc");
assertIncludes(architecture, "Cloudflare R2 public playback resolver status: staged helper and proof scripts exist, and the audited `media_renditions` bridge is active only through controlled rollout config.", "R2 public playback resolver status");
assertIncludes(architecture, "Trusted rendition metadata and playback bridge status: `_lib/mediaRenditionMetadata.ts`, `_lib/mediaPlaybackCdnEligibility.ts`, `_lib/vodQuality.ts`, `npm run proof:media-rendition-metadata`, and `npm run proof:media-playback-cdn-eligibility` model and enforce the scalable Cloudflare R2/HLS playback path.", "trusted audited CDN eligibility status");
assertIncludes(architecture, "City Lights is the canary, not a hardcoded final path; `trusted_public` can cover any eligible audited public-safe row after explicit rollout activation.", "trusted audited CDN canary boundary");
assertIncludes(architecture, "`MEDIA_PLAYBACK_CDN_ENABLED=false` by default.", "media playback CDN default disabled");
assertIncludes(architecture, "`MEDIA_PLAYBACK_CDN_KILL_SWITCH=true` by default or fail-closed equivalent.", "media playback CDN kill switch");
assertIncludes(architecture, "`MEDIA_PLAYBACK_CDN_ROLLOUT_MODE=off | canary | batch | trusted_public`.", "media playback CDN rollout modes");
assertIncludes(architecture, "`MEDIA_PLAYBACK_CDN_FALLBACK_TO_ORIGIN=true`.", "media playback CDN fallback config");
assertIncludes(architecture, "`MEDIA_PLAYBACK_CDN_DELIVERY_PROVIDER=cloudflare_r2_custom_domain`.", "media playback CDN delivery provider");
assertIncludes(architecture, "`MEDIA_PLAYBACK_CDN_MAX_BATCH_SIZE=`.", "media playback CDN batch cap");
assertIncludes(architecture, "`MEDIA_PLAYBACK_CDN_PERCENT_ROLLOUT=0`.", "media playback CDN percent rollout default");
assertIncludes(architecture, "`trusted_public` still requires the trusted row gates, backup gate, kill switch off, and signed-origin fallback.", "trusted public rollout gated");
assertIncludes(architecture, "Original/master, private, Premium-only without signed/token CDN, unscanned, moderation-blocked, wrong bucket role, wrong prefix, audit-pending/failed/quarantined, stale backup, global-disabled, and kill-switch-on cases all fall back or block.", "trusted audited CDN blocked cases");
assertIncludes(architecture, "Scale rollout planner status: `scripts/media-cdn-rollout-planner.mjs`, `npm run media-cdn:plan`, `npm run media-cdn:status`, and `npm run proof:media-cdn-rollout-planner` are proof/CLI-only.", "scale rollout planner status");
assertIncludes(architecture, "They count eligible audited public-safe HLS rows, exclude denied/private/Premium/original/pending/failed/moderation-blocked/wrong-prefix rows, require a max batch size, build exact rollback plans, redact summaries, and do not mutate the database, run backfill, enable a worker, or switch playback.", "scale rollout planner safety");
assertIncludes(architecture, "Cloudflare R2 private origin status: enabled for proof and backup use; private/original storage is not public. Playback uses only public-safe audited HLS rows in the separate public-playback bucket when rollout gates pass.", "R2 private origin proof status");
assertIncludes(architecture, "R2 CLI/API proof status: private and public-playback proof upload/readback succeeded through authorized Wrangler access. Production R2 CDN playback is limited to audited public-safe HLS rendition rows under rollout gates, with signed-origin fallback available.", "R2 CLI/API proof status");
assertIncludes(architecture, "R2 proof bucket status: private bucket `chillywood-media-proof` exists, created 2026-07-08T23:26:44.468Z.", "R2 proof bucket status");
assertIncludes(architecture, "R2 proof object status: harmless text object `playback/public/proof/hello.txt` upload/readback succeeded and is kept for proof traceability.", "R2 proof object status");
assertIncludes(architecture, "R2 public-playback proof bucket status: separate bucket `chillywood-media-public-playback-proof` exists, created 2026-07-08T23:47:12.035Z, and is distinct from the private proof bucket.", "R2 public-playback proof bucket status");
assertIncludes(architecture, "R2 public-playback proof object status: harmless text object `playback/public/proof/hello.txt`, immutable cache proof text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt`, generated demo MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4`, approved real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`, local-proof HLS tree `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`, proof-only transcode queue HLS tree `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`, and first controlled worker-proof HLS tree `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/` are public-safe proof assets only.", "R2 public-playback proof object status");
assertIncludes(architecture, "R2 public exposure status: `media.chillywoodstream.com` is connected only to `chillywood-media-public-playback-proof`; r2.dev public access remains disabled on both buckets; the private bucket has no custom domain.", "R2 public exposure status");
assertIncludes(architecture, "R2 custom-domain/cache proof status: public proof URL `https://media.chillywoodstream.com/playback/public/proof/hello.txt` returns HTTP 200 with the expected harmless text from the public-playback proof bucket; generated demo MP4 proof also returns through the same public proof hostname.", "R2 custom-domain/cache proof status");
assertIncludes(architecture, "Media bandwidth telemetry status: planned foundation only, not live.", "media delivery architecture doc");
assertIncludes(architecture, "Media delivery telemetry foundation status: source/proof-only helper and proof script exist; no backend writes, database table migrations, production telemetry writes, or production playback changes are live.", "media delivery telemetry foundation status");
assertIncludes(architecture, "Telemetry proof status: `npm run proof:media-delivery-telemetry` builds CDN demo, signed-origin fallback, blocked playback, and session start/end records, estimates bytes, redacts proof identifiers, and proves no full playback URLs are included.", "media delivery telemetry proof status");
assertIncludes(architecture, "Cache-HIT proof status: immutable harmless text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt` returns `Cache-Control: public, max-age=31536000, immutable`; after a narrow Cloudflare Cache Rule for `/playback/public/proof/cache-hit/*`, repeated fetches returned `cf-cache-status: HIT` with `Age` increasing.", "cache HIT proof status");
assertIncludes(architecture, "Safe demo media proof status: generated 2-second 320x180 H.264 MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` returns HTTP 200 for full fetch, HTTP 206 for byte range, `Content-Type: video/mp4`, immutable cache metadata, repeated `cf-cache-status: HIT` after warmup, and ffprobe/ffmpeg decode proof.", "safe demo media proof status");
assertIncludes(architecture, "The proof-only local app playback harness reports `provider=cloudflare_r2_custom_domain`, `publicPlaybackSafe=true`, `cdnEligible=true`, `productionPlaybackSwitched=false`, `playbackStarted=true`, `rangePlaybackSupported=true`, `decoded=true`, and `decodedFrameCount=48`.", "proof-only app playback proof status");
assertIncludes(architecture, "Real safe demo media proof status: Chi'llywood City Lights is identified as creator video `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`, public, clean, non-Premium, and backed by an unsigned public `download.blender.org` MP4 playback URL with no private storage object path exposed in the public row.", "real demo media identification");
assertIncludes(architecture, "Real safe demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` is staged only in the separate public-playback proof bucket, returns HTTP 200 full fetch, HTTP 206 byte-range fetch, `Content-Type: video/mp4`, `Cache-Control: public, max-age=31536000, immutable`, and repeated `cf-cache-status: HIT` after warmup.", "real demo media fetch proof");
assertIncludes(architecture, "Real safe demo playback/decode proof reports H.264 854x480 duration 52.208333 seconds, ffmpeg decode passed, and `decodedFrameCount=1253`.", "real demo media decode proof");
assertIncludes(architecture, "Real demo resolver proof uses `cdnAllowedPublicPlaybackPaths` to allow only `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`; another public-safe demo path falls back with `not_in_public_playback_allowlist`.", "real demo resolver allowlist proof");
assertIncludes(architecture, "Local HLS demo proof status: `scripts/proof-media-delivery-hls-demo.mjs` downloads the approved City Lights public-safe MP4, verifies SHA-256 short hash `b670602fa00934ca`, locally generates 360p and 480p HLS with ffmpeg, uploads only proof HLS assets to `chillywood-media-public-playback-proof`, and proves `master.m3u8`, variant playlists, segments, and ffmpeg HLS decode through `media.chillywoodstream.com`. This is a local proof worker only; production HLS uses the separate audited `media_renditions` row path and bounded CLI/operator outputs.", "local HLS demo proof status");
assertIncludes(architecture, "Local HLS demo public path: `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8` returns HTTP 200 with `Content-Type: application/vnd.apple.mpegurl` and `Cache-Control: public, max-age=300`; variant playlists `360p/index.m3u8` and `480p/index.m3u8` return HTTP 200 and reference versioned `.ts` segments.", "local HLS public path proof");
assertIncludes(architecture, "Local HLS segment cache proof: after a narrow Cloudflare Cache Rule scoped only to `media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/*.ts`, versioned HLS segments return HTTP 200, `Content-Type: video/mp2t`, `Cache-Control: public, max-age=31536000, immutable`, and `cf-cache-status: HIT` after warmup. No production egress or cost savings are claimed.", "local HLS segment cache proof");
assertIncludes(architecture, "Local HLS resolver proof: the staged resolver returns `https://media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8` only when `cdnAllowedPublicPlaybackPaths` explicitly contains that master manifest and `publicPlaybackSafe=true`; the source MP4 and segment paths fall back with `not_in_public_playback_allowlist` under the HLS proof config.", "local HLS resolver proof");
assertIncludes(architecture, "App/player HLS proof status: `npm run proof:media-delivery-hls-demo` now includes a proof-only app/player harness for `app/player/[id].tsx`. It verifies the Player route source contract maps `displayItem.video_url` into `{ uri }`, verifies `Video` receives `source={playbackSource}` with `onLoad` and `onPlaybackStatusUpdate`, and reports `playerReceivesHlsUrl=true`, `onLoadObserved=true`, `durationMillis=52208`, `progressObserved=true`, `progressMillis=2175`, `isPlaying=true`, `playbackStarted=true`, `ffmpegDecode=passed`, `productionPlaybackSwitched=false`, and `privateSignedOriginUrlExposed=false` for the allowlisted HLS master URL only.", "app/player HLS proof status");
assertIncludes(architecture, "Proof-only transcode queue foundation status: `_lib/mediaTranscodeQueue.ts` and `npm run proof:media-transcode-queue-hls` model `queued -> probing -> transcoding -> uploading -> ready` for the approved City Lights demo only; no production backend queue/service worker, database writes, trusted `video_renditions` rows, or production playback switch is live.", "proof-only transcode queue foundation status");
assertIncludes(architecture, "Proof-only transcode queue output path: `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8` returned HTTP 200 through `media.chillywoodstream.com`; 360p and 480p variant playlists returned HTTP 200; ffmpeg decoded the public HLS master URL successfully.", "proof-only transcode queue output path");
assertIncludes(architecture, "Proof-only transcode queue cache result: after a narrow Cloudflare Cache Rule scoped only to `media.chillywoodstream.com/playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/*.ts`, queue-generated `.ts` segments returned HTTP 200, `Content-Type: video/mp2t`, `Cache-Control: public, max-age=31536000, immutable`, and `cf-cache-status: HIT` after warmup. No cache savings or production egress savings are claimed.", "proof-only transcode queue cache result");
assertIncludes(architecture, "Proof-only transcode queue resolver proof: only a completed ready proof job can produce the allowlisted HLS master URL; queued and failed proof jobs cannot resolve, non-allowlisted outputs fall back with `not_in_public_playback_allowlist`, and private/original/Premium/unscanned/moderation-blocked/default creator-video paths fall back or block.", "proof-only transcode queue resolver proof");
assertIncludes(architecture, "Proof-only transcode queue telemetry proof: the queue proof builds sanitized HLS `media_delivery_events` shapes with `deliveryFormat=hls`, 360p/480p rendition labels, estimated bytes, observed `cdn_cache_status`, and `proof_mode=true`; no production telemetry writes or table migrations are live.", "proof-only transcode queue telemetry proof");
assertIncludes(architecture, "Production transcode worker runbook status: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` defines the future worker runtime, inputs, safety checks, processing flow, failure behavior, security, rollback, and activation gates. No production worker is deployed and no production queue processor is running; City Lights plus the bounded CLI auto-detect cycle now account for `media_transcode_jobs=10` and `media_renditions=15`, with active unfinished jobs and unsafe CDN rows at zero.", "production transcode worker runbook status");
assertIncludes(architecture, "Local transcode worker proof status: `npm run proof:media-transcode-worker-local` uses only the approved public-safe City Lights MP4, simulates `queued -> probing -> transcoding -> uploading -> ready`, generates local 360p/480p HLS, validates master/variants/segments and ffmpeg decode, simulates upload keys under `playback/public/proof-worker/`, builds trusted `media_renditions` rows in memory, validates resolver eligibility, builds sanitized telemetry events, proves failed-job blocking, and runs a disposable PGlite worker-policy proof. It does not connect to production DB, upload R2 objects, write production rows, deploy a worker, or switch playback.", "local transcode worker proof status");
assertIncludes(architecture, "Backup/PITR activation gate: Blocked for broad production worker writes/backfill/continuous activation.", "backup PITR worker activation gate");
assertIncludes(architecture, "`pitr_enabled=false`, `walg_enabled=true`, `backups=[]`, and `physical_backup_data={}`", "backup PITR production readback");
assertIncludes(architecture, "`pitr_7` (`$100/month`), `pitr_14` (`$200/month`), and `pitr_28` (`$400/month`)", "backup PITR paid add-on readback");
assertIncludes(architecture, "Trusted rendition metadata and playback bridge status: `_lib/mediaRenditionMetadata.ts`, `_lib/mediaPlaybackCdnEligibility.ts`, `_lib/vodQuality.ts`, `npm run proof:media-rendition-metadata`, and `npm run proof:media-playback-cdn-eligibility` model and enforce the scalable Cloudflare R2/HLS playback path.", "trusted rendition metadata foundation status");
assertIncludes(architecture, "No production `video_renditions` writes, production media row backfill, deployed backend worker, broad queue processor, private/Premium public-CDN path, or broad playback migration is live.", "trusted rendition metadata production boundary");
assertIncludes(architecture, "Trusted backend migration path status: `docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md`, migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql`, and `npm run proof:media-rendition-migration-policy` define and statically prove the server-owned `media_transcode_jobs` plus `media_renditions` path.", "trusted backend migration path status");
assertIncludes(architecture, "Current production row counts after City Lights plus the bounded auto-detect cycle are `media_transcode_jobs=10`, `media_renditions=15`, `active_unfinished_jobs=0`, and `unsafe_cdn_rows=0`.", "trusted backend migration one-job row status");
assertIncludes(architecture, "Production data/write boundary: no production media backfill, production `video_renditions` write, deployed production transcode worker, broad queue processor, private/Premium public-CDN path, or broad playback migration is live.", "trusted backend migration production boundary");
assertIncludes(architecture, "Trusted backend migration dry-run status: `npm run proof:media-rendition-migration-dry-run` passes static SQL validation and runtime apply/RLS checks in an in-memory disposable local Postgres runtime via `@electric-sql/pglite`.", "trusted backend migration dry-run status");
assertIncludes(architecture, "proves anon/authenticated trusted writes are denied, proves service-role/worker writes pass, proves resolver-safe anon select returns one clean public-ready row", "trusted backend migration dry-run runtime proof");
assertIncludes(architecture, "Production runtime policy proof: a rollback-only production transaction denied anon/authenticated trusted writes, allowed service-role/worker proof writes, verified resolver-safe select for one clean public-ready proof row, verified unsafe/original/Premium/private/non-public-prefix rows failed eligibility, and rolled back.", "trusted backend migration production runtime proof");
assertIncludes(architecture, "Trusted City Lights HLS fixture and production-row status: the proof fixture models 360p and 480p HLS rows for creator video `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1` using master manifest `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8`; the production one-job worker rows point at `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/master.m3u8`.", "trusted City Lights HLS fixture status");
assertIncludes(architecture, "The resolver proof returns `media.chillywoodstream.com` only when the row is ready, public, clean or approved, moderation-allowed, `bucket_role=public_playback`, `storage_provider=cloudflare_r2`, `delivery_provider=cloudflare_r2_custom_domain`, `is_public_playback_safe=true`, `is_original=false`, under `playback/public/`, and permitted by rollout config.", "trusted rendition resolver eligibility status");
assertIncludes(architecture, "Trusted rendition block proof status: `npm run proof:media-rendition-metadata` proves not-ready rows, original/master rows, Premium rows, private rows, unsafe scan states, moderation-blocked states, wrong bucket roles, non-`playback/public/` prefixes, non-allowlisted public-safe rows, and default creator-video source paths all block or fall back without a public CDN URL.", "trusted rendition block proof status");
assertIncludes(architecture, "5 GB resumable upload status: not live; current upload is single signed PUT.", "media delivery architecture doc");
assertIncludes(architecture, "Near-term chosen path: Cloudflare R2 private origin plus Cloudflare custom domain/cache", "Cloudflare R2 chosen path");
assertIncludes(architecture, "Resolver staging from commit `22837a5d20c1be66ffeb5559b96f7048f6a094eb` keeps production playback unchanged.", "resolver staging checkpoint");
assertIncludes(architecture, "Cache-HIT proof succeeded for immutable harmless text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt` under a narrow cache rule.", "cache HIT checkpoint");
assertIncludes(architecture, "Safe generated demo MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` is staged in the separate public-playback proof bucket and plays through `media.chillywoodstream.com` in the proof-only local app playback harness.", "safe demo media checkpoint");
assertIncludes(architecture, "Real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` is proof-staged and proved through `media.chillywoodstream.com` only under the explicit real-demo allowlist.", "real demo media checkpoint");
assertIncludes(architecture, "Local HLS proof worker `scripts/proof-media-delivery-hls-demo.mjs` generated 360p/480p HLS from the approved City Lights public-safe MP4, uploaded proof-only HLS assets under `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`, proved master/variant/segment delivery through `media.chillywoodstream.com`, proved HLS segment cache HIT, and proved resolver eligibility only for the allowlisted HLS master manifest.", "local HLS demo checkpoint");
assertIncludes(architecture, "Proof-only app/player HLS harness proved the allowlisted HLS master URL can be received by the Player source contract, load with duration, report progress, and start playback evidence without switching production playback.", "app/player HLS checkpoint");
assertIncludes(architecture, "Proof-only transcode queue foundation proved the approved City Lights demo can move through local job states, generate 360p/480p HLS, upload proof outputs under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`, decode through `media.chillywoodstream.com`, resolve only the completed allowlisted HLS master, and prove queue-path segment cache HIT under a narrow proof-only cache rule.", "proof-only transcode queue checkpoint");
assertIncludes(architecture, "Production transcode worker runbook and local proof harness exist: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` and `npm run proof:media-transcode-worker-local` model a future worker locally with safe City Lights demo input only, local HLS generation, simulated public upload keys, in-memory trusted rendition rows, sanitized telemetry, failed-job proof, and disposable PGlite write-policy proof. No production worker is deployed; the only production rows are the owner-approved one-job City Lights proof row set.", "production transcode worker runbook checkpoint");
assertIncludes(architecture, "Trusted rendition metadata source/proof foundation models future Cloudflare R2 HLS rows and proves only the City Lights ready public-safe HLS fixture can bridge into the existing resolver allowlist.", "trusted rendition metadata checkpoint");
assertIncludes(architecture, "Trusted backend migration path is designed, proofed, and applied to production for server-owned `media_transcode_jobs` and `media_renditions`; clients cannot write trusted readiness, public-safe, path, worker version, or source hash fields.", "trusted backend migration checkpoint");
assertIncludes(architecture, "Trusted backend migration production readback, rollback-only proof, and first one-job proof are complete: tables/indexes/RLS/policies/grants exist, client trusted writes are denied, service-role/worker proof writes work inside rollback, resolver-safe select sees only clean public-ready proof rows, and current production row counts are one job plus two renditions for the allowlisted City Lights proof only.", "trusted backend migration production proof checkpoint");
assertIncludes(architecture, "Media bandwidth telemetry backend writes, table migrations, CDN log ingestion, and provider reconciliation remain planned.", "telemetry planned checkpoint");
assertIncludes(architecture, "Media delivery telemetry source/proof foundation exists for future `media_delivery_events` and `media_playback_sessions`; backend writes and table migrations remain planned.", "telemetry foundation checkpoint");
assertIncludes(architecture, "Production HLS/transcoding implementation remains planned.", "HLS planned checkpoint");
assertIncludes(architecture, "Production transcode worker deployment remains planned and blocked for broad/continuous use by the Backup/PITR gate until PITR or an owner-approved restore path is verified; no broad worker writes/backfill while the gate is Blocked or Partial.", "production worker deployment planned checkpoint");
assertIncludes(architecture, "Production trusted `video_renditions` or replacement rendition-metadata data writes remain planned; the current trusted rendition metadata foundation and applied schema do not create a worker, backfill, resolver bridge, or playback migration.", "trusted rendition production writes planned checkpoint");
assertIncludes(architecture, "Cloudflare R2 is the target origin because the owner already has the domain on Cloudflare.", "Cloudflare R2 domain rationale");
assertIncludes(architecture, "Keep the R2 bucket private by default.", "R2 private bucket policy");
assertIncludes(architecture, "The planned custom hostname is `media.chillywoodstream.com`.", "Cloudflare custom hostname plan");
assertIncludes(architecture, "The private proof bucket is `chillywood-media-proof`.", "private proof bucket identity");
assertIncludes(architecture, "The separate public-playback proof bucket is `chillywood-media-public-playback-proof`.", "public-playback proof bucket identity");
assertIncludes(architecture, "The private proof bucket and public-playback proof bucket must remain distinct.", "bucket separation policy");
assertIncludes(architecture, "Allowed public proof prefix: `playback/public/`.", "allowed public proof prefix");
assertIncludes(architecture, "Private blocked prefixes: `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, and `unscanned/`.", "private blocked prefixes");
assertIncludes(architecture, "Original/master files are private processing sources.", "media delivery architecture doc");
assertIncludes(architecture, "Do not enable public access for originals/master files.", "original/master privacy");
assertIncludes(architecture, "Safe first CDN target is public/demo/ready playback assets only under the allowed public prefix.", "safe public cache target");
assertIncludes(architecture, "Paid/Premium media needs token/signed CDN access before public CDN delivery.", "paid/Premium CDN signing requirement");
assertIncludes(architecture, "Do not connect a Cloudflare R2 custom domain directly to a mixed bucket containing private originals, unscanned uploads, or paid/Premium-only media unless Cloudflare token/WAF/Worker access control is already enforcing the private paths before R2 reads.", "mixed bucket custom-domain guardrail");
assertIncludes(architecture, "The safest first custom-domain target is a separate proof or public-playback surface that contains only approved `playback/public/` assets.", "safe custom-domain target");
assertIncludes(architecture, "Cache headers: HLS segments and thumbnails may use long TTL plus immutable naming; HLS manifests use short TTL; non-versioned proof text uses short or default TTL; versioned proof text and generated proof MP4 may use long immutable TTL; private/original paths use no cache.", "cache TTL policy");
assertIncludes(architecture, "Proof object target: `playback/public/proof/hello.txt`.", "R2 proof object path");
assertIncludes(architecture, "Private-origin proof used authorized remote Wrangler access to upload the harmless text proof object and read it back byte-for-byte.", "R2 private proof readback");
assertIncludes(architecture, "No production media, private/original media, unscanned upload, or Premium creator media was uploaded.", "R2 proof media boundary");
assertIncludes(architecture, "No production playback config was switched.", "production playback boundary");
assertIncludes(architecture, "Cloudflare R2 custom domains are a public bucket exposure path, not a bucket-native prefix-limited publish switch.", "R2 custom-domain prefix decision");
assertIncludes(architecture, "The current proof did not identify a safe R2 custom-domain configuration that exposes only `playback/public/` while keeping private prefixes in the same bucket unreachable by configuration alone.", "R2 prefix-limited exposure decision");
assertIncludes(architecture, "A direct custom domain on a mixed bucket must be treated as unsafe for Chi'llywood media unless a Worker, WAF token rule, Cloudflare Access policy, or equivalent path/token control is already implemented and proved before bucket reads.", "mixed bucket public exposure guardrail");
assertIncludes(architecture, "[R2 and Cloudflare cache](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)", "Cloudflare cache docs basis");
assertIncludes(architecture, "[Cache Rules API](https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/)", "Cloudflare cache rules API docs basis");
assertIncludes(architecture, "Recommended safest next architecture: create a separate public-playback proof bucket or public-playback surface containing only approved `playback/public/` assets, then connect `media.chillywoodstream.com` only to that safe surface after explicit owner approval.", "safe public-playback proof architecture");
assertIncludes(architecture, "Alternative safe architecture: keep the R2 bucket private and put `media.chillywoodstream.com` on a Worker route that allowlists `playback/public/`, blocks private prefixes, applies token checks for paid/Premium paths, sets cache headers by asset class, and reads R2 through a private binding.", "Worker gateway architecture");
assertIncludes(architecture, "Do not connect `media.chillywoodstream.com` directly to `chillywood-media-proof` while that bucket is a mixed private/proof bucket.", "proof bucket custom-domain prohibition");
assertIncludes(architecture, "`chillywood-media-public-playback-proof` is a separate R2 bucket for harmless public-safe proof assets only.", "public-playback proof bucket purpose");
assertIncludes(architecture, "The bucket currently contains only public-safe proof assets: text proof object `playback/public/proof/hello.txt`, cache-HIT text proof object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt`, generated demo proof MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4`, approved real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`, local-proof HLS assets under `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`, proof-only transcode queue HLS assets under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`, and first one-job worker-proof HLS assets under `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`.", "public-playback proof bucket contents");
assertIncludes(architecture, "The bucket must not contain `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, `unscanned/`, unapproved real creator media, original/master media, unscanned uploads, private media, or Premium-only media.", "public-playback proof bucket forbidden contents");
assertIncludes(architecture, "The bucket is publicly reachable only through `media.chillywoodstream.com` for harmless public-safe proof objects; r2.dev public access is disabled.", "public-playback proof bucket public checkpoint");
assertIncludes(architecture, "Explicit owner approval was limited to connecting `media.chillywoodstream.com` to this public-playback proof bucket. No approval was given for production playback, private media, Premium media, or the private proof bucket.", "public-playback proof bucket approval checkpoint");
assertIncludes(architecture, "`media.chillywoodstream.com` points only at this separate public-playback proof bucket at this checkpoint.", "public-playback custom-domain connected boundary");
assertIncludes(architecture, "Read-only custom-domain/cache audit: bucket list shows `chillywood-media-proof`, r2.dev status is disabled, custom-domain list is empty, and the proof object still reads back as harmless text through authorized Wrangler access.", "read-only custom-domain/cache audit");
assertIncludes(architecture, "Custom-domain proof connected `media.chillywoodstream.com` only to `chillywood-media-public-playback-proof`.", "public-playback custom-domain proof");
assertIncludes(architecture, "Public proof fetch returned HTTP 200 and exact body `chillywood r2 public playback proof 2026-07-08T23:47:15Z`.", "public proof fetch");
assertIncludes(architecture, "Cache-HIT proof used immutable harmless text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt` with body `chillywood r2 cache proof 20260709T003701Z 3c152e0012db`.", "cache HIT object proof");
assertIncludes(architecture, "A narrow Cloudflare Cache Rule was applied only to `media.chillywoodstream.com/playback/public/proof/cache-hit/*`; repeated fetches returned HTTP 200, exact text match, `Cache-Control: public, max-age=31536000, immutable`, `Content-Type: text/plain`, `cf-cache-status: HIT`, and increasing `Age` after warmup. No egress or cost savings are claimed.", "cache HIT proof fetch");
assertIncludes(architecture, "Safe demo media proof uploaded generated MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` to the public-playback proof bucket only.", "safe demo media upload proof");
assertIncludes(architecture, "Safe demo media public fetch returned HTTP 200, `Content-Type: video/mp4`, `Cache-Control: public, max-age=31536000, immutable`, `Accept-Ranges: bytes`, and byte-range fetch returned HTTP 206; repeated warm fetches returned `cf-cache-status: HIT`. ffprobe identified H.264 320x180 duration 2 seconds, ffmpeg decode passed, and frame-count proof decoded 48 frames.", "safe demo media playback proof");
assertIncludes(architecture, "Proof-only app playback through `media.chillywoodstream.com` is proved only for the generated safe public demo MP4. No normal Home playback, creator-video playback, Watch-Party playback, or production playback path was switched.", "proof-only app playback boundary");
assertIncludes(architecture, "Real safe demo media proof uploaded approved public-safe Chi'llywood City Lights MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` to the public-playback proof bucket only.", "real demo media upload proof");
assertIncludes(architecture, "Real safe demo media public fetch returned HTTP 200, `Content-Type: video/mp4`, `Cache-Control: public, max-age=31536000, immutable`, `Accept-Ranges: bytes`, byte-range fetch returned HTTP 206, and repeated warm fetches returned `cf-cache-status: HIT`. ffprobe identified H.264 854x480 duration 52.208333 seconds, ffmpeg decode passed, and frame-count proof decoded 1253 frames.", "real demo media playback proof");
assertIncludes(architecture, "Real demo proof uses a resolver allowlist for `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` only. It does not enable CDN URLs for all creator videos.", "real demo resolver allowlist boundary");
assertIncludes(architecture, "Local HLS proof worker generated 360p and 480p HLS from the approved City Lights public-safe MP4 and uploaded 24 proof HLS objects under `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/` to the public-playback proof bucket only.", "local HLS media upload proof");
assertIncludes(architecture, "Local HLS public fetch returned HTTP 200 for `master.m3u8`, `360p/index.m3u8`, and `480p/index.m3u8`; ffmpeg decoded the public HLS master URL successfully.", "local HLS public fetch proof");
assertIncludes(architecture, "A narrow Cloudflare Cache Rule was applied only to versioned HLS proof segments under `media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/*.ts`; segment fetches returned HTTP 200, `Content-Type: video/mp2t`, `Cache-Control: public, max-age=31536000, immutable`, and `cf-cache-status: HIT` after warmup. No production egress or cost savings are claimed.", "local HLS segment cache proof fetch");
assertIncludes(architecture, "HLS resolver proof uses a resolver allowlist for `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8` only. The source MP4 and segment URLs are not independently resolver-returned under the HLS proof config and fall back with `not_in_public_playback_allowlist`.", "local HLS resolver allowlist boundary");
assertIncludes(architecture, "App/player HLS proof uses a proof-only local harness for `app/player/[id].tsx`: the allowlisted HLS master is passed through the Player source contract as `{ uri }`, loaded with duration `52208ms`, progressed to `2175ms`, reported `isPlaying=true`, and produced playback-start evidence without private signed origin URLs.", "app/player HLS proof boundary");
assertIncludes(architecture, "Proof-only transcode queue proof generated 360p and 480p HLS from the approved City Lights public-safe MP4 and uploaded 24 proof HLS objects under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/` to the public-playback proof bucket only.", "proof-only transcode queue upload proof");
assertIncludes(architecture, "Proof-only transcode queue public fetch returned HTTP 200 for `master.m3u8`, `360p/index.m3u8`, and `480p/index.m3u8`; queue-generated `.ts` segments returned HTTP 200 with `Content-Type: video/mp2t`, immutable cache metadata, and `cf-cache-status: HIT` after the narrow proof-transcode segment cache rule; ffmpeg decoded the public queue HLS master URL successfully.", "proof-only transcode queue public fetch proof");
assertIncludes(architecture, "Proof-only transcode queue resolver proof uses a resolver allowlist for `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8` only. The completed ready proof job can resolve that master; queued and failed proof jobs cannot resolve; non-allowlisted output paths fall back with `not_in_public_playback_allowlist`.", "proof-only transcode queue resolver boundary");
assertIncludes(architecture, "Keep cache rules narrow. The only applied cache rules in this lane are the cache-HIT proof prefix `media.chillywoodstream.com/playback/public/proof/cache-hit/*`, the City Lights HLS proof segment path `media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/*.ts`, the proof-transcode queue HLS segment path `media.chillywoodstream.com/playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/*.ts`, and the first one-job worker-proof segment path `media.chillywoodstream.com/playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/*.ts`; do not add broad Cache Everything behavior.", "narrow cache rule inventory");
assertIncludes(architecture, "Forbidden-prefix probes under `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, and `unscanned/` returned HTTP 404 through the public proof hostname.", "forbidden prefix public proof");
assertIncludes(architecture, "Public-playback proof audit: bucket list shows `chillywood-media-public-playback-proof`, r2.dev status is disabled, custom-domain list contains `media.chillywoodstream.com`, and the proof object still reads back as harmless text through authorized Wrangler access.", "public-playback proof audit");
assertIncludes(architecture, "Supabase/Edge resolver remains the access-control and playback decision layer.", "Supabase/Edge resolver boundary");
assertIncludes(architecture, "The app must ask the backend resolver for playback; the app must not hard-code R2 or Cloudflare custom-domain decisions.", "app resolver contract");
assertIncludes(architecture, "`_lib/mediaDelivery.ts` stages the Cloudflare R2 custom-domain resolver helper for future safe public playback assets.", "staged public playback resolver");
assertIncludes(architecture, "`resolveMediaPlaybackDelivery(...)` returns `media.chillywoodstream.com` only when the delivery provider is `cloudflare_r2_custom_domain`, `MEDIA_CDN_BASE_URL` is configured, `MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true`, the asset path starts with `playback/public/`, and the caller explicitly marks the asset `publicPlaybackSafe`.", "staged public playback resolver contract");
assertIncludes(architecture, "Proof-only real demo mode also passes `cdnAllowedPublicPlaybackPaths` so only the approved City Lights public demo path can use the custom-domain URL in that proof.", "staged public playback resolver allowlist contract");
assertIncludes(architecture, "The helper blocks public CDN URLs for original/master/source paths, `original` quality, unscanned assets, moderation-blocked assets, private/owner assets, and Premium-only assets until signed/token CDN access is implemented and proved.", "staged public playback resolver blocks");
assertIncludes(architecture, "Creator-video playback now has a guarded trusted `media_renditions` bridge. Default config still uses signed-origin fallback, and CDN/HLS requires explicit rollout config plus row-level trust gates.", "staged public playback resolver fallback");
assertIncludes(architecture, "`scripts/proof-media-delivery-public-demo.mjs` proves the generated demo MP4 resolves through the helper, fetches over `media.chillywoodstream.com`, supports byte-range playback, decodes with ffprobe/ffmpeg and frame-count proof, reports proof-only app playback metadata, has no signed-origin query string, and keeps private/original/Premium/unscanned/moderation-blocked/default creator-video paths on fallback or block.", "public demo proof script contract");
assertIncludes(architecture, "`scripts/proof-media-delivery-real-demo.mjs` proves the approved City Lights demo resolves through the explicit allowlist, fetches over `media.chillywoodstream.com`, supports byte-range playback, decodes with ffprobe/ffmpeg and frame-count proof, keeps a non-allowlisted public-safe demo path on fallback with `not_in_public_playback_allowlist`, and keeps private/original/Premium/unscanned/moderation-blocked/default creator-video paths on fallback or block.", "real demo proof script contract");
assertIncludes(architecture, "`scripts/proof-media-delivery-hls-demo.mjs` is a local proof worker that downloads the approved City Lights public-safe MP4, generates 360p/480p HLS, uploads proof-only HLS assets to the public-playback proof bucket, proves public master/variant/segment fetches plus segment cache HIT and ffmpeg decode, proves the proof-only app/player HLS harness receives the allowlisted master, load/progress/playback evidence is present, and proves the resolver returns only the allowlisted HLS master manifest while source MP4 and segment paths fall back.", "HLS demo proof script contract");
assertIncludes(architecture, "Production playback remains unchanged until a later approved lane adds trusted public-safe asset metadata, cache-HIT proof, telemetry, and signed/token CDN access for non-public assets.", "staged public playback resolver production boundary");
assertIncludes(architecture, "Creator-video Watch-Party sources must use the same creator-video playback resolver path as standalone Player.", "media delivery architecture doc");
assertIncludes(architecture, "HLS/transcoding is a future milestone unless implemented and proved.", "HLS/transcoding status");
assertIncludes(architecture, "Current proof scope: local proof workers and a proof-only queue model have generated and proved 360p/480p HLS for the approved public-safe City Lights demo only. This does not create a production transcode queue, does not insert trusted `video_renditions` rows, does not migrate creator-video playback, and does not make HLS/transcoding live for production.", "HLS demo proof scope");
assertIncludes(architecture, "App/player HLS playback proof is complete in a proof-only local harness for the allowlisted City Lights HLS master URL. Normal Player creator-video playback can use the trusted-row bridge only when rollout config enables it and all gates pass; fallback remains signed origin.", "app/player HLS proof scope");
assertIncludes(architecture, "Production HLS live claim requires future proof that a backend worker ran from a trusted source, rendition files exist, trusted metadata rows exist, the manifest plays, the resolver returns the HLS URL for approved playback, cache HIT is proved for segments, and signed-origin fallback still works.", "production HLS live claim guardrail");
assertIncludes(architecture, "Bandwidth/minutes-watched telemetry remains required before broad rollout.", "egress telemetry requirement");
assertIncludes(architecture, "MEDIA_ORIGIN_PROVIDER=cloudflare_r2", "config contract");
assertIncludes(architecture, "MEDIA_DELIVERY_PROVIDER=origin_signed_direct | cloudflare_r2_custom_domain", "config contract");
assertIncludes(architecture, "MEDIA_CDN_BASE_URL=https://media.chillywoodstream.com", "config contract");
assertIncludes(architecture, "MEDIA_CDN_SIGNING_MODE=off | token", "config contract");
assertIncludes(architecture, "MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX=playback/public/", "config contract");
assertIncludes(architecture, "MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true", "config contract");
assertIncludes(architecture, "R2_BUCKET", "config contract");
assertIncludes(architecture, "R2_ACCOUNT_ID", "config contract");
assertIncludes(architecture, "R2_S3_ENDPOINT", "config contract");
assertIncludes(architecture, "If Cloudflare R2 config is absent, current signed origin behavior remains fallback.", "R2 absent fallback");
assertIncludes(architecture, "MEDIA_CDN_SIGNING_MODE=off` is only acceptable for public/safe playback assets.", "public cache signing mode");
assertIncludes(architecture, "Private/Premium CDN delivery requires token/signed access first.", "private/Premium CDN signing mode");
assertIncludes(architecture, "Optional future managed-video alternative: Cloudflare Stream is optional later and is not required for this R2/custom-domain path.", "Cloudflare Stream classification");
assertIncludes(architecture, "Current/legacy fallback: Hetzner Object Storage or any already-configured S3-compatible origin", "Hetzner fallback classification");
assertIncludes(architecture, "Optional future CDN alternative: Bunny CDN remains an alternative only", "Bunny classification");

const transcodeLiveClaims = claimSentences(
  docsCorpus,
  /\b(transcod(?:e|er|ing)|HLS\/ABR|ffmpeg|derived renditions)\b/i,
  /\b(live|active|deployed|proved|closed|production-ready)\b/i,
).filter((sentence) => !/\b(local proof|proof-only|demo proof|public-safe City Lights|approved City Lights|bounded CLI auto|first full autonomous|production HLS\/transcoding is active only through trusted audited|production HLS\/transcoding remains not live|production remains not live)\b/i.test(sentence));
if (transcodeLiveClaims.length && !hasTranscodeWorker) {
  fail(`docs claim transcoding is live without worker proof: ${transcodeLiveClaims.join(" | ")}`);
}

const cdnLiveClaims = claimSentences(
  deliveryClaimsCorpus,
  /\b(CDN|edge cache|signed CDN|CloudFront|Bunny|Cloudflare CDN|Cloudflare custom domain|custom-domain\/cache|media\.chillywoodstream\.com)\b/i,
  /\b(live|active|deployed|proved|closed|production-ready|enabled|connected|serving|working)\b/i,
).filter((sentence) => !/\b(proof|harmless|public-playback proof|public proof|controlled|audited|trusted|eligible|City Lights|installed|fallback remains|fallback is|connected only)\b/i.test(sentence));
if (cdnLiveClaims.length && !hasCdnPlaybackPath) {
  fail(`docs claim CDN playback is live without CDN playback path: ${cdnLiveClaims.join(" | ")}`);
}

const r2CdnLiveClaims = claimSentences(
  mediaStatusCorpus,
  /\b(R2 CDN|R2 custom domain|Cloudflare custom domain|custom-domain\/cache|media\.chillywoodstream\.com)\b/i,
  /\b(live|active|deployed|proved|closed|production-ready|enabled|connected|serving|working)\b/i,
).filter((sentence) => !/\b(proof|harmless|public-playback proof|public proof|controlled|audited|trusted|eligible|City Lights|installed|connected only|fallback remains)\b/i.test(sentence));
if (r2CdnLiveClaims.length) {
  fail(`R2 CDN/custom-domain delivery must not be claimed live before proof: ${r2CdnLiveClaims.join(" | ")}`);
}

const streamRequiredClaims = claimSentences(
  docsCorpus,
  /\bCloudflare Stream\b/i,
  /\b(required|near-term|chosen|target|must use|preferred)\b/i,
);
if (streamRequiredClaims.length) {
  fail(`Cloudflare Stream must remain optional future managed-video only: ${streamRequiredClaims.join(" | ")}`);
}

const hetznerChosenClaims = claimSentences(
  docsCorpus,
  /\bHetzner\b/i,
  /\b(near-term|chosen|preferred|target path|recommended path|future path)\b/i,
);
if (hetznerChosenClaims.length) {
  fail(`Hetzner must be current/legacy fallback, not chosen near-term path: ${hetznerChosenClaims.join(" | ")}`);
}

const bunnyChosenClaims = claimSentences(
  docsCorpus,
  /\bBunny\b/i,
  /\b(near-term|chosen|preferred|target path|recommended path|future path)\b/i,
);
if (bunnyChosenClaims.length) {
  fail(`Bunny must be optional future alternative, not chosen near-term path: ${bunnyChosenClaims.join(" | ")}`);
}

const publicR2OriginalClaims = claimSentences(
  mediaStatusCorpus,
  /\b(R2|original|master|source)\b/i,
  /\b(publicly exposed|public access|public bucket|public CDN|public cache|public path)\b/i,
).filter((sentence) => !/\b(proof|harmless|public-playback proof|public proof|public-safe|Local HLS demo public path)\b/i.test(sentence));
if (publicR2OriginalClaims.length) {
  fail(`R2 buckets/private originals must not be described as publicly exposed: ${publicR2OriginalClaims.join(" | ")}`);
}

for (const sentence of splitSentences(docsCorpus)) {
  if (/\b(Paid|Premium)\b/i.test(sentence) && /\b(public CDN|public cache|custom-domain\/cache|Cloudflare cache)\b/i.test(sentence)) {
    if (/\b(cannot|not|blocked|blocks|fall back|fallback|must not|do not)\b/i.test(sentence)) continue;
    if (!/\b(token|signed|requires|required|before|first)\b/i.test(sentence)) {
      fail(`Paid/Premium media cannot use public CDN without token/signed access: ${sentence}`);
    }
  }
}

for (const sentence of splitSentences(mediaStatusCorpus)) {
  if (/\b(whole bucket|mixed bucket|same bucket|private prefixes inside it|private prefixes in the same bucket)\b/i.test(sentence)
    && /\b(public|custom domain|media\.chillywoodstream\.com|safe|safely)\b/i.test(sentence)
    && !/\b(unsafe|do not|must not|not|unless|Worker|WAF|Access|token|blocked|separate public-playback)\b/i.test(sentence)) {
    fail(`docs imply a mixed/whole R2 bucket can be safely public without proved isolation: ${sentence}`);
  }

  if (/\b(prefix-limited|prefix limited|prefix-scoped|prefix scoped)\b/i.test(sentence)
    && /\b(public exposure|public access|custom domain|R2 custom-domain)\b/i.test(sentence)
    && /\b(safe|supported|works|available|proved|configured)\b/i.test(sentence)
    && !/\b(not|did not|no|without|unless|Worker|WAF|Access|gateway|separate bucket)\b/i.test(sentence)) {
    fail(`docs claim prefix-limited R2 custom-domain public exposure is safe without gateway proof: ${sentence}`);
  }

  if (/\b(production playback|app playback|creator-video playback|Player playback)\b/i.test(sentence)
    && /\b(R2|Cloudflare|custom domain|media\.chillywoodstream\.com)\b/i.test(sentence)
    && /\b(switched|uses|serves|live|active|deployed|production-ready)\b/i.test(sentence)
    && !/\b(not|no|unchanged|until|do not|must not|fallback|planned|future|without|controlled|audited|trusted|eligible|proof|City Lights|gates)\b/i.test(sentence)) {
    fail(`docs claim production playback switched to R2 before resolver proof: ${sentence}`);
  }

  if (/\b(chillywood-media-public-playback-proof|public-playback proof bucket|public playback bucket)\b/i.test(sentence)
    && /\b(contains|stores|includes|uploads?|uploaded)\b/i.test(sentence)
    && /\b(originals\/|uploads\/|private\/|premium\/|processing\/|moderation-blocked\/|unscanned\/|original\/master|private media|Premium-only|creator media)\b/i.test(sentence)
    && !/\b(must not|does not|no|not|forbidden|blocked)\b/i.test(sentence)) {
    fail(`public-playback proof bucket must not contain private/original/Premium paths: ${sentence}`);
  }
}

const scaledMediaClaims = claimSentences(
  deliveryClaimsCorpus,
  /\b(scaled media delivery|scalable media delivery|low-egress video|media delivery scale)\b/i,
  /\b(live|active|proved|closed|production-ready)\b/i,
);
if (scaledMediaClaims.length && !hasPlaybackTelemetry) {
  fail(`docs claim real scaled media delivery without playback telemetry: ${scaledMediaClaims.join(" | ")}`);
}

const telemetryLiveClaims = claimSentences(
  deliveryClaimsCorpus,
  /\b(media_playback_sessions|media_delivery_events|telemetry|media bandwidth)\b/i,
  /\b(live|active|implemented|proved|closed|production-ready)\b/i,
).filter((sentence) => !/\b(after|until|before|planned|future|required|requires)\b/i.test(sentence));
if (telemetryLiveClaims.length && !hasPlaybackTelemetry) {
  fail(`docs claim media telemetry is live without implementation proof: ${telemetryLiveClaims.join(" | ")}`);
}

const productionMediaCdnClaims = claimSentences(
  mediaStatusCorpus,
  /\b(media\.chillywoodstream\.com|Cloudflare custom domain|public-playback proof bucket)\b/i,
  /\b(production media|production creator|existing creator-video|creator videos?)\b.*\b(serves|serving|live|active|deployed|switched|migrated)\b|\b(serves|serving|live|active|deployed|switched|migrated)\b.*\b(production media|production creator|existing creator-video|creator videos?)\b/i,
).filter((sentence) => !/\b(controlled|audited|trusted|eligible|City Lights|canary|installed proof|fallback|no broad|not broad|blocked)\b/i.test(sentence));
if (productionMediaCdnClaims.length) {
  fail(`media.chillywoodstream.com must not be described as serving production media before approved migration proof: ${productionMediaCdnClaims.join(" | ")}`);
}

const egressProtectionClaims = claimSentences(
  deliveryClaimsCorpus,
  /\b(egress|cost protection|low-egress|broad rollout)\b/i,
  /\b(live|active|proved|closed|production-ready|protected|ready)\b/i,
);
if (egressProtectionClaims.length && !/Bandwidth\/minutes-watched telemetry remains required before broad rollout\./.test(architecture)) {
  fail(`egress/cost protection cannot be claimed without telemetry plan: ${egressProtectionClaims.join(" | ")}`);
}

const cacheSavingsClaims = claimSentences(
  deliveryClaimsCorpus,
  /\b(cache savings|egress savings|cost savings|reduced egress|reduced cost|saves egress|saves cost)\b/i,
  /\b(live|active|proved|closed|production-ready|achieved|reduced|saving|saves)\b/i,
);
if (cacheSavingsClaims.length && !hasPlaybackTelemetry) {
  fail(`cache/egress savings cannot be claimed without telemetry proof: ${cacheSavingsClaims.join(" | ")}`);
}

const resumableClaims = claimSentences(
  docsCorpus,
  /\b(resumable|multipart|tus|direct-upload|direct upload|5 GB)\b/i,
  /\b(live|active|implemented|proved|closed|production-ready)\b/i,
);
if (resumableClaims.length && !hasResumableUpload) {
  fail(`docs claim resumable 5 GB uploads without resumable implementation: ${resumableClaims.join(" | ")}`);
}

const originalPlaybackClaims = claimSentences(
  docsCorpus,
  /\b(original|master)\b/i,
  /\b(normal playback|regular playback|public playback rendition|free rendition|premium rendition)\b/i,
);
if (originalPlaybackClaims.length) {
  fail(`docs describe original/master as normal playback: ${originalPlaybackClaims.join(" | ")}`);
}

const freeHdClaims = claimSentences(
  docsCorpus,
  /\bfree\b/i,
  /\b(HD|720p|1080p)\b.*\b(can|may|receive|get|allowed|available)\b|\b(can|may|receive|get|allowed|available)\b.*\b(HD|720p|1080p)\b/i,
);
if (freeHdClaims.length) {
  fail(`docs imply free HD access without resolver entitlement: ${freeHdClaims.join(" | ")}`);
}

assertNotMatches(docsCorpus, /\bFacebook-scale\b/i, "media architecture docs");
assertNotMatches(docsCorpus, /\bprivate backbone\b/i, "media architecture docs");
assertNotMatches(docsCorpus, /\bpeering\b/i, "media architecture docs");

const secretScanCorpus = [
  architecture,
  read("scripts/guard-media-delivery-architecture.mjs"),
  mediaDeliveryResolverProof,
  mediaDeliveryPublicDemoProof,
  mediaDeliveryRealDemoProof,
  mediaDeliveryHlsDemoProof,
  mediaDeliveryTelemetryProof,
  mediaTranscodeQueueProof,
  mediaRenditionMetadataProof,
  mediaRenditionMigrationPolicyProof,
  mediaRenditionMigrationDryRunProof,
  mediaMigrationPlan,
  trustedRenditionMigration,
  packageJson,
  sourceCorpus,
].join("\n");
[
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bASIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`),
  /\b(api[_-]?key|secret|token|password|service[_-]?role|access[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_./+=-]{20,}['"]/i,
  /\bR2_ACCOUNT_ID\s*=\s*[A-Za-z0-9_-]+/,
  /\bR2_BUCKET\s*=\s*[A-Za-z0-9_.-]+/,
  /\bR2_S3_ENDPOINT\s*=\s*https?:\/\//i,
].forEach((pattern) => assertNotMatches(secretScanCorpus, pattern, "changed media delivery docs/source"));

for (const match of secretScanCorpus.matchAll(/\bMEDIA_CDN_BASE_URL\s*=\s*(https?:\/\/[^\s`'"]+)/gi)) {
  const configuredUrl = match[1];
  if (configuredUrl !== "https://media.chillywoodstream.com") {
    fail(`changed media delivery docs/source must not include real MEDIA_CDN_BASE_URL values other than the approved public custom-domain contract: ${configuredUrl}`);
  }
}

assertIncludes(performancePolicy, "VOD_FREE_MAX_HEIGHT_V1 = 480", "free VOD policy");
assertIncludes(performancePolicy, "VOD_PREMIUM_MAX_HEIGHT_V1 = 1080", "Premium VOD policy");
assertIncludes(vodQuality, "VOD_FREE_PLAYBACK_QUALITY_LABELS = [\"360p\", \"480p\"]", "VOD free ladder");
assertIncludes(vodQuality, "VOD_PREMIUM_PLAYBACK_QUALITY_LABELS = [\"720p\", \"1080p\"]", "VOD Premium ladder");
assertIncludes(mediaDelivery, "classifyMediaDeliveryAsset", "media delivery resolver helper");
assertIncludes(mediaDelivery, "canUseCloudflareR2PublicPlayback", "media delivery resolver helper");
assertIncludes(mediaDelivery, "resolveCloudflareR2PublicPlaybackUrl", "media delivery resolver helper");
assertIncludes(mediaDelivery, "resolveMediaPlaybackDelivery", "media delivery resolver helper");
assertIncludes(mediaDelivery, "MEDIA_DELIVERY_PROVIDER_CLOUDFLARE_R2_CUSTOM_DOMAIN", "media delivery resolver helper");
assertIncludes(mediaDelivery, "MEDIA_DELIVERY_PROVIDER_ORIGIN_SIGNED_DIRECT", "media delivery resolver helper");
assertIncludes(mediaDelivery, "MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX_DEFAULT = \"playback/public/\"", "media delivery resolver helper");
assertIncludes(mediaDelivery, "publicPlaybackSafe", "media delivery resolver explicit safety flag");
assertIncludes(mediaDelivery, "cdnAllowedPublicPlaybackPaths", "media delivery resolver explicit public playback allowlist");
assertIncludes(mediaDelivery, "public_playback_not_marked_safe", "media delivery resolver explicit safety block");
assertIncludes(mediaDelivery, "not_in_public_playback_allowlist", "media delivery resolver public playback allowlist block");
assertIncludes(mediaDelivery, "outside_public_playback_prefix", "media delivery resolver prefix block");
assertIncludes(mediaDelivery, "original_or_master_blocked", "media delivery resolver original/master block");
assertIncludes(mediaDelivery, "unscanned_blocked", "media delivery resolver unscanned block");
assertIncludes(mediaDelivery, "moderation_blocked", "media delivery resolver moderation block");
assertIncludes(mediaDelivery, "private_asset_blocked", "media delivery resolver private block");
assertIncludes(mediaDelivery, "premium_requires_token_cdn", "media delivery resolver Premium block");
assertIncludes(mediaDelivery, "private_cdn_delivery_not_disabled", "media delivery resolver private CDN disabled guard");
assertIncludes(mediaDeliveryTelemetry, "buildMediaDeliveryEvent", "media delivery telemetry helper event builder");
assertIncludes(mediaDeliveryTelemetry, "buildMediaPlaybackSessionStart", "media delivery telemetry helper session start builder");
assertIncludes(mediaDeliveryTelemetry, "buildMediaPlaybackSessionEnd", "media delivery telemetry helper session end builder");
assertIncludes(mediaDeliveryTelemetry, "estimatePlaybackBytes", "media delivery telemetry helper byte estimator");
assertIncludes(mediaDeliveryTelemetry, "sanitizeMediaDeliveryTelemetryForProof", "media delivery telemetry helper proof sanitizer");
assertIncludes(mediaDeliveryTelemetry, "media_delivery_events", "media delivery telemetry event table shape");
assertIncludes(mediaDeliveryTelemetry, "media_playback_sessions", "media delivery telemetry session table shape");
assertIncludes(mediaDeliveryTelemetry, "playback_url_provider", "media delivery telemetry playback URL provider field");
assertIncludes(mediaDeliveryTelemetry, "cdn_cache_status", "media delivery telemetry CDN cache status field");
assertIncludes(mediaDeliveryTelemetry, "proof_mode", "media delivery telemetry proof mode field");
assertNotMatches(mediaDeliveryTelemetry, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "media delivery telemetry helper must not perform network or database writes");
assertNotMatches(mediaDeliveryTelemetry, /\b(?:signedUrl|signed_url|privateSignedUrl|private_signed_url|playbackUrl\??:|playback_url\??:)\b/, "media delivery telemetry helper must not define full playback URL fields");
assertIncludes(mediaTranscodeQueue, "MediaTranscodeJobStatus", "media transcode queue proof model status type");
assertIncludes(mediaTranscodeQueue, "\"queued\"", "media transcode queue proof model queued status");
assertIncludes(mediaTranscodeQueue, "\"probing\"", "media transcode queue proof model probing status");
assertIncludes(mediaTranscodeQueue, "\"transcoding\"", "media transcode queue proof model transcoding status");
assertIncludes(mediaTranscodeQueue, "\"uploading\"", "media transcode queue proof model uploading status");
assertIncludes(mediaTranscodeQueue, "\"ready\"", "media transcode queue proof model ready status");
assertIncludes(mediaTranscodeQueue, "\"failed\"", "media transcode queue proof model failed status");
assertIncludes(mediaTranscodeQueue, "MediaTranscodeJob", "media transcode queue proof model job type");
assertIncludes(mediaTranscodeQueue, "MediaTranscodeRendition", "media transcode queue proof model rendition type");
assertIncludes(mediaTranscodeQueue, "MediaTranscodeManifest", "media transcode queue proof model manifest type");
assertIncludes(mediaTranscodeQueue, "MediaTranscodeProofResult", "media transcode queue proof result type");
assertIncludes(mediaTranscodeQueue, "jobId", "media transcode queue proof model job id field");
assertIncludes(mediaTranscodeQueue, "sourceId", "media transcode queue proof model source id field");
assertIncludes(mediaTranscodeQueue, "inputProvider", "media transcode queue proof model input provider field");
assertIncludes(mediaTranscodeQueue, "outputProvider", "media transcode queue proof model output provider field");
assertIncludes(mediaTranscodeQueue, "requestedRenditions", "media transcode queue proof model requested renditions field");
assertIncludes(mediaTranscodeQueue, "completedRenditions", "media transcode queue proof model completed renditions field");
assertIncludes(mediaTranscodeQueue, "durationMillis", "media transcode queue proof model duration field");
assertIncludes(mediaTranscodeQueue, "sourceWidth", "media transcode queue proof model source width field");
assertIncludes(mediaTranscodeQueue, "sourceHeight", "media transcode queue proof model source height field");
assertIncludes(mediaTranscodeQueue, "sourceCodec", "media transcode queue proof model source codec field");
assertIncludes(mediaTranscodeQueue, "errorCode", "media transcode queue proof model error code field");
assertIncludes(mediaTranscodeQueue, "errorMessage", "media transcode queue proof model error message field");
assertIncludes(mediaTranscodeQueue, "productionDbWritesEnabled: false", "media transcode queue proof model no production DB writes");
assertIncludes(mediaTranscodeQueue, "productionPlaybackSwitched: false", "media transcode queue proof model no production playback switch");
assertIncludes(mediaTranscodeQueue, "productionTranscodeServiceLive: false", "media transcode queue proof model no production service claim");
assertIncludes(mediaTranscodeQueue, "MEDIA_TRANSCODE_PROOF_APPROVED_CITY_LIGHTS_INPUT", "media transcode queue proof model approved input allowlist");
assertIncludes(mediaTranscodeQueue, "MEDIA_TRANSCODE_PROOF_PUBLIC_PREFIX = \"playback/public/\"", "media transcode queue proof model public output prefix");
assertIncludes(mediaTranscodeQueue, "canResolveCompletedProofTranscodeJob", "media transcode queue proof completed-job resolver gate");
assertNotMatches(mediaTranscodeQueue, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "media transcode queue helper must not perform network or database writes");
assertIncludes(mediaRenditionMetadata, "TrustedMediaRenditionMetadata", "trusted media rendition metadata model");
assertIncludes(mediaRenditionMetadata, "delivery_format", "trusted media rendition delivery format field");
assertIncludes(mediaRenditionMetadata, "delivery_provider", "trusted media rendition delivery provider field");
assertIncludes(mediaRenditionMetadata, "storage_provider", "trusted media rendition storage provider field");
assertIncludes(mediaRenditionMetadata, "bucket_role", "trusted media rendition bucket role field");
assertIncludes(mediaRenditionMetadata, "public_playback_path", "trusted media rendition public playback path field");
assertIncludes(mediaRenditionMetadata, "manifest_path", "trusted media rendition manifest path field");
assertIncludes(mediaRenditionMetadata, "variant_playlist_path", "trusted media rendition variant playlist field");
assertIncludes(mediaRenditionMetadata, "cache_policy", "trusted media rendition cache policy field");
assertIncludes(mediaRenditionMetadata, "is_public_playback_safe", "trusted media rendition public safety field");
assertIncludes(mediaRenditionMetadata, "is_original", "trusted media rendition original flag");
assertIncludes(mediaRenditionMetadata, "is_ready", "trusted media rendition ready flag");
assertIncludes(mediaRenditionMetadata, "canUseTrustedRenditionForPublicCdn", "trusted media rendition CDN gate");
assertIncludes(mediaRenditionMetadata, "buildMediaDeliveryAssetFromTrustedRendition", "trusted media rendition media delivery bridge");
assertIncludes(mediaRenditionMetadata, "buildCityLightsTrustedHlsRenditionFixtures", "trusted media rendition City Lights fixture");
assertIncludes(mediaRenditionMetadata, "TRUSTED_RENDITION_CITY_LIGHTS_HLS_MASTER_PATH", "trusted media rendition City Lights HLS master constant");
assertIncludes(mediaRenditionMetadata, "not_ready", "trusted media rendition not-ready block");
assertIncludes(mediaRenditionMetadata, "original_or_master_blocked", "trusted media rendition original/master block");
assertIncludes(mediaRenditionMetadata, "scan_not_clean", "trusted media rendition scan block");
assertIncludes(mediaRenditionMetadata, "moderation_not_allowed", "trusted media rendition moderation block");
assertIncludes(mediaRenditionMetadata, "wrong_bucket_role", "trusted media rendition bucket role block");
assertIncludes(mediaRenditionMetadata, "non_playback_prefix", "trusted media rendition public prefix block");
assertIncludes(mediaRenditionMetadata, "premium_requires_token_cdn", "trusted media rendition Premium block");
assertIncludes(mediaRenditionMetadata, "private_requires_token_cdn", "trusted media rendition private block");
assertNotMatches(mediaRenditionMetadata, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "trusted media rendition metadata helper must not perform network or database writes");
assertIncludes(mediaPlaybackCdnEligibility, "canUseAuditedPublicRenditionForCdnPlayback", "trusted audited CDN eligibility helper");
assertIncludes(mediaPlaybackCdnEligibility, "resolveTrustedRenditionPlaybackSource", "trusted audited CDN resolver helper");
assertIncludes(mediaPlaybackCdnEligibility, "resolveCdnPlaybackFallback", "trusted audited CDN fallback helper");
assertIncludes(mediaPlaybackCdnEligibility, "sanitizeCdnEligibilityProof", "trusted audited CDN sanitizer");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_ENABLED", "trusted audited CDN enable env");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_KILL_SWITCH", "trusted audited CDN kill switch env");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_ROLLOUT_MODE", "trusted audited CDN rollout env");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_ALLOWED_SOURCE_IDS", "trusted audited CDN allowed source env");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_DENIED_SOURCE_IDS", "trusted audited CDN denied source env");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_REQUIRE_AUDIT_PASSED", "trusted audited CDN audit env");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_REQUIRE_BACKUP_FRESH", "trusted audited CDN backup env");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_FALLBACK_TO_ORIGIN", "trusted audited CDN fallback env");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_DELIVERY_PROVIDER", "trusted audited CDN delivery provider env");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_MAX_BATCH_SIZE", "trusted audited CDN max batch env");
assertIncludes(mediaPlaybackCdnEligibility, "MEDIA_PLAYBACK_CDN_PERCENT_ROLLOUT", "trusted audited CDN percent rollout env");
assertIncludes(mediaPlaybackCdnEligibility, "\"off\" | \"canary\" | \"batch\" | \"trusted_public\"", "trusted audited CDN rollout modes");
assertIncludes(mediaPlaybackCdnEligibility, "killSwitch", "trusted audited CDN kill switch config");
assertIncludes(mediaPlaybackCdnEligibility, "audit_not_passed", "trusted audited CDN audit block");
assertIncludes(mediaPlaybackCdnEligibility, "backup_gate_not_fresh", "trusted audited CDN backup block");
assertIncludes(mediaPlaybackCdnEligibility, "source_denied", "trusted audited CDN denied source block");
assertIncludes(mediaPlaybackCdnEligibility, "source_not_allowed", "trusted audited CDN allowlist block");
assertIncludes(mediaPlaybackCdnEligibility, "batch_limit_missing", "trusted audited CDN batch missing block");
assertIncludes(mediaPlaybackCdnEligibility, "batch_cap_exceeded", "trusted audited CDN batch cap block");
assertIncludes(mediaPlaybackCdnEligibility, "original_or_master_blocked", "trusted audited CDN original/master block");
assertIncludes(mediaPlaybackCdnEligibility, "premium_requires_token_cdn", "trusted audited CDN Premium block");
assertIncludes(mediaPlaybackCdnEligibility, "private_requires_token_cdn", "trusted audited CDN private block");
assertIncludes(mediaPlaybackCdnEligibility, "premiumTokenRequired", "trusted audited CDN Premium token integration");
assertIncludes(mediaPlaybackCdnEligibility, "premium_token_signer_unavailable", "trusted audited CDN Premium token signer gate");
assertIncludes(mediaPlaybackCdnEligibility, "resolvePremiumTokenizedUrl", "trusted audited CDN Premium tokenized URL resolver");
assertIncludes(mediaPlaybackCdnEligibility, "wrong_bucket_role", "trusted audited CDN bucket role block");
assertIncludes(mediaPlaybackCdnEligibility, "non_playback_prefix", "trusted audited CDN prefix block");
assertNotMatches(mediaPlaybackCdnEligibility, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|XMLHttpRequest|createClient)\b/, "trusted audited CDN helper must not perform network or database writes");
assertIncludes(mediaPremiumCdnToken, "buildPremiumCdnTokenClaims", "Premium CDN token model helper");
assertIncludes(mediaPremiumCdnToken, "validatePremiumCdnTokenClaims", "Premium CDN token validation helper");
assertIncludes(mediaPremiumCdnToken, "canIssuePremiumCdnToken", "Premium CDN token issue gate");
assertIncludes(mediaPremiumCdnToken, "MEDIA_PREMIUM_CDN_TOKEN_DEFAULT_TTL_SECONDS = 300", "Premium CDN token short TTL");
assertIncludes(mediaPremiumCdnToken, "\"playback/premium/\"", "Premium CDN protected prefix");
assertIncludes(mediaPremiumCdnToken, "\"playback/protected/premium/\"", "Premium CDN protected prefix");
assertIncludes(mediaPremiumCdnToken, "premium_entitlement_required", "Premium CDN entitlement gate");
assertIncludes(mediaPremiumCdnToken, "outside_premium_cdn_prefix", "Premium CDN protected path gate");
assertIncludes(mediaPremiumCdnToken, "premiumEntitlement: true", "Premium CDN entitlement claim");
assertIncludes(premiumCdnWorker, "PREMIUM_CDN_TOKEN_SECRET", "Premium CDN Worker token verifier env");
assertIncludes(premiumCdnWorker, "PREMIUM_MEDIA_R2_BUCKET", "Premium CDN Worker R2 binding env");
assertIncludes(premiumCdnWorker, "PREMIUM_MEDIA_ALLOWED_PREFIX", "Premium CDN Worker allowed prefix env");
assertIncludes(premiumCdnWorker, "playback/premium/", "Premium CDN Worker protected prefix");
assertIncludes(premiumCdnWorker, "playback/protected/premium/", "Premium CDN Worker protected prefix");
assertIncludes(premiumCdnWorker, "premiumEntitlement !== true", "Premium CDN Worker entitlement claim block");
assertIncludes(premiumCdnWorker, "public_free_path_bypasses_premium_worker", "Premium CDN Worker public free bypass");
assertIncludes(premiumCdnWorker, "tokenRedacted", "Premium CDN Worker redacted logging");
assertNotMatches(premiumCdnWorker, /\bconsole\.(log|info|warn|error)\b/, "Premium CDN Worker must not log tokens");
assertIncludes(premiumCdnWorkerConfig, "name = \"chillywood-premium-media-access-proof\"", "Premium CDN Worker proof deployment name");
assertIncludes(premiumCdnWorkerConfig, "workers_dev = false", "Premium CDN Worker must not publish workers.dev");
assertIncludes(premiumCdnWorkerConfig, "premium-media.chillywoodstream.com", "Premium CDN Worker production custom domain");
assertNotIncludes(premiumCdnWorkerConfig, "premium-media-proof.chillywoodstream.com", "Premium CDN Worker legacy proof custom domain must be removed");
assertIncludes(premiumCdnWorkerConfig, "bucket_name = \"chillywood-media-proof\"", "Premium CDN Worker private proof bucket binding");
assertIncludes(premiumCdnWorkerConfig, "PREMIUM_MEDIA_ALLOWED_PREFIX = \"playback/protected/premium/\"", "Premium CDN Worker protected allowed prefix");
assertIncludes(premiumCdnWorkerConfig, "PREMIUM_MEDIA_REQUIRE_USER_HEADER = \"false\"", "Premium CDN Worker native HLS child request compatibility");
assertIncludes(premiumCdnWorker, "rewritePremiumHlsManifestForProof", "Premium CDN Worker HLS playlist token rewrite");
assertIncludes(premiumCdnWorker, "absolute_manifest_uri_blocked", "Premium CDN Worker blocks absolute manifest URIs");
assertIncludes(premiumCdnWorker, "manifest_uri_source_scope_mismatch", "Premium CDN Worker child URI source scope");
assertIncludes(premiumCdnWorker, "manifest_uri_rendition_scope_mismatch", "Premium CDN Worker child URI rendition scope");
assertIncludes(premiumHdTokenIssuerFunction, "auth.getUser", "Premium HD token issuer authenticated user check");
assertIncludes(premiumHdTokenIssuerFunction, "monetization_has_active_premium", "Premium HD token issuer existing entitlement check");
assertIncludes(premiumHdTokenIssuerFunction, "media_renditions", "Premium HD token issuer protected row lookup");
assertIncludes(premiumHdTokenIssuerFunction, "cloudflare_r2_premium_token", "Premium HD token issuer protected provider");
assertIncludes(premiumHdTokenIssuerFunction, "protected_premium", "Premium HD token issuer protected bucket role");
assertIncludes(premiumHdTokenIssuerFunction, "is_public_playback_safe", "Premium HD token issuer unsigned public HD denial");
assertIncludes(premiumHdTokenIssuerFunction, "is_protected_playback_safe", "Premium HD token issuer protected safety flag");
assertIncludes(premiumHdTokenIssuerFunction, "PREMIUM_CDN_TOKEN_SECRET", "Premium HD token issuer signer env");
assertIncludes(premiumHdTokenIssuerFunction, "PREMIUM_MEDIA_WORKER_BASE_URL", "Premium HD token issuer Worker base URL env");
assertIncludes(premiumHdTokenIssuerFunction, "missing_token_issuer_env", "Premium HD token issuer missing env fail closed");
assertNotMatches(premiumHdTokenIssuerFunction, /\bconsole\.(log|info|warn|error)\b/, "Premium HD token issuer must not log tokens");
assertIncludes(vodQuality, "premium-media-playback-token", "installed app Premium HD token issuer integration");
assertIncludes(vodQuality, "isSafePremiumWorkerPlaybackUrl", "installed app Premium HD protected URL validator");
assertIncludes(vodQuality, "playback/protected/premium/", "installed app Premium HD protected prefix validator");
assertIncludes(player, "tokenized", "installed app Premium HD redacted metadata");
assertIncludes(player, "protectedPlayback", "installed app Premium HD redacted metadata");
assertIncludes(mediaPremiumCdnTokenProof, "free user cannot get 720p token", "Premium CDN token proof free user denial");
assertIncludes(mediaPremiumCdnTokenProof, "Premium user can get scoped 720p token claims", "Premium CDN token proof 720p");
assertIncludes(mediaPremiumCdnTokenProof, "Premium user can get scoped 1080p token claims", "Premium CDN token proof 1080p");
assertIncludes(mediaPremiumCdnTokenProof, "Premium HD falls back when token signer is unavailable", "Premium CDN token proof signer unavailable fallback");
assertIncludes(mediaPremiumCdnTokenProof, "public 360p/480p remains unsigned CDN eligible without Premium token", "Premium CDN token proof free public playback");
assertIncludes(premiumCdnWorkerProof, "valid Premium token + matching 720p path should be allowed", "Premium CDN Worker proof 720p");
assertIncludes(premiumCdnWorkerProof, "valid Premium token + matching 1080p path should be allowed", "Premium CDN Worker proof 1080p");
assertIncludes(premiumCdnWorkerProof, "missing token should be denied", "Premium CDN Worker proof missing token");
assertIncludes(premiumCdnWorkerProof, "expired token should be denied", "Premium CDN Worker proof expired token");
assertIncludes(premiumCdnWorkerProof, "wrong source should be denied", "Premium CDN Worker proof wrong source");
assertIncludes(premiumCdnWorkerProof, "wrong path should be denied", "Premium CDN Worker proof wrong path");
assertIncludes(premiumCdnWorkerProof, "non-Premium token should be denied", "Premium CDN Worker proof non-Premium");
assertIncludes(premiumCdnWorkerProof, "public 360p/480p path should not require Premium worker", "Premium CDN Worker proof public SD bypass");
assertIncludes(premiumCdnWorkerProof, "Worker should rewrite HLS child playlist URI with a root-relative child-scoped token", "Premium CDN Worker proof HLS child token rewrite");
assertIncludes(premiumCdnWorkerProof, "Worker should deny manifests containing absolute child URLs", "Premium CDN Worker proof absolute URI denial");
assertIncludes(premiumHdTokenIssuerProof, "Premium user + valid 720p row should receive token claims", "Premium HD token issuer proof 720p");
assertIncludes(premiumHdTokenIssuerProof, "Premium user + valid 1080p row should receive token claims", "Premium HD token issuer proof 1080p");
assertIncludes(premiumHdTokenIssuerProof, "free user should be denied HD token", "Premium HD token issuer proof free denial");
assertIncludes(premiumHdTokenIssuerProof, "missingEnvFailsClosed", "Premium HD token issuer proof missing env fail closed");
assertIncludes(premiumHdTokenIssuerProof, "publicSdUnchanged", "Premium HD token issuer proof public SD unchanged");
assertIncludes(premiumCdnWorkerLiveProof, "premium-media.chillywoodstream.com", "Premium CDN Worker preferred live proof hostname");
assertNotIncludes(premiumCdnWorkerLiveProof, "premium-media-proof.chillywoodstream.com", "Premium CDN Worker live proof must not depend on legacy proof hostname");
assertIncludes(premiumCdnWorkerLiveProof, "playback/protected/premium/proof/hello/720p/hello.txt", "Premium CDN Worker live proof object");
assertIncludes(premiumCdnWorkerLiveProof, "valid Premium token + proof 720p path should return HTTP 200", "Premium CDN Worker live proof allow");
assertIncludes(premiumCdnWorkerLiveProof, "missing token should be denied", "Premium CDN Worker live proof missing token denial");
assertIncludes(premiumCdnWorkerLiveProof, "wrong source should be denied", "Premium CDN Worker live proof wrong source denial");
assertIncludes(premiumCdnWorkerLiveProof, "non-Premium token should be denied", "Premium CDN Worker live proof non-Premium denial");
assertIncludes(mediaPlaybackCdnEligibilityProof, "canaryCityLightsCdn", "trusted audited CDN proof canary case");
assertIncludes(mediaPlaybackCdnEligibilityProof, "batchSelectedSourceCdn", "trusted audited CDN proof batch selected case");
assertIncludes(mediaPlaybackCdnEligibilityProof, "batchUnselectedSourceFallback", "trusted audited CDN proof batch unselected fallback");
assertIncludes(mediaPlaybackCdnEligibilityProof, "batchCapEnforced", "trusted audited CDN proof batch cap");
assertIncludes(mediaPlaybackCdnEligibilityProof, "trustedPublicValidAuditedRowCdn", "trusted audited CDN proof trusted_public case");
assertIncludes(mediaPlaybackCdnEligibilityProof, "privatePremiumOriginalPublicCdnAllowed: false", "trusted audited CDN proof private Premium original blocked");
assertIncludes(mediaPlaybackCdnEligibilityProof, "productionPlaybackSwitched: false", "trusted audited CDN proof no playback switch");
assertIncludes(mediaPlaybackCdnEligibilityProof, "productionBackfillRun: false", "trusted audited CDN proof no backfill");
assertIncludes(mediaCdnRolloutPlanner, "buildMediaCdnRolloutPlan", "media CDN rollout planner plan helper");
assertIncludes(mediaCdnRolloutPlanner, "max_batch_size_required", "media CDN rollout planner max batch requirement");
assertIncludes(mediaCdnRolloutPlanner, "mutationAttempted: false", "media CDN rollout planner no mutation");
assertIncludes(mediaCdnRolloutPlanner, "productionPlaybackSwitched: false", "media CDN rollout planner no playback switch");
assertIncludes(mediaCdnRolloutPlanner, "productionBackfillRun: false", "media CDN rollout planner no backfill");
assertIncludes(mediaCdnRolloutPlanner, "rollbackPlanRequired", "media CDN rollout planner rollback plan");
assertIncludes(mediaCdnRolloutPlannerProof, "thousandEligibleFixtureRows", "media CDN rollout planner proof scale fixture");
assertIncludes(mediaCdnRolloutPlannerProof, "maxBatchCapEnforced", "media CDN rollout planner proof batch cap");
assertIncludes(mediaCdnRolloutPlannerProof, "deniedRowsExcluded", "media CDN rollout planner proof denied exclusion");
assertIncludes(mediaCdnRolloutPlannerProof, "unsafeRowsExcluded", "media CDN rollout planner proof unsafe exclusion");
assertIncludes(mediaCdnRolloutPlannerProof, "pendingAuditExcluded", "media CDN rollout planner proof pending audit exclusion");
assertIncludes(mediaCdnRolloutPlannerProof, "rollbackPlanRequired", "media CDN rollout planner proof rollback required");
assertIncludes(mediaCdnRolloutPlannerProof, "mutationAttempted: false", "media CDN rollout planner proof no mutation");
assertIncludes(mediaCdnRolloutPlannerProof, "productionBackfillRun: false", "media CDN rollout planner proof no backfill");
assertNotMatches(mediaCdnRolloutPlanner, /\b(?:insert\s*\(|upsert\s*\(|delete\s*\(|update\s*\(|createClient)\b/i, "media CDN rollout planner must not mutate DB");
assertIncludes(vodDoc, "Premium signed/token CDN delivery is active for audited protected Premium rows.", "VOD doc Premium token active boundary");
assertIncludes(vodDoc, "Protected Premium HD delivery path is deployed/proved on the isolated Worker `chillywood-premium-media-access-proof` at production host `premium-media.chillywoodstream.com`; the old `premium-media-proof.chillywoodstream.com` host is historical only and is no longer attached as an active fallback.", "VOD doc Premium Worker deployed proof boundary");
assertIncludes(vodDoc, "Production currently has `5` audited protected Premium HD rows: `4` source-supported 720p rows and `1` source-supported 1080p row.", "VOD doc Premium HD row count");
assertIncludes(architecture, "Premium HD token mode is active for protected audited rows only.", "architecture doc Premium token active boundary");
assertIncludes(architecture, "Without the signer, HD falls back/blocks.", "architecture doc Premium token signer fallback");
assertIncludes(architecture, "Protected Premium HD delivery architecture: `workers/premium-media-access/worker.mjs` is the selected Worker path, and the isolated Worker deployment `chillywood-premium-media-access-proof` now uses `premium-media.chillywoodstream.com` as the only active production Premium HD custom domain.", "architecture doc Premium Worker choice");
assertIncludes(architecture, "It denies missing/expired/wrong-source/wrong-path/wrong-rendition/non-Premium/private/original/unscanned/moderation-blocked requests", "architecture doc Premium Worker deny cases");
assertIncludes(architecture, "Production now has `5` protected Premium HD rows, all under `playback/protected/premium/`, with unsigned public HD exposure `0`.", "architecture doc Premium HD protected rows");
assertIncludes(architecture, "Live app token issuance architecture: Supabase Edge Function `premium-media-playback-token` is deployed", "architecture doc Premium token issuer deployed");
assertIncludes(architecture, "Installed proof on Play-installed `R5CR120QCBF` is Closed", "architecture doc installed Premium HD proof closed");
assertIncludes(mediaAutomationOperatorRunbook, "Status: CLI auto-detect bounded execution is live for safe Level 0/1 candidates, while daemon/cron/scheduler/continuous automation remains off.", "media automation runbook status");
assertIncludes(mediaAutomationOperatorRunbook, "No daemon, cron, scheduler, GitHub Actions schedule, deployed production worker, broad backfill, queue processor, or continuous worker is live.", "media automation runbook no deployment");
assertIncludes(mediaAutomationOperatorRunbook, "continuous limited automation is source/proofed/templates only", "media automation runbook continuous template boundary");
assertIncludes(mediaAutomationOperatorRunbook, "Safe Level 0/1 media operations should not require owner approval", "media automation runbook autonomy boundary");
assertIncludes(mediaAutomationOperatorRunbook, "City Lights remains the canary proof, not the final hardcoded model.", "media automation runbook canary boundary");
assertIncludes(mediaAutomationOperatorRunbook, "Normal CLI operation is auto-detect: the owner does not manually pick every source id and does not manually choose the batch size.", "media automation runbook auto-detect normal operation");
assertIncludes(mediaAutomationOperatorRunbook, "R2 logical backups are not true PITR.", "media automation runbook PITR boundary");
assertIncludes(mediaAutomationOperatorRunbook, "MEDIA_AUTOMATION_RUN_CONFIRM=I_UNDERSTAND_BATCH_AUTOMATION", "media automation runbook owner confirmation");
assertIncludes(mediaAutomationOperatorRunbook, "MEDIA_AUTOMATION_RUN_CONFIRM=I_UNDERSTAND_AUTO_DETECT_BATCH", "media automation runbook auto-detect confirmation");
assertIncludes(mediaAutomationOperatorRunbook, "Audit pass is required before resolver trust.", "media automation runbook audit gate");
assertIncludes(mediaAutomationOperatorRunbook, "Rollback plans target only the exact `batch_id` and exact R2 output prefix.", "media automation runbook rollback scope");
assertIncludes(architecture, "Catalog readiness automation status: source/proofed and read-only for classification.", "catalog readiness architecture status");
assertIncludes(architecture, "`ready_for_transcode=0`, `already_audited_hls=5`, `needs_scan=0`, `private_excluded=12`, `premium_excluded=9`, `unsupported_format=1`", "catalog readiness linked readback");
assertIncludes(mediaCatalogReadinessRunbook, "Catalog readiness CLI is read-only.", "catalog readiness runbook read-only status");
assertIncludes(mediaCatalogReadinessRunbook, "The scanner CLI is the separate trusted execution path", "catalog readiness runbook scan execution boundary");
assertIncludes(mediaCatalogReadinessRunbook, "Do not mark unscanned media clean without scanner proof.", "catalog readiness runbook scan proof boundary");
assertIncludes(mediaCatalogReadinessRunbook, "Private and Premium media remain excluded.", "catalog readiness runbook private Premium boundary");
assertIncludes(mediaCatalogReadiness, "| \"needs_scan\"", "catalog readiness needs scan classification");
assertIncludes(mediaCatalogReadiness, "| \"ready_for_transcode\"", "catalog readiness ready classification");
assertIncludes(mediaCatalogReadiness, "| \"private_excluded\"", "catalog readiness private classification");
assertIncludes(mediaCatalogReadiness, "| \"premium_excluded\"", "catalog readiness Premium classification");
assertIncludes(mediaCatalogReadiness, "canQueueMediaForScan", "catalog readiness scan queue helper");
assertIncludes(mediaCatalogReadiness, "canPromoteScanResultToTranscodeEligibility", "catalog readiness transcode promotion helper");
assertIncludes(mediaCatalogReadiness, "classification === \"ready_for_transcode\"", "catalog readiness promotion requires ready");
assertIncludes(mediaCatalogReadinessCli, "scanExecutionAvailableInThisCommand: false", "catalog readiness CLI scan execution disabled");
assertIncludes(mediaCatalogReadinessCli, "productionRowsWritten: false", "catalog readiness CLI no production writes");
assertIncludes(mediaCatalogReadinessCli, "mediaProcessed: false", "catalog readiness CLI no media processing");
assertIncludes(mediaCatalogReadinessCli, "playbackSwitched: false", "catalog readiness CLI no playback switch");
assertIncludes(mediaCatalogReadinessProof, "unscanned public media needs scan", "catalog readiness proof unscanned block");
assertIncludes(mediaCatalogReadinessProof, "unscanned cannot promote", "catalog readiness proof no unscanned promotion");
assertIncludes(packageJson, "\"media-catalog:status\"", "package catalog status script");
assertIncludes(packageJson, "\"media-catalog:readiness-plan\"", "package catalog readiness plan script");
assertIncludes(packageJson, "\"media-catalog:scan-plan\"", "package catalog scan plan script");
assertIncludes(packageJson, "\"proof:media-catalog-readiness\"", "package catalog readiness proof script");
assertNotMatches(mediaCatalogReadinessCli, /\b(?:insert\s*\(|upsert\s*\(|delete\s*\(|update\s*\(|createClient)\b/i, "catalog readiness CLI must not mutate DB");
assertIncludes(architecture, "Scan automation status: trusted backend scanner gateway is live and production scan proof passed for current public candidates.", "scan automation architecture status");
assertIncludes(architecture, "The scanner proof is explicitly not malware scanning or content moderation.", "scan automation architecture scanner boundary");
assertIncludes(mediaCatalogReadinessRunbook, "Trusted backend scanner gateway", "scan automation runbook backend gateway boundary");
assertIncludes(mediaCatalogReadinessRunbook, "The implemented scanner proof is ffprobe media-readability only.", "scan automation runbook ffprobe boundary");
assertIncludes(mediaScanPrivateAccessFunction, "MEDIA_SCAN_OPERATOR_TOKEN_SHA256", "scan gateway token hash secret");
assertIncludes(mediaScanPrivateAccessFunction, "x-media-scan-operator-token", "scan gateway operator token header");
assertIncludes(mediaScanPrivateAccessFunction, "timingSafeEqualHex", "scan gateway constant-time token hash compare");
assertIncludes(mediaScanPrivateAccessFunction, "private_denied", "scan gateway private denial");
assertIncludes(mediaScanPrivateAccessFunction, "premium_denied", "scan gateway Premium denial");
assertIncludes(mediaScanPrivateAccessFunction, "streamS3Object", "scan gateway S3/Hetzner support");
assertIncludes(mediaScanPrivateAccessFunction, "streamSupabaseStorageObject", "scan gateway Supabase Storage support");
assertIncludes(mediaScanPrivateAccessFunction, "observed_readable_required", "scan gateway clean write proof requirement");
assertIncludes(mediaScanPrivateAccessFunction, "ffprobe_media_readability_only_not_malware_or_content_moderation", "scan gateway overclaim guard");
assertIncludes(mediaScanPrivateAccessFunction, "media_readability_result_recorded", "readability gateway redacted audit event");
assertIncludes(mediaScanPrivateAccessProof, "noLocalServiceRoleRequired", "scan gateway proof no local service role");
assertIncludes(mediaScanPrivateAccessProof, "noLocalStorageCredentialsRequired", "scan gateway proof no local storage credentials");
assertIncludes(mediaScanAutomation, "| \"scan_skipped_private\"", "scan automation private skip state");
assertIncludes(mediaScanAutomation, "| \"scan_skipped_premium\"", "scan automation Premium skip state");
assertIncludes(mediaScanAutomation, "| \"scan_skipped_already_audited_hls\"", "scan automation already audited skip state");
assertIncludes(mediaScanAutomation, "scanner_name_required", "scan automation scanner name requirement");
assertIncludes(mediaScanAutomation, "scanner_version_required", "scan automation scanner version requirement");
assertIncludes(mediaScanAutomation, "scanner_proof_required_for_clean", "scan automation scanner proof requirement");
assertIncludes(mediaScanAutomation, "canPromoteScanResultToReadiness", "scan automation readiness promotion helper");
assertIncludes(mediaScanAutomation, "moderation_not_allowed", "scan automation moderation gate");
assertIncludes(mediaScanCli, "MEDIA_SCAN_RUN_ONE_CONFIRM", "scan CLI confirmation env");
assertIncludes(mediaScanCli, "I_UNDERSTAND_PUBLIC_SCAN_ONE", "scan CLI confirmation value");
assertIncludes(mediaScanCli, "production_scan_write_not_enabled_in_this_source_proof_build", "scan CLI production write disabled");
assertIncludes(mediaScanCli, "MEDIA_SCAN_OPERATOR_TOKEN", "scan CLI operator token");
assertIncludes(mediaScanCli, "MEDIA_SCAN_ACCESS_MODE", "scan CLI backend access mode");
assertIncludes(mediaScanCli, "media-scan-private-access", "scan CLI backend gateway path");
assertIncludes(mediaScanCli, "trusted_scan_gateway_download_denied", "scan CLI gateway download denial");
assertIncludes(mediaScanCli, "trusted_scan_gateway_record_denied", "scan CLI gateway record denial");
assertIncludes(mediaScanCli, "rawServiceRoleRequired: false", "scan CLI does not require raw local service-role for scanner gateway");
assertIncludes(mediaScanCli, "rawStorageCredentialsRequired: false", "scan CLI does not require local storage credentials for scanner gateway");
assertIncludes(mediaScanCli, "ffprobe_media_readability_only_not_malware_or_content_moderation", "scan CLI scanner type disclosure");
assertIncludes(mediaScanCli, "sourceId: publicSafeToIdentify ? result.sourceId : \"[redacted]\"", "scan CLI private/Premium identifier redaction");
assertIncludes(mediaScanAutomationProof, "ffprobe-readable media validates clean", "scan proof ffprobe clean case");
assertIncludes(mediaScanAutomationProof, "ffprobe failure validates failed", "scan proof ffprobe failure case");
assertIncludes(mediaScanAutomationProof, "run-one requires confirmation", "scan proof run-one confirmation");
assertIncludes(packageJson, "\"media-scan:status\"", "package media scan status script");
assertIncludes(packageJson, "\"media-scan:plan\"", "package media scan plan script");
assertIncludes(packageJson, "\"media-scan:dry-run\"", "package media scan dry-run script");
assertIncludes(packageJson, "\"proof:media-scan-automation\"", "package media scan proof script");
assertNotMatches(mediaScanCli, /\b(?:insert\s*\(|upsert\s*\(|delete\s*\(|update\s*\(|createClient)\b/i, "media scan CLI must not mutate DB");
assertIncludes(mediaAutomationController, "MEDIA_AUTOMATION_DEFAULT_MODE: MediaAutomationMode = \"off\"", "media automation controller off default");
assertIncludes(mediaAutomationController, "| \"dry_run\"", "media automation controller dry-run mode");
assertIncludes(mediaAutomationController, "| \"auto_detect\"", "media automation controller auto-detect mode");
assertIncludes(mediaAutomationController, "| \"auto_detect_run\"", "media automation controller auto-detect run mode");
assertIncludes(mediaAutomationController, "| \"one_job\"", "media automation controller one-job mode");
assertIncludes(mediaAutomationController, "| \"batch\"", "media automation controller batch mode");
assertIncludes(mediaAutomationController, "| \"continuous_limited\"", "media automation controller continuous limited mode");
assertIncludes(mediaAutomationController, "| \"continuous_paused\"", "media automation controller continuous paused mode");
assertIncludes(mediaAutomationController, "| \"emergency_stop\"", "media automation controller emergency stop mode");
assertIncludes(mediaAutomationController, "| \"continuous_full_blocked\"", "media automation controller continuous full blocked mode");
assertIncludes(mediaAutomationController, "emergency_stop_overrides_all_modes", "media automation controller emergency stop");
assertIncludes(mediaAutomationController, "dry_run_writes_nothing", "media automation controller dry-run no writes");
assertIncludes(mediaAutomationController, "one_job_requires_source_allowlist", "media automation controller one-job allowlist");
assertIncludes(mediaAutomationController, "batch_requires_owner_approval", "media automation controller batch owner approval");
assertIncludes(mediaAutomationController, "continuous_limited_requires_scheduled_backup_restore", "media automation controller continuous backup restore gate");
assertIncludes(mediaAutomationController, "continuous_limited_requires_no_audit_failure", "media automation controller audit failure block");
assertIncludes(mediaAutomationController, "continuous_limited_requires_cache_validation", "media automation controller cache validation gate");
assertIncludes(mediaAutomationController, "continuous_limited_requires_output_validation", "media automation controller output validation gate");
assertIncludes(mediaAutomationController, "continuous_limited_requires_no_private_candidates", "media automation controller private candidate gate");
assertIncludes(mediaAutomationController, "continuous_limited_requires_low_error_rate", "media automation controller error rate gate");
assertIncludes(mediaAutomationController, "auto_detect_run_requires_confirmation", "media automation controller auto-run confirmation");
assertIncludes(mediaAutomationController, "auto_detect_run_requires_no_active_unfinished_jobs", "media automation controller active job block");
assertIncludes(mediaAutomationController, "auto_detect_run_requires_no_unsafe_cdn_rows", "media automation controller unsafe CDN block");
assertIncludes(mediaAutomationController, "auto_detect_run_requires_restore_drill_fresh", "media automation controller restore drill freshness");
assertIncludes(mediaAutomationController, "broad_backfill_disabled_by_default", "media automation controller broad backfill block");
assertIncludes(mediaAutomationDiscovery, "eligible_needs_transcode", "media automation discovery eligible transcode classification");
assertIncludes(mediaAutomationDiscovery, "eligible_already_has_audited_hls", "media automation discovery audited HLS classification");
assertIncludes(mediaAutomationDiscovery, "excluded_private", "media automation discovery excluded private classification");
assertIncludes(mediaAutomationDiscovery, "excluded_premium", "media automation discovery excluded Premium classification");
assertIncludes(mediaAutomationDiscovery, "excluded_original_master", "media automation discovery excluded original classification");
assertIncludes(mediaAutomationDiscovery, "excluded_unscanned", "media automation discovery excluded unscanned classification");
assertIncludes(mediaAutomationDiscovery, "excluded_moderation_blocked", "media automation discovery excluded moderation classification");
assertIncludes(mediaAutomationDiscovery, "excluded_already_active_job", "media automation discovery active job block");
assertIncludes(mediaAutomationDiscovery, "discoverEligibleMediaCandidates", "media automation discovery auto discover helper");
assertIncludes(mediaAutomationDiscovery, "filterAutomationCandidates", "media automation discovery filter helper");
assertIncludes(mediaAutomationDiscovery, "private_blocked", "media automation discovery private block");
assertIncludes(mediaAutomationDiscovery, "premium_blocked", "media automation discovery Premium block");
assertIncludes(mediaAutomationDiscovery, "original_only_blocked", "media automation discovery original block");
assertIncludes(mediaAutomationDiscovery, "unscanned_blocked", "media automation discovery unscanned block");
assertIncludes(mediaAutomationDiscovery, "moderation_blocked", "media automation discovery moderation block");
assertIncludes(mediaAutomationBatchPolicy, "calculateAutoBatchSize", "media automation batch policy calculate helper");
assertIncludes(mediaAutomationBatchPolicy, "first_auto_run_cap_one", "media automation batch policy first run cap");
assertIncludes(mediaAutomationBatchPolicy, "success_streak_cap_five", "media automation batch policy success growth");
assertIncludes(mediaAutomationBatchPolicy, "previous_failure_drops_cap_to_one", "media automation batch policy failure reset");
assertIncludes(mediaAutomationBatchPolicy, "active_unfinished_jobs_present", "media automation batch policy active job block");
assertIncludes(mediaAutomationBatchPolicy, "unsafe_cdn_rows_present", "media automation batch policy unsafe row block");
assertIncludes(mediaAutomationBatchPolicy, "latest_backup_stale", "media automation batch policy stale backup block");
assertIncludes(mediaAutomationBatchPolicy, "restore_drill_stale", "media automation batch policy stale restore drill block");
assertIncludes(mediaAutomationBatchPolicy, "high_error_rate", "media automation batch policy error rate block");
assertIncludes(mediaAutomationBatchPolicy, "cpu_capacity_low_reduces_cap", "media automation batch policy cpu pressure cap reduction");
assertIncludes(mediaAutomationBatchPolicy, "manualBatchSizeRequired: false", "media automation batch policy no manual batch size");
assertIncludes(chillywoodAutonomyPolicy, "classifyAutonomousOperation", "autonomy policy classifier");
assertIncludes(chillywoodAutonomyPolicy, "requiresOwnerApproval", "autonomy policy owner approval helper");
assertIncludes(chillywoodAutonomyPolicy, "level_0_fully_autonomous", "autonomy policy level 0");
assertIncludes(chillywoodAutonomyPolicy, "paid_provider_billing_change", "autonomy policy billing boundary");
assertIncludes(chillywoodAutonomyPolicy, "auth_rls_change", "autonomy policy auth RLS boundary");
assertIncludes(chillywoodAutonomyPolicy, "broad_uncapped_backfill", "autonomy policy broad backfill boundary");
assertIncludes(chillywoodAutonomyPolicy, "app_store_public_release", "autonomy policy app store boundary");
assertIncludes(mediaAutomationBackfillPolicy, "backfill_disabled_by_default", "media automation backfill disabled default");
assertIncludes(mediaAutomationBackfillPolicy, "broad_backfill_requires_owner_approval", "media automation backfill owner approval boundary");
assertIncludes(mediaAutomationBackfillPolicy, "private_media_blocked", "media automation backfill private block");
assertIncludes(mediaAutomationBackfillPolicy, "small_backfill_batch_cap_invalid", "media automation backfill cap");
assertIncludes(mediaAutomationQueueProcessor, "leaseRequired: true", "media automation queue processor lease required");
assertIncludes(mediaAutomationQueueProcessor, "backupGateRequired: true", "media automation queue processor backup gate");
assertIncludes(mediaAutomationQueueProcessor, "killSwitchRequired: true", "media automation queue processor kill switch");
assertIncludes(mediaAutomationQueueProcessor, "deadLetterRequired: true", "media automation queue processor dead letter");
assertIncludes(mediaAutomationQueueProcessor, "quarantineRequired: true", "media automation queue processor quarantine");
assertIncludes(mediaAutomationQueueProcessor, "unsafe_queue_item_blocked", "media automation queue unsafe block");
assertIncludes(mediaAutomationJobs, "playback/public/auto/", "media automation jobs public output prefix");
assertIncludes(mediaAutomationJobs, "rollbackScope", "media automation jobs rollback scope");
assertIncludes(mediaAutomationJobs, "buildAutoDetectedTranscodeJobPlan", "media automation jobs auto job plan helper");
assertIncludes(mediaAutomationJobs, "buildAutoDetectedRollbackPlan", "media automation jobs auto rollback plan helper");
assertIncludes(mediaAutomationJobs, "mutationAttempted: false", "media automation jobs dry-run no mutation");
assertIncludes(mediaAutomationWorkerLoop, "leasesRequired: true", "media automation worker loop lease required");
assertIncludes(mediaAutomationWorkerLoop, "auditRequiredBeforeResolverTrust: true", "media automation worker loop audit required");
assertIncludes(mediaAutomationWorkerLoop, "MEDIA_AUTOMATION_TELEMETRY_EVENTS", "media automation worker loop telemetry events");
assertIncludes(mediaAutomationWorkerLoop, "auto_discovery_started", "media automation worker loop auto discovery telemetry");
assertIncludes(mediaAutomationWorkerLoop, "batch_dry_run_passed", "media automation worker loop dry-run telemetry");
assertIncludes(mediaAutomationWorkerLoop, "playback_cdn_selected", "media automation worker loop CDN selected telemetry");
assertIncludes(mediaAutomationWorkerLoop, "playback_fallback_used", "media automation worker loop fallback telemetry");
assertIncludes(mediaAutomationWorkerLoop, "rollback_executed", "media automation worker loop rollback telemetry");
assertIncludes(mediaAutomationWorkerLoop, "automation_started", "media automation worker loop automation telemetry");
assertIncludes(mediaAutomationWorkerLoop, "automation_paused", "media automation worker loop pause telemetry");
assertIncludes(mediaAutomationWorkerLoop, "emergency_stop_triggered", "media automation worker loop emergency telemetry");
assertIncludes(mediaAutomationWorkerLoop, "cost_summary_reported", "media automation worker loop cost telemetry");
assertIncludes(mediaAutomationWorkerLoop, "claimAutomationBatchLease", "media automation worker loop auto lease alias");
assertIncludes(mediaAutomationWorkerLoop, "quarantineAutomationWorkerBatch", "media automation worker loop quarantine");
assertIncludes(mediaAutomationWorkerLoop, "status: \"pending_audit\" | \"audit_passed\" | \"audit_failed\" | \"quarantined\"", "media automation worker loop pending/quarantine states");
assertIncludes(mediaAutomationCli, "MEDIA_AUTOMATION_RUN_CONFIRM", "media automation CLI owner confirmation env");
assertIncludes(mediaAutomationCli, "I_UNDERSTAND_BATCH_AUTOMATION", "media automation CLI owner confirmation value");
assertIncludes(mediaAutomationCli, "I_UNDERSTAND_AUTO_DETECT_BATCH", "media automation CLI auto confirmation value");
assertIncludes(mediaAutomationCli, "I_UNDERSTAND_ONE_CONTINUOUS_LIMITED_CYCLE", "media automation CLI continuous once confirmation value");
assertIncludes(mediaAutomationCli, "I_UNDERSTAND_BROAD_BACKFILL_RISK", "media automation CLI broad backfill confirmation value");
assertIncludes(mediaAutomationCli, "\"plan-auto\"", "media automation CLI plan-auto command");
assertIncludes(mediaAutomationCli, "\"dry-run-auto\"", "media automation CLI dry-run-auto command");
assertIncludes(mediaAutomationCli, "\"run-auto\"", "media automation CLI run-auto command");
assertIncludes(mediaAutomationCli, "\"run-continuous-once\"", "media automation CLI bounded continuous command");
assertIncludes(mediaAutomationCli, "\"report\"", "media automation CLI report command");
assertIncludes(mediaAutomationCli, "manualSourceIdsRequired: false", "media automation CLI no manual source ids");
assertIncludes(mediaAutomationCli, "manualBatchSizeRequired: false", "media automation CLI no manual batch size");
assertNotIncludes(mediaAutomationCli, "batch_execution_not_enabled_in_source_proof_build", "media automation CLI no source-proof-only run batch gate");
assertIncludes(mediaAutomationCli, "linked_real_bounded_auto_batch", "media automation CLI real bounded auto execution");
assertIncludes(mediaAutomationCli, "fixture_simulated", "media automation CLI fixture proof execution");
assertIncludes(mediaAutomationCli, "continuous_limited_once_not_enabled_in_source_proof_build", "media automation CLI fail-closed continuous once");
assertIncludes(mediaAutomationCli, "playback/public/auto/", "media automation CLI exact output prefix");
assertIncludes(mediaAutomationCli, "productionRowsWritten: false", "media automation CLI no production writes");
assertIncludes(mediaAutomationCli, "cronSchedulerAdded: false", "media automation CLI no scheduler");
assertIncludes(mediaAutomationControllerProof, "defaultOff", "media automation controller proof default off");
assertIncludes(mediaAutomationControllerProof, "emergencyStop", "media automation controller proof emergency stop");
assertIncludes(mediaAutomationControllerProof, "dryRunWritesJobs", "media automation controller proof dry-run no writes");
assertIncludes(mediaAutomationControllerProof, "autoDetectPlansWithoutWrites", "media automation controller proof auto detect");
assertIncludes(mediaAutomationControllerProof, "autoDetectRunRequiresConfirmation", "media automation controller proof auto run confirmation");
assertIncludes(mediaAutomationControllerProof, "unsafeCdnRowsBlockAutoRun", "media automation controller proof unsafe row block");
assertIncludes(mediaAutomationControllerProof, "continuousLimitedRequiresGate", "media automation controller proof continuous gate");
assertIncludes(mediaAutomationControllerProof, "continuousAuditFailure", "media automation controller proof audit failure");
assertIncludes(mediaAutomationControllerProof, "continuousPrivateCandidate", "media automation controller proof private candidate");
assertIncludes(mediaAutomationDiscoveryProof, "eligible_needs_transcode", "media automation discovery proof eligible transcode");
assertIncludes(mediaAutomationDiscoveryProof, "excluded_private", "media automation discovery proof excluded private");
assertIncludes(mediaAutomationDiscoveryProof, "private_blocked", "media automation discovery proof private block");
assertIncludes(mediaAutomationDiscoveryProof, "premium_blocked", "media automation discovery proof Premium block");
assertIncludes(mediaAutomationDiscoveryProof, "original_only_blocked", "media automation discovery proof original block");
assertIncludes(mediaAutomationDiscoveryProof, "unscanned_blocked", "media automation discovery proof unscanned block");
assertIncludes(mediaAutomationDiscoveryProof, "moderation_blocked", "media automation discovery proof moderation block");
assertIncludes(mediaAutomationBatchPolicyProof, "firstAutoBatchSize", "media automation batch policy proof first run");
assertIncludes(mediaAutomationBatchPolicyProof, "failureDropsBatchSize", "media automation batch policy proof failure reset");
assertIncludes(mediaAutomationBatchPolicyProof, "activeUnfinishedJobsBatchSize", "media automation batch policy proof active job block");
assertIncludes(mediaAutomationBatchPolicyProof, "unsafeCdnRowsBatchSize", "media automation batch policy proof unsafe row block");
assertIncludes(mediaAutomationBatchPolicyProof, "staleBackupBatchSize", "media automation batch policy proof stale backup");
assertIncludes(mediaAutomationBatchPolicyProof, "staleRestoreDrillBatchSize", "media automation batch policy proof stale restore");
assertIncludes(mediaAutomationBatchPolicyProof, "highErrorRateBatchSize", "media automation batch policy proof error rate");
assertIncludes(mediaAutomationBatchPolicyProof, "cpuPressureBatchSize", "media automation batch policy proof cpu pressure");
assertIncludes(mediaAutomationBatchPolicyProof, "manualSourceIdsRequired", "media automation batch policy proof source auto");
assertIncludes(mediaAutomationBatchPolicyProof, "manualBatchSizeRequired", "media automation batch policy proof batch auto");
assertIncludes(mediaAutomationBackfillPolicyProof, "defaultBackfillAllowed", "media automation backfill proof default disabled");
assertIncludes(mediaAutomationBackfillPolicyProof, "smallCappedAllowed", "media automation backfill proof small capped");
assertIncludes(mediaAutomationBackfillPolicyProof, "broadOwnerApprovalRequired", "media automation backfill proof broad approval");
assertIncludes(mediaAutomationQueueProcessorProof, "missing_queue_lease", "media automation queue proof lease block");
assertIncludes(mediaAutomationQueueProcessorProof, "backup_gate_not_closed", "media automation queue proof backup gate");
assertIncludes(mediaAutomationQueueProcessorProof, "kill_switch_missing", "media automation queue proof kill switch");
assertIncludes(mediaAutomationQueueProcessorProof, "unsafe_queue_item_blocked", "media automation queue proof unsafe block");
assertIncludes(mediaAutomationSchedulerTemplatesProof, "disabledByDefault", "media automation scheduler proof disabled");
assertIncludes(mediaAutomationSchedulerTemplatesProof, "cronAdded: false", "media automation scheduler proof no cron");
assertIncludes(mediaAutomationCliProof, "runAutoRequiresConfirmation", "media automation CLI proof run auto confirmation");
assertIncludes(mediaAutomationCliProof, "continuousOnceRequiresConfirmation", "media automation CLI proof continuous confirmation");
assertIncludes(mediaAutomationCliProof, "continuousOnceFailClosed", "media automation CLI proof continuous fail closed");
assertIncludes(mediaAutomationCliProof, "reportOnly", "media automation CLI proof report");
assertIncludes(mediaAutomationCliProof, "manualSourceIdsRequired", "media automation CLI proof no manual source ids");
assertIncludes(mediaAutomationCliProof, "manualBatchSizeRequired", "media automation CLI proof no manual batch size");
assertIncludes(mediaAutomationCliProof, "broadPrefixDenied", "media automation CLI proof broad rollback denied");
assertIncludes(mediaAutomationBatchPlannerProof, "oneThousandEligibleFixtureRows", "media automation batch proof scale fixture");
assertIncludes(mediaAutomationBatchPlannerProof, "mutationAttempted", "media automation batch proof no mutation");
assertIncludes(mediaAutomationBatchPlannerProof, "productionRowsWritten", "media automation batch proof no production rows");
assertIncludes(mediaAutomationBatchPlannerProof, "rollbackPlanRequired", "media automation batch proof rollback required");
assertIncludes(mediaAutomationWorkerLoopProof, "missing_worker_lease", "media automation worker proof lease block");
assertIncludes(mediaAutomationWorkerLoopProof, "autoDetectRunAllowed", "media automation worker proof auto-detect run");
assertIncludes(mediaAutomationWorkerLoopProof, "autoDetectTelemetryEvents", "media automation worker proof auto telemetry");
assertIncludes(mediaAutomationWorkerLoopProof, "auditPassResolverEligible", "media automation worker proof audit pass");
assertIncludes(mediaAutomationWorkerLoopProof, "auditFailureQuarantine", "media automation worker proof quarantine");
assertIncludes(mediaAutomationWorkerLoopProof, "resolverIgnoresPendingOrQuarantinedRows", "media automation worker proof resolver block");
assertNotMatches(mediaAutomationCli, /\b(?:supabase\.from|upsert\s*\(|delete\s*\(|createClient)\b/i, "media automation CLI must not use broad client mutation APIs");
assertIncludes(mediaAutomationCli, "linked_real_bounded_auto_batch", "media automation CLI linked bounded execution");
assertIncludes(mediaAutomationCli, "insertJobRow", "media automation CLI scoped job insert helper");
assertIncludes(mediaAutomationCli, "insertPendingRenditionRows", "media automation CLI pending rendition insert helper");
assertIncludes(mediaAutomationCli, "auditAndPromoteRows", "media automation CLI audit-gated promotion helper");
assertNotMatches(mediaAutomationController + mediaAutomationDiscovery + mediaAutomationJobs + mediaAutomationWorkerLoop + mediaAutomationBackfillPolicy + mediaAutomationQueueProcessor, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|delete\s*\(|update\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/i, "media automation helpers must not perform network or database writes");
assertNotMatches(mediaAutomationOperatorRunbook, /\b(?:continuous automation is live|worker is deployed|cron is configured|scheduler is configured|R2 logical backups? (?:are|is) true PITR)\b/i, "media automation runbook must not overclaim deployment or PITR");
assertIncludes(mediaMigrationPlan, "Status: production schema applied, with scoped audited rows from the City Lights one-job proof, bounded CLI auto-detect cycle, and protected Premium HD pass.", "trusted rendition migration plan status");
assertIncludes(mediaMigrationPlan, "Production schema migration status: applied to production on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`);", "trusted rendition migration plan production schema status");
assertIncludes(mediaMigrationPlan, "Production data/write boundary after the bounded CLI auto-detect cycle: City Lights plus four public-safe auto-detected sources have audited HLS rows, and one 320x180 source has a scoped unsupported failed-job marker with no uploaded objects or rendition rows.", "trusted rendition migration plan production data boundary");
assertIncludes(mediaMigrationPlan, "Production runtime policy proof: a rollback-only production transaction denied anon/authenticated trusted writes", "trusted rendition migration plan rollback proof");
assertIncludes(mediaMigrationPlan, "`service_role` / backend worker is the only intended writer", "trusted rendition migration plan write authority");
assertIncludes(mediaMigrationPlan, "Public CDN eligibility must never come from app/client input", "trusted rendition migration plan client trust boundary");
assertIncludes(mediaMigrationPlan, "Clients cannot mark rows ready.", "trusted rendition migration plan ready write block");
assertIncludes(mediaMigrationPlan, "Clients cannot set `public_playback_path`.", "trusted rendition migration plan public path write block");
assertIncludes(mediaMigrationPlan, "Clients cannot set `is_public_playback_safe`.", "trusted rendition migration plan public safety write block");
assertIncludes(mediaMigrationPlan, "A separate `media_renditions` table is safer", "trusted rendition migration plan separate table decision");
assertIncludes(mediaMigrationPlan, "Owner approval to apply the schema migration: complete.", "trusted rendition migration plan production activation gate");
assertIncludes(mediaMigrationPlan, "## Dry-Run Status", "trusted rendition migration plan dry-run section");
assertIncludes(mediaMigrationPlan, "`npm run proof:media-rendition-migration-dry-run`", "trusted rendition migration plan dry-run proof script");
assertIncludes(mediaMigrationPlan, "Static SQL validation passed.", "trusted rendition migration plan static dry-run status");
assertIncludes(mediaMigrationPlan, "Runtime dry-run passed in an in-memory disposable local Postgres runtime via `@electric-sql/pglite`.", "trusted rendition migration plan runtime dry-run status");
assertIncludes(mediaMigrationPlan, "Anon/authenticated client writes were denied for ready rendition inserts, trusted path/readiness/public-safe updates, and ready transcode-job inserts.", "trusted rendition migration plan client denial proof");
assertIncludes(mediaMigrationPlan, "Service-role/worker writes passed for queued job insert, `queued -> probing -> transcoding -> uploading -> ready` status updates, failed job insert, and ready public-safe rendition insert.", "trusted rendition migration plan service role proof");
assertIncludes(mediaMigrationPlan, "## Worker Runbook And Local Proof Status", "trusted rendition migration plan worker proof section");
assertIncludes(mediaMigrationPlan, "`docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` now defines the future production transcode worker design", "trusted rendition migration plan worker runbook status");
assertIncludes(mediaMigrationPlan, "`npm run proof:media-transcode-worker-local` is local proof only.", "trusted rendition migration plan local worker proof status");
assertIncludes(mediaMigrationPlan, "`npm run proof:media-transcode-worker-local` is local proof only.", "trusted rendition migration plan local worker proof status");
assertIncludes(mediaMigrationPlan, "Backup/PITR gate: Blocked for broad production worker writes/backfill/continuous activation.", "trusted rendition migration plan backup PITR gate");
assertIncludes(mediaMigrationPlan, "`pitr_enabled=false`, `walg_enabled=true`, `backups=[]`, and `physical_backup_data={}`", "trusted rendition migration plan backup PITR readback");
assertIncludes(mediaMigrationPlan, "R2 logical backup/restore gate: Closed for the completed one-job proof only.", "trusted rendition migration plan one-job backup gate");
assertIncludes(mediaTranscodeWorkerRunbook, "Status: no production worker is deployed and no queue processor is running.", "media transcode worker runbook status");
assertIncludes(mediaTranscodeWorkerRunbook, "Preferred runtime: a small container or VM worker with ffmpeg and ffprobe installed.", "media transcode worker runbook runtime");
assertIncludes(mediaTranscodeWorkerRunbook, "Supabase Edge Functions are not the primary runtime for the heavy transcode loop", "media transcode worker runbook edge limitation");
assertIncludes(mediaTranscodeWorkerRunbook, "Before probing or transcoding, the worker must verify:", "media transcode worker runbook safety checks");
assertIncludes(mediaTranscodeWorkerRunbook, "the source is not moderation-blocked", "media transcode worker runbook moderation check");
assertIncludes(mediaTranscodeWorkerRunbook, "original/master input remains private", "media transcode worker runbook original privacy");
assertIncludes(mediaTranscodeWorkerRunbook, "The worker must never mark `is_ready=true` before source probing, HLS generation, upload-path validation, manifest validation, and resolver eligibility checks pass.", "media transcode worker runbook ready-before-validation block");
assertIncludes(mediaTranscodeWorkerRunbook, "Worker secrets stay only on the worker host.", "media transcode worker runbook secret boundary");
assertIncludes(mediaTranscodeWorkerRunbook, "Public CDN eligibility comes only from backend-written trusted rows", "media transcode worker runbook trusted rows");
assertIncludes(mediaTranscodeWorkerRunbook, "disable the worker process", "media transcode worker runbook rollback");
assertIncludes(mediaTranscodeWorkerRunbook, "PITR or owner-approved backup/restore readiness is in place", "media transcode worker runbook activation PITR gate");
assertIncludes(mediaTranscodeWorkerRunbook, "Backup/PITR gate status: Blocked for broad production worker writes/backfill/continuous activation.", "media transcode worker runbook backup gate blocked");
assertIncludes(mediaTranscodeWorkerRunbook, "`pitr_enabled=false`, `walg_enabled=true`, `backups=[]`, and `physical_backup_data={}`", "media transcode worker runbook backup readback");
assertIncludes(mediaTranscodeWorkerRunbook, "Enabling PITR is a provider billing/add-on mutation and requires explicit owner approval before any change.", "media transcode worker runbook PITR billing approval");
assertIncludes(mediaTranscodeWorkerRunbook, "No broad production worker writes or backfill while the backup/PITR gate is Blocked or Partial.", "media transcode worker runbook no-write backup gate");
assertIncludes(mediaTranscodeWorkerRunbook, "Before worker activation, run a restore readiness drill or document an owner-approved restore method with the restore window", "media transcode worker runbook restore drill");
assertIncludes(mediaTranscodeWorkerRunbook, "`npm run proof:media-transcode-worker-local` is the current worker proof.", "media transcode worker runbook local proof");
assertIncludes(mediaTranscodeWorkerRunbook, "The local proof harness does not connect to the production database, does not write production rows, does not upload private/original/Premium media, does not deploy a worker, and does not switch production playback.", "media transcode worker runbook local proof no production writes");
assertIncludes(trustedRenditionMigration, 'create table if not exists public."media_transcode_jobs"', "trusted rendition draft migration jobs table");
assertIncludes(trustedRenditionMigration, 'create table if not exists public."media_renditions"', "trusted rendition draft migration renditions table");
assertIncludes(trustedRenditionMigration, 'alter table public."media_transcode_jobs" enable row level security;', "trusted rendition draft migration jobs RLS");
assertIncludes(trustedRenditionMigration, 'alter table public."media_renditions" enable row level security;', "trusted rendition draft migration renditions RLS");
assertIncludes(trustedRenditionMigration, 'grant all on table public."media_transcode_jobs" to "service_role";', "trusted rendition draft migration jobs service role grant");
assertIncludes(trustedRenditionMigration, 'grant all on table public."media_renditions" to "service_role";', "trusted rendition draft migration renditions service role grant");
assertIncludes(trustedRenditionMigration, "media_transcode_jobs_no_direct_client_insert", "trusted rendition draft migration jobs client insert block");
assertIncludes(trustedRenditionMigration, "media_transcode_jobs_no_direct_client_update", "trusted rendition draft migration jobs client update block");
assertIncludes(trustedRenditionMigration, "media_renditions_no_direct_client_insert", "trusted rendition draft migration renditions client insert block");
assertIncludes(trustedRenditionMigration, "media_renditions_no_direct_client_update", "trusted rendition draft migration renditions client update block");
assertIncludes(trustedRenditionMigration, 'constraint "media_renditions_original_private_check"', "trusted rendition draft migration original private constraint");
assertIncludes(trustedRenditionMigration, 'constraint "media_renditions_hd_not_public_free_check"', "trusted rendition draft migration HD public/free constraint");
assertIncludes(trustedRenditionMigration, 'constraint "media_renditions_ready_requires_worker_proof_check"', "trusted rendition draft migration ready worker proof constraint");
assertIncludes(trustedRenditionMigration, 'constraint "media_renditions_public_cdn_safety_check"', "trusted rendition draft migration public CDN safety constraint");
assertIncludes(trustedRenditionMigration, '"is_ready" = true', "trusted rendition draft migration public CDN ready requirement");
assertIncludes(trustedRenditionMigration, '"is_public_playback_safe" = true', "trusted rendition draft migration public CDN safety requirement");
assertIncludes(trustedRenditionMigration, '"bucket_role" = \'public_playback\'', "trusted rendition draft migration public bucket role requirement");
assertIncludes(trustedRenditionMigration, '"scan_status" in (\'clean\', \'approved\')', "trusted rendition draft migration scan-safe requirement");
assertIncludes(trustedRenditionMigration, '"moderation_status" in (\'clean\', \'approved\', \'allowed\')', "trusted rendition draft migration moderation-safe requirement");
assertIncludes(trustedRenditionMigration, '"public_playback_path" like \'playback/public/%\'', "trusted rendition draft migration public prefix requirement");
assertIncludes(trustedRenditionMigration, 'originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned', "trusted rendition draft migration forbidden prefix guard");
assertNotMatches(trustedRenditionMigration, /\bgrant\s+(insert|update|delete|all)\b[^;]*\bto\s+"?(anon|authenticated)"?/i, "trusted rendition draft migration must not grant client writes");
assertIncludes(vodQuality, "resolveMediaPlaybackDelivery", "VOD helper uses staged media delivery resolver");
assertIncludes(vodQuality, "publicPlaybackSafe: false", "production VOD defaults to signed origin fallback");
assertIncludes(migration, '"quality_label" <> \'original\'', "resolver original exclusion");
assertIncludes(migration, "\"quality_label\" not in ('720p', '1080p')", "HD premium constraint");
assertIncludes(migration, '"access_tier" = \'premium\' and v_has_premium', "resolver Premium entitlement check");
assertIncludes(migration, "public.user_has_active_entitlement(v_viewer_id::text, array['premium'::text])", "resolver entitlement source");
assertIncludes(mediaStorageFunction, "rendition.qualityLabel === \"original\"", "media-storage original guard");
assertIncludes(mediaStorageFunction, 'actorClient.rpc("monetization_has_active_premium"', "media-storage exact Premium rendition guard");
const creatorVideoDownloadGate = mediaStorageFunction.slice(
  mediaStorageFunction.indexOf("const canReadCreatorVideo = async ("),
  mediaStorageFunction.indexOf("const canDeleteCreatorVideo = async ("),
);
const creatorVideoCommerceAuthorityIndex = creatorVideoDownloadGate.indexOf(
  "await resolveCreatorContentAccess(",
);
const creatorVideoParentAuthorityIndex = creatorVideoDownloadGate.indexOf(
  "await readCreatorVideoParentAuthority(",
);
const privilegedCreatorVideoRenditionReadIndex = creatorVideoDownloadGate.indexOf(
  "await canReadCreatorVideoRendition(",
);
const privilegedCreatorVideoSourceReadIndex = creatorVideoDownloadGate.indexOf(
  "await readCreatorVideoForObject(",
);
if (
  creatorVideoCommerceAuthorityIndex < 0
  || creatorVideoParentAuthorityIndex <= creatorVideoCommerceAuthorityIndex
  || privilegedCreatorVideoRenditionReadIndex <= creatorVideoParentAuthorityIndex
  || privilegedCreatorVideoSourceReadIndex <= creatorVideoParentAuthorityIndex
) {
  fail("media-storage must resolve exact creator-video commerce and safe parent authority before privileged source or rendition lookup");
}

assertIncludes(player, "readCreatorVideoForPlayer(routeId)", "Player creator-video resolver path");
assertIncludes(player, "setPlaybackSourceKind(\"creator-video\")", "Player creator-video source kind");
assertIncludes(player, "setItem(buildCreatorPlayerTitle(video))", "Player creator-video title source");
assertIncludes(player, "if (displayItem?.video_url && displayItem.video_url.trim()) return { uri: displayItem.video_url.trim() };", "Player remote video URL source contract");
assertIncludes(player, "source={playbackSource}", "Player native Video receives playbackSource");
assertIncludes(player, "onPlaybackStatusUpdate={onPlaybackStatusUpdate}", "Player playback progress callback");
assertIncludes(player, "onLoad={onVideoLoad}", "Player video load callback");
assertIncludes(player, "setIsVideoReady(true)", "Player load status sets ready state");
assertIncludes(player, "setDurationMillis(duration)", "Player load/progress status records duration");
assertIncludes(player, "setPositionMillis(position)", "Player progress status records position");
assertNotIncludes(player, "createSignedMediaDownload", "Player direct media signing bypass");
assertNotIncludes(player, "_lib/mediaStorage", "Player direct media storage bypass");
assertNotIncludes(player, "supabase.storage", "Player direct Supabase storage bypass");
assertIncludes(creatorVideos, "resolveSignedVideoPlaybackSource", "creator video resolver closure");
assertIncludes(creatorVideos, "legacyQualityEnforcement === \"resolver_unavailable\"", "legacy fallback truth boundary");
assertIncludes(watchPartyContentSources, "readCreatorVideoForPlayer(sourceId)", "Watch-Party creator-video resolver path");

assertIncludes(mediaStorageFunction, "s3Provider.toLowerCase() !== \"hetzner\"", "current Hetzner launch gate");
assertIncludes(mediaStorageFunction, "createPresignedS3Url", "current direct signed S3 path");
assertIncludes(mediaStorage, "FileSystem.uploadAsync", "current single PUT upload path");

assertIncludes(packageJson, "\"guard:media-delivery-architecture\"", "package guard script");
assertIncludes(packageJson, "\"proof:media-delivery-resolver\"", "package proof script");
assertIncludes(packageJson, "\"proof:media-delivery-public-demo\"", "package public demo proof script");
assertIncludes(packageJson, "\"proof:media-delivery-real-demo\"", "package real demo proof script");
assertIncludes(packageJson, "\"proof:media-delivery-hls-demo\"", "package HLS demo proof script");
assertIncludes(packageJson, "\"proof:media-delivery-telemetry\"", "package telemetry proof script");
assertIncludes(packageJson, "\"proof:media-transcode-queue-hls\"", "package transcode queue HLS proof script");
assertIncludes(packageJson, "\"proof:media-transcode-worker-local\"", "package local transcode worker proof script");
assertIncludes(packageJson, "\"proof:media-transcode-backup-gate\"", "package backup PITR proof script");
assertIncludes(packageJson, "\"proof:media-rendition-metadata\"", "package trusted rendition metadata proof script");
assertIncludes(packageJson, "\"proof:media-playback-cdn-eligibility\"", "package trusted playback CDN eligibility proof script");
assertIncludes(packageJson, "\"proof:media-premium-cdn-token\"", "package Premium CDN token proof script");
assertIncludes(packageJson, "\"proof:premium-cdn-worker\"", "package Premium CDN Worker proof script");
assertIncludes(packageJson, "\"proof:premium-cdn-worker-live\"", "package Premium CDN Worker live proof script");
assertIncludes(packageJson, "\"proof:premium-hd-token-issuer\"", "package Premium HD token issuer proof script");
assertIncludes(packageJson, "\"proof:media-premium-hd-renditions\"", "package Premium HD renditions proof script");
assertIncludes(packageJson, "\"proof:media-premium-hd-resolver\"", "package Premium HD resolver proof script");
assertIncludes(packageJson, "\"proof:media-cdn-rollout-planner\"", "package media CDN rollout planner proof script");
assertIncludes(packageJson, "\"media-cdn:plan\"", "package media CDN rollout planner command");
assertIncludes(packageJson, "\"media-cdn:status\"", "package media CDN rollout status command");
assertIncludes(packageJson, "\"proof:media-rendition-migration-policy\"", "package trusted rendition migration policy proof script");
assertIncludes(packageJson, "\"proof:media-rendition-migration-dry-run\"", "package trusted rendition migration dry-run proof script");
assertIncludes(mediaDeliveryResolverProof, "playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4", "media delivery resolver proof demo path");
assertIncludes(mediaDeliveryResolverProof, "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4", "media delivery resolver proof real demo path");
assertIncludes(mediaDeliveryResolverProof, "cdnAllowedPublicPlaybackPaths", "media delivery resolver proof real demo allowlist");
assertIncludes(mediaDeliveryResolverProof, "not_in_public_playback_allowlist", "media delivery resolver proof allowlist block");
assertIncludes(mediaDeliveryResolverProof, "default creator-video source path should keep signed origin fallback", "media delivery resolver proof production fallback");
assertIncludes(mediaDeliveryPublicDemoProof, "playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4", "public demo media delivery proof path");
assertIncludes(mediaDeliveryPublicDemoProof, "allowedDemoProofPaths", "public demo media delivery allowlist");
assertIncludes(mediaDeliveryPublicDemoProof, "appPlaybackProof", "public demo app playback proof summary");
assertIncludes(mediaDeliveryPublicDemoProof, "productionPlaybackSwitched: false", "public demo app playback no production switch");
assertIncludes(mediaDeliveryPublicDemoProof, "decodedFrameCount", "public demo app playback decoded frame count");
assertIncludes(mediaDeliveryPublicDemoProof, "ffprobe", "public demo media delivery proof ffprobe");
assertIncludes(mediaDeliveryPublicDemoProof, "ffmpeg", "public demo media delivery proof ffmpeg");
assertIncludes(mediaDeliveryPublicDemoProof, "default production creator-video path", "public demo media delivery production fallback");
assertIncludes(mediaDeliveryRealDemoProof, "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1", "real demo media delivery video id");
assertIncludes(mediaDeliveryRealDemoProof, "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4", "real demo media delivery proof path");
assertIncludes(mediaDeliveryRealDemoProof, "cdnAllowedPublicPlaybackPaths", "real demo media delivery allowlist");
assertIncludes(mediaDeliveryRealDemoProof, "not_in_public_playback_allowlist", "real demo media delivery allowlist block");
assertIncludes(mediaDeliveryRealDemoProof, "productionPlaybackSwitched: false", "real demo media delivery no production switch");
assertIncludes(mediaDeliveryRealDemoProof, "decodedFrameCount", "real demo media delivery decoded frame count");
assertIncludes(mediaDeliveryRealDemoProof, "ffprobe", "real demo media delivery ffprobe");
assertIncludes(mediaDeliveryRealDemoProof, "ffmpeg", "real demo media delivery ffmpeg");
assertIncludes(mediaDeliveryRealDemoProof, "default production creator-video path", "real demo media delivery production fallback");
assertIncludes(mediaDeliveryHlsDemoProof, "playback/public/demo/chillywood-city-lights/hls/", "HLS demo media delivery proof path");
assertIncludes(mediaDeliveryHlsDemoProof, "v1-b670602fa00934ca-hls", "HLS demo media delivery proof version");
assertIncludes(mediaDeliveryHlsDemoProof, "master.m3u8", "HLS demo media delivery master manifest");
assertIncludes(mediaDeliveryHlsDemoProof, "360p", "HLS demo media delivery 360p rendition");
assertIncludes(mediaDeliveryHlsDemoProof, "480p", "HLS demo media delivery 480p rendition");
assertIncludes(mediaDeliveryHlsDemoProof, "wrangler", "HLS demo media delivery proof uploads through Wrangler");
assertIncludes(mediaDeliveryHlsDemoProof, "cfCacheStatus === \"HIT\"", "HLS demo media delivery segment cache HIT proof");
assertIncludes(mediaDeliveryHlsDemoProof, "productionPlaybackSwitched: false", "HLS demo media delivery no production switch");
assertIncludes(mediaDeliveryHlsDemoProof, "productionHlsTranscodingLive: false", "HLS demo media delivery no production HLS claim");
assertIncludes(mediaDeliveryHlsDemoProof, "cdnAllowedPublicPlaybackPaths: [hlsMasterPath]", "HLS demo media delivery master allowlist");
assertIncludes(mediaDeliveryHlsDemoProof, "not_in_public_playback_allowlist", "HLS demo media delivery allowlist block");
assertIncludes(mediaDeliveryHlsDemoProof, "segments should not be independently resolver-returned under HLS proof config", "HLS demo media delivery segment resolver fallback");
assertIncludes(mediaDeliveryHlsDemoProof, "assertAppPlayerHlsSourceContract", "HLS demo app/player source contract proof");
assertIncludes(mediaDeliveryHlsDemoProof, "proof-only-app-player-hls-harness", "HLS demo app/player proof-only harness");
assertIncludes(mediaDeliveryHlsDemoProof, "displayItem.video_url -> { uri } -> Video source", "HLS demo app/player source shape");
assertIncludes(mediaDeliveryHlsDemoProof, "playerReceivesHlsUrl", "HLS demo app/player receives HLS URL proof");
assertIncludes(mediaDeliveryHlsDemoProof, "onLoadObserved", "HLS demo app/player load proof");
assertIncludes(mediaDeliveryHlsDemoProof, "progressObserved", "HLS demo app/player progress proof");
assertIncludes(mediaDeliveryHlsDemoProof, "playbackStarted", "HLS demo app/player playback start proof");
assertIncludes(mediaDeliveryHlsDemoProof, "privateSignedOriginUrlExposed", "HLS demo app/player signed URL exposure guard");
assertIncludes(mediaDeliveryHlsDemoProof, "fetchForbiddenPublicPrefixProbes", "HLS demo forbidden public prefix probes");
assertIncludes(mediaDeliveryHlsDemoProof, "original_or_master_blocked", "HLS demo original/master block proof");
assertIncludes(mediaDeliveryHlsDemoProof, "premium_requires_token_cdn", "HLS demo Premium block proof");
assertIncludes(mediaDeliveryHlsDemoProof, "unscanned_blocked", "HLS demo unscanned block proof");
assertIncludes(mediaDeliveryHlsDemoProof, "moderation_blocked", "HLS demo moderation block proof");
assertIncludes(mediaDeliveryTelemetryProof, "buildMediaDeliveryEvent", "media delivery telemetry proof event builder");
assertIncludes(mediaDeliveryTelemetryProof, "buildMediaPlaybackSessionStart", "media delivery telemetry proof session start");
assertIncludes(mediaDeliveryTelemetryProof, "buildMediaPlaybackSessionEnd", "media delivery telemetry proof session end");
assertIncludes(mediaDeliveryTelemetryProof, "estimatePlaybackBytes", "media delivery telemetry proof byte estimator");
assertIncludes(mediaDeliveryTelemetryProof, "sanitizeMediaDeliveryTelemetryForProof", "media delivery telemetry proof sanitizer");
assertIncludes(mediaDeliveryTelemetryProof, "productionTelemetryWritesLive: false", "media delivery telemetry proof no production writes");
assertIncludes(mediaDeliveryTelemetryProof, "backendWritesImplemented: false", "media delivery telemetry proof no backend writes");
assertIncludes(mediaDeliveryTelemetryProof, "tablesCreated: false", "media delivery telemetry proof no table migration");
assertIncludes(mediaDeliveryTelemetryProof, "assertNoRawPrivateProofText", "media delivery telemetry proof raw identifier guard");
assertIncludes(mediaDeliveryTelemetryProof, "assertNoFullUrlFields", "media delivery telemetry proof no full URL guard");
assertIncludes(mediaDeliveryTelemetryProof, "redacted:user", "media delivery telemetry proof user redaction");
assertIncludes(mediaDeliveryTelemetryProof, "redacted:creator", "media delivery telemetry proof creator redaction");
assertIncludes(mediaDeliveryTelemetryProof, "redacted:watch_party", "media delivery telemetry proof Watch-Party redaction");
assertIncludes(mediaDeliveryTelemetryProof, "premium_requires_token_cdn", "media delivery telemetry proof blocked Premium/private path");
assertIncludes(mediaDeliveryTelemetryProof, "cloudflare_r2_custom_domain", "media delivery telemetry proof CDN demo provider");
assertIncludes(mediaDeliveryTelemetryProof, "origin_signed_direct", "media delivery telemetry proof signed-origin fallback provider");
assertIncludes(mediaTranscodeQueueProof, "proof-only-transcode-queue-hls", "media transcode queue HLS proof mode");
assertIncludes(mediaTranscodeQueueProof, "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4", "media transcode queue HLS proof approved source");
assertIncludes(mediaTranscodeQueueProof, "source demo MP4 hash should match approved City Lights proof object", "media transcode queue HLS proof source hash guard");
assertIncludes(mediaTranscodeQueueProof, "playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls", "media transcode queue HLS proof public output prefix");
assertIncludes(mediaTranscodeQueueProof, "360p", "media transcode queue HLS proof 360p rendition");
assertIncludes(mediaTranscodeQueueProof, "480p", "media transcode queue HLS proof 480p rendition");
assertIncludes(mediaTranscodeQueueProof, "wrangler", "media transcode queue HLS proof uploads through Wrangler");
assertIncludes(mediaTranscodeQueueProof, "proof worker upload key must stay under playback/public/", "media transcode queue HLS proof public upload guard");
assertIncludes(mediaTranscodeQueueProof, "proof worker upload key must not use private/original/Premium prefixes", "media transcode queue HLS proof forbidden prefix guard");
assertIncludes(mediaTranscodeQueueProof, "assertNoSignedOrSecretUrl", "media transcode queue HLS manifest signed URL guard");
assertIncludes(mediaTranscodeQueueProof, "canResolveCompletedProofTranscodeJob", "media transcode queue HLS completed-job resolver gate");
assertIncludes(mediaTranscodeQueueProof, "completedProofJobGate", "media transcode queue HLS completed-job proof");
assertIncludes(mediaTranscodeQueueProof, "queuedProofJobGate", "media transcode queue HLS queued-job block proof");
assertIncludes(mediaTranscodeQueueProof, "failedProofJobGate", "media transcode queue HLS failed-job block proof");
assertIncludes(mediaTranscodeQueueProof, "not_in_public_playback_allowlist", "media transcode queue HLS non-allowlisted resolver block");
assertIncludes(mediaTranscodeQueueProof, "original_or_master_blocked", "media transcode queue HLS original/master block proof");
assertIncludes(mediaTranscodeQueueProof, "premium_requires_token_cdn", "media transcode queue HLS Premium block proof");
assertIncludes(mediaTranscodeQueueProof, "unscanned_blocked", "media transcode queue HLS unscanned block proof");
assertIncludes(mediaTranscodeQueueProof, "moderation_blocked", "media transcode queue HLS moderation block proof");
assertIncludes(mediaTranscodeQueueProof, "deliveryFormat: \"hls\"", "media transcode queue HLS telemetry delivery format");
assertIncludes(mediaTranscodeQueueProof, "productionTelemetryWritesLive: false", "media transcode queue HLS no production telemetry writes");
assertIncludes(mediaTranscodeQueueProof, "productionDbWritesEnabled: false", "media transcode queue HLS no production DB writes");
assertIncludes(mediaTranscodeQueueProof, "productionTranscodeServiceLive: false", "media transcode queue HLS no production transcode claim");
assertIncludes(mediaTranscodeQueueProof, "productionPlaybackSwitched: false", "media transcode queue HLS no production playback switch");
assertIncludes(mediaTranscodeQueueProof, "ffmpeg proof queue HLS master decode", "media transcode queue HLS ffmpeg decode proof");
assertIncludes(mediaTranscodeQueueProof, "proof queue segment should prove cf-cache-status HIT after narrow proof-transcode cache rule", "media transcode queue HLS segment cache HIT assertion");
assertIncludes(mediaTranscodeQueueProof, "queueSegmentCacheHitObserved", "media transcode queue HLS explicit queue cache HIT observation field");
assertIncludes(mediaTranscodeQueueProof, "segmentCacheHitObserved", "media transcode queue HLS cache observation field");
assertIncludes(mediaTranscodeQueueProof, "cfCacheStatus", "media transcode queue HLS cache status capture");
assertNotMatches(mediaTranscodeQueueProof, /\bsupabase\.from\b|\bcreateClient\b/i, "media transcode queue HLS proof must not write production DB or create a Supabase client");
assertIncludes(mediaTranscodeWorkerLocalProof, "media-transcode-worker-local", "local transcode worker proof mode");
assertIncludes(mediaTranscodeWorkerLocalProof, "local-transcode-worker-proof", "local transcode worker proof marker");
assertIncludes(mediaTranscodeWorkerLocalProof, "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4", "local transcode worker approved source");
assertIncludes(mediaTranscodeWorkerLocalProof, "playback/public/proof-worker/chillywood-city-lights/v1-b670602fa00934ca-local-hls", "local transcode worker proof output prefix");
assertIncludes(mediaTranscodeWorkerLocalProof, "local worker source hash should match approved City Lights proof object", "local transcode worker source hash guard");
assertIncludes(mediaTranscodeWorkerLocalProof, "statusHistory", "local transcode worker status proof history");
assertIncludes(mediaTranscodeWorkerLocalProof, "proof worker upload key must stay under playback/public/", "local transcode worker public upload-key guard");
assertIncludes(mediaTranscodeWorkerLocalProof, "proof worker upload key must not use private/original/Premium prefixes", "local transcode worker forbidden prefix guard");
assertIncludes(mediaTranscodeWorkerLocalProof, "canResolveCompletedProofTranscodeJob", "local transcode worker completed-job resolver gate");
assertIncludes(mediaTranscodeWorkerLocalProof, "failed local worker proof job cannot produce ready rendition rows", "local transcode worker failed-job block proof");
assertIncludes(mediaTranscodeWorkerLocalProof, "buildMediaDeliveryAssetFromTrustedRendition", "local transcode worker trusted row resolver bridge");
assertIncludes(mediaTranscodeWorkerLocalProof, "buildMediaDeliveryEvent", "local transcode worker telemetry event builder");
assertIncludes(mediaTranscodeWorkerLocalProof, "pglite_disposable_local", "local transcode worker disposable DB proof");
assertIncludes(mediaTranscodeWorkerLocalProof, "clientWriteDenied", "local transcode worker client write denial field");
assertIncludes(mediaTranscodeWorkerLocalProof, "serviceRoleWorkerWritePassed", "local transcode worker service role proof field");
assertIncludes(mediaTranscodeWorkerLocalProof, "resolverSafeSelectPassed", "local transcode worker resolver-safe select field");
assertIncludes(mediaTranscodeWorkerLocalProof, "productionWorkerDeployed: false", "local transcode worker no production worker deploy");
assertIncludes(mediaTranscodeWorkerLocalProof, "productionQueueProcessorRun: false", "local transcode worker no production queue run");
assertIncludes(mediaTranscodeWorkerLocalProof, "productionDbWritesEnabled: false", "local transcode worker no production DB writes");
assertIncludes(mediaTranscodeWorkerLocalProof, "productionRowsWritten: false", "local transcode worker no production rows");
assertIncludes(mediaTranscodeWorkerLocalProof, "productionBackfillRun: false", "local transcode worker no production backfill");
assertIncludes(mediaTranscodeWorkerLocalProof, "productionPlaybackSwitched: false", "local transcode worker no production playback switch");
assertIncludes(mediaTranscodeWorkerLocalProof, "pitrBackupGateRequired: true", "local transcode worker PITR gate field");
assertNotMatches(mediaTranscodeWorkerLocalProof, /\bsupabase\.from\b|\bcreateClient\b|\bwrangler\b/i, "local transcode worker proof must not write production DB, create Supabase client, or upload through Wrangler");
assertIncludes(mediaTranscodeBackupGateProof, "media-transcode-backup-gate", "backup PITR proof mode");
assertIncludes(mediaTranscodeBackupGateProof, "Backup/PITR gate status: Blocked for broad production worker writes/backfill/continuous activation.", "backup PITR proof blocked docs assertion");
assertIncludes(mediaTranscodeBackupGateProof, "`pitr_enabled=false`", "backup PITR proof PITR disabled assertion");
assertIncludes(mediaTranscodeBackupGateProof, "`walg_enabled=true`", "backup PITR proof WAL-G assertion");
assertIncludes(mediaTranscodeBackupGateProof, "`backups=[]`", "backup PITR proof empty backup assertion");
assertIncludes(mediaTranscodeBackupGateProof, "`physical_backup_data={}`", "backup PITR proof empty physical backup assertion");
assertIncludes(mediaTranscodeBackupGateProof, "pitrPaidAddonsAvailable", "backup PITR proof paid add-ons field");
assertIncludes(mediaTranscodeBackupGateProof, "enablingPitrRequiresBillingApproval: true", "backup PITR proof billing approval field");
assertIncludes(mediaTranscodeBackupGateProof, "backupGateClassification: \"blocked\"", "backup PITR proof blocked classification field");
assertIncludes(mediaTranscodeBackupGateProof, "productionWorkerDeployed: false", "backup PITR proof no production worker");
assertIncludes(mediaTranscodeBackupGateProof, "productionQueueProcessorRun: false", "backup PITR proof no queue processor");
assertIncludes(mediaTranscodeBackupGateProof, "productionDbWritesEnabled: false", "backup PITR proof no DB writes");
assertIncludes(mediaTranscodeBackupGateProof, "productionPlaybackSwitched: false", "backup PITR proof no playback switch");
assertIncludes(mediaTranscodeBackupGateProof, "providerMutationPerformed: false", "backup PITR proof no provider mutation");
assertIncludes(mediaTranscodeBackupGateProof, "noSecretsPrinted: true", "backup PITR proof no secrets field");
assertNotMatches(mediaTranscodeBackupGateProof, /\bsupabase\.from\b|\bcreateClient\b|\bfetch\s*\(|\bexecute_sql\b|\bapply_migration\b/i, "backup PITR proof must not contact or mutate production DB/provider");

assertIncludes(packageJson, "\"proof:media-recovery-backup-restore\"", "package R2 logical backup/restore proof script");
assertIncludes(packageJson, "\"proof:media-worker-rollback-drill\"", "package media worker rollback drill proof script");
assertIncludes(mediaRecoveryBackupRestoreProof, "media-recovery-backup-restore", "R2 logical backup/restore proof mode");
assertIncludes(mediaRecoveryBackupRestoreProof, "chillywood-media-proof", "R2 logical backup private bucket");
assertIncludes(mediaRecoveryBackupRestoreProof, "chillywood-media-public-playback-proof", "R2 logical backup public bucket probe");
assertIncludes(mediaRecoveryBackupRestoreProof, "backups/media-worker/", "R2 logical backup private prefix");
assertIncludes(mediaRecoveryBackupRestoreProof, "logicalBackupNotPitr: true", "R2 logical backup not PITR field");
assertIncludes(mediaRecoveryBackupRestoreProof, "publicBucketUsed: false", "R2 logical backup public bucket false field");
assertIncludes(mediaRecoveryBackupRestoreProof, "productionRowsWritten: false", "R2 logical backup no production writes");
assertIncludes(mediaRecoveryBackupRestoreProof, "restoreDrillPassed", "R2 logical backup restore drill field");
assertIncludes(mediaRecoveryBackupRestoreProof, "continuousAutomationGateStatus", "R2 logical backup continuous gate field");
assertIncludes(mediaRecoveryBackupRestoreProof, "blocked_pitr_required", "R2 logical backup continuous PITR block");
assertIncludes(mediaRecoveryBackupRestoreProof, "media.chillywoodstream.com", "R2 logical backup public media-domain probe");
assertIncludes(mediaWorkerRollbackDrillProof, "media-worker-rollback-drill", "media worker rollback drill proof mode");
assertIncludes(mediaWorkerRollbackDrillProof, "playback/public/proof-rollback/", "media worker rollback proof prefix");
assertIncludes(mediaWorkerRollbackDrillProof, "broadPrefixDenied", "media worker rollback broad prefix denial");
assertIncludes(mediaWorkerRollbackDrillProof, "privatePremiumOriginalDenied", "media worker rollback private Premium original denial");
assertIncludes(mediaWorkerRollbackDrillProof, "realR2ObjectsDeleted: false", "media worker rollback does not delete real R2 objects");
assertNotMatches(mediaRecoveryBackupRestoreProof, /putR2Object\(\s*(?:publicPlaybackBucket|"chillywood-media-public-playback-proof")|media\.chillywoodstream\.com\/backups\/media-worker/i, "backup restore proof must not upload backups to public bucket or public media domain");
assertNotMatches(mediaRecoveryBackupRestoreProof, /\bproductionRowsWritten:\s*true\b|\bproductionPlaybackSwitched:\s*true\b/i, "backup restore proof must not write production rows or switch playback");
assertNotMatches(mediaWorkerRollbackDrillProof, /\br2\s+object\s+delete\b|\bwrangler\b[^]*\bdelete\b/i, "rollback drill must not delete real R2 objects");

assertNotMatches(mediaStatusCorpus, /\bBackup\/PITR gate status:\s*(?:Closed|Complete|Ready)\b/, "media status docs must not close backup gate while readback is blocked");
assertNotMatches(mediaStatusCorpus, /\bPITR (?:is )?enabled\b/i, "media status docs must not claim PITR enabled while readback is disabled");
const productionWorkerLiveClaims = claimSentences(
  mediaStatusCorpus,
  /\bproduction transcode worker\b/i,
  /\b(live|deployed|running|ready)\b/i,
);
if (productionWorkerLiveClaims.length) {
  fail(`media status docs must not claim production worker live while backup gate is blocked: ${productionWorkerLiveClaims.join(" | ")}`);
}
assertNotMatches(mediaStatusCorpus, /\bcontinuous automation (?:is )?(?:closed|ready|safe)\b/i, "media status docs must not close continuous automation with one-job logical backup only");
assertNotMatches(mediaStatusCorpus, /\blogical backup (?:is|equals|replaces) (?:true )?PITR\b/i, "media status docs must not claim logical backup is true PITR");
assertIncludes(mediaTranscodeOperator, "MediaTranscodeOperatorMode", "media transcode operator mode type");
assertIncludes(mediaTranscodeOperator, "| \"disabled\"", "media transcode operator disabled mode");
assertIncludes(mediaTranscodeOperator, "| \"dry_run\"", "media transcode operator dry-run mode");
assertIncludes(mediaTranscodeOperator, "| \"one_job\"", "media transcode operator one-job mode");
assertIncludes(mediaTranscodeOperator, "| \"continuous\"", "media transcode operator continuous mode");
assertIncludes(mediaTranscodeOperator, "MediaTranscodeOperatorState", "media transcode operator state type");
assertIncludes(mediaTranscodeOperator, "| \"emergency_stop\"", "media transcode operator emergency stop state");
assertIncludes(mediaTranscodeOperator, "MEDIA_TRANSCODE_OPERATOR_DEFAULT_MODE: MediaTranscodeOperatorMode = \"disabled\"", "media transcode operator disabled default");
assertIncludes(mediaTranscodeOperator, "emergency_stop_always_blocks", "media transcode operator emergency stop wins");
assertIncludes(mediaTranscodeOperator, "worker_cannot_self_enable", "media transcode operator worker self-enable block");
assertIncludes(mediaTranscodeOperator, "dry_run_plan_only_no_writes", "media transcode operator dry-run no writes");
assertIncludes(mediaTranscodeOperator, "one_job_requires_source_allowlist", "media transcode operator one-job source allowlist");
assertIncludes(mediaTranscodeOperator, "one_job_requires_max_jobs_per_run_one", "media transcode operator one-job max jobs");
assertIncludes(mediaTranscodeOperator, "one_job_requires_backfill_disabled", "media transcode operator backfill block");
assertIncludes(mediaTranscodeOperator, "one_job_requires_backup_gate_or_owner_override", "media transcode operator one-job backup/override gate");
assertIncludes(mediaTranscodeOperator, "continuous_requires_backup_gate_closed", "media transcode operator continuous backup gate");
assertIncludes(mediaTranscodeOperator, "backup_gate_not_closed_for_continuous", "media transcode operator continuous blocked reason");
assertIncludes(mediaTranscodeOperator, "MEDIA_TRANSCODE_OPERATOR_PENDING_AUDIT_STATUS", "media transcode operator pending-audit status");
assertIncludes(mediaTranscodeOperator, "resolveOperatorAutoDisable", "media transcode operator auto-disable helper");
assertIncludes(mediaTranscodeWorkerSafety, "resolveTranscodeWorkerActivation", "media transcode worker safety activation helper");
assertIncludes(mediaTranscodeWorkerSafety, "requestTranscodeWorkerLease", "media transcode worker safety lease request helper");
assertIncludes(mediaTranscodeWorkerSafety, "validateTranscodeWorkerLease", "media transcode worker safety lease validation helper");
assertIncludes(mediaTranscodeWorkerSafety, "missing_operator_lease", "media transcode worker safety no-lease block");
assertIncludes(mediaTranscodeWorkerSafety, "lease_source_mismatch", "media transcode worker safety source mismatch block");
assertIncludes(mediaTranscodeWorkerSafety, "lease_expired_or_job_stalled", "media transcode worker safety lease expiry block");
assertIncludes(mediaTranscodeWorkerSafety, "max_job_count_exceeded", "media transcode worker safety max job block");
assertIncludes(mediaTranscodeWorkerSafety, "canWorkerWriteRenditionStatus", "media transcode worker safety pending audit writer helper");
assertIncludes(mediaTranscodeWorkerSafety, "status === MEDIA_TRANSCODE_OPERATOR_PENDING_AUDIT_STATUS", "media transcode worker safety pending-audit-only writes");
assertIncludes(mediaTranscodeWorkerSafety, "canResolverTrustWorkerWrittenRows", "media transcode worker safety resolver trust helper");
assertIncludes(mediaTranscodeWorkerSafety, "quarantineTranscodeWorkerBatch", "media transcode worker safety quarantine helper");
assertIncludes(mediaRecoveryOperator, "auditMediaRecoveryBatch", "media recovery operator audit helper");
assertIncludes(mediaRecoveryOperator, "batch_id", "media recovery operator batch id");
assertIncludes(mediaRecoveryOperator, "source_id_mismatch", "media recovery operator source mismatch proof");
assertIncludes(mediaRecoveryOperator, "row_count_mismatch", "media recovery operator row count proof");
assertIncludes(mediaRecoveryOperator, "unexpected_ready_row_before_audit", "media recovery operator ready-before-audit block");
assertIncludes(mediaRecoveryOperator, "original_or_master_public_playback_blocked", "media recovery operator original/master block");
assertIncludes(mediaRecoveryOperator, "premium_or_private_public_playback_blocked", "media recovery operator Premium/private block");
assertIncludes(mediaRecoveryOperator, "non_public_playback_prefix", "media recovery operator public prefix block");
assertIncludes(mediaRecoveryOperator, "outside_exact_r2_prefix", "media recovery operator exact prefix block");
assertIncludes(mediaRecoveryOperator, "canResolverTrustAuditedRows", "media recovery operator resolver trust helper");
assertIncludes(mediaRecoveryOperator, "buildMediaRecoveryRollbackPlan", "media recovery operator rollback plan helper");
assertIncludes(mediaRecoveryOperator, "buildMediaRecoveryBackupManifest", "media recovery operator backup manifest helper");
assertIncludes(mediaRecoveryOperator, "verifyMediaRecoveryBackupManifest", "media recovery operator backup manifest verifier");
assertIncludes(mediaRecoveryOperator, "resolveMediaWorkerBackupGate", "media recovery operator backup gate helper");
assertIncludes(mediaRecoveryOperator, "buildMediaWorkerRestoreDrillResult", "media recovery operator restore drill helper");
assertIncludes(mediaRecoveryOperator, "buildMediaWorkerRollbackPlan", "media recovery operator scoped worker rollback helper");
assertIncludes(mediaRecoveryOperator, "sanitizeMediaRecoveryProof", "media recovery operator proof sanitizer");
assertIncludes(mediaRecoveryOperator, "blocked_missing_backup", "media recovery operator missing backup block");
assertIncludes(mediaRecoveryOperator, "blocked_stale_backup", "media recovery operator stale backup block");
assertIncludes(mediaRecoveryOperator, "blocked_restore_drill_missing", "media recovery operator restore drill block");
assertIncludes(mediaRecoveryOperator, "closed_for_one_job", "media recovery operator one-job close status");
assertIncludes(mediaRecoveryOperator, "blocked_pitr_required", "media recovery operator continuous PITR block");
assertIncludes(mediaRecoveryOperator, "rollback_prefix_too_broad", "media recovery operator broad rollback prefix block");
assertIncludes(mediaRecoveryOperator, "backup_manifest_must_not_use_public_playback_bucket", "media recovery operator public bucket backup block");
assertIncludes(mediaRecoveryOperator, "backup_manifest_must_not_use_public_media_domain", "media recovery operator public media domain backup block");
assertNotMatches(mediaTranscodeOperator, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "media transcode operator helper must not perform network or database writes");
assertNotMatches(mediaTranscodeWorkerSafety, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "media transcode worker safety helper must not perform network or database writes");
assertNotMatches(mediaRecoveryOperator, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "media recovery operator helper must not perform network or database writes");
assertIncludes(mediaTranscodeWorkerRunbook, "Operator-Controlled Worker Safety", "media transcode worker runbook operator section");
assertIncludes(mediaTranscodeWorkerRunbook, "worker code cannot self-enable; it must receive an operator lease", "media transcode worker runbook lease requirement");
assertIncludes(mediaTranscodeWorkerRunbook, "worker may write only `pending_audit` rows", "media transcode worker runbook pending audit rows");
assertIncludes(mediaTranscodeWorkerRunbook, "resolver trust is allowed only after the auditor passes", "media transcode worker runbook audit before resolver trust");
assertIncludes(mediaTranscodeWorkerRunbook, "Self-auditing and operator leases reduce blast radius for one controlled job, but they do not replace true PITR", "media transcode worker runbook PITR boundary");
assertIncludes(mediaRecoveryOperatorRunbook, "Status: operator/auditor source/proof model with completed City Lights proof, bounded CLI auto-detect cycle, and protected Premium HD row audit.", "media recovery operator runbook status");
assertIncludes(mediaRecoveryOperatorRunbook, "The recovery operator is the independent audit gate between worker output and resolver trust.", "media recovery operator runbook purpose");
assertIncludes(mediaRecoveryOperatorRunbook, "`one_job` requires an allowlisted source id, `max_jobs_per_run=1`, backfill disabled", "media recovery operator runbook one-job requirements");
assertIncludes(mediaRecoveryOperatorRunbook, "`continuous` is denied while the backup/PITR gate is Blocked or Partial.", "media recovery operator runbook continuous blocked");
assertIncludes(mediaRecoveryOperatorRunbook, "Audit pass is required before resolver trust.", "media recovery operator runbook audit pass");
assertIncludes(mediaRecoveryOperatorRunbook, "Self-auditing reduces blast radius for a single owner-approved job, but it does not replace true PITR", "media recovery operator runbook PITR boundary");
assertIncludes(mediaRecoveryOperatorRunbook, "R2 Logical Backup/Restore Drill", "media recovery operator runbook R2 logical backup section");
assertIncludes(mediaRecoveryOperatorRunbook, "Status: Closed for one-job backup/restore readiness only.", "media recovery operator runbook one-job backup closed");
assertIncludes(mediaRecoveryOperatorRunbook, "It is not true PostgreSQL PITR and does not store Supabase WAL.", "media recovery operator runbook not PITR boundary");
assertIncludes(mediaRecoveryOperatorRunbook, "backups/media-worker/2026/07/09/media-worker-logical-20260709-one-job-readiness-b81c7b1423c6/", "media recovery operator runbook backup prefix");
assertIncludes(mediaRecoveryOperatorRunbook, "Backups go only to private R2 bucket `chillywood-media-proof` under `backups/media-worker/`.", "media recovery operator runbook private backup bucket");
assertIncludes(mediaRecoveryOperatorRunbook, "Backups must never be uploaded to `chillywood-media-public-playback-proof`.", "media recovery operator runbook public bucket prohibition");
assertIncludes(mediaRecoveryOperatorRunbook, "Backups must never be exposed through `media.chillywoodstream.com`.", "media recovery operator runbook public domain prohibition");
assertIncludes(mediaRecoveryOperatorRunbook, "Continuous gate: still blocked.", "media recovery operator runbook continuous still blocked");
assertIncludes(mediaRecoveryOperatorRunbook, "Scheduled Backup/Restore Policy", "media recovery operator runbook scheduled backup policy section");
assertIncludes(mediaRecoveryOperatorRunbook, "Status: manual runner implemented, latest post-HD backup complete, scheduler not deployed.", "media recovery operator runbook scheduled backup status");
assertIncludes(mediaRecoveryOperatorRunbook, "CLI operation commands:", "media recovery operator runbook CLI commands section");
assertIncludes(mediaRecoveryOperatorRunbook, "`npm run backup:media-worker:status`", "media recovery operator runbook status command");
assertIncludes(mediaRecoveryOperatorRunbook, "`npm run backup:media-worker:verify-latest`", "media recovery operator runbook verify command");
assertIncludes(mediaRecoveryOperatorRunbook, "`npm run backup:media-worker:restore-drill`", "media recovery operator runbook restore command");
assertIncludes(mediaRecoveryOperatorRunbook, "Backups are CLI-controlled only; there is no GitHub Actions media-worker backup workflow and no cron schedule.", "media recovery operator runbook CLI-only backup statement");
assertIncludes(mediaRecoveryOperatorRunbook, "`scripts/run-media-worker-logical-backup.mjs` can create scoped media-worker logical backup artifacts and upload them to private R2 only when explicitly run in write mode", "media recovery operator runbook manual backup runner");
assertIncludes(mediaRecoveryOperatorRunbook, "`MEDIA_BACKUP_EXPORT_MODE=auto|pg_dump|js` controls export mode", "media recovery operator runbook export mode");
assertIncludes(mediaRecoveryOperatorRunbook, "`MEDIA_BACKUP_DATABASE_SOURCE=linked` uses Supabase CLI linked read-only queries instead of requiring or printing `MEDIA_BACKUP_DATABASE_URL`", "media recovery operator runbook linked DB source");
assertIncludes(mediaRecoveryOperatorRunbook, "Latest backup completed after protected Premium HD row promotion under private prefix `backups/media-worker/2026/07/10/media-worker-logical-20260710T024048-5de12265dded/` with row counts `media_transcode_jobs=10` and `media_renditions=15`.", "media recovery operator runbook completed real backup");
assertIncludes(mediaRecoveryOperatorRunbook, "Freshness: limited automation requires a verified backup less than 24 hours old; one-job proof or backfill-like runs require a verified backup less than 1 hour old.", "media recovery operator runbook scheduled backup freshness");
assertIncludes(mediaRecoveryOperatorRunbook, "backup artifacts must never be stored in `chillywood-media-public-playback-proof` and must never be served through `media.chillywoodstream.com`.", "media recovery operator runbook scheduled public bucket denial");
assertIncludes(mediaRecoveryOperatorRunbook, "This is logical backup/restore proof, not true PITR", "media recovery operator runbook logical backup not PITR");
assertIncludes(mediaTranscodeWorkerRunbook, "R2 logical backup/restore gate status: Closed for one-job proof readiness only.", "media transcode worker runbook one-job backup closed");
assertIncludes(mediaTranscodeWorkerRunbook, "Continuous automation readiness classification: Blocked.", "media transcode worker runbook continuous blocked after logical backup");
assertIncludes(mediaTranscodeWorkerRunbook, "Scheduled R2 Logical Backup Gate", "media transcode worker runbook scheduled backup section");
assertIncludes(mediaTranscodeWorkerRunbook, "Status: manual logical backup runner implemented, latest post-HD backup complete, scheduler not deployed.", "media transcode worker runbook scheduled backup status");
assertIncludes(mediaTranscodeWorkerRunbook, "CLI-only operation commands:", "media transcode worker runbook CLI commands section");
assertIncludes(mediaTranscodeWorkerRunbook, "`npm run backup:media-worker:preflight`", "media transcode worker runbook preflight command");
assertIncludes(mediaTranscodeWorkerRunbook, "`npm run backup:media-worker:verify-latest`", "media transcode worker runbook verify command");
assertIncludes(mediaTranscodeWorkerRunbook, "`npm run backup:media-worker:restore-drill`", "media transcode worker runbook restore command");
assertIncludes(mediaTranscodeWorkerRunbook, "No GitHub Actions workflow, cron schedule, deployed scheduler, continuous worker, queue processor, broad backfill, or playback switch is enabled.", "media transcode worker runbook no workflow cron");
assertIncludes(mediaTranscodeWorkerRunbook, "`npm run proof:media-worker-backup-runner` proves the real runner and restore drill surface:", "media transcode worker runbook backup runner proof");
assertIncludes(mediaTranscodeWorkerRunbook, "`MEDIA_BACKUP_EXPORT_MODE=auto|pg_dump|js` supports both the existing dump-tool path and a Node JS SELECT export fallback", "media transcode worker runbook export mode");
assertIncludes(mediaTranscodeWorkerRunbook, "`MEDIA_BACKUP_DATABASE_SOURCE=linked` uses Supabase CLI linked read-only queries instead of requiring or printing a raw database URL", "media transcode worker runbook linked DB source");
assertIncludes(mediaTranscodeWorkerRunbook, "`_lib/mediaRecoveryOperator.ts` defines `MediaBackupSchedulePolicy`, `MediaBackupFreshnessResult`, `MediaBackupRetentionPolicy`, and `MediaBackupSchedulerState`", "media transcode worker runbook scheduled helper types");
assertIncludes(mediaTranscodeWorkerRunbook, "`npm run proof:media-scheduled-backup-gate` proves:", "media transcode worker runbook scheduled proof");
assertIncludes(architecture, "R2 logical backup/restore gate status: Closed for the completed one-job proof only.", "architecture one-job logical backup gate");
assertIncludes(architecture, "Scheduled R2 logical backup gate status: manual runner implemented, latest post-HD backup complete, schedule not deployed.", "architecture scheduled backup status");
assertIncludes(architecture, "Backup operation is CLI-controlled only; no GitHub Actions media-worker backup workflow, cron schedule, or scheduler exists.", "architecture CLI-only backup statement");
assertIncludes(architecture, "`backup:media-worker:status` shows the latest prefix, scoped production row counts, worker-running state, and continuous-gate state.", "architecture backup status command");
assertIncludes(architecture, "`backup:media-worker:verify-latest` reads the latest private R2 backup artifacts, verifies SHA-256 checksums, confirms the public bucket and media domain do not expose them, and prints no secrets.", "architecture backup verify command");
assertIncludes(architecture, "`backup:media-worker:restore-drill` restores the latest backup into disposable PGlite and checks row counts plus resolver-safe filtering.", "architecture backup restore command");
assertIncludes(architecture, "`MEDIA_BACKUP_EXPORT_MODE=auto|pg_dump|js` supports JS SELECT export fallback", "architecture backup runner export mode");
assertIncludes(architecture, "`MEDIA_BACKUP_DATABASE_SOURCE=linked` uses Supabase CLI linked read-only queries instead of requiring or printing a raw database URL.", "architecture linked DB source backup runner");
assertIncludes(architecture, "Latest manual backup completed after protected Premium HD row promotion at private R2 prefix `backups/media-worker/2026/07/10/media-worker-logical-20260710T024048-5de12265dded/` with row counts `media_transcode_jobs=10` and `media_renditions=15`.", "architecture completed real manual backup");
assertIncludes(architecture, "`npm run proof:media-worker-backup-runner` proves dry-run behavior, missing-env fail-closed behavior, linked-source no-raw-DB-URL behavior, public bucket/domain denial, manifest/checksum generation, JS JSONL restore into disposable PGlite, and resolver-safe query.", "architecture backup runner proof");
assertIncludes(architecture, "No cron schedule, GitHub Actions schedule, production worker, queue processor, or production playback switch is enabled.", "architecture scheduled backup safety boundary");
assertIncludes(architecture, "R2 scheduled logical backup is not PITR.", "architecture scheduled backup not PITR");
assertIncludes(architecture, "CLI-only one-job media worker command status:", "architecture CLI-only worker command status");
assertIncludes(architecture, "`scripts/media-transcode-worker-cli.mjs` and `npm run proof:media-transcode-worker-cli` provide source/proof infrastructure", "architecture worker CLI proof status");
assertIncludes(architecture, "`media-worker:preflight`, `media-worker:dry-run`, `media-worker:status`, `media-worker:run-one`, `media-worker:audit`, `media-worker:verify-output`, and `media-worker:rollback-plan`", "architecture worker CLI command list");
assertIncludes(architecture, "`run-one` is fail-closed by default", "architecture worker run-one fail closed");
assertIncludes(architecture, "`MEDIA_WORKER_RUN_ONE_CONFIRM=I_UNDERSTAND_ONE_JOB`", "architecture worker run-one confirmation");
assertIncludes(architecture, "this task did not process another production job, deploy a worker service, add cron, add a scheduler, write production rows, or switch playback.", "architecture worker CLI no production mutation");
assertIncludes(architecture, "Final CLI operating checklist status:", "architecture final CLI checklist status");
assertIncludes(architecture, "`docs/MEDIA_WORKER_CLI_OPERATING_CHECKLIST.md` is the canonical handoff for any future owner-approved one-job media-worker operation.", "architecture final CLI checklist handoff");
assertIncludes(architecture, "`npm run proof:media-worker-cli-operating-checklist`", "architecture final CLI checklist proof");
assertIncludes(architecture, "Operator-controlled worker safety status:", "architecture operator control status");
assertIncludes(architecture, "Auditor/resolver trust status:", "architecture auditor trust status");
assertIncludes(packageJson, "\"proof:media-transcode-operator-control\"", "package media transcode operator proof script");
assertIncludes(packageJson, "\"proof:media-transcode-worker-auditor\"", "package media transcode worker auditor proof script");
assertIncludes(packageJson, "\"proof:media-recovery-operator\"", "package media recovery operator proof script");
assertIncludes(packageJson, "\"proof:media-transcode-worker-safety\"", "package media transcode worker safety proof script");
assertIncludes(packageJson, "\"proof:media-scheduled-backup-gate\"", "package media scheduled backup gate proof script");
assertIncludes(packageJson, "\"backup:media-worker:dry-run\"", "package media worker backup dry-run script");
assertIncludes(packageJson, "\"backup:media-worker:run\"", "package media worker backup run script");
assertIncludes(packageJson, "\"backup:media-worker:preflight\"", "package media worker backup preflight script");
assertIncludes(packageJson, "\"backup:media-worker:status\"", "package media worker backup status script");
assertIncludes(packageJson, "\"backup:media-worker:verify-latest\"", "package media worker backup verify latest script");
assertIncludes(packageJson, "\"backup:media-worker:restore-drill\"", "package media worker backup restore drill script");
assertIncludes(packageJson, "\"media-worker:preflight\"", "package media worker preflight script");
assertIncludes(packageJson, "\"media-worker:dry-run\"", "package media worker dry-run script");
assertIncludes(packageJson, "\"media-worker:status\"", "package media worker status script");
assertIncludes(packageJson, "\"media-worker:run-one\"", "package media worker run-one script");
assertIncludes(packageJson, "\"media-worker:audit\"", "package media worker audit script");
assertIncludes(packageJson, "\"media-worker:verify-output\"", "package media worker verify output script");
assertIncludes(packageJson, "\"media-worker:rollback-plan\"", "package media worker rollback plan script");
assertIncludes(packageJson, "\"proof:media-transcode-worker-cli\"", "package media transcode worker CLI proof script");
assertIncludes(packageJson, "\"proof:media-worker-cli-operating-checklist\"", "package media worker CLI checklist proof script");
assertIncludes(packageJson, "\"proof:media-worker-backup-runner\"", "package media worker backup runner proof script");
assertIncludes(mediaWorkerCliChecklist, "npm run backup:media-worker:preflight", "media worker CLI checklist backup preflight");
assertIncludes(mediaWorkerCliChecklist, "npm run backup:media-worker:status", "media worker CLI checklist backup status");
assertIncludes(mediaWorkerCliChecklist, "npm run backup:media-worker:verify-latest", "media worker CLI checklist backup verify");
assertIncludes(mediaWorkerCliChecklist, "npm run backup:media-worker:restore-drill", "media worker CLI checklist backup restore drill");
assertIncludes(mediaWorkerCliChecklist, "npm run media-worker:dry-run -- --source-id <id>", "media worker CLI checklist dry-run");
assertIncludes(mediaWorkerCliChecklist, "MEDIA_WORKER_RUN_ONE_CONFIRM=I_UNDERSTAND_ONE_JOB", "media worker CLI checklist run-one confirmation");
assertIncludes(mediaWorkerCliChecklist, "Continuous automation remains blocked", "media worker CLI checklist continuous blocked");
assertIncludes(mediaWorkerCliChecklist, "signed-origin fallback remains mandatory", "media worker CLI checklist production fallback");
assertIncludes(mediaWorkerCliChecklist, "The production worker is not deployed", "media worker CLI checklist worker not deployed");
assertIncludes(mediaWorkerCliChecklist, "It is not PITR and does not replace PITR for continuous production.", "media worker CLI checklist PITR boundary");
assertIncludes(mediaWorkerCliChecklistProof, "requiredBackupCommands", "media worker CLI checklist proof backup commands");
assertIncludes(mediaWorkerCliChecklistProof, "requiredWorkerCommands", "media worker CLI checklist proof worker commands");
assertIncludes(mediaWorkerCliChecklistProof, "cronSchedulerInstructionsAbsent", "media worker CLI checklist proof cron/scheduler denial");
assertIncludes(mediaWorkerCliChecklistProof, "pitrReplacementClaimAbsent", "media worker CLI checklist proof PITR denial");
assertNotMatches(mediaWorkerCliChecklist, /\b(?:worker is deployed|continuous automation is closed|production playback uses CDN|production playback uses HLS|R2 logical backups? (?:are|is) true PITR|PITR is unnecessary)\b/i, "media worker CLI checklist overclaim");
assertNotMatches(mediaWorkerCliChecklist, /\b(?:workflow_dispatch|schedule:\s*\[|cron\s*:\s*|on:\s*push)\b/i, "media worker CLI checklist must not include workflow or cron instructions");
assertIncludes(mediaRecoveryOperator, "MediaBackupSchedulePolicy", "media recovery operator scheduled backup policy type");
assertIncludes(mediaRecoveryOperator, "MediaBackupFreshnessResult", "media recovery operator backup freshness type");
assertIncludes(mediaRecoveryOperator, "MediaBackupRetentionPolicy", "media recovery operator retention policy type");
assertIncludes(mediaRecoveryOperator, "MediaBackupSchedulerState", "media recovery operator scheduler state type");
assertIncludes(mediaRecoveryOperator, "resolveScheduledMediaBackupRequirement", "media recovery operator scheduled backup requirement helper");
assertIncludes(mediaRecoveryOperator, "evaluateMediaBackupFreshness", "media recovery operator backup freshness helper");
assertIncludes(mediaRecoveryOperator, "evaluateRestoreDrillFreshness", "media recovery operator restore drill freshness helper");
assertIncludes(mediaRecoveryOperator, "resolveContinuousWorkerBackupGate", "media recovery operator continuous backup gate helper");
assertIncludes(mediaRecoveryOperator, "buildMediaBackupRetentionPlan", "media recovery operator retention helper");
assertIncludes(mediaRecoveryOperator, "sanitizeScheduledBackupProof", "media recovery operator scheduled backup sanitizer");
assertIncludes(mediaRecoveryOperator, "actualBackupRunnerAvailable", "media recovery operator backup runner availability field");
assertIncludes(mediaRecoveryOperator, "latestScheduledBackupVerified", "media recovery operator latest scheduled backup verified field");
assertIncludes(mediaRecoveryOperator, "restoreDrillFresh", "media recovery operator restore drill fresh field");
assertIncludes(mediaRecoveryOperator, "continuousAutomationAllowed", "media recovery operator continuous automation allowed field");
assertIncludes(mediaRecoveryOperator, "publicPlaybackBucketDenied: true", "media recovery operator public playback bucket denied policy");
assertIncludes(mediaRecoveryOperator, "logicalBackupNotPitr: true", "media recovery operator logical backup not PITR policy");
assertIncludes(mediaTranscodeOperatorProof, "defaultDisabled", "operator proof default disabled");
assertIncludes(mediaTranscodeOperatorProof, "emergencyStopDenied", "operator proof emergency stop");
assertIncludes(mediaTranscodeOperatorProof, "dryRunNoWrites", "operator proof dry run no writes");
assertIncludes(mediaTranscodeOperatorProof, "oneJobLeaseGranted", "operator proof one-job lease");
assertIncludes(mediaTranscodeOperatorProof, "continuousModeBlockedByBackupGate", "operator proof continuous backup gate");
assertIncludes(mediaTranscodeOperatorProof, "workerSelfEnableDenied", "operator proof worker self-enable block");
assertIncludes(mediaTranscodeOperatorProof, "auditPassAutoDisables", "operator proof audit pass auto-disable");
assertIncludes(mediaTranscodeOperatorProof, "auditFailureQuarantinesAndAutoDisables", "operator proof quarantine auto-disable");
assertIncludes(mediaTranscodeOperatorProof, "selfAuditReplacesPitrForContinuousProduction: false", "operator proof self-audit PITR boundary");
assertIncludes(mediaTranscodeWorkerAuditorProof, "operatorLeaseRequired", "worker auditor proof lease required");
assertIncludes(mediaTranscodeWorkerAuditorProof, "leaseSourceMismatchDenied", "worker auditor proof source mismatch");
assertIncludes(mediaTranscodeWorkerAuditorProof, "maxJobsExceededDenied", "worker auditor proof max jobs");
assertIncludes(mediaTranscodeWorkerAuditorProof, "leaseExpiryBlocksStalledJob", "worker auditor proof lease expiry");
assertIncludes(mediaTranscodeWorkerAuditorProof, "workerWritesPendingAuditOnly", "worker auditor proof pending audit writes");
assertIncludes(mediaTranscodeWorkerAuditorProof, "auditPassRequiredBeforeResolverTrust", "worker auditor proof audit before trust");
assertIncludes(mediaTranscodeWorkerAuditorProof, "auditFailureQuarantines", "worker auditor proof quarantine");
assertIncludes(mediaTranscodeWorkerAuditorProof, "rollbackPlanScopedToBatchAndPrefix", "worker auditor proof rollback scope");
assertIncludes(mediaTranscodeWorkerAuditorProof, "autoDisableAfterAuditPassOrFailure", "worker auditor proof auto-disable");
assertNotMatches(docsCorpus, /\bself[- ]auditing replaces PITR\b/i, "docs must not claim self-auditing replaces PITR");
assertNotMatches(docsCorpus, /\bPITR is unnecessary\b/i, "docs must not claim PITR unnecessary");
assertIncludes(mediaScheduledBackupGateProof, "media-scheduled-backup-gate", "scheduled backup gate proof mode");
assertIncludes(mediaScheduledBackupGateProof, "noBackupBlocksContinuous", "scheduled backup gate no backup proof");
assertIncludes(mediaScheduledBackupGateProof, "staleBackupBlocksContinuous", "scheduled backup gate stale backup proof");
assertIncludes(mediaScheduledBackupGateProof, "freshBackupWithoutRestoreBlocksContinuous", "scheduled backup gate restore drill proof");
assertIncludes(mediaScheduledBackupGateProof, "freshBackupAndRestoreClosesLimitedAutomation", "scheduled backup gate limited automation proof");
assertIncludes(mediaScheduledBackupGateProof, "logicalBackupClosesFullContinuousPitrGate", "scheduled backup gate not PITR proof");
assertIncludes(mediaScheduledBackupGateProof, "actualBackupRunnerAvailable", "scheduled backup gate runner availability proof");
assertIncludes(mediaScheduledBackupGateProof, "latestScheduledBackupVerified", "scheduled backup gate latest backup verification proof");
assertIncludes(mediaScheduledBackupGateProof, "restoreDrillFresh", "scheduled backup gate restore drill freshness proof");
assertIncludes(mediaScheduledBackupGateProof, "continuousAutomationAllowed", "scheduled backup gate continuous automation proof");
assertIncludes(mediaScheduledBackupGateProof, "oneJobOverrideRequiresFreshManualBackup", "scheduled backup gate one-job freshness proof");
assertIncludes(mediaScheduledBackupGateProof, "publicBucketBackupTargetDenied", "scheduled backup gate public bucket denial proof");
assertIncludes(mediaScheduledBackupGateProof, "secretLikeBackupArtifactDenied", "scheduled backup gate secret-like artifact proof");
assertIncludes(mediaScheduledBackupGateProof, "retentionKeepsLatestRestoreDrillPassedBackup", "scheduled backup gate retention proof");
assertIncludes(mediaScheduledBackupGateProof, "broadBackfillDeniedWithoutExplicitOwnerApproval", "scheduled backup gate backfill denial proof");
assertIncludes(mediaScheduledBackupGateProof, "productionWorkerDeployed: false", "scheduled backup gate no production worker");
assertIncludes(mediaScheduledBackupGateProof, "productionDbWritesEnabled: false", "scheduled backup gate no production DB writes");
assertIncludes(mediaScheduledBackupGateProof, "productionPlaybackSwitched: false", "scheduled backup gate no production playback switch");
assertIncludes(mediaScheduledBackupGateProof, "pitrEnabledByThisProof: false", "scheduled backup gate no PITR mutation");
assertIncludes(mediaWorkerBackupRunner, "MEDIA_BACKUP_RUNNER_ENABLED", "backup runner enable gate");
assertIncludes(mediaWorkerBackupRunner, "MEDIA_BACKUP_MODE", "backup runner mode gate");
assertIncludes(mediaWorkerBackupRunner, "MEDIA_BACKUP_DATABASE_URL", "backup runner database URL env name");
assertIncludes(mediaWorkerBackupRunner, "MEDIA_BACKUP_DATABASE_SOURCE", "backup runner linked database source env name");
assertIncludes(mediaWorkerBackupRunner, "allowedDatabaseSources = [\"url\", \"linked\"]", "backup runner database source contract");
assertIncludes(mediaWorkerBackupRunner, "MEDIA_BACKUP_R2_BUCKET", "backup runner R2 bucket env name");
assertIncludes(mediaWorkerBackupRunner, "MEDIA_BACKUP_R2_PREFIX", "backup runner R2 prefix env name");
assertIncludes(mediaWorkerBackupRunner, "MEDIA_BACKUP_EXPORT_MODE", "backup runner export mode env name");
assertIncludes(mediaWorkerBackupRunner, "allowedExportModes = [\"auto\", \"pg_dump\", \"js\"]", "backup runner export mode contract");
assertIncludes(mediaWorkerBackupRunner, "PostgresSimpleClient", "backup runner JS Postgres client");
assertIncludes(mediaWorkerBackupRunner, "runSupabaseLinkedQuery", "backup runner Supabase linked query source");
assertIncludes(mediaWorkerBackupRunner, "runJsExport", "backup runner JS export function");
assertIncludes(mediaWorkerBackupRunner, "node_js_postgres_select_export", "backup runner JS export tool label");
assertIncludes(mediaWorkerBackupRunner, "supabase_linked_js_select_export", "backup runner linked JS export tool label");
assertIncludes(mediaWorkerBackupRunner, "data-media-worker.jsonl.gz", "backup runner JS JSONL artifact");
assertIncludes(mediaWorkerBackupRunner, "select row_to_json(t)::text as row from (select * from public.media_transcode_jobs", "backup runner JS scoped jobs select");
assertIncludes(mediaWorkerBackupRunner, "select row_to_json(t)::text as row from (select * from public.media_renditions", "backup runner JS scoped renditions select");
assertIncludes(mediaWorkerBackupRunner, "assertNoUnsafeBackupValue", "backup runner data secret guard");
assertIncludes(mediaWorkerBackupRunner, "backups/media-worker/", "backup runner private prefix");
assertIncludes(mediaWorkerBackupRunner, "media_transcode_jobs", "backup runner scoped jobs table");
assertIncludes(mediaWorkerBackupRunner, "media_renditions", "backup runner scoped renditions table");
assertIncludes(mediaWorkerBackupRunner, "auth.users", "backup runner auth users exclusion");
assertIncludes(mediaWorkerBackupRunner, "billing", "backup runner billing exclusion");
assertIncludes(mediaWorkerBackupRunner, "payouts", "backup runner payouts exclusion");
assertIncludes(mediaWorkerBackupRunner, "private_media_objects", "backup runner private media exclusion");
assertIncludes(mediaWorkerBackupRunner, "creator_originals", "backup runner creator originals exclusion");
assertIncludes(mediaWorkerBackupRunner, "signed_urls", "backup runner signed URL exclusion");
assertIncludes(mediaWorkerBackupRunner, "chillywood-media-public-playback-proof", "backup runner public bucket denial");
assertIncludes(mediaWorkerBackupRunner, "media.chillywoodstream.com", "backup runner public media domain denial");
assertIncludes(mediaWorkerBackupRunner, "failClosed", "backup runner fail-closed path");
assertIncludes(mediaWorkerBackupRunner, "logical_backup_not_pitr", "backup runner logical backup not PITR manifest field");
assertIncludes(mediaWorkerBackupRunner, "public_bucket_used", "backup runner public bucket manifest field");
assertIncludes(mediaWorkerBackupRunner, "production_rows_written", "backup runner no production rows manifest field");
assertIncludes(mediaWorkerBackupCli, "validModes = [\"preflight\", \"status\", \"verify-latest\", \"restore-drill\"]", "backup CLI operation modes");
assertIncludes(mediaWorkerBackupCli, "defaultLatestBackupPrefix", "backup CLI default latest prefix");
assertIncludes(mediaWorkerBackupCli, "runSupabaseLinkedQuery", "backup CLI linked Supabase read-only query");
assertIncludes(mediaWorkerBackupCli, "readWorkerCounts", "backup CLI status row counts");
assertIncludes(mediaWorkerBackupCli, "downloadLatestBackup", "backup CLI private R2 readback");
assertIncludes(mediaWorkerBackupCli, "verifyDownloadedBackup", "backup CLI checksum verification");
assertIncludes(mediaWorkerBackupCli, "restoreIntoPglite", "backup CLI restore drill");
assertIncludes(mediaWorkerBackupCli, "publicPlaybackBucketContainsBackup", "backup CLI public bucket check");
assertIncludes(mediaWorkerBackupCli, "mediaDomainHttpStatus", "backup CLI public domain check");
assertIncludes(mediaWorkerBackupCli, "productionDbMutation: false", "backup CLI no production DB mutation");
assertIncludes(mediaWorkerBackupCli, "continuousAutomationEnabled: false", "backup CLI no continuous automation");
assertIncludes(mediaWorkerBackupCli, "cronOrSchedulerAdded: false", "backup CLI no cron scheduler");
assertIncludes(mediaWorkerBackupCli, "mediaWorkerGitHubWorkflowExists", "backup CLI workflow status");
assertIncludes(mediaWorkerBackupCli, "secret_like_value_refused", "backup CLI secret guard");
assertIncludes(mediaTranscodeWorkerCli, "validModes = [", "worker CLI mode contract");
assertIncludes(mediaTranscodeWorkerCli, "\"preflight\"", "worker CLI preflight mode");
assertIncludes(mediaTranscodeWorkerCli, "\"dry-run\"", "worker CLI dry-run mode");
assertIncludes(mediaTranscodeWorkerCli, "\"status\"", "worker CLI status mode");
assertIncludes(mediaTranscodeWorkerCli, "\"run-one\"", "worker CLI run-one mode");
assertIncludes(mediaTranscodeWorkerCli, "\"audit\"", "worker CLI audit mode");
assertIncludes(mediaTranscodeWorkerCli, "\"verify-output\"", "worker CLI verify-output mode");
assertIncludes(mediaTranscodeWorkerCli, "\"rollback-plan\"", "worker CLI rollback-plan mode");
assertIncludes(mediaTranscodeWorkerCli, "allowedSourceIds", "worker CLI source allowlist");
assertIncludes(mediaTranscodeWorkerCli, "MEDIA_WORKER_RUN_ONE_CONFIRM", "worker CLI run-one confirmation env");
assertIncludes(mediaTranscodeWorkerCli, "I_UNDERSTAND_ONE_JOB", "worker CLI run-one confirmation value");
assertIncludes(mediaTranscodeWorkerCli, "max_jobs_must_be_one", "worker CLI max jobs guard");
assertIncludes(mediaTranscodeWorkerCli, "backfill_disabled_required", "worker CLI backfill guard");
assertIncludes(mediaTranscodeWorkerCli, "backup_gate_not_closed", "worker CLI backup gate guard");
assertIncludes(mediaTranscodeWorkerCli, "run_one_confirmation_missing", "worker CLI missing confirmation guard");
assertIncludes(mediaTranscodeWorkerCli, "run_one_execution_not_implemented_in_cli_infrastructure_build", "worker CLI run-one infrastructure-only guard");
assertIncludes(mediaTranscodeWorkerCli, "unsafe_output_prefix_refused", "worker CLI unsafe prefix guard");
assertIncludes(mediaTranscodeWorkerCli, "playback/public/worker-proof/chillywood-city-lights/", "worker CLI exact public proof prefix");
assertIncludes(mediaTranscodeWorkerCli, "forbiddenPublicSegments", "worker CLI forbidden path segments");
assertIncludes(mediaTranscodeWorkerCli, "writesAttempted: false", "worker CLI no writes in dry-run");
assertIncludes(mediaTranscodeWorkerCli, "mediaUploaded: false", "worker CLI no upload in dry-run");
assertIncludes(mediaTranscodeWorkerCli, "queueProcessorRun: false", "worker CLI no queue processor");
assertIncludes(mediaTranscodeWorkerCli, "continuousAutomationEnabled: false", "worker CLI no continuous automation");
assertIncludes(mediaTranscodeWorkerCli, "productionWorkerDeployed: false", "worker CLI no deployed worker");
assertIncludes(mediaTranscodeWorkerCli, "productionPlaybackSwitched: false", "worker CLI no playback switch");
assertIncludes(mediaTranscodeWorkerCliProof, "defaultRunOneDenied", "worker CLI proof default run-one denial");
assertIncludes(mediaTranscodeWorkerCliProof, "nonAllowlistedSourceDenied", "worker CLI proof non-allowlisted source denial");
assertIncludes(mediaTranscodeWorkerCliProof, "maxJobsGreaterThanOneDenied", "worker CLI proof max jobs denial");
assertIncludes(mediaTranscodeWorkerCliProof, "backfillDenied", "worker CLI proof backfill denial");
assertIncludes(mediaTranscodeWorkerCliProof, "missingOrStaleBackupDenied", "worker CLI proof backup gate denial");
assertIncludes(mediaTranscodeWorkerCliProof, "dryRunDoesNoWrites", "worker CLI proof dry-run no writes");
assertIncludes(mediaTranscodeWorkerCliProof, "runOneRequiresConfirmation", "worker CLI proof confirmation required");
assertIncludes(mediaTranscodeWorkerCliProof, "runOneInfrastructureOnlyNoProductionWrite", "worker CLI proof infrastructure-only run-one");
assertIncludes(mediaTranscodeWorkerCliProof, "rollbackPlanScoped", "worker CLI proof scoped rollback");
assertIncludes(mediaTranscodeWorkerCliProof, "broadPrefixRollbackDenied", "worker CLI proof broad prefix denial");
assertIncludes(mediaTranscodeWorkerCliProof, "publicPrivateBucketSafetyEnforced", "worker CLI proof private path denial");
assertIncludes(mediaTranscodeWorkerCliProof, "productionDbWritesEnabled: false", "worker CLI proof no production DB writes");
assertIncludes(mediaWorkerBackupRunnerProof, "media-worker-backup-runner", "backup runner proof mode");
assertIncludes(mediaWorkerBackupRunnerProof, "dryRunPassed", "backup runner proof dry-run");
assertIncludes(mediaWorkerBackupRunnerProof, "missingEnvFailClosed", "backup runner proof missing-env fail closed");
assertIncludes(mediaWorkerBackupRunnerProof, "linkedSourceDoesNotRequireRawDbUrl", "backup runner proof linked source does not require raw DB URL");
assertIncludes(mediaWorkerBackupRunnerProof, "publicBucketTargetDenied", "backup runner proof public bucket denial");
assertIncludes(mediaWorkerBackupRunnerProof, "linkedSourcePublicBucketTargetDenied", "backup runner proof linked public bucket denial");
assertIncludes(mediaWorkerBackupRunnerProof, "mediaDomainTargetDenied", "backup runner proof public media domain denial");
assertIncludes(mediaWorkerBackupRunnerProof, "manifestShapeValid", "backup runner proof manifest shape");
assertIncludes(mediaWorkerBackupRunnerProof, "checksumGenerationPassed", "backup runner proof checksum");
assertIncludes(mediaWorkerBackupRunnerProof, "jsExportManifestValid", "backup runner proof JS manifest");
assertIncludes(mediaWorkerBackupRunnerProof, "pgDumpAbsenceDoesNotBlockJsMode", "backup runner proof pg_dump absence");
assertIncludes(mediaWorkerBackupRunnerProof, "jsDataArtifactRestorePassed", "backup runner proof JS data restore");
assertIncludes(mediaWorkerBackupRunnerProof, "data-media-worker.jsonl.gz", "backup runner proof JSONL artifact");
assertIncludes(mediaWorkerBackupRunnerProof, "pglite_disposable_local", "backup runner proof disposable restore");
assertIncludes(mediaWorkerBackupRunnerProof, "resolverSafeQueryPassed", "backup runner proof resolver-safe query");
assertIncludes(mediaWorkerBackupRunnerProof, "productionDbWritesEnabled: false", "backup runner proof no production writes");
assertIncludes(mediaWorkerBackupRunnerProof, "continuousAutomationEnabled: false", "backup runner proof no continuous automation");
assertNotMatches(docsCorpus, /\bR2 (?:scheduled )?logical backup(?:s)? (?:is|are|equals?|replace[s]?) (?:true )?(?:PostgreSQL )?PITR\b/i, "docs must not claim R2 logical backup is PITR");
assertNotMatches(docsCorpus, /\bcontinuous (?:worker )?(?:automation|processing) (?:is )?(?:enabled|running|deployed|live)\b/i, "docs must not claim continuous worker processing is live");
assertNotMatches(docsCorpus, /\bbackup artifacts? (?:may|can|should) (?:be )?(?:stored|uploaded|served)[^.]*chillywood-media-public-playback-proof\b/i, "docs must not allow public playback bucket backups");
assertNotMatches(docsCorpus, /\bbackup artifacts? (?:may|can|should) (?:be )?(?:served|exposed)[^.]*media\.chillywoodstream\.com\b/i, "docs must not allow public media domain backups");
if (exists(".github/workflows/media-worker-logical-backup.yml")) {
  fail("media worker backup workflow must not exist; backups are CLI-only");
}
assertIncludes(mediaRenditionMetadataProof, "trusted-media-rendition-metadata", "trusted rendition metadata proof mode");
assertIncludes(mediaRenditionMetadataProof, "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1", "trusted rendition metadata City Lights source id");
assertIncludes(mediaRenditionMetadataProof, "playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8", "trusted rendition metadata HLS master path");
assertIncludes(mediaRenditionMetadataProof, "buildCityLightsTrustedHlsRenditionFixtures", "trusted rendition metadata City Lights fixture proof");
assertIncludes(mediaRenditionMetadataProof, "canUseTrustedRenditionForPublicCdn", "trusted rendition metadata eligibility proof");
assertIncludes(mediaRenditionMetadataProof, "buildMediaDeliveryAssetFromTrustedRendition", "trusted rendition metadata media delivery bridge proof");
assertIncludes(mediaRenditionMetadataProof, "not_ready", "trusted rendition metadata not-ready proof");
assertIncludes(mediaRenditionMetadataProof, "original_or_master_blocked", "trusted rendition metadata original/master proof");
assertIncludes(mediaRenditionMetadataProof, "premium_requires_token_cdn", "trusted rendition metadata Premium proof");
assertIncludes(mediaRenditionMetadataProof, "private_requires_token_cdn", "trusted rendition metadata private proof");
assertIncludes(mediaRenditionMetadataProof, "scan_not_clean", "trusted rendition metadata scan proof");
assertIncludes(mediaRenditionMetadataProof, "moderation_not_allowed", "trusted rendition metadata moderation proof");
assertIncludes(mediaRenditionMetadataProof, "wrong_bucket_role", "trusted rendition metadata bucket role proof");
assertIncludes(mediaRenditionMetadataProof, "non_playback_prefix", "trusted rendition metadata prefix proof");
assertIncludes(mediaRenditionMetadataProof, "not_in_public_playback_allowlist", "trusted rendition metadata allowlist proof");
assertIncludes(mediaRenditionMetadataProof, "default production creator-video path should keep signed-origin fallback", "trusted rendition metadata production fallback proof");
assertIncludes(mediaRenditionMetadataProof, "productionVideoRenditionWritesLive: false", "trusted rendition metadata no production row writes");
assertIncludes(mediaRenditionMetadataProof, "productionDbWritesEnabled: false", "trusted rendition metadata no production DB writes");
assertIncludes(mediaRenditionMetadataProof, "productionPlaybackSwitched: false", "trusted rendition metadata no production playback switch");
assertIncludes(mediaRenditionMetadataProof, "productionTranscodeServiceLive: false", "trusted rendition metadata no production transcode claim");
assertNotMatches(mediaRenditionMetadataProof, /\bsupabase\.from\b|\bcreateClient\b/i, "trusted rendition metadata proof must not write production DB or create a Supabase client");
assertIncludes(mediaRenditionMigrationPolicyProof, "media-rendition-migration-policy", "trusted rendition migration policy proof mode");
assertIncludes(mediaRenditionMigrationPolicyProof, "supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql", "trusted rendition migration policy draft path");
assertIncludes(mediaRenditionMigrationPolicyProof, "clientTrustedWritesAllowed: false", "trusted rendition migration policy client write proof");
assertIncludes(mediaRenditionMigrationPolicyProof, "serviceRoleWorkerRequired: true", "trusted rendition migration policy service role proof");
assertIncludes(mediaRenditionMigrationPolicyProof, "publicCdnEligibilityFromTrustedRowsOnly: true", "trusted rendition migration policy trusted rows proof");
assertIncludes(mediaRenditionMigrationPolicyProof, "originalMasterNormalPlaybackAllowed: false", "trusted rendition migration policy original/master proof");
assertIncludes(mediaRenditionMigrationPolicyProof, "premiumPrivatePublicCdnWithoutTokenAllowed: false", "trusted rendition migration policy Premium/private proof");
assertIncludes(mediaRenditionMigrationPolicyProof, "productionSchemaMigrationApplied: true", "trusted rendition migration policy production schema apply claim");
assertIncludes(mediaRenditionMigrationPolicyProof, "scopedOneJobRowsWritten: true", "trusted rendition migration policy scoped one-job row proof");
assertIncludes(mediaRenditionMigrationPolicyProof, "productionRowsForOtherSourcesWritten: false", "trusted rendition migration policy no other-source production row writes");
assertIncludes(mediaRenditionMigrationPolicyProof, "productionBackfillRun: false", "trusted rendition migration policy no production backfill");
assertIncludes(mediaRenditionMigrationPolicyProof, "productionPlaybackSwitched: false", "trusted rendition migration policy no production playback switch");
assertNotMatches(mediaRenditionMigrationPolicyProof, /\bsupabase\.from\b|\bcreateClient\b/i, "trusted rendition migration policy proof must not write production DB or create a Supabase client");
assertIncludes(mediaRenditionMigrationDryRunProof, "media-rendition-migration-dry-run", "trusted rendition migration dry-run proof mode");
assertIncludes(mediaRenditionMigrationDryRunProof, "MEDIA_RENDITION_DRY_RUN_DATABASE_URL", "trusted rendition migration dry-run safe DB URL env");
assertIncludes(mediaRenditionMigrationDryRunProof, "refusing dry-run connection", "trusted rendition migration dry-run production refusal");
assertIncludes(mediaRenditionMigrationDryRunProof, "pglite_disposable_local", "trusted rendition migration dry-run embedded runtime");
assertIncludes(mediaRenditionMigrationDryRunProof, "runtimeApplyPassed", "trusted rendition migration dry-run runtime apply field");
assertIncludes(mediaRenditionMigrationDryRunProof, "clientWriteDenied", "trusted rendition migration dry-run client denial field");
assertIncludes(mediaRenditionMigrationDryRunProof, "serviceRoleWritePassed", "trusted rendition migration dry-run service role field");
assertIncludes(mediaRenditionMigrationDryRunProof, "resolverSafeSelectPassed", "trusted rendition migration dry-run resolver select field");
assertIncludes(mediaRenditionMigrationDryRunProof, "productionDbRefused", "trusted rendition migration dry-run production refusal field");
assertIncludes(mediaRenditionMigrationDryRunProof, "noSecretsPrinted", "trusted rendition migration dry-run no secrets field");
assertIncludes(mediaRenditionMigrationDryRunProof, "clientWriteDenials", "trusted rendition migration dry-run client denial proof");
assertIncludes(mediaRenditionMigrationDryRunProof, "serviceRoleWorkerWrites", "trusted rendition migration dry-run service role proof");
assertIncludes(mediaRenditionMigrationDryRunProof, "resolverSafeSelect", "trusted rendition migration dry-run resolver-safe select proof");
assertIncludes(mediaRenditionMigrationDryRunProof, "productionSchemaMigrationApplied: true", "trusted rendition migration dry-run production schema apply claim");
assertIncludes(mediaRenditionMigrationDryRunProof, "productionDataRowsWritten: false", "trusted rendition migration dry-run no production data rows");
assertIncludes(mediaRenditionMigrationDryRunProof, "productionBackfillRun: false", "trusted rendition migration dry-run no production backfill");
assertIncludes(mediaRenditionMigrationDryRunProof, "productionPlaybackSwitched: false", "trusted rendition migration dry-run no production playback switch");

const loadMediaDeliveryHelper = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-delivery-guard-"));
  try {
    const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
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
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const requireFromGuard = createRequire(import.meta.url);
    for (const candidate of [
      path.join(outDir, "mediaDelivery.js"),
      path.join(outDir, "_lib", "mediaDelivery.js"),
    ]) {
      try {
        return {
          helper: requireFromGuard(candidate),
          cleanup: () => rmSync(outDir, { recursive: true, force: true }),
        };
      } catch {
        // Try the next compiler output shape.
      }
    }
    throw new Error("compiled helper missing");
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const assertMediaDeliveryHelperPolicy = async () => {
  let loaded;
  try {
    loaded = loadMediaDeliveryHelper();
  } catch (error) {
    fail(`media delivery helper must compile for guard proof: ${error instanceof Error ? error.message : "unknown_error"}`);
    return;
  }

  try {
    const config = {
      deliveryProvider: "cloudflare_r2_custom_domain",
      cdnBaseUrl: "https://media.chillywoodstream.com",
      cdnSigningMode: "off",
      cdnPublicPlaybackPrefix: "playback/public/",
      cdnPrivatePlaybackDisabled: true,
    };
    const realDemoPath = "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4";
    const hlsMasterPath = "playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8";
    const hlsSegmentPath = "playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/480p/segment-000.ts";
    const queueHlsMasterPath = "playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8";
    const queueHlsSegmentPath = "playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/480p/segment-000.ts";
    const realDemoAllowlistConfig = {
      ...config,
      cdnAllowedPublicPlaybackPaths: [realDemoPath],
    };
    const hlsDemoAllowlistConfig = {
      ...config,
      cdnAllowedPublicPlaybackPaths: [hlsMasterPath],
    };
    const queueHlsAllowlistConfig = {
      ...config,
      cdnAllowedPublicPlaybackPaths: [queueHlsMasterPath],
    };
    const fallbackUrl = "origin-signed-direct-fallback";

    const safePublic = await loaded.helper.resolveMediaPlaybackDelivery({
      asset: {
        path: "playback/public/proof/hello.txt",
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
      config,
      fallbackUrl,
    });
    if (safePublic.url !== "https://media.chillywoodstream.com/playback/public/proof/hello.txt") {
      fail("media delivery helper must return the public proof custom-domain URL only for explicit public-safe playback assets");
    }

    const safeDemoProof = await loaded.helper.resolveMediaPlaybackDelivery({
      asset: {
        path: "playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4",
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
      config,
      fallbackUrl,
    });
    if (safeDemoProof.url !== "https://media.chillywoodstream.com/playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4") {
      fail("media delivery helper must return the public demo custom-domain URL only for explicit public-safe playback assets");
    }

    const realDemoProof = await loaded.helper.resolveMediaPlaybackDelivery({
      asset: {
        path: realDemoPath,
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
      config: realDemoAllowlistConfig,
      fallbackUrl,
    });
    if (realDemoProof.url !== `https://media.chillywoodstream.com/${realDemoPath}`) {
      fail("media delivery helper must return the real demo custom-domain URL under the explicit real-demo allowlist");
    }

    const nonAllowlistedPublic = await loaded.helper.resolveMediaPlaybackDelivery({
      asset: {
        path: "playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4",
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
      config: realDemoAllowlistConfig,
      fallbackUrl,
    });
    if (nonAllowlistedPublic.url !== fallbackUrl || nonAllowlistedPublic.blockedReason !== "not_in_public_playback_allowlist") {
      fail("media delivery helper must block public-safe paths outside the explicit real-demo allowlist");
    }

    const hlsMasterProof = await loaded.helper.resolveMediaPlaybackDelivery({
      asset: {
        path: hlsMasterPath,
        publicPlaybackSafe: true,
        accessTier: "free",
        qualityLabel: "hls",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
      config: hlsDemoAllowlistConfig,
      fallbackUrl,
    });
    if (hlsMasterProof.url !== `https://media.chillywoodstream.com/${hlsMasterPath}` || hlsMasterProof.cdnEligible !== true) {
      fail("media delivery helper must return the HLS master custom-domain URL under the explicit HLS demo allowlist");
    }

    const hlsSegmentProof = await loaded.helper.resolveMediaPlaybackDelivery({
      asset: {
        path: hlsSegmentPath,
        publicPlaybackSafe: true,
        accessTier: "free",
        qualityLabel: "480p",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
      config: hlsDemoAllowlistConfig,
      fallbackUrl,
    });
    if (hlsSegmentProof.url !== fallbackUrl || hlsSegmentProof.blockedReason !== "not_in_public_playback_allowlist") {
      fail("media delivery helper must not independently return HLS segment URLs under the HLS demo allowlist");
    }

    const queueHlsMasterProof = await loaded.helper.resolveMediaPlaybackDelivery({
      asset: {
        path: queueHlsMasterPath,
        publicPlaybackSafe: true,
        accessTier: "free",
        qualityLabel: "hls",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
      config: queueHlsAllowlistConfig,
      fallbackUrl,
    });
    if (queueHlsMasterProof.url !== `https://media.chillywoodstream.com/${queueHlsMasterPath}` || queueHlsMasterProof.cdnEligible !== true) {
      fail("media delivery helper must return the proof transcode queue HLS master custom-domain URL under the explicit queue proof allowlist");
    }

    const queueHlsSegmentProof = await loaded.helper.resolveMediaPlaybackDelivery({
      asset: {
        path: queueHlsSegmentPath,
        publicPlaybackSafe: true,
        accessTier: "free",
        qualityLabel: "480p",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
      config: queueHlsAllowlistConfig,
      fallbackUrl,
    });
    if (queueHlsSegmentProof.url !== fallbackUrl || queueHlsSegmentProof.blockedReason !== "not_in_public_playback_allowlist") {
      fail("media delivery helper must not independently return proof transcode queue HLS segment URLs under the queue proof allowlist");
    }

    const blockedCases = [
      {
        label: "non-public prefix",
        asset: {
          path: "private/source.mp4",
          publicPlaybackSafe: true,
          accessTier: "private",
          scanStatus: "clean",
          moderationStatus: "clean",
        },
      },
      {
        label: "original public-prefix path",
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
        label: "premium public-prefix path",
        asset: {
          path: "playback/public/proof/hd.m3u8",
          publicPlaybackSafe: true,
          accessTier: "premium",
          scanStatus: "clean",
          moderationStatus: "clean",
        },
      },
      {
        label: "unscanned public-prefix path",
        asset: {
          path: "playback/public/proof/pending.m3u8",
          publicPlaybackSafe: true,
          accessTier: "free",
          scanStatus: "pending_scan",
          moderationStatus: "clean",
        },
      },
      {
        label: "moderation-blocked public-prefix path",
        asset: {
          path: "playback/public/proof/hidden.m3u8",
          publicPlaybackSafe: true,
          accessTier: "free",
          scanStatus: "clean",
          moderationStatus: "hidden",
        },
      },
      {
        label: "public-prefix path without explicit safety",
        asset: {
          path: "playback/public/proof/hello.txt",
          publicPlaybackSafe: false,
          accessTier: "free",
          scanStatus: "clean",
          moderationStatus: "clean",
        },
      },
      {
        label: "default creator-video source path",
        asset: {
          path: "owner-id/video-id/source.mp4",
          publicPlaybackSafe: false,
          accessTier: "free",
          scanStatus: "clean",
          moderationStatus: "clean",
        },
      },
    ];

    for (const entry of blockedCases) {
      const resolution = await loaded.helper.resolveMediaPlaybackDelivery({
        asset: entry.asset,
        config,
        fallbackUrl,
      });
      if (String(resolution.url ?? "").includes("media.chillywoodstream.com")) {
        fail(`media delivery helper must not return media.chillywoodstream.com for ${entry.label}`);
      }
      if (resolution.cdnEligible !== false || resolution.fallbackUsed !== true || !resolution.blockedReason) {
        fail(`media delivery helper must block and fall back for ${entry.label}`);
      }
    }

    const missingConfig = await loaded.helper.resolveMediaPlaybackDelivery({
      asset: {
        path: "playback/public/proof/hello.txt",
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
      config: { deliveryProvider: "origin_signed_direct", cdnBaseUrl: "" },
      fallbackUrl,
    });
    if (missingConfig.url !== fallbackUrl || missingConfig.cdnEligible !== false) {
      fail("media delivery helper must keep signed-origin fallback when Cloudflare CDN config is absent or disabled");
    }

    const invalidSigningMode = await loaded.helper.resolveMediaPlaybackDelivery({
      asset: {
        path: "playback/public/proof/hello.txt",
        publicPlaybackSafe: true,
        accessTier: "free",
        scanStatus: "clean",
        moderationStatus: "clean",
      },
      config: { ...config, cdnSigningMode: "invalid" },
      fallbackUrl,
    });
    if (invalidSigningMode.url !== fallbackUrl || invalidSigningMode.blockedReason !== "invalid_cdn_signing_mode") {
      fail("media delivery helper must fail closed for invalid CDN signing mode config");
    }
  } finally {
    loaded.cleanup();
  }
};

const loadMediaRenditionMetadataHelper = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-rendition-metadata-guard-"));
  try {
    const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
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
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const requireFromGuard = createRequire(import.meta.url);
    const loadCompiled = (fileName) => {
      for (const candidate of [
        path.join(outDir, fileName),
        path.join(outDir, "_lib", fileName),
      ]) {
        try {
          return requireFromGuard(candidate);
        } catch {
          // Try the next compiler output shape.
        }
      }
      throw new Error(`compiled ${fileName} missing`);
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

const assertMediaRenditionMetadataPolicy = async () => {
  let loaded;
  try {
    loaded = loadMediaRenditionMetadataHelper();
  } catch (error) {
    fail(`trusted media rendition metadata helper must compile for guard proof: ${error instanceof Error ? error.message : "unknown_error"}`);
    return;
  }

  try {
    const config = {
      deliveryProvider: "cloudflare_r2_custom_domain",
      cdnBaseUrl: "https://media.chillywoodstream.com",
      cdnSigningMode: "off",
      cdnPublicPlaybackPrefix: "playback/public/",
      cdnPrivatePlaybackDisabled: true,
      cdnAllowedPublicPlaybackPaths: [
        "playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8",
      ],
    };
    const fallbackUrl = "origin-signed-direct-fallback";
    const [trusted360p] = loaded.renditionMetadata.buildCityLightsTrustedHlsRenditionFixtures("2026-07-09T00:00:00.000Z");
    const trustedGate = loaded.renditionMetadata.canUseTrustedRenditionForPublicCdn(trusted360p);
    if (trustedGate.cdnEligible !== true || trustedGate.blockedReason !== null) {
      fail("trusted City Lights HLS fixture must pass trusted rendition metadata gate");
    }

    const trustedResolution = await loaded.mediaDelivery.resolveMediaPlaybackDelivery({
      asset: loaded.renditionMetadata.buildMediaDeliveryAssetFromTrustedRendition(trusted360p),
      config,
      fallbackUrl,
    });
    if (
      trustedResolution.url
      !== "https://media.chillywoodstream.com/playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8"
    ) {
      fail("trusted City Lights HLS fixture must resolve to media.chillywoodstream.com only under the explicit HLS allowlist");
    }

    const blockedFixtures = [
      {
        label: "not-ready",
        row: { ...trusted360p, is_ready: false },
        reason: "not_ready",
      },
      {
        label: "original/master",
        row: { ...trusted360p, rendition_label: "original", is_original: true },
        reason: "original_or_master_blocked",
      },
      {
        label: "Premium",
        row: { ...trusted360p, visibility: "premium" },
        reason: "premium_requires_token_cdn",
      },
      {
        label: "private",
        row: { ...trusted360p, visibility: "private" },
        reason: "private_requires_token_cdn",
      },
      {
        label: "unscanned",
        row: { ...trusted360p, scan_status: "unscanned" },
        reason: "scan_not_clean",
      },
      {
        label: "moderation-blocked",
        row: { ...trusted360p, moderation_status: "hidden" },
        reason: "moderation_not_allowed",
      },
      {
        label: "wrong bucket role",
        row: { ...trusted360p, bucket_role: "private_origin" },
        reason: "wrong_bucket_role",
      },
      {
        label: "non-playback prefix",
        row: {
          ...trusted360p,
          public_playback_path: "renditions/chillywood-city-lights/hls/master.m3u8",
          manifest_path: "renditions/chillywood-city-lights/hls/master.m3u8",
          variant_playlist_path: "renditions/chillywood-city-lights/hls/360p/index.m3u8",
        },
        reason: "non_playback_prefix",
      },
    ];

    for (const entry of blockedFixtures) {
      const gate = loaded.renditionMetadata.canUseTrustedRenditionForPublicCdn(entry.row);
      if (gate.cdnEligible !== false || gate.blockedReason !== entry.reason) {
        fail(`trusted rendition metadata helper must block ${entry.label} with ${entry.reason}`);
      }
    }

    const nonAllowlisted = {
      ...trusted360p,
      public_playback_path: "playback/public/proof-transcode/chillywood-city-lights/not-allowlisted/master.m3u8",
      manifest_path: "playback/public/proof-transcode/chillywood-city-lights/not-allowlisted/master.m3u8",
      variant_playlist_path: "playback/public/proof-transcode/chillywood-city-lights/not-allowlisted/360p/index.m3u8",
    };
    const nonAllowlistedGate = loaded.renditionMetadata.canUseTrustedRenditionForPublicCdn(nonAllowlisted);
    const nonAllowlistedResolution = await loaded.mediaDelivery.resolveMediaPlaybackDelivery({
      asset: loaded.renditionMetadata.buildMediaDeliveryAssetFromTrustedRendition(nonAllowlisted),
      config,
      fallbackUrl,
    });
    if (nonAllowlistedGate.cdnEligible !== true || nonAllowlistedResolution.blockedReason !== "not_in_public_playback_allowlist") {
      fail("trusted rendition metadata helper must still depend on media delivery allowlist for public CDN URL return");
    }
  } finally {
    loaded.cleanup();
  }
};

const loadMediaDeliveryTelemetryHelper = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-delivery-telemetry-guard-"));
  try {
    const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
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
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const requireFromGuard = createRequire(import.meta.url);
    for (const candidate of [
      path.join(outDir, "mediaDeliveryTelemetry.js"),
      path.join(outDir, "_lib", "mediaDeliveryTelemetry.js"),
    ]) {
      try {
        return {
          helper: requireFromGuard(candidate),
          cleanup: () => rmSync(outDir, { recursive: true, force: true }),
        };
      } catch {
        // Try the next compiler output shape.
      }
    }
    throw new Error("compiled telemetry helper missing");
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const assertMediaDeliveryTelemetryHelperPolicy = () => {
  let loaded;
  try {
    loaded = loadMediaDeliveryTelemetryHelper();
  } catch (error) {
    fail(`media delivery telemetry helper must compile for guard proof: ${error instanceof Error ? error.message : "unknown_error"}`);
    return;
  }

  try {
    const event = loaded.helper.buildMediaDeliveryEvent({
      id: "guard_media_delivery_event",
      userId: "raw_user_private_guard",
      videoId: "guard_video",
      creatorId: "raw_creator_private_guard",
      sourceType: "creator_video",
      sourceId: "guard_video",
      deliveryProvider: "cloudflare_r2_custom_domain",
      playbackUrlProvider: "cloudflare_r2_custom_domain",
      mediaDeliveryProvider: "cloudflare_r2_custom_domain",
      qualityLabel: "480p",
      publicPlaybackSafe: true,
      cdnEligible: true,
      fallbackUsed: false,
      watchPartyId: "raw_watch_party_private_guard",
      startedAt: "2026-07-09T01:00:00.000Z",
      endedAt: "2026-07-09T01:00:10.000Z",
      contentLengthBytes: 1000,
      durationSeconds: 20,
      proofMode: true,
      createdAt: "2026-07-09T01:00:10.000Z",
    });

    if (event.table_name !== "media_delivery_events" || event.estimated_bytes !== 500) {
      fail("media delivery telemetry helper must build event table shape and estimate playback bytes");
    }

    const sanitized = loaded.helper.sanitizeMediaDeliveryTelemetryForProof({
      event,
      privateSignedUrl: `https://private-origin.example/source.mp4?X-Amz-${"Signature"}=redactedproof`,
    });
    const sanitizedText = JSON.stringify(sanitized);
    for (const rawNeedle of [
      "raw_user_private_guard",
      "raw_creator_private_guard",
      "raw_watch_party_private_guard",
      "private-origin.example",
      "X-Amz-Signature",
    ]) {
      if (sanitizedText.includes(rawNeedle)) {
        fail(`media delivery telemetry sanitizer must not expose ${rawNeedle}`);
      }
    }
    for (const redactedNeedle of ["redacted:user", "redacted:creator", "redacted:watch_party", "redacted:url"]) {
      if (!sanitizedText.includes(redactedNeedle)) {
        fail(`media delivery telemetry sanitizer must include ${redactedNeedle}`);
      }
    }
  } finally {
    loaded.cleanup();
  }
};

await assertMediaDeliveryHelperPolicy();
await assertMediaRenditionMetadataPolicy();
assertMediaDeliveryTelemetryHelperPolicy();

if (failures.length) {
  console.error("Media delivery architecture guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Media delivery architecture guard passed.");
