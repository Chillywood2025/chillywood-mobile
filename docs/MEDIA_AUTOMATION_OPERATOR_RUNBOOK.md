# Media Automation Operator Runbook

Last updated: 2026-07-09

Status: source/proofed automation architecture only. No daemon, cron, scheduler, GitHub Actions schedule, deployed production worker, broad backfill, queue processor, or continuous worker is live. Production playback remains controlled by audited public `media_renditions` eligibility, kill switch, rollout mode, and signed-origin fallback.

## Purpose

The automation operator is the scale path for many public-safe creator videos after scan, moderation, backup, transcode, upload, audit, telemetry, and rollback gates pass. City Lights remains the canary proof, not the final hardcoded model.

## Modes

- `off`: default. Discovery/status can run, but no jobs are planned, written, or processed.
- `dry_run`: reads fixture or catalog state and builds plans only. It writes nothing and uploads nothing.
- `one_job`: processes exactly one explicitly allowlisted source after a fresh backup gate and owner approval.
- `batch`: processes a capped batch only after owner approval, backup gate closure, rollback scope, and audit rules.
- `continuous_limited`: future mode only. It requires scheduled private R2 backup, fresh restore drill, owner approval, max concurrency, max jobs per run, retry cap, dead-letter/quarantine, telemetry, rollback, and audit pass before resolver trust.
- `continuous_full_blocked`: blocked until a separate owner-approved production readiness lane, PITR or equivalent scheduled restore system, and explicit deployment proof.

Emergency stop overrides every mode. The playback kill switch keeps fallback available even if worker automation is healthy.

## Source Components

- `_lib/mediaAutomationController.ts`: automation mode and gate decisions.
- `_lib/mediaAutomationDiscovery.ts`: public-safe candidate classification and batch selection.
- `_lib/mediaAutomationJobs.ts`: dry-run job plans, output prefixes, and rollback scopes.
- `_lib/mediaAutomationWorkerLoop.ts`: lease, batch, audit, quarantine, and stop-reason model.
- `scripts/media-automation-cli.mjs`: CLI-only status, discovery, batch planning, dry-run, run-gate, audit, rollback, pause, and emergency-stop commands.

## CLI Commands

```sh
npm run media-automation:status
npm run media-automation:discover
npm run media-automation:plan-batch
npm run media-automation:dry-run-batch
npm run media-automation:run-batch
npm run media-automation:audit-batch
npm run media-automation:rollback-plan
npm run media-automation:pause
npm run media-automation:emergency-stop
```

`media-automation:run-batch` is intentionally fail-closed unless a future owner-approved run provides `MEDIA_AUTOMATION_RUN_CONFIRM=I_UNDERSTAND_BATCH_AUTOMATION`. This task does not enable run execution.

## Backup Gate

Automation must verify the private R2 logical backup gate before any future write:

- backup target: `chillywood-media-proof`
- prefix: `backups/media-worker/`
- public playback bucket denied
- `media.chillywoodstream.com` denied for backups
- one-job freshness target: less than 1 hour
- batch freshness target: less than 24 hours or stricter
- continuous freshness target: scheduled backup plus recurring restore drill

R2 logical backups are not true PITR. They are scoped application-level backup artifacts for media-worker tables.

## Discovery Policy

Candidates are classified as:

- `eligible_public_safe`
- `already_has_audited_hls`
- `needs_transcode`
- `private_blocked`
- `premium_blocked`
- `original_only_blocked`
- `unscanned_blocked`
- `moderation_blocked`
- `missing_source_blocked`
- `unsupported_format_blocked`
- `denied_source_blocked`

Only public-safe videos can become worker candidates. Existing audited HLS rows are skipped unless a future owner-approved forced reprocess explicitly allows it. Private, Premium, original/master-only, unscanned, moderation-blocked, missing-source, unsupported, and denied-source rows are excluded.

## Job Policy

Job planning is dry-run by default. Future write mode requires owner approval, a closed backup gate, capped batch size, source allowlist or batch list, no duplicate active job for the same source, and an exact rollback scope.

Public output prefix:

```text
playback/public/auto/<source_type>/<source_id>/<batch_id>/
```

The worker must not upload originals/master files to the public bucket. Manifests must not contain signed/private origin URLs. Segments are immutable; manifests use short cache metadata. Narrow cache rules may be added only for exact `.ts` prefixes after proof.

## Audit And Resolver Trust

Rows start as pending audit. The resolver ignores pending, failed, and quarantined rows. Audit checks exact batch/source/count, expected rendition labels, output prefix, public visibility, clean/approved scan, allowed/approved moderation, non-original status, private/Premium rows blocked from public CDN, and no unexpected ready rows.

Audit pass is required before resolver trust. Audit failure quarantines the batch, pauses automation, and revokes resolver trust for the scoped batch.

## Telemetry

Automation telemetry is source/proof-only unless a future backend write lane implements it. Required event shapes include:

- `candidate_discovered`
- `job_planned`
- `job_claimed`
- `transcode_started`
- `transcode_completed`
- `output_uploaded`
- `audit_passed`
- `audit_failed`
- `resolver_eligible`
- `playback_started`
- `playback_fallback`
- `rollback_planned`
- `rollback_executed`

Events must include rollout mode, automation mode, source type/id, delivery provider, delivery format, rendition label, fallback status, estimated bytes, cache status if available, and no private URLs or secrets.

## Rollback

Rollback plans target only the exact `batch_id` and exact R2 output prefix. Broad prefixes, missing batch ids, private paths, Premium paths, and original/master paths are denied. Rollback must not switch production playback globally.

## Deployment Options

Allowed now:

- CLI-only status/discovery/planning/proof.

Future options requiring separate owner approval:

- systemd timer
- container worker
- cron or scheduler
- GitHub Actions schedule

Continuous automation remains blocked from this runbook until owner approval, scheduled backup/restore proof, telemetry, rollback, audit, and deployment proof all close.

## Proofs

```sh
npm run proof:media-automation-controller
npm run proof:media-automation-discovery
npm run proof:media-automation-batch-planner
npm run proof:media-automation-worker-loop
```

These proofs cover fail-closed defaults, emergency stop, dry-run no writes, continuous-mode denial with the backup gate open, public-safe inclusion, unsafe exclusion, audited-HLS skip, batch cap, owner confirmation, audit pass/quarantine, scoped rollback, resolver ignoring pending/quarantined rows, no secret output, and no production playback switch.
