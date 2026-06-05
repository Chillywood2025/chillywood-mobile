-- Bound creator monetization setup writes to approved sandbox testers.
-- This does not change product behavior or activate production money.

create or replace function public."save_creator_sandbox_monetization_config"(
  p_product_key text,
  p_source_type text,
  p_source_id uuid,
  p_display_name text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid := auth.uid();
  v_product public."monetization_products"%rowtype;
  v_expected_source_type text;
  v_config public."creator_monetization_configs"%rowtype;
  v_requires_host_approval boolean := false;
  v_creates_digital_access boolean := false;
begin
  if v_creator_id is null then
    raise exception 'auth_required';
  end if;
  if not (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or public.has_active_beta_access()
  ) then
    raise exception 'internal_sandbox_tester_required';
  end if;
  if p_source_id is null then
    raise exception 'source_id_required';
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
  if v_product."environment" <> 'sandbox' or v_product."status" <> 'sandbox' then
    raise exception 'sandbox_product_required';
  end if;
  if v_product."product_type" = 'premium_subscription' then
    raise exception 'premium_uses_subscription_screen';
  end if;
  if v_product."product_type" = 'merch_physical_good' then
    if coalesce(v_product."is_physical_good", false) is not true then
      raise exception 'merch_must_be_physical';
    end if;
  elsif coalesce(v_product."is_android_digital", false) is not true
    or v_product."provider" not in ('revenuecat_google_play', 'google_play', 'revenuecat')
  then
    raise exception 'android_digital_products_require_revenuecat_google_play';
  end if;
  if nullif(trim(coalesce(v_product."provider_product_id", '')), '') is null then
    raise exception 'provider_product_id_required';
  end if;
  if coalesce((v_product."metadata"->>'sandbox_purchase_intents_enabled')::boolean, false) is not true
    and v_product."product_type" <> 'merch_physical_good'
  then
    raise exception 'approved_sandbox_tier_required';
  end if;

  v_expected_source_type := public."creator_monetization_expected_source_type"(v_product."product_type");
  if v_expected_source_type is null then
    raise exception 'unsupported_product_type';
  end if;
  if p_source_type <> v_expected_source_type then
    raise exception 'source_type_mismatch';
  end if;

  v_requires_host_approval := v_product."product_type" in ('watch_party_live_ticket', 'live_watch_party_access_pass', 'live_watch_party_seat_pass');
  v_creates_digital_access := v_product."product_type" in ('paid_content_access', 'watch_party_live_ticket', 'live_watch_party_access_pass', 'live_watch_party_seat_pass', 'event_pass');

  insert into public."creator_monetization_configs" (
    "creator_id",
    "source_type",
    "source_id",
    "product_id",
    "product_key",
    "product_type",
    "provider",
    "provider_product_id",
    "display_name",
    "price_label",
    "environment",
    "status",
    "payable_state",
    "production_enabled",
    "payout_enabled",
    "creates_digital_access",
    "grants_livekit_publish",
    "grants_host_authority",
    "requires_host_approval",
    "metadata"
  )
  values (
    v_creator_id,
    p_source_type,
    p_source_id,
    v_product."id",
    v_product."product_key",
    v_product."product_type",
    v_product."provider",
    v_product."provider_product_id",
    coalesce(nullif(trim(p_display_name), ''), v_product."display_name"),
    '$0.99 sandbox/test',
    'sandbox',
    'sandbox',
    'not_payable',
    false,
    false,
    v_creates_digital_access,
    false,
    false,
    v_requires_host_approval,
    jsonb_build_object(
      'sandbox_only', true,
      'not_payable', true,
      'no_real_charge', true,
      'production_money_off', true,
      'payouts_off', true,
      'approved_product_tier', true,
      'arbitrary_android_price', false,
      'internal_sandbox_tester_required', true
    ) || coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict ("creator_id", "source_type", "source_id", "product_key")
  do update set
    "display_name" = excluded."display_name",
    "status" = 'sandbox',
    "metadata" = public."creator_monetization_configs"."metadata" || excluded."metadata",
    "updated_at" = timezone('utc'::text, now())
  returning * into v_config;

  return public."creator_monetization_config_safe_row"(v_config);
end;
$$;

revoke all on function public."save_creator_sandbox_monetization_config"(text, text, uuid, text, jsonb) from public;
grant execute on function public."save_creator_sandbox_monetization_config"(text, text, uuid, text, jsonb) to authenticated;

comment on function public."save_creator_sandbox_monetization_config"(text, text, uuid, text, jsonb) is
  'Saves approved sandbox product-tier setup for approved owner/operator or beta/internal tester accounts only. It never creates fake sales, provider events, grants, payable rows, payouts, cash-out, Stripe Android digital checkout, LiveKit authority, production purchases, or arbitrary Android digital prices.';
