begin;
select no_plan();

insert into public.cognitive_projects(
  id, repository_full_name, source_state, activation_state,
  scheduler_state, production_authority
) values (
  'd0000000-0000-4000-8000-000000000001',
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
  'd1000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'android', 'production', 'Chillywood2025/chillywood-mobile',
  'codex/cognitive-sentinel-no-finding-test',
  'cognitive-sentinel-no-finding-test', repeat('a',64),
  'sentinel-no-finding-fixture',
  transaction_timestamp() + interval '2 days'
);

insert into public.autonomous_system_emergency_states(
  system_id, status, reason, updated_at, metadata
) values (
  'product_intelligence_operator',
  'active',
  'sentinel no-finding fixture active state',
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
) values
  (
    'd1000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'android', 'production',
    'cognitive_installed_journey_sentinel_enabled',
    true, 'sentinel-no-finding-test',
    'd2000000-0000-4000-8000-000000000001',
    transaction_timestamp(), transaction_timestamp()
  ),
  (
    'd1000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'android', 'production',
    'cognitive_visual_experience_sentinel_enabled',
    true, 'sentinel-no-finding-test',
    'd2000000-0000-4000-8000-000000000001',
    transaction_timestamp(), transaction_timestamp()
  );

insert into public.cognitive_product_quality_service_capabilities(
  id, service_identity, operation, task_id, project_id, platform,
  environment, assertion_hash, allowed_sentinel_keys, registered_by,
  expires_at
) values (
  'd3000000-0000-4000-8000-000000000001',
  'cognitive_sentinel_collector',
  'collect_sentinel_run',
  'd1000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'android', 'production',
  encode(
    extensions.digest(
      convert_to('sentinel-no-finding-collector-assertion', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  array[
    'installed_journey_sentinel',
    'visual_product_experience_sentinel'
  ],
  'd2000000-0000-4000-8000-000000000001',
  transaction_timestamp() + interval '1 day'
);

insert into public.governance_two_party_service_assertions(
  service_identity, assertion_hash, allowed_operations, registered_by,
  expires_at
) values (
  'cognitive_product_quality_evaluator',
  encode(
    extensions.digest(
      convert_to('product-quality-evaluator-no-finding-assertion', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  array['independent_evaluation'],
  'd2000000-0000-4000-8000-000000000001',
  transaction_timestamp() + interval '1 day'
);

create temporary table no_finding_fixture(
  fixture_key text primary key,
  run_id uuid,
  assessment_hash text,
  proof_id uuid
) on commit drop;
grant select, insert, update on no_finding_fixture to service_role;

select ok(
  has_function_privilege(
    'cognitive_product_quality_evaluator',
    'cognitive_runtime.product_quality_no_finding_assessment_hash(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'cognitive_product_quality_triage',
    'cognitive_runtime.product_quality_no_finding_assessment_hash(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'cognitive_runtime.product_quality_no_finding_assessment_hash(uuid)',
    'EXECUTE'
  ),
  'only the isolated product evaluator can invoke the no-finding hash wrapper'
);

select ok(
  cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_evaluator',
    'compute_no_finding_hash'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_triage',
    'compute_no_finding_hash'
  ),
  'runtime operation allowlist separates no-finding evaluation from triage'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into no_finding_fixture(fixture_key, run_id)
select
  'passing-route',
  (
    public.product_experience_collect_sentinel_run(
      'd1000000-0000-4000-8000-000000000001',
      'd0000000-0000-4000-8000-000000000001',
      'android','production','installed_journey_sentinel','Home',
      repeat('8',64),repeat('4',64),repeat('5',64),
      '{
        "schemaVersion":"product-sentinel-v1",
        "sanitizationVersion":"bounded-nonpersonal-v1",
        "observationKind":"route_timing",
        "evidenceHashes":["5555555555555555555555555555555555555555555555555555555555555555"],
        "metrics":{
          "elapsedDurationMs":2400,
          "networkState":"ready",
          "timeoutObserved":false
        }
      }'::jsonb,
      'passed','installed_ui_observed',
      transaction_timestamp()-interval '2 minutes',
      transaction_timestamp()-interval '1 minute',
      transaction_timestamp()+interval '1 hour',
      repeat('1',64),
      'cognitive_sentinel_collector',
      'sentinel-no-finding-collector-assertion'
    )->>'sentinelRunId'
  )::uuid;

insert into no_finding_fixture(fixture_key, run_id)
select
  'rejected-route',
  (
    public.product_experience_collect_sentinel_run(
      'd1000000-0000-4000-8000-000000000001',
      'd0000000-0000-4000-8000-000000000001',
      'android','production','installed_journey_sentinel','Explore',
      repeat('8',64),repeat('4',64),repeat('6',64),
      '{
        "schemaVersion":"product-sentinel-v1",
        "sanitizationVersion":"bounded-nonpersonal-v1",
        "observationKind":"route_timing",
        "evidenceHashes":["6666666666666666666666666666666666666666666666666666666666666666"],
        "metrics":{
          "elapsedDurationMs":2600,
          "networkState":"ready",
          "timeoutObserved":false
        }
      }'::jsonb,
      'passed','installed_ui_observed',
      transaction_timestamp()-interval '2 minutes',
      transaction_timestamp()-interval '1 minute',
      transaction_timestamp()+interval '1 hour',
      repeat('2',64),
      'cognitive_sentinel_collector',
      'sentinel-no-finding-collector-assertion'
    )->>'sentinelRunId'
  )::uuid;

insert into no_finding_fixture(fixture_key, run_id)
select
  'slow-route',
  (
    public.product_experience_collect_sentinel_run(
      'd1000000-0000-4000-8000-000000000001',
      'd0000000-0000-4000-8000-000000000001',
      'android','production','installed_journey_sentinel','Library',
      repeat('8',64),repeat('4',64),repeat('7',64),
      '{
        "schemaVersion":"product-sentinel-v1",
        "sanitizationVersion":"bounded-nonpersonal-v1",
        "observationKind":"route_timing",
        "evidenceHashes":["7777777777777777777777777777777777777777777777777777777777777777"],
        "metrics":{
          "elapsedDurationMs":10001,
          "networkState":"ready",
          "timeoutObserved":false
        }
      }'::jsonb,
      'passed','installed_ui_observed',
      transaction_timestamp()-interval '2 minutes',
      transaction_timestamp()-interval '1 minute',
      transaction_timestamp()+interval '1 hour',
      repeat('3',64),
      'cognitive_sentinel_collector',
      'sentinel-no-finding-collector-assertion'
    )->>'sentinelRunId'
  )::uuid;
reset role;

update no_finding_fixture
set assessment_hash =
  public.product_quality_no_finding_assessment_hash(run_id);

select ok(
  (
    select assessment_hash ~ '^[a-f0-9]{64}$'
    from no_finding_fixture
    where fixture_key = 'passing-route'
  ),
  'a passed physical run receives one database-bound no-finding hash'
);

select ok(
  public.product_experience_route_timing_no_finding_is_valid(
    '{"observationKind":"route_timing","metrics":{"elapsedDurationMs":10000,"networkState":"ready","timeoutObserved":false}}'::jsonb
  ),
  'route no-finding accepts the reviewed ten-second ready-network bound'
);

select ok(
  not public.product_experience_route_timing_no_finding_is_valid(
    '{"observationKind":"route_timing","metrics":{"elapsedDurationMs":10001,"networkState":"ready","timeoutObserved":false}}'::jsonb
  ),
  'route no-finding rejects elapsed time above the reviewed bound'
);

select ok(
  not public.product_experience_route_timing_no_finding_is_valid(
    '{"observationKind":"route_timing","metrics":{"elapsedDurationMs":500,"networkState":"degraded","timeoutObserved":false}}'::jsonb
  ),
  'route no-finding rejects degraded-network evidence'
);

select is(
  (
    select assessment_hash
    from no_finding_fixture
    where fixture_key = 'slow-route'
  ),
  null,
  'slow route evidence cannot receive a database-bound no-finding hash'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.product_quality_record_sentinel_evaluator_proof(
      run_id, 'run_no_finding', repeat('f',64), repeat('5',64),
      'passed', repeat('7',64), repeat('8',64),
      'cognitive_product_quality_evaluator',
      'product-quality-evaluator-no-finding-assertion'
    )
    from no_finding_fixture
    where fixture_key = 'passing-route'$$,
  'P0001',
  'product_quality_no_finding_proof_rejected',
  'a no-finding proof cannot substitute a caller-supplied assessment hash'
);

update no_finding_fixture
set proof_id = (
  public.product_quality_record_sentinel_evaluator_proof(
    run_id, 'run_no_finding', assessment_hash, repeat('5',64),
    'passed', repeat('7',64), repeat('8',64),
    'cognitive_product_quality_evaluator',
    'product-quality-evaluator-no-finding-assertion'
  )->>'evaluatorProofId'
)::uuid
where fixture_key = 'passing-route';

select throws_ok(
  $$select public.product_quality_record_sentinel_evaluator_proof(
      run_id, 'run_no_finding', assessment_hash, repeat('5',64),
      'passed', repeat('9',64), repeat('a',64),
      'cognitive_product_quality_evaluator',
      'product-quality-evaluator-no-finding-assertion'
    )
    from no_finding_fixture
    where fixture_key = 'passing-route'$$,
  '23505',
  null,
  'replay cannot create a second no-finding proof for one run'
);

update no_finding_fixture
set proof_id = (
  public.product_quality_record_sentinel_evaluator_proof(
    run_id, 'run_no_finding', assessment_hash, repeat('6',64),
    'rejected', repeat('b',64), repeat('c',64),
    'cognitive_product_quality_evaluator',
    'product-quality-evaluator-no-finding-assertion'
  )->>'evaluatorProofId'
)::uuid
where fixture_key = 'rejected-route';
reset role;

select ok(
  (
    select proof.verdict = 'passed'
      and proof.assessment_kind = 'run_no_finding'
      and proof.evaluator_identity =
        'cognitive_product_quality_evaluator'
    from public.product_experience_sentinel_evaluator_proofs proof
    join no_finding_fixture fixture on fixture.proof_id = proof.id
    where fixture.fixture_key = 'passing-route'
  ),
  'independent no-finding proof is exact, immutable, and identity-bound'
);

select ok(
  (
    select proof.verdict = 'rejected'
      and proof.assessment_kind = 'run_no_finding'
    from public.product_experience_sentinel_evaluator_proofs proof
    join no_finding_fixture fixture on fixture.proof_id = proof.id
    where fixture.fixture_key = 'rejected-route'
  ),
  'a rejected no-finding assessment remains auditable but cannot satisfy readiness'
);

select ok(
  pg_get_functiondef(
    'public.product_quality_triage_detection(uuid,uuid,text,text,text,text,text,text,text[],text,numeric,text,text,text,text,text,text,text)'::regprocedure
  ) like '%assessment_kind <> ''finding_detection''%',
  'triage cannot consume a run-no-finding proof as a finding detection'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure
  ) like '%proof.verdict = ''passed''%'
  and pg_get_functiondef(
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure
  ) like '%proof.assessment_kind = ''run_no_finding''%'
  and pg_get_functiondef(
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure
  ) like '%proof.assessment_kind = ''finding_detection''%'
  and pg_get_functiondef(
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure
  ) not like '%proof.valid_until > now_at%',
  'scheduler accepts only passed, correctly paired historical sentinel proofs'
);

create temporary table objective_accessibility_fixture(
  metrics jsonb not null
) on commit drop;
grant select on objective_accessibility_fixture to service_role;

insert into objective_accessibility_fixture(metrics) values (
  '{
    "platform":"android",
    "measurementUnit":"dp",
    "surfaceFamily":"non_media_interactive_surface",
    "interactiveTargetWidth":102.86,
    "interactiveTargetHeight":23.24,
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
    "targetClassification":"below_platform_minimum",
    "baselineId":"chillywood-product-experience-baseline-v1",
    "baselineVersion":1,
    "baselineState":"needs_product_baseline_review",
    "baselineComparisonHash":null,
    "evidenceQuality":"measured_installed",
    "evidenceQualityHash":"1111111111111111111111111111111111111111111111111111111111111111",
    "componentIdentityHash":"b6b6e64a3375935b849019fbeedd8fd07f02e7a76e938aea3b6e1a0189a7fddc",
    "routeFamilyMappingId":"home_main_tab_navigation_control",
    "routeFamilyMappingHash":"3b6e2cf28d5041e97de6ab4eec5d006c2c5ae7b37b74823904a8645bc923d6e0",
    "automationStatus":"observed",
    "providerState":"not_applicable",
    "contentState":"not_applicable",
    "exceptionVersioned":true,
    "exceptionType":"non_media_surface",
    "exceptionContractId":"non_streaming_discovery_route_v1",
    "exceptionContractHash":"18a3bb4c47a9f78849f15249776daea979abf11b9446f3773dc59d1a74f9894e"
  }'::jsonb
);

select ok(
  public.product_experience_objective_accessibility_binding_is_valid(
    (select metrics from objective_accessibility_fixture)
  )
  and public.product_experience_option_c_touch_target_is_valid(
    'android',
    'failed',
    (select metrics from objective_accessibility_fixture)
  ),
  'Home main tab uses the exact supplemental objective accessibility binding'
);

select ok(
  not public.product_experience_objective_accessibility_binding_is_valid(
    jsonb_set(
      (select metrics from objective_accessibility_fixture),
      '{routeFamilyMappingHash}',
      to_jsonb(repeat('f',64))
    )
  )
  and not public.product_experience_objective_accessibility_binding_is_valid(
    jsonb_set(
      (select metrics from objective_accessibility_fixture),
      '{targetClassification}',
      to_jsonb('meets_wcag_aa_minimum_only'::text)
    )
  ),
  'supplemental binding rejects arbitrary hashes and web preference-only use'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.product_experience_collect_sentinel_run(
      'd1000000-0000-4000-8000-000000000001',
      'd0000000-0000-4000-8000-000000000001',
      'android','production',
      'visual_product_experience_sentinel','Home main tab',
      repeat('8',64),repeat('4',64),repeat('9',64),
      jsonb_build_object(
        'schemaVersion','product-sentinel-v1',
        'sanitizationVersion','bounded-nonpersonal-v1',
        'observationKind','touch_target',
        'evidenceHashes',jsonb_build_array(repeat('9',64)),
        'metrics',
        jsonb_set(
          jsonb_set(
            (select metrics from objective_accessibility_fixture),
            '{routeFamilyMappingId}',
            to_jsonb('home_standard_discovery_rows'::text)
          ),
          '{routeFamilyMappingHash}',
          to_jsonb(
            '1da877c4587ae6389b78f5c57dd212b473fbeae22a9db4885000a8b961f6a44d'::text
          )
        )
        || '{
          "surfaceFamily":"standard_streaming_card",
          "exceptionVersioned":false,
          "exceptionType":"none",
          "exceptionContractId":null,
          "exceptionContractHash":null,
          "baselineState":"approved_baseline"
        }'::jsonb
        || jsonb_build_object(
          'baselineComparisonHash',
          '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
        )
      ),
      'failed','installed_ui_observed',
      transaction_timestamp()-interval '2 minutes',
      transaction_timestamp()-interval '1 minute',
      transaction_timestamp()+interval '1 hour',
      repeat('3',64),
      'cognitive_sentinel_collector',
      'sentinel-no-finding-collector-assertion'
    )$$,
  'P0001',
  'product_experience_sentinel_collection_rejected',
  'Home main-tab evidence cannot reuse the streaming-card route mapping'
);
reset role;

select ok(
  pg_get_functiondef(
    'public.product_experience_enforce_objective_accessibility_run_binding()'::regprocedure
  ) like '%new.route_or_surface = ''Home main tab''%'
  and pg_get_functiondef(
    'public.product_experience_enforce_objective_accessibility_run_binding()'::regprocedure
  ) like '%home_main_tab_navigation_control%',
  'the persistence boundary independently enforces the exact Home-tab binding'
);

select ok(
  not public.product_experience_web_preferred_touch_deviation_is_valid(
    '{"interactiveTargetWidth":"not-a-number","interactiveTargetHeight":30}'::jsonb
  ),
  'malformed web preference metrics fail closed without numeric-cast errors'
);

select * from finish();
rollback;
