begin;
select no_plan();

create function pg_temp.set_service_role_test_context()
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  if auth.uid() is not null or auth.jwt() ? 'session_id' then
    raise exception 'service_role_fixture_retained_user_session';
  end if;
  return current_setting('request.jwt.claims',true);
end;
$$;

insert into public.cognitive_projects(
  id,
  repository_full_name,
  source_state,
  activation_state,
  scheduler_state,
  production_authority
) values (
  'f0000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off',
  'none',
  false
);

insert into public.intelligence_tasks(
  id,
  project_id,
  platform,
  environment,
  repository_full_name,
  branch_name,
  task_key,
  objective_hash,
  status,
  actor_identity,
  deadman_at,
  retention_until,
  data_class
) values (
  'f1000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  'shared',
  'production',
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-platform-scope-fixture',
  'cognitive-level01-canary-control',
  repeat('1', 64),
  'received',
  'cognitive-approved-action-worker',
  transaction_timestamp() + interval '30 days',
  transaction_timestamp() + interval '90 days',
  'operational_metadata'
);

insert into public.cognitive_retention_policy_states(
  task_id,
  project_id,
  platform,
  environment,
  policy_hash,
  policy_state,
  user_derived_memory_allowed,
  raw_user_reports_allowed,
  raw_private_messages_allowed,
  raw_private_media_allowed,
  raw_user_analytics_allowed,
  private_model_input_allowed
) values (
  'f1000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  'shared',
  'production',
  repeat('2', 64),
  'owner_counsel_decision_required',
  false,
  false,
  false,
  false,
  false,
  false
);

insert into public.cognitive_governance_switches(
  task_id,
  project_id,
  platform,
  environment,
  switch_key,
  enabled,
  policy_version
)
select
  'f1000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  'shared',
  'production',
  switch_key,
  false,
  'collective-governance-v1'
from unnest(array[
  'cognitive_installed_journey_sentinel_enabled',
  'cognitive_livekit_experience_sentinel_enabled',
  'cognitive_visual_experience_sentinel_enabled'
]) switch_key;

insert into public.autonomous_system_emergency_states(
  system_id,
  status,
  reason,
  updated_at,
  metadata
) values (
  'product_intelligence_operator',
  'active',
  'platform scope fixture active state',
  transaction_timestamp(),
  '{"fixture":true}'::jsonb
)
on conflict (system_id) do update
set
  status = excluded.status,
  reason = excluded.reason,
  updated_at = excluded.updated_at,
  metadata = excluded.metadata;

insert into auth.users(id, is_sso_user, is_anonymous, email_confirmed_at)
values
  ('f2000000-0000-4000-8000-000000000001', false, false, now()),
  ('f2000000-0000-4000-8000-000000000002', false, false, now());

insert into auth.sessions(id, user_id)
values
  ('f2100000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001'),
  ('f2100000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002');

insert into public.platform_role_memberships(user_id, email, role, status)
values
  ('f2000000-0000-4000-8000-000000000001', null, 'owner', 'active'),
  (
    'f2000000-0000-4000-8000-000000000002',
    null,
    'super_admin',
    'active'
  );

create temporary table platform_scope_fixture(
  fixture_key text primary key,
  scope_hash text not null,
  android_task_id uuid,
  result jsonb
);
grant select, insert, update on platform_scope_fixture
  to authenticated, service_role;

insert into platform_scope_fixture(fixture_key, scope_hash)
select
  'exact',
  public.governance_product_sentinel_platform_scope_hash(
    'f1000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    repeat('3', 40),
    'collective-governance-v1',
    repeat('2', 64)
  );

select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_catalog.pg_class relation
    where relation.oid =
      'public.cognitive_product_sentinel_platform_scopes'::regclass
  ),
  'platform-scope provenance forces RLS'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.cognitive_product_sentinel_platform_scopes',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'public.cognitive_product_sentinel_platform_scopes',
    'SELECT'
  )
  and has_table_privilege(
    'authenticated',
    'public.cognitive_product_sentinel_platform_scopes',
    'SELECT'
  ),
  'only authenticated callers receive table-level read eligibility'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_materialize_product_sentinel_platform_scopes(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.governance_materialize_product_sentinel_platform_scopes(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_materialize_product_sentinel_platform_scopes(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  ),
  'materialization is callable only from an authenticated Owner session'
);

select ok(
  (
    select pg_catalog.pg_get_constraintdef(constraint_value.oid)
      like '%FOREIGN KEY (parent_task_id, project_id, platform, environment)%'
    from pg_catalog.pg_constraint constraint_value
    where constraint_value.conrelid = 'public.intelligence_tasks'::regclass
      and constraint_value.contype = 'f'
      and pg_catalog.pg_get_constraintdef(constraint_value.oid)
        like '%parent_task_id%'
  ),
  'existing same-platform intelligence-task parent FK remains intact'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'f2000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f2000000-0000-4000-8000-000000000002","session_id":"f2100000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  format(
    $sql$
      select public.governance_materialize_product_sentinel_platform_scopes(
        'f1000000-0000-4000-8000-000000000001',
        'f0000000-0000-4000-8000-000000000001',
        %L,
        'collective-governance-v1',
        %L,
        %L
      )
    $sql$,
    repeat('3', 40),
    repeat('2', 64),
    (select scope_hash from platform_scope_fixture where fixture_key = 'exact')
  ),
  '42501',
  'governance_owner_identity_required',
  'a non-Owner cannot materialize installed-platform scopes'
);
reset role;

update platform_scope_fixture
set android_task_id = (
  select platform_task_id
  from public.cognitive_product_sentinel_platform_scopes
  where shared_task_id =
    'f1000000-0000-4000-8000-000000000001'
    and platform = 'android'
)
where fixture_key = 'exact';

select is(
  (
    select count(*)::integer
    from public.intelligence_tasks
    where project_id = 'f0000000-0000-4000-8000-000000000001'
      and platform in ('android', 'ios')
  ),
  0,
  'denied materialization creates no platform tasks'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'f2000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f2000000-0000-4000-8000-000000000001","session_id":"f2100000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select public.governance_materialize_product_sentinel_platform_scopes(
    'f1000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    repeat('3',40),
    'collective-governance-v1',
    repeat('2',64),
    repeat('9',64)
  )$$,
  'P0001',
  'product_sentinel_platform_scope_rejected',
  'Owner materialization rejects a non-canonical target hash'
);

update platform_scope_fixture
set result = public.governance_materialize_product_sentinel_platform_scopes(
  'f1000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  repeat('3', 40),
  'collective-governance-v1',
  repeat('2', 64),
  scope_hash
)
where fixture_key = 'exact';
reset role;

select is(
  (
    select result->>'status'
    from platform_scope_fixture
    where fixture_key = 'exact'
  ),
  'materialized_disabled',
  'exact Owner materializes the two disabled installed-platform scopes'
);

update platform_scope_fixture
set android_task_id = (
  select platform_task_id
  from public.cognitive_product_sentinel_platform_scopes
  where shared_task_id =
    'f1000000-0000-4000-8000-000000000001'
    and platform = 'android'
)
where fixture_key = 'exact';

select is(
  (
    select count(*)::integer
    from public.cognitive_product_sentinel_platform_scopes scope
    where scope.shared_task_id =
      'f1000000-0000-4000-8000-000000000001'
      and scope.project_id =
        'f0000000-0000-4000-8000-000000000001'
      and scope.shared_platform = 'shared'
      and scope.platform in ('android', 'ios')
      and scope.environment = 'production'
      and scope.materialized_by =
        'f2000000-0000-4000-8000-000000000001'
      and scope.scope_hash = (
        select scope_hash
        from platform_scope_fixture
        where fixture_key = 'exact'
      )
  ),
  2,
  'immutable provenance binds Android and iOS to the exact shared task and Owner'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_product_sentinel_platform_scopes scope
    join public.intelligence_tasks task
      on task.id = scope.platform_task_id
     and task.project_id = scope.project_id
     and task.platform = scope.platform
     and task.environment = scope.environment
    where scope.shared_task_id =
      'f1000000-0000-4000-8000-000000000001'
      and task.repository_full_name =
        'Chillywood2025/chillywood-mobile'
      and task.task_key = 'cognitive-level01-canary-control'
      and task.parent_task_id is null
      and task.status = 'received'
      and task.data_class = 'operational_metadata'
      and task.cancelled_at is null
      and task.quarantined_at is null
      and task.deadman_at = (
        select deadman_at
        from public.intelligence_tasks
        where id = 'f1000000-0000-4000-8000-000000000001'
      )
      and task.retention_until = (
        select retention_until
        from public.intelligence_tasks
        where id = 'f1000000-0000-4000-8000-000000000001'
      )
  ),
  2,
  'platform tasks preserve exact project, repository, lifetime, and non-personal scope'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_product_sentinel_platform_scopes scope
    join public.cognitive_retention_policy_states policy
      on policy.task_id = scope.platform_task_id
     and policy.project_id = scope.project_id
     and policy.platform = scope.platform
     and policy.environment = scope.environment
    where scope.shared_task_id =
      'f1000000-0000-4000-8000-000000000001'
      and policy.policy_hash = repeat('2', 64)
      and policy.policy_state = 'owner_counsel_decision_required'
      and not policy.user_derived_memory_allowed
      and not policy.raw_user_reports_allowed
      and not policy.raw_private_messages_allowed
      and not policy.raw_private_media_allowed
      and not policy.raw_user_analytics_allowed
      and not policy.private_model_input_allowed
  ),
  2,
  'each platform task receives one bounded non-personal retention state'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_product_sentinel_platform_scopes scope
    join public.cognitive_governance_switches switch
      on switch.task_id = scope.platform_task_id
     and switch.project_id = scope.project_id
     and switch.platform = scope.platform
     and switch.environment = scope.environment
    where scope.shared_task_id =
      'f1000000-0000-4000-8000-000000000001'
      and switch.switch_key in (
        'cognitive_installed_journey_sentinel_enabled',
        'cognitive_livekit_experience_sentinel_enabled',
        'cognitive_visual_experience_sentinel_enabled'
      )
      and not switch.enabled
      and switch.enabled_by is null
      and switch.enabled_at is null
  ),
  6,
  'each platform task receives exactly three disabled sentinel switches'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_product_sentinel_platform_scopes scope
    join public.cognitive_governance_switches switch
      on switch.task_id = scope.platform_task_id
    where scope.shared_task_id =
      'f1000000-0000-4000-8000-000000000001'
      and switch.switch_key in (
        'cognitive_level2_production_repairs_enabled',
        'cognitive_user_derived_memory_enabled'
      )
  ),
  0,
  'platform scopes create no Level 2 or user-derived-memory switch'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_product_sentinel_platform_scopes scope
    join public.cognitive_level01_schedule_definitions schedule
      on schedule.task_id = scope.platform_task_id
    where scope.shared_task_id =
      'f1000000-0000-4000-8000-000000000001'
  ),
  0,
  'platform scopes create no schedule definitions'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_product_sentinel_platform_scopes scope
    join public.cognitive_product_quality_service_capabilities capability
      on capability.task_id = scope.platform_task_id
    where scope.shared_task_id =
      'f1000000-0000-4000-8000-000000000001'
  ),
  0,
  'materialization does not auto-issue a live service capability'
);

select ok(
  lower(pg_catalog.pg_get_functiondef(
    'public.cognitive_level01_schedule_prerequisites_base(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment)'::regprocedure
  )) like
    '%join public.cognitive_product_sentinel_platform_scopes sentinel_scope%'
  and lower(pg_catalog.pg_get_functiondef(
    'public.cognitive_level01_schedule_prerequisites_base(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment)'::regprocedure
  )) like
    '%join public.cognitive_governance_switches sentinel_switch%'
  and lower(pg_catalog.pg_get_functiondef(
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure
  )) like
    '%join public.cognitive_product_sentinel_platform_scopes sentinel_scope%'
  and lower(pg_catalog.pg_get_functiondef(
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure
  )) like
    '%join public.cognitive_governance_switches sentinel_switch%'
  and lower(pg_catalog.pg_get_functiondef(
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure
  )) like '%and sentinel_switch.enabled%'
  and lower(pg_catalog.pg_get_functiondef(
    'public.cognitive_level01_schedule_prerequisites_base(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment)'::regprocedure
  )) not like '%sentinel_task.parent_task_id = p_parent_task_id%'
  and lower(pg_catalog.pg_get_functiondef(
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure
  )) not like '%sentinel_task.parent_task_id = p_task_id%',
  'scheduler paths require immutable mapping and the current platform switch'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'f2000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f2000000-0000-4000-8000-000000000001","session_id":"f2100000-0000-4000-8000-000000000001"}',
  true
);
select is(
  (
    public.governance_materialize_product_sentinel_platform_scopes(
      'f1000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001',
      repeat('3', 40),
      'collective-governance-v1',
      repeat('2', 64),
      (
        select scope_hash
        from platform_scope_fixture
        where fixture_key = 'exact'
      )
    )
  )->>'status',
  'already_materialized',
  'exact replay is idempotent and does not duplicate platform scopes'
);

select is(
  (
    public.cognitive_product_quality_register_service_capability(
      'cognitive_sentinel_collector',
      (
        select platform_task_id
        from public.cognitive_product_sentinel_platform_scopes
        where shared_task_id =
          'f1000000-0000-4000-8000-000000000001'
          and platform = 'android'
      ),
      'f0000000-0000-4000-8000-000000000001',
      'android',
      'production',
      encode(
        extensions.digest(
          convert_to(
            'platform-scope-collector-assertion-0001',
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ),
      array[
        'installed_journey_sentinel',
        'visual_product_experience_sentinel'
      ],
      transaction_timestamp() + interval '1 day'
    )
  )->>'platform',
  'android',
  'existing Owner RPC can issue a separate expiring Android collector capability'
);
reset role;

set local role service_role;
select pg_temp.set_service_role_test_context();
select lives_ok(
  $$select public.cognitive_product_quality_assert_service_capability(
      'cognitive_sentinel_collector',
      'collect_sentinel_run',
      (
      select android_task_id
      from platform_scope_fixture
      where fixture_key = 'exact'
    ),
    'f0000000-0000-4000-8000-000000000001',
    'android',
    'production',
    'installed_journey_sentinel',
    'platform-scope-collector-assertion-0001'
  )$$,
  'exact Android collector capability resolves for its allowed sentinel'
);
select throws_ok(
  $$select public.cognitive_product_quality_assert_service_capability(
      'cognitive_sentinel_collector',
      'collect_sentinel_run',
      (
      select android_task_id
      from platform_scope_fixture
      where fixture_key = 'exact'
    ),
    'f0000000-0000-4000-8000-000000000001',
    'ios',
    'production',
    'installed_journey_sentinel',
    'platform-scope-collector-assertion-0001'
  )$$,
  '42501',
  'product_quality_service_capability_required',
  'Android capability cannot cross into the iOS platform'
);
reset role;

select throws_ok(
  $$update public.cognitive_product_sentinel_platform_scopes
    set source_commit = repeat('4',40)
    where shared_task_id =
      'f1000000-0000-4000-8000-000000000001'$$,
  '42501',
  'immutable_cognitive_evidence',
  'platform-scope provenance is immutable'
);

select * from finish();
rollback;
