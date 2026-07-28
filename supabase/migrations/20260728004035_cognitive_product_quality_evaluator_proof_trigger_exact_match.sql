-- Keep the collected-run finding trigger aligned with the reviewed evaluator
-- proof contract. The prior negative disjunction rejected the production
-- cognitive_product_quality_evaluator proof even though every individual
-- binding predicate matched. This formulation preserves the same predicates
-- as one explicit positive match and remains fail closed.

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
  proof_matches boolean := false;
begin
  select * into run_value
  from public.product_experience_sentinel_runs
  where id = new.sentinel_run_id;

  if run_value.id is null then
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

  proof_matches :=
    run_value.collector_capability_id is not null
    and run_value.erased_at is null
    and run_value.evaluation_expires_at > transaction_timestamp()
    and run_value.result_status in ('failed', 'blocked')
    and new.task_id is not distinct from run_value.task_id
    and new.project_id is not distinct from run_value.project_id
    and new.platform is not distinct from run_value.platform
    and new.environment is not distinct from run_value.environment
    and new.route_or_surface is not distinct from run_value.route_or_surface
    and new.build_runtime_hash is not distinct from run_value.source_build_hash
    and new.physical_proof_status
      is not distinct from run_value.physical_proof_status
    and new.finding_key is not distinct from expected_finding_key
    and new.finding_scope_hash is not distinct from expected_scope_hash
    and new.occurrence_count = 1
    and new.current_status = 'open'
    and new.resolved_at is null
    and new.resolution_hash is null
    and new.evidence_hashes is not null
    and public.governance_hash_array_valid(new.evidence_hashes, 1, 64)
    and run_value.evidence_manifest_hash = any(new.evidence_hashes)
    and proof_value.id is not null
    and proof_value.sentinel_run_id = run_value.id
    and proof_value.task_id = run_value.task_id
    and proof_value.project_id = run_value.project_id
    and proof_value.platform = run_value.platform
    and proof_value.environment = run_value.environment
    and proof_value.assessment_kind = 'finding_detection'
    and proof_value.assessment_hash = expected_assessment_hash
    and proof_value.evidence_manifest_hash = run_value.evidence_manifest_hash
    and proof_value.verdict = 'passed'
    and proof_value.evaluator_identity in (
      'cognitive_independent_evaluator',
      'cognitive_product_quality_evaluator'
    )
    and proof_value.valid_until > transaction_timestamp();

  if proof_matches is not true then
    raise exception 'product_quality_evaluator_proof_required'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.product_quality_require_evaluator_for_collected_run()
  from public, anon, authenticated, service_role;

comment on function public.product_quality_require_evaluator_for_collected_run()
is
  'Fail-closed exact match between a collected run, its finding row, and an unexpired independent or product-quality evaluator proof.';
