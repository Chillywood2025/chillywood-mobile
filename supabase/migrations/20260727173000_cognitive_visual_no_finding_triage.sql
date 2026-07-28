-- Permit the provider-independent visual canary to consume its independently
-- evaluated no-finding proof without broadening the existing route-timing
-- contract. Historical deployed migrations remain unchanged.

create function public.product_experience_no_finding_triage_binding_is_valid(
  p_sentinel_key text,
  p_platform public.cognitive_platform,
  p_result_status text,
  p_route_or_surface text,
  p_runtime_identity_hash text,
  p_source_build_hash text,
  p_evidence_manifest_hash text,
  p_physical_proof_status text,
  p_metric_manifest jsonb
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_metric_manifest->>'observationKind' = 'route_timing' then
      public.product_experience_route_timing_no_finding_binding_is_valid(
        p_platform,
        p_route_or_surface,
        p_runtime_identity_hash,
        p_source_build_hash,
        p_evidence_manifest_hash,
        p_physical_proof_status,
        p_metric_manifest
      )
    when p_sentinel_key = 'visual_product_experience_sentinel'
      and p_metric_manifest->>'observationKind' in (
        'touch_target',
        'visual_layout'
      ) then
      p_result_status = 'passed'
      and p_physical_proof_status in (
        'installed_ui_observed',
        'simulator_observed'
      )
      and public.product_experience_metric_manifest_is_bounded(
        p_sentinel_key,
        p_evidence_manifest_hash,
        p_metric_manifest
      )
      and public.product_experience_detailed_metric_manifest_is_valid(
        p_sentinel_key,
        p_platform,
        p_result_status,
        p_metric_manifest
      )
    else false
  end
$$;

revoke all on function
  public.product_experience_no_finding_triage_binding_is_valid(
    text,public.cognitive_platform,text,text,text,text,text,text,jsonb
  )
from public,anon,authenticated,service_role;

create or replace function public.product_quality_triage_no_finding(
  p_sentinel_run_id uuid,
  p_evaluator_proof_id uuid,
  p_evaluator_proof_hash text,
  p_service_identity text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_id uuid;
  run_value public.product_experience_sentinel_runs%rowtype;
  proof_value public.product_experience_sentinel_evaluator_proofs%rowtype;
  consumption_id uuid;
  event_id uuid;
  event_hash_value text;
  route_family_binding_hash_value text;
begin
  select * into run_value
  from public.product_experience_sentinel_runs
  where id = p_sentinel_run_id
  for share;

  if run_value.id is null then
    raise exception 'product_quality_no_finding_triage_rejected'
      using errcode = 'P0001';
  end if;

  capability_id := public.cognitive_product_quality_assert_service_capability(
    p_service_identity,
    'triage_product_quality',
    run_value.task_id,
    run_value.project_id,
    run_value.platform,
    run_value.environment,
    null,
    p_service_assertion
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(run_value.id::text, 0)
  );

  select * into proof_value
  from public.product_experience_sentinel_evaluator_proofs
  where id = p_evaluator_proof_id
  for share;

  route_family_binding_hash_value := case
    when run_value.metric_manifest->>'observationKind' = 'route_timing'
      then run_value.metric_manifest->'metrics'->>'routeFamilyBindingHash'
    else run_value.metric_manifest->'metrics'->>'routeFamilyMappingHash'
  end;

  if capability_id is null
     or p_service_identity <> 'cognitive_product_quality_triage'
     or run_value.result_status <> 'passed'
     or run_value.collector_capability_id is null
     or run_value.erased_at is not null
     or run_value.evaluation_expires_at <= transaction_timestamp()
     or not
       public.product_experience_no_finding_triage_binding_is_valid(
         run_value.sentinel_key,
         run_value.platform,
         run_value.result_status,
         run_value.route_or_surface,
         run_value.runtime_identity_hash,
         run_value.source_build_hash,
         run_value.evidence_manifest_hash,
         run_value.physical_proof_status,
         run_value.metric_manifest
       )
     or proof_value.id is null
     or proof_value.sentinel_run_id <> run_value.id
     or proof_value.task_id <> run_value.task_id
     or proof_value.project_id <> run_value.project_id
     or proof_value.platform <> run_value.platform
     or proof_value.environment <> run_value.environment
     or proof_value.assessment_kind <> 'run_no_finding'
     or proof_value.assessment_hash <>
       public.product_quality_no_finding_assessment_hash(run_value.id)
     or proof_value.evidence_manifest_hash <>
       run_value.evidence_manifest_hash
     or proof_value.verdict <> 'passed'
     or proof_value.evaluator_identity not in (
       'cognitive_independent_evaluator',
       'cognitive_product_quality_evaluator'
     )
     or proof_value.evaluator_proof_hash <> p_evaluator_proof_hash
     or proof_value.valid_until <= transaction_timestamp()
     or exists (
       select 1
       from public.product_quality_findings finding
       where finding.sentinel_run_id = run_value.id
         and finding.erased_at is null
     )
     or not public.governance_task_writes_allowed(
       run_value.task_id,
       run_value.project_id,
       run_value.platform,
       run_value.environment
     ) then
    raise exception 'product_quality_no_finding_triage_rejected'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.product_experience_sentinel_no_finding_events event
    where event.sentinel_run_id = run_value.id
       or event.evaluator_proof_id = proof_value.id
  ) then
    raise exception 'product_quality_no_finding_triage_replay_rejected'
      using errcode = 'P0001';
  end if;

  event_hash_value := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'domain', 'product-sentinel-no-finding-event-v1',
          'sentinelRunId', run_value.id,
          'evaluatorProofId', proof_value.id,
          'assessmentHash', proof_value.assessment_hash,
          'evidenceManifestHash', run_value.evidence_manifest_hash,
          'routeFamilyBindingHash', route_family_binding_hash_value,
          'disposition', 'no_finding'
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into
    public.product_experience_sentinel_evaluator_proof_consumptions(
      evaluator_proof_id,task_id,project_id,platform,environment,
      event_hash,consumed_by_identity
    )
  values (
    proof_value.id,run_value.task_id,run_value.project_id,
    run_value.platform,run_value.environment,event_hash_value,
    p_service_identity
  )
  returning id into consumption_id;

  insert into public.product_experience_sentinel_no_finding_events(
    sentinel_run_id,evaluator_proof_id,proof_consumption_id,
    task_id,project_id,platform,environment,route_or_surface,
    route_family_binding_hash,disposition,finding_id,assessment_hash,
    evidence_manifest_hash,event_hash,consumed_by_identity
  )
  values (
    run_value.id,proof_value.id,consumption_id,
    run_value.task_id,run_value.project_id,run_value.platform,
    run_value.environment,run_value.route_or_surface,
    route_family_binding_hash_value,'no_finding',null,
    proof_value.assessment_hash,run_value.evidence_manifest_hash,
    event_hash_value,p_service_identity
  )
  returning id into event_id;

  return jsonb_build_object(
    'sentinelRunId', run_value.id,
    'evaluatorProofId', proof_value.id,
    'proofConsumptionId', consumption_id,
    'noFindingEventId', event_id,
    'disposition', 'no_finding',
    'eventHash', event_hash_value
  );
end;
$$;

revoke all on function public.product_quality_triage_no_finding(
  uuid,uuid,text,text,text
) from public,anon,authenticated;
grant execute on function public.product_quality_triage_no_finding(
  uuid,uuid,text,text,text
) to service_role;

comment on function
  public.product_experience_no_finding_triage_binding_is_valid(
    text,public.cognitive_platform,text,text,text,text,text,text,jsonb
  ) is
  'Fail-closed triage binding for exact route-timing or provider-independent visual no-finding evidence.';
