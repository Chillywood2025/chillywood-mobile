# Merch Physical Goods Policy

Updated: June 4, 2026

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

## Production Requirements

Production merch launch remains blocked until a future explicit lane proves:

- production provider setup
- shipping and fulfillment policy
- refund/dispute workflow
- tax/legal review
- Data Safety updates for shipping/payment data
- Owner approval
- no Android digital access coupling

No public merch storefront or production checkout is active in this lane.
