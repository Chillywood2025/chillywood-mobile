# Play Internal Two Phone Chat Live Proof

Play-internal two-phone Chat/Live proof: Partial.

June 28, 2026 v58 Chi'lly Chat call follow-up: `docs/release/CHILLY_CHAT_PLAY_V58_ACTUAL_USER_CALL_PROOF.md` is Partial. Both physical phones were Play-installed v58 from Google Play internal testing, but source fixed is not installed-app proof and v58 installed is not enough without actual user flow proof. The owner said the search problem was fixed separately and not to use the v58 search box again until v59. Receiver elsewhere-in-app did not show a visible app-wide incoming call banner on R5 during the captured v58 voice-call attempt, so Chat call actual-user proof remains Partial.

June 28, 2026 v59 Chi'lly Chat call follow-up: `docs/release/CHILLY_CHAT_GOOGLE_PLAY_INTERNAL_CALL_CLOSURE.md` is Partial. EAS Build `7cf16ebe-a3de-4efb-8170-63a5e9799653` and EAS Submit `0c9b2162-c259-4934-a0e8-5679f524b609` delivered versionCode `59` to Google Play internal testing. Both physical phones updated through Google Play internal and stayed signed in, but actual-user call proof remains Partial because no fresh v59 end-to-end voice/video call completed with receiver incoming state, background push/ringing, local/remote video, fullscreen fit, and call cleanup proof.

June 28, 2026 v60 Chi'lly Chat receiver banner thread-readback + video layout follow-up: `docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md` is Partial. EAS Build `8642fea7-b782-4c18-98c8-5805b6c7c20e` delivered versionCode `60` to Google Play internal testing and both physical phones updated through Google Play with installer `com.android.vending`. Visible Chat search and direct-thread open/create for `user230455` now work after authenticated RPC ambiguity fixes. A live receiver readback migration fixed the installed blocker where tapping the app-wide banner opened `This Chi'lly Chat thread could not be found.`; after the fix, the receiver tapped the banner and both phones showed `2 in call`. Source now also fixes the video layout issue where the bottom feed could be cut off by controls and participant metadata blocked too much of the feed. Two-phone call proof remains Partial because installed v60 recorded a false `Missed voice call` after the joined call ended, the cleanup/video layout source fixes are not installed in Google Play yet, and video/background/decline/missed cleanup matrices remain incomplete.

Source fixed is not installed-app proof. EAS Update published is not installed-app proof. Both physical Play-internal phones must run the updated code. One attached device cannot close two-phone proof. If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed. Out-of-scope is not an excuse to ignore visible user-facing problems.

## Repo Commit Proved

- Latest commit requested: `873bb515e73930ef1b1cb6fb047293e18ce84449`.
- Local `main` was aligned with `origin/main` before this lane.
- Latest source fixes are present in the repo:
  - Chi'lly Chat remote video renders from actual stream URL presence instead of stale `cameraOn`.
  - Direct Chat fullscreen video layout reserves bottom control/safe-area space and uses compact edge metadata.
  - Chat count copy says `in call` instead of a false all-connected claim.
  - Live room count copy says `in room`.
  - Live Stage remote video renders from stream URL presence.
  - Live host participant actions have saving/collapse/error-state guardrails.

## Delivery Method

EAS Update was published to the Play-internal runtime path:

| Field | Value |
| --- | --- |
| Branch/channel | `production` |
| Runtime | `1.0.0` |
| Update group | `ccf8ee01-efa6-4792-bd4a-bf7e015bcd36` |
| Android update ID | `019f0c20-a752-7fd2-a61e-c9fa1a27a734` |
| Commit | `873bb515e73930ef1b1cb6fb047293e18ce84449` |
| Message | `Play internal two phone chat live proof 873bb51` |

The `production` channel maps to the `production` branch and the branch lists the update group above as the latest Android update for runtime `1.0.0`.

## Device List

| Device | Role in proof | Package | Installer | Version | versionCode | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Phone A | `com.chillywood.mobile` | `com.android.vending` | `1.0.0` | `57` | Attached, app launched |
| `R3CXA0DS5JV` | Phone B | `com.chillywood.mobile` | `com.android.vending` | `1.0.0` | `57` | Attached, app launched |

No sideload, uninstall, reinstall, or clear-data happened.

## Update Pickup Evidence

| Device | Evidence | Result |
| --- | --- | --- |
| `R5CR120QCBF` | Expo Updates log after close/reopen showed `Updates state change: Check` followed by `CheckCompleteUnavailable`. Release app is not debuggable, so local Expo updates DB could not be read with `run-as`. | Active update ID could not be confirmed. |
| `R3CXA0DS5JV` | Expo Updates log after normal app launch showed `Updates state change: Check` followed by `CheckCompleteUnavailable`. Release app is not debuggable, so local Expo updates DB could not be read with `run-as`. | Active update ID could not be confirmed. |

Both devices are on Play-internal v57, and the update exists on the correct branch/runtime, but installed bundle pickup for `ccf8ee01-efa6-4792-bd4a-bf7e015bcd36` was not directly confirmed. Because source fixed is not installed-app proof and EAS Update published is not installed-app proof, this lane remains Partial.

Artifact references:

- `/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/eas-update-output.json`
- `/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/eas-update-list.json`
- `/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/eas-channel-production.json`
- `/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/update-pickup-cycle-1.log`
- `/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/update-pickup-cycle-2.log`

## Chat Video Scenario 1 Result

Status: Partial.

Supporting two-device automation was run against the installed Play app using existing sessions. The runner is supporting evidence only because it still uses proof helpers and cannot by itself close the actual-user standard.

Visible installed-app result:

- Phone A attempted the profile-to-chat path for the seeded target account.
- The visible screen showed `Profile unavailable` and did not expose a usable Chi'lly Chat entry point.
- No direct thread opened from that normal visible path.
- No manual Video Call start/ring/join/end proof was captured.
- Local and remote video on both phones were not proved in the installed app.

Artifact references:

- `/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/two-client-run/device-a-chat-thread-from-profile.png`
- `/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/two-client-run/two-client-installed-app-realtime-ui-summary.json`

## Chat Video Scenario 2 Result

Status: Partial.

Receiver-elsewhere-in-app ringing was not proved. Because Scenario 1 did not reach a direct thread and call start through the visible path, app-wide incoming call banner/status could not be closed.

## Chat Video Scenario 3 Result

Status: Partial.

Background/push ringing was not proved. No Android push/ring proof was captured. Background push/ringing is not Closed without installed-app evidence.

## Fullscreen Aspect Fit Result

Status: Partial.

Source now reserves safe-area bottom control space and keeps participant metadata compact for direct Chat fullscreen video, but no actual installed two-phone call reached the fullscreen remote-video state in this lane. Fullscreen video fit remains source-fixed and installed-app proof pending.

## Live Remote Video Result

Status: Partial.

Both phones reached active Premium-required/status surfaces during the Live proof attempt. This was expected gate behavior and was not bypassed or weakened, but it prevented Live remote video proof.

Visible installed-app evidence:

- `R5CR120QCBF`: Premium-required flow with active Premium Access status sheet.
- `R3CXA0DS5JV`: Premium-required flow with active Premium Access status sheet.
- No Live Stage remote video tile/roster proof was captured after both clients entered the same Live room.

Artifact references:

- `/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/two-client-run/device-a-live-waiting-room.png`
- `/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/two-client-run/device-b-live-waiting-room.png`

## Live Host Controls Result

Status: Partial.

The prior source fix for stuck host participant controls remains present, but this lane did not reach an installed-app Live Stage host-control state through the normal visible path. No approve/deny/mute/remove installed-app rerun was closed here.

## Watch-Party Sanity Result

Status: Not rerun in this lane.

Watch-Party backend realtime callback and installed UI proof remain referenced as prior Closed work. This lane focused on Chat video and Live remote/control proof, and did not spend the lane redoing Watch-Party.

## Cross-Lane Issues Found

| Issue | Classification | Disposition |
| --- | --- | --- |
| The Play-internal app does not expose an actual-user visible active update ID, and the release app local updates DB cannot be read non-destructively. | Should fix before launch if OTA delivery proof remains required | Documented. A future small diagnostics/readback surface could make tester update pickup explicit without source-only inference. |
| Profile-to-chat proof path hit `Profile unavailable` for the seeded target account. | Must fix before launch for actual-user Chat Call proof | Documented. Use a public/reachable actual-user profile path or a normal Chi'lly Chat inbox/start-chat path that Robert/testers can reproduce. |
| Both current logged-in Live proof accounts hit active Premium-required gates. | Not a bug / expected behavior | Documented. Live proof needs two Premium-capable accounts or an approved safe entitlement path; Premium gates were not bypassed or weakened. |
| `uiautomator dump` intermittently failed on `R5CR120QCBF` with an Android automation-service registration error. | Can wait / tooling issue | Screenshots and logcat were used instead; no destructive recovery was attempted. |

## Fixes Made

No product code fix was made in this lane because the observed blockers are delivery/update-pickup proof and account/path readiness blockers, not a newly confirmed source bug that can be safely fixed without changing gates or account state.

## Issues Documented But Not Fixed

- Confirming active Expo update ID on release builds requires either visible app-side diagnostics or visible fixed behavior.
- Chat actual-user proof needs a visible direct-chat entry path that works for the two logged-in accounts.
- Live actual-user proof needs two Premium-capable active clients or an approved proof entitlement path.
- Fullscreen RTC video fit needs an installed-app call state on both devices before it can be called Closed.

## Actual-User Proof Classification

| Surface | Classification |
| --- | --- |
| Source fixes for remote video/header copy/Live stream presence | Source Closed |
| EAS Update publication to production runtime `1.0.0` | Delivery artifact created |
| Both phones attached and Play-internal v57 installed | Closed |
| Both phones confirmed running update group `ccf8ee01-efa6-4792-bd4a-bf7e015bcd36` | Partial |
| Chat video Scenario 1 same-thread call | Partial |
| Chat video Scenario 2 receiver elsewhere in app | Partial |
| Chat video Scenario 3 background/push | Partial |
| Fullscreen RTC video fit | Partial |
| Live remote video | Partial |
| Live host controls | Partial |

## Remaining Blockers

1. Add or expose a safe installed-app update readback, or use a new Play internal build if OTA uptake cannot be verified on both phones.
2. Use two accounts that can reach each other through a normal visible Chi'lly Chat path, not a profile that returns `Profile unavailable`.
3. Use two Premium-capable Live clients or an approved proof entitlement path for Live proof.
4. Rerun actual-user two-phone Chat video and Live waiting-room/host-control paths after the above blockers are removed.

## Safety Confirmation

- No sideload, uninstall, reinstall, or clear-data happened.
- No auth/RLS/Premium/chat/account-status/staff permission weakening happened.
- No provider/live-money mutation happened.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- No Play production submission happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat provider configuration mutation happened.
- No Stripe mutation happened.
- No purchases, provider refunds, payouts, cashout, withdrawals, or transfers were executed.
- Current First Owner was not touched.
- No secrets/tokens/private data were committed or artifacted.

## Next Action

Recommended next lane: fix only the installed proof blockers by giving testers a visible update status path or shipping a new internal build, selecting two reachable Chat accounts, selecting two Premium-capable Live accounts, then rerunning only Chat video and Live host-control installed-app proof.
