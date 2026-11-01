# Sandbox checkout reservation repair

Source only: no migration or Edge deployment, provider request, checkout,
payment, payout, flag activation or cron change is authorized here. Applied
migrations remain untouched. Existing historical orphan orders are **not**
repaired or bulk released by this change.

## State and request identity

The new service-only reservation RPC wraps the retained actor/session,
inventory, publication, SKU, displayed-price and shipping-term checks. Under
the same buyer lock, it creates private `prepared` provenance only when the
order is atomically new. Existing rows never acquire this proof on retry.
RLS and FORCE RLS are enabled; API roles have no direct table access.

Before the Checkout POST, all parameters are built and serialized, then the
exact current buyer/session/attempt and product/quantity/SKU/accepted-term
identity transitions durably to `dispatched`. Both new RPCs acquire the retained
global Brand latch before buyer/product/variant/order locks, matching existing
reservation, webhook and photo-reference triggers. Lost dispatch acknowledgement,
transport failure, malformed provider response, and failed session persistence
retain the hold. The same order, immutable parameters and Stripe idempotency
key are reused; no replacement payment is automatically attempted.

Static configuration/secret/input checks happen before allocation. Failures
after allocation (including malformed reservation output, invalid accepted
terms, missing/expired tax policy, account-identity lookup failure and local
parameter construction) ask SQL to compensate. SQL restores aggregate and SKU
inventory once only for proven `prepared`, pending, provider-unlinked orders
with the exact request identity. Null provider IDs alone never authorize
release. Tax-policy binding still uses the real order identity. No guessed
policy, tax coverage or amount is introduced.

A confirmed abort returns the exact attempt ID and `checkoutRetrySafe=true`.
The account-bound client permits a new attempt only for that acknowledgement
and only on the next explicit buyer action. Unknown/error responses retain the
old attempt. Duplicate aborts require the order still be canceled/failed,
released and provider-unlinked; later payment truth overrides an old marker.
Cleanup is attempted before best-effort failure audit logging, with bounded
waits. Missing/lost cleanup acknowledgement is not permission to replace.

## Future cutover prerequisites (not deployment authorization)

1. Keep money/payout/automation controls OFF. Quiesce new checkout admission
   and **drain old Edge invocations** before schema cutover. An old invocation
   already past allocation can still create a legacy hold/session; migration
   provenance must never reclassify it. Merely revoking the RPC is not proof
   that all already-running old requests finished.
2. Apply the reviewed forward migration under separate explicit authorization.
   The old reservation RPC loses service-role execute; an old Edge instance
   starting afterward fails before allocation. The new Edge against the old
   schema also fails closed: it never falls back to the old RPC.
3. Deploy the matching reviewed Edge source separately; verify the RPC/grant
   and exact-source contract before any separately approved sandbox exercise.
   Old clients remain conservative; the new client can recognize exact aborts.
4. Do not roll back to an old Edge by restoring unsafe reserve grants. A
   rollback/cutover decision requires new reviewed forward source and authority.

Historical orders retain existing webhook/session persistence compatibility.
Exact owned legacy retries remain limited to the existing under-one-hour
window and immutable request/tax binding, without inserting provenance or
granting cleanup. Unclassifiable/expired requests fail closed.

## Remaining limits and evidence

A process crash, unavailable database, revoked actor session, or early retry
preflight failure can leave a `prepared` hold until a later exact authorized
retry/cleanup succeeds. This is not inferred provider ambiguity and is not a
new bulk sweeper. If no authoritative acknowledgement is obtained, clients
must retain the attempt. Historical holds without provenance still require
separate evidence-dependent investigation; this repair does not claim them
resolved. No live/provider transaction has been used to validate this work.

Composed tests run the actual Edge and SQL on the full schema, including new
Edge/old schema cutover, hash-pinned exact `bf682f64` predecessor Edge executing
real allocation/tax-refusal SQL as the negative
control, cancellation/retry, actor/role/RLS, request conflict, rollback, legacy
holds, provider ambiguity and immutable retry parameters. SKU tests check
both inventory levels. Mounted client tests check exact reset versus unknown
outcomes. Six added native PostgreSQL blocking-edge schedules run in the
existing guarded local-clone CI runner; PGlite serialization is not a substitute
for that multi-connection result. Two interop schedules first hold the global
latch, wait until the new RPC is blocked, then enter the retained webhook or
reservation path before releasing the latch, detecting inverted product/buyer
locks rather than merely testing duplicate new RPCs. Exact-head Required Validation must pass
before merge. Docker/native execution is not available in this workspace.

Bank cash-out execution, actual-fee settlement readiness and Google partial
refund tax ingestion remain separate gaps. Reconciliation capacity limits are
documented in `MERCH_RECONCILIATION_DRAIN_LIMITS.md`.
