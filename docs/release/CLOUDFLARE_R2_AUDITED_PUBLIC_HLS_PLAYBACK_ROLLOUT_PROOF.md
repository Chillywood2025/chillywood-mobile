# Cloudflare R2 Audited Public HLS Playback Rollout Proof

Date: 2026-07-09

Verdict: Closed for controlled audited-row playback rollout. Cloudflare R2/HLS playback is active for trusted audited public-safe `media_renditions` rows under rollout gates. City Lights is the installed canary proof, not a hardcoded final path. No worker, queue processor, broad backfill, private/Premium public CDN path, or broad migration was enabled.

## Source And OTA

- Source commit: `ecb8b0299876adb7cea1bc7939da2a9a18480ad0`.
- EAS Update branch: `production`.
- Runtime: `1.0.0`.
- Update group: `8e7a8c95-241d-4853-9bf3-ebfb063255e4`.
- Android update id: `019f483e-a504-7baa-80e1-dadf7a47cb0d`.
- iOS update id: `019f483e-a504-744a-80be-797cd806bcb7`.
- Message: `Activate audited public HLS playback gates ecb8b029`.

Non-secret activation flags used for the OTA:

- `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_ENABLED=true`
- `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_KILL_SWITCH=false`
- `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_ROLLOUT_MODE=trusted_public`
- `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_REQUIRE_AUDIT_PASSED=true`
- `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_REQUIRE_BACKUP_FRESH=true`
- `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_BACKUP_GATE_STATUS=closed_for_latest_manual_backup`
- `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_BACKUP_LATEST_VERIFIED=true`
- `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_RESTORE_DRILL_PASSED=true`
- `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_FALLBACK_TO_ORIGIN=true`
- `EXPO_PUBLIC_MEDIA_PLAYBACK_CDN_DELIVERY_PROVIDER=cloudflare_r2_custom_domain`
- `EXPO_PUBLIC_MEDIA_CDN_BASE_URL=https://media.chillywoodstream.com`
- `EXPO_PUBLIC_MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX=playback/public/`
- `EXPO_PUBLIC_MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true`
- `EXPO_PUBLIC_MEDIA_CDN_SIGNING_MODE=off`

## Installed Proof

Device/package readback:

- Device: `R5CR120QCBF`.
- Package: `com.chillywood.mobile`.
- Installer: `com.android.vending`.
- versionCode: `80`.
- versionName: `1.0.0`.
- No sideload, uninstall, reinstall, logout, data clear, or manual entitlement action was used.

City Lights installed playback:

- Source: `Chi'llywood City Lights`.
- Source id: `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`.
- Redacted app log showed `playbackHost=media.chillywoodstream.com`, `provider=cloudflare_r2_custom_domain`, `deliveryFormat=hls`, `rolloutMode=trusted_public`, `cdnEligible=true`, `fallbackUsed=false`, `auditPassed=true`, `backupGatePassed=true`, `blockedReason=null`, and `rawUrlRedacted=true`.
- Android initialized ExoPlayer and H.264 decode for the 854x480 stream.
- Screenshot artifact: `artifacts/media-cdn-rollout-20260709/city-lights-installed-player.png`.
- Screenshot evidence: visible video frame and progress at `0:19 / 0:52`.

## Public HLS And Cache

Worker-proof master:

- `https://media.chillywoodstream.com/playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/master.m3u8`
- HTTP 200.
- `Content-Type: application/vnd.apple.mpegurl`.
- `Cache-Control: public, max-age=300`.
- Manifest contains only relative public variant paths and no signed/private origin URLs.

Segment proof:

- `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/360p/segment-000.ts`
- HTTP 200.
- `Content-Type: video/mp2t`.
- `Cache-Control: public, max-age=31536000, immutable`.
- `cf-cache-status: HIT` with `Age`.

Forbidden public prefixes still returned 404:

- `originals/`
- `uploads/`
- `private/`
- `premium/`
- `processing/`
- `moderation-blocked/`
- `unscanned/`

## Safety Readback

Production row counts after rollout:

- `media_transcode_jobs=1`
- `media_renditions=2`
- `active_unfinished_jobs=0`
- `unsafe_cdn_rows=0`
- `other_source_renditions=0`

Backup gate:

- Latest private R2 backup prefix: `backups/media-worker/2026/07/09/media-worker-logical-20260709T152048-8820af024114/`.
- `backup:media-worker:verify-latest` passed private R2 checksum readback.
- `backup:media-worker:restore-drill` passed disposable PGlite restore with matching row counts.

Worker/backfill state:

- Production worker not deployed.
- Queue processor not running.
- Cron/scheduler not added.
- Broad backfill not run.
- Continuous automation remains blocked.

Access boundaries:

- Signed-origin fallback remains available and mandatory.
- CDN/HLS eligibility is limited to trusted audited public-safe rows under rollout gates.
- Private/original/Premium/unscanned/moderation-blocked rows remain blocked from public CDN.
- No private bucket exposure occurred.
- No production media was newly processed in this activation task.

## Proof Commands

Passed before/after activation:

- `npm run proof:media-playback-cdn-eligibility`
- `npm run proof:media-cdn-rollout-planner`
- `npm run proof:media-delivery-resolver`
- `npm run proof:media-rendition-metadata`
- `npm run proof:media-transcode-worker-cli`
- `npm run backup:media-worker:preflight`
- `npm run backup:media-worker:status`
- `npm run backup:media-worker:verify-latest`
- `npm run backup:media-worker:restore-drill`
- `npm run media-worker:preflight`
- `npm run media-worker:status`
- Scoped `npm run media-worker:audit -- --batch-id 0341d2d1-c02c-4719-91c5-bea9809f4739 --source-id c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`
- Scoped `npm run media-worker:verify-output -- --batch-id 0341d2d1-c02c-4719-91c5-bea9809f4739 --source-id c28e3838-7d2e-4f48-a8ad-73e3100f8cf1 --output-prefix playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`
- Scoped `npm run media-worker:rollback-plan -- --batch-id 0341d2d1-c02c-4719-91c5-bea9809f4739 --source-id c28e3838-7d2e-4f48-a8ad-73e3100f8cf1 --output-prefix playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`
- `npm run guard:media-delivery-architecture`
- `npm run guard:vod-quality-policy`
- `npm run validate:runtime`
- `npm run guard:route-contracts --if-present`
- `npx tsc --noEmit`
- `git diff --check`
- `git diff --cached --check`
- changed-file secret scan

Bare `media-worker:audit`, `media-worker:verify-output`, and `media-worker:rollback-plan` correctly fail closed without required scope arguments; scoped versions passed.

## Remaining Boundaries

- Do not treat this as production-wide media migration.
- Do not run all-video backfill.
- Do not deploy a continuous worker.
- Do not enable private/Premium public CDN delivery.
- Do not claim production egress savings until telemetry/provider reconciliation proves them.
- Expand only by owner-approved canary/batch/trusted-public gates with rollback and fallback.
