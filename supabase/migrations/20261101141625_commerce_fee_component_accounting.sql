-- Actual provider observations, not an assertion that future fees cannot occur.
-- Extend the same immutable report archive to physical merchandise. Shared
-- component identities prevent overlapping report runs from multiplying costs.
alter table private.commerce_fee_report_observations alter column contract_id drop not null;
alter table private.commerce_fee_report_observations alter column source_observation_id drop not null;
alter table private.commerce_fee_report_observations
 add column order_id uuid references public.merch_orders(id),
 add column merch_source_observation_id uuid references private.merch_provider_cost_observations(id),
 add constraint commerce_fee_report_source_lane check (
  (contract_id is not null and source_observation_id is not null and order_id is null and merch_source_observation_id is null)
  or (contract_id is null and source_observation_id is null and order_id is not null and merch_source_observation_id is not null)),
 add constraint commerce_fee_report_merch_run unique(order_id,report_run_id);

create table private.commerce_fee_components (
 id uuid primary key default gen_random_uuid(),
 account_id text not null, environment text not null check(environment in ('test','live')),
 component_key text not null, component jsonb not null,
 first_report_observation_id uuid not null references private.commerce_fee_report_observations(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(account_id,environment,component_key)
);
create table private.commerce_fee_component_sources (
 component_id uuid not null references private.commerce_fee_components(id),
 report_observation_id uuid not null references private.commerce_fee_report_observations(id),
 primary key(component_id,report_observation_id)
);
alter table private.commerce_fee_components enable row level security;
alter table private.commerce_fee_components force row level security;
alter table private.commerce_fee_component_sources enable row level security;
alter table private.commerce_fee_component_sources force row level security;
revoke all on private.commerce_fee_components, private.commerce_fee_component_sources from public,anon,authenticated,service_role;
create trigger commerce_fee_component_immutable before update or delete on private.commerce_fee_components
 for each row execute function private.guard_event_ticket_terms_immutable();
create trigger commerce_fee_component_source_immutable before update or delete on private.commerce_fee_component_sources
 for each row execute function private.guard_event_ticket_terms_immutable();

create function private.capture_commerce_fee_component_observation(new private.commerce_fee_report_observations) returns void
language plpgsql security definer set search_path='' as $$
declare r jsonb; k text; prior private.commerce_fee_components; origin private.commerce_fee_report_observations; cid uuid;
begin
 -- Account-wide serialization gives a common order across different sales and
 -- reports. Same component + changed facts is quarantined by rollback, never
 -- silently updated or counted again. Genuine adjustments have their own IDs.
 perform pg_advisory_xact_lock(hashtextextended('fee-components:'||new.account_id||':'||new.environment,0));
 for r in select value from jsonb_array_elements(new.evidence->'rows') loop
  if r ? 'balanceTransactionId' and r->'balanceTransactionId'<>'null'::jsonb
   and not coalesce(jsonb_typeof(r->'balanceTransactionId')='string' and r->>'balanceTransactionId' ~ '^txn_[A-Za-z0-9]+$',false)
  then raise exception 'fee_balance_identity_invalid'; end if;
  k:=encode(extensions.digest(jsonb_build_array(r->>'feeTransactionId',r->>'incurredBy',r->>'incurredByType',
    r->>'currency',r->>'product',r->>'suite',r->>'featureName',r->>'pricingTier')::text,'sha256'),'hex');
  select * into prior from private.commerce_fee_components
   where account_id=new.account_id and environment=new.environment and component_key=k;
  if prior.id is not null then
   if prior.component is distinct from r then raise exception 'fee_component_conflicting_observation'; end if;
   select * into strict origin from private.commerce_fee_report_observations where id=prior.first_report_observation_id;
   if row(origin.contract_id,origin.order_id) is distinct from row(new.contract_id,new.order_id)
   then raise exception 'fee_component_cross_sale_binding'; end if;
   cid:=prior.id;
  else
   insert into private.commerce_fee_components(account_id,environment,component_key,component,first_report_observation_id)
    values(new.account_id,new.environment,k,r,new.id) returning id into cid;
  end if;
  insert into private.commerce_fee_component_sources(component_id,report_observation_id) values(cid,new.id) on conflict do nothing;
 end loop;
end; $$;
revoke all on function private.capture_commerce_fee_component_observation(private.commerce_fee_report_observations) from public,anon,authenticated,service_role;
create function private.capture_commerce_fee_components() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.capture_commerce_fee_component_observation(new); return new; end; $$;
revoke all on function private.capture_commerce_fee_components() from public,anon,authenticated,service_role;
create trigger commerce_fee_components_capture after insert on private.commerce_fee_report_observations
 for each row execute function private.capture_commerce_fee_components();
-- Existing archive rows remain byte-for-byte unchanged. Conflicting historical
-- components abort the migration rather than picking a winner or creating money.
do $$ declare observation private.commerce_fee_report_observations; begin
 for observation in select * from private.commerce_fee_report_observations order by created_at,id loop
  perform private.capture_commerce_fee_component_observation(observation);
 end loop;
end $$;

create function public.get_merch_fee_report_import_context(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; e private.merch_provider_cost_observations;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform public.get_merch_cost_reconciliation_context(p_order_id);
 select * into strict o from public.merch_orders where id=p_order_id;
 select * into e from private.merch_provider_cost_observations where order_id=o.id order by created_at desc,id desc limit 1;
 if e.id is null or not coalesce(e.facts->>'account_id' ~ '^acct_[A-Za-z0-9]+$'
  and e.facts->>'charge_id' ~ '^ch_[A-Za-z0-9]+$'
  and e.facts->>'environment'='sandbox' and e.facts->>'currency'=o.currency
  and e.facts->>'checkout_id'=o.stripe_checkout_session_id
  and e.facts->>'payment_intent_id'=o.stripe_payment_intent_id
  and (o.stripe_charge_id is null or e.facts->>'charge_id'=o.stripe_charge_id)
  and (e.facts->>'refunded_minor')::bigint>=coalesce(o.refunded_amount_minor,0)
  and (o.payment_status<>'disputed' or e.facts->'disputed'='true'::jsonb),false)
 then raise exception 'fee_source_observation_required'; end if;
 return jsonb_build_object('orderId',o.id,'sourceObservationId',e.id,'accountId',e.facts->>'account_id',
  'environment','test','currency',o.currency,'chargeId',e.facts->>'charge_id',
  'refundIds',coalesce((select jsonb_agg(x->>'id' order by x->>'id') from jsonb_array_elements(e.facts->'refunds') x),'[]'::jsonb));
end; $$;
revoke all on function public.get_merch_fee_report_import_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_merch_fee_report_import_context(uuid) to service_role;

create function public.record_merch_fee_report_observation(p_order_id uuid,p_source_observation_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; e private.merch_provider_cost_observations; prior private.commerce_fee_report_observations;
 context jsonb; expected_refunds jsonb; r jsonb; field_name text; rid uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_order_id is null or p_source_observation_id is null or jsonb_typeof(p_evidence) is distinct from 'object'
  or octet_length(p_evidence::text)>2000000 then raise exception 'fee_evidence_invalid'; end if;
 select * into strict o from public.merch_orders where id=p_order_id for update;
 select * into strict e from private.merch_provider_cost_observations where id=p_source_observation_id and order_id=o.id;
 context:=public.get_merch_fee_report_import_context(o.id);
 -- Only the latest current bound source can issue a new observation. The old
 -- archived report still remains immutable when refunds advance the source.
 if context->>'sourceObservationId'<>e.id::text then raise exception 'fee_source_observation_stale'; end if;
 expected_refunds:=context->'refundIds';
 if not coalesce(p_evidence->>'accountId'=context->>'accountId' and p_evidence->>'environment'='test'
  and p_evidence->>'chargeId'=context->>'chargeId' and p_evidence->'refundIds'=expected_refunds
  and o.currency='usd' and p_evidence->>'reportRunId' ~ '^frr_[A-Za-z0-9]+$'
  and p_evidence->>'fileId' ~ '^file_[A-Za-z0-9]+$' and p_evidence->>'contentSha256' ~ '^[0-9a-f]{64}$'
  and p_evidence->>'reportType'='all_fees.incurred_at.itemized.2'
  and p_evidence->>'providerBinding'='authenticated_report'
  and p_evidence->'schemaVersion'='1'::jsonb and p_evidence->>'completeness'='unverified'
  and p_evidence->'financialAuthority'='false'::jsonb and p_evidence->'settlementReady'='false'::jsonb
  and p_evidence->'totalFeeMinor'='null'::jsonb and p_evidence->'taxServiceFeeMinor'='null'::jsonb
  and jsonb_typeof(p_evidence->'rows')='array' and jsonb_array_length(p_evidence->'rows')<=10000
  and p_evidence->'holdReasons'='["fee_report_coverage_unverified","tax_service_fee_unverified"]'::jsonb
  and jsonb_typeof(p_evidence->'intervalStart')='number' and jsonb_typeof(p_evidence->'intervalEnd')='number'
  and p_evidence->>'intervalStart' ~ '^[0-9]{1,12}$' and p_evidence->>'intervalEnd' ~ '^[0-9]{1,12}$'
  and (p_evidence->>'intervalEnd')::bigint>(p_evidence->>'intervalStart')::bigint
  and jsonb_typeof(p_evidence->'reportSucceededAt')='number'
  and p_evidence->>'reportSucceededAt' ~ '^[0-9]{1,12}$',false) then raise exception 'fee_evidence_binding_invalid'; end if;
 if not coalesce(jsonb_typeof(p_evidence->'unattributedRows')='number' and jsonb_typeof(p_evidence->'observedRowCount')='number'
  and p_evidence->>'unattributedRows' ~ '^[0-9]{1,5}$' and p_evidence->>'observedRowCount' ~ '^[0-9]{1,5}$'
  and (p_evidence->>'observedRowCount')::integer<=10000
  and (p_evidence->>'observedRowCount')::integer=jsonb_array_length(p_evidence->'rows')+(p_evidence->>'unattributedRows')::integer,false)
 then raise exception 'fee_evidence_counts_invalid'; end if;
 if exists(select 1 from jsonb_object_keys(p_evidence) k where k not in
  ('schemaVersion','accountId','environment','reportRunId','fileId','reportType','intervalStart','intervalEnd',
   'chargeId','refundIds','rows','unattributedRows','observedRowCount','totalFeeMinor','taxServiceFeeMinor',
   'completeness','financialAuthority','settlementReady','holdReasons','providerBinding','contentSha256','reportSucceededAt'))
 then raise exception 'fee_evidence_fields_invalid'; end if;
 for r in select value from jsonb_array_elements(p_evidence->'rows') loop
  if jsonb_typeof(r) is distinct from 'object' or not coalesce(r->>'currency'='usd'
   and ((r->>'incurredBy'=context->>'chargeId' and r->>'incurredByType'='charge')
    or (expected_refunds ? (r->>'incurredBy') and r->>'incurredByType'='refund'))
   and jsonb_typeof(r->'amountMinor')='number' and r->>'amountMinor' ~ '^-?[0-9]{1,16}$' and abs((r->>'amountMinor')::numeric)<=9007199254740991
   and jsonb_typeof(r->'taxMinor')='number' and r->>'taxMinor' ~ '^-?[0-9]{1,16}$' and abs((r->>'taxMinor')::numeric)<=9007199254740991
   and r->>'settledVia' in('credit','balance','v2_balance','invoice','multiple'),false)
   or exists(select 1 from jsonb_object_keys(r) k where k not in
    ('feeTransactionId','incurredBy','incurredByType','amountMinor','taxMinor','currency','product','suite','featureName','pricingTier','settledVia','balanceTransactionId'))
  then raise exception 'fee_evidence_row_invalid'; end if;
  foreach field_name in array array['feeTransactionId','product','suite','featureName','pricingTier'] loop
   if jsonb_typeof(r->field_name) is distinct from 'string' or length(r->>field_name)>4096
    or (field_name<>'pricingTier' and length(btrim(r->>field_name))=0) then raise exception 'fee_evidence_row_identity_invalid'; end if;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_evidence->'rows') components(component)
  group by component->>'feeTransactionId',component->>'incurredBy',component->>'incurredByType',component->>'currency',component->>'product',component->>'suite',component->>'featureName',component->>'pricingTier',component->>'settledVia'
  having count(*)>1) then raise exception 'fee_evidence_duplicate_component'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fee-report:'||(context->>'accountId')||':test:'||(p_evidence->>'reportRunId'),0));
 if exists(select 1 from private.commerce_fee_report_observations stored where stored.account_id=context->>'accountId'
  and stored.environment='test' and stored.report_run_id=p_evidence->>'reportRunId'
  and (stored.file_id<>p_evidence->>'fileId' or stored.content_sha256<>p_evidence->>'contentSha256'
   or stored.evidence->'intervalStart'<>p_evidence->'intervalStart' or stored.evidence->'intervalEnd'<>p_evidence->'intervalEnd'))
 then raise exception 'fee_report_identity_conflict'; end if;
 select * into prior from private.commerce_fee_report_observations where order_id=o.id and report_run_id=p_evidence->>'reportRunId';
 if prior.id is not null then
  if prior.merch_source_observation_id<>e.id or prior.evidence<>p_evidence then raise exception 'fee_evidence_replay_conflict'; end if;
  return jsonb_build_object('status','duplicate','observationId',prior.id,'financialAuthority',false,'settlementReady',false);
 end if;
 insert into private.commerce_fee_report_observations(order_id,merch_source_observation_id,account_id,environment,report_run_id,file_id,content_sha256,evidence)
 values(o.id,e.id,context->>'accountId','test',p_evidence->>'reportRunId',p_evidence->>'fileId',p_evidence->>'contentSha256',p_evidence) returning id into rid;
 return jsonb_build_object('status','observed_only','observationId',rid,'financialAuthority',false,'settlementReady',false);
end; $$;
revoke all on function public.record_merch_fee_report_observation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_merch_fee_report_observation(uuid,uuid,jsonb) to service_role;

-- Preserve the deployed auction validator, admitting only the additional
-- provider balance identity. The common capture trigger independently validates
-- its shape for both lanes; this does not accept an arbitrary allocation claim.
do $$ declare definition text; old_fragment text:='''pricingTier'',''settledVia''))'; begin
 definition:=pg_get_functiondef('public.record_commerce_fee_report_observation(uuid,uuid,jsonb)'::regprocedure);
 if position(old_fragment in definition)=0 then raise exception 'auction_fee_validator_source_changed'; end if;
 execute replace(definition,old_fragment,'''pricingTier'',''settledVia'',''balanceTransactionId''))');
end $$;

-- A clear accounting read model. Amount and fee tax stay separate until the
-- exact account/report semantics are qualified. No report implies zero fees,
-- a final payable amount, or authority to sum inline + report costs twice.
create function public.get_commerce_fee_component_summary(p_contract_id uuid default null,p_order_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare report_count integer; component_count integer; result jsonb; context jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if (p_contract_id is null)=(p_order_id is null) then raise exception 'fee_identity_required'; end if;
 if p_order_id is not null then context:=public.get_merch_fee_report_import_context(p_order_id);
 else context:=public.get_commerce_fee_report_import_context(p_contract_id); end if;
 select count(*) into report_count from private.commerce_fee_report_observations
  where (contract_id=p_contract_id or order_id=p_order_id);
 with selected as (
  select distinct c.id,c.component from private.commerce_fee_components c
  join private.commerce_fee_component_sources s on s.component_id=c.id
  join private.commerce_fee_report_observations r on r.id=s.report_observation_id
  where (r.contract_id=p_contract_id or r.order_id=p_order_id)
   and c.account_id=context->>'accountId' and c.environment=context->>'environment'
 ), grouped as (
  select component->>'currency' currency,component->>'product' product,component->>'suite' suite,
   sum((component->>'amountMinor')::numeric)::text amount,
   sum((component->>'taxMinor')::numeric)::text tax,count(*) n
  from selected group by 1,2,3
 ) select coalesce(sum(n),0)::integer,coalesce(jsonb_agg(jsonb_build_object('currency',currency,'product',product,'suite',suite,
   'observedAmountMinor',amount,'observedTaxMinor',tax,'componentCount',n) order by currency,product,suite),'[]'::jsonb)
 into component_count,result from grouped;
 return jsonb_build_object('schemaVersion',1,'reportCount',report_count,'componentCount',component_count,'groups',result,
  'sourceObservationId',context->>'sourceObservationId','financialAuthority',false,'settlementReady',false,
  'totalFeeMinor',null,'finalNetMinor',null,
  'holdReasons',array['fee_report_coverage_unverified','fee_amount_tax_semantics_unqualified','late_fee_adjustment_policy_unqualified']);
end; $$;
revoke all on function public.get_commerce_fee_component_summary(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_commerce_fee_component_summary(uuid,uuid) to service_role;
