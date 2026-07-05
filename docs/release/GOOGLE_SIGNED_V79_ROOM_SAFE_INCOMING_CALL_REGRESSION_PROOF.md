# Google-Signed v79 Room-Safe Incoming Call Regression Proof

Status: Closed.

## Executive Summary

This was a narrow proof-only rerun for the remaining v79 room-safe incoming-call regression. No source changes were made. The blocker from the prior rerun was resolved by using the owner-approved Google Play / RevenueCat sandbox Premium path on `R5CR120QCBF` so the receiver could legitimately reach the Watch-Party `Party Waiting Room` room-safe surface.

The Google Play-installed v79 app then proved the expected room-safe behavior: the receiver inside `Party Waiting Room` got the compact room-safe incoming-call banner instead of the normal full app-wide modal, `Decline` kept the receiver in the room and cleared the caller, `Reply in Chat` opened the correct Chi'lly Chat thread without auto-answer, and `Leave room and answer` showed confirmation before leaving the room and joining the call. After realtime settled, both phones showed `2 in call` and `Connected`; End Call returned both to `No Active Call`.

## Repo / Origin Alignment

- HEAD: `ad748df34d7f55dbb34cb67492230dbf51f14abb`
- origin/main: `ad748df34d7f55dbb34cb67492230dbf51f14abb`
- Tracked tree was clean before proof.
- Only pre-existing untracked artifact/temp paths remained.

## Device Baseline

Both physical phones were visible/authorized over ADB and remained Google Play-installed v79:

- `R5CR120QCBF`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`, lastUpdateTime `2026-07-04 18:10:32`.
- `R3CXA0DS5JV`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`, lastUpdateTime `2026-07-04 18:10:33`.

No sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

## Room Fixture Result

Closed. `R5CR120QCBF` initially hit the Premium gate at `/watch-party`. Following owner direction, the tester used the app's sandbox-only Premium flow:

- `Manage Premium`
- `Start Sandbox Premium Test`
- Google Play sandbox test-card subscription

The Premium screen then read `Premium is active on this account` and `Chi'llywood Premium purchase completed.` This was a sandbox/test entitlement only. It did not enable live money, payouts, cashout, payable balances, provider production settings, or creator-money settlement.

After sandbox Premium, `/watch-party` opened the Watch-Party `Party Waiting Room`, which is governed by the room-safe call policy.

## Room-Safe Surface Result

Closed. `R5CR120QCBF` was on the Watch-Party `Party Waiting Room` surface with room-safe notification controls visible.

## Compact Banner Result

Closed. When `R3CXA0DS5JV` started a Chi'lly Chat voice call while `R5CR120QCBF` was in `Party Waiting Room`, the receiver XML showed:

- `room-safe-incoming-call-banner`
- `room-safe-incoming-call-decline`
- `room-safe-incoming-call-reply-chat`
- `room-safe-incoming-call-leave-answer`

The banner copy said `Incoming Chi'lly Chat call` and `Answering will leave or pause your current room media session.` The full normal app-wide incoming-call modal was not shown as the primary room-safe UI.

## Decline Result

Closed. From the room-safe banner, tapping `Decline`:

- kept `R5CR120QCBF` in `Party Waiting Room`
- did not join the call
- stopped the active incoming-call path
- returned `R3CXA0DS5JV` to `No Active Call`
- left no stale answerable call state in the active UI

## Reply In Chat Result

Closed. From a fresh room-safe incoming-call banner, tapping `Reply in Chat`:

- opened the correct Chi'lly Chat direct thread
- did not auto-answer
- did not start mic/camera
- left the call as a normal live in-thread incoming call with `Decline` / `Accept`
- kept caller state accurate as ringing until the receiver explicitly declined

The follow-up decline from the thread reset both devices to `No Active Call`.

## Leave Room And Answer Result

Closed. From a fresh room-safe incoming-call banner, tapping `Leave room and answer` showed the expected confirmation:

- `Leave room and answer?`
- `Answering will leave or pause your current room media session. Returning will re-check your room access.`

After confirming, `R5CR120QCBF` intentionally left the room-safe surface and joined the active Chi'lly Chat voice call. After realtime settled:

- `R5CR120QCBF` showed `Voice call active`, `2 in call`, and `Connected`.
- `R3CXA0DS5JV` showed `Voice call active`, `2 in call`, and `Connected`.
- End Call returned both devices to `No Active Call`.

## Room State Preservation Result

Closed. Before explicit action, the room stayed active while the compact banner was displayed. `Decline` preserved `Party Waiting Room`. `Reply in Chat` only moved to chat after the user explicitly chose that action. `Leave room and answer` left the room only after explicit confirmation.

No automatic room leave, automatic answer, mic/camera change, room disconnect, or route jump happened before user action.

## Caller State Result

Closed. Caller state cleared accurately on `Decline`, remained ringing during `Reply in Chat` until the receiver explicitly declined, and moved to connected `2 in call` after `Leave room and answer`.

## Stale Notification Cleanup Result

Closed for the room-safe paths exercised. After the final End Call, package-specific Android notification readback showed the Chi'lly Chat notification channels but no active stale answerable Chi'lly Chat call notification. Both app UIs returned to `No Active Call`.

## In-App / Native Call Non-Regression Result

No source changed in this pass. The already-closed v79 native Answer work remains unchanged: background voice/video native Answer, native Decline, same-thread Accept, normal in-app outside-thread full modal Answer, and End Call cleanup remain governed by the v79 proof in `docs/release/GOOGLE_SIGNED_V79_NATIVE_ANSWER_ACTION_FIX.md`.

## Validation

No source changes were made. Required no-source checks:

- `git status --short --branch`
- `git diff --check`
- `git diff --cached --check`

## Safety

No source change, rebuild, Play production submission, sideload, `adb install`, logout, clear data, uninstall/reinstall, Money Center change, provider mutation, live money, payout/cashout change, auth/RLS weakening, WebRTC/media rewrite, or room routing change happened.

The sandbox Premium purchase was used only to reach a legitimate Premium-gated room-safe proof surface. It was not counted as creator-money proof, did not enable production money, and did not mutate provider production settings.

## Artifacts

- `/tmp/google-play-internal-v79-room-safe-incoming-call-regression-proof-20260704-203344/`
