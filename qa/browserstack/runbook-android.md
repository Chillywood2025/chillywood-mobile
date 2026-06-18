# BrowserStack Android Runbook

## Strategy

Use Maestro-first selector flows against the installed app package `com.chillywood.mobile`. Use BrowserStack App Live for manual-assisted Google Play sandbox purchase steps when App Automate cannot safely verify the Play sheet. BrowserStack App Automate must not use coordinate taps or claim a purchase pass without post-purchase app state and backend readback.

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

## Codex Repair Loop

Use `qa/browserstack/codex-repair-loop-policy.md` and `scripts/qa/browserstack-repair-loop.mjs` when a BrowserStack smoke fails.

Codex can auto-fix narrow QA/test/app-state blockers such as missing selectors, Maestro wait timeouts, wrong deep links, stale APK detection, runner bugs, fixture readback script bugs, env guard bugs, docs mismatches, overly strict non-purchase assertions, and safe `collapsable={false}` selector placement. After a safe fix, rerun only the failed flow.

Codex must stop when purchase confirmation is human-required, when BrowserStack App Live manual interaction is needed, or when a proposed fix would touch RevenueCat/Google Play production purchase logic, Premium entitlement logic, RLS/security policy, service-role handling, live money, payouts, LiveKit authority, Watch-Party shared player, Chi'lly Chat, production data deletion, or broad route/product refactors. Do not weaken live money, payouts, Premium gates, RLS, LiveKit authority, Watch-Party shared player, or Chi'lly Chat to make a test pass.

To hand Codex evidence, provide the BrowserStack build/session links plus the proof folder containing `browserstack_run.log`, `session_links.txt`, redacted Maestro logs, screenshots, and readback logs. Codex should classify the failure first, then either print `AUTO_FIX_ALLOWED`, `HUMAN_REQUIRED`, or `FAIL_CLOSED`.

Example non-purchase repair loop:

`node scripts/qa/browserstack-repair-loop.mjs --flow monetization-premium-smoke.yaml --run --proof-dir /tmp/chillywood-browserstack-repair-loop-YYYYMMDD-HHMMSS`

## BrowserStack Account-State Boundary

App Automate installs a clean app runtime. The safe non-purchase flows can prove route-level selector exposure on that runtime, but owner/tester-only assertions still require the BrowserStack device to reach the intended signed-in account state first. If a run shows route roots such as `premium-screen`, `screen-premium`, or `screen-platform` but then lands on logged-out Premium copy or Platform viewer mode, classify it as an account/env setup blocker, not a Premium gate or route selector regression. Do not weaken owner-only assertions or fake purchase/account state to make the run pass.

## Minimum Android Device Matrix

Do not run the whole matrix by default. Use the smoke set for non-purchase route/account validation and reserve the full money proof matrix for later manual-assisted Google Play purchase work.

| Device class | BrowserStack target | Android | Status |
| --- | --- | --- | --- |
| Samsung flagship smoke | Samsung Galaxy S23 or S24 | 13, 14, 15 where available | Smoke required |
| Pixel flagship smoke | Google Pixel 7, 8, or 9 | 14, 15 where available | Smoke required |
| Lower-end Android | Moto/OnePlus/Samsung A-class equivalent if available | 12-14 | Later, route smoke |
| Small screen | Any compact Android device available | 12-15 | Later, layout/accessibility smoke |
| Large screen/foldable | Galaxy Fold/large-screen Android | 14-15 | Later |

Minimum current smoke should cover one Samsung and one Pixel before expanding. Full money proof remains later/manual-assisted because Google Play purchase sheets must not be faked.

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

Manual-assisted purchase mode is explicit:

`node scripts/qa/run-browserstack-maestro.mjs --run --manual-assisted-purchase --flow monetization-tip-smoke.yaml --proof-dir /tmp/chillywood-browserstack-manual-assisted-YYYYMMDD-HHMMSS`

This mode may navigate to the purchase checkpoint and then reports `HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION`. It must not use coordinate taps, must not auto-confirm Google Play purchase sheets, and must not claim a pass until post-purchase app state and backend readback prove the correct product scope. Purchase confirmation is human-required.

## Strict Sandbox Auto-Confirm Mode

Default purchase refusal remains active through the `purchase_flow_requested` guard. Manual-assisted mode remains the normal proof path. Strict sandbox auto-confirm is an explicit opt-in only:

`node scripts/qa/run-browserstack-maestro.mjs --auto-confirm-sandbox-purchase --flow monetization-tip-smoke.yaml --proof-dir /tmp/chillywood-browserstack-sandbox-purchase-safety-proof-YYYYMMDD-HHMMSS`

Strict mode is allowed to confirm only when every safety check passes:

- Local env has BrowserStack credentials, app id/custom id, `CHILLYWOOD_APP_ID=com.chillywood.mobile`, E2E viewer login, creator id, `SUPABASE_URL`, and local-only `SUPABASE_SERVICE_ROLE_KEY`.
- Target app reference points at the fresh Chi'llwood APK/custom id and the BrowserStack target is an Android real device.
- Selected Maestro flow has no coordinate taps, image-position taps, repeated blind taps, or bottom-button assumptions.
- Fixture readback proves the selected target is sandbox, `not_payable` or `payable_state=not_payable`, `production_enabled=false`, `payout_enabled=false`, live money off, production purchase intents zero, payable ledger events zero, and payout authority false.
- The Google Play purchase sheet visibly exposes test/sandbox wording such as `Test card`, `Test instrument`, `Test purchase`, `This is a test`, or `Google Play test`.
- The expected tester account and expected product are verified when exposed by the sheet.
- Confirmation uses only a stable visible text/accessibility label for the Google Play confirm button.

Stop with `HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION` when the sheet is not reached, test wording is not exposed, the tester/product is not visible, or App Live/manual interaction is needed. Fail closed with `FAIL_CLOSED_UNSAFE_PURCHASE_SHEET`, `FAIL_CLOSED_UNKNOWN_PURCHASE_ACCOUNT`, or `FAIL_CLOSED_REAL_PAYMENT_RISK` when the sheet appears unsafe, the account/product is wrong, live money/payable/payout state is detected, or any unrelated unlock appears.

After any sandbox purchase confirmation, the pass condition is the app success/access selector plus backend readback proving scoped access only, no Premium or unrelated creator product unlock, no payout authority, no LiveKit host/publish authority for Watch-Party Ticket, no live money, and no payable ledger activity. Fake purchase completion is forbidden.

If a previous sandbox ownership state blocks rerun, classify `PROVIDER_OWNERSHIP_REUSE_BLOCKER`. Use a reset/revoke script only for dedicated E2E users and sandbox-only grants, and do not delete proof evidence or production data.
