# Firebase Test Lab For Installed Product QA

Firebase Test Lab is the first device-lab path for `installed_product_qa_operator`. It now runs in cost-capped cheap mode: source/backend/operator checks remain Tier 0 and do not need device proof every time, while Firebase virtual-device smoke is Tier 1 and may run only when it is useful and inside strict caps.

## Default Policy

- Mode: `FIREBASE_TEST_LAB_MODE=cost_capped`.
- Monthly cap: `FIREBASE_TEST_LAB_MONTHLY_CAP_USD=5`.
- Per-run cap: `FIREBASE_TEST_LAB_PER_RUN_CAP_USD=0.25`.
- Device type: `FIREBASE_TEST_LAB_ALLOW_VIRTUAL=true`, `FIREBASE_TEST_LAB_ALLOW_PHYSICAL=false`.
- Cadence: `FIREBASE_TEST_LAB_MAX_SCHEDULED_RUNS_PER_DAY=1`.
- On-change smoke: `FIREBASE_TEST_LAB_RUN_ON_OTA_CHANGE=true`.
- Broad crawls: `FIREBASE_TEST_LAB_ALLOW_BROAD_CRAWL=false`.
- Two-device Firebase runs: `FIREBASE_TEST_LAB_ALLOW_TWO_DEVICE=false`.

Physical devices, broad crawls, two-device Firebase runs, and paid over-cap runs require explicit owner approval. Unknown cost is allowed only when the runner can bound worst-case virtual-device cost under the per-run cap and monthly remaining budget.

## QA Tiers

- Tier 0: source/backend/operator-only checks. These can run frequently without device lab.
- Tier 1: Firebase virtual smoke, daily at most, after OTA/source changes, or by owner command, cost-capped.
- Tier 2: broader Firebase virtual/physical coverage, owner-approved only.
- Tier 3: physical Play-installed proof for Premium Billing, two-device LiveKit, camera/mic, push, and provider-backed flows, on-demand only.

## Commands

```bash
npm run installed-qa-operator:firebase-test-lab:status
npm run installed-qa-operator:firebase-test-lab:self-test
npm run installed-qa-operator:firebase-test-lab:run
```

`status` audits local capability and prints only credential presence by name, not credential values. `run` starts a Firebase matrix only when the cost guard passes.

## Budget Ledger

The runner records local JSONL budget events at `FIREBASE_TEST_LAB_BUDGET_LEDGER` or `/tmp/chillywood-installed-qa-firebase-test-lab-budget-ledger.jsonl`. Each run or blocked attempt records:

- `costEstimateUsd`
- `maxAllowedCostUsd`
- `monthlyBudgetUsd`
- `monthlySpentEstimateUsd`
- `billingRisk`
- `quotaMode`
- `deviceType`
- `runReason`
- `matrixId` when a Firebase matrix starts

The ledger must not contain credentials, payment details, service-role keys, signed URLs, private evidence, or account passwords.

## Proof Classification

Firebase installs an uploaded APK/AAB in Google's lab. Findings from this path use:

- `device_lab_provider=firebase_test_lab`
- `proofSource=firebase_test_lab_uploaded_artifact`
- `source=firebase_test_lab_uploaded_artifact`
- `fakeProof=false`
- `moneyMoved=false`
- `userRightsChanged=false`
- `highRiskExecuted=false`

This is not Play-installed proof. It must not be used to claim Google Play installer state, Play Billing, RevenueCat active Premium, push delivery on a user's Play-installed phone, or two-device LiveKit proof.

## Tier 1 Smoke Scope

The default cost-capped Firebase smoke is limited to a virtual-device Robo smoke:

- app launches.
- no crash.
- release diagnostics marker if Robo reaches it.
- `/chat` and `/creator-monetization-setup` marker findings if instrumentation or Robo reaches them.
- normal `/admin` denial only if a safe login fixture exists.

The run must not include Premium purchase, Premium activation, two-device realtime, physical-device-only behavior, broad route crawls, paid physical devices, or provider/billing mutations.

## Scheduler

No every-30-minute Firebase device schedule is allowed. A daily virtual-device smoke can be installed only after the cost guard is active, the owner approves scheduling, the timer calls the guard first, and audit rows prove scheduled runs stay within the caps. If the guard blocks, the scheduler should record a blocked/no-run event and exit without starting a Firebase matrix.
