# Partial-refund tax evidence

## Objective and boundaries

Replace unknown partial-refund allocations only with exact provider evidence.
The existing payment, settlement, return-window, registration, cashout and
Google-enrollment gates remain independent. This migration activates none of
them and makes no Stripe refund, tax reversal, payout or registration request.

## End-to-end implementation

1. Merchandise and auction cost observers first validate the existing stored
   order → Checkout → PaymentIntent → charge → complete succeeded-refund chain.
2. For a positive-tax partial refund, the GET-only adapter requests the exact
   PaymentIntent's Stripe Tax Association. Every source must be the original
   PaymentIntent or one of the exact observed refunds. Missing, errored, late,
   duplicate and additional associations never become a zero allocation.
3. Retrieve the associated original and reversal Tax Transactions and every
   line item, with bounded pagination. Check mode, currency, original reversal
   link, signed amounts, inclusive/exclusive tax and shipping. Original gross
   and tax must exactly match the completed Checkout. Each reversal gross must
   exactly match its succeeded refund. Use Stripe's integer tax amounts, not
   a percentage calculation or floating-point rounding.
4. Re-read the association and charge before committing the snapshot. SQL
   independently checks exact refund membership, distinct transaction IDs,
   amounts and cumulative bounds. Immutable account/mode/refund evidence is
   committed atomically with the existing cost observation. Same evidence is
   idempotent; conflicting evidence aborts the transaction.
5. Google reporting's existing worker can repair one eligible blocked-tax
   transaction per run using the same provider adapter and stored financial
   context. It reuses existing test-mode Stripe keys and account configuration.
   The claim backs off five minutes and respects the shared 75-second/64-GET
   observation budget. Errors preserve the blocked obligation and do not stop
   unrelated ready reporting work.
6. Only the matching cumulative financial outbox obligation becomes ready.
   No refund obligation is invented by tax evidence. A proven newer cumulative
   refund may cover older blocked-tax obligations, but only after Google's
   canonical receipt proves the exact new pre-tax and tax balances. Ingestion
   itself is not a Google acknowledgement. Active leases, unknown reports and
   other pending operations are not skipped.

## Tests and failure coverage

- Exact provider rounding, multiple partials, unordered associations, duplicate
  sources and IDs, cross-payment/account/currency/mode errors, wrong reversal
  parent, missing tax and fractional/unsafe integer amounts.
- Full line-item pagination, empty continuation, duplicate items, shipping,
  inclusive/exclusive arithmetic, late associations, provider denial/throttle,
  and a charge or association changing during reads.
- Complete production Edge modules and full migration-chain database tests,
  rollback, immutable replay/conflict, client/service privilege separation,
  FORCE RLS, and no money/access authority introduced by reporting.
- Google late tax ingestion, exact cumulative matching, multiple blocked
  partials, idempotent retries, incorrect canonical receipt rejection, and
  earlier-obligation coverage only after actual canonical acknowledgement.

## Deployment and verification order

1. Run exact-head Required Validation, selected database/Edge tests and native
   transaction/concurrency qualification. Review the full migration diff.
2. Apply the forward migration once. Verify exact migration body/history,
   function definitions, private grants, FORCE RLS and all financial switches.
3. Deploy the complete dependency closures for `stripe-merch-cost-reconcile`,
   `stripe-auction-cost-reconcile` and `google-play-external-reporter`.
4. Verify deployed source bytes and read back the configuration. No new worker
   secret is created here. The Google worker remains disabled without its
   existing enrollment/license-test/provider prerequisites.
5. Under separately qualified provider setup, verify an actual eligible
   partial-refund chain and canonical Google response. Monitor blocked-tax
   health and provider lag. Do not present synthetic transport tests as this
   provider qualification.

## Known provider qualification requirements

Stripe documents Tax Associations for the linked Tax Calculation PaymentIntent
integration. It does not establish here that every Checkout automatic-tax sale
exposes such an association. The code only consumes an association actually
returned by Stripe; absence remains unknown. **Checkout-specific availability
is not yet qualified.** Existing Checkout integration is not silently migrated
to another tax integration to bypass this requirement.

Stripe's itemized Tax exports contain refund/original transaction identities
and jurisdiction tax amounts. An authenticated export ingestion fallback must
have a verified acquisition path and completeness binding before it can grant
tax evidence. A raw CSV upload or invented Reporting API endpoint is not that
proof. No such export path is claimed complete by this change.

Google's partial-refund API accepts a pre-tax amount, not arbitrary tax
overrides. If the returned current-tax balance differs from the verified Stripe
allocation, the reporter retains `needs_review`; it must not rewrite either
provider's evidence. Real provider rounding/interoperability must be qualified.

Histories exceeding the shared read/time budget remain incomplete, not silently
truncated. A resumable provider snapshot path is a separate capacity workstream.

## Primary provider references

- [Tax Association lookup](https://docs.stripe.com/api/tax/associations/find)
- [Tax Association semantics](https://docs.stripe.com/tax/payment-intent/simplified)
- [Tax Transaction](https://docs.stripe.com/api/tax/transactions/object)
- [Tax itemized export columns](https://docs.stripe.com/tax/reports#itemized-exports)
- [Google refund contract](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions/refundexternaltransaction)
