# Google-Signed v79 Room-Safe Incoming Call Regression Proof

Status: Blocked.

## Executive Summary

This was a narrow proof-only rerun for the remaining v79 room-safe incoming-call regression. No source changes were made. The proof could not reach fixture discovery because the second physical proof phone, `R3CXA0DS5JV`, was not visible over ADB or Mac USB enumeration.

The already-closed v79 native Answer work remains unchanged: background voice/video native Answer, native Decline, same-thread Accept, and normal in-app outside-thread full modal are already proved on Google Play-installed v79. This lane only attempted the remaining room-safe compact-banner proof.

## Repo / Origin Alignment

- HEAD: `0f369013748a06d90bbcb8f644249f758027a8ac`
- origin/main: `0f369013748a06d90bbcb8f644249f758027a8ac`
- Tracked tree was clean before proof.

## Device Baseline

- `R5CR120QCBF`: visible/authorized; package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`, lastUpdateTime `2026-07-04 18:10:32`.
- `R3CXA0DS5JV`: not visible in `adb devices`; not visible in Mac USB enumeration; package readback returned `device not found`.

Recovery attempted only non-destructive actions:

- `adb kill-server`
- `adb start-server`
- repeated `adb devices -l` polling
- Mac USB enumeration check

No sideload, `adb install`, logout, clear data, uninstall, reinstall, or factory reset happened.

## Room Fixture Result

Blocked before fixture work. Two physical devices are required to place one device inside a room-safe surface and use the other device as the Chi'lly Chat caller. Because `R3CXA0DS5JV` was unavailable over ADB/USB, no room-safe fixture was created, mutated, or consumed.

## Room-Safe Surface Result

Not reached in this rerun.

Prior v79 route attempts remained the current known fixture/access state:

- `/watch-party` hit Premium gate.
- `/watch-party/live-stage` showed `Live room unavailable`.
- visible room code route returned `Room not found`.
- `/communication` resolved to Chi'lly Chat inbox, not an active room-safe surface.

## Required Remaining Proof

After R3 or another owner-approved Google Play-installed v79 physical device is available:

- Reach a valid active room-safe surface.
- Prove compact room-safe incoming-call banner appears instead of the full modal.
- Prove `Decline` keeps the receiver in room and clears caller safely.
- Prove `Reply in Chat` opens chat without auto-answer.
- Prove `Leave room and answer` confirms and then joins the call.
- Prove no automatic room leave, answer, mic/camera change, or disconnect happens before explicit action.
- Prove no stale answerable notification remains.

## Validation

No source changes were made. Required no-source checks:

- `git status --short --branch`
- `git diff --check`
- `git diff --cached --check`

## Safety

No source change, rebuild, Play production submission, sideload, `adb install`, logout, clear data, uninstall/reinstall, Money Center change, provider mutation, live money, payout/cashout change, auth/RLS weakening, WebRTC/media rewrite, or room routing change happened. No room fixture was created or mutated.

## Artifacts

- `/tmp/google-play-internal-v79-room-safe-incoming-call-regression-proof-20260704-202158/`
