-- Close the remaining advisory-model authority gaps without enabling any
-- switch or granting model output approval, evaluator, quorum, or tool power.
--
-- The accepted credential row referenced here is produced only by the existing
-- provider-attestation -> independent-evaluation -> Owner-acceptance chain. The
-- database persists only its public fingerprint and bounded scope hashes.

alter table public.cognitive_model_router_capabilities
  add column credential_attestation_id uuid,
  add column credential_public_fingerprint_hash text,
  add column credential_scope_manifest_hash text,
  add column credential_expires_at timestamptz;

alter table public.cognitive_model_router_preflight_audits
  add column credential_attestation_id uuid,
  add column credential_public_fingerprint_hash text,
  add column credential_scope_manifest_hash text,
  add column credential_expires_at timestamptz;

-- This operationalization source has never been activated. Refuse to invent
-- credential provenance for any unexpected pre-existing model authority.
do $$
begin
  if exists (select 1 from public.cognitive_model_router_capabilities)
     or exists (select 1 from public.cognitive_model_router_preflight_audits) then
    raise exception 'model_router_credential_binding_requires_empty_state'
      using errcode = 'P0001';
  end if;
end
$$;

alter table public.cognitive_model_router_capabilities
  alter column credential_attestation_id set not null,
  alter column credential_public_fingerprint_hash set not null,
  alter column credential_scope_manifest_hash set not null,
  alter column credential_expires_at set not null,
  add constraint cognitive_model_router_capability_credential_fingerprint_check
    check (credential_public_fingerprint_hash ~ '^[a-f0-9]{64}$'),
  add constraint cognitive_model_router_capability_credential_scope_check
    check (credential_scope_manifest_hash ~ '^[a-f0-9]{64}$'),
  add constraint cognitive_model_router_capability_credential_expiry_check
    check (
      credential_expires_at > issued_at
      and expires_at <= credential_expires_at
    ),
  add foreign key (
    credential_attestation_id,task_id,project_id,platform,environment
  ) references public.cognitive_level01_credential_attestations(
    id,task_id,project_id,platform,environment
  );

alter table public.cognitive_model_router_preflight_audits
  alter column credential_attestation_id set not null,
  alter column credential_public_fingerprint_hash set not null,
  alter column credential_scope_manifest_hash set not null,
  alter column credential_expires_at set not null,
  add constraint cognitive_model_router_preflight_credential_fingerprint_check
    check (credential_public_fingerprint_hash ~ '^[a-f0-9]{64}$'),
  add constraint cognitive_model_router_preflight_credential_scope_check
    check (credential_scope_manifest_hash ~ '^[a-f0-9]{64}$'),
  add constraint cognitive_model_router_preflight_credential_expiry_check
    check (credential_expires_at > created_at),
  add foreign key (
    credential_attestation_id,task_id,project_id,platform,environment
  ) references public.cognitive_level01_credential_attestations(
    id,task_id,project_id,platform,environment
  );

create function public.cognitive_model_router_bind_preflight_credential()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_value public.cognitive_model_router_capabilities%rowtype;
  current_attestation public.cognitive_level01_credential_attestations%rowtype;
  now_at timestamptz := transaction_timestamp();
begin
  select * into capability_value
  from public.cognitive_model_router_capabilities capability
  where capability.id = new.capability_id
    and capability.task_id = new.task_id
    and capability.project_id = new.project_id
    and capability.platform = new.platform
    and capability.environment = new.environment
  for share;

  select * into current_attestation
  from public.cognitive_level01_credential_attestations attestation
  where attestation.task_id = new.task_id
    and attestation.project_id = new.project_id
    and attestation.platform = new.platform
    and attestation.environment = new.environment
    and attestation.credential_kind = 'model_provider'
  order by attestation.verified_at desc,attestation.id desc
  limit 1
  for share;

  if capability_value.id is null
     or current_attestation.id is null
     or current_attestation.id <> capability_value.credential_attestation_id
     or current_attestation.state <> 'configured'
     or now_at >= current_attestation.expires_at
     or current_attestation.public_fingerprint_hash
       <> capability_value.credential_public_fingerprint_hash
     or current_attestation.scope_manifest_hash
       <> capability_value.credential_scope_manifest_hash
     or current_attestation.expires_at <> capability_value.credential_expires_at
     or new.configured_model_identity_hash <> encode(extensions.digest(
       convert_to(concat_ws(
         '|',capability_value.provider_family,capability_value.model_family,
         capability_value.model_name
       ),'UTF8'),'sha256'
     ),'hex') then
    raise exception 'model_router_credential_attestation_rejected'
      using errcode = 'P0001';
  end if;

  new.credential_attestation_id := current_attestation.id;
  new.credential_public_fingerprint_hash :=
    current_attestation.public_fingerprint_hash;
  new.credential_scope_manifest_hash := current_attestation.scope_manifest_hash;
  new.credential_expires_at := current_attestation.expires_at;
  return new;
end;
$$;
revoke all on function public.cognitive_model_router_bind_preflight_credential()
  from public,anon,authenticated,service_role;

create trigger cognitive_model_router_preflight_credential_guard
before insert on public.cognitive_model_router_preflight_audits
for each row execute function public.cognitive_model_router_bind_preflight_credential();

create function public.cognitive_model_router_guard_result_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preflight_value public.cognitive_model_router_preflight_audits%rowtype;
  capability_value public.cognitive_model_router_capabilities%rowtype;
  current_attestation public.cognitive_level01_credential_attestations%rowtype;
  now_at timestamptz := transaction_timestamp();
begin
  -- This is the same row lock used by recovery. It makes recovery and result
  -- settlement mutually exclusive even when another reservation remains open.
  select * into preflight_value
  from public.cognitive_model_router_preflight_audits preflight
  where preflight.id = new.preflight_id
  for update;

  if preflight_value.id is null
     or exists (
       select 1
       from public.cognitive_model_router_recovery_audits recovery
       where recovery.preflight_id = new.preflight_id
     ) then
    raise exception 'model_router_settlement_recovered'
      using errcode = 'P0001';
  end if;

  if new.result_status <> 'completed' then
    return new;
  end if;

  select * into capability_value
  from public.cognitive_model_router_capabilities capability
  where capability.id = preflight_value.capability_id
  for share;

  select * into current_attestation
  from public.cognitive_level01_credential_attestations attestation
  where attestation.task_id = preflight_value.task_id
    and attestation.project_id = preflight_value.project_id
    and attestation.platform = preflight_value.platform
    and attestation.environment = preflight_value.environment
    and attestation.credential_kind = 'model_provider'
  order by attestation.verified_at desc,attestation.id desc
  limit 1
  for share;

  if capability_value.id is null
     or current_attestation.id is null
     or current_attestation.state <> 'configured'
     or now_at >= current_attestation.expires_at
     or current_attestation.id <> capability_value.credential_attestation_id
     or current_attestation.id <> preflight_value.credential_attestation_id
     or current_attestation.public_fingerprint_hash
       <> capability_value.credential_public_fingerprint_hash
     or current_attestation.public_fingerprint_hash
       <> preflight_value.credential_public_fingerprint_hash
     or current_attestation.scope_manifest_hash
       <> capability_value.credential_scope_manifest_hash
     or current_attestation.scope_manifest_hash
       <> preflight_value.credential_scope_manifest_hash
     or current_attestation.expires_at <> capability_value.credential_expires_at
     or current_attestation.expires_at <> preflight_value.credential_expires_at
     then
    raise exception 'model_router_credential_attestation_rejected'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke all on function public.cognitive_model_router_guard_result_settlement()
  from public,anon,authenticated,service_role;

create trigger cognitive_model_router_result_settlement_guard
before insert on public.cognitive_model_router_result_audits
for each row execute function public.cognitive_model_router_guard_result_settlement();

create or replace function public.governance_owner_register_model_router_capability(
  p_approved_execution_id uuid,
  p_budget_id uuid,
  p_council_role text,
  p_required_switch_key text,
  p_provider_family text,
  p_model_family text,
  p_model_name text,
  p_maximum_calls integer,
  p_maximum_model_tokens bigint,
  p_maximum_model_cost numeric,
  p_scope_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  execution_value public.governance_approved_action_executions%rowtype;
  budget_value public.intelligence_budgets%rowtype;
  current_attestation public.cognitive_level01_credential_attestations%rowtype;
  switch_enabled boolean;
  capability_id_value uuid;
  now_at timestamptz := transaction_timestamp();
begin
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_approved_execution_id
  for update;

  if execution_value.id is null
     or execution_value.service_identity <> 'cognitive_approved_action_worker'
     or execution_value.provider <> 'model'
     or execution_value.operation <> 'model_advisory'
     or execution_value.state <> 'executing'
     or not public.governance_lock_approved_execution_liveness(
       execution_value.id
     ) then
    raise exception 'model_router_owner_capability_rejected'
      using errcode = 'P0001';
  end if;

  select * into budget_value
  from public.intelligence_budgets
  where id = p_budget_id
    and task_id = execution_value.task_id
    and project_id = execution_value.project_id
    and platform = execution_value.platform
    and environment = execution_value.environment
  for update;

  select switch.enabled into switch_enabled
  from public.cognitive_governance_switches switch
  where switch.task_id = execution_value.task_id
    and switch.project_id = execution_value.project_id
    and switch.platform = execution_value.platform
    and switch.environment = execution_value.environment
    and switch.switch_key = p_required_switch_key
  for share;

  select * into current_attestation
  from public.cognitive_level01_credential_attestations attestation
  where attestation.task_id = execution_value.task_id
    and attestation.project_id = execution_value.project_id
    and attestation.platform = execution_value.platform
    and attestation.environment = execution_value.environment
    and attestation.credential_kind = 'model_provider'
  order by attestation.verified_at desc,attestation.id desc
  limit 1
  for share;

  if budget_value.id is null
     or now_at >= budget_value.deadline_at
     or switch_enabled is distinct from true
     or current_attestation.id is null
     or current_attestation.state <> 'configured'
     or now_at >= current_attestation.expires_at
     or p_council_role not in (
       'product_user_experience','architecture_engineering',
       'security_privacy','reliability_release','safety_trust',
       'accessibility_inclusion','money_commercial_policy',
       'research_futures','adversarial_red_team'
     )
     or p_required_switch_key not in (
       'cognitive_research_enabled','cognitive_memory_enabled',
       'cognitive_collective_deliberation_enabled',
       'cognitive_draft_pr_executor_enabled',
       'cognitive_scheduled_level01_enabled',
       'cognitive_livekit_experience_sentinel_enabled',
       'cognitive_visual_experience_sentinel_enabled',
       'cognitive_installed_journey_sentinel_enabled'
     )
     or p_provider_family <> 'openai'
     or p_model_family !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$'
     or p_model_name !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$'
     or (
       p_model_name <> p_model_family
       and p_model_name not like p_model_family || '-%'
     )
     or p_maximum_calls not between 1 and 10
     or p_maximum_model_tokens not between 128 and 100000
     or p_maximum_model_cost not between 0.0001 and 5
     or p_maximum_model_tokens > (
       budget_value.max_model_tokens - budget_value.used_model_tokens
     )
     or p_maximum_model_cost > (
       budget_value.max_model_cost - budget_value.used_model_cost
     )
     or p_scope_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now_at
     or p_expires_at > now_at + interval '24 hours'
     or p_expires_at > current_attestation.expires_at then
    raise exception 'model_router_owner_capability_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_model_router_capabilities(
    approved_execution_id,task_id,project_id,platform,environment,
    council_role,required_switch_key,provider_family,model_family,
    model_name,budget_id,maximum_calls,maximum_model_tokens,
    maximum_model_cost,approval_target_hash,scope_hash,registered_by,
    expires_at,credential_attestation_id,
    credential_public_fingerprint_hash,credential_scope_manifest_hash,
    credential_expires_at
  ) values (
    execution_value.id,execution_value.task_id,execution_value.project_id,
    execution_value.platform,execution_value.environment,p_council_role,
    p_required_switch_key,p_provider_family,p_model_family,p_model_name,
    p_budget_id,p_maximum_calls,p_maximum_model_tokens,
    p_maximum_model_cost,execution_value.target_resource_hash,p_scope_hash,
    owner_id,p_expires_at,current_attestation.id,
    current_attestation.public_fingerprint_hash,
    current_attestation.scope_manifest_hash,current_attestation.expires_at
  )
  returning id into capability_id_value;

  return capability_id_value;
end;
$$;

revoke all on function public.governance_owner_register_model_router_capability(
  uuid,uuid,text,text,text,text,text,integer,bigint,numeric,text,timestamptz
) from public,anon,service_role;
grant execute on function public.governance_owner_register_model_router_capability(
  uuid,uuid,text,text,text,text,text,integer,bigint,numeric,text,timestamptz
) to authenticated;

alter table public.governance_two_party_service_assertions
  drop constraint
    governance_two_party_service_assertion_allowed_operations_check;
alter table public.governance_two_party_service_assertions
  add constraint
    governance_two_party_service_assertion_allowed_operations_check
  check (
    cardinality(allowed_operations) between 1 and 64
    and allowed_operations <@ array[
      'bootstrap_control_plane','set_switch','public_research_ingest',
      'collective_deliberation','model_independence_attestation',
      'model_advisory','livekit_experience_canary',
      'visual_experience_canary','installed_journey_canary',
      'product_quality_triage','github_draft_pr',
      'independent_evaluation'
    ]::text[]
  );

create or replace function public.governance_register_two_party_service_principal(
  p_service_identity text,
  p_assertion_hash text,
  p_allowed_operations text[],
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  evidence_hash_value text;
begin
  if p_service_identity not in (
       'cognitive_approved_action_worker',
       'product_experience_baseline_service',
       'livekit_experience_sentinel',
       'visual_product_experience_sentinel',
       'installed_journey_sentinel',
       'product_quality_triage_router',
       'model_independence_attestation_service',
       'cognitive_independent_evaluator'
     )
     or p_assertion_hash !~ '^[a-f0-9]{64}$'
     or p_allowed_operations is null
     or cardinality(p_allowed_operations) not between 1 and 64
     or not p_allowed_operations <@ array[
       'bootstrap_control_plane','set_switch','public_research_ingest',
       'collective_deliberation','model_independence_attestation',
       'model_advisory','livekit_experience_canary',
       'visual_experience_canary','installed_journey_canary',
       'product_quality_triage','github_draft_pr',
       'independent_evaluation'
     ]::text[]
     or exists (
       select 1
       from unnest(p_allowed_operations) allowed_operation
       where not public.governance_service_identity_allows_operation(
         p_service_identity,allowed_operation
       )
     )
     or p_expires_at <= transaction_timestamp()
     or p_expires_at > transaction_timestamp() + interval '365 days' then
    raise exception 'two_party_service_principal_registration_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.governance_two_party_service_assertions(
    service_identity,assertion_hash,allowed_operations,registered_by,
    status,issued_at,expires_at,revoked_at,revoked_by,revocation_hash
  ) values (
    p_service_identity,p_assertion_hash,p_allowed_operations,owner_id,
    'active',transaction_timestamp(),p_expires_at,null,null,null
  )
  on conflict (service_identity) do update
    set assertion_hash = excluded.assertion_hash,
        allowed_operations = excluded.allowed_operations,
        registered_by = excluded.registered_by,
        status = 'active',
        issued_at = transaction_timestamp(),
        expires_at = excluded.expires_at,
        revoked_at = null,
        revoked_by = null,
        revocation_hash = null;

  evidence_hash_value := encode(extensions.digest(
    convert_to(p_service_identity || ':' || p_assertion_hash,'UTF8'),
    'sha256'
  ),'hex');

  insert into public.governance_audit_events(
    task_id,project_id,platform,environment,entity_type,entity_id,
    event_type,actor_identity_hash,evidence_hash
  )
  select task.id,task.project_id,task.platform,task.environment,
    'switch',task.id,'two_party_service_identity_registered',
    encode(extensions.digest(
      convert_to(owner_id::text,'UTF8'),'sha256'
    ),'hex'),
    evidence_hash_value
  from public.intelligence_tasks task
  where task.task_key = 'cognitive-level01-canary-control'
  order by task.created_at
  limit 1;

  return jsonb_build_object(
    'serviceIdentity',p_service_identity,
    'status','registered',
    'assertionHash',p_assertion_hash,
    'expiresAt',p_expires_at
  );
end;
$$;
revoke all on function public.governance_register_two_party_service_principal(
  text,text,text[],timestamptz
) from public,anon,service_role;
grant execute on function public.governance_register_two_party_service_principal(
  text,text,text[],timestamptz
) to authenticated;

create or replace function public.governance_record_owner_approval(
  p_decision_manifest_id uuid,
  p_approval_key text,
  p_objective_hash text,
  p_plan_snapshot_hash text,
  p_source_commit text,
  p_architecture_graph_digest text,
  p_approval_scope_hash text,
  p_repository_full_name text,
  p_branch_name text,
  p_provider text,
  p_operation text,
  p_target_resource_hash text,
  p_path_scope_hashes text[],
  p_table_scope_hashes text[],
  p_function_scope_hashes text[],
  p_budget_hash text,
  p_maximum_cost numeric,
  p_maximum_calls integer,
  p_maximum_bytes bigint,
  p_maximum_executions integer,
  p_tests_hash text,
  p_required_test_ids text[],
  p_evaluator_requirement_hash text,
  p_rollback_hash text,
  p_validity interval default interval '24 hours'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  decision_value public.governance_decision_manifests%rowtype;
  approval_record_id uuid;
  approval_version_id uuid;
  approval_hash_value text;
  owner_hash text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
begin
  select * into decision_value
  from public.governance_decision_manifests
  where id = p_decision_manifest_id
  for share;

  if decision_value.id is null
     or decision_value.status <> 'finalized'
     or decision_value.model_independence_status
       <> 'MODEL_INDEPENDENCE_VERIFIED'
     or decision_value.model_independence_assessment_id is null
     or decision_value.model_independence_evidence_hash is null
     or now_at >= decision_value.expires_at
     or exists (
       select 1 from public.governance_vetoes veto
       where veto.deliberation_id = decision_value.deliberation_id
         and veto.mandatory and veto.status = 'active'
     )
     or p_approval_key is null
     or length(p_approval_key) not between 8 and 160
     or public.cognitive_text_has_secret(p_approval_key)
     or public.cognitive_text_has_private_identifier(p_approval_key)
     or p_objective_hash !~ '^[a-f0-9]{64}$'
     or p_plan_snapshot_hash !~ '^[a-f0-9]{64}$'
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_source_commit <> decision_value.source_commit
     or p_architecture_graph_digest !~ '^[a-f0-9]{64}$'
     or p_architecture_graph_digest <> decision_value.architecture_graph_digest
     or p_approval_scope_hash !~ '^[a-f0-9]{64}$'
     or p_approval_scope_hash <> decision_value.capability_scope_hash
     or p_repository_full_name <> 'Chillywood2025/chillywood-mobile'
     or p_branch_name !~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
     or p_branch_name ~* '(^|/)(main|master|release)(/|$)'
     or p_provider not in (
       'repository','github_draft_pr','public_research','model','none',
       'livekit','visual_sentinel','installed_journey'
     )
     or p_operation not in (
       'bootstrap_control_plane','set_switch','public_research_ingest',
       'collective_deliberation','model_independence_attestation',
       'model_advisory','livekit_experience_canary',
       'visual_experience_canary','installed_journey_canary',
       'product_quality_triage','github_draft_pr'
     )
     or (p_operation = 'model_advisory' and p_provider <> 'model')
     or p_target_resource_hash !~ '^[a-f0-9]{64}$'
     or not public.governance_hash_array_valid(
       p_path_scope_hashes,0,128
     )
     or not public.governance_hash_array_valid(
       coalesce(p_table_scope_hashes,'{}'::text[]),0,128
     )
     or not public.governance_hash_array_valid(
       coalesce(p_function_scope_hashes,'{}'::text[]),0,64
     )
     or p_budget_hash !~ '^[a-f0-9]{64}$'
     or p_budget_hash <> decision_value.budget_hash
     or p_maximum_cost not between 0 and 100
     or p_maximum_calls not between 1 and 100
     or p_maximum_bytes not between 1 and 10000000
     or p_maximum_executions < 1
     or p_maximum_executions > decision_value.maximum_executions
     or p_tests_hash !~ '^[a-f0-9]{64}$'
     or p_required_test_ids is null
     or cardinality(p_required_test_ids) not between 1 and 128
     or not decision_value.required_test_ids <@ p_required_test_ids
     or p_evaluator_requirement_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash <> decision_value.rollback_hash
     or p_validity <= interval '0 seconds'
     or p_validity > interval '24 hours' then
    raise exception 'two_party_owner_approval_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := least(now_at + p_validity,decision_value.expires_at);
  owner_hash := encode(extensions.digest(
    convert_to(owner_id::text,'UTF8'),'sha256'
  ),'hex');
  approval_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|',decision_value.id::text,decision_value.decision_hash,p_approval_key,
    p_objective_hash,p_plan_snapshot_hash,p_source_commit,
    p_architecture_graph_digest,p_approval_scope_hash,p_repository_full_name,
    p_branch_name,p_provider,p_operation,p_target_resource_hash,
    array_to_string(p_path_scope_hashes,','),
    array_to_string(coalesce(p_table_scope_hashes,'{}'::text[]),','),
    array_to_string(coalesce(p_function_scope_hashes,'{}'::text[]),','),
    p_budget_hash,p_maximum_cost::text,p_maximum_calls::text,
    p_maximum_bytes::text,p_maximum_executions::text,p_tests_hash,
    array_to_string(p_required_test_ids,','),p_evaluator_requirement_hash,
    p_rollback_hash,owner_id::text,now_at::text,expires_at_value::text
  ),'UTF8'),'sha256'),'hex');

  insert into public.governance_owner_approval_records(
    decision_manifest_id,task_id,project_id,platform,environment,
    approval_key,objective_hash,owner_user_id,current_version,
    current_state,maximum_executions,executions_claimed,
    executions_completed,approval_hash,created_at,updated_at
  ) values (
    decision_value.id,decision_value.task_id,decision_value.project_id,
    decision_value.platform,decision_value.environment,p_approval_key,
    p_objective_hash,owner_id,1,'active',p_maximum_executions,0,0,
    approval_hash_value,now_at,now_at
  ) returning id into approval_record_id;

  insert into public.governance_owner_approval_versions(
    approval_record_id,decision_manifest_id,task_id,project_id,platform,
    environment,version_number,owner_user_id,owner_identity_hash,
    decision_manifest_hash,plan_snapshot_hash,source_commit,
    architecture_graph_digest,approval_scope_hash,objective_hash,
    repository_full_name,branch_name,provider,operation,target_resource_hash,
    path_scope_hashes,table_scope_hashes,function_scope_hashes,budget_hash,
    maximum_cost,maximum_calls,maximum_bytes,maximum_executions,tests_hash,
    required_test_ids,evaluator_requirement_hash,rollback_hash,approval_hash,
    approved_at,valid_from,expires_at
  ) values (
    approval_record_id,decision_value.id,decision_value.task_id,
    decision_value.project_id,decision_value.platform,
    decision_value.environment,1,owner_id,owner_hash,
    decision_value.decision_hash,p_plan_snapshot_hash,p_source_commit,
    p_architecture_graph_digest,p_approval_scope_hash,p_objective_hash,
    p_repository_full_name,p_branch_name,p_provider,p_operation,
    p_target_resource_hash,p_path_scope_hashes,
    coalesce(p_table_scope_hashes,'{}'::text[]),
    coalesce(p_function_scope_hashes,'{}'::text[]),p_budget_hash,
    p_maximum_cost,p_maximum_calls,p_maximum_bytes,p_maximum_executions,
    p_tests_hash,p_required_test_ids,p_evaluator_requirement_hash,
    p_rollback_hash,approval_hash_value,now_at,now_at,expires_at_value
  ) returning id into approval_version_id;

  insert into public.governance_owner_approval_version_states(
    approval_version_id,approval_record_id,task_id,project_id,platform,
    environment,state,maximum_executions
  ) values (
    approval_version_id,approval_record_id,decision_value.task_id,
    decision_value.project_id,decision_value.platform,
    decision_value.environment,'active',p_maximum_executions
  );

  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id,approval_version_id,task_id,project_id,platform,
    environment,event_sequence,event_type,event_hash,actor_identity_hash
  ) values (
    approval_record_id,approval_version_id,decision_value.task_id,
    decision_value.project_id,decision_value.platform,
    decision_value.environment,1,'owner_approved',approval_hash_value,
    owner_hash
  );

  return jsonb_build_object(
    'approvalId',approval_record_id,
    'approvalVersionId',approval_version_id,
    'approvalVersion',1,
    'approvalHash',approval_hash_value,
    'status','active',
    'approvedAt',now_at,
    'expiresAt',expires_at_value,
    'remainingExecutionAllowance',p_maximum_executions
  );
end;
$$;
revoke all on function public.governance_record_owner_approval(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text[],
  text[],text[],text,numeric,integer,bigint,integer,text,text[],text,text,
  interval
) from public,anon,service_role;
grant execute on function public.governance_record_owner_approval(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text[],
  text[],text[],text,numeric,integer,bigint,integer,text,text[],text,text,
  interval
) to authenticated;

create function public.cognitive_model_router_sweep_expired(
  p_limit integer,
  p_recovery_batch_hash text,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_entry record;
  recovery_result jsonb;
  recovered_count integer := 0;
  remaining_count integer;
begin
  perform public.cognitive_verify_service_token(
    'cognitive_model_router',p_service_identity_token
  );
  if p_limit not between 1 and 10
     or p_recovery_batch_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'model_router_sweep_rejected' using errcode = 'P0001';
  end if;

  for capability_entry in
    select preflight.capability_id,min(preflight.lease_expires_at) first_expiry
    from public.cognitive_model_router_preflight_audits preflight
    where preflight.lease_expires_at <= transaction_timestamp()
      and not exists (
        select 1 from public.cognitive_model_router_result_audits result
        where result.preflight_id = preflight.id
      )
      and not exists (
        select 1 from public.cognitive_model_router_recovery_audits recovery
        where recovery.preflight_id = preflight.id
      )
    group by preflight.capability_id
    order by first_expiry,preflight.capability_id
    limit p_limit
  loop
    remaining_count := p_limit - recovered_count;
    exit when remaining_count <= 0;
    recovery_result := public.cognitive_model_router_recover_expired(
      capability_entry.capability_id,
      remaining_count,
      p_recovery_batch_hash,
      p_service_identity_token
    );
    recovered_count := recovered_count
      + coalesce((recovery_result->>'recoveredCount')::integer,0);
  end loop;

  return jsonb_build_object(
    'recoveredCount',recovered_count,
    'recoveryBatchHash',p_recovery_batch_hash,
    'maximumRecoveries',p_limit,
    'serviceIdentity','cognitive_model_router'
  );
end;
$$;
revoke all on function public.cognitive_model_router_sweep_expired(
  integer,text,text
) from public,anon,authenticated;
grant execute on function public.cognitive_model_router_sweep_expired(
  integer,text,text
) to service_role;

comment on column
  public.cognitive_model_router_capabilities.credential_attestation_id is
  'Exact accepted model-provider credential attestation. No secret material.';
comment on column
  public.cognitive_model_router_preflight_audits.credential_attestation_id is
  'Immutable accepted credential identity bound at reservation time.';
comment on function public.cognitive_model_router_sweep_expired(
  integer,text,text
) is
  'Service-token-bound, ten-item maximum maintenance reachability for expired model reservations. Each recovered item retains its immutable recovery and budget audit.';
