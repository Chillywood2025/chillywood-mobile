-- Dormant cashout execution. No qualification rows, credentials, schedules,
-- switches, provider transactions or payout approvals are created here.
-- An accepted 2%-of-gross fee is retained in the funding transfer, once.
-- Platform Pricing must be independently verified not to add another app fee.
create table private.creator_cashout_provider_qualifications (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null,
 platform_account_id text not null check(platform_account_id ~ '^acct_[A-Za-z0-9]+$'),
 account_id text not null check(account_id ~ '^acct_[A-Za-z0-9]+$'),
 destination_id text not null check(destination_id ~ '^(ba|card)_[A-Za-z0-9]+$'),
 environment text not null check(environment='live'), currency text not null check(currency='usd'),
 payout_type text not null check(payout_type in ('scheduled','instant')),
 source_type text not null check(source_type in ('card','bank_account')),
 provider_fee_bps integer not null check(provider_fee_bps between 0 and 10000),
 provider_fee_fixed_minor integer not null check(provider_fee_fixed_minor>=0),
 provider_fee_basis text not null check(provider_fee_basis='bank_amount'),
 manual_schedule_verified boolean not null default false,
 exclusive_writer_verified boolean not null default false,
 zero_additional_application_fee_verified boolean not null default false,
 platform_fee_payer_verified boolean not null default false,
 funding_provenance_verified boolean not null default false,
 fee_report_coverage_verified boolean not null default false,
 fee_report_semantics text check(fee_report_semantics='all_fees.incurred_at.itemized.2:amount_excludes_tax_v1'),
 provider_terms_reference text not null check(length(btrim(provider_terms_reference)) between 1 and 1000),
 verified_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 check(expires_at>verified_at), check(platform_account_id<>account_id)
);
create table private.creator_cashout_qualification_revocations (
 qualification_id uuid primary key references private.creator_cashout_provider_qualifications(id),
 revoked_at timestamptz not null default clock_timestamp(), reason text not null
);
create table private.creator_cashout_request_operations (
 creator_id uuid not null, operation_id uuid not null, request_id uuid not null unique references public.creator_payout_requests(id),
 qualification_id uuid not null references private.creator_cashout_provider_qualifications(id),
 amount_minor integer not null, payout_type text not null, created_at timestamptz not null default clock_timestamp(),
 primary key(creator_id,operation_id)
);
alter table public.creator_payout_requests add column originating_session_id uuid;
create function private.bind_cashout_origin_session() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid()=new.creator_id and nullif(auth.jwt()->>'session_id','') is not null then
  new.originating_session_id:=(auth.jwt()->>'session_id')::uuid;
 else new.originating_session_id:=null; end if;
 return new;
end; $$;
revoke all on function private.bind_cashout_origin_session() from public,anon,authenticated,service_role;
create trigger creator_cashout_origin_session before insert on public.creator_payout_requests
 for each row execute function private.bind_cashout_origin_session();
create function private.preserve_cashout_origin_session() returns trigger language plpgsql set search_path='' as $$
begin
 if new.originating_session_id is distinct from old.originating_session_id then raise exception 'cashout_origin_session_immutable'; end if;
 return new;
end; $$;
revoke all on function private.preserve_cashout_origin_session() from public,anon,authenticated,service_role;
create trigger preserve_cashout_origin_session before update on public.creator_payout_requests
 for each row execute function private.preserve_cashout_origin_session();

create table private.creator_cashout_executions (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.creator_payout_requests(id),
 qualification_id uuid not null references private.creator_cashout_provider_qualifications(id),
 creator_id uuid not null, gross_minor integer not null check(gross_minor>0),
 app_fee_minor integer not null check(app_fee_minor>=0),
 expected_provider_fee_minor integer not null check(expected_provider_fee_minor>=0),
 observed_provider_fee_minor integer check(observed_provider_fee_minor>=0),
 bank_minor integer not null check(bank_minor>0),
 phase text not null default 'prepared' check(phase in ('prepared','canceled','funding_unknown','funded','payout_unknown','payout_pending','paid','return_pending','return_confirmed','reversal_unknown','returned','needs_review')),
 transfer_id text unique, payout_id text unique, reversal_id text unique,
 dispatch_token uuid, dispatched_at timestamptz,
 bank_return_transaction_id text, bank_return_minor integer,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 finalized_at timestamptz, returned_accounted_at timestamptz,
 check(bank_minor+app_fee_minor+expected_provider_fee_minor=gross_minor)
);
create table private.creator_cashout_observations (
 id uuid primary key default gen_random_uuid(), execution_id uuid not null references private.creator_cashout_executions(id),
 facts jsonb not null, observed_at timestamptz not null default clock_timestamp(),
 facts_hash text not null, unique(execution_id,facts_hash)
);
create table private.creator_cashout_fee_reports (
 id uuid primary key default gen_random_uuid(), execution_id uuid not null references private.creator_cashout_executions(id),
 report_run_id text not null, evidence jsonb not null, created_at timestamptz not null default clock_timestamp(),
 unique(execution_id,report_run_id)
);
create table private.creator_cashout_fee_components (
 execution_id uuid not null references private.creator_cashout_executions(id), component_key text not null,
 component jsonb not null, amount_minor bigint not null,
 primary key(execution_id,component_key)
);
create table private.creator_cashout_return_accounting (
 execution_id uuid not null references private.creator_cashout_executions(id), allocation_id uuid not null references public.creator_payout_allocations(id),
 original_minor integer not null, retained_provider_fee_minor integer not null, released_minor integer not null,
 created_at timestamptz not null default clock_timestamp(), primary key(execution_id,allocation_id),
 check(original_minor=retained_provider_fee_minor+released_minor)
);
do $$ declare t text; begin
 foreach t in array array['creator_cashout_provider_qualifications','creator_cashout_qualification_revocations','creator_cashout_request_operations','creator_cashout_executions','creator_cashout_observations','creator_cashout_fee_reports','creator_cashout_fee_components','creator_cashout_return_accounting'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
 foreach t in array array['creator_cashout_provider_qualifications','creator_cashout_qualification_revocations','creator_cashout_request_operations','creator_cashout_observations','creator_cashout_fee_reports','creator_cashout_fee_components','creator_cashout_return_accounting'] loop
  execute format('create trigger %1$I before update or delete on private.%2$I for each row execute function private.guard_event_ticket_terms_immutable()',t||'_immutable',t);
 end loop;
end; $$;

create function private.assert_cashout_dispatch_admission(p_request public.creator_payout_requests,p_qualification private.creator_cashout_provider_qualifications)
returns void language plpgsql set search_path='' as $$
declare required_switch text;
begin
 if p_request.originating_session_id is null or not exists(select 1 from auth.sessions s
  where s.id=p_request.originating_session_id and s.user_id=p_request.creator_id
   and (s.not_after is null or s.not_after>clock_timestamp()))
  or public.is_account_access_restricted(p_request.creator_id::text)
  or public.revenuecat_authority_quarantined_internal(null,null,null)
 then raise exception 'cashout_origin_authority_required'; end if;
 if p_request.status not in ('requested','approved','processing') then raise exception 'cashout_request_closed'; end if;
 if not exists(select 1 from public.wave1_creator_eligibility e where e.creator_user_id=p_request.creator_id
  and e.state='VERIFIED' and e.account_status='ACTIVE' and e.age_18_plus and e.legal_accepted
  and e.creator_role and e.moderation_state='CLEAR' and e.market='UNITED_STATES' and e.rollout_eligible
  and e.platform_capability and e.provider_eligible and e.kyc_complete and e.tax_complete and e.sanctions_clear and e.payout_eligible)
 then raise exception 'creator_not_payout_eligible'; end if;
 if exists(select 1 from public.wave1_legal_document_versions v where v.active and v.market='UNITED_STATES'
  and v.capability='payout' and not exists(select 1 from public.wave1_legal_acceptances a
   where a.user_id=p_request.creator_id and a.document_key=v.document_key and a.document_version=v.version and a.market=v.market))
 then raise exception 'payout_legal_not_current'; end if;
 foreach required_switch in array array['live_money_enabled','payouts_enabled','stripe_connect_enabled'] loop
  perform 1 from public.platform_money_kill_switches where key=required_switch and state='on' for share;
  if not found then raise exception 'payout_execution_disabled'; end if;
 end loop;
 if p_request.payout_type='instant' then
  perform 1 from public.platform_money_kill_switches where key='cashout_enabled' and state='on' for share;
  if not found then raise exception 'payout_execution_disabled'; end if;
 end if;
 if p_qualification.id is null or p_qualification.creator_id<>p_request.creator_id
  or p_qualification.payout_type<>p_request.payout_type or p_qualification.currency<>p_request.currency
  or p_qualification.verified_at>clock_timestamp() or p_qualification.expires_at<=clock_timestamp()
  or not p_qualification.manual_schedule_verified or not p_qualification.exclusive_writer_verified
  or not p_qualification.zero_additional_application_fee_verified or not p_qualification.platform_fee_payer_verified
  or not p_qualification.funding_provenance_verified
  or exists(select 1 from private.creator_cashout_qualification_revocations where qualification_id=p_qualification.id)
  or not exists(select 1 from public.creator_payout_accounts a where a.creator_user_id=p_request.creator_id::text
   and a.provider='stripe_connect' and a.provider_environment=p_qualification.environment and a.provider_account_id=p_qualification.account_id
   and a.status='eligible' and a.kyc_status='verified' and a.tax_status='verified')
 then raise exception 'cashout_provider_qualification_required'; end if;
 if exists(select 1 from public.creator_money_recovery_obligations where creator_id=p_request.creator_id and state='pending_recovery')
 then raise exception 'creator_recovery_obligation_pending'; end if;
 if exists(select 1 from private.creator_cashout_executions where creator_id=p_request.creator_id and phase='needs_review')
 then raise exception 'cashout_fee_or_provider_review_required'; end if;
 if (select coalesce(sum(amount_cents),0) from public.creator_payout_allocations
  where payout_request_id=p_request.id and state in ('reserved','processing'))<>p_request.amount_cents
 then raise exception 'payout_allocation_incomplete'; end if;
 -- Any reversal after the original reservation invalidates new dispatch.
 if exists(select 1 from public.creator_payout_allocations a join public.creator_earnings_ledger e on e.id=a.earnings_ledger_id
  join public.money_access_ledger_events m on m.id=e.money_ledger_event_id where a.payout_request_id=p_request.id
  and (e.creator_id<>p_request.creator_id or e.currency<>p_request.currency or m.environment<>'production'
   or m.status<>'verified' or m.payable_state<>'payable' or public.creator_earnings_current_state_internal(e.id)<>'available'))
 then raise exception 'cashout_earnings_no_longer_eligible'; end if;
 if exists(select 1 from public.creator_payout_allocations a where a.payout_request_id=p_request.id
  and public.creator_earnings_withdrawable_cents_internal(a.earnings_ledger_id,clock_timestamp()) <
   (select coalesce(sum(other.amount_cents),0) from public.creator_payout_allocations other
    where other.earnings_ledger_id=a.earnings_ledger_id and other.state in ('reserved','processing','paid')))
 then raise exception 'cashout_reserved_earnings_reduced'; end if;
end; $$;
revoke all on function private.assert_cashout_dispatch_admission(public.creator_payout_requests,private.creator_cashout_provider_qualifications) from public,anon,authenticated,service_role;

create function private.get_creator_cashout_execution_context(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.creator_payout_requests; q private.creator_cashout_provider_qualifications;
 e private.creator_cashout_executions; bank_amount bigint; fee bigint;
begin
 select * into strict r from public.creator_payout_requests where id=p_request_id;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||r.creator_id::text,0));
 select * into strict r from public.creator_payout_requests where id=p_request_id for update;
 select * into e from private.creator_cashout_executions where request_id=r.id for update;
 if e.id is null then
  select qualification.* into q from private.creator_cashout_provider_qualifications qualification
   where qualification.creator_id=r.creator_id and qualification.payout_type=r.payout_type
    and (not exists(select 1 from private.creator_cashout_request_operations where request_id=r.id)
      or qualification.id=(select qualification_id from private.creator_cashout_request_operations where request_id=r.id))
   order by qualification.verified_at desc,qualification.id desc limit 1;
  perform private.assert_cashout_dispatch_admission(r,q);
  -- Solve bank + ceil(bank*bps/10000) + fixed + app = gross in integer cents.
  -- Some rounded pricing rules have no exact solution: never silently reprice.
  bank_amount:=floor(((r.amount_cents::bigint-r.instant_fee_cents-q.provider_fee_fixed_minor)*10000)::numeric/(10000+q.provider_fee_bps));
  fee:=((bank_amount*q.provider_fee_bps+9999)/10000)+q.provider_fee_fixed_minor;
  if bank_amount<=0 or bank_amount+fee+r.instant_fee_cents<>r.amount_cents then raise exception 'cashout_exact_fee_quote_unavailable'; end if;
  insert into private.creator_cashout_executions(request_id,qualification_id,creator_id,gross_minor,app_fee_minor,expected_provider_fee_minor,bank_minor)
   values(r.id,q.id,r.creator_id,r.amount_cents,r.instant_fee_cents,fee,bank_amount) returning * into e;
 end if;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 return jsonb_build_object('requestId',r.id,'executionId',e.id,'platformAccountId',q.platform_account_id,
  'accountId',q.account_id,'destinationId',q.destination_id,'environment',q.environment,
  'method',case r.payout_type when 'scheduled' then 'standard' else 'instant' end,'sourceType',q.source_type,
  'grossMinor',e.gross_minor,'appFeeMinor',e.app_fee_minor,'expectedProviderFeeMinor',e.expected_provider_fee_minor,
  'bankMinor',e.bank_minor,'currency',r.currency,'phase',e.phase,'transferId',e.transfer_id,'payoutId',e.payout_id,
  'reversalId',e.reversal_id,'dispatchKey','cw-cashout-'||e.id,
  'dispatchedAt',case when e.dispatched_at is null then null else floor(extract(epoch from e.dispatched_at)) end);
end; $$;
revoke all on function private.get_creator_cashout_execution_context(uuid) from public,anon,authenticated,service_role;
create function public.get_creator_cashout_execution_context(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 return private.get_creator_cashout_execution_context(p_request_id);
end; $$;
revoke all on function public.get_creator_cashout_execution_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_creator_cashout_execution_context(uuid) to service_role;

create function public.claim_creator_cashout_dispatch(p_request_id uuid,p_stage text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.creator_payout_requests; q private.creator_cashout_provider_qualifications; e private.creator_cashout_executions; token uuid:=gen_random_uuid(); required_switch text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict r from public.creator_payout_requests where id=p_request_id;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||r.creator_id::text,0));
 select * into strict r from public.creator_payout_requests where id=p_request_id for update;
 select * into strict e from private.creator_cashout_executions where request_id=r.id for update;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 if p_stage not in ('funding','payout','reversal') or p_stage is null then raise exception 'cashout_stage_invalid'; end if;
 if e.phase<>(case p_stage when 'funding' then 'prepared' when 'payout' then 'funded' else 'return_confirmed' end)
 then return jsonb_build_object('claimed',false); end if;
 -- Return-of-funds is not a second payout, but still requires explicit active
 -- operational authority. Revoking dispatch never prevents GET reconciliation.
 if p_stage<>'reversal' then perform private.assert_cashout_dispatch_admission(r,q);
 else
  foreach required_switch in array array['live_money_enabled','payouts_enabled','stripe_connect_enabled'] loop
   perform 1 from public.platform_money_kill_switches where key=required_switch and state='on' for share;
   if not found then raise exception 'payout_execution_disabled'; end if;
  end loop;
 end if;
 if r.amount_cents<>e.gross_minor or r.instant_fee_cents<>e.app_fee_minor or r.creator_id<>e.creator_id
 then raise exception 'cashout_terms_changed'; end if;
 if p_stage='reversal' and (e.bank_return_transaction_id is null or e.bank_return_minor<>e.bank_minor)
 then raise exception 'cashout_return_evidence_required'; end if;
 update private.creator_cashout_executions set phase=case p_stage when 'funding' then 'funding_unknown' when 'payout' then 'payout_unknown' else 'reversal_unknown' end,
  dispatch_token=token,dispatched_at=clock_timestamp(),updated_at=clock_timestamp() where id=e.id;
 update public.creator_payout_requests set status='processing',updated_at=clock_timestamp() where id=r.id;
 update public.creator_payout_allocations set state='processing',updated_at=clock_timestamp() where payout_request_id=r.id and state='reserved';
 return jsonb_build_object('claimed',true,'token',token);
end; $$;
revoke all on function public.claim_creator_cashout_dispatch(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_creator_cashout_dispatch(uuid,text) to service_role;

create function public.record_creator_cashout_observation(p_request_id uuid,p_dispatch_token uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.creator_payout_requests; q private.creator_cashout_provider_qualifications; e private.creator_cashout_executions;
 kind text:=p_facts->>'kind'; next_phase text; hash text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if jsonb_typeof(p_facts) is distinct from 'object' or octet_length(p_facts::text)>4096 then raise exception 'cashout_observation_invalid'; end if;
 select * into strict r from public.creator_payout_requests where id=p_request_id;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||r.creator_id::text,0));
 select * into strict r from public.creator_payout_requests where id=p_request_id for update;
 select * into strict e from private.creator_cashout_executions where request_id=r.id for update;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 if p_dispatch_token is not null and p_dispatch_token is distinct from e.dispatch_token then raise exception 'cashout_stale_dispatch_token'; end if;
 if p_facts->>'accountId' is distinct from q.account_id or p_facts->>'environment' is distinct from q.environment
  or p_facts->'amountMinor' is distinct from to_jsonb(e.bank_minor)
 then raise exception 'cashout_observation_binding_invalid'; end if;
 next_phase:=e.phase;
 if kind='transfer' then
  if e.phase in ('prepared','canceled') then raise exception 'cashout_transfer_phase_invalid'; end if;
  if not coalesce(p_facts->>'objectId' ~ '^tr_[A-Za-z0-9]+$',false)
   or (e.transfer_id is not null and e.transfer_id<>p_facts->>'objectId')
   or not coalesce(p_facts->>'reversedMinor' ~ '^[0-9]+$',false)
   or (p_facts->>'reversedMinor')::bigint>e.bank_minor
  then raise exception 'cashout_transfer_binding_invalid'; end if;
  if e.phase='funding_unknown' and p_facts->'reversedMinor'='0'::jsonb and p_facts->'fullyReversed'='false'::jsonb then next_phase:='funded';
  elsif e.phase='reversal_unknown' and p_facts->'reversedMinor'=to_jsonb(e.bank_minor) and p_facts->'fullyReversed'='true'::jsonb
   and e.bank_return_transaction_id is not null then next_phase:='returned';
  elsif (p_facts->>'reversedMinor')::bigint>0 and e.phase<>'returned' then next_phase:='needs_review'; end if;
  update private.creator_cashout_executions set transfer_id=p_facts->>'objectId' where id=e.id;
 elsif kind='payout' then
  if e.transfer_id is null or not coalesce(p_facts->>'objectId' ~ '^po_[A-Za-z0-9]+$',false)
   or (e.payout_id is not null and e.payout_id<>p_facts->>'objectId')
   or p_facts->>'destinationId' is distinct from q.destination_id
   or not coalesce(p_facts->>'status' in ('pending','in_transit','paid','failed','canceled'),false)
  then raise exception 'cashout_payout_binding_invalid'; end if;
  if e.phase not in ('payout_unknown','payout_pending','paid','return_pending','return_confirmed','needs_review') then raise exception 'cashout_payout_phase_invalid'; end if;
  if p_facts->>'status'='paid' then
   next_phase:=case when e.phase in ('return_pending','return_confirmed','needs_review') then 'needs_review' else 'paid' end;
  elsif p_facts->>'status' in ('failed','canceled') then
   next_phase:='return_pending';
   if p_facts->'returnedMinor'=to_jsonb(e.bank_minor)
    and coalesce(p_facts->>'returnTransactionId' ~ '^txn_[A-Za-z0-9]+$',false)
    and p_facts->>'returnTransactionId'=p_facts->>'failureBalanceTransactionId' then
    next_phase:='return_confirmed';
    update private.creator_cashout_executions set bank_return_transaction_id=p_facts->>'returnTransactionId',bank_return_minor=e.bank_minor where id=e.id;
   end if;
  elsif e.phase not in ('paid','return_pending','return_confirmed','needs_review') then next_phase:='payout_pending'; end if;
  update private.creator_cashout_executions set payout_id=p_facts->>'objectId' where id=e.id;
 elsif kind='reversal' then
  if e.phase<>'reversal_unknown' or e.bank_return_transaction_id is null
   or p_facts->>'transferId' is distinct from e.transfer_id or not coalesce(p_facts->>'objectId' ~ '^trr_[A-Za-z0-9]+$',false)
  then raise exception 'cashout_reversal_binding_invalid'; end if;
  next_phase:='returned';
  update private.creator_cashout_executions set reversal_id=p_facts->>'objectId' where id=e.id;
 else raise exception 'cashout_observation_kind_invalid'; end if;
 hash:=encode(extensions.digest(convert_to(p_facts::text,'UTF8'),'sha256'),'hex');
 insert into private.creator_cashout_observations(execution_id,facts,facts_hash) values(e.id,p_facts,hash) on conflict do nothing;
 update private.creator_cashout_executions set phase=next_phase,updated_at=clock_timestamp() where id=e.id;
 -- Do not spend or release ledger allocations merely because a transfer
 -- succeeded, a payout says paid, or a failure returned its principal. Actual
 -- payout fee evidence must reconcile separately; the original reserve holds.
 perform private.finalize_creator_cashout_accounting(e.id);
 select * into strict e from private.creator_cashout_executions where id=e.id;
 return jsonb_build_object('status',next_phase,'executionId',e.id,'bankPaid',next_phase='paid',
  'feeReconciled',e.observed_provider_fee_minor is not null,'fundsReleased',e.returned_accounted_at is not null);
end; $$;
revoke all on function public.record_creator_cashout_observation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_creator_cashout_observation(uuid,uuid,jsonb) to service_role;

create function public.get_my_creator_cashout_execution(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e private.creator_cashout_executions;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'current_session_required'; end if;
 if not exists(select 1 from public.creator_payout_requests where id=p_request_id and creator_id=auth.uid()) then raise exception 'cashout_request_not_found'; end if;
 select * into e from private.creator_cashout_executions where request_id=p_request_id;
 return jsonb_build_object('requestId',p_request_id,'status',coalesce(e.phase,'awaiting_qualification'),
  'grossMinor',e.gross_minor,'appFeeMinor',e.app_fee_minor,'bankMinor',e.bank_minor,
  'expectedProviderFeeMinor',e.expected_provider_fee_minor,'observedProviderFeeMinor',e.observed_provider_fee_minor,
  'feeStatus',case when e.observed_provider_fee_minor is null then 'awaiting_actual_cost' else 'observed' end,
  'bankPaid',e.phase='paid','returnedToPlatform',e.phase='returned','canRetry',false,
  'canCancel',e.phase='prepared' and exists(select 1 from public.creator_payout_requests where id=e.request_id and status in ('requested','approved')));
end; $$;
revoke all on function public.get_my_creator_cashout_execution(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_creator_cashout_execution(uuid) to authenticated;

-- Retain the legacy receipt consumer, but reject transfer-as-bank-payout and
-- acquire creator authority before any receipt/request row lock. This follows
-- reservation and the new saga's lock order rather than creating an inversion.
do $$ declare definition text; begin
 select pg_get_functiondef('public.mark_creator_payout_provider_result(uuid,text,text)'::regprocedure) into definition;
 if position('verified_provider_payout_receipt_required' in definition)=0 then raise exception 'cashout_predecessor_receipt_guard_missing'; end if;
 definition:=replace(definition,'v_receipt public."creator_payout_provider_result_receipts"%rowtype;',
  'v_receipt public."creator_payout_provider_result_receipts"%rowtype; cashout_creator uuid;');
 definition:=replace(definition,'if p_request_id is null then raise exception ''payout_request_required''; end if;',
  'if p_request_id is null then raise exception ''payout_request_required''; end if;
  select creator_id into cashout_creator from public.creator_payout_requests where id=p_request_id;
  if cashout_creator is not null then perform pg_advisory_xact_lock(hashtextextended(''creator-payout:''||cashout_creator::text,0)); end if;');
 definition:=replace(definition,'if v_receipt."id" is null then raise exception ''verified_provider_payout_receipt_required''; end if;',
  'if v_receipt."id" is null then raise exception ''verified_provider_payout_receipt_required''; end if;
  if v_receipt.provider_object_type<>''payout'' or v_receipt.provider_object_id !~ ''^po_[A-Za-z0-9]+$'' then raise exception ''bank_payout_receipt_required''; end if;');
 if position('cashout_creator uuid' in definition)=0 or position('hashtextextended(''creator-payout:''||cashout_creator::text,0)' in definition)=0
  or position('bank_payout_receipt_required' in definition)=0 then raise exception 'cashout_receipt_upgrade_anchor_missing'; end if;
 execute definition;
end; $$;

create function private.finalize_creator_cashout_accounting(p_execution_id uuid) returns void
language plpgsql set search_path='' as $$
declare e private.creator_cashout_executions; q private.creator_cashout_provider_qualifications;
 r public.creator_payout_requests; allocation record; remaining_fee integer; retained integer; evidence_hash text;
begin
 select * into strict e from private.creator_cashout_executions where id=p_execution_id for update;
 select * into strict r from public.creator_payout_requests where id=e.request_id for update;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 if e.observed_provider_fee_minor is null then return; end if;
 if e.phase='paid' and e.observed_provider_fee_minor<>e.expected_provider_fee_minor then return; end if;
 if e.phase='paid' and e.finalized_at is null then
  evidence_hash:=encode(extensions.digest(convert_to(jsonb_build_object('execution',e.id,'payout',e.payout_id,
   'gross',e.gross_minor,'bank',e.bank_minor,'appFee',e.app_fee_minor,'providerFee',e.observed_provider_fee_minor)::text,'UTF8'),'sha256'),'hex');
  insert into public.creator_payout_provider_result_receipts(payout_request_id,creator_id,provider,provider_object_type,provider_object_id,
   provider_account_id,provider_status,amount_cents,currency,environment,evidence_hash,verified_at,metadata)
  values(r.id,r.creator_id,'stripe_connect','payout',e.payout_id,q.account_id,'paid',e.gross_minor,'usd','production',evidence_hash,clock_timestamp(),
   jsonb_build_object('cashout_execution_id',e.id,'bank_amount_minor',e.bank_minor,'app_fee_minor',e.app_fee_minor,'observed_provider_fee_minor',e.observed_provider_fee_minor));
  perform public.mark_creator_payout_provider_result(r.id,e.payout_id,'paid');
  update private.creator_cashout_executions set finalized_at=clock_timestamp() where id=e.id;
 elsif e.phase='returned' and e.returned_accounted_at is null then
  if e.bank_return_minor<>e.bank_minor or e.bank_return_transaction_id is null or e.transfer_id is null then raise exception 'cashout_return_evidence_required'; end if;
  remaining_fee:=e.observed_provider_fee_minor;
  -- Return every recoverable cent including the retained app fee. Actual Stripe
  -- costs remain a paid allocation; original economics are archived, not erased.
  for allocation in select a.*,l.money_ledger_event_id from public.creator_payout_allocations a
   join public.creator_earnings_ledger l on l.id=a.earnings_ledger_id where a.payout_request_id=r.id order by a.id for update of a loop
   retained:=least(remaining_fee,allocation.amount_cents); remaining_fee:=remaining_fee-retained;
   insert into private.creator_cashout_return_accounting(execution_id,allocation_id,original_minor,retained_provider_fee_minor,released_minor)
    values(e.id,allocation.id,allocation.amount_cents,retained,allocation.amount_cents-retained);
   if retained=0 then update public.creator_payout_allocations set state='released',updated_at=clock_timestamp() where id=allocation.id;
   else update public.creator_payout_allocations set amount_cents=retained,state='paid',updated_at=clock_timestamp() where id=allocation.id; end if;
   -- Reopen only a paid earning whose own payment is still valid. Refunds,
   -- disputes, quarantine and existing reversal state are never undone.
   if public.creator_earnings_current_state_internal(allocation.earnings_ledger_id)='paid'
    and not public.revenuecat_authority_quarantined_internal(null,null,null)
    and exists(select 1 from public.money_access_ledger_events m where m.id=allocation.money_ledger_event_id
     and m.status='verified' and m.payable_state='paid') then
    insert into public.creator_earnings_lifecycle_events(earnings_ledger_id,lifecycle_state,reason,operation_key,payout_request_id,money_ledger_event_id,metadata)
     values(allocation.earnings_ledger_id,'available','provider_payout_returned','bank-return:'||e.id||':'||allocation.earnings_ledger_id,r.id,
      allocation.money_ledger_event_id,jsonb_build_object('cashout_execution_id',e.id,'returned_to_platform',true)) on conflict do nothing;
    update public.money_access_ledger_events set payable_state='payable' where id=allocation.money_ledger_event_id and payable_state='paid';
   end if;
  end loop;
  if remaining_fee<>0 then raise exception 'cashout_return_fee_allocation_incomplete'; end if;
  update public.creator_payout_requests set status='failed',provider_payout_id=e.payout_id,updated_at=clock_timestamp() where id=r.id;
  update private.creator_cashout_executions set returned_accounted_at=clock_timestamp() where id=e.id;
 end if;
end; $$;
revoke all on function private.finalize_creator_cashout_accounting(uuid) from public,anon,authenticated,service_role;
alter table public.creator_earnings_lifecycle_events drop constraint creator_earnings_lifecycle_reason_check;
alter table public.creator_earnings_lifecycle_events add constraint creator_earnings_lifecycle_reason_check
 check(reason in ('settlement_released','provider_payout_paid','provider_terminal_reversal','historical_projection','provider_payout_returned'));

create function public.get_creator_cashout_fee_import_context(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.creator_cashout_executions; q private.creator_cashout_provider_qualifications;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict e from private.creator_cashout_executions where request_id=p_request_id;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 if e.payout_id is null then raise exception 'cashout_payout_reference_required'; end if;
 return jsonb_build_object('executionId',e.id,'accountId',q.platform_account_id,'environment',q.environment,'currency',q.currency,'payoutId',e.payout_id);
end; $$;
revoke all on function public.get_creator_cashout_fee_import_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_creator_cashout_fee_import_context(uuid) to service_role;

create function public.record_creator_cashout_fee_report(p_request_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.creator_cashout_executions; q private.creator_cashout_provider_qualifications;
 creator uuid; row jsonb; key_value text; prior jsonb; total bigint; rid text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select creator_id into strict creator from public.creator_payout_requests where id=p_request_id;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||creator::text,0));
 select * into strict e from private.creator_cashout_executions where request_id=p_request_id for update;
 select * into strict q from private.creator_cashout_provider_qualifications where id=e.qualification_id;
 if jsonb_typeof(p_evidence) is distinct from 'object' or octet_length(p_evidence::text)>2000000
  or e.payout_id is null or p_evidence->>'payoutId' is distinct from e.payout_id
  or p_evidence->>'accountId' is distinct from q.platform_account_id or p_evidence->>'environment' is distinct from q.environment
  or p_evidence->>'reportType' is distinct from 'all_fees.incurred_at.itemized.2'
  or p_evidence->>'providerBinding' is distinct from 'authenticated_report'
  or not coalesce(p_evidence->>'contentSha256' ~ '^[a-f0-9]{64}$',false)
  or not coalesce(p_evidence->>'reportRunId' ~ '^frr_[A-Za-z0-9]+$',false)
  or not coalesce(p_evidence->>'fileId' ~ '^file_[A-Za-z0-9]+$',false)
  or jsonb_typeof(p_evidence->'rows') is distinct from 'array'
  or jsonb_array_length(p_evidence->'rows')>10000 then raise exception 'cashout_fee_binding_invalid'; end if;
 if exists(select 1 from jsonb_object_keys(p_evidence) k where k not in
  ('schemaVersion','accountId','environment','reportRunId','fileId','reportType','intervalStart','intervalEnd','payoutId',
   'rows','unattributedRows','observedRowCount','totalFeeMinor','taxServiceFeeMinor','completeness','financialAuthority',
   'settlementReady','holdReasons','providerBinding','contentSha256','reportSucceededAt'))
 then raise exception 'cashout_fee_fields_invalid'; end if;
 rid:=p_evidence->>'reportRunId';
 select evidence into prior from private.creator_cashout_fee_reports where execution_id=e.id and report_run_id=rid;
 if prior is not null and prior<>p_evidence then raise exception 'cashout_fee_report_replay_conflict'; end if;
 for row in select value from jsonb_array_elements(p_evidence->'rows') loop
  if row->>'incurredBy' is distinct from e.payout_id or row->>'incurredByType' is distinct from 'payout'
   or row->>'currency' is distinct from 'usd' or not coalesce(row->>'amountMinor' ~ '^-?[0-9]{1,12}$',false)
   or not coalesce(row->>'taxMinor' ~ '^-?[0-9]{1,12}$',false)
   or jsonb_typeof(row->'amountMinor') is distinct from 'number' or jsonb_typeof(row->'taxMinor') is distinct from 'number'
   or nullif(row->>'feeTransactionId','') is null or nullif(row->>'product','') is null or nullif(row->>'featureName','') is null
  then raise exception 'cashout_fee_component_invalid'; end if;
  if exists(select 1 from jsonb_object_keys(row) k where k not in
   ('feeTransactionId','incurredBy','incurredByType','amountMinor','taxMinor','currency','product','suite','featureName','pricingTier','settledVia','balanceTransactionId'))
  then raise exception 'cashout_fee_component_fields_invalid'; end if;
  key_value:=jsonb_build_array(row->>'feeTransactionId',row->>'incurredBy',row->>'incurredByType',row->>'currency',
   row->>'product',row->>'suite',row->>'featureName',coalesce(row->>'pricingTier',''))::text;
  select component into prior from private.creator_cashout_fee_components where execution_id=e.id and component_key=key_value;
  if prior is not null and prior<>row then raise exception 'cashout_fee_component_conflict'; end if;
  insert into private.creator_cashout_fee_components values(e.id,key_value,row,(row->>'amountMinor')::bigint+(row->>'taxMinor')::bigint) on conflict do nothing;
 end loop;
 insert into private.creator_cashout_fee_reports(execution_id,report_run_id,evidence) values(e.id,rid,p_evidence) on conflict do nothing;
 -- Empty reports are not zero-cost evidence. Fee arithmetic and completeness
 -- are distinct; absent/expired account coverage cannot release a reserve.
 if q.fee_report_coverage_verified and q.fee_report_semantics='all_fees.incurred_at.itemized.2:amount_excludes_tax_v1'
  and q.expires_at>clock_timestamp() and not exists(select 1 from private.creator_cashout_qualification_revocations where qualification_id=q.id)
  and exists(select 1 from private.creator_cashout_fee_components where execution_id=e.id) then
  select sum(amount_minor) into total from private.creator_cashout_fee_components where execution_id=e.id;
  if total between 0 and 2147483647 then
   update private.creator_cashout_executions set observed_provider_fee_minor=total,
    phase=case when returned_accounted_at is not null and observed_provider_fee_minor is distinct from total then 'needs_review'
     when total<>expected_provider_fee_minor and phase not in ('return_pending','return_confirmed','reversal_unknown','returned') then 'needs_review' else phase end where id=e.id;
   perform private.finalize_creator_cashout_accounting(e.id);
  else
   update private.creator_cashout_executions set observed_provider_fee_minor=null,phase='needs_review' where id=e.id;
  end if;
 end if;
 select * into strict e from private.creator_cashout_executions where id=e.id;
 return jsonb_build_object('status',e.phase,'observedProviderFeeMinor',e.observed_provider_fee_minor,
  'feeMatchesAcceptedQuote',e.observed_provider_fee_minor=e.expected_provider_fee_minor,
  'accountingComplete',e.finalized_at is not null or e.returned_accounted_at is not null);
end; $$;
revoke all on function public.record_creator_cashout_fee_report(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_creator_cashout_fee_report(uuid,jsonb) to service_role;

create function public.preview_qualified_creator_cashout(p_amount_minor integer,p_payout_type text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q private.creator_cashout_provider_qualifications; app_fee bigint; bank_amount bigint; provider_fee bigint;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'current_session_required'; end if;
 if p_amount_minor is null or p_amount_minor<=0 or p_payout_type is null or p_payout_type not in ('scheduled','instant') then raise exception 'cashout_input_invalid'; end if;
 if exists(select 1 from unnest(array['live_money_enabled','payouts_enabled','stripe_connect_enabled']) k
  where not exists(select 1 from public.platform_money_kill_switches s where s.key=k and s.state='on'))
  or (p_payout_type='instant' and not exists(select 1 from public.platform_money_kill_switches where key='cashout_enabled' and state='on'))
 then return jsonb_build_object('ready',false,'reason','payout_execution_disabled'); end if;
 select * into q from private.creator_cashout_provider_qualifications where creator_id=auth.uid() and payout_type=p_payout_type order by verified_at desc,id desc limit 1;
 if q.id is null or q.expires_at<=clock_timestamp() or q.verified_at>clock_timestamp()
  or not q.manual_schedule_verified or not q.exclusive_writer_verified or not q.zero_additional_application_fee_verified
  or not q.platform_fee_payer_verified or not q.funding_provenance_verified
  or exists(select 1 from private.creator_cashout_qualification_revocations where qualification_id=q.id)
 then return jsonb_build_object('ready',false,'reason','cashout_provider_qualification_required'); end if;
 app_fee:=case when p_payout_type='instant' then public.calculate_creator_instant_cashout_fee(p_amount_minor) else 0 end;
 bank_amount:=floor(((p_amount_minor::bigint-app_fee-q.provider_fee_fixed_minor)*10000)::numeric/(10000+q.provider_fee_bps));
 provider_fee:=((bank_amount*q.provider_fee_bps+9999)/10000)+q.provider_fee_fixed_minor;
 if bank_amount<=0 or bank_amount+provider_fee+app_fee<>p_amount_minor then return jsonb_build_object('ready',false,'reason','cashout_exact_fee_quote_unavailable'); end if;
 return jsonb_build_object('ready',true,'qualificationId',q.id,'grossMinor',p_amount_minor,'appFeeMinor',app_fee,
  'operationId',gen_random_uuid(),
  'expectedProviderFeeMinor',provider_fee,'bankMinor',bank_amount,'payoutType',p_payout_type,'expiresAt',q.expires_at,
  'providerFeeStatus','contract_quote_not_actual','currency','usd','financialAuthority',false);
end; $$;
revoke all on function public.preview_qualified_creator_cashout(integer,text) from public,anon,authenticated,service_role;
grant execute on function public.preview_qualified_creator_cashout(integer,text) to authenticated;

create function public.request_qualified_creator_cashout(p_amount_minor integer,p_payout_type text,p_qualification_id uuid,p_operation_id uuid,
 p_expected_app_fee_minor integer,p_expected_provider_fee_minor integer,p_expected_bank_minor integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior private.creator_cashout_request_operations; quote jsonb; result jsonb; id uuid;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'current_session_required'; end if;
 if p_operation_id is null or p_qualification_id is null then raise exception 'cashout_request_identity_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||auth.uid()::text,0));
 select * into prior from private.creator_cashout_request_operations where creator_id=auth.uid() and operation_id=p_operation_id;
 if prior.request_id is not null then
  if prior.amount_minor is distinct from p_amount_minor or prior.payout_type is distinct from p_payout_type or prior.qualification_id is distinct from p_qualification_id
  then raise exception 'cashout_request_replay_conflict'; end if;
  result:=public.get_my_creator_cashout_execution(prior.request_id);
  if result->'appFeeMinor' is distinct from to_jsonb(p_expected_app_fee_minor)
   or result->'expectedProviderFeeMinor' is distinct from to_jsonb(p_expected_provider_fee_minor)
   or result->'bankMinor' is distinct from to_jsonb(p_expected_bank_minor) then raise exception 'cashout_request_replay_conflict'; end if;
  return result;
 end if;
 if exists(select 1 from public.creator_payout_requests where creator_id=auth.uid() and status in ('requested','approved','processing'))
 then raise exception 'cashout_request_already_pending'; end if;
 quote:=public.preview_qualified_creator_cashout(p_amount_minor,p_payout_type);
 if quote->'ready' is distinct from 'true'::jsonb or quote->>'qualificationId' is distinct from p_qualification_id::text then raise exception 'cashout_quote_expired'; end if;
 if quote->'appFeeMinor' is distinct from to_jsonb(p_expected_app_fee_minor)
  or quote->'expectedProviderFeeMinor' is distinct from to_jsonb(p_expected_provider_fee_minor)
  or quote->'bankMinor' is distinct from to_jsonb(p_expected_bank_minor) then raise exception 'cashout_displayed_terms_changed'; end if;
 result:=public.create_creator_payout_request_safe(p_amount_minor,p_payout_type); id:=(result->>'id')::uuid;
 insert into private.creator_cashout_request_operations values(auth.uid(),p_operation_id,id,p_qualification_id,p_amount_minor,p_payout_type,clock_timestamp());
 perform private.get_creator_cashout_execution_context(id);
 return public.get_my_creator_cashout_execution(id);
end; $$;
revoke all on function public.request_qualified_creator_cashout(integer,text,uuid,uuid,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.request_qualified_creator_cashout(integer,text,uuid,uuid,integer,integer,integer) to authenticated;

create function public.list_my_creator_cashout_executions() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'current_session_required'; end if;
 select coalesce(jsonb_agg(public.get_my_creator_cashout_execution(r.id) order by r.created_at desc,r.id desc),'[]'::jsonb) into result
 from (select id,created_at from public.creator_payout_requests where creator_id=auth.uid() order by created_at desc,id desc limit 20) r;
 return result;
end; $$;
revoke all on function public.list_my_creator_cashout_executions() from public,anon,authenticated,service_role;
grant execute on function public.list_my_creator_cashout_executions() to authenticated;

create function public.cancel_undispatched_creator_cashout(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.creator_cashout_executions; r public.creator_payout_requests;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'current_session_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||auth.uid()::text,0));
 select * into r from public.creator_payout_requests where id=p_request_id and creator_id=auth.uid() for update;
 if r.id is null then raise exception 'cashout_request_not_found'; end if;
 select * into strict e from private.creator_cashout_executions where request_id=r.id for update;
 if r.status='canceled' then return public.get_my_creator_cashout_execution(r.id); end if;
 if e.phase<>'prepared' or e.dispatched_at is not null or e.transfer_id is not null or r.status not in ('requested','approved')
 then raise exception 'cashout_dispatch_already_started'; end if;
 update public.creator_payout_allocations set state='released',updated_at=clock_timestamp() where payout_request_id=r.id and state='reserved';
 update public.creator_payout_requests set status='canceled',updated_at=clock_timestamp() where id=r.id;
 update private.creator_cashout_executions set phase='canceled' where id=e.id;
 return public.get_my_creator_cashout_execution(r.id);
end; $$;
revoke all on function public.cancel_undispatched_creator_cashout(uuid) from public,anon,authenticated,service_role;
grant execute on function public.cancel_undispatched_creator_cashout(uuid) to authenticated;

-- Scheduling remains explicitly OFF. The bounded driver selects existing
-- executions only; it cannot create a request or manufacture a qualification.
alter table private.creator_cashout_executions add column work_token uuid;
alter table private.creator_cashout_executions add column work_lease_until timestamptz;
alter table private.creator_cashout_executions add column next_attempt_at timestamptz not null default clock_timestamp();
create function public.claim_creator_cashout_work() returns jsonb
language plpgsql security definer set search_path='' as $$
declare jobs jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 with candidates as (select id from private.creator_cashout_executions
  where phase not in ('returned','canceled','needs_review') and next_attempt_at<=clock_timestamp()
   and (work_lease_until is null or work_lease_until<clock_timestamp())
  order by next_attempt_at,id limit 3 for update skip locked), claimed as (
  update private.creator_cashout_executions e set work_token=gen_random_uuid(),work_lease_until=clock_timestamp()+interval '2 minutes'
  from candidates c where c.id=e.id returning e.request_id,e.work_token)
 select coalesce(jsonb_agg(jsonb_build_object('requestId',request_id,'lease',work_token)),'[]'::jsonb) into jobs from claimed;
 return jobs;
end; $$;
revoke all on function public.claim_creator_cashout_work() from public,anon,authenticated,service_role;
grant execute on function public.claim_creator_cashout_work() to service_role;
create function public.complete_creator_cashout_work(p_request_id uuid,p_lease uuid,p_complete boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 update private.creator_cashout_executions set work_lease_until=null,work_token=null,
  next_attempt_at=clock_timestamp()+case when p_complete is not true then interval '5 minutes'
   when phase in ('prepared','funded','return_confirmed') then interval '5 seconds'
   when phase='paid' then interval '6 hours' else interval '5 minutes' end
 where request_id=p_request_id and work_token=p_lease;
 return found;
end; $$;
revoke all on function public.complete_creator_cashout_work(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.complete_creator_cashout_work(uuid,uuid,boolean) to service_role;
