# Google-Signed v77 Native CallStyle Full-Screen Proof

## July 4, 2026 v79 Native Answer Installed Proof

Status: Partial after Google Play-installed v79 proof. The v79 source fix commit `5c210fa52b3c95f2047295c9e0f696db42f48002` was built as EAS Build `8a144cae-959f-4acb-9266-8bf7bf2c94f8` and submitted to Google Play internal testing as EAS Submit `db1e81e4-cd7c-4113-81f1-c05fe2cda6ed`. Both physical phones updated through Google Play only to package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`.

Installed proof closed the native Answer handoff bug: background voice and background video CallStyle notifications showed `Decline` / `Answer`, tapping `Answer` opened/joined the valid call, caller state moved out of ringing, and End Call returned both sides to `No Active Call`. Native `Decline` cleared the active notification and caller state. Same-thread Accept no longer landed in `This communication room is unavailable`; after realtime settled both phones showed `2 in call` and `Connected`. Normal in-app outside-thread Settings showed the full app-wide incoming-call modal with `Answer`, `Decline`, and `Reply in Chat`, and Answer joined correctly.

Remaining Partial item: v79 room-safe compact-banner regression was not closed because no usable room-safe surface was reachable without changing room/account state. `/watch-party` hit Premium gate, `/watch-party/live-stage` showed `Live room unavailable`, visible room code `XQBBRE` returned `Room not found`, and `/communication` resolved to Chi'lly Chat inbox. Artifact folder: `/tmp/google-play-internal-v77-native-answer-action-fix-20260704-124252/v79-build-submit-proof-20260704-174313/`.

Follow-up room-safe-only rerun on July 4, 2026 is Blocked by device availability: `R3CXA0DS5JV` is not visible over ADB or Mac USB enumeration, so fixture discovery and the two-device room-safe banner/action matrix could not run. Artifact folder: `/tmp/google-play-internal-v79-room-safe-incoming-call-regression-proof-20260704-202158/`.

## July 4, 2026 v78 Native Answer Handoff Fix

Status: Blocked for final installed two-phone closure after source/native fix, build, submit, and one-device Play update. The user-proved failure was narrowed to the native Android CallStyle `Answer` action: the outside-app/lock-screen call notification appeared, rang, vibrated, and showed `Decline` / `Answer`, but tapping `Answer` only stopped ringing and did not open or join the call; the caller stayed in the trying/ringing state.

Root cause: the native `Answer` action used a broadcast PendingIntent and then attempted to launch the app from `ChillyChatCallNotificationActionReceiver` after clearing the notification. On background/lock-screen Android this can stop the notification without reliably starting the Activity/deep link, so the JS route never received the valid `nativeCallAction=answer`, `callInviteId`, `threadId`, and `openCall=1` handoff.

Fix commit: `6c3fbdef23d8ccf9bef90c26d7b6dea33c409b02` (`Fix native call answer handoff`).

Source/native changes:

- `plugins/withChillyChatNativeCallNotifications.js`: `Answer` now uses `buildActivityPendingIntent(context, data, "answer", 1)` so Android starts the app Activity directly with the existing answer deep link. `Decline` remains a broadcast action.
- `app/chat/[threadId].tsx`: after the invite is safely accepted or declined through the existing authenticated call path, the app dismisses matching presented Android call notifications. It does not clear native call state before invite validation.
- `scripts/guard-chilly-chat-call-push-policy.mjs` and `scripts/guard-notification-room-call-policy.mjs`: guard that native `Answer` starts the Activity directly, carries the native answer handoff, and clears presented Android notifications only after safe invite handling.

Validation passed:

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

Build / submit result:

- EAS Build: `e01b708a-d049-421b-a16b-1bb1e5399e47`
- Build profile: `production`
- Artifact type: Android App Bundle
- VersionCode: `78`
- VersionName: `1.0.0`
- RuntimeVersion: `1.0.0`
- Build commit: `6c3fbdef23d8ccf9bef90c26d7b6dea33c409b02`
- EAS Submit: `1a7f765c-2c34-4cab-8fb6-d10bb422e976`
- Track: Google Play internal testing only
- Result: submitted successfully. No Play production submission happened.

Installed proof result:

- `R5CR120QCBF` updated through Google Play only and reads back package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `78`, versionName `1.0.0`, lastUpdateTime `2026-07-04 13:16:58`.
- `R3CXA0DS5JV` is not visible over ADB or Mac USB enumeration in the current session; `adb devices -l` shows only `R5CR120QCBF` plus an emulator. Non-destructive ADB server restart and repeated polling did not recover R3.
- Final native Answer proof is not Closed because two physical Play-installed phones are required to prove background voice/video Answer, caller state moving out of ringing, stale Answer rejection, same-thread Accept regression, normal in-app regression, and room-safe regression.

Safety confirmation: no source changes touched Money Center, providers, live money, payouts/cashout, auth/RLS, broad WebRTC/media setup, broad room routing, Play production, sideloading, `adb install`, logout, clear data, uninstall, or reinstall. No private service-account value, raw token, email, user id, provider id, signed URL, or credential is committed in this doc.

Artifact folder: `/tmp/google-play-internal-v77-native-answer-action-fix-20260704-124252/`.

Status: Partial after installed two-phone closure pass - source/native implementation validated, v77 AAB published to Google Play internal testing, Google Play full-screen intent declaration saved/sent for review, and both physical phones updated through Google Play to v77. The July 4 installed pass recovered `R3CXA0DS5JV`, verified both phones are Google Play-installed v77 from `com.android.vending`, and proved active background voice/video CallStyle notifications on `chilly_chat_calls_fullscreen_v1` with Answer/Decline before missed-call conversion. Native Answer and Decline work, same-thread Accept no longer lands in `This communication room is unavailable`, and normal in-app outside-thread Settings shows the full incoming-call modal. Remaining Partial items are fresh room-safe regression proof because the old Watch-Party fixture now returns `Room not found`, a cleaner missed-call timing/expiry capture, and separate locked-screen takeover proof beyond CallStyle `fullscreenIntent`/permission readback.

Artifact folders:

- `/tmp/google-play-internal-v77-native-callstyle-fullscreen-proof-20260703-152217/`
- `/tmp/google-play-internal-v77-native-callstyle-fullscreen-proof-20260703-152217/installed-v77-callstyle-proof-20260703-203844/`
- `/tmp/google-play-internal-v78-native-callstyle-active-incoming-fix-20260703-215118/`
- `/tmp/google-play-internal-v78-native-callstyle-active-incoming-fix-20260703-215118/installed-fcm-secret-r3-recovery-proof-20260703-230212/`
- `/tmp/google-play-internal-v78-native-callstyle-active-incoming-fix-20260703-215118/installed-two-device-callstyle-proof-20260704-112837/`

## Summary

Chi'lly Chat outside-app incoming calls now have a native Android implementation path for a phone-call-like notification. Incoming call pushes are data-only and carry safe call metadata to a custom Firebase messaging service. The native service builds an Android `NotificationCompat.CallStyle.forIncomingCall` notification on `chilly_chat_calls_fullscreen_v1` with Answer and Decline actions, ringtone/vibration channel setup, timeout cleanup, and full-screen intent when Android allows it.

This is not an OTA-only fix. Full-screen lock-screen behavior and native call actions require a new Google Play internal Android build, expected v77 or newer, and installed proof from Google Play. Google Play internal install is not enough without actual user flow proof.

## Repo / Origin Alignment

- Starting repo state: `HEAD == origin/main == 5f03cd85ec3da2ff7aca7be2791c75f978a74c99`.
- Tracked tree was clean before edits.
- Pre-existing untracked artifact/temp paths remained untouched.

## Native Feasibility Result

The repo uses Expo config/prebuild with a local generated Android tree. The committed native delivery path is a bounded Expo config plugin, not hand-committed generated Android files. The plugin adds the manifest entries, Gradle dependencies, Firebase messaging service override, React Native module, and Kotlin notification/action handlers during the Android build. The app previously used Expo's default Firebase messaging service only. This lane replaces that service entry with a subclass that intercepts only Chi'lly Chat native incoming-call data pushes and forwards all other pushes to Expo.

Android CallStyle/full-screen behavior is bounded by Android policy and user settings. Android 14+ can deny full-screen intent permission; when denied, the app must fall back to a high-priority call notification and document the blocker.

## Source Files Changed

- `_lib/chillyChatCallSoundAssets.ts`
- `_lib/notifications.ts`
- `app/chat/[threadId].tsx`
- `app/settings.tsx`
- `app.config.ts`
- `app.json`
- `plugins/withChillyChatNativeCallNotifications.js`
- `supabase/functions/chilly-chat-call-dispatch/index.ts`
- `supabase/functions/notification-device-tokens/index.ts`
- `scripts/guard-chilly-chat-call-push-policy.mjs`
- `scripts/guard-notification-room-call-policy.mjs`

## Native Android Files Generated By Plugin

- `android/app/build.gradle` dependency additions
- `android/app/src/main/AndroidManifest.xml` permission/service/receiver additions
- `android/app/src/main/java/com/chillywood/mobile/MainApplication.kt` package registration
- `android/app/src/main/java/com/chillywood/mobile/ChillyChatCallNotifications.kt`
- `android/app/src/main/java/com/chillywood/mobile/ChillyChatFirebaseMessagingService.kt`
- `android/app/src/main/java/com/chillywood/mobile/ChillyChatCallNotificationActionReceiver.kt`
- `android/app/src/main/java/com/chillywood/mobile/ChillyChatCallNotificationModule.kt`
- `android/app/src/main/java/com/chillywood/mobile/ChillyChatCallNotificationPackage.kt`

These files are generated by `plugins/withChillyChatNativeCallNotifications.js` during prebuild/EAS native build. The ignored local `android/` tree was used only for compile proof and is not counted as the committed delivery path.

## Android Manifest / Permission Result

- Adds `android.permission.USE_FULL_SCREEN_INTENT`.
- Registers `ChillyChatFirebaseMessagingService`.
- Removes Expo's original Firebase messaging service entry with `tools:node="remove"` to avoid duplicate handling.
- Registers `ChillyChatCallNotificationActionReceiver`.
- Keeps package id `com.chillywood.mobile`.

## CallStyle Notification Result

- New channel id: `chilly_chat_calls_fullscreen_v1`.
- Native channel uses high importance, public lock-screen visibility, ringtone audio attributes, and vibration.
- Incoming call notification uses `NotificationCompat.CallStyle.forIncomingCall`.
- Answer and Decline are native notification actions.
- Passive notification tap opens an answerable incoming-call route and does not auto-answer.
- Native Answer/Decline deep-link into the existing authenticated `/chat/[threadId]` route.
- JS accepts/declines only if the route `callInviteId` matches the current ringing invite for the signed-in callee.
- Stale, declined, expired, or mismatched calls must not be answered.

## Full-Screen Intent Permission Result

Settings -> Notifications -> Chi'lly Chat calls now includes `Full-screen call alerts`:

- `On` when Android allows full-screen call alerts.
- `Needs Android permission` when Android 14+ denies full-screen intent permission.
- `Build update needed` on old v76/OTA binaries without the native module.
- `Open Android call alert settings` opens Android's full-screen call alert settings where supported.

## Server / Push Dispatch Result

Initial v77 server work sent incoming calls as data-only Expo pushes with `nativeCallStyle=android_callstyle`, `threadId`, `callInviteId`, caller copy, and route data. Installed proof showed that path did not produce the native Android CallStyle notification before missed-call conversion.

The follow-up active incoming-call fix changes the server/client path:

- Android registers its native FCM token with `provider=fcm` alongside the Expo token.
- Settings readback can show a safe native call fingerprint without exposing the raw token.
- Active incoming Chi'lly Chat calls prefer direct FCM HTTP v1 data delivery with `nativeCallStyle=android_callstyle`, `callInviteId`, `threadId`, `callType`, route, and safe caller copy.
- Missed calls remain on the normal Expo notification title/body/channel path.
- Active incoming calls are not counted as delivered from a missed-call notification or Expo fallback.
- Disabling the current device registration revokes both Expo and native FCM tokens for the install.
- Same-thread/native Accept re-reads the current ringing invite and active communication room before accepting.

No service-role key is exposed to clients. Service-role use remains server-side only in the Edge Function. No auth/RLS policy was weakened.

## Validation Results

Passed so far:

- `deno check supabase/functions/chilly-chat-call-dispatch/index.ts`
- `deno check supabase/functions/notification-device-tokens/index.ts`
- `npm run guard:chilly-chat-call-push-policy`
- `npm run guard:notification-room-call-policy`
- `npm run guard:chat-call-moderation-notification-policy`
- `npm run guard:notification-action-retention-policy`
- `npm run proof:room-safe-notification-and-call-behavior`
- `npm run proof:notification-icon-surface-wiring`
- `npm run proof:important-notification-accessibility`
- `npx tsc --noEmit`
- `npm run validate:runtime`
- `supabase db push --dry-run`
- `npx expo prebuild --platform android --no-install`
- `./gradlew :app:compileDebugKotlin`

`npm run typecheck` executed TypeScript successfully but failed afterward on the existing Android launcher icon hash policy guard. No Android launcher icon files are changed in this lane.

## Build Result

- EAS Build ID: `f888abdb-4154-40b8-91a3-2b410f58aa75`
- Build profile: `production`
- Artifact type: Android App Bundle
- VersionName: `1.0.0`
- VersionCode: `77`
- RuntimeVersion: `1.0.0`
- Commit: `fab16ef96368a637f96846846d4717d57d2ebb5e`
- Build status: `FINISHED`
- Build message: `Native Chilly Chat CallStyle notifications`

This is the required native build path because the lane changes Android manifest, Firebase messaging service, notification channel creation, and native notification actions.

## Google Play Internal Submission Result

- EAS Submit ID: `47d90002-524f-41b7-968e-e975368d1285`
- EAS retry Submit ID: `f596f244-87c4-47bc-9561-2628f891bf37`
- Track requested: Google Play `internal`
- Result: blocked by Google Play app-content policy before the Play Console declaration was exposed
- Blocking error: `You must let us know whether your app uses any full-screen intent permissions`

The build declares `android.permission.USE_FULL_SCREEN_INTENT`, so Google Play requires the full-screen intent declaration. After the API submit retry failed with the same blocker, the same existing v77 AAB from EAS Build `f888abdb-4154-40b8-91a3-2b410f58aa75` was uploaded through the Google Play internal-testing release UI. Play accepted/published that internal release and then exposed the App Content `Full-screen intent` declaration.

Manual Play Console internal release result:

- Track: Google Play `internal`
- VersionCode: `77`
- VersionName: `1.0.0`
- Result: `77 (1.0.0)` available to internal testers
- Release timestamp shown by Play Console: July 3, 2026 8:10 PM local time
- Only internal testing was changed. No Play production submission happened.

## Play Console Full-Screen Intent Declaration Result

Google Play App Content exposed the `Full-screen intent` declaration after the v77 AAB was accepted in the internal release UI.

Declaration selections:

- Core functionality: `Making and receiving calls`
- Install behavior / pre-grant opt-in: `Yes`

Declaration scope:

- Chi'llywood uses `USE_FULL_SCREEN_INTENT` only for real-time incoming Chi'lly Chat voice and video calls.
- It is not used for ads, marketing, promotions, creator-money notifications, tips, event reminders, normal Activity alerts, or other non-urgent notifications.
- If Android or the user does not allow full-screen call alerts, the app falls back to a high-priority call notification.

Declaration status:

- Saved in Play Console.
- Sent for Google Play review from Publishing overview.
- Publishing overview showed `Changes in review` for `Full-screen intent - Complete Full-screen intent declaration`.

## Device / Installed Proof Result

Installed proof artifact subfolder: `/tmp/google-play-internal-v77-native-callstyle-fullscreen-proof-20260703-152217/installed-v77-callstyle-proof-20260703-203844/`.

Both physical phones updated through Google Play only:

- `R5CR120QCBF`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `77`, versionName `1.0.0`, lastUpdateTime `2026-07-03 20:40:28`.
- `R3CXA0DS5JV`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `77`, versionName `1.0.0`, lastUpdateTime `2026-07-03 20:40:32`.

Android environment readback:

- Both devices remained attached/authorized over ADB.
- Both packages include `android.permission.USE_FULL_SCREEN_INTENT`; `dumpsys package` readback showed it granted.
- Both packages register `com.chillywood.mobile/.ChillyChatFirebaseMessagingService`.
- Both devices had DND/Zen `0` during proof.
- R5 had notification/ring/media volume nonzero for the receiver proof.
- R5 Settings -> Notifications -> Chi'lly Chat calls showed `Full-screen call alerts` = `On` and identified channel `chilly_chat_calls_fullscreen_v1`.
- Channel `chilly_chat_calls_fullscreen_v1` existed with high importance, system ringtone sound, ringtone audio attributes, and vibration enabled.

Installed behavior proved:

- Normal in-app outside-thread surface: R5 on Settings received the full app-wide incoming voice-call modal with `Decline`, `Answer`, and `Reply in Chat`; it did not show the compact room-safe banner. Decline returned R5 to Settings and R3 to `No Active Call`.
- Same-thread incoming UI appeared on R5 after an R3 -> R5 voice call retry with `Decline` and `Accept`, proving the full same-thread incoming-call card still renders.

Installed blockers found:

- Same-thread `Accept` was not end-to-end Closed: R5 accepted, but landed on `Voice call active` with `1 in call`, `Connecting`, and `This communication room is unavailable`; R3 had already cleared to `No Active Call`.
- Background/outside-app CallStyle was not Closed: with R5 outside the app and R3 calling, Android showed a `Missed Chi'lly Chat voice call` notification under `chilly_chat_missed_calls`, not an active `chilly_chat_calls_fullscreen_v1` CallStyle notification with Answer/Decline actions. The notification shade showed no Answer/Decline actions while R3 still showed `1 in call`.
- Locked-screen video, native Answer action, native Decline action, stale/expired call rejection, and full room-safe regression were not counted Closed because the background voice path failed first.

## Active Incoming Fix / Deploy Result

Follow-up source/Edge/OTA fix:

- Root cause: v77 native files were present, but the active incoming-call push path still relied on Expo/data delivery. The native Firebase service did not receive an active direct FCM data message, so the receiver only saw the later missed-call notification.
- Edge functions deployed: `notification-device-tokens` and `chilly-chat-call-dispatch`.
- EAS Update branch: `production`
- Runtime: `1.0.0`
- Update group: `9e0d00e8-e6cc-40e0-a4f2-7e9712b2fc0f`
- Android update: `019f2b09-1d13-7090-b307-917d221b7c7b`
- Message: `Fix native active incoming call delivery`
- No new native build was created because the v77 Google Play binary already contains `ChillyChatFirebaseMessagingService`, the full-screen permission, native channel creation, and native Answer/Decline action handlers.

## FCM Secret / R3 Recovery Pass

Artifact subfolder: `/tmp/google-play-internal-v78-native-callstyle-active-incoming-fix-20260703-215118/installed-fcm-secret-r3-recovery-proof-20260703-230212/`.

Results:

- Repo/origin were aligned at `e9021fa5053a5f16ac8236abeb21caebba75fff4` before proof.
- Supabase secret `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` exists by name only. The secret value, private key, client email, and raw service-account JSON were not printed, committed, or documented.
- `chilly-chat-call-dispatch` was redeployed after the secret was added.
- `deno check supabase/functions/chilly-chat-call-dispatch/index.ts` passed.
- `deno check supabase/functions/notification-device-tokens/index.ts` passed.
- R5 package readback: `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `77`, versionName `1.0.0`, lastUpdateTime `2026-07-03 20:40:28`.
- R5 Settings readback showed registered Expo/native call push status, redacted `Device fingerprint`, redacted `Native call fingerprint`, `Full-screen call alerts` = `On`, and channel `chilly_chat_calls_fullscreen_v1`.
- R5 Android environment readback: DND/Zen `0`, ring/notification/media streams non-muted and nonzero.
- R5 notification channel readback: `chilly_chat_calls_fullscreen_v1`, name `Chi'lly Chat incoming calls`, importance `4`, ringtone sound, ringtone audio attributes, and vibration enabled.
- R3 recovery remained blocked: `adb devices` listed only `R5CR120QCBF` and an emulator, and Mac USB enumeration showed only `R5CR120QCBF` as the connected Samsung Android device. `R3CXA0DS5JV` was not visible at the USB layer.

## Two-Device Active CallStyle Installed Proof

Artifact subfolder: `/tmp/google-play-internal-v78-native-callstyle-active-incoming-fix-20260703-215118/installed-two-device-callstyle-proof-20260704-112837/`.

Results:

- Repo/origin were aligned at `b3418eb8ebc5e0add5aede7dd97c8ef9d65178c6` before proof, and the tracked tree was clean except pre-existing untracked artifact/temp files.
- `R3CXA0DS5JV` and `R5CR120QCBF` were both visible/authorized in `adb devices`.
- Both devices read back package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `77`, versionName `1.0.0`.
- Both devices had DND/Zen `0`. R5 ring/notification/media streams were nonzero; R3 ring/notification streams were nonzero.
- Both devices had channel `chilly_chat_calls_fullscreen_v1` with importance `4`, ringtone sound, ringtone audio attributes, and vibration enabled.
- R3 Settings readback showed registered push/native call status with redacted device/native call fingerprints and `Full-screen call alerts` enabled. R5 Settings readback showed full-screen call alerts enabled and the same channel family.
- Background voice call: R5 outside app received an active CallStyle notification on `chilly_chat_calls_fullscreen_v1`, not a missed-call notification. The notification had `category=call`, `fullscreenIntent`, `androidx.core.app.NotificationCompat$CallStyle`, and two actions: `Decline` and `Answer`.
- Native Answer for voice opened the valid Chi'lly Chat call and both devices reached `2 in call`; End Call returned both devices to `No Active Call`.
- Native Decline for voice cleared the caller and receiver to `No Active Call`; R5 notification readback after Decline did not show an active answerable call notification.
- Background video call: R5 outside app received an active CallStyle notification on `chilly_chat_calls_fullscreen_v1` with `Decline` and `Answer`; native Answer opened the valid video call and both devices reached active video-call state with `2 in call`.
- Same-thread Accept regression: R3 and R5 were both in the same direct thread with `No Active Call`; R5 started a call, R3 saw the same-thread full incoming UI with `Accept` and `Decline`, R3 accepted, and both devices reached `2 in call`. The previous `This communication room is unavailable` failure did not reproduce.
- Normal in-app outside-thread regression: R3 on Settings received the full incoming modal with `Decline`, `Answer`, and `Reply in Chat`, not the room-safe compact banner; Decline returned R3 to Settings and R5 to `No Active Call`.
- Missed-call timing remained Partial: the cleanup rerun did not capture a clean active-before-expire notification for that specific attempt, although stale active answerable notifications were not present after caller end.
- Room-safe fresh regression remained Partial: the prior Watch-Party fixture `BS-E2E-7561F256` now returns `Room not found`, and no new room fixture was created or mutated in this lane.
- Locked-screen full-screen takeover was not separately proved beyond CallStyle `fullscreenIntent`, Settings full-screen permission readback, and background notification proof.

## Safety Confirmation

- No Money Center changes.
- No provider/live-money mutation.
- No payout/cashout/payable balance changes.
- No Play production submission.
- No sideload or `adb install` proof counted.
- No logout, uninstall, reinstall, or clear data.
- No auth/RLS weakening.
- No WebRTC/media setup change.
- No room routing change.
- `liveMoneyEnabled` remains OFF.

## Remaining Open Items

- Create or recover a safe current room/live fixture before rerunning room-safe incoming-call regression; do not mutate room state in this proof lane just to close it.
- Rerun missed-call timing with a clean active-before-expire capture or an actual timeout/expiry proof.
- Separately prove locked-screen full-screen takeover if product requires full-screen visual closure beyond CallStyle `fullscreenIntent` and full-screen permission readback.
