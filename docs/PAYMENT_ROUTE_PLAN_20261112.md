# Payment route implementation plan

Status: source work in progress, not provider approval or activation.

## Owner direction

The November 12 direction is native Apple/Google checkout for creator tips and
platform subscriptions. In this product, creator channel subscriptions are named
Platform Subscriptions and are distinct from Chi'llywood Premium. Preserve both
subscription types on native checkout rather than interpreting “the rest” as
permission to move creator subscriptions to Stripe. Stripe is the target for the remaining purchase types where
the applicable store rules permit it. Do not silently switch a tip to Stripe,
round a creator price, or pass store commission to the buyer. A small buyer-paid
processing fee is a research objective, not an approved universal surcharge.
Live payments and payouts remain off. Device qualification is deferred until the
owner reconnects the phones after the software work.

The October 30 clarification of the 2% fee was specifically **instant cash-outs**,
not a replacement for all platform revenue shares. Preserve existing source
economics (digital sales 20% net, physical merchandise 10% net, tips 0%, standard
cash-out 0%, instant cash-out 2%) and historical receipts. A future prospective
change needs an explicit decision; do not reinterpret historical allocations.

## Current source and required work

| Purchase | Current source | Target / remaining work |
| --- | --- | --- |
| Premium | RevenueCat native subscriptions | Keep native route and entitlement lifecycle. Verify exact current store products before activation. |
| Creator tips | Native store plus separate custom Stripe and lowest-cost selection | Remove new external tip initiation from the normal app; preserve all unresolved payment recovery. Enforce native-only new admission server-side without dropping past Stripe receipts. Expand only actually configured native amounts. |
| Physical merchandise | Stripe quote, checkout, webhook, inventory/fulfillment and cost accounting | Retain physical-only classification and 90/10 economics; verify configuration and full sandbox path, not recreate it. |
| Event / room auctions | Stripe exact winning-bid quote and dedicated verified webhook | Retain exact bid, capacity, terms, expiry and remedy lineage; verify regional program qualification and actual account setup. |
| Paid video | RevenueCat store products; iOS four-tier restriction before new native engine | Add distinct Stripe quote/order/checkout/receipt adapter into existing per-video access and earnings lineage. Current tip endpoint is not a paid-video endpoint. |
| Creator Platform subscriptions | Native products with immutable creator/offer catalog bindings | Retain native subscription and renewal/cancellation ownership. Expand only provider-configured supported prices, not invented slot availability. |
| Other digital access | Native products / feature-specific server admission | Add feature-specific Stripe access projection; a generic paid event cannot substitute for a ticket or VIP benefit. |

## Shared order contract

### Catalog transition, not deletion

The checked-in iOS catalog describes sandbox-only products, not proof of current
provider approval. It contains four paid-video consumable tiers ($0.99, $2.99,
$4.99, $9.99), four native tip tiers at those amounts, Premium monthly/yearly,
and creator Platform subscription slots. The newer supported-price binding
code can represent additional immutable subscription mappings; the old slots
must not be mistaken for the entire future catalog.

Do not build creator-selected Stripe video prices by relabeling those old
four native SKUs. A Stripe video order must bind the actual video offer and its
exact price/revision independently of a store SKU. Keep old provider identities
for receipt interpretation, refunds, unresolved attempts and restoration, not
as an undisclosed price restriction on the replacement flow. Remove old new-sale
entry points only when their replacement is actually connected. Retiring new
admission is different from deleting transaction history or provider products.

Before any provider retirement, reconcile live Apple, Google and RevenueCat
inventory against source and database bindings. Product status in one service
does not establish status in another. No provider products have been deleted by
this plan, and no fixed native tip/subscription amount is represented as
configured merely because source lists it.

Do not create a second entitlement truth. Each payment adapter must bind a
server-issued immutable order to buyer, current authenticated session, creator,
exact product/video/revision or original auction terms, amount, currency,
provider account, environment and selected route. Only a verified matching paid
provider event can project access. Redirects, client success flags and unsigned
metadata cannot authorize access or earnings.

Duplicate, conflicting, late and out-of-order receipts must preserve lineage.
Refund/dispute/revocation events must update exactly the owned entitlement and
append the corresponding financial evidence. Unknown checkout outcomes keep the
same attempt; do not start another payment rail automatically. Preserve existing
terms, return, delivery, tax, creator eligibility and cash-out holds.

## Paid-video Stripe vertical slice

1. Creator sets an exact supported USD price and publishes a specific version.
2. Server issues an account-bound immutable order and reports the complete buyer
   total. No new fee is added while the fee policy remains undecided.
3. Region/platform-specific admission authorizes the actual checkout route.
4. Checkout uses server values and idempotency, verifies the exact Stripe
   account/mode/session, and handles uncertain dispatch through reconciliation.
5. Signed webhook plus exact provider identity/amount/currency verification
   records payment and grants that video through existing playback authority.
6. Purchase history restores access from server ownership. Cancel, account
   switch, delayed success, replay, full/partial refunds and disputes have
   explicit outcomes. Never treat browser return as payment proof.

This sequence is not implemented merely by adding a pure helper or mocked test.
The database, Edge handler, normal app entry and real provider sandbox evidence
must be identified separately in the completion report.

## External and provider boundaries

- Google US External Content Links console was read November 12 and said not
  eligible to enroll online. Manual declaration is offered; the reason is not
  known. Enrollment requires verified business/support/billing facts,
  certifications and terms. Do not infer the reason or submit automatically.
- Google's US external program involves reporting and applicable service fees.
  A different PSP does not remove those obligations.
- Apple's US external-link allowance is not worldwide permission or permission
  to embed arbitrary Stripe card billing in the native app. Recheck before
  launch. No promise of permanently zero Apple link-out commission.
- Store products have configured prices. RevenueCat does not override a 99-cent
  product to charge an arbitrary amount. Shared consumable products for durable
  video ownership need policy review; do not assume receipt restoration resolves
  the purchase-type semantics.
- Provider settings, catalog changes, credentials, enrollment, deployments and
  payment activation are separate from this source implementation.

## Processing fees and unresolved decisions

No automatic gross-up of store commission. No added buyer fee in source until
the model is explicitly settled. A card surcharge is not allowed on every card
type and is subject to network limits, notices and jurisdiction rules. Renaming
it processing or convenience does not bypass those rules. A payment-neutral
service fee is a separate pricing model requiring truthful all-in disclosure.

At the published Stripe US standard 2.9% + 30-cent rate, a 99-cent transaction
costs about 33 cents before other costs. A Visa 3% cap is about 3 cents there,
not a way to recover the whole processing charge. Actual account pricing,
Connect, tax, reporting, disputes and store obligations must be included in a
real cost comparison.

Cost-saving checks before launch should start with existing eligible program
rates, not buyer surcharges: verify Apple Small Business enrollment, Google's
applicable reduced fee tier, and whether Apps Experience qualification improves
the applicable external-link rate. None is assumed enrolled. The US ECL page
currently lists a 10% first-$1M rate, 20% standard non-subscription rate, and a
15% qualifying Apps Experience rate. These are not interchangeable with
non-US Billing Choice terms or the processor's fees. Provider-confirmed account
terms and transaction classification govern the actual quote and ledger.

Keep the owner's native tip/subscription choice even if a separate processor
looks cheaper in a headline comparison. For other digital goods compare the
complete store-program fee plus Stripe, Connect, tax and reporting costs. For
physical merchandise keep it classified as physical, never disguised digital
access. Do not assume the same link-out permission or fee applies worldwide.

Decisions requiring the owner or provider: any prospective revenue-share change,
buyer fee model, actual enrollment/terms and business certifications, live
activation. Independent source work and sandbox preparation continue while
those remain unresolved.

## Evidence and sources

- Apple review rules: https://developer.apple.com/app-store/review/guidelines/
- Apple price points: https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/set-a-price-for-an-in-app-purchase/
- Google payments: https://support.google.com/googleplay/android-developer/answer/9858738
- Google US ECL: https://support.google.com/googleplay/android-developer/answer/16470497
- Google regional Billing Choice: https://support.google.com/googleplay/android-developer/answer/17161464
- Apple Small Business: https://developer.apple.com/app-store/small-business-program/
- Stripe prices: https://stripe.com/pricing
- Visa surcharge rules: https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/merchant-surcharging-qa-for-web.pdf
- Mastercard rules: https://www.mastercard.com/us/en/business/support/merchant-surcharge-rules.html

Source inventory was checked at PR709 head
`6e921310fa8e48baff69c16e1645bcf9dda4ec3f`. PR710 Apple handover remains
independent; it does not resolve catalog breadth or the Stripe paid-video route.
