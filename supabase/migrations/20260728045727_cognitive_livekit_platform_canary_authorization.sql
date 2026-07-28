-- Platform-separated Cognitive Level 0/1 LiveKit experience activation.
--
-- This forward-only migration preserves the working Android and iOS visual
-- sentinels. It adds exact LiveKit-collector capability operations, a
-- one-consumer triage receipt for bounded-failure no-finding attestations, and
-- independently expiring Android/iOS authorization and finalization records.
-- The shared LiveKit switch and all recurring schedules remain ineligible.

alter table public.cognitive_product_quality_service_capabilities
  drop constraint
    cognitive_product_quality_capability_assertion_scope_key,
  drop constraint
    cognitive_product_quality_service_capabi_service_identity_check,
  drop constraint
    cognitive_product_quality_service_capabilities_operation_check,
  drop constraint
    cognitive_product_quality_service_capabilities_check;

alter table public.cognitive_product_quality_service_capabilities
  add constraint
    cognitive_quality_capability_assertion_operation_scope_key
    unique (
      assertion_hash, task_id, project_id, platform, environment, operation
    ),
  add constraint
    cognitive_product_quality_service_capabi_service_identity_check
    check (
      service_identity in (
        'cognitive_sentinel_collector',
        'cognitive_livekit_experience_collector',
        'cognitive_product_quality_triage'
      )
    ),
  add constraint
    cognitive_product_quality_service_capabilities_operation_check
    check (
      operation in (
        'collect_sentinel_run',
        'collect_livekit_sentinel_run',
        'issue_livekit_failure_fixture',
        'consume_livekit_failure_fixture',
        'triage_product_quality'
      )
    ),
  add constraint cognitive_product_quality_service_capabilities_check
    check (
      allowed_sentinel_keys <@ array[
        'livekit_experience_sentinel',
        'visual_product_experience_sentinel',
        'installed_journey_sentinel'
      ]::text[]
      and (
        (
          service_identity = 'cognitive_sentinel_collector'
          and operation = 'collect_sentinel_run'
          and cardinality(allowed_sentinel_keys) between 1 and 3
        )
        or (
          service_identity = 'cognitive_livekit_experience_collector'
          and operation in (
            'collect_livekit_sentinel_run',
            'issue_livekit_failure_fixture',
            'consume_livekit_failure_fixture'
          )
          and allowed_sentinel_keys =
            array['livekit_experience_sentinel']::text[]
        )
        or (
          service_identity = 'cognitive_product_quality_triage'
          and operation = 'triage_product_quality'
          and cardinality(allowed_sentinel_keys) = 0
        )
      )
    );

create index cognitive_product_quality_capability_assertion_scope_idx
  on public.cognitive_product_quality_service_capabilities(
    assertion_hash, task_id, project_id, platform, environment
  );

create function
  public.governance_register_livekit_collector_capability(
    p_platform public.cognitive_platform,
    p_operation text,
    p_assertion_hash text,
    p_expires_at timestamptz
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  task_value public.intelligence_tasks%rowtype;
  capability_id_value uuid;
begin
  if p_platform not in (
       'android'::public.cognitive_platform,
       'ios'::public.cognitive_platform
     )
     or p_operation not in (
       'collect_livekit_sentinel_run',
       'issue_livekit_failure_fixture',
       'consume_livekit_failure_fixture'
     )
     or p_assertion_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= transaction_timestamp()
     or p_expires_at > transaction_timestamp() + interval '30 days' then
    raise exception 'livekit_collector_capability_registration_rejected'
      using errcode = 'P0001';
  end if;

  select task.* into task_value
  from public.intelligence_tasks task
  join public.cognitive_projects project
    on project.id = task.project_id
  where project.repository_full_name =
      'Chillywood2025/chillywood-mobile'
    and task.repository_full_name =
      'Chillywood2025/chillywood-mobile'
    and task.task_key = 'cognitive-level01-canary-control'
    and task.platform = p_platform
    and task.environment = 'production'::public.cognitive_environment
  for share of task;

  if task_value.id is null then
    raise exception 'livekit_collector_exact_task_required'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        ':',
        'livekit-collector-capability',
        task_value.id,
        p_operation
      ),
      0
    )
  );

  if exists (
    select 1
    from public.cognitive_product_quality_service_capabilities capability
    where capability.service_identity =
        'cognitive_livekit_experience_collector'
      and capability.operation = p_operation
      and capability.task_id = task_value.id
      and capability.project_id = task_value.project_id
      and capability.platform = p_platform
      and capability.environment =
        'production'::public.cognitive_environment
      and transaction_timestamp() < capability.expires_at
      and not exists (
        select 1
        from public.cognitive_product_quality_service_capability_revocations
          revocation
        where revocation.capability_id = capability.id
      )
  ) then
    raise exception 'livekit_collector_capability_overlap_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_product_quality_service_capabilities(
    service_identity,operation,task_id,project_id,platform,environment,
    assertion_hash,allowed_sentinel_keys,registered_by,expires_at
  )
  values (
    'cognitive_livekit_experience_collector',
    p_operation,
    task_value.id,
    task_value.project_id,
    p_platform,
    'production'::public.cognitive_environment,
    p_assertion_hash,
    array['livekit_experience_sentinel']::text[],
    owner_id,
    p_expires_at
  )
  returning id into capability_id_value;

  return jsonb_build_object(
    'capabilityId', capability_id_value,
    'serviceIdentity', 'cognitive_livekit_experience_collector',
    'operation', p_operation,
    'taskId', task_value.id,
    'projectId', task_value.project_id,
    'platform', p_platform,
    'environment', 'production',
    'assertionFingerprint', p_assertion_hash,
    'expiresAt', p_expires_at
  );
end;
$$;

revoke all on function
  public.governance_register_livekit_collector_capability(
    public.cognitive_platform,text,text,timestamptz
  )
from public,anon,service_role;
grant execute on function
  public.governance_register_livekit_collector_capability(
    public.cognitive_platform,text,text,timestamptz
  )
to authenticated;

create or replace function
  public.cognitive_product_quality_assert_service_capability(
    p_service_identity text,
    p_operation text,
    p_task_id uuid,
    p_project_id uuid,
    p_platform public.cognitive_platform,
    p_environment public.cognitive_environment,
    p_sentinel_key text,
    p_service_assertion text
  )
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    claims->>'role'
  );
  capability_id_value uuid;
begin
  if request_role <> 'service_role'
     or p_service_assertion is null
     or octet_length(p_service_assertion) not between 32 and 1024
     or (
       p_service_identity = 'cognitive_sentinel_collector'
       and p_operation <> 'collect_sentinel_run'
     )
     or (
       p_service_identity = 'cognitive_livekit_experience_collector'
       and p_operation not in (
         'collect_livekit_sentinel_run',
         'issue_livekit_failure_fixture',
         'consume_livekit_failure_fixture'
       )
     )
     or (
       p_service_identity = 'cognitive_product_quality_triage'
       and p_operation <> 'triage_product_quality'
     )
     or p_service_identity not in (
       'cognitive_sentinel_collector',
       'cognitive_livekit_experience_collector',
       'cognitive_product_quality_triage'
     ) then
    raise exception 'product_quality_service_capability_required'
      using errcode = '42501';
  end if;

  select capability.id into capability_id_value
  from public.cognitive_product_quality_service_capabilities capability
  where capability.service_identity = p_service_identity
    and capability.operation = p_operation
    and capability.task_id = p_task_id
    and capability.project_id = p_project_id
    and capability.platform = p_platform
    and capability.environment = p_environment
    and transaction_timestamp() < capability.expires_at
    and (
      p_operation = 'triage_product_quality'
      or p_sentinel_key = any(capability.allowed_sentinel_keys)
    )
    and capability.assertion_hash = encode(
      extensions.digest(
        convert_to(p_service_assertion, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
    and not exists (
      select 1
      from public.cognitive_product_quality_service_capability_revocations
        revocation
      where revocation.capability_id = capability.id
    )
  for share;

  if capability_id_value is null then
    raise exception 'product_quality_service_capability_required'
      using errcode = '42501';
  end if;

  return capability_id_value;
end;
$$;

revoke all on function
  public.cognitive_product_quality_assert_service_capability(
    text,text,uuid,uuid,public.cognitive_platform,
    public.cognitive_environment,text,text
  )
from public,anon,authenticated;
grant execute on function
  public.cognitive_product_quality_assert_service_capability(
    text,text,uuid,uuid,public.cognitive_platform,
    public.cognitive_environment,text,text
  )
to service_role;

create or replace function public.product_experience_collect_sentinel_run(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_sentinel_key text,
  p_route_or_surface text,
  p_runtime_identity_hash text,
  p_source_build_hash text,
  p_evidence_manifest_hash text,
  p_metric_manifest jsonb,
  p_result_status text,
  p_physical_proof_status text,
  p_observation_started_at timestamptz,
  p_observation_finished_at timestamptz,
  p_evaluation_expires_at timestamptz,
  p_collection_idempotency_hash text,
  p_service_identity text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_value text := case p_service_identity
    when 'cognitive_sentinel_collector' then 'collect_sentinel_run'
    when 'cognitive_livekit_experience_collector'
      then 'collect_livekit_sentinel_run'
    else null
  end;
  capability_id_value uuid;
  result_id uuid;
  existing_run public.product_experience_sentinel_runs%rowtype;
begin
  capability_id_value :=
    public.cognitive_product_quality_assert_service_capability(
      p_service_identity,
      operation_value,
      p_task_id,
      p_project_id,
      p_platform,
      p_environment,
      p_sentinel_key,
      p_service_assertion
    );

  if operation_value is null
     or (
       p_service_identity = 'cognitive_livekit_experience_collector'
       and p_sentinel_key <> 'livekit_experience_sentinel'
     )
     or not public.governance_task_writes_allowed(
       p_task_id,p_project_id,p_platform,p_environment
     )
     or p_runtime_identity_hash !~ '^[a-f0-9]{64}$'
     or p_source_build_hash !~ '^[a-f0-9]{64}$'
     or p_evidence_manifest_hash !~ '^[a-f0-9]{64}$'
     or p_collection_idempotency_hash !~ '^[a-f0-9]{64}$'
     or length(p_route_or_surface) not between 1 and 160
     or public.cognitive_text_has_secret(p_route_or_surface)
     or public.cognitive_text_has_private_identifier(p_route_or_surface)
     or p_result_status not in ('passed','blocked','failed')
     or p_physical_proof_status not in (
       'installed_ui_observed','simulator_observed','source_only',
       'provider_blocked','device_unavailable',
       'new_binary_or_ota_required'
     )
     or (
       p_result_status in ('passed','failed')
       and p_physical_proof_status not in (
         'installed_ui_observed','simulator_observed'
       )
     )
     or p_observation_started_at is null
     or p_observation_finished_at is null
     or p_observation_finished_at < p_observation_started_at
     or p_observation_finished_at >
       p_observation_started_at + interval '30 minutes'
     or p_observation_finished_at >
       transaction_timestamp() + interval '5 minutes'
     or p_evaluation_expires_at <= p_observation_finished_at
     or p_evaluation_expires_at >
       p_observation_finished_at + interval '24 hours'
     or not public.product_experience_metric_manifest_is_bounded(
       p_sentinel_key,p_evidence_manifest_hash,p_metric_manifest
     )
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.project_id = p_project_id
         and switch.platform = p_platform
         and switch.environment = p_environment
         and switch.enabled
         and switch.switch_key = case p_sentinel_key
           when 'livekit_experience_sentinel'
             then 'cognitive_livekit_experience_sentinel_enabled'
           when 'visual_product_experience_sentinel'
             then 'cognitive_visual_experience_sentinel_enabled'
           when 'installed_journey_sentinel'
             then 'cognitive_installed_journey_sentinel_enabled'
         end
     ) then
    raise exception 'product_experience_sentinel_collection_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.product_experience_sentinel_runs(
    task_id,project_id,platform,environment,sentinel_key,
    route_or_surface,runtime_identity_hash,source_build_hash,
    evidence_manifest_hash,metric_manifest,result_status,
    physical_proof_status,collector_capability_id,
    collection_idempotency_hash,observation_started_at,
    observation_finished_at,evaluation_expires_at
  )
  values (
    p_task_id,p_project_id,p_platform,p_environment,p_sentinel_key,
    p_route_or_surface,p_runtime_identity_hash,p_source_build_hash,
    p_evidence_manifest_hash,p_metric_manifest,p_result_status,
    p_physical_proof_status,capability_id_value,
    p_collection_idempotency_hash,p_observation_started_at,
    p_observation_finished_at,p_evaluation_expires_at
  )
  on conflict (task_id,collection_idempotency_hash)
    where collection_idempotency_hash is not null
  do nothing
  returning id into result_id;

  if result_id is null then
    select * into existing_run
    from public.product_experience_sentinel_runs
    where task_id = p_task_id
      and collection_idempotency_hash = p_collection_idempotency_hash
    for share;

    if existing_run.id is null
       or existing_run.project_id <> p_project_id
       or existing_run.platform <> p_platform
       or existing_run.environment <> p_environment
       or existing_run.sentinel_key <> p_sentinel_key
       or existing_run.route_or_surface <> p_route_or_surface
       or existing_run.runtime_identity_hash <> p_runtime_identity_hash
       or existing_run.source_build_hash <> p_source_build_hash
       or existing_run.evidence_manifest_hash <> p_evidence_manifest_hash
       or existing_run.metric_manifest <> p_metric_manifest
       or existing_run.result_status <> p_result_status
       or existing_run.physical_proof_status <> p_physical_proof_status
       or existing_run.collector_capability_id <> capability_id_value
       or existing_run.observation_started_at <> p_observation_started_at
       or existing_run.observation_finished_at <>
         p_observation_finished_at
       or existing_run.evaluation_expires_at <> p_evaluation_expires_at then
      raise exception 'product_experience_sentinel_idempotency_conflict'
        using errcode = 'P0001';
    end if;
    result_id := existing_run.id;
  end if;

  return jsonb_build_object(
    'sentinelRunId', result_id,
    'taskId', p_task_id,
    'projectId', p_project_id,
    'platform', p_platform,
    'environment', p_environment,
    'resultStatus', p_result_status,
    'evaluationExpiresAt', p_evaluation_expires_at
  );
end;
$$;

create or replace function
  public.product_experience_require_collector_capability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.collector_capability_id is null
     or not public.cognitive_lock_task_writes_allowed(
       new.task_id,new.project_id,new.platform,new.environment
     )
     or not public.product_experience_detailed_metric_manifest_is_valid(
       new.sentinel_key,new.platform,new.result_status,
       new.metric_manifest
     )
     or not exists (
       select 1
       from public.cognitive_product_quality_service_capabilities capability
       where capability.id = new.collector_capability_id
         and (
           (
             capability.service_identity =
               'cognitive_sentinel_collector'
             and capability.operation = 'collect_sentinel_run'
           )
           or (
             capability.service_identity =
               'cognitive_livekit_experience_collector'
             and capability.operation =
               'collect_livekit_sentinel_run'
             and new.sentinel_key =
               'livekit_experience_sentinel'
           )
         )
         and capability.task_id = new.task_id
         and capability.project_id = new.project_id
         and capability.platform = new.platform
         and capability.environment = new.environment
         and new.sentinel_key = any(capability.allowed_sentinel_keys)
         and transaction_timestamp() < capability.expires_at
         and not exists (
           select 1
           from public.cognitive_product_quality_service_capability_revocations
             revocation
           where revocation.capability_id = capability.id
         )
     ) then
    raise exception 'product_experience_collector_capability_required'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function
  public.product_experience_require_collector_capability()
from public,anon,authenticated,service_role;

create or replace function cognitive_runtime.collect_livekit_sentinel_run(
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text,
  p_route_or_surface text,
  p_runtime_identity_hash text,
  p_source_build_hash text,
  p_evidence_manifest_hash text,
  p_metric_manifest jsonb,
  p_result_status text,
  p_physical_proof_status text,
  p_observation_started_at timestamptz,
  p_observation_finished_at timestamptz,
  p_evaluation_expires_at timestamptz,
  p_collection_idempotency_hash text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_request_role text :=
    current_setting('request.jwt.claim.role', true);
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_livekit_experience_collector',
    'collect_livekit_sentinel_run'
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    result_value := public.product_experience_collect_sentinel_run(
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'livekit_experience_sentinel',
      p_route_or_surface,
      p_runtime_identity_hash,
      p_source_build_hash,
      p_evidence_manifest_hash,
      p_metric_manifest,
      p_result_status,
      p_physical_proof_status,
      p_observation_started_at,
      p_observation_finished_at,
      p_evaluation_expires_at,
      p_collection_idempotency_hash,
      'cognitive_livekit_experience_collector',
      p_service_assertion
    );
  exception when others then
    perform set_config(
      'request.jwt.claim.role',
      coalesce(prior_request_role, ''),
      true
    );
    raise;
  end;
  perform set_config(
    'request.jwt.claim.role',
    coalesce(prior_request_role, ''),
    true
  );
  return result_value;
end;
$$;

create or replace function cognitive_runtime.issue_livekit_failure_fixture(
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text,
  p_source_commit text,
  p_fixture_id text,
  p_fixture_attestation_hash text,
  p_fixture_type text,
  p_condition jsonb,
  p_synthetic_room_name text,
  p_synthetic_room_name_hash text,
  p_room_run_correlation_hash text,
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_request_role text :=
    current_setting('request.jwt.claim.role', true);
  capability_id_value uuid;
  issuance_hash_value text;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_livekit_experience_collector',
    'issue_livekit_failure_fixture'
  );

  if p_platform not in ('android','ios')
     or p_environment <> 'production'
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_fixture_id !~ '^[a-f0-9]{64}$'
     or p_fixture_attestation_hash !~ '^[a-f0-9]{64}$'
     or p_condition is distinct from
       public.product_experience_livekit_failure_fixture_condition(
         p_fixture_type
       )
     or p_synthetic_room_name !~
       '^cognitive-test-[a-z0-9][a-z0-9-]{2,63}$'
     or p_synthetic_room_name_hash is distinct from
       public.product_experience_livekit_synthetic_room_hash(
         p_synthetic_room_name
       )
     or p_room_run_correlation_hash !~ '^[a-f0-9]{64}$'
     or p_issued_at is null
     or p_expires_at is null
     or p_issued_at < transaction_timestamp() - interval '1 minute'
     or p_issued_at > transaction_timestamp() + interval '10 seconds'
     or p_expires_at < p_issued_at + interval '30 seconds'
     or p_expires_at > p_issued_at + interval '300 seconds'
     or p_expires_at <= transaction_timestamp()
     or not public.cognitive_lock_task_writes_allowed(
       p_task_id,
       p_project_id,
       p_platform::public.cognitive_platform,
       p_environment::public.cognitive_environment
     )
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.project_id = p_project_id
         and switch.platform = p_platform::public.cognitive_platform
         and switch.environment =
           p_environment::public.cognitive_environment
         and switch.switch_key =
           'cognitive_livekit_experience_sentinel_enabled'
         and switch.enabled
     ) then
    raise exception 'livekit_failure_fixture_issuance_rejected'
      using errcode = 'P0001';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    capability_id_value :=
      public.cognitive_product_quality_assert_service_capability(
        'cognitive_livekit_experience_collector',
        'issue_livekit_failure_fixture',
        p_task_id,
        p_project_id,
        p_platform::public.cognitive_platform,
        p_environment::public.cognitive_environment,
        'livekit_experience_sentinel',
        p_service_assertion
      );
  exception when others then
    perform set_config(
      'request.jwt.claim.role',
      coalesce(prior_request_role, ''),
      true
    );
    raise;
  end;
  perform set_config(
    'request.jwt.claim.role',
    coalesce(prior_request_role, ''),
    true
  );

  issuance_hash_value :=
    public.product_experience_livekit_fixture_issuance_hash(
      p_fixture_id,
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'cognitive_livekit_experience_collector',
      p_source_commit,
      capability_id_value,
      p_fixture_type,
      p_condition,
      p_fixture_attestation_hash,
      p_synthetic_room_name,
      p_synthetic_room_name_hash,
      p_room_run_correlation_hash,
      p_issued_at,
      p_expires_at
    );

  begin
    insert into
      public.product_experience_livekit_failure_fixture_issuances(
        fixture_id,task_id,project_id,platform,environment,principal,
        source_commit,capability_id,fixture_type,condition,
        fixture_attestation_hash,synthetic_room_name,
        synthetic_room_name_hash,room_run_correlation_hash,
        issued_at,expires_at,issuance_hash
      )
    values (
      p_fixture_id,p_task_id,p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'cognitive_livekit_experience_collector',
      p_source_commit,capability_id_value,p_fixture_type,p_condition,
      p_fixture_attestation_hash,p_synthetic_room_name,
      p_synthetic_room_name_hash,p_room_run_correlation_hash,
      p_issued_at,p_expires_at,issuance_hash_value
    );
  exception when unique_violation then
    raise exception 'livekit_failure_fixture_issuance_replay_rejected'
      using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'active', true,
    'fixtureId', p_fixture_id,
    'fixtureAttestationHash', p_fixture_attestation_hash,
    'issuanceHash', issuance_hash_value,
    'expiresAt', p_expires_at,
    'principal', 'cognitive_livekit_experience_collector'
  );
end;
$$;

create or replace function
  cognitive_runtime.consume_livekit_failure_fixture_and_collect(
    p_task_id uuid,
    p_project_id uuid,
    p_platform text,
    p_environment text,
    p_source_commit text,
    p_fixture_id text,
    p_fixture_attestation_hash text,
    p_synthetic_room_name text,
    p_synthetic_room_name_hash text,
    p_room_run_correlation_hash text,
    p_route_or_surface text,
    p_runtime_identity_hash text,
    p_source_build_hash text,
    p_evidence_manifest_hash text,
    p_metric_manifest jsonb,
    p_result_status text,
    p_physical_proof_status text,
    p_observation_started_at timestamptz,
    p_observation_finished_at timestamptz,
    p_evaluation_expires_at timestamptz,
    p_collection_idempotency_hash text,
    p_service_assertion text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_request_role text :=
    current_setting('request.jwt.claim.role', true);
  issue_capability_id_value uuid;
  consume_capability_id_value uuid;
  issuance_value
    public.product_experience_livekit_failure_fixture_issuances%rowtype;
  claimed_at_value timestamptz := transaction_timestamp();
  consumption_hash_value text;
  sentinel_result jsonb;
  sentinel_run_id_value uuid;
  recorded_at_value timestamptz;
  receipt_hash_value text;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_livekit_experience_collector',
    'consume_livekit_failure_fixture'
  );

  select * into issuance_value
  from public.product_experience_livekit_failure_fixture_issuances issuance
  where issuance.fixture_id = p_fixture_id
  for update;

  if issuance_value.fixture_id is null
     or issuance_value.task_id <> p_task_id
     or issuance_value.project_id <> p_project_id
     or issuance_value.platform <> p_platform::public.cognitive_platform
     or issuance_value.environment <>
       p_environment::public.cognitive_environment
     or issuance_value.principal <>
       'cognitive_livekit_experience_collector'
     or issuance_value.source_commit <> p_source_commit
     or issuance_value.fixture_attestation_hash <>
       p_fixture_attestation_hash
     or issuance_value.synthetic_room_name <> p_synthetic_room_name
     or issuance_value.synthetic_room_name_hash <>
       p_synthetic_room_name_hash
     or issuance_value.room_run_correlation_hash <>
       p_room_run_correlation_hash
     or p_result_status <> 'failed'
     or p_physical_proof_status <> 'installed_ui_observed'
     or p_observation_started_at < issuance_value.issued_at
     or p_observation_finished_at > issuance_value.expires_at
     or transaction_timestamp() >= issuance_value.expires_at
     or exists (
       select 1
       from public.product_experience_livekit_failure_fixture_consumptions
         consumption
       where consumption.fixture_id = issuance_value.fixture_id
     )
     or exists (
       select 1
       from public.product_experience_livekit_failure_fixture_receipts receipt
       where receipt.fixture_id = issuance_value.fixture_id
     )
     or not public.cognitive_lock_task_writes_allowed(
       p_task_id,
       p_project_id,
       p_platform::public.cognitive_platform,
       p_environment::public.cognitive_environment
     )
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.project_id = p_project_id
         and switch.platform = p_platform::public.cognitive_platform
         and switch.environment =
           p_environment::public.cognitive_environment
         and switch.switch_key =
           'cognitive_livekit_experience_sentinel_enabled'
         and switch.enabled
     ) then
    raise exception 'livekit_failure_fixture_consumption_rejected'
      using errcode = 'P0001';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    issue_capability_id_value :=
      public.cognitive_product_quality_assert_service_capability(
        'cognitive_livekit_experience_collector',
        'issue_livekit_failure_fixture',
        p_task_id,
        p_project_id,
        p_platform::public.cognitive_platform,
        p_environment::public.cognitive_environment,
        'livekit_experience_sentinel',
        p_service_assertion
      );
    consume_capability_id_value :=
      public.cognitive_product_quality_assert_service_capability(
        'cognitive_livekit_experience_collector',
        'consume_livekit_failure_fixture',
        p_task_id,
        p_project_id,
        p_platform::public.cognitive_platform,
        p_environment::public.cognitive_environment,
        'livekit_experience_sentinel',
        p_service_assertion
      );
    perform public.cognitive_product_quality_assert_service_capability(
      'cognitive_livekit_experience_collector',
      'collect_livekit_sentinel_run',
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'livekit_experience_sentinel',
      p_service_assertion
    );
  exception when others then
    perform set_config(
      'request.jwt.claim.role',
      coalesce(prior_request_role, ''),
      true
    );
    raise;
  end;
  perform set_config(
    'request.jwt.claim.role',
    coalesce(prior_request_role, ''),
    true
  );

  if issue_capability_id_value <> issuance_value.capability_id
     or consume_capability_id_value is null then
    raise exception 'livekit_failure_fixture_capability_rejected'
      using errcode = '42501';
  end if;

  consumption_hash_value :=
    public.product_experience_livekit_fixture_consumption_hash(
      p_fixture_id,p_task_id,p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'cognitive_livekit_experience_collector',
      p_source_commit,p_fixture_attestation_hash,p_synthetic_room_name,
      p_synthetic_room_name_hash,p_room_run_correlation_hash,
      p_route_or_surface,p_runtime_identity_hash,p_source_build_hash,
      p_evidence_manifest_hash,p_collection_idempotency_hash,
      p_observation_started_at,p_observation_finished_at,
      claimed_at_value
    );

  insert into
    public.product_experience_livekit_failure_fixture_consumptions(
      fixture_id,task_id,project_id,platform,environment,principal,
      source_commit,fixture_attestation_hash,synthetic_room_name,
      synthetic_room_name_hash,room_run_correlation_hash,
      route_or_surface,runtime_identity_hash,source_build_hash,
      evidence_manifest_hash,collection_idempotency_hash,
      observation_started_at,observation_finished_at,claimed_at,
      consumption_hash
    )
  values (
    p_fixture_id,p_task_id,p_project_id,
    p_platform::public.cognitive_platform,
    p_environment::public.cognitive_environment,
    'cognitive_livekit_experience_collector',
    p_source_commit,p_fixture_attestation_hash,p_synthetic_room_name,
    p_synthetic_room_name_hash,p_room_run_correlation_hash,
    p_route_or_surface,p_runtime_identity_hash,p_source_build_hash,
    p_evidence_manifest_hash,p_collection_idempotency_hash,
    p_observation_started_at,p_observation_finished_at,claimed_at_value,
    consumption_hash_value
  );

  if public.product_experience_livekit_failure_fixture_scope_is_valid(
       p_task_id,p_project_id,
       p_platform::public.cognitive_platform,
       p_environment::public.cognitive_environment,
       p_route_or_surface,p_runtime_identity_hash,p_source_build_hash,
       p_evidence_manifest_hash,p_collection_idempotency_hash,
       p_observation_started_at,p_observation_finished_at,
       p_result_status,p_metric_manifest
     ) is not true then
    raise exception 'livekit_failure_fixture_binding_rejected'
      using errcode = 'P0001';
  end if;

  sentinel_result := cognitive_runtime.collect_livekit_sentinel_run(
    p_task_id,p_project_id,p_platform,p_environment,p_route_or_surface,
    p_runtime_identity_hash,p_source_build_hash,p_evidence_manifest_hash,
    p_metric_manifest,p_result_status,p_physical_proof_status,
    p_observation_started_at,p_observation_finished_at,
    p_evaluation_expires_at,p_collection_idempotency_hash,
    p_service_assertion
  );

  begin
    sentinel_run_id_value := (sentinel_result->>'sentinelRunId')::uuid;
  exception when others then
    raise exception 'livekit_failure_fixture_sentinel_receipt_rejected'
      using errcode = 'P0001';
  end;
  if sentinel_run_id_value is null then
    raise exception 'livekit_failure_fixture_sentinel_receipt_rejected'
      using errcode = 'P0001';
  end if;

  recorded_at_value := transaction_timestamp();
  receipt_hash_value :=
    public.product_experience_livekit_fixture_receipt_hash(
      p_fixture_id,sentinel_run_id_value,p_task_id,p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'cognitive_livekit_experience_collector',
      p_source_commit,p_fixture_attestation_hash,consumption_hash_value,
      p_evidence_manifest_hash,p_collection_idempotency_hash,
      recorded_at_value
    );

  insert into
    public.product_experience_livekit_failure_fixture_receipts(
      fixture_id,sentinel_run_id,task_id,project_id,platform,environment,
      principal,source_commit,fixture_attestation_hash,consumption_hash,
      evidence_manifest_hash,collection_idempotency_hash,recorded_at,
      receipt_hash
    )
  values (
    p_fixture_id,sentinel_run_id_value,p_task_id,p_project_id,
    p_platform::public.cognitive_platform,
    p_environment::public.cognitive_environment,
    'cognitive_livekit_experience_collector',
    p_source_commit,p_fixture_attestation_hash,consumption_hash_value,
    p_evidence_manifest_hash,p_collection_idempotency_hash,
    recorded_at_value,receipt_hash_value
  );

  return sentinel_result || jsonb_build_object(
    'fixtureId', p_fixture_id,
    'fixtureAttestationHash', p_fixture_attestation_hash,
    'fixtureConsumptionHash', consumption_hash_value,
    'fixtureReceiptHash', receipt_hash_value,
    'fixtureConsumed', true
  );
end;
$$;

create table
  public.product_experience_livekit_no_finding_attestation_consumptions (
    id uuid primary key default gen_random_uuid(),
    attestation_id uuid not null unique,
    sentinel_run_id uuid not null unique,
    task_id uuid not null,
    project_id uuid not null,
    platform public.cognitive_platform not null check (
      platform in ('android','ios')
    ),
    environment public.cognitive_environment not null check (
      environment = 'production'
    ),
    triage_capability_id uuid not null,
    consumed_by_identity text not null check (
      consumed_by_identity = 'cognitive_product_quality_triage'
    ),
    attestation_hash text not null check (
      attestation_hash ~ '^[a-f0-9]{64}$'
    ),
    fixture_receipt_hash text not null check (
      fixture_receipt_hash ~ '^[a-f0-9]{64}$'
    ),
    consumption_hash text not null unique check (
      consumption_hash ~ '^[a-f0-9]{64}$'
    ),
    consumed_at timestamptz not null default transaction_timestamp(),
    unique (id,task_id,project_id,platform,environment),
    foreign key (
      attestation_id,task_id,project_id,platform,environment
    ) references
      public.product_experience_livekit_no_finding_attestations(
        id,task_id,project_id,platform,environment
      ),
    foreign key (
      sentinel_run_id,task_id,project_id,platform,environment
    ) references public.product_experience_sentinel_runs(
      id,task_id,project_id,platform,environment
    ),
    foreign key (
      triage_capability_id,task_id,project_id,platform,environment
    ) references public.cognitive_product_quality_service_capabilities(
      id,task_id,project_id,platform,environment
    )
  );

alter table
  public.product_experience_livekit_no_finding_attestation_consumptions
  enable row level security;
alter table
  public.product_experience_livekit_no_finding_attestation_consumptions
  force row level security;

revoke all on table
  public.product_experience_livekit_no_finding_attestation_consumptions
from public,anon,authenticated,service_role;
grant select on table
  public.product_experience_livekit_no_finding_attestation_consumptions
to authenticated;

create policy
  product_experience_livekit_no_finding_consumptions_owner_read
on public.product_experience_livekit_no_finding_attestation_consumptions
for select
to authenticated
using (
  public.governance_exact_owner((select auth.uid()))
);

create trigger
  product_experience_livekit_no_finding_consumptions_immutable
before update or delete
on public.product_experience_livekit_no_finding_attestation_consumptions
for each row execute function public.reject_cognitive_evidence_mutation();

create function
  cognitive_runtime.product_quality_triage_livekit_bounded_no_finding(
    p_attestation_id uuid,
    p_service_assertion text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_request_role text :=
    current_setting('request.jwt.claim.role', true);
  attestation_value
    public.product_experience_livekit_no_finding_attestations%rowtype;
  run_value public.product_experience_sentinel_runs%rowtype;
  capability_id_value uuid;
  fixture_receipt_hash_value text;
  consumption_hash_value text;
  consumption_id_value uuid;
  consumed_at_value timestamptz := transaction_timestamp();
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_product_quality_triage',
    'triage_livekit_bounded_failure_no_finding'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_attestation_id::text, 0)
  );

  select * into attestation_value
  from public.product_experience_livekit_no_finding_attestations attestation
  where attestation.id = p_attestation_id
  for share;

  select * into run_value
  from public.product_experience_sentinel_runs run
  where run.id = attestation_value.sentinel_run_id
  for share;

  select receipt.receipt_hash into fixture_receipt_hash_value
  from public.product_experience_livekit_failure_fixture_receipts receipt
  where receipt.sentinel_run_id = run_value.id
    and receipt.task_id = run_value.task_id
    and receipt.project_id = run_value.project_id
    and receipt.platform = run_value.platform
    and receipt.environment = run_value.environment
  for share;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    capability_id_value :=
      public.cognitive_product_quality_assert_service_capability(
        'cognitive_product_quality_triage',
        'triage_product_quality',
        run_value.task_id,
        run_value.project_id,
        run_value.platform,
        run_value.environment,
        null,
        p_service_assertion
      );
  exception when others then
    perform set_config(
      'request.jwt.claim.role',
      coalesce(prior_request_role, ''),
      true
    );
    raise;
  end;
  perform set_config(
    'request.jwt.claim.role',
    coalesce(prior_request_role, ''),
    true
  );

  if attestation_value.id is null
     or run_value.id is null
     or capability_id_value is null
     or attestation_value.scenario_type <> 'bounded_failure_fixture'
     or attestation_value.sentinel_run_id <> run_value.id
     or attestation_value.task_id <> run_value.task_id
     or attestation_value.project_id <> run_value.project_id
     or attestation_value.platform <> run_value.platform
     or attestation_value.environment <> run_value.environment
     or attestation_value.evidence_manifest_hash <>
       run_value.evidence_manifest_hash
     or attestation_value.source_build_hash <> run_value.source_build_hash
     or attestation_value.evaluator_identity <>
       'cognitive_product_quality_evaluator'
     or fixture_receipt_hash_value is null
     or run_value.sentinel_key <> 'livekit_experience_sentinel'
     or run_value.result_status <> 'failed'
     or run_value.physical_proof_status <> 'installed_ui_observed'
     or run_value.erased_at is not null
     or run_value.evaluation_expires_at <= transaction_timestamp()
     or exists (
       select 1
       from public.product_quality_findings finding
       where finding.sentinel_run_id = run_value.id
     )
     or exists (
       select 1
       from public.product_quality_finding_events event
       where event.sentinel_run_id = run_value.id
     )
     or exists (
       select 1
       from public.product_experience_sentinel_evaluator_proofs proof
       where proof.sentinel_run_id = run_value.id
     )
     or not public.governance_task_writes_allowed(
       run_value.task_id,
       run_value.project_id,
       run_value.platform,
       run_value.environment
     ) then
    raise exception 'livekit_bounded_no_finding_triage_rejected'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from
      public.product_experience_livekit_no_finding_attestation_consumptions
        consumption
    where consumption.attestation_id = attestation_value.id
       or consumption.sentinel_run_id = run_value.id
  ) then
    raise exception 'livekit_bounded_no_finding_triage_replay_rejected'
      using errcode = 'P0001';
  end if;

  consumption_hash_value := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'livekit-bounded-no-finding-triage-v1',
          attestation_value.id,
          run_value.id,
          run_value.task_id,
          run_value.project_id,
          run_value.platform::text,
          run_value.environment::text,
          capability_id_value,
          attestation_value.attestation_hash,
          fixture_receipt_hash_value,
          consumed_at_value
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into
    public.product_experience_livekit_no_finding_attestation_consumptions(
      attestation_id,sentinel_run_id,task_id,project_id,platform,
      environment,triage_capability_id,consumed_by_identity,
      attestation_hash,fixture_receipt_hash,consumption_hash,consumed_at
    )
  values (
    attestation_value.id,run_value.id,run_value.task_id,
    run_value.project_id,run_value.platform,run_value.environment,
    capability_id_value,'cognitive_product_quality_triage',
    attestation_value.attestation_hash,fixture_receipt_hash_value,
    consumption_hash_value,consumed_at_value
  )
  returning id into consumption_id_value;

  return jsonb_build_object(
    'consumptionId', consumption_id_value,
    'attestationId', attestation_value.id,
    'sentinelRunId', run_value.id,
    'disposition', 'bounded_failure_no_finding',
    'consumptionHash', consumption_hash_value,
    'findingCreated', false,
    'consumedAt', consumed_at_value
  );
end;
$$;

revoke all on function
  cognitive_runtime.product_quality_triage_livekit_bounded_no_finding(
    uuid,text
  )
from public,anon,authenticated,service_role;
grant execute on function
  cognitive_runtime.product_quality_triage_livekit_bounded_no_finding(
    uuid,text
  )
to cognitive_product_quality_triage;

create or replace function cognitive_runtime.runtime_operation_allowed(
  p_principal text,
  p_operation text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select (p_principal,p_operation) in (
    ('cognitive_product_baseline_executor','claim_approved_action'),
    ('cognitive_product_baseline_executor','begin_approved_execution'),
    ('cognitive_product_baseline_executor','stage_product_baseline'),
    ('cognitive_product_baseline_executor','complete_approved_execution'),
    ('cognitive_product_baseline_executor','persist_product_baseline'),
    ('cognitive_product_baseline_executor','fail_approved_execution'),
    ('cognitive_sentinel_collector','collect_sentinel_run'),
    (
      'cognitive_sentinel_collector',
      'preflight_visual_sentinel_collection'
    ),
    (
      'cognitive_sentinel_collector',
      'preflight_visual_generic_manifest_predicates'
    ),
    ('cognitive_product_quality_evaluator','read_active_baseline'),
    ('cognitive_product_quality_evaluator','compute_detection_hash'),
    ('cognitive_product_quality_evaluator','compute_no_finding_hash'),
    ('cognitive_product_quality_evaluator','compute_resolution_hash'),
    ('cognitive_product_quality_evaluator','evaluate_product_baseline'),
    (
      'cognitive_product_quality_evaluator',
      'record_sentinel_evaluator_proof'
    ),
    (
      'cognitive_product_quality_evaluator',
      'read_product_quality_snapshot'
    ),
    (
      'cognitive_product_quality_evaluator',
      'attest_livekit_bounded_failure_no_finding'
    ),
    ('cognitive_product_quality_triage','triage_detection'),
    ('cognitive_product_quality_triage','triage_no_finding'),
    ('cognitive_product_quality_triage','triage_resolution'),
    (
      'cognitive_product_quality_triage',
      'triage_livekit_bounded_failure_no_finding'
    ),
    ('cognitive_public_research_broker','record_research_source'),
    ('cognitive_public_research_broker','record_research_claim'),
    ('cognitive_public_research_broker','detect_research_contradiction'),
    ('cognitive_public_research_broker','expire_research'),
    ('cognitive_research_evaluator','derive_research_evaluation'),
    ('cognitive_research_evaluator','resolve_research_contradiction'),
    ('cognitive_research_evaluator','read_research_snapshot'),
    ('cognitive_model_router','recover_model_reservation'),
    ('cognitive_model_router','reserve_model_invocation'),
    ('cognitive_model_router','record_model_provider_overrun'),
    ('cognitive_model_router','settle_model_invocation'),
    (
      'cognitive_livekit_experience_collector',
      'collect_livekit_sentinel_run'
    ),
    (
      'cognitive_livekit_experience_collector',
      'issue_livekit_failure_fixture'
    ),
    (
      'cognitive_livekit_experience_collector',
      'consume_livekit_failure_fixture'
    ),
    (
      'cognitive_github_draft_pr_broker',
      'record_github_provider_readback'
    ),
    (
      'cognitive_github_draft_pr_broker',
      'consume_github_capability'
    ),
    (
      'cognitive_github_draft_pr_broker',
      'accept_github_tool_result'
    ),
    ('cognitive_level01_scheduler','read_scheduler_status'),
    ('cognitive_level01_scheduler','issue_recurring_child_task')
  );
$$;

revoke all on function
  cognitive_runtime.runtime_operation_allowed(text,text)
from public,anon,authenticated,service_role;

create table public.cognitive_livekit_platform_preflight_receipts (
  id uuid primary key default gen_random_uuid(),
  shared_task_id uuid not null,
  target_task_id uuid not null,
  project_id uuid not null,
  shared_platform public.cognitive_platform not null default 'shared'
    check (shared_platform = 'shared'),
  target_platform public.cognitive_platform not null check (
    target_platform in ('android','ios')
  ),
  environment public.cognitive_environment not null default 'production'
    check (environment = 'production'),
  owner_user_id uuid not null,
  baseline_version_id uuid not null,
  collect_capability_id uuid not null,
  issue_capability_id uuid not null,
  consume_capability_id uuid not null,
  triage_capability_id uuid not null,
  collector_assertion_fingerprint text not null check (
    collector_assertion_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  evaluator_assertion_fingerprint text not null check (
    evaluator_assertion_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  application_identifier text not null check (
    application_identifier = 'com.chillywood.mobile'
  ),
  distribution text not null check (
    distribution in ('google_play_internal_testing','internal_testflight')
  ),
  app_version text not null check (app_version = '1.0.0'),
  build_number text not null check (build_number in ('84','8')),
  runtime_version text not null check (
    runtime_version in (
      '1.0.0-android-imagemanipulator-v1',
      '1.0.0-iosqa1'
    )
  ),
  channel text not null check (channel in ('production','ios-qa')),
  internal_update_id uuid not null,
  installed_artifact_hash text not null check (
    installed_artifact_hash ~ '^[a-f0-9]{64}$'
  ),
  sandbox_premium_proof_hash text not null check (
    sandbox_premium_proof_hash ~ '^[a-f0-9]{64}$'
  ),
  premium_proof_kind text not null check (
    premium_proof_kind =
      'store_sandbox_revenuecat_backend_installed_v1'
  ),
  role_free_account_attested boolean not null check (
    role_free_account_attested
  ),
  manual_grant_absent boolean not null check (manual_grant_absent),
  real_charge_absent boolean not null check (real_charge_absent),
  telemetry_contract_hash text not null check (
    telemetry_contract_hash ~ '^[a-f0-9]{64}$'
  ),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  source_tree_hash text not null check (
    source_tree_hash ~ '^[a-f0-9]{40}$'
  ),
  independent_review_hash text not null check (
    independent_review_hash ~ '^[a-f0-9]{64}$'
  ),
  tests_hash text not null check (tests_hash ~ '^[a-f0-9]{64}$'),
  deployment_hash text not null check (
    deployment_hash ~ '^[a-f0-9]{64}$'
  ),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  receipt_hash text not null unique check (
    receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  unique (
    id,shared_task_id,target_task_id,project_id,
    shared_platform,target_platform,environment
  ),
  foreign key (
    shared_task_id,project_id,shared_platform,environment
  ) references public.intelligence_tasks(
    id,project_id,platform,environment
  ),
  foreign key (
    target_task_id,project_id,target_platform,environment
  ) references public.intelligence_tasks(
    id,project_id,platform,environment
  ),
  foreign key (
    baseline_version_id,shared_task_id,project_id,
    shared_platform,environment
  ) references public.product_experience_baseline_versions(
    id,task_id,project_id,platform,environment
  ),
  foreign key (
    collect_capability_id,target_task_id,project_id,
    target_platform,environment
  ) references public.cognitive_product_quality_service_capabilities(
    id,task_id,project_id,platform,environment
  ),
  foreign key (
    issue_capability_id,target_task_id,project_id,
    target_platform,environment
  ) references public.cognitive_product_quality_service_capabilities(
    id,task_id,project_id,platform,environment
  ),
  foreign key (
    consume_capability_id,target_task_id,project_id,
    target_platform,environment
  ) references public.cognitive_product_quality_service_capabilities(
    id,task_id,project_id,platform,environment
  ),
  foreign key (
    triage_capability_id,target_task_id,project_id,
    target_platform,environment
  ) references public.cognitive_product_quality_service_capabilities(
    id,task_id,project_id,platform,environment
  ),
  check (
    (
      target_platform = 'android'
      and distribution = 'google_play_internal_testing'
      and build_number = '84'
      and runtime_version = '1.0.0-android-imagemanipulator-v1'
      and channel = 'production'
      and internal_update_id =
        '019f9c11-33c1-7d23-a0c0-8029c62e0ea4'::uuid
    )
    or (
      target_platform = 'ios'
      and distribution = 'internal_testflight'
      and build_number = '8'
      and runtime_version = '1.0.0-iosqa1'
      and channel = 'ios-qa'
      and internal_update_id =
        '019f9c13-9f6d-7c52-9cee-71265b8fd565'::uuid
    )
  ),
  check (
    expires_at > created_at
    and expires_at <= created_at + interval '15 minutes'
  )
);

create table public.cognitive_livekit_platform_canary_authorizations (
  id uuid primary key default gen_random_uuid(),
  preflight_receipt_id uuid not null unique,
  shared_task_id uuid not null,
  target_task_id uuid not null,
  project_id uuid not null,
  shared_platform public.cognitive_platform not null default 'shared'
    check (shared_platform = 'shared'),
  target_platform public.cognitive_platform not null check (
    target_platform in ('android','ios')
  ),
  environment public.cognitive_environment not null default 'production'
    check (environment = 'production'),
  owner_user_id uuid not null,
  baseline_version_id uuid not null,
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  source_tree_hash text not null check (
    source_tree_hash ~ '^[a-f0-9]{40}$'
  ),
  independent_review_hash text not null check (
    independent_review_hash ~ '^[a-f0-9]{64}$'
  ),
  tests_hash text not null check (tests_hash ~ '^[a-f0-9]{64}$'),
  deployment_hash text not null check (
    deployment_hash ~ '^[a-f0-9]{64}$'
  ),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  authorization_hash text not null unique check (
    authorization_hash ~ '^[a-f0-9]{64}$'
  ),
  opened_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  unique (
    id,shared_task_id,target_task_id,project_id,
    shared_platform,target_platform,environment
  ),
  foreign key (
    preflight_receipt_id,shared_task_id,target_task_id,project_id,
    shared_platform,target_platform,environment
  ) references public.cognitive_livekit_platform_preflight_receipts(
    id,shared_task_id,target_task_id,project_id,
    shared_platform,target_platform,environment
  ),
  foreign key (
    baseline_version_id,shared_task_id,project_id,
    shared_platform,environment
  ) references public.product_experience_baseline_versions(
    id,task_id,project_id,platform,environment
  ),
  check (
    expires_at > opened_at
    and expires_at <= opened_at + interval '30 minutes'
  )
);

create table public.cognitive_livekit_platform_activation_outcomes (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null unique,
  shared_task_id uuid not null,
  target_task_id uuid not null,
  project_id uuid not null,
  shared_platform public.cognitive_platform not null default 'shared'
    check (shared_platform = 'shared'),
  target_platform public.cognitive_platform not null check (
    target_platform in ('android','ios')
  ),
  environment public.cognitive_environment not null default 'production'
    check (environment = 'production'),
  owner_user_id uuid not null,
  enabled boolean not null,
  sentinel_run_count integer not null check (
    sentinel_run_count between 0 and 100
  ),
  evaluator_proof_count integer not null check (
    evaluator_proof_count between 0 and 100
  ),
  normal_triage_consumption_count integer not null check (
    normal_triage_consumption_count between 0 and 100
  ),
  fixture_attestation_count integer not null check (
    fixture_attestation_count between 0 and 100
  ),
  fixture_triage_consumption_count integer not null check (
    fixture_triage_consumption_count between 0 and 100
  ),
  open_finding_count integer not null check (
    open_finding_count between 0 and 100
  ),
  canary_receipt_hash text not null check (
    canary_receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  emergency_stop_receipt_hash text not null check (
    emergency_stop_receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  principal_rollback_receipt_hash text not null check (
    principal_rollback_receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  outcome_hash text not null unique check (
    outcome_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (
    id,shared_task_id,target_task_id,project_id,
    shared_platform,target_platform,environment
  ),
  foreign key (
    authorization_id,shared_task_id,target_task_id,project_id,
    shared_platform,target_platform,environment
  ) references public.cognitive_livekit_platform_canary_authorizations(
    id,shared_task_id,target_task_id,project_id,
    shared_platform,target_platform,environment
  )
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cognitive_livekit_platform_preflight_receipts',
    'cognitive_livekit_platform_canary_authorizations',
    'cognitive_livekit_platform_activation_outcomes'
  ] loop
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );
    execute format(
      'alter table public.%I force row level security',
      table_name
    );
    execute format(
      'revoke all on table public.%I from public,anon,authenticated,service_role',
      table_name
    );
    execute format(
      'grant select on table public.%I to authenticated',
      table_name
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (
         (select auth.uid()) = owner_user_id
         and public.governance_exact_owner((select auth.uid()))
       )',
      table_name || '_owner_read',
      table_name
    );
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable',
      table_name
    );
  end loop;
end;
$$;

create function public.governance_prepare_livekit_platform_preflight(
  p_target_platform public.cognitive_platform,
  p_installed_artifact_hash text,
  p_sandbox_premium_proof_hash text,
  p_telemetry_contract_hash text,
  p_collector_assertion_fingerprint text,
  p_evaluator_assertion_fingerprint text,
  p_source_commit text,
  p_source_tree_hash text,
  p_independent_review_hash text,
  p_tests_hash text,
  p_deployment_hash text,
  p_rollback_hash text,
  p_validity interval default interval '15 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  scope_value public.cognitive_product_sentinel_platform_scopes%rowtype;
  shared_task_value public.intelligence_tasks%rowtype;
  target_task_value public.intelligence_tasks%rowtype;
  baseline_value public.product_experience_baseline_versions%rowtype;
  collect_capability_id_value uuid;
  issue_capability_id_value uuid;
  consume_capability_id_value uuid;
  triage_capability_id_value uuid;
  receipt_id_value uuid := gen_random_uuid();
  receipt_hash_value text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
  distribution_value text;
  build_number_value text;
  runtime_version_value text;
  channel_value text;
  internal_update_id_value uuid;
begin
  if p_target_platform not in (
       'android'::public.cognitive_platform,
       'ios'::public.cognitive_platform
     )
     or p_installed_artifact_hash !~ '^[a-f0-9]{64}$'
     or p_sandbox_premium_proof_hash !~ '^[a-f0-9]{64}$'
     or p_telemetry_contract_hash !~ '^[a-f0-9]{64}$'
     or p_collector_assertion_fingerprint !~ '^[a-f0-9]{64}$'
     or p_evaluator_assertion_fingerprint !~ '^[a-f0-9]{64}$'
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_source_tree_hash !~ '^[a-f0-9]{40}$'
     or p_independent_review_hash !~ '^[a-f0-9]{64}$'
     or p_tests_hash !~ '^[a-f0-9]{64}$'
     or p_deployment_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '15 minutes' then
    raise exception 'livekit_platform_preflight_rejected'
      using errcode = 'P0001';
  end if;

  select * into scope_value
  from public.cognitive_product_sentinel_platform_scopes scope
  where scope.platform = p_target_platform
    and scope.environment = 'production'
  for share;

  select * into shared_task_value
  from public.intelligence_tasks task
  where task.id = scope_value.shared_task_id
    and task.project_id = scope_value.project_id
    and task.platform = 'shared'
    and task.environment = 'production'
    and task.task_key = 'cognitive-level01-canary-control'
    and task.repository_full_name =
      'Chillywood2025/chillywood-mobile'
  for share;

  select * into target_task_value
  from public.intelligence_tasks task
  where task.id = scope_value.platform_task_id
    and task.project_id = scope_value.project_id
    and task.platform = p_target_platform
    and task.environment = 'production'
    and task.task_key = 'cognitive-level01-canary-control'
    and task.repository_full_name =
      'Chillywood2025/chillywood-mobile'
  for share;

  select baseline.* into baseline_value
  from public.product_experience_baseline_versions baseline
  where baseline.task_id = shared_task_value.id
    and baseline.project_id = shared_task_value.project_id
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

  select
    (min(capability.id::text) filter (
      where capability.operation = 'collect_livekit_sentinel_run'
    ))::uuid,
    (min(capability.id::text) filter (
      where capability.operation = 'issue_livekit_failure_fixture'
    ))::uuid,
    (min(capability.id::text) filter (
      where capability.operation = 'consume_livekit_failure_fixture'
    ))::uuid
  into
    collect_capability_id_value,
    issue_capability_id_value,
    consume_capability_id_value
  from public.cognitive_product_quality_service_capabilities capability
  where capability.service_identity =
      'cognitive_livekit_experience_collector'
    and capability.task_id = target_task_value.id
    and capability.project_id = target_task_value.project_id
    and capability.platform = p_target_platform
    and capability.environment = 'production'
    and capability.assertion_hash =
      p_collector_assertion_fingerprint
    and transaction_timestamp() < capability.expires_at
    and not exists (
      select 1
      from public.cognitive_product_quality_service_capability_revocations
        revocation
      where revocation.capability_id = capability.id
    );

  select capability.id into triage_capability_id_value
  from public.cognitive_product_quality_service_capabilities capability
  where capability.service_identity = 'cognitive_product_quality_triage'
    and capability.operation = 'triage_product_quality'
    and capability.task_id = target_task_value.id
    and capability.project_id = target_task_value.project_id
    and capability.platform = p_target_platform
    and capability.environment = 'production'
    and transaction_timestamp() < capability.expires_at
    and not exists (
      select 1
      from public.cognitive_product_quality_service_capability_revocations
        revocation
      where revocation.capability_id = capability.id
    )
  order by capability.issued_at desc
  limit 1
  for share;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        ':',
        'livekit-platform-preflight',
        target_task_value.id,
        p_target_platform::text
      ),
      0
    )
  );

  if scope_value.id is null
     or shared_task_value.id is null
     or target_task_value.id is null
     or baseline_value.id is null
     or collect_capability_id_value is null
     or issue_capability_id_value is null
     or consume_capability_id_value is null
     or triage_capability_id_value is null
     or (
       select count(*)
       from public.product_experience_baseline_versions baseline
       where baseline.task_id = shared_task_value.id
         and baseline.project_id = shared_task_value.project_id
         and baseline.platform = 'shared'
         and baseline.environment = 'production'
         and baseline.status = 'owner_approved'
     ) <> 1
     or not exists (
       select 1
       from public.governance_two_party_service_assertions assertion
       where assertion.service_identity =
           'cognitive_product_quality_evaluator'
         and assertion.assertion_hash =
           p_evaluator_assertion_fingerprint
         and assertion.status = 'active'
         and assertion.revoked_at is null
         and 'independent_evaluation' =
           any(assertion.allowed_operations)
         and now_at < assertion.expires_at
     )
     or not exists (
       select 1
       from public.autonomous_system_emergency_states emergency
       where emergency.system_id = 'product_intelligence_operator'
         and emergency.status = 'active'
     )
     or (
       select count(*)
       from public.cognitive_governance_switches switch
       where switch.project_id = target_task_value.project_id
         and switch.environment = 'production'
         and switch.enabled
     ) <> 2
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.project_id = target_task_value.project_id
         and switch.platform = 'android'
         and switch.environment = 'production'
         and switch.switch_key =
           'cognitive_visual_experience_sentinel_enabled'
         and switch.enabled
         and switch.policy_version =
           'provider-independent-visual-live-v2'
     )
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.project_id = target_task_value.project_id
         and switch.platform = 'ios'
         and switch.environment = 'production'
         and switch.switch_key =
           'cognitive_visual_experience_sentinel_enabled'
         and switch.enabled
         and switch.policy_version =
           'provider-independent-ios-visual-live-v1'
     )
     or exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.project_id = target_task_value.project_id
         and switch.environment = 'production'
         and switch.switch_key =
           'cognitive_livekit_experience_sentinel_enabled'
         and switch.enabled
     )
     or exists (
       select 1
       from public.cognitive_level01_schedule_definitions schedule
       where schedule.project_id = target_task_value.project_id
         and schedule.environment = 'production'
         and schedule.enabled
     )
     or exists (
       select 1
       from public.cognitive_livekit_platform_canary_authorizations
         authorization_row
       where authorization_row.target_task_id = target_task_value.id
         and authorization_row.target_platform = p_target_platform
         and not exists (
           select 1
           from public.cognitive_livekit_platform_activation_outcomes outcome
           where outcome.authorization_id = authorization_row.id
         )
     ) then
    raise exception 'livekit_platform_preflight_rejected'
      using errcode = 'P0001';
  end if;

  distribution_value := case p_target_platform
    when 'android' then 'google_play_internal_testing'
    else 'internal_testflight'
  end;
  build_number_value := case p_target_platform
    when 'android' then '84'
    else '8'
  end;
  runtime_version_value := case p_target_platform
    when 'android' then '1.0.0-android-imagemanipulator-v1'
    else '1.0.0-iosqa1'
  end;
  channel_value := case p_target_platform
    when 'android' then 'production'
    else 'ios-qa'
  end;
  internal_update_id_value := case p_target_platform
    when 'android'
      then '019f9c11-33c1-7d23-a0c0-8029c62e0ea4'::uuid
    else '019f9c13-9f6d-7c52-9cee-71265b8fd565'::uuid
  end;
  expires_at_value := now_at + p_validity;

  receipt_hash_value := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'livekit-platform-preflight-v1',
          receipt_id_value,
          shared_task_value.id,
          target_task_value.id,
          target_task_value.project_id,
          p_target_platform::text,
          owner_id,
          baseline_value.id,
          collect_capability_id_value,
          issue_capability_id_value,
          consume_capability_id_value,
          triage_capability_id_value,
          p_collector_assertion_fingerprint,
          p_evaluator_assertion_fingerprint,
          p_installed_artifact_hash,
          p_sandbox_premium_proof_hash,
          p_telemetry_contract_hash,
          p_source_commit,
          p_source_tree_hash,
          p_independent_review_hash,
          p_tests_hash,
          p_deployment_hash,
          p_rollback_hash,
          now_at,
          expires_at_value
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.cognitive_livekit_platform_preflight_receipts(
    id,shared_task_id,target_task_id,project_id,target_platform,
    owner_user_id,baseline_version_id,collect_capability_id,
    issue_capability_id,consume_capability_id,triage_capability_id,
    collector_assertion_fingerprint,evaluator_assertion_fingerprint,
    application_identifier,distribution,app_version,build_number,
    runtime_version,channel,internal_update_id,installed_artifact_hash,
    sandbox_premium_proof_hash,premium_proof_kind,
    role_free_account_attested,manual_grant_absent,real_charge_absent,
    telemetry_contract_hash,source_commit,source_tree_hash,
    independent_review_hash,tests_hash,deployment_hash,rollback_hash,
    receipt_hash,created_at,expires_at
  )
  values (
    receipt_id_value,shared_task_value.id,target_task_value.id,
    target_task_value.project_id,p_target_platform,owner_id,
    baseline_value.id,collect_capability_id_value,
    issue_capability_id_value,consume_capability_id_value,
    triage_capability_id_value,p_collector_assertion_fingerprint,
    p_evaluator_assertion_fingerprint,'com.chillywood.mobile',
    distribution_value,'1.0.0',build_number_value,runtime_version_value,
    channel_value,internal_update_id_value,p_installed_artifact_hash,
    p_sandbox_premium_proof_hash,
    'store_sandbox_revenuecat_backend_installed_v1',
    true,true,true,p_telemetry_contract_hash,p_source_commit,
    p_source_tree_hash,p_independent_review_hash,p_tests_hash,
    p_deployment_hash,p_rollback_hash,receipt_hash_value,now_at,
    expires_at_value
  );

  return jsonb_build_object(
    'preflightReceiptId', receipt_id_value,
    'receiptHash', receipt_hash_value,
    'targetTaskId', target_task_value.id,
    'targetPlatform', p_target_platform,
    'expiresAt', expires_at_value,
    'switchChanged', false,
    'schedulesChanged', false
  );
end;
$$;

revoke all on function
  public.governance_prepare_livekit_platform_preflight(
    public.cognitive_platform,text,text,text,text,text,text,text,
    text,text,text,text,interval
  )
from public,anon,service_role;
grant execute on function
  public.governance_prepare_livekit_platform_preflight(
    public.cognitive_platform,text,text,text,text,text,text,text,
    text,text,text,text,interval
  )
to authenticated;

create function public.governance_open_livekit_platform_canary(
  p_preflight_receipt_id uuid,
  p_validity interval default interval '30 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  receipt_value
    public.cognitive_livekit_platform_preflight_receipts%rowtype;
  target_switch public.cognitive_governance_switches%rowtype;
  authorization_id_value uuid := gen_random_uuid();
  authorization_hash_value text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
  canary_policy_value text;
begin
  select * into receipt_value
  from public.cognitive_livekit_platform_preflight_receipts receipt
  where receipt.id = p_preflight_receipt_id
  for update;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        ':',
        'livekit-platform-authorization',
        receipt_value.target_task_id,
        receipt_value.target_platform::text
      ),
      0
    )
  );

  select * into target_switch
  from public.cognitive_governance_switches switch
  where switch.task_id = receipt_value.target_task_id
    and switch.project_id = receipt_value.project_id
    and switch.platform = receipt_value.target_platform
    and switch.environment = receipt_value.environment
    and switch.switch_key =
      'cognitive_livekit_experience_sentinel_enabled'
  for update;

  if receipt_value.id is null
     or receipt_value.owner_user_id <> owner_id
     or receipt_value.expires_at <= now_at
     or p_validity <= interval '0 seconds'
     or p_validity > interval '30 minutes'
     or target_switch.id is null
     or target_switch.enabled
     or exists (
       select 1
       from public.cognitive_livekit_platform_canary_authorizations
         authorization_row
       where authorization_row.preflight_receipt_id = receipt_value.id
     )
     or exists (
       select 1
       from public.cognitive_livekit_platform_canary_authorizations
         authorization_row
       where authorization_row.target_task_id = receipt_value.target_task_id
         and authorization_row.target_platform =
           receipt_value.target_platform
         and not exists (
           select 1
           from public.cognitive_livekit_platform_activation_outcomes outcome
           where outcome.authorization_id = authorization_row.id
         )
     )
     or not exists (
       select 1
       from public.autonomous_system_emergency_states emergency
       where emergency.system_id = 'product_intelligence_operator'
         and emergency.status = 'active'
     )
     or exists (
       select 1
       from public.cognitive_level01_schedule_definitions schedule
       where schedule.project_id = receipt_value.project_id
         and schedule.environment = 'production'
         and schedule.enabled
     )
     or exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = receipt_value.shared_task_id
         and switch.project_id = receipt_value.project_id
         and switch.platform = 'shared'
         and switch.environment = 'production'
         and switch.switch_key =
           'cognitive_livekit_experience_sentinel_enabled'
         and switch.enabled
     )
     or (
       select count(*)
       from public.cognitive_product_quality_service_capabilities capability
       where capability.id in (
         receipt_value.collect_capability_id,
         receipt_value.issue_capability_id,
         receipt_value.consume_capability_id
       )
         and capability.task_id = receipt_value.target_task_id
         and capability.project_id = receipt_value.project_id
         and capability.platform = receipt_value.target_platform
         and capability.environment = 'production'
         and capability.service_identity =
           'cognitive_livekit_experience_collector'
         and capability.assertion_hash =
           receipt_value.collector_assertion_fingerprint
         and transaction_timestamp() < capability.expires_at
         and not exists (
           select 1
           from public.cognitive_product_quality_service_capability_revocations
             revocation
           where revocation.capability_id = capability.id
         )
     ) <> 3
     or not exists (
       select 1
       from public.cognitive_product_quality_service_capabilities capability
       where capability.id = receipt_value.triage_capability_id
         and capability.service_identity =
           'cognitive_product_quality_triage'
         and capability.operation = 'triage_product_quality'
         and transaction_timestamp() < capability.expires_at
         and not exists (
           select 1
           from public.cognitive_product_quality_service_capability_revocations
             revocation
           where revocation.capability_id = capability.id
         )
     )
     or not exists (
       select 1
       from public.governance_two_party_service_assertions assertion
       where assertion.service_identity =
           'cognitive_product_quality_evaluator'
         and assertion.assertion_hash =
           receipt_value.evaluator_assertion_fingerprint
         and assertion.status = 'active'
         and assertion.revoked_at is null
         and 'independent_evaluation' =
           any(assertion.allowed_operations)
         and now_at < assertion.expires_at
     ) then
    raise exception 'livekit_platform_authorization_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := now_at + p_validity;
  canary_policy_value := case receipt_value.target_platform
    when 'android'
      then 'provider-independent-android-livekit-canary-v1'
    else 'provider-independent-ios-livekit-canary-v1'
  end;

  authorization_hash_value := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'livekit-platform-authorization-v1',
          authorization_id_value,
          receipt_value.id,
          receipt_value.receipt_hash,
          receipt_value.shared_task_id,
          receipt_value.target_task_id,
          receipt_value.project_id,
          receipt_value.target_platform::text,
          owner_id,
          receipt_value.baseline_version_id,
          receipt_value.source_commit,
          receipt_value.source_tree_hash,
          receipt_value.independent_review_hash,
          receipt_value.tests_hash,
          receipt_value.deployment_hash,
          receipt_value.rollback_hash,
          now_at,
          expires_at_value
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.cognitive_livekit_platform_canary_authorizations(
    id,preflight_receipt_id,shared_task_id,target_task_id,project_id,
    target_platform,owner_user_id,baseline_version_id,source_commit,
    source_tree_hash,independent_review_hash,tests_hash,deployment_hash,
    rollback_hash,authorization_hash,opened_at,expires_at
  )
  values (
    authorization_id_value,receipt_value.id,receipt_value.shared_task_id,
    receipt_value.target_task_id,receipt_value.project_id,
    receipt_value.target_platform,owner_id,receipt_value.baseline_version_id,
    receipt_value.source_commit,receipt_value.source_tree_hash,
    receipt_value.independent_review_hash,receipt_value.tests_hash,
    receipt_value.deployment_hash,receipt_value.rollback_hash,
    authorization_hash_value,now_at,expires_at_value
  );

  update public.cognitive_governance_switches
  set enabled = true,
      policy_version = canary_policy_value,
      enabled_by = owner_id,
      enabled_at = now_at,
      disabled_at = null,
      updated_at = now_at
  where id = target_switch.id;

  return jsonb_build_object(
    'authorizationId', authorization_id_value,
    'authorizationHash', authorization_hash_value,
    'targetTaskId', receipt_value.target_task_id,
    'targetPlatform', receipt_value.target_platform,
    'switchKey', target_switch.switch_key,
    'enabled', true,
    'policyVersion', canary_policy_value,
    'expiresAt', expires_at_value
  );
end;
$$;

revoke all on function
  public.governance_open_livekit_platform_canary(uuid,interval)
from public,anon,service_role;
grant execute on function
  public.governance_open_livekit_platform_canary(uuid,interval)
to authenticated;

create function public.governance_finalize_livekit_platform_canary(
  p_authorization_id uuid,
  p_enable boolean,
  p_canary_receipt_hash text,
  p_emergency_stop_receipt_hash text,
  p_principal_rollback_receipt_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  authorization_value
    public.cognitive_livekit_platform_canary_authorizations%rowtype;
  receipt_value
    public.cognitive_livekit_platform_preflight_receipts%rowtype;
  target_switch public.cognitive_governance_switches%rowtype;
  now_at timestamptz := transaction_timestamp();
  sentinel_run_count_value integer := 0;
  evaluator_proof_count_value integer := 0;
  normal_triage_count_value integer := 0;
  fixture_attestation_count_value integer := 0;
  fixture_triage_count_value integer := 0;
  open_finding_count_value integer := 0;
  expected_scenario_count_value integer := 0;
  outcome_id_value uuid := gen_random_uuid();
  outcome_hash_value text;
  final_policy_value text;
begin
  select * into authorization_value
  from public.cognitive_livekit_platform_canary_authorizations
    authorization_row
  where authorization_row.id = p_authorization_id
  for update;

  select * into receipt_value
  from public.cognitive_livekit_platform_preflight_receipts receipt
  where receipt.id = authorization_value.preflight_receipt_id
  for share;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        ':',
        'livekit-platform-authorization',
        authorization_value.target_task_id,
        authorization_value.target_platform::text
      ),
      0
    )
  );

  select * into target_switch
  from public.cognitive_governance_switches switch
  where switch.task_id = authorization_value.target_task_id
    and switch.project_id = authorization_value.project_id
    and switch.platform = authorization_value.target_platform
    and switch.environment = authorization_value.environment
    and switch.switch_key =
      'cognitive_livekit_experience_sentinel_enabled'
  for update;

  select count(*)::integer into sentinel_run_count_value
  from public.product_experience_sentinel_runs run
  where run.task_id = authorization_value.target_task_id
    and run.project_id = authorization_value.project_id
    and run.platform = authorization_value.target_platform
    and run.environment = authorization_value.environment
    and run.sentinel_key = 'livekit_experience_sentinel'
    and run.observation_started_at >= authorization_value.opened_at
    and run.observation_finished_at <= now_at
    and run.erased_at is null;

  select count(*)::integer into evaluator_proof_count_value
  from public.product_experience_sentinel_evaluator_proofs proof
  join public.product_experience_sentinel_runs run
    on run.id = proof.sentinel_run_id
  where run.task_id = authorization_value.target_task_id
    and run.project_id = authorization_value.project_id
    and run.platform = authorization_value.target_platform
    and run.environment = authorization_value.environment
    and run.sentinel_key = 'livekit_experience_sentinel'
    and run.observation_started_at >= authorization_value.opened_at
    and proof.evaluator_identity =
      'cognitive_product_quality_evaluator';

  select count(*)::integer into normal_triage_count_value
  from public.product_experience_sentinel_no_finding_events event
  join public.product_experience_sentinel_runs run
    on run.id = event.sentinel_run_id
  where run.task_id = authorization_value.target_task_id
    and run.project_id = authorization_value.project_id
    and run.platform = authorization_value.target_platform
    and run.environment = authorization_value.environment
    and run.sentinel_key = 'livekit_experience_sentinel'
    and run.observation_started_at >= authorization_value.opened_at
    and event.disposition = 'no_finding'
    and event.consumed_by_identity =
      'cognitive_product_quality_triage';

  select count(*)::integer into fixture_attestation_count_value
  from public.product_experience_livekit_no_finding_attestations attestation
  join public.product_experience_sentinel_runs run
    on run.id = attestation.sentinel_run_id
  where run.task_id = authorization_value.target_task_id
    and run.project_id = authorization_value.project_id
    and run.platform = authorization_value.target_platform
    and run.environment = authorization_value.environment
    and run.observation_started_at >= authorization_value.opened_at;

  select count(*)::integer into fixture_triage_count_value
  from
    public.product_experience_livekit_no_finding_attestation_consumptions
      consumption
  join public.product_experience_sentinel_runs run
    on run.id = consumption.sentinel_run_id
  where run.task_id = authorization_value.target_task_id
    and run.project_id = authorization_value.project_id
    and run.platform = authorization_value.target_platform
    and run.environment = authorization_value.environment
    and run.observation_started_at >= authorization_value.opened_at;

  select count(*)::integer into open_finding_count_value
  from public.product_quality_findings finding
  join public.product_experience_sentinel_runs run
    on run.id = finding.sentinel_run_id
  where run.task_id = authorization_value.target_task_id
    and run.project_id = authorization_value.project_id
    and run.platform = authorization_value.target_platform
    and run.environment = authorization_value.environment
    and run.observation_started_at >= authorization_value.opened_at
    and finding.current_status <> 'resolved'
    and finding.erased_at is null;

  select count(distinct (
    run.route_or_surface,
    run.metric_manifest->'metrics'->>'scenarioType'
  ))::integer
  into expected_scenario_count_value
  from public.product_experience_sentinel_runs run
  where run.task_id = authorization_value.target_task_id
    and run.project_id = authorization_value.project_id
    and run.platform = authorization_value.target_platform
    and run.environment = authorization_value.environment
    and run.sentinel_key = 'livekit_experience_sentinel'
    and run.observation_started_at >= authorization_value.opened_at
    and run.route_or_surface in (
      'live-stage','watch-party-live','chat-call'
    )
    and run.metric_manifest->'metrics'->>'scenarioType' in (
      'success_baseline',
      'bounded_failure_fixture',
      'background_foreground_recovery'
    )
    and run.physical_proof_status = 'installed_ui_observed'
    and (
      (
        run.metric_manifest->'metrics'->>'scenarioType' in (
          'success_baseline','background_foreground_recovery'
        )
        and run.result_status = 'passed'
      )
      or (
        run.metric_manifest->'metrics'->>'scenarioType' =
          'bounded_failure_fixture'
        and run.result_status = 'failed'
      )
    );

  if authorization_value.id is null
     or receipt_value.id is null
     or authorization_value.owner_user_id <> owner_id
     or target_switch.id is null
     or target_switch.enabled is distinct from true
     or target_switch.policy_version <> (case
       when authorization_value.target_platform = 'android'
         then 'provider-independent-android-livekit-canary-v1'
       else 'provider-independent-ios-livekit-canary-v1'
     end)
     or p_canary_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_emergency_stop_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_principal_rollback_receipt_hash !~ '^[a-f0-9]{64}$'
     or exists (
       select 1
       from public.cognitive_livekit_platform_activation_outcomes outcome
       where outcome.authorization_id = authorization_value.id
     )
     or exists (
       select 1
       from public.cognitive_level01_schedule_definitions schedule
       where schedule.project_id = authorization_value.project_id
         and schedule.environment = 'production'
         and schedule.enabled
     )
     or exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = authorization_value.shared_task_id
         and switch.project_id = authorization_value.project_id
         and switch.platform = 'shared'
         and switch.environment = 'production'
         and switch.switch_key =
           'cognitive_livekit_experience_sentinel_enabled'
         and switch.enabled
     )
     or not exists (
       select 1
       from public.autonomous_system_emergency_states emergency
       where emergency.system_id = 'product_intelligence_operator'
         and emergency.status = 'active'
     ) then
    raise exception 'livekit_platform_finalization_rejected'
      using errcode = 'P0001';
  end if;

  if p_enable and (
       now_at >= authorization_value.expires_at
       or expected_scenario_count_value <> 9
       or sentinel_run_count_value < 9
       or evaluator_proof_count_value < 6
       or normal_triage_count_value < 6
       or fixture_attestation_count_value < 3
       or fixture_triage_count_value < 3
       or open_finding_count_value <> 0
       or exists (
         select 1
         from public.product_experience_sentinel_runs run
         where run.task_id = authorization_value.target_task_id
           and run.project_id = authorization_value.project_id
           and run.platform = authorization_value.target_platform
           and run.environment = authorization_value.environment
           and run.sentinel_key = 'livekit_experience_sentinel'
           and run.observation_started_at >=
             authorization_value.opened_at
           and run.metric_manifest->'metrics'->>'scenarioType' in (
             'success_baseline','background_foreground_recovery'
           )
           and not exists (
             select 1
             from public.product_experience_sentinel_evaluator_proofs proof
             join public.product_experience_sentinel_no_finding_events event
               on event.evaluator_proof_id = proof.id
             where proof.sentinel_run_id = run.id
               and proof.evaluator_identity =
                 'cognitive_product_quality_evaluator'
               and event.sentinel_run_id = run.id
               and event.consumed_by_identity =
                 'cognitive_product_quality_triage'
           )
       )
       or exists (
         select 1
         from public.product_experience_sentinel_runs run
         where run.task_id = authorization_value.target_task_id
           and run.project_id = authorization_value.project_id
           and run.platform = authorization_value.target_platform
           and run.environment = authorization_value.environment
           and run.sentinel_key = 'livekit_experience_sentinel'
           and run.observation_started_at >=
             authorization_value.opened_at
           and run.metric_manifest->'metrics'->>'scenarioType' =
             'bounded_failure_fixture'
           and not exists (
             select 1
             from
               public.product_experience_livekit_no_finding_attestations
                 attestation
             join
               public.product_experience_livekit_no_finding_attestation_consumptions
                 consumption
               on consumption.attestation_id = attestation.id
             where attestation.sentinel_run_id = run.id
               and consumption.sentinel_run_id = run.id
           )
       )
     ) then
    raise exception 'livekit_platform_success_evidence_rejected'
      using errcode = 'P0001';
  end if;

  final_policy_value := case
    when p_enable and authorization_value.target_platform = 'android'
      then 'provider-independent-android-livekit-live-v1'
    when p_enable
      then 'provider-independent-ios-livekit-live-v1'
    when authorization_value.target_platform = 'android'
      then 'provider-independent-android-livekit-canary-rolled-back-v1'
    else 'provider-independent-ios-livekit-canary-rolled-back-v1'
  end;

  outcome_hash_value := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'livekit-platform-outcome-v1',
          outcome_id_value,
          authorization_value.id,
          authorization_value.authorization_hash,
          authorization_value.shared_task_id,
          authorization_value.target_task_id,
          authorization_value.project_id,
          authorization_value.target_platform::text,
          owner_id,
          p_enable,
          sentinel_run_count_value,
          evaluator_proof_count_value,
          normal_triage_count_value,
          fixture_attestation_count_value,
          fixture_triage_count_value,
          open_finding_count_value,
          p_canary_receipt_hash,
          p_emergency_stop_receipt_hash,
          p_principal_rollback_receipt_hash,
          now_at
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.cognitive_livekit_platform_activation_outcomes(
    id,authorization_id,shared_task_id,target_task_id,project_id,
    target_platform,owner_user_id,enabled,sentinel_run_count,
    evaluator_proof_count,normal_triage_consumption_count,
    fixture_attestation_count,fixture_triage_consumption_count,
    open_finding_count,canary_receipt_hash,
    emergency_stop_receipt_hash,principal_rollback_receipt_hash,
    outcome_hash,created_at
  )
  values (
    outcome_id_value,authorization_value.id,
    authorization_value.shared_task_id,authorization_value.target_task_id,
    authorization_value.project_id,authorization_value.target_platform,
    owner_id,p_enable,sentinel_run_count_value,
    evaluator_proof_count_value,normal_triage_count_value,
    fixture_attestation_count_value,fixture_triage_count_value,
    open_finding_count_value,p_canary_receipt_hash,
    p_emergency_stop_receipt_hash,p_principal_rollback_receipt_hash,
    outcome_hash_value,now_at
  );

  update public.cognitive_governance_switches
  set enabled = p_enable,
      policy_version = final_policy_value,
      enabled_by = case when p_enable then owner_id else null end,
      enabled_at = case when p_enable then now_at else null end,
      disabled_at = case when p_enable then null else now_at end,
      updated_at = now_at
  where id = target_switch.id;

  return jsonb_build_object(
    'outcomeId', outcome_id_value,
    'outcomeHash', outcome_hash_value,
    'authorizationId', authorization_value.id,
    'targetTaskId', authorization_value.target_task_id,
    'targetPlatform', authorization_value.target_platform,
    'enabled', p_enable,
    'policyVersion', final_policy_value,
    'sentinelRunCount', sentinel_run_count_value,
    'evaluatorProofCount', evaluator_proof_count_value,
    'normalTriageConsumptionCount', normal_triage_count_value,
    'fixtureAttestationCount', fixture_attestation_count_value,
    'fixtureTriageConsumptionCount', fixture_triage_count_value,
    'openFindingCount', open_finding_count_value,
    'completedAt', now_at
  );
end;
$$;

revoke all on function
  public.governance_finalize_livekit_platform_canary(
    uuid,boolean,text,text,text
  )
from public,anon,service_role;
grant execute on function
  public.governance_finalize_livekit_platform_canary(
    uuid,boolean,text,text,text
  )
to authenticated;

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

  select switch.enabled,switch.policy_version
  into switch_enabled,switch_policy_version
  from public.cognitive_governance_switches switch
  where switch.task_id = new.task_id
    and switch.project_id = new.project_id
    and switch.platform = new.platform
    and switch.environment = new.environment
    and switch.switch_key = switch_key_value
  for share;

  if switch_key_value is null
     or switch_enabled is distinct from true then
    raise exception 'product_experience_sentinel_switch_required'
      using errcode = '42501';
  end if;

  if new.sentinel_key = 'visual_product_experience_sentinel'
     and switch_policy_version in (
       'provider-independent-visual-canary-v1',
       'provider-independent-visual-canary-v2',
       'provider-independent-ios-visual-canary-v1'
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
            switch_policy_version in (
              'provider-independent-visual-canary-v2',
              'provider-independent-ios-visual-canary-v1'
            )
            and authorization_row.target_task_id = new.task_id
            and authorization_row.target_platform = new.platform
          )
        )
        and (
          switch_policy_version <>
            'provider-independent-ios-visual-canary-v1'
          or authorization_row.ios_preflight_receipt_id is not null
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
  elsif new.sentinel_key = 'livekit_experience_sentinel'
     and switch_policy_version in (
       'provider-independent-android-livekit-canary-v1',
       'provider-independent-ios-livekit-canary-v1'
     ) then
    select exists (
      select 1
      from public.cognitive_livekit_platform_canary_authorizations
        authorization_row
      join public.cognitive_livekit_platform_preflight_receipts receipt
        on receipt.id = authorization_row.preflight_receipt_id
      where authorization_row.target_task_id = new.task_id
        and authorization_row.project_id = new.project_id
        and authorization_row.target_platform = new.platform
        and authorization_row.environment = new.environment
        and receipt.target_task_id = new.task_id
        and receipt.target_platform = new.platform
        and receipt.project_id = new.project_id
        and receipt.environment = new.environment
        and switch_policy_version = case new.platform
          when 'android'
            then 'provider-independent-android-livekit-canary-v1'
          when 'ios'
            then 'provider-independent-ios-livekit-canary-v1'
          else null
        end
        and transaction_timestamp() < authorization_row.expires_at
        and not exists (
          select 1
          from public.cognitive_livekit_platform_activation_outcomes outcome
          where outcome.authorization_id = authorization_row.id
        )
    ) into canary_authorized;

    if not canary_authorized then
      raise exception 'product_experience_livekit_canary_expired'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.product_experience_lock_exact_sentinel_switch()
from public,anon,authenticated,service_role;

comment on table public.cognitive_livekit_platform_preflight_receipts is
  'Immutable hashes-only Android/iOS installed LiveKit identity, sandbox Premium, telemetry, capability, evaluator, review, deployment, and rollback preflight receipts.';
comment on table public.cognitive_livekit_platform_canary_authorizations is
  'One-use, independently scoped Android/iOS LiveKit canary authorizations; no shared-platform fallback is permitted.';
comment on table public.cognitive_livekit_platform_activation_outcomes is
  'Immutable platform-specific LiveKit final outcomes with normal and bounded-fixture evaluation/triage counts and emergency/principal rollback receipts.';
comment on table
  public.product_experience_livekit_no_finding_attestation_consumptions is
  'Immutable exactly-once triage consumption of an evaluator-only bounded-failure no-finding attestation and its fixture receipt.';
