# Creator Monetization Setup And Cashout Readiness

Date: 2026-06-30

Verdict: Closed for source/backend setup readiness. Installed-app proof remains Pending if the owner requires Google Play internal proof for this specific UI lane.

## Root Cause

Creator-money proof and readiness rows existed, but the creator-facing Money Center could still feel like a stale proof dashboard: key setup switches defaulted closed, cashout readiness was tied too closely to payout enablement, and Tips setup surfaced payout-provider actions instead of letting creators configure setup safely.

## Switch Changes

- `digital_sales_enabled`: `sandbox_only`
- `tips_enabled`: `sandbox_only`
- `watch_party_tickets_enabled`: `sandbox_only`
- `watch_party_seats_enabled`: `sandbox_only`
- `live_watch_party_access_enabled`: `sandbox_only`
- `live_watch_party_seats_enabled`: `sandbox_only`
- `paid_content_enabled`: `sandbox_only`
- `creator_monetization_enabled`: `sandbox_only`
- `creator_balance_visible`: `on`
- `revenuecat_google_play_enabled`: `sandbox_only`
- `provider_webhooks_enabled`: `sandbox_only`
- `stripe_connect_enabled`: `sandbox_only`
- `live_money_enabled`: `off`
- `payouts_enabled`: `off`
- production `cashoutEnabled`: `false`

## Setup Mode Result

Creator monetization setup is usable in sandbox/not-payable mode. Creator setup does not mean live money is active. Saved creator configs are sandbox/not-payable.

Money Center exposes actionable setup controls for:

- Tips
- Paid Video
- Watch-Party Ticket
- Channel Subscription
- VIP
- Event Pass

Premium remains the app-wide subscription flow. Tips, Paid Video, Watch-Party Ticket, Channel Subscription, VIP, and Event Pass are creator monetization flows.

## Cashout Readiness Result

Creators can access cashout readiness, but real cashout is not live. Cashout readiness does not execute payouts. No real payout, transfer, withdrawal, or payable balance is created. Payouts and cashout remain OFF for production money movement.

Production cashout requires Stripe/live provider approval, tax/KYC readiness, fraud/support/legal review, and owner approval.

## UI Copy Result

The Money Center now uses setup-mode copy instead of stale proved/readiness boxes:

- Creator setup mode
- Creator monetization setup is usable in sandbox/not-payable mode.
- Cashout not live yet.
- No real payout will be sent.
- Payouts and cashout remain OFF for production money movement.

## Safety Confirmation

- Production sales require owner/provider activation.
- `liveMoneyEnabled` remains OFF.
- Payouts and cashout remain OFF for production money movement.
- No real payout, transfer, withdrawal, or payable balance is created.
- No auth/RLS/money permission weakening happened.
- No provider/live-money mutation happened.
- No Stripe Android digital goods path was introduced.
- Payment does not grant LiveKit publish, host, moderator, admin, or safety-bypass authority.
