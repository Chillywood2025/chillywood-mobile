# Private merch shipping details

Source/test implementation only; no deployment, provider call, shipment, label,
shipping rate, refund, payout or new return-cost policy is authorized here.

## Evidence and access

- New physical orders freeze `checkout_shipping_v1`. Existing orders stay null;
  there is no historical backfill, guessed address or seller destination input.
- The pinned Stripe Checkout `collected_information.shipping_details` is the
  sole source. The real signature verifier and existing exact order/session/PI,
  amount, currency and sandbox checks run before capture. Billing details,
  metadata, phone and email are not destination authority.
- Only recipient name, street lines, locality, region, postal code and country
  are retained in a private immutable snapshot. The wrapper removes name/street
  facts before the existing financial lifecycle. No general order projection,
  provider receipt, audit payload or client error includes the address.
- Duplicate events do not recapture. Differing subsequent accepted evidence
  creates an immutable conflict marker and hides the address pending review.
  The existing tracking-destination conflict marker is also set, even when only
  the street/recipient differs, revoking tracking corroboration and preserving
  the established tracked-order earnings holds.
  Both tracked and untracked orders also receive the bounded additive
  `merch_fulfillment_address_review_required` evidence/settlement hold. Untracked
  purchase-based timestamps and deadlines remain unchanged; this does not
  fabricate delivery, retroactive terms, return approval or refund authority.
  No automatic correction or support override endpoint is added.
- Before live use, an explicitly approved retention/deletion and correction
  workflow is still needed for private address/access evidence; immutable
  capture is not an indefinite-retention policy or a completed purge workflow.
- `get_merch_fulfillment_address` requires the actual exact active session,
  ownership as buyer or eligible creator, a paid sandbox physical order, no
  recorded refund and no blocked/canceled fulfillment. Seller eligibility uses
  the existing creator-money authority, not a caller-supplied role.
- Private tables have forced RLS and no direct API-role grants. Successful reads
  update a bounded private per-participant/order first/last-access record without
  street, name, token or payload. No public/shared feed exposes these details.
- Both order screens load the address only after an explicit **View shipping
  details** tap. Hide, blur, account replacement, order replacement and unmount
  retire the response and remove it from rendered state. No external send occurs.

The immutable successful-purchase timestamp, tracking ZIP/country evidence,
tracking mode, payment identity, return clock and economics remain authoritative
in their existing implementations. Checkout capture is not proof of purchase
time, delivery, package contents or return/refund approval.

## Validation boundaries

`tests/creator-money/merch-fulfillment-address-postgres.test.mjs` exercises the
actual synthetic Stripe HMAC and production callback through full migration
replay and real `SET ROLE` API roles, then the production mounted shipping UI.
`tests/merch-shipping-mounted.test.mjs` covers opt-in access, lifecycle retirement,
cross-order isolation and error/payload sanitization. Existing merch screen,
payment, tracking and catalog/mutation suites remain regression requirements.

PGlite/native-host doubles are not hosted Postgres concurrency, actual Stripe
qualification or physical-device proof. Native/hosted checks and exact-head
Required Validation are still required before merge; production/provider work
is separately authorized. No credentials or real customer addresses were used.
