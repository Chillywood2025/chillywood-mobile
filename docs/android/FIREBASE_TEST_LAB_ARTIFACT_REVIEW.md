# Firebase Test Lab Artifact Review

Date: 2026-06-05

Lane: Firebase Test Lab Robo Artifact Review And Fixes

Starting HEAD: `de0b4a7` (`Prove Firebase Test Lab IAM smoke run`)

Reviewed matrix: `matrix-pcl66znev5dca`

Rerun matrix: `matrix-1ovvi4nwvs469`

Proof path: `/tmp/chillywood-firebase-test-lab-artifact-review-fix-proof-20260605/`

## Summary

Firebase Test Lab Robo artifacts from the prior successful bounded smoke run were reviewed before making any app changes. The reviewed run stayed on signed-out public/auth/legal surfaces. Robo did not prove signed-in routes, LiveKit, purchases, Stripe, Owner/Admin, Money Center, or internal sandbox flows, and this document does not claim that it did.

The artifact review found no Chi'llywood app crash, no ANR, no broken route, no blank screen, no money/payout exposure, no production buy button, no Stripe Android digital checkout, and no LiveKit or route-ownership issue. Two real low-severity UI/accessibility issues were visible in the screenshots and were fixed:

- signup placeholders were too dark on dark input fields;
- light-theme legal table-of-contents chips had weak text contrast.

After those fixes, local validation passed and a new bounded Firebase Test Lab Robo smoke passed on the same virtual device axis.

## Artifact Review Table

| Artifact | Finding | Screen/route | Severity | Real app bug? | Expected behavior? | Robo/test artifact? | Needs fix? | Proposed/final fix | Evidence path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `logcat` | No `FATAL EXCEPTION`, no app ANR, no React Native fatal error, no route crash | App launch/auth/legal crawl | No issue | No | N/A | No | No | None | `/tmp/chillywood-firebase-test-lab-iam-smoke-proof-20260605/results/MediumPhone.arm-35-en-portrait/artifacts/logcat` |
| `logcat` | `AndroidRuntime` entries were Android command-wrapper process starts/exits, not Chi'llywood crashes | Test wrapper | No issue | No | N/A | Yes | No | None | prior fatal scan and logcat |
| `logcat` | React Native Firebase namespaced API warnings appeared | Startup | Low | No immediate app failure | N/A | No | No in this lane | Leave as technical-debt warning; no crash or broken smoke behavior | prior and rerun logcat |
| Screenshots/actions | Signed-out login, signup, forgot-password, and validation dialogs rendered when Robo tapped auth forms without credentials | Auth routes | No issue | No | Yes | Partly | No | None | screenshots `0.png` through `7.png`, `10.png`, `11.png` |
| Screenshots | Signup placeholders were hard to read against dark fields | `/signup` | Low | Yes | No | No | Yes | Added explicit placeholder color in `app/(auth)/signup.tsx` | prior screenshots `3.png`, `4.png`, `10.png`, `11.png`; rerun `3.png` |
| Screenshots | Legal section chips had low contrast on light background | Legal policy viewer | Low | Yes | No | No | Yes | Made legal TOC chip text theme-aware in `components/legal/legal-policy-viewer.tsx` | prior screenshots `8.png`, `9.png`, `12.png`; rerun `8.png` |
| Actions | Robo reported a click on a non-clickable object near `Sign in` while the auth screen still navigated and dialogs rendered | Auth route | No issue | No confirmed app bug | N/A | Yes | No | None | `actions.json` |
| Screenshots/actions | Random legal search produced `No matching section` | Legal policy viewer | No issue | No | Yes | No | No | None | screenshot `8.png`, `actions.json` |
| Screenshots/video | No blank screen, clipped primary action, unsafe money copy, payout/cash-out button, visible secret, raw provider payload, or production purchase button appeared | Public/auth/legal surfaces | No issue | No | N/A | No | No | None | screenshots, `video.mp4`, `sitemap.png` |

## Coverage Achieved

Robo covered a bounded signed-out/public smoke path:

- app install and launch on Firebase Test Lab virtual Android;
- login screen;
- forgot-password validation;
- login validation;
- signup route and validation;
- legal Terms surface;
- legal section search and table-of-contents chips;
- screenshots, video, action trace, sitemap, logcat, and Robo result artifacts.

## Coverage Not Claimed

This run does not replace:

- signed-in route proof;
- LiveKit two-session host/viewer proof;
- Google Play / RevenueCat purchase proof;
- Stripe Checkout or Stripe Connect proof;
- Owner/Admin drilldown proof;
- Money Center proof;
- Play-installed internal tester proof.

## Fixes Made

`app/(auth)/signup.tsx` now sets explicit readable placeholder color on the signup inputs.

`components/legal/legal-policy-viewer.tsx` now uses theme-aware legal TOC chip text colors so active and inactive chips remain readable on light and dark legal pages.

No backend behavior, money behavior, LiveKit behavior, route ownership, Player behavior, Premium gates, content safety gates, or Owner/Admin authority changed.

## Rerun Result

Preflight passed with the owner-approved Google user account and project `chillywood-app`.

Bounded smoke command:

```bash
FIREBASE_TEST_LAB_PROOF_DIR=/tmp/chillywood-firebase-test-lab-artifact-review-fix-proof-20260605 \
FIREBASE_TEST_LAB_RESULTS_DIR=chillywood-artifact-review-fix-20260605-115352 \
npm run firebase:test-lab:build-robo
```

Result:

- APK build: passed.
- APK SHA-256: `527f803a38cab78fa440020e68d0ef827b7d4cb7b6083e79a7ecb46fe3532d24`.
- Matrix: `matrix-1ovvi4nwvs469`.
- Axis: `MediumPhone.arm-35-en-portrait`.
- Outcome: `Passed`.
- Test time: `306 seconds`.
- Firebase Console: `https://console.firebase.google.com/project/chillywood-app/testlab/histories/bh.e9371a121da8f5fe/matrices/7065165681326020512`.
- Raw results bucket: `gs://test-lab-nt3ctukisd678-ykr9mdfzvpc9x/chillywood-artifact-review-fix-20260605-115352/`.
- Downloaded results: `/tmp/chillywood-firebase-test-lab-artifact-review-fix-proof-20260605/results/MediumPhone.arm-35-en-portrait/`.
- Downloaded artifacts include `actions.json`, screenshots, `logcat`, `video.mp4`, `robo_results.pb`, `baseline_profile.txt`, `sitemap.png`, and `crawlscript.json`.
- Crash scan: no Chi'llywood fatal exception, no ANR, no TypeError, no ReferenceError, no invariant violation.

Rerun screenshots confirmed the signup placeholder and legal chip contrast fixes.

## Safety Status

Unchanged:

- production money remains off;
- payouts remain off;
- cash-out, withdrawal, and transfer remain absent;
- Stripe Android digital checkout remains absent;
- no production purchase buttons were introduced;
- LiveKit token issuer unchanged;
- route ownership unchanged;
- Premium/content safety gates unchanged;
- no secrets, service-account JSON, OAuth tokens, keystores, raw provider payloads, or raw logs were committed.

## Remaining Testing Gaps

Firebase Test Lab Robo remains useful as bounded cloud install/launch smoke and public-surface crawl proof. It is not a substitute for the separate manual and device-backed proof lanes for signed-in routes, LiveKit, monetization purchases, Stripe, Owner/Admin, or Money Center.

## Signed-In Follow-Up

A separate Play-installed physical-device signed-in proof was captured after this Robo review because Test Lab signed-in cloud coverage still needs credentials supplied through a safe non-repo path.

Signed-in proof doc:

```text
docs/android/SIGNED_IN_DEVICE_SMOKE_PROOF.md
```

Signed-in proof path:

```text
/tmp/chillywood-signed-in-proof-20260605/
```

That proof covers signed-in Home, Settings, Profile, Watch-Party waiting-room/Premium gate, and route-backed Live seat gate on device `R5CR120QCBF`, package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `25`.
