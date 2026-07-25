begin;
select no_plan();

select is(
  public.product_experience_livekit_failure_fixture_condition(
    'remote_join_without_publish'
  ),
  '{
    "expectedFailureCategory":"remote_subscription_failure",
    "injectedCondition":"suppress_remote_publication",
    "timeoutMs":12000,
    "triggerStage":"remote_participant_joined"
  }'::jsonb,
  'fixture type resolves to one immutable reviewed condition'
);

select is(
  public.product_experience_livekit_failure_fixture_condition(
    'caller_selected_label'
  ),
  null,
  'unknown caller fixture type fails closed'
);

select ok(
  (
    select bool_and(relation.relrowsecurity and relation.relforcerowsecurity)
    from pg_catalog.pg_class relation
    where relation.oid = any(array[
      'public.product_experience_livekit_failure_fixture_issuances'::regclass,
      'public.product_experience_livekit_failure_fixture_consumptions'::regclass,
      'public.product_experience_livekit_failure_fixture_receipts'::regclass
    ])
  ),
  'issuance, consumption, and receipt tables force RLS'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('public'),
        ('anon'),
        ('authenticated'),
        ('service_role'),
        ('cognitive_livekit_experience_collector')
    ) role_value(role_name)
    cross join (
      values
        ('public.product_experience_livekit_failure_fixture_issuances'),
        ('public.product_experience_livekit_failure_fixture_consumptions'),
        ('public.product_experience_livekit_failure_fixture_receipts')
    ) table_value(table_name)
    where pg_catalog.has_table_privilege(
      role_value.role_name,
      table_value.table_name,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
  ),
  'clients, generic service, and LiveKit role have no direct fixture-table privileges'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'product_experience_livekit_failure_fixture_issuances',
        'product_experience_livekit_failure_fixture_consumptions',
        'product_experience_livekit_failure_fixture_receipts'
      )
      and column_name ~ '(ticket|secret|password|token)'
  ),
  0,
  'fixture persistence contains no raw ticket or credential column'
);

select ok(
  (
    select count(*) = 1
    from pg_catalog.pg_constraint constraint_value
    where constraint_value.conrelid =
      'public.product_experience_livekit_failure_fixture_issuances'::regclass
      and constraint_value.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_value.oid) like
        '%expires_at >= (issued_at + ''00:00:30''::interval)%'
      and pg_catalog.pg_get_constraintdef(constraint_value.oid) like
        '%expires_at <= (issued_at + ''00:05:00''::interval)%'
  ),
  'table boundary constrains fixture lifetime to 30 through 300 seconds'
);

select ok(
  cognitive_runtime.runtime_operation_allowed(
    'cognitive_livekit_experience_collector',
    'issue_livekit_failure_fixture'
  )
  and cognitive_runtime.runtime_operation_allowed(
    'cognitive_livekit_experience_collector',
    'consume_livekit_failure_fixture'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_sentinel_collector',
    'issue_livekit_failure_fixture'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_evaluator',
    'consume_livekit_failure_fixture'
  ),
  'fixture issue and consume operations are bound only to the LiveKit principal'
);

select ok(
  pg_catalog.has_function_privilege(
    'cognitive_livekit_experience_collector',
    'cognitive_runtime.issue_livekit_failure_fixture(uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text,timestamptz,timestamptz,text)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'cognitive_livekit_experience_collector',
    'cognitive_runtime.consume_livekit_failure_fixture_and_collect(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'cognitive_sentinel_collector',
    'cognitive_runtime.issue_livekit_failure_fixture(uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text,timestamptz,timestamptz,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'cognitive_product_quality_evaluator',
    'cognitive_runtime.consume_livekit_failure_fixture_and_collect(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  ),
  'only the exact LiveKit principal can execute fixture wrappers'
);

select ok(
  (
    select
      pg_catalog.pg_get_function_arguments(procedure.oid) not like '%ticket%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%product_experience_livekit_failure_fixture_issuances%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%cognitive_lock_task_writes_allowed%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%cognitive_product_quality_assert_service_capability%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%cognitive_livekit_experience_sentinel_enabled%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%issuance_replay_rejected%'
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and procedure.proname = 'issue_livekit_failure_fixture'
  ),
  'issuer persists exact scope, rechecks liveness, and stores no raw ticket'
);

select ok(
  (
    select
      pg_catalog.pg_get_functiondef(procedure.oid) ~*
        'for[[:space:]]+update'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%product_experience_livekit_failure_fixture_consumptions%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%product_experience_livekit_failure_fixture_receipts%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%collect_livekit_sentinel_run%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%capability_id_value <> issuance_value.capability_id%'
      and pg_catalog.pg_get_function_arguments(procedure.oid) not like '%ticket%'
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and procedure.proname =
        'consume_livekit_failure_fixture_and_collect'
  ),
  'consumer serializes one claim, revalidates capability, collects, and receipts atomically'
);

select ok(
  (
    select count(*) = 3
    from pg_catalog.pg_trigger trigger_value
    where not trigger_value.tgisinternal
      and trigger_value.tgname in (
        'product_experience_livekit_fixture_issuances_immutable',
        'product_experience_livekit_fixture_consumptions_immutable',
        'product_experience_livekit_fixture_receipts_immutable'
      )
  ),
  'all three fixture evidence tables reject update and delete'
);

insert into public.cognitive_projects(
  id,
  repository_full_name,
  source_state,
  activation_state,
  scheduler_state,
  production_authority
) values (
  'fd000000-0000-4000-8000-000000000001',
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
  'fd100000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000001',
  'android',
  'production',
  'Chillywood2025/chillywood-mobile',
  'codex/livekit-fixture-persistence-test',
  'livekit-fixture-persistence-test',
  repeat('1',64),
  'livekit-fixture-persistence-test',
  transaction_timestamp() + interval '1 day'
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
  'fd200000-0000-4000-8000-000000000001',
  'cognitive_sentinel_collector',
  'collect_sentinel_run',
  'fd100000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000001',
  'android',
  'production',
  repeat('2',64),
  array['livekit_experience_sentinel'],
  'fd300000-0000-4000-8000-000000000001',
  transaction_timestamp() + interval '1 hour'
);

insert into
  public.product_experience_livekit_failure_fixture_issuances (
    fixture_id,task_id,project_id,platform,environment,principal,
    source_commit,capability_id,fixture_type,condition,
    fixture_attestation_hash,synthetic_room_name,
    synthetic_room_name_hash,room_run_correlation_hash,
    issued_at,expires_at,issuance_hash
  )
select
  repeat('a',64),
  'fd100000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000001',
  'android',
  'production',
  'cognitive_livekit_experience_collector',
  repeat('1',40),
  'fd200000-0000-4000-8000-000000000001',
  'remote_join_without_publish',
  public.product_experience_livekit_failure_fixture_condition(
    'remote_join_without_publish'
  ),
  repeat('b',64),
  'cognitive-test-livekit-fixture',
  public.product_experience_livekit_synthetic_room_hash(
    'cognitive-test-livekit-fixture'
  ),
  repeat('e',64),
  transaction_timestamp() - interval '10 seconds',
  transaction_timestamp() + interval '110 seconds',
  public.product_experience_livekit_fixture_issuance_hash(
    repeat('a',64),
    'fd100000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000001',
    'android',
    'production',
    'cognitive_livekit_experience_collector',
    repeat('1',40),
    'fd200000-0000-4000-8000-000000000001',
    'remote_join_without_publish',
    public.product_experience_livekit_failure_fixture_condition(
      'remote_join_without_publish'
    ),
    repeat('b',64),
    'cognitive-test-livekit-fixture',
    public.product_experience_livekit_synthetic_room_hash(
      'cognitive-test-livekit-fixture'
    ),
    repeat('e',64),
    transaction_timestamp() - interval '10 seconds',
    transaction_timestamp() + interval '110 seconds'
  );

insert into
  public.product_experience_livekit_failure_fixture_consumptions (
    fixture_id,task_id,project_id,platform,environment,principal,
    source_commit,fixture_attestation_hash,synthetic_room_name,
    synthetic_room_name_hash,room_run_correlation_hash,route_or_surface,
    runtime_identity_hash,source_build_hash,evidence_manifest_hash,
    collection_idempotency_hash,observation_started_at,
    observation_finished_at,claimed_at,consumption_hash
  )
select
  repeat('a',64),
  'fd100000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000001',
  'android',
  'production',
  'cognitive_livekit_experience_collector',
  repeat('1',40),
  repeat('b',64),
  'cognitive-test-livekit-fixture',
  public.product_experience_livekit_synthetic_room_hash(
    'cognitive-test-livekit-fixture'
  ),
  repeat('e',64),
  'live-stage',
  repeat('f',64),
  repeat('9',64),
  repeat('c',64),
  repeat('d',64),
  date_trunc(
    'milliseconds',
    transaction_timestamp() - interval '5 seconds'
  ),
  date_trunc(
    'milliseconds',
    transaction_timestamp() - interval '1 second'
  ),
  transaction_timestamp(),
  public.product_experience_livekit_fixture_consumption_hash(
    repeat('a',64),
    'fd100000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000001',
    'android',
    'production',
    'cognitive_livekit_experience_collector',
    repeat('1',40),
    repeat('b',64),
    'cognitive-test-livekit-fixture',
    public.product_experience_livekit_synthetic_room_hash(
      'cognitive-test-livekit-fixture'
    ),
    repeat('e',64),
    'live-stage',
    repeat('f',64),
    repeat('9',64),
    repeat('c',64),
    repeat('d',64),
    date_trunc(
      'milliseconds',
      transaction_timestamp() - interval '5 seconds'
    ),
    date_trunc(
      'milliseconds',
      transaction_timestamp() - interval '1 second'
    ),
    transaction_timestamp()
  );

create temporary table fixture_manifest(metric_manifest jsonb not null)
on commit drop;

insert into fixture_manifest(metric_manifest)
select jsonb_build_object(
  'schemaVersion','product-sentinel-v1',
  'sanitizationVersion','bounded-nonpersonal-v1',
  'observationKind','livekit_experience',
  'evidenceHashes',jsonb_build_array(repeat('b',64),repeat('c',64)),
  'failureFixtureBinding',jsonb_build_object(
    'condition',
      public.product_experience_livekit_failure_fixture_condition(
        'remote_join_without_publish'
      ),
    'fixtureAttestationHash',repeat('b',64),
    'fixtureId',repeat('a',64),
    'fixtureType','remote_join_without_publish',
    'principal','cognitive_livekit_experience_collector',
    'roomRunCorrelationHash',repeat('e',64),
    'sourceCommit',repeat('1',40),
    'syntheticRoomNameHash',
      public.product_experience_livekit_synthetic_room_hash(
        'cognitive-test-livekit-fixture'
      )
  ),
  'metrics',jsonb_build_object(
    'backgroundForegroundRecovery',false,
    'backgrounded',false,
    'buildRuntimeMatched',true,
    'cleanupDisconnected',true,
    'connectingResolved',true,
    'firstAudioVideoObserved',false,
    'firstRemoteMediaElapsedMs',0,
    'foregrounded',false,
    'headlessObservationFinishedAt',
      to_char(
        transaction_timestamp() - interval '3 seconds',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
    'headlessObservationStartedAt',
      to_char(
        transaction_timestamp() - interval '5 seconds',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
    'headlessParticipantIdentityHash',repeat('7',64),
    'headlessParticipantUsed',true,
    'iceCheckingObserved',true,
    'iceGatheringObserved',true,
    'iceState','connected',
    'installedObservationFinishedAt',
      to_char(
        transaction_timestamp() - interval '1 second',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
    'installedObservationStartedAt',
      to_char(
        transaction_timestamp() - interval '4 seconds',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
    'installedParticipantIdentityHash',repeat('8',64),
    'installedRoomRunCorrelationHash',repeat('e',64),
    'installedRuntimeIdentityHash',repeat('f',64),
    'installedSourceBuildHash',repeat('9',64),
    'installedUiEvidenceHash',repeat('6',64),
    'installedUiObserved',true,
    'localMediaSource','test_tone',
    'localTrackPublished',true,
    'networkState','ready',
    'participantIdentityDistinct',true,
    'peerConnectionEstablished',true,
    'permissionState','granted',
    'providerState','healthy',
    'remoteMediaKind','none',
    'remoteParticipantJoined',true,
    'remoteTrackSubscribed',false,
    'roomConnectElapsedMs',1000,
    'roomConnected',true,
    'roomRunCorrelationHash',repeat('e',64),
    'scenarioType','bounded_failure_fixture',
    'stageFailureCategory','remote_subscription_failure',
    'tokenClaimsValidated',true,
    'tokenIssuedElapsedMs',500,
    'tokenRequestStarted',true,
    'tokenRequested',true,
    'tokenResultStatus','success',
    'tokenReturned',true,
    'uiStateResolutionElapsedMs',1000,
    'websocketConnected',true
  )
);

select ok(
  public.product_experience_livekit_bounded_failure_fixture_is_valid(
    'failed',
    (select metric_manifest from fixture_manifest)
  ),
  'table-bound exact fixture evidence validates'
);

select ok(
  public.product_experience_livekit_failure_fixture_scope_is_valid(
    'fd100000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000001',
    'android',
    'production',
    'live-stage',
    repeat('f',64),
    repeat('9',64),
    repeat('c',64),
    repeat('d',64),
    date_trunc(
      'milliseconds',
      transaction_timestamp() - interval '5 seconds'
    ),
    date_trunc(
      'milliseconds',
      transaction_timestamp() - interval '1 second'
    ),
    'failed',
    (select metric_manifest from fixture_manifest)
  ),
  'validator binds exact task, project, platform, evidence, and observation scope'
);

select is(
  public.product_experience_livekit_bounded_failure_fixture_is_valid(
    'failed',
    (
      select jsonb_set(
        metric_manifest,
        '{failureFixtureBinding,fixtureType}',
        '"remote_publication_cancelled"'::jsonb
      )
      from fixture_manifest
    )
  ),
  false,
  'caller cannot relabel an issued fixture type'
);

select is(
  public.product_experience_livekit_bounded_failure_fixture_is_valid(
    'failed',
    (
      select jsonb_set(
        metric_manifest,
        '{metrics,stageFailureCategory}',
        '"websocket_failure"'::jsonb
      )
      from fixture_manifest
    )
  ),
  false,
  'caller cannot relabel the expected failure stage'
);

select is(
  public.product_experience_livekit_failure_fixture_scope_is_valid(
    'fd100000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000001',
    'ios',
    'production',
    'live-stage',
    repeat('f',64),
    repeat('9',64),
    repeat('c',64),
    repeat('d',64),
    date_trunc(
      'milliseconds',
      transaction_timestamp() - interval '5 seconds'
    ),
    date_trunc(
      'milliseconds',
      transaction_timestamp() - interval '1 second'
    ),
    'failed',
    (select metric_manifest from fixture_manifest)
  ),
  false,
  'platform mismatch fails the exact scope validator'
);

select is(
  public.product_experience_livekit_derived_failure_category(
    'android',
    'failed',
    (select metric_manifest from fixture_manifest)
  ),
  'remote_subscription_failure',
  'the STABLE derived-category function reads the exact persisted fixture binding'
);

select throws_ok(
  $sql$
    do $fixture_replay$
    begin
      begin
        insert into
          public.product_experience_livekit_failure_fixture_consumptions
        select *
        from public.product_experience_livekit_failure_fixture_consumptions
        where fixture_id = repeat('a',64);
      exception
        when unique_violation then
          raise exception 'fixture_consumption_replay_rejected'
            using errcode = 'P0001';
      end;
    end;
    $fixture_replay$
  $sql$,
  'P0001',
  'fixture_consumption_replay_rejected',
  'fixture consumption is single-use'
);

select throws_ok(
  $sql$
    update public.product_experience_livekit_failure_fixture_issuances
    set expires_at = expires_at + interval '1 second'
    where fixture_id = repeat('a',64)
  $sql$,
  '42501',
  'immutable_cognitive_evidence',
  'fixture issuance cannot be modified'
);

select throws_ok(
  $sql$
    delete from public.product_experience_livekit_failure_fixture_consumptions
    where fixture_id = repeat('a',64)
  $sql$,
  '42501',
  'immutable_cognitive_evidence',
  'fixture consumption cannot be deleted'
);

select * from finish();
rollback;
