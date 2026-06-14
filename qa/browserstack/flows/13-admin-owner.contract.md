# 13 Admin / Owner Contract

## Purpose
Prove admin route gating and that owner/admin controls are not exposed to normal creators or fans.

## Required Personas
- `normal_viewer`
- `creator_operator`
- owner/admin account only if explicitly approved

## Required Runtime
Play/internal runtime only.

## Preconditions
- Do not grant admin roles for BrowserStack unless explicitly approved.
- Owner/admin credentials are never committed or recorded.

## Steps
1. Log in as `normal_viewer`.
2. Attempt `/admin`.
3. Confirm route is blocked/denied.
4. Open normal creator/fan surfaces.
5. Confirm admin-only provider/payout/refund/role controls are not visible.
6. Log in as `creator_operator`.
7. Confirm creator has Platform Studio/Money Center only, not Admin Command Center controls.
8. If owner/admin proof is approved, log in as owner/admin and smoke `/admin` read-only command center surfaces.

## Expected Result
Admin controls stay backend-role protected and hidden from creators/fans.

## Screenshots To Capture
- Normal-user admin denial.
- Creator surface with no admin-only controls.
- Owner/admin read-only command center only if approved.

## Logs To Capture
- Sanitized route denial logs only.

## Pass Criteria
- Normal users cannot access Admin.
- Creator/fan surfaces do not expose admin provider/payout/refund/role controls.

## Fail/Blocker Criteria
- Normal user reaches Admin.
- Creator/fan sees admin-only controls.
- Admin action can activate live money/payouts.

## Device Count
One device with account switching.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Partial. Owner/admin integration audit is complete; runtime smoke pending.
