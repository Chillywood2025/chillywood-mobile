# Stripe Connect Payout Readiness

Updated: June 4, 2026

Stripe Connect is the payout readiness rail. It is not an Android digital checkout rail.

## Current Readiness

- `stripe-connect-account` can create or reuse a Stripe test-mode connected account.
- `stripe-connect-onboarding-link` can create a sandbox onboarding link.
- `stripe-connect-account-sync` can refresh sandbox account readiness.
- `stripe-connect-webhook` verifies signatures, rejects live-mode events, and records foundation events without creating checkout, payouts, transfers, or live money.
- `stripe-connect-transfer-create` and `payout-release-preflight` remain blocked/preflight-only.

## Money Safety

Payout readiness must not:

- set app-level `payouts_enabled` on
- set `live_money_enabled` on
- create a cash-out action
- create a withdrawal action
- create a transfer action
- show a payable creator balance from sandbox rows
- convert sandbox merch/digital rows into payable earnings

## Future Production Lane Requirements

Production payout activation requires a separate approved lane with:

- live Stripe account approval
- KYC/tax readiness
- legal/accounting approval
- fraud/dispute/hold policy
- immutable payout audit
- Owner approval
- explicit production kill-switch change

Until that lane completes, Creator Money Center must continue to show `Payouts not active`, `No verified payable earnings yet`, and `Not payable`.

This lane did not run or claim a real payout. Existing Connect functions remain sandbox account/onboarding/status readiness only.

June 4, 2026 Stripe merch checkout runtime proof did not change payout readiness. The physical-merch test checkout produced one sandbox merch order and one sanitized Stripe merch event, but provider payout-enabled accounts stayed `0`, app-level `payouts_enabled` stayed `off`, `live_money_enabled` stayed `off`, and no cash-out, withdrawal, transfer, payable balance, or payout simulation was created.
