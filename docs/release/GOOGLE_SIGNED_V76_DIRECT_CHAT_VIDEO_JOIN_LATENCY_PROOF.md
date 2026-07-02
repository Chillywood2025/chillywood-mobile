# Google-Signed V76 Direct Chat Video Join Latency Proof

Date: 2026-07-02

Verdict: Closed for the reported Direct Chi'lly Chat video-answer latency issue on Google Play-installed v76 plus verified runtime-compatible OTA behavior.

Proof artifact folder:

- `/tmp/google-play-internal-v76-video-join-latency-proof-20260702-171458/`

## Executive Summary

Robert reported that after the receiver answered a Direct Chi'lly Chat video call, the caller could wait roughly 10 seconds before the screen split and the receiver video rendered. Installed proof reproduced the old caller-side delay after the first OTA: the receiver reached `2 in call` quickly, but the caller stayed at `1 in call` at the +8 second capture and did not split until the +15 second capture.

The final OTA adds a bounded warm-up room snapshot refresh after call join and keeps peer sync tied to the membership-aware participant merge. On the Google Play-installed v76 app, after both apps were restarted twice for the final OTA, the normal visible Direct Chat video flow proved both phones at `2 in call` with local and remote video by the +4 second capture after the receiver answered. The +8 second capture confirmed both phones remained split with renderable local/remote video. End Call returned the caller thread to `No Active Call`.

This was a JS-only call-session fix. No Play build, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, provider mutation, live money, payout, cashout, auth/RLS weakening, or private identifier exposure happened.

## Root Cause

The Direct Chat call session could sync peer connections from raw realtime presence before the membership-aware participant merge had remote member data. When the caller missed or delayed the receiver membership update, the caller waited for the slower room heartbeat/snapshot path before splitting to two tiles, even though the receiver had already answered.

## Source Fix Summary

Files changed:

- `hooks/use-communication-room-session.ts`

Commits:

- `8c110ad4193bd9928355b72e6b7f8146c03a7286` - peer sync now uses the membership-aware participant list returned by `applyParticipantsFromSources`.
- `9b6ab72d05a6b77d09a341945d47b9018f87e44d` - added bounded warm-up snapshot refresh after room start when no remote active membership has arrived yet.

The warm-up refresh starts shortly after join, repeats on a short interval, and stops once remote membership appears or the attempt limit is reached. It does not change auth, RLS, call permissions, room ownership, providers, or native media setup.

## Device Binary / OTA Proof

Both physical proof devices remained Google Play-installed v76:

- `R3CXA0DS5JV`: package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`, lastUpdateTime `2026-07-01 00:53:55`.
- `R5CR120QCBF`: package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`, lastUpdateTime `2026-07-01 00:55:59`.

OTA 1:

- Group: `62ace569-2a9a-4929-baaa-2095ab928085`.
- Android update: `019f24e6-1600-7803-a745-aa5c39a3a6da`.
- Runtime: `1.0.0`.
- Commit: `8c110ad4193bd9928355b72e6b7f8146c03a7286`.

OTA 2:

- Group: `10fc0b00-df0a-4fc8-9764-c27095a6d75d`.
- Android update: `019f24f3-cb2f-7a52-baa2-0881849c32e5`.
- Runtime: `1.0.0`.
- Commit: `9b6ab72d05a6b77d09a341945d47b9018f87e44d`.

Both apps were restarted twice after the final OTA before installed proof. No sideload, `adb install`, logout, uninstall, reinstall, or clear data happened.

## Installed Video Join Result

Normal visible path:

- R3 opened Profile, tapped Chi'lly Chat, opened the existing direct thread with `user230455`, and tapped `Video Call`.
- R5 was elsewhere in the app and received the real incoming Chi'lly Chat video call banner.
- R5 tapped `Answer`.

First OTA result:

- R5 receiver reached `2 in call` and split video quickly.
- R3 caller still showed `1 in call` at the +8 second capture.
- R3 caller did not reach `2 in call` until the +15 second capture.
- This was not Closed.

Final OTA result:

- R3 caller showed `2 in call`, split layout, local video, and remote video by the +4 second capture.
- R5 receiver showed `2 in call`, split layout, local video, and remote video by the +4 second capture.
- The +8 second screenshots/XML confirmed both phones remained `2 in call`, `Connected`, with local and remote renderable video.
- End Call returned R3 to the direct thread with `No Active Call`; R5 returned to Home rather than a phantom call state.

Key artifacts:

- `screens/R3-video-polled-answer-plus-8s.png` and `screens/R3-video-polled-answer-plus-15s.png` show the first OTA caller delay.
- `screens/R3-video-second-ota-answer-plus-4s.png` and `screens/R5-video-second-ota-answer-plus-4s.png` show both phones split by the final OTA +4 second capture.
- `screens/R3-video-second-ota-answer-plus-8s.png` and `screens/R5-video-second-ota-answer-plus-8s.png` show stable two-phone local/remote video.
- `screens/R3-after-final-end.png` and `screens/R3-after-final-end.xml` show `No Active Call` after cleanup.

## Remaining Scope

This closes the Android two-phone installed proof for the reported video-answer split/render delay. It does not claim iOS, tablet, foldable, background push, broader notification/room closure, or every network condition as Closed.

## Validation Results

Passed after the source fixes:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run proof:room-safe-notification-and-call-behavior`
- `npm run guard:notification-room-call-policy`
- `npm run guard:chat-call-moderation-notification-policy`

Final diff checks passed after documentation:

- `git diff --check`
- `git diff --cached --check`

## Safety Confirmation

No Play build, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, Money Center refactor, provider mutation, live money, payout, cashout, auth/RLS weakening, service-role chat proof, First Owner change, or private identifier exposure happened. `liveMoneyEnabled` remains OFF.
