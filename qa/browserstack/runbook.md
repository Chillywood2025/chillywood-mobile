# BrowserStack Final Regression Runbook

Status: prepared, not run.

## 1. Approval Gate

Do not proceed until the user explicitly approves BrowserStack execution. Approval must cover:

- starting BrowserStack sessions
- uploading or selecting the Play/internal app artifact
- using BrowserStack credentials
- spending BrowserStack minutes

## 2. Preflight

1. Confirm repo is at the intended commit.
2. Run local guards:
   - `npm run typecheck`
   - `npm run validate:runtime`
   - `npm run guard:route-contracts`
   - `npm run guard:money-center-policy`
   - `npm run guard:payment-rail-policy`
   - `npm run guard:provider-readiness-policy`
   - `npm run guard:navigation-terminology-policy`
   - `npm run guard:auth-email-branding-policy`
   - `npm run guard:watch-party-livekit`
   - `npm run guard:old-room-handling`
3. Confirm Play/internal runtime:
   - package `com.chillywood.mobile`
   - installer `com.android.vending`
   - latest internal `versionCode`
   - not Expo Dev Launcher
4. Confirm test persona credentials are available only through secure local handoff.
5. Confirm no auth links, passwords, provider secrets, or BrowserStack keys are in docs/logs.

## 3. Device Matrix

Minimum:

- Samsung current-device class
- Pixel medium screen
- older Android version
- small-screen Android

Optional:

- tablet
- foldable
- low-memory profile
- newest Android image available

## 4. Execution Order

1. Runtime install.
2. Auth.
3. Home/Explore/Library.
4. Profile/Platform.
5. Platform Studio/Brand Studio.
6. Chi'lly Chat.
7. Watch-Party Live.
8. Live Watch-Party / Live Stage.
9. Player / Paid Video.
10. Money Center.
11. Premium.
12. Settings / Legal.
13. Direct-link denials.
14. Admin/Owner.
15. Final smoke.

## 5. Artifact Rules

Capture:

- screenshots
- screen recordings where available
- BrowserStack session id
- device model and OS version
- package, installer, versionCode
- sanitized logs
- test persona labels only
- timestamps

Never capture or commit:

- passwords
- auth tokens/codes
- token-bearing URLs
- BrowserStack keys
- provider secrets
- service-role values
- raw private provider payloads
- payment card details

## 6. Blocker Handling

If a flow blocks, mark it as one of:

- product bug
- fixture/persona unavailable
- provider tooling unavailable
- Google Play internal install unavailable
- BrowserStack device limitation
- second-session limitation
- external dashboard/CAPTCHA/2FA blocker

Do not replace failed Play/internal proof with Expo Dev Launcher proof.

## 7. Exit Criteria

BrowserStack can be marked passed only when all required contracts are passed or explicitly accepted as launch blockers/deferred items in the launch checklist.
