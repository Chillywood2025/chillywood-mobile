# Production Money Policy Operations Readiness

Date: June 5, 2026
Status: draft readiness packet only; production money is not active.

This is an internal product, legal, tax, fraud, support, refund, fulfillment, payout, and Owner/Admin approval-readiness packet. It is not legal advice, tax advice, production activation, payout approval, merch launch approval, or provider approval.

## Executive Summary

Chi'llwood's sandbox monetization rails are complete: Android digital goods are sandbox-proved through Google Play / RevenueCat, physical merch is sandbox-proved through Stripe test mode, Stripe Connect payout readiness is sandbox-proved, creator setup flows are complete, and route-backed viewer/Admin proof is complete.

Production money is not active. Production payouts are not active. Cash-out, withdrawal, transfer, payable creator balances, production merch checkout, and production digital sales remain off. This packet prepares the operating framework for a future explicit activation lane only.

## Reference Posture

- Google Play Payments policy requires Play-distributed apps that charge for in-app digital features, services, content, or goods to use Google Play billing unless an eligible policy exception applies: https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play policy guidance also warns against directing users inside the app to payment methods other than Google Play for in-app digital purchases unless an eligible path applies: https://support.google.com/googleplay/android-developer/answer/10281818
- Stripe Connect supports platform/marketplace onboarding, account verification, balances, payouts, and 1099 tooling, but live payout use still requires Chi'llwood operational approval: https://stripe.com/connect
- Stripe documents 1099 tax-reporting support for Connect platforms; Chi'llwood still needs tax professional review before relying on any filing model: https://docs.stripe.com/connect/get-started-tax-reporting
- Stripe Tax supports physical-goods tax configuration, but nexus, product tax code, shipping, and jurisdiction decisions require tax review: https://docs.stripe.com/tax/physical-goods
- IRS gig-economy guidance says income may be reportable even if not shown on an information return; Chi'llwood must not provide tax advice to creators: https://www.irs.gov/businesses/gig-economy-tax-center

## Rail Separation

### Digital Goods

Rail: Google Play / RevenueCat.

Products:

- Premium
- Creator tips
- Watch-Party Live tickets
- Live Watch-Party access passes
- Live Watch-Party seat passes
- Paid content access
- Event passes

Digital purchases must not use Stripe Android checkout, external Android payment links, or physical-merch checkout. Payment grants only the backed access type and never grants LiveKit publish, host, speaker, moderator, admin, payout, or safety-bypass authority.

### Physical Goods

Rail: Stripe merch only.

Physical merch is separate from Android digital goods. Merch checkout must not unlock Premium, paid content, tips, tickets, seats, event passes, LiveKit publish, host power, speaker authority, moderator/admin authority, RevenueCat entitlements, or payout access.

### Payout Readiness

Rail: Stripe Connect readiness only.

Current payout readiness may show onboarding, KYC, tax, and provider status. It cannot request, trigger, simulate, withdraw, transfer, cash out, release payout, mark balances payable, or treat sandbox/setup rows as earnings.

## Complete Sandbox Proof

- Premium sandbox proof through Google Play / RevenueCat.
- Creator tip sandbox proof through Google Play / RevenueCat.
- Watch-Party Live ticket sandbox proof through Google Play / RevenueCat.
- Live access pass sandbox proof through Google Play / RevenueCat.
- Live seat pass sandbox proof through Google Play / RevenueCat.
- Paid content sandbox proof through Google Play / RevenueCat.
- Event pass sandbox proof through Google Play / RevenueCat.
- Stripe physical merch sandbox checkout and signed webhook proof.
- Stripe Connect sandbox payout readiness proof.
- Creator monetization setup flows and route-backed viewer/Admin proof.

## Still Off

- `live_money_enabled`
- `payouts_enabled`
- `cashout_enabled`
- production digital checkout
- production merch checkout
- production payouts
- cash-out
- withdrawal
- transfer
- payable creator balance
- arbitrary unmapped Android digital prices
- Stripe Android digital checkout

Starting readback for this lane: `live_money_enabled=false`, `payouts_enabled=false`, `cashout_enabled=false`, production-enabled configs `0`, payout-enabled configs `0`, payable/paid money-access rows `0`, payout requests `0`, and provider payout-enabled accounts `0`.

## Required Future Production Activation Approvals

Before any production activation lane:

- Owner approval with explicit scope and rollback owner.
- Legal review of terms, refund/return policy, creator monetization policy, and dispute handling.
- Tax review for creator payouts, 1099 strategy, sales tax/VAT/GST, and records.
- Fraud/risk review of transaction, creator, payout, merch, refund, and chargeback rules.
- Support readiness for digital access, merch, refunds, disputes, KYC/tax, and payout questions.
- Refund/cancellation readiness for Google Play / RevenueCat digital goods and physical merch.
- Merch fulfillment readiness, including shipping timing, inventory, tracking, support, and returns.
- Creator payout terms readiness, including holds, reserves, chargebacks, negative balance, KYC/tax, and appeals.
- Stripe live approval and webhook validation for any live merch or Connect payout lane.
- Google Play production product approval for Android digital goods.
- Data Safety and privacy policy review before any new shipping, identity, tax, or financial information collection reaches reviewers or production users.
- Support contact and escalation review.
- Chargeback/dispute workflow review.
- Kill-switch and rollback plan.

## Activation Rule

No single doc, screenshot, sandbox proof, or Owner/Admin readout can activate production money. Activation requires a future explicit lane that changes the relevant switches only after every approval gate is attached, audited, and owner-approved.
