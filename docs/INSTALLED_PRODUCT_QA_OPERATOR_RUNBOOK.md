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

## watch_once

`watch_once` checks whether the current production OTA has installed proof coverage, whether required proof accounts are healthy, whether one or two Play-installed devices or an approved device lab is available, and whether known traversal blockers remain unresolved. If device-lab automation is configured, the operator can run the bounded installed route traversal. If no device lab exists, it still records `device_lab_unavailable` or `manual_codex_only_gap`; it must not silently pass.

`watch_once` may create an Owner Command request for safe source/proof/testID follow-up. It does not execute app control, grant Premium, mutate roles, mutate auth/RLS, move money, enforce moderation, publish OTA, sideload, install, clear app data, or close two-device proof.

## Fixture And Device Rules

Premium fixture repair is provider-backed only. Allowed closure paths are a known provider-backed Premium active account, a Google Play / RevenueCat sandbox renewal, a provider-backed restore, or an explicitly approved test-only setup that does not manually grant production Premium. Direct entitlement edits, fake Premium rows, and manual Premium grants are forbidden.

two-device proof requires two Play-installed devices or approved device lab. One device can record readiness and blockers only; it cannot close realtime proof.

The scheduler is pending until device-lab path exists. Do not claim a scheduled installed QA loop active until a safe installed device automation path or approved device lab/timer proof exists.

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
