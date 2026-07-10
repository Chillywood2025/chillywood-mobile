# Play Sandbox Premium HD RCA - 2026-07-09

Status: Partial. Premium HD backend delivery, protected Worker, token issuer, and resolver source are in place, but the Play-installed sandbox session used for proof was not Premium-active at backend entitlement time. Do not mark installed Premium HD complete until a Play-installed Premium-active user receives a tokenized protected Worker URL and streams 720p/1080p end to end.

## Root Cause

The installed app session resolved to Supabase user `4b5e7761-5bf1-4e18-9eb7-d6037a0eb32f`. That session refreshed at `2026-07-10T03:40:05Z`, matching the installed replay window.

For that exact user, `monetization_has_active_premium` returned `false`. The latest RevenueCat-derived Premium entitlement row was `status=expired`, `source=revenuecat`, `environment=SANDBOX`, `product_id=premium_subscription:monthly`, with `expires_at=2026-07-08T17:58:59.352Z` and backend update at `2026-07-08T18:00:46.713Z`.

RevenueCat webhook/billing rows show the sandbox purchase existed and renewed, then emitted cancellation/expiration events with `premium_granted=false`. There were no active Premium entitlement rows for the installed user at proof time.

## Identity Trace

- Supabase user id: `4b5e7761-5bf1-4e18-9eb7-d6037a0eb32f`
- RevenueCat app user id: same logical id, because the webhook maps non-anonymous RevenueCat `app_user_id` into `user_entitlements.user_id`.
- RevenueCat original app user id: not stored in backend entitlement metadata. A direct CustomerInfo API read was not available with the local proof credential, so no original-id mismatch was proved.
- Active backend Premium entitlements: `0`
- Active backend Premium subscriptions: `0`
- Backend Premium RPC: `false`

## Flow Trace

| Step | Result | Evidence |
| --- | --- | --- |
| Google Play sandbox purchase | PASS historical, inactive now | RevenueCat webhook rows include sandbox initial purchase/renewals for the installed user. |
| RevenueCat entitlement | FAIL active state | Latest backend row is expired/canceled, not active/trialing/grace. |
| App session | PASS | Installed device refreshed the same Supabase user during the replay. |
| Supabase Premium RPC | FAIL | `monetization_has_active_premium(user)=false`. |
| `premium-media-playback-token` deployed env | PASS | Deployed function returned expected `401 missing_auth` to unauthenticated probe, proving it is live and not missing required env. |
| Token issuance for installed user | FAIL by entitlement gate | Function code returns `403 premium_entitlement_required` when the Premium RPC is false. Current release does not emit function-call status in logs. |
| HD row availability | PASS | Selected HD-capable source has ready protected 720p and 1080p rows. |
| Resolver/playback | FAIL Premium, PASS fallback | Installed metadata showed `provider=origin_signed_direct`, `fallbackUsed=true`, `tokenized=false`, `protectedPlayback=false`. |
| OTA/code freshness | PASS | Play-installed v80 emitted the current redacted playback metadata fields and Expo Updates reported no newer update available. |

## Fix Status

No production code fix was applied. This was not a token issuer, Worker, HD row, or resolver implementation failure. The proof session was not Premium-active.

Required next proof step: renew or create a current Google Play / RevenueCat sandbox Premium purchase for the same installed app user, or sign into a Play-installed session whose backend `monetization_has_active_premium` is true, then rerun the installed Premium HD playback proof.

## Safety

No Premium entitlement bypass, hardcoded Premium state, fake token, public unsigned HD exposure, private/original media exposure, RevenueCat/Google Play product change, billing change, auth/RLS change, worker/cron/scheduler deployment, or media processing was performed.
