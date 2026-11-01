-- Dormant, evidence-bound platform-held earnings bridge. No provider requests,
-- qualification seeds, bank debits, reserve percentages or money activation.
create table private.commerce_earnings_qualifications (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null,
 platform_account_id text not null check(platform_account_id ~ '^acct_[A-Za-z0-9]+$'),
 recipient_account_id text not null check(recipient_account_id ~ '^acct_[A-Za-z0-9]+$'),
 environment text not null check(environment='live'), currency text not null check(currency='usd'),
 platform_held_funding_verified boolean not null check(platform_held_funding_verified),
 no_automatic_transfer_verified boolean not null check(no_automatic_transfer_verified),
 evidence_reference text not null check(length(btrim(evidence_reference)) between 1 and 500),
 verified_at timestamptz not null, expires_at timestamptz not null check(expires_at>verified_at),
 check(platform_account_id<>recipient_account_id)
);
create table private.commerce_payable_releases (
 id uuid primary key default gen_random_uuid(), snapshot_id uuid not null unique references private.commerce_known_cost_snapshots(id),
 source_type text not null, source_id uuid not null, creator_id uuid not null,
 qualification_id uuid not null references private.commerce_earnings_qualifications(id),
 target_creator_minor bigint not null, delta_minor bigint not null,
 earnings_ledger_id uuid unique references public.creator_earnings_ledger(id),
 adjustment_id uuid unique references private.commerce_creator_fee_adjustments(id),
 created_at timestamptz not null default clock_timestamp(),
 check((delta_minor>0 and earnings_ledger_id is not null and adjustment_id is null)
  or(delta_minor<0 and earnings_ledger_id is null and adjustment_id is not null)
  or(delta_minor=0 and earnings_ledger_id is null and adjustment_id is null))
);
create index commerce_payable_release_source on private.commerce_payable_releases(source_type,source_id,created_at desc,id desc);
create table private.creator_fee_credit_sources (
 earnings_ledger_id uuid primary key references public.creator_earnings_ledger(id),
 creator_id uuid not null, original_earnings_ledger_id uuid not null references public.creator_earnings_ledger(id),
 source_type text not null check(source_type='cashout_fee'), source_id uuid not null,
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'), amount_minor bigint not null check(amount_minor>0),
 platform_account_id text not null,recipient_account_id text not null,
 acceptance_id uuid not null references private.commerce_creator_fee_acceptances(id),
 created_at timestamptz not null default clock_timestamp(),unique(source_type,source_id,evidence_hash)
);
-- One debt can consume later matured tranches of the same earning. Each
-- consumption is immutable; current outstanding arithmetic makes retries safe.
do $$ declare constraint_name text; begin
 select conname into strict constraint_name from pg_constraint where conrelid='private.commerce_creator_fee_offsets'::regclass
  and contype='u' and pg_get_constraintdef(oid)='UNIQUE (adjustment_id, earnings_ledger_id)';
 execute format('alter table private.commerce_creator_fee_offsets drop constraint %I',constraint_name);
end $$;
do $$ declare t text; begin
 foreach t in array array['commerce_earnings_qualifications','commerce_payable_releases','creator_fee_credit_sources'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.guard_event_ticket_terms_immutable()',t||'_immutable',t);
 end loop;
end $$;

create function private.guard_auction_single_funding_lane() returns trigger language plpgsql set search_path='' as $$
begin
 -- Same contract row lock as both bridge and existing transfer reservation.
 perform 1 from private.auction_platform_settlement_contracts where id=new.contract_id for update;
 if exists(select 1 from private.commerce_payable_releases where source_type in ('event_auction','room_auction') and source_id=new.contract_id)
 then raise exception 'auction_already_in_platform_earnings_lane'; end if;
 return new;
end; $$;
revoke all on function private.guard_auction_single_funding_lane() from public,anon,authenticated,service_role;
create trigger auction_single_funding_lane before insert on private.auction_transfer_operations
 for each row execute function private.guard_auction_single_funding_lane();

create function private.commerce_cashout_earning_account_exact(p_earning uuid,p_platform text,p_recipient text) returns boolean
language sql stable set search_path='' as $$
 select not exists(select 1 from private.commerce_payable_releases r join private.commerce_earnings_qualifications q on q.id=r.qualification_id
  where r.earnings_ledger_id=p_earning and (q.platform_account_id is distinct from p_platform or q.recipient_account_id is distinct from p_recipient))
  and not exists(select 1 from private.creator_fee_credit_sources c where c.earnings_ledger_id=p_earning
   and (c.platform_account_id is distinct from p_platform or c.recipient_account_id is distinct from p_recipient));
$$;
revoke all on function private.commerce_cashout_earning_account_exact(uuid,text,text) from public,anon,authenticated,service_role;

-- Return/fulfillment is checked independently of fee readiness. Original tax
-- checkout binding is required; no late registration relabels an old purchase.
create function private.commerce_positive_release_ready(p_snapshot private.commerce_known_cost_snapshots) returns boolean
language plpgsql set search_path='' as $$
declare o public.merch_orders; c private.auction_platform_settlement_contracts; f jsonb; result jsonb; identity uuid; product text; raw_mode text;
begin
 if p_snapshot.environment<>'live' then return false; end if;
 if p_snapshot.source_type='physical_merch' then
  select * into strict o from public.merch_orders where id=p_snapshot.source_id;
  if o.environment<>'production' or o.payment_status<>'paid' or o.provider<>'stripe_physical_goods' then return false; end if;
  result:=private.merch_return_hold_state(o,clock_timestamp());
  if result->>'returnWindowStatus' is distinct from 'elapsed' or jsonb_array_length(result->'returnHoldReasons')<>0 then return false; end if;
  select facts into f from private.merch_provider_cost_observations where id=p_snapshot.source_observation_id
   and exists(select 1 from private.commerce_cost_verification_reads vr where vr.source_observation_id=p_snapshot.source_observation_id and vr.verified_at>=clock_timestamp()-interval '15 minutes');
  identity:=o.id; product:=o.product_id::text; raw_mode:=o.environment;
 else
  select * into strict c from private.auction_platform_settlement_contracts where id=p_snapshot.source_id;
  if c.environment<>'live' or exists(select 1 from private.auction_transfer_operations where contract_id=c.id) then return false; end if;
  result:=case c.lane when 'event' then public.qualify_auction_event_release_from_domain(c.id) else public.qualify_auction_room_release_from_domain(c.id) end;
  if nullif(result->>'releaseEvidenceId','') is null or not private.auction_release_mature(c.id,(result->>'releaseEvidenceId')::uuid) then return false; end if;
  select facts into f from private.auction_settlement_observations where id=p_snapshot.source_observation_id
   and exists(select 1 from private.commerce_cost_verification_reads vr where vr.source_observation_id=p_snapshot.source_observation_id and vr.verified_at>=clock_timestamp()-interval '15 minutes');
  identity:=c.quote_id; product:=c.platform_product_id; raw_mode:=c.environment;
 end if;
 if f is null or f->>'balance_status' is distinct from 'available' or f->'disputed' is distinct from 'false'::jsonb
  or exists(select 1 from jsonb_array_elements(f->'refunds') r where r->>'status' is distinct from 'available') then return false; end if;
 if not exists(select 1 from private.commerce_tax_checkout_bindings b join private.commerce_tax_qualifications q on q.id=b.policy_id
  where b.feature=p_snapshot.source_type and b.identity_id=identity and b.product_id=product and b.account_id=p_snapshot.account_id
   and b.environment=raw_mode and q.enabled and q.revoked_at is null and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp()
   and q.provider_verified_at<=clock_timestamp() and q.provider_expires_at>clock_timestamp()) then return false; end if;
 return private.commerce_tax_fee_settlement_ready(p_snapshot.source_type,identity);
end; $$;
revoke all on function private.commerce_positive_release_ready(private.commerce_known_cost_snapshots) from public,anon,authenticated,service_role;

create function public.release_commerce_known_earnings(p_feature text,p_source_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.commerce_known_cost_snapshots; q private.commerce_earnings_qualifications; prior private.commerce_payable_releases; result private.commerce_payable_releases;
 target bigint; difference bigint; provider_id uuid; money_id uuid; earning_id uuid; debt_id uuid; required_switch text; reconciled jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 -- Match existing auction release lock order before acquiring the contract,
 -- component and creator locks; room/event updates must never wait in reverse.
 if p_feature in ('event_auction','room_auction') then
  perform private.lock_auction_release_domain(p_source_id);
  perform private.lock_auction_release_qualification(p_source_id);
 end if;
 -- Reconcile obtains sale row -> component account -> creator-payout locks.
 reconciled:=public.reconcile_commerce_known_costs(p_feature,p_source_id);
 select * into strict s from private.commerce_known_cost_snapshots where id=(reconciled->>'id')::uuid;
 select * into result from private.commerce_payable_releases where snapshot_id=s.id;
 if result.id is not null then return to_jsonb(result); end if;
 if s.environment<>'live' then raise exception 'sandbox_not_payable'; end if;
 if s.source_type<>'physical_merch' and exists(select 1 from private.auction_transfer_operations where contract_id=s.source_id)
 then raise exception 'auction_already_in_transfer_lane'; end if;
 select * into prior from private.commerce_payable_releases where source_type=s.source_type and source_id=s.source_id order by created_at desc,id desc limit 1;
 target:=s.creator_minor-s.recovery_minor; difference:=target-coalesce(prior.target_creator_minor,0);
 if prior.id is null and difference<0 then raise exception 'initial_negative_net_review_required'; end if;
 if difference>=0 then
  foreach required_switch in array array['live_money_enabled','payouts_enabled','stripe_connect_enabled'] loop
   perform 1 from public.platform_money_kill_switches where key=required_switch and state='on' for share;
   if not found then raise exception 'commerce_earnings_activation_disabled'; end if;
  end loop;
  if private.commerce_positive_release_ready(s) is distinct from true then raise exception 'commerce_fulfillment_or_tax_clearance_required'; end if;
  select * into q from private.commerce_earnings_qualifications where creator_id=s.creator_id and platform_account_id=s.account_id
   and environment=s.environment and currency=s.currency and verified_at<=clock_timestamp() and expires_at>clock_timestamp()
   order by verified_at desc,id desc limit 1;
  if q.id is null then raise exception 'commerce_platform_held_funding_qualification_required'; end if;
  if prior.id is not null and not exists(select 1 from private.commerce_earnings_qualifications old where old.id=prior.qualification_id
   and old.recipient_account_id=q.recipient_account_id) then raise exception 'commerce_recipient_changed'; end if;
 else
  -- Verified reductions continue to be recorded even with payout switches OFF.
  -- They create a visible future-unpaid obligation, never a bank withdrawal.
  select * into strict q from private.commerce_earnings_qualifications where id=prior.qualification_id;
 end if;
 if difference>2147483647 or difference< -2147483647 then raise exception 'commerce_release_amount_overflow'; end if;
 if difference>0 then
  insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key,metadata)
  values(case when s.source_type='physical_merch' then 'stripe_physical_goods' else 'stripe_connect' end,
   'commerce-known-cost:'||s.id,s.creator_id,'production','commerce_verified_cost_release','processed','commerce-known-cost:'||s.id,
   jsonb_build_object('commerce_snapshot_id',s.id,'provider_get_observation_id',s.source_observation_id)) returning id into provider_id;
  insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id,metadata)
  values(s.creator_id,s.creator_id,provider_id,'commerce_verified_cost_release',difference::integer,s.currency,'production','payable','verified','product',s.source_id,
   jsonb_build_object('payout_readiness_proved',true,'live_money_enabled_at_verification',true,'commerce_snapshot_id',s.id)) returning id into money_id;
  insert into public.creator_earnings_ledger(creator_id,source_type,source_id,gross_amount_cents,net_creator_amount_cents,currency,ledger_status,
   money_ledger_event_id,provider_event_id,settlement_reference_hash,settlement_started_at,normal_eligible_at,reserve_amount_cents,reserve_release_at,settlement_policy_version,metadata,created_at)
  values(s.creator_id,'product',s.source_id,difference::integer,difference::integer,s.currency,'available',money_id,provider_id,s.manifest_sha256,
   clock_timestamp(),clock_timestamp(),0,clock_timestamp(),'known_costs_future_unpaid_adjustments_v1',
   jsonb_build_object('commerce_snapshot_id',s.id,'future_adjustments_possible',true,'final_fees',false),clock_timestamp()) returning id into earning_id;
 elsif difference<0 then
  insert into private.commerce_creator_fee_adjustments(creator_id,acceptance_id,currency,amount_minor,reason,source_type,source_id,evidence_hash)
  values(s.creator_id,s.acceptance_id,s.currency,-difference,
   case when s.refunded_minor>(select refunded_minor from private.commerce_known_cost_snapshots where id=prior.snapshot_id)
    then 'later_verified_refund' else 'later_verified_fee' end,s.source_type,s.source_id,
   encode(extensions.digest(s.id::text||':'||prior.snapshot_id::text,'sha256'),'hex')) returning id into debt_id;
 end if;
 insert into private.commerce_payable_releases(snapshot_id,source_type,source_id,creator_id,qualification_id,target_creator_minor,delta_minor,earnings_ledger_id,adjustment_id)
 values(s.id,s.source_type,s.source_id,s.creator_id,q.id,target,difference,earning_id,debt_id) returning * into result;
 return to_jsonb(result);
end; $$;
revoke all on function public.release_commerce_known_earnings(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.release_commerce_known_earnings(text,uuid) to service_role;

-- Identical provider GET facts deduplicate their immutable accounting identity,
-- but a successful fresh verification still receives a separate read receipt.
create table private.commerce_cost_verification_reads (
 id bigint generated always as identity primary key, source_type text not null,source_id uuid not null,
 source_observation_id uuid not null, verified_at timestamptz not null default clock_timestamp()
);
alter table private.commerce_cost_verification_reads enable row level security;
alter table private.commerce_cost_verification_reads force row level security;
revoke all on private.commerce_cost_verification_reads from public,anon,authenticated,service_role;
create trigger commerce_cost_read_immutable before update or delete on private.commerce_cost_verification_reads
 for each row execute function private.guard_event_ticket_terms_immutable();
alter function public.record_merch_provider_cost_observation(uuid,jsonb) rename to record_merch_cost_before_verification_receipt;
alter function public.record_auction_platform_cost_observation(uuid,jsonb) rename to record_auction_cost_before_verification_receipt;
revoke all on function public.record_merch_cost_before_verification_receipt(uuid,jsonb),public.record_auction_cost_before_verification_receipt(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.record_merch_provider_cost_observation(p_order_id uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; obs uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 result:=public.record_merch_cost_before_verification_receipt(p_order_id,p_facts);
 select id into strict obs from private.merch_provider_cost_observations where order_id=p_order_id and facts=p_facts;
 insert into private.commerce_cost_verification_reads(source_type,source_id,source_observation_id) values('physical_merch',p_order_id,obs);
 return result;
end; $$;
create function public.record_auction_platform_cost_observation(p_contract_id uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; obs uuid; lane text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 result:=public.record_auction_cost_before_verification_receipt(p_contract_id,p_facts);
 select id into strict obs from private.auction_settlement_observations where contract_id=p_contract_id and facts=p_facts;
 select c.lane into strict lane from private.auction_platform_settlement_contracts c where id=p_contract_id;
 insert into private.commerce_cost_verification_reads(source_type,source_id,source_observation_id) values(lane||'_auction',p_contract_id,obs);
 return result;
end; $$;
revoke all on function public.record_merch_provider_cost_observation(uuid,jsonb),public.record_auction_platform_cost_observation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_merch_provider_cost_observation(uuid,jsonb),public.record_auction_platform_cost_observation(uuid,jsonb) to service_role;

alter function public.creator_earnings_withdrawable_cents_internal(uuid,timestamptz) rename to creator_earnings_withdrawable_before_fee_offsets;
revoke all on function public.creator_earnings_withdrawable_before_fee_offsets(uuid,timestamptz) from public,anon,authenticated,service_role;
create function public.creator_earnings_withdrawable_cents_internal(p_earnings_ledger_id uuid,p_at timestamptz) returns integer
language plpgsql stable security definer set search_path='' as $$
declare amount bigint; e public.creator_earnings_ledger; r private.commerce_payable_releases; identity uuid;
begin
 if exists(select 1 from private.creator_fee_credit_sources where earnings_ledger_id=p_earnings_ledger_id) then
  select * into strict e from public.creator_earnings_ledger where id=p_earnings_ledger_id;
  if p_at is null or public.creator_earnings_current_state_internal(e.id)<>'available' or e.normal_eligible_at>p_at then return 0; end if;
  return greatest(e.net_creator_amount_cents-private.creator_earning_fee_offset(e.id),0)::integer;
 end if;
 select * into r from private.commerce_payable_releases where earnings_ledger_id=p_earnings_ledger_id;
 if r.id is null then amount:=public.creator_earnings_withdrawable_before_fee_offsets(p_earnings_ledger_id,p_at);
 else
  select * into strict e from public.creator_earnings_ledger where id=p_earnings_ledger_id;
  if p_at is null or public.creator_earnings_current_state_internal(e.id)<>'available'
   or e.normal_eligible_at is null or e.normal_eligible_at>p_at then return 0; end if;
  identity:=r.source_id;
  if r.source_type<>'physical_merch' then select quote_id into identity from private.auction_platform_settlement_contracts where id=r.source_id; end if;
  -- A late report invalidates the old amount until an exact successor release
  -- has recorded its credit/debt. It cannot be ignored just because cashout was
  -- requested earlier. The dispatch admission also rechecks this function.
  if not private.commerce_tax_fee_settlement_ready(r.source_type,identity)
   or not exists(select 1 from private.commerce_payable_releases current_release join private.commerce_known_cost_snapshots s on s.id=current_release.snapshot_id
    where current_release.source_type=r.source_type and current_release.source_id=r.source_id
     and s.manifest_sha256=private.commerce_fee_manifest(r.source_type,r.source_id)
     and s.id=(select latest.snapshot_id from private.commerce_payable_releases latest where latest.source_type=r.source_type and latest.source_id=r.source_id order by latest.created_at desc,latest.id desc limit 1))
  then return 0; end if;
  amount:=e.net_creator_amount_cents;
 end if;
 return greatest(amount-private.creator_earning_fee_offset(p_earnings_ledger_id),0)::integer;
end; $$;
revoke all on function public.creator_earnings_withdrawable_cents_internal(uuid,timestamptz) from public,anon,authenticated,service_role;

create function private.consume_creator_fee_recovery(p_creator uuid,p_currency text) returns bigint
language plpgsql set search_path='' as $$
declare debt record; earning record; remaining bigint; available bigint; take bigint; total bigint:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||p_creator::text,0));
 for debt in select a.*,a.amount_minor-coalesce((select sum(o.amount_minor) from private.commerce_creator_fee_offsets o where o.adjustment_id=a.id),0) balance
  from private.commerce_creator_fee_adjustments a where a.creator_id=p_creator and a.currency=p_currency and a.amount_minor>0 order by a.created_at,a.id
 loop
  remaining:=least(debt.balance,private.creator_fee_recovery_amount(p_creator,p_currency));
  if remaining<=0 then continue; end if;
  for earning in select e.id from public.creator_earnings_ledger e join public.money_access_ledger_events m on m.id=e.money_ledger_event_id
   where e.creator_id=p_creator and e.currency=p_currency and e.created_at>debt.created_at
    and m.environment='production' and m.status='verified' and m.payable_state='payable'
    and public.creator_earnings_current_state_internal(e.id)='available' order by e.created_at,e.id for update of e
  loop
   available:=public.creator_earnings_withdrawable_cents_internal(earning.id,clock_timestamp())-
    coalesce((select sum(amount_cents) from public.creator_payout_allocations where earnings_ledger_id=earning.id and state in ('reserved','processing','paid')),0);
   take:=least(remaining,greatest(available,0));
   if take>0 then
    -- Each current outstanding tranche appends a separate immutable receipt.
    insert into private.commerce_creator_fee_offsets(adjustment_id,earnings_ledger_id,amount_minor) values(debt.id,earning.id,take);
    remaining:=remaining-take; total:=total+take;
   end if;
   exit when remaining=0;
  end loop;
 end loop;
 return total;
end; $$;
revoke all on function private.consume_creator_fee_recovery(uuid,text) from public,anon,authenticated,service_role;
create function public.reconcile_creator_fee_recovery(p_creator_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare consumed bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 consumed:=private.consume_creator_fee_recovery(p_creator_id,'usd');
 return jsonb_build_object('offsetMinor',consumed,'remainingMinor',private.creator_fee_recovery_amount(p_creator_id,'usd'),'bankDebitPerformed',false);
end; $$;
revoke all on function public.reconcile_creator_fee_recovery(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_creator_fee_recovery(uuid) to service_role;

alter function public.create_creator_payout_request_safe(integer,text) rename to create_creator_payout_request_before_fee_policy;
revoke all on function public.create_creator_payout_request_before_fee_policy(integer,text) from public,anon,authenticated,service_role;
create function public.create_creator_payout_request_safe(p_amount_cents integer,p_payout_type text default 'scheduled') returns jsonb
language plpgsql security definer set search_path='' as $$
declare status jsonb;
begin
 status:=public.get_creator_fee_policy_status();
 if status->'accepted' is distinct from 'true'::jsonb then raise exception 'creator_fee_policy_acceptance_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||auth.uid()::text,0));
 perform private.consume_creator_fee_recovery(auth.uid(),'usd');
 if private.creator_fee_recovery_outstanding(auth.uid(),'usd') then raise exception 'creator_fee_recovery_pending'; end if;
 return public.create_creator_payout_request_before_fee_policy(p_amount_cents,p_payout_type);
end; $$;
revoke all on function public.create_creator_payout_request_safe(integer,text) from public,anon,authenticated,service_role;
grant execute on function public.create_creator_payout_request_safe(integer,text) to authenticated;

-- Cashout execution is deployed in the same bundle. Retain every existing
-- session/legal/provider/allocation predicate and add current fee admission.
do $$ declare sig regprocedure; definition text; marker text:=E'begin\n'; begin
 sig:=to_regprocedure('private.assert_cashout_dispatch_admission(public.creator_payout_requests,private.creator_cashout_provider_qualifications)');
 if sig is not null then
  definition:=pg_get_functiondef(sig);
  if position(marker in definition)=0 then raise exception 'cashout_admission_definition_changed'; end if;
  definition:=overlay(definition placing marker||$guard$
 if not exists(select 1 from private.commerce_creator_fee_acceptances a where a.creator_id=p_request.creator_id
  and a.policy_version='known_costs_future_unpaid_adjustments_v1'
  and a.terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex'))
 then raise exception 'creator_fee_policy_acceptance_required'; end if;
 if private.creator_fee_recovery_outstanding(p_request.creator_id,p_request.currency) then raise exception 'creator_fee_recovery_pending'; end if;
 if exists(select 1 from public.creator_payout_allocations a where a.payout_request_id=p_request.id
  and not private.commerce_cashout_earning_account_exact(a.earnings_ledger_id,p_qualification.platform_account_id,p_qualification.account_id))
 then raise exception 'commerce_cashout_funding_account_mismatch'; end if;
$guard$ from position(marker in definition) for length(marker));
  execute definition;
 end if;
end $$;

-- Private materializer only. The cashout issuer must derive the positive delta
-- from its immutable execution/component history before calling this; no API
-- role can supply an amount or create a credit directly.
create function private.record_creator_verified_fee_credit(p_creator uuid,p_original_earning uuid,p_source_type text,p_source_id uuid,
 p_evidence_hash text,p_amount_minor bigint,p_platform_account text,p_recipient_account text) returns uuid
language plpgsql set search_path='' as $$
declare old public.creator_earnings_ledger; origin public.money_access_ledger_events; accepted uuid; existing private.creator_fee_credit_sources;
 provider_id uuid; money_id uuid; earning_id uuid;
begin
 if p_source_type is distinct from 'cashout_fee' or p_source_id is null or p_amount_minor is null or p_amount_minor<=0 or p_amount_minor>2147483647
  or p_evidence_hash is null or p_evidence_hash !~ '^[a-f0-9]{64}$'
  or p_platform_account is null or p_platform_account !~ '^acct_[A-Za-z0-9]+$'
  or p_recipient_account is null or p_recipient_account !~ '^acct_[A-Za-z0-9]+$' then raise exception 'fee_credit_identity_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||p_creator::text,0));
 select * into existing from private.creator_fee_credit_sources where source_type=p_source_type and source_id=p_source_id and evidence_hash=p_evidence_hash;
 if existing.earnings_ledger_id is not null then
  if row(existing.creator_id,existing.original_earnings_ledger_id,existing.amount_minor,existing.platform_account_id,existing.recipient_account_id)
   is distinct from row(p_creator,p_original_earning,p_amount_minor,p_platform_account,p_recipient_account) then raise exception 'fee_credit_replay_conflict'; end if;
  return existing.earnings_ledger_id;
 end if;
 select * into strict old from public.creator_earnings_ledger where id=p_original_earning;
 select * into strict origin from public.money_access_ledger_events where id=old.money_ledger_event_id;
 if old.creator_id<>p_creator or old.currency<>'usd' or origin.environment<>'production' or origin.provider_event_id is null
  or not private.commerce_cashout_earning_account_exact(old.id,p_platform_account,p_recipient_account) then raise exception 'fee_credit_origin_invalid'; end if;
 select id into accepted from private.commerce_creator_fee_acceptances where creator_id=p_creator
  and policy_version='known_costs_future_unpaid_adjustments_v1'
  and terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex');
 if accepted is null then raise exception 'creator_fee_policy_acceptance_required'; end if;
 insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key,metadata)
 values('stripe_connect','fee-credit:'||p_source_id||':'||p_evidence_hash,p_creator,'production','verified_provider_fee_credit','processed',
  'fee-credit:'||p_source_id||':'||p_evidence_hash,jsonb_build_object('original_provider_event_id',origin.provider_event_id,'fee_evidence_hash',p_evidence_hash)) returning id into provider_id;
 insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id,metadata)
 values(p_creator,p_creator,provider_id,'verified_provider_fee_credit',p_amount_minor::integer,'usd','production','payable','verified','adjustment',p_source_id,
  jsonb_build_object('payout_readiness_proved',true,'live_money_enabled_at_verification',true,'original_money_event_id',origin.id)) returning id into money_id;
 insert into public.creator_earnings_ledger(creator_id,source_type,source_id,gross_amount_cents,net_creator_amount_cents,currency,ledger_status,
  money_ledger_event_id,provider_event_id,settlement_reference_hash,settlement_started_at,normal_eligible_at,reserve_amount_cents,reserve_release_at,settlement_policy_version,metadata,created_at)
 values(p_creator,'adjustment',p_source_id,p_amount_minor::integer,p_amount_minor::integer,'usd','available',money_id,provider_id,p_evidence_hash,
  clock_timestamp(),clock_timestamp(),0,clock_timestamp(),'known_costs_future_unpaid_adjustments_v1',jsonb_build_object('fee_credit',true),clock_timestamp()) returning id into earning_id;
 insert into private.creator_fee_credit_sources(earnings_ledger_id,creator_id,original_earnings_ledger_id,source_type,source_id,evidence_hash,amount_minor,platform_account_id,recipient_account_id,acceptance_id)
 values(earning_id,p_creator,p_original_earning,p_source_type,p_source_id,p_evidence_hash,p_amount_minor,p_platform_account,p_recipient_account,accepted);
 return earning_id;
end; $$;
revoke all on function private.record_creator_verified_fee_credit(uuid,uuid,text,uuid,text,bigint,text,text) from public,anon,authenticated,service_role;

