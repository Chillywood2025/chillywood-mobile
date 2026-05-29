# Player Surface Decomposition

Status: scoped mode split implemented; full component extraction deferred.

## Current Modes

`app/player/[id].tsx` now resolves a `PlayerSurfaceMode` before rendering user-facing context:

- `standalone-title`: normal title playback.
- `standalone-creator-video`: creator video / public Platform video playback.
- `spectator-child-playback`: child-room playback sourced from Spectator.
- `watch-party-live-shared`: Watch-Party Live shared Player when `partyId` is present without Live mode.
- `live-watch-party-stage`: Live Watch-Party / Live Stage context.

The mode resolver is intentionally narrow. It only changes labels/presentation and does not alter playback, entitlement checks, comments/reactions, LiveKit, room ownership, or source visibility.

## Guardrails

- Audio Mix remains Watch-Party Live shared Player-only.
- Party Room remains `/watch-party/[partyId]`.
- Live Watch-Party / Live Stage remains `/watch-party/live-stage/[partyId]`.
- Spectator playback must use the controlled Spectator source path and must not expose original host controls, member lists, LiveKit tokens, raw storage paths, or original room authority.
- Creator/private/draft controls must not appear in public viewer modes.
- Premium gates and Party Pass checks stay in the existing access path.

## Deferred Extraction

Future extraction can split the large route into `PlayerHeader`, `PlayerMetadata`, `PlayerActions`, `PlayerWatchPartyCTA`, `PlayerComments`, `PlayerGateNotice`, and `PlayerAudioMix` only after a scoped proof lane preserves the guardrails above.

Android proof for the May 29, 2026 burn-down captured normal title mode at `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/06-player-normal-mode.png`.
