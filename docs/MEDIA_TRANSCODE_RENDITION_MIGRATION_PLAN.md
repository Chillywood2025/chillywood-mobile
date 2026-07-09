# Media Transcode Rendition Migration Plan

Last updated: 2026-07-09

Status: production schema applied as schema only. Migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql` was applied to production on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`), with tables/indexes/RLS/policies/grants read back afterward. This plan does not switch production playback, does not migrate existing videos, does not backfill media rows, and does not make production transcoding live.

## Current DB Audit

1. Current `video_renditions` schema

- `supabase/migrations/202605140010_vod_quality_ladder_resolver.sql` creates `video_renditions` with `video_id`, `owner_id`, `quality_label`, dimensions, bitrate, codec/container, `storage_bucket`, `storage_path`, `manifest_path`, `status`, `access_tier`, and timestamps.
- It constrains quality labels to `original`, `360p`, `480p`, `720p`, and `1080p`.
- It constrains status to `queued`, `processing`, `ready`, `failed`, and `archived`.
- It keeps `original` rows owner/private and HD rows Premium/owner/private.
- `20260530191115_media_malware_scanning_pipeline.sql` adds `scan_status`, scan provider/result/error, scanned timestamp, and quarantine fields to `video_renditions`.
- `20260623170000_creator_media_scan_safe_playback_resolver.sql` updates resolver behavior so public playback requires scan-safe video/rendition state.

2. Existing RLS/policy state

- RLS is enabled on `video_renditions`.
- Authenticated users can select owner/staff-visible rendition status.
- Direct authenticated inserts, updates, and deletes are blocked with false policies.
- `anon` and `authenticated` grants are revoked except authenticated select; `service_role` has full table access.
- `media-storage` and storage policies check video visibility, moderation, scan safety, original exclusion, and Premium entitlement before signing or exposing rendition paths.

3. Client write status

- Clients cannot directly write trusted `video_renditions` rows through Data API policies.
- Owner upload can call `record_video_original_rendition(...)`, but that only records an owner/private original source row and does not create public CDN eligibility.
- The future Cloudflare R2/HLS path must keep ready/public-safe CDN metadata server-owned. Clients must never set `is_ready`, `is_public_playback_safe`, `public_playback_path`, `manifest_path`, `delivery_provider`, `bucket_role`, `worker_version`, or `source_hash`.

4. Missing fields for R2/HLS trusted rows

- `delivery_format`
- `delivery_provider`
- `storage_provider`
- `bucket_role`
- `public_playback_path`
- `variant_playlist_path`
- `cache_policy`
- `visibility`
- `moderation_status` copied onto the rendition
- `is_public_playback_safe`
- `is_original`
- `is_ready`
- `worker_version`
- `source_hash`

5. Need for `media_transcode_jobs`

`media_transcode_jobs` is needed because upload-to-HLS work has lifecycle state that does not belong in a playback row: queued/probing/transcoding/uploading/ready/failed, worker version, source hash, requested/completed renditions, error codes, input/output providers, and timestamps. It gives the backend worker an auditable server-owned queue without treating incomplete outputs as playback.

6. Separate `media_renditions` vs extending `video_renditions`

A separate `media_renditions` table is safer for the next step. It avoids changing the existing VOD resolver, storage signing policies, and creator-video fallback path before the new worker and resolver are explicitly approved. A later migration can either bridge `media_renditions` into `resolve_video_playback(...)` or copy trusted rows into an extended `video_renditions` contract after proof.

## Proposed Tables

### `media_transcode_jobs`

Server-owned queue table for future upload-to-rendition work.

Key fields:

- `source_type`
- `source_id`
- `creator_id`
- `requested_by`
- `input_provider`
- `input_bucket_role`
- `input_bucket`
- `input_path`
- `output_provider`
- `output_bucket_role`
- `output_bucket`
- `output_prefix`
- `status`
- `requested_renditions`
- `completed_renditions`
- `duration_ms`
- `source_width`
- `source_height`
- `source_codec`
- `worker_version`
- `source_hash`
- `error_code`
- `error_message`
- `proof_mode`
- `started_at`
- `completed_at`

### `media_renditions`

Trusted future playback metadata table. It is separate from current `video_renditions` until activation is approved.

Trusted fields:

- `source_type`
- `source_id`
- `rendition_label`
- `delivery_format`
- `delivery_provider`
- `storage_provider`
- `bucket_role`
- `public_playback_path`
- `manifest_path`
- `variant_playlist_path`
- `width`
- `height`
- `codec`
- `bitrate`
- `duration_ms`
- `cache_policy`
- `visibility`
- `scan_status`
- `moderation_status`
- `is_public_playback_safe`
- `is_original`
- `is_ready`
- `worker_version`
- `source_hash`

## Write Authority

- `service_role` / backend worker is the only intended writer for `media_transcode_jobs` and `media_renditions`.
- `anon` and `authenticated` table write grants are revoked.
- RLS includes explicit false insert/update/delete policies for `anon` and `authenticated`.
- Ready/public-safe fields are worker-owned: `is_ready`, `is_public_playback_safe`, `public_playback_path`, `manifest_path`, `variant_playlist_path`, `delivery_provider`, `storage_provider`, `bucket_role`, `worker_version`, and `source_hash`.
- Public CDN eligibility must never come from app/client input, upload form metadata, or untrusted user-controlled row updates.

## Read Authority

- The future resolver can read ready allowed rows through a server-owned path.
- Owners/operators may inspect job/rendition status.
- Public clients may only see safe public metadata if needed: ready, public, public-safe, scan-safe, moderation-allowed, non-original rows in the public playback bucket under `playback/public/`.
- Premium/private rows are not public-CDN-readable until signed/token CDN access is implemented and proved.

## RLS Requirements

- RLS must be enabled on both tables.
- Clients cannot insert jobs or renditions.
- Clients cannot update jobs or renditions.
- Clients cannot delete jobs or renditions.
- Clients cannot mark rows ready.
- Clients cannot set `public_playback_path`.
- Clients cannot set `is_public_playback_safe`.
- Clients cannot set `worker_version` or `source_hash`.
- Public-safe select policy must require `is_ready=true`, `is_public_playback_safe=true`, `visibility='public'`, scan-safe state, moderation-allowed state, `bucket_role='public_playback'`, `storage_provider='cloudflare_r2'`, `delivery_provider='cloudflare_r2_custom_domain'`, non-original row, and a `playback/public/` path without forbidden private prefixes.

## Production Schema Migration Result

Migration file:

- `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql`

The migration creates:

- `media_transcode_jobs`
- `media_renditions`
- update timestamp triggers
- indexes for `source_type/source_id`, readiness, rendition label, delivery provider, visibility, job id, and job status
- RLS policies that block direct client writes
- service-role grants for worker-owned writes
- public-safe metadata select policy constrained to safe public CDN rows

Production schema migration status: applied to production on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`); tables/indexes/RLS/policies/grants were read back and both `media_transcode_jobs` and `media_renditions` had row count 0 after the rollback-only runtime policy proof.

Production data/write boundary: no production media backfill, real media row insert, production `video_renditions` write, production resolver bridge, production transcode worker, or production playback switch is live.

Production runtime policy proof: a rollback-only production transaction denied anon/authenticated trusted writes, allowed service-role/worker proof writes, verified resolver-safe select for one clean public-ready proof row, verified unsafe/original/Premium/private/non-public-prefix rows failed eligibility, and rolled back. Final production row counts remained `media_transcode_jobs=0` and `media_renditions=0`.

## Dry-Run Status

Current repo proof:

- `npm run proof:media-rendition-migration-policy`
- `npm run proof:media-rendition-migration-dry-run`

The dry-run proof script statically validates the migration SQL every time: table names, trusted columns, indexes, grants, RLS enablement, client false-write policies, service-role worker grants, comments, original/master constraints, public CDN eligibility constraints, and ready-row worker proof requirements.

Current workstation result on 2026-07-09:

- Static SQL validation passed.
- Runtime dry-run passed in an in-memory disposable local Postgres runtime via `@electric-sql/pglite`.
- The runtime was safe because it used no network database URL, no production Supabase project, and no production service-role key.
- The proof applied the minimal Supabase fixture schema plus `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql`, then verified `media_transcode_jobs`, `media_renditions`, indexes, RLS enablement, policies, and grants.
- Anon/authenticated client writes were denied for ready rendition inserts, trusted path/readiness/public-safe updates, and ready transcode-job inserts.
- Service-role/worker writes passed for queued job insert, `queued -> probing -> transcoding -> uploading -> ready` status updates, failed job insert, and ready public-safe rendition insert.
- Resolver-safe anon select returned exactly one clean, public, ready, public-playback row under `playback/public/`.
- Safety cases denied public CDN eligibility for original/master, Premium/private, unscanned, moderation-blocked, wrong-bucket-role, and non-public-prefix rows.
- The script also proves production-looking DB URLs are refused and reports `noSecretsPrinted=true`.
- Docker/local Supabase and `psql` are still unavailable in this shell, so the non-production runtime proof uses the embedded disposable local database rather than a network DB URL.

Runtime dry-run behavior when a safe database is provided:

- Set `MEDIA_RENDITION_DRY_RUN_DATABASE_URL` to a local or explicitly test/shadow-labeled Postgres URL.
- The proof script refuses production-looking URLs and does not print connection strings.
- For local/shadow runtime mode, the script creates a temporary database, applies minimal fixture schema plus the migration, verifies tables/indexes/RLS/grants/policies, proves anon/authenticated client trusted writes are denied, proves service-role/worker queued job and ready public-safe rendition inserts are allowed, proves unsafe/original/Premium public-CDN rows fail, proves resolver-safe public metadata can be selected, then drops the temporary database.

This dry-run status remains non-production proof. The production schema has now been applied separately as schema only; dry-run proof still does not make production transcoding or production playback live.

## Worker Runbook And Local Proof Status

`docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` now defines the future production transcode worker design: a container/VM worker with ffmpeg and ffprobe, trusted `media_transcode_jobs` input, private-source safety checks, queued/probing/transcoding/uploading/ready lifecycle, output validation before ready rows, partial-output cleanup, service-role-only writes, redacted logs, rollback controls, and activation gates.

`npm run proof:media-transcode-worker-local` is local proof only. It uses the approved public-safe City Lights demo MP4, simulates `queued -> probing -> transcoding -> uploading -> ready`, generates 360p and 480p HLS locally, validates master/variant/segment outputs and ffmpeg decode, simulates upload keys under `playback/public/proof-worker/`, builds trusted `media_renditions` rows in memory, validates resolver eligibility, builds sanitized telemetry events, proves a failed job cannot publish ready rows, and runs a disposable PGlite worker-policy proof.

The local worker proof does not connect to production DB, does not write production rows, does not upload R2 objects, does not deploy a worker, does not run a production queue processor, and does not switch playback.

Operator-controlled worker safety is source/proof-only: `_lib/mediaTranscodeOperator.ts`, `_lib/mediaTranscodeWorkerSafety.ts`, and `_lib/mediaRecoveryOperator.ts` require disabled default mode, emergency-stop precedence, source-bound one-job leases, `max_jobs_per_run=1`, backfill disabled, pending-audit-only worker writes, auditor pass before resolver trust, auto-disable after one-job success/failure, and quarantine on audit failure. `continuous` remains denied while the backup/PITR gate is Blocked or Partial. This safety model reduces one-job blast radius but does not replace PITR or a verified restore path for continuous production.

Backup/PITR gate: Blocked for production worker writes/backfill/activation. Production readback on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`, `us-west-2`, `ACTIVE_HEALTHY`) returned `pitr_enabled=false`, `walg_enabled=true`, `backups=[]`, and `physical_backup_data={}`. Management API billing add-on readback returned no selected add-ons and listed PITR as paid available variants `pitr_7` (`$100/month`), `pitr_14` (`$200/month`), and `pitr_28` (`$400/month`). Enabling PITR is a provider billing/add-on mutation and requires explicit owner approval. WAL-G alone is not treated as sufficient for the worker-write/backfill gate without a verified restore window, latest backup metadata, or restore drill. No production worker writes or backfill while the backup/PITR gate is Blocked or Partial.

R2 logical backup/restore gate: Closed for one-job proof readiness only. The scoped logical backup includes only `media_transcode_jobs` and `media_renditions`; production row counts were read back as zero for both tables, so the data artifact is intentionally empty. The latest artifacts are stored only in private R2 bucket `chillywood-media-proof` under `backups/media-worker/2026/07/09/media-worker-logical-20260709-one-job-readiness-0712c0fbc441/` and include `manifest.json`, `schema.sql.gz`, `data-media-worker.sql.gz`, and `sha256sums.txt`. `npm run proof:media-recovery-backup-restore` verified private R2 readback checksums, confirmed the public playback bucket and public media domain did not expose the backup, restored into disposable PGlite, and proved resolver-safe selection. `npm run proof:media-worker-rollback-drill` proved exact-batch/exact-prefix rollback and denied missing batch, broad prefix, private, Premium, and original/master rollback targets. This is application-level logical backup and restore proof, not true PostgreSQL PITR and not continuous automation readiness.

## Backfill Strategy

1. Do not backfill existing production creator videos automatically.
2. Start with a small allowlisted operator/test set after owner approval.
3. For each source, a worker downloads a trusted private source, validates ownership/source hash, probes with ffprobe, writes a queued job, generates renditions, uploads HLS outputs to the public-playback bucket only after scan/moderation approval, and writes ready rendition rows with `worker_version` and `source_hash`.
4. Original/master rows stay private and are not normal playback rows.
5. Premium/private rows remain signed-origin or future signed/token CDN only.
6. Resolver activation should be a separate migration after row proofs pass.

## Rollback Strategy

- Because this migration adds new tables and does not alter current playback, rollback is isolated: stop worker writes, leave existing production playback on signed-origin fallback, and drop or disable the new resolver bridge if one was later added.
- If the table migration is applied and then rejected before production resolver use, drop public grants/policies first, then drop `media_renditions`, `media_transcode_jobs`, and touch triggers/functions in a rollback migration.
- Do not delete original/source media as part of metadata rollback.

## Proof Completed Before Production Schema Apply

- Static proof that `anon` and `authenticated` cannot insert/update/delete trusted rows.
- Static proof that service-role/worker authority is required for ready/public-safe fields.
- SQL lint/review for RLS, grants, constraints, and indexes.
- Local or staging database application proof, not production, including policy tests for anon/authenticated/service-role behavior.
- Worker proof that writes only approved demo/test media rows with `worker_version` and `source_hash`.
- Resolver proof that only ready public-safe clean allowed rows resolve to Cloudflare custom-domain URLs.
- Premium/private token-CDN proof before any Premium/private CDN delivery.

## Production Activation Gates

1. Owner approval to apply the schema migration: complete for schema only.
2. Migration dry-run and disposable runtime apply: complete.
3. Production schema readback plus rollback-only RLS/policy proof: complete.
4. Backend worker runbook and local proof harness: complete for design/local proof only; production worker deployment and staging worker proof remain pending.
5. Backup/PITR gate: Blocked until PITR or an owner-approved restore path is verified; no worker writes/backfill while this gate remains Blocked or Partial.
6. One-job logical recovery gate: Closed only for a future owner-accepted one-job proof with exact source allowlist, operator lease, auditor pass, rollback drill, and no playback switch.
6. Operator-controlled one-job safety: source/proof complete; production use still requires explicit approval and no production rows are written by this proof.
7. Trusted rows for a limited allowlisted source only: pending and requires explicit approval.
8. Resolver migration behind disabled config: pending.
9. Cache HIT and telemetry proof for the migrated source: pending.
10. Signed-origin fallback proof: pending.
11. No private/original/Premium/unscanned/moderation-blocked media exposed: required for every next lane.
12. Explicit owner approval before any production playback switch: still required.
