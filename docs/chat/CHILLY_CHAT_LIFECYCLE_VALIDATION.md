# Chi'lly Chat lifecycle validation

Updated: 2026-09-28. This is the current testing and troubleshooting entry point.
The latest reviewed PR #532/#534 candidate (Android 94, iOS 29) is **not
physically qualified**. Source fixes,
passing CI, a completed checklist, and an older physical pass do not qualify a
different installed candidate. This document grants no delivery or provider
configuration authority.

Start with the [PR #532 evidence reconciliation](PR532_EVIDENCE_RECONCILIATION.md)
and its [complete audited case mapping](PR532_AUDITED_CASES.tsv). The separate
[104-row automated coverage map](PR532_AUTOMATED_COVERAGE.json) links every case
to exact test assertions, controlled boundaries, unsupported capabilities and
the remaining physical proof. These records retain all
104 original cases, six reported symptom families, missing attachments,
scenario mismatches and the automated-test boundary gaps. The original ZIP in
PR #535 is unchanged. Its recorded 13 PASS / 10 FAIL / 34 blocked / 47 NOT RUN
are historical operator verdicts with explicit evidence limitations, not a
current qualification claim or ten independent root causes.

## Confirm the implementation before diagnosing it

The sanitized [server readback](PR530_SERVER_READBACK_2026-09-27.json) covers
33 invites created in the PR #530 test window. Every invite used `legacy_webrtc` media
and had a 90-second authoritative ringing interval. At readback, the public
provider was `legacy_webrtc`; the enabled canary provider was `livekit`, with emergency
stop false. This is a dated observation, not a permanent rollout guarantee. It
supersedes the inference that #530 device calls tested LiveKit. The readback
also confirmed deployed late-delivery migrations and rejection of an early
`missed` transition.

The newer #532 archive reports a rolling 24-hour aggregate of 60 legacy-stamped
invites and 90-second deadlines. This supports provider selection, not an exact
SDK trace for each case. Builds 94/29 carry embedded v3 source reported as
`442f9c6d1d3ed23a7626474cdecd7cf606d3c1d3`. Their narrative build/signing receipts
do not replace raw installed-identity or artifact-verification evidence.

Both implementations remain active source. **Do not delete legacy transport or
switch provider configuration as warning cleanup.** The server stamps a provider
on an invite; the client retains that provider for that invite. LiveKit tests
do not prove a legacy call works, or vice versa. Unknown provider identity makes
provider-specific qualification incomplete.

| Responsibility | Source to inspect |
| --- | --- |
| Invite creation, provider, transitions and expiry authority | `_lib/chat.ts`, `_lib/chillyChatCalls.ts`, deployed begin/transition functions |
| Fixed provider selection | `hooks/use-chat-call-media-session.ts` |
| Legacy peer, capture, negotiation and control lifecycle | `hooks/use-communication-room-session.ts` |
| LiveKit Room, publication, capture and control lifecycle | `hooks/use-livekit-chat-call-session.ts` |
| In-thread/global Answer and message projection | `app/chat/[threadId].tsx`, `app/_layout.tsx` |
| iOS presentation, Answer transactions, mute and audio route | `_lib/iosNativeCalls.ts`, `modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift` |
| Membership, authoritative media and Realtime hints | `_lib/communication.ts`, private room signaling RPCs |

## Evidence corrections from PR #530

The original archive is preserved in PR #531 at commit
`a035aa2726038398f2874faf55fe6517334bdec9`, path
`docs/release/evidence/pr-530/Chillywood_PR530_Evidence_2026-09-27.zip`.
SHA-256: `1636b746d8bd7e974a88c83b7961240c3a68ad5504cbb850d1f2f880af5973c8`.
The archive and all 410 manifest entries were verified during review. Keep the
original observations unchanged; use these corrections when interpreting them.
Original row IDs are evidence references, not current results.

| Original claim or observation | Correct interpretation and next observation |
| --- | --- |
| 32 FAIL rows | These are recorded row verdicts, not 32 independently established defects. Some share one failure; others have invalid or ambiguous test oracles. |
| #530 exercises LiveKit fixes | Server readback identifies the test-window invites as legacy. Correlate each client's transport with its persisted invite before attributing a symptom to a hook. |
| EX01–EX04 ring beyond 45 seconds | The invites had 90-second deadlines. Measure each `expires_at`, including delayed delivery. Native retirement before server expiry is a separate cross-layer defect to test. |
| BL12 has no Android incoming notification | Its screenshot shows Answer and Decline over the launcher; launcher XML omitted the overlay. Arrival time and Answer success remain separate questions. |
| BL04 receiver delivery failed | The caller reported failure to save/start the invite. Preserve the begin-call error before investigating receiver delivery. |
| Incoming UI took 6–23 seconds | Saved `wait-click` timing includes lookup and click completion. It does not establish first appearance. Record arrival and action separately. |
| CM01 camera-on tap failed | “Camera Off” labels a static tile and a button. Preserve the button's unique ID, enabled state, bounds and handler outcome. |
| iPhone-to-Android messages were lost | Android captures stayed at older messages. Correlate committed message ID, authenticated recipient read and newest visible item. Optimistic text and offscreen XML searches are insufficient. |
| iPhone Answer/unmute errors | The visible failures remain meaningful. Native presentation/transaction and legacy operation traces are needed to locate the failing stage. |
| Connected remains after peer disappearance | Preserve this unresolved physical observation. The independently reproduced LiveKit plain-peer-departure gap does not explain a legacy call by itself. |
| Android returns to launcher after remote End | Foreground/activity change is observed; a crash is unproved. Collect process/activity and crash/ANR evidence for the exact repeat. |
| Speech, moving video and clean End all proved | Silent recordings do not prove speech; stationary frames do not establish moving video. Idle UI does not prove capture, transport, native UI and membership stopped. Some closure timing is missing. |

Missing provider/native traces are evidence gaps, not proof of success or
failure. The archive index references intentionally excluded private files;
do not claim those files were reviewed or restore private payloads to a public
report.

## Record one coherent case

Use the existing matrix/evidence files for each delivery. This is ordinary
test evidence, not a new admission, receipt or task lifecycle. Record:

- Exact source/tree, binary/build, runtime/channel, loaded update,
  embedded/emergency state and OS version for each endpoint.
- Stable sanitized account/device/thread/invite/room aliases; persisted
  provider, each selected provider and actual transport/Room identity.
- Server `created_at`, `expires_at`, invite status and acceptance result.
  Ringing expiry is distinct from accepted-room liveness.
- Receiver app/system surface and preconditions; control ID, label, bounds,
  enabled/visible state, action time and handler/native result. A
  `clicked:true` response is not proof that the handler ran. Missing app XML
  does not prove a system notification is absent.
- A short event timeline: creation/dispatch → notification → presentation →
  action → native result → acceptance → route → media. Measure durations with
  one monotonic clock; record clock correlation/uncertainty across endpoints.
- For controls: latest requested intent, native/SDK result, actual capture or
  publication, durable membership and peer projection for the same operation.
  Preserve the first error and later recovery separately.
- For messaging: unique nonprivate marker, committed message ID, sender
  acknowledgment, authenticated recipient read and a viewport at the newest
  item. Include keyboard/scroll state.
- For End: capture shutdown, transport disposal, native audio/UI cleanup,
  durable membership/room state and a fresh call afterward. Idle UI alone is
  insufficient.

Do not record access tokens, push credentials, private message bodies, raw
device identifiers or provider secrets. Prove two-way speech with a consenting
observer or an explicitly authorized audible check. Prove moving video with an
unmistakable motion/camera-flip challenge seen at the remote endpoint. Report
the observation rather than inferring it from a label or silent recording.

## Timing and result rules

Before summarizing a future evidence bundle, run
`node scripts/verify-chat-physical-evidence.mjs --bundle <unpacked-directory>`.
It checks retained checksums, referenced files and obvious media-heading
mismatches. It does not certify device behavior or timing. Resolve or explicitly
retain findings; do not alter an original archive to make the checker green.
Also review screenshots, action/media identity and evidence mappings manually.

Existing performance objectives remain incoming presentation within five
seconds, event-driven peer projection within two seconds, heartbeat recovery
within fifteen seconds, and cleanup within four seconds or an explicit
retryable failure. Record precise start/end events. Invite-to-presentation and
notification-arrival-to-presentation are different intervals; report both when
available. Lookup/click duration is automation latency. Missing start events or
clock correlation leave a timing assertion unmeasured, not failed or passed.

Unanswered expiry follows the **actual server deadline**, currently 90 seconds
in the readback window, rather than the former 45-second assumption. Test just
before and after that deadline and measure presentation cleanup separately.
Delayed notification delivery receives only the remaining interval. Accepted
calls follow room liveness, not their former ringing deadline. Reject late or
unauthorized Answer; do not extend server authority to accommodate native UI.

Separate verdicts for presentation, Answer, connection, speech, video, controls
and cleanup. A case is not fully PASS when a required assertion is unmeasured.
Use `PASS`, `FAIL`, `AUTOMATION BLOCKED`, `DEPENDENCY BLOCKED` and `NOT RUN`
accurately. Record each blocked prerequisite. Preserve first attempts and link
confirmation/retries rather than replacing their results.

Continue independent safe cases after a failure. Block dependent cases with
contaminated state or failed prerequisites. Security/privacy failures,
uncontrolled capture or unusable devices require stopping the affected path
and using the authorized recovery procedure. Device qualification does not
authorize source repairs or provider/rollout changes during the run.

## Qualification sequence and matrix

First establish both directions on the intended provider: voice and video,
reliable Answer, audible speech, clear moving video, repeated mic/camera
controls, End and a fresh call. Capture provider/deadline before diagnosing a
failure. If prerequisites fail, identify the first failed stage and continue
only independent cases.

Then expand every applicable variant below into an individual row. Every row
for a new candidate begins `NOT RUN`; historical outcomes never populate it.
Repeat provider-specific coverage for an authorized LiveKit canary if that
provider is being qualified. Do not enable a canary or alter public routing
merely to satisfy the matrix.

| Family | Required variants and observations |
| --- | --- |
| Incoming/Answer | Both directions × voice/video × same thread/elsewhere/background/terminated: 16 base cases per intended provider; native/app surfaces, one accept/join, adjacent messages. Record OS eviction versus swipe dismissal versus force-stop; delivery restrictions differ. |
| Caller creation | Fresh and same-thread calls, busy/duplicate attempts, failed begin; no orphan room or false receiver-delivery claim; original server result preserved. |
| Cancel/decline | Both directions and media types; action/notification races and duplicate callbacks; no late join after dismissal. |
| Unanswered expiry | Both directions/media types and supported receiver states; actual deadline, delayed delivery, late Answer and a fresh invite afterward. |
| Microphone | Three cycles per endpoint in voice/video, in-app and supported native controls; audible results, singular capture and durable/local/remote convergence. |
| Camera | Repeated off/on and flip per endpoint; unique controls, moving remote frames, correct direction, no duplicate or stranded track. |
| Peer absence/return | Plain peer departure with local transport connected, transport reconnect, peer process disappearance and return; no false Connected recovery for an absent established peer. |
| Lifecycle/permissions | Background/resume, supported lock/unlock, mic/camera denial, revocation and Settings recovery on each OS; restore original permissions; no hidden capture or bypass. |
| Audio route | Speaker/receiver, available Bluetooth, interruptions and native activation/deactivation; actual route and audible output. Missing hardware remains blocked. |
| End/replacement | Either endpoint Ends, repeated/remote End, fresh voice/video, same-row replacement, late cleanup and account replacement. Old work cannot affect new authority. |
| Messaging/navigation | Bidirectional acknowledged messages before/during/after calls, latest-item visibility, unread/read, keyboard/scroll, reopen and account isolation; correct thread retained. |
| OS outcome | Cold launch, native handoff, return from calls, process/activity changes, crash/ANR evidence and resource shutdown per endpoint. Launcher alone is not crash proof. |

Source and native changes use applicable tests and protected CI. Swift/Kotlin
or native-capability changes require a compatible binary; an OTA cannot replace
native code. Use current compatibility checks rather than assuming builds
92/21 carry every repair. Delivery and physical operations require their
appropriate separate authorization.

## Source and integration coverage

PR #532 added executable regressions for both active providers,
screen/native action ownership, exact-invite notification cleanup, and native
deadline handling. It removes the invented client 45-second ringing fallback;
the separate Android native-action replay limit remains intact. Legacy
heartbeats now carry liveness only, and subscription promotion shares the media
control queue. Old completions cannot project into a replacement call, thread,
or account in the covered regression cases. Retryable control warnings remain separate from fatal privacy
failures on Chat; other room surfaces retain their existing feedback.

The later physical run exposed the limits of that coverage: fake membership
cleanup bypassed real terminal RLS/trigger behavior; a legacy peer mock supplied
its own answer; separate screen/media mocks did not compose the real boundary;
camera projection bypassed the actual sender. See T1–T6 in the current evidence
reconciliation for owning coverage and remaining proof. Preserve these useful
unit tests, but require integration regressions that fail against the broken
cross-component behavior. Increasing their assertion count does not resolve
the omitted boundary.

Run the new screen and bridge mounted suites in ordinary Product CI, the
actual Swift deadline/callback tests and generated Kotlin notification tests
in Native/Release CI, and the existing provider, account and database suites.
Mocked shutdown checks establish SDK state and ownership behavior; installed
capture indicators, audible output and native timing remain physical evidence.
The plain-peer tests do not establish a five/15-second disappearance deadline
before the native SDK emits a disconnect/presence event.

Native source approval and OTA compatibility are separate checks. The canonical
internal publisher now compares the target's native inputs with both the signed
binary's source and the existing runtime cohort before any publication. It
rechecks source and receipt identity after remote preflight. This correction
changed Android and iOS native code, so builds 92/21 and their existing runtime
cohorts cannot deliver the complete correction. The #532 run reports new
compatible v3 binaries 94/29; it did not qualify their call behavior. Re-evaluate
native compatibility for each later repair rather than assuming either those
v3 binaries or an OTA can carry every subsequent change.
The source comparison is deliberately conservative for lockfile/configuration
changes: a JavaScript-only dependency change can require compatibility review
without itself technically requiring a native rebuild. No runtime/channel,
binary record or provider rollout is changed by this source maintenance.

| Area | Existing evidence to retain/run when affected | Physical evidence it does not replace |
| --- | --- | --- |
| Invite/status/provider authority | Call-semantics and Supabase begin/transition/expiry/liveness/cleanup tests | Deployed provider, native presentation and real Answer |
| Native handoff | Native-action handoff tests, native tests/compile checks | Installed transactions, app-state ordering and audible routing |
| Legacy media | Android exact-hook, communication operation-error and mounted control tests | Legacy negotiation, native capture and both endpoint projections |
| LiveKit media | Mounted LiveKit lifecycle and real SDK track-lifetime tests | Installed capture, ordinary peer departure and recovery |
| Realtime hints | Local authenticated Realtime delivery plus each provider's receiver/projection tests | Device event → durable commit → private hint → current read → visible media |
| Messaging | Product, account-bound mutation and thread read/projection tests | Server-acknowledged bidirectional delivery and current visibility |

Peer notifications are refresh hints; durable membership is authoritative.
Server-validated private hints cause an authoritative read; only the newest
response owned by the current session projects. Legacy streams and LiveKit
tracks have different transport/rendering lifecycles. Preserve account,
ownership, permission, replay, cleanup and release guards while removing stale
assertions from active instructions.

## Current integration repair appendix — source proof only

The repair following the #532 evidence audit addresses the identified source
contracts below. The complete D1–D6 symptom mapping, T1–T6 test mapping and
unchanged 104-row historical disposition remain in
[PR532_EVIDENCE_RECONCILIATION.md](PR532_EVIDENCE_RECONCILIATION.md) and
[PR532_AUDITED_CASES.tsv](PR532_AUDITED_CASES.tsv). A source regression is not
automatically the cause of a similarly worded physical observation.

| Boundary | Source correction and automated observation | Remaining proof |
| --- | --- | --- |
| Terminal server cleanup → client End (D1/T1/T5) | `leave_communication_room_session` confirms only the authenticated user's exact membership generation and terminal media-off state while ordinary ended-room reads remain closed. The screen skips the redundant host update after confirmed terminal invite transition. Checked-in PostgreSQL bodies reproduce the old failure; the full client API has a disposable authenticated HTTP integration lane. | Fresh exact-head full-stack Database CI, separately authorized migration deployment, then physical capture/transport/native/membership postconditions. |
| Pending join → retired owner → replacement (D1/T1/T5) | Legacy and LiveKit retain the actual admission task beyond a UI timeout. Exact-generation compensating cleanup and account/room admission coordination prevent a same-row replacement from racing an unfinished retired join. New generation identities are server-owned, not client timestamps. | Late operation ownership is controlled-source evidence. Unreachable network/native work can remain retryable; a timeout cannot be called successful cancellation. |
| Media controls → Presence → peer lifetime (D2/D3/T2/T3) | Pinned SDK Presence metadata replacement events no longer destroy a healthy peer. SDP work is serialized, answers correlate to the pending offer, simultaneous offers resolve deterministically, and early ICE is bounded/deduplicated. The real-peer runner executes two production hooks with real browser SDP/ICE and decoded media. | The expanded real-browser cases require exact-head Product CI; local transport produced zero native ICE candidates in an independent control. Browser media does not establish installed Android/iOS capture, routing, thermal behavior, or packet-loss recovery. |
| Caller/callee deadline → reconciliation (D4/T5) | Both screen expiry paths use the server deadline, keep one owned retry scheduled after a transient read/transition failure, and require exact invite/account/room identity. Failed reads are not terminal authority. | Correlated push/native presentation and actual deadline cleanup on each OS. Five-second incoming latency remains a measured product objective, not a timer-test guarantee. |
| Native replay → readiness → Answer (D4/D5/T4/T5) | Native account authority binds before queued events are consumed. Answer-first replay waits briefly for its exact presentation. Actual JS facade/bridge/provenance tests and full-screen route-to-media tests cover current UUID, account, server acceptance and native audio gating. | Real OS delivery/CallKit transaction/peer media. D5's three cited attachments remain missing, so the historical first failure is not established. |
| Terminal invite → native presentation removal (D6/T4) | Retain exact native ownership and bounded retries until the matching completion event; a dispatch promise is insufficient. Replacement/unmount retires retries, and an old UUID cannot clear new presentation. | Paired caller-cancel and receiver-removal timeline, including duplicate/late push. |
| Evidence interpretation (T6) | A read-only validator checks report/matrix references as well as checksums, case IDs/statuses, path confinement and obvious media-heading conflicts. Unit tests prove an internally valid manifest does not hide omitted attachments. | Four original files are still absent. Static XML/screenshots cannot certify audible speech, moving video, capture shutdown or elapsed time. |

The full-screen suite retains all production screen hooks, effects and handlers,
the provider adapter and the actual legacy hook; it does not force the hook live.
Its native/service edge remains controlled. Some older isolated hook tests still
use preconnected peers or auto-answers for targeted control/ownership cases;
those valid narrow results must not be summarized as end-to-end negotiation.
The separate browser lane has no fabricated SDP answer or Connected state and
requires received audio energy, changing decoded video, camera-off privacy,
cleanup, same-page fresh-call reuse and a dropped-answer negative control.
It also restarts one endpoint in the same durable room, requires fresh peer
identities and received media with the surviving endpoint, and rejects a held
old-generation offer without creating another peer or native SDP operation.
Its membership/signaling services are simulated. Authenticated SQL/private
Realtime lanes prove their own server boundaries separately.

No new physical row is PASS by virtue of these changes. Protected CI results
and final source identity are reported by the PR, not inferred from this
appendix. The original #532 candidate remains **NOT QUALIFIED**.

### Required delivery order

The corrected client requires
`supabase/migrations/20260928164743_communication_terminal_self_leave.sql`,
including durable admission/generation identity and exact-session admission,
media, signaling and self-leave RPCs. **Deploy and verify the additive migration before distributing the
corrected client.** A missing migration must not be worked around by bypassing
RLS or accepting an unverified client cleanup. Older-client compatibility is
covered for legacy-owned rows' reads/media updates and ordinary self-leave.
After a rollback, an older bundle must start a fresh call instead of resuming a
modern-owned row. Rollout verification must still use the actual deployed schema.

Source approval does not authorize production migration or delivery. After
separate appropriate authorization, verify migration readback, source/native
compatibility, signed binary/runtime and each loaded bundle, then start the
small two-device prerequisite sequence. Continue into a fresh complete matrix
only after those prerequisites are usable. Preserve first failures, explicit
blocked dependencies and missing hardware. Do not erase original evidence or
claim permanent 99%/100% reliability from one run.

## Historical delivery record — not current qualification

The [August complete-system ledger](CHILLY_CHAT_COMPLETE_SYSTEM_CLOSURE_LEDGER.md)
covers PR #318 and its environment. Its zero-blocker totals do not certify later
source, binaries, providers or devices.

| Candidate | Source / tree | Historical disposition |
| --- | --- | --- |
| #526 | `691814ec8ff8dd863f014add0255a4110117cf23` / `bb1aba7117c80cdf6ce85e3a6483c0c324f75cd5` | Compatible rollback; comparison still reported imperfect iPhone unmute. Not fully qualified. |
| #528 | `cb35e0a2984d98f0e7c9f88b55676dd9671552ce` / `9188268b86ecdd6f816b5168817b2a6d88847644` | Repeated remote-video loss reported after iPhone mute/unmute; rollback performed. Prior text identified LiveKit, but that provider claim is not independently established here or transferable to #530. |
| #529 | `e66c1a5829c07dbb82d3a946853e0ca26832b090` / `a539c4e46fce2b9261e224210a1aa1eff9dd8b95` | Source late-operation correction; source tests did not establish physical causality. |
| #530 | `2d96b5396391b0822cb4e10d6b3509639be117f3` / `63802aa5f2c67b9bed1476252069e81413f061c7` | Exact uptake proved; 104 original rows (14 PASS, 32 FAIL, 6 automation blocked, 52 dependency blocked), subject to the corrections above. Not physically qualified. |
| #532 product, delivered through #533/#534 | `442f9c6d1d3ed23a7626474cdecd7cf606d3c1d3` / `bd6833408192d1ea547a7317f764b231dd08a422` | Reported embedded v3 builds 94/29; original 104 rows (13 PASS, 10 FAIL, 2 automation blocked, 32 dependency blocked, 47 NOT RUN). Original evidence in #535; apply the linked reconciliation. Not physically qualified. |

Historical update identities are evidence references, not publication or
rollback instructions:

| Platform / binary | #528 update | #526 rollback update | #530 update |
| --- | --- | --- | --- |
| Android 92 | `01a0e30f-d8bb-77e6-b115-e8154aaf057e` | `01a0e339-d49f-7538-a71a-d40104901c05` | `01a0e3d9-ddb3-7bf0-a949-ee863be858d4` |
| iOS 21 | `01a0e314-4be0-7223-bfa5-7047b55867d2` | `01a0e33a-0c9a-7c48-8457-772b1e59f760` | `01a0e3dc-b375-7dd4-a455-20c1b4ed905c` |

These used `1.0.0-android-production-v2` / `android-internal-v2` and
`1.0.0-ios-production-v2` / `ios-internal-v2`. The #530 report records no rollback
and idle final devices; read back later installed state again. Its iOS signing
report includes `CSSMERR_TP_NOT_TRUSTED`; other package/profile/install checks
are separate. Do not relabel them full trust/revocation verification or reuse a
receipt without resolving its evidence.

The previous document's #528 matrix, release details and SDK-correction narrative
remain in Git history at #530. They were removed from active instructions
because mixing old outcomes with future rows and calling tested source
“qualified” obscured what was proved. Original evidence and working provider
implementations remain intact.
