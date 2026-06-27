# Final Installed Realtime UI Blockers

Final installed realtime UI blockers: Closed / Partial / Blocked.

Final verdict: Partial.

Commit `b23ee469eb6e0c33d606b45dcc2972b14dd702ee` was pushed to `origin/main` before this lane. `main` was aligned with `origin/main` before the affected installed realtime UI proof reruns started.

Two physical Play-internal v57 Android clients were used:

| Device | Source | Package | Version | versionCode | Installer |
| --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` |
| `R3CXA0DS5JV` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` |

No physical phone sideload was used. No install, uninstall, reinstall, clear-data, or wipe-cache happened on either physical phone.

## Previous Partial Status

The previous installed-app realtime UI proof matrix was 5 Closed, 4 Partial, 0 Blocked, 0 Failed.

Remaining installed-app realtime UI proof blockers were:

1. Live video participant visibility: installed UI hit active Premium-required/status gates.
2. Chat call media: installed UI setup hit `chat_threads` RLS.
3. Watch-Party sync: backend callback and readback were Closed, but installed UI marker/assertion did not close on both clients.
4. Real simultaneous multi-user state: Partial only because not every installed realtime surface closed.

## Affected Rerun Results

| Area | Root cause | Fix applied | Rerun result | Artifact |
| --- | --- | --- | --- | --- |
| Watch-Party installed UI proof | Route/marker assertion timing against installed UI. Backend callback/readback were already Closed. | Reran both physical Play-internal clients with callback recheck and installed UI marker assertion after the callback fix. | Closed: both clients exposed the expected Watch-Party installed UI state, and callback/readback stayed Closed. | `/tmp/app-final-installed-realtime-ui-blockers-20260627-110519/` and `/tmp/app-final-installed-realtime-ui-blockers-participants-20260627-111028/` |
| Chat Call installed UI proof | Direct proof setup still hit `chat_threads` RLS when creating a direct thread for seeded users. | Updated the proof runner to use the app-safe direct-thread setup order: insert direct thread without active-call fields, add both memberships, create communication room/memberships, then update active call state. Reran with `proof_participant_001` + `proof_premium_001`, then with `proof_participant_001` + `proof_participant_002`. | Partial: `chat_threads` insert remained RLS-denied for the installed proof setup. `chat_threads` RLS was not weakened, and no service-role bypass was used. | `/tmp/app-final-installed-realtime-ui-blockers-20260627-110519/` and `/tmp/app-final-installed-realtime-ui-blockers-participants-20260627-111028/` |
| Live installed UI proof | Active Premium-required gate. | Reran with one Premium-capable seeded participant, `proof_premium_001`, while preserving Premium gates. | Partial: `proof_premium_001` no longer showed the Premium gate, but the other active physical client still reached the active Premium-required/status gate. Live installed UI needs two Premium-capable seeded clients or a safe existing proof entitlement path for both sides. Premium gates were not bypassed or weakened. | `/tmp/app-final-installed-realtime-ui-blockers-20260627-110519/` |
| Real simultaneous multi-user state | It depends on all installed realtime surfaces closing. | Recomputed after affected reruns. | Partial: two physical clients were active at the same time, Watch-Party UI closed, but Chat Call and Live installed UI remain Partial. | `/tmp/app-final-installed-realtime-ui-blockers-20260627-110519/` |

## Updated Matrix

| Flow | Status | Result |
| --- | --- | --- |
| Preflight `R5CR120QCBF` | Closed | Play-internal v57 metadata verified |
| Preflight `R3CXA0DS5JV` | Closed | Play-internal v57 metadata verified |
| Seeded UI login on both physical devices | Closed | seeded accounts logged in through installed UI |
| Watch-Party callback recheck | Closed | `watch_party_sync_events` callback observed and playback readback matched |
| Watch-Party installed UI proof | Closed | both physical Play-internal clients exposed expected Watch-Party UI markers |
| Chat Call installed UI proof | Partial | direct thread setup remains RLS-denied by `chat_threads`; no RLS weakening or bypass was added |
| Live installed UI proof | Partial | active Premium gate remains on the non-Premium side; one Premium proof account is not enough for two-client Live UI closeout |
| Real simultaneous multi-user state | Partial | two clients were active, but Chat Call and Live installed UI surfaces are still Partial |
| Owner/Admin/Moderator realtime controls | Closed | same-lane staff UI evidence remains valid, and publish-authority downgrade remains Closed |

Matrix totals: 6 Closed, 3 Partial, 0 Blocked, 0 Failed.

Live installed UI proof: Partial.

Chat Call installed UI proof: Partial.

Watch-Party installed UI proof: Closed.

Real simultaneous multi-user state: Partial.

Owner/Admin/Moderator realtime controls remain Closed.

## Safety Confirmation

- Premium gates were not bypassed or weakened.
- `chat_threads` RLS was not weakened.
- No auth/account-status/chat permission bypass was added.
- No service-role was used.
- No account creation or recreation happened.
- No physical phone sideload was used.
- No install, uninstall, reinstall, clear-data, or wipe-cache happened on either physical phone.
- No Play production submission happened.
- No provider mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat products, offerings, mappings, or entitlements were mutated.
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

1. Chat Call installed UI proof needs a normal app-created direct thread or an existing dedicated safe proof path that satisfies current `chat_threads` RLS. Do not use service-role as proof and do not weaken RLS.
2. Live installed UI proof needs two Premium-capable seeded clients or a safe existing proof entitlement path for both active clients. Do not bypass or weaken Premium gates.

## Owner Action Items

1. Approve or provide a second Premium-capable proof account, or approve use of an existing repo-backed proof entitlement path for one additional proof-only seeded client.
2. Provide or approve a safe app-created direct chat thread path for two seeded users if the installed UI cannot create it during automation.

## Release Recommendation

Final installed realtime UI blockers are Partial. Watch-Party installed UI is Closed. The next lane should fix only the remaining Chat Call direct-thread RLS proof path and Live two-Premium-client proof setup, then rerun those affected installed realtime UI flows.
