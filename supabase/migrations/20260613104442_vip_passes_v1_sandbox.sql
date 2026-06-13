-- VIP Passes V1 sandbox bridge.
-- Uses the existing RevenueCat / Google Play dynamic sandbox purchase rail.
-- This does not enable live money, payouts, Premium unlocks, Tips, Paid Videos,
-- Paid Watch-Party tickets, Paid Events, Channel Subscriptions, LiveKit publish,
-- speaker/host authority, room permissions, cash-out, withdrawal, transfer, or
-- platform-wide status.

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
    'channel_subscription',
    'vip_pass'
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
    'channel_subscription',
    'vip_pass'
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
    'channel_subscription',
    'vip_pass'
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
    'channel_subscription',
    'vip_pass'
  ));

insert into public."monetization_products" (
  "product_key",
  "product_type",
  "display_name",
  "description",
  "provider",
  "provider_product_id",
  "provider_base_plan_id",
  "revenuecat_entitlement",
  "applies_to_type",
  "applies_to_id",
  "environment",
  "status",
  "is_android_digital",
  "is_physical_good",
  "metadata"
)
values (
  'vip_pass_sandbox_499',
  'vip_pass',
  'VIP pass sandbox',
  'Reusable sandbox Google Play / RevenueCat VIP product. A backend purchase intent binds each purchase to one creator VIP offer.',
  'revenuecat_google_play',
  'cw_vip_pass_sandbox_499',
  null,
  null,
  'creator_vip',
  null,
  'sandbox',
  'sandbox',
  true,
  false,
  jsonb_build_object(
    'sandbox_purchase_intents_enabled', true,
    'google_play_product_type', 'one_time_product',
    'revenuecat_product_type', 'consumable',
    'price_tier', '499',
    'public_buy_button_active', false,
    'not_payable', true,
    'requires_purchase_intent', true,
    'creator_specific_vip_only', true,
    'premium_unlock', false,
    'subscription_unlock', false,
    'paid_video_unlock', false,
    'paid_watch_party_ticket_unlock', false,
    'paid_event_unlock', false,
    'livekit_authority', false
  )
)
on conflict ("product_key") do update
set
  "display_name" = excluded."display_name",
  "description" = excluded."description",
  "provider" = excluded."provider",
  "provider_product_id" = excluded."provider_product_id",
  "provider_base_plan_id" = excluded."provider_base_plan_id",
  "revenuecat_entitlement" = excluded."revenuecat_entitlement",
  "applies_to_type" = excluded."applies_to_type",
  "applies_to_id" = excluded."applies_to_id",
  "environment" = excluded."environment",
  "status" = excluded."status",
  "is_android_digital" = excluded."is_android_digital",
  "is_physical_good" = excluded."is_physical_good",
  "metadata" = public."monetization_products"."metadata" || excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

create table if not exists public."creator_vip_pass_offers" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_id" uuid not null,
  "title" text not null default 'VIP Pass',
  "description" text,
  "price_cents" integer not null default 499,
  "currency" text not null default 'usd',
  "pass_type" text not null default 'one_time',
  "status" text not null default 'draft',
  "provider" text not null default 'revenuecat_google_play',
  "provider_product_key" text,
  "provider_product_id" text,
  "vip_count" integer not null default 0,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_vip_pass_offers_status_check"
    check ("status" in ('draft', 'sandbox', 'active', 'paused', 'blocked', 'archived')),
  constraint "creator_vip_pass_offers_pass_type_check" check ("pass_type" in ('one_time')),
  constraint "creator_vip_pass_offers_price_check" check ("price_cents" >= 0),
  constraint "creator_vip_pass_offers_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "creator_vip_pass_offers_provider_check" check ("provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')),
  constraint "creator_vip_pass_offers_count_check" check ("vip_count" >= 0),
  constraint "creator_vip_pass_offers_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)'),
  constraint "creator_vip_pass_offers_active_check"
    check ("status" <> 'active' or coalesce(("metadata"->>'live_money_enabled_at_activation')::boolean, false) = true)
);

create unique index if not exists "creator_vip_pass_one_current_offer"
  on public."creator_vip_pass_offers" ("creator_id")
  where "status" in ('sandbox', 'active', 'paused', 'blocked');

create table if not exists public."creator_vip_passes" (
  "id" uuid primary key default gen_random_uuid(),
  "offer_id" uuid not null references public."creator_vip_pass_offers"("id") on delete restrict,
  "creator_id" uuid not null,
  "fan_id" uuid not null,
  "access_grant_id" uuid references public."access_grants"("id") on delete set null,
  "provider" text not null default 'revenuecat_google_play',
  "provider_transaction_id" text,
  "source_transaction_id" uuid,
  "status" text not null default 'active',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "activated_at" timestamptz,
  "revoked_at" timestamptz,
  "refunded_at" timestamptz,
  "expires_at" timestamptz,
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "creator_vip_passes_status_check"
    check ("status" in ('active', 'refunded', 'revoked', 'expired', 'canceled')),
  constraint "creator_vip_passes_no_self_check" check ("creator_id" <> "fan_id"),
  constraint "creator_vip_passes_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create unique index if not exists "creator_vip_passes_active_unique"
  on public."creator_vip_passes" ("offer_id", "fan_id")
  where "status" = 'active';
create index if not exists "creator_vip_passes_fan_idx"
  on public."creator_vip_passes" ("fan_id", "status", "created_at" desc);

create table if not exists public."creator_vip_transactions" (
  "id" uuid primary key default gen_random_uuid(),
  "offer_id" uuid not null references public."creator_vip_pass_offers"("id") on delete restrict,
  "creator_id" uuid not null,
  "fan_id" uuid not null,
  "amount_cents" integer not null default 0,
  "currency" text not null default 'usd',
  "provider" text not null default 'revenuecat_google_play',
  "provider_product_id" text,
  "provider_transaction_id" text,
  "provider_event_id" uuid references public."provider_events"("id") on delete set null,
  "ledger_event_id" uuid references public."money_access_ledger_events"("id") on delete set null,
  "status" text not null default 'pending',
  "platform_fee_cents" integer not null default 0,
  "provider_fee_cents" integer,
  "creator_net_cents" integer,
  "payout_status" text not null default 'not_payable',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "paid_at" timestamptz,
  "refunded_at" timestamptz,
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "creator_vip_transactions_status_check"
    check ("status" in ('pending', 'paid', 'failed', 'canceled', 'refunded', 'revoked')),
  constraint "creator_vip_transactions_amount_check" check ("amount_cents" >= 0),
  constraint "creator_vip_transactions_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "creator_vip_transactions_payout_check"
    check ("payout_status" in ('not_payable', 'pending_verification', 'payable', 'paid', 'refunded', 'reversed', 'chargeback')),
  constraint "creator_vip_transactions_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create index if not exists "creator_vip_transactions_creator_idx"
  on public."creator_vip_transactions" ("creator_id", "created_at" desc);
create unique index if not exists "creator_vip_transactions_provider_event_unique"
  on public."creator_vip_transactions" ("provider_event_id")
  where "provider_event_id" is not null;

create table if not exists public."creator_vip_events" (
  "id" uuid primary key default gen_random_uuid(),
  "offer_id" uuid references public."creator_vip_pass_offers"("id") on delete set null,
  "vip_pass_id" uuid references public."creator_vip_passes"("id") on delete set null,
  "transaction_id" uuid references public."creator_vip_transactions"("id") on delete set null,
  "actor_id" uuid,
  "event_type" text not null,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_vip_events_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create index if not exists "creator_vip_events_offer_idx"
  on public."creator_vip_events" ("offer_id", "created_at" desc);

drop trigger if exists "touch_creator_vip_pass_offers_updated_at" on public."creator_vip_pass_offers";
create trigger "touch_creator_vip_pass_offers_updated_at"
  before update on public."creator_vip_pass_offers"
  for each row execute function public."touch_money_access_updated_at"();

alter table public."creator_vip_pass_offers" enable row level security;
alter table public."creator_vip_passes" enable row level security;
alter table public."creator_vip_transactions" enable row level security;
alter table public."creator_vip_events" enable row level security;

create policy "creator_vip_pass_offers_select_public_active"
  on public."creator_vip_pass_offers" for select to authenticated
  using (
    "status" in ('sandbox', 'active')
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );
create policy "creator_vip_pass_offers_write_owner_operator"
  on public."creator_vip_pass_offers" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_vip_passes_select_participant_owner_operator"
  on public."creator_vip_passes" for select to authenticated
  using (
    "fan_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );
create policy "creator_vip_passes_write_owner_operator"
  on public."creator_vip_passes" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_vip_transactions_select_participant_owner_operator"
  on public."creator_vip_transactions" for select to authenticated
  using (
    "fan_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );
create policy "creator_vip_transactions_write_owner_operator"
  on public."creator_vip_transactions" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_vip_events_select_creator_owner_operator"
  on public."creator_vip_events" for select to authenticated
  using (
    exists (
      select 1 from public."creator_vip_pass_offers" offer
      where offer."id" = creator_vip_events."offer_id"
        and offer."creator_id" = auth.uid()
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );
create policy "creator_vip_events_write_owner_operator"
  on public."creator_vip_events" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."creator_vip_pass_offers" from anon, authenticated;
revoke all on table public."creator_vip_passes" from anon, authenticated;
revoke all on table public."creator_vip_transactions" from anon, authenticated;
revoke all on table public."creator_vip_events" from anon, authenticated;
grant select on table public."creator_vip_pass_offers" to authenticated;
grant select on table public."creator_vip_passes" to authenticated;
grant select on table public."creator_vip_transactions" to authenticated;
grant select on table public."creator_vip_events" to authenticated;
grant all on table public."creator_vip_pass_offers" to service_role;
grant all on table public."creator_vip_passes" to service_role;
grant all on table public."creator_vip_transactions" to service_role;
grant all on table public."creator_vip_events" to service_role;

create or replace function public."creator_vip_pass_offer_safe_row"(offer_row public."creator_vip_pass_offers")
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
    'passType', offer_row."pass_type",
    'status', offer_row."status",
    'provider', offer_row."provider",
    'providerProductKey', offer_row."provider_product_key",
    'providerProductId', offer_row."provider_product_id",
    'vipCount', offer_row."vip_count",
    'createdAt', offer_row."created_at",
    'updatedAt', offer_row."updated_at"
  );
$$;

create or replace function public."set_creator_vip_pass_offer"(
  p_title text default 'VIP Pass',
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
  v_offer public."creator_vip_pass_offers"%rowtype;
  v_digital_switch text := coalesce((
    select "state" from public."platform_money_kill_switches"
    where "key" = 'digital_sales_enabled'
    limit 1
  ), 'off');
  v_provider_switch text := coalesce((
    select "state" from public."platform_money_kill_switches"
    where "key" = 'revenuecat_google_play_enabled'
    limit 1
  ), 'off');
begin
  if v_actor_id is null then
    raise exception 'auth_required';
  end if;
  if v_status not in ('draft', 'sandbox', 'paused', 'archived') then
    raise exception 'unsupported_offer_status';
  end if;
  if v_digital_switch not in ('sandbox_only', 'on') then
    raise exception 'vip_passes_disabled';
  end if;
  if v_provider_switch not in ('sandbox_only', 'on') then
    raise exception 'provider_not_ready';
  end if;

  select * into v_product
  from public."monetization_products"
  where "product_key" = 'vip_pass_sandbox_499'
    and "product_type" = 'vip_pass'
    and "provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')
    and "environment" = 'sandbox'
    and "status" = 'sandbox'
  limit 1;

  if v_product."id" is null or nullif(trim(coalesce(v_product."provider_product_id", '')), '') is null then
    raise exception 'provider_product_missing';
  end if;

  insert into public."creator_vip_pass_offers" (
    "creator_id",
    "title",
    "description",
    "price_cents",
    "currency",
    "pass_type",
    "status",
    "provider",
    "provider_product_key",
    "provider_product_id",
    "metadata"
  )
  values (
    v_actor_id,
    coalesce(nullif(trim(p_title), ''), 'VIP Pass'),
    nullif(trim(p_description), ''),
    499,
    'usd',
    'one_time',
    v_status,
    'revenuecat_google_play',
    v_product."product_key",
    v_product."provider_product_id",
    jsonb_build_object(
      'sandbox_only', true,
      'not_payable', true,
      'creator_specific_vip_only', true,
      'premium_unlock', false,
      'tips_path', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'paid_event_unlock', false,
      'subscription_unlock', false,
      'livekit_authority', false,
      'room_permissions', false,
      'platform_wide_status', false,
      'live_money_enabled_at_save', coalesce((select "state" = 'on' from public."platform_money_kill_switches" where "key" = 'live_money_enabled'), false)
    )
  )
  on conflict ("creator_id")
  where "status" in ('sandbox', 'active', 'paused', 'blocked')
  do update set
    "title" = excluded."title",
    "description" = excluded."description",
    "status" = excluded."status",
    "provider" = excluded."provider",
    "provider_product_key" = excluded."provider_product_key",
    "provider_product_id" = excluded."provider_product_id",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now())
  returning * into v_offer;

  insert into public."creator_vip_events" ("offer_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_actor_id,
    'offer_saved',
    jsonb_build_object('status', v_offer."status", 'sandbox_only', true, 'not_payable', true)
  );

  return public."creator_vip_pass_offer_safe_row"(v_offer);
end;
$$;

create or replace function public."resolve_creator_vip_pass_access"(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer public."creator_vip_pass_offers"%rowtype;
  v_pass public."creator_vip_passes"%rowtype;
  v_blocked boolean := false;
begin
  if p_creator_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'creator_id_required', 'requiresPurchase', false);
  end if;

  select * into v_offer
  from public."creator_vip_pass_offers"
  where "creator_id" = p_creator_id
    and "status" in ('sandbox', 'active', 'paused', 'blocked')
  order by "updated_at" desc
  limit 1;

  if v_offer."id" is null then
    return jsonb_build_object('allowed', false, 'reason', 'vip_not_available', 'requiresPurchase', false);
  end if;

  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'auth_required', 'requiresPurchase', true, 'offer', public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;

  if v_user_id = p_creator_id or public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object('allowed', true, 'reason', 'creator_or_admin', 'requiresPurchase', false, 'offer', public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;

  select exists (
    select 1
    from public."channel_audience_blocks" block_row
    where block_row."channel_user_id" = p_creator_id::text
      and block_row."blocked_user_id" = v_user_id::text
  ) into v_blocked;
  if v_blocked then
    return jsonb_build_object('allowed', false, 'reason', 'blocked_by_creator', 'requiresPurchase', false, 'offer', public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;

  select * into v_pass
  from public."creator_vip_passes"
  where "offer_id" = v_offer."id"
    and "fan_id" = v_user_id
    and "status" = 'active'
    and "refunded_at" is null
    and "revoked_at" is null
    and ("expires_at" is null or "expires_at" > timezone('utc'::text, now()))
  order by "created_at" desc
  limit 1;

  if v_pass."id" is not null then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'vip_active',
      'requiresPurchase', false,
      'vipPassId', v_pass."id",
      'offer', public."creator_vip_pass_offer_safe_row"(v_offer)
    );
  end if;

  if v_offer."status" = 'paused' then
    return jsonb_build_object('allowed', false, 'reason', 'offer_paused', 'requiresPurchase', false, 'offer', public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;
  if v_offer."status" in ('blocked', 'archived') then
    return jsonb_build_object('allowed', false, 'reason', 'offer_blocked', 'requiresPurchase', false, 'offer', public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'vip_required',
    'requiresPurchase', true,
    'priceCents', v_offer."price_cents",
    'currency', v_offer."currency",
    'creatorId', v_offer."creator_id",
    'provider', v_offer."provider",
    'providerProductId', v_offer."provider_product_id",
    'providerProductKey', v_offer."provider_product_key",
    'offer', public."creator_vip_pass_offer_safe_row"(v_offer)
  );
end;
$$;

create or replace function public."create_creator_vip_pass_purchase_intent"(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer public."creator_vip_pass_offers"%rowtype;
  v_access jsonb;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_offer
  from public."creator_vip_pass_offers"
  where "id" = p_offer_id
  limit 1;

  if v_offer."id" is null then
    raise exception 'offer_not_found';
  end if;
  if v_offer."creator_id" = v_user_id then
    raise exception 'creator_cannot_buy_own_vip';
  end if;

  v_access := public."resolve_creator_vip_pass_access"(v_offer."creator_id");
  if coalesce((v_access->>'allowed')::boolean, false) then
    return jsonb_build_object('alreadyPurchased', true, 'access', v_access);
  end if;
  if coalesce((v_access->>'requiresPurchase')::boolean, false) is not true then
    raise exception '%', coalesce(v_access->>'reason', 'vip_not_available');
  end if;

  return public."create_money_purchase_intent"(
    'vip_pass_sandbox_499',
    'vip_pass',
    v_offer."id",
    jsonb_build_object(
      'creator_id', v_offer."creator_id",
      'amount_minor', v_offer."price_cents",
      'currency', v_offer."currency",
      'source_surface', 'creator_channel_vip',
      'vip_offer_id', v_offer."id",
      'vip_passes_v1', true,
      'premium_unlock', false,
      'tips_path', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'paid_event_unlock', false,
      'subscription_unlock', false,
      'livekit_authority', false,
      'room_permissions', false,
      'platform_wide_status', false
    )
  );
end;
$$;

create or replace function public."sync_creator_vip_pass_from_access_grant"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public."creator_vip_pass_offers"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_transaction public."creator_vip_transactions"%rowtype;
  v_pass public."creator_vip_passes"%rowtype;
  v_active boolean;
begin
  if new."grant_type" <> 'vip_pass' or new."source_id" is null then
    return new;
  end if;

  select * into v_offer
  from public."creator_vip_pass_offers"
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

  insert into public."creator_vip_transactions" (
    "offer_id",
    "creator_id",
    "fan_id",
    "amount_cents",
    "currency",
    "provider",
    "provider_product_id",
    "provider_transaction_id",
    "provider_event_id",
    "ledger_event_id",
    "status",
    "payout_status",
    "paid_at",
    "refunded_at",
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
    new."provider_event_id",
    v_ledger."id",
    case when v_active then 'paid' when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'pending' end,
    coalesce(v_ledger."payable_state", 'not_payable'),
    case when v_active then timezone('utc'::text, now()) else null end,
    new."refunded_at",
    jsonb_build_object(
      'sandbox_only', new."environment" = 'sandbox',
      'premium_unlock', false,
      'tips_path', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'paid_event_unlock', false,
      'subscription_unlock', false,
      'livekit_authority', false,
      'room_permissions', false,
      'platform_wide_status', false
    )
  )
  on conflict ("provider_event_id")
  where "provider_event_id" is not null
  do update set
    "status" = excluded."status",
    "payout_status" = excluded."payout_status",
    "refunded_at" = excluded."refunded_at",
    "metadata" = excluded."metadata"
  returning * into v_transaction;

  if v_active then
    insert into public."creator_vip_passes" (
      "offer_id",
      "creator_id",
      "fan_id",
      "access_grant_id",
      "provider",
      "provider_transaction_id",
      "source_transaction_id",
      "status",
      "activated_at",
      "expires_at",
      "metadata"
    )
    values (
      v_offer."id",
      v_offer."creator_id",
      new."user_id",
      new."id",
      coalesce(new."provider", 'revenuecat_google_play'),
      v_provider."provider_event_id",
      v_transaction."id",
      'active',
      timezone('utc'::text, now()),
      new."expires_at",
      jsonb_build_object(
        'sandbox_only', new."environment" = 'sandbox',
        'creator_specific_vip_only', true,
        'viewer_access_only', true,
        'livekit_authority', false,
        'room_permissions', false,
        'platform_wide_status', false
      )
    )
    on conflict ("offer_id", "fan_id")
    where "status" = 'active'
    do update set
      "access_grant_id" = excluded."access_grant_id",
      "source_transaction_id" = excluded."source_transaction_id",
      "provider_transaction_id" = excluded."provider_transaction_id",
      "expires_at" = excluded."expires_at"
    returning * into v_pass;

    update public."creator_vip_pass_offers" offer
    set
      "vip_count" = (
        select count(*)::integer
        from public."creator_vip_passes" vip_pass
        where vip_pass."offer_id" = offer."id"
          and vip_pass."status" = 'active'
          and vip_pass."refunded_at" is null
          and vip_pass."revoked_at" is null
          and (vip_pass."expires_at" is null or vip_pass."expires_at" > timezone('utc'::text, now()))
      ),
      "updated_at" = timezone('utc'::text, now())
    where offer."id" = v_offer."id";
  else
    update public."creator_vip_passes"
    set
      "status" = case when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'expired' end,
      "refunded_at" = new."refunded_at",
      "revoked_at" = coalesce(new."revoked_at", timezone('utc'::text, now()))
    where "access_grant_id" = new."id"
      and "status" = 'active'
    returning * into v_pass;
  end if;

  insert into public."creator_vip_events" ("offer_id", "vip_pass_id", "transaction_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_pass."id",
    v_transaction."id",
    new."user_id",
    case when v_active then 'vip_pass_verified' else 'vip_pass_revoked' end,
    jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
  );

  return new;
end;
$$;

drop trigger if exists "sync_creator_vip_pass_grant_insert" on public."access_grants";
create trigger "sync_creator_vip_pass_grant_insert"
  after insert on public."access_grants"
  for each row
  execute function public."sync_creator_vip_pass_from_access_grant"();

drop trigger if exists "sync_creator_vip_pass_grant_update" on public."access_grants";
create trigger "sync_creator_vip_pass_grant_update"
  after update of "status", "refunded_at", "revoked_at", "expires_at" on public."access_grants"
  for each row
  execute function public."sync_creator_vip_pass_from_access_grant"();

create or replace function public."list_my_creator_vip_pass_offers"()
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
    select jsonb_agg(public."creator_vip_pass_offer_safe_row"(offer) order by offer."updated_at" desc)
    from public."creator_vip_pass_offers" offer
    where offer."creator_id" = v_actor_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public."list_my_creator_vip_transactions"(p_limit integer default 50)
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
      'creatorId', tx."creator_id",
      'fanId', tx."fan_id",
      'title', offer."title",
      'amountCents', tx."amount_cents",
      'currency', tx."currency",
      'provider', tx."provider",
      'providerProductId', tx."provider_product_id",
      'providerTransactionId', tx."provider_transaction_id",
      'status', tx."status",
      'payoutStatus', tx."payout_status",
      'environment', 'sandbox',
      'vipCount', offer."vip_count",
      'createdAt', tx."created_at",
      'paidAt', tx."paid_at",
      'metadata', jsonb_build_object(
        'sandboxOnly', true,
        'premiumUnlock', false,
        'tipsPath', false,
        'paidVideoUnlock', false,
        'paidWatchPartyTicketUnlock', false,
        'paidEventUnlock', false,
        'subscriptionUnlock', false,
        'livekitAuthority', false
      )
    ) order by tx."created_at" desc)
    from (
      select *
      from public."creator_vip_transactions"
      where "creator_id" = v_actor_id
      order by "created_at" desc
      limit v_limit
    ) tx
    left join public."creator_vip_pass_offers" offer on offer."id" = tx."offer_id"
  ), '[]'::jsonb);
end;
$$;

create or replace function public."create_money_purchase_intent"(
  p_product_key text,
  p_source_type text,
  p_source_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public."monetization_products"%rowtype;
  v_expected_source_type text;
  v_intent public."money_purchase_intents"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if p_metadata::text ~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization)' then
    raise exception 'unsafe_metadata';
  end if;

  select * into v_product
  from public."monetization_products"
  where "product_key" = p_product_key
  limit 1;

  if v_product."id" is null then
    raise exception 'product_not_found';
  end if;
  if v_product."status" in ('disabled', 'retired') then
    raise exception 'product_not_available';
  end if;
  if v_product."product_type" = 'premium_subscription' then
    raise exception 'premium_uses_existing_revenuecat_shell';
  end if;
  if v_product."product_type" = 'merch_physical_good' or coalesce(v_product."is_physical_good", false) then
    raise exception 'merch_is_physical_goods_only';
  end if;
  if coalesce(v_product."is_android_digital", false) is not true
    or v_product."provider" not in ('revenuecat_google_play', 'google_play', 'revenuecat')
  then
    raise exception 'android_digital_products_require_revenuecat_google_play';
  end if;
  if v_product."environment" <> 'sandbox' or v_product."status" <> 'sandbox' then
    raise exception 'sandbox_provider_mapping_required';
  end if;
  if nullif(trim(coalesce(v_product."provider_product_id", '')), '') is null then
    raise exception 'provider_product_id_required';
  end if;
  if coalesce((v_product."metadata"->>'sandbox_purchase_intents_enabled')::boolean, false) is not true then
    raise exception 'sandbox_purchase_intents_not_enabled';
  end if;

  v_expected_source_type := case v_product."product_type"
    when 'paid_content_access' then 'paid_content'
    when 'watch_party_live_ticket' then 'watch_party_live'
    when 'live_watch_party_access_pass' then 'live_watch_party_access'
    when 'live_watch_party_seat_pass' then 'live_watch_party_seat'
    when 'creator_tip' then 'creator_tip'
    when 'event_pass' then 'event'
    when 'channel_subscription' then 'channel_subscription'
    when 'vip_pass' then 'vip_pass'
    else null
  end;

  if v_expected_source_type is null then
    raise exception 'unsupported_purchase_intent_product';
  end if;
  if p_source_type <> v_expected_source_type then
    raise exception 'source_type_mismatch';
  end if;
  if p_source_id is null then
    raise exception 'source_id_required';
  end if;

  insert into public."money_purchase_intents" (
    "user_id",
    "product_id",
    "product_key",
    "product_type",
    "provider",
    "provider_product_id",
    "source_type",
    "source_id",
    "creator_id",
    "platform_id",
    "environment",
    "status",
    "amount_minor",
    "currency",
    "idempotency_key",
    "expires_at",
    "metadata"
  )
  values (
    v_user_id,
    v_product."id",
    v_product."product_key",
    v_product."product_type",
    v_product."provider",
    v_product."provider_product_id",
    p_source_type,
    p_source_id,
    nullif(p_metadata->>'creator_id', '')::uuid,
    nullif(p_metadata->>'platform_id', '')::uuid,
    'sandbox',
    'pending',
    nullif(p_metadata->>'amount_minor', '')::integer,
    lower(nullif(p_metadata->>'currency', '')),
    'money_intent:' || v_user_id::text || ':' || gen_random_uuid()::text,
    v_now + interval '15 minutes',
    jsonb_build_object(
      'sandbox_only', true,
      'not_payable', true,
      'client_selected_payable_state', false,
      'source_policy_checked_by_product_lane', coalesce((v_product."metadata"->>'source_policy_checked')::boolean, false)
    ) || coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_intent;

  return public."money_purchase_intent_safe_row"(v_intent);
end;
$$;

revoke all on function public."creator_vip_pass_offer_safe_row"(public."creator_vip_pass_offers") from public;
revoke all on function public."set_creator_vip_pass_offer"(text, text, text) from public;
revoke all on function public."resolve_creator_vip_pass_access"(uuid) from public;
revoke all on function public."create_creator_vip_pass_purchase_intent"(uuid) from public;
revoke all on function public."sync_creator_vip_pass_from_access_grant"() from public;
revoke all on function public."list_my_creator_vip_pass_offers"() from public;
revoke all on function public."list_my_creator_vip_transactions"(integer) from public;
revoke all on function public."create_money_purchase_intent"(text, text, uuid, jsonb) from public;

grant execute on function public."set_creator_vip_pass_offer"(text, text, text) to authenticated;
grant execute on function public."resolve_creator_vip_pass_access"(uuid) to anon, authenticated;
grant execute on function public."create_creator_vip_pass_purchase_intent"(uuid) to authenticated;
grant execute on function public."list_my_creator_vip_pass_offers"() to authenticated;
grant execute on function public."list_my_creator_vip_transactions"(integer) to authenticated;
grant execute on function public."create_money_purchase_intent"(text, text, uuid, jsonb) to authenticated;

comment on table public."creator_vip_pass_offers" is
  'Sandbox-only creator VIP pass offers. VIP unlocks only creator-specific VIP status/section and never grants Premium, paid videos, Watch-Party tickets, paid events, subscriptions, LiveKit authority, payouts, or live money.';
comment on table public."creator_vip_passes" is
  'Verified creator-specific VIP passes created only from provider-backed vip_pass access grants or admin/operator service paths. Active passes are viewer status only and not payable in sandbox.';
comment on function public."resolve_creator_vip_pass_access"(uuid) is
  'Read-only VIP gate for VIP Passes V1. VIP-only surfaces use this before showing VIP state; Premium and Channel Subscriptions do not satisfy it.';
comment on function public."create_money_purchase_intent"(text, text, uuid, jsonb) is
  'Creates sandbox-only Google Play / RevenueCat purchase intents for approved non-Premium creator digital products, including Channel Subscriptions and VIP Passes.';
