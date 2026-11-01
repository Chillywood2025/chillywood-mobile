# Commerce provider-mode contracts

This source adds dormant production-compatible **observation and qualification**
contracts. It does not activate live checkout, accept registrations or legal
terms, provision credentials, issue transactions, or certify provider readiness.

## Canonical identity

| Domain | Stored test mode | Stored live mode | Provider mode |
| --- | --- | --- | --- |
| Physical merchandise | `sandbox` | `production` | `test` / `live` |
| Auction contract | `test` | `live` | unchanged |

`private.commerce_provider_mode` normalizes only these explicit values; unknown
values return NULL. Qualifications and immutable checkout bindings preserve the
domain's raw value. Fee import context returns the normalized provider value.
Existing accepted orders, accounting, evidence, qualifications, and switches
are not rewritten.

## Completed source boundaries

- Tax qualification and checkout binding support the proper mode per feature.
  Missing, expired, revoked, wrong-account, wrong-product, incomplete scope,
  or missing registration/provider proof still blocks the binding.
- Live merchandise observation requires an immutable tax checkout account
  binding. Server context, credential prefix, account GET, Checkout metadata,
  Checkout/PaymentIntent/Charge livemode, and all stored payment IDs must agree.
- Auction contract/qualification inserts must match their capability mode;
  contracts additionally match quote and purchase intent mode. Qualification
  selection is mode-scoped rather than allowing a newer test row to qualify live.
- Cost and dispute observers use GET only. Observed live amounts are held with
  `live_commerce_release_unqualified`, not incorrectly labeled sandbox money.
  They never mint payable balances or dispatch transfers.
- Refund tax evidence normalizes production to live while retaining exact
  account/refund/transaction identity. Unknown tax is not estimated.
- Purchase-time lookup joins canonical succeeded event identity, mode, body
  hash, and processed status. No historical purchase timestamp is fabricated.
- Prospective production orders freeze the existing return-case protocol and
  can submit support cases through the same buyer/session checks. Production
  return evidence additionally requires canonical purchase proof and the exact
  immutable tax account binding. Original 30-day timing rules do not change.
- Auction domain release evidence/maturity use exact contract mode and current
  same-mode recipient qualification. Live evidence is explicitly labeled
  `qualified_live_evidence_only`, not execution authority.
- Existing test transfer operations reject live contracts. Production funding
  must use the separately qualified payable/cashout path, with duplicate funding
  prevention; widening an evidence table does not widen a transfer adapter.

## Optional read-only configuration

The worker derives mode from server-owned context, never request parameters.
Existing test configuration remains unchanged. The following optional names are
read only for live contexts; this change creates or configures none of them:

- `STRIPE_MERCH_LIVE_OBSERVATION_KEY`
- `STRIPE_MERCH_LIVE_OBSERVATION_ACCOUNT_ID`
- `STRIPE_AUCTION_LIVE_OBSERVATION_KEY`
- `STRIPE_AUCTION_LIVE_OBSERVATION_ACCOUNT_ID`

Use restricted read credentials with only the required provider resources when
separately authorized. Missing/wrong-mode credentials or account mismatch fail
closed. No fallback borrows a test credential for live or vice versa.

## Separate outstanding entry-point work

This checkpoint **is not an end-to-end live-commerce completion claim**. Existing
merchandise checkout/inventory and webhook initiation/reconciliation wrappers,
auction platform checkout/product/entitlement entry points, and Google external
reporting have additional test-only guards. Those must be completed and tested
with their own live authority contracts before enabling money. Tracking mode
support and fee settlement are parallel changes and must be integration-tested
at the combined exact head. Provider/legal qualifications remain external facts,
not values software may invent.

## Validation

Focused tests run actual shared TypeScript observers against synthetic provider
transport and actual full-schema SQL against PGlite. They cover live-mode
positive observation, cross-mode/account rejection, immutable tax binding,
rollback, held/nonfinancial accounting, normalized fee context, and client role
denial. Existing event release, platform auction and automatic test transfer
regressions remain required. Native pgTAP/concurrency and protected exact-head
Required Validation are still required before merge/deployment; local PGlite
does not substitute for those checks.
