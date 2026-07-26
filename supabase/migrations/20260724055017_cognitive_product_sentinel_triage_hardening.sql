-- Forward-only hardening for operational product-sentinel persistence.
--
-- Historical evidence remains immutable and readable. New writes are admitted
-- only through the capability-bound collector and evaluated triage paths.

revoke all on function public.product_experience_record_sentinel_run(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,
  text,text,jsonb,text,text,text,text
) from public, anon, authenticated, service_role;

revoke all on function public.product_quality_record_finding(
  uuid,text,text,text,text,text,text[],text,numeric,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;

grant execute on function public.product_quality_resolution_assessment_hash(
  uuid,uuid,text,text
) to service_role;

create function public.cognitive_lock_task_writes_allowed(
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
begin
  perform 1
  from public.intelligence_tasks task
  where task.id = p_task_id
    and task.project_id = p_project_id
    and task.platform = p_platform
    and task.environment = p_environment
  for share;
  if not found then
    return false;
  end if;

  perform 1
  from public.autonomous_system_emergency_states state
  where state.system_id = 'product_intelligence_operator'
  for share;
  if not found then
    return false;
  end if;

  return public.governance_task_writes_allowed(
    p_task_id, p_project_id, p_platform, p_environment
  );
end;
$$;
revoke all on function public.cognitive_lock_task_writes_allowed(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public, anon, authenticated, service_role;

create function public.product_experience_require_collector_capability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.collector_capability_id is null
     or not public.cognitive_lock_task_writes_allowed(
       new.task_id, new.project_id, new.platform, new.environment
     )
     or not exists (
       select 1
       from public.cognitive_product_quality_service_capabilities capability
       where capability.id = new.collector_capability_id
         and capability.service_identity = 'cognitive_sentinel_collector'
         and capability.operation = 'collect_sentinel_run'
         and capability.task_id = new.task_id
         and capability.project_id = new.project_id
         and capability.platform = new.platform
         and capability.environment = new.environment
         and new.sentinel_key = any(capability.allowed_sentinel_keys)
         and transaction_timestamp() < capability.expires_at
         and not exists (
           select 1
           from public.cognitive_product_quality_service_capability_revocations revocation
           where revocation.capability_id = capability.id
         )
     ) then
    raise exception 'product_experience_collector_capability_required'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.product_experience_require_collector_capability()
  from public, anon, authenticated, service_role;

create trigger product_experience_sentinel_runs_collector_capability_required
before insert on public.product_experience_sentinel_runs
for each row
execute function public.product_experience_require_collector_capability();

create or replace function public.product_quality_require_evaluator_for_collected_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_value public.product_experience_sentinel_runs%rowtype;
  proof_value public.product_experience_sentinel_evaluator_proofs%rowtype;
  expected_finding_key text;
  expected_scope_hash text;
  expected_assessment_hash text;
begin
  select * into run_value
  from public.product_experience_sentinel_runs
  where id = new.sentinel_run_id;

  if run_value.id is null
     or run_value.collector_capability_id is null
     or run_value.erased_at is not null
     or run_value.evaluation_expires_at <= transaction_timestamp()
     or run_value.result_status not in ('failed', 'blocked') then
    raise exception 'product_quality_evaluator_proof_required'
      using errcode = '42501';
  end if;

  expected_finding_key := public.product_quality_expected_finding_key(
    run_value.task_id, run_value.project_id, run_value.platform,
    run_value.environment, new.route_or_surface, new.finding_class
  );
  expected_scope_hash := encode(
    extensions.digest(convert_to(expected_finding_key, 'UTF8'), 'sha256'),
    'hex'
  );
  expected_assessment_hash :=
    public.product_quality_detection_assessment_hash(
      run_value.id, expected_finding_key, new.route_or_surface,
      new.build_runtime_hash, new.severity, new.user_impact_hash,
      new.evidence_hashes, new.suspected_layer, new.confidence,
      new.reproduction_state, new.affected_components_hash,
      new.provider_backend_state_hash,
      new.proposed_next_investigation_hash,
      new.physical_proof_status
    );

  select * into proof_value
  from public.product_experience_sentinel_evaluator_proofs
  where id = new.current_evaluator_proof_id;

  if new.task_id is distinct from run_value.task_id
     or new.project_id is distinct from run_value.project_id
     or new.platform is distinct from run_value.platform
     or new.environment is distinct from run_value.environment
     or new.route_or_surface is distinct from run_value.route_or_surface
     or new.build_runtime_hash is distinct from run_value.source_build_hash
     or new.physical_proof_status is distinct from run_value.physical_proof_status
     or new.finding_key is distinct from expected_finding_key
     or new.finding_scope_hash is distinct from expected_scope_hash
     or new.occurrence_count <> 1
     or new.current_status <> 'open'
     or new.resolved_at is not null
     or new.resolution_hash is not null
     or new.evidence_hashes is null
     or not public.governance_hash_array_valid(new.evidence_hashes, 1, 64)
     or not run_value.evidence_manifest_hash = any(new.evidence_hashes)
     or proof_value.id is null
     or proof_value.sentinel_run_id <> run_value.id
     or proof_value.task_id <> run_value.task_id
     or proof_value.project_id <> run_value.project_id
     or proof_value.platform <> run_value.platform
     or proof_value.environment <> run_value.environment
     or proof_value.assessment_kind <> 'finding_detection'
     or proof_value.assessment_hash <> expected_assessment_hash
     or proof_value.evidence_manifest_hash <> run_value.evidence_manifest_hash
     or proof_value.verdict <> 'passed'
     or proof_value.evaluator_identity <> 'cognitive_independent_evaluator'
     or proof_value.valid_until <= transaction_timestamp() then
    raise exception 'product_quality_evaluator_proof_required'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function public.product_quality_require_evaluator_for_collected_run()
  from public, anon, authenticated, service_role;

create function public.product_quality_lock_current_task_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.erased_at is null
     and new.erased_at is not null
     and old.legal_hold = false
     and new.erased_at >= old.retention_until
     and to_jsonb(new) - 'erased_at' = to_jsonb(old) - 'erased_at' then
    return new;
  end if;

  if not public.cognitive_lock_task_writes_allowed(
    new.task_id, new.project_id, new.platform, new.environment
  ) then
    raise exception 'product_quality_task_not_live'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.product_quality_lock_current_task_state()
  from public, anon, authenticated, service_role;

create trigger product_quality_findings_current_task_live
before insert or update on public.product_quality_findings
for each row
execute function public.product_quality_lock_current_task_state();

comment on function public.cognitive_lock_task_writes_allowed(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) is
  'Locks the exact task and emergency-state rows before rechecking current write liveness, preventing cancellation or emergency-stop races through a sentinel mutation.';

comment on function public.product_experience_require_collector_capability()
  is 'Rejects every newly inserted sentinel run without a live, exact-scope cognitive_sentinel_collector capability; historical null-capability rows are unchanged.';

comment on function public.product_quality_require_evaluator_for_collected_run()
  is 'Table-boundary guard requiring a capability-collected run and exact deterministic passing independent-evaluator assessment for every newly inserted product finding.';

comment on function public.product_quality_resolution_assessment_hash(
  uuid,uuid,text,text
) is
  'Immutable evaluator/triage resolution assessment hash. Service access is read-only; resolution still requires a distinct unexpired evaluator proof and triage capability.';
