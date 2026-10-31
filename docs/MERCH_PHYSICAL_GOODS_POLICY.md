# Merch Physical Goods Policy

Updated: October 30, 2026

Physical merch is separate from Android digital goods.

## Rules

- Stripe may be used for physical merch sandbox checkout.
- Physical merch must have `is_physical_good=true`.
- Physical merch must have `creates_digital_access=false`.
- Merch orders must keep `digital_access_grant_id=null`.
- Merch does not unlock Premium, paid content, Watch-Party Seat Passes, Live access passes, Live seat passes, creator tips, event passes, LiveKit publish permission, host power, speaker authority, moderator/admin power, or payout access.
- Merch checkout must not be used as an Android digital goods workaround.

## Sandbox State

The current sandbox proof product is `cw_merch_test_tee_sandbox`. It is test-only, manually fulfilled, and not payable creator earnings.

Repo-side readiness and runtime proof are complete for one sandbox order. An authenticated upgraded proof account created a real Stripe test-mode Checkout Session, completed payment with a Stripe test card, and a signed `checkout.session.completed` webhook updated one sandbox merch order to `paid` / `processing`. Final proof kept merch access grants `0`, merch orders with digital access `0`, Stripe/merch entitlements `0`, Stripe/merch Premium entitlements `0`, payable/paid money-access rows `0`, provider payout-enabled accounts `0`, `live_money_enabled=off`, and `payouts_enabled=off`.

## Prospective return-window terms

The creator explicitly declares tracked or untracked shipping before sale.
New orders freeze `physical_merch_declared_tracked_30d_v2` or
`physical_merch_declared_untracked_30d_v2`, with the declaration displayed before
checkout. Tracked orders use 30 days (720 elapsed hours) from verified delivery;
declared untracked orders use 30 days from verified successful purchase, not
cart/order creation or webhook arrival. Missing canonical payment-success
evidence leaves the purchase clock unverified. The original
`physical_merch_verified_delivery_30d_v1` and older orders remain unchanged.
The deadline is independent of database session time zone. The window is open
strictly before the deadline; expiry never creates payout authority.

New checkout binds the buyer-shown mode, unit price and currency atomically.
Stale terms reject the reservation without retaining inventory changes or
creating a provider checkout. Same-attempt retries retain the original order's
mode and economics. A creator's later listing edit, removal of tracking, or
temporary carrier outage never switches an existing tracked order to purchase
timing or shortens its hold. Historical orders are not backfilled.

Creator-entered fulfillment status, a checkout redirect, payment confirmation,
and the passage of time since purchase are not verified delivery. For tracked
orders, without verified delivery the window does not start. Unresolved returns,
disputes or nondelivery claims
keep the affected order's earnings held, even after the window has elapsed.
Unknown clearance also remains held. Revoked delivery evidence restores a
delivery-verification hold and cannot silently reset the original delivery time.

The source uses an append-only private evidence contract with no API-role
write grants. An operational verifier and return/dispute reconciliation are
still unimplemented. Synthetic owner-seeded evidence in disposable tests is
not proof of carrier delivery or a working return-processing service.
Each future trusted observation must represent the complete order-wide state:
the issuer must reconcile every unresolved return and dispute before reporting
`none` or `resolved`. Resolving the latest individual case must not hide another
open case. The issuer must serialize against concurrent case changes and qualify
provider/carrier identity, evidence freshness and revocation before insertion.

This defines the window and accounting hold only. It does not invent return
condition eligibility, shipping-cost allocation, automatic refund approval,
an immediate-refund promise, or provider money movement. The existing 90/10
net policy, sandbox hold, adjustment qualification and `financial_authority=false`
remain in force. Historical accounting observations are not rewritten; current
read projections re-evaluate the return holds against the latest evidence.

## Production Requirements (unchanged)

Production merch launch remains blocked until a future explicit lane proves:

- production provider setup
- shipping and fulfillment policy
- refund/dispute workflow
- tax/legal review
- Data Safety updates for shipping/payment data
- Owner approval
- no Android digital access coupling

No public merch storefront or production checkout is active in this lane.
