-- Fail closed until reviewed provider-bound model attestations and automatic
-- public-research retention processing exist. This migration enables no switch
-- and preserves the existing advisory-only model path.

create or replace function public.governance_record_model_execution_attestation(
  p_assessment_id text,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_council_role text,
  p_provider_identity_hash text,
  p_model_family text,
  p_model_version text,
  p_execution_identity_hash text,
  p_evidence_packet_hash text,
  p_prompt_template_version_hash text,
  p_output_hash text,
  p_blind_first_round boolean,
  p_correlation_class text,
  p_cost numeric,
  p_latency_ms integer,
  p_service_identity text,
  p_worker_assertion text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'model_provider_bound_attestation_required'
    using errcode = 'P0001';
end;
$$;

revoke all on function public.governance_record_model_execution_attestation(
  text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,boolean,text,numeric,integer,text,text
) from public, anon, authenticated;

grant execute on function public.governance_record_model_execution_attestation(
  text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,boolean,text,numeric,integer,text,text
) to service_role;

comment on function public.governance_record_model_execution_attestation(
  text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,boolean,text,numeric,integer,text,text
) is
  'Fail-closed placeholder. A future reviewed migration must add provider-bound attestation verification before model executions can count toward quorum.';

create or replace function public.governance_model_independence_status_internal(
  p_task_id uuid,
  p_assessment_id text,
  p_required_count integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'assessmentId', p_assessment_id,
    'requiredCount', p_required_count,
    'totalCount', 0,
    'distinctExecutions', 0,
    'distinctOutputs', 0,
    'blindFirstRoundCount', 0,
    'distinctCouncilRoles', 0,
    'providerCount', 0,
    'modelFamilyCount', 0,
    'modelVersionCount', 0,
    'independenceSatisfied', false,
    'status', 'MODEL_INDEPENDENCE_PROVIDER_REQUIRED'
  )
$$;

revoke all on function
  public.governance_model_independence_status_internal(uuid,text,integer)
  from public, anon, authenticated, service_role;

comment on function
  public.governance_model_independence_status_internal(uuid,text,integer) is
  'Returns provider-required fail-closed status until provider-bound model attestations are implemented by a later reviewed migration.';

create or replace function public.governance_assert_switch_prerequisites(
  p_execution_id uuid,
  p_switch_key text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  now_at timestamptz := transaction_timestamp();
begin
  if p_enabled
     and p_switch_key in (
       'cognitive_research_enabled',
       'cognitive_memory_enabled'
     ) then
    raise exception 'cognitive_research_retention_processor_required'
      using errcode = 'P0001';
  end if;

  if p_enabled
     and p_switch_key = 'cognitive_collective_deliberation_enabled' then
    raise exception 'model_independence_provider_required'
      using errcode = 'P0001';
  end if;

  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_execution_id
  for share;
  if execution_value.id is null then
    raise exception 'two_party_execution_missing' using errcode = 'P0001';
  end if;

  if p_enabled and p_switch_key = 'cognitive_draft_pr_executor_enabled'
     and (
       (
         select count(distinct run.canary_key)
         from public.cognitive_level01_canary_runs run
         where run.task_id = execution_value.task_id
           and run.project_id = execution_value.project_id
           and run.platform = execution_value.platform
           and run.environment = execution_value.environment
           and run.canary_type = 'deliberation'
           and run.result_status = 'passed'
           and run.evaluator_state = 'pass'
       ) <> 3
       or not exists (
         select 1
         from public.cognitive_level01_credential_attestations attestation
         where attestation.task_id = execution_value.task_id
           and attestation.project_id = execution_value.project_id
           and attestation.platform = execution_value.platform
           and attestation.environment = execution_value.environment
           and attestation.credential_kind = 'github_draft_pr'
           and attestation.state = 'configured'
           and attestation.verified_at <= now_at
           and now_at < attestation.expires_at
         order by attestation.verified_at desc
         limit 1
       )
     ) then
    raise exception 'cognitive_draft_pr_canary_prerequisites_required'
      using errcode = 'P0001';
  end if;

  if p_enabled and p_switch_key = 'cognitive_scheduled_level01_enabled'
     and (
       (
         select count(distinct run.canary_key)
         from public.cognitive_level01_canary_runs run
         where run.task_id = execution_value.task_id
           and run.project_id = execution_value.project_id
           and run.platform = execution_value.platform
           and run.environment = execution_value.environment
           and run.canary_type = 'draft_pr'
           and run.result_status = 'passed'
           and run.evaluator_state = 'pass'
       ) <> 3
       or (
         select count(*)
         from public.cognitive_level01_schedule_definitions schedule
         where schedule.task_id = execution_value.task_id
           and schedule.project_id = execution_value.project_id
           and schedule.platform = execution_value.platform
           and schedule.environment = execution_value.environment
       ) <> 5
     ) then
    raise exception 'cognitive_schedule_canaries_required'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.governance_assert_switch_prerequisites(
  uuid,text,boolean
) from public, anon, authenticated, service_role;

comment on function public.governance_assert_switch_prerequisites(
  uuid,text,boolean
) is
  'Central two-party switch gate. Research/memory require an automatic reviewed retention processor; collective deliberation requires provider-bound model independence. Disable operations remain available.';

update public.cognitive_governance_switches
set enabled = false,
    enabled_by = null,
    enabled_at = null,
    disabled_at = transaction_timestamp(),
    updated_at = transaction_timestamp()
where switch_key in (
  'cognitive_research_enabled',
  'cognitive_memory_enabled',
  'cognitive_collective_deliberation_enabled'
)
  and enabled;

create function public.governance_enforce_level01_activation_hold()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Database-administrator sessions can always alter/disable triggers. Permit
  -- only an authenticated administrator that is still executing as an
  -- administrator so migrations and latent-policy fixtures remain possible.
  -- A runtime SECURITY DEFINER call changes current_user to postgres but keeps
  -- its non-administrator session_user, and direct SET ROLE changes
  -- current_user away from the administrator; both remain fail closed.
  if (
       session_user not in ('postgres','supabase_admin')
       or current_user not in ('postgres','supabase_admin')
     )
     and new.enabled
     and new.switch_key in (
       'cognitive_research_enabled',
       'cognitive_memory_enabled'
     ) then
    raise exception 'cognitive_research_retention_processor_required'
      using errcode = 'P0001';
  end if;

  if (
       session_user not in ('postgres','supabase_admin')
       or current_user not in ('postgres','supabase_admin')
     )
     and new.enabled
     and new.switch_key = 'cognitive_collective_deliberation_enabled' then
    raise exception 'model_independence_provider_required'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.governance_enforce_level01_activation_hold()
  from public, anon, authenticated, service_role;

drop trigger if exists cognitive_governance_switches_level01_activation_hold
  on public.cognitive_governance_switches;

create trigger cognitive_governance_switches_level01_activation_hold
before insert or update of enabled, switch_key
on public.cognitive_governance_switches
for each row
execute function public.governance_enforce_level01_activation_hold();

comment on function public.governance_enforce_level01_activation_hold() is
  'Table-boundary defense requiring both an authenticated database-administrator session and an administrator execution role for the administrative exception. Runtime SECURITY DEFINER and direct role changes remain fail closed until reviewed successor migrations install the missing prerequisites.';
