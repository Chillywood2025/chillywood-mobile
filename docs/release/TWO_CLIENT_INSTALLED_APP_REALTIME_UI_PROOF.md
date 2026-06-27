# Two-Client Installed App Realtime UI Proof

Two-client installed-app realtime UI proof: Closed / Partial / Blocked.

Final verdict: Partial.

Two physical Play-internal v57 Android clients were used. R3CXA0DS5JV and R5CR120QCBF were both active clients. No physical phone sideload was used, no install/uninstall/reinstall/clear-data happened, and diagnostic sideloaded emulator evidence is not accepted as Play-internal UI proof.

Watch-Party realtime callback remains Closed. The latest focused callback artifact is `/tmp/app-watch-party-realtime-callback-fix-20260627145327/`; it reached `SUBSCRIBED`, emitted after subscription readiness, observed the `watch_party_sync_events` callback, and matched playback readback.

The completed two-phone installed-app UI artifact is `/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/`.

## Device / Client Metadata

| Client | Source | Package | Version | versionCode | Installer | Account label |
| --- | --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | `proof_participant_001` |
| `R3CXA0DS5JV` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | `proof_participant_002` |

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
| Watch-Party sync | Partial | both physical clients were used, but the completed artifact did not expose the expected Watch-Party UI marker on both clients at assertion time |
| Chat call media | Partial | direct installed-app chat-call setup hit `chat_threads` RLS; the 25-participant realtime diagnostic remains the media proof fallback |
| Live video participant visibility | Partial | installed UI reached active Premium-required/status gate for the participant accounts; the 25-participant realtime diagnostic remains the media proof fallback |
| Real simultaneous multi-user state | Partial | two active clients were used, but not every installed realtime surface closed |
| Owner/Admin/Moderator realtime controls | Closed | same-lane installed UI staff artifact reached scoped Moderator/Admin/Owner surfaces; 25-participant diagnostic closed LiveKit publish-authority downgrade to viewer/no-publish |

Live video participant visibility: Partial.

Chat call media: Partial.

Watch-Party sync: Partial.

Real simultaneous multi-user state: Partial.

Owner/Admin/Moderator realtime controls: Closed.

Matrix totals: 5 Closed, 4 Partial, 0 Blocked, 0 Failed.

## Remaining Blockers

1. Installed-app Chat call media remains Partial because the proof runner cannot create the direct chat thread through current `chat_threads` RLS without a normal app-created thread or a dedicated safe proof path.
2. Installed-app Live video participant visibility remains Partial because the participant proof accounts hit the active Premium-required gate; use Premium-capable seeded accounts or a safe proof entitlement path for a full installed UI closeout.
3. Installed-app Watch-Party sync remains Partial at the UI-marker layer even though the realtime callback and playback readback are Closed.

## Artifact Paths

- Two-phone installed-app UI artifact: `/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/`
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

Two-client installed-app realtime UI proof is Partial. Fix only the remaining installed-app realtime UI proof blockers, then rerun affected realtime flows: chat-call installed UI, Live installed UI with Premium-capable participants, and Watch-Party UI-marker assertion.
