# Stripe Merch And Payout Sandbox Runbook

Updated: June 4, 2026

This runbook covers Stripe sandbox readiness for physical merch and Stripe Connect payout readiness. It does not activate production money.

## Current Status

- Stripe secret names are configured in Supabase Edge Functions by digest only: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- `stripe-merch-checkout` is server-side, owner/operator-only, and test-mode only.
- `stripe-merch-webhook` verifies the Stripe webhook signature, rejects live-mode events, stores idempotent sanitized rows in `stripe_merch_events`, and updates only `merch_orders`.
- Both functions are deployed ACTIVE version `2` on the linked Supabase project.
- Smoke proof: unauthenticated checkout returns `missing_authorization`; unsigned webhook returns `invalid_signature` with `liveMoneyAction:false`.
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

## Remaining Runtime Proof

Real Stripe test-card merch checkout should be run only with an authenticated owner/operator runtime session and the Stripe sandbox checkout screen available. The current repo-side lane did not fake a paid order or manually mark an order paid.
