# Android Release And EAS Signing Runbook

Date: 2026-04-26

Lane: Android release build / EAS signing readiness

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
| App version | `1.0.0` |
| Android package id | `com.chillywood.mobile` |
| URL scheme | `chillywoodmobile` |
| Production update channel | `production` through the `production` EAS profile |
| EAS CLI observed | `eas-cli/18.8.1` through `npx eas-cli --version` |
| Expo CLI observed | `54.0.23` through `npx expo --version` |
| Node/npm observed | Node `v22.15.0`, npm `11.12.1` |
| EAS account session | Logged in to the Chi'llywood Expo account during audit; no credentials were inspected |
| Current HEAD at lane audit | `23168e49dc8342bb573dbb06695ff2ef2328922a` |
| Build run in this lane | No |
| Submit run in this lane | No |

## Official Setup References

- Expo EAS Build overview: `https://docs.expo.dev/build/introduction/`
- Expo app credentials and Android signing: `https://docs.expo.dev/app-signing/app-credentials/`
- Expo EAS environment variables: `https://docs.expo.dev/eas/environment-variables/`
- Expo submit to Google Play: `https://docs.expo.dev/submit/android/`

Current Expo docs say EAS Build is the hosted service that creates Android/iOS binaries, can handle app signing credentials, and supports build profiles. Expo signing docs say store-distributed Android apps must be signed and that private keystores must not be checked into the repository. Expo environment docs say local `.env` files do not automatically exist on EAS Build workers and production values should be configured through EAS environments or dashboard-managed variables.

## EAS Config Status

`eas.json` exists and defines three build profiles plus one submit profile.

| Profile | Purpose | Current settings | Build artifact expectation | Status |
| --- | --- | --- | --- | --- |
| `development` | Dev client/internal testing | `developmentClient: true`, `distribution: internal`, `channel: development` | Android internal dev-client build | Implemented / Proof Pending |
| `preview` | Internal release-like testing | `developmentClient: false`, `distribution: internal`, `channel: preview` | Android internal build, likely APK unless EAS default changes or an Android build type is added | Implemented / Proof Pending |
| `production` | Play Store candidate | `distribution: store`, `channel: production`, Android `buildType: app-bundle` | Android App Bundle (`.aab`) | Implemented / Proof Pending |
| `submit.production` | Future Play submission | Empty submit profile exists | Requires Play service account / first manual upload requirements before use | External Setup Pending |

What is ready:

- Production profile already targets a store-distribution Android app bundle.
- EAS project id and Expo Updates URL are configured.
- The package id is present, which is required for Google Play submission.
- EAS CLI can read the project and the local Expo session is authenticated.
- Recent EAS build history contains older finished production Android builds for earlier commits, which proves the EAS project has built before, but not that current `main` is release-proven.

What remains:

- Current `main` has not been release-built in this lane.
- `versionCode` is not explicitly configured in `app.json` / `app.config.ts`. Previous production builds showed version code `1`; the release owner must decide whether to set/increment `android.versionCode` manually or use EAS remote app version management before any next Play upload.
- `eas.json` does not set an `environment` field on build profiles. Release env values must therefore be confirmed through EAS project environment variables, local shell for local commands, or explicit profile updates in a later approved config lane.
- No `.easignore` exists. The project currently relies on `.gitignore` plus EAS defaults; this is acceptable for this prep lane, but release owner should review build upload contents before first production proof.

## Android App Identity

| Field | Current value / evidence | Readiness |
| --- | --- | --- |
| Package / application id | `com.chillywood.mobile` in `app.json` | Correct target for Play/RevenueCat lane |
| App name | `Chi'llywood` in `app.json` | Ready, subject to final listing review |
| Version name | `1.0.0` from Expo `version` | Ready for first Public v1 candidate if product owner approves |
| Version code | Not explicitly configured; older EAS builds reported version code `1` | Must be managed/incremented before each Play upload |
| Scheme / deep links | `chillywoodmobile` | Present; deep-link smoke remains proof-pending |
| Runtime version | `{ "policy": "appVersion" }` | Ready; OTA updates must respect runtime compatibility |
| Updates URL | Expo Updates URL matches the EAS project id | Ready by config, proof-pending in release build |

The Android package id matches the current Chi'llywood Play/RevenueCat target in repo docs: `com.chillywood.mobile`.

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
- A generated debug keystore exists under ignored `/android/app/debug.keystore`; it is a local native-build artifact and is not a Play upload key.
- `.gitignore` now ignores `*.keystore` in addition to `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.pem`, `/android`, and `/ios`.
- The generated `/android` and `/ios` native folders are ignored and must not become accidental source-of-truth unless the project intentionally moves to checked-in native folders later.

Manual release-owner steps:

1. Run `npx eas-cli login` if the local session is not already authenticated.
2. Run `npx eas-cli credentials --platform android`.
3. Select the Chi'llywood project/app and the `production` profile.
4. Verify whether Android credentials already exist in EAS for `com.chillywood.mobile`.
5. If no credentials exist, choose EAS-managed upload keystore unless the release owner already has a Play-approved upload key to import.
6. If uploading a manually managed keystore, keep the keystore and `credentials.json` outside the repo and never paste passwords or aliases into chat/docs.
7. Confirm Google Play App Signing posture in Play Console. For first Play upload, follow Play's first-upload flow and opt into Play App Signing if required.
8. Record only non-secret proof facts in this runbook/checklist after verification: credential exists yes/no, managed by EAS yes/no, and Play App Signing status.

Stop conditions:

- Stop if EAS asks to generate or rotate credentials and the release owner has not approved it.
- Stop if EAS asks for a keystore path/password/alias and the owner has not prepared a secure local handoff.
- Stop if Play Console first-upload requirements or package ownership are not confirmed.

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
| `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY` | RevenueCat production Android public SDK key | Runtime config reads it; real release value pending external setup | External Setup Pending |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV` | RevenueCat dev/test Android public SDK key | Runtime config reads it; dev/test value may exist locally | Proof Pending |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | Hosted Privacy Policy | Runtime config reads it and has fallback | External Setup Pending until legal approval |
| `EXPO_PUBLIC_TERMS_OF_SERVICE_URL` | Hosted Terms | Runtime config reads it and has fallback | External Setup Pending until legal approval |
| `EXPO_PUBLIC_ACCOUNT_DELETION_URL` | Hosted account deletion page | Runtime config reads it and has fallback | External Setup Pending until Play/legal approval |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | Public support handoff | Runtime config reads it | External Setup Pending |
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
npx eas-cli credentials --platform android
```

Use `credentials` interactively only to verify or prepare signing. Do not paste credential details into docs or chat.

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
8. Confirm `versionCode` increment strategy.
9. Run static validation.
10. Create the production AAB with the command above.

After production AAB:

1. Download or reference the AAB from EAS without committing artifacts.
2. Upload manually to Google Play internal testing first if this is the first upload, because Expo submit docs note the first upload must be manual.
3. Complete Data Safety, account deletion, content rating, camera/microphone declarations, store listing assets, and billing/subscription setup.
4. Install from internal testing on at least one physical Android device.
5. Run final route smoke and release log audit.
6. Only then consider `npx eas-cli submit --platform android --profile production` for later automated submissions.

## Status Matrix

| Area | Status | Reason | Next action |
| --- | --- | --- | --- |
| EAS project/config | Implemented / Proof Pending | Project id, updates URL, and profiles exist | Run preview/production build after proof lanes |
| Production AAB profile | Implemented / Proof Pending | `production` profile uses Android `app-bundle` | Build current `main` when approved |
| Preview/internal profile | Implemented / Proof Pending | `preview` profile exists, but Android artifact type is not explicitly pinned | Use for internal release-like testing or add explicit artifact type later |
| EAS login | Proof Pending | Local session was authenticated during audit, but this is machine/user state | Release owner verifies before build |
| Android signing credentials | External Setup Pending | Not inspected or generated in this lane | Run `npx eas-cli credentials --platform android` manually |
| Play App Signing | External Setup Pending | Play Console state not inspected | Confirm in Play Console during first upload |
| Version code strategy | External Setup Pending | No explicit `android.versionCode`; older builds used version code `1` | Set/increment before next Play upload or configure EAS version management |
| Production env vars | External Setup Pending | Runtime owners exist; release dashboard values need confirmation | Configure EAS production env and run `npm run validate:runtime` |
| Firebase Android config | Implemented / Proof Pending | `google-services.json` exists and package matches | Prove Crashlytics/Performance in internal build |
| Native dependencies | Implemented / Proof Pending | Native packages/plugins are present | Fresh build required for current native stack |
| Permissions | Implemented / Proof Pending | Camera/mic/audio permissions declared | Confirm prompts and Play declarations in release build |
| Play upload/submit | External Setup Pending | Submit profile exists, but Play service account/first upload not proved | Manual internal-track upload first, EAS submit later |
| Release build proof | Proof Pending | No build run in this lane | Run preview then production build after proof lanes |

## Exact Next Action

Release owner should verify EAS Android credentials for `com.chillywood.mobile`, decide the version-code management strategy, configure the EAS production environment values, then run a preview Android build after the current Creator Media and route proof lanes are green. Do not run the production AAB until signing, environment, legal/store, Supabase, LiveKit, Firebase, and Premium setup blockers are intentionally cleared or documented as launch-pending.
