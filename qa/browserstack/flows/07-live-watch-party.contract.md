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
- No paid Watch-Party Seat Pass flow is used for Live Stage.

## Steps
1. Open Live tab.
2. Confirm primary entry is `Live Watch-Party`.
3. Confirm utility entry is `Enter Watch-Party Code`.
4. Confirm `Browse Titles`/content path remains separate.
5. Start Live Watch-Party.
6. Confirm Live Waiting Room opens Live Stage.
7. Confirm Android Back behavior returns to the expected waiting/room context.
8. Open a non-self participant detail sheet and confirm `Follow` / `Following` updates the participant's creator Platform follow state when available.
9. Confirm the follow action does not add the participant to Chi'lly Circle and does not change host/speaker authority, room access, Premium, paid ticket, subscriber, or VIP access.
10. Confirm Party Waiting Room does not open Live Stage.
11. Confirm paid Watch-Party Seat Pass buyer path does not open Live Stage.

## Expected Result
Live Stage is owned by `/watch-party/live-stage/[partyId]`; Party Room remains `/watch-party/[partyId]`.

## Screenshots To Capture
- Live tab.
- Live Waiting Room.
- Live Stage.
- Live Stage participant detail Follow action.
- Back/return state.

## Logs To Capture
- Sanitized navigation/LiveKit logs only.

## Pass Criteria
- Live flow opens Live Stage.
- Party flow stays Party Room.
- No route ownership confusion.
- Participant Follow updates one-way Platform follow state only.

## Fail/Blocker Criteria
- Paid ticket path enters Live Stage.
- Party Waiting Room opens Live Stage.
- Android Back lands in wrong product surface.
- Follow creates a Chi'lly Circle connection or changes room authority/access.

## Device Count
One device for route smoke; two for participant smoke.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Route contract guard covers static doctrine; runtime proof remains BrowserStack/second device.
