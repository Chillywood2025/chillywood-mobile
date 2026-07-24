-- Exact installed-platform scopes for the already-bootstrapped shared
-- Cognitive Level 0/1 control task.
--
-- The existing intelligence_tasks parent FK intentionally requires parent and
-- child to have the same platform. Android/iOS sentinel tasks therefore keep
-- parent_task_id NULL and bind to the shared control task through this
-- immutable, platform-exact provenance relation. Nothing in this migration
-- enables a switch, creates a schedule, issues a provider credential, or
-- authorizes production mutation.

create table public.cognitive_product_sentinel_platform_scopes (
  id uuid primary key default gen_random_uuid(),
  shared_task_id uuid not null,
  platform_task_id uuid not null,
  project_id uuid not null,
  shared_platform public.cognitive_platform not null default 'shared'
    check (shared_platform = 'shared'),
  platform public.cognitive_platform not null
    check (platform in ('android', 'ios')),
  environment public.cognitive_environment not null
    check (environment = 'production'),
  scope_hash text not null check (scope_hash ~ '^[a-f0-9]{64}$'),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  policy_version text not null check (
    length(policy_version) between 1 and 64
    and not public.cognitive_text_has_secret(policy_version)
  ),
  retention_policy_hash text not null
    check (retention_policy_hash ~ '^[a-f0-9]{64}$'),
  materialized_by uuid not null,
  created_at timestamptz not null default transaction_timestamp(),
  unique (shared_task_id, platform),
  unique (platform_task_id),
  unique (platform_task_id, project_id, platform, environment),
  foreign key (
    shared_task_id, project_id, shared_platform, environment
  ) references public.intelligence_tasks(
    id, project_id, platform, environment
  ),
  foreign key (
    platform_task_id, project_id, platform, environment
  ) references public.intelligence_tasks(
    id, project_id, platform, environment
  )
);

alter table public.cognitive_product_sentinel_platform_scopes
  enable row level security;
alter table public.cognitive_product_sentinel_platform_scopes
  force row level security;

revoke all on table
  public.cognitive_product_sentinel_platform_scopes
  from public, anon, authenticated, service_role;
grant select on table
  public.cognitive_product_sentinel_platform_scopes
  to authenticated;

create policy cognitive_product_sentinel_platform_scopes_owner_read
  on public.cognitive_product_sentinel_platform_scopes
  for select
  to authenticated
  using ((select public.governance_exact_owner(auth.uid())));

create trigger cognitive_product_sentinel_platform_scopes_immutable
before update or delete
on public.cognitive_product_sentinel_platform_scopes
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.governance_product_sentinel_platform_scope_hash(
  p_shared_task_id uuid,
  p_project_id uuid,
  p_source_commit text,
  p_policy_version text,
  p_retention_policy_hash text
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'environment', 'production',
          'platforms', jsonb_build_array('android', 'ios'),
          'projectId', p_project_id,
          'retentionPolicyHash', p_retention_policy_hash,
          'schemaVersion', 'product-sentinel-platform-scopes-v1',
          'sentinelSwitches', jsonb_build_array(
            'cognitive_installed_journey_sentinel_enabled',
            'cognitive_livekit_experience_sentinel_enabled',
            'cognitive_visual_experience_sentinel_enabled'
          ),
          'sharedTaskId', p_shared_task_id,
          'sourceCommit', p_source_commit,
          'switchPolicyVersion', p_policy_version
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;
revoke all on function
  public.governance_product_sentinel_platform_scope_hash(
    uuid,uuid,text,text,text
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.governance_product_sentinel_platform_scope_hash(
    uuid,uuid,text,text,text
  )
  to authenticated;

create function public.governance_materialize_product_sentinel_platform_scopes(
  p_shared_task_id uuid,
  p_project_id uuid,
  p_source_commit text,
  p_policy_version text,
  p_retention_policy_hash text,
  p_scope_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  shared_task public.intelligence_tasks%rowtype;
  project_value public.cognitive_projects%rowtype;
  shared_retention public.cognitive_retention_policy_states%rowtype;
  platform_value public.cognitive_platform;
  platform_task_id_value uuid;
  existing_scope_count integer;
  conflicting_task_count integer;
  shared_control_count integer;
  shared_switch_count integer;
  shared_policy_version_count integer;
  platform_values jsonb := '[]'::jsonb;
begin
  if p_source_commit !~ '^[a-f0-9]{40}$'
     or p_scope_hash !~ '^[a-f0-9]{64}$'
     or p_retention_policy_hash !~ '^[a-f0-9]{64}$'
     or length(p_policy_version) not between 1 and 64
     or public.cognitive_text_has_secret(p_policy_version)
     or p_scope_hash <>
       public.governance_product_sentinel_platform_scope_hash(
         p_shared_task_id,
         p_project_id,
         p_source_commit,
         p_policy_version,
         p_retention_policy_hash
       )
     or not public.governance_approval_emergency_active() then
    raise exception 'product_sentinel_platform_scope_rejected'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'cognitive-product-sentinel-platform-scopes:'
        || p_shared_task_id::text,
      0
    )
  );

  select * into shared_task
  from public.intelligence_tasks task
  where task.id = p_shared_task_id
    and task.project_id = p_project_id
    and task.platform = 'shared'
    and task.environment = 'production'
  for share;

  select * into project_value
  from public.cognitive_projects project
  where project.id = p_project_id
  for share;

  select count(*) into shared_control_count
  from public.intelligence_tasks task
  where task.project_id = p_project_id
    and task.repository_full_name = 'Chillywood2025/chillywood-mobile'
    and task.task_key = 'cognitive-level01-canary-control'
    and task.platform = 'shared'
    and task.environment = 'production';

  select * into shared_retention
  from public.cognitive_retention_policy_states policy
  where policy.task_id = p_shared_task_id
    and policy.project_id = p_project_id
    and policy.platform = 'shared'
    and policy.environment = 'production'
    and policy.policy_state = 'owner_counsel_decision_required'
    and policy.policy_hash = p_retention_policy_hash
    and not policy.user_derived_memory_allowed
    and not policy.raw_user_reports_allowed
    and not policy.raw_private_messages_allowed
    and not policy.raw_private_media_allowed
    and not policy.raw_user_analytics_allowed
    and not policy.private_model_input_allowed
  for share;

  select
    count(*),
    count(distinct switch.policy_version)
  into shared_switch_count, shared_policy_version_count
  from public.cognitive_governance_switches switch
  where switch.task_id = p_shared_task_id
    and switch.project_id = p_project_id
    and switch.platform = 'shared'
    and switch.environment = 'production'
    and switch.switch_key in (
      'cognitive_installed_journey_sentinel_enabled',
      'cognitive_livekit_experience_sentinel_enabled',
      'cognitive_visual_experience_sentinel_enabled'
    )
    and not switch.enabled
    and switch.policy_version = p_policy_version;

  if shared_task.id is null
     or project_value.id is null
     or shared_control_count <> 1
     or shared_task.task_key <> 'cognitive-level01-canary-control'
     or shared_task.repository_full_name <>
       'Chillywood2025/chillywood-mobile'
     or project_value.repository_full_name <>
       shared_task.repository_full_name
     or shared_task.parent_task_id is not null
     or shared_task.cancelled_at is not null
     or shared_task.quarantined_at is not null
     or shared_task.deadman_at <= transaction_timestamp()
     or shared_task.retention_until is null
     or shared_task.retention_until <= shared_task.deadman_at
     or shared_task.data_class <> 'operational_metadata'
     or project_value.production_authority
     or shared_retention.id is null
     or shared_switch_count <> 3
     or shared_policy_version_count <> 1 then
    raise exception 'product_sentinel_shared_control_scope_rejected'
      using errcode = 'P0001';
  end if;

  select count(*) into existing_scope_count
  from public.cognitive_product_sentinel_platform_scopes scope
  where scope.shared_task_id = p_shared_task_id;

  if existing_scope_count = 2 then
    if (
      select count(*) <> 2
      from public.cognitive_product_sentinel_platform_scopes scope
      join public.intelligence_tasks task
        on task.id = scope.platform_task_id
       and task.project_id = scope.project_id
       and task.platform = scope.platform
       and task.environment = scope.environment
      join public.cognitive_retention_policy_states policy
        on policy.task_id = task.id
       and policy.project_id = task.project_id
       and policy.platform = task.platform
       and policy.environment = task.environment
       and policy.policy_state = 'owner_counsel_decision_required'
      where scope.shared_task_id = p_shared_task_id
        and scope.project_id = p_project_id
        and scope.shared_platform = 'shared'
        and scope.platform in ('android', 'ios')
        and scope.environment = 'production'
        and scope.scope_hash = p_scope_hash
        and scope.source_commit = p_source_commit
        and scope.policy_version = p_policy_version
        and scope.retention_policy_hash = p_retention_policy_hash
        and task.repository_full_name =
          'Chillywood2025/chillywood-mobile'
        and task.task_key = 'cognitive-level01-canary-control'
        and task.parent_task_id is null
        and task.data_class = 'operational_metadata'
        and policy.policy_hash = p_retention_policy_hash
        and not policy.user_derived_memory_allowed
        and not policy.raw_user_reports_allowed
        and not policy.raw_private_messages_allowed
        and not policy.raw_private_media_allowed
        and not policy.raw_user_analytics_allowed
        and not policy.private_model_input_allowed
    ) or (
      select count(*) <> 6
      from public.cognitive_product_sentinel_platform_scopes scope
      join public.cognitive_governance_switches switch
        on switch.task_id = scope.platform_task_id
       and switch.project_id = scope.project_id
       and switch.platform = scope.platform
       and switch.environment = scope.environment
      where scope.shared_task_id = p_shared_task_id
        and switch.switch_key in (
          'cognitive_installed_journey_sentinel_enabled',
          'cognitive_livekit_experience_sentinel_enabled',
          'cognitive_visual_experience_sentinel_enabled'
        )
        and not switch.enabled
        and switch.policy_version = p_policy_version
    ) or exists (
      select 1
      from public.cognitive_product_sentinel_platform_scopes scope
      join public.cognitive_governance_switches switch
        on switch.task_id = scope.platform_task_id
      where scope.shared_task_id = p_shared_task_id
        and switch.switch_key not in (
          'cognitive_installed_journey_sentinel_enabled',
          'cognitive_livekit_experience_sentinel_enabled',
          'cognitive_visual_experience_sentinel_enabled'
        )
    ) or exists (
      select 1
      from public.cognitive_product_sentinel_platform_scopes scope
      join public.cognitive_level01_schedule_definitions schedule
        on schedule.task_id = scope.platform_task_id
      where scope.shared_task_id = p_shared_task_id
    ) then
      raise exception 'product_sentinel_platform_scope_conflict'
        using errcode = 'P0001';
    end if;

    select jsonb_agg(
      jsonb_build_object(
        'platform', scope.platform,
        'taskId', scope.platform_task_id
      )
      order by scope.platform
    )
    into platform_values
    from public.cognitive_product_sentinel_platform_scopes scope
    where scope.shared_task_id = p_shared_task_id;

    return jsonb_build_object(
      'materialized', false,
      'platformScopes', platform_values,
      'scopeCount', 2,
      'scopeHash', p_scope_hash,
      'status', 'already_materialized'
    );
  elsif existing_scope_count <> 0 then
    raise exception 'product_sentinel_platform_scope_conflict'
      using errcode = 'P0001';
  end if;

  select count(*) into conflicting_task_count
  from public.intelligence_tasks task
  where task.project_id = p_project_id
    and task.task_key = 'cognitive-level01-canary-control'
    and task.platform in ('android', 'ios')
    and task.environment = 'production';

  if conflicting_task_count <> 0 then
    raise exception 'product_sentinel_platform_scope_conflict'
      using errcode = 'P0001';
  end if;

  foreach platform_value in array array[
    'android'::public.cognitive_platform,
    'ios'::public.cognitive_platform
  ]
  loop
    insert into public.intelligence_tasks(
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
      data_class,
      parent_task_id
    ) values (
      p_project_id,
      platform_value,
      'production',
      'Chillywood2025/chillywood-mobile',
      case platform_value
        when 'android' then
          'codex/cognitive-level01-android-sentinel-control'
        else
          'codex/cognitive-level01-ios-sentinel-control'
      end,
      'cognitive-level01-canary-control',
      encode(
        extensions.digest(
          convert_to(
            concat_ws(
              '|',
              shared_task.objective_hash,
              platform_value::text,
              'product-sentinels-v1'
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ),
      'received',
      'cognitive-exact-owner-sentinel-scope',
      shared_task.deadman_at,
      shared_task.retention_until,
      'operational_metadata',
      null
    )
    returning id into platform_task_id_value;

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
      platform_task_id_value,
      p_project_id,
      platform_value,
      'production',
      p_retention_policy_hash,
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
      platform_task_id_value,
      p_project_id,
      platform_value,
      'production',
      shared_switch.switch_key,
      false,
      p_policy_version
    from public.cognitive_governance_switches shared_switch
    where shared_switch.task_id = p_shared_task_id
      and shared_switch.project_id = p_project_id
      and shared_switch.platform = 'shared'
      and shared_switch.environment = 'production'
      and shared_switch.switch_key in (
        'cognitive_installed_journey_sentinel_enabled',
        'cognitive_livekit_experience_sentinel_enabled',
        'cognitive_visual_experience_sentinel_enabled'
      )
    order by shared_switch.switch_key;

    insert into public.cognitive_product_sentinel_platform_scopes(
      shared_task_id,
      platform_task_id,
      project_id,
      shared_platform,
      platform,
      environment,
      scope_hash,
      source_commit,
      policy_version,
      retention_policy_hash,
      materialized_by
    ) values (
      p_shared_task_id,
      platform_task_id_value,
      p_project_id,
      'shared',
      platform_value,
      'production',
      p_scope_hash,
      p_source_commit,
      p_policy_version,
      p_retention_policy_hash,
      owner_id
    );

    platform_values := platform_values || jsonb_build_array(
      jsonb_build_object(
        'platform', platform_value,
        'taskId', platform_task_id_value
      )
    );
  end loop;

  return jsonb_build_object(
    'materialized', true,
    'platformScopes', platform_values,
    'scopeCount', 2,
    'scopeHash', p_scope_hash,
    'status', 'materialized_disabled'
  );
end;
$$;
revoke all on function
  public.governance_materialize_product_sentinel_platform_scopes(
    uuid,uuid,text,text,text,text
  )
  from public, anon, service_role;
grant execute on function
  public.governance_materialize_product_sentinel_platform_scopes(
    uuid,uuid,text,text,text,text
  )
  to authenticated;

-- Scheduler evidence is anchored through the immutable cross-platform mapping
-- instead of weakening intelligence_tasks' same-platform parent constraint.
do $bind_scheduler_to_platform_scopes$
declare
  function_schema text;
  function_name text;
  argument_types text;
  definition text;
  prior_join text;
  replacement_join text;
  prior_parent_predicate text;
  replacement_parent_predicate text;
begin
  for function_schema, function_name, argument_types,
      prior_parent_predicate, replacement_parent_predicate
  in
    values
      (
        'public',
        'cognitive_level01_schedule_prerequisites_base',
        'uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment',
        'and sentinel_task.parent_task_id = p_parent_task_id',
        'and sentinel_scope.shared_task_id = p_parent_task_id'
      ),
      (
        'cognitive_runtime',
        'scheduler_prerequisite_snapshot',
        'uuid,uuid,text,text',
        'and sentinel_task.parent_task_id = p_task_id',
        'and sentinel_scope.shared_task_id = p_task_id'
      )
  loop
    select pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        function_schema || '.' || function_name || '(' || argument_types || ')'
      )::oid
    )
    into definition;

    if function_schema = 'public' then
      prior_join :=
        'join public.intelligence_tasks sentinel_task' || chr(10)
        || '        on sentinel_task.id = run.task_id' || chr(10)
        || '       and sentinel_task.project_id = run.project_id' || chr(10)
        || '       and sentinel_task.platform = run.platform' || chr(10)
        || '       and sentinel_task.environment = run.environment';
      replacement_join :=
        'join public.cognitive_product_sentinel_platform_scopes sentinel_scope'
        || chr(10)
        || '        on sentinel_scope.platform_task_id = run.task_id'
        || chr(10)
        || '       and sentinel_scope.project_id = run.project_id'
        || chr(10)
        || '       and sentinel_scope.platform = run.platform' || chr(10)
        || '       and sentinel_scope.environment = run.environment';
    else
      prior_join :=
        'join public.intelligence_tasks sentinel_task' || chr(10)
        || '      on sentinel_task.id = run.task_id' || chr(10)
        || '     and sentinel_task.project_id = run.project_id' || chr(10)
        || '     and sentinel_task.platform = run.platform' || chr(10)
        || '     and sentinel_task.environment = run.environment';
      replacement_join :=
        'join public.cognitive_product_sentinel_platform_scopes sentinel_scope'
        || chr(10)
        || '      on sentinel_scope.platform_task_id = run.task_id' || chr(10)
        || '     and sentinel_scope.project_id = run.project_id' || chr(10)
        || '     and sentinel_scope.platform = run.platform' || chr(10)
        || '     and sentinel_scope.environment = run.environment';
    end if;

    if definition is null
       or (length(definition) - length(replace(definition, prior_join, '')))
          / length(prior_join) <> 1
       or (
         length(definition) -
           length(replace(definition, prior_parent_predicate, ''))
       ) / length(prior_parent_predicate) <> 1 then
      raise exception 'product_sentinel_scheduler_scope_patch_rejected:%',
        function_schema || '.' || function_name
        using errcode = 'P0001';
    end if;

    definition := replace(definition, prior_join, replacement_join);
    definition := replace(
      definition,
      prior_parent_predicate,
      replacement_parent_predicate
    );
    execute definition;
  end loop;
end;
$bind_scheduler_to_platform_scopes$;

comment on table public.cognitive_product_sentinel_platform_scopes is
  'Immutable Owner-materialized mapping from one shared Level 0/1 control task to exact disabled Android/iOS sentinel task scopes. It grants no live, provider, schedule, Level 2, or user-derived-memory authority.';
comment on function
  public.governance_materialize_product_sentinel_platform_scopes(
    uuid,uuid,text,text,text,text
  ) is
  'Exact-Owner, fail-closed materialization of disabled Android/iOS sentinel scopes. Runtime capabilities and switch activation remain separate reviewed operations.';
