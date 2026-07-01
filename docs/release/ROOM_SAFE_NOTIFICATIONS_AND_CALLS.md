# Room-Safe Notifications And Calls

Date: June 30, 2026

## Verdict

Source-closed. Installed-app proof is pending until a future Google Play internal build is created, installed through Google Play, and exercised on physical phones.

## Scope

This lane adds notification icon placement, in-app notification tray behavior, and room-safe Chi'lly Chat call interruption behavior across normal app surfaces, Watch-Party, Party Room, and Live Stage.

This lane does not turn Chat into the notification center. This lane does not turn notifications into chat messages. This lane does not fake notification records, unread counts, or push delivery.

## Source Result

- Notification bell is icon-only.
- Bell badge is backed by real notification unread summary.
- Normal app surfaces show the bell next to existing header actions.
- Room/live surfaces use room-safe notification tray/banner behavior.
- Important notifications remain easy to find until dismissed, handled, revoked, or expired.
- Read state does not remove important notifications.
- Dismiss hides notifications.
- Expired notifications are shown as expired/history rather than silently disappearing.
- Six creator-money flows are Important / Action Needed where actionable.
- Incoming Chi'lly Chat calls do not auto-answer.
- Incoming calls do not auto-leave or hijack room mic/camera.
- Leave room and answer requires explicit user action.
- Hosts receive an extra confirmation before leaving a hosted live room.
- Chat remains conversation-only.
- Money Center remains creator business home.
- Notifications guide users to routes; they do not grant access.
- Destination routes re-check access.
- liveMoneyEnabled remains OFF.
- Payouts and cashout remain OFF.

Remote migration `20260630130624_creator_money_notifications_activity.sql` was applied through `supabase db push` during this lane so creator-money notification preference columns, notification type checks, and the creator-money notification index are live. A follow-up `supabase db push --dry-run` reported the remote database is up to date.

## Source / Backend Audit Update

Last two notification commits were audited together: `2b125b469995038ea74253393222d10e4428b73d` and `4a549324bf9173f5718c881c5d43827658e7a4ac`. Creator-money notification records and room-safe bell/call behavior are source/backend aligned.

Remote migration status verified: `20260630130624_creator_money_notifications_activity.sql` is applied remotely, and `supabase db push --dry-run` reports the remote database is up to date.

Changed Edge functions deployed or verified unchanged: only `revenuecat-webhook` changed across the audited commits. It was deployed and verified as ACTIVE version 18. `notification-dispatch` and `notification-device-tokens` were unchanged and were not redeployed.

Installed-app proof remains pending. Source/backend readiness is not installed-app proof. Google Play internal build is still required for visible device closure.

## Files Changed

- `_lib/notifications.ts`
- `app/_layout.tsx`
- `components/notifications/notification-bell-button.tsx`
- `components/navigation/main-tab-top-bar.tsx`
- `app/(tabs)/index.tsx`
- `app/settings.tsx`
- `app/channel/[userId].tsx`
- `app/channel-settings.tsx`
- `app/watch-party/index.tsx`
- `app/watch-party/[partyId].tsx`
- `app/watch-party/live-stage/[partyId].tsx`
- `scripts/proof-notification-icon-surface-wiring.mjs`
- `scripts/proof-room-safe-notification-and-call-behavior.mjs`
- `scripts/guard-notification-room-call-policy.mjs`

## Main Surface Header Result

Home, Explore, Live, Saved, Platform, and Platform Studio use the icon-only notification bell where the header supports it. The bell reads real notification summary/list helpers and shows no badge when unread count is zero. The bell opens a tray backed by real notification records, and the tray can mark read, dismiss, and route through the existing notification path resolver.

## Room / Live Surface Result

Watch-Party Waiting Room, Party Room, and Live Stage use a room-safe notification bell/tray. Opening the tray does not leave, mute, unmute, disconnect, or permanently cover room controls. Non-urgent foreground creator-money or start-soon activity is handled as a quiet room-safe toast where safe.

The room-safe tray uses the same Important / Action Needed and Recent Activity split as Settings Activity. Chi’lly Chat calls remain call/chat-owned and do not turn Chat into a money notification ledger. Seat Pass visible wording is enforced.

## Incoming Call Result

Foreground Chi'lly Chat voice/video calls inside room/live routes show a room-safe banner with Decline, Reply in Chat, and Leave room and answer. Decline uses the existing invite status path. Reply in Chat opens Chat without answering. Leave room and answer routes into the chat call flow only after explicit user action, with hosted Live Stage copy warning that leaving may disrupt the room.

## Safety Confirmation

No auth/RLS/room/money permission weakening happened. No provider/live-money mutation happened. No Play production submission happened. No payout, transfer, withdrawal, cashout, payable balance, or provider refund was created. No notification grants access, Premium, creator-money access, or LiveKit publish/host/mod/admin authority.

## Validation

Source proof commands:

- `npm run proof:notification-icon-surface-wiring`
- `npm run proof:room-safe-notification-and-call-behavior`
- `npm run guard:notification-room-call-policy`

Full validation status is recorded in the lane final report.

## Installed Proof Status

Installed-app proof is Pending. Source fixed is not installed-app proof. A future Google Play internal lane must prove package installer `com.android.vending`, the visible bell on normal surfaces, room-safe tray/banners in Watch-Party and Live Stage, and incoming call behavior that does not auto-answer or steal mic/camera.
