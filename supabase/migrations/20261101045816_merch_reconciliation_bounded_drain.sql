-- Source-only capacity repair. Does not enable the driver, alter cron, retire
-- historical obligations or change the six-hour/12-hour financial evidence gates.
alter table private.merch_reconciliation_driver
 add column run_id uuid, add column run_until timestamptz,
 add column run_claimed integer not null default 0 check(run_claimed between 0 and 30);
alter table private.merch_cost_refresh_jobs add column run_id uuid;

create function private.merch_reconciliation_backlog_health() returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'observedAt',now(),
  'eligible',count(*),
  'inFlight',count(*) filter(where j.lease_until>now()),
  'due',count(*) filter(where coalesce(j.next_attempt_at,'-infinity')<=now()),
  'neverCompleted',count(*) filter(where j.last_success_at is null),
  'refreshOverdue12h',count(*) filter(where j.last_success_at is null or j.last_success_at<now()-interval '12 hours'),
  'oldestDueAt',min(coalesce(j.next_attempt_at,m.created_at)) filter(where coalesce(j.next_attempt_at,'-infinity')<=now()),
  'nominalMaxOrdersPer6h',720,'nominalCapacityExceeded',count(*)>720,
  'capacityGuaranteed',false)
 from public.merch_orders m left join private.merch_cost_refresh_jobs j on j.order_id=m.id
 where m.provider='stripe_physical_goods' and m.environment='sandbox'
 and m.net_share_policy_version='physical_merch_net_90_10_v1' and m.payment_status in('paid','refunded','disputed')
 and m.stripe_payment_intent_id is not null and m.stripe_checkout_session_id is not null;
$$;
revoke all on function private.merch_reconciliation_backlog_health() from public,anon,authenticated,service_role;

create function public.continue_merch_reconciliation_batch(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.merch_reconciliation_driver;o record;token uuid;jobs jsonb:='[]';
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into c from private.merch_reconciliation_driver where singleton for update skip locked;
 if c.singleton is null or not c.enabled or p_run_id is null or c.run_id is distinct from p_run_id
  or c.run_until is null or c.run_until<=clock_timestamp() or c.run_claimed>=30
 then return jsonb_build_object('claimed',false,'jobs','[]'::jsonb,'financialAuthority',false);end if;
 -- A duplicated/parallel continuation cannot multiply worker concurrency.
 if exists(select 1 from private.merch_cost_refresh_jobs where run_id=p_run_id and lease_until>clock_timestamp())
 then return jsonb_build_object('claimed',false,'jobs','[]'::jsonb,'financialAuthority',false);end if;
 -- Oldest due first, not latest paid first: new arrivals and poison retries may
 -- not jump an older backlog. Backoff is preserved by the completion RPC.
 for o in select m.id from public.merch_orders m left join private.merch_cost_refresh_jobs j on j.order_id=m.id
 where m.provider='stripe_physical_goods' and m.environment='sandbox'
 and m.net_share_policy_version='physical_merch_net_90_10_v1' and m.payment_status in('paid','refunded','disputed')
 and m.stripe_payment_intent_id is not null and m.stripe_checkout_session_id is not null
 and coalesce(j.next_attempt_at,'-infinity')<=clock_timestamp() and (j.lease_until is null or j.lease_until<=clock_timestamp())
 order by coalesce(j.next_attempt_at,m.created_at),m.id limit least(3,30-c.run_claimed) for update of m skip locked loop
  token:=extensions.gen_random_uuid();
  insert into private.merch_cost_refresh_jobs(order_id,lease,lease_until,next_attempt_at,run_id)
  values(o.id,token,clock_timestamp()+interval '5 minutes',clock_timestamp()+interval '15 minutes',p_run_id)
  on conflict(order_id) do update set lease=excluded.lease,lease_until=excluded.lease_until,next_attempt_at=excluded.next_attempt_at,run_id=excluded.run_id;
  jobs:=jobs||jsonb_build_array(jsonb_build_object('order_id',o.id,'lease',token));
 end loop;
 update private.merch_reconciliation_driver set run_claimed=run_claimed+jsonb_array_length(jobs) where singleton;
 return jsonb_build_object('claimed',true,'runId',p_run_id,'jobs',jobs,'health',private.merch_reconciliation_backlog_health(),'financialAuthority',false);
end $$;

create or replace function public.claim_merch_reconciliation_batch() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.merch_reconciliation_driver;token uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into c from private.merch_reconciliation_driver where singleton for update skip locked;
 if c.singleton is null or not c.enabled or c.next_run_at>clock_timestamp() or c.lease_until>clock_timestamp()
 then return jsonb_build_object('claimed',false,'jobs','[]'::jsonb,'financialAuthority',false);end if;
 token:=extensions.gen_random_uuid();
 update private.merch_reconciliation_driver set next_run_at=clock_timestamp()+interval '15 minutes',
  lease_until=clock_timestamp()+interval '5 minutes',run_id=token,run_until=clock_timestamp()+interval '100 seconds',run_claimed=0 where singleton;
 return public.continue_merch_reconciliation_batch(token);
end $$;
revoke all on function public.continue_merch_reconciliation_batch(uuid),public.claim_merch_reconciliation_batch() from public,anon,authenticated,service_role;
grant execute on function public.continue_merch_reconciliation_batch(uuid),public.claim_merch_reconciliation_batch() to service_role;
