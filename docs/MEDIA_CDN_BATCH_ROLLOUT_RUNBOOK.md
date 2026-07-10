# Media CDN Batch Rollout Runbook

Last updated: 2026-07-09

Status: controlled rollout guide for audited public-safe Cloudflare R2/HLS playback. Controlled `trusted_public` activation was installed-proved for the City Lights audited production rows on EAS Update group `8e7a8c95-241d-4853-9bf3-ebfb063255e4` / Android update `019f483e-a504-7baa-80e1-dadf7a47cb0d`. This runbook does not deploy a worker, run backfill, enable cron, or switch private/original/Premium media to public CDN.

## Current Scope

- City Lights remains the canary source: `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`.
- Existing production media-worker rows: `media_transcode_jobs=10`, `media_renditions=15`.
- Current worker-proof HLS prefix: `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`.
- Latest private backup prefix: `backups/media-worker/2026/07/10/media-worker-logical-20260710T024048-5de12265dded/`.
- Continuous worker automation and broad backfill remain blocked.
- Active rollout scope: trusted audited public-safe rows only; currently production row counts are `media_transcode_jobs=10`, `media_renditions=15`, `unsafe_cdn_rows=0`, and `other_source_renditions=13`.
- Protected Premium HD scope: `5` audited Premium HD rows are stored under `playback/protected/premium/` and served only through `premium-media.chillywoodstream.com` with valid short-lived Premium tokens; `premium-media-proof.chillywoodstream.com` is historical only and is not an active fallback route. Unsigned public HD exposure is `0`; free users and missing/wrong tokens are denied by the Worker. Backend/app token issuance is deployed and OTA-published; installed free/non-Premium fallback and installed Premium HD playback are proved.
- First Batch 1 candidate plan: `docs/MEDIA_CDN_BATCH_1_CANDIDATE_PLAN.md` is historical. Current linked CLI readiness readback finds `27` creator-video rows, `5` already eligible audited public CDN/HLS sources, `0` ready-for-transcode rows, `0` scan candidates, `12` private/non-public rows, `9` Premium rows, and `1` unsupported 320x180 source. Batch 1 is empty until new public scan-clean/moderation-safe candidates arrive or a future low-resolution ladder is explicitly added.

## Rollout Modes

- `off`: all creator-video playback uses signed-origin fallback.
- `canary`: only explicitly allowed source ids can use CDN/HLS.
- `batch`: only explicitly allowed source ids can use CDN/HLS, with a required max-batch cap.
- `trusted_public`: any trusted audited public-safe `media_renditions` row can use CDN/HLS.

The kill switch overrides every mode. Denied source ids always fall back or block. Signed-origin fallback must remain available.

## Required Eligibility

A row may use public CDN/HLS only when all are true:

- `is_ready=true`
- service-role worker/trusted row path plus public-safe RLS visibility
- `is_public_playback_safe=true`
- `is_original=false`
- `visibility=public`
- `scan_status` is `clean` or `approved`
- `moderation_status` is `clean`, `approved`, or `allowed`
- `storage_provider=cloudflare_r2`
- `bucket_role=public_playback`
- `delivery_provider=cloudflare_r2_custom_domain`
- `delivery_format=hls`
- manifest and public playback paths start with `playback/public/`
- no forbidden private path segment appears
- backup gate is fresh/closed when required
- the source id is not denied

Premium/private rows require future signed/token CDN access and must not use the public custom-domain path while `MEDIA_CDN_SIGNING_MODE=off`.

## Preflight

Run before any rollout expansion:

```sh
npm run backup:media-worker:preflight
npm run backup:media-worker:verify-latest
npm run backup:media-worker:restore-drill
npm run media-worker:preflight
npm run media-worker:status
```

Confirm:

- backup gate is closed for the latest private R2 backup
- row counts are expected
- `unsafe_cdn_rows=0`
- no worker, queue processor, cron, or scheduler is running
- continuous automation remains blocked
- production playback fallback remains available

## Batch Planning

Plan only:

```sh
npm run media-cdn:status -- --max-batch-size <n>
npm run media-cdn:plan -- --max-batch-size <n>
npm run media-automation:discover
npm run media-automation:plan-auto
npm run media-automation:dry-run-auto
```

The planner must:

- count eligible audited public-safe rows
- exclude denied, private, Premium, original/master, pending/failed audit, unsafe scan/moderation, wrong bucket role, and wrong-prefix rows
- enforce the max-batch cap
- produce a rollback plan scoped to exact source ids and exact output prefixes
- perform no DB mutation
- switch no playback config by itself

The preferred media-worker expansion path is CLI auto-detect, not manual source picking. `media-automation:discover` classifies the catalog, `media-automation:plan-auto` calculates a safe adaptive batch size, and `media-automation:dry-run-auto` builds exact job and rollback scopes without writes/uploads. `media-automation:run-auto` remains fail-closed unless a future confirmed run provides `MEDIA_AUTOMATION_RUN_CONFIRM=I_UNDERSTAND_AUTO_DETECT_BATCH` and all gates pass.

For future limited automation, `media-automation:run-continuous-once` is a bounded one-iteration CLI surface only. It requires `MEDIA_AUTOMATION_CONTINUOUS_ONCE_CONFIRM=I_UNDERSTAND_ONE_CONTINUOUS_LIMITED_CYCLE`, a fresh backup/restore gate, no active unfinished jobs, no unsafe CDN rows, audit/rollback/fallback/kill-switch gates, and still stops after the single iteration. Disabled systemd templates under `ops/media-automation/systemd/` are not installed or enabled.

The first production catalog audit is intentionally a no-run plan: no additional videos are selected because every non-City-Lights row fails at least one public-safe gate. Five non-City-Lights rows are public, source-present, non-paid, and moderation-clean, but remain blocked by `scan_status=manual_review`; they must not be processed until scanner proof and scan approval are explicit.

The first full production CLI auto-detect cycle also ended as Pass-No-op. `media-automation:report` confirmed `calculatedBatchSize=0`, reason `no_eligible_candidates`, no selected candidates, no rollback scopes, no `run-auto`, no production DB writes, no media uploads, and no playback broadening.

Catalog readiness automation narrows that next step without processing media. `npm run media-catalog:status`, `npm run media-catalog:readiness-plan`, and `npm run media-catalog:scan-plan` currently report `ready_for_transcode=0`, `already_audited_hls=1`, `needs_scan=5`, `private_excluded=12`, and `premium_excluded=9`. The `needs_scan` rows are public scan candidates only; they are not CDN/HLS or transcode candidates until trusted scanner proof plus moderation-safe readback promotes them. The readiness CLI is read-only and does not execute scans, mark media clean, write rows, upload media, or switch playback.

## Activation

Use only non-secret rollout flags:

```sh
EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_ENABLED=true
EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_KILL_SWITCH=false
EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_ROLLOUT_MODE=trusted_public
EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_REQUIRE_AUDIT_PASSED=true
EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_REQUIRE_BACKUP_FRESH=true
EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_BACKUP_GATE_STATUS=closed_for_latest_manual_backup
EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_BACKUP_LATEST_VERIFIED=true
EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_RESTORE_DRILL_PASSED=true
EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_FALLBACK_TO_ORIGIN=true
EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_DELIVERY_PROVIDER=cloudflare_r2_custom_domain
EXPO_PUBLIC_MEDIA_CDN_BASE_URL=https://media.chillywoodstream.com
EXPO_PUBLIC_MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX=playback/public/
EXPO_PUBLIC_MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true
EXPO_PUBLIC_MEDIA_CDN_SIGNING_MODE=off
```

If the first installed proof is not stable, switch back by publishing the same source with `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_KILL_SWITCH=true` or `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_ROLLOUT_MODE=off`.

## Post-Activation Proof

Required proof:

- City Lights HLS master, variants, and a `.ts` segment fetch through `media.chillywoodstream.com`
- segment cache remains `HIT` with `Age`
- installed Player starts playback for City Lights
- redacted playback metadata shows `provider=cloudflare_r2_custom_domain`, `deliveryFormat=hls`, `fallbackUsed=false`
- non-eligible/private/original/Premium cases fall back or block in source proof
- kill switch proof returns signed-origin fallback
- production worker remains not deployed
- no new production media is processed

## Rollback

Rollback is config-first:

1. Turn kill switch on or set rollout mode to `off`.
2. Re-run source proof and installed proof for fallback.
3. Do not delete R2 objects unless a scoped media-worker rollback is explicitly approved.
4. If a batch row is unsafe, quarantine exact batch/source rows and use the exact-prefix rollback plan.

Do not add broad Cloudflare cache rules, broad public bucket exposure, broad backfill, or continuous worker automation from this runbook.
