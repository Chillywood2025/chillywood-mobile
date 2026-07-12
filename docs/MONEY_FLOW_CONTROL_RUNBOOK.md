# Money Flow & Ledger Control Plane

Status: `scoped_write_capable_guarded`

Last updated: 2026-07-12

This runbook governs Chi'llywood money, ledger, payout, billing, sponsor, fraud, and provider-readback foundations. It is a control plane and guardrail with scoped safe write authority for reconciliation/status/review/audit records only. It is not a money-moving system.

## Scope

Registered system id: `money_flow_control`

Covered surfaces:
- premium_revenue
- revenuecat_entitlements_readback
- google_play_receipts_readback
- stripe_connect_foundation
- creator_payout_ledger
- payout_review_queue
- payout_batches
- provider_transfer_records
- network_billing
- sponsor_deals
- fraud_holds
- usage_metering
- refunds_disputes_future
- tax_compliance_future

## Allowed Without Owner Approval

Read-only reconciliation can be autonomous when it only reads or reports:
- provider readiness status
- ledger consistency checks
- duplicate event detection
- missing-provider-data detection
- stale sync detection
- admin read-only summaries
- risk reports
- autonomous approval request creation

The Money Operator may also write scoped safe records with no money movement:
- `money_operator_events`
- `money_reconciliation_runs`
- `money_reconciliation_findings`
- `money_provider_sync_status`
- `money_duplicate_event_detections`
- `money_required_review_flags`
- `money_flow_health_snapshots`
- `money_operator_learning_state`
- `autonomous_approval_requests` for Level 3/4 actions

Allowed safe fixes are limited to recording reconciliation findings, marking provider sync stale/synced/failed, marking duplicate provider/webhook event hashes, marking ledger/payout/revenue items `requires_review`, creating approval requests, recording blocked actions, recording external-confirmation requirements, writing sandbox/test-mode proof results, and updating learning state.

Sandbox/test-mode proof can be Level 2 only when no real money moves, no customer is charged, no payout is released, and provider data is labeled sandbox/test-mode.

## Approval Levels

Production money setup or mutation requires Level 3 owner/super-admin approval:
- enabling production checkout
- enabling live provider integration
- enabling payout review mutation
- enabling fraud enforcement mutation
- changing money-facing config
- changing payout eligibility rules
- changing Premium entitlement logic
- enabling production webhook money handling
- creating production payment links or invoices
- changing revenue share formulas
- changing network billing rules

Real money movement requires Level 4 owner/super-admin approval plus external provider confirmation:
- real customer charge
- real payout
- real transfer
- real cashout
- production Stripe mode switch
- public payment launch
- provider plan/add-on
- legal/compliance/tax flow activation
- public revenue or payout claims

Approval alone is not execution. Operators must re-run fresh preflight, match the approved system/action/write scope exactly, verify no emergency stop is active, and verify external provider confirmation/readback for Level 4.

## Forbidden

The control plane blocks:
- no manual Premium grant
- no fake revenue
- no fake creator earnings
- no fake payable balance
- no fake paid status
- no fake transfer complete
- no real money movement without Level 4
- no payout release without provider confirmation
- no charging customers from foundation tables
- no marking test-mode data as production
- no provider secrets in logs, docs, artifacts, or client code

Forbidden autonomous writes include marking a payout paid, releasing payouts, creating transfers or payouts, charging customers, sending invoices, creating payment links, enabling cashout, manually granting Premium, editing Premium entitlement outside provider-backed readback, creating fake revenue or fake payable balances, clearing fraud holds as paid/settled, mutating auth/RLS, mutating provider products, or switching Stripe live mode.

## Money Operator Function

Edge Function: `money-operator`

Auth:
- `x-money-operator-token`
- `MONEY_OPERATOR_TOKEN_SHA256`
- SHA-256 constant-time comparison
- missing/invalid tokens deny

Actions:
- `health_snapshot`
- `reconciliation_plan`
- `run_readonly_reconciliation`
- `sync_provider_status_safe`
- `record_duplicate_event`
- `mark_requires_review`
- `create_approval_request`
- `mark_sandbox_proof_result`
- `learning_report`
- `execute_approved_money_action_dry_run`
- `execute_approved_money_action`
- `provider_webhook_health`
- `provider_webhook_test_plan`
- `record_provider_webhook_delivery_status`
- `provider_delivery_history_readback`
- `provider_access_status`
- `provider_access_probe`
- `provider_dashboard_readback`
- `provider_test_delivery_plan`
- `provider_test_delivery_run`
- `provider_dashboard_repair_request`
- `provider_repair_request`
- `provider_access_report`
- `provider_webhook_reliability_report`
- `watch_once`

`execute_approved_money_action` does not move money. It records or blocks according to scope and still requires the autonomous approval path plus external provider confirmation for Level 4.

## Provider Webhook Reliability

Money Operator monitors provider webhook reliability for:
- RevenueCat (`revenuecat-webhook`)
- Google Play (`google-play-webhook`)
- Stripe Connect (`stripe-connect-webhook`)
- Stripe merch/checkout (`stripe-merch-webhook`)
- provider readiness/reconciliation surfaces

Registered provider reliability surfaces:
- `revenuecat_webhook_delivery`
- `google_play_webhook_delivery`
- `stripe_connect_webhook_delivery`
- `stripe_merch_webhook_delivery`
- `provider_readiness_audit`
- `provider_delivery_error_rate`
- `stale_provider_dashboard_integration_detection`
- `duplicate_webhook_integration_detection`

Safe monitor behavior:
- endpoint shape and missing/invalid auth checks
- provider sync status rows
- reconciliation findings for delivery failures
- duplicate provider/webhook event detections
- dashboard repair approval requests
- reliability reports
- provider delivery-history readback when provider dashboard/API access exists
- owner action when provider dashboard/API access is unavailable

The monitor cannot print provider secrets, cannot manually grant Premium, cannot create charges, payouts, transfers, cashout, invoices, or payment links, cannot mutate provider products, and test-mode proof cannot satisfy production readiness. Provider dashboard changes such as changing webhook URLs, signing secrets, event selections, or disabling stale duplicate integrations require an autonomous approval request before mutation.

RevenueCat dashboard test events are expected to return `200 test_received` only when the dashboard sends the configured shared secret. Test events must report `premiumGranted=false` and `liveMoneyAction=false`.

Current RevenueCat proof status: closed on 2026-07-12. A restricted RevenueCat v2 Secret API key with read-only project/integration permissions is stored only in trusted runtime secrets as `REVENUECAT_SECRET_API_KEY`. Money Operator provider readback works, active integration count is `1`, the endpoint host/path matches `bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/revenuecat-webhook`, and the RevenueCat dashboard TEST returned HTTP `200` / `test_received` with `signatureVerified=true`, `webhookProcessed=true`, `premiumGranted=false`, `liveMoneyAction=false`, and `moneyMoved=false`. No provider product, mode, webhook secret, Premium entitlement, charge, transfer, payout, invoice, payment link, cashout, or money movement changed.

Google Play direct webhook delivery is readiness-only when RevenueCat remains the entitlement source of truth. Missing `GOOGLE_PLAY_WEBHOOK_SECRET` means Google Play direct webhook delivery is not configured; this must not be called a production failure if the stack intentionally uses RevenueCat for entitlement events.

Stripe Connect and Stripe merch webhook proofs must use signed test/sandbox events only. Invalid signatures fail closed. Live-mode events are rejected by the test/sandbox handlers and cannot be used to claim production money readiness.

Error-rate classifications are `healthy`, `degraded`, `critical`, `outage`, and `unknown`. A 100% provider webhook error rate must record `money_provider_sync_status=blocked` or `failed`, create a `money_reconciliation_findings` row, appear in Admin Money Center, and create a Level 3 approval request when provider dashboard mutation is required.

Provider delivery-history readback should capture only safe evidence: last failure code, last success time, endpoint host/path, event type, and integration id hash. Raw provider credentials, webhook signing values, request payload secrets, bank/payout details, and service-role values are forbidden.

Duplicate/stale integration detection checks for old Supabase project hosts, wrong function paths, stale active integrations, and multiple active integrations for the same provider/capability. Money Operator may record findings and approval requests only. It must not delete or alter provider dashboard integrations without owner approval.

RevenueCat Premium stale readback can be recorded when RevenueCat says active but Supabase Premium readback is stale. Money Operator may record `stale_readback` and request provider replay/readback. It must not manually grant Premium.

## Provider Access Broker

Provider Access Broker gives Money Operator a controlled path to provider readback without pasted secrets. It covers RevenueCat, Google Play, Stripe Connect, Stripe merch/checkout, provider readiness, and provider billing reconciliation. The broker records provider access capability rows, audit events, and provider dashboard repair requests. It does not move money.

Allowed autonomous access:
- read webhook endpoint metadata
- read delivery health/status when the provider API exposes it
- read enabled/disabled state
- read last success/failure metadata when available
- send a non-money TEST event only when the provider/API or owner dashboard session classifies it as safe
- write Money Operator status rows
- create autonomous approval requests

Access modes are `none`, `local_env`, `supabase_secret`, `host_env`, `github_secret`, `cloudflare_secret`, `provider_api_readonly`, `provider_api_test_mode_write`, `provider_dashboard_owner_session`, and `provider_live_mutation_requires_approval`.

Provider dashboard/browser owner session is still required when a provider API cannot send TEST deliveries or expose delivery history. The broker records that requirement by name only and does not fake success.

Provider dashboard mutation requires owner/super-admin approval through the autonomous approval system. This includes disabling stale duplicate integrations, changing webhook URLs or headers, changing Google Pub/Sub endpoint/subscription config, changing Stripe webhook endpoint config, secret rotation, and any live-mode/provider-setting change. Fresh preflight and exact scope match are required before any approved repair.

Forbidden through Provider Access Broker:
- provider secret output or logs
- provider dashboard mutation without approval
- product ID or price changes
- live-mode switch
- charge, payout, transfer, invoice, checkout session, payment link, or cashout
- manual Premium grant
- Premium entitlement edit outside provider-backed flow

Broker tables are RLS-enabled and client-write denied:
- `provider_access_capabilities`
- `provider_access_audit_events`
- `provider_dashboard_repair_requests`

Package loop commands:
- `money-operator:provider-health`
- `money-operator:access-status`
- `money-operator:provider-access-probe`
- `money-operator:provider-dashboard-readback`
- `money-operator:provider-test-plan`
- `money-operator:provider-test-run`
- `money-operator:provider-repair-request`
- `money-operator:watch-once`
- `money-operator:report`

These commands call the token-gated Money Operator only when `MONEY_OPERATOR_FUNCTION_URL` or `SUPABASE_FUNCTIONS_URL` and `MONEY_OPERATOR_TOKEN` are available. Otherwise they fail closed with no write and no money movement.

## Admin Surface

The canonical route remains `/admin`. The Money Flow Control section shows scoped operator status and read-only/safe-write visibility:
- system status
- latest reconciliation runs
- required review flags
- duplicate detections
- provider sync health
- blocked money actions
- blocked production money actions
- approval required labels
- external provider confirmation required labels
- proof/guard status

It does not expose active payout, charge, transfer, cashout, checkout, invoice, payment-link, manual Premium, or provider-mode buttons.

## Emergency Stop

`money_flow_control` emergency_stop blocks every non-reconciliation money mutation. Read-only reports can still run. Pause/resume remains owner/super-admin controlled through the autonomous approval framework. Emergency stop does not change provider-backed Premium readback and does not create refunds, payouts, cashout, or charges.

## External Confirmation

Level 4 real money movement requires owner approval plus external provider confirmation/readback. Valid confirmation sources are Stripe transfer/payout/charge readback, Google Play / RevenueCat receipt or customer-info readback, signed provider webhook verification, payout provider transfer ID readback, or explicitly marked owner-attested manual external confirmation. Test-mode confirmation cannot satisfy a production action. Missing confirmation means no real money state mutation.

## Approval Path

Level 3/4 money actions use the existing autonomous approval request path:
- Rachi can recommend/request, not approve.
- Operators can request, not self-approve.
- Owner/super-admin approval is required.
- Level 4 also requires external provider confirmation/readback.
- Fresh preflight and exact scope match are required before execution.
- Every status change is audited.

No real money action is executable from this foundation task.
