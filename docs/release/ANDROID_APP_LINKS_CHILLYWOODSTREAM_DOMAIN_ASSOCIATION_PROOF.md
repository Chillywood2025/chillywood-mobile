# Android App Links Chillywoodstream Domain Association Proof

Date: 2026-07-06

Verdict: Closed. Android App Links are verified end to end for `chillywoodstream.com`: package `com.chillywood.mobile` has Play-built `https` / `autoVerify` intent filters for approved app-owned paths, `chillywoodstream.com` serves valid Digital Asset Links JSON with the public Play App Signing SHA-256 fingerprint, Play Console Deep links validation reports `All links working` for versionCode `80`, and Android 16 Play-installed device verification confirms the domain is verified and claimed links open the app.

## Play Console Warning Summary

Play Console reported that deep links may be failing because web domains were not associated with package `com.chillywood.mobile`.

Current Play Console result:

- Page: Deep links for Chi'llywood
- Selected app version: `80 (1.0.0)`
- Status: `All links working`
- Prior unassociated-domain warning text: not present for the selected v80 app version

## Repo Root Cause

- `app.config.ts` previously had no Android App Links `intentFilters` for `https://chillywoodstream.com`.
- `public-site/legal-site/site/` previously had no `.well-known/assetlinks.json`.
- The live apex assetlinks URL previously returned the public legal-site HTML shell instead of Digital Asset Links JSON.

## Claimed Domains

- Claimed: `chillywoodstream.com`
- Not claimed: `www.chillywoodstream.com`, `auth.chillywoodstream.com`, `live.chillywoodstream.com`, `network-proof.chillywoodstream.com`

Only the apex public domain is intentionally claimed. LiveKit, Supabase function, auth-email, and possible `www` hosts remain unclaimed until product and hosting owners explicitly require those hosts to open in the app and can serve their own valid Digital Asset Links files.

## Claimed App-Owned Paths

The app claims exact paths and slash prefixes for app-owned routes:

- Auth/callback fallback: `/auth`, `/auth-callback`, `/auth/reset-password`, `/auth/v1/verify`, `/auth/verify`, `/callback`, `/confirm`, `/reset-password`, `/v1/verify`, `/verify`
- Public app content: `/channel`, `/player`, `/profile`, `/spectate`, `/title`
- Rooms: `/watch-party`, including `/watch-party/live-stage/[partyId]` through the `/watch-party/` prefix

## Web-Only And Deferred Paths

These stay browser/web-only or deferred:

- `/`, `/privacy`, `/terms`, `/account-deletion`, `/copyright-report`, `/support`: public legal/support site paths should remain accessible in browser and are not required for App Links closure.
- `/live`: bottom-tab app route exists, but no product web URL contract was found that should force external live links into the app.
- `/live-stage`: not a supported route; canonical Live Stage path is `/watch-party/live-stage/[partyId]`.
- `/invite`: no safe supported app route was found.

If Play Console lists any of these as failing deep links in a later validation, they should be removed from Play deep-link declarations or handled in a later route-specific task rather than blindly claimed.

## Android Intent Filter Summary

`app.config.ts` generates `android.intentFilters` with:

- `action: "VIEW"`
- `autoVerify: true`
- `scheme: "https"`
- `host: "chillywoodstream.com"`
- `category: ["BROWSABLE", "DEFAULT"]`
- exact `path` and slash `pathPrefix` entries for the approved routes above

Android manifest intent filters require a new Google Play native Android build. EAS Update / OTA alone cannot update Android manifest intent filters.

## assetlinks.json Final Live URL

Source template:

- `public-site/legal-site/assetlinks.json`

Generated deployable output:

- `public-site/legal-site/site/.well-known/assetlinks.json`

Hosted path:

- `https://chillywoodstream.com/.well-known/assetlinks.json`

The legal-site build copies the JSON into the generated static site output.

## Play App Signing SHA-256 Handling

The assetlinks JSON now contains the public certificate SHA-256 fingerprint observed from the Google Play-installed v79 package signer:

- `E9:84:CA:A3:23:7B:30:95:D7:AA:AA:0A:AF:C3:77:7F:2F:69:ED:46:B0:0C:60:46:22:20:A4:37:CB:24:95:B7`

This is public certificate material intended for Digital Asset Links. No private signing keys, upload keystores, keystore passwords, service-account private keys, or signing private material were printed or committed.

## Website Verification Result

`curl -i https://chillywoodstream.com/.well-known/assetlinks.json` returned:

- HTTP status: `200`
- Content type: `application/json`
- JSON valid: yes
- `target.package_name`: `com.chillywood.mobile`
- relation includes `delegate_permission/common.handle_all_urls`
- real-looking SHA-256 fingerprint present: yes
- placeholder remains: no

Google Digital Asset Links API readback returned one statement for `https://chillywoodstream.com` and package `com.chillywood.mobile`.

## Native Play Build And Upload

- EAS Build ID: `4c27d4a2-1b54-48d0-93a2-266c3c430dae`
- Android versionCode: `80`
- versionName/runtime: `1.0.0`
- profile/channel/distribution: `production` / `production` / `STORE`
- source commit: `08fd60e29a5040672c9f9dc91befc9142861d82e`
- EAS Submit ID: `35894152-a50a-4edf-b5d3-a9b53a760638`
- Play track: `internal`
- release status: `COMPLETED`

Android Publisher API readback showed internal track completed release `1.0.0` with versionCode `80`.

## Play Console Validation Result

Play Console Deep links page for app version `80 (1.0.0)` showed:

- `All links working`
- `chillywoodstream.com` app-owned paths listed as `Deep linked`
- no visible prior warning copy that web domains are unassociated or that deep links may be failing

## Android Device Verification Result

R5 physical device:

- serial: `R5CR120QCBF`
- model: `SM-N986U1`
- Android: `11` / SDK `30`
- package: `com.chillywood.mobile`
- installer: `com.android.vending`
- versionCode: `80`
- versionName: `1.0.0`
- updated through Google Play only

R5 link launch diagnostics:

- `https://chillywoodstream.com/profile/test` opened `com.chillywood.mobile/.MainActivity`
- `https://chillywoodstream.com/watch-party/test` opened `com.chillywood.mobile/.MainActivity`
- `https://chillywoodstream.com/title/test` opened `com.chillywood.mobile/.MainActivity`
- `https://chillywoodstream.com/privacy` opened Chrome, preserving the web-only legal path policy
- Android 11 does not support the required Android 12+ `pm get-app-links` verifier command; legacy `pm get-app-link com.chillywood.mobile` returned `always`

R3 strict Android 12+ proof status:

- serial: `R3CXA0DS5JV`
- model: `SM-S928U1`
- Android: `16` / SDK `36`
- package: `com.chillywood.mobile`
- installer: `com.android.vending`
- versionCode: `80`
- versionName: `1.0.0`
- last update: `2026-07-06 12:55:23`
- updated through Google Play only

R3 Android 12+ App Links verifier:

- `adb shell pm get-app-links com.chillywood.mobile` returned `chillywoodstream.com: verified`
- reported package signature: `E9:84:CA:A3:23:7B:30:95:D7:AA:AA:0A:AF:C3:77:7F:2F:69:ED:46:B0:0C:60:46:22:20:A4:37:CB:24:95:B7`

R3 link launch diagnostics:

- `https://chillywoodstream.com/profile/test` opened `com.chillywood.mobile/.MainActivity`
- `https://chillywoodstream.com/watch-party/test` opened `com.chillywood.mobile/.MainActivity`
- `https://chillywoodstream.com/title/test` opened `com.chillywood.mobile/.MainActivity`
- `https://chillywoodstream.com/privacy` opened Chrome, preserving the web-only legal path policy

## Out-of-Scope Findings

No new out-of-scope source defect was found during the App Links closure work.

Known prior deferred item:

- File/component: `public-site/legal-site/build.mjs`
- Observed risk: a public Supabase anon config literal can create scanner noise
- User impact: no direct App Links behavior impact; scanner triage may need context because anon keys are public client config, not service-role secrets
- Recommended next task: move public legal-site config to deploy env or documented public config handling if deployment/security scanning requires it
- Touches: Supabase client config only; does not touch Premium, LiveKit backend, Live Stage, Watch-Party Party Room, Chi'lly Chat/native calls, auth/RLS, billing, payouts, or cashout

## Safety Confirmation

No Premium entitlement logic, Google Play / RevenueCat product logic, LiveKit backend routing, heartbeat monitor, server registry, stale heartbeat cutoff, token routing, Watch-Party Party Room behavior, Live Stage UX, Chi'lly Chat/native call behavior, auth/RLS, live money, payouts, or cashout behavior changed. No production billing/provider settings were mutated beyond normal Play internal build upload and Play Console deep-link validation. No sideload, `adb install`, uninstall, clear data, logout, or manual entitlement grant occurred. No secrets, tokens, API keys, service-role keys, auth tokens, TURN credentials, signed URLs, private env values, private signing keys, upload keystores, or keystore passwords were committed.

## Validation

Validation results:

- `npm run legal-site:build`: passed; regenerated `public-site/legal-site/site/.well-known/assetlinks.json`.
- `npm run guard:android-app-links-policy`: passed.
- `node scripts/proof-android-app-links.mjs --closed`: passed with status `closed` for local-and-hosted Digital Asset Links.
- `curl -i https://chillywoodstream.com/.well-known/assetlinks.json`: passed with HTTP 200 JSON.
- Google Digital Asset Links API readback: passed for `https://chillywoodstream.com` -> `com.chillywood.mobile`.
- EAS Build: passed for versionCode `80`.
- EAS Submit: passed to Google Play internal.
- Android Publisher API track readback: passed; internal track has completed versionCode `80`.
- Play Console Deep links validation: passed for selected app version `80 (1.0.0)` with `All links working`.
- R5 Play-installed link launch diagnostics: passed for claimed paths and web-only `/privacy`.
- R3 Android 16 strict device verifier: passed; `chillywoodstream.com` is verified and claimed paths open the Play-installed app.
- `npx tsc --noEmit`: passed.
- `npm run validate:runtime`: passed.
- `npm run guard:route-contracts --if-present`: passed.
- `npm run guard:brand-spelling-policy`: passed.
- `git diff --check`: passed.
- `git diff --cached --check`: passed.
- changed-file secret-value scan: passed with zero findings across changed files.

## Commit And Alignment

- Starting HEAD / origin before closure changes: `08fd60e29a5040672c9f9dc91befc9142861d82e`
- Final commit hash: recorded in the final task response after the content-addressed commit is created and pushed.
- Final `HEAD == origin/main` status: recorded in the final task response after push/alignment readback.
