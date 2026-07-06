# Android Release And EAS Signing Runbook

Date: 2026-04-26

Lane: Android release build / EAS signing readiness

Current release packet: `docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md`. Final release build/smoke remains a release operation unless explicitly run in the release lane. This lane did not submit the app to production and did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards. Package ID remains `com.chillywood.mobile`; app version/runtime remains `1.0.0`; Android versionCode is documented in `app.json` and future Play uploads use EAS release-owner build/version handling.

Purpose: prepare Chi'llywood's Android release build, EAS signing, production runtime environment, and Play upload handoff without starting a build, uploading to Google Play, rotating credentials, or exposing secrets.

This runbook is not proof that the current `main` commit has a passing release build. It records what is ready from repo/config inspection, what EAS/Google dashboard work remains, and exactly how the release owner should prove the lane later.

## Guardrails

- Do not run a full EAS build from an audit lane unless explicitly approved.
- Do not submit anything to Google Play until production proof is captured.
- Do not create, rotate, download, print, or commit upload keystores without explicit release-owner approval.
- Do not commit `.env`, `.env.local`, service account JSON, keystores, Google Play credentials, LiveKit secrets, Supabase service-role keys, RevenueCat secret keys, receipt payloads, or signed media URLs.
- EAS credentials and Play service account credentials belong in Expo/EAS/Google dashboards, not in the repo.
- Public client values such as Supabase anon keys and RevenueCat public SDK keys must still be intentionally configured in the correct release environment.
- Static config validation does not equal release build proof.

## Current Repo Snapshot

| Item | Current status |
| --- | --- |
| App name | `Chi'llywood` |
| Expo slug | `chillywood-mobile` |
| Expo owner | `chillywood2025` |
| Expo project id | `c384ed57-5454-4e80-81ad-dcc218b8a3c8` |
| Runtime version policy | `appVersion` |
| EAS app version source | `remote` in `eas.json` |
| App version | `1.0.0` |
| Android versionCode strategy | EAS remote app version management; production builds use `autoIncrement: true` |
| Android package id | `com.chillywood.mobile` |
| URL scheme | `chillywoodmobile` |
| Production update channel | `production` through the `production` EAS profile |
| Runtime update pickup | Native Expo Updates startup checking is explicit `ON_LOAD`; current source also checks/fetches compatible updates on launch and foreground resume through `_lib/runtimeUpdates.tsx` |
| EAS CLI observed | `eas-cli/18.8.1` through `npx eas-cli --version` |
| Expo CLI observed | `54.0.23` through `npx expo --version` |
| Node/npm observed | Node `v22.15.0`, npm `11.12.1` |
| EAS account session | Logged in to the Chi'llywood Expo account during audit; no credentials were inspected |
| Current HEAD at lane audit | `23168e49dc8342bb573dbb06695ff2ef2328922a` |
| Build run in this lane | No |
| Submit run in this lane | No |
| Latest EAS version read check | `npx eas-cli build:version:get --platform android --profile production --json` returned `{}` after enabling remote source, so the remote Android version record still needs release-owner initialization/verification before any Play upload |

## May 14, 2026 Google Play ADI Verification Proof

Google Play Android developer/package verification is complete for `com.chillywood.mobile`.

Proof facts:

- Play Console accepted the Android developer/package ownership verification.
- The selected signing certificate fingerprint is verified as `2B:A7:84:1B:70:6B:E8:69:E8:0F:EA:DA:43:8D:14:33:34:D6:E8:70:99:63:FA:B9:63:94:07:4E:9D:D0:95:43`.
- The verification APK included `assets/adi-registration.properties` and was built only for ADI ownership verification.
- The ADI APK is archive proof only and is no longer operationally needed.
- No private keys, keystore passwords, Play service account JSON, credential files, or signing secrets are committed.

This proof does not close production release readiness. A production AAB was built through EAS as `aedded50-3818-4d7b-8bcf-9bb9c2d36513` with versionCode `2`, and that first AAB was manually uploaded to Google Play Internal Testing as `Internal test v2 - RevenueCat Premium setup`. After the manual upload, Android Publisher API package visibility for `com.chillywood.mobile` returns `200`. A newer production build `96e60082-00b1-48dc-843b-132ce82a7710` completed after the public Admin sign-in link removal, incremented versionCode to 3, produced an AAB artifact, and EAS submitted it to the internal track only as submission `920c452f-1b9f-401c-94c9-616801684939`. After the Play payments profile appeared registered, Android Publisher API proof created/verified Google Play subscription `premium_subscription`; monthly base plan `monthly` is `ACTIVE`, billing period is `P1M`, and the US price is `$9.99/month`. RevenueCat product `premium_subscription:monthly` exists, is attached to entitlement `premium`, is attached to package `$rc_monthly` under offering `premium`, and offering `premium` is current. May 15, 2026 physical-device proof on `R3CXA0DS5JV` installed versionCode `3` from Google Play, loaded `/subscribe`, opened the Google Play no-charge test sheet for Chi'llywood Premium at `$9.99/5 min`, completed purchase, proved active RevenueCat sandbox entitlement, restored purchases, canceled through Google Play, waited for test-cycle expiry, proved active entitlements dropped to zero, and proved Watch-Party returns to Premium-required blocking. Google Play Data Safety/account deletion acceptance and full release-route smoke remain separate.

## Official Setup References

- Expo EAS Build overview: `https://docs.expo.dev/build/introduction/`
- Expo app credentials and Android signing: `https://docs.expo.dev/app-signing/app-credentials/`
- Expo EAS environment variables: `https://docs.expo.dev/eas/environment-variables/`
- Expo submit to Google Play: `https://docs.expo.dev/submit/android/`

Current Expo docs say EAS Build is the hosted service that creates Android/iOS binaries, can handle app signing credentials, and supports build profiles. Expo signing docs say store-distributed Android apps must be signed and that private keystores must not be checked into the repository. Expo environment docs say local `.env` files do not automatically exist on EAS Build workers and production values should be configured through EAS environments or dashboard-managed variables.

## Runtime Update Pickup

Current source hardens EAS Update pickup for testers:

- `app.config.ts` sets `updates.checkAutomatically` to `ON_LOAD`.
- `app/_layout.tsx` mounts `RuntimeUpdateGate` from `_lib/runtimeUpdates.tsx`.
- `RuntimeUpdateGate` checks shortly after app launch and when the app returns to the foreground.
- If a compatible production-channel update is available, the app fetches it and reloads once per fetched update after UI interactions settle.
- Resume checks are throttled to avoid polling or battery/network churn.
- June 3, 2026 Android production update group `02cbd580-7408-453e-ab79-d60b6a9365c1` published this gate for runtime `1.0.0` from commit `dd0f7f0`; Android update id `019e8dcd-c189-720d-a94e-eda03547e3ef`.

Release implication:

- This improves OTA pickup only after the installed app already contains this gate.
- If testers are stuck on a stale embedded Play internal build, the reliable path is a fresh Play internal build from current `main`.
- OTA can update JavaScript/assets only within the same runtime version; native dependency/config changes still require a new build.

June 3, 2026 Play internal v21 result:

- EAS production Android build `e673e68e-a9c3-4839-8e50-e95ccd88cfc4` finished successfully.
- Build source: commit `d08e8842a7fef4b4aa4c8f14fb69b4f0b730a7e5`, runtime `1.0.0`, production channel.
- App version: versionName `1.0.0`, versionCode `21`.
- AAB: `https://expo.dev/artifacts/eas/uswj4PW1gA45iegpMGACJ1.aab`.
- Auto-submit scheduled Google Play internal submission `cf08d9e9-96ac-481d-afbd-349d8389ffd6`, then the local wait lost its Expo GraphQL connection.
- Retrying the same finished build scheduled `51ea9b1d-f00a-4e7b-94f5-f4c665c4f6ae` and Google Play rejected it with `You've already submitted this version of the app`, proving versionCode `21` had already reached Play.
- Next proof is external/device: wait for Play internal processing/cache propagation, install/update v21 from the tester link, then prove signup and Brand Studio on the Play-delivered artifact.

## EAS Config Status

`eas.json` exists and defines three build profiles plus one submit profile. It now sets `cli.appVersionSource` to `remote`, which is the safer strategy for this repo because Google Play requires every uploaded Android artifact to use a strictly higher `versionCode`. The app-facing version name remains in repo config as Expo `version: 1.0.0`, while Android build numbers are managed by EAS server-side state.

| Profile | Purpose | Current settings | Build artifact expectation | Status |
| --- | --- | --- | --- | --- |
| `development` | Dev client/internal testing | `developmentClient: true`, `distribution: internal`, `channel: development` | Android internal dev-client build | Implemented / Proof Pending |
| `preview` | Internal release-like testing | `developmentClient: false`, `distribution: internal`, `channel: preview` | Android internal build, likely APK unless EAS default changes or an Android build type is added | Implemented / Proof Pending |
| `production` | Play Store candidate | `autoIncrement: true`, `distribution: store`, `channel: production`, Android `buildType: app-bundle` | Android App Bundle (`.aab`) with EAS-managed Android build number | Implemented / Proof Pending |
| `submit.production` | Future Play submission | Empty submit profile exists | Requires Play service account / first manual upload requirements before use | External Setup Pending |

What is ready:

- Production profile already targets a store-distribution Android app bundle.
- `cli.appVersionSource` is set to `remote`, removing the EAS warning about missing app version source.
- Production builds are configured to auto-increment the EAS-managed Android build number.
- EAS project id and Expo Updates URL are configured.
- The package id is present, which is required for Google Play submission.
- EAS CLI can read the project and the local Expo session is authenticated.
- Recent EAS build history contains older finished production Android builds for earlier commits, which proves the EAS project has built before, but not that current `main` is release-proven.

What remains:

- Current `main` has been release-built for the Android App Links closure lane.
- `android.versionCode` is intentionally not configured locally because `remote` app version source is the selected strategy. The latest read-only EAS version check returned `{}`, so before the next Play upload the release owner must initialize or sync the remote EAS Android build number with `npx eas-cli build:version:set --platform android --profile production` and verify it is greater than any `versionCode` already accepted by Google Play.
- `eas.json` does not set an `environment` field on build profiles. Release env values must therefore be confirmed through EAS project environment variables, local shell for local commands, or explicit profile updates in a later approved config lane.
- No `.easignore` exists. The project currently relies on `.gitignore` plus EAS defaults; this is acceptable for this prep lane, but release owner should review build upload contents before first production proof.

## Android App Identity

| Field | Current value / evidence | Readiness |
| --- | --- | --- |
| Package / application id | `com.chillywood.mobile` in `app.json` | Correct target for Play/RevenueCat lane |
| Play package/developer verification | Complete for `com.chillywood.mobile`; selected signing fingerprint `2B:A7:84:1B:70:6B:E8:69:E8:0F:EA:DA:43:8D:14:33:34:D6:E8:70:99:63:FA:B9:63:94:07:4E:9D:D0:95:43` verified in Play Console | Done for package ownership only; production release proof remains pending |
| App name | `Chi'llywood` in `app.json` | Ready, subject to final listing review |
| Version name | `1.0.0` from Expo `version` | Ready for first Public v1 candidate if product owner approves |
| Version code | EAS remote app version source with production `autoIncrement: true`; Android App Links closure build produced Play internal versionCode `80` | Verify remote value before each future Play upload |
| Scheme / deep links | Custom scheme `chillywoodmobile`; Android App Links Closed for `https://chillywoodstream.com` app-owned paths | `chillywoodstream.com` serves valid Digital Asset Links JSON, Play internal v80 contains the manifest filters, Play Console showed `All links working`, and Android 16 device verification passed |
| Runtime version | `{ "policy": "appVersion" }` | Ready; OTA updates must respect runtime compatibility |
| Updates URL | Expo Updates URL matches the EAS project id | Ready by config, proof-pending in release build |

The Android package id matches the current Chi'llywood Play/RevenueCat target in repo docs: `com.chillywood.mobile`.

Android App Links release implication:

- `app.config.ts` defines `https` / `autoVerify: true` intent filters for `chillywoodstream.com`.
- Approved paths are app-owned auth/callback, Profile, Platform, Player/content, Spectator, Title, and Watch-Party/Live Stage routes.
- Public legal/support paths remain browser-first and should not be claimed for app opening.
- App Links closure used EAS Build `4c27d4a2-1b54-48d0-93a2-266c3c430dae`, EAS Submit `35894152-a50a-4edf-b5d3-a9b53a760638`, and Google Play internal versionCode `80`.
- `public-site/legal-site/site/.well-known/assetlinks.json` is deployed at `https://chillywoodstream.com/.well-known/assetlinks.json` with the public Play App Signing SHA-256 fingerprint for `com.chillywood.mobile`.
- Do not use OTA-only release proof for future App Links manifest changes because manifest filters are native config.

## Native Dependency Rebuild Notes

The following native dependencies or config plugins affect Android builds and require a new dev-client/preview/production build when they are added, removed, or upgraded:

- `expo-document-picker`: creator video file picker and upload lane.
- `@livekit/react-native`, `@livekit/react-native-expo-plugin`, `@livekit/react-native-webrtc`, `livekit-client`: Live Stage, Watch-Party Live camera/social layer, WebRTC ownership.
- `@react-native-firebase/app`, `@react-native-firebase/analytics`, `@react-native-firebase/crashlytics`, `@react-native-firebase/perf`, `@react-native-firebase/remote-config`: Firebase app, diagnostics, analytics, performance, remote config.
- `react-native-purchases`, `react-native-purchases-ui`: RevenueCat billing and Premium subscription UI.
- `expo-camera`: camera-related native permissions and capture surfaces.
- `expo-notifications`: notification permission/runtime behavior if push delivery is pulled into scope.
- `expo-av`, `expo-video`: media playback surfaces.
- `expo-dev-client`: development-client build shape.
- `expo-build-properties`: native build settings plugin.

Release implication:

- Any dependency or plugin change in the list above invalidates old installed clients for that native behavior.
- Creator upload already required a dev-client rebuild after `expo-document-picker`.
- Current Public v1 release proof must be performed on a fresh preview or production build from current `main`, not an older April 11 production build.

## Signing And Credential Readiness

What is known:

- Expo docs state EAS can generate/manage Android signing credentials or use credentials supplied by the owner.
- No production keystore or service account credential was inspected or downloaded in this lane.
- Google Play Android developer/package verification is complete for `com.chillywood.mobile`; the selected public signing certificate fingerprint is verified in Play Console. This is public certificate proof only and does not expose or replace private signing material.
- A generated debug keystore exists under ignored `/android/app/debug.keystore`; it is a local native-build artifact and is not a Play upload key.
- `.gitignore` now ignores `*.keystore` in addition to `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.pem`, `/android`, and `/ios`.
- The generated `/android` and `/ios` native folders are ignored and must not become accidental source-of-truth unless the project intentionally moves to checked-in native folders later.

Manual release-owner steps:

1. Run `npx eas-cli login` if the local session is not already authenticated.
2. Run `npx eas-cli credentials --platform android`.
3. Select the Chi'llywood project/app and the `production` profile.
4. Verify whether Android production release credentials already exist in EAS for `com.chillywood.mobile`.
5. If no credentials exist, choose EAS-managed upload keystore unless the release owner already has a Play-approved upload key to import.
6. If uploading a manually managed keystore, keep the keystore and `credentials.json` outside the repo and never paste passwords or aliases into chat/docs.
7. Google Play package ownership verification is complete. Still confirm Google Play App Signing posture in Play Console before production AAB/internal-testing upload. For first Play upload, follow Play's first-upload flow and opt into Play App Signing if required.
8. Record only non-secret proof facts in this runbook/checklist after verification: credential exists yes/no, managed by EAS yes/no, and Play App Signing status.

Stop conditions:

- Stop if EAS asks to generate or rotate credentials and the release owner has not approved it.
- Stop if EAS asks for a keystore path/password/alias and the owner has not prepared a secure local handoff.
- Stop if Play Console first-upload requirements, production release signing posture, or upload-key requirements are not confirmed.

## Production Environment And Secrets Readiness

Production EAS builds need the following values intentionally configured through EAS environment variables/dashboard or a secure release process. Do not commit them to the repo.

| Variable / config | Purpose | Current repo/config posture | Release status |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase client URL | Runtime config reads it; static local config has a deployed fallback/source truth | Proof Pending |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase public client key | Runtime config reads it; public anon key is not a service role key but must be intentional | Proof Pending |
| `EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST` | Admin/operator public-v1 gate support | Runtime validation requires it | Proof Pending |
| `EXPO_PUBLIC_BETA_ENVIRONMENT` | `closed-beta` or `public-v1` runtime gate | Runtime validation requires it | Proof Pending |
| `EXPO_PUBLIC_LIVEKIT_URL` | LiveKit WebSocket server | Runtime config reads it and has deployed fallback | Proof Pending |
| `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT` | Supabase Edge Function token endpoint | Runtime config reads it and has deployed fallback | Proof Pending |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY` | RevenueCat production Android public SDK key | Runtime config reads it; EAS production env is configured; local `.env` remains intentionally uncommitted | EAS Production Configured / Internal Test Purchase Proof Passed |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV` | RevenueCat dev/test Android public SDK key | Runtime config reads it; dev/test value may exist locally | Proof Pending |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | Hosted Privacy Policy | Runtime config reads it and has fallback | External Setup Pending until legal approval |
| `EXPO_PUBLIC_TERMS_OF_SERVICE_URL` | Hosted Terms | Runtime config reads it and has fallback | External Setup Pending until legal approval |
| `EXPO_PUBLIC_ACCOUNT_DELETION_URL` | Hosted account deletion page | Runtime config reads it and has fallback | External Setup Pending until Play/legal approval |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | Public support handoff | Runtime config reads it and `app.config.ts` falls back to `support@chillywoodstream.com` | Inbox Proof Passed |
| `EXPO_PUBLIC_COMMUNICATION_ICE_SERVERS` and related STUN/TURN vars | Chi'lly Chat / communication fallback media networking | Runtime config reads them; LiveKit also has its own production network lane | Proof Pending |
| `google-services.json` | Firebase Android app config | Present; project/package identity matches `chillywood-app` / `com.chillywood.mobile` | Proof Pending |

Recommended EAS environment setup:

1. Create or verify a `production` EAS environment in Expo.
2. Add public client values with the least sensitive visibility that still works for EAS Build and EAS Update.
3. Add sensitive or secret values only when they are truly required by build steps; public Expo runtime values cannot be EAS `secret` if the app must read them at runtime.
4. Add `environment: "production"` to the `production` profile only in a separate approved config lane if the team decides to bind builds explicitly to the EAS production environment.
5. Run `npm run validate:runtime` from a shell that has the intended production values before creating the build.
6. Run `npx expo config --type public` and inspect only non-secret shape/presence, not raw values.

## Permissions Readiness

Declared Android permissions in `app.json`:

- `CAMERA`
- `RECORD_AUDIO`
- `MODIFY_AUDIO_SETTINGS`

Feature implications:

- Camera and microphone are required for Live Stage / LiveKit live rooms and communication surfaces.
- Internet/network access is implicit in Android apps and required by Supabase, LiveKit, Firebase, RevenueCat, Expo Updates, and media playback.
- Creator video upload uses the Android document picker through `expo-document-picker`; no broad storage/media permission is declared in `app.json`.
- `expo-notifications` is installed, but push delivery is not Public v1-proved and remains optional/non-blocking unless product scope changes.
- Native game streaming / screen capture / foreground service requirements are later phase and must not be added for Public v1 without a separate native-lane plan.

Play Console/Data Safety implications:

- Declare camera and microphone purpose for live rooms/communication.
- Declare selected-file media upload behavior for creator uploads.
- Declare Firebase diagnostics/performance/analytics only according to final collection posture.
- Do not claim push notifications, native game streaming, or background screen capture as live unless release proof exists.

## Safe Commands For The Release Owner

Run these before any preview or production build:

```bash
npm run validate:runtime
npm run typecheck
npm run lint
git diff --check
npx expo config --type public
```

Check EAS account/project state without creating a build:

```bash
npx eas-cli whoami
npx eas-cli build:list --platform android --limit 3 --non-interactive
npx eas-cli build:version:get --platform android --profile production --json
npx eas-cli credentials --platform android
```

Use `credentials` interactively only to verify or prepare signing. Use `build:version:set` interactively only after the release owner has confirmed the highest Android `versionCode` already uploaded to Play Console:

```bash
npx eas-cli build:version:set --platform android --profile production
```

Do not paste credential details, Play Console private information, or secrets into docs or chat.

Create a release-like internal preview build when approved:

```bash
npx eas-cli build --platform android --profile preview --non-interactive
```

Create the production Google Play AAB when approved:

```bash
npx eas-cli build --platform android --profile production --non-interactive
```

Submit later, only after Play Console prerequisites and first manual upload requirements are satisfied:

```bash
npx eas-cli submit --platform android --profile production
```

Do not use `--auto-submit` until internal testing, Play service account setup, and rollback procedure are ready.

## Preview Build Install And Test Steps

When a preview build is created:

1. Open the EAS build details page from `npx eas-cli build:list`.
2. Download the Android artifact or install via Expo's tester flow if available.
3. Install on a physical Android device.
4. Confirm app opens with the expected app name, icon, splash, package, and production/preview runtime environment.
5. Run a short route smoke:
   - Auth/sign-in/sign-out
   - Settings/legal/support/account deletion links
   - Profile/Channel owner and public view
   - Channel Settings creator upload/manage surface
   - Player platform title
   - Player creator video
   - Platform title Watch-Party
   - Creator-video Watch-Party
   - Live Stage
   - Chat
   - Admin denial for non-operator
   - Premium blocked state for non-premium
6. Capture screenshots/logs under `/tmp/chillywood-android-release-proof-*`.
7. Do not save signed URLs, tokens, purchase receipts, or EAS credential details in proof artifacts.

## Production AAB And Play Upload Steps

Before production AAB:

1. Complete Creator Media remaining proof and final route smoke priorities from `NEXT_TASK.md`.
2. Complete account/legal/Data Safety lane or confirm external pending status.
3. Complete Premium/RevenueCat setup if Premium gates ship live.
4. Complete Firebase Crashlytics/Performance proof prep.
5. Complete Supabase live RLS/storage proof.
6. Complete LiveKit production network proof.
7. Confirm EAS signing credentials.
8. Verify or initialize EAS remote Android build number state and ensure the next production build number is higher than any Play-uploaded `versionCode`.
9. Run static validation.
10. Create the production AAB with the command above.

After production AAB:

1. Download or reference the AAB from EAS without committing artifacts.
2. For the first upload, use the already-completed manual Play Console path; build `aedded50-3818-4d7b-8bcf-9bb9c2d36513` / versionCode `2` is uploaded to Internal Testing. Later builds may use EAS submit only when configured for the internal track and after the build artifact exists.
3. Complete Data Safety, account deletion, content rating, camera/microphone declarations, store listing assets, and billing/subscription setup.
4. Install from internal testing on at least one physical Android device.
5. Run final route smoke and release log audit.
6. Only then consider `npx eas-cli submit --platform android --profile production` for later automated submissions.

## Status Matrix

| Area | Status | Reason | Next action |
| --- | --- | --- | --- |
| EAS project/config | Implemented / Proof Pending | Project id, updates URL, and profiles exist | Run preview/production build after proof lanes |
| Production AAB profile | Internal Test Purchase Proof Passed / Release Smoke Pending | `production` profile uses Android `app-bundle`; build `aedded50-3818-4d7b-8bcf-9bb9c2d36513` completed for versionCode `2` and was manually uploaded to Internal Testing; build `96e60082-00b1-48dc-843b-132ce82a7710` completed for versionCode `3`; EAS submitted versionCode `3` to the internal track only as submission `920c452f-1b9f-401c-94c9-616801684939`; Play subscription `premium_subscription` monthly base plan `monthly` is active at $9.99/month; RevenueCat offering `premium` is current with `$rc_monthly` attached to `premium_subscription:monthly`; physical-device proof passed product load, no-charge Google Play test purchase, RevenueCat active entitlement, restore, cancellation/expiry, and Premium gate re-block | Run final release route smoke, Play Data Safety/account-deletion/listing acceptance, and any fresh-login/Owner-Admin device proof with safe exported credentials |
| Preview/internal profile | Implemented / Proof Pending | `preview` profile exists, but Android artifact type is not explicitly pinned | Use for internal release-like testing or add explicit artifact type later |
| EAS login | Proof Pending | Local session was authenticated during audit, but this is machine/user state | Release owner verifies before build |
| Android signing credentials | External Setup Pending | Not inspected or generated in this lane | Run `npx eas-cli credentials --platform android` manually |
| Play App Signing | External Setup Pending | Play Console state not inspected | Confirm in Play Console during first upload |
| Version code strategy | Implemented / Proof Pending | `cli.appVersionSource` is `remote` and production uses `autoIncrement: true`; latest remote read returned `{}` and older builds used version code `1` | Initialize/verify remote EAS Android build number before next Play upload |
| Production env vars | External Setup Pending | Runtime owners exist; release dashboard values need confirmation | Configure EAS production env and run `npm run validate:runtime` |
| Firebase Android config | Implemented / Proof Pending | `google-services.json` exists and package matches | Prove Crashlytics/Performance in internal build |
| Native dependencies | Implemented / Proof Pending | Native packages/plugins are present | Fresh build required for current native stack |
| Permissions | Implemented / Proof Pending | Camera/mic/audio permissions declared | Confirm prompts and Play declarations in release build |
| Play upload/submit | External Setup Pending | Submit profile exists, but Play service account/first upload not proved | Manual internal-track upload first, EAS submit later |
| Release build proof | Proof Pending | No build run in this lane | Run preview then production build after proof lanes |

## Exact Next Action

Release owner should verify EAS Android credentials for `com.chillywood.mobile`, initialize/confirm the remote EAS Android build number, configure the EAS production environment values, then run a preview Android build after the current Creator Media and route proof lanes are green. Do not run the production AAB until signing, environment, legal/store, Supabase, LiveKit, Firebase, and Premium setup blockers are intentionally cleared or documented as launch-pending.
