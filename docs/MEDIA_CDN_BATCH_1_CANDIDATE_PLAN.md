# Media CDN Batch 1 Candidate Plan

Last updated: 2026-07-09

Status: planning only. This plan does not run the media worker, deploy a queue processor, backfill media, write `media_transcode_jobs` or `media_renditions`, upload R2 objects, or switch additional videos to CDN/HLS.

## Read-Only Catalog Audit

The production creator-video catalog was read through Supabase CLI linked read-only queries. The audit selected metadata only: source id, title, visibility, scan/moderation states, storage provider label, source-present boolean, paid/Premium lock boolean, and trusted HLS rendition counts. It did not print playback URLs, object keys, signed URLs, owner ids, DB URLs, service-role keys, or provider secrets.

Catalog summary:

- Total creator-video rows: `27`
- Existing audited CDN/HLS eligible source count: `1`
- Existing audited CDN/HLS source: `Chi'llywood City Lights` (`creator_video`, `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`)
- Current media worker rows: `media_transcode_jobs=1`, `media_renditions=2`
- Active unfinished jobs: `0`
- Unsafe CDN rows: `0`
- Other-source renditions: `0`
- New public-safe Batch 1 candidates selectable now: `0`

Independent exclusion flags overlap by design:

- Not public (`draft` / `circle`): `12`
- Paid/Premium locked: `10`
- Missing source: `0`
- Scan not `clean` or `approved`: `27`
- Moderation not allowed/approved/clean: `2`
- Already trusted CDN/HLS: `1`
- Public, source-present, non-paid rows blocked only by scan gate: `7`

Primary source-row blockers for the full catalog were: `12` not public, `8` paid/Premium locked, and `7` scan not clean/approved. City Lights has trusted audited `media_renditions` and is already eligible under rollout gates, but its source `videos` row still reports `scan_status=manual_review`; future batch selection must use the trusted rendition row for playback eligibility and must not treat scan-pending source rows as public-safe for new processing.

## Batch 1 Decision

Batch 1 is intentionally empty.

No additional videos are selected because none of the non-City-Lights catalog rows currently satisfy all public-safe planning gates:

- `visibility=public`
- source exists
- not paid/Premium locked
- scan status `clean` or `approved`
- moderation status `clean`, `approved`, or `allowed`
- no existing trusted CDN/HLS row

This means:

- Public-safe candidate count for new expansion: `0`
- Needs-transcode count under the current gate: `0`
- Proposed Batch 1 list: none
- Transcode run: not started
- Worker run: not started
- Playback switch for additional videos: not started

## Deferred Scan-Gated Rows

These rows are not selected. They are public, source-present, non-paid, and moderation-clean, but their source rows are `scan_status=manual_review`; they must not enter a media-worker batch until scan approval is explicit and any owner approval for processing is recorded.

| Source Type | Source ID | Title | Current Playback Source | Not Selected Reason |
| --- | --- | --- | --- | --- |
| `creator_video` | `7bb34311-5754-45c8-86bc-817dfdfb8011` | Chillywoodtest | `s3:signed-origin-fallback` | `scan_status_not_clean_or_approved` |
| `creator_video` | `3de36e39-67e6-45ca-a12f-d5b1560473cb` | Chillywoodtest profile upload | `s3:signed-origin-fallback` | `scan_status_not_clean_or_approved` |
| `creator_video` | `4c0b42c4-fe11-44ce-8c31-d6a1fd41821b` | Cover Card Preview | `s3:signed-origin-fallback` | `scan_status_not_clean_or_approved` |
| `creator_video` | `4999b741-8854-4bc8-a2f0-45907b870db3` | S3 Runtime Proof 2026-04-30T21-44-25-370Z | `s3:signed-origin-fallback` | `scan_status_not_clean_or_approved` |
| `creator_video` | `84c486e9-a62e-4121-8e70-ee79e17b1bf0` | S3 Runtime Proof 2026-04-30T21-46-14-025Z | `s3:signed-origin-fallback` | `scan_status_not_clean_or_approved` |
| `creator_video` | `4a75de25-b1c9-48b3-b45c-90ccbffc7449` | Supabase Fallback Runtime Proof 2026-04-30T21-47-33-462Z | `supabase-storage:signed-origin-fallback` | `scan_status_not_clean_or_approved` |

City Lights is also source-row scan-gated (`manual_review`) but is not a new batch candidate because it already has two trusted audited HLS `media_renditions` rows and is the installed canary.

## Future Batch Shape

If scan approval later makes any deferred row eligible, Batch 1 remains capped at `5` sources.

Expected output prefix pattern:

```text
playback/public/worker-batch/chillywood-cdn-batch-1/<title-slug>/<source-id-prefix>/
```

Rollback scope for each selected source must be exact:

```text
source_id=<source_id>; exact_prefix=playback/public/worker-batch/chillywood-cdn-batch-1/<title-slug>/<source-id-prefix>/
```

The rollback plan must deny missing batch ids, broad prefixes, private/Premium/original paths, and any prefix outside `playback/public/worker-batch/chillywood-cdn-batch-1/`.

## Required Gate Before Any Future Run

Before a future owner-approved batch run:

```sh
npm run backup:media-worker:preflight
npm run backup:media-worker:verify-latest
npm run backup:media-worker:restore-drill
npm run media-worker:preflight
npm run media-worker:status
```

The run may proceed only if the backup gate is fresh/closed, restore drill passes, worker remains operator-controlled, `max_jobs_per_run` and batch cap are explicit, scan/moderation gates are clean, private/original/Premium media is excluded, and signed-origin fallback remains available.

## Current Result

Batch planning is complete but there is no runnable Batch 1 today. The next safe action is either scan/moderation review for the deferred rows or leaving the rollout at the current City Lights audited-row canary scope.
