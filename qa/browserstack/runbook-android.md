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

## Local Prep

1. Prepare fixture readback: `npm run qa:monetization:fixtures:readback`.
2. Grant tester access with the existing proof script or fixture prepare script.
3. Run Maestro smoke flows locally where possible.
4. Upload APK/AAB to BrowserStack and record app URL/custom ID.

## Proof Folder

Use `/tmp/chillywood-browserstack-monetization-e2e-proof-YYYYMMDD-HHMMSS`.

Save screenshots, XML dumps, fixture readback JSON, BrowserStack session IDs, and purchase-sheet manual notes.

## Manual-Assisted Boundary

For Google Play sandbox sheets, the automated flow may stop at the purchase boundary. Manual App Live can complete the purchase using the license tester account, then automation/readback resumes inside Chi'llywood.
