# Wave 4 Abuse / Spam / Rate Limit Proof

This Wave 4 pass is an audit/proof lane for abuse, spam, throttling, duplicate prevention, and harassment-prevention controls. The follow-up fix pass adds narrowly scoped backend/database controls for the confirmed gaps without starting Wave 5.

## Scope

Covered surfaces:

- Chi'lly Chat call invite spam
- Chat message spam
- Live Stage and Watch-Party Live seat request spam
- Room creation and join spam
- Creator upload spam
- Creator-video comments, replies, reports, and DMCA form spam
- Password reset and auth email spam
- Notification and call ring loop spam
- Blocked-user harassment prevention

Out of scope:

- Account lifecycle and restore
- Admin/support operations
- Refund, revoke, or provider event proof
- LiveKit capacity cap changes
- Payment, Premium, payout, or live money behavior

## Proof Method

Primary proof command:

```sh
node scripts/proof-wave4-abuse-rate-limits.mjs
```

The script is read-only by default. It inspects source, migrations, Supabase Edge Functions, and existing proof scripts for backend enforcement and UI-only controls. It fails when an expected Wave 4 safety invariant disappears. It reports provider/operator proof gaps as `Partial` or `Pending` rather than faking success.

No abusive production load is generated. No emails, push notifications, LiveKit tokens, or call invites are sent by this script.

## Current Findings

| Area | Current control | Backend enforced? | Status |
| --- | --- | --- | --- |
| Call invite spam | Existing dispatch verifies participants, membership, audience blocks, invite status/expiry, notification dedupe, and stale-token revocation. Wave 4 adds DB active-ringing idempotency and per caller/thread/callee cooldown. | Yes | Pass |
| Chat message spam | RLS requires sender auth/thread membership. Wave 4 adds DB body trimming, non-empty and max-length checks, per-thread send throttle, duplicate-body throttle, and blocked-relationship write denial. | Yes | Pass |
| Seat request spam | Token endpoint keeps active camera/mic cap at 4. Wave 4 throttles durable Watch-Party seat-request marker messages and normal room messages. Wave 4.2 blocks seat-request markers from users blocked by the room host. | Yes for durable path | Pass |
| Room creation/join spam | Membership joins use upsert/idempotent rows; stale room guards exist. Wave 4 adds per-user room creation cooldowns for Watch-Party and communication rooms. Wave 4.2 blocks users from joining blocker-owned Live Stage and Watch-Party Live rooms. | Yes | Pass |
| Upload spam | Media storage enforces auth, type, size, scan-safe public access, and Wave 2 non-zero proof. Wave 4 adds server-side media upload URL initiation throttling. | Yes | Pass |
| Comment/reply spam | Creator-video and profile-post comment bodies have DB length checks. Wave 4 adds per-target comment cooldowns, duplicate-body cooldowns, and blocked-relationship comment denial. | Yes | Pass |
| Report/DMCA spam | DMCA intake validates required fields, attachment scope token, MIME, and 10 MB attachment limit. Wave 4 adds safety-report and public DMCA repeated-submission throttles. | Yes | Pass |
| Password reset/auth email spam | Provider-managed Supabase Auth flow; Wave 1 proved safe app fallback copy. | Provider-managed, unproved here | Pending |
| Notification/ring loop spam | Notification dedupe rows, delivery attempts, preference filtering, call/missed channels, and stale push-token revocation exist. | Yes | Pass |
| Blocked-user harassment | Profile/channel blocks and call dispatch block checks exist; Wave 4 adds blocked-relationship denial for chat-message writes and creator/profile comments. Wave 4.2 adds blocker-owned room join/token/seat-request denial and proves no room/seat-request notification is created by blocked attempts. Reports remain intentionally available for safety. | Yes for covered runtime surfaces | Pass |

## Follow-Up Fixes Added

- `abuse_rate_limit_events` is an internal, RLS-protected abuse ledger. It is not readable or writable by normal clients.
- `enforce_abuse_rate_limit(...)` is a service-role/internal helper used by triggers and server functions.
- Chi'lly Chat call invites now reject duplicate active ringing invites and throttle repeated caller/thread/callee invite creation.
- Chat messages now require non-empty bounded bodies, throttle rapid sends/duplicates, preserve thread-member RLS, and deny blocked relationships.
- Watch-Party room messages now throttle durable seat-request marker messages and normal rapid room messages.
- Watch-Party and communication room creation now have per-user cooldowns.
- Blocker-owned room membership inserts/updates now deny active/reconnecting memberships for users blocked by the room host.
- Watch-Party room messages, including durable seat-request markers, now deny users blocked by the room host.
- `livekit-token` now denies blocked users from minting Live Stage or Watch-Party Live tokens for blocker-owned rooms, even if a stale active membership exists.
- Creator-video and profile-post comments now throttle rapid/duplicate submissions and deny blocked relationships.
- Safety reports and public DMCA cases now throttle repeated submissions.
- `media-storage` now calls the internal limiter before creating upload URLs.

## Remaining Gaps / Pending Proof

- Password reset/auth email spam remains provider-managed and pending a safe inbox/operator proof path.
- Runtime mutation proof with approved proof accounts passed for call invite creation, chat messages, durable seat-request markers, room creation, media upload URL initiation, creator-video comments/replies, safety reports, public DMCA submissions, and blocked-user chat/call/comment notification prevention.
- Wave 4.2 room-level blocked-user enforcement passed for blocker-owned Live Stage and Watch-Party Live joins, stale LiveKit token attempts, seat-request markers, and room/seat-request notification prevention. Reports remain intentionally available for safety. Installed profile/platform blocked-route proof remains separate route proof if later required.

## Wave 4.1 Runtime Proof

Primary runtime proof command:

```sh
node scripts/proof-wave4-runtime-mutation-and-blocks.mjs --run
```

Latest runtime artifact:

- `/tmp/app-wave4-runtime-mutation-block-proof-20260624132830`

Runtime proof used approved local proof-account env keys and wrote sanitized JSON only. It did not print credentials, service-role keys, push tokens, LiveKit tokens, signed URLs, proof passwords, or provider secrets.

Results:

- Call invite creation: first invite allowed, duplicate active invite blocked, cooldown enforced.
- Chat messages: valid message allowed; empty, oversized, rapid, duplicate, and non-member writes blocked.
- Seat-request markers: durable marker throttle enforced.
- Room creation: Watch-Party and communication room creation cooldowns enforced; joins remain idempotent by existing policy.
- Upload URL initiation: zero-byte upload now blocks before signing; rapid upload URL initiation throttles.
- Comments/replies: valid comment/reply allowed; empty and duplicate/rapid comments blocked.
- Reports/DMCA: valid report/DMCA allowed; third same-target report/DMCA throttled.
- Blocked-user runtime: blocked chat write denied, blocked call dispatch suppresses push/ring, blocked creator-video comment denied, chat/call/comment notification creation prevented by failed source action.

## Wave 4.2 Room-Level Block Proof

Primary room-level block proof command:

```sh
node scripts/proof-wave4-room-level-blocks.mjs --run
```

Latest room-level block artifact:

- `/tmp/app-wave4-room-level-block-proof-20260624134636`

Runtime proof used approved local proof-account env keys and wrote sanitized JSON only. It did not print credentials, service-role keys, push tokens, LiveKit tokens, signed URLs, participant tokens, proof passwords, or provider secrets.

Results:

- Live Stage join: blocked viewer denied from blocker-owned room.
- Live Stage stale token: blocked viewer with pre-existing active membership denied by `livekit-token` with no participant token returned.
- Live Stage seat request: blocked viewer seat-request marker denied and host notification count unchanged.
- Watch-Party Live join: blocked viewer denied from blocker-owned shared room.
- Watch-Party Live stale token: blocked viewer with pre-existing active membership denied by `livekit-token` with no participant token returned.
- Watch-Party Live seat request: blocked viewer seat-request marker denied and host notification count unchanged.
- Unrelated viewer: join and seat-request paths preserved for both surfaces.
- Safety/report and public legal/support routes were not changed.

Bug fixed during runtime proof:

- `media-storage` accepted zero-byte upload URL requests because validation only checked maximum size. It now returns `empty_file` for `sizeBytes <= 0`.
- Creator/profile comment blocked-relationship triggers compared a text user id to a uuid owner id. The repair migration casts owner ids to text before calling the internal block helper.

## Safety

This Wave 4 fix/proof did not:

- Print secrets, credentials, push tokens, LiveKit tokens, participant tokens, signed URLs, or service-role keys.
- Generate real abusive traffic.
- Raise participant caps.
- Change payment, Premium, RevenueCat, Stripe, Google Play, payouts, live money, RLS, auth routing, scan gates, or LiveKit authority.
- Change safety/report or public legal/support route availability.
