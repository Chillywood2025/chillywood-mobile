# Dashboard Setup Command Center

Date: 2026-04-27

Purpose: give Chi'llywood one command-center document for every external dashboard, account, server console, hosted URL, and manual setup lane required before Public v1 launch.

This is not proof that any dashboard is complete. It is a launch-operations map. Do not mark a dashboard `Done` unless the dashboard action was actually performed, the proof artifact exists, and no secrets were exposed.

Use this with:

- `docs/EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST.md`
- `docs/PUBLIC_V1_READINESS_CHECKLIST.md`
- `docs/ANDROID_RELEASE_EAS_RUNBOOK.md`
- `docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md`
- `docs/SUPABASE_REMOTE_PUBLIC_V1_RUNBOOK.md`
- `docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md`
- `docs/PRODUCTION_ENV_SECRETS_RUNBOOK.md`
- `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md`
- `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`

## Command-Center Guardrails

- Do not run destructive commands from a dashboard-audit pass.
- Do not submit anything to Google Play from repo automation unless a separate release pass explicitly approves it.
- Do not run production builds from this doc.
- Do not rotate credentials without release-owner approval.
- Do not apply migrations from this doc.
- Do not print API keys, service keys, JWTs, database passwords, signing credentials, LiveKit secrets, RevenueCat private keys, Play service account JSON, Firebase private credentials, TURN credentials, or signed media URLs.
- Do not commit `.env`, `.env.local`, Supabase local metadata, service account files, keystores, credential JSON, screenshots with private dashboard data, purchase receipts, or proof logs containing secrets.
- Public client values still need intentional configuration. `EXPO_PUBLIC_*` does not mean "safe to paste everywhere."
- Buttons and dashboards are not proof. Public v1 proof needs the app, dashboard, backend, and release build to agree.

## Status Key

- `Done`: setup is complete and proof was captured for the Public v1 launch environment.
- `Partial`: some repo or dashboard support exists, but setup/proof is incomplete.
- `External Setup Pending`: a dashboard, hosted URL, credential, domain, product, legal approval, or manual owner action is still required.
- `Proof Pending`: setup appears present, but launch proof has not been captured.
- `Blocked`: a known issue prevents completing the setup/proof lane.
- `Later`: intentionally post-v1.

## Current Snapshot

| Item | Current truth |
| --- | --- |
| App name | `Chi'llywood` |
| Android package | `com.chillywood.mobile` |
| Expo slug | `chillywood-mobile` |
| Expo owner | `chillywood2025` |
| Expo project id | `c384ed57-5454-4e80-81ad-dcc218b8a3c8` |
| App version | `1.0.0` |
| Runtime version policy | `appVersion` |
| Production LiveKit URL default | `wss://live.chillywoodstream.com` |
| Supabase project ref from existing runbook | `bmkkhihfbmsnnmcqkoly` |
| Firebase project id from safe config inspection | `chillywood-app` |
| RevenueCat v1 entitlement target | `premium` |
| RevenueCat v1 offering target | `premium` |
| Google Play v1 subscription product target | `premium_subscription` in app logic; recommended Play id `chillywood_premium_v1` from billing runbook |
| Main local-only metadata to keep uncommitted | `supabase/.temp/` |

## Master Dashboard Inventory

| Dashboard / external system | Purpose | URL / dashboard entry | Owner | Current repo support | Current dashboard status | Required env / secrets by name only | Where values should live | Must never be committed | Proof required | Status | Exact next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Google Play Console | Android app record, testing tracks, subscriptions, Data Safety, content rating, account deletion, listing, Play signing, releases | `https://play.google.com/console` | Product owner + release manager | `app.json`, `eas.json`, legal/support pages, billing helpers, store runbooks | Not proved from repo | Play service account JSON if EAS submit later; subscription product/base-plan ids | Google Play, RevenueCat, EAS submit credentials | Play service account JSON, screenshots with private account data | App record, subscription product, internal test, Data Safety, content rating, account deletion URL, AAB upload accepted | External Setup Pending | Create/confirm app record for package `com.chillywood.mobile`, then configure subscription and internal testing. |
| RevenueCat | Store product bridge, Premium entitlement, offerings, purchase/restore customer info | `https://app.revenuecat.com` | Billing owner | `react-native-purchases`, `_lib/revenuecat.ts`, `_lib/monetization.ts`, `_lib/premiumEntitlements.ts`, `/subscribe` | Not proved from repo | `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`, optional dev public key, RevenueCat private/API/webhook keys later | Public SDK key in EAS env; private keys/webhooks in RevenueCat/backend only | Private API keys, webhook secret, receipts, purchase tokens | Offer loads, license tester purchase activates entitlement `premium`, restore works, expired/revoked blocks | External Setup Pending | Configure Android app/package, entitlement `premium`, offering `premium`, and Play product/base plan. |
| Firebase Console | Crashlytics, Performance, Analytics/Remote Config readiness | `https://console.firebase.google.com` | Firebase/release owner | Firebase packages, `google-services.json`, `firebase.json`, `_lib/firebase*`, app shell bootstrap | Config present; dashboard receipt not proved | Firebase client config is present; service account credentials if CI/backend later | Firebase console/EAS as needed; `google-services.json` is repo client config | Firebase service account JSON/private keys, crash payloads with PII | Nonfatal/crash receipt in Crashlytics, Performance trace/dashboard receipt, privacy/Data Safety reconciliation | Proof Pending | Verify project `chillywood-app`, app package `com.chillywood.mobile`, then run approved release-like Crashlytics/Performance proof. |
| Supabase Dashboard | Auth, database, storage, RLS, Edge Functions, live schema, creator media, reports, entitlements | `https://supabase.com/dashboard/project/bmkkhihfbmsnnmcqkoly` | Backend/Supabase owner | Migrations, `supabase/database.types.ts`, `_lib/supabase.ts`, creator/video/watch-party/moderation helpers | Migration history previously aligned; full live proof pending | Supabase URL, anon key, service role key, database password, Edge Function secrets | Public URL/anon in EAS env; service role/database/function secrets in Supabase/backend only | Service role key, database password, JWTs, anon key dumps, signed URLs, local `.temp` | Migration alignment, RLS API proof, storage bucket proof, Edge Function token proof | Partial / Proof Pending | Run safe remote lint/API/RLS/storage proof with approved DB login path; keep `.temp` uncommitted. |
| Supabase Edge Function: `livekit-token` | Server-side LiveKit participant token minting | Supabase dashboard function page for project `bmkkhihfbmsnnmcqkoly` | Backend/LiveKit owner | `supabase/functions/livekit-token/index.ts`, `_lib/livekit/token-contract.ts`, `supabase/config.toml` | Existing runbook records ACTIVE version 7; secrets/denial proof pending | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` | Supabase Edge Function secrets | All function secrets, participant tokens, bearer tokens | Authenticated request returns token/server URL; signed-out/malformed/unauthorized requests deny | Partial / Proof Pending | Verify function secrets in Supabase dashboard, then run token request/denial proof. |
| LiveKit / realtime server admin | Live Stage and Watch-Party Live realtime media server, TURN/TLS/network readiness | Self-host/server admin; LiveKit Cloud only if later approved | LiveKit infrastructure owner | LiveKit SDK/packages, token contract, Hetzner infra scaffold, production URL fallback | Server/domain documented but not freshly proved | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, TURN credentials if used | LiveKit host config + Supabase function secrets; TURN credentials in host secret store | API keys/secrets, TURN credentials, tokens, host env files | One-device and two-device production connect, rejoin, cellular/Wi-Fi, stale-room containment | Partial / Proof Pending | Verify `live.chillywoodstream.com`, TLS, firewall/TURN, function secrets, then run bounded two-device proof. |
| Hetzner / realtime host provider | Primary self-hosted realtime infrastructure and LiveKit container host | Hetzner Cloud dashboard | Infrastructure owner | `infra/hetzner/*`, LiveKit production runbook | Documented; not freshly proved | Hetzner provider token, SSH key, host env values | Provider dashboard/local secret manager/host only | Provider token, SSH private key, real host env files | Host reachable, container healthy, logs safe, firewall correct, rollback plan exists | External Setup Pending / Proof Pending | Server owner verifies host `chillywood-prod-01`, container, firewall, TLS, logs, and monitoring. |
| Cloudflare / DNS provider | DNS, possible proxy posture, TLS records, public legal/runtime domains | DNS dashboard for `chillywoodstream.com` owner | Domain/DNS owner | Domain names appear in config/docs | Not proved from repo | DNS provider token if automation later | DNS provider dashboard/secret manager only | DNS API token, zone credentials | DNS resolves, TLS cert valid, no proxy breakage for WebRTC, legal URLs route publicly | External Setup Pending / Proof Pending | Confirm `live.chillywoodstream.com` DNS/TLS/proxy posture and public legal URL routing. |
| Expo / EAS Dashboard | Build profiles, Android signing credentials, EAS env, update channels, project ownership | `https://expo.dev/accounts/chillywood2025/projects/chillywood-mobile` | Release manager | `eas.json`, `app.json`, Expo Updates URL, release runbook | Project configured; current release build not proved | `EXPO_TOKEN`, EAS env vars, Android signing credentials/keystore | Expo/EAS dashboard/credentials/env; GitHub secrets if CI build is used | Expo token, keystore, keystore passwords, credential JSON | Preview build, production AAB, signing verification, internal test upload | External Setup Pending | Verify credentials/versionCode/env, then run preview build after runtime proof lanes. |
| Domain / hosting for legal/support pages | Public web URLs for Privacy, Terms, Account Deletion, support, Community Guidelines, Copyright/DMCA | `https://live.chillywoodstream.com/...` plus any future website/support host | Legal/support + domain owner | In-app legal routes and fallback URLs exist; static host documented | Privacy/Terms/Deletion fallback URLs previously returned HTTP 200; final legal approval pending | Legal URL env vars and support email | EAS public env for URLs/email; hosting dashboard for pages | Hosting credentials, account inbox credentials | Public unauthenticated URL proof, Play Console acceptance, support inbox receipt | External Setup Pending | Finalize public URLs, support mailbox, DMCA/contact flow, and legal approval. |
| Legal / attorney / support operations | Legal approval, DMCA process, account deletion process, support SLA, abuse escalation | Attorney/support owner tools, inbox, ticketing system if adopted | Product owner + legal/support owner | Expanded policy pages and runbooks exist | Legal approval not complete | Support inbox credentials, DMCA contact details if private, ticketing credentials if used | Support/legal tools only; public email/URLs in EAS when approved | Private legal docs, ticketing credentials, user reports with PII | Attorney-approved wording, account deletion process, DMCA process, abuse report workflow | External Setup Pending | Legal/support owner approves policy pages and assigns request/takedown/deletion ownership. |
| GitHub / repo protection | Source control, branch protection, CI checks, release workflow, secret hygiene | GitHub repository dashboard | Repo owner | CI workflows, PR template, manual Public v1 workflow exist | Repo settings not verified from local clone | GitHub Actions secrets such as `EXPO_TOKEN`, public env secrets for release workflow | GitHub Actions secrets/settings | GitHub tokens, EAS token, env values, credentials | Branch protection, required checks, release workflow secret availability, clean commits | Proof Pending | Repo owner verifies `main` branch protection and required checks in GitHub settings. |
| Google/Firebase/RevenueCat/Supabase/LiveKit support channels | Vendor support and incident response | Vendor support dashboards | Operations owner | Runbooks identify vendors | Not configured/proved | Account login/2FA/recovery codes | Vendor account systems only | Recovery codes, login credentials | Account recovery path, billing owner, incident contact list | External Setup Pending | Assign account owner and backup for each vendor account before launch. |

## Google Play Console

Dashboard:

- Website: `https://play.google.com/console`
- App package: `com.chillywood.mobile`
- App name: `Chi'llywood`
- Status: `External Setup Pending`

Purpose:

- Own the Android app record, app signing, internal/closed testing tracks, production release, Play Billing subscription product, store listing, Data Safety, content rating, target audience, account deletion declaration, privacy/support URLs, and UGC policy declarations.

Repo support:

- `app.json` defines app name `Chi'llywood`, package `com.chillywood.mobile`, version `1.0.0`, app icons/splash, and camera/microphone permissions.
- `eas.json` defines development, preview, and production build profiles; production targets Android app bundle.
- `app/terms.tsx`, `app/privacy.tsx`, `app/community-guidelines.tsx`, `app/copyright.tsx`, `app/account-deletion.tsx`, and `components/system/support-screen.tsx` provide expanded legal/support policy surfaces pending legal approval.
- `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md` documents draft listing copy, asset gaps, content rating prep, Data Safety consistency, UGC/store policy readiness, and brand asset status.

Manual steps:

1. Create or confirm the Play Console app record for package `com.chillywood.mobile`.
2. Confirm developer account owner, public developer name, support email, and account recovery/2FA.
3. Configure Play App Signing and upload-key posture before first production AAB.
4. Create internal testing track and license testers.
5. Upload the first approved AAB to internal testing after EAS production build proof.
6. Configure Chi'llywood Premium subscription product and base plan.
7. Complete Data Safety using `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`.
8. Complete account deletion section with final public URL.
9. Complete privacy policy URL.
10. Complete content rating questionnaire and target audience/content declarations.
11. Upload app icon, feature graphic, screenshots, and optional promo video only after assets are approved.
12. Add app access instructions if reviewers need sign-in or a test account.
13. Complete UGC policy declarations: clear content policy, report abuse, moderation/takedown, DMCA/copyright, and account deletion paths.

Required values and where they live:

- Play service account JSON: Google/EAS/RevenueCat only, never repo.
- Subscription product/base plan ids: Play Console and RevenueCat; public ids can be documented after finalized.
- Support/legal URLs: EAS public env and Play Console once final.
- AAB files: EAS build artifacts / Play Console, not committed.

Proof required:

- Internal test track accepts the AAB.
- Play subscription product loads through RevenueCat.
- Data Safety and content rating sections are accepted.
- Account deletion URL is accepted.
- Store listing assets pass Play validation.
- License tester purchase and restore work before production launch.

Risks:

- Play may require the app record/build before subscription products can be tested.
- Inaccurate UGC/Data Safety/account deletion answers can block review.
- VersionCode must increment before repeated uploads.

Next action:

- Create or verify the app record and internal testing track, then configure the subscription product/base plan needed by RevenueCat.

## RevenueCat

Dashboard:

- Website: `https://app.revenuecat.com`
- Status: `External Setup Pending`

Purpose:

- Own purchase product mapping, public SDK key, offerings, entitlement `premium`, restore path, customer info, and Google Play subscription product connection.

Repo support:

- `react-native-purchases` and `react-native-purchases-ui` are installed.
- `_lib/revenuecat.ts` owns RevenueCat setup, identity sync, offerings, purchase, restore, and manage-subscription handoff.
- `_lib/monetization.ts` and `_lib/premiumEntitlements.ts` own app-facing entitlement/access truth.
- `/subscribe` exists and is honest when offers/config are missing.
- Premium cannot be granted from a local-only toggle.

Manual steps:

1. Create or confirm the RevenueCat project.
2. Add Android app for package `com.chillywood.mobile`.
3. Connect Google Play through RevenueCat's approved Play service account flow.
4. Create entitlement id `premium`.
5. Create offering id `premium`.
6. Connect the Google Play subscription product/base plan to entitlement `premium`.
7. Add the package to offering `premium` and make it the current/default offering if required.
8. Add the Android public SDK key to EAS env as `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`.
9. Add a dev/test public SDK key only if needed for internal proof as `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV`.
10. Keep private RevenueCat API keys/webhook secrets out of the app and repo.

Required values and where they live:

- `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`: EAS env, client-safe public key.
- `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV`: EAS/local env for dev proof if used.
- RevenueCat private API key/webhook secret: RevenueCat/backend only.
- Play service account JSON: Google/RevenueCat only.

Proof required:

- `/subscribe` shows configured offer instead of unavailable copy.
- Google Play license tester purchase opens and completes.
- RevenueCat customer info shows active entitlement `premium`.
- Restore works after reinstall/clear state.
- Expired, canceled, revoked, or missing entitlement states remain blocked.

Risks:

- A store purchase success is not enough if RevenueCat/backend entitlement truth does not refresh.
- Do not describe paid creator videos, tips, coins, payouts, or subscriber-only media as live v1 products.

Next action:

- Configure entitlement `premium`, offering `premium`, and the Android subscription mapping after the Play product exists.

## Firebase Console

Dashboard:

- Website: `https://console.firebase.google.com`
- Project id from safe repo config: `chillywood-app`
- Android package: `com.chillywood.mobile`
- Status: `Proof Pending`

Purpose:

- Own Crashlytics, Performance Monitoring, Analytics/Remote Config dashboard setup, Android app registration, and diagnostics proof.

Repo support:

- `google-services.json` exists and matches package `com.chillywood.mobile` by existing runbook inspection.
- `firebase.json` enables Crashlytics auto collection/debug setting.
- `app.config.ts` registers Firebase app, Crashlytics, and Performance plugins.
- `_lib/firebaseCrashlytics.ts`, `_lib/firebasePerformance.ts`, `_lib/firebaseAnalytics.ts`, and `_lib/firebaseRemoteConfig.ts` exist.
- App shell bootstraps Firebase diagnostics.

Manual steps:

1. Open Firebase Console and select project `chillywood-app`.
2. Verify the Android app package is `com.chillywood.mobile`.
3. Confirm `google-services.json` in the repo came from the intended production Android app.
4. Confirm Crashlytics is enabled.
5. Confirm Performance Monitoring is enabled.
6. Confirm analytics/performance/privacy posture matches Privacy Policy and Play Data Safety.
7. Install a preview/release-like build from current `main`.
8. Trigger approved nonfatal Crashlytics proof.
9. Run forced crash proof only after explicit owner approval.
10. Generate Performance app-start/screen/custom-trace data.
11. Capture dashboard receipt screenshots/notes without personal data.

Required values and where they live:

- Firebase client config: `google-services.json` in repo if approved for the client.
- Firebase service account/private keys: Firebase/GitHub/backend only if ever needed, never repo.

Proof required:

- Crashlytics receives a nonfatal or approved crash for `com.chillywood.mobile`.
- Performance receives app-start/screen/custom trace for `com.chillywood.mobile`.
- Release log audit confirms no sensitive payloads are logged.

Risks:

- Static Firebase config is not dashboard proof.
- Crashlytics metadata must not contain signed URLs, JWTs, purchase receipts, or tokens.

Next action:

- Verify Firebase dashboard project/app, then run release-like nonfatal and Performance proof.

## Supabase Dashboard

Dashboard:

- Project URL: `https://supabase.com/dashboard/project/bmkkhihfbmsnnmcqkoly`
- Project ref: `bmkkhihfbmsnnmcqkoly`
- Status: `Partial / Proof Pending`

Purpose:

- Own Auth, Postgres schema, RLS, Storage, Edge Functions, app data, creator video storage, safety reports, entitlements, Watch-Party rooms, and admin/operator backend truth.

Repo support:

- Migration history is tracked under `supabase/migrations`.
- Existing runbook records remote migration alignment through `202604260004_tighten_watch_party_room_rls.sql`.
- `supabase/database.types.ts` exists.
- `_lib/supabase.ts` honors runtime Supabase config.
- Creator media, moderation, premium entitlement, Watch-Party, chat, notification, and profile/channel app owners use Supabase.
- `supabase/functions/livekit-token/index.ts` exists.

Manual steps:

1. Confirm the production project ref is `bmkkhihfbmsnnmcqkoly`.
2. Confirm remote migrations remain aligned with local migrations before any proof.
3. Confirm no pending migrations exist before any future apply/push.
4. Confirm Storage bucket `creator-videos` exists and is private.
5. Confirm storage policies protect owner writes/deletes and public-or-owner reads.
6. Confirm RLS is enabled on v1 tables.
7. Confirm `livekit-token` function is deployed and active.
8. Confirm Edge Function secrets are present.
9. Run linked lint/schema proof after approved DB login path exists.
10. Run focused live API/RLS proof with anon, owner, non-owner, and operator users.

Required values and where they live:

- `EXPO_PUBLIC_SUPABASE_URL`: EAS env, public client config.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: EAS env, public client key, do not paste into docs/chat.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase function/backend secrets only.
- Remote database password: local secret manager/Supabase CLI session only.
- Signed media URLs: runtime only; never proof docs.

Proof required:

- Remote migration list aligned.
- Creator video public/draft/non-owner RLS proof.
- Storage API upload/read/delete/non-owner-denial proof.
- Safety report and admin moderation proof.
- Entitlement active/expired/revoked proof.
- Watch-Party room/member access proof.
- Edge Function token request/denial proof.

Risks:

- Migration alignment does not prove RLS behavior.
- Direct SQL against storage can be misleading; Storage API proof is required.
- Service-role-only proof is not user-behavior RLS proof.

Next action:

- Run the Supabase proof lane after the backend owner provides approved remote DB login/session access, without exposing credentials.

## LiveKit / Realtime Server

Dashboards:

- LiveKit self-host/server admin: provider/host-specific.
- LiveKit Cloud only if the product owner later chooses it.
- Primary runtime domain: `wss://live.chillywoodstream.com`
- Status: `Partial / Proof Pending`

Purpose:

- Own production realtime audio/video media transport for Live Stage, Live First, Live Watch-Party, and Watch-Party Live camera presence.

Repo support:

- `@livekit/react-native`, `@livekit/react-native-webrtc`, `@livekit/react-native-expo-plugin`, and `livekit-client` are installed.
- `app.config.ts` has fallback `wss://live.chillywoodstream.com`.
- `_lib/runtimeConfig.ts` and `_lib/livekit/token-contract.ts` own runtime token endpoint/server URL.
- Supabase `livekit-token` function mints tokens server-side.
- Hetzner infra templates document host, domain, and LiveKit container posture.

Manual steps:

1. Confirm the production LiveKit host/provider is still intended.
2. Confirm `live.chillywoodstream.com` DNS resolves to the expected host/load balancer.
3. Confirm TLS certificate is valid and renewed.
4. Confirm WebSocket upgrade works for mobile.
5. Confirm firewall ports for WebSocket/API, UDP media, TCP fallback, and TURN if configured.
6. Confirm TURN/STUN domain and credentials if needed.
7. Confirm LiveKit API key/secret match the Supabase function secrets.
8. Confirm server logs do not expose participant tokens or secrets.
9. Run one-device and two-device Live Stage proof.
10. Run Wi-Fi/cellular and rejoin/stale-room proof.

Required values and where they live:

- `EXPO_PUBLIC_LIVEKIT_URL`: EAS env or fallback, public endpoint.
- `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT`: EAS env or fallback, public endpoint.
- `LIVEKIT_URL`: Supabase function secret.
- `LIVEKIT_API_KEY`: Supabase function secret and server config; treat as secret.
- `LIVEKIT_API_SECRET`: Supabase function secret and server config.
- TURN credentials: host/server secret store only.

Proof required:

- Authenticated token request succeeds.
- Signed-out/invalid role/missing room denied.
- One device connects to Live Stage.
- Two devices publish/subscribe and rejoin.
- Cellular/Wi-Fi mix works.
- No route drifts from Party Room to Live Stage.

Risks:

- Signaling success does not prove media path/TURN readiness.
- Cloudflare proxy or firewall choices can break WebRTC.
- LiveKit token role is not the same as Channel Audience Role Roster role.

Next action:

- Verify DNS/TLS/firewall/TURN/server health, then run bounded two-device production proof.

## Expo / EAS Dashboard

Dashboard:

- Project: `https://expo.dev/accounts/chillywood2025/projects/chillywood-mobile`
- Status: `External Setup Pending`

Purpose:

- Own Android builds, signing credentials, EAS env, update channels, EAS project ownership, and future Play submission handoff.

Repo support:

- `eas.json` has `development`, `preview`, and `production`.
- Production profile uses Android app bundle.
- App config has EAS project id `c384ed57-5454-4e80-81ad-dcc218b8a3c8`.
- `scripts/validate-runtime.mjs` validates runtime config without printing values.
- GitHub manual release workflow references EAS build with `EXPO_TOKEN`.

Manual steps:

1. Verify Expo account owner/access/2FA.
2. Verify EAS project belongs to `chillywood2025`.
3. Verify Android signing credentials for `com.chillywood.mobile`.
4. Decide versionCode strategy before next Play upload.
5. Configure EAS preview/production env values.
6. Run `npm run validate:runtime` and strict production validation before builds.
7. Run preview build after runtime lanes are ready.
8. Run production AAB only after preview proof.
9. Use `eas submit` only after Play Console submit credentials are ready.

Required values and where they live:

- `EXPO_TOKEN`: GitHub Actions secret or local secure shell for CI build, never repo.
- Android signing credentials/keystore/passwords: EAS credentials or secure local owner store, never repo.
- Public runtime env names: EAS env.

Proof required:

- EAS credentials verified without printing details.
- Preview build completes and installs.
- Production AAB build completes.
- Internal testing upload accepts AAB.
- Release build route smoke passes.

Risks:

- Old dev clients do not prove current native dependencies.
- VersionCode reuse blocks Play upload.
- Missing EAS env can produce a valid build pointed at wrong services.

Next action:

- Configure EAS env and credentials, then run preview build after external dashboard prerequisites are ready.

## Domain / DNS / Hosting

Dashboards:

- DNS provider for `chillywoodstream.com`.
- Hosting/reverse proxy/server dashboard for `live.chillywoodstream.com`.
- Status: `External Setup Pending / Proof Pending`

Purpose:

- Own LiveKit production domain, public legal/support URL routing, TLS certificates, domain renewal, and DNS/proxy posture.

Repo support:

- `app.config.ts` fallback legal URLs use `https://live.chillywoodstream.com/privacy`, `/terms`, and `/account-deletion`.
- LiveKit default uses `wss://live.chillywoodstream.com`.
- Hetzner docs record Caddy/TLS/static legal path posture.

Manual steps:

1. Confirm domain registrar/account owner and renewal status.
2. Confirm DNS provider owner, 2FA, and backup access.
3. Confirm `live.chillywoodstream.com` A/AAAA/CNAME target.
4. Confirm proxy/CDN mode does not break LiveKit/WebRTC.
5. Confirm TLS certificate covers `live.chillywoodstream.com` and renews automatically.
6. Confirm legal pages are publicly reachable without login.
7. Confirm account deletion URL is public and Play-compatible.
8. Confirm support URL/email.

Required values and where they live:

- DNS provider tokens: provider secret store only.
- TLS private keys: server/certificate manager only.
- Public URLs: EAS env and Play Console when final.

Proof required:

- `https://live.chillywoodstream.com/privacy`, `/terms`, and `/account-deletion` open publicly.
- LiveKit WebSocket/TLS path works.
- DNS/TLS checks saved without private keys.
- Domain owner and renewal path documented outside secrets.

Risks:

- A public legal route on the mobile app is not enough if Play requires an external web URL.
- CDN proxying can break WebSocket/media behavior.

Next action:

- Domain owner confirms DNS/TLS/routing and legal URL reachability from a public browser.

## Legal / Support / Manual Operations

Dashboard / owner system:

- Attorney/legal review process.
- Support inbox/ticketing.
- DMCA/contact process.
- Account deletion request workflow.
- Status: `External Setup Pending`

Purpose:

- Own final legal approval, support intake, account deletion process, DMCA/takedown process, abuse escalation, response expectations, and Play policy declarations.

Repo support:

- Expanded Terms, Privacy, Community Guidelines, Copyright/DMCA, Account Deletion, and Support pages exist.
- Signup acceptance copy links to Terms, Privacy, and Guidelines.
- Support screen includes account, billing, creator upload, safety, copyright, deletion, and emergency caveat copy.
- Account deletion is honest and request-based.

Manual steps:

1. Attorney/legal owner reviews all policy pages.
2. Finalize Privacy Policy URL.
3. Finalize Terms URL.
4. Finalize Community Guidelines URL.
5. Finalize Copyright/DMCA URL and contact.
6. Decide whether to register a designated DMCA agent with the U.S. Copyright Office.
7. Finalize account deletion request intake, verification, retention, and SLA.
8. Assign support inbox owner and response expectations.
9. Assign moderation escalation owner.
10. Fill Play Console legal/Data Safety/account deletion fields.

Required values and where they live:

- `EXPO_PUBLIC_PRIVACY_POLICY_URL`: EAS env.
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`: EAS env.
- `EXPO_PUBLIC_ACCOUNT_DELETION_URL`: EAS env.
- `EXPO_PUBLIC_SUPPORT_EMAIL`: EAS env.
- DMCA private/legal details: legal/support systems only unless intentionally public.

Proof required:

- Public URLs open without login.
- Support inbox receives test request.
- Account deletion request reaches correct owner.
- Play Console accepts legal/account deletion entries.
- Legal owner approves final wording.

Risks:

- Draft legal text is not attorney approval.
- Do not promise automated deletion until backend deletion is built and proved.
- UGC apps need visible report, moderation, policy, and takedown paths.

Next action:

- Legal/support owner approves final wording and public URL set before Play submission.

## GitHub / Repo Protection

Dashboard:

- GitHub repository settings.
- Status: `Proof Pending`

Purpose:

- Own branch protection, required checks, GitHub Actions secrets, PR hygiene, release workflow, repo access, and secret leakage prevention.

Repo support:

- `.github/workflows/phase1-ci.yml` runs lint and typecheck on `main` and pull requests.
- `.github/workflows/manual-public-v1-release.yml` provides a manual Android production build workflow using `EXPO_TOKEN` and public runtime secrets.
- PR template exists.
- `.gitignore` and docs warn against staging local metadata/secrets.

Manual steps:

1. Confirm `main` is protected.
2. Confirm required checks include lint/typecheck.
3. Confirm force push/deletion restrictions.
4. Confirm repo access is limited to approved owners.
5. Confirm GitHub Actions secrets exist only where needed:
   - `EXPO_TOKEN`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST`
   - any future approved release public config
6. Confirm no service-role keys, Play JSON, database password, LiveKit secret, keystore, or Firebase private credential is stored as a plain repo file.
7. Consider release tags once internal testing build is approved.

Required values and where they live:

- GitHub Actions secrets: GitHub repository/org secrets only.
- Release tags: Git refs after proof, not before.

Proof required:

- Branch protection screenshot/notes.
- Required checks run on current `main`.
- Manual release workflow has required secrets or is explicitly blocked until they are set.

Risks:

- GitHub Actions release workflow currently validates only the base runtime env names listed in the workflow; strict production env validation should be run before real release builds unless the workflow is updated in a separate config pass.

Next action:

- Repo owner verifies branch protection, required checks, and Actions secrets from GitHub settings.

## Other External Dependencies

| System | Why it matters | Current status | Next action |
| --- | --- | --- | --- |
| Expo Updates | Release channel/update delivery | Configured with EAS project URL; release proof pending | Verify release build uses intended channel/runtime version. |
| Google account / Android publisher account | Owns Play app and billing products | External Setup Pending | Confirm owner, 2FA, recovery, and business identity. |
| Support email provider | Receives support/deletion/DMCA contact | External Setup Pending | Confirm mailbox, aliases, SLA, and backups. |
| Legal web hosting | Serves public policy/account deletion URLs | External Setup Pending | Confirm unauthenticated public access and final legal copy. |
| Vendor account recovery | Prevents launch lockout | External Setup Pending | Assign primary and backup owners for Play, RevenueCat, Firebase, Supabase, Expo, DNS, server, and GitHub. |

## Master Dashboard Completion Order

Use this order unless repo control docs intentionally change it.

1. **Google Play app record + package confirmation**
   - Why first: Play package identity anchors subscriptions, signing, store listing, Data Safety, account deletion, and internal testing.
   - Proof closes it: Play app exists for `com.chillywood.mobile`; internal testing track exists.
   - Blocks next: RevenueCat Android product connection and first store-subscription proof.

2. **RevenueCat product / entitlement / offering**
   - Why second: Premium access gates need real entitlement truth before store proof.
   - Proof closes it: entitlement `premium`, offering `premium`, Android product/base plan connected.
   - Blocks next: `/subscribe` offer load, purchase proof, restore proof.

3. **EAS env values**
   - Why third: preview/release builds must point at intended Supabase, LiveKit, RevenueCat, Firebase, and legal URLs.
   - Proof closes it: `CHILLYWOOD_VALIDATE_PRODUCTION_ENV=1 npm run validate:runtime` passes from release env without printing values.
   - Blocks next: meaningful preview build proof.

4. **Android preview build**
   - Why fourth: Firebase, billing, legal links, LiveKit, Supabase, and route smoke need a release-like build.
   - Proof closes it: preview build completes, installs, and opens with expected runtime config.
   - Blocks next: Firebase proof, route smoke, store screenshots.

5. **Firebase proof**
   - Why fifth: Crash/performance dashboards need release-like app traffic.
   - Proof closes it: Crashlytics nonfatal/approved crash and Performance trace appear in dashboard.
   - Blocks next: diagnostics/Data Safety confidence.

6. **Supabase RLS / API / storage proof**
   - Why sixth: creator upload, Watch-Party, reports, admin, and entitlements must be secure before launch.
   - Proof closes it: owner/non-owner/public/admin/anon tests pass with sanitized artifacts.
   - Blocks next: final public proof and safety launch confidence.

7. **LiveKit production / two-device proof**
   - Why seventh: Live media depends on release runtime, token function secrets, DNS/TLS/firewall, and devices.
   - Proof closes it: two devices connect, publish/subscribe, rejoin, and work on Wi-Fi/cellular as required.
   - Blocks next: live feature release confidence.

8. **Play Store listing / Data Safety / content rating**
   - Why eighth: final descriptions and declarations should match proved behavior, not intended behavior.
   - Proof closes it: Play Console accepts listing, Data Safety, content rating, target audience, UGC/account deletion declarations.
   - Blocks next: internal testing/review readiness.

9. **Legal / DMCA / account deletion final approval**
   - Why ninth: policy language must align with actual external URLs and support workflows before submission.
   - Proof closes it: legal owner approval, public URLs, support inbox, DMCA/account deletion ownership.
   - Blocks next: production review.

10. **Play internal testing upload**
    - Why tenth: internal testing should use a current production-profile AAB after prior dashboards are ready.
    - Proof closes it: AAB accepted, testers can install, license tester purchase path available.
    - Blocks next: final release smoke.

11. **Final release smoke test**
    - Why last: it validates the actual release candidate with all dashboards configured.
    - Proof closes it: Auth, Profile/Channel, Creator Media, Player, Watch-Party, LiveKit, Chat, Admin denial, Premium gate, Settings/legal/support, Firebase, Supabase, and logs pass on a release-like build.
    - Blocks next: production submission.

## Manual Checklist Template

Use this template for every future dashboard lane:

```text
Dashboard:
Status:
Owner:
Login needed:
Manual steps:
Repo support:
Secrets/env needed:
Where secrets/env live:
What must never be committed:
Proof required:
Risks:
Next action:
```

## Public V1 Secret Name Index

Names only. Do not add values to this document.

Client-safe public config that may be intentionally embedded:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST`
- `EXPO_PUBLIC_BETA_ENVIRONMENT`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV`
- `EXPO_PUBLIC_LIVEKIT_URL`
- `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
- `EXPO_PUBLIC_ACCOUNT_DELETION_URL`
- `EXPO_PUBLIC_SUPPORT_EMAIL`
- `EXPO_PUBLIC_COMMUNICATION_ICE_SERVERS`
- `EXPO_PUBLIC_COMMUNICATION_STUN_URLS`
- `EXPO_PUBLIC_COMMUNICATION_TURN_URLS`
- `EXPO_PUBLIC_COMMUNICATION_TURN_USERNAME`
- `EXPO_PUBLIC_COMMUNICATION_TURN_CREDENTIAL`

Server/dashboard secrets that must never ship in the app client:

- `SUPABASE_SERVICE_ROLE_KEY`
- Supabase database password
- Supabase user JWTs and session tokens
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- LiveKit participant tokens
- TURN long-lived credentials
- RevenueCat private API keys
- RevenueCat webhook secrets
- Google Play service account JSON
- Firebase service account JSON/private keys
- EAS/Expo token
- Android keystore, store password, key alias password, and credential JSON
- DNS/provider tokens
- SSH private keys
- Signed creator-video URLs

## Dashboard Done Definition

A dashboard lane is not `Done` until all of the following are true:

1. The dashboard/manual action was performed by the responsible owner.
2. The app-side config points to the intended dashboard/project/product/domain.
3. The proof was run from the correct build/runtime environment.
4. The proof artifact exists outside committed source files or in an approved redacted proof location.
5. No secrets, private user data, purchase receipts, signed URLs, service keys, or tokens were stored in docs, commits, screenshots, or logs.
6. `docs/EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST.md` and `docs/PUBLIC_V1_READINESS_CHECKLIST.md` were updated only with facts that proof supports.

## Immediate Highest-Priority Dashboard Action

Start with Google Play Console app record/package confirmation for `com.chillywood.mobile`, because RevenueCat product mapping, Play Billing proof, Data Safety, account deletion declarations, internal testing, and production AAB upload all depend on the Play app record existing and matching the app package.

Do not start a production build or submit anything until the Play app record, RevenueCat product/entitlement mapping, EAS env values, and legal/support URL plan are ready.
