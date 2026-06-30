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
  if v_source_event."status" in ('ended', 'expired', 'canceled', 'removed', 'unsafe', 'blocked') then
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

  if v_source_event."id" is null or v_source_event."status" in ('ended', 'expired', 'canceled', 'removed', 'unsafe', 'blocked') then
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
