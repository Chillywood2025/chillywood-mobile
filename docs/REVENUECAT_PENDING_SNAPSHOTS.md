# Exact pending RevenueCat snapshots

## Scope

This adds an access-only worker for pending `REFUND_REVERSED` (App Store Premium)
and `SUBSCRIPTION_EXTENDED` (already-bound Premium). It does not reverse a payment,
refund, earnings ledger, creator balance, or payout. It never treats the webhook
alone as restoration authority. Creator purchases, consumables, missing bindings,
transferred owners, non-active provider states and incomplete history stay pending.

Both private worker modes default **OFF**. Existing authenticated sandbox Restore
remains unchanged. Deploying this source is not provider qualification or activation.

## End-to-end proof

1. Authenticated webhook ingress captures immutable event hash, owner, provider,
   environment, original transaction, product/base plan and occurrence time.
   Historical rows lacking facts cannot qualify; same-hash authenticated redelivery
   can fill previously absent typed facts, never invent them.
2. A service-only claim captures the complete current binding and a two-minute
   lease. Old or unsupported jobs are delayed fairly rather than monopolizing the
   queue. Failed observations receive a five-minute retry delay. No permanent
   attempt limit silently drops a refund reversal.
3. GET-only RevenueCat v2 discovery is pinned to the configured project, customer
   and environment. Bounded candidate histories must identify exactly one
   subscription with the existing original transaction; original and latest
   renewal IDs are not assumed equal. Current
   and original customer must both equal the existing owner; store, environment,
   purchased ownership, active state, no pending payment and finite future expiry
   must agree. The product endpoint and Premium entitlement must agree too.
4. Complete transaction history binds the first transaction to the subscription's
   start and existing original ID, and the current transaction to current-period
   start, store identifier, product and effective expiration. Ambiguity, a foreign
   pagination URL, more than ten pages/1,000 transactions or over-budget reads
   defer the job. A second exact subscription read must match the first. Transport
   and body reads race the aggregate deadline even if a transport ignores abort.
5. Atomic completion locks the existing authority scopes and rechecks lease,
   binding, account restrictions, quarantine, cross-domain reservations, mode,
   catalog mapping, rails and wall-clock freshness. A refund reversal must be
   newer than the exact existing REFUND dispatcher event and match every revoked
   entitlement/refunded-grant marker. A revocation, arbitrary refund marker,
   changed owner/product/plan, or newer terminal cannot be cleared.
6. The complete prior binding/entitlement/grant graph is retained in a private
   immutable receipt before changing its access projection. Original refund
   provider events and all financial ledgers remain unchanged. A new non-purchase
   reconciliation event binds the current finite access graph. A later refund
   still revokes it normally; retrying the old receipt cannot restore it again.

## Deployment and qualification

Dependencies: migrations `20261101143428`, `20261101143821`, then
`20261101151722`; Edge `revenuecat-pending-reconcile` with JWT verification ON.
It also requires the exact existing service credential, `REVENUECAT_PROJECT_ID`,
existing `REVENUECAT_SECRET_API_KEY`, and explicit
`REVENUECAT_RECONCILIATION_ENVIRONMENT=sandbox|production`. It never accepts a
project/environment/customer/snapshot supplied in a request body.

Before activation, independently verify existing secret read scope for customer
subscriptions, products, entitlements and subscription transactions, exact project
identity, real response shape, same-owner sandbox refund/reversal behavior, and
the immutable deployed source. No new credential is created by this change.
Production additionally needs an independently reviewed private qualification
hash/time no older than 30 days for that exact project, active exact catalog mappings, and both matching
provider/webhook rails ON. An enabled flag alone cannot qualify production.
Synthetic tests do not supply that production qualification.

No scheduler is installed here. A qualified existing server scheduler can invoke
one job per request using its existing server credential. Keep financial automation,
payouts and public release unchanged. Rollback disables the private mode gate and
stops invocation; it never deletes financial evidence or rewrites migration history.

## Evidence and limits

Tests execute the actual reader with controlled provider transport and the full
migration chain for initial purchase → refund → pending reversal → exact access
snapshot → later refund. Negative cases include mismatched identity, changed
readback, stale lease/binding, disabled mode, refund-marker mismatch, denied client
RPC grants and old receipt replay. These are not live RevenueCat/store proof or
native PostgreSQL concurrent-transaction proof.

Provider contract references:
- https://www.revenuecat.com/docs/api-v2/subscription
- https://www.revenuecat.com/docs/api-v2/subscription-transactions
- https://www.revenuecat.com/docs/api-v2/product

V2 current access/effective expiration is used only for access restoration. No
explicit financial refund-reversal field is inferred, and no refund proceeds are
recredited. V1 `refunded_at` is not silently assumed available from a V2-only key.
