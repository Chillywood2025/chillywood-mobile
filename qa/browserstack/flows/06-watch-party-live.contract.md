# 06 Watch-Party Live Contract

## Purpose
Prove content-first Watch-Party Live entry, room-code join, Party Waiting Room, Party Room, participant rail, comments, controls, and paid room gate behavior.

## Required Personas
- `watch_party_host`
- `watch_party_joiner`
- `unpaid_room_fan` if paid gate is tested

## Required Runtime
Play/internal runtime only.

## Preconditions
- Two signed-in devices/sessions are available for participant rail proof.
- Host has current room access required by policy.
- A backed title/player source is available.

## Steps
1. From Player or Title, start Watch-Party Live.
2. Confirm no raw title-id UX appears.
3. Confirm Party Waiting Room opens.
4. Create or use a valid room.
5. Joiner enters by room code.
6. Confirm Join Now does not silently fail.
7. Enter Party Room.
8. Confirm participant rail shows `You` and second user.
9. Confirm rail scrolls if overflow is present.
10. From a creator-video Player source, confirm compact `Follow` / `Following` can follow the creator without leaving playback.
11. In Party Room, open a non-self participant detail sheet and confirm `Follow` / `Following` updates the participant's creator Platform follow state when available.
12. Confirm the follow action does not add the participant to Chi'lly Circle and does not change room role, camera/mic seat, Premium, ticket, or subscriber access.
13. Confirm comments panel and bottom controls are stable.
14. Confirm expired/invalid room fails closed.
15. For paid room fixture, confirm unpaid direct Party Room link shows Seat Pass gate before camera/mic/membership/presence.

## Expected Result
Watch-Party Live stays content-first and routes Party Waiting Room -> Party Room.

## Screenshots To Capture
- Player/Title handoff.
- Waiting Room.
- Room-code join.
- Party Room participant rail.
- Player creator Follow chip.
- Participant detail sheet Follow action.
- Comments/player controls.
- Expired-room fail-closed.
- Paid Seat Pass gate if tested.

## Logs To Capture
- Sanitized watch-party branch logs only.

## Pass Criteria
- No raw title-id public UX.
- Room-code join works.
- Party Room opens from Party Waiting Room.
- Creator/participant Follow updates one-way Platform follow state only.
- Paid direct-link gate blocks before permissions/session setup.

## Fail/Blocker Criteria
- Party Waiting Room routes to Live Stage.
- Join Now silently does nothing.
- Camera/mic prompt appears before paid access is confirmed.
- Follow creates a Chi'lly Circle connection or changes room access.
- Second session unavailable.

## Device Count
Two devices/sessions for full proof.

## Google Play Purchase Required
No for smoke; yes only if rerunning paid Seat Pass purchase.

## Local Before BrowserStack
Partially. Full two-user proof remains deferred.
