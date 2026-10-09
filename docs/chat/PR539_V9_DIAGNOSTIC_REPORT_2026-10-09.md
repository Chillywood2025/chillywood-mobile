# V9 physical diagnostic report — 2026-10-09, through D1 CA02B

The installed v9 candidate remains **not physically qualified**. Software connection, media-control changes, Android background recovery and three explicit non-answer outcomes were observed. The iPhone outgoing speaker route failed. Actual two-way speech, physical output routing, moving video and complete capture privacy remain unverified. These observations do not dispose of the original 105 rows.

This report binds the installed candidate to immutable source `61d1deef026d58f395f621a1f51f4eb79b6c9b4c`, tree `d396aafad0a79f272c4f04750987787188a5737e`. It combines the operator's saved UI/action receipts, exact server readbacks, closed case manifests and bounded offline diagnostic summaries. It does not promote the subsequently edited v10 successor to installed or qualified status. Private account, device, invitation and room identifiers, signed URLs and raw logs remain outside this report.

## Candidate and evidence identity

| Item | Bound context |
| --- | --- |
| Internal installations | Android 100 from Google Play internal; iOS 35 from TestFlight internal |
| Installed-pair seal | Canonical JSON SHA-256 `98b423248499ae8466fb0552e8c87137ec6d8c4b4c1e49f3802293d1ea935eff`; canonical hash is distinct from a raw-file hash |
| Android installed receipt | SHA-256 `7c70079c01c74611811cad1f517aad0dfb90862cbf40b287c7cd5f509aa4134a` |
| iOS installed receipt | SHA-256 `20169516f5c82ce6df8381cda2034205d0f031b5abcb72ad9c88b50eb22a1069` |
| Final source build/release gate | Receipt SHA-256 `cfad2706abb9693f4c93215090b930a24a6c84d1bebe6dd3cf4e7e2ae31df632`; protected CI and release review passed for the installed source |
| Signed artifact bytes | Android SHA-256 `a842f519eaf72c06f2f17f77dd476cd31eea7c98ee19b7a21185d82c34e2513a`; iOS SHA-256 `12a4681e5457c3a484abdfa0117053e5ffc24bddf4b5be46a7f2c2495d45e920` |

The installation binding uses signed artifact verification and independent installed-version/store observations. It does not claim a measured hash of the installed binary. TestFlight group assignment API verification remained unavailable; visible TestFlight installation evidence is retained separately. Current account/thread observations are separate from the seal and are not inferred from diagnostics.

Some generic wrapper receipts retained an obsolete source label. The separately saved correction receipt, SHA-256 `fadde566698745a0877ca4554314deb43c7a0bed4a5348a4332e086a27d26848`, preserves those originals and identifies the canonical final-source records. A wrapper label does not establish which source a command executed.

## Attempt observations

All UTC case windows below come from the original manifests. Server event times are stated separately. Native phone log clocks were not calibrated to those clocks.

| Attempt and case window (UTC) | Observed behavior | Limits |
| --- | --- | --- |
| R01, Android → iPhone video; 13:24:20.834654–13:34:52.636970 | Both UIs reached Connected. One iPhone microphone cycle and six Android camera-control steps were observed. Explicit End was server-confirmed. | A later sampled observation timed out; recovery also appears in diagnostics. No completed uninterrupted observation window, three audible mic cycles, physical moving/lens views or End silence was established. |
| R02, iPhone → Android video; 13:36:12.510255–13:48:06.974509 | Android recovered after measured background holds of 20.424 and 60.413 seconds. After recovery both memberships were active with microphone/camera enabled. Android route controls completed their sequence. iPhone End left both UIs idle and the server ended. | During the longer hold Android was reconnecting with mic/camera disabled, consistent with the foreground-only policy. Native iPhone speaker requests failed four times. Server flags and route labels do not prove speech, motion or physical output. |
| R03, iPhone → Android voice; 13:48:41.988781–13:56:25.487550 | Both UIs reached Connected. Android receiver–speaker–receiver controls completed. One manual iPhone Use speaker tap produced an error that persisted at a later observation. Android End returned both UIs idle; server call and room ended. | A real iPhone route failure remains. The UI truthfully retained Connected and Use speaker with “The audio output could not be changed. The call remains connected.” No actual audible route success was established. |
| D1 CA02A, Android → iPhone video; 14:01:37.153105–14:03:53.481374 | Incoming presentation and caller Cancel were observed. Before the intended action, the invitation became declined by the callee; server event 14:03:10.493585. The operator issued no Answer, Cancel or Decline tap. | Cancellation was not executed. A separate OS/native investigation supports system ringing timeout leading to native End; this is neither a successful CA02 cancellation nor an EX02 authoritative missed result. |
| D1 DE03A, iPhone → Android voice; 14:04:40.373130–14:06:11.868689 | A valid saved ringing invite was confirmed, then the receiver Decline control was dispatched once. Server event declined by callee at 14:05:43.610389; room ended, no acceptance or membership rows. | This establishes the observed valid-invite decline path. The distinct throttle/retry-guidance requirement, capture absence and complete row retest are not established. |
| D1 EX04A, iPhone → Android video; 14:06:38.549292–14:09:27.552950 | No Answer, Decline or Cancel was tapped. Server remained ringing at 14:08:10.070034, before expiry 14:08:24.753922. A missed event by caller was recorded at 14:08:26.023370; terminal readback at 14:08:56.807719 showed room ended and no membership rows. Both UIs were idle and no late Answer control was observed. | Event time and readback time are different. No stale Answer was blindly tapped. This does not prove native capture inactivity, duplicate/late backend rejection or every original cleanup/fresh-call assertion. |
| D1 CA02B, Android → iPhone video; 14:09:43.062281–14:13:41.872925 | A distinct invitation was created at 14:10:05.678459. Server still ringing at 14:10:42.906940; one explicit caller Cancel was requested at 14:10:55.430047. Server canceled by caller at 14:10:56.150747, before expiry 14:11:35.678459. Terminal readback showed room ended, no acceptance or membership rows; both UIs were idle. | This is the successful observed cancellation action, separate from CA02A. Capture/audio shutdown, duplicate/late action behavior and every full-row retest assertion remain unverified. |

The D1 terminal invitations retain `accepted_at=null` and `ended_at=null`. Null invitation `ended_at` is expected for canceled, declined and missed; it is not a missing room-end observation and must not be replaced with an invented end time. No membership rows means no joined membership was observed in those readbacks; it is not independent proof that native capture never started. Actor roles above were compared with each case's exact saved caller/callee binding without publishing identifiers.

## Closed evidence and summary chain

All seven case captures are closed. Manifest sequence suffixes are not event counts. The original logs remain private and unchanged. Each of the eight D1 copied log snapshots was rehashed against its unchanged original; none grew during summarization.

| Case | Events | Final manifest SHA-256 | Bounded summary SHA-256 |
| --- | ---: | --- | --- |
| R01 | 444 | `9b2ede3281c299693ab5877fcca0fbc2dc94fd31d4c00347475fdf23b5ea268b` | `f510dfdb2c19545fdf4142005425754c99ce4d350ded24ee3676f91ee6a1bba8` |
| R02 | 372 | `65274a5792535691562d47a0aba067b3e002eeac620eb3e59d5bd135efd824ca` | `454642d1596019d8388d92223af01b7c1eab07905a7adcd1bf681115ceb01328` |
| R03 | 226 | `0c629407cbcf1dec1f8d00b13c17966c0c919d03266ad6129fc25ccfd6102a4d` | `9e6faf795a5d47b3e57571c4ebd80cbbbd5d2460b821ed551323d1407ca78d26` |
| CA02A | 54 | `1d9d7576b55b7ac54527df2f7c0de6ad2fdb5b2bb7ee62afc668a6e67640d43a` | `864edab40fcc1d73f75d12bd1103e54d44eaf1305f16bda5d01fa6d08808e48f` |
| DE03A | 63 | `b71f3bc2a149a3f1af0b1b0fab748fa96aafec4e46fb0450e20a1666ce9387f4` | `ebf449b34450ef0492c6a05c53047c3401a3b6f61b78d3c065b873cb7d1ea092` |
| EX04A | 67 | `b50bdb63da5be42d1250da3186466a3b30674acd39db50a94f88517bb1b949f8` | `dfe270104dac647618c79eee262f41216ba33570f1f685789eb3e0325b8e0262` |
| CA02B | 72 | `794edcf3b3a7d88e0c8be3b6295bccb0055b2b630abcb18e5214b680c416558c` | `53cc35b8ce2dccc0ead02cd8f781dc1b11318959f4f63382f995e83742652e14` |

The seen-receipt ledger continues chronologically R01 → R02 → R03 → CA02A → DE03A → EX04A → CA02B. CA02A's initial request failed `UTC_REQUIRED`; it remains preserved. Its separate request-02/summary-02 renders the actual `+00:00` UTC suffix as `Z` without changing the instant or inventing clock calibration. The other D1 summaries are summary-01.

The four D1 Android summaries accepted 96/98/101/103 allowlisted receipts, of which 94/96/98/101 were previously seen or duplicates; the remaining 2/2/3/2 have unbound phone clocks. The corresponding iOS summaries accepted 6/2/2/2 receipts with unavailable timestamps. CA02A includes four unattributed call receipts. None has a declared call hash, clock binding or requested logging positive control. No selected lines were rejected. These counts cannot prove event absence, exact-call capture behavior or physical media.

R01 separately retains an established native call association with unverified event time. That limited association is not carried forward to outgoing calls or D1. Session-wide JavaScript/native receipts, repeated Android buffers, native uptime and phone wall clocks must not be treated as interchangeable call or time evidence. Android route log evidence is explicitly unavailable because the final source has no corresponding allowlisted producer; UI/bridge observations remain separate.

## Source-backed interpretation and retained uncertainty

References here are to immutable `61d1deef`, not the edited successor.

- `_lib/chillyChatCallSoundAssets.ts:46–53` configures Expo playback with `allowsRecordingIOS=false`; `:74–77` stops/unloads a returned sound without a call-audio handoff. The outgoing ringback path can still have pending asynchronous creation when its old stop path runs. App-specific iOS logs show MediaPlayback/Default in R02 and before the R03 route attempt; native speaker override failures report NSOSStatus -50. This supports a category conflict as a repair lead. R03 lacks a category sample at the exact manual tap; no exclusive root cause or audio-session inactivity is asserted.
- `modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift:1689–1710` maps a native End for an unanswered call to declined unless it has an explicit app-requested invite reason. CA02A's private OS log records the 60-second ringing limit at 09:03:09.606375, followed by CallKit End dispatch to Chi’llywood and the app End delegate at 09:03:09.611870. The same phone-clock chain begins with incoming-report success at 09:02:09.556112. The upstream OS call identity is privacy-redacted, so process/timing correlation is retained with that limit; the app delegate was separately matched to the case.
- Public `CXEndCallAction` supplies no authoritative user-decline versus system-ringing-expiry origin. `CXAction.timeoutDate` and the provider's timed-out-performing-action callback concern action completion, not an incoming ringing deadline; `CXCallEndedReason` is an app-to-system report. No 60-second heuristic is used to rewrite status. The app's own server-deadline timer is a distinct path (`ChillywoodNativeCallCoordinator.swift:1368–1396`). The native 60-second behavior and server 90-second invitation lifetime therefore remain a semantic limitation for Android-to-iPhone expiry qualification.

The private CA02A diagnosis has SHA-256 `ab8a0b6e8c28d29cbc051f1d6828908aa3bf9079b996302fd5b6c21d93890353`; its later analysis supplements rather than rewrites the original manifest's “cause under investigation” outcome.

## Matrix applicability and remaining qualification

| Evidence | Original rows potentially informed | Still required |
| --- | --- | --- |
| R01 iPhone mic and Android camera controls | MC04, CM01, CM02, only with their exact preconditions | Three complete audible mic cycles, capture privacy, live remote motion and distinct lens views; full observation/recovery requirements |
| R02 established Android video background | BG03 | Actual speech/motion after recovery and native privacy/ownership evidence; it does not execute voice BG01 or incoming background Answer |
| R02/R03 Android routes; iPhone route failure | AR03/AR01 and AR04/AR02 respectively | Actual supported hardware output and native ownership; the visible iPhone failure requires a repaired installed candidate and fresh retest |
| CA02B, DE03A, EX04A | CA02, DE03, EX04 respectively | Remaining exact `required_retest` assertions; no automatic full-row PASS |
| CA02A | Timeout diagnostic affecting the intended CA02 action and Android-to-iPhone expiry investigation | No executed Cancel, no authoritative missed outcome and no successful Answer/media result |

D1 requires twelve direction/media/action combinations. This batch observed three intended combinations and preserves a fourth, interrupted attempt. It does not cover the other combinations, message-marker rows MS01–MS04, duplicate/late action contracts, throttle behavior or all shutdown assertions. No messages were sent as part of this batch.

The original matrix remains 105 unique rows. Its historical 26 PASS / 18 FAIL / 1 AUTOMATION BLOCKED / 60 DEPENDENCY BLOCKED totals belong to the original build 95/30 run and are not v9 totals. No matrix status or final v9 tally is assigned here. Incoming native Answer, remount behavior, permissions, network races, lock/unlock, Bluetooth and the remaining direction/media combinations require their own actual preconditions and evidence.

The user is available later for independent speech, mute/End silence, intended speaker/receiver output, moving remote video, distinct lens views and recovery-quality observations. UI labels, server flags, diagnostic silence and these summaries cannot supply those observations. The v10 audio-handoff repair is being reviewed separately; it needs final-source validation, native builds, delivery, installation and fresh physical checks. V9 evidence is retained as historical evidence and is not promoted to v10.
