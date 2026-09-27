# Chi'lly Chat lifecycle validation map

This map covers the lifecycle source and follow-up correction based on protected
main `ee6ef44afdd923a141a5f63c51e6241f318a4b9d`, plus the physical qualification
attempt for PR #528. Source tests and physical evidence remain separate: a row
counts only for the exact installed update and observations recorded below.

## PR #528 internal qualification record

The qualified source was protected merge
`cb35e0a2984d98f0e7c9f88b55676dd9671552ce`, tree
`9188268b86ecdd6f816b5168817b2a6d88847644`, from validated PR head
`26339eb8c1f4df9597733bad390044a49e47635d`. Required Validation run
`36304651616` succeeded for that head.

| Platform | Existing signed binary | Installed PR #528 update | Runtime / internal channel | Uptake proof |
| --- | --- | --- | --- | --- |
| Android | build 92; EAS build `b88caea9-17e8-4abf-b8c5-837f233a0f7f`; artifact SHA-256 `538959defd5cebe4b640d3469b0ba19aae49c912e385efedde18c9bd1cead270` | update `01a0e30f-d8bb-77e6-b115-e8154aaf057e`; group `9b81aa15-a317-40e7-bfed-ece01a48173d` | `1.0.0-android-production-v2` / `android-internal-v2` | Physical App Info readback on the designated Samsung test device; embedded=false; emergency=false; stable cold launch |
| iOS | build 21; EAS build `dca98686-b7cb-490e-9aa4-b69078bbe69c`; artifact SHA-256 `8c42429b4918597b098a298693cc3e5f573adff5f6b7091eb2406b9119a23d2f`; native-call capability verified | update `01a0e314-4be0-7223-bfa5-7047b55867d2`; group `ca8bce31-080e-401d-b580-ce1348435095` | `1.0.0-ios-production-v2` / `ios-internal-v2` | Physical App Info readback on the designated iPhone test device; embedded=false; emergency=false; stable cold launch |

Both calls exercised below used the invite's LiveKit provider. A private message
sent from Android before the calls arrived in the designated iPhone thread.
Publication and uptake did not reach a public or production channel.

### Confirmed regression and rollback

An Android-to-iPhone same-thread video call initially connected and rendered
moving remote video. After the iPhone microphone was muted and unmuted, Android
lost the iPhone video and remained at `Camera Connecting` beyond the 15-second
fallback while the endpoints disagreed about the call/media state. A second
call reproduced the same remote-video loss. This is an application failure, not
an automation selector failure.

The matrix stopped at that serious regression. The canonical rollback path
republished the last compatible PR #526 source
`691814ec8ff8dd863f014add0255a4110117cf23`, tree
`bb1aba7117c80cdf6ce85e3a6483c0c324f75cd5`, to the same internal audiences:

| Platform | Rollback update / group | Installed readback |
| --- | --- | --- |
| Android | `01a0e339-d49f-7538-a71a-d40104901c05` / `0040d1b5-f6db-40ba-83ec-4b208443b202` | build 92, exact rollback update, expected runtime/channel, embedded=false, emergency=false, two stable cold launches |
| iOS | `01a0e33a-0c9a-7c48-8457-772b1e59f760` / `3ccbfe1f-e6bb-43d8-b34d-d0bdd6d40550` | build 21, exact rollback update, expected runtime/channel, native-call capability retained, embedded=false, emergency=false, two stable cold launches |

A focused rollback comparison retained remote video through the same iPhone
mute/unmute sequence, although PR #526 still showed an imperfect iPhone unmute
state. This comparison narrows the regression to the changed source range; it
does not isolate the native mechanism. Late retired-call capture cleanup is a
working hypothesis until a trace connects that operation to the interrupted
current track. PR #526 is not represented as fully qualified.

## SDK-faithful recovery correction

The follow-up source correction is based on merged PR #529
`e66c1a5829c07dbb82d3a946853e0ca26832b090`. It closes independently reproduced
source-level gaps; it has not established the physical incident's root cause or
passed physical qualification.

- Recovery rechecks exact call/Room ownership and current foreground/media
  intent after asynchronous setup and immediately before native mutations.
- An ended but still-unmuted SDK publication is explicitly restarted through
  the installed SDK's supported `restartTrack()` method. Automatic reacquisition
  requires a read-only permission result of granted; it does not prompt.
- Healthy publications are preserved. A restart that outlives its owner or
  foreground intent retires its exact track and cannot mark a new call ready.
- Failed recovery projects observed publication state into the UI and durable
  membership while retaining a warning, rather than reporting the requested
  state as successful.
- Required camera shutdown precedes microphone permission/restart waits so
  background video cannot remain active because microphone recovery fails.
  Background events also stop the exact current camera track synchronously,
  before queued work, when microphone recovery was already pending. The SDK
  sender remains available for normal publication retirement; failed capture
  shutdown initiates exact-Room termination independently of that queue.
  This immediately stops local capture and updates local UI; peer membership
  projection still follows serialized reconciliation after pending work settles.

The mounted tests separate publication mute state from native-track lifetime.
`tests/livekit-track-lifetime.test.mjs` also exercises the real locked LiveKit
enable/unmute/restart implementations with only the native capture boundary
stubbed. Healthy Android/iOS control loops verify that working tracks do not
restart and that Room, account, and provider identity remain unchanged.

These are source and SDK-contract proofs. Native hardware shutdown, two-way
speech, moving remote video, and device-specific ordering still require the
physical steps below.

### Run the observed failure before the full matrix

After a separate authorization for the exact corrected internal source, verify
both installed update IDs and use the designated consenting accounts:

1. Cold-launch both apps with no preceding call. Establish Android-to-iPhone
   video, moving remote video and two-way speech; perform three iPhone
   microphone mute/unmute cycles.
2. End, immediately start a new same-thread video call, and repeat. Compare with
   a new call after cleanup has visibly settled; a timer is not cancellation.
3. Repeat the focused sequence in the reverse direction.
4. If a failure occurs, record a short sanitized timeline of operation
   start/settlement, current/retired Room and track identity, app/audio state,
   actual sending/receiving/decoded frames where available, and visible video.
   Do not record tokens, message contents or private account identifiers.
5. If a cold first call fails without any retired operation, do not attribute
   it solely to late cleanup. Use the trace to distinguish capture, publication,
   receiver and rendering failures before making another correction.

Only after this focused sequence passes should the operator finish the
remaining matrix on the same exact candidate. Source tests do not convert any
physical row from NOT RUN to PASS. If a source defect is found, preserve the
evidence for the implementation owner rather than making parallel code changes
during device qualification.

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
| Android → iPhone | video | Same Chi'lly Chat thread | FAIL — remote iPhone video was lost after microphone recovery and did not recover within 15 seconds |
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
| Remote End from Android, then from iPhone | Peer exits live UI; capture, durable membership, transport, and native UI clear | NOT RUN — iPhone End cleaned both endpoints once; reverse direction was not run |
| Repeated microphone transitions from each endpoint | Two-way speech follows every mute/unmute; durable and UI state agree | FAIL — iPhone unmute on PR #528 caused persistent Android remote-video loss and endpoint state disagreement |
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
| Adjacent messaging during cancel/decline/End/replacement | Existing messages remain isolated and new private messages deliver correctly | NOT RUN — one Android-to-iPhone pre-call message delivered; post-call and lifecycle combinations were not run |

Expected compatibility namespaces remain
`1.0.0-android-production-v2` and `1.0.0-ios-production-v2`, subject to a fresh
binary/source compatibility check. No source correction after PR #528 has been
delivered or physically qualified by this record. A new exact delivery decision
is required before testing any corrected merge on these devices.
