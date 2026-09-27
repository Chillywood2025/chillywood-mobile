# Chi'lly Chat lifecycle validation map

This map covers the bounded lifecycle correction that follows protected main
`691814ec8ff8dd863f014add0255a4110117cf23`. It is a source-validation map, not
an installed-device closeout. The qualification source is the eventual
protected-main merge of the lifecycle pull request; its exact commit, OTA IDs,
and installed update IDs must be recorded before any physical result counts.

## Lifecycle coverage

| Lifecycle area | Owning implementation | Required regression evidence | Remaining integration or device evidence |
| --- | --- | --- | --- |
| Start, accept, decline, cancel, expiry, remote End | `_lib/chillyChatCalls.ts`, `app/chat/[threadId].tsx`, provider hook cleanup | `scripts/test-chilly-chat-call-semantics.mjs`, native-action handoff test, mounted remote-End cleanup | Both directions and every terminal action on the exact installed candidate |
| Fixed provider per invite; legacy/LiveKit isolation | `hooks/use-chat-call-media-session.ts` | call-semantics/provider guards and mounted no-crossover cases | Confirm both test accounts enter the provider stamped on the invite |
| Account, invite, room, membership, and `Room` ownership | both media hooks; committed-session binding in `use-livekit-chat-call-session.ts` | mounted account/room/invite/generation replacement, stale callback, stale render-ack, and same-row cleanup cases | Account switch and fresh call after replacement on both devices |
| Initial microphone/camera publication | LiveKit initialization and strict membership write | mounted initial publication, permission, durable convergence, and fail-closed cases | Actual two-way audio and moving video, not labels alone |
| Mute/unmute, camera off/on, camera flip | provider control methods and shared communication controls | mounted strict control/compensation matrix; Android microphone exact-hook suite | Repeated controls from both endpoints; observe remote media and camera direction |
| Permission denial and return from Settings | media permission reconciliation in both provider hooks | mounted confirmed-denial, transient failure, Settings, and reconciliation cases | Deny/restore mic and camera on each OS; restore prior permission state afterward |
| Snapshot ordering and media notifications | monotonic snapshot ownership, `broadcastCommunicationRoomSignal`, private room Broadcast, LiveKit data hint | mounted old-read race; actual-hook two-peer camera projection; localhost two-client RPC/Realtime/read test | Measure event-driven peer update and the 15-second fallback on installed devices |
| Background, foreground, screen lock, native activation | AppState/native activation reconciliation | mounted background/foreground, foreground-with-absent-peer, CallKit activation, and native handoff suites | Foreground/background/terminated incoming calls and supported lock transitions |
| Reconnect, peer departure, peer return | shared `promoteCommittedSessionIfReady` readiness decision | mounted heartbeat, AppState, Reconnected, initialization, absent-peer and returning-peer cases | Measure recovery while peer is absent and after it actually returns |
| Room/account replacement | committed binding plus callback/listener ownership | mounted stale Room callbacks, post-await speaker callback, data event, cleanup, and participant/render ownership | Replace an account/call, then complete a new call without old media or UI |
| Cleanup, timers, listeners, retry | `cleanupSession`, effect disposal, membership subscription cleanup | independent/combined failure, ineffective result, timeout, repeated End, remote End, unmount, and replacement cases | Either endpoint Ends; capture, transport, native UI, and a subsequent fresh call are verified |
| Connected status, first media, rendered video | shared live-promotion decision; exact Room/publication render acknowledgment | mounted absent-peer recovery, old callback, first-audio, and stale-render cases | Record actual moving remote video and two-way audio before calling the session recovered |
| Adjacent messaging and native answer handoff | chat thread/inbox plus native action bridge | product suite, communication error suite, call semantics, native handoff | Private messages before/after calls; incoming foreground/background/terminated answer |

## Notification contract

Peer notifications are refresh hints. Durable membership remains authoritative.
The supported chain is:

1. The current session proves the local media transition and commits its exact
   membership state.
2. `_lib/communication.ts` calls the authenticated
   `broadcast_communication_room_signal` RPC.
3. The database derives sender and room authority and invokes
   `realtime.send` on the private `comm-room-<room>` topic.
4. The current receiver subscription validates the room and sender, then queues
   a paced authoritative snapshot read.
5. Only the newest current-session response updates participant projection; an
   exact current LiveKit track is rendered or removed from the peer tile.

`scripts/test-communication-room-realtime-delivery.mjs` exercises steps 1-4
against a localhost Supabase stack with two authenticated temporary users and
the real private Realtime delivery mechanism. The mounted LiveKit suite executes
the actual hook and proves steps 1, 4, and 5 together, including visible camera
removal. These tests are complementary; neither is physical-device proof.

## Finite two-device qualification matrix

Timing targets must be set before the run: event-driven media projection within
2 seconds, heartbeat fallback within 15 seconds, recovered status only after
the peer is present, and End/capture shutdown within the bounded cleanup window
or an explicit retryable failure.

| Scenario | Required observation | Status |
| --- | --- | --- |
| Android → iPhone voice; foreground incoming | Ring/answer once, audible speech in both directions, repeated mute/unmute | NOT RUN |
| iPhone → Android voice; background and terminated incoming | Native answer handoff, two-way audio, no duplicate connection | NOT RUN |
| Android → iPhone video | Moving remote video both ways; camera off/on and flip update the other endpoint | NOT RUN |
| iPhone → Android video | Moving remote video both ways; repeat camera and microphone transitions | NOT RUN |
| Foreground after established peer disappears | Remains Reconnecting while peer is absent; measured recovery after peer returns | NOT RUN |
| Background/resume and supported screen-lock transition | No false Connected state, stale capture, or duplicate Room | NOT RUN |
| Permission denial and return from Settings | Accurate mic/camera state, privacy stop, and successful authorized retry | NOT RUN |
| Supported audio-route interruption | Audio route and microphone recover without duplicate publication | NOT RUN |
| Android Ends; iPhone Ends | Capture stops, transport disconnects, native UI clears, durable membership leaves | NOT RUN |
| Fresh call after each End | A new call in both directions has clean ownership and working media | NOT RUN |
| Account/call replacement plus messaging | Old callbacks do not affect the replacement; adjacent private messaging remains intact | NOT RUN |

Expected compatibility namespaces remain
`1.0.0-android-production-v2` and `1.0.0-ios-production-v2`, subject to a fresh
binary/source compatibility check. No OTA, build, installation, or physical
qualification is authorized or claimed by this source document.
