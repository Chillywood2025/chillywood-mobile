# Media CDN Batch Rollout Runbook

Last updated: 2026-07-09

Status: controlled rollout guide for audited public-safe Cloudflare R2/HLS playback. Controlled `trusted_public` activation was installed-proved for the City Lights audited production rows on EAS Update group `8e7a8c95-241d-4853-9bf3-ebfb063255e4` / Android update `019f483e-a504-7baa-80e1-dadf7a47cb0d`. This runbook does not deploy a worker, run backfill, enable cron, or switch private/original/Premium media to public CDN.

## Current Scope

- City Lights remains the canary source: `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`.
- Existing production media-worker rows: `media_transcode_jobs=1`, `media_renditions=2`.
- Current worker-proof HLS prefix: `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`.
- Latest private backup prefix: `backups/media-worker/2026/07/09/media-worker-logical-20260709T152048-8820af024114/`.
- Continuous worker automation and broad backfill remain blocked.
- Active rollout scope: trusted audited public-safe rows only; currently production row counts are `media_transcode_jobs=1`, `media_renditions=2`, `unsafe_cdn_rows=0`, and `other_source_renditions=0`.
- First Batch 1 candidate plan: `docs/MEDIA_CDN_BATCH_1_CANDIDATE_PLAN.md`. The read-only catalog audit found `27` creator-video rows, `1` already eligible audited CDN/HLS source, `0` new selectable public-safe Batch 1 candidates, `0` needs-transcode rows under the current gate, `12` not-public rows, `10` paid/Premium locked rows, `27` source rows without `clean` or `approved` scan status, and `2` rows with moderation not allowed/approved/clean. Batch 1 is empty until scan approval and owner approval make new public-safe rows eligible.

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
```

The planner must:

- count eligible audited public-safe rows
- exclude denied, private, Premium, original/master, pending/failed audit, unsafe scan/moderation, wrong bucket role, and wrong-prefix rows
- enforce the max-batch cap
- produce a rollback plan scoped to exact source ids and exact output prefixes
- perform no DB mutation
- switch no playback config by itself

The first production catalog audit is intentionally a no-run plan: no additional videos are selected because every non-City-Lights row fails at least one public-safe gate. Six non-City-Lights rows are public, source-present, non-paid, and moderation-clean, but remain blocked by `scan_status=manual_review`; they must not be processed until scan approval is explicit.

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
