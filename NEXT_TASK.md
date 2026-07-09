# NEXT TASK

# Cloudflare R2 Media Delivery Staged Proof

Current latest truth:
- Cloudflare R2/HLS audited public playback rollout is active under controlled `trusted_public` config for trusted public `media_renditions` rows. Source commit `ecb8b0299876adb7cea1bc7939da2a9a18480ad0` is on `origin/main`; EAS Update production runtime `1.0.0` published group `8e7a8c95-241d-4853-9bf3-ebfb063255e4`, Android update `019f483e-a504-7baa-80e1-dadf7a47cb0d`, message `Activate audited public HLS playback gates ecb8b029`.
- Installed Play app proof passed on physical device `R5CR120QCBF`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `80`, versionName `1.0.0`. City Lights logged redacted playback metadata with `playbackHost=media.chillywoodstream.com`, `provider=cloudflare_r2_custom_domain`, `deliveryFormat=hls`, `rolloutMode=trusted_public`, `cdnEligible=true`, `fallbackUsed=false`, `auditPassed=true`, and `backupGatePassed=true`. Screenshot artifact `artifacts/media-cdn-rollout-20260709/city-lights-installed-player.png` shows visible video frames and progress at `0:19 / 0:52`.
- Production playback scope is controlled, not broad: CDN/HLS is allowed only for trusted audited public-safe `media_renditions` rows that pass rollout, backup, scan, moderation, path, bucket, and provider gates. Signed-origin fallback remains mandatory. Private/original/Premium/unscanned/moderation-blocked rows remain blocked from public CDN.
- Cloudflare R2 is enabled and private proof bucket `chillywood-media-proof` exists.
- Private proof bucket `chillywood-media-proof` remains private, with r2.dev disabled and no custom domain.
- The proof object is kept as harmless text proof traceability unless the owner later requests cleanup.
- Separate public-playback proof bucket `chillywood-media-public-playback-proof` exists and is distinct from `chillywood-media-proof`.
- The public-playback proof bucket contains only public-safe proof assets: `playback/public/proof/hello.txt`, cache-HIT text proof `playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt`, generated demo MP4 `playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4`, approved real public-safe City Lights demo MP4 `playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4`, local-proof HLS assets under `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`, proof-only transcode queue HLS assets under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`, and first one-job worker-proof HLS assets under `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`.
- `media.chillywoodstream.com` is connected only to `chillywood-media-public-playback-proof`; r2.dev public access is disabled on both buckets.
- Public proof URL `https://media.chillywoodstream.com/playback/public/proof/hello.txt` returned HTTP 200 with exact harmless proof text.
- Immutable cache proof URL `https://media.chillywoodstream.com/playback/public/proof/cache-hit/chillywood-cache-proof-v1-3c152e0012db.txt` returned exact harmless text, `Cache-Control: public, max-age=31536000, immutable`, and repeated fetches returned `cf-cache-status: HIT` with increasing `Age` after a narrow cache rule for `/playback/public/proof/cache-hit/*`.
- Cache behavior is proved only for the harmless cache-hit proof prefix. Egress/cost savings are not claimed until media bandwidth telemetry or provider log reconciliation exists.
- Generated demo MP4 URL `https://media.chillywoodstream.com/playback/public/demo/proof-video/v1/chillywood-proof-video-v1-bcf1c879c9a3.mp4` returned HTTP 200, range HTTP 206, `Content-Type: video/mp4`, immutable cache metadata, warm `cf-cache-status: HIT`, ffprobe/ffmpeg decode proof, and proof-only local app playback evidence with `provider=cloudflare_r2_custom_domain`, `publicPlaybackSafe=true`, `cdnEligible=true`, `productionPlaybackSwitched=false`, `playbackStarted=true`, `rangePlaybackSupported=true`, `decoded=true`, and `decodedFrameCount=48`.
- Real City Lights public demo URL `https://media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4` returned HTTP 200, range HTTP 206, `Content-Type: video/mp4`, immutable cache metadata, warm `cf-cache-status: HIT`, H.264 854x480 ffprobe metadata, ffmpeg decode proof, and `decodedFrameCount=1253`.
- Local HLS proof worker `npm run proof:media-delivery-hls-demo` generated 360p/480p HLS from the approved City Lights MP4 and uploaded only proof HLS assets to `playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/`.
- HLS proof URL `https://media.chillywoodstream.com/playback/public/demo/chillywood-city-lights/hls/v1-b670602fa00934ca-hls/master.m3u8` returned HTTP 200; variant playlists returned HTTP 200; HLS segments returned HTTP 200 with `Content-Type: video/mp2t`, immutable cache metadata, and `cf-cache-status: HIT` after a narrow HLS segment cache rule.
- HLS resolver proof returns `media.chillywoodstream.com` only for the allowlisted HLS master manifest; source MP4 and segment paths fall back with `not_in_public_playback_allowlist`.
- Proof-only app/player HLS harness for `app/player/[id].tsx` proves the allowlisted HLS master is received as `{ uri }`, load status reports `durationMillis=52208`, progress reports `progressMillis=2175`, `isPlaying=true`, `playbackStarted=true`, and no private signed origin URL is exposed.
- `npm run proof:media-transcode-queue-hls` proves a source/proof-only queue model for the approved City Lights demo: local job states reach ready, 360p/480p HLS is generated, 24 proof-only objects are uploaded under `playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/`, public HLS fetch/decode passes, completed-job resolver allowlist passes, queued/failed/non-allowlisted outputs cannot resolve, and production DB writes/playback/transcode service remain disabled.
- A third narrow Cloudflare cache rule now applies only to `media.chillywoodstream.com/playback/public/proof-transcode/chillywood-city-lights/v1-b670602fa00934ca-queue-hls/*.ts`; queue segments returned immutable cache metadata with `cf-cache-status: HIT` after warmup. Queue-path cache behavior is proved only for that proof prefix, and production egress savings are not claimed.
- Public probes for `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, and `unscanned/` returned HTTP 404.
- No production media, private/original media, unscanned upload, or Premium creator media was uploaded.
- Production playback remains unchanged on the backend resolver/direct signed-origin fallback.
- Staged resolver support exists in `_lib/mediaDelivery.ts` and is proved by `npm run proof:media-delivery-resolver` plus `npm run proof:media-delivery-public-demo`.
- `npm run proof:media-delivery-real-demo` proves only the approved City Lights public demo allowlist path through `media.chillywoodstream.com`; current production playback now uses the audited `media_renditions` bridge only for eligible trusted public rows under rollout gates.
- Telemetry foundation exists only as `_lib/mediaDeliveryTelemetry.ts` and `npm run proof:media-delivery-telemetry`; it now covers `delivery_format`, `rollout_mode`, `free_or_premium`, CDN HLS, signed-origin fallback, blocked private/Premium-style, and batch rollout event shapes. No production telemetry writes, table migrations, billing/payout changes, or playback switches are live.
- Trusted rendition metadata foundation exists only as `_lib/mediaRenditionMetadata.ts` and `npm run proof:media-rendition-metadata`; City Lights 360p/480p proof fixture rows can resolve the allowlisted HLS master, while not-ready, original/master, Premium/private, unsafe scan/moderation, wrong bucket role, non-public prefix, non-allowlisted, and default creator-video paths block or fall back.
- Trusted backend migration schema is applied to production and now contains only the first controlled one-job proof rows: migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql` created server-owned `media_transcode_jobs` plus `media_renditions`; tables/indexes/RLS/policies/grants were read back, clients cannot write trusted ready/public-safe/path metadata, final row counts are `media_transcode_jobs=1` and `media_renditions=2` for allowlisted City Lights source `c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`, and playback can use those rows only through audited-row rollout gates with signed-origin fallback available.
- Trusted backend migration dry-run still passes static SQL validation plus runtime apply/RLS proof through `npm run proof:media-rendition-migration-dry-run` using an in-memory disposable `@electric-sql/pglite` Postgres runtime. Production rollback-only RLS proof also passed: anon/authenticated trusted writes were denied, service-role/worker proof writes were allowed, resolver-safe select saw one clean public-ready proof row, unsafe/original/Premium/private/non-public-prefix public-CDN rows failed eligibility, the transaction rolled back, and no proof rows persisted.
- Production transcode worker runbook and local proof harness exist: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` defines the future worker runtime/safety/rollback/activation model, and `npm run proof:media-transcode-worker-local` uses only approved City Lights demo media to generate local 360p/480p HLS, simulate upload keys under `playback/public/proof-worker/`, build trusted rows in memory, validate resolver eligibility, build sanitized telemetry, prove failed-job blocking, and run disposable PGlite worker-policy proof.
- First controlled one-job production proof is complete for City Lights only. It used fresh private R2 backup prefix `backups/media-worker/2026/07/09/media-worker-logical-20260709-one-job-readiness-b81c7b1423c6/`, generated 360p/480p HLS locally, uploaded only public-safe worker-proof HLS objects to `playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/`, added one narrow cache rule for that exact `.ts` prefix, wrote job `0341d2d1-c02c-4719-91c5-bea9809f4739` plus two audited rendition rows, proved explicit resolver allowlist behavior, auto-disabled the one-job lane, and did not deploy a production worker, run a queue processor, backfill media, or switch playback.
- Backup/PITR gate is Blocked for broad production worker activation. Backup/PITR gate is Blocked for production worker activation except the completed owner-approved one-job proof lane: Supabase readback on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`, `us-west-2`, `ACTIVE_HEALTHY`) returned `pitr_enabled=false`, `walg_enabled=true`, `backups=[]`, and `physical_backup_data={}`. Billing add-on readback returned no selected add-ons and listed paid PITR variants `pitr_7` (`$100/month`), `pitr_14` (`$200/month`), and `pitr_28` (`$400/month`). Enabling PITR is a provider billing/add-on mutation that requires explicit owner approval. WAL-G alone is not enough for broad worker-write/backfill closure without a verified restore window, latest backup metadata, or restore drill. No broad production worker writes or backfill while the gate is Blocked or Partial.
- Operator-controlled media transcode safety exists in source/proof only: `_lib/mediaTranscodeOperator.ts`, `_lib/mediaTranscodeWorkerSafety.ts`, `_lib/mediaRecoveryOperator.ts`, `npm run proof:media-transcode-operator-control`, `npm run proof:media-transcode-worker-auditor`, `npm run proof:media-recovery-operator`, and `npm run proof:media-transcode-worker-safety` prove disabled default, emergency stop, dry-run no writes, one-job source allowlist lease, `max_jobs_per_run=1`, backfill denial, backup-gate owner override limited to one job, continuous-mode denial while backup gate is Blocked, no worker self-enable, pending-audit-only worker rows, auditor pass before resolver trust, quarantine, and auto-disable.
- R2-backed logical backup/restore readiness is closed for one-job proof only: the latest pre-write backup used for the controlled one-job proof is private R2 prefix `backups/media-worker/2026/07/09/media-worker-logical-20260709-one-job-readiness-b81c7b1423c6/`; it read back with matching SHA-256 checksums, confirmed the public playback bucket and public media domain did not expose it, restored into disposable PGlite, and proved resolver-safe selection. `npm run proof:media-worker-rollback-drill` plus the one-job rollback proof proved exact-batch/exact-prefix rollback and denied missing batch, broad prefix, private, Premium, and original/master rollback targets. This is logical backup/restore proof, not true PITR, and it does not unblock continuous automation.
- Scheduled R2 logical backup/restore gate now has a real manual runner and the first real manual production logical backup is complete, but no deployed schedule exists: `_lib/mediaRecoveryOperator.ts` defines scheduled backup policy, backup freshness, restore-drill freshness, retention, scheduler state, and continuous-worker backup gating. CLI operation is the only backup operation path; no GitHub Actions media-worker backup workflow, cron schedule, deployed scheduler, production worker, queue processor, or playback switch exists. `scripts/run-media-worker-logical-backup.mjs` is disabled/dry-run by default and can create/upload scoped `media_transcode_jobs` plus `media_renditions` backups only with explicit write-mode env, a private R2 backup bucket, and `MEDIA_BACKUP_R2_PREFIX=backups/media-worker/`. `MEDIA_BACKUP_EXPORT_MODE=auto|pg_dump|js` supports JS SELECT export fallback without local `pg_dump`/`psql`; `MEDIA_BACKUP_DATABASE_SOURCE=linked` uses Supabase CLI linked read-only queries instead of requiring or printing a raw DB URL. The first real manual backup used private prefix `backups/media-worker/2026/07/09/media-worker-logical-20260709T152048-8820af024114/`, exported row counts `media_transcode_jobs=1` and `media_renditions=2`, read back all artifacts with matching checksums, restored into disposable PGlite with matching row counts, confirmed not exposed through the public playback bucket or media domain, and injected unsafe rows stayed out of resolver-safe selection. `npm run backup:media-worker:preflight` and `npm run backup:media-worker:status` read back linked Supabase project `bmkkhihfbmsnnmcqkoly`, row counts `media_transcode_jobs=1`, `media_renditions=2`, `active_unfinished_jobs=0`, `unsafe_cdn_rows=0`, and `other_source_renditions=0`; `npm run backup:media-worker:verify-latest` verified private R2 checksums and not exposed through the public playback bucket or media domain; `npm run backup:media-worker:restore-drill` restored the latest backup into disposable PGlite with matching row counts and unsafe-row exclusion. `npm run proof:media-worker-backup-runner` proves dry-run, missing-env fail-closed behavior, linked-source no-raw-DB-URL behavior, public bucket/domain denial, manifest/checksum generation, JS JSONL restore into disposable PGlite, and resolver-safe query. `npm run proof:media-scheduled-backup-gate` proves no backup, stale backup, or missing restore drill blocks automation; fresh private R2 backup plus fresh restore drill closes limited automation only; one-job override requires a fresh manual backup; public bucket backup targets and secret-like artifacts are denied; retention keeps the latest restore-drill-passed backup; and broad backfill remains denied without explicit owner approval. No cron schedule, GitHub Actions schedule, production worker, queue processor, PITR/billing change, additional production media processing, or production playback switch happened.
- CLI-only one-job media transcode worker commands exist as command/proof infrastructure only: `scripts/media-transcode-worker-cli.mjs` provides `media-worker:preflight`, `media-worker:dry-run`, `media-worker:status`, `media-worker:run-one`, `media-worker:audit`, `media-worker:verify-output`, and `media-worker:rollback-plan`; `npm run proof:media-transcode-worker-cli` proves default run-one denial, missing/non-allowlisted source denial, `max_jobs_per_run=1`, backfill denial, stale backup denial, dry-run no-write behavior, explicit `MEDIA_WORKER_RUN_ONE_CONFIRM=I_UNDERSTAND_ONE_JOB` requirement, one-job-only planning, exact audit source/batch scope, exact output-prefix verification, scoped rollback plan, broad/private/Premium/original path denial, no production playback switch, no deployed worker, no queue processor, no production DB writes, and no secrets printed. This task did not process another production job; `run-one` remains infrastructure-only until a future explicit owner-approved run.
- Final CLI media-worker operating checklist is the canonical handoff for future media-worker operations: `docs/MEDIA_WORKER_CLI_OPERATING_CHECKLIST.md` requires backup preflight/status/verify/restore, worker preflight/status/dry-run, exact source allowlist, `max_jobs_per_run=1`, backfill disabled, owner confirmation for run-one, scoped audit/verify-output/rollback-plan, and emergency stop behavior. `npm run proof:media-worker-cli-operating-checklist` guards that the checklist keeps continuous automation blocked, production playback unchanged, no cron/scheduler instructions, no secrets, and no PITR replacement claim.
- Trusted audited-rendition CDN eligibility replaces the one-video hardcoded allowlist as the target operating model. `_lib/mediaPlaybackCdnEligibility.ts`, `_lib/vodQuality.ts`, and `npm run proof:media-playback-cdn-eligibility` prove default signed-origin fallback, fail-closed kill switch behavior, canary eligibility for City Lights, batch eligibility for selected sources, `trusted_public` eligibility for any audited public-safe HLS row, stale-backup fallback, denied-source fallback, and private/original/Premium/unscanned/moderation-blocked/wrong-prefix blocking. `MEDIA_PLAYBACK_CDN_ENABLED=false`, `MEDIA_PLAYBACK_CDN_KILL_SWITCH=true`, and `MEDIA_PLAYBACK_CDN_ROLLOUT_MODE=off` remain the default source posture; `trusted_public` may be active only through explicit owner-approved rollout config and all row/backup gates.
- Scale rollout planning is source/proof-only: `scripts/media-cdn-rollout-planner.mjs`, `npm run media-cdn:plan`, `npm run media-cdn:status`, and `npm run proof:media-cdn-rollout-planner` count trusted eligible rows, enforce `MEDIA_PLAYBACK_CDN_MAX_BATCH_SIZE`, exclude denied/private/Premium/original/pending/blocked/wrong-prefix rows, require rollback plans, redact output, and do not mutate DB or switch playback.
- Media automation operator source/proof now exists for scale: `_lib/mediaAutomationController.ts`, `_lib/mediaAutomationDiscovery.ts`, `_lib/mediaAutomationJobs.ts`, `_lib/mediaAutomationWorkerLoop.ts`, `scripts/media-automation-cli.mjs`, `docs/MEDIA_AUTOMATION_OPERATOR_RUNBOOK.md`, and proofs `proof:media-automation-controller`, `proof:media-automation-discovery`, `proof:media-automation-batch-planner`, and `proof:media-automation-worker-loop`. It is source/proof only: no daemon, cron, scheduler, queue processor, production media processing, production DB writes, broad backfill, or playback broadening happened.
- Production HLS/transcoding is still not live: no production backend transcode queue/service worker, no trusted production `video_renditions` rows for the proof HLS assets, no production rendition metadata writes, and no creator-video playback migration.
- Creator-video playback has a guarded trusted `media_renditions` bridge; default config still falls back to signed origin unless rollout flags and row-level trust gates pass.
- The staged helper returns `media.chillywoodstream.com` only for explicit safe public playback assets under `playback/public/` with Cloudflare custom-domain config and `MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true`.
- Cloudflare R2 custom domains should be treated as public bucket exposure, not a native prefix-limited publish switch. Do not connect `media.chillywoodstream.com` directly to a mixed bucket or the private proof bucket.

Next exact media step:
1. No immediate media task is required unless the owner wants to observe the active audited-row rollout, run `media-cdn:plan`, or approve a small batch expansion.
2. First CDN/HLS Batch 1 candidate planning is complete in `docs/MEDIA_CDN_BATCH_1_CANDIDATE_PLAN.md`: the read-only catalog audit found `0` new selectable public-safe candidates, so no batch should run today.
3. Use `docs/MEDIA_CDN_BATCH_ROLLOUT_RUNBOOK.md` before any playback expansion. Use CLI checklist for any future allowlisted one-job media worker run. Checklist: `docs/MEDIA_WORKER_CLI_OPERATING_CHECKLIST.md`.
4. Any expansion should be batch-based, capped, reversible, and based on trusted audited `media_renditions` eligibility.
5. Automation operator source/proof is available for future owner-approved batch work, but it is not deployed. Do not make a permanent hardcoded City Lights path, run broad backfill, deploy a worker, add cron/scheduler, switch additional videos, or run an all-at-once production migration.
6. Do not tell future sessions to enable cron, scheduler, deployed worker service, queue processor, broad automation, broad backfill, or private/Premium public-CDN playback.
7. Any additional worker one-job lane must use a fresh backup gate check, operator lease, exact source allowlist, `max_jobs_per_run=1`, backfill disabled, pending-audit rows, auditor pass before resolver trust, auto-disable, quarantine on audit failure, and no broad playback switch.
8. Continuous worker mode remains blocked until paid PITR or a deployed/proved scheduled private backup plus recurring restore-drill system is explicitly approved and verified; the current scheduled backup gate has a manual runner and proof, but no deployed schedule.
9. Do not present self-auditing or R2 logical backup as PITR-equivalent for continuous production.
10. Do not enable paid PITR or other backup add-ons without explicit owner approval.
11. Do not enable signed/token CDN playback or production playback switching until explicitly approved and proved.
12. Do not upload real production media or private/original/Premium media to the public-playback proof bucket; the only approved real-media copy there is the City Lights public-safe demo proof object.
13. Do not enable public access on `chillywood-media-proof`.
14. Next real media milestone is explicit owner approval for an installed playback/resolver bridge proof or production worker deployment design, not production playback migration.
15. Do not change app UX, Premium, LiveKit, Watch-Party, Live Stage, App Links, Chat/native, auth/RLS, billing, payout, or cashout behavior for this media lane.

# Watch-Party Live / Live Stage Seated Self-Mute Follow-Up

Current source follow-up:
- Approved non-host speakers now get explicit `Mute myself` / `Unmute myself` controls in regular Watch-Party Live Shared Player and Live Stage.
- The shared helper `setOwnPartyParticipantMuteState(...)` writes only the signed-in user's own membership row, changes `is_muted` plus derived `camera_enabled` / `mic_enabled`, preserves role/stageRole/canSpeak, and reuses the existing Premium room-access check.
- Host mute/moderation remains separate and authoritative through the existing host management path.
- Muted approved speakers remain seated but are not publish-ready: LiveKit token authority returns `speaker` with `canPublish=false` while muted, and the app clears stale LiveKit contracts so unmute/mute refreshes authority.
- The active speaker/camera seat cap remains `4`; no separate source-level passive viewer cap was changed.
- Fullscreen rails/layout, Premium, Party Room, LiveKit routing/heartbeat/cutoffs, App Links, Chat/native, auth/RLS, billing/provider, payout, and cashout behavior were not changed.
- Source commit `1160a5d816eeea2d293566851c45625c317b23bb` is on `origin/main`; Android EAS Update production runtime `1.0.0` published group `11005b31-4d5d-4359-87f6-fbf5a1b1155f`, Android update `019f4307-0522-7054-996a-0fe97624236c`.
- Next step after validation/push/OTA: installed smoke should prove seated viewer self-mute/unmute in Watch-Party Live and Live Stage, plus host mute still works.

# Watch-Party Live Stable Bubble Surface / Final Camera Proof

Latest stable-bubble source update:
- New installed photos after the foreground media-bubble OTA invalidated the prior "works now" carry-forward. The app is still Partial.
- Current source root cause: during post-approval LiveKit authority refresh, Player can clear `watchPartyLiveKitJoinContract`, swap the real `LiveKitStageMediaSurface` for the separate placeholder membership roster, flicker the role pill from transient token role, and leave the approved speaker waiting without an identity-matched camera feed.
- Current source fix in this lane keeps a separate renderable LiveKit contract so the real LiveKit bubble surface stays mounted during token/authority refresh. It still does not treat downgraded viewer/no-publish contracts as publish-ready.
- Speaker/canPublish token refresh now uses a bounded membership-refresh retry window instead of the old single retry that could silently stop after one downgraded response.
- The Shared Player top-video presence pill no longer lists participant names during Watch-Party Live; it keeps the count only so it does not compete with the real bubble panel.
- Source commit `4127cb10aad7007c57a30e9baee1a9088b02ad52` is pushed to `origin/main`.
- Android EAS Update production runtime `1.0.0`: group `996c2593-7df5-4826-8c39-cfc3810de91c`, Android update `019f42d8-93ad-72c5-806a-9ff679c28202`, message `Stabilize Watch-Party Live bubbles 4127cb10`.
- Validation passed: LiveKit routing health (`eligibleServerCount=1`, `heartbeatAgeSeconds=20`, no recent no-eligible-server blocker), heartbeat policy, Premium sandbox policy, Watch-Party LiveKit guard, old-room handling, Watch-Party seat-request proof, Live Stage proof, runtime validation, route contracts, TypeScript, `deno check supabase/functions/livekit-token/index.ts`, diff checks, and changed-hunk secret scan. Installed proof is still required.
- Do not change fullscreen rails/layout, Premium, Watch-Party Party Room source semantics, LiveKit routing/heartbeat/cutoffs, App Links, Chat/native, auth/RLS, billing, payout/cashout, sideload/install/logout/clear-data/uninstall/reinstall.

Superseded foreground media-bubble update:
- Source commit `f9882fc3fcbd23e7765d17f432c47a78ed056f5c` is pushed to `origin/main`.
- Android EAS Update production runtime `1.0.0`: group `ecd5dfde-3650-40e9-a3c9-8431ed8806ec`, Android update `019f42a7-167d-70bf-a8f1-fea8d81469c3`, message `Fix Watch-Party foreground media bubbles f9882fc3`.
- Root cause of the latest “bubbles but no feed” screenshots: the roster/role source was correct, but Watch-Party LiveKit could still be disabled by transient Android foreground `blur` events while the app stayed visible, leaving only membership placeholder bubbles. Publish-capable host/speaker bubbles also showed the role label before `Camera preparing`, which made missing track state look inert instead of actively preparing.
- Source now keeps Shared Player / LiveKit media active while AppState remains `active`, even through keyboard/system/wireless-debug foreground blur events. Publish-capable no-track bubbles now show `Camera preparing` before plain role labels. The regular Shared Player lower dock auto-scrolls to the comment composer while typing so the keyboard does not leave the composer cut off.
- User installed confirmation after this pass: “It works now.” If a launch-quality artifact is required, capture one short fresh OTA pickup proof using this update group before changing source again.
- Do not reopen fullscreen layout, Premium, Watch-Party Party Room source semantics, LiveKit routing/heartbeat/cutoffs, App Links, Chat/native, auth/RLS, billing, payout/cashout, sideload/install/logout/clear-data/uninstall/reinstall.

Current latest truth:
- Watch-Party Live Shared Player remains Partial, but the old comment-composer blocker is now installed-proved fixed.
- Governing doc: `docs/release/GOOGLE_SIGNED_V80_WATCH_PARTY_LIVE_SOURCE_TRUTH_REAL_MEDIA_PROOF.md`.
- Latest proof artifact folder: `/tmp/google-play-internal-v80-watch-party-live-final-camera-reaction-proof-20260708-101138/`.
- Repo alignment after the source/doc/OTA lane: `HEAD == origin/main == 6298a38d38e2e9c074c07b9187467ee9cd504e37`.
- Source commit for the keyboard-height fix: `eaee449b3bc2236abee02f18443094e65c0a999b`.
- Android EAS Update production runtime `1.0.0`: group `d34905b5-ecd6-4c72-b32d-32a173852b89`, Android update `019f414f-f0de-7fe6-b23e-f1d1821b5cfb`, message `Fix Watch-Party Live comment keyboard height eaee449b`.
- Source commit for final camera/reaction hardening: `7d92e8a07bff084916969e665b5ee0ea89ee83fb`.
- Android EAS Update production runtime `1.0.0`: group `c4edaad0-0565-4548-8848-9ef6450a5a4f`, Android update `019f4247-cb7f-7bbd-b19e-80cf06b2ae1b`, message `Fix Watch-Party Live camera reaction 7d92e8a0`.
- Fresh installed room `NZP627` used strict real media `Chi'llywood City Lights`, `sourceType=creator_video`, `sourceId=c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`, `classification=real-media`.
- R3 was recovered through wireless ADB at `10.0.0.27:42069`; R5 stayed USB-visible.
- R5 renewed Premium through the approved Google Play / RevenueCat sandbox path after normal sandbox expiry; R3 joined the same room without a Premium gate. No manual entitlement or bypass was used.
- Backend LiveKit health stayed green: `eligibleServerCount=1`, heartbeat age under 120 seconds, no recent `no_eligible_livekit_server`, and active room/publisher metrics were present.
- The regular Shared Player comment keyboard/cutoff issue is installed-proved fixed: R3 focused the visible comment input, input/Send moved above Android's keyboard, R3 sent `proof`, and R5 saw `Guest: proof` in Room Comments.
- Request/approval and post-approval roster convergence are installed-proved on room `NZP627`: R3 tapped `Request Camera`; R5 received a stable `CAMERA REQUEST` card; R5 approved; R5 showed `You` as Host plus `chillywood92` as Speaker; R3 showed self as Speaker plus `user230455` as Host; no device showed only self, no duplicate self bubble appeared, and host/viewer roles did not mix.
- Remaining blocker: R5 did not render the viewer camera feed during the proof window; it showed an identity-safe approved speaker placeholder plus seated/publish-ready copy. The R3 `React` tap also did not produce an observable host-side reaction/energy marker in screenshots/XML.
- Source hardening for that final blocker is now in progress/next to prove: receiver-side reactions create a visible local `Reaction` room event plus longer receiver toast, local reaction attribution uses the sender participant first, and approved speaker bubbles without an identity-matched remote track show `Camera preparing` instead of a falsely complete seated placeholder.
- Fresh installed rerun after that source/OTA used room `5XLFA6`: R5 opened the strict real-media Home card and created the Party Room, R3 joined the same room, both devices renewed/read back Premium active through approved sandbox flows, and LiveKit backend health was green. The packet still stopped before the final camera/reaction proof because both devices stayed in Party Room with `Connecting…`, and enabled `Open Shared Player` / `Player` taps did not navigate. Direct-route retries were not counted because they failed closed with `Watch-party access unavailable` / `This watch party is linked to a different creator video source`.
- Source/proofability follow-up now adds stable Party Room Shared Player tap targets: `watch-party-open-shared-player-button` for the main CTA and `watch-party-action-player-button` for the action-row Player control. Guard/proof coverage now requires both controls to keep those test IDs and call the real guarded `onWatchTogether` handoff. Source commit `f24b4d192361575266de6e05ce6a27a37f3e23be` is pushed and Android EAS Update production runtime `1.0.0` is published: group `4181cac8-a69e-4cdb-8f30-d30b8b821a7a`, Android update `019f427b-94bf-73bb-8891-22448e265ec8`, message `Add Watch-Party shared player test ids f24b4d19`. This is a testability/source-harness fix only; it does not change fullscreen layout, Premium, LiveKit routing, Party Room room/source behavior, Chat/native, auth/RLS, billing, payout, or cashout behavior.
- Installed rerun after the test-ID OTA used fresh room `NDBCNV`. R5 hosted from strict real-media `Chi'llywood City Lights`, R3 renewed sandbox Premium through the approved Google Play / RevenueCat flow and joined the same room, and both devices showed the new test IDs in installed XML. The packet still did not reach Shared Player because both phones stayed in Party Room with `Connecting…`; main `Open Shared Player` and action-row `Player` controls did not navigate during the proof window. Source commit `24e2b5c5e98bfe8100ff33be03c249f9ede2af1f` hardens those exact controls without changing layout: native `Pressable` button semantics, explicit `accessibilityRole="button"`, expanded hit slop, long-press fallback to the same guarded handoff, pressed feedback, and a redacted `shared player open requested` debug event before LiveKit preparation. Android EAS Update production runtime `1.0.0` is published: group `29272e7b-93ff-40ad-8414-d5fa644ada3a`, Android update `019f428e-6c66-796b-86a7-16e237a44564`, message `Harden Watch-Party shared player entry 24e2b5c5`.
- Installed XML after that lane confirmed both Shared Player entry controls were real clickable `android.widget.Button` targets, so the failure was no longer test-ID reachability. Source root cause: Party Room `onWatchTogether` awaited LiveKit token prewarm before routing to `/player`; a transient/stale LiveKit preflight could consume the valid button action and leave both devices in Party Room. Source commit `19f4959bcd61f0f9c9720a6dc275a4fb2da7dded` keeps Premium/source validation strict but makes LiveKit prewarm non-blocking. Player now remains responsible for consuming/retrying LiveKit contracts and surfacing sync/failure states. Android EAS Update production runtime `1.0.0` is published: group `fd2b4bc1-b1e0-4f25-aa6d-95dfda3a65d9`, Android update `019f4297-677e-7286-a16b-73fa3cc064f3`, message `Make Watch-Party handoff nonblocking 19f4959b`.

Next exact step:
1. Do not reopen playback, real-media classification, visible comments, keyboard reachability, request/approval, roster convergence, fullscreen rails, Premium, App Links, Chat/native calls, or LiveKit backend unless a fresh regression appears.
2. Load OTA group `996c2593-7df5-4826-8c39-cfc3810de91c` / Android update `019f42d8-93ad-72c5-806a-9ff679c28202`, then rerun the installed Watch-Party Live proof with the focus on post-approval bubble/feed stability. Do not use the room code as a direct Player `partyId` workaround.
3. Then focus the next lane on the final installed camera/reaction proof:
   - keep Play-installed v80/latest OTA on R5/R3;
   - renew both Premium windows through the approved Google Play / RevenueCat sandbox path if expired;
   - use a fresh `Chi'llywood City Lights` room;
   - prove R3 reaction produces a visible host-side reaction/energy marker or `Reaction` room event;
   - prove the approved R3 speaker publishes a camera feed that R5 renders under the correct `chillywood92` identity, or that the host surface says an honest `Camera preparing` state while waiting for the identity-matched remote track.
4. Do not change fullscreen layout, Premium entitlement logic, LiveKit routing/heartbeat/cutoff/server registry, Android App Links, Chat/native calls, auth/RLS, billing/provider settings, payouts/cashout, or use sideload/adb install/logout/clear data/uninstall/reinstall.

Superseded current-truth trail retained below for context.

Current latest truth:
- Watch-Party Live Shared Player is Partial after the newest installed comment-composer screenshot.
- Governing doc: `docs/release/GOOGLE_SIGNED_V80_WATCH_PARTY_LIVE_SOURCE_TRUTH_REAL_MEDIA_PROOF.md`.
- Current artifact folder: `/tmp/google-play-internal-v80-watch-party-live-installed-roster-proof-20260707-224324/`.
- Strict real media was `Chi'llywood City Lights`, `sourceType=creator_video`, `sourceId=c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`, `classification=real-media`.
- Carry-forward room `38M7L3` proved actual real-media playback on both devices, visible regular Shared Player comments, locked viewer playback controls, fullscreen left comments / center video / right LiveKit bubble rails unchanged, and return-to-room.
- Source commit `c41c1254ec349b640f5eaa12790731df942b01e8` makes durable active room membership the base Watch-Party Live bubble roster, drops remote LiveKit identities that collide with the current device identity, uses durable app participant id for `You`, and renders membership roster placeholders while LiveKit bubbles are syncing instead of hiding room members. Follow-up source commit `cb546f06d65f5bb05ec1c66cccb79ce47ee7039a` removes the remaining ambiguous host/viewer preview concatenation by rendering a neutral room count (`1 in room`, `2 in room`, etc.) while leaving role truth on the bubbles/status badges.
- Android EAS Update production runtime `1.0.0` for the roster presentation fix was group `2554255e-5591-439b-8474-b4de7b01da3f`, Android update `019f3ff1-f211-75a4-be34-20ca98ce0504`. The latest neutral-preview OTA is group `9a6ce961-1632-4488-a189-98403ea72b78`, Android update `019f3ff9-39f4-714e-91b9-c9a5de71ba61`, message `Clarify Watch-Party Live roster preview cb546f0`.
- R3 visibility was recovered through mDNS at `10.0.0.27:41063`, mapped to serial `R3CXA0DS5JV`; R5 stayed USB-visible. Fresh room `KFUFYC` on the neutral-preview OTA proved the roster/approval fix: both devices showed two unique bubbles after approval, no self-only/no-bubble collapse, no duplicate self, host remained host, viewer became speaker, and the approved viewer camera bubble/feed or seated participant surface was identity-safe.
- The newest remaining installed screenshot shows the regular Shared Player bottom comment composer cut off by the bottom edge/keyboard. This is now the open app-controlled source issue; it does not reopen playback, real media, fullscreen rails, Premium, LiveKit backend, or roster convergence unless a fresh regression appears.
- Source commit `3a2001381a43c26b7e499da699148e0438004c59` keeps fullscreen unchanged and makes the regular non-fullscreen lower dock scrollable, activates keyboard-safe comment mode when the visible composer receives focus, closes the Shared Player menu while composing, and keeps Send taps handled while the keyboard is open.
- Android EAS Update production runtime `1.0.0` was published from that source as group `d4461f02-f7a3-4fc7-80e8-90dbfc76581a`, Android update `019f4064-d6e3-7316-95d6-ae6efc5b9a2a`, message `Fix Watch-Party Live comment dock keyboard reachability 3a200138`.
- Installed proof on room `W5AZ7B` after that OTA recovered R3 through wireless ADB and confirmed both devices could reach the Shared Player, but focusing the R3 comment input still left the composer hidden behind the Android keyboard while the action row remained visible.
- Source commit `cec243533fff7d6859a3397a8a055aa6558a01f6` hides the regular Shared Player action row and controls menu while `sharedPartyCommentsKeyboardActive` is true, so the visible comments composer/Send row is prioritized above the keyboard. Fullscreen rails remain unchanged.
- Android EAS Update production runtime `1.0.0` was published from `cec24353` as group `4c88f779-570a-4fe8-8089-66eeafee4a6b`, Android update `019f410d-cd39-7875-9253-a6575ce09d8c`, message `Fix Watch-Party Live comment keyboard priority cec24353`.
- Installed rerun after that OTA recovered R3 through wireless ADB at `10.0.0.27:42069` and kept R5 visible over USB. The devices reached the Shared Player, but visible lower-dock controls could still be inert: tapping the regular `Party Room`, `Room Comments`, and comment input surfaces did not reliably focus/navigate. Source root cause: the Android shared-video tap target still had a higher native touch layer than the regular lower dock. Source commit `547535135002831449ff6dc7281a202ca0c7b5a7` keeps fullscreen unchanged, lowers `sharedAndroidVideoTapTarget` under the dock, and raises the existing regular lower dock/scroll/content layers so comments, reactions, request-camera, room, and controls buttons can receive taps.
- Android EAS Update production runtime `1.0.0` was published from `54753513` as group `9285127f-acb0-49ec-bcd1-554f439c7497`, Android update `019f412a-b092-73d5-a688-5b2e3c0ce131`, message `Fix Watch-Party Live lower dock touch layer 54753513`.
- Installed proof after the lower-dock touch-layer OTA recovered R3 again at `10.0.0.27:42069`; R5 remained USB-visible. Room `ATKLEB` reached the Shared Player on both devices after normal Google Play sandbox Premium renewals. The lower dock was tappable and the R3 comment input focused, but Android still covered/cut off the composer and Send row with the keyboard. This is the current app-controlled source blocker.
- Current source follow-up keeps fullscreen unchanged and only shrinks the regular non-fullscreen Watch-Party Live shared video surface while `sharedPartyCommentsKeyboardActive` is true, so the existing visible lower comments composer can sit above Android's keyboard.
- Source commit `eaee449b3bc2236abee02f18443094e65c0a999b` is pushed to `origin/main`. Android EAS Update production runtime `1.0.0` published group `d34905b5-ecd6-4c72-b32d-32a173852b89`, Android update `019f414f-f0de-7fe6-b23e-f1d1821b5cfb`, message `Fix Watch-Party Live comment keyboard height eaee449b`.

Superseded historical trail retained for context:
- Watch-Party Live sidecar/shared-player source truth is repaired, validated, pushed, and OTA-published through the real-media playback lane. Installed proof remains Partial, but the real-media playback blocker is resolved: both R5 and R3 rendered actual video in the same Shared Player on the fresh OTA. A July 7 camera-request packet then narrowed the remaining blocker to installed Shared Player camera-request/comment-reaction reachability and request persistence: tapping the viewer's own audience bubble/card did not produce a visible pending request, and the host never received a review/approval surface.
- The current source follow-up fixes that reachability blocker in source and guards without changing the locked layout. Regular Shared Player now exposes an explicit viewer `Request Camera` button with `Request pending` and safe error proof states; the existing self-bubble tap uses the same versioned request path. Host review controls expose stable installed-proof targets. Regular Shared Player comments expose direct input/send targets, and a reachable regular Shared Player reaction button broadcasts room reactions. Guard/proof coverage rejects Share handling in comment, reaction, and request-camera paths and keeps these controls outside the host-only playback lock. Source commit `7ec03c5e4fc716a65fad633db1a593906c2012c3` is on `origin/main`; Android EAS Update production runtime `1.0.0` published group `d6828e44-5e61-4329-9721-d4106a97909f`, Android update `019f3eea-b092-7f99-9833-723a9ed710a3`.
- The latest installed rerun on fresh real-media room `ZWZ2KP` proved the new control targets are visible by testID, but tapping explicit `Request Camera` or the viewer self bubble still did not produce `Request pending` and the host saw no request. Source root cause: the visible Shared Player participant was available, but `requestPartySeat()` recomputed the requester from a stale party-user/ref path and could return before persisting. The regular comments dock also showed only the title while input/send were clipped. Source commit `ad1611b9810299a2ffb98cfdefc15d193a2869e2` fixes both without changing fullscreen rails: the request path accepts the visible participant id, and the regular Shared Player comments dock uses a compact input/send layout. Android EAS Update production runtime `1.0.0` published group `6f83ca92-a7c8-41f5-b4d3-864998e2823e`, Android update `019f3f06-a76b-7dea-8ad7-f5db9374533b`.
- The final pre-proof reachability rerun on fresh room `42L39G` showed a second installed reachability issue: the regular Shared Player social/bubble panel rendered, but the request/comment/reaction controls stayed unreachable because the control deck still lived inside an auto-hide animated overlay gated by `effectiveControlsVisible`, pointer events, and opacity. The current source fix mounts the regular Shared Player control deck as `shared-player-regular-controls` outside that hidden overlay gate and prioritizes the compact comment input/send row over a clipped title/list, without changing fullscreen rails or the major Shared Player layout. Installed proof must wait for a fresh OTA from this source.
- Governing new doc: `docs/release/GOOGLE_SIGNED_V80_WATCH_PARTY_LIVE_SOURCE_TRUTH_REAL_MEDIA_PROOF.md`.
- Source commit: `833520e5ba6fad86160b93df1da45cd510b1c433`.
- Android EAS Update production runtime `1.0.0`: group `0d23919f-bedb-40b4-9428-6550bdfd765c`, Android update `019f3da7-dcd6-7732-a757-cb36b1bd7c61`.
- R3 visibility was recovered through already-paired wireless ADB endpoint `10.0.0.27:44639`, mapping to serial `R3CXA0DS5JV`; R5 remained visible over USB. Both devices read back Play-installed v80 from `com.android.vending`. R5 was already Premium active, and R3 renewed through the approved Google Play / RevenueCat sandbox Premium flow and read back Premium active.
- The first proof attempt stopped before starting Watch-Party Live because the available Home media card opened Player as `Chi'llywood Originals Proof Fixture`. That cannot be counted as strict real non-fixture Home media proof.
- A safe real Home media card is now available: `Chi'llywood City Lights`, `sourceType=creator_video`, `sourceId=c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`, remote playback URL present, `usedBundledFallback=false`, `classification=real-media`.
- In installed room `38M7L3`, R5 hosted from `Chi'llywood City Lights`, R3 joined the same Party Room, and both devices opened Shared Player. Actual video playback appeared on both devices after host playback started. No `Live feed unavailable` or `Live video is temporarily unavailable. Try again in a moment.` alert appeared.
- Regular Shared Player comments were visible at the bottom, R3 showed `Synced · Controls locked` for viewer locked-control proof, fullscreen preserved the locked rails and rendered actual video after host restart, and R3 returned to the Party Room.
- Current installed proof still needs the viewer camera request / host approval packet. In the latest run the visible Shared Player controls did not expose a completed request/approval path before the packet ended, so no matching speaker/canPublish publish authority or approved viewer camera feed is claimed.
- Latest remaining-packet artifact: `/tmp/google-play-internal-v80-watch-party-live-camera-request-approval-proof-20260707-171433/`.
- Latest packet used fresh room `EJPK7C` after stale room `38M7L3` returned `Room not found`. Both devices were visible, Play-installed v80, backend LiveKit health was green, and both devices renewed/read back Premium active through the approved Google Play / RevenueCat sandbox flow. R5 hosted from the strict real-media `Chi'llywood City Lights` Player path and R3 joined the same Party Room/Shared Player.
- Latest packet result: the viewer/audience bubble was visible, but tapping the viewer's own bubble/card did not send/persist a camera request and did not change the viewer to `Request pending`; R5 never received a request badge/review card/approval surface. Viewer comment/reaction send was also not proved because the attempted bottom-control interaction escaped to the Android share/intent resolver and was backed out without sending.
- Current source follow-up adds Android shared-video render proof/recovery. `Synced · Playing` alone is not actual playback proof. A real-media shared source with no load/progress triggers one `expo-video` remount, then an `expo-av` fallback, then a clear render-stalled state if both renderers fail. Logs are redacted and include source kind/classification, playback URL presence boolean only, load/progress/watchdog state, and recovery action.
- The Shared Player custom fullscreen rails remain locked: left comments rail, center shared video surface, and right portrait-reused LiveKit bubble rail. This lane must not change `docs/SHARED_PLAYER_CUSTOM_FULLSCREEN_RAILS.md` layout intent except proof/status notes.
- Party Room handoff and Player entry now use the same canonical Watch-Party Live Premium access key helper, without bypassing Premium or changing Google Play / RevenueCat behavior.
- Watch-Party Live media is classified as real remote media, bundled fallback, proof fixture, or missing fallback so fixture/bundled playback cannot be claimed as strict real non-fixture Home media proof.
- Runtime Player proof/debug logging now uses `classifyWatchPartyLiveMediaSource(...)` with redacted metadata only: party id, source type/id, display name/title, playback URL presence, bundled-fallback boolean, and classification. Strict installed proof may close only when the runtime classification is `real-media`.
- Watch-Party Live token contracts are authority-strict: desired host/speaker publish state is not publish-ready unless the active LiveKit token contract matches role/canPublish/room/identity.
- Camera request review is request-versioned. Duplicate pending events do not reopen an X-closed review, `Not now` clears the current request, and a new viewer request can surface again.
- Local Watch-Party Live request clears are request-version aware. Approval/deny paths pass the captured request version into the local clear and the broadcast clear; legacy unversioned clears do not erase a newer versioned pending request.
- Pending approval is the stable host review path; pending cards do not expose competing inline approve/dismiss buttons, and non-requesting audience cards do not render direct seating controls.
- Participant-specific Watch-Party Live bubbles require identity-matched LiveKit tracks and do not borrow arbitrary remote tracks.
- `npm run proof:watch-party-seat-request` imports the real Watch-Party Live helper module rather than proving a duplicate model.

Next exact step:
1. Load Android OTA group `d34905b5-ecd6-4c72-b32d-32a173852b89` / update `019f414f-f0de-7fe6-b23e-f1d1821b5cfb` on both Play-installed devices.
2. Rerun only the focused installed packet on Play-installed devices after that OTA loads: open `Chi'llywood City Lights`, confirm carry-forward playback/roster basics, tap the visible lower-dock controls, focus the visible bottom comment composer, verify the composer/Send row is visible and tappable above the keyboard, send a viewer comment, and confirm host receipt.
3. Do not reopen playback, real-media classification, fullscreen rails, Premium, Party Room, App Links, Chat/native calls, LiveKit backend, or roster convergence unless a fresh regression appears.

# Android App Links / Domain Association Closed

Current latest truth:
- Android App Links / deep-link domain association is Closed.
- Governing doc: `docs/release/ANDROID_APP_LINKS_CHILLYWOODSTREAM_DOMAIN_ASSOCIATION_PROOF.md`.
- Source/config adds Android `https` App Links in `app.config.ts` for package `com.chillywood.mobile`, host `chillywoodstream.com`, and `autoVerify: true`.
- Claimed paths are narrow app-owned routes: auth/callback fallbacks, `/profile`, `/channel`, `/player`, `/spectate`, `/title`, and `/watch-party` including Live Stage under `/watch-party/live-stage/[partyId]`.
- Web/legal paths remain browser-first: `/`, `/privacy`, `/terms`, `/account-deletion`, `/copyright-report`, and `/support`.
- Deferred/unclaimed: `www.chillywoodstream.com`, `auth.chillywoodstream.com`, `live.chillywoodstream.com`, `network-proof.chillywoodstream.com`, `/live`, `/live-stage`, and `/invite`.
- `public-site/legal-site/assetlinks.json` and generated `public-site/legal-site/site/.well-known/assetlinks.json` contain the public Play App Signing SHA-256 fingerprint for `com.chillywood.mobile`.
- `https://chillywoodstream.com/.well-known/assetlinks.json` returns HTTPS 200 valid JSON with `package_name: "com.chillywood.mobile"` and relation `delegate_permission/common.handle_all_urls`.
- EAS native Android build `4c27d4a2-1b54-48d0-93a2-266c3c430dae` produced Google Play internal versionCode `80`; EAS Submit `35894152-a50a-4edf-b5d3-a9b53a760638` completed on the internal track.
- Play Console Deep links for selected app version `80 (1.0.0)` showed `All links working`.
- Android 16 Play-installed device `R3CXA0DS5JV` reported `chillywoodstream.com: verified`; `/profile/test`, `/watch-party/test`, and `/title/test` opened `com.chillywood.mobile/.MainActivity`, while web-only `/privacy` opened Chrome.

Next exact step:
1. No App Links closure task is open for `chillywoodstream.com`.
2. If product later wants additional hosts or paths, add only backed app-owned routes, serve a valid `/.well-known/assetlinks.json` on each claimed host, and ship another native Google Play build. OTA alone cannot update Android manifest App Links.
3. Do not sideload, `adb install`, uninstall, clear data, logout, or mutate Premium, LiveKit, Watch-Party, Live Stage, Chi'lly Chat/native calls, auth/RLS, billing/provider, live money, payouts, or cashout behavior for future App Links proof.

# Live Stage Source-Truth Repair Closed

Current latest truth:
- Live Stage host/viewer presentation and seat/request/publish state is Closed for the app-controlled installed proof lane.
- Governing docs: `docs/release/GOOGLE_SIGNED_V80_LIVE_STAGE_SEAT_REQUEST_CONTRACT_AND_TRACK_IDENTITY_PROOF.md`, with historical partial context retained in `docs/release/GOOGLE_SIGNED_V79_LIVE_STAGE_VIEWER_SELF_HERO_HOST_SEAT_CARD_PROOF.md` and `docs/release/GOOGLE_SIGNED_V79_LIVE_STAGE_SELF_HERO_SEAT_OVERLAY_PROOF.md`.
- Artifact folder: `/tmp/google-play-internal-v80-live-stage-source-truth-fix-20260707-002444/`.
- Source commit `cd1ec3b48423f2912009847f2fe9bab3057eb509` is on `origin/main`.
- Android EAS Update production runtime `1.0.0` published group `c4f88243-f762-4b8d-a783-c7a1953ed2ea`, Android update `019f3b28-0935-74c5-bb84-b313eeecb11d`, message `Fix Live Stage request contract identity cd1ec3b`.
- Installed room `NXQ4M2` proved both phones Google Play-installed v80 from `com.android.vending`, both devices Premium-active through the approved Google Play / RevenueCat sandbox path, backend LiveKit health green, host/self as hero without `You HOST` in Chi'lly Party Members, remote viewer/requester visible and stable, viewer default host-hero with self as `You`, instant `Make me hero` with no toggle-induced `Live feed syncing`, host-first self-hero party box with no self duplication, `Show host hero` return, X close preserving request/card without immediate reopen, `Not now` clearing only the request while preserving the participant, `Bring on stage` seating the viewer, viewer `Camera active` / `Camera seat active` readback, identity-safe viewer tile behavior, and Stage remaining `2 in room`.
- Validation passed: LiveKit routing health with local proof env, `guard:livekit-heartbeat-monitor-policy`, `guard:premium-sandbox-policy`, `guard:watch-party-livekit`, `guard:old-room-handling`, `proof:live-stage-seat-approval`, `validate:runtime`, `guard:route-contracts --if-present`, `npx tsc --noEmit`, `deno check supabase/functions/livekit-token/index.ts`, diff checks, and changed-file secret scan.
- No livekit-token source change or deploy was required in this final lane.
- No Premium source logic, Premium bypass, manual entitlement grant, Watch-Party Party Room logic, Android App Links, LiveKit heartbeat/router/cutoff policy, Chi'lly Chat/native calls, auth/RLS, billing/provider production settings, live money, payout, cashout, sideload, `adb install`, logout, clear data, uninstall, or reinstall changed.

Next exact step:
1. Do not reopen Live Stage host/viewer/seat-sheet UX unless a new installed regression appears.
2. Continue with separate unresolved launch work only, such as Watch-Party Live sidecar playback proof with non-fixture Home media, broader LiveKit load/reconnect/cellular/TURN/metrics hardening, and provider/legal/launch items already tracked elsewhere.

# LiveKit Production Endpoint / Heartbeat Recovery Closed

Current latest truth:
- The actual `wss://live.chillywoodstream.com` production endpoint and `chillywood-prod-01` heartbeat registry path are recovered.
- Retry artifact folder: `/tmp/livekit-hetzner-recheck-20260705-retry2/`.
- Hetzner Cloud now reports `chillywood-prod-01` running and both assigned primary IPs unblocked:
  - IPv4 `87.99.145.160`: `Blocked: no`
  - IPv6 `2a01:4ff:f0:7064::/64`: `Blocked: no`
- No Hetzner Cloud firewall is attached.
- Host inspection showed Docker active, Caddy active, `chillywood-livekit` container running, LiveKit listening on expected host/container ports, and TLS for `live.chillywoodstream.com` healthy.
- `livekit-heartbeat-monitor.service` is installed on the LiveKit host, active/enabled, and supervised with `Restart=always`; secrets remain only in host/Supabase secret stores and were not printed or committed.
- `npm run check:livekit-routing-health` now passes without manual monitor invocation: `eligibleServerCount=1`, `noEligibleServerCountRecent=0`, heartbeat age under the 120-second cutoff, `chillywood-prod-01` active with no rejection reasons, and `metricsSource=livekit-heartbeat-monitor`.
- A raw WebSocket handshake to `wss://live.chillywoodstream.com/rtc` opened successfully with an in-memory token.
- Fresh redacted token audit rows show `watch-party-live` and `live-stage` token requests succeeded with `error_code=null`, `room_join=true`, and `can_subscribe=true`; fresh routing audit rows show `room_assigned` / `assignment_reused` to `chillywood-prod-01` and no fresh `no_eligible_server`.

Next exact step:
1. Do not reopen Premium, Watch-Party Party Room, Chi'lly Chat, native calls, routing cutoffs, or database eligibility rules for this backend recovery.
2. If product proof is requested next, rerun only the current Play-installed v79 Watch-Party Live sidecar smoke with Premium-active devices.
3. If sidecar or Live Stage still fails, classify it as app/media/LiveKit room readiness only after checking that `check:livekit-routing-health` remains green.
4. Keep the heartbeat monitor installed and monitored; do not manually write heartbeats, loosen stale cutoffs, bypass routing eligibility, or print tokens/secrets.

# Superseded Historical LiveKit Endpoint Block

The previous July 5 provider-block state and zero-eligible heartbeat state are superseded. Historical artifacts remain at `/tmp/livekit-prod-endpoint-repair-20260705/` and `/tmp/livekit-server-heartbeat-recovery-watch-party-live-stage-proof-20260705-162020/`, but those are no longer current blockers.

# Real Home Demo Video Watch-Party Sidecar Retest

Current latest truth:
- Watch-Party Live sidecar remains Partial after a real installed Home-route retest.
- Governing doc: `docs/release/GOOGLE_SIGNED_V79_REAL_HOME_DEMO_VIDEO_WATCH_PARTY_SIDECAR_PROOF.md`.
- Artifact folder: `/tmp/google-play-internal-v79-real-home-demo-video-watch-party-sidecar-proof-20260705-151231/`.
- Both `R5CR120QCBF` and `R3CXA0DS5JV` read back Google Play-installed v79 from `com.android.vending`.
- Premium remains Closed. Both approved tester accounts renewed through the approved Google Play / RevenueCat sandbox Premium flow after normal sandbox expiry and read back `Premium is active.` in app. No entitlement was manually granted.
- R5 opened Home and used the visible installed Home rail video path, not the previous direct fixture route. The local bundled `Chicago Streets` demo was not visible on current Home; the visible Home rail/player was `Chi'llywood Original` / `Chi'llywood Originals Proof Fixture`.
- R5 hosted Party Room `M77N7M` from that Home rail player, and R3 joined the same room through the normal room-code path.
- R5 tapped `Open Shared Player`; the app showed `Live feed unavailable` / `Live video is temporarily unavailable. Try again in a moment.` Retry after waiting showed the same alert.
- R3 did not see actual sidecar playback.
- Classification: Premium/provider sandbox is not the blocker. The remaining blocker is Watch-Party Live sidecar LiveKit join-contract/token readiness or room/source handoff. Because the visible Home video still includes `Proof Fixture` in the title, this is installed Home-route evidence but not a strict non-fixture production-media proof.
- The Live Stage Partial status in this historical sidecar note is superseded by the July 7, 2026 room `NXQ4M2` installed closure.
- No source change, Play build, sideload, `adb install`, logout, clear data, uninstall/reinstall, Premium bypass, manual entitlement grant, provider production mutation, live money, payout/cashout, auth/RLS weakening, native call change, LiveKit server restart, token printing, secret exposure, or broad WebRTC/LiveKit refactor happened.

Next exact step:
1. Do not redo Premium sandbox proof unless entitlement regression appears.
2. For sidecar closure, investigate the `Open Shared Player` `watch-party-live` join-boundary/token-contract path using a non-fixture real Home media item, without exposing tokens/secrets and without broad LiveKit/WebRTC refactors.
3. Ensure future sidecar proof rejects fixture/stub/direct fixture media as final real-user proof.

# Premium-Gated LiveKit Sandbox Follow-Up

Current latest truth:
- Premium-gated Watch-Party / Live Stage access CTAs are source-fixed and OTA-published, and installed proof is Partial for current LiveKit smoke.
- Governing doc: `docs/release/GOOGLE_SIGNED_V79_PREMIUM_GATED_LIVEKIT_SANDBOX_PROOF.md`.
- Artifact folder: `/tmp/google-play-internal-v79-premium-gated-livekit-sandbox-proof-20260705-142126/`.
- Source commit: `aa6d01366b400680a2da692f3164c1862ae6c16c`.
- EAS Update production Android runtime `1.0.0`: group `743a7dd8-7233-4fac-b56e-4764f88c160b`, Android update `019f33bf-42d3-7bcd-84bc-8fed01845ab1`.
- Both `R5CR120QCBF` and `R3CXA0DS5JV` read back Google Play-installed v79 from `com.android.vending`.
- Non-Premium Premium-required gates are source-guarded to route through `View Premium` / `/subscribe` instead of showing `Open Party Room` or a `Premium access is not currently available` dead end.
- Both approved sandbox tester accounts opened `/subscribe`, saw compact sandbox copy, completed the Google Play / RevenueCat sandbox Premium test subscription with the Google Play test card and no real charge, and read back `Premium is active.` in app.
- After Premium active readback, R5 hosted Watch-Party Party Room `VLLM58` and R3 joined it. The current Premium-gated Party Room smoke is Closed.
- Watch-Party Live sidecar remains Partial for a non-Premium blocker: after Premium active, `Open Shared Player` showed `Live feed unavailable` / `Live video is temporarily unavailable. Try again in a moment.`
- The Live Stage Partial status from this older Premium-gated smoke is superseded by the July 7, 2026 room `NXQ4M2` installed closure.
- This supersedes the earlier statement that the current v79 LiveKit smoke was blocked by Premium/account access. Premium sandbox purchase/readback is now proved; the remaining gap from that lane is sidecar readiness.
- No Premium bypass, manual entitlement mutation, service-role grant, live money, payout, cashout, payable balance, provider production mutation, creator-money activation, Play production, sideload, `adb install`, logout, clear data, uninstall/reinstall, native call change, Money Center refactor, auth/RLS weakening, LiveKit server restart, token printing, or secret exposure happened.

Next exact step:
1. Do not redo Premium sandbox purchase proof unless a regression appears.
2. If current LiveKit closure is requested, focus narrowly on the Watch-Party Live sidecar `Live feed unavailable` token/join-contract path.
3. Do not bypass Premium, manually grant entitlements, mutate provider production settings, restart LiveKit, print tokens, or broaden into WebRTC/LiveKit refactors without a fresh exact source bug.

# LiveKit / Watch-Party / Live Stage Reconciliation

Current latest truth:
- LiveKit / Watch-Party / Live Stage proof reconciliation is Closed for documentation reconciliation and Partial for current v79 smoke.
- Governing doc: `docs/release/GOOGLE_SIGNED_V79_LIVEKIT_PROOF_RECONCILIATION_SMOKE.md`.
- Artifact folder: `/tmp/google-play-internal-v79-livekit-proof-reconciliation-smoke-20260705-134945/`.
- Both `R5CR120QCBF` and `R3CXA0DS5JV` were visible and read back Google Play-installed v79 from `com.android.vending`.
- Watch-Party Party Room installed UI is Closed from prior scoped proof, and current v79 Party Room smoke passed on both phones with a temporary authenticated proof-only fixture.
- Watch-Party realtime callback and playback readback are Closed.
- The 25-participant LiveKit RTC-node media diagnostic and publish-authority downgrade are Closed diagnostic support, not actual-user installed UI proof.
- Chi'lly Chat calls are a separate RTC stack; current v79 native Android CallStyle, same-thread, normal in-app, and room-safe call behavior are Closed in the call-specific docs.
- The original current v79 Watch-Party Live camera sidecar smoke hit Premium/access unavailable, but that is superseded by later approved sandbox Premium proof. Current sidecar smoke remains Partial because the installed Home-route `Open Shared Player` path shows `Live feed unavailable` before viewer playback.
- The original current v79 Live Stage smoke hit the legitimate Premium required gate, but that is superseded by later approved sandbox Premium proof and the July 7, 2026 room `NXQ4M2` installed closure.
- No Premium gate was bypassed, no source was changed, no LiveKit server/token behavior changed, and temporary proof rooms were marked inactive after smoke.

Next exact step:
1. Do not reopen broad LiveKit readiness from stale old Partial language.
2. If current Watch-Party Live sidecar proof is required, use the approved Premium sandbox tester state, a non-fixture real Home media item for sidecar, and run only a narrow smoke. Do not bypass Premium gates.
3. Public-production LiveKit readiness still needs current sidecar smoke plus load/reconnect/cellular/TURN/metrics hardening; closed testing remains acceptable with gates/off switches and monitoring.

# Creator-Money Polish Pass Installed Proof

Current latest truth:
- Seven-item creator-money / Premium / notification polish pass is Closed for installed visual proof on Google Play-installed v79.
- Governing doc: `docs/release/GOOGLE_SIGNED_V79_CREATOR_MONEY_POLISH_PASS.md`.
- Artifact folder: `/tmp/google-play-internal-v79-creator-money-polish-pass-20260705-063948/`; installed closure subfolder: `/tmp/google-play-internal-v79-creator-money-polish-pass-20260705-063948/installed-proof-closure-20260705-123246/`.
- Source commit: `06969904cef6cb078ee7f28e7839962acb4ca8ad`.
- EAS Update production Android runtime `1.0.0`: group `32da5f6a-8a04-499c-8896-c8a4497b9420`, Android update `019f3215-47b5-7bff-9aa5-cbe6088a11ba`, message `Polish creator money UI details`.
- Installed proof found one real Paid Video locked-state regression. Follow-up source commit `ddb07f332010ace899284df6f01bd6065dc28e21` fixed locked player chrome in `app/player/[id].tsx`.
- Follow-up EAS Update production Android runtime `1.0.0`: group `24c53b6a-2ee5-469e-a3cd-9eccc5904375`, Android update `019f3364-40aa-7ea7-baff-9ea606e87b11`, message `Fix locked paid video player chrome`.
- `revenuecat-webhook` was redeployed after notification row copy cleanup. No secret values were printed, committed, or documented.
- Source fixes completed:
  - Paid Video locked screen now renders a clean locked poster/paywall state instead of active player chrome bleeding through.
  - Seat Pass unavailable state no longer shows a strong enabled purchase-looking CTA.
  - Money Center / Platform Studio monetization content has top safe-area spacing.
  - Creator wording uses `Watch-Party Seat Passes` instead of `Paid Room Seats`.
  - Visible room tray copy uses user-facing Activity/update copy instead of `room-safe` QA language.
  - Proof account display-name typo was investigated and found only in historical artifacts/docs or external proof-account data, not in source-controlled seed/test fixtures.
  - Creator-money notification rows use concise visible copy while sandbox/proof/not-payable truth remains in metadata.
- Full validation passed: creator-money route/notification/activity/access/money/provider/payment/notification/room/brand/route guards, `npx tsc --noEmit`, `npm run validate:runtime`, `supabase db push --dry-run`, and diff checks.
- Both `R5CR120QCBF` and `R3CXA0DS5JV` were visible/authorized for closure and read back Google Play-installed v79 from `com.android.vending`.
- Installed proof closed all seven items:
  - R3 locked Paid Video shows a clean poster/paywall with `Unlock Video`, exact-video-only copy, and no player controls/chrome bleed-through after the follow-up OTA.
  - R5 unavailable/sold-out Seat Pass shows `Seat Pass unavailable` with no strong enabled purchase CTA.
  - R3 Money Center / Platform Studio header has safe top spacing and readable `Sandbox Ready`.
  - R3 creator setup surfaces show `Watch-Party Seat Passes` and no visible `Paid Room Seats`.
  - R5 room tray says user-facing `Activity` / “You'll stay in the room while checking updates,” with no visible technical `room-safe` QA wording.
  - Proof account display-name typo remains source-uncontrolled external proof-account data; no account DB mutation was performed.
  - Fresh sandbox/proof/not-payable buyer and creator notification rows show concise copy, timestamps, dismiss controls, and route smoke checks; proof truth remains in metadata.

Next exact step:
1. No creator-money polish installed-proof task is open unless a fresh installed regression appears.
2. Do not redo the seven-item polish proof or mutate proof account display names without owner approval.
3. Do not change money/provider/native/auth behavior unless fresh installed proof shows a real app bug.

# Six Creator-Money E2E UX Installed Proof

Current latest truth:
- Six creator-money end-to-end UX cleanup is source-fixed, OTA-published, validation-clean, and the remaining app-controlled safe installed-proof gaps are Closed for the continuation lane.
- Governing doc: `docs/release/GOOGLE_SIGNED_V79_SIX_CREATOR_MONEY_E2E_UX_PROOF.md`.
- Artifact folder: `/tmp/google-play-internal-v79-six-creator-money-e2e-ux-proof-20260704-235833/`.
- Source lanes completed for Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP Pass, and Event Pass.
- Source fixes kept Premium separate from creator-money, removed buyer-facing payout/cashout/payable-balance/provider-mutation wording, kept creator setup sandbox/not-payable, changed visible Seat Pass copy away from stale `Ticket` / `Party Pass` / `Room Pass`, improved canceled/failure copy, and kept access exact-target scoped.
- Receipt/activity/deep-link proof scripts pass for buyer and creator money rows; seeded rows remain UI/routing proof only and are not purchase-generation proof.
- Validation passed: `npm run proof:creator-monetization-route-button-wiring` (249/249), `npm run proof:creator-money-notification-routing`, `npm run proof:notification-center-money-activity`, `npm run proof:important-notification-accessibility`, creator/money/access/provider/premium/payment/notification/route/brand guards, `npx tsc --noEmit`, `npm run validate:runtime`, `supabase db push --dry-run`, and diff checks.
- Safety stayed intact: no live money, payouts, cashout, payable balance, provider activation/mutation, RevenueCat/Google Play production change, Premium entitlement change, Money Center architecture refactor, native call change, auth/RLS weakening, Play production submit, sideload, `adb install`, logout, clear data, uninstall, or reinstall.
- EAS Update production Android runtime `1.0.0` published group `3f405381-d18f-4d9d-bd22-17ff83d2fb67`, Android update `019f30d1-33ec-79fa-b725-bb9d0ae3bf09`, commit `125b495cd38901fa6358e958d1b7fc970f18f574`, message `Clean six creator money UX flows`.
- Device readback after OTA publish showed both `R5CR120QCBF` and `R3CXA0DS5JV` as Google Play-installed v79 (`installerPackageName=com.android.vending`, versionCode `79`, versionName `1.0.0`).
- Installed captures proved: Tip Sheet amount options and contribution-only copy; Paid Video locked state with `Unlock Video` and exact-video-only copy; Channel Subscription active state; VIP Pass active state; Event Pass confirmed state; bell tray timestamps/accessibility labels; visible creator-money rows opening Platform Studio / Money Center.
- July 5 continuation repaired the stale Watch-Party Seat Pass fixture without provider/live-money mutation. Fresh room `V79-SEAT-202607050940` now proves the unpaid Seat Pass gate, sandbox/proof/not-payable Seat Pass access into Party Room, cold-start `/watch-party/[partyId]` access, buyer `Watch-Party Seat Pass ready` receipt row routing, read-state count change, and dismiss hiding only that row.
- Creator setup manager readback was captured for all six flows. Tips and Watch-Party Seat Pass safe save/readback were exercised. The final continuation repaired the Paid Video installed-account blocker with a safe public playable creator-video fixture for the current creator account, proved Paid Video Manager readback, proved the unpaid buyer player gate, proved proof-only player access, and proved buyer/creator Paid Video receipt rows route correctly.
- Full validation was rerun and passed. Seeded/mirrored rows and proof-only access grants remain sandbox/proof/not-payable UI/routing/access-state proof only, not purchase-generation proof.

Next exact step:
1. No app-controlled six-flow continuation task is open unless a fresh installed regression appears.
2. Do not redo Seat Pass or Paid Video fixture repair unless a regression appears.
3. If the owner wants real purchase-generation/canceled/refund or true third-account wrong-account proof, run a separate owner-approved provider sandbox lane. Do not mutate providers, enable live money, enable payouts/cashout, or claim purchase generation from seeded rows in this lane.
4. Keep seeded/mirrored rows documented as sandbox/proof/not-payable UI routing proof only; do not call them purchase-generation proof.

# Premium Subscribe Screen Cleanup

Current latest truth:
- `/subscribe` Premium screen cleanup is Closed for source + Google Play-installed v79 OTA visual proof.
- Artifact folder: `/tmp/premium-subscribe-screen-cleanup-20260704-232630/`.
- Source commit: `af2bb5e0cc3a2ac5ceb863419ae32b38b548e45f`.
- Final EAS Update: production Android runtime `1.0.0`, group `34ad5194-538b-40c2-9335-b5abbf95d397`, Android update `019f308e-4cde-7954-b59b-293c4128fa3b`, message `Simplify Premium subscribe screen`.
- Installed proof on `R5CR120QCBF` / Google Play-installed v79 showed the cleaned `/subscribe` non-Premium sandbox tester screen: `Premium`, `Watch-Party Live, Live Watch-Party, creator tools, and ad-free viewing.`, compact `Sandbox test mode — no real money is charged.`, `Premium is not active.`, primary `Start Sandbox Premium Test`, secondary `Not now`, footer `Already subscribed? Restore`, and collapsed `Testing details`.
- Removed from the main screen: big Account Status card, large sandbox warning/details, repeated Restore/Manage buttons, annual status action, `What does Premium unlock?`, unavailable explanation accordion, dense provider copy, scary red panels, and payout/cashout/withdrawal/transfer/payable-balance wording.
- Restore still uses the existing `restoreMonetizationAccess` flow and showed `Restore complete. Premium is not active.` Not now returns to Home from a direct `/subscribe` launch. The purchase CTA was visually proved but not tapped; no purchase was attempted.
- Active Premium state is source-handled: active users get primary `Manage subscription`, secondary `Done`, and small restore link. Installed active-state proof was not available because the R5 proof account was non-Premium.
- No payment/provider logic, RevenueCat entitlement logic, Google Play product setup, Premium gates, Money Center, creator-money flows, payouts/cashout, live money, auth/RLS, native build, or Play production changed.
- Validation passed `npm run guard:premium-sandbox-policy`, `npx tsc --noEmit`, `npm run validate:runtime`, and diff checks. `npm run proof:premium-first-activation` ran safely and preserved the known annual provider-blocked status while passing safety checks.
- No remaining `/subscribe` Premium screen cleanup task is open unless a fresh installed regression is observed.

# Premium Required Sheet Cleanup

Current latest truth:
- Premium required sheet cleanup is Closed for source + Google Play-installed v79 OTA visual proof.
- Artifact folder: `/tmp/premium-required-sheet-cleanup-20260704-225910/`.
- Source commit: `db1013bb8d6a136b0c6b335f7e62756ecc8bc00a`.
- EAS Update: production Android runtime `1.0.0`, group `c96a642e-ea6d-4fff-8857-1638f6c516a5`, Android update `019f3071-d3e7-7849-a047-7b670842329d`, message `Simplify Premium required sheet`.
- Installed proof on `R5CR120QCBF` / Google Play-installed v79 showed the cleaned Watch-Party Premium gate: `Premium required`, `Watch-Party Live is included with Premium.`, compact `Sandbox test mode — no real money is charged.`, primary `View Premium`, secondary `Not now`, and footer `Already subscribed? Restore`.
- Removed from the installed gate proof: duplicate `Manage Premium`, large `Restore purchases` button, `What does Premium unlock?`, red `Premium Status` card, scary payout/cashout/withdrawal/transfer/payable-balance copy, and `Start Sandbox Premium Test` from the gate sheet.
- `View Premium` opens the existing Premium `/subscribe` screen. `Already subscribed? Restore` calls the existing restore handler and shows restore feedback. `Not now` dismisses the sheet and keeps the user gated.
- No payment/provider logic, RevenueCat entitlement logic, Google Play product setup, Premium gates, Money Center, creator-money flows, payouts/cashout, live money, auth/RLS, native build, or Play production changed.
- Validation passed `npm run guard:premium-sandbox-policy`, `npx tsc --noEmit`, `npm run validate:runtime`, `npm run guard:watch-party-livekit`, `npm run guard:old-room-handling`, and diff checks. `npm run proof:premium-first-activation` ran safely and preserved the known annual provider-blocked status while passing safety checks. `npm run typecheck` reached TypeScript successfully, then failed only on the pre-existing generated Android launcher icon hash guard unrelated to this UI change.
- No remaining Premium required sheet cleanup task is open unless a fresh installed regression is observed.

# V79 Native Answer And Room-Safe Incoming Call Closure

Current latest truth:
- Native Android Chi'lly Chat CallStyle `Answer` handoff and the remaining room-safe incoming-call regression are Closed on Google Play-installed v79.
- Governing docs: `docs/release/GOOGLE_SIGNED_V77_NATIVE_CALLSTYLE_FULLSCREEN_PROOF.md`, `docs/release/GOOGLE_SIGNED_V78_NATIVE_ANSWER_ACTION_FIX.md`, `docs/release/GOOGLE_SIGNED_V79_NATIVE_ANSWER_ACTION_FIX.md`, and `docs/release/GOOGLE_SIGNED_V79_ROOM_SAFE_INCOMING_CALL_REGRESSION_PROOF.md`.
- Artifact folders: `/tmp/google-play-internal-v77-native-answer-action-fix-20260704-124252/v79-build-submit-proof-20260704-174313/` and `/tmp/google-play-internal-v79-room-safe-incoming-call-regression-proof-20260704-203344/`.
- Source commit: `5c210fa52b3c95f2047295c9e0f696db42f48002`, pushed to `origin/main`.
- EAS Build `8a144cae-959f-4acb-9266-8bf7bf2c94f8` produced Android AAB versionCode `79`; EAS Submit `db1e81e4-cd7c-4113-81f1-c05fe2cda6ed` submitted to Google Play internal testing only.
- Both `R5CR120QCBF` and `R3CXA0DS5JV` updated through Google Play only and read back package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`.
- Closed on installed v79: background voice native Answer opens/joins and caller leaves ringing; background video native Answer opens/joins and caller leaves ringing; native Decline clears receiver notification and caller state; same-thread Accept no longer hits `This communication room is unavailable`; normal in-app outside-thread Settings surface shows the full app-wide incoming-call modal and Answer joins correctly.
- Room-safe closure: after owner-approved Google Play / RevenueCat sandbox Premium on `R5CR120QCBF`, receiver reached Watch-Party `Party Waiting Room`; incoming call showed compact `room-safe-incoming-call-banner` with `Decline`, `Reply in Chat`, and `Leave room and answer`; Decline kept receiver in room and cleared caller; Reply in Chat opened the direct thread without auto-answer or mic/camera start; Leave room and answer showed confirmation, then joined the call; both phones reached `2 in call` / `Connected`; End Call cleared both to `No Active Call`; no stale answerable Chi'lly Chat call notification remained.
- Sandbox Premium was test-only and did not enable live money, payouts, cashout, payable balances, provider production settings, or creator-money settlement.
- No current v79 native/room-safe proof item remains open. Do not reopen this lane unless a fresh installed regression is observed.
- Do not create a new Play build, sideload, `adb install`, logout, clear data, uninstall/reinstall, mutate providers, touch Money Center, enable live money/payouts/cashout, weaken auth/RLS, broadly rewrite WebRTC/media, or broadly change room routing unless fresh proof shows a real app bug.

# V78 Native Answer Action Installed Proof Blocker

Current latest truth:
- Native Android Chi'lly Chat CallStyle `Answer` handoff is source/native fixed, built, submitted, and installed on R5, but final two-phone installed proof is Blocked because `R3CXA0DS5JV` is not visible over ADB or Mac USB enumeration.
- Governing docs: `docs/release/GOOGLE_SIGNED_V77_NATIVE_CALLSTYLE_FULLSCREEN_PROOF.md` and `docs/release/GOOGLE_SIGNED_V78_NATIVE_ANSWER_ACTION_FIX.md`.
- Artifact folder: `/tmp/google-play-internal-v77-native-answer-action-fix-20260704-124252/`.
- Source commit: `6c3fbdef23d8ccf9bef90c26d7b6dea33c409b02` (`Fix native call answer handoff`), pushed to `origin/main`.
- Root cause: native `Answer` used a broadcast PendingIntent and then tried to launch the app Activity after clearing the notification, so outside-app/lock-screen Android could stop ringing without delivering the answer deep link to JS.
- Fix: native `Answer` now uses `buildActivityPendingIntent(context, data, "answer", 1)` and the chat route clears matching presented Android call notifications only after safe authenticated accept/decline handling.
- Validation passed: Deno checks, Expo Android prebuild, generated Kotlin compile, call/notification guards, proof scripts, `npm run typecheck`, `npm run validate:runtime`, `supabase db push --dry-run`, and diff checks.
- EAS Build `e01b708a-d049-421b-a16b-1bb1e5399e47` produced Android AAB versionCode `78`, versionName/runtime `1.0.0`, commit `6c3fbdef23d8ccf9bef90c26d7b6dea33c409b02`.
- EAS Submit `1a7f765c-2c34-4cab-8fb6-d10bb422e976` submitted v78 to Google Play internal testing only. No Play production submission happened.
- `R5CR120QCBF` updated through Google Play only and reads back package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `78`, versionName `1.0.0`, lastUpdateTime `2026-07-04 13:16:58`.
- `R3CXA0DS5JV` did not appear after non-destructive `adb kill-server` / `adb start-server`, Mac USB enumeration, and repeated `adb devices` polling. `adb devices -l` shows only R5 plus an emulator.
- Next exact step: recover `R3CXA0DS5JV` over USB/ADB without sideload, `adb install`, logout, clear data, uninstall, reinstall, or factory reset; update it through Google Play to v78; verify package/installer/version; then rerun the native Answer proof matrix.
- Required proof after R3 recovery: background voice Answer opens/joins and caller leaves ringing; background video Answer opens/joins and caller leaves ringing; native Decline still clears safely; stale/expired/declined notification cannot answer old call; same-thread Accept does not hit `This communication room is unavailable`; normal in-app outside-thread modal works; room-safe compact banner, Reply in Chat, and Leave room and answer still work.
- Do not touch Money Center, providers, live money, payouts/cashout, auth/RLS, broad WebRTC/media, or broad room routing unless a fresh installed proof shows a real app bug.

# V77 Native Chi'lly Chat CallStyle Remaining Closure

Current latest truth:
- Native Android Chi'lly Chat CallStyle/full-screen incoming-call work is installed-proof Partial, not Blocked, after the July 4 two-phone proof.
- Artifact folders: `/tmp/google-play-internal-v77-native-callstyle-fullscreen-proof-20260703-152217/`, `/tmp/google-play-internal-v77-native-callstyle-fullscreen-proof-20260703-152217/installed-v77-callstyle-proof-20260703-203844/`, and `/tmp/google-play-internal-v78-native-callstyle-active-incoming-fix-20260703-215118/installed-two-device-callstyle-proof-20260704-112837/`.
- Both `R5CR120QCBF` and `R3CXA0DS5JV` were visible/authorized and remained Google Play-installed v77 from `com.android.vending`; no sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.
- Supabase FCM secret setup is complete by secret name only (`FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`), with no secret value printed or committed.
- Closed in installed proof: background active voice CallStyle notification with `Answer` / `Decline`; background active video CallStyle notification with `Answer` / `Decline`; native Answer opens/joins valid voice/video calls; native Decline clears both sides; same-thread full incoming UI and Accept no longer hit `This communication room is unavailable`; normal Settings surface outside the thread gets the full incoming modal and Decline cleans up both sides.
- Environment proof: both devices had DND/Zen `0`; `chilly_chat_calls_fullscreen_v1` existed with high importance, ringtone audio attributes, and vibration.
- Remaining proof gaps: fresh room-safe regression was not rerun because fixture `BS-E2E-7561F256` now returns `Room not found`; missed-call timing needs a clean active-before-expire capture or actual timeout proof; locked-screen full-screen takeover was not separately proved beyond CallStyle `fullscreenIntent` and Settings full-screen permission readback.
- Do not create a new Play build, sideload, `adb install`, logout, clear data, uninstall/reinstall, mutate room state, touch Money Center/providers/live money/payouts/cashout, weaken auth/RLS, or rewrite WebRTC/media unless a fresh installed proof shows a real app bug.

# V77 Native Chi'lly Chat CallStyle / Full-Screen Proof Follow-Up

Current latest truth:
- Native Android Chi'lly Chat CallStyle/full-screen incoming-call work is installed-proof Partial in `docs/release/GOOGLE_SIGNED_V77_NATIVE_CALLSTYLE_FULLSCREEN_PROOF.md`.
- Artifact folders: `/tmp/google-play-internal-v77-native-callstyle-fullscreen-proof-20260703-152217/`, `/tmp/google-play-internal-v77-native-callstyle-fullscreen-proof-20260703-152217/installed-v77-callstyle-proof-20260703-203844/`, and `/tmp/google-play-internal-v78-native-callstyle-active-incoming-fix-20260703-215118/`.
- Source commit `fab16ef96368a637f96846846d4717d57d2ebb5e` is pushed and aligned with `origin/main`.
- Source now adds a bounded Expo config plugin that generates the native Android call-notification files during prebuild/EAS build: `USE_FULL_SCREEN_INTENT`, `chilly_chat_calls_fullscreen_v1`, a custom `ChillyChatFirebaseMessagingService`, Android `NotificationCompat.CallStyle.forIncomingCall`, native Answer/Decline actions, Settings full-screen call alert permission readback/settings route, and data-only incoming call push dispatch.
- Passive notification taps open an answerable incoming-call route. Only explicit native Answer attempts to accept, and the chat route verifies the requested `callInviteId` still matches the current ringing invite for the signed-in callee before mutating state.
- Both proof phones updated through Google Play only and read back package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `77`, versionName `1.0.0`.
- Both installed packages include/grant `USE_FULL_SCREEN_INTENT`, register `com.chillywood.mobile/.ChillyChatFirebaseMessagingService`, and expose `chilly_chat_calls_fullscreen_v1` with ringtone audio attributes and vibration. R5 Settings showed `Full-screen call alerts` = `On`.
- Latest active incoming-call fix is JS/Edge only and does not require a new native build while v77 remains installed: Android now registers its native FCM token alongside Expo, Settings can show a safe native call fingerprint, active incoming calls prefer direct FCM HTTP v1 data delivery with `nativeCallStyle=android_callstyle`, missed calls stay on the normal Expo notification path, and same-thread/native Accept re-reads the ringing invite and active communication room before accepting.
- Edge functions `notification-device-tokens` and `chilly-chat-call-dispatch` were deployed after source validation.
- EAS Update production Android runtime `1.0.0` published group `9e0d00e8-e6cc-40e0-a4f2-7e9712b2fc0f`, Android update `019f2b09-1d13-7090-b307-917d221b7c7b`, message `Fix native active incoming call delivery`.
- EAS Build `f888abdb-4154-40b8-91a3-2b410f58aa75` finished as Android App Bundle versionCode `77`, versionName `1.0.0`, runtime `1.0.0`, commit `fab16ef96368a637f96846846d4717d57d2ebb5e`.
- EAS Submit `47d90002-524f-41b7-968e-e975368d1285` and retry `f596f244-87c4-47bc-9561-2628f891bf37` to Google Play internal failed with: `You must let us know whether your app uses any full-screen intent permissions`.
- The same existing v77 AAB from EAS Build `f888abdb-4154-40b8-91a3-2b410f58aa75` was uploaded through Google Play Console internal testing. Play Console shows latest internal release `77 (1.0.0)` available to internal testers.
- App Content exposed `Full-screen intent`; declaration selected `Making and receiving calls`, opted in for pre-grant review, was saved, and Publishing overview shows the declaration change in review.
- Closed in installed proof: normal in-app outside-thread surface gets the full app-wide incoming-call modal with `Decline`, `Answer`, and `Reply in Chat`; Decline clears the caller to `No Active Call`.
- Partial/failed in installed proof: same-thread full incoming UI rendered, but Accept landed on `This communication room is unavailable` with `1 in call` / `Connecting` while the caller had already cleared. Background/outside-app call on R5 produced only a `Missed Chi'lly Chat voice call` notification under `chilly_chat_missed_calls`, with no Answer/Decline actions, while R3 still showed `1 in call`.
- Supabase FCM service-account blocker is cleared. Secret `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` exists by name only, `chilly-chat-call-dispatch` was redeployed, and no secret value was printed, committed, or documented. R5 Settings readback showed registered Expo/native call push status, a redacted native call fingerprint, `Full-screen call alerts` = `On`, and channel `chilly_chat_calls_fullscreen_v1`.
- Current blocker before installed closure: `R3CXA0DS5JV` was not visible in `adb devices` or Mac USB enumeration after non-destructive ADB server restarts, so two-phone proof could not be rerun.
- Next exact steps: recover R3 ADB/USB visibility without logout, clear data, uninstall/reinstall, sideload, or `adb install`; verify R3 remains Google Play-installed v77 from `com.android.vending`; verify standard/native call push registration on R3; then rerun locked-screen/background voice/video, native Answer/Decline, stale/expired call rejection, same-thread, normal in-app, and room-safe regressions on Google Play-installed v77 + verified OTA.
- Android 14+ full-screen intent permission, DND/Zen, notification permission, channel settings, and notification volume can still block full-screen or audible ring; however the current blocker is not just Android suppression because the active background call did not produce an active CallStyle notification with Answer/Decline actions.
- Do not use source/Edge/OTA as final proof, sideload, `adb install`, logout, clear data, uninstall/reinstall, Play production, provider mutation, live money, payouts/cashout, Money Center changes, auth/RLS weakening, WebRTC/media rewrites, or room routing changes.

# V76 Modern Chi'lly Chat Ringtone Proof Follow-Up

Current latest truth:
- Chi'lly Chat modern ringtone asset replacement and outside-app call notification fix are Partial overall in `docs/release/GOOGLE_SIGNED_V76_MODERN_CALL_RINGTONES_INSTALLED_PROOF.md`.
- Artifact folder: `/tmp/google-play-internal-v76-modern-call-ringtones-installed-proof-20260703-121053/`.
- Existing ringtone names and preference keys are preserved: Chi'lly Ring, Skyline Pulse, Theater Bell, Velvet Knock, Quiet Buzz, and Classic Phone.
- The underlying app-owned WAV assets were replaced with original deterministic generated ringtone motifs using `scripts/generate-chilly-chat-modern-ringtones.mjs`.
- `npm run guard:chilly-chat-ringtone-assets` verifies app assets and Android raw copies match, remain supported WAV files, have bounded duration/loudness, keep mapping/preference keys, and use no third-party ringtone files.
- Both `R5CR120QCBF` and `R3CXA0DS5JV` are attached/authorized and remain Google Play-installed v76 from `com.android.vending`.
- Latest pushed app-side fix is `d23339bdbd251b4d070047d2dbe81c1e8620e3ab`. EAS Update production Android runtime `1.0.0` group `0db0be81-fd60-49a1-ab7f-8bfb169122f4`, Android update `019f2909-5188-7ff6-82eb-907e47e3dd48`, plus redeployed `chilly-chat-call-dispatch`, move outside-app calls to `chilly_chat_calls_v3`.
- `chilly_chat_calls_v3` uses Android default notification sound, high/max importance, and vibration so v76 no longer depends on the old weak bundled raw channel sound for outside-app calls.
- Both phones have Zen/DND off. `R5CR120QCBF` has nonzero notification volume and proved a sound/vibration-capable alerting outside-app call notification that taps into the answerable incoming-call UI. `R3CXA0DS5JV` has Android notification stream volume `0`; it can vibrate and show the call notification, but Android will not play audible notification sound on that device until notification volume/channel settings allow it.
- Remaining proof/action: either raise/verify Android notification volume/channel sound on R3 and rerun outside-app audible ring proof, or keep R3 as documented device-setting Partial. If the owner wants continuous phone-call-like ringing/full-screen lock-screen call behavior outside the app, plan a native Android call-style/full-screen intent/channel build; OTA cannot loop an in-app ringtone from a backgrounded/killed JS runtime or replace already-installed `res/raw` assets.
- Do not use copyrighted ringtone files, sideload, `adb install`, logout, clear data, uninstall/reinstall, Play production, provider mutation, live money, payouts/cashout, auth/RLS weakening, Money Center changes, room routing changes, or WebRTC/media rewrites.

# V76 Incoming Call Surface Behavior Follow-Up

Current latest truth:
- Incoming Chi'lly Chat call surface behavior is source-fixed and OTA-published, but installed actual-user flow proof remains Partial in `docs/release/GOOGLE_SIGNED_V76_INCOMING_CALL_SURFACE_BEHAVIOR_PROOF.md`.
- Artifact folder: `/tmp/google-play-internal-v76-incoming-call-surface-behavior-20260703-005357/`.
- Source commit: `37b4c12cbe0b95702849ecba1e8a7149af4b334a`.
- EAS Update: production Android runtime `1.0.0`, group `cb225e0f-37f7-40b3-a93e-127bfd64d97e`, Android update `019f268e-c117-7e3a-8aff-7e177037e1ac`.
- Source behavior now suppresses duplicate app-wide UI when the receiver is already in the same chat thread, shows a full app-wide incoming-call modal on normal non-room app surfaces, and preserves the compact room-safe incoming-call banner on Party Room / Watch-Party Live / Live Stage surfaces.
- Both proof phones remain Google Play-installed v76 from `com.android.vending`; both saw the OTA available/download path and after two safe restarts reported no newer update available.
- Android call-channel readback shows `chilly_chat_calls_v2` with high/max importance, `chilly_ring`, and vibration enabled.
- Still Partial: the same-thread, normal outside-thread, room-safe, and background answer/decline matrix was not physically rerun after the OTA. R3 was visible over ADB but on the lock screen during the final capture window.
- Next proof should unlock/foreground both devices without logout or data reset, then rerun: same-thread voice/video, Home/Settings/Profile/Platform outside-thread voice/video, room-safe Party Room/Live Stage incoming call, and background notification tap-to-answer/decline.
- If background notification still does not ring/vibrate, inspect Android notification permission, DND, user channel settings, OEM restrictions, and whether native Android full-screen intent/call-style work is required. Do not claim full phone-call-like background behavior from JS-only OTA if Android suppresses it.
- No Play build, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, provider mutation, live money, payout, cashout, auth/RLS weakening, or private identifier exposure happened.

# V76 Direct Chat Video Join Latency Follow-Up

Current latest truth:
- Direct Chi'lly Chat video-answer latency is Closed for the reported Android two-phone installed issue in `docs/release/GOOGLE_SIGNED_V76_DIRECT_CHAT_VIDEO_JOIN_LATENCY_PROOF.md`.
- Artifact folder: `/tmp/google-play-internal-v76-video-join-latency-proof-20260702-171458/`.
- Source commits: `8c110ad4193bd9928355b72e6b7f8146c03a7286` and `9b6ab72d05a6b77d09a341945d47b9018f87e44d`.
- Final OTA: production Android runtime `1.0.0`, group `10fc0b00-df0a-4fc8-9764-c27095a6d75d`, Android update `019f24f3-cb2f-7a52-baa2-0881849c32e5`.
- First OTA was not Closed because R3 caller still showed `1 in call` at the +8 second capture and only split by +15 seconds.
- Final installed proof after two safe app restarts on both phones: R3 started a normal visible Direct Chat video call, R5 answered from the real incoming banner, and both Google Play-installed v76 phones showed `2 in call`, split layout, local video, and remote video by the +4 second capture; +8 second captures remained stable.
- End Call returned R3 to `No Active Call`; R5 returned Home. No sideload, `adb install`, logout, uninstall, reinstall, clear data, Play build, Play production submission, provider mutation, live money, payout, cashout, auth/RLS weakening, or private identifier exposure happened.
- This does not close iOS/tablet/foldable, background push, or broader room-notification matrices.

# V76 UI Consistency Cleanup Follow-Up

Current latest truth:
- V76 UI consistency cleanup is Closed in `docs/release/GOOGLE_SIGNED_V76_UI_CONSISTENCY_CLEANUP.md`.
- Artifact folders: `/tmp/google-play-internal-v76-ui-consistency-cleanup-20260702-161301/` and `/tmp/google-play-internal-v76-ui-consistency-cleanup-two-device-camera-proof-20260702-164050/`.
- Final source commit for the media-label closure: `83e93150937a633e8c844fbf4962ebe70b407cf9`.
- Final OTA: production Android runtime `1.0.0`, group `f361c068-40b9-460f-99eb-70ba0ec6ff73`, Android update `019f24ce-6808-7cd9-87d3-8e3ebd1bde05`.
- Closed on Google Play-installed v76 + OTA: Chat percent-encoded text renders readable decoded spaces in inbox preview and opened thread; Settings header uses safe identity instead of full raw email; Manage Premium sandbox copy hierarchy is clearer while preserving sandbox/no-money safety; voice calls no longer show fake `Video connected`; video calls show local/remote renderable video on both phones; Camera Off -> On recovers to `Video connected` / `Cam On`; End Call clears both phones to `No Active Call`.
- No rebuild was needed. Safety stayed intact: no Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, Money Center refactor, provider mutation, live money, payout, cashout, auth/RLS weakening, or private identifier exposure.

# Google-Signed v76 Notifications / Money Center Follow-Up

Current latest truth:
- Combined Google-signed v76 three-result installed proof is Closed in `docs/release/GOOGLE_SIGNED_V76_THREE_RESULT_PROOF_AND_UI_CONSISTENCY.md`. Artifact folder: `/tmp/google-play-internal-v76-three-result-proof-and-ui-consistency-20260702-103354/`.
- Closed in installed proof: full six-row creator transaction notification matrix routes to Money Center Transactions; Premium-backed gates open Manage Premium / subscribe instead of dead-ending on Retry Offer Lookup; voice calls do not show fake `Video connected`; video calls render real local/remote video on both phones and clear to `No Active Call`; bell tray rows show timestamps and timestamped accessibility labels; Settings no longer renders Activity rows, while Bell Activity owns important/recent rows, timestamps, read state, dismiss, and routing.
- Fixture rows used for the creator matrix are sandbox/proof/not-payable UI routing proof only. They do not prove purchase generation, grant access, create payout/cashout/payable balances, mutate providers, or enable live money.
- Source correction after owner direction: Settings no longer needs or renders Activity because the bell icon/tray is the notification system. Settings now manages notification preferences, device push registration, Register Device, Refresh, and call sound only; Bell Activity owns important/recent records, timestamps, read state, dismiss, and routing. EAS Update production Android runtime `1.0.0` published group `f402a647-a04a-4920-9543-c9e3b7499f3e`, Android update `019f236d-1032-79d5-a333-ec0a4a7f62ca`, app-source commit `9c77ceaa72d574d9745b9d139630ea907b54c0f8`.
- July 2, 2026 follow-up artifact folder: `/tmp/google-play-internal-v76-final-room-notification-profile-bell-closure-20260702-071900/`.
- Both `R5CR120QCBF` and `R3CXA0DS5JV` are visible over ADB and remain Google Play-installed v76 (`package=com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`).
- Latest OTA group `827b6eed-02fd-43be-8b38-f561392ea9e2`, Android update `019f2331-8f3b-7d34-8abb-a665efbdc95d`, runtime `1.0.0`, commit `e7681efc01fa6d85399079e92eccc0e3c452445c`, is the latest source/OTA used for installed proof.
- Closed now: Profile bell top-right alignment, Studio bell non-regression, Waiting Room tray, Live Stage tray shell, Reply in Chat, Leave room and answer, and stale Android incoming-call notification cleanup after Decline. The final Decline proof shows `incoming_call_notifications=0` and `missed_call_notifications=0`; R3 caller returned to `No Active Call`.
- Still Partial: full creator transaction notification route matrix. The installed no-logout session exposed `Tip received` and `Event Pass sold`; both opened Money Center Transactions after Google Play sandbox Premium. The other four creator row types were not visible/proved physically in this pass.
- Do not reopen Money Center manager visibility. Do not rebuild unless a native/runtime change is required and owner approves. Do not claim all six creator notification rows Closed until all six visible rows are tapped on the installed app or safe current-account UI fixtures are mirrored and clearly documented as sandbox/proof/not-payable routing proof only.
- R5 used Google Play sandbox Premium through Manage Premium -> Start Sandbox Premium Test -> Subscribe. This is sandbox/test entitlement only. `liveMoneyEnabled` remains OFF; payouts/cashout/payable balances/provider production settings remain OFF.

Current lane doc:
- `docs/release/GOOGLE_SIGNED_V76_NOTIFICATIONS_MONEY_CENTER_PROOF.md`
- Artifact folder: `/tmp/google-play-internal-v76-notifications-money-center-proof-20260701-0805/`

Current truth:
- Two-device recovery follow-up artifact folder: `/tmp/google-play-internal-v76-two-device-final-closure-20260701-165920/`.
- `R3CXA0DS5JV` is recovered and visible over ADB again. `R5CR120QCBF` is also visible. Both remain Google Play-installed v76 (`package=com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`) with no sideload, `adb install`, logout, uninstall, reinstall, or clear data.
- Published OTA remains group `39609392-ad93-4bcb-86c0-b8b639daf393`, Android update `019f1f9f-b6e3-786c-b16f-97ab49d851ea`, runtime `1.0.0`, source fix commit `05446c8832004336bb42ee6d21f29fb5b1ed8cf4`.
- R3 proved the expected OTA bundle/update/group signals after safe launch. R5 did not prove that OTA loaded after repeated safe launch/update checks; the latest R5 safe summary showed `CheckCompleteUnavailable` and did not show the expected update id, group, or bundle hash.
- Do not claim final installed closure from this state. The current owner/creator proof account is on R5, so the creator notification route fix cannot be counted installed-Closed until R5 loads the fixed OTA or an owner-approved delivery path includes it. Continue only with safe OTA uptake checks or owner-approved delivery; do not rebuild automatically.
- Once both phones prove the fixed OTA or later approved code is active, rerun only the remaining sections: creator notification rows -> Money Center Transactions, Waiting Room tray, Live Stage tray, Reply in Chat, Leave room and answer, and stale actionable call notification cleanup after Decline.
- Final v76 notification/room/call closure follow-up doc: `docs/release/GOOGLE_SIGNED_V76_FINAL_NOTIFICATION_ROOM_CALL_CLOSURE.md`.
- Final closure artifact folder: `/tmp/google-play-internal-v76-final-notification-room-call-closure-20260701-163510/`.
- Source fix commit `05446c8832004336bb42ee6d21f29fb5b1ed8cf4` is pushed and aligned with `origin/main`. It fixes the creator notification Premium-gate race and stale actionable Android Chi'lly Chat call notification cleanup.
- OTA was published to production/runtime `1.0.0`: group `39609392-ad93-4bcb-86c0-b8b639daf393`, Android update `019f1f9f-b6e3-786c-b16f-97ab49d851ea`.
- `R5CR120QCBF` remains Google Play-installed v76 from `com.android.vending`; its APK manifest confirms production channel/runtime `1.0.0`. The first launch after publish logged the new OTA as available, downloaded to `DownloadProgress 1.0`, marked pending, and handled by an Expo Updates reset. Later launches logged `CheckCompleteUnavailable` / `No update available`, consistent with the update no longer being offered after download/apply handling. Treat this as update-state proof only, not final installed UI flow closure.
- `R3CXA0DS5JV` was not visible over ADB during the final closure attempt. Two-device installed proof remains blocked until R3 is attached/authorized again.
- Next proof should start by verifying both devices, then confirming OTA group `39609392-ad93-4bcb-86c0-b8b639daf393` or later is active enough for UI proof on each tested phone. Do not rebuild unless OTA cannot target v76 for a native/runtime reason and owner approves.
- Once both phones are available and the fixed app is active, rerun only the remaining installed sections: creator notification rows -> Money Center Transactions, Waiting Room tray, Live Stage tray, Reply in Chat, Leave room and answer, and stale actionable call notification cleanup after Decline.
- Remaining Google-signed v76 notification/room/push closure artifact folder: `/tmp/google-play-internal-v76-remaining-notification-room-push-closure-20260701-154412/`.
- Repo/origin aligned at `c6b23426b4b82d87e452bd7f90aea42a851a6d96` for the remaining-proof pass. Both proof phones stayed Google Play-installed v76 (`installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`) with no sideload, `adb install`, logout, uninstall, reinstall, or clear data.
- Closed in the remaining-proof pass: current-account buyer notification routes for Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, Event Pass, and Tip receipt; current-account missed-call route to Chat without auto-answer/camera/mic; current-account event-starts-soon route to Event; actual delivered Android Chi'lly Chat call push; active Party Room room-safe tray open/close; incoming Chi'lly Chat call banner while receiver was inside Party Room with Decline preserving room state.
- Still Partial after the remaining-proof pass: creator notification rows hit the Premium gate before Money Center Transactions on the current creator/owner account; Waiting Room and Live Stage tray were not separately reached; `Reply in Chat` and `Leave room and answer` were not separately exercised from the room-safe call banner; after Decline, the delivered Android call notification could still be tapped while the caller room remained active, although caller-side End Call cleared both devices to `No Active Call` and removed active Chi'llywood notification records.
- Validation for this pass is clean under `/tmp/google-play-internal-v76-remaining-notification-room-push-closure-20260701-154412/validation/`.
- Repo/origin aligned at `2dfaa9219a25a74e27c0357b22e1497642a1dbcd` before the final push-registration persistence documentation update.
- Google Play internal v76 includes `e4f88365d33dcf0655597041800985131c045e40`.
- Both physical phones read back Google Play install: package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`.
- Runtime-compatible OTAs published/proved on runtime `1.0.0`: Platform Studio premium snapshot group `1c4834a5-439d-4e86-93b0-1eb0de8d8aac`, Android update `019f1def-e5bc-70fc-baca-790cdde0ab98`, commit `0bb2ba928e05773567b5d3868fbcc502334f7730`; push registration persistence group `190e756f-4666-4af0-90e6-1092d4f6b065`, Android update `019f1efa-3a2c-74d3-8672-47b8efc7928e`, commit `f26f1236957edb635a3e0ed632295d4a31dbd638`; push Refresh action group `84dd1be6-08e9-4405-b2bc-e564a99a0512`, Android update `019f1f0a-755b-75c8-9bda-c4f2e8fdd1cc`, commit `2dfaa9219a25a74e27c0357b22e1497642a1dbcd`.
- Installed Money Center manager visibility is Closed: Open Ways to Earn, Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, Event Pass, and Cashout readiness all showed visible manager/readiness panels.
- Physical notification completion artifacts are under `/tmp/google-play-internal-v76-notifications-money-center-proof-20260701-0805/physical-notification-completion-20260701-090520/`.
- The completion pass Closed the visible installed call notification row in Settings Activity and tray: Important / Action Needed displayed, read state did not remove the row, tapping opened Chi'lly Chat without auto-answer or active call state, and dismiss hid the row.
- The completion pass Closed normal bell/tray shell behavior on `R3CXA0DS5JV` for Platform Studio / Money Center, Home, Explore, Live, and Saved. Trays opened and showed the safe empty state after dismiss.
- Android push registration and registration persistence are Closed on both `R5CR120QCBF` and `R3CXA0DS5JV`: Settings reads backend status on load, `Register Device` reads back after writing, both devices show `Push Registered` / `Registered` after reopening/expanding Settings, and in-app Notifications / Activity remains account-level and visible independently of device push registration.
- Owner correction: the installed Refresh button was not counted as Closed. Source commit `2dfaa9219a25a74e27c0357b22e1497642a1dbcd` fixes Refresh with a dedicated `push-refresh` busy state and backend readback handler, but both physical devices logged `No update available` during the refresh-action OTA proof. Installed Refresh-button proof remains Partial until the OTA is actually loaded or a later Play build includes it.
- Push persistence artifacts are under `/tmp/google-play-internal-v76-push-registration-persistence-20260701-133921/`.
- R5 completed Google Play sandbox Premium via Manage Premium -> Start Sandbox Premium Test -> Subscribe, then Platform Studio opened through the same installed session after the premium snapshot OTA.
- Cashout remains not live and not payable; `liveMoneyEnabled` remains OFF; payouts/cashout remain OFF.
- Required validation for the earlier physical notification completion passed under `/tmp/google-play-internal-v76-notifications-money-center-proof-20260701-0805/physical-notification-completion-20260701-090520/validation-20260701-091457/`; push persistence validation adds focused proof/guard coverage for backend readback, account/install scoping, and no raw-token exposure.

Remaining Partial items:
- Installed physical Tips creator setup save replay.
- Installed physical viewer Sandbox Tip CTA -> Tip Sheet replay.
- Buyer and creator seeded money notification route rows. They were not visible under the current no-logout signed-in `R3CXA0DS5JV` account during the completion pass.
- Prepared missed-call fixture row. Only the visible incoming-call notification row was routed to Chat without auto-answer.
- Prepared event-starts-soon fixture row. It was not visible under the current no-logout account during the completion pass.
- Room-safe tray behavior in real Watch-Party Waiting Room, Party Room, and Live Stage.
- Incoming Chi'lly Chat call while in room.
- Actual push delivery only if safely generated; do not claim push without delivered push evidence.

Safety rules for the next pass:
- Do not submit Play production.
- Do not sideload or `adb install`.
- Do not uninstall, reinstall, clear data, or logout unless explicitly approved.
- Do not enable live money, payouts, cashout, payable balances, or provider production settings.
- Do not count seeded notification rows as purchase-generation proof.
- Do not claim actual push delivery unless an actual push is delivered and captured.

# Chi'lly Chat Google-Signed v60 Direct Chat + Call Follow-Up

Current lane doc:
- `docs/release/LOCAL_EMULATOR_NOTIFICATIONS_MONEY_CENTER_PROOF.md`
- `docs/release/CREATOR_MONEY_NOTIFICATIONS_ACTIVITY_PROOF.md`
- `docs/release/CREATOR_MONETIZATION_SETUP_CASHOUT_READINESS.md`
- `docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md`
- `docs/release/CHILLY_CHAT_GOOGLE_PLAY_INTERNAL_CALL_CLOSURE.md`
- `docs/release/CHILLY_CHAT_END_TO_END_CALL_INITIATION_PROOF.md`
- `docs/release/VALIDATION_BLOCKER_CLEANUP.md`
- `docs/release/PARTY_ROOM_LIVE_STAGE_ROUTE_SEMANTICS.md`
- `docs/release/GOOGLE_SIGNED_V64_CHAT_THREAD_HIDE_PROOF.md`
- `docs/release/GOOGLE_SIGNED_V65_HOME_SETTINGS_CHAT_UI_PROOF.md`
- `docs/release/HEADER_CONTROL_CONSISTENCY_CLEANUP.md`
- `docs/release/GOOGLE_SIGNED_V66_HEADER_CHAT_UI_PROOF.md`
- `docs/release/HEADER_PROFILE_AVATAR_FLICKER_FIX.md`
- `docs/release/GOOGLE_SIGNED_V68_CREATOR_MONETIZATION_E2E_PROOF.md`

Google Play fixture readiness:
- Status: Ready to Build for installed UI Activity/routing proof.
- Route/account packet: `/tmp/google-play-proof-fixture-packet-20260630-232419/`.
- Notification-record packet: `/tmp/google-play-notification-record-fixtures-20260630-233355/`.
- Repo/source/backend validation is clean at `98ec176ed4f9f24aaff9e7127d877301670d0998`.
- Both physical devices were already visible/authorized and currently have Google Play-installed v74 from `com.android.vending`.
- Existing ignored proof-account config authenticates the owner/operator creator, viewer, premium, and two-device call accounts; no credentials are documented here.
- Owner/operator creator has Money Center access and six sandbox/not-payable creator configs.
- Exact route fixtures are recorded privately in the packet; public result: Channel, Channel Studio, Paid Video, Watch-Party Seat Pass, Event Pass, Channel Subscription, VIP, Tips, Chat, and Settings route/backend resolver checks are ready.
- Watch-Party Seat Pass is the visible product wording and routes to the Party Room path, not Live Stage.
- Fourteen sandbox/proof/not-payable notification rows are ready for installed Activity/routing/retention proof: six buyer creator-money rows, six creator sale/support rows, one missed Chi'lly Chat call row, and one event-starts-soon row.
- The seeded notification rows are UI fixtures only; they are not counted as proof that purchases generated notifications. They do not grant access, create payouts/cashout/payable balances, mutate providers, or prove push delivery.
- Push dispatch fixture is ready, but Android device-token registration and actual push delivery remain pending installed Google Play proof.
- One Google Play internal proof build can proceed for visible device closure, while purchase-generation and push-delivery claims must be scoped to what is actually tested.

Local-source notifications / Money Center proof:
- Status: Partial/mostly-Closed for local web; installed-app proof remains Pending.
- Android emulator/dev-client proof remained blocked because the available emulator app did not request Metro/local source.
- Local web fallback loaded current source and reached Money Center through a legitimate E2E owner/operator account.
- Money Center human-tap proof passed for Open Ways to Earn, Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, Event Pass, and Cashout / Payout readiness.
- Settings Activity and the bell tray read real notification records.
- Home, Explore, Live, Saved, and Platform Studio show the icon-only bell with real unread count.
- Watch-Party Waiting Room shows a room-safe bell and no full normal header.
- Actual room tray-open behavior, LiveKit camera/mic preservation, Android push/device behavior, and two-device incoming Chi'lly Chat call behavior still require physical/Play proof.
- No EAS build, Play build, sideload, physical-device adb install, physical-device clear data, physical-device logout, live money, payout, cashout, provider mutation, auth/RLS weakening, or Premium bypass happened.

Important Notifications / Activity retention:
- Status: source-Closed; installed-app proof remains Pending.
- Important notifications remain easy to find until dismissed, handled, revoked, or expired.
- Read state does not remove important notifications.
- Dismiss hides notifications.
- Expired notifications are shown as expired/history rather than silently disappearing.
- Six creator-money flows are Important / Action Needed where actionable.
- Chi’lly Chat calls remain call/chat-owned and do not turn Chat into a money notification ledger.
- Seat Pass visible wording is enforced.
- Settings Activity and the bell tray read active important notifications separately from recent activity.
- `liveMoneyEnabled` remains OFF.
- Payouts and cashout remain OFF.
- No auth/RLS/money permission weakening happened.
- No provider/live-money mutation happened.

Creator-money notifications/activity:
- Status: source-Closed; installed-app proof remains Pending.
- Creator-money notifications are backed by real notification records.
- Notifications guide users to routes; they do not grant access.
- Destination routes re-check access/grant/status.
- Buyer and creator notifications are separate.
- Money Center remains the creator business home.
- Chat remains conversation-only and is not the creator-money notification ledger.
- Buyer-side notification records are wired for Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, Event Pass, and Tips.
- Creator-side notification records are wired for Paid Video sold, Seat Pass sold, Channel Subscription started, VIP pass sold, Event Pass sold, and Tip received.
- Tips do not unlock anything.
- Premium remains the app-wide subscription flow.
- Android/Expo push dispatch is source-prepared behind notification records, preferences, Android token eligibility, and dedupe checks; installed push proof remains Pending.
- Push is Android/Expo only where proven; iOS/APNs remains later unless separately implemented.
- `liveMoneyEnabled` remains OFF.
- Payouts and cashout remain OFF.
- No real payout, transfer, withdrawal, payable balance, or provider mutation was created by notifications.
- No auth/RLS/money permission weakening happened.
- Source fixed is not installed-app proof.

Creator Tips v68 installed blocker source fix:
- Status: source-fixed; installed-app proof remains Pending for a later Google Play internal build.
- v68 installed proof was Partial because Tips failed.
- Creator-side Tips Manager save showed `Tip settings could not be saved. Try again later.`
- Viewer-side Platform showed Sandbox Tip CTA, but tapping it did not open the tip sheet.
- Tips creator setup save is now source-fixed.
- Money Center saves the `creator_tip_sandbox_099` sandbox/not-payable config before legacy public tip-status sync.
- Legacy public tip-status sync is non-blocking for sandbox setup state.
- Saved Tips config readback drives the Money Center Tips setup state.
- Sandbox Tip CTA opens the tip sheet.
- The Sandbox Tip CTA test hook is attached to the actual tappable element.
- Tips remain sandbox/not-payable.
- Tips do not unlock content, Premium, VIP, subscription, room, event, LiveKit authority, payout, cashout, or payable balance.
- `liveMoneyEnabled` remains OFF.
- Payouts and cashout remain OFF.
- Source fixed is not installed-app proof.
- No auth/RLS/money permission weakening happened.
- No provider/live-money mutation happened.

Creator monetization setup and cashout readiness activation:
- Status: source/backend-Closed for creator and viewer source wiring; installed-app proof remains Pending if requested.
- Source route/button wiring is fixed.
- Money Center is the single creator monetization home.
- `/creator-monetization-setup` is compatibility-only and lands in Money Center Offers setup.
- Each creator monetization flow has a real setup action, not stale proof copy.
- Creator and viewer source wiring pairs are proved for each creator monetization flow.
- Paid Video creator setup maps to `/player/[id]`.
- Tips creator setup maps to the creator-surface tip CTA / tip sheet.
- Watch-Party Seat Pass creator setup maps to `/watch-party/[partyId]` and not Live Stage.
- Channel Subscription creator setup maps to `/channel-subscription/[creatorId]` and not `/subscribe`.
- VIP creator setup maps to `/vip-pass/[creatorId]` and stays creator-specific.
- Event Pass creator setup maps to `/event/[eventId]`; terminal/unsafe event states are denied by `20260630091500_paid_event_pass_terminal_event_status_guard.sql`.
- Cashout/Payout has no viewer-side purchase flow.
- Cashout readiness is reachable, but real cashout is not live.
- Creator monetization setup is usable in sandbox/not-payable mode.
- Creator setup does not mean live money is active.
- Creators can access cashout readiness, but real cashout is not live.
- Cashout readiness does not execute payouts.
- No real payout, transfer, withdrawal, or payable balance is created.
- `liveMoneyEnabled` remains OFF.
- Payouts and cashout remain OFF for production money movement.
- Saved creator configs are sandbox/not-payable.
- Production sales require owner/provider activation.
- Production cashout requires Stripe/live provider approval, tax/KYC readiness, fraud/support/legal review, and owner approval.
- Premium remains the app-wide subscription flow.
- Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, and Event Pass are creator monetization flows.
- Do not show proved/readiness boxes instead of usable setup controls.
- Source fixed is not installed-app proof.
- No auth/RLS/money permission weakening happened.
- No provider/live-money mutation happened.

Header profile avatar flicker fix:
- Status: source-Closed.
- Root cause: the shared tab header profile/avatar control could mount with empty profile state during tab changes, especially after Saved remounted from its loading state, so the initials fallback rendered before cached/remote profile hydration replaced it with the real avatar.
- The profile/avatar hydration path now keeps a shared last-known header profile snapshot, seeds it from Home, reads cached local profile before remote revalidation, and updates only when the profile resolves.
- Profile/avatar fallback must not flash while the real avatar is still loading.
- Last known avatar should remain visible during profile revalidation.
- Fallback avatar is only valid after profile loading completes and no avatar exists.
- Home/Explore/Live/Saved header layout remains unified.
- Source fixed is not installed-app proof.
- No auth/RLS/profile permission weakening happened.
- No provider/live-money mutation happened.
- `liveMoneyEnabled` remains OFF.

Google-signed v66 Header + Chat UI proof:
- Status: Closed.
- EAS Build `e4f13ffc-eb68-4e39-9605-277b4332dcee` / EAS Submit `262c27f6-19ef-4d68-aedd-92bce42b81f2` delivered commit `0373e99220e3094b304c81651e6c65ec744c2d8b` to Google Play internal testing as versionCode `66`, versionName `1.0.0`.
- `R5CR120QCBF` and `R3CXA0DS5JV` updated only through Google Play internal testing and both read back package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `66`, versionName `1.0.0`.
- Home is the canonical header style.
- Settings is icon-only.
- The visible word Settings must not appear on Home, Explore, Live, or Saved top controls.
- Settings accessibility label remains Settings.
- Profile/avatar control sits alone on the right.
- Header controls must not overlap page labels, hero text, or content.
- Explore, Live, and Saved mirror Home's header-control treatment.
- Installed proof passed Home, Explore, Live, and Saved headers on both phones and proved Settings opened from each tab.
- The MESSAGE THREAD / Chat stays primary card is removed.
- Direct thread remains message-first.
- Composer, Voice Call, and Video Call remain available.
- Source fixed is not installed-app proof.
- Google Play internal install is not enough without actual user flow proof.
- `installerPackageName` must be `com.android.vending`.
- Sideloaded APK proof is not accepted.
- No logout, uninstall, reinstall, or clear-data happened.
- No auth/RLS/chat/account-status permission weakening happened.
- No provider/live-money mutation happened.
- `liveMoneyEnabled` remains OFF.

Header control consistency cleanup:
- Status: source-Closed.
- Home is the canonical header-control reference.
- Explore, Live, and Saved now use the shared `MainTabTopBar` with the Home layout: compact icon-only Settings gear on the left beside the tab label, accessibility label `Settings`, no visible Settings word, and compact Profile avatar/icon alone on the right.
- Settings and Profile controls now share the Home visual system for shape, size, border/background treatment, padding, alignment, edge spacing, and safe-area placement.
- The prior Explore-style top-right Settings/Profile cluster is removed.
- `guard:navigation-terminology-policy` now protects the shared top-bar label group so future tabs cannot drift back to the wrong layout.
- The large `MESSAGE THREAD` / `Chat stays primary` direct-thread card remains removed from source.
- Direct thread remains message-first with composer, Voice Call, Video Call, history, and compact recent-call rows intact.
- Source fixed is not installed-app proof.
- No auth/RLS/chat/account-status permission weakening happened.
- No provider/live-money mutation happened.
- `liveMoneyEnabled` remains OFF.

Home Settings + Direct Thread UI cleanup:
- Status: Partial for Google-signed v65 installed proof.
- EAS Build `3a5e65e3-352e-4c72-bc89-2347474496e2` / EAS Submit `482a1080-8a7a-4c86-9f79-64ea13b7f82a` delivered commit `a38e5ac5587591fab2ed4a9308c8dd90d46005a0` to Google Play internal testing as versionCode `65`, versionName `1.0.0`.
- `R5CR120QCBF` updated through Google Play internal testing and read back package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `65`, versionName `1.0.0`, and lastUpdateTime `2026-06-29 12:23:25`.
- R5 installed proof passed the Home top Settings requirement: Home Settings control is icon-only, the visible word Settings does not appear on the Home top control, accessibility label remains Settings, and the Settings icon does not overlap `HOME` or hero text.
- Tapping the Home Settings icon opened `/settings` and the signed-in session remained intact.
- Explore/Live/Saved installed captures remain Pending because `R5CR120QCBF` became ADB unauthorized before those flows were captured.
- v65 direct-thread installed proof remains Pending because ADB authorization was lost before a direct-thread capture could be completed.
- `R3CXA0DS5JV` was not visible to ADB during this proof window.
- Home now places a compact icon-only Settings gear in the left header cluster beside `HOME`, with accessibility label `Settings`, no visible Settings word, and no oversized pill treatment.
- The shared Explore/Live/Saved top bars also use compact icon-only Settings controls instead of the heavier text pill treatment.
- Tapping the Settings icon still routes to `/settings`.
- Direct chat threads no longer show the large `MESSAGE THREAD` / `Chat stays primary` explainer card.
- Header identity, Voice Call, Video Call, recent-call timeline rows, message history, composer, and hide/reopen behavior remain in place.
- Messages and thread content start higher, so the direct thread reads as message-first instead of tutorial/status-first.
- Source fixed is not installed-app proof.
- Google Play internal install is not enough without actual user flow proof.
- `installerPackageName` must be `com.android.vending`.
- Sideloaded APK proof is not accepted.
- No auth/RLS/chat/account-status permission weakening happened.
- No service-role chat/social proof was counted.
- No provider/live-money mutation happened.
- `liveMoneyEnabled` remains OFF.

Google-signed v64 Chi’lly Chat delete/hide conversation proof:
- Status: Closed.
- EAS Build `c3fd4029-48b4-49ad-a1a4-7a33fbfbad84` / EAS Submit `cbcaae0e-650e-4c5d-a3c7-9b5ab819a8c1` delivered commit `5c21c3b4282fa45a2f62106deba68d944b6024e4` to Google Play internal testing as versionCode `64`, versionName `1.0.0`.
- `R5CR120QCBF` installed from Google Play with package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `64`, and lastUpdateTime `2026-06-29 02:32:57`.
- `R3CXA0DS5JV` was recovered, updated only through Google Play internal testing, and read back package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `64`, versionName `1.0.0`, and lastUpdateTime `2026-06-29 08:20:56`.
- Actual-user R5 proof passed for long-press action sheet, Delete from my inbox, confirmation copy, per-user hide, preserved signed-in state, Search → Chi’lly Chat reopen/unhide of the same existing thread, preserved message history, composer, Voice Call, Video Call, and duplicate prevention.
- R3/R5 completion proof passed: R3 hid the `user230455` direct thread only from its own inbox, R5 retained the same thread and message/call history, R5 sent a new proof message in that existing thread, and the hidden thread reappeared on R3 with the same thread id and new message preview.
- Delete from my inbox is a per-user hide, not a hard delete.
- The other participant’s copy is not deleted.
- Message and call history are preserved.
- Hidden direct threads must not create duplicate direct threads.
- Profile/Search → Chi’lly Chat must reopen the existing direct thread.
- New message reappear is Closed only if a hidden thread reappears after newer message activity.
- Proof Normal / @user230456 is a legitimate separate proof account/thread and may be hidden from the tester inbox without renaming or merging.
- Proof Normal / @user230456 was not mutated in the completion run.
- Source fixed is not installed-app proof.
- Google Play internal install is not enough without actual user flow proof.
- `installerPackageName` must be `com.android.vending`.
- Sideloaded APK proof is not accepted.
- No logout, uninstall, reinstall, or clear-data happened.
- No auth/RLS/chat/account-status permission weakening happened.
- No service-role chat/social proof was counted.
- No provider/live-money mutation happened.
- `liveMoneyEnabled` remains OFF.

Chat thread hide final hardening audit:
- Status: Closed for source/backend hardening; friendly active-call UI copy is source-fixed and requires future Google Play internal v65+ installed proof if product wants installed proof of that exact copy.
- Migration `20260629140032_guard_active_chat_thread_hide.sql` is applied remotely and makes `hide_chat_thread_from_inbox(text)` refuse active-call threads with `active_communication_room_id` instead of silently hiding receiver-visible call state.
- App source shows `Call active in this thread` and `Finish or leave the active call before removing this conversation from your inbox.` before attempting active-call hide.
- Unread behavior is server-backed: message inserts update `last_message_at`, sender read state, and receiver `unread_count`; hidden threads reappear when newer message activity is later than `hidden_at`.
- Attachment and call history remain preserved because hide/unhide only updates the caller's `chat_thread_members.hidden_at` value.
- Block/restrict/account-status rules remain enforced through existing chat access, direct-thread open, membership, and message guards.
- Delete from my inbox is a per-user hide, not a hard delete.
- The other participant’s copy is not deleted.
- Message and call history are preserved.
- Hidden direct threads must not create duplicate direct threads.
- New message activity must reappear a hidden thread.
- Profile/Search → Chi’lly Chat must reopen the existing direct thread.
- Do not hide identity bugs by deleting rows.
- Source fixed is not installed-app proof.
- Google Play internal install is not enough without actual user flow proof.
- No logout, uninstall, reinstall, or clear-data happened.
- No auth/RLS/chat/account-status permission weakening happened.
- No service-role chat/social proof was counted.
- No provider/live-money mutation happened.
- `liveMoneyEnabled` remains OFF.

Party Room / Live Stage route semantics verification:
- Party Room and Live Stage are separate product routes.
- Party Room normal watch-party flow must not route to Live Stage.
- Player → Watch-Party Live → Party Waiting Room → Party Room remains intact.
- Home → Live Watch-Party → Live Waiting Room → Live Room → Live Stage remains intact.
- Live Stage remains `/watch-party/live-stage/[partyId]`.
- Party Room remains `/watch-party/[partyId]`.
- Legacy `/communication/*` remains compatibility-only.
- The ambiguous Party Room Go Live handoff introduced during validation cleanup was removed.
- No auth/RLS/chat/account-status permission weakening happened.
- No provider/live-money mutation happened.
- `liveMoneyEnabled` remains OFF.

Validation blocker cleanup:
- brand-spelling-policy is now clean.
- route-contracts guard is now clean.
- supabase db push --dry-run is now clean.
- Root causes: generated legal-site brand anchors produced `chi-llywood`; two proof-script redaction regex literals contained a contiguous lowercase brand token; Live Stage route guard expectations and paid ticket callback scope were stale; Supabase migration history had local/remote timestamp drift plus six older local hardening migrations not yet applied remotely.
- Fixes: regenerated legal-site anchors from a safer slugifier, updated proof-script redaction regex construction, fixed stale route guard expectations, renamed local direct-chat migration files to remote-applied versions, applied the six older hardening migrations after `supabase db push --dry-run --include-all`, and confirmed ordinary dry-run reports the remote database is up to date. Follow-up route semantics work removed the ambiguous Party Room Go Live handoff to `/watch-party/live-stage/[partyId]`.
- Source fixed is not installed-app proof.
- Google Play internal install is not enough without actual user flow proof.
- No logout, uninstall, reinstall, or clear-data happened.
- No auth/RLS/chat/account-status permission weakening happened.
- No service-role chat/social proof was counted.
- No provider/live-money mutation happened.
- `liveMoneyEnabled` remains OFF.

Direct thread messaging UX restoration:
- Chi’lly Chat direct thread must remain a real messaging thread.
- Calls live inside the thread, but must not replace the thread.
- Actual chat content must remain primary.
- Call event rows must not dominate the direct thread.
- Thread status UI must not push real chat content out.
- Source now reduces the oversized thread status surface, moves call history into the message timeline as lightweight recent-call rows, keeps the composer visible, and preserves voice/video call actions from `app/chat/[threadId].tsx`.
- Play-installed versionCode `63` proof passed for this UX restoration: the `user230455` thread opened with fresh header identity, Voice Call / Video Call actions, `MESSAGE THREAD`, `Chat stays primary`, compact `RECENT CALLS IN THIS THREAD`, and the `Write a message` composer.
- Google Play internal install is not enough without actual user flow proof; this item has both Google Play install readback and actual thread-flow proof.
- `installerPackageName` must be `com.android.vending`.
- Sideloaded APK proof is not accepted.
- No logout, uninstall, reinstall, or clear-data happened.
- No auth/RLS/chat/account-status permission weakening happened.
- No service-role chat proof was counted.
- No provider/live-money mutation happened.
- `liveMoneyEnabled` remains OFF.

Chi’lly Chat delete/hide conversation:
- Delete from my inbox is a per-user hide, not a hard delete.
- The other participant’s copy is not deleted.
- Message and call history are preserved.
- Hidden direct threads must not create duplicate direct threads.
- Profile/Search → Chi’lly Chat must reopen the existing direct thread.
- Do not hide identity bugs by deleting rows.
- Proof Normal / @user230456 is a legitimate separate proof account/thread and may be hidden from the tester inbox without renaming or merging.
- Long-press thread actions now include `Delete from my inbox` with confirmation copy: `This removes the conversation from your inbox. It does not delete it for the other person.`
- Source fixed is not installed-app proof.
- Google Play internal install is not enough without actual user flow proof.
- `installerPackageName` must be `com.android.vending`.
- Sideloaded APK proof is not accepted.
- No logout, uninstall, reinstall, or clear-data happened.
- No auth/RLS/chat/account-status permission weakening happened.
- No service-role chat/social proof was counted.
- No provider/live-money mutation happened.
- `liveMoneyEnabled` remains OFF.

Truth to preserve:
- Google Play internal versionCode `60` was built from commit `c08c4bd1d98d3ea6672df5c3441c8d7b232b6b82`, includes required fix `0b563c79384e5270440bc0ad076bbc4ca687bf57`, and was installed by Google Play on both physical phones with installer `com.android.vending`.
- No logout, uninstall, reinstall, clear-data, reset session, sideload, manual APK install, or Play production submission happened.
- Settings/Profile/Chat search/direct-thread header showed fresh `@user230455`; source now fixes the cross-surface stale identity path where an existing Chat inbox row could still display stale `@user230456`.
- Visible Chat search -> direct-thread open/create passed on the Google-signed installed app after targeted live Supabase RPC fixes for ambiguous pair-key and member-upsert resolution.
- Receiver elsewhere-in-app incoming banner appeared from a real voice-call invite, and the targeted receiver banner thread-readback migration let the receiver tap the banner, open the valid readable direct thread, and join the voice call on the Google-signed installed v60 app.
- Root cause was the platform-owner direct-thread readback guard denying an explicit direct-thread member when the stale/direct pair row contained a platform owner but was not owner-created. The fix keeps creation/open restrictions in the authenticated direct-thread RPC and allows only valid explicit direct-thread members with account-status and block checks preserved.
- Source now adds a shared responsive layout foundation and fixes the observed direct Chat video layout issue where the lower feed could be cut off by bottom controls and participant metadata covered too much video.
- Direct Chat video call layout adapts by dimensions and safe area. Video tiles must adapt to phone size instead of hard-coded device hacks. Cross-platform responsive support is not Closed without tested device/simulator coverage, and iOS/tablet/foldable proof remains Pending unless tested.
- Full call closure remains Partial because installed v60 still recorded a false `Missed voice call` event after the joined call ended, background push/ringing was not proved, decline/missed cleanup was not proved, and source cleanup/identity fixes are not installed-app proof until delivered through Google Play internal.
- No auth/RLS/chat/account-status permission weakening happened, no service-role chat proof was counted, no provider/live-money mutation happened, current First Owner was not touched, and `liveMoneyEnabled` remains OFF.

v61 responsive video proof now added:
- Google Play internal versionCode `61`, versionName `1.0.0`, commit `70b276c336b1164a674a8ae51b421e0a039d0d35` was built by EAS Build `bc2e9532-6a1e-4174-a153-679345c6ef20` and submitted to Google Play internal by EAS Submit `36c7bae7-4181-4c67-ac46-75070f76142f`.
- Both physical phones updated only through Google Play with installer `com.android.vending`; no logout, uninstall, reinstall, clear-data, sideload, or manual APK install happened.
- Android two-phone installed responsive Direct Chat video layout proof passed for owner -> user: `2 in call`, local/remote video on both phones, no bottom feed cutoff, no control overlap, compact participant metadata, Back to Thread, End Call, no visible false missed-call text after joined video calls, and repeated call after end with a new room.
- iOS/tablet/foldable proof remains Pending unless tested. Background push/ringing, decline/missed/background cleanup, user -> owner direction, and installed cross-surface stale identity proof remain Partial.

Cross-surface stale identity source fix now added:
- One user identity must render consistently across profile, chat, search, circle, followers, and following.
- Fresh remote profile must win over stale AsyncStorage.
- Existing inbox rows, Circle, Followers, Following, shared user cards, and Platform/owner/admin/moderator/creator surfaces must not keep stale `@user230456` as primary identity.
- Role badges may show role/status, but they must not cause stale handle/name/avatar metadata to win.
- Play-installed versionCode `63` proof is Partial: fresh Profile, fresh Chat inbox/filter row, and fresh direct-thread header showed `user230455` / `@user230455`, but a separate existing Chat row still displayed `Proof Normal` / `@user230456` and opened to the same stale header.

Next product action:
- Investigate the remaining existing `Proof Normal` / `@user230456` direct-thread row on the Play-installed v63 app without service-role chat proof or permission weakening.
- Prove Settings/Profile/Chat/Search/Thread/Inbox/Circle/Followers/Following/shared user-card/platform-role surfaces agree on `@user230455` and do not show stale `@user230456` as primary identity.
- Rerun remaining installed proof only on Google Play-installed builds from `com.android.vending`: user -> owner direction, receiver background/push, decline/missed/background/killed-app cleanup, full same-thread rerun if needed, and any iOS/tablet/foldable responsive coverage.
- Android two-phone proof cannot close iOS/tablet/foldable coverage.

# Chi'lly Chat Google Play Internal Call Closure Follow-Up

Current lane doc:
- `docs/release/CHILLY_CHAT_GOOGLE_PLAY_INTERNAL_CALL_CLOSURE.md`
- `docs/release/CHILLY_CHAT_PLAY_V58_ACTUAL_USER_CALL_PROOF.md`
- `docs/release/CHILLY_CHAT_END_TO_END_CALL_INITIATION_PROOF.md`

Truth to preserve:
- Follow-up after v59: Owner/Admin -> normal-user Chat People search now finds `user230455 @user230455` with visible `Chi'lly Chat`, `Voice Call`, and `Video Call`, but installed v59 fails before direct-thread open/create with safe copy: `Unable to open Chi'lly Chat with this person right now.`
- Settings/Profile identity propagation is a real blocker: owner evidence showed Settings reporting current handle `@user230455` while normal Profile and the existing Chat thread still showed stale `@user230456`.
- Source now fixes this path, but it is not installed-app proof until a new Google Play internal build is delivered: remote profile wins over stale AsyncStorage for signed-in profile reads, Settings saves handle updates into the shared profile cache, reused Chat threads are enriched before navigation, and authenticated `get_or_create_direct_chat_thread` repairs direct-thread open/create after stale/orphan pair-state failures.
- The new RPC is not service-role chat proof and does not weaken RLS; it operates only on the authenticated caller/target pair and still requires normal RLS readback before the app treats the thread as open.
- Chi'lly Chat Google Play internal actual-user call proof is Partial.
- EAS Build `7cf16ebe-a3de-4efb-8170-63a5e9799653` and EAS Submit `0c9b2162-c259-4934-a0e8-5679f524b609` delivered v59 to Google Play internal testing only.
- Both attached phones updated from Google Play internal testing, not sideload: `R5CR120QCBF` and `R3CXA0DS5JV`, package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `59`.
- No logout, uninstall, reinstall, clear-data, reset session, or sideload happened; sessions survived after update.
- Normal user -> Owner/Admin public People search no-result is expected and is not a product search failure.
- Owner/Admin -> normal user found the existing direct thread through visible Chat search, but no fresh v59 call completed.
- Stale live-call inbox rows were visible before thread open; one thread refreshed to `No Active Call` when opened.
- Receiver elsewhere-in-app, background push/ringing, video local/remote on both phones, fullscreen fit, and call end/decline/missed cleanup remain Partial.
- Same-thread proof is not enough. Google Play internal install is not enough without actual user flow proof. Source fixed is not installed-app proof.
- No auth/RLS/chat/account-status permission weakening happened, no service-role chat proof was counted, no provider/live-money mutation happened, and `liveMoneyEnabled` remains OFF.

Next product action:
- Build and deliver v60 or newer through Google Play internal testing with the handle freshness/direct-thread repair source fix.
- Keep both phones on Play-installed v60 or newer from `com.android.vending`.
- Put both phones on the target Chi'llywood app before proof and keep them there.
- Use Owner/Admin -> `user230455` or normal public user -> normal public user as the search direction; do not use normal user -> Owner/Admin as a public People search proof target.
- First prove Settings/Profile/Chat agree on the current handle after handle change, then prove `Chi'lly Chat`, `Voice Call`, and `Video Call` from the visible People result open/create the direct thread.
- Rerun normal visible paths: inbox/search start-chat, existing direct thread, normal Profile path, receiver same-thread, receiver elsewhere-in-app, receiver background/push, voice, video local/remote, fullscreen fit, and end/decline/missed cleanup.

Superseded v58 truth:
- Chi'lly Chat Play v58 actual-user call proof is Partial.
- Source commit `0a22ab3e2612d4f888b4f56eac03c0639cac26ae` was pushed and aligned with `origin/main`.
- Both attached phones were Play-installed v58 from `com.android.vending`: `R5CR120QCBF` and `R3CXA0DS5JV`, package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `58`.
- v58 package proof is not actual-user call proof.
- The owner said the search problem was fixed separately and not to use the v58 search box again until v59.
- No search-box-dependent v58 result is counted as Closed.
- Receiver elsewhere-in-app did not visibly show the app-wide incoming call banner on R5 during the captured fresh R3 voice-call attempt.
- Background push/ringing and video local/remote proof on both phones were not proved.
- Same-thread proof is not enough. Source fixed is not installed-app proof. v58 installed is not enough without actual user flow proof.
- No auth/RLS/chat/account-status permission weakening happened, no service-role chat proof was counted, no provider/live-money mutation happened, and `liveMoneyEnabled` remains OFF.

# Play-Internal Two-Phone Chat/Live Follow-Up

Current lane doc:
- `docs/release/PLAY_INTERNAL_TWO_PHONE_CHAT_LIVE_PROOF.md`
- `docs/release/PLAY_INTERNAL_V58_BINARY_DELIVERY.md`

Truth to preserve:
- Play internal v58 binary delivery is Closed for build and submit to Google Play internal track.
- EAS Build ID `b6bbe9d0-5e32-4ef8-b611-f68acec0bd2e` produced Android App Bundle versionCode `58`, runtime `1.0.0`, commit `f6869be8ed37890b564b7d6f2c818283dde923fc`.
- EAS Submit ID `cb94e585-4330-4ed5-999c-a240b68b1f28` submitted to Google Play `internal` track only.
- Play-internal two-phone Chat/Live proof is Partial.
- EAS Update was published to `production` runtime `1.0.0` with update group `ccf8ee01-efa6-4792-bd4a-bf7e015bcd36`, Android update `019f0c20-a752-7fd2-a61e-c9fa1a27a734`, commit `873bb515e73930ef1b1cb6fb047293e18ce84449`.
- Both physical Play-internal v57 phones were attached and launched: `R5CR120QCBF` and `R3CXA0DS5JV`, package `com.chillywood.mobile`, installer `com.android.vending`, version `1.0.0`, versionCode `57`.
- Both phones logged Expo Updates `CheckCompleteUnavailable`; active update ID could not be confirmed because the release app is not debuggable.
- Supporting installed-app automation stayed Partial: Chat profile-to-chat hit `Profile unavailable`; Live hit active Premium-required/status gates on both phones.
- Source fixed is not installed-app proof. EAS Update published is not installed-app proof. If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed.
- No sideload, uninstall, reinstall, clear-data, auth/RLS/Premium/chat/account-status/staff weakening, provider/live-money mutation, First Owner touch, or secrets exposure happened. `liveMoneyEnabled` remains OFF.

Next product action:
- Update both physical phones from Google Play internal testing to v58 when Play makes the internal release available.
- Use two accounts that can reach each other through a normal visible Chi'lly Chat path.
- Use two Premium-capable Live accounts or an approved proof entitlement path.
- Rerun only affected actual-user Chat video, fullscreen RTC fit, Live remote video, and Live host controls on both physical Play-internal phones.

# Cross-Lane Actual-User Product QA Follow-Up

Current lane doc:
- `docs/release/CROSS_LANE_ACTUAL_USER_PRODUCT_QA_SWEEP.md`

Truth to preserve:
- Cross-Lane Actual-User Product QA Sweep is Partial for actual-user installed-app closure.
- Small safe source fixes are applied for Chi'lly Chat remote video rendering from real stream URL presence, confusing call/room count copy, and Live Stage remote video rendering from stream URL presence.
- Proof scripts passing is not enough; diagnostic/backend proof is not actual-user proof.
- If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed.
- No auth/RLS/Premium/chat/account-status/staff permission weakening happened, no provider/live-money mutation happened, and `liveMoneyEnabled` remains OFF.

Next product QA action:
- Deliver or pick up the JS fix on the Play-internal runtime or next Play internal build.
- Rerun only affected actual-user paths on both physical Play-internal phones: Chi'lly Chat video call local/remote video, fullscreen RTC aspect fit, Live waiting-room seat request, and host seat/mute/remove controls.
- Visually recheck Admin Platform Snapshot Refresh control.

# Owner/Admin/Moderator Proof Truth Audit Follow-Up

Current lane doc:
- `docs/release/OWNER_ADMIN_MODERATOR_PROOF_TRUTH_AUDIT.md`

Truth to preserve:
- Owner/Admin/Moderator Proof Truth Audit is Closed as an audit, but launch-meaningful actual-user staff proof remains Partial where the evidence is backend/RPC, diagnostic, controlled seeded, service-role/bootstrap, or provider-dashboard owner-confirmation.
- Diagnostic/backend proof is not actual-user proof.
- Service-role/bootstrap proof is not role-authority proof.
- Owner RPC staff grant path remains app-backed RPC/backend Closed where applicable.
- Provider dashboard MFA/access remains owner-confirmation-required unless sanitized owner/provider evidence exists.
- Normal-user `/admin` denial and seeded Moderator/Admin/Owner installed route/control traversal are actual-user installed-app Closed only within the narrow proof-account route/control scope.
- Current First Owner was not touched, no real users were modified, no auth/RLS/staff permission weakening happened, no provider/live-money mutation happened, and `liveMoneyEnabled` remains OFF.

Next staff-proof action:
- If launch needs deeper staff proof, run a focused installed-app actual-user Owner/Admin/Moderator lane against safe proof targets only.
- Do not use service-role as role-authority proof.
- Do not call backend readback or marker-only evidence actual-user Closed.

# Targeted Chat/Live UX Sweep Follow-Up

Current lane doc:
- `docs/release/CHAT_CALL_REMOTE_VIDEO_LIVE_ACTION_UX_SWEEP.md`

Source fixes are applied for the owner-reported issues:
- Chi'lly Chat remote video could be hidden when the remote media stream existed but presence camera state was stale.
- Android audio-first RTC track arrival could skip binding until video appeared.
- Direct Chat fullscreen video layout could let the lower feed sit under bottom controls and show an oversized participant metadata card over the video; the current source adds a shared responsive foundation, but installed and cross-platform device proof remain pending.
- Live Watch-Party host participant action controls could remain open and feel stuck after `Seat update unavailable`.

Current status:
- Source fix: ready for validation.
- Actual-user installed-app proof: Partial.
- `R5CR120QCBF` was attached and verified as Play-internal v57.
- `R3CXA0DS5JV` was not visible to adb during the sweep, so two-phone actual-user remote-video/live-seat repro is still pending.

Next task:
- Deliver/pick up this JS fix on the Play-internal runtime or next Play internal build.
- Connect both physical Play-internal v57 phones.
- Rerun only affected paths:
  - Chi'lly Chat video call through normal visible app path, verifying local and remote video on both phones.
  - Fullscreen/large RTC video aspect fit on the mismatched phone.
  - Live Watch-Party waiting-room seat request and host Approve/Mute/Seat/Remove controls.
- Keep actual-user proof Partial unless Robert/testers can reproduce the fixed behavior in the installed app.
- No physical phone sideload, provider mutation, live money, payout/refund execution, RLS/Premium/auth weakening, or secrets exposure.

# Realtime UI Proof Follow-Up

Actual-user correction:
- `docs/release/ACTUAL_USER_PROOF_STANDARD.md` is now the governing standard.
- `docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md` records Actual-user Chat Call proof Partial and Actual-user Live UI proof Partial.
- Exact Chat Call root cause: `startChatThreadCall()` did not verify the receiver-visible `chat_threads` update, and invite/push dispatch failure was swallowed.
- Fix shipped repo-side and EAS-published to production runtime `1.0.0`: group `bc66e544-d7b8-44d7-8236-9957f378b95a`, Android update `019f0bc2-d794-71c3-8ab9-4502df41e790`.
- Both phones logged Expo Updates `CheckCompleteUnavailable`; active update ID was not directly readable, so actual installed manual call/ring closure remains Partial.
- Next task: confirm update uptake or ship the same code in the next Play internal build, then rerun only actual-user Chat Call and Live UI paths.
- Pre-created thread/call state is not actual-user Closed.
- `chat_threads` RLS was not weakened.
- Premium gates were not bypassed or weakened.
- No service-role chat permission proof was used.
- No provider/live-money mutation happened.

Docs:
- `docs/release/TARGETED_WATCH_PARTY_REALTIME_MIGRATION_APPLY.md`
- `docs/release/WATCH_PARTY_REALTIME_CALLBACK_FIX.md`
- `docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md`
- `docs/release/TWENTY_FIVE_SEEDED_PARTICIPANTS_REALTIME_PROOF.md`
- `docs/release/FIVE_REMAINING_ONE_DEVICE_TRAVERSAL_BLOCKERS.md`
- `docs/release/FULL_SEEDED_ONE_DEVICE_ROLE_TRAVERSAL_RERUN.md`
- `docs/release/ONE_ATTACHED_DEVICE_FULL_APP_AUTOMATION_PROOF.md`
- `docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md`
- `docs/release/PLAY_INTERNAL_TEST_AAB_UPLOAD_TESTER_SMOKE.md`

Status:
- 25 seeded participants identity pack: Closed.
- Live video media diagnostic with 25 seeded RTC-node participants: Closed.
- Chat call media diagnostic with two seeded RTC-node clients: Closed.
- Owner/Admin/Moderator realtime publish-authority diagnostic: Closed.
- Watch-Party state/readback diagnostic: Closed.
- Watch-Party realtime callback: Closed after targeted migration apply and proof-runner Realtime auth bridge.
- Targeted migration applied: `supabase/migrations/20260627131501_watch_party_realtime_publication.sql`.
- Full Play-internal installed-app realtime UI proof: Partial after two-phone run and affected reruns with `R3CXA0DS5JV` and `R5CR120QCBF`.
- Final installed realtime UI blockers: Partial in `docs/release/FINAL_INSTALLED_REALTIME_UI_BLOCKERS.md`.
- Two-client matrix totals: 6 Closed, 3 Partial, 0 Blocked, 0 Failed.
- Closed in installed/two-phone scope: both Play-internal v57 metadata preflights, seeded UI login on both phones, Watch-Party callback recheck, Watch-Party installed UI markers on both phones, and Owner/Admin/Moderator realtime controls using same-lane staff UI evidence plus the 25-participant LiveKit publish-authority diagnostic.

Current blocker:
- Full installed-app UI proof no longer lacks a second physical client: `R3CXA0DS5JV` and `R5CR120QCBF` are both Play-internal v57. Watch-Party installed UI marker assertion is Closed on both clients. Remaining installed-app UI closeout blockers are direct chat-call thread setup still hitting `chat_threads` RLS after app-safe setup-order repair, and Live participant UI still requiring a second Premium-capable seeded client or safe existing proof entitlement path. Premium gates must not be bypassed or weakened, and `chat_threads` RLS must not be weakened. The emulator sideload is diagnostic only, not tester delivery or Play proof.

Required truth:
- no sideload was used on the physical tester phone
- no APK install was used as tester proof
- no Play production submission
- no provider mutation
- no Google Play product/base-plan mutation
- no RevenueCat mapping change
- no Stripe mutation
- no purchases or provider refunds executed
- no payouts/cashout/withdrawals/transfers
- no service-role role/permission authority proof
- no current First Owner touched
- no secrets, LiveKit tokens, push tokens, signed URLs, raw IPs, private messages, or private evidence committed/artifacted
- `liveMoneyEnabled` remains OFF
- payouts/cashout/Stripe production/payable balances/provider refunds remain OFF/manual/external

Carry-forward visible-surface safety anchors:
- Every visible surface active wiring audit: Closed.
- No visible clickable dead buttons are allowed.
- Nothing visible should be hidden or disabled.
- Permission scopes must unlock backed behavior.
- Tester-visible monetization UX is separate from live money settlement.
- Premium annual opens an active provider-blocked status/resolution flow.
- Creator Channel Subscription opens an active provider-blocked status/resolution flow.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- No Google Play, RevenueCat, Stripe, payout, refund, purchase, or provider mutation happened.

Next lane recommendation:
- Fix only the remaining installed-app realtime UI proof blockers, then rerun affected realtime flows: chat-call installed UI setup through a real app-backed thread path, and Live installed UI with two Premium-capable seeded clients or a safe existing proof entitlement path.

# Five Remaining One-Device Traversal Blockers Fix

Docs:
- `docs/release/STABLE_SEEDED_PROOF_ACCOUNT_PACK.md`
- `docs/release/ONE_ATTACHED_DEVICE_FULL_APP_AUTOMATION_PROOF.md`
- `docs/release/FULL_SEEDED_ONE_DEVICE_ROLE_TRAVERSAL_RERUN.md`
- `docs/release/SEEDED_ACCOUNT_INSTALLED_LOGIN_BRIDGE.md`
- `docs/release/FIVE_REMAINING_ONE_DEVICE_TRAVERSAL_BLOCKERS.md`

- [x] Created `scripts/local-bootstrap-stable-seeded-proof-account-pack.mjs`.
- [x] Added package script `bootstrap:stable-seeded-proof-account-pack`.
- [x] Created `scripts/proof-stable-seeded-proof-account-pack.mjs`.
- [x] Added package script `proof:stable-seeded-proof-account-pack`.
- [x] Created `scripts/guard-stable-seeded-proof-account-pack-policy.mjs`.
- [x] Added package script `guard:stable-seeded-proof-account-pack-policy`.
- [x] Created/reused/repaired all ten proof-only `@chillywood.test` accounts.
- [x] Stored credentials only in ignored `.env.browserstack-monetization.local`.
- [x] Proved all ten accounts usable with `npm run proof:stable-seeded-proof-account-pack`.
- [x] Reran non-destructive attached-device Play-installed package/launch readback on `R5CR120QCBF`.
- [x] Reran full seeded one-device role traversal attempt on the installed Play internal app.
- [x] Added `scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs`.
- [x] Added `scripts/proof-full-seeded-one-device-role-traversal-rerun.mjs`.
- [x] Added package script `proof:full-seeded-one-device-role-traversal-rerun`.
- [x] Added `scripts/guard-full-seeded-one-device-role-traversal-policy.mjs`.
- [x] Added package script `guard:full-seeded-one-device-role-traversal-policy`.
- [x] Fixed installed seeded-login automation bridge without service-role, account recreation, auth bypass, or command-line credential passing.
- [x] Added `scripts/proof-seeded-account-installed-login-bridge.mjs`.
- [x] Added package script `proof:seeded-account-installed-login-bridge`.
- [x] Added `scripts/guard-seeded-account-installed-login-policy.mjs`.
- [x] Added package script `guard:seeded-account-installed-login-policy`.
- [x] Confirmed all ten seeded credential pairs are saved locally only in ignored `.env.browserstack-monetization.local`.
- [x] Fixed route opening to use Expo Router path-style deep links such as `chillywoodmobile:///chat`.
- [x] Closed normal `/chat` route marker on the installed Play internal app.
- [x] Closed normal `/admin` as expected denial/access-status behavior, not staff access.
- [x] Closed creator `/channel-studio`, `/creator-monetization-setup`, and `/payouts` as active Premium-required Platform Studio setup/status gates for the non-Premium creator state.
- [x] Created `scripts/proof-five-remaining-one-device-traversal-blockers.mjs`.
- [x] Added package script `proof:five-remaining-one-device-traversal-blockers`.
- [x] Created `scripts/guard-five-remaining-one-device-traversal-policy.mjs`.
- [x] Added package script `guard:five-remaining-one-device-traversal-policy`.
- [x] Reran affected role flows only on `R5CR120QCBF`; artifact `/tmp/app-five-remaining-one-device-traversal-blockers-20260626-215343/`.

Status:
- Stable seeded proof account pack: Closed.
- Full seeded one-device role traversal rerun: Closed for one-device route/control traversal.
- One attached device full app automation proof: Closed for one-device route/control traversal after affected-only rerun.
- Signed-out routes passed on the installed Play internal v57 app.
- Backend auth readback passed for normal, creator, moderator, admin/operator, owner, blocked A, blocked B, Premium, and non-Premium.
- Seeded account installed login bridge: Closed for non-restricted proof accounts.
- Installed UI login passed for normal, creator, moderator, admin/operator, owner, blocked A, blocked B, Premium, and non-Premium.
- Restricted account remained blocked/fail-closed by backed account state as expected.
- Root cause of prior installed login blocker: automation credential injection failure; secondary harness issues were Settings Account-section logout prep and XML redaction of Android `password="false"` attributes.
- The five route-marker/control-proof blockers are Closed: normal `/chat`, normal `/admin`, creator `/channel-studio`, creator `/creator-monetization-setup`, and creator `/payouts`.
- Latest role traversal status counts: Pass `80`, Human review `28`, Blocked `0`, Two-device required `4`, Fail `0`.
- Two-device live/watch-party/chat-call proof remains required for real simultaneous media/state behavior.
- Required truth:
  - no service-role was used in the rerun
  - no accounts were created or recreated in the rerun
  - service-role bootstrap was proof-only account creation/repair
  - service-role bootstrap is not role/permission authority proof
  - Owner RPC staff grant path remains the authority proof
  - no passwords printed or committed
  - no current First Owner touched
  - no real users modified
  - no provider mutation
  - no Play production submission
  - `liveMoneyEnabled` remains OFF
  - payouts/cashout/Stripe production/payable balances/provider refunds remain OFF/manual/external

Next lane recommendation:
- Two-device live/watch-party/chat-call proof for real-time flows.

# Owner RPC Staff Grant Path Follow-Up

Doc: `docs/admin/OWNER_ADMIN_MODERATOR_PRODUCTION_AUTHORITY_SEEDED_DEVICE_PROOF.md`.

- [x] Added `scripts/proof-owner-rpc-staff-grant-path.mjs`.
- [x] Added package script `proof:owner-rpc-staff-grant-path`.
- [x] Proved the existing authenticated Owner RPC staff grant path with proof-only `@chillywood.test` accounts.
- [x] Used a temporary proof-only Owner actor and revoked the proof Owner role after proof.
- [x] Called `admin_grant_platform_role_by_email` and `admin_grant_platform_staff_permission_by_email`.
- [x] Granted only `proof_moderator_001@chillywood.test` and `proof_admin_operator_001@chillywood.test`.
- [x] Verified Moderator denial for Admin/operator grant.
- [x] Kept credentials, passwords, service-role key, provider data, and private evidence out of git/artifacts/logs.

Status:
- Verdict: Closed for the authenticated Owner RPC staff grant path.
- The prior `platform_staff_permission_denied` blocker was caused by the ignored local proof "Owner" env resolving as `operator`, not `owner`.
- Provider dashboard private MFA/access proof remains owner-confirmation-required because repo code cannot verify private dashboard state without sanitized owner/provider evidence.
- Required truth:
  - no real staff accounts changed
  - no real users changed
  - no current First Owner touched
  - no provider dashboard mutation
  - no Google Play product/base-plan mutation
  - no RevenueCat mapping change
  - no Stripe mutation
  - no purchases or provider refunds executed
  - Premium public purchase remains OFF
  - `live_money_enabled` remains OFF
  - Creator-money remains OFF
  - Payouts/Stripe/merch remain OFF

# Play Internal / Closed Testing AAB Upload + Tester Smoke Lane

Doc: `docs/release/PLAY_INTERNAL_TEST_AAB_UPLOAD_TESTER_SMOKE.md`.

- [x] Commit `9361c45987d6dd37ec7574dca7f9fb1e37c9fb9a` was verified aligned with `origin/main` before Play upload work began.
- [x] Verified AAB path `/tmp/app-android-tester-binary-build-install-smoke-20260625-235636/chillywood-production-aab-v57.aab`.
- [x] Verified package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `57`, SHA-256 `a71b8a9b8e35a284e62b7843df5c7f16ba94c54487ca63bcf67aba04598c9efa`.
- [x] Submitted the v57 AAB through EAS Submit to the Google Play internal track only.
- [x] Prepared safe release notes and tester update instructions.
- [x] Removed the sideloaded v56 package from device `R5CR120QCBF` after the first Play update failed due the sideload install.
- [x] Installed the approved Play internal v57 build from Google Play.
- [x] Verified installer `com.android.vending`, package `com.chillywood.mobile`, version `1.0.0`, versionCode `57`.
- [x] Launched as `com.chillywood.mobile/.MainActivity` with no fatal crash in the captured launch log window.

Status:
- Verdict: Closed for Play internal v57 install and launch smoke. This is install/launch smoke only, not full tester QA; testers still need to run current non-money flows.
- Required tester delivery truth:
  - The approved tester delivery path is Google Play internal/closed testing.
  - The sideload v56 APK path was not owner-approved for tester delivery and must not be used for testers.
  - Future tester delivery must use Google Play internal/closed testing only unless the owner explicitly approves sideload in writing.
- Required truth:
  - No Play production submission or promotion.
  - No provider dashboard mutation.
  - No Google Play product/base-plan mutation.
  - No RevenueCat mapping change.
  - No Stripe mutation.
  - No purchases or provider refunds executed.
  - Premium public purchase remains OFF.
  - `live_money_enabled` remains OFF.
  - Creator-money remains OFF.
  - Payouts/Stripe/merch remain OFF.
- Next lane recommendation: Run tester feedback triage after testers complete current non-money QA. Premium monthly public purchase proof remains separate owner-approved lane.

# Android Tester Binary Build / Install Smoke Lane

Doc: `docs/release/ANDROID_TESTER_BINARY_BUILD_INSTALL_SMOKE.md`.

- [x] Commit `de3f9eb69798cebb5fab7fe0f34ce00fc0a10d8c` was verified pushed/aligned with `origin/main` before build work began.
- [x] Built EAS Android internal APK with profile `production-apk`.
- [x] Captured build ID `9e31b4b1-bd02-405c-8eeb-7aae3550d598`.
- [x] Captured APK path `/tmp/app-android-tester-binary-build-install-smoke-20260625-235636/chillywood-production-apk-v56.apk`.
- [x] Captured SHA-256 `5ab5390291a1556c85b1eda0fb66290181c035f17711d9f316b68070af0ace16`.
- [x] Confirmed APK metadata package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `56`.
- [x] Install-over-existing attached-device installs failed safely with signature mismatch; no uninstall was performed.
- [x] Built Play-uploadable AAB for Play internal/closed testing path: build ID `d7cec74d-95f5-4cf5-be0e-eb53571efc18`, versionCode `57`, SHA-256 `a71b8a9b8e35a284e62b7843df5c7f16ba94c54487ca63bcf67aba04598c9efa`.
- [x] Owner instructed no use attached device; no further attached-device install/smoke actions are part of this lane.

Status:
- Verdict: Partial for the original sideload binary lane, superseded for tester delivery by the Play internal v57 install smoke lane. Fresh tester APK was built, but the sideload v56 APK path was not owner-approved for tester delivery and must not be used for testers unless the owner explicitly approves sideload in writing. Play-uploadable AAB v57 was built for Google Play internal/closed testing distribution.
- Required truth:
  - No production Play submission.
  - No provider dashboard mutation.
  - No Google Play product/base-plan mutation.
  - No RevenueCat mapping change.
  - No Stripe mutation.
  - No purchases or provider refunds executed.
  - Premium public purchase remains OFF.
  - `live_money_enabled` remains OFF.
  - Creator-money remains OFF.
  - Payouts/Stripe/merch remain OFF.
- Next lane recommendation: Run tester feedback triage after testers complete current non-money QA. Premium monthly public purchase proof remains separate owner-approved lane.

# Tester Build / Current Runtime Delivery Lane

- [x] Previous commit `25ecf6d55180144b7202c901c163f9e28e469609` was verified aligned with `origin/main` before delivery work began.
- [x] Published EAS Update to branch `production` with message `Tester update: current public non-money readiness changes`.
- [x] Captured update group `4a21c89b-35ca-4997-8c62-28bb20f90469` / Android update ID `019f020a-96a7-71d1-890c-b8406e78ab49`.
- [x] Verified installed Android package launch on `R5CR120QCBF`: `com.chillywood.mobile`, versionName `1.0.0`, versionCode `55`, installer `com.android.vending`.
- [x] Added `docs/release/TESTER_BUILD_CURRENT_RUNTIME_DELIVERY.md`, proof script, and guard script.

Status:
- Verdict: Partial. EAS Update was sufficient and published for runtime `1.0.0`, and the installed Play/internal app launched, but the smoke window did not observe the device download/apply the new update group.
- Required truth:
  - This lane did not submit the app to production.
  - This lane did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards.
  - Safe public non-money systems remain enabled.
  - Premium public purchase remains OFF.
  - `live_money_enabled` remains OFF.
  - Creator-money remains OFF.
  - Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
  - Provider refunds remain manual/external.
- Next lane recommendation: Run tester feedback triage after testers complete current-runtime QA. Premium monthly public purchase proof remains separate owner-approved lane.

# Final Store / Release Readiness and Play Submission Packet Alignment Lane

- [x] Previous commit `b318c6249271ac068ccaeef122477f6bc00f2663` was verified aligned with `origin/main` before release-packet edits began.
- [x] Created `docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md`.
- [x] Added proof and guard scripts for final store/release readiness packet alignment.
- [x] Updated Play, Data Safety, App Access, release, legal, provider, money, monitoring, public switchboard, and hot-path docs with the final packet boundary.

Status:
- Verdict: Partial. Repo-side Play submission packet alignment is closed for documentation/proof/guard coverage, but final Play Console acceptance, final release build/install smoke, provider dashboard private proof, reviewer credential entry, and attorney/legal approval remain owner/store/provider/release operations outside this lane.
- Required truth:
  - This lane did not submit the app to production.
  - This lane did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards.
  - Safe public non-money systems remain enabled.
  - `live_money_enabled` remains OFF.
  - Creator-money remains OFF.
  - Premium public purchase remains OFF.
  - Premium monthly public purchase remains a separate owner-approved proof lane.
  - Premium annual remains Google Play base-plan provider-blocked.
  - Creator Channel Subscription remains Google Play base-plan provider-blocked.
  - Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
  - Provider refunds remain manual/external.
  - App Access/reviewer packet is sanitized and does not commit credentials.
  - Provider dashboard private proof remains owner-confirmation-required.
- Next lane recommendation: Continue with owner-approved Premium monthly public purchase proof only if you want Premium monthly live before release. Otherwise continue with final release build/install smoke and Play Console manual submission steps.

## Proof Fixture Bootstrap + Full Installed Moderator/Admin Traversal Lane

- [x] Prior local commit `72642da35a99010c3b38cd9c6d24e663d7ceecce` was pushed and aligned with `origin/main` before bootstrap started.
- [x] Service-role proof fixture bootstrap was used for only two `.test` proof accounts.
- [x] Credentials were written only to ignored `.env.browserstack-monetization.local`.
- [x] Installed Moderator traversal ran and closed.
- [x] Installed Admin/operator traversal ran and closed.
- [x] Signed-out and normal-user admin denial ran and closed.
- [x] Owner RPC staff grant path was later proved by `npm run proof:owner-rpc-staff-grant-path`.

Status:
- Verdict: Closed for installed Moderator/Admin traversal through proof-only service-role fixtures. The separate Owner RPC staff grant path follow-up is also Closed.
- Artifact: `/tmp/app-seeded-staff-proof-fixture-bootstrap-full-traversal-20260625-220019/`
- Cleanup: not performed; proof roles/scopes are short-expiring.
- Required truth:
  - service-role fixture was proof-only
  - no real staff accounts changed
  - no First Owner touched
  - no credentials committed
  - no passwords printed
  - no provider dashboards changed
  - no money systems enabled
- Next lane recommendation: Continue production readiness with final store/release readiness and Play submission packet alignment, excluding known Google Play annual/channel base-plan provider blocker.

## Seeded Moderator/Admin Credential Provisioning + Full Installed Traversal Proof Lane

- [x] Commit `1a5a3b75b6b3cd38e5e2720ee41b91089b5e1480` was already pushed and aligned with `origin/main` before this lane began.
- [x] Added a repo-safe proof-account provisioner for fixed `@chillywood.test` Moderator/Admin proof accounts.
- [x] Kept credential values outside git and never printed passwords.
- [x] Reran installed-device proof with a redacted credential key presence checklist.

- Status update: this earlier Partial was superseded. Installed traversal closed through proof-only service-role fixtures, and the separate authenticated Owner RPC staff grant path closed later through `npm run proof:owner-rpc-staff-grant-path`.
- Root cause: the ignored local proof "Owner" env used in the earlier attempt resolved as `operator`, not `owner`, which correctly produced `platform_staff_permission_denied`.
- Owner action: none for Owner RPC proof. Provider dashboard private MFA/access proof still requires sanitized owner/provider confirmation.
- Next lane recommendation: Continue production readiness with final store/release readiness and Play submission packet alignment, excluding known Google Play annual/channel base-plan provider blocker.

## Owner/Admin/Moderator Production Authority Seeded 1-Device Proof Lane

- [x] Provider dashboard governance commit `84356a955959861df3993e10a6e615b03f03d73c` was aligned with `origin/main` before proof began.
- [x] Seeded one-device proof ran with installed package/launch readback.
- [x] Auto-fix loop was used for safe repo issues only.
- [x] Repo-safe seeded Moderator/Admin env key contract was added without committing credential values.

Status:
- Verdict: Closed. Static policy guards, seeded account availability checks, backend/RPC denial contract, installed-app package/launch probe, proof artifact generation, proof script, guard coverage, installed Moderator/Admin traversal, and the authenticated Owner RPC staff grant path are closed.
- Docs: `docs/admin/OWNER_ADMIN_MODERATOR_PRODUCTION_AUTHORITY_SEEDED_DEVICE_PROOF.md`
- Proof script: `scripts/proof-owner-admin-moderator-production-authority-seeded-device.mjs`
- Guard: `scripts/guard-owner-admin-moderator-production-authority-policy.mjs`
- Required truth:
  - no Support backend role
  - no `operator` rename
  - no Moderator/Admin merge
  - no new broad Moderator powers
  - no non-admin admin access
  - no unscoped Admin Search
  - no reporter identity/private evidence exposure
  - safe public non-money systems remain enabled
  - `live_money_enabled`, creator-money, Premium public purchase, payouts, Stripe Connect, merch checkout, purchases, refunds, and provider mutation remain OFF/not performed
- Next lane recommendation: Run tester feedback triage after current non-money QA. Provider dashboard private MFA/access proof remains owner-confirmation-required.

## Provider Dashboard Ownership / Access Governance Lane

- [x] Previous local Moderation Case Operations Completion commit `d0136a67150702e45aeccc2a24d9ee72a93f25d1` was already aligned with `origin/main` before new edits.
- [ ] Provider dashboard ownership and access governance repo-side proof in progress.

Status:
- Verdict target: Partial for actual dashboard access proof and Closed for repo-side governance.
- Docs: `docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md`
- Proof script: `scripts/proof-provider-dashboard-ownership-access-governance.mjs`
- Guard: `scripts/guard-provider-dashboard-ownership-policy.mjs`
- Required truth:
  - This lane did not mutate provider dashboards.
  - First Owner / Owner owns provider dashboard accountability.
  - Each provider has a primary owner and backup owner requirement.
  - Company-controlled email is required where available.
  - Personal accounts are avoided for production ownership.
  - Provider roles must be least-privilege.
  - MFA/2FA is required where supported.
  - Shared provider dashboard accounts are forbidden where individual access is supported.
  - Service accounts are not human staff accounts.
  - API keys and provider secrets must live in secret managers/provider dashboards/EAS/Supabase/GitHub secrets, not repo.
  - Provider webhooks must be protected with signature/shared-secret validation where supported.
  - Credential rotation calendar and provider offboarding checklist exist.
  - Provider support tickets are tracked with sanitized references.
  - Provider decisions are mirrored into repo docs with sanitized facts.
  - Dashboard access proof remains owner-confirmation-required where repo cannot verify it.
  - Safe public non-money systems remain enabled.
  - `live_money_enabled`, creator-money, Premium public purchase, payouts, Stripe Connect, merch checkout, and provider mutation remain OFF/not performed.
- Next lane recommendation: Continue production readiness with final store/release readiness and Play submission packet alignment, excluding known Google Play annual/channel base-plan provider blocker.

## Moderation Case Operations Completion Lane

- [x] Moderation queue commit `9714cac8491e56f75fd2dba8dc42fd31d2f42d2a` was already aligned with `origin/main` before new edits.
- [x] Moderation case operations completion repo-side proof closed.

Status:
- Verdict: Closed for safe human-review operations governance, exact-scope assignment policy, private/audited internal note policy, template-only canned reasons, coordinated-report signal-only handling, repeated-offender review/risk flags, malicious-report privacy, urgent SLA owner/escalation, proof, and guard coverage. Future broad backend case-table/note-table/UI automation remains a separate exact implementation lane and must stay non-punitive unless a human scoped action records the decision.
- Docs: `docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md`
- Proof script: `scripts/proof-moderation-case-operations-completion.mjs`
- Guard: `scripts/guard-moderation-case-operations-policy.mjs`
- Required truth:
  - Case assignment is exact-scope, case-bound, and audited where backed.
  - Internal notes are private, scoped, sanitized, and audited where backed.
  - Internal notes are never user-facing.
  - Universal canned reasons are templates only.
  - Canned reasons still require human review.
  - Coordinated-report detection is flags/signals only.
  - Coordinated-report detection does not auto-punish.
  - Repeated-offender aggregation is review/risk flags only.
  - Repeated-offender aggregation does not auto-punish.
  - Malicious reporting is handled without exposing reporter identity.
  - Urgent-report SLA owner and escalation are documented.
  - No auto-ban, auto-delete, auto-suspend, auto-restrict, auto-hide, or auto-punishment was added.
  - Safe public non-money systems remain enabled.
  - `live_money_enabled` remains OFF.
  - Creator-money remains OFF.
  - Premium public purchase remains OFF.
  - Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
  - No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.
- Next lane recommendation: Continue production readiness with provider dashboard ownership and access governance.

## Moderation Queue / Case Management / Escalation Governance Lane

- [x] Staff lifecycle commit `eb66492a80a50d9aa61b99fde58031f97a185654` was already aligned with `origin/main` before new edits.
- [x] Moderation queue, case management, and escalation governance repo-side proof closed.

Status:
- Verdict: Closed for repo-side queue separation, severity/SLA policy, privacy-safe notice templates, exact-scope action governance, proof, and guard coverage. Partial for broad general-case self-assignment, broad internal moderation case notes, universal canned-reason UI, coordinated-report automation, and universal repeated-offender automation where no backed model exists yet.
- Docs: `docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md`
- Proof script: `scripts/proof-moderation-queue-case-management-escalation-governance.mjs`
- Guard: `scripts/guard-moderation-queue-case-policy.mjs`
- Required truth:
  - Reports route to separated queues where appropriate.
  - Live safety reports are urgent.
  - DMCA/legal reports are separate from general moderation.
  - Payment disputes are support/money cases, not general moderation.
  - Appeals are separate from initial moderation review.
  - Moderators can act only with exact scopes.
  - Internal notes are private, scoped, sanitized, and audited where backed.
  - Actions require reasons where backed.
  - Actions are reversible where backed.
  - User-facing notices are templated and privacy-safe.
  - Creator-facing notices are templated and privacy-safe.
  - Reporter identity is not exposed.
  - Private evidence is not exposed.
  - Repeated offenders are flagged where supported.
  - Coordinated reporting is detected where supported or documented as follow-up.
  - Malicious reporting is handled.
  - Urgent report SLA is documented.
  - Safe public non-money systems remain enabled.
  - `live_money_enabled` remains OFF.
  - Creator-money remains OFF.
  - Premium public purchase remains OFF.
  - Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
  - No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.
- Next lane recommendation: Continue production readiness with provider dashboard ownership and access governance.

## Staff Access Lifecycle / Onboarding / Offboarding Governance Lane

- [x] Emergency-controls commit `7e03aa7b0a356ed436f172259ffcfb2680f4575c` was already aligned with `origin/main` before new edits.
- [x] Staff access lifecycle, onboarding, and offboarding governance repo-side proof closed.

Status:
- Verdict: Closed for repo-side governance, onboarding/offboarding policy, provider-dashboard manual checklist, proof/test account separation, service-account separation, proof, and guard coverage. Partial for full Supabase Auth forced logout and provider-dashboard offboarding automation, which remain manual/future lanes.
- Docs: `docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md`
- Proof script: `scripts/proof-staff-access-lifecycle-onboarding-offboarding-governance.mjs`
- Guard: `scripts/guard-staff-access-lifecycle-policy.mjs`
- Required truth:
  - Support is not a backend role.
  - Support-workflow access is exact-scope permission work.
  - Shared staff accounts are forbidden.
  - Proof/test accounts are separate from staff accounts.
  - Service accounts are not human staff accounts.
  - Staff actions must be attributable to one human account.
  - Staff access requires Owner/First Owner approval where backed.
  - Staff permissions are least-privilege.
  - Staff access should be temporary or reviewable by default.
  - Staff MFA is required where the identity/provider supports it.
  - Monthly staff access review is required.
  - Staff removal revokes app roles and scopes where backed.
  - Staff removal invalidates sessions where backed and documents manual/future full Auth logout if not backed.
  - Offboarding is audited.
  - Emergency staff removal is supported or documented as manual/future.
  - Provider dashboard offboarding is documented as manual checklist in this lane.
  - No provider dashboard access was changed.
  - Safe public non-money systems remain enabled.
  - `live_money_enabled` remains OFF.
  - Creator-money remains OFF.
  - Premium public purchase remains OFF.
  - Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
  - No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.
- Next lane recommendation: Continue production readiness with provider dashboard ownership and access governance.

## Emergency Controls / Incident Response / Kill-Switch Governance Lane

- [x] Audit-log commit `3aba0d4cc8ba044d9689498980b6d55c5f2bdcee` was already aligned with `origin/main` before new edits.
- [x] Emergency controls, incident response, and kill-switch governance repo-side proof closed.

Status:
- Verdict: Closed for repo-side governance, incident ownership/escalation, rollback checklist, privacy-safe templates, post-incident audit-review requirement, proof, and guard coverage. Partial for controls that remain manual/provider-dashboard/runbook-only or require a future exact backend lane.
- Docs: `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`
- Proof script: `scripts/proof-emergency-controls-incident-response-kill-switch-governance.mjs`
- Guard: `scripts/guard-emergency-controls-incident-response-policy.mjs`
- Required truth:
  - Safe public non-money systems remain enabled.
  - Emergency actions require exact scope, reason, and audit where backed.
  - First Owner / Owner owns emergency control authority.
  - Admin can operate only exact-scope emergency controls where explicitly allowed.
  - Moderator cannot operate broad emergency controls.
  - Support is not a backend role.
  - Emergency disable preserves evidence and does not hard-delete audit records.
  - Emergency disable does not execute refunds, purchases, payouts, transfers, or provider mutations.
  - Customer, creator, security, legal/DMCA, money, and live-room harassment templates are privacy-safe.
  - Post-incident audit review is required.
  - Rollback checklist exists.
  - Incident owner and escalation path are documented.
  - `live_money_enabled` remains OFF.
  - Creator-money remains OFF.
  - Premium public purchase remains OFF.
  - Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
  - Provider refunds remain manual/external.
  - No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.
- Next lane recommendation: Continue production readiness with provider dashboard ownership and access governance.

## Audit Log Integrity / Privileged Action Evidence Governance Lane

- [x] Audit log integrity and privileged action evidence governance repo-side proof closed.

Status:
- Verdict: Closed for current repo-side immutable audit governance, scoped readback, sanitized proof artifacts, and guard coverage.
- Docs: `docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md`
- Proof script: `scripts/proof-audit-log-integrity-privileged-action-evidence.mjs`
- Guard: `scripts/guard-audit-log-integrity-policy.mjs`
- Next recommended lane: Continue production readiness with provider dashboard ownership and access governance.

## Public Non-Money Feature Enablement / Launch Switchboard Lane

- [x] Admin Search commit `ca7ede034157d9f15d3c7fb4f25287d5bcf028a0` was already aligned with `origin/main` before new edits.
- [x] Public non-money feature enablement repo-side proof closed.

Status:
- Verdict: Closed for app-controlled public non-money switchboard, route/copy cleanup, and guard coverage. Full public release remains conditional on normal store/release work and external provider/owner actions.
- Docs: `docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md`
- Proof script: `scripts/proof-public-non-money-feature-enablements.mjs`
- Guard: `scripts/guard-public-non-money-feature-policy.mjs`
- Required truth:
  - This lane enables safe public app systems only.
  - `live_money_enabled` remains OFF.
  - Creator-money remains OFF.
  - Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
  - Provider refunds remain manual/external.
  - Premium annual remains provider-blocked.
  - Creator Channel Subscription remains provider-blocked.
  - Premium monthly public purchase remains separate owner-approved proof unless explicitly activated in a separate lane.
  - No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.
  - Admin/staff routes remain scoped.
  - Reporting, blocking, account restriction, legal/support/account deletion, and monitoring remain aligned.
  - Public paid creator video and Watch-Party Seat Pass checkout controls are disabled with safe unavailable copy unless live checkout runtime switches are explicitly enabled by a separate approved lane.
- Next lane recommendation: Continue production readiness with provider dashboard ownership and access governance.

## Admin Search / Support Readback Privacy / Export Governance Lane

- [x] Admin search privacy and export governance repo-side proof closed.

Status:
- Verdict: Closed for repo-side Admin Search governance, support readback minimization, and export-default denial; future suspicious-search alert automation and any bulk export remain separate Owner-approved lanes.
- Docs: `docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md`
- Proof script: `scripts/proof-admin-search-privacy-export-governance.mjs`
- Guard: `scripts/guard-admin-search-privacy-export-policy.mjs`
- Required truth:
  - Admin search requires exact scope.
  - Non-admin and unscoped attempts are denied.
  - Searches are audited with masked query preview.
  - Failed/denied searches are audited where supported.
  - Search results are minimized and bounded/paginated or safely limited.
  - Support-workflow readbacks are masked/minimized by default.
  - Moderator does not see full email by default.
  - Admin can see full email only with exact scope.
  - Phone/device search is disabled by default unless future case-scoped privacy review approves it.
  - Private chat/content evidence search requires exact scope and case/report/legal context.
  - Payment/provider search is masked/scoped summary only.
  - Deleted/de-identified users are not available in ordinary search.
  - Exports are disabled by default and require future Owner-approved audited lane.
  - No secrets, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, private provider IDs, raw payment credentials, or private evidence are exposed.
- Next lane recommendation: Continue production readiness with provider dashboard ownership and access governance.

## Money Admin Authority / Activation Governance Lane

- [x] Money admin authority and activation governance repo-side proof closed.

Status:
- Verdict: Closed for repo-side governance; future Premium public activation, creator-money activation, `live_money_enabled`, payout activation, Stripe Connect live use, merch checkout, and provider refund automation remain OFF or blocked until separate owner-approved lanes.
- Docs: `docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md`
- Proof script: `scripts/proof-money-admin-authority-activation-governance.mjs`
- Guard: `scripts/guard-money-admin-authority-policy.mjs`
- Required truth:
  - This lane does not activate money.
  - First Owner / Owner controls activation authority.
  - Premium monthly activation requires separate owner-approved purchase proof lane.
  - Premium annual remains provider-blocked.
  - Creator-money remains OFF.
  - `live_money_enabled` remains OFF.
  - Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
  - Provider refunds remain manual/external.
  - Manual refund support status can be recorded only with exact scope and audit.
  - Admin can view/manage only exact money-support scopes.
  - Moderator cannot activate money.
  - Provider transaction/customer/order data is masked/scoped.
  - Access grant revoke/removal requires exact scope, reason, target, and audit.
  - Dual approval is required for future payout activation and future `live_money_enabled`.
  - Emergency money kill switch is First Owner/Owner-controlled and audited.
  - No Google Play, RevenueCat, Stripe, payout, purchase, refund, or product mutation happened.
- Next lane recommendation: Continue production readiness with final store/release readiness and Play submission packet alignment, excluding known Google Play annual/channel base-plan provider blocker.

## Monitoring / Analytics / Crash / Runtime Diagnostics Final Alignment Lane

- [x] Monitoring, analytics, crash, performance, runtime diagnostics, and production health repo-side alignment closed.

Status:
- Verdict: Closed for repo-side alignment; final Firebase SDK/provider collection settings, release dashboard monitoring, and release log audit remain owner/provider confirmation items.
- Docs: `docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md`
- Proof script: `scripts/proof-monitoring-analytics-crash-runtime-diagnostics.mjs`
- Guard: `scripts/guard-monitoring-analytics-crash-policy.mjs`
- Runtime hardening:
  - Runtime error analytics no longer include exception message text.
  - Root-boundary support feedback no longer attaches raw error text.
  - User-facing runtime errors use safe copy.
  - Support/admin diagnostics are scoped and privacy-safe.
- Provider truth:
  - Firebase Analytics, Crashlytics, Performance, and Remote Config are the documented Firebase-first diagnostics stack subject to owner confirmation for the submitted build.
  - Sentry/PostHog remain disabled/not intended by current package evidence.
  - No new analytics vendor and no expanded data collection were added.
- Next lane recommendation: Continue production readiness with final store/release readiness and Play submission packet alignment, excluding known Google Play annual/channel base-plan provider blocker.

## Legal / Privacy / Data Safety Final Alignment Lane

- [x] Legal/privacy/account deletion/Data Safety repo-side alignment closed.

Status:
- Verdict: Closed for repo-side documentation alignment; attorney/legal review and Play Console acceptance remain external.
- Docs: `docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md`
- Proof script: `scripts/proof-legal-privacy-data-safety-final-alignment.mjs`
- Guard: `scripts/guard-legal-privacy-data-safety-policy.mjs`
- Required wording:
  - Legal/privacy/Data Safety final alignment: Closed / Partial / Blocked.
  - This is product/legal-readiness documentation alignment, not attorney legal advice.
  - Account deletion uses scheduled deletion, restore window where supported, and controlled purge/de-identification.
  - Legal/security/payment/support/moderation evidence retention exceptions are preserved.
  - Data Safety evidence map matches actual app behavior.
  - Privacy Policy matches account, chat, media, analytics, crash, purchase, moderation, notification, and live room behavior.
  - Reports do not auto-delete, auto-ban, or expose reporter identity.
  - Appeals use support/escalation workflow in V1.
  - Premium annual remains provider-blocked until Google Play base plan exists.
  - Creator-money remains OFF.
  - Provider refunds remain manual/external.
  - No payouts, Stripe Connect, merch checkout, payable balances, or money movement are live.
  - Public legal pages avoid proof/debug/internal wording.
  - No secrets, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, proof passwords, private provider IDs, or private dashboard data are exposed.
- Current behavior:
  - Public legal pages exist for Terms, Privacy, Support, Account Deletion, Copyright, Copyright Report, Refunds, Premium Terms, Live Rules, Community Guidelines, Moderation Policy, and Creator Monetization.
  - The public copyright policy no longer uses placeholder agent wording.
  - Account deletion language matches scheduled deletion, restore window, controlled purge/de-identification, and retention exceptions.
  - Data Safety and Play reviewer docs remain repo-prepared while final SDK/provider disclosure, attorney approval, and Play Console acceptance remain owner/legal external actions.
- Next lane recommendation: Continue production readiness with monitoring, analytics, crash, and runtime diagnostics final alignment.

## Sequential Production Proof Waves — Android First

### Seven-Flow Production Switchboard Lane

- [x] Seven-flow production switchboard readiness
- [x] Seven-flow production prep readiness
- [x] Seven-flow provider verification readiness
- [x] Creator-money production provider product cleanup/prep
- [x] Creator-money production provider product setup recheck plus Stripe payout/merch boundary doc
- [x] Owner-approved creator-money product IDs, starting prices, US-only-first posture, and custom-pricing fail-closed policy
- [x] Premium-first provider/readiness proof without creator-money activation

Status:
- Verdict: Partial
- Docs: `docs/SEVEN_FLOW_PRODUCTION_SWITCHBOARD.md`
- Production prep docs: `docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md`
- Provider verification docs: `docs/SEVEN_FLOW_PROVIDER_VERIFICATION.md`
- Proof script: `scripts/proof-seven-flow-production-switchboard.mjs`
- Production prep proof script: `scripts/proof-seven-flow-production-prep.mjs`
- Provider verification proof script: `scripts/proof-seven-flow-provider-verification.mjs`
- Creator-money production provider product proof script: `scripts/proof-creator-money-production-provider-products.mjs`
- Premium-first activation proof script: `scripts/proof-premium-first-activation.mjs`
- Latest Premium annual provider proof artifact: `/tmp/app-premium-annual-provider-proof-20260625-120313/`
- Google Play subscription/base-plan escalation packet: `docs/GOOGLE_PLAY_SUBSCRIPTION_BASE_PLAN_ESCALATION.md`
- Required classification:
  - Seven-flow app-side proof: Closed
  - Seven-flow production switchboard: Partial
  - Seven-flow production prep: Partial
  - Seven-flow provider verification: Partial
  - Creator-money production-labeled products: Partial
  - Creator-money production-labeled product IDs: Partial
  - Creator-money tax/legal/compliance plan: Partial
  - Creator-money product creation: Partial
  - Provider verification used browser dashboard evidence
  - Production activation switches remain OFF while setup switches are sandbox_only
  - Premium-first launch candidate: Pending owner activation/provider final check
  - Premium-first activation proof: Partial
  - Premium monthly: Verified at $9.99/month
  - Premium annual: Blocked at $99.99/year
  - Premium annual: Provider-blocked pending Google Play support/base-plan resolution
  - Premium public activation remains OFF
  - Creator-money setup flows: Usable in sandbox/not-payable mode / production activation requires owner/provider approval
  - Creator-money setup flows are sandbox/not-payable by default
  - Real-money activation: Off by default unless owner explicitly enables each flow
  - Creator payouts: Off unless separate payout lane enables them
  - Creator payouts remain OFF
  - Provider refunds: Manual/external unless separate provider-refund lane enables automation
  - Provider refunds remain manual/external
  - Production provider products are verified only where dashboard/API evidence exists
  - Sandbox-labeled IDs remain sandbox/test-only unless owner explicitly approves otherwise
  - Approved starting prices are launch defaults, not the only future prices
  - Future custom pricing requires provider-backed price tiers/products/base plans/offers
  - Unsupported custom amounts fail closed
  - United States only first
  - Stripe payout and merch prep documented separately
  - Stripe payouts remain OFF
  - Stripe merch checkout remains OFF
  - Channel Subscription base plan: Blocked
  - Channel Subscription remains provider-blocked until Google Play base plan issue is resolved
  - Creator Channel Subscription: Provider-blocked pending Google Play support/base-plan resolution
  - Google Play support packet: Submitted
  - Do not activate creator-money until production-labeled IDs are verified, mapped, smoke-tested, and owner-approved
- Result: Explicit switches are cataloged for Premium, Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, and Event Pass; existing backend money kill switches remain the enforcement foundation; production-prep provider mapping, owner activation checklist, Premium-first plan, creator-money future activation plan, support/refund/dispute policy, monitoring/readback expectations, rollback matrices, and provider verification blockers are documented; local product/config matches are proved; Google Play Console and RevenueCat browser dashboard evidence verifies the configured sandbox-labeled product IDs; owner chose clean production-labeled IDs before creator-money launch and approved the recommended starting prices plus United States only first; five one-time production-labeled Google Play product records were created as Draft records with Google Play-valid hyphenated purchase-option IDs (`tip-099`, `paid-video-099`, `ticket-099`, `vip-499`, `event-099`), United States-only availability, and approved starting prices; RevenueCat imported those five products as Draft consumables with no entitlement attachment and no Premium mapping; Google Play has the production-labeled channel subscription product record `cw_channel_subscription_monthly_499` / `Creator Channel Subscription` with `0` active base plans; focused blocker investigation found the `monthly` base plan remains missing because Google Play marks the `Base plan ID` field invalid before Save on both stale and clean Add base plan forms, even though `monthly` is plain ASCII and valid-format probes also stay invalid; `docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md` lists the provider fields Codex may fill, the owner-stop tax/legal/compliance fields, the RevenueCat mapping rules, refund/support/dispute stance, and Stripe separation; Premium-first activation proof verified Google Play `premium_subscription` monthly base plan `monthly` as Active, United States, `USD 9.99`, and verified RevenueCat `premium` offering package `$rc_monthly` mapped to `premium_subscription:monthly` plus entitlement `premium`; Premium annual remains blocked because the Google Play `premium_subscription` annual base-plan attempt reached approved values (`annual`, Yearly, United States only, `USD 99.99`) but Google Play kept `Base plan ID` invalid and returned `Your changes couldn't be saved`, leaving no saved annual base plan and no RevenueCat `premium_subscription:annual` / `$rc_annual` mapping; Play-installed Android versionCode `55` opened the Premium screen and showed Premium inactive plus creator-product separation; no Premium purchase sheet was opened and no purchase was completed; Premium public activation remains OFF; Channel Subscription RevenueCat import/mapping remains blocked until the matching Google Play base plan exists; Google Play support packet was submitted through Play Console Help on 2026-06-25 at 12:25 CDT and case ID is pending; no provider products/base plans were changed by support submission; custom pricing is documented as provider-backed only and unsupported custom amounts fail closed; Stripe dashboard access stopped at sign-in and is documented as future payout/physical-merch prep only; `live_money_enabled` and `payouts_enabled` remain off; Premium purchase remains closed by default; provider production activation remains blocked pending owner/provider approval.
- Safety confirmation: No live money, creator payouts, payable balances, withdrawals, cash-out, transfers, provider refunds, Premium product changes, Premium gate weakening, RLS weakening, LiveKit authority changes, participant-cap changes, auth/reset changes, scan-gate weakening, abuse-throttle removal, or block-enforcement removal.

### Enabled First Owner Authority And Succession Lane

- [x] First Owner authority, Owner succession, and Break Glass doctrine implemented repo-side.

Status:
- Verdict: Closed repo-side / enabled after validation and migration apply.
- Docs: `docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md`
- Migration: `supabase/migrations/20260625131000_first_owner_authority_succession.sql`
- Edge function: `supabase/functions/admin-owner-controls/index.ts`
- Proof script: `scripts/proof-first-owner-authority.mjs`
- Guard: `scripts/guard-first-owner-authority-policy.mjs`
- Required wording:
  - First Owner authority: Closed / Partial / Blocked.
  - Only First Owner can grant or revoke Owner.
  - First Owner cannot remove himself as the last active Owner.
  - First Owner self-step-down requires successor, password re-auth, generated single-use passcode, typed confirmation, reason, and audit.
  - Normal Owner dashboard viewing is not Break Glass.
  - Break Glass is documented and audited when used.
  - First Owner controls are enabled for authenticated First Owner after validation.
  - No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed.
- Current First Owner representation: the existing repo-controlled bootstrap active Owner row is preserved and the migration seeds the First Owner marker only when exactly one active Owner exists.
- Owner action items: apply the migration before production use; if production has multiple active Owners and no marker, select one existing active Owner as First Owner through the approved backend path; perform live Owner grant/revoke/succession proof only with owner-approved safe target accounts.
- Safety confirmation: No real owner/admin/staff roles changed during repo proof; no provider dashboard mutation; no Google Play product/base-plan mutation; no RevenueCat mapping change; no Premium public activation; no creator-money switches enabled; no `live_money_enabled`; no payouts/payable balances/withdrawals/cash-out/transfers; no Stripe payout/merch; no provider refunds; no RLS/auth/LiveKit/scan/abuse/block weakening; no plaintext passcodes stored; no raw IP/token/signed URL exposure added.

### Chat / Call Moderation And Notification Abuse Lane

- [x] Production chat/call moderation and notification abuse controls documented and proved repo-side.

Status:
- Verdict: Closed after validation.
- Docs: `docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md`
- Proof script: `scripts/proof-chat-call-moderation-notification-abuse.mjs`
- Guard: `scripts/guard-chat-call-moderation-notification-policy.mjs`
- Required wording:
  - Chat/call moderation and notification abuse controls: Closed / Partial / Blocked.
  - Specific chat messages can be reported.
  - Thread-level reports are supported where safely wired, or documented as follow-up.
  - Dedicated chat_thread report target: Closed / Partial / Blocked.
  - Chat-message hide/remove/restore: Closed / Partial / Blocked.
  - Users can report a whole chat conversation.
  - `chat_thread` reports target the exact thread internally.
  - Chat-message hide/remove/restore preserves evidence and does not hard-delete moderation/legal evidence.
  - Chat-message moderation actions require exact scope, reason, case/report context where applicable, and audit.
  - Staff private chat evidence access requires exact scope and case/report context.
  - Moderators/Admins cannot browse arbitrary private chats.
  - Blocked users cannot message, call, or ring each other.
  - Disabled/deleted/scheduled-deletion users fail closed for chat and calls.
  - Call/ring notifications are deduped or rate-limited.
  - Chat sends are rate-limited or documented as follow-up.
  - Support/moderation staff can see safe call metadata only with scope/context.
  - Support/moderation staff cannot see call audio/video content.
  - No call recording is introduced.
  - Attachments remain scan-gated.
  - Reported attachments remain evidence-preserved and case-scoped.
  - No private message bodies, reporter identity, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed.
- Current behavior:
  - Exact chat-message reports are wired through the shared report workflow as `chat_message` with thread/message context.
  - Thread-level reporting is wired through the shared report workflow as `chat_thread` with exact thread context.
  - Staff private chat evidence is scope/case/report constrained through `admin.chat_evidence.view` policy; no arbitrary staff private-chat browser is added.
  - Admin/Moderator direct chat-message hide/remove/restore is backed through report-linked target actions with exact scope, reason, case/report context, before/after audit, and evidence preservation.
  - Blocked/restricted users fail closed for chat sends and call/ring dispatch through backend guards, triggers, RLS, and Edge Function checks.
  - Call/ring notifications use server-side dedupe, safe payloads, delivery attempt audit, receipt reconciliation, sanitized errors, and token fingerprint/status readback only.
  - Attachments remain scan-gated and thread-scoped; reported attachments remain evidence-preserved and case-scoped.
- Next lane recommendation: Continue production readiness with account suspension/deactivation and appeals operations.
- Safety confirmation: No arbitrary staff private-chat browsing, unsafe message-body exposure, call recording, staff call audio/video visibility, blocked-user denial weakening, disabled/deleted/scheduled-deletion denial weakening, attachment scan weakening, LiveKit authority weakening, moderator publish-authority escalation, reporter identity exposure, token/raw URL/raw IP/push-token exposure, staff-role change, money/provider/payout activation, provider dashboard mutation, Google Play/RevenueCat mutation, RLS/auth/scan/abuse/block weakening, or First Owner touch.

Purpose:

This section tracks the remaining production-readiness proof lanes in grouped waves. The original 0–17 items are preserved inside these waves. Codex must work one wave at a time, report honestly, and check items off only when proof is complete.

Rules:

- Run one wave at a time.
- Do not start the next wave until the current wave is reported, committed, and the tracked working tree is clean.
- Use seeded proof users instead of random manual accounts.
- Prefer proof/audit first.
- Only make code changes if a real bug or missing production gap is found.
- Keep fixes small and focused.
- Do not raise participant caps without proof.
- Do not enable live money, payouts, cash-out, withdrawals, payable balances, production buy buttons, or real payout movement.
- Do not weaken Premium gates, RLS, route ownership, LiveKit authority, auth routing, or reset-password safety.
- Do not commit secrets, service-role keys, push tokens, LiveKit tokens, raw HLS URLs, signed storage URLs, proof credentials, SMTP keys, provider secrets, or tester passwords.
- BrowserStack remains deferred unless explicitly approved by the owner.
- Android-first remains the current production proof path.
- One physical Android device is available; use backend/API/headless proof where multi-device proof is impossible.
- Separate proof status into:
  - installed physical Android proof
  - backend/API fixture proof
  - headless/load proof
  - not proved
- Do not fake production closeout.

### Wave 0 — Seeded Proof Harness

- [ ] 0. Seeded Proof Harness

Required outcome:
- Reusable proof-only users exist or are documented.
- Roles, temp grants, proof IDs, expiration rules, and cleanup rules exist.
- Proof users are clearly marked as test/proof accounts.
- No real user data is used.
- No credentials or secrets are committed.
- Later waves can reuse the same seeded users.

Seeded proof users should cover at minimum:
- proof_host_001
- proof_creator_001
- proof_free_viewer_001
- proof_premium_viewer_001
- proof_blocked_001
- proof_circle_member_001
- proof_circle_non_member_001
- proof_call_caller_001
- proof_call_recipient_001
- proof_busy_call_user_001
- proof_paid_video_buyer_001
- proof_ticket_buyer_001
- proof_event_pass_buyer_001
- proof_subscriber_001
- proof_vip_001
- proof_deleted_pending_001
- proof_admin_operator_001, only if a safe operator proof path already exists

Wave 0 status:
- Verdict: Partial
- Commit: `Create seeded production proof harness`
- Proof artifacts: `docs/SEEDED_PROOF_HARNESS.md`; `scripts/proof-seeded-harness.mjs`
- Seeded users: canonical proof labels documented; existing ignored local proof env key names identified for host/creator/free viewer/viewer 02-09/blocked/Circle/member/non-member/subscriber/VIP fixtures; no new auth users created in this pass
- Cleanup status: no database/auth/provider/LiveKit/push/payment mutations performed, so there is nothing to revoke from Wave 0
- Remaining blockers: `proof_deleted_pending_001` is not created; some relationship/access labels have email/user id key names but no declared password key; Premium/subscriber/VIP/paid/room/event/operator roles still require future wave-specific exact-target temporary grants or provider-backed proof

### Wave 1 — Installed Build + Auth + Signed-Out Deep Links

Covers original lanes:
- [ ] 1. Installed Build + Runtime Truth
- [ ] 2. Auth + Signed-Out + Deep-Link Safety

Required outcome:
- Current installed Android build is identified by package id, versionCode, installer, runtime version, commit, and EAS update group if applicable.
- App launches.
- Home opens.
- Settings opens.
- Sign-in works.
- Sign-out works.
- Signup smoke passes if needed.
- Forgot/reset password opens reset-password screen, allows password update, clears recovery session, returns to login, and does not auto-enter Home before update.
- Signed-out public routes expose only allowed public content.
- Signed-out private routes deny safely.
- Deep links route safely through login when required.
- Notification/deep-link handoff does not leak sensitive params.
- No access token, refresh token, reset token, token hash, push token, LiveKit token, signed URL, or credential appears in logs or artifacts.

Wave 1 status:
- Verdict: Partial
- Commit: `cce95c5` initial Wave 1 proof; follow-up legal/reset fallback fix in current commit.
- Proof artifacts: `/tmp/chillywood-wave1-installed-auth-deeplink-proof-20260623-205523`; `/tmp/chillywood-wave1-followup-legal-reset-proof-20260623-214029`.
- Device/build: Physical Android `R5CR120QCBF` / `SM_N986U1`, package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `55`, installer `null` / direct APK install, last update `2026-06-23 21:49:14`.
- Seeded users used: Existing owner/proof login from ignored local proof-account env keys; no credentials committed.
- Code changes: Added Public Platform `platform-content-open-button` proof selector required by `guard:route-contracts`; fixed explicit public legal/support signed-out deep-link allowlist handling; fixed expired reset-link fallback actions so Request New Reset Email opens the reset request flow and Back to Sign In opens login on installed Android.
- Remaining blockers: Play/internal installer proof unavailable on the attached device; disposable proof inbox/reset email link proof unavailable, so real reset email delivery/password update proof remains pending.
- Safety confirmation: No secrets, credentials, service-role keys, auth tokens, push tokens, LiveKit tokens, payment changes, Premium behavior changes, RLS changes, LiveKit authority changes, live money/payout activation, or unrelated route ownership changes.

### Wave 2 — Creator Media Pipeline

Covers original lanes:
- [ ] 3. Creator Upload-to-Playback
- [ ] 4. VOD / Rendition Access Proof
- [ ] 5. Attachment-Heavy Comments
- [ ] 6. Malware Scan Gates

Required outcome:
- Creator uploads a real non-zero video from installed Android or a clearly documented safe proof path.
- Metadata saves.
- Draft/private/unpublished content stays hidden from non-owners.
- Published clean content appears on public Platform.
- Viewer playback works.
- Non-owner cannot edit/delete owner media.
- Owner can unpublish/delete and storage cleanup is proved or honestly reported pending.
- Free viewer rendition rules are enforced.
- Premium viewer rendition rules are enforced if a safe Premium proof user exists.
- Missing renditions show honest pending/unavailable state.
- Raw master/original files do not leak.
- Comments, replies, links, and attachments work where Public V1 requires them.
- Large files are blocked safely.
- Unsupported files are blocked safely.
- Deleted/hidden/reported attachments disappear where required.
- Scan-pending media does not appear publicly.
- Clean scanned media appears.
- Blocked/malware media stays hidden.
- Scanner-down behavior fails safe.
- Admin/operator scan readout is sanitized and does not reveal storage paths or secrets.

- Verdict: Partial — scan-safe production backend fix is deployed and proved; Android owner Platform Studio picker UX is fixed and installed-device source chooser proof passed; proof-only automated owner upload pipeline is closed without requiring manual native picker selection; backend/API attachment-heavy comments setup proof is closed; broader Wave 2 remains Partial because installed Android attachment-heavy picker proof, real rendition ladder files, scanner/operator failure-mode proof, and Play/internal installed proof remain pending.
- Commit: repo-side proof/fix `96f50b0`; scan-safe deploy/reproof `9ded763`; Android picker proof `53eff5b`; automated upload proof `768c949`; final closure setup follow-up commit pending.
- Proof artifacts: initial proof `/tmp/chillywood-wave2-creator-media-pipeline-proof-20260623-221042/`; deployed scan-safe reproof `/tmp/chillywood-wave2-scan-safe-deploy-reproof-20260623-222526/`; Android picker proof `/tmp/chillywood-wave2-android-picker-upload-proof-20260623-224954/`; automated upload proof `/tmp/chillywood-wave2-automated-upload-proof-20260623-233959/`; final closure setup proof `/tmp/chillywood-wave2-final-closure-setup-proof-20260624-065220/`.
- Device/build: Physical Android `R5CR120QCBF`, package `com.chillywood.mobile`, versionCode `55`, versionName `1.0.0`, direct APK install timestamp `2026-06-23 22:50:11`; app launch, owner login, Platform Studio, upload source chooser, cancel, Photos/Gallery source, and Files source proved in Android picker follow-up; public Player deep link proved in initial Wave 2 proof.
- Seeded users used: local ignored proof env owner suffix `e66c6f72`; viewer suffix `75d4c718`; no credentials, JWTs, service-role keys, signed URLs, or passwords committed.
- Media ids: clean public fixture `c1a45740-26cc-4a64-91da-caf16284fc33`; clean S3 media-storage fixture `3de36e39-67e6-45ca-a12f-d5b1560473cb`; temporary pending-scan fixtures `ce50347e-e9d0-46f8-b9cd-b92be30c3421` and S3-backed proof row were created and deleted during deployed reproof.
- Storage objects: temporary non-zero proof MP4 objects were uploaded under owner-prefixed `creator-videos`/S3 paths and removed during cleanup; automated upload proof video `ba4da219-a6b3-4c83-98f2-b7a4948e6679` uploaded a 25,554-byte MP4 through `media-storage`, inserted draft metadata with `scan_status = pending_scan`, verified owner read/public and non-owner denial, verified non-zero storage readback, and deleted the row/object; artifacts contain only redacted object-key references and no signed URLs.
- Code changes: tightened creator media scan-safe gates for public creator card reads, `media-storage` creator-video/rendition/social-attachment download authorization, creator-video table/storage RLS helper, visibility resolver, VOD playback resolver, historical `videos` select policy cleanup, and social attachment public metadata RLS; added guard coverage; added Chi'llywood-native upload source chooser before native media selection with explicit Photos/Gallery, Files, and Cancel actions while preserving the existing document picker path and 5 GiB creator video upload validation; added proof-only automated creator upload and final Wave 2 closure setup scripts.
- Deployment/reproof: `supabase db push` applied `20260623170000_creator_media_scan_safe_playback_resolver.sql` and `20260624032823_tighten_creator_video_scan_safe_select_policy.sql`; `public-creator-video-cards` deployed ACTIVE version `11`; `media-storage` deployed ACTIVE version `61`; final `supabase db push --dry-run` reports remote database up to date. Pending-scan public creator media is blocked from public cards, anon/non-owner read model, Player/VOD resolver, and non-owner `media-storage` download. Owner access remains safe. Clean public media still appears and resolves playback honestly.
- Closure setup/reproof: final closure proof created a temporary creator-video comment, reply, and social attachment through authenticated proof users, proved link body/readback, supported attachment upload, oversized attachment block, unsupported MIME block, non-owner comment delete denial, pending-scan attachment hiding from anon/public reads, non-owner `media-storage` denial, cleanup, and artifact secret scan. It found and fixed a narrow social attachment pending-scan metadata leak by applying `20260624115132_tighten_social_attachment_scan_safe_select.sql`; reproof passed. VOD resolver remains safe and honest but no real rendition ladder was detected.
- Remaining blockers: Play/internal installed proof is still unavailable on the attached device; native Android DocumentsUI file row selection did not complete under ADB/Maestro automation on the single physical device, but manual native picker selection is no longer required for upload pipeline closeout because the real picker UX is installed-proved and the upload pipeline is closed by the proof-only automated harness; real VOD rendition ladder files were not present for full free/Premium quality proof; installed Android attachment-heavy picker/comment proof remains pending despite backend/API proof; scanner-down/operator failure-mode proof and EICAR simulation were not run because they require a controlled operator window.
- Safety confirmation: No payment, Premium entitlement, live money, payout, RevenueCat, Stripe, Google Play, LiveKit authority, auth/reset, or route ownership behavior changed; no RLS weakening; no fake media rows, fake scan success, fake rendition success, secrets, credentials, signed storage URLs, push tokens, or LiveKit tokens were committed.

### Wave 3 — Capacity + Calls + Notifications + Network Recovery

Covers original lanes:
- [ ] 7. Capacity + LiveKit + Chi'lly Chat Calls + Notifications
- [ ] 9. Network / Background / Restart Recovery
- [ ] 10. Android Notification Channel Upgrade Behavior

Required outcome:
- Current real/proved limits are documented for:
  - Live Stage total participants
  - Live Stage active camera/mic seats
  - Live Stage passive viewers/listeners
  - Live Watch-Party total participants
  - Live Watch-Party active camera/mic seats
  - Watch-Party Live total participants
  - Watch-Party Live active camera/mic seats
  - Party Room shared-player participants
  - Chi'lly Chat voice call participants
  - Chi'lly Chat video call participants
  - chat thread participants
- Configured app cap, backend/token cap, UI/display cap, active media cap, proved runtime cap, and unproved theoretical cap are separated.
- Host join, viewer join, speaker request, host approve, camera publish, mic publish, 5th speaker denial, blocked user denial, Circle member/non-member behavior, reconnect, room cleanup, and 10-passive-viewer headless/load proof are attempted where possible.
- Server CPU/RAM/bandwidth/TURN metrics are captured if available. If unavailable, report metrics unavailable and do not claim scale readiness.
- Chi'lly Chat proves or reports pending:
  - voice invite
  - video invite
  - foreground incoming sheet
  - background push/ring
  - killed-app tap routing
  - accept
  - decline
  - missed timeout
  - busy
  - caller cancel
  - end call
  - max 4 participants
  - 5th participant denial
  - call history card
- Notification matrix includes:
  - chat message
  - voice call incoming ring
  - video call incoming ring
  - missed call
  - declined/canceled/busy call state
  - followed creator live
  - Circle friend live
  - event starts soon
  - public upload
  - replay later / replay ready
  - Save Replay processing/ready if implemented
  - comment/reply if implemented
  - mention if implemented
  - moderation/report status if implemented
  - Premium/payment if implemented
  - system/admin announcement if implemented
- Android notification channels are proved:
  - chilly_chat_messages
  - chilly_chat_calls_v2
  - chilly_chat_missed_calls
- Fresh install and upgraded install behavior are separated.
- Old `chilly_chat_calls` channel does not incorrectly silence or override `chilly_chat_calls_v2`.
- Background call notification uses `chilly_chat_calls_v2`, not generic/default channel.
- Message notifications do not use call ringtone.
- Missed-call notifications use missed-call channel.
- Foreground, background, killed app, locked screen, permission denied, permission allowed, vibration on/off, ringtone on/off, and Silent / Vibrate Only are documented where possible.
- App background, phone lock, app restart, network drop, host disconnect, viewer rejoin, stale membership, stale room, and call invite expiration behavior are proved or honestly marked pending.

Wave 3 status:
- Verdict: Partial — the core Wave 3 foundations are already closed in focused prior lanes, but the whole grouped wave remains Partial because real-device passive viewer scaling, TURN/cellular allocation, broader notification-category runtime proof, and network/background/restart recovery sweeps are still not fully proved.
- Commit: Chi'lly Chat call push proof `e12435c`; LiveKit server metrics readback `e2b0517`; LiveKit passive viewer load proof `ea0e9d9`; this Wave 3 tracker update commit pending.
- Proof artifacts: older baseline report `artifacts/capacity-notifications-seeded-users-20260623/REPORT.md`; LiveKit metrics and passive-load proof are recorded in `docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md`; Chi'lly Chat call push proof is represented by the committed dispatcher/guard path and prior installed-device call-push closeout.
- Device/build: prior installed-device proofs used physical Android `R5CR120QCBF / SM_N986U1`, package `com.chillywood.mobile`, versionCode `55`, versionName `1.0.0`, direct APK where Play/internal proof was not available. Do not claim Play/internal proof unless installer readback is `com.android.vending`.
- Seeded users used: local ignored proof env users from `docs/SEEDED_PROOF_HARNESS.md` where available; no proof credentials, JWTs, push tokens, LiveKit participant tokens, or service-role keys are committed.
- Room ids: LiveKit passive-load proof run `livekit-passive-load-20260624003534` against `chillywood-prod-01`; synthetic room used one synthetic publishing host and 10 synthetic passive LiveKit Node RTC subscribers through the deployed token endpoint.
- Call invite ids: backend/provider Chi'lly Chat call push proof used safe proof fixtures and proved voice/video dispatch, missed dispatch, blocked/nonmember denial, signed-out denial, and token leakage checks; exact invite ids remain in redacted proof artifacts, not in source.
- Notification ids: Android channels proved for `chilly_chat_messages`, `chilly_chat_calls_v2`, `chilly_chat_missed_calls`, and default activity; incoming calls use `chilly_chat_calls_v2`, missed calls use `chilly_chat_missed_calls`, and stale `chilly_chat_calls` is not the new call-push channel.
- Code changes: completed before this tracker update. `e12435c` added server-side Chi'lly Chat call dispatch and push policy guard; `e2b0517` added LiveKit metrics schema/function/script/guard; `ea0e9d9` added passive viewer load proof tooling/guard. No participant caps, Premium gates, money, payouts, or unrelated LiveKit authority were changed.
- Capacity truth: active camera/mic seats remain capped at 4. Safe current claim is `4 active camera/mic seats plus 10 synthetic passive viewers/subscribers proved under measured chillywood-prod-01 conditions`. This is not proof of 10 real mobile devices and does not close TURN/cellular allocation.
- Notification truth: Chi'lly Chat foreground call behavior and Android background call push/ringing path are closed for the focused call lane; broader categories such as chat-message push, Save Replay ready, comment/reply, mention, moderation/report, Premium/payment, and system/admin announcements remain pending unless separately backed/proved.
- Network/recovery truth: stale room handling, old-room guards, refresh policy, and room/token fail-safe guards pass, but full installed background/phone-lock/restart/network-drop/host-disconnect/viewer-rejoin recovery remains pending beyond the focused proofs already recorded.
- Remaining blockers: real-device passive viewer proof; TURN/cellular allocation proof; two-or-more real-device media performance proof; broader notification matrix runtime proof; fresh-install/upgraded-install channel migration proof; app background/phone lock/app restart/network drop/host disconnect/viewer rejoin sweep; Play/internal installed proof where specifically required.
- Safety confirmation: No RevenueCat, Stripe, Google Play billing, payouts, live money, Premium entitlement behavior, creator monetization, RLS, auth/reset routing, scan gates, active speaker caps, Watch-Party route ownership, or unrelated LiveKit authority changed. No service-role keys, push tokens, LiveKit tokens, participant tokens, TURN credentials, signed storage URLs, raw HLS URLs, proof credentials, or provider secrets were committed.

Wave 3.5 follow-up status:
- Verdict: Partial — shared fullscreen regression remains covered by prior installed/static proof, and 25 seeded passive synthetic capacity passed for both Live Stage and Watch-Party Live under measured `chillywood-prod-01` conditions. The grouped wave remains Partial because this is synthetic/headless proof, not 25 real phones, and TURN/cellular, real-device passive scaling, active shared-room fullscreen runtime fixture proof, and broad network/restart recovery are still pending.
- Commit: this Wave 3.5 tracker/proof-harness commit pending.
- Proof artifacts: `/tmp/chillywood-wave3-5-fullscreen-25-passive-proof-20260624-072223/`; Live Stage output `live-stage-25-passive.json`; Watch-Party Live output `watch-party-live-25-passive.json`; proof README in the same folder.
- Shared fullscreen proof: standalone Player fullscreen remains covered by `/tmp/chillywood-standalone-player-overlay-fullscreen-proof-20260604/`; shared Watch-Party fullscreen rails remain covered by `/tmp/chillywood-shared-player-fullscreen-bubble-reuse-proof-20260605/`; current source still has `player-fullscreen-button`, Android Back fullscreen exit, orientation restore, `sharedFullscreenRailsLayout`, left comments rail, center stage, and right participant rail. Active installed shared-room fixture proof was not rerun in this pass.
- 25 seeded passive proof: proof harness now supports `LIVEKIT_PASSIVE_VIEWER_COUNT=25` and `LIVEKIT_PASSIVE_LOAD_SURFACE=live-stage|watch-party-live`; it fills missing viewer fixtures with temporary proof-only auth users and deletes them during cleanup. No permanent elevated roles are created for passive identities.
- Live Stage 25-passive result: passed. One synthetic host published audio/video; 25 passive viewers connected with viewer/no-publish tokens; unauthorized speaker request downgraded to viewer/no-publish; passive publish attempt denied; 60-second stability window; during-load metrics showed 26 participants, 1 publisher, CPU 1.52%, RAM 34.84%, network rx/tx 16172/36865 Bps, TURN `proof_pending`.
- Watch-Party Live 25-passive result: passed. One synthetic host published audio/video; 25 passive viewers connected with viewer/no-publish tokens; unauthorized speaker request downgraded to viewer/no-publish; passive publish attempt denied; 60-second stability window; during-load metrics showed 26 participants, 1 publisher, CPU 2.02%, RAM 35.01%, network rx/tx 12609/33648 Bps, TURN `proof_pending`.
- Cleanup truth: both harness runs disconnected all 26 local RTC rooms, marked the proof room ended, deleted 16 temporary proof viewers, and restored temporary operator proof grants. Immediate after-load registry metrics still reported stale participant counts, so instant metrics convergence after cleanup is not claimed.
- Safe capacity wording: Current active camera/mic cap remains 4. 25 seeded passive proof is synthetic/headless unless explicitly proved on real devices. Do not claim 25 real phones or 25 active publishers. Do not raise production participant caps until real-device/load proof and server metrics support it. Safe claim from this pass: `25 seeded passive synthetic viewers/subscribers proved under measured conditions for Live Stage and Watch-Party Live, active camera/mic remains capped at 4`.
- Remaining blockers: real-device 25-passive proof; TURN/cellular allocation proof; active Watch-Party shared fullscreen installed-room fixture proof; network drop/reconnect/background/restart sweep; instant post-cleanup metrics convergence proof; Play/internal installed proof where specifically required.
- Safety confirmation: No RevenueCat, Stripe, Google Play billing, payouts, live money, Premium entitlement behavior, creator monetization, RLS, auth/reset routing, scan gates, active speaker caps, Watch-Party route ownership, or unrelated LiveKit authority changed. No service-role keys, push tokens, LiveKit tokens, participant tokens, TURN credentials, signed storage URLs, raw HLS URLs, proof credentials, or provider secrets were committed.

### Wave 4 — Abuse / Spam / Rate Limits

Covers original lane:
- [ ] 8. Abuse / Spam / Rate Limits

Required outcome:
- Prove or report gaps for:
  - call invite spam
  - chat spam
  - seat request spam
  - room creation spam
  - upload spam
  - report spam
  - DMCA/report form spam
  - password-reset spam
  - duplicate notification prevention
  - blocked-user harassment prevention
  - muted/blocked users triggering calls or notifications
  - excessive push/ring loops
- Backend-side controls must be identified separately from UI-only controls.
- If rate limits are missing, report them as production gaps instead of faking success.

Wave 4 status:
- Verdict: Partial — runtime mutation proof passes for the new backend controls using approved proof accounts, Wave 4.2 enforces/proves blocker-owned room denial for Live Stage and Watch-Party Live joins, LiveKit token issuance, seat requests, and room/seat-request notification prevention, and Wave 4.3 adds/proves backend Profile/Platform follow/request denial for blocked relationships. Password reset/auth email spam remains provider/operator proof pending and outside Wave 4.3 scope.
- Commit: Wave 4 audit `4b47ab5`; backend controls `da5cbdb`; runtime proof `65b175d`; room-level block policy `6497517`; current Wave 4.3 Profile/Platform block proof commit pending.
- Proof artifacts: `docs/WAVE4_ABUSE_RATE_LIMIT_PROOF.md`; `scripts/proof-wave4-abuse-rate-limits.mjs`; `scripts/proof-wave4-runtime-mutation-and-blocks.mjs`; `scripts/proof-wave4-room-level-blocks.mjs`; `scripts/proof-wave4-profile-platform-blocked-routes.mjs`; static proof folder `/tmp/app-wave4-abuse-rate-limit-fix-proof-*`; runtime mutation/block proof folder `/tmp/app-wave4-runtime-mutation-block-proof-20260624134605`; room-level block proof folder `/tmp/app-wave4-room-level-block-proof-20260624134636`; Profile/Platform block proof folder `/tmp/app-wave4-profile-platform-block-proof-*`.
- Seeded users used: no new users were created; runtime proof used approved ignored local proof env keys for owner, viewer, caller, recipient, and other proof accounts. Proof rows were cleaned up after the bounded run.
- Abuse cases tested:
  - Call invite spam: Pass. Runtime proof allowed the first invite, blocked duplicate active ringing invite creation, enforced caller/thread/callee cooldown, and blocked call dispatch/ring for an audience-blocked pair.
  - Chat spam: Pass. Runtime proof allowed a valid message and blocked empty, oversized, rapid, duplicate, non-member, and blocked-relationship chat writes.
  - Seat request spam: Pass for durable path. Runtime proof enforced durable Watch-Party seat-request marker throttling. Wave 4.2 also denies blocked users from creating seat-request marker messages in blocker-owned Live Stage and Watch-Party Live rooms. LiveKit token issuance still keeps active camera/mic capped at 4 and downgrades unapproved/over-cap users to viewer/no-publish.
  - Room creation/join spam: Pass for creation cooldowns, join idempotency, and blocker-owned room denial. Runtime proof enforced Watch-Party and communication-room creation cooldowns. Wave 4.2 denies blocked users from joining blocker-owned Live Stage and Watch-Party Live rooms while preserving unrelated viewer joins/seat requests.
  - Upload spam: Pass. Runtime proof confirmed zero-byte upload URL requests now block before signing and rapid upload URL initiation throttles.
  - Comment/reply spam: Pass. Runtime proof allowed valid comment/reply, blocked empty comments, throttled duplicate/rapid comments, and denied blocked-user comments on blocker-owned creator-video content.
  - Report/DMCA spam: Pass. Runtime proof allowed first valid safety report/DMCA proof submission and throttled the third same-target submission.
  - Password-reset/auth email spam: Pending. Supabase Auth/provider throttling is expected but not proved with a safe inbox/operator path in this lane.
  - Duplicate notification prevention and ring loops: Pass for backed dispatch paths. `notification_event_dedupes`, delivery attempts, preference filtering, call/missed channels, and `DeviceNotRegistered` token revocation exist. Wave 4.2 proves blocked room/seat-request attempts create no host notification for the proof rooms. Broader notification runtime sweeps remain Wave 3 pending.
  - Blocked-user harassment prevention: Pass for the non-provider runtime surfaces covered by Wave 4. Runtime proof passes for blocked chat write denial, blocked call dispatch/ring suppression, blocked creator-video comment denial, chat/call/comment notification prevention by failed source action, Wave 4.2 blocker-owned Live Stage / Watch-Party Live join, LiveKit token, seat-request, and room/seat-request notification prevention, and Wave 4.3 Profile/Platform follow/audience-request backend denial plus unrelated viewer regression. Reports remain intentionally available for safety. Installed Profile/Platform screenshots are best-effort and require a device session logged in as the blocked proof user.
- Code changes: added Wave 4.1 runtime proof harness; added a narrow comment-trigger type repair migration; fixed `media-storage` zero-byte upload validation; added Wave 4.2 room-level block migration, LiveKit token denial, and room-block proof harness; added Wave 4.3 Profile/Platform follow/request block triggers, client helper blocked-state handling, and Profile/Platform block proof harness; updated Wave 4 proof docs/status. No app UI, payment, Premium, LiveKit authority loosening, participant cap, scan-gate, or media visibility weakening.
- Remaining blockers: provider proof for password-reset/auth email throttling; installed Profile/Platform screenshot proof if no physical Android session is logged in as the blocked proof user.
- Safety confirmation: No secrets, credentials, service-role keys, push tokens, LiveKit tokens, signed URLs, payment changes, Premium entitlement changes, RLS weakening, LiveKit authority loosening, participant cap increases, fake production users, fake proof UI, or broad route ownership changes. Safety/report and public legal/support routes were not changed.

### Wave 5 — Account Lifecycle + Admin/Support + Refund/Revoke

Covers original lanes:
- [ ] 11. Account Deletion / Restore
- [ ] 12. Support / Admin Operations
- [ ] 13. Refund / Revoke / Expired-Access Proof

Required outcome:
- Account deletion request works from the intended in-app path.
- 30-day restore window behavior works if currently implemented.
- Restore works if currently implemented.
- Deleted/disabled account behavior is clear.
- Deleted users cannot receive calls/notifications if that is the intended production rule.
- Posts, comments, uploads, chats, reports, purchases, moderation records, and legal/audit records behave according to policy.
- Admin/support can find:
  - users
  - reports
  - failed uploads
  - notification attempts
  - purchase/access issues
  - failed LiveKit/token issues if visible
- Admin/support can hide/remove/restore content where backed.
- Admin/support can revoke bad proof/temp grants.
- Non-admin access is denied.
- Audit trails exist for sensitive actions.
- Refund/revoke/expired-access proof covers where provider tooling allows:
  - Premium
  - paid video
  - Watch-Party Seat Pass
  - event pass
  - channel subscription
  - VIP
  - duplicate webhook
  - late webhook
  - refund
  - revoke
  - expiration
  - access removal
- Do not fake provider events.
- Do not manually mutate access as proof.

Wave 5 status:
- Verdict: Partial / account deletion visibility, admin/support privacy, DMCA privacy, Premium revoke, and sandbox access revoke proved. Remaining app-controlled launch blockers moved to Wave 5.1: disabled/deactivated private-feature denial sweep and admin/operator suspend/deactivate support-action proof.
- Commit: c9e8858
- Proof artifacts: `docs/WAVE5_ACCOUNT_ADMIN_REVOKE_PROOF.md`; `scripts/proof-wave5-account-admin-revoke.mjs`; latest runtime artifact `/tmp/app-wave5-account-admin-revoke-proof-20260624144115/`.
- Seeded users used: approved ignored local proof accounts for owner/operator suffix `e66c6f72`, viewer suffix `75d4c718`, Premium proof user suffix `a936464b`, and deletion candidate suffix `c1a446fa`; no credentials or passwords committed.
- Account ids: suffix-only proof readbacks are stored in the artifact; scheduled deletion request, safety report, DMCA case, sandbox grant, and ledger proof rows were cleaned up after runtime proof.
- Provider/order ids if safe: none. Real provider refunds were not run; sandbox revoke proof used setup/sandbox rows only and returned `providerRefundClaimed=false` plus `liveMoneyAction=false`.
- Code changes: added Wave 5 proof harness and proof doc; added migration `20260624150600_restore_account_deletion_profile_platform_visibility.sql` after runtime proof found a real regression where the newer Profile visibility bridge had dropped the scheduled-deletion public Profile check. The migration restores scheduled-deletion fail-closed behavior for Profile and Public Platform resolver wrappers.
- Wave 5.1 — Disabled/Deactivated Access + Admin Suspend Proof: Closed by current Wave 5.1 pass. Runtime proof with approved proof accounts shows owner/operator suspend, non-admin denial, sanitized audit readback, restore/reactivation, and restricted-account denial for chat thread creation, message sending, call/ring creation, communication room creation/join, Watch-Party room creation/join, LiveKit token issuance, seat/camera request markers, media upload URL initiation, creator-video metadata/publish, and creator-video comments/replies. Restricted accounts can still use safety/support report intake. Private-feature notification prevention is proved by source-write denial before notification-producing state exists.
- Carry-forward external/policy blockers: Wave 4 password reset/auth email provider proof; real provider refund execution remains manual/external. Installed Android account deletion/restore visual proof, installed blocked-viewer visual proof, Play/internal versionCode `55` proof, Firebase dashboard receipt, and controlled account purge/de-identification are closed by later lanes.
- Safety confirmation: No secrets, credentials, service-role keys, provider/payment keys, push tokens, LiveKit tokens, signed URLs, proof passwords, local env files, payment provider calls, Premium pricing/product changes, live money, payout, RLS weakening, LiveKit authority loosening, participant cap increase, fake proof users in production UI, or broad route ownership changes.

### Wave 6 — Legal Consistency + Rollback + Analytics + Final Go/No-Go

Covers original lanes:
- [ ] 14. Legal / Support Copy Consistency
- [ ] 15. Rollback / Incident / Kill-Switch Proof
- [ ] 16. Analytics / Crashlytics No-Secret Proof
- [ ] 17. Final Combined Go / No-Go Regression

Required outcome:
- Legal/support copy matches current app behavior.
- Platform terminology is current.
- Privacy/support text matches real providers and data flows.
- Money/payout copy does not promise unavailable live money or payouts.
- Rollback path is documented and proved where possible for:
  - bad EAS update
  - bad Play/internal build
  - bad Supabase Edge Function deploy
  - bad migration/read regression
  - bad notification dispatcher
  - bad LiveKit room behavior
- Kill switches or safe-disable paths are documented for:
  - Live Stage
  - Watch-Party Live
  - notifications
  - money surfaces
  - paid creator features
  - creator upload/display if needed
- Known-good build/update/function versions are recorded.
- Crash/errors are visible and useful.
- Analytics/Crashlytics/logs do not expose:
  - access tokens
  - refresh tokens
  - reset tokens
  - token hashes
  - push tokens
  - LiveKit tokens
  - signed storage URLs
  - service-role keys
  - provider secrets
  - proof credentials
- Final combined regression covers:
  - fresh install
  - login
  - upload
  - playback
  - chat
  - call
  - notifications
  - Live Stage
  - Watch-Party Live
  - Save Replay
  - paid access
  - refund/revoke
  - account deletion
  - admin/support
  - signed-out deep links
  - crash/log safety
- Final decision must be one:
  - Launch candidate
  - Partial
  - Blocked

Wave 6 status:
- Verdict: Conditional Go — legal/copy/runbook/analytics readiness is audited, public legal route contracts remain explicit, money/refund/payout copy stays honest, telemetry email identity was removed from Firebase Analytics/Crashlytics, and the final password reset/auth email provider blocker is closed on the Play-installed versionCode `55` runtime.
- Commit: current Wave 6 proof commit pending.
- Proof artifacts: `docs/FINAL_PUBLIC_USE_GO_NO_GO.md`; `scripts/proof-wave6-final-readiness.mjs`; latest read-only artifact `/tmp/app-wave6-final-readiness-proof-20260624T162117/`.
- Device/build: source package id `com.chillywood.mobile`, versionCode `55`, versionName `1.0.0`; no installed Android behavior proof was required because this was a documentation/proof plus narrow telemetry-redaction lane.
- Code changes: added read-only Wave 6 final readiness proof script and final Go/No-Go doc; removed signed-in email identity from Firebase Analytics user properties, Crashlytics attributes, and the dev analytics identity mirror.
- Final Blocker Closeout after Wave 5.1: app-controlled Wave 5.1 blockers are closed. Remaining known blockers are classified as:
  - Password reset/auth email provider proof: `Closed`; dedicated proof inbox delivery, app-link recovery, password update, backend auth with the rotated proof credential, installed Home/Settings sign-in, and expired-link fallback passed on the Play-installed versionCode `55` runtime.
  - Real provider refund execution path: `Accepted manual/external`; provider refund execution is not automated/proved, refund handling remains manual/external, and the app must not claim instant or automatic provider refunds.
  - Permanent purge/de-identification: superseded by the dedicated proof-account lane; policy boundary, owner/operator-only RPC, dry-run, proof-only disposable-account mutation, denial safeguards, public fail-closed readback, private-feature denial, and audit/support privacy are closed. No real-user purge, broad auto-purge job, or legal compliance claim is made.
  - Installed Android account deletion/restore visual proof: `Closed`; Play-installed UI/copy, immediate scheduled-state copy, restore/cancel visual proof, and backend cleanup readback passed.
  - Installed Android blocked-viewer visual proof: `Closed`; Play-installed blocked-viewer Profile/Platform routes showed blocked/unavailable state, obvious message/call/follow harassment actions were not exposed, unrelated-viewer regression passed, and temporary fixture cleanup passed.
  - Play/internal proof where prior lanes used direct APK/backend proof: superseded by Play v55 Upload/Install Closeout below; versionCode `55` is now installed from Google Play with installer `com.android.vending`.
  - Firebase dashboard receipt proof: `Closed` by later browser readback; Firebase packages/config/redaction are repo-proved, and Console receipt is now documented in the full launch-condition closeout artifact.
- Launch Candidate Installed Proof:
  - Artifact: `/tmp/app-launch-candidate-installed-proof-20260624T191018Z/`.
  - Device/build: physical Android `R5CR120QCBF / SM-N986U1`, Android 11, package `com.chillywood.mobile`, versionCode `55`, versionName `1.0.0`, installer `null`, first install `2026-06-22 15:54:35`, last update `2026-06-24 11:25:01`.
  - Direct APK installed smoke: `Pass`; installed app launched with no fatal crash in the captured logcat window, Home was visible, Settings opened from Home, and artifact token/secret scan was clean.
  - Play/internal launch-candidate installed smoke: `Pending installed proof`; current installer readback is `null`, not `com.android.vending`.
  - Installed account deletion/restore visual proof: `Pending installed proof`; backend/runtime proof remains the source of truth, and installed mutation requires an approved proof-account session plus explicit mutation approval.
  - Installed blocked-viewer visual proof: `Pending installed proof`; backend/runtime block enforcement remains the source of truth, and installed visual proof requires blocker, blocked-viewer, and unrelated-viewer installed sessions or a safe account-switching harness.
  - Firebase dashboard receipt proof: `Closed` by later browser readback; Firebase packages/config/redaction remain repo-proved, and Console receipt is now documented in the full launch-condition closeout artifact.
- Focused Play/Internal Installed Smoke Proof:
  - Artifact: `/tmp/app-play-internal-installed-smoke-proof-20260624-141445-rerun/`.
  - Device/build: physical Android `R5CR120QCBF / SM-N986U1`, Android 11, package `com.chillywood.mobile`, versionCode `55`, versionName `1.0.0`, installer `null`, first install `2026-06-22 15:54:35`, last update `2026-06-24 11:25:01`.
  - Play/internal installed proof: `Pending installed proof`; required pass condition was not met because installer is `null`, not `com.android.vending`.
  - Direct APK installed smoke remains `Pass`; installed app launched with no fatal crash in the captured logcat window, Home was visible, Settings opened from Home, and artifact token/secret scan was clean.
  - Signed-out legal/support, signed-out private-denial, and Premium-gate installed smoke were not reclassified as Play/internal proof because the installed source is not Play/internal. Existing route-contract/runtime guards remain validation support, but Play/internal proof still requires a Play-installed runtime.
  - Firebase dashboard receipt proof is now `Closed` by browser readback in the full launch-condition closeout artifact.
- Full Launch Condition Closeout:
  - Artifact: `/tmp/app-full-launch-condition-closeout-proof-20260624-142550/`.
  - Play Console browser readback: internal testing track is active and available to internal testers; latest visible internal release is `1.0.0`, released Jun 19, with versionCode `54`. Tester list exists, but the exact attached-device Google account was not verified because that would require private account inspection or owner confirmation.
  - Play/internal installed proof remains `Pending installed proof`: the launch-candidate repo/device versionCode is `55`, the Play internal visible release is versionCode `54`, and the attached device still reports installer `null`.
  - Firebase dashboard receipt proof is `Closed`: browser readback confirmed Firebase Console access for project `chillywood-app`, Android app package `com.chillywood.mobile`, Analytics dashboard activity, Crashlytics release `1.0.0 (55)` with 100% crash-free users/sessions and no open crash issues for the selected crash filter, and Performance Monitoring app/network traces for release `1.0.0 (55)`. No private Console screenshots were saved.
  - Installed account deletion/restore visual proof remains `Pending installed proof`: installed session was not verified as an approved deletion/restore proof user, and no explicit mutation approval was provided.
  - Installed blocked-viewer visual proof remains `Pending installed proof`: blocker, blocked-viewer, and unrelated-viewer installed sessions or a safe account-switching harness were not available.
  - Permanent purge/de-identification is superseded by the dedicated proof-account lane: current proof covers scheduled deletion/restore, public hiding, disabled/deactivated denial, admin suspend/restore, and disposable proof-account de-identification. No real-user broad auto-purge job is enabled.
  - Provider refund execution is an accepted manual/external condition; no real refund was executed, and the app must not claim instant or automatic provider refunds.
- Play/Internal v55+ Closeout:
  - Artifact: `/tmp/app-play-internal-v55-plus-proof-20260624-143940/`.
  - Browser readback: Play internal testing is active and available to internal testers, but its expanded release summary remains versionCode `54`. Closed testing Alpha is active and available to selected testers, but its expanded release summary also remains versionCode `54`. The latest releases and bundles overview shows visible app bundles through versionCode `54` only; no versionCode `55` or newer Play bundle was visible.
  - Device/build: physical Android `R5CR120QCBF / SM-N986U1`, package `com.chillywood.mobile`, versionCode `55`, versionName `1.0.0`, installer `null`, first install `2026-06-22 15:54:35`, last update `2026-06-24 11:25:01`.
  - Play/internal launch-candidate runtime proof remains `Pending installed proof`: the attached v55 runtime is direct-installed, not Play-installed, and Play Console does not currently expose v55+ to internal or closed testers.
  - Required owner/release action: upload/release/promote versionCode `55` or newer through Play internal or closed testing, verify tester/device eligibility, install/update from Play, then rerun package readback and smoke. Do not classify any direct APK or adb install as Play/internal proof.
- Play v55 Upload/Install Closeout:
  - Artifact: `/tmp/app-play-v55-upload-install-proof-20260624-154317/`.
  - Release/build: EAS production store build `8c80ac61-97f5-4e29-9814-f1b774ac81d9` from commit `1bc1afb`, versionCode `55`, versionName `1.0.0`, submitted to Google Play internal testing through submission `b8158df2-a5c1-4a2f-a16a-1bfa19b7d84c`.
  - Browser readback: Play internal testing became available to testers with versionCode `55`.
  - Device/build: physical Android `R5CR120QCBF / SM-N986U1`, package `com.chillywood.mobile`, versionCode `55`, versionName `1.0.0`, installer `com.android.vending`, first install `2026-06-24 15:44:19`, last update `2026-06-24 15:45:06`.
  - Play/internal launch-candidate runtime proof: `Pass` — versionCode `55` installed from Google Play with installer `com.android.vending`.
  - Play/internal smoke: `Partial` — launch and route smoke captured no fatal crash; signed-out privacy/support routes opened, signed-out private chat denied safely by routing to sign-in, and Premium route smoke did not bypass entitlement. Signed-in Home/Settings visual smoke is now closed by the installed visual closeout below.
- Installed Visual Closeout:
  - Artifact: `/tmp/app-installed-visual-closeout-proof-20260624-170135-mutation2/`.
  - Device/build: physical Android `R5CR120QCBF / SM-N986U1`, package `com.chillywood.mobile`, versionCode `55`, versionName `1.0.0`, installer `com.android.vending`, first install `2026-06-24 15:44:19`, last update `2026-06-24 15:45:06`.
  - Signed-in Home/Settings visual smoke: `Pass`; Home marker was visible after proof-user sign-in and Settings opened from Home on the Play-installed runtime.
  - Installed account deletion/restore visual proof: `Closed`; Settings deletion UI and scheduled-deletion / 30-day restore copy were reachable, immediate scheduled-state copy was captured, restore/cancel visual proof completed, and backend cleanup readback confirmed the proof account is active/not scheduled.
  - Installed blocked-viewer visual proof: `Pass`; blocked-viewer Profile and Platform routes showed blocked/unavailable state, obvious message/call/follow harassment actions were not exposed, unrelated-viewer Profile/Platform regression passed, no fatal/crash markers were found, temporary blocked relationship cleanup passed, and artifact secret/token scan passed.
- Final Four Launch Conditions:
  - Artifact: `/tmp/app-final-four-launch-conditions-proof-20260624T224835/`.
  - Account deletion immediate scheduled-state visual proof: `Pass`; Play-installed account deletion UI, immediate scheduled-state copy, restore/cancel visual, and active/not-scheduled cleanup readback are proved.
  - Password reset/auth email provider proof: `Closed`; dedicated proof inbox delivery, app-link recovery, password update, backend auth with the rotated proof credential, installed Home/Settings sign-in, and expired-link fallback passed on the Play-installed versionCode `55` runtime. Provider throttling was not conclusively observed in bounded attempts; bounded retry behavior was safe.
  - Provider refund execution: `Accepted manual/external`; entitlement revoke behavior is proved, real provider refund API execution is not implemented/proved, and the app must not claim instant or automatic provider refunds.
  - Permanent purge/de-identification: `Closed for controlled production path`; current proved lifecycle covers scheduled deletion, restore/cancel, public hiding, disabled access denial, admin/operator suspend/restore, disposable proof-account de-identification, and controlled single-user production purge/de-identification. Batch auto-purge remains disabled/default-off. No broad auto-purge job or legal compliance claim is made.
- Account Purge / De-identification lane:
  - Artifact: `/tmp/app-account-purge-deidentification-proof-20260624233257/`.
  - Policy doc: `docs/ACCOUNT_PURGE_DEIDENTIFICATION_POLICY.md`.
  - Migrations: `20260624231731_account_purge_deidentification_proof.sql`, `20260624232323_account_purge_deidentification_username_repair.sql`, and `20260624232653_account_purge_deidentification_uuid_repair.sql`.
  - Result: `Closed for proof-account policy implementation`. The proof path creates a disposable proof account, schedules deletion, proves active/restore-window/protected/non-admin denial, runs dry-run de-identification, runs proof-only de-identification, keeps public Profile/Platform fail-closed, keeps private-feature access denied, preserves support/audit privacy, and performs no provider refund or live-money action.
- Account Purge Production Enablement lane:
  - Artifact: `/tmp/app-account-purge-production-enable-proof-20260625000935/`.
  - Runbook: `docs/ACCOUNT_PURGE_PRODUCTION_RUNBOOK.md`.
  - Migrations: `20260624235742_account_purge_production_enablement.sql` and `20260625000344_account_purge_production_audit_readback.sql`.
  - Result: `Closed for controlled production path`. Dry-run is default/non-mutating. Owner/operator single-user purge is enabled/proved for eligible expired scheduled-deletion accounts. Active, restore-window, owner/admin/operator, protected, and non-admin paths are denied. Sanitized audit readback and idempotency pass. Batch auto-purge is disabled/default-off and did not mutate. No provider refund or live-money action occurred.
- Final Launch Operations lane:
  - Artifact: `/tmp/app-final-launch-operations-proof-20260625003349/`.
  - Runbook: `docs/FINAL_LAUNCH_OPERATIONS_RUNBOOK.md`.
  - Migration: `20260625002216_final_launch_operations_batch_purge.sql`.
  - Result: `Closed for provider refund manual/external operations, proof-only batch purge automation, and manual-review workflow`. Refund copy/doc scan passed, no refund API was called, and no live-money action occurred. Batch dry-run, emergency stop, disabled mutation without explicit enable, bounded proof-only batch mutation, active/restore-window/protected/non-admin denial, sanitized batch audit readback, idempotency, manual-review queue creation, manual-review status transition, and non-admin manual-review denial passed. Production batch purge remains config-gated/default-off unless owner/operator explicitly enables it after dry-run review; no broad real-user purge is claimed.
- Launch Condition Decision: broad public launch is `Conditional Go`; closed/internal testing is `Conditional Go`; production prep / release-candidate proof is `Conditional Go`. No remaining blocker is currently classified as an app-controlled backend safety blocker. Play/internal versionCode `55` runtime proof, signed-in Home/Settings visual smoke, installed account deletion/restore visual proof, installed blocked-viewer visual proof, controlled account purge/de-identification, provider refund manual/external operations, proof-only batch purge automation, manual-review workflow, and password reset/auth email provider proof are closed or accepted with documented constraints. This is not full Go: keep provider refunds manual/external, keep purge automation controlled/config-gated, avoid instant refund/deletion claims, and preserve normal release smoke/monitoring.
- Safety confirmation: No secrets, credentials, service-role keys, provider/payment keys, push tokens, LiveKit tokens, signed URLs, proof passwords, local env files, payment changes, Premium pricing/product changes, live money, payout activation, RLS weakening, LiveKit authority loosening, participant cap increase, scan gate weakening, auth/reset weakening, fake proof users in production UI, or broad route ownership changes.

## Public V1 Final Regression

LiveKit server metrics readback and 10-passive-viewer synthetic load proof are closed. Safe current claim: 4 active camera/mic seats plus 10 synthetic passive viewers/subscribers are proved under measured `chillywood-prod-01` conditions. The active camera/mic seat cap remains 4. Real-device passive viewer scaling and TURN/cellular allocation proof remain separate pending lanes; do not raise active publisher caps or claim 10 real-device viewers from the synthetic proof.

Circle-private creator-video visibility, active deterministic Discovery Algorithm V1, and follower-feed / Chi'lly Circle feed fan-out are closed repo/backend lanes. Do not reopen those lanes unless a current regression appears. Android versionCode hygiene is repaired for the next build: native Android source now uses versionCode `55`, above the known Play/internal versionCode `54`.

Feed fan-out closeout truth:

- Migration `20260622223300_creator_feed_fanout_v1.sql` is the source-level feed table/RLS/trigger lane.
- Public creator content can appear in backed follower feeds and backed Chi'lly Circle feeds.
- Circle-private creator content can appear only in approved Chi'lly Circle member feeds.
- Draft content remains owner-only.
- Profile posts are posted or not posted; there is no user-facing Profile post Draft state.
- Legacy draft Profile posts remain hidden and do not fan out.
- No content appears on every user Profile feed.
- Profile remains personal/social.
- Platform remains creator media/business.
- Money, payouts, provider behavior, Premium gates, LiveKit, Watch-Party Live, and Live Watch-Party remain off/unchanged unless a separately approved lane changes them.

Next work is final Play/internal regression, fresh creator upload-to-playback proof, and any explicitly requested installed-device proof for relationship feed rails. Do not rebuild feed fan-out unless proof finds a real regression.

Google Play Console owner-action closeout is documented in `docs/GOOGLE_PLAY_CONSOLE_OWNER_ACTION_CLOSEOUT.md`. The Play Console Android-first package is now in the review pipeline: App content showed no Need-attention items, Closed testing Alpha is configured for United States with the `Chi'llywood Internal Testers` list (17 users), stale Alpha draft v15 was discarded, internal testing versionCode 54 / `1.0.0` was promoted into Alpha, and 13 changes were sent for review. Publishing overview still showed Google quick checks running before review proceeds. Next work is to monitor quick checks/review outcome, get at least 12 testers opted into the closed test for at least 14 days, confirm provider dashboards/support/monitoring, then run final Play-installed Android smoke and fresh creator upload-to-playback proof. BrowserStack/App Live is intentionally deferred until iOS integration is ready and is not a current Android-first launch blocker unless the user changes that decision.

Refund / credit / creator payout-hold foundation is now a remote-applied foundation-only money policy lane. `docs/REFUND_CREDIT_PAYOUT_HOLD_FOUNDATION.md`, `_lib/moneyRefundPolicy.ts`, migration `20260621091458_refund_credit_payout_hold_foundation.sql`, and `guard:refund-credit-payout-hold-policy` define future refund eligibility, non-spendable credit review, creator obligation status, and creator payout hold rules without enabling real refunds, provider refund API calls, spendable credits, payout releases, payable balances, live money, or payouts. Post-apply `supabase db push --dry-run` reports the remote database is up to date. Future production refunds/credits/payout releases require a separate provider/legal/store/admin approval lane and installed proof.

Seven-flow money proof: CLOSED / app-side proof complete. Premium, Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, and Event Pass have reliable Android app-side proof, including Watch-Party Seat Pass exact-target purchase/readback and VIP provider ownership reset plus fresh first-purchase proof. Do not reopen the money lane unless a new regression appears. Remaining future work is provider/test-account maintenance and live-production rollout governance, not app-code proof.

Algorithm Foundation V1 is closed as the active deterministic public Home/Explore discovery lane. It is free/rules-based/not ML, has dry-run/readback and `guard:algorithm-ranking-v1`, uses `algorithmRankingV1Enabled=true`, and keeps emergency fallback incident-only/default-off. The closeout doc is `docs/ALGORITHM_FOUNDATION_V1_CLOSEOUT.md`. Do not reopen Algorithm V1 unless a current regression appears.

Launch-blocker audit is recorded in `docs/PUBLIC_V1_FINAL_REGRESSION_AUDIT_20260616.md`. Sandbox Money Tester Experience is Play-installed Android proved for the seven app-side money flows. Sandbox proof does not enable live money or payouts, and broad public launch still requires external launch governance, Play/RevenueCat production readiness, and non-money Public V1 blockers.

Production integration/confusion audit closeout truth is recorded in `/tmp/chillywood-production-integration-confusion-audit-20260620-185544`. No new reset-password-class product-code bug was found. These lanes are closed and should not be reopened without a new current regression: forgot/reset password routing, positive Admin/Owner access, selected non-LiveKit closeout except documented out-of-scope items, Chi'lly Chat non-media messaging/call-route proof, Profile/Platform visibility gates, seven-flow money app-side proof, and Live Stage media/authority proof. Current deferred/pending work is Watch-Party shared Player camera/mic remote-render proof on a stable second session or BrowserStack, BrowserStack/App Live final regression, fresh creator upload-to-playback proof, attachment-heavy comments proof, and external launch governance/provider/legal readiness.

The owner Platform / creator monetization UX correctness pass is closed for current app-side proof. Owner Platform renders `Creator Offers` management, viewer/tester Platform renders `Support this Platform`, owner subscription/VIP management opens Platform Studio offer setup rather than the Premium purchase shell, owner self-purchase is blocked, true non-owner viewers/testers still see purchase CTAs where configured, and Premium remains only Chi'llywood Premium. The Profile/Platform `public/private/subscriber_only` visibility foundation is backed by schema, resolver RPCs, Profile RLS bridge, Settings/Profile UI, Platform Studio UI, route gates, Profile device save/readback proof, and Platform Studio Audience save/readback proof. Followers/following remain public discovery/social relationships only.

Visibility implementation lane:

- Preserve compatibility truth: legacy Profile `everyone`, `chilly_circle_only`, and `private` values remain for old surfaces, and Platform `public_activity_visibility` plus follower/subscriber surface flags remain audience posture.
- Committed/pushed foundation commit `6961e6a792977a705fa4c4cfc88ae737d2ee0b6b` adds explicit Profile and Platform access values matching product language: `public`, `private`, and `subscriber_only`.
- Server/RPC helpers `resolve_profile_visibility_access(...)` and `resolve_platform_visibility_access(...)` combine owner/admin/operator, channel blocks, active Chi'lly Circle friendship, active creator subscription, signed-out state, and the selected visibility. Followers must not unlock private or subscriber-only access.
- Public Profile and public Platform read paths call those helpers before exposing full identity/activity/content/commerce shelves. Locked states must reveal only safe locked copy and allowed CTAs.
- Supabase migrations `20260617235547_profile_platform_access_visibility.sql` and `20260618000942_profile_access_visibility_rls_bridge.sql` are applied and post-apply dry-run reports the remote database is up to date.
- EAS Update is published to `production`, runtime `1.0.0`, update group `2c9a1aec-f452-4ee2-b903-4c9f2030cc3b`, Android update `019ed821-7462-720b-9b1c-3354df302188`, iOS update `019ed821-7462-7362-ba07-c64b2954b48a`.
- Installed-device proof folder `/tmp/chillywood-profile-platform-visibility-device-proof-20260617-192905` captures Profile visibility controls and save/readback for Public, Private, Subscriber-only, restored to Public.
- Platform Studio / Audience proof folder `/tmp/chillywood-platform-visibility-audience-proof-20260617-194538` captures owner/operator access to Platform Studio without weakening the Premium gate, Platform visibility save/readback for Public, Private, Subscriber-only, and final restore to Public.
- Signed-in visibility/privacy/blocked UI matrix proof is closed in `/tmp/chillywood-non-livekit-closeout-proof-20260620-165812`. Future multi-account expansion is regression coverage only, not a reason to reopen the visibility foundation.

Top remaining Android-first public-v1 blockers are external launch governance/provider/legal readiness, Google Play Console owner actions, final Play-installed Android smoke, fresh creator upload-to-playback proof, and attachment-heavy comments proof if those attachment paths are public-v1 critical. BrowserStack/App Live final regression is deferred until iOS integration is ready unless the user changes that decision. Watch-Party shared Player camera/mic remote-render proof remains deferred until a stable second session or BrowserStack and should not be treated as a current Android-first blocker unless declared launch-critical. Chi'lly Chat two-user message/reply and non-media call-route proof, Watch-Party participant rail join/leave, Live Watch-Party / Live Stage route/membership/authority smoke, and Live Stage media proof are closed. Live money, payouts, withdrawals, cash-out, service-role-in-mobile, Premium weakening, RLS weakening, LiveKit authority changes, and tester owner/operator access remain prohibited.

## Brand Studio Closeout Proof / OTA Pickup

Latest repo-side follow-up removes the creator-facing `Needs review` state from normal owned Brand Studio uploads and is OTA-published from code commit `1f3cb80` to branch `production`, runtime `1.0.0`, update group `c382be3e-b17a-473f-bdfd-38101e8edadc`, Android update `019ec762-ce39-711c-a6db-a4264a552ffd`. In tester proof, the Brand tab should now show `Ready to publish`, `Checking`, `Blocked`, `Approved`, or `Published` instead of sending the creator to a review workflow. Public gates remain unchanged: only published, moderation-safe, scan-safe, not-deleted Brand assets can render publicly.

Brand Studio production closeout is repo-side complete and the latest EAS Update has been published from code commit `1f3cb80` to branch `production`, runtime `1.0.0`, update group `c382be3e-b17a-473f-bdfd-38101e8edadc`, Android update `019ec762-ce39-711c-a6db-a4264a552ffd`. Earlier Brand Studio closeout OTA groups `86cf5f80-c746-453b-a495-27c0d99843ec`, `bb3143da-c3e6-46be-acde-9c609c171fb3`, `050500c` group `c509979c-98f3-4043-bfe1-0a0052e02a64`, and `f998cbb` group `9d728443-d566-4e30-a6f3-19a6deb64f1c` are superseded. Next proof is to confirm the installed Play/internal runtime actually picks up the `1f3cb80` OTA, then run the updated Brand Studio contract:

- Open Platform Studio.
- Open Brand Studio.
- Choose a supported Hero Image.
- Tap `Save Draft` and confirm one honest notice.
- Open `Preview Brand Draft` and confirm owner-only saved draft media appears with normal owner controls hidden.
- Open `Preview Platform` and confirm pending media does not appear publicly.
- Tap `Publish Changes` and confirm one honest notice after the publish path completes.
- Reopen `Preview Platform` and confirm only eligible approved, scan-safe, published media appears.
- Confirm rejected, removed, scan-blocked, deleted, and pending assets stay hidden.
- Confirm Profile photo/background remain separate from Platform hero/background/avatar/logo.

This lane did not add a Supabase migration or native dependency. OTA is acceptable only if the installed Play/internal app actually receives the update; otherwise create a new Play/internal build for deterministic tester proof.

## BrowserStack Final Regression Prep

Whole-app BrowserStack readiness is prepared in `qa/browserstack/` and BrowserStack remains deferred until explicit approval. The package includes a coverage map, persona labels without secrets, env placeholders, approval-gated runbook, and 15 flow contracts covering runtime install, auth, Home/Explore/Library, Profile/Platform, Brand Studio, Chi'lly Chat, Watch-Party Live, Live Watch-Party/Live Stage, Player/Paid Video, Money Center, Premium, Settings/Legal, direct-link denials, Admin/Owner, and final smoke. No BrowserStack session was started, no app was uploaded, and no BrowserStack minutes were spent. Android is the active proof lane and must use Play/internal runtime; Expo Dev Launcher is not accepted. iOS is deferred until Android final regression is closed and the user explicitly approves a later iOS lane.

Next recommended action is BrowserStack/App Live final regression only when explicitly approved, or a focused Watch-Party shared Player remote-render proof with a stable second session. Do not reopen Chi'lly Chat non-media, Live Stage media, Platform visibility, Admin/Owner, forgot/reset, or seven-flow money proof without a new regression.

## Route Safety Cleanup Before BrowserStack

Owner/admin integration audit after issues #1-#7 is complete in `docs/OWNER_ADMIN_INTEGRATION_AUDIT.md`. It found no route/product integration blocker before BrowserStack prep. The only code cleanup was replacing raw Watch-Party proof `console.log` calls with sanitized dev-only `debugLog` labels in `app/watch-party/index.tsx`; join, payment, LiveKit, Premium, RLS, backend, and route behavior were not changed.

Route safety cleanup is complete. `/channel-studio` remains the preferred Platform Studio route, `/channel-settings` remains the compatibility wrapper/implementation route, and the new local `npm run guard:route-contracts` check protects Party Waiting Room -> Party Room, Live Waiting Room -> Live Stage, Player/Title content-first Watch-Party Live handoff, paid Watch-Party Seat Pass buyers staying out of Live Stage, canonical Chi'lly Chat routes, and Premium separation from creator purchases. BrowserStack remains deferred.

## Final Play/Internal QA Continuation

Traceable Play/internal v53 is installed on `R5CR120QCBF` from commit `361e1d5`:

- EAS build `f7a0612b-acdc-40ad-91bd-c7870dbe573a`
- EAS submission `5237ae16-2efa-41ab-9768-02c437361515`
- package `com.chillywood.mobile`
- installer `com.android.vending`
- versionCode `53`
- app version/runtime `1.0.0`

Completed v53 smoke: launch/Home, Live hub, Library, invalid Watch-Party direct-link fail-closed, reset route opens inside the installed app, Settings, and visible non-Premium Platform Studio gate. Proof artifacts are under `/tmp/chillywood-final-qa-proof-20260613/`.

Blocker-clearing update: `tips_creator_test` now has a short-lived Premium `test_grant` for creator-tool QA only, expiring June 14, 2026 at 06:13 UTC. Platform Studio, Brand Studio creator save/reload, Brand Studio wrong-user RLS denial, and Money Center truth-copy proof passed on Play/internal v53. Proof artifacts are under `/tmp/chillywood-final-qa-clear-blockers-20260613/`.

Final persona update: `final_qa_simulator_test@chillywood.test` is repaired/created for internal QA with ignored local credentials only. Brand Studio public-viewer readback passed on Play/internal v53 with corrected assertions for `Tips Creator Test`, `@tips_creator_test`, and `Viewer`; proof artifacts are under `/tmp/chillywood-final-qa-second-account-20260613/`. Disposable inbox delivery passed for signup and reset emails. Installed-app signup verification passed from a phone-opened disposable email link. Installed-app forgot-password proof also passed after the reset recovery-session fix: the phone-opened reset link launched `com.chillywood.mobile`, opened the recovery session, allowed password update, returned to login, and sign-in with the new password reached Home. No token-bearing URLs were printed, documented, or committed. A local AVD booted but could not install the current debug APK reliably, so it is not a valid second-device proof surface.

Next task recommendation: use a second physical device/session or explicitly approved BrowserStack session for Chi'lly Chat and Watch-Party/LiveKit two-user proof. BrowserStack personas and contracts are prepared in `docs/BROWSERSTACK_FINAL_REGRESSION_PLAN.md`, but BrowserStack should not start until explicitly approved. Monetization and UI changes are frozen unless QA finds a real blocker.

## Launch-Candidate Polish Pass

`docs/LAUNCH_CANDIDATE_POLISH_PASS.md` records the scoped launch-candidate polish pass before final QA. The pass fixed only small trust/proof issues: Watch-Party Join Now branch proof logs now use sanitized dev-only `debugLog`, creator Channel Subscription and VIP cards show visible unavailable-state reasons, and the creator channel loading state is clearer.

No new monetization features were added. Live money, payouts, cash-out, withdrawal, transfer, payable balances, LiveKit token authority, Watch-Party route ownership, Party Room routing, Premium gates, RLS, and admin authority were not changed.

Next task recommendation: execute `docs/FINAL_PUBLIC_V1_QA_PLAN.md` on the latest Play/internal launch-candidate runtime, then run BrowserStack final regression after local/manual proof is captured.

## Monetization Closeout / Final Regression

Seven-flow money proof: CLOSED / app-side proof complete. The app-side proof lane now includes Premium plus the six creator monetization flows:

- Premium
- Tips V1
- Paid Videos V1
- Paid Watch-Party Seats V1
- Paid Events V1
- Channel Subscriptions V1
- VIP Passes V1

Current proof truth lives in `CURRENT_STATE.md`, `docs/SANDBOX_MONETIZATION_TESTER_EXPERIENCE.md`, and the proof folders listed there. The older six-flow creator closeout audit remains historical background, not an instruction to reopen proof.

Next monetization work should not add new creator-money flows. The next production-money tasks are provider/test-account maintenance, live-production rollout governance, and final whole-app regression only if a real regression appears.

Final whole-app regression must cover auth email reset/signup smoke, Brand Studio smoke, Chi'lly Chat regression, Watch-Party participant/shared Player regression, Premium separation, direct-link denials, and Money Center readbacks. The closed installed-device proof lanes stay closed unless a current regression appears. Do not restart the money proof lane unless one of those regression checks exposes a real money regression.

Live money remains off. Payouts, cash-out, withdrawal, transfer, and payable creator balances remain unavailable.

## Final Public V1 QA Plan

Final public-v1 QA planning is now documented:

- `docs/FINAL_PUBLIC_V1_QA_PLAN.md`
- `docs/BROWSERSTACK_FINAL_REGRESSION_PLAN.md`
- `docs/PUBLIC_V1_LAUNCH_READINESS_CHECKLIST.md`

Next task recommendation: execute the final Play/internal launch-candidate proof pass, then BrowserStack final regression. Start with runtime verification (`package=com.chillywood.mobile`, `installer=com.android.vending`, latest internal versionCode, not Expo Dev Launcher), then close auth reset/signup, Brand Studio, Chi'lly Chat calls, Watch-Party/LiveKit two-user smoke, Money Center six-flow readbacks, Premium separation, direct-link denial, and Google Play/RevenueCat product readiness. Do not add new monetization features.

Current go/no-go: no-go for broad public launch until BrowserStack final regression, external launch governance, and listed launch blockers are closed; go for continued Play/internal QA with live money and payouts off.

## Current Creator Monetization Proof

VIP Passes V1 is repo-side implemented, Supabase-applied, webhook-deployed, and Play/internal v52 sandbox-proven for provider setup, purchase, verified VIP pass/access creation, VIP route access, authenticated second non-VIP denial, and Money Center readback.

VIP V1 current truth:

- Migrations applied remotely: `20260613104442_vip_passes_v1_sandbox.sql` and `20260613114528_vip_pass_metadata_safe_keys.sql`.
- `revenuecat-webhook` deployed: ACTIVE version 17.
- Traceable Play/internal AAB build from commit `95c7966482f6f76637dd17a3bdf66afad2f711c6`: EAS build `96a2542d-1687-4de1-8ab5-1ec22e6660fd`, submission `9cae0461-801a-4bec-b0e8-148565a5ee41`, versionCode `52`, installed on `R5CR120QCBF` with installer `com.android.vending`.
- Provider path is RevenueCat / Google Play dynamic sandbox product `vip_pass_sandbox_499` / `cw_vip_pass_sandbox_499`; Stripe Tips is not used.
- Google Play one-time product `cw_vip_pass_sandbox_499` is active with purchase option `vip-pass-sandbox` and USD 4.99 base price.
- RevenueCat maps the Play product as published non-consumable `cw_vip_pass_sandbox_499`; it is not attached to Premium.
- `revenuecat-webhook` maps `vip_pass` products to verified `vip_pass` access grants.
- Creator setup lives in Platform Studio Money Center > Ways to Earn and Offers.
- Fan surface is the creator channel VIP card and `/vip-pass/[creatorId]`.
- Creator setup passed after the DB-only metadata validator fix: Money Center showed `Manage VIP Pass` / `Pause VIP Pass` and persisted offer `4769cf60-3b32-42c5-ac68-c7cc3384c0a4`.
- Non-owner fan gate passed against `tips_creator_test` offer `7edc7696-b371-4d76-9c07-8c160c0b82b2`: creator channel showed `Get VIP`, direct `/vip-pass/[creatorId]` showed `VIP ACCESS REQUIRED`, and the VIP-only area was not exposed before purchase.
- Sandbox purchase proof passed: verified provider event `1e81db62-4b17-45b1-8369-004302d41108` / provider transaction `73EFF539-6E60-4CAA-8A87-1395E35992B6` created transaction `829f230f-7734-4fad-a88b-bd674c1daa8e`, active VIP pass `b19d3a26-1431-4033-bf70-5f3e5311e719`, and sandbox access grant `3b051689-7879-4e39-9712-efab1d1d783c`.
- VIP fan access passed on `/vip-pass/[creatorId]`.
- Fresh authenticated second non-VIP tester `d860574d-38a0-4452-a1e4-2d01b97bd397` remained blocked with `VIP ACCESS REQUIRED` / `Get VIP` and zero active VIP pass/grant rows.
- Creator Money Center > Transactions > VIP visually showed `$4.99 VIP pass`, `Paid`, `Sandbox`, and `Payout status: not_payable`.
- Separation readback showed zero Tips, Paid Video grants, Paid Watch-Party Seat Passes, Paid Event passes, Channel Subscription rows, or Premium/user entitlement updates from the VIP purchase.
- VIP V1 unlocks only creator-specific VIP state/area for that creator.
- VIP does not include Chi'llywood Premium, Paid Videos, Paid Watch-Party Seat Passes, Paid Events, Channel Subscriptions, Tips, LiveKit authority, room permissions, speaker/host privileges, payouts, platform-wide status, or other creators' channels.
- Live money remains off and sandbox rows are not payable.

Remaining VIP follow-up:

- Refund/revoke proof remains deferred because the verified provider event does not expose a safe Google Play order id for targeted refund/revoke. Do not fake refund/revoke by manual Supabase mutation.
- Direct client active-VIP write-denial can be run as an optional hardening proof if needed; purchase/access creation in this proof came only from the verified provider webhook path.
- BrowserStack remains deferred until the final full monetization regression.

Reference doc: `docs/VIP_PASSES_V1_END_TO_END_PROOF.md`.

## Channel Subscription Lifecycle Follow-Up

Channel Subscriptions V1 is now implemented, Supabase-applied, webhook-deployed, and Play/RevenueCat sandbox-proven for purchase, Money Center visual readback, authenticated non-subscriber denial, and effective-access stale-row safety. Channel Subscription lifecycle handling is implemented and deployed, but fresh provider-event proof remains deferred/provider-blocked because RevenueCat did not emit a signed post-deploy lifecycle webhook after Google Play accepted the sandbox refund.

Closed Channel Subscriptions truth:

- Google Play subscription product `channel_subscription_sandbox_monthly_499` has active monthly base plan `monthly`.
- RevenueCat product `channel_subscription_sandbox_monthly_499:monthly` is published and attached to entitlement `creator_channel_subscription`.
- The old provider product id `cw_channel_subscription_sandbox_monthly_499` is not used because it is too long for Google Play subscription product ids.
- Play/internal v51 installed on `R5CR120QCBF` with package `com.chillywood.mobile`, installer `com.android.vending`, and versionCode `51`.
- After a cold app restart, the app saw the product and Google Play Billing opened for the sandbox subscription.
- Subscriber `ee44e7aa-a9f7-40d0-baa6-45697f2b1cc5` completed sandbox subscription purchase for creator `c2afa6cc-52f2-4714-b972-89863582d05a` / offer `c7f74157-421d-41c6-8562-161965bab031`.
- Signed provider event `9dabc47f-61f7-49f7-a169-3adb0ebbac30` processed through `revenuecat-webhook`.
- Supabase created subscription `436f2acc-ec46-4977-ba51-958452ea2f2e`, paid/not-payable transaction `e49cddea-cd6d-4097-b70c-a07abaa24823`, and sandbox access grant `1a5492fe-c135-435e-878c-5e21a7638322`.
- The subscriber route showed `SUBSCRIBED` and subscription copy stayed separate from Premium, VIP, Paid Videos, Paid Watch-Party Seat Passes, Paid Events, Tips, LiveKit authority, payouts, and other creators' channels.
- Creator Money Center Transactions visually showed exact transaction `e49cddea-cd6d-4097-b70c-a07abaa24823` as `$4.99 channel subscription`, `Paid`, `Sandbox`, and `payout status: not_payable`, separate from Tips, Paid Videos, Paid Watch-Party, Paid Events, Premium, and VIP.
- Authenticated non-subscriber route denial passed after purchase: `/channel-subscription/[creatorId]` showed `SUBSCRIBER ACCESS REQUIRED` and `Subscribe`, while Supabase readback showed zero active other-user subscription rows and zero active channel-subscription grants.
- Effective-access fallback passed: the subscriber route and creator channel header use `resolve_creator_channel_subscription_access`, which requires an unexpired provider period and non-revoked/non-expired state. The stale original `status=active` row does not unlock access after the provider period/access grant expires.
- Money Center/readback safety now labels expired provider periods as expired effective access and avoids claiming stale provider rows are current active subscribers.
- Live money remains off and sandbox rows are not payable.

Remaining Channel Subscriptions work:

- RevenueCat dashboard refund for the exact sandbox entitlement failed with `Refunding the transaction was unsuccessful`.
- Supabase received provider `RENEWAL`, `CANCELLATION`, and `EXPIRATION` events for the same app user/product before the lifecycle handler was deployed; those historical rows remain `ignored` and were not manually rewritten.
- New migrations `20260613091417_channel_subscription_lifecycle_handling.sql` and `20260613092100_channel_subscription_cancel_pending_unique.sql` are applied, and `revenuecat-webhook` now handles `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `UNCANCELLATION`, `PRODUCT_CHANGE`, `REFUND`, `REVOCATION`, and `SUBSCRIPTION_PAUSED`.
- Fresh lifecycle proof attempt: Google Play Console exact sandbox order `GPA.3353-3923-8017-31040..4` accepted a refund with `Remove entitlement` selected and showed `1 order refunded`, but RevenueCat did not emit a fresh signed webhook during the proof window. Supabase still has no post-deploy lifecycle row to process.
- Future lifecycle proof must trigger or safely replay fresh signed RevenueCat lifecycle events and confirm subscription status, access grant status, subscriber route behavior, and Money Center readback update correctly.
- Do not fake cancellation/expiration/revoke by manual DB mutation.

Closed Paid Events truth:

- Remote migrations applied/recorded: `20260612201011_paid_events_v1_sandbox.sql`, `20260612213500_paid_events_metadata_safe_keys.sql`, and `20260612215000_paid_events_access_grant_trigger_schema_fix.sql`.
- Provider path is RevenueCat / Google Play dynamic sandbox product `event_pass_sandbox_099` / `cw_event_pass_sandbox_099`; Stripe Tips is not used.
- Play/internal v46 build `685b4d11-a23c-4f1f-add8-13b04fe22f48` installed from Google Play on `R5CR120QCBF` with installer `com.android.vending`.
- Creator account `TIPS_FAN_TEST` created event `a100f88d-6bf5-4272-838d-2d0d83f800eb` and paid event offer `85b2a1ae-90cd-4b75-a91f-39c42c3dad43`.
- Unpaid/direct-link gate passed with `Event pass required` and `Buy Event Pass`.
- Google Play / RevenueCat sandbox purchase processed provider event `95c22a83-85a1-4f5a-b6e4-e6f2cb72ad10`, consumed purchase intent `d9076cf4-cd98-4480-af0a-690f5bcc06df`, created access grant `bce269bc-7469-484f-b82f-992437a7c7f6`, active pass `3a9b2d07-d04b-45ad-b7cd-9766566e9a04`, and paid/not-payable transaction `0dc99303-baeb-489c-b5a5-8e608b63f583`.
- Paid fan access passed; authenticated second unpaid tester `PAID_EVENTS_UNPAID_GENERATED` remained blocked with zero passes.
- Money Center Transactions visually showed `$0.99 event pass`, `Paid`, `Sandbox`, and `payout status: not_payable`, separate from Tips.
- Direct authenticated client writes to event passes, event transactions, and `passes_sold` were denied with `42501`.
- Live money remains off, rows are sandbox/not-payable, and event passes do not grant Premium, Tips, Paid Videos, Paid Watch-Party rooms, VIP, subscriptions, LiveKit authority, host authority, payouts, cash-out, withdrawal, or transfer.

Remaining Paid Events follow-up:

- Capacity proof is deferred because the current creator UI does not expose `capacity_limit`; DB model and oversell guard exist.
- Refund/revoke proof is deferred until RevenueCat / Google Play tooling gives a safe order id/path.
- BrowserStack remains deferred until final full monetization regression.

Recommended next build:

- All six creator monetization flows now have local/manual sandbox proof at least for core purchase/access paths. Next practical work is final monetization regression planning, refund/revoke tooling where provider order ids are available, and BrowserStack after the remaining deferred proof gaps are addressed.
- Do not build both in the same pass unless explicitly requested; keep Premium separate from creator subscriptions and VIP.

Reference doc: `docs/PAID_EVENTS_V1_END_TO_END_PROOF.md`.

## Paid Watch-Party Seats V1 Sandbox Proof

Paid Watch-Party Seats / Room Tickets V1 is implemented, remote-applied, and Play/internal sandbox-proven for purchase, active ticket creation, paid fan entry, unpaid direct-link gate, normal sold-out denial, seat-limit, and Money Center RPC readback. Visual Money Center screenshot and provider refund/revoke proof remain deferred.

Current truth:

- Remote migrations applied: `20260611231512_paid_watch_party_seats_v1_sandbox.sql`, `20260611232455_paid_watch_party_seat_limit_verification_guard.sql`, `20260611232545_paid_watch_party_offer_direct_write_tightening.sql`, `20260612001337_fix_paid_watch_party_host_uuid_comparisons.sql`, and `20260612001448_fix_paid_watch_party_metadata_safe_flags.sql`.
- Provider path is RevenueCat / Google Play dynamic sandbox product `watch_party_live_ticket_sandbox_099` / `cw_watch_party_live_ticket_sandbox_099`.
- Party Waiting Room checks Seat Pass access before routing to Party Room.
- Party Room blocks unpaid paid-room direct links before camera/mic permission startup on Play/internal v45.
- Money Center reads Paid Watch-Party offers and transactions separately from Tips and Paid Videos.
- Direct offer table writes are closed to authenticated clients; offer management is RPC-only.
- Live money remains off, rows are sandbox/not-payable, and tickets do not grant Premium, Tips, Paid Videos, VIP, Channel Subscriptions, Paid Events, Live Stage, LiveKit authority, payouts, cash-out, withdrawal, or transfer.
- Historical proof fixtures include room codes `XWAKVC`, `X75JHC`, `N3CXJD`, `ZT5MWV`, and `WNFUUF`. Treat them as history only; they may be expired and are not active next-step instructions.
- v44 proved the real Google Play / RevenueCat sandbox purchase path on room `ZT5MWV`; transaction `fff398a9-59f6-452a-81f7-1c8e7ad04e50` was sandbox/not-payable and active ticket `a2108d63-8b84-4dd1-8f60-ef485ce5efdc` was created.
- Root-cause fix `541dafd` made local camera/mic permission startup wait for confirmed room entry.
- v45 proved unpaid direct-link blocking and paid fan Party Room entry on fresh room `WNFUUF`; transaction `912a9d0a-3621-4070-826d-be2035856e47` was sandbox/not_payable and active ticket `8c2906da-8d02-43b2-afb9-9a7ba514fba2` was created.
- v45 seat-limit proof passed: `seat_limit=1`, `seats_sold=1`, offer `sold_out`, second authenticated unpaid tester had zero tickets, and the route did not go to Live Stage.
- Money Center RPC readback returned the Paid Watch-Party transaction and offer as sandbox/not_payable and separate from Tips/Paid Videos/Premium. Visual Money Center screenshot remains pending.

Next proof:

- Use a current paid room target only if it is still valid; otherwise create a fresh paid room target and offer before proof.
- Capture visual Money Center Transactions readback for transaction `912a9d0a-3621-4070-826d-be2035856e47` only if the historical fixture is still valid, or capture a fresh equivalent transaction if a new fixture is needed.
- Refund/revoke proof is attempted only if provider tooling gives a safe path; otherwise document the exact blocker.

## Immediate Chi'lly Chat Call Follow-Up

Run two-user Android proof for the Supabase-applied Chi'lly Chat call invite/ringtone foundation in `docs/CHILLY_CHAT_CALL_NOTIFICATION_RINGTONE_SYSTEM.md`:

- User A starts a Chi'lly Chat voice call from a direct thread.
- User B sees the in-app incoming call sheet, vibration starts, and Decline writes a declined call card.
- User A starts a video call.
- User B accepts, vibration stops, and both route through the existing communication room surface.
- A timed-out invite becomes a missed call card.
- Settings > Notifications exposes Chi'lly Chat call alerts, vibration, and ringtone preference.
- Bundled CC0 call sounds are present under `assets/sounds/chilly-chat/`, with provenance in `docs/CHILLY_CHAT_SOUND_LICENSES.md`; Settings preview should play the selected bundled in-app sound.
- Background call push proof still needs the approved server dispatch path and Play/internal push-token setup.
- Bundled background push ringtone native channel proof is closed for the EAS internal APK runtime: build `4110adeb-260d-41fa-841b-33a24ef15869` from `cc87743`, versionCode `32`, installed on `R5CR120QCBF`, and Android created `chilly_chat_calls_v2` with `android.resource://com.chillywood.mobile/raw/chilly_ring`.
- Google Play internal AAB rollout is prepared and submitted: EAS AAB build `1c36c8e1-f52d-4b6b-acb1-1602a9f8e99d` from `e12d4d2`, app version `1.0.0`, versionCode `34`, runtime `1.0.0`, artifact type `AAB`, submitted to Google Play internal testing through EAS submission `3a430e53-4ff2-4455-b041-4646a615ff1a`.
- Play-installed proof is still required before claiming tester pickup: install/update through Google Play internal testing, confirm installer `com.android.vending`, package `com.chillywood.mobile`, version `1.0.0`, versionCode `34`, then confirm Android channels `chilly_chat_messages`, `chilly_chat_calls_v2`, and `chilly_chat_missed_calls`.
- Confirm `chilly_chat_calls_v2` sound from the Play-installed runtime is `android.resource://com.chillywood.mobile/raw/chilly_ring`.
- After the approved backend call-push dispatch path exists, trigger/receive a background Chi'lly Chat call notification and confirm the bundled sound plays unless Android system notification settings silence it.
- Capture Play/internal sound proof under a new `/tmp/chillywood-play-internal-sounds-proof-*` path.
- BrowserStack proof remains pending and must not be claimed from the EAS APK or Play submission alone.

Do not change LiveKit token issuer, communication room authority, Watch-Party route ownership, Player behavior, auth, Premium gates, content safety, money state, payouts, or admin authority.

## Immediate Live Room Follow-Up

The newest code change is `686024a Fix live room wake lock and back behavior`. Before claiming tester-visible closure, produce Play/internal runtime proof for `docs/LIVE_ROOM_WAKE_LOCK_BACK_OVERLAY_PROOF.md`:

- Use a Play/internal build/runtime that includes native `expo-keep-awake`; if the current installed binary does not include it, create/install a new internal build rather than relying only on OTA.
- On `R5CR120QCBF` or another approved Play-installed device, capture Watch-Party Live and Live Stage idle behavior staying awake.
- Prove Live Stage overlay auto-hides after 10 seconds for viewer/host where reachable, tap brings it back, and locked controls do not auto-hide.
- Prove Android Back from Stage returns to Live Room, and Back from the room context returns to Party Room / Watch-Party entry instead of Home.
- Keep LiveKit token issuer, publish authority, host approval, route ownership, Party Room behavior, old-room handling, Premium/content safety, production money, payouts, cash-out, and Stripe Android digital checkout unchanged.

## Immediate Auth Email Follow-Up

Auth Email Recovery click-through proof is closed for the current reset-link route contract. Do not send additional password recovery emails to the owner's personal/internal tester inbox for routine proof. If auth email proof must be repeated, use a dedicated disposable non-admin recovery-test inbox entered only through the approved local secret handoff or Play Console App Access, and document the exact provider event without committing credentials.

Current status: the stale Brevo SMTP key failure was fixed by local key rotation and Supabase Auth SMTP patch/readback. Direct SMTP auth passes. The Play-installed app has a dedicated Reset password request screen, app-origin reset submit showed success, and direct Brevo smoke email delivery/open proof passed. The hosted recovery/confirmation templates use direct TokenHash app links (`chillywoodmobile://reset-password?...` and `chillywoodmobile://auth/callback?...`) and no longer use `{{ .ConfirmationURL }}` for those two flows. June 12 follow-up proved repeated reset emails to the owner inbox were triggered by Google Play automated app-access/pre-launch crawling of the forgot-password flow from Google proxy IPs, not Watch-Party monetization work. Play Console Sign in details now uses disposable non-admin reviewer account `play-reviewer-app-access@chillywoodstream.com` (auth user `cb8c7b5f-6003-479a-887e-29644e677dca`, confirmed, profile exists, zero active platform roles) instead of the owner's inbox. The password is stored only in the local macOS Keychain item `chillywood-play-reviewer-app-access`; do not print or commit it. The Play Console switch "Allow Android to use your sign in details for performance and app compatibility testing" is turned off and saved; Play Console showed "Change saved. Send for review in Publishing overview."

Next App Access step: if Play Console still shows the App content change pending, send it from Publishing overview. Do not re-enable automated compatibility testing for the reviewer account unless the owner explicitly accepts that Google may trigger reset/signup/auth emails to that disposable inbox.

Current remaining auth email gap: forgot-password reset is user-proved working end-to-end. Signup email delivery is provider-proved after disabling hosted Auth autoconfirm: `rdgtrucking90+signup220411@gmail.com` received `Confirm your Chi'llywood account` through Brevo at `2026-06-10T22:04:15-05:00`. The remaining manual proof, if needed, is tapping that Verify link on the Play/internal runtime and confirming it lands on login after verification.

June 6 SMTP follow-up was completed with sender change to `no-reply@chillywoodstream.com` and sender name `Chi'llywood`. Patch/readback succeeded for project `bmkkhihfbmsnnmcqkoly`; `smtp_host=smtp-relay.brevo.com`, `smtp_port=587`, and existing Brevo credentials. A safe recovery dispatch returned `200`; exact Brevo DNS records requested by the dashboard (`chillywood`, `brevo1._domainkey.chillywood`, `brevo2._domainkey.chillywood`, `_dmarc.chillywood`) were added in Cloudflare and resolve publicly. Do not use the owner's personal/internal tester inbox for future recovery proof.

## Current Recommendation

## Paid Videos V1 Sandbox Proof Follow-Up

Paid Videos V1 happy-path sandbox purchase proof passed on a Play-installed internal tester runtime. Do not claim live Paid Videos and do not build Paid Watch-Parties, Channel Subscriptions, VIP Passes, or Paid Events until the remaining Paid Videos proof gaps are closed or explicitly reprioritized.

Closed on June 11, 2026:

- Migration `20260611182509_paid_videos_v1_sandbox_bridge.sql` is remote-applied to project `bmkkhihfbmsnnmcqkoly`.
- Paid Videos V1 implementation was committed as `c4fe47d5ddc3ec94ba9cd024f7bf479ebbbb2167`.
- EAS production Android AAB build `cc38dd8a-59a9-4aad-9641-71862b7f5075` was started for versionCode `35`, app version `1.0.0`, runtime `1.0.0`, distribution `STORE`, channel `production`.
- EAS scheduled Google Play internal submission `73665297-db15-46f9-b9fd-a9495125dea3`.
- Final EAS readback during this pass: build status `FINISHED`, AAB artifact `https://expo.dev/artifacts/eas/jr8n0pSiAERN5zPsyqoaBWpmNk-zDHkoAGEzVVkKYCg.aab`; explicit Google Play internal submission `19a77260-4f23-4a24-887c-1730790b7b98` completed. Install proof still waits for Play tester availability/device update.
- Creator video upload/edit now supports Free vs Paid Unlock plus price.
- Paid Video offers are stored in existing `creator_content_prices` with RevenueCat / Google Play sandbox provider metadata.
- Player locked state hides paid creator-video media URLs before access and shows `Unlock Video`.
- Paid Video checkout uses RevenueCat / Google Play sandbox product `cw_paid_content_access_sandbox_099`, not Stripe Tips.
- The client creates source-bound `money_purchase_intents`, starts RevenueCat non-subscription purchase, then waits for server-verified access instead of trusting client success.
- Existing `revenuecat-webhook` remains the signed/verified provider path and creates shared `access_grants` plus sandbox/not-payable ledger rows.
- A trigger mirrors verified paid-content `access_grants` into legacy `content_access_grants` so the current player resolver can unlock paid creator videos.
- Money Center Offers and Transactions now show Paid Video rows separately from Tips.
- Premium remains separate; Paid Video copy says it unlocks only that creator video and does not include Premium, subscriptions, VIP, rooms, Watch-Party seats, or other content.
- Play/internal v37 proof passed on `R5CR120QCBF`: package `com.chillywood.mobile`, versionCode `37`, installer `com.android.vending`.
- Manual fan purchase through Google Play / RevenueCat sandbox showed `Payment successful` and created verified backend rows: purchase intent `949b076d-81dd-44f0-b2d8-ce514ebb7348`, provider event `f0006ba1-495f-4353-875e-40db2c9e7a5f`, access grant `71967fff-b913-4390-8b3d-aef4f4e77726`, mirrored content grant `1b6cf126-bb80-4dd6-b724-7b804765c3f9`, and ledger event `7f237e32-bdfc-4394-9bb3-f8537cae8e38`.
- Ledger row is sandbox/not-payable; `live_money_enabled` remains off.
- Separation proof showed no Tips transaction was created for the paid-video purchase window.

Remaining provider maintenance:

- Provider refund/revoke for historical Paid Video purchases is an operations/tooling maintenance item, not an app-code money proof blocker. Do not fake refund/revoke by manual Supabase mutation.

Closed fixture-based proof on June 11, 2026:

- Repaired the exact fixture creator id `0f53ad26-0b27-4f7f-9d6f-000000000001` as a real auth/profile test fixture and used a short-lived `test_grant` Premium entitlement only for existing Platform Studio creator-tool entry.
- Creator Money Center visual transaction readback passed for ledger `7f237e32-bdfc-4394-9bb3-f8537cae8e38`: Transactions showed `$0.99 video unlock`, `Paid`, `Chi'llywood Originals Proof Fixture`, `Sandbox`, Premium/Tips separation, and `payout status: not_payable`.
- Authenticated second unpaid fan `da8b248b-e26c-474d-81b9-8a62fa1c1c72` direct-link denial passed and grant readback showed `0` active grants for that user.
- Paid fan cold-start direct-link and logged-out denial remain passed; no Tips transaction, VIP, room access, subscription, event access, payout, cash-out, withdrawal, transfer, or LiveKit authority was created.

## Tips V1 Test-Mode Proof Follow-Up

Tips V1 is implemented, deployed, and sandbox-proven as pure creator contribution only, not a live-money launch. Paid Videos V1 is now the approved next build and is implemented but still needs Play-installed sandbox proof; do not build Paid Watch-Parties, Channel Subscriptions, VIP Passes, or Paid Events until the owner explicitly approves the next monetization build.

Closed on June 11, 2026:

- Migration `20260611151221_tips_v1_stripe_checkout.sql` is remote-applied to project `bmkkhihfbmsnnmcqkoly`.
- Edge Functions `create-creator-tip-checkout` and `stripe-tip-webhook` are deployed ACTIVE version `1`.
- Existing Stripe Connect account/onboarding/sync functions were redeployed with the shared helper update.
- Stripe test webhook endpoint is configured to the deployed `stripe-tip-webhook` URL with required Tips V1 events, and `STRIPE_TIP_WEBHOOK_SECRET` is configured in Supabase without committing or printing the value.
- Deterministic local-only proof users `tips_creator_test`, `tips_fan_test`, and `tips_blocked_test` were created/repaired and can sign in.
- Unauthenticated checkout returns `401`.
- Unsigned webhook returns `400 invalid_signature`.
- A signed-in local proof account saved Tips settings through RPC and reload persisted suggested/default/min/max amounts.
- Original hosted-onboarding account correctly stayed `canTip=false` while provider onboarding/document verification was blocked.
- Fresh Stripe test connected account was created with Stripe test-only verification values and synced ready: `charges_enabled=true`, `payouts_enabled=true`, `details_submitted=true`, provider ready, settings active, public `canTip=true`, and live money still disabled.
- Self-tip checkout returns `403 self_tip_blocked`.
- Unready creator checkout returns `403 provider_not_ready` with no transaction row.
- A seeded creator-to-`tips_blocked_test` audience block causes checkout to return `403 audience_blocked` before provider checkout.
- Manual Chrome CAPTCHA/onboarding returned to `https://chillywoodstream.com/stripe-connect/return?proof=tips-v1`, which currently lands on the public legal/support page instead of a polished Stripe return/status screen.
- Safe readback for the original hosted-onboarding account showed `individual.verification.document` past due and `card_payments=inactive`; this was resolved for proof by binding `tips_creator_test` to a fresh verified Stripe test account.
- Rapid duplicate attempts while the creator is unready return `403 provider_not_ready` and create no rows.
- Money Center's deployed transaction read path returns zero rows and zero paid rows for `tips_creator_test`.
- Direct client insert of a `paid` tip transaction and direct client provider-status update are denied.
- `create-creator-tip-checkout` was redeployed after fixing the audience-block lookup to select the existing `channel_user_id` column.
- Successful $1.00 test tip passed: server checkout created, Stripe Checkout completed with test card, signed webhook marked tip `48c9ffc0-804f-4f63-915f-f1476ec45f78` paid, Money Center transaction readback showed the verified paid tip with `payout_status=not_payable`.
- Failed-card proof passed: $3.00 declined-card checkout was marked failed and did not credit creator earnings.
- No-unlock proof passed: zero new `access_grants`, zero new `content_access_grants`, and zero updated `user_entitlements` for the fan after the paid tip.

Remaining follow-up:

- Later UI follow-up: replace the current `/stripe-connect/return?proof=tips-v1` public legal/support landing with a proper Stripe return/status screen. Do not redesign it inside the Tips proof unless it blocks provider status refresh.
- Device/manual polish proof still useful: creator opens Platform Studio > Money Center > Ways to Earn > Tips, confirms test/sandbox copy, and fan opens the native channel Tip sheet with no-perk copy. Server/browser proof already closes the payment/webhook path.
- Optional negative follow-up: explicit user-canceled Checkout status, because failed-card proof already proves failed provider payments do not credit the creator.
- Keep `live_money_enabled=off`; do not claim live tips until legal/tax/fraud/support/provider/owner approval and live-mode proof are explicitly complete.

## BrowserStack Final Regression Deferral

Do not use BrowserStack for the current Tips sandbox proof unless explicitly requested. Use cheap local/manual proof with real devices/internal testers after each monetization flow. Save BrowserStack for the final full regression after all creator monetization flows are implemented and locally proved:

- Tips
- Paid Videos
- Paid Watch-Party seats
- Channel Subscriptions
- VIP Passes
- Paid Events
- Chi'lly Chat calls
- Brand Studio
- Watch-Party participant rail
- Auth email reset/signup
- Premium gates
- key Android device sizes

## Creator Monetization Truth Follow-Up

The June 11, 2026 Money Center cleanup is a clean hub and readiness surface. Tips V1 is the first repo-side end-to-end test-mode creator contribution path; it is not a live-money launch. Before building any other creator-money feature, keep this truth fixed:

- Tips, paid videos, paid Watch-Parties, channel subscriptions, VIP passes, and paid events must not be called live unless creator setup, fan checkout, server-side verification, access/transaction records, payout tracking, and admin/safety handling are all proved.
- Tips V1 must remain pure contribution only and cannot unlock content, badges, VIP, rooms, subscriptions, paid videos, event access, Watch-Party seats, public ranking rewards, or any other digital benefit.
- Paid Watch-Party Seats V1 is sandbox-proven for core room Seat Pass purchase, gate, paid entry, unpaid direct-link blocking, seat-limit enforcement, Money Center RPC readback, and June 20 exact-target purchase/readback. It is not live-money sellable; only provider refund/revoke proof remains deferred until safe tooling exists.
- Paid Videos V1 is sandbox-proven and remains separate from room Seat Passs.
- The next monetization proof work should be final regression, visual readback follow-up where still pending, and provider refund/revoke tooling when safe order identifiers exist.

Finish and verify Search, Typeahead And Social Discovery Polish for Chi’lly Chat, Chi’lly Circle, and Home Explore, then capture Android proof at `/tmp/chillywood-search-typeahead-social-discovery-proof-20260605/` for:

- Search-by-typeahead on Chi’lly Chat inbox with debounced thread filtering and People suggestions
- Chi’lly Circle “Find people” and compact official Rachi card behavior
- Explore search/typeahead scope behavior and fallback/empty-state safety

Continue the Full Interactive Surface QA sweep from the updated matrix, then resolve the two-session live-room proof blocker with a stable second device/emulator before Google Play Publishing Overview And Release Asset Closeout.

Player shared/fullscreen follow-up is repo-side complete and OTA-published, and the later Shared Player custom fullscreen rails lane is repo-side complete. `app/player/[id].tsx` keeps standalone fullscreen video in cover mode, lets shared Watch-Party playback enter fullscreen, overlays compact Share / Report / speed controls without a Watch-Party Live handoff toggle, auto-hides shared Player chrome after 5 seconds idle, and keeps tap-to-play on the existing shared playback tap handler. Shared fullscreen uses a real three-zone layout rather than absolute overlay cards: left dark rail for existing room comments/input/Send, center flex stage for the existing shared video/player surface, and right dark rail for the same portrait shared-player `renderWatchPartyBubbleGridSurface` / `LiveKitStageMediaSurface` participant bubble path. That final right-rail fix uses the portrait LiveKit roster, avatar URL map, camera-track rendering, local fallback, and press handler, and it suppresses the old `Shared Player` / `Shared playback stays here...` fallback card in fullscreen. Latest dedicated docs: `docs/SHARED_PLAYER_CUSTOM_FULLSCREEN_RAILS.md` and `docs/SHARED_PLAYER_FULLSCREEN_BUBBLE_REUSE_PROOF.md`; proof path `/tmp/chillywood-shared-player-fullscreen-bubble-reuse-proof-20260605/`. Tester visual confirmation says shared-player fullscreen now works. This did not change media resolver logic, playback sync authority, LiveKit token issuer, host approval, route ownership, Party Room behavior, old-room handling, money state, Premium/content safety, or Owner/Admin authority.

Owner/Admin button-function follow-up is complete for the controls shown in the latest user screenshots. Proof path: `/tmp/chillywood-owner-admin-button-function-proof-20260605/`; final EAS Update group `4d2e19a9-80c2-4326-a446-ff4bb481700d`, Android update `019e99d5-c372-780a-99b7-8d8f5c7bd028`, runtime `1.0.0`; Play-installed device `R5CR120QCBF`, versionName `1.0.0`, versionCode `25`, installer `com.android.vending`. The first device proof reproduced the real issue: `Grant Role` was below the selected-target summary after field entry and not reachable by the proof flow. Source fix moved `Grant Role` / `Remove Role` above the target summary, added nearby scoped-permission chip feedback, added `Use Step 1 Target`, renamed the matrix chip `Permission Templates` to `Template Access`, and tightened keyboard handling. Final proof opened/canceled Grant and Remove confirmations, loaded an existing staff account, toggled representative permission chips across Support, Moderation, Live Ops, Legal, and Security/Admin, verified the save/reset area was not keyboard-covered, and reset the draft. Temporary proof Owner role `39` was revoked; final readback shows active temp proof roles `0`, active Owner count `1`, production configs `0`, payout configs `0`, payable/paid rows `0`, and payout requests `0`. No backend authority, money state, LiveKit, route ownership, Player, Premium, content safety, or secrets changed.

Owner/Admin Search And Permission Audit Hardening is complete. Proof path: `/tmp/chillywood-owner-admin-search-permission-audit-proof-20260605/`; EAS Update group `fda01165-2608-4c82-8079-2436f429ad74`, Android update `019e99a0-3b76-7475-a129-cf3d787cd4f1`, runtime `1.0.0`; Play-installed device `R5CR120QCBF`, versionName `1.0.0`, versionCode `25`, installer `com.android.vending`. This follow-up hardens the Owner/Admin staff-control path without changing backend authority: search results now clearly identify regular directory users and staff-linked users, Step 1 Grant/Revoke Staff Access has exact target summaries and audit-reason preview, Step 2 Scoped Permission Matrix separates active/expired/unchanged/will-grant/will-revoke state, past expiration dates are blocked, grant/revoke modals can be opened and canceled cleanly, and keyboard proof shows the lower action row is not hidden after cancel. Stable proof hooks now cover search, grant, revoke, permission save/reset, confirmation, protected Owner rules, audit section, and post-revoke denial. Temporary proof Owner role `39` was revoked after screenshots; final remote readback shows active proof roles `0`, active Owner count `1`, production configs `0`, payout configs `0`, and payable/paid rows `0`. Post-revoke `/admin` denial was captured. Remaining full sweep work should continue outside Owner/Admin unless a new Admin regression is found.

Owner/Admin follow-up from the sweep is now complete. A temporary upgraded proof Owner role was used and revoked; `/admin` returned to protected denial afterward. Final proof path: `/tmp/chillywood-owner-admin-full-surface-proof-20260605/`. Final EAS Update group `94ea10b5-c0ff-459d-b669-dc46555dc287`, Android update `019e9989-5e59-71f3-a89b-bf74c7a37ed2`. Fixed Owner/Admin issues: Users search now includes the backed regular-user directory and returns `Directory user` / `Regular user` rows, not only staff-role rows; Staff Access is clearly Step 1, Scoped Permission Matrix is Step 2, and Permission Templates are permission presets only; staff/template controls are active and guarded instead of dead-looking disabled states; role confirmation cancel dismisses the keyboard. Remaining full sweep work should continue on non-Owner/Admin rows such as Player fullscreen/speed/back post-update proof, comments reply/attachment/report/delete, Chi'lly Chat, Money Center drilldowns, and true two-session live-room proof.

Full Interactive Surface QA Inventory And Device Proof is in progress in response to the need to check every tab, button, route, toggle, collapsible, field, and function. Static inventory is in `docs/FULL_INTERACTIVE_SURFACE_QA_INVENTORY.md`; current counts are `55` route files, `68` files with interactive markers, and `1180` marker hits. Tracking matrix: `docs/FULL_INTERACTIVE_SURFACE_QA_MATRIX.md`. Play-installed device `R5CR120QCBF` proved the current bottom navigation: Home, Explore, Live, and Library are bottom tabs; Profile is not a bottom tab on the tested Home screen and is reached through the top-right avatar/action. Temporary Maestro/device passes proved auth/signup visible states, Home/Explore/Live/Library navigation, Settings Profile Appearance and Account collapsibles, creator-video Player Share/Report/Discussion, Profile -> Platform routing, Platform Studio Premium gate, Monetization Setup safety state, Owner/Admin denial, Support feedback, Privacy/Terms, and Copyright Report intake. Source fixes now add stable login/signup/bottom-tab/Settings/Live-tab/creator-video-comment test IDs and fix the creator-video Player comment keyboard layout so the composer is not hidden by the Android keyboard. EAS Update group `58f4eeb6-2d38-43aa-bc07-88be79dabdb4` published Android update `019e9945-bd16-7f3c-92e0-ee919d93dfea` on runtime `1.0.0`. Proof path: `/tmp/chillywood-full-interactive-surface-qa-20260605/`. Remaining work is the matrix rows that still need deeper proof: Profile/Platform secondary actions, Platform content cards, fullscreen/speed/back post-update Player proof, comment reply/attachment/report/delete, Chi'lly Chat, full Money Center drilldowns, approved Owner/Admin tabs with an owner/operator session, and true two-session live rooms.

Signed-in Firebase Test Lab Artifact Review And Fixes is complete. Matrix `matrix-3pmfaxfsjto4g` was inspected through screenshots, video, action trace, sitemap, Robo results, and logcat. No Chi'llywood fatal exception, ANR, React Native fatal error, broken route, blank screen, stuck loading state, unsafe production money/payout copy, Stripe Android digital checkout, credential commit issue, LiveKit issue, or route-ownership issue was found. Robo reached signed-in Settings/Account, Profile/Platform actions, Platform Studio, Player/fullscreen, and comments. No code fix was made, so no signed-in rerun was needed. Review doc: `docs/android/FIREBASE_TEST_LAB_SIGNED_IN_ARTIFACT_REVIEW.md`; proof path `/tmp/chillywood-firebase-test-lab-signed-in-proof-20260605/`. This remains signed-in route smoke only and does not replace LiveKit two-session proof, Google Play purchase proof, Stripe proof, Owner/Admin authority proof, or Money Center final proof.

Firebase Test Lab Robo Artifact Review And Fixes is complete. The prior successful matrix `matrix-pcl66znev5dca` was inspected through screenshots, video, action trace, sitemap, Robo results, and logcat. No Chi'llywood crash, ANR, broken route, blank screen, unsafe production money/payout copy, Stripe Android digital checkout, LiveKit issue, or route-ownership issue was found. Two confirmed low-severity public UI/accessibility issues were fixed: signup placeholders are now readable on dark fields, and legal table-of-contents chips now keep readable contrast on light/dark themes. Rerun preflight passed and bounded matrix `matrix-1ovvi4nwvs469` passed on `MediumPhone.arm-35-en-portrait` in `306 seconds`; proof path `/tmp/chillywood-firebase-test-lab-artifact-review-fix-proof-20260605/`; review doc `docs/android/FIREBASE_TEST_LAB_ARTIFACT_REVIEW.md`. This remains cloud install/launch/public-surface smoke only and does not replace signed-in routes, LiveKit two-session proof, purchases, Stripe, Owner/Admin, or Money Center proof.

Signed-in route smoke proof was also captured separately on the Play-installed physical device before the later signed-in Firebase cloud proof. Proof path `/tmp/chillywood-signed-in-proof-20260605/`; doc `docs/android/SIGNED_IN_DEVICE_SMOKE_PROOF.md`; device `R5CR120QCBF`, package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `25`. Captures include signed-in Home, Settings, Profile, Watch-Party waiting-room/Premium gate, and route-backed Live seat gate. This remains useful local proof, but LiveKit two-session proof is still the real room gap.

Firebase Test Lab signed-in cloud setup remains available for future bounded reruns through runtime-only `FIREBASE_TEST_LAB_SIGNIN_EMAIL` and `FIREBASE_TEST_LAB_SIGNIN_PASSWORD`. The command/proof output redacts credentials and fails closed if they are missing. Do not commit passwords or claim LiveKit/purchase/Admin proof from signed-in Robo route smoke.

Firebase Test Lab signed-in cloud proof is now complete for route smoke. Ignored local proof-account values were mapped into the Firebase env vars at runtime, signed-in preflight passed, and one bounded signed-in Robo matrix passed: `matrix-3pmfaxfsjto4g`, `MediumPhone.arm-35-en-portrait`, `307 seconds`, proof path `/tmp/chillywood-firebase-test-lab-signed-in-proof-20260605/`. Artifacts show signed-in Settings/Account, Profile/Platform actions, Platform Studio, Player/fullscreen, and comments. Remaining proof gaps are the known non-Robo ones: LiveKit two-session host/viewer, purchases, Stripe, Owner/Admin authority, and Money Center final proof.

Firebase Test Lab IAM Access Proof And Bounded Smoke Run is complete. The prior 403 blocker was account-specific: the Google Play service account could describe `chillywood-app` but could not access Firebase Test Lab catalogs. Switching to the already-authenticated owner-approved Google user account cleared catalog access, `npm run firebase:test-lab:preflight` passed, and one bounded virtual-device Robo matrix passed: `matrix-pcl66znev5dca` on `MediumPhone.arm-35-en-portrait`, outcome `Passed`, test time `306 seconds`, proof path `/tmp/chillywood-firebase-test-lab-iam-smoke-proof-20260605/`. Downloaded artifacts include screenshots, video, action trace, sitemap, robo results, and logcat; fatal scan found no Chi'llywood app fatal exception or ANR. This proves cloud APK upload/install/launch smoke only. It does not replace signed-in route proof, LiveKit two-session proof, Play purchase proof, Stripe proof, Owner/Admin proof, or Money Center proof.

Device Plus Emulator Live Room Internal Test Sweep is documented in `docs/DEVICE_EMULATOR_LIVE_ROOM_TEST_SWEEP.md`. Physical device `R5CR120QCBF` remained Play-installed at `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `25`, and captured route/gate proof for Watch-Party Premium entry, Live Stage unavailable state, Watch-Party Seat Pass gate, Live access gate, Live seat gate, and background/foreground recovery at `/tmp/chillywood-device-emulator-live-room-test-sweep-20260605/`. The real host/viewer LiveKit proof did not pass because the available physical session was not a Premium host and the emulator session was unstable: Expo dev-launcher state, System UI ANR, package-service failure, and a hung current-debug APK install after a successful `./gradlew assembleDebug`. Next live-room work should use a known Premium-capable host account plus a stable second device or freshly provisioned emulator before retrying participant lists, speaker request, host approval/denial, mic/camera controls, composer, leave/rejoin, and reconnect. No LiveKit token issuer, route ownership, old-room handling, host approval, production money, payouts, cash-out, or Stripe Android digital checkout changed.

Internal Testing Stabilization Sweep is complete and documented in `docs/INTERNAL_TESTING_STABILIZATION_SWEEP.md`. Play-installed device `R5CR120QCBF` received EAS Update group `4cd86764-44c4-4a93-bd0b-274473b36cdc` / Android update `019e980c-fca8-78db-b44e-6551a6d4d0f4`, with proof at `/tmp/chillywood-internal-testing-stabilization-sweep-20260605/`. The sweep fixed two proven tester-facing issues: signed-in Premium-gated Platform Studio now routes to `Manage Premium` instead of showing `Sign In to Continue`, and route-backed Watch-Party Seat Pass / Live access / Live seat unavailable routes now show their sandbox proof cards. No production money, payouts, cash-out, Stripe Android digital checkout, LiveKit authority, route ownership, Premium/content safety, or Owner/Admin authority changed.

Production Money Policy Operations Readiness is now prepared without activation. `docs/PRODUCTION_MONEY_POLICY_OPERATIONS_READINESS.md` and `docs/PRODUCTION_MONEY_READINESS_INDEX.md` collect the legal policy materials, tax readiness, fraud/risk rules, support workflows, refund/return policies, merch fulfillment plan, payout operations plan, and Owner/Admin approval gates needed for a future production-money activation lane. These documents are policy and operations readiness artifacts only; they do not enable production checkout, production merch, payout execution, cash-out, withdrawal, transfer, payable balances, or Stripe Android digital checkout.

The route-backed monetization visual proof is complete and documented in `docs/ROUTE_BACKED_MONETIZATION_VISUAL_PROOF.md`. Play-installed Android proof captured contextual viewer gates for paid content, Watch-Party Live Seat Pass, Live Watch-Party access pass, Live Watch-Party seat pass, and event pass, plus Owner/Admin Money Center readouts for Product Catalog, Provider Events/Webhooks, Purchase Intents, Access Grants, Ledger Events, Merch Products/Orders, Payout Readiness, Money Center Overview, Money Audit Explorer, and Technical Checks. Remote readback still shows live money off, payouts off, cash-out off, production/payout/payable/publish/host-power config rows `0`, payable/paid money-access rows `0`, payout requests `0`, provider payout-enabled accounts `0`, active route-backed proof roles `0`, and active temp/proof roles `0`.

Do not start another broad monetization foundation, setup, sandbox purchase, route-backed gate, Owner/Admin monetization drilldown, or production-readiness-docs lane unless a specific regression is found. The next useful work is Play/release execution, release-candidate visual QA, or a future explicit production activation approval lane after legal/tax/provider/fraud/support signoff.

Required boundaries remain unchanged: production live money off, payouts off, payout execution absent, cash-out/withdrawal/transfer absent, sandbox/setup rows not payable, Stripe Android digital checkout absent, no fake sales/balances/provider events, no LiveKit publish or host authority from payment, and no route ownership changes.

## Recommended Lane: Google Play Publishing Overview And Release Asset Closeout

Latest monetization tester-mode note: Internal Tester Sandbox Purchase Mode with Owner/Admin controls adds a bounded `internal_tester_sandbox` override for approved Owner/Operator, runtime-allowlisted tester, or active internal beta/tester accounts. Public/default users still see Premium purchase unavailable because `PREMIUM_PURCHASE_SHELL_ON_HOLD = true`, `premiumPurchaseEnabled=false`, `live_money_enabled=off`, and `payouts_enabled=off`. Approved testers can see clearly labeled Google Play / RevenueCat sandbox Premium purchase copy, the sandbox digital-product launcher, and Stripe physical merch sandbox checkout; all rows remain sandbox/test/not payable. Owner/Admin Money Center now exposes `Internal Sandbox Testing` status and tester-tool routing. Payout readiness is read-only: no request, simulation, cash-out, withdrawal, transfer, payable balance, or payout activation is available. Production money, Stripe Android digital checkout, fake purchases/provider events/balances, LiveKit authority, route ownership changes, and safety bypass remain absent. Dedicated doc: `docs/INTERNAL_TESTER_SANDBOX_PURCHASE_MODE.md`.

Latest viewer-surface UI note: Standalone Player Overlay Controls and Fullscreen Fix closes the black-bar/fullscreen issue after the broader Player touch pass. All standalone Player surfaces now mirror the same layout: video owns the full media card, Share / Report / `1x` speed / Watch-Party Live are compact top overlays, progress/time/fullscreen are compact bottom overlays, and Back sits below the media card. Fullscreen suppresses the normal Player framework depth overlay so the bottom is not blurry, hides Discussion/comments, locks to landscape for fullscreen, preserves aspect with contain sizing, and exits with Android hardware Back. The final native proof used local release APK versionCode `24` on `R5CR120QCBF` because the Play-installed v23 binary was portrait-locked and could not receive the native orientation module by OTA; proof lives at `/tmp/chillywood-standalone-player-overlay-fullscreen-proof-20260604/`. This is UI-only polish: Player playback behavior, media resolver logic, Watch-Party Live CTA, LiveKit token issuer, LiveKit publish authority, Watch-Party/Live Stage route ownership, Party Room behavior, old-room handling, host approval, Premium/content safety gates, money state, and Admin authority are unchanged. Dedicated doc: `docs/STANDALONE_PLAYER_OVERLAY_FULLSCREEN_PROOF.md`.

Latest public/creator UI note: Public V1 Visual Consistency And Touch Polish extends the Owner/Admin interaction direction into shared public components (`components/ui/app-surface.tsx`) and applies it to Home rails, public Platform sections/actions, login primary action/status, and Platform Studio content empty/error/edit action states. EAS Update group `3f98fb2e-2cfb-4a13-89e7-b0e32609707f` published Android update `019e9273-c86e-7789-9b1a-6a9aed785f16`; proof lives at `/tmp/chillywood-public-v1-visual-touch-polish-proof-20260604/`. This is UI-only polish: backend behavior, schema, Premium gates, content safety, LiveKit token issuer, Watch-Party/Live Stage route ownership, Player playback behavior, money state, and Admin authority are unchanged. Dedicated doc: `docs/PUBLIC_V1_VISUAL_TOUCH_POLISH.md`.

Latest Owner/Admin UI note: Roles & Permissions, Users, Permission Templates, and Live Cost Guard now use the modern collapsible Owner/Admin interaction pattern documented in `docs/OWNER_ADMIN_TABS_UI_UX_POLISH.md`. This did not change backend authority, protected Owner rules, money state, LiveKit behavior, route ownership, Player behavior, or terminology. Future admin UI work should be targeted visual polish, not a security or monetization rebuild.

Monetization sandbox proof is complete and consolidated in `docs/MONETIZATION_STACK_FINAL_TRUTH.md`. Do not start another broad monetization-foundation or sandbox-proof lane unless it targets one exact remaining provider-tooling gap.

Current money truth:

- Google Play / RevenueCat sandbox proof is complete for Premium, creator tip, Watch-Party Live Seat Pass, Live Watch-Party access pass, Live Watch-Party seat pass, paid content access, and event pass.
- Stripe sandbox physical-merch checkout proof is complete for `cw_merch_test_tee_sandbox`.
- Stripe Connect sandbox payout-readiness proof is complete through a test-mode Express account, onboarding link, and account sync.
- Production live money remains off.
- App-level payouts remain off.
- Sandbox/setup rows are not payable.
- Cash-out, withdrawal, transfer, fake balances, fake sales, Stripe Android digital checkout, LiveKit authority changes, route ownership changes, and safety bypasses remain absent.

Remaining money gaps are narrow and future-scoped:

- real provider refund/revoke proof if RevenueCat/Google Play tooling supports it
- real delayed-payment pending proof if Google Play provider/device support exists
- production merch approval, fulfillment, refund/return, support, and Data Safety review
- production payout approval, live Stripe, tax/legal, fraud, payout policy, support, and Data Safety review

Recommended next work is Public V1/Play release execution, not rebuilding monetization:

- Google Play Publishing Overview and Release Asset Closeout
- Public V1 Release Candidate Visual QA
- Production Merch/Payout Legal Tax Fraud Plan, only if the owner wants production-money planning without activation

Latest runtime update pickup hardening: current source now has explicit Expo Updates foreground pickup. `app.config.ts` sets `updates.checkAutomatically` to `ON_LOAD`, and `_lib/runtimeUpdates.tsx` mounts from the root layout to check shortly after launch plus on foreground resume, fetch compatible EAS updates, and reload once per fetched update after interactions settle. Commit `dd0f7f0` is pushed and Android production EAS update group `02cbd580-7408-453e-ab79-d60b6a9365c1` published for runtime `1.0.0` with Android update id `019e8dcd-c189-720d-a94e-eda03547e3ef`. This should make future OTA pickup more reliable for testers after they receive this code once. It is not a substitute for a fresh Play internal build when installed clients are already stale or not applying OTA: for signup/Brand Studio tester confidence, the strongest path remains a new Play internal build from current `main`, then device proof on the Play-installed artifact.

Latest Play internal build result: the fresh Android production Play build for tester pickup is complete. EAS build `e673e68e-a9c3-4839-8e50-e95ccd88cfc4` finished from commit `d08e8842a7fef4b4aa4c8f14fb69b4f0b730a7e5`, runtime `1.0.0`, production channel, versionCode `21`, versionName `1.0.0`; AAB URL `https://expo.dev/artifacts/eas/uswj4PW1gA45iegpMGACJ1.aab`. Auto-submit scheduled Google Play internal testing submission `cf08d9e9-96ac-481d-afbd-349d8389ffd6`, then the local CLI wait lost its Expo GraphQL connection. A direct retry scheduled `51ea9b1d-f00a-4e7b-94f5-f4c665c4f6ae` and Google Play rejected the retry with `You've already submitted this version of the app`, which proves versionCode `21` had already reached Play. Remaining follow-up: wait for Google Play internal processing/cache propagation, have testers install/update to versionCode `21` from the same internal testing link, then run Play-installed device proof for signup success and Brand Studio Review & Publish.

Latest Brand Studio repair: Review & Publish no longer leaves selected creator-owned assets stuck at `Needs review` after `Publish Changes`. Migration `20260603033000_platform_brand_owner_publish_review_repair.sql` is remote-applied and keeps review scoped: creators can review only their own Brand Studio assets, Owner/Operator/moderation reviewers retain queue access, wrong-account review still returns `brand_review_forbidden`, and scan-blocked assets cannot be self-approved. Client publish now approves the selected owned assets before publishing, reloads Brand Studio state, and uses clean publish failure copy. Rollback proof showed owner approval succeeds for an owned pending asset and a different authenticated user is denied. Remaining follow-up is Android visual proof on `R5CR120QCBF` after installing/publishing the updated build/OTA: open Platform Studio > Brand > Review & Publish, press Publish Changes, verify selected assets leave `Needs review`, verify public Platform shows the published Brand Studio media, and verify a wrong-account/non-owner cannot review another user's asset.

Latest signup failure diagnosis: the repeated tester-facing `Signup Error / Unable to sign up right now` is not caused by username availability. Live Auth logs showed a `/signup` request returning HTTP `200` with confirmation requested, and controlled current-repo signup payloads with username/display-name metadata returned `error:null` and `session:false` as expected while email confirmation is required. The reasons this still appeared broken for testers are now documented: Play internal build `20` embeds commit `bd5c69a`, before later signup fixes `ea4b545` and `d035636`; production OTA contains those fixes but Play-installed devices have already shown unreliable newest-OTA pickup; and there was no backend `auth.users` trigger, so stale/missing metadata clients could create/confirm auth users without a profile row. Migration `20260603133500_auth_signup_profile_username_backstop.sql` is remote-applied to create/backfill `user_profiles` directly from Auth signup metadata with safe deterministic fallback handles and audit. Proof after migration showed a fresh controlled signup created the matching profile immediately and `missing_profiles_last_24h=0`; controlled proof accounts were removed. Fresh Play internal versionCode `21` has now been built/submitted; remaining follow-up is Play-installed device proof after Google Play offers v21 to testers.

Historical account deletion update: in-app deletion is no longer request-only. Self-service `Delete Account` from Settings > Account actions schedules deletion immediately, hides the account from public Profile/People search surfaces while scheduled, and allows `Restore Account` for 30 days. Remote migration `20260603014500_self_service_account_deletion_30_day_restore.sql` is applied. Later lanes close Play-installed deletion/restore visual proof and controlled single-user production purge/de-identification after `delete_after`; batch auto-purge remains disabled/default-off. Retention rules are documented in `docs/ACCOUNT_PURGE_DEIDENTIFICATION_POLICY.md` and operator steps are documented in `docs/ACCOUNT_PURGE_PRODUCTION_RUNBOOK.md`.

Historical money-access architecture result, superseded by `docs/MONETIZATION_STACK_FINAL_TRUTH.md`: the shared provider-event -> product catalog -> access grant -> resolver -> not-payable ledger -> Money Center inspection path is repo-backed and remote-applied through migration `20260603165000_money_access_grants_product_catalog.sql`, helper `_lib/moneyAccessGrants.ts`, Owner/Admin Money Center readout counts, generated Supabase types, and `npm run guard:money-access-grants-policy`. The later proof lanes completed Google Play / RevenueCat sandbox proof for paid content, Watch-Party Live Seat Passes, Live Watch-Party access/seat passes, creator tip, and event pass; completed Stripe sandbox physical merch checkout; and completed Stripe Connect sandbox payout readiness. Production versions of those products remain off/not active, sandbox/setup rows remain not payable, and no Stripe Android digital checkout, cash-out, withdrawal, transfer, fake balance, fake sale, or fake payable ledger row exists.

Historical real sandbox money preflight, superseded by later product-mapping and purchase-proof lanes: `revenuecat-webhook` ACTIVE version `8` added the shared money-access mirror for real Premium events. At that point Premium was the only mapped product, but later June 3/June 4 lanes created the six non-Premium sandbox mappings and completed real Google Play / RevenueCat sandbox purchases for creator tip, Watch-Party Seat Pass, Live Watch-Party access, Live Watch-Party seat, paid content, and event pass. Current remaining money work is not missing mapping; it is only provider refund/revoke tooling, delayed-payment pending tooling, and future production approval planning.

Historical RevenueCat/Google Play access-product update, superseded by the June 4 failure-path/event-pass lane: the dynamic purchase-intent bridge is remote-applied, provider products are created, and real sandbox purchases are proved for creator tip plus access products. The later event-pass lane also proved `cw_event_pass_sandbox_099`, duplicate/idempotency, admin revoke, and expired intent safety. Remaining proof is limited to real provider refund/revoke and delayed-payment pending if provider tooling supports it. Do not insert fake sales.

Latest Premium clarification: older proof-window notes that described a globally reopened Premium shell are superseded. Current source intentionally keeps the public/default shell closed with `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` and `premiumPurchaseEnabled=false`; only approved accounts use the explicit `internal_tester_sandbox` mode. That mode lets internal testers run real Google Play / RevenueCat sandbox purchase tests without live money, payouts, cash-out, payable balances, fake sales, or Stripe Android digital checkout.

Play-installed proof is now closed on `R5CR120QCBF` at `/tmp/chillywood-premium-play-signed-repair-proof-20260602/`. The local sideload was removed, Google Play internal testing installed `com.chillywood.mobile` with `installer=com.android.vending`, versionCode `13`, versionName `1.0.0`, and the app opened signed in. Settings > Manage Premium shows `Premium is not active`, `Purchase status` = `Available`, and `Subscribe to Premium`. Tapping the actual Subscribe button opens the Google Play sandbox subscription sheet for `Chi'llywood Premium`, package `com.chillywood.mobile (unreviewed)`, product route `premium_subscription`, `$9.99/5 min + tax`, and `Test card, always approves`, with copy stating it is a test subscription and the user will not be charged. The final Google Play `Subscribe` confirmation was not pressed in this pass, so no new purchase/entitlement mutation is claimed.

Google Play listing icon follow-up is also closed repo-side/external-API side. The current branded 512x512 listing icon was re-uploaded and committed through Android Publisher for `com.chillywood.mobile` / `en-US`; readback shows one icon with image id `9058525658997174018` and SHA-256 `b350be77fe32353503f0b514ea2cd01f3d7d52cfe6e0d8cb45bb4bd2d966c438`. If the Google Play Billing sheet still shows the generic placeholder, wait for Play cache propagation or clear Play Store cache/reopen the sheet before treating it as a new app-side icon bug.

Latest username Android follow-up: `/tmp/chillywood-username-local-device-proof-20260601/` and `/tmp/chillywood-username-platform-chat-proof-20260601/` prove the local attached-device username flow without EAS. The Modern Username Handle System commit `2e73f9a` is pushed, and `main` was aligned with `origin/main` at starting HEAD `950b49b`. `eas.json` is clean in the workspace; the prior `closed` submit profile diff is already committed in `950b49b` as intentional Play `alpha` draft submit setup, not a current dirty username-lane change. Current-source `./gradlew assembleRelease` succeeded. The first in-place install over Play v13 failed with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` because the local APK signature did not match the Play-installed app; after the owner said to use the attached device locally, Play v13 was uninstalled and the local release APK installed successfully as versionCode `8`. The local signed-out app launches and signup username UI is captured for `Too short`, invalid `bad/name`, reserved `admin`, available `cwlocal231039`, and taken `test`. No account was created and `cwlocal231039` was not claimed. Signed-in proof on `R5CR120QCBF` now captures Settings username editor (`@chillywood92`, invalid/reserved clean copy, no saved username mutation), Profile display name plus `@chillywood92` with no public email/raw id, Platform display name plus `@chillywood92`, Explore People email-shaped search returning 0, Rachi returning Official Chi'llywood `@chillywood.rachi`, Admin Users read-model detail showing a `USERNAME` field plus masked email, and Chi'lly Chat inbox/thread header showing `Proof R3` plus `@user24af82f9f8a2`. The Admin visual proof used an upgraded proof role only long enough to expose the owner-only Users read model; the temporary membership row was restored to revoked operator. The final Chat proof used an existing backed direct thread rather than inserting a fake fixture; an unauthenticated direct SQL insert attempt was rejected by the existing `chat_thread_auth_required` trigger.

Username backend/guard re-proof from this follow-up remains clean: 28 profiles, 0 blank usernames, 0 invalid usernames, 0 duplicate groups, 0 reserved conflicts, duplicate/reserved/invalid writes rejected, normal authenticated RLS update of another profile updated 0 rows in rollback, public email-shaped People search returned 0, Rachi public search returned `chillywood.rachi`, and admin-like public search returned 0. Validation passed the requested typecheck/runtime/guards plus Supabase migration list, lint, dry-run, and diff checks.

Latest release-upload result: owner-approved signed EAS upload work is complete as far as Play currently allows. Proof path: `/tmp/chillywood-google-play-release-v14-20260601/`. EAS production build v14 (`aa288961-1466-4f2f-8e45-b722f3be9cc8`) produced a signed non-debug AAB, SHA-256 `1d66a51ff289d7e7f9cdbe9cca2ab331aac843205360ed824d9756d33d23`, versionCode `14`, and submitted successfully to Google Play internal testing via EAS submission `5ff5a508-b283-42ac-819f-7049681c126c`. Closed-track submit of v14 failed because that versionCode had already been submitted. EAS production build v15 (`217dcbb2-e50e-49fb-bdf6-753e2d9b6489`) produced a signed non-debug AAB, SHA-256 `722cff66465c1ae233c79841303e8c1956cf3be35f609261500f6f52dea509dc`, versionCode `15`, and submitted successfully to the closed `alpha` track as a draft release via EAS submission `aa048c3c-054d-46fc-9e2c-2887543ac7ce`.

Store listing result: Play Console contact details/category were saved/published, and the default store listing was saved with short/full descriptions, generated Play listing icon, generated feature graphic, and sanitized phone/tablet screenshots. The accidental YouTube/XR field value was cleared before saving. The S Pen overlay was removed from the phone before final screenshot recapture.

Current exact blocker:

- Google production review cannot be sent yet because Play Console still requires closed testing completion: closed test release availability plus at least 12 opted-in testers and a 14-day closed test before production access/review can proceed.
- The v15 closed-track upload is draft because Google rejected a completed closed-track release while required metadata/minimum release readiness was still incomplete.
- Do not claim Google review submission, production access, or production acceptance until Play Console allows and confirms it.
- Premium purchase shell remains closed by default. Production Premium is not overclaimed. Live money, tickets/seats, tips, paid content, payouts, fake balances, cash-out, and Stripe Android digital checkout remain off.

Next owner/operator action:

- Add/confirm at least 12 closed-test opted-in testers, keep the closed test running for the required 14 days, then return to Publishing overview/Production access and send the app for Google review when Play enables the action.
- If Play requires converting the v15 closed release from draft to completed after remaining metadata/tester setup is accepted, do that in Play Console or through an owner-approved submit lane.

Newest repo/backend lane closed: Modern Username Handle System on June 2, 2026. Migration `20260602032030_modern_username_handle_system.sql` is remote-applied and types regenerated. Backend proof shows canonical lowercase username enforcement, 0 duplicate groups ignoring case, 0 invalid usernames, 0 reserved conflicts, duplicate/reserved/invalid insert rejection, public People search no email lookup, Rachi public `chillywood.rachi` protection, and RLS preventing a normal authenticated claim from updating another user's username. Signup and Settings now include compact username UI with debounced availability; Profile/Platform identity, Explore People, Chi'lly Circle, Chi'lly Chat, and Admin user rows have handle support where backed. Dedicated doc: `docs/USERNAME_HANDLE_SYSTEM.md`.

Remaining username follow-up:

- Username-based `/profile/@handle` or `/u/[username]` routing is deferred; existing `/profile/[userId]` and `/channel/[userId]` remain canonical.
- Username change frequency limits and old-handle grace holds are deferred.
- Owner/Admin reserved-name management UI is deferred; backend table/RPC controls and audit exist.

Latest readiness result: Play Console App Content entry is now saved/actioned, but not yet sent through Google review. Proof path: `/tmp/chillywood-google-play-external-acceptance-20260601/play-console-proof/`.

Closed now:

- Play Console App Content Need attention tab shows "You're all caught up"; Actioned tab shows `10 actioned declarations`.
- Data Safety was completed/saved with no third-party data sharing, account/deletion URLs entered, and current collection categories documented for account/profile identifiers, purchase history, UGC/media/messages/files/audio, app activity, diagnostics/performance, and device IDs.
- Content Rating was completed/saved with IARC/region ratings and UGC/chat/live/social/purchase answers.
- App Access was saved with reviewer credentials entered only in Play Console from ignored local env values; no password is committed or screenshotted.
- Privacy Policy, Ads, Advertising ID, Government apps, Health apps, Financial features, and Target audience/content declarations are saved/actioned.
- `docs/google-play/EXTERNAL_ACCEPTANCE_TRACKER.md` maps App details, Store listing, Contact details, Privacy Policy, App access, Ads, Content Rating, Target audience, News declaration, Data Safety, Account deletion, UGC/moderation, financial features, permissions, AAB upload, testing, reviewer instructions, and release notes.
- Play-installed app stayed valid on `R5CR120QCBF`: `installer=com.android.vending`, versionCode `13`, versionName `1.0.0`, launcher activity present, and the app opens Home.
- The current session opens Admin Command Center, so the phone is no longer left in the disposable non-Premium proof account.
- Bounded Premium purchase shell was opened only for earlier proof, then closed again. Final close update group: `5668cdaa-cd5b-4553-bd91-7b786323fd22`; EAS production branch readback for runtime `1.0.0` shows that group is still the newest production update. Current source keeps `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` and `premiumPurchaseEnabled: false`, and `/subscribe` shows purchase status `Temporarily unavailable`.
- Fresh Google Play sandbox purchase succeeded; Restore Purchases completed active.
- Real RevenueCat webhook event `0bd7...60d7` reached the deployed Supabase function and returned HTTP 200 with `webhookProcessed:true`, `premiumGranted:true`, and `liveMoneyAction:false`.
- Sanitized backend readback found one backend-active `premium` row for the test user with `source='revenuecat'`, sandbox Play Store metadata, and no raw provider payload storage. A later sandbox renewal refreshed the active window.
- Platform Studio opened during the backend-active window and showed creator actions instead of Premium-required denial, proving unlock from backend entitlement.
- Non-Premium runtime denial is device-proved at `/tmp/chillywood-non-premium-denial-proof-20260601/`. The disposable proof account has zero Premium rows, zero active Premium rows, zero active platform roles, and normal-user entitlement insert was denied with `42501`.
- `revenuecat-webhook` remains deployed ACTIVE version `7`; source proof still requires the shared secret, handles dashboard `TEST` with no Premium grant, writes backend Premium rows only for real mapped provider events, and returns `liveMoneyAction:false`.
- Current local repo AAB remains debug-signed and must not be uploaded. Prior non-debug signed candidate `artifacts/google-play-proof/chillywood-v12.aab` exists outside tracked source, while the attached phone is already Play-installed v13.
- Production Premium is not live. Live money, tickets/seats, tips, paid content, balances, payouts, and Stripe Android digital checkout remain off.

Current external blockers:

- Publishing overview still needs owner review/approval before sending the saved App Content changes to Google review. Do not claim Google acceptance until Play confirms it.
- Finalize/upload store listing feature graphic and selected sanitized screenshots if the Main store listing still requires them.
- Upload only an owner-approved signed non-debug AAB to the intended test/release track; do not upload the current debug-signed repo AAB.
- Confirm the reviewer Google account is licensed/internal-test eligible if reviewers should test Premium; current CLI Play API readback with the outside-repo service account returned `403`, so tester/product readback could not be freshly re-proved from CLI.
- If Google reviewers should test Premium purchase, the owner must explicitly approve a bounded Premium purchase-shell opening for that submitted build/test window.
- Keep the purchase shell closed unless the owner intentionally opens it for reviewer sandbox testing.
- Keep production Premium unclaimed and keep live money, tickets/seats, tips, paid content, payouts, fake balances, and Stripe Android digital checkout off.

## Previous Recommended Lane: Bounded Premium Purchase Shell v13 And Sandbox Restore Proof

Latest purchase-shell result: The Play-installed v12 app on `R5CR120QCBF` is signed in and the Premium sandbox purchase/restore path was proved through an owner-approved bounded EAS update. Temporary update group `b678522a-8734-49a1-a582-f2bc6743c756` opened only the Premium shell; Google Play showed the sandbox `Chi'llywood Premium` subscription with the always-approves test payment method; purchase completed; `/subscribe` showed `Premium is active`; restore completed with `Purchases restored. Premium is active.` The shell was then closed again with update group `82f7e7fd-d213-4f50-9c5d-6e6a328884db`; current source keeps `PREMIUM_PURCHASE_SHELL_ON_HOLD = true`. Proof path: `/tmp/chillywood-play-installed-premium-sandbox-purchase-proof-20260601/`.

Superseded blocker from that lane:

- Backend entitlement sync/readback was the remaining gap for that older lane. It is now superseded by `/tmp/chillywood-fresh-revenuecat-sandbox-entitlement-proof-20260601/`, where a real RevenueCat event wrote/refreshed a backend Premium row and Platform Studio unlocked during the backend-active window.
- Keep live money, tickets/seats, tips, paid content, payouts, balances, and Stripe Android digital checkout off.

Latest Play-installed result: Play-Installed VersionCode 12 Premium Sandbox Proof advanced the strongest required prerequisite. On `R5CR120QCBF`, the old sideloaded install was removed with owner approval, the internal-test invite was accepted, and Google Play installed `com.chillywood.mobile` from internal testing. Device proof reports `installer=com.android.vending`, `versionCode=12`, `versionName=1.0.0`, and install time `2026-06-01 10:19:10`. Proof lives at `/tmp/chillywood-play-installed-v12-premium-proof-20260601/`. Play Console read-only proof shows internal testing active on release `1.0.0` / versionCode `12` with tester list `Chi'llywood Internal Testers`; no track/release/tester mutation was made.

RevenueCat mapping is now confirmed from the logged-in dashboard without exposing secrets: project `c5629a24`, Android app `appd24db94dd8`, package `com.chillywood.mobile`, Play Store product `premium_subscription:monthly`, subscription id `premium_subscription`, base plan `monthly`, entitlement `premium`, and offering `premium`.

Current exact blocker:

- The Play-installed v12 app launches to the signed-out Chi'llywood login screen after reinstall; no safe app test-account password was available in-session.
- The installed v12 build still has `PREMIUM_PURCHASE_SHELL_ON_HOLD = true`, so a sandbox purchase cannot be started from that build.
- Sandbox purchase/restore, RevenueCat active entitlement, backend `user_entitlements` update, Premium creator-tool unlock, and non-Premium runtime denial were not claimed.
- Production Premium is not live, and money/tickets/tips/paid content/payouts remain off.

Next action:

- Owner provides a Chi'llywood test-account sign-in path through device/App access only; do not commit passwords.
- Owner explicitly approves the bounded purchase-shell opening path, likely a new signed internal-track build/versionCode after code review and validation.
- Keep the shell limited to Premium sandbox proof; do not enable tickets/seats, tips, paid content, balances, payouts, live money, or Stripe Android digital checkout.
- Install the new approved build from Play, sign in, confirm `/subscribe` loads the RevenueCat Premium product, run sandbox purchase or restore, verify RevenueCat active entitlement, verify backend `user_entitlements`, restart, prove Premium creator tools unlock, then prove a separate non-Premium account is still denied.

Previous API/upload readiness result: Google Play API Internal Test Upload Readiness found a usable service-account API path and an existing non-debug signed AAB artifact, but no upload was performed because owner approval was not given. Do not upload the current repo-built AAB because it is debug-signed. Candidate signed artifact found: `artifacts/google-play-proof/chillywood-v12.aab`, SHA-256 `e256d62de976fbf1b930e5c81cda921f2798ce55f0e4b421139f624e5d2956c1`, package `com.chillywood.mobile`, versionName `1.0.0`, non-debug SHA256withRSA signer with blank DN. Service account material exists outside the repo at `/Users/loverslane/secrets/chillywood/revenuecat-google-play-service-account.json`, and legacy gcloud ADC for `chillywood-revenuecat-play@chillywood-app.iam.gserviceaccount.com` can create/read/delete Play edits. Internal track already reports completed release `1.0.0` with versionCode `12`; alpha/beta/production are empty.

Latest follow-up result: RevenueCat Google Play Sandbox Purchase Restore Proof closed the current repo/device lane without claiming a purchase. `validate:runtime` still reports `revenueCatAndroidPublicKeyConfigured: true`, the production Android RevenueCat public SDK key remains only in ignored local config, and no secret value was printed or committed. Android proof on `R5CR120QCBF` lives at `/tmp/chillywood-revenuecat-google-sandbox-premium-proof-20260601/`. Subscribe showed Premium inactive, purchase temporarily unavailable, and Restore purchases completed with `Premium is not active`. Money Center showed setup/readiness, no payable balance, and no active money. Watch-Party entry showed Premium required. The visible Watch-Party setup label was cleaned from proof-hold wording to setup-needed wording and the Premium sandbox guard now rejects `PROOF HOLD` in shippable user-facing code.

Current exact blocker:

- Sandbox purchase cannot be claimed while `PREMIUM_PURCHASE_SHELL_ON_HOLD = true`.
- The local proof build is not proven as Play-internal-track installed / Play-signed for sandbox purchase.
- No approved licensed tester account, current Play subscription/base-plan state, or RevenueCat dashboard mapping proof was available in this session.
- Restore was attempted and did not return active Premium for the signed-in account.

Next proof should:

- Upload/install the matching build through Google Play internal/closed testing with the approved signing path.
- Use a Play licensed tester account entered only through Play Console/App access.
- Confirm RevenueCat entitlement `premium`, offering `premium`, and Google Play product/base-plan mapping in dashboards without exposing secrets.
- Temporarily open the Premium purchase shell only for bounded sandbox proof once provider/tester/build readiness is verified.
- Run purchase or restore, verify RevenueCat active entitlement, verify backend `user_entitlements` active row/update, restart, and prove Premium-gated creator tools unlock.
- Re-prove a non-Premium account remains denied.
- Keep live money, tickets/seats, tips, paid content, payouts, fake balances, fake checkout, and Stripe Android digital checkout off.

## Previous Recommended Lane: RevenueCat / Google Sandbox Premium Purchase Proof Closeout

Latest follow-up result: RevenueCat Android Production Key and Sandbox Premium Purchase Proof resolved the local Android production RevenueCat public SDK key configuration without committing the key. The key is present only in ignored local config, the release bundle was force-regenerated after Gradle initially reused a stale JS bundle, and `npm run validate:runtime` now reports `revenueCatAndroidPublicKeyConfigured: true`. Current source built and installed on `R5CR120QCBF`; proof lives at `/tmp/chillywood-premium-sandbox-key-proof-20260601/`. Subscribe still shows Premium not active and purchase setup temporarily unavailable because the Premium purchase shell remains intentionally on hold; Money Center stays setup/not-active, digital sales remain sandbox/setup only, and no payable balance appears. No sandbox purchase, restore, RevenueCat active entitlement, or Google Play product proof is claimed. `npm run guard:premium-sandbox-policy` locks no Premium bypass, no owner setup access as strict Premium entitlement, backend entitlement behavior, money-off posture, and no Stripe Android digital checkout.

Latest repo-side lane before the next proof lane: Premium Sandbox Regression Proof After Guard Restore. Premium guards are restored and the old shippable `PREMIUM_LIVE_GATE_PROOF_HOLD` bypass is removed. Creator upload, Platform Studio, Brand Studio, Clip Studio, Watch-Party Live start, and Live Watch-Party host paths are gated again with clean Premium-required/setup-needed copy. Backend enforcement now includes Premium/owner-operator creator-tool checks in RLS/storage/function paths; strict Premium gates require trusted entitlement proof and do not treat owner setup access as a Premium entitlement.

Current Premium config truth:

- Local Android debug RevenueCat public SDK key is present.
- Local Android production RevenueCat public SDK key is present in ignored local config and was proved in the regenerated release bundle without printing or committing the value.
- Local iOS RevenueCat public SDK key is empty.
- Runtime validator reports `revenueCatAndroidPublicKeyConfigured: true`.
- The configured Premium target in code uses entitlement id `premium` and offering id `premium`.
- Google package is `com.chillywood.mobile`; current Play product proof still needs external Play/RevenueCat dashboard confirmation.
- The Premium purchase shell remains on hold, so this lane did not fake or re-run a sandbox purchase.

Next proof should verify with owner-provided external setup:

- Put the Android RevenueCat public SDK key into the approved production/EAS public build env/config path for the uploaded build; keep local `.env.local` ignored and never commit secret/server keys.
- Provide a safe Google Play licensed tester account only through Play Console/App access, not committed docs.
- Confirm the submitted build has the correct production Android RevenueCat public SDK key and a freshly generated JS bundle if purchase/restore is expected in a release build.
- Confirm RevenueCat entitlement `premium`, offering `premium`, package/product mapping, and Google Play subscription product/base plan in the provider dashboards.
- Decide when to take the Premium purchase shell off hold for a bounded sandbox purchase proof; do not expose a buy button until Play/RevenueCat tester/product readiness is confirmed.
- Run sandbox purchase or restore on Android, verify RevenueCat active entitlement, verify backend `user_entitlements` active row/update, restart the app, and prove Premium-gated creator tools unlock without any bypass.
- Prove a non-Premium account is still denied on Platform Studio, Brand Studio, Clip Studio, creator upload, Watch-Party Live creation, and Live Watch-Party hosting.
- Keep `live_money_enabled`, tickets/seats, tips, paid content, payouts, and Stripe checkout for Android digital goods off.
- Keep screenshots and command logs outside the repo, preferably under `/tmp`.

Validation to rerun after provider setup:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:spectator-child-room-policy`
- targeted proof for no Premium bypass, no fake Premium, `live_money_enabled` off, no fake tickets/seats, and no Stripe Android digital checkout.

## Previous Recommended Lane: Profile Media Viewer And Removal Runtime Closeout

Latest repo-side lane before the next proof lane: Current Build User-Facing Copy Visual Smoke. The current release APK was rebuilt, release JS bundle was force-refreshed, installed on `R5CR120QCBF`, and opened past splash into Home. Proof path: `/tmp/chillywood-current-build-copy-visual-smoke-20260531/`. Final APK: `android/app/build/outputs/apk/release/app-release.apk`, `205661499` bytes, SHA-256 `6fe62ce802d0c382c3e02ca720f59e6800a2cfd22e0542d8c8f1d0202c7804c6`.

Captured surfaces include Home, Explore/no-match, Library, Live Hub, owner Profile, Platform Studio, Brand Studio, Clip Studio, Money Center, public Platform, Player, Support, Copyright Report, Account Deletion, Settings legal/account, Watch-Party Live entry, Live Stage unavailable, and Spectator unavailable safe states where reachable. The smoke found one public legal copy issue on Account Deletion: `approved backend deletion` / `magic instant wipe`. The shared legal policy source, generated public legal site, and legal-site builder now use production-safe deletion/de-identification copy and Platform terminology. `guard:critical-ux-polish-policy` now covers those public legal regressions. The final UI text scan found no banned normal-user technical placeholder copy in current/final captures; the remaining visible `Proof` text is backed fixture account data, not app chrome.

Validation passed:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:critical-ux-polish-policy`
- `npm run guard:navigation-terminology-policy`
- `npm run guard:profile-production-policy`
- `npm run guard:rachi-official-policy`
- `npm run guard:public-user-search-policy`
- `npm run guard:admin-search-policy`
- `npm run guard:money-center-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:malware-scanning-policy`
- `npm run guard:vod-quality-policy`
- `npm run guard:refresh-policy`
- `npm run guard:livekit-simulcast-dynacast-policy`

Next proof should verify:

- Profile Photo remove/fallback plus backend `user_removed` read-back after the modern review-sheet flow.
- Profile Background remove/fallback plus backend `user_removed` read-back after the full-page background fix.
- Viewer and signed-out users cannot edit Profile media.
- Viewer and signed-out users cannot see non-active avatar/background media.
- Optional recapture of signed-out/auth route copy, Chat, Admin denial, and permission-denied picker/camera/mic/notification states when safe fixtures are available.

Keep screenshots outside the repo.

## Previous Recommended Lane: Profile Media Viewer And Removal Runtime Closeout

Latest repo-side Platform Content lane: Platform Studio Content / Clip Studio featured-video polish. The old direct Content upload form and `Classic Upload` entry are removed from the normal Platform Studio Content surface. Clip Studio is the creator-video upload path. Content now shows `Add Video` / `Open Clip Studio`, Clip Studio video selection says `Choose Full Video`, and the current long-form product target is `2 hr 30 min` while the existing file-size upload cap remains the backed enforcement gate. Owner creator-video cards no longer show technical VOD ladder/pixel/free/Premium quality copy. Public videos can be selected as the public Platform spotlight with `Set Featured` and cleared with `Remove Featured`, backed by `platform_brand_profiles.spotlight_video_id` and the public-safe Platform branding resolver. Public Platform prefers the selected `Featured` video and keeps Latest Uploads chronological. Clip Studio cover controls now show `Choose Cover Image` when empty and `Change Cover` / `Remove Cover` when present.

Android proof path for the Platform Content lane: `/tmp/chillywood-platform-content-clip-featured-proof-20260531/`. The fresh release APK installed on `R5CR120QCBF`; screenshots/XML capture Content, owner card actions, Clip Studio full-video controls, Set Featured success, and public Platform loading the Featured surface.

Before that, Brand Studio Platform one-device route proof plus Profile Media Modern Review and Full-Page Background Fix completed on `R5CR120QCBF`. Brand Studio `Preview Platform` loaded the reviewed public Platform and correctly kept pending-review Brand Studio visuals off the public surface; `Preview Brand Draft` loaded the Platform draft-preview route and showed the saved Brand Studio visual with owner-only draft preview context. Main route smoke loaded Home, Explore, Live, and Library after the fix. The pass found and fixed a real user-facing route gap: `chillywoodmobile://library` hit the unmatched-route screen because the actual tab is `/(tabs)/my-list`; `/library` now redirects to the Library tab, and `/home` redirects to Home.

Profile Media Modern Review and Full-Page Background Fix remains current: Brand Studio pending-review media still does not render on the public Platform; that is intentional. Owner-only `Preview Brand Draft` remains the way to inspect saved Brand Studio visuals before review without exposing owner controls or draft creator content to public viewers. Normal `Preview Platform` remains the reviewed public view. Profile Photo/Profile Background upload still uses Android-safe content-URI staging, Supabase Storage REST upload with SDK fallback, and signed read-back verification, but the broken Android native crop UI is no longer used. The app now opens the phone photo library with `legacy: false`, then shows a Chi'llywood in-app review sheet with a real preview and Fill/Fit/Center choices before saving. Profile Background now renders as a readable full-page Profile skin, not just the top cover/header area.

Current Brand Studio/Platform route proof lives at `/tmp/chillywood-brand-studio-platform-one-device-proof-20260531/`. Current Profile media proof lives at `/tmp/chillywood-profile-brand-media-one-device-proof-20260531/` and includes the rebuilt release APK install/open, safe proof images staged on `R5CR120QCBF`, Settings/Profile Appearance, avatar save proof from the prior device step, background save/update proof, and a current full-page Profile background screenshot behind Profile actions, tabs, composer, and feed. Current APK metadata from the Profile media lane: `android/app/build/outputs/apk/release/app-release.apk`, `205656923` bytes, SHA-256 `c78e72bc47c7a90e5166d66ecbf7d07daa7c3cd424cce4c9743f373fd943ed70`.

Next proof should verify:

- A non-owner/signed-out public Platform cannot use or see draft Brand Studio preview assets.
- Profile Photo remove/fallback plus backend `user_removed` read-back after the new review-sheet flow.
- Profile Background remove/fallback plus backend `user_removed` read-back after the full-page background fix.
- Viewer/signed-out users cannot edit Profile media and cannot see non-active avatar/background media.

Do not use private gallery photos. Use app-owned/safe proof assets only, and keep screenshots outside the repo.

## Previous Recommended Lane: Owner Play Console Submission And Play-Signed Release AAB

Latest repo-side lane closed before this external Play lane: Brand Studio Modern Asset Manager Upload Fix. Brand Studio remains Platform branding only; Profile media remains in Profile Appearance. Brand Studio upload root cause was brittle Android document-picker URI handling plus no byte read-back. The fix stages Android content URIs, uploads through Supabase Storage REST with SDK fallback, verifies read-back, and then creates the draft asset row. The Brand tab is now a compact asset manager with collapsible Hero Media, Background, Avatar and Logo, Theme, Scene Presets, and Review and Publishing; fit/overlay/blur/remove controls show only after media exists. Draft/pending/rejected/unsafe media stays off public Platform through existing publish/moderation/scan gates.

Public V1 eight-blocker burn-down is complete in `docs/PUBLIC_V1_READINESS_BLOCKER_MAP.md`.
Store Legal Account Deletion Ops Closeout is documented in `docs/legal/STORE_LEGAL_ACCOUNT_DELETION_ACCEPTANCE_CLOSEOUT.md`.
Google Play Data Safety Account Deletion Acceptance Closeout and the field-by-field Play Console operator packet are now repo-side packaged in `docs/google-play/`.

Current launch truth:

- Fresh current-HEAD local Gradle APK/AAB proof is complete from `main` HEAD `12c97e56de6bb0a5f435f1c9aa81742f700af4dc`. Proof path: `/tmp/chillywood-current-head-play-upload-proof-20260530/`.
- Fresh artifacts from the successful high-memory release build are APK `android/app/build/outputs/apk/release/app-release.apk` (`205639147` bytes / `196M`, SHA-256 `abc67ba63c4679ca005d9b3fcb9dc2a5286dd74c48525f1580c7d1ea94f5ed33`) and AAB `android/app/build/outputs/bundle/release/app-release.aab` (`132125002` bytes / `126M`, SHA-256 `57f8f8da17f21959ef7d3f4abb661fad5135757caa277d2b9a03ddec192ad199`), package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `8`, targetSdk `36`.
- The fresh release APK installed with `Success` on `R5CR120QCBF` and opened past splash. Route smoke captures Home, Explore loaded, Live, Library, Profile/avatar entry, Settings/legal area, Player `/player/t1`, Platform Studio, Money Center, and Admin. App-specific crash scan returned zero fatal/ANR matches.
- Signing boundary: the local Gradle release config still uses `signingConfigs.debug`, and signing proof shows `CN=Android Debug`. Treat the local AAB as current-HEAD build proof, not final Play-upload signing proof, unless the owner confirms that this signing certificate is accepted for the target Play app. Actual upload should use the owner-approved EAS/Play upload signing path or a corrected release signing config.
- Firebase Test Lab Android smoke setup is repo-side complete. Runbook: `docs/android/FIREBASE_TEST_LAB_RUNBOOK.md`; proof path: `/tmp/chillywood-firebase-test-lab-proof-20260530/`.
- Prior Firebase Test Lab lane artifacts were APK SHA-256 `94a5154c5ab894d57ce03009115a6e86ff2888d750d7d7b9423c2df217b82e5e` and AAB SHA-256 `e90211578a50521cdec71b58e9ef379aa1ae636e061282986f94e537b1d1b41b`; those remain cloud-smoke evidence only and have been superseded for current-HEAD artifact proof by `/tmp/chillywood-current-head-play-upload-proof-20260530/`.
- One Firebase Test Lab virtual Robo run passed on `MediumPhone.arm`, Android API `35`, English portrait, 5 minute timeout, matrix `matrix-xfre4x5gqc47a`, in `308` seconds. Results: `https://console.firebase.google.com/project/chillywood-app/testlab/histories/bh.e9371a121da8f5fe/matrices/6982988100476756190`.
- Test Lab proof currently means cloud install/open and signed-out auth/login-surface Robo smoke. It does not prove signed-in route coverage, Play acceptance, physical Test Lab devices, LiveKit multi-user, TURN/cellular, real mic/camera, Watch-Party capacity, or route coverage beyond what Robo reached. Billing/quota status was not verified because the local `gcloud beta billing` command required installing the beta component; no billing setup or paid-capacity change was made.
- LiveKit multi-participant emulator proof was attempted at `/tmp/chillywood-livekit-multi-participant-proof-20260530/` with `R5CR120QCBF` plus local AVDs. Two emulators booted but became system/launcher-ANR unstable, and the single-emulator fallback opened only to splash before a system ANR. The physical device installed/opened the current release APK and focused `MainActivity`, but it was locked on the Android PIN bouncer, so route navigation and room proof could not continue from adb. No joined Live Watch-Party / Watch-Party Live multi-participant proof is claimed. Remaining requirements are an unlocked physical device, a stable second device/emulator, safe signed-in accounts, and a valid room fixture.
- LiveKit Simulcast/Dynacast safe optimization is now scoped to current camera-room surfaces. Watch-Party Live shared-player camera seats and Live Watch-Party / Live Stage camera seats use `adaptiveStream: true`, `dynacast: true`, and the existing SDK-supported `simulcast: true` publish default. Mobile camera capture remains capped at 720p/30fps/1.7 Mbps, Audio RED remains inherited from the SDK default without an audio behavior change, and `LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS` remains `4`. Chi'lly Chat video calls were audited and are excluded because they use the separate direct `RTCPeerConnection` communication stack, not LiveKit Room options; they retain their four-participant and 640x480 ideal / 720p max / 24fps max posture.
- Proof for the optimization lane lives at `/tmp/chillywood-livekit-simulcast-dynacast-proof-20260530/`; proof for the emulator/device attempt lives at `/tmp/chillywood-livekit-multi-participant-proof-20260530/`. Two-device media/performance, TURN/cellular, reconnect, and 10-participant load proof remain future prerequisites before any seat-limit increase.
- Google Play execution package is now created without claiming external acceptance. Owner/operator docs are:
  - `docs/google-play/PLAY_CONSOLE_EXECUTION_CHECKLIST.md`
  - `docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md`
  - `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md`
  - `docs/google-play/ACCOUNT_DELETION_URL_CONTENT.md`
  - `docs/google-play/REVIEWER_ACCESS_INSTRUCTIONS.md`
  - `docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md`
  - `docs/google-play/CONTENT_RATING_QUESTIONNAIRE_PREP.md`
  - `docs/google-play/RELEASE_UPLOAD_CHECKLIST.md`
  - `docs/google-play/STORE_LISTING_ASSET_CHECKLIST.md`
- The new field-by-field packet covers App details, Store listing, App category, Contact details, Privacy Policy, App access, Ads declaration, Content rating, Target audience, News declaration, Data Safety, Account deletion, UGC/moderation, financial/in-app purchases, sensitive permissions, release notes, closed testing, App bundle upload, and reviewer instructions.
- The older Firebase Test Lab AAB proof remains evidence only. Use the fresh current-HEAD artifact metadata above for current build proof, then use EAS/Play upload signing or corrected release signing before actual Play upload. Current repo values are package `com.chillywood.mobile`, versionName `1.0.0`, and versionCode `8`.
- Field-packet consistency findings to resolve before submission: owner/legal should review older legal-policy creator-surface wording against current `Platform` terminology, confirm Firebase/RevenueCat/Google Play collection state for Data Safety, confirm the Ads answer before saving "No ads", approve account-deletion SLA/support owner, and recapture direct Support route proof during the next route smoke.
- Public URL proof for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Moderation Policy, Community Guidelines, and Creator Rules lives at `/tmp/chillywood-google-play-acceptance-closeout-20260530/public-url-check.tsv` and returned HTTP 200 after redirects.
- Android proof for Settings Legal and Support, Privacy, Terms, Account Deletion, Copyright Report, and Moderation Policy lives at `/tmp/chillywood-google-play-acceptance-closeout-20260530/android/`. The direct Support deep link did not resolve during this proof, so use the May 29 release proof folder as the current visual Support route reference unless a later route smoke recaptures Support.
- The remaining P0 is still external Play/Data Safety/account-deletion/legal acceptance. Do not reduce P0 to 0 until Play Console entries are accepted and legal/owner approval exists.
- Standalone Player playback regression/menu polish is closed for the normal title Player runtime path. The Android root cause was native video/tap-layer ownership: video loaded, but the standalone center tap path did not reliably own Android taps. The Player now routes native video touches through an overlay gesture target and keeps real controls above it. The later playback-control simplification removed the black standalone Playback sheet entirely: no visible `Playback`, `Speed and quality`, `Quality`, Auto-quality row, or tune/settings icon remains on the normal title Player. Quality stays automatic/internal, while the compact `1x` chip cycles speed directly without opening a panel. Watch-Party Live remains top-right where eligible. Current proof lives at `/tmp/chillywood-player-playback-control-20260530/`; earlier playback-to-`0:03` proof remains at `/tmp/chillywood-standalone-player-playback-menu-fix-20260529/`.
- Chi'llywood is safe for continued controlled Android testing with live money off and honest scope.
- Chi'llywood is not ready for broad public launch.
- No new P0 app-code/security failure was found by the audit.
- The remaining P0 is external Play/Data Safety/account-deletion/legal acceptance, not a repo code blocker.
- Current release Android build/install/open proof is now captured: release APK/AAB built, release APK installed on `R5CR120QCBF`, and the app opened past splash into Home.
- Fresh route proof exists for Home, Explore, Live, Library, Profile, public Platform, Platform Studio, Player, Money Center, Admin, Watch-Party, Live Watch-Party, Spectator unavailable state, Settings/Profile Appearance, Support, Account Deletion, Copyright Report, Moderation Policy, Privacy, and Terms.
- The map records 10 P1 blockers and 10 P2 deferrals after the malware-scanning production deployment closeout. Scanner implementation, linked-Supabase runtime proof, production worker deployment, and Admin scan-result review are closed.
- Proof lives at `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/`.
- Full validation passed and is logged at `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/full-validation.log`.
- Store/legal/account-deletion ops proof lives at `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/`.
- Admin Users/Usage/System read-model gaps are now backend-backed where the current schema supports them. Remote-applied migrations `20260530173834`, `20260530174810`, and `20260530180452` add permission-gated RPCs for broader Users account/Premium/report/block/profile-media/deletion-request signals, recent Usage rows, and System history over immutable audit/event tables. System history now includes real provider readiness audit and Stripe provider webhook event rows when backed; database proof returned 59 provider rows without returning provider payload values or secrets. The mobile Admin UI reads them through `_lib/adminReadModels.ts` without exposing auth secrets, raw storage paths, provider secrets, LiveKit tokens, raw room tokens, service-role keys, metadata values, provider payload values, or destructive account controls. Current Android release proof lives at `/tmp/chillywood-admin-read-model-gap-closeout-20260530/` and captures Users, Usage, and System read-model surfaces. Remaining Admin gap is release build/deploy history because no backed event table/source exists for it yet.
- Public legal URLs returned HTTP 200 after redirects for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Community Guidelines, Creator Rules, Moderation Policy, and Premium Terms.
- Cloudflare MX, SPF, and DMARC baseline are present for `chillywoodstream.com`; DKIM remains unverified until a real outbound provider issues/publishes selector records and test delivery is proved.
- Malware scanning is now implemented, runtime-proved, production-deployed, and Admin-reviewable: new media scan metadata, `media_scan_jobs`, service-role scan RPCs, upload/update triggers, public-safe rendering gates, a ClamAV worker, Hetzner compose/deploy scaffold, sanitized Admin scan read model, and Admin System > Malware Scanner panel are in place. Proof at `/tmp/chillywood-malware-scanner-runtime-proof-20260530/` scanned temporary private `dmca-evidence` objects against linked Supabase. Production proof at `/tmp/chillywood-malware-scanner-production-proof-20260530/` shows `chillywood-prod-01` running the healthy scanner service, benign proof media read back `clean`, EICAR read back `malware_detected`, Admin read model returned both statuses without raw storage paths/secrets, and all proof objects/jobs were cleaned.
- Support/moderation/account deletion roles and SLA targets are mapped, but staffing and final operating acceptance remain external.
- Profile media manual proof is partially closed on one Android device: avatar/background picker return and save/update were proved with safe app-owned assets, the current APK was rebuilt/installed, and Profile Background now visibly covers the full Profile page. Remove/fallback, non-owner/signed-out, and backend `user_removed` read-back remain the next proof items.
- Blocker 8 moderation/legal ops is repo-side closed as an app-code/schema blocker: general safety reports, admin status/action RPCs, immutable report audit rows, DMCA tooling, Profile media report actions, and Profile media hide/remove/restore/masking are backed. Remaining Blocker 8 work is external operations and optional disposable-fixture visual proof, logged at `/tmp/chillywood-blocker8-moderation-legal-closeout-20260529/`.

External lane scope:

- Finish Play Console listing/content rating/Data Safety/account-deletion acceptance using the field-by-field `docs/google-play/` package.
- Use the fresh current-HEAD build proof as current artifact evidence, then produce/confirm a Play-upload-signed AAB before Play upload. The May 30 Firebase Test Lab smoke proof can be used as supporting evidence, but it is not Play Console acceptance.
- Use `docs/android/FIREBASE_TEST_LAB_RUNBOOK.md` for future small Robo smoke runs and only expand to physical Test Lab devices after owner quota/cost approval.
- Get attorney/legal approval for Terms, Privacy, DMCA/copyright, support, account deletion, moderation, Premium terms, and data safety claims.
- Confirm support/account-deletion operational ownership, inbox routing, response SLA, restore-window support, and permanent purge/de-identification workflow after `delete_after`.
- Confirm the human moderation/support owner and operational playbook for general reports, profile-media reports, DMCA, appeals, account restore help, and permanent account deletion processing.
- Select and verify outbound email provider/DKIM if automated support/legal receipts will be claimed.
- Keep monitoring the production scanner service as part of normal ops. The scanner blocker itself is closed; future scanner work should be alert thresholds/SLO polish or signed-delivery hardening, not foundation.
- Keep live money off and do not fake Premium, payouts, ads, earnings, or provider readiness.
- Do not add new product features while closing this blocker.

Next engineering lane if external Play/legal work is being handled manually:

- Release Diagnostics And Signed-Out/Signed-In Route Smoke Closeout.
- Firebase Test Lab Signed-In Route Instrumentation Proof, only after safe test credentials are provided outside committed files.
- Then close Profile media remove/fallback plus viewer/signed-out public masking, second-account/blocked/private fixtures, Watch-Party two-device proof on unlocked/stable devices, Spectator live-compatible fixture, RevenueCat/Google signed sandbox proof, and release build/deploy history only if a real event source is added.

## Previous Recommended Lane: Profile Media Runtime Save/Read-Back Proof

Closed truth:

- Bottom navigation is Home / Explore / Live / Library.
- Profile is not duplicated in the bottom nav. The `(tabs)/profile` compatibility file remains hidden from the tab bar with `href: null`.
- Profile remains accessible from top avatar/profile entry points on Home, Explore, Live, and Library, direct `/profile/[userId]` routes, Settings, and Profile actions.
- Explore owns public people discovery; Profile remains the current user's identity/feed surface, not a global user-search surface.
- Explore search now has debounced typeahead with All / Content / People / Platforms / Originals / Live / Events scopes. Typeahead suggestions start after two characters, are grouped by backed scope, and use only titles, public creator videos, public People results, public Platform discovery rows, Rachi public-safe Originals, Live Now rows/events, and public event summaries.
- People search is backed by remote-applied `search_public_people` hardening through `202605290003_public_people_search_operator_proof_hardening.sql`, which searches username/display name/public Platform name only, blocks email-shaped queries, respects profile privacy and block policy, masks non-active avatar media, excludes owner/operator/moderator/security/support/system/proof/service accounts and proof/operator display markers, and returns only public-safe fields.
- Public People results may show `View Profile` and `View Platform` when a public Platform is backed. They do not show email, phone, private identifiers, staff role, admin/owner/security metadata, fake stats, fake followers, fake uploads, or fake activity.
- Rachi may appear in Explore People only as the explicit public official result with `Rachi` and `Official Chi'llywood`, plus View Profile/View Platform. Rachi is not shown as admin, bot, or private-chat monitor.
- Owner/Admin email lookup remains in Admin/staff tooling only. No public Explore email search or normal-user email lookup was added.
- Admin Command Center now has a permission-gated `Search Admin` typeahead over already-loaded Admin sources: staff/user roles, reports, DMCA, Money Audit events, kill switches, provider readiness, Rachi posts/Originals, Live Cost Guard/Live Ops, legal requests, and immutable audit rows. Admin email lookup is Admin-only and result rows mask email identity.
- Admin Search query-level audit writing is now implemented through remote-applied migration `202605290004_admin_search_query_audit.sql`, `_lib/adminSearchAudit.ts`, and the Admin Search audit receipt UI. It writes `admin_search_query`, `admin_search_email_lookup`, `admin_search_denied`, and `admin_search_result_opened` events into immutable Admin audit logs with masked query preview, query type, scope, result count, status, and no raw email/plain query storage in metadata.
- Owner/Admin main tabs are audited in `docs/ADMIN_MAIN_TABS_UI_UX_AUDIT.md`. Current visible tabs remain route-safe and permission-gated, while the intended future model is Overview / Money Center / Users / Reports / Live Ops / Rachi / Legal / System / Owner Security.
- Admin Search is modernized with ranked results, result-type count chips, and session-local recent searches that skip email-shaped or secret-like queries and are not persisted.
- Owner/Admin visible IA is now consolidated to Overview / Money Center / Users / Reports / Live Ops / Rachi / Legal / System / Owner Security while legacy specialized state keys remain routable behind those groups.
- Users staff-roster rows are backed and clickable into masked admin-safe detail sheets; the broader Users RPC now adds account, Premium, report, block, Profile media, deletion-request, and public-content count signals without destructive actions.
- Usage summaries open inspect-only drilldowns over the current admin usage read model; the new Usage detail RPC adds recent usage/provider/room/media metadata rows while still creating no billing, payout, invoice, ad, Premium, provider-bill, live-money, or creator-earnings truth.
- System cards open inspect-only detail sheets with source/status/no-secret boundaries; the new System history RPC adds immutable audit/event rows where backed, including provider readiness/webhook evidence. Release build/deploy history remains unclaimed until a real event source exists.
- Current Admin IA/drilldown proof lives at `/tmp/chillywood-admin-denial-ia-drilldown-proof-20260529/` and captures consolidated tabs, Users rows, masked user detail, Usage/System drilldowns, and an Admin Search audit-written receipt.
- Normal-user Admin Search API/RLS denial proof passed with the configured non-staff proof account: no active platform role rows, denied Admin Search audit RPC response with masked email-shaped query, zero visible Admin audit rows, and no public email result fields. Android runtime denial for the new panel remains unclaimed because the attached app session was owner/admin and there was no safe account-switch/restore path in this lane.
- New guard coverage includes `npm run guard:public-user-search-policy` for public typeahead and `npm run guard:admin-search-policy` for owner/admin search boundaries.
- Android proof for the Explore People search safety pass lives at `/tmp/chillywood-explore-people-search-proof-20260529/`.
- Android proof for the Explore Typeahead/Admin Search pass lives at `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/`.
- Admin Search audit/denial/profile/spectator closeout proof lives at `/tmp/chillywood-admin-search-audit-denial-spectator-profile-proof-20260529/`.
- Owner/Admin tabs/search modernization proof lives at `/tmp/chillywood-admin-main-tabs-ui-ux-audit-proof-20260529/`.
- Home Top Picks, Browse, and Favorites sections are removed because Explore owns browse/discovery jobs and Library owns saved/favorites jobs. The cleanup also removed catalog-style followed-Platform/latest-public-upload Home sections so Home stays focused on launch/feed content rather than duplicating bottom-tab work.
- Home no longer promotes a programmed/latest title into a giant Home hero. The `Chicago Streets` issue came from a fallback chain that used a latest/programmed title when no Continue Watching row existed.
- Home keeps a cinematic hero. When real playback progress exists, that hero becomes `Continue Watching`; when no eligible progress exists, Home shows a neutral branded Chi'llywood hero rather than a random title.
- Continue Watching hero eligibility requires at least 10 seconds of real progress, progress below the 94% completed threshold when duration is known, and an available title row that is not unpublished/draft/scheduled/archived/deleted/private/restricted/paid. Home sorts eligible rows by the merged watch-progress last-watched timestamp and shows only the latest one.
- Saved/favorite/history content belongs to Library, browse/discovery content belongs to Explore, and Home keeps only backed or honest-empty feed sections: cinematic branded/Continue Watching hero, Live Now, Rachi Official Updates, Chi'llywood Originals, From Your Chi'lly Circle, Upcoming Events, and the existing ad slot. No fake Home replacement rows were added.
- Android proof for the Home Continue Watching cleanup lives at `/tmp/chillywood-home-continue-watching-proof-20260529/`; it captures Home with cinematic branded hero and no giant `Chicago Streets` title hero, Explore reachable, Library showing `Chicago Streets` as saved with `0` Continue Watching, Player opening the title from Library, and Rachi/Originals still visible on Home.
- Normal main tabs now show top Profile/avatar and Settings access. Detail, room, Profile, Platform, Platform Studio, Admin, and Player surfaces keep their route-local controls instead of duplicate global controls.
- Rachi Official Updates show Rachi avatar or official fallback, `Rachi`, `Official Chi'llywood`, and backed timestamp text. Public Rachi Originals cards keep real backed rows but no longer expose internal proof/fixture wording in normal Home copy.
- Profile feed empty state is cleaned up: owners see `No posts yet` with a `Create Post` action that focuses the composer; viewers see `No public posts yet`; the old `Your feed is ready when you are` card and random feed-level Platform CTA are gone.
- Android proof for this cleanup lives at `/tmp/chillywood-home-profile-cleanup-proof-20260529/`.
- Profile Photo first-sheet UX is corrected and Android-proved on `R5CR120QCBF`: owner avatar tap/long-press opens a compact `Profile Photo` bottom action sheet with `Change Photo`, conditional `Remove Photo` only when a real photo exists, and `Cancel`.
- The Profile Photo first sheet no longer shows a preview card, disabled `View Photo`, disabled `Remove Photo`, crop explanation copy, or a disabled save action before an image is selected.
- Profile Photo no longer uses the broken native Android crop UI. The app opens the backed phone gallery path through `expo-image-picker` with editing disabled, then shows an in-app review sheet with a real preview and Fill/Fit/Center choices before saving. Custom drag/pinch repositioning remains a future enhancement unless it is actually built and proved.
- Profile Background remains separate and Android-proved. Its first sheet is compact, the save path uses the same in-app review sheet, and the saved background now renders behind the full Profile page rather than only the top cover/header.
- Live Hub is already modernized and was not redesigned in the burn-down lane.
- Explore now uses backed title search, public discovery feed rows, public creator videos, Rachi public-safe Originals, and public event summaries. Visible sections are backed or honest empty states: Search, Live Now, Platforms, Creator Videos, Chi'llywood Originals, Events, Replays, and Titles.
- Library now uses backed saved titles, watch progress, and followed Platform profile read-back. Replays, events, and clips remain hidden until saved rows exist.
- Player now has scoped surface modes for title, creator video, Spectator child playback, Watch-Party Live shared Player, and Live Watch-Party stage context. Audio Mix remains Watch-Party Live shared Player-only.
- Watch-Party waiting room now has a UI-only host preflight for real title-linked Watch-Party Live entries; room creation, Premium gates, LiveKit token behavior, route ownership, Party Room, and old-room handling are unchanged.
- Android proof on `R5CR120QCBF` lives at `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/`.
- Valid proof files are `04-explore-current.*`, `05-library-backed-sections.*`, `06-player-normal-mode.*`, `09-host-preflight-details.*`, `10-home-bottom-nav-top-avatar.*`, and `11-top-avatar-profile-route.*`.
- Profile Photo picker correction proof lives at `/tmp/chillywood-profile-photo-picker-proof-20260529/` with owner Profile, tap sheet, long-press sheet, DocumentsUI focus proof, Settings Profile Appearance, and Profile Background sheet captures.
- Current Profile proof for the latest media/background fix lives at `/tmp/chillywood-profile-brand-media-one-device-proof-20260531/` and captures safe image staging, current APK install/open, Settings/Profile Appearance, avatar/background save/update behavior from the device flow, and a full-page Profile background screenshot. Remove/fallback, viewer/signed-out, and `user_removed` backend read-back remain unclaimed.
- `01`/`02` proof captures in that folder are stale-bundle/dev-menu misses and are not claimed.
- No fake Explore rows, fake Library rows, fake live rooms, fake replays, fake events, fake creator activity, fake Rachi content, fake money, LiveKit issuer change, Watch-Party route ownership change, Premium gate change, Party Room change, or backend schema change was made.

Remaining limitations:

- Profile avatar/background save proof is partially closed on the owner device, but remove/fallback, viewer/signed-out masking, and backend `user_removed` read-back still need a focused proof pass.
- Spectator remaining proof is not newly closed. No safe Live Watch-Party / Reaction fixture was available in the latest closeout lane; previous Watch-Party Live and replay child-room proof remains current.
- Watch-Party Live true two-device speech-triggered ducking is not closed. `adb devices -l` showed only `R5CR120QCBF`, with no second device/emulator/account available.
- Player component extraction remains a future cleanup; this pass added safe mode labeling/resolution without a full rewrite.
- Route/deeplink cleanup remains mostly documented rather than rewritten to avoid route-owner drift.
- Profile media safe-asset save/read-back is partly closed; remove/fallback and viewer/signed-out masking remain open.
- Explore People search runtime proof uses the explicit public Rachi official account. Capture a separate normal public user/creator result only when a safe public fixture exists; do not fake one.
- Admin Search audit writing is closed for query/result-open events. Future Admin proof can add richer reason-required audit policy per sensitive scope only if product/security policy requires it.

Recommended next lane:

- Profile Media Runtime Closeout with one safe app-owned/non-private gallery asset, an attached Android device, a signed-in owner account, viewer/signed-out checks, in-app review-sheet screenshots, backend active/user_removed read-back, removal/fallback proof, and public masking proof.
- Admin external system-history follow-up only if Play/provider/build/deploy dashboards need their own backed event source. Do not fake external dashboard rows.
- Normal-user Android Admin denial recapture with a safe normal-user session and a reliable owner-session restore path.
- Spectator Live Watch-Party / Reaction Fixture Closeout with a real public-safe live-stage-compatible fixture and no original token/host/member leakage.
- Watch-Party Live Two-Device Audio Ducking Closeout with two joined devices/accounts proving remote speech ducks/restores local video while Party Room and Live Watch-Party still have no Audio Mix.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.

## Shared Player Fullscreen Rails Follow-Up

Current next proof target: publish and visually prove the exact-component Shared Player fullscreen rails fix on `R5CR120QCBF`.

Verify:

- regular portrait shared player still shows the working LiveKit bubble/avatar behavior
- fullscreen left rail has compact room comments with `Comment` placeholder and compact Send chip
- fullscreen center video remains large
- fullscreen right rail uses the same `renderWatchPartyBubbleGridSurface` / `LiveKitStageMediaSurface` path as portrait
- fullscreen right rail does not show `Shared Player` fallback card/text
- touch play/pause and fullscreen exit still work

Proof path:

`/tmp/chillywood-shared-player-rails-exact-component-proof-20260605/`

## Previous Recommended Lane: RevenueCat / Google Play Webhook Secret Linking And Signed Sandbox Proof

Money Center, Owner/Admin Money Center consolidation, the Money Audit Explorer drilldowns, and the Stripe CLI signed sandbox webhook proof are Android-proved. The next useful lane is only RevenueCat/Google Play server credential and webhook-secret linking, followed by safe signed-provider sandbox event proof if the provider tooling is available without exposing secrets.

Closed truth:

- Platform Studio has one creator-facing `Monetization` tab and `Money Center` page title.
- Creator Money Center now has clickable money event rows and a sanitized `Money Event Detail` sheet for creator-owned/source-safe setup, sandbox, readiness, ledger, provider, and switch events.
- Creator details show source label, status, environment, provider/capability label, timestamp where available, idempotency proof label, reason, next step, and explicit `Not payable`; they do not show raw provider payloads, service-role values, provider secrets, other-user ids, or admin-only notes.
- Owner/Admin Money Center now has `Money Audit Explorer` with filters for All, Production, Sandbox, Setup, Blocked, Kill Switches, Provider Readiness, Ledger, Revenue Imports, Payouts, Sponsors / Ads, Fraud & Risk, Webhooks, Digital Sales, and Merch.
- Admin event detail shows safe source table/event/actor/target/provider/capability/environment/idempotency/reason/timestamps/metadata and is inspect-only: no payout approval, revenue import, checkout activation, sandbox-to-production promotion, or balance creation.
- Shared helper `_lib/moneyAuditEvents.ts` reads safe source rows where RLS allows and otherwise builds source-labeled rollup/detail events from existing Money Center read models.
- Sandbox/test rows are labeled `Sandbox only` and `Not payable`, are not mixed into production payable balances, and do not expose withdraw/cash-out.
- Old `/monetize`, `/revenue`, and `/payouts` routes plus old tab/focus params map into Money Center section anchors.
- Admin Command Center now has one visible `Money Center` tab for money controls; separate Premium, Kill Switches, Ads, Revenue, Payouts, Sponsors, and Fraud top-level money tabs are consolidated.
- Old Admin params map into the new Admin Money Center sections: Premium / RevenueCat / Google Play, Kill Switches, Sponsors / Ads, Fraud & Risk, Creator Balance / Ledger, and Payouts / Stripe Connect.
- Owner/Admin Money Center sections are Overview, Kill Switches, Premium / RevenueCat / Google Play, Sponsors / Ads, Fraud & Risk, Digital Sales, Tips / Watch-Party Seats / Paid Content, Merch, Creator Balance / Ledger, Payouts / Stripe Connect, Provider Webhooks, Tax & Legal, Audit Trail, and Technical Checks.
- Kill Switches are grouped into Global Money, Digital Purchases, Physical / Merch, Payouts, Sponsors / Ads, and Fraud / Risk. `revenuecat_google_play_enabled` is now high-risk and reason-confirmed.
- Migration `202605270001_platform_money_kill_switches.sql` adds `platform_money_kill_switches`, `platform_money_kill_switch_audit`, sanitized creator summary RPC, owner/admin list/audit/write RPCs, and backend `assert_money_feature_allowed()`.
- Migration `202605270001_platform_money_kill_switches.sql` is applied and aligned in the linked Supabase environment; `supabase db push --dry-run` reports the remote database up to date.
- Defaults keep live money off: digital sales, tips, Watch-Party seats, paid content, merch, payouts, revenue imports, tax/KYC, ad revenue, sponsorships, and `live_money_enabled` are `off`.
- Store/Stripe/webhook readiness switches are `sandbox_only` by default, allowing proof without production money.
- Admin Money Center uses the same backend Money switch RPCs and provider readiness helper as creator Money Center.
- Creator Money Center reads sanitized switch states plus provider readiness and does not show live-active claims unless both provider proof and switch state allow them.
- Google Play/RevenueCat handles Android digital purchases; Stripe Connect handles creator payout setup/readiness only; merch is physical goods and separate.
- Creator Balance remains ledger-first and shows no verified earnings until real ledger rows exist.
- No checkout, tip, paid content sale, Watch-Party seat sale, merch sale, payout, withdrawal, transfer, fake tax/KYC, fake Premium grant, provider secret, or live-money movement was added.
- Previous Android `R5CR120QCBF` proof at `/tmp/chillywood-money-center-android-refresh-proof-20260527/` captures the refreshed creator Money Center plus the pre-consolidation Owner/Admin Money Controls.
- Owner/Admin Money Center consolidation proof on `R5CR120QCBF` lives at `/tmp/chillywood-admin-money-center-proof-20260527/`. The proof used `./gradlew assembleRelease`, installed the release APK over the existing owner session with `adb install -r -d`, opened `chillywoodmobile://admin?tab=money-center`, captured the Admin tab row with one visible Money Center tab, first view, expanded Admin Money Center sections, grouped kill switches, the high-risk Live money reason sheet opened and cancelled, audit/technical checks, and creator Money Center disabled/setup states.
- Money Audit Explorer Android proof on `R5CR120QCBF` lives at `/tmp/chillywood-money-audit-explorer-proof-20260527/`. The proof used a current release APK installed over the existing owner session, opened creator/admin deep links, and captured creator event rows/detail, creator balance detail with no verified earnings/not payable, Provider Status readiness, Owner/Admin Money Audit Explorer metrics and Sandbox/Setup filters, sandbox row detail, kill-switch event detail, sponsor/fraud drilldown surfaces, no secret exposure, no fake money, and no withdrawal/cash-out action.
- Provider CLI proof on `R5CR120QCBF` lives at `/tmp/chillywood-provider-cli-proof-20260527/`. Stripe CLI fired a test-mode `payment_intent.succeeded` event, resent the same event to the enabled Chi'llywood Connect test webhook endpoint, and finished with `livemode=false` plus `pending_webhooks=0`. Owner/Admin Money Audit Explorer shows the source row as `Sandbox only`, `Not payable`, `ignored`, provider `stripe_connect`, provider environment `test`, `livemode=false`, event type `payment_intent.succeeded`, and duplicate-safe/idempotency labeled.
- Supabase names-only secret inventory still has Stripe webhook secrets configured but no `REVENUECAT_WEBHOOK_SECRET` or `GOOGLE_PLAY_WEBHOOK_SECRET`; no official RevenueCat CLI is installed locally; Google CLI confirmed Android Publisher/PubSub APIs are enabled but no Pub/Sub topics exist, and direct Android Publisher subscription reads returned `403` for both the active user and the local Google Play service account. RevenueCat/Google signed webhook proof is therefore an external provider-permission/secret-linking gap, not a Money Center UI gap.
- Backend proof through the available signed-in proof account returned sanitized creator switch rows, kept `live_money_enabled=off` and `payouts_enabled=off`, denied direct table updates with `42501`, denied switch writes with `money_kill_switch_admin_required`, and performed no toggle.
- Repo-side static proof passed for `npm run typecheck`, `npm run validate:runtime`, the Money Center/provider/payment/creator/Stripe Connect/refresh/VOD/Clip/Brand/Watch-Party/old-room guard stack, Supabase migration/lint/dry-run checks, targeted grep proof, and diff whitespace checks after adding event drilldowns.

Remaining limitations:

- Stripe signed sandbox provider event firing and duplicate-safe inspection is proved. RevenueCat and Google Play signed webhook proof remains blocked by missing Supabase webhook secrets/provider permission, and should only be attempted after those credentials are intentionally linked server-side.
- No safe switch toggle was performed. Previous Android confirmation proof was opened and cancelled, and backend denial proof was read-only; a later lane can perform a harmless no-live audited state change only with explicit product-owner approval.
- RevenueCat, Google Play, Stripe Connect, and webhook production readiness remain setup/sandbox-only; do not mark any capability `active` without provider proof and explicit owner approval.

Recommended next lane:

- Link RevenueCat/Google Play webhook secrets only in server-side provider/Supabase configuration, never in client code or docs.
- Use provider-approved sandbox tooling only; never print secrets, access tokens, raw webhook payloads, service-account JSON, or webhook signing values.
- If valid RevenueCat/Google Play sandbox events can be fired, prove they appear in Owner/Admin Money Audit Explorer as `Sandbox only` and `Not payable`, prove duplicate/idempotency behavior if safely repeatable, and prove they create no available balance, entitlement rewrite, withdrawal action, checkout, or production revenue.
- If event firing is still not available, document the exact missing external action and keep the current configured/sandbox readiness proof as the boundary.
- Keep `live_money_enabled=off`, no payouts/digital sales/tips/paid content/checkout, no fake balances, and no secrets.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.
- Re-run the Money Center, provider readiness, payment rail, creator monetization, Stripe Connect, runtime, and LiveKit/old-room guard stack.

## Previous Recommended Lane: Money Audit Explorer Android Proof

- Closed on May 27, 2026 with screenshots at `/tmp/chillywood-money-audit-explorer-proof-20260527/`.

## Previous Recommended Lane: Owner/Admin Money Center Android Runtime Proof

- Closed on May 27, 2026 with screenshots at `/tmp/chillywood-admin-money-center-proof-20260527/`.

## Previous Recommended Lane: Rachi Originals Player Frame And Avatar Safe-Asset Proof

Rachi is now implemented repo-side as the official Chi'llywood account, first pinned Chi'lly Circle connection, official update publisher, and Chi'llywood Originals source. Android proof on `R5CR120QCBF` covers public/user-facing surfaces, the upgraded owner/operator Admin Rachi tab, real Rachi Official Updates, and a real public-safe Rachi Originals video fixture in Home plus Rachi Platform. The next useful Rachi lane is only the remaining media-proof polish: capture a visible Player playback frame for the fixture and prove gallery avatar save with a safe app-owned image if one is available.

Closed truth:

- Rachi copy now frames Rachi as `Official Chi'llywood`, not as a private chat monitor or normal user.
- Rachi is pinned as the first official Chi'lly Circle connection without normal friendship/request rows.
- Rachi is excluded from Chi'lly Chat starter/helper flows and remains first in Chi'lly Circle.
- Home reads real public Rachi posts for `Rachi Official Updates`.
- Home reads real public-safe Rachi-owned creator videos for `Chi'llywood Originals`.
- Empty Rachi update/original states stay honest and do not fake posts, videos, comments, likes, followers, or engagement.
- Admin's Rachi tab has Overview, Profile Picture, Official Posts, Chi'llywood Originals, Platform Tools, and Safety & Reports sections.
- Remote-applied migration `202605260008_rachi_official_posts.sql` adds `admin_create_official_rachi_post`; it is owner/operator-only through `admin_content_assert_operator()`, writes admin audit, and posts as `platform_rachi_official`.
- Remote-applied migrations `202605260009_rachi_official_profile_image.sql` and `202605260010_rachi_official_profile_media_storage.sql` add an owner/operator-only Rachi profile-photo save RPC plus official `profile-media/official/rachi/...` storage policies.
- Admin Rachi Profile Picture uses the device photo gallery through `Choose from Gallery`; it does not ask normal operators to paste a URL.
- The upgraded proof account opened Admin Rachi, showed the gallery-based Profile Picture section, and created a real public Rachi update through the Admin UI.
- The real Rachi update appears on Rachi Profile and Home `Rachi Official Updates`.
- Remote-applied migrations `202605260011_rachi_originals_public_video_fixture.sql`, `202605260012_rachi_originals_fixture_playback_mp4.sql`, and `202605260013_rachi_originals_public_link_select_hardening.sql` add the owner/operator-managed `official_rachi_original_videos` link table and proof fixture `6e1c3405-7db8-4cb2-98f3-5a7642e82126`, `Chi'llywood Originals Proof Fixture`.
- The fixture is public, clean, proof-scoped, attributed to `Big Buck Bunny by Blender Foundation, CC BY 3.0.`, and uses direct `video/mp4` playback.
- The deployed `public-creator-video-cards` resolver reads Rachi Originals through the official link table, returns sanitized cards with `ownerId=platform_rachi_official`, and still requires published links plus public moderation-safe videos; link-table public reads also require the linked video to remain public and clean/reported.
- Home `Chi'llywood Originals` shows the real Rachi video fixture.
- Rachi public Platform shows `1 Videos` and renders the same fixture in Featured/Latest Uploads with public actions only.
- Normal users cannot post as Rachi or edit the Rachi Platform/Studio.
- Profile and public Platform preserve public-safe/draft-hidden behavior.
- No LiveKit, Watch-Party, Premium, provider readiness, creator upload/delete, or normal Chi'lly Chat behavior changed.
- `npm run guard:rachi-official-policy` pins the official-account, privacy, Circle, Home, Admin, Rachi Originals, no-surveillance, no-fake-stats, no raw public video paths, and no-Mini-Platform boundaries.
- Android proof screenshots live at `/tmp/chillywood-rachi-official-proof-20260526/`; they capture pinned Rachi in Chi'lly Circle, Rachi Profile, Rachi public Platform, owner/operator Admin Rachi tab, gallery-based Profile Picture controls, a real Admin-created Rachi post, Home `Rachi Official Updates`, and Home `Chi'llywood Originals` honest empty state. A later current-build proof should confirm Rachi no longer appears in Chi'lly Chat.
- Rachi Originals proof screenshots live at `/tmp/chillywood-rachi-originals-proof-20260526/`; they capture Home `Rachi Official Updates`, Home `Chi'llywood Originals` with the fixture, Rachi public Platform with the fixture, and Player route/title open.

Remaining limitation:

- Rachi Profile Picture actual save/clear proof still needs selecting a safe non-private gallery image; do not use arbitrary device photos that might expose private user data.
- The Player/public content route opens the fixture title, and backend resolver proof reports playable legacy source state, but a visible moving playback frame was not captured yet.

Recommended next lane:

- Verify migrations `202605260008_rachi_official_posts.sql`, `202605260009_rachi_official_profile_image.sql`, and `202605260010_rachi_official_profile_media_storage.sql` remain applied in the target proof environment.
- Verify migrations `202605260011_rachi_originals_public_video_fixture.sql`, `202605260012_rachi_originals_fixture_playback_mp4.sql`, and `202605260013_rachi_originals_public_link_select_hardening.sql` remain applied and `public-creator-video-cards` remains deployed in the target proof environment.
- Capture a visible Player playback frame for `6e1c3405-7db8-4cb2-98f3-5a7642e82126` if the current Player/render path permits it; do not fake playback.
- If product has a safe app-owned Rachi avatar asset in the device gallery, capture Admin Rachi Profile Picture selecting it from the gallery, saving it, and clearing/restoring it if needed.
- Keep screenshots outside the repo at `/tmp/chillywood-rachi-originals-proof-20260526/` or a fresh dated `/tmp` folder.
- Re-run `npm run guard:rachi-official-policy`, `npm run guard:profile-production-policy`, `npm run validate:runtime`, and targeted privacy/no-fake-stats greps.

## Previous Recommended Lane: Watch-Party Live Audio Mix Two-Device Speech Proof

Watch-Party Live now has a repo-side local audio mix pass plus single-device Android proof. A bounded two-device proof remains useful to confirm video ducking under real LiveKit speech without moving the feature into Party Room or Live Watch-Party / Live Stage.

## Previous Recommended Lane: Copyright Safety Surface Smoke Proof

Visible Rights Disclosure UI is disabled for now. A light physical `R5CR120QCBF` smoke proof remains useful to confirm copyright safety surfaces stay available without showing disclosure chips, cards, sheets, or overlays.

Closed truth:

- Profile owner top action now says `Platform` and keeps the existing public Platform preview route.
- The duplicate bottom Profile `Platform` tab/pill is removed; bottom tabs are Posts, Live, Community, About.
- Clip Studio and creator-video upload/publish show no visible Rights UI; they focus on video, cover, title, template, Save Draft, and Publish.
- Watch-Party Live waiting room, Watch-Party Live Party Room, Live Watch-Party waiting room, Live Watch-Party Live Room / Live Stage, setup/status panels, room-code panels, and Spectator pages show no visible Rights UI.
- No Rights sheet, overlay, chip, checkbox group, or note field is user-facing.
- Migration `202605260007_content_rights_disclosures.sql` and `_lib/contentRights.ts` remain dormant future audit support only.
- Copyright safety relies on Terms, Community Guidelines, Report/Copyright flow, DMCA/takedown, repeat-infringer policy, and moderation/admin removal.
- No disclosure helper grants permission, confirms licensing, bypasses DMCA/report/takedown, bypasses source eligibility, bypasses Premium, or changes LiveKit tokens/roles.
- `npm run guard:content-rights-policy` pins no visible Rights UI in the listed app surfaces, no note field, no unsafe legal copy, no duplicate Profile Platform tab, no Mini Platform copy, and no LiveKit token issuer changes.
- Previous Rights UI screenshots live outside the repo at `/tmp/chillywood-profile-rights-disclosure-proof-20260526/` and `/tmp/chillywood-rights-overlay-correction-proof-20260526/`; use only current absence-proof captures going forward.

Remaining limitation:

- Physical Android proof on `R5CR120QCBF` is still useful after a fresh build/dev-client launch.

Recommended next lane:

- Reattach/run a current Android build/dev-client on `R5CR120QCBF`.
- Capture Clip Studio/content upload with no visible Rights card/chip/sheet.
- Capture Watch-Party Live waiting room and Watch-Party Live Party Room with no visible Rights card/chip/sheet/overlay.
- Capture Live Watch-Party waiting room and Live Watch-Party Live Room / Live Stage with no visible Rights card/chip/sheet/overlay.
- Capture Spectator with no visible Rights card/chip/sheet/overlay, while Share/Report remain available where expected.
- Re-run `npm run guard:content-rights-policy`, Profile/Clip/Watch-Party guards, and targeted no-unsafe-rights-copy greps.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.

## Previous Recommended Lane: True Live-Stage Spectator Fixture Proof

Replay proof is closed with a proof-scoped safe archive fixture. The remaining Spectator proof gap is only successful Live Watch-Party / Reaction Room launch from a true live-stage-compatible public-safe source.

## Previous Recommended Lane: RevenueCat / Google Play Credential Linking And Money Center Provider Proof

Money Center is now the creator-facing monetization source of truth in Platform Studio. The next money lane should prove the provider boundary that Money Center is honestly waiting on, without activating live money.

Closed truth:

- Platform Studio has one creator-facing `Monetization` tab with `Money Center` as the page title/source of truth.
- Money Center sections are Overview, Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Payouts, Tax & Legal, Provider Status, Future Tools, and owner/dev-only Technical checks.
- Old `/monetize`, `/revenue`, and `/payouts` routes redirect into Money Center; old `tab=monetize|revenue|payouts` and `focus=premium|stripe|store|commerce` params map to Money Center sections.
- Google Play/RevenueCat is the Android digital purchase readiness path.
- Stripe Connect is creator payout setup/readiness only and is not used to charge Android users for in-app digital access.
- Merch is physical goods and stays separate from digital app unlocks.
- Creator Balance is ledger-first and shows no verified earnings until real ledger rows exist.
- Payouts stay locked; no withdrawal, cash-out, transfer, payout release, checkout, or fake balance is available.
- Provider Status reads sanitized `provider_readiness_status` summaries; owner/dev Technical checks show no secret values.
- `npm run guard:money-center-policy` pins the Money Center sections, route mappings, no duplicate creator-facing money tabs, no fake money, no Android digital Stripe checkout, no secrets, and no user-facing `Mini Platform`.
- Android `R5CR120QCBF` proof lives outside the repo at `/tmp/chillywood-money-center-proof-20260526-r5/`; it captures the consolidated tab row, Money Center first view, Overview, Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Payouts, Tax & Legal, Provider Status, Future Tools, and owner/dev Technical checks.

Remaining limitations:

- RevenueCat and Google Play server/webhook secrets remain the real provider blockers. Do not mark them active without valid sandbox events and webhook proof.
- Stripe Connect production payout readiness, KYC/tax completion, owner approval, payout execution, and live-money flags remain blocked.
- Paid content, tips, Watch-Party seats, merch checkout, sponsorships, ads, and revenue imports remain planned/readiness-only.

Recommended next lane:

- Link RevenueCat and Google Play server/webhook credentials by secret name only, never values.
- Prove valid and invalid webhook handling, idempotency, setup-required/blocked states, and sandbox events without granting fake Premium or live money.
- Update provider readiness rows only to the exact proved status; `active` remains blocked until production proof exists.
- Capture Money Center Provider Status after provider proof and keep screenshots outside the repo.
- Keep `artifacts/` and `supabase/.temp/` untouched.

## Previous Completed Lane: Spectator Replay Fixture Proof Closeout

The Spectator child-room relay is now runtime-proved on Android for the content/player Watch-Party Live launch path and for replay archive Watch-Party Live launch using proof-scoped fixtures. The remaining Spectator proof lane should focus only on true live-stage coverage without faking live status.

Closed truth:

- Spectator is a public-safe watch-only surface, not participant entry into the original room.
- Eligible content/player sources show `Start Watch-Party Live`; eligible live-stage sources show `Start Live Watch-Party` and `Start Reaction Room`.
- `Watch with your Chi’lly Circle`, Share, View Platform, and Report are wired on the Spectator page.
- Signed-out users are handed to login before room creation.
- Ineligible sources show explicit copy such as `Source live has ended` or `This live can’t be used for a watch party`.
- `spectator-start-room` is the server authority. It verifies public-safe source state, creator flags, block/private/Premium/ticket/subscription gates, runtime controls, public-safe playback record, backing broadcast-session approval, and rate limits before creating any child room.
- Child rooms use `watch_party_rooms.source_type = 'spectator_playback'` and safe linkage in `spectator_child_room_sources` with `root_source_id` to avoid nested source chains.
- Watch-Party Live child rooms route to `/watch-party/[partyId]` and open the shared Player with `source=spectator-playback`.
- Live Watch-Party reaction rooms route to `/watch-party/live-stage/[partyId]` and show source attribution while preserving separate child room people/comments/live controls.
- Original LiveKit tokens, publish permissions, host controls, speaker credentials, member lists, raw playback storage paths, and raw private HLS paths are not returned or stored in child room source metadata.
- Existing LiveKit token issuance, old-room handling, Premium gate helpers, Watch-Party Live route ownership, and Live Watch-Party route ownership are intentionally unchanged.
- Remote migration `202605260003_spectator_child_room_source_links.sql` is now applied after the RLS policy was hardened for mixed text/UUID room ids.
- `spectator-start-room` is deployed with `verify_jwt = false`, performs its own user authentication, and returns clean `sign_in_required` and `source_not_found` denials without child ids or token fields.
- Proof migration `202605260004_spectator_child_room_safe_fixtures.sql` creates proof-scoped eligible, ended, reuse-disabled, private, and blocked Spectator fixtures.
- Proof migration `202605260005_spectator_anon_public_safe_read.sql` lets signed-out Spectator read only explicitly public-free, clean, public-safe spectator rows; room creation still requires authenticated server verification.
- Proof migration `202605260006_spectator_replay_archive_fixture.sql` creates the safe replay archive fixture with `source_is_live=false`, `replay_available_later`, and replay watch-party reuse allowed.
- `spectator-playback` now returns HTTPS controlled resolver URLs in deployed Edge Function contexts, preserving the mobile resolver guard without exposing raw playback paths.
- Android `R5CR120QCBF` proves eligible Watch-Party Live child creation from Spectator: the eligible fixture renders playback, `Start Watch-Party Live` creates child room `5SR4TQ`, `/watch-party/[partyId]` shows safe source attribution, and original host controls/member lists are not visible.
- Android `R5CR120QCBF` also proves replay archive child creation: replay source `9c5f5655-1fbb-4ac8-9473-a5a8d73f3a19` created child room `NSHU7J`, source attribution rendered, the shared Player loaded source/duration, and a visible playback frame was captured after tapping play.
- Android signed-out proof from the eligible fixture shows login handoff with no room creation.
- Android private/source-ended/reuse-disabled states and backend private/blocked/ended/reuse-disabled denials are proved without child ids or token fields.
- Screenshots live outside the repo at `/tmp/chillywood-spectator-child-room-proof-20260526/`.
- Replay closeout screenshots live outside the repo at `/tmp/chillywood-spectator-live-stage-replay-proof-20260526/`.

Remaining limitations:

- Successful Live Watch-Party / Reaction Room launch from Spectator still needs a true live-stage-compatible public-safe source. Do not reuse a VOD fixture and call it live.
- Production replay launches still depend on real replay archive availability and the same public-safe resolver checks; the closed proof is fixture-scoped.
- Cost guard is a simple server-side actor/source rate limit; richer cost review can build on the audit/link tables later.
- UiAutomator can see the launcher after shade cleanup, but still returns `null root node` while the React Native app is foregrounded; screenshot proof currently uses `screencap`.

Recommended next lane:

- Create or locate a real public-safe live-stage-compatible source for `Start Live Watch-Party` / `Start Reaction Room`.
- On `R5CR120QCBF`, capture screenshots for the live-stage eligible Spectator CTA, resulting child Live Watch-Party room, source attribution, no original controls/member list, no original token exposure, and child-room speaker/publish rules.
- Re-run the targeted token/private-source greps and the new `npm run guard:spectator-child-room-policy` after any proof-only fixes.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.

## Closed Lane: Channel Subscriptions V1 Sandbox Purchase

Channel Subscriptions V1 purchase proof is closed. The current remaining subscription gap is fresh provider lifecycle delivery after the lifecycle handler deployment; do not manually rewrite old ignored events or mutate Supabase rows to fake cancellation, expiration, refund, or revoke.

Current truth is summarized at the top of this file and in `docs/CHANNEL_SUBSCRIPTIONS_V1_END_TO_END_PROOF.md` plus `docs/CREATOR_MONETIZATION_SANDBOX_CLOSEOUT_AUDIT.md`.

## Previous Recommended Lane: Profile Media Runtime Proof And Blocked/Private Fixtures

The Profile Avatar Background and User Actions Sheet lane is implemented repo-side, migration `202605260001_profile_appearance_media.sql` is applied remotely, and the owner-controlled media-status follow-up is implemented repo-side in `202605260002_profile_media_status_policy.sql`. The next lane should runtime-prove the new media/actions flows on a current Android dev-client or AAB that includes the native `expo-image-picker` module, plus safe second-account and blocked/private fixtures.

Closed repo-side truth:

- Owner tap and long-press on their Profile avatar opens `Edit Profile Photo`; viewers tap or long-press another avatar to open `Profile Actions`.
- Profile Settings has a compact `Profile Appearance` section with `Profile Photo`, `Profile Background`, and `Preview Profile`.
- Profile photo/background upload uses the phone photo gallery through `expo-image-picker`, avoids the broken native Android cropper, supports safe fit level through an in-app review sheet with Fill/Fit/Center, validates JPG/PNG/WebP and size limits, and writes only the signed-in user's Profile fields.
- Profile background is personal Profile appearance only. Platform hero/background/logo and Brand Studio assets remain separate.
- Viewer `Profile Actions` offers View Profile Photo, Chi'lly Chat, View Platform, Block User, Report User, and Share Profile where backed.
- Block User requires sign-in and confirmation, refuses owner/self block, writes through the existing viewer-owned `channel_audience_blocks` helper path, refreshes relationship state, and blocked Chi'lly Chat entry refuses direct-thread creation.
- Report uses the existing safety report sheet, Share uses the public-safe Profile link, and View Platform opens public Platform rather than Studio.
- Locked/blocked/private shells do not render private Profile avatar/background images, and sheets never render raw storage paths.
- Profile photo/background uploads are owner-controlled and publish immediately after safe validation. No default manual approval or `pending_review` state was added.
- Profile media now has lightweight statuses: `active`, `user_removed`, `flagged`, and `admin_removed`. Public Profile RPC rendering masks avatar/background URLs unless the corresponding status is `active`.
- Profile Photo and Profile Background can be reported from viewer Profile Actions when visible. Reports use target type `profile_media` with `profileMediaKind` context and no raw URL/storage path.
- Admin report target actions are backed for reported Profile media: hide maps to `flagged`, remove maps to `admin_removed`, and restore maps to `active` without deleting storage evidence.
- Generic profile saves do not write media status, so stale local profile cache cannot undo flagged/admin-removed status.
- `supabase migration list` shows local and remote aligned for `202605260001`; a prior post-apply dry-run reported the remote database up to date, while final dry-run/lint reruns hit the known intermittent `cli_login_postgres` SASL/circuit-breaker auth failure.
- `npm run typecheck`, `npm run validate:runtime`, and the requested Profile/payment/creator/Clip/Brand/Watch-Party/provider guard stack pass after the implementation.
- Android `R5CR120QCBF` startup proof after lazy image-picker loading lives outside the repo at `/tmp/chillywood-profile-avatar-actions-proof-20260526/`.

Remaining limitations:

- Android visual proof for avatar edit, settings Profile Appearance, background upload/remove, viewer Profile Actions, block confirmation, signed-out block/chat handoff, and viewer no-edit state still needs a current runtime pass. The old installed dev-client previously crashed on missing native `ExponentImagePicker`; the repo now lazy-loads the picker so the app boots, but choosing images still requires a rebuilt/current native client if the installed build predates the module.
- `202605260002_profile_media_status_policy.sql` is applied remotely and linted clean. The policy intentionally does not create a manual approval queue.
- There is still no advanced profile-media moderation UI/queue beyond the backed `profile_media` report target and admin hide/remove/restore actions. Add richer media moderation review/cleanup automation later if product needs it.
- Full second-account and blocked/private fixture proof still needs safe test accounts. Do not fake it.

Recommended next lane:

- Rebuild/install a current Android dev-client or AAB if the attached build still lacks the native image-picker module, then prove owner avatar edit, long-press, remove/fallback, Settings Profile Appearance, background upload/remove/readability overlay, viewer Profile Actions, Block User confirmation, Report/Share/Chat routes, signed-out block/chat handoffs, and no viewer/signed-out edit controls on `R5CR120QCBF`.
- Reuse or create safe owner, second-account viewer, blocked viewer, and private-profile/private-Platform fixtures for full runtime proof without bypassing RLS or block/privacy rules.
- Keep screenshots outside the repo and leave `artifacts/` plus `supabase/.temp/` untouched.

The Profile attachment UX pivot is closed repo-side: social attachment entry points now share one modern Photos/Files sheet across Profile posts/comments, Chi'lly Chat, creator-video comments, Watch-Party room comments, and Live Stage room comments. The sheet no longer offers Platform Studio; creator content stays in Platform Studio through the owner actions and creator-content copy, not social Attach. Photos opens the phone gallery through `expo-image-picker`, while Files keeps `expo-document-picker`; installed dev-client/AAB builds that predate this commit need a rebuilt client before that native gallery picker is available. Legal evidence pickers and Platform Studio creator/brand upload pickers were not changed. Android proof lives outside the repo at `/tmp/chillywood-profile-social-interaction-proof-20260525/`, including `45-shared-attachment-sheet-profile.png` and `48-chat-shared-attachment-sheet.png`; the operator checked the Player, Watch-Party, and Live Stage sheet behavior, so route-specific screenshots are no longer a remaining proof blocker. Validation passed the requested type/runtime/Profile/payment/creator/Clip/Brand/Watch-Party/provider guard stack plus targeted attachment/profile greps and diff whitespace checks.

The Profile Viewer State Runtime Proof Closeout is now closed repo-side for the backed states available on `R5CR120QCBF`.

Closed truth:

- Signed-out public Profile opens after app-data clear with no Platform Studio, Preview Platform, Settings, delete controls, owner draft/reported badges, composer, or Attach controls.
- Signed-out Follow shows the sign-in-required `Follow Platform` handoff, and signed-out Chi'lly Chat shows the sign-in-required Chi'lly Chat handoff without creating a fake thread.
- Signed-out View Platform opens the public Platform route, not Studio, and public Platform hides owner controls/drafts.
- Signed-in non-owner proof used the available authenticated account viewing Rachi's official Profile: no owner controls, no delete controls, no draft/reported badges, no composer/Attach; View Platform opened public Platform. Current product truth now keeps Rachi out of Chi'lly Chat and pinned first in Chi'lly Circle.
- Owner regression after viewer tests confirmed Platform Studio, Preview Platform, Chi'lly Chat, Chi'lly Circle, Settings, composer, Attach, owner delete, owner draft badge, Platform Studio route, public Preview Platform, and owner Chat inbox still work.
- `npm run guard:profile-production-policy` now statically covers signed-out follow/chat handoffs, Profile privacy gates, owner/viewer action split, owner-only delete/draft/reported controls, blocked Chi'lly Circle guard, public Platform blocked-viewer guard, and public Platform draft exclusion.
- Android screenshots/UI dumps live outside the repo at `/tmp/chillywood-profile-viewer-state-proof-20260525/`.
- Validation passed with `npm run typecheck`, `npm run validate:runtime`, the refresh/payment/creator-monetization/Stripe Connect/VOD/Clip Studio/Platform Brand Studio/Watch-Party LiveKit/old-room/provider-readiness/Profile production guards, targeted Profile grep/static proof, `git diff --check`, and `git diff --cached --check`.

Remaining limitations:

- The latest social interaction proof created a real owner Profile post with an image attachment, saw attachment preview plus Like/Comment/Share/Delete controls, proved like/unlike, posted a real owner comment, and cleaned the proof post/comment. Android reply submission was interrupted before a reply row was created, and Share sheet runtime proof still needs a clean current-build pass.
- A true second-account credential was not available in the local proof setup, so signed-in non-owner proof used an existing authenticated account against the official Rachi Profile rather than logging into a separate viewer account.
- Blocked/private runtime proof was not faked. Anonymous private-profile discovery was RLS-denied and `channel_audience_blocks` had zero client-visible rows. Static source proof covers the privacy/block path, but a safe fixture is still needed for full runtime proof.
- Player creator-video comment, Watch-Party room comment, and Live Stage comment attachment sheets are statically/type/guard validated, and the operator checked the shared sheet at runtime. No route-specific screenshot gap remains for this attachment UX pass.

Recommended next lane:

- Create or identify safe test accounts for owner, second-account viewer, blocked viewer, and private-profile/private-Platform states.
- Prove blocked/private runtime behavior on Android without bypassing RLS, block rules, privacy rules, or chat thread permissions.
- Re-run signed-in second-account Profile, View Platform, Chi'lly Chat, Follow/Chi'lly Circle, comment/like/share, viewer no-owner-control proof, and viewer no-delete proof.
- Recheck owner post create with Attach, comment/reply with Attach, Share sheet, owner Delete, and public/draft/private visibility boundaries.
- Keep screenshots outside the repo, leave `artifacts/` and `supabase/.temp/` untouched, and keep creator-video upload/Clip Studio/Brand Studio/monetization/LiveKit behavior out of scope unless a regression is found.

## Still-Open Non-UI Follow-Ups

RevenueCat / Google Play webhook credential linking and sandbox event proof remains open from the provider-readiness lane. Keep live money disabled and do not mark provider rows active.

Clip Studio Metadata-Only Trim Preview remains a valid later lane: add `trim_start_ms` / `trim_end_ms` metadata-only controls only if product wants preview range before launch, keep public Player unchanged unless a separate VOD renderer lane owns it, and do not claim export or permanent cuts.

Platform Brand Studio Cropper and Cleanup Automation remains a valid later lane: Level 2 focal-point drag/reposition, service-role/admin-only cleanup execution, and continued Hero Reel/watermark honesty.

Security Request Context follow-ups remain valid: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.

## Current Copy Proof Follow-Up

The reachable current-build copy gaps are closed on `R5CR120QCBF` with proof at `/tmp/chillywood-copy-gap-closeout-20260531/`.

Closed now:

- Rebuilt release APK installed successfully.
- Chi'lly Chat inbox visual proof is clean.
- Settings/account/legal and notification status copy is clean.
- Signed-in `/login` redirect copy is clean.
- Admin remains owner/admin-gated; `guard:admin-auth-safety` passed.
- Chi'lly Chat call-preview fallback no longer references a development/debug build and is now guarded.

Remaining proof-only follow-ups:

- Use a stable clean emulator, second device, or explicit physical app-data reset window for signed-out visual proof.
- Use a non-owner account for normal-user Admin denial visual proof.
- Use an active Chi'lly Chat call/thread fixture with camera/microphone denied for permission-denied visual proof.
- Use a device/runtime that exposes notification denial if notification-denied UI copy needs visual proof.

## Signup Follow-Up

Signup is no longer blocked on the Play-installed Android build. Commit `ea4b545` imports `react-native-get-random-values` before Supabase auth initialization, and EAS production update group `4679bd00-d966-4950-b7eb-570e120b3e4d` proved a fresh Android signup on `R5CR120QCBF` with success copy. Keep using fresh emails for signup smoke because proof emails created during debugging now exist in Supabase auth. The remaining signup follow-up is operational: confirm real user confirmation-email delivery with the configured SMTP/provider and keep reset-email rate limits managed through Supabase Auth email settings, not app UI changes.

## Admin Role Scope Follow-Up

Admin role scope: Closed after validation.

Admin is a real production role backed by the existing `operator` platform staff role and scoped permission grants. Admin permissions are scoped and granted by Owner/First Owner through the existing Staff & Roles flow. Backend denies non-admin and unscoped-admin attempts even if UI is bypassed.

Role terminology lock: `operator` is only the internal/backend alias for product-facing Admin. There is no separate product Operator role. Support is a work area and permission group, not a separate staff role. Moderator is separate from Admin/operator and can receive support duties through exact scoped permissions. Do not add `support` to `platform_role_memberships`.

Moderator role scope: Closed after validation.

Moderator is a real production role backed by `moderator`. Support is a work area, not a separate role. Moderator can perform support duties only with exact support scopes. Moderator is separate from Admin/operator. Moderator cannot grant or revoke Owner. Moderator cannot grant or revoke Admin/operator. Moderator cannot alter First Owner succession. Moderator cannot remove, demote, delete, deactivate, or suspend First Owner. Moderator cannot enable money/provider/payout systems. Moderator cannot execute provider refunds. Moderator can record manual/external refund support status only with permission. Moderator destructive actions require permission, reason, confirmation, case/report context where applicable, and audit. Backend denies non-moderator and unscoped-moderator attempts even if UI is bypassed. Broken Moderator/support buttons are wired or open active access/status/resolution flows. No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed.

Required production truth:

- Admin cannot grant or revoke Owner.
- Admin cannot alter First Owner succession.
- Admin cannot remove, demote, delete, or deactivate First Owner.
- Admin cannot enable money/provider/payout systems.
- Admin cannot execute provider refunds.
- Admin can record manual/external refund status only with permission.
- Admin destructive actions require permission, reason, confirmation, and audit.
- Broken Admin buttons are wired or open active access/status/resolution flows.
- No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed.

Staff role hierarchy proof: Closed after validation. The final product-facing hierarchy is First Owner, Owner, Admin, Moderator, Creator, and User. `operator` is only the internal/backend alias for Admin. Support is a work area and permission group, not a backend role. Moderator includes support duties only through exact scopes. No backend role values were renamed.

Owner/Admin Command Center UI: Closed after validation. Single Command Center entry point remains `/admin`. Admin UI is production-labeled, not proof/debug-labeled. Unavailable tools open active status/resolution flows. Dangerous actions require confirmation. Destructive/sensitive actions require reason and audit where supported. Admin search results are privacy-safe and limited/paginated. Admin UI fails closed if backend functions are unavailable and does not show raw backend errors. Admin UI does not expose service-role-only concepts, raw storage paths, signed URLs, private provider IDs, token values, raw IPs, secrets, tax IDs, or bank details. Money/provider/payout actions remain readiness/status/manual/external flows.

Reporting and moderation workflow: Closed after validation. Users can report profiles, Profile media, Platform content, videos, paid videos, live rooms, chat messages, comments, replies, events, and VIP/subscriber content where the surface exists. Reporter identity stays private by default, reported users are not notified merely because a report was filed, moderation actions can notify affected users/creators with safe copy, and appeals use support/escalation workflow in V1 unless full in-app appeal UI exists. Reported items are reviewed before action unless high-risk policy requires urgent temporary hiding/escalation. Illegal/safety/security categories are escalated differently. Normal reports, DMCA/legal, support, money/refund/access support, security incidents, and appeals are separated. Duplicate/false reports are deduped and rate-limited. Staff access requires exact scopes and case/report context. No reporter identity, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed.
Dedicated event report affordance: Closed after validation. Exact chat-message report affordance: Closed after validation. Event reports target the specific event. Chat-message reports target the exact message with thread context. Reporter identity remains private by default. Reported users are not notified merely because a report was filed. Reported events/messages are not auto-deleted. Urgent categories route to escalation/review. Duplicate/false reports remain deduped and rate-limited. Private evidence access remains staff-scoped and case/report-context-only.
Content takedown decisions: Closed for production decision policy and current backed enforcement after validation. Reports do not auto-delete content. Takedowns require exact scope, reason, case/report context where applicable, and audit. Hide/quarantine/restrict is preferred over hard delete. Evidence is preserved for moderation, DMCA/legal, security, payment/access disputes, and appeals. Paid-access history is preserved. Takedown does not execute provider refunds, enable payouts, move money, or activate creator-money/Premium public purchase paths. Manual/external refund/access support path is documented.
Live-room moderation and incident response: Closed for production policy, current backed host controls, LiveKit token authority, and incident-response proof after validation. LiveKit token issuer remains source of truth for publish authority, Moderator actions cannot grant publish authority accidentally, host/authorized seat approval remains separate from staff moderation, blocked/disabled/deleted/scheduled-deletion/suspended users fail closed, participant caps remain enforced, stale-room/reconnect safety remains protected, and staff force-end/deeper live mutations remain exact backed-live-ops future lanes unless already supported.
Chat/call moderation and notification abuse controls: Closed after validation. Dedicated chat_thread report target: Closed after validation. Chat-message hide/remove/restore: Closed after validation.
Account restriction and appeals operations: Closed for current production policy and existing backed enforcement after validation. Reports do not auto-suspend or auto-ban. Suspension/deactivation/restore require exact scope, reason, target, and audit. First Owner cannot be suspended, deactivated, deleted, restored, or restricted by Admin/Moderator. Moderator cannot perform account-wide suspension/restoration by default. Restricted users fail closed for private app features where backed. Premium entitlement may remain provider-side while app access fails closed. Paid-access and payment history are preserved. Provider refunds remain manual/external. Payouts and money movement remain disabled. Appeals use support/escalation workflow in V1 without exposing reporter identity or private evidence.

Next lane: Continue production readiness with legal/privacy/account deletion and data safety final alignment, unless a narrower blocker is found.
# Next Task

## Media CDN/HLS Rollout Follow-Up

Current media next step: publish/prove the audited public HLS playback rollout in the installed Play app after source validation and owner-approved OTA config. Use `trusted_public` only while it still requires trusted `media_renditions` rows plus backup/audit gates; otherwise use `canary` or `batch`.

Required before any expansion:

- `npm run backup:media-worker:preflight`
- `npm run backup:media-worker:verify-latest`
- `npm run backup:media-worker:restore-drill`
- `npm run media-worker:preflight`
- `npm run media-worker:status`
- `npm run proof:media-playback-cdn-eligibility`
- `npm run proof:media-cdn-rollout-planner`

Do not process new media, run backfill, deploy a worker, add cron/scheduler, remove signed-origin fallback, or switch private/original/Premium media to public CDN. Continuous automation remains blocked.

## Live Stage Installed Proof Follow-Up

Next lane: publish an OTA from the aligned Live Stage follow-up commit, then rerun installed proof on Google Play-installed R5/R3 with both devices Premium-active in the same Google Play / RevenueCat sandbox window.

Proof must use testID taps where available:

- `live-stage-self-hero-toggle`
- `live-stage-request-camera-button`
- `live-stage-pending-seat-card-*`
- `live-stage-seat-request-close`
- `live-stage-seat-request-dismiss`
- `live-stage-seat-request-approve`

Required installed truth: host remains hero/background and is not duplicated as `You HOST`; host member box shows the remote viewer/requester; non-requesting audience viewers do not expose a direct `Seat Participant` path; viewer self tile does not borrow a remote feed; `Make me hero` is instant and local-only; X close preserves request/card and collapses transient controls; `Not now` clears the request without removing the participant; `Bring on stage` seats the requesting viewer and reaches Stage / `2 in room`.

Do not bypass Premium, manually grant entitlements, change LiveKit routing/heartbeat/cutoffs, touch Watch-Party Party Room, Android App Links, Chi'lly Chat/native calls, auth/RLS, billing/provider settings, live money, payout, cashout, sideload, `adb install`, logout, clear data, uninstall, or reinstall.

## BrowserStack Monetization E2E

Next proof lane: use the BrowserStack readiness artifacts to run Android App Live/App Automate smoke proof for the seven monetization flows. Start with fixture readback, grant a non-owner sandbox tester, run Maestro selector smoke flows locally when possible, then use BrowserStack App Live for Google Play sandbox purchase-sheet completion. Do not use coordinate taps unless documented as an emergency proof weakness.

Required proof target remains: owner cannot buy their own creator offers; Premium remains separate from creator subscription/VIP/tips/paid videos/tickets/events; tester revoke hides/blocks sandbox CTAs and direct purchase intents; live money and payouts remain off.

## Sandbox Money Follow-Up

VIP clean-tester proof is closed in `/tmp/chillywood-vip-after-play-refund-proof-20260616-180235`. Final Paid Video, Watch-Party Seat Pass, and Event Pass proof is closed in `/tmp/chillywood-sandbox-money-final-three-proof-20260616-183633`. Do not mark any future money lane live-money-ready from these proofs: they prove Android sandbox tester flows only, with no real charges, no payouts, no creator earnings, no Premium unlock, and no LiveKit/room authority changes.

Next useful follow-up is BrowserStack/final regression plus provider lifecycle tooling when safe order ids are available. Watch-Party Seat Pass proof reached the room permission path after purchase; camera/mic permissions were denied and full media join was intentionally not part of this sandbox money proof.

Migration prerequisite is closed: local migration history was reconciled to production timestamps for the two Chi'lly Circle migrations, and production now has `20260616030632_sandbox_monetization_testers`, `20260616034235_tighten_sandbox_monetization_tester_rpc_grants`, `20260616120810_support_channel_vip_sandbox_config`, `20260616120924_allow_channel_vip_config_product_types`, and `20260616121739_require_sandbox_tester_for_purchase_intents` applied.

## Every Visible Surface Active Wiring

Every visible surface active wiring audit: Closed. Current lane closed: Every visible surface active wiring audit. No visible clickable dead buttons are allowed. Nothing visible should be hidden or disabled. Every visible control works, routes correctly, opens a setup/status/resolution flow, opens a support/review flow, or starts a tester-safe flow. Permission scopes must unlock backed behavior.

Tester-visible monetization UX is separate from live money settlement. Premium monthly tester flow is reachable where Play internal/licensed tester/provider setup supports it. Premium annual opens an active provider-blocked status/resolution flow. Creator Channel Subscription opens an active provider-blocked status/resolution flow. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. No Google Play, RevenueCat, Stripe, payout, refund, purchase, or provider mutation happened.

Next practical lane: build/publish the next approved Google Play internal/closed testing binary/update containing this active-surface wiring, then run tester feedback triage. Premium monthly public purchase proof remains separate owner-approved work.

## Visible Surface Tester Delivery

Visible-surface active wiring tester delivery: Closed. Commit 7138dd2 was pushed to origin/main before delivery, and `main` was aligned with `origin/main` before delivery. The changed-file delivery analysis classified the commit as EAS Update eligible because it did not change native config, package ID, runtimeVersion, permissions, native modules, Android project files, or build profile configuration.

EAS Update group `d7aac53c-65bb-4bf7-ae69-04bfea248e0a` with Android update `019f0533-920e-7fca-8f45-74b1f538040a` was published to branch `production` for runtime `1.0.0`. Play internal/closed testing remains the approved tester path. Sideload is not an approved tester delivery path. No APK sideload was used. No app uninstall/reinstall/clear-data happened unless explicitly owner-approved.

Next lane: Play internal tester full visible-surface QA pass. Testers must verify visible controls in the installed tester build after closing and reopening the Play internal app on a good network. No Play production submission happened. No provider mutation happened. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. Premium annual remains provider-blocked. Creator Channel Subscription remains provider-blocked.
## Stale Proof Normal / @user230456 DB Readback

Status: Classified / no app fix applied.

Play-installed v63 on `R3CXA0DS5JV` reproduced the old normal inbox row and direct-thread header as `Proof Normal` / `@user230456`. Sanitized diagnostic DB readback proved the row points to a legitimate separate profile/thread: the profile username is `user230456`, display name is `Proof Normal`, and the expected current `user230455` profile is a different redacted user hash. There is no duplicate thread for that stale row's pair, no missing readable profile row for the stale member, and the stale member snapshot agrees with its `user_profiles` row.

Root cause classification: old/different user record that legitimately still exists.

Do not hide or delete stale rows just to pass proof. Do not falsely merge separate users. Fresh remote profile must win over stale AsyncStorage and stale participant snapshots where the same user is involved, but this row is not the same user as `user230455`. Existing direct-thread matches appear under Threads by design. Source commit `8938356` updates People copy to `Already in your threads. Open the matching thread below.`, but source fixed is not installed-app proof; Google Play internal install is not enough without actual user flow proof. `installerPackageName` must be `com.android.vending`, and sideloaded APK proof is not accepted.

Artifact: `/tmp/app-stale-chat-identity-readback-20260629-010030/`.

Safety: no logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat/social proof was counted as actual-user proof. No provider/live-money mutation happened. `liveMoneyEnabled` remains OFF.

## Room-Safe Notifications And Calls

Status: Source-closed / installed proof pending.

The notification bell/tray and Chi'lly Chat room-call interruption lane is source-closed. Next proof, if requested, is a Google Play internal installed build that verifies the icon-only bell on Home, Explore, Live, Saved, Platform, and Platform Studio; room-safe tray/badge on Watch-Party Waiting Room, Party Room, and Live Stage; and incoming Chi'lly Chat call handling while inside a room.

Required truth for that next proof: Notification bell is icon-only. Bell badge is backed by real notification unread summary. Normal app surfaces show the bell next to existing header actions. Room/live surfaces use room-safe notification tray/banner behavior. Incoming Chi'lly Chat calls do not auto-answer. Incoming calls do not auto-leave or hijack room mic/camera. Leave room and answer requires explicit user action. Hosts receive an extra confirmation before leaving a hosted live room. Chat remains conversation-only. Money Center remains creator business home. Notifications guide users to routes; they do not grant access. Destination routes re-check access. liveMoneyEnabled remains OFF. Payouts and cashout remain OFF.

Audit update: Last two notification commits were audited together. Creator-money notification records and room-safe bell/call behavior are source/backend aligned. Remote migration status verified. Changed Edge functions deployed or verified unchanged; `revenuecat-webhook` is ACTIVE version 18. Installed-app proof remains pending. Source/backend readiness is not installed-app proof. Google Play internal build is still required for visible device closure.
