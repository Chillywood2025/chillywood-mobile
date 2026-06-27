# Watch-Party Realtime Callback Fix

Watch-Party realtime callback fix: Closed / Partial / Blocked.

Final verdict: Partial.

Previous partial result: the 25 seeded participants realtime proof reached `SUBSCRIBED` on the Watch-Party realtime channel and Watch-Party playback readback matched, but the `watch_party_sync_events` realtime callback was not observed.

Root cause classification: realtime publication/config issue.

The repo had Supabase Realtime publication migrations for Chi'lly Chat and chat-call tables, but not for the Watch-Party tables used by the installed app and diagnostic runner. The app subscribes to `watch_party_rooms`, `watch_party_room_memberships`, and `watch_party_room_messages`; the diagnostic subscribes to `watch_party_sync_events`. A new idempotent migration was added at `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` to add those Watch-Party tables to the `supabase_realtime` publication without weakening RLS.

The migration was not pushed to the remote database in this lane because `supabase migration list` showed older unrelated local migrations are also pending on the remote. A normal `supabase db push` would apply unrelated backend changes. The focused callback rerun therefore honestly remains Partial until the Watch-Party realtime publication migration is applied through the approved backend migration process.

## Investigation Result

| Check | Result |
| --- | --- |
| Listener attached before event emit | Pass |
| Waited for `SUBSCRIBED` before emit | Pass |
| Correct table | Pass: `watch_party_sync_events` |
| Correct filter | Pass: focused runner uses exact `party_id` filter |
| Stale event confusion avoided | Pass: focused runner uses a unique event id |
| Event inserted after subscription ready | Pass |
| Playback readback | Pass |
| Callback observed | Partial: `watch_party_sync_events` callback not observed |
| Root cause classification | Realtime publication/config issue |

## Callback Proof Result

Focused artifact: `/tmp/app-watch-party-realtime-callback-fix-20260627131636/`.

| Field | Result |
| --- | --- |
| Host seeded identity | `proof_participant_001` |
| Viewer seeded identity | `proof_participant_002` |
| Channel status | `SUBSCRIBED`, then `CLOSED` during cleanup |
| Subscribed before emit | Yes |
| Sync event emitted after subscription ready | Yes |
| Callback observed | No |
| `watch_party_sync_events` callback observed / not observed | Not observed |
| Playback readback matched / did not match | Playback readback matched |
| Status | `partial_callback_not_observed` |

watch_party_sync_events callback observed / not observed: not observed.

This is not called Closed because readback-only proof is not callback proof.

## Fix Applied

1. Added `supabase/migrations/20260627131501_watch_party_realtime_publication.sql`.
2. Added `scripts/local-run-watch-party-realtime-callback-proof.mjs` for a focused authenticated RLS callback rerun.
3. Tightened `scripts/local-run-25-seeded-participants-realtime-diagnostic.mjs` to filter `watch_party_sync_events` by exact `party_id` and unique event id.
4. Added proof/guard coverage for this lane.

No auth bypass was added. No RLS/account-status gate weakening happened.

## Two-Client UI Proof Status

Two active Play-internal v57 Android clients are required for full installed-app realtime UI proof.

Full installed-app two-client UI proof was not called Closed in this lane. A second Play-internal v57 Android client is now available, and non-destructive two-client launch preflight is documented in `docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md`, but the full realtime UI traversal remains Partial until the Watch-Party backend callback migration is applied and the two clients are driven through the realtime flows.

| Client | Source | Valid for Play-internal UI proof? |
| --- | --- | --- |
| `R5CR120QCBF` | Google Play internal/closed testing, versionCode `57`, installer `com.android.vending` | Yes |
| `R3CXA0DS5JV` | Google Play internal/closed testing, versionCode `57`, installer `com.android.vending` | Yes |
| `emulator-5554` | owner-approved emulator-only diagnostic sideload, versionCode `57`, installer `null` | No |

Diagnostic sideloaded emulator is not accepted as Play-internal UI proof.

## Owner Action Items

1. Apply `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` through the approved backend migration process without bundling unrelated pending migrations.
2. Rerun `node scripts/local-run-watch-party-realtime-callback-proof.mjs`.
3. Close this lane only when the callback is observed and playback readback still matches.
4. Run full two-client installed-app realtime UI traversal on `R3CXA0DS5JV` and `R5CR120QCBF` after the Watch-Party callback migration is applied.

## Safety Confirmation

- No sideload was used on the physical tester phone.
- Diagnostic sideloaded emulator is not accepted as Play-internal UI proof.
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

## Release Recommendation

Do not mark Watch-Party realtime callback proof Closed until the Watch-Party realtime publication migration is applied and the focused callback runner observes the `watch_party_sync_events` callback with matching playback readback. The next lane should apply the scoped migration or otherwise reconcile the pending remote migration history, then rerun only the Watch-Party callback proof.
