# PR #532 physical evidence reconciliation and repair checklist

Updated: 2026-09-28. The delivered candidate remains **NOT QUALIFIED**.
This record corrects interpretation of the original evidence without editing
its archive, report, matrix or manifest. Source repairs and their tests do not
change any historical physical result. No new device test is claimed here.

## Immutable evidence and actual scope

- Evidence PR: [#535](https://github.com/Chillywood2025/chillywood-mobile/pull/535).
- Evidence commit: `ce6d73cc8a1860374681785de98e44006ca67cd1`.
- Path: `docs/chat/evidence/chillywood-pr532-internal-qualification-2026-09-28.zip`.
- ZIP SHA-256: `2ccfdbcb565a3ad64d224431d5a5b001ce6bf6010d9717c7a41e3ec556e03ea0`.
- ZIP size: 21,230,671 bytes; 67 included files; 66 manifest entries verified.
- Original matrix SHA-256: `1c89313566c664976ef84307f1bd8e2501ee8037344cf3c0dff56c479fe1d18d`.
- Product merge: `c08e86adfe7a23c3792a7081000e6c95f2f0f810` (#532).
- Reported delivered merge: `442f9c6d1d3ed23a7626474cdecd7cf606d3c1d3` (#534).
- Reported delivered tree: `bd6833408192d1ea547a7317f764b231dd08a422`.
- Reported installed builds: Android 94 / iOS 29, embedded v3 bundles. PRs #533
  and #534 changed native generation, configuration, compatibility and internal
  delivery tooling; they did not change the call screen/media-hook source.

The archive contains narrative artifact/signing/installation receipts, not
the binaries or raw verification output needed to reperform those checks.
This is a provenance evidence limit, not evidence of a wrong installed binary.
The aggregate readback records 60 `legacy_webrtc` invites, zero `livekit`
invites, and 90-second server deadlines over a rolling 24-hour window. It is
not a per-case native transport trace. This run does not qualify LiveKit.

| Original recorded disposition | Rows |
| --- | ---: |
| PASS | 13 |
| FAIL | 10 |
| AUTOMATION BLOCKED | 2 |
| DEPENDENCY BLOCKED | 32 |
| NOT RUN | 47 |
| Total | 104 |

These totals are preserved, not independently certified pass totals. None of
the 16 complete baseline rows passed. A blocked prerequisite evaluation is
not an executed call. The [104-row audited mapping](PR532_AUDITED_CASES.tsv)
retains every original case/status and names its remaining proof. Its IDs
refer to the findings and evidence corrections below; it does not invent
new physical verdicts or silently delete untested cases.

## What automated coverage means for each physical case

The [individual automated coverage map](PR532_AUTOMATED_COVERAGE.json) accounts
for all 104 original rows. Each row retains its scenario and historical result,
names the exact automated assertion and required CI lane, describes the software
behavior it proves, lists controlled assumptions, and identifies remaining
software or physical proof. A row with related tests but an unexercised mechanism
is explicitly partial. A capability unavailable from the selected provider is
listed as unsupported, rather than passed or merely device-blocked.

This map is not a claim of 104 automated end-to-end phone tests. The browser
gate runs the actual legacy hooks with real SDP/ICE/RTP and measured received
audio/video, but synthetic capture and a controlled signaling/membership adapter.
An additional required Database baseline connects two production hooks through
the actual authenticated SDK, disposable Auth/PostgREST/RLS and private Realtime,
then measures received browser RTP, PCM and decoded video. It checks both
endpoints' media-control writes and received media, terminal cleanup, and a fresh
accepted call. Synthetic capture and service-side invite setup are explicit;
this does not exercise Edge push delivery or phone-native capture. Complete push handlers execute with
controlled provider receipts. Native and mounted tests name their own platform
boundaries. Their combination is materially stronger than a successful mock at
each call site; it still does not certify the installed operating system or
hardware chain.

The coverage-inventory test prevents a row, assertion reference or CI entry
point from silently disappearing. It cannot judge whether an assertion is
sufficient. That requires source/harness review, failure controls, and the
observed results of the actual tests. Final exact-head execution results belong
in the PR; source coverage declarations do not manufacture successful runs.

The additional case-by-case review exposed more application mechanisms:
a camera flip could acknowledge an already retired track, and a pending message
send could retain busy/error state across an account or session replacement.
Backgrounding during microphone recovery could publish stale camera intent;
overlapping foreground restoration could acquire duplicate camera tracks. The
new cases preserve the finite event orders and reproduce the former behavior.

The pinned SDK itself also matters. Its deprecated camera wrapper discards the
completion promise, and both native implementations intentionally prohibit lens
changes through `applyConstraints`. Camera switching therefore needs supported
video-only reacquisition and sender replacement, preserving audio and current
ownership. A further native sender-attachment boundary can falsely acknowledge
failure. Its correction requires native code and new binaries; a JavaScript OTA
cannot install that fix. Actual SDK JavaScript and compiled native-method tests
cover these contracts with controlled bridge/RTC edges. Neither is physical
camera, audio, or RTP proof from an installed phone.

All four legacy capture producers now share one acquisition/retirement boundary:
initial startup, foreground recovery, microphone reacquisition and camera flip.
The record exists before native acquisition starts and survives hook unmount.
Unresolved or unsuccessfully stopped capture prevents false End completion and
replacement admission; adopted capture transfers to the existing session cleanup.
Failed rollback retains the exact acquired tracks for another disposal attempt.
Tests distinguish an unresolved acquisition from an already-issued sender command,
so a retired logical control queue cannot unnecessarily own the next call.

Native contract provenance is pinned to `@livekit/react-native-webrtc` 144.0.0.
Its camera behavior follows the intentional upstream
[camera-constraint restriction](https://github.com/livekit/react-native-webrtc/commit/d7dfbaecdd980364ce9591cbc83a75b5ca3a6db4).
The iOS WebRTC-SDK 144.7559.01 line's
[native sender implementation](https://github.com/webrtc-sdk/webrtc/blob/30d5e63ae91da483e06577b5c35ee91cc5e5c3db/sdk/objc/api/peerconnection/RTCRtpSender.mm)
reads the current native track in its getter; its void setter logs a failed
attachment. `withWebRtcSenderAcknowledgment` checks that postcondition on iOS
and the actual `setTrack` boolean on Android. Full-file hashes, package version,
idempotence, same-method failing-before controls and required compiled-method
execution bind this repair. The patch must be reviewed or retired when the SDK
changes; an upstream version change cannot silently reuse these assumptions.

For future device failures, first preserve the actual source, provider,
binary/runtime, case identity and evidence. Reproduce the mechanism in the
lowest faithful automated layer available, then retain a regression that fails
the defective implementation and passes the correction. If reproduction needs
the real OS, peripheral, provider or hardware, keep that requirement explicit;
do not replace it with an always-successful mock. Existing protections and the
ordinary protected PR workflow remain unchanged.

## Product findings and deduplication

| ID | Retained observation / affected cases | Status and boundary to test | Physical closure still required |
| --- | --- | --- | --- |
| D1 | End leaves retained call UI and explicit retryable cleanup error. EN04/EN05/EN07; also follows F01/F04. | SOURCE REPAIRED; qualification open. Real SQL reproduces already-completed server cleanup followed by RLS-hidden client readback. Exact-generation self-leave confirms the terminal row without reopening ordinary reads; the screen no longer repeats the host mutation after verified terminal invite authority. Both media hooks retain late admission/cleanup ownership and retry state. T1/T5 cover the cooperating boundaries; exact-head authenticated HTTP execution is required in the PR validation record. | Each resource postcondition separately: local capture, peer transport, native UI/audio, exact membership/room state; then fresh voice/video. An error alone does not prove capture continued. |
| D2 | Mic sequences precede loss of connected peers/Connecting. F01 and MC04 are one iPhone sequence; F04 and MC03 are one Android sequence. | SOURCE REPAIRED; qualification open. The legacy hook now distinguishes a Presence metadata replacement from departure, serializes SDP changes, correlates pending offers/answers, handles simultaneous offers, and bounds early ICE buffering. Pinned Presence tests reproduce the metadata-replacement failure. T2's real two-endpoint browser gate is required; its expanded scenarios must pass on the final candidate. This identifies source defects, not the exact historical third-cycle cause. | Audible recovery and moving video on both endpoints during repeated native/in-app mic cycles, followed by clean End; correlate operation order. |
| D3 | Android self Camera Off disagrees with iOS peer Cam On/Video connected. CM01. | SOURCE REPAIRED AT IDENTIFIED BOUNDARIES; qualification open. Metadata changes no longer discard a valid peer; negotiation and replacement ownership are covered alongside durable/local/remote state convergence. The new browser lane asserts decoded camera-off pixels and restored changing video, not just a UI flag. Received RTP/media assertions must pass in the final candidate's required browser lane. A static disagreement still does not prove historical capture or server state. | Capture/publication state, durable media state and received moving/removed video agree after off/on, with correlated timing. |
| D4 | Background incoming presentation succeeds on some attempts; a failure is reported. BL03; expiry claims EX01/EX02 need their own proof. | PARTIAL SOURCE REPAIR; delivery open. Caller and callee expiry now retry transient reads/transitions against exact invite/account ownership and the actual server deadline. iOS startup binds native authority before consuming queued events, and Answer readiness waits briefly for its exact presentation. No source test proves APNs/PushKit delivery or the historical five-second/156-second claims. | Server deadline → push receipt → native presentation/action → terminal UI timeline for the same invite; late Answer rejected. |
| D5 | Operator reports native Answer opened a stranded one-participant call. No explicit FAIL matrix row; all three cited attachments missing. | SOURCE HANDOFF COVERAGE ADDED; evidence incomplete. Actual JS facade + bridge + provenance tests cover Answer-first replay and account/UUID ownership. Full-screen tests consume real attested routes, accept through the server boundary, wait for exact audio activation, then start the actual legacy hook. Neither result certifies connected remote media; the full-screen SDK edge is controlled. Missing originals still prevent attributing this historical failure to one repaired boundary. | Native transaction, current JS/account readiness, server acceptance, navigation, actual peer negotiation/media, and cleanup tied to one case. Add an explicit row to the next matrix. |
| D6 | Operator reports orphan CallKit UI after cancel. CA01; later clean voice/video confirmations do not erase the report. | SOURCE REPAIRED; qualification open. Native terminal observers retain ownership and bounded retries until the exact completion event, rather than treating dispatched native work as removal. Stale UUIDs cannot erase replacement presentation; replacement/unmount cancels owned retry work. Original cancellation causality is not proved by the retained initial UI alone. | Correlated caller cancel commit and receiver native removal; duplicate/late push must not resurrect canceled UI. |

Ten failed rows are not ten proven independent root causes. Eighteen blocked
rows depend explicitly on cleanup/replacement: F02/F03/F05/F06, FI01–FI04,
FS01–FS04, SR01–SR04 and MS07/MS08. AC01–AC04 also lack a safe cleanup boundary
but remain their original **NOT RUN**, not converted to blocked or passed.
Connected participant count is not a database membership count; the snapshots
do not prove a database room literally split into two rooms.

## Evidence correction checklist

| ID | Evidence gap or mismatch | Correction already recorded / remaining requirement |
| --- | --- | --- |
| E01 | Four report attachments are absent although every matrix reference exists. | Keep missing paths below explicit. Recover exact original bytes, or record focused re-test separately; do not substitute similarly named captures. D5 remains outside the original matrix. |
| E02 | PR01 claims voice recovery using two Video call active captures. BL02/BL04/BL11 voice rows borrow video presentation captures. EX02's fresh incoming capture is voice. | Preserve the video/presentation observations; voice scenarios and precise video expiry are not established. No automated status promotion. |
| E03 | Claimed five/fifteen/fifty-one/156-second intervals and exact expiry lack retained action/event timelines. Filenames such as t15/t78 are not clocks. | Treat exact timing as unmeasured. Use a common monotonic timeline or explicit cross-device clock correlation; distinguish lookup latency from presentation latency. |
| E04 | CA03/CA04 claim both-endpoint cancellation but reference only Android snapshots. | Retain Android idle observation. Both-endpoint timing/cleanup requires paired evidence. |
| E05 | PM01 references Android denied permission plus idle UI; no restored permission/app-op receipt. iOS Settings show enabled switches but not subsequent working media. PC01 reports Settings/package disagreement. | Preserve guidance/Settings observations and the automation block. Do not claim restored capture safety or working media solely from those captures. Final restored Android permission/no-capture state is narrative-only in this bundle. |
| E06 | Build/signing/installed identity are narrative receipts without binaries/raw verification output. | Keep reported identities and this limitation. Do not relabel them independent signing/revocation/loaded-source verification. Retain sanitized verification outputs for future delivery. |
| E07 | Aggregate provider summary does not correlate a specific case with native SDK startup. | Keep provider-stamp evidence distinct from transport proof. Trace each case's fixed provider without changing public rollout or deleting legacy code. |
| E08 | No audio/video recordings or audible observer; static ceiling frames do not prove motion/flip; Bluetooth absent. | Supply consenting audible proof, a visible movement/lens challenge and designated Bluetooth hardware before relevant tests. Missing prerequisites remain explicit, not product failures or passes. |
| E09 | BL12 changed from planned ordinary termination to force-stop. BL16 was relabeled force-stop but not executed. | Preserve actual force-stop observation separately. OS eviction/swipe/force-stop are separate scenarios; original ordinary-termination coverage is still missing. |
| E10 | Several terminal captures attached to video cases show Voice call active: F01/F03/F06/EN04/EN07/MC04. | Newly detected by exact-heading check. Could be terminal UI fallback or mismatched captures; do not choose a cause from headers alone. Retain cleanup errors and correlate media identity in the next trace. |
| E11 | MS05/MS06 retain bidirectional post-failure messages. | Keep that positive observation; it does not prove every before/after cancel, decline or replacement variant or independent server acknowledgment. |
| E12 | 32 dependency-blocked, two automation-blocked, 47 not-run rows remain. | Every row is retained in the audited mapping. Source tests never replace their physical status; initialize a new candidate matrix separately. |

Missing original paths:

```text
run/ios29-na05-incoming.json
run/ios29-na05-active.json
run/ios29-na05-final.json
run/android94-na05-active.xml
```

They were not found in the available unpacked archive or local workspace.
Recovery searches must stay read-only and within authorized source/evidence
locations. `incoming3` is a different retained capture and is not an alias for
`incoming`. No original file, status, timestamp or checksum has been rewritten.

## Automated coverage gaps and required regression boundaries

| ID | Existing test's valid scope | Missing boundary / owning coverage |
| --- | --- | --- |
| T1 | Exact-hook tests simulate membership leave returning a left row; thread tests simulate leaveRoom independently. | Added `scripts/test-communication-terminal-postgres.mjs`: disposable PostgreSQL executes checked-in authority/RLS/terminal-trigger/join bodies and the new migration, reproduces the former closed-read failure and verifies self-only idempotent cleanup/generation rejection. `scripts/test-communication-terminal-http.mjs` additionally loads the production client API against disposable authenticated Supabase/PostgREST and races old leave with rejoin. SQL proof is locally verified; full-stack HTTP proof is required in the exact-head Database lane. No production database mutation occurred. |
| T2 | Legacy harness auto-supplies an answer and can start ICE connected. Useful for selected callback ownership tests. | Added `scripts/test-chilly-chat-real-peer-integration.mjs` and `tests/assurance/helpers/legacy-paired-browser-harness.mjs`: two actual production hooks use real Chromium peers, SDP/ICE, received audio energy and decoded moving video. No preconnected state or fabricated answer; dropped answers are a negative control. Repeated controls, decoded camera-off privacy, cleanup and same-page fresh-call reuse are required. Browser transport must pass in the exact-head Product lane; local native ICE produced no candidates even in an independent control. This is not native-device WebRTC proof. |
| T3 | Camera projection test writes a simulated remote value and emits a receiver hint. | The two-hook browser test now drives actual sender controls through simulated membership/signaling boundaries and pinned Presence semantics into the receiver hook and real RTP. Existing authenticated private-Realtime tests independently cover server delivery/read authority. These are complementary boundary tests, not a claimed single device → production server → device trace. Real capture and correlated physical projection remain required. |
| T4 | Swift/Kotlin seams and JS bridge mocks prove selected deadline/action ownership logic. | `tests/assurance/ios-native-call-bridge-mounted.test.mjs` composes the actual production JS facade, bridge, provenance and readiness with a controlled OS/service edge: Answer-first replay, same-account cold launch, retired-account rejection, exact UUID and bounded terminal retry. Full-screen native tests add actual route consumption and media activation. Retain platform compile/contract tests. No successful mocked OS call counts as installed Answer, push delivery or audible route success. |
| T5 | Unit tests check individual callback cleanup and state changes. | Added `tests/assurance/chat-thread-integration-mounted.test.mjs` with the complete production screen hook/effect graph, actual provider adapter and legacy hook; only JSX rendering and service/SDK edges are controlled. It covers server Answer, exact terminal response, completed-server-cleanup ordering, retryable End, retained video identity, both expiry timers and native audio gating. Both provider suites also cover late joins, membership generations and retired cleanup. The focused tests have failing-before/passing-after cases; service mocks are not server or physical certification. |
| T6 | Original checksum manifest proves included bytes only. | `scripts/verify-chat-physical-evidence.mjs` now checks report + matrix references, duplicate case IDs, allowed statuses, checksums, path confinement and exact current-call media headings. `tests/chat-physical-evidence-integrity.test.mjs` proves missing files/media mismatches are detected even with a valid manifest. |

Run the read-only evidence check against an authorized unpacked copy:

```sh
node scripts/verify-chat-physical-evidence.mjs --bundle /absolute/path/to/unpacked-bundle
node --test tests/chat-physical-evidence-integrity.test.mjs
```

On this immutable bundle it must report four missing references and review
media-heading discrepancies, and exit nonzero. That is evidence completeness
failure, not a newly reproduced app failure. It leaves original PASS/FAIL totals
unchanged. It cannot inspect PNG content, infer parent visibility perfectly,
prove arbitrary scenario identity, authenticate operators, or certify any
physical/timing/provenance assertion. Human interpretation remains necessary.
The checker has no provider/device side effects and introduces no admission,
lease, receipt or authority lifecycle.

## Source status and delivery dependency

The current implementation is source maintenance with local regression evidence,
not a new installed candidate. Exact-head protected CI, the authenticated HTTP
lane and real-browser RTP lane must succeed before source merge qualification is
claimed. Final run identifiers and totals belong in the PR validation record;
partial local test counts do not stand in for these gates.

The forward migration
`supabase/migrations/20260928164743_communication_terminal_self_leave.sql`
adds durable membership/admission identity and exact-session admission, media,
signaling and self-leave RPCs consumed by
the corrected client. **That migration must be deployed and verified before
publishing/installing the corrected client bundle.** There is no silent fallback
to a weaker client leave when the RPC or generation is absent. The migration is
additive and has tests for older clients' reads/media updates and ordinary
self-leave on legacy-owned rows; an old client must start a fresh call after
rollback rather than resume a modern-owned membership. This is compatibility
evidence, not a production rollout.
Production migration, internal delivery and device work each still require
their appropriate separate authorization and canonical checks.

The source changes preserve the invite's fixed provider, ordinary RLS closure,
account/session checks, permissions, app navigation and release safeguards.
Both providers' pending admissions are coordinated by exact account/room
ownership so a retired join must settle before a same-row replacement starts.
The retirement reservation starts before asynchronous native teardown, so a
full unmount/remount cannot slip a new ACTIVE join ahead of the old leave.
That process-local coordination is not a server fence after an app restart.
Modern admission therefore also carries a stable attempt identity and an
observed-generation comparison. New ownership rotates the durable generation;
replaying the same current attempt preserves media intent, while a superseded
attempt cannot adopt a newer generation. Media updates and heartbeats carry the
captured generation as well as leave. Seeing a newer owner retires only the old
local resources, not the shared accepted invite. Legacy-owned rows retain the
old client contract; older bundles cannot safely resume modern-owned rows.
The server also stamps the authenticated sender's generation on owned signals.
The receiver rechecks it before queued native SDP/ICE work, so a packet already
delivered before takeover cannot recreate a retired peer. A same-generation
Presence metadata update still preserves the current peer. The browser lane
requires one endpoint to restart in the same room, then receive real media with
the surviving endpoint while a held retired offer is rejected.
That real-browser scenario also exposed an old microphone reacquisition trying
to roll back an already-retired peer. Retired transactions now dispose only
their own newly acquired capture and return a failed control result; they cannot
restore old sender state or re-enable an older track. Unproved capture disposal
and genuine current-owner rollback failures remain explicit failures. The
browser fixture retains every acquired track identity even after removal from
a stream, so removed capture cannot disappear from cleanup assertions.
Its End stage also exposed a delayed Presence render starting a new peer and
capture after the original resources had closed. Capture, peer synchronization,
snapshot projection, heartbeat and foreground continuations now reject the
ending generation. End retains its retry context; only an explicitly initialized
new generation may acquire media again. Mounted tests reproduce the old
post-End reacquisition and preserve delayed-capture disposal and fresh-room
startup; the real-browser End and fresh-call stages remain required CI gates.
A JavaScript timeout does not prove an HTTP/native operation was canceled;
unsettled work remains owned and a retry cannot assert capture or membership
success without the required postcondition. Permanent network/native failure
may therefore remain a truthful blocked/retryable state.

The four missing original files remain unrecovered. All original 104 rows and
their statuses are preserved. D4 delivery timing, D5's missing physical chain,
Bluetooth prerequisites and the rest of the unexecuted matrix remain open.
These limitations are not hidden by zero-warning lint, additional assertions,
or the source repairs above.

## Additional defects exposed by connected validation

The first expanded required runs did not establish qualification. They exposed
two software defects that narrower passing tests had missed:

- The real-browser background test stopped camera capture, but local UI state
  still projected retained foreground camera intent as current capture. The
  hook now derives public camera state from actual enabled, non-ended tracks.
  Tests preserve the browser's stopped-but-still-enabled track semantics,
  foreground recovery, and one-toggle recovery. Related shutdown tests retain
  failed-stop resources through End and full hook replacement, rather than
  losing them when a stream or screen is removed.
- The authenticated backend/media test negotiated real peers, but the callee's
  media promotion rolled back. Its owned-membership RPC also attempted a
  host-only room timestamp write. The correction leaves the room trigger and
  RLS unchanged: only the host updates room liveness; each admitted participant
  updates its own exact membership. The PostgreSQL harness now includes the
  actual room trigger and policy, reproduces the former rollback, and checks
  host, participant, outsider and retired-generation cases. Required HTTP and
  browser tests exercise the full disposable Supabase stack.

The new test fixtures also had two incorrect assumptions: that current native
inputs still matched historical v3 binaries, and that one caller could initiate
more than three calls in five minutes. Tests now verify the historical cohort
at its recorded Git source, reject incompatible publication, and exercise the
real call limit before continuing the same thread in the reverse direction.
Neither release protection nor the call limit was relaxed.

The subsequent connected run exposed an installed SDK defect too: Supabase
Realtime 2.100.0 mutates Phoenix's internal Presence references while creating
callback payloads. Repeated metadata changes then leave departed devices in the
Presence state. The reproduction executes the installed source, CommonJS,
module and embedded browser implementations with actual Phoenix state handling.
Upstream fixed this in `supabase/supabase-js#2566`; the candidate uses a narrow,
reproducible packaged backport, preserving Node 20 compatibility and the ban on
install-time dependency rewrites. The original implementations must fail the
regressions and the installed backport must pass. Hosted received-media and
authenticated backend checks remain required; this dependency correction alone
does not establish call qualification.

The 104-row review also identified two test boundaries that could be joined
without devices. Android root routing now runs with the production native-action
buffer, shared provenance and actual destination screen. The existing macOS
job compiles actual Swift audio-route, activation and observer methods with
controlled native API receipts and connects separate real JS root/facade tests.
Native OS delivery, actual navigation transport, selected hardware output and
Bluetooth/physical audio remain explicit limits. These additions verify existing
application behavior; they do not add unsupported Android speaker controls.

Keep this regression standard for future physical findings: reproduce the
mechanism at the lowest faithful automated boundary, demonstrate that the
former source fails it, and run the correction through its applicable connected
gates. If that mechanism requires an actual OS/device/provider observation,
record that remainder explicitly. A case inventory, mocked success, or a
Connected label cannot substitute for observed media or physical qualification.

## Next candidate proof, without redoing a blocked full matrix first

1. Finish exact-head protected validation, including the new authenticated
   HTTP and real-browser RTP lanes, and independently review their assumptions.
2. Under explicit production database authorization, apply and verify the
   forward self-leave migration before any corrected client delivery. Preserve
   the D1–D6/T1–T6 mapping and keep original evidence recovery E01 separate.
3. Under separate appropriate delivery authority, build new Android/iOS binaries
   and a new runtime generation for the native sender patch; existing v3 binaries
   cannot receive that patch by OTA. Prove exact installed source
   and run both directions: Answer → audible and moving media → repeated mic
   and camera controls → End postconditions → a fresh call. Begin with clean,
   owned call state; preserve first failures.
4. Once prerequisites work, execute remaining supported cases from a fresh
   matrix. Add the omitted explicit native Answer failure case, separate
   force-stop from termination, and record actual unavailable hardware.
5. Report source tests, installed uptake, observed physical outcomes and
   unresolved proof separately. No permanent reliability percentage or complete
   physical qualification is established by this source repair.
