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

Call-control source: `1334221b1dfbf418fba3fcaaae8757e7f5295df9`.
Final OTA activation/native-compatibility source:
`3f3b6695cd2daa8653d14ab110c4222913a94d89`.

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
- Final iOS QA OTA: group `38ee9039-e53d-462f-b396-6bb49e639839`, update
  `019f7ca4-55c4-793c-8702-20af64a8efc5`, branch/channel `ios-qa`, runtime
  `1.0.0-iosqa1`, platform iOS only.
- Final Android OTA: group `f4172575-e0bf-4909-b534-9e5e9a11cc93`, update
  `019f7ca6-9b70-75b8-9777-18dbc328fcca`, branch/channel `production`, runtime
  `1.0.0`, platform Android only.

Rollback targets are iOS group `e39980d0-090a-4204-a910-7882395a8f0c` and
Android group `52940abe-e1d4-4764-a579-b6718364c7d0`. Roll back only the affected
platform update and leave the durable migration/audit history intact; a database
correction must be forward-only.

## Runtime and OTA activation correction

Runtime version is only the compatibility namespace. It does not identify the
active JavaScript bundle; multiple updates can share one runtime, and the exact
running bundle is identified by `updateId`. The former updater persisted its
reload-suppression fingerprint before the reload actually ran, so an interrupted
reload could leave a downloaded update inactive across later app processes. The
final updater observes Expo's native downloaded-update state, deduplicates only
in memory for the current process, reloads without an interaction-queue
dependency, and permits a later retry after failure.

Android build 80 was independently read back as EAS build
`4c27d4a2-1b54-48d0-93a2-266c3c430dae`, source
`08fd60e29a5040672c9f9dc91befc9142861d82e`. It predates the native
`expo-image-manipulator` module. A first activation-fix bundle therefore exposed
an existing native-boundary error and crashed at startup. Production was restored
to the last build-80-compatible bundle while the import was moved behind the
HEIC-only path. Ordinary startup and JPG/PNG uploads no longer load the absent
module; HEIC/HEIF conversion fails closed with retry guidance on build 80. CI now
runs `guard:ota-native-boundary`, tied to the provider-observed build source, so
the module cannot return to Android startup through a later OTA.

The superseded Android groups `bfce1629-6ef1-4f48-b827-4f9e8f364246` and
`7d4e8224-73c4-48dc-9d7a-bbd861a7112d` must not be used as rollback targets.
Both connected Android devices were relaunched without screenshots and their
in-app diagnostics showed the exact final update, production channel, and
runtime `1.0.0`; fatal, missing-module, JavaScript-fatal, and updater-error log
checks were clear. iOS provider publication is proven, but physical iOS uptake
of the final update remains unclaimed.

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
