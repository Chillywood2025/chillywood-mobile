-- Read-only predicate diagnostics for the exact Android visual-sentinel write
-- boundary. This migration does not open an authorization, enable a switch,
-- create or rotate a capability, or persist evidence.

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

create or replace function cognitive_runtime.preflight_visual_sentinel_collection(
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text,
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
  p_service_assertion text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  prior_request_role text :=
    current_setting('request.jwt.claim.role', true);
  platform_value public.cognitive_platform;
  environment_value public.cognitive_environment;
  runtime_principal_valid boolean := false;
  nested_claim_established boolean := false;
  capability_current boolean := false;
  assertion_digest_matches boolean := false;
  sentinel_key_allowed boolean := false;
  capability_scope_matches boolean := false;
  task_scope_matches boolean := false;
  task_state_allows_writes boolean := false;
  emergency_allows_writes boolean := false;
  exact_switch_enabled boolean := false;
  authorization_open boolean := false;
  route_value_bounded boolean := false;
  runtime_identity_hash_valid boolean := false;
  source_build_hash_valid boolean := false;
  evidence_manifest_hash_valid boolean := false;
  idempotency_hash_valid_unused boolean := false;
  status_physical_pair_valid boolean := false;
  observation_timestamps_valid boolean := false;
  evaluation_expiry_valid boolean := false;
  generic_metric_manifest_bounded boolean := false;
  visual_metric_detail_valid boolean := false;
  effective_baseline_valid boolean := false;
  no_conflicting_run boolean := false;
  allowed_value boolean := false;
  failed_predicate text;
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_sentinel_collector',
    'preflight_visual_sentinel_collection'
  );
  runtime_principal_valid := true;

  begin
    platform_value := p_platform::public.cognitive_platform;
    environment_value := p_environment::public.cognitive_environment;
  exception
    when others then
      platform_value := null;
      environment_value := null;
  end;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    nested_claim_established :=
      current_setting('request.jwt.claim.role', true) = 'service_role';

    capability_current :=
      platform_value is not null
      and environment_value is not null
      and exists (
        select 1
        from public.cognitive_product_quality_service_capabilities capability
        where capability.service_identity = 'cognitive_sentinel_collector'
          and capability.operation = 'collect_sentinel_run'
          and public.governance_exact_owner(capability.registered_by)
          and capability.task_id = p_task_id
          and capability.project_id = p_project_id
          and capability.platform = platform_value
          and capability.environment = environment_value
          and transaction_timestamp() < capability.expires_at
          and not exists (
            select 1
            from public.cognitive_product_quality_service_capability_revocations
              revocation
            where revocation.capability_id = capability.id
          )
      );

    assertion_digest_matches :=
      platform_value is not null
      and environment_value is not null
      and exists (
        select 1
        from public.cognitive_product_quality_service_capabilities capability
        where capability.service_identity = 'cognitive_sentinel_collector'
          and capability.operation = 'collect_sentinel_run'
          and public.governance_exact_owner(capability.registered_by)
          and capability.task_id = p_task_id
          and capability.project_id = p_project_id
          and capability.platform = platform_value
          and capability.environment = environment_value
          and transaction_timestamp() < capability.expires_at
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
      );

    sentinel_key_allowed :=
      platform_value is not null
      and environment_value is not null
      and exists (
        select 1
        from public.cognitive_product_quality_service_capabilities capability
        where capability.service_identity = 'cognitive_sentinel_collector'
          and capability.operation = 'collect_sentinel_run'
          and public.governance_exact_owner(capability.registered_by)
          and capability.task_id = p_task_id
          and capability.project_id = p_project_id
          and capability.platform = platform_value
          and capability.environment = environment_value
          and transaction_timestamp() < capability.expires_at
          and capability.assertion_hash = encode(
            extensions.digest(
              convert_to(p_service_assertion, 'UTF8'),
              'sha256'
            ),
            'hex'
          )
          and p_sentinel_key = any(capability.allowed_sentinel_keys)
          and not exists (
            select 1
            from public.cognitive_product_quality_service_capability_revocations
              revocation
            where revocation.capability_id = capability.id
          )
      );

    capability_scope_matches :=
      platform_value = 'android'::public.cognitive_platform
      and environment_value = 'production'::public.cognitive_environment
      and exists (
        select 1
        from public.cognitive_product_quality_service_capabilities capability
        where capability.service_identity = 'cognitive_sentinel_collector'
          and capability.operation = 'collect_sentinel_run'
          and public.governance_exact_owner(capability.registered_by)
          and capability.task_id = p_task_id
          and capability.project_id = p_project_id
          and capability.platform = platform_value
          and capability.environment = environment_value
          and transaction_timestamp() < capability.expires_at
          and capability.assertion_hash = encode(
            extensions.digest(
              convert_to(p_service_assertion, 'UTF8'),
              'sha256'
            ),
            'hex'
          )
          and p_sentinel_key = any(capability.allowed_sentinel_keys)
          and not exists (
            select 1
            from public.cognitive_product_quality_service_capability_revocations
              revocation
            where revocation.capability_id = capability.id
          )
      );

    task_scope_matches :=
      platform_value = 'android'::public.cognitive_platform
      and environment_value = 'production'::public.cognitive_environment
      and exists (
        select 1
        from public.intelligence_tasks task
        where task.id = p_task_id
          and task.project_id = p_project_id
          and task.platform = platform_value
          and task.environment = environment_value
          and task.task_key = 'cognitive-level01-canary-control'
          and task.repository_full_name =
            'Chillywood2025/chillywood-mobile'
      );

    emergency_allows_writes :=
      public.governance_approval_emergency_active();

    task_state_allows_writes :=
      task_scope_matches
      and exists (
        select 1
        from public.intelligence_tasks task
        where task.id = p_task_id
          and task.project_id = p_project_id
          and task.platform = platform_value
          and task.environment = environment_value
          and task.cancelled_at is null
          and task.quarantined_at is null
          and transaction_timestamp() < task.deadman_at
      )
      and emergency_allows_writes;

    route_value_bounded := coalesce(
      length(p_route_or_surface) between 1 and 160
      and not public.cognitive_text_has_secret(p_route_or_surface)
      and not public.cognitive_text_has_private_identifier(
        p_route_or_surface
      ),
      false
    );
    runtime_identity_hash_valid := coalesce(
      p_runtime_identity_hash ~ '^[a-f0-9]{64}$',
      false
    );
    source_build_hash_valid := coalesce(
      p_source_build_hash ~ '^[a-f0-9]{64}$',
      false
    );
    evidence_manifest_hash_valid := coalesce(
      p_evidence_manifest_hash ~ '^[a-f0-9]{64}$',
      false
    );
    idempotency_hash_valid_unused := coalesce(
      p_collection_idempotency_hash ~ '^[a-f0-9]{64}$',
      false
    ) and not exists (
      select 1
      from public.product_experience_sentinel_runs run
      where run.task_id = p_task_id
        and run.collection_idempotency_hash =
          p_collection_idempotency_hash
    );

    status_physical_pair_valid := coalesce(
      p_result_status in ('passed', 'blocked', 'failed')
      and p_physical_proof_status in (
        'installed_ui_observed',
        'simulator_observed',
        'source_only',
        'provider_blocked',
        'device_unavailable',
        'new_binary_or_ota_required'
      )
      and (
        p_result_status = 'blocked'
        or p_physical_proof_status in (
          'installed_ui_observed',
          'simulator_observed'
        )
      ),
      false
    );

    observation_timestamps_valid := coalesce(
      p_observation_started_at is not null
      and p_observation_finished_at is not null
      and p_observation_finished_at >= p_observation_started_at
      and p_observation_finished_at <=
        p_observation_started_at + interval '30 minutes'
      and p_observation_finished_at <=
        transaction_timestamp() + interval '5 minutes',
      false
    );

    evaluation_expiry_valid := coalesce(
      p_observation_finished_at is not null
      and p_evaluation_expires_at is not null
      and p_evaluation_expires_at > transaction_timestamp()
      and p_evaluation_expires_at > p_observation_finished_at
      and p_evaluation_expires_at <=
        p_observation_finished_at + interval '24 hours',
      false
    );

    generic_metric_manifest_bounded := coalesce(
      public.product_experience_metric_manifest_is_bounded(
        p_sentinel_key,
        p_evidence_manifest_hash,
        p_metric_manifest
      ),
      false
    );

    visual_metric_detail_valid :=
      platform_value is not null
      and coalesce(
        public.product_experience_detailed_metric_manifest_is_valid(
          p_sentinel_key,
          platform_value,
          p_result_status,
          p_metric_manifest
        ),
        false
      );

    effective_baseline_valid := coalesce(
      platform_value is not null
      and environment_value is not null
      and (
        p_sentinel_key <> 'visual_product_experience_sentinel'
        or (
          p_metric_manifest->>'observationKind' = 'touch_target'
          and public.product_experience_objective_touch_target_is_independent(
            platform_value,
            p_result_status,
            p_metric_manifest->'metrics',
            null
          )
        )
        or p_metric_manifest->'metrics'->>'baselineState' =
          'needs_product_baseline_review'
        or public.product_experience_lock_effective_baseline_v1(
          p_task_id,
          p_project_id,
          platform_value,
          environment_value,
          p_metric_manifest->'metrics'
        )
      ),
      false
    );

    no_conflicting_run := not exists (
      select 1
      from public.product_experience_sentinel_runs run
      where run.task_id = p_task_id
        and run.sentinel_key = p_sentinel_key
        and run.route_or_surface = p_route_or_surface
        and run.evidence_manifest_hash = p_evidence_manifest_hash
    );

    exact_switch_enabled :=
      platform_value = 'android'::public.cognitive_platform
      and environment_value = 'production'::public.cognitive_environment
      and exists (
        select 1
        from public.cognitive_governance_switches switch
        where switch.task_id = p_task_id
          and switch.project_id = p_project_id
          and switch.platform = platform_value
          and switch.environment = environment_value
          and switch.switch_key =
            'cognitive_visual_experience_sentinel_enabled'
          and switch.enabled
          and switch.policy_version =
            'provider-independent-visual-canary-v2'
      );

    authorization_open :=
      platform_value = 'android'::public.cognitive_platform
      and environment_value = 'production'::public.cognitive_environment
      and exists (
        select 1
        from public.cognitive_provider_independent_visual_canary_authorizations
          authorization_row
        where authorization_row.project_id = p_project_id
          and authorization_row.environment = environment_value
          and authorization_row.target_task_id = p_task_id
          and authorization_row.target_platform = platform_value
          and transaction_timestamp() < authorization_row.expires_at
          and not exists (
            select 1
            from public.cognitive_provider_independent_visual_activation_outcomes
              outcome
            where outcome.authorization_id = authorization_row.id
          )
      );

    allowed_value :=
      runtime_principal_valid
      and nested_claim_established
      and capability_current
      and assertion_digest_matches
      and sentinel_key_allowed
      and capability_scope_matches
      and task_scope_matches
      and task_state_allows_writes
      and emergency_allows_writes
      and route_value_bounded
      and runtime_identity_hash_valid
      and source_build_hash_valid
      and evidence_manifest_hash_valid
      and idempotency_hash_valid_unused
      and status_physical_pair_valid
      and observation_timestamps_valid
      and evaluation_expiry_valid
      and generic_metric_manifest_bounded
      and visual_metric_detail_valid
      and effective_baseline_valid
      and no_conflicting_run
      and exact_switch_enabled
      and authorization_open;

    failed_predicate := case
      when not nested_claim_established
        then 'legacy_nested_claim'
      when not capability_current
        then 'collector_capability_current'
      when not assertion_digest_matches
        then 'collector_assertion_digest'
      when not sentinel_key_allowed
        then 'collector_sentinel_key'
      when not capability_scope_matches
        then 'collector_android_scope'
      when not task_scope_matches
        then 'android_task_scope'
      when not emergency_allows_writes
        then 'emergency_stop'
      when not task_state_allows_writes
        then 'android_task_writes'
      when not route_value_bounded
        then 'route_or_surface'
      when not runtime_identity_hash_valid
        then 'runtime_identity_hash'
      when not source_build_hash_valid
        then 'source_build_hash'
      when not evidence_manifest_hash_valid
        then 'evidence_manifest_hash'
      when not idempotency_hash_valid_unused
        then 'collection_idempotency'
      when not status_physical_pair_valid
        then 'status_physical_proof_pair'
      when not observation_timestamps_valid
        then 'observation_timestamps'
      when not evaluation_expiry_valid
        then 'evaluation_expiry'
      when not generic_metric_manifest_bounded
        then 'metric_manifest_generic'
      when not visual_metric_detail_valid
        then 'metric_manifest_visual_detail'
      when not effective_baseline_valid
        then 'effective_baseline'
      when not no_conflicting_run
        then 'conflicting_existing_run'
      when not exact_switch_enabled
        then 'android_visual_switch'
      when not authorization_open
        then 'android_visual_authorization'
      else null
    end;

    result_value := jsonb_build_object(
      'allowed',
      allowed_value,
      'failedPredicate',
      failed_predicate,
      'runtimePrincipal',
      case when runtime_principal_valid then 'PASS' else 'FAIL' end,
      'legacyNestedClaim',
      case when nested_claim_established then 'PASS' else 'FAIL' end,
      'capability',
      case when capability_current then 'PASS' else 'FAIL' end,
      'assertionDigest',
      case when assertion_digest_matches then 'MATCH' else 'MISMATCH' end,
      'sentinelKey',
      case when sentinel_key_allowed then 'PASS' else 'FAIL' end,
      'scope',
      case when capability_scope_matches then 'PASS' else 'FAIL' end,
      'task',
      case when task_scope_matches then 'PASS' else 'FAIL' end,
      'taskWrites',
      case when task_state_allows_writes then 'PASS' else 'FAIL' end,
      'emergency',
      case when emergency_allows_writes then 'PASS' else 'FAIL' end,
      'route',
      case when route_value_bounded then 'PASS' else 'FAIL' end,
      'runtimeIdentityHash',
      case when runtime_identity_hash_valid then 'PASS' else 'FAIL' end,
      'sourceBuildHash',
      case when source_build_hash_valid then 'PASS' else 'FAIL' end,
      'evidenceManifestHash',
      case when evidence_manifest_hash_valid then 'PASS' else 'FAIL' end,
      'collectionIdempotency',
      case when idempotency_hash_valid_unused then 'PASS' else 'FAIL' end,
      'statusPhysicalProof',
      case when status_physical_pair_valid then 'PASS' else 'FAIL' end,
      'observationTimestamps',
      case when observation_timestamps_valid then 'PASS' else 'FAIL' end,
      'evaluationExpiry',
      case when evaluation_expiry_valid then 'PASS' else 'FAIL' end,
      'genericMetricManifest',
      case when generic_metric_manifest_bounded then 'PASS' else 'FAIL' end,
      'visualMetricDetail',
      case when visual_metric_detail_valid then 'PASS' else 'FAIL' end,
      'effectiveBaseline',
      case when effective_baseline_valid then 'PASS' else 'FAIL' end,
      'existingRunConflict',
      case when no_conflicting_run then 'PASS' else 'FAIL' end,
      'switch',
      case when exact_switch_enabled then 'PASS' else 'FAIL' end,
      'authorization',
      case when authorization_open then 'PASS' else 'FAIL' end
    );
  exception
    when others then
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

revoke all on function
  cognitive_runtime.preflight_visual_sentinel_collection(
    uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,
    timestamptz,timestamptz,timestamptz,text,text
  )
from public,anon,authenticated,service_role;

grant execute on function
  cognitive_runtime.preflight_visual_sentinel_collection(
    uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,
    timestamptz,timestamptz,timestamptz,text,text
  )
to cognitive_sentinel_collector;

comment on function
  cognitive_runtime.preflight_visual_sentinel_collection(
    uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,
    timestamptz,timestamptz,timestamptz,text,text
  )
is
  'Read-only principal-bound visual collection predicate diagnostic. Returns bounded PASS/FAIL reason codes only; it never returns assertion material or hashes and never writes evidence, capabilities, switches, authorizations, or audit rows.';
