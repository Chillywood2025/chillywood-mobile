-- Forward-only closure for three reviewed Level 0/1 evidence gaps:
--   * independently evaluated healthy/no-finding sentinel evidence;
--   * an exact objective-accessibility source binding for the Home main tab;
--   * fail-closed rejection of caller-labelled LiveKit failure fixtures until
--     an Owner-approved deterministic injector and immutable plan exist.
--
-- The immutable Option-C baseline and its hash are not amended here.

alter table public.product_experience_sentinel_evaluator_proofs
  drop constraint
    product_experience_sentinel_evaluator_pro_assessment_kind_check;
alter table public.product_experience_sentinel_evaluator_proofs
  add constraint
    product_experience_sentinel_evaluator_pro_assessment_kind_check
  check (
    assessment_kind in (
      'finding_detection',
      'finding_resolution',
      'run_no_finding'
    )
  );

create unique index
  product_experience_sentinel_one_no_finding_proof_idx
on public.product_experience_sentinel_evaluator_proofs(sentinel_run_id)
where assessment_kind = 'run_no_finding';

create function public.product_experience_route_timing_no_finding_is_valid(
  p_metric_manifest jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  metrics jsonb;
  elapsed_duration_ms numeric;
begin
  if jsonb_typeof(p_metric_manifest) <> 'object'
     or p_metric_manifest->>'observationKind' <> 'route_timing'
     or jsonb_typeof(p_metric_manifest->'metrics') <> 'object' then
    return false;
  end if;

  metrics := p_metric_manifest->'metrics';
  if jsonb_typeof(metrics->'elapsedDurationMs') <> 'number'
     or jsonb_typeof(metrics->'timeoutObserved') <> 'boolean' then
    return false;
  end if;

  elapsed_duration_ms := (metrics->>'elapsedDurationMs')::numeric;
  return elapsed_duration_ms between 0 and 10000
    and metrics->>'networkState' = 'ready'
    and metrics->'timeoutObserved' = 'false'::jsonb;
exception
  when numeric_value_out_of_range then
    return false;
end;
$$;

revoke all on function
  public.product_experience_route_timing_no_finding_is_valid(jsonb)
from public,anon,authenticated,service_role;

create function public.product_quality_no_finding_assessment_hash(
  p_sentinel_run_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'domain', 'product-sentinel-run-no-finding-v1',
          'sentinelRunId', run.id,
          'taskId', run.task_id,
          'projectId', run.project_id,
          'platform', run.platform,
          'environment', run.environment,
          'sentinelKey', run.sentinel_key,
          'routeOrSurface', run.route_or_surface,
          'runtimeIdentityHash', run.runtime_identity_hash,
          'sourceBuildHash', run.source_build_hash,
          'evidenceManifestHash', run.evidence_manifest_hash,
          'metricManifestHash', encode(
            extensions.digest(
              convert_to(run.metric_manifest::text, 'UTF8'),
              'sha256'
            ),
            'hex'
          ),
          'resultStatus', run.result_status,
          'physicalProofStatus', run.physical_proof_status,
          'collectorCapabilityId', run.collector_capability_id,
          'observationStartedAt', run.observation_started_at,
          'observationFinishedAt', run.observation_finished_at,
          'evaluationExpiresAt', run.evaluation_expires_at
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.product_experience_sentinel_runs run
  where run.id = p_sentinel_run_id
    and run.result_status = 'passed'
    and run.physical_proof_status in (
      'installed_ui_observed',
      'simulator_observed'
    )
    and run.collector_capability_id is not null
    and run.erased_at is null
    and (
      run.metric_manifest->>'observationKind' <> 'route_timing'
      or
        public.product_experience_route_timing_no_finding_is_valid(
          run.metric_manifest
        )
    )
$$;

revoke all on function
  public.product_quality_no_finding_assessment_hash(uuid)
from public,anon,authenticated,service_role;

create function public.product_quality_validate_no_finding_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_value public.product_experience_sentinel_runs%rowtype;
  expected_hash text;
begin
  if new.assessment_kind <> 'run_no_finding' then
    return new;
  end if;

  select * into run_value
  from public.product_experience_sentinel_runs run
  where run.id = new.sentinel_run_id
  for share;

  expected_hash :=
    public.product_quality_no_finding_assessment_hash(new.sentinel_run_id);

  if run_value.id is null
     or run_value.result_status <> 'passed'
     or run_value.physical_proof_status not in (
       'installed_ui_observed',
       'simulator_observed'
     )
     or run_value.collector_capability_id is null
     or run_value.erased_at is not null
     or run_value.evaluation_expires_at <= transaction_timestamp()
     or new.verdict not in ('passed', 'rejected')
     or new.assessment_hash is distinct from expected_hash
     or new.evidence_manifest_hash <>
        run_value.evidence_manifest_hash
     or (
       new.verdict = 'passed'
       and exists (
         select 1
         from public.product_quality_findings finding
         where finding.sentinel_run_id = run_value.id
       )
     )
     or not public.governance_task_writes_allowed(
       run_value.task_id,
       run_value.project_id,
       run_value.platform,
       run_value.environment
     ) then
    raise exception 'product_quality_no_finding_proof_rejected'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function
  public.product_quality_validate_no_finding_proof()
from public,anon,authenticated,service_role;

create trigger
  product_experience_sentinel_no_finding_proof_validation
before insert on public.product_experience_sentinel_evaluator_proofs
for each row
execute function public.product_quality_validate_no_finding_proof();

do $extend_no_finding_proof_kind$
declare
  target regprocedure :=
    'public.product_quality_record_sentinel_evaluator_proof(uuid,text,text,text,text,text,text,text,text)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(target);
  needle constant text :=
    '''finding_detection'', ''finding_resolution''';
  replacement constant text :=
    '''finding_detection'', ''finding_resolution'', ''run_no_finding''';
begin
  if (
    length(definition) - length(replace(definition, needle, ''))
  ) / length(needle) <> 1 then
    raise exception 'product_quality_no_finding_kind_patch_rejected'
      using errcode = 'P0001';
  end if;
  execute replace(definition, needle, replacement);
end;
$extend_no_finding_proof_kind$;

create function
  cognitive_runtime.product_quality_no_finding_assessment_hash(
    p_sentinel_run_id uuid
  )
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_product_quality_evaluator',
    'compute_no_finding_hash'
  );
  return public.product_quality_no_finding_assessment_hash(
    p_sentinel_run_id
  );
end;
$$;

revoke all on function
  cognitive_runtime.product_quality_no_finding_assessment_hash(uuid)
from public,anon,authenticated,service_role;
grant execute on function
  cognitive_runtime.product_quality_no_finding_assessment_hash(uuid)
to cognitive_product_quality_evaluator;

-- The baseline mapping list remains immutable. This supplemental binding is
-- valid only for objective accessibility-floor evaluation.
create function
  public.product_experience_objective_accessibility_binding_is_valid(
    p_metrics jsonb
  )
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_metrics) = 'object'
    and p_metrics->>'routeFamilyMappingId' =
      'home_main_tab_navigation_control'
    and p_metrics->>'routeFamilyMappingHash' =
      '3b6e2cf28d5041e97de6ab4eec5d006c2c5ae7b37b74823904a8645bc923d6e0'
    and p_metrics->>'componentIdentityHash' =
      'b6b6e64a3375935b849019fbeedd8fd07f02e7a76e938aea3b6e1a0189a7fddc'
    and p_metrics->>'surfaceFamily' =
      'non_media_interactive_surface'
    and p_metrics->>'exceptionContractId' =
      'non_streaming_discovery_route_v1'
    and p_metrics->>'exceptionContractHash' =
      public.product_experience_baseline_v1_exception_hash(
        'non_streaming_discovery_route_v1'
      )
    and p_metrics->'exceptionVersioned' = 'true'::jsonb
    and p_metrics->>'exceptionType' = 'non_media_surface'
    and p_metrics->>'targetClassification' <>
      'meets_wcag_aa_minimum_only',
    false
  )
$$;

revoke all on function
  public.product_experience_objective_accessibility_binding_is_valid(jsonb)
from public,anon,authenticated,service_role;

create function
  public.product_experience_enforce_objective_accessibility_run_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.metric_manifest->>'observationKind' = 'touch_target'
     and (
       (
         new.route_or_surface = 'Home main tab'
         and (
           new.metric_manifest->'metrics'->>'routeFamilyMappingId' <>
             'home_main_tab_navigation_control'
           or new.metric_manifest->'metrics'->>'componentIdentityHash' <>
             'b6b6e64a3375935b849019fbeedd8fd07f02e7a76e938aea3b6e1a0189a7fddc'
         )
       )
       or (
         new.metric_manifest->'metrics'->>'routeFamilyMappingId' =
           'home_main_tab_navigation_control'
         and (
           new.route_or_surface <> 'Home main tab'
           or new.metric_manifest->'metrics'->>'componentIdentityHash' <>
             'b6b6e64a3375935b849019fbeedd8fd07f02e7a76e938aea3b6e1a0189a7fddc'
         )
       )
     ) then
    raise exception
      'product_experience_objective_accessibility_binding_rejected'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function
  public.product_experience_enforce_objective_accessibility_run_binding()
from public,anon,authenticated,service_role;

create trigger product_experience_objective_accessibility_run_binding
before insert or update of
  route_or_surface, metric_manifest
on public.product_experience_sentinel_runs
for each row
execute function
  public.product_experience_enforce_objective_accessibility_run_binding();

create or replace function
  public.product_experience_option_c_touch_target_is_valid(
    p_platform public.cognitive_platform,
    p_result_status text,
    p_metrics jsonb
  )
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (
      public.product_experience_baseline_v1_evidence_binding_is_valid(
        p_metrics
      )
      or public.product_experience_objective_accessibility_binding_is_valid(
        p_metrics
      )
    )
    and p_metrics ?& array[
      'interactiveAncestorActuallyInteractive',
      'interactiveAncestorRolePresent',
      'interactiveAncestorClickActionPresent',
      'interactiveAncestorIsTargetContainer'
    ]
    and (
      (
        p_metrics->'interactiveAncestorPresent' = 'true'::jsonb
        and p_metrics->'interactiveAncestorActuallyInteractive' =
          'true'::jsonb
        and p_metrics->'interactiveAncestorRolePresent' = 'true'::jsonb
        and p_metrics->'interactiveAncestorClickActionPresent' =
          'true'::jsonb
        and p_metrics->'interactiveAncestorIsTargetContainer' =
          'true'::jsonb
      )
      or (
        p_metrics->'interactiveAncestorPresent' = 'false'::jsonb
        and p_metrics->'interactiveAncestorActuallyInteractive' =
          'false'::jsonb
        and p_metrics->'interactiveAncestorRolePresent' = 'false'::jsonb
        and p_metrics->'interactiveAncestorClickActionPresent' =
          'false'::jsonb
        and p_metrics->'interactiveAncestorIsTargetContainer' =
          'false'::jsonb
        and p_metrics->'interactiveAncestorWidth' = 'null'::jsonb
        and p_metrics->'interactiveAncestorHeight' = 'null'::jsonb
      )
    )
    and public.product_experience_option_c_touch_target_is_valid_pre_contract_binding(
      p_platform,
      p_result_status,
      case
        when p_metrics->>'baselineComparisonHash' =
          '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
        then jsonb_set(
          p_metrics,
          '{baselineComparisonHash}',
          '"0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184"'::jsonb
        )
        else p_metrics
      end
    )
$$;

revoke all on function
  public.product_experience_option_c_touch_target_is_valid(
    public.cognitive_platform,text,jsonb
  )
from public,anon,authenticated,service_role;

alter function public.product_experience_option_c_visual_layout_is_valid(
  public.cognitive_platform,text,jsonb
) rename to
  product_experience_option_c_visual_layout_is_valid_pre_web_preference;

create function
  public.product_experience_web_preferred_touch_deviation_is_valid(
    p_metrics jsonb
  )
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  target_width numeric;
  target_height numeric;
begin
  if jsonb_typeof(p_metrics) <> 'object'
     or jsonb_typeof(p_metrics->'interactiveTargetWidth') <> 'number'
     or jsonb_typeof(p_metrics->'interactiveTargetHeight') <> 'number' then
    return false;
  end if;

  target_width := (p_metrics->>'interactiveTargetWidth')::numeric;
  target_height := (p_metrics->>'interactiveTargetHeight')::numeric;

  return p_metrics->>'observedClassification' =
      'product_preference_deviation'
    and p_metrics->>'baselineState' = 'approved_baseline'
    and p_metrics->>'baselineComparisonHash' =
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
    and p_metrics->>'evidenceQuality' in (
      'measured_installed',
      'measured_simulator'
    )
    and p_metrics->>'automationStatus' = 'observed'
    and p_metrics->'accessibilityNamePresent' = 'true'::jsonb
    and p_metrics->'accessibilityRolePresent' = 'true'::jsonb
    and target_width >= 24
    and target_height >= 24
    and (target_width < 44 or target_height < 44)
    and
      public.product_experience_option_c_visual_layout_is_valid_pre_web_preference(
        'web',
        'failed',
        jsonb_set(
          p_metrics,
          '{observedClassification}',
          to_jsonb('confirmed_baseline_violation'::text),
          false
        )
      );
exception
  when numeric_value_out_of_range then
    return false;
end;
$$;

create function public.product_experience_option_c_visual_layout_is_valid(
  p_platform public.cognitive_platform,
  p_result_status text,
  p_metrics jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    public.product_experience_option_c_visual_layout_is_valid_pre_web_preference(
      p_platform,
      p_result_status,
      p_metrics
    )
    or (
      p_platform = 'web'
      and p_result_status in ('failed','finding_created')
      and
        public.product_experience_web_preferred_touch_deviation_is_valid(
          p_metrics
        )
      )
$$;

revoke all on function
  public.product_experience_option_c_visual_layout_is_valid(
    public.cognitive_platform,text,jsonb
  )
from public,anon,authenticated,service_role;
revoke all on function
  public.product_experience_option_c_visual_layout_is_valid_pre_web_preference(
    public.cognitive_platform,text,jsonb
  )
from public,anon,authenticated,service_role;
revoke all on function
  public.product_experience_web_preferred_touch_deviation_is_valid(jsonb)
from public,anon,authenticated,service_role;

-- A caller label is not a failure injector. Until a reviewed immutable fixture
-- plan exists, the collector rejects the label and no finding/proof trigger may
-- treat it as a no-finding fixture.
create or replace function
  public.product_experience_livekit_bounded_failure_fixture_is_valid(
    p_result_status text,
    p_metric_manifest jsonb
  )
returns boolean
language sql
immutable
set search_path = ''
as $$
  select false
$$;

create function
  public.product_experience_reject_unbound_livekit_failure_fixture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sentinel_key = 'livekit_experience_sentinel'
     and new.metric_manifest->>'observationKind' =
       'livekit_experience'
     and new.metric_manifest->'metrics'->>'scenarioType' =
       'bounded_failure_fixture' then
    raise exception 'livekit_fixture_plan_required'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function
  public.product_experience_reject_unbound_livekit_failure_fixture()
from public,anon,authenticated,service_role;

create trigger product_experience_unbound_livekit_failure_fixture_rejected
before insert or update of metric_manifest
on public.product_experience_sentinel_runs
for each row
execute function
  public.product_experience_reject_unbound_livekit_failure_fixture();

revoke all on function
  cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(
    uuid,text,text,text,text
  )
from cognitive_product_quality_evaluator;

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
    ('cognitive_product_quality_evaluator', 'read_active_baseline'),
    ('cognitive_product_quality_evaluator', 'compute_detection_hash'),
    ('cognitive_product_quality_evaluator', 'compute_no_finding_hash'),
    ('cognitive_product_quality_evaluator', 'compute_resolution_hash'),
    ('cognitive_product_quality_evaluator', 'evaluate_product_baseline'),
    ('cognitive_product_quality_evaluator', 'record_sentinel_evaluator_proof'),
    ('cognitive_product_quality_evaluator', 'read_product_quality_snapshot'),
    ('cognitive_product_quality_triage', 'triage_detection'),
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
  )
$$;

revoke all on function
  cognitive_runtime.runtime_operation_allowed(text,text)
from public,anon,authenticated,service_role;

do $harden_scheduler_sentinel_proof_pairing$
declare
  target regprocedure :=
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(target);
  needle constant text := 'and proof.valid_until > now_at';
  replacement constant text :=
    $proof_pairing$
      and proof.created_at >= now_at - interval '7 days'
      and proof.created_at <= now_at
      and (
        (
          run.result_status = 'passed'
          and proof.assessment_kind = 'run_no_finding'
        )
        or (
          run.result_status = 'failed'
          and proof.assessment_kind = 'finding_detection'
        )
      )
    $proof_pairing$;
begin
  if (
    length(definition) - length(replace(definition, needle, ''))
  ) / length(needle) <> 1 then
    raise exception 'scheduler_sentinel_proof_pairing_patch_rejected'
      using errcode = 'P0001';
  end if;
  execute replace(definition, needle, replacement);
end;
$harden_scheduler_sentinel_proof_pairing$;

comment on function
  public.product_quality_no_finding_assessment_hash(uuid)
is
  'Deterministic database-bound hash for one passed physical sentinel run; used only by the independent product evaluator.';
comment on function
  public.product_experience_objective_accessibility_binding_is_valid(jsonb)
is
  'Exact source binding for objective accessibility-floor evaluation; does not amend Option C or authorize visual-density findings.';
comment on function
  public.product_experience_livekit_bounded_failure_fixture_is_valid(text,jsonb)
is
  'Fail-closed until an Owner-approved deterministic LiveKit failure injector emits a single-use immutable plan receipt.';
