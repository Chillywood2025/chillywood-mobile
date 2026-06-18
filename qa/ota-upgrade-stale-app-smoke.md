# OTA, Upgrade, And Stale App Smoke

Use this before BrowserStack reruns that depend on new selectors or route behavior.

## Checks

- Installed APK versionName/versionCode readback where available.
- Runtime version/readback where available through Expo Updates or app diagnostics.
- Confirm uploaded BrowserStack APK was built after selector/testID commits being tested.
- Launch installed APK with older OTA state and confirm no crash.
- Force close and relaunch to allow OTA pickup.
- Verify route selectors after fresh APK upload: `premium-screen`, `screen-premium`, `screen-platform`.
- Detect stale uploaded BrowserStack APK before sessions.
- Rollback-safe expectation: app opens safe fallback, not a migration mismatch crash.
- No endless spinner after relaunch.
- No raw update or migration error in UI.

## BrowserStack Policy

Do not rely on OTA to add selectors if a fresh APK can include them. Prefer uploading a fresh release APK and updating ignored local app ID/custom ID.
