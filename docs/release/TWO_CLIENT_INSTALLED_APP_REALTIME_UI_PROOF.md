# Two-Client Installed App Realtime UI Proof

Two-client installed-app realtime UI proof: Closed / Partial / Blocked.

Final verdict: Partial.

Two active Play-internal v57 Android clients are now available for full installed-app realtime UI proof, but full realtime UI proof was not called Closed in this lane because the Watch-Party callback backend publication gap remains unresolved. The focused Watch-Party callback runner still showed `SUBSCRIBED` and matching playback readback but no `watch_party_sync_events` callback until `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` is applied through the approved backend migration process.

This lane performed only non-destructive package metadata and launch preflight on both Play-internal clients. It did not run a full simultaneous Live video, chat-call, Watch-Party, Owner/Admin/Moderator realtime UI traversal.

## Devices / Clients Used

| Client | Source | Package | Version | versionCode | Installer | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `R3CXA0DS5JV` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | Launch preflight captured |
| `R5CR120QCBF` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | Launch preflight captured |

Diagnostic sideloaded emulator is not accepted as Play-internal UI proof.

Artifact: `/tmp/app-two-client-installed-app-realtime-ui-proof-20260627132200/`.

## Installed Source / Version Evidence

Both physical clients report package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `57`, and installer `com.android.vending`.

No APK sideload was used on either physical tester phone. No uninstall/reinstall/clear-data happened.

## Realtime UI Result

| Flow | Status | Notes |
| --- | --- | --- |
| Live video participant visibility | Partial | not rerun through installed UI in this lane |
| Chat call media | Partial | not rerun through installed UI in this lane |
| Watch-Party sync | Partial | blocked by `watch_party_sync_events` callback publication gap |
| Real simultaneous multi-user state | Partial | not rerun through installed UI in this lane |
| Owner/Admin/Moderator realtime controls | Partial | not rerun through installed UI in this lane |

Full installed-app realtime UI proof remains Partial until the Watch-Party realtime callback is fixed on the backend and the two Play-internal v57 clients are driven through the same Live, chat-call, Watch-Party, simultaneous-state, and Owner/Admin/Moderator realtime controls.

## Safety Confirmation

- No sideload was used on either physical tester phone.
- Diagnostic sideloaded emulator is not accepted as Play-internal UI proof.
- No uninstall/reinstall/clear-data happened.
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
- No LiveKit tokens, push tokens, signed URLs, raw IPs, secrets, private messages, or private evidence were exposed.

## Next Action

Apply the scoped Watch-Party realtime publication migration or reconcile the pending remote migration history, rerun the focused Watch-Party callback proof, then run the full two-client installed-app realtime UI traversal using `R3CXA0DS5JV` and `R5CR120QCBF`.
