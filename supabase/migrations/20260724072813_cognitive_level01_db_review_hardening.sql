-- Database/RLS review hardening for Cognitive Level 0/1 operations.
--
-- This forward-only migration:
--   * makes the dedicated GitHub draft-PR broker the only database path for
--     GitHub draft-PR capability consumption and postflight evidence;
--   * serializes scheduled child issuance with the exact task, emergency, and
--     prerequisite switch rows and rejects mismatched occurrence replays;
--   * serializes public research writes with task/emergency/switch/retention
--     liveness; and
--   * locks the exact product-sentinel enable switch at the insert boundary.
--
-- It grants no merge, release, deployment, Level 2, private-memory, role,
-- rights, money, or Owner authority.

-- ---------------------------------------------------------------------------
-- Dedicated GitHub draft-PR broker exclusivity.
-- ---------------------------------------------------------------------------

alter function public.cognitive_consume_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text
)
rename to cognitive_consume_non_github_capability_internal;

revoke all on function
  public.cognitive_consume_non_github_capability_internal(
    text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
    public.cognitive_environment,text,text,text,uuid,bigint,numeric,
    text,text,text
  )
from public,anon,authenticated,service_role;

create function public.cognitive_consume_capability(
  p_capability_id text,
  p_opaque_bearer text,
  p_opaque_nonce text,
  p_call_id text,
  p_task_id uuid,
  p_project_id uuid,
  p_repository_full_name text,
  p_branch_name text,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_provider text,
  p_operation text,
  p_path text,
  p_resource_lease_id uuid,
  p_bytes bigint,
  p_cost numeric,
  p_approval_scope_hash text,
  p_plan_snapshot_hash text,
  p_request_hash text
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_operation in (
    'github_open_draft_pr',
    'github_update_draft_pr_body'
  ) then
    raise exception 'github_draft_pr_dedicated_broker_required'
      using errcode='42501';
  end if;

  return public.cognitive_consume_non_github_capability_internal(
    p_capability_id,p_opaque_bearer,p_opaque_nonce,p_call_id,
    p_task_id,p_project_id,p_repository_full_name,p_branch_name,
    p_platform,p_environment,p_provider,p_operation,p_path,
    p_resource_lease_id,p_bytes,p_cost,p_approval_scope_hash,
    p_plan_snapshot_hash,p_request_hash
  );
end;
$$;
revoke all on function public.cognitive_consume_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text
) from public,anon,authenticated;
grant execute on function public.cognitive_consume_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text
) to service_role;

alter function public.cognitive_accept_trusted_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text
)
rename to cognitive_accept_non_github_tool_result_internal;

revoke all on function
  public.cognitive_accept_non_github_tool_result_internal(
    text,text,text,text,jsonb,text,text,text,text,text
  )
from public,anon,authenticated,service_role;

create function public.cognitive_accept_trusted_tool_result(
  p_capability_id text,
  p_call_id text,
  p_opaque_bearer text,
  p_opaque_nonce text,
  p_result_envelope jsonb,
  p_before_state_hash text,
  p_after_state_hash text,
  p_diff_hash text,
  p_final_commit text,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  capability_operation text;
begin
  select capability.operation into capability_operation
  from public.cognitive_capabilities capability
  where capability.capability_id=p_capability_id;

  if capability_operation in (
    'github_open_draft_pr',
    'github_update_draft_pr_body'
  ) then
    raise exception 'github_draft_pr_dedicated_broker_required'
      using errcode='42501';
  end if;

  return public.cognitive_accept_non_github_tool_result_internal(
    p_capability_id,p_call_id,p_opaque_bearer,p_opaque_nonce,
    p_result_envelope,p_before_state_hash,p_after_state_hash,p_diff_hash,
    p_final_commit,p_service_identity_token
  );
end;
$$;
revoke all on function public.cognitive_accept_trusted_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.cognitive_accept_trusted_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text
) to service_role;

comment on function public.cognitive_consume_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text
) is
  'Generic non-GitHub capability consumption. GitHub draft-PR operations are fail-closed and require cognitive_consume_github_draft_pr_capability.';
comment on function public.cognitive_accept_trusted_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text
) is
  'Generic non-GitHub postflight. GitHub draft-PR results are fail-closed and require cognitive_accept_github_draft_pr_tool_result.';

-- ---------------------------------------------------------------------------
-- Locked public/non-personal research liveness.
-- ---------------------------------------------------------------------------

create or replace function public.cognitive_public_research_runtime_ready(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment
)
returns boolean
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  task_live boolean:=false;
  emergency_live boolean:=false;
  enabled_required_count integer:=0;
  disabled_required_count integer:=0;
  retention_ready boolean:=false;
begin
  if p_platform<>'shared'::public.cognitive_platform
     or p_environment<>'production'::public.cognitive_environment then
    return false;
  end if;

  select
    task.cancelled_at is null
    and task.quarantined_at is null
    and transaction_timestamp()<task.deadman_at
  into task_live
  from public.intelligence_tasks task
  where task.id=p_task_id
    and task.project_id=p_project_id
    and task.platform=p_platform
    and task.environment=p_environment
  for share;
  if not coalesce(task_live,false) then
    return false;
  end if;

  select emergency.status='active'
  into emergency_live
  from public.autonomous_system_emergency_states emergency
  where emergency.system_id='product_intelligence_operator'
  for share;
  if not coalesce(emergency_live,false) then
    return false;
  end if;

  perform 1
  from public.cognitive_governance_switches switch
  where switch.task_id=p_task_id
    and switch.project_id=p_project_id
    and switch.platform=p_platform
    and switch.environment=p_environment
    and switch.switch_key in (
      'cognitive_research_enabled',
      'cognitive_memory_enabled',
      'cognitive_user_derived_memory_enabled'
    )
  order by switch.switch_key
  for share;

  select
    count(*) filter (
      where switch.switch_key in (
        'cognitive_research_enabled','cognitive_memory_enabled'
      ) and switch.enabled
    ),
    count(*) filter (
      where switch.switch_key='cognitive_user_derived_memory_enabled'
        and not switch.enabled
    )
  into enabled_required_count,disabled_required_count
  from public.cognitive_governance_switches switch
  where switch.task_id=p_task_id
    and switch.project_id=p_project_id
    and switch.platform=p_platform
    and switch.environment=p_environment
    and switch.switch_key in (
      'cognitive_research_enabled',
      'cognitive_memory_enabled',
      'cognitive_user_derived_memory_enabled'
    );
  if enabled_required_count<>2 or disabled_required_count<>1 then
    return false;
  end if;

  select
    policy.policy_state='owner_counsel_decision_required'
    and not policy.user_derived_memory_allowed
    and not policy.raw_user_reports_allowed
    and not policy.raw_private_messages_allowed
    and not policy.raw_private_media_allowed
    and not policy.raw_user_analytics_allowed
    and not policy.private_model_input_allowed
  into retention_ready
  from public.cognitive_retention_policy_states policy
  where policy.task_id=p_task_id
    and policy.project_id=p_project_id
    and policy.platform=p_platform
    and policy.environment=p_environment
    and policy.policy_state='owner_counsel_decision_required'
  for share;

  return coalesce(retention_ready,false);
end;
$$;
revoke all on function public.cognitive_public_research_runtime_ready(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public,anon,authenticated,service_role;

comment on function public.cognitive_public_research_runtime_ready(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) is
  'Locks and rechecks the exact task, emergency, research, memory, user-derived-memory, and retention-policy rows for one public research write/evaluation transaction.';

-- ---------------------------------------------------------------------------
-- Locked scheduler prerequisites and exact draft-PR canary set.
-- ---------------------------------------------------------------------------

alter function public.cognitive_level01_schedule_prerequisites_pass(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment
)
rename to cognitive_level01_schedule_prerequisites_base;

revoke all on function
  public.cognitive_level01_schedule_prerequisites_base(
    uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment
  )
from public,anon,authenticated,service_role;

create function public.cognitive_level01_schedule_prerequisites_pass(
  p_schedule_definition_id uuid,
  p_parent_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  schedule_key_value text;
  base_pass boolean;
  exact_draft_canary_count integer;
begin
  base_pass:=public.cognitive_level01_schedule_prerequisites_base(
    p_schedule_definition_id,p_parent_task_id,p_project_id,
    p_platform,p_environment
  );
  if not coalesce(base_pass,false) then
    return false;
  end if;

  select schedule.schedule_key into schedule_key_value
  from public.cognitive_level01_schedule_definitions schedule
  where schedule.id=p_schedule_definition_id
    and schedule.task_id=p_parent_task_id
    and schedule.project_id=p_project_id
    and schedule.platform=p_platform
    and schedule.environment=p_environment;

  if schedule_key_value<>'weekly_experiment_outcome' then
    return true;
  end if;

  select count(distinct run.canary_key)
  into exact_draft_canary_count
  from public.cognitive_level01_canary_runs run
  where run.task_id=p_parent_task_id
    and run.project_id=p_project_id
    and run.platform=p_platform
    and run.environment=p_environment
    and run.canary_type='draft_pr'
    and run.canary_key in (
      'documentation_draft_pr',
      'test_only_draft_pr',
      'low_risk_source_draft_pr'
    )
    and run.result_status='passed'
    and run.evaluator_state='pass'
    and run.completed_at>=transaction_timestamp()-interval '30 days'
    and run.completed_at<=transaction_timestamp();

  return exact_draft_canary_count=3;
end;
$$;
revoke all on function public.cognitive_level01_schedule_prerequisites_pass(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public,anon,authenticated,service_role;

create function public.cognitive_level01_lock_issuance_prerequisites()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  schedule_value public.cognitive_level01_schedule_definitions%rowtype;
  task_live boolean:=false;
  emergency_live boolean:=false;
  required_switch_keys text[];
  required_switch_count integer;
  enabled_switch_count integer;
  disabled_switch_count integer;
  existing_value public.cognitive_level01_scheduled_task_issuances%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      new.schedule_definition_id::text||':'||
      extract(epoch from new.scheduled_for)::numeric::text,
      1
    )
  );

  select * into existing_value
  from public.cognitive_level01_scheduled_task_issuances issuance
  where issuance.schedule_definition_id=new.schedule_definition_id
    and issuance.scheduled_for=new.scheduled_for
  for share;
  if existing_value.id is not null
     and (
       existing_value.execution_idempotency_hash
         is distinct from new.execution_idempotency_hash
       or existing_value.objective_hash is distinct from new.objective_hash
       or existing_value.work_state is distinct from new.work_state
       or existing_value.no_work_reason_hash
         is distinct from new.no_work_reason_hash
     ) then
    raise exception 'cognitive_level01_schedule_idempotency_conflict'
      using errcode='P0001';
  end if;

  select * into schedule_value
  from public.cognitive_level01_schedule_definitions schedule
  where schedule.id=new.schedule_definition_id
    and schedule.task_id=new.parent_task_id
    and schedule.project_id=new.project_id
    and schedule.platform=new.platform
    and schedule.environment=new.environment
  for share;

  select
    task.cancelled_at is null
    and task.quarantined_at is null
    and transaction_timestamp()<task.deadman_at
  into task_live
  from public.intelligence_tasks task
  where task.id=new.parent_task_id
    and task.project_id=new.project_id
    and task.platform=new.platform
    and task.environment=new.environment
  for share;

  select emergency.status='active'
  into emergency_live
  from public.autonomous_system_emergency_states emergency
  where emergency.system_id='product_intelligence_operator'
  for share;

  required_switch_keys:=array[
    'cognitive_research_enabled',
    'cognitive_memory_enabled',
    'cognitive_scheduled_level01_enabled',
    'cognitive_user_derived_memory_enabled',
    'cognitive_level2_production_repairs_enabled'
  ]::text[];
  if schedule_value.schedule_key='weekly_ux_route_dead_control' then
    required_switch_keys:=required_switch_keys||array[
      'cognitive_installed_journey_sentinel_enabled',
      'cognitive_visual_experience_sentinel_enabled'
    ]::text[];
  elsif schedule_value.schedule_key='weekly_experiment_outcome' then
    required_switch_keys:=required_switch_keys||array[
      'cognitive_collective_deliberation_enabled',
      'cognitive_draft_pr_executor_enabled'
    ]::text[];
  end if;

  perform 1
  from public.cognitive_governance_switches switch
  where switch.task_id=new.parent_task_id
    and switch.project_id=new.project_id
    and switch.platform=new.platform
    and switch.environment=new.environment
    and switch.switch_key=any(required_switch_keys)
  order by switch.switch_key
  for share;

  select
    count(*),
    count(*) filter (
      where switch.switch_key not in (
        'cognitive_user_derived_memory_enabled',
        'cognitive_level2_production_repairs_enabled'
      ) and switch.enabled
    ),
    count(*) filter (
      where switch.switch_key in (
        'cognitive_user_derived_memory_enabled',
        'cognitive_level2_production_repairs_enabled'
      ) and not switch.enabled
    )
  into required_switch_count,enabled_switch_count,disabled_switch_count
  from public.cognitive_governance_switches switch
  where switch.task_id=new.parent_task_id
    and switch.project_id=new.project_id
    and switch.platform=new.platform
    and switch.environment=new.environment
    and switch.switch_key=any(required_switch_keys);

  if schedule_value.id is null
     or not schedule_value.enabled
     or not coalesce(task_live,false)
     or not coalesce(emergency_live,false)
     or required_switch_count<>cardinality(required_switch_keys)
     or enabled_switch_count<>cardinality(required_switch_keys)-2
     or disabled_switch_count<>2
     or not public.cognitive_level01_schedule_prerequisites_pass(
       new.schedule_definition_id,new.parent_task_id,new.project_id,
       new.platform,new.environment
     ) then
    raise exception 'cognitive_level01_schedule_locked_prerequisites_rejected'
      using errcode='P0001';
  end if;

  return new;
end;
$$;
revoke all on function public.cognitive_level01_lock_issuance_prerequisites()
  from public,anon,authenticated,service_role;

create trigger cognitive_level01_scheduled_task_issuances_locked_prerequisites
before insert on public.cognitive_level01_scheduled_task_issuances
for each row
execute function public.cognitive_level01_lock_issuance_prerequisites();

comment on function public.cognitive_level01_lock_issuance_prerequisites() is
  'Final table-boundary lock/recheck for exact schedule occurrence, task, emergency, required enabled switches, permanently disabled user-derived/Level2 switches, and exact canary prerequisites.';

-- ---------------------------------------------------------------------------
-- Exact sentinel-switch lock at the persisted-run insert boundary.
-- ---------------------------------------------------------------------------

create function public.product_experience_lock_exact_sentinel_switch()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  switch_key_value text;
  switch_enabled boolean:=false;
begin
  switch_key_value:=case new.sentinel_key
    when 'livekit_experience_sentinel'
      then 'cognitive_livekit_experience_sentinel_enabled'
    when 'visual_product_experience_sentinel'
      then 'cognitive_visual_experience_sentinel_enabled'
    when 'installed_journey_sentinel'
      then 'cognitive_installed_journey_sentinel_enabled'
    else null
  end;

  select switch.enabled into switch_enabled
  from public.cognitive_governance_switches switch
  where switch.task_id=new.task_id
    and switch.project_id=new.project_id
    and switch.platform=new.platform
    and switch.environment=new.environment
    and switch.switch_key=switch_key_value
  for share;

  if switch_key_value is null or switch_enabled is distinct from true then
    raise exception 'product_experience_sentinel_switch_required'
      using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.product_experience_lock_exact_sentinel_switch()
  from public,anon,authenticated,service_role;

create trigger product_experience_sentinel_runs_exact_switch_live
before insert on public.product_experience_sentinel_runs
for each row
execute function public.product_experience_lock_exact_sentinel_switch();

comment on function public.product_experience_lock_exact_sentinel_switch() is
  'Locks and rechecks the exact per-sentinel enable switch through persisted run insertion, serializing concurrent disable.';
