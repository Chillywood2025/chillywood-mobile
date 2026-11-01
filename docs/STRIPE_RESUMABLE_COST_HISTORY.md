# Bounded, resumable Stripe cost history

## What changes

Merch and auction cost workers no longer restart a long refund/tax history at
the first64 provider reads. They retain a private checkpoint attributed to exact
domain, source UUID, canonical checkout/PaymentIntent/charge context, account,
environment, generation and lease. No request body can supply checkpoint facts.

The existing strict cost/tax observers remain intact. Their deterministic GET
sequence runs through an allowlisted projection layer, excluding addresses,
payment methods, descriptions, raw bodies and credentials. Previously collected
responses let the next invocation reach the unfinished cursor without consuming
the same provider-read budget again.

This is **not an immutable financial cache assumption**:

1. Collect every response required by the existing observer, with its original
   complete-refund-set and tax-association checks.
2. Replay the entire observer through a separate fresh verification pass. Every
   response must match the collected normalized evidence. Path/order/value
   changes reset the generation's checkpoint, never merge incompatible results.
3. In the completing invocation, freshly reread mutable account, checkout,
   PaymentIntent, charge, refund-list pages and tax-association boundaries.
4. Atomically recheck the canonical database context and lease, then invoke the
   existing outer cost recorder, including fee evidence and tax wrappers. Partial
   history never becomes a cost observation, earnings row or payout authority.
5. Retain an append-only completion receipt with source/account/mode, history
   digest, entry count, verification interval and exact recorder result.

Each invocation remains at most64 GETs. Provider work uses a65-second aggregate
budget, reserving up to5 seconds for a durable checkpoint save. Body reads are
bounded independently of cooperative fetch cancellation. Small histories can
collect and verify in the same invocation; large ones return `history_pending`.

## Fairness and freshness

The existing oldest-due queues, three-worker auction batch and merch three-worker/30-order envelope remain unchanged.
Verified partial checkpoint progress receives a15-minute continuation, not
exponential poison backoff. It does not update `last_success_at`. Repeating an
unchanged checkpoint is not progress and uses the existing failure path.

The verification pass must complete within six hours. The existing observer
20-page limits remain; checkpoints additionally cap10,000 normalized responses
and8MiB in memory/10MiB in SQL. These are explicit capacity/freshness failures,
not completion or zero-cost evidence. Extremely large or continuously changing
histories can remain held and require reviewed capacity changes. Completion records the oldest independently verified response time, not completion time, as its freshness. Existing15-minute financial eligibility holds remain unchanged; an old completed history is reporting evidence only. No partial
receipt relaxes settlement freshness, unknown tax, fee-report or dispute holds.

An absent tax association is checkpointed as an explicit404 and remains unknown.
It must still be404 during verification/final reread; a newly committed tax
association invalidates the old observation and starts fresh.

## Deployment and rollback

Apply migrations `20261101154608_stripe_cost_history_checkpoints.sql` and
`20261101163012_stripe_history_conservative_freshness.sql`, then deploy
the matching `stripe-merch-cost-reconcile`, `stripe-auction-cost-reconcile` and
`merch-reconciliation-driver` and `auction-observation-driver` sources. Existing account/mode-qualified read-only
credentials and explicit production contracts remain required. No new secret,
provider write, scheduler activation or financial gate is introduced.

Rollback the workers/driver to their matched prior source while preserving the
forward-only schema and completion receipts. Partial checkpoints are not payable
evidence and can remain dormant. Do not delete financial observations or alter
deployed migration history.

## Local evidence

Actual production observer and worker tests resume histories beyond64 reads,
preserve the per-invocation cap, run the verification pass and detect changed
history/frontier. Full-schema tests cover source/account/lease attribution,
duplicate completion, no partial observation, preserved fee/tax holds, client
grant denial and fixed-delay continuation without false success. Provider
transport is synthetic; these tests are not live Stripe or native concurrent
transaction qualification.

## Expanded refund evidence

Production observers request `expand[]=data.balance_transaction` on each refund
page and validate every expanded object using the same exact refund/source,
currency, amount, fee/net and status checks. Missing/unexpanded evidence is held,
not silently trusted. Final page rereads include these balance facts, and the
sale balance is also a final boundary. Up to2,000 refunds take20 page reads, not
2,000 individual balance reads. A complete verification-plus-boundary pass is
reserved for the next invocation when the current budget cannot fit it.

This relies on documented expansion, not immutability:
https://docs.stripe.com/expand and https://docs.stripe.com/api/refunds/object.
Tax transaction/line-item histories remain separately verified; no immutability
or unsupported expansion is assumed. Oversized tax histories retain their
conservative observation age and financial freshness hold.

### Supported completion versus fresh-money eligibility

The2,000-refund test qualifies expanded **balance-history completion**, not all
possible tax histories. A fully populated association with a separate tax
transaction and line-item list for every refund can still require thousands of
GETs. No tax-object immutability is assumed. Histories that cannot finish a
verification pass within six hours remain held and need reviewed capacity or
provider-report evidence; they are not advertised as completed. Histories that
do complete with oldest verified evidence older than15 minutes return
`history_facts_stale_collect_fresh_provider_evidence_before_release`, preserve
that old time in the immutable receipt and owner refresh status, and cannot
satisfy existing financial freshness. Fresh-money eligibility requires the
complete verification and final-boundary work to fit its real GET/time envelope,
plus all existing tax/fee/dispute/qualification gates. No scheduler frequency,
paid provider or financial threshold was changed.
