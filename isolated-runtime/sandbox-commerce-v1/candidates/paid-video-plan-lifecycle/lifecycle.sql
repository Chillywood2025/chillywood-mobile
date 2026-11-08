-- CANDIDATE: fresh inactive installation only, after protocol3 core and before
-- the sibling candidate commands/provisioning sources. Never a hot replacement.
-- Local active admission is separate from immutable retained inventory (32).
set local role sbx_v1_core_owner;
do $fresh$
begin
 if (select state from sandbox_commerce_v1.lifecycle where singleton) is distinct from 'disabled'
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_plans)
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_controls where ingress_enabled or provisioning_enabled or initiation_enabled)
 then raise exception 'test_store_v3_lifecycle_fresh_inactive_install_required'; end if;
end; $fresh$;

create table sandbox_commerce_v1.test_store_v3_plan_lifecycle (
 plan_id uuid primary key references sandbox_commerce_v1.test_store_v3_plans(id),
 project_id text not null, state text not null check(state in ('active','draining','retired')),
 revision bigint not null check(revision between 1 and 9007199254740991),
 enrolled_at timestamptz not null default clock_timestamp(),
 drain_started_at timestamptz, drain_after timestamptz, retired_at timestamptz,
 check(isfinite(enrolled_at) and (drain_started_at is null or isfinite(drain_started_at))
  and (drain_after is null or isfinite(drain_after)) and (retired_at is null or isfinite(retired_at))),
 check((state='active' and drain_started_at is null and drain_after is null and retired_at is null)
  or(state='draining' and drain_started_at is not null and drain_after is not null and drain_after>=drain_started_at and retired_at is null)
  or(state='retired' and drain_started_at is not null and drain_after is not null and retired_at is not null and drain_after>=drain_started_at and retired_at>=drain_after))
);
create table sandbox_commerce_v1.test_store_v3_plan_lifecycle_events (
 plan_id uuid not null references sandbox_commerce_v1.test_store_v3_plan_lifecycle(plan_id),
 revision bigint not null, state text not null check(state in ('active','draining','retired')),
 request_id uuid unique, occurred_at timestamptz not null default clock_timestamp(),
 drain_started_at timestamptz, drain_after timestamptz, retired_at timestamptz,
 primary key(plan_id,revision)
);
create table sandbox_commerce_v1.test_store_v3_plan_lifecycle_requests (
 request_id uuid primary key, plan_id uuid not null references sandbox_commerce_v1.test_store_v3_plan_lifecycle(plan_id),
 action text not null check(action in ('drain','retire')), expected_revision bigint not null,
 outcome text not null check(outcome in ('applied','waiting','already_closed')),
 observed_revision bigint not null, requested_at timestamptz not null default clock_timestamp()
);
do $private$
declare t text;
begin
 foreach t in array array['plan_lifecycle','plan_lifecycle_events','plan_lifecycle_requests'] loop
  execute format('alter table sandbox_commerce_v1.test_store_v3_%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.test_store_v3_%I force row level security',t);
  execute format('create policy core_owner on sandbox_commerce_v1.test_store_v3_%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on table sandbox_commerce_v1.test_store_v3_%I from public,anon,authenticated,service_role,sbx_v1_operator',t);
  execute format('create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_v3_%I for each statement execute function sandbox_commerce_v1.test_store_v3_immutable()',t);
  if t<>'plan_lifecycle' then
   execute format('create trigger immutable before update or delete on sandbox_commerce_v1.test_store_v3_%I for each row execute function sandbox_commerce_v1.test_store_v3_immutable()',t);
  end if;
 end loop;
end; $private$;

create function sandbox_commerce_v1.test_store_v3_protect_plan_lifecycle()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'UPDATE' or row(new.plan_id,new.project_id,new.enrolled_at) is distinct from row(old.plan_id,old.project_id,old.enrolled_at)
  or new.revision<>old.revision+1
  or not((old.state='active' and new.state='draining') or(old.state='draining' and new.state='retired'))
  or(old.state='draining' and row(new.drain_started_at,new.drain_after) is distinct from row(old.drain_started_at,old.drain_after))
 then raise exception 'test_store_v3_plan_lifecycle_irreversible'; end if;
 return new;
end; $$;
create trigger irreversible before update or delete on sandbox_commerce_v1.test_store_v3_plan_lifecycle
 for each row execute function sandbox_commerce_v1.test_store_v3_protect_plan_lifecycle();

create function sandbox_commerce_v1.test_store_v3_enroll_plan()
returns trigger language plpgsql security invoker set search_path='' as $$
declare project text; budget integer;
begin
 select project_id into strict project from sandbox_commerce_v1.test_store_v3_customers where id=new.customer_id;
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-capacity:'||project,683))
 then raise exception 'test_store_v3_capacity_busy' using errcode='55P03'; end if;
 select max_active_plans into strict budget from sandbox_commerce_v1.test_store_v3_controls where singleton for share nowait;
 if (select count(*) from sandbox_commerce_v1.test_store_v3_plans p join sandbox_commerce_v1.test_store_v3_customers c on c.id=p.customer_id where c.project_id=project)>32
 then raise exception 'test_store_v3_retained_inventory_exhausted'; end if;
 if (select count(*) from sandbox_commerce_v1.test_store_v3_plan_lifecycle where project_id=project and state<>'retired')>=budget
 then raise exception 'test_store_v3_active_capacity_unavailable'; end if;
 insert into sandbox_commerce_v1.test_store_v3_plan_lifecycle(plan_id,project_id,state,revision) values(new.id,project,'active',1);
 insert into sandbox_commerce_v1.test_store_v3_plan_lifecycle_events(plan_id,revision,state) values(new.id,1,'active');
 return new;
end; $$;
create trigger lifecycle_enrollment after insert on sandbox_commerce_v1.test_store_v3_plans
 for each row execute function sandbox_commerce_v1.test_store_v3_enroll_plan();

-- All new economic work and lifecycle transitions share project then plan
-- nonblocking fences. No lock survives a database transaction into HTTP/SDK I/O.
create function sandbox_commerce_v1.test_store_v3_lock_plan(p_plan uuid)
returns sandbox_commerce_v1.test_store_v3_plan_lifecycle language plpgsql volatile security invoker set search_path='' as $$
declare project text; phase sandbox_commerce_v1.test_store_v3_plan_lifecycle;
begin
 select c.project_id into strict project from sandbox_commerce_v1.test_store_v3_plans p
  join sandbox_commerce_v1.test_store_v3_customers c on c.id=p.customer_id where p.id=p_plan;
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-capacity:'||project,683))
  or not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-provision-plan:'||p_plan,683))
 then raise exception 'test_store_v3_plan_lifecycle_busy' using errcode='55P03'; end if;
 select * into strict phase from sandbox_commerce_v1.test_store_v3_plan_lifecycle where plan_id=p_plan for update nowait;
 if phase.project_id<>project then raise exception 'test_store_v3_plan_lifecycle_scope_mismatch'; end if;
 return phase;
end; $$;

create function sandbox_commerce_v1.test_store_v3_plan_lifecycle_json(p_plan uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('protocol','test-store-v3-plan-lifecycle-candidate-v1','planId',p.plan_id,'projectId',p.project_id,
  'state',p.state,'revision',p.revision,'drainStartedAt',p.drain_started_at,'drainAfter',p.drain_after,'retiredAt',p.retired_at,
  'providerCompletionProven',false,'providerDeletionProven',false,'historicalReceiptIntakeRequired',true,
  'retainedInventoryLimit',32,'financialAuthority',false)
 from sandbox_commerce_v1.test_store_v3_plan_lifecycle p where p.plan_id=p_plan;
$$;
create function sandbox_commerce_v1.test_store_v3_plan_lifecycle_read(p_plan uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare phase sandbox_commerce_v1.test_store_v3_plan_lifecycle;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout(); perform sandbox_commerce_v1.assert_generation(false);
 phase:=sandbox_commerce_v1.test_store_v3_lock_plan(p_plan);
 return sandbox_commerce_v1.test_store_v3_plan_lifecycle_json(phase.plan_id);
end; $$;

create function sandbox_commerce_v1.test_store_v3_retire_plan(p_plan uuid,p_action text,p_request uuid,p_expected_revision bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare phase sandbox_commerce_v1.test_store_v3_plan_lifecycle; prior sandbox_commerce_v1.test_store_v3_plan_lifecycle_requests;
 horizon timestamptz; started timestamptz; outcome text; changed boolean:=false;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout(); perform sandbox_commerce_v1.assert_generation(false);
 if p_plan is null or p_request is null or p_action is null or p_action not in ('drain','retire') or p_expected_revision is null
  or p_expected_revision not between 1 and 9007199254740991 then raise exception 'test_store_v3_lifecycle_request_invalid'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-lifecycle-request:'||p_request,687))
 then raise exception 'test_store_v3_lifecycle_request_busy' using errcode='55P03'; end if;
 phase:=sandbox_commerce_v1.test_store_v3_lock_plan(p_plan);
 select * into prior from sandbox_commerce_v1.test_store_v3_plan_lifecycle_requests where request_id=p_request;
 if found then
  if row(prior.plan_id,prior.action,prior.expected_revision) is distinct from row(p_plan,p_action,p_expected_revision)
  then raise exception 'test_store_v3_lifecycle_request_conflict'; end if;
  return sandbox_commerce_v1.test_store_v3_plan_lifecycle_json(p_plan)||jsonb_build_object('requestId',p_request,'replayed',true,'outcome',prior.outcome,'appliedNow',false);
 end if;
 if phase.revision<>p_expected_revision then raise exception 'test_store_v3_lifecycle_revision_conflict'; end if;
 if p_action='drain' and phase.state='active' then
  started:=clock_timestamp();
  select greatest(started,
   (select max(valid_until) from sandbox_commerce_v1.test_store_v3_tickets where plan_id=p_plan),
   (select max(expires_at) from sandbox_commerce_v1.test_store_v3_work_leases where plan_id=p_plan),
   (select greatest(d.accept_purchase_until,d.authority_valid_until) from sandbox_commerce_v1.dispatch_attempts d
    join sandbox_commerce_v1.test_store_v3_plans p on p.intent_id=d.intent_id where p.id=p_plan)) into horizon;
  update sandbox_commerce_v1.test_store_v3_plan_lifecycle set state='draining',revision=revision+1,
   drain_started_at=started,drain_after=horizon where plan_id=p_plan returning * into phase;
  changed:=true; outcome:='applied';
 elsif p_action='retire' and phase.state='active' then raise exception 'test_store_v3_plan_must_drain';
 elsif p_action='retire' and phase.state='draining' then
  if clock_timestamp()<phase.drain_after then outcome:='waiting';
  else
   if exists(select 1 from sandbox_commerce_v1.test_store_v3_tickets where plan_id=p_plan
      and operation in ('create_offering','create_package','attach_product') and consumed_at>phase.drain_started_at)
    or exists(select 1 from sandbox_commerce_v1.dispatch_attempts d join sandbox_commerce_v1.test_store_v3_plans p on p.intent_id=d.intent_id
      where p.id=p_plan and d.claimed_at>phase.drain_started_at)
   then raise exception 'test_store_v3_post_drain_admission_detected'; end if;
   update sandbox_commerce_v1.test_store_v3_plan_lifecycle set state='retired',revision=revision+1,retired_at=clock_timestamp()
    where plan_id=p_plan returning * into phase;
   changed:=true; outcome:='applied';
  end if;
 else outcome:='already_closed'; end if;
 if changed then
  insert into sandbox_commerce_v1.test_store_v3_plan_lifecycle_events(plan_id,revision,state,request_id,drain_started_at,drain_after,retired_at)
   values(p_plan,phase.revision,phase.state,p_request,phase.drain_started_at,phase.drain_after,phase.retired_at);
 end if;
 insert into sandbox_commerce_v1.test_store_v3_plan_lifecycle_requests(request_id,plan_id,action,expected_revision,outcome,observed_revision)
  values(p_request,p_plan,p_action,p_expected_revision,outcome,phase.revision);
 return sandbox_commerce_v1.test_store_v3_plan_lifecycle_json(p_plan)||jsonb_build_object('requestId',p_request,'replayed',false,'outcome',outcome,'appliedNow',changed);
end; $$;
revoke all on function sandbox_commerce_v1.test_store_v3_protect_plan_lifecycle(),sandbox_commerce_v1.test_store_v3_enroll_plan(),
 sandbox_commerce_v1.test_store_v3_lock_plan(uuid),sandbox_commerce_v1.test_store_v3_plan_lifecycle_json(uuid),
 sandbox_commerce_v1.test_store_v3_plan_lifecycle_read(uuid),sandbox_commerce_v1.test_store_v3_retire_plan(uuid,text,uuid,bigint)
 from public,anon,authenticated,service_role,sbx_v1_operator;
grant execute on function sandbox_commerce_v1.test_store_v3_plan_lifecycle_read(uuid),
 sandbox_commerce_v1.test_store_v3_retire_plan(uuid,text,uuid,bigint) to sbx_v1_operator;
reset role;
