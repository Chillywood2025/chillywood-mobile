# BrowserStack E2E Modernity Check

Status: QA readiness contract, June 2026.

## Chosen Strategy

- Maestro-first for React Native flow specs.
- BrowserStack App Automate/App Live readiness for real-device Android proof.
- Appium only if Maestro cannot cover a flow.
- Stable `testID` / accessibility selectors only. Coordinate taps are not allowed unless an emergency fallback is documented in the proof.

## Why This Strategy

- React Native exposes stable `testID` values that work better than visual or coordinate targeting.
- Maestro can exercise final bundled mobile apps with readable YAML flows.
- BrowserStack App Automate/App Live can run or manually inspect the Play-style app path on real devices.
- BrowserStack app upload flows support reusable app identifiers/custom IDs, which keeps CI and manual proof repeatable.

## Freshness Check

Official docs to re-check before enabling paid BrowserStack automation:

- BrowserStack App Automate Maestro support: https://www.browserstack.com/docs/app-automate/maestro
- BrowserStack App Automate Maestro API reference: https://www.browserstack.com/docs/app-automate/api-reference/maestro/overview
- BrowserStack app upload/custom ID behavior: https://www.browserstack.com/docs/app-automate/appium/upload-app-define-custom-id
- Maestro React Native selector/testID docs: https://docs.maestro.dev/get-started/supported-platform/react-native
- EAS workflow support for invoking Maestro or BrowserStack jobs: https://docs.expo.dev/eas/workflows/get-started/
- Whether BrowserStack low-code/self-healing/AI testing is worth using for non-purchase smoke coverage.

Current decision: do not add a new paid automation dependency or Appium stack until Maestro-first selector flows are exhausted.

## Google Play Sandbox Note

Google Play purchase sheets may remain manual-assisted in BrowserStack App Live or Play-installed device proof. Automated flows should navigate to the purchase boundary and assert the app state before/after completion without coordinate tapping inside Google Play UI.
