# Final Launch Operations Runbook

Status: Final launch operations lane.

This runbook covers provider refund execution, batch account purge/de-identification, and manual-review categories. It does not activate live money, payouts, provider refunds, production checkout, Premium product changes, LiveKit authority changes, RLS weakening, scan-gate weakening, auth/reset weakening, abuse-control weakening, or broad automatic real-user purge.

## Seven-Flow Money Switchboard

The seven-flow production switchboard lives in `docs/SEVEN_FLOW_PRODUCTION_SWITCHBOARD.md`.

Current classification:

- Seven-flow app-side proof: Closed.
- Seven-flow production switchboard: Partial.
- Creator-money production-labeled products: Blocked.
- Real-money activation: Off by default unless owner explicitly enables each flow.
- Creator payouts: Off unless separate payout lane enables them.
- Provider refunds: Manual/external unless separate provider-refund lane enables automation.
- Approved starting prices are launch defaults, not the only future prices.
- Future custom pricing requires provider-backed price tiers/products/base plans/offers.
- Unsupported custom amounts fail closed.
- United States only first.
- Stripe payout and merch prep documented separately.
- Stripe payouts remain OFF.
- Stripe merch checkout remains OFF.

The seven controlled flows are Premium, Tips, Paid Video, Watch-Party Ticket, Channel Subscription, VIP, and Event Pass. Each flow requires an explicit owner decision before production activation. The global emergency stop is `live_money_enabled=off`, and creator payouts remain governed separately by `payouts_enabled=off` plus payout-lane requirements.

Do not use this runbook to turn on live money. Do not use it to create payable balances, withdrawals, cash-out, transfers, payout movement, provider refunds, fake provider success, Premium product changes, Premium gate weakening, RLS weakening, LiveKit authority changes, scan-gate weakening, abuse-throttle removal, or block-enforcement removal. Do not use Stripe for Android digital creator-money purchases; Stripe is reserved for future creator payouts and physical merch in separate approved lanes.

## Provider Refund Execution

Provider refund execution is manual/external. The app must not claim instant or automatic provider refunds. Entitlement revoke/access removal behavior is proved locally; real provider refund API execution is not implemented or proved.

Current support/admin process:

1. Receive the refund request through support.
2. Verify the purchase, receipt, and provider/store record outside the app.
3. If approved, process the provider/store refund outside the app using the provider console or store tooling.
4. Revoke or adjust local access only through the proved entitlement/access-grant revoke path.
5. Record a support/audit note with the actor, time, reason, and sanitized outcome.

Do not call provider refund APIs from the app. Do not promise instant refunds. Do not move money, payouts, payable balances, withdrawals, or cash-out from this workflow.

## Batch Purge Operation

Batch account purge/de-identification is controlled by backend config and operator-only RPCs.

Modes:

- Dry-run: default. Returns sanitized eligible counts and suffixes only. No mutation.
- Proof-only: processes disposable proof accounts only when explicitly called with mutation enabled.
- Production: available only when owner/operator config explicitly enables batch processing and the caller supplies the enable flag.

Controls:

- Emergency stop must be off.
- Batch enabled flag controls production batch mode.
- Proof batch enabled flag controls proof-only batch mode.
- Max batch size bounds each run.
- Owner/operator role is required.
- Mobile clients do not use service-role keys.
- Every batch run writes sanitized audit output.

Eligibility:

- Account is scheduled for deletion.
- Restore window has expired.
- Account was not restored.
- Account is not already purged/de-identified.
- Account is not active.
- Account is not owner, operator, moderator, or otherwise protected.
- Account is not an active sandbox/protected tester.

Operator sequence:

```bash
node scripts/proof-final-launch-operations.mjs
node scripts/proof-final-launch-operations.mjs --run --proof-only
```

Production batch use, if approved later, must start with dry-run, verify eligible counts, confirm emergency stop state, set the production batch flag intentionally, run a bounded batch, read back audit rows, and disable the flag again if continuous operation is not approved.

## Emergency Stop

Set the account purge runtime config emergency stop flag to disable purge mutation. With emergency stop enabled, the batch RPC fails closed and performs no mutation.

If an incident is suspected:

- enable emergency stop;
- stop scheduled invocations if any exist;
- preserve audit logs;
- do not run provider refund APIs;
- do not delete storage/provider/legal records;
- escalate to owner/legal/support for review.

## Manual-Review Queue

Manual-review items are used for records that should not be automatically deleted during account purge.

Categories:

- creator media;
- storage references;
- provider records;
- legal/support/DMCA;
- payment/access grants;
- abuse/security records;
- admin audit logs.

Statuses:

- pending_review;
- retained;
- deidentified;
- deleted;
- legal_hold;
- provider_required;
- unsupported/manual.

Each item records category, target account, reason, status, creation time, reviewer, review time, resolution, audit link/reference, and sanitized metadata. Non-admin users cannot read review items. Owner/operator users can read and transition review items through the backend RPC.

Creator media and storage references are not automatically deleted by batch purge. Provider, legal, support, DMCA, payment, fraud, security, and audit records are retained privately unless owner/legal review approves a specific action.

## What Not To Promise

Do not promise:

- instant permanent deletion;
- automatic provider refunds;
- purge of every legal/support/audit/payment/provider record;
- deletion of creator media or storage objects without review;
- live-money movement, payouts, withdrawals, or cash-out;
- legal compliance beyond the behavior proved in the current docs and artifacts.
