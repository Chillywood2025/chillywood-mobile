# V6 paired-device execution plan

Prepared 2026-10-08 for the consolidated PR #539 candidate. This is an execution
plan, not a results report. It assigns every ID in
`PR537_RETEST_MATRIX.tsv` exactly once: **105 rows, 105 unique IDs, no omissions**.
All new-candidate verdicts remain NOT RUN until the corresponding evaluation
actually occurs. No prerequisite below is claimed to be available or cleared.

The installed v5 diagnostic calls do not qualify v6. Build/install v6 only after
exact-head validation and the release review gate pass. Record the final source
SHA/tree, both native digests, signed artifact hashes, runtime/channel, provider,
store build numbers and independent installed-device readbacks. Preserve the
original matrix columns; append new attempt records and update only the retest
result fields. A successful retry never erases an earlier failure.

## Common evidence and acceptance

Use one case-attempt identifier plus UTC and monotonic event times. A shared call
can support several rows only when it actually satisfies each row's direction,
media, entry state, action and expected outcome. Keep separate assertions and
verdicts for those rows. The table's grouping is not permission to infer an
unexecuted transition. Split a batch into more calls whenever one transition
changes or destroys another row's prerequisite.

Before the first invitation, capture the current native logs without clearing
them. Verify an allowlisted v6 lifecycle/registration diagnostic as a positive
control on iPhone; silence in an unverified logging channel proves nothing.
Capture both device streams throughout each attempt. Collect read-only server
snapshots during the call, before terminal writes overwrite membership history.
Keep private device/account/call identifiers, payloads, credentials and raw logs
outside Git. Export only sanitized correlations and bounded relevant events.

Every connected-call attempt needs the following distinct receipts:

- Actual provider and exact invite/room/account ownership; entry state before
  the invitation; caller tap, server creation/expiry and visible presentation.
- For iPhone Answer: native report completion, actual Answer delegate, current
  JS authority, server acceptance, correct thread, one join and audio activation.
  Foreground presentation fallback is not proof of background PushKit receipt.
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

Run A1 and A2 first to discriminate Answer and heartbeat failures. In A2 add a
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
| C4: routes and Bluetooth | AR01, AR03, AR04, BT01, BT02 | Verify whether each app-owned route control actually exists for the observed provider. Android legacy app-owned speaker controls are currently documented unsupported; do not manufacture a PASS. iPhone video route changes need actual output proof while motion persists. For each platform's Bluetooth row, select a real connected accessory, prove audio there, interrupt/disconnect it, and prove supported output recovery. Record the chosen voice/video variant explicitly. |
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
- A supported Android route capability for AR01/AR03. Existing documentation
  explicitly calls the legacy app-owned control unsupported. A separate
  implemented and validated capability or authorized provider coverage would
  be needed to satisfy those assertions; absence is not PASS.
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
