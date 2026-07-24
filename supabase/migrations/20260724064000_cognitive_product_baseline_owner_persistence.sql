-- Owner-only persistence for a selected Chi'llywood product-experience
-- baseline. The selected option must already be the exact target of a
-- completed product_experience_baseline_service execution with an independent
-- passed evaluator proof. This path records measurement governance only; it
-- does not grant UI, source, deployment, release, or repair authority.

alter table public.product_experience_baseline_versions
  add column approved_execution_id uuid,
  add column baseline_manifest_hash text,
  add column baseline_option text;

alter table public.product_experience_baseline_versions
  add constraint product_experience_baseline_versions_execution_unique
    unique (approved_execution_id),
  add constraint product_experience_baseline_versions_execution_scope_fk
    foreign key (
      approved_execution_id, task_id, project_id, platform, environment
    )
    references public.governance_approved_action_executions(
      id, task_id, project_id, platform, environment
    ),
  add constraint product_experience_baseline_versions_canonical_v1_check
    check (
      (
        approved_execution_id is null
        and baseline_manifest_hash is null
        and baseline_option is null
        and status <> 'owner_approved'
      )
      or (
        approved_execution_id is not null
        and baseline_manifest_hash =
          '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df'
        and baseline_option in ('A', 'B', 'C')
        and baseline_hash = case baseline_option
          when 'A' then
            '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9'
          when 'B' then
            '9e891de1b46cd19405b43178dbd34ed0ea1d96b4eebcc7b404f4f3d9f6ba3dc5'
          when 'C' then
            '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184'
          else null
        end
      )
    );

create function public.governance_owner_persist_product_experience_baseline(
  p_execution_id uuid,
  p_baseline_key text,
  p_selected_option text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  execution_value public.governance_approved_action_executions%rowtype;
  version_value public.governance_owner_approval_versions%rowtype;
  version_state_value public.governance_owner_approval_version_states%rowtype;
  approval_value public.governance_owner_approval_records%rowtype;
  decision_value public.governance_decision_manifests%rowtype;
  proof_value public.governance_approved_execution_evaluator_proofs%rowtype;
  existing_value public.product_experience_baseline_versions%rowtype;
  baseline_id_value uuid;
  baseline_version_value integer;
  approved_execution_count integer;
  now_at timestamptz := transaction_timestamp();
  manifest_hash_value constant text :=
    '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df';
  option_hash_value text := case p_selected_option
    when 'A' then
      '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9'
    when 'B' then
      '9e891de1b46cd19405b43178dbd34ed0ea1d96b4eebcc7b404f4f3d9f6ba3dc5'
    when 'C' then
      '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184'
    else null
  end;
begin
  if p_execution_id is null
     or p_baseline_key is null
     or p_baseline_key not in (
       'streaming_mobile_content_density',
       'livekit_experience_deadlines',
       'installed_journey_completion',
       'accessibility_dynamic_type'
     )
     or p_baseline_key <> 'streaming_mobile_content_density'
     or option_hash_value is null then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;

  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = p_execution_id
  for update;

  if execution_value.id is null then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;

  -- Serialize version allocation for the exact task and baseline key. The
  -- execution row lock separately makes replay of one execution idempotent.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        '|',
        'product_experience_baseline',
        execution_value.task_id::text,
        p_baseline_key
      ),
      0
    )
  );

  select * into existing_value
  from public.product_experience_baseline_versions baseline
  where baseline.approved_execution_id = p_execution_id
  for share;

  if existing_value.id is not null then
    if existing_value.task_id <> execution_value.task_id
       or existing_value.project_id <> execution_value.project_id
       or existing_value.platform <> execution_value.platform
       or existing_value.environment <> execution_value.environment
       or existing_value.baseline_key <> p_baseline_key
       or existing_value.baseline_hash <> option_hash_value
       or existing_value.baseline_manifest_hash <> manifest_hash_value
       or existing_value.baseline_option <> p_selected_option
       or existing_value.status <> 'owner_approved'
       or existing_value.owner_approval_version_id <>
          execution_value.approval_version_id then
      raise exception 'product_experience_baseline_persistence_rejected'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'baselineId', existing_value.id,
      'baselineVersion', existing_value.baseline_version,
      'baselineKey', existing_value.baseline_key,
      'baselineHash', existing_value.baseline_hash,
      'manifestHash', existing_value.baseline_manifest_hash,
      'selectedOption', existing_value.baseline_option,
      'approvedExecutionId', existing_value.approved_execution_id,
      'status', existing_value.status,
      'created', false
    );
  end if;

  select * into version_value
  from public.governance_owner_approval_versions version
  where version.id = execution_value.approval_version_id
  for share;

  select * into version_state_value
  from public.governance_owner_approval_version_states state
  where state.approval_version_id = execution_value.approval_version_id
  for share;

  select * into approval_value
  from public.governance_owner_approval_records approval
  where approval.id = execution_value.approval_record_id
  for share;

  select * into decision_value
  from public.governance_decision_manifests decision
  where decision.id = version_value.decision_manifest_id
  for share;

  select * into proof_value
  from public.governance_approved_execution_evaluator_proofs proof
  where proof.execution_id = execution_value.id
  for share;

  select count(*)::integer into approved_execution_count
  from public.governance_approved_action_executions execution
  where execution.approval_version_id = execution_value.approval_version_id;

  if version_value.id is null
     or version_state_value.approval_version_id is null
     or approval_value.id is null
     or decision_value.id is null
     or proof_value.id is null
     or execution_value.state <> 'completed'
     or execution_value.completed_at is null
     or execution_value.service_identity <>
        'product_experience_baseline_service'
     or execution_value.operation <> 'visual_experience_canary'
     or execution_value.provider <> 'visual_sentinel'
     or execution_value.target_resource_hash <> option_hash_value
     or execution_value.execution_receipt_hash is null
     or execution_value.evaluator_proof_hash is null
     or version_value.id <> execution_value.approval_version_id
     or version_value.approval_record_id <> execution_value.approval_record_id
     or version_value.owner_user_id <> owner_id
     or version_value.task_id <> execution_value.task_id
     or version_value.project_id <> execution_value.project_id
     or version_value.platform <> execution_value.platform
     or version_value.environment <> execution_value.environment
     or version_value.provider <> 'visual_sentinel'
     or version_value.operation <> 'visual_experience_canary'
     or version_value.target_resource_hash <> option_hash_value
     or version_value.maximum_executions <> 1
     or execution_value.completed_at < version_value.valid_from
     or execution_value.completed_at >= version_value.expires_at
     or now_at >= version_value.expires_at
     or version_state_value.approval_record_id <>
        execution_value.approval_record_id
     or version_state_value.task_id <> execution_value.task_id
     or version_state_value.project_id <> execution_value.project_id
     or version_state_value.platform <> execution_value.platform
     or version_state_value.environment <> execution_value.environment
     or version_state_value.state <> 'completed'
     or version_state_value.maximum_executions <> 1
     or version_state_value.executions_claimed <> 1
     or version_state_value.executions_completed <> 1
     or approval_value.owner_user_id <> owner_id
     or approval_value.task_id <> execution_value.task_id
     or approval_value.project_id <> execution_value.project_id
     or approval_value.platform <> execution_value.platform
     or approval_value.environment <> execution_value.environment
     or approval_value.current_version <> version_value.version_number
     or approval_value.current_state <> 'completed'
     or approval_value.maximum_executions <> 1
     or approval_value.executions_claimed <> 1
     or approval_value.executions_completed <> 1
     or decision_value.task_id <> execution_value.task_id
     or decision_value.project_id <> execution_value.project_id
     or decision_value.platform <> execution_value.platform
     or decision_value.environment <> execution_value.environment
     or decision_value.status <> 'finalized'
     or decision_value.decision_hash <> execution_value.decision_manifest_hash
     or decision_value.decision_hash <> version_value.decision_manifest_hash
     or decision_value.selected_option_hash <> option_hash_value
     or proof_value.approval_record_id <>
        execution_value.approval_record_id
     or proof_value.approval_version_id <>
        execution_value.approval_version_id
     or proof_value.task_id <> execution_value.task_id
     or proof_value.project_id <> execution_value.project_id
     or proof_value.platform <> execution_value.platform
     or proof_value.environment <> execution_value.environment
     or proof_value.evaluator_identity <> 'cognitive_independent_evaluator'
     or proof_value.evaluator_identity_hash =
        execution_value.service_identity_hash
     or proof_value.execution_receipt_hash <>
        execution_value.execution_receipt_hash
     or proof_value.evaluator_proof_hash <>
        execution_value.evaluator_proof_hash
     or proof_value.evaluator_requirement_hash <>
        execution_value.evaluator_requirement_hash
     or proof_value.verdict <> 'passed'
     or proof_value.created_at > execution_value.completed_at
     or approved_execution_count <> 1 then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;

  select coalesce(max(baseline.baseline_version), 0) + 1
    into baseline_version_value
  from public.product_experience_baseline_versions baseline
  where baseline.task_id = execution_value.task_id
    and baseline.project_id = execution_value.project_id
    and baseline.platform = execution_value.platform
    and baseline.environment = execution_value.environment
    and baseline.baseline_key = p_baseline_key;

  if baseline_version_value not between 1 and 1000 then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.product_experience_baseline_versions(
    task_id, project_id, platform, environment, baseline_key,
    baseline_version, baseline_hash, status, owner_approval_version_id,
    approved_execution_id, baseline_manifest_hash, baseline_option,
    approved_at, created_at
  ) values (
    execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment, p_baseline_key,
    baseline_version_value, option_hash_value, 'owner_approved',
    execution_value.approval_version_id, execution_value.id,
    manifest_hash_value, p_selected_option, now_at, now_at
  )
  returning id into baseline_id_value;

  return jsonb_build_object(
    'baselineId', baseline_id_value,
    'baselineVersion', baseline_version_value,
    'baselineKey', p_baseline_key,
    'baselineHash', option_hash_value,
    'manifestHash', manifest_hash_value,
    'selectedOption', p_selected_option,
    'approvedExecutionId', execution_value.id,
    'status', 'owner_approved',
    'created', true
  );
end;
$$;

revoke all on function
  public.governance_owner_persist_product_experience_baseline(uuid,text,text)
from public, anon, authenticated, service_role;

grant execute on function
  public.governance_owner_persist_product_experience_baseline(uuid,text,text)
to authenticated;
