# PR #539 v6 diagnostic report — 2026-10-08

**Operator-reconciled interim diagnostic report; v6 is not physically qualified.** This report
records the completed v6 delivery and diagnostic work reconciled by the paired-device
operator against the retained receipts. It does not certify the subsequent repair candidate. All 105 rows in
`docs/chat/PR537_RETEST_MATRIX.tsv` still have `retest_status = NOT RUN`; these
diagnostic attempts have not been promoted to final matrix verdicts. A successful
technical assertion below does not establish a whole-row PASS.

The installed v6 diagnostics reproduced an obstructing iPhone keyboard, a failed
iPhone video-call Unmute, and two Android native crashes on the same disposed
video-track path. Background iPhone delivery was inconclusive on one attempt
and positively observed on a retry. Actual sound and moving video remain
unverified throughout.

PR #539 is the consolidated draft candidate; PR #540 is superseded and its useful
repairs were incorporated. The original PR #538 evidence remains historical:
26 PASS, 18 FAIL, 1 AUTOMATION BLOCKED, 60 DEPENDENCY BLOCKED, 0 NOT RUN. Those
results do not transfer to v6 or to a later build.

## Installed candidate and validation

| Identity | Verified v6 value |
| --- | --- |
| Source | `936107eca963440599c4f3a2c9c247dcaca5faef` |
| Git tree | `efca05683c171e4d7e55f77e342df9daf455c057` |
| Native generation | `internal-native-v6` |
| Android native digest | `1142577cd8f72d88b9b118031bc19755c2e8bdf0b61ce4d4677fb5931f831367` |
| iOS native digest | `f70476a9d9a7cce3fee0353d126fef1bf86619ffb2f189764234b60b23a7f5ba` |
| Exact-head CI | Run `37847285133`: all jobs passed |
| Protected Required Validation | Check `113554345683`: SUCCESS for this SHA; publisher run `37848196583` |
| Release review immediately before build | `ok: true`, no findings |

Local validation passed 1,268 product/call tests with zero failures or skips,
lint and TypeScript checks, 25 native-source tests, the braces guard with 32
negative controls, the call-push policy checks, and the applicable Autonomous
and Native Release checks. The eight production dependency audit scopes had
zero high/critical findings. These checks establish the reported software gates,
not physical audio/video behavior.

| Delivery assertion | Android | iOS |
| --- | --- | --- |
| Store version | 1.0.0, build 97 | 1.0.0, build 32 |
| Bundle/package | `com.chillywood.mobile` | `com.chillywood.mobile` |
| Runtime | `1.0.0-android-production-v6` | `1.0.0-ios-production-v6` |
| Channel/profile | `android-internal-v2` | `ios-internal-v2` |
| EAS build | `1736e6e6-88fd-4f4c-8616-57231cf77abd` | `95d76a18-ca2d-4888-bcba-c2721fac89a8` |
| Build finished, UTC | 21:59:54.139 | 21:51:06.566 |
| Artifact | `v6-android-build97.aab` | `v6-ios-build32.ipa` |
| Artifact SHA-256 | `5a869d41a9295a5b65badaf141cbd003c2effcf8e49acda6ed42573d45c4883a` | `9fb00be587181fab28ee16be5cffd737a851b6a2a6892b3a7c079a512ca03666` |
| Signature/artifact check | Bundle validation and JDK `jarsigner` passed | Strict deep `codesign` verification passed |
| EAS submission | `8f3f4a90-a356-4b04-86b4-f572674d86c8`, FINISHED | `232d099d-1e61-40c0-855e-284f6754abb4`, FINISHED |
| Provider receipt | Play internal build 97 published/active at 22:04:59.952 | ASC build `fbf9fff7-ee1a-42b0-963e-a60368fbb7ba`, VALID |
| Device installation proof | `adb` package readback: versionCode 97, installer `com.android.vending` | `devicectl` installed-app readback: bundleVersion 32 |

Both signed artifacts disable automatic update checks (`EXUpdatesCheckOnLaunch =
NEVER`). Android is not debuggable. The Android signature check retained its
self-signed upload-certificate, missing-timestamp, and ZIP-order warnings. The
iOS artifact contains the enabled native-call build/runtime/diagnostic flags,
the diagnostic channel `ios-internal-v2`, the required background modes,
production APNs entitlement, and the expected diagnostic markers.

iOS was installed through TestFlight after build 32 displayed Update and then
Open. Submission used the existing Chillywood Internal profile. **The ASC beta
group API returned HTTP 403**, so independent group-assignment readback is
incomplete; the report does not claim that other group assignments were ruled
out. This limitation does not negate the independent installed build-32 receipt.

## Capture and interpretation

All calls below used `legacy_webrtc` and the same authorized pair. The operator
captured native logs on both devices, uniquely named state/screenshot snapshots,
UTC and monotonic action events, and scoped read-only server snapshots during
active calls. Server reads expose bounded call hashes and endpoint roles; private
account, device, thread and raw call identifiers are not reproduced here.

iOS native logging received a positive control after a cold relaunch:
`registration_start_received` and `registration_started` appeared in the native
diagnostic channel. The earlier launch produced no such receipt; that initial
silence was not classified as a product failure. `lifecycle_prepared` was not
observed. A functioning registration log channel does not imply that every
unobserved phase occurred.

UI source collection on iPhone can take several seconds. Each event's timestamp
must retain its actual meaning: tap start, tap completion, server timestamp,
native receipt, or observation. A note recorded before sequential snapshots is
not the observation time of both devices. Timing assertions require their
separate endpoints; delayed polling is not proof that the product took that long.

**No independent physical two-way speech, mute/End silence, output-route audio,
or controlled moving-video confirmation has been obtained for these attempts.**
Connected labels, microphone state, advancing heartbeats, CallKit receipts and
native capture activity do not substitute for those observations.

## Diagnostic attempts

All times in the following chronology are UTC on 2026-10-08.

### V6A1-android-ios-voice-01

Android called iPhone from the shared thread. Correlation hash:
`cccb37ae830b39a47915`.

| Event | Time / observation |
| --- | --- |
| Before-call message saved | 22:09:19.255533 |
| Caller tap | Start 22:10:33.486687; completion 22:10:33.688328 |
| Invite created / expires | 22:10:34.670804 / 22:12:04.670804 |
| APNs delivery | One attempt, HTTP 200/sent; server `presented_at` 22:10:38.520280 |
| Incoming Answer first observed | 22:10:38.618848; 5.132 seconds after tap start |
| Answer tap | 22:10:38.913866–22:10:39.741713 |
| Server accepted | 22:10:43.550642 |
| Memberships joined | Callee 22:10:45.018554; caller 22:10:45.121596 |
| Live heartbeat sample | Both advanced through 22:12:31.268935 / 22:12:31.423532 |
| Android End tap | 22:12:36.865434–22:12:36.936716 |
| Server ended | 22:12:37.839712 |
| After-call message saved | 22:13:04.999161 |

Native receipts correlated push receipt, report request/success, Answer receipt,
queue/delegate/pending processing, and `answer_fulfilled`. APNs ownership and
recipient checks matched the authorized recipient and its build-32 token.
Both UIs showed Connected and both memberships remained active during an
untouched interval longer than 100 seconds. This is positive technical evidence
for this foreground Answer path and heartbeat continuity.

There was **no observed `audio_activation` native phase**. Answer fulfillment
and system audio-session activity do not establish that phase or audible audio.
The first UI observation occurred after the five-second presentation objective;
the sampling does not establish a precise first-visible presentation time, so
this report does not award a timing PASS.

Server termination retired the room and both memberships and set microphones
false. The first cleanup note saw Android idle while iPhone still displayed
Connected; both were later idle. The four-second cleanup objective was not
established from this evidence. Repeated End was not exercised in this attempt.
Both unique messages persisted and iPhone showed both markers; Android's sampled
viewport did not show them. Receiver read state advanced, but a missing viewport
marker is not automatically a rendering defect.

The first case-note operation hit a runner datetime-alias error after capture
startup. The operator corrected it and recorded recovery before starting the
call. Preserve that harness interruption with the attempt; it was not an app
failure.

### V6A2-ios-android-voice-01

iPhone called Android after composing a message. Correlation hash:
`0f484642704eefbcf5e4`.

| Event | Time / observation |
| --- | --- |
| Before-call message saved | 22:14:28.950283 |
| Invite created / accepted | 22:14:30.654288 / 22:14:35.144542 |
| Memberships joined | Caller 22:14:36.084813; callee 22:14:36.564616 |
| iPhone Home / return | 22:21:05.888021 / 22:21:33.697806 |
| iPhone microphone and connection restored in sample | By 22:22:06 |
| Android repeated-End helper started | 22:24:15.98 |
| After-call message saved | 22:25:27.173445 |

Both endpoints connected and their sampled heartbeats continued during more
than nine minutes of the call. An untouched control interval exceeded 100
seconds. Android completed three full UI mute/unmute cycles across a separately
measured 100.0078829-second interval; both memberships continued to heartbeat.
No audible mute/unmute assertion was verified.

**A definite iPhone keyboard obstruction was reproduced.** After composing,
the keyboard remained behind the full-screen call panel and physically obscured
the microphone and End controls. The controls' lower position overlapped the
keyboard. Header taps, the available automation hide-keyboard operation, an
Escape-key probe, and returning through the thread did not clear it. iPhone
microphone cycles were therefore not executed in this attempt. The call was
ended from Android; iPhone was relaunched while idle for the next attempt.

The iPhone background/return experiment observed microphone false, temporary
reconnection, and eventual connected/microphone-true state with continued
heartbeats. Its direction is iPhone caller to Android callee; it does **not**
satisfy BG02's Android-caller/iPhone-callee direction. Recovery of actual speech
and the specified heartbeat recovery bound remain unverified.

The Android repeated-End helper eventually recorded both devices idle. This
same-thread attempt does not satisfy B2/EN06's receiver-elsewhere entry state.
Before/after messages persisted and receiver read state advanced; the Android
viewport sample did not show the post-call marker. Do not promote MS06 to PASS
without its required visible-message assertion.

### V6A2b-ios-android-mic-01

A fresh iPhone-to-Android voice call started without using the composer, leaving
iPhone controls visible. Correlation hash: `78582db109c318073d0c`.

| Event | Time / observation |
| --- | --- |
| Invite created | **22:26:55.366346** |
| Server accepted | **22:27:01.198828** |
| Three iPhone mute/unmute cycles | 116.072814756-second measured interval; completion recorded 22:29:52.246094 |
| First speaker request | Tap began 22:30:18.791126 |
| Second speaker request | Tap began 22:31:22.006453 |
| Coordinate speaker-control probe | 22:32:47 |
| Android Home / foreground | 22:33:37.748418 / 22:34:15.914904 |
| Server ended | **22:34:31.109671** |

All three iPhone cycles completed with the expected enabled control labels and
peer muted-state projection; both memberships continued to heartbeat. This
addresses the earlier inability to operate iPhone controls, but still does not
prove speech after recovery or silence during Mute.

After each route attempt, iPhone still displayed **Use speaker**. No output error
was visible. The second action was initially labeled a receiver request in the
runner; a correction event at 22:32:46 records that it was another speaker
attempt, because a speaker transition had not been established. The coordinate
probe likewise did not establish a transition. The installed native setter lacks
dedicated route-result receipts, so the actual native result and audible output
remain unresolved.

Android's background state projected microphone false. The first foreground
samples still showed muted/reconnecting state and native `getUserMedia` startup.
The call was ended from iPhone before recovery was fully adjudicated. Those
early samples cannot establish either a BG01 recovery PASS or a product failure.
The iPhone repeated-End helper eventually reported both endpoints idle; actual
post-End silence and the precise cleanup bound remain unverified.

### V6A3-A5-android-ios-video-chain-01 — setup failure retained

Capture started at 22:38:53. The attempted Android video-call tap at 22:43:59
returned HTTP 404 because the expected element was absent while Android was on
Home. A read-only server query at 22:45:28 found no video invitation.

This was a **harness/setup failure before a demonstrated product call attempt**,
not a reproduced video defect and not a video PASS. The conservative rate ledger
still counted the uncertain creation attempt. The actual video call below was
performed after setup recovery; it does not erase this failed setup attempt.

### V6A3: cold Android-to-iPhone video — actual call

Correlation hash: `b2d8c84ff9cbcb0ab6e8`. This attempt reached an accepted call
but exposed microphone recovery and native teardown failures. It did not qualify
video or establish the prerequisites for A4/A5.

| Event | Time / observation |
| --- | --- |
| Invite created | 22:49:06.329405 |
| Server accepted | 22:49:16.382397 |
| Memberships joined | Android 22:49:17.531061; iPhone 22:49:17.716021 |
| Initial Android camera state | Camera off; native capture initially audio only |
| Manual Android Camera On | About 22:50:31.8 |
| Android front-camera first frame | 22:50:32.249; subsequent native frame rate about 15 fps |
| First iPhone Mute tap | 22:50:47.147–22:50:48.014 |
| iPhone Unmute tap | 22:51:11.085–22:51:11.943 |
| Unmute result | iPhone still muted in the 22:53 observations |
| Android native crash | 22:54:19.798; fatal disposed `VideoTrack` access |
| iPhone manual Unmute Retry | About 22:54:40, after the Android crash |
| Server End | 22:55:30.241313, following iPhone End |
| Android relaunch | About 22:56:55, explicitly performed by the operator after the crash |

The initial Android audio-only/camera-off state occurred in a video-call attempt.
Manually enabling its camera produced a native front-camera first-frame receipt
and continuing frames. Those receipts establish capture activity, not correct
remote rendering or genuinely moving video on the other device. The initial
camera state still requires diagnosis; manually enabling it cannot be counted as
successful automatic video startup. **Native audio-only capture does not prove
that JavaScript requested `video: false`: the SDK can filter out a denied camera
request.** The originating request, permission decision and initial camera-off
cause remain unresolved in the installed v6 evidence. Bounded source diagnostics
are now implemented for the next candidate, without supplying the missing v6
request/permission receipt retroactively.

**iPhone Unmute did not restore the observed microphone state.** The first
Unmute tap was followed by this native sequence within the same second:

| Native receipt | Time |
| --- | --- |
| Bottom-up NO | 22:51:11.763 |
| Fulfillment | 22:51:11.780 |
| Bottom-up YES | 22:51:11.899 |
| Fulfillment | 22:51:11.946 |

The transition back to the muted state and the later still-muted observations
must be retained as a failed recovery. This chronology narrows the investigation;
it does not by itself establish which callback or owner caused the reversal.
No audible recovery or silence assertion was independently observed.

**Android then crashed natively** with a disposed `VideoTrack` failure on the
`MediaStream.dispose` → `WebRTCModule.mediaStreamRelease` path. This is a product
failure, distinct from the earlier missing-element setup error. Its underlying
shared local/auxiliary stream ownership cause was subsequently reproduced in the
actual Java disposal methods, as described in the source-repair table below. The subsequent
iPhone Unmute Retry occurred after the peer had crashed and is therefore
confounded; it cannot independently adjudicate recovery with a healthy peer.

After iPhone End, the server recorded all memberships left and both media flags
false. Android's subsequent return was an explicit post-crash relaunch, not
automatic app recovery. Server cleanup and relaunch do not establish native
post-End silence, restored permissions, or the timing objective.

**A4 immediate video and A5 settled video were not executed because their
healthy-call prerequisite failed.** The planned camera Off/On/flip sequence and
independent actual-motion/speech confirmation remain incomplete. No new matrix
PASS is assigned from this attempt.

### V6A6: iPhone-to-Android video

Correlation hash: `8b8efe8439a1fcebc516`. This reverse-direction attempt again
reached an accepted call, initially with iPhone media enabled and Android media
preparation degraded.

| Event | Time / observation |
| --- | --- |
| Invite created / accepted | 22:57:53.706813 / 22:57:58.957719 |
| Initial iPhone state | Microphone and camera on |
| Initial Android state | Microphone preparation failed; camera off |
| Android manual Unmute | About 22:58:35; microphone state recovered |
| Android manual Camera On | Later recovered the camera state; exact transition time not supplied in this interim report |
| iPhone Camera Off | Android showed the expected remote placeholder and camera-off status |
| Last live Android heartbeat before crash | 23:04:01.478 |
| Android native crash | 23:04:07.127; the same disposed `VideoTrack` failure |
| Later server sample, before End | About 23:11:07; Android heartbeat age 426.025 seconds |
| Server End | 23:11:53.057356 |
| iPhone native capture stop | 23:11:53.396525, `AVCapture` stop receipt |
| Android recovery | Explicit post-crash relaunch required |

The manual recovery actions establish the observed control/media states, not
independently audible speech or remotely visible motion. The initial Android
microphone preparation failure and camera-off state remain distinct startup
findings requiring diagnosis. The SDK's camera-permission filtering means an
audio-only native trace cannot by itself identify the JavaScript video request.

iPhone Camera Off correctly projected a remote placeholder and status on Android.
The helper initially mishandled an empty placeholder label; that harness issue
was corrected. **No lens flip was performed.** The subsequent native crash
interrupted the planned sequence, so no complete Off/On/flip assertion is claimed.

The second fatal Android receipt again identifies the
`MediaStream.dispose` → `WebRTCModule.mediaStreamRelease` disposed-video-track
path. Its recurrence in the reverse call direction strengthens the evidence of
an actual product teardown defect. The later source/Java reproduction establishes
the shared-track ownership mechanism; the crash receipts alone do not. The 426.025-second heartbeat age was deliberately preserved
**before** terminal writes could update the membership record. It shows the
crashed endpoint stopped heartbeating; it is not a new measured heartbeat-loop
starvation failure in a running app.

iPhone's native capture-stop receipt follows server End, providing bounded
teardown evidence for that endpoint. Android needed an explicit relaunch. Actual
post-End silence, comprehensive native cleanup and final permissions still need
their own observations.

### B4: background iPhone delivery — inconclusive attempt

| Event | Time / observation |
| --- | --- |
| iPhone Home | About 23:15:10 |
| Invite created / expires | 23:15:11.475 / 23:16:41.475 |
| APNs result | HTTP 200/sent, receipt at 23:15:14.523829 |
| Server presentation marker | `presented_at = NULL` |
| Matching device push receipt | Not observed |
| Device UI evidence during the window | Source/automation operations timed out |
| Later screenshot | Home screen, captured after invite expiry |
| Later system transport event | `apsd` TLS reconnect around 23:18 |

APNs accepted the request, but neither a native receipt nor a server presentation
marker establishes delivery to the app in this attempt. Conversely, the
after-expiry Home screenshot cannot prove that native incoming UI was absent
throughout the active invitation window. Automation timeouts leave that interval
unobserved. This evidence is **inconclusive about device presentation**, not a
presentation PASS and not conclusive proof of an app presentation defect.

The later `apsd` reconnect is relevant diagnostic context, not proof of the
earlier delivery failure's cause. Source investigation did not identify an
unregister path explaining background delivery loss. Preserve this attempt when
assessing the retry; a later success does not erase the uncertainty.

### B4b: background iPhone delivery retry — native presentation and Answer observed

| Event | Time / observation |
| --- | --- |
| Invite created | 23:20:58.277610 |
| Native push received | 23:21:01.339 |
| Native incoming report requested / succeeded | 23:21:01.347 / 23:21:01.376 |
| Server `presented_at` | 23:21:02.138500 |
| Screenshot capture | 23:21:04.201–23:21:04.600; native incoming UI visible |
| System Answer control tap | 23:21:58.682–23:21:59.836, blue check at observed coordinates (382, 92) |
| Native Answer delegate / pending | 23:22:00.021 / 23:22:00.040 |
| Server accepted | 23:22:03.543827 |
| Native Answer fulfilled | 23:22:03.751 |
| Memberships joined | iPhone 23:22:04.857; Android 23:22:05.003 |
| Media membership state | Microphone true on both endpoints |
| Connected UI capture | Note began 23:22:34.890950; both devices recorded Connected |
| Android End, server timestamp | 23:23:12.151730; room memberships left, microphones and cameras false |
| Repeated-End helper | `allIdle: true` recorded at 23:23:21.312332 |
| Case finalization | Completed by 23:25:00 operator readback: active case null, owned capture-process list empty, both devices idle |

This retry has independent native push/report receipts, a server presentation
marker and an actual screenshot of native incoming UI. The coordinate action is
corroborated by the native Answer delegate, pending and fulfillment receipts and
the corresponding server acceptance/join. It therefore provides positive
technical evidence for this background presentation and Answer path, rather
than merely inferring presentation from APNs acceptance.

The screenshot was sampled after the five-second presentation objective; report
completion and the server marker have different meanings from first-visible UI.
This interim report therefore does not derive a precise visual-presentation latency or
award a timing PASS from those mixed timestamps. Microphone-true membership
does not establish actual speech. Both connected UIs were captured; the note's
start time is not the separate observation timestamp for each device.

Android End retired both memberships and set both media flags false; the
repeated-End helper subsequently recorded both UIs idle. This establishes the
reported eventual server/UI cleanup, not the four-second cleanup bound or
actual post-End silence. No native `audio_activation` phase was observed in this
attempt; native Answer fulfillment does not supply that missing receipt. The
case-finalization readback by 23:25:00 confirmed no active case, no owned capture
processes, and both devices idle. That intermediate teardown is distinct from
final qualification cleanup. No whole-row PASS is assigned.

## Repairs identified after building v6

These repairs were not present in installed source `936107e` and have not yet
received physical verification in a new installed candidate.

| Finding | Source repair and bounded evidence |
| --- | --- |
| Composer keyboard obscures iPhone call controls | Commit `3d6569f7965552cc5fea1d0bfc65f02a25a15e58` dismisses the keyboard when the call panel opens, preserving the draft. Eight mounted regressions failed against the old source and passed with the repair; 50 combined tests and lint/type/semantic checks passed. This does not prove physical keyboard geometry on a new build. |
| Repeated renders can erase a failed manual route switch's error | Commit `f7927ad9e1cba47c03fb56417a1a3b8fe8f0f596` stabilizes the legacy adapter's unsupported `setSpeaker` callback. Before the repair, the real screen/adapter/hook reproduction issued redundant automatic route requests and cleared the error after manual native rejection. Three regressions failed on the old source and passed after repair; 198 combined tests and an independent 95-test run passed. Native route policy was unchanged. |
| Native route outcome is not observable enough to diagnose the phone | Commit `03ed5b7b5ebf5f91ae8658cd4378185ca8abfe91` adds bounded internal-only route request/result and immediate output-category receipts while preserving original native operations and errors. Actual Swift execution on Mac passed, including 20 mutation controls. These session-wide samples do not prove a settled route or audible output; installed hardware behavior remains unverified. |
| iPhone video-call Unmute returns to muted state | V6A3 has correlated UI and native receipts for the failed recovery. Commit `4ddaaec981cc977238ccf82f162617c938e85129` reserves matching CallKit feedback before awaiting media reconciliation, keeps the reservation alive only while that operation is pending, retires conflicting stale acknowledgements, and deduplicates the same local operation. Nine new mounted cases and four killed mutation controls cover the reproduced source races; 207 focused tests passed. This establishes the feedback-ownership repair, not which callback caused every v6 reversal or restored physical speech on v7. |
| Native signaling receipts and simultaneous offers can reject otherwise recoverable microphone changes | Commit `7f876809f540989dff13bc540ee4e2e8ac52b974` waits for bounded native stable-state evidence after the matching answer and permits one fresh correlated offer only after an authenticated incoming collision was successfully answered. Arbitrary errors, timeout, repeated collision and cancelled ownership do not gain retries. Nineteen new cases cover correlation, delayed receipts, Mute, End and account/room replacement; 285 combined tests and independent review passed. This is source/controlled-signaling evidence, not proof of speech or diagnosis of every physical startup failure. |
| Android disposed-video-track crash | V6A3 and V6A6 have fatal receipts on the same native disposal path. Commit `8a614eec` detaches shared local/auxiliary stream track references before disposing their native owner. The actual Android bridge and pinned upstream Java disposal methods reproduced the old failure (six failed assertions); the repaired path passed 56 assertions, and separate missing-audio/missing-video detachment mutants failed. JNI edges are controlled. This establishes the source mechanism and bounded repair contract, not installed v7 stability. |
| Initial Android media state in video calls | V6A3 started camera off; V6A6 initially reported microphone preparation failed and camera off. Commit `c5e441074615d22531f09e61e5284d27599f719e` preserves deferred camera intent during background admission. Follow-up `5e2507ff7980639a0993a2ea81cf19ba136ea37d` fences initial capture against newer Off/background state, preserves independently authorized microphone recovery, gives renewed On its own capture, and retains failed-stop ownership for retryable End. Twelve new regressions fail before and pass after; the selected combined suite passed 347 tests. These source tests do not independently identify every v6 startup cause. Commit `6b81efe93cd96c897dcf61af444e93af45814e37` adds bounded media preference/intent/permission/projection and capture request/result diagnostics, enabled only for the two exact internal store profiles and matching signed channels. No raw IDs, error text or capture constraints are logged. Native audio-only capture still does not distinguish a JS request from SDK permission filtering; physical startup requires the new candidate. |

The source reproduction establishes the redundant-request/error-erasure defect.
It does **not** establish which native outcome occurred on the phone during
V6A2b. The new receipts must preserve rejection behavior and expose only the
reviewed allowlisted result, without private route names or device identifiers.
Any native follow-up must receive a new native generation, exact-head validation,
signed builds, provider delivery and independent installation receipts; the built
v6 generation cannot be silently resealed.

The repaired Android sender/disposal and Objective-C sender contracts also passed
on Mac at the diagnostic-input source `e654e6ac`. The Swift audio/route runner
passed there with 20 audio mutation controls, four diagnostic controls, ten
incoming-report controls and four JS root contracts. Later microphone/camera
repairs change JavaScript ownership, so these compiled native receipts do not
replace final combined source validation or installed v7 tests. The separate
[`PR539_V7_EXECUTION_PLAN_2026-10-08.md`](PR539_V7_EXECUTION_PLAN_2026-10-08.md)
preserves the reviewed 105-row mapping and adds the new regression prerequisites.

## Remaining qualification and evidence boundaries

- Validate the integrated microphone, signaling, camera and native ownership
  repairs on the final exact source, then repeat
  required assertions on the final installed source. V6 exploratory successes
  cannot qualify a later build.
- Obtain isolated, independently observed speech in both directions, silence
  during Mute and after End, recovery speech, actual route output, and changing
  physical video on the remote display after Off/On and distinct front/rear flips.
- Rerun every failed and blocked scenario with its exact direction, entry state,
  provider, transition and prerequisite. Preserve defects and failed attempts
  even if a later retry succeeds. A missing prerequisite remains a block.
- Confirm remaining physical prerequisites: owner-assisted unlock/system Answer,
  real Bluetooth hardware, a third authorized identity for account replacement,
  legitimate pending/replacement states, and any separately authorized LiveKit
  canary. Neither rollout changes nor backend state fabrication may substitute.
- Restore and independently verify idle devices, camera/microphone permissions,
  routes and stopped native capture at final completion. Intermediate idle
  observations are not a final teardown receipt.
- Export sanitized, reviewable attempt evidence; reconcile all 105 row
  dispositions and references; manifest and hash a new archive; independently
  reopen it. No new complete evidence ZIP or independent archive verification is
  claimed in this interim report.

Private operator records reported available include
`v6-installed-pair-receipt.json`, `v6-prebuild-validation-receipt.json`, both
`v6-*-artifact-receipt.json` and `v6-*-signed-artifact-verification.json` records,
`v6-ios-diagnostic-positive-control.json`, `v6-call-ledger.json`,
`case-events.jsonl`, and the per-attempt private result/state/native captures.
They are **not attached to this interim report**. The paired-device operator
reconciled this prose against retained receipts; independent reopening of a
sanitized export remains outstanding. Raw screenshots, raw native logs,
provider responses, signed URLs and identifiers require sanitization before Git.

No OTA publication, public release, provider rollout, production database
mutation, entitlement change or money change occurred in the work reported
here. The original 71-file PR #538 ZIP remains unchanged, with SHA-256
`21b3518e394e37809cd490d1f15a01288aaf105af5866765931019dc9b3f45b3`;
its successful integrity check is separate from candidate qualification.
