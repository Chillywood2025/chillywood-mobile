# Device Plus Emulator Live Room Internal Test Sweep

Date: 2026-06-05

Lane: Device Plus Emulator Live Room Internal Test Sweep

Starting HEAD: `013b218` (`Stabilize internal testing flows`)

Branch state at start: `main...origin/main`

Proof path: `/tmp/chillywood-device-emulator-live-room-test-sweep-20260605/`

Follow-up: June 10, 2026 live-room wake-lock/back/overlay stabilization is tracked in `docs/LIVE_ROOM_WAKE_LOCK_BACK_OVERLAY_PROOF.md`. That follow-up adds `expo-keep-awake`, replaces stack-history Back returns on Watch-Party Live / Live Stage with room-context returns, and keeps the Live Stage 10-second overlay timeout plus tap-to-reveal behavior. Full idle/wake-lock proof requires a Play/internal runtime that includes the new native module.

## Summary

This sweep attempted the requested two-session live-room proof with one Play-installed physical Android device and one Android emulator. The physical device proof succeeded for route health, Premium-gated Watch-Party entry, Live Stage unavailable handling, route-backed ticket/access/seat monetization gates, no-publish/no-host/no-admin/no-money copy, and background/foreground recovery on a gated room route.

The full two-session host/viewer proof is blocked, not passed. The physical account available during the sweep was an internal tester but not a Premium host session, so Watch-Party creation/entry stopped at the expected Premium gate. The emulator also did not become a reliable second app session: the existing emulator install opened an Expo development launcher, Metro initially failed on an ignored local env file being scanned as source, a restarted emulator produced a `System UI isn't responding` state, and the recovered emulator package service later hung during current-debug APK install. No fake participant, fake LiveKit state, fake room event, fake money row, or authority override was used.

## Starting State

| Item | Result |
| --- | --- |
| Starting HEAD | `013b218` |
| Branch | `main...origin/main` |
| Tracked local changes at start | None |
| Existing untracked paths | `artifacts/`, `supabase/.temp/` |
| `git diff --check` at start | Clean |
| `git diff --cached --check` at start | Clean |
| Latest stabilization commit present | Yes, `013b218` |

## Device Setup

### Physical Device

| Item | Result |
| --- | --- |
| Device id | `R5CR120QCBF` |
| Model | `SM_N986U1` |
| Package | `com.chillywood.mobile` |
| Installer | `com.android.vending` |
| Version | `1.0.0` |
| Version code | `25` |
| Install source | Google Play internal testing |
| Session role available | Signed-in internal tester; not a Premium host session |

### Emulator

| Item | Result |
| --- | --- |
| Emulator id | `emulator-5554` |
| AVD used | `Chillywood_API_34` |
| Model | `sdk_gphone64_x86_64` |
| Existing package | `com.chillywood.mobile` |
| Existing emulator app version | `1.0.0`, versionCode `8` after restart |
| Existing installer | `null` |
| Install method | Local/debug/dev-client history |
| Current-source debug build | `./gradlew assembleDebug` succeeded |
| Current-source emulator install | Blocked: ADB install hung after package service recovery |

## Proof Captured

Physical-device proof:

- `physical-watch-party-index.png/xml`: Watch-Party Live route opened and correctly showed Premium-required entry plus internal tester sandbox copy. No production money, payout, cash-out, withdrawal, transfer, or payable balance language appeared.
- `physical-live-stage-index.png/xml`: Live Stage unavailable route opened with a safe unavailable state and an `Open Party Room` recovery action.
- `physical-ticket-fixture.png/xml`: route-backed Watch-Party ticket sandbox gate showed entry/viewing-only copy, provider product `cw_watch_party_live_ticket_sandbox_099`, sandbox/not-payable labels, `canPublish=false`, `hostPower=false`, production disabled, and payout disabled.
- `physical-live-access-fixture.png/xml`: route-backed Live access pass gate showed entry/viewing-only copy, provider product `cw_live_watch_party_access_sandbox_099`, no publish/host/admin/mod authority, and all money switches off.
- `physical-live-seat-fixture.png/xml`: route-backed Live seat pass gate showed seat eligibility only, host approval required, provider product `cw_live_watch_party_seat_sandbox_099`, `canPublish=false`, `hostPower=false`, production disabled, and payout disabled.
- `physical-background-before.png` and `physical-background-after.png/xml`: app recovered to the gated Watch-Party route after background/foreground.
- `physical-filtered-logcat.txt`: filtered sample contained no LiveKit/app crash signal.

Emulator proof:

- `00-emulator-current-install.png/xml`: existing emulator install opened an Expo development build launcher, not the Play/internal app session.
- `03-emulator-after-adb-reverse.png/xml`: dev server row was visible after `adb reverse`.
- `09-emulator-exp-url-no-pkg.png/xml` and `10-emulator-after-systemui-wait.png/xml`: emulator showed `System UI isn't responding` after direct dev-client URL attempts.
- `11-emulator-package-service-failed.png`: unhealthy emulator state captured after `adb install` failed with `Can't find service: package`.
- `12-emulator-after-restart.png`: emulator restarted and package service later recovered.
- `emulator-package-after-restart.txt`: emulator still had versionCode `8`, installer `null`; the current debug APK did not install.

## Test Matrix

| # | Flow | Host device/session | Viewer device/session | Expected result | Actual result | Pass/fail | Screenshot/video path | Logs captured | Bug found | Fix made | Remaining issue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Watch-Party Live waiting room | Physical internal tester | Emulator intended | Host/viewer can reach waiting room | Physical route reached Premium-required entry; emulator session unavailable | Blocked | `physical-watch-party-index.png` | `physical-filtered-logcat.txt` | No app bug; missing Premium host plus emulator instability | None | Need Premium host account and stable second app session |
| 2 | Watch-Party Live room entry | Physical internal tester | Emulator intended | Host opens room, viewer joins | Not reachable because physical session stopped at Premium gate and emulator install/session blocked | Blocked | `physical-watch-party-index.png` | Filtered log | No | None | Needs two authenticated eligible accounts |
| 3 | Watch-Party Live viewer-only state | Physical route-backed fixture | Emulator intended | Viewer is viewer/listener unless approved | Route-backed ticket gate proved ticket is entry/viewing only and `canPublish=false`; no joined participant state | Partial | `physical-ticket-fixture.png` | XML proof | No | None | Needs real joined viewer in room |
| 4 | Watch-Party Live speaker request | Not reachable | Not reachable | Viewer can request if backed, no publish before approval | Not reachable | Blocked | None | None | No | None | Needs live room entry |
| 5 | Watch-Party Live host approval/denial | Not reachable | Not reachable | Host approval controls speaker authority | Not reachable | Blocked | None | None | No | None | Needs live room entry and host session |
| 6 | Watch-Party Live mic/camera button states | Not reachable | Not reachable | Disabled until approved | Not reachable in joined room; route-backed ticket gate proves no publish authority from ticket | Partial | `physical-ticket-fixture.png` | XML proof | No | None | Needs joined room controls |
| 7 | Watch-Party Live composer/message send | Not reachable | Not reachable | Composer works or fails gracefully | Not reachable | Blocked | None | None | No | None | Needs live room entry |
| 8 | Watch-Party Live attachment button | Not reachable | Not reachable | Attachment button works or fails gracefully | Not reachable | Blocked | None | None | No | None | Needs live room entry |
| 9 | Watch-Party Live leave/rejoin | Not reachable | Not reachable | Viewer leaves and rejoins cleanly | Not reachable | Blocked | None | None | No | None | Needs live room entry |
| 10 | Watch-Party old/stale/ended denial | Physical route proof | Emulator not needed | Denial readable, old-room handling unchanged | Live Stage unavailable and Watch-Party not-found ticket proof rendered readable route-owned states | Pass for route states | `physical-live-stage-index.png`, `physical-ticket-fixture.png` | XML proof | No | None | Specific ended/stale fixture still needs a real room |
| 11 | Live Watch-Party waiting room | Physical route proof | Emulator intended | Waiting route available | Physical Live Stage route reached unavailable state; no joined session | Partial | `physical-live-stage-index.png` | XML proof | No | None | Needs valid live room fixture |
| 12 | Live Watch-Party / Live Stage entry | Physical route proof | Emulator intended | Host/viewer enter Live Stage | Not reachable; unavailable route rendered safely | Blocked | `physical-live-stage-index.png` | XML proof | No | None | Needs valid live room and second session |
| 13 | Live Stage viewer/listener state | Physical route-backed fixture | Emulator intended | Viewer/listener until approved | Access/seat fixtures prove no host/speaker/admin/mod/publish authority from access or seat pass; no joined tile proof | Partial | `physical-live-access-fixture.png`, `physical-live-seat-fixture.png` | XML proof | No | None | Needs joined live room |
| 14 | Live Stage access pass gate | Physical route-backed fixture | Emulator not required | Access pass gate shows entry/viewing only | Gate captured with sandbox/not-payable and no authority copy | Pass | `physical-live-access-fixture.png` | XML proof | No | None | None for gate; live entry still blocked |
| 15 | Live Stage seat eligibility gate | Physical route-backed fixture | Emulator not required | Seat pass gate says eligibility only and host approval required | Gate captured with host approval required, `canPublish=false`, and no host power | Pass | `physical-live-seat-fixture.png` | XML proof | No | None | None for gate; approval runtime still blocked |
| 16 | Live Stage seat request/reserve | Not reachable | Not reachable | Seat request/reserve stays approval-gated | Not reachable | Blocked | None | None | No | None | Needs valid live room |
| 17 | Live Stage host approval/denial | Not reachable | Not reachable | Host approval controls publish | Not reachable | Blocked | None | None | No | None | Needs host session and live room |
| 18 | Live Stage `canPublish:false` before approval | Physical route-backed fixtures | Emulator intended | Payment/seat/access does not grant publish | Ticket, access, and seat route-backed gates all show `canPublish=false` | Pass for gates | `physical-ticket-fixture.png`, `physical-live-access-fixture.png`, `physical-live-seat-fixture.png` | XML proof | No | None | Needs LiveKit token/session proof in real room |
| 19 | Live Stage mic/camera before approval | Not reachable | Not reachable | Disabled before approval | Not reachable in joined room | Blocked | None | None | No | None | Needs live room entry |
| 20 | Live Stage leave/rejoin | Not reachable | Not reachable | Leave/rejoin clean | Not reachable | Blocked | None | None | No | None | Needs live room entry |
| 21 | Background/foreground recovery | Physical internal tester | N/A | Route recovers or fails gracefully | Physical device returned to Watch-Party Premium gate cleanly after background/foreground | Pass | `physical-background-before.png`, `physical-background-after.png` | None | No | None | Joined-room recovery still needs two-session proof |
| 22 | Disconnect/reconnect | Not run | Not run | Reconnect or readable failure | Not run to avoid over-stressing unstable emulator | Blocked | None | None | No | None | Needs stable emulator/second device |
| 23 | Route ownership no-change proof | Source/guards | N/A | Route ownership unchanged | No source changes to route ownership; validation passed | Pass | Docs and guards | None | No | None | None |
| 24 | LiveKit token issuer no-change proof | Source/guards | N/A | Token issuer unchanged | No LiveKit token issuer changes made; validation passed | Pass | Docs and guards | None | No | None | None |
| 25 | No money/payout regression | Physical routes/source/guards | N/A | Money remains off | Physical gates show production/payout/cash-out off; validation passed | Pass | Route screenshots/XML | None | No | None | None |

## Emulator Blocker Detail

The emulator blocker is operational/test-environment related:

- The available emulator install was a local/dev build, not the Play/internal install.
- Metro initially attempted to bundle an ignored local env file as source. The ignored file was temporarily moved out of Metro's scan path and restored after testing. No env contents are documented or committed.
- Direct dev-client launch attempts triggered a `System UI isn't responding` dialog.
- The first ADB install attempt failed with `Can't find service: package`.
- After emulator restart, `service check package` recovered, but `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` hung and did not update the emulator.
- `./gradlew assembleDebug` succeeded, so the current-source debug APK exists, but it was not installed on the emulator.

## Bugs Found

No app-code live-room bug was proven. The blockers were:

- physical session did not have Premium host access for room creation/entry;
- emulator runtime/package manager instability;
- emulator current-source install hang;
- no stable second authenticated app session.

No code fix was made because there was no proven app bug in LiveKit, route ownership, host approval, old-room handling, room controls, or room state.

## Safety Proof

Observed or preserved:

- Ticket/access/seat route-backed gates show sandbox/not-payable copy.
- Ticket grants entry/viewing only in copy and proof readout.
- Access pass grants entry/viewing only in copy and proof readout.
- Seat pass grants eligibility only and says host approval is still required.
- `canPublish=false` is visible on ticket/access/seat proof cards.
- `hostPower=false` is visible on ticket/access/seat proof cards.
- `production_enabled=false` and `payout_enabled=false` are visible on ticket/access/seat proof cards.
- No production money, payouts, cash-out, withdrawal, transfer, payable balance, Stripe Android digital checkout, fake participant, fake room state, fake provider event, fake money row, LiveKit token issuer change, or route ownership change was introduced.

## Validation

Passed final validation:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:money-access-grants-policy`
- `npm run guard:premium-sandbox-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:content-rights-policy`
- `npm run guard:navigation-terminology-policy`
- `git diff --check`
- `git diff --cached --check`

## Remaining Room Issues

- A true host/viewer Watch-Party Live proof still needs a Premium-capable host session and a stable second authenticated app session.
- A true Live Stage joined-room proof still needs a valid live room fixture, host session, and stable second authenticated app session.
- Runtime participant list, speaker request, host approval/denial, mic/camera controls, composer send, attachment behavior, leave/rejoin, and reconnect remain unproved for two live sessions.
- Route-backed gates and unavailable states are visually proved on the Play-installed physical device, but they are not a substitute for a joined-room LiveKit proof.
- Firebase Test Lab is now the preferred free cloud smoke fallback for route/gate screenshots and logcat if local emulator instability repeats. Use `npm run firebase:test-lab:preflight` before consuming quota, then `npm run firebase:test-lab:robo` only for one bounded virtual-device Robo run. Test Lab Robo proof still does not replace true two-session LiveKit host/viewer proof.
- Firebase Test Lab continuation on 2026-06-05 built the current release APK successfully, but the cloud run did not start because the active `gcloud` account was not authorized for project `chillywood-app` Test Lab catalog access. The blocker is documented in `docs/android/FIREBASE_TEST_LAB_RUNBOOK.md`; rerun preflight only after owner-approved IAM/auth is fixed.
- Firebase Test Lab IAM follow-up on 2026-06-05 cleared the catalog blocker by switching to an already-authenticated owner-approved Google user account. `npm run firebase:test-lab:preflight` passed, then one bounded `MediumPhone.arm-35-en-portrait` Robo matrix (`matrix-pcl66znev5dca`) passed in 306 seconds. Results were downloaded to `/tmp/chillywood-firebase-test-lab-iam-smoke-proof-20260605/results/MediumPhone.arm-35-en-portrait/`. This proves cloud APK upload/install/launch smoke only; it still does not replace the blocked two-session LiveKit host/viewer proof.
- Firebase Test Lab artifact review on 2026-06-05 inspected the successful `matrix-pcl66znev5dca` Robo artifacts and found no Chi'llwood crash, ANR, broken route, money leak, LiveKit issue, or route-ownership issue. Two public-surface UI/accessibility issues were fixed, then a bounded rerun passed as `matrix-1ovvi4nwvs469` on `MediumPhone.arm-35-en-portrait` in 306 seconds. Proof lives at `/tmp/chillywood-firebase-test-lab-artifact-review-fix-proof-20260605/`, and the detailed review is in `docs/android/FIREBASE_TEST_LAB_ARTIFACT_REVIEW.md`. This remains cloud smoke only and still does not replace the blocked two-session LiveKit host/viewer proof.
- Firebase Test Lab signed-in proof and artifact review on 2026-06-05 completed the cloud signed-in route-smoke layer. Matrix `matrix-3pmfaxfsjto4g` passed on `MediumPhone.arm-35-en-portrait` in 307 seconds, reached signed-in Settings/Account, Profile/Platform actions, Platform Studio, Player/fullscreen, and comments, and artifact review found no Chi'llwood crash, ANR, React Native fatal error, broken route, blank screen, stuck loading state, unsafe money/payout copy, production buy button, Stripe Android digital checkout, credential commit issue, LiveKit issue, or route-ownership issue. No app fix or rerun was needed. Detailed review: `docs/android/FIREBASE_TEST_LAB_SIGNED_IN_ARTIFACT_REVIEW.md`. This still does not replace the blocked two-session LiveKit host/viewer proof.
