# Google-Signed v79 Native Answer Action Fix

Status: Closed after installed proof.

## Executive Summary

Google Play internal v79 includes the narrower native Answer handoff fix and was installed through Google Play on both physical phones. The previous failure was reproduced as a native Answer handoff issue, not a ringtone/channel issue: outside-app CallStyle notifications rang, vibrated, and showed `Decline` / `Answer`, but `Answer` could stop ringing without opening/joining the call.

v79 installed proof closed the critical native Answer behavior for background voice and video calls: the receiver's Android CallStyle notification opened/joined the valid call, and the caller left the stuck ringing state. Native Decline also cleared both sides, same-thread Accept no longer landed in `This communication room is unavailable`, and the normal in-app outside-thread surface showed the full app-wide incoming-call modal and answered correctly.

The remaining room-safe regression was closed in the follow-up proof documented at `docs/release/GOOGLE_SIGNED_V79_ROOM_SAFE_INCOMING_CALL_REGRESSION_PROOF.md`. Using the owner-approved Google Play / RevenueCat sandbox Premium path on `R5CR120QCBF`, the receiver reached Watch-Party `Party Waiting Room`; the installed v79 app showed the compact room-safe banner with `Decline`, `Reply in Chat`, and `Leave room and answer`, preserved room state on Decline, opened chat without auto-answer on Reply in Chat, confirmed before Leave room and answer, then joined the call with both phones reaching `2 in call`.

## Root Cause

The native Answer handoff needed an explicit Activity deep-link launch and robust JS cold-start handling. Native action data had to preserve `nativeCallAction=answer`, `callInviteId`, `threadId`, and `openCall=1`, and the chat route had to wait for auth/thread readiness before reading and validating the current ringing invite.

## Source / Native / Edge Changes

- `plugins/withChillyChatNativeCallNotifications.js`: native Answer/Decline app-open intents now use explicit `ACTION_VIEW` deep links with browsable/default categories and preserved action extras.
- `app/chat/[threadId].tsx`: native Answer is queued until route/auth readiness, directly reads the requested invite, validates callee/thread/current state, and uses the same safe accept path as in-app Accept.
- `scripts/guard-chilly-chat-call-push-policy.mjs`: guards the native action deep-link fields and direct invite readback/validation.
- `scripts/guard-notification-room-call-policy.mjs`: guards native answer validation and stale-call safety expectations.

No Edge function change was needed in this v79 source commit.

## Validation

Passed before build:

- `deno check supabase/functions/chilly-chat-call-dispatch/index.ts`
- `deno check supabase/functions/notification-device-tokens/index.ts`
- `npx expo prebuild --platform android --no-install`
- `./gradlew :app:compileDebugKotlin`
- `npm run guard:notification-room-call-policy`
- `npm run guard:chilly-chat-call-push-policy`
- `npm run guard:chat-call-moderation-notification-policy`
- `npm run guard:notification-action-retention-policy`
- `npm run proof:room-safe-notification-and-call-behavior`
- `npm run proof:notification-icon-surface-wiring`
- `npm run proof:important-notification-accessibility`
- `npx tsc --noEmit`
- `npm run validate:runtime`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

`npm run typecheck` ran TypeScript successfully, then failed in the existing Android launcher icon guard after prebuild-generated ignored native icon files were present. No tracked launcher icon files changed in this lane.

## Build / Submit / Deploy Result

- Source commit: `5c210fa52b3c95f2047295c9e0f696db42f48002`
- EAS Build: `8a144cae-959f-4acb-9266-8bf7bf2c94f8`
- VersionCode: `79`
- VersionName: `1.0.0`
- RuntimeVersion: `1.0.0`
- Artifact type: Android App Bundle
- EAS Submit: `db1e81e4-cd7c-4113-81f1-c05fe2cda6ed`
- Track: Google Play internal testing only
- Result: submitted successfully

No Play production submission happened.

## Device Play Install Result

Both phones updated only through Google Play:

- `R5CR120QCBF`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`, lastUpdateTime `2026-07-04 18:10:32`.
- `R3CXA0DS5JV`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`, lastUpdateTime `2026-07-04 18:10:33`.

No sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

## Installed Proof Results

- Background voice Answer: Closed. Receiver outside the app got active CallStyle notification on `chilly_chat_calls_fullscreen_v1` with `Decline` and `Answer`; tapping `Answer` opened/joined the valid voice call, and the caller moved out of ringing into active call state.
- Background video Answer: Closed. Receiver outside the app got active CallStyle notification with `Decline` and `Answer`; tapping `Answer` opened/joined the valid video call, and both phones showed active video call state with `2 in call`.
- Native Decline: Closed. Receiver used the native `Decline` action; receiver did not join, the active notification cleared, and the caller returned to `No Active Call`.
- Stale Answer safety: Closed for the declined-call path proved in this pass. After native Decline, no active answerable call notification remained to join.
- Same-thread Accept: Closed. Receiver in the same direct thread got the full in-app incoming call card; tapping `Accept` joined without `This communication room is unavailable`, and after realtime settled both phones showed `2 in call` and `Connected`.
- Normal in-app outside-thread: Closed. Receiver on Settings got the full `app-wide-incoming-call-modal` with `Answer`, `Decline`, and `Reply in Chat`; tapping `Answer` joined the valid call, and after realtime settled both phones showed `2 in call` and `Connected`.
- End Call cleanup: Closed for the voice/video calls exercised in this pass; both devices returned to `No Active Call`.

## Remaining Proof Gaps

- Separate locked-screen visual takeover beyond active CallStyle/fullscreenIntent permission remains a separate Android policy/device proof item if required.
- iOS call behavior is not claimed from Android v79 proof.

## Safety

No Play production submission, sideload, `adb install`, logout, clear data, uninstall/reinstall, Money Center change, provider mutation, live money, payout/cashout change, auth/RLS weakening, broad WebRTC/media rewrite, or broad room-routing change happened. No raw token, service-account value, private email, user id, provider id, credential, or signed URL is committed here.

## Artifacts

- `/tmp/google-play-internal-v77-native-answer-action-fix-20260704-124252/v79-build-submit-proof-20260704-174313/`
- `/tmp/google-play-internal-v79-room-safe-incoming-call-regression-proof-20260704-203344/`
