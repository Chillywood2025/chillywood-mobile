-- Dormant known-zero inline basis, NOT proof that no platform fee will arrive.
-- Requires independently qualified attribution/payer semantics, exact observed
-- payout balance transaction, authenticated report observation and accepted
-- future-only adjustment policy. Empty reports alone never establish zero.
alter table private.creator_cashout_provider_qualifications add column payout_inline_zero_attribution_verified boolean not null default false;
alter table private.creator_cashout_executions add column cost_basis text check(cost_basis in ('known_inline_zero','known_report_components'));
create table private.creator_cashout_inline_zero_evidence(
 execution_id uuid primary key references private.creator_cashout_executions(id),
 transaction_id text not null check(transaction_id ~ '^txn_[A-Za-z0-9]+$'),
 facts jsonb not null, observed_at timestamptz not null default clock_timestamp()
);
alter table private.creator_cashout_inline_zero_evidence enable row level security;
alter table private.creator_cashout_inline_zero_evidence force row level security;
revoke all on private.creator_cashout_inline_zero_evidence from public,anon,authenticated,service_role;
create trigger creator_cashout_inline_zero_immutable before update or delete on private.creator_cashout_inline_zero_evidence
 for each row execute function private.guard_event_ticket_terms_immutable();
create function private.creator_cashout_inline_zero_qualified(p_qualification uuid) returns boolean
language sql stable set search_path='' as $$
 select private.creator_cashout_fee_coverage_current(p_qualification) and exists(
  select 1 from private.creator_cashout_provider_qualifications original join private.creator_cashout_provider_qualifications proof on
   row(proof.creator_id,proof.platform_account_id,proof.account_id,proof.destination_id,proof.environment,proof.currency,proof.payout_type,proof.source_type)
   =row(original.creator_id,original.platform_account_id,original.account_id,original.destination_id,original.environment,original.currency,original.payout_type,original.source_type)
  where original.id=p_qualification and proof.payout_inline_zero_attribution_verified and proof.platform_fee_payer_verified
   and proof.verified_at<=clock_timestamp() and proof.expires_at>clock_timestamp()
   and not exists(select 1 from private.creator_cashout_qualification_revocations where qualification_id=proof.id));
$$;
revoke all on function private.creator_cashout_inline_zero_qualified(uuid) from public,anon,authenticated,service_role;
create function private.finalize_creator_cashout_known_zero(p_execution uuid) returns void
language plpgsql set search_path='' as $$
declare e private.creator_cashout_executions;
begin
 select * into strict e from private.creator_cashout_executions where id=p_execution for update;
 if exists(select 1 from private.creator_cashout_fee_components where execution_id=e.id) then
  update private.creator_cashout_executions set cost_basis='known_report_components' where id=e.id;return;
 end if;
 if e.phase<>'paid' or e.observed_provider_fee_minor is not null or e.expected_provider_fee_minor<>0
  or not private.creator_cashout_inline_zero_qualified(e.qualification_id)
  or not exists(select 1 from private.creator_cashout_inline_zero_evidence where execution_id=e.id)
  or not exists(select 1 from private.creator_cashout_fee_reports where execution_id=e.id)
  or not exists(select 1 from private.commerce_creator_fee_acceptances where creator_id=e.creator_id
   and policy_version='known_costs_future_unpaid_adjustments_v1'
   and terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex')) then return; end if;
 update private.creator_cashout_executions set observed_provider_fee_minor=0,cost_basis='known_inline_zero' where id=e.id;
 perform private.finalize_creator_cashout_accounting(e.id);
end; $$;
revoke all on function private.finalize_creator_cashout_known_zero(uuid) from public,anon,authenticated,service_role;

alter function public.record_creator_cashout_observation(uuid,uuid,jsonb) rename to record_creator_cashout_observation_bound;
revoke all on function public.record_creator_cashout_observation_bound(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.record_creator_cashout_observation(p_request_id uuid,p_dispatch_token uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;e private.creator_cashout_executions;q private.creator_cashout_provider_qualifications;facts jsonb:=p_facts->'inlineZeroBalance';prior jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 result:=public.record_creator_cashout_observation_bound(p_request_id,p_dispatch_token,p_facts);
 select * into strict e from private.creator_cashout_executions where request_id=p_request_id for update;
 if facts is not null then
  select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
  if p_facts->>'kind' is distinct from 'payout' or p_facts->>'status' is distinct from 'paid'
   or e.expected_provider_fee_minor<>0 or not private.creator_cashout_inline_zero_qualified(q.id)
   or jsonb_typeof(facts) is distinct from 'object' or facts->>'payoutId' is distinct from e.payout_id
   or facts->>'accountId' is distinct from q.account_id or facts->>'environment' is distinct from q.environment
   or facts->>'currency' is distinct from 'usd' or facts->>'status' is distinct from 'available' or facts->>'type' is distinct from 'payout'
   or facts->'amountMinor' is distinct from to_jsonb(-e.bank_minor) or facts->'netMinor' is distinct from to_jsonb(-e.bank_minor)
   or facts->'feeMinor' is distinct from '0'::jsonb or not coalesce(facts->>'transactionId' ~ '^txn_[A-Za-z0-9]+$',false)
   or facts->>'transactionId' is distinct from p_facts->>'balanceTransactionId'
  then raise exception 'cashout_inline_zero_binding_invalid'; end if;
  select evidence.facts into prior from private.creator_cashout_inline_zero_evidence evidence where execution_id=e.id;
  if prior is not null and prior<>facts then raise exception 'cashout_inline_zero_conflict'; end if;
  insert into private.creator_cashout_inline_zero_evidence(execution_id,transaction_id,facts) values(e.id,facts->>'transactionId',facts) on conflict do nothing;
 end if;
 perform private.finalize_creator_cashout_known_zero(e.id);
 return result||jsonb_build_object('costsMayChange',true,'feeReconciled',(select observed_provider_fee_minor is not null from private.creator_cashout_executions where id=e.id));
end; $$;
revoke all on function public.record_creator_cashout_observation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_creator_cashout_observation(uuid,uuid,jsonb) to service_role;

alter function public.record_creator_cashout_fee_report(uuid,jsonb) rename to record_creator_cashout_fee_report_adjusted;
revoke all on function public.record_creator_cashout_fee_report_adjusted(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.record_creator_cashout_fee_report(p_request_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;e private.creator_cashout_executions;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 result:=public.record_creator_cashout_fee_report_adjusted(p_request_id,p_evidence);
 select * into strict e from private.creator_cashout_executions where request_id=p_request_id for update;
 perform private.finalize_creator_cashout_known_zero(e.id);
 select * into strict e from private.creator_cashout_executions where id=e.id;
 return result||jsonb_build_object('status',e.phase,'observedProviderFeeMinor',e.observed_provider_fee_minor,'costBasis',e.cost_basis,
  'costsMayChange',true,'accountingComplete',e.finalized_at is not null or e.returned_accounted_at is not null);
end; $$;
revoke all on function public.record_creator_cashout_fee_report(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_creator_cashout_fee_report(uuid,jsonb) to service_role;

do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.record_creator_cashout_late_fee_delta(uuid)'::regprocedure);
 if position('if total is null or total<0' in definition)=0 then raise exception 'cashout_inline_baseline_upgrade_anchor_missing'; end if;
 execute replace(definition,'if total is null or total<0',
  'if total is null and e.cost_basis=''known_inline_zero'' then return; end if; if total is null or total<0');
 definition:=pg_get_functiondef('private.get_creator_cashout_execution_context(uuid)'::regprocedure);
 if position('''dispatchKey'',''cw-cashout-''||e.id' in definition)=0 then raise exception 'cashout_context_upgrade_anchor_missing'; end if;
 execute replace(definition,'''dispatchKey'',''cw-cashout-''||e.id',
  '''inlineKnownZeroQualified'',private.creator_cashout_inline_zero_qualified(q.id),''dispatchKey'',''cw-cashout-''||e.id');
 definition:=pg_get_functiondef('public.get_my_creator_cashout_execution(uuid)'::regprocedure);
 if position('else ''observed'' end' in definition)=0 then raise exception 'cashout_readback_upgrade_anchor_missing'; end if;
 execute replace(definition,'else ''observed'' end','when e.cost_basis=''known_inline_zero'' then ''known_inline_zero_not_final'' else ''known_report_costs_not_final'' end');
end $$;
