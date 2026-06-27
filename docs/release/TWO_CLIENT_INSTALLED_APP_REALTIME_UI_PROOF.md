# Two-Client Installed App Realtime UI Proof

Two-client installed-app realtime UI proof: Closed / Partial / Blocked.

Final verdict: Partial.

Two physical Play-internal v57 Android clients were used. R3CXA0DS5JV and R5CR120QCBF were both active clients. No physical phone sideload was used, no install/uninstall/reinstall/clear-data happened, and diagnostic sideloaded emulator evidence is not accepted as Play-internal UI proof.

Watch-Party realtime callback remains Closed. The latest focused callback artifact is `/tmp/app-watch-party-realtime-callback-fix-20260627145327/`; it reached `SUBSCRIBED`, emitted after subscription readiness, observed the `watch_party_sync_events` callback, and matched playback readback.

The completed two-phone installed-app UI artifact is `/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/`.

The focused final installed realtime UI blockers artifacts are `/tmp/app-final-installed-realtime-ui-blockers-20260627-110519/` and `/tmp/app-final-installed-realtime-ui-blockers-participants-20260627-111028/`.

## Device / Client Metadata

| Client | Source | Package | Version | versionCode | Installer | Account label |
| --- | --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | `proof_participant_001` |
| `R3CXA0DS5JV` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | `proof_participant_002`; `proof_premium_001` in focused Live rerun |

Both devices were verified through package metadata and installed-app launch preflight. Both seeded participant accounts logged in through the installed app.

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
| Seeded UI login on both physical devices | Closed | both seeded participant accounts logged in through installed UI |
| Watch-Party callback recheck | Closed | callback observed and playback readback matched |
| Watch-Party sync | Closed | focused affected reruns showed expected Watch-Party installed UI markers on both physical clients while callback/readback stayed Closed |
| Chat call media | Partial | direct installed-app chat-call setup still hits `chat_threads` RLS after app-safe setup-order fix; the 25-participant realtime diagnostic remains the media proof fallback |
| Live video participant visibility | Partial | installed UI still reaches an active Premium-required/status gate on the non-Premium side; the focused rerun used one Premium proof account without bypassing Premium gates |
| Real simultaneous multi-user state | Partial | two active clients were used, but not every installed realtime surface closed |
| Owner/Admin/Moderator realtime controls | Closed | same-lane installed UI staff artifact reached scoped Moderator/Admin/Owner surfaces; 25-participant diagnostic closed LiveKit publish-authority downgrade to viewer/no-publish |

Live video participant visibility: Partial.

Chat call media: Partial.

Watch-Party sync: Closed.

Real simultaneous multi-user state: Partial.

Owner/Admin/Moderator realtime controls: Closed.

Matrix totals: 6 Closed, 3 Partial, 0 Blocked, 0 Failed.

## Remaining Blockers

1. Installed-app Chat call media remains Partial because direct proof setup still hits current `chat_threads` RLS. The runner was narrowed to the app-safe setup order, and reruns with `proof_participant_001` + `proof_participant_002` and `proof_participant_001` + `proof_premium_001` still returned `new row violates row-level security policy for table "chat_threads"`. This needs a normal app-created thread or an existing dedicated safe proof path; do not weaken RLS or use service-role as proof.
2. Installed-app Live video participant visibility remains Partial because the focused rerun with `proof_premium_001` only removed the gate on one client. The other active physical client still reached the active Premium-required/status gate. This needs two Premium-capable seeded clients or a safe existing proof entitlement path for both active clients; do not bypass or weaken Premium gates.

## Artifact Paths

- Two-phone installed-app UI artifact: `/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/`
- Final installed realtime UI blockers artifact: `/tmp/app-final-installed-realtime-ui-blockers-20260627-110519/`
- Final installed realtime UI blockers participant-pair artifact: `/tmp/app-final-installed-realtime-ui-blockers-participants-20260627-111028/`
- Latest Watch-Party callback artifact: `/tmp/app-watch-party-realtime-callback-fix-20260627145327/`
- Prior 25-participant realtime diagnostic artifact: `/tmp/app-25-seeded-participants-realtime-proof-20260627123814/`

## Safety Confirmation

- No sideload was used on either physical tester phone.
- No physical phone sideload was used.
- Diagnostic sideloaded emulator is not accepted as Play-internal UI proof.
- No uninstall/reinstall/clear-data happened.
- No install, uninstall, reinstall, clear-data, or wipe-cache happened on either physical phone.
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

Two-client installed-app realtime UI proof is Partial. Watch-Party installed UI is Closed. Fix only the remaining installed-app realtime UI proof blockers, then rerun affected realtime flows: chat-call installed UI through a safe app-created direct thread path, and Live installed UI with two Premium-capable seeded clients or a safe existing proof entitlement path.
