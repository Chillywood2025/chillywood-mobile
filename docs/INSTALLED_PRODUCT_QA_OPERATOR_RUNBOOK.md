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

The current blockers are open QA findings discovered by Codex manual proof:

- normal `/chat` stayed on Home instead of `chat-inbox-screen`.
- restricted `/chat` showed Chat inbox instead of restricted or denied copy.
- `/creator-monetization-setup` missed the expected compatibility/Premium marker.
- the Premium-labelled account was not actually Premium active.
- moderator broad-search/private-evidence boundary proof was pending.
- two-device realtime proof was pending.

Each row is recorded with `proof_source=manual_codex_proof`, `discovered_by=codex_manual`, `fakeProof=false`, `highRiskExecuted=false`, `moneyMoved=false`, and `userRightsChanged=false`. Findings remain open until a future installed proof, account fixture proof, or approved device-lab run closes them.

## Live Deployment Status

On 2026-07-13 the `installed-product-qa-operator` Edge Function was deployed and token-gated with `INSTALLED_QA_OPERATOR_TOKEN_SHA256`; the raw token is stored only in `/etc/chillywood/installed-product-qa-operator.env` on `chillywood-prod-01` with `root:root` ownership and mode `600`. Missing and invalid tokens return `401`, valid status/report/watch calls write safe rows only, and anon/authenticated client writes to the installed QA tables are denied by RLS.

The current Android source was published to production OTA group `cdfd42a5-7c78-4cd0-9673-1f451073aa16`, Android update `019f596f-1a87-76d8-abe3-14342c8d1cf6`, from source commit `f6ac19fe0c85f4e28db715315e5829043f9fb3ed`. Play-installed device `R5CR120QCBF` loaded that update with package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `80`, runtime `1.0.0`, channel `production`, embedded launch `false`, and emergency launch `false`.

Live `watch_once` now records the six current blockers with `source=play_installed`, `discovered_by=autonomous_operator`, current update/runtime/channel diagnostics, `fakeProof=false`, `highRiskExecuted=false`, `moneyMoved=false`, and `userRightsChanged=false`, and creates a safe Owner Command request. A targeted one-device traversal on the current OTA proved normal `/chat` now shows `chat-inbox-screen` / `chat-search-input`, and `/creator-monetization-setup` shows the Platform Studio `Premium required` / `Manage Premium` compatibility gate. Restricted `/chat`, Premium-active account proof, moderator boundary follow-up, and two-device realtime remain open until the exact account/device prerequisites are available.

## watch_once

`watch_once` checks whether the current production OTA has installed proof coverage, whether required proof accounts are healthy, whether one or two Play-installed devices or an approved device lab is available, and whether known traversal blockers remain unresolved. If device-lab automation is configured, the operator can run the bounded installed route traversal. If no device lab exists, it still records `device_lab_unavailable` or `manual_codex_only_gap`; it must not silently pass.

`watch_once` may create an Owner Command request for safe source/proof/testID follow-up. It does not execute app control, grant Premium, mutate roles, mutate auth/RLS, move money, enforce moderation, publish OTA, sideload, install, clear app data, or close two-device proof.

## Fixture And Device Rules

Premium fixture repair is provider-backed only. Allowed closure paths are a known provider-backed Premium active account, a Google Play / RevenueCat sandbox renewal, a provider-backed restore, or an explicitly approved test-only setup that does not manually grant production Premium. Direct entitlement edits, fake Premium rows, and manual Premium grants are forbidden.

two-device proof requires two Play-installed devices or approved device lab. One device can record readiness and blockers only; it cannot close realtime proof.

The scheduler is pending until device-lab path exists. Do not claim a scheduled installed QA loop active until a safe installed device automation path or approved device lab/timer proof exists.

## Firebase Test Lab Path

Firebase Test Lab is zero-cost-first for this operator. The first supported path is `scripts/installed-qa-firebase-test-lab.mjs` plus `qa/firebase-test-lab/README.md`; it defaults to `FIREBASE_TEST_LAB_MAX_COST_USD=0`, virtual-device-only, manual/on-demand execution. Unknown billing/quota state fails closed before any Firebase matrix starts. Physical devices require `FIREBASE_TEST_LAB_ALLOW_PHYSICAL=true` plus an owner-approved no-cost quota note, and scheduled Firebase runs require `FIREBASE_TEST_LAB_ALLOW_SCHEDULED=true` plus quota-safe owner proof. Policy: no paid Firebase run without owner approval.

Firebase uploaded artifact is not Play-installed proof. Findings from this lane use `source=firebase_test_lab_uploaded_artifact`, `device_lab_provider=firebase_test_lab`, and `proofSource=firebase_test_lab_uploaded_artifact`; they may prove an uploaded APK/AAB launches, does not crash, and records route/marker findings when the lab reaches those markers. They must not claim Google Play installer delivery, RevenueCat/Google Play Billing Premium state, local user push behavior, or two-device LiveKit closure.

The current zero-cost audit found Firebase config files, both `firebase` and `gcloud` CLIs, a configured Google Cloud/Firebase project, active gcloud credentials, Firebase/Test Lab API/catalog access, and Android APK/AAB artifacts. The billing/quota risk could not be guaranteed because billing status/free-quota readback was unavailable and Tool Results API was not confirmed enabled. No Firebase matrix was started, `costEstimateUsd=0` only describes the blocked/no-run state, `billingRisk=unknown`, and scheduler remains `device_lab_scheduler_pending`.

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
