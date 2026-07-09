# Media Catalog Readiness Runbook

Last updated: 2026-07-09

Status: Catalog readiness automation is source/proofed and CLI-read-only. It classifies catalog rows, identifies public scan candidates, and plans scan/moderation readiness steps. Scanner automation is also source/proofed for ffprobe media-readability planning and now has a trusted S3 download path through the existing backend `media-storage` signer when `MEDIA_SCAN_DOWNLOAD_ACCESS_TOKEN` is provided, but production scan writes are disabled in the CLI source-proof build. No command marks media clean without trusted scanner proof, no command processes/transcodes media, and no command switches playback.

## Purpose

The media automation pipeline cannot transcode unscanned creator videos into public Cloudflare R2/HLS output. Catalog readiness fills the gap before transcode automation: it explains why rows are excluded, identifies which public rows may be queued for scanning, and keeps private, Premium, original/master, unsupported, missing-source, and moderation-blocked media out of the public CDN path.

Catalog readiness CLI is read-only. This lane does not execute scans on production media. The scanner CLI can plan and dry-run a public scan candidate, but `run-one` fails closed unless the explicit confirmation is present and still refuses production writes in this source-proof build. This lane does not execute moderation promotion.

## Commands

```sh
npm run media-catalog:status
npm run media-catalog:readiness-plan
npm run media-catalog:scan-plan
npm run proof:media-catalog-readiness
npm run media-scan:status
npm run media-scan:plan
npm run media-scan:dry-run
npm run media-scan:run-auto
npm run proof:media-scan-automation
npm run proof:media-scan-auto-cycle
```

The production commands use linked Supabase read-only queries. They return sanitized counts and public-candidate metadata only. They do not print DB URLs, signed URLs, private storage paths, service-role keys, or private/Premium excluded-row details.

## Trusted Scan Download Path

The CLI must not require a raw local service-role key for S3-backed scan downloads. For S3/Hetzner candidates it can call the existing `media-storage` Edge Function action `create_download_url` using an authenticated scanner/operator access token supplied as `MEDIA_SCAN_DOWNLOAD_ACCESS_TOKEN`. The function owns the S3 secrets server-side, verifies the requested object against the catalog row, and returns a short-lived signed URL to the CLI. The CLI downloads that URL only to a `0600` temp file, runs ffprobe media-readability, deletes the temp file, and never prints the signed URL.

Current linked storage classification for the five scan candidates:

- Four candidates are S3/Hetzner-backed in bucket `chillywood-media-prod` with object metadata present and redacted.
- One candidate is Supabase Storage-backed in bucket `creator-videos` with object metadata present and redacted.
- None has a public playback URL.

The current session had no `MEDIA_SCAN_DOWNLOAD_ACCESS_TOKEN` in process env, so `media-scan:run-one` and `media-scan:run-auto` stopped at `trusted_scan_download_access_missing`. Supabase Storage-backed candidates still need the existing service-role scanner worker path or a future backend stream/download function; they are not reachable through Wrangler R2 proof-bucket access.

## Classifications

- `ready_for_transcode`: public, source-present, supported video, clean/approved scan, allowed/approved/clean moderation, not Premium, not private, not original/master, not denied.
- `already_audited_hls`: already has trusted audited HLS rows and should not be reprocessed by normal auto-detect.
- `needs_scan`: public candidate that cannot become transcode-eligible until scanner proof is read back.
- `needs_moderation_review`: scan-safe candidate that still needs moderation approval.
- `private_excluded`: private/non-public media never becomes a public transcode candidate.
- `premium_excluded`: Premium media stays excluded from public CDN until future signed/token CDN mode exists.
- `original_master_excluded`: original/master media stays private and is not normal playback output.
- `missing_source`: source metadata must be repaired before scan or transcode planning.
- `unsupported_format`: worker support is missing for this format.
- `blocked_moderation`: scan-blocked or moderation-blocked media remains blocked.
- `denied_source`: operator denylist blocks this source.

## Current Linked Readback

First production catalog readiness readback on 2026-07-09:

- `totalRows=27`
- `ready_for_transcode=0`
- `already_audited_hls=1`
- `needs_scan=5`
- `needs_moderation_review=0`
- `private_excluded=12`
- `premium_excluded=9`
- `original_master_excluded=0`
- `missing_source=0`
- `unsupported_format=0`
- `blocked_moderation=0`
- `denied_source=0`

The five scan candidates are public, source-present, non-Premium rows with `scan_status=manual_review` and safe moderation readback. They are scan candidates only, not transcode candidates:

- `3de36e39-67e6-45ca-a12f-d5b1560473cb` — `Chillywoodtest profile upload`
- `4c0b42c4-fe11-44ce-8c31-d6a1fd41821b` — `Cover Card Preview`
- `4999b741-8854-4bc8-a2f0-45907b870db3` — `S3 Runtime Proof 2026-04-30T21-44-25-370Z`
- `84c486e9-a62e-4121-8e70-ee79e17b1bf0` — `S3 Runtime Proof 2026-04-30T21-46-14-025Z`
- `4a75de25-b1c9-48b3-b45c-90ccbffc7449` — `Supabase Fallback Runtime Proof 2026-04-30T21-47-33-462Z`

`Chi'llywood City Lights` remains the only `already_audited_hls` source in this readback.

## Scan And Moderation Transition

Safe transition:

```text
unscanned/manual_review -> scan_pending -> clean/failed/malware/quarantined -> moderation_allowed/clean/approved -> ready_for_transcode
```

Do not mark unscanned media clean without scanner proof. A future scan executor must write scan results only from trusted backend/scanner authority, read them back, and then require moderation state before transcode eligibility. Changing moderation policy remains a high-risk boundary; safe scanning inside the existing policy is an autonomous media operation.

The repository has scanner infrastructure documented elsewhere, but this catalog readiness CLI is plan-only. It does not enqueue scans, does not execute a scanner, does not change visibility, and does not promote rows to clean/approved.

## Scan Automation Layer

`_lib/mediaScanAutomation.ts`, `scripts/media-scan-cli.mjs`, and `npm run proof:media-scan-automation` add the scanner automation layer. The model classifies scan work as `scan_pending`, `scan_clean`, `scan_failed`, `scan_quarantined`, `scan_skipped_private`, `scan_skipped_premium`, `scan_skipped_missing_source`, `scan_skipped_unsupported`, or `scan_skipped_already_audited_hls`.

The implemented scanner proof is ffprobe media-readability only. It can prove that a media file is readable and has streams/duration. It is not full malware scanning, not NSFW/content moderation, and not a replacement for moderation policy. The existing malware scan pipeline uses service-role-only RPCs and scanner authority; clients cannot write clean scan results.

Production scan write status: disabled in the new CLI source-proof build. `media-scan:run-one` requires `MEDIA_SCAN_RUN_ONE_CONFIRM=I_UNDERSTAND_PUBLIC_SCAN_ONE`; with no `MEDIA_SCAN_DOWNLOAD_ACCESS_TOKEN` it fails closed at `trusted_scan_download_access_missing`, and with a download token it still cannot mark clean unless trusted scan completion authority exists. `media-scan:run-auto` requires `MEDIA_SCAN_AUTO_CONFIRM=I_UNDERSTAND_PUBLIC_SCAN_BATCH`, automatically selects public scan candidates up to the safe cap, skips private/Premium rows, and fails closed at the same trusted download/write gates until a trusted scanner runtime with source-download authority and service-role/RPC completion is available. Future production scan writes must use the trusted service-role scanner path, include scanner name/version/proof, read back the result, and still require moderation-safe state before `ready_for_transcode`.

## First Autonomous Cycle Attempt

The first full autonomous readiness -> scan -> transcode -> audit -> CDN/HLS cycle attempt is Partial at the scan execution gate. Backup verification, restore drill, worker preflight, automation status, and catalog readiness preflight passed. `media-scan:run-auto` selected all five public non-Premium scan candidates and skipped `12` private plus `9` Premium rows, then stopped before mutation because `MEDIA_SCAN_DOWNLOAD_ACCESS_TOKEN` was missing for the existing backend signed-download path. No scan result was written, no row became `ready_for_transcode`, no transcode batch ran, no HLS output was uploaded, and no playback scope changed.

## Safety Rules

- Private and Premium media remain excluded.
- Original/master media remains excluded from normal public playback output.
- Unscanned media cannot be transcoded.
- Moderation-blocked media cannot be transcoded.
- Readiness planning performs no mutation.
- Scanner planning performs no mutation.
- `run-one` and `run-auto` require explicit confirmation and are write-disabled in this source-proof build.
- Proof and CLI output must redact private URLs, signed URLs, object paths, and secrets.
- Transcode automation may only consume rows after scan and moderation gates promote them to `ready_for_transcode`.
