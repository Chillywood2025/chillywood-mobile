-- Observations only. The trusted ingest service authenticates provider GETs;
-- a digest is integrity metadata, not proof of provider authenticity. No fee
-- completeness, payable balance, transfer or tax-readiness authority is issued.
create table private.commerce_fee_report_observations (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references private.auction_platform_settlement_contracts(id),
 source_observation_id uuid not null references private.auction_settlement_observations(id),
 account_id text not null, environment text not null check(environment in('test','live')),
 report_run_id text not null, file_id text not null, content_sha256 text not null,
 evidence jsonb not null,
 financial_authority boolean not null default false check(not financial_authority),
 created_at timestamptz not null default clock_timestamp(),
 unique(contract_id,report_run_id)
);
create index commerce_fee_report_provider_identity on private.commerce_fee_report_observations(account_id,environment,report_run_id);
alter table private.commerce_fee_report_observations enable row level security;
alter table private.commerce_fee_report_observations force row level security;
revoke all on private.commerce_fee_report_observations from public,anon,authenticated,service_role;
create trigger commerce_fee_report_append_only before update or delete on private.commerce_fee_report_observations
 for each row execute function private.guard_event_ticket_terms_immutable();

create function public.get_commerce_fee_report_import_context(p_contract_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts; o private.auction_settlement_observations;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 select * into o from private.auction_settlement_observations where contract_id=c.id order by created_at desc,id desc limit 1;
 if o.id is null or o.facts->>'account_id' is distinct from c.platform_account_id
  or o.facts->>'environment' is distinct from c.environment or o.facts->>'currency' is distinct from c.currency
  or not coalesce(o.facts->>'charge_id' ~ '^ch_[A-Za-z0-9]+$',false) then raise exception 'fee_source_observation_required'; end if;
 return jsonb_build_object('contractId',c.id,'sourceObservationId',o.id,'accountId',c.platform_account_id,
  'environment',c.environment,'currency',c.currency,'chargeId',o.facts->>'charge_id',
  'refundIds',coalesce((select jsonb_agg(x->>'id' order by x->>'id') from jsonb_array_elements(o.facts->'refunds') x),'[]'::jsonb));
end;
$$;
revoke all on function public.get_commerce_fee_report_import_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_commerce_fee_report_import_context(uuid) to service_role;

create function public.record_commerce_fee_report_observation(p_contract_id uuid,p_source_observation_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts; o private.auction_settlement_observations;
 prior private.commerce_fee_report_observations; rid uuid; r jsonb; expected_refunds jsonb; field_name text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_contract_id is null or p_source_observation_id is null or jsonb_typeof(p_evidence) is distinct from 'object'
  or octet_length(p_evidence::text)>2000000 then raise exception 'fee_evidence_invalid'; end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id for update;
 select * into strict o from private.auction_settlement_observations where id=p_source_observation_id and contract_id=c.id;
 select coalesce(jsonb_agg(x->>'id' order by x->>'id'),'[]'::jsonb) into expected_refunds from jsonb_array_elements(o.facts->'refunds') x;
 if not coalesce(p_evidence->>'accountId'=c.platform_account_id and p_evidence->>'environment'=c.environment
  and p_evidence->>'chargeId'=o.facts->>'charge_id' and p_evidence->'refundIds'=expected_refunds
  and o.facts->>'account_id'=c.platform_account_id and o.facts->>'environment'=c.environment
  and o.facts->>'currency'=c.currency and c.currency='usd'
  and p_evidence->>'reportRunId' ~ '^frr_[A-Za-z0-9]+$' and p_evidence->>'fileId' ~ '^file_[A-Za-z0-9]+$'
  and p_evidence->>'contentSha256' ~ '^[0-9a-f]{64}$'
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
 -- Explicit projection whitelist: no raw CSV, URLs, secrets, customer payloads
 -- or caller-defined certification may be smuggled into this private archive.
 if exists(select 1 from jsonb_object_keys(p_evidence) k where k not in
  ('schemaVersion','accountId','environment','reportRunId','fileId','reportType','intervalStart','intervalEnd',
   'chargeId','refundIds','rows','unattributedRows','observedRowCount','totalFeeMinor','taxServiceFeeMinor',
   'completeness','financialAuthority','settlementReady','holdReasons','providerBinding','contentSha256','reportSucceededAt'))
 then raise exception 'fee_evidence_fields_invalid'; end if;
 for r in select value from jsonb_array_elements(p_evidence->'rows') loop
  if jsonb_typeof(r) is distinct from 'object' or not coalesce(r->>'currency'='usd'
   and ((r->>'incurredBy'=o.facts->>'charge_id' and r->>'incurredByType'='charge')
    or (expected_refunds ? (r->>'incurredBy') and r->>'incurredByType'='refund'))
   and jsonb_typeof(r->'amountMinor')='number' and r->>'amountMinor' ~ '^-?[0-9]{1,16}$' and abs((r->>'amountMinor')::numeric)<=9007199254740991
   and jsonb_typeof(r->'taxMinor')='number' and r->>'taxMinor' ~ '^-?[0-9]{1,16}$' and abs((r->>'taxMinor')::numeric)<=9007199254740991
   and r->>'settledVia' in('credit','balance','v2_balance','invoice','multiple'),false)
   or exists(select 1 from jsonb_object_keys(r) k where k not in
    ('feeTransactionId','incurredBy','incurredByType','amountMinor','taxMinor','currency','product','suite','featureName','pricingTier','settledVia'))
  then raise exception 'fee_evidence_row_invalid'; end if;
  foreach field_name in array array['feeTransactionId','product','suite','featureName','pricingTier'] loop
   if jsonb_typeof(r->field_name) is distinct from 'string' or length(r->>field_name)>4096
    or (field_name<>'pricingTier' and length(btrim(r->>field_name))=0) then raise exception 'fee_evidence_row_identity_invalid'; end if;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_evidence->'rows') components(component)
  group by component->>'feeTransactionId',component->>'incurredBy',component->>'incurredByType',component->>'currency',component->>'product',component->>'suite',component->>'featureName',component->>'pricingTier',component->>'settledVia'
  having count(*)>1) then raise exception 'fee_evidence_duplicate_component'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fee-report:'||c.platform_account_id||':'||c.environment||':'||(p_evidence->>'reportRunId'),0));
 if exists(select 1 from private.commerce_fee_report_observations stored where stored.account_id=c.platform_account_id
  and stored.environment=c.environment and stored.report_run_id=p_evidence->>'reportRunId'
  and (stored.file_id<>p_evidence->>'fileId' or stored.content_sha256<>p_evidence->>'contentSha256'
   or stored.evidence->'intervalStart'<>p_evidence->'intervalStart' or stored.evidence->'intervalEnd'<>p_evidence->'intervalEnd'))
 then raise exception 'fee_report_identity_conflict'; end if;
 select * into prior from private.commerce_fee_report_observations where contract_id=c.id and report_run_id=p_evidence->>'reportRunId';
 if prior.id is not null then
  if prior.source_observation_id<>o.id or prior.evidence<>p_evidence then raise exception 'fee_evidence_replay_conflict'; end if;
  return jsonb_build_object('status','duplicate','observationId',prior.id,'financialAuthority',false,'settlementReady',false);
 end if;
 insert into private.commerce_fee_report_observations(contract_id,source_observation_id,account_id,environment,report_run_id,file_id,content_sha256,evidence)
 values(c.id,o.id,c.platform_account_id,c.environment,p_evidence->>'reportRunId',p_evidence->>'fileId',p_evidence->>'contentSha256',p_evidence) returning id into rid;
 return jsonb_build_object('status','observed_only','observationId',rid,'financialAuthority',false,'settlementReady',false);
end;
$$;
revoke all on function public.record_commerce_fee_report_observation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_commerce_fee_report_observation(uuid,uuid,jsonb) to service_role;
