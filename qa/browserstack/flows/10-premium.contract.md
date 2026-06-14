# 10 Premium Contract

## Purpose
Prove Premium gates and Premium separation from creator purchases.

## Required Personas
- `premium_creator`
- `nonpremium_user`
- creator purchase personas where needed

## Required Runtime
Play/internal runtime only.

## Preconditions
- Premium policy state is known.
- Do not run Premium purchase unless explicitly approved.

## Steps
1. Log in as `nonpremium_user`.
2. Open Premium-gated surface.
3. Confirm clear Premium gate.
4. Confirm creator purchase surfaces do not become unlocked by Premium absence/presence.
5. Log in as `premium_creator` or Premium test user.
6. Confirm Premium-gated surface opens where expected.
7. Confirm Premium does not unlock Paid Videos, Paid Watch-Party tickets, Paid Events, Channel Subscriptions, or VIP.
8. Confirm creator purchases do not unlock Premium.

## Expected Result
Premium remains a platform subscription, separate from creator purchases.

## Screenshots To Capture
- Non-Premium gate.
- Premium-positive route.
- Creator purchase locked state with Premium separate copy.

## Logs To Capture
- Sanitized access resolver logs only.

## Pass Criteria
- Premium gates work.
- No creator purchase gate is bypassed by Premium.
- Creator purchase does not grant Premium.

## Fail/Blocker Criteria
- Premium unlocks creator paid content.
- Creator purchase unlocks Premium.
- Gate silently fails.

## Device Count
One device with account switching.

## Google Play Purchase Required
No unless explicitly approved.

## Local Before BrowserStack
Partial; final runtime smoke needed.
