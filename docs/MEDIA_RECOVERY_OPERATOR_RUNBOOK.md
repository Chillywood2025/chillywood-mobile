# Media Recovery Operator Runbook

Status: source/proof-only. The recovery operator/auditor model is local code plus proof scripts. It does not deploy a production worker, does not run a production queue processor, does not write production `media_transcode_jobs` or `media_renditions` rows, and does not switch playback.

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

## Proofs

- `npm run proof:media-transcode-operator-control`
- `npm run proof:media-transcode-worker-auditor`
- `npm run proof:media-recovery-operator`
- `npm run proof:media-transcode-worker-safety`

All proofs are local/source-only and print redacted summaries only.
