# Signed-In Device Smoke Proof

Date: 2026-06-05

Proof type: Play-installed physical Android signed-in route smoke

Proof path: `/tmp/chillywood-signed-in-proof-20260605/`

## Summary

The Firebase Test Lab Robo smoke covers cloud APK install/launch and public signed-out/auth/legal surfaces only. A signed-in proof was captured separately on the real Play-installed Android device because safe reviewer/test credentials are intentionally not stored in the repo, environment, scripts, command history, or docs.

This signed-in proof uses the already-authenticated app session on physical device `R5CR120QCBF`. It does not run purchases, does not alter roles, does not activate production money, and does not replace LiveKit two-session proof.

## Device State

| Item | Result |
| --- | --- |
| Device | `R5CR120QCBF` |
| Model | `SM-N986U1` |
| Android | `11` |
| Package | `com.chillywood.mobile` |
| Installer | `com.android.vending` |
| versionName | `1.0.0` |
| versionCode | `25` |
| Proof folder | `/tmp/chillywood-signed-in-proof-20260605/` |

## Captured Screens

| File | Screen | Signed-in evidence | Safety evidence |
| --- | --- | --- | --- |
| `01-launch.png` / `01-launch.xml` | Watch-Party Premium gate modal | Shows signed-in Watch-Party route state and internal tester sandbox mode | Premium required, no production money, no payout/cash-out/withdrawal/transfer/payable balance |
| `03-dismissed.png` / `03-dismissed.xml` | Watch-Party waiting room | Shows `Your Presence`, `You`, and `You are in room` | Room creation still needs linked title/Premium gate; no fake participant or room event |
| `04-back-target.png` / `04-back-target.xml` | Route-backed Live seat sandbox gate | Shows route-backed signed-in app state | Seat pass is eligibility only, host approval required, `canPublish=false`, `hostPower=false`, production/payout off |
| `05-home-deeplink.png` / `05-home-deeplink.xml` | Home | Shows signed-in Home with Settings and Profile entry available | Public Live empty state is honest; no fake live room |
| `06-settings.png` / `06-settings.xml` | Settings | Shows signed-in account state, Premium not active, push not registered, profile/studio/premium actions | No payout/cash-out/withdrawal/transfer; screenshot is kept in `/tmp` because it contains the test account email |
| `08-profile.png` / `08-profile.xml` | Profile | Shows canonical signed-in Profile route with profile actions and social tabs | No provider secrets, no money activation, no route rewrite |

## What This Proves

- The Play-installed internal-test app can open a signed-in session on the physical Android device.
- Signed-in Home, Settings, Profile, Watch-Party waiting room, Premium-gated Watch-Party flow, and route-backed Live seat gate render without crash.
- The signed-in session sees account-owned controls that a signed-out Firebase Robo crawl cannot reach.
- Premium remains not active for this session, and Premium-gated Watch-Party behavior remains enforced.
- Internal tester sandbox copy remains bounded and explicitly says no production money, payout, cash-out, withdrawal, transfer, or payable balance is enabled.
- Route-backed seat gate still says seat pass is eligibility only, host approval is required, `canPublish=false`, and no host/admin authority is granted.

## What This Does Not Prove

- It does not prove Firebase Test Lab signed-in cloud coverage.
- It does not prove LiveKit two-session host/viewer behavior.
- It does not prove Google Play / RevenueCat purchases or restores.
- It does not prove Stripe Checkout or Stripe Connect.
- It does not prove Owner/Admin drilldowns beyond this signed-in route smoke.
- It does not prove production Play review acceptance.

## Firebase Test Lab Signed-In Status

Firebase Test Lab signed-in Robo/instrumentation remains a future improvement. The repo intentionally does not store reviewer/test passwords. A cloud signed-in run needs one of these safe paths:

- owner-provided test credentials supplied outside the repo and outside command history;
- a Test Lab Robo script/directive path that receives credentials securely;
- an instrumentation test that receives credentials through an approved secret store;
- a pre-seeded safe test session approach approved by the owner.

Until one of those exists, the signed-in proof source is the Play-installed physical device proof above, while Firebase Test Lab remains bounded signed-out/public cloud smoke.

The repo now has a bounded signed-in Firebase Test Lab setup path:

```bash
export FIREBASE_TEST_LAB_SIGNIN_EMAIL='test-account@example.com'
export FIREBASE_TEST_LAB_SIGNIN_PASSWORD='enter-outside-repo'
npm run firebase:test-lab:signed-in-preflight
npm run firebase:test-lab:signed-in-build-robo
```

The script consumes those values only from environment variables at runtime, writes only redacted command/proof metadata, and fails closed if either value is missing. The login screen exposes stable test IDs for Firebase Robo directives: `login-email-input`, `login-password-input`, and `login-submit-button`.

June 5, 2026 update: the signed-in Firebase Test Lab path ran successfully with the ignored local proof-account values mapped into the required environment variables. Matrix `matrix-3pmfaxfsjto4g` passed on `MediumPhone.arm-35-en-portrait` in `307 seconds`; proof lives at `/tmp/chillywood-firebase-test-lab-signed-in-proof-20260605/`. The run reached signed-in Settings, Profile/Platform actions, Platform Studio actions, Player/fullscreen, and comments. This is signed-in route smoke only, not LiveKit two-session, purchase, Stripe, Owner/Admin, or Money Center proof.

## Safety Status

Unchanged:

- production live money off;
- payouts off;
- cash-out, withdrawal, and transfer absent;
- Stripe Android digital checkout absent;
- no fake purchases, provider events, balances, participants, or room states;
- LiveKit token issuer unchanged;
- route ownership unchanged;
- Premium/content safety gates unchanged;
- no credentials or secrets committed.
