# Two-Client Installed App Realtime UI Proof

Two-client installed-app realtime UI proof: Closed / Partial / Blocked.

Final verdict: Partial.

Two active Play-internal v57 Android clients are now available for full installed-app realtime UI proof, and the Watch-Party callback backend publication gap is Closed in `docs/release/TARGETED_WATCH_PARTY_REALTIME_MIGRATION_APPLY.md`. Full realtime UI proof was not called Closed in this lane because a stable synchronized two-phone UI automation traversal was not executed for Live video participant visibility, chat-call media, Watch-Party sync, simultaneous state, and Owner/Admin/Moderator realtime controls.

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
| Watch-Party sync | Partial | backend callback proof is Closed; installed-app two-phone UI traversal was not executed to Closed |
| Real simultaneous multi-user state | Partial | not rerun through installed UI in this lane |
| Owner/Admin/Moderator realtime controls | Partial | not rerun through installed UI in this lane |

Full installed-app realtime UI proof remains Partial until the two Play-internal v57 clients are driven through the same Live, chat-call, Watch-Party, simultaneous-state, and Owner/Admin/Moderator realtime controls.

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

Run the full two-client installed-app realtime UI traversal using `R3CXA0DS5JV` and `R5CR120QCBF`.
