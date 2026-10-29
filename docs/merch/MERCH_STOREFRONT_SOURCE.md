# Creator merch storefront

This is a source implementation, not a production launch or installed-device proof.
Stripe accounts, live payment switches, payouts, tax settings, and provider credentials
are unchanged. Existing approved sandbox-subject rules still apply.

## Navigation

- A creator's public Platform has a **Shop** action.
- Platform Studio → Ways to Earn → **Merch Shop** opens one product/order manager.
- Creators add a product, save a draft, publish/pause/archive it, and preview the
  buyer storefront. Only published listings appear to buyers.
- Buyers browse products and see price, available stock, shipping limitations,
  and checkout availability before choosing sandbox checkout. **My orders** shows
  authoritative payment, refund, and fulfillment status.

`merch_products` is the catalog authority for these surfaces and checkout. The old
unmounted `creator_products` preview is no longer read by the Platform route.
Existing legacy product rows are not automatically published or copied into a
payment catalog. Product drafts require the exact current owner session; publishing
also requires existing creator-money eligibility. Neither action accepts agreements
or gives users new roles.

## Boundaries and operations

All new listings and orders are sandbox USD physical goods. Shipping copy explicitly
says no physical shipment; fulfillment actions represent sandbox workflow states,
not carrier proof. There is no automatic shipping integration, live tax calculation,
refund issuance, earnings, payout, VIP grant, or Premium entitlement.

Buyer and creator order reads use exact current-session authority and sanitize
private provider/address data. The buyer's durable order—not a browser success or
cancel return—is the payment source of truth. Ambiguous checkout attempts must be
checked in My orders; a client leaving a screen does not cancel payment.
My orders can resume the same durable attempt during its checkout window, including
after app restart. Verified unpaid expiry releases its reservation once. Unconfirmed
provider outcomes remain held and require reconciliation; they are not treated as
canceled, refunded, or safe to sell again. Pending-order limits are not a substitute
for production reconciliation monitoring.

The default product has one simple stock quantity. Creators can instead configure
up to 50 size/color SKUs, all at the product price, with separate available stock
and active/paused/archived states. Existing order snapshots keep the purchased SKU,
labels and price even after catalog edits. Creators enter available units; existing
held/sold allocations remain preserved behind that value. Inventory mode cannot
change after checkout history exists; create a separate listing instead. Verified
expiry releases the exact purchased SKU once. Late payment must reacquire that SKU
or remain paid with fulfillment blocked; another size's stock cannot cover it.

After saving a draft, creators can choose an optional device photo, stage its upload,
and explicitly attach it. A separate product asset reference uses the existing
private Platform media scan/review and retained-deletion pipeline; it does not edit
profile branding. Buyers see only approved clean photos on visible published
listings. A creator can explicitly approve their own pending photo only after a
clean scan, using the existing owner-publish review policy; rejected, hidden or
quarantined photos cannot use this action. Photos awaiting scanning/review stay
labeled; no scanner/provider activation is implied. Signed display URLs are temporary and never stored in the product catalog.
An HTTPS image link remains an advanced fallback, not the primary photo workflow.

Production still needs separately approved fulfillment ownership, inventory and
shipping timelines/costs, address/privacy handling, returns/refund operations,
tax/legal review, provider readiness, deployment and installed-device verification.
Do not enable production money as a substitute for completing those decisions.

## Verification scope

Focused tests exercise actual React screens/hooks and the actual account-bound
client API against modeled native and transport boundaries. Backend tests exercise
the full source migration chain in PGlite for catalog/session/RLS authorization,
per-SKU inventory, retained signed-facts order lifecycle, and photo scan/reference
rules. Native picker, upload transport and payment transport are modeled boundaries.
PGlite checks are not native multi-connection concurrency proof. These are not proof of a live
provider charge, actual shipment, Android/iOS purchase behavior, or deployed schema.
Required Validation at the final exact source head remains the merge gate.

Rollback can remove the new app entrypoints/routes while retaining fail-closed
sandbox records. Database corrections are forward-only; deployed migrations must
never be edited or replayed under a new name.
