-- Bind the one reviewed Android visual retry to the exact Worker source that
-- preserves the metric manifest as a JSONB object. Historical authorizations
-- remain bound to the prior source tuple and are not rewritten.

alter table public.cognitive_provider_independent_visual_canary_authorizations
  drop constraint
    cognitive_provider_independent_visua_worker_source_commit_check,
  drop constraint
    cognitive_provider_independent_visual__worker_source_tree_check,
  drop constraint
    cognitive_provider_independe_worker_source_module_graph_h_check;

alter table public.cognitive_provider_independent_visual_canary_authorizations
  add constraint cognitive_visual_canary_worker_source_tuple_check check (
    (
      worker_source_commit =
        '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a'
      and worker_source_tree =
        'cc040ff917f762d2c3d5e944202a00f7c68734cb'
      and worker_source_module_graph_hash =
        'd9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f'
    )
    or (
      worker_source_commit =
        'e05ff68c426e2ccb1bc268e14e9e5d19ba64efa9'
      and worker_source_tree =
        '5295d907e6806883e1de2dda5626d8e3a129783d'
      and worker_source_module_graph_hash =
        '47779ee113dd79b7678569750aa2f96e4663e2e1ccc5b44262365817ce1611fb'
    )
  );

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
        'e05ff68c426e2ccb1bc268e14e9e5d19ba64efa9'
     or p_worker_source_tree <>
        '5295d907e6806883e1de2dda5626d8e3a129783d'
     or p_worker_source_module_graph_hash <>
        '47779ee113dd79b7678569750aa2f96e4663e2e1ccc5b44262365817ce1611fb'
     or p_independent_review_hash <>
        '32cfa7d5337b441d7bd9ae0cc7c673d05c28855195d19023ebfe4dd0fa56b8c7'
     or p_tests_hash <>
        'd6d518926b87636634be4db1db6e4e5a1fcbb1cc2bf40ad5188ec9073eebf22c'
     or p_deployment_plan_hash <>
        'c944d126fad70623dfe337dbd008bc1e48256725556503af3d25100cd6675022'
     or p_rollback_hash <>
        '02914c94f35a085e9a47b36f91142271f55a79417236467506a7a3c457090e53'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '30 minutes'
     or baseline_value.id is null
     or approval_version.id is null
     or approval_version.version_number <> 3
     or approval_version.source_commit <>
        '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a'
     or approval_version.architecture_graph_digest <>
        'd9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f'
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
    '|', 'provider-independent-android-visual-canary-authorization-v3',
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

comment on function
  public.governance_open_provider_independent_visual_canary(
    uuid,uuid,text,text,text,text,text,text,text,interval
  )
is
  'Opens only the reviewed Android JSONB-manifest repair canary while preserving the completed Option C source lineage and every prior authorization.';
