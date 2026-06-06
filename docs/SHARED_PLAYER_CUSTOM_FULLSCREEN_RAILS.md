# Shared Player Custom Fullscreen Rails

Updated: June 5, 2026

## Intent

Watch-Party Live Shared Player fullscreen is a custom Chi'llwood layout, not a normal fullscreen video mode. The intended fullscreen composition is:

- left dark rail for room comments
- large center shared player/video surface
- right dark rail for LiveKit participant bubbles

The left rail uses the existing room comments data and send path. The right rail uses the existing shared player participant data. The center video keeps the existing playback surface and shared playback tap handler.

## Layout

The fullscreen route in `app/player/[id].tsx` now renders shared Watch-Party playback as a real three-zone row when `isSharedPartyPlayback && isPlayerFullscreen` is true:

- `sharedFullscreenCommentsRail`: fixed/clamped left rail width based on current screen width.
- `sharedFullscreenCenterStage`: flex center area that owns the existing `videoWrap`.
- `sharedFullscreenParticipantRail`: fixed/clamped right rail width based on current screen width.

This replaces the previous fullscreen approach that placed comments and participant UI as absolute overlays on top of the video. The center video is no longer shrunk to fit cards; it flexes between the two dark rails.

## Left Comments Rail

The comments rail renders `renderPartyCommentsContent(true)`, which keeps the existing room comments list, empty state, input, and Send button. It does not create fake comments or a second backend path. The rail itself is the dark container, so the comments UI is configured as rail content rather than a floating card over the video.

The rail-specific composer is compact: the placeholder is `Comment`, the input remains inside the rail, and the Send action is a small chip instead of a large red pill. This is presentation-only and does not change the room comment send path.

## Right Bubble Rail

The participant rail now reuses the exact `LiveKitStageMediaSurface` bubble-grid surface used by the regular shared player. Fullscreen no longer maps `liveBubbleParticipants` into a separate look-alike bubble renderer. That keeps the real LiveKit camera/avatar/placeholder behavior aligned between regular portrait shared player and fullscreen.

Fullscreen passes the same join contract, participant labels, roster, request indicators, participant press handler, and publish flags that the regular shared player passes. It does not call the regular fallback card path, so the right rail must not show the `Shared Player` placeholder card or the copy `Shared playback stays here if the room drops back from live camera.`

If LiveKit is not available, fullscreen leaves the right rail empty rather than showing explanatory fallback text. No fake participants or fake LiveKit state are added.

## Regular Shared Player

Regular portrait shared player remains separate. The normal shared player still uses its existing video surface, compact Share / Report / speed controls, comments section, participant area, touch play/pause path, and fullscreen button.

## No-Change Boundaries

This layout change does not alter:

- LiveKit token issuer
- route ownership
- Party Room behavior
- old-room handling
- host approval
- canPublish logic
- room backend behavior
- payment or money state
- payouts, cash-out, withdrawal, transfer
- Stripe Android digital checkout

## Proof Status

Repo-side validation passed before the lane was documented. Android visual proof still requires a Premium-capable signed-in session because the available proof account currently has `premium` status `canceled` and the app correctly blocks the direct Watch-Party route.

Planned proof path:

`/tmp/chillywood-shared-player-custom-fullscreen-rails-proof-20260605/`
