-- Prospective proof, never a backfill inferred from missing provider events.
-- A canceled funding correction is dormant until separately qualified. There
-- is no path from an ambiguous payout dispatch to this return lane.
alter table private.creator_cashout_provider_qualifications
 add column funding_correction_return_verified boolean not null default false,
 add column funding_fee_attribution_verified boolean not null default false;
alter table private.creator_cashout_executions drop constraint creator_cashout_executions_phase_check;
alter table private.creator_cashout_executions add constraint creator_cashout_executions_phase_check check(phase in
 ('prepared','canceled','funding_unknown','funded','payout_unknown','payout_pending','paid','return_pending','return_confirmed',
  'reversal_unknown','returned','needs_review','funding_return_pending','funding_return_unknown'));
create table private.creator_cashout_dispatch_provenance(
 execution_id uuid not null references private.creator_cashout_executions(id),
 event text not null check(event in ('created_before_dispatch','payout_started','funding_return_started')),
 created_at timestamptz not null default clock_timestamp(),primary key(execution_id,event)
);
create table private.creator_cashout_funding_cancellations(
 execution_id uuid primary key references private.creator_cashout_executions(id),
 creator_id uuid not null references auth.users(id),
 reason text not null check(reason in ('creator_canceled','source_domain_held')),
 transfer_id text not null check(transfer_id ~ '^tr_[A-Za-z0-9]+$'),
 created_at timestamptz not null default clock_timestamp()
);
create table private.creator_cashout_funding_return_evidence(
 execution_id uuid primary key references private.creator_cashout_executions(id),
 reversal_id text not null unique check(reversal_id ~ '^trr_[A-Za-z0-9]+$'),
 transaction_id text not null unique check(transaction_id ~ '^txn_[A-Za-z0-9]+$'),
 facts jsonb not null,observed_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['creator_cashout_dispatch_provenance','creator_cashout_funding_cancellations','creator_cashout_funding_return_evidence'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger immutable before update or delete on private.%I for each row execute function private.guard_event_ticket_terms_immutable()',t);
 end loop;
end $$;

-- Read-only Owner diagnostics use the existing exact-session Owner guard. No
-- provider IDs/credentials or retry buttons are exposed by this projection.
alter function public.get_owner_commerce_fee_accounting_health() rename to get_owner_commerce_fee_accounting_health_before_funding_returns;
revoke all on function public.get_owner_commerce_fee_accounting_health_before_funding_returns() from public,anon,authenticated,service_role;
create function public.get_owner_commerce_fee_accounting_health() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;holds jsonb;
begin
 result:=public.get_owner_commerce_fee_accounting_health_before_funding_returns();
 select coalesce(jsonb_agg(to_jsonb(h) order by h.updated_at,h.request_id),'[]'::jsonb) into holds from
  (select e.request_id,e.phase,e.updated_at,case e.phase
    when 'funding_return_pending' then 'verify_correction_qualification_and_switches'
    when 'funding_return_unknown' then 'get_only_exact_return_reconciliation_no_redispatch'
    else 'verify_returned_principal_and_funding_fee_evidence' end as required_action
   from private.creator_cashout_executions e join private.creator_cashout_funding_cancellations c on c.execution_id=e.id
   where e.returned_accounted_at is null order by e.updated_at,e.request_id limit 50) h;
 return result||jsonb_build_object('fundingReturnHolds',holds,'fundingReturnHoldCount',
  (select count(*) from private.creator_cashout_executions e join private.creator_cashout_funding_cancellations c on c.execution_id=e.id where e.returned_accounted_at is null));
end $$;
revoke all on function public.get_owner_commerce_fee_accounting_health() from public,anon,authenticated,service_role;
grant execute on function public.get_owner_commerce_fee_accounting_health() to authenticated;
create function private.track_cashout_dispatch_provenance() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.phase='prepared' and new.dispatched_at is null and new.payout_id is null and new.transfer_id is null then
   insert into private.creator_cashout_dispatch_provenance values(new.id,'created_before_dispatch',clock_timestamp());
  end if;
 elsif new.phase='payout_unknown' and old.phase is distinct from new.phase then
  if exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=new.id)
   then raise exception 'cashout_bank_dispatch_permanently_frozen'; end if;
  insert into private.creator_cashout_dispatch_provenance values(new.id,'payout_started',clock_timestamp());
 elsif new.phase='funding_return_unknown' and old.phase is distinct from new.phase then
  insert into private.creator_cashout_dispatch_provenance values(new.id,'funding_return_started',clock_timestamp());
 end if;
 return new;
end $$;
revoke all on function private.track_cashout_dispatch_provenance() from public,anon,authenticated,service_role;
create trigger creator_cashout_dispatch_provenance after insert or update on private.creator_cashout_executions
 for each row execute function private.track_cashout_dispatch_provenance();
create function private.cashout_bank_never_dispatched(p_execution uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from private.creator_cashout_dispatch_provenance where execution_id=p_execution and event='created_before_dispatch')
 and not exists(select 1 from private.creator_cashout_dispatch_provenance where execution_id=p_execution and event='payout_started');
$$;
revoke all on function private.cashout_bank_never_dispatched(uuid) from public,anon,authenticated,service_role;

-- Caller acquires source domains, then creator, then execution. No provider call.
create function private.freeze_funded_cashout(p_request uuid,p_reason text) returns void language plpgsql set search_path='' as $$
declare e private.creator_cashout_executions;
begin
 select * into strict e from private.creator_cashout_executions where request_id=p_request for update;
 if exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=e.id) then return; end if;
 if e.phase<>'funded' or e.transfer_id is null or e.payout_id is not null or not private.cashout_bank_never_dispatched(e.id)
  then raise exception 'cashout_no_bank_dispatch_proof_required'; end if;
 insert into private.creator_cashout_funding_cancellations(execution_id,creator_id,reason,transfer_id)
 values(e.id,e.creator_id,p_reason,e.transfer_id);
 update private.creator_cashout_executions set phase='funding_return_pending',updated_at=clock_timestamp() where id=e.id;
end $$;
revoke all on function private.freeze_funded_cashout(uuid,text) from public,anon,authenticated,service_role;
alter function public.cancel_undispatched_creator_cashout(uuid) rename to cancel_prepared_creator_cashout;
revoke all on function public.cancel_prepared_creator_cashout(uuid) from public,anon,authenticated,service_role;
create function public.cancel_undispatched_creator_cashout(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.creator_cashout_executions;r public.creator_payout_requests;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'current_session_required'; end if;
 select * into r from public.creator_payout_requests where id=p_request_id and creator_id=auth.uid();
 if r.id is null then raise exception 'cashout_request_not_found'; end if;
 perform private.lock_commerce_cashout_domains(r.id);
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||r.creator_id::text,0));
 select * into strict e from private.creator_cashout_executions where request_id=r.id for update;
 if e.phase in ('prepared','canceled') then return public.cancel_prepared_creator_cashout(r.id); end if;
 perform private.freeze_funded_cashout(r.id,'creator_canceled');
 return public.get_my_creator_cashout_execution(r.id);
end $$;
revoke all on function public.cancel_undispatched_creator_cashout(uuid) from public,anon,authenticated,service_role;
grant execute on function public.cancel_undispatched_creator_cashout(uuid) to authenticated;

alter function public.claim_creator_cashout_dispatch(uuid,text) rename to claim_creator_cashout_dispatch_before_funding_return;
revoke all on function public.claim_creator_cashout_dispatch_before_funding_return(uuid,text) from public,anon,authenticated,service_role;
create function public.claim_creator_cashout_dispatch(p_request_id uuid,p_stage text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.creator_cashout_executions;r public.creator_payout_requests;q private.creator_cashout_provider_qualifications;
 token uuid:=gen_random_uuid();switch text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform private.lock_commerce_cashout_domains(p_request_id);
 select * into strict r from public.creator_payout_requests where id=p_request_id;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||r.creator_id::text,0));
 select * into strict e from private.creator_cashout_executions where request_id=r.id for update;
 if p_stage='payout' and e.phase='funded' and private.cashout_bank_never_dispatched(e.id)
  and exists(select 1 from public.creator_payout_allocations a where a.payout_request_id=r.id
   and not private.commerce_current_earning_domain_ready(a.earnings_ledger_id)) then
  perform private.freeze_funded_cashout(r.id,'source_domain_held');
  return jsonb_build_object('claimed',false,'status','funding_return_pending');
 end if;
 if p_stage<>'funding_return' then return public.claim_creator_cashout_dispatch_before_funding_return(p_request_id,p_stage); end if;
 if e.phase<>'funding_return_pending' then return jsonb_build_object('claimed',false); end if;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 if not q.funding_correction_return_verified or not q.exclusive_writer_verified
  or q.expires_at<=clock_timestamp() or exists(select 1 from private.creator_cashout_qualification_revocations where qualification_id=q.id)
  or not private.cashout_bank_never_dispatched(e.id) or e.payout_id is not null
  or not exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=e.id and transfer_id=e.transfer_id)
  then raise exception 'cashout_funding_return_qualification_required'; end if;
 foreach switch in array array['live_money_enabled','payouts_enabled','stripe_connect_enabled'] loop
  perform 1 from public.platform_money_kill_switches where key=switch and state='on' for share;
  if not found then raise exception 'payout_execution_disabled'; end if;
 end loop;
 update private.creator_cashout_executions set phase='funding_return_unknown',dispatch_token=token,
  dispatched_at=clock_timestamp(),updated_at=clock_timestamp() where id=e.id;
 return jsonb_build_object('claimed',true,'token',token);
end $$;
revoke all on function public.claim_creator_cashout_dispatch(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_creator_cashout_dispatch(uuid,text) to service_role;

-- Existing bank-return accounting may consume this distinct, exact platform
-- receipt. Never populate a fictitious bank-return transaction for this lane.
do $$ declare d text; anchor text; begin
 d:=pg_get_functiondef('private.finalize_creator_cashout_accounting(uuid)'::regprocedure);
 anchor:='if e.observed_provider_fee_minor is null then return; end if;';
 if position(anchor in d)=0 then raise exception 'funding_return_finalize_anchor_missing'; end if;
 d:=replace(d,anchor,anchor||' if exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=e.id)
  and e.cost_basis is distinct from ''known_funding_costs'' then return; end if;');
 anchor:='if e.bank_return_minor<>e.bank_minor or e.bank_return_transaction_id is null or e.transfer_id is null then raise exception ''cashout_return_evidence_required''; end if;';
 if position(anchor in d)=0 then raise exception 'funding_return_receipt_anchor_missing'; end if;
 d:=replace(d,anchor,'if not exists(select 1 from private.creator_cashout_funding_return_evidence where execution_id=e.id)
  and (e.bank_return_minor<>e.bank_minor or e.bank_return_transaction_id is null or e.transfer_id is null)
  then raise exception ''cashout_return_evidence_required''; end if;');
 execute d;
end $$;
alter table private.creator_cashout_executions drop constraint creator_cashout_executions_cost_basis_check;
alter table private.creator_cashout_executions add constraint creator_cashout_executions_cost_basis_check
 check(cost_basis in ('known_inline_zero','known_report_components','known_funding_costs'));

create function private.finalize_funding_return_costs(p_execution uuid) returns void language plpgsql set search_path='' as $$
declare e private.creator_cashout_executions;q private.creator_cashout_provider_qualifications;facts jsonb;bt jsonb;
 total bigint:=0;reported bigint;inline_fee bigint;component record;
begin
 select * into strict e from private.creator_cashout_executions where id=p_execution for update;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 select x.facts into facts from private.creator_cashout_funding_return_evidence x where execution_id=e.id;
 if facts is null or not q.funding_fee_attribution_verified or not private.creator_cashout_fee_coverage_current(q.id)
  or not exists(select 1 from private.creator_cashout_fee_reports where execution_id=e.id)
  or not exists(select 1 from private.commerce_creator_fee_acceptances where creator_id=e.creator_id
    and policy_version='known_costs_future_unpaid_adjustments_v1'
    and terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex')) then return; end if;
 -- Exact observed inline fees count once. A report may repeat that component,
 -- but its sum must match the authenticated balance fee; never double charge.
 for bt in select value from jsonb_array_elements(jsonb_build_array(facts->'fundingBalance',facts->'returnBalance')) loop
  inline_fee:=(bt->>'feeMinor')::bigint;
  select sum(fc.amount_minor) into reported from private.creator_cashout_fee_components fc
   where fc.execution_id=e.id and fc.component->>'balanceTransactionId'=bt->>'transactionId';
  if reported is not null and reported<>inline_fee then raise exception 'cashout_funding_inline_fee_conflict'; end if;
  total:=total+inline_fee;
 end loop;
 for component in select * from private.creator_cashout_fee_components where execution_id=e.id loop
  if coalesce(component.component->>'settledVia','') not in ('balance','v2_balance')
    or not coalesce(component.component->>'balanceTransactionId' ~ '^txn_[A-Za-z0-9]+$',false)
   then raise exception 'cashout_funding_fee_attribution_incomplete'; end if;
  if component.component->>'balanceTransactionId' not in
    (facts->'fundingBalance'->>'transactionId',facts->'returnBalance'->>'transactionId') then total:=total+component.amount_minor; end if;
 end loop;
 if total<0 or total>2147483647 or (e.returned_accounted_at is null and total>e.gross_minor)
  then raise exception 'cashout_funding_cost_out_of_bounds'; end if;
 update private.creator_cashout_executions set observed_provider_fee_minor=total,cost_basis='known_funding_costs',phase='returned' where id=e.id;
 if e.returned_accounted_at is not null then perform private.record_creator_cashout_late_fee_delta(e.id); end if;
 perform private.finalize_creator_cashout_accounting(e.id);
end $$;
revoke all on function private.finalize_funding_return_costs(uuid) from public,anon,authenticated,service_role;

alter function public.record_creator_cashout_observation(uuid,uuid,jsonb) rename to record_creator_cashout_observation_before_funding_return;
revoke all on function public.record_creator_cashout_observation_before_funding_return(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.record_creator_cashout_observation(p_request_id uuid,p_dispatch_token uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.creator_cashout_executions;q private.creator_cashout_provider_qualifications;bt jsonb;prior jsonb;index integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_facts->>'kind' is distinct from 'funding_return' then
  return public.record_creator_cashout_observation_before_funding_return(p_request_id,p_dispatch_token,p_facts); end if;
 select * into strict e from private.creator_cashout_executions where request_id=p_request_id;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||e.creator_id::text,0));
 select * into strict e from private.creator_cashout_executions where request_id=p_request_id for update;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 if p_dispatch_token is not null and p_dispatch_token is distinct from e.dispatch_token then raise exception 'cashout_stale_dispatch_token'; end if;
 if e.phase not in ('funding_return_unknown','returned') or not private.cashout_bank_never_dispatched(e.id)
  or e.payout_id is not null or not exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=e.id)
  or not exists(select 1 from private.creator_cashout_dispatch_provenance where execution_id=e.id and event='funding_return_started')
  or jsonb_typeof(p_facts) is distinct from 'object' or octet_length(p_facts::text)>4096
  or p_facts->>'transferId' is distinct from e.transfer_id or p_facts->>'accountId' is distinct from q.account_id
  or p_facts->>'platformAccountId' is distinct from q.platform_account_id or p_facts->>'environment' is distinct from q.environment
  or p_facts->'amountMinor' is distinct from to_jsonb(e.bank_minor)
  or not coalesce(p_facts->>'objectId' ~ '^trr_[A-Za-z0-9]+$',false)
  then raise exception 'cashout_funding_return_binding_invalid'; end if;
 for bt in select value from jsonb_array_elements(jsonb_build_array(p_facts->'fundingBalance',p_facts->'returnBalance')) loop
  index:=index+1;
  if jsonb_typeof(bt) is distinct from 'object' or not coalesce(bt->>'transactionId' ~ '^txn_[A-Za-z0-9]+$',false)
   or bt->>'sourceId' is distinct from (case when index=1 then e.transfer_id else p_facts->>'objectId' end)
   or bt->'amountMinor' is distinct from to_jsonb(case when index=1 then -e.bank_minor else e.bank_minor end)
   or bt->>'currency' is distinct from 'usd' or bt->>'status' is distinct from 'available'
   or jsonb_typeof(bt->'feeMinor') is distinct from 'number' or not coalesce(bt->>'feeMinor' ~ '^-?[0-9]{1,10}$',false)
   or abs((bt->>'feeMinor')::bigint)>2147483647
   or bt->'netMinor' is distinct from to_jsonb((bt->>'amountMinor')::bigint-(bt->>'feeMinor')::bigint)
   or (index=1 and bt->>'type' is distinct from 'transfer')
   or (index=2 and coalesce(bt->>'type','') not in ('transfer_refund','transfer_cancel'))
   then raise exception 'cashout_funding_return_balance_invalid'; end if;
 end loop;
 if p_facts->'fundingBalance'->>'transactionId'=p_facts->'returnBalance'->>'transactionId' then raise exception 'cashout_funding_return_balance_invalid'; end if;
 select x.facts into prior from private.creator_cashout_funding_return_evidence x where execution_id=e.id;
 if prior is not null and prior<>p_facts then raise exception 'cashout_funding_return_evidence_conflict'; end if;
 insert into private.creator_cashout_funding_return_evidence(execution_id,reversal_id,transaction_id,facts)
 values(e.id,p_facts->>'objectId',p_facts->'returnBalance'->>'transactionId',p_facts) on conflict do nothing;
 update private.creator_cashout_executions set phase='returned',reversal_id=p_facts->>'objectId',updated_at=clock_timestamp() where id=e.id;
 perform private.finalize_funding_return_costs(e.id);
 return jsonb_build_object('status','returned','bankPaid',false,'fundsReleased',
  (select returned_accounted_at is not null from private.creator_cashout_executions where id=e.id));
end $$;
revoke all on function public.record_creator_cashout_observation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_creator_cashout_observation(uuid,uuid,jsonb) to service_role;

-- Reuse strict immutable report/component ingestion, with a distinct transfer
-- binding only when explicit cancellation provenance exists. No payout alias.
do $$ declare d text;anchor text; begin
 d:=pg_get_functiondef('public.record_creator_cashout_fee_report_components(uuid,jsonb)'::regprocedure);
 anchor:='or e.payout_id is null or p_evidence->>''payoutId'' is distinct from e.payout_id';
 if position(anchor in d)=0 then raise exception 'funding_report_binding_anchor_missing'; end if;
 d:=replace(d,anchor,'or (case when exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=e.id)
  then e.payout_id is not null or p_evidence ? ''payoutId'' or p_evidence->>''transferId'' is distinct from e.transfer_id
  else e.payout_id is null or p_evidence ? ''transferId'' or p_evidence->>''payoutId'' is distinct from e.payout_id end)');
 d:=replace(d,'''intervalEnd'',''payoutId''','''intervalEnd'',''payoutId'',''transferId''');
 anchor:='if row->>''incurredBy'' is distinct from e.payout_id or row->>''incurredByType'' is distinct from ''payout''';
 if position(anchor in d)=0 then raise exception 'funding_report_component_anchor_missing'; end if;
 d:=replace(d,anchor,'if (case when exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=e.id)
  then row->>''incurredBy'' is distinct from e.transfer_id or row->>''incurredByType'' is distinct from ''transfer''
  else row->>''incurredBy'' is distinct from e.payout_id or row->>''incurredByType'' is distinct from ''payout'' end)');
 -- This lane computes inline/report dedup before any release or adjustment.
 anchor:='if private.creator_cashout_fee_coverage_current(q.id)';
 if position(anchor in d)=0 then raise exception 'funding_report_cost_anchor_missing'; end if;
 d:=replace(d,anchor,'if not exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=e.id)
  and private.creator_cashout_fee_coverage_current(q.id)');
 execute d;
 d:=pg_get_functiondef('private.record_creator_cashout_late_fee_delta(uuid)'::regprocedure);
 anchor:='if total is null and e.cost_basis=''known_inline_zero'' then return; end if;';
 if position(anchor in d)=0 then raise exception 'funding_adjustment_anchor_missing'; end if;
 d:=replace(d,anchor,'if e.cost_basis=''known_funding_costs'' then
  total:=e.observed_provider_fee_minor;
  select encode(extensions.digest(convert_to(jsonb_build_object(''receipt'',x.facts,''components'',
   (select jsonb_agg(component order by component_key) from private.creator_cashout_fee_components where execution_id=e.id))::text,''UTF8''),''sha256''),''hex'')
   into evidence from private.creator_cashout_funding_return_evidence x where execution_id=e.id;
 end if; '||anchor);
 execute d;
end $$;
alter function public.record_creator_cashout_fee_report(uuid,jsonb) rename to record_creator_cashout_fee_report_before_funding_return;
revoke all on function public.record_creator_cashout_fee_report_before_funding_return(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.record_creator_cashout_fee_report(p_request_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.creator_cashout_executions;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict e from private.creator_cashout_executions where request_id=p_request_id;
 if not exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=e.id) then
  return public.record_creator_cashout_fee_report_before_funding_return(p_request_id,p_evidence); end if;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||e.creator_id::text,0));
 perform public.record_creator_cashout_fee_report_components(p_request_id,p_evidence);
 perform private.finalize_funding_return_costs(e.id);
 select * into strict e from private.creator_cashout_executions where id=e.id;
 return jsonb_build_object('status',e.phase,'observedProviderFeeMinor',e.observed_provider_fee_minor,'costBasis',e.cost_basis,
  'costsMayChange',true,'accountingComplete',e.returned_accounted_at is not null,'bankPaid',false);
end $$;
revoke all on function public.record_creator_cashout_fee_report(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_creator_cashout_fee_report(uuid,jsonb) to service_role;
alter function public.get_creator_cashout_fee_import_context(uuid) rename to get_creator_cashout_payout_fee_import_context;
revoke all on function public.get_creator_cashout_payout_fee_import_context(uuid) from public,anon,authenticated,service_role;
create function public.get_creator_cashout_fee_import_context(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.creator_cashout_executions;q private.creator_cashout_provider_qualifications;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict e from private.creator_cashout_executions where request_id=p_request_id;
 if not exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=e.id) then
  return public.get_creator_cashout_payout_fee_import_context(p_request_id); end if;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 return jsonb_build_object('executionId',e.id,'accountId',q.platform_account_id,'environment',q.environment,'currency',q.currency,'transferId',e.transfer_id);
end $$;
revoke all on function public.get_creator_cashout_fee_import_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_creator_cashout_fee_import_context(uuid) to service_role;
do $$ declare d text;anchor text; begin
 d:=pg_get_functiondef('public.get_my_creator_cashout_execution(uuid)'::regprocedure);
 anchor:='''canCancel'',e.phase=''prepared'' and exists';
 if position(anchor in d)=0 then raise exception 'funding_cancel_readback_anchor_missing'; end if;
 d:=replace(d,anchor,'''fundingReturnHeld'',exists(select 1 from private.creator_cashout_funding_cancellations where execution_id=e.id) and e.returned_accounted_at is null,
  ''ownerAction'',case when e.phase=''funding_return_unknown'' then ''Verify exact transfer reversal using GET-only evidence; never resend bank payout.''
   when e.phase=''funding_return_pending'' then ''Verify correction-return qualification and operational switches.''
   when e.phase=''returned'' and e.returned_accounted_at is null then ''Import authenticated funding cost evidence and verify attribution.'' else null end,
  ''canCancel'',(e.phase=''funded'' and e.payout_id is null and private.cashout_bank_never_dispatched(e.id)) or e.phase=''prepared'' and exists');
 execute d;
end $$;
