# Media Recovery Operator Runbook

Status: operator/auditor source/proof model with one completed owner-approved production proof job. The recovery operator/auditor model is local code plus proof scripts; it does not deploy a production worker, does not run a production queue processor, and does not switch playback. The first controlled one-job proof wrote exactly one production `media_transcode_jobs` row plus two audited `media_renditions` rows for allowlisted City Lights only.

## Purpose

The recovery operator is the independent audit gate between worker output and resolver trust. A future worker can produce only `pending_audit` rows. The resolver must ignore those rows until an auditor verifies the exact batch and source, then marks only the audited rows safe for resolver trust.

## Operator Control

- Worker mode defaults to `disabled`.
- `emergency_stop` always wins.
- `dry_run` is plan-only and cannot write rows.
- `one_job` requires an allowlisted source id, `max_jobs_per_run=1`, backfill disabled, source allowed for processing, and either Closed backup readiness or explicit owner one-job override.
- `continuous` is denied while the backup/PITR gate is Blocked or Partial.
- Worker code cannot self-enable and cannot broaden a one-job lease.
- The operator auto-disables after one-job success or failure.

## Auditor Checks

The auditor must re-read intended rows by `batch_id` and verify:

- exact `source_id`
- exact expected row count
- all public playback paths stay under `playback/public/`
- all paths stay under the exact R2 proof/output prefix for the batch
- no original/master rows are public playback
- private or Premium rows must not be public CDN playback
- scan state is clean or approved
- moderation state is clean, approved, or allowed
- no unexpected resolver-ready rows exist before audit pass
- rollback plan is scoped to the exact `batch_id` and R2 prefix

Audit pass is required before resolver trust. Audit failure sets the batch to quarantined, keeps resolver trust off, and disables the worker lane.

## Recovery And Rollback

Rollback is scoped to the exact batch and R2 prefix. The rollback plan must not delete private origin media, must not change production playback, and must revoke resolver trust for the failed batch before any cleanup.

## Backup/PITR Boundary

Self-auditing reduces blast radius for a single owner-approved job, but it does not replace true PITR or a verified restore path for continuous production. Continuous production worker writes/backfill remain blocked while the backup/PITR gate is Blocked or Partial.

## R2 Logical Backup/Restore Drill

Status: Closed for one-job backup/restore readiness only. Recovery Operator is application-level logical backup, restore drill, audit, and rollback safety. It is not true PostgreSQL PITR and does not store Supabase WAL.

Latest private R2 backup artifact prefix used before the first controlled one-job proof:

- `backups/media-worker/2026/07/09/media-worker-logical-20260709-one-job-readiness-b81c7b1423c6/`

Backup scope:

- Included: `media_transcode_jobs`, `media_renditions`.
- Included data: the one-job pre-write production row counts were `media_transcode_jobs=0` and `media_renditions=0`, so the scoped data artifact used for the proof was intentionally empty. After the proof, current scoped production row counts are `media_transcode_jobs=1` and `media_renditions=2` for the allowlisted City Lights source only.
- Excluded: auth user data, creator video rows, profiles, billing, payouts, private media objects, and existing `video_renditions`.
- Backup type: logical, not PITR.
- Restore target: disposable DB only.
- Expected use: future owner-accepted one-job worker proof readiness, not continuous automation readiness.

R2 storage rules:

- Backups go only to private R2 bucket `chillywood-media-proof` under `backups/media-worker/`.
- Backups must never be uploaded to `chillywood-media-public-playback-proof`.
- Backups must never be exposed through `media.chillywoodstream.com`.
- Backups must not contain secrets, signed URLs, private creator media, originals, Premium media, or unscanned upload content.

Proof result:

- `npm run proof:media-recovery-backup-restore` created `manifest.json`, `schema.sql.gz`, `data-media-worker.sql.gz`, and `sha256sums.txt`, uploaded them to the private backup prefix, read them back through authorized Wrangler access, and verified checksums.
- Public playback bucket readback did not find the backup, and the public media-domain probe returned `404`.
- The disposable PGlite restore verified tables, indexes, RLS enabled flags, row counts, resolver-safe select behavior, and unsafe-row exclusion.
- `npm run proof:media-worker-rollback-drill` proved a fake batch rollback plan scoped to exact `batch_id` and exact R2 prefix, denied missing batch, denied broad prefixes, denied private/Premium/original paths, preserved unrelated rows, and deleted no real R2 objects.

One-job gate: verified R2 logical backup plus restore and rollback drills closed the gate for the completed City Lights proof because the owner accepted the one-job risk and operator constraints remained active. Any future one-job proof must create or verify a fresh scoped backup before writes.

Continuous gate: still blocked. Continuous automation requires PITR or a proven scheduled backup/restore system; the R2 logical backup layer does not replace PITR for broad production automation.

Automation operator integration: `docs/MEDIA_AUTOMATION_OPERATOR_RUNBOOK.md` defines how the future automation controller must consume this recovery gate before one-job, batch, or continuous-limited work. Missing or stale backups block automation, missing or stale restore drills block continuous-limited automation, and any future run must keep rollback scope exact to `batch_id` and output prefix. This integration is source/proof-only and deploys no worker, scheduler, queue processor, cron job, or playback switch.

Auto-detect backup gate integration: normal media automation discovery and planning can run read-only, but `run-auto` must stop when the latest backup is stale, the restore drill is stale, active unfinished jobs exist, unsafe CDN rows exist, emergency stop is active, or dry-run has not passed. Backup/restore freshness feeds the automatic batch-size policy; stale recovery state produces batch size `0`. This remains CLI-only and does not deploy cron, scheduler, daemon, queue processor, or production worker.

Autonomous operating model: `docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md` governs recovery operations. Scoped logical backups to private R2, checksum readback, disposable restore drills, backup freshness checks, retention planning, safe status reporting, and scoped rollback drills are Level 0/1 and should not wait for owner approval when they stay inside existing policy and print no secrets. Paid PITR/provider plan upgrades, destructive production restores, destructive production DB changes, public exposure changes, billing/provider mutations, auth/RLS changes, payout/cashout, legal/compliance, and public release boundaries remain Level 3/4. Emergency stop, rollback/quarantine, exact batch/prefix scope, no-secret output, and no public backup exposure remain mandatory.

## Scheduled Backup/Restore Policy

Status: manual runner implemented, first real manual backup complete, scheduler not deployed. `scripts/run-media-worker-logical-backup.mjs` can create scoped media-worker logical backup artifacts and upload them to private R2 only when explicitly run in write mode with `MEDIA_BACKUP_RUNNER_ENABLED=true`, `MEDIA_BACKUP_MODE=write`, `MEDIA_BACKUP_R2_BUCKET`, and `MEDIA_BACKUP_R2_PREFIX=backups/media-worker/`. `MEDIA_BACKUP_EXPORT_MODE=auto|pg_dump|js` controls export mode; `auto` uses `pg_dump`/`psql` only when both are present and otherwise uses the Node JS SELECT export, while `js` creates `schema.sql.gz` plus `data-media-worker.jsonl.gz` without requiring local `pg_dump` or `psql`. `MEDIA_BACKUP_DATABASE_SOURCE=linked` uses Supabase CLI linked read-only queries instead of requiring or printing `MEDIA_BACKUP_DATABASE_URL`; the URL source remains supported for environments that provide a safe database URL. Default mode is dry-run; missing credentials fail closed. Backups are CLI-controlled only; there is no GitHub Actions media-worker backup workflow and no cron schedule. No production queue processor, additional production media processing, or production playback switch is enabled. First real manual backup completed on 2026-07-09 under private prefix `backups/media-worker/2026/07/09/media-worker-logical-20260709T152048-8820af024114/` with row counts `media_transcode_jobs=1` and `media_renditions=2`, private R2 checksum readback, not exposed through the public playback bucket or media domain, and disposable PGlite restore proof.

CLI operation commands:

- Final handoff checklist: `docs/MEDIA_WORKER_CLI_OPERATING_CHECKLIST.md`. Use it before any future owner-approved one-job run. It keeps backups CLI-controlled, requires backup verify/restore, requires one-job owner confirmation, keeps continuous automation blocked, and keeps signed-origin fallback available and blocks broad playback migration.
- `npm run backup:media-worker:preflight` checks the linked Supabase project identity, scoped production row counts, private R2 target, no public playback bucket target, no `media.chillywoodstream.com` target, no media-worker GitHub Actions workflow, no cron/scheduler, no running worker, and unchanged production playback status.
- `npm run backup:media-worker:status` prints the latest backup prefix, scoped row counts, worker-running state, and gate state without secrets.
- `npm run backup:media-worker:verify-latest` reads the latest private R2 artifacts for `backups/media-worker/2026/07/09/media-worker-logical-20260709T152048-8820af024114/`, verifies SHA-256 checksums, parses the manifest, confirms not exposed through the public playback bucket or media domain, and prints the restore-drill command to run next.
- `npm run backup:media-worker:restore-drill` restores the latest backup into disposable PGlite, verifies row counts match the manifest, runs resolver-safe selection, injects an unsafe row, and confirms unsafe rows stay excluded.
- `npm run backup:media-worker:dry-run` remains the no-upload planning path.
- `npm run backup:media-worker:run` remains manual write/upload mode only; it does not run a worker or write media worker DB rows.

## CLI-Only One-Job Worker Operations

Status: `scripts/media-transcode-worker-cli.mjs` provides CLI-only one-job worker operation commands for future controlled proofs. This task added command infrastructure and proof coverage only; it did not process another production media job, deploy a worker service, add cron, add a scheduler, write production rows, or switch playback.

Commands:

- `npm run media-worker:preflight` verifies the latest private R2 backup gate, restore-drill availability, linked project identity, source allowlist requirement, `max_jobs_per_run=1`, backfill disabled, no active unfinished jobs, public/private bucket safety, and unchanged playback.
- `npm run media-worker:dry-run -- --source-id=<allowlisted-source>` builds a one-job lease plan, expected job/rendition rows, expected output prefix, audit batch, and rollback plan without DB writes or uploads.
- `npm run media-worker:status` reads scoped row counts and reports disabled worker state without secrets.
- `npm run media-worker:run-one` fails closed unless a future approved run supplies the explicit source id, allowlist, closed backup gate, one-job max, backfill disabled, and `MEDIA_WORKER_RUN_ONE_CONFIRM=I_UNDERSTAND_ONE_JOB`. The current implementation remains infrastructure-only and does not write production rows in this task.
- `npm run media-worker:audit` requires `source_id` plus `batch_id` and audits only that scoped batch/source.
- `npm run media-worker:verify-output` requires an exact `playback/public/worker-proof/chillywood-city-lights/<batch>/` output prefix and denies broad or forbidden paths.
- `npm run media-worker:rollback-plan` requires source, batch, and exact output prefix, then creates a plan-only rollback scoped to those values. Broad prefixes, private paths, Premium paths, and original/master paths are denied.

`npm run proof:media-transcode-worker-cli` proves the command surface remains safe by default: run-one is denied by default, source and allowlist are required, `max_jobs > 1` and backfill are denied, stale backup gate is denied, dry-run does no writes, run-one requires explicit confirmation, audit requires exact scope, rollback is exact-prefix only, broad/private paths are denied, production playback is not switched, and no secrets are printed.

Scheduled media-worker logical backups are the lower-cost recovery layer for future limited automation if the owner accepts the risk. They are not true PostgreSQL PITR and do not store Supabase WAL.

Policy:

- Scope: `media_transcode_jobs`, `media_renditions`, and supporting schema/migration metadata needed for disposable restore proof.
- Frequency: create a fresh scoped logical backup before every worker run; if limited automation is later approved, also run a scheduled daily scoped backup.
- Freshness: limited automation requires a verified backup less than 24 hours old; one-job proof or backfill-like runs require a verified backup less than 1 hour old.
- Restore drill: at least one successful restore drill is required after schema changes; recurring restore drill freshness is required before limited automation can be treated as closed.
- Storage: private R2 bucket only, under `backups/media-worker/YYYY/MM/DD/<backup_id>/`.
- Public surfaces: backup artifacts must never be stored in `chillywood-media-public-playback-proof` and must never be served through `media.chillywoodstream.com`.
- Retention: keep the latest daily backups, keep the latest restore-drill-passed backup, and make older private backups cleanup candidates only after the retention window.
- Continuous automation: remains blocked unless scheduled private R2 backup freshness and restore-drill freshness are passing; broad backfill still requires explicit owner approval and PITR or an owner-accepted scheduled restore system.

Proof:

- `npm run proof:media-scheduled-backup-gate` proves missing backups block automation, stale backups block automation, fresh backups without restore drills block automation, fresh private backup plus fresh restore drill closes the limited-automation backup gate, one-job owner override requires a fresh manual backup, public bucket backup targets are denied, secret-like artifacts are denied, retention keeps the latest restore-drill-passed backup, and broad backfill remains denied without explicit owner approval.
- `npm run proof:media-worker-backup-runner` proves the real runner dry-runs without production credentials, fails closed when write-mode env is missing, supports linked-source JS export without requiring a raw DB URL, denies `chillywood-media-public-playback-proof`, denies `media.chillywoodstream.com`, validates manifest/checksum generation, proves JS export mode emits `data-media-worker.jsonl.gz` with `pgDumpRequired=false`, restores a JSONL fixture backup into disposable PGlite, and proves a resolver-safe query over restored media-worker data. It does not require production DB access to pass.
- `npm run backup:media-worker:status`, `npm run backup:media-worker:verify-latest`, and `npm run backup:media-worker:restore-drill` were run against the latest private R2 backup prefix and passed. `verify-latest` confirmed matching checksums and `media.chillywoodstream.com` returned `404`; `restore-drill` restored `media_transcode_jobs=1` and `media_renditions=2` into disposable PGlite.
- The scheduled-gate proof is dry-run/source-only. The runner can create a real scoped backup only when manually invoked with required private env; no scheduler or cron is deployed. It does not write production rows, run a worker, or switch playback.
- This is logical backup/restore proof, not true PITR.

## Completed One-Job Recovery Proof

- Source: Chi'llywood City Lights, creator video `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`.
- Job id: `0341d2d1-c02c-4719-91c5-bea9809f4739`.
- Output prefix: `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`.
- Backup used: `backups/media-worker/2026/07/09/media-worker-logical-20260709-one-job-readiness-b81c7b1423c6/`.
- Auditor result: passed for exact source, exact row count, public-safe HLS paths, clean/allowed state, non-original rows, no private/Premium paths, and no unexpected ready rows before audit.
- Rollback result: not executed because audit passed, but a scoped rollback plan was proved for only this job/batch and output prefix; broad, missing, private, Premium, and original/master rollback targets were denied.
- Final row counts: `media_transcode_jobs=1`, `media_renditions=2`, all for the allowlisted City Lights source.
- Production playback must retain signed-origin fallback; CDN/HLS scope is controlled by audited-row rollout config only.

## Proofs

- `npm run proof:media-transcode-operator-control`
- `npm run proof:media-transcode-worker-auditor`
- `npm run proof:media-recovery-operator`
- `npm run proof:media-transcode-worker-safety`
- `npm run proof:media-recovery-backup-restore`
- `npm run proof:media-worker-rollback-drill`

Operator/auditor proofs are local/source-only. The backup/restore proof uses authorized Wrangler access to the private R2 backup prefix only. All proofs print redacted summaries only.
