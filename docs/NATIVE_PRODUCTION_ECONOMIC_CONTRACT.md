# Native production economics: held observation and ledger contract

## Status and limits

This source adds a reachable, immutable production paid-video observation and
held-accounting lane plus an executable economic coverage contract. It is **not
production purchase admission, a creator earnings release, or live readiness**.
All dispatch, access, settlement, financial-authority and payable outputs remain
false. No setting, qualification, creator acceptance, provider configuration or
credential is created. No production/sandbox record is adopted into another lane.

The source/admission/report successor is described in
[Native production admission and reports](NATIVE_PRODUCTION_ADMISSION_REPORTS.md).
It adds prospective row revisions, a held-only preparation return, durable typed
actual-report contracts and a defensive cashout-domain boundary. Its actual
provider adapters and linked earnings materializer are still unfinished. A
permanent hard-false guard is an intermediate safety measure, not a substitute
for the requested implemented-but-OFF production path.

The first economic contract supports an explicitly single-quantity, one-time USD
paid video. Other currencies, subscription renewals, estimates, aggregate-only
reports and signed fee corrections are not silently coerced into that contract.
They need their own reviewed semantics. Existing subscription processing remains
unchanged. The existing sandbox implementation is deliberate and remains intact.

## Exact normal-flow integration

1. `supabase/functions/revenuecat-webhook/index.ts` authenticates the existing
   shared webhook, reserves its immutable event/raw-hash identity, and runs the
   canonical purchase or terminal handler. Its existing
   `recordNativeProductionIngress` calls
   `public.record_native_production_ingress_observation` **after** those effects.
   No new provider webhook or credentials are needed. Premium and sandbox do not
   enter this call; failed observation retries cannot roll back a committed refund.
2. Forward migration `20261110225744_native_production_paid_video_held_observations.sql`
   preserves the old RPC as a revoked internal implementation. The new wrapper
   reuses its strict service-only input validation, event advisory lock, reserved
   raw hash and exact canonical receipt/provider/environment/event/user/original
   transaction checks. Channel-subscription behavior and responses are unchanged.
3. Only canonical `paid_content_access` receipts enter the successor. The reported
   full product must also match canonical metadata for nonterminal observations.
   Terminal dispatch can legitimately bind the historical product despite a stale
   or omitted reported product; both are retained without blocking its hold.
   The normal handler already
   persists ignored paid-video receipts when a production intent is missing:
   those become durable economic review obligations, not successful purchases.
4. Private FORCE-RLS observations bind the exact canonical receipt, event/hash,
   provider, configured project, reported app/product, buyer and separate original
   and transaction identities. Project comes from server context, never payload
   metadata. Missing identifiers remain unknown. The newest matching ingress
   qualification wins even if revoked/expired; exact retries retain the **first**
   configuration and qualification without retroactive upgrading.
5. A private append-only `native_production_paid_video_ledger_holds` row is written
   atomically with each observation. It is **not** a row in
   `creator_earnings_ledger`, `money_access_ledger_events`, or a payout allocation.
   A quote reference is retained only if canonical metadata identifies an exact
   production intent and immutable quote with the same buyer, creator/source,
   product, provider, price, currency, environment and quote interval. There is no
   newest-intent, price-only, current-video or sandbox lookup fallback.
6. Reported canonical amount/currency are labeled reported, since the legacy
   parser may already have normalized the number. Actual gross, quantity, store
   fees, fee tax, sales tax and developer proceeds remain **NULL**, not zero.
   The SQL constraints prevent this lane from storing an actual amount or becoming
   payable. Existing global switches and the native-production intent prohibition
   remain unchanged.
7. `get_native_production_paid_video_hold(canonical_receipt_id)` is service-only,
   bounded to a known receipt and indexed historical original chain. It returns
   no provider account/transaction IDs. Current ingress qualification and negative
   evidence are rechecked. A refund arriving before its purchase or a changed
   project/app configuration cannot clear a matching historical negative hold.
   Missing identity is reported as incomplete, never safe.

An actual refund-before-purchase has no canonical paid product: the existing
terminal dispatcher persists it with `domain: missing` and a row in
`revenuecat_unbound_terminal_authority`. It is not relabeled as paid video. The
new hold writer/reader also consume that existing indexed production
provider/original/buyer tombstone. The full-schema test exercises the actual
terminal dispatcher before the later paid-video observation.

No new Edge closure is required for the SQL wrapper: the existing normal handler
already calls the unchanged RPC signature. Source merge is not deployment.

## Executable future economic adapter contract

`supabase/functions/_shared/native-production-economics-v1.ts` is a pure,
runtime-validated contract for the **next** persistence/report/earnings adapter.
Its journal is an immutable in-memory value, not a durable database journal.
Its diagnostic projection is not yet invoked by the normal webhook: the
persisted held lane above truthfully lacks its mandatory admission and reports.

- Exact production scope includes provider, project, app, independently verified
  store account, full product and currency. Admission binds buyer, creator/source,
  revision, immutable byte incarnation and digest, accepted quote/terms hashes,
  price, quantity, quote/admission time and accepted share basis points. It cannot
  consume sandbox record protocols or infer an absent source incarnation.
- Every observation binds that exact transaction and original chain. Strict
  runtime schemas reject extra fields, unsupported modes, ambiguous types,
  non-integer money, unsafe integers and implicit conversions. Integer minor-unit
  strings use bigint arithmetic with bounded bigint inputs and aggregate totals.
- Event identity deduplicates exact retries and rejects changed facts. Stable
  provider component IDs deduplicate overlapping reports. Changed component
  amounts/categories/attribution/qualification hold the projection. Out-of-order
  arrival is not an excuse to count a component twice or select an older report.
- Actual transaction-attributed store fees, fee tax, sales tax and developer
  proceeds each require explicit components. Empty/missing/null is unknown; an
  explicit provider-observed zero is different. A complete coverage manifest must
  include **all** recorded components. New components invalidate stale coverage.
- The newest exact independent scope/report semantic qualification must have been
  valid at admission and observation and still be current. Revoked/expired newer
  qualifications cannot fall back to an older one. A typed object is not proof of
  authentication; the future adapter must load independently verified private
  records, not accept these objects from an HTTP client.
- `gross = sales tax + store fees + fee tax + developer proceeds` must reconcile
  exactly in the same currency. Only then can a **diagnostic** creator/platform
  split be calculated from the immutable accepted share. Neither a RevenueCat
  percentage nor the quote is actual store-fee/tax evidence.
- Refund, revocation and chargeback evidence holds the whole original sale,
  including refund-before-purchase and later/reordered positive receipts. This
  first contract never clears a negative hold, estimates a partial-tax reversal,
  performs a debit or silently represents refund recovery as complete.
- Even exact complete synthetic evidence returns `status: HELD`,
  `production_ledger_adapter_unqualified` and all authority flags false. No setting
  can enable it. The module has no network, storage or provider side effects.

## Remaining source and real-provider prerequisites

These are explicit unfinished integration work, not missing activation flags:

1. **Prospective production asset/source admission.** The normal
   `creator_money_purchase_quotes` table captures source UUID, creator, terms and
   price, but its capture function does not retain the video's immutable
   byte-incarnation snapshot. The exact asset generation used by the currently
   implemented native paid-video route belongs to `sandbox_commerce_v1`. It must
   never be copied/promoted into production authority. A separately reviewed
   production source version/admission issuer must bind current scan/publication,
   asset bytes/generation, creator ownership, buyer/session, quote and accepted
   terms under the existing ordinary-commerce locks. The successor implements
   the held preparation and prospective row identity, but deliberately exposes no
   origin-generation/clean-byte proof issuer until its storage adapter is qualified.
2. **Actual provider-report interoperability.** Obtain an authenticated Apple and
   Google report sample/schema for the exact existing project/app/store account:
   stable transaction and original-chain identifiers, report revision/completeness,
   currency/minor unit, actual quantity/gross, fee versus fee-tax semantics,
   sales tax, developer proceeds, settlement status and precise refunds/reversals.
   Apple aggregate proceeds cannot be allocated per creator by assuming a rate.
   Google order or report facts must prove complete per-transaction attribution.
   Fixtures do not establish either provider's real coverage or semantics.
3. **Actual component/coverage reader.** The successor persists and validates the
   normalized component/coverage contract. Its missing provider adapter must authenticate the existing
   report transport, retain exact raw evidence hashes, persist independently
   qualified scope/semantics and revocations, and atomically append the typed
   component journal with conflict quarantine, complete-manifest revisions and
   bounded resumption. This change deliberately exposes no generic qualification
   issuer, no report-upload API and no caller-supplied actual-money RPC.
4. **Separately qualified earnings/recovery adapter.** It must consume the exact
   admitted production source and immutable economic snapshot, append canonical
   money and creator-ledger records once, and integrate the current cashout-domain
   guard/negative recovery policy. Reuse existing future-only debt/credit,
   reservations and creator locks where applicable. Do not call
   `release_commerce_known_earnings` with native rows: its current source domain is
   merchandise/auctions, not native creator sales. Real refunds require exact
   tax/proceeds reversal evidence and cannot be inferred from this hold marker.
5. Only after those source adapters, exact-head review/checks and actual provider
   qualification can a later reviewed production intent/dispatch branch be
   considered. Production remains prohibited by
   `money_purchase_intents_sandbox_only_check`; this source does not change it.

## Validation and rollback

Focused kernel tests cover wrong scope/buyer/creator/product/source/incarnation,
quote and quantity, sandbox promotion, immutable retry/conflicts, overlaps and
out-of-order reports, refund-before-purchase, all missing economics, explicit zero,
stale/revoked qualification, conflicting coverage, exact arithmetic and bounds.
The full-schema PostgreSQL fixture covers the actual migration chain, normal RPC,
first observation preservation, historical negative holds, no retroactive
qualification, channel regression, FORCE RLS, API ACLs including TRUNCATE, no new
earnings and unchanged switches/production-intent constraint. The pgTAP file adds
schema/ACL/empty-seed assertions. Fixture success is not a provider/device proof.

Run the protected source planner and selected checks against the exact candidate.
Full-schema functional testing is not native lock-contention proof; qualify
concurrent duplicate commit/rollback and observation/hold atomicity on disposable
PostgreSQL before merge. The observation uses the existing event advisory lock;
there is no new positive financial lock domain to activate.

Future authorized installation must keep all money/provider/automation switches
unchanged. Rollback is forward-only: restore the prior public RPC behavior in a
new migration while retaining private observations/holds. Never delete evidence,
rewrite historical migrations, promote sandbox rows or retry a store charge to
test this observer. An observation failure requests normal webhook replay only.
