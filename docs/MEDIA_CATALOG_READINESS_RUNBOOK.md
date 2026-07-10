# Media Catalog Readiness Runbook

Last updated: 2026-07-09

Status: Catalog readiness automation is source/proofed and CLI-read-only for classification. It classifies catalog rows, identifies public scan candidates, and plans scan/moderation readiness steps. Scanner automation now has a deployed trusted backend gateway for ffprobe media-readability scans; it can stream public scan candidates through backend authority, record trusted scan results after proof, and deny private/Premium rows. No command processes/transcodes media, and no command switches playback.

Object-storage migration note: the scanner gateway has a `cloudflare_r2` private-origin read path for migrated public-safe scanner inputs under `chillywood-media-origin`, and trusted copier `media-object-storage-migration` is deployed. The Hetzner Object Storage migration is shutdown-ready by active-reference semantics: `16` existing distinct refs were copied/readback verified, DB batch `media-object-storage-r2-2026-07-10T21-27-45-643Z` migrated `24` copied+verified row refs to R2 private-origin metadata, new creator-media uploads now target R2 private origin, and the final audit resolved all `7` raw `media_scan_jobs` history refs as stale with `activeUnresolvedHetznerObjectRefs=0`. Current worker checks remain dry-run/no-candidate unless a future safe candidate appears. Do not shut down Hetzner LiveKit.

## Purpose

The media automation pipeline cannot transcode unscanned creator videos into public Cloudflare R2/HLS output. Catalog readiness fills the gap before transcode automation: it explains why rows are excluded, identifies which public rows may be queued for scanning, and keeps private, Premium, original/master, unsupported, missing-source, and moderation-blocked media out of the public CDN path.

Catalog readiness CLI is read-only. The scanner CLI is the separate trusted execution path: it can plan, dry-run, and run public scan candidates only with explicit confirmation and backend scanner authority. It does not execute moderation promotion.

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

## Trusted backend scanner gateway

The CLI must not require a raw local service-role key, S3 key, R2 key, or user browser token for scan downloads. The deployed `media-scan-private-access` Edge Function is the trusted scanner gateway. It uses a narrow scanner operator token, stores only `MEDIA_SCAN_OPERATOR_TOKEN_SHA256` server-side, validates requests with constant-time hash comparison, and never logs or returns storage credentials.

Gateway actions:

- `audit_candidate`: returns redacted metadata for a public, non-Premium, scan-pending candidate.
- `download`: revalidates public/non-Premium/not moderation-blocked source state and streams source bytes to the scanner without returning a signed URL.
- `record_scan_result`: accepts trusted scanner output with scanner name/version and ffprobe proof, then writes the scan result through backend authority.

Supported backend storage paths:

- S3/Hetzner-backed source objects in the configured production source bucket.
- Supabase Storage-backed source objects in `creator-videos`.
- Cloudflare R2 private-origin objects in `chillywood-media-origin` after a future verified migration and env switch.

The CLI writes streamed bytes only to a `0600` temp file, runs ffprobe media-readability, deletes the temp file, and never prints signed URLs or private object URLs.

Current linked storage classification for the five scan candidates:

- Four candidates are S3/Hetzner-backed in bucket `chillywood-media-prod` with object metadata present and redacted.
- One candidate is Supabase Storage-backed in bucket `creator-videos` with object metadata present and redacted.
- None has a public playback URL.

The proof run generated a scanner operator token, stored only its SHA-256 as a Supabase function secret, kept the raw token out of logs and git, and used it only for the production scan proof. Missing-token and invalid-token requests were denied. Private and Premium candidate requests were denied.

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

Latest production catalog readiness readback after the trusted gateway scan proof on 2026-07-09:

- `totalRows=27`
- `ready_for_transcode=0`
- `already_audited_hls=1`
- `needs_scan=0`
- `needs_moderation_review=0`
- `private_excluded=12`
- `premium_excluded=9`
- `original_master_excluded=0`
- `missing_source=0`
- `unsupported_format=0`
- `blocked_moderation=0`
- `denied_source=0`

The five former scan candidates are public, source-present, non-Premium rows that passed ffprobe media-readability through the backend gateway and now read back as ready for transcode under the existing scan/moderation gates:

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

Production scan write status: closed for the first public scan batch proof. `media-scan:run-one` requires `MEDIA_SCAN_RUN_ONE_CONFIRM=I_UNDERSTAND_PUBLIC_SCAN_ONE`; `media-scan:run-auto` requires `MEDIA_SCAN_AUTO_CONFIRM=I_UNDERSTAND_PUBLIC_SCAN_BATCH`, automatically selects public scan candidates up to the safe cap, skips private/Premium rows, and writes only through the backend gateway. Every trusted scan result must include scanner name/version/proof, read back cleanly, and still require moderation-safe state before `ready_for_transcode`.

## First Autonomous Cycle Attempt

The first full autonomous readiness -> scan -> transcode -> audit -> CDN/HLS cycle is Closed for current safe work. Backup verification, restore drill, worker preflight, automation status, and catalog readiness preflight passed. `media-scan:run-auto` selected all five public non-Premium scan candidates, skipped `12` private plus `9` Premium rows, streamed the objects through the backend gateway, ran ffprobe media-readability, and wrote trusted clean scan results for exactly those five rows. `media-automation:run-auto` then processed four supported safe candidates in bounded batches, uploaded HLS output under `playback/public/auto/`, audited/promoted rows, and verified public HLS fetch/decode. The fifth candidate is 320x180, below the current 360p minimum ladder, so it is now classified `unsupported_format` and has only a scoped failed job marker with no HLS upload or rendition row. Final readiness shows `ready_for_transcode=0`, `already_audited_hls=5`, `needs_scan=0`, `private_excluded=12`, `premium_excluded=9`, and `unsupported_format=1`.

## Safety Rules

- Private and Premium media remain excluded.
- Original/master media remains excluded from normal public playback output.
- Unscanned media cannot be transcoded.
- Moderation-blocked media cannot be transcoded.
- Readiness planning performs no mutation.
- Scanner planning performs no mutation.
- Scanner `run-one` and `run-auto` require explicit confirmation and backend scanner authority.
- Proof and CLI output must redact private URLs, signed URLs, object paths, and secrets.
- Transcode automation may only consume rows after scan and moderation gates promote them to `ready_for_transcode`.
