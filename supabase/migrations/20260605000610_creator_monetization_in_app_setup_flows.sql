-- Creator monetization in-app setup flows.
-- This migration persists sandbox setup choices only. It does not activate
-- production money, payouts, payable balances, Stripe Android digital goods,
-- digital access grants, provider events, or ledger rows.

create table if not exists public."creator_monetization_configs" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_id" uuid not null,
  "source_type" text not null,
  "source_id" uuid not null,
  "product_id" uuid not null references public."monetization_products"("id") on delete restrict,
  "product_key" text not null,
  "product_type" text not null,
  "provider" text not null default 'revenuecat_google_play',
  "provider_product_id" text not null,
  "display_name" text not null,
  "price_label" text not null default '$0.99 sandbox/test',
  "environment" text not null default 'sandbox',
  "status" text not null default 'sandbox',
  "payable_state" text not null default 'not_payable',
  "production_enabled" boolean not null default false,
  "payout_enabled" boolean not null default false,
  "creates_digital_access" boolean not null default false,
  "grants_livekit_publish" boolean not null default false,
  "grants_host_authority" boolean not null default false,
  "requires_host_approval" boolean not null default false,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "creator_monetization_configs_source_type_check"
    check ("source_type" in (
      'paid_content',
      'watch_party_live',
      'live_watch_party_access',
      'live_watch_party_seat',
      'creator_tip',
      'event',
      'merch_physical_good'
    )),
  constraint "creator_monetization_configs_product_type_check"
    check ("product_type" in (
      'paid_content_access',
      'watch_party_live_ticket',
      'live_watch_party_access_pass',
      'live_watch_party_seat_pass',
      'creator_tip',
      'event_pass',
      'merch_physical_good'
    )),
  constraint "creator_monetization_configs_environment_check"
    check ("environment" = 'sandbox'),
  constraint "creator_monetization_configs_status_check"
    check ("status" in ('sandbox', 'setup', 'disabled', 'revoked')),
  constraint "creator_monetization_configs_not_payable_check"
    check ("payable_state" = 'not_payable'),
  constraint "creator_monetization_configs_no_live_money_check"
    check (
      "production_enabled" is false
      and "payout_enabled" is false
      and "grants_host_authority" is false
    ),
  constraint "creator_monetization_configs_no_publish_by_payment_check"
    check ("grants_livekit_publish" is false),
  constraint "creator_monetization_configs_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization)')
);

create unique index if not exists "creator_monetization_configs_unique_source_product"
  on public."creator_monetization_configs" ("creator_id", "source_type", "source_id", "product_key");

create index if not exists "creator_monetization_configs_creator_idx"
  on public."creator_monetization_configs" ("creator_id", "updated_at" desc);

create index if not exists "creator_monetization_configs_source_idx"
  on public."creator_monetization_configs" ("source_type", "source_id", "status");

drop trigger if exists "touch_creator_monetization_configs_updated_at" on public."creator_monetization_configs";
create trigger "touch_creator_monetization_configs_updated_at"
  before update on public."creator_monetization_configs"
  for each row execute function public."touch_money_access_updated_at"();

alter table public."creator_monetization_configs" enable row level security;

create policy "creator_monetization_configs_select_self_owner_operator"
  on public."creator_monetization_configs" for select to authenticated
  using (
    "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "creator_monetization_configs_write_owner_operator"
  on public."creator_monetization_configs" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."creator_monetization_configs" from anon, authenticated;
grant select on table public."creator_monetization_configs" to authenticated;
grant all on table public."creator_monetization_configs" to service_role;

insert into public."monetization_products" (
  "product_key",
  "product_type",
  "display_name",
  "description",
  "provider",
  "provider_product_id",
  "environment",
  "status",
  "is_android_digital",
  "is_physical_good",
  "metadata"
)
values (
  'cw_merch_test_tee_sandbox',
  'merch_physical_good',
  'Chi''llywood Test Tee',
  'Sandbox-only physical merch setup mapping. Stripe checkout is physical goods only and creates no digital access.',
  'stripe_physical_goods',
  'cw_merch_test_tee_sandbox',
  'sandbox',
  'sandbox',
  false,
  true,
  jsonb_build_object(
    'sandbox_only', true,
    'physical_goods_only', true,
    'creates_digital_access', false,
    'not_payable', true,
    'fulfillment', 'manual_test_only'
  )
)
on conflict ("product_key") do update
set
  "display_name" = excluded."display_name",
  "description" = excluded."description",
  "provider" = 'stripe_physical_goods',
  "provider_product_id" = excluded."provider_product_id",
  "environment" = 'sandbox',
  "status" = 'sandbox',
  "is_android_digital" = false,
  "is_physical_good" = true,
  "metadata" = public."monetization_products"."metadata" || excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

create or replace function public."creator_monetization_config_safe_row"(config_row public."creator_monetization_configs")
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', config_row."id",
    'creatorId', config_row."creator_id",
    'sourceType', config_row."source_type",
    'sourceId', config_row."source_id",
    'productKey', config_row."product_key",
    'productType', config_row."product_type",
    'provider', config_row."provider",
    'providerProductId', config_row."provider_product_id",
    'displayName', config_row."display_name",
    'priceLabel', config_row."price_label",
    'environment', config_row."environment",
    'status', config_row."status",
    'payableState', config_row."payable_state",
    'productionEnabled', config_row."production_enabled",
    'payoutEnabled', config_row."payout_enabled",
    'createsDigitalAccess', config_row."creates_digital_access",
    'grantsLiveKitPublish', config_row."grants_livekit_publish",
    'grantsHostAuthority', config_row."grants_host_authority",
    'requiresHostApproval', config_row."requires_host_approval",
    'updatedAt', config_row."updated_at",
    'metadata', config_row."metadata"
  );
$$;

create or replace function public."creator_monetization_expected_source_type"(p_product_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_product_type
    when 'paid_content_access' then 'paid_content'
    when 'watch_party_live_ticket' then 'watch_party_live'
    when 'live_watch_party_access_pass' then 'live_watch_party_access'
    when 'live_watch_party_seat_pass' then 'live_watch_party_seat'
    when 'creator_tip' then 'creator_tip'
    when 'event_pass' then 'event'
    when 'merch_physical_good' then 'merch_physical_good'
    else null
  end;
$$;

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
      'arbitrary_android_price', false
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

create or replace function public."list_my_creator_sandbox_monetization_configs"()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  return coalesce((
    select jsonb_agg(public."creator_monetization_config_safe_row"(config) order by config."updated_at" desc)
    from public."creator_monetization_configs" config
    where config."creator_id" = v_user_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public."admin_list_creator_sandbox_monetization_configs"()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'owner_operator_required';
  end if;

  return coalesce((
    select jsonb_agg(public."creator_monetization_config_safe_row"(config) order by config."updated_at" desc)
    from public."creator_monetization_configs" config
    limit 100
  ), '[]'::jsonb);
end;
$$;

revoke all on function public."creator_monetization_config_safe_row"(public."creator_monetization_configs") from public;
revoke all on function public."creator_monetization_expected_source_type"(text) from public;
revoke all on function public."save_creator_sandbox_monetization_config"(text, text, uuid, text, jsonb) from public;
revoke all on function public."list_my_creator_sandbox_monetization_configs"() from public;
revoke all on function public."admin_list_creator_sandbox_monetization_configs"() from public;

grant execute on function public."save_creator_sandbox_monetization_config"(text, text, uuid, text, jsonb) to authenticated;
grant execute on function public."list_my_creator_sandbox_monetization_configs"() to authenticated;
grant execute on function public."admin_list_creator_sandbox_monetization_configs"() to authenticated;

comment on table public."creator_monetization_configs" is
  'Creator-selected sandbox monetization setup records. These records are not payable, cannot activate production money or payouts, and do not create provider events, access grants, entitlements, LiveKit authority, host power, or ledger rows.';

comment on function public."save_creator_sandbox_monetization_config"(text, text, uuid, text, jsonb) is
  'Saves approved sandbox product-tier setup for a creator-owned in-app monetization surface. It only accepts sandbox product catalog mappings and never creates fake sales, provider events, grants, payable rows, payouts, cash-out, Stripe Android digital checkout, or LiveKit authority.';
