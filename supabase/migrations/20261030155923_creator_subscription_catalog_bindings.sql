-- Source-only catalog support. No products, prices, groups, approvals, switches,
-- payments or deployments are provisioned by this migration. Existing receipts
-- remain bound to their original intent. Retire a cohort for NEW purchases by
-- changing available_for_new_purchases, never by rewriting its price identity.
create table public.creator_channel_subscription_price_requests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency = 'usd'),
  status text not null default 'pending_provisioning'
    check (status in ('pending_provisioning','approved','declined','cancelled')),
  created_at timestamptz not null default now()
);
create unique index creator_subscription_pending_price_request
  on public.creator_channel_subscription_price_requests(creator_id,amount_minor,currency)
  where status='pending_provisioning';
alter table public.creator_channel_subscription_price_requests enable row level security;
alter table public.creator_channel_subscription_price_requests force row level security;
revoke all on public.creator_channel_subscription_price_requests from public,anon,authenticated,service_role;
grant select on public.creator_channel_subscription_price_requests to authenticated;
grant select,update(status) on public.creator_channel_subscription_price_requests to service_role;
create function public.creator_subscription_price_request_self_read_internal(p_creator_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_creator_id=auth.uid() and public.wave1_current_caller_authority_internal();
$$;
revoke all on function public.creator_subscription_price_request_self_read_internal(uuid) from public,anon,service_role;
grant execute on function public.creator_subscription_price_request_self_read_internal(uuid) to authenticated;
create policy creator_subscription_price_request_self_read
  on public.creator_channel_subscription_price_requests for select to authenticated
  using (public.creator_subscription_price_request_self_read_internal(creator_id));

create function public.request_creator_channel_subscription_price(
  p_amount_minor integer,p_currency text default 'usd'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_creator uuid; v_request public.creator_channel_subscription_price_requests;
begin
  v_creator:=public.wave1_assert_current_creator_money_authority_internal();
  if p_amount_minor is null or p_amount_minor<=0 or p_currency is distinct from 'usd' then
    raise exception 'subscription_price_request_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-subscription-price-request:'||v_creator::text,0));
  select * into v_request from public.creator_channel_subscription_price_requests
    where creator_id=v_creator and amount_minor=p_amount_minor and currency=p_currency
      and status='pending_provisioning';
  if v_request.id is null then
    if (select count(*) from public.creator_channel_subscription_price_requests
      where creator_id=v_creator and status='pending_provisioning')>=5 then
      raise exception 'subscription_price_request_limit';
    end if;
    insert into public.creator_channel_subscription_price_requests(creator_id,amount_minor,currency)
      values(v_creator,p_amount_minor,p_currency) returning * into v_request;
  end if;
  return jsonb_build_object('id',v_request.id,'amountMinor',v_request.amount_minor,
    'currency',v_request.currency,'status',v_request.status,'createdAt',v_request.created_at);
end;
$$;
revoke all on function public.request_creator_channel_subscription_price(integer,text) from public,anon,service_role;
grant execute on function public.request_creator_channel_subscription_price(integer,text) to authenticated;

create table public.creator_channel_subscription_catalog_bindings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  offer_id uuid not null references public.creator_channel_subscription_offers(id),
  version integer not null check(version>0),
  price_id uuid not null,
  product_id uuid not null references public.monetization_products(id),
  product_key text not null,
  provider_product_id text not null check(length(provider_product_id) between 1 and 512),
  platform text not null check(platform in ('ios','android')),
  environment text not null check(environment in ('sandbox','production')),
  amount_minor integer not null check(amount_minor>0),
  currency text not null check(currency='usd'),
  subscription_period text not null check(subscription_period='P1M'),
  apple_subscription_group text,
  available_for_new_purchases boolean not null default true,
  created_at timestamptz not null default now(),
  check ((platform='ios' and nullif(btrim(apple_subscription_group),'') is not null)
    or (platform='android' and apple_subscription_group is null)),
  unique(creator_id,platform,environment,version),
  unique(platform,environment,price_id),
  unique(platform,environment,provider_product_id)
);
alter table public.creator_channel_subscription_catalog_bindings enable row level security;
alter table public.creator_channel_subscription_catalog_bindings force row level security;
revoke all on public.creator_channel_subscription_catalog_bindings from public,anon,authenticated,service_role;
grant select,update(available_for_new_purchases) on public.creator_channel_subscription_catalog_bindings to service_role;

-- A group may contain several historical prices but belongs to one creator
-- forever. This also serializes competing catalog approvals across offers.
create table public.creator_channel_subscription_group_owners (
  environment text not null check(environment in ('sandbox','production')),
  apple_subscription_group text not null,
  creator_id uuid not null,
  primary key(environment,apple_subscription_group)
);
alter table public.creator_channel_subscription_group_owners enable row level security;
alter table public.creator_channel_subscription_group_owners force row level security;
revoke all on public.creator_channel_subscription_group_owners from public,anon,authenticated,service_role;

create function public.guard_creator_subscription_catalog_binding_internal()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or
    (to_jsonb(new)-'available_for_new_purchases') is distinct from
    (to_jsonb(old)-'available_for_new_purchases') then
    raise exception 'subscription_catalog_binding_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_creator_subscription_catalog_binding_internal() from public,anon,authenticated,service_role;
create trigger guard_creator_subscription_catalog_binding before update or delete
  on public.creator_channel_subscription_catalog_bindings for each row
  execute function public.guard_creator_subscription_catalog_binding_internal();

create function public.approve_creator_channel_subscription_catalog_binding(
  p_offer_id uuid,p_price_id uuid,p_platform text,p_environment text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_offer public.creator_channel_subscription_offers; v_price jsonb;
  v_product public.monetization_products; v_mapping public.monetization_product_store_mappings;
  v_group text; v_group_owner uuid; v_version integer; v_id uuid;
begin
  -- EXECUTE is service-only. This operation binds ALREADY provisioned approved
  -- identities and is not permission to create a provider SKU or approve sales.
  if p_platform not in ('ios','android') or p_environment not in ('sandbox','production') then
    raise exception 'subscription_catalog_context_invalid';
  end if;
  select * into v_offer from public.creator_channel_subscription_offers where id=p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found'; end if;
  select price into v_price from public.creator_money_supported_prices_internal(
    'channel_subscription',p_platform,p_environment) price where price->>'priceId'=p_price_id::text;
  if v_price is null then raise exception 'subscription_catalog_not_ready'; end if;
  if p_platform='ios' then
    select * into v_mapping from public.monetization_product_store_mappings where id=p_price_id for share;
    if v_mapping.store_product_type<>'auto_renewable_subscription'
      or v_mapping.provider_base_plan_id is not null
      or v_mapping.revenuecat_entitlement is not null
      or nullif(btrim(v_mapping.apple_subscription_group),'') is null
      or v_mapping.metadata->>'subscription_period' is distinct from 'P1M'
      or v_mapping.metadata->>'creator_subscription_catalog_approved' is distinct from 'true' then
      raise exception 'subscription_catalog_not_ready';
    end if;
    select * into v_product from public.monetization_products where id=v_mapping.product_id for share;
    v_group:=v_mapping.apple_subscription_group;
    -- Legacy groups were reusable per BUYER across creators, not permanently
    -- creator-owned. A different SKU must never capture one of those groups.
    if v_group ~ '^chillywood_channel_slot_[1-8]$' then
      raise exception 'subscription_legacy_group_reserved';
    end if;
    if exists(select 1 from public.money_purchase_intents intent
      join public.monetization_product_store_mappings historical_mapping
        on historical_mapping.id::text=intent.metadata->>'store_mapping_id'
      where intent.provider='revenuecat_app_store' and intent.environment=p_environment
        and historical_mapping.apple_subscription_group=v_group
        and intent.creator_id is distinct from v_offer.creator_id) then
      raise exception 'subscription_group_creator_mismatch';
    end if;
    insert into public.creator_channel_subscription_group_owners values(p_environment,v_group,v_offer.creator_id)
      on conflict do nothing;
    select creator_id into v_group_owner from public.creator_channel_subscription_group_owners
      where environment=p_environment and apple_subscription_group=v_group for update;
    if v_group_owner is distinct from v_offer.creator_id then raise exception 'subscription_group_creator_mismatch'; end if;
  else
    select * into v_product from public.monetization_products where id=p_price_id for share;
    if v_product.product_key='channel_subscription_sandbox_monthly_499'
      or v_product.provider_product_id='channel_subscription_sandbox_monthly_499' then
      raise exception 'subscription_legacy_product_reserved';
    end if;
    if v_product.metadata->>'subscription_period' is distinct from 'P1M'
      or v_product.metadata->>'creator_subscription_catalog_approved' is distinct from 'true' then
      raise exception 'subscription_catalog_not_ready';
    end if;
  end if;
  if v_product.product_type is distinct from 'channel_subscription' then raise exception 'subscription_catalog_not_ready'; end if;
  -- A previously shared legacy slot/product cannot acquire a new creator owner.
  if exists(select 1 from public.money_purchase_intents intent
    where intent.provider_product_id=v_price->>'providerProductId' and intent.environment=p_environment
      and intent.provider=v_price->>'provider' and intent.creator_id is distinct from v_offer.creator_id) then
    raise exception 'subscription_catalog_identity_has_other_creator_history';
  end if;
  select id into v_id from public.creator_channel_subscription_catalog_bindings
    where offer_id=p_offer_id and price_id=p_price_id and platform=p_platform and environment=p_environment;
  if v_id is not null then return v_id; end if;
  select coalesce(max(version),0)+1 into v_version from public.creator_channel_subscription_catalog_bindings
    where creator_id=v_offer.creator_id and platform=p_platform and environment=p_environment;
  insert into public.creator_channel_subscription_catalog_bindings(
    creator_id,offer_id,version,price_id,product_id,product_key,provider_product_id,platform,environment,
    amount_minor,currency,subscription_period,apple_subscription_group)
  values(v_offer.creator_id,p_offer_id,v_version,p_price_id,v_product.id,v_product.product_key,
    v_price->>'providerProductId',p_platform,p_environment,(v_price->>'amountMinor')::integer,
    v_price->>'currency','P1M',v_group) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.approve_creator_channel_subscription_catalog_binding(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.approve_creator_channel_subscription_catalog_binding(uuid,uuid,text,text) to service_role;

-- Identity fields of a bound preprovisioned SKU cannot be repriced or reassigned.
-- Availability/proof revocation remains possible; it fails closed and must never
-- be used as the ordinary method of retiring new-purchase cohort selection.
create function public.guard_bound_creator_subscription_product_internal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='monetization_products' then
    if exists(select 1 from public.creator_channel_subscription_catalog_bindings where product_id=old.id)
      and (tg_op='DELETE' or row(new.id,new.product_key,new.product_type,new.provider,new.provider_product_id,
        new.environment,new.is_android_digital,new.is_physical_good,new.metadata->>'price_tier',new.metadata->>'subscription_period')
        is distinct from row(old.id,old.product_key,old.product_type,old.provider,old.provider_product_id,
        old.environment,old.is_android_digital,old.is_physical_good,old.metadata->>'price_tier',old.metadata->>'subscription_period'))
    then raise exception 'subscription_bound_product_identity_immutable'; end if;
  else
    if exists(select 1 from public.creator_channel_subscription_catalog_bindings where platform='ios' and price_id=old.id)
      and (tg_op='DELETE' or row(new.id,new.product_id,new.concept,new.platform,new.store,new.provider,
        new.provider_product_id,new.provider_base_plan_id,new.apple_subscription_group,new.store_product_type,
        new.reference_price_minor,new.reference_currency,new.environment,new.revenuecat_entitlement,
        new.unlocks_digital_access,new.grants_livekit_authority,new.creates_payable_balance,new.metadata->>'subscription_period')
        is distinct from row(old.id,old.product_id,old.concept,old.platform,old.store,old.provider,
        old.provider_product_id,old.provider_base_plan_id,old.apple_subscription_group,old.store_product_type,
        old.reference_price_minor,old.reference_currency,old.environment,old.revenuecat_entitlement,
        old.unlocks_digital_access,old.grants_livekit_authority,old.creates_payable_balance,old.metadata->>'subscription_period'))
    then raise exception 'subscription_bound_product_identity_immutable'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_bound_creator_subscription_product_internal() from public,anon,authenticated,service_role;
create trigger guard_bound_creator_subscription_product before update or delete on public.monetization_products
  for each row execute function public.guard_bound_creator_subscription_product_internal();
create trigger guard_bound_creator_subscription_mapping before update or delete on public.monetization_product_store_mappings
  for each row execute function public.guard_bound_creator_subscription_product_internal();

create function public.creator_subscription_catalog_binding_json_internal(
  binding public.creator_channel_subscription_catalog_bindings
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('bindingId',binding.id,'version',binding.version,
    'creatorId',binding.creator_id,'offerId',binding.offer_id,'priceId',binding.price_id,
    'providerProductId',binding.provider_product_id,'amountMinor',binding.amount_minor,
    'currency',binding.currency,'platform',binding.platform,'environment',binding.environment,
    'subscriptionPeriod',binding.subscription_period);
$$;
revoke all on function public.creator_subscription_catalog_binding_json_internal(public.creator_channel_subscription_catalog_bindings)
  from public,anon,authenticated,service_role;

create function public.creator_subscription_catalog_binding_ready_internal(p_binding_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.creator_channel_subscription_catalog_bindings binding
    cross join lateral public.creator_money_supported_prices_internal('channel_subscription',binding.platform,binding.environment) price
    where binding.id=p_binding_id and price->>'priceId'=binding.price_id::text
      and price->>'providerProductId'=binding.provider_product_id
      and price->>'productKey'=binding.product_key
      and (price->>'amountMinor')::integer=binding.amount_minor and price->>'currency'=binding.currency
      and ((binding.platform='ios' and exists(select 1 from public.monetization_product_store_mappings mapping
        where mapping.id=binding.price_id and mapping.product_id=binding.product_id
          and mapping.apple_subscription_group=binding.apple_subscription_group
          and mapping.store_product_type='auto_renewable_subscription'
          and mapping.metadata->>'subscription_period'='P1M'
          and mapping.metadata->>'creator_subscription_catalog_approved'='true'))
        or (binding.platform='android' and exists(select 1 from public.monetization_products product
          where product.id=binding.product_id and product.id=binding.price_id
            and product.metadata->>'subscription_period'='P1M'
            and product.metadata->>'creator_subscription_catalog_approved'='true'))));
$$;
revoke all on function public.creator_subscription_catalog_binding_ready_internal(uuid) from public,anon,authenticated,service_role;

alter table public.money_purchase_intents add column subscription_catalog_binding_id uuid
  references public.creator_channel_subscription_catalog_bindings(id);
alter table public.creator_money_purchase_quotes add column subscription_catalog_binding_id uuid
  references public.creator_channel_subscription_catalog_bindings(id);

create function public.guard_creator_subscription_intent_binding_internal()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_binding public.creator_channel_subscription_catalog_bindings;
begin
  if tg_op='UPDATE' then
    if new.subscription_catalog_binding_id is distinct from old.subscription_catalog_binding_id
      or (old.subscription_catalog_binding_id is not null and
        new.metadata->>'store_mapping_id' is distinct from old.metadata->>'store_mapping_id') then
      raise exception 'subscription_intent_binding_immutable';
    end if;
    return new;
  end if;
  if new.subscription_catalog_binding_id is null then
    if new.source_type='channel_subscription' and (exists(
      select 1 from public.creator_channel_subscription_catalog_bindings binding
      where binding.provider_product_id=new.provider_product_id and binding.environment=new.environment
        and binding.platform=case new.provider when 'revenuecat_app_store' then 'ios' when 'revenuecat_google_play' then 'android' end
    ) or not (new.amount_minor=499 and new.currency='usd' and (
      (new.provider='revenuecat_google_play' and new.product_key='channel_subscription_sandbox_monthly_499'
        and new.provider_product_id='channel_subscription_sandbox_monthly_499')
      or (new.provider='revenuecat_app_store' and exists(select 1 from public.monetization_product_store_mappings mapping
        where mapping.id::text=new.metadata->>'store_mapping_id' and mapping.product_id=new.product_id
          and mapping.reference_price_minor=499 and mapping.concept='channel_subscription'
          and mapping.metadata->>'slot_number' in ('1','2','3','4','5','6','7','8')
          and mapping.provider_product_id=new.provider_product_id
          and mapping.provider_product_id='com.chillywood.channel.subscription.slot'||(mapping.metadata->>'slot_number')
          and mapping.apple_subscription_group='chillywood_channel_slot_'||(mapping.metadata->>'slot_number')))
    ))) then raise exception 'subscription_intent_binding_required'; end if;
    return new;
  end if;
  select * into v_binding from public.creator_channel_subscription_catalog_bindings
    where id=new.subscription_catalog_binding_id for share;
  if v_binding.platform='ios' then
    perform 1 from public.monetization_product_store_mappings where id=v_binding.price_id for share;
  end if;
  perform 1 from public.monetization_products where id=v_binding.product_id for share;
  if v_binding.id is null or not v_binding.available_for_new_purchases
    or not public.creator_subscription_catalog_binding_ready_internal(v_binding.id)
    or new.source_type is distinct from 'channel_subscription'
    or new.product_type is distinct from 'channel_subscription'
    or new.creator_id is distinct from v_binding.creator_id or new.source_id is distinct from v_binding.offer_id
    or new.product_id is distinct from v_binding.product_id or new.product_key is distinct from v_binding.product_key
    or new.provider_product_id is distinct from v_binding.provider_product_id
    or new.provider is distinct from (case v_binding.platform when 'ios' then 'revenuecat_app_store' else 'revenuecat_google_play' end)
    or new.amount_minor is distinct from v_binding.amount_minor or new.currency is distinct from v_binding.currency
    or new.environment is distinct from v_binding.environment
    or (v_binding.platform='ios' and new.metadata->>'store_mapping_id' is distinct from v_binding.price_id::text)
  then raise exception 'subscription_intent_binding_mismatch'; end if;
  return new;
end;
$$;
revoke all on function public.guard_creator_subscription_intent_binding_internal() from public,anon,authenticated,service_role;
create trigger guard_creator_subscription_intent_binding before insert or update on public.money_purchase_intents
  for each row execute function public.guard_creator_subscription_intent_binding_internal();

create function public.capture_creator_subscription_quote_binding_internal()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_binding public.creator_channel_subscription_catalog_bindings;
begin
  select binding.* into v_binding from public.creator_channel_subscription_catalog_bindings binding
    join public.money_purchase_intents intent on intent.subscription_catalog_binding_id=binding.id
    where intent.id=new.purchase_intent_id;
  if v_binding.id is not null then
    new.subscription_catalog_binding_id:=v_binding.id;
    new.terms:=new.terms||jsonb_build_object('subscriptionCatalogBinding',
      public.creator_subscription_catalog_binding_json_internal(v_binding));
  elsif new.subscription_catalog_binding_id is not null then
    raise exception 'subscription_quote_binding_mismatch';
  end if;
  return new;
end;
$$;
revoke all on function public.capture_creator_subscription_quote_binding_internal() from public,anon,authenticated,service_role;
create trigger capture_creator_subscription_quote_binding before insert on public.creator_money_purchase_quotes
  for each row execute function public.capture_creator_subscription_quote_binding_internal();

alter function public.money_purchase_intent_safe_row(public.money_purchase_intents)
  rename to money_purchase_intent_safe_row_pre_subscription_binding;
revoke all on function public.money_purchase_intent_safe_row_pre_subscription_binding(public.money_purchase_intents)
  from public,anon,authenticated,service_role;
create function public.money_purchase_intent_safe_row(intent_row public.money_purchase_intents)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.money_purchase_intent_safe_row_pre_subscription_binding(intent_row)
    ||case when binding.id is null then '{}'::jsonb else jsonb_build_object('subscriptionCatalogBinding',
      public.creator_subscription_catalog_binding_json_internal(binding)) end
  from (select 1) singleton left join public.creator_channel_subscription_catalog_bindings binding
    on binding.id=intent_row.subscription_catalog_binding_id;
$$;
revoke all on function public.money_purchase_intent_safe_row(public.money_purchase_intents) from public,anon,authenticated,service_role;

alter function public.ios_creator_money_store_mapping_id_internal(uuid,text)
  rename to ios_creator_money_store_mapping_id_pre_subscription_binding;
revoke all on function public.ios_creator_money_store_mapping_id_pre_subscription_binding(uuid,text) from public,anon,authenticated,service_role;
create function public.ios_creator_money_store_mapping_id_internal(p_intent_id uuid,p_concept text)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_intent public.money_purchase_intents; v_binding public.creator_channel_subscription_catalog_bindings;
begin
  select * into v_intent from public.money_purchase_intents where id=p_intent_id;
  if p_concept is distinct from 'channel_subscription' or v_intent.subscription_catalog_binding_id is null then
    return public.ios_creator_money_store_mapping_id_pre_subscription_binding(p_intent_id,p_concept);
  end if;
  select * into v_binding from public.creator_channel_subscription_catalog_bindings where id=v_intent.subscription_catalog_binding_id;
  if v_binding.platform='ios' and v_intent.provider='revenuecat_app_store'
    and v_intent.product_type='channel_subscription' and v_intent.source_type='channel_subscription'
    and v_intent.creator_id=v_binding.creator_id and v_intent.source_id=v_binding.offer_id
    and v_intent.product_id=v_binding.product_id and v_intent.product_key=v_binding.product_key
    and v_intent.provider_product_id=v_binding.provider_product_id and v_intent.environment=v_binding.environment
    and v_intent.amount_minor=v_binding.amount_minor and v_intent.currency=v_binding.currency
    and v_intent.metadata->>'store_mapping_id'=v_binding.price_id::text
    and public.creator_subscription_catalog_binding_ready_internal(v_binding.id)
  then return v_binding.price_id; end if;
  return null;
end;
$$;
revoke all on function public.ios_creator_money_store_mapping_id_internal(uuid,text) from public,anon,authenticated,service_role;

alter function public.list_creator_supported_prices(text,text,text,uuid)
  rename to list_creator_supported_prices_pre_subscription_binding;
revoke all on function public.list_creator_supported_prices_pre_subscription_binding(text,text,text,uuid)
  from public,anon,authenticated,service_role;
create function public.list_creator_supported_prices(
  p_source_type text,p_platform text default null,p_environment text default 'sandbox',p_source_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb; v_creator uuid; v_amount integer; v_currency text;
begin
  v_rows:=public.list_creator_supported_prices_pre_subscription_binding(p_source_type,p_platform,p_environment,p_source_id);
  if p_source_type is distinct from 'channel_subscription' then return v_rows; end if;
  if p_source_id is null then v_creator:=auth.uid();
  else
    select creator_id,price_cents,currency into v_creator,v_amount,v_currency
      from public.creator_channel_subscription_offers where id=p_source_id;
  end if;
  return (select coalesce(jsonb_agg(price),'[]'::jsonb) from jsonb_array_elements(v_rows) price
    where exists(select 1 from public.creator_channel_subscription_catalog_bindings binding
      where binding.creator_id=v_creator and (p_source_id is null or binding.offer_id=p_source_id)
        and binding.price_id::text=price->>'priceId' and binding.platform=price->>'platform'
        and binding.environment=p_environment and binding.available_for_new_purchases
        and public.creator_subscription_catalog_binding_ready_internal(binding.id))
    or ((price->>'amountMinor')::integer=499 and (
      (price->>'platform'='android' and price->>'productKey'='channel_subscription_sandbox_monthly_499'
        and price->>'providerProductId'='channel_subscription_sandbox_monthly_499')
      or (price->>'platform'='ios' and exists(select 1 from public.monetization_product_store_mappings mapping
        where mapping.id::text=price->>'priceId' and mapping.metadata->>'slot_number' in ('1','2','3','4','5','6','7','8')
          and mapping.provider_product_id='com.chillywood.channel.subscription.slot'||(mapping.metadata->>'slot_number')
          and mapping.apple_subscription_group='chillywood_channel_slot_'||(mapping.metadata->>'slot_number'))))));
end;
$$;
revoke all on function public.list_creator_supported_prices(text,text,text,uuid) from public,anon,service_role;
grant execute on function public.list_creator_supported_prices(text,text,text,uuid) to authenticated;

alter function public.set_creator_channel_subscription_offer_at_price(text,text,text,uuid)
  rename to set_creator_channel_subscription_offer_at_price_pre_binding;
revoke all on function public.set_creator_channel_subscription_offer_at_price_pre_binding(text,text,text,uuid)
  from public,anon,authenticated,service_role;
create function public.set_creator_channel_subscription_offer_at_price(
  p_title text,p_description text,p_status text,p_price_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_creator uuid; v_price jsonb; v_offer public.creator_channel_subscription_offers;
begin
  v_creator:=public.wave1_assert_current_creator_money_authority_internal();
  select price into v_price from jsonb_array_elements(public.list_creator_supported_prices(
    'channel_subscription',null,'sandbox',null)) price where price->>'priceId'=p_price_id::text;
  if v_price is null then raise exception 'creator_store_price_not_supported'; end if;
  select * into v_offer from public.creator_channel_subscription_offers where creator_id=v_creator for update;
  if v_offer.id is null then
    return public.set_creator_channel_subscription_offer_at_price_pre_binding(p_title,p_description,p_status,p_price_id);
  end if;
  -- Keep the original full validation (including title/status and creator legal)
  -- while serializing updates against purchase issuance on the same offer row.
  return public.set_creator_channel_subscription_offer_at_price_pre_binding(p_title,p_description,p_status,p_price_id);
end;
$$;
revoke all on function public.set_creator_channel_subscription_offer_at_price(text,text,text,uuid) from public,anon,service_role;
grant execute on function public.set_creator_channel_subscription_offer_at_price(text,text,text,uuid) to authenticated;

create function public.bind_creator_subscription_offer_catalog_internal()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_binding public.creator_channel_subscription_catalog_bindings;
begin
  select * into v_binding from public.creator_channel_subscription_catalog_bindings
    where offer_id=new.id and creator_id=new.creator_id and platform='android' and environment='sandbox'
      and amount_minor=new.price_cents and currency=new.currency and available_for_new_purchases
      and public.creator_subscription_catalog_binding_ready_internal(id)
    order by version desc limit 1;
  if v_binding.id is not null then
    new.provider:='revenuecat_google_play'; new.provider_product_id:=v_binding.provider_product_id;
    new.provider_product_key:=v_binding.product_key;
  end if;
  return new;
end;
$$;
revoke all on function public.bind_creator_subscription_offer_catalog_internal() from public,anon,authenticated,service_role;
create trigger zz_bind_creator_subscription_offer_catalog before insert or update of price_cents,currency
  on public.creator_channel_subscription_offers for each row
  execute function public.bind_creator_subscription_offer_catalog_internal();

alter function public.create_creator_channel_subscription_purchase_intent(uuid)
  rename to create_creator_channel_subscription_intent_pre_binding;
revoke all on function public.create_creator_channel_subscription_intent_pre_binding(uuid) from public,anon,authenticated,service_role;
create function public.create_creator_channel_subscription_purchase_intent(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_session jsonb:=public.wave1_session_authority_readback();
  v_headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  v_platform text; v_environment text; v_offer public.creator_channel_subscription_offers;
  v_binding public.creator_channel_subscription_catalog_bindings; v_intent public.money_purchase_intents;
  v_access jsonb; v_legal jsonb; v_history jsonb; v_states jsonb;
begin
  v_platform:=lower(btrim(coalesce(v_headers->>'x-chillywood-platform','')));
  if v_user is null or v_session->>'state' is distinct from 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or v_session->>'userId' is distinct from v_user::text
    or nullif(v_session->>'sessionGeneration','') is null
    or v_session->>'sessionGeneration' is distinct from auth.jwt()->>'session_id'
    or public.is_account_access_restricted(v_user::text) then raise exception 'buyer_session_authority_required'; end if;
  if v_platform not in ('ios','android') then raise exception 'creator_money_client_platform_invalid'; end if;
  v_legal:=public.wave1_legal_requirements_readback('account');
  if coalesce((v_legal->>'allAccepted')::boolean,false) is not true then raise exception 'buyer_account_legal_not_current'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||v_user::text||':channel_subscription:'||p_offer_id::text,0));
  perform public.creator_money_reject_live_source_intent_internal(v_user,'channel_subscription',p_offer_id);
  select * into v_offer from public.creator_channel_subscription_offers where id=p_offer_id for share;
  if v_offer.id is null then raise exception 'offer_not_found'; end if;
  if v_offer.creator_id=v_user then raise exception 'creator_cannot_subscribe_to_self'; end if;
  v_access:=public.resolve_creator_channel_subscription_access(v_offer.creator_id);
  if coalesce((v_access->>'allowed')::boolean,false) and v_access->>'reason' in (
    'subscription_active','subscription_cancel_pending') then
    v_history:=public.creator_money_historical_intent_safe_row_internal(v_user,'channel_subscription',p_offer_id,v_offer.creator_id);
    return v_history||jsonb_build_object('alreadySubscribed',true);
  end if;
  if coalesce((v_access->>'requiresPurchase')::boolean,false) is not true then
    raise exception '%',coalesce(v_access->>'reason','subscription_not_available');
  end if;
  if not public.wave1_creator_money_subject_authorized_internal(v_offer.creator_id)
    or public.is_account_access_restricted(v_offer.creator_id::text) then raise exception 'creator_source_authority_restricted'; end if;
  if exists(select 1 from public.channel_audience_blocks where
    (channel_user_id=v_offer.creator_id::text and blocked_user_id=v_user::text)
    or (channel_user_id=v_user::text and blocked_user_id=v_offer.creator_id::text)) then
    raise exception 'creator_money_blocked_by_audience_policy'; end if;
  -- Stabilize rail state before resolving any catalog identity. Production
  -- remains gated by the existing full proof/legal/eligibility controls.
  perform 1 from public.platform_money_kill_switches order by key for share;
  if v_platform='ios' then v_environment:=public.ios_creator_money_expected_environment_internal();
  else
    select jsonb_object_agg(key,state) into v_states from public.platform_money_kill_switches;
    if v_states->>'revenuecat_google_play_enabled'='sandbox_only'
      and v_states->>'provider_webhooks_enabled'='sandbox_only'
      and v_states->>'digital_sales_enabled'='sandbox_only'
      and v_states->>'creator_monetization_enabled' in ('sandbox_only','on')
      and v_states->>'live_money_enabled'='off' and v_states->>'payouts_enabled'='off' then v_environment:='sandbox';
    end if;
  end if;
  if v_environment is null then raise exception 'subscription_purchase_rail_not_ready'; end if;
  if v_offer.status is distinct from (case v_environment when 'sandbox' then 'sandbox' else 'active' end) then
    raise exception 'subscription_not_available'; end if;
  select * into v_binding from public.creator_channel_subscription_catalog_bindings
    where creator_id=v_offer.creator_id and offer_id=v_offer.id and platform=v_platform and environment=v_environment
      and amount_minor=v_offer.price_cents and currency=v_offer.currency and available_for_new_purchases
      and public.creator_subscription_catalog_binding_ready_internal(id)
    order by version desc limit 1 for share;
  if v_binding.id is null then
    -- Legacy fixed catalog is retained only for its existing price. No generic
    -- amount-to-SKU guess, automatic product provisioning or silent rounding.
    if v_offer.price_cents=499 then return public.create_creator_channel_subscription_intent_pre_binding(p_offer_id); end if;
    raise exception 'subscription_catalog_binding_not_ready';
  end if;
  if v_environment='sandbox' then
    if not (public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()
      or public.resolve_sandbox_monetization_tester(v_user::text,nullif(lower(btrim(auth.jwt()->>'email')),''))) then
      raise exception 'sandbox_monetization_tester_required'; end if;
  else
    v_legal:=public.wave1_legal_requirements_readback('creator_money');
    if coalesce((v_legal->>'allAccepted')::boolean,false) is not true or v_legal->>'market' is distinct from 'UNITED_STATES' then
      raise exception 'buyer_creator_money_legal_not_current'; end if;
    if not exists(select 1 from public.wave1_creator_eligibility e where e.creator_user_id=v_offer.creator_id
      and e.state='VERIFIED' and e.account_status='ACTIVE' and e.age_18_plus and e.legal_accepted and e.creator_role
      and e.moderation_state='CLEAR' and e.market='UNITED_STATES' and e.rollout_eligible and e.platform_capability
      and e.provider_eligible and e.kyc_complete and e.tax_complete and e.sanctions_clear and e.payout_eligible) then
      raise exception 'creator_not_verified_for_production_money'; end if;
  end if;
  if (select count(*) from public.money_purchase_intents where user_id=v_user and status='pending'
    and expires_at>now() and created_at>now()-interval '1 minute')>=6 then raise exception 'subscription_purchase_intent_rate_limited'; end if;
  insert into public.money_purchase_intents(user_id,product_id,product_key,product_type,provider,provider_product_id,
    source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,metadata,subscription_catalog_binding_id)
  values(v_user,v_binding.product_id,v_binding.product_key,'channel_subscription',
    case v_platform when 'ios' then 'revenuecat_app_store' else 'revenuecat_google_play' end,v_binding.provider_product_id,
    'channel_subscription',v_offer.id,v_offer.creator_id,v_environment,'pending',v_binding.amount_minor,v_binding.currency,
    'creator_subscription:'||v_user::text||':'||gen_random_uuid()::text,now()+interval '15 minutes',
    jsonb_strip_nulls(jsonb_build_object('store_mapping_id',case when v_platform='ios' then v_binding.price_id end,
      'concept','channel_subscription','sandbox_only',v_environment='sandbox','production_intent',v_environment='production',
      'not_payable',true,'viewer_access_only',true,'grants_livekit_authority',false,'grants_host_authority',false,
      'premium_unlock',false,'payout_ready',false,'source_surface','creator_channel_subscription')),v_binding.id)
  returning * into v_intent;
  return public.money_purchase_intent_safe_row(v_intent)||jsonb_build_object('alreadySubscribed',false,
    'concept','channel_subscription','providerProductId',v_binding.provider_product_id,'environment',v_environment,
    'storeMappingId',case when v_platform='ios' then v_binding.price_id end);
end;
$$;
revoke all on function public.create_creator_channel_subscription_purchase_intent(uuid) from public,anon;
grant execute on function public.create_creator_channel_subscription_purchase_intent(uuid) to authenticated,service_role;

-- Generic iOS callers must enter the same server-bound path; caller metadata
-- never chooses the binding or overrides the quote. Other concepts are intact.
alter function public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)
  rename to create_ios_creator_money_intent_pre_subscription_binding;
revoke all on function public.create_ios_creator_money_intent_pre_subscription_binding(text,uuid,integer,jsonb)
  from public,anon,authenticated,service_role;
create function public.create_ios_creator_money_purchase_intent(
  p_concept text,p_source_id uuid,p_amount_minor integer,p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_price integer; v_user uuid:=auth.uid();
begin
  if lower(btrim(p_concept))='channel_subscription' and exists(
    select 1 from public.creator_channel_subscription_catalog_bindings binding
      join public.creator_channel_subscription_offers offer on offer.id=binding.offer_id
      where binding.offer_id=p_source_id and binding.platform='ios' and binding.amount_minor=offer.price_cents
        and binding.currency=offer.currency and binding.available_for_new_purchases
        and public.creator_subscription_catalog_binding_ready_internal(binding.id)) then
    perform public.creator_money_client_metadata_internal(p_metadata);
    if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-chillywood-platform','')<>'ios' then
      raise exception 'creator_money_client_platform_invalid';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||v_user::text||':channel_subscription:'||p_source_id::text,0));
    perform public.creator_money_reject_live_source_intent_internal(v_user,'channel_subscription',p_source_id);
    select price_cents into v_price from public.creator_channel_subscription_offers where id=p_source_id for share;
    if p_amount_minor is distinct from v_price then raise exception 'ios_creator_money_exact_store_price_required'; end if;
    return public.create_creator_channel_subscription_purchase_intent(p_source_id);
  end if;
  return public.create_ios_creator_money_intent_pre_subscription_binding(p_concept,p_source_id,p_amount_minor,p_metadata);
end;
$$;
revoke all on function public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb) from public,anon;
grant execute on function public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb) to authenticated,service_role;
