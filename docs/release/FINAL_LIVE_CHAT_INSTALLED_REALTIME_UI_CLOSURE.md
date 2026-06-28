# Final Live + Chat Installed Realtime UI Closure

Final Live + Chat installed realtime UI closure: Closed / Partial / Blocked.

Final verdict: Partial under `docs/release/ACTUAL_USER_PROOF_STANDARD.md`.

Actual-user correction: this document previously closed a prepared/same-thread proof path. That evidence is retained as diagnostic support only. It does not close Robert's normal manual call/ring path where the receiver is outside the thread or backgrounded.

Commit `03f6d4bf191f872df54d626a3449550b8bcba1a1` was pushed to `origin/main` before this lane continued. `main` was aligned with `origin/main` before the affected Live and Chat installed realtime UI reruns.

Two physical Play-internal v57 Android clients were used:

| Device | Source | Package | Version | versionCode | Installer | Account |
| --- | --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | `proof_premium_001` |
| `R3CXA0DS5JV` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | `proof_participant_001` |

No physical phone sideload was used. No install, uninstall, reinstall, clear-data, or wipe-cache happened on either physical phone.

## Previous Partial Status

The previous two-phone installed realtime UI proof was Partial only for:

1. Live installed UI proof: one client still hit an active Premium-required/status gate or the animated Live screen could not be asserted by UIAutomator.
2. Chat Call installed UI proof: direct thread setup still hit `chat_threads` RLS.
3. Real simultaneous multi-user state: Partial only because Live UI and Chat Call UI were Partial.

Already Closed before this lane: Watch-Party backend realtime callback, Watch-Party installed UI proof, Watch-Party playback readback, Live diagnostic media proof, Chat Call diagnostic media proof, Owner/Admin/Moderator realtime controls, restricted fail-closed behavior, and publish-authority downgrade.

## Live UI Closure

Live installed UI proof: Partial.

Root cause: the remaining installed Live UI blocker was not a Premium bypass requirement after the second proof-only Premium-capable participant was prepared. The final assertion issue was Android UIAutomator failing to dump the animated Live screen because it did not reach idle state.

Fix applied:

- Used `proof_premium_001` and `proof_participant_001`.
- `proof_participant_001` used a proof-only repo-backed test entitlement path. No real purchase happened. No Google Play, RevenueCat provider configuration, Stripe, payout, refund, or provider mutation happened.
- Premium gates were not bypassed or weakened.
- Added a gated local proof-runner fallback for animated Live screens: when UIAutomator cannot dump the screen, the runner captures before/after screenshots from both physical Play-internal phones and records the Live Stage button action evidence.

Affected rerun result:

- Artifact: `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/`
- Supplemental review: `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/live-chat-closure-supplemental-review.md`
- Host before-entry screenshot: `device-a-live-stage.png` shows the host Live setup screen, shared room code, viewer count, and `Continue to Live Stage`.
- Participant before-entry screenshot: `device-b-live-stage.png` shows the participant Live setup screen, shared room code, viewer count, and `Join Live Stage`.
- Host after-entry screenshot: `device-a-live-stage-after-enter.png` shows the host Live Stage/status screen with audience count and active room controls/status.
- Participant after-entry screenshot: `device-b-live-stage-after-enter.png` shows the participant Live Stage/status screen with `2 in room`, host tile/member card, comments, reaction controls, and live status.
- The already Closed 25-seeded-participant diagnostic remains the Live media proof.

## Chat Call UI Closure

Chat Call installed UI proof: Partial.

Root cause: the runner previously created the direct chat proof state in a way that triggered current `chat_threads`/membership policy order. The direct thread itself can satisfy current RLS when created and read through authenticated proof clients in the app-backed order.

Fix applied:

- The proof runner now looks up an existing direct thread by `participant_pair_key`.
- If missing, it creates the direct thread before active-call fields.
- It uses authenticated proof clients, not service-role chat permission proof.
- It upserts missing memberships with `ignoreDuplicates` to avoid RLS update semantics on existing rows.
- It then creates the communication room/memberships and updates the active call state.
- The installed app deep link uses the resolved real thread id.

Affected rerun result:

- Artifact: `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/`
- `Chat call media installed UI`: Closed only for the narrower prepared/same-thread artifact in `two-client-installed-app-realtime-ui-summary.json`; this is not counted as actual-user Closed.
- Same-thread installed UI evidence exists in `device-a-chat-call-after-join.xml` and `device-b-chat-call-after-join.xml`.
- Both clients exposed active call/join/connection UI markers.
- `chat_threads` RLS was not weakened.
- No auth/account-status/chat permission bypass was added.
- No private messages, push tokens, LiveKit tokens, raw backend errors, or private provider data were exposed.

## Watch-Party Status

Watch-Party installed UI proof remains Closed.

Watch-Party backend realtime callback remains Closed. `watch_party_sync_events` callback was observed after the targeted Supabase Realtime migration and Realtime auth bridge fix. Playback readback matched.

## Simultaneous Multi-User State

Real simultaneous multi-user state: Partial.

Both physical Play-internal v57 Android clients were active in the final proof set. Watch-Party installed UI remains Closed. Actual-user Chat Call and Live UI remain Partial, so simultaneous state remains Partial under `docs/release/ACTUAL_USER_PROOF_STANDARD.md`.

## Owner/Admin/Moderator Realtime Controls

Owner/Admin/Moderator realtime controls remain Closed.

The same-lane two-phone proof retained the prior seeded Moderator/Admin/Owner installed UI scoped-control evidence, and the 25-participant realtime diagnostic already closed LiveKit publish-authority downgrade to viewer/no-publish. Current First Owner was not touched.

## Updated Matrix

| Flow | Status | Result |
| --- | --- | --- |
| Preflight `R5CR120QCBF` | Closed | Play-internal v57 metadata verified |
| Preflight `R3CXA0DS5JV` | Closed | Play-internal v57 metadata verified |
| Seeded UI login on both physical devices | Closed | `proof_premium_001` and `proof_participant_001` logged in through installed UI |
| Watch-Party callback recheck | Closed | preserved from prior Closed callback proof |
| Watch-Party installed UI proof | Closed | preserved from prior Closed two-phone installed UI proof |
| Chat Call installed UI proof | Partial | narrower same-thread/prepared proof exists, but normal manual call/ring/join/end still needs rerun after update uptake |
| Live installed UI proof | Partial | screenshot-backed evidence exists, but normal waiting-room/entry actual-user path still needs rerun after update uptake |
| Real simultaneous multi-user state | Partial | remains Partial because actual-user Chat Call and Live UI remain Partial |
| Owner/Admin/Moderator realtime controls | Closed | scoped controls remain safe; publish-authority downgrade remains Closed |

Matrix totals: 6 Closed, 3 Partial, 0 Blocked, 0 Failed under the actual-user correction.

Live installed UI proof: Partial.

Chat Call installed UI proof: Partial.

Watch-Party installed UI proof remains Closed.

Real simultaneous multi-user state: Partial.

Owner/Admin/Moderator realtime controls remain Closed.

## Artifact Path

Primary artifact: `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/`

Supplemental closure review: `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/live-chat-closure-supplemental-review.md`

Prior focused artifact with first Chat close and manually inspected Live screenshots: `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170023/`

## Safety Confirmation

- Two physical Play-internal v57 Android clients were used.
- No physical phone sideload was used.
- No install, uninstall, reinstall, clear-data, or wipe-cache happened.
- Premium gates were not bypassed or weakened.
- `chat_threads` RLS was not weakened.
- No auth/account-status/chat permission bypass was added.
- No service-role chat permission proof was used.
- No service-role role-authority proof happened in this lane.
- No account creation or recreation happened.
- No Play production submission happened.
- No provider mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat provider configuration, product, offering, mapping, or entitlement mutation happened.
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

Actual-user Chat Call and Live UI remain Partial until the installed app proves the normal manual paths after update uptake.

## Owner Action Items

Confirm update uptake or ship the fix in a new Play internal build, then rerun actual-user Chat Call and Live UI.

## Next Lane Recommendation

Rerun actual-user Chat Call and Live UI only.
