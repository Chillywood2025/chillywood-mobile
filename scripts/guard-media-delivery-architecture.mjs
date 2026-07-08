#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
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
const vodDoc = read("docs/VOD_QUALITY_LADDER_AND_PLAYBACK_RESOLVER.md");
const wave2Doc = read("docs/WAVE2_CREATOR_MEDIA_CLOSURE_RUNBOOK.md");
const docsCorpus = [architecture, vodDoc, wave2Doc].join("\n\n");

const mediaStorage = read("_lib/mediaStorage.ts");
const mediaStorageFunction = read("supabase/functions/media-storage/index.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const vodQuality = read("_lib/vodQuality.ts");
const performancePolicy = read("_lib/performancePolicy.ts");
const player = read("app/player/[id].tsx");
const watchPartyContentSources = read("_lib/watchPartyContentSources.ts");
const migration = read("supabase/migrations/202605140010_vod_quality_ladder_resolver.sql");
const packageJson = read("package.json");

const sourceCorpus = [
  mediaStorage,
  mediaStorageFunction,
  creatorVideos,
  vodQuality,
  performancePolicy,
  player,
  watchPartyContentSources,
  migration,
].join("\n\n");

const hasTranscodeWorker = (
  exists("supabase/functions/media-transcode/index.ts")
  || exists("supabase/functions/transcode-worker/index.ts")
  || exists("scripts/media-transcode-worker.mjs")
  || /\bvideo_transcode_jobs\b/.test(migration)
);
const hasCdnPlaybackPath = /\b(CDN_PLAYBACK|cdnPlayback|createSignedCdn|signedCdn|cdn_base_url|cdn_url|CDN_BASE_URL)\b/.test(sourceCorpus);
const hasPlaybackTelemetry = /\b(media_bandwidth_events|record_media_playback_egress|cdn_access_logs|cdn_access_log|playback_egress_bytes|rendition_bytes_served|edge_bytes_served)\b/i.test(sourceCorpus);
const hasResumableUpload = /\b(createMultipartUpload|completeMultipartUpload|UploadPart|multipart_upload|tus|resumable_upload|direct_upload_session)\b/i.test(sourceCorpus);

assertIncludes(architecture, "Status: architecture and guard only.", "media delivery architecture doc");
assertIncludes(architecture, "Transcoding status: not live; no worker exists in this repo.", "media delivery architecture doc");
assertIncludes(architecture, "Cloudflare custom domain/cache status: target delivery/cache layer for safe playback assets, not deployed by this repo change.", "media delivery architecture doc");
assertIncludes(architecture, "Media bandwidth telemetry status: foundation only, not live.", "media delivery architecture doc");
assertIncludes(architecture, "5 GB resumable upload status: not live; current upload is single signed PUT.", "media delivery architecture doc");
assertIncludes(architecture, "Near-term chosen path: Cloudflare R2 private origin plus Cloudflare custom domain/cache", "Cloudflare R2 chosen path");
assertIncludes(architecture, "Cloudflare R2 is the target origin because the owner already has the domain on Cloudflare.", "Cloudflare R2 domain rationale");
assertIncludes(architecture, "Keep the R2 bucket private by default.", "R2 private bucket policy");
assertIncludes(architecture, "Original/master files are private processing sources.", "media delivery architecture doc");
assertIncludes(architecture, "Do not enable public access for originals/master files.", "original/master privacy");
assertIncludes(architecture, "Safe first CDN target is public/demo/ready playback assets only.", "safe public cache target");
assertIncludes(architecture, "Paid/Premium media needs token/signed CDN access before public CDN delivery.", "paid/Premium CDN signing requirement");
assertIncludes(architecture, "Supabase/Edge resolver remains the access-control and playback decision layer.", "Supabase/Edge resolver boundary");
assertIncludes(architecture, "The app must ask the backend resolver for playback; the app must not hard-code R2 or Cloudflare custom-domain decisions.", "app resolver contract");
assertIncludes(architecture, "Creator-video Watch-Party sources must use the same creator-video playback resolver path as standalone Player.", "media delivery architecture doc");
assertIncludes(architecture, "HLS/transcoding is a future milestone unless implemented and proved.", "HLS/transcoding status");
assertIncludes(architecture, "Bandwidth/minutes-watched telemetry remains required before broad rollout.", "egress telemetry requirement");
assertIncludes(architecture, "MEDIA_ORIGIN_PROVIDER=hetzner_s3 | cloudflare_r2", "config contract");
assertIncludes(architecture, "MEDIA_DELIVERY_PROVIDER=origin_signed_direct | cloudflare_r2_custom_domain", "config contract");
assertIncludes(architecture, "MEDIA_CDN_BASE_URL", "config contract");
assertIncludes(architecture, "MEDIA_CDN_SIGNING_MODE=off | token", "config contract");
assertIncludes(architecture, "MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX", "config contract");
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
);
if (transcodeLiveClaims.length && !hasTranscodeWorker) {
  fail(`docs claim transcoding is live without worker proof: ${transcodeLiveClaims.join(" | ")}`);
}

const cdnLiveClaims = claimSentences(
  docsCorpus,
  /\b(CDN|edge cache|signed CDN|CloudFront|Bunny|Cloudflare CDN)\b/i,
  /\b(live|active|deployed|proved|closed|production-ready)\b/i,
);
if (cdnLiveClaims.length && !hasCdnPlaybackPath) {
  fail(`docs claim CDN playback is live without CDN playback path: ${cdnLiveClaims.join(" | ")}`);
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
  docsCorpus,
  /\b(R2|original|master|source)\b/i,
  /\b(publicly exposed|public access|public bucket|public CDN|public cache|public path)\b/i,
);
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

const scaledMediaClaims = claimSentences(
  docsCorpus,
  /\b(scaled media delivery|scalable media delivery|low-egress video|media delivery scale)\b/i,
  /\b(live|active|proved|closed|production-ready)\b/i,
);
if (scaledMediaClaims.length && !hasPlaybackTelemetry) {
  fail(`docs claim real scaled media delivery without playback telemetry: ${scaledMediaClaims.join(" | ")}`);
}

const egressProtectionClaims = claimSentences(
  docsCorpus,
  /\b(egress|cost protection|low-egress|broad rollout)\b/i,
  /\b(live|active|proved|closed|production-ready|protected|ready)\b/i,
);
if (egressProtectionClaims.length && !/Bandwidth\/minutes-watched telemetry remains required before broad rollout\./.test(architecture)) {
  fail(`egress/cost protection cannot be claimed without telemetry plan: ${egressProtectionClaims.join(" | ")}`);
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

const secretScanCorpus = [architecture, read("scripts/guard-media-delivery-architecture.mjs"), packageJson].join("\n");
[
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bASIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  /\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b/,
  /\b(api[_-]?key|secret|token|password|service[_-]?role|access[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_./+=-]{20,}['"]/i,
  /\bR2_ACCOUNT_ID\s*=\s*[A-Za-z0-9_-]+/,
  /\bR2_BUCKET\s*=\s*[A-Za-z0-9_.-]+/,
  /\bR2_S3_ENDPOINT\s*=\s*https?:\/\//i,
  /\bMEDIA_CDN_BASE_URL\s*=\s*https?:\/\//i,
].forEach((pattern) => assertNotMatches(secretScanCorpus, pattern, "changed media delivery docs/source"));

assertIncludes(performancePolicy, "VOD_FREE_MAX_HEIGHT_V1 = 480", "free VOD policy");
assertIncludes(performancePolicy, "VOD_PREMIUM_MAX_HEIGHT_V1 = 1080", "Premium VOD policy");
assertIncludes(vodQuality, "VOD_FREE_PLAYBACK_QUALITY_LABELS = [\"360p\", \"480p\"]", "VOD free ladder");
assertIncludes(vodQuality, "VOD_PREMIUM_PLAYBACK_QUALITY_LABELS = [\"720p\", \"1080p\"]", "VOD Premium ladder");
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

if (failures.length) {
  console.error("Media delivery architecture guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Media delivery architecture guard passed.");
