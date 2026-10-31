-- Safe held visibility and dormant observation only. No transfer reservation,
-- execution, qualification renewal, schedule activation or payable ledger writes.
create table private.auction_observer_control(singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 next_run_at timestamptz not null default '-infinity',lease_until timestamptz);
insert into private.auction_observer_control(singleton) values(true);
create table private.auction_observer_jobs(contract_id uuid primary key references private.auction_platform_settlement_contracts(id),
 next_attempt_at timestamptz not null default clock_timestamp(),lease uuid,lease_until timestamptz,
 consecutive_failures integer not null default 0 check(consecutive_failures between 0 and 10),
 checked_at timestamptz,last_success_at timestamptz,last_result text check(last_result in('complete','incomplete')),
 domain_status text check(domain_status in('held','qualified_test_only','unknown')));
alter table private.auction_observer_control enable row level security;
alter table private.auction_observer_control force row level security;
alter table private.auction_observer_jobs enable row level security;
alter table private.auction_observer_jobs force row level security;
revoke all on private.auction_observer_control,private.auction_observer_jobs from public,anon,authenticated,service_role;
create index auction_observer_due_idx on private.auction_observer_jobs(next_attempt_at,contract_id);
create index auction_creator_held_page_idx on private.auction_platform_settlement_contracts(creator_id,created_at,id);
create index auction_latest_allocation_idx on private.auction_held_net_allocations(contract_id,id desc);

create function public.claim_auction_observation_batch() returns jsonb
language plpgsql security definer set search_path='' as $$
declare control private.auction_observer_control;c record;token uuid;jobs jsonb:='[]';
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into control from private.auction_observer_control where singleton for update skip locked;
 if control.singleton is null or not control.enabled or control.next_run_at>clock_timestamp() or control.lease_until>clock_timestamp()
 then return '{"claimed":false,"jobs":[],"financialAuthority":false}'::jsonb;end if;
 update private.auction_observer_control set next_run_at=clock_timestamp()+interval '15 minutes',lease_until=clock_timestamp()+interval '5 minutes' where singleton;
 for c in select contract.id,contract.lane from private.auction_platform_settlement_contracts contract
 join public.money_purchase_intents intent on intent.id=contract.purchase_intent_id
 left join private.auction_observer_jobs j on j.contract_id=contract.id
 where contract.environment='test' and intent.status in('consumed','revoked')
 and coalesce(j.next_attempt_at,'-infinity')<=clock_timestamp() and (j.lease_until is null or j.lease_until<=clock_timestamp())
 order by coalesce(j.next_attempt_at,contract.created_at),contract.id limit 3 for update of contract skip locked loop
  token:=extensions.gen_random_uuid();
  insert into private.auction_observer_jobs(contract_id,lease,lease_until,next_attempt_at)
  values(c.id,token,clock_timestamp()+interval '5 minutes',clock_timestamp()+interval '15 minutes')
  on conflict(contract_id) do update set lease=excluded.lease,lease_until=excluded.lease_until,next_attempt_at=excluded.next_attempt_at;
  jobs:=jobs||jsonb_build_array(jsonb_build_object('contract_id',c.id,'lane',c.lane,'lease',token));
 end loop;
 return jsonb_build_object('claimed',true,'jobs',jobs,'financialAuthority',false);
end $$;
create function public.complete_auction_observation(p_contract_id uuid,p_lease uuid,p_complete boolean,p_domain_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.auction_observer_jobs;failures integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if p_domain_status is null or p_domain_status not in('held','qualified_test_only','unknown') then raise exception 'domain_status_invalid';end if;
 select * into j from private.auction_observer_jobs where contract_id=p_contract_id for update;
 if j.contract_id is null or p_lease is null or j.lease is distinct from p_lease or j.lease_until is null or j.lease_until<=clock_timestamp()
 then return '{"stale":true,"financialAuthority":false}'::jsonb;end if;
 failures:=case when p_complete is true then 0 else least(j.consecutive_failures+1,10) end;
 update private.auction_observer_jobs set lease=null,lease_until=null,checked_at=clock_timestamp(),
 last_success_at=case when p_complete is true then clock_timestamp() else last_success_at end,
 last_result=case when p_complete is true then 'complete' else 'incomplete' end,
 domain_status=case when p_complete is true then p_domain_status else 'unknown' end,consecutive_failures=failures,
 next_attempt_at=clock_timestamp()+interval '15 minutes'*case when p_complete is true then 1 else least(power(2,failures-1),24) end
 where contract_id=p_contract_id;
 return '{"stale":false,"financialAuthority":false}'::jsonb;
end $$;
revoke all on function public.claim_auction_observation_batch(),public.complete_auction_observation(uuid,uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_auction_observation_batch(),public.complete_auction_observation(uuid,uuid,boolean,text) to service_role;

create function private.creator_auction_held_projection(c private.auction_platform_settlement_contracts) returns jsonb
language plpgsql stable set search_path='' as $$
declare a private.auction_held_net_allocations;j private.auction_observer_jobs;v private.auction_platform_qualifications;holds text[];fresh text;
begin
 select * into a from private.auction_held_net_allocations where contract_id=c.id order by id desc limit 1;
 select * into j from private.auction_observer_jobs where contract_id=c.id;
 select * into v from private.auction_platform_qualifications where capability_id=c.capability_id order by verified_at desc,id desc limit 1;
 holds:=coalesce(a.hold_reasons,'{}'::text[])||array['not_payable_source_only'];
 if a.id is null then holds:=array_append(holds,'provider_costs_unverified');end if;
 if not exists(select 1 from public.money_purchase_intents where id=c.purchase_intent_id and status='consumed') then holds:=array_append(holds,'payment_or_dispute_reconciliation');end if;
 if v.id is null or not v.enabled or v.revoked_at is not null or v.verified_at>clock_timestamp() or v.expires_at<=clock_timestamp()
 or row(v.platform_account_id,v.recipient_account_id,v.platform_product_id) is distinct from row(c.platform_account_id,c.recipient_account_id,c.platform_product_id)
 then holds:=array_append(holds,'recipient_qualification_required');end if;
 if private.auction_release_negative_holds(c.id) then holds:=array_append(holds,'fulfillment_or_qualification_review');end if;
 -- Never convert one domain snapshot into a promise of availability. Latest
 -- observations remain estimates; active refunds/issues keep independent holds.
 fresh:=case when j.lease is not null and j.lease_until>clock_timestamp() then 'pending'
 when j.last_success_at is null then 'unknown' when j.last_result<>'complete' or j.last_success_at<clock_timestamp()-interval '1 hour' then 'stale' else 'fresh' end;
 if fresh<>'fresh' then holds:=array_append(holds,'provider_refresh_required');end if;
 return jsonb_build_object('id',c.id,'lane',c.lane,'createdAt',c.created_at,'currency',c.currency,'grossMinor',c.amount_minor,
 'netMinor',a.net_minor,'creatorMinor',a.creator_minor,'platformMinor',a.platform_minor,'recoveryObligationMinor',a.recovery_obligation_minor,
 'observedAt',a.created_at,'holdReasons',holds,'providerRefreshStatus',fresh,'lastCheckedAt',j.checked_at,'financialAuthority',false,'notPayable',true);
end $$;
revoke all on function private.creator_auction_held_projection(private.auction_platform_settlement_contracts) from public,anon,authenticated,service_role;
create function public.list_creator_auction_held_earnings(p_after uuid default null,p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare anchor private.auction_platform_settlement_contracts;page jsonb;next_id text;n integer:=greatest(1,least(coalesce(p_limit,20),50));
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'creator_earnings_unavailable' using errcode='42501';end if;
 if p_after is not null then
  select * into anchor from private.auction_platform_settlement_contracts where id=p_after and creator_id=auth.uid();
  if anchor.id is null then raise exception 'creator_earnings_unavailable' using errcode='42501';end if;
 end if;
 select coalesce(jsonb_agg(private.creator_auction_held_projection(c::private.auction_platform_settlement_contracts) order by c.created_at,c.id),'[]'::jsonb) into page
 from (select * from private.auction_platform_settlement_contracts where creator_id=auth.uid()
  and (p_after is null or (created_at,id)>(anchor.created_at,anchor.id)) order by created_at,id limit n+1)c;
 if jsonb_array_length(page)>n then page:=page-n;next_id:=page->(n-1)->>'id';end if;
 return jsonb_build_object('entries',page,'nextCursor',next_id,'financialAuthority',false,'notPayable',true);
end $$;
revoke all on function public.list_creator_auction_held_earnings(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_creator_auction_held_earnings(uuid,integer) to authenticated;
