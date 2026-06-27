# Targeted Watch-Party Realtime Migration Apply

Targeted Watch-Party realtime migration apply: Closed / Partial / Blocked.

Final verdict: Closed.

Commit `2ede1d6153c8f0a0f6179d4cb6d3be9e31335241` was pushed to `origin/main` before DB apply. `origin/main` was aligned before the targeted Supabase change.

Only `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` was applied.

No unrelated pending migrations were applied.

## Migration Inspection

Targeted migration path: `supabase/migrations/20260627131501_watch_party_realtime_publication.sql`.

The migration only adds the intended Watch-Party realtime tables to the `supabase_realtime` publication. It does not drop tables. It does not weaken RLS. It does not expose private messages or private evidence. It does not alter money/provider/payout tables. It does not include unrelated schema changes.

Exact tables added to realtime publication:

| Schema | Table |
| --- | --- |
| `public` | `watch_party_rooms` |
| `public` | `watch_party_room_memberships` |
| `public` | `watch_party_room_messages` |
| `public` | `watch_party_sync_events` |

## Remote DB Preflight

Target Supabase project/environment: `bmkkhihfbmsnnmcqkoly`, the linked app backend used by the Play internal v57 build.

Preflight showed:

| Check | Result |
| --- | --- |
| Target Watch-Party tables already in `supabase_realtime` | No |
| Target migration already recorded | No |
| RLS enabled on target Watch-Party tables | Yes |
| Unrelated pending local migrations existed | Yes |
| Broad `supabase db push` used | No |

## Targeted Apply Method

The SQL body from `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` was executed directly against the target Supabase database through the Supabase SQL executor. This applied only the targeted publication configuration.

After the SQL succeeded, only migration version `20260627131501` was marked applied with:

```bash
supabase migration repair --status applied 20260627131501
```

This repaired migration history for the targeted migration only. It did not apply the older unrelated pending migrations.

## Post-Apply Verification

Post-apply verification confirmed:

| Check | Result |
| --- | --- |
| `watch_party_rooms` in `supabase_realtime` | Yes |
| `watch_party_room_memberships` in `supabase_realtime` | Yes |
| `watch_party_room_messages` in `supabase_realtime` | Yes |
| `watch_party_sync_events` in `supabase_realtime` | Yes |
| RLS remains enabled on all four target tables | Yes |
| `money_%` tables added to realtime publication | No |
| Unrelated pending migrations left untouched | Yes |
| Migration version `20260627131501` recorded | Yes |

## Watch-Party Callback Rerun

Focused callback artifact: `/tmp/app-watch-party-realtime-callback-fix-20260627145327/`.

Targeted migration apply artifact: `/tmp/app-targeted-watch-party-realtime-migration-apply-20260627-143034/`.

| Check | Result |
| --- | --- |
| Channel status | `SUBSCRIBED`, then `CLOSED` during cleanup |
| Sync event emitted after subscription ready | Yes |
| `watch_party_sync_events` callback observed / not observed | Observed |
| Playback readback matched / did not match | Playback readback matched |
| Stale event confusion avoided | Yes |
| Status | Passed |

The remaining harness-side issue was that the Node proof runner created a fresh Supabase client with an HTTP Authorization header, but Realtime sockets need authenticated Realtime state. The proof runner now reuses the signed-in client and calls `client.realtime.setAuth(accessToken)` before subscribing. No auth bypass was added.

## Two-Phone UI Proof Status

Two active Play-internal v57 Android clients were available:

| Device | Source | Package | Version | versionCode | Installer |
| --- | --- | --- | --- | --- | --- |
| `R3CXA0DS5JV` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` |
| `R5CR120QCBF` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` |

Full two-phone Play-internal installed-app UI proof was not run to Closed in this lane. The exact blocker is that the existing lane has a backend callback proof and two-device launch preflight, but no stable synchronized two-phone UI automation flow was executed for Live video participant visibility, chat-call media, Watch-Party sync, simultaneous state, and Owner/Admin/Moderator realtime controls. This is not faked or called Closed.

## Safety Confirmation

- No broad `supabase db push` was run.
- Only `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` was applied.
- No unrelated pending migrations were applied.
- No RLS weakening happened.
- No app data was mutated beyond proof room/event rows from the callback runner.
- No physical phone sideload was used.
- No APK install was used.
- No uninstall/reinstall/clear data happened.
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
- No passwords, service-role keys, Supabase keys, DB URLs with credentials, LiveKit tokens, push tokens, provider secrets, signed URLs, raw storage paths, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records were committed or artifacted.

## Next Action

Run the full two-phone installed-app realtime UI proof on `R3CXA0DS5JV` and `R5CR120QCBF` with a stable synchronized two-device UI automation flow.
