# Public V1 Readiness Blocker Map

Date: 2026-05-29
Lane: Public V1 Readiness Blocker Map
Starting HEAD: `5ed7db5` (`Consolidate Admin IA and drilldowns`)
Branch at audit start: `main...origin/main`

## Summary

Current status: **partial**.

Chi'llywood is safe enough for continued controlled Android testing when live money remains off, claims stay honest, and testers understand that several fixture/release proof gaps remain. It is **not ready for broad public launch** until release-build proof, store/legal acceptance, final account deletion process ownership, and selected runtime fixture gaps are closed.

No P0 code/security failure was found in this audit. The current hard launch blockers are release/store/legal proof blockers rather than newly discovered app-code regressions.

Counts after the May 30, 2026 media malware-scanning production closeout:

- P0 blockers: 1
- P1 blockers: 10
- P2 deferrals: 10

Blocker 8 follow-up on May 29, 2026 closed the stale repo-side moderation tooling gap. General safety reports, report status updates, target hide/remove/restore, immutable report audit rows, DMCA intake/counter-notice tooling, public legal/support routes, and Profile media report/admin hide/remove/restore paths are backed in code and migrations. The May 30 scanner follow-up adds and proves a real repo-side media malware scanning pipeline: `media_scan_jobs`, service-role claim/complete RPCs, upload/update triggers, public-safe scan gates, a DMCA enqueue-loop fix, and a ClamAV worker under `ops/malware-scanner-worker/`. Runtime proof in `/tmp/chillywood-malware-scanner-runtime-proof-20260530/` used temporary private `dmca-evidence` objects against the linked Supabase project, read back `clean` for a benign object and `malware_detected` for EICAR, then deleted both proof objects and scan jobs. Production proof in `/tmp/chillywood-malware-scanner-production-proof-20260530/` deployed `chillywood-malware-scanner` on `chillywood-prod-01`, proved benign/EICAR processing in that runtime, and proved the Admin scan-result read model returns sanitized rows without storage paths or secrets. This does not add a second P0 beyond the existing store/legal/account-deletion acceptance blocker.

Store Legal Account Deletion Ops closeout on May 29, 2026 mapped the remaining external side without claiming acceptance. Public legal URLs for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Community Guidelines, Creator Rules, Moderation Policy, and Premium Terms returned HTTP 200 after redirects. DNS proof shows Cloudflare MX, SPF, and DMARC baseline records for `chillywoodstream.com`; common DKIM selectors did not return a DKIM record, so DKIM remains unverified until a real outbound provider is configured. The closeout added:

- `docs/legal/STORE_LEGAL_ACCOUNT_DELETION_ACCEPTANCE_CLOSEOUT.md`
- `docs/legal/OUTBOUND_EMAIL_DKIM_RUNBOOK.md`
- `docs/security/MALWARE_SCANNING_READINESS_PLAN.md`

After the May 30 malware-scanning production closeout, the updated status is P0 blockers: 1, P1 blockers: 10, P2 deferrals: 10. The P0 remains external Play/Data Safety/account-deletion/legal acceptance, not an app-code security defect.

Google Play Data Safety Account Deletion Acceptance Closeout on May 30, 2026 added the owner/operator execution package without claiming external acceptance:

- `docs/google-play/PLAY_CONSOLE_EXECUTION_CHECKLIST.md`
- `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md`
- `docs/google-play/ACCOUNT_DELETION_URL_CONTENT.md`
- `docs/google-play/REVIEWER_ACCESS_INSTRUCTIONS.md`
- `docs/google-play/STORE_LISTING_ASSET_CHECKLIST.md`

Proof lives at `/tmp/chillywood-google-play-acceptance-closeout-20260530/`. Public legal/support URLs returned HTTP 200 after redirects for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Moderation Policy, Community Guidelines, and Creator Rules. Android proof on `R5CR120QCBF` captures Settings Legal and Support, Privacy, Terms, Account Deletion, Copyright Report, and Moderation Policy. The direct Support deep link did not resolve in that proof, so the May 29 release proof remains the current visual Support route reference. The P0 count stays 1 until Play Console accepts the Data Safety/account deletion/content-rating/listing entries and the owner/legal operator approves the legal and operational claims.

Google Play Console Field-By-Field Completion Assistant on May 30, 2026 added the operator-facing completion packet:

- `docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md`
- `docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md`
- `docs/google-play/CONTENT_RATING_QUESTIONNAIRE_PREP.md`
- `docs/google-play/RELEASE_UPLOAD_CHECKLIST.md`

`docs/google-play/STORE_LISTING_ASSET_CHECKLIST.md` is also updated with draft listing copy, asset gaps, version fields, and release artifact boundaries. The packet covers the Play Console fields for App details, Store listing, Category, Contact details, Privacy Policy, App access, Ads, Content rating, Target audience, News declaration, Data Safety, Account deletion, UGC/moderation, financial/in-app purchases, sensitive permissions, release notes, closed testing, app bundle upload, and reviewer instructions. It does not claim external completion. Consistency findings before submission: existing public legal policy source still contains some historical creator-surface wording to review against current `Platform` terminology, Firebase/RevenueCat/Google Play final collection/provider state needs owner confirmation for Data Safety, the direct Support route should be recaptured, Ads should be declared "No ads" only if the owner confirms no ad SDK/ad delivery/paid placement in the submitted build, and final Play upload still needs owner-approved upload signing despite fresh current-HEAD local build proof. The P0 count stays 1.

Fresh Current-HEAD AAB Play Upload Proof on May 30, 2026 closed the current local release-build/install/open evidence gap from `main` HEAD `12c97e56de6bb0a5f435f1c9aa81742f700af4dc` without claiming Play submission. Proof lives at `/tmp/chillywood-current-head-play-upload-proof-20260530/`. The successful high-memory local Gradle build produced APK `android/app/build/outputs/apk/release/app-release.apk` (`205639147` bytes / `196M`, SHA-256 `abc67ba63c4679ca005d9b3fcb9dc2a5286dd74c48525f1580c7d1ea94f5ed33`) and AAB `android/app/build/outputs/bundle/release/app-release.aab` (`132125002` bytes / `126M`, SHA-256 `57f8f8da17f21959ef7d3f4abb661fad5135757caa277d2b9a03ddec192ad199`), package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `8`, targetSdk `36`. The APK installed on `R5CR120QCBF`, opened past splash, and route smoke captured Home, Explore loaded, Live, Library, Profile/avatar entry, Settings/legal area, Player, Platform Studio, Money Center, and Admin with zero app-specific fatal/ANR crash-scan matches. Signing boundary: local Gradle `release` still uses `signingConfigs.debug`, and signing proof shows `CN=Android Debug`. This closes current-HEAD artifact freshness and APK install/open proof, but actual Play upload still needs owner-approved EAS/Play upload signing or a corrected release signing config unless the owner confirms the current certificate is accepted for the Play app. The P0 count stays 1 because Play/Data Safety/account-deletion/legal acceptance remains external.

May 31, 2026 Profile media code-side reliability hardening closes the obvious upload implementation gap but not the runtime proof gap. Profile Photo/Profile Background now stage Android `content://` picks to cache when needed, upload through Supabase Storage REST with SDK fallback, and verify a signed read-back before updating Profile fields. The picker uses the non-legacy phone photo-library surface with native editing disabled because the Android cropper was broken; Chi'llwood shows an in-app review sheet with real preview plus Fill/Fit/Center choices before saving. Brand Studio now separates `Preview Platform` reviewed-public view from owner-only `Preview Brand Draft`; public Platform still hides draft/pending/unsafe Brand Studio media. The P1 Profile media blocker remains partial until current-build Android save/read-back/remove/fallback proof with safe non-private assets is captured.

May 31, 2026 Brand Studio Platform one-device route proof on `R5CR120QCBF` verified the current reviewed-public and owner-draft Platform paths. Normal `Preview Platform` opened the public Platform and kept pending-review Brand Studio visuals off the public view; owner-only `Preview Brand Draft` opened Platform with the saved draft Brand Studio visual and draft-preview context. Route smoke covered Home, Explore, Live, and Library; the pass found and fixed a user-facing `chillywoodmobile://library` unmatched-route bug by adding a compatibility redirect to the real Library tab at `/(tabs)/my-list`, with `/home` redirecting to Home. Proof lives at `/tmp/chillywood-brand-studio-platform-one-device-proof-20260531/`. This lowers route-alias risk but does not close the broader P1 signed-out/signed-in full route sweep or non-owner Brand draft-access proof.

June 1, 2026 Premium sandbox regression proof after guard restore restored the Premium guard posture and keeps provider claims bounded. The old shippable `PREMIUM_LIVE_GATE_PROOF_HOLD` bypass is removed, strict Premium gates no longer treat owner setup access as Premium entitlement, creator upload/Platform Studio/Brand Studio/Clip Studio/Watch-Party Live/Live Watch-Party host paths are gated again, and backend creator-tool enforcement was added. The initial guard-restore config check found only the Android debug RevenueCat public SDK key and `validate:runtime` correctly reported `revenueCatAndroidPublicKeyConfigured: false`; the later production-key proof below supersedes that key blocker. Sandbox Premium purchase/restore was not faked or claimed; it remains blocked on a safe Google Play licensed tester path, RevenueCat/Google product dashboard proof, a matching uploaded build, and intentionally opening the Premium purchase shell for bounded proof. Money/tickets/seats/tips/paid content/payouts remain off/setup-only.

June 1, 2026 RevenueCat Android production-key follow-up confirmed the approved public wiring and local public key configuration. Current-source Android release APK built and installed on `R5CR120QCBF`; proof at `/tmp/chillywood-premium-sandbox-key-proof-20260601/` captures validation true, env presence without values, forced release-bundle key occurrence proof, Subscribe inactive/setup-unavailable state, and Money Center setup/not-active state with no payable balance. New `guard:premium-sandbox-policy` locks no Premium bypass, no owner setup access as strict Premium entitlement, active/user-specific backend entitlement behavior, money-off switches, no fake tickets/seats, no fake Premium, and no Stripe Android digital checkout. The RevenueCat/Google blocker is now purchase/provider proof: confirm RevenueCat/Google product mapping and licensed tester access, intentionally open the Premium purchase shell for a bounded sandbox run, then rerun purchase/restore proof.

June 1, 2026 RevenueCat Google Play sandbox purchase/restore follow-up at `/tmp/chillywood-revenuecat-google-sandbox-premium-proof-20260601/` confirms the blocker remains external/app-shell bounded, not a fake-success path. `validate:runtime` reports `revenueCatAndroidPublicKeyConfigured: true`; Subscribe showed Premium inactive and purchase temporarily unavailable; Restore purchases completed with `Premium is not active`; Money Center stayed setup/readiness-only with no payable balance; Watch-Party entry remained Premium-gated. Purchase was not run or claimed because the purchase shell remains on hold and the current installed proof build is not proved as Play-internal-track installed/signed with a licensed tester and active RevenueCat/Google product mapping. The remaining provider blocker is: Play-installed matching build, licensed tester account, verified RevenueCat entitlement/offering/product mapping, intentionally opened purchase shell, and backend entitlement sync/read-back proof.

June 1, 2026 Play-installed proof check sharpened that blocker: `R5CR120QCBF` reports `installer=null` for `com.chillywood.mobile`, local APK signing is `CN=Android Debug`, and no in-session Play Console/internal-track or RevenueCat dashboard mapping proof was available. The purchase shell stayed on hold. This is the correct safe result until an owner-approved Play-signed/internal-test build is installed from Play with a licensed tester.

Command proof:

- Fresh current-HEAD release proof folder: `/tmp/chillywood-current-head-play-upload-proof-20260530/`
- Brand Studio/Platform one-device route proof folder: `/tmp/chillywood-brand-studio-platform-one-device-proof-20260531/`
- Full command log: `/tmp/chillywood-public-v1-readiness-20260529/commands.log`
- Eight-blocker burn-down validation log: `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/full-validation.log`
- Store/legal/account-deletion ops proof folder: `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/`
- Google Play execution package proof folder: `/tmp/chillywood-google-play-acceptance-closeout-20260530/`
- Malware scanner runtime proof folder: `/tmp/chillywood-malware-scanner-runtime-proof-20260530/`
- Malware scanner production/Admin review proof folder: `/tmp/chillywood-malware-scanner-production-proof-20260530/`
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
| 1. Current release Android AAB/APK build/install/open proof | Partial, current-HEAD local build/install/open route-smoke portion closed | P1 release signing / diagnostics / broader account-state smoke | No for controlled Android test | Yes until Play-upload signing and final diagnostics are proved | Fresh current-HEAD proof: APK 196M sha256 `abc67ba63c4679ca005d9b3fcb9dc2a5286dd74c48525f1580c7d1ea94f5ed33`; AAB 126M sha256 `57f8f8da17f21959ef7d3f4abb661fad5135757caa277d2b9a03ddec192ad199`; install `Success` on `R5CR120QCBF`; route screenshots in `/tmp/chillywood-current-head-play-upload-proof-20260530/android/` | Local Gradle release is debug-signed (`CN=Android Debug`). Use owner-approved EAS/Play upload signing or corrected release signing before actual Play upload; full signed-out/signed-in route sweep, release diagnostics/log-redaction, Crashlytics/Performance/vitals proof remain |
| 2. Store/legal/account-deletion acceptance | Partial | P0 | Yes for public distribution | Yes | Public legal URLs returned 200 in `public-legal-url-check.tsv`; in-app Settings, Support, Account Deletion, Privacy, Terms, Copyright Report, and Moderation Policy routes captured | External Play Console/Data Safety/content-rating/account-deletion acceptance, attorney/legal approval, support/account deletion SLA ownership |
| 3. Profile media save/read-back/remove/fallback proof | Partial | P1 | Yes for media personalization claim | Yes for broad social launch | Owner Profile avatar edit sheet opens; Settings `Profile Appearance` shows Profile Photo/Profile Background; safe app-owned proof assets staged on device in `safe-profile-media-assets-on-device.txt`; proof screenshots `21`, `26`, `30` | User will complete manual picker/save later. Current native picker surfaced Android file picker rather than a gallery-first surface; save/read-back/remove/fallback and public masking are not claimed |
| 4. Second-account, blocked, private runtime fixtures | Blocked | P1 | Yes for broad social proof | Yes | Source/guard proof remains current; no second account credentials or safe blocked/private fixtures were available | Provide owner account, normal viewer account, signed-out state, backend blocked relation, private profile/platform fixture, and owner-session restore path |
| 5. Watch-Party Live two-device/reconnect proof | Blocked | P1 | Yes if broad live launch is promoted | Yes for broad live launch | `adb-devices-for-two-device-proof.txt` shows only `R5CR120QCBF`; current Watch-Party and Live Watch-Party route screenshots captured | Second device/emulator plus second account; prove remote speech ducking/restoration, reconnect, old-room handling, and no route ownership regression |
| 6. Spectator Live Watch-Party / Reaction fixture proof | Blocked | P1 | Yes if Spectator live reaction is promoted | Yes | `48-spectator-t1-route.png` proves unavailable state for ineligible/private metadata; Spectator guard remains current | True public-safe live-stage-compatible source, Reaction source, replay archive, private/ineligible/ended/reuse-disabled fixtures |
| 7. RevenueCat/Google provider proof | Partial | P1 for monetized launch | No while live money/Premium claims stay off | Yes for monetized launch | `provider-secret-name-inventory.txt` shows no RevenueCat/Google webhook secret names; `provider-webhook-smoke.tsv` shows RevenueCat/Google setup-required/fail-closed with no Premium/live-money action; Money Center screenshot shows `Not active`; June 1 key proof shows Android RevenueCat production key configured locally, `validate:runtime` reports `revenueCatAndroidPublicKeyConfigured: true`, release bundle contains the public key after forced regeneration, current-source APK install works, Subscribe is inactive/setup-unavailable because the purchase shell is on hold, the June 1 restore follow-up shows `Premium is not active`, and the Play-installed check shows `installer=null` plus debug signing; Money Center is setup/not-active | Put the Android public SDK key into the approved uploaded-build config; link RevenueCat/Google provider secrets and dashboard permissions server-side; provide safe Play licensed tester account; configure matching product/offering; upload an owner-approved signed AAB; install the matching build from Play internal/closed testing; intentionally open purchase shell for bounded proof; run signed sandbox purchase/restore/webhook proof without granting fake Premium/live money |
| 8. Moderation/legal ops runtime closure | Partial, repo-side moderation tooling and scanner production deployment closed | P1 external ops/legal | No for controlled Android testing with assigned operators; yes if public distribution has no support/moderation owner | Yes until external ops acceptance | Support, Copyright Report, Moderation Policy, Admin Reports tab, and public legal URLs captured; source proof in `/tmp/chillywood-blocker8-moderation-legal-closeout-20260529/source-proof.log`; scanner runtime proof in `/tmp/chillywood-malware-scanner-runtime-proof-20260530/`; scanner production/Admin review proof in `/tmp/chillywood-malware-scanner-production-proof-20260530/`; `docs/security/MALWARE_SCANNING_READINESS_PLAN.md`; migrations `20260530191115_media_malware_scanning_pipeline.sql`, `20260530193203_fix_dmca_scan_enqueue_loop.sql`, and `20260530203440_admin_media_scan_read_model.sql`; `ops/malware-scanner-worker/`; `infra/hetzner/docker-compose.malware-scanner.yml` | Attorney/legal approval, Play/legal acceptance, support/account-deletion SLA ownership, outbound email/DKIM, and optional disposable-fixture report lifecycle/admin-action visual drill |

## Top 10 Launch Blockers

1. **P0 - Store/legal/account-deletion acceptance is not complete.** The repo-side Google Play execution package is ready in `docs/google-play/`, but attorney/legal approval, Play Data Safety, account deletion URL acceptance, listing/content rating, and final support/account-deletion ownership remain external blockers.
2. **P1 - Profile media runtime closure is incomplete.** Owner avatar/settings entry and safe assets are proved, but save/read-back/remove/fallback/public masking still need manual safe-asset proof.
3. **P1 - Second-account, blocked, and private runtime fixtures remain incomplete.** API/static proof exists, but full runtime fixture proof must not be faked.
4. **P1 - Watch-Party Live two-device speech/reconnect proof remains incomplete.** Single-device/current route proof exists; true remote speech ducking needs two joined devices/accounts.
5. **P1 - Spectator Live Watch-Party / Reaction needs a true compatible source fixture.** Ineligible unavailable state is captured; VOD/replay must not be relabeled as live.
6. **P1 - Provider setup remains sandbox/setup-only.** RevenueCat/Google signed webhook proof and external provider permissions/secrets remain incomplete for broad monetized launch.
7. **P1 - Moderation/legal ops still need external acceptance.** Repo-side report lifecycle actions, Profile media moderation, malware scanner runtime proof, production scanner deployment, and Admin scanner review are backed; attorney review, Play/legal acceptance, support/account-deletion SLA, outbound email/DKIM, and optional disposable-fixture visual proof remain.
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

Status: **partial; fresh current-HEAD local build/install/open proof is closed, broad public release still blocked**.

Evidence:

- App identity exists in `app.json`: app name `Chi'llywood`, package `com.chillywood.mobile`, scheme `chillywoodmobile`, icon/splash/adaptive icon assets.
- `eas.json` has `production` App Bundle and `production-apk` internal APK profiles.
- Google Play package/developer verification is recorded complete in `docs/ANDROID_RELEASE_EAS_RUNBOOK.md`.
- Earlier EAS/Internal Test purchase proof exists for versionCode 3.
- The May 30 fresh current-HEAD proof built APK/AAB from `12c97e56de6bb0a5f435f1c9aa81742f700af4dc`, installed the release APK on `R5CR120QCBF`, opened past splash, and captured Home, Explore loaded, Live, Library, Profile/avatar entry, Settings/legal area, Player, Platform Studio, Money Center, and Admin. App-specific crash scan found zero fatal/ANR matches.
- Signing boundary: local Gradle `release` currently uses debug signing; actual Play upload needs the owner-approved Play upload signing path or corrected release signing unless owner confirms the current cert is accepted.

Remaining launch blocker:

- Complete Play-upload signing/external submission acceptance, the full signed-out/signed-in route sweep, release diagnostics/log redaction, Android vitals/pre-launch report, and fixture-backed Profile/media/privacy/live/Spectator proofs.

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

Status: **no new P0 found; release/privacy fixture proof still required**.

Evidence:

- Supabase linked lint passed with no public schema errors.
- Remote dry-run reported the database is up to date.
- Admin Search normal-user API/RLS denial proof is recorded at `/tmp/chillywood-admin-denial-ia-drilldown-proof-20260529/normal-user-api-denial.json`.
- Profile/public Platform guards cover no owner controls to viewers, no public draft/private content, non-active Profile media masking, no Profile Upload CTA, no Mini Platform, and Channel-to-Platform user-facing terminology.
- LiveKit and old-room guards passed.
- Malware scanner runtime proof passed against linked Supabase with temporary private objects, production worker proof passed on `chillywood-prod-01`, and Admin scanner review returned sanitized clean/malware rows; proof lives at `/tmp/chillywood-malware-scanner-runtime-proof-20260530/` and `/tmp/chillywood-malware-scanner-production-proof-20260530/`.

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
| 15. Reports / moderation / legal | Partial, repo-side tooling plus scanner production deployment implemented | P1 external ops/legal | Yes for broad launch, no for controlled Android testing with assigned reviewer/operator | `docs/legal/LEGAL_LAUNCH_CHECKLIST.md`, public legal site docs, DMCA proof in current docs, `/tmp/chillywood-blocker8-moderation-legal-closeout-20260529/source-proof.log`, `/tmp/chillywood-malware-scanner-runtime-proof-20260530/`, `/tmp/chillywood-malware-scanner-production-proof-20260530/`, `docs/security/MALWARE_SCANNING_READINESS_PLAN.md` | `app/copyright-report.tsx`, `app/copyright.tsx`, `app/moderation-policy.tsx`, `app/support.tsx`, `legal/policies.mjs`, `_lib/moderation.ts`, `app/admin.tsx`, `components/safety/report-sheet.tsx`, `components/profile/profile-media-sheets.tsx`, `supabase/migrations/202605220005_reports_backend_completion.sql`, `202605220006_reports_client_insert_guard.sql`, `202605260002_profile_media_status_policy.sql`, `20260530191115_media_malware_scanning_pipeline.sql`, `20260530193203_fix_dmca_scan_enqueue_loop.sql`, `20260530203440_admin_media_scan_read_model.sql`, `ops/malware-scanner-worker/`, `infra/hetzner/docker-compose.malware-scanner.yml` | Repo-side report lifecycle, Profile media moderation, scanner pipeline, linked-Supabase scanner runtime proof, production scanner deployment, and Admin scan-result review are backed. Remaining blockers are attorney review, Play/legal acceptance, support/account deletion SLA, outbound email/DKIM, and optional disposable-fixture visual lifecycle proof. | Store/Legal Ops Acceptance |
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
- `/tmp/chillywood-malware-scanner-runtime-proof-20260530/`
- `/tmp/chillywood-malware-scanner-production-proof-20260530/`

## Next Recommended Lane

Run **Owner Play Console Submission And Release Diagnostics** first, while keeping Profile media manual runtime proof as the next owner-device follow-up.

Scope:

- finish Play Console listing/content rating/Data Safety/account-deletion acceptance using `docs/google-play/`
- get attorney/legal approval for launch policies, account deletion, copyright/DMCA, support, moderation, and data safety claims
- confirm support/account-deletion ownership, SLA, and operational inbox routing
- confirm the human moderation/support owner and the external operational playbook for reports, profile-media reports, DMCA, appeals, and account deletion
- keep release diagnostics/log-redaction and signed-out/signed-in route smoke as the next engineering follow-up
- let the owner finish Profile media picker/save/read-back/remove/fallback manually with safe app-owned assets
- do not activate live money
- do not add new features

After that, close Profile media save/read-back and privacy fixtures, Watch-Party two-device proof, Spectator live-compatible fixture proof, and RevenueCat/Google signed sandbox proof only when their required accounts/devices/provider access exist.
