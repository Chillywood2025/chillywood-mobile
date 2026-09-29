# Consolidated Chi'lly Chat repair candidate

Updated 2026-09-29. PR #539 is the single candidate; PR #540 is incorporated
as a merge parent and superseded. **Source consolidation is not physical
qualification. No new installed-device result is claimed here.**

The owner requested comparison, consolidation, remaining repairs, validation,
internal builds/installations and complete physical retesting. That request
authorizes those steps; lack of device/build transport is the present delivery
blocker, not a request for the owner to repeat authorization. It does not
authorize a public release, provider rollout or production database changes.

## Source comparison and decisions

| Area | PR #539 `9259379c4620dd448f8fba63dc66b0b5ce3426da` | PR #540 `e13ae43f9c32fa7c0fae71f9522e00d623f99ce8` | Consolidated behavior |
| --- | --- | --- | --- |
| Camera rendering | Camera Off overrides retained remote tracks; corrected policy guard | Also hides retained media when the remote peer is not connected and fixes labels | Keep both state requirements in both renderers. One production JSX test file retains the distinct cases; duplicate cases are removed. Guard rejects camera and connection bypasses. |
| Deferred microphone | Preserve intent across repeated background/inactive events; reset account/room ownership | Capture intent before an ineligible initial background acquisition; newer muted preference cancels it | Keep the union and add revision/generation protection against late automatic-mute completions. |
| Answer sequencing | Native Answer event before foreground request promise settles | No corresponding new sequence | Retain coverage. It passed the original source and does not explain BL01. |
| Invite errors | DE03 lacked a diagnosed error in that investigation | Server correlation identifies throttling; static retry copy and dispatch/cleanup tests | Keep the exact error mapping, cleanup, no automatic retry and no duplicate dispatch. Do not alter rate limits. |
| Dispatch guard | Existing source-window assertion | TypeScript structural assertion plus missing/unawaited/unguarded mutation controls | Keep the structural and runtime checks. |
| Physical matrix | 105-row follow-up preserving outcomes | All original columns plus prerequisite and new-candidate verdict | Use `PR537_RETEST_MATRIX.tsv` as the canonical retest matrix. All 105 new-candidate verdicts remain NOT RUN until actual execution. |

Both original reports remain supporting history:
[539 investigation](PR538_REPAIR_AND_QUALIFICATION.md) and
[540 investigation](PR537_PHYSICAL_REPAIR_2026-09-29.md).
Their earlier validation counts and unresolved-status statements are dated
branch observations, not the current consolidated result.

## Additional defects and test gaps found during consolidation

An automatic background mute could save microphone intent, wait for membership
or broadcast acknowledgment, and then overwrite a newer muted preference.
The same pattern could overwrite a queued explicit Mute. New barrier tests
failed before the repair. Deferred intent now carries a revision; account/room
changes, newer muted preferences and explicit controls retire it. Automatic
callbacks may restore only their current revision and session generation.
The global media stopper also verifies generation before applying a late
privacy fallback, protecting replacement capture.

Independent review then reproduced cancellation during foreground acquisition
and during a successful sender replacement whose acknowledgment was pending.
The final fence covers permission/capture, initial stream adoption, sender
preparation, enablement, durable writes, broadcasts and compensation. New muted
preferences and explicit Mute during a pending transaction quarantine owned
capture immediately; they do not wait for the old network acknowledgment.
Completed sender/negotiation mutations are recorded before cancellation checks,
so rollback can restore the actual topology. Initial voice/video capture cannot
revive a cancelled microphone, while independently authorized video remains
available. Eleven additional barrier cases cover these boundaries, including
successful later Unmute. The independent reviewer reran acquisition, sender
rollback/recovery and immediate-Mute probes on the final patch.

The final #540 CI run `36612755275` failed its independent disabled-track
browser silence assertion. All Node product tests had passed. The measurement
assumed two 300 ms host sleeps drained receiver audio and provided fresh PCM;
it did not observe a complete sample interval. This is a concrete test weakness,
but the old failure log cannot establish its precise cause.

The consolidated observer retains the strict energy ceiling `<0.0001`, requires
at least 300 ms of actual receiver PCM at its reported sample rate, advancing
RTP and a running receiver. It rejects invalid/regressing counters, no samples,
no packets and persistent sound. A bounded three-second receiver-settling
deadline replaces fixed host timing and records noisy intervals on failure.
The independent control also verifies that its real source track is disabled.
This measures received silence; it is not a three-second product mute SLA or
proof of a physical microphone/speaker. CI must execute the actual browser lane.

## Evidence and remaining diagnosis

The original archive remains unchanged: PR #538,
`9563900cbc1454122fe266ac1313260edc9e2f87`, ZIP SHA-256
`21b3518e394e37809cd490d1f15a01288aaf105af5866765931019dc9b3f45b3`.
Original totals: 26 PASS, 18 FAIL, 1 AUTOMATION BLOCKED, 60 DEPENDENCY BLOCKED.
The 105-row provider inventory is 104 `legacy_webrtc` and one `not_persisted`;
none proves LiveKit.

Read-only log checks during consolidation independently matched the two DE03
timestamps, SQLSTATE `P0001`, and abuse-guard chains: invite guard at
14:12:54.350 UTC and room guard at 14:13:59.078 UTC. The #540 report records the
exact `rate_limited` marker. No counters, guards or database rows were changed.

| Open failure | Observation needed to choose and verify a repair |
| --- | --- |
| iPhone microphone recovery | Correlate `communication-legacy-microphone-commit`, `communication-legacy-membership-media-commit`, `communication-legacy-media-broadcast` and `communication-legacy-media-track-preparation` runtime errors with audio activation, sender/track ownership, server acknowledgment and rollback. The displayed fail-closed error is in the unmute transaction; do not bypass it. |
| Camera flip to black | Capture native camera-start completion/error, requested and actual lens, outbound frames encoded and remote frames decoded over time. Pinned iOS capture can log a native start error yet return a JS track marked live; a live track alone is insufficient. |
| iPhone Answer/handoff | Native presentation receipt → request/delegate → exact current account/invite → server acceptance → consumed route → media join → audio activation. Existing audio activation forwarding is already implemented; duplicating it is not a demonstrated repair. |
| Background/terminated video presentation | Correlate dispatch attempt and APNs result with device PushKit receipt, authority checks, CallKit report completion and observed system UI. Provider submission is not presentation. |
| Peer/process liveness | Native termination reason, actual membership lease, last heartbeat, disconnect and rejoin timestamps, visible state and advancing media. A heartbeat interval is not automatically an expiry deadline. |

The original ZIP contains UI screenshots/snapshots, not those correlated native
traces. Do not invent them or claim the remaining causes are established.

## Device and delivery execution

Current workspace inspection: Linux, no USB device bus, no attached-phone
transport, no configured remote Mac endpoint, no Xcode/ADB/Appium/WDA runtime,
and no authenticated EAS session. GitHub CI uses hosted Ubuntu/macOS machines;
none is a connected physical runner. Available Supabase access supports server
readback, not iPhone camera/audio logs.

Remote Desktop Commander was found as an available but unconnected integration
for the existing Mac. It must be installed/connected to that Mac before this
session can run its device tools. Connection alone does not prove device
visibility, trust or an available observer. Reconstruct the existing authorized
tunnel/WDA/Appium sessions using the real health checks; do not repeat trust
authorization unless actual trust is lost. A Mac administrator prompt remains
a local owner action if restarting its root-owned iOS tunnel requires it.

Once connected, execute in this order:

1. Verify both intended phones and existing internal apps. Preserve existing
   Android/iOS/native crash logs before restarting anything; the old logcat
   helper clears the log buffer, so it must not be the first capture command.
   Keep raw logs outside Git, then export only sanitized task evidence.
2. Reproduce each remaining native failure on the known installed candidate.
   Assign one case/attempt correlation and record UTC plus monotonic intervals.
   Capture native errors, current call ownership, audio route/session and
   receiver media statistics alongside the UI. Retain the first failure.
3. Implement causal repairs with regressions that fail against the old source.
   Rerun applicable source/native checks and the protected Required Validation
   check on the final consolidated commit. Recheck the release review gate;
   the current read-only sentinel inventory is empty, but that is not perpetual
   release clearance. Merge only after the required result succeeds.
4. Build from the exact approved source through the internal profiles below.
   Bind source tree, native digest, runtime, channel, signed artifact and build
   number. Reconcile existing submissions before creating one. Use
   `scripts/ios-delivery-control.mjs` to enforce artifact identity and avoid
   duplicate submissions. Install and independently read back both artifacts.
5. Run the basic paired voice/video sequence in both directions before the
   full matrix. Confirm a fresh spoken challenge through each actual microphone
   and remote output, and a changing marker/lens view through each physical
   camera and remote display. Use a consenting observer or verified physical
   signal rig; synthetic browser capture does not substitute.
6. Run failed cases and their dependents, then all remaining matrix rows on the
   same candidate. Supply Bluetooth hardware, owner unlock, a third authorized
   test identity/device and an existing authorized LiveKit canary where required.
   Respect existing call-rate budgets and force-stop expectations. Record every
   attempt, including failures; source fixes and old PASS rows do not transfer.
7. End all calls, verify capture/audio/session cleanup and fresh reuse, restore
   permissions/idle state, sanitize the archive and independently verify hashes,
   references and all 105 verdicts. Any unmet required assertion remains blocked.

### Physical acceptance and correlated receipts

These are required observations for the future device run, not completed tests.
Keep an attempt record linked to each matrix case with candidate/build identity,
provider, direction, precise entry state, UTC/monotonic times, each assertion's
outcome, observed behavior and sanitized evidence references. Keep the original
matrix columns immutable. A later successful retry must not erase an earlier
failure. Identify the first failing boundary; dependent assertions stay blocked
with their specific missing prerequisite. Native fixture proof cannot turn an
unreachable physical scenario into a physical PASS.

- **Independent media proof:** isolate the endpoints acoustically so an observer
  cannot hear the speaker directly. Use a fresh spoken challenge in each
  direction and confirm it through the intended remote earpiece, speaker or
  headset. During Mute and after End, continue the challenge and confirm that it
  no longer travels through the call. For video, observe the remote display,
  use a changing physical marker and distinct front/back views, then confirm
  Camera Off removes transmitted content. A local preview, repeated screenshot,
  black frame or increasing packet counter cannot establish moving remote video.
- **Android background eligibility:** record OS/target SDK, actual notification
  action and Activity/service state, declared service type, permission state and
  native start outcome. Do not require every background Answer to be ineligible:
  notification interaction has documented exemptions. If the actual attempt is
  ineligible, require truthful muted state and recovery of only the current
  request after eligible foreground; new Mute, denial, End or replacement must
  cancel it. A granted permission query alone does not establish eligibility.
  [Android background service and while-in-use restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
- **iPhone audio and route recovery:** correlate CallKit activation/deactivation,
  interruption start/end, native audio errors and actual input/output route with
  the same invite and media owner. Observe route-change reasons and the resulting
  route before repeating the audible challenge. Add a separately identified
  interruption/media-services-reset diagnostic variant when available; do not
  treat it as an original 105-case result. After a media-services reset, verify
  audio-object/session reinitialization and explicit user-initiated restart.
  This is an additional failure-path test, not a diagnosis of the recorded mic
  failure. [CallKit activation](https://developer.apple.com/documentation/callkit/cxproviderdelegate/provider(_:didactivate:)),
  [audio route changes](https://developer.apple.com/documentation/avfaudio/responding-to-audio-route-changes),
  [media-services reset](https://developer.apple.com/documentation/avfaudio/avaudiosession/mediaserviceswereresetnotification).
- **Camera/native receipts:** retain capture-session start/stop and interruption
  notifications, the underlying runtime error, requested/actual lens and first
  actual frames. Inspect background interruption and later foreground recovery
  separately from flipping while active. A fulfilled JS promise or live track
  does not replace the native capture receipt or remote motion observation.
  [Capture runtime errors](https://developer.apple.com/documentation/avfoundation/avcapturesession/runtimeerrornotification),
  [background camera interruption](https://developer.apple.com/documentation/avfoundation/avcapturesession/interruptionreason/videodevicenotavailableinbackground).
- **Push/Answer receipts:** record APNs submission result, device PushKit callback,
  CallKit reporting completion/error and notification completion separately,
  followed by the real Answer delegate, exact route, server acceptance, one join
  and audio activation. Record relevant Focus/Do Not Disturb state and native
  report errors; do not label every absent presentation a transport failure.
  CallKit reporting must not wait for a successful server connection.
  [Apple PushKit handling](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit).
- **Receiver measurements:** sample current track/peer/SSRC statistics over time
  on both endpoints. Keep source, sent, received, decoded and rendered evidence
  distinct; record audio energy/sample deltas, concealment/loss, video frame
  deltas and freezes when supported. Missing fields are unavailable, not zero.
  New track/SSRC counters need a fresh baseline. Received sample counts can
  include synthesized concealment, and decoded frames do not establish visible
  motion; the independent physical challenge remains required. Use the existing
  product timing expectations with explicit start/end events; the browser
  observer's settling allowance is not a physical mute-latency acceptance limit.
  [W3C WebRTC statistics](https://www.w3.org/TR/webrtc-stats/).

| Platform | Build/submit profile | Runtime before any new native changes | Channel/audience |
| --- | --- | --- | --- |
| Android | `android-internal-v2` | `1.0.0-android-production-v4` | `android-internal-v2`; Play internal |
| iOS | `ios-internal-v2` | `1.0.0-ios-production-v4` | `ios-internal-v2`; TestFlight Chillywood Internal |

Use `config/release/internal-native-generation.json` and current receipts;
runtime-v2 examples in older documents are not candidate identity. Any actual
native input change requires a new compatibility review and appropriate runtime
generation. Do not dispatch the generic production iOS workflow with the wrong
profile for native-call qualification.

No build, installation or physical retest has been performed by consolidation
alone. Final CI receipts belong to the exact PR head; delivery and physical
results must be added from actual execution rather than inferred from CI.
