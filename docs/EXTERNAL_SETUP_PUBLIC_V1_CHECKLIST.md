# External Setup Public V1 Checklist

Date: 2026-04-26

Purpose: track everything outside this repository that Chi'llywood needs before a Public v1 launch. This document does not prove that any dashboard, store, hosted policy URL, live secret, or release signing step is complete. It records current repo support, the manual setup still needed, the owner/responsible party, the proof required, and the next action.

Use this checklist with `docs/PUBLIC_V1_READINESS_CHECKLIST.md`, `docs/PUBLIC_V1_AND_LATER_SYSTEMS_PLAN.md`, `docs/public-v1-release-checklist.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md`.

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
- `supabase migration list` could not be re-run from this local CLI session because the Supabase CLI did not have a linked project ref in local metadata. Current repo control truth still says the remote schema was previously applied and proved through `202604260004_tighten_watch_party_room_rls.sql`.
- `google-services.json` is present and was checked only for project/package identity, not key contents. It references Firebase project `chillywood-app` and Android package `com.chillywood.mobile`.

## External References

Use current official documentation during actual setup because console requirements change over time:

- Google Play Billing and subscriptions: `https://developer.android.com/google/play/billing`
- RevenueCat Android product setup: `https://www.revenuecat.com/docs/getting-started/entitlements/android-products`
- RevenueCat SDK configuration: `https://www.revenuecat.com/docs/getting-started/configuring-sdk`
- RevenueCat entitlements: `https://www.revenuecat.com/docs/getting-started/entitlements`
- Google Play Data safety: `https://support.google.com/googleplay/android-developer/answer/10787469`
- Google Play account deletion: `https://support.google.com/googleplay/android-developer/answer/13327111`
- Firebase Crashlytics: `https://firebase.google.com/docs/crashlytics/get-started?platform=android`
- Firebase Performance Monitoring: `https://firebase.google.com/docs/perf-mon/get-started-android`
- Supabase migrations and local development: `https://supabase.com/docs/guides/deployment/database-migrations` and `https://supabase.com/docs/guides/local-development/overview`
- LiveKit authentication and networking: `https://docs.livekit.io/frontends/build/authentication/` and `https://docs.livekit.io/transport/self-hosting/ports-firewall/`
- Expo EAS Build and Play submission: `https://docs.expo.dev/build/introduction/` and `https://docs.expo.dev/submit/android/`

## Checklist

| Area | Current repo status | Dashboard/manual action needed | Owner/responsible person | Proof required | Status | Exact next action |
| --- | --- | --- | --- | --- | --- | --- |
| Google Play Billing product | `react-native-purchases` and `react-native-purchases-ui` are installed. `_lib/revenuecat.ts`, `_lib/monetization.ts`, `_lib/premiumEntitlements.ts`, and `app/subscribe.tsx` own Premium billing UX and entitlement checks. The app does not grant Premium from local-only state. | Create the Google Play subscription product for Chi'llywood Premium, configure base plan/offers, and connect the product to RevenueCat. Confirm product IDs match the RevenueCat offering/entitlement model used by the app. | Product owner plus Play Console/RevenueCat operator. | Internal build purchase starts, product loads, purchase completes, backend entitlement becomes active, and protected routes unlock only after trusted entitlement truth. | External Setup Pending | Follow the Lane 1 runbook below: create the Play subscription product/base plan, connect it to RevenueCat entitlement `premium`, then run license-tester purchase proof. |
| RevenueCat configuration | Runtime config supports `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV`, `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`, and `EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY`. Monetization targets include `premium_subscription`, `premium_live_access`, and `premium_watch_party_access`; later paid content targets remain non-v1. | Configure Android app `com.chillywood.mobile`, Play service credentials, offerings, products, entitlements, and public SDK keys in RevenueCat. | Billing owner. | `/subscribe` shows configured offer, purchase and restore call RevenueCat, active entitlement is reflected by account-owned truth, and missing/expired/revoked states remain blocked. | External Setup Pending | Add the RevenueCat Android public SDK key to release env, keep all Play service credentials in RevenueCat/dashboard storage only, and verify offering `premium` loads in `/subscribe`. |
| Billing restore path | `/subscribe` exposes restore/manage actions through the existing RevenueCat owner and shows honest failure copy when unavailable. | Ensure store account restore is configured and RevenueCat is connected to the Play app. | Billing owner. | Reinstall/login on a second install, tap Restore, validate server/store result, and confirm Premium unlocks only after entitlement refresh. | External Setup Pending | After purchase setup, run restore proof with the same Google license tester and capture screenshots/logs without receipt tokens. |
| Google Play Store listing | `app.json` names the app `Chi'llywood`, version `1.0.0`, Android package `com.chillywood.mobile`, and icons/splash assets under `assets/images`. `eas.json` has a production Android app-bundle profile. | Prepare Play Store app listing, short/full descriptions, screenshots, feature graphic, app category, contact email, privacy policy URL, account deletion URL, content rating, target audience, and tester tracks. | Product owner plus release manager. | Play Console listing checklist passes, internal/closed testing track accepts AAB, policy declarations are accepted. | External Setup Pending | Create/complete Play Console listing for `com.chillywood.mobile` and upload first production-profile AAB to internal testing. |
| Google Play Data Safety | Repo has policy pages and support surfaces, but Data Safety answers are a Play Console responsibility. App uses Supabase auth/storage, Firebase, RevenueCat, LiveKit, camera, microphone, and notifications dependencies. | Complete Data Safety with actual data collected/shared, encryption/deletion practices, diagnostics/analytics, account creation/deletion, camera/microphone use, and user-generated content moderation. | Product owner plus privacy/legal reviewer. | Data Safety form is accepted by Play Console and matches app behavior plus third-party SDK use. | External Setup Pending | Inventory data by SDK/system, answer Play Console Data Safety, and cross-check with Privacy Policy before submission. |
| Account deletion policy | `app/account-deletion.tsx` exists and `app.config.ts` has fallback hosted URL `https://live.chillywoodstream.com/account-deletion`; Settings links to deletion support. It is an honest request/help flow, not fake automated deletion. | Confirm public hosted account deletion URL, process owner, response SLA, backend deletion/export policy, and Play Console account deletion declaration. | Product owner plus support/legal owner. | URL is public, opens outside the app, explains delete request flow, and Play Console accepts it. | External Setup Pending | Finalize the hosted account deletion page/process and configure `EXPO_PUBLIC_ACCOUNT_DELETION_URL` if the fallback is not final. |
| Legal pages and support | Routes exist for Privacy, Terms, Community Guidelines, Copyright/DMCA, Support, and account deletion. `app.config.ts` has privacy/terms/account deletion fallbacks and supports `EXPO_PUBLIC_SUPPORT_EMAIL`. | Legal review, final hosted URLs, final support email, DMCA/contact process, and support inbox ownership. | Legal/support owner. | Links open in release build, public URLs are reachable, support email/inbox receives a test request, and legal copy is approved. | External Setup Pending | Finalize legal copy, hosted policy URLs, and support mailbox, then set release env for privacy, terms, account deletion, and support email. |
| Android permissions and policy declarations | `app.json` requests `CAMERA`, `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`. Live Stage/LiveKit uses camera/microphone. Notification packages are present but push delivery is not a v1 proof target. | Declare camera/microphone purpose in Play Console, privacy copy, and store listing. Confirm any notification/runtime permissions used by release build. | Release manager plus product owner. | Install release build, verify permission prompts are contextual and Play declarations match actual features. | External Setup Pending | Run release build permission smoke and update Play Console declarations before production review. |
| Firebase project and Android config | Firebase packages and config plugins are present. `firebase.json` enables Crashlytics collection/debug settings. `google-services.json` exists for project `chillywood-app` and package `com.chillywood.mobile`. Helpers exist for Crashlytics, Performance, Analytics, and Remote Config. | Verify Firebase project ownership, Android app registration, SHA/package match if required, Crashlytics and Performance dashboard setup, and production data collection posture. | Release manager/Firebase owner. | Internal/release build reports a non-fatal Crashlytics event, Performance traces appear, and dashboards show the expected Android app. | Proof Pending | Build an internal release candidate, trigger a safe non-fatal/test crash path if available, and confirm dashboard arrival without logging secrets. |
| Firebase Crashlytics | `@react-native-firebase/crashlytics` and helper code exist. | Confirm Crashlytics is enabled in Firebase console and compatible with the release build type. | Firebase owner. | A controlled non-fatal report or test crash appears in Crashlytics for `com.chillywood.mobile`. | Proof Pending | Run Crashlytics proof in an internal build and save dashboard/screenshot evidence. |
| Firebase Performance and analytics/remote config | `@react-native-firebase/perf`, analytics, and remote config packages/helpers exist. | Confirm performance monitoring and analytics collection are appropriate for policy disclosures and release environment. | Firebase owner plus privacy owner. | Performance trace/network metric appears in Firebase; privacy policy/Data Safety mentions applicable diagnostics/analytics behavior. | Proof Pending | Run a short release-candidate Performance proof and update policy declarations if data collection differs. |
| Supabase remote project link | App config and control docs identify the remote project through deployed endpoints, and current repo truth says migrations are applied/proved through `202604260004`. This local CLI session is not linked, so migration status could not be re-run here. | Link local Supabase CLI to the production project when needed, without committing `.temp` metadata. Confirm project ref, migration list, storage buckets, Edge Function deployment, and secrets in dashboard. | Backend/Supabase owner. | `supabase migration list` shows local/remote alignment, schema has creator media/watch-party columns, and no migration drift exists. | Proof Pending | Run `supabase link --project-ref bmkkhihfbmsnnmcqkoly` in a controlled session, verify migrations read-only, and leave local metadata uncommitted. |
| Supabase remote migrations and RLS | Migrations define `videos`, `creator-videos` storage policies, `safety_reports`, `user_entitlements`, `billing_events`, Watch-Party source fields, and tightened room RLS. Local and previous remote proof are recorded in control docs. | Re-run safe remote proof before launch for creator media, storage, reports, entitlements, admin writes, Watch-Party rooms, and anon denial. | Backend/Supabase owner. | Live RLS proof shows owner/non-owner/public/admin/anon behavior exactly matches Public v1 access rules. | Proof Pending | Run focused non-destructive live RLS proof after CLI link, then document artifacts in `CURRENT_STATE.md` and `NEXT_TASK.md`. |
| Supabase storage buckets | Migration creates a private `creator-videos` bucket with owner write/delete and public-or-owner read policy intent. Direct SQL delete is intentionally blocked by Supabase storage protection, so Storage API proof remains separate. | Verify bucket exists remotely, MIME/file-size limits match product needs, public access is policy-mediated, and Storage API owner delete/remove works. | Backend/Supabase owner. | Owner uploads/removes own object, non-owner cannot overwrite/delete, public reads only public clean videos, draft/hidden/removed sources do not leak. | Proof Pending | Run Storage API proof against remote project using real owner/non-owner sessions, not service-role-only SQL. |
| Supabase Edge Functions | `supabase/functions/livekit-token/index.ts` exists and `supabase/config.toml` disables automatic JWT verification for that function because the function validates bearer auth internally. | Deploy/verify function in remote project and configure function secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`. | Backend/LiveKit owner. | Authenticated app request receives server URL and participant token; signed-out/malformed requests are rejected; no secrets appear in logs. | Proof Pending | Verify deployment and secrets in Supabase dashboard, then run token request proof from release-like build. |
| LiveKit production server | App defaults to `wss://live.chillywoodstream.com` and `infra/hetzner/livekit.env.example` documents a self-hosting scaffold. LiveKit runtime code requests tokens from the Supabase Edge Function; the client does not mint tokens. | Confirm production LiveKit server, domain, TLS, API key/secret, TURN/ICE settings, firewall ports, server health, scaling/monitoring, and retention/logging posture. | LiveKit infrastructure owner. | Two Android devices can join Live First and Live Watch-Party on production LiveKit, reconnect, and avoid stale-room bleed; server health is observable. | Proof Pending | Verify `live.chillywoodstream.com` infrastructure, TURN/port reachability, and token endpoint secrets, then run bounded two-device proof. |
| LiveKit TURN/domain/TLS | Domain fallback exists in config, but TURN/TLS/port readiness is external. | Configure TLS certs, DNS, firewall, UDP/TCP ports, TURN if needed, and any load balancer/proxy settings. | LiveKit infrastructure owner. | Cellular and Wi-Fi devices can establish media, not only local-network proof. | External Setup Pending | Run network reachability proof from cellular/Wi-Fi and record LiveKit connection diagnostics without tokens. |
| Android release build and signing | `eas.json` production profile builds Android `app-bundle`. `docs/public-v1-release-checklist.md` names the production build command. `app.json` includes EAS project id and updates URL. | Confirm EAS project access, Android credentials/signing ownership, package `com.chillywood.mobile`, Play App Signing, release track, and environment profile secrets. | Release manager. | `npx eas-cli@latest build --platform android --profile production --non-interactive` succeeds and the AAB installs/submits to internal testing. | External Setup Pending | Confirm EAS credentials, then run production AAB build after runtime proof lanes are green. |
| Production runtime environment | `scripts/validate-runtime.mjs` checks Supabase URL/anon key, beta allowlist/env, Expo project id/update URL/runtime. `app.config.ts` reads RevenueCat, LiveKit, legal/support, and Firebase config. | Populate release env for Supabase, RevenueCat, LiveKit token endpoint/server URL, legal/support URLs, beta/public flags, and any Firebase/EAS secrets. | Release manager plus system owners. | `npm run validate:runtime` passes for release environment; release build shows correct endpoints without dev fallbacks. | External Setup Pending | Create release env profile and run runtime validation immediately before production build. |
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

## Current External Setup Summary

Already repo-backed:

- Premium/Billing UX has real owners and does not grant local fake Premium.
- Creator Media, creator-video Player, and creator-video Watch-Party source-model code exist.
- Bundled legal/support/account-deletion routes exist.
- Firebase packages/plugins/helpers exist.
- Supabase migrations for creator media, billing entitlements, moderation, storage policy intent, and Watch-Party source/RLS exist.
- LiveKit client/token contract owners exist, and the token function is present in the Supabase functions tree.
- EAS production Android build profile exists.

External setup still required:

- Google Play subscription product and RevenueCat dashboard configuration.
- Play Store listing, screenshots, content rating, Data Safety, camera/microphone declarations, support URL, privacy URL, and account deletion URL.
- Final legal/support/DMCA/account deletion process review.
- Firebase dashboard proof for Crashlytics and Performance.
- Supabase CLI project link and live migration/RLS/storage re-proof.
- Supabase Edge Function deployment/secrets proof for LiveKit token issuance.
- LiveKit production domain/TURN/TLS/firewall proof.
- EAS release signing/production AAB build proof.
- Release runtime env validation and final route smoke.

## Recommended External Setup Order

1. Finalize hosted legal/support/account deletion URLs and support inbox ownership.
2. Link Supabase CLI read-only, verify remote migration alignment, and run focused live RLS/storage proof.
3. Verify Supabase `livekit-token` function deployment and secret configuration.
4. Verify LiveKit server/domain/TURN/TLS from Wi-Fi and cellular networks.
5. Configure RevenueCat/Google Play Premium subscription product and public SDK keys.
6. Build internal Android release candidate with production runtime env.
7. Prove Firebase Crashlytics/Performance in the internal build.
8. Run final release candidate route smoke and log audit.
9. Complete Play Console Data Safety, content rating, store listing, screenshots, support/legal links, and account deletion declaration.
10. Submit to internal/closed testing before production rollout.

## Do Not Mark Done Until

- Play Console subscription and RevenueCat offering proof exists.
- Data Safety, account deletion, privacy, terms, support, and content policy URLs are accepted for the Play listing.
- Firebase Crashlytics/Performance events appear in the correct dashboard from a release-like build.
- Supabase remote migration/RLS/storage proof is captured with real anon/authenticated/non-owner/operator paths.
- LiveKit production token/server/TURN proof passes on physical devices.
- Android production AAB builds with release credentials and passes route smoke.
- No signed URLs, tokens, service keys, or receipt payloads appear in release logs.
