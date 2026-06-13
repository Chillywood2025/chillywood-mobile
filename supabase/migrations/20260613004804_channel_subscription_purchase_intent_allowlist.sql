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

comment on function public."create_money_purchase_intent"(text, text, uuid, jsonb) is
  'Creates sandbox-only Google Play / RevenueCat purchase intents for approved non-Premium creator digital products, including Channel Subscriptions.';
