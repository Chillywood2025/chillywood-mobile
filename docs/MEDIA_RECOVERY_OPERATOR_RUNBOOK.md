# Media Recovery Operator Runbook

Status: operator/auditor source/proof-only, with a private R2 logical backup proof artifact. The recovery operator/auditor model is local code plus proof scripts. It does not deploy a production worker, does not run a production queue processor, does not write production `media_transcode_jobs` or `media_renditions` rows, and does not switch playback.

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

Latest private R2 backup artifact prefix:

- `backups/media-worker/2026/07/09/media-worker-logical-20260709-one-job-readiness-0712c0fbc441/`

Backup scope:

- Included: `media_transcode_jobs`, `media_renditions`.
- Included data: production read-only row counts were `media_transcode_jobs=0` and `media_renditions=0`, so the scoped data artifact is intentionally empty.
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

One-job gate: verified R2 logical backup plus restore and rollback drills closes the backup gate for a future one-job proof only when the owner accepts the risk and operator one-job constraints remain active.

Continuous gate: still blocked. Continuous automation requires PITR or a proven scheduled backup/restore system; the R2 logical backup layer does not replace PITR for broad production automation.

## Proofs

- `npm run proof:media-transcode-operator-control`
- `npm run proof:media-transcode-worker-auditor`
- `npm run proof:media-recovery-operator`
- `npm run proof:media-transcode-worker-safety`
- `npm run proof:media-recovery-backup-restore`
- `npm run proof:media-worker-rollback-drill`

Operator/auditor proofs are local/source-only. The backup/restore proof uses authorized Wrangler access to the private R2 backup prefix only. All proofs print redacted summaries only.
