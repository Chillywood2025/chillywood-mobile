# Monetization Stack Final Truth

Updated: June 4, 2026

This document is the canonical repo truth for Chi'llwood monetization readiness after the completed Google Play / RevenueCat, Stripe merch, and Stripe Connect sandbox proof lanes. It consolidates proof status only. It does not activate production money.

Creator setup update: `docs/CREATOR_MONETIZATION_SETUP_COMPLETION_MATRIX.md` closes the in-app creator-facing sandbox setup matrix. `/creator-monetization-setup` now has saved sandbox/not-payable configs for paid content, Watch-Party Live ticket, Live Watch-Party access pass, Live Watch-Party seat pass, creator tip, event pass, and physical merch readiness. Remote readback proves processed sandbox provider events and consumed intents for every Android digital product, access grants where appropriate, sandbox/not-payable ledger rows, Stripe merch sandbox launch/readiness, and payout readiness read-only. Production money, payouts, LiveKit publish, host authority, payable rows, arbitrary Android pricing, and Stripe Android digital checkout remain off/absent.

Owner/Admin UI follow-up: `docs/OWNER_ADMIN_TABS_UI_UX_POLISH.md` modernizes Admin tab interactions without changing this money truth, provider rail policy, production money status, payout status, or admin authority.

Internal tester update: `docs/INTERNAL_TESTER_SANDBOX_PURCHASE_MODE.md` opens a bounded `internal_tester_sandbox` purchase mode for approved testers only. Public/default Premium purchase remains closed by source (`PREMIUM_PURCHASE_SHELL_ON_HOLD = true`, `premiumPurchaseEnabled=false`), while approved testers can run clearly labeled Google Play / RevenueCat sandbox purchases and Stripe physical merch sandbox checkout. Owner/Admin Money Center shows internal sandbox status and tester-tool routing. Payout readiness is read-only and cannot request, trigger, simulate, cash out, withdraw, transfer, or activate payouts. This does not activate production money, payouts, cash-out, payable balances, public buy buttons, fake purchases, or Stripe Android digital checkout.

## Executive Summary

Chi'llwood has complete sandbox monetization readiness across Android digital goods, physical merch, and creator payout readiness:

- Android digital goods use Google Play / RevenueCat.
- Approved internal testers may use a clearly labeled sandbox-only mode to test Google Play / RevenueCat purchases.
- Physical merch uses Stripe sandbox checkout for physical goods only.
- Creator payout readiness uses Stripe Connect sandbox.
- Production live money remains off.
- App-level payouts remain off.
- Sandbox and setup records are not payable.
- No cash-out, withdrawal, transfer, fake balance, fake sale, Stripe Android digital checkout, LiveKit authority bypass, route ownership change, or safety bypass is active.

## Product Rails

### Digital Rail

Provider: Google Play / RevenueCat.

Sandbox-proved product classes:

- Premium subscription
- Creator tip
- Watch-Party Live ticket
- Live Watch-Party access pass
- Live Watch-Party seat pass
- Paid content access
- Event pass

Digital purchase events create `provider_events`, consume `money_purchase_intents` for dynamic products, create `access_grants` only for access products, and write `money_access_ledger_events` as sandbox/not-payable. Payment never grants LiveKit publish permission, host power, speaker authority, moderator/admin power, payout access, or safety bypass.

### Physical Merch Rail

Provider: Stripe sandbox.

Status:

- physical merch sandbox checkout proved for `cw_merch_test_tee_sandbox`
- real Stripe test-mode Checkout completed
- signed Stripe merch webhook processed `checkout.session.completed`
- duplicate resend did not duplicate the event/order path
- no digital access grant
- no RevenueCat entitlement
- no Premium entitlement
- no payable creator balance

Production merch is not live. A future production merch lane must cover approval, fulfillment policy, refund/return policy, support readiness, and Data Safety review.

### Payout Readiness Rail

Provider: Stripe Connect sandbox.

Status:

- real Stripe test-mode Express connected account reused
- onboarding link created with approved HTTPS Chi'llwood origin
- account status refreshed from Stripe sandbox
- account remains `pending_kyc` / `onboarding_in_progress`
- `charges_enabled=false`
- `payouts_enabled=false`
- transfers capability inactive

Production payouts are not live. No cash-out, withdrawal, transfer, payout request, payout simulation, or payable creator balance was created. A future production payout lane must cover live Stripe approval, tax/legal readiness, fraud review, payout policy, support readiness, Data Safety updates, and owner approval.

## Final Proof Matrix

| Product | Rail | Provider | Sandbox proof status | Provider event status | Access grant status | Ledger/order/readiness status | Money Center status | Admin status | Production status | Remaining gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Premium | Digital | Google Play / RevenueCat | Sandbox proved / test-ready | Real sandbox Premium webhook proof exists | `user_entitlements` remains strict source | Sandbox/setup not payable | Proved, purchase shell closed by default | Sanitized proof/readout captured | Not production-live | Optional reviewer-window re-proof only |
| Creator tip | Digital | Google Play / RevenueCat | Real sandbox purchase proved | Sandbox provider event stored | None, correctly ledger-only | Sandbox/not-payable ledger row | Sandbox only / Not payable | Sanitized event/intent/ledger readout | Off for production | Real provider refund/revoke and delayed pending only if tooling supports |
| Watch-Party Live ticket | Digital | Google Play / RevenueCat | Real sandbox purchase proved | Sandbox provider event stored | `watch_party_live_ticket` sandbox grant | Sandbox/not-payable ledger row | Sandbox only / Not payable | Sanitized event/intent/grant/ledger readout | Off for production | Route UI polish only; provider refund/pending tooling gap |
| Live Watch-Party access pass | Digital | Google Play / RevenueCat | Real sandbox purchase proved | Sandbox provider event stored | `live_watch_party_access_pass` sandbox grant | Sandbox/not-payable ledger row | Sandbox only / Not payable | Sanitized event/intent/grant/ledger readout | Off for production | Provider refund/pending tooling gap |
| Live Watch-Party seat pass | Digital | Google Play / RevenueCat | Real sandbox purchase proved | Sandbox provider event stored | `live_watch_party_seat_pass` sandbox grant | Sandbox/not-payable ledger row | Sandbox only / Not payable | Sanitized event/intent/grant/ledger readout | Off for production | Provider refund/pending tooling gap |
| Paid content access | Digital | Google Play / RevenueCat | Real sandbox purchase proved | Sandbox provider event stored | `paid_content_access` sandbox grant | Sandbox/not-payable ledger row | Sandbox only / Not payable | Sanitized event/intent/grant/ledger readout | Off for production | Player purchase UI polish only; provider refund/pending tooling gap |
| Event pass | Digital | Google Play / RevenueCat | Real sandbox purchase proved | Sandbox provider event stored | `event_pass` sandbox grant | Sandbox/not-payable ledger row | Sandbox only / Not payable | Sanitized event/intent/grant/ledger readout | Off for production | Provider refund/pending tooling gap |
| Merch physical good | Physical merch | Stripe sandbox | Real test-mode Checkout proved | Signed Stripe merch event processed | None | One sandbox merch order/order item; not payable | Physical merch sandbox proof; no payable earnings | Sanitized merch order/event readout | Not production-live | Production merch approval, fulfillment, refund/return, support, Data Safety |
| Stripe Connect payout readiness | Payout readiness | Stripe Connect sandbox | Test-mode Express account readiness proved | Account sync/onboarding readiness events | None | `pending_kyc` / onboarding in progress; no payout request | Payout readiness only; no verified payable earnings | Sanitized payout readiness drilldown | Payouts off | Production payout approval, live Stripe, tax/legal, fraud, payout policy, support, Data Safety |

## Final Counts

Latest verified digital money counts:

- `provider_events`: 6
- `money_purchase_intents`: 8
- `access_grants`: 5
- `money_access_ledger_events`: 7
- payable/paid money-access rows: 0

Latest verified merch counts:

- `merch_products`: 1
- `merch_orders`: 1
- `merch_order_items`: 1
- processed Stripe merch events: 1
- merch digital access grants: 0
- Stripe/merch RevenueCat entitlements: 0
- Stripe/merch Premium entitlements: 0

Latest verified payout-readiness counts:

- `creator_payout_accounts`: 2
- Stripe Connect test account: 1
- onboarding sessions: 2
- eligibility records: 1
- provider charges-enabled accounts: 0
- provider payout-enabled accounts: 0
- payout requests: 0
- payable/paid creator payout ledger rows: 0
- active proof roles: 0

Global switches and safety counts:

- `live_money_enabled=off`
- `payouts_enabled=off`
- active temporary proof roles: 0

## Proof Paths

Proof artifacts are local evidence unless a future convention explicitly stores screenshots in the repo.

- `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`
- `/tmp/chillywood-googleplay-item-availability-real-purchase-proof-20260603/`
- `/tmp/chillywood-real-sandbox-access-products-proof-20260603/`
- `/tmp/chillywood-money-failure-and-event-pass-proof-20260604/`
- `/tmp/chillywood-money-center-launch-polish-review-packet-20260604/`
- `/tmp/chillywood-public-v1-money-proof-rc-sweep-20260604/`
- `/tmp/chillywood-stripe-merch-sandbox-checkout-proof-20260603/`
- `/tmp/chillywood-stripe-connect-payout-readiness-proof-20260604/`

## Remaining Gaps

Only these money gaps remain:

- real provider refund/revoke proof if RevenueCat/Google Play tooling supports it
- real delayed-payment pending proof if Google Play provider/device support exists
- production merch launch approval
- production payout approval
- tax/legal/fraud/support readiness before production payouts
- fulfillment/refund/return policy before production merch launch
- final Data Safety review before production merch or payout launch if shipping, identity, tax, or financial data collection changes

## Hard Non-Goals

- no production live money
- no production payouts
- no cash-out
- no withdrawal
- no transfer
- no fake balances
- no fake sales
- no Stripe Android digital checkout
- no external Android digital payment links
- no digital goods through Stripe
- no physical merch through RevenueCat / Google Play
- no sandbox/setup payable rows
- no LiveKit authority bypass
- no host/speaker/mod/admin authority from payment or payout readiness
