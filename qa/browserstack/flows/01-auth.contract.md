# 01 Auth Contract

## Purpose
Prove login, logout, signup verification, forgot password, reset-password route handling, expired/bad link behavior, and no token leakage.

## Required Personas
- `normal_viewer`
- disposable signup inbox account
- disposable reset inbox account

## Required Runtime
Play/internal runtime only; not Expo Dev Launcher.

## Preconditions
- Disposable readable inbox is available on the BrowserStack device/session.
- No owner personal inbox is used.
- Auth links are tapped from the inbox, not pasted into notes or chat.

## Steps
1. Log in as `normal_viewer`.
2. Log out.
3. Request signup for a disposable inbox.
4. Confirm verification email arrives.
5. Tap verification link from inbox on the device.
6. Confirm installed app opens and account verifies.
7. Request forgot-password email for disposable reset account.
8. Confirm reset email arrives.
9. Tap reset link from inbox on the device.
10. Confirm installed app opens `/reset-password`.
11. Set a new test password.
12. Confirm app returns to login or correct post-reset state.
13. Sign in with the new password.
14. Open a bad/expired auth link fixture if available and confirm clear failure copy.

## Expected Result
Installed app handles verification and reset links safely without exposing token-bearing URLs.

## Screenshots To Capture
- Login.
- Signup requested.
- Verification complete state.
- Reset-password form.
- Reset success/login.
- Bad/expired link copy if tested.

## Logs To Capture
- Sanitized auth route markers only.
- No full URLs, codes, access tokens, refresh tokens, token hashes, email passwords, or raw auth payloads.

## Pass Criteria
- Signup verification completes.
- Password update succeeds.
- Sign-in with new password succeeds.
- No token-bearing URLs are retained.

## Fail/Blocker Criteria
- Link opens browser/legal/support instead of app.
- Recovery session fails.
- Token-bearing URL appears in artifact/log.
- Disposable inbox unavailable.

## Device Count
One device plus readable inbox.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Yes. Installed-app auth proof already passed locally and should be rerun only when BrowserStack is approved.
