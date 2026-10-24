-- OFFLINE PROPOSAL. Deliberately outside supabase/migrations discovery.
-- Creates NO run/approval row. Never apply or seed without separate approval.
-- Only new isolated qualification objects are defined; no existing grants change.
begin;
create schema r2_qualification_test_private;
revoke all on schema r2_qualification_test_private from public, anon, authenticated, service_role;

create function r2_qualification_test_private.validate_state(s jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare n integer; item jsonb; expected text[] := array['put_control','put_target','read','conflict_target','delete_target','delete_control','cleanup_verify'];
begin
  if s is null or jsonb_typeof(s) <> 'object' or octet_length(s::text) > 4096
    or (select array_agg(k order by k) from jsonb_object_keys(s) k) is distinct from
      array['completed','manifestHash','observations','pending','phase','reconciliations','requestBudgetReserved','revision','runId','schema','updatedAt']
    or s->'schema' is distinct from '1'::jsonb
    or s->>'runId' is distinct from 'r2-retention-qualification-20261023-01'
    or s->>'manifestHash' is distinct from 'b01b7f40adab7a6f830dd38282550d70b3f18adb84c790d0d7fd7522ff014bd8'
    or jsonb_typeof(s->'completed') <> 'array' or jsonb_typeof(s->'observations') <> 'array'
    or jsonb_typeof(s->'revision') <> 'number' or (s->>'revision') !~ '^[0-9]{1,2}$'
    or jsonb_typeof(s->'reconciliations') <> 'number' or (s->>'reconciliations') !~ '^[0-3]$'
    or jsonb_typeof(s->'requestBudgetReserved') <> 'number' or (s->>'requestBudgetReserved') !~ '^[0-9]{1,2}$'
    or (s->>'requestBudgetReserved')::int > 22
    or (s->>'updatedAt') !~ '^2026-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or jsonb_typeof(s->'updatedAt') <> 'string'
    or jsonb_typeof(s->'phase') <> 'string'
    or (s->'pending' <> 'null'::jsonb and jsonb_typeof(s->'pending') <> 'string') then
    raise exception 'qualification_state_invalid';
  end if;
  perform (s->>'updatedAt')::timestamptz;
  if to_char((s->>'updatedAt')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    is distinct from s->>'updatedAt' then raise exception 'qualification_state_invalid'; end if;
  n := jsonb_array_length(s->'completed');
  if n > 7 or jsonb_array_length(s->'observations') > 2 then raise exception 'qualification_state_invalid'; end if;
  for i in 0..n-1 loop
    if s->'completed'->i is distinct from to_jsonb(expected[i+1]) then raise exception 'qualification_state_invalid'; end if;
  end loop;
  if s->>'phase' = 'blocked' then
    if n = 0 or s->'pending' <> 'null'::jsonb then raise exception 'qualification_state_invalid'; end if;
  elsif not (
    (n = 0 and s->>'phase' = 'new' and (s->>'pending' is null or s->>'pending' = 'put_control')) or
    (n = 1 and s->>'phase' = 'new' and (s->>'pending' is null or s->>'pending' = 'put_target')) or
    (n = 2 and s->>'phase' = 'prepared' and (s->>'pending' is null or s->>'pending' = 'read')) or
    (n = 3 and s->>'phase' = 'read_verified' and (s->>'pending' is null or s->>'pending' = 'conflict_target')) or
    (n = 4 and s->>'phase' = 'conflict_verified' and s->>'pending' is null) or
    (n = 4 and s->>'phase' = 'cleanup_started' and (s->>'pending' is null or s->>'pending' = 'delete_target')) or
    (n = 5 and s->>'phase' = 'cleanup_started' and (s->>'pending' is null or s->>'pending' = 'delete_control')) or
    (n = 6 and s->>'phase' = 'cleanup_started' and (s->>'pending' is null or s->>'pending' = 'cleanup_verify')) or
    (n = 7 and s->>'phase' = 'cleaned' and s->>'pending' is null)
  ) then raise exception 'qualification_state_invalid'; end if;
  for item in select value from jsonb_array_elements(s->'observations') loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'status') is distinct from 'number'
      or (item->>'status') !~ '^[1-5][0-9]{2}$'
      or jsonb_typeof(item->'observedAt') is distinct from 'string'
      or (item->>'observedAt') !~ '^2026-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then raise exception 'qualification_state_invalid'; end if;
    perform (item->>'observedAt')::timestamptz;
    if to_char((item->>'observedAt')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      is distinct from item->>'observedAt' then raise exception 'qualification_state_invalid'; end if;
    if item->>'status' = '200' then
      if (select array_agg(k order by k) from jsonb_object_keys(item) k) is distinct from array['byteCount','observedAt','sha256','status']
        or jsonb_typeof(item->'byteCount') <> 'number' or (item->>'byteCount') !~ '^[0-9]{1,4}$'
        or (item->>'byteCount')::int > 1024 or jsonb_typeof(item->'sha256') <> 'string'
        or (item->>'sha256') !~ '^[a-f0-9]{64}$' then raise exception 'qualification_state_invalid'; end if;
    elsif (select array_agg(k order by k) from jsonb_object_keys(item) k) is distinct from array['observedAt','status'] then
      raise exception 'qualification_state_invalid';
    end if;
  end loop;
exception when others then raise exception 'qualification_state_invalid';
end; $$;

create function r2_qualification_test_private.original_pair(o jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_array_length(o)=2 and o->0->'status'='200'::jsonb and o->1->'status'='200'::jsonb
    and o->0->'byteCount'='69'::jsonb and o->1->'byteCount'='74'::jsonb
    and o->0->>'sha256'='2edc6d52c3c1b90d2412337d267334a4fb68b2e0c9377bd931c961b6dfc6fa7f'
    and o->1->>'sha256'='0cbb9690b127e06a83220143e7761393621b3e9830bda03f0a5c835821e6cd94',false);
$$;

create function r2_qualification_test_private.valid_transition(a jsonb,b jsonb,cleanup_approved boolean,server_time timestamptz)
returns boolean language plpgsql immutable set search_path = '' as $$
declare ap text:=a->>'pending'; bp text:=b->>'pending'; phase_after text; budget integer;
begin
  perform r2_qualification_test_private.validate_state(a);
  perform r2_qualification_test_private.validate_state(b);
  if (b->>'revision')::int<>(a->>'revision')::int+1 or b->>'runId'<>a->>'runId'
    or b->>'manifestHash'<>a->>'manifestHash' or (b->>'updatedAt')::timestamptz<(a->>'updatedAt')::timestamptz
    or a->>'phase' in ('blocked','cleaned') then return false; end if;
  if b->>'phase' in ('cleanup_started','cleaned') and not cleanup_approved then return false; end if;
  -- Reserve exactly one new operation before its first request. Never reset it.
  if ap is null and bp is not null then
    -- Every protected mutation includes its independent receipt acquisition.
    budget:=case bp when 'conflict_target' then 4 else 2 end;
    return server_time<'2026-10-24T20:00:00.000Z'::timestamptz
      and b->>'phase'=a->>'phase' and b->'completed'=a->'completed' and b->'observations'=a->'observations'
      and b->'reconciliations'=a->'reconciliations'
      and (b->>'requestBudgetReserved')::int=(a->>'requestBudgetReserved')::int+budget;
  end if;
  -- Cleanup fence is permanent and independently approved before any DELETE.
  if ap is null and bp is null and a->>'phase'='conflict_verified' and b->>'phase'='cleanup_started' then
    return cleanup_approved and server_time<'2026-10-24T20:00:00.000Z'::timestamptz
      and (b - array['revision','updatedAt','phase'])=(a - array['revision','updatedAt','phase']);
  end if;
  -- Each bounded read-only reconciliation must first reserve its request budget.
  if ap is not null and bp=ap and (b->>'reconciliations')::int=(a->>'reconciliations')::int+1 then
    return server_time<'2026-10-24T20:00:00.000Z'::timestamptz
      and (b->>'requestBudgetReserved')::int=(a->>'requestBudgetReserved')::int+2
      and (b - array['revision','updatedAt','reconciliations','requestBudgetReserved'])=
          (a - array['revision','updatedAt','reconciliations','requestBudgetReserved']);
  end if;
  if b->'requestBudgetReserved'<>a->'requestBudgetReserved' or b->'reconciliations'<>a->'reconciliations' then return false; end if;
  -- Reconciliation observations never clear an uncertain write intent.
  if ap is not null and bp=ap then
    return (a->>'reconciliations')::int>0 and
      (b - array['revision','updatedAt','observations'])=(a - array['revision','updatedAt','observations']);
  end if;
  -- A trusted service worker records a receipt, not a caller-selected next phase.
  if ap is null or bp is not null or b->'completed'<>a->'completed'||jsonb_build_array(ap) then return false; end if;
  phase_after:=case ap when 'put_control' then 'new' when 'put_target' then 'prepared'
    when 'read' then 'read_verified' when 'conflict_target' then 'conflict_verified'
    when 'cleanup_verify' then 'cleaned' else 'cleanup_started' end;
  if b->>'phase'='blocked' then return true; end if;
  if b->>'phase'<>phase_after then return false; end if;
  if ap in ('read','conflict_target') then return r2_qualification_test_private.original_pair(b->'observations'); end if;
  if ap='cleanup_verify' then return jsonb_array_length(b->'observations')=2
    and b->'observations'->0->'status'='404'::jsonb and b->'observations'->1->'status'='404'::jsonb; end if;
  if ap in ('put_control','put_target') then return b->'observations'=a->'observations'; end if;
  -- DELETE receipt may retain prior observations, or reconcile its exact 404.
  return b->'observations'=a->'observations' or (jsonb_array_length(b->'observations')=2 and
    b->'observations'->(case ap when 'delete_control' then 0 else 1 end)->'status'='404'::jsonb);
end; $$;

create table r2_qualification_test_private.run (
  singleton boolean primary key default true check(singleton),
  state jsonb not null,
  setup_approval_ref text not null check(setup_approval_ref ~ '^approved:[A-Za-z0-9_.:-]{1,180}$'),
  cleanup_approval_ref text check(cleanup_approval_ref ~ '^approved:[A-Za-z0-9_.:-]{1,180}$')
);
alter table r2_qualification_test_private.run enable row level security;
alter table r2_qualification_test_private.run force row level security;
revoke all on r2_qualification_test_private.run from public, anon, authenticated, service_role;

create function r2_qualification_test_private.guard_run()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op in ('DELETE','TRUNCATE') then raise exception 'qualification_run_permanent'; end if;
  perform r2_qualification_test_private.validate_state(new.state);
  if tg_op='INSERT' then
    if new.state->'revision'<>'0'::jsonb or new.state->>'phase'<>'new' or new.state->'pending'<>'null'::jsonb
      or new.state->'completed'<>'[]'::jsonb or new.state->'observations'<>'[]'::jsonb
      or new.state->'reconciliations'<>'0'::jsonb or new.state->'requestBudgetReserved'<>'0'::jsonb
      or new.cleanup_approval_ref is not null then raise exception 'qualification_seed_invalid'; end if;
    return new;
  end if;
  if new.singleton is distinct from old.singleton or new.setup_approval_ref is distinct from old.setup_approval_ref then
    raise exception 'qualification_run_immutable'; end if;
  if new.state=old.state then
    -- No RPC grants this approval. Only separately authorized administrative SQL
    -- can record it, after conflict proof, without editing the run state.
    if old.cleanup_approval_ref is null and new.cleanup_approval_ref is not null
      and old.state->>'phase'='conflict_verified' and old.state->>'pending' is null then return new; end if;
    raise exception 'qualification_run_immutable';
  end if;
  if new.cleanup_approval_ref is distinct from old.cleanup_approval_ref
    or not r2_qualification_test_private.valid_transition(old.state,new.state,old.cleanup_approval_ref is not null,clock_timestamp()) then
    raise exception 'qualification_transition_invalid'; end if;
  return new;
end; $$;
create trigger guard_qualification_run before insert or update or delete on r2_qualification_test_private.run
  for each row execute function r2_qualification_test_private.guard_run();
create trigger guard_qualification_truncate before truncate on r2_qualification_test_private.run
  for each statement execute function r2_qualification_test_private.guard_run();

create function public.read_r2_qualification_test_run(p_run_id text,p_manifest_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'qualification_service_required'; end if;
  if p_run_id is distinct from 'r2-retention-qualification-20261023-01' or
    p_manifest_hash is distinct from 'b01b7f40adab7a6f830dd38282550d70b3f18adb84c790d0d7fd7522ff014bd8' then
    raise exception 'qualification_binding_invalid'; end if;
  select state into result from r2_qualification_test_private.run where singleton;
  if result is not null and (result->>'runId' is distinct from p_run_id or result->>'manifestHash' is distinct from p_manifest_hash) then
    raise exception 'qualification_binding_invalid'; end if;
  return result;
end; $$;

create function public.cas_r2_qualification_test_run(p_run_id text,p_manifest_hash text,p_expected_revision integer,p_next_state jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'qualification_service_required'; end if;
  if p_run_id is distinct from 'r2-retention-qualification-20261023-01' or
    p_manifest_hash is distinct from 'b01b7f40adab7a6f830dd38282550d70b3f18adb84c790d0d7fd7522ff014bd8' then
    raise exception 'qualification_binding_invalid'; end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'qualification_requires_read_committed'; end if;
  if p_expected_revision is null or p_expected_revision<0 then raise exception 'qualification_revision_invalid'; end if;
  select state into result from r2_qualification_test_private.run where singleton for update;
  if result is null then return false; end if;
  if result->>'runId' is distinct from p_run_id or result->>'manifestHash' is distinct from p_manifest_hash then
    raise exception 'qualification_binding_invalid'; end if;
  if (result->>'revision')::int<>p_expected_revision then return false; end if;
  update r2_qualification_test_private.run set state=p_next_state where singleton;
  return true;
end; $$;

revoke all on function r2_qualification_test_private.validate_state(jsonb),
  r2_qualification_test_private.original_pair(jsonb),
  r2_qualification_test_private.valid_transition(jsonb,jsonb,boolean,timestamptz),
  r2_qualification_test_private.guard_run() from public,anon,authenticated,service_role;
revoke all on function public.read_r2_qualification_test_run(text,text),
  public.cas_r2_qualification_test_run(text,text,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_r2_qualification_test_run(text,text),
  public.cas_r2_qualification_test_run(text,text,integer,jsonb) to service_role;
commit;
