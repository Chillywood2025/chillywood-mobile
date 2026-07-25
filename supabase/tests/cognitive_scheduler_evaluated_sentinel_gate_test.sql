begin;
select no_plan();

insert into public.platform_role_memberships(
  user_id, email, role, status
) values (
  'f0000000-0000-4000-8000-000000000001',
  null,
  'owner',
  'active'
);

insert into public.cognitive_projects(
  id, repository_full_name, source_state, activation_state,
  scheduler_state, production_authority
) values (
  'f1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off',
  'bounded_level01',
  false
);

insert into public.intelligence_tasks(
  id, project_id, platform, environment, repository_full_name,
  branch_name, task_key, objective_hash, status, actor_identity,
  deadman_at, retention_until, data_class, parent_task_id
) values
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared', 'production',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-scheduler-sentinel-gate',
    'cognitive-level01-canary-control',
    repeat('1',64), 'received', 'scheduler-gate-fixture',
    transaction_timestamp()+interval '1 day',
    transaction_timestamp()+interval '30 days',
    'operational_metadata', null
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'android', 'production',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-scheduler-sentinel-gate',
    'scheduler-installed-journey-fixture',
    repeat('2',64), 'received', 'sentinel-gate-fixture',
    transaction_timestamp()+interval '1 day',
    transaction_timestamp()+interval '30 days',
    'operational_metadata',
    null
  ),
  (
    'f2000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000001',
    'ios', 'production',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-scheduler-sentinel-gate',
    'scheduler-visual-fixture',
    repeat('3',64), 'received', 'sentinel-gate-fixture',
    transaction_timestamp()+interval '1 day',
    transaction_timestamp()+interval '30 days',
    'operational_metadata',
    null
  );

insert into public.autonomous_system_emergency_states(
  system_id, status, reason, updated_at, metadata
) values (
  'product_intelligence_operator',
  'active',
  'scheduler evaluated-sentinel fixture',
  transaction_timestamp(),
  '{"fixture":"scheduler-evaluated-sentinel-gate"}'::jsonb
)
on conflict (system_id) do update
set
  status=excluded.status,
  reason=excluded.reason,
  updated_at=excluded.updated_at,
  metadata=excluded.metadata;

insert into public.cognitive_governance_switches(
  task_id, project_id, platform, environment, switch_key, enabled,
  policy_version, enabled_by, enabled_at, updated_at
) values
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production','cognitive_research_enabled',
    true,'scheduler-sentinel-gate',
    'f0000000-0000-4000-8000-000000000001',transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production','cognitive_memory_enabled',
    true,'scheduler-sentinel-gate',
    'f0000000-0000-4000-8000-000000000001',transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production','cognitive_scheduled_level01_enabled',
    true,'scheduler-sentinel-gate',
    'f0000000-0000-4000-8000-000000000001',transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production','cognitive_installed_journey_sentinel_enabled',
    true,'scheduler-sentinel-gate',
    'f0000000-0000-4000-8000-000000000001',transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production','cognitive_visual_experience_sentinel_enabled',
    true,'scheduler-sentinel-gate',
    'f0000000-0000-4000-8000-000000000001',transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production','cognitive_user_derived_memory_enabled',
    false,'scheduler-sentinel-gate',null,null,transaction_timestamp()
  ),
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production','cognitive_level2_production_repairs_enabled',
    false,'scheduler-sentinel-gate',null,null,transaction_timestamp()
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'android','production','cognitive_installed_journey_sentinel_enabled',
    true,'scheduler-sentinel-gate',
    'f0000000-0000-4000-8000-000000000001',transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'android','production','cognitive_visual_experience_sentinel_enabled',
    true,'scheduler-sentinel-gate',
    'f0000000-0000-4000-8000-000000000001',transaction_timestamp(),
    transaction_timestamp()
  );

insert into public.cognitive_product_sentinel_platform_scopes(
  id, shared_task_id, platform_task_id, project_id, shared_platform,
  platform, environment, scope_hash, source_commit, policy_version,
  retention_policy_hash, materialized_by
) values
  (
    'f2100000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'shared','android','production',repeat('1',64),repeat('1',40),
    'scheduler-sentinel-gate',repeat('2',64),
    'f0000000-0000-4000-8000-000000000001'
  );

insert into public.cognitive_level01_schedule_definitions(
  id, task_id, project_id, platform, environment, schedule_key,
  cadence, enabled, maximum_tasks, maximum_cost, timeout_seconds,
  policy_version
) values (
  'f3000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production','weekly_ux_route_dead_control',
  '0 15 * * 1',true,3,5,600,'scheduler-sentinel-gate'
);

insert into public.cognitive_level01_scheduler_capabilities(
  id, service_identity, operation, schedule_definition_id,
  parent_task_id, project_id, platform, environment, assertion_hash,
  maximum_executions, registered_by, expires_at
) values (
  'f4000000-0000-4000-8000-000000000001',
  'cognitive_level01_scheduler','issue_recurring_child_task',
  'f3000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production',repeat('4',64),1,
  'f0000000-0000-4000-8000-000000000001',
  transaction_timestamp()+interval '1 day'
);

insert into public.cognitive_product_quality_service_capabilities(
  id, service_identity, operation, task_id, project_id, platform,
  environment, assertion_hash, allowed_sentinel_keys, registered_by,
  expires_at
) values
  (
    'f5000000-0000-4000-8000-000000000001',
    'cognitive_sentinel_collector','collect_sentinel_run',
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'android','production',repeat('5',64),
    array[
      'installed_journey_sentinel',
      'visual_product_experience_sentinel'
    ],
    'f0000000-0000-4000-8000-000000000001',
    transaction_timestamp()+interval '1 day'
  );

insert into public.product_experience_sentinel_runs(
  id, task_id, project_id, platform, environment, sentinel_key,
  route_or_surface, runtime_identity_hash, evidence_manifest_hash,
  metric_manifest, result_status, physical_proof_status, retention_until,
  collector_capability_id, collection_idempotency_hash, source_build_hash,
  observation_started_at, observation_finished_at, evaluation_expires_at
) values
  (
    'f6000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'android','production','installed_journey_sentinel','Home main tab',
    repeat('7',64),repeat('a',64),
    '{
      "schemaVersion":"product-sentinel-v1",
      "sanitizationVersion":"bounded-nonpersonal-v1",
      "observationKind":"route_timing",
      "evidenceHashes":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      "metrics":{
        "elapsedDurationMs":12000,
        "networkState":"ready",
        "timeoutObserved":true
      }
    }'::jsonb,
    'failed','installed_ui_observed',
    transaction_timestamp()+interval '30 days',
    'f5000000-0000-4000-8000-000000000001',
    repeat('8',64),repeat('9',64),
    transaction_timestamp()-interval '2 minutes',
    transaction_timestamp()-interval '1 minute',
    transaction_timestamp()+interval '1 hour'
  ),
  (
    'f6000000-0000-4000-8000-000000000002',
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'android','production','visual_product_experience_sentinel','Explore',
    repeat('7',64),repeat('b',64),
    '{
      "schemaVersion":"product-sentinel-v1",
      "sanitizationVersion":"bounded-nonpersonal-v1",
      "observationKind":"touch_target",
      "evidenceHashes":["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      "metrics":{
        "platform":"android",
        "measurementUnit":"dp",
        "surfaceFamily":"non_media_interactive_surface",
        "interactiveTargetWidth":48,
        "interactiveTargetHeight":48,
        "interactiveAncestorPresent":false,
        "interactiveAncestorWidth":null,
        "interactiveAncestorHeight":null,
        "interactiveAncestorActuallyInteractive":false,
        "interactiveAncestorRolePresent":false,
        "interactiveAncestorClickActionPresent":false,
        "interactiveAncestorIsTargetContainer":false,
        "isActuallyInteractive":true,
        "preferredThreshold":48,
        "applicableMinimumThreshold":48,
        "accessibilityNamePresent":true,
        "accessibilityRolePresent":true,
        "screenDensityDpi":420,
        "targetClassification":"meets_platform_minimum",
        "baselineId":"chillywood-product-experience-baseline-v1",
        "baselineVersion":1,
        "baselineState":"needs_product_baseline_review",
        "baselineComparisonHash":null,
        "evidenceQuality":"measured_installed",
        "evidenceQualityHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "componentIdentityHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "routeFamilyMappingId":"watch_party_entry_controls",
        "routeFamilyMappingHash":"900ec3a06999a1a7afcb88da0580d829902a1839cf26b54446cfa99e87aa2300",
        "automationStatus":"observed",
        "providerState":"not_applicable",
        "contentState":"not_applicable",
        "exceptionVersioned":true,
        "exceptionType":"non_media_surface",
        "exceptionContractId":"non_streaming_discovery_route_v1",
        "exceptionContractHash":"18a3bb4c47a9f78849f15249776daea979abf11b9446f3773dc59d1a74f9894e"
      }
    }'::jsonb,
    'passed','installed_ui_observed',
    transaction_timestamp()+interval '30 days',
    'f5000000-0000-4000-8000-000000000001',
    repeat('c',64),repeat('d',64),
    transaction_timestamp()-interval '2 minutes',
    transaction_timestamp()-interval '1 minute',
    transaction_timestamp()+interval '1 hour'
  );

insert into public.product_experience_sentinel_evaluator_proofs(
  id, sentinel_run_id, task_id, project_id, platform, environment,
  assessment_kind, assessment_hash, evidence_manifest_hash, verdict,
  evaluator_identity, evaluator_proof_hash, evaluator_output_hash, valid_until
)
select
  'f7000000-0000-4000-8000-000000000001',
  run.id,run.task_id,run.project_id,run.platform,run.environment,
  'finding_detection',
  public.product_quality_detection_assessment_hash(
    run.id,finding_key.value,run.route_or_surface,run.source_build_hash,
    'medium',repeat('8',64),array[repeat('a',64)],'layout_density',
    0.9800,'confirmed_defect',repeat('7',64),repeat('6',64),
    repeat('5',64),run.physical_proof_status
  ),
  run.evidence_manifest_hash,'passed','cognitive_independent_evaluator',
  repeat('f',64),repeat('1',64),transaction_timestamp()+interval '30 minutes'
from public.product_experience_sentinel_runs run
cross join lateral (
  select public.product_quality_expected_finding_key(
    run.task_id,run.project_id,run.platform,run.environment,
    run.route_or_surface,'android_touch_target'
  ) value
) finding_key
where run.id='f6000000-0000-4000-8000-000000000001';

insert into public.product_experience_sentinel_evaluator_proofs(
  id, sentinel_run_id, task_id, project_id, platform, environment,
  assessment_kind, assessment_hash, evidence_manifest_hash, verdict,
  evaluator_identity, evaluator_proof_hash, evaluator_output_hash, valid_until
)
select
  'f7000000-0000-4000-8000-000000000002',
  run.id, run.task_id, run.project_id, run.platform, run.environment,
  'run_no_finding',
  public.product_quality_no_finding_assessment_hash(run.id),
  run.evidence_manifest_hash,'passed','cognitive_product_quality_evaluator',
  repeat('2',64),repeat('3',64),transaction_timestamp()+interval '30 minutes'
from public.product_experience_sentinel_runs run
where run.id='f6000000-0000-4000-8000-000000000002';

select ok(
  public.product_experience_scheduler_evaluation_is_ready(
    'f6000000-0000-4000-8000-000000000002'
  )
  and not public.product_experience_scheduler_evaluation_is_ready(
    'f6000000-0000-4000-8000-000000000001'
  ),
  'passed run needs the exact no-finding hash and failed run is not ready before triage'
);

select is(
  public.cognitive_level01_schedule_prerequisites_pass(
    'f3000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production'
  ),
  false,
  'unconsumed detection proof cannot satisfy authoritative prerequisites'
);

select throws_ok(
  $$insert into public.cognitive_level01_scheduled_task_issuances(
      id, capability_id, schedule_definition_id, parent_task_id, project_id,
      platform, environment, scheduled_for, execution_idempotency_hash,
      objective_hash, work_state, result_status, no_work_reason_hash,
      maximum_tasks_snapshot, maximum_cost_snapshot,
      timeout_seconds_snapshot, schedule_policy_version, service_identity,
      audit_event_hash, retention_until
    ) values (
      'f8000000-0000-4000-8000-000000000001',
      'f4000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001',
      'shared','production',transaction_timestamp(),
      repeat('4',64),repeat('5',64),'no_work','no_work',repeat('6',64),
      3,5,600,'scheduler-sentinel-gate','cognitive_level01_scheduler',
      repeat('7',64),transaction_timestamp()+interval '30 days'
    )$$,
  'P0001',
  'cognitive_level01_schedule_locked_prerequisites_rejected',
  'table-boundary issuance rejects an unconsumed detection proof'
);

insert into public.product_quality_findings(
  id, sentinel_run_id, task_id, project_id, platform, environment,
  finding_key, route_or_surface, build_runtime_hash, evidence_hashes,
  severity, user_impact_hash, suspected_layer, confidence,
  reproduction_state, affected_components_hash, provider_backend_state_hash,
  proposed_next_investigation_hash, physical_proof_status, governance_status,
  retention_until, finding_class, finding_scope_hash, current_status,
  current_evaluator_proof_id
)
select
  'f9000000-0000-4000-8000-000000000001',
  run.id,run.task_id,run.project_id,run.platform,run.environment,
  finding_key.value,run.route_or_surface,run.source_build_hash,
  array[repeat('a',64)],'medium',repeat('8',64),
  'layout_density',0.9800,'confirmed_defect',repeat('7',64),
  repeat('6',64),repeat('5',64),run.physical_proof_status,
  'entered_collective_governance',transaction_timestamp()+interval '30 days',
  'android_touch_target',
  encode(
    extensions.digest(convert_to(finding_key.value,'UTF8'),'sha256'),
    'hex'
  ),
  'open',
  'f7000000-0000-4000-8000-000000000001'
from public.product_experience_sentinel_runs run
cross join lateral (
  select public.product_quality_expected_finding_key(
    run.task_id,run.project_id,run.platform,run.environment,
    run.route_or_surface,'android_touch_target'
  ) value
) finding_key
where run.id='f6000000-0000-4000-8000-000000000001';

insert into public.product_experience_sentinel_evaluator_proof_consumptions(
  id, evaluator_proof_id, task_id, project_id, platform, environment,
  event_hash, consumed_by_identity
) values (
  'fa000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000001',
  'android','production',repeat('3',64),
  'cognitive_product_quality_triage'
);

insert into public.product_quality_finding_events(
  id, finding_id, sentinel_run_id, evaluator_proof_id, task_id, project_id,
  platform, environment, finding_key, finding_class, finding_scope_hash,
  route_or_surface, event_type, occurrence_number, severity,
  reproduction_state, suspected_layer, confidence, assessment_hash,
  event_hash, evidence_hashes
)
select
  'fb000000-0000-4000-8000-000000000001',
  finding.id,
  'f6000000-0000-4000-8000-000000000001',
  proof.id,finding.task_id,finding.project_id,finding.platform,
  finding.environment,finding.finding_key,finding.finding_class,
  finding.finding_scope_hash,finding.route_or_surface,'detected',1,
  'medium','confirmed_defect','layout_density',0.9800,proof.assessment_hash,
  repeat('3',64),array[repeat('a',64)]
from public.product_quality_findings finding
join public.product_experience_sentinel_evaluator_proofs proof
  on proof.id=finding.current_evaluator_proof_id
where finding.id='f9000000-0000-4000-8000-000000000001';

select ok(
  public.product_experience_scheduler_evaluation_is_ready(
    'f6000000-0000-4000-8000-000000000001'
  )
  and public.cognitive_level01_schedule_prerequisites_pass(
    'f3000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production'
  ),
  'immutable triage consumption, event, and finding satisfy the failed-run branch'
);

insert into public.cognitive_level01_scheduled_task_issuances(
  id, capability_id, schedule_definition_id, parent_task_id, project_id,
  platform, environment, scheduled_for, execution_idempotency_hash,
  objective_hash, work_state, result_status, no_work_reason_hash,
  maximum_tasks_snapshot, maximum_cost_snapshot, timeout_seconds_snapshot,
  schedule_policy_version, service_identity, audit_event_hash, retention_until
) values (
  'f8000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production',transaction_timestamp(),
  repeat('4',64),repeat('5',64),'no_work','no_work',repeat('6',64),
  3,5,600,'scheduler-sentinel-gate','cognitive_level01_scheduler',
  repeat('7',64),transaction_timestamp()+interval '30 days'
);

select is(
  (
    select count(*)
    from public.cognitive_level01_scheduled_task_issuances
    where id='f8000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'authoritative issuance succeeds only after persisted evaluated triage'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure
  ) like
    '%product_experience_scheduler_evaluation_is_ready(run.id)%'
  and pg_get_functiondef(
    'public.cognitive_level01_schedule_prerequisites_pass(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment)'::regprocedure
  ) like
    '%product_experience_scheduler_evaluation_is_ready(run.id)%'
  and pg_get_functiondef(
    'public.product_experience_enforce_objective_accessibility_run_binding()'::regprocedure
  ) like '%is distinct from%',
  'snapshot, dispatch, and NULL-safe Home binding use the hardened predicates'
);

select * from finish();
rollback;
