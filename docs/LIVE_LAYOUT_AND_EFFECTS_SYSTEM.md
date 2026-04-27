# Live Layout And Effects System

Date: 2026-04-27

Status: layout and effects foundation implemented in code, Android/two-device runtime proof pending.

## 1. System Purpose

Chi'llywood has two live-feeling room families that must stay visually and logically distinct:

1. Live Watch-Party is the Home live-first social room and camera-stage experience. It is people-first.
2. Watch-Party Live is the Player/content shared-viewing experience. It is content-first.

This system defines the layout contract, participant presentation rules, comments posture, and effects foundation for both. It prevents future work from routing content watch parties into Live Stage, from hiding live participants behind a single hero surface, or from presenting camera effects as real before outgoing video processing exists.

## 2. Route Ownership

| Experience | Route family | Route owner | System owner | Must not own |
| --- | --- | --- | --- | --- |
| Live Watch-Party | Home -> `/watch-party?mode=live` -> `/watch-party/live-stage/[partyId]` | `app/watch-party/index.tsx`, `app/watch-party/live-stage/[partyId].tsx` | Live Stage / LiveKit | Platform title playback, creator-video party playback, Player route behavior |
| Watch-Party Live | Player -> `/watch-party` -> `/watch-party/[partyId]` -> Player with `partyId` | `app/player/[id].tsx`, `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx` | Watch-Party / Party Room | Live Stage camera routing, Home live-first room behavior |
| LiveKit media rendering | Live Stage media surface | `components/watch-party-live/livekit-stage-media-surface.tsx` | LiveKit media surface | Room source ownership, upload management, billing |
| Effects foundation | Live room UI + shared metadata | `_lib/liveEffects.ts`, `components/live/live-effects-sheet.tsx` | Live Effects System | Real AR processing until native/video processor is built |

Buttons only trigger these owners. A button labeled Watch-Party Live from Player must enter the normal Party flow. A Home Live Watch-Party entry must enter Live Stage.

## 3. Live Watch-Party Behavior

Live Watch-Party is people-first. The Live Stage route should make the room feel like a live multi-person space:

- The host and participants are visible together in the Chi'lly Party Members grid.
- The host tile has a clear Host badge.
- The selected/focused participant can still be shown in the hero/live media surface, but the grid remains the visible home for people.
- Room comments and reactions stay visible in the lower dock.
- Host controls stay attached to live-stage moderation/focus behavior.
- Live First and Live Watch-Party mode toggles remain inside Live Stage only.
- Live Stage must not become the shared video Party Room for creator or platform titles.

Current implementation:

- `app/watch-party/live-stage/[partyId].tsx` renders the Chi'lly Party Members card in the stage overlay for Live First and hybrid Watch-Party mode.
- The grid uses real room participants, membership state, and LiveKit/RTC track fallbacks where available.
- Viewer camera-seat request copy is visible and honest.
- Host moderation/focus controls remain attached to active member tiles.

## 4. Watch-Party Live Behavior

Watch-Party Live is content-first. The normal Party Room route should keep the shared source above the social layer:

- The shared screen/source card appears before participant controls.
- The source identity remains explicit: `platform_title` or `creator_video`.
- Creator-video rooms keep `source_type=creator_video` and `source_id` equal to the creator video id.
- Platform title rooms keep `source_type=platform_title`.
- Participants appear below the shared screen/source area.
- Room comments and room controls support shared viewing without pretending to be Live Stage.
- Playback continues through the standalone Player route, preserving the existing Player watch surface.

Current implementation:

- `app/watch-party/[partyId].tsx` renders a shared-screen card for non-live Party Rooms.
- The card shows room code, source type, source id, and opens shared playback through existing Player navigation.
- Comments are backed by `watch_party_room_messages` through `sendPartyMessage(...)`.
- The Party Room route does not navigate creator-video or platform-title watch parties into `/watch-party/live-stage/[partyId]`.

## 5. Participant Grid Rules

Live Watch-Party grid rules:

- 1 participant: show a stronger solo tile.
- 2 participants: use a balanced split.
- 3-4 participants: use an even grid.
- More than 4 participants: use the scrollable grid and preserve host/focus priority.
- Muted states must be visible.
- Camera-off states show initials or profile media, not fake camera.
- LiveKit track rendering should use real subscribed/local tracks only.
- No fake participant tiles count as proof.

Watch-Party Live participant rules:

- Participants appear below the shared source/screen.
- Participant strip/grid supports host, viewer, muted, speaker, and reaction state.
- The bottom participant strip can remain as a compact quick-access layer as long as the content-first screen remains readable.

## 6. Host Tile Rules

- The host must be visibly distinguishable in Live Watch-Party.
- Host controls may appear when the host selects a non-host participant.
- Host tile cannot be removed by local moderation controls.
- Watch-Party Live host state remains room/playback authority, not Live Stage authority.

## 7. Request-To-Join Behavior

Current v1 foundation:

- Viewers can see honest request-to-join guidance in Live Stage.
- A viewer tile can request a camera/speaker seat when current room state supports it.
- Pending request copy is visible.
- Host can approve or deny seat requests from the active member tile where current room state supports it.

What remains proof-pending:

- Android/two-device proof that request state propagates and that host actions change the expected participant role.
- Runtime proof that a viewer without camera role does not publish camera unexpectedly.

## 8. Comments Behavior

Live Watch-Party:

- Live Stage owns live-room comments in its lower dock.
- Comments are visible without covering the whole participant grid.
- Reactions stay separate from text comments.

Watch-Party Live:

- Party Room now has a shared viewing comments card.
- It reads recent `watch_party_room_messages`.
- It sends text comments through `_lib/watchParty.ts` `sendPartyMessage(...)`.
- Comments are text-only for Public v1. Comment media upload remains post-v1.

## 9. Effects System Purpose

The Effects System creates a reusable metadata/UI foundation for live camera effects without pretending real AR/video processing is already implemented.

The foundation owns:

- effect category definitions
- effect item metadata
- selected effect UI state
- honest status labels
- cross-route effects panel
- v1/later scope boundary

It does not own:

- LiveKit token minting
- outgoing camera track processing
- AR SDK integration
- face analysis
- paid effects
- creator monetization

## 10. Effects Categories

The current metadata model defines these categories:

- Off
- Beauty / Retouch
- Appearance / Makeup
- Distortion / Funny
- AI / Aging
- Glam / Signature
- Mirror / Invert
- Novelty / Face-card

Each effect item includes:

- `id`
- `label`
- `category`
- `status`
- `phase`
- `description`
- `requiresNativeProcessor`
- optional `intensity`

## 11. V1 Effects Scope

V1 scope is foundation only:

- `Off` is the only real active camera state.
- Effects can be selected in UI as catalog/foundation state.
- Non-Off effects are marked coming soon and are not applied to outgoing camera output.
- No camera beautification, makeup, aging, face scan, or AI transformation is claimed as active.
- No new native AR SDK or heavy camera-processing dependency was added in this pass.

## 12. Later Effects Scope

Later effects may include:

- real local preview effects
- outgoing LiveKit track processing
- safe mirror/invert tools
- beauty/retouch controls
- appearance/makeup looks
- funny distortions
- branded glam/signature looks
- AI or aging effects after privacy, consent, safety, and model review
- novelty face-card style frames that do not rate attractiveness or sensitive traits

These need a separate implementation lane and runtime proof.

## 13. Technical Requirements For Real Processing

Real effects require:

- an approved native or JS video processing path
- proof that the outgoing camera track is processed, not just overlaid in UI
- Android dev-client/release rebuild impact review
- iOS impact review if shipped later
- LiveKit track compatibility proof
- CPU/GPU/thermal/battery proof on target devices
- opt-out/off state
- no sensitive trait classification
- no secret/token logging
- accessibility and safety copy for unsupported devices

## 14. What Must Not Be Faked

- Do not show skin smoothing, makeup, aging, glam, face-card, or AI filters as active unless the camera output is actually processed.
- Do not use colored overlays on top of video and call them real camera effects.
- Do not alter remote participant video without a real product/safety design.
- Do not add fake participants.
- Do not send Watch-Party Live from Player into Live Stage.
- Do not send Live Watch-Party from Home into the normal Party Room unless the user intentionally opens a room context.
- Do not fall back from creator-video party source to platform title or bundled sample video.
- Do not claim runtime proof from static validation.

## 15. Proof Checklist For Later Android/Two-Device Pass

Live Watch-Party:

- Open Home Live Watch-Party.
- Confirm waiting room routes to `/watch-party/live-stage/[partyId]`.
- Confirm Live Stage shows host and participant tiles together in Chi'lly Party Members.
- Confirm host badge is visible.
- Confirm comments lane is visible and does not cover the grid.
- Confirm viewer camera-seat request copy/action is honest.
- Confirm host approve/deny behavior if supported.
- Confirm no normal Party Room route is used for Home live flow.

Watch-Party Live:

- Open platform title Player and start Watch-Party Live.
- Confirm `/watch-party` waiting room then `/watch-party/[partyId]`.
- Confirm shared source card appears above participants.
- Confirm source type is `platform_title`.
- Open creator video Player and start Watch-Party Live.
- Confirm source type is `creator_video`.
- Confirm shared playback opens the correct Player source and no sample/platform fallback happens.
- Confirm Party Room does not route to Live Stage.
- Confirm comments send/read for joined members.

Effects:

- Confirm Effects UI opens in Live Stage.
- Confirm Effects UI opens in Watch-Party Live Party Room.
- Confirm `Off` is the only real active state.
- Confirm coming-soon effects do not visually alter outgoing camera tracks.
- Confirm no new native dependency or rebuild requirement was introduced in the foundation pass.

Validation:

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Android/two-device proof with screenshots/logs under `/tmp` in a later pass.
