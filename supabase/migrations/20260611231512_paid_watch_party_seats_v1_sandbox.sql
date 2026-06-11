-- Paid Watch-Party Seats / Room Tickets V1 sandbox bridge.
-- Uses the existing RevenueCat / Google Play dynamic sandbox purchase rail.
-- This does not enable live money, payouts, Premium unlocks, Tips, Paid Videos,
-- LiveKit publish authority, host authority, Live Stage routing, or Party Room
-- route ownership changes.

update public."platform_money_kill_switches"
set
  "state" = 'sandbox_only',
  "reason" = coalesce("reason", 'Paid Watch-Party Seats V1 sandbox setup enabled. Live money remains off.'),
  "updated_at" = timezone('utc'::text, now())
where "key" in ('watch_party_tickets_enabled', 'watch_party_seats_enabled')
  and "state" = 'off';

create table if not exists public."paid_watch_party_offers" (
  "id" uuid primary key default gen_random_uuid(),
  "party_id" text,
  "creator_id" uuid not null,
  "host_id" uuid not null,
  "title_id" text,
  "video_id" uuid,
  "title" text not null default 'Watch-Party ticket',
  "description" text,
  "price_cents" integer not null default 99,
  "currency" text not null default 'usd',
  "seat_limit" integer,
  "seats_sold" integer not null default 0,
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "status" text not null default 'draft',
  "provider" text not null default 'revenuecat_google_play',
  "provider_product_key" text,
  "provider_product_id" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "paid_watch_party_offers_status_check"
    check ("status" in ('draft', 'sandbox', 'active', 'paused', 'sold_out', 'canceled', 'blocked', 'archived')),
  constraint "paid_watch_party_offers_price_check" check ("price_cents" >= 0),
  constraint "paid_watch_party_offers_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "paid_watch_party_offers_seat_limit_check" check ("seat_limit" is null or "seat_limit" > 0),
  constraint "paid_watch_party_offers_seats_sold_check" check ("seats_sold" >= 0),
  constraint "paid_watch_party_offers_provider_check" check ("provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')),
  constraint "paid_watch_party_offers_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)'),
  constraint "paid_watch_party_offers_sandbox_active_check"
    check ("status" <> 'active' or coalesce(("metadata"->>'live_money_enabled_at_activation')::boolean, false) = true)
);

create unique index if not exists "paid_watch_party_offers_party_active_unique"
  on public."paid_watch_party_offers" ("party_id")
  where "party_id" is not null and "status" in ('sandbox', 'active', 'paused', 'sold_out', 'blocked');

create index if not exists "paid_watch_party_offers_creator_idx"
  on public."paid_watch_party_offers" ("creator_id", "updated_at" desc);

create index if not exists "paid_watch_party_offers_party_idx"
  on public."paid_watch_party_offers" ("party_id", "status");

create table if not exists public."paid_watch_party_tickets" (
  "id" uuid primary key default gen_random_uuid(),
  "offer_id" uuid not null references public."paid_watch_party_offers"("id") on delete restrict,
  "party_id" text,
  "buyer_id" uuid not null,
  "creator_id" uuid not null,
  "host_id" uuid not null,
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
  constraint "paid_watch_party_tickets_status_check"
    check ("status" in ('active', 'refunded', 'revoked', 'expired', 'canceled')),
  constraint "paid_watch_party_tickets_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create unique index if not exists "paid_watch_party_tickets_active_unique"
  on public."paid_watch_party_tickets" ("offer_id", "buyer_id")
  where "status" = 'active';

create index if not exists "paid_watch_party_tickets_buyer_idx"
  on public."paid_watch_party_tickets" ("buyer_id", "status", "created_at" desc);

create index if not exists "paid_watch_party_tickets_party_idx"
  on public."paid_watch_party_tickets" ("party_id", "buyer_id", "status");

create table if not exists public."creator_room_ticket_transactions" (
  "id" uuid primary key default gen_random_uuid(),
  "offer_id" uuid not null references public."paid_watch_party_offers"("id") on delete restrict,
  "party_id" text,
  "creator_id" uuid not null,
  "host_id" uuid not null,
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
  constraint "creator_room_ticket_transactions_status_check"
    check ("status" in ('pending', 'paid', 'failed', 'canceled', 'refunded', 'revoked')),
  constraint "creator_room_ticket_transactions_amount_check" check ("amount_cents" >= 0),
  constraint "creator_room_ticket_transactions_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "creator_room_ticket_transactions_payout_check"
    check ("payout_status" in ('not_payable', 'pending_verification', 'payable', 'paid', 'refunded', 'reversed', 'chargeback')),
  constraint "creator_room_ticket_transactions_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create index if not exists "creator_room_ticket_transactions_creator_idx"
  on public."creator_room_ticket_transactions" ("creator_id", "created_at" desc);

create unique index if not exists "creator_room_ticket_transactions_provider_event_unique"
  on public."creator_room_ticket_transactions" ("provider_event_id")
  where "provider_event_id" is not null;

create table if not exists public."room_ticket_events" (
  "id" uuid primary key default gen_random_uuid(),
  "offer_id" uuid references public."paid_watch_party_offers"("id") on delete set null,
  "ticket_id" uuid references public."paid_watch_party_tickets"("id") on delete set null,
  "transaction_id" uuid references public."creator_room_ticket_transactions"("id") on delete set null,
  "actor_id" uuid,
  "event_type" text not null,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "room_ticket_events_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)')
);

create index if not exists "room_ticket_events_offer_idx"
  on public."room_ticket_events" ("offer_id", "created_at" desc);

drop trigger if exists "touch_paid_watch_party_offers_updated_at" on public."paid_watch_party_offers";
create trigger "touch_paid_watch_party_offers_updated_at"
  before update on public."paid_watch_party_offers"
  for each row execute function public."touch_money_access_updated_at"();

alter table public."paid_watch_party_offers" enable row level security;
alter table public."paid_watch_party_tickets" enable row level security;
alter table public."creator_room_ticket_transactions" enable row level security;
alter table public."room_ticket_events" enable row level security;

create policy "paid_watch_party_offers_select_public_active"
  on public."paid_watch_party_offers" for select to authenticated
  using (
    "status" in ('sandbox', 'active', 'sold_out')
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "paid_watch_party_offers_write_creator_owner_operator"
  on public."paid_watch_party_offers" for all to authenticated
  using ("creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check ("creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "paid_watch_party_tickets_select_participant_owner_operator"
  on public."paid_watch_party_tickets" for select to authenticated
  using (
    "buyer_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "paid_watch_party_tickets_write_owner_operator"
  on public."paid_watch_party_tickets" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_room_ticket_transactions_select_participant_owner_operator"
  on public."creator_room_ticket_transactions" for select to authenticated
  using (
    "buyer_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "creator_room_ticket_transactions_write_owner_operator"
  on public."creator_room_ticket_transactions" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "room_ticket_events_select_creator_owner_operator"
  on public."room_ticket_events" for select to authenticated
  using (
    exists (
      select 1 from public."paid_watch_party_offers" offer
      where offer."id" = room_ticket_events."offer_id"
        and offer."creator_id" = auth.uid()
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "room_ticket_events_write_owner_operator"
  on public."room_ticket_events" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."paid_watch_party_offers" from anon, authenticated;
revoke all on table public."paid_watch_party_tickets" from anon, authenticated;
revoke all on table public."creator_room_ticket_transactions" from anon, authenticated;
revoke all on table public."room_ticket_events" from anon, authenticated;
grant select, insert, update on table public."paid_watch_party_offers" to authenticated;
grant select on table public."paid_watch_party_tickets" to authenticated;
grant select on table public."creator_room_ticket_transactions" to authenticated;
grant select on table public."room_ticket_events" to authenticated;
grant all on table public."paid_watch_party_offers" to service_role;
grant all on table public."paid_watch_party_tickets" to service_role;
grant all on table public."creator_room_ticket_transactions" to service_role;
grant all on table public."room_ticket_events" to service_role;

create or replace function public."paid_watch_party_offer_safe_row"(offer_row public."paid_watch_party_offers")
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', offer_row."id",
    'partyId', offer_row."party_id",
    'creatorId', offer_row."creator_id",
    'hostId', offer_row."host_id",
    'titleId', offer_row."title_id",
    'videoId', offer_row."video_id",
    'title', offer_row."title",
    'description', offer_row."description",
    'priceCents', offer_row."price_cents",
    'currency', offer_row."currency",
    'seatLimit', offer_row."seat_limit",
    'seatsSold', offer_row."seats_sold",
    'startsAt', offer_row."starts_at",
    'endsAt', offer_row."ends_at",
    'status', offer_row."status",
    'provider', offer_row."provider",
    'providerProductKey', offer_row."provider_product_key",
    'providerProductId', offer_row."provider_product_id",
    'createdAt', offer_row."created_at",
    'updatedAt', offer_row."updated_at"
  );
$$;

create or replace function public."set_paid_watch_party_offer"(
  p_party_id text,
  p_title text default null,
  p_price_cents integer default 99,
  p_seat_limit integer default null,
  p_status text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_party_id text := upper(trim(coalesce(p_party_id, '')));
  v_room public."watch_party_rooms"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_status text := lower(trim(coalesce(p_status, 'sandbox')));
  v_price_cents integer := greatest(coalesce(p_price_cents, 99), 0);
  v_offer public."paid_watch_party_offers"%rowtype;
  v_tickets_switch text := coalesce((
    select "state" from public."platform_money_kill_switches"
    where "key" = 'watch_party_tickets_enabled'
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
  if v_party_id = '' then
    raise exception 'party_id_required';
  end if;
  if v_status not in ('draft', 'sandbox', 'paused', 'canceled', 'archived') then
    raise exception 'unsupported_offer_status';
  end if;
  if p_seat_limit is not null and p_seat_limit <= 0 then
    raise exception 'seat_limit_invalid';
  end if;
  if v_price_cents <> 99 then
    raise exception 'approved_sandbox_price_required';
  end if;
  if v_tickets_switch not in ('sandbox_only', 'on') then
    raise exception 'watch_party_tickets_disabled';
  end if;
  if v_provider_switch not in ('sandbox_only', 'on') then
    raise exception 'provider_not_ready';
  end if;

  select * into v_room
  from public."watch_party_rooms"
  where upper("party_id") = v_party_id
  limit 1;

  if v_room."party_id" is null then
    raise exception 'party_room_not_found';
  end if;
  if v_room."room_type" <> 'title' then
    raise exception 'paid_watch_party_must_route_to_party_room';
  end if;
  if v_room."host_user_id" <> v_actor_id::text and not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'room_host_required';
  end if;

  select * into v_product
  from public."monetization_products"
  where "product_key" = 'watch_party_live_ticket_sandbox_099'
    and "product_type" = 'watch_party_live_ticket'
    and "provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')
    and "environment" = 'sandbox'
    and "status" = 'sandbox'
  limit 1;

  if v_product."id" is null or nullif(trim(coalesce(v_product."provider_product_id", '')), '') is null then
    raise exception 'provider_product_missing';
  end if;

  insert into public."paid_watch_party_offers" (
    "party_id",
    "creator_id",
    "host_id",
    "title_id",
    "video_id",
    "title",
    "price_cents",
    "currency",
    "seat_limit",
    "status",
    "provider",
    "provider_product_key",
    "provider_product_id",
    "metadata"
  )
  values (
    v_room."party_id",
    v_actor_id,
    v_actor_id,
    v_room."title_id",
    case when v_room."source_type" = 'creator_video' and v_room."source_id" ~* '^[0-9a-f-]{36}$' then v_room."source_id"::uuid else null end,
    coalesce(nullif(trim(p_title), ''), 'Watch-Party ticket'),
    v_price_cents,
    'usd',
    p_seat_limit,
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
      'live_stage_access', false,
      'grants_livekit_publish', false,
      'grants_host_authority', false,
      'live_money_enabled_at_save', coalesce((select "state" = 'on' from public."platform_money_kill_switches" where "key" = 'live_money_enabled'), false)
    )
  )
  on conflict ("party_id")
  where "party_id" is not null and "status" in ('sandbox', 'active', 'paused', 'sold_out', 'blocked')
  do update set
    "title" = excluded."title",
    "price_cents" = excluded."price_cents",
    "currency" = excluded."currency",
    "seat_limit" = excluded."seat_limit",
    "status" = excluded."status",
    "provider" = excluded."provider",
    "provider_product_key" = excluded."provider_product_key",
    "provider_product_id" = excluded."provider_product_id",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now())
  returning * into v_offer;

  insert into public."room_ticket_events" ("offer_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_actor_id,
    'offer_saved',
    jsonb_build_object('status', v_offer."status", 'sandbox_only', true, 'not_payable', true)
  );

  return public."paid_watch_party_offer_safe_row"(v_offer);
end;
$$;

create or replace function public."resolve_paid_watch_party_ticket_access"(p_party_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_party_id text := upper(trim(coalesce(p_party_id, '')));
  v_room public."watch_party_rooms"%rowtype;
  v_offer public."paid_watch_party_offers"%rowtype;
  v_ticket public."paid_watch_party_tickets"%rowtype;
begin
  if v_party_id = '' then
    return jsonb_build_object('allowed', false, 'reason', 'party_id_required', 'requiresPurchase', false);
  end if;

  select * into v_room
  from public."watch_party_rooms"
  where upper("party_id") = v_party_id
  limit 1;

  if v_room."party_id" is null or coalesce(v_room."is_active", false) is not true then
    return jsonb_build_object('allowed', false, 'reason', 'room_unavailable', 'requiresPurchase', false);
  end if;

  select * into v_offer
  from public."paid_watch_party_offers"
  where upper(coalesce("party_id", '')) = v_party_id
    and "status" in ('sandbox', 'active', 'sold_out', 'paused', 'blocked')
  order by "updated_at" desc
  limit 1;

  if v_offer."id" is null then
    return jsonb_build_object('allowed', true, 'reason', 'free_room', 'requiresPurchase', false);
  end if;

  if v_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'auth_required',
      'requiresPurchase', true,
      'offer', public."paid_watch_party_offer_safe_row"(v_offer)
    );
  end if;

  if v_room."host_user_id" = v_user_id::text or v_offer."creator_id" = v_user_id or public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object('allowed', true, 'reason', 'host_or_admin', 'requiresPurchase', false, 'offer', public."paid_watch_party_offer_safe_row"(v_offer));
  end if;

  select * into v_ticket
  from public."paid_watch_party_tickets"
  where "offer_id" = v_offer."id"
    and "buyer_id" = v_user_id
    and "status" = 'active'
    and "refunded_at" is null
    and "revoked_at" is null
    and ("expires_at" is null or "expires_at" > timezone('utc'::text, now()))
  order by "created_at" desc
  limit 1;

  if v_ticket."id" is not null then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'ticket_confirmed',
      'requiresPurchase', false,
      'ticketId', v_ticket."id",
      'offer', public."paid_watch_party_offer_safe_row"(v_offer)
    );
  end if;

  if v_offer."status" = 'paused' then
    return jsonb_build_object('allowed', false, 'reason', 'offer_paused', 'requiresPurchase', false, 'offer', public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  if v_offer."status" in ('blocked', 'canceled', 'archived') then
    return jsonb_build_object('allowed', false, 'reason', 'offer_blocked', 'requiresPurchase', false, 'offer', public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  if v_offer."status" = 'sold_out' or (v_offer."seat_limit" is not null and v_offer."seats_sold" >= v_offer."seat_limit") then
    return jsonb_build_object('allowed', false, 'reason', 'sold_out', 'requiresPurchase', false, 'offer', public."paid_watch_party_offer_safe_row"(v_offer));
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'ticket_required',
    'requiresPurchase', true,
    'priceCents', v_offer."price_cents",
    'currency', v_offer."currency",
    'creatorId', v_offer."creator_id",
    'provider', v_offer."provider",
    'providerProductId', v_offer."provider_product_id",
    'providerProductKey', v_offer."provider_product_key",
    'offer', public."paid_watch_party_offer_safe_row"(v_offer)
  );
end;
$$;

create or replace function public."create_paid_watch_party_ticket_purchase_intent"(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer public."paid_watch_party_offers"%rowtype;
  v_room public."watch_party_rooms"%rowtype;
  v_access jsonb;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_offer
  from public."paid_watch_party_offers"
  where "id" = p_offer_id
  limit 1;

  if v_offer."id" is null then
    raise exception 'offer_not_found';
  end if;

  select * into v_room
  from public."watch_party_rooms"
  where "party_id" = v_offer."party_id"
  limit 1;

  if v_room."party_id" is null or coalesce(v_room."is_active", false) is not true then
    raise exception 'room_unavailable';
  end if;
  if v_room."room_type" <> 'title' then
    raise exception 'paid_watch_party_must_route_to_party_room';
  end if;
  if v_offer."creator_id" = v_user_id or v_room."host_user_id" = v_user_id::text then
    raise exception 'creator_cannot_buy_own_ticket';
  end if;

  v_access := public."resolve_paid_watch_party_ticket_access"(v_offer."party_id");
  if coalesce((v_access->>'allowed')::boolean, false) then
    return jsonb_build_object('alreadyPurchased', true, 'access', v_access);
  end if;
  if coalesce((v_access->>'requiresPurchase')::boolean, false) is not true then
    raise exception '%', coalesce(v_access->>'reason', 'ticket_not_available');
  end if;

  return public."create_money_purchase_intent"(
    'watch_party_live_ticket_sandbox_099',
    'watch_party_live',
    v_offer."id",
    jsonb_build_object(
      'creator_id', v_offer."creator_id",
      'amount_minor', v_offer."price_cents",
      'currency', v_offer."currency",
      'source_surface', 'paid_watch_party_waiting_room',
      'party_id', v_offer."party_id",
      'offer_id', v_offer."id",
      'paid_watch_party_seats_v1', true,
      'premium_unlock', false,
      'tips_path', false,
      'paid_video_unlock', false,
      'live_stage_access', false,
      'grants_livekit_publish', false,
      'grants_host_authority', false
    )
  );
end;
$$;

create or replace function public."sync_paid_watch_party_ticket_from_access_grant"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public."paid_watch_party_offers"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_transaction public."creator_room_ticket_transactions"%rowtype;
  v_ticket public."paid_watch_party_tickets"%rowtype;
  v_active boolean;
begin
  if new."grant_type" <> 'watch_party_live_ticket' or new."source_id" is null then
    return new;
  end if;

  select * into v_offer
  from public."paid_watch_party_offers"
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

  insert into public."creator_room_ticket_transactions" (
    "offer_id",
    "party_id",
    "creator_id",
    "host_id",
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
    v_offer."party_id",
    v_offer."creator_id",
    v_offer."host_id",
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
      'live_stage_access', false,
      'grants_livekit_publish', false,
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
    if v_offer."seat_limit" is not null
      and not exists (
        select 1
        from public."paid_watch_party_tickets" existing_ticket
        where existing_ticket."offer_id" = v_offer."id"
          and existing_ticket."buyer_id" = new."user_id"
          and existing_ticket."status" = 'active'
      )
      and (
        select count(*)::integer
        from public."paid_watch_party_tickets" ticket
        where ticket."offer_id" = v_offer."id"
          and ticket."status" = 'active'
          and ticket."refunded_at" is null
          and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at" > timezone('utc'::text, now()))
      ) >= v_offer."seat_limit"
    then
      update public."creator_room_ticket_transactions"
      set
        "status" = 'canceled',
        "metadata" = "metadata" || jsonb_build_object('blocked_reason', 'sold_out', 'access_granted', false)
      where "id" = v_transaction."id";

      update public."paid_watch_party_offers"
      set
        "status" = 'sold_out',
        "updated_at" = timezone('utc'::text, now())
      where "id" = v_offer."id";

      insert into public."room_ticket_events" ("offer_id", "transaction_id", "actor_id", "event_type", "metadata")
      values (
        v_offer."id",
        v_transaction."id",
        new."user_id",
        'ticket_blocked_sold_out',
        jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
      );

      return new;
    end if;

    insert into public."paid_watch_party_tickets" (
      "offer_id",
      "party_id",
      "buyer_id",
      "creator_id",
      "host_id",
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
      v_offer."party_id",
      new."user_id",
      v_offer."creator_id",
      v_offer."host_id",
      v_transaction."id",
      new."id",
      coalesce(new."provider", 'revenuecat_google_play'),
      v_provider."provider_event_id",
      'active',
      new."expires_at",
      jsonb_build_object(
        'sandbox_only', new."environment" = 'sandbox',
        'viewer_access_only', true,
        'grants_livekit_publish', false,
        'grants_host_authority', false
      )
    )
    on conflict ("offer_id", "buyer_id")
    where "status" = 'active'
    do update set
      "access_grant_id" = excluded."access_grant_id",
      "source_transaction_id" = excluded."source_transaction_id",
      "provider_transaction_id" = excluded."provider_transaction_id",
      "expires_at" = excluded."expires_at"
    returning * into v_ticket;

    update public."paid_watch_party_offers" offer
    set
      "seats_sold" = (
        select count(*)::integer
        from public."paid_watch_party_tickets" ticket
        where ticket."offer_id" = offer."id"
          and ticket."status" = 'active'
          and ticket."refunded_at" is null
          and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at" > timezone('utc'::text, now()))
      ),
      "status" = case
        when offer."seat_limit" is not null
          and (
            select count(*)::integer
            from public."paid_watch_party_tickets" ticket
            where ticket."offer_id" = offer."id"
              and ticket."status" = 'active'
              and ticket."refunded_at" is null
              and ticket."revoked_at" is null
          ) >= offer."seat_limit"
        then 'sold_out'
        else offer."status"
      end,
      "updated_at" = timezone('utc'::text, now())
    where offer."id" = v_offer."id";
  else
    update public."paid_watch_party_tickets"
    set
      "status" = case when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'expired' end,
      "refunded_at" = new."refunded_at",
      "revoked_at" = coalesce(new."revoked_at", timezone('utc'::text, now()))
    where "access_grant_id" = new."id"
      and "status" = 'active';
  end if;

  insert into public."room_ticket_events" ("offer_id", "ticket_id", "transaction_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_ticket."id",
    v_transaction."id",
    new."user_id",
    case when v_active then 'ticket_verified' else 'ticket_revoked' end,
    jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
  );

  return new;
end;
$$;

drop trigger if exists "sync_paid_watch_party_ticket_grant_insert" on public."access_grants";
create trigger "sync_paid_watch_party_ticket_grant_insert"
  after insert on public."access_grants"
  for each row
  execute function public."sync_paid_watch_party_ticket_from_access_grant"();

drop trigger if exists "sync_paid_watch_party_ticket_grant_update" on public."access_grants";
create trigger "sync_paid_watch_party_ticket_grant_update"
  after update of "status", "refunded_at", "revoked_at", "expires_at" on public."access_grants"
  for each row
  execute function public."sync_paid_watch_party_ticket_from_access_grant"();

create or replace function public."list_my_paid_watch_party_offers"()
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
    select jsonb_agg(public."paid_watch_party_offer_safe_row"(offer) order by offer."updated_at" desc)
    from public."paid_watch_party_offers" offer
    where offer."creator_id" = v_actor_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public."list_my_paid_watch_party_transactions"(p_limit integer default 50)
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
      'partyId', tx."party_id",
      'roomTitle', offer."title",
      'buyerId', tx."buyer_id",
      'creatorId', tx."creator_id",
      'amountCents', tx."amount_cents",
      'currency', tx."currency",
      'provider', tx."provider",
      'providerProductId', tx."provider_product_id",
      'status', tx."status",
      'payoutStatus', tx."payout_status",
      'environment', 'sandbox',
      'seatCount', offer."seats_sold",
      'createdAt', tx."created_at",
      'paidAt', tx."paid_at",
      'metadata', jsonb_build_object(
        'sandboxOnly', true,
        'premiumUnlock', false,
        'tipsPath', false,
        'paidVideoUnlock', false,
        'liveStageAccess', false
      )
    ) order by tx."created_at" desc)
    from (
      select *
      from public."creator_room_ticket_transactions"
      where "creator_id" = v_actor_id
      order by "created_at" desc
      limit v_limit
    ) tx
    left join public."paid_watch_party_offers" offer on offer."id" = tx."offer_id"
  ), '[]'::jsonb);
end;
$$;

revoke all on function public."paid_watch_party_offer_safe_row"(public."paid_watch_party_offers") from public;
revoke all on function public."set_paid_watch_party_offer"(text, text, integer, integer, text) from public;
revoke all on function public."resolve_paid_watch_party_ticket_access"(text) from public;
revoke all on function public."create_paid_watch_party_ticket_purchase_intent"(uuid) from public;
revoke all on function public."sync_paid_watch_party_ticket_from_access_grant"() from public;
revoke all on function public."list_my_paid_watch_party_offers"() from public;
revoke all on function public."list_my_paid_watch_party_transactions"(integer) from public;

grant execute on function public."set_paid_watch_party_offer"(text, text, integer, integer, text) to authenticated;
grant execute on function public."resolve_paid_watch_party_ticket_access"(text) to anon, authenticated;
grant execute on function public."create_paid_watch_party_ticket_purchase_intent"(uuid) to authenticated;
grant execute on function public."list_my_paid_watch_party_offers"() to authenticated;
grant execute on function public."list_my_paid_watch_party_transactions"(integer) to authenticated;

comment on table public."paid_watch_party_offers" is
  'Sandbox-only creator Watch-Party ticket offers. A ticket unlocks only the linked Party Waiting Room / Party Room and never grants Premium, Tips, Paid Videos, Live Stage, LiveKit publish, host authority, payouts, or live money.';
comment on table public."paid_watch_party_tickets" is
  'Verified room tickets created only from provider-backed access grants or admin/operator service paths. Active tickets are viewer entry only and not payable in sandbox.';
comment on function public."resolve_paid_watch_party_ticket_access"(text) is
  'Read-only room-ticket gate for Paid Watch-Party Seats V1. Party Waiting Room and Party Room use this before entry; direct deep links must not bypass it.';
