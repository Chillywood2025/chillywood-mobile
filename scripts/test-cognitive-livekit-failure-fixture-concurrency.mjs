#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";

const repositoryRoot = process.cwd();
const projectName = path.basename(repositoryRoot);
const databaseContainer = process.env.SUPABASE_DB_CONTAINER ||
  `supabase_db_${projectName}`;
const databaseName = process.env.SUPABASE_LOCAL_DB_NAME || "postgres";
const loginRole = "cognitive_livekit_experience_collector_login";
const principalRole = "cognitive_livekit_experience_collector";
const loginPassword = crypto.randomBytes(32).toString("hex");
const serviceAssertion = crypto.randomBytes(32).toString("hex");
const uuid = () => crypto.randomUUID();
const hash = () => crypto.randomBytes(32).toString("hex");
const projectId = uuid();
const taskId = uuid();
const capabilityId = uuid();
const fixtureId = hash();
const fixtureAttestationHash = hash();
const evidenceManifestHash = hash();
const collectionIdempotencyHash = hash();
const roomRunCorrelationHash = hash();
const runtimeIdentityHash = hash();
const sourceBuildHash = hash();
const installedUiEvidenceHash = hash();
const headlessParticipantIdentityHash = hash();
const installedParticipantIdentityHash = hash();
const syntheticRoomName = "cognitive-test-livekit-concurrency";
const syntheticRoomNameHash = crypto
  .createHash("sha256")
  .update(syntheticRoomName)
  .digest("hex");
const sourceCommit = "718446452de16008cfd0540482e2ba126d412e05";
const now = Date.now();
const issuedAt = new Date(now - 15_000).toISOString();
const expiresAt = new Date(now + 180_000).toISOString();
const observationStartedAt = new Date(now - 10_000).toISOString();
const observationFinishedAt = new Date(now - 2_000).toISOString();
const evaluationExpiresAt = new Date(now + 60 * 60_000).toISOString();
let netPublicUsageBefore = null;
let loginProvisioned = false;
let stage = "initialization";

const sqlLiteral = (value) => {
  assert.match(value, /^[A-Za-z0-9_./:+-]+$/u);
  return `'${value}'`;
};

const admin = (sql, { capture = false, extraEnv = {} } = {}) =>
  spawnSync(
    "docker",
    [
      "exec",
      "-i",
      ...Object.keys(extraEnv).flatMap((name) => ["-e", name]),
      "-e",
      "TEST_DATABASE_NAME",
      databaseContainer,
      "sh",
      "-c",
      [
        'PGPASSWORD="${POSTGRES_PASSWORD:?}";',
        "export PGPASSWORD;",
        "exec psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1",
        "--tuples-only --no-align --username supabase_admin",
        '--dbname "$TEST_DATABASE_NAME"',
      ].join(" "),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ...extraEnv,
        TEST_DATABASE_NAME: databaseName,
      },
      input: sql,
      stdio: ["pipe", capture ? "pipe" : "ignore", "ignore"],
    },
  );

const runtime = (sql) =>
  spawn(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      "PGPASSWORD",
      "-e",
      "TEST_SERVICE_ASSERTION",
      databaseContainer,
      "psql",
      "--no-psqlrc",
      "--quiet",
      "--set=ON_ERROR_STOP=1",
      "--host",
      "127.0.0.1",
      "--port",
      "5432",
      "--username",
      loginRole,
      "--dbname",
      databaseName,
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        PGPASSWORD: loginPassword,
        TEST_SERVICE_ASSERTION: serviceAssertion,
      },
      stdio: ["pipe", "ignore", "pipe"],
    },
  );

const completed = (child, sql) =>
  new Promise((resolve) => {
    const errorChunks = [];
    child.stderr.on("data", (chunk) => errorChunks.push(chunk));
    child.once("error", () =>
      resolve({ category: "PROCESS_ERROR", status: 127 }));
    child.once("close", (code) => {
      const errorText = Buffer.concat(errorChunks).toString("utf8");
      const categories = [
        "livekit_failure_fixture_consumption_rejected",
        "livekit_failure_fixture_binding_rejected",
        "livekit_failure_fixture_capability_rejected",
        "product_experience_sentinel_collection_rejected",
        "product_experience_sentinel_idempotency_conflict",
        "product_experience_collector_capability_required",
        "livekit_fixture_plan_required",
        "cognitive_runtime_principal_rejected",
        "livekit_failure_fixture_sentinel_receipt_rejected",
        "deadlock detected",
        "canceling statement due to lock timeout",
        "statement timeout",
        "permission denied",
        "violates",
        "invalid input syntax",
        "function",
      ];
      const contextFunctions = [
        "product_experience_livekit_failure_fixture_scope_is_valid",
        "product_experience_livekit_bounded_failure_fixture_is_valid",
        "product_experience_reject_unbound_livekit_failure_fixture",
        "product_experience_collect_sentinel_run",
        "product_experience_require_collector_capability",
        "cognitive_product_quality_assert_service_capability",
        "cognitive_lock_task_writes_allowed",
        "collect_livekit_sentinel_run",
        "consume_livekit_failure_fixture_and_collect",
      ];
      const observedContextFunctions = [
        ...errorText.matchAll(
          /(?:PL\/pgSQL|SQL) function ([a-z0-9_.]+)/gu,
        ),
      ].map((match) => match[1]);
      const constraintNames = [
        ...errorText.matchAll(
          /violates (?:check|foreign key|unique) constraint "([a-z0-9_]+)"/gu,
        ),
      ].map((match) => match[1]);
      resolve({
        category: categories.find((value) => errorText.includes(value)) ||
          (code === 0 ? "MATCH" : "UNCLASSIFIED"),
        context: [
          ...new Set([
            ...contextFunctions.filter((value) => errorText.includes(value)),
            ...observedContextFunctions,
            ...constraintNames,
          ]),
        ],
        status: code ?? 1,
      });
    });
    child.stdin.end(sql);
  });

const cleanup = () => {
  if (!loginProvisioned) return;
  const restoreNet = netPublicUsageBefore === "t"
    ? "grant usage on schema net to public;"
    : "";
  admin(`
    select pg_catalog.pg_terminate_backend(activity.pid)
    from pg_catalog.pg_stat_activity activity
    where activity.usename = ${sqlLiteral(loginRole)}
      and activity.pid <> pg_catalog.pg_backend_pid();
    drop role if exists ${loginRole};
    ${restoreNet}
  `);
  loginProvisioned = false;
};

process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

try {
  stage = "container_preflight";
  const containerState = spawnSync(
    "docker",
    ["inspect", databaseContainer],
    { stdio: "ignore" },
  );
  assert.equal(containerState.status, 0);

  stage = "net_acl_readback";
  const netReadback = admin(`
    select exists (
      select 1
      from pg_catalog.pg_namespace namespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          namespace.nspacl,
          pg_catalog.acldefault('n', namespace.nspowner)
        )
      ) schema_acl
      where namespace.nspname = 'net'
        and schema_acl.grantee = 0
        and schema_acl.privilege_type = 'USAGE'
    );
  `, { capture: true });
  assert.equal(netReadback.status, 0);
  netPublicUsageBefore = netReadback.stdout.trim();
  assert.ok(["t", "f"].includes(netPublicUsageBefore));

  stage = "fixture_provisioning";
  const setup = admin(`
    \\getenv login_password TEST_LOGIN_PASSWORD
    \\getenv service_assertion TEST_SERVICE_ASSERTION
    begin;
    revoke usage on schema net from public;
    select 'select 1 / 0'
    where not cognitive_runtime.runtime_login_provisioning_ready()
    \\gexec
    select pg_catalog.pg_terminate_backend(activity.pid)
    from pg_catalog.pg_stat_activity activity
    where activity.usename = ${sqlLiteral(loginRole)}
      and activity.pid <> pg_catalog.pg_backend_pid();
    drop role if exists ${loginRole};
    create role ${loginRole}
      login nosuperuser nocreatedb nocreaterole inherit
      noreplication nobypassrls password :'login_password';
    revoke create, temporary on database ${databaseName}
      from ${loginRole};
    alter role ${loginRole}
      set search_path = cognitive_runtime, pg_catalog;
    alter role ${loginRole} set statement_timeout = '15s';
    alter role ${loginRole}
      set idle_in_transaction_session_timeout = '10s';
    alter role ${loginRole} set lock_timeout = '3s';
    alter role ${loginRole} valid until
      ${sqlLiteral(new Date(now + 10 * 60_000).toISOString())};
    grant ${principalRole} to ${loginRole}
      with admin false, inherit true, set false;

    insert into public.cognitive_projects(
      id,repository_full_name,source_state,activation_state,
      scheduler_state,production_authority
    ) values (
      ${sqlLiteral(projectId)}::uuid,
      'Chillywood2025/chillywood-mobile',
      'collective_governance_source_complete_not_deployed',
      'off','none',false
    );
    insert into public.intelligence_tasks(
      id,project_id,platform,environment,repository_full_name,
      branch_name,task_key,objective_hash,actor_identity,deadman_at
    ) values (
      ${sqlLiteral(taskId)}::uuid,
      ${sqlLiteral(projectId)}::uuid,
      'android','production','Chillywood2025/chillywood-mobile',
      'codex/livekit-fixture-concurrency-test',
      'livekit-fixture-concurrency-test',
      repeat('1',64),'livekit-fixture-concurrency-test',
      transaction_timestamp() + interval '1 day'
    );
    insert into public.autonomous_system_emergency_states(
      system_id,status,reason,updated_at,metadata
    ) values (
      'product_intelligence_operator','active',
      'livekit fixture concurrency test',transaction_timestamp(),
      '{"fixture":true}'::jsonb
    )
    on conflict (system_id) do update set
      status = excluded.status,
      reason = excluded.reason,
      updated_at = excluded.updated_at,
      metadata = excluded.metadata;
    insert into public.cognitive_governance_switches(
      task_id,project_id,platform,environment,switch_key,enabled,
      policy_version,enabled_by,enabled_at,updated_at
    ) values (
      ${sqlLiteral(taskId)}::uuid,
      ${sqlLiteral(projectId)}::uuid,
      'android','production',
      'cognitive_livekit_experience_sentinel_enabled',true,
      'livekit-fixture-concurrency-test',
      ${sqlLiteral(uuid())}::uuid,
      transaction_timestamp(),transaction_timestamp()
    );
    insert into public.cognitive_product_quality_service_capabilities(
      id,service_identity,operation,task_id,project_id,platform,
      environment,assertion_hash,allowed_sentinel_keys,
      registered_by,expires_at
    ) values (
      ${sqlLiteral(capabilityId)}::uuid,
      'cognitive_sentinel_collector','collect_sentinel_run',
      ${sqlLiteral(taskId)}::uuid,
      ${sqlLiteral(projectId)}::uuid,
      'android','production',
      encode(
        extensions.digest(
          convert_to(:'service_assertion','UTF8'),
          'sha256'
        ),
        'hex'
      ),
      array['livekit_experience_sentinel'],
      ${sqlLiteral(uuid())}::uuid,
      transaction_timestamp() + interval '1 hour'
    );
    commit;
  `, {
    extraEnv: {
      TEST_LOGIN_PASSWORD: loginPassword,
      TEST_SERVICE_ASSERTION: serviceAssertion,
    },
  });
  assert.equal(setup.status, 0);
  loginProvisioned = true;

  stage = "fixture_issuance";
  const condition = {
    expectedFailureCategory: "remote_subscription_failure",
    injectedCondition: "suppress_remote_publication",
    timeoutMs: 12000,
    triggerStage: "remote_participant_joined",
  };
  const issueSql = `
    \\getenv service_assertion TEST_SERVICE_ASSERTION
    select cognitive_runtime.issue_livekit_failure_fixture(
      ${sqlLiteral(taskId)}::uuid,
      ${sqlLiteral(projectId)}::uuid,
      'android','production',${sqlLiteral(sourceCommit)},
      ${sqlLiteral(fixtureId)},${sqlLiteral(fixtureAttestationHash)},
      'remote_join_without_publish',
      $fixture_json$${JSON.stringify(condition)}$fixture_json$::jsonb,
      ${sqlLiteral(syntheticRoomName)},
      ${sqlLiteral(syntheticRoomNameHash)},
      ${sqlLiteral(roomRunCorrelationHash)},
      ${sqlLiteral(issuedAt)}::timestamptz,
      ${sqlLiteral(expiresAt)}::timestamptz,
      :'service_assertion'
    );
  `;
  assert.equal(
    (await completed(runtime(issueSql), issueSql)).status,
    0,
  );

  const metrics = {
    backgroundForegroundRecovery: false,
    backgrounded: false,
    buildRuntimeMatched: true,
    cleanupDisconnected: true,
    connectingResolved: true,
    firstAudioVideoObserved: false,
    firstRemoteMediaElapsedMs: 0,
    foregrounded: false,
    headlessObservationFinishedAt:
      new Date(now - 4_000).toISOString(),
    headlessObservationStartedAt: observationStartedAt,
    headlessParticipantIdentityHash,
    headlessParticipantUsed: true,
    iceCheckingObserved: true,
    iceGatheringObserved: true,
    iceState: "connected",
    installedObservationFinishedAt: observationFinishedAt,
    installedObservationStartedAt:
      new Date(now - 8_000).toISOString(),
    installedParticipantIdentityHash,
    installedRoomRunCorrelationHash: roomRunCorrelationHash,
    installedRuntimeIdentityHash: runtimeIdentityHash,
    installedSourceBuildHash: sourceBuildHash,
    installedUiEvidenceHash,
    installedUiObserved: true,
    localMediaSource: "test_tone",
    localTrackPublished: true,
    networkState: "ready",
    participantIdentityDistinct: true,
    peerConnectionEstablished: true,
    permissionState: "granted",
    providerState: "healthy",
    remoteMediaKind: "none",
    remoteParticipantJoined: true,
    remoteTrackSubscribed: false,
    roomConnectElapsedMs: 1000,
    roomConnected: true,
    roomRunCorrelationHash,
    scenarioType: "bounded_failure_fixture",
    stageFailureCategory: "remote_subscription_failure",
    tokenClaimsValidated: true,
    tokenIssuedElapsedMs: 500,
    tokenRequestStarted: true,
    tokenRequested: true,
    tokenResultStatus: "success",
    tokenReturned: true,
    uiStateResolutionElapsedMs: 1000,
    websocketConnected: true,
  };
  const binding = {
    condition,
    fixtureAttestationHash,
    fixtureId,
    fixtureType: "remote_join_without_publish",
    principal: principalRole,
    roomRunCorrelationHash,
    sourceCommit,
    syntheticRoomNameHash,
  };
  const manifest = {
    evidenceHashes: [evidenceManifestHash, fixtureAttestationHash].sort(),
    failureFixtureBinding: binding,
    metrics,
    observationKind: "livekit_experience",
    sanitizationVersion: "bounded-nonpersonal-v1",
    schemaVersion: "product-sentinel-v1",
  };

  stage = "fixture_manifest_preflight";
  const manifestReadback = admin(`
    select case
      when not
        public.product_experience_livekit_fixture_manifest_is_sanitized(
          $metric_json$${JSON.stringify(manifest)}$metric_json$::jsonb
        )
        then 'SANITIZER_MISMATCH'
      when not public.product_experience_metric_manifest_is_bounded(
        'livekit_experience_sentinel',
        ${sqlLiteral(evidenceManifestHash)},
        $metric_json$${JSON.stringify(manifest)}$metric_json$::jsonb
      )
        then 'BOUNDED_MISMATCH'
      when not public.product_experience_detailed_metric_manifest_is_valid(
        'livekit_experience_sentinel',
        'android',
        'failed',
        $metric_json$${JSON.stringify(manifest)}$metric_json$::jsonb
      )
        then 'DETAILED_MISMATCH'
      else 'MATCH'
    end;
  `, { capture: true });
  assert.equal(manifestReadback.status, 0);
  if (manifestReadback.stdout.trim() !== "MATCH") {
    process.stderr.write(`FAIL_CLASS:${manifestReadback.stdout.trim()}\n`);
    const sanitizerDiagnostic = admin(`
      with input as (
        select
          $metric_json$${JSON.stringify(manifest)}$metric_json$::jsonb value
      )
      select case
        when pg_column_size(value) > 65536 then 'SIZE'
        when (
          select count(*) from jsonb_object_keys(value)
        ) <> 6 then 'ENVELOPE_KEYS'
        when (
          select array_agg(key order by key)
          from jsonb_object_keys(value) key
        ) is distinct from array[
          'evidenceHashes','failureFixtureBinding','metrics',
          'observationKind','sanitizationVersion','schemaVersion'
        ]::text[] then 'ENVELOPE_NAMES'
        when (
          select count(*) from jsonb_object_keys(value->'failureFixtureBinding')
        ) <> 8 then 'BINDING_KEYS'
        when (
          select array_agg(key order by key)
          from jsonb_object_keys(value->'failureFixtureBinding') key
        ) is distinct from array[
          'condition','fixtureAttestationHash','fixtureId','fixtureType',
          'principal','roomRunCorrelationHash','sourceCommit',
          'syntheticRoomNameHash'
        ]::text[] then 'BINDING_NAMES'
        when (
          select count(*) from jsonb_object_keys(value->'metrics')
        ) <> 46 then 'METRIC_KEYS'
        when (
          select array_agg(key order by key)
          from jsonb_object_keys(value->'metrics') key
        ) is distinct from array[
          'backgroundForegroundRecovery','backgrounded',
          'buildRuntimeMatched','cleanupDisconnected','connectingResolved',
          'firstAudioVideoObserved','firstRemoteMediaElapsedMs',
          'foregrounded','headlessObservationFinishedAt',
          'headlessObservationStartedAt','headlessParticipantIdentityHash',
          'headlessParticipantUsed','iceCheckingObserved',
          'iceGatheringObserved','iceState',
          'installedObservationFinishedAt','installedObservationStartedAt',
          'installedParticipantIdentityHash',
          'installedRoomRunCorrelationHash','installedRuntimeIdentityHash',
          'installedSourceBuildHash','installedUiEvidenceHash',
          'installedUiObserved','localMediaSource','localTrackPublished',
          'networkState','participantIdentityDistinct',
          'peerConnectionEstablished','permissionState','providerState',
          'remoteMediaKind','remoteParticipantJoined',
          'remoteTrackSubscribed','roomConnectElapsedMs','roomConnected',
          'roomRunCorrelationHash','scenarioType','stageFailureCategory',
          'tokenClaimsValidated','tokenIssuedElapsedMs',
          'tokenRequestStarted','tokenRequested','tokenResultStatus',
          'tokenReturned','uiStateResolutionElapsedMs',
          'websocketConnected'
        ]::text[] then 'METRIC_NAMES'
        when value->'failureFixtureBinding'->>'fixtureId'
          !~ '^[a-f0-9]{64}$'
          or value->'failureFixtureBinding'->>'fixtureAttestationHash'
            !~ '^[a-f0-9]{64}$'
          or value->'failureFixtureBinding'->>'syntheticRoomNameHash'
            !~ '^[a-f0-9]{64}$'
          or value->'failureFixtureBinding'->>'roomRunCorrelationHash'
            !~ '^[a-f0-9]{64}$'
          or value->'failureFixtureBinding'->>'sourceCommit'
            !~ '^[a-f0-9]{40}$' then 'BINDING_HASH'
        when not exists (
          select 1
          from jsonb_array_elements_text(
            value->'evidenceHashes'
          ) evidence(value)
          where evidence.value = value->'failureFixtureBinding'
            ->>'fixtureAttestationHash'
        ) then 'ATTESTATION_EVIDENCE'
        when value->'failureFixtureBinding'->'condition' is distinct from
          public.product_experience_livekit_failure_fixture_condition(
            value->'failureFixtureBinding'->>'fixtureType'
          ) then 'CONDITION'
        when exists (
          select 1
          from jsonb_each(value->'metrics') metric
          where metric.key in (
            'backgroundForegroundRecovery','backgrounded',
            'buildRuntimeMatched','cleanupDisconnected',
            'connectingResolved','firstAudioVideoObserved','foregrounded',
            'headlessParticipantUsed','iceCheckingObserved',
            'iceGatheringObserved','installedUiObserved',
            'localTrackPublished','participantIdentityDistinct',
            'peerConnectionEstablished','remoteParticipantJoined',
            'remoteTrackSubscribed','roomConnected',
            'tokenClaimsValidated','tokenRequestStarted','tokenRequested',
            'tokenReturned','websocketConnected'
          )
            and jsonb_typeof(metric.value) <> 'boolean'
        ) then 'BOOLEAN'
        when exists (
          select 1
          from jsonb_each(value->'metrics') metric
          where metric.key like '%Hash'
            and (
              jsonb_typeof(metric.value) <> 'string'
              or metric.value #>> '{}' !~ '^[a-f0-9]{64}$'
            )
        ) then 'HASH'
        when exists (
          select 1
          from jsonb_each(value->'metrics') metric
          where metric.key like '%At'
            and (
              jsonb_typeof(metric.value) <> 'string'
              or metric.value #>> '{}' !~
                '^[12][0-9]{3}-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$'
            )
        ) then 'TIMESTAMP'
        when exists (
          select 1
          from jsonb_each(value->'metrics') metric
          where metric.key in (
            'firstRemoteMediaElapsedMs','roomConnectElapsedMs',
            'tokenIssuedElapsedMs','uiStateResolutionElapsedMs'
          )
            and (
              jsonb_typeof(metric.value) <> 'number'
              or (metric.value #>> '{}')::numeric not between 0 and 600000
              or trunc((metric.value #>> '{}')::numeric) <>
                (metric.value #>> '{}')::numeric
            )
        ) then 'NUMBER'
        when (
          value->'metrics'->>'headlessObservationStartedAt'
        )::timestamptz > (
          value->'metrics'->>'headlessObservationFinishedAt'
        )::timestamptz then 'HEADLESS_TIME_ORDER'
        when (
          value->'metrics'->>'installedObservationStartedAt'
        )::timestamptz > (
          value->'metrics'->>'installedObservationFinishedAt'
        )::timestamptz then 'INSTALLED_TIME_ORDER'
        when value->'metrics'->>'scenarioType' <>
          'bounded_failure_fixture' then 'SCENARIO'
        when value->'metrics'->>'stageFailureCategory' <>
          value->'failureFixtureBinding'->'condition'
            ->>'expectedFailureCategory' then 'STAGE'
        when value->'metrics'->>'roomRunCorrelationHash' <>
          value->'failureFixtureBinding'
            ->>'roomRunCorrelationHash' then 'ROOM'
        when value->'metrics'->>'installedRoomRunCorrelationHash' <>
          value->'failureFixtureBinding'
            ->>'roomRunCorrelationHash' then 'INSTALLED_ROOM'
        when value->'metrics'->'headlessParticipantUsed' <>
          'true'::jsonb then 'HEADLESS'
        when value->'metrics'->'installedUiObserved' <>
          'true'::jsonb then 'INSTALLED'
        when value->'metrics'->'participantIdentityDistinct' <>
          'true'::jsonb then 'DISTINCT_FLAG'
        when value->'metrics'->>'headlessParticipantIdentityHash' =
          value->'metrics'
            ->>'installedParticipantIdentityHash' then 'SAME_IDENTITY'
        when value->'metrics'->'tokenRequested' <>
          value->'metrics'->'tokenRequestStarted' then 'TOKEN_REQUEST'
        when value->'metrics'->'tokenReturned' <>
          to_jsonb(
            value->'metrics'->>'tokenResultStatus' = 'success'
          ) then 'TOKEN_RESULT'
        when value->'metrics'->'firstAudioVideoObserved' <>
          to_jsonb(
            value->'metrics'->>'remoteMediaKind' <> 'none'
          ) then 'MEDIA_KIND'
        when value->'metrics'->>'iceState' not in (
          'new','checking','connected','completed','failed',
          'disconnected','closed','unknown'
        ) then 'ICE'
        when value->'metrics'->>'localMediaSource' not in (
          'test_tone','silent_audio','color_bars','none'
        ) then 'MEDIA_SOURCE'
        when value->'metrics'->>'networkState' not in (
          'ready','interrupted','unknown'
        ) then 'NETWORK'
        when value->'metrics'->>'permissionState' not in (
          'granted','denied','unknown','not_applicable'
        ) then 'PERMISSION'
        when value->'metrics'->>'providerState' not in (
          'healthy','degraded','blocked','unknown'
        ) then 'PROVIDER'
        when value->'metrics'->>'remoteMediaKind' not in (
          'audio','video','audio_video','none'
        ) then 'REMOTE_MEDIA'
        when value->'metrics'->>'tokenResultStatus' not in (
          'success','denied','error','timeout','not_attempted'
        ) then 'TOKEN_ENUM'
        when value->'metrics'->>'stageFailureCategory' not in (
          'permission_failure','build_runtime_mismatch',
          'network_interruption','token_backend_failure',
          'websocket_failure','ice_turn_failure',
          'room_connection_failure','local_publish_failure',
          'remote_participant_missing','remote_subscription_failure',
          'first_media_missing','installed_ui_connecting_stuck',
          'background_foreground_recovery_failed','cleanup_failure',
          'provider_degradation','deadline_exceeded'
        ) then 'STAGE_ENUM'
        else 'SEMANTIC'
      end
      from input;
    `, { capture: true });
    process.stderr.write(
      `FAIL_CONTEXT:${sanitizerDiagnostic.stdout.trim()}\n`,
    );
  }
  assert.equal(manifestReadback.stdout.trim(), "MATCH");

  const consumeSqlFor = (metricManifest) => `
    \\getenv service_assertion TEST_SERVICE_ASSERTION
    select cognitive_runtime.consume_livekit_failure_fixture_and_collect(
      ${sqlLiteral(taskId)}::uuid,
      ${sqlLiteral(projectId)}::uuid,
      'android','production',${sqlLiteral(sourceCommit)},
      ${sqlLiteral(fixtureId)},${sqlLiteral(fixtureAttestationHash)},
      ${sqlLiteral(syntheticRoomName)},
      ${sqlLiteral(syntheticRoomNameHash)},
      ${sqlLiteral(roomRunCorrelationHash)},
      'live-stage',${sqlLiteral(runtimeIdentityHash)},
      ${sqlLiteral(sourceBuildHash)},${sqlLiteral(evidenceManifestHash)},
      $metric_json$${JSON.stringify(metricManifest)}$metric_json$::jsonb,
      'failed','installed_ui_observed',
      ${sqlLiteral(observationStartedAt)}::timestamptz,
      ${sqlLiteral(observationFinishedAt)}::timestamptz,
      ${sqlLiteral(evaluationExpiresAt)}::timestamptz,
      ${sqlLiteral(collectionIdempotencyHash)},
      :'service_assertion'
    );
  `;

  stage = "caller_relabel_rejection";
  const relabelled = structuredClone(manifest);
  relabelled.failureFixtureBinding.fixtureType =
    "remote_publication_cancelled";
  const relabelSql = consumeSqlFor(relabelled);
  assert.notEqual(
    (await completed(runtime(relabelSql), relabelSql)).status,
    0,
  );

  stage = "atomic_concurrent_consumption";
  const consumeSql = consumeSqlFor(manifest);
  const outcomes = await Promise.all([
    completed(runtime(consumeSql), consumeSql),
    completed(runtime(consumeSql), consumeSql),
  ]);
  if (outcomes.filter((outcome) => outcome.status === 0).length !== 1) {
    process.stderr.write(
      `FAIL_CLASS:${outcomes.map((outcome) => outcome.category).join(",")}\n`,
    );
    process.stderr.write(
      `FAIL_CONTEXT:${
        outcomes.map((outcome) => outcome.context.join("+")).join(",")
      }\n`,
    );
  }
  assert.equal(
    outcomes.filter((outcome) => outcome.status === 0).length,
    1,
  );
  assert.equal(
    outcomes.filter((outcome) => outcome.status !== 0).length,
    1,
  );

  stage = "replay_rejection";
  assert.notEqual(
    (await completed(runtime(consumeSql), consumeSql)).status,
    0,
  );

  stage = "immutable_receipt_readback";
  const verification = admin(`
    select case when
      (
        select count(*) = 1
        from public.product_experience_livekit_failure_fixture_issuances
        where fixture_id = ${sqlLiteral(fixtureId)}
          and task_id = ${sqlLiteral(taskId)}::uuid
          and project_id = ${sqlLiteral(projectId)}::uuid
          and platform = 'android'
          and environment = 'production'
          and principal = ${sqlLiteral(principalRole)}
          and source_commit = ${sqlLiteral(sourceCommit)}
      )
      and (
        select count(*) = 1
        from public.product_experience_livekit_failure_fixture_consumptions
        where fixture_id = ${sqlLiteral(fixtureId)}
          and fixture_attestation_hash =
            ${sqlLiteral(fixtureAttestationHash)}
          and room_run_correlation_hash =
            ${sqlLiteral(roomRunCorrelationHash)}
      )
      and (
        select count(*) = 1
        from public.product_experience_livekit_failure_fixture_receipts receipt
        join public.product_experience_sentinel_runs sentinel
          on sentinel.id = receipt.sentinel_run_id
        where receipt.fixture_id = ${sqlLiteral(fixtureId)}
          and receipt.task_id = ${sqlLiteral(taskId)}::uuid
          and receipt.evidence_manifest_hash =
            ${sqlLiteral(evidenceManifestHash)}
          and receipt.collection_idempotency_hash =
            ${sqlLiteral(collectionIdempotencyHash)}
          and sentinel.metric_manifest->'failureFixtureBinding'
            = $binding_json$${JSON.stringify(binding)}$binding_json$::jsonb
      )
      then 'MATCH'
      else 'MISMATCH'
    end;
  `, { capture: true });
  assert.equal(verification.status, 0);
  assert.equal(verification.stdout.trim(), "MATCH");

  cleanup();
  process.stdout.write(
    "cognitive LiveKit failure fixture concurrency: 7/7\n",
  );
} catch {
  cleanup();
  process.stderr.write(`FAIL:${stage}\n`);
  process.exitCode = 1;
}
