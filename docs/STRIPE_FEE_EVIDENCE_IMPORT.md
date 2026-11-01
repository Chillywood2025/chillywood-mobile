# Observed-only Stripe fee evidence import

This source adds read/import, private observation persistence, cross-report
component accounting and a bounded-known-cost calculator, **not operational
settlement qualification**. It does not activate a worker, create reports, write
payable ledgers, change accounts, or remove the existing tax-service-fee hold.

## Supported workflow

1. A trusted server/operator obtains an already-completed, single
   Stripe account report of type `all_fees.incurred_at.itemized.2` and the report's
   result file ID. No account setup or report creation is done by this tool.
2. Create a private context JSON with `accountId`, explicit `environment` (`test`
   or `live`),
   `reportRunId`, `fileId`, `reportType`, `intervalStart`, `intervalEnd`,
   `currency: "usd"`, `chargeId`, and `refundIds`. Bind the last two to the
   authenticated stored order chain, not a buyer-supplied body.
3. With an existing appropriately scoped credential supplied through
   `STRIPE_FEE_REPORT_TEST_KEY` or `STRIPE_FEE_REPORT_LIVE_KEY` matching the
   explicit context mode, run on Node 22.18+:

   `node scripts/import-stripe-fee-report-evidence.mjs <context.json> <new-private-output.json>`

The adapter GETs the account, completed report, and exact Stripe-hosted file.
It verifies report mode, identity, unfiltered interval, currency, file identity,
length and origin; redirects are rejected. It bounds the download, validates
CSV, and fingerprints the original bytes with SHA-256. The script creates a new
0600 evidence artifact exclusively; reruns cannot overwrite it. Do not commit
real contexts or evidence. No secret, raw CSV, download URL or unrelated row data
is written to the artifact.

The report requires `fee_transaction_id`, `incurred_by`, `incurred_by_type`,
`amount`, `tax`, `currency`, `product`, `suite`, `feature_name`, and `settled_via`.
An optional `account_id` must agree on every row. Unmatched object rows are
counted, not allocated. Duplicated rows, malformed decimals, unsupported
currency and conflicting object types reject the whole import. Different fee
components may share a fee transaction ID, so that ID alone is not a dedup key.
Overlapping report artifacts must not be blindly summed.

## Dormant database ingestion

The `stripe-fee-report-import` service-only endpoint accepts only contract ID,
report run ID, file ID and interval. It resolves account, mode, currency, charge
and refund IDs from an existing immutable auction cost observation. It requires
the corresponding `STRIPE_FEE_REPORT_<TEST|LIVE>_ACCOUNT_ID` and key to agree,
then authenticates the provider GET and records the normalized observation via
`record_commerce_fee_report_observation`. Physical-merch callers instead provide
`order_id` (never both IDs); `get_merch_fee_report_import_context` binds the
latest current stored cost observation, and
`record_merch_fee_report_observation` rechecks the order under its row lock.
The `sandbox` merchandise environment maps explicitly to Stripe `test`, never
to live. No credentials are configured by this
change and no scheduler invokes it. JWT verification and an exact service bearer
are both retained.

The new table is private, FORCE RLS protected, has no direct API-role grants,
and disallows updates/deletes. A contract lock serializes exact report-run replay;
same report plus changed evidence is a conflict, not an overwrite. Refund and
charge bindings are rechecked inside the transaction against the source record.
The digest does not authenticate the provider: this is an explicitly trusted
service-ingestion boundary, never an endpoint accepting customer CSV proof.

Current auction contracts are test-only. A live report cannot be bound to a test
contract. The provider's v2 supported-report catalog lists fee reports as having
no sandbox report ID; v1 test availability has not been established for this
account. Therefore synthetic tests are **not proof that test-mode fee exports
can be generated**. Actual live reporting support is source-only and requires
separately authorized credentials/provider reads and future matching contract
support before operational ingestion. No live provider request was made here.

## Deliberate remaining holds

- Stripe's report covers most balance-paid fees, not all subsequently invoiced
  services. Missing rows never mean zero; a successful report never proves
  complete fees. Neither 96 elapsed hours nor a report watermark releases money.
- Standalone processing fees can appear after the charge, while the charge's
  balance transaction shows zero fees. Never treat that zero as final costs.
- The itemized-report guide specifies `amount` before fee tax and `tax`
  separately. Summary schemas describe included tax. The bounded-known-cost
  calculator therefore pins the **itemized v2** contract
  `all_fees.incurred_at.itemized.2:amount_excludes_tax_v1`; it never applies
  that arithmetic to summary reports. The archive retains the two raw fields.
- Adjustments/refunds are observations only. Persistence binds the existing
  contract/account/mode and preserves immutable observations. Future accounting
  qualification must reconcile overlapping reports across runs, establish
  supported charge/refund/invoice coverage, and review fee attribution.
- This import has **not** been run against the owner's provider account.
  Physical-merch binding and component accounting are implemented. Actual
  report availability, account coverage, policy/creator acceptance, automated
  report scheduling, operational settlement qualification and live operation
  still require qualification. Source test results are not deployment evidence.
- The current hard-false `commerce_tax_fee_settlement_ready` gate is untouched.
  All imported artifacts retain `financialAuthority: false`,
  `settlementReady: false`, and unverified completeness.

## Component accounting and late adjustments

`commerce_fee_components` and `commerce_fee_component_sources` preserve one
immutable component plus every report that observed it. Account, mode, fee ID,
incurred object, currency, product, suite, feature and pricing tier form its
identity. Overlapping reports never add the same component twice. Changed
amounts, tax, settlement routing or balance identity on the same component
raise a conflict and roll back the import. A genuine new adjustment with a new
provider ID is retained, including negative amounts. A component cannot be
bound to two sales. Existing report rows are backfilled transactionally; any
historical conflict aborts rather than selecting a winner.

The optional `balance_transaction_id` export column is preserved and validated.
It is required for known-cost reconciliation. A report component on the same
balance transaction as an already-observed inline fee must reconcile exactly
to that fee, and is counted once. Components from separately identified balance
transactions are disjoint additions. Unknown attribution, invoiced/mixed or
credit-funded fees remain review states, not guesses about who pays them.

`get_commerce_fee_component_summary` is service-only, shows deduplicated raw
amount/tax groups as integer strings (safe even above JavaScript's integer
range), and never labels a negative component total as extra payable earnings.
An empty archive is unknown, not authoritative zero.

## Proposed bounded-known-cost policy (not activated)

`commerce-known-cost-accounting.ts` implements a pure calculation for
`known_costs_future_unpaid_adjustments_v1`. It uses then-known verified costs,
not an assertion that every future fee is final. After existing return,
fulfillment and remedy holds, a qualified version could allow release while
later real adjustments are applied only to future unpaid earnings. A negative
balance would block new cashout, not authorize a bank debit. No arbitrary
reserve percentage is introduced.

This policy is **not active and not accepted on behalf of creators**. Current
terms do not establish this exact future-offset arrangement. Activation needs
the owner's explicit policy choice, versioned creator acceptance, qualified
account/report coverage and a tested ledger/recovery bridge. The calculator
itself returns `financialAuthority:false`, `finalFees:false`, and
`futureAdjustmentsPossible:true`; neither an imported report nor its arithmetic
can open `commerce_tax_fee_settlement_ready`.

Payout fee reports use the separately typed `PayoutFeeReportContext`, binding
only `payoutId` and `incurred_by_type=payout`. Sale/refund fields cannot coexist
with that context. Cashout execution must separately bind the payout/account
and qualify coverage before using any observed payout fee.

## Deployment and verification

1. Review/apply `commerce_fee_component_accounting` after its existing fee-report
   predecessor. Inspect historical component conflicts before production apply.
2. Deploy `stripe-fee-report-import` and its exact shared closure only after the
   new merchandise RPCs exist. Old contract-only callers remain compatible.
3. Verify FORCE RLS/no direct API grants, two new table triggers, the service-only
   RPC grants, and unchanged money switches and tax settlement gate.
4. Use disposable provider fixtures for the non-authoritative import path;
   production provider qualification is a distinct authorized operation.
5. Roll back the endpoint version if needed. Do not delete immutable evidence or
   rewrite deployed migration history; a schema correction is forward-only.

Additional regression commands:

`node --test tests/creator-money/fee-component-accounting-postgres.test.mjs tests/creator-money/known-cost-accounting.test.mjs tests/creator-money/fee-report-import-edge.test.mjs`

## Evidence sources

Verified October 31, 2026:

- [Fees report and transaction attribution](https://docs.stripe.com/reports/all-fees)
- [Versioned fees report schemas](https://docs.stripe.com/reports/report-types/fees)
- [Standalone fees](https://docs.stripe.com/standalone-fees)
- [Reporting API](https://docs.stripe.com/reports/api)
- [Report run object](https://docs.stripe.com/api/reporting/report_run/object)
- [File object](https://docs.stripe.com/api/files/object)

This adapter consumes the existing v1 report contract. A future new reporting
workflow should evaluate the [Queries and Reports API](https://docs.stripe.com/data/api/reports)
and account-supported catalog rather than silently changing this schema.

Regression command:
`node --test tests/creator-money/stripe-fee-report-evidence.test.mjs`
