# 09 Money Center Contract

## Purpose
Prove Money Center six-flow smoke, truthful sandbox/not_payable labels, disabled payouts, and flow separation.

## Required Personas
- `creator_operator`
- `premium_creator`

## Required Runtime
Play/internal runtime only.

## Preconditions
- Creator has Platform Studio access.
- Existing sandbox proof rows are available where readback is expected.
- Live money and payouts remain off.

## Steps
1. Log in as creator.
2. Open Platform Studio.
3. Open Money Center.
4. Confirm Overview/Ways to Earn/Offers/Transactions/Payouts/Tax & Legal/Provider Status sections.
5. Confirm six flows appear:
   - Tips
   - Paid Videos
   - Paid Watch-Party Seats
   - Paid Events
   - Channel Subscriptions
   - VIP Passes
6. Confirm transactions are separated by flow.
7. Confirm sandbox/not_payable labels.
8. Confirm no live money, payout, cash-out, withdrawal, transfer, or payable balance claim.
9. Confirm Premium remains separate from creator purchases.

## Expected Result
Money Center is truthful, separated, and not live-money enabled.

## Screenshots To Capture
- Money Center overview.
- Ways to Earn.
- Offers.
- Transactions by flow where rows exist.
- Payouts disabled.
- Provider Status.

## Logs To Capture
- Sanitized Money Center readback errors if any.

## Pass Criteria
- Six flows visible and separated.
- Sandbox/not_payable copy visible.
- Payouts disabled.

## Fail/Blocker Criteria
- UI implies withdrawable balance/live earnings.
- Tips shown as unlocking access.
- Digital purchases shown as Tips.
- Premium mixed with creator purchases.

## Device Count
One creator session.

## Google Play Purchase Required
No for readback smoke.

## Local Before BrowserStack
Yes. v53 Money Center proof passed.
