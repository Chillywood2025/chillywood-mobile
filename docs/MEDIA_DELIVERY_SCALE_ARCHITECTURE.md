# Chi'llywood Media Delivery Scale Architecture

Last updated: 2026-07-09

Status: staged resolver helpers, proof scripts, architecture, and guard only. This document does not switch production playback, create a transcoder, change Player UX, change Premium entitlement logic, or change LiveKit/Watch-Party behavior.

## Current-State Report

1. Current storage provider path

- Mobile upload/download code goes through `_lib/mediaStorage.ts`.
- `_lib/mediaStorage.ts` calls the Supabase Edge Function `supabase/functions/media-storage/index.ts`.
- The Edge Function returns S3-compatible signed URLs and currently requires `S3_PROVIDER=hetzner`.
- Creator video rows store `storage_provider`, `storage_bucket`, `storage_object_key`, and `storage_path`.
- Older or non-S3 paths can still fall back to Supabase Storage signing through `createSupabaseSignedUrl`.

2. Current S3/Hetzner assumptions

- `media-storage` reads `S3_PROVIDER`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
- The launch provider is hard-gated to `hetzner`.
- Signing uses AWS SigV4 against virtual-hosted bucket URLs built as `{bucket}.{endpointHost}`.
- The request bucket must match the configured `S3_BUCKET`.
- Creator video upload size is capped at 5 GB in the Edge Function, with social attachments capped lower.
- Upload and download URLs are direct origin URLs, not CDN URLs.

3. Current upload flow

- `uploadCreatorVideo` creates an owner-prefixed object key like `{ownerId}/{videoId}/source.{ext}`.
- `createSignedMediaUpload` requests a signed PUT URL from `media-storage`.
- The Edge Function authenticates the Supabase user, checks account restriction, validates object key ownership, MIME type, size, creator-tool Premium/staff access, and upload abuse rate limits.
- The mobile client uploads the whole object with a single signed `PUT` using `FileSystem.uploadAsync`, then fetch fallbacks.
- After upload, the client requests a signed GET URL and range-probes one byte to reject empty objects.
- The app inserts the `videos` row, records the original rendition through `record_video_original_rendition` when present, and records upload/storage usage metadata.

4. Current download/playback signing flow

- `/player/[id]?source=creator-video` loads creator media through `readCreatorVideoForPlayer`.
- `readCreatorVideoForPlayer` checks creator-video visibility, paid content access, and then calls `resolveSignedVideoPlaybackSource`.
- `resolveSignedVideoPlaybackSource` calls the database RPC `resolve_video_playback` and signs only the resolver-selected rendition when one exists.
- S3 rendition signing goes back through `media-storage`; Supabase Storage rows use Supabase signed URLs.
- `media-storage` authorizes S3 downloads by matching the object to `videos` or `video_renditions`, checking scan/moderation/public state, owner/staff access, and Premium entitlement for premium renditions.
- If no resolver-selected rendition URL exists, legacy single-file playback can still sign the source object only when the resolver marks legacy fallback as allowed or unavailable.

5. Current VOD quality ladder state

- `_lib/performancePolicy.ts` defines free VOD max height as 480p and Premium VOD max height as 1080p.
- `supabase/migrations/202605140010_vod_quality_ladder_resolver.sql` adds `video_renditions` with `original`, `360p`, `480p`, `720p`, and `1080p`.
- `access_tier` supports `owner`, `free`, `premium`, and `private`.
- The resolver excludes `original` from regular playback options.
- Free viewers receive ready free renditions only. Premium HD requires backend entitlement proof.
- This is a resolver and schema foundation. It does not transcode files.

6. What is live vs only repo foundation

- Live in code: direct signed S3-compatible upload, direct signed S3-compatible download, Supabase fallback signing, upload/storage metadata recording, VOD resolver helpers, media-storage rendition authorization, and a disabled-by-default Cloudflare R2 public playback resolver helper.
- Foundation only: `video_renditions` metadata, free/Premium quality ladder policy, upload/storage usage tables, provider usage import/reconciliation tables, and admin read models.
- Not live: transcode worker, HLS/ABR rendition generation, production CDN playback, signed CDN URL/cookie issuance, per-playback media bandwidth telemetry, resumable/multipart 5 GB upload, and provider-neutral origin switching.

7. Where original files can still be used as playback fallback

- `readCreatorVideoForPlayer` can fall back to `createCreatorVideoPlaybackUrl` for the original/source object when the resolver has no signed rendition and `legacy_playback_allowed` is true or resolver availability fails open for legacy playback.
- The fallback keeps existing creator videos playable while real renditions are absent.
- Original/master files are private processing sources. They are not normal playback renditions and must not become CDN-published ABR variants.

8. Where bandwidth/egress is currently not measured

- `record_creator_video_upload_usage` records upload events and storage bytes, not playback bytes.
- `platform_usage_metering_events` can hold `bandwidth_bytes`, but creator-video S3 GET signing does not write per-playback or per-byte media events.
- Direct S3 signed URL downloads happen outside the app after signing, so the app cannot accurately infer full bytes served.
- There is no CDN log ingestion, edge byte accounting, rendition-byte ledger, or per-creator media egress rollup tied to playback.

9. Where uploads are not resumable/multipart

- The mobile app uploads a whole file to one signed `PUT` URL.
- Retries handle provider `SlowDown` responses, but they retry the object upload path rather than resuming uploaded parts.
- There is no multipart upload session, tus endpoint, direct-upload session table, part manifest, complete-multipart call, or abandoned-part cleanup.

10. Where CDN delivery is missing

- `createPresignedS3Url` returns direct origin URLs.
- Player and Watch-Party creator-video paths receive signed origin URLs, not signed CDN URLs.
- There is a staged CDN URL resolver helper, but it is disabled by default and not active for production playback assets.
- There is no CDN signer, signed cookie/key pair, origin shield, cache purge hook, CDN log ingest, or CDN URL resolver active in the current production playback path.

## Target Architecture

Production backend transcode service status: no daemon, queue processor, cron, scheduler, or backend transcode service is live. Bounded CLI/operator transcode passes have produced audited public 360p/480p HLS rows and protected Premium HD rows, but no continuous worker or broad backfill is enabled.

Cloudflare R2 private origin status: enabled for proof and backup use; private/original storage is not public. Playback uses only public-safe audited HLS rows in the separate public-playback bucket when rollout gates pass.

Cloudflare R2 source/original migration target: private bucket `chillywood-media-origin` exists for the next source/original object-storage migration lane. It is not public and is not connected to `media.chillywoodstream.com`.

Hetzner Object Storage migration status: Partial. Private R2 origin bucket `chillywood-media-origin` exists, source defines the fail-closed config contract for future private source/original uploads through `MEDIA_ORIGIN_PROVIDER=cloudflare_r2`, `MEDIA_ORIGIN_PRIVATE_ONLY=true`, and `MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED=true`, and trusted backend copier `media-object-storage-migration` is deployed with operator-token hash auth. Live copier inventory still found `31` Hetzner/S3 object-storage reference rows (`22` distinct object refs), so shutdown is not ready. The prior missing R2 private-origin write config blocker is cleared with bucket-scoped R2 S3 credentials stored as backend secrets; full reconciliation found `16` existing distinct refs copied/readback verified in R2 private origin, `5` `missing_404` refs, `1` unsupported ref, `9` duplicate row refs, and no permission denials. No media rows were written, no DB metadata was migrated, no Hetzner objects were deleted, and Hetzner fallback retained because unresolved refs plus the affected storage-metadata backup/restore gate remain open. Hetzner LiveKit is separate; do not shut down Hetzner LiveKit, `chillywood-prod-01`, or `live.chillywoodstream.com`.

Cloudflare custom domain/cache status: `media.chillywoodstream.com` is connected only to the separate public-playback proof bucket. Controlled audited public HLS playback is active for trusted eligible `media_renditions` rows; private/original/Premium media remains blocked from public CDN.

Cloudflare R2 public playback resolver status: staged helper and proof scripts exist, and the audited `media_renditions` bridge is active only through controlled rollout config. Signed-origin fallback remains mandatory, and private/original/Premium media remains blocked from public CDN.

Trusted audited-rendition CDN eligibility status: `_lib/mediaPlaybackCdnEligibility.ts` and `npm run proof:media-playback-cdn-eligibility` govern the resolver decision for Cloudflare R2/HLS playback. The City Lights proof rows are a canary, not the long-term hardcoded path: any trusted audited public-safe `media_renditions` row may use public CDN/HLS when rollout gates pass, and protected Premium HD rows may use the tokenized Worker path when Premium gates pass. Signed-origin fallback remains available.

Playback CDN rollout config contract:

- `MEDIA_PLAYBACK_CDN_ENABLED=false` by default.
- `MEDIA_PLAYBACK_CDN_KILL_SWITCH=true` by default or fail-closed equivalent.
- `MEDIA_PLAYBACK_CDN_ROLLOUT_MODE=off | canary | batch | trusted_public`.
- `MEDIA_PLAYBACK_CDN_ALLOWED_SOURCE_IDS=`.
- `MEDIA_PLAYBACK_CDN_DENIED_SOURCE_IDS=`.
- `MEDIA_PLAYBACK_CDN_REQUIRE_AUDIT_PASSED=true`.
- `MEDIA_PLAYBACK_CDN_REQUIRE_BACKUP_FRESH=true`.
- `MEDIA_PLAYBACK_CDN_FALLBACK_TO_ORIGIN=true`.
- `MEDIA_PLAYBACK_CDN_DELIVERY_PROVIDER=cloudflare_r2_custom_domain`.
- `MEDIA_PLAYBACK_CDN_MAX_BATCH_SIZE=`.
- `MEDIA_PLAYBACK_CDN_PERCENT_ROLLOUT=0`.

Rollout rules: `off` keeps all creator-video playback on signed-origin fallback; `canary` allows only explicit canary source ids; `batch` allows only explicitly listed source ids with a max-batch cap; `trusted_public` allows any eligible audited public-safe HLS rendition to use Cloudflare R2 custom-domain delivery after explicit owner-approved activation. Denied source ids always fall back or block. Signed-origin fallback stays available unless the underlying media itself is blocked. `trusted_public` must remain gated by installed resolver/player proof, backup gate, kill switch, row eligibility, and fallback.

Audited public rendition CDN eligibility requires all of: `MEDIA_PLAYBACK_CDN_ENABLED=true`, `MEDIA_PLAYBACK_CDN_KILL_SWITCH=false`, a trusted rendition row, `is_ready=true`, `audit_status=passed`, `is_public_playback_safe=true`, `is_original=false`, `visibility=public`, scan clean/approved, moderation allowed/approved, `bucket_role=public_playback`, `delivery_provider=cloudflare_r2_custom_domain`, `delivery_format=hls`, manifest path under `playback/public/`, fresh/closed backup gate when required, no denied source id, and an available signed-origin fallback. Original/master, private, Premium-only without signed/token CDN, unscanned, moderation-blocked, wrong bucket role, wrong prefix, audit-pending/failed/quarantined, stale backup, global-disabled, and kill-switch-on cases all fall back or block.

Premium HD token mode is active for protected audited rows only. `_lib/mediaPremiumCdnToken.ts` models short-lived token claims scoped to viewer, source, rendition label, and protected path; `_lib/mediaPlaybackCdnEligibility.ts` accepts token mode only for `visibility=premium` 720p/1080p HLS rows under `playback/premium/` or `playback/protected/premium/` with active Premium entitlement proof and a tokenized URL signer. Without the signer, HD falls back/blocks. This does not expose Premium HD through unsigned `playback/public/`, and free 360p/480p public playback remains separate.

Protected Premium HD delivery architecture: `workers/premium-media-access/worker.mjs` is the selected Worker path, and the isolated Worker deployment `chillywood-premium-media-access-proof` now uses `premium-media.chillywoodstream.com` as the only active production Premium HD custom domain. The old `premium-media-proof.chillywoodstream.com` host is historical only and is no longer an active fallback route. `workers/premium-media-access/wrangler.toml` binds the Worker to private R2 bucket `chillywood-media-proof`, sets `PREMIUM_MEDIA_ALLOWED_PREFIX=playback/protected/premium/`, disables workers.dev, and attaches no normal media route. The Worker verifies compact HMAC tokens using secret env `PREMIUM_CDN_TOKEN_SECRET`, checks `premiumEntitlement=true`, user/session scope, source id, rendition label, expiry, protected path prefix, and denied path segments, then proxies only the matching R2 object through `PREMIUM_MEDIA_R2_BUCKET`. It denies missing/expired/wrong-source/wrong-path/wrong-rendition/non-Premium/private/original/unscanned/moderation-blocked requests and redacts token values in logs. `npm run proof:premium-cdn-worker` proves the Worker source allow/deny matrix and mock R2 proxy behavior; `npm run proof:premium-cdn-worker-live` proves the deployed production host against the harmless text object and generated HD HLS assets. Production now has `5` protected Premium HD rows, all under `playback/protected/premium/`, with unsigned public HD exposure `0`.

Live app token issuance architecture: Supabase Edge Function `premium-media-playback-token` is deployed with `verify_jwt=false` but self-authenticates the user through the supplied Supabase bearer token, checks existing Premium entitlement with `monetization_has_active_premium`, verifies protected Premium `media_renditions` row state, and issues short-lived Worker-compatible tokens using function secret env `PREMIUM_CDN_TOKEN_SECRET`. The app resolver calls this function for Premium HD rows, validates the returned protected Worker URL, and logs only redacted metadata (`tokenized`, `protectedPlayback`, host, provider, rendition label). The issuer points at production host `premium-media.chillywoodstream.com`; the old proof host is not a runtime fallback. Android EAS Update group `22916970-0161-4411-930a-3570eb5625fb` / Android update `019f4a0b-efff-71c9-bae5-9198bb001160` carries the resolver integration. Installed proof on Play-installed `R5CR120QCBF` is Closed: with Google Play / RevenueCat sandbox Premium active and `monetization_has_active_premium=true`, the app historically resolved a 1080p source and a 720p source through the proof host with `cloudflare_r2_premium_token`, `deliveryFormat=hls`, `fallbackUsed=false`, `tokenized=true`, and `protectedPlayback=true`, and Android logs showed ExoPlayer/decoder/active media playback. The final Worker fix made rewritten HLS child playlist and segment URLs root-relative scoped protected paths so native HLS clients do not resolve them under the parent manifest directory.

Scale rollout planner status: `scripts/media-cdn-rollout-planner.mjs`, `npm run media-cdn:plan`, `npm run media-cdn:status`, and `npm run proof:media-cdn-rollout-planner` are proof/CLI-only. They count eligible audited public-safe HLS rows, exclude denied/private/Premium/original/pending/failed/moderation-blocked/wrong-prefix rows, require a max batch size, build exact rollback plans, redact summaries, and do not mutate the database, run backfill, enable a worker, or switch playback. Before broad `trusted_public` rollout, the resolver query path should be read-plan-tested against production-size data; the applied migration already has source, readiness, provider, visibility, and job indexes, but a future composite or partial index may be warranted for high-volume ready/public-safe HLS lookup.

First Batch 1 production catalog plan status: `docs/MEDIA_CDN_BATCH_1_CANDIDATE_PLAN.md` is historical. Current linked CLI readiness readback supersedes it for current planning: `27` rows scanned, `1` already eligible audited CDN/HLS source, `0` ready-for-transcode rows, `5` public scan candidates, `12` private/non-public rows, and `9` Premium rows. Batch 1 remains empty until scanner proof and moderation-safe readback make public-safe rows eligible; no worker, queue processor, backfill, R2 upload, production DB write, or additional playback switch occurred.

R2 CLI/API proof status: private and public-playback proof upload/readback succeeded through authorized Wrangler access. Production R2 CDN playback is limited to audited public-safe HLS rendition rows under rollout gates, with signed-origin fallback available.

R2 proof bucket status: private bucket `chillywood-media-proof` exists, created 2026-07-08T23:26:44.468Z.

R2 proof object status: harmless text object `playback/public/proof/hello.txt` upload/readback succeeded and is kept for proof traceability.

R2 public-playback proof bucket status: separate bucket `chillywood-media-public-playback-proof` exists, created 2026-07-08T23:47:12.035Z, and is distinct from the private proof bucket.

R2 public-playback proof object status: harmless text object `playback/public/proof/hello.txt`, immutable cache proof text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt`, generated demo MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4`, approved real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`, local-proof HLS tree `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`, proof-only transcode queue HLS tree `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`, and first controlled worker-proof HLS tree `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/` are public-safe proof assets only.

R2 public exposure status: `media.chillywoodstream.com` is connected only to `chillywood-media-public-playback-proof`; r2.dev public access remains disabled on both buckets; the private bucket has no custom domain.

R2 custom-domain/cache proof status: public proof URL `https://media.chillywoodstream.com/playback/public/proof/hello.txt` returns HTTP 200 with the expected harmless text from the public-playback proof bucket; generated demo MP4 proof also returns through the same public proof hostname.

Media bandwidth telemetry status: planned foundation only, not live.

Media delivery telemetry foundation status: source/proof-only helper and proof script exist; no backend writes, database table migrations, production telemetry writes, or production playback changes are live.

Telemetry proof status: `npm run proof:media-delivery-telemetry` builds CDN demo, signed-origin fallback, blocked playback, and session start/end records, estimates bytes, redacts proof identifiers, and proves no full playback URLs are included. The proof now includes `delivery_format`, `rollout_mode`, `free_or_premium`, CDN HLS playback, signed-origin fallback, blocked private/Premium-style playback, and batch rollout event shapes for future scale reporting without production telemetry writes.

Cache-HIT proof status: immutable harmless text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt` returns `Cache-Control: public, max-age=31536000, immutable`; after a narrow Cloudflare Cache Rule for `/playback/public/proof/cache-hit/*`, repeated fetches returned `cf-cache-status: HIT` with `Age` increasing. Cache behavior is proved for this proof prefix only; egress or cost savings are not claimed without media bandwidth telemetry.

Safe demo media proof status: generated 2-second 320x180 H.264 MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` returns HTTP 200 for full fetch, HTTP 206 for byte range, `Content-Type: video/mp4`, immutable cache metadata, repeated `cf-cache-status: HIT` after warmup, and ffprobe/ffmpeg decode proof. The proof-only local app playback harness reports `provider=cloudflare_r2_custom_domain`, `publicPlaybackSafe=true`, `cdnEligible=true`, `productionPlaybackSwitched=false`, `playbackStarted=true`, `rangePlaybackSupported=true`, `decoded=true`, and `decodedFrameCount=48`. This object is not production creator media and does not define production HLS/transcode coverage.

Real safe demo media proof status: Chi'llywood City Lights is identified as creator video `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`, public, clean, non-Premium, and backed by an unsigned public `download.blender.org` MP4 playback URL with no private storage object path exposed in the public row.

Real safe demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` is staged only in the separate public-playback proof bucket, returns HTTP 200 full fetch, HTTP 206 byte-range fetch, `Content-Type: video/mp4`, `Cache-Control: public, max-age=31536000, immutable`, and repeated `cf-cache-status: HIT` after warmup.

Real safe demo playback/decode proof reports H.264 854x480 duration 52.208333 seconds, ffmpeg decode passed, and `decodedFrameCount=1253`.

Real demo resolver proof uses `cdnAllowedPublicPlaybackPaths` to allow only `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`; another public-safe demo path falls back with `not_in_public_playback_allowlist`.

Local HLS demo proof status: `scripts/proof-media-delivery-hls-demo.mjs` downloads the approved City Lights public-safe MP4, verifies SHA-256 short hash `b670602fa00934ca`, locally generates 360p and 480p HLS with ffmpeg, uploads only proof HLS assets to `chillywood-media-public-playback-proof`, and proves `master.m3u8`, variant playlists, segments, and ffmpeg HLS decode through `media.chillywoodstream.com`. This is a local proof worker only; production HLS uses the separate audited `media_renditions` row path and bounded CLI/operator outputs.

Local HLS demo public path: `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8` returns HTTP 200 with `Content-Type: application/vnd.apple.mpegurl` and `Cache-Control: public, max-age=300`; variant playlists `360p/index.m3u8` and `480p/index.m3u8` return HTTP 200 and reference versioned `.ts` segments.

Local HLS segment cache proof: after a narrow Cloudflare Cache Rule scoped only to `media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/*.ts`, versioned HLS segments return HTTP 200, `Content-Type: video/mp2t`, `Cache-Control: public, max-age=31536000, immutable`, and `cf-cache-status: HIT` after warmup. No production egress or cost savings are claimed.

Local HLS resolver proof: the staged resolver returns `https://media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8` only when `cdnAllowedPublicPlaybackPaths` explicitly contains that master manifest and `publicPlaybackSafe=true`; the source MP4 and segment paths fall back with `not_in_public_playback_allowlist` under the HLS proof config.

App/player HLS proof status: `npm run proof:media-delivery-hls-demo` now includes a proof-only app/player harness for `app/player/[id].tsx`. It verifies the Player route source contract maps `displayItem.video_url` into `{ uri }`, verifies `Video` receives `source={playbackSource}` with `onLoad` and `onPlaybackStatusUpdate`, and reports `playerReceivesHlsUrl=true`, `onLoadObserved=true`, `durationMillis=52208`, `progressObserved=true`, `progressMillis=2175`, `isPlaying=true`, `playbackStarted=true`, `ffmpegDecode=passed`, `productionPlaybackSwitched=false`, and `privateSignedOriginUrlExposed=false` for the allowlisted HLS master URL only.

Proof-only transcode queue foundation status: `_lib/mediaTranscodeQueue.ts` and `npm run proof:media-transcode-queue-hls` model `queued -> probing -> transcoding -> uploading -> ready` for the approved City Lights demo only; no production backend queue/service worker, database writes, trusted `video_renditions` rows, or production playback switch is live.

Proof-only transcode queue output path: `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8` returned HTTP 200 through `media.chillywoodstream.com`; 360p and 480p variant playlists returned HTTP 200; ffmpeg decoded the public HLS master URL successfully.

Proof-only transcode queue cache result: after a narrow Cloudflare Cache Rule scoped only to `media.chillywoodstream.com/playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/*.ts`, queue-generated `.ts` segments returned HTTP 200, `Content-Type: video/mp2t`, `Cache-Control: public, max-age=31536000, immutable`, and `cf-cache-status: HIT` after warmup. No cache savings or production egress savings are claimed.

Proof-only transcode queue resolver proof: only a completed ready proof job can produce the allowlisted HLS master URL; queued and failed proof jobs cannot resolve, non-allowlisted outputs fall back with `not_in_public_playback_allowlist`, and private/original/Premium/unscanned/moderation-blocked/default creator-video paths fall back or block.

Proof-only transcode queue telemetry proof: the queue proof builds sanitized HLS `media_delivery_events` shapes with `deliveryFormat=hls`, 360p/480p rendition labels, estimated bytes, observed `cdn_cache_status`, and `proof_mode=true`; no production telemetry writes or table migrations are live.

Production transcode worker runbook status: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` defines the future worker runtime, inputs, safety checks, processing flow, failure behavior, security, rollback, and activation gates. No production worker is deployed and no production queue processor is running; City Lights plus the bounded CLI auto-detect cycle now account for `media_transcode_jobs=10` and `media_renditions=15`, with active unfinished jobs and unsafe CDN rows at zero. Playback may use those rows only through the audited public-row rollout gates, with signed-origin fallback still mandatory.

Local transcode worker proof status: `npm run proof:media-transcode-worker-local` uses only the approved public-safe City Lights MP4, simulates `queued -> probing -> transcoding -> uploading -> ready`, generates local 360p/480p HLS, validates master/variants/segments and ffmpeg decode, simulates upload keys under `playback/public/proof-worker/`, builds trusted `media_renditions` rows in memory, validates resolver eligibility, builds sanitized telemetry events, proves failed-job blocking, and runs a disposable PGlite worker-policy proof. It does not connect to production DB, upload R2 objects, write production rows, deploy a worker, or switch playback.

Operator-controlled worker safety status: `_lib/mediaTranscodeOperator.ts`, `_lib/mediaTranscodeWorkerSafety.ts`, `_lib/mediaRecoveryOperator.ts`, `npm run proof:media-transcode-operator-control`, and `npm run proof:media-transcode-worker-auditor` model source/proof-only worker activation. Worker mode defaults to `disabled`; `emergency_stop` always wins; `dry_run` cannot write rows; `one_job` requires an allowlisted source, `max_jobs_per_run=1`, backfill disabled, source allowed for processing, and either a Closed backup gate or explicit owner one-job override; `continuous` is denied while the backup/PITR gate is Blocked or Partial.

Auditor/resolver trust status: worker code cannot self-enable and cannot run without a valid source-bound lease. Worker-written rows stay `pending_audit`; the auditor must re-read by `batch_id`, verify exact source, row count, public paths, clean scan/moderation state, no private/original/Premium public playback, and exact rollback scope before resolver trust is allowed. Audit pass auto-disables the one-job lane; audit failure quarantines and auto-disables it. Self-auditing reduces one-job risk but does not replace true PITR for continuous production.

Backup/PITR activation gate: Blocked for broad production worker writes/backfill/continuous activation. Supabase readback on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`, `us-west-2`, `ACTIVE_HEALTHY`) returned `pitr_enabled=false`, `walg_enabled=true`, `backups=[]`, and `physical_backup_data={}`. Billing add-on readback returned no selected add-ons and listed paid PITR variants `pitr_7` (`$100/month`), `pitr_14` (`$200/month`), and `pitr_28` (`$400/month`). Enabling PITR is a provider billing/add-on mutation and requires explicit owner approval. WAL-G alone is not treated as sufficient until a restore window, latest backup metadata, or restore drill is verified.

R2 logical backup/restore gate status: Closed for the completed one-job proof only. `npm run proof:media-recovery-backup-restore` created a scoped logical backup for `media_transcode_jobs` and `media_renditions`, uploaded `manifest.json`, `schema.sql.gz`, `data-media-worker.sql.gz`, and `sha256sums.txt` only to private R2 bucket `chillywood-media-proof` under `backups/media-worker/2026/07/09/media-worker-logical-20260709-one-job-readiness-b81c7b1423c6/`, read them back through authorized Wrangler access, verified SHA-256 checksums, restored them into a disposable PGlite database, and proved resolver-safe select behavior before the one-job write. `npm run proof:media-worker-rollback-drill` proved exact-batch/exact-prefix rollback in a disposable database and denied missing batch, broad prefix, private, Premium, and original/master rollback targets. This is an application-level logical backup and restore drill, not true PostgreSQL PITR, not Supabase WAL, and not continuous automation readiness.

Scheduled R2 logical backup gate status: manual runner implemented, latest post-HD backup complete, schedule not deployed. Backup operation is CLI-controlled only; no GitHub Actions media-worker backup workflow, cron schedule, or scheduler exists. `_lib/mediaRecoveryOperator.ts` defines scheduled backup policy, backup freshness, restore-drill freshness, retention, scheduler state, and continuous-worker backup gate helpers for media-worker tables. `scripts/run-media-worker-logical-backup.mjs` is disabled/dry-run by default and can create/upload scoped `media_transcode_jobs` plus `media_renditions` logical backups only when manually invoked with required private env and `MEDIA_BACKUP_R2_PREFIX=backups/media-worker/`. `MEDIA_BACKUP_EXPORT_MODE=auto|pg_dump|js` supports JS SELECT export fallback; `MEDIA_BACKUP_DATABASE_SOURCE=linked` uses Supabase CLI linked read-only queries instead of requiring or printing a raw database URL. Latest manual backup completed after protected Premium HD row promotion at private R2 prefix `backups/media-worker/2026/07/10/media-worker-logical-20260710T024048-5de12265dded/` with row counts `media_transcode_jobs=10` and `media_renditions=15`. `backup:media-worker:status` shows the latest prefix, scoped production row counts, worker-running state, and continuous-gate state. `backup:media-worker:verify-latest` reads the latest private R2 backup artifacts, verifies SHA-256 checksums, confirms the public bucket and media domain do not expose them, and prints no secrets. `backup:media-worker:restore-drill` restores the latest backup into disposable PGlite and checks row counts plus resolver-safe filtering. `npm run proof:media-worker-backup-runner` proves dry-run behavior, missing-env fail-closed behavior, linked-source no-raw-DB-URL behavior, public bucket/domain denial, manifest/checksum generation, JS JSONL restore into disposable PGlite, and resolver-safe query. No cron schedule, GitHub Actions schedule, production worker, queue processor, or production playback switch is enabled. R2 scheduled logical backup is not PITR.

CLI-only one-job media worker command status: `scripts/media-transcode-worker-cli.mjs` and `npm run proof:media-transcode-worker-cli` provide source/proof infrastructure for `media-worker:preflight`, `media-worker:dry-run`, `media-worker:status`, `media-worker:run-one`, `media-worker:audit`, `media-worker:verify-output`, and `media-worker:rollback-plan`. `run-one` is fail-closed by default and requires a future explicit owner-approved source, allowlist, `max_jobs_per_run=1`, backfill disabled, closed backup gate, dry-run pass, and `MEDIA_WORKER_RUN_ONE_CONFIRM=I_UNDERSTAND_ONE_JOB`; this task did not process another production job, deploy a worker service, add cron, add a scheduler, write production rows, or switch playback.

Final CLI operating checklist status: `docs/MEDIA_WORKER_CLI_OPERATING_CHECKLIST.md` is the canonical handoff for any future owner-approved one-job media-worker operation. `npm run proof:media-worker-cli-operating-checklist` proves the checklist includes the backup preflight/status/verify/restore commands, media-worker preflight/status/dry-run/run-one/audit/verify-output/rollback-plan commands, owner confirmation, continuous-automation block, production signed-origin fallback, no cron/scheduler instructions, no secrets, and no PITR replacement claim.

Media automation operator status: CLI auto-detect bounded execution is live for safe Level 0/1 candidates, not deployed as a daemon. `_lib/mediaAutomationController.ts`, `_lib/chillywoodAutonomyPolicy.ts`, `_lib/mediaAutomationDiscovery.ts`, `_lib/mediaAutomationBatchPolicy.ts`, `_lib/mediaAutomationBackfillPolicy.ts`, `_lib/mediaAutomationJobs.ts`, `_lib/mediaAutomationQueueProcessor.ts`, `_lib/mediaAutomationWorkerLoop.ts`, `scripts/media-automation-cli.mjs`, disabled templates under `ops/media-automation/systemd/`, and `docs/MEDIA_AUTOMATION_OPERATOR_RUNBOOK.md` define the scale automation path for Level 0-4 autonomy policy, scheduled-backup-aware mode control, eligible public-safe discovery, adaptive batch sizing, capped backfill policy, dry-run job planning, lease-bound queue/worker loop, post-write audit, R2/HLS output policy, rollback/quarantine, telemetry event shapes, report-only status, and CLI-only batch controls. Automation defaults to `off`; `dry_run` writes nothing; `auto_detect` discovers/plans; `auto_detect_run` runs only after confirmation and gates; `continuous_limited` remains blocked unless scheduled backup/restore, telemetry, retry/dead-letter, max concurrency, max jobs/run, audit, rollback, output/cache validation, and unsafe-row gates pass; `continuous_full_blocked` remains blocked. `MEDIA_AUTOMATION_RUN_CONFIRM=I_UNDERSTAND_BATCH_AUTOMATION`, `MEDIA_AUTOMATION_RUN_CONFIRM=I_UNDERSTAND_AUTO_DETECT_BATCH`, `MEDIA_AUTOMATION_CONTINUOUS_ONCE_CONFIRM=I_UNDERSTAND_ONE_CONTINUOUS_LIMITED_CYCLE`, and `MEDIA_AUTOMATION_BROAD_BACKFILL_CONFIRM=I_UNDERSTAND_BROAD_BACKFILL_RISK` are the execution confirmations. The first bounded run-auto cycle processed four supported public-safe candidates, recorded one unsupported 320x180 failed-job marker, and stopped with no eligible work remaining. No live daemon, cron, scheduler, queue processor, broad backfill, or production playback broadening is live.

Auto-detect CLI automation status: bounded execution is implemented and proved, not deployed as a daemon. `_lib/mediaAutomationBatchPolicy.ts` and updated CLI commands make normal operation automatic for eligible public-safe videos: `media-automation:discover` finds candidates, `media-automation:plan-auto` calculates safe batch size, `media-automation:dry-run-auto` builds exact job/rollback plans, `media-automation:report` summarizes safe status, and `media-automation:run-auto` remains fail-closed unless `MEDIA_AUTOMATION_RUN_CONFIRM=I_UNDERSTAND_AUTO_DETECT_BATCH` plus backup/restore, active-job, unsafe-row, dry-run, audit, rollback, fallback, and emergency-stop gates pass. `media-automation:run-continuous-once` is a bounded future one-iteration command that remains fail-closed in this source/proof build unless `MEDIA_AUTOMATION_CONTINUOUS_ONCE_CONFIRM=I_UNDERSTAND_ONE_CONTINUOUS_LIMITED_CYCLE` and every gate passes. Manual source ids and manual batch size are not required for normal auto mode. Batch size starts at `1`, can grow after clean runs, drops to `1` after failure, reduces or blocks under CPU/disk pressure or high error rate, and is `0` when backups/restores are stale, active unfinished jobs exist, unsafe CDN rows exist, or no eligible candidate exists. Private, Premium, original/master, unscanned, moderation-blocked, missing-source, unsupported, active-job, denied, and already-processed candidates are excluded. No cron, scheduler, daemon, queue processor, broad backfill, or global playback switch is live.

Catalog readiness automation status: source/proofed and read-only for classification. `_lib/mediaCatalogReadiness.ts`, `scripts/media-catalog-readiness-cli.mjs`, `docs/MEDIA_CATALOG_READINESS_RUNBOOK.md`, `npm run media-catalog:status`, `npm run media-catalog:readiness-plan`, `npm run media-catalog:scan-plan`, and `npm run proof:media-catalog-readiness` classify catalog rows before transcode. After the trusted scanner gateway and bounded auto-transcode cycle, linked readback reports `ready_for_transcode=0`, `already_audited_hls=5`, `needs_scan=0`, `private_excluded=12`, `premium_excluded=9`, `unsupported_format=1`, and zero moderation-review, original/master, missing-source, blocked, or denied rows. The readiness CLI does not execute scans, mark media clean, write production rows, process media, upload media, or switch playback, and it redacts private URL-like values.

Scan automation status: trusted backend scanner gateway is live and production scan proof passed for current public candidates. `_lib/mediaScanAutomation.ts`, `scripts/media-scan-cli.mjs`, `supabase/functions/media-scan-private-access`, `npm run media-scan:status`, `npm run media-scan:plan`, `npm run media-scan:dry-run`, `npm run media-scan:run-auto`, `npm run proof:media-scan-private-access`, `npm run proof:media-scan-automation`, and `npm run proof:media-scan-auto-cycle` classify public scan candidates, build one-item or bounded auto-scan plans, validate scanner results, and prove ffprobe media-readability. The scanner proof is explicitly not malware scanning or content moderation. Private/Premium rows are skipped and redacted, already audited HLS rows are skipped, and unscanned rows cannot become transcode-eligible without clean scanner proof plus moderation-safe readback. The gateway uses a narrow scanner operator token, stores only `MEDIA_SCAN_OPERATOR_TOKEN_SHA256` server-side, supports S3/Hetzner and Supabase Storage source objects through backend authority, streams bytes without returning signed URLs, and records scan results only with scanner name/version plus ffprobe proof. The first scan batch scanned five public candidates, skipped `12` private and `9` Premium rows, and moved them to scan-clean readiness. Bounded auto-transcode then processed four supported candidates, promoted audited HLS rows, and left one 320x180 source unsupported for the current minimum HLS ladder.

Queue/backfill automation status: source/proof only. `_lib/mediaAutomationQueueProcessor.ts` models queued work discovery, lease-bound claiming, dry-run processing, completion, failure, dead-letter, quarantine, and stop reasons; it requires backup gate, kill switch, max concurrency, max jobs/run, retry cap, audit before resolver trust, dead-letter/quarantine, and exact public output prefix. `_lib/mediaAutomationBackfillPolicy.ts` keeps broad backfill disabled by default, allows only small capped public-safe backfill inside gates, blocks private/Premium/original/unscanned/moderation-blocked media, and requires owner approval for broad uncapped backfill, cap increases above the hard limit, or destructive cleanup. `npm run proof:media-automation-queue-processor`, `npm run proof:media-automation-backfill-policy`, and `npm run proof:media-automation-scheduler-templates` prove those boundaries without production writes or media processing.

Autonomous operating model status: `docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md` is the approval-boundary policy for media delivery work. Level 0/1 safe media operations, including eligible discovery, safe batch sizing, scoped backups, restore drills, public-safe transcode work inside caps, post-write audit, scoped rollback, fallback playback, and telemetry reporting, should proceed autonomously and report. Level 2 batch automation requires emergency stop, kill switch, caps, audit, rollback/quarantine, backup gate, and fallback. Level 3/4 boundaries still require owner approval: paid provider/billing/PITR changes, auth/RLS, Premium entitlement, payout/cashout, destructive production DB changes, broad backfill, public/private exposure changes, public launch, legal/compliance, payment production mutation, and public marketing claims. This policy does not weaken private/original/Premium protections and does not remove signed-origin fallback.

Trusted rendition metadata and playback bridge status: `_lib/mediaRenditionMetadata.ts`, `_lib/mediaPlaybackCdnEligibility.ts`, `_lib/vodQuality.ts`, `npm run proof:media-rendition-metadata`, and `npm run proof:media-playback-cdn-eligibility` model and enforce the scalable Cloudflare R2/HLS playback path. Creator-video playback can now read trusted public-safe `media_renditions` rows, require ready/public/clean/moderation-allowed/non-original Cloudflare HLS metadata under `playback/public/`, require the configured backup/rollout gate, and fall back to signed origin when any gate fails. City Lights is the canary, not a hardcoded final path; `trusted_public` can cover any eligible audited public-safe row after explicit rollout activation. No production `video_renditions` writes, production media row backfill, deployed backend worker, broad queue processor, private/Premium public-CDN path, or broad playback migration is live.

Trusted backend migration path status: `docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md`, migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql`, and `npm run proof:media-rendition-migration-policy` define and statically prove the server-owned `media_transcode_jobs` plus `media_renditions` path. Production schema migration status: applied to production on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`). Current production row counts after City Lights plus the bounded auto-detect cycle are `media_transcode_jobs=10`, `media_renditions=15`, `active_unfinished_jobs=0`, and `unsafe_cdn_rows=0`. Production data/write boundary: no production media backfill, production `video_renditions` write, deployed production transcode worker, broad queue processor, private/Premium public-CDN path, or broad playback migration is live.

Trusted backend migration dry-run status: `npm run proof:media-rendition-migration-dry-run` passes static SQL validation and runtime apply/RLS checks in an in-memory disposable local Postgres runtime via `@electric-sql/pglite`. The proof uses no network DB URL, no production Supabase project, and no production service-role key; it applies the migration SQL, verifies tables/indexes/RLS/policies/grants, proves anon/authenticated trusted writes are denied, proves service-role/worker writes pass, proves resolver-safe anon select returns one clean public-ready row, proves unsafe/original/Premium/private/non-public-prefix rows cannot become public CDN eligible, and proves production-looking DB URLs are refused. Production runtime policy proof: a rollback-only production transaction denied anon/authenticated trusted writes, allowed service-role/worker proof writes, verified resolver-safe select for one clean public-ready proof row, verified unsafe/original/Premium/private/non-public-prefix rows failed eligibility, and rolled back. The later one-job proof plus bounded CLI auto-cycle left six production jobs and ten audited renditions across City Lights plus four supported public-safe auto candidates; controlled audited-row playback rollout now uses only eligible rows and preserves signed-origin fallback.

Trusted playback rollout config status: defaults are fail-safe (`MEDIA_PLAYBACK_CDN_ENABLED=false`, `MEDIA_PLAYBACK_CDN_KILL_SWITCH=true`, `MEDIA_PLAYBACK_CDN_ROLLOUT_MODE=off`). Owner-approved activation may use `canary`, `batch`, or `trusted_public`; `trusted_public` still requires the trusted row gates, backup gate, kill switch off, and signed-origin fallback. OTA/public app delivery uses the same non-secret flags with `EXPO_PUBLIC_` prefixes, including backup gate readback flags (`MEDIA_PLAYBACK_CDN_BACKUP_GATE_STATUS`, `MEDIA_PLAYBACK_CDN_BACKUP_LATEST_VERIFIED`, and `MEDIA_PLAYBACK_CDN_RESTORE_DRILL_PASSED`). These flags are not secrets.

Trusted City Lights HLS fixture and production-row status: the proof fixture models 360p and 480p HLS rows for creator video `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1` using master manifest `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8`; the production one-job worker rows point at `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/master.m3u8`. The resolver proof returns `media.chillywoodstream.com` only when the row is ready, public, clean or approved, moderation-allowed, `bucket_role=public_playback`, `storage_provider=cloudflare_r2`, `delivery_provider=cloudflare_r2_custom_domain`, `is_public_playback_safe=true`, `is_original=false`, under `playback/public/`, and permitted by rollout config.

Trusted rendition block proof status: `npm run proof:media-rendition-metadata` proves not-ready rows, original/master rows, Premium rows, private rows, unsafe scan states, moderation-blocked states, wrong bucket roles, non-`playback/public/` prefixes, non-allowlisted public-safe rows, and default creator-video source paths all block or fall back without a public CDN URL.

5 GB resumable upload status: not live; current upload is single signed PUT.

Near-term chosen path: Cloudflare R2 private origin plus Cloudflare custom domain/cache, with Supabase/Edge resolver access control and direct signed R2/S3-compatible fallback.

### Checkpoint Summary

Completed:

- R2 is enabled.
- Private proof bucket `chillywood-media-proof` exists and remains private.
- Separate public-playback proof bucket `chillywood-media-public-playback-proof` exists and is distinct from the private proof bucket.
- `media.chillywoodstream.com` is connected only to the public-playback proof bucket.
- Harmless public text proof `playback/public/proof/hello.txt` returns through `media.chillywoodstream.com`.
- Resolver staging from commit `22837a5d20c1be66ffeb5559b96f7048f6a094eb` keeps production playback unchanged.
- Cache-HIT proof succeeded for immutable harmless text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt` under a narrow cache rule.
- Safe generated demo MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` is staged in the separate public-playback proof bucket and plays through `media.chillywoodstream.com` in the proof-only local app playback harness.
- Real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` is proof-staged and proved through `media.chillywoodstream.com` only under the explicit real-demo allowlist.
- Local HLS proof worker `scripts/proof-media-delivery-hls-demo.mjs` generated 360p/480p HLS from the approved City Lights public-safe MP4, uploaded proof-only HLS assets under `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`, proved master/variant/segment delivery through `media.chillywoodstream.com`, proved HLS segment cache HIT, and proved resolver eligibility only for the allowlisted HLS master manifest.
- Proof-only app/player HLS harness proved the allowlisted HLS master URL can be received by the Player source contract, load with duration, report progress, and start playback evidence without switching production playback.
- Proof-only transcode queue foundation proved the approved City Lights demo can move through local job states, generate 360p/480p HLS, upload proof outputs under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`, decode through `media.chillywoodstream.com`, resolve only the completed allowlisted HLS master, and prove queue-path segment cache HIT under a narrow proof-only cache rule.
- Production transcode worker runbook and local proof harness exist: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` and `npm run proof:media-transcode-worker-local` model a future worker locally with safe City Lights demo input only, local HLS generation, simulated public upload keys, in-memory trusted rendition rows, sanitized telemetry, failed-job proof, and disposable PGlite write-policy proof. No production worker is deployed; the only production rows are the owner-approved one-job City Lights proof row set.
- Trusted rendition metadata source/proof foundation models future Cloudflare R2 HLS rows and proves only the City Lights ready public-safe HLS fixture can bridge into the existing resolver allowlist.
- Trusted backend migration path is designed, proofed, and applied to production for server-owned `media_transcode_jobs` and `media_renditions`; clients cannot write trusted readiness, public-safe, path, worker version, or source hash fields.
- Trusted backend migration production readback, rollback-only proof, and first one-job proof are complete: tables/indexes/RLS/policies/grants exist, client trusted writes are denied, service-role/worker proof writes work inside rollback, resolver-safe select sees only clean public-ready proof rows, and current production row counts are one job plus two renditions for the allowlisted City Lights proof only.
- Operator-controlled worker safety foundation exists in source/proof and was used for the first controlled one-job production proof. It proves disabled default, one-job lease controls, emergency stop, no worker self-enable, pending-audit-only worker writes, auditor pass before resolver trust, auto-disable, and quarantine. It does not deploy a worker.
- R2-backed logical backup/restore readiness was used for the completed one-job proof: scoped media worker schema/data backup artifacts were uploaded to private R2 under `backups/media-worker/2026/07/09/media-worker-logical-20260709-one-job-readiness-b81c7b1423c6/`, read back with matching checksums, restored into disposable PGlite, and paired with a disposable rollback drill.
- Scheduled R2 logical backup/restore gate now has a manual runner proved by `npm run proof:media-worker-backup-runner`, plus source policy proof from `npm run proof:media-scheduled-backup-gate`; continuous worker processing remains disabled until a scheduler and recurring restore drill are explicitly approved and proved.
- Demo-only resolver eligibility is proved by local proof scripts for explicit `publicPlaybackSafe` assets only.
- Media delivery telemetry source/proof foundation exists for future `media_delivery_events` and `media_playback_sessions`; backend writes and table migrations remain planned.

Planned:

- Physical installed-app UI playback proof for future approved demo-media wiring remains optional and pending; the current proof is a resolver-controlled proof-only local app playback harness, not production UI.
- Media bandwidth telemetry backend writes, table migrations, CDN log ingestion, and provider reconciliation remain planned.
- Production HLS/transcoding implementation remains planned.
- Production transcode worker deployment remains planned and blocked for broad/continuous use by the Backup/PITR gate until PITR or an owner-approved restore path is verified; no broad worker writes/backfill while the gate is Blocked or Partial.
- Continuous production worker automation remains blocked until PITR or a proven scheduled backup/restore system is approved; the R2 logical backup drill plus scheduled-backup source model support future limited automation planning only and do not deploy continuous processing.
- Production trusted `video_renditions` or replacement rendition-metadata data writes remain planned; the current trusted rendition metadata foundation and applied schema do not create a worker, backfill, resolver bridge, or playback migration.
- Premium/private signed CDN access remains planned.
- Production media migration remains planned and requires explicit approval.

### Origin Storage

- Cloudflare R2 is the target origin because the owner already has the domain on Cloudflare.
- Keep the R2 bucket private by default.
- Keep current Hetzner/S3-compatible origin support as current/legacy fallback where already used.
- Store originals under a private `source/` or equivalent namespace.
- Store derived HLS renditions under a separate `renditions/{videoId}/{quality}/` namespace.
- Require every stored object to carry provider, bucket, object key, owner, media id, checksum where available, byte size, MIME/container, and scan state.
- Treat origin storage as interchangeable behind a provider adapter, not as a user-facing playback URL source.
- Direct signed R2/S3-compatible URLs remain the fallback/private path for legacy playback, owner/staff operations, and environments where Cloudflare R2 config is absent.

### Cloudflare Custom Domain/Cache

- Cloudflare custom domain/cache is the near-term delivery/cache layer for safe playback assets.
- The planned custom hostname is `media.chillywoodstream.com`.
- The private proof bucket is `chillywood-media-proof`.
- The separate public-playback proof bucket is `chillywood-media-public-playback-proof`.
- The private proof bucket and public-playback proof bucket must remain distinct.
- Allowed public proof prefix: `playback/public/`.
- Private blocked prefixes: `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, and `unscanned/`.
- Safe first CDN target is public/demo/ready playback assets only under the allowed public prefix.
- Paid/Premium media needs token/signed CDN access before public CDN delivery.
- MEDIA_CDN_SIGNING_MODE=off is only acceptable for public/safe playback assets.
- Private/Premium CDN delivery requires token/signed access first.
- Do not publish source/original/master objects through Cloudflare cache or any public CDN path.
- Do not connect a Cloudflare R2 custom domain directly to a mixed bucket containing private originals, unscanned uploads, or paid/Premium-only media unless Cloudflare token/WAF/Worker access control is already enforcing the private paths before R2 reads.
- The safest first custom-domain target is a separate proof or public-playback surface that contains only approved `playback/public/` assets.
- Use cache keys that separate video id, rendition quality, manifest/segment path, and authorization token shape.
- Configure Cloudflare to fetch from private R2 origin only after origin access and cache rules are explicitly proved.
- Cache headers: HLS segments and thumbnails may use long TTL plus immutable naming; HLS manifests use short TTL; non-versioned proof text uses short or default TTL; versioned proof text and generated proof MP4 may use long immutable TTL; private/original paths use no cache.
- Add purge/invalidation by video id and rendition path for takedowns, moderation changes, and entitlement policy changes.

### Prefix-Limited Public Exposure Decision

- Cloudflare R2 custom domains are a public bucket exposure path, not a bucket-native prefix-limited publish switch.
- The current proof did not identify a safe R2 custom-domain configuration that exposes only `playback/public/` while keeping private prefixes in the same bucket unreachable by configuration alone.
- A direct custom domain on a mixed bucket must be treated as unsafe for Chi'llywood media unless a Worker, WAF token rule, Cloudflare Access policy, or equivalent path/token control is already implemented and proved before bucket reads.
- R2 S3 presigned URLs remain valid for the R2 S3 API endpoint, but they do not protect R2 custom-domain URLs. Custom-domain authentication requires Cloudflare-layer controls such as WAF HMAC/token validation or a Worker gateway.
- Official Cloudflare docs basis: [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [Protect an R2 bucket with Cloudflare Access](https://developers.cloudflare.com/r2/tutorials/cloudflare-access/), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 and Cloudflare cache](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/), [Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/), [Cache Rules API](https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/), and [Cloudflare cache responses](https://developers.cloudflare.com/cache/concepts/cache-responses/).
- Recommended safest next architecture: create a separate public-playback proof bucket or public-playback surface containing only approved `playback/public/` assets, then connect `media.chillywoodstream.com` only to that safe surface after explicit owner approval.
- Alternative safe architecture: keep the R2 bucket private and put `media.chillywoodstream.com` on a Worker route that allowlists `playback/public/`, blocks private prefixes, applies token checks for paid/Premium paths, sets cache headers by asset class, and reads R2 through a private binding.
- Do not connect `media.chillywoodstream.com` directly to `chillywood-media-proof` while that bucket is a mixed private/proof bucket.
- Do not claim cache savings, CDN delivery for production media, or production media delivery until telemetry/log ingestion and production-safe resolver migration are in place.

### Public-Playback Proof Bucket

- `chillywood-media-public-playback-proof` is a separate R2 bucket for harmless public-safe proof assets only.
- The bucket currently contains only public-safe proof assets: text proof object `playback/public/proof/hello.txt`, cache-HIT text proof object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt`, generated demo proof MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4`, approved real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`, local-proof HLS assets under `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`, proof-only transcode queue HLS assets under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`, and first one-job worker-proof HLS assets under `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`.
- The bucket must not contain `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, `unscanned/`, unapproved real creator media, original/master media, unscanned uploads, private media, or Premium-only media.
- The bucket is publicly reachable only through `media.chillywoodstream.com` for harmless public-safe proof objects; r2.dev public access is disabled.
- Explicit owner approval was limited to connecting `media.chillywoodstream.com` to this public-playback proof bucket. No approval was given for production playback, private media, Premium media, or the private proof bucket.
- r2.dev, if approved later, is temporary proof access only and not the production delivery path.
- `media.chillywoodstream.com` points only at this separate public-playback proof bucket at this checkpoint.
- App production playback must remain on the resolver/direct signed-origin fallback until resolver proof, signed/token CDN access for non-public assets, cache proof, telemetry, takedown purge, and Premium gating are implemented and proved.

### Staged Cloudflare Proof Plan

- CLI/API preflight: Wrangler authentication is available without printing tokens, R2 is enabled, and the private proof bucket exists.
- First bucket target: `chillywood-media-proof`.
- The proof bucket remains private. Public bucket access, the r2.dev public development URL, and custom domains were not enabled during the private-origin proof.
- Proof object target: `playback/public/proof/hello.txt`.
- Private-origin proof used authorized remote Wrangler access to upload the harmless text proof object and read it back byte-for-byte.
- Separate public-playback proof bucket target: `chillywood-media-public-playback-proof`.
- Public-playback proof used authorized remote Wrangler access to upload the harmless text proof object and read it back byte-for-byte.
- Custom-domain proof connected `media.chillywoodstream.com` only to `chillywood-media-public-playback-proof`.
- Public proof fetch returned HTTP 200 and exact body `chillywood r2 public playback proof 2026-07-08T23:47:15Z`.
- Cache-HIT proof used immutable harmless text object `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt` with body `chillywood r2 cache proof 20260709T003701Z 3c152e0012db`.
- A narrow Cloudflare Cache Rule was applied only to `media.chillywoodstream.com/playback/public/proof/cache-hit/*`; repeated fetches returned HTTP 200, exact text match, `Cache-Control: public, max-age=31536000, immutable`, `Content-Type: text/plain`, `cf-cache-status: HIT`, and increasing `Age` after warmup. No egress or cost savings are claimed.
- Safe demo media proof uploaded generated MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` to the public-playback proof bucket only.
- Safe demo media public fetch returned HTTP 200, `Content-Type: video/mp4`, `Cache-Control: public, max-age=31536000, immutable`, `Accept-Ranges: bytes`, and byte-range fetch returned HTTP 206; repeated warm fetches returned `cf-cache-status: HIT`. ffprobe identified H.264 320x180 duration 2 seconds, ffmpeg decode passed, and frame-count proof decoded 48 frames.
- Proof-only app playback through `media.chillywoodstream.com` is proved only for the generated safe public demo MP4. No normal Home playback, creator-video playback, Watch-Party playback, or production playback path was switched.
- Real safe demo media proof uploaded approved public-safe Chi'llywood City Lights MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` to the public-playback proof bucket only.
- Real safe demo media public fetch returned HTTP 200, `Content-Type: video/mp4`, `Cache-Control: public, max-age=31536000, immutable`, `Accept-Ranges: bytes`, byte-range fetch returned HTTP 206, and repeated warm fetches returned `cf-cache-status: HIT`. ffprobe identified H.264 854x480 duration 52.208333 seconds, ffmpeg decode passed, and frame-count proof decoded 1253 frames.
- Real demo proof uses a resolver allowlist for `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` only. It does not enable CDN URLs for all creator videos.
- Local HLS proof worker generated 360p and 480p HLS from the approved City Lights public-safe MP4 and uploaded 24 proof HLS objects under `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/` to the public-playback proof bucket only.
- Local HLS public fetch returned HTTP 200 for `master.m3u8`, `360p/index.m3u8`, and `480p/index.m3u8`; ffmpeg decoded the public HLS master URL successfully.
- A narrow Cloudflare Cache Rule was applied only to versioned HLS proof segments under `media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/*.ts`; segment fetches returned HTTP 200, `Content-Type: video/mp2t`, `Cache-Control: public, max-age=31536000, immutable`, and `cf-cache-status: HIT` after warmup. No production egress or cost savings are claimed.
- HLS resolver proof uses a resolver allowlist for `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8` only. The source MP4 and segment URLs are not independently resolver-returned under the HLS proof config and fall back with `not_in_public_playback_allowlist`.
- App/player HLS proof uses a proof-only local harness for `app/player/[id].tsx`: the allowlisted HLS master is passed through the Player source contract as `{ uri }`, loaded with duration `52208ms`, progressed to `2175ms`, reported `isPlaying=true`, and produced playback-start evidence without private signed origin URLs.
- Proof-only transcode queue proof generated 360p and 480p HLS from the approved City Lights public-safe MP4 and uploaded 24 proof HLS objects under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/` to the public-playback proof bucket only.
- Proof-only transcode queue public fetch returned HTTP 200 for `master.m3u8`, `360p/index.m3u8`, and `480p/index.m3u8`; queue-generated `.ts` segments returned HTTP 200 with `Content-Type: video/mp2t`, immutable cache metadata, and `cf-cache-status: HIT` after the narrow proof-transcode segment cache rule; ffmpeg decoded the public queue HLS master URL successfully.
- Proof-only transcode queue resolver proof uses a resolver allowlist for `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8` only. The completed ready proof job can resolve that master; queued and failed proof jobs cannot resolve; non-allowlisted output paths fall back with `not_in_public_playback_allowlist`.
- First controlled one-job production proof generated 360p and 480p HLS from the approved City Lights source and uploaded 24 worker-proof HLS objects under `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/` to the public-playback proof bucket only.
- First controlled one-job public fetch returned HTTP 200 for `master.m3u8`, `360p/index.m3u8`, and `480p/index.m3u8`; worker-proof `.ts` segments returned HTTP 200 with `Content-Type: video/mp2t`, immutable cache metadata, `cf-cache-status: MISS` then `HIT` with `Age` after a narrow worker-proof segment cache rule; ffmpeg decoded the public worker-proof HLS master URL successfully.
- First controlled one-job production DB proof wrote job `0341d2d1-c02c-4719-91c5-bea9809f4739` and two audited `media_renditions` rows for source `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1` only. Explicit resolver allowlist proof returns the worker-proof HLS master; default creator-video playback still falls back to signed origin.
- Forbidden-prefix probes under `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, and `unscanned/` returned HTTP 404 through the public proof hostname.
- No production media, private/original media, unscanned upload, or Premium creator media was uploaded.
- No production playback config was switched.
- Read-only custom-domain/cache audit: bucket list shows `chillywood-media-proof`, r2.dev status is disabled, custom-domain list is empty, and the proof object still reads back as harmless text through authorized Wrangler access.
- Public-playback proof audit: bucket list shows `chillywood-media-public-playback-proof`, r2.dev status is disabled, custom-domain list contains `media.chillywoodstream.com`, and the proof object still reads back as harmless text through authorized Wrangler access.
- Public proof, when approved, may expose only `playback/public/` test assets. It must not expose source/original/master, unscanned, private, or Premium-only objects.

### Cloudflare Setup Steps Before Applying Public Delivery

1. Confirm the private proof bucket and harmless proof object remain non-production proof assets only.
2. Keep `media.chillywoodstream.com` scoped to the separate public-playback proof bucket until a later approved production migration plan exists.
3. Keep cache rules narrow. The only applied cache rules in this lane are the cache-HIT proof prefix `media.chillywoodstream.com/playback/public/proof/cache-hit/*`, the City Lights HLS proof segment path `media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/*.ts`, the proof-transcode queue HLS segment path `media.chillywoodstream.com/playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/*.ts`, and the first one-job worker-proof segment path `media.chillywoodstream.com/playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/*.ts`; do not add broad Cache Everything behavior.
4. Keep staged resolver support disabled for production playback by default.
5. Keep production creator-video playback on existing resolver/direct signed-origin fallback until signed/token CDN access, telemetry, takedown purge, and Premium gating are implemented and proved.

### Staged Public Playback Resolver Support

- `_lib/mediaDelivery.ts` stages the Cloudflare R2 custom-domain resolver helper for future safe public playback assets.
- `resolveMediaPlaybackDelivery(...)` returns `media.chillywoodstream.com` only when the delivery provider is `cloudflare_r2_custom_domain`, `MEDIA_CDN_BASE_URL` is configured, `MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true`, the asset path starts with `playback/public/`, and the caller explicitly marks the asset `publicPlaybackSafe`.
- Proof-only real demo mode also passes `cdnAllowedPublicPlaybackPaths` so only the approved City Lights public demo path can use the custom-domain URL in that proof.
- The helper blocks public CDN URLs for original/master/source paths, `original` quality, unscanned assets, moderation-blocked assets, private/owner assets, and Premium-only assets until signed/token CDN access is implemented and proved.
- Creator-video playback now has a guarded trusted `media_renditions` bridge. Default config still uses signed-origin fallback, and CDN/HLS requires explicit rollout config plus row-level trust gates.
- The helper returns safe metadata fields: `provider`, `cdnEligible`, `fallbackUsed`, `blockedReason`, and `publicPlaybackSafe`. It does not log full private signed URLs.
- `scripts/proof-media-delivery-resolver.mjs` proves the harmless public proof object can resolve to `https://media.chillywoodstream.com/playback/public/proof/hello.txt` and the generated demo MP4 can resolve to `https://media.chillywoodstream.com/playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` under explicit config, while private, original, Premium-only, unsafe, default creator-video, and missing-config cases fall back or block.
- `scripts/proof-media-delivery-public-demo.mjs` proves the generated demo MP4 resolves through the helper, fetches over `media.chillywoodstream.com`, supports byte-range playback, decodes with ffprobe/ffmpeg and frame-count proof, reports proof-only app playback metadata, has no signed-origin query string, and keeps private/original/Premium/unscanned/moderation-blocked/default creator-video paths on fallback or block.
- `scripts/proof-media-delivery-real-demo.mjs` proves the approved City Lights demo resolves through the explicit allowlist, fetches over `media.chillywoodstream.com`, supports byte-range playback, decodes with ffprobe/ffmpeg and frame-count proof, keeps a non-allowlisted public-safe demo path on fallback with `not_in_public_playback_allowlist`, and keeps private/original/Premium/unscanned/moderation-blocked/default creator-video paths on fallback or block.
- `scripts/proof-media-delivery-hls-demo.mjs` is a local proof worker that downloads the approved City Lights public-safe MP4, generates 360p/480p HLS, uploads proof-only HLS assets to the public-playback proof bucket, proves public master/variant/segment fetches plus segment cache HIT and ffmpeg decode, proves the proof-only app/player HLS harness receives the allowlisted master, load/progress/playback evidence is present, and proves the resolver returns only the allowlisted HLS master manifest while source MP4 and segment paths fall back.
- `_lib/mediaTranscodeQueue.ts` and `scripts/proof-media-transcode-queue-hls.mjs` add a source/proof-only backend transcode queue foundation. The proof models `queued -> probing -> transcoding -> uploading -> ready`, generates 360p/480p HLS from the approved City Lights public-safe MP4, uploads only under `playback/public/proof-transcode/`, builds sanitized HLS telemetry shapes, proves completed-job resolver eligibility for the allowlisted master, and proves queued/failed/non-allowlisted/private/original/Premium/unscanned/moderation-blocked paths cannot resolve to public CDN.
- `docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md` and migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql` define the future server-owned tables. This migration creates `media_transcode_jobs` for worker lifecycle state and `media_renditions` for trusted playback metadata, and it has been applied to production without switching playback; the only data rows are the first controlled City Lights proof job and two audited renditions.
- The RLS contract revokes client writes, grants worker writes through `service_role`, and adds explicit false insert/update/delete policies for `anon` and `authenticated`; clients cannot mark rows ready, set `public_playback_path`, set `is_public_playback_safe`, set worker identity, or create trusted CDN eligibility.
- Production playback remains unchanged until a later approved lane adds trusted public-safe asset metadata, cache-HIT proof, telemetry, and signed/token CDN access for non-public assets.

### Signed CDN Playback

- Keep the backend resolver as the only quality decision point.
- Supabase/Edge resolver remains the access-control and playback decision layer.
- Replace direct signed origin playback URLs with signed/token Cloudflare custom-domain manifest URLs only after signing and telemetry are implemented and proved.
- Signed/token CDN grants should be short-lived, scoped to one video/rendition set, and tied to the authenticated viewer where possible.
- The client should receive only resolver-approved playback URLs. It should not build CDN paths locally.
- The app must ask the backend resolver for playback; the app must not hard-code R2 or Cloudflare custom-domain decisions.
- Direct origin signing should remain available for owner/staff private operations and bounded legacy fallback during migration.

### Private Original/Master Policy

- Originals are processing inputs and audit sources.
- Originals may be downloaded by the owner, approved staff, or worker service role only through explicit private access paths.
- Originals must not be marked `free` or `premium`.
- Originals must not appear in HLS master manifests, CDN public paths, or regular playback quality lists.
- Do not enable public access for originals/master files.
- Takedown, malware, scan-pending, and moderation-disabled originals must fail closed for public and Premium viewers.

### HLS/ABR Renditions

- HLS/transcoding is a future milestone unless implemented and proved.
- Current proof scope: local proof workers and a proof-only queue model have generated and proved 360p/480p HLS for the approved public-safe City Lights demo only. This does not create a production transcode queue, does not insert trusted `video_renditions` rows, does not migrate creator-video playback, and does not make HLS/transcoding live for production.
- The proof-only queue output lives under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`. It proves source probing, local ffmpeg rendition generation, public R2 upload, manifest/variant/segment fetch, public HLS decode, resolver completed-job gating, and telemetry event shaping without production DB writes.
- The first controlled one-job output lives under `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`. It proves the owner-approved production path can run once under backup gate, operator lease, post-write audit, exact R2 prefix, narrow segment cache rule, explicit resolver allowlist, and scoped rollback plan without deploying a worker or switching playback.
- Queue-path segments returned immutable cache metadata and `cf-cache-status: HIT` after the narrow proof-transcode queue HLS segment cache rule. This proves cache behavior for that proof prefix only and does not prove production cache savings.
- App/player HLS playback proof is complete in a proof-only local harness for the allowlisted City Lights HLS master URL. Normal Player creator-video playback can use the trusted-row bridge only when rollout config enables it and all gates pass; fallback remains signed origin.
- Generate HLS VOD packages for 360p, 480p, 720p, and 1080p only when the source supports that output without fake upscaling claims.
- Free quality target remains 360p/480p. Premium quality target remains 720p/1080p only with backend entitlement proof.
- Premium HD HLS must use signed/token CDN access before playback. 720p/1080p manifests belong under a protected Premium path such as `playback/premium/` or `playback/protected/premium/`, require active Premium entitlement, short-lived user/source/rendition/path-scoped token claims, and a tokenized URL signer; public 360p/480p HLS remains unsigned only after public-safe audit gates pass.
- Protected Premium HD generation is closed for the current HD-capable public-safe set. HD outputs were generated only when source dimensions supported them, uploaded under `playback/protected/premium/`, audited before ready rows were promoted, and verified through the token-validating Worker. City Lights remains SD-only because the source is 854x480. Backend/app token issuance is deployed and OTA-published; installed app Premium/free playback proof is partially complete with free/non-Premium fallback proved and Premium-active playback still pending.
- Original/master files remain private processing inputs and must not be listed as normal playback renditions.
- Store each rendition's manifest path, segment prefix, codec, dimensions, bitrate, duration, checksum or manifest hash, byte size, and status in trusted metadata.
- Prefer a master manifest that lists only resolver-allowed variants or generate per-viewer signed access to a static master where CDN signing prevents unauthorized segment access.
- Keep MP4 fallback only as a legacy compatibility path until HLS coverage is proved.
- Production HLS live claim requires future proof that a backend worker ran from a trusted source, rendition files exist, trusted metadata rows exist, the manifest plays, the resolver returns the HLS URL for approved playback, cache HIT is proved for segments, and signed-origin fallback still works.

### Transcode Worker Queue

- Proof-only foundation: `_lib/mediaTranscodeQueue.ts` defines `MediaTranscodeJob`, `MediaTranscodeJobStatus`, `MediaTranscodeRendition`, `MediaTranscodeManifest`, and `MediaTranscodeProofResult` for local proof modeling only.
- Proof-only statuses: `queued`, `probing`, `transcoding`, `uploading`, `ready`, and `failed`.
- Proof-only fields include `jobId`, `sourceId`, `sourceType`, `inputProvider`, `inputPath`, `outputProvider`, `outputPrefix`, `requestedRenditions`, `completedRenditions`, `durationMillis`, `sourceWidth`, `sourceHeight`, `sourceCodec`, `errorCode`, `errorMessage`, `createdAt`, and `updatedAt`.
- `npm run proof:media-transcode-queue-hls` proves the approved City Lights demo can move through that model and upload HLS outputs to the public-playback proof bucket. It performs no production DB writes, creates no queue table, inserts no `video_renditions` rows, and does not switch production playback.
- `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` documents the future production worker architecture for a container/VM with ffmpeg, not a deployed production service.
- `npm run proof:media-transcode-worker-local` proves the worker flow locally with the approved City Lights demo only: claim queued job, mark probing, ffprobe, mark transcoding, ffmpeg 360p/480p HLS generation, validate master/variants/segments, mark uploading, simulate public playback upload keys, build trusted `media_renditions` rows in memory, resolve only the allowlisted HLS master, build sanitized telemetry, and prove failed jobs cannot publish ready rows.
- The local worker proof runs a disposable `@electric-sql/pglite` policy check when available. It applies the migration in memory, denies client trusted writes, allows service-role/worker proof writes, proves resolver-safe select for 360p/480p rows, and denies unsafe/original/Premium/unscanned/moderation-blocked/wrong-bucket/non-public-prefix rows without connecting to production.
- The local worker proof does not upload R2 objects, does not write production DB rows, does not run a production queue processor, does not deploy a worker, and does not switch production playback.
- Backup/PITR gate status is Blocked. PITR or owner-approved backup/restore readiness is a hard activation gate before future production worker writes, production backfill, or production worker activation; no paid PITR/add-on change may be made without explicit owner approval.
- Backend-owned tables `media_transcode_jobs` and `media_renditions` are applied to production and currently contain City Lights plus the bounded CLI auto-detect cycle rows. An external durable queue may still be used later for worker orchestration.
- Queue one job after a creator-video upload row exists and the source object is scan-safe enough for processing.
- Future worker flow: claim jobs idempotently, download the private source, probe with `ffprobe`, transcode with `ffmpeg`, produce 360p/480p/720p/1080p renditions when allowed by source dimensions, write an HLS master manifest, write variant playlists and segments, generate thumbnails, upload derived public-safe playback assets to the public-playback bucket only after scan/moderation approval, insert `video_renditions` rows, and mark failed jobs with safe error codes.
- Workers must use service credentials that are never exposed to the client.
- Retries, dead-letter handling, cleanup of partial renditions, and no-upscale policy must be explicit before claiming transcode closure.
- Do not claim HLS/transcoding live until the worker run, output files, manifest playback, resolver URL, cache HIT for segments, and fallback proof all exist.

### Free vs Premium Quality Ladder

- Free viewers: 360p and 480p only.
- Premium viewers: 720p and 1080p only when ready renditions exist and backend entitlement proof is active.
- Owners and authorized staff may see status and private operational access, but that must not weaken public/Premium playback policy.
- Missing or stale entitlement proof fails closed to free-only for non-owner viewers.
- The Player must continue to rely on resolver output rather than hardcoded local quality decisions.

### Watch-Party Playback Quality Policy

- Do not change LiveKit room behavior or Watch-Party authority behavior in this architecture lane.
- Creator-video Watch-Party sources must use the same creator-video playback resolver path as standalone Player.
- A host's Premium signed URL must not be forwarded as a shared entitlement to free viewers.
- Future Watch-Party shared playback should use per-viewer resolver/CDN signing or a lowest-common allowed quality policy that never gives HD to a free viewer.
- LiveKit camera, speaker, dynacast, simulcast, and Watch-Party seat behavior stay separate from VOD CDN policy.

### Media Bandwidth Telemetry

- Telemetry foundation is source/proof-only. No production telemetry table writes, backend inserts, migrations, CDN log ingestion, provider reconciliation, billing changes, payout changes, or production playback changes are live in this lane.
- `_lib/mediaDeliveryTelemetry.ts` defines pure helpers for future `media_delivery_events` and `media_playback_sessions` record shapes: `buildMediaDeliveryEvent(...)`, `buildMediaPlaybackSessionStart(...)`, `buildMediaPlaybackSessionEnd(...)`, `estimatePlaybackBytes(...)`, and `sanitizeMediaDeliveryTelemetryForProof(...)`.
- `scripts/proof-media-delivery-telemetry.mjs` proves the helper without network/database writes. It builds a Cloudflare R2 custom-domain HLS demo event, a signed-origin fallback event, a blocked private/original/Premium-style event, a batch rollout playback event, nullable and non-null Watch-Party session shapes, byte estimates, and sanitized proof output with `delivery_format`, `rollout_mode`, and `free_or_premium`.
- Planned `media_playback_sessions` fields: `id`, `user_id` nullable/redacted in proof, `video_id`, `creator_id` nullable, `source_type`, `source_id`, `delivery_provider`, `playback_url_provider`, `media_delivery_provider`, `quality_label`, `rendition_label` nullable, `public_playback_safe`, `cdn_eligible`, `fallback_used`, `blocked_reason` nullable, `watch_party_id` nullable, `is_premium_user` nullable, `started_at`, `ended_at` nullable, `seconds_watched` nullable, `estimated_bytes` nullable, `cdn_cache_status` nullable, `client_platform` nullable, `app_version` nullable, and `proof_mode`.
- Planned `media_delivery_events` fields: `id`, `user_id` nullable/redacted in proof, `video_id`, `creator_id` nullable, `source_type`, `source_id`, `delivery_provider`, `playback_url_provider`, `media_delivery_provider`, `quality_label`, `rendition_label` nullable, `public_playback_safe`, `cdn_eligible`, `fallback_used`, `blocked_reason` nullable, `watch_party_id` nullable, `is_premium_user` nullable, `started_at`, `ended_at` nullable, `seconds_watched` nullable, `estimated_bytes` nullable, `cdn_cache_status` nullable, `client_platform` nullable, `app_version` nullable, and `proof_mode`.
- The telemetry helper intentionally does not accept or emit full playback URLs, signed origin URLs, R2 signed URLs, or CDN token material. It stores provider labels such as `playback_url_provider`, not URL strings.
- Proof output must redact raw `user_id`, `creator_id`, and `watch_party_id` values and scrub URL-like values before console output.
- Record signed playback grants with video id, owner id, viewer id where available, quality, CDN/provider, token TTL, and request id.
- Ingest Cloudflare cache/R2 logs or provider usage exports to get bytes served by video id, rendition, owner id, status code, cache hit/miss, and day/hour.
- Reconcile internal grant counts with provider/CDN byte reports.
- Roll up media egress by creator, video, quality, provider, and day.
- Planned backend telemetry can support quota, abuse detection, cost controls, and owner/admin read models after implementation.
- Do not expose private user ids in proof docs; use redacted ids or aggregate proof when telemetry is later implemented.
- This lane does not touch billing, payout, or cashout.
- Do not claim real scaled media delivery proof until playback bytes are measured from CDN/provider logs or equivalent trusted telemetry.
- Bandwidth/minutes-watched telemetry remains required before broad rollout.

### Creator Quota Controls

- Enforce upload count, storage bytes, transcode minutes, rendition bytes, failed-job retry counts, and playback egress quotas by creator.
- Keep creator quota decisions backend-owned.
- Provide owner/admin override and appeal paths with audit logs.
- Separate quota state from Premium entitlement. Premium may allow creator tools, but it should not bypass abuse, malware, or cost controls.

### Abuse And Rate Limits

- Keep the existing upload URL rate limit.
- Add signed playback grant rate limits by user, video, owner, IP/security context, and device where available.
- Add CDN hotlink protection and token scoping so copied URLs expire quickly.
- Rate limit failed entitlement attempts and direct-origin signing attempts.
- Add worker-side abuse controls for repeated failed transcodes, unsupported codecs, oversized duration, and malformed files.

### Migration Plan From Existing Signed S3 URLs

1. Keep current direct signed origin playback as a legacy fallback while foundations are built.
2. Add origin/provider abstraction without changing Player UX.
3. Add Cloudflare R2 config support behind `MEDIA_ORIGIN_PROVIDER=cloudflare_r2`, with no secrets committed.
4. Keep R2 private by default and verify direct signed R2/S3-compatible fallback.
5. Stage Cloudflare custom-domain/cache resolver support for public/demo/ready playback assets only, disabled for production playback by default.
6. Add token/signed CDN access before any paid or Premium media uses the Cloudflare custom-domain/cache path.
7. Add transcode queue and worker behind service credentials.
8. Generate real renditions for new uploads, then backfill existing public/clean creator videos.
9. Add media bandwidth telemetry from Cloudflare/provider logs and reconcile it with signed playback grants.
10. Gradually prefer Cloudflare custom-domain HLS in the backend playback resolver only after public-safe asset metadata, cache-HIT proof, telemetry, takedown purge, Premium gating, and signed/token CDN access are proved; leave single-file fallback for videos without ready renditions.
11. Disable public legacy fallback only after migration proof shows ready renditions, CDN signing, telemetry, takedown purge, Premium gating, and Watch-Party resolver behavior are all correct.

### Config Contract

Define config names and approved non-secret contract values only. Do not commit provider secrets or account-specific R2 values.

```sh
MEDIA_ORIGIN_PROVIDER=cloudflare_r2
MEDIA_DELIVERY_PROVIDER=origin_signed_direct | cloudflare_r2_custom_domain
MEDIA_CDN_BASE_URL=https://media.chillywoodstream.com
MEDIA_CDN_SIGNING_MODE=off | token
MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX=playback/public/
MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true
R2_BUCKET
R2_ACCOUNT_ID
R2_S3_ENDPOINT
```

Config rules:

- If Cloudflare R2 config is absent, current signed origin behavior remains fallback.
- If Cloudflare R2 config is present but an asset is not explicitly `publicPlaybackSafe`, current signed origin behavior remains fallback.
- `MEDIA_CDN_SIGNING_MODE=off` is only acceptable for public/safe playback assets.
- Private/Premium CDN delivery requires token/signed access first.
- `MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true` is the safe default until token/signed CDN access is implemented and proved.
- Production VOD defaults remain fail-safe, so adding these config names alone does not switch creator-video playback unless rollout config is explicitly enabled and trusted rows pass all gates.
- Do not commit R2 account ids, S3 endpoints, access keys, secret keys, API tokens, signed URLs, or provider dashboard secrets.

### Provider Abstraction

The app should treat Hetzner, Cloudflare R2, Bunny, and other S3-compatible stores as origin providers behind the same contract:

- `createUploadGrant(surface, objectKey, sizeBytes, mimeType)`
- `completeUploadGrant(uploadId or objectKey, checksum, sizeBytes)`
- `createPrivateOriginDownloadGrant(objectKey, purpose)`
- `createCdnPlaybackGrant(videoId, renditionSet, viewerContext)`
- `deleteObject(objectKey)`
- `readObjectMetadata(objectKey)`
- `listProviderUsage(period)`

Provider adapter fields:

- provider key and display label
- S3 endpoint, region, bucket, path-style or virtual-hosted style
- max object size, multipart support, and part-size rules
- CDN hostname, signer type, token/cookie support, and purge API
- origin access method and private bucket policy
- usage export/log availability and billing dimensions
- egress pricing model and cache behavior

Recommended path:

- Near term: Cloudflare R2 as private origin, Cloudflare custom domain/cache as the delivery/cache layer for safe playback assets, and Supabase/Edge resolver as access-control and playback decision layer.
- Current/legacy fallback: Hetzner Object Storage or any already-configured S3-compatible origin may continue through direct signed origin URLs while migration work is incomplete.
- Optional future managed-video alternative: Cloudflare Stream is optional later and is not required for this R2/custom-domain path.
- Optional future CDN alternative: Bunny CDN remains an alternative only if the team later moves away from Cloudflare custom-domain/cache, after proving entitlement-aware signing, log export, takedown purge, and source privacy.
- Keep direct S3 signing as a migration fallback, not the target playback plane.
