-- Permit an exact-Owner retry only after the Android visual canary failed
-- closed with an immutable zero-run outcome. This forward-only repair never
-- enables a switch, opens an authorization, or alters historical receipts.

create function
  public.governance_prepare_provider_independent_visual_canary_retry(
    p_shared_task_id uuid,
    p_project_id uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  target_scope public.cognitive_product_sentinel_platform_scopes%rowtype;
  target_switch public.cognitive_governance_switches%rowtype;
  prior_outcome
    public.cognitive_provider_independent_visual_activation_outcomes%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'provider-independent-visual-canary-zero-run-retry:'
        || p_shared_task_id::text,
      0
    )
  );

  select * into target_scope
  from public.cognitive_product_sentinel_platform_scopes scope
  where scope.shared_task_id = p_shared_task_id
    and scope.project_id = p_project_id
    and scope.shared_platform = 'shared'
    and scope.platform = 'android'
    and scope.environment = 'production'
    and scope.source_commit =
      '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a'
    and scope.policy_version = 'collective-governance-v1'
    and scope.retention_policy_hash =
      'f97c69b112f9e8ffcc133e2da052988a4cacd9790717e7f099a92e3f5d5f39f0'
  for share;

  select * into target_switch
  from public.cognitive_governance_switches switch
  where switch.task_id = target_scope.platform_task_id
    and switch.project_id = p_project_id
    and switch.platform = 'android'
    and switch.environment = 'production'
    and switch.switch_key =
      'cognitive_visual_experience_sentinel_enabled'
  for update;

  select outcome.* into prior_outcome
  from public.cognitive_provider_independent_visual_activation_outcomes outcome
  join public.cognitive_provider_independent_visual_canary_authorizations
    authorization_row
    on authorization_row.id = outcome.authorization_id
  where authorization_row.task_id = p_shared_task_id
    and authorization_row.project_id = p_project_id
    and authorization_row.platform = 'shared'
    and authorization_row.environment = 'production'
    and authorization_row.target_task_id = target_scope.platform_task_id
    and authorization_row.target_platform = 'android'
    and outcome.target_task_id = target_scope.platform_task_id
    and outcome.target_platform = 'android'
  order by outcome.created_at desc
  limit 1
  for share of outcome;

  if target_scope.id is null
     or target_switch.id is null
     or target_switch.enabled
     or target_switch.policy_version <>
        'provider-independent-visual-canary-rolled-back-v2'
     or prior_outcome.id is null
     or prior_outcome.enabled
     or prior_outcome.sentinel_run_count <> 0
     or prior_outcome.evaluator_proof_count <> 0
     or prior_outcome.triage_consumption_count <> 0
     or prior_outcome.finding_event_count <> 0
     or prior_outcome.target_task_id <> target_scope.platform_task_id
     or prior_outcome.target_platform <> 'android'
     or not public.governance_approval_emergency_active()
     or exists (
       select 1
       from public.product_experience_sentinel_runs run
       where run.task_id = target_scope.platform_task_id
         and run.project_id = p_project_id
         and run.platform = 'android'
         and run.environment = 'production'
     )
     or exists (
       select 1
       from public.cognitive_governance_switches sibling
       where sibling.project_id = p_project_id
         and sibling.environment = 'production'
         and sibling.enabled
     )
     or exists (
       select 1
       from public.cognitive_level01_schedule_definitions schedule
       where schedule.project_id = p_project_id
         and schedule.environment = 'production'
         and schedule.enabled
     )
     or exists (
       select 1
       from public.cognitive_provider_independent_visual_canary_authorizations
         authorization_row
       where authorization_row.task_id = p_shared_task_id
         and authorization_row.project_id = p_project_id
         and not exists (
           select 1
           from public.cognitive_provider_independent_visual_activation_outcomes
             outcome
           where outcome.authorization_id = authorization_row.id
         )
     )
     or (
       select count(*)
       from public.cognitive_product_quality_service_capabilities capability
       where capability.task_id = target_scope.platform_task_id
         and capability.project_id = p_project_id
         and capability.platform = 'android'
         and capability.environment = 'production'
         and capability.service_identity in (
           'cognitive_sentinel_collector',
           'cognitive_product_quality_triage'
         )
         and transaction_timestamp() < capability.expires_at
         and public.governance_exact_owner(capability.registered_by)
         and not exists (
           select 1
           from public.cognitive_product_quality_service_capability_revocations
             revocation
           where revocation.capability_id = capability.id
         )
     ) <> 2 then
    raise exception 'provider_independent_visual_canary_retry_rejected'
      using errcode = 'P0001';
  end if;

  update public.cognitive_governance_switches
  set policy_version = 'collective-governance-v1',
      enabled_by = null,
      enabled_at = null,
      disabled_at = transaction_timestamp(),
      updated_at = transaction_timestamp()
  where id = target_switch.id
    and not enabled
    and policy_version =
      'provider-independent-visual-canary-rolled-back-v2';

  if not found then
    raise exception 'provider_independent_visual_canary_retry_rejected'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'preparedBy', owner_id,
    'sharedTaskId', p_shared_task_id,
    'targetTaskId', target_scope.platform_task_id,
    'targetPlatform', target_scope.platform,
    'enabled', false,
    'policyVersion', 'collective-governance-v1',
    'priorOutcomeId', prior_outcome.id,
    'priorOutcomeHash', prior_outcome.outcome_hash,
    'priorSentinelRunCount', prior_outcome.sentinel_run_count,
    'status', 'zero_run_retry_prepared'
  );
end;
$$;

revoke all on function
  public.governance_prepare_provider_independent_visual_canary_retry(
    uuid,uuid
  )
from public,anon,service_role;
grant execute on function
  public.governance_prepare_provider_independent_visual_canary_retry(
    uuid,uuid
  )
to authenticated;

comment on function
  public.governance_prepare_provider_independent_visual_canary_retry(
    uuid,uuid
  ) is
  'Restores only the disabled Android visual switch metadata after an immutable exact-target zero-run v2 rollback; never enables or opens work.';
