# Reserved room-seat auction payment boundary

This is source qualification, not provider activation or deployment evidence.
Live money and payouts remain off. No provider products or credentials are seeded.

## Purchase and recovery

- A winning Stage seat reserves one guest spot in the server-issued room session,
  including admission and same-account rejoining. It does not grant host status,
  microphone/camera publication, or exemption from moderation.
- Party Room admission uses its own limited inventory. Neither right is a fake
  creator-event pass or a legacy Stage eligibility-only pass.
- An exact buyer/session/attempt claims an immutable quote once. A dedicated test
  Stripe account/product binding is required before any request can be dispatched.
- A known, durably bound open Checkout Session can be resumed by a provider GET.
  The response must match the same quote, amount, currency, account, metadata,
  expiry and session ID. Current account and room authority are checked again
  before its URL is returned. Recovery never creates a second Checkout Session.
- An unknown dispatch without a bound provider ID remains reconciliation. A
  client timeout, browser cancellation, or repeated tap cannot free its inventory
  or authorize another payment. Only verified terminal evidence releases it.

## Android external-content-link path

Android requires real native eligibility and a fresh token, qualified program
configuration, a matching private admission and quote binding, and the native
disclosure/launch path. A generic browser link is not a fallback. The token is
never placed in Stripe metadata, response bodies, or logs.

Automatic tax is inclusive, preserving the winning bid as the complete buyer
price. Only complete signed Stripe automatic-tax fields produce tax evidence.
The private reporting outbox records the exact paid/refunded obligation and
does not itself grant access or invent a provider acknowledgment. Missing tax
evidence and unresolved taxed partial refunds remain visible for reconciliation.

## Verified source tests

- `tests/creator-money/stripe-room-auction-checkout.test.mjs`: actual handler
  execution with isolated provider boundary, native binding, no duplicate POST,
  known-session recovery, response mismatch, account change and revocation.
- `tests/creator-money/stripe-room-auction-webhook.test.mjs`: raw-body HMAC
  verification, immutable paid identity, tax provenance, refunds and disputes.
- `tests/creator-room-auction-payment-database.test.mjs`: actual PGlite migrations,
  service-role boundaries, exact ledger/grant/library lineage, duplicate events,
  terminal-before-success, room ending, provider identity immutability, recovery,
  Android admission/binding and durable Google reporting obligation.

The database test uses synthetic actors and provider evidence. For its sixth
room, it advances only the isolated PGlite JavaScript clock past the existing
five-room abuse window and verifies SQL clock movement. Production rate guards
remain unchanged. This is not native concurrent PostgreSQL, live Stripe/Google,
or physical-device evidence; those qualification stages remain separate.
