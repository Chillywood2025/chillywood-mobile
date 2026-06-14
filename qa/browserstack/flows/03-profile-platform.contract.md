# 03 Profile / Platform Contract

## Purpose
Prove own Profile, public Profile, creator Platform, public viewer state, and wrong-user edit denial.

## Required Personas
- `creator_operator`
- `normal_viewer`

## Required Runtime
Play/internal runtime only.

## Preconditions
- Creator has a public Platform/profile fixture.
- Viewer is not the creator.

## Steps
1. Log in as `creator_operator`.
2. Open own Profile.
3. Open own creator Platform.
4. Confirm owner controls are visible only where appropriate.
5. Log in as `normal_viewer`.
6. Open creator public Profile/Platform.
7. Confirm viewer state, no owner edit controls, and public brand state.
8. Attempt any normal UI edit path that should be owner-only, if reachable.
9. Confirm wrong-user edit is denied or unavailable.

## Expected Result
Owner can view/manage own surfaces; viewer sees public-safe state only.

## Screenshots To Capture
- Owner Profile.
- Owner Platform.
- Public viewer Platform.
- Wrong-user denial/unavailable edit state.

## Logs To Capture
- Sanitized route/error logs only.

## Pass Criteria
- Public viewer cannot edit creator state.
- Public Platform shows expected public brand/profile state.

## Fail/Blocker Criteria
- Viewer sees owner controls.
- Wrong user can edit.
- Public route leaks private/draft state.

## Device Count
One device with account switching or two sessions.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Yes, except full two-session convenience.
