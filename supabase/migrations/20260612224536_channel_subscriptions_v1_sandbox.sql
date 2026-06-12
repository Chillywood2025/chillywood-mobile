-- Channel Subscriptions V1 sandbox bridge.
-- Uses the existing RevenueCat / Google Play purchase-intent rail for recurring
-- creator channel access. This does not enable live money, payouts, Premium,
-- VIP, Paid Videos, Paid Watch-Party seats, Paid Events, Tips, LiveKit publish,
-- room authority, cash-out, withdrawal, transfer, or platform-wide badge status.

alter table public."monetization_products"
  drop constraint if exists "monetization_products_type_check";
alter table public."monetization_products"
  add constraint "monetization_products_type_check"
  check ("product_type" in (
    'premium_subscription',
    'paid_content_access',
    'watch_party_live_ticket',
    'live_watch_party_access_pass',
    'live_watch_party_seat_pass',
    'creator_tip',
    'merch_physical_good',
    'event_pass',
    'channel_subscription'
  ));

alter table public."money_purchase_intents"
  drop constraint if exists "money_purchase_intents_product_type_check";
alter table public."money_purchase_intents"
  add constraint "money_purchase_intents_product_type_check"
  check ("product_type" in (
    'paid_content_access',
    'watch_party_live_ticket',
    'live_watch_party_access_pass',
    'live_watch_party_seat_pass',
    'creator_tip',
    'event_pass',
    'merch_physical_good',
    'channel_subscription'
  ));

alter table public."money_purchase_intents"
  drop constraint if exists "money_purchase_intents_source_type_check";
alter table public."money_purchase_intents"
  add constraint "money_purchase_intents_source_type_check"
  check ("source_type" in (
    'paid_content',
    'watch_party_live',
    'live_watch_party_access',
    'live_watch_party_seat',
    'creator_tip',
    'event',
    'channel_subscription'
  ));

alter table public."access_grants"
  drop constraint if exists "access_grants_type_check";
alter table public."access_grants"
  add constraint "access_grants_type_check"
  check ("grant_type" in (
    'premium',
    'paid_content_access',
    'watch_party_live_ticket',
    'live_watch_party_access_pass',
    'live_watch_party_seat_pass',
    'creator_tip_record',
    'event_pass',
    'channel_subscription'
  ));

create table if not exists public."creator_channel_subscription_offers" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_id" uuid not null,
  "title" text not null default 'Channel subscription',
  "description" text,
  "price_cents" integer not null default 499,
  "currency" text not null default 'usd',
  "interval" text not null default 'monthly',
  "status" text not null default 'draft',
  "provider" text not null default 'revenuecat_google_play',
  "provider_product_key" text,
  "provider_product_id" text,
  "provider_entitlement_id" text,
  "subscriber_count" integer not null default 0,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_channel_subscription_offers_status_check"
    check ("status" in ('draft', 'sandbox', 'active', 'paused', 'blocked', 'archived')),
  constraint "creator_channel_subscription_offers_interval_check" check ("interval" = 'monthly'),
  constraint "creator_channel_subscription_offers_price_check" check ("price_cents" >= 0),
  constraint "creator_channel_subscription_offers_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "creator_channel_subscription_offers_provider_check" check ("provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')),
  constraint "creator_channel_subscription_offers_subscriber_count_check" check ("subscriber_count" >= 0),
  constraint "creator_channel_subscription_offers_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)'),
  constraint "creator_channel_subscription_offers_active_check"
    check ("status" <> 'active' or coalesce(("metadata"->>'live_money_enabled_at_activation')::boolean, false) = true)
);

create unique index if not exists "creator_channel_subscription_one_current_offer"
  on public."creator_channel_subscription_offers" ("creator_id")
  where "status" in ('sandbox', 'active', 'paused', 'blocked');

create table if not exists public."creator_channel_subscriptions" (
  "id" uuid primary key default gen_random_uuid(),
  "offer_id" uuid not null references public."creator_channel_subscription_offers"("id") on delete restrict,
  "creator_id" uuid not null,
  "subscriber_id" uuid not null,
  "access_grant_id" uuid references public."access_grants"("id") on delete set null,
  "provider" text not null default 'revenuecat_google_play',
  "provider_customer_id" text,
  "provider_original_transaction_id" text,
  "provider_latest_transaction_id" text,
  "status" text not null default 'active',
  "current_period_start" timestamptz,
  "current_period_end" timestamptz,
  "canceled_at" timestamptz,
  "expired_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "creator_channel_subscriptions_status_check"
    check ("status" in ('active', 'trialing', 'grace_period', 'paused', 'canceled', 'expired', 'refunded', 'revoked')),
  constraint "creator_channel_subscriptions_no_self_check" check ("creator_id" <> "subscriber_id"),
  constraint "creator_channel_subscriptions_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create unique index if not exists "creator_channel_subscriptions_active_unique"
  on public."creator_channel_subscriptions" ("offer_id", "subscriber_id")
  where "status" in ('active', 'trialing', 'grace_period');
create index if not exists "creator_channel_subscriptions_subscriber_idx"
  on public."creator_channel_subscriptions" ("subscriber_id", "status", "updated_at" desc);
create index if not exists "creator_channel_subscriptions_creator_idx"
  on public."creator_channel_subscriptions" ("creator_id", "status", "updated_at" desc);

create table if not exists public."creator_channel_subscription_transactions" (
  "id" uuid primary key default gen_random_uuid(),
  "offer_id" uuid not null references public."creator_channel_subscription_offers"("id") on delete restrict,
  "creator_id" uuid not null,
  "subscriber_id" uuid not null,
  "subscription_id" uuid references public."creator_channel_subscriptions"("id") on delete set null,
  "amount_cents" integer not null default 0,
  "currency" text not null default 'usd',
  "provider" text not null default 'revenuecat_google_play',
  "provider_product_id" text,
  "provider_transaction_id" text,
  "provider_original_transaction_id" text,
  "provider_event_id" uuid references public."provider_events"("id") on delete set null,
  "ledger_event_id" uuid references public."money_access_ledger_events"("id") on delete set null,
  "status" text not null default 'pending',
  "platform_fee_cents" integer not null default 0,
  "provider_fee_cents" integer,
  "creator_net_cents" integer,
  "payout_status" text not null default 'not_payable',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "paid_at" timestamptz,
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "creator_channel_subscription_transactions_status_check"
    check ("status" in ('pending', 'paid', 'renewal_paid', 'failed', 'canceled', 'refunded', 'revoked', 'expired')),
  constraint "creator_channel_subscription_transactions_amount_check" check ("amount_cents" >= 0),
  constraint "creator_channel_subscription_transactions_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "creator_channel_subscription_transactions_payout_check"
    check ("payout_status" in ('not_payable', 'pending_verification', 'payable', 'paid', 'refunded', 'reversed', 'chargeback')),
  constraint "creator_channel_subscription_transactions_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create unique index if not exists "creator_channel_subscription_transactions_provider_event_unique"
  on public."creator_channel_subscription_transactions" ("provider_event_id")
  where "provider_event_id" is not null;
create index if not exists "creator_channel_subscription_transactions_creator_idx"
  on public."creator_channel_subscription_transactions" ("creator_id", "created_at" desc);

create table if not exists public."creator_channel_subscription_events" (
  "id" uuid primary key default gen_random_uuid(),
  "offer_id" uuid references public."creator_channel_subscription_offers"("id") on delete set null,
  "subscription_id" uuid references public."creator_channel_subscriptions"("id") on delete set null,
  "transaction_id" uuid references public."creator_channel_subscription_transactions"("id") on delete set null,
  "actor_id" uuid,
  "event_type" text not null,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_channel_subscription_events_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

drop trigger if exists "touch_creator_channel_subscription_offers_updated_at" on public."creator_channel_subscription_offers";
create trigger "touch_creator_channel_subscription_offers_updated_at"
  before update on public."creator_channel_subscription_offers"
  for each row execute function public."touch_money_access_updated_at"();

drop trigger if exists "touch_creator_channel_subscriptions_updated_at" on public."creator_channel_subscriptions";
create trigger "touch_creator_channel_subscriptions_updated_at"
  before update on public."creator_channel_subscriptions"
  for each row execute function public."touch_money_access_updated_at"();

alter table public."creator_channel_subscription_offers" enable row level security;
alter table public."creator_channel_subscriptions" enable row level security;
alter table public."creator_channel_subscription_transactions" enable row level security;
alter table public."creator_channel_subscription_events" enable row level security;

create policy "creator_channel_subscription_offers_select_public_active"
  on public."creator_channel_subscription_offers" for select to authenticated
  using (
    "status" in ('sandbox', 'active')
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );
create policy "creator_channel_subscription_offers_write_owner_operator"
  on public."creator_channel_subscription_offers" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_channel_subscriptions_select_participant_owner_operator"
  on public."creator_channel_subscriptions" for select to authenticated
  using (
    "subscriber_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );
create policy "creator_channel_subscriptions_write_owner_operator"
  on public."creator_channel_subscriptions" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_channel_subscription_transactions_select_participant_owner_operator"
  on public."creator_channel_subscription_transactions" for select to authenticated
  using (
    "subscriber_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );
create policy "creator_channel_subscription_transactions_write_owner_operator"
  on public."creator_channel_subscription_transactions" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_channel_subscription_events_select_creator_owner_operator"
  on public."creator_channel_subscription_events" for select to authenticated
  using (
    exists (
      select 1 from public."creator_channel_subscription_offers" offer
      where offer."id" = creator_channel_subscription_events."offer_id"
        and offer."creator_id" = auth.uid()
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );
create policy "creator_channel_subscription_events_write_owner_operator"
  on public."creator_channel_subscription_events" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."creator_channel_subscription_offers" from anon, authenticated;
revoke all on table public."creator_channel_subscriptions" from anon, authenticated;
revoke all on table public."creator_channel_subscription_transactions" from anon, authenticated;
revoke all on table public."creator_channel_subscription_events" from anon, authenticated;
grant select on table public."creator_channel_subscription_offers" to authenticated;
grant select on table public."creator_channel_subscriptions" to authenticated;
grant select on table public."creator_channel_subscription_transactions" to authenticated;
grant select on table public."creator_channel_subscription_events" to authenticated;
grant all on table public."creator_channel_subscription_offers" to service_role;
grant all on table public."creator_channel_subscriptions" to service_role;
grant all on table public."creator_channel_subscription_transactions" to service_role;
grant all on table public."creator_channel_subscription_events" to service_role;

insert into public."monetization_products" (
  "product_key",
  "product_type",
  "display_name",
  "description",
  "provider",
  "provider_product_id",
  "revenuecat_entitlement",
  "environment",
  "status",
  "is_android_digital",
  "metadata"
)
values (
  'channel_subscription_sandbox_monthly_499',
  'channel_subscription',
  'Creator channel subscription sandbox',
  'Sandbox-only monthly creator channel subscription product for internal proof.',
  'revenuecat_google_play',
  'cw_channel_subscription_sandbox_monthly_499',
  'creator_channel_subscription',
  'sandbox',
  'sandbox',
  true,
  jsonb_build_object(
    'sandbox_purchase_intents_enabled', true,
    'source_policy_checked', true,
    'sandbox_only', true,
    'not_payable', true,
    'live_money_enabled_at_activation', false,
    'premium_unlock', false,
    'vip_unlock', false,
    'paid_video_unlock', false,
    'paid_watch_party_ticket_unlock', false,
    'paid_event_unlock', false,
    'platform_wide_badge', false
  )
)
on conflict ("product_key") do update
set
  "product_type" = excluded."product_type",
  "display_name" = excluded."display_name",
  "description" = excluded."description",
  "provider" = excluded."provider",
  "provider_product_id" = excluded."provider_product_id",
  "revenuecat_entitlement" = excluded."revenuecat_entitlement",
  "environment" = excluded."environment",
  "status" = excluded."status",
  "is_android_digital" = excluded."is_android_digital",
  "metadata" = excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

create or replace function public."channel_subscription_offer_safe_row"(offer_row public."creator_channel_subscription_offers")
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', offer_row."id",
    'creatorId', offer_row."creator_id",
    'title', offer_row."title",
    'description', offer_row."description",
    'priceCents', offer_row."price_cents",
    'currency', offer_row."currency",
    'interval', offer_row."interval",
    'status', offer_row."status",
    'provider', offer_row."provider",
    'providerProductKey', offer_row."provider_product_key",
    'providerProductId', offer_row."provider_product_id",
    'providerEntitlementId', offer_row."provider_entitlement_id",
    'subscriberCount', offer_row."subscriber_count",
    'createdAt', offer_row."created_at",
    'updatedAt', offer_row."updated_at"
  );
$$;

create or replace function public."set_creator_channel_subscription_offer"(
  p_title text default 'Channel subscription',
  p_description text default null,
  p_status text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_product public."monetization_products"%rowtype;
  v_status text := lower(trim(coalesce(p_status, 'sandbox')));
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_digital_switch text := coalesce((select "state" from public."platform_money_kill_switches" where "key" = 'digital_sales_enabled' limit 1), 'off');
  v_provider_switch text := coalesce((select "state" from public."platform_money_kill_switches" where "key" = 'revenuecat_google_play_enabled' limit 1), 'off');
begin
  if v_actor_id is null then
    raise exception 'auth_required';
  end if;
  if v_status not in ('draft', 'sandbox', 'paused', 'archived') then
    raise exception 'unsupported_offer_status';
  end if;
  if v_digital_switch not in ('sandbox_only', 'on') then
    raise exception 'channel_subscriptions_disabled';
  end if;
  if v_provider_switch not in ('sandbox_only', 'on') then
    raise exception 'provider_not_ready';
  end if;

  select * into v_product
  from public."monetization_products"
  where "product_key" = 'channel_subscription_sandbox_monthly_499'
    and "product_type" = 'channel_subscription'
    and "provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')
    and "environment" = 'sandbox'
    and "status" = 'sandbox'
  limit 1;

  if v_product."id" is null or nullif(trim(coalesce(v_product."provider_product_id", '')), '') is null then
    raise exception 'provider_product_missing';
  end if;

  insert into public."creator_channel_subscription_offers" (
    "creator_id",
    "title",
    "description",
    "price_cents",
    "currency",
    "interval",
    "status",
    "provider",
    "provider_product_key",
    "provider_product_id",
    "provider_entitlement_id",
    "metadata"
  )
  values (
    v_actor_id,
    coalesce(nullif(trim(p_title), ''), 'Channel subscription'),
    nullif(trim(p_description), ''),
    499,
    'usd',
    'monthly',
    v_status,
    'revenuecat_google_play',
    v_product."product_key",
    v_product."provider_product_id",
    coalesce(nullif(trim(v_product."revenuecat_entitlement"), ''), 'creator_channel_subscription'),
    jsonb_build_object(
      'sandbox_only', true,
      'not_payable', true,
      'premium_unlock', false,
      'vip_unlock', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'paid_event_unlock', false,
      'tips_path', false,
      'room_media_controls', false,
      'grants_host_authority', false,
      'platform_wide_badge', false,
      'live_money_enabled_at_save', coalesce((select "state" = 'on' from public."platform_money_kill_switches" where "key" = 'live_money_enabled'), false)
    )
  )
  on conflict ("creator_id")
  where "status" in ('sandbox', 'active', 'paused', 'blocked')
  do update set
    "title" = excluded."title",
    "description" = excluded."description",
    "price_cents" = excluded."price_cents",
    "currency" = excluded."currency",
    "interval" = excluded."interval",
    "status" = excluded."status",
    "provider" = excluded."provider",
    "provider_product_key" = excluded."provider_product_key",
    "provider_product_id" = excluded."provider_product_id",
    "provider_entitlement_id" = excluded."provider_entitlement_id",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now())
  returning * into v_offer;

  insert into public."creator_channel_subscription_events" ("offer_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_actor_id,
    'offer_saved',
    jsonb_build_object('status', v_offer."status", 'sandbox_only', true, 'not_payable', true)
  );

  return public."channel_subscription_offer_safe_row"(v_offer);
end;
$$;

create or replace function public."resolve_creator_channel_subscription_access"(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_subscription public."creator_channel_subscriptions"%rowtype;
  v_blocked boolean := false;
begin
  if p_creator_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'creator_id_required', 'requiresPurchase', false);
  end if;

  select * into v_offer
  from public."creator_channel_subscription_offers"
  where "creator_id" = p_creator_id
    and "status" in ('sandbox', 'active', 'paused', 'blocked')
  order by "updated_at" desc
  limit 1;

  if v_offer."id" is null then
    return jsonb_build_object('allowed', false, 'reason', 'subscription_not_available', 'requiresPurchase', false);
  end if;

  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'auth_required', 'requiresPurchase', true, 'offer', public."channel_subscription_offer_safe_row"(v_offer));
  end if;

  if v_user_id = p_creator_id or public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object('allowed', true, 'reason', 'creator_or_admin', 'requiresPurchase', false, 'offer', public."channel_subscription_offer_safe_row"(v_offer));
  end if;

  select exists (
    select 1
    from public."channel_audience_blocks" block_row
    where block_row."channel_user_id" = p_creator_id::text
      and block_row."blocked_user_id" = v_user_id::text
  ) into v_blocked;
  if v_blocked then
    return jsonb_build_object('allowed', false, 'reason', 'blocked_by_creator', 'requiresPurchase', false, 'offer', public."channel_subscription_offer_safe_row"(v_offer));
  end if;

  select * into v_subscription
  from public."creator_channel_subscriptions"
  where "offer_id" = v_offer."id"
    and "subscriber_id" = v_user_id
    and "status" in ('active', 'trialing', 'grace_period')
    and ("current_period_end" is null or "current_period_end" > timezone('utc'::text, now()))
    and "revoked_at" is null
    and "expired_at" is null
  order by "updated_at" desc
  limit 1;

  if v_subscription."id" is not null then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'subscription_active',
      'requiresPurchase', false,
      'subscriptionId', v_subscription."id",
      'currentPeriodEnd', v_subscription."current_period_end",
      'offer', public."channel_subscription_offer_safe_row"(v_offer)
    );
  end if;

  if v_offer."status" = 'paused' then
    return jsonb_build_object('allowed', false, 'reason', 'offer_paused', 'requiresPurchase', false, 'offer', public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if v_offer."status" in ('blocked', 'archived') then
    return jsonb_build_object('allowed', false, 'reason', 'offer_blocked', 'requiresPurchase', false, 'offer', public."channel_subscription_offer_safe_row"(v_offer));
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'subscription_required',
    'requiresPurchase', true,
    'priceCents', v_offer."price_cents",
    'currency', v_offer."currency",
    'creatorId', v_offer."creator_id",
    'provider', v_offer."provider",
    'providerProductId', v_offer."provider_product_id",
    'providerProductKey', v_offer."provider_product_key",
    'providerEntitlementId', v_offer."provider_entitlement_id",
    'offer', public."channel_subscription_offer_safe_row"(v_offer)
  );
end;
$$;

create or replace function public."create_creator_channel_subscription_purchase_intent"(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_access jsonb;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_offer
  from public."creator_channel_subscription_offers"
  where "id" = p_offer_id
  limit 1;

  if v_offer."id" is null then
    raise exception 'offer_not_found';
  end if;
  if v_offer."creator_id" = v_user_id then
    raise exception 'creator_cannot_subscribe_to_self';
  end if;

  v_access := public."resolve_creator_channel_subscription_access"(v_offer."creator_id");
  if coalesce((v_access->>'allowed')::boolean, false) then
    return jsonb_build_object('alreadySubscribed', true, 'access', v_access);
  end if;
  if coalesce((v_access->>'requiresPurchase')::boolean, false) is not true then
    raise exception '%', coalesce(v_access->>'reason', 'subscription_not_available');
  end if;

  return public."create_money_purchase_intent"(
    'channel_subscription_sandbox_monthly_499',
    'channel_subscription',
    v_offer."id",
    jsonb_build_object(
      'creator_id', v_offer."creator_id",
      'amount_minor', v_offer."price_cents",
      'currency', v_offer."currency",
      'source_surface', 'creator_channel_header',
      'channel_subscription_offer_id', v_offer."id",
      'channel_subscriptions_v1', true,
      'premium_unlock', false,
      'vip_unlock', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'paid_event_unlock', false,
      'tips_path', false,
      'room_media_controls', false,
      'grants_host_authority', false,
      'platform_wide_badge', false
    )
  );
end;
$$;

create or replace function public."sync_creator_channel_subscription_from_access_grant"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_subscription public."creator_channel_subscriptions"%rowtype;
  v_transaction public."creator_channel_subscription_transactions"%rowtype;
  v_active boolean;
  v_next_status text;
begin
  if new."grant_type" <> 'channel_subscription' or new."source_id" is null then
    return new;
  end if;

  select * into v_offer
  from public."creator_channel_subscription_offers"
  where "id" = new."source_id"
  limit 1;
  if v_offer."id" is null then
    return new;
  end if;

  select * into v_provider
  from public."provider_events"
  where "id" = new."provider_event_id"
  limit 1;

  select * into v_ledger
  from public."money_access_ledger_events"
  where "provider_event_id" = new."provider_event_id"
  limit 1;

  v_active := new."status" in ('active', 'sandbox_only')
    and new."refunded_at" is null
    and new."revoked_at" is null
    and new."starts_at" <= timezone('utc'::text, now())
    and (new."expires_at" is null or new."expires_at" > timezone('utc'::text, now()));

  v_next_status := case
    when v_active then 'active'
    when new."status" = 'refunded' then 'refunded'
    when new."status" = 'revoked' then 'revoked'
    when new."status" = 'expired' then 'expired'
    else 'expired'
  end;

  insert into public."creator_channel_subscription_transactions" (
    "offer_id",
    "creator_id",
    "subscriber_id",
    "amount_cents",
    "currency",
    "provider",
    "provider_product_id",
    "provider_transaction_id",
    "provider_original_transaction_id",
    "provider_event_id",
    "ledger_event_id",
    "status",
    "payout_status",
    "paid_at",
    "metadata"
  )
  values (
    v_offer."id",
    v_offer."creator_id",
    new."user_id",
    coalesce(v_ledger."amount_minor", v_offer."price_cents"),
    coalesce(v_ledger."currency", v_offer."currency"),
    coalesce(new."provider", 'revenuecat_google_play'),
    coalesce(v_provider."metadata"->>'provider_product_id', v_offer."provider_product_id"),
    v_provider."provider_event_id",
    nullif(v_provider."metadata"->>'original_transaction_id', ''),
    new."provider_event_id",
    v_ledger."id",
    case when v_active then 'paid' when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'expired' end,
    coalesce(v_ledger."payable_state", 'not_payable'),
    case when v_active then timezone('utc'::text, now()) else null end,
    jsonb_build_object(
      'sandbox_only', new."environment" = 'sandbox',
      'premium_unlock', false,
      'vip_unlock', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'paid_event_unlock', false,
      'tips_path', false,
      'platform_wide_badge', false
    )
  )
  on conflict ("provider_event_id")
  where "provider_event_id" is not null
  do update set
    "status" = excluded."status",
    "payout_status" = excluded."payout_status",
    "metadata" = excluded."metadata"
  returning * into v_transaction;

  if v_active then
    insert into public."creator_channel_subscriptions" (
      "offer_id",
      "creator_id",
      "subscriber_id",
      "access_grant_id",
      "provider",
      "provider_customer_id",
      "provider_original_transaction_id",
      "provider_latest_transaction_id",
      "status",
      "current_period_start",
      "current_period_end",
      "metadata"
    )
    values (
      v_offer."id",
      v_offer."creator_id",
      new."user_id",
      new."id",
      coalesce(new."provider", 'revenuecat_google_play'),
      new."user_id"::text,
      nullif(v_provider."metadata"->>'original_transaction_id', ''),
      v_provider."provider_event_id",
      'active',
      new."starts_at",
      new."expires_at",
      jsonb_build_object('sandbox_only', new."environment" = 'sandbox', 'viewer_access_only', true, 'platform_wide_badge', false)
    )
    on conflict ("offer_id", "subscriber_id")
    where "status" in ('active', 'trialing', 'grace_period')
    do update set
      "access_grant_id" = excluded."access_grant_id",
      "provider_latest_transaction_id" = excluded."provider_latest_transaction_id",
      "status" = excluded."status",
      "current_period_start" = excluded."current_period_start",
      "current_period_end" = excluded."current_period_end",
      "updated_at" = timezone('utc'::text, now())
    returning * into v_subscription;

    update public."creator_channel_subscription_transactions"
    set "subscription_id" = v_subscription."id"
    where "id" = v_transaction."id";

    insert into public."channel_subscribers" (
      "channel_user_id",
      "subscriber_user_id",
      "status",
      "source",
      "started_at",
      "expires_at",
      "updated_at"
    )
    values (
      v_offer."creator_id"::text,
      new."user_id"::text,
      'active',
      'billing_sync',
      new."starts_at",
      new."expires_at",
      timezone('utc'::text, now())
    )
    on conflict ("channel_user_id", "subscriber_user_id")
    do update set
      "status" = excluded."status",
      "source" = 'billing_sync',
      "started_at" = excluded."started_at",
      "expires_at" = excluded."expires_at",
      "updated_at" = timezone('utc'::text, now());

    update public."creator_channel_subscription_offers" offer
    set
      "subscriber_count" = (
        select count(*)::integer
        from public."creator_channel_subscriptions" sub
        where sub."offer_id" = offer."id"
          and sub."status" in ('active', 'trialing', 'grace_period')
          and (sub."current_period_end" is null or sub."current_period_end" > timezone('utc'::text, now()))
          and sub."revoked_at" is null
          and sub."expired_at" is null
      ),
      "updated_at" = timezone('utc'::text, now())
    where offer."id" = v_offer."id";
  else
    update public."creator_channel_subscriptions"
    set
      "status" = v_next_status,
      "expired_at" = case when v_next_status = 'expired' then timezone('utc'::text, now()) else "expired_at" end,
      "revoked_at" = case when v_next_status in ('refunded', 'revoked') then timezone('utc'::text, now()) else "revoked_at" end,
      "updated_at" = timezone('utc'::text, now())
    where "access_grant_id" = new."id";

    update public."channel_subscribers"
    set
      "status" = case when v_next_status = 'revoked' or v_next_status = 'refunded' then 'revoked' else 'expired' end,
      "updated_at" = timezone('utc'::text, now())
    where "channel_user_id" = v_offer."creator_id"::text
      and "subscriber_user_id" = new."user_id"::text
      and "source" = 'billing_sync';
  end if;

  insert into public."creator_channel_subscription_events" ("offer_id", "subscription_id", "transaction_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_subscription."id",
    v_transaction."id",
    new."user_id",
    case when v_active then 'subscription_verified' else 'subscription_revoked' end,
    jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
  );

  return new;
end;
$$;

drop trigger if exists "sync_creator_channel_subscription_grant_insert" on public."access_grants";
create trigger "sync_creator_channel_subscription_grant_insert"
  after insert on public."access_grants"
  for each row
  execute function public."sync_creator_channel_subscription_from_access_grant"();

drop trigger if exists "sync_creator_channel_subscription_grant_update" on public."access_grants";
create trigger "sync_creator_channel_subscription_grant_update"
  after update of "status", "refunded_at", "revoked_at", "expires_at" on public."access_grants"
  for each row
  execute function public."sync_creator_channel_subscription_from_access_grant"();

create or replace function public."list_my_creator_channel_subscription_offers"()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'auth_required';
  end if;

  return coalesce((
    select jsonb_agg(public."channel_subscription_offer_safe_row"(offer) order by offer."updated_at" desc)
    from public."creator_channel_subscription_offers" offer
    where offer."creator_id" = v_actor_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public."list_my_creator_channel_subscription_transactions"(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_actor_id is null then
    raise exception 'auth_required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', tx."id",
      'offerId', tx."offer_id",
      'subscriptionId', tx."subscription_id",
      'subscriberId', tx."subscriber_id",
      'creatorId', tx."creator_id",
      'title', offer."title",
      'amountCents', tx."amount_cents",
      'currency', tx."currency",
      'provider', tx."provider",
      'providerProductId', tx."provider_product_id",
      'providerTransactionId', tx."provider_transaction_id",
      'status', tx."status",
      'payoutStatus', tx."payout_status",
      'environment', 'sandbox',
      'periodEnd', sub."current_period_end",
      'createdAt', tx."created_at",
      'paidAt', tx."paid_at",
      'metadata', jsonb_build_object(
        'sandboxOnly', true,
        'premiumUnlock', false,
        'vipUnlock', false,
        'paidVideoUnlock', false,
        'paidWatchPartyTicketUnlock', false,
        'paidEventUnlock', false,
        'tipsPath', false
      )
    ) order by tx."created_at" desc)
    from (
      select *
      from public."creator_channel_subscription_transactions"
      where "creator_id" = v_actor_id
      order by "created_at" desc
      limit v_limit
    ) tx
    left join public."creator_channel_subscription_offers" offer on offer."id" = tx."offer_id"
    left join public."creator_channel_subscriptions" sub on sub."id" = tx."subscription_id"
  ), '[]'::jsonb);
end;
$$;

revoke all on function public."channel_subscription_offer_safe_row"(public."creator_channel_subscription_offers") from public;
revoke all on function public."set_creator_channel_subscription_offer"(text, text, text) from public;
revoke all on function public."resolve_creator_channel_subscription_access"(uuid) from public;
revoke all on function public."create_creator_channel_subscription_purchase_intent"(uuid) from public;
revoke all on function public."sync_creator_channel_subscription_from_access_grant"() from public;
revoke all on function public."list_my_creator_channel_subscription_offers"() from public;
revoke all on function public."list_my_creator_channel_subscription_transactions"(integer) from public;

grant execute on function public."set_creator_channel_subscription_offer"(text, text, text) to authenticated;
grant execute on function public."resolve_creator_channel_subscription_access"(uuid) to anon, authenticated;
grant execute on function public."create_creator_channel_subscription_purchase_intent"(uuid) to authenticated;
grant execute on function public."list_my_creator_channel_subscription_offers"() to authenticated;
grant execute on function public."list_my_creator_channel_subscription_transactions"(integer) to authenticated;

comment on table public."creator_channel_subscription_offers" is
  'Sandbox-only monthly creator channel subscription offers. Creator subscriptions do not unlock Premium, VIP, paid videos, Watch-Party seats, paid events, LiveKit authority, payouts, or live money.';
comment on table public."creator_channel_subscriptions" is
  'Verified creator channel subscription rows mirrored from provider-backed channel_subscription access grants. Clients cannot directly mark subscriptions active.';
comment on function public."resolve_creator_channel_subscription_access"(uuid) is
  'Read-only Channel Subscriptions V1 gate. Subscriber-only surfaces use this before showing subscriber state; Premium and VIP do not satisfy it.';
