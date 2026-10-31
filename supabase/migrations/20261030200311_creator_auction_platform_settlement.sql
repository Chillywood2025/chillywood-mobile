-- Source-only platform charge ownership. No qualification rows, provider
-- objects, credentials, charges, transfers or live switches are created here.
create table private.auction_platform_qualifications (
 id uuid primary key default gen_random_uuid(), capability_id uuid not null references private.creator_external_payment_capabilities(id),
 platform_account_id text not null check(platform_account_id ~ '^acct_[A-Za-z0-9]+$'),
 recipient_account_id text not null check(recipient_account_id ~ '^acct_[A-Za-z0-9]+$'),
 product_id uuid not null references public.monetization_products(id),
 platform_product_id text not null check(platform_product_id ~ '^prod_[A-Za-z0-9]+$'),
 evidence_reference text not null check(length(btrim(evidence_reference)) between 1 and 300),
 recipient_transfer_capability text not null check(recipient_transfer_capability='active'),
 environment text not null default 'test' check(environment='test'),
 enabled boolean not null default false, verified_at timestamptz not null,
 expires_at timestamptz not null check(expires_at>verified_at and expires_at<=verified_at+interval '15 minutes'),
 revoked_at timestamptz, check(platform_account_id<>recipient_account_id)
);
create table private.auction_platform_settlement_contracts (
 id uuid primary key default gen_random_uuid(), lane text not null check(lane in('event','room')),
 quote_id uuid not null, capability_id uuid not null references private.creator_external_payment_capabilities(id),
 purchase_intent_id uuid not null unique references public.money_purchase_intents(id),
 creator_id uuid not null, buyer_id uuid not null, amount_minor integer not null check(amount_minor>0),
 currency text not null check(currency='usd'), environment text not null check(environment='test'),
 platform_account_id text not null, recipient_account_id text not null, platform_product_id text not null,
 policy_version text not null default 'auction_platform_net_80_20_v1' check(policy_version='auction_platform_net_80_20_v1'),
 created_at timestamptz not null default clock_timestamp(), unique(lane,quote_id)
);
alter table private.auction_platform_qualifications enable row level security;
alter table private.auction_platform_qualifications force row level security;
alter table private.auction_platform_settlement_contracts enable row level security;
alter table private.auction_platform_settlement_contracts force row level security;
revoke all on private.auction_platform_qualifications,private.auction_platform_settlement_contracts from public,anon,authenticated,service_role;
create trigger auction_platform_qualification_immutable before update on private.auction_platform_qualifications
 for each row execute function private.guard_creator_external_payment_evidence();
create trigger auction_platform_contract_immutable before update or delete on private.auction_platform_settlement_contracts
 for each row execute function private.guard_event_ticket_terms_immutable();

-- The quote retains its original recipient identity. Actual charge identity is
-- explicit and versioned, never forged into a connected-account webhook.
create function private.auction_charge_account(p_lane text,p_quote_id uuid,p_legacy_account text)
returns text language sql stable security definer set search_path='' as $$
 select coalesce((select platform_account_id from private.auction_platform_settlement_contracts
   where lane=p_lane and quote_id=p_quote_id),p_legacy_account);
$$;
revoke all on function private.auction_charge_account(text,uuid,text) from public,anon,authenticated,service_role;

create function private.auction_contract_evidence_exact(p_lane text,p_quote_id uuid,p_evidence jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.auction_platform_settlement_contracts where lane=p_lane and quote_id=p_quote_id)
  or exists(select 1 from private.auction_platform_settlement_contracts c where c.lane=p_lane and c.quote_id=p_quote_id
   and c.id::text=p_evidence->>'settlementContractId' and c.policy_version=p_evidence->>'settlementPolicy');
$$;
revoke all on function private.auction_contract_evidence_exact(text,uuid,jsonb) from public,anon,authenticated,service_role;

create function private.auction_platform_claim(p_lane text,p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid,p_recover boolean)
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
 if q is null or q->>'environment'<>'test' or q->>'buyer_id' is distinct from p_buyer_id::text
  or q->>'session_id' is distinct from p_session_id::text then raise exception 'auction_platform_quote_invalid'; end if;
 select * into c from private.auction_platform_settlement_contracts where lane=p_lane and quote_id=p_quote_id;
 if q->>'checkout_started_at' is not null and c.id is null then
  raise exception 'legacy_auction_reconciliation_only';
 end if;
 -- Latest qualification only: revoked/expired latest never falls back. Renewal
 -- appends evidence; a claimed contract still forbids account/product changes.
 select * into v from private.auction_platform_qualifications where capability_id=(q->>'capability_id')::uuid
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
  or product.environment<>'sandbox' or product.status<>'sandbox'
  or exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on')
 then raise exception 'auction_platform_qualification_required'; end if;
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
 if result is null then return null; end if;
 if c.id is null then
  if result->>'startAuthorized' is distinct from 'true' then raise exception 'auction_platform_claim_unavailable'; end if;
  insert into private.auction_platform_settlement_contracts(lane,quote_id,capability_id,purchase_intent_id,creator_id,buyer_id,
   amount_minor,currency,environment,platform_account_id,recipient_account_id,platform_product_id)
  values(p_lane,p_quote_id,v.capability_id,(result->>'purchaseIntentId')::uuid,(q->>'creator_id')::uuid,p_buyer_id,
   (q->>'amount_minor')::integer,q->>'currency','test',v.platform_account_id,v.recipient_account_id,v.platform_product_id) returning * into c;
 end if;
 if row(c.platform_account_id,c.recipient_account_id,c.platform_product_id)
  is distinct from row(v.platform_account_id,v.recipient_account_id,v.platform_product_id)
 then raise exception 'auction_platform_contract_changed'; end if;
 return result||jsonb_build_object('providerAccountId',c.platform_account_id,'providerProductId',c.platform_product_id,
  'recipientAccountId',c.recipient_account_id,'settlementContractId',c.id,'settlementPolicy',c.policy_version,
  'chargePattern','platform_separate_transfer','financialAuthority',false);
end;
$$;
revoke all on function private.auction_platform_claim(text,uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;

do $migration$
declare lane text; action text; fname text;
begin
 foreach lane in array array['event','room'] loop
  foreach action in array array['prepare','recover'] loop
   fname:=action||'_creator_'||lane||'_auction_platform_checkout';
   execute format('create function public.%I(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
    returns jsonb language sql security definer set search_path='''' as $body$
    select private.auction_platform_claim(%L,p_quote_id,p_buyer_id,p_session_id,p_attempt_id,%L::boolean); $body$',fname,lane,action='recover');
   execute format('revoke all on function public.%I(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role',fname);
   execute format('grant execute on function public.%I(uuid,uuid,uuid,uuid) to service_role',fname);
  end loop;
  fname:='revalidate_creator_'||lane||'_auction_platform_checkout';
  execute format('create function public.%I(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
   returns boolean language sql security definer set search_path='''' as $body$
   select coalesce((private.auction_platform_claim(%L,p_quote_id,p_buyer_id,p_session_id,p_attempt_id,true)->>''recoveryAuthorized'')::boolean,false); $body$',fname,lane);
  execute format('revoke all on function public.%I(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role',fname);
  execute format('grant execute on function public.%I(uuid,uuid,uuid,uuid) to service_role',fname);
 end loop;
end; $migration$;

-- Exact charge-account checks remain for both historical direct receipts and
-- new platform receipts. Do not touch session, access, D1-D4 or amount rules.
do $migration$
declare lane text; sig text; definition text; original text; replacement text;
begin
 foreach lane in array array['event','room'] loop
  foreach sig in array array[
   'public.process_stripe_'||lane||'_auction_no_payment(jsonb,text)',
   'public.bind_creator_'||lane||'_auction_checkout(uuid,uuid,text,text,text,integer,text)',
   'public.process_stripe_'||lane||'_auction_receipt(jsonb,text)',
   case lane when 'event' then 'private.creator_event_auction_grant_identity(uuid,uuid,uuid)'
    else 'private.creator_room_seat_payment_verified(uuid)' end] loop
   original:=pg_get_functiondef(sig::regprocedure);
   replacement:=format('private.auction_charge_account(%L,q.id,q.provider_account_id)',lane);
   if position('q.provider_account_id' in original)=0 then raise exception 'auction_charge_identity_source_changed: %',sig; end if;
   definition:=replace(original,'q.provider_account_id',replacement);
   if sig='public.process_stripe_'||lane||'_auction_no_payment(jsonb,text)' then
    if position('if q.checkout_started_at is null' in definition)=0 then raise exception 'auction_no_payment_source_changed'; end if;
    definition:=replace(definition,'if q.checkout_started_at is null',
     format('if not private.auction_contract_evidence_exact(%L,q.id,p_evidence) or q.checkout_started_at is null',lane));
   end if;
   if sig='public.process_stripe_'||lane||'_auction_receipt(jsonb,text)' then
    if position('elsif outcome=''paid'' and (' in definition)=0 then raise exception 'auction_paid_source_changed'; end if;
    definition:=replace(definition,'elsif outcome=''paid'' and (',
     format('elsif outcome=''paid'' and (not private.auction_contract_evidence_exact(%L,q.id,p_evidence) or ',lane));
    if position(E'where provider_payment_intent_id=pi\n      and provider_account_id=account_id and environment=env' in definition)=0
    then raise exception 'auction_terminal_lookup_source_changed'; end if;
    definition:=replace(definition,E'where provider_payment_intent_id=pi\n      and provider_account_id=account_id and environment=env',
     format(E'where provider_payment_intent_id=pi\n      and private.auction_charge_account(%L,id,provider_account_id)=account_id and environment=env',lane));
   end if;
   execute definition;
  end loop;
 end loop;
end; $migration$;

create table private.auction_settlement_observations (
 id uuid primary key default gen_random_uuid(), contract_id uuid not null references private.auction_platform_settlement_contracts(id),
 observation_hash text not null, facts jsonb not null, created_at timestamptz not null default clock_timestamp(),
 unique(contract_id,observation_hash)
);
create table private.auction_held_net_allocations (
 id bigint generated always as identity primary key, observation_id uuid not null unique references private.auction_settlement_observations(id),
 contract_id uuid not null references private.auction_platform_settlement_contracts(id),
 net_minor bigint, platform_minor bigint, creator_minor bigint, recovery_obligation_minor bigint not null,
 hold_reasons text[] not null, financial_authority boolean not null default false check(not financial_authority),
 created_at timestamptz not null default clock_timestamp()
);
create table private.auction_transfer_plans (
 id uuid primary key default gen_random_uuid(), contract_id uuid not null unique references private.auction_platform_settlement_contracts(id),
 allocation_id bigint not null references private.auction_held_net_allocations(id), source_charge_id text not null,
 recipient_account_id text not null, currency text not null, amount_minor bigint not null check(amount_minor>0),
 idempotency_key text not null unique, state text not null default 'held' check(state='held'),
 financial_authority boolean not null default false check(not financial_authority),
 created_at timestamptz not null default clock_timestamp()
);
do $migration$
declare t text;
begin
 foreach t in array array['auction_settlement_observations','auction_held_net_allocations','auction_transfer_plans'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger auction_settlement_append_only before update or delete on private.%I
   for each row execute function private.guard_event_ticket_terms_immutable()',t);
 end loop;
end; $migration$;

-- Ingestion boundary for a trusted provider-GET adapter, not a client fee quote
-- or an operational attestation issuer. Unknown adjustments never become zero.
create function public.record_auction_platform_cost_observation(p_contract_id uuid,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts; i public.money_purchase_intents;
 prior jsonb; observation uuid; h text; key text; net bigint; platform_amount bigint; creator_amount bigint;
 refund jsonb; refund_sum bigint:=0; refund_balance_net bigint:=0;
 gross bigint; fee bigint; tax bigint; store_fee bigint; refund_net bigint; tax_reversal bigint; refunded bigint;
 holds text[]:=array['sandbox_not_payable','fulfillment_clearance_unqualified','adjustments_unqualified'];
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id for update;
 select * into strict i from public.money_purchase_intents where id=c.purchase_intent_id;
 if not coalesce(p_facts->>'account_id'=c.platform_account_id and p_facts->>'environment'='test'
  and p_facts->>'currency'=c.currency and p_facts->>'charge_id' ~ '^ch_[A-Za-z0-9]+$'
  and p_facts->>'payment_intent_id' ~ '^pi_[A-Za-z0-9]+$' and p_facts->>'balance_id' ~ '^txn_[A-Za-z0-9]+$'
  and p_facts->>'balance_status' in('pending','available') and jsonb_typeof(p_facts->'disputed')='boolean'
  and jsonb_typeof(p_facts->'refunds')='array'
  and p_facts->'financial_authority'='false'::jsonb,false) then raise exception 'auction_cost_identity_invalid'; end if;
 if c.lane='event' then
  if not exists(select 1 from private.creator_event_auction_receipts r where r.quote_id=c.quote_id
   and r.provider_account_id=c.platform_account_id and r.environment='test' and r.outcome='paid'
   and r.payment_intent_id=p_facts->>'payment_intent_id' and r.resolution='fulfilled') then raise exception 'auction_paid_receipt_required'; end if;
 else
  if not exists(select 1 from private.creator_room_auction_receipts r where r.quote_id=c.quote_id
   and r.provider_account_id=c.platform_account_id and r.environment='test' and r.outcome='paid'
   and r.payment_intent_id=p_facts->>'payment_intent_id' and r.resolution='fulfilled') then raise exception 'auction_paid_receipt_required'; end if;
 end if;
 foreach key in array array['gross_minor','provider_fee_minor','refunded_minor'] loop
  if jsonb_typeof(p_facts->key) is distinct from 'number' or p_facts->>key !~ '^[0-9]{1,10}$'
  then raise exception 'auction_cost_amount_invalid'; end if;
 end loop;
 foreach key in array array['tax_minor','store_fee_minor','refund_net_minor','tax_reversal_minor'] loop
  if not p_facts ? key or (p_facts->key<>'null'::jsonb and (jsonb_typeof(p_facts->key)<>'number' or p_facts->>key !~ '^-?[0-9]{1,10}$'))
  then raise exception 'auction_cost_component_invalid'; end if;
 end loop;
 gross:=(p_facts->>'gross_minor')::bigint; fee:=(p_facts->>'provider_fee_minor')::bigint;
 tax:=(p_facts->>'tax_minor')::bigint; store_fee:=(p_facts->>'store_fee_minor')::bigint;
 refund_net:=(p_facts->>'refund_net_minor')::bigint; tax_reversal:=(p_facts->>'tax_reversal_minor')::bigint;
 refunded:=(p_facts->>'refunded_minor')::bigint;
 if c.lane='event' then
  if refunded<coalesce((select max((r.evidence->>'refundedAmountMinor')::bigint) from private.creator_event_auction_receipts r
   where r.quote_id=c.quote_id and r.outcome='refunded'),0)
   or (p_facts->'disputed'<>'true'::jsonb and exists(select 1 from private.creator_event_auction_receipts r where r.quote_id=c.quote_id and r.outcome='disputed'))
  then raise exception 'auction_cost_behind_payment_evidence'; end if;
 else
  if refunded<coalesce((select max((r.evidence->>'refundedAmountMinor')::bigint) from private.creator_room_auction_receipts r
   where r.quote_id=c.quote_id and r.outcome='refunded'),0)
   or (p_facts->'disputed'<>'true'::jsonb and exists(select 1 from private.creator_room_auction_receipts r where r.quote_id=c.quote_id and r.outcome='disputed'))
  then raise exception 'auction_cost_behind_payment_evidence'; end if;
 end if;
 if jsonb_array_length(p_facts->'refunds')<>(select count(distinct x->>'id') from jsonb_array_elements(p_facts->'refunds') x)
  or jsonb_array_length(p_facts->'refunds')<>(select count(distinct x->>'balance_id') from jsonb_array_elements(p_facts->'refunds') x)
 then raise exception 'auction_refund_duplicate'; end if;
 for refund in select value from jsonb_array_elements(p_facts->'refunds') loop
  if not coalesce(refund->>'id' ~ '^re_[A-Za-z0-9]+$' and refund->>'balance_id' ~ '^txn_[A-Za-z0-9]+$'
   and refund->>'balance_id'<>p_facts->>'balance_id' and refund->>'status' in('pending','available')
   and jsonb_typeof(refund->'amount')='number' and refund->>'amount' ~ '^[0-9]{1,10}$'
   and jsonb_typeof(refund->'fee')='number' and refund->>'fee' ~ '^-?[0-9]{1,10}$'
   and jsonb_typeof(refund->'net')='number' and refund->>'net' ~ '^-?[0-9]{1,10}$',false)
  then raise exception 'auction_refund_evidence_invalid'; end if;
  if (refund->>'amount')::bigint<=0 or (refund->>'net')::bigint<> -(refund->>'amount')::bigint-(refund->>'fee')::bigint
  then raise exception 'auction_refund_math_invalid'; end if;
  refund_sum:=refund_sum+(refund->>'amount')::bigint;
  refund_balance_net:=refund_balance_net+(refund->>'net')::bigint;
 end loop;
 if refund_sum<>refunded or refund_net is distinct from refund_balance_net then raise exception 'auction_refund_total_invalid'; end if;
 if gross<>c.amount_minor or refunded>gross or tax<0 or tax>gross or store_fee<0 or refund_net>0
  or tax_reversal<0 or tax_reversal>tax or (refunded=0 and (refund_net is distinct from 0 or tax_reversal is distinct from 0))
 then raise exception 'auction_cost_math_invalid'; end if;
 select o.facts into prior from private.auction_settlement_observations o where contract_id=c.id order by created_at desc,id desc limit 1;
 if prior is not null then
  if row(prior->>'charge_id',prior->>'payment_intent_id',prior->>'balance_id',prior->>'provider_fee_minor')
   is distinct from row(p_facts->>'charge_id',p_facts->>'payment_intent_id',p_facts->>'balance_id',p_facts->>'provider_fee_minor')
   or (prior->>'refunded_minor')::bigint>refunded
   or (prior->'disputed'='true'::jsonb and p_facts->'disputed'<>'true'::jsonb)
  then raise exception 'auction_cost_stale_or_changed'; end if;
  if exists(select 1 from jsonb_array_elements(prior->'refunds') old_refund where not exists(
   select 1 from jsonb_array_elements(p_facts->'refunds') new_refund where new_refund->>'id'=old_refund->>'id'
    and (new_refund-'status')=(old_refund-'status')))
  then raise exception 'auction_refund_identity_immutable'; end if;
 end if;
 foreach key in array array['tax_minor','store_fee_minor'] loop
  if exists(select 1 from private.auction_settlement_observations o where o.contract_id=c.id and o.facts->>key is not null
   and o.facts->key is distinct from p_facts->key) then raise exception 'auction_original_cost_immutable'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('auction-cost:'||c.platform_account_id||':'||(p_facts->>'charge_id'),0));
 if exists(select 1 from private.auction_settlement_observations o where o.contract_id<>c.id
  and o.facts->>'account_id'=c.platform_account_id and (o.facts->>'charge_id'=p_facts->>'charge_id'
   or o.facts->>'balance_id'=p_facts->>'balance_id')) then raise exception 'auction_cost_cross_contract'; end if;
 h:=encode(extensions.digest(p_facts::text,'sha256'),'hex');
 select id into observation from private.auction_settlement_observations where contract_id=c.id and observation_hash=h;
 if observation is not null then return jsonb_build_object('status','duplicate','observationId',observation,'financialAuthority',false); end if;
 if tax is null then holds:=array_append(holds,'tax_unverified'); end if;
 if store_fee is null then holds:=array_append(holds,'store_obligation_unverified'); end if;
 if refund_net is null or tax_reversal is null then holds:=array_append(holds,'refund_adjustment_unverified'); end if;
 if p_facts->>'balance_status'<>'available' or exists(select 1 from jsonb_array_elements(p_facts->'refunds') x where x->>'status'<>'available')
 then holds:=array_append(holds,'provider_balance_pending'); end if;
 if p_facts->'disputed'='true'::jsonb or i.status<>'consumed' then holds:=array_append(holds,'payment_or_dispute_reconciliation'); end if;
 if tax is not null and store_fee is not null and refund_net is not null and tax_reversal is not null
  and not('payment_or_dispute_reconciliation'=any(holds)) then
  net:=gross-fee-tax-store_fee+refund_net+tax_reversal;
  platform_amount:=greatest(net,0)*2000/10000; creator_amount:=greatest(net,0)-platform_amount;
 end if;
 insert into private.auction_settlement_observations(contract_id,observation_hash,facts) values(c.id,h,p_facts) returning id into observation;
 insert into private.auction_held_net_allocations(observation_id,contract_id,net_minor,platform_minor,creator_minor,recovery_obligation_minor,hold_reasons)
 values(observation,c.id,net,platform_amount,creator_amount,greatest(coalesce(-net,0),0),holds);
 return jsonb_build_object('status','held','netMinor',net,'platformMinor',platform_amount,'creatorMinor',creator_amount,
  'holdReasons',holds,'financialAuthority',false,'transferCreated',false);
end;
$$;
revoke all on function public.record_auction_platform_cost_observation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_auction_platform_cost_observation(uuid,jsonb) to service_role;

-- Durable, non-executing planning only. A future independently qualified
-- release worker must recheck the allocation, fulfillment/remedy/account holds
-- and reserve spend atomically. No API here can change state to dispatched.
create function public.prepare_auction_held_transfer_plan(p_contract_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts; a private.auction_held_net_allocations;
 plan private.auction_transfer_plans; facts jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id for update;
 if not exists(select 1 from public.money_purchase_intents where id=c.purchase_intent_id and status='consumed') then
  return jsonb_build_object('status','reconciliation_required','financialAuthority',false,'transferCreated',false);
 end if;
 select * into a from private.auction_held_net_allocations where contract_id=c.id order by id desc limit 1;
 select * into plan from private.auction_transfer_plans where contract_id=c.id;
 if plan.id is not null then
  return jsonb_build_object('status',case when plan.allocation_id=a.id then 'held' else 'reconciliation_required' end,
   'planId',plan.id,'financialAuthority',false,'transferCreated',false);
 end if;
 if a.id is null or a.creator_minor is null or a.creator_minor<=0 then
  return jsonb_build_object('status','unqualified','financialAuthority',false,'transferCreated',false);
 end if;
 select o.facts into facts from private.auction_settlement_observations o where id=a.observation_id;
 insert into private.auction_transfer_plans(contract_id,allocation_id,source_charge_id,recipient_account_id,currency,amount_minor,idempotency_key)
 values(c.id,a.id,facts->>'charge_id',c.recipient_account_id,c.currency,a.creator_minor,'auction-held-transfer-v1-'||c.id)
 returning * into plan;
 return jsonb_build_object('status','held','planId',plan.id,'holdReasons',a.hold_reasons,
  'financialAuthority',false,'transferCreated',false);
end;
$$;
revoke all on function public.prepare_auction_held_transfer_plan(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_auction_held_transfer_plan(uuid) to service_role;

create function public.get_auction_cost_reconciliation_context(p_contract_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts; q jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 if c.lane='event' then select to_jsonb(x) into q from private.creator_event_auction_quotes x where id=c.quote_id;
 else select to_jsonb(x) into q from private.creator_room_auction_quotes x where id=c.quote_id; end if;
 if q->>'provider_checkout_session_id' is null or q->>'provider_payment_intent_id' is null
 then raise exception 'auction_bound_provider_identity_required'; end if;
 return jsonb_build_object('id',c.id,'quote_id',c.quote_id,'lane',c.lane,'platform_product_id',c.platform_product_id,
  'buyer_id',c.buyer_id,'stripe_checkout_session_id',q->>'provider_checkout_session_id',
  'stripe_payment_intent_id',q->>'provider_payment_intent_id','stripe_charge_id',null,
  'amount_total_minor',c.amount_minor,'currency',c.currency,'environment',c.environment,'platform_account_id',c.platform_account_id);
end;
$$;
revoke all on function public.get_auction_cost_reconciliation_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_auction_cost_reconciliation_context(uuid) to service_role;
