-- Read-only provider observation -> immutable HELD accounting. This is not an
-- earnings/payout bridge. Merch return-window/fulfillment clearance policy and
-- production qualification are not yet defined. No switches or grants relaxed.
create table private.merch_provider_cost_observations (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.merch_orders(id),
 observation_hash text not null, facts jsonb not null, created_at timestamptz not null default clock_timestamp(),
 unique(order_id,observation_hash)
);
create table private.merch_held_net_allocations (
 id bigint generated always as identity primary key,
 observation_id uuid not null unique references private.merch_provider_cost_observations(id),
 order_id uuid not null references public.merch_orders(id),
 policy_version text not null check(policy_version='physical_merch_net_90_10_v1'),
 net_minor bigint, platform_minor bigint not null check(platform_minor>=0),
 creator_minor bigint not null check(creator_minor>=0),
 platform_delta_minor bigint not null, creator_delta_minor bigint not null,
 recovery_obligation_minor bigint not null check(recovery_obligation_minor>=0),
 hold_reasons text[] not null, financial_authority boolean not null default false check(not financial_authority),
 created_at timestamptz not null default clock_timestamp()
);
create index merch_held_net_order on private.merch_held_net_allocations(order_id,id desc);
alter table private.merch_provider_cost_observations enable row level security;
alter table private.merch_provider_cost_observations force row level security;
alter table private.merch_held_net_allocations enable row level security;
alter table private.merch_held_net_allocations force row level security;
revoke all on private.merch_provider_cost_observations,private.merch_held_net_allocations from public,anon,authenticated,service_role;
create function private.merch_cost_append_only() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'merch_cost_evidence_append_only'; end;
$$;
revoke all on function private.merch_cost_append_only() from public,anon,authenticated,service_role;
create trigger merch_cost_append_only before update or delete on private.merch_provider_cost_observations
 for each row execute function private.merch_cost_append_only();
create trigger merch_allocation_append_only before update or delete on private.merch_held_net_allocations
 for each row execute function private.merch_cost_append_only();

create function public.get_merch_cost_reconciliation_context(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict o from public.merch_orders where id=p_order_id;
 if o.provider<>'stripe_physical_goods' or o.environment<>'sandbox'
  or o.net_share_policy_version is distinct from 'physical_merch_net_90_10_v1'
  or o.payment_status not in ('paid','refunded','disputed') or o.stripe_payment_intent_id is null
  or o.stripe_checkout_session_id is null then raise exception 'merch_cost_order_ineligible'; end if;
 return jsonb_build_object('id',o.id,'buyer_id',o.buyer_id,'stripe_checkout_session_id',o.stripe_checkout_session_id,
  'stripe_payment_intent_id',o.stripe_payment_intent_id,'stripe_charge_id',o.stripe_charge_id,
  'amount_total_minor',o.amount_total_minor,'currency',o.currency,'environment',o.environment);
end;
$$;
revoke all on function public.get_merch_cost_reconciliation_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_merch_cost_reconciliation_context(uuid) to service_role;

-- Only the trusted GET adapter calls this. Authenticated/anon callers cannot
-- supply fee proof. SQL independently revalidates stored identity and arithmetic.
create function public.record_merch_provider_cost_observation(p_order_id uuid,p_facts jsonb) returns jsonb
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
  or (refunded>0 and refunded<gross and reversal is not null)
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
revoke all on function public.record_merch_provider_cost_observation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_merch_provider_cost_observation(uuid,jsonb) to service_role;

alter function public.merch_order_projection_internal(public.merch_orders) rename to merch_order_projection_before_cost_observation;
revoke all on function public.merch_order_projection_before_cost_observation(public.merch_orders) from public,anon,authenticated,service_role;
create function public.merch_order_projection_internal(o public.merch_orders) returns jsonb language plpgsql stable set search_path='' as $$
declare a private.merch_held_net_allocations; e private.merch_provider_cost_observations;
begin
 select * into a from private.merch_held_net_allocations where order_id=o.id order by id desc limit 1;
 if a.id is null then return public.merch_order_projection_before_cost_observation(o); end if;
 select * into strict e from private.merch_provider_cost_observations where id=a.observation_id;
 -- Callback/refund evidence may advance before the asynchronous cost read.
 -- Never show a pre-refund estimate as current, even though it is not payable.
 if coalesce(o.refunded_amount_minor,0)>(e.facts->>'refunded_minor')::bigint
  or (o.payment_status='disputed' and e.facts->'disputed'<>'true'::jsonb) then
  return public.merch_order_projection_before_cost_observation(o)||jsonb_build_object(
   'netSettlementStatus','held_unqualified','financialAuthority',false,
   'netSettlementHoldReasons',array['provider_observation_stale']);
 end if;
 return public.merch_order_projection_before_cost_observation(o)||jsonb_build_object(
  'providerFeeMinor',(e.facts->>'provider_fee_minor')::bigint,'netBaseMinor',a.net_minor,
  'platformShareMinor',case when a.net_minor is null then null else a.platform_minor end,
  'creatorShareMinor',case when a.net_minor is null then null else a.creator_minor end,
  'netSettlementStatus','held_unqualified','financialAuthority',false,'netSettlementHoldReasons',a.hold_reasons);
end;
$$;
revoke all on function public.merch_order_projection_internal(public.merch_orders) from public,anon,authenticated,service_role;
