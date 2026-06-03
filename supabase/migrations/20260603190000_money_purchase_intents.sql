-- Money purchase intents for dynamic sandbox digital goods.
-- This is a fail-closed bridge only: it does not activate production money,
-- public buy buttons, payouts, or payable creator balances.

create table if not exists public."money_purchase_intents" (
  "id" uuid primary key default gen_random_uuid(),
  "user_id" uuid not null,
  "product_id" uuid not null references public."monetization_products"("id") on delete restrict,
  "product_key" text not null,
  "product_type" text not null,
  "provider" text not null,
  "provider_product_id" text not null,
  "source_type" text not null,
  "source_id" uuid,
  "creator_id" uuid,
  "platform_id" uuid,
  "environment" text not null default 'sandbox',
  "status" text not null default 'pending',
  "amount_minor" integer,
  "currency" text,
  "idempotency_key" text not null unique,
  "expires_at" timestamptz not null,
  "consumed_at" timestamptz,
  "revoked_at" timestamptz,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "money_purchase_intents_product_type_check"
    check ("product_type" in (
      'paid_content_access',
      'watch_party_live_ticket',
      'live_watch_party_access_pass',
      'live_watch_party_seat_pass',
      'creator_tip',
      'event_pass',
      'merch_physical_good'
    )),
  constraint "money_purchase_intents_provider_check"
    check ("provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')),
  constraint "money_purchase_intents_source_type_check"
    check ("source_type" in (
      'paid_content',
      'watch_party_live',
      'live_watch_party_access',
      'live_watch_party_seat',
      'creator_tip',
      'event'
    )),
  constraint "money_purchase_intents_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "money_purchase_intents_status_check"
    check ("status" in ('pending', 'consumed', 'expired', 'cancelled', 'failed', 'revoked')),
  constraint "money_purchase_intents_amount_check"
    check ("amount_minor" is null or "amount_minor" >= 0),
  constraint "money_purchase_intents_currency_check"
    check ("currency" is null or "currency" ~ '^[a-z]{3}$'),
  constraint "money_purchase_intents_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization)'),
  constraint "money_purchase_intents_sandbox_only_check"
    check ("environment" <> 'production'),
  constraint "money_purchase_intents_pending_not_consumed_check"
    check ("status" <> 'pending' or ("consumed_at" is null and "revoked_at" is null)),
  constraint "money_purchase_intents_consumed_check"
    check ("status" <> 'consumed' or "consumed_at" is not null),
  constraint "money_purchase_intents_no_merch_digital_check"
    check ("product_type" <> 'merch_physical_good')
);

create index if not exists "money_purchase_intents_user_status_idx"
  on public."money_purchase_intents" ("user_id", "status", "expires_at");
create index if not exists "money_purchase_intents_product_status_idx"
  on public."money_purchase_intents" ("product_id", "status", "expires_at");
create index if not exists "money_purchase_intents_provider_product_idx"
  on public."money_purchase_intents" ("provider", "provider_product_id", "status", "expires_at");
create index if not exists "money_purchase_intents_source_idx"
  on public."money_purchase_intents" ("source_type", "source_id", "status");

drop trigger if exists "touch_money_purchase_intents_updated_at" on public."money_purchase_intents";
create trigger "touch_money_purchase_intents_updated_at"
  before update on public."money_purchase_intents"
  for each row execute function public."touch_money_access_updated_at"();

alter table public."money_purchase_intents" enable row level security;

create policy "money_purchase_intents_select_self_owner_operator"
  on public."money_purchase_intents" for select to authenticated
  using ("user_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]));
create policy "money_purchase_intents_write_owner_operator"
  on public."money_purchase_intents" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."money_purchase_intents" from anon, authenticated;
grant select on table public."money_purchase_intents" to authenticated;
grant all on table public."money_purchase_intents" to service_role;

create or replace function public."money_purchase_intent_safe_row"(intent_row public."money_purchase_intents")
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', intent_row."id",
    'userId', intent_row."user_id",
    'productId', intent_row."product_id",
    'productKey', intent_row."product_key",
    'productType', intent_row."product_type",
    'provider', intent_row."provider",
    'providerProductId', intent_row."provider_product_id",
    'sourceType', intent_row."source_type",
    'sourceId', intent_row."source_id",
    'creatorId', intent_row."creator_id",
    'platformId', intent_row."platform_id",
    'environment', intent_row."environment",
    'status', intent_row."status",
    'amountMinor', intent_row."amount_minor",
    'currency', intent_row."currency",
    'expiresAt', intent_row."expires_at",
    'consumedAt', intent_row."consumed_at",
    'revokedAt', intent_row."revoked_at",
    'createdAt', intent_row."created_at"
  );
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

create or replace function public."get_my_money_purchase_intent"(p_intent_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_intent public."money_purchase_intents"%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  select * into v_intent
  from public."money_purchase_intents"
  where "id" = p_intent_id
    and "user_id" = auth.uid()
  limit 1;

  if v_intent."id" is null then
    raise exception 'purchase_intent_not_found';
  end if;

  return public."money_purchase_intent_safe_row"(v_intent);
end;
$$;

create or replace function public."admin_list_money_purchase_intents"()
returns table (
  "id" uuid,
  "user_id" uuid,
  "product_key" text,
  "product_type" text,
  "provider" text,
  "provider_product_id" text,
  "source_type" text,
  "source_id" uuid,
  "environment" text,
  "status" text,
  "expires_at" timestamptz,
  "consumed_at" timestamptz,
  "created_at" timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'admin_money_access_required';
  end if;

  return query
  select
    intent."id",
    intent."user_id",
    intent."product_key",
    intent."product_type",
    intent."provider",
    intent."provider_product_id",
    intent."source_type",
    intent."source_id",
    intent."environment",
    intent."status",
    intent."expires_at",
    intent."consumed_at",
    intent."created_at"
  from public."money_purchase_intents" intent
  order by intent."created_at" desc
  limit 200;
end;
$$;

create or replace function public."admin_get_money_purchase_intent"(p_intent_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_intent public."money_purchase_intents"%rowtype;
begin
  if not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'admin_money_access_required';
  end if;

  select * into v_intent
  from public."money_purchase_intents"
  where "id" = p_intent_id
  limit 1;

  if v_intent."id" is null then
    raise exception 'purchase_intent_not_found';
  end if;

  return public."money_purchase_intent_safe_row"(v_intent);
end;
$$;

create or replace function public."expire_money_purchase_intents"()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public."money_purchase_intents"
  set "status" = 'expired'
  where "status" = 'pending'
    and "expires_at" <= timezone('utc'::text, now());

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public."get_admin_money_access_readout"()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'admin_money_access_required';
  end if;

  return jsonb_build_object(
    'productCatalogCount', (select count(*) from public."monetization_products"),
    'accessGrantCount', (select count(*) from public."access_grants"),
    'providerEventCount', (select count(*) from public."provider_events"),
    'ledgerEventCount', (select count(*) from public."money_access_ledger_events"),
    'purchaseIntentCount', (select count(*) from public."money_purchase_intents"),
    'pendingPurchaseIntentCount', (select count(*) from public."money_purchase_intents" where "status" = 'pending'),
    'consumedPurchaseIntentCount', (select count(*) from public."money_purchase_intents" where "status" = 'consumed'),
    'merchProductCount', (select count(*) from public."merch_products"),
    'merchOrderCount', (select count(*) from public."merch_orders"),
    'sandboxNotPayableLedgerCount', (select count(*) from public."money_access_ledger_events" where "environment" = 'sandbox' and "payable_state" = 'not_payable'),
    'setupNotPayableLedgerCount', (select count(*) from public."money_access_ledger_events" where "environment" = 'setup' and "payable_state" = 'not_payable'),
    'payableLedgerCount', (select count(*) from public."money_access_ledger_events" where "payable_state" in ('payable', 'paid')),
    'liveMoneyEnabled', coalesce((select "state" = 'on' from public."platform_money_kill_switches" where "key" = 'live_money_enabled'), false)
  );
end;
$$;

revoke all on function public."money_purchase_intent_safe_row"(public."money_purchase_intents") from public;
revoke all on function public."create_money_purchase_intent"(text, text, uuid, jsonb) from public;
revoke all on function public."get_my_money_purchase_intent"(uuid) from public;
revoke all on function public."admin_list_money_purchase_intents"() from public;
revoke all on function public."admin_get_money_purchase_intent"(uuid) from public;
revoke all on function public."expire_money_purchase_intents"() from public;

grant execute on function public."create_money_purchase_intent"(text, text, uuid, jsonb) to authenticated;
grant execute on function public."get_my_money_purchase_intent"(uuid) to authenticated;
grant execute on function public."admin_list_money_purchase_intents"() to authenticated;
grant execute on function public."admin_get_money_purchase_intent"(uuid) to authenticated;
grant execute on function public."expire_money_purchase_intents"() to service_role;

comment on table public."money_purchase_intents" is
  'Short-lived sandbox-only purchase intents that bind generic RevenueCat/Google Play products to a specific content, room, creator, or event target. They cannot create payable money, payouts, merch checkout, LiveKit publish authority, host power, or admin power.';
