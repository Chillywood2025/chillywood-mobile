# Chi'llywood VOD Quality Ladder And Playback Resolver

Last updated: 2026-05-14

This document records the repo-side foundation for VOD quality enforcement. It does not claim transcoding is live.

## Product Policy

- Free VOD playback target: 360p / 480p max.
- Premium VOD playback target: 720p / 1080p max when those renditions actually exist.
- Original/master uploads are private processing sources. They are not regular playback renditions.
- Player must ask the backend resolver which qualities are allowed. The client must not guess Premium access or HD access locally.
- Missing or unavailable Premium entitlement proof fails closed to free-only for non-owner viewers.

## Repo Foundation

Migration:

- `supabase/migrations/202605140010_vod_quality_ladder_resolver.sql`

Backed model:

- `video_renditions` stores rendition metadata for `original`, `360p`, `480p`, `720p`, and `1080p`.
- `access_tier` separates `owner`, `free`, `premium`, and `private` renditions.
- `status` supports `queued`, `processing`, `ready`, `failed`, and `archived`.
- Direct client writes are blocked. Owner upload can record the original through `record_video_original_rendition`; future transcode workers/service role can create derived renditions.
- RLS lets video owners and platform Owner/Admin see rendition status. Regular users cannot list rendition rows or premium/private paths directly.

Resolver:

- `resolve_video_playback(video_id uuid)` returns only allowed playback options for the current viewer.
- Free viewers receive ready free renditions only.
- Premium viewers receive ready premium HD renditions only when `user_entitlements` proves active `premium`.
- Owners/platform Owner/Admin can inspect status for their own/platform operations.
- Original/master paths are excluded from regular playback options.
- If no ready renditions exist, the resolver marks legacy single-file playback as `pending_renditions` so the current app can keep existing creator video playback while truthfully showing that quality enforcement is not complete.

Trusted rendition metadata foundation:

- Existing `video_renditions` rows are a live schema foundation, but they are not yet trusted production Cloudflare R2/HLS playback rows.
- The current schema has quality, status, access tier, storage bucket/path, and optional manifest path. It does not yet carry enough Cloudflare-ready trust metadata to safely choose public HLS by itself: delivery format, delivery provider, storage provider, bucket role, public playback path, master manifest path, variant playlist path, cache policy, scan/moderation state copied onto the rendition, public playback safety, original/master flag, and explicit readiness all need to be trusted inputs before production CDN playback can use rows.
- `_lib/mediaRenditionMetadata.ts` defines the source-only `TrustedMediaRenditionMetadata` contract for the future row shape and `canUseTrustedRenditionForPublicCdn(...)` for public CDN eligibility.
- Public CDN eligibility requires `is_ready=true`, `is_public_playback_safe=true`, `scan_status` clean or approved, `moderation_status` allowed/clean/approved, `bucket_role=public_playback`, `storage_provider=cloudflare_r2`, `delivery_provider=cloudflare_r2_custom_domain`, a `playback/public/` path, and `is_original=false`.
- Original/master rows are private processing sources and cannot be marked normal playback. Premium/private rows still require signed/token CDN access later and cannot use public CDN while `MEDIA_CDN_SIGNING_MODE=off`.
- `npm run proof:media-rendition-metadata` uses proof-only City Lights HLS fixture rows for 360p and 480p under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/master.m3u8`; it does not insert production database rows.

Trusted backend migration path:

- `docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md` designs the server-owned migration path for future `media_transcode_jobs` and `media_renditions`.
- Migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql` is applied to production as schema only; it does not switch production playback, backfill media rows, or make a production transcode worker live.
- A separate `media_renditions` table is safer than extending live `video_renditions` in this lane because current creator-video playback, storage signing, and resolver fallback behavior remain untouched until explicit owner approval.
- The RLS/write contract makes service role or backend worker authority the only trusted write path for ready/public-safe rendition metadata. Clients cannot mark rows ready, set `public_playback_path`, set `is_public_playback_safe`, set `worker_version`, set `source_hash`, or create public CDN eligibility from client-controlled data.
- `npm run proof:media-rendition-migration-policy` statically proves the migration SQL and docs keep client writes blocked, require ready/public-safe/clean/moderation-allowed public CDN rows, block original/master normal playback, block Premium/private public CDN without token mode, and keep production playback unchanged.
- `npm run proof:media-rendition-migration-dry-run` passes static SQL validation plus runtime apply/RLS checks in an in-memory disposable local Postgres runtime via `@electric-sql/pglite`. It applies the migration SQL, verifies tables/indexes/RLS/policies/grants, proves anon/authenticated trusted writes are denied, proves service-role/worker writes pass, proves resolver-safe anon select returns one clean public-ready row, and proves unsafe/original/Premium/private/non-public-prefix rows cannot become public CDN eligible. Production schema readback and rollback-only RLS proof passed on 2026-07-09, final production row counts stayed zero, and production playback remains unchanged.
- Production transcode worker runbook and local proof harness: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` and `npm run proof:media-transcode-worker-local` model the future worker locally with the approved City Lights demo only. The proof generates local 360p/480p HLS, simulates public upload keys, builds trusted rows in memory, validates resolver eligibility, builds sanitized telemetry, proves failed-job blocking, and runs a disposable PGlite worker-policy proof without production DB writes, R2 uploads, worker deployment, or playback switching.
- Operator-controlled worker safety: `_lib/mediaTranscodeOperator.ts`, `_lib/mediaTranscodeWorkerSafety.ts`, `_lib/mediaRecoveryOperator.ts`, `npm run proof:media-transcode-operator-control`, and `npm run proof:media-transcode-worker-auditor` require disabled default mode, emergency stop, one-job source allowlist, pending-audit-only worker rows, auditor pass before resolver trust, quarantine on audit failure, and auto-disable. Self-auditing reduces one-job risk but does not replace PITR for continuous production.

Client integration:

- `_lib/vodQuality.ts` normalizes resolver output and signs only the resolver-selected rendition where possible.
- `_lib/creatorVideos.ts` uses the resolver for Player playback and records an original rendition after new uploads when the migration is present.
- `components/creator-media/creator-video-card.tsx` shows creator-facing rendition status in Platform Studio Content cards.
- `supabase/functions/media-storage` now authorizes rendition downloads by checking `video_renditions`, video public/moderation state, ownership/staff role, and Premium entitlement before signing S3 rendition paths.

## Live Proof Status

As of 2026-05-14, live VOD enforcement is not closed, but the schema/function deployment blocker is cleared. The linked Supabase project was confirmed as `bmkkhihfbmsnnmcqkoly` / Chi'llywood2025's Project. Linked migration list and linked schema lint passed, dry-run showed only `202605140010_vod_quality_ladder_resolver.sql`, migration `202605140010` was applied remotely, post-apply migration list shows local/remote alignment through `202605140010`, and post-apply dry-run says the remote database is up to date. `media-storage` was deployed as ACTIVE version 37, OPTIONS returned `200`, and a no-auth signing request returned `401 missing_auth`.

The remaining blocker is real playback proof data and real auth contexts. No trusted `video_renditions` rows were inserted, no real rendition files were created or proved, and no backed Premium entitlement was proved in this lane. Do not claim live Free/Premium VOD enforcement until real files exist, trusted rows reference only those files, and resolver/media-storage proof passes for free viewer, Premium viewer or fail-closed entitlement blocking, owner status, original/master privacy, direct-path denial, and processing/failed denial.

## Existing Player Test Video Attempt

The next live proof pass selected existing standalone Player creator-video proof row `84c486e9-a62e-4121-8e70-ee79e17b1bf0`, safe label `S3 Runtime Proof 2026-04-30T21-46-14-025Z`. Prior artifacts show it opened through `/player/84c486e9-a62e-4121-8e70-ee79e17b1bf0?source=creator-video`, and public metadata shows it is public/clean S3 media in `chillywood-media-prod`.

That pass did not create rendition rows because the proof environment had no real owner/free/Premium auth sessions and no local S3 signing credentials. Anonymous resolver proof returns `pending_renditions` with no allowed qualities, anonymous direct `video_renditions` read/write is denied, and anonymous `media-storage` signing returns `401 missing_auth`. The next proof needs a safe authenticated owner/test session or server-side operator proof path to download the real source, generate real non-upscaled renditions, upload actual files, and insert trusted rows only for those files.

The Free VOD rendition enforcement proof was retried against the same selected video and stopped before source download. `ffmpeg` and `ffprobe` are installed locally, but this shell has no owner/test auth session for owner `4b5e7761-5bf1-4e18-9eb7-d6037a0eb32f`, no safe service-role/operator source-download path, no S3 storage credentials, and no usable linked database password. Because an allowed actor could not sign/download the source, no ffprobe metadata proof, 360p/480p file generation, storage upload, trusted `video_renditions` insert, or processing/failed proof rows were created. Free signed-in resolver/signing proof remains blocked; the existing anonymous proof remains fail-closed with `pending_renditions`, direct `video_renditions` denial, and `401 missing_auth` from `media-storage`.

## Current Limits

- This lane does not create a production transcoder.
- This lane does not create fake 360p/480p/720p/1080p files.
- Existing single-file creator videos can still play through legacy fallback until real renditions exist.
- Cloudflare R2 public playback support is staged only for explicit `publicPlaybackSafe` assets under `playback/public/`. The generated proof MP4 at `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` proves the custom-domain path for a harmless demo object through a proof-only local app playback harness; the approved City Lights public-safe demo copy at `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` proves the same path only under an explicit `cdnAllowedPublicPlaybackPaths` allowlist. The local HLS proof tree at `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/` proves 360p/480p demo HLS packaging, public master/variant/segment fetches, segment cache HIT, resolver allowlist behavior only for the demo HLS master, and proof-only app/player HLS load/progress/playback evidence for that allowlisted master. The proof-only transcode queue path `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/` models queued/probing/transcoding/uploading/ready states, generates 360p/480p HLS, uploads public-safe proof outputs, decodes the public master, and proves completed-job resolver gating without trusted `video_renditions` writes; queue-path segments returned immutable cache metadata with `cf-cache-status: HIT` after a narrow proof-transcode segment cache rule. Existing creator-video playback still passes `publicPlaybackSafe: false` and falls back to signed origin.
- Media delivery telemetry is source/proof-only in the R2 proof lane. `_lib/mediaDeliveryTelemetry.ts` can shape future playback session and delivery event records, but no VOD production telemetry table writes, quality enforcement changes, or playback migration are live.
- Production HLS/ABR renditions are not live in the R2 proof lane. A live production claim still requires a backend worker run from trusted private source, real rendition files, trusted `video_renditions` rows, manifest playback, resolver return, segment cache proof, and fallback proof.
- Trusted rendition metadata for Cloudflare R2/HLS is source/proof-only. `_lib/mediaRenditionMetadata.ts` and `npm run proof:media-rendition-metadata` prove a local City Lights fixture can bridge trusted ready public-safe HLS metadata into the existing `media.chillywoodstream.com` allowlist, while not-ready, original/master, Premium/private, unsafe scan/moderation, wrong bucket role, non-public prefix, non-allowlisted, and default creator-video source paths all block or fall back. No production `video_renditions` writes are live.
- Trusted backend migration schema is applied to production as empty schema only. No production media row writes, production resolver bridge, production transcode worker, or production playback switch is live.
- Trusted backend migration dry-run passes in the embedded disposable local Postgres runtime, and production rollback-only RLS proof passed with final row counts back to zero.
- Production transcode worker design/local proof exists, but the production worker is not deployed. Backup/PITR gate status is Blocked: production readback returned `pitr_enabled=false`, `walg_enabled=true`, `backups=[]`, and `physical_backup_data={}` for project `bmkkhihfbmsnnmcqkoly`, and paid PITR variants require explicit owner approval before any provider billing/add-on mutation. PITR or owner-approved backup/restore readiness is required before future production worker writes, production backfill, or worker activation.
- Operator control and auditor proofs are source-only. They do not write production rows, do not deploy a worker, and do not switch playback.
- Full live enforcement of Free/Premium VOD quality remains blocked until:
  - real rendition files are generated,
  - rendition rows are inserted by a trusted worker/service,
  - delivery/signing is proved for those rendition paths,
  - Premium entitlement proof is live for the target account.

## Guard

Run:

```sh
npm run guard:vod-quality-policy
```

The guard checks the VOD constants, migration, resolver helper, Player integration path, media-storage rendition authorization, and absence of hardcoded HD access in Player.
