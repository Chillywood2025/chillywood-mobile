# Media Transcode Worker Runbook

Status: no production worker is deployed and no queue processor is running. The production schema for `media_transcode_jobs` and `media_renditions` is applied, and the first owner-approved one-job proof wrote exactly one City Lights job plus two audited HLS rendition rows. Creator-video playback now has a guarded audited-row CDN/HLS bridge, but default source config still falls back to signed origin and any activation must keep the kill switch and signed-origin fallback.

## Runtime Choice

Preferred runtime: a small container or VM worker with ffmpeg and ffprobe installed. The worker needs predictable CPU, disk, process time, and temporary-file capacity for video processing.

Supabase Edge Functions are not the primary runtime for the heavy transcode loop because ffmpeg binaries, long-running jobs, temporary HLS output trees, and retry cleanup are a poor fit for short-lived edge execution. Edge Functions may still enqueue jobs, claim jobs, or expose controlled worker APIs later, but the video processing host should be a worker/container/VM.

## Inputs

Each worker run starts from a server-owned `media_transcode_jobs` row:

- `source_type` and `source_id`
- `input_provider`, `input_bucket_role`, `input_bucket`, and `input_path`
- `output_provider`, `output_bucket_role`, `output_bucket`, and `output_prefix`
- `requested_renditions`
- `worker_version`
- `source_hash`

The source can be a private origin object fetched by worker credentials or a known safe public proof URL. Production creator uploads must come from private origin storage and must never be downloaded by client-provided public URL metadata alone.

## Required Safety Checks

Before probing or transcoding, the worker must verify:

- the source object exists and is readable by worker authority
- the source belongs to the expected creator/media row
- the source is allowed for processing
- scan state is clean or approved when scan is required
- moderation state is allowed
- the source is not moderation-blocked
- unscanned uploads are not public-CDN eligible
- original/master input remains private
- output prefix starts with `playback/public/` only when the asset is approved for public playback
- output prefix does not contain `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, or `unscanned/`
- Premium/private outputs do not use public CDN while `MEDIA_CDN_SIGNING_MODE=off`

## Processing Flow

1. Claim one queued job with service-role or trusted worker authority.
2. Mark the job `probing`.
3. Run ffprobe and record source duration, width, height, codec, and source hash.
4. Verify the requested ladder is allowed for the source and account policy.
5. Mark the job `transcoding`.
6. Run ffmpeg to generate HLS renditions such as 360p and 480p, with future 720p/1080p gated by Premium policy and source dimensions.
7. Validate every output: master manifest, variant playlists, segment existence, segment decode, no private/signed-origin URLs in manifests, and no forbidden output prefix.
8. Mark the job `uploading`.
9. Upload to the public playback bucket only for clean, moderation-allowed, public-safe playback assets.
10. Write `media_renditions` rows with service-role or trusted worker authority after output validation succeeds.
11. Mark the job `ready`.
12. If any required step fails, mark the job `failed` and do not write ready rendition rows.

## Failure Behavior

Retries must be bounded. A failed job records `error_code` and a redacted `error_message`. The worker must not leave partial ready rows. Partial uploads should be cleaned up when cleanup is safe; if cleanup cannot be guaranteed, the resolver must still ignore incomplete jobs and non-ready renditions.

The worker must never mark `is_ready=true` before source probing, HLS generation, upload-path validation, manifest validation, and resolver eligibility checks pass.

## Security

Worker secrets stay only on the worker host. Logs must not include service-role keys, DB URLs, provider credentials, private signed URLs, authorization headers, or raw user identifiers. The app/client path cannot insert or update trusted readiness, public playback path, `is_public_playback_safe`, `worker_version`, or `source_hash`.

Public CDN eligibility comes only from backend-written trusted rows that are ready, public, clean or approved, moderation-allowed, non-original, in the public playback bucket role, under `playback/public/`, visible through the public-safe RLS policy, and permitted by the configured rollout mode. City Lights is the canary; expansion uses `canary`, `batch`, or `trusted_public` rollout gates with the kill switch and signed-origin fallback still active.

## Rollback

Rollback controls:

- disable the worker process
- stop job claiming
- leave resolver default on signed-origin fallback
- remove or narrow any resolver allowlist
- delete bad public proof objects when safe
- mark affected jobs `failed`
- remove bad `media_renditions` rows with service-role authority if rows were created by mistake

Schema rollback is separate and must follow the database rollback plan. Playback can remain safe without schema rollback because the resolver does not use production rows by default.

## Activation Gates

Production worker activation requires all of these gates:

- PITR or owner-approved backup/restore readiness is in place
- worker secrets are configured outside the repo
- worker host has ffmpeg and ffprobe
- local proof harness passes
- disposable DB worker proof passes
- production schema readback remains healthy
- owner explicitly approves production worker activation
- owner explicitly approves any production writes/backfill
- installed playback proof passes before any production playback switch

Backup/PITR gate status: Blocked for broad production worker writes/backfill/continuous activation.

Current backup/PITR readback on 2026-07-09:

- Production project ref: `bmkkhihfbmsnnmcqkoly`.
- Production project name: `Chillywood2025's Project`.
- Production region/status: `us-west-2` / `ACTIVE_HEALTHY`.
- `supabase backups list --project-ref bmkkhihfbmsnnmcqkoly -o json` returned `pitr_enabled=false`, `walg_enabled=true`, `backups=[]`, and `physical_backup_data={}`.
- Supabase Management API billing add-on readback returned no selected add-ons and listed paid PITR variants: `pitr_7` with 7-day restore window at `$100/month`, `pitr_14` with 14-day restore window at `$200/month`, and `pitr_28` with 28-day restore window at `$400/month`.
- Enabling PITR is a provider billing/add-on mutation and requires explicit owner approval before any change.

Classification: Blocked for continuous automation. WAL-G is visible but is not treated as sufficient for broad production media worker writes/backfill because no true PITR restore window or scheduled restore system is verified. Do not enable PITR or any paid backup feature without explicit owner approval. No broad production worker writes or backfill while the backup/PITR gate is Blocked or Partial.

## R2 Logical Backup/Restore Gate

R2 logical backup/restore gate status: Closed for one-job proof readiness only. This is an application-level logical backup, restore drill, audit, and rollback layer. It is not true PostgreSQL PITR, it does not store Supabase WAL, and it does not make continuous production automation safe.

Latest successful backup artifact prefix used before the first controlled one-job proof:

- `backups/media-worker/2026/07/09/media-worker-logical-20260709-one-job-readiness-b81c7b1423c6/`

Backup scope:

- Included tables: `media_transcode_jobs`, `media_renditions`.
- Included data: scoped table row counts were read back as `media_transcode_jobs=0` and `media_renditions=0` before the one-job write, so the pre-write data artifact is intentionally empty.
- Included schema: scoped media worker schema generated from applied migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql` with disposable-restore fixture metadata.
- Excluded tables: auth users, creator videos, profiles, billing, payouts, private media objects, and existing `video_renditions`, because the one-job worker proof rollback gate only needs the server-owned media worker tables.
- Backup type: logical, not PITR.
- Restore target: disposable PGlite database only.

R2 storage/readback proof:

- Objects were uploaded only to private R2 bucket `chillywood-media-proof` under the backup prefix.
- Required objects: `manifest.json`, `schema.sql.gz`, `data-media-worker.sql.gz`, and `sha256sums.txt`.
- `npm run proof:media-recovery-backup-restore` read every object back through authorized Wrangler access and verified matching SHA-256 checksums.
- `chillywood-media-public-playback-proof` did not contain backup artifacts.
- `https://media.chillywoodstream.com/backups/media-worker/.../manifest.json` returned `404`, so the public media domain did not expose the backup.
- The manifest records `logical_backup_not_pitr=true`, `contains_secrets=false`, `public_bucket_used=false`, and `production_rows_written=false`.

Restore drill proof:

- `npm run proof:media-recovery-backup-restore` restored the schema/data artifacts into a disposable PGlite database.
- The restore verified `media_transcode_jobs` and `media_renditions`, required indexes, RLS enabled flags, expected empty row counts, and a resolver-safe query.
- Synthetic clean public-ready rows were selected by the resolver-safe query, while synthetic Premium/private/original/unscanned/moderation-blocked/wrong-bucket cases were excluded.
- No production DB rows were written.

Rollback drill proof:

- `npm run proof:media-worker-rollback-drill` creates a fake worker batch under `playback/public/proof-rollback/chillywood-city-lights/v1-b670602fa00934ca-drill/` in a disposable PGlite database only.
- The rollback plan targets only the exact `batch_id` and exact R2 prefix, quarantines only scoped rows, revokes resolver trust only for scoped rows, and leaves unrelated rows untouched.
- Missing batch id, broad `playback/public/` prefix, private paths, Premium rows, and original/master rows are denied.
- The drill deletes no real R2 objects.

One-job proof classification: Closed for the first controlled City Lights proof. The run used owner-approved source `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`, `max_jobs_per_run=1`, backfill disabled, fresh backup/readback/restore proof, local HLS generation, public worker-proof R2 upload, post-write audit, explicit resolver allowlist proof, scoped rollback proof, auto-disable, and no production playback switch. Any future one-job proof must repeat the gate with a fresh backup check, exact source allowlist, pending-audit worker rows, auditor pass before resolver trust, quarantine on audit failure, and no production playback switch.

Continuous automation readiness classification: Blocked. Continuous production worker writes/backfill still require true PITR or a proven scheduled backup/restore system with owner approval. Any future continuous mode also requires explicit owner approval, max concurrency, max jobs per run, dead-letter handling, retry caps, audit pass before resolver trust, rollback scope, and telemetry. Broad backfill is a separate approval path and remains denied by default. The R2 logical backup layer does not replace PITR for continuous production.

## Scheduled R2 Logical Backup Gate

Status: manual logical backup runner implemented, first real manual backup complete, scheduler not deployed. `scripts/run-media-worker-logical-backup.mjs` is disabled/dry-run by default and can write/upload only when manually invoked with `MEDIA_BACKUP_RUNNER_ENABLED=true`, `MEDIA_BACKUP_MODE=write`, a private R2 backup bucket, and `MEDIA_BACKUP_R2_PREFIX=backups/media-worker/`. `MEDIA_BACKUP_EXPORT_MODE=auto|pg_dump|js` supports both the existing dump-tool path and a Node JS SELECT export fallback; when `pg_dump`/`psql` are missing, `auto` resolves to JS and emits `schema.sql.gz` plus `data-media-worker.jsonl.gz`. `MEDIA_BACKUP_DATABASE_SOURCE=linked` uses Supabase CLI linked read-only queries instead of requiring or printing a raw database URL; `MEDIA_BACKUP_DATABASE_URL` remains available for safe URL-based environments. Backup operation is CLI-only from Codex/local terminal. No GitHub Actions workflow, cron schedule, deployed scheduler, continuous worker, queue processor, additional media processing, or playback switch is enabled. First real manual backup completed on 2026-07-09 at private R2 prefix `backups/media-worker/2026/07/09/media-worker-logical-20260709T152048-8820af024114/`; row counts were `media_transcode_jobs=1` and `media_renditions=2`, R2 readback checksums matched, public bucket/domain probes did not expose artifacts, and disposable PGlite restore matched the manifest row counts.

CLI-only operation commands:

- Final handoff checklist: `docs/MEDIA_WORKER_CLI_OPERATING_CHECKLIST.md`. Future sessions should use that checklist for any owner-approved allowlisted one-job run and must not infer approval for cron, a scheduler, a deployed worker service, broad backfill, continuous automation, or a production playback switch.
- `npm run backup:media-worker:preflight` checks linked Supabase identity for project `bmkkhihfbmsnnmcqkoly`, private R2 target, scoped row counts, no running worker, no media-worker workflow/cron, and unchanged production playback.
- `npm run backup:media-worker:status` prints the latest backup prefix and current media-worker table counts without secrets.
- `npm run backup:media-worker:verify-latest` verifies the latest private R2 backup manifest and checksums and confirms no public bucket or `media.chillywoodstream.com` exposure.
- `npm run backup:media-worker:restore-drill` restores the latest backup into disposable PGlite and verifies row counts plus resolver-safe filtering.
- `npm run backup:media-worker:run` is still manual backup creation only. It does not deploy or run the media worker.

Scheduled backup policy for future limited automation:

- Scope: `media_transcode_jobs`, `media_renditions`, and schema/migration metadata needed to restore those tables into a disposable database.
- Frequency: before every worker run, plus a daily scoped logical backup if limited automation is later approved.
- Freshness: backup must be less than 24 hours old for limited automation; backup must be less than 1 hour old for one-job proof or backfill-like runs.
- Restore drill: at least one successful disposable restore drill is required after schema changes; recurring restore drill freshness is required before limited automation can close.
- Storage: private R2 only under `backups/media-worker/YYYY/MM/DD/<backup_id>/`.
- Retention: keep the latest daily backups and always keep the latest restore-drill-passed backup; only private R2 backup prefixes can be retention keep/delete candidates.
- Public bucket safety: backup artifacts are denied if they target `chillywood-media-public-playback-proof`, `media.chillywoodstream.com`, or any `playback/public/` path.

`_lib/mediaRecoveryOperator.ts` defines `MediaBackupSchedulePolicy`, `MediaBackupFreshnessResult`, `MediaBackupRetentionPolicy`, and `MediaBackupSchedulerState`, plus `resolveScheduledMediaBackupRequirement(...)`, `evaluateMediaBackupFreshness(...)`, `evaluateRestoreDrillFreshness(...)`, `resolveContinuousWorkerBackupGate(...)`, `buildMediaBackupRetentionPlan(...)`, and `sanitizeScheduledBackupProof(...)`.

`npm run proof:media-scheduled-backup-gate` proves:

- no backup blocks continuous automation
- stale backup blocks continuous automation
- fresh backup without restore drill blocks continuous automation
- fresh private R2 backup plus fresh restore drill closes the limited-automation backup gate only
- logical R2 backup does not close true PITR/continuous broad automation by itself
- one-job owner override works only with a fresh manual backup
- public playback bucket backup target is denied
- secret-like backup artifact content is denied
- retention keeps the latest restore-drill-passed backup
- broad backfill remains denied without explicit owner approval
- scheduler dry-run does not create a production backup, write production rows, deploy a scheduler, run a worker, or switch playback

`npm run proof:media-worker-backup-runner` proves the real runner and restore drill surface:

- `backup:media-worker:dry-run` creates a redacted dry-run plan without production DB credentials and attempts no upload
- write mode fails closed when required env is missing
- JS export mode works without `pg_dump`/`psql`, uses SELECT-only reads for `media_transcode_jobs` and `media_renditions`, and emits a JSONL data artifact
- linked-source JS export works through Supabase CLI linked read-only queries without requiring or printing a raw database URL
- `backup:media-worker:status`, `backup:media-worker:verify-latest`, and `backup:media-worker:restore-drill` pass against the latest private R2 backup prefix
- public playback bucket targets, `media.chillywoodstream.com`, and non-`backups/media-worker/` prefixes are denied before any DB access
- backup scope is limited to `media_transcode_jobs` and `media_renditions`; auth, billing, payouts, private media, creator originals, and signed URLs are excluded
- manifest shape and checksum generation are validated
- a fixture backup restores into disposable PGlite and resolver-safe selection returns only clean public-safe rows
- no production DB write, worker deployment, queue processor, cron schedule, or production playback switch occurs

No GitHub Actions cron is added. A future workflow must be `workflow_dispatch` only by default, require private backup secrets, and require explicit owner approval before any schedule is added.

## CLI-Only One-Job Worker Controls

Status: CLI command infrastructure exists and is proofed, but no new production media job was processed by this lane. The worker remains CLI-only, with no daemon, no cron, no scheduler, no deployed queue processor, no broad backfill, and no production playback switch.

Package commands:

- Final CLI checklist: `docs/MEDIA_WORKER_CLI_OPERATING_CHECKLIST.md`.
- `npm run media-worker:preflight` checks the latest private R2 backup gate, linked Supabase project identity, scoped media-worker row counts, `max_jobs_per_run=1`, backfill disabled, source allowlist requirement, no active unfinished jobs, no media-worker cron/scheduler, public/private bucket safety, and unchanged production playback.
- `npm run media-worker:status` reports `media_transcode_jobs`, `media_renditions`, active unfinished jobs, unsafe CDN rows, other-source rendition count, latest backup gate, and disabled worker state without printing secrets.
- `npm run media-worker:dry-run -- --source-id=<allowlisted-source>` builds a one-job plan, expected output prefix, expected job/rendition rows, audit batch, and rollback plan. It writes no DB rows and uploads no media.
- `npm run media-worker:run-one -- --source-id=<allowlisted-source>` is infrastructure only until a future owner-approved run. It fails closed unless the source is allowlisted, `max_jobs=1`, backfill is disabled, the backup gate is closed, dry-run has passed, and `MEDIA_WORKER_RUN_ONE_CONFIRM=I_UNDERSTAND_ONE_JOB` is present. In this task it still does not execute production writes.
- `npm run media-worker:audit -- --source-id=<source-id> --batch-id=<batch-id>` scopes audit to that exact source and batch. It can perform read-only scoped checks, but it does not mark rows ready.
- `npm run media-worker:verify-output -- --source-id=<source-id> --output-prefix=<exact-prefix>` verifies only the exact worker-proof HLS prefix and denies broad, private, original, Premium, processing, moderation-blocked, or unscanned paths.
- `npm run media-worker:rollback-plan -- --source-id=<source-id> --batch-id=<batch-id> --output-prefix=<exact-prefix>` creates a scoped rollback plan only. It does not delete R2 objects or mutate DB rows.

`npm run proof:media-transcode-worker-cli` proves default `run-one` denial, missing-source denial, non-allowlisted source denial, `max_jobs > 1` denial, backfill denial, stale backup gate denial, dry-run no-write behavior, explicit run-one confirmation requirement, one-job-only planning, audit scope requirements, exact-prefix output verification, scoped rollback planning, broad-prefix denial, private-path denial, public/private bucket safety, no production playback switch, no worker deployment, no queue processor, and no secrets in proof output.

## First Controlled One-Job Production Proof

Status: Closed for one allowlisted proof job only.

- Source: Chi'llywood City Lights, creator video `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`.
- Job id: `0341d2d1-c02c-4719-91c5-bea9809f4739`.
- Output prefix: `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`.
- Public HLS master: `https://media.chillywoodstream.com/playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/master.m3u8`.
- Generated renditions: 360p and 480p HLS only.
- R2 upload: 24 public-safe HLS objects uploaded only to `chillywood-media-public-playback-proof` under the output prefix.
- Cache proof: a Cloudflare cache rule was added only for `media.chillywoodstream.com/playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/*.ts`; a 360p segment returned `MISS` then repeated `HIT` with `Age`.
- DB write: one `media_transcode_jobs` row and two `media_renditions` rows were written for this source only. No rows were written for any other source.
- Audit: post-write auditor verified exact row count, source id, rendition labels, public prefix, no forbidden/private prefixes, non-original rows, public visibility, clean scan status, allowed moderation status, public playback bucket role, no unexpected ready rows before audit, and no other-source rows.
- Resolver proof: the worker-proof master resolves to `media.chillywoodstream.com` only with an explicit proof allowlist; default creator-video playback still falls back to signed origin.
- Rollback proof: scoped rollback plan targets only this job/batch and exact R2 prefix, preserves unrelated rows, and denies missing batch, broad prefix, private, Premium, and original/master rollback targets.
- Worker final state: auto-disabled after one-job success. No continuous mode, long-running worker, or production queue processor is active.
- Production playback: unchanged.

Abort production worker activation if any of these are true:

- project ref/name/status does not match the expected production project
- PITR is disabled and no owner-approved restore path is verified
- backup metadata or restore window cannot be read back
- enabling PITR requires a billing or plan change without explicit owner approval
- no restore drill or owner-accepted rollback method is documented
- production row writes/backfill are requested before this gate is Closed

Before worker activation, run a restore readiness drill or document an owner-approved restore method with the restore window, rollback steps, responsible operator, and stop criteria.

## Operator-Controlled Worker Safety

`_lib/mediaTranscodeOperator.ts`, `_lib/mediaTranscodeWorkerSafety.ts`, and `_lib/mediaRecoveryOperator.ts` define a source/proof-only operator control model for any future worker. This does not deploy a worker, does not write production rows, and does not switch playback.

Operator rules:

- default mode is `disabled`
- `emergency_stop` always blocks every mode
- `dry_run` is plan-only and cannot write rows
- `one_job` requires `allowed_source_ids`, `max_jobs_per_run=1`, backfill disabled, a public/allowed source, and either a Closed backup gate or explicit owner one-job override
- `continuous` is denied while the backup/PITR gate is Blocked or Partial
- worker code cannot self-enable; it must receive an operator lease
- leases are source-bound, max-job-bound, and expire if the job stalls
- one-job mode auto-disables after success or failure
- audit failure quarantines the batch and auto-disables the worker lane

Worker rules:

- worker must call the operator before running
- worker must refuse if no lease is present
- worker must refuse if the source id differs from the lease
- worker must refuse when the lease max job count is reached
- worker may write only `pending_audit` rows in this proof model
- worker must not mark rows resolver-ready before the auditor passes
- worker stops after one job in `one_job` mode

Auditor rules:

- auditor re-reads rows by `batch_id`
- auditor verifies exact `source_id`, exact row count, public paths under `playback/public/`, clean/approved scan state, allowed moderation state, no original/private/Premium public playback, no unexpected ready rows, and exact rollback scope
- resolver trust is allowed only after the auditor passes
- rollback plans are scoped to the exact `batch_id` and R2 prefix

Self-auditing and operator leases reduce blast radius for one controlled job, but they do not replace true PITR or a verified restore path for continuous production. No continuous production worker writes/backfill are allowed while the backup/PITR gate remains Blocked or Partial.

## Local Proof Harness

`npm run proof:media-transcode-worker-local` is the current worker proof. It uses only the approved public-safe City Lights demo MP4, builds an in-memory/mock transcode job, simulates claim and status transitions, runs ffprobe, generates local 360p and 480p HLS with ffmpeg, validates manifests and segments, simulates upload object keys under `playback/public/proof-worker/`, builds trusted `media_renditions` rows in memory, validates resolver eligibility, builds sanitized telemetry events, proves failed-job behavior, and runs a disposable PGlite write-policy proof when available.

The local proof harness does not connect to the production database, does not write production rows, does not upload private/original/Premium media, does not deploy a worker, and does not switch production playback.

Additional safety proofs:

- `npm run proof:media-transcode-operator-control` proves disabled default, emergency stop precedence, dry-run no-write behavior, one-job allowlist lease, max-job/backfill denial, backup-gate owner override limits, continuous-mode denial while the backup gate is blocked, worker self-enable denial, auto-disable, quarantine, and resolver ignoring pending/quarantined rows.
- `npm run proof:media-transcode-worker-auditor` proves lease validation, source mismatch denial, max-job denial, lease expiry, pending-audit-only worker writes, auditor pass/fail behavior, exact rollback scope, resolver trust only after audit pass, quarantine, and auto-disable.
