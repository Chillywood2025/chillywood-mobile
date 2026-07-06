# Android App Links Chillywoodstream Domain Association Proof

Date: 2026-07-06

Verdict: Partial. Repo App Links config and the website association template are prepared, but closure is blocked until the Play App Signing SHA-256 fingerprint is copied from Google Play Console into `public-site/legal-site/assetlinks.json`, the static site is deployed, and a new native Android build is uploaded to Google Play. OTA alone cannot update Android manifest intent filters.

## Play Console Warning Summary

Play Console reported that deep links may be failing because web domains are not associated with the app. Repo inspection confirmed the root problem: the committed app config had only the custom `chillywoodmobile` scheme, the checked-in static site did not include `/.well-known/assetlinks.json`, and the live apex URL currently returns the public legal-site HTML shell at the assetlinks path instead of JSON.

## Repo Root Cause

- `app.config.ts` had no Android App Links `intentFilters` for `https://chillywoodstream.com`.
- `public-site/legal-site/site/` had no `.well-known/assetlinks.json`.
- The ignored local `android/` generated folder contained stale non-verified HTTPS filters, including an unassociated `auth.chillywoodstream.com` host. Source truth now lives in Expo config and claims only the apex domain.

## Claimed Domains

- Claimed: `chillywoodstream.com`
- Not claimed: `www.chillywoodstream.com`, `auth.chillywoodstream.com`, `live.chillywoodstream.com`, `network-proof.chillywoodstream.com`

Only the apex public domain is intentionally claimed. LiveKit, Supabase function, auth-email, and possible `www` hosts are not claimed until product and hosting owners explicitly require those hosts to open in the app and can serve their own valid Digital Asset Links files.

## Claimed Path Prefixes

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

If Play Console lists any of these as failing deep links, they should be removed from the Play deep-link declaration or handled in a later route-specific task rather than blindly claimed.

## Android Intent Filter Config

`app.config.ts` now generates `android.intentFilters` with:

- `action: "VIEW"`
- `autoVerify: true`
- `scheme: "https"`
- `host: "chillywoodstream.com"`
- `category: ["BROWSABLE", "DEFAULT"]`
- exact `path` and slash `pathPrefix` entries for the approved routes above

Android manifest intent filters require a new Google Play native Android build. EAS Update / OTA cannot close this Play Console warning.

## assetlinks.json Deployment Path

Source template:

- `public-site/legal-site/assetlinks.json`

Generated deployable output:

- `public-site/legal-site/site/.well-known/assetlinks.json`

Hosted path required after deployment:

- `https://chillywoodstream.com/.well-known/assetlinks.json`

The legal-site build now copies the JSON into the generated static site output.

## Play App Signing SHA-256 Handling

Required source: Google Play Console -> app -> Setup/App integrity/App signing -> App signing key certificate -> SHA-256.

Current repo state uses the explicit placeholder `PASTE_PLAY_APP_SIGNING_SHA256_FINGERPRINT_HERE`. Do not use the upload key, debug keystore, local ADI verification value, or a guessed fingerprint for the final assetlinks proof.

## Website Verification Result

Current live check before deployment:

- URL: `https://chillywoodstream.com/.well-known/assetlinks.json`
- HTTP status: `200`
- Content type: `text/html; charset=utf-8`
- Result: invalid for App Links because the response is HTML, not JSON

After deployment, this must return HTTP 200 with valid JSON, `package_name: "com.chillywood.mobile"`, relation `delegate_permission/common.handle_all_urls`, and the real Play App Signing SHA-256 fingerprint.

## Play Console Validation Result

Not run from Codex. Play Console access and the exact failing URL list were not available in this session. After deployment and a new Play build, refresh the Play Console deep links page and classify any remaining warnings as fixed, intentionally web-only, app route missing, assetlinks mismatch, waiting for Play verification, or next task.

## Device Verification Result

Not run. ADB diagnostics are useful only after a Google Play-installed build contains the new manifest filters. Allowed commands for that later proof are:

- `adb shell pm get-app-links com.chillywood.mobile`
- `adb shell am start -a android.intent.action.VIEW -d "https://chillywoodstream.com/profile/test"`

Do not use `adb install`, uninstall, clear data, logout, or sideload for this proof.

## Safety Confirmation

No Premium entitlement logic, Google Play / RevenueCat product logic, LiveKit backend routing, heartbeat monitor, server registry, stale heartbeat cutoff, token routing, Watch-Party Party Room behavior, Live Stage UX, Chi'lly Chat/native call behavior, auth/RLS, live money, payouts, or cashout behavior changed. No production billing/provider settings were mutated. No secrets, tokens, API keys, service-role keys, auth tokens, TURN credentials, signed URLs, or private env values were committed.

## Out-of-Scope Findings

No new out-of-scope source defect was found during the App Links implementation.

Pre-existing documented Live Stage and Watch-Party Live proof gaps remain outside this task. They are not required for App Links closure and should stay deferred to their existing Live Stage / LiveKit proof tasks. Those deferred items touch Premium timing, LiveKit product proof, Live Stage, and Watch-Party Live; they do not require App Links changes and this task did not modify them.

## Validation

Local validation results:

- `npm run legal-site:build`: passed; regenerated `public-site/legal-site/site/.well-known/assetlinks.json`.
- `npm run guard:android-app-links-policy`: passed with expected template warnings for the missing Play App Signing SHA-256.
- `node scripts/proof-android-app-links.mjs`: passed as Partial; local assetlinks template is structurally valid, current website response is HTTP 200 HTML and not valid JSON.
- `npx tsc --noEmit`: passed.
- `npm run validate:runtime`: passed.
- `npm run guard:route-contracts --if-present`: passed.
- `npm run guard:brand-spelling-policy`: passed.
- `git diff --check`: passed.
- `git diff --cached --check`: passed.
- Changed-line/new-file secret-value scan: passed. A broader whole-file scan flagged a pre-existing public Supabase anon JWT in `public-site/legal-site/build.mjs`; this task did not add that value.

## Commit And Alignment

Commit hash: recorded in the final task response after commit creation.

Final HEAD/origin status: recorded in the final task response after push/alignment check.
