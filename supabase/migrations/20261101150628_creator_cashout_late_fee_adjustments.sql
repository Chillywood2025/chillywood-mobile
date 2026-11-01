-- Known-cost policy companion. Only verified post-accounting component deltas
-- affect future unpaid earnings. Never rewrite a bank payout or debit a bank.
-- Fresh coverage may renew the exact original provider/account/method scope
-- without repricing the request. Expired dispatch authority never renews itself.
create function private.creator_cashout_fee_coverage_current(p_qualification uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from private.creator_cashout_provider_qualifications original
  join private.creator_cashout_provider_qualifications proof on
   row(proof.creator_id,proof.platform_account_id,proof.account_id,proof.destination_id,proof.environment,proof.currency,proof.payout_type,proof.source_type)
   =row(original.creator_id,original.platform_account_id,original.account_id,original.destination_id,original.environment,original.currency,original.payout_type,original.source_type)
  where original.id=p_qualification and proof.fee_report_coverage_verified
   and proof.fee_report_semantics='all_fees.incurred_at.itemized.2:amount_excludes_tax_v1'
   and proof.verified_at<=clock_timestamp() and proof.expires_at>clock_timestamp()
   and not exists(select 1 from private.creator_cashout_qualification_revocations where qualification_id in (original.id,proof.id)));
$$;
revoke all on function private.creator_cashout_fee_coverage_current(uuid) from public,anon,authenticated,service_role;
create table private.creator_cashout_fee_adjustment_checkpoints (
 id bigint generated always as identity primary key,
 execution_id uuid not null references private.creator_cashout_executions(id),
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 cumulative_fee_minor bigint not null check(cumulative_fee_minor>=0),
 delta_minor bigint not null check(delta_minor<>0),
 adjustment_id uuid references private.commerce_creator_fee_adjustments(id),
 credit_earning_id uuid references public.creator_earnings_ledger(id),
 created_at timestamptz not null default clock_timestamp(),unique(execution_id,evidence_hash),
 check((delta_minor>0 and adjustment_id is not null and credit_earning_id is null)
  or(delta_minor<0 and adjustment_id is null and credit_earning_id is not null))
);
alter table private.creator_cashout_fee_adjustment_checkpoints enable row level security;
alter table private.creator_cashout_fee_adjustment_checkpoints force row level security;
revoke all on private.creator_cashout_fee_adjustment_checkpoints from public,anon,authenticated,service_role;
create trigger creator_cashout_fee_adjustment_checkpoints_immutable before update or delete on private.creator_cashout_fee_adjustment_checkpoints
 for each row execute function private.guard_event_ticket_terms_immutable();

create function private.record_creator_cashout_late_fee_delta(p_execution_id uuid) returns void
language plpgsql set search_path='' as $$
declare e private.creator_cashout_executions;q private.creator_cashout_provider_qualifications;
 baseline bigint; total bigint; delta bigint; evidence text; accepted uuid; adjustment uuid; credit uuid; original uuid;
begin
 select * into strict e from private.creator_cashout_executions where id=p_execution_id;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||e.creator_id::text,0));
 select * into strict e from private.creator_cashout_executions where id=p_execution_id for update;
 if e.finalized_at is null and e.returned_accounted_at is null and not exists(
  select 1 from private.creator_cashout_observations o where o.execution_id=e.id and o.facts->>'kind'='payout'
   and o.facts->>'objectId'=e.payout_id and o.facts->>'status'='paid') then return; end if;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 if not private.creator_cashout_fee_coverage_current(q.id)
 then raise exception 'cashout_late_fee_qualification_required'; end if;
 select sum(amount_minor),encode(extensions.digest(convert_to(jsonb_agg(component order by component_key)::text,'UTF8'),'sha256'),'hex')
  into total,evidence from private.creator_cashout_fee_components where execution_id=e.id;
 if total is null or total<0 or total>2147483647 or total is distinct from e.observed_provider_fee_minor::bigint then raise exception 'cashout_late_fee_components_invalid'; end if;
 if exists(select 1 from private.creator_cashout_fee_adjustment_checkpoints where execution_id=e.id and evidence_hash=evidence) then return; end if;
 select cumulative_fee_minor into baseline from private.creator_cashout_fee_adjustment_checkpoints where execution_id=e.id order by id desc limit 1;
 if baseline is null then
  if e.finalized_at is not null then
   select (metadata->>'observed_provider_fee_minor')::bigint into baseline from public.creator_payout_provider_result_receipts
    where payout_request_id=e.request_id and provider_object_type='payout' and provider_object_id=e.payout_id and provider_status='paid';
  elsif e.returned_accounted_at is not null then select sum(retained_provider_fee_minor) into baseline from private.creator_cashout_return_accounting where execution_id=e.id;
  else baseline:=e.expected_provider_fee_minor; end if;
 end if;
 if baseline is null then raise exception 'cashout_late_fee_baseline_missing'; end if;
 delta:=total-baseline;if delta=0 then return; end if;
 select id into accepted from private.commerce_creator_fee_acceptances where creator_id=e.creator_id
  and policy_version='known_costs_future_unpaid_adjustments_v1'
  and terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex');
 if accepted is null then raise exception 'creator_fee_policy_acceptance_required'; end if;
 if delta>0 then
  insert into private.commerce_creator_fee_adjustments(creator_id,acceptance_id,currency,amount_minor,reason,source_type,source_id,evidence_hash)
   values(e.creator_id,accepted,'usd',delta,'later_verified_fee','cashout_fee',e.request_id,evidence) returning id into adjustment;
 else
  select earnings_ledger_id into strict original from public.creator_payout_allocations where payout_request_id=e.request_id order by id limit 1;
  credit:=private.record_creator_verified_fee_credit(e.creator_id,original,'cashout_fee',e.request_id,evidence,-delta,q.platform_account_id,q.account_id);
 end if;
 insert into private.creator_cashout_fee_adjustment_checkpoints(execution_id,evidence_hash,cumulative_fee_minor,delta_minor,adjustment_id,credit_earning_id)
  values(e.id,evidence,total,delta,adjustment,credit);
 perform private.consume_creator_fee_recovery(e.creator_id,'usd');
end; $$;
revoke all on function private.record_creator_cashout_late_fee_delta(uuid) from public,anon,authenticated,service_role;

-- A bank return releases original allocations, but must not also refund costs
-- already charged/credited through future-unpaid adjustments. Net retained cost
-- plus signed adjustments equals the latest verified provider cost exactly.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.finalize_creator_cashout_accounting(uuid)'::regprocedure);
 if position('remaining_fee:=e.observed_provider_fee_minor;' in definition)=0 then raise exception 'cashout_return_upgrade_anchor_missing'; end if;
 definition:=replace(definition,'remaining_fee:=e.observed_provider_fee_minor;',
  'remaining_fee:=e.observed_provider_fee_minor-coalesce((select sum(delta_minor) from private.creator_cashout_fee_adjustment_checkpoints where execution_id=e.id),0);
   if remaining_fee<0 or remaining_fee>e.gross_minor then raise exception ''cashout_return_adjustment_inconsistent''; end if;');
 if position('if e.phase=''paid'' and e.observed_provider_fee_minor<>e.expected_provider_fee_minor then return; end if;' in definition)=0
 then raise exception 'cashout_paid_upgrade_anchor_missing'; end if;
 definition:=replace(definition,'if e.phase=''paid'' and e.observed_provider_fee_minor<>e.expected_provider_fee_minor then return; end if;',
  'if e.phase=''paid'' and e.observed_provider_fee_minor<>e.expected_provider_fee_minor
   and e.observed_provider_fee_minor-e.expected_provider_fee_minor<>coalesce((select sum(delta_minor) from private.creator_cashout_fee_adjustment_checkpoints where execution_id=e.id),0) then return; end if;');
 if position('update private.creator_cashout_executions set returned_accounted_at=clock_timestamp() where id=e.id;' in definition)=0
 then raise exception 'cashout_return_recovery_anchor_missing'; end if;
 definition:=replace(definition,'update private.creator_cashout_executions set returned_accounted_at=clock_timestamp() where id=e.id;',
  'update private.creator_cashout_executions set returned_accounted_at=clock_timestamp() where id=e.id;
   perform private.consume_creator_fee_recovery(e.creator_id,''usd'');');
 execute definition;
end $$;

alter function public.record_creator_cashout_fee_report(uuid,jsonb) rename to record_creator_cashout_fee_report_components;
revoke all on function public.record_creator_cashout_fee_report_components(uuid,jsonb) from public,anon,authenticated,service_role;
do $$ declare definition text; marker text:=$marker$q.fee_report_coverage_verified and q.fee_report_semantics='all_fees.incurred_at.itemized.2:amount_excludes_tax_v1'
  and q.expires_at>clock_timestamp() and not exists(select 1 from private.creator_cashout_qualification_revocations where qualification_id=q.id)$marker$;
begin
 definition:=pg_get_functiondef('public.record_creator_cashout_fee_report_components(uuid,jsonb)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'cashout_fee_coverage_upgrade_anchor_missing'; end if;
 execute replace(definition,marker,'private.creator_cashout_fee_coverage_current(q.id)');
end $$;
create function public.record_creator_cashout_fee_report(p_request_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.creator_cashout_executions; result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict e from private.creator_cashout_executions where request_id=p_request_id;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||e.creator_id::text,0));
 select * into strict e from private.creator_cashout_executions where request_id=p_request_id for update;
 result:=public.record_creator_cashout_fee_report_components(p_request_id,p_evidence);
 if (e.phase='paid' or (e.phase='returned' and e.returned_accounted_at is not null))
  and exists(select 1 from private.creator_cashout_executions where id=e.id and observed_provider_fee_minor is not null) then
  perform private.record_creator_cashout_late_fee_delta(e.id);
  -- Restore only a pre-existing terminal bank state, never an unrelated review.
  update private.creator_cashout_executions set phase=e.phase where id=e.id and phase='needs_review';
  perform private.finalize_creator_cashout_accounting(e.id);
  result:=result||jsonb_build_object('status',e.phase,'laterFeesUseFutureUnpaidEarnings',true,'bankDebitPerformed',false,
   'accountingComplete',(select finalized_at is not null or returned_accounted_at is not null from private.creator_cashout_executions where id=e.id));
 end if;
 return result;
end; $$;
revoke all on function public.record_creator_cashout_fee_report(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_creator_cashout_fee_report(uuid,jsonb) to service_role;
