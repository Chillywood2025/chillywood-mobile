# Google-Signed v78 Native Answer Action Fix

Status: Blocked for final installed two-phone closure.

## Executive Summary

The native Android outside-app Chi'lly Chat CallStyle notification now has a source/native fix for the broken `Answer` handoff. The failure was not ringtone/channel delivery: the notification appeared, rang, vibrated, and showed `Decline` / `Answer`, but tapping `Answer` only stopped ringing and did not open/join the call.

The fix was built as Google Play internal v78 and submitted successfully. `R5CR120QCBF` updated through Google Play to v78. Final installed proof is blocked because `R3CXA0DS5JV` is not visible over ADB or Mac USB enumeration in the current session.

## Root Cause

Native `Answer` used a broadcast PendingIntent, cleared the notification, and then attempted to start the app Activity from the broadcast receiver. On outside-app/lock-screen Android, that can consume the action without reliably delivering the deep link to the app. The JS route never receives the valid `nativeCallAction=answer`, `callInviteId`, `threadId`, and `openCall=1` handoff, so the caller remains ringing.

## Source / Native / Guard Changes

- `plugins/withChillyChatNativeCallNotifications.js`: native `Answer` now uses an Activity PendingIntent directly: `buildActivityPendingIntent(context, data, "answer", 1)`.
- `app/chat/[threadId].tsx`: accepted/declined calls dismiss matching presented Android call notifications after safe invite handling.
- `scripts/guard-chilly-chat-call-push-policy.mjs`: guards the native Answer Activity PendingIntent and post-handling notification cleanup.
- `scripts/guard-notification-room-call-policy.mjs`: guards the same native Answer and cleanup requirements.

Decline stays on the native broadcast action. No WebRTC/media setup, room routing, Money Center, provider setup, live money, payouts/cashout, auth/RLS, or native channel/ringtone behavior was changed.

## Validation

Passed:

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
- `npm run typecheck`
- `npm run validate:runtime`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

## Build / Submit Result

- Source commit: `6c3fbdef23d8ccf9bef90c26d7b6dea33c409b02`
- EAS Build: `e01b708a-d049-421b-a16b-1bb1e5399e47`
- VersionCode: `78`
- VersionName: `1.0.0`
- RuntimeVersion: `1.0.0`
- Artifact type: Android App Bundle
- EAS Submit: `1a7f765c-2c34-4cab-8fb6-d10bb422e976`
- Track: Google Play internal testing only
- Result: submitted successfully

No Play production submission happened.

## Installed Device Result

- `R5CR120QCBF`: Google Play-installed v78, package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, lastUpdateTime `2026-07-04 13:16:58`.
- `R3CXA0DS5JV`: not visible over ADB or Mac USB enumeration after non-destructive ADB restart and repeated polling.

Two-phone installed proof remains blocked until R3 or another owner-approved Google Play-installed physical device is visible.

## Required Remaining Proof

Run on two Google Play-installed v78+ physical devices:

- Background voice `Answer` opens/joins the valid call and caller leaves ringing state.
- Background video `Answer` opens/joins the valid call and caller leaves ringing state.
- Native `Decline` still clears safely.
- Stale/expired/declined notifications cannot answer an old call.
- Same-thread Accept still works and does not land in `This communication room is unavailable`.
- Normal in-app outside-thread full modal still works.
- Room-safe compact banner, Reply in Chat, and Leave room and answer still work.

## Safety

No sideload, `adb install`, logout, clear data, uninstall, reinstall, Play production submission, Money Center change, provider mutation, live money, payout/cashout change, auth/RLS weakening, broad WebRTC/media rewrite, or broad room-routing change happened. No raw token, service-account value, private email, user id, provider id, credential, or signed URL is committed here.

## Artifacts

- `/tmp/google-play-internal-v77-native-answer-action-fix-20260704-124252/`
