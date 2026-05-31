# Player Surface Decomposition

Status: scoped mode split and standalone overlay standard implemented; full component extraction deferred.

## Current Modes

`app/player/[id].tsx` now resolves a `PlayerSurfaceMode` before rendering user-facing context:

- `standalone-title`: normal title playback.
- `standalone-creator-video`: creator video / public Platform video playback.
- `spectator-child-playback`: child-room playback sourced from Spectator.
- `watch-party-live-shared`: Watch-Party Live shared Player when `partyId` is present without Live mode.
- `live-watch-party-stage`: Live Watch-Party / Live Stage context.

The mode resolver is intentionally narrow. It only changes labels/presentation and does not alter playback, entitlement checks, comments/reactions, LiveKit, room ownership, or source visibility.

## Standalone Overlay Standard

As of May 29, 2026, standalone Player surfaces share the same production overlay format:

- top-left: backed Share/Report actions
- top-right: Watch-Party Live only when the source is eligible
- bottom: duration/progress, Back, fullscreen, and one compact `1x` speed control that cycles speed directly
- no standalone Playback sheet, no visible `Speed and quality` copy, and no user-facing Quality selector
- no loose speed pills across the video
- no giant red Auto quality card
- no fake quality variants
- no bottom Replay button; tap-to-replay remains the replay path

Covered surfaces are normal title/content Player, creator video / public Platform video Player, Rachi Originals through the shared Player route, and Spectator playback only where safe. Excluded surfaces are Watch-Party Live shared room Player, Live Watch-Party / Live Stage media, Party Room, and LiveKit participant video tiles.

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

Android proof for the May 30, 2026 playback regression/menu polish closeout lives at `/tmp/chillywood-standalone-player-playback-menu-fix-20260529/`. Root cause: Android native video/tap-layer ownership after the overlay pass left the video loaded but center tap-to-play did not reliably reach the standalone playback handler. The fixed Player routes native video touches through the overlay gesture target, keeps controls above that target, and normal title Player advanced to `0:03` on the installed release APK. ADB multi-touch/fullscreen visual proof remains partial; focal-point pinch zoom/reset is guarded in code and should be recaptured manually if a later lane needs gesture video proof.

Android proof for the May 30, 2026 follow-up playback-control simplification lives at `/tmp/chillywood-player-playback-control-20260530/`. The normal title Player no longer renders the standalone Playback sheet, visible `Speed and quality` copy, Auto quality row, or tune/settings icon. Quality stays automatic/internal, and the remaining compact `1x` chip cycles playback speed directly.
