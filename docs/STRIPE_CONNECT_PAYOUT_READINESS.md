# Stripe Connect Payout Readiness

Updated: June 4, 2026

Stripe Connect is the payout readiness rail. It is not an Android digital checkout rail.

Canonical final money truth: `docs/MONETIZATION_STACK_FINAL_TRUTH.md`.

Internal tester sandbox mode (`docs/INTERNAL_TESTER_SANDBOX_PURCHASE_MODE.md`) does not activate payouts. Stripe Connect remains sandbox readiness only; app-level payouts, cash-out, withdrawal, transfer, and payable balances stay off. Owner/Admin Money Center lists payout readiness inside `Internal Sandbox Testing` as read-only, and internal testers cannot request, trigger, simulate, cash out, withdraw, transfer, or activate payouts.

Creator setup flow update: `docs/CREATOR_MONETIZATION_SETUP_COMPLETION_MATRIX.md` keeps payout readiness read-only inside creator monetization setup. The setup route may show Connect/KYC/tax readiness copy, but it provides no payout request, payout simulation, withdrawal, transfer, cash-out, payable balance, or production payout activation. Completion readback still shows provider payout-enabled accounts `0`, payout requests `0`, and payable/paid creator payout ledger rows `0`.

Viewer/Admin QA update: `docs/CREATOR_MONETIZATION_VIEWER_GATE_ADMIN_QA.md` captures the internal tester payout-readiness read-only surface and remote readback still shows creator payout test accounts `2`, provider payout-enabled accounts `0`, payout requests `0`, and payable/paid creator payout ledger rows `0`. Owner/Admin payout drilldown screenshots remain blocked until an active Owner/Admin app session is used.

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

## Sandbox Payout Readiness Proof

Proof path: `/tmp/chillywood-stripe-connect-payout-readiness-proof-20260604/`.

Existing deployed functions were used:

- `stripe-connect-account` ACTIVE version `47`
- `stripe-connect-onboarding-link` ACTIVE version `47`
- `stripe-connect-account-sync` ACTIVE version `47`
- `stripe-connect-webhook` ACTIVE version `49`

Result:

- upgraded proof account authenticated
- no temporary operator role was required
- existing real Stripe test-mode Express connected account was reused
- onboarding link was created after using the approved HTTPS Chi'llwood origin
- account status was refreshed from Stripe sandbox
- provider environment: `test`
- status: `pending_kyc`
- onboarding status: `onboarding_in_progress`
- KYC status: `pending`
- tax status: `not_connected`
- `charges_enabled=false`
- `payouts_enabled=false`
- details submitted: `false`
- transfers capability: `inactive`
- currently due requirements: `5`
- active proof roles after proof: `0`

Final safety readback:

- app-level `live_money_enabled=off`
- app-level `payouts_enabled=off`
- provider payout-enabled accounts: `0`
- payout requests: `0`
- payable/paid creator payout ledger rows: `0`
- payable/paid money-access rows: `0`
- payout-readiness access grants: `0`
- Stripe Connect entitlements: `0`
- Stripe Connect Premium entitlements: `0`

No sandbox payout simulation was run because the test connected account is not payout-enabled and payout success must not be faked.
