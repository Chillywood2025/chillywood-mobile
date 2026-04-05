# Chi'llywood Chi'lly Chat Validation

## Purpose
- Use this checklist for the first real validation pass of standalone Chi'lly Chat on `/chat` and `/chat/[threadId]`.
- This is separate from the canonical room inline-communication validation.
- Record the actual run in `docs/chilly-chat-validation-report-template.md`.

## Locked Expectations
- Standalone Chi'lly Chat lives on:
  - `/chat`
  - `/chat/[threadId]`
- Standalone Chi'lly Chat must not reuse `/communication`.
- Party Room and Live Room remain canonical room surfaces:
  - `/watch-party/[partyId]`
  - `/watch-party/live-stage/[partyId]`
- Room-native communication and standalone Chi'lly Chat are distinct features.

## Required Preflight
- `supabase/migrations/202603270009_create_chilly_chat_threads.sql` is applied to the target Supabase environment.
- Device A signed into Account A.
- Device B signed into Account B.
- Both devices can open channel/profile surfaces.
- Both devices can reach `/chat` and `/chat/[threadId]`.
- Camera and microphone permissions are available if thread calling will be tested.

## What This Pass Must Prove
- Self profile opens `/chat`.
- Another profile opens or creates `/chat/[threadId]`.
- Messages persist.
- Realtime message delivery updates the receiving device.
- Inbox preview text updates from the latest message.
- Unread count increments for the recipient.
- Opening the thread clears unread for the current member.
- `Voice Call` starts a thread-based voice session with camera off and mic on.
- `Video Call` starts a thread-based video session with camera on and mic on.
- A participant with an active thread call sees the active-call banner in the same thread.
- Joining and ending a thread call clears active call state for both participants.

## What This Pass Does Not Need To Prove
- Group chat
- Media attachments
- Typing indicators
- Push notifications
- Incoming-call alerts or ringing UX
- Background telephony-style handling

## Runtime Evidence To Capture
- Use the dev overlay when running development builds.
- Use `COMMUNICATION EVENTS` while a thread call is active.
- Use `ANALYTICS EVENTS` to confirm:
  - `chat_inbox_opened`
  - `chat_thread_open_requested`
  - `chat_thread_opened`
  - `chat_message_sent`
  - `chat_call_started`
  - `chat_call_join_requested`
  - `chat_call_ended`
- During thread calls, also expect communication events with `surface: "chat-thread"`, including:
  - `event:communication_connect`
  - `event:communication_disconnect`
  - `event:communication_reconnect` when recovery is tested

## Expected Route Truth
- Self profile `Chi'lly Chat` opens `/chat`
- Another profile `Chi'lly Chat` opens `/chat/[threadId]`
- Standalone chat never lands on `/communication`
- Starting or joining a thread call stays inside `/chat/[threadId]`

## Validation Checklist
1. Apply the chat migration to the target Supabase environment.
2. Device A: open your own profile and tap `Chi'lly Chat`.
3. Confirm Device A lands on `/chat`.
4. Device A: open another participant profile and tap `Chi'lly Chat`.
5. Confirm Device A lands on `/chat/[threadId]`.
6. Confirm the thread header shows the correct participant identity snapshot.
7. Device A: send a message and confirm it appears immediately in the thread.
8. Device B: open the matching thread and confirm the message is present.
9. Device A: send another message while Device B is already in the thread and confirm Device B updates without a manual refresh.
10. Device B: return to `/chat` and confirm inbox preview text reflects the latest message.
11. Device B: confirm unread count increases when a message arrives while the thread is closed.
12. Device B: reopen the thread and confirm unread clears for that member.
13. Device A: start a `Voice Call`.
14. Confirm Device A stays on `/chat/[threadId]` and the call panel opens.
15. Device B: confirm the same thread shows an active-call banner.
16. Device B: join the active voice call from the same thread.
17. Confirm both devices stay on `/chat/[threadId]`.
18. Confirm the call behaves like voice first:
  - camera off by default
  - mic on by default
19. End the voice call cleanly and confirm the active-call banner disappears for both devices.
20. Repeat the same flow for `Video Call`.
21. Confirm video starts with camera on and mic on.
22. If safe to test, background one device during an active thread call and confirm any reconnect stays on `/chat/[threadId]`.
23. Confirm no step routes through `/communication`.

## Blocking Failures
- Self profile does not open `/chat`
- Another profile does not open or create `/chat/[threadId]`
- Message send fails to persist
- Realtime delivery does not update the recipient thread
- Inbox preview or unread state is obviously wrong after confirmed message delivery
- Voice or video thread call cannot start or cannot be joined
- Thread call end leaves stale active-call state behind
- Standalone Chi'lly Chat routes through `/communication`

## Bug Capture Template
- Flow:
- Device / account:
- Expected route:
- Actual route:
- Expected behavior:
- Actual behavior:
- Expected breadcrumbs:
- Actual breadcrumbs:
- Repro steps:
- Screenshot / video:
- Relevant log excerpt:
