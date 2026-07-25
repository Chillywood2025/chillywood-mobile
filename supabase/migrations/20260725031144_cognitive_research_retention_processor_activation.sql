-- Activate only the reviewed, broker-owned automatic public-research
-- retention path.  The attestation remains fail closed until a real provider
-- readback proves the current no-backup Free-plan state and the exact
-- Cloudflare Cron configuration has produced a fresh maintenance heartbeat.
-- This migration enables no switch and grants no operation to the Level 0/1
-- scheduler.

create table public.cognitive_research_backup_retention_attestations (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null unique,
  evaluator_proof_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  provider text not null check (provider = 'supabase'),
  provider_plan text not null check (provider_plan = 'free'),
  backup_state text not null check (
    backup_state = 'provider_project_backups_absent'
  ),
  backup_window_days integer not null check (backup_window_days = 0),
  restore_available boolean not null check (not restore_available),
  point_in_time_recovery boolean not null check (not point_in_time_recovery),
  restored_data_requires_tombstone_replay boolean not null check (
    restored_data_requires_tombstone_replay
  ),
  provider_evidence_hash text not null check (
    provider_evidence_hash ~ '^[a-f0-9]{64}$'
  ),
  provider_verified_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  check (
    provider_verified_at <= created_at + interval '5 minutes'
    and provider_verified_at >= created_at - interval '15 minutes'
    and expires_at > created_at
    and expires_at <= created_at + interval '7 days'
  ),
  unique (id, task_id, project_id, platform, environment),
  foreign key (execution_id, task_id, project_id, platform, environment)
    references public.governance_approved_action_executions(
      id, task_id, project_id, platform, environment
    ),
  foreign key (evaluator_proof_id, task_id, project_id, platform, environment)
    references public.governance_approved_execution_evaluator_proofs(
      id, task_id, project_id, platform, environment
    )
);

create table public.cognitive_research_retention_processor_attestations (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null unique,
  evaluator_proof_id uuid not null,
  backup_attestation_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  repository_full_name text not null check (
    repository_full_name = 'Chillywood2025/chillywood-mobile'
  ),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  runtime_provider text not null check (runtime_provider = 'cloudflare_workers'),
  worker_name text not null check (
    worker_name = 'chillywood-level01-public-research-broker'
  ),
  runtime_principal text not null check (
    runtime_principal = 'cognitive_public_research_broker'
  ),
  database_role text not null check (
    database_role = 'cognitive_public_research_broker'
  ),
  schedule_cron text not null check (schedule_cron = '17 * * * *'),
  schedule_timezone text not null check (schedule_timezone = 'UTC'),
  batch_limit integer not null check (batch_limit = 100),
  maximum_batches integer not null check (maximum_batches = 1),
  timeout_ms integer not null check (timeout_ms = 50000),
  maximum_lag_seconds integer not null check (
    maximum_lag_seconds = 7200
  ),
  retention_policy_id text not null check (
    retention_policy_id = 'chillywood-cognitive-retention-v1'
  ),
  retention_policy_hash text not null check (
    retention_policy_hash ~ '^[a-f0-9]{64}$'
  ),
  worker_version_hash text not null check (
    worker_version_hash ~ '^[a-f0-9]{64}$'
  ),
  provider_configuration_hash text not null check (
    provider_configuration_hash ~ '^[a-f0-9]{64}$'
  ),
  attestation_hash text not null unique check (
    attestation_hash ~ '^[a-f0-9]{64}$'
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  check (
    expires_at > created_at
    and expires_at <= created_at + interval '7 days'
  ),
  unique (id, task_id, project_id, platform, environment),
  foreign key (execution_id, task_id, project_id, platform, environment)
    references public.governance_approved_action_executions(
      id, task_id, project_id, platform, environment
    ),
  foreign key (evaluator_proof_id, task_id, project_id, platform, environment)
    references public.governance_approved_execution_evaluator_proofs(
      id, task_id, project_id, platform, environment
    ),
  foreign key (
    backup_attestation_id, task_id, project_id, platform, environment
  ) references public.cognitive_research_backup_retention_attestations(
    id, task_id, project_id, platform, environment
  )
);

create table public.cognitive_research_retention_processor_revocations (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null unique,
  evaluator_proof_id uuid not null,
  processor_attestation_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  reason_hash text not null check (reason_hash ~ '^[a-f0-9]{64}$'),
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (execution_id, task_id, project_id, platform, environment)
    references public.governance_approved_action_executions(
      id, task_id, project_id, platform, environment
    ),
  foreign key (evaluator_proof_id, task_id, project_id, platform, environment)
    references public.governance_approved_execution_evaluator_proofs(
      id, task_id, project_id, platform, environment
    ),
  foreign key (
    processor_attestation_id, task_id, project_id, platform, environment
  ) references public.cognitive_research_retention_processor_attestations(
    id, task_id, project_id, platform, environment
  )
);

create table public.cognitive_research_retention_processor_heartbeats (
  id uuid primary key default gen_random_uuid(),
  processor_attestation_id uuid not null,
  maintenance_run_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  scheduled_at timestamptz not null,
  source_count integer not null check (source_count between 0 and 100),
  claim_count integer not null check (claim_count between 0 and 100),
  total_count integer not null check (
    total_count = source_count + claim_count and total_count <= 100
  ),
  no_work boolean not null check (no_work = (total_count = 0)),
  attestation_hash text not null check (attestation_hash ~ '^[a-f0-9]{64}$'),
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  completed_at timestamptz not null default transaction_timestamp(),
  created_at timestamptz not null default transaction_timestamp(),
  unique (processor_attestation_id, scheduled_at),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    processor_attestation_id, task_id, project_id, platform, environment
  ) references public.cognitive_research_retention_processor_attestations(
    id, task_id, project_id, platform, environment
  ),
  foreign key (maintenance_run_id)
    references public.cognitive_research_maintenance_runs(id),
  check (
    scheduled_at <= completed_at
    and scheduled_at >= completed_at - interval '2 hours'
    and extract(minute from scheduled_at at time zone 'UTC') = 17
    and date_trunc('minute', scheduled_at) = scheduled_at
  )
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'cognitive_research_backup_retention_attestations',
    'cognitive_research_retention_processor_attestations',
    'cognitive_research_retention_processor_revocations',
    'cognitive_research_retention_processor_heartbeats'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all on table public.%I from public,anon,authenticated,service_role',
      table_name
    );
    execute format('grant select on table public.%I to service_role', table_name);
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable', table_name
    );
  end loop;
end
$$;

create index cognitive_research_retention_processor_scope_idx
  on public.cognitive_research_retention_processor_attestations(
    task_id, project_id, platform, environment, expires_at desc
  );
create index cognitive_research_retention_heartbeat_scope_idx
  on public.cognitive_research_retention_processor_heartbeats(
    task_id, project_id, platform, environment, completed_at desc
  );

create function public.governance_research_retention_activation_hash(
  p_source_commit text,
  p_worker_version_hash text,
  p_provider_configuration_hash text,
  p_provider_evidence_hash text,
  p_retention_policy_hash text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws(
    '|',
    'chillywood-research-retention-processor-v1',
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
    p_provider_evidence_hash
  ), 'UTF8'), 'sha256'), 'hex')
$$;
revoke all on function
  public.governance_research_retention_activation_hash(text,text,text,text,text)
  from public,anon,authenticated,service_role;

create function public.governance_persist_research_retention_activation(
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
declare execution_value public.governance_approved_action_executions%rowtype;
declare approval_value public.governance_owner_approval_versions%rowtype;
declare proof_value public.governance_approved_execution_evaluator_proofs%rowtype;
declare backup_id_value uuid;
declare processor_id_value uuid;
declare activation_hash_value text;
declare now_at timestamptz := transaction_timestamp();
begin
  perform public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, 'public_research_ingest'
  );
  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = p_execution_id
  for share;
  select * into approval_value
  from public.governance_owner_approval_versions approval
  where approval.id = execution_value.approval_version_id
  for share;
  select * into proof_value
  from public.governance_approved_execution_evaluator_proofs proof
  where proof.execution_id = p_execution_id
  for share;
  activation_hash_value :=
    public.governance_research_retention_activation_hash(
      p_source_commit,
      p_worker_version_hash,
      p_provider_configuration_hash,
      p_provider_evidence_hash,
      p_retention_policy_hash
    );
  if execution_value.id is null
     or execution_value.state <> 'completed'
     or execution_value.operation <> 'public_research_ingest'
     or execution_value.provider <> 'public_research'
     or execution_value.repository_full_name <>
       'Chillywood2025/chillywood-mobile'
     or execution_value.platform <> 'shared'
     or execution_value.environment <> 'production'
     or execution_value.service_identity <> 'cognitive_approved_action_worker'
     or approval_value.id is null
     or approval_value.source_commit <> p_source_commit
     or proof_value.id is null
     or proof_value.verdict <> 'passed'
     or proof_value.evaluator_identity <> 'cognitive_independent_evaluator'
     or proof_value.evaluator_identity_hash = execution_value.service_identity_hash
     or execution_value.target_resource_hash <> activation_hash_value
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_worker_version_hash !~ '^[a-f0-9]{64}$'
     or p_provider_configuration_hash !~ '^[a-f0-9]{64}$'
     or p_provider_evidence_hash !~ '^[a-f0-9]{64}$'
     or p_retention_policy_hash !~ '^[a-f0-9]{64}$'
     or p_provider_verified_at < now_at - interval '15 minutes'
     or p_provider_verified_at > now_at + interval '5 minutes'
     or p_expires_at <= now_at
     or p_expires_at > now_at + interval '7 days'
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
    'backup_attestation_id', backup_id_value,
    'processor_attestation_id', processor_id_value,
    'attestation_hash', activation_hash_value,
    'backup_state', 'provider_project_backups_absent',
    'backup_window_days', 0,
    'restore_available', false,
    'point_in_time_recovery', false
  );
end;
$$;
revoke all on function
  public.governance_persist_research_retention_activation(
    uuid,text,text,text,text,timestamptz,text,timestamptz,text,text
  ) from public,anon,authenticated;
grant execute on function
  public.governance_persist_research_retention_activation(
    uuid,text,text,text,text,timestamptz,text,timestamptz,text,text
  ) to service_role;

create function public.governance_research_retention_revocation_hash(
  p_processor_attestation_hash text,
  p_reason_hash text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws(
    '|',
    'chillywood-research-retention-processor-revocation-v1',
    'Chillywood2025/chillywood-mobile',
    p_processor_attestation_hash,
    p_reason_hash
  ), 'UTF8'), 'sha256'), 'hex')
$$;
revoke all on function
  public.governance_research_retention_revocation_hash(text,text)
  from public,anon,authenticated,service_role;

create function public.governance_revoke_research_retention_activation(
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
declare execution_value public.governance_approved_action_executions%rowtype;
declare proof_value public.governance_approved_execution_evaluator_proofs%rowtype;
declare processor_value
  public.cognitive_research_retention_processor_attestations%rowtype;
declare revocation_id_value uuid;
declare event_hash_value text;
begin
  perform public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, 'public_research_ingest'
  );
  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = p_execution_id
  for share;
  select * into proof_value
  from public.governance_approved_execution_evaluator_proofs proof
  where proof.execution_id = p_execution_id
  for share;
  select * into processor_value
  from public.cognitive_research_retention_processor_attestations processor
  where processor.id = p_processor_attestation_id
  for share;
  event_hash_value :=
    public.governance_research_retention_revocation_hash(
      processor_value.attestation_hash, p_reason_hash
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
    'revocation_id', revocation_id_value,
    'processor_attestation_id', processor_value.id,
    'event_hash', event_hash_value,
    'status', 'revoked'
  );
end;
$$;
revoke all on function
  public.governance_revoke_research_retention_activation(
    uuid,uuid,text,text,text
  ) from public,anon,authenticated;
grant execute on function
  public.governance_revoke_research_retention_activation(
    uuid,uuid,text,text,text
  ) to service_role;

create function public.cognitive_run_attested_research_retention_maintenance(
  p_processor_attestation_id uuid,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_scheduled_at timestamptz,
  p_limit integer,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare processor_value
  public.cognitive_research_retention_processor_attestations%rowtype;
declare backup_value
  public.cognitive_research_backup_retention_attestations%rowtype;
declare maintenance_result jsonb;
declare maintenance_run_id_value uuid;
declare heartbeat_id_value uuid;
declare heartbeat_hash_value text;
declare now_at timestamptz := transaction_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_processor_attestation_id::text, 0
    )
  );
  select * into processor_value
  from public.cognitive_research_retention_processor_attestations processor
  where processor.id = p_processor_attestation_id
    and processor.task_id = p_task_id
    and processor.project_id = p_project_id
    and processor.platform = p_platform
    and processor.environment = p_environment
  for share;
  select * into backup_value
  from public.cognitive_research_backup_retention_attestations backup
  where backup.id = processor_value.backup_attestation_id
    and backup.task_id = p_task_id
    and backup.project_id = p_project_id
    and backup.platform = p_platform
    and backup.environment = p_environment
  for share;
  if processor_value.id is null
     or backup_value.id is null
     or now_at >= least(processor_value.expires_at, backup_value.expires_at)
     or exists (
       select 1
       from public.cognitive_research_retention_processor_revocations revocation
       where revocation.processor_attestation_id = processor_value.id
     )
     or processor_value.runtime_principal <>
       'cognitive_public_research_broker'
     or processor_value.database_role <> 'cognitive_public_research_broker'
     or processor_value.schedule_cron <> '17 * * * *'
     or processor_value.batch_limit <> 100
     or processor_value.maximum_batches <> 1
     or processor_value.timeout_ms <> 50000
     or p_limit <> processor_value.batch_limit
     or p_scheduled_at > now_at
     or p_scheduled_at <
       now_at - make_interval(secs => processor_value.maximum_lag_seconds)
     or extract(minute from p_scheduled_at at time zone 'UTC') <> 17
     or date_trunc('minute', p_scheduled_at) <> p_scheduled_at
     or backup_value.backup_state <>
       'provider_project_backups_absent'
     or backup_value.backup_window_days <> 0
     or backup_value.restore_available
     or backup_value.point_in_time_recovery
     or not backup_value.restored_data_requires_tombstone_replay then
    raise exception 'attested_research_retention_maintenance_rejected'
      using errcode = 'P0001';
  end if;
  select heartbeat.id into heartbeat_id_value
  from public.cognitive_research_retention_processor_heartbeats heartbeat
  where heartbeat.processor_attestation_id = processor_value.id
    and heartbeat.scheduled_at = p_scheduled_at;
  if heartbeat_id_value is not null then
    return (
      select jsonb_build_object(
        'heartbeat_id', heartbeat.id,
        'source_count', heartbeat.source_count,
        'claim_count', heartbeat.claim_count,
        'total_count', heartbeat.total_count,
        'no_work', heartbeat.no_work,
        'retention_policy_id', 'chillywood-cognitive-retention-v1',
        'attestation_hash', heartbeat.attestation_hash,
        'replayed', true
      )
      from public.cognitive_research_retention_processor_heartbeats heartbeat
      where heartbeat.id = heartbeat_id_value
    );
  end if;
  maintenance_result := public.cognitive_expire_public_research_maintenance(
    p_task_id,p_project_id,p_platform,p_environment,p_limit,
    p_service_identity_token
  );
  select run.id into maintenance_run_id_value
  from public.cognitive_research_maintenance_runs run
  where run.task_id = p_task_id
    and run.project_id = p_project_id
    and run.platform = p_platform
    and run.environment = p_environment
    and run.created_at = now_at
    and run.source_count = (maintenance_result->>'source_count')::integer
    and run.claim_count = (maintenance_result->>'claim_count')::integer
  order by run.created_at desc, run.id desc
  limit 1;
  if maintenance_run_id_value is null
     or (maintenance_result->>'source_count')::integer < 0
     or (maintenance_result->>'claim_count')::integer < 0
     or (maintenance_result->>'total_count')::integer <>
       (maintenance_result->>'source_count')::integer +
       (maintenance_result->>'claim_count')::integer
     or maintenance_result->>'retention_policy_id' <>
       'chillywood-cognitive-retention-v1' then
    raise exception 'attested_research_retention_readback_rejected'
      using errcode = 'P0001';
  end if;
  heartbeat_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|',processor_value.attestation_hash,p_scheduled_at::text,
    maintenance_run_id_value::text,
    maintenance_result->>'source_count',
    maintenance_result->>'claim_count',
    maintenance_result->>'total_count'
  ), 'UTF8'), 'sha256'), 'hex');
  insert into public.cognitive_research_retention_processor_heartbeats(
    processor_attestation_id,maintenance_run_id,task_id,project_id,platform,
    environment,scheduled_at,source_count,claim_count,total_count,no_work,
    attestation_hash,event_hash
  ) values (
    processor_value.id,maintenance_run_id_value,p_task_id,p_project_id,
    p_platform,p_environment,p_scheduled_at,
    (maintenance_result->>'source_count')::integer,
    (maintenance_result->>'claim_count')::integer,
    (maintenance_result->>'total_count')::integer,
    (maintenance_result->>'total_count')::integer = 0,
    processor_value.attestation_hash,heartbeat_hash_value
  ) returning id into heartbeat_id_value;
  return maintenance_result || jsonb_build_object(
    'heartbeat_id', heartbeat_id_value,
    'attestation_hash', processor_value.attestation_hash,
    'no_work', (maintenance_result->>'total_count')::integer = 0,
    'replayed', false
  );
end;
$$;
revoke all on function
  public.cognitive_run_attested_research_retention_maintenance(
    uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
    timestamptz,integer,text
  ) from public,anon,authenticated,service_role;

create function cognitive_runtime.run_attested_research_retention_maintenance(
  p_processor_attestation_id uuid,
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text,
  p_scheduled_at timestamptz,
  p_limit integer,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_public_research_broker', 'expire_research'
  );
  return public.cognitive_run_attested_research_retention_maintenance(
    p_processor_attestation_id,p_task_id,p_project_id,
    p_platform::public.cognitive_platform,
    p_environment::public.cognitive_environment,p_scheduled_at,p_limit,
    p_service_identity_token
  );
end;
$$;
revoke all on function
  cognitive_runtime.run_attested_research_retention_maintenance(
    uuid,uuid,uuid,text,text,timestamptz,integer,text
  ) from public,anon,authenticated,service_role;
grant execute on function
  cognitive_runtime.run_attested_research_retention_maintenance(
    uuid,uuid,uuid,text,text,timestamptz,integer,text
  ) to cognitive_public_research_broker;

create function public.cognitive_research_retention_processor_ready(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
      and transaction_timestamp() < processor.expires_at
      and transaction_timestamp() < backup.expires_at
      and backup.backup_state = 'provider_project_backups_absent'
      and backup.backup_window_days = 0
      and not backup.restore_available
      and not backup.point_in_time_recovery
      and backup.restored_data_requires_tombstone_replay
      and heartbeat.attestation_hash = processor.attestation_hash
      and heartbeat.completed_at >= transaction_timestamp()
        - make_interval(secs => processor.maximum_lag_seconds)
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
  )
$$;
revoke all on function public.cognitive_research_retention_processor_ready(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public,anon,authenticated,service_role;
grant execute on function public.cognitive_research_retention_processor_ready(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) to service_role;

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
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_execution_id
  for share;
  if p_enabled
     and p_switch_key = 'cognitive_collective_deliberation_enabled' then
    raise exception 'model_independence_provider_required'
      using errcode = 'P0001';
  end if;
  if execution_value.id is null then
    if p_enabled
       and p_switch_key in (
         'cognitive_research_enabled',
         'cognitive_memory_enabled'
       ) then
      raise exception 'cognitive_research_retention_processor_required'
        using errcode = 'P0001';
    end if;
    raise exception 'two_party_execution_missing' using errcode = 'P0001';
  end if;

  if p_enabled
     and p_switch_key in (
       'cognitive_research_enabled',
       'cognitive_memory_enabled'
     )
     and not public.cognitive_research_retention_processor_ready(
       execution_value.task_id,execution_value.project_id,
       execution_value.platform,execution_value.environment
     ) then
    raise exception 'cognitive_research_retention_processor_required'
      using errcode = 'P0001';
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
) from public,anon,authenticated,service_role;

create or replace function public.governance_enforce_level01_activation_hold()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_row jsonb := to_jsonb(new);
begin
  if (
       session_user not in ('postgres','supabase_admin')
       or current_user not in ('postgres','supabase_admin')
     )
     and new.enabled
     and new.switch_key in (
       'cognitive_research_enabled',
       'cognitive_memory_enabled'
     )
     and not public.cognitive_research_retention_processor_ready(
       (new_row->>'task_id')::uuid,
       (new_row->>'project_id')::uuid,
       (new_row->>'platform')::public.cognitive_platform,
       (new_row->>'environment')::public.cognitive_environment
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
  from public,anon,authenticated,service_role;

comment on table
  public.cognitive_research_backup_retention_attestations is
  'Immutable provider evidence for the exact current zero-copy Supabase Free-plan backup state. Future backup availability invalidates the attestation and requires a new reviewed policy.';
comment on table
  public.cognitive_research_retention_processor_attestations is
  'Immutable exact-source, broker-owned Cloudflare Cron retention processor attestation. It grants no scheduler operation.';
comment on function public.cognitive_research_retention_processor_ready(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) is
  'Fail-closed research/memory activation prerequisite requiring current zero-copy backup evidence, an unrevoked exact broker configuration, a fresh heartbeat, and user-derived memory disabled.';
