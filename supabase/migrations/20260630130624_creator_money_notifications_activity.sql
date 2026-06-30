-- Creator-money notification/activity integration.
--
-- Notifications guide buyers and creators to the correct source route; they
-- do not grant access, create payout state, or move money. Destination routes
-- remain responsible for re-checking access/grant/status.

alter table public."notification_preferences"
  add column if not exists "creator_money_purchases_enabled" boolean default true not null,
  add column if not exists "creator_money_sales_enabled" boolean default true not null;

alter table public."notifications"
  drop constraint if exists "notifications_category_check";

alter table public."notifications"
  add constraint "notifications_category_check"
  check ("category" in (
    'creator_went_live',
    'upcoming_event_reminder',
    'new_message',
    'access_granted',
    'content_dropped',
    'reply_comment',
    'moderation_notice',
    'payment_access_confirmation',
    'chilly_chat_call',
    'chilly_chat_missed_call',
    'creator_money_purchase',
    'creator_money_sale'
  ));

alter table public."notifications"
  drop constraint if exists "notifications_notification_type_check";

alter table public."notifications"
  add constraint "notifications_notification_type_check"
  check ("notification_type" in (
    'followed_creator_live',
    'circle_friend_live',
    'event_starts_soon',
    'watch_party_starts_soon',
    'public_upload',
    'replay_later',
    'creator_went_live',
    'upcoming_event_reminder',
    'new_message',
    'access_granted',
    'content_dropped',
    'reply_comment',
    'moderation_notice',
    'payment_access_confirmation',
    'chilly_chat_call',
    'chilly_chat_missed_call',
    'paid_video_unlocked',
    'watch_party_ticket_ready',
    'channel_subscription_active',
    'vip_access_active',
    'event_pass_active',
    'tip_sent_receipt',
    'paid_video_sold',
    'watch_party_ticket_sold',
    'channel_subscription_started',
    'vip_pass_sold',
    'event_pass_sold',
    'tip_received',
    'creator_money_refunded',
    'creator_money_revoked',
    'event_pass_event_starts_soon',
    'watch_party_ticket_room_starts_soon',
    'payout_readiness_updated'
  ));

create index if not exists "notifications_creator_money_user_idx"
  on public."notifications" using btree ("user_id", "category", "created_at" desc)
  where "category" in ('creator_money_purchase', 'creator_money_sale');

comment on column public."notification_preferences"."creator_money_purchases_enabled" is
  'Allows buyer-side creator-money purchase/support in-app notification records and eligible Android push dispatch.';

comment on column public."notification_preferences"."creator_money_sales_enabled" is
  'Allows creator-side creator-money sale/support in-app notification records and eligible Android push dispatch.';

comment on index public."notifications_creator_money_user_idx" is
  'Supports real creator-money Activity reads without turning Chat into a notification ledger.';
