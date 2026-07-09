# Media Worker CLI Operating Checklist

Last updated: 2026-07-09

Status: final CLI-only operating checklist for the media-worker lane. The production worker is not deployed, no daemon or queue processor is running, no cron or scheduler is configured, and continuous automation remains blocked. Creator-video playback has a guarded audited `media_renditions` CDN/HLS bridge, but signed-origin fallback remains mandatory and any CDN rollout must be controlled by explicit rollout config, kill switch, backup gate, and row-level trust gates.

This checklist is the handoff point for future owner-approved one-job media-worker operations. Do not use it to run broad backfills, enable continuous mode, migrate normal playback, or expose private/original/Premium media.

## Current Safe Baseline

- Latest manual private R2 backup prefix: `backups/media-worker/2026/07/09/media-worker-logical-20260709T152048-8820af024114/`.
- Existing production proof rows: `media_transcode_jobs=1` and `media_renditions=2`, scoped only to City Lights source `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`.
- Completed one-job proof output prefix: `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`.
- City Lights is the CDN/HLS canary, not the long-term hardcoded path. Playback expansion uses trusted audited `media_renditions` eligibility through `MEDIA_PLAYBACK_CDN_ROLLOUT_MODE=canary`, `batch`, or `trusted_public` after explicit owner approval and proof.
- Default source behavior remains signed-origin fallback because `MEDIA_PLAYBACK_CDN_ENABLED=false` and the kill switch stays fail-closed unless an approved rollout changes it. If an approved OTA enables CDN/HLS, fallback still remains available and private/original/Premium rows remain blocked.
- Before any batch expansion, run `npm run media-cdn:status` and `npm run media-cdn:plan -- --max-batch-size <n>` or the equivalent proof fixture, confirm denied/private/Premium/original/pending/blocked/wrong-prefix rows are excluded, and confirm the rollback plan is exact-source/exact-prefix scoped.
- Continuous automation remains blocked.
- Backups are stored only in private R2 under `backups/media-worker/`.
- Backup artifacts must never go to `chillywood-media-public-playback-proof` or `media.chillywoodstream.com`.
- R2 logical backup/restore is application-level recovery only. It is not PITR and does not replace PITR for continuous production.

## Before Any One-Job Run

Run:

```sh
npm run backup:media-worker:preflight
npm run backup:media-worker:status
npm run backup:media-worker:verify-latest
npm run backup:media-worker:restore-drill
```

Confirm:

- The latest backup prefix is present and private.
- Private R2 readback/checksum verification passed.
- Disposable restore drill passed.
- The worker is not deployed or daemonized.
- No queue processor is running.
- No cron, scheduler, or GitHub Actions backup schedule exists.
- Production playback scope is controlled by the audited-rendition rollout config and must retain signed-origin fallback.
- Existing scoped row counts are understood before any new write.

## Worker Dry-Run

Run:

```sh
npm run media-worker:preflight
npm run media-worker:status
npm run media-worker:dry-run -- --source-id <id>
```

Confirm:

- The source id is explicitly owner-approved and allowlisted.
- `max_jobs_per_run=1`.
- Backfill is disabled.
- The output prefix is exact and under `playback/public/worker-proof/`.
- The dry-run builds an audit batch and rollback plan.
- The dry-run writes no DB rows and uploads no media.

## Run-One

Run-one is allowed only with explicit owner approval for exactly one source.

Required:

```sh
MEDIA_WORKER_RUN_ONE_CONFIRM=I_UNDERSTAND_ONE_JOB npm run media-worker:run-one -- --source-id <id>
```

Rules:

- Run only one allowlisted source.
- Do not run broad backfill.
- Do not process private, original/master, Premium, unscanned, or moderation-blocked media.
- Do not switch production playback.
- The worker lane must auto-disable after success or failure.
- Audit pass is required before resolver trust.
- Audit failure must quarantine the batch and keep resolver trust off.

## After Run

Run:

```sh
npm run media-worker:audit -- --batch-id <batch> --source-id <id>
npm run media-worker:verify-output -- --batch-id <batch> --source-id <id> --output-prefix <exact-playback-public-worker-proof-prefix>
npm run media-worker:rollback-plan -- --batch-id <batch> --source-id <id> --output-prefix <exact-playback-public-worker-proof-prefix>
```

Confirm:

- Audit is scoped to the exact `batch_id` and source id.
- Output verification is scoped to the exact HLS prefix.
- Rollback plan targets only the exact `batch_id` and output prefix.
- Any future CDN playback eligibility is based on audited trusted rendition rows, not client input or a permanent single-video allowlist.
- Row counts match the expected one-job delta.
- Active unfinished jobs remain `0`.
- Other-source renditions remain `0`.
- Unsafe CDN rows remain `0`.
- Production playback must retain signed-origin fallback; CDN/HLS scope is controlled by audited-row rollout config only.

## Emergency

If any gate, output check, audit, or resolver proof fails:

- Do not run more jobs.
- Keep production playback on signed-origin fallback.
- Use `npm run media-worker:rollback-plan -- --batch-id <batch> --source-id <id> --output-prefix <exact-prefix>`.
- Quarantine the batch.
- Disable the worker lane.
- Do not delete broad prefixes.
- Do not touch private/original/Premium media.
- Do not claim continuous automation is safe.

## Forbidden Without Separate Approval

- Deploying a production worker service.
- Running a continuous queue processor.
- Adding cron, a scheduler, or a GitHub Actions schedule.
- Backfilling existing creator videos.
- Switching production playback to CDN/HLS globally.
- Using public CDN for private or Premium media without signed/token CDN access.
- Storing backups in the public playback bucket.
- Serving backups through `media.chillywoodstream.com`.
- Treating R2 logical backups as PostgreSQL PITR.

## Automation Operator Source/Proof

The scale automation operator is now available as source/proof infrastructure only:

```sh
npm run media-automation:status
npm run media-automation:discover
npm run media-automation:plan-batch
npm run media-automation:dry-run-batch
```

Do not run `media-automation:run-batch` without a future owner-approved batch lane and `MEDIA_AUTOMATION_RUN_CONFIRM=I_UNDERSTAND_BATCH_AUTOMATION`. The automation operator still has no daemon, cron, scheduler, queue processor, production media processing, broad backfill, or playback switch.
