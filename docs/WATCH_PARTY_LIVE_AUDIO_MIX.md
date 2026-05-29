# Watch-Party Live Audio Mix

Status: repo-side implemented, single-device Android proof captured; two-device speech proof pending.

May 29, 2026 burn-down update: the audio-mix code path was not changed. `adb devices -l` showed only `R5CR120QCBF`, with no second joined Android device/emulator/account available, so true speech-triggered ducking remains unproved. The feature remains single-device/control-surface proved only; do not claim two-device closure until Device A observes local video duck/restore when Device B speaks in the same Watch-Party Live shared Player.

## Route Ownership

- Watch-Party Live shared player: `app/player/[id].tsx` when `partyId` is present and `liveMode` is not enabled.
- Party Room shell: `app/watch-party/[partyId].tsx`. This lane does not change it.
- Live Watch-Party / Live Stage: `app/watch-party/live-stage/[partyId].tsx`. This lane does not change it.

## Behavior

Watch-Party Live keeps two audio paths separate:

- shared video audio stays local to the player
- voices stay in LiveKit room audio

Default local mix:

- Video: 85%
- Voices: 100%
- Auto-duck: on
- Ducked video: 30%
- Duck down: about 250ms
- Restore: about 700ms

When existing Watch-Party Live participant speaking state reports that a speaker is active, the shared player lowers local video volume. When speaking stops, the local player restores video volume smoothly. The app does not publish video audio to LiveKit and does not create a new LiveKit audio track for the video.

## UI

The `Audio Mix` control appears only in Watch-Party Live shared player controls. It is not shown in Party Room, Live Watch-Party / Live Stage, waiting rooms, setup screens, or room-code panels.

Current supported controls:

- Video volume slider
- Auto-duck toggle
- Reset to default
- Voices status at 100%

Current limitation: the shared LiveKit media surface does not expose a safe per-viewer voice gain control for existing subscribed tracks, so voices remain at room/system volume in this pass rather than showing a fake slider.

## Safety

This lane does not change:

- LiveKit token issuer
- LiveKit publish grants
- host/speaker/viewer roles
- old-room handling
- route ownership
- Premium gates
- shared playback sync authority

`npm run guard:watch-party-live-audio-mix` pins the Watch-Party Live-only scope and rejects video-audio publishing markers.

## Validation

Run for this pass:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:watch-party-live-audio-mix`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:content-rights-policy`
- `npm run guard:profile-production-policy`
- `npm run guard:money-center-policy`
- `npm run guard:stripe-connect-policy`
- targeted greps for Party Room / Live Stage / waiting room absence, LiveKit token issuer absence, no video-audio publisher, and no user-facing `Mini Platform`
- `git diff --check`
- `git diff --cached --check`

## Proof Status

Android device: `R5CR120QCBF`.

Screenshots path: `/tmp/chillywood-watch-party-live-audio-mix-proof-20260526/`.

Captured proof:

- Watch-Party Live waiting room: no `Audio Mix`.
- Party Room: no `Audio Mix`.
- Watch-Party Live shared player: `Audio Mix` visible in player controls.
- Default local player mix: Video `85%`, Auto-duck visible, Voices `100%`.
- Video slider moved to `32%`, proving the local control is reachable.
- Live Watch-Party waiting room: no `Audio Mix`.

UiAutomator returned `null root node` in the foreground React Native app, so proof uses `adb screencap`. Two-device proof remains the best follow-up for real speech-triggered ducking and is not claimed by this pass.
