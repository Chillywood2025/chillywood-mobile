-- Dormant read-only provider observation. No deployment, schedule or activation.
create table private.creator_provider_observation_control (
 id boolean primary key default true check(id), enabled boolean not null default false,
 last_claimed_at timestamptz
);
insert into private.creator_provider_observation_control(id) values(true);
create table private.creator_provider_observation_jobs (
 account_id uuid primary key references public.creator_payout_accounts(id),
 creator_id uuid not null references auth.users(id), environment text not null check(environment in('test','live')),
 provider_account_id text not null check(provider_account_id ~ '^acct_[A-Za-z0-9]+$'),
 due_at timestamptz not null default clock_timestamp(),
 lease_token uuid, leased_at timestamptz, lease_until timestamptz,
 previous_observed_at timestamptz, observed_at timestamptz,
 failure_count integer not null default 0 check(failure_count between 0 and 30)
);
create index creator_provider_observation_due on private.creator_provider_observation_jobs(due_at,account_id);
alter table private.creator_provider_observation_control enable row level security;
alter table private.creator_provider_observation_control force row level security;
alter table private.creator_provider_observation_jobs enable row level security;
alter table private.creator_provider_observation_jobs force row level security;
revoke all on private.creator_provider_observation_control,private.creator_provider_observation_jobs from public,anon,authenticated,service_role;

create function public.claim_creator_provider_observations() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.creator_provider_observation_control; j private.creator_provider_observation_jobs;
 result jsonb:='[]'; stamp timestamptz:=clock_timestamp(); mode text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into c from private.creator_provider_observation_control where id=true for update;
 stamp:=clock_timestamp();
 if c.enabled is distinct from true or c.last_claimed_at>stamp-interval '1 minute' then return result; end if;
 update private.creator_provider_observation_control set last_claimed_at=stamp where id=true;
 mode:=case when exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on') then 'live' else 'test' end;
 -- Join through auth UUID text; never cast arbitrary legacy creator text to UUID.
 insert into private.creator_provider_observation_jobs(account_id,creator_id,environment,provider_account_id,due_at)
 select a.id,u.id,a.provider_environment,a.provider_account_id,stamp
 from public.creator_payout_accounts a join auth.users u on u.id::text=a.creator_user_id
 join public.wave1_creator_eligibility e on e.creator_user_id=u.id
 where a.provider='stripe_connect' and a.provider_environment=mode
 and e.creator_role is true and e.account_status='ACTIVE'
 and e.state not in ('SUSPENDED','REVOKED') and e.moderation_state not in ('SUSPENDED','REVOKED')
 and u.deleted_at is null and not public.is_account_access_restricted(u.id::text)
 and (u.banned_until is null or u.banned_until<=stamp) and coalesce(u.raw_app_meta_data->>'accountDeidentified','false')<>'true'
 and a.provider_account_id ~ '^acct_[A-Za-z0-9]+$'
 and private.ordinary_commerce_premium_current(u.id,case mode when 'live' then 'production' else 'sandbox' end)
 on conflict(account_id) do nothing;
 -- An expired job may still be held by an unresolved completion. Skip it
 -- rather than blocking all healthy claims behind that row. Bound maintenance
 -- separately from the five provider observations returned by this call.
 with expired as materialized (
  select account_id from private.creator_provider_observation_jobs
  where lease_until<=stamp order by lease_until,account_id limit 25
  for update skip locked
 )
 update private.creator_provider_observation_jobs q set failure_count=least(q.failure_count+1,30),
 due_at=stamp+make_interval(mins=>least(10,power(2,least(q.failure_count,4))::integer)),
 lease_token=null,lease_until=null,leased_at=null
 from expired where q.account_id=expired.account_id and q.lease_until<=stamp;
 for j in select q.* from private.creator_provider_observation_jobs q
 join public.creator_payout_accounts a on a.id=q.account_id
 join auth.users u on u.id::text=a.creator_user_id and u.id=q.creator_id
 join public.wave1_creator_eligibility e on e.creator_user_id=u.id
 where q.due_at<=stamp and q.lease_token is null and a.provider='stripe_connect' and a.provider_environment=mode
 and e.creator_role is true and e.account_status='ACTIVE'
 and e.state not in ('SUSPENDED','REVOKED') and e.moderation_state not in ('SUSPENDED','REVOKED')
 and u.deleted_at is null and not public.is_account_access_restricted(u.id::text)
 and (u.banned_until is null or u.banned_until<=stamp) and coalesce(u.raw_app_meta_data->>'accountDeidentified','false')<>'true'
 and a.provider_account_id ~ '^acct_[A-Za-z0-9]+$'
 and private.ordinary_commerce_premium_current(u.id,case mode when 'live' then 'production' else 'sandbox' end)
 order by q.due_at,q.account_id limit 5 for update of q skip locked
 loop
   update private.creator_provider_observation_jobs q set environment=a.provider_environment,
    provider_account_id=a.provider_account_id, previous_observed_at=a.provider_configuration_observed_at,
    observed_at=case when q.environment=a.provider_environment and q.provider_account_id=a.provider_account_id then q.observed_at end,
    lease_token=gen_random_uuid(),leased_at=stamp,lease_until=stamp+interval '2 minutes'
   from public.creator_payout_accounts a where q.account_id=j.account_id and a.id=q.account_id
   returning q.* into j;
   result:=result||jsonb_build_array(jsonb_build_object('account_id',j.account_id,'creator_id',j.creator_id,
    'environment',j.environment,'provider_account_id',j.provider_account_id,'lease_token',j.lease_token));
 end loop;
 return result;
end $$;

create function public.complete_creator_provider_observation(p_account uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.creator_payout_accounts; j private.creator_provider_observation_jobs; stamp timestamptz:=clock_timestamp(); mode text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 -- Global order: account -> job -> wave1 refresh mutex. Never job -> account.
 select * into a from public.creator_payout_accounts where id=p_account for update;
 select * into j from private.creator_provider_observation_jobs where account_id=p_account for update;
 -- Never validate a lease against the timestamp from before a lock wait.
 stamp:=clock_timestamp();
 mode:=case when exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on') then 'live' else 'test' end;
 if p_token is null or j.lease_token is null or j.lease_token is distinct from p_token
 or j.lease_until is null or j.leased_at is null or j.lease_until<=stamp
 or a.id is null or a.creator_user_id is distinct from j.creator_id::text
 or a.provider is distinct from 'stripe_connect' or a.provider_environment is distinct from j.environment
 or a.provider_environment is distinct from mode or a.provider_account_id is distinct from j.provider_account_id
 or a.provider_configuration_account_id is distinct from j.provider_account_id
 or a.provider_configuration_observed_at is null or a.last_provider_sync_at is distinct from a.provider_configuration_observed_at
 or a.provider_configuration_observed_at not between j.leased_at and stamp
 or a.provider_configuration_observed_at is not distinct from j.previous_observed_at
 or not private.ordinary_commerce_premium_current(j.creator_id,case mode when 'live' then 'production' else 'sandbox' end)
 or not exists(select 1 from public.wave1_creator_eligibility e join auth.users u on u.id=e.creator_user_id
   where e.creator_user_id=j.creator_id and e.creator_role is true and e.account_status='ACTIVE'
   and e.state not in ('SUSPENDED','REVOKED') and e.moderation_state not in ('SUSPENDED','REVOKED')
   and u.deleted_at is null and not public.is_account_access_restricted(u.id::text)
   and (u.banned_until is null or u.banned_until<=stamp) and coalesce(u.raw_app_meta_data->>'accountDeidentified','false')<>'true')
 or not exists(select 1 from public.platform_admin_audit_logs l where l.target_id=p_account::text
   and l.target_user_id=j.creator_id::text and l.action='creator_provider_observation_persisted' and l.actor_role='system'
   and l.actor_user_id is null and l.metadata->>'source'='creator-provider-observation-worker'
   and l.metadata->>'provider_environment'=j.environment and l.created_at between a.provider_configuration_observed_at and stamp)
 then return jsonb_build_object('completed',false); end if;
 update private.creator_provider_observation_jobs set observed_at=a.provider_configuration_observed_at,
  due_at=stamp+interval '5 minutes',failure_count=0,lease_token=null,lease_until=null,leased_at=null
 where account_id=p_account;
 perform private.refresh_ordinary_creator_eligibility(j.creator_id);
 return jsonb_build_object('completed',true);
end $$;

create function public.fail_creator_provider_observation(p_account uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n integer; stamp timestamptz:=clock_timestamp();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform 1 from private.creator_provider_observation_jobs where account_id=p_account for update;
 stamp:=clock_timestamp();
 update private.creator_provider_observation_jobs set failure_count=least(failure_count+1,30),
 due_at=stamp+make_interval(mins=>least(10,power(2,least(failure_count,4))::integer)),
 lease_token=null,lease_until=null,leased_at=null
 where account_id=p_account and p_token is not null and lease_token=p_token and lease_until>stamp;
 get diagnostics n=row_count;
 return jsonb_build_object('recorded',n=1);
end $$;
revoke all on function public.claim_creator_provider_observations(),public.complete_creator_provider_observation(uuid,uuid),public.fail_creator_provider_observation(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_creator_provider_observations(),public.complete_creator_provider_observation(uuid,uuid),public.fail_creator_provider_observation(uuid,uuid) to service_role;

-- Add the automatic source only after its private table exists. Manual syncs
-- cannot mint automatic freshness or preserve it across a changed binding.
do $patch$
declare d text; needle text:='and a.last_provider_sync_at between';
begin
 d:=pg_get_functiondef('private.ordinary_creator_provider_ready(uuid,text)'::regprocedure);
 if position(needle in d)=0 then raise exception 'ordinary_provider_freshness_patch_missing'; end if;
 execute replace(d,needle,$replacement$and exists(select 1 from private.creator_provider_observation_jobs j
   where j.account_id=a.id and j.creator_id=p_creator and j.environment=a.provider_environment
   and j.provider_account_id=a.provider_account_id and j.observed_at=a.provider_configuration_observed_at
   and j.observed_at=a.last_provider_sync_at and j.observed_at between clock_timestamp()-interval '15 minutes' and clock_timestamp())
  and a.last_provider_sync_at between$replacement$);
end $patch$;
