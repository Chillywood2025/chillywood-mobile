-- Bind the provider-independent visual canary to the reviewed Android
-- platform scope. The prior shared-scope authorization failed closed and was
-- rolled back with zero runs; this forward migration does not rewrite it.

alter table public.cognitive_provider_independent_visual_canary_authorizations
  add column target_task_id uuid,
  add column target_platform public.cognitive_platform;

alter table public.cognitive_provider_independent_visual_canary_authorizations
  add constraint cognitive_visual_canary_target_pair_check check (
    (target_task_id is null and target_platform is null)
    or (target_task_id is not null and target_platform = 'android')
  ),
  add constraint cognitive_visual_canary_target_task_fk foreign key (
    target_task_id, project_id, target_platform, environment
  ) references public.intelligence_tasks(
    id, project_id, platform, environment
  );

alter table public.cognitive_provider_independent_visual_activation_outcomes
  add column target_task_id uuid,
  add column target_platform public.cognitive_platform;

alter table public.cognitive_provider_independent_visual_activation_outcomes
  add constraint cognitive_visual_outcome_target_pair_check check (
    (target_task_id is null and target_platform is null)
    or (target_task_id is not null and target_platform = 'android')
  ),
  add constraint cognitive_visual_outcome_target_task_fk foreign key (
    target_task_id, project_id, target_platform, environment
  ) references public.intelligence_tasks(
    id, project_id, platform, environment
  );

create function
  public.governance_prepare_provider_independent_visual_platform_scopes(
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
  policy_version_value constant text := 'collective-governance-v1';
  source_commit_value constant text :=
    '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a';
  retention_hash_value constant text :=
    'f97c69b112f9e8ffcc133e2da052988a4cacd9790717e7f099a92e3f5d5f39f0';
  scope_hash_value text;
  result_value jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'provider-independent-visual-platform-scopes:'
        || p_shared_task_id::text,
      0
    )
  );

  if not public.governance_approval_emergency_active()
     or exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_shared_task_id
         and switch.project_id = p_project_id
         and switch.platform = 'shared'
         and switch.environment = 'production'
         and switch.enabled
     )
     or exists (
       select 1
       from public.cognitive_level01_schedule_definitions schedule
       where schedule.task_id = p_shared_task_id
         and schedule.project_id = p_project_id
         and schedule.enabled
     )
     or not exists (
       select 1
       from public.cognitive_retention_policy_states policy
       where policy.task_id = p_shared_task_id
         and policy.project_id = p_project_id
         and policy.platform = 'shared'
         and policy.environment = 'production'
         and policy.policy_hash = retention_hash_value
         and policy.policy_state = 'owner_counsel_decision_required'
         and not policy.user_derived_memory_allowed
         and not policy.raw_user_reports_allowed
         and not policy.raw_private_messages_allowed
         and not policy.raw_private_media_allowed
         and not policy.raw_user_analytics_allowed
         and not policy.private_model_input_allowed
     ) then
    raise exception 'provider_independent_visual_platform_scope_rejected'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.cognitive_product_sentinel_platform_scopes scope
    where scope.shared_task_id = p_shared_task_id
  ) then
    if not exists (
      select 1
      from public.cognitive_governance_switches switch
      join public.cognitive_provider_independent_visual_activation_outcomes
        outcome
        on outcome.task_id = switch.task_id
       and outcome.project_id = switch.project_id
       and outcome.platform = switch.platform
       and outcome.environment = switch.environment
      where switch.task_id = p_shared_task_id
        and switch.project_id = p_project_id
        and switch.platform = 'shared'
        and switch.environment = 'production'
        and switch.switch_key =
          'cognitive_visual_experience_sentinel_enabled'
        and not switch.enabled
        and switch.policy_version =
          'provider-independent-visual-canary-rolled-back-v1'
        and not outcome.enabled
        and outcome.sentinel_run_count = 0
        and outcome.evaluator_proof_count = 0
        and outcome.triage_consumption_count = 0
        and outcome.finding_event_count = 0
    ) then
      raise exception 'provider_independent_visual_platform_scope_rejected'
        using errcode = 'P0001';
    end if;

    update public.cognitive_governance_switches
    set policy_version = policy_version_value,
        enabled_by = null,
        enabled_at = null,
        disabled_at = transaction_timestamp(),
        updated_at = transaction_timestamp()
    where task_id = p_shared_task_id
      and project_id = p_project_id
      and platform = 'shared'
      and environment = 'production'
      and switch_key = 'cognitive_visual_experience_sentinel_enabled'
      and not enabled
      and policy_version =
        'provider-independent-visual-canary-rolled-back-v1';

    if not found then
      raise exception 'provider_independent_visual_platform_scope_rejected'
        using errcode = 'P0001';
    end if;
  end if;

  scope_hash_value :=
    public.governance_product_sentinel_platform_scope_hash(
      p_shared_task_id,
      p_project_id,
      source_commit_value,
      policy_version_value,
      retention_hash_value
    );
  result_value :=
    public.governance_materialize_product_sentinel_platform_scopes(
      p_shared_task_id,
      p_project_id,
      source_commit_value,
      policy_version_value,
      retention_hash_value,
      scope_hash_value
    );

  return result_value || jsonb_build_object(
    'preparedBy', owner_id,
    'targetPlatform', 'android'
  );
end;
$$;

revoke all on function
  public.governance_prepare_provider_independent_visual_platform_scopes(
    uuid,uuid
  )
from public,anon,service_role;
grant execute on function
  public.governance_prepare_provider_independent_visual_platform_scopes(
    uuid,uuid
  )
to authenticated;

create or replace function
  public.governance_open_provider_independent_visual_canary(
    p_task_id uuid,
    p_project_id uuid,
    p_worker_source_commit text,
    p_worker_source_tree text,
    p_worker_source_module_graph_hash text,
    p_independent_review_hash text,
    p_tests_hash text,
    p_deployment_plan_hash text,
    p_rollback_hash text,
    p_validity interval default interval '30 minutes'
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  baseline_value public.product_experience_baseline_versions%rowtype;
  approval_version public.governance_owner_approval_versions%rowtype;
  approval_state public.governance_owner_approval_version_states%rowtype;
  approval_record public.governance_owner_approval_records%rowtype;
  target_scope public.cognitive_product_sentinel_platform_scopes%rowtype;
  target_switch public.cognitive_governance_switches%rowtype;
  authorization_id uuid := gen_random_uuid();
  authorization_hash_value text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
begin
  select * into target_scope
  from public.cognitive_product_sentinel_platform_scopes scope
  where scope.shared_task_id = p_task_id
    and scope.project_id = p_project_id
    and scope.platform = 'android'
    and scope.environment = 'production'
    and scope.source_commit =
      '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a'
    and scope.policy_version = 'collective-governance-v1'
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

  select baseline.* into baseline_value
  from public.product_experience_baseline_versions baseline
  where baseline.task_id = p_task_id
    and baseline.project_id = p_project_id
    and baseline.platform = 'shared'
    and baseline.environment = 'production'
    and baseline.baseline_identifier =
      'chillywood-product-experience-baseline-v1'
    and baseline.baseline_option = 'C'
    and baseline.baseline_option_name = 'creator_balanced'
    and baseline.baseline_hash =
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
    and baseline.status = 'owner_approved'
    and baseline.approved_at is not null
  for share;

  select * into approval_version
  from public.governance_owner_approval_versions version
  where version.id = baseline_value.owner_approval_version_id
  for share;
  select * into approval_state
  from public.governance_owner_approval_version_states state
  where state.approval_version_id = approval_version.id
  for share;
  select * into approval_record
  from public.governance_owner_approval_records record
  where record.id = approval_version.approval_record_id
  for share;

  if target_scope.id is null
     or target_switch.id is null
     or target_switch.enabled
     or target_switch.policy_version <> 'collective-governance-v1'
     or p_worker_source_commit <>
        '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a'
     or p_worker_source_tree <>
        'cc040ff917f762d2c3d5e944202a00f7c68734cb'
     or p_worker_source_module_graph_hash <>
        'd9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f'
     or p_independent_review_hash !~ '^[a-f0-9]{64}$'
     or p_tests_hash !~ '^[a-f0-9]{64}$'
     or p_deployment_plan_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '30 minutes'
     or baseline_value.id is null
     or approval_version.id is null
     or approval_version.version_number <> 3
     or approval_version.source_commit <> p_worker_source_commit
     or approval_version.architecture_graph_digest <>
        p_worker_source_module_graph_hash
     or approval_version.repository_full_name <>
        'Chillywood2025/chillywood-mobile'
     or approval_version.branch_name <>
        'codex/cognitive-level01-staged-worker-activation'
     or approval_version.operation <> 'visual_experience_canary'
     or approval_version.maximum_executions <> 1
     or approval_state.state <> 'completed'
     or approval_state.executions_claimed <> 1
     or approval_state.executions_completed <> 1
     or approval_record.current_version <> 3
     or approval_record.current_state <> 'completed'
     or approval_record.executions_claimed <> 1
     or approval_record.executions_completed <> 1
     or (
       select count(*)
       from public.product_experience_baseline_versions baseline
       where baseline.task_id = p_task_id
         and baseline.project_id = p_project_id
         and baseline.platform = 'shared'
         and baseline.environment = 'production'
         and baseline.status = 'owner_approved'
     ) <> 1
     or (
       select count(*)
       from public.cognitive_product_sentinel_platform_scopes scope
       where scope.shared_task_id = p_task_id
         and scope.project_id = p_project_id
         and scope.platform in ('android','ios')
     ) <> 2
     or not exists (
       select 1
       from public.autonomous_system_emergency_states emergency
       where emergency.system_id = 'product_intelligence_operator'
         and emergency.status = 'active'
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
       where authorization_row.task_id = p_task_id
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
       from public.governance_two_party_service_assertions assertion
       where assertion.service_identity in (
         'product_experience_baseline_service',
         'cognitive_product_quality_evaluator'
       )
         and assertion.status = 'active'
         and assertion.revoked_at is null
         and now_at < assertion.expires_at
     ) <> 2
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
         and now_at < capability.expires_at
         and public.governance_exact_owner(capability.registered_by)
         and not exists (
           select 1
           from public.cognitive_product_quality_service_capability_revocations
             revocation
           where revocation.capability_id = capability.id
         )
     ) <> 2 then
    raise exception 'provider_independent_visual_canary_authorization_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := now_at + p_validity;
  authorization_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'provider-independent-android-visual-canary-authorization-v2',
    authorization_id::text, p_task_id::text, p_project_id::text,
    target_scope.platform_task_id::text, target_scope.platform::text,
    owner_id::text, baseline_value.id::text, approval_version.id::text,
    p_worker_source_commit, p_worker_source_tree,
    p_worker_source_module_graph_hash, p_independent_review_hash,
    p_tests_hash, p_deployment_plan_hash, p_rollback_hash,
    now_at::text, expires_at_value::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.cognitive_provider_independent_visual_canary_authorizations(
    id, task_id, project_id, platform, environment, owner_user_id,
    baseline_version_id, owner_approval_version_id,
    worker_source_commit, worker_source_tree,
    worker_source_module_graph_hash, independent_review_hash, tests_hash,
    deployment_plan_hash, rollback_hash, authorization_hash,
    opened_at, expires_at, target_task_id, target_platform
  ) values (
    authorization_id, p_task_id, p_project_id, 'shared', 'production',
    owner_id, baseline_value.id, approval_version.id,
    p_worker_source_commit, p_worker_source_tree,
    p_worker_source_module_graph_hash, p_independent_review_hash,
    p_tests_hash, p_deployment_plan_hash, p_rollback_hash,
    authorization_hash_value, now_at, expires_at_value,
    target_scope.platform_task_id, target_scope.platform
  );

  update public.cognitive_governance_switches
  set enabled = true,
      policy_version = 'provider-independent-visual-canary-v2',
      enabled_by = owner_id,
      enabled_at = now_at,
      disabled_at = null,
      updated_at = now_at
  where id = target_switch.id;

  return jsonb_build_object(
    'authorizationId', authorization_id,
    'authorizationHash', authorization_hash_value,
    'switchKey', target_switch.switch_key,
    'enabled', true,
    'policyVersion', 'provider-independent-visual-canary-v2',
    'baselineVersionId', baseline_value.id,
    'ownerApprovalVersionId', approval_version.id,
    'targetTaskId', target_scope.platform_task_id,
    'targetPlatform', target_scope.platform,
    'openedAt', now_at,
    'expiresAt', expires_at_value
  );
end;
$$;

create or replace function
  public.governance_finalize_provider_independent_visual_canary(
    p_authorization_id uuid,
    p_enable boolean,
    p_canary_receipt_hash text,
    p_emergency_stop_receipt_hash text,
    p_rollback_receipt_hash text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  authorization_value
    public.cognitive_provider_independent_visual_canary_authorizations%rowtype;
  target_switch public.cognitive_governance_switches%rowtype;
  sentinel_run_count_value integer := 0;
  evaluator_proof_count_value integer := 0;
  triage_consumption_count_value integer := 0;
  finding_event_count_value integer := 0;
  outcome_id uuid := gen_random_uuid();
  outcome_hash_value text;
  now_at timestamptz := transaction_timestamp();
begin
  select * into authorization_value
  from public.cognitive_provider_independent_visual_canary_authorizations value
  where value.id = p_authorization_id
  for share;

  select * into target_switch
  from public.cognitive_governance_switches switch
  where switch.task_id = authorization_value.target_task_id
    and switch.project_id = authorization_value.project_id
    and switch.platform = authorization_value.target_platform
    and switch.environment = authorization_value.environment
    and switch.switch_key =
      'cognitive_visual_experience_sentinel_enabled'
  for update;

  if authorization_value.id is null
     or authorization_value.owner_user_id <> owner_id
     or authorization_value.target_task_id is null
     or authorization_value.target_platform <> 'android'
     or target_switch.id is null
     or not target_switch.enabled
     or target_switch.policy_version <>
        'provider-independent-visual-canary-v2'
     or (p_enable and now_at >= authorization_value.expires_at)
     or p_canary_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_emergency_stop_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_receipt_hash !~ '^[a-f0-9]{64}$'
     or exists (
       select 1
       from public.cognitive_provider_independent_visual_activation_outcomes
         outcome
       where outcome.authorization_id = authorization_value.id
     ) then
    raise exception 'provider_independent_visual_canary_finalization_rejected'
      using errcode = 'P0001';
  end if;

  if p_enable then
    select count(*)::integer into sentinel_run_count_value
    from public.product_experience_sentinel_runs run
    where run.task_id = authorization_value.target_task_id
      and run.project_id = authorization_value.project_id
      and run.platform = authorization_value.target_platform
      and run.environment = authorization_value.environment
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at
      and run.erased_at is null;

    select count(*)::integer into evaluator_proof_count_value
    from public.product_experience_sentinel_evaluator_proofs proof
    join public.product_experience_sentinel_runs run
      on run.id = proof.sentinel_run_id
    where run.task_id = authorization_value.target_task_id
      and run.project_id = authorization_value.project_id
      and run.platform = authorization_value.target_platform
      and run.environment = authorization_value.environment
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at
      and proof.verdict = 'passed'
      and proof.assessment_kind in (
        'finding_detection','run_no_finding','finding_resolution'
      );

    select count(*)::integer into triage_consumption_count_value
    from public.product_experience_sentinel_evaluator_proof_consumptions
      consumption
    join public.product_experience_sentinel_evaluator_proofs proof
      on proof.id = consumption.evaluator_proof_id
    join public.product_experience_sentinel_runs run
      on run.id = proof.sentinel_run_id
    where run.task_id = authorization_value.target_task_id
      and run.project_id = authorization_value.project_id
      and run.platform = authorization_value.target_platform
      and run.environment = authorization_value.environment
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at;

    select count(*)::integer into finding_event_count_value
    from public.product_quality_finding_events event
    join public.product_experience_sentinel_runs run
      on run.id = event.sentinel_run_id
    where run.task_id = authorization_value.target_task_id
      and run.project_id = authorization_value.project_id
      and run.platform = authorization_value.target_platform
      and run.environment = authorization_value.environment
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at;

    if sentinel_run_count_value < 3
       or evaluator_proof_count_value < 3
       or triage_consumption_count_value < 3
       or finding_event_count_value < 2
       or exists (
         select required.assessment_kind
         from (
           values
             ('finding_detection'),
             ('run_no_finding'),
             ('finding_resolution')
         ) required(assessment_kind)
         where not exists (
           select 1
           from public.product_experience_sentinel_evaluator_proofs proof
           join public.product_experience_sentinel_runs run
             on run.id = proof.sentinel_run_id
           join public.product_experience_sentinel_evaluator_proof_consumptions
             consumption
             on consumption.evaluator_proof_id = proof.id
           where run.task_id = authorization_value.target_task_id
             and run.project_id = authorization_value.project_id
             and run.platform = authorization_value.target_platform
             and run.environment = authorization_value.environment
             and run.sentinel_key =
               'visual_product_experience_sentinel'
             and run.created_at >= authorization_value.opened_at
             and proof.assessment_kind = required.assessment_kind
             and proof.verdict = 'passed'
         )
       )
       or not exists (
         select 1
         from public.product_experience_sentinel_runs run
         where run.task_id = authorization_value.target_task_id
           and run.project_id = authorization_value.project_id
           and run.platform = authorization_value.target_platform
           and run.environment = authorization_value.environment
           and run.sentinel_key = 'visual_product_experience_sentinel'
           and run.created_at >= authorization_value.opened_at
           and run.result_status = 'failed'
       )
       or (
         select count(*)
         from public.product_experience_sentinel_runs run
         where run.task_id = authorization_value.target_task_id
           and run.project_id = authorization_value.project_id
           and run.platform = authorization_value.target_platform
           and run.environment = authorization_value.environment
           and run.sentinel_key = 'visual_product_experience_sentinel'
           and run.created_at >= authorization_value.opened_at
           and run.result_status = 'passed'
       ) < 2
       or not exists (
         select 1
         from public.product_quality_findings finding
         join public.product_experience_sentinel_runs run
           on run.id = finding.sentinel_run_id
         where run.task_id = authorization_value.target_task_id
           and run.project_id = authorization_value.project_id
           and run.platform = authorization_value.target_platform
           and run.environment = authorization_value.environment
           and run.created_at >= authorization_value.opened_at
           and finding.current_status = 'resolved'
       )
       or exists (
         select 1
         from public.product_quality_findings finding
         join public.product_experience_sentinel_runs run
           on run.id = finding.sentinel_run_id
         where run.task_id = authorization_value.target_task_id
           and run.project_id = authorization_value.project_id
           and run.platform = authorization_value.target_platform
           and run.environment = authorization_value.environment
           and run.created_at >= authorization_value.opened_at
           and finding.current_status = 'open'
       )
       or not exists (
         select 1
         from public.autonomous_system_control_events event
         where event.system_id = 'product_intelligence_operator'
           and event.event_type = 'emergency_paused'
           and event.created_at >= authorization_value.opened_at
       )
       or not exists (
         select 1
         from public.autonomous_system_control_events event
         where event.system_id = 'product_intelligence_operator'
           and event.event_type = 'emergency_resumed'
           and event.created_at >= authorization_value.opened_at
       )
       or not exists (
         select 1
         from public.autonomous_system_emergency_states emergency
         where emergency.system_id = 'product_intelligence_operator'
           and emergency.status = 'active'
       )
       or exists (
         select 1
         from public.cognitive_governance_switches sibling
         where sibling.project_id = authorization_value.project_id
           and sibling.environment = authorization_value.environment
           and sibling.enabled
           and sibling.id <> target_switch.id
       )
       or exists (
         select 1
         from public.cognitive_level01_schedule_definitions schedule
         where schedule.project_id = authorization_value.project_id
           and schedule.environment = authorization_value.environment
           and schedule.enabled
       ) then
      raise exception 'provider_independent_visual_canary_finalization_rejected'
        using errcode = 'P0001';
    end if;
  end if;

  outcome_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'provider-independent-android-visual-canary-outcome-v2',
    outcome_id::text, authorization_value.id::text, owner_id::text,
    authorization_value.target_task_id::text,
    authorization_value.target_platform::text,
    p_enable::text, sentinel_run_count_value::text,
    evaluator_proof_count_value::text,
    triage_consumption_count_value::text, finding_event_count_value::text,
    p_canary_receipt_hash, p_emergency_stop_receipt_hash,
    p_rollback_receipt_hash, now_at::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.cognitive_provider_independent_visual_activation_outcomes(
    id, authorization_id, task_id, project_id, platform, environment,
    owner_user_id, enabled, sentinel_run_count, evaluator_proof_count,
    triage_consumption_count, finding_event_count, canary_receipt_hash,
    emergency_stop_receipt_hash, rollback_receipt_hash, outcome_hash,
    created_at, target_task_id, target_platform
  ) values (
    outcome_id, authorization_value.id, authorization_value.task_id,
    authorization_value.project_id, authorization_value.platform,
    authorization_value.environment, owner_id, p_enable,
    sentinel_run_count_value, evaluator_proof_count_value,
    triage_consumption_count_value, finding_event_count_value,
    p_canary_receipt_hash, p_emergency_stop_receipt_hash,
    p_rollback_receipt_hash, outcome_hash_value, now_at,
    authorization_value.target_task_id, authorization_value.target_platform
  );

  update public.cognitive_governance_switches
  set enabled = p_enable,
      policy_version = case
        when p_enable then 'provider-independent-visual-live-v2'
        else 'provider-independent-visual-canary-rolled-back-v2'
      end,
      enabled_by = case when p_enable then owner_id else null end,
      enabled_at = case when p_enable then enabled_at else null end,
      disabled_at = case when p_enable then null else now_at end,
      updated_at = now_at
  where id = target_switch.id;

  return jsonb_build_object(
    'outcomeId', outcome_id,
    'outcomeHash', outcome_hash_value,
    'authorizationId', authorization_value.id,
    'switchKey', target_switch.switch_key,
    'enabled', p_enable,
    'policyVersion', case
      when p_enable then 'provider-independent-visual-live-v2'
      else 'provider-independent-visual-canary-rolled-back-v2'
    end,
    'targetTaskId', authorization_value.target_task_id,
    'targetPlatform', authorization_value.target_platform,
    'sentinelRunCount', sentinel_run_count_value,
    'evaluatorProofCount', evaluator_proof_count_value,
    'triageConsumptionCount', triage_consumption_count_value,
    'findingEventCount', finding_event_count_value,
    'completedAt', now_at
  );
end;
$$;

create or replace function public.product_experience_lock_exact_sentinel_switch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  switch_key_value text;
  switch_enabled boolean := false;
  switch_policy_version text;
  canary_authorized boolean := false;
begin
  switch_key_value := case new.sentinel_key
    when 'livekit_experience_sentinel'
      then 'cognitive_livekit_experience_sentinel_enabled'
    when 'visual_product_experience_sentinel'
      then 'cognitive_visual_experience_sentinel_enabled'
    when 'installed_journey_sentinel'
      then 'cognitive_installed_journey_sentinel_enabled'
    else null
  end;

  select switch.enabled, switch.policy_version
  into switch_enabled, switch_policy_version
  from public.cognitive_governance_switches switch
  where switch.task_id = new.task_id
    and switch.project_id = new.project_id
    and switch.platform = new.platform
    and switch.environment = new.environment
    and switch.switch_key = switch_key_value
  for share;

  if switch_key_value is null or switch_enabled is distinct from true then
    raise exception 'product_experience_sentinel_switch_required'
      using errcode = '42501';
  end if;

  if new.sentinel_key = 'visual_product_experience_sentinel'
     and switch_policy_version in (
       'provider-independent-visual-canary-v1',
       'provider-independent-visual-canary-v2'
     ) then
    select exists (
      select 1
      from public.cognitive_provider_independent_visual_canary_authorizations
        authorization_row
      where authorization_row.project_id = new.project_id
        and authorization_row.environment = new.environment
        and (
          (
            switch_policy_version =
              'provider-independent-visual-canary-v1'
            and authorization_row.task_id = new.task_id
            and authorization_row.platform = new.platform
          )
          or (
            switch_policy_version =
              'provider-independent-visual-canary-v2'
            and authorization_row.target_task_id = new.task_id
            and authorization_row.target_platform = new.platform
          )
        )
        and transaction_timestamp() < authorization_row.expires_at
        and not exists (
          select 1
          from public.cognitive_provider_independent_visual_activation_outcomes
            outcome
          where outcome.authorization_id = authorization_row.id
        )
    ) into canary_authorized;

    if not canary_authorized then
      raise exception 'product_experience_visual_canary_expired'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function
  public.governance_open_provider_independent_visual_canary(
    uuid,uuid,text,text,text,text,text,text,text,interval
  )
from public,anon,service_role;
grant execute on function
  public.governance_open_provider_independent_visual_canary(
    uuid,uuid,text,text,text,text,text,text,text,interval
  )
to authenticated;

revoke all on function
  public.governance_finalize_provider_independent_visual_canary(
    uuid,boolean,text,text,text
  )
from public,anon,service_role;
grant execute on function
  public.governance_finalize_provider_independent_visual_canary(
    uuid,boolean,text,text,text
  )
to authenticated;

revoke all on function public.product_experience_lock_exact_sentinel_switch()
from public,anon,authenticated,service_role;

comment on function
  public.governance_prepare_provider_independent_visual_platform_scopes(
    uuid,uuid
  ) is
  'Repairs only the zero-run shared-canary rollback metadata and materializes exact disabled Android/iOS sentinel scopes.';
