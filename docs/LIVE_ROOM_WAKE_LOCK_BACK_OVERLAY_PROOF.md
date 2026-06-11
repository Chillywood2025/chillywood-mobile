# Live Room Wake Lock Back Overlay Proof

Updated: June 10, 2026

Lane: Live Room Wake Lock Back Navigation Overlay Timeout Fix

## Summary

This lane fixes the live-room tester issues without changing LiveKit authority, room ownership, old-room handling, Party Room behavior, Premium gates, monetization state, or content safety.

The fix is intentionally narrow:

- Watch-Party Live and Live Stage now activate a focused-screen wake lock so Android should not dim, sleep, or black out while the user is inside the room surface.
- Live Stage hardware Back returns from Stage to the embedded Live Room surface first, instead of falling through to Home.
- Watch-Party Live Back and leave recovery now return to the Watch-Party entry context instead of relying on stack history.
- Live Stage route gate Back actions now return to the canonical Party Room route for the current room.
- The existing Live Stage 10-second overlay auto-hide remains in place for viewer and host.
- The existing Live Stage control lock now keeps the overlay visible and disarms auto-hide while locked.
- Tap-to-reveal remains active when the Live Stage overlay is hidden.

## Files Changed

- `app/watch-party/[partyId].tsx`
- `app/watch-party/live-stage/[partyId].tsx`
- `package.json`
- `package-lock.json`
- `docs/LIVE_ROOM_WAKE_LOCK_BACK_OVERLAY_PROOF.md`
- `docs/PLAYER_LIVE_ROOMS_TOUCH_POLISH.md`
- `docs/DEVICE_EMULATOR_LIVE_ROOM_TEST_SWEEP.md`

## Wake Lock

The repo did not have `expo-keep-awake` installed before this lane. The existing room lock/control UI could prevent overlay fade, but it could not prevent Android screen timeout because there was no native wake-lock layer wired to the room screens.

This lane adds SDK-compatible:

- `expo-keep-awake@~15.0.8`

Implementation details:

- Watch-Party Live activates `activateKeepAwakeAsync` while `app/watch-party/[partyId].tsx` is focused.
- Live Stage activates `activateKeepAwakeAsync` while `app/watch-party/live-stage/[partyId].tsx` is focused.
- Both screens release their matching wake-lock tag on blur/unmount through `deactivateKeepAwake`.
- Activation/deactivation failures are reported through the existing runtime logger.
- Web is excluded.

Native runtime note:

Because `expo-keep-awake` is a native Expo module, a Play/internal runtime must include the module before this can be fully device-proved. If the currently installed Play/internal build does not already include this native module, an EAS Update alone may not be enough; a new internal build may be required before testers can prove the wake-lock behavior.

## Back Navigation

Before this lane, several room surfaces still used raw `router.back()`. Depending on how a tester arrived, Android Back or in-app Back could fall through to Home instead of returning to the room/waiting context.

Updated behavior:

- Watch-Party Live room Back returns to `/watch-party` with the current `partyId`, `roomCode`, `titleId`, `mode`, and `source` where available.
- Watch-Party Live leave-room fallback uses the same Watch-Party entry return instead of stack history.
- Watch-Party Live blocked/not-found/access-gate Back uses the same room-safe return.
- Live Stage Android Back returns from Stage to Live Room when the embedded Stage surface is active.
- Live Stage Android Back from the Live Room surface returns to the canonical `/watch-party/[partyId]` Party Room route.
- Live Stage missing/access-denied route-gate Back returns to the canonical Party Room route.

No route ownership was changed. Party Room remains the canonical `/watch-party/[partyId]` route. Live Stage remains the canonical `/watch-party/live-stage/[partyId]` route.

## Overlay Timeout

The Live Stage overlay already had a 10-second auto-hide constant:

- `STAGE_OVERLAY_AUTO_HIDE_MILLIS = 10_000`

This lane keeps that behavior and tightens the lock semantics:

- Viewer and host overlays auto-hide after 10 seconds when the Stage surface is active and no panels are open.
- Tapping the Stage reveal surface brings the overlay back.
- Comments, reaction picker, controls sheet, face filter sheet, focused comment input, and locked controls prevent auto-hide.
- Locking controls now reveals the overlay without arming auto-hide.
- Unlocking controls reveals the overlay and re-arms normal auto-hide.

## Safety Proof

This lane does not change:

- LiveKit token issuer
- LiveKit publish authority
- `canPublish`
- host approval
- speaker approval
- mic/camera permission logic
- Watch-Party Live route ownership
- Live Watch-Party / Live Stage route ownership
- Party Room behavior
- old-room handling
- Premium gates
- content safety gates
- blocking/moderation/private/draft/deleted/admin_removed/malware handling
- money state
- production live money
- payouts/cash-out/withdraw/transfer
- Stripe Android digital checkout policy

## Validation

Passed:

- `npm run typecheck`
  - includes Android launcher icon policy guard
  - includes Watch-Party LiveKit camera guard
  - includes Live Stage contract guard
  - includes Live Stage approved seats guard
  - includes old-room handling guard

Pending in this doc until final closeout:

- `npm run validate:runtime`
- money/access/provider/navigation/content guards
- `git diff --check`
- `git diff --cached --check`

## Android Proof Target

Target proof path:

`/tmp/chillywood-live-room-wake-lock-back-overlay-proof-20260610/`

Required proof when a matching Play/internal runtime is available:

- Device `R5CR120QCBF`
- package `com.chillywood.mobile`
- installer `com.android.vending`
- versionCode/versionName captured
- runtime/update/build ID captured
- Watch-Party Live stays awake while idle
- Live Stage stays awake while idle
- Live Stage overlay auto-hides after 10 seconds
- tap brings the overlay back
- locked controls do not auto-hide
- Android Back from Stage returns to Live Room
- Android Back from Live Room returns to Party Room / waiting context, not Home
- no LiveKit authority or money-state changes

## Remaining Proof Gap

Device proof must be run on a Play/internal app runtime that contains `expo-keep-awake`. If the currently installed runtime does not include that native module, the next proof step is a new internal build, not only OTA.
