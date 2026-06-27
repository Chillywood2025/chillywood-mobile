# Watch-Party Realtime Callback Fix

Watch-Party realtime callback fix: Closed / Partial / Blocked.

Final verdict: Closed.

Previous partial result: the 25 seeded participants realtime proof reached `SUBSCRIBED` on the Watch-Party realtime channel and Watch-Party playback readback matched, but the `watch_party_sync_events` realtime callback was not observed.

Root cause classification: realtime publication/config issue.

The repo had Supabase Realtime publication migrations for Chi'lly Chat and chat-call tables, but not for the Watch-Party tables used by the installed app and diagnostic runner. The app subscribes to `watch_party_rooms`, `watch_party_room_memberships`, and `watch_party_room_messages`; the diagnostic subscribes to `watch_party_sync_events`. A new idempotent migration was added at `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` to add those Watch-Party tables to the `supabase_realtime` publication without weakening RLS.

The targeted migration was applied in `docs/release/TARGETED_WATCH_PARTY_REALTIME_MIGRATION_APPLY.md` without running a broad `supabase db push` and without applying unrelated pending migrations.

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
| Callback observed | Pass: `watch_party_sync_events` callback observed after targeted publication apply and runner Realtime auth fix |
| Root cause classification | Realtime publication/config issue |

## Callback Proof Result

Latest focused artifact: `/tmp/app-watch-party-realtime-callback-fix-20260627142209/`.

Prior focused artifact before apply/auth fix: `/tmp/app-watch-party-realtime-callback-fix-20260627131636/`.

| Field | Result |
| --- | --- |
| Host seeded identity | `proof_participant_001` |
| Viewer seeded identity | `proof_participant_002` |
| Channel status | `SUBSCRIBED`, then `CLOSED` during cleanup |
| Subscribed before emit | Yes |
| Sync event emitted after subscription ready | Yes |
| Callback observed | Yes |
| `watch_party_sync_events` callback observed / not observed | Observed |
| Playback readback matched / did not match | Playback readback matched |
| Status | `passed` |

watch_party_sync_events callback observed / not observed: observed.

This is called Closed because callback proof and playback readback both passed.

## Fix Applied

1. Added `supabase/migrations/20260627131501_watch_party_realtime_publication.sql`.
2. Applied only `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` to the target Supabase project.
3. Marked only migration version `20260627131501` as applied with `supabase migration repair --status applied 20260627131501`.
4. Added `scripts/local-run-watch-party-realtime-callback-proof.mjs` for a focused authenticated RLS callback rerun.
5. Fixed the local proof runner to reuse the signed-in Supabase client and call `client.realtime.setAuth(accessToken)` before subscribing.
6. Tightened `scripts/local-run-25-seeded-participants-realtime-diagnostic.mjs` to filter `watch_party_sync_events` by exact `party_id` and unique event id.
7. Added proof/guard coverage for this lane.

No auth bypass was added. No RLS/account-status gate weakening happened.

## Two-Client UI Proof Status

Two active Play-internal v57 Android clients are required for full installed-app realtime UI proof.

Full installed-app two-client UI proof was not called Closed in this lane. A second Play-internal v57 Android client is available, and non-destructive two-client launch preflight is documented in `docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md`, but the full realtime UI traversal remains Partial until the two clients are driven through the realtime flows.

| Client | Source | Valid for Play-internal UI proof? |
| --- | --- | --- |
| `R5CR120QCBF` | Google Play internal/closed testing, versionCode `57`, installer `com.android.vending` | Yes |
| `R3CXA0DS5JV` | Google Play internal/closed testing, versionCode `57`, installer `com.android.vending` | Yes |
| `emulator-5554` | owner-approved emulator-only diagnostic sideload, versionCode `57`, installer `null` | No |

Diagnostic sideloaded emulator is not accepted as Play-internal UI proof.

## Owner Action Items

1. Run full two-client installed-app realtime UI traversal on `R3CXA0DS5JV` and `R5CR120QCBF`.
2. Keep the focused Watch-Party callback proof runner available for regression checks.

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

Watch-Party realtime callback proof is Closed. The next lane should run the full two-phone installed-app realtime UI proof on `R3CXA0DS5JV` and `R5CR120QCBF`.
