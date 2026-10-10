# Consolidated Chi'lly Chat repair candidate

Updated 2026-10-08. PR #539 is the single candidate; PR #540 is incorporated
as a merge parent and superseded. **The installed v5 candidate is not physically
qualified. Its failures and the next v6 repairs are recorded below.**

The owner requested comparison, consolidation, remaining repairs, validation,
internal builds/installations and complete physical retesting. That request
authorizes those steps. Device access was restored and internal delivery and
installation completed; the remaining work is repair and qualification. It does not
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

Remote Desktop Commander connected successfully and executed commands on the
owner's Mac. Both intended paired phones were verified: Android build 95 from
Google Play and iPhone build 30 from TestFlight. The existing Android Appium
session worked. The stale iPhone WDA session was replaced without resetting the
app, changing its signed-in account or registering a device. The replacement
session answered source/control requests successfully. Existing native crash
reports were copied with keep-original enabled, and Android logcat was preserved
without clearing its buffer. EAS and existing Firebase/Google Cloud identities
were authenticated. None of this establishes independent audible/video proof.

The following diagnostics used the **original builds**, not the new candidate:

| Attempt | Observation | Interpretation |
| --- | --- | --- |
| D01 | Android invitation appeared on iPhone, but remote command/capture overhead delayed Answer beyond expiry. | Automation timing blocked; not a product Answer failure. |
| D02 | A locally timed Answer completed at 22:05:31 UTC, approximately six seconds after the caller tap. Both phones subsequently displayed Connected. Later the iPhone displayed Connecting with microphone controls disabled. | This attempt reached the connected UI; it did not prove audible media or durable connection. The later state prevented a valid microphone recovery sequence. End was followed by verified idle screens on both devices. |
| D03 | A locally timed Answer produced the retryable iPhone handoff error while the invitation remained available; the connected microphone prerequisite was not reached within 45 seconds. | Original-build handoff defect reproduced. The banner alone cannot distinguish missing presentation authority, native request rejection or a missing Answer delegate. Microphone recovery remains blocked behind this prerequisite. Cleanup was requested; final idle readback was interrupted by transport failure. |

Private native logs, timestamps, screenshots and attempt records are preserved
under the task's private Mac evidence directory. They have not been sanitized
or published and must not be linked as verified public evidence. The original
matrix and all 105 new-candidate NOT RUN dispositions remain unchanged.

Crashlytics REST event retrieval returned SERVICE_DISABLED for both apps.
The existing Cloud Logging query returned zero matching events in the bounded
window; no new API, export, permission or provider configuration was enabled.
Release capture and native Answer errors could previously lose their original
cause before reporting. The candidate now preserves allowlisted error classes,
domains/codes and bounded media context without logging descriptions, stacks,
identifiers or payloads. Reporting cannot change the original rejection/false
result. Native PushKit, presentation, Answer and audio receipts are explicitly
gated to the reviewed iOS internal binary. Session-wide audio callbacks carry
no invented call identity. These are diagnostic improvements, not a claimed
causal repair of the unresolved physical defects.

During the September 29 diagnostic run, at 22:24 UTC the connector listed the Mac online but its last heartbeat was
22:17:55 UTC. Subsequent process-output and a single UTC-only execution probe
returned HTTP 504; the latter completed at 22:27:43 UTC without a process ID or
output. Mac execution health was then unverified. Dependency installation
was acknowledged before the outage; a later native-patch transfer/Swift test
request has unknown execution status. Reconcile files/processes before retrying,
and do not infer success from the connector's online label. The outage was
subsequently resolved; the following October 8 receipts supersede that blocker.

### October 8 internal delivery and physical diagnostics

Both signed binaries use source `2f6560724ba821c0fcc07a38b57b311b177a8e15`,
tree `c929e6c9013ef3d1966ab6e5675997ec240654d7`, their platform v5 runtimes,
and existing private internal channels. Exact-head Required Validation passed.

| Platform | Build and submission | Artifact SHA-256 | Installation readback |
| --- | --- | --- | --- |
| Android 96 | EAS build `a191109c-0ac8-4726-96dc-c893f36dcfb2`; submission `f810e57f-ccdf-45c6-90cc-75744e9e154f`, FINISHED | `812056cb749b7c403f5bab340db21d45b127c21386ac3841a010d7ec8e066fd7` | Google Play internal release active; installed versionCode 96, installer `com.android.vending`. |
| iOS 31 | EAS build `12b11450-d13f-413d-a9b1-adfd767d0a00`; submission `d7b2040d-f1a2-4505-be0d-dfb5677bfd55`, FINISHED | `5150e7726288b06dded3adb11dcca0df83b668289d76ea876336ff888818849f` | App Store Connect VALID; TestFlight shows 1.0.0 (31) and Open; independent device inventory confirms installed build 31. |

Android bundle validation and upload-signature verification passed. iOS strict
code-signature verification, production APNs entitlement, runtime/channel and
all four compiled internal diagnostic gates passed. The configured TestFlight
submission group remains Chillywood Internal. App Store Connect's group-read
endpoint returned 403, so an independent complete group-assignment API receipt
is unavailable; no permissions were broadened. The owner's on-device XCTest
authentication restored iPhone automation without changing the app account.

| Diagnostic attempt | Observed result on Android 96 / iOS 31 |
| --- | --- |
| V5D01, Android to iPhone voice | Timely Answer reproduced the retryable handoff banner. APNs returned 200 to an enabled, account-bound build-31 token; presentation acknowledgment and server acceptance remained null. No microphone recovery sequence could begin. Both devices returned idle. |
| V5D02, iPhone to Android voice | Connected UI and two complete iPhone mute/unmute cycles were observed. The call disappeared during the third Mute; this is not proof of a microphone-recovery defect. The Android peer closed at 20:21:01.512 UTC; the callee ended the server invite and room at 20:21:03.052682 UTC, before the 20:21:31.830549 invite expiry. No End control was operated before disappearance. |
| V5D03, untouched reverse voice control | Connected UI remained present throughout a 100-second observation. Live read-only snapshots showed both participants' heartbeats advancing approximately every 15.5 seconds. Explicit iPhone End completed at 20:37:39.209075 UTC; server termination followed at 20:37:40.0787 UTC. Both devices returned idle. Actual audio was not verified. |
| V5D04, repeated reverse voice mute cycles | Android's last-seen timestamp stayed at 20:39:02.463249 UTC while iPhone media changes continued updating the host membership. Android heartbeat age reached 32.475089 seconds and then 44.600790 seconds. The Android callee ended the invite/room at 20:39:50.370589 UTC, 47.907340 seconds after its last heartbeat. No End was operated before disappearance. This controlled contrast strongly supports the heartbeat-starvation diagnosis. |
| V5D05, reverse video controls | iPhone flip, Off, On and flip operated; Android displayed the remote Camera Off placeholder. Native front/back capture start/stop and first-frame receipts were present, without a captured start error. Rear-camera images were black on both devices; the final front-camera flip displayed a scene on both. Rear-camera scene/occlusion was uncontrolled, so black pixels alone are not adjudicated as a capture defect. Moving-video confirmation remains pending. Explicit End and idle cleanup completed. |

Correlated native streams and a paired-device log archive are retained privately.
The archive contains 54,375 Chillywood, 1,380 apsd and 109 callservicesd events
between 20:13 and 20:21 UTC, but zero custom native-call diagnostic events.
Without a successful custom-log positive control this does not establish that
PushKit delivery never occurred. Fresh lifecycle/registration/foreground-entry
receipts are added in v6 to make that distinction observable. No actual audible
speech or moving remote video has yet been independently confirmed in these
diagnostic attempts. These results cannot qualify v6 or replace its 105-row run.

### Repairs prompted by the installed v5 run

1. A reproduced readiness counterexample showed that a transient authority-read
   failure could stop native VoIP registration while leaving its backend token
   enabled; foreground activation only drained events and never restarted it.
   Recovery now quarantines JS actions on unavailable authority, retains the
   exact native binding, and performs bounded revalidation plus foreground
   recovery. Explicit account/session replacement still revokes old ownership.
2. Foreground Answer previously depended solely on prior PushKit presentation.
   An explicit tap now freshly validates the raw invite, thread, members, room,
   deadline and exact authority before requesting native foreground presentation.
   PushKit and foreground share pending/confirmed report ownership, and the
   actual CallKit completion and native event are required. A bridge promise
   cannot fabricate presentation. Cancellation, reset, expiry and late callbacks
   are fenced. Only genuine PushKit payloads can acknowledge APNs presentation.
   This repairs a distinct availability gap; it is not a proven push root cause.
3. Repeated room snapshots replaced objects used as heartbeat-effect dependencies,
   repeatedly postponing the 15-second timer. The actual mounted-hook regression
   with updates every eight seconds produced zero heartbeats in 96 seconds on
   v5, versus six after binding the timer to stable admission/session identity.
   Replacement and post-End callbacks cannot mutate retired membership. The
   V5D02 terminal mutation overwrote historical last-seen values. V5D03/V5D04
   then directly observed stable untouched heartbeats versus a frozen Android
   heartbeat during repeated peer media updates and subsequent termination.
   The repaired binary must repeat both sequences before physical closure.

Independent review reproduced and closed three additional draft-repair gaps:
concurrent foreground taps now use mandatory operation-bound admission;
same-authority native rebind replays only confirmed live call receipts; and
transient token-registration read failures no longer imply account replacement.
Bounded token retries and replay use the real current registry token in memory,
without logging or persisting it in diagnostics. Actual replacement still
revokes prior authority.

Before source sealing, the combined foreground/root/thread JS regressions
passed 301/301, including 115 new facade/mounted tests. The actual mounted media
hook passed 174 tests, including the heartbeat counterexample. Apple Swift
6.3.2 compiled and executed 128 production incoming-report/registration checks
and ten mutations, each rejected by its intended assertion. Native deadline
checks passed 42 assertions and four mutation controls; native audio and
diagnostic checks passed 89 and 52 assertions respectively. These use controlled
OS/network receipts and do not establish physical presentation or media.

Continue execution in this order:

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

| Platform | Build/submit profile | New diagnostic-candidate runtime | Channel/audience |
| --- | --- | --- | --- |
| Android | `android-internal-v2` | `1.0.0-android-production-v6` | `android-internal-v2`; Play internal |
| iOS | `ios-internal-v2` | `1.0.0-ios-production-v6` | `ios-internal-v2`; TestFlight Chillywood Internal |

Use `config/release/internal-native-generation.json` and current receipts;
runtime-v2/v4 examples in older documents are not this candidate's identity.
The native presentation contract changes require fresh v6 binaries. The
supersedes record preserves both exact v5 compatibility digests.
Only `ios-internal-v2` explicitly enables
`CHILLYWOOD_INTERNAL_CALL_DIAGNOSTICS=true`; its device-profile child explicitly
disables the inherited opt-in. Other profiles cannot enable diagnostics. The
plugin also requires the matching build-profile name, iOS provenance, native
calls and private internal channel. Do not dispatch the generic production iOS
workflow, broaden audiences, or publish an OTA for this native transition.

Before building, commit all final native inputs, then compute both platform
digests with `nativeSourceSnapshot` in
`scripts/ota-native-source-compatibility.mjs` against that exact Git SHA/tree.
Populate the v6 `nativeCompatibility` digest fields, commit the receipt-only
update, and recompute against the resulting candidate to prove equality. The
digest fields must match this step; never reuse the v5 digests or
fill a digest from a partial working tree. Rerun release-native-source tests and
both platform config guards on the sealed candidate. Existing v5 binaries must
be rejected as compatible receipts for v6.

The v5 inputs were sealed from source
`085b8bccf9e88eaa0e7da0f4153257ab68ce2af3`, tree
`444387a583b382c15b023a857ccccd70c92b69cc`:

| Platform | Git-native compatibility digest |
| --- | --- |
| Android | `4ddc307e47272f81037c5d51d09dcabfa36fe34471c0cba1bcddad516ec3aba8` |
| iOS | `d8289e104a09297582022286f99dcd01efea246c37b9174c186981ba2e7e005f` |

The subsequent receipt/documentation commit must retain both digests. They
identify source compatibility only; they are not signed-binary or device proof.

The initial, never-built v6 inputs were sealed from source
`d53277afc5fd52840dc0971774e20dabcc2ea54c`, tree
`43ddc5b696ce3477153a63e3d04c163d87a854a2`:

| Platform | V6 Git-native compatibility digest |
| --- | --- |
| Android | `1a990dab01a0607881d649a5f16772e5a6ac812400c0647b26b50d7e35b85584` |
| iOS | `ce166db7fb92f6fda290607ead72e719c2bb57608147909e3cae33438b5efe53` |

Independent review closed the three draft-repair findings and reran its own
concurrent Answer, token-failure and native receipt recovery counterexamples.
The source review found no remaining blocker in those paths; signed-device
qualification remains a separate gate.

The v5 delivery and diagnostic attempts above are completed observations. V6
build/install and physical qualification remain pending. Final CI receipts
belong to the exact PR head; delivery and physical results must be added from
actual execution rather than inferred from CI.

### CI follow-up before the first v6 build

Source Validation run `37842417416` on `a6986aae3141f55c78f3f30f7a5b3001210288c3`
passed Product, Database, Native SDK Contracts, Policy and Core. Sensitive and
Native/Release stopped at old source-shape assertions for foreground Answer;
Autonomous stopped at newly reported dependency advisories. That head did not
pass Required Validation and was not built. Read-only EAS inventories confirmed
no Android or iOS v6-runtime build existed before this follow-up.

The call-policy guard now follows TypeScript function/branch structure, exact
native receipts, per-operation admission consumption and dispatch order. Ten
negative controls must fail their intended assertion. The dependency repairs
and maintained local backports are documented in
[`../dependencies/2026-10-08-advisory-repairs.md`](../dependencies/2026-10-08-advisory-repairs.md).
The original production audit threshold remains unchanged; all four production
trees passed with zero high/critical findings. This audit result does not replace
the backports' behavioral and provenance tests or establish physical qualification.
The dependency/vendor inputs were resealed before the first v6 build from
source `671304e6ee790161eed9d7dcf1361c176f5fbad4`, tree
`db4980808ff6612e8ce835d231954c9f1540484f`:

| Platform | Current v6 Git-native compatibility digest |
| --- | --- |
| Android | `1142577cd8f72d88b9b118031bc19755c2e8bdf0b61ce4d4677fb5931f831367` |
| iOS | `f70476a9d9a7cce3fee0353d126fef1bf86619ffb2f189764234b60b23a7f5ba` |

These supersede the initial unbuilt v6 digests above. No delivered cohort is
rewritten; both installed v5 compatibility digests remain immutable.
The completed follow-up passed 1,268 local product/call tests with zero failures
or skips, plus lint and TypeScript. Exact-head hosted validation remains required.

[`PR539_V6_EXECUTION_PLAN_2026-10-08.md`](PR539_V6_EXECUTION_PLAN_2026-10-08.md)
maps all 105 matrix IDs exactly once to execution batches. It records actual
speech/motion, native/logging positive controls, live heartbeat readbacks,
rate-limit scheduling and the precise hardware/person/state prerequisites.
No matrix verdict is advanced by this plan.

### V7 follow-up to installed v6 diagnostics

The installed v6 source is `936107eca963440599c4f3a2c9c247dcaca5faef`,
tree `efca05683c171e4d7e55f77e342df9daf455c057`, delivered as Android 97 and
iOS 32. Its native compatibility digests above are immutable. The current
candidate advances both internal runtimes to `1.0.0-android-production-v7` and
`1.0.0-ios-production-v7`, retaining the existing channels and tester audiences.
The v6 execution plan remains a scenario schedule; its installed-source evidence
must not be relabeled as v7 validation.

Paired v6 diagnostics reproduced a composer keyboard that obscured iPhone call
controls. The screen now dismisses the keyboard when the shared call panel
opens, including outgoing, incoming, native handoff and reopened controls.
Mounted tests retain the draft and verify each opening path; physical geometry
and accessibility still require the new installed candidate.

The unchanged iPhone speaker label led to a separate reproduced source defect:
the legacy adapter recreated its unsupported route callback on every render,
which retriggered automatic routing and erased a failed manual switch's error.
The callback is now stable. Mounted regressions exercise rejected manual
switches, retries, unrelated renders and pending requests. This correction
does not establish that the native device accepted a speaker request.

The native follow-up records allowlisted route requests, native success or
error, and one immediate output category (speaker, receiver, none, or other).
It preserves routing operations and rethrows the original native error. The
existing internal-only diagnostic gate applies; no raw port type, name, UID or
call identity is added. The sample is session-wide and does not prove a settled
route or audible output. Actual audio, controlled moving video and the remaining
physical matrix are still required.

The initial, never-built v7 native inputs were committed at
`65fdb4b4aa2e5b759540219b3379815b846f1b57`, tree
`370ec026e27cb5eb5acaa037cfb3942871df9bb7`, then measured with the documented
`nativeSourceSnapshot` workflow:

| Platform | Initial unbuilt v7 Git-native compatibility digest |
| --- | --- |
| Android | `855a7362816374af36ba5b9df1527c3308c1246b5191c6239017af2d8b96bc23` |
| iOS | `169b5db038fb2d739271bd03f4d7888cab3e4ebc1b68d9b35067fe83e89114c9` |

The receipt-only follow-up must recompute these digests on its resulting Git
head before build. Neither these source digests nor local test results replace
exact-head CI, native compilation, signed-artifact identity or installed-device
proof. The Product CI lane explicitly includes the new keyboard regressions.

### Completed v6 diagnostics and further v7 repairs

The operator-reconciled
[`PR539_V6_DIAGNOSTIC_REPORT_2026-10-08.md`](PR539_V6_DIAGNOSTIC_REPORT_2026-10-08.md)
records installed v6 delivery, successful technical assertions, reproduced
defects and unresolved observations. Actual speech and controlled moving video
remain unverified; all 105 new-candidate retest verdicts remain NOT RUN. The
separate [`PR539_V7_EXECUTION_PLAN_2026-10-08.md`](PR539_V7_EXECUTION_PLAN_2026-10-08.md)
preserves the 21-batch/105-row mapping and requires the new regression gates
before final paired qualification. The v6 plan remains historical.

Further source repairs preserve microphone feedback ownership before CallKit
callbacks, wait for native signaling stability, and permit only one fresh
correlated retry after an authenticated simultaneous offer has been answered.
Camera acquisition and recovery now respect newer Off/background ownership,
retain deferred or renewed On intent, preserve independent microphone recovery,
and keep failed-stop resources owned for retryable cleanup. The Android native
patch detaches shared stream references before disposing their track owner; the
actual bridge and pinned upstream Java disposal wrappers reproduce the old
failure and pass the repaired contract. Bounded startup receipts distinguish
intent, permission/projection and capture outcomes in the exact internal builds.

Independent review supplied additional failing camera-cancellation examples;
the follow-up regressions retain those failures as counterexamples. Source and
controlled native contracts do not establish physical media or crash closure.
No v7 binary existed at the final provider inventory readback, so the initial
unbuilt v7 digests above must be superseded by a final prebuild seal after all
these native inputs are committed. Installed v6 and earlier cohorts stay fixed.

The final prebuild v7 inputs were committed at
`ab4307580dca35d650c2ba6e3f42e41fbcf9342e`, tree
`e5b7e8fe3a0daca8d0ca2e01cba62ffd471ed090`. The documented
`nativeSourceSnapshot` computation produced these replacement digests:

| Platform | Final prebuild v7 Git-native compatibility digest |
| --- | --- |
| Android | `df19ee0cde119782d28d7e514d56d8890cc13f0ba70d20cf750a9980cc7455bc` |
| iOS | `7c6e1332541f2e0a0cc9a963ad8c3c0e3bfac6d414be32ab780728994d121fed` |

Both measured native-input sets equal the Mac-validated source
`e654e6acbdacae408215fd6a58e8c518d31194ac`; later repairs changed JS ownership,
tests and documentation. The provider inventory at 23:38 UTC still showed only
v6 Android 97/iOS 32 and no v7 build. Thus these supersede only the never-built
v7 seal, not delivered history. Recompute against the receipt commit to verify
equality, require all final exact-head gates, and bind the next signed artifacts
and physical retest to that final source.

## V8 follow-up after paired v7 diagnostics — 2026-10-09

V7 was delivered as Android 98 and iOS 33 from source
`0d942593fe7db6187212ebdf234eca03f83c342d`. Its signed artifact identities,
successful software gates, actual paired attempts and unresolved failures are
preserved in `PR539_V7_DIAGNOSTIC_REPORT_2026-10-09.md`. That delivered cohort
and every earlier cohort remain immutable.

The next candidate combines these separately reviewed repairs:

- Recover expired non-host membership visibility by retiring the old media
  owner and requiring authorized re-admission, without ending the peer call.
- Preserve requested microphone state through matching automatic CallKit
  feedback, while genuine explicit controls and newer ownership remain binding.
- Keep native audio readiness bound to the accepted call after its navigation
  claim expires; do not let token age enable capture.
- Configure the audio category before native Answer fulfillment, without
  activating the session. Configuration failure retires the exact call through
  the existing authoritative cleanup path.
- Stop showing an expired incoming invitation or its stale live-room header
  while read/cleanup work is delayed; retain backend ownership and retry rules.
- Bound an accepted native audio wait to 15 seconds of the local scheduler,
  report a visible failure, and attempt exact-call cleanup. Late activation,
  account replacement and replacement calls cannot revive retired capture;
  End remains available when cleanup must be retried.

The Mac compiled the production native methods at intermediate source
`c638d1286f9d686eaefa714d3c12c9c8f16ccf69`: 554 audio checks, 64 Answer checks,
64 diagnostic checks, 128 incoming-report checks and four root/facade tests
passed. All five new Answer mutations failed their intended assertions; the
old native source failed configuration-before-fulfillment. Controlled native
receipts do not establish OS activation or audible sound.

The v8 cohort uses fresh platform runtimes on the existing internal channels.
Its final committed native inputs must be measured and sealed below before
exact-head validation and internal delivery. The full 105-row execution map and
additional regression gates are in `PR539_V8_EXECUTION_PLAN_2026-10-09.md`.
Independent helper review covered 44 offline groups, including stale candidate,
changed owner, disjoint log capture, unrelated call correlation and bounded
20/60-second background restoration. These are observer checks, not device
results. Actual speech/moving video and the late/missing iPhone presentation
cases remain open until the new installed candidate is evaluated.

The final prebuild v8 inputs were committed at
`d5b0c4d464ba0053152975f1f9c219629f32c802`, tree
`15bf517a3a38dac02f579d9f69100540828d0938`. Their committed-input measurement is:

| Platform | V8 Git-native compatibility digest |
| --- | --- |
| Android | `965a7e5198c6168229a8fc0bfdc6116c2852fa0f87e1e976108e3b4d21a2d8b6` |
| iOS | `532a02fc3e71dcd708a867a2f0bf0d67127be21e576ae0c8ba955bd5e3ae6592` |

Recompute these values on the seal commit and bind all hosted checks, signed
builds and installed readbacks to that final source/tree. No v8 build or
physical result is asserted by this prebuild receipt. The combined screen
integration and expired-presentation suites passed 93 tests with no skips;
the independent 90-second expiry timer remains allowed by the separate
15-second audio-deadline regression.
