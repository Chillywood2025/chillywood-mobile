# Creator cashout execution readiness

## Dormant executable lane (2026-11-01)

The sections below dated October 31 describe the previous source baseline,
not the new implementation. Source now includes qualified preview/request,
durable funding and bank-payout dispatch, GET-only unknown-outcome recovery,
signed webhook wakeups, bounded work leases, authenticated payout-fee report
ingest, and bank-return/transfer-reversal accounting. This is **not operational
qualification or permission to turn on money**. No qualifications, credentials,
webhook configuration, schedules, provider changes or transactions are seeded.

### Exact economics and single collection

The prior proposed atomic Platform Pricing Tool route is not selected: its
payout-amount fee basis is not the accepted gross-request basis, and payout
creation has no arbitrary `application_fee_amount` parameter. Instead, the
platform retains the accepted app fee once before funding the connected
balance. An explicitly verified zero additional application fee configuration
is mandatory; an observed payout application fee causes review, not a second
deduction. Existing accepted historical rates are never rewritten.

For gross G, immutable accepted app fee A and qualified provider pricing P,
the server solves integer cents `B + P(B) + A = G`. Standard A is zero; new
instant A is ceil(2% × G). P must be platform-paid and its basis explicitly
qualified. If no exact cent solution exists, the request is rejected rather
than repriced. B is funded once and paid to the exact qualified external bank
account/card. Provider costs in this preview are quotes, never actual charges.

### State and recovery

* Reservation and exact-session/eligibility/legal/account checks precede work.
  The creator lock serializes reservations, dispatch, cancellation and receipts.
* A stage becomes unknown durably **before** its POST. Only one worker can claim
  that stage. Timeouts, malformed replies and HTTP errors retain that unknown
  state. Subsequent runs only GET the bound provider objects/lists; no empty
  search or expired provider idempotency key authorizes another POST.
* A funding transfer is never bank-paid evidence. A paid payout still holds
  accounting until authenticated fee components and separately qualified
  account coverage establish actual cost. Empty reports do not prove
  zero cost. Duplicate components cannot double-charge; changed components
  conflict. Unqualified/negative/overflow costs require review.
* Failed/canceled payouts require the exact available positive bank-return
  balance transaction before reversing the funding transfer. Only confirmed
  return of that transfer plus actual fee accounting releases reservations.
  The app fee is returned; retained actual provider costs remain consumed.
  A late failure after paid is supported without undoing refunds, disputes,
  quarantines or a reversed source earning.
* The companion known-cost policy migration preserves the confirmed bank
  amount and accepted app fee when verified provider costs differ. Positive
  deltas become immutable debt against future unpaid earnings only; verified
  credits create source-bound earnings, offset remaining debt, and leave any
  excess withdrawable. No bank debit is authorized. Cumulative component hashes
  make retries idempotent. Bank-return release subtracts already-accounted
  deltas so the same cost/credit is not applied twice. No creator acceptance is
  seeded. Unrelated provider review holds are never cleared by a fee import.
* A prepared request can be canceled by its current creator before dispatch;
  dispatched/unknown requests cannot be canceled or blindly retried. Returned,
  canceled and review-blocked work are not automatically dispatched again.

### Deployment and activation boundaries

1. Merge the cashout and fee-policy/account-binding companion migrations in
   timestamp order; run exact-head full schema, runtime, mounted UI and native
   concurrency validation. Deploy functions with execution flag absent/false.
2. Keep `live_money_enabled`, `payouts_enabled`, `stripe_connect_enabled`, and
   `cashout_enabled` OFF. The execution environment flag cannot override SQL.
3. Before any activation, separately verify actual live platform/connected
   account, US/USD destination eligibility, manual schedule/exclusive writer,
   account fee/loss responsibilities, gross-basis collection, no extra app fee,
   funding provenance, exact pricing, fee schema semantics AND coverage.
   Read-only provider inspection now confirms a live platform account, but no
   live connected creator accounts were returned. Creator responsibilities,
   manual schedules, destinations, net availability, pricing and report coverage
   remain unverified. Qualifications expire and are revocable. Fresh matching
   account/method coverage can support late fee evidence without renewing old
   dispatch authority or changing the accepted bank amount.
4. Any credential provisioning, webhook registration, schedule configuration,
   legal acceptance, provider configuration or money activation requires its
   own authorized action. Expected names are `STRIPE_CASHOUT_LIVE_KEY`,
   `STRIPE_CASHOUT_WEBHOOK_SECRET`, `STRIPE_FEE_REPORT_LIVE_KEY`, and exact
   `STRIPE_FEE_REPORT_LIVE_ACCOUNT_ID`. Never paste them into source/logs.
5. Webhooks verify raw-body signature then GET current state, never dispatch.
   The optional service-only driver takes at most three leased jobs; no cron is
   created. The fee importer only reads already-created authenticated reports.
   Unknown operations remain reserved for operator/provider investigation;
   do not clear dispatch tokens or manufacture replacement requests.
6. Rollback: disable execution/dispatch first but retain observation/recovery
   and immutable evidence. Do not drop this schema or delete reservations after
   any dispatch. Reconcile unknowns before deciding on a forward repair.

The dedicated tests execute the actual shared saga, full-schema SQL functions,
and mounted creator panel with controlled provider/native boundaries. They do
not claim real provider transfers, installed-device behavior, or native lock
contention unless the separate PostgreSQL contention runner passes.

## Source repair scope (2026-10-31)

The creator cashout preview and request wrapper now reject fractional,
non-numeric, non-positive and out-of-int32 amounts before any account-bound RPC.
They require an explicit `scheduled` or `instant` method; invalid input is never
rounded into a different request or silently treated as a standard payout.
Owner fee examples match the existing 2% rule ($2 on $100, $20 on $1,000).

Feature surfaces: creator channel-settings cashout readiness and owner admin
monetization fee explanation; shared `_lib/creatorPayouts.ts` and
`_lib/creatorMonetization.ts` request boundary. Existing account/session-bound
mutation, server legal/eligibility checks and payout switches are preserved.
This patch changes no native modules, providers, database or role grants. It
applies equally to Android/iOS JavaScript surfaces; no installed-device proof
is claimed. Existing labels, accessibility and shared background are unchanged.
Rollback is a source revert; it must not reprice accepted historical requests.

## What exists and what does not

The existing server reserves eligible earnings under immutable accepted fee
terms. Standard app fee is zero. Instant app fee is the integer ceiling of 2%
of the requested gross cents. Provider costs and final net remain unknown.
The preview grants no financial authority. A platform-to-connected-account
transfer is not a payout to a bank or debit card.

No operational bank-payout executor, provider fee collection, or live-money
activation is introduced by this repair. Creating an unconnected planning
helper would not complete those requirements.

## Provider-supported collection and remaining evidence

Stripe's [Instant Payouts for Connect](https://docs.stripe.com/connect/instant-payouts)
documentation describes atomic application-fee collection configured through
the Platform Pricing Tool. For that collection path, the maximum payout is the
destination-specific `instant_available.net_available` amount, not the gross
`instant_available.amount`. The alternative account-debit path requires
separate consent, adds costs and can fail after payout; it is not selected here.

Before adding an executable path, verify the actual connected-account
responsibilities, payout capability, platform eligibility/limits, eligible
destination, and fee configuration. Reconcile the existing gross-request fee
basis with the provider's payout amount and pricing basis. For example, a
$100 gross request with a $2 app fee is not the same as charging 2% on the
remaining $98. Do not silently substitute one basis for the other or deduct
fees twice. Standard manual payouts also require the appropriate manual payout
schedule; changing it is a provider action, not a source repair.

Execution must bind exact creator, connected account, destination, currency,
requested gross, app fee, confirmed provider cost and final bank amount. It
must durably reserve before dispatch; unknown outcomes require reconciliation,
not another POST. Signed payout events and observed provider state must reconcile
pending, paid, failed, canceled, returned and fee-refund outcomes without
releasing spent or uncertain balance. Other payout writers and provider auto
schedules must be accounted for; a local lock does not lock Stripe's balance.

These are explicit remaining implementation/qualification gates, not evidence
that switching payout flags on is safe. No provider settings were changed.

## Evidence

`tests/creator-money/cashout-input-boundaries.test.mjs` exercises the production
preview and account-bound request wrapper, including malformed amounts/methods,
integer boundaries, exact unchanged RPC arguments, 2% rounding, standard-zero
fees, unknown provider cost, and non-executable preview flags. The transport is
synthetic; this does not prove real payouts, provider configuration, races or
device delivery. The existing full-replay cashout SQL suite separately covers
accepted immutable terms and reserve accounting.
