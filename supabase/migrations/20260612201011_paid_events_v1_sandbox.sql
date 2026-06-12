-- Paid Events V1 sandbox bridge.
-- Uses the existing RevenueCat / Google Play dynamic sandbox purchase rail.
-- This does not enable live money, payouts, Premium unlocks, Tips, Paid Videos,
-- Paid Watch-Party room tickets, VIP, subscriptions, LiveKit publish authority,
-- host authority, Live Stage routing, or Watch-Party route ownership changes.

create table if not exists public."paid_creator_events" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_event_id" uuid not null references public."creator_events"("id") on delete cascade,
  "creator_id" uuid not null,
  "title" text not null,
  "description" text,
  "event_type" text not null,
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "price_cents" integer not null default 99,
  "currency" text not null default 'usd',
  "capacity_limit" integer,
  "passes_sold" integer not null default 0,
  "status" text not null default 'draft',
  "provider" text not null default 'revenuecat_google_play',
  "provider_product_key" text,
  "provider_product_id" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "paid_creator_events_status_check"
    check ("status" in ('draft', 'sandbox', 'active', 'paused', 'sold_out', 'canceled', 'blocked', 'archived')),
  constraint "paid_creator_events_type_check"
    check ("event_type" in ('live_first', 'live_watch_party', 'watch_party_live')),
  constraint "paid_creator_events_price_check" check ("price_cents" >= 0),
  constraint "paid_creator_events_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "paid_creator_events_capacity_check" check ("capacity_limit" is null or "capacity_limit" > 0),
  constraint "paid_creator_events_passes_sold_check" check ("passes_sold" >= 0),
  constraint "paid_creator_events_provider_check" check ("provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')),
  constraint "paid_creator_events_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)'),
  constraint "paid_creator_events_sandbox_active_check"
    check ("status" <> 'active' or coalesce(("metadata"->>'live_money_enabled_at_activation')::boolean, false) = true)
);

create unique index if not exists "paid_creator_events_creator_event_active_unique"
  on public."paid_creator_events" ("creator_event_id")
  where "status" in ('sandbox', 'active', 'paused', 'sold_out', 'blocked');

create index if not exists "paid_creator_events_creator_idx"
  on public."paid_creator_events" ("creator_id", "updated_at" desc);

create table if not exists public."paid_creator_event_passes" (
  "id" uuid primary key default gen_random_uuid(),
  "event_id" uuid not null references public."paid_creator_events"("id") on delete restrict,
  "creator_event_id" uuid not null references public."creator_events"("id") on delete cascade,
  "buyer_id" uuid not null,
  "creator_id" uuid not null,
  "source_transaction_id" uuid,
  "access_grant_id" uuid references public."access_grants"("id") on delete set null,
  "provider" text not null default 'revenuecat_google_play',
  "provider_transaction_id" text,
  "status" text not null default 'active',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "used_at" timestamptz,
  "revoked_at" timestamptz,
  "refunded_at" timestamptz,
  "expires_at" timestamptz,
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "paid_creator_event_passes_status_check"
    check ("status" in ('active', 'refunded', 'revoked', 'expired', 'canceled')),
  constraint "paid_creator_event_passes_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create unique index if not exists "paid_creator_event_passes_active_unique"
  on public."paid_creator_event_passes" ("event_id", "buyer_id")
  where "status" = 'active';

create index if not exists "paid_creator_event_passes_buyer_idx"
  on public."paid_creator_event_passes" ("buyer_id", "status", "created_at" desc);

create table if not exists public."creator_event_transactions" (
  "id" uuid primary key default gen_random_uuid(),
  "event_id" uuid not null references public."paid_creator_events"("id") on delete restrict,
  "creator_event_id" uuid not null references public."creator_events"("id") on delete cascade,
  "creator_id" uuid not null,
  "buyer_id" uuid not null,
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
  constraint "creator_event_transactions_status_check"
    check ("status" in ('pending', 'paid', 'failed', 'canceled', 'refunded', 'revoked')),
  constraint "creator_event_transactions_amount_check" check ("amount_cents" >= 0),
  constraint "creator_event_transactions_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "creator_event_transactions_payout_check"
    check ("payout_status" in ('not_payable', 'pending_verification', 'payable', 'paid', 'refunded', 'reversed', 'chargeback')),
  constraint "creator_event_transactions_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create index if not exists "creator_event_transactions_creator_idx"
  on public."creator_event_transactions" ("creator_id", "created_at" desc);

create unique index if not exists "creator_event_transactions_provider_event_unique"
  on public."creator_event_transactions" ("provider_event_id")
  where "provider_event_id" is not null;

create table if not exists public."paid_event_events" (
  "id" uuid primary key default gen_random_uuid(),
  "event_id" uuid references public."paid_creator_events"("id") on delete set null,
  "pass_id" uuid references public."paid_creator_event_passes"("id") on delete set null,
  "transaction_id" uuid references public."creator_event_transactions"("id") on delete set null,
  "actor_id" uuid,
  "event_type" text not null,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "paid_event_events_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create index if not exists "paid_event_events_offer_idx"
  on public."paid_event_events" ("event_id", "created_at" desc);

drop trigger if exists "touch_paid_creator_events_updated_at" on public."paid_creator_events";
create trigger "touch_paid_creator_events_updated_at"
  before update on public."paid_creator_events"
  for each row execute function public."touch_money_access_updated_at"();

alter table public."paid_creator_events" enable row level security;
alter table public."paid_creator_event_passes" enable row level security;
alter table public."creator_event_transactions" enable row level security;
alter table public."paid_event_events" enable row level security;

create policy "paid_creator_events_select_public_active"
  on public."paid_creator_events" for select to authenticated
  using (
    "status" in ('sandbox', 'active', 'sold_out')
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "paid_creator_events_write_owner_operator"
  on public."paid_creator_events" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "paid_creator_event_passes_select_participant_owner_operator"
  on public."paid_creator_event_passes" for select to authenticated
  using (
    "buyer_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "paid_creator_event_passes_write_owner_operator"
  on public."paid_creator_event_passes" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_event_transactions_select_participant_owner_operator"
  on public."creator_event_transactions" for select to authenticated
  using (
    "buyer_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "creator_event_transactions_write_owner_operator"
  on public."creator_event_transactions" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "paid_event_events_select_creator_owner_operator"
  on public."paid_event_events" for select to authenticated
  using (
    exists (
      select 1 from public."paid_creator_events" event_offer
      where event_offer."id" = paid_event_events."event_id"
        and event_offer."creator_id" = auth.uid()
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "paid_event_events_write_owner_operator"
  on public."paid_event_events" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."paid_creator_events" from anon, authenticated;
revoke all on table public."paid_creator_event_passes" from anon, authenticated;
revoke all on table public."creator_event_transactions" from anon, authenticated;
revoke all on table public."paid_event_events" from anon, authenticated;
grant select on table public."paid_creator_events" to authenticated;
grant select on table public."paid_creator_event_passes" to authenticated;
grant select on table public."creator_event_transactions" to authenticated;
grant select on table public."paid_event_events" to authenticated;
grant all on table public."paid_creator_events" to service_role;
grant all on table public."paid_creator_event_passes" to service_role;
grant all on table public."creator_event_transactions" to service_role;
grant all on table public."paid_event_events" to service_role;

create or replace function public."paid_creator_event_safe_row"(event_row public."paid_creator_events")
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', event_row."id",
    'creatorEventId', event_row."creator_event_id",
    'creatorId', event_row."creator_id",
    'title', event_row."title",
    'description', event_row."description",
    'eventType', event_row."event_type",
    'startsAt', event_row."starts_at",
    'endsAt', event_row."ends_at",
    'priceCents', event_row."price_cents",
    'currency', event_row."currency",
    'capacityLimit', event_row."capacity_limit",
    'passesSold', event_row."passes_sold",
    'status', event_row."status",
    'provider', event_row."provider",
    'providerProductKey', event_row."provider_product_key",
    'providerProductId', event_row."provider_product_id",
    'createdAt', event_row."created_at",
    'updatedAt', event_row."updated_at"
  );
$$;

create or replace function public."set_paid_creator_event_offer"(
  p_creator_event_id uuid,
  p_description text default null,
  p_price_cents integer default 99,
  p_capacity_limit integer default null,
  p_status text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_source_event public."creator_events"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_status text := lower(trim(coalesce(p_status, 'sandbox')));
  v_price_cents integer := greatest(coalesce(p_price_cents, 99), 0);
  v_offer public."paid_creator_events"%rowtype;
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
  if p_creator_event_id is null then
    raise exception 'event_id_required';
  end if;
  if v_status not in ('draft', 'sandbox', 'paused', 'canceled', 'archived') then
    raise exception 'unsupported_offer_status';
  end if;
  if p_capacity_limit is not null and p_capacity_limit <= 0 then
    raise exception 'capacity_limit_invalid';
  end if;
  if v_price_cents <> 99 then
    raise exception 'approved_sandbox_price_required';
  end if;
  if v_digital_switch not in ('sandbox_only', 'on') then
    raise exception 'paid_events_disabled';
  end if;
  if v_provider_switch not in ('sandbox_only', 'on') then
    raise exception 'provider_not_ready';
  end if;

  select * into v_source_event
  from public."creator_events"
  where "id" = p_creator_event_id
  limit 1;

  if v_source_event."id" is null then
    raise exception 'event_not_found';
  end if;
  if v_source_event."host_user_id" <> v_actor_id and not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'event_creator_required';
  end if;
  if v_source_event."status" in ('expired', 'canceled') then
    raise exception 'event_not_payable';
  end if;

  select * into v_product
  from public."monetization_products"
  where "product_key" = 'event_pass_sandbox_099'
    and "product_type" = 'event_pass'
    and "provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')
    and "environment" = 'sandbox'
    and "status" = 'sandbox'
  limit 1;

  if v_product."id" is null or nullif(trim(coalesce(v_product."provider_product_id", '')), '') is null then
    raise exception 'provider_product_missing';
  end if;

  insert into public."paid_creator_events" (
    "creator_event_id",
    "creator_id",
    "title",
    "description",
    "event_type",
    "starts_at",
    "ends_at",
    "price_cents",
    "currency",
    "capacity_limit",
    "status",
    "provider",
    "provider_product_key",
    "provider_product_id",
    "metadata"
  )
  values (
    v_source_event."id",
    v_source_event."host_user_id",
    coalesce(nullif(trim(v_source_event."event_title"), ''), 'Creator event pass'),
    nullif(trim(p_description), ''),
    v_source_event."event_type",
    v_source_event."starts_at",
    v_source_event."ends_at",
    v_price_cents,
    'usd',
    p_capacity_limit,
    v_status,
    'revenuecat_google_play',
    v_product."product_key",
    v_product."provider_product_id",
    jsonb_build_object(
      'sandbox_only', true,
      'not_payable', true,
      'premium_unlock', false,
      'tips_path', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'vip_unlock', false,
      'subscription_unlock', false,
      'room_media_controls', false,
      'grants_host_authority', false,
      'live_money_enabled_at_save', coalesce((select "state" = 'on' from public."platform_money_kill_switches" where "key" = 'live_money_enabled'), false)
    )
  )
  on conflict ("creator_event_id")
  where "status" in ('sandbox', 'active', 'paused', 'sold_out', 'blocked')
  do update set
    "title" = excluded."title",
    "description" = excluded."description",
    "event_type" = excluded."event_type",
    "starts_at" = excluded."starts_at",
    "ends_at" = excluded."ends_at",
    "price_cents" = excluded."price_cents",
    "currency" = excluded."currency",
    "capacity_limit" = excluded."capacity_limit",
    "status" = excluded."status",
    "provider" = excluded."provider",
    "provider_product_key" = excluded."provider_product_key",
    "provider_product_id" = excluded."provider_product_id",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now())
  returning * into v_offer;

  insert into public."paid_event_events" ("event_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_actor_id,
    'offer_saved',
    jsonb_build_object('status', v_offer."status", 'sandbox_only', true, 'not_payable', true)
  );

  return public."paid_creator_event_safe_row"(v_offer);
end;
$$;

create or replace function public."resolve_paid_creator_event_pass_access"(p_creator_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source_event public."creator_events"%rowtype;
  v_offer public."paid_creator_events"%rowtype;
  v_pass public."paid_creator_event_passes"%rowtype;
begin
  if p_creator_event_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'event_id_required', 'requiresPurchase', false);
  end if;

  select * into v_source_event
  from public."creator_events"
  where "id" = p_creator_event_id
  limit 1;

  if v_source_event."id" is null then
    return jsonb_build_object('allowed', false, 'reason', 'event_not_found', 'requiresPurchase', false);
  end if;
  if v_source_event."status" in ('expired', 'canceled') then
    return jsonb_build_object('allowed', false, 'reason', 'event_unavailable', 'requiresPurchase', false);
  end if;

  select * into v_offer
  from public."paid_creator_events"
  where "creator_event_id" = p_creator_event_id
    and "status" in ('sandbox', 'active', 'sold_out', 'paused', 'blocked')
  order by "updated_at" desc
  limit 1;

  if v_offer."id" is null then
    return jsonb_build_object('allowed', true, 'reason', 'free_event', 'requiresPurchase', false);
  end if;

  if v_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'auth_required',
      'requiresPurchase', true,
      'offer', public."paid_creator_event_safe_row"(v_offer)
    );
  end if;

  if v_offer."creator_id" = v_user_id or v_source_event."host_user_id" = v_user_id or public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object('allowed', true, 'reason', 'creator_or_admin', 'requiresPurchase', false, 'offer', public."paid_creator_event_safe_row"(v_offer));
  end if;

  select * into v_pass
  from public."paid_creator_event_passes"
  where "event_id" = v_offer."id"
    and "buyer_id" = v_user_id
    and "status" = 'active'
    and "refunded_at" is null
    and "revoked_at" is null
    and ("expires_at" is null or "expires_at" > timezone('utc'::text, now()))
  order by "created_at" desc
  limit 1;

  if v_pass."id" is not null then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'event_pass_confirmed',
      'requiresPurchase', false,
      'passId', v_pass."id",
      'offer', public."paid_creator_event_safe_row"(v_offer)
    );
  end if;

  if v_offer."status" = 'paused' then
    return jsonb_build_object('allowed', false, 'reason', 'offer_paused', 'requiresPurchase', false, 'offer', public."paid_creator_event_safe_row"(v_offer));
  end if;
  if v_offer."status" in ('blocked', 'canceled', 'archived') then
    return jsonb_build_object('allowed', false, 'reason', 'offer_blocked', 'requiresPurchase', false, 'offer', public."paid_creator_event_safe_row"(v_offer));
  end if;
  if v_offer."status" = 'sold_out' or (v_offer."capacity_limit" is not null and v_offer."passes_sold" >= v_offer."capacity_limit") then
    return jsonb_build_object('allowed', false, 'reason', 'sold_out', 'requiresPurchase', false, 'offer', public."paid_creator_event_safe_row"(v_offer));
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'event_pass_required',
    'requiresPurchase', true,
    'priceCents', v_offer."price_cents",
    'currency', v_offer."currency",
    'creatorId', v_offer."creator_id",
    'provider', v_offer."provider",
    'providerProductId', v_offer."provider_product_id",
    'providerProductKey', v_offer."provider_product_key",
    'offer', public."paid_creator_event_safe_row"(v_offer)
  );
end;
$$;

create or replace function public."create_paid_creator_event_pass_purchase_intent"(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer public."paid_creator_events"%rowtype;
  v_source_event public."creator_events"%rowtype;
  v_access jsonb;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_offer
  from public."paid_creator_events"
  where "id" = p_event_id
  limit 1;

  if v_offer."id" is null then
    raise exception 'offer_not_found';
  end if;

  select * into v_source_event
  from public."creator_events"
  where "id" = v_offer."creator_event_id"
  limit 1;

  if v_source_event."id" is null or v_source_event."status" in ('expired', 'canceled') then
    raise exception 'event_unavailable';
  end if;
  if v_offer."creator_id" = v_user_id or v_source_event."host_user_id" = v_user_id then
    raise exception 'creator_cannot_buy_own_event_pass';
  end if;

  v_access := public."resolve_paid_creator_event_pass_access"(v_offer."creator_event_id");
  if coalesce((v_access->>'allowed')::boolean, false) then
    return jsonb_build_object('alreadyPurchased', true, 'access', v_access);
  end if;
  if coalesce((v_access->>'requiresPurchase')::boolean, false) is not true then
    raise exception '%', coalesce(v_access->>'reason', 'event_pass_not_available');
  end if;

  return public."create_money_purchase_intent"(
    'event_pass_sandbox_099',
    'event',
    v_offer."creator_event_id",
    jsonb_build_object(
      'creator_id', v_offer."creator_id",
      'amount_minor', v_offer."price_cents",
      'currency', v_offer."currency",
      'source_surface', 'paid_event_page',
      'creator_event_id', v_offer."creator_event_id",
      'paid_event_offer_id', v_offer."id",
      'paid_events_v1', true,
      'premium_unlock', false,
      'tips_path', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'vip_unlock', false,
      'subscription_unlock', false,
      'room_media_controls', false,
      'grants_host_authority', false
    )
  );
end;
$$;

create or replace function public."prevent_paid_creator_event_pass_oversell"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public."paid_creator_events"%rowtype;
  v_active_count integer := 0;
begin
  if new."status" <> 'active' then
    return new;
  end if;

  select * into v_offer
  from public."paid_creator_events"
  where "id" = new."event_id"
  for update;

  if v_offer."id" is null or v_offer."capacity_limit" is null then
    return new;
  end if;

  select count(*)::integer into v_active_count
  from public."paid_creator_event_passes" event_pass
  where event_pass."event_id" = new."event_id"
    and event_pass."status" = 'active'
    and event_pass."refunded_at" is null
    and event_pass."revoked_at" is null
    and (event_pass."expires_at" is null or event_pass."expires_at" > timezone('utc'::text, now()));

  if v_active_count < v_offer."capacity_limit" then
    return new;
  end if;

  update public."creator_event_transactions"
  set
    "status" = 'canceled',
    "metadata" = "metadata" || jsonb_build_object('blocked_reason', 'sold_out', 'access_granted', false)
  where "id" = new."source_transaction_id";

  update public."paid_creator_events"
  set
    "status" = 'sold_out',
    "passes_sold" = v_active_count,
    "updated_at" = timezone('utc'::text, now())
  where "id" = new."event_id";

  insert into public."paid_event_events" ("event_id", "transaction_id", "actor_id", "event_type", "metadata")
  values (
    new."event_id",
    new."source_transaction_id",
    new."buyer_id",
    'pass_blocked_sold_out',
    jsonb_build_object('sandbox_only', true, 'access_granted', false)
  );

  return null;
end;
$$;

drop trigger if exists "prevent_paid_creator_event_pass_oversell_insert" on public."paid_creator_event_passes";
create trigger "prevent_paid_creator_event_pass_oversell_insert"
  before insert on public."paid_creator_event_passes"
  for each row
  execute function public."prevent_paid_creator_event_pass_oversell"();

create or replace function public."sync_paid_creator_event_pass_from_access_grant"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public."paid_creator_events"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_transaction public."creator_event_transactions"%rowtype;
  v_pass public."paid_creator_event_passes"%rowtype;
  v_active boolean;
begin
  if new."grant_type" <> 'event_pass' or new."source_id" is null then
    return new;
  end if;

  select * into v_offer
  from public."paid_creator_events"
  where "creator_event_id" = new."source_id"
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

  insert into public."creator_event_transactions" (
    "event_id",
    "creator_event_id",
    "creator_id",
    "buyer_id",
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
    v_offer."creator_event_id",
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
      'vip_unlock', false,
      'subscription_unlock', false,
      'room_media_controls', false,
      'grants_host_authority', false
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
    if v_offer."capacity_limit" is not null
      and not exists (
        select 1
        from public."paid_creator_event_passes" existing_pass
        where existing_pass."event_id" = v_offer."id"
          and existing_pass."buyer_id" = new."user_id"
          and existing_pass."status" = 'active'
      )
      and (
        select count(*)::integer
        from public."paid_creator_event_passes" event_pass
        where event_pass."event_id" = v_offer."id"
          and event_pass."status" = 'active'
          and event_pass."refunded_at" is null
          and event_pass."revoked_at" is null
          and (event_pass."expires_at" is null or event_pass."expires_at" > timezone('utc'::text, now()))
      ) >= v_offer."capacity_limit"
    then
      update public."creator_event_transactions"
      set
        "status" = 'canceled',
        "metadata" = "metadata" || jsonb_build_object('blocked_reason', 'sold_out', 'access_granted', false)
      where "id" = v_transaction."id";

      update public."paid_creator_events"
      set
        "status" = 'sold_out',
        "updated_at" = timezone('utc'::text, now())
      where "id" = v_offer."id";

      insert into public."paid_event_events" ("event_id", "transaction_id", "actor_id", "event_type", "metadata")
      values (
        v_offer."id",
        v_transaction."id",
        new."user_id",
        'pass_blocked_sold_out',
        jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
      );

      return new;
    end if;

    insert into public."paid_creator_event_passes" (
      "event_id",
      "creator_event_id",
      "buyer_id",
      "creator_id",
      "source_transaction_id",
      "access_grant_id",
      "provider",
      "provider_transaction_id",
      "status",
      "expires_at",
      "metadata"
    )
    values (
      v_offer."id",
      v_offer."creator_event_id",
      new."user_id",
      v_offer."creator_id",
      v_transaction."id",
      new."id",
      coalesce(new."provider", 'revenuecat_google_play'),
      v_provider."provider_event_id",
      'active',
      new."expires_at",
      jsonb_build_object(
        'sandbox_only', new."environment" = 'sandbox',
        'viewer_access_only', true,
        'room_media_controls', false,
        'grants_host_authority', false
      )
    )
    on conflict ("event_id", "buyer_id")
    where "status" = 'active'
    do update set
      "access_grant_id" = excluded."access_grant_id",
      "source_transaction_id" = excluded."source_transaction_id",
      "provider_transaction_id" = excluded."provider_transaction_id",
      "expires_at" = excluded."expires_at"
    returning * into v_pass;

    update public."paid_creator_events" offer
    set
      "passes_sold" = (
        select count(*)::integer
        from public."paid_creator_event_passes" event_pass
        where event_pass."event_id" = offer."id"
          and event_pass."status" = 'active'
          and event_pass."refunded_at" is null
          and event_pass."revoked_at" is null
          and (event_pass."expires_at" is null or event_pass."expires_at" > timezone('utc'::text, now()))
      ),
      "status" = case
        when offer."capacity_limit" is not null
          and (
            select count(*)::integer
            from public."paid_creator_event_passes" event_pass
            where event_pass."event_id" = offer."id"
              and event_pass."status" = 'active'
              and event_pass."refunded_at" is null
              and event_pass."revoked_at" is null
          ) >= offer."capacity_limit"
        then 'sold_out'
        else offer."status"
      end,
      "updated_at" = timezone('utc'::text, now())
    where offer."id" = v_offer."id";
  else
    update public."paid_creator_event_passes"
    set
      "status" = case when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'expired' end,
      "refunded_at" = new."refunded_at",
      "revoked_at" = coalesce(new."revoked_at", timezone('utc'::text, now()))
    where "access_grant_id" = new."id"
      and "status" = 'active';
  end if;

  insert into public."paid_event_events" ("event_id", "pass_id", "transaction_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_pass."id",
    v_transaction."id",
    new."user_id",
    case when v_active then 'event_pass_verified' else 'event_pass_revoked' end,
    jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
  );

  return new;
end;
$$;

drop trigger if exists "sync_paid_creator_event_pass_grant_insert" on public."access_grants";
create trigger "sync_paid_creator_event_pass_grant_insert"
  after insert on public."access_grants"
  for each row
  execute function public."sync_paid_creator_event_pass_from_access_grant"();

drop trigger if exists "sync_paid_creator_event_pass_grant_update" on public."access_grants";
create trigger "sync_paid_creator_event_pass_grant_update"
  after update of "status", "refunded_at", "revoked_at", "expires_at" on public."access_grants"
  for each row
  execute function public."sync_paid_creator_event_pass_from_access_grant"();

create or replace function public."list_my_paid_creator_event_offers"()
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
    select jsonb_agg(public."paid_creator_event_safe_row"(event_offer) order by event_offer."updated_at" desc)
    from public."paid_creator_events" event_offer
    where event_offer."creator_id" = v_actor_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public."list_my_paid_creator_event_transactions"(p_limit integer default 50)
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
      'eventId', tx."event_id",
      'creatorEventId', tx."creator_event_id",
      'eventTitle', event_offer."title",
      'buyerId', tx."buyer_id",
      'creatorId', tx."creator_id",
      'amountCents', tx."amount_cents",
      'currency', tx."currency",
      'provider', tx."provider",
      'providerProductId', tx."provider_product_id",
      'status', tx."status",
      'payoutStatus', tx."payout_status",
      'environment', 'sandbox',
      'passCount', event_offer."passes_sold",
      'createdAt', tx."created_at",
      'paidAt', tx."paid_at",
      'metadata', jsonb_build_object(
        'sandboxOnly', true,
        'premiumUnlock', false,
        'tipsPath', false,
        'paidVideoUnlock', false,
        'paidWatchPartyTicketUnlock', false,
        'vipUnlock', false,
        'subscriptionUnlock', false
      )
    ) order by tx."created_at" desc)
    from (
      select *
      from public."creator_event_transactions"
      where "creator_id" = v_actor_id
      order by "created_at" desc
      limit v_limit
    ) tx
    left join public."paid_creator_events" event_offer on event_offer."id" = tx."event_id"
  ), '[]'::jsonb);
end;
$$;

revoke all on function public."paid_creator_event_safe_row"(public."paid_creator_events") from public;
revoke all on function public."set_paid_creator_event_offer"(uuid, text, integer, integer, text) from public;
revoke all on function public."resolve_paid_creator_event_pass_access"(uuid) from public;
revoke all on function public."create_paid_creator_event_pass_purchase_intent"(uuid) from public;
revoke all on function public."prevent_paid_creator_event_pass_oversell"() from public;
revoke all on function public."sync_paid_creator_event_pass_from_access_grant"() from public;
revoke all on function public."list_my_paid_creator_event_offers"() from public;
revoke all on function public."list_my_paid_creator_event_transactions"(integer) from public;

grant execute on function public."set_paid_creator_event_offer"(uuid, text, integer, integer, text) to authenticated;
grant execute on function public."resolve_paid_creator_event_pass_access"(uuid) to anon, authenticated;
grant execute on function public."create_paid_creator_event_pass_purchase_intent"(uuid) to authenticated;
grant execute on function public."list_my_paid_creator_event_offers"() to authenticated;
grant execute on function public."list_my_paid_creator_event_transactions"(integer) to authenticated;

comment on table public."paid_creator_events" is
  'Sandbox-only creator paid event offers. Event passes unlock only the linked creator event surface and never grant Premium, Tips, Paid Videos, Paid Watch-Party rooms, VIP, subscriptions, LiveKit publish, host authority, payouts, or live money.';
comment on table public."paid_creator_event_passes" is
  'Verified event passes created only from provider-backed event_pass access grants or admin/operator service paths. Active passes are viewer access only and not payable in sandbox.';
comment on function public."resolve_paid_creator_event_pass_access"(uuid) is
  'Read-only paid event gate for Paid Events V1. Event routes use this before access; direct deep links must not bypass it.';
