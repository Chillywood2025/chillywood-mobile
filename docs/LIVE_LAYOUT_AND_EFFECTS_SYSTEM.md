# Live Layout And Chi’llyfects System

Date: 2026-04-27

Status: layout and Chi’llyfects foundation implemented in code, Android/two-device runtime proof pending. Chi’llyfects status is `UI Implemented / No Camera Processing`: the catalog and controls exist, but outgoing LiveKit camera tracks are not processed. Real Chi’llyfects AR processing is post-v1. The Snap Camera Kit audit is complete in `docs/CHILLYFECTS_SNAP_CAMERA_KIT_AUDIT.md` as planning input only; Public v1 must not add Snap Camera Kit, DeepAR, MediaPipe processing, custom WebRTC frame processors, or any native AR SDK. The user-approved major layout structure is locked by `docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md`.

## 1. System Purpose

Chi'llywood has two live-feeling room families that must stay visually and logically distinct:

1. Live Watch-Party is the Home live-first social room and camera-stage experience. It is people-first.
2. Watch-Party Live is the Player/content shared-viewing experience. It is content-first.

This system defines the layout contract, participant presentation rules, comments posture, and Chi’llyfects foundation for both. It prevents future work from routing content watch parties into Live Stage, from hiding live participants behind a single hero surface, or from presenting Chi’llyfects/camera effects as real before outgoing video processing exists.

The current comments placement is part of the locked structure. Comments must stay visible in their current placement unless the user explicitly asks for a comments redesign. Do not move comments into a tap menu, drawer, modal, bottom sheet, overlay-only surface, hidden secondary panel, or menu-only replacement.

## 2. Route Ownership

| Experience | Route family | Route owner | System owner | Must not own |
| --- | --- | --- | --- | --- |
| Live Watch-Party | Home -> `/watch-party?mode=live` -> `/watch-party/live-stage/[partyId]` | `app/watch-party/index.tsx`, `app/watch-party/live-stage/[partyId].tsx` | Live Stage / LiveKit | Platform title playback, creator-video party playback, Player route behavior |
| Watch-Party Live | Player -> `/watch-party` -> `/watch-party/[partyId]` -> Player with `partyId` | `app/player/[id].tsx`, `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx` | Watch-Party / Party Room | Live Stage camera routing, Home live-first room behavior |
| LiveKit media rendering | Live Stage media surface | `components/watch-party-live/livekit-stage-media-surface.tsx` | LiveKit media surface | Room source ownership, upload management, billing |
| Chi’llyfects foundation | Live room UI + shared metadata | `_lib/liveEffects.ts`, `components/live/live-effects-sheet.tsx` | Chi’llyfects System | Real AR processing before the post-v1 native/video processor lane |

Buttons only trigger these owners. A button labeled Watch-Party Live from Player must enter the normal Party flow. A Home Live Watch-Party entry must enter Live Stage.

2026-04-28 route hardening:

- Party waiting room create/code paths now refuse no-source Party Room creation instead of silently creating live rooms.
- Invalid platform title ids do not fall back to the first title.
- Direct Live Stage opens reject non-live Party Room ids with honest copy.
- Player Watch-Party Live rejects live room ids and preserves platform source context when falling back to the waiting room.
- The LiveKit token edge function rejects Live Stage / Watch-Party Live surface mismatches.

These are route/source guards only. They did not move comments, compact the approved structure, change LiveKit ownership, add monetization, or add real Chi’llyfects processing.

## 3. Live Watch-Party Behavior

Live Watch-Party is people-first. The Live Stage route should make the room feel like a live multi-person space:

- Other live camera feeds are visible together in the Chi'lly Party Members grid.
- The current user's own camera preview must not appear inside that grid; the local user remains represented by the hero/local preview and controls.
- The host tile has a clear Host badge.
- The selected/focused participant can still be shown in the hero/live media surface, but the grid remains the visible home for people.
- Room comments and reactions stay visible in the lower dock.
- Host controls stay attached to live-stage moderation/focus behavior.
- Live First and Live Watch-Party mode toggles remain inside Live Stage only.
- Viewers can watch free rooms or rooms their account can access through Premium/party-pass monetization rules without being promoted into the visible camera grid.
- Live Stage must not become the shared video Party Room for creator or platform titles.

Current implementation:

- `app/watch-party/live-stage/[partyId].tsx` renders the Chi'lly Party Members overlay only for hybrid Live Watch-Party mode. Live First must not show that box.
- The grid uses real remote live feeds, membership state, and LiveKit/RTC track fallbacks where available.
- The grid excludes the current user and lays out remote feeds three across by two visible rows before vertical scroll.
- Viewer camera-seat request copy is visible and honest.
- Host moderation/focus controls remain attached to active member tiles.

## 4. Watch-Party Live Behavior

Watch-Party Live is content-first. The normal Party Room route should keep the shared source above the social layer:

- The shared screen/source card appears before participant controls.
- The source identity remains explicit: `platform_title` or `creator_video`.
- Creator-video rooms keep `source_type=creator_video` and `source_id` equal to the creator video id.
- Platform title rooms keep `source_type=platform_title`.
- Participants appear below the shared screen/source area.
- Host and viewer camera/feed bubbles are arranged below the shared screen in a compact social grid.
- The first view should support five feed bubbles across and two visible rows before vertical scroll, with more feeds browsable without covering the shared content.
- Room comments and room controls support shared viewing without pretending to be Live Stage.
- Playback continues through the standalone Player route, preserving the existing Player watch surface.

Current implementation:

- `app/watch-party/[partyId].tsx` renders a shared-screen card for non-live Party Rooms.
- The card shows room code, source type, source id, and opens shared playback through existing Player navigation.
- The normal Party Room feed area keeps host/viewer bubbles below the source card in a five-across, two-row-visible scroll grid instead of a competing Live Stage overlay.
- Comments are backed by `watch_party_room_messages` through `sendPartyMessage(...)`.
- The Party Room route does not navigate creator-video or platform-title watch parties into `/watch-party/live-stage/[partyId]`.

## 5. Participant Grid Rules

Live Watch-Party grid rules:

- Exclude the current user's own local feed from the Chi'lly Party Members grid.
- Show only other visible live feeds in the grid.
- Use three columns and two visible rows, so six remote feeds are visible before scrolling.
- Support scrolling through at least 25 live feeds without adding fake tiles.
- Muted states must be visible.
- Camera-off states show initials or profile media, not fake camera.
- LiveKit track rendering should use real subscribed/local tracks only.
- No fake participant tiles count as proof.

Watch-Party Live participant rules:

- Participants appear below the shared source/screen.
- Participant strip/grid supports host, viewer, muted, speaker, and reaction state.
- The visible Party Room feed grid should show up to ten bubbles at a glance, five across and two rows high, then scroll for additional room members.
- The bottom Live Stage participant strip must not compete with the content-first Party Room surface.

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
- The current comments placement is locked by `docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md`.
- Do not replace the visible comments placement with menu-only comments or move it into a tap menu, drawer, modal, bottom sheet, overlay-only surface, or hidden secondary panel.
- Reactions stay separate from text comments.

Watch-Party Live:

- Party Room now has a shared viewing comments card.
- It reads recent `watch_party_room_messages`.
- It sends text comments through `_lib/watchParty.ts` `sendPartyMessage(...)`.
- The current comments placement is locked by `docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md`.
- Do not replace the visible comments placement with menu-only comments or move it into a tap menu, drawer, modal, bottom sheet, overlay-only surface, or hidden secondary panel.
- Comments are text-only for Public v1. Comment media upload remains post-v1.

## 9. Chi’llyfects System Purpose

Chi’llyfects is the user-facing brand for Chi'llywood live camera looks and AR/effects. The internal code-safe name is `chillyfects`; existing low-risk owner files may remain named `liveEffects` until a dedicated refactor is approved.

The Chi’llyfects System creates a reusable metadata/UI foundation for live camera effects without pretending real AR/video processing is already implemented.

The foundation owns:

- Chi’llyfect category definitions
- Chi’llyfect item metadata
- selected Chi’llyfect UI state
- honest status labels
- cross-route Chi’llyfects panel
- v1/later scope boundary

It does not own:

- LiveKit token minting
- outgoing camera track processing
- AR SDK integration
- face analysis
- paid Chi’llyfects
- creator monetization

Current implementation truth:

- Live Stage opens a Chi’llyfects panel from the approved controls location.
- Party Room / Watch-Party Live opens the shared Chi’llyfects panel inside the approved content-first structure.
- Player-side live overlay copy is branded as Chi’llyfects preview-only.
- `Off` is the only real active camera state.
- No beauty, makeup, funny, glam, mirror, AI/aging, or face-card Chi’llyfect processes the outgoing LiveKit camera track in this build.

## 10. Chi’llyfects Categories

The current metadata model defines these categories:

- Off
- Beauty / Retouch
- Appearance / Makeup
- Distortion / Funny
- AI / Aging
- Glam / Signature
- Mirror / Invert
- Novelty / Face-card

Each Chi’llyfect item includes:

- `id`
- `label`
- `category`
- `status`
- `phase`
- `description`
- `requiresNativeProcessor`
- optional `intensity`

## 11. V1 Chi’llyfects Scope

V1 scope is foundation only:

- `Off` is the only real active camera state.
- Chi’llyfects can be selected in UI as catalog/foundation state.
- Non-Off Chi’llyfects are marked coming soon or preview-only and are not applied to outgoing camera output.
- No camera beautification, makeup, aging, face scan, or AI transformation is claimed as active.
- Do not add Snap Camera Kit, DeepAR, MediaPipe processing, custom WebRTC frame processors, native AR SDKs, or heavy camera-processing dependencies before Public v1.

## 12. Post-v1 Chi’llyfects Scope

Post-v1 Chi’llyfects may include:

- real local preview effects
- outgoing LiveKit track processing
- safe mirror/invert tools
- beauty/retouch controls
- appearance/makeup looks
- funny distortions
- branded glam/signature looks
- AI or aging effects after privacy, consent, safety, and model review
- novelty face-card style frames that do not rate attractiveness or sensitive traits

These need a separate post-v1 implementation lane and runtime proof.

## 13. Post-v1 Technical Requirements For Real Processing

Post-v1 real Chi’llyfects require:

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
- explicit product approval that the Public v1 stability lane is complete enough to start native AR work

## 14. What Must Not Be Faked

- Do not show skin smoothing, makeup, aging, glam, face-card, or AI Chi’llyfects as active unless the camera output is actually processed.
- Do not use colored overlays on top of video and call them real camera processing.
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
- Confirm Live First does not show the Chi'lly Party Members box.
- Confirm Live Watch-Party shows the Chi'lly Party Members box.
- Confirm the current user's own tile is not inside the Chi'lly Party Members grid.
- Confirm other live feeds appear three across and two rows visible, with scroll for more live feeds.
- Confirm remote host badge is visible when the host is another participant.
- Confirm comments lane is visible and does not cover the grid.
- Confirm comments remain in their current visible placement and are not replaced by a menu-only/tap-only surface.
- Confirm viewer camera-seat request copy/action is honest.
- Confirm viewers can watch free/access-granted rooms without being shown as a camera tile until seated.
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
- Confirm no-source Party waiting room create/code actions block honestly instead of creating live rooms.
- Confirm invalid platform title ids show unavailable state instead of falling back to another title.
- Confirm direct Live Stage opens reject non-live Party Room ids.
- Confirm Player Watch-Party Live rejects live room ids.
- Confirm LiveKit token surface mismatch denial after the edge function is deployed.
- Confirm comments send/read for joined members.
- Confirm comments remain in their current visible placement and are not moved into a drawer, modal, bottom sheet, overlay-only surface, hidden secondary panel, or menu-only replacement.

Chi’llyfects:

- Confirm Chi’llyfects UI opens in Live Stage.
- Confirm Chi’llyfects UI opens in Watch-Party Live Party Room.
- Confirm `Off` is the only real active state.
- Confirm coming-soon Chi’llyfects do not visually alter outgoing camera tracks.
- Confirm no Snap Camera Kit, DeepAR, MediaPipe processing, custom WebRTC frame processor, native AR SDK, or new native rebuild requirement was introduced before Public v1.

Validation:

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Android/two-device proof with screenshots/logs under `/tmp` in a later pass.
