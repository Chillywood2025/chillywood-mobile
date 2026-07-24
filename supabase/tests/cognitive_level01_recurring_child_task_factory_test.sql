begin;
select no_plan();

insert into public.platform_role_memberships(
  user_id, email, role, status
) values (
  'd0000000-0000-4000-8000-000000000001',
  null,
  'owner',
  'active'
);

insert into public.cognitive_projects(
  id, repository_full_name, source_state, activation_state,
  scheduler_state, production_authority
) values (
  'd1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off',
  'bounded_level01',
  false
);

insert into public.intelligence_tasks(
  id, project_id, platform, environment, repository_full_name,
  branch_name, task_key, objective_hash, status, actor_identity,
  deadman_at, retention_until, data_class
) values (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared',
  'production',
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-level01-scheduler-test',
  'cognitive-level01-canary-control',
  repeat('1', 64),
  'received',
  'scheduler-control-fixture',
  transaction_timestamp() + interval '30 days',
  transaction_timestamp() + interval '90 days',
  'operational_metadata'
);

insert into public.autonomous_system_emergency_states(
  system_id, status, reason, updated_at, metadata
) values (
  'product_intelligence_operator',
  'active',
  'scheduler child-task factory fixture',
  transaction_timestamp(),
  '{"fixture":"level01-child-task-factory"}'::jsonb
)
on conflict (system_id) do update
set
  status = excluded.status,
  reason = excluded.reason,
  updated_at = excluded.updated_at,
  metadata = excluded.metadata;

insert into public.cognitive_governance_switches(
  task_id, project_id, platform, environment, switch_key, enabled,
  policy_version, enabled_by, enabled_at, updated_at
) values
  (
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared', 'production',
    'cognitive_scheduled_level01_enabled',
    true, 'scheduler-factory-test',
    'd0000000-0000-4000-8000-000000000001',
    transaction_timestamp(), transaction_timestamp()
  ),
  (
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared', 'production',
    'cognitive_user_derived_memory_enabled',
    false, 'scheduler-factory-test',
    null, null, transaction_timestamp()
  ),
  (
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared', 'production',
    'cognitive_level2_production_repairs_enabled',
    false, 'scheduler-factory-test',
    null, null, transaction_timestamp()
  );

insert into public.cognitive_level01_schedule_definitions(
  id, task_id, project_id, platform, environment, schedule_key,
  cadence, enabled, maximum_tasks, maximum_cost, timeout_seconds,
  policy_version
) values
  (
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared', 'production',
    'daily_platform_policy_security',
    '0 14 * * *', true, 3, 5.0000, 300,
    'scheduler-factory-test'
  ),
  (
    'd3000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared', 'production',
    'daily_non_personal_support_observability',
    '30 14 * * *', true, 2, 3.0000, 300,
    'scheduler-factory-test'
  );

create temporary table scheduler_factory_fixture(
  fixture_key text primary key,
  capability_id uuid,
  scheduled_for timestamptz,
  result jsonb
);
grant select, insert, update on scheduler_factory_fixture
  to authenticated, service_role;

insert into scheduler_factory_fixture(fixture_key, scheduled_for)
values
  (
    'work',
    case
      when (
        date_trunc(
          'day',
          transaction_timestamp() at time zone 'UTC'
        ) + interval '14 hours'
      ) at time zone 'UTC' <= transaction_timestamp() + interval '5 minutes'
      then (
        date_trunc(
          'day',
          transaction_timestamp() at time zone 'UTC'
        ) + interval '14 hours'
      ) at time zone 'UTC'
      else (
        date_trunc(
          'day',
          transaction_timestamp() at time zone 'UTC'
        ) - interval '10 hours'
      ) at time zone 'UTC'
    end
  ),
  (
    'no-work',
    case
      when (
        date_trunc(
          'day',
          transaction_timestamp() at time zone 'UTC'
        ) + interval '14 hours 30 minutes'
      ) at time zone 'UTC' <= transaction_timestamp() + interval '5 minutes'
      then (
        date_trunc(
          'day',
          transaction_timestamp() at time zone 'UTC'
        ) + interval '14 hours 30 minutes'
      ) at time zone 'UTC'
      else (
        date_trunc(
          'day',
          transaction_timestamp() at time zone 'UTC'
        ) - interval '9 hours 30 minutes'
      ) at time zone 'UTC'
    end
  );

select ok(
  (
    select count(*) = 3
    from pg_class
    where oid in (
      'public.cognitive_level01_scheduler_capabilities'::regclass,
      'public.cognitive_level01_scheduler_capability_revocations'::regclass,
      'public.cognitive_level01_scheduled_task_issuances'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  'scheduler capability and immutable audit tables force RLS'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.cognitive_level01_issue_recurring_child_task(uuid,uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,timestamptz,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.cognitive_level01_scheduler_capabilities',
    'INSERT'
  )
  and not has_table_privilege(
    'service_role',
    'public.cognitive_level01_scheduled_task_issuances',
    'INSERT'
  ),
  'clients and service role have no direct scheduler mutation path'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  (
    select
      (status->>'ready')::boolean
      and status->>'factory_identity' = 'cognitive_level01_scheduler'
      and (status->>'fresh_task_per_execution')::boolean
      and not (status->>'control_task_reuse_allowed')::boolean
      and (status->>'deadman_bounded')::boolean
      and (status->>'retention_bounded')::boolean
      and status->>'version' = 'v1'
    from (
      select public.cognitive_level01_scheduler_task_factory_status(
        'd2000000-0000-4000-8000-000000000001',
        'd1000000-0000-4000-8000-000000000001',
        'shared',
        'production'
      ) status
    ) readback
  ),
  'factory status reports exact snake-case readiness contract'
);
select is(
  (
    public.cognitive_level01_scheduler_task_factory_status(
      'd2000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'android',
      'production'
    )->>'ready'
  )::boolean,
  false,
  'factory status is not ready outside exact shared production scope'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.role', 'authenticated', true
);
select set_config(
  'request.jwt.claim.sub',
  'd0000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d0000000-0000-4000-8000-000000000001"}',
  true
);

update scheduler_factory_fixture
set capability_id = (
  public.cognitive_level01_register_scheduler_capability(
    'd3000000-0000-4000-8000-000000000001',
    encode(
      extensions.digest(
        convert_to('scheduler-factory-assertion-one', 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    4,
    transaction_timestamp() + interval '1 day'
  )->>'capabilityId'
)::uuid
where fixture_key = 'work';

update scheduler_factory_fixture
set capability_id = (
  public.cognitive_level01_register_scheduler_capability(
    'd3000000-0000-4000-8000-000000000002',
    encode(
      extensions.digest(
        convert_to('scheduler-factory-assertion-two', 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    4,
    transaction_timestamp() + interval '1 day'
  )->>'capabilityId'
)::uuid
where fixture_key = 'no-work';

reset role;
select is(
  (
    select count(*)
    from public.cognitive_level01_scheduler_capabilities
    where service_identity = 'cognitive_level01_scheduler'
      and operation = 'issue_recurring_child_task'
  ),
  2::bigint,
  'exact Owner registers distinct exact-schedule scheduler capabilities'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$select public.cognitive_level01_issue_recurring_child_task(
    (select capability_id from scheduler_factory_fixture where fixture_key='work'),
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production',
    (select scheduled_for from scheduler_factory_fixture where fixture_key='work'),
    repeat('2',64),repeat('3',64),'work_available',null,
    'governance_canary_scheduler','scheduler-factory-assertion-one'
  )$$,
  '42501',
  'cognitive_level01_scheduler_capability_required',
  'another scheduler identity cannot impersonate the Level01 scheduler'
);

select throws_ok(
  $$select public.cognitive_level01_issue_recurring_child_task(
    (select capability_id from scheduler_factory_fixture where fixture_key='work'),
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'android','production',
    (select scheduled_for from scheduler_factory_fixture where fixture_key='work'),
    repeat('2',64),repeat('3',64),'work_available',null,
    'cognitive_level01_scheduler','scheduler-factory-assertion-one'
  )$$,
  '42501',
  'cognitive_level01_scheduler_capability_required',
  'scheduler capability rejects a different platform scope'
);
reset role;

update public.cognitive_level01_schedule_definitions
set enabled = false
where id = 'd3000000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.cognitive_level01_issue_recurring_child_task(
    (select capability_id from scheduler_factory_fixture where fixture_key='work'),
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production',
    (select scheduled_for from scheduler_factory_fixture where fixture_key='work'),
    repeat('2',64),repeat('3',64),'work_available',null,
    'cognitive_level01_scheduler','scheduler-factory-assertion-one'
  )$$,
  'P0001',
  'cognitive_level01_schedule_gate_rejected',
  'disabled schedule blocks child-task issuance'
);
reset role;
update public.cognitive_level01_schedule_definitions
set enabled = true
where id = 'd3000000-0000-4000-8000-000000000001';

update public.cognitive_governance_switches
set enabled = false, enabled_at = null, disabled_at = transaction_timestamp()
where task_id = 'd2000000-0000-4000-8000-000000000001'
  and switch_key = 'cognitive_scheduled_level01_enabled';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.cognitive_level01_issue_recurring_child_task(
    (select capability_id from scheduler_factory_fixture where fixture_key='work'),
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production',
    (select scheduled_for from scheduler_factory_fixture where fixture_key='work'),
    repeat('2',64),repeat('3',64),'work_available',null,
    'cognitive_level01_scheduler','scheduler-factory-assertion-one'
  )$$,
  'P0001',
  'cognitive_level01_schedule_gate_rejected',
  'disabled global scheduling switch blocks child-task issuance'
);
reset role;
update public.cognitive_governance_switches
set
  enabled = true,
  enabled_by = 'd0000000-0000-4000-8000-000000000001',
  enabled_at = transaction_timestamp(),
  disabled_at = null
where task_id = 'd2000000-0000-4000-8000-000000000001'
  and switch_key = 'cognitive_scheduled_level01_enabled';

update public.autonomous_system_emergency_states
set status = 'emergency_stop', updated_at = transaction_timestamp()
where system_id = 'product_intelligence_operator';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.cognitive_level01_issue_recurring_child_task(
    (select capability_id from scheduler_factory_fixture where fixture_key='work'),
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production',
    (select scheduled_for from scheduler_factory_fixture where fixture_key='work'),
    repeat('2',64),repeat('3',64),'work_available',null,
    'cognitive_level01_scheduler','scheduler-factory-assertion-one'
  )$$,
  'P0001',
  'cognitive_level01_schedule_gate_rejected',
  'emergency stop blocks child-task issuance'
);
reset role;
update public.autonomous_system_emergency_states
set status = 'active', updated_at = transaction_timestamp()
where system_id = 'product_intelligence_operator';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
update scheduler_factory_fixture
set result = public.cognitive_level01_issue_recurring_child_task(
  capability_id,
  'd3000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',scheduled_for,
  repeat('2',64),repeat('3',64),'work_available',null,
  'cognitive_level01_scheduler','scheduler-factory-assertion-one'
)
where fixture_key = 'work';
reset role;

select is(
  (
    select result->>'resultStatus'
    from scheduler_factory_fixture
    where fixture_key = 'work'
  ),
  'task_created',
  'enabled due schedule creates one fresh child intelligence task'
);

select ok(
  (
    select
      task.parent_task_id = 'd2000000-0000-4000-8000-000000000001'
      and task.actor_identity = 'cognitive_level01_scheduler'
      and task.data_class = 'operational_metadata'
      and task.status = 'received'
      and task.deadman_at <= task.created_at + interval '300 seconds'
      and task.retention_until <= task.created_at + interval '90 days'
    from public.intelligence_tasks task
    where task.id = (
      select (result->>'childTaskId')::uuid
      from scheduler_factory_fixture
      where fixture_key = 'work'
    )
  ),
  'child task is parent-linked, non-personal, fresh, and time bounded'
);

select ok(
  (
    select
      issuance.maximum_tasks_snapshot = 3
      and issuance.maximum_cost_snapshot = 5.0000
      and issuance.timeout_seconds_snapshot = 300
      and not issuance.owner_impersonation_allowed
      and not issuance.merge_allowed
      and not issuance.release_allowed
      and not issuance.level2_repair_allowed
      and not issuance.private_memory_allowed
    from public.cognitive_level01_scheduled_task_issuances issuance
    where issuance.id = (
      select (result->>'schedulerIssuanceId')::uuid
      from scheduler_factory_fixture
      where fixture_key = 'work'
    )
  ),
  'issuance snapshots exact schedule limits and grants no elevated authority'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (
    public.cognitive_level01_issue_recurring_child_task(
      (select capability_id from scheduler_factory_fixture where fixture_key='work'),
      'd3000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'shared','production',
      (select scheduled_for from scheduler_factory_fixture where fixture_key='work'),
      repeat('2',64),repeat('3',64),'work_available',null,
      'cognitive_level01_scheduler','scheduler-factory-assertion-one'
    )->>'childTaskId'
  ),
  (
    select result->>'childTaskId'
    from scheduler_factory_fixture
    where fixture_key = 'work'
  ),
  'same execution idempotency returns the same child task'
);
reset role;

select is(
  (
    select count(*)
    from public.intelligence_tasks
    where parent_task_id = 'd2000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'idempotent replay never duplicates the child task'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.cognitive_level01_issue_recurring_child_task(
    (select capability_id from scheduler_factory_fixture where fixture_key='work'),
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production',
    (select scheduled_for from scheduler_factory_fixture where fixture_key='work'),
    repeat('4',64),repeat('3',64),'work_available',null,
    'cognitive_level01_scheduler','scheduler-factory-assertion-one'
  )$$,
  'P0001',
  'cognitive_level01_schedule_idempotency_conflict',
  'same occurrence cannot create a second child under another idempotency hash'
);
select throws_ok(
  $$select public.cognitive_level01_issue_recurring_child_task(
    (select capability_id from scheduler_factory_fixture where fixture_key='work'),
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production',
    (select scheduled_for from scheduler_factory_fixture where fixture_key='work'),
    repeat('2',64),repeat('5',64),'work_available',null,
    'cognitive_level01_scheduler','scheduler-factory-assertion-one'
  )$$,
  'P0001',
  'cognitive_level01_schedule_idempotency_conflict',
  'same idempotency rejects changed objective semantics'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
update scheduler_factory_fixture
set result = public.cognitive_level01_issue_recurring_child_task(
  capability_id,
  'd3000000-0000-4000-8000-000000000002',
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',scheduled_for,
  repeat('6',64),repeat('7',64),'no_work',repeat('8',64),
  'cognitive_level01_scheduler','scheduler-factory-assertion-two'
)
where fixture_key = 'no-work';
reset role;

select ok(
  (
    select
      result->>'resultStatus' = 'no_work'
      and result->>'childTaskId' is null
    from scheduler_factory_fixture
    where fixture_key = 'no-work'
  )
  and (
    select count(*) = 1
    from public.cognitive_level01_scheduled_task_issuances
    where work_state = 'no_work'
      and child_task_id is null
  ),
  'no-work occurrence exits without a child and preserves immutable audit'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'd0000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d0000000-0000-4000-8000-000000000001"}',
  true
);
select public.cognitive_level01_revoke_scheduler_capability(
  (select capability_id from scheduler_factory_fixture where fixture_key='no-work'),
  repeat('9',64)
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.cognitive_level01_issue_recurring_child_task(
    (select capability_id from scheduler_factory_fixture where fixture_key='no-work'),
    'd3000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production',
    (select scheduled_for from scheduler_factory_fixture where fixture_key='no-work'),
    repeat('6',64),repeat('7',64),'no_work',repeat('8',64),
    'cognitive_level01_scheduler','scheduler-factory-assertion-two'
  )$$,
  '42501',
  'cognitive_level01_scheduler_capability_required',
  'revoked scheduler capability cannot execute or replay'
);
reset role;

select throws_ok(
  $$update public.cognitive_level01_scheduled_task_issuances
    set objective_hash = repeat('a',64)$$,
  '42501',
  'immutable_cognitive_evidence',
  'scheduler issuance audit cannot be rewritten'
);

select is(
  (
    select count(*)
    from public.cognitive_level01_scheduled_task_issuances
  ),
  2::bigint,
  'one task issuance and one no-work exit preserve complete audit history'
);

select * from finish();
rollback;
