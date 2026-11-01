-- Dormant mode-compatible evidence contracts. No switch, qualification,
-- credential, checkout, transfer, payout or provider configuration is created.
create function private.commerce_provider_mode(p_environment text) returns text
language sql immutable set search_path='' as $$
 select case p_environment when 'sandbox' then 'test' when 'test' then 'test'
  when 'production' then 'live' when 'live' then 'live' else null end;
$$;
revoke all on function private.commerce_provider_mode(text) from public,anon,authenticated,service_role;
alter table private.commerce_tax_qualifications drop constraint commerce_tax_qualifications_environment_check;
alter table private.commerce_tax_qualifications add constraint commerce_tax_qualifications_environment_check
 check ((feature='physical_merch' and environment in('sandbox','production')) or
  (feature in('event_auction','room_auction') and environment in('test','live')));
alter table private.auction_platform_qualifications drop constraint auction_platform_qualifications_environment_check;
alter table private.auction_platform_qualifications add constraint auction_platform_qualifications_environment_check check(environment in('test','live'));
alter table private.auction_platform_settlement_contracts drop constraint auction_platform_settlement_contracts_environment_check;
alter table private.auction_platform_settlement_contracts add constraint auction_platform_settlement_contracts_environment_check check(environment in('test','live'));


create or replace function public.bind_commerce_tax_checkout_policy(p_feature text,p_identity_id uuid,p_product_id text,
 p_account_id text,p_environment text,p_permitted_scope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.commerce_tax_qualifications; b private.commerce_tax_checkout_bindings;
 reason text; expected_scope text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 expected_scope:=case when p_feature='physical_merch' then 'US_all_destinations' else 'worldwide' end;
 if p_feature is null or p_feature not in ('physical_merch','event_auction','room_auction')
  or p_identity_id is null or p_product_id is null or p_account_id is null
  or p_permitted_scope is distinct from expected_scope
  or (p_feature='physical_merch' and coalesce(p_environment,'') not in ('sandbox','production'))
  or (p_feature<>'physical_merch' and coalesce(p_environment,'') not in ('test','live'))
 then return jsonb_build_object('ready',false,'reason','tax_checkout_identity_invalid'); end if;
 -- This is a trusted edge gate, not a client-selected location or seller election.
 if p_feature='physical_merch' then
  if not exists(select 1 from public.merch_orders o where o.id=p_identity_id and o.product_id::text=p_product_id
   and o.environment=p_environment and o.provider='stripe_physical_goods') then
   return jsonb_build_object('ready',false,'reason','tax_checkout_identity_invalid'); end if;
 else
  if not exists(select 1 from private.auction_platform_settlement_contracts c where c.quote_id=p_identity_id
   and c.lane=case p_feature when 'event_auction' then 'event' else 'room' end
   and c.platform_product_id=p_product_id and c.platform_account_id=p_account_id and c.environment=p_environment) then
   return jsonb_build_object('ready',false,'reason','tax_checkout_identity_invalid'); end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('commerce-tax:'||p_feature||':'||p_identity_id,0));
 select * into b from private.commerce_tax_checkout_bindings where feature=p_feature and identity_id=p_identity_id;
 select * into q from private.commerce_tax_qualifications where feature=p_feature and product_id=p_product_id
  and account_id=p_account_id and environment=p_environment order by verified_at desc,id desc limit 1 for share;
 if q.id is null then reason:='tax_qualification_required';
 elsif b.policy_id is not null and (b.policy_id<>q.id or b.product_id<>p_product_id or b.account_id<>p_account_id
  or b.environment<>p_environment or b.permitted_scope<>p_permitted_scope) then reason:='tax_policy_changed';
 elsif not q.enabled or q.revoked_at is not null or q.verified_at>clock_timestamp()
  or q.expires_at is null or q.expires_at<=clock_timestamp() then reason:='tax_qualification_expired';
 elsif q.tax_behavior is null then reason:='tax_pricing_behavior_required';
 elsif q.tax_behavior='exclusive' then reason:='tax_pricing_behavior_unsupported';
 elsif not q.full_permitted_scope_reviewed or q.permitted_scope<>p_permitted_scope
  or nullif(btrim(q.professional_basis_reference),'') is null or nullif(btrim(q.coverage_evidence_reference),'') is null
 then reason:='tax_scope_coverage_required';
 elsif q.collection_mode is null or q.collection_mode='store_handled' or q.liability_type is null or q.tax_code is null
  or nullif(btrim(q.provider_settings_evidence_reference),'') is null
  or nullif(btrim(q.provider_product_evidence_reference),'') is null
  or q.provider_verified_at is null or q.provider_verified_at>clock_timestamp()
  or q.provider_expires_at is null or q.provider_expires_at<=clock_timestamp()
  or (q.collection_mode='automatic' and nullif(btrim(q.registration_evidence_reference),'') is null)
  or (q.collection_mode='verified_no_collection' and nullif(btrim(q.no_collection_basis_reference),'') is null)
 then reason:='provider_tax_settings_unverified'; end if;
 if reason is not null then return jsonb_build_object('ready',false,'reason',reason); end if;
 if b.policy_id is null then
  insert into private.commerce_tax_checkout_bindings(feature,identity_id,policy_id,product_id,account_id,environment,permitted_scope)
   values(p_feature,p_identity_id,q.id,p_product_id,p_account_id,p_environment,p_permitted_scope);
 end if;
 return jsonb_build_object('ready',true,'policyId',q.id,'taxBehavior',q.tax_behavior,'taxCode',q.tax_code,
  'liabilityType',q.liability_type,'liabilityAccountId',q.liability_account_id,'collectionMode',q.collection_mode);
end;
$$;

create or replace function public.get_merch_cost_reconciliation_context(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict o from public.merch_orders where id=p_order_id;
 if o.provider<>'stripe_physical_goods' or o.environment not in ('sandbox','production')
  or o.net_share_policy_version is distinct from 'physical_merch_net_90_10_v1'
  or o.payment_status not in ('paid','refunded','disputed') or o.stripe_payment_intent_id is null
  or o.stripe_checkout_session_id is null then raise exception 'merch_cost_order_ineligible'; end if;
 if o.environment='production' and not exists(select 1 from private.commerce_tax_checkout_bindings b
  where b.feature='physical_merch' and b.identity_id=o.id and b.environment=o.environment
   and b.product_id=o.product_id::text and b.account_id ~ '^acct_[A-Za-z0-9_]+$')
 then raise exception 'merch_live_charge_account_binding_required'; end if;
 return jsonb_build_object('id',o.id,'buyer_id',o.buyer_id,'stripe_checkout_session_id',o.stripe_checkout_session_id,
  'stripe_payment_intent_id',o.stripe_payment_intent_id,'stripe_charge_id',o.stripe_charge_id,
  'amount_total_minor',o.amount_total_minor,'currency',o.currency,'environment',o.environment,'platform_account_id',(select b.account_id from private.commerce_tax_checkout_bindings b where b.feature='physical_merch' and b.identity_id=o.id));
end;
$$;

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
 if o.environment='production' then holds:=array_replace(holds,'sandbox_not_payable','live_commerce_release_unqualified'); end if;
 if not coalesce(p_facts->>'order_id'=o.id::text and p_facts->>'checkout_id'=o.stripe_checkout_session_id
  and p_facts->>'payment_intent_id'=o.stripe_payment_intent_id and p_facts->>'currency'=o.currency
  and p_facts->>'environment'=o.environment and p_facts->>'account_id' ~ '^acct_[A-Za-z0-9_]+$'
  and p_facts->>'charge_id' ~ '^ch_[A-Za-z0-9_]+$' and p_facts->>'balance_id' ~ '^txn_[A-Za-z0-9_]+$'
  and (o.stripe_charge_id is null or p_facts->>'charge_id'=o.stripe_charge_id)
  and p_facts->'financial_authority'='false'::jsonb and p_facts->'adjustments_qualified'='false'::jsonb
  and jsonb_typeof(p_facts->'disputed')='boolean' and jsonb_typeof(p_facts->'refunds')='array'
  and p_facts->>'balance_status' in ('pending','available'),false)
 then raise exception 'merch_cost_identity_invalid'; end if;
 if o.environment='production' and not exists(select 1 from private.commerce_tax_checkout_bindings b
  where b.feature='physical_merch' and b.identity_id=o.id and b.environment=o.environment
   and b.account_id=p_facts->>'account_id') then raise exception 'merch_live_charge_account_binding_required'; end if;
 -- Serialize observations for a provider charge across orders as well.
 perform pg_advisory_xact_lock(hashtextextended('merch-cost:'||(p_facts->>'account_id')||':'||(p_facts->>'charge_id'),0));
 if exists(select 1 from private.merch_provider_cost_observations e where e.order_id<>o.id
  and e.facts->>'account_id'=p_facts->>'account_id' and e.facts->>'environment'=p_facts->>'environment'
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
 if c.environment='live' then holds:=array_replace(holds,'sandbox_not_payable','live_commerce_release_unqualified'); end if;
 select * into strict i from public.money_purchase_intents where id=c.purchase_intent_id;
 if not coalesce(p_facts->>'account_id'=c.platform_account_id and p_facts->>'environment'=c.environment
  and p_facts->>'currency'=c.currency and p_facts->>'charge_id' ~ '^ch_[A-Za-z0-9]+$'
  and p_facts->>'payment_intent_id' ~ '^pi_[A-Za-z0-9]+$' and p_facts->>'balance_id' ~ '^txn_[A-Za-z0-9]+$'
  and p_facts->>'balance_status' in('pending','available') and jsonb_typeof(p_facts->'disputed')='boolean'
  and jsonb_typeof(p_facts->'refunds')='array'
  and p_facts->'financial_authority'='false'::jsonb,false) then raise exception 'auction_cost_identity_invalid'; end if;
 if c.lane='event' then
  if not exists(select 1 from private.creator_event_auction_receipts r where r.quote_id=c.quote_id
   and r.provider_account_id=c.platform_account_id and r.environment=c.environment and r.outcome='paid'
   and r.payment_intent_id=p_facts->>'payment_intent_id' and r.resolution='fulfilled') then raise exception 'auction_paid_receipt_required'; end if;
 else
  if not exists(select 1 from private.creator_room_auction_receipts r where r.quote_id=c.quote_id
   and r.provider_account_id=c.platform_account_id and r.environment=c.environment and r.outcome='paid'
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

create or replace function private.ingest_refund_tax_facts(p_facts jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare e jsonb:=p_facts->'refund_tax_evidence'; r jsonb; row_facts jsonb; prior jsonb;
 mode text:=private.commerce_provider_mode(p_facts->>'environment');
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

create or replace function public.get_auction_cost_reconciliation_context(p_contract_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts; q jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 if c.lane='event' then select to_jsonb(x) into q from private.creator_event_auction_quotes x where id=c.quote_id;
 else select to_jsonb(x) into q from private.creator_room_auction_quotes x where id=c.quote_id; end if;
 if q->>'environment' is distinct from c.environment then raise exception 'auction_provider_mode_mismatch'; end if;
 if q->>'provider_checkout_session_id' is null or q->>'provider_payment_intent_id' is null
 then raise exception 'auction_bound_provider_identity_required'; end if;
 return jsonb_build_object('id',c.id,'quote_id',c.quote_id,'lane',c.lane,'platform_product_id',c.platform_product_id,
  'buyer_id',c.buyer_id,'stripe_checkout_session_id',q->>'provider_checkout_session_id',
  'stripe_payment_intent_id',q->>'provider_payment_intent_id','stripe_charge_id',null,
  'amount_total_minor',c.amount_minor,'currency',c.currency,'environment',c.environment,'platform_account_id',c.platform_account_id);
end;
$$;

create or replace function private.merch_verified_purchase_at(p_order_id uuid) returns timestamptz
language sql stable set search_path='' as $$
 select e.succeeded_at from private.merch_purchase_time_evidence e
 join public.merch_orders o on o.id=e.order_id and o.stripe_payment_intent_id=e.stripe_payment_intent_id
 join public.stripe_merch_events v on v.stripe_event_id=e.stripe_event_id
 where e.order_id=p_order_id and o.provider='stripe_physical_goods' and o.environment in('sandbox','production')
 and v.environment=o.environment and v.raw_event_hash=e.raw_event_hash
 and v.event_type='payment_intent.succeeded' and v.object_id=e.stripe_payment_intent_id and v.status='processed'
 and o.return_policy_version is not null
$$;

create or replace function public.begin_merch_dispute_observation(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders;a private.merch_dispute_observation_attempts;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict o from public.merch_orders where id=p_order_id for update;
 perform public.get_merch_cost_reconciliation_context(p_order_id);
 insert into private.merch_dispute_observation_attempts(order_id,payment_intent_id,charge_id,amount_minor,currency)
 values(o.id,o.stripe_payment_intent_id,o.stripe_charge_id,o.amount_total_minor,o.currency) returning * into a;
 return to_jsonb(a)||jsonb_build_object('environment',o.environment,'platform_account_id',(select b.account_id from private.commerce_tax_checkout_bindings b where b.feature='physical_merch' and b.identity_id=o.id));
end $$;

create or replace function public.complete_merch_dispute_observation(p_attempt_id uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.merch_dispute_observation_attempts;o public.merch_orders; prior private.merch_dispute_observations;
 d jsonb;old_d jsonb;result_state text;account text;charge text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict a from private.merch_dispute_observation_attempts where id=p_attempt_id;
 select * into strict o from public.merch_orders where id=a.order_id for update;
 if exists(select 1 from private.merch_dispute_observations where attempt_id=a.id and facts=p_facts) then return '{"duplicate":true,"financialAuthority":false}'::jsonb;end if;
 if a.started_at<clock_timestamp()-interval '5 minutes' or a.started_at>clock_timestamp()
  or exists(select 1 from private.merch_dispute_observation_attempts n where n.order_id=o.id and n.attempt_no>a.attempt_no)
  or o.updated_at>a.started_at
 then raise exception 'merch_dispute_observation_stale';end if;
 account:=p_facts->>'account_id';charge:=p_facts->>'charge_id';
 if o.environment='production' and not exists(select 1 from private.commerce_tax_checkout_bindings b where b.feature='physical_merch' and b.identity_id=o.id and b.environment=o.environment and b.account_id=account) then raise exception 'merch_live_charge_account_binding_required'; end if;
 if not coalesce(jsonb_typeof(p_facts)='object' and pg_column_size(p_facts)<=65536
  and o.provider='stripe_physical_goods' and o.environment in ('sandbox','production')
  and p_facts->>'environment'=o.environment and p_facts->>'order_id'=o.id::text
  and p_facts->>'payment_intent_id'=o.stripe_payment_intent_id and a.payment_intent_id=o.stripe_payment_intent_id
  and p_facts->>'currency'=o.currency and p_facts->'amount_minor'=to_jsonb(o.amount_total_minor)
  and a.amount_minor=o.amount_total_minor and a.currency=o.currency
  and account ~ '^acct_[A-Za-z0-9_]+$' and charge ~ '^ch_[A-Za-z0-9_]+$'
  and (o.stripe_charge_id is null or charge=o.stripe_charge_id)
  and (a.charge_id is null or charge=a.charge_id)
  and p_facts->'complete'='true'::jsonb and p_facts->'financial_authority'='false'::jsonb
  and jsonb_typeof(p_facts->'disputed')='boolean' and jsonb_typeof(p_facts->'disputes')='array',false)
 then raise exception 'merch_dispute_evidence_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended('merch-dispute:'||account||':'||charge,0));
 if exists(select 1 from private.merch_dispute_observations where order_id<>o.id and provider_account_id=account and charge_id=charge)
 then raise exception 'merch_dispute_cross_order';end if;
 select s.* into prior from private.merch_dispute_observations s join private.merch_dispute_observation_attempts x on x.id=s.attempt_id
 where s.order_id=o.id order by x.attempt_no desc limit 1;
 if prior.attempt_id is not null and (prior.provider_account_id<>account or prior.charge_id<>charge) then raise exception 'merch_dispute_identity_changed';end if;
 -- Bind to the independently authenticated cost account when present.
 if exists(select 1 from private.merch_provider_cost_observations c where c.order_id=o.id
  and (c.facts->>'account_id' is distinct from account or c.facts->>'charge_id' is distinct from charge))
 then raise exception 'merch_dispute_identity_changed';end if;
 if jsonb_array_length(p_facts->'disputes')<>(select count(distinct value->>'id') from jsonb_array_elements(p_facts->'disputes'))
 then raise exception 'merch_dispute_duplicate';end if;
 for d in select value from jsonb_array_elements(p_facts->'disputes') loop
  if not coalesce(d->>'id' ~ '^du_[A-Za-z0-9_]+$' and d->>'status' in('warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','appeal_needs_response','appeal_under_review','won','lost','prevented')
   and jsonb_typeof(d->'amount')='number' and d->>'amount' ~ '^[1-9][0-9]{0,10}$'
   and jsonb_typeof(d->'created')='number' and d->>'created' ~ '^[1-9][0-9]{0,10}$',false)
  then raise exception 'merch_dispute_item_invalid';end if;
 end loop;
 -- A complete new list cannot erase previously seen provider objects, immutable
 -- amounts, or a final loss. Reopened/appealed cases retain a hold.
 for old_d in select value from jsonb_array_elements(coalesce(prior.facts->'disputes','[]'::jsonb)) loop
  select value into d from jsonb_array_elements(p_facts->'disputes') where value->>'id'=old_d->>'id';
  if d is null or d->'amount'<>old_d->'amount' or d->'created'<>old_d->'created'
   or (old_d->>'status'='lost' and d->>'status' not in('lost','appeal_needs_response','appeal_under_review','won'))
  then raise exception 'merch_dispute_history_regressed';end if;
 end loop;
 result_state:=case when exists(select 1 from jsonb_array_elements(p_facts->'disputes') item where item->>'status'='lost') then 'lost'
  when (p_facts->'disputed'='true'::jsonb and jsonb_array_length(p_facts->'disputes')=0)
   or exists(select 1 from jsonb_array_elements(p_facts->'disputes') item where item->>'status' not in('won','warning_closed','prevented')) then 'open'
  when jsonb_array_length(p_facts->'disputes')=0 then 'none' else 'resolved' end;
 insert into private.merch_dispute_observations(attempt_id,order_id,provider_account_id,charge_id,state,facts)
 values(a.id,o.id,account,charge,result_state,p_facts);
 return jsonb_build_object('disputeState',result_state,'financialAuthority',false);
end $$;

create or replace function public.get_merch_fee_report_import_context(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; e private.merch_provider_cost_observations;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform public.get_merch_cost_reconciliation_context(p_order_id);
 select * into strict o from public.merch_orders where id=p_order_id;
 select * into e from private.merch_provider_cost_observations where order_id=o.id order by created_at desc,id desc limit 1;
 if e.id is null or not coalesce(e.facts->>'account_id' ~ '^acct_[A-Za-z0-9]+$'
  and e.facts->>'charge_id' ~ '^ch_[A-Za-z0-9]+$'
  and e.facts->>'environment'=o.environment and e.facts->>'currency'=o.currency
  and e.facts->>'checkout_id'=o.stripe_checkout_session_id
  and e.facts->>'payment_intent_id'=o.stripe_payment_intent_id
  and (o.stripe_charge_id is null or e.facts->>'charge_id'=o.stripe_charge_id)
  and (e.facts->>'refunded_minor')::bigint>=coalesce(o.refunded_amount_minor,0)
  and (o.payment_status<>'disputed' or e.facts->'disputed'='true'::jsonb),false)
 then raise exception 'fee_source_observation_required'; end if;
 return jsonb_build_object('orderId',o.id,'sourceObservationId',e.id,'accountId',e.facts->>'account_id',
  'environment',private.commerce_provider_mode(o.environment),'currency',o.currency,'chargeId',e.facts->>'charge_id',
  'refundIds',coalesce((select jsonb_agg(x->>'id' order by x->>'id') from jsonb_array_elements(e.facts->'refunds') x),'[]'::jsonb));
end; $$;

create or replace function private.auction_release_negative_holds(p_contract_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;v private.auction_platform_qualifications;v_event_id uuid;
begin
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 select * into v from private.auction_platform_qualifications where capability_id=c.capability_id and environment=c.environment order by verified_at desc,id desc limit 1;
 if v.id is null or not v.enabled or v.revoked_at is not null or v.verified_at>clock_timestamp() or v.expires_at<=clock_timestamp()
  or row(v.platform_account_id,v.recipient_account_id,v.platform_product_id) is distinct from row(c.platform_account_id,c.recipient_account_id,c.platform_product_id)
  or not exists(select 1 from public.creator_payout_accounts account join public.creator_payout_eligibility_records r on r.payout_account_id=account.id
   where account.creator_user_id=c.creator_id::text and account.provider='stripe_connect' and account.provider_environment=c.environment
    and account.provider_account_id=c.recipient_account_id and account.provider_configuration_status='match'
    and account.provider_configuration_account_id=c.recipient_account_id and account.payouts_enabled
    and r.provider_ready and r.kyc_ready and r.payout_account_ready and not r.fraud_hold_active
    and r.admin_review_status not in('pending_review','rejected','on_hold') and r.eligibility_status<>'on_hold')
 then return true;end if;
 if c.lane='event' then
  select a.event_id into v_event_id from private.creator_event_auction_quotes q join private.creator_event_auctions a on a.id=q.auction_id where q.id=c.quote_id;
  return not exists(select 1 from public.creator_events e where e.id=v_event_id and e.status in('ended','replay_available') and e.management_status is distinct from 'no_show')
   or not exists(select 1 from private.creator_event_verified_start_facts f where f.event_id=v_event_id)
   or exists(select 1 from public.creator_event_purchase_remedies r where r.purchase_intent_id=c.purchase_intent_id)
   or exists(select 1 from private.creator_event_ticket_notices n where n.event_id=v_event_id and n.buyer_id=c.buyer_id and n.kind='schedule_changed'
    and not exists(select 1 from private.creator_event_schedule_choices choice where choice.purchase_intent_id=c.purchase_intent_id and choice.revision_id=n.revision_id and choice.choice='keep_ticket'))
   or exists(select 1 from private.creator_event_schedule_choices s where s.purchase_intent_id=c.purchase_intent_id and s.choice='request_refund_review');
 end if;
 return not exists(select 1 from private.creator_room_seat_claims s join private.creator_room_sessions r on r.id=s.room_session_id
  where s.purchase_intent_id=c.purchase_intent_id and s.availability_confirmed_at is not null and s.state='ended'
   and r.ended_at is not null and r.end_reason='creator_ended_room' and not s.refund_review_eligible
   and s.paid_at>=(select started_at from private.auction_release_observation_epoch where singleton)
   and not exists(select 1 from private.auction_room_delivery_issues issue where issue.claim_id=s.id));
end;$$;

create or replace function private.lock_auction_release_qualification(p_contract_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;
begin
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 perform pg_advisory_xact_lock(hashtextextended('auction-release-qualification:'||c.capability_id,0));
 perform 1 from private.auction_platform_qualifications where capability_id=c.capability_id and environment=c.environment order by verified_at desc,id desc limit 1 for share;
 perform 1 from public.creator_payout_accounts account where account.creator_user_id=c.creator_id::text
  and account.provider='stripe_connect' and account.provider_environment=c.environment and account.provider_account_id=c.recipient_account_id for share;
 perform 1 from public.creator_payout_eligibility_records eligibility join public.creator_payout_accounts account on account.id=eligibility.payout_account_id
  where account.creator_user_id=c.creator_id::text and account.provider_account_id=c.recipient_account_id
   and account.provider='stripe_connect' and account.provider_environment=c.environment for share of eligibility;
end;$$;

alter table private.auction_release_evidence drop constraint auction_release_evidence_environment_check;
alter table private.auction_release_evidence add constraint auction_release_evidence_environment_check check(environment in('test','live'));
do $patch$ declare signature text; definition text; needle text; begin
 foreach signature in array array['public.qualify_auction_event_release_from_domain(uuid)','public.qualify_auction_room_release_from_domain(uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  needle:='v.expires_at,''test'') returning * into e';
  if position(needle in definition)=0 then raise exception 'auction_release_mode_patch_source_changed'; end if;
  definition:=replace(definition,needle,'v.expires_at,c.environment) returning * into e');
  definition:=replace(definition,'where capability_id=c.capability_id order','where capability_id=c.capability_id and environment=c.environment order');
  definition:=replace(definition,$old$'status','qualified_test_only'$old$,$new$'status',case when c.environment='test' then 'qualified_test_only' else 'qualified_live_evidence_only' end$new$);
  execute definition;
 end loop;
 definition:=pg_get_functiondef('private.auction_release_mature(uuid,uuid)'::regprocedure);
 needle:='if terms is null or e.id is null';
 if position(needle in definition)=0 then raise exception 'auction_maturity_mode_patch_source_changed'; end if;
 execute replace(definition,needle,'if terms is null or e.id is null or e.environment is distinct from c.environment');
end; $patch$;
create function private.guard_auction_contract_provider_mode() returns trigger
language plpgsql security definer set search_path='' as $$
declare quote jsonb; purchase_environment text;
begin
 if not exists(select 1 from private.creator_external_payment_capabilities c
  where c.id=new.capability_id and c.environment=new.environment)
 then raise exception 'auction_capability_provider_mode_mismatch'; end if;
 if tg_table_name='auction_platform_settlement_contracts' then
  if new.lane='event' then select to_jsonb(q) into quote from private.creator_event_auction_quotes q where q.id=new.quote_id;
  else select to_jsonb(q) into quote from private.creator_room_auction_quotes q where q.id=new.quote_id; end if;
  select environment into purchase_environment from public.money_purchase_intents where id=new.purchase_intent_id;
  if quote->>'environment' is distinct from new.environment
   or private.commerce_provider_mode(purchase_environment) is distinct from new.environment
  then raise exception 'auction_contract_provider_mode_mismatch'; end if;
 end if;
 return new;
end; $$;
revoke all on function private.guard_auction_contract_provider_mode() from public,anon,authenticated,service_role;
create trigger auction_contract_provider_mode before insert on private.auction_platform_settlement_contracts
 for each row execute function private.guard_auction_contract_provider_mode();
create trigger auction_qualification_provider_mode before insert on private.auction_platform_qualifications
 for each row execute function private.guard_auction_contract_provider_mode();
revoke all on function public.get_merch_fee_report_import_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_merch_fee_report_import_context(uuid) to service_role;

-- Widening evidence schemas must not widen an existing TEST transfer adapter.
-- Live funding belongs to the separately qualified generic payable/cashout lane.
create function private.guard_auction_transfer_provider_mode() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.auction_platform_settlement_contracts c
  where c.id=new.contract_id and c.environment=new.environment and c.environment='test')
 then raise exception 'auction_test_transfer_mode_mismatch'; end if;
 return new;
end; $$;
revoke all on function private.guard_auction_transfer_provider_mode() from public,anon,authenticated,service_role;
create trigger auction_transfer_provider_mode before insert on private.auction_transfer_operations
 for each row execute function private.guard_auction_transfer_provider_mode();

-- Preserve original implementations and every subsequent domain/lock amendment.
-- Scope qualification selection to the contract/quote mode before allowing both
-- modes in the schema. A newer test qualification cannot revoke/qualify live.
do $patch$ declare f record; definition text; original text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and p.prokind='f'
   and position('from private.auction_platform_qualifications' in p.prosrc)>0 loop
  original:=pg_get_functiondef(f.oid);definition:=original;
  definition:=replace(definition,'where capability_id=c.capability_id order',
   'where capability_id=c.capability_id and environment=c.environment order');
  definition:=replace(definition,'where capability_id=p.capability_id order',
   'where capability_id=p.capability_id and environment=p.environment order');
  definition:=replace(definition,$old$where capability_id=(q->>'capability_id')::uuid$old$,
   $new$where capability_id=(q->>'capability_id')::uuid and environment=q->>'environment'$new$);
  if definition<>original then execute definition; end if;
 end loop;
end; $patch$;
