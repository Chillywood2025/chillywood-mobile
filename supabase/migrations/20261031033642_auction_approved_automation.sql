-- EMPTY approval registry and OFF controls. Source does not approve any account,
-- schedule work, create credentials, or enable live transfers/bank payouts.
create table private.auction_automation_approvals(
 id uuid primary key default extensions.gen_random_uuid(),qualification_id uuid not null references private.auction_platform_qualifications(id),
 capability_id uuid not null references private.creator_external_payment_capabilities(id),creator_id uuid not null,
 platform_account_id text not null,recipient_account_id text not null,product_id uuid not null references public.monetization_products(id),platform_product_id text not null,
 environment text not null default 'test' check(environment='test'),currency text not null default 'usd' check(currency='usd'),
 max_transfer_minor bigint not null check(max_transfer_minor>0),daily_limit_minor bigint not null check(daily_limit_minor>=max_transfer_minor),
 owner_approval_reference text not null check(length(btrim(owner_approval_reference)) between 1 and 300),
 approved_by uuid not null,approved_at timestamptz not null default clock_timestamp(),
 contract_created_after timestamptz not null default clock_timestamp(),expires_at timestamptz not null,revoked_at timestamptz,
 enabled boolean not null default false,check(expires_at>approved_at and expires_at<=approved_at+interval '30 days')
);
create trigger auction_automation_approval_immutable before update on private.auction_automation_approvals for each row execute function private.guard_creator_external_payment_evidence();
create trigger auction_automation_approval_no_delete before delete on private.auction_automation_approvals for each row execute function private.merch_cost_append_only();
create table private.auction_automation_controls(singleton boolean primary key default true check(singleton),observe_enabled boolean not null default false,
 renew_enabled boolean not null default false,dispatch_enabled boolean not null default false,next_run_at timestamptz not null default '-infinity');
insert into private.auction_automation_controls(singleton) values(true);
create table private.auction_automation_jobs(contract_id uuid primary key references private.auction_platform_settlement_contracts(id),approval_id uuid not null references private.auction_automation_approvals(id),
 lease uuid,lease_until timestamptz,next_attempt_at timestamptz not null default '-infinity',failures integer not null default 0,checked_at timestamptz,last_result text);
create table private.auction_automation_attempts(id uuid primary key,attempt_no bigint generated always as identity unique,contract_id uuid not null references private.auction_platform_settlement_contracts(id),
 approval_id uuid not null references private.auction_automation_approvals(id),started_at timestamptz not null default clock_timestamp());
create table private.auction_automation_qualification_reads(attempt_id uuid primary key references private.auction_automation_attempts(id),qualification_id uuid not null references private.auction_platform_qualifications(id),facts jsonb not null,observed_at timestamptz not null default clock_timestamp());
create table private.auction_automation_transfer_bindings(operation_id uuid primary key references private.auction_transfer_operations(id),approval_id uuid not null references private.auction_automation_approvals(id),attempt_id uuid not null references private.auction_automation_attempts(id),preflight jsonb not null,created_at timestamptz not null default clock_timestamp());
do $$declare t text;begin
 foreach t in array array['auction_automation_approvals','auction_automation_controls','auction_automation_jobs','auction_automation_attempts','auction_automation_qualification_reads','auction_automation_transfer_bindings'] loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);end loop;
 foreach t in array array['auction_automation_attempts','auction_automation_qualification_reads','auction_automation_transfer_bindings'] loop
 execute format('create trigger immutable before update or delete on private.%I for each row execute function private.merch_cost_append_only()',t);end loop;
end $$;
revoke all on sequence private.auction_automation_attempts_attempt_no_seq from public,anon,authenticated,service_role;
create index auction_automation_attempt_scope on private.auction_automation_attempts(approval_id,attempt_no desc);
create index auction_automation_due on private.auction_automation_jobs(next_attempt_at,contract_id);

create function private.auction_automation_approval_valid(p private.auction_automation_approvals) returns boolean language sql volatile set search_path='' as $$
 select coalesce(p.enabled and p.revoked_at is null and p.approved_at<=clock_timestamp() and p.expires_at>clock_timestamp()
 and p.id=(select id from private.auction_automation_approvals where capability_id=p.capability_id order by approved_at desc,id desc limit 1)
 and exists(select 1 from private.auction_platform_qualifications q join private.creator_external_payment_capabilities c on c.id=q.capability_id
 join public.monetization_products product on product.id=q.product_id
 where q.id=p.qualification_id and q.enabled and q.revoked_at is null and q.verified_at<=p.approved_at and p.approved_at<q.expires_at
 and row(q.capability_id,c.creator_id,q.platform_account_id,q.recipient_account_id,q.product_id,q.platform_product_id)
 =row(p.capability_id,p.creator_id,p.platform_account_id,p.recipient_account_id,p.product_id,p.platform_product_id)
 and c.provider_account_id=p.recipient_account_id and c.enabled and c.revoked_at is null and c.environment='test'
 and c.verified_at<=clock_timestamp() and c.expires_at>clock_timestamp()
 and ((c.feature='event_auction' and product.provider='stripe_event_auction' and exists(select 1 from private.creator_event_auction_product_bindings b where b.capability_id=c.id and b.product_id=p.product_id))
 or (c.feature='room_seat_auction' and product.provider='stripe_room_auction' and exists(select 1 from private.creator_room_auction_product_bindings b where b.capability_id=c.id and b.product_id=p.product_id)))
 and product.provider_product_id=p.platform_product_id and product.environment='sandbox' and product.status='sandbox'),false);
$$;
create function public.claim_auction_automation_batch() returns jsonb language plpgsql security definer set search_path='' as $$
declare controls private.auction_automation_controls;r record;token uuid;result jsonb:='[]';
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into controls from private.auction_automation_controls where singleton for update skip locked;
 if controls.singleton is null or not controls.observe_enabled or controls.next_run_at>clock_timestamp() then return '[]'::jsonb;end if;
 update private.auction_automation_controls set next_run_at=clock_timestamp()+interval '1 minute' where singleton;
 -- One contract per approval per run prevents competing renewal attempts. Due
 -- ordering is persistent, and already attempted transfers remain readable even
 -- after approval revocation. No automatic adoption of manual operations.
 for r in select pick.* from (
 select distinct on(p.id) c.id contract_id,p.id approval_id,p.capability_id,c.lane,p.platform_account_id,p.recipient_account_id,p.platform_product_id,
 o.id operation_id,o.state operation_state,coalesce(j.next_attempt_at,c.created_at) due
 from private.auction_automation_approvals p join private.auction_platform_settlement_contracts c on c.capability_id=p.capability_id
 and c.creator_id=p.creator_id and c.platform_account_id=p.platform_account_id and c.recipient_account_id=p.recipient_account_id
 and c.platform_product_id=p.platform_product_id and c.created_at>=p.contract_created_after
 join public.money_purchase_intents intent on intent.id=c.purchase_intent_id
 left join private.auction_automation_jobs j on j.contract_id=c.id
 left join private.auction_transfer_operations o on o.contract_id=c.id
 left join private.auction_automation_transfer_bindings b on b.operation_id=o.id
 where c.environment='test' and (j.approval_id is null or j.approval_id=p.id or o.id is null)
 and coalesce(j.next_attempt_at,'-infinity')<=clock_timestamp() and (j.lease_until is null or j.lease_until<=clock_timestamp())
 and ((o.id is null and intent.status='consumed' and controls.renew_enabled and private.auction_automation_approval_valid(p))
 or (b.approval_id=p.id and o.state in('unknown','reconciliation_required')))
 order by p.id,coalesce(j.next_attempt_at,c.created_at),c.id) pick order by due,contract_id limit 3 loop
 -- Reauthorization is only a non-financial job transition. Serialize with
 -- policy mutation and contract reservation, then recheck the absence of ANY
 -- prior operation and expiry of the old lease before changing policy binding.
 perform pg_advisory_xact_lock(hashtextextended('auction-auto-capability:'||r.capability_id,0));
 perform 1 from private.auction_platform_settlement_contracts where id=r.contract_id for update;
 if exists(select 1 from private.auction_automation_jobs where contract_id=r.contract_id and lease_until>clock_timestamp()) then continue;end if;
 if r.operation_id is null and (exists(select 1 from private.auction_transfer_operations where contract_id=r.contract_id)
 or not exists(select 1 from private.auction_automation_approvals p where p.id=r.approval_id and private.auction_automation_approval_valid(p))) then continue;end if;
 token:=extensions.gen_random_uuid();
 insert into private.auction_automation_jobs(contract_id,approval_id,lease,lease_until,next_attempt_at) values(r.contract_id,r.approval_id,token,clock_timestamp()+interval '5 minutes',clock_timestamp()+interval '5 minutes')
 on conflict(contract_id) do update set approval_id=excluded.approval_id,lease=excluded.lease,lease_until=excluded.lease_until,next_attempt_at=excluded.next_attempt_at;
 insert into private.auction_automation_attempts(id,contract_id,approval_id) values(token,r.contract_id,r.approval_id);
 result:=result||jsonb_build_array(to_jsonb(r)||jsonb_build_object('lease',token,'dispatch_enabled',controls.dispatch_enabled));
 end loop;return result;
end $$;
create function public.record_auction_automation_qualification(p_lease uuid,p_facts jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.auction_automation_attempts;p private.auction_automation_approvals;q uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict a from private.auction_automation_attempts where id=p_lease;
 select * into strict p from private.auction_automation_approvals where id=a.approval_id;
 perform pg_advisory_xact_lock(hashtextextended('auction-auto-capability:'||p.capability_id,0));
 select * into strict p from private.auction_automation_approvals where id=a.approval_id;
 if not private.auction_automation_approval_valid(p) or not exists(select 1 from private.auction_automation_controls where singleton and observe_enabled and renew_enabled)
 or a.started_at<clock_timestamp()-interval '60 seconds'
 or exists(select 1 from private.auction_automation_attempts n where n.approval_id=p.id and n.attempt_no>a.attempt_no)
 or not exists(select 1 from private.auction_automation_jobs j where j.contract_id=a.contract_id and j.lease=a.id and j.lease_until>clock_timestamp())
 then raise exception 'auction_renewal_authority_unavailable';end if;
 if not coalesce(p_facts=jsonb_build_object('platform_account_id',p.platform_account_id,'recipient_account_id',p.recipient_account_id,
 'platform_product_id',p.platform_product_id,'environment','test','provider_ready',true,'complete',true,'financial_authority',false),false)
 then raise exception 'auction_qualification_facts_invalid';end if;
 select qualification_id into q from private.auction_automation_qualification_reads where attempt_id=a.id;
 if q is not null then return jsonb_build_object('qualificationId',q,'financialAuthority',false);end if;
 insert into private.auction_platform_qualifications(capability_id,platform_account_id,recipient_account_id,product_id,platform_product_id,evidence_reference,recipient_transfer_capability,enabled,verified_at,expires_at)
 values(p.capability_id,p.platform_account_id,p.recipient_account_id,p.product_id,p.platform_product_id,'approved-auto:'||p.id||':'||a.id,'active',true,clock_timestamp(),least(p.expires_at,clock_timestamp()+interval '10 minutes')) returning id into q;
 insert into private.auction_automation_qualification_reads(attempt_id,qualification_id,facts) values(a.id,q,p_facts);
 return jsonb_build_object('qualificationId',q,'financialAuthority',false);
end $$;
create function private.auction_automation_current_approval(p_lease uuid) returns private.auction_automation_approvals language plpgsql volatile set search_path='' as $$
declare a private.auction_automation_attempts;p private.auction_automation_approvals;
begin
 select * into strict a from private.auction_automation_attempts where id=p_lease;
 select * into strict p from private.auction_automation_approvals where id=a.approval_id;
 if not private.auction_automation_approval_valid(p) or a.started_at<clock_timestamp()-interval '2 minutes'
 or not exists(select 1 from private.auction_automation_jobs where contract_id=a.contract_id and approval_id=a.approval_id and lease=a.id and lease_until>clock_timestamp())
 or exists(select 1 from private.auction_automation_attempts where approval_id=p.id and attempt_no>a.attempt_no)
 or not exists(select 1 from private.auction_automation_qualification_reads r join private.auction_platform_qualifications q on q.id=r.qualification_id
 where r.attempt_id=a.id and r.observed_at>=clock_timestamp()-interval '60 seconds' and q.enabled and q.revoked_at is null and q.expires_at>clock_timestamp()
 and q.id=(select id from private.auction_platform_qualifications where capability_id=p.capability_id order by verified_at desc,id desc limit 1))
 then raise exception 'auction_automation_authority_stale';end if;
 return p;
end $$;
create function public.get_auction_automation_preflight(p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.auction_automation_approvals;c private.auction_platform_settlement_contracts;a private.auction_held_net_allocations;facts jsonb;qualified jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 p:=private.auction_automation_current_approval(p_lease);
 select contract.* into strict c from private.auction_platform_settlement_contracts contract join private.auction_automation_attempts attempt on attempt.contract_id=contract.id where attempt.id=p_lease;
 if exists(select 1 from private.auction_transfer_operations where contract_id=c.id) then return '{"status":"existing_operation","dispatchAuthorized":false}'::jsonb;end if;
 if c.lane='event' then qualified:=public.qualify_auction_event_release_from_domain(c.id);else qualified:=public.qualify_auction_room_release_from_domain(c.id);end if;
 if qualified->>'status'<>'qualified_test_only' then return qualified;end if;
 select * into strict a from private.auction_held_net_allocations where contract_id=c.id order by id desc limit 1;
 select o.facts into strict facts from private.auction_settlement_observations o where o.id=a.observation_id;
 if a.creator_minor is null or a.creator_minor<=0 or a.creator_minor>p.max_transfer_minor then return '{"status":"held","reason":"approved_amount_limit"}'::jsonb;end if;
 return jsonb_build_object('status','preflight_required','id',p_lease,'contract_id',c.id,'allocation_id',a.id,
 'platform_account_id',c.platform_account_id,'destination',c.recipient_account_id,'source_charge_id',facts->>'charge_id',
 'amount_minor',a.creator_minor,'currency',c.currency,'environment','test','transfer_group','auction-contract-'||c.id,
 'idempotency_key','auction-transfer-v1-'||c.id,'dispatchAuthorized',false);
end $$;
create function public.claim_auction_automation_dispatch(p_lease uuid,p_facts jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.auction_automation_approvals;c private.auction_platform_settlement_contracts;expected jsonb;reserved jsonb;claimed jsonb;operation uuid;spent bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 perform 1 from private.auction_automation_controls where singleton and observe_enabled and renew_enabled and dispatch_enabled for share;
 if not found then return '{"dispatchAuthorized":false,"status":"disabled"}'::jsonb;end if;
 p:=private.auction_automation_current_approval(p_lease);
 perform pg_advisory_xact_lock(hashtextextended('auction-auto-capability:'||p.capability_id,0));
 select contract.* into strict c from private.auction_platform_settlement_contracts contract join private.auction_automation_attempts a on a.contract_id=contract.id where a.id=p_lease for update of contract;
 perform private.lock_auction_release_domain(c.id);
 perform 1 from public.money_purchase_intents where id=c.purchase_intent_id for update;
 perform private.lock_auction_release_qualification(c.id);
 if private.commerce_tax_fee_settlement_ready(case c.lane when 'event' then 'event_auction' else 'room_auction' end,c.quote_id) is distinct from true then return '{"dispatchAuthorized":false,"status":"held","reason":"tax_service_fee_unverified"}'::jsonb;end if;
 -- Re-read all local facts under the existing serialization locks AFTER GETs.
 expected:=public.get_auction_automation_preflight(p_lease);
 if expected->>'status'<>'preflight_required' then return expected||'{"dispatchAuthorized":false}'::jsonb;end if;
 if p_facts is distinct from jsonb_build_object('allocation_id',expected->'allocation_id','platform_account_id',expected->'platform_account_id',
 'destination',expected->'destination','source_charge_id',expected->'source_charge_id','amount_minor',expected->'amount_minor',
 'currency','usd','environment','test','provider_ready',true,'financial_authority',false)
 then raise exception 'auction_preflight_changed';end if;
 select coalesce(sum(o.amount_minor),0) into spent from private.auction_automation_transfer_bindings b join private.auction_transfer_operations o on o.id=b.operation_id
 where b.approval_id in(select id from private.auction_automation_approvals where capability_id=p.capability_id) and o.dispatch_token is not null and o.dispatched_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 if spent+(expected->>'amount_minor')::bigint>p.daily_limit_minor then return '{"dispatchAuthorized":false,"status":"held","reason":"daily_limit"}'::jsonb;end if;
 reserved:=public.reserve_auction_test_transfer(c.id);
 if reserved->>'status'<>'reserved' then return reserved||'{"dispatchAuthorized":false}'::jsonb;end if;
 operation:=(reserved->>'operationId')::uuid;
 insert into private.auction_automation_transfer_bindings(operation_id,approval_id,attempt_id,preflight) values(operation,p.id,p_lease,p_facts);
 claimed:=public.claim_auction_test_transfer_dispatch(operation);
 if claimed->'dispatchAuthorized' is distinct from 'true'::jsonb then raise exception 'auction_dispatch_not_qualified';end if;
 -- No prior commit contains a new automatic reserved operation: reservation,
 -- binding and sole-permit consumption occur in this one transaction.
 return claimed;
end $$;
create function public.complete_auction_automation_job(p_lease uuid,p_success boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.auction_automation_jobs;v_failures integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into j from private.auction_automation_jobs where lease=p_lease for update;
 if j.contract_id is null or j.lease_until is null or j.lease_until<=clock_timestamp() then return '{"stale":true}'::jsonb;end if;
 v_failures:=case when p_success is true then 0 else least(j.failures+1,8) end;
 update private.auction_automation_jobs set lease=null,lease_until=null,failures=v_failures,checked_at=clock_timestamp(),
 last_result=case when p_success is true then 'complete' else 'held_or_unknown' end,
 next_attempt_at=clock_timestamp()+interval '1 minute'*case when p_success is true then 5 else least(power(2,v_failures-1),60) end where contract_id=j.contract_id;
 return '{"stale":false,"financialAuthority":false}'::jsonb;
end $$;
revoke all on function private.auction_automation_approval_valid(private.auction_automation_approvals),private.auction_automation_current_approval(uuid) from public,anon,authenticated,service_role;
revoke all on function public.claim_auction_automation_batch(),public.record_auction_automation_qualification(uuid,jsonb),public.get_auction_automation_preflight(uuid),public.claim_auction_automation_dispatch(uuid,jsonb),public.complete_auction_automation_job(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.claim_auction_automation_batch(),public.record_auction_automation_qualification(uuid,jsonb),public.get_auction_automation_preflight(uuid),public.claim_auction_automation_dispatch(uuid,jsonb),public.complete_auction_automation_job(uuid,boolean) to service_role;

-- Revocation racing after the sole permit is an in-flight obligation, never
-- evidence that the POST was canceled. Preserve it for GET-only recovery.
create function private.hold_auction_automation_on_approval_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.revoked_at is null then return new;end if;
 update private.auction_transfer_operations o set recovery_required=true,
 state=case when o.state='reserved' then 'canceled' else 'reconciliation_required' end
 from private.auction_automation_transfer_bindings b join private.auction_automation_approvals p on p.id=b.approval_id
 where o.id=b.operation_id and p.capability_id=new.capability_id and o.state in('reserved','unknown','reconciliation_required')
 and (tg_op='UPDATE' and p.id=new.id or tg_op='INSERT' and p.id<>new.id);
 return new;
end $$;
revoke all on function private.hold_auction_automation_on_approval_change() from public,anon,authenticated,service_role;
create trigger hold_automatic_transfer_on_approval_change after insert or update on private.auction_automation_approvals
 for each row execute function private.hold_auction_automation_on_approval_change();

-- Successor approvals must serialize even when no transfer binding exists yet.
-- Dispatch never locks the approval row while holding this capability lock:
-- an UPDATE trigger can already hold its row lock before acquiring this lock.
create function private.serialize_auction_automation_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('auction-auto-capability:'||new.capability_id,0));return new;
end $$;
revoke all on function private.serialize_auction_automation_approval() from public,anon,authenticated,service_role;
create trigger serialize_auction_automation_approval before insert or update on private.auction_automation_approvals
 for each row execute function private.serialize_auction_automation_approval();

-- Authoritative parity: the legacy manually addressed TEST lane cannot bypass
-- an unqualified final-net fee. Historical positive protocol fixtures remain
-- separate evidence; the current production schema grants no such permit.
alter function public.reserve_auction_test_transfer(uuid) rename to reserve_auction_test_transfer_before_fee_gate;
alter function public.claim_auction_test_transfer_dispatch(uuid) rename to claim_auction_test_transfer_dispatch_before_fee_gate;
revoke all on function public.reserve_auction_test_transfer_before_fee_gate(uuid),public.claim_auction_test_transfer_dispatch_before_fee_gate(uuid) from public,anon,authenticated,service_role;
create function public.reserve_auction_test_transfer(p_contract_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id for update;
 perform private.lock_auction_release_domain(c.id);perform 1 from public.money_purchase_intents where id=c.purchase_intent_id for update;
 perform private.lock_auction_release_qualification(c.id);
 if private.commerce_tax_fee_settlement_ready(case c.lane when 'event' then 'event_auction' else 'room_auction' end,c.quote_id) is distinct from true
 then return '{"status":"held","reason":"tax_service_fee_unverified","dispatchAuthorized":false}'::jsonb;end if;
 return public.reserve_auction_test_transfer_before_fee_gate(p_contract_id);
end $$;
create function public.claim_auction_test_transfer_dispatch(p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select contract.* into strict c from private.auction_platform_settlement_contracts contract join private.auction_transfer_operations o on o.contract_id=contract.id where o.id=p_operation_id for update of contract;
 perform private.lock_auction_release_domain(c.id);perform 1 from public.money_purchase_intents where id=c.purchase_intent_id for update;
 perform private.lock_auction_release_qualification(c.id);
 if private.commerce_tax_fee_settlement_ready(case c.lane when 'event' then 'event_auction' else 'room_auction' end,c.quote_id) is distinct from true
 then return '{"status":"held","reason":"tax_service_fee_unverified","dispatchAuthorized":false}'::jsonb;end if;
 return public.claim_auction_test_transfer_dispatch_before_fee_gate(p_operation_id);
end $$;
revoke all on function public.reserve_auction_test_transfer(uuid),public.claim_auction_test_transfer_dispatch(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_auction_test_transfer(uuid),public.claim_auction_test_transfer_dispatch(uuid) to service_role;
