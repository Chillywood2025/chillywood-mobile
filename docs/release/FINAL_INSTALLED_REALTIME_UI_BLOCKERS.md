# Final Installed Realtime UI Blockers

Final installed realtime UI blockers: Closed / Partial / Blocked.

Final verdict: Partial under `docs/release/ACTUAL_USER_PROOF_STANDARD.md`.

Actual-user correction: the prior harness-based Closed language is superseded for Chat Call installed UI, Live installed UI, and real simultaneous multi-user state. Pre-created thread/call state, diagnostic media proof, and screenshot fallback evidence are not counted as actual-user Closed. The governing follow-up is `docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md`.

Commit `b23ee469eb6e0c33d606b45dcc2972b14dd702ee` was pushed to `origin/main` before the prior blockers lane. Commit `03f6d4bf191f872df54d626a3449550b8bcba1a1` was pushed to `origin/main` before the final Live + Chat closure lane continued.

Two physical Play-internal v57 Android clients were used:

| Device | Source | Package | Version | versionCode | Installer |
| --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` |
| `R3CXA0DS5JV` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` |

No physical phone sideload was used. No install, uninstall, reinstall, clear-data, or wipe-cache happened on either physical phone.

## Previous Partial Status

The previous installed-app realtime UI proof matrix was 6 Closed, 3 Partial, 0 Blocked, 0 Failed.

Remaining installed-app realtime UI proof blockers were:

1. Live installed UI proof: the non-Premium side still reached an active Premium-required/status gate or the animated Live screen could not be asserted.
2. Chat Call installed UI proof: direct proof setup still hit `chat_threads` RLS.
3. Real simultaneous multi-user state: Partial only because Live UI and Chat Call UI remained Partial.

Watch-Party installed UI proof was already Closed.

## Affected Rerun Results

| Area | Root cause | Fix applied | Rerun result | Artifact |
| --- | --- | --- | --- | --- |
| Chat Call installed UI proof | The prior proof did not cover Robert's normal manual call/ring path; invite dispatch failures were swallowed and receiver notification status was not shown. | `_lib/chat.ts`, `_lib/chillyChatCalls.ts`, `app/chat/[threadId].tsx`, `_lib/notifications.ts`, and `app/_layout.tsx` now expose thread-update failure, invite delivery status, caller status, and foreground incoming-call banner behavior. | Partial: code fix is published by EAS Update, but active update uptake and manual receiver ring/push were not proven in this run. | `docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md` |
| Live installed UI proof | The prior proof did not close the normal actual-user waiting-room/entry path with both active clients satisfying Premium/readiness. | Premium gates remain intact; no bypass was added. | Partial: actual-user Live UI still needs rerun through the normal waiting-room path. | `docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md` |
| Real simultaneous multi-user state | Depends on actual-user Chat Call and Live UI closure. | Recomputed under the actual-user proof standard. | Partial: Watch-Party remains Closed, while Chat Call and Live actual-user UI remain Partial. | `docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md` |

## Updated Matrix

| Flow | Status | Result |
| --- | --- | --- |
| Preflight `R5CR120QCBF` | Closed | Play-internal v57 metadata verified |
| Preflight `R3CXA0DS5JV` | Closed | Play-internal v57 metadata verified |
| Seeded UI login on both physical devices | Closed | proof accounts logged in through installed UI |
| Watch-Party callback recheck | Closed | `watch_party_sync_events` callback observed and playback readback matched |
| Watch-Party installed UI proof | Closed | both clients exposed the expected Watch-Party installed UI state |
| Chat Call installed UI proof | Partial | actual-user manual call initiation/ringing path still needs installed-app rerun after update uptake |
| Live installed UI proof | Partial | actual-user waiting-room/entry path still needs installed-app rerun with both active clients satisfying Premium/readiness |
| Real simultaneous multi-user state | Partial | remains Partial because actual-user Chat Call and Live UI remain Partial |
| Owner/Admin/Moderator realtime controls | Closed | same-lane staff UI evidence remains valid, and publish-authority downgrade remains Closed |

Matrix totals: 6 Closed, 3 Partial, 0 Blocked, 0 Failed under the actual-user correction.

Canonical realtime flow summary:

- Live video participant visibility: Partial under the actual-user proof standard.
- Chat call media: Partial under the actual-user proof standard.
- Watch-Party sync: Closed.
- Closed: both clients exposed the expected Watch-Party installed UI state.
- Real simultaneous multi-user state: Partial.

Live installed UI proof: Partial.

Chat Call installed UI proof: Partial.

Watch-Party installed UI proof: Closed.

Real simultaneous multi-user state: Partial.

Owner/Admin/Moderator realtime controls remain Closed.

## Safety Confirmation

- Premium gates were not bypassed or weakened.
- `chat_threads` RLS was not weakened.
- No auth/account-status/chat permission bypass was added.
- No service-role chat permission proof was used.
- No service-role role-authority proof was used.
- No account creation or recreation happened.
- No physical phone sideload was used.
- No install, uninstall, reinstall, clear-data, or wipe-cache happened on either physical phone.
- No Play production submission happened.
- No provider mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat products, offerings, mappings, provider configuration, or entitlements were mutated.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- No payouts/cashout/withdrawals/transfers happened.
- No Stripe Connect production happened.
- No payable balances were enabled.
- Current First Owner was not touched.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- No passwords, service-role keys, Supabase keys, DB URLs, LiveKit tokens, push tokens, provider secrets, signed URLs, raw storage paths, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records were committed or artifacted.

## Remaining Blockers

Actual-user Chat Call and Live UI remain open as Partial.

## Owner Action Items

Confirm update uptake on both Play-internal phones, then manually rerun Chat Call and Live UI through the normal visible user paths.

## Release Recommendation

Final installed realtime UI blockers are Partial under the actual-user standard. Recommended next lane: confirm update uptake or ship the fix in the next Play internal build, then rerun only actual-user Chat Call and Live UI paths.
