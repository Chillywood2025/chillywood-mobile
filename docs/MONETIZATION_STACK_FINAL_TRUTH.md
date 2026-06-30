# Monetization Stack Final Truth

Updated: June 13, 2026

June 30 creator monetization setup and cashout readiness activation: creator monetization setup is usable in sandbox/not-payable mode. Creator setup does not mean live money is active. Creators can access cashout readiness, but real cashout is not live. Cashout readiness does not execute payouts. No real payout, transfer, withdrawal, or payable balance is created. `liveMoneyEnabled` remains OFF. Payouts and cashout remain OFF for production money movement. Saved creator configs are sandbox/not-payable. Production sales require owner/provider activation. Production cashout requires Stripe/live provider approval, tax/KYC readiness, fraud/support/legal review, and owner approval. Premium remains the app-wide subscription flow. Tips, Paid Video, Watch-Party Ticket, Channel Subscription, VIP, and Event Pass are creator monetization flows. Do not show proved/readiness boxes instead of usable setup controls. No auth/RLS/money permission weakening happened. No provider/live-money mutation happened.

June 25 public non-money feature enablement update: `docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md` closes the app-controlled public non-money switchboard and disables public paid creator video / Watch-Party Seat Pass checkout controls unless live checkout runtime switches are explicitly enabled in a separate owner-approved lane. This lane does not activate money. `live_money_enabled`, creator-money, payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, provider refund automation, Premium annual, Creator Channel Subscription, and public Premium monthly purchase remain off, blocked, or pending separate owner-approved proof. No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

June 25 money admin authority update: `docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md` closes repo-side authority governance only. This lane does not activate money. First Owner / Owner controls activation authority; Premium monthly activation requires a separate owner-approved purchase proof lane; Premium annual remains provider-blocked; creator-money remains OFF; `live_money_enabled` remains OFF; payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF; provider refunds remain manual/external; provider transaction/customer/order data is masked/scoped; dual approval is required for future payout activation and future `live_money_enabled`; no Google Play, RevenueCat, Stripe, payout, purchase, refund, or product mutation happened.

This document is the canonical repo truth for Chi'llywood monetization readiness after the completed Google Play / RevenueCat, Stripe merch, and Stripe Connect sandbox proof lanes. It consolidates proof status only. It does not activate production money.

June 21 refund / credit / payout-hold foundation update: `docs/REFUND_CREDIT_PAYOUT_HOLD_FOUNDATION.md`, `_lib/moneyRefundPolicy.ts`, remote-applied migration `20260621091458_refund_credit_payout_hold_foundation.sql`, and `guard:refund-credit-payout-hold-policy` add the rule foundation for future refund eligibility, in-app credit review, creator obligation review, and creator payout holds. Post-apply `supabase db push --dry-run` reports the remote database is up to date. This is foundation-only. No real refunds are executed, no provider refund APIs are called, no production credits are spendable, no payout holds release money, no payable creator balances are created, live money remains off, payouts remain off, and purchase/access behavior is unchanged.

June 13 creator-money update: the six Money Center creator monetization flows now have local/manual sandbox proof for their core purchase/access or contribution paths: Tips V1, Paid Videos V1, Paid Watch-Party Seats V1, Paid Events V1, Channel Subscriptions V1, and VIP Passes V1. VIP Passes V1 completed after Google Play one-time product `cw_vip_pass_sandbox_499` was activated and mapped in RevenueCat as a published non-consumable; Play/internal v52 verified provider event `1e81db62-4b17-45b1-8369-004302d41108`, VIP transaction `829f230f-7734-4fad-a88b-bd674c1daa8e`, VIP pass `b19d3a26-1431-4033-bf70-5f3e5311e719`, access grant `3b051689-7879-4e39-9712-efab1d1d783c`, VIP route access, authenticated second non-VIP denial, and Money Center VIP readback as sandbox/not payable. Live money remains off, sandbox rows are not payable, and provider refund/revoke proof remains deferred where safe Google Play order tooling is unavailable.

Production policy operations update: `docs/PRODUCTION_MONEY_POLICY_OPERATIONS_READINESS.md` and `docs/PRODUCTION_MONEY_READINESS_INDEX.md` now prepare future-production legal, tax, fraud/risk, support, refund/return, merch fulfillment, payout operations, and Owner/Admin approval-gate readiness. These are policy and operations readiness artifacts only. They do not enable production checkout, production merch launch, payout execution, cash-out, withdrawal, transfer, payable balances, Stripe Android digital checkout, LiveKit authority, route ownership changes, or safety bypass.

Route-backed visual proof update: `docs/ROUTE_BACKED_MONETIZATION_VISUAL_PROOF.md` closes the final contextual monetization QA gap. Play-installed Android proof captured route-backed viewer gates for paid content, Watch-Party Live ticket, Live Watch-Party access pass, Live Watch-Party seat pass, and event pass, plus Owner/Admin Money Center readouts for Product Catalog, Provider Events/Webhooks, Purchase Intents, Access Grants, Ledger Events, Merch Products/Orders, Payout Readiness, Money Center Overview, Money Audit Explorer, and Technical Checks. Remote readback still has live money off, payouts off, cash-out off, production/payout/payable/publish/host-power config rows `0`, payable/paid money-access rows `0`, payout requests `0`, provider payout-enabled accounts `0`, merch access grants `0`, and active temp/proof roles `0`.

Creator setup update: `docs/CREATOR_MONETIZATION_SETUP_COMPLETION_MATRIX.md` closes the in-app creator-facing sandbox setup matrix. `/creator-monetization-setup` now has saved sandbox/not-payable configs for paid content, Watch-Party Live ticket, Live Watch-Party access pass, Live Watch-Party seat pass, creator tip, event pass, and physical merch readiness. Remote readback proves processed sandbox provider events and consumed intents for every Android digital product, access grants where appropriate, sandbox/not-payable ledger rows, Stripe merch sandbox launch/readiness, and payout readiness read-only. Production money, payouts, LiveKit publish, host authority, payable rows, arbitrary Android pricing, and Stripe Android digital checkout remain off/absent.

Viewer/Admin QA update: `docs/CREATOR_MONETIZATION_VIEWER_GATE_ADMIN_QA.md` captures the first Play-installed Android setup, approved tier, internal sandbox launcher, merch/readiness, payout-readiness read-only, and non-admin Admin denial screens. Its route-backed visual gap is now superseded by `docs/ROUTE_BACKED_MONETIZATION_VISUAL_PROOF.md`.

Owner/Admin UI follow-up: `docs/OWNER_ADMIN_TABS_UI_UX_POLISH.md` modernizes Admin tab interactions without changing this money truth, provider rail policy, production money status, payout status, or admin authority.

Internal tester update: `docs/INTERNAL_TESTER_SANDBOX_PURCHASE_MODE.md` opens a bounded `internal_tester_sandbox` purchase mode for approved testers only. Public/default Premium purchase remains closed by source (`PREMIUM_PURCHASE_SHELL_ON_HOLD = true`, `premiumPurchaseEnabled=false`), while approved testers can run clearly labeled Google Play / RevenueCat sandbox purchases and Stripe physical merch sandbox checkout. Owner/Admin Money Center shows internal sandbox status and tester-tool routing. Payout readiness is read-only and cannot request, trigger, simulate, cash out, withdraw, transfer, or activate payouts. This does not activate production money, payouts, cash-out, payable balances, public buy buttons, fake purchases, or Stripe Android digital checkout.

## Executive Summary

Chi'llywood has complete sandbox monetization readiness across Android digital goods, physical merch, and creator payout readiness:

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
- Paid video unlock
- Paid Watch-Party room ticket
- Paid event pass
- Channel subscription
- VIP pass
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
- onboarding link created with approved HTTPS Chi'llywood origin
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
