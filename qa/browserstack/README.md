# BrowserStack Final Regression Readiness

Status: prepared, not run.

This folder contains whole-app BrowserStack regression contracts for the launch-candidate QA pass. It is documentation and dry-run planning only. It does not start BrowserStack, upload an app, spend BrowserStack minutes, or store credentials.

## Runtime Rule

Android is the active proof lane. Final Android proof must use a Google Play internal testing install:

- package `com.chillywood.mobile`
- installer `com.android.vending`
- latest internal `versionCode`
- app/runtime version `1.0.0` unless superseded
- not Expo Dev Launcher

Do not run paid purchase regression from Expo Dev Launcher or a local debug APK.

iOS is a planned/deferred future lane only. Do not run iOS BrowserStack until Android final regression is closed and the user explicitly approves iOS work. iOS will require future Apple signing, App Store Connect setup, App Store IAP product setup, and RevenueCat Apple product proof before any iOS purchase or install proof can be claimed.

## Files

- `coverage-map.md`: whole-app coverage matrix and launch blockers.
- `personas.example.json`: labels and state requirements only; no passwords.
- `env.example`: placeholder environment variable names only.
- `runbook.md`: operator sequence for a future approved BrowserStack run.
- `flows/*.contract.md`: flow contracts with preconditions, steps, pass/fail criteria, artifact rules, and device/session requirements.

## Execution Boundary

BrowserStack remains deferred until the user explicitly approves:

- starting sessions
- uploading/installing app artifacts
- spending BrowserStack minutes
- using BrowserStack credentials

Local two-user proof for Chi'lly Chat and Watch-Party/LiveKit remains deferred until a second physical phone/session or approved BrowserStack run.

## Security Rules

- Do not commit passwords, BrowserStack keys, Google credentials, provider secrets, auth tokens, reset links, or raw provider payloads.
- Use secure local handoff for persona credentials.
- Capture test account labels only in screenshots/logs.
- Redact any auth URL before it enters notes or artifacts.
