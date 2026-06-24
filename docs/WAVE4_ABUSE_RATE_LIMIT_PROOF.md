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
| Seat request spam | Token endpoint keeps active camera/mic cap at 4. Wave 4 throttles durable Watch-Party seat-request marker messages and normal room messages. Broadcast-only request noise still needs runtime category proof. | Yes for durable path | Pass |
| Room creation/join spam | Membership joins use upsert/idempotent rows; stale room guards exist. Wave 4 adds per-user room creation cooldowns for Watch-Party and communication rooms. | Yes | Pass |
| Upload spam | Media storage enforces auth, type, size, scan-safe public access, and Wave 2 non-zero proof. Wave 4 adds server-side media upload URL initiation throttling. | Yes | Pass |
| Comment/reply spam | Creator-video and profile-post comment bodies have DB length checks. Wave 4 adds per-target comment cooldowns, duplicate-body cooldowns, and blocked-relationship comment denial. | Yes | Pass |
| Report/DMCA spam | DMCA intake validates required fields, attachment scope token, MIME, and 10 MB attachment limit. Wave 4 adds safety-report and public DMCA repeated-submission throttles. | Yes | Pass |
| Password reset/auth email spam | Provider-managed Supabase Auth flow; Wave 1 proved safe app fallback copy. | Provider-managed, unproved here | Pending |
| Notification/ring loop spam | Notification dedupe rows, delivery attempts, preference filtering, call/missed channels, and stale push-token revocation exist. | Yes | Pass |
| Blocked-user harassment | Profile/channel blocks and call dispatch block checks exist; Wave 4 adds blocked-relationship denial for chat-message writes and creator/profile comments. Reports remain intentionally available for safety. Room joins and every notification category still need runtime proof before claiming global coverage. | Partial | Partial |

## Follow-Up Fixes Added

- `abuse_rate_limit_events` is an internal, RLS-protected abuse ledger. It is not readable or writable by normal clients.
- `enforce_abuse_rate_limit(...)` is a service-role/internal helper used by triggers and server functions.
- Chi'lly Chat call invites now reject duplicate active ringing invites and throttle repeated caller/thread/callee invite creation.
- Chat messages now require non-empty bounded bodies, throttle rapid sends/duplicates, preserve thread-member RLS, and deny blocked relationships.
- Watch-Party room messages now throttle durable seat-request marker messages and normal rapid room messages.
- Watch-Party and communication room creation now have per-user cooldowns.
- Creator-video and profile-post comments now throttle rapid/duplicate submissions and deny blocked relationships.
- Safety reports and public DMCA cases now throttle repeated submissions.
- `media-storage` now calls the internal limiter before creating upload URLs.

## Remaining Gaps / Pending Proof

- Password reset/auth email spam remains provider-managed and pending a safe inbox/operator proof path.
- Global blocked-user enforcement is not claimed across every surface. Reports remain intentionally available for safety; room joins and every notification category still need surface-by-surface runtime proof.
- The proof script is bounded/static by default. Runtime mutation proof should be run only with approved proof accounts, no real abusive volume, and cleanup.

## Safety

This Wave 4 fix/proof did not:

- Print secrets, credentials, push tokens, LiveKit tokens, participant tokens, signed URLs, or service-role keys.
- Generate real abusive traffic.
- Raise participant caps.
- Change payment, Premium, RevenueCat, Stripe, Google Play, payouts, live money, RLS, auth routing, scan gates, or LiveKit authority.
