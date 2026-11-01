# Known costs, later adjustments, and platform-held earnings

## Approved policy and limits

The owner approved releasing earnings after existing fulfillment/return holds,
using verified costs known then, with later verified fees/refunds recovered only
from future unpaid earnings. The conservative implementation consumes **only
earnings recorded strictly after the adjustment timestamp**. Previously recorded
earnings, even unreserved earnings, are not automatically deducted. Equal
timestamps do not qualify. A remaining negative balance blocks a new cashout.
There is no automatic bank debit or newly invented reserve percentage.

Each creator must explicitly accept the exact current text/hash in their own
current active session. Owner approval does not accept creator terms. Historical
receipts and 90/10 merchandise and 80/20 auction shares are not rewritten.

This source deployment does not activate payments or create qualifications.
It supports production facts, but money switches, exact provider/account/mode
qualifications, accepted terms, tax binding, and current domain holds all remain
independent admission requirements. Synthetic tests are not those qualifications.

## Evidence and arithmetic

1. Authenticated provider GET observers bind the stored checkout, payment intent,
   charge, balance, refunds, currency, account and mode. Exact partial-tax reversal
   evidence is retained, not estimated proportionally. Successful repeated GETs
   receive immutable verification-read receipts while identical facts deduplicate.
2. The report importer accepts authenticated `all_fees.incurred_at.itemized.2`
   observations only. Independent account-specific semantic qualification must
   verify that itemized amount excludes fee tax and balance attribution is valid.
   This is not established by importing a CSV or waiting 96 hours.
3. Account/mode/component identities deduplicate overlapping and out-of-order
   reports. Conflicting same-identity amount/tax/settlement/balance facts roll back.
   Genuine negative adjustments need distinct provider identities. One component
   belongs to one sale; this product uses one checkout/charge per sale.
4. Inline charge/refund balance fees are counted once. Report components on the
   same balance must exactly reconcile; distinct balance costs are added. Invoice,
   mixed/credit funding, unknown balance attribution, unsupported currency and
   total over-credit require review, not guessed zero or fabricated earnings.
   Auction store obligations must independently be known; Stripe checkout alone
   is not proof of zero store fees.
5. A verified explicit zero inline fee is known zero for that balance. An empty
   authenticated report is not proof of final zero fees. Snapshots explicitly say
   `finalFees:false` and `futureAdjustmentsPossible:true` under the accepted policy.
6. `net = gross - sales tax - refunds + exact tax reversal - verified known fees`.
   Platform share floors in minor units; creator receives the remainder. Negative
   net never creates negative payout. Initial negative net is review-only.

Every snapshot binds acceptance, source observation, account/mode qualification
and a manifest of **all** stored reports. A new report/refund invalidates old fee
readiness until reconciliation. Original held allocations remain immutable;
successors reference snapshots. Other fulfillment, return and dispute holds remain.

Semantic and platform-held funding qualifications also support append-only
revocation before expiry. Semantic revocation closes fee readiness immediately;
funding revocation/expiry closes existing earning eligibility. Fresh independently
verified funding evidence can restore eligibility only for the exact same
creator/platform/recipient/mode/currency, never by redirecting an old earning.

## Earnings and adjustments

`release_commerce_known_earnings(feature, source)` derives all amounts in SQL.
It accepts no caller fee or payout amount. Initial positive release requires:

- Live source and all required money switches ON (deployment leaves them OFF).
- Exact current accepted policy, fee semantics and source/report snapshot.
- Existing tax checkout binding still valid for that product/account/mode.
- Merchandise canonical purchase/delivery window and no unresolved return or
  dispute; auctions current provider-recorded fulfillment/replay/maturity proof.
- Fresh authenticated provider read, available balances and no unresolved dispute.
- Independent platform-held/no-automatic-transfer funding qualification with the
  exact creator and recipient account.

The bridge writes canonical provider-derived accounting, money ledger and creator
earnings rows; it does not call Stripe or send funds. Any existing auction direct
transfer operation blocks the generic earnings lane. A trigger blocks the reverse
transition too, serialized by the contract row. Thus one sale cannot fund both.

Later downward entitlement changes produce one immutable source/snapshot-bound
debt. This continues while new positive releases are disabled. Upward corrections
produce a distinct credit earning, rather than a negative debt that could disappear
after earlier recovery. Qualified cashout fee credits use the private
`record_creator_verified_fee_credit` materializer; only the cashout component
issuer can derive its amount. API roles cannot call that materializer.

Offsets append immutable consumption records against post-adjustment earnings,
subtract already reserved/processing/paid allocations, and use the shared
`creator-payout:<creator>` advisory lock. Canonical withdrawable calculations
subtract consumed offsets. Payout admission also requires current acceptance,
no remaining recovery balance, sufficient allocations, and exact originating
platform/recipient account. No source balance is changed in place.

Prospective bridge and fee-credit earnings explicitly use the recording clock
after creator serialization, not PostgreSQL transaction-start `now()`. Thus a
later credit in the same transaction can cover an earlier adjustment; historical
timestamps remain unchanged. Merchandise fulfillment actions append exact
creator/session/revision receipts. Status alone or a stale/mismatched receipt
does not qualify a source, and a later blocked status closes withdrawability.

Withdrawability also rechecks current return/case/dispute/tax clearance, fresh
provider-read receipts, and auction negative holds/current fulfillment maturity
using read-only predicates. Final cashout dispatch locks all allocated commerce
domains/qualifications **before** the creator lock, then revalidates. Context-only
creation and stable balance reads do not acquire reversed domain locks.

## Automatic processing and owner visibility

Cost observations, verified-read receipts and report observations enqueue one
source job. Existing cost-observer/report-import completion paths attempt only
that source, with `p_limit=1`, at most three additional seconds, and no recursive
drain. Merchandise uses its existing aggregate observer deadline. RPC abort/deadline
does not pretend the database transaction rolled back: the durable queue and
source-bound idempotency support later inspection/retry.

`process_commerce_fee_accounting_jobs(limit, source_id)` is service-only, maximum
ten jobs, short lock timeout, bounded loop. It writes explicit pending/blocked/
retry/completed status. It is independently callable for recovery; **no new cron
or recurring schedule is created**. New evidence resets the source to pending.
Unchanged blocked jobs can be retried after the recorded retry time.

Owner Commerce Setup displays queue counts and stable reasons through
`get_owner_commerce_fee_accounting_health`, protected by exact session + Owner
membership. Creator Payouts displays acceptance and debt/credit history. Creator
merch order details distinguish known costs from final fees and stale evidence.

## Deployment order and exact postconditions

Parent integrates/reviews the full bundle; this worker never deploys it.

1. Apply component accounting `20261101141625`; cashout foundation
   `20261101141656`; refund evidence `20261101141708`; accepted policy
   `20261101143450`; snapshots `20261101144600`; provider modes
   `20261101144801`; payable/offset bridge `20261101145500`; live return contract
   `20261101150901`; auction fee freshness `20261101151130`; policy visibility
   `20261101151300`; provider-mode entry successors; merch fee mode
   `20261101151945`; accounting queue `20261101152800`; qualification revocation
   `20261101154530`; fulfillment guard `20261101155330`; canonical fulfillment
   receipts `20261101155800`; current cashout domain guard `20261101160200` in timestamp order.
   Apply cashout late-adjustment successor after its declared dependencies.
2. Verify exact-head Required Validation including canonical native PostgreSQL
   runner `scripts/test-commerce-fee-concurrency-postgres.mjs`. PGlite tests are
   functional SQL evidence, not proof of concurrent PostgreSQL lock schedules.
3. Deploy `stripe-fee-report-import`, `stripe-merch-cost-reconcile`, and
   `stripe-auction-cost-reconcile` with their exact shared dependency closures.
   Keep existing service-only authentication and provider mode separation.
4. Read back FORCE RLS and revoked direct API table privileges (including
   TRUNCATE); immutable evidence triggers; role grants; no public access to old
   renamed internal functions; fee dispatch admission guard present in
   `pg_get_functiondef(private.assert_cashout_dispatch_admission(...))`.
5. Read back all money/automation switches unchanged OFF; no qualification or
   creator acceptance seeded; no new cron; no real transfers/payouts/charges.
   Check owner queue health and any historical component conflicts explicitly.
6. Existing stale/unknown sources must still report blocked. Do not use a real
   positive release as a smoke test. Synthetic full-schema tests cover release,
   late fee, credit, partial refund, mode, stale sources and API-role denials.

Rollback is forward-only for schema/evidence. Disable positive execution and
restore the prior Edge version if needed; do not delete evidence, offsets or
terms acceptances. Preserve negative-adjustment recording and inspect ambiguous
queue outcomes before retrying. Provider qualification/registration/creator
acceptance remain required operational inputs, not implementation placeholders.
