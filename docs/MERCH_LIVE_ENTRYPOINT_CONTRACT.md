# Dormant merchandise checkout and webhook contract

This change is source compatibility, **not live activation**. No switch,
qualification, creator onboarding, key, webhook registration or real transaction
is created. Product creation remains sandbox by default. Production publication
requires a separate reviewed operational action. Already-approved production
listings retain owned title, stock, option and photo management; editing never
changes their provider mode or an accepted order snapshot.

## Initiation authority

The selected database product owns mode: `sandbox` / `production`. Buyer payloads
cannot select mode, credentials, account, amount or provider session identity.
Production products must be active, published physical goods, have available
inventory and satisfy the existing exact-session, creator legal/eligibility and
platform visibility checks. Sandbox retains exact beta/owner/operator access.

Production additionally requires `live_money_enabled` and `merch_enabled` ON,
Stripe `platform_commerce` production readiness active with live money enabled,
and a non-revoked, unexpired private account qualification with reviewed provider,
legal and fulfillment evidence hashes. All are absent/OFF unless separately
commissioned. Readiness labels alone cannot substitute for qualification.

Reservation retains the existing global-latch → buyer → product/variant → order
sequence and new dispatch provenance wrapper. The provider binding freezes exact
order, mode, account, buyer, creator, product, variant, quantity, price/currency,
accepted tracking/return and net-share terms. The existing immutable tax binding
must use that same account/mode/product. Immediately before durable dispatch,
SQL rechecks live controls, qualification and full tax policy under retained locks.

A positively acknowledged **prepared, never-dispatched** attempt may release
stock. A dispatched/unknown attempt never gains replacement permission merely
because no provider session ID was stored. Retrying uses the same immutable order
and idempotency key, not a fresh payment. Sales disablement blocks new dispatch,
not reconciliation of accepted provider facts.

## Optional configuration (not provisioned here)

- Existing test key and `STRIPE_MERCH_RECONCILIATION_ACCOUNT_ID` remain test-only.
- `STRIPE_MERCH_LIVE_CHECKOUT_KEY`: explicit `sk_live_` or appropriately scoped
  `rk_live_` key. Never fall back to a test or observation credential.
- `STRIPE_MERCH_LIVE_ACCOUNT_ID`: exact platform account expected by checkout and
  the live webhook endpoint configuration.
- `STRIPE_MERCH_LIVE_WEBHOOK_SECRET`: distinct live endpoint signing secret.

Checkout verifies the account via GET before POST; response mode, order metadata,
tax policy, amount and currency must match. Existing pinned Clover parameters
remain in use. Unknown transport outcomes preserve the durable hold.

The webhook verifies raw bytes against distinct configured test/live signing
secrets. Exactly one must match; that match selects mode. Both event and object
livemode must agree. Connected-account envelopes are rejected in this platform
checkout lane. A live signature context needs the exact configured account and
immutable order/provider/tax binding. It cannot create digital access, transfers,
payouts or payable balances. Refund/dispute facts remain held accounting evidence.
Canonical succeeded PaymentIntent timing, fixed 30-day return terms and private
fulfillment address handling remain unchanged.

## Commissioning and rollback

1. Merge only after exact-head Required Validation, complete schema replay and
   native PostgreSQL stop/dispatch and qualification/dispatch schedules pass.
2. Deploy migration before matching Edge source with all financial switches OFF.
   Confirm mode-qualified paths refuse without zero-provider-dispatch proof.
3. Separately verify account/provider, tax registration/legal scope, creator
   onboarding, delivery, return/dispute handling and credential scopes. Record
   actual evidence, never fixture strings. No creator account exists merely
   because these interfaces compile.
4. Configure matching account-bound keys/secrets only through the approved secret
   mechanism; test cross-mode, wrong-account and unknown-response scenarios with
   explicitly approved provider test activity before considering live activation.
5. Any live transaction requires separate authorization. This source does not
   enable payouts or financial automation. Live callbacks for previously accepted
   orders continue even when new sales are disabled.

Stop new dispatch by disabling the existing live/merch control or revoking the
account qualification. A request already issued cannot be unsent. Keep webhook,
order visibility and reconciliation available; preserve claims, bindings and
unknown holds. Roll back only to mode-compatible fail-closed code or use forward
repair; an old sandbox-only webhook would strand accepted production events.
Never erase provider bindings, infer missing session IDs mean no dispatch, or
rewrite deployed migration history.

## Evidence

Actual Edge handlers are exercised with synthetic HTTP only and the full migrated
SQL schema. Tests cover production success, wrong key/account, immutable quote,
stop-before-dispatch, callbacks after stop, role denials and unknown holds. The
native runner adds four actual independently blocked PostgreSQL schedules.
Local PGlite executes its fixture SQL sequentially only to catch schema drift;
that is explicitly **not** native concurrency proof. No provider activity was run.
