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

select ok(
  public.product_experience_livekit_bounded_failure_fixture_is_valid(
    'failed',
    (select metric_manifest from livekit_fixture)
  ),
  'exact failed bounded fixture is valid'
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
  'websocket_failure',
  'database independently derives the failure category'
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
  has_function_privilege(
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
  'only the exact evaluator role can execute the wrapper'
);

select ok(
  cognitive_runtime.runtime_operation_allowed(
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
  'runtime operation is evaluator-only'
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
        'product_experience_livekit_no_finding_attestations_immutable'
      )
  ),
  5::bigint,
  'finding, recurrence, event, proof, and immutability guards exist'
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
        '%product_experience_livekit_bounded_failure_fixture_is_valid%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%product_quality_bounded_failure_fixture_finding_rejected%'
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname =
        'product_quality_reject_bounded_failure_fixture_finding'
  ),
  'one fail-closed table-boundary trigger function covers direct and RPC writes'
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

select * from finish();
rollback;
