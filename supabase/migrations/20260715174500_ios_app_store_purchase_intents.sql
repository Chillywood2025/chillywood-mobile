-- Bounded Apple purchase-intent lane for the finite sandbox catalog.
--
-- This migration deliberately does not replace or alter
-- create_money_purchase_intent. Android / Google Play callers keep their
-- existing function and provider identifiers. Apple callers may create only
-- exact, predeclared creator-tip or Watch-Party Seat Pass intents while every
-- production-money and payout switch remains off.

insert into public."monetization_products" (
  "product_key",
  "product_type",
  "display_name",
  "description",
  "provider",
  "environment",
  "status",
  "is_android_digital",
  "is_physical_good",
  "metadata"
)
values (
  'watch_party_ticket_store_catalog',
  'watch_party_live_ticket',
  'Watch-Party Seat Pass',
  'Conceptual finite-tier Watch-Party Seat Pass. A verified purchase grants entry to one bound Party Room only and never grants LiveKit, speaker, host, moderator, admin, or payout authority.',
  'internal_setup',
  'setup',
  'setup',
  false,
  false,
  jsonb_build_object(
    'conceptual_store_catalog', true,
    'viewer_only', true,
    'live_money_enabled_at_activation', false,
    'not_payable', true,
    'grants_room_authority', false
  )
)
on conflict ("product_key") do update
set
  "display_name" = excluded."display_name",
  "description" = excluded."description",
  "metadata" = public."monetization_products"."metadata" || excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

-- Correct the finite Seat Pass mappings to the existing Party Room access
-- product used by the client resolver. The permanent provider IDs, prices,
-- status, and safety columns are unchanged.
update public."monetization_product_store_mappings" mapping
set
  "product_id" = product."id",
  "updated_at" = timezone('utc'::text, now())
from public."monetization_products" product
where product."product_key" = 'watch_party_ticket_store_catalog'
  and mapping."concept" = 'seat_pass'
  and mapping."platform" = 'ios'
  and mapping."store" = 'app_store'
  and mapping."provider" = 'revenuecat_app_store';

create or replace function public."create_ios_app_store_purchase_intent"(
  p_provider_product_id text,
  p_source_type text,
  p_source_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_provider_product_id text := trim(coalesce(p_provider_product_id, ''));
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_offer public."paid_watch_party_offers"%rowtype;
  v_room public."watch_party_rooms"%rowtype;
  v_tip_settings public."creator_tip_settings"%rowtype;
  v_access jsonb;
  v_expected_source_type text;
  v_feature_switch_key text;
  v_feature_switch_state text;
  v_app_store_switch_state text := coalesce((
    select "state"
    from public."platform_money_kill_switches"
    where "key" = 'revenuecat_app_store_enabled'
    limit 1
  ), 'off');
  v_webhook_switch_state text := coalesce((
    select "state"
    from public."platform_money_kill_switches"
    where "key" = 'provider_webhooks_enabled'
    limit 1
  ), 'off');
  v_live_money_switch_state text := coalesce((
    select "state"
    from public."platform_money_kill_switches"
    where "key" = 'live_money_enabled'
    limit 1
  ), 'off');
  v_payouts_switch_state text := coalesce((
    select "state"
    from public."platform_money_kill_switches"
    where "key" = 'payouts_enabled'
    limit 1
  ), 'off');
  v_creator_id uuid;
  v_amount_minor integer;
  v_recent_intent_count integer := 0;
  v_intent public."money_purchase_intents"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if p_source_id is null then
    raise exception 'source_id_required';
  end if;
  if v_provider_product_id = '' then
    raise exception 'provider_product_id_required';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata_object_required';
  end if;
  if p_metadata::text ~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization)' then
    raise exception 'unsafe_metadata';
  end if;

  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  where mapping."platform" = 'ios'
    and mapping."store" = 'app_store'
    and mapping."provider" = 'revenuecat_app_store'
    and mapping."provider_product_id" = v_provider_product_id
  limit 1;

  if v_mapping."id" is null then
    raise exception 'ios_app_store_mapping_not_found';
  end if;
  if v_mapping."concept" not in ('creator_tip', 'seat_pass')
    or v_mapping."store_product_type" <> 'consumable'
  then
    raise exception 'ios_app_store_concept_not_purchase_intent_enabled';
  end if;
  if v_mapping."environment" <> 'sandbox' or v_mapping."status" <> 'sandbox' then
    raise exception 'ios_app_store_sandbox_mapping_required';
  end if;
  if v_mapping."grants_livekit_authority" is true
    or v_mapping."creates_payable_balance" is true
    or (v_mapping."concept" = 'creator_tip' and v_mapping."unlocks_digital_access" is true)
  then
    raise exception 'ios_app_store_mapping_authority_or_money_blocked';
  end if;

  select product.* into v_product
  from public."monetization_products" product
  where product."id" = v_mapping."product_id"
  limit 1;

  if v_product."id" is null then
    raise exception 'ios_app_store_conceptual_product_not_found';
  end if;
  if (v_mapping."concept" = 'creator_tip' and v_product."product_type" <> 'creator_tip')
    or (v_mapping."concept" = 'seat_pass' and v_product."product_type" <> 'watch_party_live_ticket')
  then
    raise exception 'ios_app_store_conceptual_product_mismatch';
  end if;

  -- The Apple lane is intentionally usable only as a bounded sandbox. `on`
  -- is rejected here so this RPC cannot become a production purchase lane by
  -- changing a single switch.
  if v_app_store_switch_state <> 'sandbox_only' then
    raise exception 'ios_app_store_sandbox_switch_required';
  end if;
  if v_webhook_switch_state <> 'sandbox_only' then
    raise exception 'provider_webhook_sandbox_switch_required';
  end if;
  if v_live_money_switch_state <> 'off' then
    raise exception 'live_money_must_remain_off';
  end if;
  if v_payouts_switch_state <> 'off' then
    raise exception 'payouts_must_remain_off';
  end if;

  v_expected_source_type := case v_mapping."concept"
    when 'creator_tip' then 'creator_tip'
    when 'seat_pass' then 'watch_party_live'
    else null
  end;
  v_feature_switch_key := case v_mapping."concept"
    when 'creator_tip' then 'tips_enabled'
    when 'seat_pass' then 'watch_party_tickets_enabled'
    else null
  end;
  select "state" into v_feature_switch_state
  from public."platform_money_kill_switches"
  where "key" = v_feature_switch_key
  limit 1;

  if coalesce(v_feature_switch_state, 'off') <> 'sandbox_only' then
    raise exception 'ios_app_store_feature_sandbox_switch_required';
  end if;
  if p_source_type <> v_expected_source_type then
    raise exception 'source_type_mismatch';
  end if;

  if not (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or public.has_active_beta_access()
    or public.resolve_sandbox_monetization_tester(v_user_id::text, v_actor_email)
  ) then
    raise exception 'sandbox_monetization_tester_required';
  end if;

  if nullif(p_metadata->>'amount_minor', '') is not null then
    if (p_metadata->>'amount_minor') !~ '^[0-9]+$' then
      raise exception 'amount_minor_invalid';
    end if;
    v_amount_minor := (p_metadata->>'amount_minor')::integer;
    if v_amount_minor <> v_mapping."reference_price_minor" then
      raise exception 'ios_app_store_exact_tier_price_required';
    end if;
  else
    v_amount_minor := v_mapping."reference_price_minor";
  end if;

  if lower(coalesce(nullif(p_metadata->>'currency', ''), v_mapping."reference_currency"))
    <> v_mapping."reference_currency"
  then
    raise exception 'ios_app_store_mapping_currency_required';
  end if;

  if v_mapping."concept" = 'creator_tip' then
    v_creator_id := p_source_id;
    if nullif(p_metadata->>'creator_id', '') is not null
      and (p_metadata->>'creator_id') <> p_source_id::text
    then
      raise exception 'creator_id_source_mismatch';
    end if;
    if v_creator_id = v_user_id then
      raise exception 'creator_cannot_tip_self';
    end if;
    select settings.* into v_tip_settings
    from public."creator_tip_settings" settings
    where settings."creator_id" = v_creator_id
      and settings."tips_enabled" is true
      and settings."status" not in ('paused', 'blocked')
    limit 1;
    if v_tip_settings."id" is null then
      raise exception 'creator_tips_not_enabled';
    end if;
    if exists (
      select 1
      from public."channel_audience_blocks" block
      where (
        block."channel_user_id" = v_creator_id::text
        and block."blocked_user_id" = v_user_id::text
      ) or (
        block."channel_user_id" = v_user_id::text
        and block."blocked_user_id" = v_creator_id::text
      )
    ) then
      raise exception 'creator_tip_blocked_by_audience_policy';
    end if;
  else
    select offer.* into v_offer
    from public."paid_watch_party_offers" offer
    where offer."id" = p_source_id
      and offer."status" = 'sandbox'
    limit 1;

    if v_offer."id" is null then
      raise exception 'sandbox_watch_party_offer_required';
    end if;
    if v_offer."price_cents" <> v_mapping."reference_price_minor"
      or lower(v_offer."currency") <> v_mapping."reference_currency"
    then
      raise exception 'watch_party_offer_tier_mapping_mismatch';
    end if;
    v_creator_id := v_offer."creator_id";
    select room.* into v_room
    from public."watch_party_rooms" room
    where room."party_id" = v_offer."party_id"
    limit 1;
    if v_room."party_id" is null
      or coalesce(v_room."is_active", false) is not true
      or v_room."room_type" <> 'title'
    then
      raise exception 'paid_watch_party_room_unavailable';
    end if;
    if v_offer."creator_id" = v_user_id or v_room."host_user_id" = v_user_id::text then
      raise exception 'creator_cannot_buy_own_ticket';
    end if;
    v_access := public."resolve_paid_watch_party_ticket_access"(v_offer."party_id");
    if coalesce((v_access->>'allowed')::boolean, false) then
      return jsonb_build_object(
        'alreadyPurchased', true,
        'access', v_access,
        'providerProductId', v_mapping."provider_product_id"
      );
    end if;
    if coalesce((v_access->>'requiresPurchase')::boolean, false) is not true then
      raise exception '%', coalesce(v_access->>'reason', 'seat_pass_not_available');
    end if;
  end if;

  select count(*) into v_recent_intent_count
  from public."money_purchase_intents" intent
  where intent."user_id" = v_user_id
    and intent."provider" = 'revenuecat_app_store'
    and intent."status" = 'pending'
    and intent."created_at" > v_now - interval '10 minutes';
  if v_recent_intent_count >= 5 then
    raise exception 'ios_app_store_purchase_intent_rate_limited';
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
    'revenuecat_app_store',
    v_mapping."provider_product_id",
    p_source_type,
    p_source_id,
    v_creator_id,
    null,
    'sandbox',
    'pending',
    v_mapping."reference_price_minor",
    v_mapping."reference_currency",
    'ios_app_store_intent:' || v_user_id::text || ':' || gen_random_uuid()::text,
    v_now + interval '15 minutes',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'store_mapping_id', v_mapping."id",
      'store_tier', v_mapping."tier",
      'sandbox_only', true,
      'not_payable', true,
      'client_selected_payable_state', false,
      'live_money_action', false,
      'payout_ready', false,
      'cashout_enabled', false,
      'grants_livekit_authority', false,
      'grants_host_authority', false,
      'sandbox_tester_checked', true,
      'exact_app_store_mapping_checked', true
    )
  )
  returning * into v_intent;

  return public."money_purchase_intent_safe_row"(v_intent);
end;
$$;

revoke all on function public."create_ios_app_store_purchase_intent"(text, text, uuid, jsonb) from public;
grant execute on function public."create_ios_app_store_purchase_intent"(text, text, uuid, jsonb) to authenticated;

comment on function public."create_ios_app_store_purchase_intent"(text, text, uuid, jsonb) is
  'Creates rate-limited, exact-mapping, sandbox-only Apple creator-tip or Watch-Party Seat Pass intents for authorized internal testers. It cannot enable production money, payouts, cash-out, payable balances, arbitrary products, room authority, or LiveKit publish authority. Android continues to use create_money_purchase_intent unchanged.';
