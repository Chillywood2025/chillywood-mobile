# Standalone Player Overlay Fullscreen Proof

Updated: June 4, 2026

This focused pass fixes the standalone Player visual issue where top and bottom control blocks stole video height and fullscreen looked cropped/cluttered. It changes layout and control presentation only.

## Issue Fixed

- Removed the large standalone top control block from the media flow.
- Removed the large standalone bottom Back / `1x` control block from the media flow.
- Made video fill the standalone media card.
- Moved Share, Report, playback speed, and Watch-Party Live into compact top overlay chips.
- Kept progress, time, and fullscreen as compact bottom overlays.
- Moved Back below the media card so it remains reachable without covering the video.
- Fullscreen now uses aspect-preserving contain sizing instead of an aggressive crop.
- Fullscreen hides Discussion/comments and keeps controls as overlays.
- Fullscreen suppresses the normal Player framework/depth overlays so the bottom of the screen is not blurry.
- Fullscreen locks to landscape through the native orientation module.

## Files Touched

- `app/player/[id].tsx`
- `app/_layout.tsx`
- `app.json`
- `package.json`
- `package-lock.json`
- `scripts/guard-player-overlay-policy.mjs`
- `scripts/guard-watch-party-livekit-camera.mjs`

## Standalone Overlay Layout

All standalone Player surfaces now mirror the same layout when the route is not Watch-Party and not Live mode:

- top overlay: Share, Report, `1x` speed, Watch-Party Live
- media area: full-card video
- bottom overlay: current time, progress, duration, fullscreen
- below media card: Back
- below Player: Discussion/comments

The `1x` control remains a compact top chip because it is a playback setting, not a bottom navigation action. Back sits outside the player card because it is a route/navigation action.

## Fullscreen

Fullscreen now:

- prioritizes the video
- uses aspect-preserving contain behavior
- hides Discussion/comments
- removes the normal Player background/depth overlay that caused bottom blur
- rotates to landscape on the native Android proof build
- avoids giant black control bars
- keeps controls as overlays
- exposes a clear fullscreen control
- exits safely through Android hardware Back

Letterboxing is accepted in fullscreen because preserving the video is better than an accidental crop/zoom.

## Android Proof

Proof path:

`/tmp/chillywood-standalone-player-overlay-fullscreen-proof-20260604/`

Native proof build:

- local `./gradlew assembleRelease`
- versionCode `24`
- versionName `1.0.0`
- device `R5CR120QCBF`
- package `com.chillywood.mobile`
- installer source after proof install: local/sideloaded
- pre-proof Play install documented: versionCode `23`, installer `com.android.vending`

The local proof APK was required because the installed Play v23 binary was portrait-locked in native manifest state and could not receive the new native orientation module through OTA.
The local generated `android/` project was used only for attached-device proof and is not committed; committed source carries the native intent through `app.json` orientation plus `expo-screen-orientation`.

Screenshots captured:

- `01-player-overlay-card.png`: standalone Player with full-card video, top overlay chips, bottom progress/fullscreen overlay, Back below the card, and Discussion below.
- `03-player-fullscreen-visible-controls.png`: fullscreen with aspect-preserved video, overlay controls, no Discussion, and no giant control bars.
- `04-player-fullscreen-back-exit.png`: Android hardware Back exited fullscreen and restored the standalone card layout.
- `05-local-v24-launch.png`: local v24 proof APK launch after native install.
- `06-local-v24-player-route.png`: signed-out standalone Player route with mirrored top controls, Back below the player, and Discussion below.
- `07-local-v24-fullscreen-landscape.png`: native fullscreen landscape proof with no bottom blur/depth overlay.
- `08-local-v24-back-exit-portrait.png`: Android hardware Back restored the portrait standalone Player layout.

No screenshots are committed.

## No Behavior Changes

This pass does not change:

- Player playback pipeline
- media resolver logic
- content access logic
- paid content behavior
- Premium gates
- comments/replies backend behavior
- Watch-Party Live CTA ownership
- Watch-Party Live route ownership
- Live Watch-Party / Live Stage route ownership
- LiveKit token issuer
- old-room handling
- money state
- production live money
- payouts/cash-out/withdraw/transfer
- Stripe Android digital checkout policy
- default app portrait posture outside standalone fullscreen

## Remaining UI Gaps

- The proof route used a public creator-video row whose source is currently unavailable; it still proves standalone chrome, fullscreen orientation, bottom blur removal, and safe unavailable-state presentation.
- A future same-signing Play/internal build should replace the temporary local proof install when the owner wants the proof device back on `com.android.vending`.
