# Chi'lly Chat Accepted-Media Control and Reconnection Closeout

Checkpoint date: 2026-07-19

## Observed production-QA failure

Sanitized backend readback for the reported Android caller and bounded receiver
showed that the affected invites remained `ringing`, had no acceptance timestamp,
and had only the caller membership. The caller nevertheless started the direct
communication media session and moved to `reconnecting` within seconds. Pressing
the microphone or camera control then exercised duplicate media/presence update
paths and could tear down or replace the active Realtime signaling channel.

This chat-call media path currently uses direct React Native WebRTC with Supabase
Realtime signaling. It is not a LiveKit Room. On iOS, CallKit/PushKit supplies the
native ringing and answer surface; media still uses the same accepted direct-call
session after answer.

## Source correction

Validated OTA source: `1334221b1dfbf418fba3fcaaae8757e7f5295df9`.

- The direct media session cannot start until the durable invite status is
  `accepted` and the accepted room matches the active room.
- Microphone and camera controls are hidden while the invite is still ringing.
- Media mutations are serialized. A toggle updates the negotiated track and
  emits one bounded presence/broadcast change without a snapshot-refresh loop.
- An old Realtime channel cleanup can no longer clear a newer channel reference.
- Media controls are temporarily disabled while a change is queued; End Call
  remains independently available.
- Toggle failure copy states that the call remains connected.

Dedicated semantics cover accepted-only activation, ringing exclusion, serialized
control changes, absence of the former snapshot loop, and bounded server timeout
cleanup.

## Durable timeout cleanup

Migration `20260719213953_expire_stale_chilly_chat_calls` is deployed and linked.
The existing one-minute `chilly-chat-call-transition-retry` worker is active at
version 5 and now expires stale ringing invites in batches capped at 10 through
the existing durable transition path. It records the terminal event/delivery,
closes the communication room, clears the thread's active-call pointer, and
preserves delivery history. Client execution is denied.

The pre-deployment stale population drained from 47 to zero through the bounded
scheduler. Final sanitized readback showed zero expired ringing invites and zero
pending, failed, stale-dispatching, or capped terminal retries.

## Validation and delivery

- Node 20 install, lint, TypeScript, runtime validation, all requested call,
  notification, iOS, Android, LiveKit, and autonomy guards/proofs passed.
- Expo Doctor passed 18/18.
- Deno check passed for the modified retry worker.
- Local Supabase reset passed; pgTAP passed 6 files / 270 assertions.
- All 10 PR checks passed, including Android Regression Guards and Supabase
  Database Integration.
- iOS QA OTA: group `e83cdc3e-d6d6-4f75-8116-decb3c36bed8`, update
  `019f7c68-4ae1-73e4-aa50-5c1774c3562a`, branch/channel `ios-qa`, runtime
  `1.0.0-iosqa1`, platform iOS only.
- Android OTA: group `069307c0-4f92-4ebc-acc6-d4f83410e900`, update
  `019f7c6a-92b3-7cbe-9c63-f5b6310691dd`, branch/channel `production`, runtime
  `1.0.0`, platform Android only.

Rollback targets are iOS group `05a795c8-50da-44f2-b158-9512e22db1ad` and
Android group `e03823f6-ec5a-436b-b10d-57cbf3f644c7`. Roll back only the affected
platform update and leave the durable migration/audit history intact; a database
correction must be forward-only.

## Remaining physical proof

Source, database, and delivery validation do not prove the device behavior. On
both phones, fully close and reopen the app after the OTA downloads, then verify:

1. the caller remains in a ringing state without joining media before acceptance;
2. the receiver accepts once and both sides enter the same video session;
3. repeated microphone off/on and camera off/on changes do not disconnect either
   participant;
4. caller and receiver can each end the active call and both surfaces close;
5. cancel, decline, and timeout remove the ringing banner and leave no retry
   backlog; and
6. iOS video uses the intended speaker/audio route.

No physical pass is claimed by this closeout.
