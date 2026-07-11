# Money Flow & Ledger Control Plane

Status: `foundation_readonly_guarded`

Last updated: 2026-07-11

This runbook governs Chi'llywood money, ledger, payout, billing, sponsor, fraud, and provider-readback foundations. It is a control plane and guardrail, not a money-moving system.

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

## Admin Surface

The canonical route remains `/admin`. The Money Flow Control section is read-only/foundation status:
- system status
- blocked production money actions
- approval required labels
- external provider confirmation required labels
- proof/guard status

It does not expose active payout, charge, transfer, cashout, checkout, invoice, payment-link, manual Premium, or provider-mode buttons.

## Emergency Stop

`money_flow_control` emergency_stop blocks every non-read-only money mutation. Read-only reports can still run. Pause/resume remains owner/super-admin controlled through the autonomous approval framework. Emergency stop does not change provider-backed Premium readback and does not create refunds, payouts, cashout, or charges.

## Approval Path

Level 3/4 money actions use the existing autonomous approval request path:
- Rachi can recommend/request, not approve.
- Operators can request, not self-approve.
- Owner/super-admin approval is required.
- Level 4 also requires external provider confirmation/readback.
- Fresh preflight and exact scope match are required before execution.
- Every status change is audited.

No real money action is executable from this foundation task.
