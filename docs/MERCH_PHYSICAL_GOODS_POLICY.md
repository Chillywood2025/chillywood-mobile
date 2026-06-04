# Merch Physical Goods Policy

Updated: June 4, 2026

Physical merch is separate from Android digital goods.

## Rules

- Stripe may be used for physical merch sandbox checkout.
- Physical merch must have `is_physical_good=true`.
- Physical merch must have `creates_digital_access=false`.
- Merch orders must keep `digital_access_grant_id=null`.
- Merch does not unlock Premium, paid content, Watch-Party tickets, Live access passes, Live seat passes, creator tips, event passes, LiveKit publish permission, host power, speaker authority, moderator/admin power, or payout access.
- Merch checkout must not be used as an Android digital goods workaround.

## Sandbox State

The current sandbox proof product is `cw_merch_test_tee_sandbox`. It is test-only, manually fulfilled, and not payable creator earnings.

Repo-side readiness is complete and deployed. Real Stripe test-card checkout is a runtime proof follow-up requiring an authenticated owner/operator session; no paid order is claimed until Stripe Checkout and the signed webhook complete.

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
