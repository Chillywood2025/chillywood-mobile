-- Close the two independent-review research activation/retention P1s without
-- changing any existing signature, OID, or grant.
--
-- Provider evidence must exist before the exact Owner decision, approval, and
-- execution claim that hash-bind it.  Every isolated-runtime research mutation
-- also serializes with retention-processor revocation on one scope lock and
-- rechecks readiness using wall-clock time at the first mutation.
--
-- This migration enables no switch or schedule and grants no new operation.

alter table public.cognitive_research_backup_retention_attestations
  add constraint cognitive_research_backup_retention_temporal_v3_check
  check (
    provider_verified_at <= created_at + interval '5 minutes'
    and expires_at > provider_verified_at
    and expires_at > created_at
    and expires_at <= provider_verified_at + interval '7 days'
  );

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
  now_at timestamptz := clock_timestamp();
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

  -- Re-read wall-clock time after every potentially blocking lock/read and
  -- immediately before the activation mutation checks.
  now_at := clock_timestamp();

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
     -- Provider evidence is first collected, then hash-bound by the decision,
     -- Owner approval, claim, completion receipt, and evaluator proof.
     or p_provider_verified_at >= decision_value.created_at
     or p_provider_verified_at >= decision_value.finalized_at
     or p_provider_verified_at >= approval_value.created_at
     or p_provider_verified_at >= version_value.approved_at
     or p_provider_verified_at >= version_value.created_at
     or p_provider_verified_at >= execution_value.claimed_at
     or p_provider_verified_at <
        approval_value.created_at - interval '15 minutes'
     or p_provider_verified_at <
        version_value.approved_at - interval '15 minutes'
     or p_provider_verified_at < now_at - interval '15 minutes'
     or p_provider_verified_at > now_at + interval '5 minutes'
     or p_expires_at <= p_provider_verified_at
     or p_expires_at <= now_at
     or p_expires_at > version_value.expires_at
     or p_expires_at > p_provider_verified_at + interval '7 days'
     or exists (
       select 1
       from public.cognitive_research_backup_retention_attestations backup
       where backup.execution_id = execution_value.id
     )
     or exists (
       select 1
       from public.cognitive_research_retention_processor_attestations processor
       where processor.execution_id = execution_value.id
     )
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

comment on function public.governance_persist_research_retention_activation(
  uuid,text,text,text,text,timestamptz,text,timestamptz,text,text
) is
  'Persists one replay-protected research-retention processor attestation only when provider evidence predates and is hash-bound by the exact current Owner decision, approval, claim, completed receipt, and independent proof.';

create function public.cognitive_research_retention_scope_lock_key(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment
)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.hashtextextended(concat_ws(
    '|',
    'chillywood-public-research-live-write-v1',
    p_task_id::text,
    p_project_id::text,
    p_platform::text,
    p_environment::text
  ), 0)
$$;

revoke all on function public.cognitive_research_retention_scope_lock_key(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public,anon,authenticated,service_role;

create or replace function public.cognitive_research_retention_processor_ready(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  ready_value boolean;
begin
  select exists (
    select 1
    from public.cognitive_research_retention_processor_attestations processor
    join public.cognitive_research_backup_retention_attestations backup
      on backup.id = processor.backup_attestation_id
      and backup.task_id = processor.task_id
      and backup.project_id = processor.project_id
      and backup.platform = processor.platform
      and backup.environment = processor.environment
    join lateral (
      select heartbeat.*
      from public.cognitive_research_retention_processor_heartbeats heartbeat
      where heartbeat.processor_attestation_id = processor.id
      order by heartbeat.completed_at desc, heartbeat.id desc
      limit 1
    ) heartbeat on true
    where processor.task_id = p_task_id
      and processor.project_id = p_project_id
      and processor.platform = p_platform
      and processor.environment = p_environment
      and processor.runtime_principal = 'cognitive_public_research_broker'
      and processor.database_role = 'cognitive_public_research_broker'
      and processor.schedule_cron = '17 * * * *'
      and processor.batch_limit = 100
      and processor.maximum_batches = 1
      and processor.timeout_ms = 50000
      and processor.maximum_lag_seconds = 7200
      and backup.provider_verified_at <= now_at
      and now_at < processor.expires_at
      and now_at < backup.expires_at
      and backup.backup_state = 'provider_project_backups_absent'
      and backup.backup_window_days = 0
      and not backup.restore_available
      and not backup.point_in_time_recovery
      and backup.restored_data_requires_tombstone_replay
      and heartbeat.attestation_hash = processor.attestation_hash
      and heartbeat.completed_at >=
        now_at - make_interval(secs => processor.maximum_lag_seconds)
      and not exists (
        select 1
        from public.cognitive_research_retention_processor_revocations revocation
        where revocation.processor_attestation_id = processor.id
      )
      and exists (
        select 1
        from public.cognitive_retention_policy_states policy
        where policy.task_id = processor.task_id
          and policy.project_id = processor.project_id
          and policy.platform = processor.platform
          and policy.environment = processor.environment
          and policy.policy_hash = processor.retention_policy_hash
          and policy.policy_state = 'owner_counsel_decision_required'
          and not policy.user_derived_memory_allowed
          and not policy.raw_user_reports_allowed
          and not policy.raw_private_messages_allowed
          and not policy.raw_private_media_allowed
          and not policy.raw_user_analytics_allowed
          and not policy.private_model_input_allowed
      )
      and exists (
        select 1
        from public.cognitive_governance_switches switch
        where switch.task_id = processor.task_id
          and switch.project_id = processor.project_id
          and switch.platform = processor.platform
          and switch.environment = processor.environment
          and switch.switch_key = 'cognitive_user_derived_memory_enabled'
          and not switch.enabled
      )
  ) into ready_value;

  return coalesce(ready_value, false);
end;
$$;

comment on function public.cognitive_research_retention_processor_ready(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) is
  'Volatile wall-clock readiness for one current, unrevoked, unexpired research-retention processor, provider attestation, and fresh heartbeat.';

create function public.cognitive_research_live_write_lock_and_assert(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  now_at timestamptz;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'cognitive_research_live_write_isolation_rejected'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.cognitive_research_retention_scope_lock_key(
      p_task_id,p_project_id,p_platform,p_environment
    )
  );

  now_at := clock_timestamp();

  if not public.cognitive_public_research_runtime_ready(
       p_task_id,p_project_id,p_platform,p_environment
     )
     or not public.cognitive_research_retention_processor_ready(
       p_task_id,p_project_id,p_platform,p_environment
     )
     or not exists (
       select 1
       from public.intelligence_tasks task
       where task.id = p_task_id
         and task.project_id = p_project_id
         and task.platform = p_platform
         and task.environment = p_environment
         and task.cancelled_at is null
         and task.quarantined_at is null
         and now_at < task.deadman_at
     ) then
    raise exception 'cognitive_research_retention_processor_required'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.cognitive_research_live_write_lock_and_assert(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public,anon,authenticated,service_role;

create function public.cognitive_enforce_isolated_research_live_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- CI/staging fixtures remain non-live. Every effective production research
  -- path, including the legacy service-role bridge, crosses the same barrier.
  if new.platform <> 'shared'::public.cognitive_platform
     or new.environment <> 'production'::public.cognitive_environment then
    return new;
  end if;

  perform public.cognitive_research_live_write_lock_and_assert(
    new.task_id,new.project_id,new.platform,new.environment
  );
  return new;
end;
$$;

revoke all on function public.cognitive_enforce_isolated_research_live_write()
  from public,anon,authenticated,service_role;

create trigger cognitive_research_source_live_write_barrier
before insert on public.research_sources
for each row execute function
  public.cognitive_enforce_isolated_research_live_write();

create trigger cognitive_research_claim_live_write_barrier
before insert on public.research_claims
for each row execute function
  public.cognitive_enforce_isolated_research_live_write();

create trigger cognitive_research_evaluation_live_write_barrier
before insert on public.cognitive_subject_evidence_manifests
for each row
when (new.subject_type = 'research_claim')
execute function public.cognitive_enforce_isolated_research_live_write();

create trigger cognitive_research_contradiction_live_write_barrier
before insert on public.research_contradictions
for each row execute function
  public.cognitive_enforce_isolated_research_live_write();

create trigger cognitive_research_contradiction_event_live_write_barrier
before insert on public.cognitive_research_contradiction_events
for each row execute function
  public.cognitive_enforce_isolated_research_live_write();

create or replace function
  public.governance_revoke_research_retention_activation(
    p_execution_id uuid,
    p_processor_attestation_id uuid,
    p_reason_hash text,
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
  proof_value public.governance_approved_execution_evaluator_proofs%rowtype;
  processor_value
    public.cognitive_research_retention_processor_attestations%rowtype;
  revocation_id_value uuid;
  event_hash_value text;
begin
  perform public.governance_assert_two_party_service_principal(
    p_service_identity,p_worker_assertion,'public_research_ingest'
  );

  select * into processor_value
  from public.cognitive_research_retention_processor_attestations processor
  where processor.id = p_processor_attestation_id;

  if processor_value.id is null then
    raise exception 'research_retention_activation_revocation_rejected'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.cognitive_research_retention_scope_lock_key(
      processor_value.task_id,
      processor_value.project_id,
      processor_value.platform,
      processor_value.environment
    )
  );

  -- Re-read every mutable or replay-sensitive row only after the scope lock.
  select * into processor_value
  from public.cognitive_research_retention_processor_attestations processor
  where processor.id = p_processor_attestation_id
  for share;

  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = p_execution_id
  for share;

  select * into proof_value
  from public.governance_approved_execution_evaluator_proofs proof
  where proof.execution_id = p_execution_id
  for share;

  event_hash_value :=
    public.governance_research_retention_revocation_hash(
      processor_value.attestation_hash,p_reason_hash
    );

  if execution_value.id is null
     or processor_value.id is null
     or execution_value.state <> 'completed'
     or execution_value.operation <> 'public_research_ingest'
     or execution_value.provider <> 'public_research'
     or execution_value.repository_full_name <>
       'Chillywood2025/chillywood-mobile'
     or execution_value.service_identity <> 'cognitive_approved_action_worker'
     or execution_value.task_id <> processor_value.task_id
     or execution_value.project_id <> processor_value.project_id
     or execution_value.platform <> processor_value.platform
     or execution_value.environment <> processor_value.environment
     or proof_value.id is null
     or proof_value.verdict <> 'passed'
     or proof_value.evaluator_identity <> 'cognitive_independent_evaluator'
     or proof_value.evaluator_identity_hash =
       execution_value.service_identity_hash
     or p_reason_hash !~ '^[a-f0-9]{64}$'
     or execution_value.target_resource_hash <> event_hash_value
     or exists (
       select 1
       from public.cognitive_research_retention_processor_revocations revocation
       where revocation.processor_attestation_id = processor_value.id
          or revocation.execution_id = execution_value.id
     ) then
    raise exception 'research_retention_activation_revocation_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_research_retention_processor_revocations(
    execution_id,evaluator_proof_id,processor_attestation_id,
    task_id,project_id,platform,environment,reason_hash,event_hash
  ) values (
    execution_value.id,proof_value.id,processor_value.id,
    processor_value.task_id,processor_value.project_id,
    processor_value.platform,processor_value.environment,
    p_reason_hash,event_hash_value
  ) returning id into revocation_id_value;

  return jsonb_build_object(
    'revocation_id',revocation_id_value,
    'processor_attestation_id',processor_value.id,
    'event_hash',event_hash_value,
    'status','revoked'
  );
end;
$$;

comment on function public.governance_revoke_research_retention_activation(
  uuid,uuid,text,text,text
) is
  'Serializes retention revocation with every isolated-runtime research mutation on the exact task/project/platform/environment scope, then re-reads and revalidates the governed proof before append-only revocation.';
