# PR #539 v7 diagnostic report — 2026-10-09

**Interim operator-receipt draft; qualification withheld.** V7 delivery enabled
substantially more paired-device testing, including complete camera-control
sequences on both platforms and an iPhone background Answer. Testing also found
an unintended call termination after a prolonged Android background interval,
an iPhone microphone state that did not recover after backgrounding, and an
unresolved terminated-iPhone incoming-call attempt. A later background voice
invite reached the native presentation path about 62 seconds after creation,
failing its timely-presentation assertion.

Actual two-way speech, mute/End silence, audible route changes and genuinely
moving remote video remain **UNVERIFIED**. UI, track, native-call and heartbeat
receipts below do not award whole-row PASS. The repository's 105-row retest
matrix still contains 105 `NOT RUN` statuses at this draft's snapshot: final row
adjudication remains outstanding despite the individual assertions exercised
below. Earlier PR #538 verdicts do not transfer to these builds.

## Installed identity and software gates

| Field | V7 identity |
| --- | --- |
| Installed source | `0d942593fe7db6187212ebdf234eca03f83c342d` |
| Installed source tree | `280e5b59ebfeb21f1275ad1dc102e8b6a7cfc27a` |
| Native generation | `internal-native-v7` |
| Android store build / runtime | 98 / `1.0.0-android-production-v7` |
| iOS store build / runtime | 33 / `1.0.0-ios-production-v7` |
| Android / iOS channel | `android-internal-v2` / `ios-internal-v2` |
| Android native digest | `df19ee0cde119782d28d7e514d56d8890cc13f0ba70d20cf750a9980cc7455bc` |
| iOS native digest | `7c6e1332541f2e0a0cc9a963ad8c3c0e3bfac6d414be32ab780728994d121fed` |
| Exact-head source validation | Run `37861195723`, successful |
| Protected Required Validation | Check `113599014579`, successful; trusted app `4707730`, publisher run `37861767785` |
| Android signed artifact SHA-256 | `ff8eaa909421c136298f3d9c08b83fb440140e86e9353d67a6bf9fbddbce0886` |
| iOS signed artifact SHA-256 | `d3ce1da10cb7a955f9f27db6267246cf48691b64208021a55dfa6cdd2bf07748` |

The source-bound local receipt records 1,353 product/call tests and 253
policy/sensitive tests passed, with zero failures or skips; lint, TypeScript,
runtime/routes/UX guards, 73 terminal Postgres checks and 29 locally executable
native/release commands passed. Android native contracts passed 26 sender and
56 release assertions, with the old failure and separate detach mutants
detected. Mac Java, Objective-C and Swift checks were separately reported
passed; compiler checks unavailable locally were not represented as local runs.

The paired-device operator supplied the hosted/protected and artifact
identifiers above and retains the release-review and installed-app receipts.
This draft is not a sealed evidence export.

## Physical attempts

Times are UTC on 2026-10-09. Hashes are the operator's sanitized correlation
references, not artifact hashes. Preserve original attempts and observer errors
when subsequent retries succeed. These calls used the legacy WebRTC path. The iPhone reported iOS 18.7.8 in the operator’s read-only device query; related native-audio discussion does not by itself identify an operating-system defect.

| Attempt / correlation | Observations and limits |
| --- | --- |
| **R1**, `3a0879d98dcf7e29156e` | iPhone completed three microphone-control cycles over 126 seconds. USB disconnected before the camera action; that action was not performed. The interruption limits the attempt and must remain in its record. |
| **A5**, `4e8156ea7c9710c10f43`; 01:12:33–01:19:15 | Android completed the six-step camera UI sequence: Off → On → Flip → Off → On → Flip. Heartbeats remained live; explicit End left both memberships. No new Android fatal receipt was observed in this attempt's logs. This does not independently prove lens motion, transmitted moving video or audible media. |
| **R2**, `9184a78e2e9fcdc14b4b`; 01:20:33–01:35:15 | Android completed three microphone cycles over 100 seconds. iPhone Camera Off/On observations included source-read failures and a false timeout classification, corrected below. Android then remained backgrounded for **221 seconds**, 01:31:32–01:35:13, because a context-compaction interruption extended the hold. The call ended without operator End; the database attributed the terminal transition to the callee. Preserve this actual interval as a protocol deviation, not a 20-second test. |
| **R3**, `32c04c8456024759b416`; 01:39:23–01:47:17.172927 End | iPhone completed the same six-step camera UI sequence. A separately controlled Android background interval lasted 20.37 seconds; automatic restoration returned both endpoints to Connected with Mic On/Camera On and advancing heartbeats. Observer latency leaves restoration timing/SLO unverified. This shorter successful attempt does not erase R2. |
| **A6**, no call created | The immediate post-Home read still reported app state 4. The precondition was not established, so no Call was tapped. The attempt was preserved and the observer was corrected to poll the entry state after one Home action. This is an observation limitation, not a delivery verdict. |
| **A7**, `2caf429c616c340569e2`; created 01:48:03, accepted 01:48:57, ended 01:55:34 | iPhone background state was confirmed before Call. Correlated native receipts showed PushKit, successful report, banner Answer delegation, pending Answer and fulfilled Answer. Both endpoints reached Connected; native/JS capture receipts reported one audio and one video track. Manual Receiver → Speaker produced positive native override and UI receipts. Actual sound, sound routing and moving video remain unverified. |
| **A7 BG04**, same call | Home at 01:52:56; foreground at 01:53:22 after the controlled 20-second hold. iPhone microphone state remained false for more than one minute while Camera On and Connected remained visible. Native bottom-up `mute YES` occurred at 01:52:56; the operator did not tap Mute. A subsequent source repair is integrated below; physical closure remains pending. The missing `audio_activation` diagnostic phase is a separate evidence gap; absence of that log does not independently prove failed audio activation or inaudible media. |
| **A8**, `b2dad39ee80cdbce7eba`; created 01:57:30, expiry 01:59:00 | XCTest termination was confirmed with app state 1 before the attempt. APNs returned HTTP 200 once, but `presented_at` remained null; no corresponding PushKit, app launch or native incoming UI was observed. The bounded receipt recorded one late result, server `missed`, and no memberships joined. Cancel was unavailable by the attempted check, so no Cancel action was performed. A post-expiry foreground launch produced a new PID and a native logging positive control. No current-build-33 crash report appeared among the copied app reports. Cause remains unresolved. XCTest termination is not treated as equivalent to a user force-quit. |
| **A9**, `05637bbf21ed13987856`; created 02:06:31.571234, expiry 02:08:01.571234 | iPhone background state was confirmed before this voice invite. Initial observations at 0/2/4/6 seconds showed no incoming screen. Native PushKit appeared at 02:07:33.574542 and `reportSucceeded` at 02:07:33.623, approximately 62 seconds after creation; subsecond clock uncertainty cannot explain that interval. The APNs row recorded `presented_at` 02:07:34.423, sent/HTTP 200, count 1. No Answer was performed; the operator's fresh late observation occurred after the deadline, leaving an observation gap. The server marked the call `missed`; no memberships joined. **Timely-presentation assertion failed; latency cause remains under investigation.** Later delivery is positively observed, so this is not a never-delivered claim. |

The operator's subsequent read-only unified-log query found two A9 dispatch
entries: `ios-voip-call-dispatch` POST/200 at **02:06:38.973**, duration
**6,034 ms**, and `chilly-chat-call-dispatch` POST/200 at **02:06:39.253**,
duration **7,523 ms**. The first recorded timestamp is about **7.4 seconds after
invite creation** and **54.6 seconds before native PushKit receipt**. The native
log's 21:07:33.574542 CDT timestamp is expressed above as 02:07:33.574542 UTC.
These are log timestamps and request durations; the cross-system intervals are
approximate. Deployed-source review found the ACTIVE v15 iOS dispatcher
byte-identical to v7: it awaits the APNs request, status write and a four-second
acknowledgement poll before returning, without a deferred send. The operator
confirmed one iOS VoIP invocation in the 02:06:25–02:08:05 query window and one
controlled A9 invitation/attempt. This is unique-window correlation; an
execution-ID link was not independently read. On that correlation, the
completed response bounds the observed APNs acceptance before return and the
later native receipt is downstream of the dispatch response. Neither the HTTP
200 entry nor that interval locates the remaining delay in APNs, the network or
device scheduling. The later acknowledgement overwrote `updated_at`; it is not
an APNs-acceptance timestamp.

After A9 expiry, foreground observations at 02:10:38–02:10:42 still showed a
stale incoming voice-call banner with disabled call controls. Fresh paired
observations at 02:15:36–02:15:40 showed No Active Call on both endpoints. No
operator action occurred between these observations. The state resolved within
that bounded observation gap; its exact resolution time and cause remain
unknown.

## Observer correction and stronger regression evidence

**The R2 camera timeout was not evidence of a persistent product failure.** The
second Off tap ran 01:27:16.020–01:27:18.665. One paired read returned at
01:27:37.374 with a disabled control, but its completion time did not identify
when the iPhone tree was sampled. A fresh source request begun 01:29:16.497 and
completed 01:29:23.153 showed Camera Off enabled, Mic and route enabled, both
Connected and the correct peer Camera Off projection. Permanent blockage was
disproved; recovery duration remains unknown. A separate source timeout had
also occurred before an earlier On tap, so that unperformed action cannot be
counted as a product failure.

The preserved private camera helper now records each endpoint's UTC and
monotonic read window, retains intermediate successes/errors, and requires a
fresh, bounded post-deadline pair before declaring readiness or timeout. Slow,
missing and ambiguous confirmations become observation blocks. Each wait has
at most eight pairs and a default 64.75-second cooperative budget; external
transport/screenshot/tap helpers retain their own limits. Eleven simulations
passed, including the early-busy/late-response counterexample. Reviewed helper
SHA-256: `3a0fbab19ed08b539b23ae1c96b9fc7ac5ba59e7eedffc6e4d9fa084168f3754`.

**R2 prompted a concrete source-level recovery counterexample.** The production
wrapper enables session restart, whereas several direct lifecycle tests used
the hook's default in-place recovery. Non-host room visibility expires after
45 seconds without membership liveness. An already-pending successful-null
room read, released before the foreground restart timer, caused the old source
to invoke `onRoomEnded`, leading the actual screen to end the accepted invite.
The same late read released after restart was correctly fenced. Database and
native seams in these tests remain controlled; this supports a repair without
claiming that the physical causal chain was fully observed.

The full-screen harness also converted successful null room reads into
`TypeError`, hiding that production branch. Its null preservation is now fixed.
The repair retains owned media/cleanup state, suspends the affected non-host
session, and requires authorized re-admission before capture resumes. Explicit
End, failed native shutdown, denied admission and late admission cleanup retain
their ownership checks. Thirteen direct and six full-screen controls passed
independent review. The author's combined suite passed 340 tests, plus
TypeScript, lint and diff checks.

The revised full-screen tests also evaluate the actual panel bindings. They
exercise recovered Off/On/Flip and verify a held acknowledgement makes controls
busy and that completion clears busy. Three separate mutations—permanent busy,
no-op camera toggle, and no-op flip—each fail the two recovery cases while the
three terminal controls pass. The former 51-test screen suite passed a combined
version of these mutations, demonstrating why its earlier coverage was
insufficient.

| Repair identity | Value |
| --- | --- |
| Independently reviewed repair commit | `292b0bd89854ef00ebdb915d3bf39da34c5fde0d` |
| Root integration commit | `d2f01a86f1867f5fe59a9d23d41b84937ca6b628` |
| Matching repair tree | `4de480afbc253e570f0a6447bcabba376990a4a1` |
| Subsequent iOS microphone-intent repair | `b15aa715edc40b93347dd652b0d72b9cc55864ec` |
| Intermediate source combining those two repairs | `43e9e34adb5f7640d0cd7bd54c2fedb94b936e09` |
| Corresponding intermediate tree | `f6e9b8d201592de90ce69d341ad8ee768bd91c7c` |

These changes are newer than the installed v7 binaries. The subsequent iOS
change preserves microphone intent through automatic CallKit mute feedback;
its integration does not establish physical recovery. Further native audio and
expiry repairs are being evaluated after this intermediate integration. The
final candidate still requires its source-bound validation, build, installation
and physical regression; it is not described here as already built. A8 terminated
presentation and A9 presentation latency remain unresolved.

## Remaining qualification work

Complete the exact 105-row adjudication on the intended final installed
candidate, preserving failed and blocked attempts. Obtain independent physical
confirmation of both audio directions, mute/End silence, audible route changes
and moving video. Resolve and rerun A7 BG04, A8 and A9, then rerun prolonged and
controlled background recovery on the repaired candidate. Unavailable persons,
hardware, accounts, authorized provider states or legitimate race conditions
remain explicit blockers.

No OTA, public release, provider rollout, database migration, entitlement or
money change occurred in this diagnostic work. Internal builds/installations
and scoped diagnostic calls are recorded separately. No successful UI sequence
or software gate constitutes physical candidate qualification.
