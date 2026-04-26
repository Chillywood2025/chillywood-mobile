# Firebase Crashlytics And Performance Runbook

Date: 2026-04-26

Lane: Firebase Crashlytics + Performance proof prep

Purpose: prepare Chi'llywood's Firebase diagnostics readiness for Public v1 without forcing a crash, running Android runtime proof, changing project identifiers, adding another analytics product, or exposing private config values.

This runbook is not proof that Firebase dashboards have received data from the current build. It records the current repo-backed setup, the remaining Firebase Console/manual proof, and the exact steps to prove Crashlytics and Performance later.

## Guardrails

- Do not force a test crash unless the product/release owner explicitly approves it for that proof session.
- Do not claim Crashlytics proof until the Firebase Console shows the expected non-fatal or crash for the correct Android app.
- Do not claim Performance proof until the Firebase Console shows the expected trace, app-start, screen, or network data for the correct Android app.
- Do not re-add Sentry, PostHog, or another monitoring product in this lane.
- Do not print or commit Google service API keys, private keys, service account JSON, crash payloads with personal data, Supabase JWTs, LiveKit tokens, RevenueCat receipts, purchase tokens, signed media URLs, or keystore details.
- Do not make release proof from Metro-only local behavior. Public v1 proof should use a preview or release-like Android build.
- Treat static repo inspection as readiness only, not proof.

## Current Repo Snapshot

| Item | Current status |
| --- | --- |
| Android package id | `com.chillywood.mobile` |
| Firebase project id | `chillywood-app` from safe `google-services.json` identity inspection |
| Firebase Android config | `google-services.json` exists, has one Android client, and the package name matches `com.chillywood.mobile` |
| Firebase config plugin owner | `app.config.ts` |
| Firebase config file owner | `firebase.json` |
| App shell bootstrap owner | `app/_layout.tsx` |
| Crashlytics owner | `_lib/firebaseCrashlytics.ts` |
| Performance owner | `_lib/firebasePerformance.ts` |
| Firebase app owner | `_lib/firebaseApp.ts` |
| Analytics/Remote Config support owners | `_lib/firebaseAnalytics.ts`, `_lib/firebaseRemoteConfig.ts` |
| Runtime error owner | `_lib/logger.ts`, `components/system/root-error-boundary.tsx` |
| Dev proof surface | `components/dev/dev-debug-overlay.tsx`, dev-only through `__DEV__` |
| Test crash run in this lane | No |
| Android runtime proof run in this lane | No |

## Official References

- Firebase Crashlytics Android test implementation: `https://firebase.google.com/docs/crashlytics/android/test-implementation`
- Firebase Crashlytics Android getting started: `https://firebase.google.com/docs/crashlytics/get-started?platform=android`
- Firebase Performance Monitoring for Android: `https://firebase.google.com/docs/perf-mon/get-started-android`
- React Native Firebase Crashlytics: `https://rnfirebase.io/crashlytics/usage`
- React Native Firebase Performance: `https://rnfirebase.io/perf/usage`

Current Firebase docs say Crashlytics implementation proof requires building/running the app, forcing or recording a test crash/report, restarting after a forced crash, and checking the Crashlytics dashboard. They also describe optional `adb logcat -s FirebaseCrashlytics` debugging. Firebase Performance docs say adding the SDK starts automatic app/screen lifecycle collection, network monitoring depends on the Performance Gradle plugin, data can take a few minutes to appear, and `adb logcat -s FirebasePerformance` can help verify event logging.

## Firebase Project And Config Status

Repo-backed truth:

- `google-services.json` exists at repo root.
- Safe identity inspection confirms:
  - Firebase project id: `chillywood-app`
  - Android package name: `com.chillywood.mobile`
  - one Android client is present
  - mobile SDK app id exists
  - Google service API key exists, but it was not printed
- `app.config.ts` resolves `./google-services.json` or `./android/app/google-services.json` and sets `android.googleServicesFile` when present.
- `app.config.ts` registers:
  - `@react-native-firebase/app`
  - `@react-native-firebase/crashlytics`
  - `@react-native-firebase/perf`
- `firebase.json` sets:
  - `crashlytics_auto_collection_enabled: true`
  - `crashlytics_debug_enabled: true`
- `package.json` includes:
  - `@react-native-firebase/app`
  - `@react-native-firebase/analytics`
  - `@react-native-firebase/crashlytics`
  - `@react-native-firebase/perf`
  - `@react-native-firebase/remote-config`

External setup still required:

- Firebase owner must verify the Firebase Console project `chillywood-app` is the intended production project.
- Firebase owner must verify the Android app package is `com.chillywood.mobile`.
- Firebase owner must verify Crashlytics is enabled for that Android app.
- Firebase owner must verify Performance Monitoring is enabled for that Android app.
- Release/privacy owner must confirm diagnostics, analytics, and performance collection are disclosed in Privacy/Data Safety materials.

## Crashlytics Readiness

Repo-backed truth:

- `_lib/firebaseCrashlytics.ts` lazily loads Crashlytics on native platforms only.
- `bootstrapFirebaseCrashlytics()` enables collection and writes a bootstrap log.
- `recordFirebaseCrashlyticsError()` records non-fatal errors with a scope string and sanitized stringified metadata.
- `identifyFirebaseCrashlyticsUser()` sets the authenticated user id and an email attribute when available.
- `clearFirebaseCrashlyticsUser()` clears user id/email attributes on sign-out.
- `runFirebaseCrashlyticsNonFatalTest()` records a controlled non-fatal test error.
- `triggerFirebaseCrashlyticsTestCrash()` calls Crashlytics `crash()`, but this must be used only in an approved proof session.
- `didFirebaseCrashlyticsCrashPreviously()` can read whether the previous execution ended in a crash.
- `app/_layout.tsx` bootstraps Crashlytics and identifies/clears the signed-in user.
- `components/system/root-error-boundary.tsx` sends recoverable app-shell errors through `reportRuntimeError()`, which records to Crashlytics.
- `components/dev/dev-debug-overlay.tsx` exposes dev-only buttons for non-fatal logging and forced native crash. The overlay returns `null` outside `__DEV__`.

Readiness status:

- Native packages and config plugins are present.
- Crashlytics bootstrap is wired into the app shell.
- Non-fatal recording helper exists.
- Forced crash helper exists but is dev-only and must not be run without approval.
- Dashboard receipt is not proved.
- Release/preview build receipt is not proved.

Proof status: Implemented / Proof Pending.

## Performance Monitoring Readiness

Repo-backed truth:

- `_lib/firebasePerformance.ts` lazily loads Performance Monitoring on native platforms only.
- `bootstrapFirebasePerformance()` enables Performance collection.
- `bootstrapFirebasePerformance()` records one manual custom trace named `app_runtime_bootstrap` with attribute `surface=app_shell` and metric `bootstrap_runs=1`.
- `runFirebasePerformanceTraceTest()` records a dev-only trace named `dev_monitoring_trace_probe`.
- `runFirebasePerformanceNetworkProbe()` creates a manual HTTP metric for the Supabase auth settings endpoint and does not print the anon key.
- `app/_layout.tsx` bootstraps Performance when the app shell mounts.
- `components/dev/dev-debug-overlay.tsx` exposes a dev-only Performance trace/network probe button.

Readiness status:

- Native package and config plugin are present.
- App-shell bootstrap is wired.
- Manual custom trace helper exists.
- Dev-only proof helper exists.
- Dashboard receipt is not proved.
- Release/preview build receipt is not proved.

Proof status: Implemented / Proof Pending.

## Config And Package Checklist

| Check | Repo result | Status |
| --- | --- | --- |
| Android package matches Firebase app | `google-services.json` package is `com.chillywood.mobile` | Implemented / Proof Pending |
| Firebase Android config file present | `google-services.json` exists | Implemented / Proof Pending |
| Firebase app plugin configured | `@react-native-firebase/app` in `app.config.ts` | Implemented / Proof Pending |
| Crashlytics plugin configured | `@react-native-firebase/crashlytics` in `app.config.ts` | Implemented / Proof Pending |
| Performance plugin configured | `@react-native-firebase/perf` in `app.config.ts` | Implemented / Proof Pending |
| Crashlytics package installed | `@react-native-firebase/crashlytics` in `package.json` | Implemented / Proof Pending |
| Performance package installed | `@react-native-firebase/perf` in `package.json` | Implemented / Proof Pending |
| Crashlytics collection posture visible | `firebase.json` enables auto collection and debug setting | Implemented / Proof Pending |
| Release build proof | Not run in this lane | Proof Pending |
| Firebase Console receipt | Not verified in this lane | Proof Pending |

## Privacy And Logging Checklist

Repo findings:

- Active Sentry runtime/package usage was not found.
- Active PostHog runtime/package usage was not found. Remaining PostHog mentions are archival/commentary or non-runtime proof docs.
- `debugLog()` in `_lib/logger.ts` is dev-only.
- Creator upload logs are dev-only.
- Player source and Watch-Party diagnostic logs were already moved behind dev-only logging in prior launch-readiness work.
- Firebase helper warnings are dev-only.
- Crashlytics receives runtime errors through `recordFirebaseCrashlyticsError()` in production by design.
- Crashlytics user identity currently includes user id and email attribute when a signed-in email exists.
- Firebase Analytics also sets user id and email user property.
- Performance network probe uses the Supabase anon key as a request header but does not log it. It is dev proof tooling, not a release user action.

Privacy and safety requirements before Public v1:

- Privacy Policy and Play Data Safety must disclose diagnostics/crash/performance collection if Firebase remains enabled.
- Privacy Policy and Play Data Safety must disclose user id/email association with diagnostics/analytics if that posture remains.
- No signed media URLs, Supabase JWTs, LiveKit participant tokens, RevenueCat receipts, purchase tokens, service-role keys, or Google service/private keys should be passed as Crashlytics metadata.
- Future report calls must keep metadata small and non-secret.
- Release log audit must still check native SDK logs, including RevenueCat billing logs, because that belongs partly to the billing lane and was not changed here.

No unsafe Firebase-lane log issue required a code change in this pass.

## Crashlytics Proof Steps

Use a preview or release-like Android build from current `main`. Do not treat Metro-only behavior as Public v1 proof.

1. Create or install a release-like Android build.
2. Open Firebase Console.
3. Select project `chillywood-app`.
4. Open Crashlytics for Android app package `com.chillywood.mobile`.
5. Launch the Chi'llywood build on a physical Android device.
6. Confirm the app starts and reaches a normal signed-in or signed-out route.
7. For non-fatal proof, use an approved proof hook that calls `runFirebaseCrashlyticsNonFatalTest()`.
   - In dev/internal builds, the dev debug overlay already has `Log Crashlytics Non-Fatal`.
   - If release proof needs a non-dev hook, add it only in a separate approved proof lane and remove/guard it afterward.
8. For forced crash proof, get explicit approval first.
9. Trigger the approved test crash path.
10. Relaunch the app after the forced crash so the report can upload.
11. If the dashboard is slow, enable bounded debug logging:
    - `adb shell setprop log.tag.FirebaseCrashlytics DEBUG`
    - `adb logcat -s FirebaseCrashlytics`
12. Look for upload completion signals without saving personal data or secrets.
13. Verify the event appears in the Crashlytics dashboard for `com.chillywood.mobile`.
14. Save proof screenshots/log summaries under `/tmp/chillywood-firebase-proof-*`.
15. Turn debug logging back down after proof:
    - `adb shell setprop log.tag.FirebaseCrashlytics INFO`

Do not mark Crashlytics Done until the dashboard receipt is captured.

## Performance Proof Steps

Use a preview or release-like Android build from current `main`.

1. Create or install a release-like Android build.
2. Open Firebase Console.
3. Select project `chillywood-app`.
4. Open Performance Monitoring for Android app package `com.chillywood.mobile`.
5. Launch Chi'llywood on a physical Android device.
6. Navigate across multiple screens:
   - Home
   - Profile/Channel
   - Channel Settings
   - Player
   - Watch-Party waiting room/Party Room if safe
   - Settings
7. Background and foreground the app a few times.
8. If using a dev/internal proof build, run `Run Perf Trace + Network Probe` from the dev debug overlay.
9. If using release proof only, rely on `app_runtime_bootstrap` plus automatic app/screen lifecycle events unless a separate approved proof hook is added.
10. If dashboard data is slow, use bounded debug logging:
    - `adb logcat -s FirebasePerformance`
11. Verify Performance dashboard receives app-start/screen/custom trace/network data.
12. Save proof screenshots/log summaries under `/tmp/chillywood-firebase-proof-*`.

Do not mark Performance Done until the dashboard receipt is captured.

## Manual Firebase Console Actions

1. Open Firebase Console.
2. Select project `chillywood-app`.
3. Verify the Android app package is `com.chillywood.mobile`.
4. Confirm `google-services.json` in the repo came from that same Android app.
5. Confirm Crashlytics is enabled and not waiting for SDK detection.
6. Confirm Performance Monitoring is enabled and not waiting for SDK detection.
7. Confirm Google Analytics/Performance/Crashlytics data collection posture is approved for Public v1.
8. Install a preview or release-like build from current `main`.
9. Trigger an approved non-fatal Crashlytics report.
10. Trigger an approved forced crash only if the owner approves that proof step.
11. Relaunch after a forced crash.
12. Verify Crashlytics dashboard receipt.
13. Generate app navigation and Performance trace/network events.
14. Verify Performance dashboard receipt.
15. Capture proof screenshots or written evidence outside the repo or under `/tmp`.
16. Update `CURRENT_STATE.md`, `NEXT_TASK.md`, `docs/EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST.md`, and `docs/PUBLIC_V1_READINESS_CHECKLIST.md` only after proof.

## Status Matrix

| Area | Status | Reason | Next action |
| --- | --- | --- | --- |
| Firebase Android config | Implemented / Proof Pending | Config file exists and package identity matches, but dashboard/project ownership proof is external | Firebase owner verifies Console app/package and config provenance |
| Crashlytics package/plugin | Implemented / Proof Pending | Package and config plugin are present | Build release-like app and verify dashboard receipt |
| Crashlytics bootstrap | Implemented / Proof Pending | App shell calls bootstrap and non-fatal helper exists | Run approved non-fatal proof |
| Crashlytics forced crash | Proof Pending | Helper exists dev-only; no crash was run | Run only after explicit approval |
| Performance package/plugin | Implemented / Proof Pending | Package and config plugin are present | Build release-like app and verify dashboard receipt |
| Performance bootstrap trace | Implemented / Proof Pending | `app_runtime_bootstrap` is wired | Verify trace appears in Firebase Console |
| Performance network/custom probe | Implemented / Proof Pending | Dev-only probe exists | Run in approved internal/dev proof build |
| Privacy/Data Safety disclosure | External Setup Pending | Firebase diagnostics/performance/analytics must be reconciled with policy copy | Legal/privacy owner updates Play Data Safety and Privacy Policy truth |
| Release log audit | Proof Pending | Static search found no Firebase-lane blocker, but release logs were not captured | Run bounded release log audit during release smoke |

## Stop Conditions

Stop and do not mark Done if:

- `google-services.json` does not match the Firebase Console Android app.
- Firebase Console project is not the intended Chi'llywood production project.
- Crashlytics dashboard does not receive the approved non-fatal or crash after proof.
- Performance dashboard does not receive app/screen/trace/network data after proof.
- Proof requires printing API keys, service account JSON, tokens, receipts, signed URLs, or personal payment data.
- Crashlytics metadata includes signed URLs, JWTs, LiveKit tokens, purchase receipts, service-role keys, or Google private credentials.
- Release build was not used for Public v1 proof.
- Privacy/Data Safety declarations do not match Firebase collection behavior.

## Exact Next Action

After the Android preview/release build lane is ready, run a bounded Firebase proof session:

1. Build/install a preview or release-like Android build from current `main`.
2. Confirm Firebase Console project `chillywood-app` and package `com.chillywood.mobile`.
3. Run approved Crashlytics non-fatal proof.
4. Run forced crash proof only with explicit owner approval.
5. Navigate the app to generate Performance events and run the dev/internal Performance probe if that build supports it.
6. Save dashboard screenshots/log summaries under `/tmp/chillywood-firebase-proof-*`.
7. Update the launch trackers from Proof Pending to Done only after Firebase Console receipt exists.
