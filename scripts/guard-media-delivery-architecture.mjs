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
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const vodDoc = read("docs/VOD_QUALITY_LADDER_AND_PLAYBACK_RESOLVER.md");
const mediaMigrationPlan = read("docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md");
const mediaTranscodeWorkerRunbook = read("docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md");
const wave2Doc = read("docs/WAVE2_CREATOR_MEDIA_CLOSURE_RUNBOOK.md");
const docsCorpus = [architecture, vodDoc, mediaMigrationPlan, mediaTranscodeWorkerRunbook, wave2Doc].join("\n\n");
const mediaStatusCorpus = [architecture, currentState, nextTask].join("\n\n");

const mediaStorage = read("_lib/mediaStorage.ts");
const mediaDelivery = read("_lib/mediaDelivery.ts");
const mediaDeliveryTelemetry = read("_lib/mediaDeliveryTelemetry.ts");
const mediaTranscodeQueue = read("_lib/mediaTranscodeQueue.ts");
const mediaRenditionMetadata = read("_lib/mediaRenditionMetadata.ts");
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
const mediaRenditionMetadataProof = read("scripts/proof-media-rendition-metadata.mjs");
const mediaRenditionMigrationPolicyProof = read("scripts/proof-media-rendition-migration-policy.mjs");
const mediaRenditionMigrationDryRunProof = read("scripts/proof-media-rendition-migration-dry-run.mjs");

const sourceCorpus = [
  mediaStorage,
  mediaDelivery,
  mediaDeliveryTelemetry,
  mediaTranscodeQueue,
  mediaRenditionMetadata,
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
const hasCdnPlaybackPath = /\b(CDN_PLAYBACK|cdnPlayback|createSignedCdn|signedCdn|cdn_base_url|cdn_url|CDN_BASE_URL)\b/.test(sourceCorpus);
const hasPlaybackTelemetry = /\b(media_bandwidth_events|record_media_playback_egress|cdn_access_logs|cdn_access_log|playback_egress_bytes|rendition_bytes_served|edge_bytes_served)\b/i.test(sourceCorpus);
const hasResumableUpload = /\b(createMultipartUpload|completeMultipartUpload|UploadPart|multipart_upload|tus|resumable_upload|direct_upload_session)\b/i.test(sourceCorpus);

if (!hasHlsDemoProofWorker) {
  fail("local HLS demo proof worker script must exist before docs can claim HLS demo proof");
}

assertIncludes(architecture, "Status: staged resolver helpers, proof scripts, architecture, and guard only.", "media delivery architecture doc");
assertIncludes(architecture, "Production transcoding status: not live; no production backend transcode queue/service worker exists in this repo. Local proof scripts and a proof-only queue model exist only for the approved public-safe City Lights demo.", "media delivery architecture doc");
assertIncludes(architecture, "Cloudflare custom domain/cache status: `media.chillywoodstream.com` is connected only to the separate public-playback proof bucket for harmless text and generated demo proof delivery; production CDN playback is not live.", "media delivery architecture doc");
assertIncludes(architecture, "Cloudflare R2 public playback resolver status: staged helper and proof scripts exist; production playback remains disabled by default and still falls back to signed origin.", "R2 public playback resolver status");
assertIncludes(architecture, "Cloudflare R2 private origin status: enabled for proof only; not configured as app production playback by this repo change.", "R2 private origin proof status");
assertIncludes(architecture, "R2 CLI/API proof status: private and public-playback proof upload/readback succeeded through authorized Wrangler access; no production R2 CDN playback is live.", "R2 CLI/API proof status");
assertIncludes(architecture, "R2 proof bucket status: private bucket `chillywood-media-proof` exists, created 2026-07-08T23:26:44.468Z.", "R2 proof bucket status");
assertIncludes(architecture, "R2 proof object status: harmless text object `playback/public/proof/hello.txt` upload/readback succeeded and is kept for proof traceability.", "R2 proof object status");
assertIncludes(architecture, "R2 public-playback proof bucket status: separate bucket `chillywood-media-public-playback-proof` exists, created 2026-07-08T23:47:12.035Z, and is distinct from the private proof bucket.", "R2 public-playback proof bucket status");
assertIncludes(architecture, "R2 public-playback proof object status: harmless text object `playback/public/proof/hello.txt`, immutable cache proof text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt`, generated demo MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4`, approved real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`, local-proof HLS tree `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`, and proof-only transcode queue HLS tree `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/` are public-safe proof assets only.", "R2 public-playback proof object status");
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
assertIncludes(architecture, "Local HLS demo proof status: `scripts/proof-media-delivery-hls-demo.mjs` downloads the approved City Lights public-safe MP4, verifies SHA-256 short hash `b670602fa00934ca`, locally generates 360p and 480p HLS with ffmpeg, uploads only proof HLS assets to `chillywood-media-public-playback-proof`, and proves `master.m3u8`, variant playlists, segments, and ffmpeg HLS decode through `media.chillywoodstream.com`. This is a local proof worker only; production HLS/transcoding remains not live.", "local HLS demo proof status");
assertIncludes(architecture, "Local HLS demo public path: `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8` returns HTTP 200 with `Content-Type: application/vnd.apple.mpegurl` and `Cache-Control: public, max-age=300`; variant playlists `360p/index.m3u8` and `480p/index.m3u8` return HTTP 200 and reference versioned `.ts` segments.", "local HLS public path proof");
assertIncludes(architecture, "Local HLS segment cache proof: after a narrow Cloudflare Cache Rule scoped only to `media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/*.ts`, versioned HLS segments return HTTP 200, `Content-Type: video/mp2t`, `Cache-Control: public, max-age=31536000, immutable`, and `cf-cache-status: HIT` after warmup. No production egress or cost savings are claimed.", "local HLS segment cache proof");
assertIncludes(architecture, "Local HLS resolver proof: the staged resolver returns `https://media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8` only when `cdnAllowedPublicPlaybackPaths` explicitly contains that master manifest and `publicPlaybackSafe=true`; the source MP4 and segment paths fall back with `not_in_public_playback_allowlist` under the HLS proof config.", "local HLS resolver proof");
assertIncludes(architecture, "App/player HLS proof status: `npm run proof:media-delivery-hls-demo` now includes a proof-only app/player harness for `app/player/[id].tsx`. It verifies the Player route source contract maps `displayItem.video_url` into `{ uri }`, verifies `Video` receives `source={playbackSource}` with `onLoad` and `onPlaybackStatusUpdate`, and reports `playerReceivesHlsUrl=true`, `onLoadObserved=true`, `durationMillis=52208`, `progressObserved=true`, `progressMillis=2175`, `isPlaying=true`, `playbackStarted=true`, `ffmpegDecode=passed`, `productionPlaybackSwitched=false`, and `privateSignedOriginUrlExposed=false` for the allowlisted HLS master URL only.", "app/player HLS proof status");
assertIncludes(architecture, "Proof-only transcode queue foundation status: `_lib/mediaTranscodeQueue.ts` and `npm run proof:media-transcode-queue-hls` model `queued -> probing -> transcoding -> uploading -> ready` for the approved City Lights demo only; no production backend queue/service worker, database writes, trusted `video_renditions` rows, or production playback switch is live.", "proof-only transcode queue foundation status");
assertIncludes(architecture, "Proof-only transcode queue output path: `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8` returned HTTP 200 through `media.chillywoodstream.com`; 360p and 480p variant playlists returned HTTP 200; ffmpeg decoded the public HLS master URL successfully.", "proof-only transcode queue output path");
assertIncludes(architecture, "Proof-only transcode queue cache result: after a narrow Cloudflare Cache Rule scoped only to `media.chillywoodstream.com/playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/*.ts`, queue-generated `.ts` segments returned HTTP 200, `Content-Type: video/mp2t`, `Cache-Control: public, max-age=31536000, immutable`, and `cf-cache-status: HIT` after warmup. No cache savings or production egress savings are claimed.", "proof-only transcode queue cache result");
assertIncludes(architecture, "Proof-only transcode queue resolver proof: only a completed ready proof job can produce the allowlisted HLS master URL; queued and failed proof jobs cannot resolve, non-allowlisted outputs fall back with `not_in_public_playback_allowlist`, and private/original/Premium/unscanned/moderation-blocked/default creator-video paths fall back or block.", "proof-only transcode queue resolver proof");
assertIncludes(architecture, "Proof-only transcode queue telemetry proof: the queue proof builds sanitized HLS `media_delivery_events` shapes with `deliveryFormat=hls`, 360p/480p rendition labels, estimated bytes, observed `cdn_cache_status`, and `proof_mode=true`; no production telemetry writes or table migrations are live.", "proof-only transcode queue telemetry proof");
assertIncludes(architecture, "Production transcode worker runbook status: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` defines the future worker runtime, inputs, safety checks, processing flow, failure behavior, security, rollback, and activation gates. It is design/runbook only; no production worker is deployed, no production queue processor is running, no production media rows are written, and production playback remains signed-origin fallback.", "production transcode worker runbook status");
assertIncludes(architecture, "Local transcode worker proof status: `npm run proof:media-transcode-worker-local` uses only the approved public-safe City Lights MP4, simulates `queued -> probing -> transcoding -> uploading -> ready`, generates local 360p/480p HLS, validates master/variants/segments and ffmpeg decode, simulates upload keys under `playback/public/proof-worker/`, builds trusted `media_renditions` rows in memory, validates resolver eligibility, builds sanitized telemetry events, proves failed-job blocking, and runs a disposable PGlite worker-policy proof. It does not connect to production DB, upload R2 objects, write production rows, deploy a worker, or switch playback.", "local transcode worker proof status");
assertIncludes(architecture, "Backup/PITR activation gate: PITR is currently off, WAL-G is enabled, and no manual backup records were listed; PITR or owner-approved backup/restore readiness is required before future production writes, backfill, or worker activation.", "backup PITR worker activation gate");
assertIncludes(architecture, "Trusted rendition metadata foundation status: `_lib/mediaRenditionMetadata.ts` and `npm run proof:media-rendition-metadata` are source/proof-only.", "trusted rendition metadata foundation status");
assertIncludes(architecture, "No production `video_renditions` writes, production media row backfill, backend worker write path, or production playback switch is live.", "trusted rendition metadata production boundary");
assertIncludes(architecture, "Trusted backend migration path status: `docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md`, migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql`, and `npm run proof:media-rendition-migration-policy` define and statically prove the server-owned `media_transcode_jobs` plus `media_renditions` path.", "trusted backend migration path status");
assertIncludes(architecture, "Production schema migration status: applied to production on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`); tables/indexes/RLS/policies/grants were read back and both `media_transcode_jobs` and `media_renditions` had row count 0 after the rollback-only runtime policy proof.", "trusted backend migration schema apply status");
assertIncludes(architecture, "Production data/write boundary: no production media backfill, real media row insert, production `video_renditions` write, production resolver bridge, production transcode worker, or production playback switch is live.", "trusted backend migration production boundary");
assertIncludes(architecture, "Trusted backend migration dry-run status: `npm run proof:media-rendition-migration-dry-run` passes static SQL validation and runtime apply/RLS checks in an in-memory disposable local Postgres runtime via `@electric-sql/pglite`.", "trusted backend migration dry-run status");
assertIncludes(architecture, "proves anon/authenticated trusted writes are denied, proves service-role/worker writes pass, proves resolver-safe anon select returns one clean public-ready row", "trusted backend migration dry-run runtime proof");
assertIncludes(architecture, "Production runtime policy proof: a rollback-only production transaction denied anon/authenticated trusted writes, allowed service-role/worker proof writes, verified resolver-safe select for one clean public-ready proof row, verified unsafe/original/Premium/private/non-public-prefix rows failed eligibility, and rolled back.", "trusted backend migration production runtime proof");
assertIncludes(architecture, "Trusted City Lights HLS fixture status: the proof fixture models 360p and 480p HLS rows for creator video `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1` using master manifest `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8`.", "trusted City Lights HLS fixture status");
assertIncludes(architecture, "The resolver proof returns `media.chillywoodstream.com` only when the row is ready, public, clean or approved, moderation-allowed, `bucket_role=public_playback`, `storage_provider=cloudflare_r2`, `delivery_provider=cloudflare_r2_custom_domain`, `is_public_playback_safe=true`, `is_original=false`, under `playback/public/`, and explicitly allowlisted.", "trusted rendition resolver eligibility status");
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
assertIncludes(architecture, "Production transcode worker runbook and local proof harness exist: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` and `npm run proof:media-transcode-worker-local` model a future worker locally with safe City Lights demo input only, local HLS generation, simulated public upload keys, in-memory trusted rendition rows, sanitized telemetry, failed-job proof, and disposable PGlite write-policy proof. No production worker is deployed and no production rows are written.", "production transcode worker runbook checkpoint");
assertIncludes(architecture, "Trusted rendition metadata source/proof foundation models future Cloudflare R2 HLS rows and proves only the City Lights ready public-safe HLS fixture can bridge into the existing resolver allowlist.", "trusted rendition metadata checkpoint");
assertIncludes(architecture, "Trusted backend migration path is designed, proofed, and applied to production as schema only for server-owned `media_transcode_jobs` and `media_renditions`; clients cannot write trusted readiness, public-safe, path, worker version, or source hash fields.", "trusted backend migration checkpoint");
assertIncludes(architecture, "Trusted backend migration production readback and rollback-only proof are complete: tables/indexes/RLS/policies/grants exist, client trusted writes are denied, service-role/worker proof writes work inside rollback, resolver-safe select sees only clean public-ready proof rows, and final production row counts are zero.", "trusted backend migration production proof checkpoint");
assertIncludes(architecture, "Media bandwidth telemetry backend writes, table migrations, CDN log ingestion, and provider reconciliation remain planned.", "telemetry planned checkpoint");
assertIncludes(architecture, "Media delivery telemetry source/proof foundation exists for future `media_delivery_events` and `media_playback_sessions`; backend writes and table migrations remain planned.", "telemetry foundation checkpoint");
assertIncludes(architecture, "Production HLS/transcoding implementation remains planned.", "HLS planned checkpoint");
assertIncludes(architecture, "Production transcode worker deployment remains planned and requires PITR or owner-approved backup/restore readiness before any future production writes, backfill, or worker activation.", "production worker deployment planned checkpoint");
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
assertIncludes(architecture, "The bucket currently contains only public-safe proof assets: text proof object `playback/public/proof/hello.txt`, cache-HIT text proof object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt`, generated demo proof MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4`, approved real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`, local-proof HLS assets under `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`, and proof-only transcode queue HLS assets under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`.", "public-playback proof bucket contents");
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
assertIncludes(architecture, "Keep cache rules narrow. The only applied cache rules in this lane are the cache-HIT proof prefix `media.chillywoodstream.com/playback/public/proof/cache-hit/*`, the City Lights HLS proof segment path `media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/*.ts`, and the proof-transcode queue HLS segment path `media.chillywoodstream.com/playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/*.ts`; do not add broad Cache Everything behavior.", "narrow cache rule inventory");
assertIncludes(architecture, "Forbidden-prefix probes under `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, and `unscanned/` returned HTTP 404 through the public proof hostname.", "forbidden prefix public proof");
assertIncludes(architecture, "Public-playback proof audit: bucket list shows `chillywood-media-public-playback-proof`, r2.dev status is disabled, custom-domain list contains `media.chillywoodstream.com`, and the proof object still reads back as harmless text through authorized Wrangler access.", "public-playback proof audit");
assertIncludes(architecture, "Supabase/Edge resolver remains the access-control and playback decision layer.", "Supabase/Edge resolver boundary");
assertIncludes(architecture, "The app must ask the backend resolver for playback; the app must not hard-code R2 or Cloudflare custom-domain decisions.", "app resolver contract");
assertIncludes(architecture, "`_lib/mediaDelivery.ts` stages the Cloudflare R2 custom-domain resolver helper for future safe public playback assets.", "staged public playback resolver");
assertIncludes(architecture, "`resolveMediaPlaybackDelivery(...)` returns `media.chillywoodstream.com` only when the delivery provider is `cloudflare_r2_custom_domain`, `MEDIA_CDN_BASE_URL` is configured, `MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true`, the asset path starts with `playback/public/`, and the caller explicitly marks the asset `publicPlaybackSafe`.", "staged public playback resolver contract");
assertIncludes(architecture, "Proof-only real demo mode also passes `cdnAllowedPublicPlaybackPaths` so only the approved City Lights public demo path can use the custom-domain URL in that proof.", "staged public playback resolver allowlist contract");
assertIncludes(architecture, "The helper blocks public CDN URLs for original/master/source paths, `original` quality, unscanned assets, moderation-blocked assets, private/owner assets, and Premium-only assets until signed/token CDN access is implemented and proved.", "staged public playback resolver blocks");
assertIncludes(architecture, "Current VOD production wiring passes `publicPlaybackSafe: false`, so existing creator-video playback still uses signed origin fallback even if CDN config is present.", "staged public playback resolver fallback");
assertIncludes(architecture, "`scripts/proof-media-delivery-public-demo.mjs` proves the generated demo MP4 resolves through the helper, fetches over `media.chillywoodstream.com`, supports byte-range playback, decodes with ffprobe/ffmpeg and frame-count proof, reports proof-only app playback metadata, has no signed-origin query string, and keeps private/original/Premium/unscanned/moderation-blocked/default creator-video paths on fallback or block.", "public demo proof script contract");
assertIncludes(architecture, "`scripts/proof-media-delivery-real-demo.mjs` proves the approved City Lights demo resolves through the explicit allowlist, fetches over `media.chillywoodstream.com`, supports byte-range playback, decodes with ffprobe/ffmpeg and frame-count proof, keeps a non-allowlisted public-safe demo path on fallback with `not_in_public_playback_allowlist`, and keeps private/original/Premium/unscanned/moderation-blocked/default creator-video paths on fallback or block.", "real demo proof script contract");
assertIncludes(architecture, "`scripts/proof-media-delivery-hls-demo.mjs` is a local proof worker that downloads the approved City Lights public-safe MP4, generates 360p/480p HLS, uploads proof-only HLS assets to the public-playback proof bucket, proves public master/variant/segment fetches plus segment cache HIT and ffmpeg decode, proves the proof-only app/player HLS harness receives the allowlisted master, load/progress/playback evidence is present, and proves the resolver returns only the allowlisted HLS master manifest while source MP4 and segment paths fall back.", "HLS demo proof script contract");
assertIncludes(architecture, "Production playback remains unchanged until a later approved lane adds trusted public-safe asset metadata, cache-HIT proof, telemetry, and signed/token CDN access for non-public assets.", "staged public playback resolver production boundary");
assertIncludes(architecture, "Creator-video Watch-Party sources must use the same creator-video playback resolver path as standalone Player.", "media delivery architecture doc");
assertIncludes(architecture, "HLS/transcoding is a future milestone unless implemented and proved.", "HLS/transcoding status");
assertIncludes(architecture, "Current proof scope: local proof workers and a proof-only queue model have generated and proved 360p/480p HLS for the approved public-safe City Lights demo only. This does not create a production transcode queue, does not insert trusted `video_renditions` rows, does not migrate creator-video playback, and does not make HLS/transcoding live for production.", "HLS demo proof scope");
assertIncludes(architecture, "App/player HLS playback proof is complete only in a proof-only local harness for the allowlisted City Lights HLS master URL. Normal Player creator-video playback remains signed-origin fallback by default.", "app/player HLS proof scope");
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
assertIncludes(currentState, "private proof bucket `chillywood-media-proof` remains private with r2.dev disabled and no custom domain", "current state private bucket boundary");
assertIncludes(currentState, "Owner-approved `media.chillywoodstream.com` is connected only to `chillywood-media-public-playback-proof`", "current state custom-domain boundary");
assertIncludes(currentState, "Real public-safe City Lights demo MP4 `https://media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` returned HTTP 200, byte-range HTTP 206, `Content-Type: video/mp4`, immutable cache metadata, repeated warm `cf-cache-status: HIT`, H.264 854x480 ffprobe metadata, ffmpeg decode proof, and `decodedFrameCount=1253`.", "current state real demo proof");
assertIncludes(currentState, "Local HLS proof worker `npm run proof:media-delivery-hls-demo` generated 360p/480p HLS from the approved City Lights MP4, uploaded 24 proof-only HLS assets under `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`, proved HTTP 200 for `master.m3u8` and variant playlists, proved `video/mp2t` HLS segments with immutable cache headers and `cf-cache-status: HIT` after a narrow HLS segment cache rule, decoded the public HLS master URL with ffmpeg, and proved the resolver returns the CDN URL only for the allowlisted HLS master while source MP4 and segment paths fall back with `not_in_public_playback_allowlist`.", "current state local HLS proof");
assertIncludes(currentState, "The same HLS proof now includes a proof-only app/player harness for `app/player/[id].tsx`: Player source contract receives the HLS master as `{ uri }`, load status reports `durationMillis=52208`, progress reports `progressMillis=2175`, `isPlaying=true`, `playbackStarted=true`, `ffmpegDecode=passed`, and `privateSignedOriginUrlExposed=false`.", "current state app/player HLS proof");
assertIncludes(currentState, "Proof-only transcode queue foundation `npm run proof:media-transcode-queue-hls` models `queued -> probing -> transcoding -> uploading -> ready` for the approved City Lights demo, generates 360p/480p HLS, uploads 24 proof-only HLS objects under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`, fetches master/variant/segment objects through `media.chillywoodstream.com`, decodes the public HLS master with ffmpeg, and keeps production DB writes, production transcode service, and production playback disabled.", "current state proof-only transcode queue foundation");
assertIncludes(currentState, "A third narrow Cloudflare cache rule now applies only to `media.chillywoodstream.com/playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/*.ts`; queue-path segment fetches returned HTTP 200 with `Content-Type: video/mp2t`, immutable cache metadata, and `cf-cache-status: HIT` after warmup. Queue-path cache behavior is proved only for that public proof prefix; production egress savings are not claimed.", "current state proof-only transcode queue cache boundary");
assertIncludes(currentState, "The real demo resolver proof uses `cdnAllowedPublicPlaybackPaths` so only the approved City Lights path resolves to `media.chillywoodstream.com`; non-allowlisted public-safe, private, original, Premium-only, unscanned, moderation-blocked, unsafe, default creator-video, or missing-config assets fall back or block.", "current state real demo allowlist proof");
assertIncludes(currentState, "Media delivery telemetry foundation is source/proof-only: `_lib/mediaDeliveryTelemetry.ts` and `npm run proof:media-delivery-telemetry` build sanitized `media_delivery_events` and `media_playback_sessions` shapes, estimate bytes, redact proof identifiers and URL-like values, and perform no backend writes or production telemetry table writes.", "current state telemetry foundation");
assertIncludes(currentState, "Trusted rendition metadata foundation is source/proof-only: `_lib/mediaRenditionMetadata.ts` and `npm run proof:media-rendition-metadata` model future Cloudflare R2 HLS rendition rows, prove the City Lights 360p/480p HLS fixture can resolve only through the explicit `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8` allowlist, and prove not-ready, original/master, Premium/private, unsafe scan/moderation, wrong bucket role, non-public prefix, non-allowlisted, and default creator-video paths block or fall back.", "current state trusted rendition metadata foundation");
assertIncludes(currentState, "Production `video_renditions` writes, production rendition metadata writes, production transcode service, and production playback switching remain not live.", "current state trusted rendition production boundary");
assertIncludes(currentState, "Trusted backend migration schema is applied to production as schema only: `docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md`, migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql`, and `npm run proof:media-rendition-migration-policy` define server-owned `media_transcode_jobs` plus `media_renditions` for future Cloudflare R2/HLS rows.", "current state trusted backend migration path");
assertIncludes(currentState, "Production schema migration status: applied to production on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`); tables/indexes/RLS/policies/grants were read back and both `media_transcode_jobs` and `media_renditions` had row count 0 after the rollback-only runtime policy proof.", "current state trusted backend migration schema apply");
assertIncludes(currentState, "Production data/write boundary: no production media backfill, real media row insert, production `video_renditions` write, production resolver bridge, production transcode worker, or production playback switch is live.", "current state trusted backend migration boundary");
assertIncludes(currentState, "clients cannot mark rows ready, set `public_playback_path`, set `is_public_playback_safe`, or create trusted CDN eligibility from client-controlled data.", "current state trusted client write boundary");
assertIncludes(currentState, "Trusted backend migration dry-run still passes runtime proof in a safe disposable local database: `npm run proof:media-rendition-migration-dry-run` validates the migration SQL structure, applies `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql` inside an in-memory `@electric-sql/pglite` Postgres runtime", "current state trusted backend migration dry-run runtime proof");
assertIncludes(currentState, "denies anon/authenticated trusted writes with SQLSTATE `42501`, allows service-role/worker job/rendition writes, proves resolver-safe anon select returns one clean public-ready row, denies unsafe/original/Premium/private/wrong-bucket/non-public-prefix public-CDN rows with SQLSTATE `23514`", "current state trusted backend migration dry-run RLS proof");
assertIncludes(currentState, "Production runtime policy proof also passed in a rollback-only transaction: anon/authenticated trusted writes were denied, service-role/worker proof writes were allowed, resolver-safe select saw one clean public-ready proof row, unsafe/original/Premium/private/non-public-prefix rows failed eligibility, and the transaction rolled back.", "current state trusted backend migration production RLS proof");
assertIncludes(currentState, "Production transcode worker runbook and local proof harness are design/proof-only: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` defines the future worker runtime, safety checks, processing flow, failure behavior, security, rollback, and activation gates, and `npm run proof:media-transcode-worker-local` uses only the approved public-safe City Lights MP4 to simulate `queued -> probing -> transcoding -> uploading -> ready`, generate local 360p/480p HLS, validate master/variant/segment outputs and ffmpeg decode, simulate upload keys under `playback/public/proof-worker/`, build trusted `media_renditions` rows in memory, validate resolver eligibility, build sanitized telemetry, prove failed-job blocking, and run disposable PGlite worker-policy proof.", "current state production transcode worker local proof status");
assertIncludes(currentState, "It does not connect to production DB, write production rows, upload R2 objects, deploy a worker, run a production queue processor, or switch playback.", "current state local worker no production writes");
assertIncludes(currentState, "PITR is currently off, WAL-G is enabled, and no manual backup records were listed; PITR or owner-approved backup/restore readiness is required before future production worker writes, backfill, or worker activation.", "current state backup PITR worker gate");
assertIncludes(currentState, "Production HLS/transcoding remains not live: there is no production backend transcode queue/service worker, no trusted `video_renditions` rows for the proof HLS assets, and no production playback switch.", "current state production HLS boundary");
assertIncludes(currentState, "`_lib/mediaDelivery.ts` still stages disabled-by-default Cloudflare R2 custom-domain resolver support", "current state staged resolver support");
assertIncludes(currentState, "Current VOD production wiring passes `publicPlaybackSafe: false`, so existing creator-video playback still uses signed-origin fallback.", "current state production playback fallback");
assertIncludes(nextTask, "Separate public-playback proof bucket `chillywood-media-public-playback-proof` exists and is distinct from `chillywood-media-proof`.", "next task bucket separation");
assertIncludes(nextTask, "Staged resolver support exists in `_lib/mediaDelivery.ts` and is proved by `npm run proof:media-delivery-resolver` plus `npm run proof:media-delivery-public-demo`.", "next task staged resolver support");
assertIncludes(nextTask, "`npm run proof:media-delivery-real-demo` proves only the approved City Lights public demo allowlist path through `media.chillywoodstream.com`; production creator-video playback is still unchanged.", "next task real demo proof");
assertIncludes(nextTask, "HLS proof URL `https://media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8` returned HTTP 200; variant playlists returned HTTP 200; HLS segments returned HTTP 200 with `Content-Type: video/mp2t`, immutable cache metadata, and `cf-cache-status: HIT` after a narrow HLS segment cache rule.", "next task local HLS proof");
assertIncludes(nextTask, "HLS resolver proof returns `media.chillywoodstream.com` only for the allowlisted HLS master manifest; source MP4 and segment paths fall back with `not_in_public_playback_allowlist`.", "next task local HLS resolver proof");
assertIncludes(nextTask, "Proof-only app/player HLS harness for `app/player/[id].tsx` proves the allowlisted HLS master is received as `{ uri }`, load status reports `durationMillis=52208`, progress reports `progressMillis=2175`, `isPlaying=true`, `playbackStarted=true`, and no private signed origin URL is exposed.", "next task app/player HLS proof");
assertIncludes(nextTask, "`npm run proof:media-transcode-queue-hls` proves a source/proof-only queue model for the approved City Lights demo: local job states reach ready, 360p/480p HLS is generated, 24 proof-only objects are uploaded under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`, public HLS fetch/decode passes, completed-job resolver allowlist passes, queued/failed/non-allowlisted outputs cannot resolve, and production DB writes/playback/transcode service remain disabled.", "next task proof-only transcode queue proof");
assertIncludes(nextTask, "A third narrow Cloudflare cache rule now applies only to `media.chillywoodstream.com/playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/*.ts`; queue segments returned immutable cache metadata with `cf-cache-status: HIT` after warmup. Queue-path cache behavior is proved only for that proof prefix, and production egress savings are not claimed.", "next task proof-only transcode queue cache boundary");
assertIncludes(nextTask, "Telemetry foundation exists only as `_lib/mediaDeliveryTelemetry.ts` and `npm run proof:media-delivery-telemetry`; no production telemetry writes, table migrations, billing/payout changes, or playback switches are live.", "next task telemetry foundation");
assertIncludes(nextTask, "Trusted rendition metadata foundation exists only as `_lib/mediaRenditionMetadata.ts` and `npm run proof:media-rendition-metadata`; City Lights 360p/480p proof fixture rows can resolve the allowlisted HLS master, while not-ready, original/master, Premium/private, unsafe scan/moderation, wrong bucket role, non-public prefix, non-allowlisted, and default creator-video paths block or fall back.", "next task trusted rendition metadata foundation");
assertIncludes(nextTask, "Trusted backend migration schema is applied to production as schema only: migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql` created server-owned `media_transcode_jobs` plus `media_renditions`; tables/indexes/RLS/policies/grants were read back, clients cannot write trusted ready/public-safe/path metadata, final row counts are zero, and production playback remains unchanged.", "next task trusted backend migration path");
assertIncludes(nextTask, "Trusted backend migration dry-run still passes static SQL validation plus runtime apply/RLS proof through `npm run proof:media-rendition-migration-dry-run` using an in-memory disposable `@electric-sql/pglite` Postgres runtime.", "next task trusted backend migration dry-run");
assertIncludes(nextTask, "Production rollback-only RLS proof also passed: anon/authenticated trusted writes were denied, service-role/worker proof writes were allowed, resolver-safe select saw one clean public-ready proof row, unsafe/original/Premium/private/non-public-prefix public-CDN rows failed eligibility, the transaction rolled back, and no proof rows persisted.", "next task trusted backend migration production proof");
assertIncludes(nextTask, "Production transcode worker runbook and local proof harness exist: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` defines the future worker runtime/safety/rollback/activation model, and `npm run proof:media-transcode-worker-local` uses only approved City Lights demo media to generate local 360p/480p HLS, simulate upload keys under `playback/public/proof-worker/`, build trusted rows in memory, validate resolver eligibility, build sanitized telemetry, prove failed-job blocking, and run disposable PGlite worker-policy proof.", "next task production transcode worker local proof status");
assertIncludes(nextTask, "The local worker proof does not connect to production DB, write production rows, upload R2 objects, deploy a worker, run a production queue processor, or switch playback.", "next task local worker no production writes");
assertIncludes(nextTask, "Backup/PITR gate is not satisfied for production worker activation: PITR is currently off, WAL-G is enabled, and no manual backup records were listed. PITR or owner-approved backup/restore readiness is required before future production worker writes, backfill, or worker activation.", "next task backup PITR gate");
assertIncludes(nextTask, "Production HLS/transcoding is still not live: no production backend transcode queue/service worker, no trusted production `video_renditions` rows for the proof HLS assets, no production rendition metadata writes, and no creator-video playback migration.", "next task production HLS boundary");
assertIncludes(nextTask, "Current VOD production wiring keeps `publicPlaybackSafe: false`, so existing creator-video playback still falls back to signed origin by default.", "next task production fallback");
assertIncludes(nextTask, "Next real media milestone is explicit owner approval for backup/PITR readiness and a staged worker activation lane, not production playback migration", "next task worker activation gate next step");
assertIncludes(nextTask, "Do not enable public access on `chillywood-media-proof`.", "private bucket public access prohibition");

const transcodeLiveClaims = claimSentences(
  docsCorpus,
  /\b(transcod(?:e|er|ing)|HLS\/ABR|ffmpeg|derived renditions)\b/i,
  /\b(live|active|deployed|proved|closed|production-ready)\b/i,
).filter((sentence) => !/\b(local proof|proof-only|demo proof|public-safe City Lights|approved City Lights|production HLS\/transcoding remains not live|production remains not live)\b/i.test(sentence));
if (transcodeLiveClaims.length && !hasTranscodeWorker) {
  fail(`docs claim transcoding is live without worker proof: ${transcodeLiveClaims.join(" | ")}`);
}

const cdnLiveClaims = claimSentences(
  deliveryClaimsCorpus,
  /\b(CDN|edge cache|signed CDN|CloudFront|Bunny|Cloudflare CDN|Cloudflare custom domain|custom-domain\/cache|media\.chillywoodstream\.com)\b/i,
  /\b(live|active|deployed|proved|closed|production-ready|enabled|connected|serving|working)\b/i,
).filter((sentence) => !/\b(proof|harmless|public-playback proof|public proof)\b/i.test(sentence));
if (cdnLiveClaims.length && !hasCdnPlaybackPath) {
  fail(`docs claim CDN playback is live without CDN playback path: ${cdnLiveClaims.join(" | ")}`);
}

const r2CdnLiveClaims = claimSentences(
  mediaStatusCorpus,
  /\b(R2 CDN|R2 custom domain|Cloudflare custom domain|custom-domain\/cache|media\.chillywoodstream\.com)\b/i,
  /\b(live|active|deployed|proved|closed|production-ready|enabled|connected|serving|working)\b/i,
).filter((sentence) => !/\b(proof|harmless|public-playback proof|public proof)\b/i.test(sentence));
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
    && !/\b(not|no|unchanged|until|do not|must not|fallback|planned|future|without)\b/i.test(sentence)) {
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
);
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
  currentState,
  nextTask,
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
  /\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b/,
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
assertIncludes(mediaMigrationPlan, "Status: production schema applied as schema only.", "trusted rendition migration plan status");
assertIncludes(mediaMigrationPlan, "Production schema migration status: applied to production on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`);", "trusted rendition migration plan production schema status");
assertIncludes(mediaMigrationPlan, "Production data/write boundary: no production media backfill, real media row insert, production `video_renditions` write, production resolver bridge, production transcode worker, or production playback switch is live.", "trusted rendition migration plan production data boundary");
assertIncludes(mediaMigrationPlan, "Production runtime policy proof: a rollback-only production transaction denied anon/authenticated trusted writes", "trusted rendition migration plan rollback proof");
assertIncludes(mediaMigrationPlan, "`service_role` / backend worker is the only intended writer", "trusted rendition migration plan write authority");
assertIncludes(mediaMigrationPlan, "Public CDN eligibility must never come from app/client input", "trusted rendition migration plan client trust boundary");
assertIncludes(mediaMigrationPlan, "Clients cannot mark rows ready.", "trusted rendition migration plan ready write block");
assertIncludes(mediaMigrationPlan, "Clients cannot set `public_playback_path`.", "trusted rendition migration plan public path write block");
assertIncludes(mediaMigrationPlan, "Clients cannot set `is_public_playback_safe`.", "trusted rendition migration plan public safety write block");
assertIncludes(mediaMigrationPlan, "A separate `media_renditions` table is safer", "trusted rendition migration plan separate table decision");
assertIncludes(mediaMigrationPlan, "Owner approval to apply the schema migration: complete for schema only.", "trusted rendition migration plan production activation gate");
assertIncludes(mediaMigrationPlan, "## Dry-Run Status", "trusted rendition migration plan dry-run section");
assertIncludes(mediaMigrationPlan, "`npm run proof:media-rendition-migration-dry-run`", "trusted rendition migration plan dry-run proof script");
assertIncludes(mediaMigrationPlan, "Static SQL validation passed.", "trusted rendition migration plan static dry-run status");
assertIncludes(mediaMigrationPlan, "Runtime dry-run passed in an in-memory disposable local Postgres runtime via `@electric-sql/pglite`.", "trusted rendition migration plan runtime dry-run status");
assertIncludes(mediaMigrationPlan, "Anon/authenticated client writes were denied for ready rendition inserts, trusted path/readiness/public-safe updates, and ready transcode-job inserts.", "trusted rendition migration plan client denial proof");
assertIncludes(mediaMigrationPlan, "Service-role/worker writes passed for queued job insert, `queued -> probing -> transcoding -> uploading -> ready` status updates, failed job insert, and ready public-safe rendition insert.", "trusted rendition migration plan service role proof");
assertIncludes(mediaMigrationPlan, "## Worker Runbook And Local Proof Status", "trusted rendition migration plan worker proof section");
assertIncludes(mediaMigrationPlan, "`docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` now defines the future production transcode worker design", "trusted rendition migration plan worker runbook status");
assertIncludes(mediaMigrationPlan, "`npm run proof:media-transcode-worker-local` is local proof only.", "trusted rendition migration plan local worker proof status");
assertIncludes(mediaMigrationPlan, "The local worker proof does not connect to production DB, does not write production rows, does not upload R2 objects, does not deploy a worker, does not run a production queue processor, and does not switch playback.", "trusted rendition migration plan local worker no production writes");
assertIncludes(mediaMigrationPlan, "Backup/PITR gate: PITR is currently off, WAL-G is enabled, and no manual backup records were listed in the production schema closeout.", "trusted rendition migration plan backup PITR gate");
assertIncludes(mediaTranscodeWorkerRunbook, "Status: design and local proof only.", "media transcode worker runbook status");
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
assertIncludes(mediaStorageFunction, "return userHasActiveEntitlement(adminClient, user.id, [\"premium\"])", "media-storage Premium rendition guard");

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
assertIncludes(packageJson, "\"proof:media-rendition-metadata\"", "package trusted rendition metadata proof script");
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
assertIncludes(mediaRenditionMigrationPolicyProof, "productionMediaRowsWritten: false", "trusted rendition migration policy no production media row writes");
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
      privateSignedUrl: "https://private-origin.example/source.mp4?X-Amz-Signature=redactedproof",
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
