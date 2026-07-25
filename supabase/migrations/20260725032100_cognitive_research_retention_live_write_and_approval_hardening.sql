-- Close the two fail-closed research-retention review findings without
-- rewriting the deployed retention processor migration.
--
-- 1. Every live public-research source, claim, evaluation, contradiction
--    detection, and contradiction resolution already enters through
--    cognitive_public_research_runtime_ready. Preserve that function's OID and
--    all of its locked liveness checks while requiring a current, unrevoked,
--    unexpired retention processor and fresh maintenance heartbeat.
-- 2. Bind provider evidence time and attestation expiry into the exact
--    activation target hash. Persistence now requires one current exact Owner
--    approval, one completed execution inside that approval, one matching
--    independent evaluator proof/receipt, a live task and emergency state, and
--    an expiry no later than the Owner approval.
--
-- This migration enables no switch or schedule and grants no new operation.

create function public.governance_research_retention_activation_hash(
  p_source_commit text,
  p_worker_version_hash text,
  p_provider_configuration_hash text,
  p_provider_evidence_hash text,
  p_retention_policy_hash text,
  p_provider_verified_at timestamptz,
  p_expires_at timestamptz
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws(
    '|',
    'chillywood-research-retention-processor-v2',
    'Chillywood2025/chillywood-mobile',
    p_source_commit,
    'cloudflare_workers',
    'chillywood-level01-public-research-broker',
    'cognitive_public_research_broker',
    '17 * * * *',
    'UTC',
    '100',
    '1',
    '50000',
    '7200',
    'chillywood-cognitive-retention-v1',
    p_retention_policy_hash,
    p_worker_version_hash,
    p_provider_configuration_hash,
    'supabase',
    'free',
    'provider_project_backups_absent',
    '0',
    'false',
    'false',
    'true',
    p_provider_evidence_hash,
    extract(epoch from p_provider_verified_at)::text,
    extract(epoch from p_expires_at)::text
  ), 'UTF8'), 'sha256'), 'hex')
$$;

revoke all on function
  public.governance_research_retention_activation_hash(
    text,text,text,text,text,timestamptz,timestamptz
  )
from public,anon,authenticated,service_role;

comment on function public.governance_research_retention_activation_hash(
  text,text,text,text,text,timestamptz,timestamptz
) is
  'Exact v2 research-retention activation hash. It binds provider evidence time and attestation expiry in addition to the reviewed provider, worker, schedule, policy, and source contract.';

create or replace function public.governance_persist_research_retention_activation(
  p_execution_id uuid,
  p_source_commit text,
  p_worker_version_hash text,
  p_provider_configuration_hash text,
  p_provider_evidence_hash text,
  p_provider_verified_at timestamptz,
  p_retention_policy_hash text,
  p_expires_at timestamptz,
  p_service_identity text,
  p_worker_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  version_value public.governance_owner_approval_versions%rowtype;
  version_state_value public.governance_owner_approval_version_states%rowtype;
  approval_value public.governance_owner_approval_records%rowtype;
  decision_value public.governance_decision_manifests%rowtype;
  proof_value public.governance_approved_execution_evaluator_proofs%rowtype;
  task_value public.intelligence_tasks%rowtype;
  emergency_value public.autonomous_system_emergency_states%rowtype;
  backup_id_value uuid;
  processor_id_value uuid;
  activation_hash_value text;
  approved_execution_count integer;
  service_identity_value text;
  now_at timestamptz := transaction_timestamp();
begin
  service_identity_value :=
    public.governance_assert_two_party_service_principal(
      p_service_identity,p_worker_assertion,'public_research_ingest'
    );

  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = p_execution_id
  for update;

  if execution_value.id is null then
    raise exception 'research_retention_activation_attestation_rejected'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        '|',
        'research_retention_activation',
        execution_value.task_id::text,
        execution_value.project_id::text,
        execution_value.platform::text,
        execution_value.environment::text,
        execution_value.approval_version_id::text
      ),
      0
    )
  );

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

  select * into task_value
  from public.intelligence_tasks task
  where task.id = execution_value.task_id
    and task.project_id = execution_value.project_id
    and task.platform = execution_value.platform
    and task.environment = execution_value.environment
  for share;

  select * into emergency_value
  from public.autonomous_system_emergency_states emergency
  where emergency.system_id = 'product_intelligence_operator'
  for share;

  select count(*)::integer into approved_execution_count
  from public.governance_approved_action_executions execution
  where execution.approval_version_id = execution_value.approval_version_id;

  activation_hash_value :=
    public.governance_research_retention_activation_hash(
      p_source_commit,
      p_worker_version_hash,
      p_provider_configuration_hash,
      p_provider_evidence_hash,
      p_retention_policy_hash,
      p_provider_verified_at,
      p_expires_at
    );

  if service_identity_value <> 'cognitive_approved_action_worker'
     or execution_value.state <> 'completed'
     or execution_value.completed_at is null
     or execution_value.operation <> 'public_research_ingest'
     or execution_value.provider <> 'public_research'
     or execution_value.repository_full_name <>
       'Chillywood2025/chillywood-mobile'
     or execution_value.platform <> 'shared'
     or execution_value.environment <> 'production'
     or execution_value.service_identity <>
       'cognitive_approved_action_worker'
     or execution_value.execution_receipt_hash is null
     or execution_value.evaluator_proof_hash is null
     or execution_value.target_resource_hash <> activation_hash_value
     or task_value.id is null
     or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or now_at >= task_value.deadman_at
     or emergency_value.system_id is null
     or emergency_value.status <> 'active'
     or version_value.id is null
     or version_state_value.approval_version_id is null
     or approval_value.id is null
     or decision_value.id is null
     or proof_value.id is null
     or version_value.id <> execution_value.approval_version_id
     or version_value.approval_record_id <>
        execution_value.approval_record_id
     or version_value.decision_manifest_id <> approval_value.decision_manifest_id
     or not public.governance_exact_owner(version_value.owner_user_id)
     or version_value.task_id <> execution_value.task_id
     or version_value.project_id <> execution_value.project_id
     or version_value.platform <> execution_value.platform
     or version_value.environment <> execution_value.environment
     or version_value.repository_full_name <>
        execution_value.repository_full_name
     or version_value.branch_name <> execution_value.branch_name
     or version_value.provider <> execution_value.provider
     or version_value.operation <> execution_value.operation
     or version_value.provider <> 'public_research'
     or version_value.operation <> 'public_research_ingest'
     or version_value.target_resource_hash <> activation_hash_value
     or version_value.source_commit <> p_source_commit
     or version_value.maximum_executions <> 1
     or version_value.approval_hash <> execution_value.approval_hash
     or version_value.plan_snapshot_hash <> execution_value.plan_snapshot_hash
     or version_value.budget_hash <> execution_value.budget_hash
     or version_value.tests_hash <> execution_value.tests_hash
     or version_value.evaluator_requirement_hash <>
        execution_value.evaluator_requirement_hash
     or version_value.rollback_hash <> execution_value.rollback_hash
     or execution_value.completed_at < version_value.valid_from
     or execution_value.completed_at >= version_value.expires_at
     or now_at < version_value.valid_from
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
     or approval_value.owner_user_id <> version_value.owner_user_id
     or approval_value.task_id <> execution_value.task_id
     or approval_value.project_id <> execution_value.project_id
     or approval_value.platform <> execution_value.platform
     or approval_value.environment <> execution_value.environment
     or approval_value.current_version <> version_value.version_number
     or approval_value.current_state <> 'completed'
     or approval_value.maximum_executions <> 1
     or approval_value.executions_claimed <> 1
     or approval_value.executions_completed <> 1
     or approval_value.approval_hash <> execution_value.approval_hash
     or decision_value.task_id <> execution_value.task_id
     or decision_value.project_id <> execution_value.project_id
     or decision_value.platform <> execution_value.platform
     or decision_value.environment <> execution_value.environment
     or decision_value.status <> 'finalized'
     or decision_value.source_commit <> p_source_commit
     or decision_value.decision_hash <>
        execution_value.decision_manifest_hash
     or decision_value.decision_hash <>
        version_value.decision_manifest_hash
     or decision_value.selected_option_hash <> activation_hash_value
     or decision_value.maximum_executions <> 1
     or now_at >= decision_value.expires_at
     or proof_value.approval_record_id <>
        execution_value.approval_record_id
     or proof_value.approval_version_id <>
        execution_value.approval_version_id
     or proof_value.task_id <> execution_value.task_id
     or proof_value.project_id <> execution_value.project_id
     or proof_value.platform <> execution_value.platform
     or proof_value.environment <> execution_value.environment
     or proof_value.evaluator_identity <>
        'cognitive_independent_evaluator'
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
     or approved_execution_count <> 1
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_worker_version_hash !~ '^[a-f0-9]{64}$'
     or p_provider_configuration_hash !~ '^[a-f0-9]{64}$'
     or p_provider_evidence_hash !~ '^[a-f0-9]{64}$'
     or p_retention_policy_hash !~ '^[a-f0-9]{64}$'
     or p_provider_verified_at < version_value.valid_from
     or p_provider_verified_at < execution_value.claimed_at
     or p_provider_verified_at > execution_value.completed_at
     or p_provider_verified_at < now_at - interval '15 minutes'
     or p_provider_verified_at > now_at + interval '5 minutes'
     or p_expires_at <= now_at
     or p_expires_at > version_value.expires_at
     or p_expires_at > p_provider_verified_at + interval '7 days'
     or not exists (
       select 1
       from public.cognitive_retention_policy_states policy
       where policy.task_id = execution_value.task_id
         and policy.project_id = execution_value.project_id
         and policy.platform = execution_value.platform
         and policy.environment = execution_value.environment
         and policy.policy_hash = p_retention_policy_hash
         and policy.policy_state = 'owner_counsel_decision_required'
         and not policy.user_derived_memory_allowed
         and not policy.raw_user_reports_allowed
         and not policy.raw_private_messages_allowed
         and not policy.raw_private_media_allowed
         and not policy.raw_user_analytics_allowed
         and not policy.private_model_input_allowed
     ) then
    raise exception 'research_retention_activation_attestation_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_research_backup_retention_attestations(
    execution_id,evaluator_proof_id,task_id,project_id,platform,environment,
    provider,provider_plan,backup_state,backup_window_days,restore_available,
    point_in_time_recovery,restored_data_requires_tombstone_replay,
    provider_evidence_hash,provider_verified_at,expires_at
  ) values (
    execution_value.id,proof_value.id,execution_value.task_id,
    execution_value.project_id,execution_value.platform,
    execution_value.environment,'supabase','free',
    'provider_project_backups_absent',0,false,false,true,
    p_provider_evidence_hash,p_provider_verified_at,p_expires_at
  ) returning id into backup_id_value;

  insert into public.cognitive_research_retention_processor_attestations(
    execution_id,evaluator_proof_id,backup_attestation_id,task_id,project_id,
    platform,environment,repository_full_name,source_commit,runtime_provider,
    worker_name,runtime_principal,database_role,schedule_cron,
    schedule_timezone,batch_limit,maximum_batches,timeout_ms,
    maximum_lag_seconds,retention_policy_id,retention_policy_hash,
    worker_version_hash,provider_configuration_hash,attestation_hash,expires_at
  ) values (
    execution_value.id,proof_value.id,backup_id_value,execution_value.task_id,
    execution_value.project_id,execution_value.platform,
    execution_value.environment,'Chillywood2025/chillywood-mobile',
    p_source_commit,'cloudflare_workers',
    'chillywood-level01-public-research-broker',
    'cognitive_public_research_broker','cognitive_public_research_broker',
    '17 * * * *','UTC',100,1,50000,7200,
    'chillywood-cognitive-retention-v1',p_retention_policy_hash,
    p_worker_version_hash,p_provider_configuration_hash,
    activation_hash_value,p_expires_at
  ) returning id into processor_id_value;

  return jsonb_build_object(
    'backup_attestation_id',backup_id_value,
    'processor_attestation_id',processor_id_value,
    'attestation_hash',activation_hash_value,
    'provider_verified_at',p_provider_verified_at,
    'expires_at',p_expires_at,
    'backup_state','provider_project_backups_absent',
    'backup_window_days',0,
    'restore_available',false,
    'point_in_time_recovery',false
  );
end;
$$;

revoke all on function
  public.governance_persist_research_retention_activation(
    uuid,text,text,text,text,timestamptz,text,timestamptz,text,text
  )
from public,anon,authenticated;
grant execute on function
  public.governance_persist_research_retention_activation(
    uuid,text,text,text,text,timestamptz,text,timestamptz,text,text
  )
to service_role;

comment on function public.governance_persist_research_retention_activation(
  uuid,text,text,text,text,timestamptz,text,timestamptz,text,text
) is
  'Persists one exact research-retention processor attestation only from a current single-execution Owner approval, matching completed worker receipt, independent proof, live task/emergency state, and timestamp-bound v2 activation hash.';

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
  retention_policy_ready boolean:=false;
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
  into retention_policy_ready
  from public.cognitive_retention_policy_states policy
  where policy.task_id=p_task_id
    and policy.project_id=p_project_id
    and policy.platform=p_platform
    and policy.environment=p_environment
    and policy.policy_state='owner_counsel_decision_required'
  for share;

  if not coalesce(retention_policy_ready,false) then
    return false;
  end if;

  return public.cognitive_research_retention_processor_ready(
    p_task_id,p_project_id,p_platform,p_environment
  );
end;
$$;

revoke all on function public.cognitive_public_research_runtime_ready(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public,anon,authenticated,service_role;

comment on function public.cognitive_public_research_runtime_ready(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) is
  'Locks and rechecks the exact task, emergency, research, memory, user-derived-memory, retention-policy rows, then requires a current unrevoked retention processor, provider evidence, and fresh heartbeat for every public-research write/evaluation transaction.';
