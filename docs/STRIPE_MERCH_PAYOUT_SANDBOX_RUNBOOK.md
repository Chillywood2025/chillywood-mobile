# Stripe Merch And Payout Sandbox Runbook

Updated: June 4, 2026

This runbook covers Stripe sandbox readiness for physical merch and Stripe Connect payout readiness. It does not activate production money.

Canonical final money truth: `docs/MONETIZATION_STACK_FINAL_TRUTH.md`.

Internal tester sandbox mode (`docs/INTERNAL_TESTER_SANDBOX_PURCHASE_MODE.md`) does not change Stripe policy. Stripe remains physical merch sandbox checkout and Stripe Connect payout-readiness only; Android digital goods stay on Google Play / RevenueCat. Approved testers can use Stripe physical merch sandbox checkout through the sandbox tester route; `stripe-merch-checkout` still requires a sandbox physical merch product with `creates_digital_access=false`. Stripe Connect payout readiness remains read-only with no payout request, simulation, cash-out, withdrawal, transfer, payable balance, or payout activation.

## Current Status

- Stripe secret names are configured in Supabase Edge Functions by digest only: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and dedicated merch webhook secret `STRIPE_MERCH_WEBHOOK_SECRET`.
- `stripe-merch-checkout` is server-side, owner/operator-only, and test-mode only.
- `stripe-merch-webhook` verifies the Stripe webhook signature, rejects live-mode events, stores idempotent sanitized rows in `stripe_merch_events`, and updates only `merch_orders`.
- `stripe-merch-checkout` is deployed ACTIVE version `4`; `stripe-merch-webhook` is deployed ACTIVE version `5` on the linked Supabase project.
- Smoke proof: unauthenticated checkout returns `missing_authorization`; unsigned webhook returns `invalid_signature` with `liveMoneyAction:false`.
- Runtime proof: an upgraded proof account completed one real Stripe test-mode Checkout Session for `cw_merch_test_tee_sandbox`; the signed `checkout.session.completed` event was processed by `stripe-merch-webhook`.
- Existing Stripe Connect account/onboarding/sync functions remain sandbox payout readiness only.
- Transfer and payout release functions remain preflight/blocked. They do not create payouts or transfers.

## Physical Merch Proof Item

- `product_key`: `cw_merch_test_tee_sandbox`
- `title`: `Chi'llwood Test Tee`
- `provider`: `stripe_physical_goods`
- `environment`: `sandbox`
- `status`: `sandbox`
- `price_minor`: `999`
- `currency`: `usd`
- `is_physical_good`: `true`
- `creates_digital_access`: `false`

## Allowed Stripe Merch Flow

1. Owner/operator opens the sandbox merch proof surface.
2. Backend calls `stripe-merch-checkout` with the sandbox merch product id or product key.
3. The function creates a pending `merch_orders` row and `merch_order_items` row.
4. The function creates a Stripe Checkout Session using the test-mode secret.
5. Stripe sends a signed sandbox webhook.
6. `stripe-merch-webhook` records a sanitized `stripe_merch_events` row and updates merch order/payment/fulfillment status.

## Forbidden Outcomes

Stripe merch must not create:

- `access_grants`
- RevenueCat entitlements
- Premium entitlements
- `money_access_ledger_events` digital access rows
- creator payable balances
- payouts
- cash-out, withdrawal, or transfer actions
- LiveKit publish permission
- host, speaker, moderator, or admin authority

## Payout Readiness

Stripe Connect sandbox readiness may create or reuse a test connected account, create a sandbox onboarding link, and refresh readiness status. This still does not activate:

- app-level `payouts_enabled`
- production Stripe Connect
- cash-out
- withdrawal
- transfer
- payable creator balance

Latest proof path: `/tmp/chillywood-stripe-connect-payout-readiness-proof-20260604/`.

The upgraded proof account authenticated without a temporary operator role. `stripe-connect-account` reused the existing real Stripe test-mode Express connected account, `stripe-connect-onboarding-link` created a sandbox onboarding link after using an HTTPS Chi'llwood origin, and `stripe-connect-account-sync` refreshed account readiness from Stripe sandbox. Safe status:

- provider environment: `test`
- account type: `express`
- account status: `pending_kyc`
- onboarding status: `onboarding_in_progress`
- KYC status: `pending`
- tax status: `not_connected`
- `charges_enabled=false`
- `payouts_enabled=false`
- details submitted: `false`
- transfers capability: `inactive`
- currently due requirements count: `5`

Safety readback stayed: provider payout-enabled accounts `0`, payout requests `0`, payable/paid creator payout ledger rows `0`, payable/paid money-access rows `0`, payout-readiness access grants `0`, Stripe Connect entitlements `0`, Stripe Connect Premium entitlements `0`, active proof roles `0`, `live_money_enabled=off`, and `payouts_enabled=off`.

No payout simulation was run because the provider test account is not payout-enabled. Do not claim payout success or cash-out readiness from this proof.

## Runtime Proof Complete

Proof path: `/tmp/chillywood-stripe-merch-sandbox-checkout-proof-20260603/`.

Runtime readback after the real Stripe test-card checkout:

- `merch_orders`: `1`
- `merch_order_items`: `1`
- `stripe_merch_events`: `1` processed
- order state: sandbox/test physical merch, `paid` / `processing`
- merch access grants: `0`
- merch orders with digital access: `0`
- Stripe/merch RevenueCat entitlements: `0`
- Stripe/merch Premium entitlements: `0`
- payable/paid money-access rows: `0`
- provider payout-enabled accounts: `0`
- active temporary proof/operator roles after revoke: `0`
- `live_money_enabled`: `off`
- `payouts_enabled`: `off`

The proof used a real Stripe test-mode Checkout payment and a signed Stripe webhook. No paid order was faked or manually marked paid.
