-- Keep one current subscription row per creator/subscriber while cancellation
-- is pending through the paid period.

drop index if exists public."creator_channel_subscriptions_active_unique";
create unique index "creator_channel_subscriptions_active_unique"
  on public."creator_channel_subscriptions" ("offer_id", "subscriber_id")
  where "status" in ('active', 'trialing', 'grace_period', 'cancel_pending');
