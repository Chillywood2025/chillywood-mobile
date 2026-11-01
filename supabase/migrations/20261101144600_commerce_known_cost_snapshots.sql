-- Bounded-known-cost evidence is not a claim of final provider fees. These
-- immutable snapshots preserve original cost observations and refund evidence.
create table private.commerce_fee_semantic_qualifications (
 id uuid primary key default gen_random_uuid(), account_id text not null check(account_id ~ '^acct_[A-Za-z0-9]+$'),
 environment text not null check(environment in ('test','live')),
 semantics text not null check(semantics='all_fees.incurred_at.itemized.2:amount_excludes_tax_v1'),
 evidence_reference text not null check(length(btrim(evidence_reference)) between 1 and 500),
 verified_at timestamptz not null, expires_at timestamptz not null check(expires_at>verified_at),
 -- Qualified by independent provider documentation/account verification, never
 -- a switch set by the report importer or a claimed no-row zero fee.
 balance_attribution_verified boolean not null check(balance_attribution_verified)
);
create table private.commerce_known_cost_snapshots (
 id uuid primary key default gen_random_uuid(), source_type text not null check(source_type in ('physical_merch','event_auction','room_auction')),
 source_id uuid not null, source_observation_id uuid not null, creator_id uuid not null,
 acceptance_id uuid not null references private.commerce_creator_fee_acceptances(id),
 qualification_id uuid not null references private.commerce_fee_semantic_qualifications(id),
 account_id text not null, environment text not null check(environment in ('test','live')), currency text not null check(currency='usd'),
 manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 gross_minor bigint not null, tax_minor bigint not null, refunded_minor bigint not null, tax_reversal_minor bigint not null,
 fee_minor bigint not null check(fee_minor>=0), net_minor bigint not null,
 platform_minor bigint not null check(platform_minor>=0),creator_minor bigint not null check(creator_minor>=0),
 recovery_minor bigint not null check(recovery_minor>=0), created_at timestamptz not null default clock_timestamp(),
 unique(source_type,source_id,source_observation_id,manifest_sha256,acceptance_id,qualification_id)
);
do $$ declare t text; begin
 foreach t in array array['commerce_fee_semantic_qualifications','commerce_known_cost_snapshots'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.guard_event_ticket_terms_immutable()',t||'_immutable',t);
 end loop;
end $$;

-- Stable manifest includes every immutable report for the sale, not just the
-- most recently delivered run. Late and out-of-order reports invalidate it.
create function private.commerce_fee_manifest(p_feature text,p_source uuid) returns text
language sql stable set search_path='' as $$
 select encode(extensions.digest(coalesce(string_agg(id::text||':'||content_sha256,',' order by id),''),'sha256'),'hex')
 from private.commerce_fee_report_observations where
 (p_feature='physical_merch' and order_id=p_source) or
 (p_feature in ('event_auction','room_auction') and contract_id=p_source);
$$;
revoke all on function private.commerce_fee_manifest(text,uuid) from public,anon,authenticated,service_role;

create function public.reconcile_commerce_known_costs(p_feature text,p_source_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; c private.auction_platform_settlement_contracts; f jsonb; obs uuid; actor uuid;
 q private.commerce_fee_semantic_qualifications; a private.commerce_creator_fee_acceptances;
 v_account text; mode text; charge_id text; currency text; manifest text; report_count bigint;
 fee bigint; tax bigint; refunded bigint; reversal bigint; gross bigint; net bigint; platform_amount bigint; creator_amount bigint;
 bps integer; r jsonb; x record; inline jsonb; standalone bigint:=0; snapshot private.commerce_known_cost_snapshots;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_feature='physical_merch' then
  select * into strict o from public.merch_orders where id=p_source_id for update;
  select id,facts into obs,f from private.merch_provider_cost_observations where order_id=o.id order by created_at desc,id desc limit 1;
  actor:=o.creator_id; currency:=o.currency; bps:=1000;
 elsif p_feature in ('event_auction','room_auction') then
  select * into strict c from private.auction_platform_settlement_contracts where id=p_source_id for update;
  if c.lane is distinct from (case p_feature when 'event_auction' then 'event' else 'room' end) then raise exception 'fee_lane_mismatch'; end if;
  select id,facts into obs,f from private.auction_settlement_observations where contract_id=c.id order by created_at desc,id desc limit 1;
  actor:=c.creator_id; currency:=c.currency; bps:=2000;
 else raise exception 'fee_feature_invalid'; end if;
 if obs is null then raise exception 'fee_source_observation_required'; end if;
 v_account:=f->>'account_id'; charge_id:=f->>'charge_id';
 mode:=case f->>'environment' when 'sandbox' then 'test' when 'production' then 'live' else f->>'environment' end;
 if currency is distinct from 'usd' or mode not in ('test','live') then raise exception 'fee_currency_mode_unqualified'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fee-components:'||v_account||':'||mode,0));
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||actor::text,0));
 select * into a from private.commerce_creator_fee_acceptances where creator_id=actor
  and policy_version='known_costs_future_unpaid_adjustments_v1'
  and terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex');
 if a.id is null then raise exception 'creator_fee_policy_acceptance_required'; end if;
 select * into q from private.commerce_fee_semantic_qualifications where account_id=v_account
  and environment=mode and verified_at<=clock_timestamp() and expires_at>clock_timestamp() order by verified_at desc,id desc limit 1;
 if q.id is null then raise exception 'fee_semantics_qualification_required'; end if;
 select count(*) into report_count from private.commerce_fee_report_observations e where
  (p_feature='physical_merch' and e.order_id=p_source_id and e.merch_source_observation_id=obs)
  or (p_feature<>'physical_merch' and e.contract_id=p_source_id and e.source_observation_id=obs);
 if report_count=0 then raise exception 'current_fee_report_required'; end if;
 manifest:=private.commerce_fee_manifest(p_feature,p_source_id);
 select * into snapshot from private.commerce_known_cost_snapshots s where source_type=p_feature and source_id=p_source_id
  and source_observation_id=obs and manifest_sha256=manifest and acceptance_id=a.id and qualification_id=q.id;
 if snapshot.id is not null then return to_jsonb(snapshot)||jsonb_build_object('finalFees',false,'futureAdjustmentsPossible',true); end if;
 gross:=(f->>'gross_minor')::bigint; tax:=(f->>'tax_minor')::bigint; refunded:=(f->>'refunded_minor')::bigint;
 reversal:=(f->>'tax_reversal_minor')::bigint; fee:=(f->>'provider_fee_minor')::bigint;
 if gross is null or tax is null or refunded is null or reversal is null or fee is null then raise exception 'fee_source_amount_unknown'; end if;
 if gross<0 or tax<0 or tax>gross or refunded<0 or refunded>gross or reversal<0 or reversal>tax or reversal>refunded
 then raise exception 'fee_source_economics_invalid'; end if;
 inline:=jsonb_build_object(f->>'balance_id',jsonb_build_object('object',charge_id,'fee',fee));
 for r in select value from jsonb_array_elements(f->'refunds') loop
  if inline ? (r->>'balance_id') then raise exception 'fee_inline_duplicate'; end if;
  inline:=inline||jsonb_build_object(r->>'balance_id',jsonb_build_object('object',r->>'id','fee',(r->>'fee')::bigint));
  fee:=fee+(r->>'fee')::bigint;
 end loop;
 for x in
  select component->>'balanceTransactionId' balance_id, min(component->>'incurredBy') object_id,
   count(distinct component->>'incurredBy') objects,
   bool_and(component->>'currency'=currency and component->>'settledVia'='balance'
    and ((component->>'incurredBy'=charge_id and component->>'incurredByType'='charge') or
      (component->>'incurredByType'='refund' and exists(select 1 from jsonb_array_elements(f->'refunds') refund_row where refund_row->>'id'=component->>'incurredBy')))) binding,
   sum((component->>'amountMinor')::bigint+(component->>'taxMinor')::bigint)::bigint amount
  from private.commerce_fee_components k join private.commerce_fee_report_observations e on e.id=k.first_report_observation_id
  where (p_feature='physical_merch' and e.order_id=p_source_id) or (p_feature<>'physical_merch' and e.contract_id=p_source_id)
  group by component->>'balanceTransactionId'
 loop
  if x.balance_id is null or x.balance_id !~ '^txn_[A-Za-z0-9]+$' or x.objects<>1 or x.binding is distinct from true
  then raise exception 'fee_component_attribution_unqualified'; end if;
  if inline ? x.balance_id then
   if inline->x.balance_id->>'object' is distinct from x.object_id or (inline->x.balance_id->>'fee')::bigint is distinct from x.amount
   then raise exception 'fee_inline_overlap_unreconciled'; end if;
  else standalone:=standalone+x.amount; end if;
 end loop;
 fee:=fee+standalone;
 if p_feature<>'physical_merch' then
  if f->>'store_fee_minor' is null then raise exception 'store_obligation_unverified'; end if;
  if (f->>'store_fee_minor')::bigint<0 then raise exception 'store_fee_invalid'; end if;
  fee:=fee+(f->>'store_fee_minor')::bigint;
 end if;
 if fee<0 then raise exception 'fee_overcredit_review_required'; end if;
 net:=gross-tax-refunded+reversal-fee; platform_amount:=floor(greatest(net,0)::numeric*bps/10000)::bigint;
 creator_amount:=greatest(net,0)-platform_amount;
 insert into private.commerce_known_cost_snapshots(source_type,source_id,source_observation_id,creator_id,acceptance_id,qualification_id,
  account_id,environment,currency,manifest_sha256,gross_minor,tax_minor,refunded_minor,tax_reversal_minor,fee_minor,net_minor,platform_minor,creator_minor,recovery_minor)
 values(p_feature,p_source_id,obs,actor,a.id,q.id,v_account,mode,currency,manifest,gross,tax,refunded,reversal,fee,net,platform_amount,creator_amount,greatest(-net,0)) returning * into snapshot;
 return to_jsonb(snapshot)||jsonb_build_object('finalFees',false,'futureAdjustmentsPossible',true);
end; $$;
revoke all on function public.reconcile_commerce_known_costs(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_commerce_known_costs(text,uuid) to service_role;

alter table private.merch_held_net_allocations add column fee_snapshot_id uuid unique references private.commerce_known_cost_snapshots(id);
alter table private.auction_held_net_allocations add column fee_snapshot_id uuid unique references private.commerce_known_cost_snapshots(id);
alter table private.merch_held_net_allocations drop constraint merch_held_net_allocations_observation_id_key;
alter table private.auction_held_net_allocations drop constraint auction_held_net_allocations_observation_id_key;
create unique index merch_original_cost_allocation on private.merch_held_net_allocations(observation_id) where fee_snapshot_id is null;
create unique index auction_original_cost_allocation on private.auction_held_net_allocations(observation_id) where fee_snapshot_id is null;

create or replace function private.hold_unverified_commerce_tax_fee() returns trigger
language plpgsql set search_path='' as $$
declare s private.commerce_known_cost_snapshots;
begin
 if new.fee_snapshot_id is not null then
  select * into strict s from private.commerce_known_cost_snapshots where id=new.fee_snapshot_id;
  if s.source_observation_id is distinct from new.observation_id or s.net_minor is distinct from new.net_minor
   or s.platform_minor is distinct from new.platform_minor or s.creator_minor is distinct from new.creator_minor
   or s.recovery_minor is distinct from new.recovery_obligation_minor
   or (tg_table_name='merch_held_net_allocations' and (s.source_type<>'physical_merch' or s.source_id<>(to_jsonb(new)->>'order_id')::uuid))
   or (tg_table_name='auction_held_net_allocations' and (s.source_type='physical_merch' or s.source_id<>(to_jsonb(new)->>'contract_id')::uuid))
  then raise exception 'fee_snapshot_allocation_mismatch'; end if;
 else
  if not ('tax_service_fee_unverified'=any(new.hold_reasons)) then
   new.hold_reasons:=array_append(new.hold_reasons,'tax_service_fee_unverified'); end if;
 end if;
 return new;
end; $$;

create function private.append_known_cost_allocation() returns trigger
language plpgsql set search_path='' as $$
declare m private.merch_held_net_allocations; a private.auction_held_net_allocations; holds text[];
begin
 if new.source_type='physical_merch' then
  select * into strict m from private.merch_held_net_allocations where order_id=new.source_id order by id desc limit 1;
  holds:=array(select h from unnest(m.hold_reasons) h where h not in ('tax_service_fee_unverified','adjustments_unqualified'));
  insert into private.merch_held_net_allocations(observation_id,order_id,policy_version,net_minor,platform_minor,creator_minor,
   platform_delta_minor,creator_delta_minor,recovery_obligation_minor,hold_reasons,fee_snapshot_id)
  values(new.source_observation_id,new.source_id,m.policy_version,new.net_minor,new.platform_minor,new.creator_minor,
   new.platform_minor-m.platform_minor,new.creator_minor-m.creator_minor,new.recovery_minor,holds,new.id);
 else
  select * into strict a from private.auction_held_net_allocations where contract_id=new.source_id order by id desc limit 1;
  holds:=array(select h from unnest(a.hold_reasons) h where h not in ('tax_service_fee_unverified','adjustments_unqualified'));
  insert into private.auction_held_net_allocations(observation_id,contract_id,net_minor,platform_minor,creator_minor,recovery_obligation_minor,hold_reasons,fee_snapshot_id)
  values(new.source_observation_id,new.source_id,new.net_minor,new.platform_minor,new.creator_minor,new.recovery_minor,holds,new.id);
 end if;
 return new;
end; $$;
revoke all on function private.append_known_cost_allocation() from public,anon,authenticated,service_role;
create trigger commerce_known_cost_allocation after insert on private.commerce_known_cost_snapshots
 for each row execute function private.append_known_cost_allocation();

create or replace function private.commerce_tax_fee_settlement_ready(p_feature text,p_identity_id uuid) returns boolean
language plpgsql stable set search_path='' as $$
declare source uuid; obs uuid; snapshot_id uuid; s private.commerce_known_cost_snapshots;
begin
 if p_feature='physical_merch' then
  source:=p_identity_id;
  select id into obs from private.merch_provider_cost_observations where order_id=source order by created_at desc,id desc limit 1;
  select fee_snapshot_id into snapshot_id from private.merch_held_net_allocations where order_id=source order by id desc limit 1;
 elsif p_feature in ('event_auction','room_auction') then
  select id into source from private.auction_platform_settlement_contracts where quote_id=p_identity_id
   and lane=case p_feature when 'event_auction' then 'event' else 'room' end;
  select id into obs from private.auction_settlement_observations where contract_id=source order by created_at desc,id desc limit 1;
  select fee_snapshot_id into snapshot_id from private.auction_held_net_allocations where contract_id=source order by id desc limit 1;
 else return false; end if;
 select * into s from private.commerce_known_cost_snapshots where id=snapshot_id;
 return coalesce(s.id is not null and s.source_type=p_feature and s.source_id=source and s.source_observation_id=obs
  and s.manifest_sha256=private.commerce_fee_manifest(p_feature,source)
  and exists(select 1 from private.commerce_fee_semantic_qualifications q where q.id=s.qualification_id and q.account_id=s.account_id
   and q.environment=s.environment and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp())
  and exists(select 1 from private.commerce_creator_fee_acceptances a where a.id=s.acceptance_id and a.creator_id=s.creator_id
   and a.terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex')),false);
end; $$;
