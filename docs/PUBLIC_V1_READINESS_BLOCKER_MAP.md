# Public V1 Readiness Blocker Map

Date: 2026-05-29
Lane: Public V1 Readiness Blocker Map
Starting HEAD: `5ed7db5` (`Consolidate Admin IA and drilldowns`)
Branch at audit start: `main...origin/main`

## Summary

Current status: **partial**.

Chi'llywood is safe enough for continued controlled Android testing when live money remains off, claims stay honest, and testers understand that several fixture/release proof gaps remain. It is **not ready for broad public launch** until release-build proof, store/legal acceptance, final account deletion process ownership, and selected runtime fixture gaps are closed.

No P0 code/security failure was found in this audit. The current hard launch blockers are release/store/legal proof blockers rather than newly discovered app-code regressions.

Counts in this map:

- P0 blockers: 2
- P1 blockers: 12
- P2 deferrals: 10

Command proof:

- Full command log: `/tmp/chillywood-public-v1-readiness-20260529/commands.log`
- All required commands returned status `0`.
- `supabase db lint --linked --schema public --fail-on error` reported no schema errors.
- `supabase db push --dry-run` reported the remote database is up to date.
- `git status --short` showed only `?? artifacts/` and `?? supabase/.temp/`.

Android proof posture:

- Device available during audit: `R5CR120QCBF`.
- This docs lane references current proof instead of creating new screenshots.
- Current proof paths are listed below per area.
- Missing screenshots are not claimed.

## Top 10 Launch Blockers

1. **P0 - Current release candidate proof is missing.** A current `main` Play-style AAB/APK install plus app-open and route smoke must be captured before public release.
2. **P0 - Store/legal acceptance is not complete.** Attorney/legal approval, Play Data Safety, account deletion URL acceptance, listing/content rating, and final support/account-deletion ownership remain external blockers.
3. **P1 - Profile media runtime closure is incomplete.** Avatar/background picker opens, but save/read-back/remove/fallback/public masking still needs a safe app-owned asset and owner/backend proof.
4. **P1 - Second-account, blocked, and private runtime fixtures remain incomplete.** API/static proof exists, but full runtime fixture proof must not be faked.
5. **P1 - Broad current route smoke is referenced, not freshly captured in this lane.** A final release-candidate route sweep is still required.
6. **P1 - Watch-Party Live two-device speech/reconnect proof remains incomplete.** Single-device controls are proved; true remote speech ducking needs two joined devices/accounts.
7. **P1 - Spectator Live Watch-Party / Reaction needs a true compatible source fixture.** Replay and Watch-Party Live child room are proved; VOD/replay must not be relabeled as live.
8. **P1 - Provider setup remains sandbox/setup-only.** RevenueCat/Google signed webhook proof and external provider permissions/secrets remain incomplete for broad monetized launch.
9. **P1 - Moderation/legal ops have remaining runtime/ops gaps.** Attorney review, automated malware scanning, outbound email automation, richer general report lifecycle proof, and profile-media admin review tooling remain pending.
10. **P1 - Release diagnostics/logging proof remains pending.** Firebase Crashlytics/Performance, production log redaction, Android vitals/pre-launch report, and release log audit must be run on the release candidate.

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

- No fresh release-candidate AAB/APK plus full app-open route smoke was captured in this audit.
- Play Console listing, content rating, Data Safety, account deletion acceptance, and final store assets are not complete.
- Attorney/legal approval remains required for launch policy text and support/account-deletion process.
- Profile media save/read-back/remove/fallback and public masking runtime proof remains open.
- Safe second-account, blocked, and private runtime fixtures are not complete.
- Release diagnostics/logging, Firebase Crashlytics/Performance receipt, and Android vitals/pre-launch proof remain pending.
- RevenueCat/Google provider webhook proof and production monetization setup remain incomplete; live money must stay off.
- Live/Watch-Party two-device and Spectator live-reaction fixture proof remain incomplete.

## Android-Only Release Readiness

Status: **partial, launch-blocked for broad public release**.

Evidence:

- App identity exists in `app.json`: app name `Chi'llywood`, package `com.chillywood.mobile`, scheme `chillywoodmobile`, icon/splash/adaptive icon assets.
- `eas.json` has `production` App Bundle and `production-apk` internal APK profiles.
- Google Play package/developer verification is recorded complete in `docs/ANDROID_RELEASE_EAS_RUNBOOK.md`.
- Earlier EAS/Internal Test purchase proof exists for versionCode 3, but this audit did not build or install a current release candidate from `5ed7db5`.
- Current device proof is referenced from `/tmp`, not freshly captured here.

Launch blocker:

- Build/install/open current release candidate and capture Home, Explore, Library, Live, Profile, Platform, Studio, Player, Watch-Party, Spectator, Money Center, Admin, Rachi, Search, Settings, legal/support, and signed-out/signed-in handoffs.

Recommended next lane:

- Android Release Candidate Build And Route Smoke Proof.

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
| 1. App launch / Android release | Partial | P0/P1 | Yes | `docs/ANDROID_RELEASE_EAS_RUNBOOK.md`, `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md`, existing `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/` | `app.json`, `app.config.ts`, `eas.json`, Android package `com.chillywood.mobile` | Current release-candidate AAB/APK build/install/open and full route smoke were not captured in this lane. | Android Release Candidate Build And Route Smoke Proof |
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
| 15. Reports / moderation / legal | Partial | P0/P1 | Yes | `docs/legal/LEGAL_LAUNCH_CHECKLIST.md`, public legal site docs, DMCA proof in current docs | `app/copyright-report.tsx`, `app/copyright.tsx`, `app/moderation-policy.tsx`, `app/support.tsx`, `legal/policies.mjs`, report/admin migrations/functions | Attorney review, Play/legal acceptance, support/account deletion SLA, automated malware scanning/outbound email, and richer report lifecycle proof remain. | Legal Store Acceptance And Moderation Ops Closeout |
| 16. Push notifications / email / support | Partial | P1 | No for closed test; yes for broad ops readiness | `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`, current notification proof in readiness checklist | `_lib/notifications.ts`, `app/settings.tsx`, `components/system/support-screen.tsx`, `supabase/functions/notification-dispatch` | Android push has prior proof; release-candidate notification smoke, support SLA, and outbound DKIM remain. | Release Notifications And Support Ops Smoke |
| 17. Storage / Supabase / RLS | Ready with proof gaps | P1 final proof | No current blocker found | Command log, migration list, linked lint, dry-run | `supabase/migrations/*`, `supabase/functions/*`, `supabase/database.types.ts`, storage helpers | No linked lint/dry-run issue found; final privacy fixture proof and release log audit still required. | Final RLS/Storage Privacy Fixture Audit |
| 18. Performance / UI polish | Partial | P1/P2 | Yes for broad release only if release smoke fails | Existing `/tmp` proof paths and docs | Main app routes, `docs/APP_UI_UX_RULES.md`, Firebase/logger helpers | Current UI is improved, but release diagnostics, vitals, Crashlytics/Performance receipt, large-font/safe-area smoke, and log audit remain. | Release Candidate Performance And Log Audit |

## Validation Commands

All commands below passed with status `0` in `/tmp/chillywood-public-v1-readiness-20260529/commands.log`:

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

Run **Android Release Candidate Build And Route Smoke Proof** first.

Scope:

- build/install a current release-like Android artifact from current `main`
- capture app launch, legal/settings/support, Home, Explore, Library, Live, Profile, Platform, Platform Studio, Player, Watch-Party Live, Live Watch-Party where available, Spectator, Money Center, Admin, Rachi, Search, signed-out and signed-in handoffs
- run release logging/redaction checks
- do not activate live money
- do not add new features

After that, close Profile media save/read-back and privacy fixtures, then store/legal acceptance.
