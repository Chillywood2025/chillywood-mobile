# External Setup Public V1 Checklist

Date: 2026-04-27

Purpose: track everything outside this repository that Chi'llywood needs before a Public v1 launch. This document does not prove that any dashboard, store, hosted policy URL, live secret, or release signing step is complete. It records current repo support, the manual setup still needed, the owner/responsible party, the proof required, and the next action.

Use this checklist with `docs/DASHBOARD_SETUP_COMMAND_CENTER.md`, `docs/PUBLIC_V1_READINESS_CHECKLIST.md`, `docs/PUBLIC_V1_AND_LATER_SYSTEMS_PLAN.md`, `docs/public-v1-release-checklist.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md`.

For dashboard-by-dashboard ownership, login/manual actions, secret placement, proof gates, and the recommended dashboard completion order, start with `docs/DASHBOARD_SETUP_COMMAND_CENTER.md`. This checklist stays as the lane tracker; the command center is the operator map.

## Status Key

- Done: external setup is complete and proof was captured for the launch environment.
- Partial: repo support exists and some external setup appears present, but launch proof is incomplete.
- External Setup Pending: dashboard, console, hosted URL, credential, product, secret, or release-account work must be completed outside the repo.
- Proof Pending: setup may exist, but Public v1 proof has not been captured.
- Blocked: a known setup issue prevents proof or launch until fixed.

## Guardrails

- Do not run live billing/store actions during repo audits.
- Do not print service keys, API keys, signed URLs, Google service API keys, RevenueCat keys, Supabase JWTs, LiveKit secrets, EAS credentials, or keystore details in docs or chat.
- Do not treat hidden buttons as access control. Premium, admin, creator upload, and room access need backend truth.
- Do not mark store, billing, Firebase, Supabase, LiveKit, release signing, or legal URL setup Done from static repo inspection.
- Do not commit local Supabase metadata such as `supabase/.temp/` or Supabase branch metadata unless a repo control file explicitly requires it.
- Do not fake Premium purchases, restore success, account deletion completion, LiveKit production readiness, or policy compliance.

## Read-Only Audit Snapshot

- Repo root: `/Users/loverslane/chillywood-mobile`
- Branch: `main`
- HEAD at audit start: `05f8b78ac87269313a55fa7e06c1dcd8f6780d11`
- Git status at audit start: clean
- No live store/billing actions were run.
- No remote Supabase mutation commands were run.
- No secrets were printed.
- Latest `supabase migration list` shows local and remote aligned through `202604280001_raise_creator_video_movie_upload_limit.sql`; linked remote bucket proof shows `creator-videos.file_size_limit = 5368709120` with expected video MIME types.
- `google-services.json` is present and was checked only for project/package identity, not key contents. It references Firebase project `chillywood-app` and Android package `com.chillywood.mobile`.

## External References

Use current official documentation during actual setup because console requirements change over time:

- Google Play Billing and subscriptions: `https://developer.android.com/google/play/billing`
- RevenueCat Android product setup: `https://www.revenuecat.com/docs/getting-started/entitlements/android-products`
- RevenueCat SDK configuration: `https://www.revenuecat.com/docs/getting-started/configuring-sdk`
- RevenueCat entitlements: `https://www.revenuecat.com/docs/getting-started/entitlements`
- Google Play Data safety: `https://support.google.com/googleplay/android-developer/answer/10787469`
- Google Play account deletion: `https://support.google.com/googleplay/android-developer/answer/13327111`
- Account/legal/Data Safety lane runbook: `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`
- Google Play store listing assets: `https://support.google.com/googleplay/android-developer/answer/1078870`
- Google Play content ratings: `https://support.google.com/googleplay/answer/188189`
- Play Store listing/content rating lane runbook: `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md`
- Android release/EAS signing lane runbook: `docs/ANDROID_RELEASE_EAS_RUNBOOK.md`
- Firebase Crashlytics: `https://firebase.google.com/docs/crashlytics/get-started?platform=android`
- Firebase Performance Monitoring: `https://firebase.google.com/docs/perf-mon/get-started-android`
- Firebase Crashlytics/Performance lane runbook: `docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md`
- Supabase migrations and local development: `https://supabase.com/docs/guides/deployment/database-migrations` and `https://supabase.com/docs/guides/local-development/overview`
- Supabase remote Public v1 lane runbook: `docs/SUPABASE_REMOTE_PUBLIC_V1_RUNBOOK.md`
- LiveKit authentication and networking: `https://docs.livekit.io/frontends/build/authentication/` and `https://docs.livekit.io/transport/self-hosting/ports-firewall/`
- LiveKit production readiness lane runbook: `docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md`
- Expo EAS Build and Play submission: `https://docs.expo.dev/build/introduction/` and `https://docs.expo.dev/submit/android/`

## Checklist

| Area | Current repo status | Dashboard/manual action needed | Owner/responsible person | Proof required | Status | Exact next action |
| --- | --- | --- | --- | --- | --- | --- |
| Google Play Billing product | `react-native-purchases` and `react-native-purchases-ui` are installed. `_lib/revenuecat.ts`, `_lib/monetization.ts`, `_lib/premiumEntitlements.ts`, and `app/subscribe.tsx` own Premium billing UX and entitlement checks. The app does not grant Premium from local-only state. | Create the Google Play subscription product for Chi'llywood Premium, configure base plan/offers, and connect the product to RevenueCat. Confirm product IDs match the RevenueCat offering/entitlement model used by the app. | Product owner plus Play Console/RevenueCat operator. | Internal build purchase starts, product loads, purchase completes, backend entitlement becomes active, and protected routes unlock only after trusted entitlement truth. | External Setup Pending | Follow the Lane 1 runbook below: create the Play subscription product/base plan, connect it to RevenueCat entitlement `premium`, then run license-tester purchase proof. |
| RevenueCat configuration | Runtime config supports `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV`, `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`, and `EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY`. Monetization targets include `premium_subscription`, `premium_live_access`, and `premium_watch_party_access`; later paid content targets remain non-v1. | Configure Android app `com.chillywood.mobile`, Play service credentials, offerings, products, entitlements, and public SDK keys in RevenueCat. | Billing owner. | `/subscribe` shows configured offer, purchase and restore call RevenueCat, active entitlement is reflected by account-owned truth, and missing/expired/revoked states remain blocked. | External Setup Pending | Add the RevenueCat Android public SDK key to release env, keep all Play service credentials in RevenueCat/dashboard storage only, and verify offering `premium` loads in `/subscribe`. |
| Billing restore path | `/subscribe` exposes restore/manage actions through the existing RevenueCat owner and shows honest failure copy when unavailable. | Ensure store account restore is configured and RevenueCat is connected to the Play app. | Billing owner. | Reinstall/login on a second install, tap Restore, validate server/store result, and confirm Premium unlocks only after entitlement refresh. | External Setup Pending | After purchase setup, run restore proof with the same Google license tester and capture screenshots/logs without receipt tokens. |
| Google Play Store listing | `app.json` names the app `Chi'llywood`, version `1.0.0`, Android package `com.chillywood.mobile`, and icons/splash assets under `assets/images`. `eas.json` has a production Android app-bundle profile. `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md` now records draft listing copy, asset gaps, screenshot plan, category guidance, and content-rating prep. | Prepare Play Store app listing, short/full descriptions, screenshots, feature graphic, app category, contact email, privacy policy URL, account deletion URL, content rating, target audience, and tester tracks. | Product owner plus release manager. | Play Console listing checklist passes, internal/closed testing track accepts AAB, policy declarations are accepted. | External Setup Pending | Follow `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md`: approve copy, create icon/feature/screenshot assets, fill content rating/target audience, then upload first production-profile AAB to internal testing after release proof. |
| Google Play Data Safety | Repo has policy pages and support surfaces, but Data Safety answers are a Play Console responsibility. App uses Supabase auth/storage, Firebase, RevenueCat, LiveKit, camera, microphone, and notifications dependencies. The listing/content-rating runbook flags Data Safety consistency issues that must not be contradicted by store copy. | Complete Data Safety with actual data collected/shared, encryption/deletion practices, diagnostics/analytics, account creation/deletion, camera/microphone use, and user-generated content moderation. | Product owner plus privacy/legal reviewer. | Data Safety form is accepted by Play Console and matches app behavior plus third-party SDK use. | External Setup Pending | Use `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md` and `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md` to fill the Play Console Data Safety form, then legal/privacy owner must approve it before submission. |
| Account deletion policy | `app/account-deletion.tsx` exists and `app.config.ts` has fallback hosted URL `https://live.chillywoodstream.com/account-deletion`; Settings links to deletion support. It is an honest request/help flow, not fake automated deletion. The route now includes request status, identity verification, Profile/Channel/upload effects, chat/room/social effects, retained-record categories, subscription caveats, timing placeholders, and backend-runbook requirements. | Confirm public hosted account deletion URL, process owner, response SLA, backend deletion/export policy, and Play Console account deletion declaration. | Product owner plus support/legal owner. | URL is public, opens outside the app, explains delete request flow, and Play Console accepts it. | External Setup Pending | Follow the Lane 2 runbook below and `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`; do not build destructive deletion until the backend retention plan is approved. |
| Legal pages and support | Expanded routes exist for Privacy, Terms, Community Guidelines, Copyright/DMCA, Support, and account deletion. `app.config.ts` has privacy/terms/account deletion fallbacks and supports `EXPO_PUBLIC_SUPPORT_EMAIL`. Privacy, Terms, and account-deletion fallback URLs returned HTTP 200 during the Lane 2 audit. | Legal review, final hosted URLs, final support email/SLA, DMCA/contact process, and support inbox ownership. | Legal/support owner. | Links open in release build, public URLs are reachable, support email/inbox receives a test request, and legal copy is approved. | External Setup Pending | Finalize legal copy, hosted policy URLs, DMCA agent/contact process, support mailbox, and support response expectations, then set release env for privacy, terms, account deletion, and support email. |
| Android permissions and policy declarations | `app.json` requests `CAMERA`, `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`. Live Stage/LiveKit uses camera/microphone. Notification packages are present but push delivery is not a v1 proof target. | Declare camera/microphone purpose in Play Console, privacy copy, and store listing. Confirm any notification/runtime permissions used by release build. | Release manager plus product owner. | Install release build, verify permission prompts are contextual and Play declarations match actual features. | External Setup Pending | Run release build permission smoke and update Play Console declarations before production review. |
| Firebase project and Android config | Firebase packages and config plugins are present. `firebase.json` enables Crashlytics collection/debug settings. `google-services.json` exists for project `chillywood-app` and package `com.chillywood.mobile`. Helpers exist for Crashlytics, Performance, Analytics, and Remote Config. Detailed lane prep now lives in `docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md`. | Verify Firebase project ownership, Android app registration, SHA/package match if required, Crashlytics and Performance dashboard setup, and production data collection posture. | Release manager/Firebase owner. | Internal/release build reports a non-fatal Crashlytics event, Performance traces appear, and dashboards show the expected Android app. | Proof Pending | Follow `docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md`: verify the Firebase Console app, build/install a release-like candidate, and capture dashboard receipt. |
| Firebase Crashlytics | `@react-native-firebase/crashlytics`, `app.config.ts` plugin setup, `_lib/firebaseCrashlytics.ts`, app-shell bootstrap, root error reporting, and dev-only proof helpers exist. | Confirm Crashlytics is enabled in Firebase Console and compatible with the release build type. Approve any forced crash proof before running it. | Firebase owner. | A controlled non-fatal report or approved test crash appears in Crashlytics for `com.chillywood.mobile`. | Proof Pending | Run approved non-fatal proof in an internal/release-like build and save dashboard evidence; run forced crash only with explicit approval. |
| Firebase Performance and analytics/remote config | `@react-native-firebase/perf`, analytics, and remote config packages/helpers exist. `_lib/firebasePerformance.ts` enables collection and emits `app_runtime_bootstrap`; dev-only trace/network probes exist. | Confirm performance monitoring and analytics collection are appropriate for policy disclosures and release environment. | Firebase owner plus privacy owner. | Performance app/screen/custom trace or network metric appears in Firebase; privacy policy/Data Safety mentions applicable diagnostics/analytics behavior. | Proof Pending | Run a short release-candidate Performance proof, then update policy declarations if data collection differs from the runbook. |
| Supabase remote project link | App config and control docs identify the remote project through deployed endpoints. This lane linked the local CLI to project ref `bmkkhihfbmsnnmcqkoly` and created local `supabase/.temp/` metadata that must remain uncommitted. | Confirm project ref/dashboard ownership, keep local `.temp` out of commits, and relink clean checkouts only when needed. | Backend/Supabase owner. | `supabase migration list` shows local/remote alignment, schema has creator media/watch-party columns, and no migration drift exists. | Partial / Proof Pending | Follow `docs/SUPABASE_REMOTE_PUBLIC_V1_RUNBOOK.md`; direct DB lint/schema proof still needs approved remote DB login/admin path. |
| Supabase remote migrations and RLS | Migrations define `videos`, `creator-videos` storage policies and movie-size bucket intent, `safety_reports`, `user_entitlements`, `billing_events`, Watch-Party source fields, and tightened room RLS. Migration `202604280001` raises the `creator-videos` bucket file-size limit to 5 GiB and is applied remotely. Linked DB lint was attempted previously but blocked by remote login password auth. | Re-run safe remote lint/schema proof before launch, then run focused remote API/RLS proof for creator media, storage, reports, entitlements, admin writes, Watch-Party rooms, and anon denial. | Backend/Supabase owner. | Live RLS proof shows owner/non-owner/public/admin/anon behavior exactly matches Public v1 access rules, and creator movie upload is not blocked at 50 MB. | Proof Pending | Configure approved remote DB login path, run `supabase db lint --linked --schema public --fail-on none`, then run focused non-destructive live RLS proof with sanitized artifacts. |
| Supabase storage buckets | Migration creates a private `creator-videos` bucket with owner write/delete, public-or-owner read policy intent, and a 5 GiB per-bucket upload limit. Direct SQL delete is intentionally blocked by Supabase storage protection, so Storage API proof remains separate. | Verify the project Storage global file-size limit is at least 5 GiB, public access is policy-mediated, and Storage API owner delete/remove works. | Backend/Supabase owner. | Owner uploads/removes own object, non-owner cannot overwrite/delete, public reads only public clean videos, draft/hidden/removed sources do not leak, and the original 54.7 MB `Chillywoodtest.mp4` uploads without compression. | Proof Pending | Confirm the Supabase Storage global limit, then run Storage API proof against remote project using real owner/non-owner sessions, not service-role-only SQL. |
| Supabase Edge Functions | `supabase/functions/livekit-token/index.ts` exists and `supabase/config.toml` disables automatic JWT verification for that function because the function validates bearer auth internally. `supabase functions list --project-ref bmkkhihfbmsnnmcqkoly` shows `livekit-token` ACTIVE, version 7. `docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md` now maps the token request/denial proof. | Verify function secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`. | Backend/LiveKit owner. | Authenticated app request receives server URL and participant token; signed-out/malformed requests are rejected; no secrets appear in logs. | Partial / Proof Pending | Verify secrets in Supabase dashboard, then run token request/denial proof from a release-like build using the LiveKit runbook. |
| LiveKit production server | App defaults to `wss://live.chillywoodstream.com`; `infra/hetzner/livekit.env.example` and `docs/hetzner-first-deployment-implementation-spec.md` document a self-hosting scaffold and prior host truth. LiveKit runtime code requests tokens from the Supabase Edge Function; the client does not mint tokens. | Confirm production LiveKit server, domain, TLS, API key/secret, TURN/ICE settings, firewall ports, server health, scaling/monitoring, and retention/logging posture. | LiveKit infrastructure owner. | Two Android devices can join Live First and Live Watch-Party on production LiveKit, reconnect, and avoid stale-room bleed; server health is observable. | Partial / Proof Pending | Follow `docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md`: verify `live.chillywoodstream.com`, token endpoint secrets, host health, then run bounded one-device and two-device proof. |
| LiveKit TURN/domain/TLS | Domain fallback exists in config and the Hetzner spec records prior TLS/Caddy truth, but this lane did not re-prove DNS, WebSocket upgrade, TURN, firewall, or cellular path behavior. | Configure or verify TLS certs, DNS, firewall, UDP/TCP ports, TURN if needed, and any load balancer/proxy settings. | LiveKit infrastructure owner. | Cellular and Wi-Fi devices can establish media, not only local-network proof. | Partial / Proof Pending | Use `docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md` to run DNS/TLS/firewall/TURN checks and record LiveKit connection diagnostics without tokens. |
| Android release build and signing | `eas.json` has development, preview, and production profiles; production builds Android `app-bundle`, sets `cli.appVersionSource: "remote"`, and uses production `autoIncrement: true` for EAS-managed Android build numbers. `app.json` includes package `com.chillywood.mobile`, EAS project id, Expo Updates URL, icon/splash assets, and camera/microphone permissions. The Lane 3 runbook now documents app identity, signing posture, env requirements, native rebuild risks, version strategy, and build commands. | Confirm EAS Android credentials/signing ownership, Play App Signing, remote Android build number state, production env values, release track, and final preview/production build approval. | Release manager. | Current `main` builds successfully with preview and production profiles; the remote EAS Android build number is initialized and higher than any Play-uploaded `versionCode`; production AAB installs or reaches Play internal testing; release route smoke and log audit pass. | External Setup Pending | Follow `docs/ANDROID_RELEASE_EAS_RUNBOOK.md`: verify credentials, initialize/confirm remote EAS Android build number, configure EAS production env, then run preview/production builds after runtime proof lanes are green. |
| Production runtime environment | `scripts/validate-runtime.mjs` now checks base runtime values and supports strict production-env validation. `app.config.ts` reads RevenueCat, LiveKit, legal/support, Firebase config, and `_lib/supabase.ts` now honors runtime Supabase URL/anon config when present. Detailed setup is in `docs/PRODUCTION_ENV_SECRETS_RUNBOOK.md`. | Populate release env for Supabase, RevenueCat, LiveKit token endpoint/server URL, legal/support URLs, beta/public flags, and any Firebase/EAS values. Keep server secrets in Supabase/RevenueCat/Firebase/Google/host secret stores. | Release manager plus system owners. | `npm run validate:runtime` and `CHILLYWOOD_VALIDATE_PRODUCTION_ENV=1 npm run validate:runtime` pass for release environment; release build shows correct endpoints without dev fallbacks. | External Setup Pending | Follow `docs/PRODUCTION_ENV_SECRETS_RUNBOOK.md`, configure EAS production env, then run strict validation immediately before preview/production builds. |
| Production logging and secret safety | Recent route/source logs moved behind dev-only logger. Repo owners already avoid printing signed creator media URLs in Player logs. | Audit release build logs for Supabase JWTs, signed URLs, RevenueCat receipts, LiveKit participant tokens, Firebase keys beyond public config, and service-role secrets. | Release manager plus security owner. | Release candidate log audit shows no secrets/signed URLs and no noisy debug-only operational logs. | Proof Pending | Run bounded release log audit during final smoke. |
| Store submission and final smoke | Public v1 readiness checklist tracks runtime proof lanes. This checklist tracks external prerequisites. | Complete proof lanes, external setup, release build, internal testing, Play Console review, and rollback plan. | Product owner/release manager. | Final route smoke passes on release build: auth, settings, Profile/Channel, creator media, Player, platform Watch-Party, creator-video Watch-Party, Live Stage, Chat, Admin denial, Premium gate, legal/support. | Proof Pending | Do not submit production until proof artifacts exist and `docs/PUBLIC_V1_READINESS_CHECKLIST.md` has no v1 Blocked items. |

## Lane 1 Runbook - Google Play Billing / RevenueCat / Premium

Processed: 2026-04-26

Scope for this lane only:

- Prepare Google Play Billing / RevenueCat / Premium external setup.
- Do not configure paid creator videos, subscriber-only videos, tips, coins, payouts, ads, or paid title access.
- Do not run live store actions from Codex.
- Do not put Play service account JSON, RevenueCat API keys, receipts, purchase tokens, or screenshots containing sensitive account details in the repo.

### Repo-Ready Facts

- Android package/application id: `com.chillywood.mobile`.
- App name/version: `Chi'llywood` / `1.0.0`.
- Billing libraries are installed: `react-native-purchases` and `react-native-purchases-ui`.
- Premium route exists: `app/subscribe.tsx`.
- Billing/runtime owners exist: `_lib/revenuecat.ts`, `_lib/monetization.ts`, and `_lib/premiumEntitlements.ts`.
- Backend entitlement table owner exists: `user_entitlements`.
- Billing event table owner exists: `billing_events`.
- Runtime config reads:
  - `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV`
  - `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`
  - `EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY`
- App-side Public v1 Premium target is:
  - monetization target id: `premium_subscription`
  - RevenueCat offering id: `premium`
  - RevenueCat entitlement id: `premium`
- Later/non-v1 monetization targets are present in code for planning compatibility but must not be enabled as active Public v1 products in this lane:
  - `paid_title_access` / offering `paid-content`
  - `premium_live_access` / offering `premium-live`
  - `premium_watch_party_access` / offering `premium-watch-party`
- `/subscribe` is honest when setup is missing: it reports unavailable/partial setup and does not grant Premium locally.
- `hasPremiumAccess()` and Watch-Party gate helpers read RevenueCat/backend entitlement truth rather than trusting a local-only toggle when subscriptions are enabled.

### Manual Dashboard Steps

1. In Google Play Console, confirm the app exists with package `com.chillywood.mobile`.
2. Upload an internal or closed-test Android build first if Play Console will not allow subscription creation yet. RevenueCat's Android product setup notes that Google Play product setup may require an uploaded APK/AAB before products can be created.
3. In Play Console, open the app and go to Monetize / Products / Subscriptions.
4. Create the Public v1 subscription product for Chi'llywood Premium.
   - Recommended product id: `chillywood_premium_v1`
   - Product name: `Chi'llywood Premium`
   - Entitlement represented: `premium`
   - Do not create paid creator-video, tip, coin, payout, ad, or subscriber-only products in this lane.
5. Add a base plan for the first Public v1 subscription.
   - Recommended base plan id: `monthly-autorenewing`
   - Renewal type: auto-renewing
   - Billing period: monthly unless the product owner chooses a different v1 price strategy
   - Set the launch/test price in required regions.
   - Activate the base plan when ready for testing.
6. Optional: create an introductory offer only if the product owner wants it for Public v1. If used, keep it simple and make sure the RevenueCat package selected by the app still maps to the intended Premium entitlement.
7. Configure Google Play license testers for purchase proof.
8. In RevenueCat, create or verify the Chi'llywood project and Android app for `com.chillywood.mobile`.
9. Connect Google Play to RevenueCat using the approved Play service account / API integration. Store this credential in RevenueCat/Google systems only, not in the repo.
10. Import or add the Google subscription product/base plan in RevenueCat.
    - For newer Google subscription products, RevenueCat may show the product identifier as `<subscription_id>:<base-plan-id>`, for example `chillywood_premium_v1:monthly-autorenewing`.
11. In RevenueCat Product Catalog / Entitlements, create entitlement id `premium`.
12. Attach the Google subscription product/base plan to entitlement `premium`.
13. In RevenueCat Offerings, create or verify offering id `premium`.
14. Add the Premium package to offering `premium`, preferably as the monthly/default package.
15. Mark offering `premium` as the current/default offering if RevenueCat requires it for `getOfferings()` to return the expected package.
16. Copy only the RevenueCat Android public SDK key into the release environment as `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`.
17. If testing debug/dev client against RevenueCat, copy the Android debug public SDK key into the test environment as `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV`.
18. Do not place Play service account JSON, RevenueCat secret API keys, or purchase tokens in `app.config.ts`, `.env` committed files, docs, screenshots, or chat.

### Proof Required Before Marking This Lane Done

Use an internal/closed-test Android build or a release-like build with the correct RevenueCat public SDK key.

1. Sign into Chi'llywood with a normal test account.
2. Open `/subscribe`.
3. Confirm `/subscribe` shows the configured Premium offer, not "No Premium offer is available".
4. Tap Unlock Premium with a Google Play license tester account.
5. Confirm the native Play purchase sheet opens for Chi'llywood Premium.
6. Complete a license-tester purchase with the test payment method that always approves.
7. Confirm RevenueCat customer info shows active entitlement `premium`.
8. Confirm the app shows Premium active for the signed-in Chi'llywood account.
9. Confirm a protected Watch-Party/Premium action unlocks only after entitlement truth refreshes.
10. Reinstall or clear app state, sign into the same Chi'llywood account, tap Restore, and confirm Premium is restored only from store/RevenueCat/backend truth.
11. Test a revoked/expired/canceled state using RevenueCat, Play Console refund/revoke, or Play Billing Lab where appropriate.
12. Confirm missing/expired/revoked/pending entitlement states block Premium access and show honest copy.
13. Confirm signed-out and non-premium users remain blocked from Premium-required Watch-Party flows.
14. Save screenshots/logs under `/tmp/chillywood-premium-billing-proof-*`.
15. Do not save purchase tokens, receipts, service account details, or personal payment details in proof artifacts.

### Stop Conditions

Stop and do not mark Done if:

- Play Console subscription product is missing.
- RevenueCat offering `premium` is missing or empty.
- RevenueCat entitlement `premium` is not attached to the Google subscription product/base plan.
- `/subscribe` still says no Premium offer is available in a release-like build.
- Purchase succeeds in Google Play but RevenueCat entitlement does not become active.
- Restore does not recover a valid active purchase.
- The app unlocks Premium from local-only state, a hidden button, or an untrusted row.
- Any proof artifact would expose secrets, receipt payloads, purchase tokens, or personal payment details.

## Lane 2 Runbook - Account Deletion / Legal URLs / Play Data Safety

Processed: 2026-04-26

Detailed owner doc: `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`

Scope for this lane only:

- Account deletion instructions and support handoff.
- Privacy, Terms, Community Guidelines, Copyright/DMCA, Support, and account deletion URL readiness.
- Google Play Data Safety preparation.
- User-generated-content safety readiness for creator uploads.
- No destructive account deletion or account data mutation.

Repo-ready facts:

- Public legal routes exist for `/privacy`, `/terms`, `/account-deletion`, `/community-guidelines`, and `/copyright`.
- `app/_layout.tsx` allows those legal routes to render publicly without requiring sign-in or full runtime config.
- Settings links to Privacy, Terms, Community Guidelines, Copyright/DMCA, and Request Account Deletion.
- Support links to the same policy/account-help surfaces and can collect signed-in feedback.
- Configured fallback URLs for Privacy, Terms, and Account Deletion returned HTTP 200 in this audit.
- Account deletion is request-based and honest; it does not pretend destructive deletion has completed.
- The account deletion route now explicitly documents impact/retention posture for Profile, Channel, uploaded videos, chat, rooms, billing/subscription records, and moderation/report records.
- A Play Data Safety preparation matrix now exists in `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`.

Manual actions before marking Done:

1. Legal/support owner approves Privacy, Terms, Community Guidelines, Copyright/DMCA, and Account Deletion copy.
2. Product/support owner finalizes support email/URL, support inbox owner, and response SLA.
3. Backend/legal owner approves the deletion/de-identification and retained-record process for Supabase auth, profiles, channels, videos/storage, chat, room records, entitlements/billing events, moderation reports, support rows, notifications/reminders, logs, and backups.
4. Release owner confirms final public URLs are reachable without login where Play requires it.
5. Play Console owner enters Privacy Policy URL.
6. Play Console owner enters Account Deletion URL and confirms the form describes deletion and retained data accurately.
7. Play Console owner fills Data Safety using `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md` plus current SDK/provider disclosures.
8. Play Console owner answers user-generated-content/content-moderation questions using the Community Guidelines, report-abuse, admin/moderation, and DMCA process truth.

Proof required:

- Android release build opens Settings legal/support/deletion links correctly.
- External Privacy, Terms, and Account Deletion URLs open from a non-authenticated browser.
- Support/account deletion request lands in the expected support queue.
- Creator-video report/admin moderation proof passes for user-generated-content safety readiness.
- Play Console accepts Data Safety and account deletion entries.

Stop and do not mark Done if:

- Final legal copy is not approved.
- Account deletion URL is not public or not accepted by Play Console.
- Data Safety answers are not reconciled with Firebase, RevenueCat/Google Play, Supabase, LiveKit, Expo, and app-feature behavior.
- The app claims automated deletion but no backend deletion/de-identification process is built and proved.
- UGC policy/report/moderation/DMCA paths are not available or not proveable.

## Lane 3 Runbook - Android Release Build / EAS Signing Readiness

Processed: 2026-04-26

Detailed owner doc: `docs/ANDROID_RELEASE_EAS_RUNBOOK.md`

Scope for this lane only:

- Android release build configuration.
- EAS build profiles and signing readiness.
- Android package identity and versioning posture.
- Production runtime environment checklist.
- Native dependency rebuild notes.
- Release proof commands and manual EAS/Play steps.
- No full build, Play submission, credential generation, or credential rotation.

Repo-ready facts:

- `app.json` names the app `Chi'llywood` and uses Android package `com.chillywood.mobile`.
- `app.json` sets Expo project id `c384ed57-5454-4e80-81ad-dcc218b8a3c8`, app version `1.0.0`, runtime version policy `appVersion`, scheme `chillywoodmobile`, and Expo Updates URL.
- `eas.json` defines:
  - `cli.appVersionSource`: `remote`
  - `development`: internal dev client on channel `development`
  - `preview`: internal release-like build on channel `preview`
  - `production`: store distribution on channel `production` with Android `app-bundle` and `autoIncrement: true`
  - `submit.production`: present but empty
- EAS CLI was available as `eas-cli/18.8.1`; Expo CLI was available as `54.0.23`.
- The local Expo session was authenticated to the Chi'llywood Expo account during audit.
- `google-services.json` is present and matches Firebase project `chillywood-app` plus Android package `com.chillywood.mobile`; only project/package identity was inspected.
- Recent older production Android EAS builds exist for earlier commits, but current `main` was not release-built in this lane.
- Native build-sensitive dependencies include LiveKit/WebRTC, Firebase, RevenueCat, `expo-document-picker`, `expo-camera`, `expo-notifications`, `expo-video`, `expo-av`, `expo-dev-client`, and `expo-build-properties`.
- `.gitignore` now protects `*.keystore` in addition to other native signing/key patterns.

Manual actions before marking Done:

1. Verify EAS Android credentials with `npx eas-cli credentials --platform android` without printing credential details.
2. Confirm whether EAS-managed signing credentials already exist for `com.chillywood.mobile`.
3. If no credentials exist, decide whether EAS should generate the upload key or whether the release owner will upload an existing Play-approved key.
4. Confirm Google Play App Signing / first-upload requirements in Play Console.
5. Verify the remote EAS Android build number strategy. `cli.appVersionSource` is `remote`, production builds use `autoIncrement: true`, and older builds showed version code `1`. A read-only `build:version:get` check returned `{}` after enabling remote source, so before uploading to Play the release owner must initialize/confirm the remote production build number and ensure it is higher than any Play-uploaded `versionCode`.
6. Configure EAS production env values for Supabase, LiveKit, RevenueCat, legal/support URLs, beta/public-v1 flags, Firebase, and any communication STUN/TURN values that the release build needs.
7. Run `npm run validate:runtime`, `npm run typecheck`, `npm run lint`, `git diff --check`, and `npx expo config --type public` from the intended release env.
8. Run preview build first:
   `npx eas-cli build --platform android --profile preview --non-interactive`
9. After preview proof and external blockers are resolved, run production AAB:
   `npx eas-cli build --platform android --profile production --non-interactive`
10. Upload the AAB to Google Play internal testing manually if it is the first Play upload.
11. Use `npx eas-cli submit --platform android --profile production` only after Play service account/submit setup is proved.

Proof required:

- Preview build from current `main` completes and installs on a physical Android device.
- Production AAB from current `main` completes with release signing credentials.
- Play internal testing accepts the AAB or the exact Play blocker is documented.
- Release route smoke passes: auth, settings/legal/support/account deletion, Profile/Channel, creator media, Player, platform Watch-Party, creator-video Watch-Party, Live Stage, Chat, Admin denial, Premium gate.
- Release log audit shows no signed URLs, LiveKit tokens, Supabase JWTs, purchase receipts, service keys, keystore details, or noisy dev-only logs.
- Camera/microphone permission prompts match Play Store declarations.
- Firebase Crashlytics/Performance proof is run from an internal/release-like build.

Stop and do not mark Done if:

- Current `main` has not been built with preview and production profiles.
- EAS credentials are missing, unknown, or rotated without release-owner approval.
- `versionCode` would collide with an existing Play upload.
- Production runtime env is missing required Supabase, LiveKit, RevenueCat, legal/support, or Firebase values.
- AAB cannot be uploaded to internal testing.
- Route smoke or release log audit fails.
- Any credential, keystore, receipt, token, service key, or signed URL would be exposed in proof artifacts.

## Lane 4 Runbook - Firebase Crashlytics + Performance Proof Prep

Processed: 2026-04-26

Detailed owner doc: `docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md`

Scope for this lane only:

- Firebase project/config readiness for Android package `com.chillywood.mobile`.
- Crashlytics package/plugin/bootstrap readiness.
- Performance package/plugin/bootstrap readiness.
- Privacy/logging posture for Firebase diagnostics.
- Manual Firebase Console proof steps.
- No forced crash, Android runtime proof, Sentry/PostHog re-add, or broad runtime behavior change.

Repo-ready facts:

- `google-services.json` exists and safe identity inspection confirmed Firebase project `chillywood-app`, one Android client, Android package `com.chillywood.mobile`, and present SDK/API-key fields without printing key values.
- `app.config.ts` wires `@react-native-firebase/app`, `@react-native-firebase/crashlytics`, and `@react-native-firebase/perf`.
- `firebase.json` enables Crashlytics auto collection and debug setting.
- `package.json` includes Firebase app, analytics, Crashlytics, Performance, and Remote Config packages.
- `app/_layout.tsx` bootstraps Firebase Analytics, Crashlytics, Performance, and Remote Config.
- `_lib/firebaseCrashlytics.ts` owns Crashlytics bootstrap, user identity, non-fatal reports, dev-only test helpers, and approved forced crash helper.
- `_lib/firebasePerformance.ts` owns Performance bootstrap, `app_runtime_bootstrap`, and dev-only trace/network probes.
- `components/dev/dev-debug-overlay.tsx` exposes monitoring proof buttons only in `__DEV__`.
- Static log audit found no lane-specific issue requiring a code change. Runtime proof and release log audit remain pending.

Manual actions before marking Done:

1. Open Firebase Console and select project `chillywood-app`.
2. Verify the Android app package is `com.chillywood.mobile`.
3. Confirm `google-services.json` came from that Android app.
4. Confirm Crashlytics is enabled and ready to receive reports.
5. Confirm Performance Monitoring is enabled and ready to receive app/trace/network data.
6. Confirm diagnostics, analytics, Performance, user id, and email association posture is approved for Privacy Policy and Play Data Safety.
7. Install a preview or release-like Android build from current `main`.
8. Trigger an approved non-fatal Crashlytics report.
9. Trigger a forced crash only after explicit owner approval, then relaunch the app.
10. Navigate the app enough to emit Performance lifecycle data; use dev/internal probes only if the build supports the dev overlay.
11. Capture Firebase Console screenshots or written proof under `/tmp/chillywood-firebase-proof-*` without private values.

Proof required:

- Crashlytics dashboard shows the approved non-fatal report or forced crash for `com.chillywood.mobile`.
- Performance dashboard shows app-start/screen/custom trace/network data for `com.chillywood.mobile`.
- Release/preview log audit shows no signed media URLs, Supabase JWTs, LiveKit participant tokens, RevenueCat receipts, purchase tokens, service-role keys, Google private credentials, or keystore details.
- Privacy/Data Safety disclosures account for Firebase diagnostics/performance/analytics behavior.

Stop and do not mark Done if:

- Firebase Console project or Android package does not match repo config.
- Crashlytics is still waiting for SDK detection after proof.
- Performance Monitoring is still waiting for SDK/data after proof.
- Proof would require printing or storing secrets, receipts, tokens, signed URLs, or personal payment details.
- Forced crash proof is requested without explicit approval.
- Privacy/Data Safety has not been reconciled with Firebase collection behavior.

## Lane 5 Runbook - Supabase Remote Public V1 Verification

Processed: 2026-04-26

Detailed owner doc: `docs/SUPABASE_REMOTE_PUBLIC_V1_RUNBOOK.md`

Scope for this lane only:

- Supabase remote project/link status.
- Remote migration alignment.
- Core schema readiness by applied migration/generated-type truth.
- Storage/RLS/Edge Function readiness status.
- Safe proof commands and manual dashboard steps.
- No remote data mutation, migration push, Android runtime proof, or destructive SQL.

Repo/remote-ready facts:

- Supabase CLI version observed: `2.75.0`.
- `supabase projects list` showed project ref `bmkkhihfbmsnnmcqkoly`, name `Chillywood2025's Project`, region West US (Oregon).
- `supabase link --project-ref bmkkhihfbmsnnmcqkoly` completed without a password prompt.
- Local `supabase/.temp/` metadata now exists because of the link and must stay uncommitted.
- `supabase migration list` previously showed local and remote aligned through every migration then present in `supabase/migrations`, from `202604190004` through `202604260004`; later migrations now need their own alignment proof.
- `supabase functions list --project-ref bmkkhihfbmsnnmcqkoly` showed `livekit-token` ACTIVE, version 7.
- `supabase db lint --linked --schema public --fail-on none` was attempted but blocked by remote CLI login password authentication. No password was entered.

Manual actions before marking Done:

1. Keep `supabase/.temp/` out of commits.
2. Confirm the Supabase dashboard project ref is `bmkkhihfbmsnnmcqkoly` and is the intended Public v1 project.
3. Confirm dashboard migration history matches local through `202604280001`.
4. Configure the approved remote DB login/password path for linked lint/schema checks, without pasting secrets into chat/docs.
5. Confirm `creator-videos` bucket exists, is private, has expected MIME types, has `file_size_limit = 5368709120`, and the project Storage global file-size limit is at least that high.
6. Confirm RLS is enabled on v1 tables and Storage policies exist.
7. Confirm `livekit-token` function secrets are present and current.
8. Confirm EAS/release runtime env points at the production Supabase project.

Proof required:

- Linked migration list remains aligned.
- Linked DB lint/schema inspection succeeds.
- Live creator media API/RLS proof passes for owner, non-owner, public, anon, and operator cases.
- Live Storage API proof passes for owner upload/remove and non-owner denial.
- Live moderation/report/admin proof passes.
- Live entitlement proof passes for active/expired/revoked states.
- `livekit-token` authenticated request, signed-out denial, malformed request denial, and role denial are proved without logging secrets.

Stop and do not mark Done if:

- Project ref does not match the intended production project.
- Pending migrations appear and have not been audited.
- Linked DB lint cannot authenticate.
- Storage bucket/policies cannot be verified.
- Live RLS proof uses only service-role or superuser behavior.
- Any proof would expose service keys, JWTs, database passwords, anon key values, signed URLs, LiveKit secrets, or user PII beyond approved test identities.

## Lane 6 Runbook - LiveKit Production Domain / TURN / TLS / Network Proof Prep

Processed: 2026-04-26

Detailed owner doc: `docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md`

Scope for this lane only:

- LiveKit production runtime config status.
- Supabase `livekit-token` endpoint readiness.
- Domain, TLS, reverse-proxy, TURN, firewall, and mobile network proof preparation.
- Server/provider status from repo docs.
- Privacy/logging posture for LiveKit diagnostics.
- No server restarts, key rotation, Android/two-device proof, Supabase migration work, or secret exposure.

Repo-ready facts:

- `app.config.ts` defaults the production LiveKit server URL to `wss://live.chillywoodstream.com`.
- `app.config.ts` defaults the token endpoint to the deployed Supabase `livekit-token` function and allows release env overrides with `EXPO_PUBLIC_LIVEKIT_URL` and `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT`.
- `_lib/runtimeConfig.ts`, `_lib/livekit/token-contract.ts`, and `_lib/livekit/join-boundary.ts` own the runtime token contract and prepared join handoff.
- `supabase/functions/livekit-token/index.ts` validates the Supabase bearer session, supports `live-stage`, `watch-party-live`, and `chat-call` surfaces, and mints roles `host`, `speaker`, or `viewer` according to room membership truth.
- The mobile client does not mint LiveKit tokens locally.
- `supabase functions list --project-ref bmkkhihfbmsnnmcqkoly` previously showed `livekit-token` ACTIVE, version 7.
- `docs/hetzner-first-deployment-implementation-spec.md` records prior Hetzner/Caddy/TLS/LiveKit host truth for `live.chillywoodstream.com`, but this lane did not SSH to the server or re-prove it.
- Static logging audit found no mobile code path printing `participantToken`, LiveKit API keys, or LiveKit API secrets. Release log proof is still required.

Manual actions before marking Done:

1. Confirm `live.chillywoodstream.com` DNS, TLS certificate, HTTPS behavior, and WebSocket upgrade path.
2. Confirm Caddy/reverse-proxy config on the host supports LiveKit signaling and legal static paths without exposing admin surfaces.
3. Confirm LiveKit host/container health, pinned image/version, protected host-only config, and log retention.
4. Confirm Supabase `livekit-token` secrets are present and aligned with the production LiveKit server.
5. Confirm firewall rules for the chosen LiveKit network mode: API/WebSocket, UDP media, ICE/TCP, TURN/UDP, and TURN/TLS where configured.
6. Confirm TURN/STUN behavior from Wi-Fi and cellular networks.
7. Confirm production EAS/runtime env points at the intended LiveKit URL and token endpoint.
8. Run bounded one-device and two-device Android proof with sanitized artifacts.
9. Run token request and denial proof without printing tokens.
10. Run release log audit for participant tokens, JWTs, LiveKit secrets, TURN credentials, signed media URLs, and service keys.

Proof required:

- One Android device enters Live Stage using production LiveKit and publishes/receives expected camera state.
- Two Android devices pass Live First proof.
- Two Android devices pass Live Watch-Party proof.
- Leave/rejoin keeps the same LiveKit source truth and does not surface stale-room bleed.
- Wi-Fi/cellular or different-NAT proof establishes media, not just signaling.
- Signed-out, malformed, missing-room, and unauthorized-role token requests are denied.
- No production logs expose participant tokens, Supabase bearer tokens, LiveKit API secrets, TURN credentials, service-role keys, or signed URLs.

Stop and do not mark Done if:

- DNS/TLS/WebSocket behavior is not verified for `live.chillywoodstream.com`.
- Supabase `livekit-token` secrets are missing or point at the wrong server.
- Firewall/TURN/ICE config cannot be verified.
- Cellular/different-NAT devices cannot establish media.
- Signed-out or unauthorized requests mint participant tokens.
- Live Stage proof falls back to the legacy media path in normal production use.
- Any artifact would expose tokens, keys, service-role secrets, TURN credentials, or signed URLs.

## Lane 7 Runbook - Production Env / Secrets Readiness

Processed: 2026-04-26

Detailed owner doc: `docs/PRODUCTION_ENV_SECRETS_RUNBOOK.md`

Scope for this lane only:

- Production runtime variables, EAS env readiness, and secrets boundary documentation.
- Base/strict runtime validation prep.
- Small config-safety hardening for Supabase runtime config and RevenueCat production logging.
- No secret creation, key rotation, live store actions, Android proof, Supabase migration work, or LiveKit network proof.

Repo-ready facts:

- `app.config.ts` writes `extra.runtime` for Supabase, beta/public-v1 flags, legal/support URLs, RevenueCat public SDK keys, LiveKit URL/token endpoint, and communication ICE/STUN/TURN config.
- `_lib/runtimeConfig.ts` reads those values from Expo config and `EXPO_PUBLIC_*` env overrides.
- `_lib/supabase.ts` now honors runtime Supabase URL/anon config when present, with the current deployed public project as fallback.
- `scripts/validate-runtime.mjs` still validates base Supabase/beta/EAS runtime shape and now supports strict production validation through `CHILLYWOOD_VALIDATE_PRODUCTION_ENV=1`.
- Strict production validation requires LiveKit public URL/token endpoint, RevenueCat Android production public SDK key, final legal/support URLs, and `EXPO_PUBLIC_BETA_ENVIRONMENT=public-v1`.
- RevenueCat SDK log mirroring is suppressed outside `__DEV__`; purchase/restore failures still use app-owned error paths without printing receipts or purchase tokens.
- `.gitignore` protects `.env*.local`, native folders, keystores, private keys, and common certificate formats.
- `.env.local` exists locally and remains ignored. Values were not printed.
- `supabase/.temp/` may exist from Supabase CLI linking and must remain uncommitted.

Manual actions before marking Done:

1. Configure EAS production env for all required public runtime values in `docs/PRODUCTION_ENV_SECRETS_RUNBOOK.md`.
2. Keep Supabase service-role keys, database passwords, LiveKit API secrets, RevenueCat private/API/webhook secrets, Play service account JSON, Firebase service account JSON, keystore passwords, JWT secrets, and provider tokens out of Expo public config.
3. Verify final Privacy, Terms, Account Deletion, and Support URLs are public and approved.
4. Verify RevenueCat Android production public SDK key is from the intended Chi'llywood RevenueCat app.
5. Verify LiveKit public URL and token endpoint match production server/function truth.
6. Run `CHILLYWOOD_VALIDATE_PRODUCTION_ENV=1 npm run validate:runtime` from the intended release env without printing values.
7. Run preview/release build proof later and confirm the app uses the intended endpoints.
8. Run release log audit for JWTs, participant tokens, purchase receipts/tokens, signed URLs, service keys, and keystore details.

Proof required:

- Base and strict runtime validation pass from the intended release environment.
- Public Expo config shape shows required fields present without raw value disclosure.
- Preview/release build uses intended Supabase, LiveKit, RevenueCat, Firebase, support, and legal config.
- Release logs do not expose secrets or signed URLs.
- Store, Supabase, Firebase, and LiveKit dashboard proofs remain linked to this env truth.

Stop and do not mark Done if:

- Required env names are missing or only present in an uncommitted local `.env` file.
- `EXPO_PUBLIC_BETA_ENVIRONMENT` is not `public-v1` for production validation.
- Server secrets are placed in `EXPO_PUBLIC_*` values or client-visible config.
- RevenueCat public SDK key points at the wrong app/environment.
- LiveKit URL/token endpoint points at the wrong server/function.
- Legal/support URLs are placeholders when preparing a Play submission.
- Release log audit finds Supabase JWTs, LiveKit participant tokens, signed media URLs, RevenueCat receipts/purchase tokens, service-role keys, Google private credentials, or keystore details.

## Lane 8 Runbook - Store Listing Assets / Content Rating Checklist

Processed: 2026-04-26

Detailed owner doc: `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md`

Scope for this lane only:

- Play Store listing metadata prep.
- Store graphic asset and screenshot readiness.
- Content Rating, Target Audience, Data Safety consistency, and UGC policy prep.
- No Play Console submission, asset upload, Android runtime proof, legal finalization, or product-code changes.

Repo-ready facts:

- `app.json` names the app `Chi'llywood`, package `com.chillywood.mobile`, version `1.0.0`, and uses `assets/images/icon.png` plus Android adaptive icon assets.
- The app has bundled public legal/support routes for Privacy, Terms, Account Deletion, Community Guidelines, Copyright/DMCA, and Support.
- `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md` already maps account/legal/Data Safety truth.
- `docs/ANDROID_RELEASE_EAS_RUNBOOK.md` already maps preview/production build and signing proof.
- Current asset inspection found launcher/splash/source art but no Play feature graphic and no dedicated store screenshot set.
- Current feature truth includes Profile, Channel, creator uploads, Player, Watch-Party, Live Stage, Chi'lly Chat, Premium/access foundations, and safety/reporting basics.
- Later-phase truth remains excluded from store copy: native game streaming, paid creator videos, subscriber-only media, tips, coins, payouts, ads, VIPs, comment media uploads, advanced creator studio, and automatic transcoding.
- The signup route does not visibly show Terms/Privacy/Community Guidelines acceptance copy in the inspected code, so UGC/store policy readiness has a decision gap before final submission.

Manual actions before marking Done:

1. Product/legal owner approves final app name, short description, full description, category, tags, and support/developer contact posture.
2. Release owner exports or creates a Play-ready 512 x 512 app icon from approved brand art.
3. Brand/product owner creates a 1024 x 500 feature graphic that does not overpromise later features.
4. Release owner captures sanitized phone screenshots from a preview or release-like Android build.
5. Product/legal owner confirms final Privacy, Terms, Account Deletion, Community Guidelines, Copyright/DMCA, and Support URLs.
6. Product/legal owner decides whether explicit Terms/Privacy/Community Guidelines acceptance needs to be added to signup before Play review.
7. Play Console owner completes Content Rating, Target Audience, Ads declaration, Data Safety, Account Deletion, and UGC policy answers using the runbooks.
8. Play Console owner uploads listing assets and keeps proof screenshots/notes free of secrets or private account data.

Proof required:

- Play Console accepts the main store listing metadata.
- Feature graphic, icon, and screenshot assets are uploaded and accepted.
- Content Rating questionnaire is completed and accepted.
- Target Audience and app content declarations are completed and accepted.
- Data Safety answers are accepted and match app behavior plus SDK disclosures.
- Account deletion URL is accepted.
- UGC policy declarations match the real report/moderation/copyright/account deletion paths.
- Internal/closed testing track accepts the production-profile AAB after release build proof.

Stop and do not mark Done if:

- Final legal/support URLs are not approved or publicly reachable where Play requires them.
- Feature graphic or screenshots show unproved later-phase features.
- Store copy claims no UGC, no data collection, no camera/mic, or live paid/payout/game-streaming features contrary to repo truth.
- The app's UGC acceptance/report/moderation posture is not approved.
- Data Safety, Content Rating, Target Audience, or Account Deletion forms are not accepted by Play Console.

## Current External Setup Summary

Already repo-backed:

- Dashboard/manual setup now has a command-center map at `docs/DASHBOARD_SETUP_COMMAND_CENTER.md`; it lists Google Play Console, RevenueCat, Firebase, Supabase, LiveKit/server, Expo/EAS, DNS/hosting, legal/support, GitHub, secret placement, proof gates, and the highest-priority dashboard action.
- Premium/Billing UX has real owners and does not grant local fake Premium.
- Creator Media, creator-video Player, and creator-video Watch-Party source-model code exist.
- Bundled legal/support/account-deletion routes exist.
- Firebase packages/plugins/helpers exist, and Firebase Crashlytics/Performance proof prep now has a dedicated runbook.
- Supabase migrations for creator media, billing entitlements, moderation, storage policy intent, creator movie upload size, and Watch-Party source/RLS exist; remote migration history is aligned through `202604280001`.
- LiveKit client/token contract owners exist, the token function is present in the Supabase functions tree, and `docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md` now defines production domain/TURN/TLS/network proof.
- Production env/secrets readiness now has a dedicated runbook at `docs/PRODUCTION_ENV_SECRETS_RUNBOOK.md`, and runtime validation can run a strict production presence check without printing values.
- Play Store listing/content-rating readiness now has a dedicated runbook at `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md`, including draft listing copy, asset gap list, screenshot plan, content-rating prep, and UGC/store-policy decisions.
- EAS production Android build profile exists.

External setup still required:

- Google Play subscription product and RevenueCat dashboard configuration.
- Play Store listing, screenshots, feature graphic, content rating, target audience, Data Safety, camera/microphone declarations, support URL, privacy URL, and account deletion URL.
- Final legal/support/DMCA/account deletion process review.
- Firebase dashboard proof for Crashlytics and Performance.
- Supabase linked DB lint/schema proof, live RLS proof, and Storage API proof.
- Supabase Edge Function secret/request proof for LiveKit token issuance.
- LiveKit production domain/TURN/TLS/firewall proof using `docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md`.
- EAS release signing/production AAB build proof.
- Release runtime env validation using `docs/PRODUCTION_ENV_SECRETS_RUNBOOK.md` and final route smoke.

## Recommended External Setup Order

Use `docs/DASHBOARD_SETUP_COMMAND_CENTER.md` as the master dashboard order. The current recommended sequence is:

1. Confirm Google Play app record and package `com.chillywood.mobile`.
2. Configure RevenueCat product, entitlement, and offering.
3. Configure EAS env values.
4. Build Android preview.
5. Prove Firebase Crashlytics/Performance.
6. Prove Supabase RLS/API/storage.
7. Prove LiveKit production/two-device behavior.
8. Complete Play Store listing, Data Safety, and content rating.
9. Finalize legal/DMCA/account deletion approvals.
10. Upload to Play internal testing.
11. Run final release smoke.

## Do Not Mark Done Until

- Play Console subscription and RevenueCat offering proof exists.
- Data Safety, account deletion, privacy, terms, support, and content policy URLs are accepted for the Play listing.
- Firebase Crashlytics/Performance events appear in the correct dashboard from a release-like build.
- Supabase remote migration/RLS/storage proof is captured with real anon/authenticated/non-owner/operator paths.
- LiveKit production token/server/TURN proof passes on physical devices.
- Android production AAB builds with release credentials and passes route smoke.
- No signed URLs, tokens, service keys, or receipt payloads appear in release logs.
