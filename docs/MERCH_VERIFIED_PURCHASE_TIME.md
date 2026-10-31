# Verified merchandise purchase time

The prospective purchase clock is the `created` Unix timestamp of the signed
Stripe `payment_intent.succeeded` event, after the existing exact test-mode
order, PaymentIntent, amount, received amount and currency checks succeed.
It is not PaymentIntent creation, cart creation, Checkout completion, webhook
arrival or the existing `paid_at` processing timestamp. Stripe defines event
creation timestamps in its [Event reference](https://docs.stripe.com/api/events/object).

The existing signature-verified merch endpoint passes this fact into the same
transaction as payment reconciliation. Only a newly processed successful event
can create private immutable purchase-time evidence. Events received before the
stored PaymentIntent binding remain retryable. Duplicate events, refunds,
disputes and alternate later success events cannot reset the timestamp.
Contradictory canonical timestamps fail the whole transaction and require
reconciliation rather than changing the accepted clock.

`private.merch_verified_purchase_at(uuid)` returns the exact evidence timestamp
or NULL. It has no direct API-role grants. Successful Checkout alone or missing
event time leaves the purchase clock unqualified; consumers must keep their
hold and must not substitute receipt arrival. Delivery of the canonical
PaymentIntent event is an operational requirement before enabling this policy.
Historical orders lacking frozen return terms remain unchanged and cannot be
backfilled by replaying old receipts. No delivery proof, payout authority,
provider configuration or live activation is introduced.

Local verification runs the actual HMAC verifier and production endpoint into
the production SQL RPC under the real service role, with private-read/write
denials, pending retry, historical migration replay and an arrival-time mutation
control. Embedded PostgreSQL is not native contention or live-provider proof.
