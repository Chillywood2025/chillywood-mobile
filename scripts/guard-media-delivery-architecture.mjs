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
  /\b(not|no|never|missing|pending|planned|target|future|foundation|blocked|fallback|without|until|exclude|excludes|excluded)\b/i.test(sentence)
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
const wave2Doc = read("docs/WAVE2_CREATOR_MEDIA_CLOSURE_RUNBOOK.md");
const docsCorpus = [architecture, vodDoc, wave2Doc].join("\n\n");
const mediaStatusCorpus = [architecture, currentState, nextTask].join("\n\n");

const mediaStorage = read("_lib/mediaStorage.ts");
const mediaDelivery = read("_lib/mediaDelivery.ts");
const mediaStorageFunction = read("supabase/functions/media-storage/index.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const vodQuality = read("_lib/vodQuality.ts");
const performancePolicy = read("_lib/performancePolicy.ts");
const player = read("app/player/[id].tsx");
const watchPartyContentSources = read("_lib/watchPartyContentSources.ts");
const migration = read("supabase/migrations/202605140010_vod_quality_ladder_resolver.sql");
const packageJson = read("package.json");
const mediaDeliveryResolverProof = read("scripts/proof-media-delivery-resolver.mjs");
const mediaDeliveryPublicDemoProof = read("scripts/proof-media-delivery-public-demo.mjs");
const mediaDeliveryRealDemoProof = read("scripts/proof-media-delivery-real-demo.mjs");

const sourceCorpus = [
  mediaStorage,
  mediaDelivery,
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
const hasCdnPlaybackPath = /\b(CDN_PLAYBACK|cdnPlayback|createSignedCdn|signedCdn|cdn_base_url|cdn_url|CDN_BASE_URL)\b/.test(sourceCorpus);
const hasPlaybackTelemetry = /\b(media_bandwidth_events|record_media_playback_egress|cdn_access_logs|cdn_access_log|playback_egress_bytes|rendition_bytes_served|edge_bytes_served)\b/i.test(sourceCorpus);
const hasResumableUpload = /\b(createMultipartUpload|completeMultipartUpload|UploadPart|multipart_upload|tus|resumable_upload|direct_upload_session)\b/i.test(sourceCorpus);

assertIncludes(architecture, "Status: staged resolver helpers, proof scripts, architecture, and guard only.", "media delivery architecture doc");
assertIncludes(architecture, "Transcoding status: not live; no worker exists in this repo.", "media delivery architecture doc");
assertIncludes(architecture, "Cloudflare custom domain/cache status: `media.chillywoodstream.com` is connected only to the separate public-playback proof bucket for harmless text and generated demo proof delivery; production CDN playback is not live.", "media delivery architecture doc");
assertIncludes(architecture, "Cloudflare R2 public playback resolver status: staged helper and proof scripts exist; production playback remains disabled by default and still falls back to signed origin.", "R2 public playback resolver status");
assertIncludes(architecture, "Cloudflare R2 private origin status: enabled for proof only; not configured as app production playback by this repo change.", "R2 private origin proof status");
assertIncludes(architecture, "R2 CLI/API proof status: private and public-playback proof upload/readback succeeded through authorized Wrangler access; no production R2 CDN playback is live.", "R2 CLI/API proof status");
assertIncludes(architecture, "R2 proof bucket status: private bucket `chillywood-media-proof` exists, created 2026-07-08T23:26:44.468Z.", "R2 proof bucket status");
assertIncludes(architecture, "R2 proof object status: harmless text object `playback/public/proof/hello.txt` upload/readback succeeded and is kept for proof traceability.", "R2 proof object status");
assertIncludes(architecture, "R2 public-playback proof bucket status: separate bucket `chillywood-media-public-playback-proof` exists, created 2026-07-08T23:47:12.035Z, and is distinct from the private proof bucket.", "R2 public-playback proof bucket status");
assertIncludes(architecture, "R2 public-playback proof object status: harmless text object `playback/public/proof/hello.txt`, immutable cache proof text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt`, generated demo MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4`, and approved real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` are public-safe proof assets only.", "R2 public-playback proof object status");
assertIncludes(architecture, "R2 public exposure status: `media.chillywoodstream.com` is connected only to `chillywood-media-public-playback-proof`; r2.dev public access remains disabled on both buckets; the private bucket has no custom domain.", "R2 public exposure status");
assertIncludes(architecture, "R2 custom-domain/cache proof status: public proof URL `https://media.chillywoodstream.com/playback/public/proof/hello.txt` returns HTTP 200 with the expected harmless text from the public-playback proof bucket; generated demo MP4 proof also returns through the same public proof hostname.", "R2 custom-domain/cache proof status");
assertIncludes(architecture, "Media bandwidth telemetry status: planned foundation only, not live.", "media delivery architecture doc");
assertIncludes(architecture, "Cache-HIT proof status: immutable harmless text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt` returns `Cache-Control: public, max-age=31536000, immutable`; after a narrow Cloudflare Cache Rule for `/playback/public/proof/cache-hit/*`, repeated fetches returned `cf-cache-status: HIT` with `Age` increasing.", "cache HIT proof status");
assertIncludes(architecture, "Safe demo media proof status: generated 2-second 320x180 H.264 MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` returns HTTP 200 for full fetch, HTTP 206 for byte range, `Content-Type: video/mp4`, immutable cache metadata, repeated `cf-cache-status: HIT` after warmup, and ffprobe/ffmpeg decode proof.", "safe demo media proof status");
assertIncludes(architecture, "The proof-only local app playback harness reports `provider=cloudflare_r2_custom_domain`, `publicPlaybackSafe=true`, `cdnEligible=true`, `productionPlaybackSwitched=false`, `playbackStarted=true`, `rangePlaybackSupported=true`, `decoded=true`, and `decodedFrameCount=48`.", "proof-only app playback proof status");
assertIncludes(architecture, "Real safe demo media proof status: Chi'llywood City Lights is identified as creator video `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`, public, clean, non-Premium, and backed by an unsigned public `download.blender.org` MP4 playback URL with no private storage object path exposed in the public row.", "real demo media identification");
assertIncludes(architecture, "Real safe demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` is staged only in the separate public-playback proof bucket, returns HTTP 200 full fetch, HTTP 206 byte-range fetch, `Content-Type: video/mp4`, `Cache-Control: public, max-age=31536000, immutable`, and repeated `cf-cache-status: HIT` after warmup.", "real demo media fetch proof");
assertIncludes(architecture, "Real safe demo playback/decode proof reports H.264 854x480 duration 52.208333 seconds, ffmpeg decode passed, and `decodedFrameCount=1253`.", "real demo media decode proof");
assertIncludes(architecture, "Real demo resolver proof uses `cdnAllowedPublicPlaybackPaths` to allow only `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`; another public-safe demo path falls back with `not_in_public_playback_allowlist`.", "real demo resolver allowlist proof");
assertIncludes(architecture, "5 GB resumable upload status: not live; current upload is single signed PUT.", "media delivery architecture doc");
assertIncludes(architecture, "Near-term chosen path: Cloudflare R2 private origin plus Cloudflare custom domain/cache", "Cloudflare R2 chosen path");
assertIncludes(architecture, "Resolver staging from commit `22837a5d20c1be66ffeb5559b96f7048f6a094eb` keeps production playback unchanged.", "resolver staging checkpoint");
assertIncludes(architecture, "Cache-HIT proof succeeded for immutable harmless text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt` under a narrow cache rule.", "cache HIT checkpoint");
assertIncludes(architecture, "Safe generated demo MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` is staged in the separate public-playback proof bucket and plays through `media.chillywoodstream.com` in the proof-only local app playback harness.", "safe demo media checkpoint");
assertIncludes(architecture, "Real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` is proof-staged and proved through `media.chillywoodstream.com` only under the explicit real-demo allowlist.", "real demo media checkpoint");
assertIncludes(architecture, "Media bandwidth telemetry implementation remains planned.", "telemetry planned checkpoint");
assertIncludes(architecture, "HLS/transcoding implementation remains planned.", "HLS planned checkpoint");
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
assertIncludes(architecture, "The bucket currently contains only public-safe proof assets: text proof object `playback/public/proof/hello.txt`, cache-HIT text proof object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt`, generated demo proof MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4`, and approved real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`.", "public-playback proof bucket contents");
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
assertIncludes(architecture, "Production playback remains unchanged until a later approved lane adds trusted public-safe asset metadata, cache-HIT proof, telemetry, and signed/token CDN access for non-public assets.", "staged public playback resolver production boundary");
assertIncludes(architecture, "Creator-video Watch-Party sources must use the same creator-video playback resolver path as standalone Player.", "media delivery architecture doc");
assertIncludes(architecture, "HLS/transcoding is a future milestone unless implemented and proved.", "HLS/transcoding status");
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
assertIncludes(currentState, "The real demo resolver proof uses `cdnAllowedPublicPlaybackPaths` so only the approved City Lights path resolves to `media.chillywoodstream.com`; non-allowlisted public-safe, private, original, Premium-only, unscanned, moderation-blocked, unsafe, default creator-video, or missing-config assets fall back or block.", "current state real demo allowlist proof");
assertIncludes(currentState, "`_lib/mediaDelivery.ts` still stages disabled-by-default Cloudflare R2 custom-domain resolver support", "current state staged resolver support");
assertIncludes(currentState, "Current VOD production wiring passes `publicPlaybackSafe: false`, so existing creator-video playback still uses signed-origin fallback.", "current state production playback fallback");
assertIncludes(nextTask, "Separate public-playback proof bucket `chillywood-media-public-playback-proof` exists and is distinct from `chillywood-media-proof`.", "next task bucket separation");
assertIncludes(nextTask, "Staged resolver support exists in `_lib/mediaDelivery.ts` and is proved by `npm run proof:media-delivery-resolver` plus `npm run proof:media-delivery-public-demo`.", "next task staged resolver support");
assertIncludes(nextTask, "`npm run proof:media-delivery-real-demo` proves only the approved City Lights public demo allowlist path through `media.chillywoodstream.com`; production creator-video playback is still unchanged.", "next task real demo proof");
assertIncludes(nextTask, "Current VOD production wiring keeps `publicPlaybackSafe: false`, so existing creator-video playback still falls back to signed origin by default.", "next task production fallback");
assertIncludes(nextTask, "Do not enable public access on `chillywood-media-proof`.", "private bucket public access prohibition");

const transcodeLiveClaims = claimSentences(
  docsCorpus,
  /\b(transcod(?:e|er|ing)|HLS\/ABR|ffmpeg|derived renditions)\b/i,
  /\b(live|active|deployed|proved|closed|production-ready)\b/i,
);
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
).filter((sentence) => !/\b(proof|harmless|public-playback proof|public proof|public-safe)\b/i.test(sentence));
if (publicR2OriginalClaims.length) {
  fail(`R2 buckets/private originals must not be described as publicly exposed: ${publicR2OriginalClaims.join(" | ")}`);
}

for (const sentence of splitSentences(docsCorpus)) {
  if (/\b(Paid|Premium)\b/i.test(sentence) && /\b(public CDN|public cache|custom-domain\/cache|Cloudflare cache)\b/i.test(sentence)) {
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
    const realDemoAllowlistConfig = {
      ...config,
      cdnAllowedPublicPlaybackPaths: [realDemoPath],
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

await assertMediaDeliveryHelperPolicy();

if (failures.length) {
  console.error("Media delivery architecture guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Media delivery architecture guard passed.");
