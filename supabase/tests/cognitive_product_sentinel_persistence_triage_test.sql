begin;
select no_plan();

create function pg_temp.rich_route_timing_manifest(
  p_route text,
  p_evidence_hash text,
  p_elapsed_duration_ms integer
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 'product-sentinel-v1',
    'sanitizationVersion', 'bounded-nonpersonal-v1',
    'observationKind', 'route_timing',
    'evidenceHashes', jsonb_build_array(p_evidence_hash),
    'metrics', jsonb_build_object(
      'appVersion', '1.0.0',
      'appBuild', '84',
      'runtimeVersion', '1.0.0-android84',
      'channel', 'play-internal',
      'platform', 'android',
      'routeOrSurface', p_route,
      'routeFamilyId', lower(p_route) || '.main',
      'routeFamilyBindingHash',
        public.product_experience_route_family_binding_hash(
          'android', p_route, lower(p_route) || '.main'
        ),
      'routeFamilyMappingId', 'home_standard_discovery_rows',
      'routeFamilyMappingHash',
        public.product_experience_baseline_v1_mapping_contract(
          'home_standard_discovery_rows'
        )->>'hash',
      'surfaceFamily', 'standard_streaming_card',
      'exceptionContractId', null,
      'exceptionContractHash', null,
      'exceptionVersioned', false,
      'runtimeIdentityHash', repeat('c',64),
      'buildRuntimeHash', repeat('d',64),
      'syntheticAccount', true,
      'networkReadyBeforeNavigation', true,
      'networkState', 'ready',
      'navigationStartMonotonicMs', 1000,
      'firstRenderedMonotonicMs', 1100,
      'firstInteractiveMonotonicMs', 1200,
      'resolvedStateMonotonicMs', 1000 + p_elapsed_duration_ms,
      'resolutionKind', 'content_state',
      'finalObservedState', 'content_loaded',
      'reviewedErrorState', false,
      'unresolvedStateCount', 0,
      'timeoutObserved', false,
      'maximumDurationMs', 10000,
      'elapsedDurationMs', p_elapsed_duration_ms,
      'interactionEvidenceKind', 'both',
      'interactionEvidenceHash', repeat('b',64),
      'sanitizedEvidenceHash', p_evidence_hash,
      'installedProofStatus', 'installed_ui_observed',
      'findingDisposition', 'no_finding'
    )
  )
$$;

insert into public.cognitive_projects(
  id, repository_full_name, source_state, activation_state,
  scheduler_state, production_authority
) values (
  'c0000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off',
  'none',
  false
);

insert into public.intelligence_tasks(
  id, project_id, platform, environment, repository_full_name, branch_name,
  task_key, objective_hash, actor_identity, deadman_at
) values (
  'c1000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'android', 'production', 'Chillywood2025/chillywood-mobile',
  'codex/cognitive-sentinel-persistence-test',
  'cognitive-sentinel-persistence-test', repeat('a',64),
  'sentinel-persistence-fixture',
  transaction_timestamp() + interval '2 days'
);

insert into public.autonomous_system_emergency_states(
  system_id, status, reason, updated_at, metadata
) values (
  'product_intelligence_operator',
  'active',
  'sentinel persistence fixture active state',
  transaction_timestamp(),
  '{"fixture":true}'::jsonb
)
on conflict (system_id) do update
set
  status = excluded.status,
  reason = excluded.reason,
  updated_at = excluded.updated_at,
  metadata = excluded.metadata;

insert into public.cognitive_governance_switches(
  task_id, project_id, platform, environment, switch_key, enabled,
  policy_version, enabled_by, enabled_at, updated_at
) values (
  'c1000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'android', 'production',
  'cognitive_installed_journey_sentinel_enabled',
  true, 'sentinel-persistence-test',
  'c2000000-0000-4000-8000-000000000001',
  transaction_timestamp(), transaction_timestamp()
);

insert into public.cognitive_product_quality_service_capabilities(
  id, service_identity, operation, task_id, project_id, platform,
  environment, assertion_hash, allowed_sentinel_keys, registered_by,
  expires_at
) values
  (
    'c3000000-0000-4000-8000-000000000001',
    'cognitive_sentinel_collector',
    'collect_sentinel_run',
    'c1000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'android', 'production',
    encode(
      extensions.digest(
        convert_to(
          'sentinel-collector-fixture-assertion-000001',
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    array['installed_journey_sentinel'],
    'c2000000-0000-4000-8000-000000000001',
    transaction_timestamp() + interval '1 day'
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'cognitive_product_quality_triage',
    'triage_product_quality',
    'c1000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'android', 'production',
    encode(
      extensions.digest(
        convert_to(
          'product-triage-fixture-assertion-0000001',
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    '{}'::text[],
    'c2000000-0000-4000-8000-000000000001',
    transaction_timestamp() + interval '1 day'
  );

insert into public.governance_two_party_service_assertions(
  service_identity, assertion_hash, allowed_operations, registered_by,
  expires_at
) values
  (
    'cognitive_independent_evaluator',
    encode(
      extensions.digest(
        convert_to(
          'independent-evaluator-fixture-assertion-01',
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    array['independent_evaluation'],
    'c2000000-0000-4000-8000-000000000001',
    transaction_timestamp() + interval '1 day'
  ),
  (
    'product_quality_triage_router',
    encode(
      extensions.digest(
        convert_to(
          'legacy-triage-fixture-assertion-0000001',
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    array['product_quality_triage'],
    'c2000000-0000-4000-8000-000000000001',
    transaction_timestamp() + interval '1 day'
  );

create temporary table sentinel_triage_fixture(
  fixture_key text primary key,
  run_id uuid,
  assessment_hash text,
  proof_id uuid,
  finding_id uuid,
  finding_key text
);
grant select, insert, update on sentinel_triage_fixture
  to service_role;

select ok(
  (
    select count(*) = 5
    from pg_class
    where oid in (
      'public.cognitive_product_quality_service_capabilities'::regclass,
      'public.cognitive_product_quality_service_capability_revocations'::regclass,
      'public.product_experience_sentinel_evaluator_proofs'::regclass,
      'public.product_quality_finding_events'::regclass,
      'public.product_experience_sentinel_evaluator_proof_consumptions'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  'all new capability, proof, event, and consumption tables force RLS'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.product_experience_collect_sentinel_run(uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.product_quality_triage_detection(uuid,uuid,text,text,text,text,text,text,text[],text,numeric,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.product_quality_triage_resolution(uuid,uuid,uuid,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute collector or triage RPCs'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.product_experience_record_sentinel_run(uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,text,jsonb,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.product_quality_record_finding(uuid,text,text,text,text,text,text[],text,numeric,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'deployed predecessor creation RPCs are closed to the service runtime'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'installed_journey_sentinel','android','failed',
    '{
      "observationKind":"route_timing",
      "metrics":{
        "elapsedDurationMs":12000,
        "networkState":"ready",
        "timeoutObserved":true
      }
    }'::jsonb
  ),
  'route failure requires explicit bounded timeout evidence'
);
select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'installed_journey_sentinel','android','failed',
    '{
      "observationKind":"route_timing",
      "metrics":{"elapsedDurationMs":12000,"networkState":"ready"}
    }'::jsonb
  ),
  'route failure rejects an inferred timeout'
);
select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','failed',
    '{
      "observationKind":"touch_target",
      "metrics":{
        "thresholdDp":48,
        "minimumWidthDp":102.86,
        "minimumHeightDp":23.24,
        "isActuallyInteractive":true,
        "clickableAncestorPresent":false,
        "screenDensityDpi":420
      }
    }'::jsonb
  ),
  'obsolete Android touch target shape cannot bypass the reviewed metric contract'
);
select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','ios','failed',
    '{
      "observationKind":"touch_target",
      "metrics":{
        "thresholdDp":48,
        "minimumWidthDp":102.86,
        "minimumHeightDp":23.24,
        "isActuallyInteractive":true,
        "clickableAncestorPresent":false,
        "screenDensityDpi":420
      }
    }'::jsonb
  ),
  'Android dp evidence cannot be reclassified as an iOS point measurement'
);

select throws_ok(
  $$insert into public.product_experience_sentinel_runs(
      task_id, project_id, platform, environment, sentinel_key,
      route_or_surface, runtime_identity_hash, evidence_manifest_hash,
      metric_manifest, result_status, physical_proof_status
    ) values (
      'c1000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000001',
      'android','production','installed_journey_sentinel','legacy-direct',
      repeat('8',64),repeat('5',64),
      '{"schemaVersion":"legacy-direct-fixture"}'::jsonb,
      'failed','installed_ui_observed'
    )$$,
  '42501',
  'product_experience_collector_capability_required',
  'every new run requires a non-null live collector capability'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.product_experience_collect_sentinel_run(
    'c1000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'android','production','installed_journey_sentinel','Home',
    repeat('8',64),repeat('4',64),repeat('5',64),
    '{
      "schemaVersion":"product-sentinel-v1",
      "sanitizationVersion":"bounded-nonpersonal-v1",
      "observationKind":"route_timing",
      "evidenceHashes":["5555555555555555555555555555555555555555555555555555555555555555"],
      "metrics":{"elapsedDurationMs":12000,"networkState":"ready","timeoutObserved":true}
    }'::jsonb,
    'failed','installed_ui_observed',
    transaction_timestamp()-interval '2 minutes',
    transaction_timestamp()-interval '1 minute',
    transaction_timestamp()+interval '1 hour',
    repeat('1',64),
    'cognitive_product_quality_triage',
    'product-triage-fixture-assertion-0000001'
  )$$,
  '42501',
  'product_quality_service_capability_required',
  'triage identity cannot invoke collector operation'
);

insert into sentinel_triage_fixture(fixture_key, run_id)
select
  'detection-one',
  (
    public.product_experience_collect_sentinel_run(
      'c1000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000001',
      'android','production','installed_journey_sentinel','Home',
      repeat('8',64),repeat('4',64),repeat('5',64),
      '{
        "schemaVersion":"product-sentinel-v1",
        "sanitizationVersion":"bounded-nonpersonal-v1",
        "observationKind":"route_timing",
        "evidenceHashes":["5555555555555555555555555555555555555555555555555555555555555555"],
        "metrics":{"elapsedDurationMs":12000,"networkState":"ready","timeoutObserved":true}
      }'::jsonb,
      'failed','installed_ui_observed',
      transaction_timestamp()-interval '2 minutes',
      transaction_timestamp()-interval '1 minute',
      transaction_timestamp()+interval '1 hour',
      repeat('1',64),
      'cognitive_sentinel_collector',
      'sentinel-collector-fixture-assertion-000001'
    )->>'sentinelRunId'
  )::uuid;
reset role;

select is(
  (
    select count(*)
    from public.product_experience_sentinel_runs
    where collector_capability_id = 'c3000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'collector persists one bounded run without creating a finding'
);
select is(
  (select count(*) from public.product_quality_findings),
  0::bigint,
  'collector has no direct product-finding side effect'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.product_quality_record_finding(
    (select run_id from sentinel_triage_fixture where fixture_key='detection-one'),
    'legacy-operational-bypass-fixture','Home',repeat('4',64),
    'medium',repeat('9',64),array[repeat('5',64)],
    'loading_state',0.9500,'confirmed_defect',repeat('a',64),
    repeat('b',64),repeat('c',64),'installed_ui_observed',
    'product_quality_triage_router',
    'legacy-triage-fixture-assertion-0000001'
  )$$,
  '42501',
  null,
  'service runtime cannot execute the legacy finding-creation RPC'
);
reset role;

update sentinel_triage_fixture
set
  finding_key = public.product_quality_expected_finding_key(
    'c1000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'android','production','Home','route.loading.unresolved'
  )
where fixture_key = 'detection-one';

update sentinel_triage_fixture
set assessment_hash = public.product_quality_detection_assessment_hash(
  run_id, finding_key, 'Home', repeat('4',64), 'medium',
  repeat('9',64), array[repeat('5',64)], 'loading_state',
  0.9500, 'confirmed_defect', repeat('a',64), repeat('b',64),
  repeat('c',64), 'installed_ui_observed'
)
where fixture_key = 'detection-one';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.product_quality_triage_detection(
    (select run_id from sentinel_triage_fixture where fixture_key='detection-one'),
    gen_random_uuid(), repeat('d',64), 'route.loading.unresolved',
    'Home', repeat('4',64), 'medium', repeat('9',64),
    array[repeat('5',64)], 'loading_state', 0.9500,
    'confirmed_defect', repeat('a',64), repeat('b',64),
    repeat('c',64), 'installed_ui_observed',
    'cognitive_product_quality_triage',
    'product-triage-fixture-assertion-0000001'
  )$$,
  'P0001',
  'product_quality_detection_rejected',
  'triage rejects a detection without an evaluator proof'
);

update sentinel_triage_fixture
set proof_id = (
  public.product_quality_record_sentinel_evaluator_proof(
    run_id, 'finding_detection', assessment_hash, repeat('5',64),
    'passed', repeat('d',64), repeat('e',64),
    'cognitive_independent_evaluator',
    'independent-evaluator-fixture-assertion-01'
  )->>'evaluatorProofId'
)::uuid
where fixture_key = 'detection-one';

reset role;
select throws_ok(
  $$insert into public.product_quality_findings(
      sentinel_run_id, task_id, project_id, platform, environment,
      finding_key, finding_class, finding_scope_hash, route_or_surface,
      build_runtime_hash, severity, user_impact_hash, evidence_hashes,
      suspected_layer, confidence, reproduction_state,
      affected_components_hash, provider_backend_state_hash,
      proposed_next_investigation_hash, physical_proof_status,
      governance_status, current_evaluator_proof_id
    )
    select
      fixture.run_id,
      'c1000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000001',
      'android','production',
      'forged_finding_key','route.loading.unresolved',repeat('0',64),
      'Home',repeat('4',64),'medium',repeat('9',64),
      array[repeat('5',64)],'loading_state',0.9500,
      'confirmed_defect',repeat('a',64),repeat('b',64),
      repeat('c',64),'installed_ui_observed',
      'entered_collective_governance',fixture.proof_id
    from sentinel_triage_fixture fixture
    where fixture.fixture_key='detection-one'$$,
  '42501',
  'product_quality_evaluator_proof_required',
  'table guard binds a new finding to the exact deterministic assessed payload'
);

update public.autonomous_system_emergency_states
set status = 'emergency_stop',
    reason = 'sentinel detection liveness rejection fixture',
    updated_at = transaction_timestamp()
where system_id = 'product_intelligence_operator';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.product_quality_triage_detection(
    run_id, proof_id, repeat('e',64), 'route.loading.unresolved',
    'Home', repeat('4',64), 'medium', repeat('9',64),
    array[repeat('5',64)], 'loading_state', 0.9500,
    'confirmed_defect', repeat('a',64), repeat('b',64),
    repeat('c',64), 'installed_ui_observed',
    'cognitive_product_quality_triage',
    'product-triage-fixture-assertion-0000001'
  )
  from sentinel_triage_fixture
  where fixture_key='detection-one'$$,
  '42501',
  'product_quality_task_not_live',
  'emergency stop is rechecked under lock at the finding write boundary'
);

reset role;
update public.autonomous_system_emergency_states
set status = 'active',
    reason = 'sentinel persistence fixture resumed',
    updated_at = transaction_timestamp()
where system_id = 'product_intelligence_operator';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
update sentinel_triage_fixture
set finding_id = (
  public.product_quality_triage_detection(
    run_id, proof_id, repeat('e',64), 'route.loading.unresolved',
    'Home', repeat('4',64), 'medium', repeat('9',64),
    array[repeat('5',64)], 'loading_state', 0.9500,
    'confirmed_defect', repeat('a',64), repeat('b',64),
    repeat('c',64), 'installed_ui_observed',
    'cognitive_product_quality_triage',
    'product-triage-fixture-assertion-0000001'
  )->>'findingId'
)::uuid
where fixture_key = 'detection-one';

select throws_ok(
  $$select public.product_quality_triage_detection(
    run_id, proof_id, repeat('e',64), 'route.loading.unresolved',
    'Home', repeat('4',64), 'medium', repeat('9',64),
    array[repeat('5',64)], 'loading_state', 0.9500,
    'confirmed_defect', repeat('a',64), repeat('b',64),
    repeat('c',64), 'installed_ui_observed',
    'cognitive_product_quality_triage',
    'product-triage-fixture-assertion-0000001'
  )
  from sentinel_triage_fixture
  where fixture_key='detection-one'$$,
  '23505',
  null,
  'one evaluator proof cannot be replayed for a second triage event'
);
reset role;

select is(
  (
    select occurrence_count
    from public.product_quality_findings
    where id = (
      select finding_id
      from sentinel_triage_fixture
      where fixture_key='detection-one'
    )
  ),
  1,
  'first evaluated detection creates deterministic current finding'
);
select is(
  (
    select count(*)
    from public.product_quality_finding_events
    where event_type = 'detected'
  ),
  1::bigint,
  'first detection creates one immutable detection event'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into sentinel_triage_fixture(fixture_key, run_id, finding_key)
select
  'detection-two',
  (
    public.product_experience_collect_sentinel_run(
      'c1000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000001',
      'android','production','installed_journey_sentinel','Home',
      repeat('8',64),repeat('4',64),repeat('6',64),
      '{
        "schemaVersion":"product-sentinel-v1",
        "sanitizationVersion":"bounded-nonpersonal-v1",
        "observationKind":"route_timing",
        "evidenceHashes":["6666666666666666666666666666666666666666666666666666666666666666"],
        "metrics":{"elapsedDurationMs":11800,"networkState":"ready","timeoutObserved":true}
      }'::jsonb,
      'failed','installed_ui_observed',
      transaction_timestamp()-interval '2 minutes',
      transaction_timestamp()-interval '1 minute',
      transaction_timestamp()+interval '1 hour',
      repeat('2',64),
      'cognitive_sentinel_collector',
      'sentinel-collector-fixture-assertion-000001'
    )->>'sentinelRunId'
  )::uuid,
  (
    select finding_key
    from sentinel_triage_fixture
    where fixture_key='detection-one'
  );
reset role;

update sentinel_triage_fixture
set assessment_hash = public.product_quality_detection_assessment_hash(
  run_id, finding_key, 'Home', repeat('4',64), 'medium',
  repeat('9',64), array[repeat('6',64)], 'loading_state',
  0.9600, 'confirmed_defect', repeat('a',64), repeat('b',64),
  repeat('c',64), 'installed_ui_observed'
)
where fixture_key = 'detection-two';

update public.autonomous_system_emergency_states
set status = 'emergency_stop',
    reason = 'sentinel evaluator-proof liveness rejection fixture',
    updated_at = transaction_timestamp()
where system_id = 'product_intelligence_operator';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.product_quality_record_sentinel_evaluator_proof(
      run_id, 'finding_detection', assessment_hash, repeat('6',64),
      'passed', repeat('1',64), repeat('2',64),
      'cognitive_independent_evaluator',
      'independent-evaluator-fixture-assertion-01'
    )
    from sentinel_triage_fixture
    where fixture_key = 'detection-two'$$,
  '42501',
  'product_quality_evaluator_proof_task_not_live',
  'emergency stop is rechecked at the evaluator-proof table boundary'
);
reset role;

select is(
  (
    select count(*)
    from public.product_experience_sentinel_evaluator_proofs proof
    where proof.sentinel_run_id = (
      select run_id
      from sentinel_triage_fixture
      where fixture_key = 'detection-two'
    )
  ),
  0::bigint,
  'emergency-stop rejection leaves no durable evaluator proof'
);

update public.autonomous_system_emergency_states
set status = 'active',
    reason = 'sentinel evaluator-proof fixture resumed',
    updated_at = transaction_timestamp()
where system_id = 'product_intelligence_operator';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
update sentinel_triage_fixture
set proof_id = (
  public.product_quality_record_sentinel_evaluator_proof(
    run_id, 'finding_detection', assessment_hash, repeat('6',64),
    'passed', repeat('1',64), repeat('2',64),
    'cognitive_independent_evaluator',
    'independent-evaluator-fixture-assertion-01'
  )->>'evaluatorProofId'
)::uuid
where fixture_key = 'detection-two';

update sentinel_triage_fixture
set finding_id = (
  public.product_quality_triage_detection(
    run_id, proof_id, repeat('2',64), 'route.loading.unresolved',
    'Home', repeat('4',64), 'medium', repeat('9',64),
    array[repeat('6',64)], 'loading_state', 0.9600,
    'confirmed_defect', repeat('a',64), repeat('b',64),
    repeat('c',64), 'installed_ui_observed',
    'cognitive_product_quality_triage',
    'product-triage-fixture-assertion-0000001'
  )->>'findingId'
)::uuid
where fixture_key = 'detection-two';
reset role;

select is(
  (
    select occurrence_count
    from public.product_quality_findings
    where id = (
      select finding_id
      from sentinel_triage_fixture
      where fixture_key='detection-one'
    )
  ),
  2,
  'recurrence increments the deterministic current finding atomically'
);
select is(
  (
    select count(*)
    from public.product_quality_finding_events
    where event_type = 'recurred' and occurrence_number = 2
  ),
  1::bigint,
  'recurrence preserves one immutable recurrence event'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into sentinel_triage_fixture(fixture_key, run_id, finding_id, finding_key)
select
  'resolution',
  (
    public.product_experience_collect_sentinel_run(
      'c1000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000001',
      'android','production','installed_journey_sentinel','Home',
      repeat('c',64),repeat('d',64),repeat('7',64),
      pg_temp.rich_route_timing_manifest('Home', repeat('7',64), 2400),
      'passed','installed_ui_observed',
      transaction_timestamp()-interval '2 minutes',
      transaction_timestamp()-interval '1 minute',
      transaction_timestamp()+interval '1 hour',
      repeat('3',64),
      'cognitive_sentinel_collector',
      'sentinel-collector-fixture-assertion-000001'
    )->>'sentinelRunId'
  )::uuid,
  finding_id,
  finding_key
from sentinel_triage_fixture
where fixture_key='detection-one';
reset role;

update sentinel_triage_fixture
set assessment_hash = public.product_quality_resolution_assessment_hash(
  finding_id, run_id, repeat('7',64), repeat('3',64)
)
where fixture_key='resolution';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
update sentinel_triage_fixture
set proof_id = (
  public.product_quality_record_sentinel_evaluator_proof(
    run_id, 'finding_resolution', assessment_hash, repeat('7',64),
    'passed', repeat('4',64), repeat('5',64),
    'cognitive_independent_evaluator',
    'independent-evaluator-fixture-assertion-01'
  )->>'evaluatorProofId'
)::uuid
where fixture_key='resolution';

reset role;
update public.intelligence_tasks
set cancelled_at = transaction_timestamp()
where id = 'c1000000-0000-4000-8000-000000000001';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.product_quality_triage_resolution(
      finding_id, run_id, proof_id, repeat('5',64), repeat('3',64),
      'cognitive_product_quality_triage',
      'product-triage-fixture-assertion-0000001'
    )
    from sentinel_triage_fixture
    where fixture_key='resolution'$$,
  '42501',
  'product_quality_task_not_live',
  'task cancellation is rechecked under lock at the resolution write boundary'
);

reset role;
update public.intelligence_tasks
set cancelled_at = null
where id = 'c1000000-0000-4000-8000-000000000001';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (
    public.product_quality_triage_resolution(
      finding_id, run_id, proof_id, repeat('5',64), repeat('3',64),
      'cognitive_product_quality_triage',
      'product-triage-fixture-assertion-0000001'
    )->>'eventType'
  ),
  'resolved',
  'passing resolution run and proof resolve the current finding'
)
from sentinel_triage_fixture
where fixture_key='resolution';
reset role;

select is(
  (
    select current_status
    from public.product_quality_findings
    where id = (
      select finding_id
      from sentinel_triage_fixture
      where fixture_key='resolution'
    )
  ),
  'resolved',
  'resolution updates only the deterministic current state'
);
select is(
  (
    select count(*)
    from public.product_quality_finding_events
    where event_type = 'resolved'
      and occurrence_number = 2
  ),
  1::bigint,
  'resolution creates one immutable resolution event without deleting history'
);
select is(
  (select count(*) from public.product_quality_finding_events),
  3::bigint,
  'detection, recurrence, and resolution event history is complete'
);
select is(
  (
    select count(*)
    from public.product_experience_sentinel_evaluator_proof_consumptions
  ),
  3::bigint,
  'every triage event consumes one distinct evaluator proof'
);

insert into public.cognitive_product_quality_service_capability_revocations(
  capability_id, task_id, project_id, platform, environment,
  revoked_by, revocation_hash
) values (
  'c3000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'android','production',
  'c2000000-0000-4000-8000-000000000001',
  repeat('f',64)
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.product_experience_collect_sentinel_run(
    'c1000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'android','production','installed_journey_sentinel','search',
    repeat('8',64),repeat('4',64),repeat('a',64),
    '{
      "schemaVersion":"product-sentinel-v1",
      "sanitizationVersion":"bounded-nonpersonal-v1",
      "observationKind":"search_accessibility",
      "evidenceHashes":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      "metrics":{"inputInteractive":true}
    }'::jsonb,
    'passed','installed_ui_observed',
    transaction_timestamp()-interval '2 minutes',
    transaction_timestamp()-interval '1 minute',
    transaction_timestamp()+interval '1 hour',
    repeat('4',64),
    'cognitive_sentinel_collector',
    'sentinel-collector-fixture-assertion-000001'
  )$$,
  '42501',
  'product_quality_service_capability_required',
  'revoked collector capability cannot persist another run'
);
reset role;

select throws_ok(
  $$update public.product_quality_finding_events
    set severity = 'critical'$$,
  '42501',
  'immutable_cognitive_evidence',
  'immutable finding events cannot be rewritten'
);

select is(
  public.product_quality_detection_assessment_hash(
    'c4000000-0000-4000-8000-000000000001',
    'android-touch-target-finding',
    'Home main tab',
    repeat('1',64),
    'medium',
    repeat('2',64),
    array[repeat('3',64)],
    'layout_density',
    0.85::numeric,
    'confirmed_defect',
    repeat('4',64),
    repeat('5',64),
    repeat('6',64),
    'installed_ui_observed'
  ),
  public.product_quality_detection_assessment_hash(
    'c4000000-0000-4000-8000-000000000001',
    'android-touch-target-finding',
    'Home main tab',
    repeat('1',64),
    'medium',
    repeat('2',64),
    array[repeat('3',64)],
    'layout_density',
    0.8500::numeric(5,4),
    'confirmed_defect',
    repeat('4',64),
    repeat('5',64),
    repeat('6',64),
    'installed_ui_observed'
  ),
  'numerically equal confidence values have one canonical assessment hash'
);

select isnt(
  public.product_quality_detection_assessment_hash(
    'c4000000-0000-4000-8000-000000000001',
    'android-touch-target-finding',
    'Home main tab',
    repeat('1',64),
    'medium',
    repeat('2',64),
    array[repeat('3',64)],
    'layout_density',
    0.85::numeric,
    'confirmed_defect',
    repeat('4',64),
    repeat('5',64),
    repeat('6',64),
    'installed_ui_observed'
  ),
  public.product_quality_detection_assessment_hash(
    'c4000000-0000-4000-8000-000000000001',
    'android-touch-target-finding',
    'Home main tab',
    repeat('1',64),
    'medium',
    repeat('2',64),
    array[repeat('3',64)],
    'layout_density',
    0.86::numeric,
    'confirmed_defect',
    repeat('4',64),
    repeat('5',64),
    repeat('6',64),
    'installed_ui_observed'
  ),
  'a materially different confidence value changes the assessment hash'
);

select * from finish();
rollback;
