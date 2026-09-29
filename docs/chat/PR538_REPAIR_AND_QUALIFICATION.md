# PR #538 evidence investigation and bounded source repairs

Date: 2026-09-29. **Incomplete repair; NOT physically qualified.**

Historical PR #539 investigation. For the union with PR #540 and subsequent
repairs, use the [consolidated candidate](CONSOLIDATED_CALL_CANDIDATE_2026-09-29.md)
and its canonical retest matrix. In particular, the later #540 investigation
identified DE03 rate limiting; the earlier open D4 entry below is retained history.

The source reviewed here is `f44437c8acf9c9ad0f1621c985b3a70831e8459c`.
PR #538 head is `9563900cbc1454122fe266ac1313260edc9e2f87`. Its ZIP at
`docs/chat/evidence/chillywood-pr537-v4-physical-qualification-2026-09-29.zip`
was fetched from that exact head. SHA-256:
`21b3518e394e37809cd490d1f15a01288aaf105af5866765931019dc9b3f45b3`.
The existing verifier independently reported 71 manifested files, 105 rows,
and zero integrity/reference issues. Original results remain 26 PASS, 18 FAIL,
1 AUTOMATION BLOCKED, 60 DEPENDENCY BLOCKED. No historical row is upgraded here.
The matrix records 104 `legacy_webrtc` rows and one `not_persisted` row;
none is an executed LiveKit case. LiveKit qualification is additional work.

The companion `PR538_CASE_FOLLOWUP.tsv` accounts for every original ID once,
retains its original status, and identifies the next proof. These are open
follow-ups, not a second set of executed physical results. Even the original
PASS cases need relevant regression qualification on a changed binary/bundle.

## Scope and findings

The relevant registered feature is `chilly-chat-call-lifecycle`; the messaging
regression boundary is `chilly-chat-inbox-thread`. The concrete surfaces are
`app/chat/[threadId].tsx`, the root native-call bridge and native-intent route,
the media adapter, legacy and LiveKit hooks, participant grid, authenticated
invite/membership/signaling APIs, and native iOS/Android call integrations.
Both OSes, caller/callee directions, voice/video, foreground/background/cold
launch, permission denial, current/replaced account, cleanup and accessibility
must remain distinct. This call matrix is not an audit of Premium, creator
money, ledgers, or the rest of the application.

| Report finding | Source result in this branch | What is still required |
| --- | --- | --- |
| D1: iPhone microphone recovery | OPEN. The reported terminal error is reachable through failed sender rollback or unproved microphone topology/privacy. Screenshots do not identify which branch failed. | Capture the original preparation/commit error, sender/track lifecycle, exact session ownership, native audio activation/interruption and durable media outcomes; reproduce on iOS before choosing a repair. Retry F01, MC02, MC04, PM02 and dependent races. |
| D2: camera off / flip | **Camera-off display defect reproduced and repaired.** Production JSX previously rendered retained remote video and displayed Cam On even when `cameraOn=false`. Both transport renderers now obey camera intent. The guard previously required the faulty remote exemption; its rule and negative control now reject it. | CM01/CM03/F06 need new installed proof. **Flip-to-black is OPEN**: this fix does not prove capture, encoder, sender replacement, decoder or RTCView recovery. CM02/CM04/F03 require correlated native evidence. |
| D3: same-thread iPhone voice Answer no-op | OPEN. Added a test with the actual root/facade and screen when a native Answer route arrives before the foreground request promise settles. It passes on the original source; it does not reproduce BL01. | Correlate UI tap, native request, CallKit delegate, emitted/consumed route claim, server acceptance and audio activation. Include OS rejection and missing/late event; do not report a queued transaction as acceptance. |
| D4: intermittent invite persistence failure | OPEN. DE03 is a failed **setup**, not proof that Decline itself is broken. | Recover the exact sanitized dispatch/RPC error and authoritative invite/room/thread readback for each failed attempt. Reproduce with controlled concurrent starts/transient responses in a disposable backend. Avoid blind retries that create another call after an ambiguous write. |
| D5: iPhone background/terminated video presentation absent | OPEN. A sender's push-sent label does not locate the failing APNs → PushKit → CallKit boundary. | Correlate provider request result, device receipt, presentation completion and deadline for voice and video separately. Preserve OS force-quit versus system-termination distinctions. |
| D6: native preparation/handoff unstable | OPEN. The same-thread ordering test covers one missing JS sequence but does not simulate successful OS behavior. | Exercise the real native module with current UUID/account, cold JS hydration, pending Answer timeout, exact server acceptance and audio readiness. Include duplicate, delayed and terminal events. |
| D7: Android background Answer opens muted | **Lost foreground microphone intent reproduced and repaired.** Initial missing capture truthfully becomes muted but now retains authorized foreground recovery intent. Explicit Mute, permission denial, End and account/room ownership remain barriers. | BL11/F07/RB01/RB03 remain failed physical rows. Verify native service eligibility and actual microphone startup. This branch does not implement or certify background capture entitlement. |
| D8: peer-loss recovery labeling | OPEN / investigate. A 15-second heartbeat is not necessarily a peer-expiry deadline. | Establish the intended presence lease/expiry and UI timeout from actual server policy, measure termination → peer loss → rejoin, and distinguish “reconnecting” from media flowing. |

## What the current tests actually exercise

1. Production component rendering: the new camera tests execute the real JSX
   and labels with retained legacy/LiveKit tracks. Native host views are
   substituted; pixels and RTP are not proved. The two remote-off cases failed
   before the product change and passed afterward.
2. Mounted legacy lifecycle: the new background Answer tests use natural hook
   initialization and the actual background-media policy. Native capture and
   services remain controlled. The foreground restoration case failed before
   the repair; explicit Mute was already respected. Denied permission and End
   are negative controls. Repeated background/inactive events must preserve
   the pending request. Existing generation/cleanup tests remain required.
3. Same-thread Answer: actual JS facade/root/provenance/screen/hook, explicit
   controlled OS event and independently held request response. No native
   route is synthesized just because the request promise resolves. Transport
   remains controlled, so this is not a physical call proof.
4. Existing real-browser lane: production hooks with real SDP/ICE/RTP, synthetic
   source audio/video, simulated membership/signaling. It tests received PCM,
   changing decoded video, media controls, cleanup and fresh reuse.
5. Existing authenticated browser/HTTP lane: real local Supabase APIs and
   private Realtime, production hooks and browser peers. It still uses
   synthetic capture and service-only invite setup. It does not exercise the
   installed native OS, production Edge delivery or store binaries.
6. Installed SDK contract/native compile tests and physical-device runs prove
   different boundaries. A generated-source assertion is not a native runtime
   test. A simulator/browser cannot certify phone audio routing or camera capture.

## Stronger qualification method

Do not replace the above distinctions with a larger aggregate PASS count.
For each repaired physical defect, first get a regression that fails against
the old source. Run the corrected source through the same observation, then
rerun adjacent transitions and the original failure on the exact installed
candidate. A plausible new test that passes the old source is added coverage,
not a reproduction of the reported defect.

For the paired-device sequence, retain one sanitized correlation timeline:
source/native digest/runtime/bundle, platform/version, pseudonymous test
endpoint, invite/room/generation correlation, monotonic timestamps, current
permission and application state, native capture start/stop, sender replacement
acknowledgment, signaling state, selected transport, inbound/outbound counters,
decoded audio/video progression and visible/audible outcome. Do not include
tokens, raw device IDs, private messages, SDP/ICE addresses or raw provider
payloads. Developer-only logging is disabled in release builds; any required
internal diagnostic collection must be deliberately implemented and verified,
not assumed to exist because a debug log helper is present.

Use independent receiver observations. During a consented test, speak a fresh
challenge at one physical microphone and confirm it from the other phone's
selected output, then reverse direction. Move a recognizable marker in front
of each camera and confirm movement at the opposite display. An external test
rig can automate this only if its signal passes through the actual microphone,
camera and output route; injecting synthetic media after capture does not
prove those devices. Never substitute static screenshots or connection labels.

Sample supported inbound/outbound RTC statistics over time. Packet counts
alone can include silence or black/frozen media. Audio energy/decoded samples
and video frame progression provide additional evidence, but do not establish
audible speaker output or correct physical lens on their own. Missing SDK
fields remain unavailable evidence. Include negative controls: deliberate
mute, camera off, stopped sender, dropped signaling, failed replacement and
ended call must all be detected by the observation method.

Test real failure ordering in a disposable environment: delayed/rejected
capture, sender replacement, server mutation and native Answer; account or
call replacement while each is pending; duplicate/late push; token refresh;
network transition/reconnect and TURN where available; interruption, Settings
revoke/restore, Bluetooth route loss, lock/unlock, native media-services reset,
End during pending work and a fresh call afterward. Keep natural full-screen
startup in the integration lane. Explicitly label any simulated fault boundary.
Do not manufacture unreachable production states by mutating live backend rows.

Preserve first failures rather than rerunning until one pass appears. Run a
declared repetition count across fresh/cold calls, both directions and both
media modes, recording every result and environment. Repetition does not
guarantee reliability across untested OS/hardware/network combinations.

Start installed requalification with one foreground voice/video call in each
direction, controls, End and fresh reuse. Then repeat failed rows and their
dependents, followed by the remaining matrix. Requirements for an observer,
Bluetooth accessory, owner unlock, recovery mailbox, authorized replacement
identity and separately authorized LiveKit canary are real prerequisites.
Unsupported Android legacy speaker controls require an explicit product
decision; they cannot become PASS through a renamed label.

## Platform research used in this investigation

- [Android foreground-service restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start): permission granted is not sufficient evidence of background microphone eligibility. Inspect the actual activity/service/notification exemption path.
- [Apple CallKit audio activation](https://developer.apple.com/documentation/callkit/cxproviderdelegate/provider(_:didactivate:)): observe native audio activation separately from Answer transaction submission.
- [Apple PushKit incoming calls](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit): trace device receipt and CallKit reporting, not only provider submission.
- [Apple background camera interruption](https://developer.apple.com/documentation/avfoundation/avcapturesession/interruptionreason/videodevicenotavailableinbackground): incoming video-call presentation and starting camera capture in the background are distinct requirements.
- [Apple media-services reset](https://developer.apple.com/documentation/avfaudio/avaudiosession/mediaserviceswereresetnotification): include rebuilding/resetting audio objects/session state in native recovery testing.
- [W3C WebRTC statistics](https://www.w3.org/TR/webrtc-stats/): use time deltas and media-specific counters with their documented meanings, alongside physical output observation.
- [Firebase force-stop limitation](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages): Android force-stop from Settings requires reopening for messages to resume. Retain the matrix's existing correct distinction between force-stop suppression/manual reopening and ordinary background/system process termination; do not change BL12/BL16's historical disposition.

## Local validation

- Evidence verifier: 71 manifested files, 105 rows, zero integrity/reference issues.
- Camera presentation regression: 8/8 pass; the two retained remote-camera-off
  cases fail against the original component.
- Mounted legacy/LiveKit, screen, native bridge, native state and SDK contract
  suites: 605/605 pass. These are controlled tests with the boundaries above.
- Root product tests: 357/361 initially passed; four historical-native-source
  checks could not access commits absent from the shallow checkout. After
  fetching repository history, the entire affected release-source file passes
  18/18. The missing-history failures were not product failures or waived checks.
- Lint, TypeScript, runtime, route contracts, critical UX, discovery and
  cross-lane policy guards pass. The cross-lane guard now rejects the old remote
  camera exemption; it has not been removed or bypassed.
- Browser/native/installed validation is incomplete as described below. Local
  controlled counts do not replace the protected CI result or device evidence.

## Delivery boundary

No deployment, migration, provider configuration, OTA, distribution build or
release is performed by this repair branch. Existing database delivery and
recovered historical files are acknowledged from the supplied report, not
independently re-deployed or re-certified here. Repository `AGENTS.md` requires
action-specific delivery authority and canonical release tooling after source
validation. No native product code is changed in this branch.

This workspace has no connected test phones, Xcode, Android device bridge, or
local Supabase/Docker runtime. The pinned Chromium download returned an invalid
archive, so local real-browser execution could not be established. Exact-head
CI and a device-capable workspace are required for the remaining validation.
These limitations must remain explicit in the PR; they are not successful tests.
