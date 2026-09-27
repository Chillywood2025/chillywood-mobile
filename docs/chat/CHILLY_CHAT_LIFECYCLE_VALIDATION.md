# Chi'lly Chat lifecycle validation map

This map covers the lifecycle source and follow-up correction based on protected
main `ee6ef44afdd923a141a5f63c51e6241f318a4b9d`. It is a source-validation map, not
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

The test operator records the exact protected source, OTA/build/update identity,
installed readback, devices, accounts, invite id, provider stamped on that
invite, and start/end timestamps before changing any row from `NOT RUN`.
Timing expectations are fixed before execution: incoming UI within 5 seconds of
the invite notification, event-driven media projection within 2 seconds,
heartbeat fallback within 15 seconds, recovered status only after the peer is
present, and End/capture/native-UI shutdown within the 4-second cleanup wait or
an explicit retryable failure. An automation selector, element lookup, tunnel,
or device-control failure is recorded as `AUTOMATION BLOCKED`; it is not an
application failure. A reproduced application result is `PASS` or `FAIL`.

### Direction × media × receiver state

Each row requires one ring/answer path, actual two-way audio, exactly one active
Room per endpoint, the invite's fixed provider on both endpoints, and adjacent
thread messaging before and after the call. Video rows additionally require
moving remote video in both directions rather than camera labels alone.

| Direction | Media | Receiver location/state | Status |
| --- | --- | --- | --- |
| Android → iPhone | voice | Same Chi'lly Chat thread | NOT RUN |
| Android → iPhone | voice | Elsewhere in the app | NOT RUN |
| Android → iPhone | voice | Backgrounded | NOT RUN |
| Android → iPhone | voice | Terminated | NOT RUN |
| Android → iPhone | video | Same Chi'lly Chat thread | NOT RUN |
| Android → iPhone | video | Elsewhere in the app | NOT RUN |
| Android → iPhone | video | Backgrounded | NOT RUN |
| Android → iPhone | video | Terminated | NOT RUN |
| iPhone → Android | voice | Same Chi'lly Chat thread | NOT RUN |
| iPhone → Android | voice | Elsewhere in the app | NOT RUN |
| iPhone → Android | voice | Backgrounded | NOT RUN |
| iPhone → Android | voice | Terminated | NOT RUN |
| iPhone → Android | video | Same Chi'lly Chat thread | NOT RUN |
| iPhone → Android | video | Elsewhere in the app | NOT RUN |
| iPhone → Android | video | Backgrounded | NOT RUN |
| iPhone → Android | video | Terminated | NOT RUN |

### Terminal, recovery, permission, route, and replacement cases

| Scenario | Required observation | Status |
| --- | --- | --- |
| Caller cancels before answer, each direction and media type | Receiver UI closes once; no Room/capture/membership remains | NOT RUN |
| Receiver declines, each direction and media type | Caller and receiver close once; no provider connection starts afterward | NOT RUN |
| Invite expires unanswered, foreground/background/terminated receiver | Native and app UI clear at expiry; late Answer cannot connect | NOT RUN |
| Remote End from Android, then from iPhone | Peer exits live UI; capture, durable membership, transport, and native UI clear | NOT RUN |
| Repeated microphone transitions from each endpoint | Two-way speech follows every mute/unmute; durable and UI state agree | NOT RUN |
| Repeated camera transitions and flip from each endpoint | Moving remote video closes/reopens; direction changes without duplicate publication | NOT RUN |
| Established peer disappears while foregrounded | Remaining endpoint stays Reconnecting, not Live, while peer is absent | NOT RUN |
| Absent peer returns | Recovery occurs only after peer presence/media return and within recorded timing | NOT RUN |
| Background/resume and supported screen-lock transition | No false Live state, stale capture, duplicate Room, or lost fixed-provider binding | NOT RUN |
| Microphone denial and return from Settings, each OS | Accurate denial UI; no bypass; authorized retry restores real audio | NOT RUN |
| Camera denial and return from Settings, each OS | Accurate denial UI; no bypass; authorized retry restores moving video | NOT RUN |
| Speaker/earpiece/Bluetooth or supported route interruption | Current call's intended native route wins; microphone remains singular and usable | NOT RUN |
| Cleanup followed by fresh voice call, each direction | Capture/native UI/membership clear, then a clean call succeeds | NOT RUN |
| Cleanup followed by fresh video call, each direction | Capture/native UI/membership clear, then moving video succeeds | NOT RUN |
| Same-account call replacement on the same room membership | Late cleanup cannot mute/leave the replacement; UI/native/durable state agree | NOT RUN |
| Account replacement while old work settles | Old account callbacks/mutations cannot affect the new account | NOT RUN |
| Adjacent messaging during cancel/decline/End/replacement | Existing messages remain isolated and new private messages deliver correctly | NOT RUN |

Expected compatibility namespaces remain
`1.0.0-android-production-v2` and `1.0.0-ios-production-v2`, subject to a fresh
binary/source compatibility check. No OTA, build, installation, or physical
qualification is authorized or claimed by this source document.
