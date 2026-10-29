-- Read existing store catalogs; this migration creates no products, changes no
-- provider configuration, and enables no production rail or payout.
-- Purchase time is distinct from webhook creation/delivery time. Retain the
-- verified payload's value so a delayed receipt cannot claim a newer intent.
create table public.creator_money_provider_purchase_times(
  provider text not null,provider_event_id text not null,user_id uuid not null,
  provider_product_id text not null,environment text not null,raw_payload_hash text not null,
  purchased_at timestamptz,primary key(provider,provider_event_id),
  check(provider in ('revenuecat_app_store','revenuecat_google_play')),
  check(environment in ('sandbox','production')),check(raw_payload_hash~'^[0-9a-f]{64}$'),
  check(purchased_at is null or (isfinite(purchased_at) and purchased_at>'1970-01-01'::timestamptz))
);
alter table public.creator_money_provider_purchase_times enable row level security;
alter table public.creator_money_provider_purchase_times force row level security;
revoke all on public.creator_money_provider_purchase_times from public,anon,authenticated,service_role;
create function public.reject_creator_purchase_time_mutation_internal()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'creator_purchase_time_receipt_immutable'; end;
$$;
revoke all on function public.reject_creator_purchase_time_mutation_internal() from public,anon,authenticated,service_role;
create trigger creator_purchase_time_receipt_immutable before update or delete on public.creator_money_provider_purchase_times
for each row execute function public.reject_creator_purchase_time_mutation_internal();
create function public.record_creator_money_purchase_time_internal(
  p_provider text,p_provider_event_id text,p_user_id uuid,p_provider_product_id text,
  p_environment text,p_raw_payload_hash text,p_purchased_at timestamptz
) returns void language plpgsql security definer set search_path='' as $$
declare receipt public.creator_money_provider_purchase_times;
begin
  insert into public.creator_money_provider_purchase_times values(p_provider,p_provider_event_id,p_user_id,
    p_provider_product_id,p_environment,p_raw_payload_hash,
    case when isfinite(p_purchased_at) and p_purchased_at>'1970-01-01'::timestamptz then p_purchased_at end)
  on conflict do nothing;
  select * into strict receipt from public.creator_money_provider_purchase_times
    where provider=p_provider and provider_event_id=p_provider_event_id;
  if row(receipt.user_id,receipt.provider_product_id,receipt.environment,receipt.raw_payload_hash,receipt.purchased_at)
    is distinct from row(p_user_id,p_provider_product_id,p_environment,p_raw_payload_hash,
      case when isfinite(p_purchased_at) and p_purchased_at>'1970-01-01'::timestamptz then p_purchased_at end)
  then raise exception 'creator_purchase_time_receipt_mismatch'; end if;
end;
$$;
revoke all on function public.record_creator_money_purchase_time_internal(text,text,uuid,text,text,text,timestamptz) from public,anon,authenticated,service_role;
create function public.creator_event_intent_receipt_matches_internal(intent public.money_purchase_intents,p_provider_event_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select intent.source_type='event' and intent.product_type='event_pass'
    and intent.status in ('pending','expired')
    and exists(select 1 from public.creator_money_provider_purchase_times receipt
      where receipt.provider=intent.provider and receipt.provider_event_id=p_provider_event_id
        and receipt.user_id=intent.user_id and receipt.provider_product_id=intent.provider_product_id
        and receipt.environment=intent.environment and receipt.purchased_at>=intent.created_at
        and receipt.purchased_at<=statement_timestamp())
    and exists(select 1 from public.event_ticket_reservations reservation
      where reservation.purchase_intent_id=intent.id and reservation.buyer_id=intent.user_id
        and reservation.creator_event_id=intent.source_id and reservation.revision_id=intent.event_terms_revision_id
        and reservation.state in ('held','fulfilling'));
$$;
revoke all on function public.creator_event_intent_receipt_matches_internal(public.money_purchase_intents,text) from public,anon,authenticated,service_role;

create or replace function public.creator_money_supported_prices_internal(
  p_source_type text,p_platform text,p_environment text
) returns setof jsonb language sql stable security definer set search_path='' as $$
  with expected as (
    select case p_source_type
      when 'paid_content' then 'paid_content_access'
      when 'watch_party_live' then 'watch_party_live_ticket'
      when 'event' then 'event_pass'
      when 'creator_tip' then 'creator_tip'
      when 'vip_pass' then 'vip_pass'
      when 'channel_subscription' then 'channel_subscription'
      when 'live_watch_party_access' then 'live_watch_party_access_pass'
      when 'live_watch_party_seat' then 'live_watch_party_seat_pass' end as product_type
  ), catalog as (
    select product.id as price_id,product.product_key,product.provider,
      product.provider_product_id,'android'::text as platform,
      case when coalesce(product.metadata->>'price_tier',substring(product.product_key from '([0-9]+)$')) ~ '^[0-9]{1,7}$'
        then coalesce(product.metadata->>'price_tier',substring(product.product_key from '([0-9]+)$'))::integer end as amount,
      'usd'::text as currency,product.environment,product.status,
      product.metadata->>'provider_proof'='true' as verified
    from public.monetization_products product,expected
    where product.product_type=expected.product_type
      and product.provider='revenuecat_google_play' and product.is_android_digital
      and not product.is_physical_good
      and product.environment=p_environment
      and product.status=case p_environment when 'sandbox' then 'sandbox' when 'production' then 'active' end
      and nullif(trim(product.provider_product_id),'') is not null
      and ((p_environment='sandbox' and product.metadata->>'sandbox_purchase_intents_enabled'='true')
        or (p_environment='production' and product.metadata->>'provider_proof'='true'
          and product.metadata->>'owner_release_approved'='true'
          and product.metadata->>'physical_device_proof'='true'))
    union all
    select mapping.id,product.product_key,mapping.provider,mapping.provider_product_id,
      mapping.platform,mapping.reference_price_minor,lower(mapping.reference_currency),
      mapping.environment,mapping.status,mapping.metadata->>'provider_proof'='true'
    from public.monetization_product_store_mappings mapping
    join public.monetization_products product on product.id=mapping.product_id
    join expected on expected.product_type=product.product_type
    where mapping.platform='ios' and mapping.store='app_store' and mapping.provider='revenuecat_app_store'
      and mapping.environment=p_environment
      and mapping.status=case p_environment when 'sandbox' then 'sandbox' when 'production' then 'active' end
      and nullif(trim(mapping.provider_product_id),'') is not null
      and not mapping.grants_livekit_authority and not mapping.creates_payable_balance
      and mapping.unlocks_digital_access=(p_source_type<>'creator_tip')
      and (p_environment='sandbox' or (p_environment='production'
        and mapping.metadata->>'provider_proof'='true'
        and mapping.metadata->>'owner_release_approved'='true'
        and mapping.metadata->>'physical_device_proof'='true'))
  )
  select jsonb_build_object('priceId',price_id,'productKey',product_key,'provider',provider,
    'providerProductId',provider_product_id,'platform',platform,'amountMinor',amount,
    'currency',currency,'environment',environment,'status',status,'providerVerified',coalesce(verified,false))
  from catalog where amount>0 and currency='usd' and (p_platform is null or platform=p_platform)
  order by amount,platform,provider_product_id;
$$;
revoke all on function public.creator_money_supported_prices_internal(text,text,text) from public,anon,authenticated,service_role;

create or replace function public.list_creator_supported_prices(
  p_source_type text,p_platform text default null,p_environment text default 'sandbox',p_source_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_amount integer; v_min integer; v_max integer; v_currency text; v_rows jsonb;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  if p_platform is not null and p_platform not in ('ios','android') then raise exception 'store_platform_invalid'; end if;
  if p_environment not in ('sandbox','production') then raise exception 'store_environment_invalid'; end if;
  if p_source_type not in ('creator_tip','paid_content','watch_party_live','event','vip_pass','channel_subscription','live_watch_party_access','live_watch_party_seat')
  then raise exception 'creator_money_source_type_invalid'; end if;
  if p_source_id is not null then
    case p_source_type
      when 'paid_content' then select price_cents,currency into v_amount,v_currency from public.creator_content_prices where content_id=p_source_id and content_type='creator_video' and is_paid;
      when 'watch_party_live' then select price_cents,currency into v_amount,v_currency from public.paid_watch_party_offers where id=p_source_id;
      when 'event' then select price_cents,currency into v_amount,v_currency from public.paid_creator_events where creator_event_id=p_source_id and status in ('sandbox','active','draft','paused','sold_out') order by updated_at desc,id desc limit 1;
      when 'vip_pass' then select price_cents,currency into v_amount,v_currency from public.creator_vip_pass_offers where id=p_source_id;
      when 'channel_subscription' then select price_cents,currency into v_amount,v_currency from public.creator_channel_subscription_offers where id=p_source_id;
      when 'creator_tip' then select min_amount_cents,max_amount_cents,currency into v_min,v_max,v_currency from public.creator_tip_settings where creator_id=p_source_id and tips_enabled;
      else select price_cents,currency into v_amount,v_currency from public.paid_live_watch_party_offers where id=p_source_id and pass_type=case p_source_type when 'live_watch_party_access' then 'live_watch_party_access_pass' else 'live_watch_party_seat_pass' end;
    end case;
    if v_currency is null then return '[]'::jsonb; end if;
  end if;
  select coalesce(jsonb_agg(price),'[]'::jsonb) into v_rows
  from public.creator_money_supported_prices_internal(p_source_type,p_platform,p_environment) price
  where p_source_id is null or (lower(v_currency)=price->>'currency' and
    ((p_source_type='creator_tip' and (price->>'amountMinor')::integer between v_min and v_max)
      or (price->>'amountMinor')::integer=v_amount));
  return v_rows;
end;
$$;
revoke all on function public.list_creator_supported_prices(text,text,text,uuid) from public,anon;
grant execute on function public.list_creator_supported_prices(text,text,text,uuid) to authenticated;

create or replace function public.assert_creator_supported_price_internal(p_source_type text,p_amount integer,p_currency text)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.creator_money_supported_prices_internal(p_source_type,null,'sandbox') price
    where (price->>'amountMinor')::integer=p_amount and price->>'currency'=lower(p_currency))
  then raise exception 'creator_store_price_not_supported'; end if;
end;
$$;
revoke all on function public.assert_creator_supported_price_internal(text,integer,text) from public,anon,authenticated,service_role;

-- A store-specific tier may be offered while another platform has no matching
-- product. Checkout on that platform must remain unavailable, never substitute.
create or replace function public.set_creator_content_price(
  p_content_type text,p_content_id uuid,p_is_paid boolean,p_price_cents integer,p_currency text default 'usd'
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_content_type='creator_video' and coalesce(p_is_paid,false) then
    perform public.assert_creator_supported_price_internal('paid_content',p_price_cents,p_currency);
  end if;
  return public.set_creator_content_price_pre_finite_paid_video_tier(p_content_type,p_content_id,p_is_paid,p_price_cents,p_currency);
end;
$$;
revoke all on function public.set_creator_content_price(text,uuid,boolean,integer,text) from public,anon;
grant execute on function public.set_creator_content_price(text,uuid,boolean,integer,text) to authenticated,service_role;

create or replace function public.set_creator_vip_pass_offer_at_price(p_title text,p_description text,p_status text,p_price_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_price jsonb; v_result jsonb; v_offer public.creator_vip_pass_offers%rowtype;
begin
  perform public.wave1_assert_current_creator_money_authority_internal();
  select price into v_price from public.creator_money_supported_prices_internal('vip_pass',null,'sandbox') price where price->>'priceId'=p_price_id::text;
  if v_price is null then raise exception 'creator_store_price_not_supported'; end if;
  v_result:=public.set_creator_vip_pass_offer(p_title,p_description,p_status);
  update public.creator_vip_pass_offers set price_cents=(v_price->>'amountMinor')::integer,currency=v_price->>'currency'
    where id=(v_result->>'id')::uuid and creator_id=auth.uid() returning * into v_offer;
  if v_offer.id is null then raise exception 'creator_offer_price_not_saved'; end if;
  return public.creator_vip_pass_offer_safe_row(v_offer);
end;
$$;
revoke all on function public.set_creator_vip_pass_offer_at_price(text,text,text,uuid) from public,anon;
grant execute on function public.set_creator_vip_pass_offer_at_price(text,text,text,uuid) to authenticated;

create or replace function public.set_creator_channel_subscription_offer_at_price(p_title text,p_description text,p_status text,p_price_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_price jsonb; v_result jsonb; v_offer public.creator_channel_subscription_offers%rowtype;
begin
  perform public.wave1_assert_current_creator_money_authority_internal();
  select price into v_price from public.creator_money_supported_prices_internal('channel_subscription',null,'sandbox') price where price->>'priceId'=p_price_id::text;
  if v_price is null then raise exception 'creator_store_price_not_supported'; end if;
  v_result:=public.set_creator_channel_subscription_offer(p_title,p_description,p_status);
  update public.creator_channel_subscription_offers set price_cents=(v_price->>'amountMinor')::integer,currency=v_price->>'currency'
    where id=(v_result->>'id')::uuid and creator_id=auth.uid() returning * into v_offer;
  if v_offer.id is null then raise exception 'creator_offer_price_not_saved'; end if;
  return public.channel_subscription_offer_safe_row(v_offer);
end;
$$;
revoke all on function public.set_creator_channel_subscription_offer_at_price(text,text,text,uuid) from public,anon;
grant execute on function public.set_creator_channel_subscription_offer_at_price(text,text,text,uuid) to authenticated;

-- Match future documented Android tiers by exact amount too. When no such
-- product exists the retained legacy identifier is never charge authority:
-- checkout still compares the authoritative source amount against its catalog.
create function public.bind_creator_source_catalog_price_internal()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_type text; v_price jsonb;
begin
  v_type:=case tg_table_name when 'creator_content_prices' then 'paid_content'
    when 'paid_watch_party_offers' then 'watch_party_live' when 'paid_creator_events' then 'event'
    when 'creator_vip_pass_offers' then 'vip_pass' when 'creator_channel_subscription_offers' then 'channel_subscription' end;
  select price into v_price from public.creator_money_supported_prices_internal(v_type,'android','sandbox') price
    where (price->>'amountMinor')::integer=new.price_cents and price->>'currency'=lower(new.currency)
    order by price->>'priceId' limit 1;
  if v_price is not null then
    new.provider:=v_price->>'provider'; new.provider_product_id:=v_price->>'providerProductId'; new.provider_product_key:=v_price->>'productKey';
  end if;
  return new;
end;
$$;
revoke all on function public.bind_creator_source_catalog_price_internal() from public,anon,authenticated,service_role;
create trigger bind_creator_source_catalog_price before insert or update of price_cents,currency on public.creator_content_prices for each row execute function public.bind_creator_source_catalog_price_internal();
create trigger bind_creator_source_catalog_price before insert or update of price_cents,currency on public.paid_watch_party_offers for each row execute function public.bind_creator_source_catalog_price_internal();
create trigger bind_creator_source_catalog_price before insert or update of price_cents,currency on public.paid_creator_events for each row execute function public.bind_creator_source_catalog_price_internal();
create trigger bind_creator_source_catalog_price before insert or update of price_cents,currency on public.creator_vip_pass_offers for each row execute function public.bind_creator_source_catalog_price_internal();
create trigger bind_creator_source_catalog_price before insert or update of price_cents,currency on public.creator_channel_subscription_offers for each row execute function public.bind_creator_source_catalog_price_internal();

create function public.pause_creator_offer(p_source_type text,p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_vip public.creator_vip_pass_offers; v_channel public.creator_channel_subscription_offers;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() then raise exception 'creator_session_authority_required'; end if;
  if p_source_type='vip_pass' then
    update public.creator_vip_pass_offers set status='paused',updated_at=now() where id=p_offer_id and creator_id=auth.uid() and status in ('sandbox','active','paused') returning * into v_vip;
    if v_vip.id is null then raise exception 'creator_offer_not_available'; end if;
    return public.creator_vip_pass_offer_safe_row(v_vip);
  elsif p_source_type='channel_subscription' then
    update public.creator_channel_subscription_offers set status='paused',updated_at=now() where id=p_offer_id and creator_id=auth.uid() and status in ('sandbox','active','paused') returning * into v_channel;
    if v_channel.id is null then raise exception 'creator_offer_not_available'; end if;
    return public.channel_subscription_offer_safe_row(v_channel);
  end if;
  raise exception 'creator_money_source_type_invalid';
end;
$$;
revoke all on function public.pause_creator_offer(text,uuid) from public,anon;
grant execute on function public.pause_creator_offer(text,uuid) to authenticated;

create table public.creator_money_purchase_quotes(
  purchase_intent_id uuid primary key references public.money_purchase_intents(id) on delete restrict,
  user_id uuid not null,creator_id uuid not null,source_type text not null,source_id uuid not null,
  amount_minor integer not null check(amount_minor>0),currency text not null check(currency~'^[a-z]{3}$'),
  provider text not null,provider_product_id text not null,environment text not null,
  title text not null,terms jsonb not null,created_at timestamptz not null,expires_at timestamptz not null
);
alter table public.creator_money_purchase_quotes enable row level security;
alter table public.creator_money_purchase_quotes force row level security;
revoke all on public.creator_money_purchase_quotes from public,anon,authenticated,service_role;
grant select on public.creator_money_purchase_quotes to authenticated,service_role;
create function public.creator_money_purchase_quote_self_read()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.wave1_current_caller_authority_internal()
    and not public.is_account_access_restricted(auth.uid()::text);
$$;
revoke all on function public.creator_money_purchase_quote_self_read() from public,anon,authenticated,service_role;
grant execute on function public.creator_money_purchase_quote_self_read() to authenticated;
create policy creator_money_purchase_quotes_self on public.creator_money_purchase_quotes for select to authenticated
  using(user_id=auth.uid() and public.creator_money_purchase_quote_self_read());

create or replace function public.capture_creator_money_purchase_quote_internal()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_source jsonb; v_title text; v_destination text; v_destination_id text; v_terms jsonb; v_event_terms jsonb;
begin
  if new.source_type not in ('creator_tip','paid_content','watch_party_live','event','vip_pass','channel_subscription','live_watch_party_access','live_watch_party_seat') then return new; end if;
  if not exists(select 1 from public.creator_money_supported_prices_internal(new.source_type,null,new.environment) price
    where price->>'provider'=new.provider and price->>'providerProductId'=new.provider_product_id
      and (price->>'amountMinor')::integer=new.amount_minor and price->>'currency'=lower(new.currency))
  then raise exception 'purchase_quote_store_price_mismatch'; end if;
  case new.source_type
    when 'paid_content' then select to_jsonb(video) into v_source from public.videos video where id=new.source_id and owner_id=new.creator_id; v_destination:='video'; v_destination_id:=new.source_id::text;
    when 'watch_party_live' then select to_jsonb(offer) into v_source from public.paid_watch_party_offers offer where id=new.source_id and creator_id=new.creator_id; v_destination:='party_room'; v_destination_id:=v_source->>'party_id';
    when 'event' then select to_jsonb(event) into v_source from public.creator_events event where id=new.source_id and host_user_id=new.creator_id; v_destination:='event'; v_destination_id:=new.source_id::text;
    when 'vip_pass' then select to_jsonb(offer) into v_source from public.creator_vip_pass_offers offer where id=new.source_id and creator_id=new.creator_id; v_destination:='vip_pass'; v_destination_id:=new.creator_id::text;
    when 'channel_subscription' then select to_jsonb(offer) into v_source from public.creator_channel_subscription_offers offer where id=new.source_id and creator_id=new.creator_id; v_destination:='channel_subscription'; v_destination_id:=new.creator_id::text;
    when 'creator_tip' then select to_jsonb(settings) into v_source from public.creator_tip_settings settings where creator_id=new.creator_id and creator_id=new.source_id; v_destination:='channel'; v_destination_id:=new.creator_id::text;
    else select to_jsonb(offer) into v_source from public.paid_live_watch_party_offers offer where id=new.source_id and creator_id=new.creator_id; v_destination:='live_stage'; v_destination_id:=v_source->>'party_id';
  end case;
  if v_source is null or nullif(v_destination_id,'') is null then raise exception 'purchase_quote_exact_source_missing'; end if;
  v_title:=coalesce(nullif(v_source->>'title',''),nullif(v_source->>'event_title',''),case new.source_type
    when 'creator_tip' then 'Creator tip' when 'paid_content' then 'Paid video'
    when 'live_watch_party_seat' then 'Live Stage speaking eligibility' else 'Creator purchase' end);
  v_terms:=jsonb_strip_nulls(jsonb_build_object('version',1,'destination',jsonb_build_object('type',v_destination,'id',v_destination_id),
    'startsAt',v_source->>'starts_at','endsAt',v_source->>'ends_at',
    'includes',case new.source_type when 'creator_tip' then 'Voluntary creator support; no access entitlement'
      when 'paid_content' then 'Access to this creator video'
      when 'watch_party_live' then 'Admission to this Party Room'
      when 'event' then 'Admission to this scheduled virtual event'
      when 'vip_pass' then 'This creator VIP access for 30 days from verified activation'
      when 'channel_subscription' then 'This creator monthly subscription for the verified billing period'
      when 'live_watch_party_access' then 'Viewer access to this Live Stage'
      when 'live_watch_party_seat' then 'Speaking eligibility; separate host approval is required' end,
    'automaticRefundPromised',false,'premiumIncluded',false));
  if new.source_type='event' then
    select revision.terms into v_event_terms from public.creator_event_offer_revisions revision
      where revision.id=new.event_terms_revision_id and revision.creator_event_id=new.source_id and revision.creator_id=new.creator_id;
    if v_event_terms is null then raise exception 'purchase_quote_event_revision_missing'; end if;
    v_title:=coalesce(v_event_terms->>'title',v_title);
    v_terms:=v_terms||v_event_terms||jsonb_build_object('termsRevisionId',new.event_terms_revision_id);
  end if;
  insert into public.creator_money_purchase_quotes values(new.id,new.user_id,new.creator_id,new.source_type,new.source_id,
    new.amount_minor,lower(new.currency),new.provider,new.provider_product_id,new.environment,v_title,v_terms,new.created_at,new.expires_at);
  return new;
end;
$$;
revoke all on function public.capture_creator_money_purchase_quote_internal() from public,anon,authenticated,service_role;
create trigger capture_creator_money_purchase_quote after insert on public.money_purchase_intents
  for each row execute function public.capture_creator_money_purchase_quote_internal();

create or replace function public.guard_creator_money_purchase_quote_internal()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='creator_money_purchase_quotes' then raise exception 'purchase_quote_immutable'; end if;
  if row(new.id,new.user_id,new.creator_id,new.platform_id,new.source_type,new.source_id,new.product_id,new.product_key,new.product_type,new.provider,new.provider_product_id,new.environment,new.amount_minor,new.currency,new.session_generation,new.event_terms_revision_id,new.created_at,new.expires_at)
    is distinct from row(old.id,old.user_id,old.creator_id,old.platform_id,old.source_type,old.source_id,old.product_id,old.product_key,old.product_type,old.provider,old.provider_product_id,old.environment,old.amount_minor,old.currency,old.session_generation,old.event_terms_revision_id,old.created_at,old.expires_at)
  then raise exception 'purchase_intent_quote_immutable'; end if;
  return new;
end;
$$;
revoke all on function public.guard_creator_money_purchase_quote_internal() from public,anon,authenticated,service_role;
create trigger guard_creator_money_purchase_quote before update or delete on public.creator_money_purchase_quotes
  for each row execute function public.guard_creator_money_purchase_quote_internal();
create trigger guard_creator_money_purchase_intent_quote before update on public.money_purchase_intents
  for each row execute function public.guard_creator_money_purchase_quote_internal();

-- Preserve the existing API and include only the protected quote, never caller metadata.
alter function public.money_purchase_intent_safe_row(public.money_purchase_intents) rename to money_purchase_intent_safe_row_pre_quote;
revoke all on function public.money_purchase_intent_safe_row_pre_quote(public.money_purchase_intents) from public,anon,authenticated,service_role;
create function public.money_purchase_intent_safe_row(intent_row public.money_purchase_intents)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.money_purchase_intent_safe_row_pre_quote(intent_row)||jsonb_build_object(
    'quote',case when quote.purchase_intent_id is null then null else jsonb_build_object(
      'title',quote.title,'amountMinor',quote.amount_minor,'currency',quote.currency,
      'terms',quote.terms,'createdAt',quote.created_at,'expiresAt',quote.expires_at) end)
  from (select 1) singleton left join public.creator_money_purchase_quotes quote on quote.purchase_intent_id=intent_row.id;
$$;
revoke all on function public.money_purchase_intent_safe_row(public.money_purchase_intents) from public,anon,authenticated,service_role;

create or replace function public."set_paid_watch_party_offer_pre_integrity_closeout"(
  p_party_id text,
  p_title text default null,
  p_price_cents integer default 99,
  p_seat_limit integer default null,
  p_status text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  perform public.assert_creator_supported_price_internal('watch_party_live',v_price_cents,'usd');
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
  if v_room."host_user_id" <> v_actor_id and not public.has_platform_role(array['owner'::text, 'operator'::text]) then
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

revoke all on function public."set_paid_watch_party_offer_pre_integrity_closeout"(text,text,integer,integer,text) from public,anon,authenticated,service_role;

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
  perform public.assert_creator_supported_price_internal('event',v_price_cents,'usd');
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

revoke all on function public."set_paid_creator_event_offer_pre_integrity_closeout"(uuid,text,integer,integer,text) from public,anon,authenticated,service_role;

create or replace function public."process_creator_money_provider_event_pre_source_lock"(
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_original_transaction_id text,
  p_provider text,
  p_platform text,
  p_store text,
  p_store_switch_key text,
  p_input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id text := trim(coalesce(p_provider_event_id, ''));
  v_event_type text := upper(trim(coalesce(p_event_type, '')));
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_provider_product_id text := trim(coalesce(p_provider_product_id, ''));
  v_original_transaction text := nullif(trim(coalesce(p_original_transaction_id, '')), '');
  v_provider_key text := lower(trim(coalesce(p_provider, '')));
  v_product_identity_unresolved boolean := v_provider_product_id = '<missing-or-ambiguous>';
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_store text := lower(trim(coalesce(p_store, '')));
  v_store_switch_key text := lower(trim(coalesce(p_store_switch_key, '')));
  v_reported_currency text := lower(trim(coalesce(p_currency, '')));
  v_currency text := case when lower(trim(coalesce(p_currency, ''))) ~ '^[a-z]{3}$'
    then lower(trim(p_currency)) else 'usd' end;
  v_event_amount integer := greatest(coalesce(p_amount_minor, 0), 0);
  v_now timestamptz := timezone('utc'::text, now());
  v_occurred_at timestamptz := p_occurred_at;
  v_authority_occurred_at timestamptz;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_link public."revenuecat_consumable_transaction_intents"%rowtype;
  v_unbound_terminal public."revenuecat_unbound_terminal_authority"%rowtype;
  v_unbound_initial public."revenuecat_unbound_initial_authority"%rowtype;
  v_seat_offer public."paid_watch_party_offers"%rowtype;
  v_event_offer public."paid_creator_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_grant public."access_grants"%rowtype;
  v_candidate_ids uuid[];
  v_provider_count integer := 0;
  v_catalog_count integer := 0;
  v_link_count integer := 0;
  v_expected_source_type text;
  v_expected_product_type text;
  v_required_offer_status text;
  v_grant_type text;
  v_feature_key text;
  v_feature_state text;
  v_store_state text;
  v_webhook_state text;
  v_creator_money_state text;
  v_live_state text;
  v_event_rank smallint := public."revenuecat_creator_money_authority_rank_internal"(v_event_type);
  v_is_initial boolean := v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE');
  v_is_active boolean := v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE');
  v_is_financial_terminal boolean := v_event_type in ('REFUND','REVOCATION');
  v_is_access_terminal boolean := v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED');
  v_is_subscription boolean := false;
  v_ignore_reason text := case when v_is_active
    then nullif(trim(coalesce(p_input_reason, '')), '') else null end;
  v_grant_status text;
  v_payable_state text;
  v_ledger_status text;
  v_provider_status text;
  v_retain_subscription_access boolean := false;
  v_duplicate_grant boolean := false;
  v_duplicate_ledger boolean := false;
  v_bound_amount integer;
  v_bound_currency text;
begin
  if p_user_id is null then raise exception 'revenuecat_user_required'; end if;
  if v_event_id = '' or length(v_event_id)>512
    or v_event_id is distinct from coalesce(p_provider_event_id,'')
    or v_event_id ~ '[[:cntrl:]]'
  then raise exception 'revenuecat_event_id_invalid'; end if;
  if v_provider_product_id = '' or length(v_provider_product_id)>512
    or v_provider_product_id is distinct from coalesce(p_provider_product_id,'')
    or v_provider_product_id ~ '[[:cntrl:]]'
  then raise exception 'revenuecat_product_id_invalid'; end if;
  if v_environment not in ('sandbox','production') then raise exception 'revenuecat_environment_invalid'; end if;
  if not (
    (v_provider_key = 'revenuecat_app_store' and v_platform = 'ios' and v_store = 'app_store'
      and v_store_switch_key = 'revenuecat_app_store_enabled')
    or (v_provider_key = 'revenuecat_google_play' and v_platform = 'android' and v_store = 'google_play'
      and v_store_switch_key = 'revenuecat_google_play_enabled')
  ) then raise exception 'revenuecat_provider_store_tuple_invalid'; end if;
  if coalesce(p_raw_payload_hash,'') !~ '^[0-9a-f]{64}$'
  then raise exception 'revenuecat_payload_hash_invalid'; end if;
  if v_original_transaction is not null and (
    length(v_original_transaction)>512
    or v_original_transaction is distinct from coalesce(p_original_transaction_id,'')
    or v_original_transaction ~ '[[:cntrl:]]'
  ) then raise exception 'revenuecat_original_transaction_id_invalid'; end if;
  if p_occurred_at is null then
    v_occurred_at := v_now;
    if v_is_active then
      v_ignore_reason := coalesce(v_ignore_reason,'active_provider_occurred_at_required');
    end if;
  end if;
  if v_is_active and (p_amount_minor is null or p_amount_minor <= 0) then
    v_ignore_reason := coalesce(v_ignore_reason, 'active_provider_amount_invalid');
  end if;
  if v_is_active and (
    v_reported_currency !~ '^[a-z]{3}$'
    or public."money_currency_minor_unit_exponent_internal"(v_reported_currency) is null
  ) then
    v_ignore_reason := coalesce(v_ignore_reason, 'active_provider_currency_invalid');
  end if;
  if v_is_active and v_occurred_at > v_now + interval '5 minutes' then
    v_ignore_reason := coalesce(v_ignore_reason, 'active_provider_occurred_at_future_skew');
  end if;
  -- Preserve the signed provider time on provider_events, but never let any
  -- future-skewed delivery move the ordering watermark beyond receipt time.
  v_authority_occurred_at := least(v_occurred_at, v_now);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-event-id:'||v_event_id,0
  ));
  perform pg_advisory_xact_lock(hashtextextended('creator-money-provider-event:' || v_event_id, 0));
  if v_original_transaction is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'revenuecat-original:'||v_provider_key||':'||v_original_transaction,0
    ));
    perform pg_advisory_xact_lock(hashtextextended('creator-money-original-transaction:' || v_original_transaction, 0));
    select tombstone.* into v_unbound_initial
    from public."revenuecat_unbound_initial_authority" tombstone
    where tombstone."provider"=v_provider_key
      and tombstone."original_transaction_id"=v_original_transaction
    for update;
    if v_unbound_initial."provider" is not null and v_is_initial then
      if v_unbound_initial."user_id" is distinct from p_user_id
        or v_unbound_initial."provider_product_id" is distinct from v_provider_product_id
        or v_unbound_initial."environment" is distinct from v_environment
      then
        v_ignore_reason := coalesce(v_ignore_reason,'unbound_initial_authority_mismatch');
      else
        v_ignore_reason := coalesce(v_ignore_reason,'unbound_initial_original_transaction_reserved');
      end if;
    end if;
    if v_is_initial and exists (
      select 1
      from public."revenuecat_premium_transaction_authority" premium_binding
      where premium_binding."provider"=v_provider_key
        and premium_binding."original_transaction_id"=v_original_transaction
    ) then
      v_ignore_reason:=coalesce(v_ignore_reason,'revenuecat_original_transaction_cross_domain_reserved');
    end if;
  end if;

  select count(*)::integer into v_provider_count
  from public."provider_events" event
  where event."provider" = v_provider_key
    and event."provider_event_id" = v_event_id;
  if v_provider_count > 1 then
    raise exception 'revenuecat_provider_event_identity_ambiguous';
  end if;

  if v_provider_key = 'revenuecat_app_store' then
    select mapping.* into v_mapping
    from public."monetization_product_store_mappings" mapping
    where mapping."platform" = v_platform
      and mapping."store" = v_store
      and mapping."provider" = v_provider_key
      and mapping."provider_product_id" = v_provider_product_id
      and mapping."provider_base_plan_id" is null
      and mapping."environment" = v_environment
    order by mapping."updated_at" desc, mapping."id"
    limit 1;
    if v_mapping."id" is not null then
      select product.* into v_product
      from public."monetization_products" product
      where product."id" = v_mapping."product_id";
    end if;
  else
    select count(*)::integer into v_catalog_count
    from public."monetization_products" product
    where product."provider" = v_provider_key
      and product."provider_product_id" = v_provider_product_id
      and product."environment" = v_environment;
    if v_catalog_count = 1 then
      select product.* into v_product
      from public."monetization_products" product
      where product."provider" = v_provider_key
        and product."provider_product_id" = v_provider_product_id
        and product."environment" = v_environment;
      v_mapping."id" := v_product."id";
      v_mapping."product_id" := v_product."id";
      v_mapping."concept" := case v_product."product_type"
        when 'creator_tip' then 'creator_tip'
        when 'watch_party_live_ticket' then 'seat_pass'
        when 'paid_content_access' then 'paid_video'
        when 'event_pass' then 'event_pass'
        when 'vip_pass' then 'vip_pass'
        when 'channel_subscription' then 'channel_subscription'
        else null end;
      v_mapping."platform" := v_platform;
      v_mapping."store" := v_store;
      v_mapping."provider" := v_provider_key;
      v_mapping."provider_product_id" := v_provider_product_id;
      v_mapping."store_product_type" := case when v_product."product_type" = 'channel_subscription'
        then 'auto_renewable_subscription' else 'consumable' end;
      v_mapping."tier" := coalesce(v_product."metadata"->>'price_tier',substring(v_product."product_key" from '([0-9]+)$'));
      if coalesce(v_mapping."tier", '') ~ '^[0-9]+$' then
        v_mapping."reference_price_minor" := v_mapping."tier"::integer;
      end if;
      v_mapping."reference_currency" := 'usd';
      v_mapping."environment" := v_product."environment";
      v_mapping."status" := v_product."status";
      v_mapping."unlocks_digital_access" := v_mapping."concept" <> 'creator_tip';
      v_mapping."grants_livekit_authority" := false;
      v_mapping."creates_payable_balance" := false;
      v_mapping."metadata" := coalesce(v_product."metadata", '{}'::jsonb) || jsonb_build_object(
        'source_bound',true,'live_money_action',false,'google_product_catalog_binding',true
      );
    elsif v_catalog_count > 1 and v_is_active then
      v_ignore_reason := coalesce(v_ignore_reason, 'product_catalog_binding_ambiguous');
    end if;
  end if;

  if v_provider_count = 1 then
    select event.* into v_provider
    from public."provider_events" event
    where event."provider" = v_provider_key
      and event."provider_event_id" = v_event_id
    for update;
    if v_provider."user_id" is distinct from p_user_id
      or v_provider."environment" is distinct from v_environment
      or v_provider."event_type" is distinct from v_event_type
      or v_provider."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_provider."metadata"->>'provider_product_id' is distinct from v_provider_product_id
      or v_provider."metadata"->>'original_transaction_id' is distinct from v_original_transaction
    then
      raise exception 'revenuecat_provider_event_replay_mismatch';
    end if;
    if v_provider."status" <> 'received' then
      if nullif(v_provider."metadata"->>'ledger_event_id', '') is not null then
        select ledger.* into v_ledger
        from public."money_access_ledger_events" ledger
        where ledger."id" = (v_provider."metadata"->>'ledger_event_id')::uuid;
      end if;
      if nullif(v_provider."metadata"->>'access_grant_id', '') is not null then
        select grant_row.* into v_grant
        from public."access_grants" grant_row
        where grant_row."id" = (v_provider."metadata"->>'access_grant_id')::uuid;
      end if;
      return jsonb_build_object(
        'status', case when v_provider."status" = 'ignored' then 'ignored' else 'processed' end,
        'reason', coalesce(v_provider."metadata"->>'final_reason', 'duplicate_provider_event_already_finalized'),
        'productKey', v_provider."product_key",
        'productType', v_product."product_type",
        'providerEventId', v_provider."id",
        'accessGrantId', v_grant."id",
        'ledgerEventId', v_ledger."id",
        'purchaseIntentId', nullif(v_provider."metadata"->>'purchase_intent_id', ''),
        'environment', v_environment,
        'payableState', coalesce(v_ledger."payable_state", 'not_payable'),
        'grantStatus', coalesce(v_grant."status", 'blocked'),
        'duplicateProviderEvent', true,
        'duplicateAccessGrant', v_grant."id" is not null,
        'duplicateLedgerEvent', v_ledger."id" is not null
      );
    end if;
  else
    insert into public."provider_events" (
      "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
      "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
    ) values (
      v_event_id,v_provider_key,v_product."id",v_product."product_key",p_user_id,p_user_id::text,
      v_environment,v_event_type,'received',v_occurred_at,'creator_money:' || v_event_id,p_raw_payload_hash,
      jsonb_strip_nulls(jsonb_build_object(
        'provider_payload_stored',false,
        'provider_product_id',v_provider_product_id,
        'original_transaction_id',v_original_transaction,
        'store_mapping_id',v_mapping."id",
        'concept',v_mapping."concept",
        'reported_amount_minor',p_amount_minor,
        'reported_currency',nullif(v_reported_currency,''),
        'reported_expires_at',p_expires_at,
        'reference_price_minor',v_mapping."reference_price_minor",
        'reference_currency',v_mapping."reference_currency",
        'localized_storefront_price',v_mapping."id" is not null and (
          p_amount_minor is distinct from v_mapping."reference_price_minor"
          or v_currency is distinct from v_mapping."reference_currency"
        ),
        'production_money',v_environment = 'production',
        'live_money_action',false,
        'payout_ready',false
      ))
    ) returning * into v_provider;
  end if;

  if v_event_rank = 0 then v_ignore_reason := 'unsupported_event_type'; end if;
  if v_is_active and v_mapping."id" is null then v_ignore_reason := coalesce(v_ignore_reason, 'product_mapping_missing'); end if;
  if v_is_active and v_mapping."id" is not null and v_product."id" is null then v_ignore_reason := coalesce(v_ignore_reason, 'conceptual_product_missing'); end if;
  if v_original_transaction is null then v_ignore_reason := coalesce(v_ignore_reason, 'original_transaction_id_required'); end if;
  if v_is_active and v_mapping."id" is not null
    and (v_mapping."grants_livekit_authority" or v_mapping."creates_payable_balance") then
    v_ignore_reason := coalesce(v_ignore_reason, 'unsafe_store_mapping_authority');
  end if;
  if v_is_active and v_mapping."concept" = 'creator_tip' and v_mapping."unlocks_digital_access" then
    v_ignore_reason := coalesce(v_ignore_reason, 'tip_cannot_unlock_access');
  end if;
  if v_is_active and v_mapping."concept" not in ('creator_tip','seat_pass','paid_video','event_pass','vip_pass','channel_subscription') then
    v_ignore_reason := coalesce(v_ignore_reason, 'unsupported_creator_money_concept');
  end if;

  v_is_subscription := v_mapping."concept" = 'channel_subscription';
  if v_is_active and not v_is_subscription and v_event_type in (
    'RENEWAL','UNCANCELLATION','PRODUCT_CHANGE','CANCELLATION','BILLING_ISSUE','EXPIRATION','SUBSCRIPTION_PAUSED'
  ) then
    v_ignore_reason := coalesce(v_ignore_reason, 'lifecycle_event_requires_subscription');
  end if;
  if v_is_active and v_is_subscription and v_event_type = 'NON_RENEWING_PURCHASE' then
    v_ignore_reason := coalesce(v_ignore_reason, 'subscription_event_type_invalid');
  end if;
  if v_is_subscription and v_is_active and (p_expires_at is null or p_expires_at <= v_now) then
    v_ignore_reason := coalesce(v_ignore_reason, 'channel_subscription_finite_expiry_required');
  end if;

  v_expected_source_type := case v_mapping."concept"
    when 'creator_tip' then 'creator_tip'
    when 'seat_pass' then 'watch_party_live'
    when 'paid_video' then 'paid_content'
    when 'event_pass' then 'event'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  v_expected_product_type := case v_mapping."concept"
    when 'creator_tip' then 'creator_tip'
    when 'seat_pass' then 'watch_party_live_ticket'
    when 'paid_video' then 'paid_content_access'
    when 'event_pass' then 'event_pass'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  v_grant_type := case v_mapping."concept"
    when 'seat_pass' then 'watch_party_live_ticket'
    when 'paid_video' then 'paid_content_access'
    when 'event_pass' then 'event_pass'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  if v_is_active and v_product."id" is not null
    and v_product."product_type" is distinct from v_expected_product_type then
    v_ignore_reason := coalesce(v_ignore_reason, 'conceptual_product_type_mismatch');
  end if;

  v_feature_key := case
    when v_mapping."concept" = 'paid_video' then 'paid_content_enabled'
    when v_mapping."concept" = 'seat_pass' then 'watch_party_tickets_enabled'
    when v_mapping."concept" = 'creator_tip' then 'tips_enabled'
    else 'digital_sales_enabled' end;
  select "state" into v_store_state from public."platform_money_kill_switches" where "key" = v_store_switch_key;
  select "state" into v_webhook_state from public."platform_money_kill_switches" where "key" = 'provider_webhooks_enabled';
  select "state" into v_creator_money_state from public."platform_money_kill_switches" where "key" = 'creator_monetization_enabled';
  select "state" into v_live_state from public."platform_money_kill_switches" where "key" = 'live_money_enabled';
  select "state" into v_feature_state from public."platform_money_kill_switches" where "key" = v_feature_key;

  if v_is_active then
    if v_environment = 'sandbox' then
      if v_mapping."status" is distinct from 'sandbox'
        or coalesce(v_store_state, 'off') <> 'sandbox_only'
        or coalesce(v_webhook_state, 'off') <> 'sandbox_only'
        or coalesce(v_feature_state, 'off') not in ('sandbox_only','on')
        or coalesce(v_creator_money_state, 'off') not in ('sandbox_only','on')
        or coalesce(v_live_state, 'off') <> 'off'
      then
        v_ignore_reason := coalesce(v_ignore_reason, 'sandbox_switch_or_mapping_not_ready');
      end if;
    else
      if v_mapping."status" is distinct from 'active'
        or coalesce(v_store_state, 'off') <> 'on'
        or coalesce(v_webhook_state, 'off') <> 'on'
        or coalesce(v_feature_state, 'off') <> 'on'
        or coalesce(v_creator_money_state, 'off') <> 'on'
        or coalesce(v_live_state, 'off') <> 'on'
        or coalesce((v_mapping."metadata"->>'provider_proof')::boolean, false) is not true
        or coalesce((v_mapping."metadata"->>'owner_release_approved')::boolean, false) is not true
        or coalesce((v_mapping."metadata"->>'physical_device_proof')::boolean, false) is not true
      then
        v_ignore_reason := coalesce(v_ignore_reason, 'production_activation_proof_incomplete');
      end if;
    end if;
  end if;

  -- Every supported lifecycle event must recover the durable exact
  -- original-transaction binding. Only an INITIAL active event may create that
  -- binding from a unique pending intent; terminal events never fall back to a
  -- current/latest intent.
  if v_ignore_reason is null then
    select count(*)::integer into v_link_count
    from public."revenuecat_consumable_transaction_intents" link
    where link."provider" = v_provider_key
      and link."original_transaction_id" = v_original_transaction;
    if v_link_count > 1 or exists (
      select 1
      from public."revenuecat_consumable_transaction_intents" link
      where link."provider" = v_provider_key
        and link."original_transaction_id" = v_original_transaction
        and link."binding_state" <> 'exact'
    ) then
      v_ignore_reason := 'original_transaction_binding_ambiguous';
    elsif v_link_count = 1 then
      select link.* into v_link
      from public."revenuecat_consumable_transaction_intents" link
      where link."provider" = v_provider_key
        and link."original_transaction_id" = v_original_transaction
        and link."binding_state" = 'exact'
      for update;
      if v_link."user_id" is distinct from p_user_id then
        v_ignore_reason := 'original_transaction_authority_mismatch';
      elsif v_is_initial then
        v_ignore_reason := 'original_transaction_already_bound';
      else
        select intent.* into v_intent
        from public."money_purchase_intents" intent
        where intent."id" = v_link."purchase_intent_id"
        for update;
        if not v_is_active and v_intent."id" is not null then
          select product.* into v_product
          from public."monetization_products" product
          where product."id" = v_intent."product_id";
          v_mapping."id" := coalesce(v_mapping."id",v_product."id");
          v_mapping."product_id" := v_product."id";
          v_mapping."concept" := case v_intent."source_type"
            when 'creator_tip' then 'creator_tip'
            when 'watch_party_live' then 'seat_pass'
            when 'paid_content' then 'paid_video'
            when 'event' then 'event_pass'
            when 'vip_pass' then 'vip_pass'
            when 'channel_subscription' then 'channel_subscription'
            else null end;
          v_mapping."reference_price_minor" := v_intent."amount_minor";
          v_mapping."reference_currency" := lower(v_intent."currency");
          v_expected_source_type := v_intent."source_type";
          v_expected_product_type := v_intent."product_type";
          v_grant_type := case v_intent."source_type"
            when 'watch_party_live' then 'watch_party_live_ticket'
            when 'paid_content' then 'paid_content_access'
            when 'event' then 'event_pass'
            when 'vip_pass' then 'vip_pass'
            when 'channel_subscription' then 'channel_subscription'
            else null end;
          v_is_subscription := v_intent."source_type" = 'channel_subscription';
          update public."provider_events"
          set "product_id" = v_product."id", "product_key" = v_product."product_key",
              "metadata" = coalesce("metadata",'{}'::jsonb) || jsonb_build_object(
                'durable_bound_product_recovered',true,'concept',v_mapping."concept"
              )
          where "id" = v_provider."id"
          returning * into v_provider;
        end if;
        if v_intent."id" is null
          or v_intent."user_id" is distinct from p_user_id
          or v_intent."product_id" is distinct from v_product."id"
          or v_link."product_id" is distinct from v_intent."product_id"
          or v_intent."provider" is distinct from v_provider_key
          or (not v_product_identity_unresolved
            and v_intent."provider_product_id" is distinct from v_provider_product_id)
          or v_intent."environment" is distinct from v_environment
          or v_intent."source_type" is distinct from v_expected_source_type
        then
          v_ignore_reason := 'bound_purchase_intent_authority_mismatch';
        end if;
      end if;
    elsif not v_is_initial then
      if not v_is_active and v_event_rank > 0 then
        select tombstone.* into v_unbound_terminal
        from public."revenuecat_unbound_terminal_authority" tombstone
        where tombstone."provider"=v_provider_key
          and tombstone."original_transaction_id"=v_original_transaction
        for update;
        if v_unbound_terminal."provider" is null then
          insert into public."revenuecat_unbound_terminal_authority" (
            "provider","original_transaction_id","user_id","provider_product_id","environment",
            "last_provider_event_id","last_occurred_at","last_event_type","last_event_rank"
          ) values (
            v_provider_key,v_original_transaction,p_user_id,v_provider_product_id,v_environment,
            v_provider."id",v_authority_occurred_at,v_event_type,v_event_rank
          ) returning * into v_unbound_terminal;
          v_ignore_reason := 'unbound_terminal_authority_recorded';
        elsif v_unbound_terminal."user_id" is distinct from p_user_id
          or v_unbound_terminal."provider_product_id" is distinct from v_provider_product_id
          or v_unbound_terminal."environment" is distinct from v_environment
        then
          v_ignore_reason := 'unbound_terminal_authority_mismatch';
        else
          if v_unbound_terminal."last_occurred_at" < v_authority_occurred_at
            or (v_unbound_terminal."last_occurred_at"=v_authority_occurred_at
              and v_unbound_terminal."last_event_rank"<=v_event_rank)
          then
            update public."revenuecat_unbound_terminal_authority"
            set "last_provider_event_id"=v_provider."id",
                "last_occurred_at"=v_authority_occurred_at,
                "last_event_type"=v_event_type,
                "last_event_rank"=v_event_rank,
                "updated_at"=v_now
            where "provider"=v_provider_key and "original_transaction_id"=v_original_transaction
            returning * into v_unbound_terminal;
          end if;
          v_ignore_reason := 'unbound_terminal_authority_retained';
        end if;
      else
        v_ignore_reason := 'original_transaction_binding_missing';
      end if;
    else
      select tombstone.* into v_unbound_terminal
      from public."revenuecat_unbound_terminal_authority" tombstone
      where tombstone."provider"=v_provider_key
        and tombstone."original_transaction_id"=v_original_transaction
      for update;
      if v_unbound_terminal."provider" is not null then
        if v_unbound_terminal."user_id" is distinct from p_user_id
          or v_unbound_terminal."provider_product_id" is distinct from v_provider_product_id
          or v_unbound_terminal."environment" is distinct from v_environment
        then
          v_ignore_reason := 'unbound_terminal_authority_mismatch';
        elsif v_unbound_terminal."last_event_type" in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED') then
          v_ignore_reason := 'terminal_original_transaction_cannot_open';
        elsif v_unbound_terminal."last_occurred_at" > v_authority_occurred_at
          or (v_unbound_terminal."last_occurred_at"=v_authority_occurred_at
            and v_unbound_terminal."last_event_rank">=v_event_rank)
        then
          v_ignore_reason := 'prior_lifecycle_prevents_older_initial';
        end if;
      end if;
      if v_ignore_reason is null then
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
          'creator-money-pending-intent:'||p_user_id::text||':'||v_provider_key||':'
            ||v_product."id"::text||':'||coalesce(v_expected_source_type,''),0
        ));
        select array_agg(intent."id" order by intent."created_at", intent."id") into v_candidate_ids
        from public."money_purchase_intents" intent
        where intent."user_id" = p_user_id
          and intent."product_id" = v_product."id"
          and intent."provider" = v_provider_key
          and intent."provider_product_id" = v_provider_product_id
          and intent."environment" = v_environment
          and intent."source_type" = v_expected_source_type
          and ((intent."source_type"<>'event' and intent."status"='pending' and intent."expires_at">v_now)
            or public.creator_event_intent_receipt_matches_internal(intent,v_event_id))
          and intent."amount_minor" = v_mapping."reference_price_minor"
          and lower(intent."currency") = v_mapping."reference_currency";
        if coalesce(cardinality(v_candidate_ids), 0) = 0 then
          v_ignore_reason := 'purchase_intent_missing_or_expired';
        elsif cardinality(v_candidate_ids) <> 1 then
          v_ignore_reason := 'purchase_intent_binding_ambiguous';
        else
          v_intent:=null;
          select intent.* into v_intent
          from public."money_purchase_intents" intent
          where intent."id" = v_candidate_ids[1]
            and intent."user_id"=p_user_id
            and intent."product_id"=v_product."id"
            and intent."provider"=v_provider_key
            and intent."provider_product_id"=v_provider_product_id
            and intent."environment"=v_environment
            and intent."source_type"=v_expected_source_type
            and ((intent."source_type"<>'event' and intent."status"='pending' and intent."expires_at">v_now)
              or public.creator_event_intent_receipt_matches_internal(intent,v_event_id))
            and intent."amount_minor"=v_mapping."reference_price_minor"
            and lower(intent."currency")=v_mapping."reference_currency"
          for update;
          if v_intent."id" is null then
            v_ignore_reason:='purchase_intent_no_longer_pending';
          end if;
        end if;
      end if;
    end if;
  end if;

  -- Active provider events must still resolve the exact source offer. Production
  -- can never consume a sandbox source merely because its price matches.
  if v_ignore_reason is null and v_is_active then
    -- The pending intent is the immutable quote accepted before Store checkout.
    -- Mutable sale state, price edits, or payout readiness cannot erase a
    -- provider-confirmed charge. Recheck only source identity and present
    -- safety/admission constraints here; unsafe or unavailable sources remain
    -- denied and are placed in durable provider reconciliation below.
    v_required_offer_status := case when v_environment = 'production' then 'active' else 'sandbox' end;
    if v_mapping."concept" = 'creator_tip' then
      if not exists (
        select 1 from public."user_profiles" creator
        where creator."user_id" = v_intent."creator_id"::text
      ) then v_ignore_reason := 'creator_tip_source_not_available'; end if;
    elsif v_mapping."concept" = 'seat_pass' then
      select offer.* into v_seat_offer
      from public."paid_watch_party_offers" offer
      join public."watch_party_rooms" room on room."party_id"=offer."party_id"
      where offer."id" = v_intent."source_id"
        and offer."creator_id" = v_intent."creator_id"
        and offer."status" not in ('blocked','canceled')
        and coalesce(room."is_active",false)
        and room."room_type"='title'
      for update of offer;
      if v_seat_offer."id" is null then
        v_ignore_reason := 'seat_pass_source_not_available';
      elsif exists (
        select 1 from public."paid_watch_party_tickets" ticket
        where ticket."offer_id"=v_seat_offer."id"
          and ticket."buyer_id"=p_user_id
          and ticket."status"='active'
          and ticket."refunded_at" is null and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at">v_now)
      ) then
        v_ignore_reason := 'seat_pass_already_owned';
      elsif v_seat_offer."seat_limit" is not null and (
        select count(*)::integer from public."paid_watch_party_tickets" ticket
        where ticket."offer_id"=v_seat_offer."id"
          and ticket."status"='active'
          and ticket."refunded_at" is null and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at">v_now)
      ) >= v_seat_offer."seat_limit" then
        update public."paid_watch_party_offers"
        set "status"='sold_out',"updated_at"=v_now
        where "id"=v_seat_offer."id";
        v_ignore_reason := 'seat_pass_sold_out';
      end if;
    elsif v_mapping."concept" = 'paid_video' then
      if not exists (
        select 1 from public."videos" video
        where video."id" = v_intent."source_id"
          and video."owner_id" = v_intent."creator_id"
          and video."visibility" = 'public'
          and video."moderation_status" in ('clean','reported')
          and video."quarantined_at" is null
          and public."media_scan_public_safe"(video."scan_status")
          and public."is_creator_video_playable_source"(
            video."storage_path",video."storage_object_key",video."playback_url"
          )
          and not coalesce(video."vip_access_required",false)
      ) then v_ignore_reason := 'paid_video_source_not_available'; end if;
    elsif v_mapping."concept" = 'event_pass' then
      select offer.* into v_event_offer
      from public."paid_creator_events" offer
      join public."creator_events" event on event."id"=offer."creator_event_id"
      join public.event_ticket_reservations reservation
        on reservation.purchase_intent_id=v_intent."id" and reservation.offer_id=offer."id"
       and reservation.buyer_id=p_user_id
      where offer."creator_event_id"=v_intent."source_id"
        and offer."creator_id"=v_intent."creator_id"
        and offer."status" not in ('blocked','canceled')
        and event."status" not in ('ended','expired','canceled','removed','unsafe','blocked')
      for update of offer;
      if v_event_offer."id" is null then
        v_ignore_reason:='event_pass_source_not_available';
      elsif exists (
        select 1 from public."paid_creator_event_passes" pass_row
        where pass_row."event_id"=v_event_offer."id" and pass_row."buyer_id"=p_user_id
          and pass_row."status"='active' and pass_row."refunded_at" is null
          and pass_row."revoked_at" is null
          and (pass_row."expires_at" is null or pass_row."expires_at">v_now)
      ) then
        v_ignore_reason:='event_pass_already_owned';
      elsif v_event_offer."capacity_limit" is not null and (
        select count(*)::integer from public."paid_creator_event_passes" pass_row
        where pass_row."event_id"=v_event_offer."id" and pass_row."status"='active'
          and pass_row."refunded_at" is null and pass_row."revoked_at" is null
          and (pass_row."expires_at" is null or pass_row."expires_at">v_now)
      )>=v_event_offer."capacity_limit" then
        update public."paid_creator_events"
        set "status"='sold_out',"updated_at"=v_now
        where "id"=v_event_offer."id";
        v_ignore_reason:='event_pass_sold_out';
      end if;
    elsif v_mapping."concept" = 'vip_pass' then
      if not exists (
        select 1 from public."creator_vip_pass_offers" offer
        where offer."id" = v_intent."source_id"
          and offer."creator_id" = v_intent."creator_id"
          and offer."status" <> 'blocked'
      ) then v_ignore_reason := 'vip_pass_source_not_available'; end if;
    elsif v_mapping."concept" = 'channel_subscription' then
      if not exists (
        select 1 from public."creator_channel_subscription_offers" offer
        where offer."id" = v_intent."source_id"
          and offer."creator_id" = v_intent."creator_id"
          and offer."status" <> 'blocked'
      ) then v_ignore_reason := 'channel_subscription_source_not_available'; end if;
    end if;
  end if;

  -- Lifecycle and terminal deliveries carry no authority over price. Recover
  -- the original exact-bound financial values so a provider's 0/default
  -- terminal payload cannot create a mismatched reversal or ledger entry.
  if v_ignore_reason is null and not v_is_active then
    select ledger."amount_minor", lower(ledger."currency")
    into v_bound_amount, v_bound_currency
    from public."money_access_ledger_events" ledger
    where ledger."user_id" = p_user_id
      and ledger."product_id" = v_intent."product_id"
      and ledger."source_type" = v_intent."source_type"
      and ledger."source_id" = v_intent."source_id"
      and ledger."metadata"->>'purchase_intent_id' = v_intent."id"::text
      and ledger."metadata"->>'original_transaction_id' = v_original_transaction
      and ledger."event_type" in (
        'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE'
      )
      and ledger."status" in ('verified','sandbox_only')
    order by ledger."created_at" desc, ledger."id" desc
    limit 1;
    v_event_amount := coalesce(v_bound_amount, v_intent."amount_minor");
    v_currency := coalesce(v_bound_currency, lower(v_intent."currency"));
    if v_event_amount is null or v_event_amount <= 0
      or v_currency is null or v_currency !~ '^[a-z]{3}$'
    then
      v_ignore_reason := 'bound_financial_authority_missing';
    end if;
  end if;

  if v_ignore_reason is null and v_is_active then
    if public."revenuecat_authority_quarantined_internal"(
      v_provider_key,p_user_id,v_environment
    ) then
      v_ignore_reason := 'revenuecat_terminal_authority_quarantined';
    elsif v_is_subscription and not v_is_initial
      and v_event_type in ('RENEWAL','UNCANCELLATION','PRODUCT_CHANGE')
      and not public."wave1_user_account_provider_authorized_internal"(v_intent."user_id")
    then
      v_ignore_reason := 'subscription_account_authority_not_current';
    elsif (not v_is_subscription or v_is_initial)
      and not public."money_purchase_intent_session_authorized_internal"(
        v_intent."user_id",v_intent."session_generation"
      )
    then
      v_ignore_reason := 'purchase_intent_session_authority_not_current';
    elsif public."is_account_access_restricted"(p_user_id::text) then
      v_ignore_reason := 'buyer_account_restricted';
    elsif v_intent."creator_id" is null
      or public."is_account_access_restricted"(v_intent."creator_id"::text)
    then
      v_ignore_reason := case when v_mapping."concept" = 'seat_pass'
        then 'seat_pass_creator_authority_required'
        else 'creator_source_authority_restricted' end;
    end if;
  end if;

  if v_ignore_reason is null and v_link."last_provider_event_id" is not null then
    if v_link."terminal" and not v_is_access_terminal then
      v_ignore_reason := 'terminal_original_transaction_cannot_reopen';
    elsif (
      v_link."last_occurred_at" > v_authority_occurred_at
      or (v_link."last_occurred_at" = v_authority_occurred_at and v_link."last_event_rank" > v_event_rank)
      or (v_link."last_occurred_at" = v_authority_occurred_at and v_link."last_event_rank" = v_event_rank
        and v_link."last_event_type" is not null
        and (select prior."provider_event_id" from public."provider_events" prior where prior."id" = v_link."last_provider_event_id") collate "C" > v_event_id collate "C")
    ) then
      v_ignore_reason := 'stale_provider_authority_event';
    end if;
  end if;

  if v_ignore_reason is not null then
    if v_is_initial and v_original_transaction is not null and v_link."provider" is null then
      insert into public."revenuecat_unbound_initial_authority" (
        "provider","original_transaction_id","user_id","provider_product_id","environment",
        "first_provider_event_id","first_ignore_reason"
      ) values (
        v_provider_key,v_original_transaction,p_user_id,v_provider_product_id,v_environment,
        v_provider."id",left(v_ignore_reason,160)
      )
      on conflict ("provider","original_transaction_id") do nothing;
    end if;
    update public."provider_events"
    set "status" = 'ignored',
        "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
          'final_reason',v_ignore_reason,
          'authority_granted',false,
          'payout_ready',false,
          'live_money_action',false,
          'purchase_intent_id',v_intent."id",
          -- Every authoritative active delivery can represent a completed
          -- Store charge. No ignored active event may disappear without an
          -- explicit refund-or-reconciliation obligation.
          'provider_reconciliation_required',v_is_active,
          'provider_reconciliation_disposition',case
            when v_is_active
              then 'refund_or_authoritative_provider_reconciliation_required'
            else 'not_required'
          end
        )
    where "id" = v_provider."id"
    returning * into v_provider;
    return jsonb_build_object(
      'status','ignored','reason',v_ignore_reason,'productKey',v_product."product_key",
      'productType',v_product."product_type",'providerEventId',v_provider."id",
      'accessGrantId',null,'ledgerEventId',null,'purchaseIntentId',v_intent."id",
      'environment',v_environment,'payableState','not_payable','grantStatus','blocked',
      'duplicateProviderEvent',v_provider_count = 1,'duplicateAccessGrant',false,'duplicateLedgerEvent',false
    );
  end if;

  v_retain_subscription_access := v_is_subscription
    and v_event_type in ('CANCELLATION','BILLING_ISSUE')
    and p_expires_at is not null
    and p_expires_at > v_now;
  v_grant_status := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'revoked'
    when v_event_type = 'EXPIRATION' then 'expired'
    when v_event_type = 'CANCELLATION' and not v_retain_subscription_access then 'expired'
    when v_event_type = 'BILLING_ISSUE' and not v_retain_subscription_access then 'blocked'
    when v_environment = 'production' then 'active'
    else 'sandbox_only' end;
  v_payable_state := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type = 'REVOCATION' then 'reversed'
    when v_environment = 'production' and v_is_active then 'pending_verification'
    else 'not_payable' end;
  v_ledger_status := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type = 'REVOCATION' then 'reversed'
    when v_environment = 'production' and v_is_active then 'verified'
    when v_event_type = 'BILLING_ISSUE' then 'pending'
    when v_event_type in ('EXPIRATION','CANCELLATION','SUBSCRIPTION_PAUSED') then 'ignored'
    else 'sandbox_only' end;
  v_provider_status := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'reversed'
    else 'processed' end;

  select ledger.* into v_ledger
  from public."money_access_ledger_events" ledger
  where ledger."provider_event_id" = v_provider."id"
  order by ledger."created_at", ledger."id"
  limit 1;
  if v_ledger."id" is null then
    insert into public."money_access_ledger_events" (
      "user_id","creator_id","platform_id","product_id","provider_event_id","event_type",
      "amount_minor","currency","environment","payable_state","status","source_type","source_id","metadata"
    ) values (
      p_user_id,v_intent."creator_id",v_intent."platform_id",v_product."id",v_provider."id",v_event_type,
      v_event_amount,v_currency,v_environment,v_payable_state,v_ledger_status,v_intent."source_type",v_intent."source_id",
      jsonb_build_object(
        'product_key',v_product."product_key",
        'purchase_intent_id',v_intent."id",
        'provider_product_id',v_provider_product_id,
        'original_transaction_id',v_original_transaction,
        'reported_amount_minor',p_amount_minor,
        'reported_currency',nullif(v_reported_currency,''),
        'reference_price_minor',v_mapping."reference_price_minor",
        'reference_currency',v_mapping."reference_currency",
        'localized_storefront_price',p_amount_minor is distinct from v_mapping."reference_price_minor" or v_reported_currency is distinct from v_mapping."reference_currency",
        'sandbox_only',v_environment = 'sandbox',
        'production_money',v_environment = 'production',
        'not_payable',v_payable_state = 'not_payable',
        'payout_readiness_proved',false,
        'live_money_enabled_at_verification',v_environment = 'production' and v_live_state = 'on',
        'requires_settlement_before_payable',true
      )
    ) returning * into v_ledger;
  else
    v_duplicate_ledger := true;
  end if;

  if v_grant_type is not null then
    select grant_row.* into v_grant
    from public."access_grants" grant_row
    where grant_row."user_id" = p_user_id
      and grant_row."product_id" = v_product."id"
      and grant_row."grant_type" = v_grant_type
      and grant_row."source_id" = v_intent."source_id"
      and grant_row."metadata"->>'purchase_intent_id' = v_intent."id"::text
    order by grant_row."created_at", grant_row."id"
    limit 1
    for update;
    if v_grant."id" is null and v_is_active then
      insert into public."access_grants" (
        "user_id","grant_type","source_type","source_id","product_id","provider","provider_event_id",
        "environment","status","starts_at","expires_at","metadata"
      ) values (
        p_user_id,v_grant_type,'provider_event',v_intent."source_id",v_product."id",v_provider_key,v_provider."id",
        v_environment,v_grant_status,v_occurred_at,p_expires_at,
        jsonb_build_object(
          'product_key',v_product."product_key",
          'purchase_intent_id',v_intent."id",
          'provider_product_id',v_provider_product_id,
          'original_transaction_id',v_original_transaction,
          'viewer_access_only',true,
          'authority_granted',false,
          'speaker_authority',false,
          'moderator_authority',false,
          'payout_access',false,
          'premium_unlock',false,
          'creator_specific_vip_only',v_mapping."concept" = 'vip_pass',
          'production_money',v_environment = 'production'
        )
      ) returning * into v_grant;
    elsif v_grant."id" is not null then
      v_duplicate_grant := true;
      update public."access_grants"
      set "provider_event_id" = v_provider."id",
          "status" = v_grant_status,
          "expires_at" = case
            when v_is_subscription and v_grant_status in ('active','sandbox_only') then p_expires_at
            when p_expires_at is not null then p_expires_at
            else "expires_at" end,
          "refunded_at" = case when v_event_type = 'REFUND' then v_occurred_at else null end,
          "revoked_at" = case when v_grant_status in ('refunded','revoked','expired','blocked') then v_occurred_at else null end,
          "revoke_reason" = case when v_grant_status in ('refunded','revoked','expired','blocked') then 'RevenueCat ' || lower(v_event_type) || ' event.' else null end,
          "metadata" = (((coalesce("metadata", '{}'::jsonb)
            - 'grants_livekit_publish' - 'grants_host_power' - 'grants_admin_power' - 'grants_payout_access')
            || jsonb_build_object(
              'latest_provider_event_id',v_provider."id",
              'original_transaction_id',v_original_transaction,
              'viewer_access_only',true,
              'authority_granted',false,
              'speaker_authority',false,
              'moderator_authority',false,
              'payout_access',false,
              'premium_unlock',false,
              'production_money',v_environment = 'production'
            ))),
          "updated_at" = v_now
      where "id" = v_grant."id"
      returning * into v_grant;
    end if;
  end if;

  if v_is_active and (v_intent."status"='pending' or (v_intent."source_type"='event' and v_intent."status"='expired')) then
    update public."money_purchase_intents"
    set "status" = 'consumed',
        "consumed_at" = v_now,
        "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
          'consumed_by_provider_event_id',v_provider."id",
          'original_transaction_id',v_original_transaction,
          'sandbox_only',v_environment = 'sandbox',
          'production_money',v_environment = 'production',
          'not_payable',true,
          'requires_settlement_before_payable',true
        ),
        "updated_at" = v_now
    where "id" = v_intent."id";
  elsif v_is_financial_terminal then
    update public."money_purchase_intents"
    set "status" = 'revoked',
        "revoked_at" = v_occurred_at,
        "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
          'revoked_by_provider_event_id',v_provider."id",
          'not_payable',true
        ),
        "updated_at" = v_now
    where "id" = v_intent."id"
      and "status" in ('consumed','revoked');
  end if;

  if v_is_initial then
    insert into public."revenuecat_consumable_transaction_intents" (
      "provider","original_transaction_id","user_id","product_id","purchase_intent_id","provider_event_id",
      "last_provider_event_id","last_occurred_at","last_event_type","last_event_rank","terminal","binding_state"
    ) values (
      v_provider_key,v_original_transaction,p_user_id,v_product."id",v_intent."id",v_provider."id",
      v_provider."id",v_authority_occurred_at,v_event_type,v_event_rank,v_is_access_terminal,'exact'
    ) returning * into v_link;
  else
    update public."revenuecat_consumable_transaction_intents"
    set "last_provider_event_id" = v_provider."id",
        "last_occurred_at" = v_authority_occurred_at,
        "last_event_type" = v_event_type,
        "last_event_rank" = v_event_rank,
        "terminal" = "terminal" or v_is_access_terminal
    where "provider" = v_provider_key
      and "original_transaction_id" = v_original_transaction
      and "binding_state" = 'exact'
    returning * into v_link;
  end if;

  update public."provider_events"
  set "status" = v_provider_status,
      "occurred_at" = v_occurred_at,
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'final_reason',case when v_grant_type is null then 'ledger_recorded_no_access_grant' else 'access_and_ledger_recorded' end,
        'purchase_intent_id',v_intent."id",
        'access_grant_id',v_grant."id",
        'ledger_event_id',v_ledger."id",
        'authority_granted',v_grant."id" is not null and v_grant."status" in ('active','sandbox_only'),
        'payout_ready',false,
        'live_money_action',false
      ))
  where "id" = v_provider."id"
  returning * into v_provider;

  -- Refresh after the ledger normalization and subscription projection triggers.
  select ledger.* into v_ledger from public."money_access_ledger_events" ledger where ledger."id" = v_ledger."id";
  return jsonb_build_object(
    'status','processed',
    'reason',case when v_grant_type is null then 'ledger_recorded_no_access_grant' else 'access_and_ledger_recorded' end,
    'productKey',v_product."product_key",'productType',v_product."product_type",
    'providerEventId',v_provider."id",'accessGrantId',v_grant."id",'ledgerEventId',v_ledger."id",
    'purchaseIntentId',v_intent."id",'environment',v_environment,'payableState',v_ledger."payable_state",
    'ledgerStatus',v_ledger."status",'grantStatus',coalesce(v_grant."status",'blocked'),
    'duplicateProviderEvent',v_provider_count = 1,'duplicateAccessGrant',v_duplicate_grant,'duplicateLedgerEvent',v_duplicate_ledger
  );
end;
$$;

create or replace function public."process_revenuecat_consumable_event_provider_internal"(
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_original_transaction_id text,
  p_provider text,
  p_platform text,
  p_store text,
  p_store_switch_key text,
  p_input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text:=upper(pg_catalog.btrim(coalesce(p_event_type,'')));
  v_is_active boolean:=v_event_type in (
    'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION',
    'PRODUCT_CHANGE'
  );
  v_before jsonb;
  v_result jsonb;
  v_after jsonb;
  v_reason text:=nullif(pg_catalog.btrim(coalesce(p_input_reason,'')),'');
begin
  v_before:=public."creator_money_provider_source_identity_internal"(
    p_provider_event_id,p_user_id,p_provider_product_id,p_environment,
    p_original_transaction_id,p_provider
  );
  -- The terminal dispatcher already owns event/original locks before invoking
  -- this function. Terminal events never bind or consume a pending intent, so
  -- they deliberately retain that established lock order and skip the source
  -- lock. Active events enter source-first before the predecessor takes either
  -- provider lock, eliminating an active/terminal cycle.
  if v_is_active and v_before is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||(v_before->>'userId')||':'||
        (v_before->>'sourceType')||':'||(v_before->>'sourceId'),0
    ));
    v_after:=public."creator_money_provider_source_identity_internal"(
      p_provider_event_id,p_user_id,p_provider_product_id,p_environment,
      p_original_transaction_id,p_provider
    );
    if v_after is null
      or v_after->>'userId' is distinct from v_before->>'userId'
      or v_after->>'sourceType' is distinct from v_before->>'sourceType'
      or v_after->>'sourceId' is distinct from v_before->>'sourceId'
      or v_after->>'purchaseIntentId' is distinct from
        v_before->>'purchaseIntentId'
    then
      v_reason:=coalesce(v_reason,'provider_source_identity_changed');
    end if;
  elsif v_is_active then
    -- Supplying an input reason guarantees the predecessor cannot bind or
    -- consume an intent that appeared after this unresolved pre-read. It still
    -- records the charged event and its refund/reconciliation obligation.
    v_reason:=coalesce(v_reason,'provider_source_lock_unresolved');
  end if;
  if v_is_active and v_after->>'sourceType'='event' then
    v_reason:=coalesce(v_reason,public.event_ticket_reservation_failure_internal(
      (v_after->>'purchaseIntentId')::uuid,p_user_id,p_provider_event_id));
  end if;
  v_result:=public."process_creator_money_provider_event_pre_source_lock"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,
    p_environment,p_occurred_at,p_expires_at,p_amount_minor,p_currency,
    p_raw_payload_hash,p_original_transaction_id,p_provider,p_platform,p_store,
    p_store_switch_key,v_reason
  );
  if v_is_active and v_after->>'sourceType'='event' then
    perform public.finalize_event_ticket_reservation_internal(
      (v_after->>'purchaseIntentId')::uuid,p_user_id,p_provider_event_id,v_result);
  end if;
  return v_result;
end;
$$;

create or replace function public."process_revenuecat_live_watch_party_event_atomic"(
  p_provider text,p_provider_event_id text,p_event_type text,p_user_id uuid,
  p_provider_product_id text,p_environment text,p_occurred_at timestamptz,
  p_amount_minor integer,p_currency text,p_raw_payload_hash text,p_original_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_event_id text:=trim(coalesce(p_provider_event_id,''));
  v_event_type text:=upper(trim(coalesce(p_event_type,'')));
  v_environment text:=lower(trim(coalesce(p_environment,'')));
  v_original text:=trim(coalesce(p_original_transaction_id,''));
  v_product_ref text:=trim(coalesce(p_provider_product_id,''));
  v_currency text:=lower(trim(coalesce(p_currency,'')));
  v_now timestamptz:=timezone('utc'::text,now());
  v_occurred timestamptz:=least(coalesce(p_occurred_at,v_now),v_now);
  v_active boolean;
  v_terminal boolean;
  v_rank smallint;
  v_existing public."provider_events"%rowtype;
  v_link public."revenuecat_consumable_transaction_intents"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_offer public."paid_live_watch_party_offers"%rowtype;
  v_original_pass public."paid_live_watch_party_passes"%rowtype;
  v_original_provider public."provider_events"%rowtype;
  v_room public."watch_party_rooms"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_event public."provider_events"%rowtype;
  v_grant public."access_grants"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_original_ledger public."money_access_ledger_events"%rowtype;
  v_remaining_access boolean:=false;
  v_remaining_seat boolean:=false;
  v_status text;
  v_payable text;
  v_authority_failure text;
begin
  v_active:=v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE');
  v_terminal:=v_event_type in ('REFUND','REVOCATION','EXPIRATION','CANCELLATION','BILLING_ISSUE','SUBSCRIPTION_PAUSED');
  v_rank:=public."revenuecat_premium_authority_rank_internal"(v_event_type,false);
  if v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or v_event_id='' or length(v_event_id)>512 or v_event_id is distinct from coalesce(p_provider_event_id,'')
    or v_event_id~'[[:cntrl:]]' or p_user_id is null or (not v_active and not v_terminal)
    or v_environment not in ('sandbox','production')
    or v_original='' or length(v_original)>512 or v_original is distinct from coalesce(p_original_transaction_id,'')
    or v_original~'[[:cntrl:]]' or v_product_ref='' or length(v_product_ref)>512 or v_product_ref~'[[:cntrl:]]'
    or coalesce(p_raw_payload_hash,'')!~'^[0-9a-f]{64}$'
  then raise exception 'live_watch_party_provider_identity_invalid'; end if;
  if v_active and (coalesce(p_amount_minor,0)<=0 or v_currency!~'^[a-z]{3}$')
  then raise exception 'live_watch_party_provider_financials_invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('revenuecat-live-event:'||v_event_id,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('revenuecat-original:'||v_provider||':'||v_original,0));
  select event.* into v_existing from public."provider_events" event
  where event."provider"=v_provider and event."provider_event_id"=v_event_id for update;
  if v_existing."id" is not null then
    if v_existing."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_existing."user_id" is distinct from p_user_id
      or v_existing."event_type" is distinct from v_event_type
      or v_existing."environment" is distinct from v_environment
      or v_existing."metadata"->>'original_transaction_id' is distinct from v_original
      or v_existing."metadata"->>'provider_product_id' is distinct from v_product_ref
    then raise exception 'live_watch_party_provider_event_replay_mismatch'; end if;
    return jsonb_build_object('status',v_existing."status",'reason','duplicate_provider_event',
      'providerEventId',v_existing."id",'duplicateProviderEvent',true,'authorityGranted',false);
  end if;
  select link.* into v_link from public."revenuecat_consumable_transaction_intents" link
  where link."provider"=v_provider and link."original_transaction_id"=v_original
    and link."binding_state"='exact' for update;
  if v_link."purchase_intent_id" is not null then
    select intent.* into v_intent from public."money_purchase_intents" intent
    where intent."id"=v_link."purchase_intent_id" for update;
  elsif v_active then
    select intent.* into v_intent from public."money_purchase_intents" intent
    where intent."user_id"=p_user_id and intent."provider"=v_provider
      and intent."provider_product_id"=v_product_ref and intent."environment"=v_environment
      and intent."source_type" in ('live_watch_party_access','live_watch_party_seat')
      and intent."status"='pending' and intent."expires_at">v_now
      and intent."amount_minor"=p_amount_minor and lower(intent."currency")=v_currency
    order by intent."created_at",intent."id" limit 1 for update;
    if v_intent."id" is null or exists (
      select 1 from public."money_purchase_intents" other
      where other."user_id"=p_user_id and other."provider"=v_provider
        and other."provider_product_id"=v_product_ref and other."environment"=v_environment
        and other."source_type" in ('live_watch_party_access','live_watch_party_seat')
        and other."status"='pending' and other."expires_at">v_now
        and other."amount_minor"=p_amount_minor and lower(other."currency")=v_currency
        and other."id"<>v_intent."id")
    then raise exception 'live_watch_party_purchase_intent_missing_or_ambiguous'; end if;
  else
    raise exception 'live_watch_party_original_transaction_binding_required';
  end if;
  if v_intent."user_id" is distinct from p_user_id or v_intent."provider" is distinct from v_provider
    or v_intent."provider_product_id" is distinct from v_product_ref
    or v_intent."environment" is distinct from v_environment
    or v_intent."source_type" not in ('live_watch_party_access','live_watch_party_seat')
  then raise exception 'live_watch_party_bound_intent_mismatch'; end if;
  select offer.* into v_offer from public."paid_live_watch_party_offers" offer
  where offer."id"=v_intent."source_id" for update;
  select room.* into v_room from public."watch_party_rooms" room where room."party_id"=v_offer."party_id";
  select product.* into v_product from public."monetization_products" product where product."id"=v_intent."product_id";
  if v_link."purchase_intent_id" is not null then
    select pass_row.* into v_original_pass from public."paid_live_watch_party_passes" pass_row
    where pass_row."provider_event_id"=v_link."provider_event_id"
      and pass_row."offer_id"=v_intent."source_id" and pass_row."buyer_id"=p_user_id
      and pass_row."creator_id"=v_intent."creator_id" and pass_row."pass_type"=v_intent."product_type";
    select provider_event.* into v_original_provider from public."provider_events" provider_event
    where provider_event."id"=v_link."provider_event_id";
    if v_original_pass."id" is null or v_original_provider."id" is null
      or v_original_provider."user_id" is distinct from p_user_id
      or v_original_provider."product_id" is distinct from v_intent."product_id"
      or v_original_provider."environment" is distinct from v_environment
      or v_original_provider."metadata"->>'purchase_intent_id' is distinct from v_intent."id"::text
      or v_original_provider."metadata"->>'original_transaction_id' is distinct from v_original
    then raise exception 'live_watch_party_original_transaction_pass_binding_invalid'; end if;
  else
    if v_offer."id" is null or v_room."party_id" is null or v_room."room_type"<>'live'
      or v_offer."creator_id" is distinct from v_intent."creator_id"
      or v_offer."host_user_id" is distinct from v_intent."creator_id"
      or v_room."host_user_id" is distinct from v_offer."host_user_id"
      or v_offer."pass_type" is distinct from v_product."product_type"
      or v_offer."pass_type" is distinct from v_intent."product_type"
      or v_offer."pass_type" not in ('live_watch_party_access_pass','live_watch_party_seat_pass')
    then raise exception 'live_watch_party_exact_target_binding_invalid'; end if;
    -- Store identity and economics come from the immutable accepted intent.
    -- Editing this exact room offer must not rewrite an already agreed charge.
    if v_product."product_key" is distinct from v_intent."product_key"
      or v_product."provider" is distinct from v_provider
      or v_product."provider_product_id" is distinct from v_product_ref
      or v_product."environment" is distinct from v_environment
      or v_intent."amount_minor" is distinct from p_amount_minor
      or lower(v_intent."currency") is distinct from v_currency
    then raise exception 'live_watch_party_active_offer_binding_stale'; end if;
    if not coalesce(v_room."is_active",false) or v_offer."status" not in ('sandbox','active')
    then raise exception 'live_watch_party_target_no_longer_available'; end if;
  end if;
  if v_active then
    if v_environment<>'sandbox' then raise exception 'live_watch_party_production_activation_not_authorized'; end if;
    perform public."assert_live_watch_party_sandbox_rail_internal"(v_intent."product_type");
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'live-watch-party-authority:'||coalesce(v_original_pass."party_id",v_offer."party_id")||':'||p_user_id::text,0
  ));
  v_status:=case when v_active then 'processed' when v_event_type='REFUND' then 'refunded'
    when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'reversed' else 'processed' end;
  insert into public."provider_events"(
    "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
    "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
  ) values (
    v_event_id,v_provider,v_product."id",v_product."product_key",p_user_id,p_user_id::text,
    v_environment,v_event_type,v_status,v_occurred,v_event_type||':'||v_event_id,p_raw_payload_hash,
    jsonb_build_object('provider_payload_stored',false,'provider_product_id',v_product_ref,
      'original_transaction_id',v_original,'purchase_intent_id',v_intent."id",
      'live_watch_party_offer_id',v_intent."source_id",
      'party_id',case when v_original_pass."id" is null then v_offer."party_id" else v_original_pass."party_id" end,
      'creator_id',case when v_original_pass."id" is null then v_offer."creator_id" else v_original_pass."creator_id" end,
      'host_user_id',case when v_original_pass."id" is null then v_offer."host_user_id"::text else v_original_provider."metadata"->>'host_user_id' end,
      'pass_type',case when v_original_pass."id" is null then v_offer."pass_type" else v_original_pass."pass_type" end,
      'authority_granted',false,'grants_publish',false,'payout_ready',false)
  ) returning * into v_event;
  if v_active and v_link."purchase_intent_id" is not null then
    update public."provider_events" set "status"='ignored',
      "metadata"="metadata"||jsonb_build_object(
        'final_reason','duplicate_original_transaction','provider_reconciliation_required',true,
        'provider_reconciliation_disposition','refund_or_authoritative_provider_reconciliation_required'
      ) where "id"=v_event."id" returning * into v_event;
    return jsonb_build_object('status','ignored','reason','duplicate_original_transaction',
      'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",
      'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
  end if;
  if v_active then
    -- A signed charge is evidence, not permission to bypass the original
    -- buyer/session or quarantined authority. Preserve the provider event and
    -- permanently bind ignored originals for refund/provider reconciliation.
    select 'initial_authority_not_rebindable' into v_authority_failure
    from public."revenuecat_unbound_initial_authority" ignored
    where ignored."provider"=v_provider and ignored."original_transaction_id"=v_original;
    if v_authority_failure is null then
      if p_occurred_at is null or not isfinite(p_occurred_at) then
        v_authority_failure:='provider_occurred_at_missing_or_invalid';
      elsif public."revenuecat_authority_quarantined_internal"(v_provider,p_user_id,v_environment) then
        v_authority_failure:='revenuecat_terminal_authority_quarantined';
      elsif not public."money_purchase_intent_session_authorized_internal"(
        v_intent."user_id",v_intent."session_generation"
      ) then
        v_authority_failure:='purchase_intent_session_authority_not_current';
      elsif public."is_account_access_restricted"(p_user_id::text) then
        v_authority_failure:='buyer_account_restricted';
      elsif v_intent."creator_id" is null
        or public."is_account_access_restricted"(v_intent."creator_id"::text) then
        v_authority_failure:='creator_source_authority_restricted';
      end if;
    end if;
    if v_authority_failure is not null then
      insert into public."revenuecat_unbound_initial_authority"(
        "provider","original_transaction_id","user_id","provider_product_id","environment",
        "first_provider_event_id","first_ignore_reason"
      ) values (
        v_provider,v_original,p_user_id,v_product_ref,v_environment,v_event."id",v_authority_failure
      ) on conflict ("provider","original_transaction_id") do nothing;
      update public."provider_events"
      set "status"='ignored',
        "idempotency_key"='creator_money:live_watch_party:'||v_event_type||':'||v_event_id,
        "metadata"="metadata"||jsonb_build_object(
        'final_reason',v_authority_failure,'authority_granted',false,'payout_ready',false,
        'reported_amount_minor',p_amount_minor,'reported_currency',v_currency,
        'provider_reconciliation_required',true,
        'provider_reconciliation_disposition','refund_or_authoritative_provider_reconciliation_required'
      ) where "id"=v_event."id";
      return jsonb_build_object('status','ignored','reason',v_authority_failure,
        'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",
        'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
    end if;
  end if;
  if v_active then
    update public."money_purchase_intents" set "status"='consumed',"consumed_at"=v_now,"updated_at"=v_now
    where "id"=v_intent."id" and "status"='pending';
    insert into public."revenuecat_consumable_transaction_intents"(
      "provider","original_transaction_id","user_id","product_id","purchase_intent_id","provider_event_id",
      "last_provider_event_id","last_occurred_at","last_event_type","last_event_rank","terminal","binding_state"
    ) values (
      v_provider,v_original,p_user_id,v_product."id",v_intent."id",v_event."id",
      v_event."id",v_occurred,v_event_type,v_rank,false,'exact'
    ) returning * into v_link;
    insert into public."access_grants"(
      "user_id","grant_type","source_type","source_id","product_id","provider","provider_event_id",
      "environment","status","starts_at","metadata"
    ) values (
      p_user_id,v_offer."pass_type",'provider_event',v_offer."id",v_product."id",v_provider,v_event."id",
      v_environment,case when v_environment='sandbox' then 'sandbox_only' else 'active' end,v_occurred,
      jsonb_build_object('purchase_intent_id',v_intent."id",'original_transaction_id',v_original,
        'party_id',v_offer."party_id",'creator_id',v_offer."creator_id",'host_user_id',v_offer."host_user_id",
        'viewer_access_only',v_offer."pass_type"='live_watch_party_access_pass',
        'seat_eligibility_only',v_offer."pass_type"='live_watch_party_seat_pass',
        'host_approval_required',v_offer."pass_type"='live_watch_party_seat_pass',
        'authority_granted',false,'payment_role_authority',false,'payment_media_authority',false)
    ) returning * into v_grant;
    insert into public."paid_live_watch_party_passes"(
      "offer_id","party_id","buyer_id","creator_id","pass_type","access_grant_id","provider_event_id","status"
    ) values (v_offer."id",v_offer."party_id",p_user_id,v_offer."creator_id",v_offer."pass_type",v_grant."id",v_event."id",'active');
    v_payable:=case when v_environment='sandbox' then 'not_payable' else 'pending_verification' end;
    insert into public."money_access_ledger_events"(
      "user_id","creator_id","product_id","provider_event_id","event_type","amount_minor","currency",
      "environment","payable_state","status","source_type","source_id","metadata"
    ) values (
      p_user_id,v_offer."creator_id",v_product."id",v_event."id",v_event_type,p_amount_minor,v_currency,
      v_environment,v_payable,case when v_environment='sandbox' then 'sandbox_only' else 'verified' end,
      v_intent."source_type",v_offer."id",jsonb_build_object('purchase_intent_id',v_intent."id",
        'original_transaction_id',v_original,'party_id',v_offer."party_id",'pass_type',v_offer."pass_type",
        'completion_required',true,'post_completion_hold_hours',48,'reserve_basis_points',1000,
        'payout_readiness_proved',false,'grants_livekit_authority',false)
    ) returning * into v_ledger;
    return jsonb_build_object('status','processed','reason','exact_live_watch_party_purchase_applied',
      'productKey',v_product."product_key",'productType',v_product."product_type",
      'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",'accessGrantId',v_grant."id",
      'ledgerEventId',v_ledger."id",'grantStatus',v_grant."status",'payableState',v_ledger."payable_state",
      'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
  end if;
  if v_link."last_occurred_at">v_occurred
    or (v_link."last_occurred_at"=v_occurred and v_link."last_event_rank">=v_rank)
  then
    update public."provider_events" set "status"='ignored',"metadata"="metadata"||jsonb_build_object('final_reason','stale_terminal_event') where "id"=v_event."id";
    return jsonb_build_object('status','ignored','reason','stale_terminal_event','providerEventId',v_event."id",'authorityGranted',false);
  end if;
  update public."revenuecat_consumable_transaction_intents"
  set "last_provider_event_id"=v_event."id","last_occurred_at"=v_occurred,"last_event_type"=v_event_type,
      "last_event_rank"=v_rank,"terminal"=v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED')
  where "provider"=v_provider and "original_transaction_id"=v_original and "binding_state"='exact';
  update public."access_grants" set
    "status"=case when v_event_type='REFUND' then 'refunded' when v_event_type='EXPIRATION' then 'expired' else 'revoked' end,
    "refunded_at"=case when v_event_type='REFUND' then v_occurred else "refunded_at" end,
    "revoked_at"=case when v_event_type<>'REFUND' then v_occurred else "revoked_at" end,
    "revoke_reason"=lower(v_event_type),"updated_at"=v_now
  where "user_id"=p_user_id and "source_id"=v_original_pass."offer_id" and "grant_type"=v_original_pass."pass_type"
    and "metadata"->>'original_transaction_id'=v_original;
  update public."paid_live_watch_party_passes" set
    "status"=case when v_event_type='REFUND' then 'refunded' when v_event_type='EXPIRATION' then 'expired' else 'revoked' end,
    "refunded_at"=case when v_event_type='REFUND' then v_occurred else "refunded_at" end,
    "revoked_at"=case when v_event_type<>'REFUND' then v_occurred else "revoked_at" end,
    "updated_at"=v_now
  where "provider_event_id"=v_link."provider_event_id" and "offer_id"=v_original_pass."offer_id" and "buyer_id"=p_user_id;
  select ledger.* into v_original_ledger from public."money_access_ledger_events" ledger
  where ledger."user_id"=p_user_id and ledger."source_id"=v_original_pass."offer_id"
    and ledger."metadata"->>'original_transaction_id'=v_original
    and ledger."event_type" in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE')
  order by ledger."created_at" limit 1 for update;
  insert into public."money_access_ledger_events"(
    "user_id","creator_id","product_id","provider_event_id","event_type","amount_minor","currency",
    "environment","payable_state","status","source_type","source_id","metadata"
  ) values (
    p_user_id,v_original_pass."creator_id",v_product."id",v_event."id",v_event_type,
    coalesce(v_original_ledger."amount_minor",v_intent."amount_minor"),
    coalesce(v_original_ledger."currency",v_intent."currency"),v_environment,
    case when v_event_type='REFUND' then 'refunded' when v_event_type='REVOCATION' then 'reversed' else 'not_payable' end,
    case when v_event_type='REFUND' then 'refunded' when v_event_type='REVOCATION' then 'reversed' else 'ignored' end,
    v_intent."source_type",v_original_pass."offer_id",jsonb_build_object(
      'purchase_intent_id',v_intent."id",'original_transaction_id',v_original,
      'party_id',v_original_pass."party_id",'pass_type',v_original_pass."pass_type",
      'reverses_provider_event_id',v_link."provider_event_id",'authority_granted',false,
      'immutable_terminal_evidence',true,'payout_readiness_proved',false
    )
  ) returning * into v_ledger;
  select exists(
    select 1 from public."paid_live_watch_party_passes" pass_row
    join public."paid_live_watch_party_offers" offer on offer."id"=pass_row."offer_id"
    join public."access_grants" grant_row on grant_row."id"=pass_row."access_grant_id"
    where pass_row."party_id"=v_original_pass."party_id" and pass_row."buyer_id"=p_user_id
      and pass_row."status"='active' and offer."status" in ('sandbox','active')
      and pass_row."pass_type"='live_watch_party_access_pass'
      and grant_row."status" in ('active','sandbox_only') and grant_row."revoked_at" is null
      and grant_row."refunded_at" is null
      and (grant_row."expires_at" is null or grant_row."expires_at">v_now)
  ) into v_remaining_access;
  select exists(
    select 1 from public."paid_live_watch_party_passes" pass_row
    join public."paid_live_watch_party_offers" offer on offer."id"=pass_row."offer_id"
    join public."access_grants" grant_row on grant_row."id"=pass_row."access_grant_id"
    where pass_row."party_id"=v_original_pass."party_id" and pass_row."buyer_id"=p_user_id
      and pass_row."status"='active' and offer."status" in ('sandbox','active')
      and pass_row."pass_type"='live_watch_party_seat_pass'
      and grant_row."status" in ('active','sandbox_only') and grant_row."revoked_at" is null
      and grant_row."refunded_at" is null
      and (grant_row."expires_at" is null or grant_row."expires_at">v_now)
  ) into v_remaining_seat;
  if not v_remaining_access and exists (select 1 from public."paid_live_watch_party_offers" offer
    where offer."party_id"=v_original_pass."party_id" and offer."pass_type"='live_watch_party_access_pass'
      and offer."status" in ('sandbox','active')) then
    update public."watch_party_room_memberships" set "role"='viewer',"stage_role"='listener',
      "can_speak"=false,"camera_enabled"=false,"mic_enabled"=false,"membership_state"='removed',
      "left_at"=coalesce("left_at",v_now),"updated_at"=v_now
    where "party_id"=v_original_pass."party_id" and "user_id"=p_user_id::text
      and "membership_state" in ('active','reconnecting');
  elsif not v_remaining_seat and exists (select 1 from public."paid_live_watch_party_offers" offer
    where offer."party_id"=v_original_pass."party_id" and offer."pass_type"='live_watch_party_seat_pass'
      and offer."status" in ('sandbox','active')) then
    update public."watch_party_room_memberships" set "role"='viewer',"stage_role"='listener',
      "can_speak"=false,"camera_enabled"=false,"mic_enabled"=false,"updated_at"=v_now
    where "party_id"=v_original_pass."party_id" and "user_id"=p_user_id::text
      and "membership_state" in ('active','reconnecting');
  end if;
  return jsonb_build_object('status',v_status,'reason','exact_live_watch_party_terminal_applied',
    'productKey',v_product."product_key",'productType',v_product."product_type",
    'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",'ledgerEventId',v_ledger."id",
    'grantStatus',case when v_event_type='REFUND' then 'refunded' else 'revoked' end,
    'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
end;
$$;

revoke all on function public.process_creator_money_provider_event_pre_source_lock(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.process_revenuecat_live_watch_party_event_atomic(text,text,text,uuid,text,text,timestamptz,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.process_revenuecat_live_watch_party_event_atomic(text,text,text,uuid,text,text,timestamptz,integer,text,text,text) to service_role;

create or replace function public."create_money_purchase_intent_pre_source_lock"(
  p_product_key text,
  p_source_type text,
  p_source_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb:=case
    when nullif(current_setting('request.headers',true),'') is null then '{}'::jsonb
    else current_setting('request.headers',true)::jsonb end;
  v_client_platform text:=lower(pg_catalog.btrim(coalesce(
    v_headers->>'x-chillywood-platform',''
  )));
  v_product public."monetization_products"%rowtype;
  v_catalog_digits text;
  v_catalog_amount integer;
  v_precharge jsonb;
  v_existing public."money_purchase_intents"%rowtype;
  v_user uuid:=auth.uid();
  v_session jsonb:=public."wave1_session_authority_readback"();
begin
  if p_source_type<>'paid_content'
    or not exists(select 1 from public.monetization_products product where product.product_key=p_product_key and product.product_type='paid_content_access')
  then
    return public."create_money_purchase_intent_pre_protected_video_closeout"(
      p_product_key,p_source_type,p_source_id,p_metadata
    );
  end if;
  -- The generic router's iOS branch is guarded by the replacement above. Do
  -- not force an App Store tier through the Google product stored on the shared
  -- creator-authored offer.
  if v_client_platform='ios' then
    return public."create_money_purchase_intent_pre_protected_video_closeout"(
      p_product_key,p_source_type,p_source_id,p_metadata
    );
  end if;

  if v_user is null
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is distinct from
      nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'buyer_session_authority_required';
  end if;
  begin
    v_precharge:=public."creator_video_existing_purchase_identity_internal"(
      v_user,p_source_id
    );
  exception when others then
    v_precharge:=null;
  end;
  if v_precharge is not null then
    select intent.* into v_existing
    from public."money_purchase_intents" intent
    where intent."id"=(v_precharge->>'id')::uuid;
    if v_existing."id" is null or v_existing."status"<>'consumed' then
      raise exception 'existing_paid_video_identity_invalid';
    end if;
    return public."money_purchase_intent_safe_row"(v_existing)
      ||jsonb_build_object(
        'alreadyPurchased',true,'concept','paid_video',
        'providerProductId',v_existing."provider_product_id",
        'environment',v_existing."environment"
      );
  end if;

  select product.* into v_product
  from public."monetization_products" product
  where product."product_key"=p_product_key
  limit 1;
  if v_product."id" is null
    or v_product."product_type"<>'paid_content_access'
    or v_product."status"<>'sandbox'
    or v_product."environment"<>'sandbox'
    or not coalesce(v_product."is_android_digital",false)
    or v_product."provider"<>'revenuecat_google_play'
    or nullif(pg_catalog.btrim(coalesce(v_product."provider_product_id",'')),'') is null
    or coalesce((v_product."metadata"->>'sandbox_purchase_intents_enabled')::boolean,false) is not true
  then
    raise exception 'android_digital_product_not_authorized';
  end if;
  v_catalog_digits:=coalesce(
    nullif(v_product."metadata"->>'price_tier',''),
    substring(v_product."product_key" from '([0-9]+)$')
  );
  if coalesce(v_catalog_digits,'')!~'^[0-9]+$' then
    raise exception 'provider_catalog_price_missing';
  end if;
  v_catalog_amount:=v_catalog_digits::integer;
  if v_catalog_amount<=0 then raise exception 'provider_catalog_price_invalid'; end if;

  v_precharge:=public."creator_video_paid_precharge_authority_internal"(
    p_source_id,v_product."provider",v_product."product_key",
    v_product."provider_product_id",v_catalog_amount,'usd','sandbox'
  );
  if coalesce((v_precharge->>'alreadyPurchased')::boolean,false) then
    select intent.* into v_existing
    from public."money_purchase_intents" intent
    where intent."id"=(v_precharge->>'id')::uuid;
    if v_existing."id" is null or v_existing."status"<>'consumed' then
      raise exception 'existing_paid_video_identity_invalid';
    end if;
    return public."money_purchase_intent_safe_row"(v_existing)
      ||jsonb_build_object(
        'alreadyPurchased',true,'concept','paid_video',
        'providerProductId',v_existing."provider_product_id",
        'environment',v_existing."environment"
      );
  end if;
  return public."create_money_purchase_intent_pre_protected_video_closeout"(
    p_product_key,p_source_type,p_source_id,p_metadata
  );
end;
$$;
revoke all on function public.create_money_purchase_intent_pre_source_lock(text,text,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public."creator_money_provider_source_identity_internal"(
  p_provider_event_id text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_original_transaction_id text,
  p_provider text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_intent public."money_purchase_intents"%rowtype;
  v_count integer:=0;
  v_intent_id uuid;
  v_provider text:=lower(pg_catalog.btrim(coalesce(p_provider,'')));
  v_environment text:=lower(pg_catalog.btrim(coalesce(p_environment,'')));
  v_original text:=nullif(pg_catalog.btrim(
    coalesce(p_original_transaction_id,'')
  ),'');
begin
  if p_user_id is null
    or v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or v_environment not in ('sandbox','production')
  then return null; end if;

  select count(*)::integer,min(intent."id"::text)::uuid
  into v_count,v_intent_id
  from public."provider_events" event
  join public."money_purchase_intents" intent
    on intent."id"::text=event."metadata"->>'purchase_intent_id'
  where event."provider"=v_provider
    and event."provider_event_id"=p_provider_event_id
    and event."user_id"=p_user_id
    and intent."user_id"=p_user_id
    and intent."provider"=v_provider
    and intent."environment"=v_environment;
  if v_count>1 then return null; end if;

  if v_count=0 and v_original is not null then
    select count(*)::integer,min(intent."id"::text)::uuid
    into v_count,v_intent_id
    from public."revenuecat_consumable_transaction_intents" link
    join public."money_purchase_intents" intent
      on intent."id"=link."purchase_intent_id"
    where link."provider"=v_provider
      and link."original_transaction_id"=v_original
      and link."user_id"=p_user_id
      and link."binding_state"='exact'
      and intent."user_id"=p_user_id
      and intent."provider"=v_provider
      and intent."environment"=v_environment;
    if v_count>1 then return null; end if;
  end if;

  if v_count=0 then
    select count(*)::integer,min(intent."id"::text)::uuid
    into v_count,v_intent_id
    from public."money_purchase_intents" intent
    where intent."user_id"=p_user_id
      and intent."provider"=v_provider
      and intent."provider_product_id"=p_provider_product_id
      and intent."environment"=v_environment
      and intent."source_type" in (
        'creator_tip','watch_party_live','paid_content','event','vip_pass',
        'channel_subscription'
      )
      and intent."source_id" is not null
      and ((intent."source_type"<>'event' and intent."status"='pending'
        and intent."expires_at">timezone('utc'::text,now()))
        or public.creator_event_intent_receipt_matches_internal(intent,p_provider_event_id));
    if v_count<>1 then return null; end if;
  end if;

  select intent.* into v_intent
  from public."money_purchase_intents" intent
  where intent."id"=v_intent_id;
  if v_intent."id" is null
    or v_intent."user_id" is distinct from p_user_id
    or v_intent."source_type" not in (
      'creator_tip','watch_party_live','paid_content','event','vip_pass',
      'channel_subscription'
    )
    or v_intent."source_id" is null
  then return null; end if;
  return jsonb_build_object(
    'userId',v_intent."user_id",
    'sourceType',v_intent."source_type",
    'sourceId',v_intent."source_id",
    'purchaseIntentId',v_intent."id"
  );
end;
$$;

revoke all on function public.creator_money_provider_source_identity_internal(text,uuid,text,text,text,text) from public,anon,authenticated,service_role;

create function public.process_revenuecat_google_play_event_atomic(
  p_provider_event_id text,p_event_type text,p_user_id uuid,p_provider_product_id text,
  p_environment text,p_occurred_at timestamptz,p_expires_at timestamptz,
  p_amount_minor integer,p_currency text,p_raw_payload_hash text,
  p_original_transaction_id text,p_input_reason text,p_purchase_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if upper(trim(coalesce(p_event_type,''))) in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE') then
    perform public.record_creator_money_purchase_time_internal('revenuecat_google_play',p_provider_event_id,p_user_id,
      p_provider_product_id,p_environment,p_raw_payload_hash,p_purchase_occurred_at);
  end if;
  return public.process_revenuecat_google_play_event_atomic(p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,
    p_environment,p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,p_original_transaction_id,p_input_reason);
end;
$$;
revoke all on function public.process_revenuecat_google_play_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.process_revenuecat_google_play_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz) to service_role;

create function public.process_revenuecat_app_store_event_atomic(
  p_provider_event_id text,p_event_type text,p_user_id uuid,p_provider_product_id text,
  p_environment text,p_occurred_at timestamptz,p_expires_at timestamptz,
  p_amount_minor integer,p_currency text,p_raw_payload_hash text,
  p_original_transaction_id text,p_input_reason text,p_purchase_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if upper(trim(coalesce(p_event_type,''))) in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE') then
    perform public.record_creator_money_purchase_time_internal('revenuecat_app_store',p_provider_event_id,p_user_id,
      p_provider_product_id,p_environment,p_raw_payload_hash,p_purchase_occurred_at);
  end if;
  return public.process_revenuecat_app_store_event_atomic(p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,
    p_environment,p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,p_original_transaction_id,p_input_reason);
end;
$$;
revoke all on function public.process_revenuecat_app_store_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.process_revenuecat_app_store_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz) to service_role;
