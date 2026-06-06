# Shared Player Rails Exact Component Proof

Updated: June 5, 2026

## Scope

This lane fixes the Shared Player custom fullscreen rails by reusing the regular shared-player LiveKit bubble surface in fullscreen. It is a targeted UI/component reuse fix only.

It does not change LiveKit token issuance, publish authority, host approval, route ownership, old-room handling, backend room behavior, Player playback pipeline, monetization state, payouts, cash-out, withdrawals, transfers, or Stripe Android checkout policy.

## Implementation

`app/player/[id].tsx` reuses the same regular shared-player LiveKit bubble surface for fullscreen right rail:

- regular shared-player dock: `LiveKitStageMediaSurface` with `layout="bubble-grid"`
- fullscreen right rail: the same `LiveKitStageMediaSurface` with `layout="bubble-grid"`
- shared participant source: `watchPartyLiveKitParticipantRoster`, `watchPartyLiveKitParticipantLabelsByIdentity`, and `watchPartyLiveKitParticipantAvatarUrlsByIdentity`

The shared surface preserves LiveKit camera tracks, participant labels, request indicators, participant press behavior, and publish flags. It also accepts a shared avatar fallback map so regular portrait and fullscreen can render the same real avatar/camera-preview URL when a LiveKit camera track is not currently renderable.

Fullscreen Shared Player still uses the three-zone layout:

- left black rail for room comments
- large center shared video/player
- right black rail for participant bubbles

The left rail keeps the real room comment data and send handler through `renderPartyCommentsContent(true)`. The fullscreen rail placeholder is shortened to `Comment`, and the Send action is styled as a compact chip so it does not dominate the narrow rail.

The right rail now mounts the exact `LiveKitStageMediaSurface` bubble-grid surface used by regular shared player. It receives the same join contract, roster, labels, participant press handler, request indicators, surface label, and publish flags. The prior fullscreen-only look-alike bubble map was removed from the runtime path.

Fullscreen no longer renders the regular shared-player fallback card in the right rail. The right rail must not show `Shared Player` or `Shared playback stays here if the room drops back from live camera.` in fullscreen.

## Acceptance

Regular portrait shared player:

- regular shared-player surface still shows the working LiveKit bubble/avatar behavior
- shared player video and touch controls remain unchanged

Fullscreen shared player:

- left rail is compact and balanced
- comment placeholder is short
- Send is compact
- center player stays large
- right rail uses `LiveKitStageMediaSurface` bubble-grid behavior
- no fullscreen fallback card or fallback text appears
- no fake participants, comments, LiveKit state, room stats, or money rows are created

## Proof Path

Android proof should be captured at:

`/tmp/chillywood-shared-player-rails-exact-component-proof-20260605/`

Required captures:

- regular portrait shared player showing the working bubble
- fullscreen left comments rail
- fullscreen compact Send action
- fullscreen right rail using the same LiveKit bubble surface
- no fullscreen fallback card/text
- touch play/pause and fullscreen exit still work
