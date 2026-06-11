# Chi'lly Chat Call Notification and Ringtone System

Date: 2026-06-10

## Summary

Chi'lly Chat now has a bounded call-invite UX layer on top of the existing direct chat and communication room primitives. The implementation keeps LiveKit, communication room token authority, Premium gates, Watch-Party routes, Player behavior, storage, and auth flows unchanged.

The new layer adds:

- member-only call invite records for ringing, accepted, declined, missed, canceled, ended, and busy states
- member-only call event records for compact call history cards inside a thread
- an in-app incoming call sheet for active recipients
- accept/decline/timeout behavior with vibration cleanup
- call-specific Android notification channels
- Chi'lly Chat call settings for alert enablement, vibration, and ringtone preference
- ringtone option labels for Chi'lly Ring, Skyline Pulse, Theater Bell, Velvet Knock, Quiet Buzz, Classic Phone, and Silent / Vibrate Only
- bundled CC0 WAV assets for Chi'lly Chat call sounds, documented in `docs/CHILLY_CHAT_SOUND_LICENSES.md`

## What Changed

Files touched:

- `supabase/migrations/202606100001_chilly_chat_call_invites_and_ringtones.sql`
- `supabase/database.types.ts`
- `_lib/chillyChatCalls.ts`
- `_lib/chillyChatCallSoundAssets.ts`
- `_lib/chat.ts`
- `_lib/notifications.ts`
- `app/chat/[threadId].tsx`
- `app/settings.tsx`
- `assets/sounds/chilly-chat/*.wav`
- `android/app/src/main/res/raw/*.wav`
- `docs/CHILLY_CHAT_SOUND_LICENSES.md`

## Data Model

`chat_call_invites` stores the call invite state:

- `thread_id`
- `communication_room_id`
- `caller_user_id`
- `callee_user_id`
- `call_type`
- `status`
- `expires_at`
- accepted/ended timestamps

`chat_call_events` stores thread-visible call history:

- started
- accepted
- declined
- missed
- canceled
- ended
- busy

RLS uses existing `can_access_chat_thread(thread_id)` membership checks. Normal users cannot inspect unrelated call invites or events.

## In-App Call UX

When a direct thread receives a ringing invite for the current user, the thread shows an incoming Chi'lly Chat call sheet:

- caller avatar or initial
- caller display name
- Incoming voice/video label
- Decline
- Accept
- 45-second timeout to missed call

Accept marks the invite accepted and opens the existing communication room surface. Decline marks the invite declined and clears the active thread call. Timeout marks the invite missed. The existing communication room creation/join/leave path is unchanged.

## Ringtone Behavior

Current V1 behavior:

- user can choose a Chi'lly Chat ringtone preference in Settings
- user can toggle call alerts and vibration
- in-app call alerts play the selected bundled sound unless Silent / Vibrate Only is selected
- ringtone preview plays the selected bundled sound in Settings
- Silent / Vibrate Only does not play in-app ringtone audio
- downloaded/imported sounds remain in-app-only for V1
- if an in-app selected sound fails, the app falls back to Chi'lly Ring

Native-build requirement:

- bundled background push notification sounds are configured through the Expo notifications config plugin
- OTA updates alone cannot add new native notification-channel sounds; a new native/internal Android build is required
- Android channel sound/importance behavior is ultimately controlled by Android and the user's channel settings after the channel exists
- the old `chilly_chat_calls` Android channel may already exist on tester devices without a custom sound, so future call notifications should use the versioned `chilly_chat_calls_v2` channel

Bundled sound files:

- `assets/sounds/chilly-chat/chilly_ring.wav`
- `assets/sounds/chilly-chat/skyline_pulse.wav`
- `assets/sounds/chilly-chat/theater_bell.wav`
- `assets/sounds/chilly-chat/velvet_knock.wav`
- `assets/sounds/chilly-chat/quiet_buzz.wav`
- `assets/sounds/chilly-chat/classic_phone.wav`

Because this repo has a checked-in Android native project, the same bundled sounds are also committed under `android/app/src/main/res/raw/` with Android-safe underscore filenames. This avoids relying on config-plugin resource copying during native builds that use the existing `android/` directory.

## Push Notification Readiness

The app now creates Android channels:

- `chilly_chat_messages`
- `chilly_chat_calls_v2`
- `chilly_chat_missed_calls`

`chilly_chat_calls_v2` uses `chilly_ring.wav` as its bundled native sound where Android and the installed native build support it. Messages and missed-call channels stay calmer and do not use the call ringtone.

Notification tap routing already accepts `/chat/...` deep links, including an `openCall` query if the server dispatch path sends it later. This pass does not add service-role secrets to mobile code and does not log push tokens. The existing `notification-dispatch` Edge Function is still a discovery/activity dispatcher and does not yet dispatch Chi'lly Chat call pushes; a future call-push dispatcher should use `chilly_chat_calls_v2`.

## Safety

The implementation does not:

- change LiveKit token issuer logic
- grant publish permission from a call invite
- grant host/speaker/mod/admin authority
- change Watch-Party Live or Live Stage route ownership
- change Premium gates
- change content safety
- store service-role keys, Brevo keys, Supabase management tokens, or provider secrets in mobile code

## Validation

Passed:

- `npm run typecheck`
- `npm run validate:runtime`
- `git diff --check`
- `git diff --cached --check`

Required before production claim:

- two-user Android proof with both users in Chi'lly Chat
- background notification proof after backend dispatch wiring is available
- native/internal Android build proof for the bundled background push channel sound

## Remaining Gaps

- Bundled notification sounds are configured, but background push ringtone behavior is not proven until a new native/internal Android build is installed.
- Background call push dispatch is channel-ready but still needs the approved server dispatch path for call invites.
- Two-user device proof is required to prove recipient incoming sheet, accept/decline, and missed-card behavior.
- Dynamic downloaded sounds are intentionally not promised for Android background push notifications in V1.
