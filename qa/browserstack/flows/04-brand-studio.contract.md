# 04 Platform Studio / Brand Studio Contract

## Purpose
Prove creator-tool access, non-Premium gate, Brand Studio save/reload, and public brand readback.

## Required Personas
- `premium_creator`
- `nonpremium_user`
- `normal_viewer`

## Required Runtime
Play/internal runtime only.

## Preconditions
- `premium_creator` has current Platform Studio access through approved Premium/operator test state.
- `nonpremium_user` lacks Platform Studio access.
- No live money or payout state is enabled.

## Steps
1. Log in as `nonpremium_user`.
2. Attempt Platform Studio.
3. Confirm clear Premium/operator gate.
4. Log in as `premium_creator`.
5. Open Platform Studio.
6. Open Brand Studio.
7. Confirm existing brand state loads.
8. Change a safe test field/color or re-save known safe state.
9. Save/publish.
10. Reload Brand Studio and confirm persisted state.
11. Log in as `normal_viewer`.
12. Open creator public Platform and confirm public brand state.

## Expected Result
Brand Studio is owner-only, save/reload works, public viewer sees public state.

## Screenshots To Capture
- Non-Premium gate.
- Brand Studio loaded.
- Save success.
- Reload persisted.
- Public viewer readback.

## Logs To Capture
- Sanitized brand save start/success/failure logs only.

## Pass Criteria
- Non-Premium gate is clear.
- Save/reload/public readback pass.
- Wrong-user edit unavailable or denied.

## Fail/Blocker Criteria
- Silent save failure.
- Viewer sees owner controls.
- Public readback does not match saved public state.

## Device Count
One device with account switching or two sessions.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Yes. v53 local proof passed.
