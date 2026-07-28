-- Fail-closed, value-free predicate identification for the exact collected-run
-- evaluator-proof trigger. No submitted field or hash is returned.

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
  failed_subpredicate text;
begin
  select * into run_value
  from public.product_experience_sentinel_runs
  where id = new.sentinel_run_id;

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

  failed_subpredicate := case
    when run_value.id is null then 'run_present'
    when run_value.collector_capability_id is null then 'collector_bound'
    when run_value.erased_at is not null then 'run_not_erased'
    when run_value.evaluation_expires_at <= transaction_timestamp()
      then 'run_unexpired'
    when run_value.result_status not in ('failed', 'blocked')
      then 'result_eligible'
    when new.task_id is distinct from run_value.task_id then 'task_bound'
    when new.project_id is distinct from run_value.project_id
      then 'project_bound'
    when new.platform is distinct from run_value.platform then 'platform_bound'
    when new.environment is distinct from run_value.environment
      then 'environment_bound'
    when new.route_or_surface is distinct from run_value.route_or_surface
      then 'route_bound'
    when new.build_runtime_hash is distinct from run_value.source_build_hash
      then 'build_bound'
    when new.physical_proof_status
      is distinct from run_value.physical_proof_status then 'physical_bound'
    when new.finding_key is distinct from expected_finding_key
      then 'finding_key_bound'
    when new.finding_scope_hash is distinct from expected_scope_hash
      then 'finding_scope_bound'
    when new.occurrence_count <> 1 then 'first_occurrence'
    when new.current_status <> 'open' then 'open_status'
    when new.resolved_at is not null then 'unresolved_timestamp'
    when new.resolution_hash is not null then 'unresolved_hash'
    when new.evidence_hashes is null then 'evidence_present'
    when not public.governance_hash_array_valid(new.evidence_hashes, 1, 64)
      then 'evidence_bounded'
    when not run_value.evidence_manifest_hash = any(new.evidence_hashes)
      then 'evidence_manifest_bound'
    when proof_value.id is null then 'proof_present'
    when proof_value.sentinel_run_id <> run_value.id then 'proof_run_bound'
    when proof_value.task_id <> run_value.task_id then 'proof_task_bound'
    when proof_value.project_id <> run_value.project_id
      then 'proof_project_bound'
    when proof_value.platform <> run_value.platform then 'proof_platform_bound'
    when proof_value.environment <> run_value.environment
      then 'proof_environment_bound'
    when proof_value.assessment_kind <> 'finding_detection'
      then 'proof_kind_bound'
    when proof_value.assessment_hash <> expected_assessment_hash
      then 'proof_assessment_bound'
    when proof_value.evidence_manifest_hash <> run_value.evidence_manifest_hash
      then 'proof_evidence_bound'
    when proof_value.verdict <> 'passed' then 'proof_verdict_passed'
    when proof_value.evaluator_identity not in (
      'cognitive_independent_evaluator',
      'cognitive_product_quality_evaluator'
    ) then 'proof_identity_allowed'
    when proof_value.valid_until <= transaction_timestamp()
      then 'proof_unexpired'
    else null
  end;

  if failed_subpredicate is not null then
    raise exception 'product_quality_evaluator_proof_required:%',
      failed_subpredicate
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.product_quality_require_evaluator_for_collected_run()
  from public, anon, authenticated, service_role;
