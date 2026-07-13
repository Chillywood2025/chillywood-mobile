# Installed Product QA Operator Runbook

Codex caught the current installed traversal blockers manually during a directed proof. The autonomous system did not catch them before because no proactive installed-product QA operator existed. This runbook defines the new `installed_product_qa_operator` lane that records installed-app route, role, account-fixture, and device-readiness gaps without waiting for a manual Codex prompt.

## System

- Registry id: `installed_product_qa_operator`
- Status: `scoped_write_capable_guarded`
- Activation: `manual_cli`
- schedulerStatus=device_lab_scheduler_pending
- Edge Function: `installed-product-qa-operator`
- Helper: `_lib/installedProductQaOperator.ts`
- CLI:
  - `installed-qa-operator:watch-once`
  - `installed-qa-operator:status`
  - `installed-qa-operator:report`
  - `installed-qa-operator:record-finding`
  - `installed-qa-operator:device-readiness`
  - `installed-qa-operator:account-fixtures`
  - `installed-qa-operator:firebase-test-lab:status`
  - `installed-qa-operator:firebase-test-lab:run`
  - `installed-qa-operator:firebase-test-lab:self-test`

## Scope

The operator may write only safe QA rows: `installed_qa_operator_events`, `installed_traversal_runs`, `route_behavior_findings`, `role_behavior_findings`, `account_fixture_health_findings`, `device_availability_findings`, `qa_required_review_flags`, `qa_operator_learning_state`, owner-command requests, and autonomous approval requests. Client writes are denied; trusted operator/service-role paths are required.

It tracks installed route traversal, role traversal, button/tap contracts, Premium and non-Premium gates, admin/operator/moderator visibility, account fixture health, device availability, device-lab readiness, two-device realtime proof prerequisites, release diagnostics, route-contract markers, and installed proof blockers.

## Current Findings

The original blockers were recorded as open QA findings discovered by Codex manual proof:

- normal `/chat` stayed on Home instead of `chat-inbox-screen`.
- restricted `/chat` showed Chat inbox instead of restricted or denied copy.
- `/creator-monetization-setup` missed the expected compatibility/Premium marker.
- the Premium-labelled account was not actually Premium active.
- moderator broad-search/private-evidence boundary proof was pending.
- two-device realtime proof was pending.

Each row is recorded with `proof_source=manual_codex_proof`, `discovered_by=codex_manual`, `fakeProof=false`, `highRiskExecuted=false`, `moneyMoved=false`, and `userRightsChanged=false`. Current blockers are open QA findings until a future installed proof, account fixture proof, or approved device-lab run closes them. Current source/installed follow-up has closed normal `/chat` and the creator monetization marker, found restricted `/chat` still lands on `chat-inbox-screen`, found the Premium-labelled account still says `Premium is not active`, found moderator Search Admin visibility on the current installed artifact, and still has only one attached Play-installed device.

## Live Deployment Status

On 2026-07-13 the `installed-product-qa-operator` Edge Function was deployed and token-gated with `INSTALLED_QA_OPERATOR_TOKEN_SHA256`; the raw token is stored only in `/etc/chillywood/installed-product-qa-operator.env` on `chillywood-prod-01` with `root:root` ownership and mode `600`. Missing and invalid tokens return `401`, valid status/report/watch calls write safe rows only, and anon/authenticated client writes to the installed QA tables are denied by RLS.

The current Android source was published to production OTA group `cdfd42a5-7c78-4cd0-9673-1f451073aa16`, Android update `019f596f-1a87-76d8-abe3-14342c8d1cf6`, from source commit `f6ac19fe0c85f4e28db715315e5829043f9fb3ed`. Play-installed device `R5CR120QCBF` loaded that update with package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `80`, runtime `1.0.0`, channel `production`, embedded launch `false`, and emergency launch `false`.

Live `watch_once` now records the six current blockers with `source=play_installed`, `discovered_by=autonomous_operator`, current update/runtime/channel diagnostics, `fakeProof=false`, `highRiskExecuted=false`, `moneyMoved=false`, and `userRightsChanged=false`, and creates a safe Owner Command request. A targeted one-device traversal on the current OTA proved normal `/chat` now shows `chat-inbox-screen` / `chat-search-input`, and `/creator-monetization-setup` shows the Platform Studio `Premium required` / `Manage Premium` compatibility gate. Restricted `/chat`, Premium-active account proof, moderator boundary follow-up, and two-device realtime remain open until the exact account/device prerequisites are available.

Follow-up on 2026-07-13 from local runner `Loverss-MacBook-Pro.local` is Partial. `sudo -n true` fails with a password requirement, `/etc/chillywood/installed-product-qa-operator.env` is absent, `/etc/chillywood` does not exist locally, and `chillywood-prod-01` did not resolve from this host. Missing and invalid Edge Function token calls still return `401 installed_qa_operator_token_required`, but a valid token call and Firebase result post were not attempted because no raw token is available in the required root-owned env file. Do not generate or print a replacement token until it can be stored as root-owned mode `600` and the matching hash can be set as `INSTALLED_QA_OPERATOR_TOKEN_SHA256`.

The same follow-up ran a targeted Play-installed one-device traversal at `/tmp/app-full-seeded-one-device-role-traversal-rerun-20260713063737`: `Pass=18`, `Human review=4`, `Blocked=1`, `Two-device required=4`, `Failures=0`. It proved normal `/chat` and `/creator-monetization-setup` again. It left restricted `/chat` blocked because `proof_restricted_001` opened `chat-inbox-screen`. It left Premium active proof blocked because `/subscribe` showed `Premium is not active`. It left moderator boundary open because the installed capture showed `admin-search-panel` / `admin-user-search-input`; source now gates Admin Search behind `canUseAdminSearch`, but that source fix is not installed-proved until a future OTA and rerun. Two-device realtime remains `second_device_required`.

## watch_once

`watch_once` checks whether the current production OTA has installed proof coverage, whether required proof accounts are healthy, whether one or two Play-installed devices or an approved device lab is available, and whether known traversal blockers remain unresolved. If device-lab automation is configured, the operator can run the bounded installed route traversal. If no device lab exists, it still records `device_lab_unavailable` or `manual_codex_only_gap`; it must not silently pass.

`watch_once` may create an Owner Command request for safe source/proof/testID follow-up. It does not execute app control, grant Premium, mutate roles, mutate auth/RLS, move money, enforce moderation, publish OTA, sideload, install, clear app data, or close two-device proof.

## Fixture And Device Rules

Premium fixture repair is provider-backed only. Allowed closure paths are a known provider-backed Premium active account, a Google Play / RevenueCat sandbox renewal, a provider-backed restore, or an explicitly approved test-only setup that does not manually grant production Premium. Direct entitlement edits, fake Premium rows, and manual Premium grants are forbidden.

two-device proof requires two Play-installed devices or approved device lab. One device can record readiness and blockers only; it cannot close realtime proof.

The scheduler is pending until device-lab path exists. Do not claim a scheduled installed QA loop active until a safe installed device automation path or approved device lab/timer proof exists.

## Firebase Test Lab Path

Firebase Test Lab uses cost-capped cheap mode for this operator. The first supported path is `scripts/installed-qa-firebase-test-lab.mjs` plus `qa/firebase-test-lab/README.md`; it defaults to `FIREBASE_TEST_LAB_MODE=cost_capped`, `FIREBASE_TEST_LAB_MONTHLY_CAP_USD=5`, `FIREBASE_TEST_LAB_PER_RUN_CAP_USD=0.25`, virtual-device-only, daily at most, and on-change or owner-command execution only when useful. Unknown free quota is allowed only when worst-case virtual-device cost is bounded under the per-run cap and monthly remaining budget. Physical devices, broad crawls, two-device Firebase runs, and over-cap runs require explicit owner approval.

Firebase uploaded artifact is not Play-installed proof. Findings from this lane use `source=firebase_test_lab_uploaded_artifact`, `device_lab_provider=firebase_test_lab`, and `proofSource=firebase_test_lab_uploaded_artifact`; they may prove an uploaded APK/AAB launches, does not crash, and records route/marker findings when the lab reaches those markers. They must not claim Google Play installer delivery, RevenueCat/Google Play Billing Premium state, local user push behavior, or two-device LiveKit closure.

QA tiers are explicit. Tier 0 is source/backend/operator-only and can run frequently without device lab. Tier 1 is Firebase virtual smoke for app launch, no crash, release diagnostics marker, `/chat`, `/creator-monetization-setup`, and normal `/admin` denial when safe fixtures exist. Tier 2 is broader Firebase virtual/physical coverage and owner-approved only. Tier 3 is physical Play-installed or provider/device proof for Premium Billing, two-device LiveKit, camera/mic, push, and other flows Firebase uploaded-artifact smoke cannot close.

The previous zero-cost audit found Firebase config files, both `firebase` and `gcloud` CLIs, a configured Google Cloud/Firebase project, active gcloud credentials, Firebase/Test Lab API/catalog access, and Android APK/AAB artifacts, but billing/free-quota readback was unavailable. That `$0`-only blocker is superseded by the owner-approved cost-capped policy. The runner now records `costEstimateUsd`, `maxAllowedCostUsd`, `monthlyBudgetUsd`, `monthlySpentEstimateUsd`, `billingRisk`, `quotaMode`, `deviceType`, and `runReason`; no Firebase scheduler is claimed active until a daily cost-capped timer is separately approved, installed, fired, and audited.

Latest cost-capped proof: an owner-command Tier 1 Firebase virtual smoke completed on 2026-07-13 as matrix `4612242345700782646`. The guard estimated worst-case cost `costEstimateUsd=0.09` under `maxAllowedCostUsd=0.25` and `monthlyBudgetUsd=5`, with `billingRisk=low`, `quotaMode=cost_capped_worst_case`, `deviceType=virtual`, `runReason=owner_command`, `fakeProof=false`, `moneyMoved=false`, `userRightsChanged=false`, and `highRiskExecuted=false`. The local budget ledger was written. The local host did not have `/etc/chillywood/installed-product-qa-operator.env`, so the matrix result was not posted to the live Edge Function from this machine; the production token remains host-only.

## Root And Scheduler Bootstrap

Non-interactive sudo is not installed on the local runner. Broad `NOPASSWD: ALL` is forbidden. If a runner needs persistent non-interactive root operations, install a narrow sudoers rule once through an administrator/passworded `visudo` session and limit it to exact installed-QA env/scheduler bootstrap commands. The preferred path is still root-created files and services:

- `/etc/chillywood/installed-product-qa-operator.env`, owner `root:root`, mode `600`.
- no service-role key in that env file.
- raw token only in the env file; hash only as the Supabase function secret.
- daily Firebase smoke only after the cost guard passes, live posting works, and the timer has fired and audited.

On Linux/systemd, the future timer must call only the cost-capped Firebase smoke path with `FIREBASE_TEST_LAB_RUN_REASON=daily_scheduled`, `FIREBASE_TEST_LAB_REPORT_TO_OPERATOR=true`, `operator_id=installed_product_qa_operator`, and `scheduler=systemd_timer`. On this macOS local runner there is no systemd timer to install; do not claim scheduler active from launchd or manual commands unless that path is separately source/proofed, fired, and audited.

## Safety

The operator must never store secrets, tokens, provider credentials, service-role keys, private evidence, reporter identity, signed media access values, LiveKit tokens, tax IDs, or bank details. It may store sanitized route names, test IDs, account role labels, result classes, update/runtime/channel diagnostics, blocker classifications, and next safe actions.

High-risk fixes route through Owner Command or Autonomous Approval and stop. The installed QA operator reports and requests; it does not patch production behavior by itself.

## Validation

Required gates:

- `npm run proof:installed-product-qa-operator`
- `npm run guard:installed-product-qa-operator`
- `npm run proof:full-app-authority-product-audit`
- `npm run guard:full-app-authority-product-audit`
- `npm run proof:owner-command-operator`
- `npm run proof:owner-command-routing`
- `npm run proof:owner-command-approval-gates`
- `npm run proof:autonomous-systems-contract`
- `npm run guard:autonomous-systems-contract`
- `npm run validate:runtime`
- `npm run guard:route-contracts --if-present`
- `npx tsc --noEmit`
- `deno check supabase/functions/installed-product-qa-operator/index.ts`
- `npm run installed-qa-operator:firebase-test-lab:self-test`
