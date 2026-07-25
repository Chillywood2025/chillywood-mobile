-- Forward-only immutable issuance and atomic consumption for deterministic
-- LiveKit bounded-failure fixtures. The HMAC ticket itself is never persisted.

create function public.product_experience_livekit_failure_fixture_condition(
  p_fixture_type text
)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_fixture_type
    when 'controlled_test_endpoint_timeout' then
      jsonb_build_object(
        'expectedFailureCategory', 'websocket_failure',
        'injectedCondition', 'hold_test_websocket_handshake',
        'timeoutMs', 12000,
        'triggerStage', 'websocket_connecting'
      )
    when 'participant_disconnect_at_room_connected' then
      jsonb_build_object(
        'expectedFailureCategory', 'remote_participant_missing',
        'injectedCondition', 'disconnect_test_participant',
        'timeoutMs', 1000,
        'triggerStage', 'room_connected'
      )
    when 'remote_join_without_publish' then
      jsonb_build_object(
        'expectedFailureCategory', 'remote_subscription_failure',
        'injectedCondition', 'suppress_remote_publication',
        'timeoutMs', 12000,
        'triggerStage', 'remote_participant_joined'
      )
    when 'remote_publication_cancelled' then
      jsonb_build_object(
        'expectedFailureCategory', 'remote_subscription_failure',
        'injectedCondition', 'cancel_remote_publication',
        'timeoutMs', 1000,
        'triggerStage', 'remote_track_published'
      )
    else null
  end;
$$;

revoke all on function
  public.product_experience_livekit_failure_fixture_condition(text)
from public,anon,authenticated,service_role;

create function public.product_experience_livekit_synthetic_room_hash(
  p_synthetic_room_name text
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(p_synthetic_room_name, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function
  public.product_experience_livekit_synthetic_room_hash(text)
from public,anon,authenticated,service_role;

create function public.product_experience_livekit_fixture_issuance_hash(
  p_fixture_id text,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_principal text,
  p_source_commit text,
  p_capability_id uuid,
  p_fixture_type text,
  p_condition jsonb,
  p_fixture_attestation_hash text,
  p_synthetic_room_name text,
  p_synthetic_room_name_hash text,
  p_room_run_correlation_hash text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'livekit-failure-fixture-issuance-v1',
          p_fixture_id,
          p_task_id::text,
          p_project_id::text,
          p_platform::text,
          p_environment::text,
          p_principal,
          p_source_commit,
          p_capability_id::text,
          p_fixture_type,
          p_condition::text,
          p_fixture_attestation_hash,
          p_synthetic_room_name,
          p_synthetic_room_name_hash,
          p_room_run_correlation_hash,
          floor(extract(epoch from p_issued_at) * 1000000)::bigint::text,
          floor(extract(epoch from p_expires_at) * 1000000)::bigint::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function
  public.product_experience_livekit_fixture_issuance_hash(
    text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
    text,text,uuid,text,jsonb,text,text,text,text,timestamptz,timestamptz
  )
from public,anon,authenticated,service_role;

create function public.product_experience_livekit_fixture_consumption_hash(
  p_fixture_id text,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_principal text,
  p_source_commit text,
  p_fixture_attestation_hash text,
  p_synthetic_room_name text,
  p_synthetic_room_name_hash text,
  p_room_run_correlation_hash text,
  p_route_or_surface text,
  p_runtime_identity_hash text,
  p_source_build_hash text,
  p_evidence_manifest_hash text,
  p_collection_idempotency_hash text,
  p_observation_started_at timestamptz,
  p_observation_finished_at timestamptz,
  p_claimed_at timestamptz
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'livekit-failure-fixture-consumption-v1',
          p_fixture_id,
          p_task_id::text,
          p_project_id::text,
          p_platform::text,
          p_environment::text,
          p_principal,
          p_source_commit,
          p_fixture_attestation_hash,
          p_synthetic_room_name,
          p_synthetic_room_name_hash,
          p_room_run_correlation_hash,
          p_route_or_surface,
          p_runtime_identity_hash,
          p_source_build_hash,
          p_evidence_manifest_hash,
          p_collection_idempotency_hash,
          floor(
            extract(epoch from p_observation_started_at) * 1000000
          )::bigint::text,
          floor(
            extract(epoch from p_observation_finished_at) * 1000000
          )::bigint::text,
          floor(extract(epoch from p_claimed_at) * 1000000)::bigint::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function
  public.product_experience_livekit_fixture_consumption_hash(
    text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
    text,text,text,text,text,text,text,text,text,text,text,
    timestamptz,timestamptz,timestamptz
  )
from public,anon,authenticated,service_role;

create function public.product_experience_livekit_fixture_receipt_hash(
  p_fixture_id text,
  p_sentinel_run_id uuid,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_principal text,
  p_source_commit text,
  p_fixture_attestation_hash text,
  p_consumption_hash text,
  p_evidence_manifest_hash text,
  p_collection_idempotency_hash text,
  p_recorded_at timestamptz
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'livekit-failure-fixture-receipt-v1',
          p_fixture_id,
          p_sentinel_run_id::text,
          p_task_id::text,
          p_project_id::text,
          p_platform::text,
          p_environment::text,
          p_principal,
          p_source_commit,
          p_fixture_attestation_hash,
          p_consumption_hash,
          p_evidence_manifest_hash,
          p_collection_idempotency_hash,
          floor(extract(epoch from p_recorded_at) * 1000000)::bigint::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function
  public.product_experience_livekit_fixture_receipt_hash(
    text,uuid,uuid,uuid,public.cognitive_platform,
    public.cognitive_environment,text,text,text,text,text,text,timestamptz
  )
from public,anon,authenticated,service_role;

create table
  public.product_experience_livekit_failure_fixture_issuances (
    fixture_id text primary key check (
      fixture_id ~ '^[a-f0-9]{64}$'
    ),
    task_id uuid not null,
    project_id uuid not null,
    platform public.cognitive_platform not null,
    environment public.cognitive_environment not null,
    principal text not null check (
      principal = 'cognitive_livekit_experience_collector'
    ),
    source_commit text not null check (
      source_commit ~ '^[a-f0-9]{40}$'
    ),
    capability_id uuid not null,
    fixture_type text not null check (
      fixture_type in (
        'controlled_test_endpoint_timeout',
        'participant_disconnect_at_room_connected',
        'remote_join_without_publish',
        'remote_publication_cancelled'
      )
    ),
    condition jsonb not null,
    fixture_attestation_hash text not null unique check (
      fixture_attestation_hash ~ '^[a-f0-9]{64}$'
    ),
    synthetic_room_name text not null check (
      synthetic_room_name ~
        '^cognitive-test-[a-z0-9][a-z0-9-]{2,63}$'
    ),
    synthetic_room_name_hash text not null check (
      synthetic_room_name_hash ~ '^[a-f0-9]{64}$'
    ),
    room_run_correlation_hash text not null check (
      room_run_correlation_hash ~ '^[a-f0-9]{64}$'
    ),
    issued_at timestamptz not null,
    expires_at timestamptz not null,
    issuance_hash text not null unique check (
      issuance_hash ~ '^[a-f0-9]{64}$'
    ),
    created_at timestamptz not null default transaction_timestamp(),
    unique (
      fixture_id,task_id,project_id,platform,environment,principal,source_commit
    ),
    foreign key (task_id,project_id,platform,environment)
      references public.intelligence_tasks(
        id,project_id,platform,environment
      ),
    foreign key (
      capability_id,task_id,project_id,platform,environment
    )
      references public.cognitive_product_quality_service_capabilities(
        id,task_id,project_id,platform,environment
      ),
    check (
      condition =
        public.product_experience_livekit_failure_fixture_condition(
          fixture_type
        )
    ),
    check (
      synthetic_room_name_hash =
        public.product_experience_livekit_synthetic_room_hash(
          synthetic_room_name
        )
    ),
    check (
      expires_at >= issued_at + interval '30 seconds'
      and expires_at <= issued_at + interval '300 seconds'
    ),
    check (
      issuance_hash =
        public.product_experience_livekit_fixture_issuance_hash(
          fixture_id,task_id,project_id,platform,environment,principal,
          source_commit,capability_id,fixture_type,condition,
          fixture_attestation_hash,synthetic_room_name,
          synthetic_room_name_hash,room_run_correlation_hash,
          issued_at,expires_at
        )
    )
  );

create index
  product_experience_livekit_fixture_issuances_scope_expiry_idx
on public.product_experience_livekit_failure_fixture_issuances(
  task_id,project_id,platform,environment,expires_at
);

create table
  public.product_experience_livekit_failure_fixture_consumptions (
    fixture_id text primary key,
    task_id uuid not null,
    project_id uuid not null,
    platform public.cognitive_platform not null,
    environment public.cognitive_environment not null,
    principal text not null check (
      principal = 'cognitive_livekit_experience_collector'
    ),
    source_commit text not null check (
      source_commit ~ '^[a-f0-9]{40}$'
    ),
    fixture_attestation_hash text not null check (
      fixture_attestation_hash ~ '^[a-f0-9]{64}$'
    ),
    synthetic_room_name text not null check (
      synthetic_room_name ~
        '^cognitive-test-[a-z0-9][a-z0-9-]{2,63}$'
    ),
    synthetic_room_name_hash text not null check (
      synthetic_room_name_hash ~ '^[a-f0-9]{64}$'
    ),
    room_run_correlation_hash text not null check (
      room_run_correlation_hash ~ '^[a-f0-9]{64}$'
    ),
    route_or_surface text not null check (
      length(route_or_surface) between 1 and 160
    ),
    runtime_identity_hash text not null check (
      runtime_identity_hash ~ '^[a-f0-9]{64}$'
    ),
    source_build_hash text not null check (
      source_build_hash ~ '^[a-f0-9]{64}$'
    ),
    evidence_manifest_hash text not null check (
      evidence_manifest_hash ~ '^[a-f0-9]{64}$'
    ),
    collection_idempotency_hash text not null unique check (
      collection_idempotency_hash ~ '^[a-f0-9]{64}$'
    ),
    observation_started_at timestamptz not null,
    observation_finished_at timestamptz not null,
    claimed_at timestamptz not null default transaction_timestamp(),
    consumption_hash text not null unique check (
      consumption_hash ~ '^[a-f0-9]{64}$'
    ),
    foreign key (
      fixture_id,task_id,project_id,platform,environment,principal,source_commit
    )
      references
        public.product_experience_livekit_failure_fixture_issuances(
          fixture_id,task_id,project_id,platform,environment,
          principal,source_commit
        ),
    check (
      observation_finished_at >= observation_started_at
      and observation_finished_at <=
        observation_started_at + interval '2 minutes'
    ),
    check (
      consumption_hash =
        public.product_experience_livekit_fixture_consumption_hash(
          fixture_id,task_id,project_id,platform,environment,principal,
          source_commit,fixture_attestation_hash,synthetic_room_name,
          synthetic_room_name_hash,room_run_correlation_hash,
          route_or_surface,runtime_identity_hash,source_build_hash,
          evidence_manifest_hash,collection_idempotency_hash,
          observation_started_at,observation_finished_at,claimed_at
        )
    )
  );

create table
  public.product_experience_livekit_failure_fixture_receipts (
    fixture_id text primary key,
    sentinel_run_id uuid not null unique,
    task_id uuid not null,
    project_id uuid not null,
    platform public.cognitive_platform not null,
    environment public.cognitive_environment not null,
    principal text not null check (
      principal = 'cognitive_livekit_experience_collector'
    ),
    source_commit text not null check (
      source_commit ~ '^[a-f0-9]{40}$'
    ),
    fixture_attestation_hash text not null check (
      fixture_attestation_hash ~ '^[a-f0-9]{64}$'
    ),
    consumption_hash text not null unique check (
      consumption_hash ~ '^[a-f0-9]{64}$'
    ),
    evidence_manifest_hash text not null check (
      evidence_manifest_hash ~ '^[a-f0-9]{64}$'
    ),
    collection_idempotency_hash text not null unique check (
      collection_idempotency_hash ~ '^[a-f0-9]{64}$'
    ),
    recorded_at timestamptz not null default transaction_timestamp(),
    receipt_hash text not null unique check (
      receipt_hash ~ '^[a-f0-9]{64}$'
    ),
    foreign key (fixture_id)
      references
        public.product_experience_livekit_failure_fixture_consumptions(
          fixture_id
        ),
    foreign key (
      sentinel_run_id,task_id,project_id,platform,environment
    )
      references public.product_experience_sentinel_runs(
        id,task_id,project_id,platform,environment
      ),
    check (
      receipt_hash =
        public.product_experience_livekit_fixture_receipt_hash(
          fixture_id,sentinel_run_id,task_id,project_id,platform,environment,
          principal,source_commit,fixture_attestation_hash,consumption_hash,
          evidence_manifest_hash,collection_idempotency_hash,recorded_at
        )
    )
  );

alter table
  public.product_experience_livekit_failure_fixture_issuances
enable row level security;
alter table
  public.product_experience_livekit_failure_fixture_issuances
force row level security;
alter table
  public.product_experience_livekit_failure_fixture_consumptions
enable row level security;
alter table
  public.product_experience_livekit_failure_fixture_consumptions
force row level security;
alter table
  public.product_experience_livekit_failure_fixture_receipts
enable row level security;
alter table
  public.product_experience_livekit_failure_fixture_receipts
force row level security;

revoke all on table
  public.product_experience_livekit_failure_fixture_issuances,
  public.product_experience_livekit_failure_fixture_consumptions,
  public.product_experience_livekit_failure_fixture_receipts
from
  public,anon,authenticated,service_role,
  cognitive_livekit_experience_collector;

create trigger product_experience_livekit_fixture_issuances_immutable
before update or delete
on public.product_experience_livekit_failure_fixture_issuances
for each row execute function public.reject_cognitive_evidence_mutation();

create trigger product_experience_livekit_fixture_consumptions_immutable
before update or delete
on public.product_experience_livekit_failure_fixture_consumptions
for each row execute function public.reject_cognitive_evidence_mutation();

create trigger product_experience_livekit_fixture_receipts_immutable
before update or delete
on public.product_experience_livekit_failure_fixture_receipts
for each row execute function public.reject_cognitive_evidence_mutation();

create function
  public.product_experience_livekit_fixture_manifest_is_sanitized(
    p_metric_manifest jsonb
  )
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  binding jsonb;
  metrics jsonb;
  metric_key text;
begin
  if (jsonb_typeof(p_metric_manifest) = 'object') is not true
     or pg_column_size(p_metric_manifest) > 65536
     or (
       select count(*)
       from jsonb_object_keys(p_metric_manifest)
     ) <> 6
     or (p_metric_manifest ?& array[
       'evidenceHashes',
       'failureFixtureBinding',
       'metrics',
       'observationKind',
       'sanitizationVersion',
       'schemaVersion'
     ]) is not true
     or p_metric_manifest->>'schemaVersion' <> 'product-sentinel-v1'
     or p_metric_manifest->>'sanitizationVersion' <>
       'bounded-nonpersonal-v1'
     or p_metric_manifest->>'observationKind' <> 'livekit_experience'
     or (
       jsonb_typeof(p_metric_manifest->'failureFixtureBinding') = 'object'
     ) is not true
     or (jsonb_typeof(p_metric_manifest->'metrics') = 'object') is not true
     or (jsonb_typeof(p_metric_manifest->'evidenceHashes') = 'array')
       is not true
     or jsonb_array_length(p_metric_manifest->'evidenceHashes')
       not between 2 and 32
     or exists (
       select 1
       from jsonb_array_elements(
         p_metric_manifest->'evidenceHashes'
       ) evidence(value)
       where jsonb_typeof(evidence.value) <> 'string'
         or evidence.value #>> '{}' !~ '^[a-f0-9]{64}$'
     ) then
    return false;
  end if;

  binding := p_metric_manifest->'failureFixtureBinding';
  metrics := p_metric_manifest->'metrics';

  if (
       select count(*)
       from jsonb_object_keys(binding)
     ) <> 8
     or (binding ?& array[
       'condition',
       'fixtureAttestationHash',
       'fixtureId',
       'fixtureType',
       'principal',
       'roomRunCorrelationHash',
       'sourceCommit',
       'syntheticRoomNameHash'
     ]) is not true
     or (binding->>'fixtureId' ~ '^[a-f0-9]{64}$') is not true
     or (
       binding->>'fixtureAttestationHash' ~ '^[a-f0-9]{64}$'
     ) is not true
     or (binding->>'syntheticRoomNameHash' ~ '^[a-f0-9]{64}$')
       is not true
     or (binding->>'roomRunCorrelationHash' ~ '^[a-f0-9]{64}$')
       is not true
     or (binding->>'sourceCommit' ~ '^[a-f0-9]{40}$') is not true
     or binding->>'principal' <>
       'cognitive_livekit_experience_collector'
     or binding->'condition' is distinct from
       public.product_experience_livekit_failure_fixture_condition(
         binding->>'fixtureType'
       )
     or not exists (
       select 1
       from jsonb_array_elements_text(
         p_metric_manifest->'evidenceHashes'
       ) evidence(value)
       where evidence.value = binding->>'fixtureAttestationHash'
     ) then
    return false;
  end if;

  if (
       select count(*)
       from jsonb_object_keys(metrics)
     ) <> 46
     or (metrics ?& array[
       'backgroundForegroundRecovery',
       'backgrounded',
       'buildRuntimeMatched',
       'cleanupDisconnected',
       'connectingResolved',
       'firstAudioVideoObserved',
       'firstRemoteMediaElapsedMs',
       'foregrounded',
       'headlessObservationFinishedAt',
       'headlessObservationStartedAt',
       'headlessParticipantIdentityHash',
       'headlessParticipantUsed',
       'iceCheckingObserved',
       'iceGatheringObserved',
       'iceState',
       'installedObservationFinishedAt',
       'installedObservationStartedAt',
       'installedParticipantIdentityHash',
       'installedRoomRunCorrelationHash',
       'installedRuntimeIdentityHash',
       'installedSourceBuildHash',
       'installedUiEvidenceHash',
       'installedUiObserved',
       'localMediaSource',
       'localTrackPublished',
       'networkState',
       'participantIdentityDistinct',
       'peerConnectionEstablished',
       'permissionState',
       'providerState',
       'remoteMediaKind',
       'remoteParticipantJoined',
       'remoteTrackSubscribed',
       'roomConnectElapsedMs',
       'roomConnected',
       'roomRunCorrelationHash',
       'scenarioType',
       'stageFailureCategory',
       'tokenClaimsValidated',
       'tokenIssuedElapsedMs',
       'tokenRequestStarted',
       'tokenRequested',
       'tokenResultStatus',
       'tokenReturned',
       'uiStateResolutionElapsedMs',
       'websocketConnected'
     ]) is not true then
    return false;
  end if;

  foreach metric_key in array array[
    'backgroundForegroundRecovery',
    'backgrounded',
    'buildRuntimeMatched',
    'cleanupDisconnected',
    'connectingResolved',
    'firstAudioVideoObserved',
    'foregrounded',
    'headlessParticipantUsed',
    'iceCheckingObserved',
    'iceGatheringObserved',
    'installedUiObserved',
    'localTrackPublished',
    'participantIdentityDistinct',
    'peerConnectionEstablished',
    'remoteParticipantJoined',
    'remoteTrackSubscribed',
    'roomConnected',
    'tokenClaimsValidated',
    'tokenRequestStarted',
    'tokenRequested',
    'tokenReturned',
    'websocketConnected'
  ] loop
    if jsonb_typeof(metrics->metric_key) <> 'boolean' then
      return false;
    end if;
  end loop;

  foreach metric_key in array array[
    'firstRemoteMediaElapsedMs',
    'roomConnectElapsedMs',
    'tokenIssuedElapsedMs',
    'uiStateResolutionElapsedMs'
  ] loop
    if jsonb_typeof(metrics->metric_key) <> 'number'
       or (metrics->>metric_key)::numeric not between 0 and 600000
       or trunc((metrics->>metric_key)::numeric) <>
         (metrics->>metric_key)::numeric then
      return false;
    end if;
  end loop;

  foreach metric_key in array array[
    'headlessParticipantIdentityHash',
    'installedParticipantIdentityHash',
    'installedRoomRunCorrelationHash',
    'installedRuntimeIdentityHash',
    'installedSourceBuildHash',
    'installedUiEvidenceHash',
    'roomRunCorrelationHash'
  ] loop
    if jsonb_typeof(metrics->metric_key) <> 'string'
       or metrics->>metric_key !~ '^[a-f0-9]{64}$' then
      return false;
    end if;
  end loop;

  foreach metric_key in array array[
    'headlessObservationFinishedAt',
    'headlessObservationStartedAt',
    'installedObservationFinishedAt',
    'installedObservationStartedAt'
  ] loop
    if jsonb_typeof(metrics->metric_key) <> 'string'
       or metrics->>metric_key !~
         '^[12][0-9]{3}-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$' then
      return false;
    end if;
  end loop;

  return
    metrics->>'scenarioType' = 'bounded_failure_fixture'
    and metrics->>'stageFailureCategory' =
      binding->'condition'->>'expectedFailureCategory'
    and metrics->>'roomRunCorrelationHash' =
      binding->>'roomRunCorrelationHash'
    and metrics->>'installedRoomRunCorrelationHash' =
      binding->>'roomRunCorrelationHash'
    and metrics->'headlessParticipantUsed' = 'true'::jsonb
    and metrics->'installedUiObserved' = 'true'::jsonb
    and metrics->'participantIdentityDistinct' = 'true'::jsonb
    and metrics->>'headlessParticipantIdentityHash' <>
      metrics->>'installedParticipantIdentityHash'
    and (metrics->>'headlessObservationStartedAt')::timestamptz <=
      (metrics->>'headlessObservationFinishedAt')::timestamptz
    and (metrics->>'installedObservationStartedAt')::timestamptz <=
      (metrics->>'installedObservationFinishedAt')::timestamptz
    and metrics->'tokenRequested' = metrics->'tokenRequestStarted'
    and metrics->'tokenReturned' =
      to_jsonb(metrics->>'tokenResultStatus' = 'success')
    and metrics->'firstAudioVideoObserved' =
      to_jsonb(metrics->>'remoteMediaKind' <> 'none')
    and metrics->>'iceState' in (
      'new','checking','connected','completed','failed',
      'disconnected','closed','unknown'
    )
    and metrics->>'localMediaSource' in (
      'test_tone','silent_audio','color_bars','none'
    )
    and metrics->>'networkState' in (
      'ready','interrupted','unknown'
    )
    and metrics->>'permissionState' in (
      'granted','denied','unknown','not_applicable'
    )
    and metrics->>'providerState' in (
      'healthy','degraded','blocked','unknown'
    )
    and metrics->>'remoteMediaKind' in (
      'audio','video','audio_video','none'
    )
    and metrics->>'tokenResultStatus' in (
      'success','denied','error','timeout','not_attempted'
    )
    and metrics->>'stageFailureCategory' in (
      'permission_failure','build_runtime_mismatch',
      'network_interruption','token_backend_failure',
      'websocket_failure','ice_turn_failure',
      'room_connection_failure','local_publish_failure',
      'remote_participant_missing','remote_subscription_failure',
      'first_media_missing','installed_ui_connecting_stuck',
      'background_foreground_recovery_failed','cleanup_failure',
      'provider_degradation','deadline_exceeded'
    );
exception
  when others then
    return false;
end;
$$;

revoke all on function
  public.product_experience_livekit_fixture_manifest_is_sanitized(
    jsonb
  )
from public,anon,authenticated,service_role;

create or replace function public.product_experience_metric_manifest_is_bounded(
  p_sentinel_key text,
  p_evidence_manifest_hash text,
  p_metric_manifest jsonb
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select
    jsonb_typeof(p_metric_manifest) = 'object'
    and pg_column_size(p_metric_manifest) <= 65536
    and case
      when p_sentinel_key = 'livekit_experience_sentinel'
        and p_metric_manifest->'metrics'->>'scenarioType' =
          'bounded_failure_fixture'
        and jsonb_typeof(
          p_metric_manifest->'failureFixtureBinding'
        ) = 'object'
      then
        public.product_experience_livekit_fixture_manifest_is_sanitized(
          p_metric_manifest
        )
      else
        public.cognitive_json_is_sanitized(p_metric_manifest)
        or (
          public.product_experience_route_timing_no_finding_is_valid(
            p_metric_manifest
          )
          and public.cognitive_json_is_sanitized(
            jsonb_set(
              p_metric_manifest,
              '{metrics}',
              (p_metric_manifest->'metrics')
                - 'appVersion'
                - 'appBuild'
                - 'runtimeVersion'
                - 'channel'
            )
          )
        )
    end
    and p_metric_manifest->>'schemaVersion' = 'product-sentinel-v1'
    and p_metric_manifest->>'sanitizationVersion' =
      'bounded-nonpersonal-v1'
    and jsonb_typeof(p_metric_manifest->'observationKind') = 'string'
    and jsonb_typeof(p_metric_manifest->'metrics') = 'object'
    and (
      select count(*)
      from jsonb_object_keys(p_metric_manifest->'metrics')
    ) between 1 and 64
    and pg_column_size(p_metric_manifest->'metrics') <= 49152
    and jsonb_typeof(p_metric_manifest->'evidenceHashes') = 'array'
    and jsonb_array_length(p_metric_manifest->'evidenceHashes')
      between 1 and 32
    and not exists (
      select 1
      from jsonb_array_elements(p_metric_manifest->'evidenceHashes') item
      where jsonb_typeof(item) <> 'string'
        or trim(both '"' from item::text) !~ '^[a-f0-9]{64}$'
    )
    and exists (
      select 1
      from jsonb_array_elements_text(
        p_metric_manifest->'evidenceHashes'
      ) item(value)
      where item.value = p_evidence_manifest_hash
    )
    and case p_sentinel_key
      when 'livekit_experience_sentinel' then
        p_metric_manifest->>'observationKind' = 'livekit_experience'
      when 'visual_product_experience_sentinel' then
        p_metric_manifest->>'observationKind' in (
          'visual_layout',
          'touch_target'
        )
      when 'installed_journey_sentinel' then
        p_metric_manifest->>'observationKind' in (
          'installed_journey',
          'route_timing',
          'search_accessibility',
          'crash_anr'
        )
      else false
    end;
$$;

revoke all on function
  public.product_experience_metric_manifest_is_bounded(text,text,jsonb)
from public,anon,authenticated,service_role;

alter table public.product_experience_sentinel_runs
  drop constraint product_experience_sentinel_runs_metric_manifest_check;
alter table public.product_experience_sentinel_runs
  add constraint product_experience_sentinel_runs_metric_manifest_check
  check (
    jsonb_typeof(metric_manifest) = 'object'
    and pg_column_size(metric_manifest) <= 65536
    and (
      public.cognitive_json_is_sanitized(metric_manifest)
      or
        public.product_experience_livekit_fixture_manifest_is_sanitized(
          metric_manifest
        )
      or (
        public.product_experience_route_timing_no_finding_is_valid(
          metric_manifest
        )
        and public.cognitive_json_is_sanitized(
          jsonb_set(
            metric_manifest,
            '{metrics}',
            (metric_manifest->'metrics')
              - 'appVersion'
              - 'appBuild'
              - 'runtimeVersion'
              - 'channel'
          )
        )
      )
    )
  );

create or replace function
  public.product_experience_livekit_bounded_failure_fixture_is_valid(
    p_result_status text,
    p_metric_manifest jsonb
  )
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  binding jsonb;
  metrics jsonb;
begin
  if (jsonb_typeof(p_metric_manifest) = 'object') is not true
     or (p_metric_manifest->>'observationKind' = 'livekit_experience')
       is not true
     or (jsonb_typeof(p_metric_manifest->'metrics') = 'object') is not true
     or (
       jsonb_typeof(p_metric_manifest->'failureFixtureBinding') = 'object'
     ) is not true
     or (jsonb_typeof(p_metric_manifest->'evidenceHashes') = 'array')
       is not true
     or (p_result_status = 'failed') is not true then
    return false;
  end if;

  binding := p_metric_manifest->'failureFixtureBinding';
  metrics := p_metric_manifest->'metrics';

  if (
       select array_agg(key order by key)
       from jsonb_object_keys(binding) key
     ) is distinct from array[
       'condition',
       'fixtureAttestationHash',
       'fixtureId',
       'fixtureType',
       'principal',
       'roomRunCorrelationHash',
       'sourceCommit',
       'syntheticRoomNameHash'
     ]::text[]
     or (jsonb_typeof(binding->'condition') = 'object') is not true
     or (binding->>'fixtureId' ~ '^[a-f0-9]{64}$') is not true
     or (
       binding->>'fixtureAttestationHash' ~ '^[a-f0-9]{64}$'
     ) is not true
     or (binding->>'syntheticRoomNameHash' ~ '^[a-f0-9]{64}$')
       is not true
     or (binding->>'roomRunCorrelationHash' ~ '^[a-f0-9]{64}$')
       is not true
     or (binding->>'sourceCommit' ~ '^[a-f0-9]{40}$') is not true
     or (
       binding->>'principal' =
         'cognitive_livekit_experience_collector'
     ) is not true
     or (metrics->>'scenarioType' = 'bounded_failure_fixture') is not true
     or (
       jsonb_typeof(metrics->'stageFailureCategory') = 'string'
     ) is not true
     or public.product_experience_livekit_scenario_is_valid(
       p_result_status,
       metrics
     ) is not true then
    return false;
  end if;

  return exists (
    select 1
    from
      public.product_experience_livekit_failure_fixture_issuances issuance
    join
      public.product_experience_livekit_failure_fixture_consumptions
        consumption
      on consumption.fixture_id = issuance.fixture_id
    where issuance.fixture_id = binding->>'fixtureId'
      and issuance.fixture_attestation_hash =
        binding->>'fixtureAttestationHash'
      and issuance.fixture_type = binding->>'fixtureType'
      and issuance.condition = binding->'condition'
      and issuance.principal = binding->>'principal'
      and issuance.source_commit = binding->>'sourceCommit'
      and issuance.synthetic_room_name_hash =
        binding->>'syntheticRoomNameHash'
      and issuance.room_run_correlation_hash =
        binding->>'roomRunCorrelationHash'
      and issuance.condition->>'expectedFailureCategory' =
        metrics->>'stageFailureCategory'
      and metrics->>'roomRunCorrelationHash' =
        issuance.room_run_correlation_hash
      and consumption.task_id = issuance.task_id
      and consumption.project_id = issuance.project_id
      and consumption.platform = issuance.platform
      and consumption.environment = issuance.environment
      and consumption.principal = issuance.principal
      and consumption.source_commit = issuance.source_commit
      and consumption.fixture_attestation_hash =
        issuance.fixture_attestation_hash
      and consumption.synthetic_room_name = issuance.synthetic_room_name
      and consumption.synthetic_room_name_hash =
        issuance.synthetic_room_name_hash
      and consumption.room_run_correlation_hash =
        issuance.room_run_correlation_hash
      and metrics->>'installedRuntimeIdentityHash' =
        consumption.runtime_identity_hash
      and metrics->>'installedSourceBuildHash' =
        consumption.source_build_hash
      and metrics->>'installedRoomRunCorrelationHash' =
        issuance.room_run_correlation_hash
      and (metrics->>'headlessObservationStartedAt')::timestamptz =
        consumption.observation_started_at
      and (metrics->>'installedObservationFinishedAt')::timestamptz =
        consumption.observation_finished_at
      and (metrics->>'headlessObservationFinishedAt')::timestamptz
        between consumption.observation_started_at
          and consumption.observation_finished_at
      and (metrics->>'installedObservationStartedAt')::timestamptz
        between consumption.observation_started_at
          and consumption.observation_finished_at
      and exists (
        select 1
        from jsonb_array_elements_text(
          p_metric_manifest->'evidenceHashes'
        ) evidence_hash(value)
        where evidence_hash.value = issuance.fixture_attestation_hash
      )
      and exists (
        select 1
        from jsonb_array_elements_text(
          p_metric_manifest->'evidenceHashes'
        ) evidence_hash(value)
        where evidence_hash.value = consumption.evidence_manifest_hash
      )
  );
exception
  when others then
    return false;
end;
$$;

revoke all on function
  public.product_experience_livekit_bounded_failure_fixture_is_valid(
    text,jsonb
  )
from public,anon,authenticated,service_role;

create function
  public.product_experience_livekit_failure_fixture_scope_is_valid(
    p_task_id uuid,
    p_project_id uuid,
    p_platform public.cognitive_platform,
    p_environment public.cognitive_environment,
    p_route_or_surface text,
    p_runtime_identity_hash text,
    p_source_build_hash text,
    p_evidence_manifest_hash text,
    p_collection_idempotency_hash text,
    p_observation_started_at timestamptz,
    p_observation_finished_at timestamptz,
    p_result_status text,
    p_metric_manifest jsonb
  )
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.product_experience_livekit_bounded_failure_fixture_is_valid(
      p_result_status,
      p_metric_manifest
    ) is true
    and exists (
      select 1
      from
        public.product_experience_livekit_failure_fixture_consumptions
          consumption
      where consumption.fixture_id =
          p_metric_manifest->'failureFixtureBinding'->>'fixtureId'
        and consumption.task_id = p_task_id
        and consumption.project_id = p_project_id
        and consumption.platform = p_platform
        and consumption.environment = p_environment
        and consumption.principal =
          p_metric_manifest->'failureFixtureBinding'->>'principal'
        and consumption.source_commit =
          p_metric_manifest->'failureFixtureBinding'->>'sourceCommit'
        and consumption.route_or_surface = p_route_or_surface
        and consumption.runtime_identity_hash = p_runtime_identity_hash
        and consumption.source_build_hash = p_source_build_hash
        and consumption.evidence_manifest_hash = p_evidence_manifest_hash
        and consumption.collection_idempotency_hash =
          p_collection_idempotency_hash
        and consumption.observation_started_at = p_observation_started_at
        and consumption.observation_finished_at = p_observation_finished_at
    );
$$;

revoke all on function
  public.product_experience_livekit_failure_fixture_scope_is_valid(
    uuid,uuid,public.cognitive_platform,public.cognitive_environment,
    text,text,text,text,text,timestamptz,timestamptz,text,jsonb
  )
from public,anon,authenticated,service_role;

create or replace function
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
       'bounded_failure_fixture'
     and public.product_experience_livekit_failure_fixture_scope_is_valid(
       new.task_id,
       new.project_id,
       new.platform,
       new.environment,
       new.route_or_surface,
       new.runtime_identity_hash,
       new.source_build_hash,
       new.evidence_manifest_hash,
       new.collection_idempotency_hash,
       new.observation_started_at,
       new.observation_finished_at,
       new.result_status,
       new.metric_manifest
     ) is not true then
    raise exception 'livekit_fixture_plan_required'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function
  public.product_experience_reject_unbound_livekit_failure_fixture()
from public,anon,authenticated,service_role;

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
    (
      'cognitive_product_quality_evaluator',
      'record_sentinel_evaluator_proof'
    ),
    (
      'cognitive_product_quality_evaluator',
      'read_product_quality_snapshot'
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

create function cognitive_runtime.issue_livekit_failure_fixture(
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text,
  p_source_commit text,
  p_fixture_id text,
  p_fixture_attestation_hash text,
  p_fixture_type text,
  p_condition jsonb,
  p_synthetic_room_name text,
  p_synthetic_room_name_hash text,
  p_room_run_correlation_hash text,
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_request_role text :=
    current_setting('request.jwt.claim.role', true);
  capability_id_value uuid;
  issuance_hash_value text;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_livekit_experience_collector',
    'issue_livekit_failure_fixture'
  );

  if p_platform not in ('android','ios')
     or p_environment <> 'production'
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_fixture_id !~ '^[a-f0-9]{64}$'
     or p_fixture_attestation_hash !~ '^[a-f0-9]{64}$'
     or p_condition is distinct from
       public.product_experience_livekit_failure_fixture_condition(
         p_fixture_type
       )
     or p_synthetic_room_name !~
       '^cognitive-test-[a-z0-9][a-z0-9-]{2,63}$'
     or p_synthetic_room_name_hash is distinct from
       public.product_experience_livekit_synthetic_room_hash(
         p_synthetic_room_name
       )
     or p_room_run_correlation_hash !~ '^[a-f0-9]{64}$'
     or p_issued_at is null
     or p_expires_at is null
     or p_issued_at < transaction_timestamp() - interval '1 minute'
     or p_issued_at > transaction_timestamp() + interval '10 seconds'
     or p_expires_at < p_issued_at + interval '30 seconds'
     or p_expires_at > p_issued_at + interval '300 seconds'
     or p_expires_at <= transaction_timestamp()
     or not public.cognitive_lock_task_writes_allowed(
       p_task_id,
       p_project_id,
       p_platform::public.cognitive_platform,
       p_environment::public.cognitive_environment
     )
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.project_id = p_project_id
         and switch.platform = p_platform::public.cognitive_platform
         and switch.environment =
           p_environment::public.cognitive_environment
         and switch.switch_key =
           'cognitive_livekit_experience_sentinel_enabled'
         and switch.enabled
     ) then
    raise exception 'livekit_failure_fixture_issuance_rejected'
      using errcode = 'P0001';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    capability_id_value :=
      public.cognitive_product_quality_assert_service_capability(
        'cognitive_sentinel_collector',
        'collect_sentinel_run',
        p_task_id,
        p_project_id,
        p_platform::public.cognitive_platform,
        p_environment::public.cognitive_environment,
        'livekit_experience_sentinel',
        p_service_assertion
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

  issuance_hash_value :=
    public.product_experience_livekit_fixture_issuance_hash(
      p_fixture_id,
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'cognitive_livekit_experience_collector',
      p_source_commit,
      capability_id_value,
      p_fixture_type,
      p_condition,
      p_fixture_attestation_hash,
      p_synthetic_room_name,
      p_synthetic_room_name_hash,
      p_room_run_correlation_hash,
      p_issued_at,
      p_expires_at
    );

  begin
    insert into
      public.product_experience_livekit_failure_fixture_issuances (
        fixture_id,task_id,project_id,platform,environment,principal,
        source_commit,capability_id,fixture_type,condition,
        fixture_attestation_hash,synthetic_room_name,
        synthetic_room_name_hash,room_run_correlation_hash,
        issued_at,expires_at,issuance_hash
      )
    values (
      p_fixture_id,
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'cognitive_livekit_experience_collector',
      p_source_commit,
      capability_id_value,
      p_fixture_type,
      p_condition,
      p_fixture_attestation_hash,
      p_synthetic_room_name,
      p_synthetic_room_name_hash,
      p_room_run_correlation_hash,
      p_issued_at,
      p_expires_at,
      issuance_hash_value
    );
  exception
    when unique_violation then
      raise exception 'livekit_failure_fixture_issuance_replay_rejected'
        using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'active', true,
    'fixtureId', p_fixture_id,
    'fixtureAttestationHash', p_fixture_attestation_hash,
    'issuanceHash', issuance_hash_value,
    'expiresAt', p_expires_at,
    'principal', 'cognitive_livekit_experience_collector'
  );
end;
$$;

revoke all on function
  cognitive_runtime.issue_livekit_failure_fixture(
    uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text,
    timestamptz,timestamptz,text
  )
from public,anon,authenticated,service_role;
grant execute on function
  cognitive_runtime.issue_livekit_failure_fixture(
    uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text,
    timestamptz,timestamptz,text
  )
to cognitive_livekit_experience_collector;

create function
  cognitive_runtime.consume_livekit_failure_fixture_and_collect(
    p_task_id uuid,
    p_project_id uuid,
    p_platform text,
    p_environment text,
    p_source_commit text,
    p_fixture_id text,
    p_fixture_attestation_hash text,
    p_synthetic_room_name text,
    p_synthetic_room_name_hash text,
    p_room_run_correlation_hash text,
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
security definer
set search_path = ''
as $$
declare
  prior_request_role text :=
    current_setting('request.jwt.claim.role', true);
  capability_id_value uuid;
  issuance_value
    public.product_experience_livekit_failure_fixture_issuances%rowtype;
  claimed_at_value timestamptz := transaction_timestamp();
  consumption_hash_value text;
  sentinel_result jsonb;
  sentinel_run_id_value uuid;
  recorded_at_value timestamptz;
  receipt_hash_value text;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_livekit_experience_collector',
    'consume_livekit_failure_fixture'
  );

  select * into issuance_value
  from public.product_experience_livekit_failure_fixture_issuances issuance
  where issuance.fixture_id = p_fixture_id
  for update;

  if issuance_value.fixture_id is null
     or issuance_value.task_id <> p_task_id
     or issuance_value.project_id <> p_project_id
     or issuance_value.platform <> p_platform::public.cognitive_platform
     or issuance_value.environment <>
       p_environment::public.cognitive_environment
     or issuance_value.principal <>
       'cognitive_livekit_experience_collector'
     or issuance_value.source_commit <> p_source_commit
     or issuance_value.fixture_attestation_hash <>
       p_fixture_attestation_hash
     or issuance_value.synthetic_room_name <> p_synthetic_room_name
     or issuance_value.synthetic_room_name_hash <>
       p_synthetic_room_name_hash
     or issuance_value.room_run_correlation_hash <>
       p_room_run_correlation_hash
     or p_result_status <> 'failed'
     or p_physical_proof_status <> 'installed_ui_observed'
     or p_observation_started_at < issuance_value.issued_at
     or p_observation_finished_at > issuance_value.expires_at
     or transaction_timestamp() >= issuance_value.expires_at
     or exists (
       select 1
       from
         public.product_experience_livekit_failure_fixture_consumptions
           consumption
       where consumption.fixture_id = issuance_value.fixture_id
     )
     or exists (
       select 1
       from public.product_experience_livekit_failure_fixture_receipts receipt
       where receipt.fixture_id = issuance_value.fixture_id
     )
     or not public.cognitive_lock_task_writes_allowed(
       p_task_id,
       p_project_id,
       p_platform::public.cognitive_platform,
       p_environment::public.cognitive_environment
     )
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.project_id = p_project_id
         and switch.platform = p_platform::public.cognitive_platform
         and switch.environment =
           p_environment::public.cognitive_environment
         and switch.switch_key =
           'cognitive_livekit_experience_sentinel_enabled'
         and switch.enabled
     ) then
    raise exception 'livekit_failure_fixture_consumption_rejected'
      using errcode = 'P0001';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    capability_id_value :=
      public.cognitive_product_quality_assert_service_capability(
        'cognitive_sentinel_collector',
        'collect_sentinel_run',
        p_task_id,
        p_project_id,
        p_platform::public.cognitive_platform,
        p_environment::public.cognitive_environment,
        'livekit_experience_sentinel',
        p_service_assertion
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

  if capability_id_value <> issuance_value.capability_id then
    raise exception 'livekit_failure_fixture_capability_rejected'
      using errcode = '42501';
  end if;

  consumption_hash_value :=
    public.product_experience_livekit_fixture_consumption_hash(
      p_fixture_id,
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'cognitive_livekit_experience_collector',
      p_source_commit,
      p_fixture_attestation_hash,
      p_synthetic_room_name,
      p_synthetic_room_name_hash,
      p_room_run_correlation_hash,
      p_route_or_surface,
      p_runtime_identity_hash,
      p_source_build_hash,
      p_evidence_manifest_hash,
      p_collection_idempotency_hash,
      p_observation_started_at,
      p_observation_finished_at,
      claimed_at_value
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
  values (
    p_fixture_id,
    p_task_id,
    p_project_id,
    p_platform::public.cognitive_platform,
    p_environment::public.cognitive_environment,
    'cognitive_livekit_experience_collector',
    p_source_commit,
    p_fixture_attestation_hash,
    p_synthetic_room_name,
    p_synthetic_room_name_hash,
    p_room_run_correlation_hash,
    p_route_or_surface,
    p_runtime_identity_hash,
    p_source_build_hash,
    p_evidence_manifest_hash,
    p_collection_idempotency_hash,
    p_observation_started_at,
    p_observation_finished_at,
    claimed_at_value,
    consumption_hash_value
  );

  if public.product_experience_livekit_failure_fixture_scope_is_valid(
       p_task_id,
       p_project_id,
       p_platform::public.cognitive_platform,
       p_environment::public.cognitive_environment,
       p_route_or_surface,
       p_runtime_identity_hash,
       p_source_build_hash,
       p_evidence_manifest_hash,
       p_collection_idempotency_hash,
       p_observation_started_at,
       p_observation_finished_at,
       p_result_status,
       p_metric_manifest
     ) is not true then
    raise exception 'livekit_failure_fixture_binding_rejected'
      using errcode = 'P0001';
  end if;

  sentinel_result := cognitive_runtime.collect_livekit_sentinel_run(
    p_task_id,
    p_project_id,
    p_platform,
    p_environment,
    p_route_or_surface,
    p_runtime_identity_hash,
    p_source_build_hash,
    p_evidence_manifest_hash,
    p_metric_manifest,
    p_result_status,
    p_physical_proof_status,
    p_observation_started_at,
    p_observation_finished_at,
    p_evaluation_expires_at,
    p_collection_idempotency_hash,
    p_service_assertion
  );

  begin
    sentinel_run_id_value := (sentinel_result->>'sentinelRunId')::uuid;
  exception
    when others then
      raise exception 'livekit_failure_fixture_sentinel_receipt_rejected'
        using errcode = 'P0001';
  end;

  if sentinel_run_id_value is null then
    raise exception 'livekit_failure_fixture_sentinel_receipt_rejected'
      using errcode = 'P0001';
  end if;

  recorded_at_value := transaction_timestamp();
  receipt_hash_value :=
    public.product_experience_livekit_fixture_receipt_hash(
      p_fixture_id,
      sentinel_run_id_value,
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'cognitive_livekit_experience_collector',
      p_source_commit,
      p_fixture_attestation_hash,
      consumption_hash_value,
      p_evidence_manifest_hash,
      p_collection_idempotency_hash,
      recorded_at_value
    );

  insert into
    public.product_experience_livekit_failure_fixture_receipts (
      fixture_id,sentinel_run_id,task_id,project_id,platform,environment,
      principal,source_commit,fixture_attestation_hash,consumption_hash,
      evidence_manifest_hash,collection_idempotency_hash,recorded_at,
      receipt_hash
    )
  values (
    p_fixture_id,
    sentinel_run_id_value,
    p_task_id,
    p_project_id,
    p_platform::public.cognitive_platform,
    p_environment::public.cognitive_environment,
    'cognitive_livekit_experience_collector',
    p_source_commit,
    p_fixture_attestation_hash,
    consumption_hash_value,
    p_evidence_manifest_hash,
    p_collection_idempotency_hash,
    recorded_at_value,
    receipt_hash_value
  );

  return sentinel_result || jsonb_build_object(
    'fixtureId', p_fixture_id,
    'fixtureAttestationHash', p_fixture_attestation_hash,
    'fixtureConsumptionHash', consumption_hash_value,
    'fixtureReceiptHash', receipt_hash_value,
    'fixtureConsumed', true
  );
end;
$$;

revoke all on function
  cognitive_runtime.consume_livekit_failure_fixture_and_collect(
    uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,
    jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text
  )
from public,anon,authenticated,service_role;
grant execute on function
  cognitive_runtime.consume_livekit_failure_fixture_and_collect(
    uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,
    jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text
  )
to cognitive_livekit_experience_collector;

comment on table
  public.product_experience_livekit_failure_fixture_issuances
is
  'Immutable exact-scope deterministic LiveKit failure-fixture issuances. Only the HMAC ticket hash is retained; the ticket is never stored.';
comment on table
  public.product_experience_livekit_failure_fixture_consumptions
is
  'Immutable single-use claims inserted atomically before one fixture-bound LiveKit sentinel collection in the same transaction.';
comment on table
  public.product_experience_livekit_failure_fixture_receipts
is
  'Immutable completion receipts binding one fixture issuance and consumption to exactly one persisted LiveKit sentinel run.';
comment on function
  public.product_experience_livekit_bounded_failure_fixture_is_valid(
    text,jsonb
  )
is
  'Table-bound validator requiring an exact immutable issuance and single-use consumption; caller labels alone are rejected.';
comment on function
  cognitive_runtime.issue_livekit_failure_fixture(
    uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text,
    timestamptz,timestamptz,text
  )
is
  'LiveKit-principal-only issuer for a 30-300 second exact synthetic-room fixture. Persists no raw HMAC ticket.';
comment on function
  cognitive_runtime.consume_livekit_failure_fixture_and_collect(
    uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,
    jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text
  )
is
  'Atomically validates and consumes one exact fixture, persists its sentinel run through the existing collector, and records an immutable receipt.';
