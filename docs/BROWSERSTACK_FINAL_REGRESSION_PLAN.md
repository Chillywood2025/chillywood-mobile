# BrowserStack Final Regression Plan

Last updated: June 13, 2026

## Purpose

BrowserStack is the final multi-device regression pass after cheap local/manual proof. It is not the first proof for creator monetization, purchases, LiveKit, auth, or Brand Studio.

## Required Runtime

Use a Google Play internal testing runtime:

- package `com.chillywood.mobile`
- installer `com.android.vending`
- latest internal versionCode
- app version `1.0.0`
- runtime version `1.0.0`
- not Expo Dev Launcher

Before starting BrowserStack, record:

- commit SHA
- EAS build id if a new build is used
- Google Play internal track status
- installed versionCode
- device model and Android version
- tester account labels only

Latest monetization proof runtime documented before this plan: versionCode `52`. Recheck the Play internal track before final execution.

## Device Matrix

Minimum:

| Device class | Purpose |
| --- | --- |
| Samsung current-device class | Match physical proof device behavior and One UI quirks. |
| Pixel medium screen | Baseline Android reference. |
| Older Android version | Catch OS permission, notification, and billing sheet differences. |
| Small-screen Android | Prove no cramped Money Center, auth, player, or purchase CTA overlap. |

Optional if budget allows:

- tablet
- foldable
- low-memory profile
- Android 15/16 newest image when available in BrowserStack

## Personas

Use test labels only:

- `creator_host_test`
- `paid_video_fan_test`
- `unpaid_video_fan_test`
- `watch_party_host_test`
- `watch_party_paid_fan_test`
- `watch_party_unpaid_fan_test`
- `event_creator_test`
- `event_paid_fan_test`
- `event_unpaid_fan_test`
- `channel_creator_test`
- `subscriber_fan_test`
- `nonsubscriber_fan_test`
- `vip_fan_test`
- `nonvip_fan_test`
- `blocked_fan_test` if available
- `premium_test_user` if available
- `nonpremium_test_user` if available

Passwords must come from local secure handoff only and must not be committed, logged, or placed in BrowserStack public artifacts.

## Test Suites

1. Auth email reset/signup smoke.
2. Brand Studio load/edit/save/public readback.
3. Chi'lly Chat messaging and in-app call smoke.
4. Watch-Party participant rail smoke.
5. Watch-Party / LiveKit join, leave, old-room denial, reconnect smoke.
6. Premium gate smoke.
7. Tips smoke.
8. Paid Videos smoke.
9. Paid Watch-Party Seats smoke.
10. Paid Events smoke.
11. Channel Subscriptions smoke.
12. VIP Passes smoke.
13. Money Center readback smoke.
14. Direct-link denial smoke.
15. Logged-out denial smoke.
16. Blocked-user safety smoke where fixtures exist.

## Suite Details

### Auth

- Reset password email arrives.
- Reset link opens installed app.
- Password update succeeds.
- Signup confirmation email arrives.
- Confirmation link opens installed app and verifies account.
- No link routes to public legal/support accidentally.
- No tokens in logs.

### Brand Studio

- Creator can load existing brand state.
- Safe test logo/banner/color update previews and saves.
- Reload persists.
- Public profile/channel reflects update.
- Wrong user cannot edit.

### Chi'lly Chat

- Inbox loads.
- Thread opens.
- User A sends and User B receives message.
- Voice call incoming sheet, ringtone/vibration, decline, call card.
- Video call accept routes both users into existing communication room and stops ringtone.
- Background push call notification remains pending if dispatch proof is unavailable.

### Watch-Party / LiveKit

- Watch-Party Live player opens.
- Shared player controls remain stable.
- Participant rail shows `You`, second user, and scrollable overflow.
- Comments panel remains usable.
- Join/leave/reconnect smoke passes.
- Expired room fails closed.
- Paid room direct Party Room link is gated before camera/mic/membership/presence.

### Creator Money

Each creator-money flow should be smoke-tested against existing sandbox proof or a fresh sandbox purchase only when provider state is ready:

- Tips: contribution only, no unlock/perk.
- Paid Videos: paid fan plays, unpaid/direct link locked.
- Paid Watch-Party Seats: ticket gate, paid room entry, direct-link denial, Party Waiting Room -> Party Room only.
- Paid Events: paid event access, unpaid denial.
- Channel Subscriptions: active/effective access, non-subscriber denial, expired access does not unlock.
- VIP Passes: VIP access, non-VIP denial.

Money Center must show sandbox/not-payable readback with no withdrawable or live payout claim.

## Proof Artifacts

Capture:

- screenshots
- screen recordings if available
- BrowserStack session id
- device model and Android version
- package, installer, versionCode
- sanitized logs
- test account labels only
- provider event ids / transaction ids when safe
- timestamps

Do not capture:

- passwords
- raw auth tokens
- provider secrets
- service-role values
- raw private provider payloads
- full card/payment details

## Setup Blockers To Document

If BrowserStack cannot run, document the exact blocker:

- account access
- Play internal install unavailability
- app not installable from Play/internal
- Google Play Billing unavailable in BrowserStack device
- missing license tester access
- device lacks required OS/image
- CAPTCHA/2FA/manual dashboard approval needed
- provider propagation delay

Do not replace BrowserStack with Expo Dev Launcher proof.

## Pass Criteria

BrowserStack final regression passes only when:

- no crash, ANR, blank screen, or stuck loading on required routes
- no unsafe money/live/payout copy appears
- no paid gate bypass occurs
- no Premium/creator-purchase mixing occurs
- no paid Watch-Party route goes to Live Stage
- no LiveKit authority changes from payment status
- auth links open the installed app correctly
- Money Center readbacks remain sandbox/not-payable
- all failures are either fixed or explicitly accepted as launch blockers
