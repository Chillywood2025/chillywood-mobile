# Stripe Payouts And Merch Prep

Date: 2026-06-25

Verdict: Blocked for activation.

This document records the Stripe boundary for future creator payouts and physical merch. It does not activate Stripe payouts, Stripe Connect production onboarding, merch checkout, live money, cash-out, withdrawals, transfers, payout batches, payable balances, provider refunds, Android digital purchases, or Premium.

Stripe payout and merch prep documented separately.

Stripe payouts remain OFF.

Stripe merch checkout remains OFF.

Stripe is not used for Android digital creator-money purchases in this lane. Android digital purchases for Tips, Paid Video, Watch-Party Ticket, Channel Subscription, VIP, and Event Pass remain Google Play / RevenueCat products only.

United States only first applies to the owner-approved Google Play / RevenueCat launch defaults for Android digital creator-money products. It does not activate Stripe payouts, Stripe Connect, or merch checkout.

Future custom pricing for Android digital creator-money flows must remain provider-backed through Google Play / RevenueCat products, price tiers, base plans, offers, or owner-approved catalog entries. Unsupported custom amounts fail closed and must not route through Stripe.

No creator-money product maps to Premium.

Provider refunds remain manual/external.

Creator-money activation still requires owner approval and controlled proof.

Creator-money tax/legal/compliance plan: Partial.

Creator-money product creation: Blocked.

Codex must not guess tax/legal/compliance fields.

## Dashboard Access

Stripe dashboard access was attempted through the existing browser session. The visible page was the Stripe sign-in screen, so production Stripe payout/merch dashboard readiness is pending provider access.

No Stripe API keys, webhook secrets, account secrets, customer data, payment methods, payouts, transfers, refunds, checkout sessions, or private dashboard screenshots were viewed, printed, saved, or committed.

## Stripe Matrix

| Area | Status | Enabled? | Action needed | Safety note |
| --- | --- | --- | --- | --- |
| Creator payouts | Future separate lane | No | Owner-approved Stripe Connect production payout lane with live account, KYC/tax, fraud, support, payout policy, Data Safety, and rollback proof | No payout, transfer, withdrawal, cash-out, payout batch, or payable creator balance is enabled. |
| Stripe Connect/onboarding | Sandbox readiness only; production dashboard access pending | No | Verify production Stripe access and Connect account-controller/capability choices in a separate payout lane | App defaults keep `stripeConnectProductionEnabled=false`, `payoutsEnabled=false`, `cashoutEnabled=false`, and `liveMoneyEnabled=false`. |
| Merch checkout | Future physical-merch lane | No | Owner-approved production merch lane covering Stripe Checkout, fulfillment, returns/refunds, support, Data Safety, monitoring, and rollback | Physical merch remains separate from Android digital access and does not unlock Premium or creator access. |
| Webhooks/secrets | No secret exposure | No | Configure webhook secrets only through provider/runtime secret stores in future lanes | No Stripe key, webhook secret, provider secret, or raw provider payload is committed. |
| Refund automation | Manual/external | No | Separate provider-refund lane required before any automation claim | No Stripe refund, Google Play refund, or RevenueCat refund action is executed. |

## Future Owner Actions

1. Approve a separate payout lane before any Stripe Connect production onboarding or payout movement.
2. Approve a separate physical-merch lane before any public merch checkout.
3. Confirm Stripe account access, live/test mode boundaries, Connect controller/capability design, tax/KYC/legal readiness, fraud/dispute policy, support ownership, and Data Safety impact.
4. Keep Android digital creator-money purchases on Google Play / RevenueCat unless a future policy-approved architecture change is separately approved.
5. Keep all payout, cash-out, withdrawal, transfer, payable-balance, merch checkout, and refund automation switches OFF until proved and owner-approved.
