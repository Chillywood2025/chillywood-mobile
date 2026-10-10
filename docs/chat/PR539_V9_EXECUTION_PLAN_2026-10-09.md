# V9 paired-device execution plan

Prepared 2026-10-09 for the next consolidated PR #539 candidate. Execution plan; final v9 source, tree, native digests, build IDs/numbers, artifact hashes and installed pair are unknown until independently sealed. No placeholder or preceding build identity may satisfy a gate. This is an execution
plan, not a results report. It assigns every ID in
`PR537_RETEST_MATRIX.tsv` exactly once: **105 rows, 105 unique IDs, no omissions**.
All new-candidate verdicts remain NOT RUN until the corresponding evaluation
actually occurs. No prerequisite below is claimed to be available or cleared.

The installed v5, v6, v7 and v8 diagnostic calls do not qualify v9. Preserve each
prior execution plan and diagnostic report as historical records. Build/install v9 only after
exact-head validation and the release review gate pass. Record the final source
SHA/tree, both native digests, signed artifact hashes, runtime/channel, provider,
store build numbers and independent installed-device readbacks. Preserve the
original matrix columns; append new attempt records and update only the retest
result fields. A successful retry never erases an earlier failure.

## V9 identity and first regression gates

Before installing, freeze the completed repair source SHA and Git tree and
recompute both native digests from that committed source. Require successful
protected Required Validation on that exact head, the release-review gate, and
the relevant compiled native contracts. Any provisional seal is historical once final inputs change; it is not the
identity of a later binary.
Record the final identities in the operator's bound candidate receipt and check
them again against each signed artifact and installed app.

| Platform | Required profile/channel | Required runtime | Distribution |
| --- | --- | --- | --- |
| Android | `android-internal-v2` | `1.0.0-android-production-v9` | Existing Play internal testers |
| iOS | `ios-internal-v2` | `1.0.0-ios-production-v9` | Existing TestFlight Chillywood Internal group |

The runtime names in the table are required v9 targets, not observed signed artifacts. Require the final committed release configuration to match them. Record actual store build versions from the completed provider builds; do not
guess them from the preceding versions. Preserve artifact SHA-256, signing
verification, source/tree, native digest, EAS/provider identifiers, installed
version and installer evidence. Confirm the app's actual provider for every
attempt; existing v7 calls used `legacy_webrtc`. Neither runtime/profile names
nor a store listing alone prove source or installation. No OTA, public release
or provider rollout is part of these gates.

Run these separately named regression attempts first, with the normal creation
budget and healthy-pair prerequisites. They are additional diagnostic assertions,
not new matrix rows or a substitute for the exact 105-row map below:

1. **Logging positive control.** On the exact installed v9 pair, preserve current
   logs and observe allowlisted `[CH_CALL_MEDIA]` startup receipts on each
   platform. Check preferences/intent, permission/projection and capture
   request/result separately. Require the exact internal store profile and
   signed channel; absence without a verified channel is an observation block.
   Session-wide sequence, capped track counts and an allowlisted error name do
   not identify a call, prove SDK permission grant or establish live media.
   On iPhone, also verify the native registration channel and route request,
   result and immediate-output receipts. An immediate category is not settled
   output or audible route proof.
2. **First incoming iPhone Unmute.** Start Android-to-iPhone video with a healthy
   peer, then Mute and perform the first Unmute. Correlate local intent, native
   bottom-up feedback, the pending media operation, durable state and both
   controls. Check that matching feedback cannot supersede its own operation,
   a genuine opposite system Mute remains authoritative, and a duplicated local
   tap does not create another owner. Repeat actual isolated speech/silence
   observations. If a pending ordering cannot be reached legitimately, retain
   the physical block and the separately identified mounted/native proof.
3. **Android delayed native stability and offer collision.** Exercise incoming
   startup and subsequent Unmute with current signed-in membership. Preserve the
   original offer/answer correlation, native stable receipt and outcome. If an
   authenticated simultaneous incoming offer occurs, verify successful inbound
   answer delivery before at most one fresh correlated retry; timeout, repeated
   collision, stale answer, arbitrary error, Mute and End must not enable media
   or create another retry. A fabricated backend signal or source mutation
   cannot establish an installed race; isolated controlled tests remain separate.
4. **Camera cancellation and microphone independence.** Distinguish three
   positively observed pending-capture states: Camera Off during initial
   foreground capture; Camera Off during foreground camera recovery while the
   microphone remains requested; and backgrounding before initial video capture
   completes. Late video must not be adopted or transmitted after cancellation.
   The recovery variant must still restore independently authorized microphone
   capture and actual speech. Record current app state and ownership before and
   after completion; ordinary toggling after settled capture does not test these
   races. A missing safe pending barrier remains a physical dependency block.
5. **Shared-track crash regression.** In video calls in both directions, preserve
   initial state, perform manual Camera On where required, then camera Off/On
   and supported lifecycle recovery to exercise shared local/auxiliary capture
   ownership. Confirm the Android process remains alive through teardown, there
   is no disposed-track fatal receipt, heartbeats remain live before End, shared
   captures stop once, and a fresh call succeeds. Retain any earlier failure.
   A UI relaunch is not automatic recovery or a successful crash regression.
   Repeat independent speech and changing remote-video observations.
6. **Keyboard and route regression.** Compose a retained draft before opening
   call controls and verify microphone/End remain physically reachable. Check
   manual iPhone route success or visible failure across unrelated renders.
   Correlate the native route result with actual output; a changed label or
   stable callback does not prove that sound moved.

Stop adding dependent media transitions to an already failed call. Preserve its
failure, complete safe cleanup, and continue only independent work. Every final
row remains NOT RUN until evaluated on the installed v9 candidate. These source
repairs and diagnostic gates do not pre-award any verdict.

## Additional regression gates from v7 physical failures

Run the six inherited gates above and these separately recorded cases on the
new installed pair. No v7 result transfers to v9.

1. **Android prolonged background recovery.** Run both the controlled 20-second
   interval and a scheduled 60-second interval that exceeds the 45-second
   membership-visibility lease. Record the actual interval and automatically
   restore foreground in the same bounded worker, even when an observation
   fails. The caller stays active. Confirm no callee-originated global End,
   fresh authorized membership before resumed capture, live heartbeats, and
   restored camera/microphone controls. Repeat independent speech and motion.
   Denied admission and failed native shutdown remain isolated negative
   controls; do not fabricate either by mutating production ownership.
2. **iPhone automatic mute feedback.** Answer an incoming native video call,
   verify activation separately, then background for 20 seconds and restore.
   Correlate requested microphone intent, automatic-feedback reservation and
   settlement, native mute feedback, and foreground capture. An automatic
   suspension must preserve the current recovery request. Genuine explicit
   Mute, End and account change remain authoritative. Require actual speech
   after recovery and actual silence during Mute/after End.
3. **Native audio readiness.** Privately capture all relevant activation phases,
   including session-wide receipts without a call hash; sanitize every export.
   Separate server
   acceptance, native Answer fulfillment, audio-session preparation and actual
   activation. An expired navigation token cannot substitute for activation.
   An accepted native handoff without activation has a 15-second local wait
   bound, followed by a visible failure and exact-call cleanup; delayed JS
   scheduling must be recorded rather than claimed as an exact OS deadline.
   Confirm End remains available when cleanup requires a retry. Do not create
   a missing-activation condition by changing the production backend or app.
   Retain the mounted no-activation/claim-expiry and native preparation-failure
   controls as software evidence, separate from physical audio confirmation.
4. **Late and terminated iPhone delivery.** Run separate background and
   XCTest-terminated voice/video attempts. Capture APNs status, dispatch
   response timing, native push callback/report and visible UI. Timestamp
   domains and uncertainty must remain explicit. A late report fails the
   five-second objective even if it subsequently appears. Never claim XCTest
   termination equals user force-quit or ordinary OS eviction. Do not reopen
   before presentation or silently replace a missed attempt with a fresh one.
5. **Expired invitation on foreground.** Allow a valid invitation to reach its
   authoritative expiry without Answer, then foreground and preserve immediate
   and subsequent UI observations. A stale incoming banner or cached live-call
   state is distinct from a live accepted call. Native and server cleanup must
   retain exact invite/room ownership; no automatic Join or backend rewrite is
   permitted as cleanup. Preserve every stale observation even if it resolves.

## V9 initial gates from the v8 failures and successor repairs

These are separately named diagnostic assertions, not new matrix IDs. Run them
before extending the ordinary batch sequence. A successful source test or an
older installation does not clear a physical prerequisite. Preserve each v8
R01–R06 attempt and its uncertainty exactly; no new v9 result rewrites it.

| Gate | Exact physical sequence | Evidence required before advancing |
| --- | --- | --- |
| V9-G1: committed iPhone microphone during Android camera changes | Fresh healthy Android→iPhone foreground video. Record initial real speech/motion and microphone intent. Perform the first iPhone Mute/Unmute, then three individually observed cycles only while healthy. With both microphones explicitly On, perform Android camera Off→On→Flip→Off→On→Flip; Off/On precedes the first lens flip. Continue a separately named untouched observation interval of at least100 seconds after the final camera step, with live heartbeat and native capture evidence. | The iPhone must not acquire an unsolicited Mute or lose its committed microphone during reconciliation. Correlate native mute/action feedback, requested versus proved mic state, capture owner/track and both durable projections before/during/after each camera step. Real system Mute and explicit End remain authoritative. Prove silence when muted and actual remote speech after every Unmute and throughout/after the camera sequence; prove distinct changing lens views. The six UI steps alone do not clear any media assertion. |
| V9-G2: Android background lease recovery and camera intent | Fresh healthy iPhone→Android video, with Android receiver mic/camera requested On. First run the controlled20-second Home/return interval; after healthy recovery, run the scheduled60-second interval exceeding the45-second visibility lease. Use one bounded worker that restores foreground in finally, even after observation errors; record actual duration. Keep the iPhone caller active. | Distinguish signaling resubscription from fresh membership admission. Preserve room visibility reads, admission result, session restart, native capture shutdown/start, actual room/participant generations and continuous caller heartbeats. A missing callee room snapshot must not become a callee-originated global End. Readmission must authorize capture before it resumes. Camera Off during background privacy does not erase the current Camera On request, including when queued projection completes after foreground. Require current camera/mic recovery, actual two-way speech/motion and no unsolicited termination. A successful20-second result does not clear a failed60-second result. |
| V9-G3: accepted iPhone native call survives a real screen remount | After a freshly and validly operated native Answer, bind the accepted exact call/account/room, native descriptor and activation receipt. Use only a supported call-preserving navigation away/back that actually remounts the thread screen. Record remount evidence; ordinary Home/foreground alone is not a remount. Also exercise legitimate pending readiness/remount ordering only if it can actually be reached without changing source/backend or suppressing native callbacks. | The remounted screen must retain exact accepted native-call ownership and the correct readiness requirement; it must not treat missing local navigation/claim state as permission to capture. Verified current activation may authorize only its matching live call. Absent activation must remain blocked, with the documented bounded failure/accessible End behavior and no reset that grants audio. No duplicate Answer, acceptance, join invocation or capture owner. End/account/replacement/late-activation counterexamples remain exact production-path software controls when physically unreachable. A normal app-owned Answer without CallKit ownership is a separate negative control, not forced into the native path. |
| V9-G4: actual Android11/API30 output capability | Read the actual installed Android OS/API level; the intended device is API30 and must be confirmed by a fresh receipt. In a healthy iPhone→Android legacy_webrtc voice call, exercise the app's actual receiver→speaker→receiver control; repeat in iPhone→Android video while motion persists. Require final installed native capability receipts and actual available speaker/earpiece hardware. | Prove routing uses the current owned audio session, current selected/available device receipts, truthful settled UI or visible failure, and independent sound from the intended physical output. A route label, SDK callback or Android API31-only contract is insufficient for API30. Missing earpiece/capability remains a block; do not expose or claim unsupported controls. Verify unrelated render/reconciliation and lifecycle recovery do not silently reset the user's route; End releases only its owner and a fresh call acquires normally. Bluetooth remains a distinct hardware-dependent row. |

G1 may inform MC04/CM01/CM02 only when their exact direction and actions match;
G2 may inform BG03, not incoming Android-background Answer or voice BG01. G3
supports the native Answer assertions of its actual entry/media row; it creates
no new matrix row and does not prove another entry state. G4 covers AR01 or AR03
only in the canonical direction/media; the other platform's route assertions
remain separate. Preserve the exact batch-to-row assignments below.

The v8 R01 first-Unmute target source returned healthy at14.825 seconds while
the peer source completed at15.121 seconds. That aggregate observer overrun is
not a proved product recovery timeout and did not complete three cycles. Keep
it separate from R01's later unsolicited iPhone mute/feedback failure. V9 mic
observations must retain each endpoint's source-request start/end independently;
a slow peer or screenshot cannot backdate, erase or relabel the target response.
The helper's15-second observation budget does not relax the two-second event
projection objective or prove physical audio. An ambiguous tap is never retried
under a new cycle label. Use a reviewed v9-bound stepwise helper; do not reload
or edit a frozen v8 helper to make its source guard pass.

For G2, capture bounded allowlisted phases present in the final source, including
`room_snapshot_missing`, `signaling_subscription`, `session_admission_result`,
`session_restart_requested`, `session_restart_started`, `room_snapshot_ended`,
`room_terminal_received` and `session_initialization_failed` as applicable.
Record absence only when that channel and interval are positively verified.
No diagnostic receipt alone proves the server action's cause or actual media.

The source review checkpoint for this plan is commit838b0d6a, not a final v9
candidate. At that checkpoint:

- `b7372ca6` changes committed-mic reconciliation in
  `hooks/use-communication-room-session.ts`, with counterexamples in
  `tests/assurance/chat-thread-integration-mounted.test.mjs` and the actual iOS
  facade test. Newly acquired/uncommitted tracks still stage disabled; failed
  transactions must not produce a rollback Unmute pulse.
- `d7f6813e` changes missing-snapshot recovery across signaling resubscription;
  `2010567e` retains camera intent at the actual background privacy boundary.
  `tests/assurance/chat-call-native-state-mounted.test.mjs` covers delayed
  projection, Camera Off, End/account replacement and repeated background.
- `52b8fa2b` adds owned legacy Android routing through
  `plugins/native/ChillywoodOwnedAudioSession.java`,
  `hooks/use-legacy-android-audio-route.ts` and
  `_lib/livekit/ownedAudioSession.ts`. At this checkpoint `supported()` still
  requires API31, so it is not API30 completion evidence. The actual API30
  compatibility change and its compiled production-Java contracts must be
  reviewed and bound to the final candidate before G4 can qualify.
- The accepted-remount/readiness repair was still being completed. Bind its
  reviewed production change and mounted/native counterexamples before sealing;
  do not claim the current screen's local descriptor/ref already survives a
  remount. The release-generation file at this checkpoint still names v8.

These checkpoint facts explain the proposed gates; they are not the identity,
completion status or validation receipt of whatever later source is sealed.

## Native Answer freshness and unambiguous system controls

This procedure applies to every native background/terminated/elsewhere Answer
attempt. It corrects the v8 observation failures without inventing an Answer
outcome:

- R03 had reported native presentation, but its last screenshot was about33
  seconds old when the intended tap occurred. Server decline preceded that tap
  by about13.4 seconds. The tap may have opened Calendar. R03 does not establish
  an actual Answer delegate, an Answer rejection or successful handoff.
- R04 created no call. The external Calendar prompt was removed by closing only
  the positively identified Calendar app; no Allow/Deny permission choice was
  made. Preserve that cleanup and setup contamination separately. Do not choose
  an unrelated app's permission as a way to recover call automation.
- R05 video and R06 voice had APNs200 but no observed native banner before authoritative expiry;
  no Answer was executed. A later registration positive control does not prove
  uninterrupted earlier native-log coverage. APNs acceptance is not delivery,
  CallKit report, visible presentation or actionable Answer.

Before creating the invitation, confirm idle authorized pair, current entry
state and captures. Preserve the iPhone lifecycle/registration logging positive
control before background/termination and ongoing reader health. Do not infer
coverage for a suspended, restarted or unobserved process. Capture missing
intervals explicitly, including session-wide call_hash=none receipts.

After creation, take bounded non-intrusive observations and fresh read-only
server snapshots. Do not activate the app, open Calendar/Settings, change
notification permissions, dismiss unrelated surfaces, repeatedly query large UI
hierarchies, or repeatedly poke coordinates to make a native banner actionable.
A slow/unsupported observer is a limitation to record, not a reason to use an
old screenshot. Record actual screenshot request-start/return and any native
presentation time; nominal0/2/4/6-second scheduling is not measured latency.

Immediately before the **single** intended Answer action, require all of:

1. **Exact current invitation:** a fresh authorized read-only record matches the
   bound call/account/room/media/provider and is still `ringing`, with no
   accepted/declined/canceled/missed/ended state and no known competing Answer.
   Bind actual created_at/expires_at and fresh server-observed time. A canceled
   or expired invitation is never actionable even if old native UI remains.
2. **Current native target:** prefer a supported semantic system Answer control
   that is uniquely identified and enabled on the correct native call surface.
   Perform the last-moment semantic element read, current-case/invite/device
   binding checks and the single tap in one bounded Mac worker, without another
   cloud/image roundtrip between that read and dispatch. The element must belong
   to the currently observed native surface, not a prior invitation. If semantic
   automation is unsupported, use a visual fallback only when the operator has
   actually viewed a fresh image and verified the Answer coordinates against
   that exact phone, screenshot, viewport, orientation and native call window.
   Cached coordinates or an inferred banner position never qualify. If neither
   supported path is available, a present owner may operate the live phone;
   absent that support, preserve AUTOMATION BLOCKED.
3. **Practical maximum age and expiry margin:** at action dispatch, require the
   latest exact `ringing` server read to be no more than ten seconds old. For a
   visual fallback, the actually viewed screenshot must also be no more than
   ten seconds old at dispatch. Measure age conservatively from each host
   request-start or an independently known capture time, not from a delayed
   response's completion. Record request/return, image-viewed and dispatch
   times. Require at least twenty seconds of proven lifetime remaining until
   the actual server `expires_at`, after accounting for measured clock
   uncertainty and the elapsed time since the fresh server observation. Recheck
   the captured case, exact invite/account/room, device and observed control or
   visual-window binding immediately before the tap in the worker. These are
   operator bounds sized for the measured remote-tool latency, not product SLOs.
   If any age, binding, expiry margin or clock-uncertainty check cannot be proved,
   do not act. Obtain a new legitimate non-intrusive observation only while the
   same invitation remains safely valid; otherwise retain the block/expiry
   without retrying creation or widening the bound for that attempt.
4. **Known intervening changes:** an observed app switch, prompt, banner
   replacement/disappearance, rotation, user action or terminal server/native
   event invalidates the prior control/window binding. Revalidate when anything
   changes. Never reuse an element or coordinates from a retired invitation.
   Uncertain action delivery consumes the attempt; do not try another selector
   or tap the same location again.

Freshness cannot exclude a native banner disappearing between observation and
tap, and the server/UI checks are not atomic. A terminal race can still occur
after the latest valid read. Preserve the exact ordering and require correlated
native `answer_delegate_received` plus the authoritative server acceptance result
for that same invite/account/room before classifying an actual Answer/handoff
outcome. Success requires accepted state; a correlated rejection remains its
actual failed outcome and is never rewritten as acceptance. A tap
return, app foreground or Calendar opening alone proves none of that chain.
Then independently require the correct thread, one join invocation,
preparation-before-fulfillment and actual current audio activation before
claiming those stages. Preparation, fulfillment, activation and audible speech
remain separate assertions. Do not assume native control automation is supported
until it is positively demonstrated on this OS/current surface.

The ten-second operator freshness bounds and twenty-second expiry margin do not
relax the existing five-second presentation objective, any canonical first-media
requirement, native-readiness deadline, event-projection, heartbeat-recovery or
cleanup objective. Preserve late presentation as a failure even when a later
validly bound action is observed; no timing measurement is backdated or replaced
with the operator's dispatch budget.

If no native presentation is observed before expiry, never dispatch Answer.
Record each observation, provider/APNs outcome, native report/push evidence or
coverage gap, actual authoritative deadline and missed/cleanup status. After
expiry, a deliberate recorded foreground is only the expired-presentation cleanup
regression, not proof of successful background incoming Answer. A stale banner
or live-call header must not create a join/capture or affect a different call.

## Independent physical media proof on v9

Before a call used for media qualification, name the consenting observer(s) or
bind a genuinely verified physical signal rig, endpoint locations, intended
outputs and isolation evidence. The operator running automation is not an
independent media witness merely because logs or screenshots are visible.

For audio, place the phones in separate acoustic spaces or prove equivalent
isolation. Generate a fresh unpredictable spoken challenge at the source phone's
actual microphone, and have the remote observer report the words heard from the
intended physical output. Repeat separately in both directions, then after each
Unmute, route change, permission recovery and lifecycle/remount recovery. During
Mute and after End, continue a new challenge at the source and confirm it no
longer emerges from the remote output while the local source remains audible
only locally. Record start/end times, direction, exact call and current mic/route
state with the observer assertion; do not let direct room sound, another call,
Mac playback or a replayed clip satisfy the observation.

A physical rig may substitute only after an independently documented control
shows its stimulus really enters each phone's microphone, its sensor records the
other phone's selected output, and there is no direct acoustic/electrical/network
bypass. Use a fresh distinguishable challenge and blocked-path/isolation controls;
retain synchronized source/output captures and uncertainty. Browser synthetic
tones, injected tracks, packet counters or an unverified loopback rig do not test
this chain. Do not mark audio PASS while that rig-validation dependency is open.

For video, put a distinct continuously changing physical marker/gesture in front
of each unobstructed lens and independently observe the corresponding motion on
the other phone's actual display. Change the physical scene for front/rear lens
switches; confirm that Off stops the transmitted view and On resumes current
motion, without stale retained frames. Repeat after camera controls, permissions,
background/foreground, accepted-call remount and fresh replacement. Record the
source scene and receiving display together or with a clearly time-bound witness
assertion, exact direction/step and unique files. A first-frame callback, tile,
preview, screenshot, decoded-frame counter or Camera On label is supporting
diagnostic evidence and cannot establish moving remote video.

Missing observers/verified isolation/hardware remain precise dependency blockers.
Execute safe independent UI/native/server assertions without promoting them to
physical media PASS or silently abandoning the required audio/video assertions.

## Common evidence and acceptance

Use one case-attempt identifier plus UTC and monotonic event times. A shared call
can support several rows only when it actually satisfies each row's direction,
media, entry state, action and expected outcome. Keep separate assertions and
verdicts for those rows. The table's grouping is not permission to infer an
unexecuted transition. Split a batch into more calls whenever one transition
changes or destroys another row's prerequisite.

Before the first invitation, capture the current native logs without clearing
them. Verify an allowlisted v9 lifecycle/registration diagnostic as a positive
control on iPhone; silence in an unverified logging channel proves nothing.
Capture both device streams throughout each attempt. Collect read-only server
snapshots during the call, before terminal writes overwrite membership history.
Keep all v8 plans, private helpers, seals, logs, attempts, artifacts and verification receipts immutable. New v9 helpers must bind the final v9 pair and use new unique output paths; never relabel v8 installation or results. Keep private device/account/call identifiers, payloads, credentials and raw logs
outside Git. Export only sanitized correlations and bounded relevant events.

Every connected-call attempt needs the following distinct receipts:

- Actual provider and exact invite/room/account ownership; entry state before
  the invitation; caller tap, server creation/expiry and visible presentation.
- For iPhone Answer: native report completion, actual Answer delegate, current
  JS authority, server acceptance, correct thread, one join and audio activation.
  Foreground presentation fallback is not proof of background PushKit receipt.
  One current membership row per endpoint does not independently count JS join
  invocations; retain the actual invocation receipt or mark that assertion
  unverified.
- Native microphone/camera start, stop, error and route receipts; current media
  owner; both endpoint UI states; available send/receive/decode/render counters
  sampled over time. Missing counters are unavailable, not zero.
- Independent physical media confirmation, control/privacy checks, explicit
  cleanup on both endpoints and fresh reuse where the row requires it.

Use the documented objectives: incoming presentation at most five seconds,
event projection at most two seconds, heartbeat recovery at most fifteen
seconds, cleanup at most four seconds or an explicitly recorded retryable
failure. Record both start and end events before computing a duration. A
retryable failure is not successful cleanup or a whole-row PASS unless that
row's expected assertion is specifically the truthful failure behavior. Expiry
uses the actual server `expires_at`. Do not borrow the browser observer's
three-second settling bound as a physical mute acceptance limit.

**Actual audio:** place endpoints far enough apart, or use verified isolation,
so direct room sound cannot satisfy the test. A consenting observer gives a
fresh unpredictable spoken challenge into each physical microphone and confirms
the words through the intended remote output. Repeat after Unmute, route change,
permission recovery and lifecycle recovery. Continue the challenge during Mute
and after End and confirm it no longer travels through the call. An app label,
audio-session activation, packet counter or synthetic browser tone is not this
proof. A verified physical signal rig can substitute only if its capture and
remote-output observation actually traverse the phones and exclude acoustic
leakage.

**Actual video:** keep both lenses unobstructed and show a changing physical
marker or gesture. Observe the corresponding motion on the other phone's
display. Use distinct front/rear scenes, repeat after each flip and Off/On, and
confirm Off removes transmitted content. Native first-frame receipts and
decoder counters support diagnosis but cannot replace remote motion proof.
The v5 rear-camera black image had an uncontrolled scene and cannot establish
either a camera defect or a pass. Give every screenshot/clip a unique attempt,
step index and direction so a later flip cannot overwrite an earlier artifact.

## Rate scheduling and setup

Maintain a timestamp ledger for every attempted call creation, including failed
attempts whose rate-limit consumption is uncertain. Before tapping Call, verify
capacity for the existing authenticated caller's applicable scopes: at most
three invitations per rolling 300 seconds and five room creations per rolling
600 seconds. Use observed server times when available and a positive timing
margin. If scope/count is uncertain, conservatively reserve against both limits;
do not reset counters, mutate backend state or switch accounts to evade them.
Read-only rate evidence may refine the ledger; successful cleanup does not
refund capacity. Do not blindly retry `rate_limited`.

Reserve two consecutive creation slots before an immediate-replacement pair.
Reserve three before a cold/immediate/settled video chain, and verify that the
600-second room budget also has capacity. If capacity is unavailable, wait
before the first call; inserting a rate wait between End and the second call
invalidates the immediate-replacement assertion. A settled call starts only
after recorded cleanup has settled. Record the actual End-to-next-Call interval
for both variants. Use budget waiting time for log review, sanitization,
read-only state reconciliation and physical fixture preparation.

After the v9 prerequisite and regression gates below, run A1 and A2 to
discriminate Answer and heartbeat failures. In A2 add a
separately identified untouched control interval of at least 100 seconds,
followed by repeated microphone/media changes over at least 100 seconds. Sample
both membership heartbeats throughout, keeping the normal fifteen-second cadence
and forty-five-second stale threshold unchanged. Compare against V5D03/V5D04;
an unsolicited termination is a failure, not a microphone-cycle completion.
These extra diagnostics do not create additional matrix PASS rows.

Next run the video chains A3–A5 and A6–A8 with reserved capacity. Advance to the
remaining entry states after basic voice/video works. If an active-media
prerequisite fails, preserve that failure and continue safe independent cancel,
decline, expiry and messaging work; dependent media assertions remain blocked.
Do not add more disruptive actions to an already failed call just to count rows.

## Exact batch-to-row map

Each row ID appears once in this table. A table entry may require several calls;
it does not promise that all its transitions fit one call. A missing fixture for
one row must not prevent evaluating the other independently reachable rows.

| Batch | Exact matrix IDs | Execution and distinguishing proof |
| --- | --- | --- |
| A1: Android to iPhone voice | BL01, EN01, MS05 | Both in the same thread. Send a unique test marker before the call. Answer on iPhone; verify actual two-way speech. Android End and supported repeated End must retire both endpoints without revival. Send a new acknowledged marker after End and read it on iPhone. |
| A2: iPhone to Android voice | BL09, MC01, MC02, AR02, BG01, LK01, EN05, MS06 | Same-thread Answer; untouched and repeated-control heartbeat diagnostics above. Perform three complete mute/unmute cycles on each platform with remote audible/silence proof after every transition. Exercise iPhone speaker/receiver, Android background/return and owner lock/unlock one at a time, proving speech after each. iPhone repeated End. Unique iPhone messages before and after must be acknowledged and visible to Android. Missing unlock/route observation leaves only those assertions blocked. |
| A3: cold Android to iPhone video | F01, BL05, MC04, EN03 | Record cold entry, presentation and Answer. Prove speech/motion both ways and three iPhone mic cycles. Android repeated End; reserve A4's immediate slot before beginning. |
| A4: immediate Android to iPhone video | F02, FI02, MS07, EN04 | Start directly after A3 End, before settled cleanup; record exact interval and retired/new ownership. Prove real media and send an acknowledged Android marker visible to iPhone while the replacement remains active. iPhone repeated End. |
| A5: settled Android to iPhone video | F03, FS02, CM01, CM02 | After recorded settled cleanup, establish fresh media. Android Off/On before any lens flip; then change lenses with distinct moving scenes, preserving audio and correct iPhone rendering. End and verify idle. |
| A6: cold iPhone to Android video | F04, BL13, MC03, EN08 | Cold reverse direction; actual speech/motion and three Android mic cycles. Android repeated End; reserve A7's immediate slot before beginning. |
| A7: immediate iPhone to Android video | F05, FI04, MS08, EN07 | Start immediately after Android ended A6. Verify fresh ownership/media. Send an acknowledged iPhone marker visible on Android during the active replacement. iPhone repeated End. |
| A8: settled iPhone to Android video | F06, FS04, CM03, CM04 | Fresh call after settled cleanup. iPhone Off/On before lens flip, then front/rear moving views; verify Android camera state/rendering, continuing audio and clean End. |
| B1: iPhone elsewhere, voice | BL02, D5, EN02 | Android calls while iPhone is elsewhere in the app. Correlate native UUID/account/report/Answer, server acceptance, correct thread, one join, audio activation and actual speech. iPhone repeated End. A foreground in-thread fallback cannot substitute for this entry path. |
| B2: Android elsewhere, voice | BL10, EN06 | iPhone calls while Android is in Settings within the app. Answer must reach the exact thread and actual speech; Android repeated End. |
| B3: elsewhere, video | BL06, BL14 | Two separate calls, receiver elsewhere in the app in each direction. App-wide/native Answer, correct thread, actual bidirectional motion/speech, End. |
| B4: iPhone background/terminated | BL03, BL04, BL07, BL08 | Four separate calls: voice/background, voice/terminated, video/background, video/terminated. Record exact termination method, Focus state and provider receipt; require device PushKit/report/visible native UI before Answer. A physical operator handles system Answer if automation cannot. Then prove real media and cleanup. Never reopen the app first and call that background presentation. |
| B5: Android background Answer | F07, BL11, RB01, RB03, BL15 | Voice and video attempts with Android backgrounded before the incoming action. Record notification action, Activity/service state, permissions and native microphone eligibility. If initially ineligible, prove truthful muted state and recovery of the retained current request after eligible foreground. RB03 and the pending portion of F07 require positive evidence foreground occurred before that same recovery settled; ordinary background/foreground is insufficient. Use a separate attempt if that ordering is not reached. Prove current Mute/denial/End cancels deferred capture in separately identified variants. |
| B6: Android force-stop | BL12, BL16 | Separate voice/video attempts. Confirm actual OS force-stop, expect suppressed background delivery, explicitly relaunch before authoritative expiry, then verify reconstruction/Answer/current media and End. Suppressed force-stop delivery is expected behavior. Do not equate Home/background or swipe dismissal with force-stop. |
| C1: fresh voice calls | FI01, FI03, FS01, FS03 | Four direction/timing variants. FI01 immediately follows a completed Android-originated voice cleanup. FI03 immediately follows EX03's recorded expiry cleanup; reserve its slot before EX03. FS01/FS03 start after recorded settled cleanup. Require fresh ownership and audible media, then End. |
| C2: established lifecycle | BG02, BG03, BG04, LK02, LK03, LK04 | Established calls in each row's direction/media: iPhone voice background, Android video background, iPhone video background, iPhone voice lock, Android video lock, iPhone video lock. May attach non-destructive transitions to a healthy same-direction call. Record native suspension/interruption/route and restore actual speech/motion after foreground/unlock. Lock tests require owner unlock, without revealing a passcode. |
| C3: loss and permission recovery | PR01, PR02, PR03, PR04, PM01, PM02, PC01, PC02 | Separate controlled peer-loss variants for each platform/media, with automation still observable and exact interruption documented. Verify peer absence and supported return with actual media. Then run Settings microphone denial/regrant on each platform and camera denial/regrant on each platform. Truthful muted/off UI, no unauthorized capture, and explicit supported recovery are required. iPhone camera revocation may terminate the app; preserve that event and use supported rejoin. Do not silently use permission denial as proof of ordinary network loss; PR04's specified permission-triggered variant stays labeled. |
| C4: routes and Bluetooth | AR01, AR03, AR04, BT01, BT02 | Verify whether each app-owned route control actually exists for the observed provider. Android legacy app-owned controls must prove actual capability on the final installed API30 device; an API31-only implementation or unsupported receipt does not qualify. Apply V9-G4. iPhone video route changes need actual output proof while motion persists. For each platform's Bluetooth row, select a real connected accessory, prove audio there, interrupt/disconnect it, and prove supported output recovery. Record the chosen voice/video variant explicitly. |
| D1: non-answer lifecycle and messages | CA01, CA02, CA03, CA04, DE01, DE02, DE03, DE04, EX01, EX02, EX03, EX04, MS01, MS02, MS03, MS04 | Twelve invitations: each direction/media crossed with caller Cancel, receiver Decline and authoritative expiry/late Answer. No media join or capture may occur. Preserve actual status, terminal actor and cleanup times. Pair unique before/after acknowledged messaging markers exactly as specified: MS01 with CA01, MS02 with CA03, MS03 with DE01, MS04 with DE04. DE03 must create a valid saved invite under budget before testing Decline. Reserve FI03 before EX03. |
| E1: pending recovery races | F08, RB02, RB04, RB05, RB06 | First establish a healthy recoverable mic owner. RB04 is iPhone background before recovery; RB02/RB05 require actual native recovery pending at background; RB06 requires foreground before completion; F08 combines the iPhone transition order. Require positive barrier/phase receipt and observe delayed completion/cancellation. If installed behavior cannot safely reach the race, retain the physical dependency blocker and execute a separately labeled isolated native fixture using the actual production coordinator/hook. Fixture success cannot mark these physical rows PASS. |
| E2: ownership replacement | SR01, SR02, SR03, SR04, AC01, AC02, AC03, AC04 | Same-membership replacements need a supported UI path that truly reuses the same row while cleanup settles; a fresh room is not equivalent. Do not edit backend ownership to create it. Account replacements need a third already-authorized identity and a reproducible settling operation; change account through supported UI, prove old work cannot mutate or capture for the new authority, and restore the original signed-in pair. Native/mounted barriers remain separate software proof if the physical state is unreachable. |

## Prerequisites that automation cannot invent

- A consenting observer, or already verified physical signal rig, for isolated
  actual two-way audio, mute/End silence, output-route proof and moving remote
  front/rear video. The owner's earlier XCTest authentication does not provide
  this media observation.
- Owner presence to unlock each phone during LK01–LK04 and to operate an iPhone
  system Answer control if Appium cannot reliably activate it. Preserve a clear
  distinction between an automation limitation and a product rejection.
- Actual Bluetooth hardware for BT01/BT02. Obtain an existing authorized
  accessory; do not pretend OS route names prove it emitted sound.
- A third authorized test identity and a suitable authorized device/session
  arrangement for AC01–AC04. Do not create accounts, reuse unrelated identities
  or switch accounts merely to avoid call-rate limits.
- A controlled, legitimate connection-loss mechanism for PR01–PR03 and the
  appropriately labeled PR04 variant that leaves evidence/automation usable.
  Record whether the mechanism is network loss, process exit or permission
  revocation; these are different failures.
- A legitimately reachable pending operation for the RB/F08 race assertions
  and a supported same-membership path for SR01–SR04. No production source or
  backend mutation may fabricate their preconditions. A controlled native
  fixture is useful additional evidence, not a physical substitute.
- An implemented and validated Android route capability for AR01/AR03 on the
  actual installed API30 hardware. The v9 owned-route work must pass its final
  compiled compatibility contracts and actual output observation; the old
  unsupported capability and an API31-only receipt cannot qualify it. Missing
  capability or hardware remains blocked; absence is not PASS.
- An already-authorized LiveKit canary for additional LiveKit qualification.
  The original 105 rows contain 104 `legacy_webrtc` records and one
  `not_persisted` record; none establishes LiveKit. Keep provider variants
  separate. Do not enable a provider rollout to remove this dependency.

When a dependency is unavailable, evaluate the reachable assertions and record
the exact unmet one. A product defect demonstrated during execution is FAIL;
a system-owned control that trusted automation cannot operate is AUTOMATION
BLOCKED; missing people/hardware/identity/valid state is DEPENDENCY BLOCKED.
Neither kind of block is PASS. NOT RUN means no evaluation occurred. Every row
must have an evidence-backed disposition, but disposition alone is not
qualification. No unresolved critical defect or blocked required assertion
qualifies the candidate.

## Existing helpers and final evidence review

The repository does not contain the private Mac `driver_session.py` or current
V5D01–V5D05 runner/session files. Reuse the live task's verified private helpers
only after checking current session/device/build identity; do not infer their
availability from this document. The root operator owns all phone/Mac actions.

Repository helpers with deliberately limited roles:

- `scripts/physical-automation-control.mjs --snapshot <non-secret-health.json>`
  checks a supplied automation-health snapshot; it does not execute the matrix.
- `scripts/ios-delivery-control.mjs` enforces reviewed delivery identity and
  duplicate-submission controls; it does not prove installation or media.
- `scripts/verify-chat-physical-evidence.mjs --bundle <unpacked-directory>`
  checks hashes, references and recognized verdicts; its own output explicitly
  disclaims physical, timing, source, provider and release qualification.
- Historical `scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs`
  contains `adb logcat -c`; do not use it to begin a diagnostic capture. Preserve
  existing logs first. Historical one-device/browser/LiveKit proof scripts are
  not drop-in paired physical-media runners and may have unrelated mutations.

At completion, end all calls and verify native capture/audio/session teardown,
idle UI on both devices, no retired ownership resurrection and restored camera/
microphone permissions. Restore any routes or test settings intentionally
changed. Sanitize a new evidence bundle, keep all attempt records, manifest and
hash it, reopen it independently, verify every reference and all 105 unique
row dispositions, and review the actual physical assertions separately from
archive integrity. Preserve the original PR #538 ZIP unchanged.

