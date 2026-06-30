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

Notification tap routing accepts `/chat/...` deep links, including `openCall` context from the dedicated `chilly-chat-call-dispatch` path. This pass does not add service-role secrets to mobile code and does not log push tokens. The existing `notification-dispatch` Edge Function remains a discovery/activity dispatcher; Chi'lly Chat call pushes use the dedicated server-side call dispatch path and the `chilly_chat_calls_v2` / `chilly_chat_missed_calls` channels.

## Native Android Proof

Proof path: `/tmp/chillywood-chilly-chat-sounds-native-proof-20260611/`

EAS cloud build `4110adeb-260d-41fa-841b-33a24ef15869` finished from commit `cc877432cbfca5ff29bd29996b72bd6f406c6273`, profile `production-apk`, channel `production`, runtime `1.0.0`, app version `1.0.0`, and Android versionCode `32`.

The cloud APK was installed on physical device `R5CR120QCBF` after removing the previous Google Play-signed install because Android rejected an in-place APK update with a signature mismatch. This proof therefore verifies the EAS internal APK runtime directly; tester distribution through Google Play internal testing still requires an AAB/internal-track rollout signed by Play.

Native proof captured:

- APK contains bundled `.wav` resources under release `res/*.wav` resource entries.
- Installed package reports `com.chillywood.mobile`, versionName `1.0.0`, versionCode `32`.
- Installer reports `null` for this proof install because it was a direct EAS APK install, not Google Play.
- Android notification service created `chilly_chat_messages`, `chilly_chat_calls_v2`, `chilly_chat_missed_calls`, and `default`.
- `chilly_chat_calls_v2` reports importance `5`, vibration `[0, 400, 180, 400]`, and sound `android.resource://com.chillywood.mobile/raw/chilly_ring`.

This closes the native resource/channel proof for bundled background call notification sound configuration. It does not prove two-user call delivery or server-side background call push dispatch.

## Play Internal Rollout

Google Play internal rollout preparation is complete for the bundled Chi'lly Chat sound runtime:

- EAS AAB build: `1c36c8e1-f52d-4b6b-acb1-1602a9f8e99d`
- Commit: `e12d4d2454c1605eebd923f50679f05a7afab3e0`
- Profile: `production`
- Distribution: `STORE`
- Channel: `production`
- Runtime: `1.0.0`
- App version: `1.0.0`
- Android versionCode: `34`
- Artifact type: AAB
- Artifact URL: `https://expo.dev/artifacts/eas/e6rlbxaDLRAPBrEuwLen8vGrUJ-c9TVgrVa4kGnYpJw.aab`
- EAS submit profile: `production`
- Google Play track: `internal`
- EAS submission: `3a430e53-4ff2-4455-b041-4646a615ff1a`
- Submit result: `Submitted your app to Google Play Store`

This is not yet Play-installed runtime proof. The remaining proof must install or update through Google Play internal testing, confirm installer `com.android.vending`, confirm versionCode `34`, and then re-check `chilly_chat_calls_v2` on the Play-installed app.

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

- Play/internal installed runtime proof for versionCode `34`
- two-user Android proof with both users in Chi'lly Chat
- background notification proof through the dedicated server dispatch path on a Play/internal runtime
- BrowserStack proof if required for cross-device release evidence

## Remaining Gaps

- Bundled notification sounds are configured and native Android channel creation is proved on the EAS internal APK runtime. Google Play internal AAB build and submit are complete, but Play-installed tester pickup still needs device proof from installer `com.android.vending`.
- Background call push dispatch now has the approved dedicated server dispatch path for call invites; remaining work is Play/internal two-user runtime proof, background/locked-device proof, and channel migration readback.
- Two-user device proof is required to prove recipient incoming sheet, accept/decline, and missed-card behavior.
- BrowserStack proof remains pending.
- Dynamic downloaded sounds are intentionally not promised for Android background push notifications in V1.

## Room-Safe Incoming Call Behavior

June 30, 2026 source integration adds room-safe foreground handling for incoming Chi'lly Chat voice/video calls. Incoming Chi'lly Chat calls do not auto-answer. Incoming calls do not auto-leave or hijack room mic/camera. Leave room and answer requires explicit user action. Hosts receive an extra confirmation before leaving a hosted live room.

Inside Watch-Party and Live Stage surfaces, the foreground call banner offers Decline, Reply in Chat, and Leave room and answer. Decline uses the existing call-invite decline path. Reply in Chat opens the relevant thread or Chat inbox without answering. Leave room and answer routes into the chat call path only after explicit user action and relies on room unmount/route ownership to release the existing room session rather than starting a competing RTC session.

Notification bell is icon-only. Bell badge is backed by real notification unread summary. Room/live surfaces use room-safe notification tray/banner behavior. Chat remains conversation-only. Notifications guide users to routes; they do not grant access. Destination routes re-check access. liveMoneyEnabled remains OFF. Payouts and cashout remain OFF.
