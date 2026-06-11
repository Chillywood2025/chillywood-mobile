# Shared Player Fullscreen Bubble Reuse Proof

Updated: June 10, 2026

## Scope

- This lane fixes only the fullscreen right rail participant bubble in shared Watch-Party playback.
- Left comments rail and center player behavior remain unchanged.
- The implementation is component reuse only; it does not rewrite LiveKit, backend room logic, route ownership, or payment state.

## Exact Source Reused

In `app/player/[id].tsx`, regular portrait shared player renders the working real avatar/camera bubble through:

- `renderTitleParticipantExpandedPanel`
- `renderWatchPartySocialPanel`
- `renderWatchPartyBubbleGridSurface`
- `LiveKitStageMediaSurface`

Fullscreen right rail now calls the same portrait bubble surface from:

- `renderSharedFullscreenParticipantRail`
- `renderWatchPartyBubbleGridSurface(styles.sharedFullscreenLiveKitBubbleSurface)`
- `LiveKitStageMediaSurface`

## Shared Data And Fallback Order

The reused LiveKit bubble surface keeps the same portrait inputs:

- `watchPartyLiveKitParticipantRoster`
- `watchPartyLiveKitParticipantLabelsByIdentity`
- `watchPartyLiveKitParticipantAvatarUrlsByIdentity`
- LiveKit local/remote camera tracks
- `watchPartyLiveKitLocalParticipantFallback`
- `onWatchPartyLiveKitParticipantPress`

The same visual fallback order is preserved:

- LiveKit `VideoTrack`
- local participant camera fallback
- `participantAvatarUrlsByIdentity[identity]` image
- initials/status fallback only when portrait would also fall back

## Fix Detail

`renderSharedFullscreenParticipantRail` no longer renders:

- `renderParticipantPanel(false, false, true)`

That prior non-LiveKit rail path could show initials while portrait showed a real LiveKit camera/avatar bubble because its local camera preview was disabled when `shouldRenderWatchPartyLiveKit` was true.

The fullscreen right rail now renders the exact portrait LiveKit bubble surface when `shouldRenderWatchPartyLiveKit && watchPartyLiveKitJoinContract` is true. If that condition is false, the rail renders no participant fallback card, so it cannot show the old `Shared Player` card or `Shared playback stays here if the room drops back from live camera.` copy.

June 10 scroll stabilization keeps that same bubble surface but removes the previous threshold that only enabled vertical scrolling after more than 10 participants. The bubble-grid surface now always owns a vertical `ScrollView`, so narrow right-rail overflow scrolls inside the rail. This preserves the shared player size, left comments rail, bottom progress/player controls, roster ordering, and LiveKit participant fallback behavior.

## Boundaries Unchanged

- LiveKit token issuer / token flow
- LiveKit publish / `canPublish` logic
- Watch-Party route ownership
- host approval
- Party Room route and old-room handling behavior
- comments submit path and room stats
- monetization/payout/stripe behavior
- no fake comments or fake participants

## Proof

Proof path:

`/tmp/chillywood-shared-player-fullscreen-bubble-reuse-proof-20260605/`

EAS candidate update:

- channel/branch: `production`
- platform: `android`
- runtimeVersion: `1.0.0`
- update group: `40b451bc-f4fc-4929-9052-46baa8cff145`
- Android update ID: `019e9c1b-3a2e-7693-a949-5af7eaa4a243`

Device status:

- device: `R5CR120QCBF`
- package: `com.chillywood.mobile`
- installer: `com.android.vending`
- versionName/versionCode: `1.0.0` / `25`
- Expo Updates downloaded the candidate update and then reported no newer update on relaunch.
- User visual confirmation after the candidate OTA: shared-player fullscreen works.

Remaining gap:

- The device later locked behind PIN during automated screenshot capture, so repo-side closeout relies on the user visual confirmation for the final fullscreen avatar result rather than a committed screenshot.
- June 10 rail-scroll proof had one attached Android device (`R5CR120QCBF`) available. Real 2-user and overflow screenshots still require a second joined participant/device; no fake participants or fake room state were created.

June 10 scroll-stabilization update:

- commit: `b4ffd6b Stabilize shared player participant rail scrolling`
- EAS update group: `28f14786-d65a-4751-a9d8-db399140a6ac`
- Android update ID: `019eb4c5-4263-7ba2-9f25-09f6570b1762`
- validation: `npm run typecheck`, `npm run validate:runtime`, `git diff --check`, `git diff --cached --check`
