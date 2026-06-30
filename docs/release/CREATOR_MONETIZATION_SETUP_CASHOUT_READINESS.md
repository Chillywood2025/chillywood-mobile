# Creator Monetization Setup And Cashout Readiness

Date: 2026-06-30

Verdict: Closed for source/backend setup readiness. Installed-app proof remains Pending if the owner requires Google Play internal proof for this specific UI lane.

## Source Route/Button Wiring

Source route/button wiring is fixed. Money Center is the single creator monetization home. `/creator-monetization-setup` is compatibility-only and lands in Money Center Offers setup. `/monetize`, `/revenue`, and `/payouts` compatibility routes land in the correct Money Center focus areas. Each creator monetization flow has a real setup action, not stale proof copy. Paid Video, Tips, Watch-Party Ticket, Channel Subscription, VIP, and Event Pass setup actions are wired to source-specific setup/save paths, the shared sandbox config helper, or the correct source setup surface. Saved config readback is wired in Money Center.

Cashout readiness is reachable, but real cashout is not live. Payout provider setup actions remain safe readiness/test actions only while production money movement is off. Premium remains the app-wide subscription flow. Source fixed is not installed-app proof.

## Creator -> Viewer Source Wiring Proof

Creator and viewer source wiring pairs are proved for each creator monetization flow. The source proof checks the creator-side setup entry, setup/edit action, approved sandbox tier, source selection/source UUID path, save helper/RPC wiring, saved config readback, and sandbox/not-payable copy. It also checks the matching viewer route/gate, locked state, exact source-scoped purchase/readback path where safe, and separation from unrelated unlocks.

- Paid Video: creator setup is reachable from Money Center and creator video edit/upload paths; viewer gate is `/player/[id]`; access readback is scoped to the exact video.
- Tips: creator setup is reachable from Money Center; viewer support action opens the creator-surface tip CTA / tip sheet; tips unlock no content, Premium, badge, room, event, LiveKit authority, or payout.
- Watch-Party Ticket: creator setup is reachable from Money Center for a valid Party Room / Watch-Party source; viewer gate is `/watch-party/[partyId]`; it routes to Party Waiting Room / Party Room and not Live Stage.
- Channel Subscription: creator setup is reachable from Money Center; viewer route is `/channel-subscription/[creatorId]`; it does not route to `/subscribe` because Premium remains the app-wide subscription flow.
- VIP: creator setup is reachable from Money Center; viewer route is `/vip-pass/[creatorId]`; VIP remains creator-specific and does not unlock Premium or other creators.
- Event Pass: creator setup is reachable from Money Center for a valid event/source; viewer route is `/event/[eventId]`; migration `20260630091500_paid_event_pass_terminal_event_status_guard.sql` denies ended, expired, canceled, removed, unsafe, and blocked event states.
- Cashout/Payout: creator readiness UI is reachable in Money Center; there is no viewer-side purchase flow and no real payout, transfer, withdrawal, or payable balance.

## Root Cause

Creator-money proof and readiness rows existed, but the creator-facing Money Center could still feel like a stale proof dashboard: key setup switches defaulted closed, cashout readiness was tied too closely to payout enablement, Tips setup surfaced payout-provider actions instead of letting creators configure setup safely, and some creator setup entry points still needed explicit route/button wiring into the real Money Center Offers and Cashout readiness areas.

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
