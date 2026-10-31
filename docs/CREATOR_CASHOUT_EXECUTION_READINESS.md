# Creator cashout execution readiness

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
