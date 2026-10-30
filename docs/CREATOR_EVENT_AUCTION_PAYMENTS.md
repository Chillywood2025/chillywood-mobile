# Event-auction payment boundary

This source integration is **sandbox-only**, not a live-money activation or
provider qualification. It does not create products, capabilities, eligible
buyers, provider accounts, webhook subscriptions, charges, transfers or payouts
when migrated. Existing production-intent prohibitions remain intact.

## Separate authority chain

1. An eligible buyer bids without a charge. Only the final highest bidder can
   obtain an immutable award quote. VIP, tips and physical merchandise are not
   substitutes for an event ticket.
2. Trusted server capability and current exact-session eligibility evidence,
   observed recipient readiness, and a qualified event-auction product binding
   are required. No client header or caller metadata supplies these approvals.
   Configuration rows are absent by default.
3. `prepare_creator_event_auction_checkout` atomically claims one dispatch and
   transfers the auction inventory hold into the existing event reservation.
   The shared intent uses provider `stripe_event_auction`, the actual winning
   amount, and the original event-terms revision—not a fabricated store SKU.
4. `stripe-event-auction-checkout` uses only dedicated test credentials and a
   server-configured HTTPS return destination. A provider Checkout Session is
   bound before its URL is returned; current account/session, capability and
   money switches are rechecked after provider I/O. Unknown outcomes retain the
   same attempt and inventory. Browser returns never grant access.
5. The dedicated webhook verifies the unchanged raw body's Stripe signature
   before invoking service-only SQL. Account, environment, buyer, creator,
   auction, quote, payment identity, amount and currency must match. The same
   delivery/hash is idempotent; conflicting replay cannot replace history.
6. Verified payment is projected into existing provider events, money ledger,
   event reservation, access grant and event pass. The normal event-entry,
   protected live/replay destination and purchase library consume this lineage.
   The ledger is non-payable; no earnings, transfers or payouts are produced.

## Time and terminal policy

The creator's payment deadline is never extended or silently shortened. Stripe
supports [30-minute through 24-hour Checkout expiry](https://docs.stripe.com/api/checkout/sessions/create);
dispatch requires 31 minutes remaining, including a
one-minute processing margin. The creator and winner see the latest start time
separately from the payment deadline. A deadline does not prove an uncertain
provider checkout failed and does not authorize resale.

The existing D1 late-payment admission still checks original show terms and
shared capacity, excluding only this award's own hold during atomic conversion.
Unavailable/changed/canceled/terminal-before-paid purchases retain evidence for
reconciliation without granting access. Existing D2 cancellation/no-show and
material-change remedies remain provider-review eligibility, not automatic
refund promises. D3 access uses the captured explicit replay contract and
expires at its original boundary.

Refunds and disputes revoke exact owned access while preserving the initial
financial record. `charge.refunded` totals are cumulative: the ledger appends
only the additional amount, even for out-of-order deliveries. A definitive
unpaid Checkout expiration or asynchronous failure releases its own hold;
generic retryable PaymentIntent failures do not. A contradictory success after
that release requires reconciliation. Product identity used by historical
receipts cannot be rewritten after qualification.

## Verification and activation limits

`tests/creator-event-auction-payment-database.test.mjs` executes real SQL against
the complete isolated schema using synthetic trusted provider facts. Its
temporal section controls only the isolated PGlite JavaScript clock, first
asserting `clock_timestamp()` moves; it does not replace SQL authority functions
or disable triggers/RLS. This is not native concurrency or real Stripe evidence.
The separate Edge tests exercise real HMAC verification and mocked transport,
including interrupted checkout and post-fetch session/capability withdrawal.

Live release requires separately authorized provider/platform qualification,
commercial policy and settlement configuration, production-money approval,
deployment and end-to-end provider/device evidence. This source change supplies
none of that authority. Do not configure credentials or enable capabilities as
part of ordinary source validation.
# Stripe request-contract verification (2026-10-30)

The pinned request version is `2026-10-28.endive`, listed in Stripe's
[version-setting guide](https://docs.stripe.com/sdks/set-version).
The GA [Endive Checkout migration](https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions)
removed the request parameter `payment_method_types`; passing it now produces
400. Auction requests correctly use `allowed_payment_method_types[0]=card`.
The response still exposes `payment_method_types`; an empty or non-card result
is rejected before releasing the URL.

Stripe's official `PostCheckoutSessions` OpenAPI metadata
(`2026-09-30.preview`, independently corroborated by the GA changelog) confirms
the constructed top-level fields, `integration_identifier`, 30-minute through
24-hour expiry, and nested `line_items[0][price_data]` fields.
For the separate Android extension, `automatic_tax.enabled=true`,
`billing_address_collection=required`, and `price_data.tax_behavior=inclusive`
are documented parameters. Inclusive tax preserves the winning buyer total;
actual tax configuration and signed completed tax evidence remain required.

Handler tests assert the pinned header, exact request-key set, absence of the
removed key and rejection of empty/incompatible returned methods. These are
source contract tests, not a claim of a real provider-created Checkout Session.

## Qualification provisioning gap

Capability, exact-session eligibility, and auction-product binding tables remain
private to database-owned authority: no API role, including `service_role`, has
direct table privileges. Existing security-definer purchase functions consume
qualified facts but do not provision them. A narrowly scoped, audited
qualification/revocation API and its operational evidence remain unimplemented;
this is an activation blocker, not permission to insert production facts.
Isolated tests seed synthetic facts as the disposable database owner, then run
application operations under their actual authenticated or service roles without
disabling RLS or immutable-evidence triggers.
