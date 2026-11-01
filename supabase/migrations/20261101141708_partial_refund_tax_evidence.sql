-- No provider writes, scheduler, registration or financial switch is activated.
-- Only the server GET adapters can submit this evidence. API clients cannot
-- certify a tax amount; original and every refund must be provider-bound.
create function private.refund_tax_evidence_valid(p_facts jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare e jsonb:=p_facts->'refund_tax_evidence'; r jsonb; matched jsonb;
  total_refund bigint:=0; total_tax bigint:=0; original_tax bigint; gross bigint; k text;
begin
 if jsonb_typeof(e) is distinct from 'object' or e->>'provenance' is distinct from 'stripe_tax_association_get_v1'
  or coalesce(e->>'association_id','') !~ '^taxa_[A-Za-z0-9_]+$'
  or coalesce(e->>'original_tax_transaction_id','') !~ '^tax_[A-Za-z0-9_]+$'
  or e->>'payment_intent_id' is distinct from p_facts->>'payment_intent_id'
  or e->>'currency' is distinct from p_facts->>'currency'
  or e->'gross_minor' is distinct from p_facts->'gross_minor'
  or e->'original_tax_minor' is distinct from p_facts->'tax_minor'
  or e->'refunded_minor' is distinct from p_facts->'refunded_minor'
  or e->'tax_reversal_minor' is distinct from p_facts->'tax_reversal_minor'
  or jsonb_typeof(e->'refunds') is distinct from 'array'
  or jsonb_typeof(p_facts->'refunds') is distinct from 'array'
 then return false; end if;
 foreach k in array array['gross_minor','original_tax_minor','refunded_minor','tax_reversal_minor'] loop
  if jsonb_typeof(e->k) is distinct from 'number' or e->>k !~ '^[0-9]{1,10}$' then return false; end if;
 end loop;
 gross:=(e->>'gross_minor')::bigint; original_tax:=(e->>'original_tax_minor')::bigint;
 if gross<=0 or original_tax>gross or jsonb_array_length(e->'refunds')=0
  or jsonb_array_length(e->'refunds')<>jsonb_array_length(p_facts->'refunds')
  or jsonb_array_length(e->'refunds')<>(select count(distinct value->>'refund_id') from jsonb_array_elements(e->'refunds'))
  or jsonb_array_length(e->'refunds')<>(select count(distinct value->>'tax_transaction_id') from jsonb_array_elements(e->'refunds'))
  or jsonb_array_length(p_facts->'refunds')<>(select count(distinct value->>'id') from jsonb_array_elements(p_facts->'refunds'))
 then return false; end if;
 for r in select value from jsonb_array_elements(e->'refunds') loop
  if coalesce(r->>'refund_id','') !~ '^re_[A-Za-z0-9_]+$'
   or coalesce(r->>'tax_transaction_id','') !~ '^tax_[A-Za-z0-9_]+$'
   or r->>'tax_transaction_id'=e->>'original_tax_transaction_id'
  then return false; end if;
  foreach k in array array['refund_minor','tax_reversal_minor'] loop
   if jsonb_typeof(r->k) is distinct from 'number' or r->>k !~ '^[0-9]{1,10}$' then return false; end if;
  end loop;
  select value into matched from jsonb_array_elements(p_facts->'refunds') where value->>'id'=r->>'refund_id';
  if matched is null or matched->'amount' is distinct from r->'refund_minor'
   or (r->>'refund_minor')::bigint<=0 or (r->>'tax_reversal_minor')::bigint>(r->>'refund_minor')::bigint
  then return false; end if;
  total_refund:=total_refund+(r->>'refund_minor')::bigint;
  total_tax:=total_tax+(r->>'tax_reversal_minor')::bigint;
 end loop;
 return total_refund=(e->>'refunded_minor')::bigint and total_tax=(e->>'tax_reversal_minor')::bigint
  and total_refund<=gross and total_tax<=original_tax and total_refund-total_tax<=gross-original_tax;
end; $$;
revoke all on function private.refund_tax_evidence_valid(jsonb) from public,anon,authenticated,service_role;

create table private.stripe_refund_tax_evidence (
 account_id text not null, environment text not null check(environment in('test','live')),
 refund_id text not null, tax_transaction_id text not null, facts jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(account_id,environment,refund_id), unique(account_id,environment,tax_transaction_id)
);
alter table private.stripe_refund_tax_evidence enable row level security;
alter table private.stripe_refund_tax_evidence force row level security;
revoke all on private.stripe_refund_tax_evidence from public,anon,authenticated,service_role;
create trigger stripe_refund_tax_immutable before update or delete on private.stripe_refund_tax_evidence
for each row execute function private.guard_event_ticket_terms_immutable();

create function private.ingest_refund_tax_facts(p_facts jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare e jsonb:=p_facts->'refund_tax_evidence'; r jsonb; row_facts jsonb; prior jsonb;
 mode text:=case when p_facts->>'environment'='sandbox' then 'test' else p_facts->>'environment' end;
begin
 if e is null or e='null'::jsonb then return; end if;
 if not private.refund_tax_evidence_valid(p_facts) or coalesce(p_facts->>'account_id','') !~ '^acct_[A-Za-z0-9_]+$'
  or coalesce(mode,'') not in('test','live') or coalesce(p_facts->>'charge_id','') !~ '^ch_[A-Za-z0-9_]+$'
  or coalesce(p_facts->>'checkout_id','') !~ '^cs_[A-Za-z0-9_]+$'
 then raise exception 'refund_tax_evidence_invalid'; end if;
 for r in select value from jsonb_array_elements(e->'refunds') order by value->>'refund_id' loop
  perform pg_advisory_xact_lock(hashtextextended('refund-tax:'||(p_facts->>'account_id')||':'||mode||':'||(r->>'refund_id'),0));
  row_facts:=r||jsonb_build_object('association_id',e->>'association_id',
   'original_tax_transaction_id',e->>'original_tax_transaction_id','payment_intent_id',p_facts->>'payment_intent_id',
   'checkout_id',p_facts->>'checkout_id','charge_id',p_facts->>'charge_id','currency',p_facts->>'currency',
   'gross_minor',p_facts->'gross_minor','original_tax_minor',p_facts->'tax_minor');
  select facts into prior from private.stripe_refund_tax_evidence
   where account_id=p_facts->>'account_id' and environment=mode and refund_id=r->>'refund_id';
  if prior is not null then
   if prior is distinct from row_facts then raise exception 'refund_tax_evidence_conflict'; end if;
  else
   insert into private.stripe_refund_tax_evidence(account_id,environment,refund_id,tax_transaction_id,facts)
    values(p_facts->>'account_id',mode,r->>'refund_id',r->>'tax_transaction_id',row_facts);
  end if;
 end loop;
end; $$;
revoke all on function private.ingest_refund_tax_facts(jsonb) from public,anon,authenticated,service_role;

alter table private.google_play_external_transactions add column next_tax_evidence_check_at timestamptz not null default clock_timestamp();
alter table private.google_play_external_report_outbox add column refund_tax_evidence jsonb;

create function private.google_refund_tax_context(p_transaction_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t private.google_play_external_transactions; b private.google_play_external_launch_bindings;
 q jsonb; account text; recipient text; creator uuid;
begin
 select * into t from private.google_play_external_transactions where id=p_transaction_id;
 select * into b from private.google_play_external_launch_bindings where id=t.binding_id;
 if t.id is null or t.original_tax_minor is null or t.original_pre_tax_minor is null then return null; end if;
 if t.feature='creator_tip' then
  select to_jsonb(x),x.creator_id,x.provider_account_id into q,creator,recipient from public.creator_tip_transactions x
   where id=t.quote_id and x.provider_environment='test' and x.sender_id=b.buyer_id;
 elsif t.feature in('event_auction','room_seat_auction') then
  if t.feature='event_auction' then select to_jsonb(x) into q from private.creator_event_auction_quotes x where id=t.quote_id and x.buyer_id=b.buyer_id;
  else select to_jsonb(x) into q from private.creator_room_auction_quotes x where id=t.quote_id and x.buyer_id=b.buyer_id; end if;
  select c.platform_account_id,c.recipient_account_id,c.creator_id into account,recipient,creator
   from private.auction_platform_settlement_contracts c where c.quote_id=t.quote_id
    and c.lane=case when t.feature='event_auction' then 'event' else 'room' end;
  if account is null then return null; end if;
 end if;
 if q->>'provider_checkout_session_id' is null or q->>'provider_payment_intent_id' is null then return null; end if;
 return jsonb_build_object('transaction_id',t.id,'feature',t.feature,'quote_id',t.quote_id,'buyer_id',b.buyer_id,
  'creator_id',creator,'checkout_id',q->>'provider_checkout_session_id','payment_intent_id',q->>'provider_payment_intent_id',
  'gross_minor',b.amount_minor,'tax_minor',t.original_tax_minor,'currency',b.currency,
  'recipient_account_id',recipient,'platform_account_id',account);
end; $$;
revoke all on function private.google_refund_tax_context(uuid) from public,anon,authenticated,service_role;

create function public.claim_google_refund_tax_context() returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select t.id into candidate from private.google_play_external_transactions t
 where t.next_tax_evidence_check_at<=clock_timestamp() and t.original_tax_minor>0
  and exists(select 1 from private.google_play_external_report_outbox o where o.transaction_id=t.id
   and o.operation='refund' and o.state='blocked_tax' and o.reason='verified_refund_tax_provenance_required')
 order by t.next_tax_evidence_check_at,t.id for update skip locked limit 1;
 if candidate is null then return null; end if;
 update private.google_play_external_transactions set next_tax_evidence_check_at=clock_timestamp()+interval '5 minutes' where id=candidate;
 return private.google_refund_tax_context(candidate);
end; $$;
revoke all on function public.claim_google_refund_tax_context() from public,anon,authenticated,service_role;
grant execute on function public.claim_google_refund_tax_context() to service_role;

create function public.record_google_refund_tax_evidence(p_transaction_id uuid,p_facts jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare t private.google_play_external_transactions; context jsonb; refunded bigint; tax bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into t from private.google_play_external_transactions where id=p_transaction_id;
 if t.id is null then raise exception 'google_refund_transaction_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('google-external:'||t.feature||':'||t.quote_id,0));
 select * into t from private.google_play_external_transactions where id=p_transaction_id for update;
 context:=private.google_refund_tax_context(t.id);
 if context is null or not private.refund_tax_evidence_valid(p_facts)
  or p_facts->>'environment' is distinct from 'test'
  or p_facts->>'checkout_id' is distinct from context->>'checkout_id'
  or p_facts->>'payment_intent_id' is distinct from context->>'payment_intent_id'
  or p_facts->>'currency' is distinct from context->>'currency'
  or p_facts->'gross_minor' is distinct from context->'gross_minor'
  or p_facts->'tax_minor' is distinct from context->'tax_minor'
  or (context->>'platform_account_id' is not null and p_facts->>'account_id' is distinct from context->>'platform_account_id')
 then raise exception 'google_refund_tax_binding_invalid'; end if;
 refunded:=(p_facts->>'refunded_minor')::bigint; tax:=(p_facts->>'tax_reversal_minor')::bigint;
 if refunded<=t.reported_refund_minor then return false; end if;
 perform private.ingest_refund_tax_facts(p_facts);
 -- Bind only the exact cumulative financial obligation. A tax snapshot cannot
 -- invent a refund event, rewrite a live lease or overwrite reported history.
 update private.google_play_external_report_outbox set
  target_pre_tax_minor=t.original_pre_tax_minor-(refunded-tax),target_tax_minor=t.original_tax_minor-tax,
  refund_tax_evidence=p_facts->'refund_tax_evidence',state='pending',reason=null,next_attempt_at=clock_timestamp()
 where transaction_id=t.id and operation='refund' and cumulative_refund_minor=refunded
  and state='blocked_tax' and reason='verified_refund_tax_provenance_required';
 return found;
end; $$;
revoke all on function public.record_google_refund_tax_evidence(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_google_refund_tax_evidence(uuid,jsonb) to service_role;

-- Preserve the full deployed recorder, including all existing identity/economic guards.
create or replace function public.record_merch_provider_cost_before_return_policy(p_order_id uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; prior private.merch_held_net_allocations;
 first_facts jsonb; last_facts jsonb; observation uuid; h text; r jsonb;
 gross bigint; fee bigint; tax bigint; refunded bigint; reversal bigint; refund_sum bigint:=0;
 refund_net bigint:=0; net bigint; platform_amount bigint:=0; creator_amount bigint:=0; recovery bigint:=0;
 holds text[]:=array['sandbox_not_payable','merch_return_window_policy_unqualified','adjustments_unqualified'];
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform public.get_merch_cost_reconciliation_context(p_order_id);
 select * into strict o from public.merch_orders where id=p_order_id for update;
 if not coalesce(p_facts->>'order_id'=o.id::text and p_facts->>'checkout_id'=o.stripe_checkout_session_id
  and p_facts->>'payment_intent_id'=o.stripe_payment_intent_id and p_facts->>'currency'=o.currency
  and p_facts->>'environment'='sandbox' and p_facts->>'account_id' ~ '^acct_[A-Za-z0-9_]+$'
  and p_facts->>'charge_id' ~ '^ch_[A-Za-z0-9_]+$' and p_facts->>'balance_id' ~ '^txn_[A-Za-z0-9_]+$'
  and (o.stripe_charge_id is null or p_facts->>'charge_id'=o.stripe_charge_id)
  and p_facts->'financial_authority'='false'::jsonb and p_facts->'adjustments_qualified'='false'::jsonb
  and jsonb_typeof(p_facts->'disputed')='boolean' and jsonb_typeof(p_facts->'refunds')='array'
  and p_facts->>'balance_status' in ('pending','available'),false)
 then raise exception 'merch_cost_identity_invalid'; end if;
 -- Serialize observations for a provider charge across orders as well.
 perform pg_advisory_xact_lock(hashtextextended('merch-cost:'||(p_facts->>'account_id')||':'||(p_facts->>'charge_id'),0));
 if exists(select 1 from private.merch_provider_cost_observations e where e.order_id<>o.id
  and e.facts->>'account_id'=p_facts->>'account_id'
  and (e.facts->>'charge_id'=p_facts->>'charge_id' or e.facts->>'balance_id'=p_facts->>'balance_id'))
 then raise exception 'merch_cost_cross_order_identity'; end if;
 foreach h in array array['gross_minor','provider_fee_minor','charge_net_minor','refunded_minor'] loop
  if jsonb_typeof(p_facts->h) is distinct from 'number' or p_facts->>h !~ '^-?[0-9]{1,10}$'
  then raise exception 'merch_cost_amount_unknown'; end if;
 end loop;
 gross:=(p_facts->>'gross_minor')::bigint; fee:=(p_facts->>'provider_fee_minor')::bigint;
 refunded:=(p_facts->>'refunded_minor')::bigint;
 if gross is distinct from o.amount_total_minor or gross<=0 or fee<0 or refunded<0 or refunded>gross
  or (p_facts->>'charge_net_minor')::bigint<>gross-fee
  or refunded<coalesce(o.refunded_amount_minor,0) then raise exception 'merch_cost_economics_invalid'; end if;
 foreach h in array array['tax_minor','tax_reversal_minor'] loop
  if not p_facts ? h or (p_facts->h<>'null'::jsonb and (jsonb_typeof(p_facts->h)<>'number' or p_facts->>h !~ '^[0-9]{1,10}$'))
  then raise exception 'merch_cost_tax_invalid'; end if;
 end loop;
 tax:=(p_facts->>'tax_minor')::bigint; reversal:=(p_facts->>'tax_reversal_minor')::bigint;
 if tax>gross or (refunded=0 and reversal is distinct from 0)
  or (refunded=gross and reversal is distinct from tax)
  or (refunded>0 and refunded<gross and reversal is not null
    and not (tax=0 and reversal=0) and not private.refund_tax_evidence_valid(p_facts))
 then raise exception 'merch_cost_tax_reversal_unqualified'; end if;
 if jsonb_array_length(p_facts->'refunds')<>(select count(distinct value->>'id') from jsonb_array_elements(p_facts->'refunds'))
  or jsonb_array_length(p_facts->'refunds')<>(select count(distinct value->>'balance_id') from jsonb_array_elements(p_facts->'refunds'))
 then raise exception 'merch_refund_duplicate'; end if;
 for r in select value from jsonb_array_elements(p_facts->'refunds') loop
  if not coalesce(r->>'id' ~ '^re_[A-Za-z0-9_]+$' and r->>'balance_id' ~ '^txn_[A-Za-z0-9_]+$'
   and r->>'balance_id'<>p_facts->>'balance_id' and r->>'status' in ('pending','available')
   and jsonb_typeof(r->'amount')='number' and r->>'amount' ~ '^[0-9]{1,10}$'
   and jsonb_typeof(r->'fee')='number' and r->>'fee' ~ '^-?[0-9]{1,10}$'
   and jsonb_typeof(r->'net')='number' and r->>'net' ~ '^-?[0-9]{1,10}$',false)
  then raise exception 'merch_refund_cost_invalid'; end if;
  if (r->>'net')::bigint<> -(r->>'amount')::bigint-(r->>'fee')::bigint then raise exception 'merch_refund_math_invalid'; end if;
  refund_sum:=refund_sum+(r->>'amount')::bigint; refund_net:=refund_net+(r->>'net')::bigint;
 end loop;
 if refund_sum<>refunded then raise exception 'merch_refund_total_mismatch'; end if;
 select a.* into prior from private.merch_held_net_allocations a where a.order_id=o.id order by id desc limit 1;
 perform private.ingest_refund_tax_facts(p_facts);
 select e.facts into first_facts from private.merch_provider_cost_observations e where e.order_id=o.id order by created_at,id limit 1;
 select e.facts into last_facts from private.merch_provider_cost_observations e where e.id=prior.observation_id;
 recovery:=coalesce(prior.recovery_obligation_minor,0);
 if first_facts is not null and (row(first_facts->>'account_id',first_facts->>'charge_id',first_facts->>'balance_id',first_facts->'provider_fee_minor')
  is distinct from row(p_facts->>'account_id',p_facts->>'charge_id',p_facts->>'balance_id',p_facts->'provider_fee_minor'))
 then raise exception 'merch_original_cost_identity_immutable'; end if;
 if exists(select 1 from private.merch_provider_cost_observations e where e.order_id=o.id
  and e.facts->>'tax_minor' is not null and (e.facts->>'tax_minor')::bigint is distinct from tax)
 then raise exception 'merch_original_tax_identity_immutable'; end if;
 -- Provider reads can finish out of order; never resurrect a reversed allocation.
 if last_facts is not null and ((last_facts->>'refunded_minor')::bigint>refunded
  or (last_facts->'disputed'='true'::jsonb and p_facts->'disputed'<>'true'::jsonb))
 then raise exception 'merch_cost_observation_stale'; end if;
 if last_facts is not null and exists(
  select 1 from jsonb_array_elements(last_facts->'refunds') old_refund
  where not exists(select 1 from jsonb_array_elements(p_facts->'refunds') new_refund
   where new_refund->>'id'=old_refund->>'id'
    and (new_refund-'status')=(old_refund-'status')))
 then raise exception 'merch_refund_cost_identity_immutable'; end if;
 h:=encode(extensions.digest(p_facts::text,'sha256'),'hex');
 select id into observation from private.merch_provider_cost_observations where order_id=o.id and observation_hash=h;
 if observation is not null then return jsonb_build_object('status','duplicate','observationId',observation,'financialAuthority',false); end if;
 if tax is null then holds:=array_append(holds,'tax_unverified'); end if;
 if reversal is null then holds:=array_append(holds,'refund_tax_reversal_unverified'); end if;
 if p_facts->'disputed'='true'::jsonb or o.payment_status='disputed' then holds:=array_append(holds,'dispute_recovery_review'); end if;
 if p_facts->>'balance_status'<>'available' or exists(select 1 from jsonb_array_elements(p_facts->'refunds') x where x->>'status'<>'available')
 then holds:=array_append(holds,'provider_balance_pending'); end if;
 if o.fulfillment_status<>'delivered' then holds:=array_append(holds,'fulfillment_unqualified'); end if;
 -- Known amounts are an observed net basis, never settlement-complete proof.
 -- A dispute is kept separate: no guessing its debit on top of refunds.
 if tax is not null and reversal is not null and not ('dispute_recovery_review'=any(holds)) then
  net:=gross-fee-tax+refund_net+reversal;
  recovery:=greatest(-net,0); platform_amount:=greatest(net,0)*1000/10000;
  creator_amount:=greatest(net,0)-platform_amount;
  if recovery>0 then holds:=array_append(holds,'negative_obligation_recovery_review'); end if;
 end if;
 insert into private.merch_provider_cost_observations(order_id,observation_hash,facts) values(o.id,h,p_facts) returning id into observation;
 insert into private.merch_held_net_allocations(observation_id,order_id,policy_version,net_minor,platform_minor,creator_minor,
  platform_delta_minor,creator_delta_minor,recovery_obligation_minor,hold_reasons)
 values(observation,o.id,o.net_share_policy_version,net,platform_amount,creator_amount,
  platform_amount-coalesce(prior.platform_minor,0),creator_amount-coalesce(prior.creator_minor,0),recovery,holds);
 return jsonb_build_object('status','held','observationId',observation,'netBaseMinor',net,
  'platformShareMinor',case when net is null then null else platform_amount end,
  'creatorShareMinor',case when net is null then null else creator_amount end,
  'recoveryObligationMinor',recovery,'holdReasons',holds,'financialAuthority',false);
end;
$$;
revoke all on function public.record_merch_provider_cost_before_return_policy(uuid,jsonb) from public,anon,authenticated,service_role;

-- Preserve the full deployed recorder, including all existing identity/economic guards.
create or replace function public.record_auction_platform_cost_before_tax_readiness(p_contract_id uuid,p_facts jsonb)
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
  or (refunded>0 and refunded<gross and tax_reversal is not null
    and not (tax=0 and tax_reversal=0) and not private.refund_tax_evidence_valid(p_facts))
  or tax_reversal<0 or tax_reversal>tax or (refunded=0 and (refund_net is distinct from 0 or tax_reversal is distinct from 0))
 then raise exception 'auction_cost_math_invalid'; end if;
 perform private.ingest_refund_tax_facts(p_facts);
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
revoke all on function public.record_auction_platform_cost_before_tax_readiness(uuid,jsonb) from public,anon,authenticated,service_role;
create or replace function public.claim_google_play_external_report(p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.google_play_external_report_outbox;t private.google_play_external_transactions;
 b private.google_play_external_launch_bindings;p private.google_play_external_program_config;
begin
 if auth.role() is distinct from 'service_role' or p_lease_id is null then raise exception 'service_role_required'; end if;
 -- Serialize one claim decision; leases then serialize each transaction across
 -- workers. A crash does not acknowledge or discard the pending report.
 perform pg_advisory_xact_lock(hashtextextended('google-external-report-claim',0));
 select candidate.* into o from private.google_play_external_report_outbox candidate
 join private.google_play_external_transactions tx on tx.id=candidate.transaction_id
 where candidate.state in('pending','retry','unknown','leased') and candidate.next_attempt_at<=clock_timestamp()
   and (candidate.lease_until is null or candidate.lease_until<clock_timestamp())
   and tx.original_pre_tax_minor is not null and tx.original_tax_minor is not null and tx.transaction_time is not null
   and (candidate.operation='create' or tx.create_reported)
   and not exists(select 1 from private.google_play_external_report_outbox other where other.transaction_id=tx.id
     and other.id<>candidate.id and other.state='leased' and other.lease_until>=clock_timestamp())
   and (candidate.operation='create' or (candidate.target_pre_tax_minor=0 and candidate.target_tax_minor=0)
     or not exists(select 1 from private.google_play_external_report_outbox earlier
     where earlier.transaction_id=tx.id and earlier.operation='refund' and earlier.state<>'reported'
       and not (candidate.refund_tax_evidence is not null and earlier.state='blocked_tax'
         and earlier.reason='verified_refund_tax_provenance_required')
       and earlier.cumulative_refund_minor<candidate.cumulative_refund_minor))
 order by candidate.created_at,candidate.id limit 1;
 if o.id is null then return null; end if;
 -- Consistent lock order with webhook enqueue and completion: transaction,
 -- then outbox. Never hold an outbox row while waiting on its transaction.
 select * into t from private.google_play_external_transactions where id=o.transaction_id for update;
 select * into o from private.google_play_external_report_outbox where id=o.id for update;
 if o.state not in('pending','retry','unknown','leased')
   or (o.lease_until is not null and o.lease_until>=clock_timestamp()) then return null; end if;
 select * into b from private.google_play_external_launch_bindings where id=t.binding_id;
 select * into p from private.google_play_external_program_config where id=b.program_id;
 update private.google_play_external_report_outbox set state='leased',lease_id=p_lease_id,
   lease_until=clock_timestamp()+interval '2 minutes',attempt_count=attempt_count+1 where id=o.id;
 return jsonb_build_object('outboxId',o.id,'leaseId',p_lease_id,'report',jsonb_build_object(
   'externalTransactionId',t.id,'packageName',p.package_name,'operation',o.operation,
   'externalTransactionToken',case when o.operation='create' then b.external_transaction_token end,
   'environment','test','licenseTestQualified',true,
   'originalPreTaxMinor',t.original_pre_tax_minor,'originalTaxMinor',t.original_tax_minor,
   'transactionTime',to_char(t.transaction_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'refundTime',to_char(o.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'refundId',o.id,'refundPreTaxMinor',t.remaining_pre_tax_minor-o.target_pre_tax_minor,
   'previousPreTaxMinor',t.remaining_pre_tax_minor,'previousTaxMinor',t.remaining_tax_minor,
   'remainingPreTaxMinor',o.target_pre_tax_minor,'remainingTaxMinor',o.target_tax_minor));
end; $$;

create or replace function public.finish_google_play_external_report(p_outbox_id uuid,p_lease_id uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare o private.google_play_external_report_outbox;t private.google_play_external_transactions;
 r jsonb:=p_result->'receipt'; status text:=p_result->>'status'; package text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into o from private.google_play_external_report_outbox where id=p_outbox_id;
 if o.id is null then return false; end if;
 select * into t from private.google_play_external_transactions where id=o.transaction_id for update;
 select * into o from private.google_play_external_report_outbox where id=p_outbox_id for update;
 if o.id is null or o.state<>'leased' or o.lease_id is distinct from p_lease_id
   or o.lease_until<clock_timestamp() then return false; end if;
 select p.package_name into package from private.google_play_external_launch_bindings b
   join private.google_play_external_program_config p on p.id=b.program_id where b.id=t.binding_id;
 if status not in('reported','retry','unknown','needs_review') then raise exception 'google_report_result_invalid'; end if;
 if status='reported' and (r is null or r->>'externalTransactionId' is distinct from t.id::text
   or r->>'packageName' is distinct from package
   or jsonb_typeof(r->'testPurchase') is distinct from 'object'
   or r->'userTaxAddress'->>'regionCode' is distinct from 'US'
   or r->'externalContentLinkDetails'->>'linkType' is distinct from 'LINK_TO_DIGITAL_CONTENT_OFFER'
   or coalesce(r->>'transactionState','') not in('TRANSACTION_REPORTED','TRANSACTION_CANCELED')
   or (r->>'transactionTime')::timestamptz is distinct from t.transaction_time
   or r->'originalPreTaxAmount'->>'priceMicros' is distinct from (t.original_pre_tax_minor::bigint*10000)::text
   or r->'originalTaxAmount'->>'priceMicros' is distinct from (t.original_tax_minor::bigint*10000)::text
   or r->'originalPreTaxAmount'->>'currency' is distinct from 'USD'
   or r->'originalTaxAmount'->>'currency' is distinct from 'USD'
   or r->'currentPreTaxAmount'->>'currency' is distinct from 'USD'
   or r->'currentTaxAmount'->>'currency' is distinct from 'USD'
   or coalesce(r->'currentPreTaxAmount'->>'priceMicros','') !~ '^(0|[1-9][0-9]{0,15})$'
   or coalesce(r->'currentTaxAmount'->>'priceMicros','') !~ '^(0|[1-9][0-9]{0,15})$'
   or case when r->'currentPreTaxAmount'->>'priceMicros' ~ '^(0|[1-9][0-9]{0,15})$'
     then (r->'currentPreTaxAmount'->>'priceMicros')::numeric>t.original_pre_tax_minor::bigint*10000 else true end
   or case when r->'currentTaxAmount'->>'priceMicros' ~ '^(0|[1-9][0-9]{0,15})$'
     then (r->'currentTaxAmount'->>'priceMicros')::numeric>t.original_tax_minor::bigint*10000 else true end
   or (r->>'transactionState'='TRANSACTION_CANCELED' and
     (r->'currentPreTaxAmount'->>'priceMicros' is distinct from '0'
       or r->'currentTaxAmount'->>'priceMicros' is distinct from '0'))
   or r ? 'oneTimeTransaction' or r ? 'externalTransactionToken'
   or (o.operation='refund' and (
     r->'currentPreTaxAmount'->>'currency' is distinct from 'USD'
     or r->'currentTaxAmount'->>'currency' is distinct from 'USD'
     or r->'currentPreTaxAmount'->>'priceMicros' is distinct from (o.target_pre_tax_minor::bigint*10000)::text
     or r->'currentTaxAmount'->>'priceMicros' is distinct from (o.target_tax_minor::bigint*10000)::text)))
 then raise exception 'google_report_receipt_required'; end if;
 if status='reported' then
   if o.operation='refund' and o.target_pre_tax_minor=0 and o.target_tax_minor=0
     and r->>'transactionState' is distinct from 'TRANSACTION_CANCELED'
   then raise exception 'google_report_receipt_required'; end if;
   -- Defense in depth: even a service caller cannot retain unknown fields or
   -- nested input-only tokens by skipping the worker's receipt allowlist.
   r:=jsonb_build_object('externalTransactionId',r->>'externalTransactionId','packageName',package,
     'transactionTime',r->>'transactionTime','transactionState',r->>'transactionState',
     'testPurchase','{}'::jsonb,'userTaxAddress',jsonb_build_object('regionCode','US'),
     'externalContentLinkDetails',jsonb_build_object('linkType','LINK_TO_DIGITAL_CONTENT_OFFER'),
     'originalPreTaxAmount',jsonb_build_object('currency','USD','priceMicros',r->'originalPreTaxAmount'->>'priceMicros'),
     'originalTaxAmount',jsonb_build_object('currency','USD','priceMicros',r->'originalTaxAmount'->>'priceMicros'),
     'currentPreTaxAmount',jsonb_build_object('currency','USD','priceMicros',r->'currentPreTaxAmount'->>'priceMicros'),
     'currentTaxAmount',jsonb_build_object('currency','USD','priceMicros',r->'currentTaxAmount'->>'priceMicros'));
 end if;
 update private.google_play_external_report_outbox set state=status,reason=left(p_result->>'reason',100),
   lease_id=null,lease_until=null,next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(attempt_count,7)))::integer),
   canonical_receipt=case when status='reported' then r else null end,
   reported_at=case when status='reported' then clock_timestamp() end where id=o.id;
 if status='reported' then
   if o.operation='create' then update private.google_play_external_transactions set create_reported=true where id=t.id;
   else update private.google_play_external_transactions set reported_refund_minor=o.cumulative_refund_minor,
     remaining_pre_tax_minor=o.target_pre_tax_minor,remaining_tax_minor=o.target_tax_minor where id=t.id;
     if (o.target_pre_tax_minor=0 and o.target_tax_minor=0) or o.refund_tax_evidence is not null then
       -- A canonical full refund or evidence-bound cumulative partial refund
       -- settles earlier partial obligations. Ingestion alone never acknowledges
       -- them: retain the actual verified Google cumulative receipt.
       update private.google_play_external_report_outbox set state='reported',reason=case when o.refund_tax_evidence is null then 'covered_by_canonical_full_refund' else 'covered_by_canonical_cumulative_refund' end,
         canonical_receipt=r,reported_at=clock_timestamp(),lease_id=null,lease_until=null
       where transaction_id=t.id and operation='refund' and cumulative_refund_minor<o.cumulative_refund_minor
         and state<>'reported';
     end if;
   end if;
 end if;
 return true;
end; $$;
