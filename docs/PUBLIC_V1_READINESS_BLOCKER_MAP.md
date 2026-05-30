# Public V1 Readiness Blocker Map

Date: 2026-05-29
Lane: Public V1 Readiness Blocker Map
Starting HEAD: `5ed7db5` (`Consolidate Admin IA and drilldowns`)
Branch at audit start: `main...origin/main`

## Summary

Current status: **partial**.

Chi'llywood is safe enough for continued controlled Android testing when live money remains off, claims stay honest, and testers understand that several fixture/release proof gaps remain. It is **not ready for broad public launch** until release-build proof, store/legal acceptance, final account deletion process ownership, and selected runtime fixture gaps are closed.

No P0 code/security failure was found in this audit. The current hard launch blockers are release/store/legal proof blockers rather than newly discovered app-code regressions.

Counts after the May 30, 2026 malware-scanning launch-policy decision closeout:

- P0 blockers: 1
- P1 blockers: 11
- P2 deferrals: 11

Blocker 8 follow-up on May 29, 2026 closed the stale repo-side moderation tooling gap. General safety reports, report status updates, target hide/remove/restore, immutable report audit rows, DMCA intake/counter-notice tooling, public legal/support routes, and Profile media report/admin hide/remove/restore paths are backed in code and migrations. The remaining Blocker 8 work is external/operational: attorney approval, Play/legal acceptance, support/account-deletion SLA ownership, outbound email/DKIM, and a disposable-fixture report lifecycle drill if the launch owner wants one more visual runtime receipt. Automated malware scanning is not configured or claimed; the May 30 decision closeout makes it non-blocking for controlled Public V1 and a P2 future provider lane unless Play/legal review explicitly requires it. This does not add a second P0 beyond the existing store/legal/account-deletion acceptance blocker.

Store Legal Account Deletion Ops closeout on May 29, 2026 mapped the remaining external side without claiming acceptance. Public legal URLs for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Community Guidelines, Creator Rules, Moderation Policy, and Premium Terms returned HTTP 200 after redirects. DNS proof shows Cloudflare MX, SPF, and DMARC baseline records for `chillywoodstream.com`; common DKIM selectors did not return a DKIM record, so DKIM remains unverified until a real outbound provider is configured. The closeout added:

- `docs/legal/STORE_LEGAL_ACCOUNT_DELETION_ACCEPTANCE_CLOSEOUT.md`
- `docs/legal/OUTBOUND_EMAIL_DKIM_RUNBOOK.md`
- `docs/security/MALWARE_SCANNING_READINESS_PLAN.md`

After the May 30 malware-scanning launch-policy decision closeout, the updated status is P0 blockers: 1, P1 blockers: 11, P2 deferrals: 11. The P0 remains external Play/Data Safety/account-deletion/legal acceptance, not an app-code security defect.

Command proof:

- Full command log: `/tmp/chillywood-public-v1-readiness-20260529/commands.log`
- Eight-blocker burn-down validation log: `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/full-validation.log`
- Store/legal/account-deletion ops proof folder: `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/`
- All required commands returned status `0`.
- `supabase db lint --linked --schema public --fail-on error` reported no schema errors.
- `supabase db push --dry-run` reported the remote database is up to date.
- Burn-down targeted proof showed only docs/state files changed; app code, native code, Supabase migrations/functions, guard scripts, LiveKit token issuer, Watch-Party route ownership, old-room handling, Premium gates, RLS, and money code were untouched.
- `git status --short` showed only docs/state changes plus existing untracked `?? artifacts/` and `?? supabase/.temp/`.

Android proof posture:

- Device available during audit: `R5CR120QCBF`.
- The eight-blocker burn-down created fresh current release proof at `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/`.
- Current proof paths are listed below per area.
- Missing screenshots are not claimed.

## Eight Blocker Burn-Down Update

Date: 2026-05-29
Proof folder: `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/`

| Blocker | Status after burn-down | Class after burn-down | Public test blocker | Broad launch blocker | Evidence | Remaining blocker / next lane |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Current release Android AAB/APK build/install/open proof | Partial, P0 build/install/open portion closed | P1 route-smoke/diagnostics | No for controlled Android test | Yes until final route/log smoke | `android/app/build/outputs/apk/release/app-release.apk` 196M sha256 `1341122010fad711ab256f5c04a6c67000061346aeaca5c95b7a54194aa6f21b`; `android/app/build/outputs/bundle/release/app-release.aab` 126M sha256 `fbe91629a16e3d0143106296d527b91e86bbb1dad80f3a53b01994d416be2f0a`; install `Success`; screenshots `01` through `19`, `43` through `50` in the proof folder | Full signed-out/signed-in route sweep, release diagnostics/log-redaction, Crashlytics/Performance/vitals proof |
| 2. Store/legal/account-deletion acceptance | Partial | P0 | Yes for public distribution | Yes | Public legal URLs returned 200 in `public-legal-url-check.tsv`; in-app Settings, Support, Account Deletion, Privacy, Terms, Copyright Report, and Moderation Policy routes captured | External Play Console/Data Safety/content-rating/account-deletion acceptance, attorney/legal approval, support/account deletion SLA ownership |
| 3. Profile media save/read-back/remove/fallback proof | Partial | P1 | Yes for media personalization claim | Yes for broad social launch | Owner Profile avatar edit sheet opens; Settings `Profile Appearance` shows Profile Photo/Profile Background; safe app-owned proof assets staged on device in `safe-profile-media-assets-on-device.txt`; proof screenshots `21`, `26`, `30` | User will complete manual picker/save later. Current native picker surfaced Android file picker rather than a gallery-first surface; save/read-back/remove/fallback and public masking are not claimed |
| 4. Second-account, blocked, private runtime fixtures | Blocked | P1 | Yes for broad social proof | Yes | Source/guard proof remains current; no second account credentials or safe blocked/private fixtures were available | Provide owner account, normal viewer account, signed-out state, backend blocked relation, private profile/platform fixture, and owner-session restore path |
| 5. Watch-Party Live two-device/reconnect proof | Blocked | P1 | Yes if broad live launch is promoted | Yes for broad live launch | `adb-devices-for-two-device-proof.txt` shows only `R5CR120QCBF`; current Watch-Party and Live Watch-Party route screenshots captured | Second device/emulator plus second account; prove remote speech ducking/restoration, reconnect, old-room handling, and no route ownership regression |
| 6. Spectator Live Watch-Party / Reaction fixture proof | Blocked | P1 | Yes if Spectator live reaction is promoted | Yes | `48-spectator-t1-route.png` proves unavailable state for ineligible/private metadata; Spectator guard remains current | True public-safe live-stage-compatible source, Reaction source, replay archive, private/ineligible/ended/reuse-disabled fixtures |
| 7. RevenueCat/Google provider proof | Partial | P1 for monetized launch | No while live money/Premium claims stay off | Yes for monetized launch | `provider-secret-name-inventory.txt` shows no RevenueCat/Google webhook secret names; `provider-webhook-smoke.tsv` shows RevenueCat/Google setup-required/fail-closed with no Premium/live-money action; Money Center screenshot shows `Not active` | Link RevenueCat/Google provider secrets and dashboard permissions server-side; run signed sandbox events without granting fake Premium/live money |
| 8. Moderation/legal ops runtime closure | Partial, repo-side moderation tooling closed; malware-scanning decision closed for controlled Public V1 | P1 ops/legal external; scanner is P2 future unless reclassified | No for controlled Android testing; yes if public distribution has no assigned support/moderation owner | Yes until external ops acceptance; scanner blocks only if Play/legal review requires it | Support, Copyright Report, Moderation Policy, Admin Reports tab, and public legal URLs captured; source proof in `/tmp/chillywood-blocker8-moderation-legal-closeout-20260529/source-proof.log` confirms general report status/action RPCs, immutable audit rows, Profile media report actions, and Profile media flagged/admin_removed public masking; `docs/security/MALWARE_SCANNING_READINESS_PLAN.md` records the no-fake-scanner launch decision | Attorney/legal approval, Play/legal acceptance, support/account-deletion SLA ownership, outbound email/DKIM, and optional disposable-fixture report lifecycle/admin-action visual drill. Scanner integration remains future unless Play/legal review requires it |

## Top 10 Launch Blockers

1. **P0 - Store/legal/account-deletion acceptance is not complete.** Attorney/legal approval, Play Data Safety, account deletion URL acceptance, listing/content rating, and final support/account-deletion ownership remain external blockers.
2. **P1 - Profile media runtime closure is incomplete.** Owner avatar/settings entry and safe assets are proved, but save/read-back/remove/fallback/public masking still need manual safe-asset proof.
3. **P1 - Second-account, blocked, and private runtime fixtures remain incomplete.** API/static proof exists, but full runtime fixture proof must not be faked.
4. **P1 - Watch-Party Live two-device speech/reconnect proof remains incomplete.** Single-device/current route proof exists; true remote speech ducking needs two joined devices/accounts.
5. **P1 - Spectator Live Watch-Party / Reaction needs a true compatible source fixture.** Ineligible unavailable state is captured; VOD/replay must not be relabeled as live.
6. **P1 - Provider setup remains sandbox/setup-only.** RevenueCat/Google signed webhook proof and external provider permissions/secrets remain incomplete for broad monetized launch.
7. **P1 - Moderation/legal ops still need external acceptance.** Repo-side report lifecycle actions and Profile media moderation are backed; attorney review, Play/legal acceptance, support/account-deletion SLA, outbound email/DKIM, and optional disposable-fixture visual proof remain. Malware scanning is P2/future unless Play/legal review requires it.
8. **P1 - Release diagnostics/logging proof remains pending.** Firebase Crashlytics/Performance, production log redaction, Android vitals/pre-launch report, and release log audit must be run on the release candidate.
9. **P1 - Full signed-out/signed-in release route sweep remains pending.** The current release build opened core authenticated routes, but fixture-backed account-state proof is still incomplete.
10. **P1 - Creator upload/playback release lifecycle needs one final current-build proof.** Player route opened; full upload/draft/publish/unpublish/delete lifecycle remains a release-candidate smoke task.

## Top 10 Safe Deferrals

1. iOS packaging and App Store submission.
2. Full CapCut-style editor, destructive trim/export, and burned-in rendered title cards.
3. Advanced analytics and deeper operational dashboards.
4. Extra search filters and ranking beyond backed Explore/Admin search.
5. Hero Reel playback and public watermark rendering.
6. Native game streaming and real Chi'llyfects AR processing.
7. Live ads, ad revenue, sponsor checkout, and ad network delivery.
8. Live payouts, tips, paid creator checkout, merch checkout, tax/KYC, and instant cash-out.
9. Advanced Admin read-model polish for broader Users, Usage, System, and historical deploy rows.
10. Richer spectator/replay catalog proof beyond current safe fixtures.

## Do Not Build Now

- Do not activate live money, live payouts, tips, paid content checkout, merch checkout, sponsor checkout, or ads.
- Do not fake Premium, balances, earnings, Rachi activity, live rooms, search results, reports, followers, messages, or creator activity.
- Do not add a manual approval queue for every Profile photo/background upload.
- Do not weaken RLS or use client-hidden buttons as security.
- Do not change the LiveKit token issuer, old-room handling, Watch-Party route ownership, Premium gates, or route ownership doctrine.
- Do not add a broad Profile/Platform/Studio redesign while closing proof blockers.
- Do not build iOS, advanced editor export, native AR/game streaming, or full money systems before launch blockers are closed.

## Ready For Controlled Android Testing

- `main` is aligned with `origin/main` at audit start.
- Typecheck, runtime validation, all requested guards, Supabase migration list, linked lint, dry-run, and diff checks passed.
- Bottom navigation, Profile/Platform terminology, Profile production guard, Money Center guard, LiveKit/old-room guards, Rachi guard, Spectator guard, Admin Search guard, public user search guard, content rights guard, and VOD quality guard all passed.
- Supabase migrations are locally/remotely aligned through `202605290004`.
- Live money remains off; no checkout, transfer, withdrawal, payout, fake balance, or fake Premium state is active.
- Public-facing Profile/Platform/Admin/Rachi/Spectator/search/money safety boundaries have current static guard coverage.
- Existing Android proof covers the latest major UI/IA lanes across Home, Explore, Library, Profile, Platform, Platform Studio, Admin, Money Center, Spectator, Rachi, Watch-Party, and audio-mix surfaces.

## Not Ready For Broad Public Launch

- Fresh release-candidate APK/AAB build, install, open, Home/bottom-nav smoke, and several core authenticated routes were captured, but full signed-out/signed-in route sweep and release diagnostics remain incomplete.
- Play Console listing, content rating, Data Safety, account deletion acceptance, and final store assets are not complete.
- Attorney/legal approval remains required for launch policy text and support/account-deletion process.
- Moderation tooling is repo-backed for reports, target actions, DMCA, and Profile media, but support/moderation operations ownership and external legal acceptance are not complete.
- Profile media save/read-back/remove/fallback and public masking runtime proof remains open.
- Safe second-account, blocked, and private runtime fixtures are not complete.
- Release diagnostics/logging, Firebase Crashlytics/Performance receipt, and Android vitals/pre-launch proof remain pending.
- RevenueCat/Google provider webhook proof and production monetization setup remain incomplete; live money must stay off.
- Live/Watch-Party two-device and Spectator live-reaction fixture proof remain incomplete.

## Android-Only Release Readiness

Status: **partial; current build/install/open proof is closed, broad public release still blocked**.

Evidence:

- App identity exists in `app.json`: app name `Chi'llywood`, package `com.chillywood.mobile`, scheme `chillywoodmobile`, icon/splash/adaptive icon assets.
- `eas.json` has `production` App Bundle and `production-apk` internal APK profiles.
- Google Play package/developer verification is recorded complete in `docs/ANDROID_RELEASE_EAS_RUNBOOK.md`.
- Earlier EAS/Internal Test purchase proof exists for versionCode 3.
- The eight-blocker burn-down built `assembleRelease` and `bundleRelease` from current `main`, installed the release APK on `R5CR120QCBF`, opened past splash, captured Home/bottom nav, and captured Profile, public Platform, Platform Studio, Player, Money Center, Admin, Watch-Party, Live Watch-Party, Spectator unavailable state, Settings/legal/support routes, Privacy, and Terms.

Remaining launch blocker:

- Complete the full signed-out/signed-in route sweep, release diagnostics/log redaction, Android vitals/pre-launch report, and fixture-backed Profile/media/privacy/live/Spectator proofs.

Recommended next lane:

- Store Legal Account Deletion Acceptance Closeout, plus a smaller release diagnostics and signed-out/signed-in route-smoke follow-up.

## iOS Summary

Status: **deferred**.

iOS remains outside Public V1 Android readiness. Do not spend launch-blocker time on iOS until Android release candidate, store/legal, and privacy/runtime proof blockers are closed.

## Money And Live-Money Safety

Status: **safe for testing with live money off; blocked for live-money launch**.

Evidence:

- `npm run guard:payment-rail-policy`, `guard:creator-monetization-policy`, `guard:stripe-connect-policy`, `guard:provider-readiness-policy`, and `guard:money-center-policy` passed.
- `platform_money_kill_switches` defaults keep `live_money_enabled`, payouts, digital sales, tips, paid content, merch, ad revenue, sponsorships, revenue imports, and tax/KYC off.
- Money Center and Admin Money Audit Explorer proof paths:
  - `/tmp/chillywood-admin-money-center-proof-20260527/`
  - `/tmp/chillywood-money-audit-explorer-proof-20260527/`
  - `/tmp/chillywood-provider-cli-proof-20260527/`
  - `/tmp/chillywood-money-center-android-refresh-proof-20260527/`

Blockers:

- RevenueCat/Google signed webhook and provider permission proof remains incomplete.
- Production payouts, live checkout, real ad delivery, and creator earnings must stay deferred.

Recommended next lane:

- RevenueCat/Google Provider Webhook Linking And Signed Sandbox Proof, only after server-side credentials are intentionally linked.

## Privacy And Security Summary

Status: **no new P0 found; final runtime proof still required**.

Evidence:

- Supabase linked lint passed with no public schema errors.
- Remote dry-run reported the database is up to date.
- Admin Search normal-user API/RLS denial proof is recorded at `/tmp/chillywood-admin-denial-ia-drilldown-proof-20260529/normal-user-api-denial.json`.
- Profile/public Platform guards cover no owner controls to viewers, no public draft/private content, non-active Profile media masking, no Profile Upload CTA, no Mini Platform, and Channel-to-Platform user-facing terminology.
- LiveKit and old-room guards passed.

Blockers:

- Runtime Android normal-user Admin panel denial still needs safe session proof.
- Second-account blocked/private Profile/Platform/Chat fixtures remain incomplete.
- Release log audit must verify no tokens, signed URLs, provider secrets, service-role values, raw storage paths, or private identifiers leak in production logs/UI.

## Area Map

| Area | Status | Class | Launch-blocking | Evidence / proof path | Files / routes involved | Exact blocker | Recommended next lane |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. App launch / Android release | Partial | P1 | Yes for broad launch diagnostics, no for controlled Android test | `docs/ANDROID_RELEASE_EAS_RUNBOOK.md`, `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md`, `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/`, existing `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/` | `app.json`, `app.config.ts`, `eas.json`, Android package `com.chillywood.mobile` | Current release APK/AAB build/install/open is proved; full signed-out/signed-in route sweep, release diagnostics/log-redaction, and Play pre-launch/vitals proof remain. | Release Diagnostics And Route Smoke Closeout |
| 2. Auth / onboarding / account | Partial | P0/P1 | Yes for public release | `docs/legal/LEGAL_LAUNCH_CHECKLIST.md`, `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`, `docs/public-v1-release-checklist.md` | `app/(auth)`, `app/settings.tsx`, `app/account-deletion.tsx`, `app/privacy.tsx`, `app/terms.tsx`, `app/support.tsx` | Legal approval, Play account deletion acceptance, support/account deletion SLA, and release signup/session smoke remain. | Legal Store Acceptance And Release Auth Smoke |
| 3. Navigation / IA | Ready for controlled test | P1 final smoke | No, unless release smoke fails | `/tmp/chillywood-modern-nav-ia-proof-20260528/`, `/tmp/chillywood-home-profile-cleanup-proof-20260529/`, guards passed | `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, `app/(tabs)/live.tsx`, `app/(tabs)/my-list.tsx`, `app/profile/[userId].tsx`, `docs/NAVIGATION_TERMINOLOGY_MAP.md` | Needs final release-candidate no-regression smoke only. | Android Route Smoke |
| 4. Home / Explore / Library | Partial-ready | P1 | No for closed test | `/tmp/chillywood-home-continue-watching-proof-20260529/`, `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/`, `/tmp/chillywood-explore-people-search-proof-20260529/`, `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/` | `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, `app/(tabs)/my-list.tsx`, `_lib/publicPeopleSearch.ts`, `_lib/discoveryFeed.ts` | Final current release route smoke and non-Rachi public user fixture proof remain. | Public Discovery Release Smoke |
| 5. Profile / Chi'lly Circle / Chi'lly Chat | Partial | P1 | Yes before broad social launch | `/tmp/chillywood-profile-production-ui-proof-20260525/`, `/tmp/chillywood-profile-viewer-state-proof-20260525/`, `/tmp/chillywood-profile-social-interaction-proof-20260525/`, `/tmp/chillywood-profile-photo-picker-proof-20260529/` | `app/profile/[userId].tsx`, `components/ProfileSocialFeedCard.tsx`, `_lib/profileMedia.ts`, `_lib/friendGraph.ts`, `_lib/chat.ts`, `_lib/socialAttachments.ts` | Avatar/background save/read-back/remove/public masking, full second-account, blocked/private fixtures remain. | Profile Media And Privacy Fixture Runtime Closeout |
| 6. Platform / Platform Studio | Partial-ready | P1 | No for controlled test | `/tmp/chillywood-home-profile-cleanup-proof-20260529/`, `/tmp/chillywood-profile-viewer-state-proof-20260525/`, `/tmp/chillywood-brand-review-closeout-20260524/` | `app/channel/[userId].tsx`, `app/channel-studio/index.tsx`, `app/channel-settings.tsx`, `docs/PLATFORM_BRAND_STUDIO.md` | Final release candidate owner/public Platform route smoke and draft/private non-leak confirmation remain. | Platform Release Smoke And Draft Non-Leak Proof |
| 7. Creator video / upload / playback | Partial | P1 | Yes if creator upload is public | `docs/PUBLIC_V1_READINESS_CHECKLIST.md`, earlier creator media proof, VOD guard passed | `_lib/creatorVideos.ts`, `app/channel-settings.tsx`, `app/player/[id].tsx`, `supabase/functions/media-storage`, `supabase/functions/public-creator-video-cards` | Upload/playback lifecycle has proof, but current release smoke and real VOD rendition/quality enforcement proof remain. | Creator Media Release Smoke And VOD Rendition Proof |
| 8. Clip Studio Lite | Partial | P2 | No | `docs/CLIP_STUDIO.md`, guard passed | `app/channel-settings.tsx`, `_lib/clipStudio.ts`, `supabase/migrations/202605240008_creator_clip_studio_metadata.sql`, `202605250001_creator_clip_studio_title_templates.sql` | Save Draft/title/template metadata is backed; real trim/export/burn-in renderer is deferred. | Clip Studio Runtime Polish, post-launch |
| 9. Brand Studio | Partial-ready | P1/P2 | No for controlled test | `docs/PLATFORM_BRAND_STUDIO.md`, `/tmp/chillywood-brand-review-closeout-20260524/`, guard passed | `app/channel-settings.tsx`, `_lib/platformBranding.ts`, `app/channel/[userId].tsx`, brand migrations `202605240001` through `202605240007` | Brand assets are reviewed/published safely; Hero Reel/watermark and automatic cleanup remain deferred. | Brand Studio Runtime Regression Smoke |
| 10. Live Watch-Party / Watch-Party Live / Party Room | Partial | P1 | Yes if broad live launch is claimed | `/tmp/chillywood-watch-party-live-audio-mix-proof-20260526/`, LiveKit/old-room guards passed | `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, `app/watch-party/live-stage/[partyId].tsx`, `app/player/[id].tsx`, `supabase/functions/livekit-token/index.ts` | Two-device speech ducking, reconnect, current release live route smoke, and sustained room proof remain. | Two-Device Live And Watch-Party Release Proof |
| 11. Spectator | Partial | P1 | Yes if Spectator live reaction is promoted | `/tmp/chillywood-spectator-child-room-proof-20260526/`, `/tmp/chillywood-spectator-live-stage-replay-proof-20260526/`, guard passed | `app/spectate/[itemId].tsx`, `_lib/spectatorPlayback.ts`, `supabase/functions/spectator-playback`, `supabase/functions/spectator-start-room` | True live-stage-compatible Live Watch-Party / Reaction source fixture remains unavailable. | Spectator Live Reaction Fixture Closeout |
| 12. Rachi | Partial-ready | P2 | No | `/tmp/chillywood-rachi-official-proof-20260526/`, `/tmp/chillywood-rachi-originals-proof-20260526/`, guard passed | `docs/RACHI_OFFICIAL_ACCOUNT.md`, `_lib/officialRachi.ts`, `_lib/officialAccounts.ts`, `app/profile/[userId].tsx`, `app/channel/[userId].tsx`, `app/(tabs)/index.tsx`, `app/admin.tsx` | Rachi public identity and fixture are backed; visible moving Player frame and Rachi profile-picture save/clear remain polish proof. | Rachi Media Polish Proof |
| 13. Money Center / Provider readiness | Partial | P1 | Yes for monetized launch; no for no-money controlled test | Money proof paths listed above; money/provider/payment guards passed | `app/channel-settings.tsx`, `app/admin.tsx`, `_lib/moneyFeatureFlags.ts`, `_lib/providerReadiness.ts`, `_lib/moneyAuditEvents.ts`, money/provider migrations/functions | RevenueCat/Google signed webhooks and provider permissions remain setup-required; live money stays off. | RevenueCat/Google Signed Sandbox Proof |
| 14. Admin / Owner Security | Partial-ready | P1 | No for public users if gates hold | `/tmp/chillywood-admin-denial-ia-drilldown-proof-20260529/`, `/tmp/chillywood-admin-main-tabs-ui-ux-audit-proof-20260529/`, Admin guards passed | `app/admin.tsx`, `_lib/adminSearchAudit.ts`, owner/admin migrations/functions | API/RLS denial passed; Android normal-user Admin panel denial and broader safe user/usage/system read models remain. | Normal-User Admin Denial And Admin Read Models |
| 15. Reports / moderation / legal | Partial, repo-side tooling closed | P1 external ops; scanner P2/future unless reclassified | Yes for broad launch, no for controlled Android testing with assigned reviewer | `docs/legal/LEGAL_LAUNCH_CHECKLIST.md`, public legal site docs, DMCA proof in current docs, `/tmp/chillywood-blocker8-moderation-legal-closeout-20260529/source-proof.log`, `docs/security/MALWARE_SCANNING_READINESS_PLAN.md` | `app/copyright-report.tsx`, `app/copyright.tsx`, `app/moderation-policy.tsx`, `app/support.tsx`, `legal/policies.mjs`, `_lib/moderation.ts`, `app/admin.tsx`, `components/safety/report-sheet.tsx`, `components/profile/profile-media-sheets.tsx`, `supabase/migrations/202605220005_reports_backend_completion.sql`, `202605220006_reports_client_insert_guard.sql`, `202605260002_profile_media_status_policy.sql` | Repo-side report lifecycle and Profile media moderation are backed. Remaining blockers are attorney review, Play/legal acceptance, support/account deletion SLA, outbound email/DKIM, and optional disposable-fixture visual lifecycle proof. Automated malware scanning is not configured or claimed and is not blocking controlled Public V1. | Store Legal Account Deletion Acceptance Closeout |
| 16. Push notifications / email / support | Partial | P1 | No for closed test; yes for broad ops readiness | `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`, current notification proof in readiness checklist | `_lib/notifications.ts`, `app/settings.tsx`, `components/system/support-screen.tsx`, `supabase/functions/notification-dispatch` | Android push has prior proof; release-candidate notification smoke, support SLA, and outbound DKIM remain. | Release Notifications And Support Ops Smoke |
| 17. Storage / Supabase / RLS | Ready with proof gaps | P1 final proof | No current blocker found | Command log, migration list, linked lint, dry-run | `supabase/migrations/*`, `supabase/functions/*`, `supabase/database.types.ts`, storage helpers | No linked lint/dry-run issue found; final privacy fixture proof and release log audit still required. | Final RLS/Storage Privacy Fixture Audit |
| 18. Performance / UI polish | Partial | P1/P2 | Yes for broad release only if release smoke fails | Existing `/tmp` proof paths and docs | Main app routes, `docs/APP_UI_UX_RULES.md`, Firebase/logger helpers | Current UI is improved, but release diagnostics, vitals, Crashlytics/Performance receipt, large-font/safe-area smoke, and log audit remain. | Release Candidate Performance And Log Audit |

## Validation Commands

All commands below passed with status `0` in both `/tmp/chillywood-public-v1-readiness-20260529/commands.log` and the May 29 eight-blocker burn-down validation log `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/full-validation.log`:

- `git status --short`
- `git log --oneline -5`
- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:profile-production-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:rachi-official-policy`
- `npm run guard:content-rights-policy`
- `npm run guard:vod-quality-policy`
- `npm run guard:navigation-terminology-policy`
- `npm run guard:admin-search-policy`
- `npm run guard:public-user-search-policy`
- `supabase migration list`
- `supabase db lint --linked --schema public --fail-on error`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

## Proof Paths Referenced

- `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/`
- `/tmp/chillywood-admin-denial-ia-drilldown-proof-20260529/`
- `/tmp/chillywood-admin-main-tabs-ui-ux-audit-proof-20260529/`
- `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/`
- `/tmp/chillywood-explore-people-search-proof-20260529/`
- `/tmp/chillywood-home-continue-watching-proof-20260529/`
- `/tmp/chillywood-home-profile-cleanup-proof-20260529/`
- `/tmp/chillywood-profile-photo-picker-proof-20260529/`
- `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/`
- `/tmp/chillywood-profile-viewer-state-proof-20260525/`
- `/tmp/chillywood-profile-production-ui-proof-20260525/`
- `/tmp/chillywood-profile-social-interaction-proof-20260525/`
- `/tmp/chillywood-spectator-child-room-proof-20260526/`
- `/tmp/chillywood-spectator-live-stage-replay-proof-20260526/`
- `/tmp/chillywood-rachi-official-proof-20260526/`
- `/tmp/chillywood-rachi-originals-proof-20260526/`
- `/tmp/chillywood-admin-money-center-proof-20260527/`
- `/tmp/chillywood-money-audit-explorer-proof-20260527/`
- `/tmp/chillywood-provider-cli-proof-20260527/`
- `/tmp/chillywood-money-center-android-refresh-proof-20260527/`
- `/tmp/chillywood-watch-party-live-audio-mix-proof-20260526/`

## Next Recommended Lane

Run **Store Legal Account Deletion Acceptance Closeout** first, while keeping Profile media manual runtime proof as the next owner-device follow-up.

Scope:

- finish Play Console listing/content rating/Data Safety/account-deletion acceptance
- get attorney/legal approval for launch policies, account deletion, copyright/DMCA, support, moderation, and data safety claims
- confirm support/account-deletion ownership, SLA, and operational inbox routing
- confirm the human moderation/support owner and the external operational playbook for reports, profile-media reports, DMCA, appeals, and account deletion
- keep release diagnostics/log-redaction and signed-out/signed-in route smoke as the next engineering follow-up
- let the owner finish Profile media picker/save/read-back/remove/fallback manually with safe app-owned assets
- do not activate live money
- do not add new features

After that, close Profile media save/read-back and privacy fixtures, Watch-Party two-device proof, Spectator live-compatible fixture proof, and RevenueCat/Google signed sandbox proof only when their required accounts/devices/provider access exist.
