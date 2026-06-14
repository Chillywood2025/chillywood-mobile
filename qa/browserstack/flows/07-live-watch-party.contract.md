# 07 Live Watch-Party / Live Stage Contract

## Purpose
Prove Live tab Live Watch-Party entry, Live Waiting Room -> Live Stage ownership, Back behavior, and separation from Party Room.

## Required Personas
- `watch_party_host`
- `watch_party_joiner` optional

## Required Runtime
Play/internal runtime only.

## Preconditions
- Account has required live/Premium/runtime access where policy requires it.
- No paid Watch-Party ticket flow is used for Live Stage.

## Steps
1. Open Live tab.
2. Confirm primary entry is `Live Watch-Party`.
3. Confirm utility entry is `Enter Watch-Party Code`.
4. Confirm `Browse Titles`/content path remains separate.
5. Start Live Watch-Party.
6. Confirm Live Waiting Room opens Live Stage.
7. Confirm Android Back behavior returns to the expected waiting/room context.
8. Confirm Party Waiting Room does not open Live Stage.
9. Confirm paid Watch-Party ticket buyer path does not open Live Stage.

## Expected Result
Live Stage is owned by `/watch-party/live-stage/[partyId]`; Party Room remains `/watch-party/[partyId]`.

## Screenshots To Capture
- Live tab.
- Live Waiting Room.
- Live Stage.
- Back/return state.

## Logs To Capture
- Sanitized navigation/LiveKit logs only.

## Pass Criteria
- Live flow opens Live Stage.
- Party flow stays Party Room.
- No route ownership confusion.

## Fail/Blocker Criteria
- Paid ticket path enters Live Stage.
- Party Waiting Room opens Live Stage.
- Android Back lands in wrong product surface.

## Device Count
One device for route smoke; two for participant smoke.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Route contract guard covers static doctrine; runtime proof remains BrowserStack/second device.
