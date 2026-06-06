# Shared Player Rails Exact Component Proof

Updated: June 5, 2026

## Scope

This lane fixes the Shared Player custom fullscreen rails by reusing the regular shared-player participant bubble renderer in fullscreen. It is a targeted UI/component reuse fix only.

It does not change LiveKit token issuance, publish authority, host approval, route ownership, old-room handling, backend room behavior, Player playback pipeline, monetization state, payouts, cash-out, withdrawals, transfers, or Stripe Android checkout policy.

## Implementation

`app/player/[id].tsx` reuses the same regular shared-player participant bubble renderer for fullscreen right rail:

- regular shared-player dock: `renderParticipantPanel(true, true)`
- fullscreen right rail: `renderParticipantPanel(true, true, true)`
- shared item renderer: `renderSharedPlayerParticipantBubble`
- shared participant source: `liveBubbleParticipants`

The shared renderer preserves current-user camera preview, participant camera preview, participant avatar URL, initials fallback, host/co-host badges, mute/request/speaking state, reactions, and participant press behavior. Fullscreen only changes the outer rail layout/scroll mode; it no longer applies fullscreen-only item, avatar, name, or status styles to the bubble.

Fullscreen Shared Player still uses the three-zone layout:

- left black rail for room comments
- large center shared video/player
- right black rail for participant bubbles

The left rail keeps the real room comment data and send handler through `renderPartyCommentsContent(true)`. The fullscreen rail placeholder is shortened to `Comment`, and the Send action is styled as a compact chip so it does not dominate the narrow rail.

The right rail now mounts the exact regular shared-player participant bubble renderer. The prior fullscreen-only look-alike bubble map and the later fullscreen `LiveKitStageMediaSurface` rail were removed from the runtime path.

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
- right rail uses the regular shared-player participant bubble renderer
- no fullscreen fallback card or fallback text appears
- no fake participants, comments, LiveKit state, room stats, or money rows are created

## Proof Path

Android proof should be captured at:

`/tmp/chillywood-shared-player-rails-exact-component-proof-20260605/`

Required captures:

- regular portrait shared player showing the working bubble
- fullscreen left comments rail
- fullscreen compact Send action
- fullscreen right rail using the same regular shared-player participant bubble renderer
- no fullscreen fallback card/text
- touch play/pause and fullscreen exit still work
