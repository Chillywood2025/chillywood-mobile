# Live Watch-Party Layout Lock

Date: 2026-04-27
Last updated: 2026-05-01

Status: user-approved layout contract. Runtime proof remains tracked separately.

## 1. Purpose

This document locks the current user-approved major layout structure for two separate Chi'llywood experiences:

- Live Watch-Party / Live Stage
- Watch-Party Live / Party Room

The lock exists because these two experiences have different product jobs and must not drift together:

- Live Watch-Party is the Home live-first social room. It is people-first.
- Watch-Party Live is the Player/title/creator-video watch-together flow. It is content-first.

Future Codex passes must treat this document as layout product truth. Do not reinterpret the room structure, move comments, compact the layout, or route one experience into the other unless the user explicitly asks for that specific redesign.

## 2. What The Lock Protects

The lock protects:

- major screen structure
- route ownership
- content vs people placement
- participant grid placement
- visible comments placement
- source behavior
- LiveKit ownership
- no fake proof behavior

The lock does not permanently freeze:

- button/control placement
- control labels
- optional control removal
- visual refinements
- Chi’llyfects controls

Those flexible items are allowed only when the user explicitly requests them, and they must preserve the locked structure. Controls may move later by explicit request; comments may not move unless the user explicitly asks for a comments redesign.

## 3. Locked Live Watch-Party Layout

Route owner:

- `app/watch-party/live-stage/[partyId].tsx`

System owners:

- Live Stage / LiveKit route behavior
- Live First and Live Watch-Party mode behavior
- live participant media and stage state
- visible Live Stage comments
- stage controls and Chi’llyfects foundation

Locked structure:

- Live Watch-Party stays people-first.
- Live First must not show the Chi'lly Party Members box.
- Live Watch-Party mode owns the Chi'lly Party Members box.
- The Chi'lly Party Members grid remains the approved visual home for other live user feeds.
- The current user's own preview is not inside the Chi'lly Party Members grid.
- Live Watch-Party must keep real other host/viewer feeds in the Chi'lly Party Members box; do not empty the box to avoid a duplicate.
- Other live user feeds render in the approved grid behavior: three across, two visible rows, then scroll for more live users.
- The host tile/badge behavior remains visually clear and consistent with the rest of the grid.
- Host and participant tiles must not be replaced by fake placeholders as proof.
- Camera-off and unavailable states must be honest.
- Viewers may watch free rooms or rooms they can access through monetization/access rules without automatically becoming a camera tile.
- Request/join camera behavior stays inside Live Stage and must be honest when unsupported or pending.
- The visible comments area stays in its current lower dock placement.
- Comments must not be replaced by menu-only comments.
- Comments must not be moved into a tap menu, drawer, modal, bottom sheet, overlay-only surface, or hidden secondary panel.
- The overlay/comments dock auto-hide behavior is locked: entering Live Stage from the Live Room starts with the overlay visible and arms the 10-second auto-hide timer.
- Switching between Live First and Live Watch-Party resets and re-arms the same 10-second auto-hide timer for both modes.
- Lock Controls keeps the overlay/comments dock visible until unlocked.
- Open comments, focused comment input, menus, reactions, studio controls, and Chi’llyfects panels may keep the overlay visible while active, but they must not move comments out of the current placement.
- Controls may be refined only inside the approved structure and only by explicit user request.
- Chi’llyfects controls may be refined inside approved locations, but fake AR/camera processing is forbidden.
- Stream, LiveKit, RTC, audio, token, reconnect, stale-room, and media fixes must preserve the locked UI. They must not move buttons, boxes, player, composer, comments, member tiles, labels, or routes.

Must not happen:

- Do not redesign Live Stage.
- Do not compact Live Stage into a different structure.
- Do not show the Chi'lly Party Members box in Live First.
- Do not replace the Chi'lly Party Members grid with another visual model.
- Do not move or hide visible comments.
- Do not route Home Live Watch-Party into normal Party Room.
- Do not make the host feed darker or visually inconsistent.
- Do not hide real participant tiles.
- Do not remove real other host/viewer feeds from the Chi'lly Party Members box as a duplicate workaround.
- Do not use fake participant placeholders as proof.

## 4. Locked Watch-Party Live Layout

Route owners:

- `app/watch-party/index.tsx`
- `app/watch-party/[partyId].tsx`
- `app/player/[id].tsx`

System owners:

- Player/title/creator-video Watch-Party Live entry
- Party Waiting Room
- Party Room
- shared source behavior
- visible Party Room comments
- participant bubbles below the shared content

Locked structure:

- Watch-Party Live stays content-first.
- The shared content/source surface stays at the top.
- People/participants stay below the shared content.
- Host and viewer feed bubbles stay below the content in the approved Party Room structure.
- The visible comments area stays in its current placement in the Party Room structure.
- Comments must not be replaced by menu-only comments.
- Comments must not be moved into a tap menu, drawer, modal, bottom sheet, overlay-only surface, or hidden secondary panel.
- Controls may be moved, deleted, renamed, or refined later only by explicit user request and only inside the approved layout structure.
- `platform_title` source behavior must stay platform-title source behavior.
- `creator_video` source behavior must stay creator-video source behavior.
- Creator-video Watch-Party must keep normal Party flow and must not route into Live Stage.

Source behavior:

- Platform titles use `source_type=platform_title`.
- Creator uploads use `source_type=creator_video`.
- Creator-video playback opens `/player/[id]?source=creator-video`.
- Platform title playback opens normal platform Player routes.
- No platform-title fallback is allowed for creator-video rooms.
- No bundled sample fallback is allowed for creator-video rooms.

Must not happen:

- Do not move the shared content away from the top.
- Do not move people/participants away from below the content.
- Do not move or hide visible comments.
- Do not replace visible comments with a menu/tap-only comments surface.
- Do not route Watch-Party Live into Live Stage.
- Do not route creator-upload Watch-Party into Live Stage.
- Do not fake a room or source if source resolution fails.

## 5. Allowed Future Changes

Allowed only when explicitly requested by the user:

- move controls
- delete controls
- rename controls
- add controls inside the approved structure
- small spacing/padding/polish refinements
- accessibility improvements
- performance improvements
- Chi’llyfects button/panel additions inside approved locations
- badges/status indicators
- loading/error state improvements
- telemetry/logging that does not expose secrets
- source/access/security fixes that preserve layout

Control changes must not disturb the current comments placement or major screen structure.

## 6. Forbidden Future Changes Without Explicit User Approval

Forbidden without explicit user approval:

- moving or removing the visible comments area
- replacing visible comments with menu/tap-only comments
- moving comments into a drawer, modal, bottom sheet, hidden secondary panel, or overlay-only surface
- redesigning comments
- showing the Chi'lly Party Members box in Live First
- moving Watch-Party Live content away from the top
- moving Watch-Party Live people/participants away from below the content
- replacing the Chi'lly Party Members grid with a different visual structure
- turning Watch-Party Live into Live Stage
- turning Live Stage into Party Room
- hiding real participant tiles
- replacing real video tiles with fake placeholders
- compacting the layout to simplify it
- making host feed darker or visually inconsistent
- changing route ownership
- breaking `creator_video` / `platform_title` source behavior
- enabling fake Chi’llyfects or fake camera effects
- rerouting creator-upload Watch-Party to Live Stage

## 7. Required Guardrail For Future Prompts

Future prompts touching these files must say:

> Follow docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md. Preserve the locked layout. Controls may be changed only when explicitly requested and must stay inside the approved structure. Visible comments must remain visible in their current placement and must not be replaced by menu-only comments.

Relevant files:

- `app/watch-party/live-stage/[partyId].tsx`
- `app/watch-party/[partyId].tsx`
- `app/player/[id].tsx`
- `components/watch-party-live/livekit-stage-media-surface.tsx`
- `components/live/live-effects-sheet.tsx`
- `_lib/liveEffects.ts`

## 8. Proof Checklist

Manual proof items:

- Live Stage route opens at `/watch-party/live-stage/[partyId]`.
- Live Watch-Party layout still matches the approved current screen.
- Live First does not show the Chi'lly Party Members box.
- Live Watch-Party shows the Chi'lly Party Members box as the people-first visual home for other live feeds.
- Current user's own preview is not inside the Chi'lly Party Members grid.
- Real other host/viewer feeds remain visible in the Chi'lly Party Members box.
- Visible comments remain visible in their current placement.
- Comments are not moved into menu-only/tap-only behavior.
- Comments are not moved into a drawer, modal, bottom sheet, overlay-only surface, or hidden secondary panel.
- Entering Live Stage from the Live Room auto-hides the overlay/comments dock after 10 seconds unless controls are locked or an active panel/input is open.
- Switching Live First to Live Watch-Party and back resets the same 10-second auto-hide behavior in both modes.
- Lock Controls keeps the overlay/comments dock visible in both modes.
- Watch-Party Live content remains at the top.
- Watch-Party Live people/participants remain below the content.
- Platform-title Watch-Party remains normal Party flow.
- Creator-video Watch-Party remains normal Party flow.
- Creator-video Watch-Party does not route to Live Stage.
- No route drift occurs between Live Stage and Party Room.
- Stream/media fixes do not change the locked UI.
- No fake participant tiles or fake Chi’llyfects/effects are used as proof.
