-- Isolated test-provider cashout adapter. Nothing seeds account qualification,
-- test access, money, credentials or activation. Production accounting is untouched.
create table private.sandbox_cashout_control (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into private.sandbox_cashout_control values(true,false);
create table private.sandbox_cashout_qualifications (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references auth.users(id),
 platform_account_id text not null check(platform_account_id ~ '^acct_[A-Za-z0-9]+$'),
 account_id text not null check(account_id ~ '^acct_[A-Za-z0-9]+$'),
 destination_id text not null check(destination_id ~ '^(ba|card)_[A-Za-z0-9]+$'),
 environment text not null default 'test' check(environment='test'),
 payout_type text not null check(payout_type in ('scheduled','instant')),
 source_type text not null check(source_type in ('card','bank_account')),
 provider_fee_bps integer not null check(provider_fee_bps between 0 and 10000),
 provider_fee_fixed_minor integer not null check(provider_fee_fixed_minor>=0),
 -- These are explicitly simulated settlement deductions, NEVER actual fees/tax.
 settlement_policy_version text not null check(length(settlement_policy_version) between 1 and 100),
 simulated_tax_bps integer not null check(simulated_tax_bps between 0 and 10000),
 simulated_platform_bps integer not null check(simulated_platform_bps between 0 and 10000),
 simulated_provider_bps integer not null check(simulated_provider_bps between 0 and 10000),
 simulated_provider_fixed_minor integer not null check(simulated_provider_fixed_minor>=0),
 manual_schedule_verified boolean not null check(manual_schedule_verified),
 exclusive_writer_verified boolean not null check(exclusive_writer_verified),
 zero_additional_application_fee_verified boolean not null check(zero_additional_application_fee_verified),
 platform_fee_payer_verified boolean not null check(platform_fee_payer_verified),
 test_mode_verified boolean not null check(test_mode_verified),
 provider_evidence_reference text not null check(length(btrim(provider_evidence_reference)) between 1 and 500),
 verified_at timestamptz not null, expires_at timestamptz not null,
 check(platform_account_id<>account_id), check(expires_at>verified_at),
 check(simulated_tax_bps+simulated_platform_bps+simulated_provider_bps<=10000)
);
create table private.sandbox_cashout_revocations (
 qualification_id uuid primary key references private.sandbox_cashout_qualifications(id),
 revoked_at timestamptz not null default clock_timestamp()
);
create table private.sandbox_cashout_executions (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references auth.users(id),
 originating_session_id uuid not null, operation_id uuid not null,
 qualification_id uuid not null references private.sandbox_cashout_qualifications(id),
 gross_minor integer not null check(gross_minor>0), app_fee_minor integer not null check(app_fee_minor>=0),
 expected_provider_fee_minor integer not null check(expected_provider_fee_minor>=0), bank_minor integer not null check(bank_minor>0),
 phase text not null default 'prepared' check(phase in ('prepared','canceled','funding_unknown','funded','payout_unknown','payout_pending','paid','return_pending','return_confirmed','reversal_unknown','returned','funding_return_pending','funding_return_unknown','needs_review')),
 transfer_id text unique, payout_id text unique, reversal_id text unique,
 dispatch_token uuid, dispatched_at timestamptz, returned_minor integer,
 source_hold boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 unique(creator_id,operation_id), check(bank_minor+app_fee_minor+expected_provider_fee_minor=gross_minor)
);
-- Fresh independent evidence may authorize ONLY a still-unclaimed return of
-- an existing test transfer. Original payout authority/economics never renew.
create table private.sandbox_cashout_recovery_authorities (
 id uuid primary key default gen_random_uuid(), execution_id uuid not null references private.sandbox_cashout_executions(id),
 stage text not null check(stage in ('reversal','funding_return')),
 platform_account_id text not null, account_id text not null, transfer_id text not null,
 environment text not null check(environment='test'), currency text not null check(currency='usd'),
 original_transfer_minor integer not null check(original_transfer_minor>0),
 prior_returned_minor integer not null check(prior_returned_minor>=0),
 recoverable_minor integer not null check(recoverable_minor>0),
 provider_evidence_reference text not null check(length(btrim(provider_evidence_reference)) between 1 and 500),
 provider_evidence_sha256 text not null check(provider_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz not null, expires_at timestamptz not null,
 check(recoverable_minor::bigint+prior_returned_minor<=original_transfer_minor::bigint),
 check(expires_at>verified_at and expires_at<=verified_at+interval '1 hour')
);
alter table private.sandbox_cashout_executions add column recovery_authority_id uuid references private.sandbox_cashout_recovery_authorities(id);
create table private.sandbox_cashout_recovery_revocations (
 authority_id uuid primary key references private.sandbox_cashout_recovery_authorities(id),
 revoked_at timestamptz not null default clock_timestamp()
);
create table private.sandbox_cashout_allocations (
 execution_id uuid not null references private.sandbox_cashout_executions(id),
 money_ledger_id uuid not null references public.money_access_ledger_events(id),
 amount_minor integer not null check(amount_minor>0), source_hash text not null,
 primary key(execution_id,money_ledger_id)
);
create table private.sandbox_cashout_observations (
 execution_id uuid not null references private.sandbox_cashout_executions(id),
 facts_hash text not null, facts jsonb not null, observed_at timestamptz not null default clock_timestamp(),
 primary key(execution_id,facts_hash)
);
create table private.sandbox_cashout_simulated_return_accounting (
 execution_id uuid not null, money_ledger_id uuid not null,
 released_minor integer not null check(released_minor>=0), retained_fixture_cost_minor integer not null check(retained_fixture_cost_minor>=0),
 primary key(execution_id,money_ledger_id),
 foreign key(execution_id,money_ledger_id) references private.sandbox_cashout_allocations(execution_id,money_ledger_id)
);
-- Physical orders retain their own canonical identity. Never manufacture a
-- digital provider event or a payable earnings row to represent merchandise.
create table private.sandbox_cashout_merch_allocations (
 execution_id uuid not null references private.sandbox_cashout_executions(id),
 order_id uuid not null references public.merch_orders(id),
 amount_minor integer not null check(amount_minor>0), source_hash text not null,
 primary key(execution_id,order_id)
);
create index sandbox_cashout_merch_allocations_order_idx on private.sandbox_cashout_merch_allocations(order_id);
create index sandbox_cashout_allocations_source_idx on private.sandbox_cashout_allocations(money_ledger_id);
create table private.sandbox_cashout_merch_simulated_returns (
 execution_id uuid not null, order_id uuid not null,
 released_minor integer not null check(released_minor>=0), retained_fixture_cost_minor integer not null check(retained_fixture_cost_minor>=0),
 primary key(execution_id,order_id),
 foreign key(execution_id,order_id) references private.sandbox_cashout_merch_allocations(execution_id,order_id)
);

create function private.sandbox_cashout_subject_current(p_user uuid,p_session uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
   where u.id=p_user and s.id=p_session and u.deleted_at is null and u.email_confirmed_at is not null
   and (s.not_after is null or s.not_after>clock_timestamp()))
 and not public.is_account_access_restricted(p_user::text)
 and (public.platform_subject_has_role_internal(p_user::text,array['owner','operator'])
 or exists(select 1 from public.beta_access_memberships b where b.user_id=p_user::text and b.access_status='active')
 or exists(select 1 from public.sandbox_monetization_testers t where t.user_id=p_user::text and t.status='active'
   and (t.expires_at is null or t.expires_at>clock_timestamp())));
$$;
create function private.sandbox_cashout_current_user() returns uuid
language plpgsql stable set search_path='' as $$
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true
 or public.resolve_sandbox_monetization_tester() is distinct from true then raise exception 'sandbox_current_tester_required'; end if;
 return auth.uid();
end; $$;
-- Use source-domain locks before creator reservation locks, matching provider
-- ledger update/trigger ordering. Claims and reservations never inspect stale
-- unlocked earnings after waiting for a competing refund transaction.
create function private.lock_sandbox_cashout_creator(p_creator uuid) returns void
language plpgsql set search_path='' as $$
begin
 perform 1 from public.merch_orders where creator_id=p_creator and environment='sandbox' order by id for update;
 perform 1 from public.money_access_ledger_events where creator_id=p_creator and environment='sandbox' order by id for update;
 perform pg_advisory_xact_lock(hashtextextended('sandbox-cashout:'||p_creator::text,0));
end; $$;
create function private.sandbox_cashout_revoke_admission() returns trigger
language plpgsql security definer set search_path='' as $$
declare creator uuid;
begin
 select creator_id into strict creator from private.sandbox_cashout_qualifications where id=new.qualification_id;
 perform private.lock_sandbox_cashout_creator(creator);
 return new;
end; $$;
create trigger sandbox_cashout_revoke_admission before insert on private.sandbox_cashout_revocations
 for each row execute function private.sandbox_cashout_revoke_admission();
create function private.sandbox_cashout_recovery_admission() returns trigger
language plpgsql set search_path='' as $$
declare e private.sandbox_cashout_executions; q private.sandbox_cashout_qualifications; target uuid;
begin
 if tg_table_name='sandbox_cashout_recovery_revocations' then
  select execution_id into target from private.sandbox_cashout_recovery_authorities where id=new.authority_id;
 else target:=new.execution_id; end if;
 select * into e from private.sandbox_cashout_executions where id=target;
 if e.id is null then raise exception 'sandbox_recovery_execution_required'; end if;
 perform private.lock_sandbox_cashout_creator(e.creator_id);
 select * into e from private.sandbox_cashout_executions where id=target for update;
 if tg_table_name='sandbox_cashout_recovery_revocations' then return new; end if;
 select * into q from private.sandbox_cashout_qualifications where id=e.qualification_id;
 if not ((new.stage='reversal' and e.phase='return_confirmed' and e.returned_minor=e.bank_minor)
  or (new.stage='funding_return' and e.phase='funding_return_pending' and e.payout_id is null))
  or e.transfer_id is null or new.transfer_id is distinct from e.transfer_id
  or new.account_id is distinct from q.account_id or new.platform_account_id is distinct from q.platform_account_id
  or new.original_transfer_minor<>e.bank_minor or new.prior_returned_minor<>0 or new.recoverable_minor<>e.bank_minor
  or new.verified_at>clock_timestamp() or new.verified_at<clock_timestamp()-interval '5 minutes' or new.expires_at<=clock_timestamp()
 then raise exception 'sandbox_recovery_binding_invalid'; end if;
 return new;
end; $$;
create trigger sandbox_cashout_recovery_admission before insert on private.sandbox_cashout_recovery_authorities
 for each row execute function private.sandbox_cashout_recovery_admission();
create trigger sandbox_cashout_recovery_revoke_admission before insert on private.sandbox_cashout_recovery_revocations
 for each row execute function private.sandbox_cashout_recovery_admission();
create function private.sandbox_cashout_recovery_current(p_execution uuid,p_stage text) returns uuid
language sql stable set search_path='' as $$
 select a.id from private.sandbox_cashout_recovery_authorities a
 join private.sandbox_cashout_executions e on e.id=a.execution_id
 join private.sandbox_cashout_qualifications q on q.id=e.qualification_id
 where e.id=p_execution and a.stage=p_stage and a.environment='test' and a.currency='usd'
 and a.transfer_id=e.transfer_id and a.account_id=q.account_id and a.platform_account_id=q.platform_account_id
 and a.original_transfer_minor=e.bank_minor and a.prior_returned_minor=0 and a.recoverable_minor=e.bank_minor
 and a.verified_at<=clock_timestamp() and a.expires_at>clock_timestamp()
 and not exists(select 1 from private.sandbox_cashout_recovery_revocations r where r.authority_id=a.id)
 order by a.verified_at desc,a.id desc limit 1;
$$;
create function public.request_sandbox_creator_cashout(p_amount_minor integer,p_payout_type text,p_qualification_id uuid,p_operation_id uuid,
 p_expected_app_fee_minor integer,p_expected_provider_fee_minor integer,p_expected_bank_minor integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.sandbox_cashout_current_user(); prior private.sandbox_cashout_executions; quote jsonb;
 new_execution uuid; m record; s jsonb; used bigint; take bigint; remaining bigint:=p_amount_minor;
begin
 if p_operation_id is null or p_qualification_id is null then raise exception 'cashout_request_identity_required'; end if;
 perform private.lock_sandbox_cashout_creator(u);
 select * into prior from private.sandbox_cashout_executions where creator_id=u and operation_id=p_operation_id;
 if prior.id is not null then
  if prior.qualification_id is distinct from p_qualification_id or prior.gross_minor is distinct from p_amount_minor
  or prior.app_fee_minor is distinct from p_expected_app_fee_minor or prior.expected_provider_fee_minor is distinct from p_expected_provider_fee_minor
  or prior.bank_minor is distinct from p_expected_bank_minor
  or not exists(select 1 from private.sandbox_cashout_qualifications where id=prior.qualification_id and payout_type=p_payout_type)
  then raise exception 'cashout_request_replay_conflict'; end if;
  return private.sandbox_cashout_summary(prior.id);
 end if;
 if exists(select 1 from private.sandbox_cashout_executions where creator_id=u and phase not in ('paid','returned','canceled'))
 then raise exception 'sandbox_cashout_already_pending'; end if;
 if exists(select 1 from private.sandbox_cashout_executions where creator_id=u and source_hold and phase<>'canceled')
 then raise exception 'sandbox_source_reconciliation_required'; end if;
 quote:=public.preview_sandbox_creator_cashout(p_amount_minor,p_payout_type);
 if quote->'ready' is distinct from 'true'::jsonb or quote->>'qualificationId' is distinct from p_qualification_id::text
 then raise exception 'sandbox_cashout_quote_unavailable'; end if;
 if quote->'appFeeMinor' is distinct from to_jsonb(p_expected_app_fee_minor)
 or quote->'expectedProviderFeeMinor' is distinct from to_jsonb(p_expected_provider_fee_minor)
 or quote->'bankMinor' is distinct from to_jsonb(p_expected_bank_minor) then raise exception 'cashout_displayed_terms_changed'; end if;
 insert into private.sandbox_cashout_executions(creator_id,originating_session_id,operation_id,qualification_id,gross_minor,app_fee_minor,expected_provider_fee_minor,bank_minor)
 values(u,(auth.jwt()->>'session_id')::uuid,p_operation_id,p_qualification_id,p_amount_minor,p_expected_app_fee_minor,p_expected_provider_fee_minor,p_expected_bank_minor) returning private.sandbox_cashout_executions.id into new_execution;
 for m in select * from public.money_access_ledger_events where creator_id=u and environment='sandbox' order by money_access_ledger_events.created_at,money_access_ledger_events.id loop
  s:=private.sandbox_cashout_source(m.id,p_qualification_id);
  if s is null then continue; end if;
  select coalesce(sum(a.amount_minor-coalesce(r.released_minor,0)),0) into used from private.sandbox_cashout_allocations a join private.sandbox_cashout_executions e on e.id=a.execution_id
   left join private.sandbox_cashout_simulated_return_accounting r on r.execution_id=a.execution_id and r.money_ledger_id=a.money_ledger_id
   where a.money_ledger_id=m.id and e.phase<>'canceled';
  take:=least(remaining,greatest(0,(s->>'netMinor')::bigint-used));
  if take>0 then insert into private.sandbox_cashout_allocations values(new_execution,m.id,take,s->>'sourceHash'); remaining:=remaining-take; end if;
  exit when remaining=0;
 end loop;
 if remaining>0 then
  for m in select * from public.merch_orders where creator_id=u and environment='sandbox' order by merch_orders.created_at,merch_orders.id loop
   s:=private.sandbox_cashout_merch_source(m.id,p_qualification_id);
   if s is null then continue; end if;
   select coalesce(sum(a.amount_minor-coalesce(r.released_minor,0)),0) into used
    from private.sandbox_cashout_merch_allocations a join private.sandbox_cashout_executions e on e.id=a.execution_id
    left join private.sandbox_cashout_merch_simulated_returns r on r.execution_id=a.execution_id and r.order_id=a.order_id
    where a.order_id=m.id and e.phase<>'canceled';
   take:=least(remaining,greatest(0,(s->>'netMinor')::bigint-used));
   if take>0 then insert into private.sandbox_cashout_merch_allocations values(new_execution,m.id,take,s->>'sourceHash'); remaining:=remaining-take; end if;
   exit when remaining=0;
  end loop;
 end if;
 if remaining<>0 then raise exception 'sandbox_earnings_insufficient'; end if;
 return private.sandbox_cashout_summary(new_execution);
end; $$;
create function public.get_sandbox_creator_cashout_execution_context(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.sandbox_cashout_executions; q private.sandbox_cashout_qualifications;
begin
 select * into e from private.sandbox_cashout_executions where id=p_request_id;
 if e.id is null then raise exception 'sandbox_cashout_not_found'; end if;
 select * into q from private.sandbox_cashout_qualifications where id=e.qualification_id;
 return jsonb_build_object('requestId',e.id,'executionId',e.id,'platformAccountId',q.platform_account_id,
 'accountId',q.account_id,'destinationId',q.destination_id,'environment','test','method',case when q.payout_type='scheduled' then 'standard' else 'instant' end,
 'sourceType',q.source_type,'grossMinor',e.gross_minor,'appFeeMinor',e.app_fee_minor,'expectedProviderFeeMinor',e.expected_provider_fee_minor,
 'bankMinor',e.bank_minor,'currency','usd','phase',e.phase,'transferId',e.transfer_id,'payoutId',e.payout_id,'reversalId',e.reversal_id,
 'dispatchKey','cw-cashout-'||e.id::text,'dispatchedAt',floor(extract(epoch from e.dispatched_at)),'inlineKnownZeroQualified',false);
end; $$;
create function public.claim_sandbox_creator_cashout_dispatch(p_request_id uuid,p_stage text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.sandbox_cashout_executions; q private.sandbox_cashout_qualifications; tok uuid:=gen_random_uuid(); recovery uuid;
begin
 select * into e from private.sandbox_cashout_executions where id=p_request_id;
 if e.id is null then raise exception 'sandbox_cashout_not_found'; end if;
 perform private.lock_sandbox_cashout_creator(e.creator_id);
 select * into e from private.sandbox_cashout_executions where id=p_request_id for update;
 if p_stage is null or not ((p_stage='funding' and e.phase='prepared') or (p_stage='payout' and e.phase='funded')
 or (p_stage='reversal' and e.phase='return_confirmed') or (p_stage='funding_return' and e.phase='funding_return_pending'))
 then return jsonb_build_object('claimed',false,'token',tok); end if;
 perform 1 from private.sandbox_cashout_control where singleton for share;
 perform 1 from public.platform_money_kill_switches where key in
  ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled')
  order by key for share;
 if not private.sandbox_cashout_enabled() then raise exception 'sandbox_payout_execution_disabled'; end if;
 select * into q from private.sandbox_cashout_qualifications where id=e.qualification_id;
 if not exists(select 1 from public.creator_payout_accounts a where a.creator_user_id=e.creator_id::text
  and a.provider='stripe_connect' and a.provider_environment='test' and a.provider_account_id=q.account_id)
 then raise exception 'sandbox_cashout_provider_qualification_required'; end if;
 if q.verified_at>clock_timestamp() or q.expires_at<=clock_timestamp()
 or exists(select 1 from private.sandbox_cashout_revocations where qualification_id=q.id) then
  if p_stage not in ('reversal','funding_return') then raise exception 'sandbox_cashout_provider_qualification_required'; end if;
  recovery:=private.sandbox_cashout_recovery_current(e.id,p_stage);
  if recovery is null then raise exception 'sandbox_recovery_authority_required'; end if;
 end if;
 if p_stage in ('funding','payout') then
  -- Freeze every current subject/cohort authority row until the durable claim
  -- commits. Revocation that committed first is re-read after these waits.
  perform 1 from auth.users where id=e.creator_id for share;
  perform 1 from auth.sessions where id=e.originating_session_id and user_id=e.creator_id for share;
  perform 1 from public.sandbox_monetization_testers where user_id=e.creator_id::text for share;
  perform 1 from public.beta_access_memberships where user_id=e.creator_id::text for share;
  perform 1 from public.platform_role_memberships where user_id=e.creator_id::text for share;
  if not private.sandbox_cashout_subject_current(e.creator_id,e.originating_session_id) then raise exception 'sandbox_origin_tester_required'; end if;
  if e.source_hold or exists(select 1 from private.sandbox_cashout_allocations a where a.execution_id=e.id
   and (private.sandbox_cashout_source(a.money_ledger_id,q.id)->>'sourceHash') is distinct from a.source_hash)
   or exists(select 1 from private.sandbox_cashout_merch_allocations a where a.execution_id=e.id
    and (private.sandbox_cashout_merch_source(a.order_id,q.id)->>'sourceHash') is distinct from a.source_hash)
  then raise exception 'sandbox_source_reconciliation_required'; end if;
 end if;
 update private.sandbox_cashout_executions set phase=case p_stage when 'funding' then 'funding_unknown' when 'payout' then 'payout_unknown'
 when 'funding_return' then 'funding_return_unknown' else 'reversal_unknown' end,dispatch_token=tok,dispatched_at=clock_timestamp(),
 recovery_authority_id=coalesce(recovery,recovery_authority_id) where id=e.id;
 return jsonb_build_object('claimed',true,'token',tok);
end; $$;
create function public.cancel_undispatched_sandbox_creator_cashout(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.sandbox_cashout_current_user(); e private.sandbox_cashout_executions;
begin
 perform private.lock_sandbox_cashout_creator(u);
 select * into e from private.sandbox_cashout_executions where id=p_request_id and creator_id=u for update;
 if e.id is null then raise exception 'sandbox_cashout_not_found'; end if;
 if e.phase='prepared' then update private.sandbox_cashout_executions set phase='canceled' where id=e.id;
 elsif e.phase='funded' and e.payout_id is null then update private.sandbox_cashout_executions set phase='funding_return_pending' where id=e.id;
 elsif e.phase not in ('canceled','funding_return_pending','funding_return_unknown','returned') then raise exception 'sandbox_cashout_cannot_cancel'; end if;
 return private.sandbox_cashout_summary(e.id);
end; $$;
create function private.sandbox_cashout_enabled() returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from private.sandbox_cashout_control where singleton and enabled)
 and not exists(select 1 from unnest(array['live_money_enabled','payouts_enabled','cashout_enabled']) k
 where not exists(select 1 from public.platform_money_kill_switches s where s.key=k and s.state='off'))
 and not exists(select 1 from unnest(array['stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled']) k
 where not exists(select 1 from public.platform_money_kill_switches s where s.key=k and s.state='sandbox_only'));
$$;
-- Refund/terminal events on the same provider transaction invalidate the source.
-- If an older provider path has no transaction identity, use its exact buyer/source
-- domain conservatively; never reinterpret missing linkage as no refund.
create function private.sandbox_cashout_source(p_id uuid,p_qualification uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare m public.money_access_ledger_events; p public.provider_events; q private.sandbox_cashout_qualifications;
 net bigint; h text;
begin
 select * into m from public.money_access_ledger_events where id=p_id;
 select * into q from private.sandbox_cashout_qualifications where id=p_qualification;
 select * into p from public.provider_events where id=m.provider_event_id;
 if m.id is null or p.id is null or q.id is null or m.creator_id is distinct from q.creator_id or m.user_id is null
 or m.user_id=m.creator_id or m.environment<>'sandbox' or m.currency<>'usd' or m.payable_state<>'not_payable'
 or m.status not in ('sandbox_only','verified') or m.amount_minor<=0 or p.environment<>'sandbox'
 or p.status<>'processed' or p.user_id is distinct from m.user_id
 or p.provider not in ('revenuecat_app_store','revenuecat_google_play','google_play','revenuecat','stripe_physical_goods')
 or m.event_type not in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','checkout.session.completed','checkout.session.async_payment_succeeded')
 or exists(select 1 from public.money_access_ledger_events t where t.environment='sandbox'
   and t.creator_id=m.creator_id and t.user_id=m.user_id and t.source_type is not distinct from m.source_type
   and t.source_id is not distinct from m.source_id
   and (nullif(m.metadata->>'original_transaction_id','') is null
     or t.metadata->>'original_transaction_id'=m.metadata->>'original_transaction_id')
   and (t.payable_state in ('refunded','reversed','chargeback') or t.status in ('refunded','reversed','chargeback')
     or t.event_type in ('REFUND','REVOCATION','charge.refunded','charge.dispute.created')))
 then return null; end if;
 net:=m.amount_minor::bigint-((m.amount_minor::bigint*q.simulated_tax_bps+9999)/10000)
 -((m.amount_minor::bigint*q.simulated_platform_bps+9999)/10000)
 -((m.amount_minor::bigint*q.simulated_provider_bps+9999)/10000)-q.simulated_provider_fixed_minor;
 if net<=0 or net>2147483647 then return null; end if;
 h:=md5(to_jsonb(m)::text||to_jsonb(p)::text);
 return jsonb_build_object('netMinor',net,'sourceHash',h);
end; $$;

create function private.sandbox_cashout_merch_source(p_id uuid,p_qualification uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare o public.merch_orders; p public.stripe_merch_events; q private.sandbox_cashout_qualifications;
 b private.commerce_tax_checkout_bindings; net bigint; h text;
begin
 select * into o from public.merch_orders where id=p_id;
 select * into q from private.sandbox_cashout_qualifications where id=p_qualification;
 select * into b from private.commerce_tax_checkout_bindings where feature='physical_merch' and identity_id=p_id;
 if o.id is null or q.id is null or o.creator_id is distinct from q.creator_id or o.buyer_id is null or o.buyer_id=o.creator_id
  or o.provider is distinct from 'stripe_physical_goods' or o.environment is distinct from 'sandbox' or o.currency is distinct from 'usd'
  or o.payment_status is distinct from 'paid' or o.order_status not in ('paid','fulfilled') or o.paid_at is null
  or o.amount_total_minor is null or o.amount_total_minor<=0 or o.digital_access_grant_id is not null
  or coalesce(o.refunded_amount_minor,0)<>0 or o.refunded_at is not null or o.canceled_at is not null
  or o.fulfillment_status in ('canceled','blocked','returned')
  or b.identity_id is null or b.environment is distinct from 'sandbox' or b.product_id is distinct from o.product_id::text
  or b.account_id is distinct from q.platform_account_id
  or exists(select 1 from public.stripe_merch_events t where t.linked_order_id=o.id and t.environment='sandbox'
   and t.status='processed' and t.event_type in ('charge.refunded','charge.dispute.created'))
 then return null; end if;
 -- The canonical signed-webhook processor proves the order identity, amount,
 -- currency and test mode. The checkout's immutable tax-account binding came
 -- before provider dispatch and the Edge path verified that account with GET.
 select * into p from public.stripe_merch_events where linked_order_id=o.id and provider='stripe'
  and environment='sandbox' and status='processed' and processed_at is not null
  and raw_event_hash ~ '^[a-f0-9]{64}$' and metadata->>'processing_reason'='payment_confirmed'
  and ((event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded') and object_id=o.stripe_checkout_session_id)
   or (event_type='payment_intent.succeeded' and object_id=o.stripe_payment_intent_id))
  order by processed_at,id limit 1;
 if p.id is null then return null; end if;
 net:=o.amount_total_minor::bigint-((o.amount_total_minor::bigint*q.simulated_tax_bps+9999)/10000)
  -((o.amount_total_minor::bigint*q.simulated_platform_bps+9999)/10000)
  -((o.amount_total_minor::bigint*q.simulated_provider_bps+9999)/10000)-q.simulated_provider_fixed_minor;
 if net<=0 or net>2147483647 then return null; end if;
 -- Shipping progress does not invalidate unchanged payment economics. Refund,
 -- dispute, ownership, mode, amount or payment-identity changes do invalidate.
 h:=md5(jsonb_build_object('order',o.id,'buyer',o.buyer_id,'creator',o.creator_id,'product',o.product_id,
  'environment',o.environment,'currency',o.currency,'amount',o.amount_total_minor,'paidAt',o.paid_at,
  'checkout',o.stripe_checkout_session_id,'paymentIntent',o.stripe_payment_intent_id,'charge',o.stripe_charge_id,
  'receipt',p.id,'receiptHash',p.raw_event_hash,'binding',to_jsonb(b))::text);
 return jsonb_build_object('netMinor',net,'sourceHash',h);
end; $$;

create function public.record_sandbox_creator_cashout_observation(p_request_id uuid,p_dispatch_token uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.sandbox_cashout_executions; q private.sandbox_cashout_qualifications; kind text; obj text; status text; hash text;
 allocation record; remaining_fixture_cost integer; retained integer;
begin
 if jsonb_typeof(p_facts) is distinct from 'object' or length(p_facts::text)>12000 then raise exception 'sandbox_observation_invalid'; end if;
 select * into e from private.sandbox_cashout_executions where id=p_request_id;
 if e.id is null then raise exception 'sandbox_cashout_not_found'; end if;
 perform private.lock_sandbox_cashout_creator(e.creator_id);
 select * into e from private.sandbox_cashout_executions where id=p_request_id for update;
 select * into q from private.sandbox_cashout_qualifications where id=e.qualification_id;
 kind:=p_facts->>'kind'; obj:=p_facts->>'objectId'; status:=p_facts->>'status'; hash:=md5(p_facts::text);
 if p_dispatch_token is not null and p_dispatch_token is distinct from e.dispatch_token then raise exception 'sandbox_stale_dispatch_token'; end if;
 if p_facts->>'environment' is distinct from 'test' or p_facts->>'accountId' is distinct from q.account_id
 or p_facts->'amountMinor' is distinct from to_jsonb(e.bank_minor) or obj is null
 then raise exception 'sandbox_observation_binding_invalid'; end if;
 if exists(select 1 from private.sandbox_cashout_observations where execution_id=e.id and facts_hash=hash) then return private.sandbox_cashout_summary(e.id); end if;
 if e.phase in ('canceled','returned') then raise exception 'sandbox_terminal_observation_conflict'; end if;
 if kind='transfer' then
  if obj !~ '^tr_[A-Za-z0-9]+$' or (e.transfer_id is not null and e.transfer_id<>obj)
  or jsonb_typeof(p_facts->'fullyReversed') is distinct from 'boolean'
  then raise exception 'sandbox_transfer_binding_invalid'; end if;
  if e.phase='funding_unknown' and p_facts->'reversedMinor'='0'::jsonb and p_facts->'fullyReversed'='false'::jsonb then
   update private.sandbox_cashout_executions set transfer_id=obj,phase='funded' where id=e.id;
  elsif e.phase='reversal_unknown' and e.returned_minor=e.bank_minor
   and p_facts->'reversedMinor'=to_jsonb(e.bank_minor) and p_facts->'fullyReversed'='true'::jsonb then
   update private.sandbox_cashout_executions set phase='returned' where id=e.id;
  else raise exception 'sandbox_transfer_phase_conflict'; end if;
 elsif kind='payout' then
  if obj !~ '^po_[A-Za-z0-9]+$' or (e.payout_id is not null and e.payout_id<>obj)
   or p_facts->>'destinationId' is distinct from q.destination_id
   or status is null or status not in ('pending','in_transit','paid','failed','canceled')
   or e.phase not in ('payout_unknown','payout_pending','paid','return_pending','return_confirmed','needs_review')
  then raise exception 'sandbox_payout_binding_invalid'; end if;
  -- Paid may later fail; stale pending cannot undo paid/returned evidence.
  if e.phase in ('paid','return_pending','return_confirmed') and status in ('pending','in_transit') then raise exception 'sandbox_payout_regression'; end if;
  if e.phase in ('return_pending','return_confirmed') and status='paid' then raise exception 'sandbox_payout_regression'; end if;
  if e.phase='return_confirmed' and status in ('failed','canceled') then
   -- A late observation without balance proof cannot erase a prior proof.
   null;
  elsif status in ('failed','canceled') and p_facts->'returnedMinor'=to_jsonb(e.bank_minor)
   and p_facts->>'returnTransactionId' ~ '^txn_[A-Za-z0-9]+$' then
   update private.sandbox_cashout_executions set payout_id=obj,phase='return_confirmed',returned_minor=bank_minor where id=e.id;
  else
   update private.sandbox_cashout_executions set payout_id=obj,phase=case status when 'paid' then 'paid'
    when 'failed' then 'return_pending' when 'canceled' then 'return_pending' else 'payout_pending' end where id=e.id;
  end if;
 elsif kind='reversal' then
  if e.phase<>'reversal_unknown' or e.returned_minor is distinct from e.bank_minor
   or obj !~ '^trr_[A-Za-z0-9]+$' or p_facts->>'transferId' is distinct from e.transfer_id
  then raise exception 'sandbox_reversal_binding_invalid'; end if;
  update private.sandbox_cashout_executions set reversal_id=obj,phase='returned' where id=e.id;
 elsif kind='funding_return' then
  if e.phase<>'funding_return_unknown' or e.payout_id is not null or obj !~ '^trr_[A-Za-z0-9]+$'
   or p_facts->>'transferId' is distinct from e.transfer_id or p_facts->>'platformAccountId' is distinct from q.platform_account_id
   or p_facts#>>'{fundingBalance,sourceId}' is distinct from e.transfer_id
   or p_facts#>>'{returnBalance,sourceId}' is distinct from obj
   or p_facts#>'{fundingBalance,amountMinor}' is distinct from to_jsonb(-e.bank_minor)
   or p_facts#>'{returnBalance,amountMinor}' is distinct from to_jsonb(e.bank_minor)
   or p_facts#>>'{fundingBalance,status}' is distinct from 'available' or p_facts#>>'{returnBalance,status}' is distinct from 'available'
   or p_facts#>>'{fundingBalance,currency}' is distinct from 'usd' or p_facts#>>'{returnBalance,currency}' is distinct from 'usd'
   or p_facts#>>'{fundingBalance,type}' is distinct from 'transfer'
   or coalesce(p_facts#>>'{returnBalance,type}','') not in ('transfer_refund','transfer_cancel')
  then raise exception 'sandbox_funding_return_binding_invalid'; end if;
  update private.sandbox_cashout_executions set reversal_id=obj,phase='returned',returned_minor=bank_minor where id=e.id;
 else raise exception 'sandbox_observation_kind_invalid'; end if;
 insert into private.sandbox_cashout_observations values(e.id,hash,p_facts,clock_timestamp());
 -- Explicit fixture economics, not an actual-fee receipt. Return app fee and
 -- principal; retain the immutable simulated provider quote once. This never
 -- marks any public source payable or infers actual provider cost from absence.
 if (select phase from private.sandbox_cashout_executions where id=e.id)='returned' then
  remaining_fixture_cost:=e.expected_provider_fee_minor;
  for allocation in select * from private.sandbox_cashout_allocations where execution_id=e.id order by money_ledger_id loop
   retained:=least(allocation.amount_minor,remaining_fixture_cost); remaining_fixture_cost:=remaining_fixture_cost-retained;
   insert into private.sandbox_cashout_simulated_return_accounting values(e.id,allocation.money_ledger_id,allocation.amount_minor-retained,retained);
  end loop;
  for allocation in select * from private.sandbox_cashout_merch_allocations where execution_id=e.id order by order_id loop
   retained:=least(allocation.amount_minor,remaining_fixture_cost); remaining_fixture_cost:=remaining_fixture_cost-retained;
   insert into private.sandbox_cashout_merch_simulated_returns values(e.id,allocation.order_id,allocation.amount_minor-retained,retained);
  end loop;
 end if;
 return private.sandbox_cashout_summary(e.id);
end; $$;

create function private.hold_sandbox_cashout_changed_source() returns trigger
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if tg_op='DELETE' then
  if old.environment<>'sandbox' then return null; end if;
 elsif new.environment<>'sandbox' then return null; end if;
 c:=case when tg_op='DELETE' then old.creator_id else new.creator_id end;
 if c is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('sandbox-cashout:'||c::text,0));
 update private.sandbox_cashout_executions e set source_hold=true
 where e.creator_id=c and e.phase<>'canceled' and exists(
  select 1 from private.sandbox_cashout_allocations a where a.execution_id=e.id
  and (private.sandbox_cashout_source(a.money_ledger_id,e.qualification_id)->>'sourceHash') is distinct from a.source_hash);
 return null;
end; $$;
create trigger hold_sandbox_cashout_changed_source after insert or update or delete on public.money_access_ledger_events
 for each row execute function private.hold_sandbox_cashout_changed_source();

create function private.hold_sandbox_cashout_changed_merch() returns trigger
language plpgsql security definer set search_path='' as $$
declare source_id uuid; c uuid;
begin
 source_id:=case when tg_op='DELETE' then old.id else new.id end;
 for c in select distinct e.creator_id from private.sandbox_cashout_executions e
  join private.sandbox_cashout_merch_allocations a on a.execution_id=e.id where a.order_id=source_id order by e.creator_id loop
  perform pg_advisory_xact_lock(hashtextextended('sandbox-cashout:'||c::text,0));
  update private.sandbox_cashout_executions e set source_hold=true where e.creator_id=c and e.phase<>'canceled'
   and exists(select 1 from private.sandbox_cashout_merch_allocations a where a.execution_id=e.id and a.order_id=source_id
    and (private.sandbox_cashout_merch_source(a.order_id,e.qualification_id)->>'sourceHash') is distinct from a.source_hash);
 end loop;
 return null;
end; $$;
create trigger hold_sandbox_cashout_changed_merch after update or delete on public.merch_orders
 for each row execute function private.hold_sandbox_cashout_changed_merch();

create function private.sandbox_cashout_summary(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('requestId',e.id,'status',e.phase,'environment','test','financialAuthority',false,
 'grossMinor',e.gross_minor,'appFeeMinor',e.app_fee_minor,'bankMinor',e.bank_minor,
 'expectedProviderFeeMinor',e.expected_provider_fee_minor,'observedProviderFeeMinor',null,
 'feeStatus','simulated_not_actual','earningsBasis','sandbox_fixture_deductions_not_actual_fees',
 'settlementPolicyVersion',q.settlement_policy_version,'bankPaid',false,'providerTestPaid',e.phase='paid',
 'returnedToPlatform',e.phase='returned','canRetry',false,'canCancel',e.phase in ('prepared','funded'),
 'fundingReturnHeld',e.phase in ('funding_return_pending','funding_return_unknown'),
 'sourceHeld',e.source_hold,
 'qualificationStatus',case when q.expires_at<=clock_timestamp() or exists(select 1 from private.sandbox_cashout_revocations where qualification_id=q.id) then 'expired_or_revoked' else 'current' end,
 'recoveryAuthorityRequired',e.phase in ('return_confirmed','funding_return_pending')
  and (q.expires_at<=clock_timestamp() or exists(select 1 from private.sandbox_cashout_revocations where qualification_id=q.id))
  and private.sandbox_cashout_recovery_current(e.id,case when e.phase='return_confirmed' then 'reversal' else 'funding_return' end) is null,
 'ownerAction',case when e.phase in ('return_confirmed','funding_return_pending')
  and (q.expires_at<=clock_timestamp() or exists(select 1 from private.sandbox_cashout_revocations where qualification_id=q.id))
  and private.sandbox_cashout_recovery_current(e.id,case when e.phase='return_confirmed' then 'reversal' else 'funding_return' end) is null
  then 'sandbox_recovery_authority_required'
  when e.source_hold then 'sandbox_source_reconciliation_required'
  when e.phase in ('prepared','funded') and (q.expires_at<=clock_timestamp() or exists(select 1 from private.sandbox_cashout_revocations where qualification_id=q.id))
  then 'sandbox_cashout_provider_qualification_required' else null end)
 from private.sandbox_cashout_executions e join private.sandbox_cashout_qualifications q on q.id=e.qualification_id where e.id=p_id;
$$;
create function public.get_my_sandbox_creator_cashout_execution(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.sandbox_cashout_current_user();
begin
 if not exists(select 1 from private.sandbox_cashout_executions where id=p_request_id and creator_id=u) then raise exception 'sandbox_cashout_not_found'; end if;
 return private.sandbox_cashout_summary(p_request_id);
end; $$;
create function public.list_my_sandbox_creator_cashout_executions() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.sandbox_cashout_current_user(); r jsonb;
begin
 select coalesce(jsonb_agg(private.sandbox_cashout_summary(e.id) order by e.created_at desc),'[]') into r
 from(select id,created_at from private.sandbox_cashout_executions where creator_id=u order by created_at desc,id desc limit 20)e;
 return r;
end; $$;
create function public.preview_sandbox_creator_cashout(p_amount_minor integer,p_payout_type text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.sandbox_cashout_current_user(); q private.sandbox_cashout_qualifications;
 app_fee bigint; bank bigint; fee bigint; available bigint; merch_available bigint;
begin
 if p_amount_minor is null or p_amount_minor<=0 or p_payout_type is null or p_payout_type not in ('scheduled','instant') then raise exception 'cashout_input_invalid'; end if;
 if not private.sandbox_cashout_enabled() then return jsonb_build_object('ready',false,'reason','sandbox_payout_execution_disabled','environment','test','financialAuthority',false); end if;
 select * into q from private.sandbox_cashout_qualifications a where creator_id=u and payout_type=p_payout_type
 and verified_at<=clock_timestamp() and expires_at>clock_timestamp()
 and not exists(select 1 from private.sandbox_cashout_revocations r where r.qualification_id=a.id)
 and exists(select 1 from public.creator_payout_accounts c where c.creator_user_id=u::text
  and c.provider='stripe_connect' and c.provider_environment='test' and c.provider_account_id=a.account_id)
 order by verified_at desc,id desc limit 1;
 if q.id is null then return jsonb_build_object('ready',false,'reason','sandbox_cashout_provider_qualification_required','environment','test','financialAuthority',false); end if;
 select coalesce(sum(greatest(0,(private.sandbox_cashout_source(m.id,q.id)->>'netMinor')::bigint
 -coalesce((select sum(a.amount_minor-coalesce(r.released_minor,0)) from private.sandbox_cashout_allocations a join private.sandbox_cashout_executions e on e.id=a.execution_id
 left join private.sandbox_cashout_simulated_return_accounting r on r.execution_id=a.execution_id and r.money_ledger_id=a.money_ledger_id
 where a.money_ledger_id=m.id and e.phase<>'canceled'),0))),0)
 into available from public.money_access_ledger_events m where creator_id=u and environment='sandbox';
 select coalesce(sum(greatest(0,(private.sandbox_cashout_merch_source(o.id,q.id)->>'netMinor')::bigint
  -coalesce((select sum(a.amount_minor-coalesce(r.released_minor,0)) from private.sandbox_cashout_merch_allocations a
   join private.sandbox_cashout_executions e on e.id=a.execution_id
   left join private.sandbox_cashout_merch_simulated_returns r on r.execution_id=a.execution_id and r.order_id=a.order_id
   where a.order_id=o.id and e.phase<>'canceled'),0))),0)
 into merch_available from public.merch_orders o where creator_id=u and environment='sandbox';
 available:=available+merch_available;
 if available<p_amount_minor then return jsonb_build_object('ready',false,'reason','sandbox_earnings_insufficient','availableMinor',available,'earningsBasis','sandbox_fixture_deductions_not_actual_fees','environment','test','financialAuthority',false); end if;
 app_fee:=case when p_payout_type='instant' then public.calculate_creator_instant_cashout_fee(p_amount_minor) else 0 end;
 bank:=floor(((p_amount_minor::bigint-app_fee-q.provider_fee_fixed_minor)*10000)::numeric/(10000+q.provider_fee_bps));
 fee:=((bank*q.provider_fee_bps+9999)/10000)+q.provider_fee_fixed_minor;
 if bank<=0 or bank+fee+app_fee<>p_amount_minor then return jsonb_build_object('ready',false,'reason','cashout_exact_fee_quote_unavailable','environment','test','financialAuthority',false); end if;
 return jsonb_build_object('ready',true,'qualificationId',q.id,'operationId',gen_random_uuid(),'grossMinor',p_amount_minor,
 'appFeeMinor',app_fee,'expectedProviderFeeMinor',fee,'bankMinor',bank,'payoutType',p_payout_type,'expiresAt',q.expires_at,
 'providerFeeStatus','contract_quote_not_actual','currency','usd','environment','test','financialAuthority',false,
 'earningsBasis','sandbox_fixture_deductions_not_actual_fees','settlementPolicyVersion',q.settlement_policy_version);
end; $$;

do $$ declare t text; r record; begin
 foreach t in array array['sandbox_cashout_control','sandbox_cashout_qualifications','sandbox_cashout_revocations','sandbox_cashout_executions','sandbox_cashout_allocations','sandbox_cashout_observations','sandbox_cashout_simulated_return_accounting','sandbox_cashout_merch_allocations','sandbox_cashout_merch_simulated_returns','sandbox_cashout_recovery_authorities','sandbox_cashout_recovery_revocations'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
 foreach t in array array['sandbox_cashout_qualifications','sandbox_cashout_revocations','sandbox_cashout_allocations','sandbox_cashout_observations','sandbox_cashout_simulated_return_accounting','sandbox_cashout_merch_allocations','sandbox_cashout_merch_simulated_returns','sandbox_cashout_recovery_authorities','sandbox_cashout_recovery_revocations'] loop
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.guard_event_ticket_terms_immutable()',t||'_immutable',t);
 end loop;
 for r in select p.oid::regprocedure as identity,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('sandbox_cashout_subject_current','sandbox_cashout_current_user','sandbox_cashout_enabled','sandbox_cashout_source','sandbox_cashout_merch_source','sandbox_cashout_summary','lock_sandbox_cashout_creator','sandbox_cashout_revoke_admission','hold_sandbox_cashout_changed_source','hold_sandbox_cashout_changed_merch','sandbox_cashout_recovery_admission','sandbox_cashout_recovery_current'))
 or (n.nspname='public' and p.proname in ('get_my_sandbox_creator_cashout_execution','list_my_sandbox_creator_cashout_executions','preview_sandbox_creator_cashout','request_sandbox_creator_cashout','cancel_undispatched_sandbox_creator_cashout','get_sandbox_creator_cashout_execution_context','claim_sandbox_creator_cashout_dispatch','record_sandbox_creator_cashout_observation')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.identity);
  if r.nspname='public' then
   execute format('grant execute on function %s to %I',r.identity,case when r.proname in ('get_sandbox_creator_cashout_execution_context','claim_sandbox_creator_cashout_dispatch','record_sandbox_creator_cashout_observation') then 'service_role' else 'authenticated' end);
  end if;
 end loop;
end; $$;
