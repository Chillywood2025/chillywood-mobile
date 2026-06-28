# Two-Client Installed App Realtime UI Proof

Two-client installed-app realtime UI proof: Closed / Partial / Blocked.

Final verdict: Partial under `docs/release/ACTUAL_USER_PROOF_STANDARD.md`.

Actual-user correction: the earlier Closed wording below is superseded for Chat Call and Live UI. The prior same-thread/prepared Chat Call path and Live diagnostic/screenshot evidence remain diagnostic evidence, but they do not close Robert's normal manual call/ring path or normal Live waiting-room path. `docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md` is the governing current result.

Two physical Play-internal v57 Android clients were used. R3CXA0DS5JV and R5CR120QCBF were both active clients. No physical phone sideload was used, no install/uninstall/reinstall/clear-data happened, and diagnostic sideloaded emulator evidence is not accepted as Play-internal UI proof.

Watch-Party realtime callback remains Closed. The latest focused callback artifact is `/tmp/app-watch-party-realtime-callback-fix-20260627145327/`; it reached `SUBSCRIBED`, emitted after subscription readiness, observed the `watch_party_sync_events` callback, and matched playback readback.

The completed two-phone installed-app UI artifact is `/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/`.

The final Live + Chat closure artifact is `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/`.

The final Live + Chat closure doc is `docs/release/FINAL_LIVE_CHAT_INSTALLED_REALTIME_UI_CLOSURE.md`.

## Device / Client Metadata

| Client | Source | Package | Version | versionCode | Installer | Account label |
| --- | --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | `proof_premium_001` in the final Live + Chat rerun |
| `R3CXA0DS5JV` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | `proof_participant_001` in the final Live + Chat rerun |

Both devices were verified through package metadata and installed-app launch preflight. Both seeded accounts logged in through the installed app.

Both physical clients report versionCode `57`.

## Watch-Party Callback Recheck

| Check | Result |
| --- | --- |
| Channel status | `SUBSCRIBED`, then `CLOSED` during cleanup |
| Event emitted after subscription ready | Pass |
| `watch_party_sync_events` callback observed | Pass |
| Playback readback matched | Pass |
| Stale event confusion avoided | Pass |

## Realtime UI Result

| Flow | Status | Result |
| --- | --- | --- |
| Preflight `R5CR120QCBF` | Closed | Play-internal v57 metadata verified |
| Preflight `R3CXA0DS5JV` | Closed | Play-internal v57 metadata verified |
| Seeded UI login on both physical devices | Closed | both seeded proof accounts logged in through installed UI |
| Watch-Party callback recheck | Closed | callback observed and playback readback matched |
| Watch-Party sync | Closed | focused affected reruns showed expected Watch-Party installed UI markers on both physical clients while callback/readback stayed Closed |
| Chat call media | Partial | actual-user manual call initiation/ringing path is not Closed until receiver in-thread, in-app outside-thread, and background/push behavior are reproduced through the installed app after the latest runtime update is active |
| Live video participant visibility | Partial | actual-user Live UI is not Closed until both active clients enter through the normal waiting-room path without bypassing Premium gates |
| Real simultaneous multi-user state | Partial | remains Partial because actual-user Chat Call and Live UI are Partial |
| Owner/Admin/Moderator realtime controls | Closed | same-lane installed UI staff artifact reached scoped Moderator/Admin/Owner surfaces; 25-participant diagnostic closed LiveKit publish-authority downgrade to viewer/no-publish |

Live video participant visibility: Partial.

Chat call media: Partial.

Watch-Party sync: Closed.

Real simultaneous multi-user state: Partial.

Owner/Admin/Moderator realtime controls: Closed.

Matrix totals: 6 Closed, 3 Partial, 0 Blocked, 0 Failed under the actual-user correction.

## Live Video Participant Visibility

Live installed UI proof remains Partial under the actual-user standard; the prior screenshot-backed artifact is retained as diagnostic support at `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/`.

The animated Live screen did not reach Android UIAutomator idle state, so the final proof uses installed-app screenshot-backed evidence:

- `device-a-live-stage.png`: host setup screen with `Continue to Live Stage`, shared room code, and viewer count.
- `device-b-live-stage.png`: participant setup screen with `Join Live Stage`, shared room code, and viewer count.
- `device-a-live-stage-after-enter.png`: host Live Stage/status screen with audience count and active controls/status.
- `device-b-live-stage-after-enter.png`: participant Live Stage/status screen with `2 in room`, host tile/member card, comments, reaction controls, and live status.

Premium gates were not bypassed or weakened. Live media remains backed by the already Closed 25-seeded-participant diagnostic media proof.

## Chat Call Media

Chat Call installed UI proof remains Partial under the actual-user standard; the narrower same-thread/prepared artifact is retained as diagnostic support at `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/`.

The runner used authenticated proof users, reused/created the app-backed direct thread in the current policy order, and opened the resolved real thread id on both installed apps. Same-thread installed UI evidence is in `device-a-chat-call-after-join.xml` and `device-b-chat-call-after-join.xml`.

`chat_threads` RLS was not weakened. No service-role chat permission proof was used. No private messages or raw backend/provider data were exposed.

## Artifact Paths

- Two-phone installed-app UI artifact: `/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/`
- Final Live + Chat closure artifact: `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/`
- Final Live + Chat supplemental closure review: `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/live-chat-closure-supplemental-review.md`
- Latest Watch-Party callback artifact: `/tmp/app-watch-party-realtime-callback-fix-20260627145327/`
- Prior 25-participant realtime diagnostic artifact: `/tmp/app-25-seeded-participants-realtime-proof-20260627123814/`

## Safety Confirmation

- No sideload was used on either physical tester phone.
- No physical phone sideload was used.
- Diagnostic sideloaded emulator is not accepted as Play-internal UI proof.
- No uninstall/reinstall/clear-data happened.
- No install, uninstall, reinstall, clear-data, or wipe-cache happened on either physical phone.
- Premium gates were not bypassed or weakened.
- `chat_threads` RLS was not weakened.
- No auth/account-status/chat permission bypass was added.
- No service-role chat permission proof was used.
- No Play production submission happened.
- No provider mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat mapping change happened.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- No payouts/cashout/withdrawals/transfers happened.
- No Stripe Connect production happened.
- No payable balances were enabled.
- Current First Owner was not touched.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- No LiveKit tokens, push tokens, signed URLs, raw IPs, secrets, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records were committed or artifacted.

## Release Recommendation

Two-client installed-app realtime UI proof is Partial under the actual-user standard. Recommended next lane: confirm update uptake or ship the fix in the next Play internal build, then rerun actual-user Chat Call and Live UI paths only.
