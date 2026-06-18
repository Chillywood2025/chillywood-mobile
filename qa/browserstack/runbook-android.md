# BrowserStack Android Runbook

## Strategy

Use Maestro-first selector flows against the installed app package `com.chillywood.mobile`. Use BrowserStack App Live for manual-assisted Google Play sandbox purchase steps when App Automate cannot safely interact with the Play sheet.

## Required Env

- `BROWSERSTACK_USERNAME`
- `BROWSERSTACK_ACCESS_KEY`
- `BROWSERSTACK_APP_ID` or uploaded app custom ID/latest app URL
- `CHILLYWOOD_E2E_OWNER_EMAIL`
- `CHILLYWOOD_E2E_OWNER_PASSWORD`
- `CHILLYWOOD_E2E_VIEWER_EMAIL`
- `CHILLYWOOD_E2E_VIEWER_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` for local/proof fixture scripts only, never app code

`SUPABASE_SERVICE_ROLE_KEY` is required for local fixture prepare/readback scripts that grant or revoke sandbox monetization tester access. It must live only in an ignored local env file such as `.env.browserstack-monetization.local`, must never be committed, and must never be imported by mobile app code. If it is missing, fixture prepare/readback must fail closed and sandbox tester grant/readback is not fully proved.

## Local Prep

0. Verify BrowserStack credentials without printing secrets:
   `node scripts/qa/browserstack-verify-access.mjs --proof-dir /tmp/chillywood-browserstack-setup-proof-YYYYMMDD-HHMMSS`.
   If `BROWSERSTACK_APP_ID` is missing, upload the existing APK only after confirming the artifact path:
   `node scripts/qa/browserstack-upload-app.mjs --proof-dir /tmp/chillywood-browserstack-setup-proof-YYYYMMDD-HHMMSS`.
   If the configured BrowserStack app points at a stale APK, rebuild the release APK first, then replace the app reference explicitly:
   `node scripts/qa/browserstack-upload-app.mjs --proof-dir /tmp/chillywood-browserstack-setup-proof-YYYYMMDD-HHMMSS --upload-even-if-app-id-present --upload-even-if-custom-id-present`.
   Keep returned app URLs only in ignored local env/proof files.
1. Prepare fixture readback: `npm run qa:monetization:fixtures:readback`.
2. Grant tester access with the existing proof script or fixture prepare script.
3. Run local non-purchase Maestro smoke flows with resolved temporary copies:
   `npm run qa:monetization:maestro:local -- --proof-dir /tmp/chillywood-local-monetization-e2e-proof-YYYYMMDD-HHMMSS`.
   Use `--dry-run` first to verify env resolution without launching the app.
4. Prepare the safe BrowserStack Maestro suite without creating sessions:
   `node scripts/qa/run-browserstack-maestro.mjs --proof-dir /tmp/chillywood-browserstack-setup-proof-YYYYMMDD-HHMMSS`.
   This dry-run resolves only `monetization-premium-smoke.yaml`, `monetization-premium-creator-separation.yaml`, and `monetization-owner-cannot-buy-own-offers.yaml`; it skips purchase-completion flows.
5. Run the BrowserStack Maestro suite only when explicitly approved for the specific safe flows:
   `node scripts/qa/run-browserstack-maestro.mjs --run --proof-dir /tmp/chillywood-browserstack-setup-proof-YYYYMMDD-HHMMSS`.

## BrowserStack Account-State Boundary

App Automate installs a clean app runtime. The safe non-purchase flows can prove route-level selector exposure on that runtime, but owner/tester-only assertions still require the BrowserStack device to reach the intended signed-in account state first. If a run shows route roots such as `premium-screen`, `screen-premium`, or `screen-platform` but then lands on logged-out Premium copy or Platform viewer mode, classify it as an account/env setup blocker, not a Premium gate or route selector regression. Do not weaken owner-only assertions or fake purchase/account state to make the run pass.

## OTA / Installed Runtime Check

Before local Maestro selector proof, confirm the installed app has the OTA/build that contains the selector contract commit:

1. Force close the app.
2. Relaunch and wait for OTA pickup.
3. Confirm runtime/update id if available.
4. Open `/subscribe` and verify `premium-screen` / `screen-premium` in UI hierarchy.
5. If selectors are missing but source contains them, treat it as stale installed runtime or OTA cache, not a product regression.

## Maestro Driver Retry Checklist

If Maestro fails with `Connection refused: localhost:7001` or another Android driver hierarchy error:

1. Close any running Maestro sessions.
2. Run `adb kill-server && adb start-server`.
3. Confirm the device with `adb devices`.
4. Force-stop the app.
5. Relaunch the app.
6. Rerun one non-purchase smoke flow.
7. If it still fails, mark local Maestro driver blocked. Do not change app code for driver instability.

## Proof Folder

Use `/tmp/chillywood-browserstack-monetization-e2e-proof-YYYYMMDD-HHMMSS`.

Save screenshots, XML dumps, fixture readback JSON, BrowserStack session IDs, and purchase-sheet manual notes.

## Manual-Assisted Boundary

For Google Play sandbox sheets, the automated flow may stop at the purchase boundary. Manual App Live can complete the purchase using the license tester account, then automation/readback resumes inside Chi'llywood.
