-- Repair the existing private writer while retaining the public creator
-- authority wrapper, approved price/catalog, rollout checks and grants.
create or replace function public."set_paid_creator_event_offer_pre_integrity_closeout"(
  p_creator_event_id uuid,
  p_description text default null,
  p_price_cents integer default 99,
  p_capacity_limit integer default null,
  p_status text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  limit 1
  for update;

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

  -- A partial unique index cannot conflict on canceled/archived/draft rows.
  -- Serialize on the source event and update the current offer explicitly.
  select offer.* into v_offer
  from public."paid_creator_events" offer
  where offer."creator_event_id"=p_creator_event_id
    and offer."status" in ('sandbox','active','paused','sold_out','blocked','draft')
  order by (offer."status"<>'draft') desc,offer."updated_at" desc,offer."id" desc
  limit 1 for update;

  if v_offer."id" is not null then
    update public."paid_creator_events"
    set "title"=coalesce(nullif(trim(v_source_event."event_title"),''),'Creator event pass'),
        "description"=nullif(trim(p_description),''),
        "event_type"=v_source_event."event_type",
        "starts_at"=v_source_event."starts_at",
        "ends_at"=v_source_event."ends_at",
        "price_cents"=v_price_cents,
        "currency"='usd',
        "capacity_limit"=p_capacity_limit,
        "status"=v_status,
        "provider"='revenuecat_google_play',
        "provider_product_key"=v_product."product_key",
        "provider_product_id"=v_product."provider_product_id",
        "updated_at"=timezone('utc'::text,now())
    where "id"=v_offer."id"
    returning * into v_offer;
  else
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
  returning * into v_offer;
  end if;

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
revoke all on function public."set_paid_creator_event_offer_pre_integrity_closeout"(uuid,text,integer,integer,text)
  from public,anon,authenticated,service_role;

