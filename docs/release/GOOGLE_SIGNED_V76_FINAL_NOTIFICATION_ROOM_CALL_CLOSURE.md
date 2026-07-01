# Google-Signed V76 Final Notification Room Call Closure

Date: 2026-07-01

Verdict: Blocked for final installed closure. Source fixes were made and published by OTA. The follow-up device recovery pass recovered `R3CXA0DS5JV` and verified both physical phones remain Google Play-installed v76, but `R5CR120QCBF` did not prove the published OTA loaded after repeated safe checks. Since the current owner/creator proof account is on R5 and the remaining proof requires both phones for in-room call actions, the fixed installed UI flows were not counted Closed.

## Executive Summary

This was a narrow continuation of the remaining v76 notification/room/call proof. Money Center manager visibility was not reopened or refactored.

The source fix commit is `05446c8832004336bb42ee6d21f29fb5b1ed8cf4`. It fixes the creator notification Premium-gate race and the stale actionable Android call notification cleanup path after Decline / Reply in Chat / open-call actions. The fix was published to the production EAS Update channel for Android runtime `1.0.0`.

Installed closure remains blocked because final proof requires the fixed Play-installed app to rerun the creator route, room trays, and stale-call-notification cleanup flows, and requires both physical phones for the in-room call banner actions. R3 is no longer the current blocker; the current blocker is that R5 has not proved the `39609392-ad93-4bcb-86c0-b8b639daf393` OTA active.

## Two-Device Recovery Follow-Up

Date: 2026-07-01

Proof artifacts:

- `/tmp/google-play-internal-v76-two-device-final-closure-20260701-165920/`

Recovery result:

- `R3CXA0DS5JV` appeared in `adb devices` as authorized.
- `R5CR120QCBF` remained visible and authorized.
- Both devices remained Google Play-installed v76:
  - `R3CXA0DS5JV`: `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`, lastUpdateTime `2026-07-01 00:53:55`.
  - `R5CR120QCBF`: `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`, lastUpdateTime `2026-07-01 00:55:59`.

OTA result:

- Expected group: `39609392-ad93-4bcb-86c0-b8b639daf393`
- Expected Android update: `019f1f9f-b6e3-786c-b16f-97ab49d851ea`
- Expected runtime: `1.0.0`
- `R3CXA0DS5JV`: proved the expected OTA bundle/update/group signals after safe launch.
- `R5CR120QCBF`: did not prove the expected OTA loaded after repeated safe launch/update checks; the latest safe summary showed `CheckCompleteUnavailable` and did not show the expected update id, update group, or bundle signal.

Installed proof classification:

- Creator notification route result: Blocked, not rerun as Closed because the current owner/creator proof session is on R5 and R5 has not proved the fixed OTA active.
- Waiting Room tray result: Blocked, not rerun as Closed in this follow-up.
- Live Stage tray result: Blocked, not rerun as Closed in this follow-up.
- Reply in Chat result: Blocked, not rerun as Closed because two-device proof requires both phones on the fixed code path.
- Leave room and answer result: Blocked, not rerun as Closed because two-device proof requires both phones on the fixed code path.
- Decline stale-notification cleanup result: Blocked, not rerun as Closed because stale Android notification cleanup must be proved on the fixed installed app.

Validation passed under `/tmp/google-play-internal-v76-two-device-final-closure-20260701-165920/validation/`.

## Repo / Origin Alignment

Starting baseline was `a408d9a2f4172631f2e6bb929e7dc943ea47c45b`.

Final source alignment after the fix:

- `HEAD == origin/main == 05446c8832004336bb42ee6d21f29fb5b1ed8cf4`
- Tracked worktree was clean except pre-existing untracked local artifact/temp files.

## Device Binary / OTA Proof

`R5CR120QCBF` package proof:

- package: `com.chillywood.mobile`
- installerPackageName: `com.android.vending`
- versionCode: `76`
- versionName: `1.0.0`
- lastUpdateTime: `2026-07-01 00:55:59`

`R3CXA0DS5JV` was not visible to ADB in this final closure attempt, so its package/OTA state could not be read.

Published OTA:

- branch/channel: `production`
- runtimeVersion: `1.0.0`
- platform: `android`
- update group: `39609392-ad93-4bcb-86c0-b8b639daf393`
- Android update id: `019f1f9f-b6e3-786c-b16f-97ab49d851ea`
- commit: `05446c8832004336bb42ee6d21f29fb5b1ed8cf4`

The pulled `R5CR120QCBF` v76 APK manifest confirms:

- `expo.modules.updates.EXPO_RUNTIME_VERSION = 1.0.0`
- `expo-channel-name = production`
- update URL points to the expected EAS project.

A redacted direct EAS Update endpoint probe returned the new Android production/runtime `1.0.0` update. The first R5 launch after publish logged `CheckCompleteAvailable`, `Download`, `DownloadProgress 1.0`, `DownloadComplete` with `isUpdatePending=true`, and Expo Updates reset handling for Android update `019f1f9f-b6e3-786c-b16f-97ab49d851ea`. Later R5 relaunches logged `CheckCompleteUnavailable` / `No update available`, which is consistent with the update no longer being offered after download/apply handling. This is update-state proof, not final installed UI flow closure.

## Creator Notification Route Result

Source fixed, installed proof blocked.

Root cause: the Channel Studio / Money Center route could render the Premium gate before the legitimate creator/owner/operator access and Premium snapshot readback finished. That made creator sale/support notification rows appear to hit Premium instead of Money Center Transactions.

Fix: `app/channel-settings.tsx` now keeps the loading state active while `canUseChannelSettings && loading` is true, so legitimate creator/owner/operator access is allowed to resolve before showing the Premium-required gate.

Installed proof of the creator rows opening Money Center Transactions remains blocked until the fixed Play-installed app is exercised through the actual creator notification rows.

## Waiting Room Tray Result

Not proved in this final attempt. Waiting Room tray remains Partial/Blocked for installed closure.

## Live Stage Tray Result

Not proved in this final attempt. Live Stage tray remains Partial/Blocked for installed closure.

## Reply In Chat Result

Source fixed for stale notification cleanup around Reply in Chat. Installed two-device proof was blocked because `R3CXA0DS5JV` was not attached.

## Leave Room And Answer Result

Not proved in this final attempt. This still requires both physical phones with the receiver inside Party Room or Live Stage.

## Stale Call Notification Cleanup Result

Source fixed, installed proof blocked.

Root cause: Decline updated receiver-side invite state and cleared the in-app banner, but the delivered Android notification could remain presented and actionable while caller-side call state was still active.

Fix:

- `_lib/notifications.ts` adds `dismissPresentedChillyChatCallNotifications()`.
- `app/_layout.tsx` calls the helper when opening a call, declining a call, and using Reply in Chat.
- The helper only targets Chi’lly Chat call notifications by safe notification data such as call invite id, route path, or thread path.
- It does not print raw tokens or private provider data.

Installed proof that the stale Android call notification is dismissed after Decline remains blocked until two-device proof can be rerun on the fixed Play-installed app.

## Push Registration / Push Delivery Non-Regression Result

Previously Closed items were not reopened. Push registration persistence and actual Android Chi’lly Chat call push delivery remain documented in `docs/release/GOOGLE_SIGNED_V76_NOTIFICATIONS_MONEY_CENTER_PROOF.md`.

This final attempt did not dispatch a new push.

## Seat Pass Wording Result

Previously Closed and not reopened. No source change in this pass touched Seat Pass wording.

## Money Center Non-Regression Result

Previously Closed and not reopened. No Money Center refactor happened. The only route-gate source change was the loading guard that lets legitimate Channel Studio / Money Center access finish resolving before showing a Premium gate.

## Safety Confirmation

No Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, live money enablement, payout, cashout, payable balance, provider mutation, auth/RLS weakening, First Owner mutation, service-role proof, fake push proof, or fake purchase-generation proof happened.

No raw Expo push tokens, auth tokens, provider ids, emails, user ids, service keys, signed URLs, or private credentials are included in committed docs.

## Validation Results

Validation passed after the source fix:

- `npm run proof:notification-center-money-activity`
- `npm run proof:important-notification-accessibility`
- `npm run proof:creator-money-notification-routing`
- `npm run proof:notification-icon-surface-wiring`
- `npm run proof:room-safe-notification-and-call-behavior`
- `npm run guard:notification-action-retention-policy`
- `npm run guard:notification-money-policy`
- `npm run guard:notification-room-call-policy`
- `npm run guard:chat-call-moderation-notification-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:money-center-policy`
- `npm run guard:route-contracts --if-present`
- `npm run guard:brand-spelling-policy`
- `npm run typecheck`
- `npm run validate:runtime`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

## Proof Artifacts

Final closure artifact folder:

- `/tmp/google-play-internal-v76-final-notification-room-call-closure-20260701-163510/`

Key artifacts:

- `device-proof/R5CR120QCBF-package.txt`
- `device-proof/R5-AndroidManifest.txt`
- `ota-proof/eas-update-05446c8.log`
- `ota-proof/eas-update-list-production.json`
- `ota-proof/eas-update-targeting-summary-redacted.txt`
- `ota-proof/R5-ota-uptake-safe-summary.txt`
- `ota-proof/R5-logcat-after-force-stop-relaunch.txt`
- `ota-proof/R5-logcat-after-third-force-stop-relaunch.txt`
- `validation/pre-ota/`

## Issues Still Open

- R3 must be attached/visible before two-device Reply in Chat and Leave room and answer can be proved.
- R5 has update-state proof for OTA group `39609392-ad93-4bcb-86c0-b8b639daf393`, but the fixed creator route and stale notification cleanup UI flows still need to be rerun on the installed app.
- Creator notification rows must be tapped again on the installed fixed app and must open Money Center Transactions for the legitimate creator/owner/operator account.
- Waiting Room and Live Stage trays still need separate installed proof.
- Stale actionable call notification cleanup after Decline still needs installed proof.
