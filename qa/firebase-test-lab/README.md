# Firebase Test Lab For Installed Product QA

Firebase Test Lab is the first device-lab path for `installed_product_qa_operator`, but it is zero-cost-first and disabled for unsafe cost states.

## Default Policy

- Default maximum cost: `FIREBASE_TEST_LAB_MAX_COST_USD=0`.
- Default device type: virtual device only.
- Default cadence: manual/on-demand only.
- Physical devices are blocked unless `FIREBASE_TEST_LAB_ALLOW_PHYSICAL=true` and an owner-approved no-cost quota note is provided.
- Scheduled Firebase runs are blocked unless `FIREBASE_TEST_LAB_ALLOW_SCHEDULED=true` and quota-safe owner proof is provided.
- If cost, quota, billing plan, or remaining no-cost minutes are unknown, the runner fails closed before starting a matrix.

## Commands

```bash
npm run installed-qa-operator:firebase-test-lab:status
npm run installed-qa-operator:firebase-test-lab:self-test
npm run installed-qa-operator:firebase-test-lab:run
```

`status` audits local capability and prints only credential presence by name, not credential values. `run` starts a Firebase matrix only when all zero-cost guards pass.

## Required Zero-Cost Inputs For Any Run

Set these outside the repo through the approved host/CI secret path:

- `FIREBASE_TEST_LAB_MAX_COST_USD=0`
- `FIREBASE_TEST_LAB_DEVICE_TYPE=virtual`
- `FIREBASE_TEST_LAB_ZERO_COST_CONFIRMED=true`
- `FIREBASE_TEST_LAB_FREE_QUOTA_VERIFIED=true`
- `FIREBASE_TEST_LAB_QUOTA_MODE=free_quota`
- `FIREBASE_TEST_LAB_BILLING_RISK=none`
- `FIREBASE_TEST_LAB_REMAINING_FREE_VIRTUAL_MINUTES` greater than or equal to the requested timeout

If any value is missing or cannot be proven, no Firebase run is started.

## Proof Classification

Firebase installs an uploaded APK/AAB in Google's lab. Findings from this path use:

- `device_lab_provider=firebase_test_lab`
- `proofSource=firebase_test_lab_uploaded_artifact`
- `source=firebase_test_lab_uploaded_artifact`
- `costEstimateUsd=0`
- `billingRisk=none` only after no-cost proof
- `fakeProof=false`
- `moneyMoved=false`
- `userRightsChanged=false`
- `highRiskExecuted=false`

This is not Play-installed proof. It must not be used to claim Google Play installer state, Play Billing, RevenueCat active Premium, push delivery on a user's Play-installed phone, or two-device LiveKit proof.

## Initial Smoke Scope

The first zero-cost-safe run is limited to a virtual-device Robo smoke:

- app launches.
- no crash.
- release diagnostics marker if Robo reaches it.
- `/chat` and `/creator-monetization-setup` marker findings if instrumentation or Robo reaches them.
- normal `/admin` denial only if a safe login fixture exists.

The run must not include purchase, Premium activation, two-device realtime, paid physical devices, or a broad crawl that risks quota/cost.

## Scheduler

No Firebase scheduler is active by default. A daily smoke can be considered only after owner approval, proven no-cost quota safety, virtual-device-only config, and an audit row proving the runner fired with `costEstimateUsd=0`. No every-30-minute Firebase device-lab schedule is allowed.
