-- Dormant mode-aware platform auction checkout. No activation or qualification
-- rows, credentials, provider requests, payment operations or transfers.
create function private.auction_checkout_mode_allowed(p_environment text) returns boolean
language sql stable security definer set search_path='' as $$
 select case p_environment
 when 'test' then coalesce((select state from public.platform_money_kill_switches where key='live_money_enabled'),'off')='off'
  and (select count(*) from public.platform_money_kill_switches where key in
   ('provider_webhooks_enabled','digital_sales_enabled','creator_monetization_enabled') and state in('sandbox_only','on'))=3
 when 'live' then (select count(*) from public.platform_money_kill_switches where key in
   ('live_money_enabled','provider_webhooks_enabled','digital_sales_enabled','creator_monetization_enabled','stripe_connect_enabled') and state='on')=5
 else false end;
$$;
revoke all on function private.auction_checkout_mode_allowed(text) from public,anon,authenticated,service_role;
create table private.auction_live_checkout_admissions (
 lane text not null check(lane in('event','room')),quote_id uuid not null,transaction_id bigint not null,
 primary key(lane,quote_id)
);
alter table private.auction_live_checkout_admissions enable row level security;
alter table private.auction_live_checkout_admissions force row level security;
revoke all on private.auction_live_checkout_admissions from public,anon,authenticated,service_role;

-- Read-only exact quote mode before consuming the one-shot checkout claim.
-- Missing server credentials must never strand a claimed award without a POST.
create function public.get_auction_checkout_provider_context(p_lane text,p_quote_id uuid,p_buyer_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; v private.auction_platform_qualifications; c private.auction_platform_settlement_contracts; capability jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_lane='event' then select to_jsonb(x) into q from private.creator_event_auction_quotes x where id=p_quote_id;
 elsif p_lane='room' then select to_jsonb(x) into q from private.creator_room_auction_quotes x where id=p_quote_id;
 else raise exception 'auction_lane_invalid'; end if;
 if q is null or q->>'buyer_id' is distinct from p_buyer_id::text or q->>'session_id' is distinct from p_session_id::text
  or q->>'superseded_at' is not null or (q->>'expires_at')::timestamptz<=clock_timestamp()
  or not private.auction_checkout_mode_allowed(q->>'environment')
  or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 then return null; end if;
 select * into v from private.auction_platform_qualifications where capability_id=(q->>'capability_id')::uuid
  and environment=q->>'environment' order by verified_at desc,id desc limit 1;
 select * into c from private.auction_platform_settlement_contracts where lane=p_lane and quote_id=p_quote_id;
 if v.id is null or not v.enabled or v.revoked_at is not null or v.verified_at>clock_timestamp() or v.expires_at<=clock_timestamp()
  or (c.id is not null and (row(c.platform_account_id,c.recipient_account_id,c.platform_product_id,c.environment)
   is distinct from row(v.platform_account_id,v.recipient_account_id,v.platform_product_id,v.environment))) then return null; end if;
 if not exists(select 1 from public.monetization_products p where p.id=v.product_id
  and p.provider='stripe_'||p_lane||'_auction' and p.provider_product_id=v.platform_product_id
  and p.product_type=case p_lane when 'event' then 'event_pass' else 'room_seat_pass' end
  and p.environment=case q->>'environment' when 'test' then 'sandbox' else 'production' end
  and p.status=case q->>'environment' when 'test' then 'sandbox' else 'active' end
  and not p.is_physical_good and not p.is_android_digital) then return null; end if;
 if p_lane='event' then
  if not exists(select 1 from private.creator_event_auction_product_bindings b where b.capability_id=v.capability_id
   and b.product_id=v.product_id) then return null; end if;
 else
  if not exists(select 1 from private.creator_room_auction_product_bindings b where b.capability_id=v.capability_id
   and b.product_id=v.product_id) then return null; end if;
 end if;
 capability:=private.resolve_creator_external_payment_capability(p_buyer_id,p_session_id,case p_lane when 'event' then 'event_auction' else 'room_seat_auction' end,
  (q->>'creator_id')::uuid,(q->>'amount_minor')::integer,q->>'currency',q->>'environment',(q->>'capability_id')::uuid);
 if capability->>'providerAccountId' is distinct from v.recipient_account_id then return null; end if;
 if p_lane='event' then
  if not exists(select 1 from private.creator_event_auctions a where a.id=(q->>'auction_id')::uuid
   and private.creator_event_auction_source_valid(a)) then return null; end if;
 else
  if not exists(select 1 from private.creator_room_seat_auctions a where a.id=(q->>'auction_id')::uuid
   and private.creator_room_seat_auction_source_valid(a)) then return null; end if;
 end if;
 return jsonb_build_object('environment',q->>'environment','platformAccountId',v.platform_account_id);
end; $$;
revoke all on function public.get_auction_checkout_provider_context(text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_auction_checkout_provider_context(text,uuid,uuid,uuid) to service_role;


create or replace function public.prepare_creator_event_auction_checkout(
  p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q private.creator_event_auction_quotes; a private.creator_event_auctions;
  p public.monetization_products; result jsonb; intent_id uuid:=gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select * into q from private.creator_event_auction_quotes where id=p_quote_id;
  if q.id is null or q.superseded_at is not null or q.buyer_id is distinct from p_buyer_id or q.session_id is distinct from p_session_id
  then raise exception 'auction_quote_not_found'; end if;
  -- Mode-specific controls supplement all existing shared intent guards.
  if q.environment='live' and not exists(select 1 from private.auction_live_checkout_admissions
   where lane='event' and quote_id=q.id and transaction_id=txid_current())
  then raise exception 'auction_live_platform_admission_required'; end if;
  if not private.auction_checkout_mode_allowed(q.environment) then raise exception 'auction_live_activation_not_authorized'; end if;
  if (select count(*) from public.platform_money_kill_switches where key in
      ('provider_webhooks_enabled','digital_sales_enabled','creator_monetization_enabled') and state in('sandbox_only','on'))<>3
  then raise exception 'auction_money_controls_unavailable'; end if;
  if q.expires_at<clock_timestamp()+interval '31 minutes' and q.checkout_attempt_id is null
  then raise exception 'auction_provider_checkout_window_too_short'; end if;
  if q.expires_at>clock_timestamp()+interval '24 hours' and q.checkout_attempt_id is null
  then raise exception 'auction_provider_checkout_window_too_long'; end if;
  select product.* into p from private.creator_event_auction_product_bindings b
    join public.monetization_products product on product.id=b.product_id
    where b.capability_id=q.capability_id and product.provider='stripe_event_auction'
      and product.product_type='event_pass' and product.environment=case q.environment when 'test' then 'sandbox' else 'production' end and product.status=case q.environment when 'test' then 'sandbox' else 'active' end
      and not product.is_android_digital and not product.is_physical_good
      and product.provider_product_id ~ '^prod_[A-Za-z0-9]+$';
  if p.id is null then raise exception 'auction_qualified_product_required'; end if;
  result:=public.claim_creator_event_auction_checkout(p_quote_id,p_buyer_id,p_session_id,p_attempt_id);
  if result->>'startAuthorized' is distinct from 'true' then return result; end if;
  select * into q from private.creator_event_auction_quotes where id=p_quote_id for update;
  select * into a from private.creator_event_auctions where id=q.auction_id for update;
  insert into private.creator_event_auction_transfers(quote_id,intent_id,transaction_id)
    values(q.id,intent_id,txid_current());
  insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,
    source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,
    session_generation,event_terms_revision_id,checkout_attempt_id,checkout_started_at)
  values(intent_id,q.buyer_id,p.id,p.product_key,'event_pass','stripe_event_auction',p.provider_product_id,
    'event',a.event_id,q.creator_id,case q.environment when 'test' then 'sandbox' else 'production' end,'pending',q.amount_minor,q.currency,'event-auction:'||q.id,q.expires_at,
    q.session_id::text,a.revision_id,q.checkout_attempt_id,q.checkout_started_at);
  update public.event_ticket_reservations set checkout_attempt_id=q.checkout_attempt_id,checkout_started_at=q.checkout_started_at
    where purchase_intent_id=intent_id;
  delete from private.creator_event_auction_transfers where quote_id=q.id and transaction_id=txid_current();
  return result||jsonb_build_object('purchaseIntentId',intent_id,'provider','stripe_event_auction',
    'providerProductId',p.provider_product_id);
end; $$;

create or replace function public.revalidate_creator_event_auction_checkout(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare q private.creator_event_auction_quotes; a private.creator_event_auctions; c jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select * into q from private.creator_event_auction_quotes where id=p_quote_id;
  select * into a from private.creator_event_auctions where id=q.auction_id;
  if q.id is null or q.superseded_at is not null or q.buyer_id is distinct from p_buyer_id or q.session_id is distinct from p_session_id
    or q.checkout_attempt_id is distinct from p_attempt_id or not private.auction_checkout_mode_allowed(q.environment)
    or q.provider_checkout_session_id is null or q.expires_at<=clock_timestamp()
    or a.state<>'payment_pending' or not private.creator_event_auction_source_valid(a)
  then return false; end if;
  if (select count(*) from public.platform_money_kill_switches where key in
      ('provider_webhooks_enabled','digital_sales_enabled','creator_monetization_enabled') and state in('sandbox_only','on'))<>3
  then return false; end if;
  if not exists(select 1 from private.creator_event_auction_product_bindings b
    join public.monetization_products p on p.id=b.product_id
    where b.capability_id=q.capability_id and p.status=case q.environment when 'test' then 'sandbox' else 'active' end and p.environment=case q.environment when 'test' then 'sandbox' else 'production' end
      and p.provider='stripe_event_auction' and p.product_type='event_pass')
  then return false; end if;
  c:=private.resolve_creator_external_payment_capability(p_buyer_id,p_session_id,'event_auction',q.creator_id,
    q.amount_minor,q.currency,q.environment,q.capability_id);
  return c->>'providerAccountId'=q.provider_account_id;
end; $$;

create or replace function public.recover_creator_event_auction_checkout(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q private.creator_event_auction_quotes;a private.creator_event_auctions;i public.money_purchase_intents;c jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if public.revalidate_creator_event_auction_checkout(p_quote_id,p_buyer_id,p_session_id,p_attempt_id) is distinct from true
  then return null; end if;
  select * into q from private.creator_event_auction_quotes where id=p_quote_id;
  select * into a from private.creator_event_auctions where id=q.auction_id;
  select * into i from public.money_purchase_intents where id=q.purchase_intent_id;
  if not coalesce(private.creator_event_auction_intent_exact(i),false) or i.status<>'pending'
    or q.provider_checkout_session_id!~('^cs_'||q.environment||'_[A-Za-z0-9]+$') then return null; end if;
  c:=private.resolve_creator_external_payment_capability(p_buyer_id,p_session_id,'event_auction',q.creator_id,
    q.amount_minor,q.currency,q.environment,q.capability_id);
  return jsonb_build_object('startAuthorized',false,'recoveryAuthorized',true,'quoteId',q.id,'auctionId',a.id,
    'buyerId',q.buyer_id,'creatorId',q.creator_id,'amountMinor',q.amount_minor,'currency',q.currency,
    'providerAccountId',q.provider_account_id,'environment',q.environment,'expiresAt',q.expires_at,
    'checkoutAttemptId',q.checkout_attempt_id,'providerCheckoutSessionId',q.provider_checkout_session_id,
    'providerProductId',i.provider_product_id,'purchaseIntentId',i.id,
    'routeKind',c->>'routeKind','platform',c->>'platform','storefrontCountry',c->>'storefrontCountry');
end; $$;

create or replace function public.prepare_creator_room_auction_checkout(
  p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q private.creator_room_auction_quotes; a private.creator_room_seat_auctions;
  p public.monetization_products; result jsonb; intent_id uuid:=gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select * into q from private.creator_room_auction_quotes where id=p_quote_id;
  if q.id is null or q.superseded_at is not null or q.buyer_id is distinct from p_buyer_id or q.session_id is distinct from p_session_id
  then raise exception 'auction_quote_not_found'; end if;
  -- Mode-specific controls supplement all existing shared intent guards.
  if q.environment='live' and not exists(select 1 from private.auction_live_checkout_admissions
   where lane='room' and quote_id=q.id and transaction_id=txid_current())
  then raise exception 'auction_live_platform_admission_required'; end if;
  if not private.auction_checkout_mode_allowed(q.environment) then raise exception 'auction_live_activation_not_authorized'; end if;
  if (select count(*) from public.platform_money_kill_switches where key in
      ('provider_webhooks_enabled','digital_sales_enabled','creator_monetization_enabled') and state in('sandbox_only','on'))<>3
  then raise exception 'auction_money_controls_unavailable'; end if;
  if q.expires_at<clock_timestamp()+interval '31 minutes' and q.checkout_attempt_id is null
  then raise exception 'auction_provider_checkout_window_too_short'; end if;
  if q.expires_at>clock_timestamp()+interval '24 hours' and q.checkout_attempt_id is null
  then raise exception 'auction_provider_checkout_window_too_long'; end if;
  select product.* into p from private.creator_room_auction_product_bindings b
    join public.monetization_products product on product.id=b.product_id
    where b.capability_id=q.capability_id and product.provider='stripe_room_auction'
      and product.product_type='room_seat_pass' and product.environment=case q.environment when 'test' then 'sandbox' else 'production' end and product.status=case q.environment when 'test' then 'sandbox' else 'active' end
      and not product.is_android_digital and not product.is_physical_good
      and product.provider_product_id ~ '^prod_[A-Za-z0-9]+$';
  if p.id is null then raise exception 'auction_qualified_product_required'; end if;
  result:=public.claim_creator_room_auction_checkout(p_quote_id,p_buyer_id,p_session_id,p_attempt_id);
  if result->>'startAuthorized' is distinct from 'true' then return result; end if;
  select * into q from private.creator_room_auction_quotes where id=p_quote_id for update;
  select * into a from private.creator_room_seat_auctions where id=q.auction_id for update;
  insert into private.creator_room_auction_transfers(quote_id,intent_id,transaction_id)
    values(q.id,intent_id,txid_current());
  insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,
    source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,
    session_generation,checkout_attempt_id,checkout_started_at)
  values(intent_id,q.buyer_id,p.id,p.product_key,'room_seat_pass','stripe_room_auction',p.provider_product_id,
    'room_seat_auction',a.id,q.creator_id,case q.environment when 'test' then 'sandbox' else 'production' end,'pending',q.amount_minor,q.currency,'room-auction:'||q.id,q.expires_at,
    q.session_id::text,q.checkout_attempt_id,q.checkout_started_at);
  delete from private.creator_room_auction_transfers where quote_id=q.id and transaction_id=txid_current();
  return result||jsonb_build_object('purchaseIntentId',intent_id,'provider','stripe_room_auction',
    'providerProductId',p.provider_product_id);
end; $$;

create or replace function public.revalidate_creator_room_auction_checkout(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare q private.creator_room_auction_quotes; a private.creator_room_seat_auctions; c jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select * into q from private.creator_room_auction_quotes where id=p_quote_id;
  select * into a from private.creator_room_seat_auctions where id=q.auction_id;
  if q.id is null or q.superseded_at is not null or q.buyer_id is distinct from p_buyer_id or q.session_id is distinct from p_session_id
    or q.checkout_attempt_id is distinct from p_attempt_id or not private.auction_checkout_mode_allowed(q.environment)
    or q.provider_checkout_session_id is null or q.expires_at<=clock_timestamp()
    or a.state<>'payment_pending' or not private.creator_room_seat_auction_source_valid(a)
  then return false; end if;
  if (select count(*) from public.platform_money_kill_switches where key in
      ('provider_webhooks_enabled','digital_sales_enabled','creator_monetization_enabled') and state in('sandbox_only','on'))<>3
  then return false; end if;
  if not exists(select 1 from private.creator_room_auction_product_bindings b
    join public.monetization_products p on p.id=b.product_id
    where b.capability_id=q.capability_id and p.status=case q.environment when 'test' then 'sandbox' else 'active' end and p.environment=case q.environment when 'test' then 'sandbox' else 'production' end
      and p.provider='stripe_room_auction' and p.product_type='room_seat_pass')
  then return false; end if;
  c:=private.resolve_creator_external_payment_capability(p_buyer_id,p_session_id,'room_seat_auction',q.creator_id,
    q.amount_minor,q.currency,q.environment,q.capability_id);
  return c->>'providerAccountId'=q.provider_account_id;
end; $$;

create or replace function public.recover_creator_room_auction_checkout(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q private.creator_room_auction_quotes;a private.creator_room_seat_auctions;i public.money_purchase_intents;c jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if public.revalidate_creator_room_auction_checkout(p_quote_id,p_buyer_id,p_session_id,p_attempt_id) is distinct from true
  then return null; end if;
  select * into q from private.creator_room_auction_quotes where id=p_quote_id;
  select * into a from private.creator_room_seat_auctions where id=q.auction_id;
  select * into i from public.money_purchase_intents where id=q.purchase_intent_id;
  if not coalesce(private.creator_room_auction_intent_exact(i),false) or i.status<>'pending'
    or q.provider_checkout_session_id!~('^cs_'||q.environment||'_[A-Za-z0-9]+$') then return null; end if;
  c:=private.resolve_creator_external_payment_capability(p_buyer_id,p_session_id,'room_seat_auction',q.creator_id,
    q.amount_minor,q.currency,q.environment,q.capability_id);
  return jsonb_build_object('startAuthorized',false,'recoveryAuthorized',true,'quoteId',q.id,'auctionId',a.id,
    'partyId',a.party_id,'roomSessionId',a.room_session_id,'claimId',a.claim_id,'sourceKind',a.source_kind,
    'buyerId',q.buyer_id,'creatorId',q.creator_id,'amountMinor',q.amount_minor,'currency',q.currency,
    'providerAccountId',q.provider_account_id,'environment',q.environment,'expiresAt',q.expires_at,
    'checkoutAttemptId',q.checkout_attempt_id,'providerCheckoutSessionId',q.provider_checkout_session_id,
    'providerProductId',i.provider_product_id,'purchaseIntentId',i.id,
    'routeKind',c->>'routeKind','platform',c->>'platform','storefrontCountry',c->>'storefrontCountry');
end; $$;

create or replace function private.auction_platform_claim(p_lane text,p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid,p_recover boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; c private.auction_platform_settlement_contracts; v private.auction_platform_qualifications;
 product public.monetization_products; result jsonb; capability private.creator_external_payment_capabilities;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_lane not in('event','room') then raise exception 'auction_lane_invalid'; end if;
 -- Serialize new version selection with any concurrent duplicate attempt.
 perform pg_advisory_xact_lock(hashtextextended('auction-platform:'||p_lane||':'||p_quote_id,0));
 if p_lane='event' then select to_jsonb(x) into q from private.creator_event_auction_quotes x where id=p_quote_id;
 else select to_jsonb(x) into q from private.creator_room_auction_quotes x where id=p_quote_id; end if;
 if q is null or not private.auction_checkout_mode_allowed(q->>'environment') or q->>'buyer_id' is distinct from p_buyer_id::text
  or q->>'session_id' is distinct from p_session_id::text then raise exception 'auction_platform_quote_invalid'; end if;
 select * into c from private.auction_platform_settlement_contracts where lane=p_lane and quote_id=p_quote_id;
 if q->>'checkout_started_at' is not null and c.id is null then
  raise exception 'legacy_auction_reconciliation_only';
 end if;
 -- Latest qualification only: revoked/expired latest never falls back. Renewal
 -- appends evidence; a claimed contract still forbids account/product changes.
 select * into v from private.auction_platform_qualifications where capability_id=(q->>'capability_id')::uuid and environment=q->>'environment'
  order by verified_at desc,id desc limit 1 for share;
 select * into capability from private.creator_external_payment_capabilities where id=v.capability_id;
 select * into product from public.monetization_products where id=v.product_id;
 if v.capability_id is null or not v.enabled or v.revoked_at is not null
  or v.verified_at>clock_timestamp() or v.expires_at<=clock_timestamp()
  or capability.provider_account_id is distinct from v.recipient_account_id
  or q->>'provider_account_id' is distinct from v.recipient_account_id
  or capability.creator_id::text is distinct from q->>'creator_id'
  or capability.feature is distinct from (case p_lane when 'event' then 'event_auction' else 'room_seat_auction' end)
  or product.provider_product_id is distinct from v.platform_product_id
  or product.provider is distinct from 'stripe_'||p_lane||'_auction'
  or product.environment is distinct from (case q->>'environment' when 'test' then 'sandbox' else 'production' end)
  or product.status is distinct from (case q->>'environment' when 'test' then 'sandbox' else 'active' end)
  or capability.environment is distinct from q->>'environment'
  or not private.auction_checkout_mode_allowed(q->>'environment')
 then raise exception 'auction_platform_qualification_required'; end if;
 if q->>'environment'='live' and not p_recover then
  insert into private.auction_live_checkout_admissions(lane,quote_id,transaction_id) values(p_lane,p_quote_id,txid_current());
 end if;
 if p_lane='event' then
  if not exists(select 1 from private.creator_event_auction_product_bindings where capability_id=v.capability_id and product_id=v.product_id)
  then raise exception 'auction_platform_product_required'; end if;
  if p_recover then result:=public.recover_creator_event_auction_checkout(p_quote_id,p_buyer_id,p_session_id,p_attempt_id);
  else result:=public.prepare_creator_event_auction_checkout(p_quote_id,p_buyer_id,p_session_id,p_attempt_id); end if;
 else
  if not exists(select 1 from private.creator_room_auction_product_bindings where capability_id=v.capability_id and product_id=v.product_id)
  then raise exception 'auction_platform_product_required'; end if;
  if p_recover then result:=public.recover_creator_room_auction_checkout(p_quote_id,p_buyer_id,p_session_id,p_attempt_id);
  else result:=public.prepare_creator_room_auction_checkout(p_quote_id,p_buyer_id,p_session_id,p_attempt_id); end if;
 end if;
 if q->>'environment'='live' and not p_recover then
  delete from private.auction_live_checkout_admissions where lane=p_lane and quote_id=p_quote_id and transaction_id=txid_current();
 end if;
 if result is null then return null; end if;
 if c.id is null then
  if result->>'startAuthorized' is distinct from 'true' then raise exception 'auction_platform_claim_unavailable'; end if;
  insert into private.auction_platform_settlement_contracts(lane,quote_id,capability_id,purchase_intent_id,creator_id,buyer_id,
   amount_minor,currency,environment,platform_account_id,recipient_account_id,platform_product_id)
  values(p_lane,p_quote_id,v.capability_id,(result->>'purchaseIntentId')::uuid,(q->>'creator_id')::uuid,p_buyer_id,
   (q->>'amount_minor')::integer,q->>'currency',q->>'environment',v.platform_account_id,v.recipient_account_id,v.platform_product_id) returning * into c;
 end if;
 if row(c.platform_account_id,c.recipient_account_id,c.platform_product_id)
  is distinct from row(v.platform_account_id,v.recipient_account_id,v.platform_product_id)
 then raise exception 'auction_platform_contract_changed'; end if;
 return result||jsonb_build_object('providerAccountId',c.platform_account_id,'providerProductId',c.platform_product_id,
  'recipientAccountId',c.recipient_account_id,'settlementContractId',c.id,'settlementPolicy',c.policy_version,
  'chargePattern','platform_separate_transfer','financialAuthority',false);
end;
$$;

-- Keep previously deployed native-route, provider identity and domain wrappers.
do $patch$ declare lane text; definition text; needle text; begin
 foreach lane in array array['event','room'] loop
  definition:=pg_get_functiondef(format('public.prepare_creator_%s_auction_platform_checkout(uuid,uuid,uuid,uuid)',lane)::regprocedure);
  needle:='result->>''providerAccountId'',''test'',''worldwide''';
  if position(needle in definition)=0 then raise exception 'auction_tax_mode_source_changed'; end if;
  execute replace(definition,needle,'result->>''providerAccountId'',result->>''environment'',''worldwide''');
  definition:=pg_get_functiondef(format('public.bind_creator_%s_auction_checkout(uuid,uuid,text,text,text,integer,text)',lane)::regprocedure);
  needle:='coalesce(p_session_id,'''')!~''^cs_[A-Za-z0-9_]+$''';
  if position(needle in definition)=0 then raise exception 'auction_bind_mode_source_changed'; end if;
  execute replace(definition,needle,'coalesce(p_session_id,'''')!~(''^cs_''||q.environment||''_[A-Za-z0-9]+$'')');
 end loop;
 definition:=pg_get_functiondef('private.resolve_creator_external_payment_capability(uuid,uuid,text,uuid,integer,text,text,uuid)'::regprocedure);
 needle:='if p_amount_minor is null';
 if position(needle in definition)=0 then raise exception 'auction_capability_mode_source_changed'; end if;
 execute replace(definition,needle,$gate$if p_feature in ('event_auction','room_seat_auction') and not private.auction_checkout_mode_allowed(p_environment)
  then raise exception 'auction_money_controls_unavailable'; end if;
  if p_amount_minor is null$gate$);
end; $patch$;


do $patch$ declare f record; definition text; original text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.proname like 'process_stripe_%_auction_%'
   and position('insert into public.money_access_ledger_events' in p.prosrc)>0 loop
  original:=pg_get_functiondef(f.oid);definition:=original;
  definition:=replace(definition,$old$case when v_reason is null then 'sandbox_only' else 'ignored' end$old$,
   $new$case when v_reason is null then case i.environment when 'production' then 'verified' else 'sandbox_only' end else 'ignored' end$new$);
  definition:=replace(definition,$old$i.environment,'sandbox_only',occurred,v_metadata$old$,
   $new$i.environment,case i.environment when 'production' then 'active' else 'sandbox_only' end,occurred,v_metadata$new$);
  if definition<>original then execute definition; end if;
 end loop;
end; $patch$;

create or replace function public.admit_ios_external_session(p_feature text,p_creator_id uuid,p_amount_minor integer,
  p_source_id uuid,p_country_code text,p_api_version integer,p_capability_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid:=auth.uid(); session uuid; cap private.creator_external_payment_capabilities;
  observation uuid:=gen_random_uuid(); eligibility uuid:=gen_random_uuid(); expiry timestamptz; source_environment text:='test';
begin
  if buyer is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  then raise exception 'ios_external_buyer_authority_required'; end if;
  session:=(auth.jwt()->>'session_id')::uuid;
  if p_api_version is distinct from 1 or p_country_code is distinct from 'USA'
    or p_source_id is null
    or p_amount_minor is null or p_amount_minor<=0 or p_creator_id is null or buyer=p_creator_id
    or p_feature is null or p_feature not in('creator_tip','event_auction','room_seat_auction')
    or not public.wave1_creator_money_subject_authorized_internal(p_creator_id)
  then raise exception 'ios_external_storefront_observation_required'; end if;
  if p_feature='event_auction' and not exists(select 1 from private.creator_event_auctions
    where id=p_source_id and creator_id=p_creator_id and state in('open','awarded','payment_pending'))
  then raise exception 'ios_external_source_invalid'; end if;
  if p_feature='room_seat_auction' and not exists(select 1 from private.creator_room_seat_auctions
    where id=p_source_id and creator_id=p_creator_id and state in('open','awarded','payment_pending'))
  then raise exception 'ios_external_source_invalid'; end if;
  if p_feature='event_auction' then select environment into source_environment from private.creator_event_auctions where id=p_source_id;
  elsif p_feature='room_seat_auction' then select environment into source_environment from private.creator_room_seat_auctions where id=p_source_id; end if;
  if p_feature in('event_auction','room_seat_auction') and not private.auction_checkout_mode_allowed(source_environment)
  then raise exception 'auction_money_controls_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ios-external-buyer:'||buyer||':'||session,0));
  if (select count(*) from private.ios_external_storefront_observations where buyer_id=buyer and session_id=session
    and created_at>clock_timestamp()-interval '1 minute')>=10
  then raise exception 'ios_external_observation_rate_limited'; end if;
  select * into cap from private.creator_external_payment_capabilities c
  where c.feature=p_feature and c.creator_id=p_creator_id and c.platform='ios'
    and (p_capability_id is null or c.id=p_capability_id)
    and c.storefront='apple_app_store' and c.storefront_country='US' and c.route_kind='external_browser_checkout'
    and c.currency='usd' and c.environment=source_environment and c.payment_method='card'
    and p_amount_minor between c.min_amount_minor and c.max_amount_minor
    and c.enabled and c.revoked_at is null and c.verified_at<=clock_timestamp()
    -- Admission also refreshes an already-bound checkout. The new-checkout
    -- path independently enforces Stripe's minimum creation lifetime.
    and c.expires_at>clock_timestamp()
  order by c.created_at desc,c.id limit 1 for share;
  if cap.id is null then raise exception 'ios_external_qualified_route_unavailable'; end if;
  expiry:=least(cap.expires_at,clock_timestamp()+interval '2 minutes');
  insert into private.creator_external_payment_eligibility(id,capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
    values(eligibility,cap.id,buyer,session,'native_storefront_observation_unverified:'||observation,clock_timestamp(),expiry);
  insert into private.ios_external_storefront_observations(id,eligibility_id,capability_id,buyer_id,session_id,
    creator_id,feature,source_id,amount_minor,storefront,country_code,expires_at)
  values(observation,eligibility,cap.id,buyer,session,p_creator_id,p_feature,p_source_id,p_amount_minor,'apple_app_store',p_country_code,expiry);
  -- Use the actual shared resolver: recipient readiness, current session and
  -- current qualified route remain mandatory, not merely a storefront string.
  perform private.resolve_creator_external_payment_capability(buyer,session,p_feature,p_creator_id,p_amount_minor,'usd',source_environment,cap.id);
  return jsonb_build_object('admissionId',observation,'capabilityId',cap.id,'expiresAt',expiry,
    'verification','native_storefront_observation_unverified','financialAuthority',false,'accessGranted',false);
end; $$;

-- Existing scheduled-event configuration already accepts active, but its inner
-- setter was sandbox-only. Admit active ONLY for an actual qualified auction
-- product; never relabel a RevenueCat sandbox SKU as a production product.
alter table public.paid_creator_events drop constraint paid_creator_events_provider_check;
alter table public.paid_creator_events add constraint paid_creator_events_provider_check
 check(provider in('revenuecat_google_play','google_play','revenuecat','stripe_event_auction'));
do $patch$ declare definition text; old_selector text; begin
 definition:=pg_get_functiondef('public.set_paid_creator_event_offer_pre_integrity_closeout(uuid,text,integer,integer,text)'::regprocedure);
 if position($needle$if v_status not in ('draft', 'sandbox', 'paused', 'canceled', 'archived')$needle$ in definition)=0
 then raise exception 'event_offer_status_source_changed'; end if;
 definition:=replace(definition,$old$if v_status not in ('draft', 'sandbox', 'paused', 'canceled', 'archived')$old$,
  $new$if v_status not in ('draft', 'sandbox', 'active', 'paused', 'canceled', 'archived')$new$);
 definition:=replace(definition,$old$if v_provider_switch not in ('sandbox_only', 'on') then$old$,
  $new$if v_status<>'active' and v_provider_switch not in ('sandbox_only', 'on') then$new$);
 old_selector:=substring(definition from '  select \* into v_product[\s\S]+?  limit 1;');
 if old_selector is null or position('event_pass_sandbox_099' in old_selector)=0 then raise exception 'event_offer_product_source_changed'; end if;
 definition:=replace(definition,old_selector,$new$
  if v_status='active' then
    if not private.auction_checkout_mode_allowed('live') then raise exception 'auction_live_activation_not_authorized'; end if;
    -- Reject ambiguous product choices instead of binding an arbitrary rail.
    if (select count(distinct row(v.product_id,v.platform_account_id))
      from private.auction_platform_qualifications v
      join private.creator_external_payment_capabilities c on c.id=v.capability_id
      where c.creator_id=v_source_event.host_user_id and c.feature='event_auction' and c.environment='live'
       and c.enabled and c.revoked_at is null and c.verified_at<=clock_timestamp() and c.expires_at>clock_timestamp()
       and v.environment='live' and v.enabled and v.revoked_at is null and v.verified_at<=clock_timestamp() and v.expires_at>clock_timestamp()
       and v.id=(select latest.id from private.auction_platform_qualifications latest where latest.capability_id=c.id
         and latest.environment='live' order by latest.verified_at desc,latest.id desc limit 1))<>1
    then raise exception 'auction_qualified_product_required'; end if;
    select p.* into v_product from private.auction_platform_qualifications v
      join private.creator_external_payment_capabilities c on c.id=v.capability_id
      join private.creator_event_auction_product_bindings b on b.capability_id=c.id and b.product_id=v.product_id
      join public.monetization_products p on p.id=v.product_id
      where c.creator_id=v_source_event.host_user_id and c.feature='event_auction' and c.environment='live'
       and c.enabled and c.revoked_at is null and c.verified_at<=clock_timestamp() and c.expires_at>clock_timestamp()
       and v.environment='live' and v.enabled and v.revoked_at is null and v.verified_at<=clock_timestamp() and v.expires_at>clock_timestamp()
       and v.id=(select latest.id from private.auction_platform_qualifications latest where latest.capability_id=c.id
         and latest.environment='live' order by latest.verified_at desc,latest.id desc limit 1)
       and p.provider='stripe_event_auction' and p.environment='production' and p.status='active'
       and p.product_type='event_pass' and not p.is_physical_good and not p.is_android_digital
       and p.provider_product_id=v.platform_product_id limit 1;
  else
$new$||old_selector||E'\n  end if;');
 definition:=replace(definition,$old$"provider"='revenuecat_google_play',$old$,$new$"provider"=v_product.provider,$new$);
 definition:=replace(definition,$old$    'revenuecat_google_play',
    v_product."product_key",$old$,$new$    v_product.provider,
    v_product."product_key",$new$);
 definition:=replace(definition,$old$"updated_at"=timezone('utc'::text,now())$old$,
  $new$"metadata"=case when v_status='active' then "metadata"||jsonb_build_object('live_money_enabled_at_activation',true,'sandbox_only',false,'auction_only',true) else "metadata" end,
        "updated_at"=timezone('utc'::text,now())$new$);
 definition:=replace(definition,$old$'live_money_enabled_at_save', coalesce($old$,
  $new$'live_money_enabled_at_activation', v_status='active', 'auction_only', v_status='active',
      'live_money_enabled_at_save', coalesce($new$);
 definition:=replace(definition,$old$'sandbox_only', true$old$,$new$'sandbox_only', v_status<>'active'$new$);
 execute definition;
end; $patch$;

create function private.auction_creator_mode(p_feature text,p_creator uuid) returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if p_feature not in('event_auction','room_seat_auction') or p_creator is null then raise exception 'auction_creator_required'; end if;
 if private.auction_checkout_mode_allowed('test') then return 'test'; end if;
 if not private.auction_checkout_mode_allowed('live') or not exists(
  select 1 from private.creator_external_payment_capabilities c join private.auction_platform_qualifications v on v.capability_id=c.id
  join public.monetization_products p on p.id=v.product_id
  join public.creator_payout_accounts recipient on recipient.creator_user_id=c.creator_id::text
   and recipient.provider_account_id=c.provider_account_id and recipient.provider_environment='live'
  join public.creator_payout_eligibility_records eligibility on eligibility.payout_account_id=recipient.id
  where recipient.provider_configuration_status='match' and recipient.provider_configuration_account_id=recipient.provider_account_id
   and recipient.provider_configuration_observed_at>clock_timestamp()-interval '15 minutes'
   and recipient.provider_configuration_observed_at<=clock_timestamp()
   and eligibility.provider_ready and eligibility.kyc_ready and eligibility.payout_account_ready
   and c.creator_id=p_creator and c.feature=p_feature and c.environment='live'
   and c.enabled and c.revoked_at is null and c.verified_at<=clock_timestamp() and c.expires_at>clock_timestamp()
   and v.environment='live' and v.enabled and v.revoked_at is null and v.verified_at<=clock_timestamp() and v.expires_at>clock_timestamp()
   and v.id=(select latest.id from private.auction_platform_qualifications latest where latest.capability_id=c.id
    and latest.environment='live' order by latest.verified_at desc,latest.id desc limit 1)
   and p.environment='production' and p.status='active' and p.provider_product_id=v.platform_product_id
   and p.provider=case p_feature when 'event_auction' then 'stripe_event_auction' else 'stripe_room_auction' end)
 then raise exception 'auction_creator_mode_unavailable'; end if;
 return 'live';
end; $$;
revoke all on function private.auction_creator_mode(text,uuid) from public,anon,authenticated,service_role;
alter function public.prepare_creator_room_seat_auction(text) rename to prepare_creator_room_seat_auction_pre_explicit_mode;
revoke all on function public.prepare_creator_room_seat_auction_pre_explicit_mode(text) from public,anon,authenticated,service_role;
create function public.prepare_creator_room_seat_auction(p_party_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 result:=public.prepare_creator_room_seat_auction_pre_explicit_mode(p_party_id);
 return result||jsonb_build_object('environment',private.auction_creator_mode('room_seat_auction',auth.uid()));
end; $$;
revoke all on function public.prepare_creator_room_seat_auction(text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_creator_room_seat_auction(text) to authenticated;
do $patch$ declare f record; definition text; feature text; needle text; begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in('create_creator_event_auction','create_creator_room_seat_auction') and p.prokind='f' loop
  definition:=pg_get_functiondef(f.oid);
  feature:=case f.proname when 'create_creator_event_auction' then 'event_auction' else 'room_seat_auction' end;
  needle:='perform public.wave1_assert_current_creator_money_authority_internal();';
  if position(needle in definition)=0 then raise exception 'auction_creator_authority_source_changed'; end if;
  definition:=replace(definition,needle,needle||format(E'\n if p_environment is distinct from private.auction_creator_mode(%L,auth.uid()) then raise exception ''auction_creator_mode_changed''; end if;',feature));
  execute definition;
 end loop;
end; $patch$;

create function public.read_creator_auction_creation_mode(p_feature text) returns text
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.wave1_assert_current_creator_money_authority_internal();
 return private.auction_creator_mode(p_feature,auth.uid());
end; $$;
revoke all on function public.read_creator_auction_creation_mode(text) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_auction_creation_mode(text) to authenticated;
do $patch$ declare definition text; needle text; begin
 definition:=pg_get_functiondef('public.create_creator_event_auction(uuid,uuid,integer,integer,timestamptz,timestamptz,text)'::regprocedure);
 needle:='if o.id is null then raise exception ''auction_event_revision_required''; end if;';
 if position(needle in definition)=0 then raise exception 'auction_event_source_activation_changed'; end if;
 definition:=replace(definition,needle,needle||$new$
  if p_environment='live' and o.status='sandbox' then
   -- Explicit creator confirmation of a live auction promotes only this exact
   -- terms revision through the qualified active-product setter. No purchase,
   -- new terms revision, provider operation or access is created here.
   perform public.set_paid_creator_event_offer_pre_integrity_closeout(e.id,o.description,o.price_cents,o.capacity_limit,'active');
   select * into o from public.paid_creator_events where id=o.id;
   if o.current_terms_revision_id is distinct from p_expected_revision_id or o.provider<>'stripe_event_auction'
    or o.status<>'active' then raise exception 'auction_event_source_activation_mismatch'; end if;
  end if;
$new$);
 execute definition;
end; $patch$;

-- Keep every unrelated production purchase rail closed. Auction intents already
-- require their exact private award/transaction-bound transfer admission in the
-- installed insert guards; only these explicitly bound providers gain a dormant
-- production representation.
alter table public.money_purchase_intents drop constraint money_purchase_intents_sandbox_only_check;
alter table public.money_purchase_intents add constraint money_purchase_intents_sandbox_only_check
 check(environment<>'production' or (provider='stripe_event_auction' and product_type='event_pass' and source_type='event')
  or (provider='stripe_room_auction' and product_type='room_seat_pass' and source_type='room_seat_auction'));

do $patch$ declare definition text; needle text; begin
 definition:=pg_get_functiondef('public.bind_creator_source_catalog_price_internal()'::regprocedure);
 needle:='  v_type:=case tg_table_name';
 if position(needle in definition)=0 then raise exception 'event_catalog_binding_source_changed'; end if;
 definition:=replace(definition,needle,$new$
  if tg_table_name='paid_creator_events' then
   if new.provider='stripe_event_auction' then
    if private.auction_creator_mode('event_auction',new.creator_id)<>'live' or new.status<>'active'
     or not exists(select 1 from private.auction_platform_qualifications v
      join private.creator_external_payment_capabilities c on c.id=v.capability_id
      join public.monetization_products p on p.id=v.product_id
      join private.creator_event_auction_product_bindings b on b.capability_id=c.id and b.product_id=p.id
      where c.creator_id=new.creator_id and c.feature='event_auction' and c.environment='live'
       and c.enabled and c.revoked_at is null and c.verified_at<=clock_timestamp() and c.expires_at>clock_timestamp()
       and v.environment='live' and v.enabled and v.revoked_at is null and v.verified_at<=clock_timestamp() and v.expires_at>clock_timestamp()
       and v.id=(select latest.id from private.auction_platform_qualifications latest where latest.capability_id=c.id
        and latest.environment='live' order by latest.verified_at desc,latest.id desc limit 1)
       and p.provider='stripe_event_auction' and p.environment='production' and p.status='active'
       and p.product_type='event_pass' and p.product_key=new.provider_product_key
       and p.provider_product_id=new.provider_product_id and p.provider_product_id=v.platform_product_id)
    then raise exception 'auction_source_product_binding_required'; end if;
    return new;
   end if;
  end if;
  v_type:=case tg_table_name$new$);
 execute definition;
end; $patch$;
