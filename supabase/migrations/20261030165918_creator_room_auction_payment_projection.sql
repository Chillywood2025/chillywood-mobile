-- Dedicated room-session auction provenance. No product, capability, provider account,
-- checkout, charge, transfer or payout is activated by this source migration.
-- Existing IAP, physical-merch and pure-tip authority remains separate.
create table private.creator_room_auction_product_bindings(
  capability_id uuid primary key references private.creator_external_payment_capabilities(id) on delete restrict,
  product_id uuid not null references public.monetization_products(id) on delete restrict,
  qualification_evidence text not null check(length(btrim(qualification_evidence)) between 1 and 300),
  created_at timestamptz not null default clock_timestamp()
);
alter table private.creator_room_auction_product_bindings enable row level security;
alter table private.creator_room_auction_product_bindings force row level security;
revoke all on private.creator_room_auction_product_bindings from public,anon,authenticated,service_role;
-- Qualified provisioning/revocation requires a separately designed service RPC.
-- No API role receives direct private-table privileges.
create trigger room_auction_product_binding_immutable before update or delete on private.creator_room_auction_product_bindings
for each row execute function private.guard_event_ticket_terms_immutable();

create function private.guard_bound_room_auction_product_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.creator_room_auction_product_bindings b where b.product_id=old.id)
    and row(new.id,new.product_key,new.product_type,new.provider,new.provider_product_id,new.environment,
      new.is_physical_good,new.is_android_digital)
      is distinct from row(old.id,old.product_key,old.product_type,old.provider,old.provider_product_id,old.environment,
        old.is_physical_good,old.is_android_digital)
  then raise exception 'bound_auction_product_identity_immutable'; end if;
  return new;
end; $$;
revoke all on function private.guard_bound_room_auction_product_identity() from public,anon,authenticated,service_role;
create trigger guard_bound_room_auction_product_identity before update on public.monetization_products
for each row execute function private.guard_bound_room_auction_product_identity();

-- Extend only the named provider allowlists, preserving the installed predicates
-- (including iOS additions). Every new lane is room-auction-only, not a generic Stripe
-- digital-goods escape hatch. No rows are inserted into the product catalog.
do $migration$
declare t text; n text; old_predicate text; extra text;
begin
  for t,n,extra in values
    ('monetization_products','monetization_products_provider_check',
      $$provider='stripe_room_auction' and product_type='room_seat_pass' and not is_physical_good and not is_android_digital$$),
    ('money_purchase_intents','money_purchase_intents_provider_check',
      $$provider='stripe_room_auction' and product_type='room_seat_pass' and source_type='room_seat_auction'$$),
    ('provider_events','provider_events_provider_check',$$provider='stripe_room_auction'$$),
    ('monetization_products','monetization_products_type_check',$$product_type='room_seat_pass' and provider='stripe_room_auction'$$),
    ('money_purchase_intents','money_purchase_intents_product_type_check',$$product_type='room_seat_pass' and provider='stripe_room_auction' and source_type='room_seat_auction'$$),
    ('money_purchase_intents','money_purchase_intents_source_type_check',$$source_type='room_seat_auction' and provider='stripe_room_auction' and product_type='room_seat_pass'$$),
    ('access_grants','access_grants_type_check',$$grant_type='room_seat_pass' and provider='stripe_room_auction'$$)
  loop
    select pg_get_expr(conbin,conrelid) into strict old_predicate from pg_constraint
      where conrelid=('public.'||t)::regclass and conname=n;
    execute format('alter table public.%I drop constraint %I',t,n);
    execute format('alter table public.%I add constraint %I check ((%s) or ((%s) is true))',t,n,old_predicate,extra);
  end loop;
end; $migration$;

create table private.creator_room_auction_receipts(
  id uuid primary key default gen_random_uuid(),
  provider_account_id text not null,
  provider_event_id text not null,
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  evidence jsonb not null check(jsonb_typeof(evidence)='object'),
  quote_id uuid references private.creator_room_auction_quotes(id) on delete restrict,
  payment_intent_id text not null,
  environment text not null check(environment in('test','live')),
  outcome text not null check(outcome in('paid','refunded','disputed')),
  provider_record_id uuid references public.provider_events(id) on delete restrict,
  access_grant_id uuid references public.access_grants(id) on delete restrict,
  ledger_event_id uuid references public.money_access_ledger_events(id) on delete restrict,
  resolution text not null default 'reconciliation_required' check(resolution in('fulfilled','reconciliation_required','refunded','disputed')),
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(provider_account_id,environment,provider_event_id)
);
create index room_auction_receipts_payment on private.creator_room_auction_receipts(provider_account_id,environment,payment_intent_id,outcome);
alter table private.creator_room_auction_receipts enable row level security;
alter table private.creator_room_auction_receipts force row level security;
revoke all on private.creator_room_auction_receipts from public,anon,authenticated,service_role;
create trigger room_auction_receipts_immutable before update or delete on private.creator_room_auction_receipts
for each row execute function private.guard_event_ticket_terms_immutable();

create table private.creator_room_auction_no_payment_receipts(
  provider_account_id text not null,provider_event_id text not null,environment text not null,
  payload_hash text not null check(payload_hash~'^[0-9a-f]{64}$'),evidence jsonb not null,
  quote_id uuid not null references private.creator_room_auction_quotes(id),
  resolution text not null check(resolution in('canceled','reconciliation_required')),
  created_at timestamptz not null default clock_timestamp(),
  primary key(provider_account_id,environment,provider_event_id)
);
alter table private.creator_room_auction_no_payment_receipts enable row level security;
alter table private.creator_room_auction_no_payment_receipts force row level security;
revoke all on private.creator_room_auction_no_payment_receipts from public,anon,authenticated,service_role;
create trigger room_auction_no_payment_receipts_immutable before update or delete on private.creator_room_auction_no_payment_receipts
for each row execute function private.guard_event_ticket_terms_immutable();

create function public.process_stripe_room_auction_no_payment(p_evidence jsonb,p_payload_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q private.creator_room_auction_quotes;a private.creator_room_seat_auctions; i public.money_purchase_intents;
  previous private.creator_room_auction_no_payment_receipts; resolution text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if coalesce(p_payload_hash,'')!~'^[0-9a-f]{64}$'
    or coalesce(p_evidence->>'eventId','')!~'^evt_[A-Za-z0-9]+$'
    or coalesce(p_evidence->>'checkoutSessionId','')!~'^cs_[A-Za-z0-9_]+$'
    or coalesce(p_evidence->>'eventType','') not in('checkout.session.expired','checkout.session.async_payment_failed')
    or p_evidence->>'occurredAt' is null or not isfinite((p_evidence->>'occurredAt')::timestamptz)
  then raise exception 'auction_no_payment_evidence_invalid'; end if;
  select * into q from private.creator_room_auction_quotes where id=(p_evidence->>'quoteId')::uuid;
  select * into a from private.creator_room_seat_auctions where id=q.auction_id;
  if q.id is null then raise exception 'auction_quote_not_found'; end if;
  perform private.lock_creator_room_inventory(a.party_id);
  select * into q from private.creator_room_auction_quotes where id=q.id for update;
  if q.checkout_started_at is null or q.purchase_intent_id is null
    or q.buyer_id::text is distinct from p_evidence->>'buyerId' or q.creator_id::text is distinct from p_evidence->>'creatorId'
    or q.auction_id::text is distinct from p_evidence->>'auctionId'
    or q.provider_account_id is distinct from p_evidence->>'accountId' or q.environment is distinct from p_evidence->>'environment'
    or q.amount_minor is distinct from (p_evidence->>'amountMinor')::integer or q.currency is distinct from p_evidence->>'currency'
    or (q.provider_checkout_session_id is not null and q.provider_checkout_session_id<>p_evidence->>'checkoutSessionId')
    or (q.provider_payment_intent_id is not null and q.provider_payment_intent_id is distinct from p_evidence->>'paymentIntentId')
    or (p_evidence->>'occurredAt')::timestamptz<q.checkout_started_at-interval '5 minutes'
    or (p_evidence->>'occurredAt')::timestamptz>clock_timestamp()+interval '5 minutes'
  then raise exception 'auction_no_payment_identity_mismatch'; end if;
  select * into previous from private.creator_room_auction_no_payment_receipts
    where provider_account_id=q.provider_account_id and environment=q.environment and provider_event_id=p_evidence->>'eventId';
  if previous.provider_event_id is not null then
    if previous.evidence<>p_evidence or previous.payload_hash<>p_payload_hash then raise exception 'auction_provider_replay_mismatch'; end if;
    return jsonb_build_object('status',previous.resolution,'duplicate',true);
  end if;
  select * into i from public.money_purchase_intents where id=q.purchase_intent_id;
  resolution:=case when i.status='consumed' or exists(select 1 from private.creator_room_auction_receipts
    where quote_id=q.id and outcome='paid') then 'reconciliation_required' else 'canceled' end;
  if resolution='canceled' then
    update public.money_purchase_intents set status='cancelled' where id=i.id and status in('pending','expired');
    update private.creator_room_seat_claims set state='released',reason='provider_confirmed_no_payment',updated_at=clock_timestamp() where id=a.claim_id and paid_at is null;
    update private.creator_room_seat_auctions set state='canceled' where id=a.id;
  end if;
  insert into private.creator_room_auction_no_payment_receipts(provider_account_id,provider_event_id,environment,
    payload_hash,evidence,quote_id,resolution)
  values(q.provider_account_id,p_evidence->>'eventId',q.environment,p_payload_hash,p_evidence,q.id,resolution);
  return jsonb_build_object('status',resolution,'payoutCreated',false);
end; $$;
revoke all on function public.process_stripe_room_auction_no_payment(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.process_stripe_room_auction_no_payment(jsonb,text) to service_role;

create table private.creator_room_auction_transfers(
 quote_id uuid primary key references private.creator_room_auction_quotes(id),
 intent_id uuid not null unique,transaction_id bigint not null
);
alter table private.creator_room_auction_transfers enable row level security;
alter table private.creator_room_auction_transfers force row level security;
revoke all on private.creator_room_auction_transfers from public,anon,authenticated,service_role;

-- Historical qualification is immutable. Current capability revocation stops
-- new checkout but cannot erase already-paid history or suppress a refund.
create function private.creator_room_auction_intent_exact(i public.money_purchase_intents)
returns boolean language sql stable security definer set search_path='' as $$
  select i.provider='stripe_room_auction' and i.source_type='room_seat_auction' and i.product_type='room_seat_pass'
    and exists(select 1 from private.creator_room_auction_quotes q
      join private.creator_room_seat_auctions a on a.id=q.auction_id
      join private.creator_room_auction_product_bindings b on b.capability_id=q.capability_id
      join public.monetization_products p on p.id=b.product_id
      where (q.purchase_intent_id=i.id or exists(select 1 from private.creator_room_auction_transfers t
          where t.quote_id=q.id and t.intent_id=i.id and t.transaction_id=txid_current()))
        and q.superseded_at is null and q.buyer_id=i.user_id and q.creator_id=i.creator_id
        and q.session_id::text=i.session_generation and a.winner_id=q.buyer_id
        and a.creator_id=q.creator_id and a.award_amount_minor=q.amount_minor
        and q.amount_minor=i.amount_minor and q.currency=i.currency and a.currency=q.currency
        and a.id=i.source_id and i.event_terms_revision_id is null
        and b.product_id=i.product_id and p.product_key=i.product_key
        and p.provider='stripe_room_auction' and p.product_type='room_seat_pass'
        and p.provider_product_id=i.provider_product_id and not p.is_physical_good and not p.is_android_digital
        and i.environment=case q.environment when 'test' then 'sandbox' else 'production' end
        and p.environment=i.environment and a.environment=q.environment
        and q.checkout_attempt_id is not null and q.checkout_started_at is not null);
$$;
revoke all on function private.creator_room_auction_intent_exact(public.money_purchase_intents) from public,anon,authenticated,service_role;

create function private.capture_room_auction_purchase_quote()
returns trigger language plpgsql security definer set search_path='' as $$
declare q private.creator_room_auction_quotes;a private.creator_room_seat_auctions;terms jsonb;
begin
 if new.provider<>'stripe_room_auction' then return new; end if;
 if not coalesce(private.creator_room_auction_intent_exact(new),false) then raise exception 'auction_intent_identity_invalid'; end if;
 select quote.* into q from private.creator_room_auction_quotes quote join private.creator_room_auction_transfers t on t.quote_id=quote.id
   where t.intent_id=new.id and t.transaction_id=txid_current();
 select * into a from private.creator_room_seat_auctions where id=q.auction_id;
 if q.id is null then raise exception 'auction_intent_transfer_required'; end if;
 update private.creator_room_auction_quotes set purchase_intent_id=new.id where id=q.id;
 update private.creator_room_seat_claims set purchase_intent_id=new.id where id=a.claim_id;
 terms:=private.creator_room_seat_auction_safe_row(a)->'terms';
 terms:=terms||jsonb_build_object('destination',jsonb_build_object('type',case a.source_kind when 'stage_reserved_seat' then 'live_stage' else 'party_room' end,'id',a.party_id),
   'roomSessionId',a.room_session_id,'claimId',a.claim_id,'sourceKind',a.source_kind,'auctionId',a.id,'premiumIncluded',false);
 insert into public.creator_money_purchase_quotes values(new.id,new.user_id,new.creator_id,new.source_type,new.source_id,
  new.amount_minor,lower(new.currency),new.provider,new.provider_product_id,new.environment,
  case a.source_kind when 'stage_reserved_seat' then 'Reserved Live Stage guest spot' else 'Party Room admission' end,
  terms,new.created_at,new.expires_at);
 return new;
end; $$;
revoke all on function private.capture_room_auction_purchase_quote() from public,anon,authenticated,service_role;
create trigger capture_room_auction_purchase_quote after insert on public.money_purchase_intents
 for each row execute function private.capture_room_auction_purchase_quote();

create function public.prepare_creator_room_auction_checkout(
  p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q private.creator_room_auction_quotes; a private.creator_room_seat_auctions;
  p public.monetization_products; result jsonb; intent_id uuid:=gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select * into q from private.creator_room_auction_quotes where id=p_quote_id;
  if q.id is null or q.superseded_at is not null or q.buyer_id is distinct from p_buyer_id or q.session_id is distinct from p_session_id
  then raise exception 'auction_quote_not_found'; end if;
  -- Production money remains prohibited by the existing shared intent guard.
  if q.environment<>'test' then raise exception 'auction_live_activation_not_authorized'; end if;
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
      and product.product_type='room_seat_pass' and product.environment='sandbox' and product.status='sandbox'
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
    'room_seat_auction',a.id,q.creator_id,'sandbox','pending',q.amount_minor,q.currency,'room-auction:'||q.id,q.expires_at,
    q.session_id::text,q.checkout_attempt_id,q.checkout_started_at);
  delete from private.creator_room_auction_transfers where quote_id=q.id and transaction_id=txid_current();
  return result||jsonb_build_object('purchaseIntentId',intent_id,'provider','stripe_room_auction',
    'providerProductId',p.provider_product_id);
end; $$;
revoke all on function public.prepare_creator_room_auction_checkout(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_creator_room_auction_checkout(uuid,uuid,uuid,uuid) to service_role;

create function public.bind_creator_room_auction_checkout(p_quote_id uuid,p_attempt_id uuid,p_session_id text,
  p_payment_intent_id text,p_account_id text,p_amount_minor integer,p_currency text)
returns void language plpgsql security definer set search_path='' as $$
declare q private.creator_room_auction_quotes;a private.creator_room_seat_auctions;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select * into q from private.creator_room_auction_quotes where id=p_quote_id;
  select * into a from private.creator_room_seat_auctions where id=q.auction_id;
  if q.id is null or a.id is null then raise exception 'auction_checkout_response_mismatch'; end if;
  -- Match every inventory mutation: offer -> room -> auction -> quote. Quote
  -- updates can take auction locks through trigger/FK checks, so never start
  -- with the quote row while another transaction holds the room/auction.
  perform private.lock_creator_room_inventory(a.party_id);
  perform 1 from private.creator_room_seat_auctions where id=a.id for update;
  select * into q from private.creator_room_auction_quotes where id=p_quote_id for update;
  if q.id is null or q.superseded_at is not null or q.checkout_attempt_id is distinct from p_attempt_id or q.purchase_intent_id is null
    or q.provider_account_id is distinct from p_account_id or q.amount_minor is distinct from p_amount_minor
    or q.currency is distinct from p_currency or coalesce(p_session_id,'')!~'^cs_[A-Za-z0-9_]+$'
    or (p_payment_intent_id is not null and p_payment_intent_id!~'^pi_[A-Za-z0-9]+$')
    or (q.provider_checkout_session_id is not null and q.provider_checkout_session_id is distinct from p_session_id)
    or (q.provider_payment_intent_id is not null and p_payment_intent_id is not null
      and q.provider_payment_intent_id is distinct from p_payment_intent_id)
  then raise exception 'auction_checkout_response_mismatch'; end if;
  update private.creator_room_auction_quotes set provider_checkout_session_id=p_session_id,
    provider_payment_intent_id=coalesce(provider_payment_intent_id,p_payment_intent_id) where id=q.id;
end; $$;
revoke all on function public.bind_creator_room_auction_checkout(uuid,uuid,text,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.bind_creator_room_auction_checkout(uuid,uuid,text,text,text,integer,text) to service_role;

create function public.revalidate_creator_room_auction_checkout(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare q private.creator_room_auction_quotes; a private.creator_room_seat_auctions; c jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select * into q from private.creator_room_auction_quotes where id=p_quote_id;
  select * into a from private.creator_room_seat_auctions where id=q.auction_id;
  if q.id is null or q.superseded_at is not null or q.buyer_id is distinct from p_buyer_id or q.session_id is distinct from p_session_id
    or q.checkout_attempt_id is distinct from p_attempt_id or q.environment<>'test'
    or q.provider_checkout_session_id is null or q.expires_at<=clock_timestamp()
    or a.state<>'payment_pending' or not private.creator_room_seat_auction_source_valid(a)
  then return false; end if;
  if (select count(*) from public.platform_money_kill_switches where key in
      ('provider_webhooks_enabled','digital_sales_enabled','creator_monetization_enabled') and state in('sandbox_only','on'))<>3
  then return false; end if;
  if not exists(select 1 from private.creator_room_auction_product_bindings b
    join public.monetization_products p on p.id=b.product_id
    where b.capability_id=q.capability_id and p.status='sandbox' and p.environment='sandbox'
      and p.provider='stripe_room_auction' and p.product_type='room_seat_pass')
  then return false; end if;
  c:=private.resolve_creator_external_payment_capability(p_buyer_id,p_session_id,'room_seat_auction',q.creator_id,
    q.amount_minor,q.currency,q.environment,q.capability_id);
  return c->>'providerAccountId'=q.provider_account_id;
end; $$;
revoke all on function public.revalidate_creator_room_auction_checkout(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.revalidate_creator_room_auction_checkout(uuid,uuid,uuid,uuid) to service_role;

-- Recover only a durably bound session. A lost dispatch without a provider ID
-- remains reconciliation; this function never authorizes another POST.
create function public.recover_creator_room_auction_checkout(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
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
    or q.provider_checkout_session_id!~'^cs_test_[A-Za-z0-9]+$' then return null; end if;
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
revoke all on function public.recover_creator_room_auction_checkout(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.recover_creator_room_auction_checkout(uuid,uuid,uuid,uuid) to service_role;

create function public.process_stripe_room_auction_receipt(p_evidence jsonb,p_payload_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q private.creator_room_auction_quotes; a private.creator_room_seat_auctions; i public.money_purchase_intents;
  old_receipt private.creator_room_auction_receipts; prior private.creator_room_auction_receipts;
  event_id uuid:=gen_random_uuid(); ledger_id uuid; grant_id uuid; v_reason text; resolution text;
  outcome text:=p_evidence->>'outcome'; pi text:=p_evidence->>'paymentIntentId';
  account_id text:=p_evidence->>'accountId'; env text:=p_evidence->>'environment';
  external_id text:=p_evidence->>'eventId'; amount integer; occurred timestamptz; v_metadata jsonb;
  refund_delta integer; refunded_so_far integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if jsonb_typeof(p_evidence) is distinct from 'object' or coalesce(p_payload_hash,'')!~'^[0-9a-f]{64}$'
    or coalesce(external_id,'')!~'^evt_[A-Za-z0-9]+$' or coalesce(pi,'')!~'^pi_[A-Za-z0-9]+$'
    or coalesce(account_id,'')!~'^acct_[A-Za-z0-9]+$' or env is null or env not in('test','live')
    or outcome is null or outcome not in('paid','refunded','disputed')
    or coalesce(p_evidence->>'currency','')!~'^[a-z]{3}$'
    or jsonb_typeof(p_evidence->'amountMinor') is distinct from 'number'
    or coalesce(p_evidence->>'amountMinor','')!~'^[0-9]+$'
  then raise exception 'auction_provider_evidence_invalid'; end if;
  amount:=(p_evidence->>'amountMinor')::integer; occurred:=(p_evidence->>'occurredAt')::timestamptz;
  if amount<=0 or occurred is null or not isfinite(occurred) or occurred>clock_timestamp()+interval '5 minutes'
    or (outcome='paid' and coalesce(p_evidence->>'eventType','') not in('checkout.session.completed','checkout.session.async_payment_succeeded'))
    or (outcome='refunded' and (p_evidence->>'eventType' is distinct from 'charge.refunded'
      or p_evidence->>'refundedAmountMinor' is null
      or jsonb_typeof(p_evidence->'refundedAmountMinor') is distinct from 'number'
      or (p_evidence->>'refundedAmountMinor')::integer not between 1 and amount))
    or (outcome='disputed' and p_evidence->>'eventType' is distinct from 'charge.dispute.created')
  then raise exception 'auction_provider_evidence_invalid'; end if;
  -- One immutable signed delivery; one provider payment cannot bind two awards.
  perform pg_advisory_xact_lock(hashtextextended('room-auction-receipt:'||account_id||':'||env||':'||external_id,0));
  select * into old_receipt from private.creator_room_auction_receipts
    where provider_account_id=account_id and environment=env and provider_event_id=external_id;
  if old_receipt.id is not null then
    if old_receipt.payload_hash<>p_payload_hash or old_receipt.evidence<>p_evidence
    then raise exception 'auction_provider_replay_mismatch'; end if;
    return jsonb_build_object('status',old_receipt.resolution,'duplicate',true,'payoutCreated',false);
  end if;
  if outcome='paid' then
    select * into q from private.creator_room_auction_quotes where id=(p_evidence->>'quoteId')::uuid;
  else
    select * into q from private.creator_room_auction_quotes where provider_payment_intent_id=pi
      and provider_account_id=account_id and environment=env;
  end if;
  if q.id is not null then
    select * into a from private.creator_room_seat_auctions where id=q.auction_id;
    perform private.lock_creator_room_inventory(a.party_id);
    select * into a from private.creator_room_seat_auctions where id=q.auction_id for update;
    select * into q from private.creator_room_auction_quotes where id=q.id for update;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('room-auction-payment:'||account_id||':'||env||':'||pi,0));
  if q.id is null then v_reason:='unbound_provider_payment';
  elsif q.environment is distinct from env or q.provider_account_id is distinct from account_id
    or (outcome<>'disputed' and q.amount_minor is distinct from amount)
    or (outcome='disputed' and amount>q.amount_minor) or q.currency is distinct from p_evidence->>'currency'
    or q.checkout_started_at is null or q.purchase_intent_id is null
    or (q.provider_payment_intent_id is not null and q.provider_payment_intent_id<>pi)
  then v_reason:='provider_award_identity_mismatch';
  elsif outcome='paid' and (
    q.id::text is distinct from p_evidence->>'quoteId' or q.buyer_id::text is distinct from p_evidence->>'buyerId'
    or q.creator_id::text is distinct from p_evidence->>'creatorId' or q.auction_id::text is distinct from p_evidence->>'auctionId'
    or coalesce(p_evidence->>'checkoutSessionId','')!~'^cs_[A-Za-z0-9_]+$'
    or (q.provider_checkout_session_id is not null and q.provider_checkout_session_id<>p_evidence->>'checkoutSessionId')
    or occurred<q.checkout_started_at-interval '5 minutes')
  then v_reason:='provider_checkout_identity_mismatch';
  end if;
  if v_reason is null then
    select * into i from public.money_purchase_intents where id=q.purchase_intent_id for update;
    if not coalesce(private.creator_room_auction_intent_exact(i),false) then v_reason:='provider_intent_identity_mismatch'; end if;
    if outcome='paid' and i.provider_product_id is distinct from p_evidence->>'providerProductId'
    then v_reason:='provider_product_identity_mismatch'; end if;
  end if;
  if v_reason is null then
    if exists(select 1 from private.creator_room_auction_quotes other where other.id<>q.id
      and other.provider_payment_intent_id=pi) then v_reason:='provider_payment_already_bound';
    else
      update private.creator_room_auction_quotes set provider_payment_intent_id=pi,
        provider_checkout_session_id=coalesce(provider_checkout_session_id,p_evidence->>'checkoutSessionId') where id=q.id;
    end if;
  end if;
  if v_reason is not null then
    insert into private.creator_room_auction_receipts(provider_account_id,provider_event_id,payload_hash,evidence,
      quote_id,payment_intent_id,environment,outcome,reason)
    values(account_id,external_id,p_payload_hash,p_evidence,q.id,pi,env,outcome,v_reason);
    return jsonb_build_object('status','reconciliation_required','reason',v_reason,'payoutCreated',false);
  end if;
  select * into prior from private.creator_room_auction_receipts where provider_account_id=account_id
    and environment=env and payment_intent_id=pi and private.creator_room_auction_receipts.outcome='paid' and quote_id=q.id
    order by created_at,id limit 1;
  if outcome='paid' and prior.id is not null then
    -- A second event ID (completed + async success) is not a second sale.
    insert into private.creator_room_auction_receipts(provider_account_id,provider_event_id,payload_hash,evidence,
      quote_id,payment_intent_id,environment,outcome,provider_record_id,access_grant_id,ledger_event_id,resolution,reason)
    values(account_id,external_id,p_payload_hash,p_evidence,q.id,pi,env,outcome,prior.provider_record_id,
      prior.access_grant_id,prior.ledger_event_id,prior.resolution,'duplicate_payment_delivery');
    return jsonb_build_object('status',prior.resolution,'duplicate',true,'payoutCreated',false);
  end if;
  v_metadata:=jsonb_build_object('purchase_intent_id',i.id,'auction_quote_id',q.id,'auction_id',a.id,
    'provider_product_id',i.provider_product_id,'product_key',i.product_key,'original_transaction_id',pi,
    'reported_amount_minor',amount,'reported_currency',q.currency,'signature_verified',true,
    'provider_account_id',account_id,'payout_ready',false);
  if outcome='paid' then
    if exists(select 1 from private.creator_room_auction_receipts where provider_account_id=account_id
      and environment=env and payment_intent_id=pi and private.creator_room_auction_receipts.outcome in('refunded','disputed'))
    then v_reason:='terminal_payment_precedes_success';
    elsif (select count(*) from public.platform_money_kill_switches where key in
      ('provider_webhooks_enabled','digital_sales_enabled','creator_monetization_enabled') and state in('sandbox_only','on'))<>3
    then v_reason:='paid_money_controls_require_reconciliation';
    elsif not public.money_purchase_intent_session_authorized_internal(i.user_id,i.session_generation)
      or not public.wave1_creator_money_subject_authorized_internal(i.creator_id)
      or public.is_account_access_restricted(i.user_id::text)
      or exists(select 1 from public.channel_audience_blocks b where
        (b.channel_user_id=i.creator_id::text and b.blocked_user_id=i.user_id::text)
        or (b.channel_user_id=i.user_id::text and b.blocked_user_id=i.creator_id::text))
    then v_reason:='paid_subject_requires_reconciliation';
    else
      if not private.creator_room_session_current(a.room_session_id)
        or not private.creator_room_seat_subject_allowed(a.party_id,i.user_id)
      then v_reason:='paid_room_session_unavailable';
      elsif not exists(select 1 from private.creator_room_seat_claims c where c.id=a.claim_id and c.room_session_id=a.room_session_id
        and c.auction_id=a.id and c.buyer_id=i.user_id and c.purchase_intent_id=i.id and c.state='payment_pending')
      then v_reason:='paid_reserved_claim_unavailable'; end if;
    end if;
  end if;
  resolution:=case when outcome='paid' then case when v_reason is null then 'fulfilled' else 'reconciliation_required' end else outcome end;
  if outcome='refunded' then
    -- charge.refunded reports a cumulative amount, not a new refund delta.
    -- Payment lock serializes deliveries; older/out-of-order cumulative events
    -- preserve evidence but append zero additional refunded value.
    select coalesce(max((evidence->>'refundedAmountMinor')::integer),0) into refunded_so_far
      from private.creator_room_auction_receipts where provider_account_id=account_id and environment=env
        and payment_intent_id=pi and quote_id=q.id and private.creator_room_auction_receipts.outcome='refunded' and ledger_event_id is not null;
    refund_delta:=greatest(0,(p_evidence->>'refundedAmountMinor')::integer-refunded_so_far);
  end if;
  insert into public.provider_events(id,provider_event_id,provider,product_id,product_key,user_id,app_user_id,
    environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
  values(event_id,account_id||':'||external_id,'stripe_room_auction',i.product_id,i.product_key,i.user_id,i.user_id::text,
    i.environment,case outcome when 'paid' then 'NON_RENEWING_PURCHASE' when 'refunded' then 'REFUND' else 'REVOCATION' end,
    case outcome when 'paid' then case when v_reason is null then 'processed' else 'ignored' end
      when 'refunded' then 'refunded' else 'reversed' end,occurred,'room-auction:'||account_id||':'||external_id,p_payload_hash,v_metadata);
  insert into public.money_access_ledger_events(user_id,creator_id,product_id,provider_event_id,event_type,amount_minor,
    currency,environment,payable_state,status,source_type,source_id,metadata)
  values(i.user_id,i.creator_id,i.product_id,event_id,
    case outcome when 'paid' then 'NON_RENEWING_PURCHASE' when 'refunded' then 'REFUND' else 'REVOCATION' end,
    case when outcome='refunded' then refund_delta else amount end,i.currency,i.environment,
    case outcome when 'refunded' then 'refunded' when 'disputed' then 'chargeback' else 'not_payable' end,
    case outcome when 'paid' then case when v_reason is null then 'sandbox_only' else 'ignored' end
      when 'refunded' then 'refunded' else 'chargeback' end,'room_seat_auction',i.source_id,v_metadata) returning id into ledger_id;
  if resolution='fulfilled' then
    update public.money_purchase_intents set status='consumed',consumed_at=clock_timestamp() where id=i.id;
    insert into public.access_grants(user_id,grant_type,source_type,source_id,product_id,provider,provider_event_id,
      environment,status,starts_at,metadata)
    values(i.user_id,'room_seat_pass','provider_event',i.source_id,i.product_id,'stripe_room_auction',event_id,
      i.environment,'sandbox_only',occurred,v_metadata) returning id into grant_id;
    update private.creator_room_seat_claims set state='paid_reserved',access_grant_id=grant_id,paid_at=clock_timestamp(),reason=null,
      updated_at=clock_timestamp() where id=a.claim_id;
    update private.creator_room_seat_auctions set state='fulfilled' where id=a.id;
  elsif outcome='paid' then
    update private.creator_room_seat_claims set state='unfulfilled',paid_at=coalesce(paid_at,clock_timestamp()),refund_review_eligible=true,reason=v_reason,
      updated_at=clock_timestamp() where id=a.claim_id;
    update private.creator_room_seat_auctions set state='reconciliation_required' where id=a.id;
  else
    select g.id into grant_id from public.access_grants g where g.metadata->>'purchase_intent_id'=i.id::text
      and g.provider='stripe_room_auction' and g.user_id=i.user_id and g.source_id=i.source_id;
    update public.access_grants set status=case outcome when 'refunded' then 'refunded' else 'revoked' end,
      refunded_at=case when outcome='refunded' then occurred else refunded_at end,
      revoked_at=case when outcome='disputed' then occurred else revoked_at end,revoke_reason=outcome
      where id=grant_id;
    update public.money_purchase_intents set status='revoked',revoked_at=clock_timestamp() where id=i.id;
    update public.provider_events set status=case outcome when 'refunded' then 'refunded' else 'reversed' end
      where provider='stripe_room_auction' and metadata->>'purchase_intent_id'=i.id::text
        and event_type='NON_RENEWING_PURCHASE';
    update private.creator_room_seat_auctions set state='canceled' where id=a.id;
    update private.creator_room_seat_claims set state='released',reason=outcome,updated_at=clock_timestamp() where id=a.claim_id;
  end if;
  update public.provider_events set metadata=v_metadata||jsonb_build_object('access_grant_id',grant_id,'ledger_event_id',ledger_id)
    where id=event_id;
  insert into private.creator_room_auction_receipts(provider_account_id,provider_event_id,payload_hash,evidence,
    quote_id,payment_intent_id,environment,outcome,provider_record_id,access_grant_id,ledger_event_id,resolution,reason)
  values(account_id,external_id,p_payload_hash,p_evidence,q.id,pi,env,outcome,event_id,grant_id,ledger_id,resolution,
    coalesce(v_reason,case outcome when 'paid' then 'verified_award_fulfilled' else 'verified_provider_terminal' end));
  return jsonb_build_object('status',resolution,'accessGrantId',grant_id,'payoutCreated',false);
end; $$;
revoke all on function public.process_stripe_room_auction_receipt(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.process_stripe_room_auction_receipt(jsonb,text) to service_role;


-- A claim/status alone is never paid authority. Require exact immutable quote,
-- intent, signed receipt, provider row, ledger and scoped grant on every read.
create or replace function private.creator_room_seat_payment_verified(p_claim_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.creator_room_seat_claims c
 join private.creator_room_seat_auctions a on a.id=c.auction_id and a.claim_id=c.id
   and a.room_session_id=c.room_session_id and a.party_id=c.party_id and a.source_kind=c.source_kind
 join private.creator_room_auction_quotes q on q.auction_id=a.id and q.superseded_at is null
   and q.buyer_id=c.buyer_id and q.creator_id=a.creator_id and a.winner_id=q.buyer_id
 join public.money_purchase_intents i on i.id=q.purchase_intent_id and i.id=c.purchase_intent_id
   and private.creator_room_auction_intent_exact(i) and i.status='consumed'
 join private.creator_room_auction_receipts receipt on receipt.quote_id=q.id and receipt.outcome='paid'
   and receipt.resolution='fulfilled' and receipt.payment_intent_id=q.provider_payment_intent_id
   and receipt.provider_account_id=q.provider_account_id and receipt.environment=q.environment
 join public.provider_events e on e.id=receipt.provider_record_id and e.provider='stripe_room_auction'
   and e.user_id=i.user_id and e.product_id=i.product_id and e.product_key=i.product_key
   and e.environment=i.environment and e.status='processed' and e.raw_payload_hash=receipt.payload_hash
   and e.metadata->>'purchase_intent_id'=i.id::text and e.metadata->>'original_transaction_id'=q.provider_payment_intent_id
 join public.access_grants g on g.id=receipt.access_grant_id and g.id=c.access_grant_id and g.provider_event_id=e.id
   and g.provider='stripe_room_auction' and g.user_id=i.user_id and g.product_id=i.product_id
   and g.source_type='provider_event' and g.source_id=i.source_id and g.grant_type='room_seat_pass'
   and g.environment=i.environment and g.metadata->>'purchase_intent_id'=i.id::text
   and g.metadata->>'original_transaction_id'=q.provider_payment_intent_id
 join public.money_access_ledger_events l on l.id=receipt.ledger_event_id and l.provider_event_id=e.id
   and l.user_id=i.user_id and l.creator_id=i.creator_id and l.product_id=i.product_id
   and l.source_type='room_seat_auction' and l.source_id=i.source_id and l.amount_minor=i.amount_minor
   and l.currency=i.currency and l.environment=i.environment and l.event_type='NON_RENEWING_PURCHASE'
   and l.status in('sandbox_only','verified')
 where c.id=p_claim_id and c.paid_at is not null and c.state in('paid_reserved','available')
   and g.status in('sandbox_only','active') and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now())
   and g.refunded_at is null and g.revoked_at is null
   and not exists(select 1 from private.creator_room_auction_receipts terminal
     where terminal.provider_account_id=q.provider_account_id and terminal.environment=q.environment
       and terminal.payment_intent_id=q.provider_payment_intent_id and terminal.outcome in('refunded','disputed')));
$$;
revoke all on function private.creator_room_seat_payment_verified(uuid) from public,anon,authenticated,service_role;

create trigger enqueue_google_play_room_auction_receipt after insert on private.creator_room_auction_receipts
for each row execute function private.enqueue_google_play_auction_receipt('room_seat_auction');

-- Reuse owner-only, paginated Purchase Library economics/receipt lineage. Add a
-- typed source without treating a reserved room-session right as an event/pass.
do $patch$
declare body text; needle text;
begin
 body:=pg_get_functiondef('public.read_my_creator_purchases_pre_event_remedies(integer,timestamptz,uuid,text,uuid)'::regprocedure);
 needle:=$needle$'channel_subscription','vip_pass','live_watch_party_access','live_watch_party_seat'))$needle$;
 if position(needle in body)=0 then raise exception 'room_library_filter_source_changed'; end if;
 body:=replace(body,needle,$replacement$'channel_subscription','vip_pass','live_watch_party_access','live_watch_party_seat','room_seat_auction'))$replacement$);
 needle:=$needle$('live_watch_party_access','live_watch_party_access_pass'),('live_watch_party_seat','live_watch_party_seat_pass'))$needle$;
 if position(needle in body)=0 then raise exception 'room_library_candidates_source_changed'; end if;
 body:=replace(body,needle,$replacement$('live_watch_party_access','live_watch_party_access_pass'),('live_watch_party_seat','live_watch_party_seat_pass'),('room_seat_auction','room_seat_pass'))$replacement$);
 needle:=$needle$    v_item:=jsonb_build_object('id',r."id"$needle$;
 if position(needle in body)=0 then raise exception 'room_library_item_source_changed'; end if;
 body:=replace(body,needle,$replacement$    if v_source_type='room_seat_auction' then
      select c.party_id into v_party from private.creator_room_seat_claims c
        where c.purchase_intent_id=v_intent.id and c.buyer_id=v_user;
      v_terms:=v_terms||coalesce((select jsonb_build_object('roomSessionId',c.room_session_id,'claimId',c.id,
        'sourceKind',c.source_kind,'admissionIncluded',true,'sameAccountRejoin',true,'hostControlsMediaAndModeration',true,
        'endsWhenCreatorEndsRoom',true,'availabilityConfirmedAt',c.availability_confirmed_at,
        'mediaPublicationProven',false,'refundReviewEligible',c.refund_review_eligible,'automaticRefund',false,
        'fulfillmentReason',c.reason) from private.creator_room_seat_claims c where c.purchase_intent_id=v_intent.id and c.buyer_id=v_user),'{}'::jsonb);
      if v_status not in('refunded','disputed','revoked','canceled') then
        v_status:=coalesce((select case c.state when 'unfulfilled' then case when c.paid_at is not null then 'paid_unfulfilled' else 'reconciliation_required' end when 'ended' then 'completed'
          when 'available' then 'active' when 'paid_reserved' then 'active' else v_status end
          from private.creator_room_seat_claims c where c.purchase_intent_id=v_intent.id and c.buyer_id=v_user),v_status);
      end if;
      if v_party is not null then v_destination:=jsonb_build_object('kind',case v_terms->>'sourceKind'
        when 'stage_reserved_seat' then 'live_stage' else 'watch_party' end,'id',v_party); end if;
    end if;
    v_item:=jsonb_build_object('id',r."id"$replacement$);
 execute body;
end; $patch$;
