# Wave 4 Abuse / Spam / Rate Limit Proof

This Wave 4 pass is an audit/proof lane for abuse, spam, throttling, duplicate prevention, and harassment-prevention controls. It does not start Wave 5 and does not mutate production data.

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

The script is read-only. It inspects source, migrations, Supabase Edge Functions, and existing proof scripts for backend enforcement and UI-only controls. It fails only when an expected safety invariant disappears. It reports missing throttles as `Gap`, `Partial`, or `Pending` rather than faking success.

No abusive production load is generated. No emails, push notifications, LiveKit tokens, or call invites are sent by this script.

## Current Findings

| Area | Current control | Backend enforced? | Status |
| --- | --- | --- | --- |
| Call invite spam | Call push dispatch verifies participants, thread membership, audience blocks, invite status/expiry, notification dedupe, and stale token revocation. | Partial | Partial |
| Chat message spam | RLS requires sender auth and thread membership. App blocks empty sends. | Partial | Gap |
| Seat request spam | Token endpoint keeps active camera/mic cap at 4 and downgrades unapproved/over-cap users to viewer/no-publish. | Yes for authority | Partial |
| Room creation/join spam | Membership joins use upsert/idempotent rows; stale room guards exist. | Partial | Partial |
| Upload spam | Media storage enforces auth, type, size, scan-safe public access, and Wave 2 non-zero proof. | Yes for validation | Partial |
| Comment/reply spam | Creator-video comment DB checks require 1-500 character bodies; Wave 2 proved comment/reply/attachment safety. | Partial | Partial |
| Report/DMCA spam | DMCA intake validates required fields, attachment scope token, MIME, and 10 MB attachment limit. | Partial | Partial |
| Password reset/auth email spam | Provider-managed Supabase Auth flow; Wave 1 proved safe app fallback copy. | Provider-managed, unproved here | Pending |
| Notification/ring loop spam | Notification dedupe rows, delivery attempts, preference filtering, call/missed channels, and stale push-token revocation exist. | Yes | Pass |
| Blocked-user harassment | Profile/channel blocks and call dispatch block checks exist; notification definitions require blocked-relationship filtering. | Partial | Partial |

## Gaps

- No backend active-invite uniqueness or per-caller call invite rate limit was found.
- No backend chat message rate limit or chat body length/non-empty check was found for `chat_messages`.
- No backend per-viewer seat-request throttle was found. Publish authority remains safe, but request spam can still create host-side noise.
- No per-user room creation rate limit was found.
- No creator upload attempt rate limit or quota proof was found.
- No repeated comment/reply/report/DMCA submission throttle proof was found.
- Password reset/auth email throttling is provider-managed but not proved with a safe inbox/operator path.
- Blocked-user prevention is not proved as global across every surface, especially chat-message writes, comments, reports, and room joins.

## Safe Next Fix Candidates

Future focused fixes should be backend-side and bounded:

- Add active/ringing call invite idempotency or per-caller cooldown.
- Add DB/RPC validation for `chat_messages` non-empty body and maximum length.
- Add seat-request idempotency or per-room/per-user cooldown.
- Add room creation cooldown or quota.
- Add upload attempt quota/cooldown separate from media validation.
- Add report/DMCA dedupe or rate-limit rows.
- Expand blocked-user checks to specific surfaces after product policy is explicit.

Do not implement these by hiding buttons only. UI-only controls are not production abuse controls.

## Safety

This Wave 4 proof did not:

- Print secrets, credentials, push tokens, LiveKit tokens, participant tokens, signed URLs, or service-role keys.
- Mutate production data.
- Generate real abusive traffic.
- Raise participant caps.
- Change payment, Premium, RevenueCat, Stripe, Google Play, payouts, live money, RLS, auth routing, scan gates, or LiveKit authority.
