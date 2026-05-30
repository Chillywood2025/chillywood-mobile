# LiveKit Simulcast Dynacast Policy

Date: 2026-05-30

Lane: LiveKit Simulcast Dynacast Safe Optimization Pass

## Summary

Chi'llywood now enables LiveKit `adaptiveStream: true` and `dynacast: true` only on the two current LiveKit camera-room constructors:

- Watch-Party Live shared-player camera seats through `components/watch-party-live/livekit-stage-media-surface.tsx`, consumed by `app/player/[id].tsx`.
- Live Watch-Party / Live Stage camera seats through `app/watch-party/live-stage/[partyId].tsx`.

The reusable LiveKit v1 options helper already explicitly sets `publishDefaults.simulcast = true` and mobile-safe camera capture defaults. This pass did not change LiveKit token issuance, role permissions, host/speaker/viewer approval, Watch-Party route ownership, Live Stage route ownership, Party Room behavior, old-room handling, Premium gates, Spectator tokens, standalone Player playback, HLS/VOD playback, or seat limits.

## Route Map

| Surface | Route/component | Publishes camera? | Subscribes to camera? | Current optimization status |
| --- | --- | --- | --- | --- |
| Watch-Party Live shared Player | `app/player/[id].tsx` + `LiveKitStageMediaSurface` | Yes, only approved camera/mic seats | Yes | `adaptiveStream: true`, `dynacast: true`, `simulcast: true` publish default |
| Live Watch-Party / Live Stage | `app/watch-party/live-stage/[partyId].tsx` | Yes, only host/approved speakers | Yes | `adaptiveStream: true`, `dynacast: true`, `simulcast: true` publish default |
| Party Room | `app/watch-party/[partyId].tsx` | Local preview/room state only; no direct LiveKit Room owner | No direct LiveKit Room owner | Untouched |
| Standalone Player / VOD / HLS | `app/player/[id].tsx` outside Watch-Party Live | No LiveKit camera room | No LiveKit camera room | Excluded |
| Spectator playback | `app/spectate/[itemId].tsx` | No | No | Excluded |
| Chi'lly Chat communication rooms | `app/chat/[threadId].tsx` + `useCommunicationRoomSession` WebRTC path | Separate direct RTC stack | Separate direct RTC stack | Excluded; not a LiveKit Room today |

## SDK Support Audit

`livekit-client` supports `RoomOptions.adaptiveStream` and `RoomOptions.dynacast`. The SDK default `publishDefaults` includes `simulcast: true`, `dtx: true`, and `red: true`; `Room` merges the SDK publish defaults with Chi'llywood's partial publish defaults, so Audio RED remains inherited without changing audio publish behavior.

No E2EE, AV1/VP9 codec switch, autoscaling, higher seat limit, token issuer change, or route ownership change was added.

## Chi'lly Chat Video Call Audit

Chi'lly Chat video calls do not currently create a LiveKit `Room`, render `LiveKitRoom`, call `createLiveKitV1RoomOptions`, or use `prepareLiveKitJoinBoundary`. The active chat call UI in `app/chat/[threadId].tsx` opens `useCommunicationRoomSession`, and that hook uses `@livekit/react-native-webrtc` directly through `new rtc.RTCPeerConnection`.

Because Chi'lly Chat calls are direct peer connections rather than LiveKit SFU rooms, LiveKit room-level `dynacast` and `adaptiveStream` are not applicable. Adding simulcast encodings to the peer mesh would require a separate WebRTC negotiation/performance lane and is not safe to fold into the LiveKit room optimization pass.

Current Chi'lly Chat video-call posture remains conservative:

- `COMMUNICATION_ROOM_MAX_PARTICIPANTS = 4`.
- Camera capture asks for 640x480 ideal, 1280x720 max.
- Frame rate asks for 15fps ideal, 24fps max.
- VP8 remains the preferred SDP codec in the existing communication hook.

No Chat permissions, block/privacy behavior, call membership, microphone/camera toggles, signaling, or reconnect handling changed. Future chat-call scaling should be a dedicated Communication RTC lane, not a LiveKit dynacast lane, unless Chi'lly Chat is intentionally migrated to LiveKit Room ownership first.

## Mobile Video Presets

Current Chi'llywood camera capture defaults remain conservative:

- 1280x720 max/target resolution.
- 30fps ideal/max.
- 1.7 Mbps camera encoding cap.
- LiveKit simulcast remains enabled through SDK-supported publish defaults.
- No manual higher-bitrate or higher-resolution preset was added.
- No custom lower-layer override was added; the current SDK documents default lower simulcast layers when custom layers are omitted.

This matches Public v1 guidance: 720p max for main speaker/camera where supported, 30fps max, and smaller grid/tile layers handled by LiveKit simulcast/adaptive subscription behavior.

## Audio RED Audit

The current SDK exposes `TrackPublishDefaults.red` and enables it by default for mono tracks. Chi'llywood did not add or override audio RED settings in this pass. Because the SDK merges publish defaults, the existing default packet-loss resilience stays in place where the SDK/runtime supports it.

No audio publish permissions, microphone authority, Watch-Party Live Audio Mix, or video-audio publisher behavior changed.

## Guard Coverage

`npm run guard:livekit-simulcast-dynacast-policy` proves:

- the shared LiveKit v1 helper keeps `simulcast: true`;
- both intended camera room constructors use `adaptiveStream: true` and `dynacast: true`;
- only two app camera-room call sites use `createLiveKitV1RoomOptions`;
- Party Room, standalone Player, and Spectator do not own LiveKit room options;
- Chi'lly Chat does not own LiveKit room options and stays on the direct RTC communication hook;
- Chi'lly Chat keeps its conservative four-participant and 640x480 ideal / 720p max / 24fps max video posture;
- no video-audio LiveKit publisher was added;
- `LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS` remains `4`;
- the LiveKit token issuer does not include adaptive/dynacast/simulcast room option logic.

## Android Proof

Device: `R5CR120QCBF`.

Proof path: `/tmp/chillywood-livekit-simulcast-dynacast-proof-20260530/`.

Captured:

- `01-app-open.png`: current release APK opens Home.
- `02-watch-party-entry.png`: Watch-Party waiting room route opens without crash.
- `03-live-stage-route.png`: invalid Live Stage room deep link resolves to the existing unavailable state without crash.
- `04-party-room-route.png`: invalid Party Room deep link resolves to the existing room-not-found state without crash.
- `crash-scan.log`: `0` matching fatal Android/React Native crash lines after route smoke.

Release APK: `android/app/build/outputs/apk/release/app-release.apk`, `205639147` bytes, installed successfully over the existing device session.

## Limitations

This pass does not claim multi-user performance proof. Only one Android device was attached (`R5CR120QCBF`), and no safe valid joined room fixture was available during the closeout. Camera/mic joined-room controls and remote video behavior still need a two-device/account proof.

Seat limits must not be raised until all of the following pass:

- TURN/cellular proof.
- Reconnect/background-forward proof.
- Two-device Watch-Party Live and Live Stage media proof.
- 10-participant staging/load proof.
- Server CPU/RAM/bandwidth metrics review.

Launch guidance remains 4 active speaker/camera seats until stronger proof exists.

## Validation

Closeout validation for this pass:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:livekit-simulcast-dynacast-policy`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:profile-production-policy`
- `npm run guard:spectator-child-room-policy`
- targeted grep/diff proof for token issuer, Party Room, old-room handling, standalone Player/HLS/VOD, video-audio publisher, and seat-limit non-change
- `git diff --check`
- `git diff --cached --check`
