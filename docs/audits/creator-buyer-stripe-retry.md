# Dormant Stripe tip checkout retry repair

Source implementation, 2026-10-26. This test-only pure-contribution endpoint is
not exposed by the native purchase UI. Native tips keep their existing platform
billing policy. No provider call, account setting, live payment or payout was
performed. Existing Stripe API version, fee/split and provider configuration are
preserved.

The old endpoint created a fresh tip row and random idempotency key for every
POST. A lost response followed by retry could therefore create a second checkout.
`20261026175927_creator_tip_checkout_retry_quotes.sql` now atomically binds a
durable client request UUID to its exact buyer/session and immutable transaction
and Stripe request body. A different unresolved attempt for the same buyer and
creator blocks another checkout. Creator, amount, currency and private note
conflicts reject reuse; profile names, redirects and provider destinations do not
silently replace the captured quote. Unknown retries use the original body/key
only before the earlier of the original checkout expiry and 23 hours. New
checkouts explicitly expire after one hour; this bounded technical checkout
window is frozen in the first request and is not a payment/refund deadline. Known
sessions are retrieved with GET. Changed recipient configuration withholds a
payment link and prevents an unknown POST.

The service-only receipt RPC records the exact provider session without
downgrading paid/refunded/disputed/canceled state written by the existing webhook.
Actor authority is checked before and after provider IO. Unknown request/DB-save
outcomes retain a pending receipt; the client keeps the original attempt rather
than starting a new charge. A checkout cancellation redirect does not establish
provider payment failure. Provider completion and settlement remain webhook facts.
Likewise a failed payment attempt is not proof that its Checkout Session is
closed: the [PaymentIntent lifecycle](https://docs.stripe.com/payments/payment-intents)
tracks failed attempts on the same object. The client retains the original UUID
on `failed`, and the server blocks a distinct attempt when provider identity
remains unresolved. Actual checkout expiration/cancellation evidence may release
that block; a local timeout alone cannot.

Private quote rows have RLS/FORCE RLS and no direct API grants. The three new
functions have explicit minimal ACLs; two public RPCs are service-only. Immutable
tip ownership and economics are guarded while actual settlement fields remain
writable by their existing authority.

Verification includes the actual Edge handler with simulated HTTP/DB boundaries,
and actual SQL functions through the complete migration chain with real session
and payment-projector authority. The complete-schema SQL run passed 26 assertions,
including actual payment, partial refund, failed-payment/expiration, stale-session
receipt and immutable-quote checks. The elapsed-time fixture uses ordinary INSERTs
with application guards enabled. The focused Edge/authority/client suite passed 26 tests;
Deno type checking, the Stripe Connect policy guard and whitespace checks passed.
The standalone native PostgreSQL script passed two lock-observed races and ten
assertions against the task's disposable full-schema fixture: same-request
retries returned one tip and immutable request; distinct concurrent requests
for the same buyer/creator admitted only one unresolved tip. Final full-schema
and exact-head CI outcomes belong in the integrated validation ledger.
Initial SQL test attempts exposed two fixture errors (invalid `payment_status`
and expecting `processed` instead of the Stripe projector's `paid` result); those
were corrected without weakening application guards.
The real payment projector also caught an integration defect: updating a paid
row with its completed webhook metadata required the original projector claim.
The receipt RPC now returns terminal receipts without issuing an UPDATE, so it
preserves both terminal state and the existing projector fence. The regression
uses actual payment and partial-refund projection rather than a stubbed guard.
Independent review also caught the retired-session receipt case: including
`status` in a late receipt UPDATE correctly triggers the existing actor fence.
That path now records only verified provider identity/time and leaves the tip
pending, preserving evidence without granting a checkout transition.

Official Stripe [idempotency documentation](https://docs.stripe.com/api/idempotent_requests)
was read on 2026-10-26: v1 retains the first result including failures, requires
identical parameters, and may prune keys after at least 24 hours. This is why
the source never repeats an unknown creation beyond its bounded window.
Real provider retention, pending/failure/refund lifecycle, native behavior and
deployment remain unqualified by these synthetic tests.
