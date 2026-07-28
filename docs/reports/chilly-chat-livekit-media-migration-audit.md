# Chi'lly Chat LiveKit media migration audit

Status: implementation and hosted fail-closed deployment complete. The iOS
internal OTA is installed on build 8; Android delivery and cross-platform
installed calls remain blocked on separate approval for an internal-channel
replacement binary. This document does not claim installed-call success.

## Product state retained in Supabase

- Direct-thread Voice Call and Video Call actions create one durable
  `chat_call_invites` record through the atomic begin path.
- Invite state remains `ringing`, `accepted`, `declined`, `canceled`, `missed`,
  `busy`, or `ended`, with timeout and retry behavior unchanged.
- `communication_rooms`, `communication_room_memberships`, and the thread's
  active-call fields remain the product-state authority.
- Push notification delivery, Android incoming-call notification routing, and
  iOS PushKit/CallKit presentation and action routing remain outside the media
  provider.
- Native answer, decline, cancel, end, and audio-activation/deactivation
  handoffs remain attached to the existing invite lifecycle.
- `chat_call_events` and transition deliveries remain the thread/history
  authority.
- Chat Call communication rooms retain `content_access_rule = open`; the
  migration adds no Premium requirement, entitlement bypass, or role grant.

## Media state replaced after acceptance

Legacy media was owned by `useCommunicationRoomSession`: local media streams,
`RTCPeerConnection`, Supabase Realtime offer/answer and ICE signaling, remote
streams, reconnect state, and media cleanup.

`useChatCallMediaSession` is now the single Chat Call media boundary. Each
invite is stamped server-side with exactly one immutable provider:
`legacy_webrtc` or `livekit`. The default and emergency-stop path remain
`legacy_webrtc`; both role-free internal canary participants must be enrolled
before a new invite can be stamped `livekit`.

For a `livekit` invite, `useLiveKitChatCallSession` owns:

- accepted-membership confirmation before token request;
- exact Chat Call token claim validation;
- LiveKit room connection, ICE/TURN, and reconnection;
- microphone/camera publication and remote subscription;
- speaker/earpiece routing and camera flip;
- background voice policy and foreground video restoration;
- first-audio and rendered-first-video evidence;
- local-track stop, room disconnect, audio-session stop, membership leave, and
  sanitized cleanup telemetry.

The provider is fixed for the invite lifetime. Both transports are never
enabled for the same call, and the LiveKit provider has no mid-call legacy
fallback.

## Exact LiveKit authority

The `chat-call` token path requires the authenticated user to match one of the
two direct-thread participants and verifies the exact invite, thread,
communication room, call type, accepted/unended state, immutable LiveKit
provider, active thread call linkage, exact two-person thread membership, and
fresh active communication-room membership. Any third active room participant
is denied. The backend derives `speaker` and issues room-join, publish,
subscribe, and data grants only after those checks.

## Sentinel evidence boundary

Chat Call stages originate only in the LiveKit provider. The collector strips
raw room, invite, and thread identifiers, stores only hashes, and requires a
recent successful exact-room `livekit_token_request_audit` record with join,
publish, and subscribe authority. A token request by itself remains
observational. Missing provider/SDK bindings or missing token corroboration is
classified `non_livekit_chat_call_evidence_rejected`; legacy WebRTC evidence
cannot satisfy the Chat Call LiveKit sentinel.

## Hosted and installed boundary

- Hosted migration `chilly_chat_livekit_media_rollout` is deployed.
- `chilly-chat-call-transition` version 6, `livekit-operator` version 46, and
  `livekit-token` version 139 are active.
- Public Chat Calls remain `legacy_webrtc`; canary is disabled, its emergency
  stop is engaged, and zero canary users are enrolled.
- Android/iOS Cognitive LiveKit switches remain off, shared LiveKit remains
  off, and Cognitive schedules remain 0/5.
- The six existing `chat-call` token-audit rows predate this migration and were
  created on 2026-06-27. They are not counted as migration proof.
- iOS update `019fa921-fb2c-754d-858b-578a26d67063` is installed on TestFlight
  build 8, runtime `1.0.0-iosqa1`, with two successful and zero failed launches.
- No Android OTA was published. Build 84 embeds the `production` update
  channel, which cannot be repurposed for this internal canary.
