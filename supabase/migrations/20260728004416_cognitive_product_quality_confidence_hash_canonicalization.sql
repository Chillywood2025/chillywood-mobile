-- Numeric confidence is stored as numeric(5,4), while evaluator inputs arrive
-- as unscaled numeric values. Canonicalize only numeric scale so equal values
-- bind to the same assessment hash without changing any assessment field.

create or replace function public.product_quality_detection_assessment_hash(
  p_sentinel_run_id uuid,
  p_finding_key text,
  p_route_or_surface text,
  p_build_runtime_hash text,
  p_severity text,
  p_user_impact_hash text,
  p_evidence_hashes text[],
  p_suspected_layer text,
  p_confidence numeric,
  p_reproduction_state text,
  p_affected_components_hash text,
  p_provider_backend_state_hash text,
  p_proposed_next_investigation_hash text,
  p_physical_proof_status text
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'affectedComponentsHash', p_affected_components_hash,
          'buildRuntimeHash', p_build_runtime_hash,
          'confidence', pg_catalog.trim_scale(p_confidence),
          'evidenceHashes', to_jsonb(p_evidence_hashes),
          'findingKey', p_finding_key,
          'physicalProofStatus', p_physical_proof_status,
          'proposedNextInvestigationHash', p_proposed_next_investigation_hash,
          'providerBackendStateHash', p_provider_backend_state_hash,
          'reproductionState', p_reproduction_state,
          'routeOrSurface', p_route_or_surface,
          'sentinelRunId', p_sentinel_run_id,
          'severity', p_severity,
          'suspectedLayer', p_suspected_layer,
          'userImpactHash', p_user_impact_hash
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function public.product_quality_detection_assessment_hash(
  uuid,text,text,text,text,text,text[],text,numeric,text,text,text,text,text
) from public, anon, authenticated, service_role;

comment on function public.product_quality_detection_assessment_hash(
  uuid,text,text,text,text,text,text[],text,numeric,text,text,text,text,text
)
is
  'Canonical immutable detection assessment hash; confidence is numeric-scale invariant and every reviewed assessment field remains bound.';
