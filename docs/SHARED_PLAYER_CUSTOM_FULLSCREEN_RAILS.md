# Shared Player Custom Fullscreen Rails

Updated: June 10, 2026

## Intent

Watch-Party Live Shared Player fullscreen is a custom Chi'llwood layout, not a normal fullscreen video mode. The intended fullscreen composition is:

- left dark rail for room comments
- large center shared player/video surface
- right dark rail for the same LiveKit participant bubbles used by the portrait shared-player surface

The left rail uses the existing room comments data and send path. The right rail uses the existing portrait shared-player LiveKit bubble surface. The center video keeps the existing playback surface and shared playback tap handler.

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

The participant rail now reuses the exact regular shared-player portrait bubble surface. Regular portrait shared player reaches `renderWatchPartyBubbleGridSurface` through `renderWatchPartySocialPanel`; fullscreen right rail calls the same `renderWatchPartyBubbleGridSurface(styles.sharedFullscreenLiveKitBubbleSurface)` path inside `renderSharedFullscreenParticipantRail`.

Fullscreen keeps the same LiveKit roster, participant labels, `watchPartyLiveKitParticipantAvatarUrlsByIdentity`, camera-track rendering, local participant fallback, avatar image fallback, initials fallback, request indicators, and participant press handler as regular portrait shared player. This avoids the former non-LiveKit `renderParticipantPanel(false, false, true)` rail path that could show initials while portrait showed the real image/camera bubble.

The fullscreen rail is guarded by `shouldRenderWatchPartyLiveKit && watchPartyLiveKitJoinContract`. It does not call the regular fallback card path, so the right rail must not show the `Shared Player` placeholder card or the copy `Shared playback stays here if the room drops back from live camera.`

Fullscreen does not show explanatory fallback text in the rail. No fake participants or fake LiveKit state are added.

June 10 scroll stabilization: `LiveKitStageMediaSurface` now always wraps the bubble-grid content in its own vertical `ScrollView`. This keeps participant overflow inside the right rail instead of letting extra tiles clip, push the center shared player, move the comments rail, or disturb the bottom player controls. The same backed roster still drives the list: the current user resolves to `You`, joined participants without camera tracks still render as avatar/initial/status placeholders, and ordering remains controlled upstream by `liveBubbleParticipants`.

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

Repo-side validation passed. EAS production candidate update group `40b451bc-f4fc-4929-9052-46baa8cff145` downloaded and applied on the Play-installed `R5CR120QCBF` runtime `1.0.0`; user visual confirmation reported the shared-player fullscreen view works after the final right-rail reuse fix.

June 10 scroll-stabilization update:

- commit: `b4ffd6b Stabilize shared player participant rail scrolling`
- EAS update group: `28f14786-d65a-4751-a9d8-db399140a6ac`
- Android update ID: `019eb4c5-4263-7ba2-9f25-09f6570b1762`
- validation: `npm run typecheck`, `npm run validate:runtime`, `git diff --check`, `git diff --cached --check`
- device availability: one attached device, `R5CR120QCBF`; true 2-user and overflow screenshots still need a second joined participant/device and were not faked

Proof path:

`/tmp/chillywood-shared-player-fullscreen-bubble-reuse-proof-20260605/`
