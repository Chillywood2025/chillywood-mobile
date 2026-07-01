# Creator Money Notifications Activity Proof

Date: 2026-06-30

Verdict: Source-Closed; installed-app proof Pending.

## Scope

This lane integrates creator-money notifications and activity for the six creator monetization flows: Paid Video, Tips, Watch-Party Seat Pass, Channel Subscription, VIP, and Event Pass.

Creator-money notifications are backed by real notification records. Notifications guide users to routes; they do not grant access. Destination routes re-check access/grant/status. Buyer and creator notifications are separate. Money Center remains the creator business home. Chat remains conversation-only and is not the creator-money notification ledger.

Premium remains the app-wide subscription flow. Tips do not unlock anything. `liveMoneyEnabled` remains OFF. Payouts and cashout remain OFF. No real payout, transfer, withdrawal, payable balance, or provider mutation was created by notifications. Push is Android/Expo only where proven; iOS/APNs remains later unless separately implemented.

## Local UI Proof Follow-Up

June 30 local-source proof is recorded in `docs/release/LOCAL_EMULATOR_NOTIFICATIONS_MONEY_CENTER_PROOF.md`.

Local web proved Settings -> Notifications / Activity reads real records, Important / Action Needed rows remain visible after read, dismiss hides rows, a missed Chi'lly Chat call notification opens Chat without auto-answer, and the bell tray opens from normal surfaces with real unread state. Recent Activity content was fixture-limited in the local account because available rows were dominated by Important / Action Needed call rows.

This local proof is not installed-app proof. Android push/device behavior and Google-signed visible device closure remain pending for a future Play internal build.

## Data Model

Migration `20260630130624_creator_money_notifications_activity.sql` extends existing notification infrastructure instead of creating a new notification-only route family.

Changes:

- adds `creator_money_purchases_enabled` and `creator_money_sales_enabled` to `notification_preferences`
- adds notification categories `creator_money_purchase` and `creator_money_sale`
- adds buyer notification types `paid_video_unlocked`, `watch_party_ticket_ready`, `channel_subscription_active`, `vip_access_active`, `event_pass_active`, and `tip_sent_receipt`
- adds creator notification types `paid_video_sold`, `watch_party_ticket_sold`, `channel_subscription_started`, `vip_pass_sold`, `event_pass_sold`, and `tip_received`
- allows future-safe money status types without emitting fake records
- adds a focused creator-money notification index

No auth/RLS/money permission weakening happened.

## Backend Source Truth

`revenuecat-webhook` creates creator-money notifications only after verified backend money source truth exists: active provider event handling, a purchase intent, a ledger event, and a provider event id. The client does not fabricate completed purchase notifications.

Notifications are deduped through `notification_event_dedupes`. Buyer and creator records are separate. Creator self-sale notifications are suppressed. Relationship safety checks suppress money notifications where a channel audience block exists.

Notification context includes source type, source id, flow, product key, ledger/provider references, sandbox/not-payable flags, no-access-grant metadata, no-payout metadata, Premium separation, and LiveKit authority false.

## Source / Backend Audit Update

Last two notification commits were audited together: `2b125b469995038ea74253393222d10e4428b73d` and `4a549324bf9173f5718c881c5d43827658e7a4ac`. Creator-money notification records and room-safe bell/call behavior are source/backend aligned.

Remote migration status verified: `20260630130624_creator_money_notifications_activity.sql` is applied remotely, and `supabase db push --dry-run` reports the remote database is up to date.

Changed Edge functions deployed or verified unchanged: only `revenuecat-webhook` changed across the audited commits. It was deployed and verified as ACTIVE version 18. `notification-dispatch` and `notification-device-tokens` were unchanged and were not redeployed.

Installed-app proof remains pending. Source/backend readiness is not installed-app proof. Google Play internal build is still required for visible device closure.

## Buyer Notification Result

- Paid Video: `Video unlocked`, opens `/player/[id]`.
- Watch-Party Seat Pass: `Seat Pass ready`, opens `/watch-party/[partyId]` and never Live Stage.
- Channel Subscription: `Subscription active`, opens `/channel-subscription/[creatorId]`.
- VIP: `VIP access active`, opens `/vip-pass/[creatorId]`.
- Event Pass: `Event Pass active`, opens `/event/[eventId]`.
- Tips: `Tip sent`, routes to creator support receipt context and does not unlock anything.

Each destination route remains responsible for access/grant/status re-checks.

## Creator Notification Result

- Paid Video: `Paid video unlocked`, opens Money Center Transactions.
- Watch-Party Seat Pass: `Seat Pass sold`, opens Money Center Transactions.
- Channel Subscription: `New subscriber`, opens Money Center Transactions.
- VIP: `New VIP member`, opens Money Center Transactions.
- Event Pass: `Event Pass sold`, opens Money Center Transactions.
- Tips: `Tip received`, opens Money Center Transactions.

Creator copy states sandbox/not-payable status and does not promise payout, cashout, payable balance, or withdrawal.

## Routes And Deep Links

Notification route typing and deep-link normalization include:

- `/player/[id]`
- `/watch-party/[partyId]`
- `/channel-subscription/[creatorId]`
- `/vip-pass/[creatorId]`
- `/event/[eventId]`
- `/channel/[userId]`
- `/channel-studio`
- `/subscribe`
- `/chat`
- `/chat/[threadId]`
- `/settings`

Supported deep-link families include `chillywoodmobile://player/`, `watch-party/`, `channel-subscription/`, `vip-pass/`, `event/`, `channel/`, `channel-studio`, `subscribe`, `chat`, and `settings`.

## Notification Center / Activity

Settings now exposes a real Notifications / Activity readback backed by `readNotificationActivityList`, which merges active important records from `readImportantNotificationList` with recent history. Important notifications remain easy to find until dismissed, handled, revoked, or expired. Read state does not remove important notifications. Dismiss hides notifications. Expired notifications are shown as expired/history rather than silently disappearing.

Six creator-money flows are Important / Action Needed where actionable: Paid Video, Tips, Watch-Party Seat Pass, Channel Subscription, VIP, and Event Pass. Buyer access/receipt records and creator sale/support records remain separated. Chi’lly Chat calls remain call/chat-owned and do not turn Chat into a money notification ledger. Seat Pass visible wording is enforced.

The bell tray uses the same split: Important / Action Needed above Recent Activity. Empty state is honest. Chat remains separate and is not used as the money notification ledger.

## Push Status

Android/Expo push dispatch is prepared behind real notification records, notification preferences, Android token presence, dedupe, and safety eligibility. Push payloads include route/deep-link data. Installed push delivery was not run in this source lane, so push proof remains Pending/Partial until a Google Play internal build proves it on device. iOS/APNs remains later unless separately implemented.

## Flow Safety

Notifications do not grant access. Notifications do not create payouts, transfers, withdrawals, payable balances, refunds, Premium entitlements, LiveKit authority, room host/speaker/moderator/admin authority, or creator cashout.

Premium remains the app-wide subscription flow. Creator Channel Subscription remains creator-specific and does not route to `/subscribe`. Watch-Party Seat Pass routes to Party Waiting Room / Party Room, not Live Stage.

## Validation

Source proof scripts added:

- `npm run proof:creator-money-notification-routing`
- `npm run proof:creator-money-notification-records`
- `npm run proof:notification-center-money-activity`
- `npm run proof:important-notification-accessibility`
- `npm run guard:notification-money-policy`
- `npm run guard:notification-action-retention-policy`

Validation passed:

- `npm run proof:creator-money-notification-routing`
- `npm run proof:creator-money-notification-records`
- `npm run proof:notification-center-money-activity`
- `npm run proof:important-notification-accessibility`
- `npm run guard:notification-money-policy`
- `npm run guard:notification-action-retention-policy`
- `npm run proof:creator-monetization-route-button-wiring`
- `npm run guard:creator-monetization-policy`
- `npm run guard:money-center-policy`
- `npm run guard:money-access-grants-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:premium-sandbox-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:brand-spelling-policy`
- `npm run guard:route-contracts --if-present`
- `npm run typecheck`
- `npm run validate:runtime`
- `git diff --check`
- `git diff --cached --check`

Supabase validation passed:

- `supabase migration list` now shows `20260630130624_creator_money_notifications_activity.sql` applied remotely.
- `supabase db push --dry-run` reports the remote database is up to date.

## Installed-App Proof

Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. A future Google Play internal build must prove notification records, routing, Activity readback, and Android push delivery where claimed.

## Safety Confirmation

No auth/RLS/money permission weakening happened. No provider/live-money mutation happened. `liveMoneyEnabled` remains OFF. Payouts and cashout remain OFF. No real payout, transfer, withdrawal, payable balance, or provider mutation was created by notifications.
