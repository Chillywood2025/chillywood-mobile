-- Recurring Cognitive Level 0/1 child-task factory.
--
-- This migration gives a distinct scheduler identity one closed operation:
-- create a fresh bounded child intelligence task for an enabled recurring
-- schedule, or immutably record that the occurrence had no work. It grants no
-- merge, release, deployment, Level 2, private-memory, role, rights, money, or
-- Owner authority.

create table public.cognitive_level01_scheduler_capabilities (
  id uuid primary key default gen_random_uuid(),
  service_identity text not null check (
    service_identity = 'cognitive_level01_scheduler'
  ),
  operation text not null check (
    operation = 'issue_recurring_child_task'
  ),
  schedule_definition_id uuid not null,
  parent_task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  assertion_hash text not null unique check (
    assertion_hash ~ '^[a-f0-9]{64}$'
  ),
  maximum_executions integer not null check (
    maximum_executions between 1 and 10000
  ),
  registered_by uuid not null,
  issued_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  unique (
    id, schedule_definition_id, parent_task_id, project_id,
    platform, environment
  ),
  foreign key (
    schedule_definition_id, parent_task_id, project_id,
    platform, environment
  )
    references public.cognitive_level01_schedule_definitions(
      id, task_id, project_id, platform, environment
    ),
  check (
    expires_at > issued_at
    and expires_at <= issued_at + interval '30 days'
  )
);

create table public.cognitive_level01_scheduler_capability_revocations (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null unique,
  schedule_definition_id uuid not null,
  parent_task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  revoked_by uuid not null,
  revocation_hash text not null unique check (
    revocation_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  foreign key (
    capability_id, schedule_definition_id, parent_task_id,
    project_id, platform, environment
  )
    references public.cognitive_level01_scheduler_capabilities(
      id, schedule_definition_id, parent_task_id,
      project_id, platform, environment
    )
);

create table public.cognitive_level01_scheduled_task_issuances (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null,
  schedule_definition_id uuid not null,
  parent_task_id uuid not null,
  child_task_id uuid,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  scheduled_for timestamptz not null,
  execution_idempotency_hash text not null check (
    execution_idempotency_hash ~ '^[a-f0-9]{64}$'
  ),
  objective_hash text not null check (
    objective_hash ~ '^[a-f0-9]{64}$'
  ),
  work_state text not null check (
    work_state in ('work_available', 'no_work')
  ),
  result_status text not null check (
    result_status in ('task_created', 'no_work')
  ),
  no_work_reason_hash text check (
    no_work_reason_hash is null
    or no_work_reason_hash ~ '^[a-f0-9]{64}$'
  ),
  maximum_tasks_snapshot integer not null check (
    maximum_tasks_snapshot between 1 and 10
  ),
  maximum_cost_snapshot numeric(10,4) not null check (
    maximum_cost_snapshot between 0 and 25
  ),
  timeout_seconds_snapshot integer not null check (
    timeout_seconds_snapshot between 30 and 900
  ),
  schedule_policy_version text not null check (
    length(schedule_policy_version) between 1 and 64
    and not public.cognitive_text_has_secret(schedule_policy_version)
  ),
  child_deadman_at timestamptz,
  service_identity text not null check (
    service_identity = 'cognitive_level01_scheduler'
  ),
  owner_impersonation_allowed boolean not null default false check (
    owner_impersonation_allowed = false
  ),
  merge_allowed boolean not null default false check (merge_allowed = false),
  release_allowed boolean not null default false check (
    release_allowed = false
  ),
  level2_repair_allowed boolean not null default false check (
    level2_repair_allowed = false
  ),
  private_memory_allowed boolean not null default false check (
    private_memory_allowed = false
  ),
  audit_event_hash text not null unique check (
    audit_event_hash ~ '^[a-f0-9]{64}$'
  ),
  retention_until timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  unique (schedule_definition_id, scheduled_for),
  unique (schedule_definition_id, execution_idempotency_hash),
  unique (child_task_id),
  unique (id, parent_task_id, project_id, platform, environment),
  foreign key (
    capability_id, schedule_definition_id, parent_task_id,
    project_id, platform, environment
  )
    references public.cognitive_level01_scheduler_capabilities(
      id, schedule_definition_id, parent_task_id,
      project_id, platform, environment
    ),
  foreign key (
    schedule_definition_id, parent_task_id, project_id,
    platform, environment
  )
    references public.cognitive_level01_schedule_definitions(
      id, task_id, project_id, platform, environment
    ),
  foreign key (
    child_task_id, project_id, platform, environment
  )
    references public.intelligence_tasks(
      id, project_id, platform, environment
    ),
  check (
    (
      work_state = 'work_available'
      and result_status = 'task_created'
      and child_task_id is not null
      and child_deadman_at is not null
      and no_work_reason_hash is null
    )
    or (
      work_state = 'no_work'
      and result_status = 'no_work'
      and child_task_id is null
      and child_deadman_at is null
      and no_work_reason_hash is not null
    )
  ),
  check (
    retention_until > created_at
    and retention_until <= created_at + interval '90 days'
    and (
      child_deadman_at is null
      or (
        child_deadman_at > created_at
        and child_deadman_at <= created_at + make_interval(
          secs => timeout_seconds_snapshot
        )
        and retention_until > child_deadman_at
      )
    )
  )
);

create index cognitive_level01_scheduler_capability_expiry_idx
  on public.cognitive_level01_scheduler_capabilities(
    expires_at, schedule_definition_id
  );
create index cognitive_level01_scheduled_task_deadman_idx
  on public.cognitive_level01_scheduled_task_issuances(
    child_deadman_at
  )
  where child_task_id is not null;
create index cognitive_level01_scheduled_task_retention_idx
  on public.cognitive_level01_scheduled_task_issuances(
    retention_until
  );

do $$
declare
  table_name text;
  immutable_tables constant text[] := array[
    'cognitive_level01_scheduler_capabilities',
    'cognitive_level01_scheduler_capability_revocations',
    'cognitive_level01_scheduled_task_issuances'
  ];
begin
  foreach table_name in array immutable_tables loop
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );
    execute format(
      'alter table public.%I force row level security',
      table_name
    );
    execute format(
      'revoke all on table public.%I
       from public, anon, authenticated, service_role',
      table_name
    );
    execute format(
      'grant select on table public.%I to service_role',
      table_name
    );
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable',
      table_name
    );
  end loop;
end
$$;

grant select on table public.cognitive_level01_scheduled_task_issuances
  to authenticated;
create policy cognitive_level01_scheduled_task_issuances_exact_read
  on public.cognitive_level01_scheduled_task_issuances
  for select
  to authenticated
  using (
    (
      select public.cognitive_can_read_scope(
        project_id, parent_task_id, platform
      )
    )
  );

create function public.cognitive_level01_register_scheduler_capability(
  p_schedule_definition_id uuid,
  p_assertion_hash text,
  p_maximum_executions integer,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  schedule_value public.cognitive_level01_schedule_definitions%rowtype;
  capability_id uuid;
begin
  select * into schedule_value
  from public.cognitive_level01_schedule_definitions
  where id = p_schedule_definition_id
  for share;

  if schedule_value.id is null
     or p_assertion_hash !~ '^[a-f0-9]{64}$'
     or p_maximum_executions not between 1 and 10000
     or p_expires_at <= transaction_timestamp()
     or p_expires_at > transaction_timestamp() + interval '30 days' then
    raise exception 'cognitive_level01_scheduler_capability_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_level01_scheduler_capabilities(
    service_identity, operation, schedule_definition_id,
    parent_task_id, project_id, platform, environment,
    assertion_hash, maximum_executions, registered_by, expires_at
  ) values (
    'cognitive_level01_scheduler', 'issue_recurring_child_task',
    schedule_value.id, schedule_value.task_id, schedule_value.project_id,
    schedule_value.platform, schedule_value.environment,
    p_assertion_hash, p_maximum_executions, owner_id, p_expires_at
  )
  returning id into capability_id;

  return jsonb_build_object(
    'capabilityId', capability_id,
    'serviceIdentity', 'cognitive_level01_scheduler',
    'operation', 'issue_recurring_child_task',
    'scheduleDefinitionId', schedule_value.id,
    'parentTaskId', schedule_value.task_id,
    'projectId', schedule_value.project_id,
    'platform', schedule_value.platform,
    'environment', schedule_value.environment,
    'maximumExecutions', p_maximum_executions,
    'expiresAt', p_expires_at
  );
end;
$$;
revoke all on function public.cognitive_level01_register_scheduler_capability(
  uuid,text,integer,timestamptz
) from public, anon, service_role;
grant execute on function public.cognitive_level01_register_scheduler_capability(
  uuid,text,integer,timestamptz
) to authenticated;

create function public.cognitive_level01_revoke_scheduler_capability(
  p_capability_id uuid,
  p_revocation_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  capability_value public.cognitive_level01_scheduler_capabilities%rowtype;
  revocation_id uuid;
begin
  select * into capability_value
  from public.cognitive_level01_scheduler_capabilities
  where id = p_capability_id
  for share;

  if capability_value.id is null
     or p_revocation_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'cognitive_level01_scheduler_revocation_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_level01_scheduler_capability_revocations(
    capability_id, schedule_definition_id, parent_task_id,
    project_id, platform, environment, revoked_by, revocation_hash
  ) values (
    capability_value.id, capability_value.schedule_definition_id,
    capability_value.parent_task_id, capability_value.project_id,
    capability_value.platform, capability_value.environment,
    owner_id, p_revocation_hash
  )
  returning id into revocation_id;

  return jsonb_build_object(
    'revocationId', revocation_id,
    'capabilityId', capability_value.id,
    'serviceIdentity', capability_value.service_identity,
    'revokedAt', transaction_timestamp()
  );
end;
$$;
revoke all on function public.cognitive_level01_revoke_scheduler_capability(
  uuid,text
) from public, anon, service_role;
grant execute on function public.cognitive_level01_revoke_scheduler_capability(
  uuid,text
) to authenticated;

create function public.cognitive_level01_issue_recurring_child_task(
  p_capability_id uuid,
  p_schedule_definition_id uuid,
  p_parent_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_scheduled_for timestamptz,
  p_execution_idempotency_hash text,
  p_objective_hash text,
  p_work_state text,
  p_no_work_reason_hash text,
  p_service_identity text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    claims->>'role'
  );
  capability_value public.cognitive_level01_scheduler_capabilities%rowtype;
  schedule_value public.cognitive_level01_schedule_definitions%rowtype;
  parent_task_value public.intelligence_tasks%rowtype;
  project_value public.cognitive_projects%rowtype;
  existing_value public.cognitive_level01_scheduled_task_issuances%rowtype;
  child_task_id_value uuid;
  child_key_token text;
  issuance_id uuid;
  issued_count integer;
  child_deadman_value timestamptz;
  retention_value timestamptz;
  result_status_value text;
  audit_event_hash_value text;
  now_at timestamptz := transaction_timestamp();
  scheduled_hour integer;
  scheduled_minute integer;
  scheduled_isodow integer;
begin
  select * into capability_value
  from public.cognitive_level01_scheduler_capabilities
  where id = p_capability_id
  for update;

  if request_role <> 'service_role'
     or capability_value.id is null
     or capability_value.service_identity <> 'cognitive_level01_scheduler'
     or capability_value.operation <> 'issue_recurring_child_task'
     or p_service_identity <> capability_value.service_identity
     or p_schedule_definition_id <> capability_value.schedule_definition_id
     or p_parent_task_id <> capability_value.parent_task_id
     or p_project_id <> capability_value.project_id
     or p_platform <> capability_value.platform
     or p_environment <> capability_value.environment
     or p_service_assertion is null
     or capability_value.assertion_hash <> encode(
       extensions.digest(
         convert_to(p_service_assertion, 'UTF8'),
         'sha256'
       ),
       'hex'
     )
     or capability_value.expires_at <= now_at
     or exists (
       select 1
       from public.cognitive_level01_scheduler_capability_revocations revocation
       where revocation.capability_id = capability_value.id
     ) then
    raise exception 'cognitive_level01_scheduler_capability_required'
      using errcode = '42501';
  end if;

  select * into schedule_value
  from public.cognitive_level01_schedule_definitions
  where id = p_schedule_definition_id
    and task_id = p_parent_task_id
    and project_id = p_project_id
    and platform = p_platform
    and environment = p_environment
  for share;

  select * into parent_task_value
  from public.intelligence_tasks
  where id = p_parent_task_id
    and project_id = p_project_id
    and platform = p_platform
    and environment = p_environment
  for share;

  select * into project_value
  from public.cognitive_projects
  where id = p_project_id
  for share;

  if schedule_value.id is null
     or not schedule_value.enabled
     or schedule_value.maximum_tasks not between 1 and 10
     or schedule_value.maximum_cost not between 0 and 25
     or schedule_value.timeout_seconds not between 30 and 900
     or parent_task_value.id is null
     or parent_task_value.cancelled_at is not null
     or parent_task_value.quarantined_at is not null
     or parent_task_value.status in (
       'completed', 'failed', 'cancelled', 'budget_exhausted',
       'rollback_succeeded', 'rollback_failed', 'quarantined'
     )
     or not public.governance_task_writes_allowed(
       p_parent_task_id, p_project_id, p_platform, p_environment
     )
     or project_value.id is null
     or project_value.production_authority
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_parent_task_id
         and switch.project_id = p_project_id
         and switch.platform = p_platform
         and switch.environment = p_environment
         and switch.switch_key = 'cognitive_scheduled_level01_enabled'
         and switch.enabled
     )
     or (
       select count(*)
       from public.cognitive_governance_switches switch
       where switch.task_id = p_parent_task_id
         and switch.project_id = p_project_id
         and switch.platform = p_platform
         and switch.environment = p_environment
         and switch.switch_key in (
           'cognitive_user_derived_memory_enabled',
           'cognitive_level2_production_repairs_enabled'
         )
         and not switch.enabled
     ) <> 2 then
    raise exception 'cognitive_level01_schedule_gate_rejected'
      using errcode = 'P0001';
  end if;

  scheduled_hour := extract(
    hour from p_scheduled_for at time zone 'UTC'
  )::integer;
  scheduled_minute := extract(
    minute from p_scheduled_for at time zone 'UTC'
  )::integer;
  scheduled_isodow := extract(
    isodow from p_scheduled_for at time zone 'UTC'
  )::integer;

  if p_execution_idempotency_hash !~ '^[a-f0-9]{64}$'
     or p_objective_hash !~ '^[a-f0-9]{64}$'
     or p_work_state not in ('work_available', 'no_work')
     or (
       p_work_state = 'work_available'
       and p_no_work_reason_hash is not null
     )
     or (
       p_work_state = 'no_work'
       and (
         p_no_work_reason_hash is null
         or p_no_work_reason_hash !~ '^[a-f0-9]{64}$'
       )
     )
     or p_scheduled_for is null
     or date_trunc('minute', p_scheduled_for) <> p_scheduled_for
     or p_scheduled_for > now_at + interval '5 minutes'
     or (
       schedule_value.cadence in ('0 14 * * *', '30 14 * * *')
       and p_scheduled_for < now_at - interval '26 hours'
     )
     or (
       schedule_value.cadence in (
         '0 15 * * 1', '30 15 * * 1', '0 16 * * 1'
       )
       and p_scheduled_for < now_at - interval '8 days'
     )
     or not (
       case schedule_value.cadence
       when '0 14 * * *'
         then scheduled_minute = 0 and scheduled_hour = 14
       when '30 14 * * *'
         then scheduled_minute = 30 and scheduled_hour = 14
       when '0 15 * * 1'
         then scheduled_minute = 0
           and scheduled_hour = 15
           and scheduled_isodow = 1
       when '30 15 * * 1'
         then scheduled_minute = 30
           and scheduled_hour = 15
           and scheduled_isodow = 1
       when '0 16 * * 1'
         then scheduled_minute = 0
           and scheduled_hour = 16
           and scheduled_isodow = 1
       else false
       end
     ) then
    raise exception 'cognitive_level01_schedule_occurrence_rejected'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      schedule_value.id::text || ':' || p_execution_idempotency_hash,
      0
    )
  );

  select * into existing_value
  from public.cognitive_level01_scheduled_task_issuances issuance
  where issuance.schedule_definition_id = schedule_value.id
    and (
      issuance.execution_idempotency_hash = p_execution_idempotency_hash
      or issuance.scheduled_for = p_scheduled_for
    )
  for share;

  if existing_value.id is not null then
    if existing_value.execution_idempotency_hash
         <> p_execution_idempotency_hash
       or existing_value.scheduled_for <> p_scheduled_for
       or existing_value.objective_hash <> p_objective_hash
       or existing_value.work_state <> p_work_state
       or existing_value.no_work_reason_hash
         is distinct from p_no_work_reason_hash then
      raise exception 'cognitive_level01_schedule_idempotency_conflict'
        using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'schedulerIssuanceId', existing_value.id,
      'scheduleDefinitionId', existing_value.schedule_definition_id,
      'parentTaskId', existing_value.parent_task_id,
      'childTaskId', existing_value.child_task_id,
      'resultStatus', existing_value.result_status,
      'deduplicated', true,
      'maximumTasks', existing_value.maximum_tasks_snapshot,
      'maximumCost', existing_value.maximum_cost_snapshot,
      'timeoutSeconds', existing_value.timeout_seconds_snapshot,
      'deadmanAt', existing_value.child_deadman_at,
      'retentionUntil', existing_value.retention_until
    );
  end if;

  select count(*) into issued_count
  from public.cognitive_level01_scheduled_task_issuances issuance
  where issuance.capability_id = capability_value.id;

  if issued_count >= capability_value.maximum_executions then
    raise exception 'cognitive_level01_scheduler_capability_exhausted'
      using errcode = 'P0001';
  end if;

  retention_value := least(
    now_at + interval '90 days',
    coalesce(parent_task_value.retention_until, now_at + interval '90 days')
  );
  if retention_value <= now_at then
    raise exception 'cognitive_level01_scheduler_retention_rejected'
      using errcode = 'P0001';
  end if;

  if p_work_state = 'work_available' then
    child_deadman_value := least(
      now_at + make_interval(secs => schedule_value.timeout_seconds),
      parent_task_value.deadman_at
    );
    if child_deadman_value <= now_at
       or retention_value <= child_deadman_value then
      raise exception 'cognitive_level01_scheduler_deadman_rejected'
        using errcode = 'P0001';
    end if;

    child_task_id_value := gen_random_uuid();
    child_key_token := 'h' || left(
      encode(
        extensions.digest(
          convert_to(child_task_id_value::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      ),
      12
    );

    insert into public.intelligence_tasks(
      id, project_id, platform, environment, repository_full_name,
      branch_name, task_key, objective_hash, status, actor_identity,
      deadman_at, retention_until, data_class, parent_task_id
    ) values (
      child_task_id_value, p_project_id, p_platform, p_environment,
      'Chillywood2025/chillywood-mobile',
      'codex/cognitive-level01-scheduled/'
        || replace(schedule_value.schedule_key, '_', '-')
        || '/' || child_key_token,
      'cognitive-level01-scheduled-'
        || schedule_value.schedule_key
        || '-' || child_key_token,
      p_objective_hash, 'received', 'cognitive_level01_scheduler',
      child_deadman_value, retention_value, 'operational_metadata',
      p_parent_task_id
    )
    returning id into child_task_id_value;
    result_status_value := 'task_created';
  else
    child_deadman_value := null;
    child_task_id_value := null;
    result_status_value := 'no_work';
  end if;

  audit_event_hash_value := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          capability_value.id::text,
          schedule_value.id::text,
          p_parent_task_id::text,
          coalesce(child_task_id_value::text, 'no-child'),
          p_scheduled_for::text,
          p_execution_idempotency_hash,
          p_objective_hash,
          p_work_state,
          result_status_value,
          schedule_value.maximum_tasks::text,
          schedule_value.maximum_cost::text,
          schedule_value.timeout_seconds::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.cognitive_level01_scheduled_task_issuances(
    capability_id, schedule_definition_id, parent_task_id,
    child_task_id, project_id, platform, environment, scheduled_for,
    execution_idempotency_hash, objective_hash, work_state,
    result_status, no_work_reason_hash, maximum_tasks_snapshot,
    maximum_cost_snapshot, timeout_seconds_snapshot,
    schedule_policy_version, child_deadman_at, service_identity,
    audit_event_hash, retention_until
  ) values (
    capability_value.id, schedule_value.id, p_parent_task_id,
    child_task_id_value, p_project_id, p_platform, p_environment,
    p_scheduled_for, p_execution_idempotency_hash, p_objective_hash,
    p_work_state, result_status_value, p_no_work_reason_hash,
    schedule_value.maximum_tasks, schedule_value.maximum_cost,
    schedule_value.timeout_seconds, schedule_value.policy_version,
    child_deadman_value, 'cognitive_level01_scheduler',
    audit_event_hash_value, retention_value
  )
  returning id into issuance_id;

  return jsonb_build_object(
    'schedulerIssuanceId', issuance_id,
    'scheduleDefinitionId', schedule_value.id,
    'parentTaskId', p_parent_task_id,
    'childTaskId', child_task_id_value,
    'resultStatus', result_status_value,
    'deduplicated', false,
    'maximumTasks', schedule_value.maximum_tasks,
    'maximumCost', schedule_value.maximum_cost,
    'timeoutSeconds', schedule_value.timeout_seconds,
    'deadmanAt', child_deadman_value,
    'retentionUntil', retention_value
  );
end;
$$;
revoke all on function public.cognitive_level01_issue_recurring_child_task(
  uuid,uuid,uuid,uuid,public.cognitive_platform,
  public.cognitive_environment,timestamptz,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.cognitive_level01_issue_recurring_child_task(
  uuid,uuid,uuid,uuid,public.cognitive_platform,
  public.cognitive_environment,timestamptz,text,text,text,text,text,text
) to service_role;

create function public.cognitive_level01_scheduler_task_factory_status(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    claims->>'role'
  );
  factory_ready boolean;
begin
  if request_role <> 'service_role' then
    raise exception 'cognitive_level01_scheduler_service_role_required'
      using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.intelligence_tasks task
    join public.cognitive_projects project
      on project.id = task.project_id
    where task.id = p_task_id
      and task.project_id = p_project_id
      and task.platform = p_platform
      and task.environment = p_environment
      and p_platform = 'shared'
      and p_environment = 'production'
      and task.task_key = 'cognitive-level01-canary-control'
      and task.repository_full_name = 'Chillywood2025/chillywood-mobile'
      and task.parent_task_id is null
      and task.cancelled_at is null
      and task.quarantined_at is null
      and task.deadman_at > transaction_timestamp()
      and task.data_class <> 'user_derived'
      and project.repository_full_name = task.repository_full_name
      and not project.production_authority
  ) into factory_ready;

  return jsonb_build_object(
    'ready', factory_ready,
    'factory_identity', case
      when factory_ready then 'cognitive_level01_scheduler'
      else 'unavailable'
    end,
    'fresh_task_per_execution', factory_ready,
    'control_task_reuse_allowed', false,
    'deadman_bounded', factory_ready,
    'retention_bounded', factory_ready,
    'version', case when factory_ready then 'v1' else 'unavailable' end
  );
end;
$$;
revoke all on function public.cognitive_level01_scheduler_task_factory_status(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public, anon, authenticated;
grant execute on function public.cognitive_level01_scheduler_task_factory_status(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) to service_role;

comment on table public.cognitive_level01_scheduler_capabilities is
  'Owner-issued, expiring, revocable capability for one exact recurring Level 0/1 schedule scope.';
comment on table public.cognitive_level01_scheduled_task_issuances is
  'Immutable recurring schedule audit: one fresh bounded child task or one no-work exit per exact schedule occurrence.';
comment on function public.cognitive_level01_issue_recurring_child_task(
  uuid,uuid,uuid,uuid,public.cognitive_platform,
  public.cognitive_environment,timestamptz,text,text,text,text,text,text
) is
  'Creates one scope-bound Level 0/1 child task per due occurrence; identical idempotency replays return the same immutable result.';
comment on function public.cognitive_level01_scheduler_task_factory_status(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) is
  'Service-role readback for the installed fresh-task factory contract in the exact shared production control-task scope.';
