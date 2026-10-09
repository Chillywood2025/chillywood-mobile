# V8 physical diagnostic report — 2026-10-09, through R05

The installed v8 candidate remains **not physically qualified**. Internal delivery and installation completed, but the diagnostic run reports an iPhone microphone-feedback failure and a prolonged Android-background termination. Actual two-way audio and genuinely moving video remain unverified. These observations do not dispose of the original 105 rows.

This report combines root-observed physical/server observations with read-only inspection of immutable source `5c545e324a010bb1bcad47bdaf15e86108c0785e`, tree `259b1d5c3851c2caad2fa87c0de6bde13ba11d5e`. The preparer did not access the Mac/phones or reopen raw captures. Full safe call hashes and endpoint roles/media below were supplied by root. Exact UTC dates, clock domains, complete action windows and original receipt references still require binding before final export.

## Candidate and evidence identity

| Item | Bound/reporting context |
|---|---|
| Installed candidate | Source5c545e324a010bb1bcad47bdaf15e86108c0785e; tree259b1d5c3851c2caad2fa87c0de6bde13ba11d5e |
| Internal installations | Android99 from Google Play internal; iOS34 from TestFlight internal, as verified/reported by root |
| Installed-pair seal | Canonical JSON SHA256 `8f723322a7ee7e26abe98671d0c53c3d4e5cde08871c78087a92fc5080c9a65f`; canonical hash is distinct from a raw-file hash |
| Server observations through R03 | Private Mac `v8-server-observations-through-R03-20261009.json`; SHA256 `528f918b72adbd4bdfe1c1165185070c496ff1415f49da22cae44f790a6b8519` |
| Android installed receipt | SHA256 `40c8b89ec5e2f69fcdb3ebd24114b73db177b55cb01ffba8382073c7f7c6f098` |
| iOS installed receipt | SHA256 `855e2d4304533c97b121802307ac7793ac841999ee303cadc0b68662642ef2af` |
| Artifact verification receipts | Android `218f554458b8d10a9afe6b509710b5f31cc5f8db33dfcca80af79164f5ca7be3`; iOS `df68ac3a582de8156b9fec805f3dac09825d628e220e200b884d5f2e9bc6295b`. These hash verification receipts, not artifact bytes. |

Delivery provenance must retain the initial iOS build failure, two failed Android EAS submission attempts, the initial false parser verification failure, and the separately corrected independent cryptographic verification. The later Android submission finished and Play internal99 became active/published before installation. Earlier failures remain part of delivery/tool history; they are not converted into physical matrix defects. A failed pre-scheduling submit may have no provider submission ID: preserve distinct attempt records and the supported unknown/not-created basis.

## Attempt observations

| Attempt | Root-reported observation | What it establishes and what remains open |
|---|---|---|
| R01; `78bed31ad536ae99232e`; Android99→iOS34 foreground video | First iPhone Mute/Unmute reached target Mic On at14.825s; the paired-XML observer returned beyond its15s deadline at15.121s. Server mic was true at03:51:57.136UTC. Android then completed six camera UI steps. Later, unsolicited iOS feedback seq11–26 and server Mic false at03:59:54 were recorded. | The first cycle's observer overrun does **not** establish a product recovery timeout: the target state was observed inside15s. Preserve that timing distinction. The later unsolicited feedback/mic-off regression remains a separate defect diagnostic; correlate intent, native phase and current owner before asserting the mechanism. Six camera UI steps prove neither native capture privacy nor physical moving/lens views. Caller End occurred04:00:03.753878; capture finished with289 events. |
| R02; `86f8a8d69cea2619180c`; iOS34→Android99 foreground video | Android20s background hold lasted20.386s and recovered; both endpoints' mic/camera states were true at04:08:03. The60s hold lasted60.357s, ending04:09:16.228154. Global End followed at04:09:17.460626, actor `callee`, with no automation End. | Root classified the diagnostic `FAILGLOBALEND`. The60s adverse survival observation cannot be cleared by the partially healthy20s result. The terminal actor is Android in this direction; it does not itself identify the native/UI/lifecycle trigger. Actual speech/motion remain unverified. Capture finished with161 events. |
| R03; `378f1291ce59188e4313`; Android→iOS background video | Created04:13:55.761098; native presentation reported04:13:59.661924, about3.901s later; one APNs200. Server status was `declined` at04:15:00.500061, before intended Answer tap04:15:13.918052. Last screenshot04:14:41. The tap may have opened Calendar and its notification prompt. | Reported UTC ordering places decline about13.418s before the intended tap; the screenshot was about33s old. Preserve clock origins/uncertainty. Presentation is partial evidence only. This is **not an Answer product PASS or FAIL**: a current actionable invitation/control was not demonstrated at tap time. Calendar opening is a suspected consequence, not a proven native Answer action. Do not infer Answer delegate, acceptance, activation or media negotiation. R03 captures closed with74 events. |
| R04 | Root explicitly reported no call attempt or creation: external Calendar prompt blocked setup. Closed54 events, outcome `SETUP_BLOCKED_EXTERNAL_SYSTEM_PROMPT_NO_CALL_CREATED`. | Home/activate did not dismiss the prompt. Root identified Calendar's bundle from the installed-app inventory and terminated only Calendar, without an Allow/Deny permission choice. Both authorized Chi’llywood thread UIs and idle controls were restored. Preserve the setup contamination separately; it is not another call/Answer product failure. |
| R05; `83557f325e7c9fd11312`; Android→iOS background video | Created04:26:27.178103; expiry04:27:57.178103. One APNs200, attempt04:26:30.350432/update04:26:30.584817. No banner observed in the four0/2/4/6s samples, or at04:26:58 and04:27:33. Server `presented` remained null at04:26:59.525. No native callbacks were observed, with an explicit capture-coverage limitation. Server was `missed` and room ended at04:28:00.108092; no joins or Answer. | Retain the missing-presentation observations and normal terminal outcome separately. APNs200 is not device presentation; an unverified logging channel cannot prove no native callback occurred. Answer was not executed and has no product outcome here. Post-expiry foreground restored both idle thread controls. R05 closed with 70 events and diagnostic outcome `FAIL_BACKGROUND_VIDEO_PRESENTATION_NOT_OBSERVED_BEFORE_EXPIRY`; all owned capture readers closed. After foreground, native `registration_start_received` and `registration_started` supplied a positive control; that later receipt does not retroactively prove full earlier coverage. |

R01 was created03:49:59.619957 and accepted03:50:08.637156; callee joined03:50:09.925389, caller03:50:10.387410. R02 was created04:05:09.976805 and accepted04:05:14.888229; Android joined04:05:15.939971 and iOS04:05:16.184531. These are distinct server/host observations to bind to their original clocks, not fabricated physical-media proof or independent join-invocation counts.

All server/action times above are on 2026-10-09 UTC. Native wall-clock log strings use a separate clock representation; correlate their monotonic receipts and preserve uncertainty. The first server archive ends at R03. R05 readbacks are separately retained in `v8-server-observations-R05-20261009.json`, SHA-256 `fb784f2743fcf82e6a341997cea1be8d7fbce683cc8ccff2a89fed6482e64630`. All five case captures are closed, both apps are idle, and no Calendar notification permission choice was made.

## Source-backed interpretation, without inferred root cause

References below are to immutable5c545 source, not the subsequently edited working candidate.

- `hooks/use-communication-room-session.ts:586–620` reserves automatic microphone feedback by generation/intent, records reserved/settled/native-feedback phases, and consumes only a matching current reservation. `:1582–1619` creates that reservation in the owned serialized execution slot and removes it when the operation settles. `app/chat/[threadId].tsx:2745–2756` consumes same-call native acknowledgments/automatic feedback before treating a mute/unmute event as a new explicit microphone request. These are the relevant R01 inspection points; they do not prove which event arrived or whether its timing caused the physical failure. `native_mic_feedback.enabled` means a feedback match was consumed, not that a microphone captured sound.
- `docs/chat/PR539_V8_EXECUTION_PLAN_2026-10-09.md:103–110` deliberately separates20s and60s Android background intervals, the latter exceeding the45s visibility lease, and requires no callee global End, current membership, restored controls and actual media. That supports retaining R02's adverse60s observation independently. `app/chat/[threadId].tsx:2914–2952` distinguishes caller cancellation and accepted-call terminal authority before exact local cleanup; `hooks/use-communication-room-session.ts:2382–2440` separately handles captured membership/room cleanup. A server terminal actor alone cannot prove which production path ran.
- `modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift:1095–1138` configures the audio category for the pending Answer before fulfillment and has a separate failure/terminal cleanup path. `app/chat/[threadId].tsx:1283–1338` bounds accepted native audio readiness and fences later cleanup to the exact current descriptor/invite. R03 did not establish entry into either successful Answer or accepted-readiness path; the stale screenshot/intended tap cannot test those contracts.
- The plan's evidence contract at`:155–175` requires exact invitation/room/account, a real Answer delegate, acceptance, join, activation and separate physical media proof. Presentation alone cannot substitute for that chain.

## Known matrix applicability — no verdicts assigned here

| Recorded work | Rows potentially informed, only if exact original preconditions match | Remaining requirement / exclusion |
|---|---|---|
| R01 Android camera steps | CM01/CM02 have the matching Android-originated video direction; F03/FS02 additionally need proven settled-replacement entry | Capture stop/start, distinct moving lens scenes, peer rendering and continuing audio remain unproved. Six UI steps do not complete these rows. CM03/CM04 concern iPhone controls and do not match. |
| R01 iPhone mic observations | MC04 has the matching Android→iPhone video direction. F01 also needs cold entry; BG04 needs an actual iPhone background/resume sequence. | Separate the first-cycle observer overrun from the later unsolicited feedback/mic-off regression. Three successful audible mic cycles were not established. PM02 denial/regrant and F08/RB04–RB06 pending races require their own prerequisites and ordering. |
| R02 Android established-call background | BG03 matches iPhone→Android video; the60s result supports a failed call-survival assertion for this diagnostic |20s UI/media-state recovery does not prove actual speech/motion or clear the later termination. BG01 requires voice. Established-call backgrounding is not incoming background Answer: do not count F07/BL11/BL15/RB01–RB03. An unsolicited global End is not a deliberate repeated-End EN-row test. |
| R03 and R05 iPhone native presentation | BL07 matches Android→iPhone background video | Keep R03's approximately3.901s presentation and R05's missing-banner observations together as separate attempts. Neither completed Answer/media requirements. These are not terminated-state BL08, voice BL03/BL04, or elsewhere-in-app voice D5. `declined` alone is not deliberately executed DE02; R05 terminal expiry does not establish the entire EX02 late-action/no-capture/cleanup requirement. |
| R04 external prompt | Setup blocker context for the intended follow-up only | No call creation, presentation or Answer scenario executed. Do not invent affected row IDs or turn it into a product FAIL. |

Read the full canonical 105-row matrix and required-retest fields before assigning any row status. This report does not change the existing matrix or its original 26 PASS / 18 FAIL / 1 AUTOMATION BLOCKED / 60 DEPENDENCY BLOCKED totals. Those totals belong to the original f44437/build95–30 run, not v8. V7 0d942/build98–33 evidence also remains separate. No final v8 totals are asserted.

## Required evidence completion

Retain every R01–R05 attempt, failed action, source-read interval, stale screenshot and cleanup receipt. Bind full safe call hashes from authoritative records, exact platform roles/media/provider, UTC dates and clock domains; do not fill missing values with zero. Preserve raw logs/screenshots/server records privately and export only approved bounded fields. No actual audio, moving video, complete cleanup of earlier calls, physical End privacy or native-log absence is inferred from UI labels or this draft. The v8 candidate remains unqualified against the original 105-row scope until its required observations and explicit adjudications exist.

## Successor repair status

The working successor branch retains v8 as historical installed evidence. Reviewed
source fixes preserve a committed microphone during reconciliation, recover
expired membership without global End, and retain camera intent at the
background privacy boundary. The last camera fix includes delayed signaling,
Camera Off, End, account replacement and second-background counterexamples.
The first merged regression selection passed 320 tests, with zero skipped.
These results are software evidence, not successor installation or qualification.

An additional reproduced iOS screen-remount readiness escape and Android 11
playback-route compatibility work are still being completed. Final source,
generation, full validation, native compilation, signed builds, installation and
new physical results must be recorded separately. No v8 result is promoted to
the successor. No OTA, public release, provider rollout, production database,
entitlement or money changes were made.

