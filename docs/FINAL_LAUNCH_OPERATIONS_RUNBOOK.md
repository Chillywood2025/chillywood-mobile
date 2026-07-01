# Final Launch Operations Runbook

Status: Final launch operations lane.

This runbook covers provider refund execution, batch account purge/de-identification, and manual-review categories. It does not activate live money, payouts, provider refunds, production checkout, Premium product changes, LiveKit authority changes, RLS weakening, scan-gate weakening, auth/reset weakening, abuse-control weakening, or broad automatic real-user purge.

## Seven-Flow Money Switchboard

The seven-flow production switchboard lives in `docs/SEVEN_FLOW_PRODUCTION_SWITCHBOARD.md`.

Current classification:

- Seven-flow app-side proof: Closed.
- Seven-flow production switchboard: Partial.
- Premium-first activation proof: Partial.
- Premium monthly: Verified at $9.99/month.
- Premium annual: Blocked at $99.99/year.
- Premium annual: Provider-blocked pending Google Play support/base-plan resolution.
- Premium public activation remains OFF.
- Creator-money production-labeled products: Partial.
- Creator-money tax/legal/compliance plan: Partial.
- Creator-money product creation: Partial.
- Channel Subscription base plan: Blocked by Google Play Base plan ID validation before Save.
- Channel Subscription remains provider-blocked until Google Play base plan issue is resolved. Creator Channel Subscription: Provider-blocked pending Google Play support/base-plan resolution. Google Play support packet: Submitted through Google Play Console Help on 2026-06-25 at 12:25 CDT; case ID pending. No provider products/base plans were changed.
- Purchase-option IDs use Google Play-valid hyphenated values.
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
- Codex must not guess tax/legal/compliance fields.

Premium-first launch remains blocked on annual setup because the owner requires both monthly and annual before launch. Google Play dashboard evidence verifies `premium_subscription` base plan `monthly` as Active, United States, `USD 9.99`; RevenueCat dashboard evidence verifies entitlement `premium`, offering `premium`, package `$rc_monthly`, and product `premium_subscription:monthly`. Premium annual is blocked at `$99.99/year`: the Google Play annual base-plan attempt reached approved values (`annual`, Yearly, United States only, `USD 99.99`) but Google Play kept `Base plan ID` invalid and returned `Your changes couldn't be saved`; no saved annual base plan and no RevenueCat `premium_subscription:annual` / `$rc_annual` mapping exists. Premium launch still requires licensed/internal purchase proof and owner approval. Creator-money activation remains a separate future lane.

The seven controlled flows are Premium, Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, and Event Pass. Each flow requires an explicit owner decision before production activation. The global emergency stop is `live_money_enabled=off`, and creator payouts remain governed separately by `payouts_enabled=off` plus payout-lane requirements.

Premium support and rollback:

1. If a user paid but Premium did not unlock, ask the user to run Restore Purchases, then support verifies Google Play/RevenueCat receipt and backend entitlement readback.
2. Cancellation/manage support must route through Google Play/RevenueCat management where available.
3. Provider refunds remain manual/external. Do not promise instant refunds and do not execute in-app provider refunds.
4. To stop new Premium purchases, keep or set `premiumPurchaseEnabled=false` and leave Premium gates backed by trusted entitlement readback.
5. Preserve already-valid Premium entitlements unless provider/revoke policy says otherwise.
6. Monitor RevenueCat customer info, Google Play base-plan status, backend `user_entitlements`, restore/revoke readback, Crashlytics, and analytics purchase/restore/error events after any owner-approved activation.

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
