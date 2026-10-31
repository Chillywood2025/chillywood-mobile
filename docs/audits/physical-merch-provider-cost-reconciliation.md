# Physical merch provider costs — source slice

Owner policy: newly accepted physical-merch orders preserve **90% creator / 10%
Chi'llywood of NET**, not gross. Historical orders are not repriced. This slice
does not change digital 80/20, no app tip fee, or the optional instant cash-out fee.

## Implemented

- `stripe-merch-cost-reconcile` keeps gateway JWT verification and additionally
  requires the exact existing service credential. Its request accepts only an
  order ID. It reads the stored order through a service-only RPC. Clients cannot
  submit provider fees, tax evidence, a provider account or a transport URL.
- Server configuration must bind `STRIPE_MERCH_RECONCILIATION_ACCOUNT_ID` to the
  intended platform account. Nothing configures this variable in this change.
  The existing test-mode Stripe key is required; production is not accepted.
- The production GET adapter retrieves `/account`, the exact stored Checkout,
  PaymentIntent, Charge, Charge BalanceTransaction, every succeeded Refund and
  its BalanceTransaction. It checks account/order/buyer/mode/currency/amount and
  object/source identities, captured amounts, fee/net arithmetic and pagination.
  A final Charge read rejects a changed refund/dispute snapshot. Redirects are
  forbidden and each request has a timeout. Missing fees are never zero.
- Explicit complete automatic-tax evidence is required for known collected
  tax. Disabled or incomplete tax calculation remains unknown. Partial refunds
  have unknown tax reversal until that separate evidence path exists. Full
  refund cash movements include actual refund balance fees; the full collected
  tax is returned. Refunds and disputes are not subtracted twice.
- Forward migration `20261030191106` stores append-only private cost observations
  and idempotent held 90/10 allocations/deltas. Platform rounding floors cents;
  creator gets the remainder. A refund reverses the prior held allocation;
  negative net becomes a held recovery obligation, not a negative cash-out.
  Stale/out-of-order observations cannot resurrect prior refund/dispute amounts.
- Existing purchases projections distinguish cost-observed-but-held from unknown
  costs. A newer refund callback invalidates the older displayed estimate until
  reconciliation catches up. No private provider payload/PII is projected.

## Not a payable earnings bridge

Every observation/allocation remains `financialAuthority: false`. There are no
new writes to `creator_earnings_ledger`, transfers, payouts or feature switches.
Actual BalanceTransaction amounts are **observed cash basis**, not proof that
all liabilities/adjustments have cleared.

Existing merch doctrine requires fulfillment and the return/refund window to
clear. Its duration/start anchor and independent clearance evidence are not
defined. Existing generic settlement policies only enumerate digital/tip/event
sources, and the provider closeout finalizer binds RevenueCat transactions.
Creator-marked `delivered` does not prove a fulfillment/return window is clear.

Remaining **code** integration after policy is approved: independent delivery /
return-window clearance evidence; partial-refund tax reversals and dispute /
adjustment lifecycle; qualified merch mapping into immutable money events,
creator earnings lifecycle, reserve/recovery and payout allocations; durable
webhook-triggered retry scheduling for this reconciliation endpoint. The current
endpoint is explicitly service-invoked and no scheduler is installed.

Remaining **external** proof: provider account/fee/tax qualification, real sandbox
deliveries, independent fulfillment evidence, exact-head CI/native concurrency,
and physical-device verification. No provider account calls, keys, deployments,
financial activation, Mac access or Codex tasks were performed for this slice.

## Tests and limits

`merch-cost-observation-edge.test.mjs` uses an explicitly synthetic HTTP transport
while exercising the actual production adapter. The full-chain PGlite test
passes those actual adapter facts into the actual SQL function, verifies RLS and
grants, immutable terms/evidence, transaction rollback, idempotency, stale reads,
refund reversals and no creator earnings. This is not live provider verification
or native multi-backend PostgreSQL concurrency proof. CI must compile the actual
Edge endpoint with Deno and run the canonical database suite.
