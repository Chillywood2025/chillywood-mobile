-- Paid Events V1 metadata safety follow-up.
-- Keeps LiveKit behavior unchanged; this only renames metadata keys that were rejected by safety constraints.
-- Event passes still grant no room media controls, host authority, Premium, VIP, Tips, paid-video, Watch-Party, payout, or live-money access.

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
