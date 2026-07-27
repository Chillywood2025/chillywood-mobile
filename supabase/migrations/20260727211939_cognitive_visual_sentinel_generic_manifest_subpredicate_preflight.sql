-- Exact read-only decomposition of the generic visual metric-manifest gate.
--
-- This migration creates no authorization, capability, switch, schedule, run,
-- finding, proof, or receipt. It does not change the generic validator. The
-- collector can ask only for fourteen PASS/FAIL results and the first exact
-- failed subpredicate; submitted values and hashes are never returned.

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
  select (p_principal, p_operation) in (
    ('cognitive_product_baseline_executor', 'claim_approved_action'),
    ('cognitive_product_baseline_executor', 'begin_approved_execution'),
    ('cognitive_product_baseline_executor', 'stage_product_baseline'),
    ('cognitive_product_baseline_executor', 'complete_approved_execution'),
    ('cognitive_product_baseline_executor', 'persist_product_baseline'),
    ('cognitive_product_baseline_executor', 'fail_approved_execution'),
    ('cognitive_sentinel_collector', 'collect_sentinel_run'),
    (
      'cognitive_sentinel_collector',
      'preflight_visual_sentinel_collection'
    ),
    (
      'cognitive_sentinel_collector',
      'preflight_visual_generic_manifest_predicates'
    ),
    ('cognitive_product_quality_evaluator', 'read_active_baseline'),
    ('cognitive_product_quality_evaluator', 'compute_detection_hash'),
    ('cognitive_product_quality_evaluator', 'compute_no_finding_hash'),
    ('cognitive_product_quality_evaluator', 'compute_resolution_hash'),
    ('cognitive_product_quality_evaluator', 'evaluate_product_baseline'),
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
    ('cognitive_product_quality_triage', 'triage_detection'),
    ('cognitive_product_quality_triage', 'triage_no_finding'),
    ('cognitive_product_quality_triage', 'triage_resolution'),
    ('cognitive_public_research_broker', 'record_research_source'),
    ('cognitive_public_research_broker', 'record_research_claim'),
    ('cognitive_public_research_broker', 'detect_research_contradiction'),
    ('cognitive_public_research_broker', 'expire_research'),
    ('cognitive_research_evaluator', 'derive_research_evaluation'),
    ('cognitive_research_evaluator', 'resolve_research_contradiction'),
    ('cognitive_research_evaluator', 'read_research_snapshot'),
    ('cognitive_model_router', 'recover_model_reservation'),
    ('cognitive_model_router', 'reserve_model_invocation'),
    ('cognitive_model_router', 'record_model_provider_overrun'),
    ('cognitive_model_router', 'settle_model_invocation'),
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
    ('cognitive_level01_scheduler', 'read_scheduler_status'),
    ('cognitive_level01_scheduler', 'issue_recurring_child_task')
  );
$$;

revoke all on function
  cognitive_runtime.runtime_operation_allowed(text,text)
from public,anon,authenticated,service_role;

create function public.product_experience_generic_manifest_predicates(
  p_sentinel_key text,
  p_evidence_manifest_hash text,
  p_metric_manifest jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  manifest_is_json_object boolean := false;
  total_manifest_size_bounded boolean := false;
  manifest_is_sanitized boolean := false;
  schema_version_valid boolean := false;
  sanitization_version_valid boolean := false;
  observation_kind_is_string boolean := false;
  metrics_is_json_object boolean := false;
  metrics_key_count_bounded boolean := false;
  metrics_size_bounded boolean := false;
  evidence_hashes_is_array boolean := false;
  evidence_hash_count_bounded boolean := false;
  evidence_hash_format_valid boolean := false;
  evidence_manifest_hash_bound boolean := false;
  visual_observation_kind_valid boolean := false;
  failed_subpredicate text;
begin
  begin
    manifest_is_json_object :=
      jsonb_typeof(p_metric_manifest) = 'object';
    total_manifest_size_bounded :=
      pg_column_size(p_metric_manifest) <= 65536;
    manifest_is_sanitized :=
      public.cognitive_json_is_sanitized(p_metric_manifest);
    schema_version_valid :=
      p_metric_manifest->>'schemaVersion' = 'product-sentinel-v1';
    sanitization_version_valid :=
      p_metric_manifest->>'sanitizationVersion' =
        'bounded-nonpersonal-v1';
    observation_kind_is_string :=
      jsonb_typeof(p_metric_manifest->'observationKind') = 'string';
    metrics_is_json_object :=
      jsonb_typeof(p_metric_manifest->'metrics') = 'object';
    metrics_key_count_bounded :=
      metrics_is_json_object
      and (
        select count(*)
        from jsonb_object_keys(p_metric_manifest->'metrics')
      ) between 1 and 64;
    metrics_size_bounded :=
      p_metric_manifest ? 'metrics'
      and pg_column_size(p_metric_manifest->'metrics') <= 49152;
    evidence_hashes_is_array :=
      jsonb_typeof(p_metric_manifest->'evidenceHashes') = 'array';
    evidence_hash_count_bounded :=
      evidence_hashes_is_array
      and jsonb_array_length(p_metric_manifest->'evidenceHashes')
        between 1 and 32;
    evidence_hash_format_valid :=
      evidence_hashes_is_array
      and not exists (
        select 1
        from jsonb_array_elements(
          p_metric_manifest->'evidenceHashes'
        ) item
        where jsonb_typeof(item) <> 'string'
          or trim(both '"' from item::text) !~ '^[a-f0-9]{64}$'
      );
    evidence_manifest_hash_bound :=
      evidence_hashes_is_array
      and exists (
        select 1
        from jsonb_array_elements_text(
          p_metric_manifest->'evidenceHashes'
        ) item(value)
        where item.value = p_evidence_manifest_hash
      );
    visual_observation_kind_valid :=
      p_sentinel_key = 'visual_product_experience_sentinel'
      and p_metric_manifest->>'observationKind' in (
        'visual_layout',
        'touch_target'
      );
  exception
    when others then
      -- Each result remains fail-closed and contains no submitted value.
      null;
  end;

  manifest_is_json_object := coalesce(manifest_is_json_object, false);
  total_manifest_size_bounded :=
    coalesce(total_manifest_size_bounded, false);
  manifest_is_sanitized := coalesce(manifest_is_sanitized, false);
  schema_version_valid := coalesce(schema_version_valid, false);
  sanitization_version_valid :=
    coalesce(sanitization_version_valid, false);
  observation_kind_is_string :=
    coalesce(observation_kind_is_string, false);
  metrics_is_json_object := coalesce(metrics_is_json_object, false);
  metrics_key_count_bounded :=
    coalesce(metrics_key_count_bounded, false);
  metrics_size_bounded := coalesce(metrics_size_bounded, false);
  evidence_hashes_is_array :=
    coalesce(evidence_hashes_is_array, false);
  evidence_hash_count_bounded :=
    coalesce(evidence_hash_count_bounded, false);
  evidence_hash_format_valid :=
    coalesce(evidence_hash_format_valid, false);
  evidence_manifest_hash_bound :=
    coalesce(evidence_manifest_hash_bound, false);
  visual_observation_kind_valid :=
    coalesce(visual_observation_kind_valid, false);

  failed_subpredicate := case
    when not manifest_is_json_object then 'manifest_is_json_object'
    when not total_manifest_size_bounded then 'total_manifest_size_bounded'
    when not manifest_is_sanitized then 'cognitive_json_is_sanitized'
    when not schema_version_valid then 'schema_version'
    when not sanitization_version_valid then 'sanitization_version'
    when not observation_kind_is_string then 'observation_kind_is_string'
    when not metrics_is_json_object then 'metrics_is_json_object'
    when not metrics_key_count_bounded then 'metrics_key_count_bounded'
    when not metrics_size_bounded then 'metrics_size_bounded'
    when not evidence_hashes_is_array then 'evidence_hashes_is_array'
    when not evidence_hash_count_bounded then 'evidence_hash_count_bounded'
    when not evidence_hash_format_valid then 'evidence_hash_format'
    when not evidence_manifest_hash_bound then 'evidence_manifest_hash_bound'
    when not visual_observation_kind_valid then 'visual_observation_kind'
    else null
  end;

  return jsonb_build_object(
    'checks',
    jsonb_build_object(
      '01_manifest_is_json_object',
      case when manifest_is_json_object then 'PASS' else 'FAIL' end,
      '02_total_manifest_size_bounded',
      case when total_manifest_size_bounded then 'PASS' else 'FAIL' end,
      '03_cognitive_json_is_sanitized',
      case when manifest_is_sanitized then 'PASS' else 'FAIL' end,
      '04_schema_version',
      case when schema_version_valid then 'PASS' else 'FAIL' end,
      '05_sanitization_version',
      case when sanitization_version_valid then 'PASS' else 'FAIL' end,
      '06_observation_kind_is_string',
      case when observation_kind_is_string then 'PASS' else 'FAIL' end,
      '07_metrics_is_json_object',
      case when metrics_is_json_object then 'PASS' else 'FAIL' end,
      '08_metrics_key_count_bounded',
      case when metrics_key_count_bounded then 'PASS' else 'FAIL' end,
      '09_metrics_size_bounded',
      case when metrics_size_bounded then 'PASS' else 'FAIL' end,
      '10_evidence_hashes_is_array',
      case when evidence_hashes_is_array then 'PASS' else 'FAIL' end,
      '11_evidence_hash_count_bounded',
      case when evidence_hash_count_bounded then 'PASS' else 'FAIL' end,
      '12_evidence_hash_format',
      case when evidence_hash_format_valid then 'PASS' else 'FAIL' end,
      '13_evidence_manifest_hash_bound',
      case when evidence_manifest_hash_bound then 'PASS' else 'FAIL' end,
      '14_visual_observation_kind',
      case when visual_observation_kind_valid then 'PASS' else 'FAIL' end
    ),
    'failedSubpredicate',
    failed_subpredicate
  );
end;
$$;

revoke all on function
  public.product_experience_generic_manifest_predicates(text,text,jsonb)
from public,anon,authenticated,service_role;

create function
  cognitive_runtime.preflight_visual_generic_manifest_predicates(
    p_sentinel_key text,
    p_evidence_manifest_hash text,
    p_metric_manifest jsonb
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_sentinel_collector',
    'preflight_visual_generic_manifest_predicates'
  );

  return public.product_experience_generic_manifest_predicates(
    p_sentinel_key,
    p_evidence_manifest_hash,
    p_metric_manifest
  );
end;
$$;

revoke all on function
  cognitive_runtime.preflight_visual_generic_manifest_predicates(
    text,text,jsonb
  )
from public,anon,authenticated,service_role;

grant execute on function
  cognitive_runtime.preflight_visual_generic_manifest_predicates(
    text,text,jsonb
  )
to cognitive_sentinel_collector;

comment on function
  cognitive_runtime.preflight_visual_generic_manifest_predicates(
    text,text,jsonb
  )
is
  'Read-only collector-bound decomposition of the fourteen generic visual metric-manifest checks. Returns PASS/FAIL and the first failed subpredicate only; never submitted values, hashes, evidence, authorization, or mutable state.';
