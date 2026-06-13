# Final Public V1 QA Plan

Last updated: June 13, 2026

## Scope

This plan is the final public-v1 launch-readiness QA pass after creator monetization sandbox closeout. It does not add product features, enable live money, enable payouts, change LiveKit authority, change Watch-Party routing, or mix Premium with creator purchases.

Canonical monetization closeout truth: `docs/CREATOR_MONETIZATION_SANDBOX_CLOSEOUT_AUDIT.md`.

Launch-candidate polish record: `docs/LAUNCH_CANDIDATE_POLISH_PASS.md`. That pass made small copy/logging clarity fixes only; it did not run BrowserStack, enable live money, add features, or change route/payment authority.

## Current Launch Blockers

- BrowserStack final multi-device regression has not run.
- Live money remains disabled and must stay disabled until a separate owner-approved launch lane.
- Payouts, cash-out, withdrawals, transfers, payout release, and payable creator balances remain disabled.
- Provider refund/revoke/lifecycle proof remains incomplete for several creator-money flows because safe provider tooling/order identifiers are not available.
- Channel Subscription lifecycle webhook delivery is still provider-blocked until a fresh signed RevenueCat lifecycle event is received after the handler deployment.
- Paid Watch-Party visual Money Center screenshot remains a follow-up; RPC readback passed.
- Paid Events capacity UI proof remains deferred because creator UI does not expose `capacity_limit`.
- Final auth/signup/reset, Brand Studio, Chi'lly Chat, Watch-Party/LiveKit, Premium separation, and direct-link gates still need release-candidate regression proof.
- External Google Play / legal / Data Safety / account-deletion acceptance and operational signoff remain launch-governance blockers where not separately closed.

## Safe Deferred Provider-Tooling Gaps

These do not invalidate sandbox closeout, but they block launch-live money claims:

- Paid Videos refund/revoke proof.
- Paid Watch-Party Seats refund/revoke proof.
- Paid Events refund/revoke proof.
- Channel Subscription fresh lifecycle webhook proof after deployed lifecycle handling.
- VIP Passes refund/revoke proof.
- Tips live payout/reversal operation proof.

No future proof may fake these states by manually mutating Supabase rows.

## Test Persona Labels

Credentials must live only in ignored local env files, local keychain, or another approved secret handoff. Do not commit passwords, raw tokens, provider secrets, or Google account passwords.

| Persona | Purpose | Credential rule |
| --- | --- | --- |
| `creator_host_test` | Creator Studio, Money Center, Brand Studio, creator setup | Internal/staging only |
| `paid_video_fan_test` | Paid Video purchased access | Internal/staging only |
| `unpaid_video_fan_test` | Paid Video denial | Internal/staging only |
| `watch_party_host_test` | Watch-Party room host and paid-ticket offer setup | Internal/staging only |
| `watch_party_paid_fan_test` | Paid room-ticket purchase and entry | Internal/staging only |
| `watch_party_unpaid_fan_test` | Paid room denial and direct-link denial | Internal/staging only |
| `event_creator_test` | Paid Event setup | Internal/staging only |
| `event_paid_fan_test` | Paid Event access | Internal/staging only |
| `event_unpaid_fan_test` | Paid Event denial | Internal/staging only |
| `channel_creator_test` | Channel Subscription setup/readback | Internal/staging only |
| `subscriber_fan_test` | Active subscriber state | Internal/staging only |
| `nonsubscriber_fan_test` | Subscriber-only denial | Internal/staging only |
| `vip_fan_test` | VIP access | Internal/staging only |
| `nonvip_fan_test` | VIP denial | Internal/staging only |
| `blocked_fan_test` | Blocked-user safety, if available | Internal/staging only |
| `premium_test_user` | Premium gate positive proof, if available | Internal/staging only |
| `nonpremium_test_user` | Premium gate denial proof, if available | Internal/staging only |

No fake production login bypass is allowed. No service-role key may appear in mobile code.

## Runtime Requirements

Release-candidate proof must use a Play/internal install:

- package `com.chillywood.mobile`
- installer `com.android.vending`
- versionCode equal to the latest internal candidate
- app version `1.0.0`
- runtime version `1.0.0`
- not Expo Dev Launcher

Latest monetization proof runtime currently documented: Play/internal versionCode `52` for VIP Passes V1. Before final QA execution, recheck Google Play internal track and attached device versionCode.

## Required QA Suites

### Auth Email Reset And Signup

Proof steps:

1. Trigger forgot-password reset from the Play-installed app using a dedicated disposable non-admin recovery-test inbox.
2. Confirm Brevo/Supabase delivers the reset email.
3. Tap the link on device and confirm it opens the installed app reset-password route.
4. Confirm password update succeeds.
5. Confirm the user returns to login or the correct auth state.
6. Sign in with the new password.
7. Create a new signup test account.
8. Confirm the verification email arrives.
9. Tap the verification link on device.
10. Confirm the installed app handles the auth callback and the account verifies.

Checks:

- no auth link lands on legal/support unless intentionally routed
- no tokens logged
- Brevo tracking does not break auth links
- Expo Dev Launcher is not accepted as proof
- do not use the owner's personal/internal tester inbox

### Brand Studio

Proof steps:

1. Creator opens Brand Studio.
2. Existing brand state loads.
3. Creator updates a safe test logo/banner/color.
4. Preview updates.
5. Save succeeds.
6. Reload persists.
7. Public channel/profile reflects updated brand.
8. Wrong user cannot edit.
9. RLS/admin boundaries hold.

Capture screenshots/logs.

### Chi'lly Chat

Proof steps:

1. Inbox loads with modern layout.
2. Existing thread opens.
3. User A sends message to User B.
4. User B receives message.
5. Voice call: incoming call sheet appears, ringtone/vibration works, decline works, declined call card appears.
6. Video call: accept works, both users route into the existing communication room, ringtone stops, ended call card appears.
7. Background push call notification remains pending if server dispatch is not fully proved.

Do not alter LiveKit token authority.

### Watch-Party / LiveKit

Proof steps:

1. Watch-Party Live player opens.
2. Shared player remains stable.
3. Participant rail shows `You`, a second user under `You`, and overflow scrolls inside the right rail.
4. Comments panel stays stable.
5. Bottom player controls stay stable.
6. Join/leave/reconnect smoke passes.
7. Old/expired room fails closed.
8. Paid Watch-Party direct Party Room link stays gated before camera/mic/membership/presence setup.
9. Join Now blocked states show an explicit expired/ticket/free/active-ticket outcome and do not silently fail.

Do not change route ownership or reroute to Live Stage.

### Money Center Six-Flow Regression

| Flow | Required smoke |
| --- | --- |
| Tips | Creator can enable Tips; sandbox tip proof/readback is current; no perk/access unlock; transaction remains sandbox/not-payable. |
| Paid Videos | Unpaid locked; paid fan access; second unpaid blocked; Money Center readback; refund/revoke deferred if tooling unavailable. |
| Paid Watch-Party Seats | Unpaid ticket gate; Buy Room Ticket; paid fan entry; direct-link blocked; seat limit held; Money Center readback or screenshot gap documented. |
| Paid Events | Unpaid event gate; paid access; second unpaid denied; Money Center readback; capacity/refund gaps documented. |
| Channel Subscriptions | Subscribed state; effective access fallback; non-subscriber denial; Money Center readback; lifecycle webhook delivery deferred. |
| VIP Passes | Get VIP; VIP fan access; non-VIP denial; Money Center readback; refund/revoke deferred if no safe order id. |

Global checks:

- every money row is sandbox/not-payable
- live money off
- no cash-out/withdrawal/transfer/payout release
- no mixing between Tips, Premium, Paid Videos, rooms, events, subscriptions, or VIP
- unavailable Subscribe/Get VIP cards explain the sandbox/provider blocker instead of showing a dead disabled CTA

### Google Play / Provider Readiness

Audit before paid regression:

- latest internal track versionCode
- tester opt-in and install path
- license tester status
- RevenueCat Android app products, offerings/packages where used, and entitlements
- Google Play one-time products and subscription base plans
- webhook endpoints for RevenueCat and Stripe Tips
- Stripe Connect Tips remains test/sandbox

Proof must capture package, installer, versionCode, product id/key, provider event id where purchases are run, and timestamps.

## Artifact Rules

Capture:

- screenshots
- screen recordings where useful
- sanitized logs
- device info
- package and installer
- versionCode
- test account labels only
- provider event ids and transaction/access ids where safe

Do not capture or commit passwords, tokens, raw provider payloads, service-role values, private keys, card details, or dashboard secrets.

## Go / No-Go Criteria

No-go:

- crash, blank screen, or stuck loading in primary routes
- auth reset/signup links fail or expose tokens
- Play/internal runtime is not installer `com.android.vending`
- any creator money UI claims live earnings, payout, cash-out, withdrawal, transfer, or payable balance
- Premium unlocks creator purchases or creator purchases unlock Premium
- paid Watch-Party routes to Live Stage
- unpaid direct link bypasses a paid gate
- LiveKit authority changes from payment status
- RLS/client write-denial regression

Go for public-v1 candidate review only:

- BrowserStack final regression passes or exact blockers are documented
- Play/internal runtime proof is captured
- live money and payouts remain off
- deferred provider-tooling gaps are explicitly documented
- owner/legal/store go/no-go signoff is separate and not implied by this QA plan
