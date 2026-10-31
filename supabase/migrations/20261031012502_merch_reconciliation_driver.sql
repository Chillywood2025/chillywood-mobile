-- Dormant source only: no cron installation, secrets, provider or money actions.
create table private.merch_reconciliation_driver (
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 next_run_at timestamptz not null default '-infinity',lease_until timestamptz
);
insert into private.merch_reconciliation_driver(singleton) values(true);
create table private.merch_cost_refresh_jobs (
 order_id uuid primary key references public.merch_orders(id),
 next_attempt_at timestamptz not null default clock_timestamp(),lease uuid,lease_until timestamptz,
 consecutive_failures integer not null default 0 check(consecutive_failures between 0 and 10),
 checked_at timestamptz,last_success_at timestamptz,last_result text check(last_result in('complete','incomplete'))
);
create index merch_cost_refresh_due_idx on private.merch_cost_refresh_jobs(next_attempt_at,order_id);
alter table private.merch_reconciliation_driver enable row level security;
alter table private.merch_reconciliation_driver force row level security;
alter table private.merch_cost_refresh_jobs enable row level security;
alter table private.merch_cost_refresh_jobs force row level security;
revoke all on private.merch_reconciliation_driver,private.merch_cost_refresh_jobs from public,anon,authenticated,service_role;
create function public.claim_merch_reconciliation_batch() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.merch_reconciliation_driver;o record;token uuid; jobs jsonb:='[]';
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into c from private.merch_reconciliation_driver where singleton for update skip locked;
 if c.singleton is null or not c.enabled or c.next_run_at>clock_timestamp() or c.lease_until>clock_timestamp()
 then return '{"claimed":false,"jobs":[],"financialAuthority":false}'::jsonb;end if;
 update private.merch_reconciliation_driver set next_run_at=clock_timestamp()+interval '15 minutes',lease_until=clock_timestamp()+interval '5 minutes' where singleton;
 -- Persistent due ordering is the cursor: retries move behind older due orders.
 -- No unbounded backfill; exactly three eligible orders are admitted per run.
 for o in select m.id from public.merch_orders m left join private.merch_cost_refresh_jobs j on j.order_id=m.id
 where m.provider='stripe_physical_goods' and m.environment='sandbox'
 and m.net_share_policy_version='physical_merch_net_90_10_v1' and m.payment_status in('paid','refunded','disputed')
 and m.stripe_payment_intent_id is not null and m.stripe_checkout_session_id is not null
 and coalesce(j.next_attempt_at,'-infinity')<=clock_timestamp() and (j.lease_until is null or j.lease_until<=clock_timestamp())
 order by coalesce(j.next_attempt_at,m.created_at),m.id limit 3 for update of m skip locked loop
  token:=extensions.gen_random_uuid();
  insert into private.merch_cost_refresh_jobs(order_id,lease,lease_until,next_attempt_at)
  values(o.id,token,clock_timestamp()+interval '5 minutes',clock_timestamp()+interval '15 minutes')
  on conflict(order_id) do update set lease=excluded.lease,lease_until=excluded.lease_until,next_attempt_at=excluded.next_attempt_at;
  jobs:=jobs||jsonb_build_array(jsonb_build_object('order_id',o.id,'lease',token));
 end loop;
 return jsonb_build_object('claimed',true,'jobs',jobs,'financialAuthority',false);
end $$;
create function public.complete_merch_cost_refresh(p_order_id uuid,p_lease uuid,p_complete boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.merch_cost_refresh_jobs;failures integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into j from private.merch_cost_refresh_jobs where order_id=p_order_id for update;
 if j.order_id is null or p_lease is null or j.lease is distinct from p_lease or j.lease_until is null or j.lease_until<=clock_timestamp()
 then return '{"stale":true,"financialAuthority":false}'::jsonb;end if;
 failures:=case when p_complete is true then 0 else least(j.consecutive_failures+1,10) end;
 update private.merch_cost_refresh_jobs set lease=null,lease_until=null,checked_at=clock_timestamp(),
 last_success_at=case when p_complete is true then clock_timestamp() else last_success_at end,
 last_result=case when p_complete is true then 'complete' else 'incomplete' end,consecutive_failures=failures,
 next_attempt_at=clock_timestamp()+case when p_complete is true then interval '6 hours' else interval '15 minutes'*least(power(2,failures-1),24) end
 where order_id=p_order_id;
 return '{"stale":false,"financialAuthority":false}'::jsonb;
end $$;
revoke all on function public.claim_merch_reconciliation_batch(),public.complete_merch_cost_refresh(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.claim_merch_reconciliation_batch(),public.complete_merch_cost_refresh(uuid,uuid,boolean) to service_role;

-- Existing creator/buyer order projections merge this state object. Only safe
-- timestamps/status cross the boundary, never provider IDs or credentials.
alter function private.merch_return_hold_state(public.merch_orders,timestamptz) rename to merch_return_hold_before_refresh_metadata;
create function private.merch_return_hold_state(o public.merch_orders,p_as_of timestamptz) returns jsonb
language plpgsql stable set search_path='' as $$
declare a private.merch_dispute_observation_attempts;e private.merch_dispute_observations;s text;
begin
 select * into a from private.merch_dispute_observation_attempts where order_id=o.id order by attempt_no desc limit 1;
 select * into e from private.merch_dispute_observations where attempt_id=a.id;
 s:=case when a.id is null then 'unknown' when e.attempt_id is null then case when a.started_at<p_as_of-interval '5 minutes' then 'stale' else 'pending' end
  when a.started_at>p_as_of or e.recorded_at>p_as_of or a.started_at<p_as_of-interval '12 hours' or o.updated_at>a.started_at then 'stale' else 'fresh' end;
 return private.merch_return_hold_before_refresh_metadata(o,p_as_of)||jsonb_build_object(
  'providerDisputeCheckedAt',e.recorded_at,'providerDisputeFreshUntil',case when e.attempt_id is not null then a.started_at+interval '12 hours' end,
  'providerDisputeRefreshStatus',s);
end $$;
revoke all on function private.merch_return_hold_before_refresh_metadata(public.merch_orders,timestamptz),private.merch_return_hold_state(public.merch_orders,timestamptz) from public,anon,authenticated,service_role;
