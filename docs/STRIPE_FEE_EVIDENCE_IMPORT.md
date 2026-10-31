# Observed-only Stripe fee evidence import

This source adds read/import and private observation persistence, **not
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
`record_commerce_fee_report_observation`. No credentials are configured by this
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
- Published guide/schema descriptions differ on whether `amount` includes fee
  tax. This importer keeps `amountMinor` and `taxMinor` separate and leaves the
  aggregate null until version/account semantics are independently qualified.
- Adjustments/refunds are observations only. Persistence binds the existing
  contract/account/mode and preserves immutable observations. Future accounting
  qualification must reconcile overlapping reports across runs, establish
  supported charge/refund/invoice coverage, and review fee attribution.
- This import has **not** been run against the owner's provider account.
  Automated report scheduling, accounting qualification, physical-merch binding
  and live operation remain unfinished. Observation persistence is source-only,
  tested against a disposable full-schema database, and not deployed.
- The current hard-false `commerce_tax_fee_settlement_ready` gate is untouched.
  All imported artifacts retain `financialAuthority: false`,
  `settlementReady: false`, and unverified completeness.

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
