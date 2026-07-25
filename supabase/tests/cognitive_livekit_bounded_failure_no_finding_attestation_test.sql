begin;
select no_plan();

create temporary table livekit_fixture(metric_manifest jsonb not null);
insert into livekit_fixture values (
  '{
    "schemaVersion":"product-sentinel-v1",
    "sanitizationVersion":"bounded-nonpersonal-v1",
    "observationKind":"livekit_experience",
    "evidenceHashes":[
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ],
    "metrics":{
      "scenarioType":"bounded_failure_fixture",
      "tokenRequestStarted":true,
      "tokenRequested":true,
      "tokenReturned":true,
      "tokenResultStatus":"success",
      "websocketConnected":false,
      "iceGatheringObserved":false,
      "iceCheckingObserved":false,
      "iceState":"new",
      "peerConnectionEstablished":false,
      "roomConnected":false,
      "localTrackPublished":false,
      "remoteParticipantJoined":false,
      "remoteTrackSubscribed":false,
      "firstAudioVideoObserved":false,
      "connectingResolved":false,
      "backgrounded":false,
      "foregrounded":false,
      "backgroundForegroundRecovery":false,
      "cleanupDisconnected":true,
      "buildRuntimeMatched":true,
      "installedUiObserved":true,
      "installedUiEvidenceHash":
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "localMediaSource":"test_tone",
      "networkState":"ready",
      "permissionState":"granted",
      "providerState":"healthy",
      "remoteMediaKind":"none",
      "stageFailureCategory":"websocket_failure",
      "headlessParticipantUsed":true,
      "tokenIssuedElapsedMs":1000,
      "roomConnectElapsedMs":0,
      "uiStateResolutionElapsedMs":0,
      "firstRemoteMediaElapsedMs":0
    }
  }'::jsonb
);

select is(
  public.product_experience_livekit_bounded_failure_fixture_is_valid(
    'failed',
    (select metric_manifest from livekit_fixture)
  ),
  false,
  'caller-labeled bounded failure fixture is invalid without a reviewed fixture plan'
);

select is(
  public.product_experience_livekit_scenario_is_valid(
    'failed',
    (select (metric_manifest->'metrics') - 'scenarioType'::text
     from livekit_fixture)
  ),
  false,
  'missing scenarioType fails closed'
);

select is(
  public.product_experience_livekit_scenario_is_valid(
    'failed',
    (select jsonb_set(
      metric_manifest->'metrics','{scenarioType}','null'::jsonb
    ) from livekit_fixture)
  ),
  false,
  'JSON null scenarioType fails closed'
);

select is(
  public.product_experience_livekit_scenario_is_valid(
    'failed',
    (select jsonb_set(
      metric_manifest->'metrics','{scenarioType}','7'::jsonb
    ) from livekit_fixture)
  ),
  false,
  'non-string scenarioType fails closed'
);

select is(
  public.product_experience_livekit_scenario_is_valid(
    'failed',
    (select jsonb_set(
      metric_manifest->'metrics',
      '{scenarioType}',
      '"unknown_fixture"'::jsonb
    ) from livekit_fixture)
  ),
  false,
  'unknown string scenarioType fails closed'
);

select is(
  public.product_experience_livekit_scenario_is_valid(
    'failed',
    (select
      (metric_manifest->'metrics') - 'stageFailureCategory'::text
     from livekit_fixture)
  ),
  false,
  'missing fixture stageFailureCategory fails closed'
);

select is(
  public.product_experience_livekit_scenario_is_valid(
    'failed',
    (select jsonb_set(
      metric_manifest->'metrics',
      '{stageFailureCategory}',
      'null'::jsonb
    ) from livekit_fixture)
  ),
  false,
  'JSON null fixture stageFailureCategory fails closed'
);

select is(
  public.product_experience_livekit_scenario_is_valid(
    'failed',
    (select jsonb_set(
      metric_manifest->'metrics',
      '{stageFailureCategory}',
      '1'::jsonb
    ) from livekit_fixture)
  ),
  false,
  'non-string fixture stageFailureCategory fails closed'
);

select is(
  public.product_experience_detailed_metric_manifest_is_valid(
    'livekit_experience_sentinel',
    'android',
    'failed',
    (select jsonb_set(
      metric_manifest,
      '{metrics,scenarioType}',
      'null'::jsonb
    ) from livekit_fixture)
  ),
  false,
  'persisted wrapper uses explicit fail-closed boolean semantics'
);

select is(
  public.product_experience_livekit_derived_failure_category(
    'android',
    'failed',
    (select metric_manifest from livekit_fixture)
  ),
  null,
  'rejected caller-labeled fixture cannot derive a no-finding failure category'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'livekit_experience_sentinel',
    'android',
    'failed',
    (select jsonb_set(
      metric_manifest,
      '{metrics,scenarioType}',
      '"success_baseline"'::jsonb
    ) from livekit_fixture)
  )
  and not public.product_experience_livekit_bounded_failure_fixture_is_valid(
    'failed',
    (select jsonb_set(
      metric_manifest,
      '{metrics,scenarioType}',
      '"success_baseline"'::jsonb
    ) from livekit_fixture)
  ),
  'otherwise identical non-fixture failure remains finding-eligible'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid =
      'public.product_experience_livekit_no_finding_attestations'::regclass
  ),
  'no-finding attestation table forces RLS'
);

select ok(
  not has_table_privilege(
    'public',
    'public.product_experience_livekit_no_finding_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'anon',
    'public.product_experience_livekit_no_finding_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.product_experience_livekit_no_finding_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role',
    'public.product_experience_livekit_no_finding_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'cognitive_product_quality_evaluator',
    'public.product_experience_livekit_no_finding_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'no client, generic service, or runtime role has direct table access'
);

select ok(
  not has_function_privilege(
    'cognitive_product_quality_evaluator',
    'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'public',
    'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
    'EXECUTE'
  ),
  'the retired bounded-failure no-finding wrapper is not executable by any runtime or client role'
);

select ok(
  not cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_evaluator',
    'attest_livekit_bounded_failure_no_finding'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_triage',
    'attest_livekit_bounded_failure_no_finding'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_livekit_experience_collector',
    'attest_livekit_bounded_failure_no_finding'
  ),
  'the retired bounded-failure no-finding runtime operation is unavailable to every principal'
);

select ok(
  public.governance_service_identity_allows_operation(
    'cognitive_product_quality_evaluator',
    'independent_evaluation'
  )
  and not public.governance_service_identity_allows_operation(
    'cognitive_product_quality_evaluator',
    'set_switch'
  ),
  'distinct product evaluator assertion identity is closed'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_trigger trigger
    where not trigger.tgisinternal
      and trigger.tgname in (
        'pq_bounded_fixture_finding_insert_guard',
        'pq_bounded_fixture_finding_recurrence_guard',
        'pq_bounded_fixture_event_guard',
        'pq_bounded_fixture_proof_guard',
        'product_experience_livekit_no_finding_attestations_immutable',
        'product_experience_livekit_no_finding_current_task_live'
      )
  ),
  6::bigint,
  'finding, recurrence, event, proof, immutability, and liveness guards exist'
);

select ok(
  (
    select
      pg_catalog.pg_get_functiondef(procedure.oid) like
        '%cognitive_lock_task_writes_allowed%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%livekit_bounded_failure_no_finding_attestation_task_not_live%'
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname =
        'product_experience_livekit_no_finding_require_live_task'
  ),
  'attestation table boundary locks and rechecks task and emergency liveness'
);

select ok(
  (
    select
      pg_catalog.pg_get_functiondef(procedure.oid) like
        '%product_quality_findings%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%product_quality_finding_events%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%product_experience_sentinel_evaluator_proofs%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%livekit_bounded_failure_no_finding_attestation_replay_rejected%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%''resolutionRequired'', false%'
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and procedure.proname =
        'product_quality_attest_livekit_bounded_failure_no_finding'
  ),
  'wrapper rejects mixed finding state and replay and requires no resolution'
);

select ok(
  (
    select
      pg_catalog.pg_get_functiondef(procedure.oid) like
        '%new.metric_manifest->''metrics''->>''scenarioType''%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%livekit_fixture_plan_required%'
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname =
        'product_experience_reject_unbound_livekit_failure_fixture'
  ),
  'the sentinel-run boundary rejects unbound fixture labels with the exact fail-closed reason'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger
    where trigger.tgrelid =
      'public.product_experience_sentinel_runs'::regclass
      and trigger.tgname =
        'product_experience_unbound_livekit_failure_fixture_rejected'
      and not trigger.tgisinternal
  ),
  'the unbound LiveKit fixture rejection trigger exists on sentinel-run writes'
);

select ok(
  (
    select exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid =
        'public.product_experience_livekit_no_finding_attestations'::regclass
        and constraint_row.contype = 'c'
        and pg_catalog.pg_get_constraintdef(constraint_row.oid) like
          '%attestation_hash = product_experience_livekit_no_finding_attestation_hash%'
    )
  ),
  'table boundary binds each immutable attestation to its canonical hash'
);

select is(
  public.product_experience_livekit_no_finding_attestation_hash(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'android',
    'production',
    repeat('a',64),
    repeat('b',64),
    'websocket_failure',
    repeat('c',64)
  ),
  encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'livekit-bounded-failure-no-finding-attestation-v1',
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
          'android',
          'production',
          'bounded_failure_fixture',
          repeat('a',64),
          repeat('b',64),
          'websocket_failure',
          repeat('c',64)
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'attestation hash uses the reviewed ordered pipe preimage'
);

insert into public.cognitive_projects(
  id,
  repository_full_name,
  source_state,
  activation_state,
  scheduler_state,
  production_authority
) values (
  'cf000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off',
  'none',
  false
);

insert into public.intelligence_tasks(
  id,
  project_id,
  platform,
  environment,
  repository_full_name,
  branch_name,
  task_key,
  objective_hash,
  actor_identity,
  deadman_at
) values (
  'cf100000-0000-4000-8000-000000000001',
  'cf000000-0000-4000-8000-000000000001',
  'android',
  'production',
  'Chillywood2025/chillywood-mobile',
  'codex/livekit-no-finding-liveness-test',
  'livekit-no-finding-liveness-test',
  repeat('1',64),
  'livekit-no-finding-liveness-fixture',
  transaction_timestamp() + interval '1 day'
);

insert into public.autonomous_system_emergency_states(
  system_id,
  status,
  reason,
  updated_at,
  metadata
) values (
  'product_intelligence_operator',
  'active',
  'livekit no-finding liveness fixture',
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
  task_id,
  project_id,
  platform,
  environment,
  switch_key,
  enabled,
  policy_version,
  enabled_by,
  enabled_at,
  updated_at
) values (
  'cf100000-0000-4000-8000-000000000001',
  'cf000000-0000-4000-8000-000000000001',
  'android',
  'production',
  'cognitive_livekit_experience_sentinel_enabled',
  true,
  'livekit-no-finding-liveness-test',
  'cf200000-0000-4000-8000-000000000001',
  transaction_timestamp(),
  transaction_timestamp()
);

insert into public.cognitive_product_quality_service_capabilities(
  id,
  service_identity,
  operation,
  task_id,
  project_id,
  platform,
  environment,
  assertion_hash,
  allowed_sentinel_keys,
  registered_by,
  expires_at
) values (
  'cf300000-0000-4000-8000-000000000001',
  'cognitive_sentinel_collector',
  'collect_sentinel_run',
  'cf100000-0000-4000-8000-000000000001',
  'cf000000-0000-4000-8000-000000000001',
  'android',
  'production',
  repeat('2',64),
  array['livekit_experience_sentinel'],
  'cf200000-0000-4000-8000-000000000001',
  transaction_timestamp() + interval '1 hour'
);

select throws_ok(
  $sql$
    insert into public.product_experience_sentinel_runs(
      id,
      task_id,
      project_id,
      platform,
      environment,
      sentinel_key,
      route_or_surface,
      runtime_identity_hash,
      source_build_hash,
      evidence_manifest_hash,
      metric_manifest,
      result_status,
      physical_proof_status,
      collector_capability_id,
      collection_idempotency_hash,
      observation_started_at,
      observation_finished_at,
      evaluation_expires_at
    ) values (
      'cf400000-0000-4000-8000-000000000001',
      'cf100000-0000-4000-8000-000000000001',
      'cf000000-0000-4000-8000-000000000001',
      'android',
      'production',
      'livekit_experience_sentinel',
      'live-stage',
      repeat('3',64),
      repeat('4',64),
      repeat('5',64),
      (select metric_manifest from livekit_fixture),
      'failed',
      'installed_ui_observed',
      'cf300000-0000-4000-8000-000000000001',
      repeat('6',64),
      transaction_timestamp() - interval '2 minutes',
      transaction_timestamp() - interval '1 minute',
      transaction_timestamp() + interval '1 hour'
    )
  $sql$,
  'P0001',
  'livekit_fixture_plan_required',
  'sentinel-run boundary rejects a caller-labeled fixture before persistence'
);

select is(
  (
    select count(*)
    from public.product_experience_sentinel_runs
    where id = 'cf400000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'fixture rejection leaves no sentinel run'
);

select is(
  (
    select count(*)
    from public.product_experience_livekit_no_finding_attestations
    where sentinel_run_id = 'cf400000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'fixture rejection leaves no immutable no-finding attestation'
);

select is(
  (
    select count(*)
    from public.product_quality_findings
    where sentinel_run_id = 'cf400000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'fixture rejection leaves no governed finding'
);

select is(
  (
    select count(*)
    from public.product_experience_sentinel_evaluator_proofs
    where sentinel_run_id = 'cf400000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'fixture rejection leaves no evaluator proof'
);

select is(
  (
    select count(*)
    from public.product_quality_finding_events
    where sentinel_run_id = 'cf400000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'fixture rejection leaves no finding event'
);

select * from finish();
rollback;
