# Media Automation Operator Runbook

Last updated: 2026-07-09

Status: CLI auto-detect bounded execution is live for safe Level 0/1 candidates, while daemon/cron/scheduler/continuous automation remains off. No daemon, cron, scheduler, GitHub Actions schedule, deployed production worker, broad backfill, queue processor, or continuous worker is live. Production playback remains controlled by audited public `media_renditions` eligibility, kill switch, rollout mode, and signed-origin fallback.

Object-storage migration note: Hetzner Object Storage -> R2 private origin is Partial. Private bucket `chillywood-media-origin` exists and trusted copier `media-object-storage-migration` is deployed, but production still has `31` Hetzner/S3 object-storage reference rows and `22` distinct object refs. Copy stopped before mutation because backend R2 private-origin write config is missing. No media was processed, no media rows were written, no objects were copied, and Hetzner fallback retained. Automation must not treat Hetzner Object Storage as removable until `0 Hetzner object-storage` refs, copy/readback/checksum proof, DB metadata migration, new-upload R2 proof, and scanner/transcode R2 read proof close. This does not cover Hetzner LiveKit; do not shut down Hetzner LiveKit.

continuous limited automation is source/proofed/templates only. The new queue processor, backfill policy, systemd service template, systemd timer template, `run-continuous-once` CLI surface, and report command do not start a daemon, cron, scheduler, queue processor, or media worker. They exist to prove the safe operating model before any future activation.

Safe Level 0/1 media operations should not require owner approval when they stay inside policy: eligible discovery, safe batch sizing, scoped logical backups, restore drills, public-safe media work inside caps, post-write audit, scoped rollback/quarantine, fallback playback, telemetry reporting, cache verification, and auto-pause reporting. Owner approval remains required for money/billing/provider changes, auth/RLS, Premium entitlement, payout/cashout, destructive production DB changes, broad uncapped backfill, public/private exposure policy changes, private/Premium CDN token policy, app-store/public launch, legal/compliance, payment production mutation, and public marketing claims.

## Purpose

The automation operator is the scale path for many public-safe creator videos after scan, moderation, backup, transcode, upload, audit, telemetry, and rollback gates pass. City Lights remains the canary proof, not the final hardcoded model.

Normal CLI operation is auto-detect: the owner does not manually pick every source id and does not manually choose the batch size. The CLI discovers eligible public-safe candidates, calculates a safe adaptive batch size from backup/restore freshness plus recent success/failure state, plans exact job and rollback scopes, and can execute one bounded batch only after confirmation and every safety gate passes.

Rendition selection is source-aware. Automation planning uses `_lib/mediaRenditionLadder.ts` instead of a fixed 360p/480p list: 480p sources plan 360p/480p, 720p sources can add 720p, and 1080p sources can add 720p/1080p. Premium HD is planned as Premium-only and remains blocked from the current public R2/HLS execution path until signed/token Premium CDN delivery is implemented and proved.

## Modes

- `off`: default. Discovery/status can run, but no jobs are planned, written, or processed.
- `dry_run`: reads fixture or catalog state and builds plans only. It writes nothing and uploads nothing.
- `auto_detect`: discovers eligible candidates and builds an adaptive plan only. It writes nothing and uploads nothing.
- `auto_detect_run`: CLI run path for one automatically planned safe batch only. It requires explicit confirmation, fresh backup/restore gate, no active unfinished jobs, no unsafe CDN rows, dry-run pass, calculated positive batch size, scoped rollback plan, and emergency stop off.
- `one_job`: processes exactly one explicitly allowlisted source after a fresh backup gate and owner approval.
- `batch`: processes a capped batch only after owner approval, backup gate closure, rollback scope, and audit rules.
- `continuous_limited`: future mode only. It requires scheduled private R2 backup, fresh restore drill, owner approval, max concurrency, max jobs per run, retry cap, dead-letter/quarantine, telemetry, rollback, and audit pass before resolver trust.
- `continuous_paused`: automation may report status and plans, but it cannot run worker jobs until a clean audit/rollback review resumes it.
- `continuous_full_blocked`: blocked until a separate owner-approved production readiness lane, PITR or equivalent scheduled restore system, and explicit deployment proof.

Emergency stop overrides every mode. The playback kill switch keeps fallback available even if worker automation is healthy.

## Source Components

- `_lib/mediaAutomationController.ts`: automation mode and gate decisions.
- `_lib/chillywoodAutonomyPolicy.ts`: Level 0-4 autonomy classification and owner-approval boundaries.
- `_lib/mediaAutomationDiscovery.ts`: public-safe candidate classification and batch selection.
- `_lib/mediaAutomationBatchPolicy.ts`: adaptive batch-size and risk policy.
- `_lib/mediaAutomationBackfillPolicy.ts`: capped backfill policy, broad-backfill owner-approval boundary, and unsafe-media blocks.
- `_lib/mediaAutomationJobs.ts`: dry-run job plans, output prefixes, and rollback scopes.
- `_lib/mediaAutomationWorkerLoop.ts`: lease, batch, audit, quarantine, and stop-reason model.
- `_lib/mediaAutomationQueueProcessor.ts`: source/proof-only queue item claim/process/fail/quarantine model.
- `scripts/media-automation-cli.mjs`: CLI-only status, discovery, batch planning, dry-run, run-gate, audit, rollback, pause, and emergency-stop commands.
- `ops/media-automation/systemd/media-automation-worker.service`: disabled future service template only.
- `ops/media-automation/systemd/media-automation-worker.timer`: disabled future timer template only.

## CLI Commands

```sh
npm run media-automation:status
npm run media-automation:discover
npm run media-automation:plan-auto
npm run media-automation:dry-run-auto
npm run media-automation:run-auto
npm run media-automation:plan-batch
npm run media-automation:dry-run-batch
npm run media-automation:run-batch
npm run media-automation:run-continuous-once
npm run media-automation:audit
npm run media-automation:audit-batch
npm run media-automation:rollback-plan
npm run media-automation:pause
npm run media-automation:emergency-stop
npm run media-automation:report
```

`media-automation:plan-auto` and `media-automation:dry-run-auto` require no manual source id and no manual batch-size input for normal operation. `media-automation:run-auto` is intentionally fail-closed unless a confirmed run provides `MEDIA_AUTOMATION_RUN_CONFIRM=I_UNDERSTAND_AUTO_DETECT_BATCH` and every backup, restore, active-job, unsafe-row, dry-run, audit, rollback, and emergency-stop gate passes. Legacy `plan-batch` / `dry-run-batch` / `run-batch` aliases remain for compatibility and still recognize `MEDIA_AUTOMATION_RUN_CONFIRM=I_UNDERSTAND_BATCH_AUTOMATION`; they still do not deploy a worker or scheduler. The first bounded production run-auto cycle processed four supported public-safe candidates, recorded one unsupported 320x180 failed-job marker, and stopped with no eligible work remaining.

`media-automation:run-continuous-once` is a bounded future continuous-limited loop command, not a daemon. In this source/proof build it still fails closed without `MEDIA_AUTOMATION_CONTINUOUS_ONCE_CONFIRM=I_UNDERSTAND_ONE_CONTINUOUS_LIMITED_CYCLE`, and even after confirmation it may not process media until backup, restore drill, audit, rollback, telemetry, kill-switch, output validation, and unsafe-row gates pass in a future activation lane. Broad backfill requires `MEDIA_AUTOMATION_BROAD_BACKFILL_CONFIRM=I_UNDERSTAND_BROAD_BACKFILL_RISK` plus Level 3 owner approval.

`media-automation:report` is read-only. It reports candidate counts, calculated batch size, risk level, reason codes, selected count, and rollback scopes without writing rows or uploading media.

Normal npm operator commands use `--source=linked` for production read-only discovery through the linked Supabase CLI. Proof scripts keep fixture mode available for deterministic source proofs. The linked source path reads only safe aggregate/classification fields and redacted eligible candidate metadata; it does not print playback URLs, signed URLs, DB URLs, service-role keys, or private excluded-row details.

Historical pre-scan read-only linked run on 2026-07-09:

- `totalCandidatesScanned=27`
- `eligible_needs_transcode=0`
- `eligible_already_has_audited_hls=1` (`Chi'llywood City Lights`)
- `excluded_private=12`
- `excluded_premium=9`
- `excluded_original_master=0`
- `excluded_unscanned=5`
- `excluded_moderation_blocked=0`
- `excluded_missing_source=0`
- `excluded_unsupported_format=0`
- `excluded_already_active_job=0`
- `excluded_denied_source=0`
- `excluded_already_processed=0`
- `plan-auto` / `dry-run-auto`: `calculatedBatchSize=0`, `riskLevel=blocked`, reason `no_eligible_candidates`, selected candidates `0`, rollback scopes `0`

`run-auto` was not executed. No media was processed or uploaded, no production rows were written, and playback scope did not change.

That Pass-No-op state is superseded by the trusted scanner gateway plus bounded auto-transcode proof. Post-scan auto-discovery initially found `eligible_needs_transcode=5`; `media-automation:run-auto` processed four supported safe candidates one at a time under the first-run cap of `1`, uploaded HLS to `playback/public/auto/`, wrote/audited/promoted service-owned rows, and verified public HLS fetch/decode. Final auto-discovery finds `eligible_needs_transcode=0`, `eligible_already_has_audited_hls=5`, `excluded_private=12`, `excluded_premium=9`, `excluded_unsupported_format=1`, and zero unscanned, original/master, moderation-blocked, missing-source, active-job, denied, or already-processed rows. No daemon, cron, scheduler, queue processor, broad backfill, or playback fallback removal is live.

## Catalog Readiness

Catalog readiness bridges the no-op discovery state to future safe transcode candidates. It is read-only and plan-only:

```sh
npm run media-catalog:status
npm run media-catalog:readiness-plan
npm run media-catalog:scan-plan
```

`_lib/mediaCatalogReadiness.ts` and `scripts/media-catalog-readiness-cli.mjs` classify rows as `ready_for_transcode`, `already_audited_hls`, `needs_scan`, `needs_moderation_review`, `private_excluded`, `premium_excluded`, `original_master_excluded`, `missing_source`, `unsupported_format`, `blocked_moderation`, or `denied_source`. After the trusted scanner and bounded transcode cycle, linked readback scanned `27` rows and found `ready_for_transcode=0`, `already_audited_hls=5`, `needs_scan=0`, `private_excluded=12`, `premium_excluded=9`, `unsupported_format=1`, and zero moderation-review, original/master, missing-source, blocked, or denied rows.

The five former `needs_scan` rows are now ready for transcode under the existing scan/moderation gates. The catalog readiness CLI still does not execute scans, mark media clean, write production rows, process/transcode media, or switch playback. Unscanned or manual-review media may become transcode candidates only after trusted scanner proof and moderation-safe readback. Private and Premium media remain excluded from the public transcode path.

Scan automation status: `_lib/mediaScanAutomation.ts`, `scripts/media-scan-cli.mjs`, `supabase/functions/media-scan-private-access`, `npm run proof:media-scan-private-access`, `npm run proof:media-scan-automation`, and `npm run proof:media-scan-auto-cycle` now close the public scan-candidate readiness step. The CLI supports `media-scan:status`, `media-scan:plan`, `media-scan:dry-run`, `media-scan:run-one`, `media-scan:run-auto`, and `media-scan:audit`. It uses linked catalog queries by default, redacts private/Premium excluded rows, and never transcodes or switches playback. The implemented scanner proof is ffprobe media-readability only; it must not be described as malware scanning or moderation. The backend gateway uses a narrow scanner operator token with only `MEDIA_SCAN_OPERATOR_TOKEN_SHA256` stored server-side, streams S3/Hetzner and Supabase Storage source bytes through backend authority, never returns signed URLs, and writes clean/failed scan results only with scanner name/version plus ffprobe proof. The first production scan batch scanned five public candidates, skipped `12` private and `9` Premium rows, and promoted those five rows to `ready_for_transcode` under existing scan/moderation gates.

First post-scan auto-transcode cycle: `media-automation:discover` found `eligible_needs_transcode=5` and `eligible_already_has_audited_hls=1`; `media-automation:plan-auto` calculated a safe first batch size of `1`; `media-automation:dry-run-auto` built a no-write plan. Confirmed `media-automation:run-auto` processed four supported safe candidates, audited/promoted two HLS renditions per source, and stopped when discovery returned `eligible_needs_transcode=0`. One 320x180 source is classified `excluded_unsupported_format` for the current minimum HLS ladder. No daemon, cron, scheduler, queue processor, broad backfill, private/Premium processing, or fallback removal is live.

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

- `eligible_needs_transcode`
- `eligible_already_has_audited_hls`
- `excluded_private`
- `excluded_premium`
- `excluded_original_master`
- `excluded_unscanned`
- `excluded_moderation_blocked`
- `excluded_missing_source`
- `excluded_unsupported_format`
- `excluded_already_active_job`
- `excluded_denied_source`
- `excluded_already_processed`

Only public-safe videos can become worker candidates. Existing audited HLS rows are skipped unless a future approved forced reprocess explicitly allows it. Private, Premium, original/master-only, unscanned, moderation-blocked, missing-source, unsupported, active-job, already-processed, and denied-source rows are excluded.

## Auto Batch-Size Policy

The owner should not have to manually choose a normal batch size. `_lib/mediaAutomationBatchPolicy.ts` calculates the batch size from eligible count, latest backup age, restore-drill age, previous success streak, previous failures, active unfinished jobs, unsafe CDN rows, and hard caps.

Default policy:

- first auto run: max `1`
- after one clean run: max `5`
- after repeated clean runs: max `10`, then `25`
- any failure drops the next cap back to `1`
- active unfinished jobs force batch size `0`
- unsafe CDN rows force batch size `0`
- stale backup forces batch size `0`
- stale restore drill forces batch size `0`
- hard max without a later owner-approved override is `25`
- backfill remains disabled
- high error rate blocks or reduces automation
- CPU/disk pressure reduces the cap or blocks when unsafe

## Queue Processor Model

`_lib/mediaAutomationQueueProcessor.ts` is source/proof-only. It discovers queue work only from eligible public-safe candidates, requires the automation controller to allow a bounded run, requires a lease, requires backup gate and kill switch, enforces max concurrency and max jobs per run, enforces retry cap, dead-letters retry-cap failures, quarantines audit failures, pauses automation on failure, and never grants resolver trust before audit pass.

The queue processor is not live. No daemon, cron, scheduler, or queue loop is running.

## Backfill Policy

Broad backfill is disabled by default. Small capped backfill of public-safe eligible media can be Level 1/2 autonomous only after proofs, backup/restore gate, telemetry, audit, rollback, emergency stop, and hard batch caps pass. Broad uncapped backfill, cap increases above the hard limit, destructive cleanup, or any public/private exposure-policy change remains Level 3 and requires owner approval.

Private, Premium, original/master, unscanned, moderation-blocked, unsupported, missing-source, active-job, denied, and already-audited HLS rows are not eligible for public transcode backfill.

## Disabled Scheduler Templates

The only scheduler artifacts are disabled templates:

```text
ops/media-automation/systemd/media-automation-worker.service
ops/media-automation/systemd/media-automation-worker.timer
```

They document future `continuous_limited` operation with `MEDIA_AUTOMATION_REQUIRE_BACKUP_GATE=true`, `MEDIA_AUTOMATION_DISABLE_BACKFILL=true`, `MEDIA_AUTOMATION_MAX_BATCH_SIZE`, `MEDIA_AUTOMATION_MAX_CONCURRENCY`, safe logging, dry-run mode, and emergency stop. They are not installed, enabled, started, or scheduled by this repo.

## Job Policy

Job planning is dry-run by default. Auto-detected plans select only candidates from discovery, enforce the calculated batch cap, require no manual source picking, assign every job an exact output prefix, require audit, and build exact rollback scope. Future write mode requires the closed backup/restore gate, no duplicate active job for the same source, no unsafe categories in the selected batch, and explicit run confirmation.

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
- `auto_discovery_started`
- `candidate_classified`
- `batch_planned`
- `batch_dry_run_passed`
- `batch_started`
- `job_planned`
- `job_claimed`
- `job_transcode_started`
- `transcode_started`
- `job_transcode_completed`
- `transcode_completed`
- `output_uploaded`
- `audit_passed`
- `audit_failed`
- `resolver_eligible`
- `playback_started`
- `playback_cdn_selected`
- `playback_fallback`
- `playback_fallback_used`
- `rollback_planned`
- `rollback_executed`

Events must include rollout mode, automation mode, batch size, source type/id, delivery provider, delivery format, rendition label, fallback status, estimated bytes, cache status if available, and no private URLs or secrets.

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
npm run proof:media-automation-batch-policy
npm run proof:media-automation-backfill-policy
npm run proof:media-automation-queue-processor
npm run proof:media-automation-scheduler-templates
npm run proof:media-automation-cli
npm run proof:media-automation-batch-planner
npm run proof:media-automation-worker-loop
```

These proofs cover fail-closed defaults, emergency stop, dry-run no writes, auto-detect candidate discovery, adaptive batch sizing, continuous-mode denial with the backup gate open, public-safe inclusion, unsafe exclusion, audited-HLS skip, active-job and unsafe-row blocks, stale backup/restore blocks, confirmation for `run-auto`, audit pass/quarantine, scoped rollback, resolver ignoring pending/quarantined rows, no secret output, and no production playback switch.
