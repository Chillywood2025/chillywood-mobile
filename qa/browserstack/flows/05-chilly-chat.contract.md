# 05 Chi'lly Chat Contract

## Purpose
Prove two-user messaging and in-app voice/video call states.

## Required Personas
- `chat_user_a`
- `chat_user_b`

## Required Runtime
Play/internal runtime only.

## Preconditions
- Two signed-in devices/sessions are available.
- Users can open a shared thread or start one through backed UI.
- Notification/ringtone permissions are allowed where needed.

## Steps
1. User A opens Chi'lly Chat inbox.
2. User A opens thread with User B.
3. User A sends a message.
4. User B receives the message.
5. User A starts a voice call.
6. User B sees incoming call sheet.
7. User B declines.
8. Confirm declined/ended call card appears.
9. User A starts a video call.
10. User B accepts.
11. Confirm both route into the existing communication room.
12. End the call.
13. Confirm ended/missed card state is clear.

## Expected Result
Messaging and call UI states work without changing LiveKit token authority.

## Screenshots To Capture
- Inbox.
- Thread before/after message.
- Incoming voice call sheet.
- Declined card.
- Video call accepted room.
- Ended card.

## Logs To Capture
- Sanitized chat/call state logs only.

## Pass Criteria
- Message send/receive passes.
- Voice decline passes.
- Video accept/end passes.
- Ringtone/incoming sheet does not persist incorrectly.

## Fail/Blocker Criteria
- Second session unavailable.
- Call sheet does not appear.
- Call routes to wrong surface.
- Tokens/secrets appear in logs.

## Device Count
Two devices/sessions.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Blocked until second phone/session or BrowserStack approval.
