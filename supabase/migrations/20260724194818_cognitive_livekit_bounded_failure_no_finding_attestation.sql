-- Fail-closed persistence for the synthetic LiveKit bounded-failure canary.
--
-- A bounded failure proves that the sentinel can distinguish a deliberately
-- injected failure. It is not a product defect and must never enter the
-- product-finding lifecycle. The distinct product-quality evaluator records
-- one immutable, independently derived no-finding attestation instead.

create or replace function public.product_experience_livekit_scenario_is_valid(
  p_result_status text,
  p_metrics jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  scenario_type text;
begin
  if (jsonb_typeof(p_metrics) = 'object') is not true
     or (
       p_metrics ?& array[
         'scenarioType',
         'headlessParticipantUsed',
         'backgrounded',
         'foregrounded',
         'backgroundForegroundRecovery'
       ]
     ) is not true
     or (jsonb_typeof(p_metrics->'scenarioType') = 'string') is not true
     or (
       jsonb_typeof(p_metrics->'headlessParticipantUsed') = 'boolean'
     ) is not true
     or (jsonb_typeof(p_metrics->'backgrounded') = 'boolean') is not true
     or (jsonb_typeof(p_metrics->'foregrounded') = 'boolean') is not true
     or (
       jsonb_typeof(p_metrics->'backgroundForegroundRecovery') = 'boolean'
     ) is not true
     or (p_metrics->'headlessParticipantUsed' = 'true'::jsonb) is not true then
    return false;
  end if;

  scenario_type := p_metrics->>'scenarioType';
  if (scenario_type in (
       'success_baseline',
       'bounded_failure_fixture',
       'background_foreground_recovery'
     )) is not true then
    return false;
  end if;

  if scenario_type = 'bounded_failure_fixture' then
    return (
      (p_result_status = 'failed') is true
      and (jsonb_typeof(p_metrics->'stageFailureCategory') = 'string') is true
      and ((p_metrics->>'stageFailureCategory') <> 'none') is true
      and (p_metrics->'backgrounded' = 'false'::jsonb) is true
      and (p_metrics->'foregrounded' = 'false'::jsonb) is true
      and (
        p_metrics->'backgroundForegroundRecovery' = 'false'::jsonb
      ) is true
    );
  end if;

  if scenario_type = 'success_baseline' then
    return (
      (p_metrics->'backgrounded' = 'false'::jsonb) is true
      and (p_metrics->'foregrounded' = 'false'::jsonb) is true
      and (
        p_metrics->'backgroundForegroundRecovery' = 'false'::jsonb
      ) is true
    );
  end if;

  if (p_result_status <> 'passed') is true then
    return true;
  end if;

  return (
    (p_metrics->'backgrounded' = 'true'::jsonb) is true
    and (p_metrics->'foregrounded' = 'true'::jsonb) is true
    and (
      p_metrics->'backgroundForegroundRecovery' = 'true'::jsonb
    ) is true
  );
exception
  when others then
    return false;
end;
$$;

revoke all on function
  public.product_experience_livekit_scenario_is_valid(text,jsonb)
  from public,anon,authenticated,service_role;

create or replace function
  public.product_experience_detailed_metric_manifest_is_valid(
    p_sentinel_key text,
    p_platform public.cognitive_platform,
    p_result_status text,
    p_metric_manifest jsonb
  )
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_sentinel_key = 'livekit_experience_sentinel'
     and (
       (jsonb_typeof(p_metric_manifest) = 'object') is not true
       or (jsonb_typeof(p_metric_manifest->'metrics') = 'object') is not true
       or public.product_experience_livekit_scenario_is_valid(
         p_result_status,
         p_metric_manifest->'metrics'
       ) is not true
     ) then
    return false;
  end if;

  if p_sentinel_key = 'visual_product_experience_sentinel' then
    if (jsonb_typeof(p_metric_manifest) = 'object') is not true
       or (
         jsonb_typeof(p_metric_manifest->'metrics') = 'object'
       ) is not true then
      return false;
    end if;
    case p_metric_manifest->>'observationKind'
      when 'visual_layout' then
        return public.product_experience_option_c_visual_layout_is_valid(
          p_platform,
          p_result_status,
          p_metric_manifest->'metrics'
        ) is true;
      when 'touch_target' then
        return public.product_experience_option_c_touch_target_is_valid(
          p_platform,
          p_result_status,
          p_metric_manifest->'metrics'
        ) is true;
      else
        return false;
    end case;
  end if;

  return public.product_experience_metric_manifest_is_valid_pre_option_c(
    p_sentinel_key,
    p_platform,
    p_result_status,
    p_metric_manifest
  ) is true;
exception
  when others then
    return false;
end;
$$;

revoke all on function
  public.product_experience_detailed_metric_manifest_is_valid(
    text,public.cognitive_platform,text,jsonb
  )
  from public,anon,authenticated,service_role;

create function
  public.product_experience_livekit_bounded_failure_fixture_is_valid(
    p_result_status text,
    p_metric_manifest jsonb
  )
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  metrics jsonb;
begin
  if (jsonb_typeof(p_metric_manifest) = 'object') is not true
     or ((p_metric_manifest->>'observationKind') = 'livekit_experience')
       is not true
     or (jsonb_typeof(p_metric_manifest->'metrics') = 'object') is not true then
    return false;
  end if;

  metrics := p_metric_manifest->'metrics';

  if (jsonb_typeof(metrics->'scenarioType') = 'string') is not true
     or ((metrics->>'scenarioType') = 'bounded_failure_fixture') is not true
     or (p_result_status = 'failed') is not true
     or public.product_experience_livekit_scenario_is_valid(
       p_result_status,
       metrics
     ) is not true then
    return false;
  end if;

  return true;
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
  public.product_experience_livekit_derived_failure_category(
    p_platform public.cognitive_platform,
    p_result_status text,
    p_metric_manifest jsonb
  )
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  metrics jsonb;
begin
  if public.product_experience_livekit_bounded_failure_fixture_is_valid(
       p_result_status,
       p_metric_manifest
     ) is not true
     or public.product_experience_detailed_metric_manifest_is_valid(
       'livekit_experience_sentinel',
       p_platform,
       p_result_status,
       p_metric_manifest
     ) is not true then
    return null;
  end if;

  metrics := p_metric_manifest->'metrics';

  if ((metrics->>'permissionState') = 'denied') is true then
    return 'permission_failure';
  elsif (metrics->'buildRuntimeMatched' = 'true'::jsonb) is not true then
    return 'build_runtime_mismatch';
  elsif ((metrics->>'networkState') = 'interrupted') is true then
    return 'network_interruption';
  elsif (metrics->'tokenReturned' = 'true'::jsonb) is not true then
    return 'token_backend_failure';
  elsif (metrics->'websocketConnected' = 'true'::jsonb) is not true then
    return 'websocket_failure';
  elsif ((metrics->>'iceState') in (
    'failed','disconnected','closed'
  )) is true then
    return 'ice_turn_failure';
  elsif (metrics->'roomConnected' = 'true'::jsonb) is not true then
    if (metrics->'iceCheckingObserved' = 'true'::jsonb) is true then
      return 'ice_turn_failure';
    end if;
    return 'room_connection_failure';
  elsif (metrics->'localTrackPublished' = 'true'::jsonb) is not true then
    return 'local_publish_failure';
  elsif (metrics->'remoteParticipantJoined' = 'true'::jsonb) is not true then
    return 'remote_participant_missing';
  elsif (metrics->'remoteTrackSubscribed' = 'true'::jsonb) is not true then
    return 'remote_subscription_failure';
  elsif (metrics->'firstAudioVideoObserved' = 'true'::jsonb) is not true then
    return 'first_media_missing';
  elsif (metrics->'installedUiObserved' = 'true'::jsonb) is true
        and (metrics->'connectingResolved' = 'true'::jsonb) is not true then
    return 'installed_ui_connecting_stuck';
  elsif (metrics->'cleanupDisconnected' = 'true'::jsonb) is not true then
    return 'cleanup_failure';
  elsif ((metrics->>'providerState') in ('blocked','degraded')) is true then
    return 'provider_degradation';
  elsif (metrics->>'tokenIssuedElapsedMs')::numeric > 3000
        or (metrics->>'roomConnectElapsedMs')::numeric > 12000
        or (metrics->>'uiStateResolutionElapsedMs')::numeric > 15000
        or (metrics->>'firstRemoteMediaElapsedMs')::numeric > 20000 then
    return 'deadline_exceeded';
  end if;

  return 'none';
exception
  when others then
    return null;
end;
$$;

revoke all on function
  public.product_experience_livekit_derived_failure_category(
    public.cognitive_platform,text,jsonb
  )
  from public,anon,authenticated,service_role;

create function
  public.product_experience_livekit_no_finding_attestation_hash(
    p_sentinel_run_id uuid,
    p_task_id uuid,
    p_project_id uuid,
    p_platform public.cognitive_platform,
    p_environment public.cognitive_environment,
    p_evidence_manifest_hash text,
    p_source_build_hash text,
    p_derived_failure_category text,
    p_evaluator_output_hash text
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
          'livekit-bounded-failure-no-finding-attestation-v1',
          p_sentinel_run_id::text,
          p_task_id::text,
          p_project_id::text,
          p_platform::text,
          p_environment::text,
          'bounded_failure_fixture',
          p_evidence_manifest_hash,
          p_source_build_hash,
          p_derived_failure_category,
          p_evaluator_output_hash
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function
  public.product_experience_livekit_no_finding_attestation_hash(
    uuid,uuid,uuid,public.cognitive_platform,
    public.cognitive_environment,text,text,text,text
  )
  from public,anon,authenticated,service_role;

create table
  public.product_experience_livekit_no_finding_attestations (
    id uuid primary key default gen_random_uuid(),
    sentinel_run_id uuid not null unique,
    task_id uuid not null,
    project_id uuid not null,
    platform public.cognitive_platform not null,
    environment public.cognitive_environment not null,
    scenario_type text not null check (
      scenario_type = 'bounded_failure_fixture'
    ),
    derived_failure_category text not null check (
      derived_failure_category in (
        'permission_failure',
        'build_runtime_mismatch',
        'network_interruption',
        'token_backend_failure',
        'websocket_failure',
        'ice_turn_failure',
        'room_connection_failure',
        'local_publish_failure',
        'remote_participant_missing',
        'remote_subscription_failure',
        'first_media_missing',
        'installed_ui_connecting_stuck',
        'cleanup_failure',
        'provider_degradation',
        'deadline_exceeded'
      )
    ),
    evidence_manifest_hash text not null check (
      evidence_manifest_hash ~ '^[a-f0-9]{64}$'
    ),
    source_build_hash text not null check (
      source_build_hash ~ '^[a-f0-9]{64}$'
    ),
    evaluator_output_hash text not null check (
      evaluator_output_hash ~ '^[a-f0-9]{64}$'
    ),
    attestation_hash text not null unique check (
      attestation_hash ~ '^[a-f0-9]{64}$'
    ),
    evaluator_identity text not null check (
      evaluator_identity = 'cognitive_product_quality_evaluator'
    ),
    recorded_at timestamptz not null default transaction_timestamp(),
    unique (id, task_id, project_id, platform, environment),
    foreign key (
      sentinel_run_id, task_id, project_id, platform, environment
    )
      references public.product_experience_sentinel_runs(
        id, task_id, project_id, platform, environment
      ),
    check (
      attestation_hash =
        public.product_experience_livekit_no_finding_attestation_hash(
          sentinel_run_id,
          task_id,
          project_id,
          platform,
          environment,
          evidence_manifest_hash,
          source_build_hash,
          derived_failure_category,
          evaluator_output_hash
        )
    )
  );

alter table
  public.product_experience_livekit_no_finding_attestations
  enable row level security;
alter table
  public.product_experience_livekit_no_finding_attestations
  force row level security;
revoke all on table
  public.product_experience_livekit_no_finding_attestations
  from public,anon,authenticated,service_role;

create trigger
  product_experience_livekit_no_finding_attestations_immutable
before update or delete
on public.product_experience_livekit_no_finding_attestations
for each row execute function public.reject_cognitive_evidence_mutation();

create function
  public.product_quality_reject_bounded_failure_fixture_finding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_value public.product_experience_sentinel_runs%rowtype;
begin
  select * into run_value
  from public.product_experience_sentinel_runs
  where id = new.sentinel_run_id
  for share;

  if run_value.id is not null
     and public.product_experience_livekit_bounded_failure_fixture_is_valid(
       run_value.result_status,
       run_value.metric_manifest
     ) is true then
    raise exception
      'product_quality_bounded_failure_fixture_finding_rejected'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function
  public.product_quality_reject_bounded_failure_fixture_finding()
  from public,anon,authenticated,service_role;

create trigger
  pq_bounded_fixture_finding_insert_guard
before insert on public.product_quality_findings
for each row
execute function
  public.product_quality_reject_bounded_failure_fixture_finding();

create trigger
  pq_bounded_fixture_finding_recurrence_guard
before update of sentinel_run_id on public.product_quality_findings
for each row
execute function
  public.product_quality_reject_bounded_failure_fixture_finding();

create trigger
  pq_bounded_fixture_event_guard
before insert on public.product_quality_finding_events
for each row
execute function
  public.product_quality_reject_bounded_failure_fixture_finding();

create trigger
  pq_bounded_fixture_proof_guard
before insert on public.product_experience_sentinel_evaluator_proofs
for each row
execute function
  public.product_quality_reject_bounded_failure_fixture_finding();

do $bounded_failure_fixture_existing_finding_guard$
begin
  if exists (
    select 1
    from public.product_quality_findings finding
    join public.product_experience_sentinel_runs run
      on run.id = finding.sentinel_run_id
    where public.product_experience_livekit_bounded_failure_fixture_is_valid(
      run.result_status,
      run.metric_manifest
    ) is true
  ) or exists (
    select 1
    from public.product_quality_finding_events event
    join public.product_experience_sentinel_runs run
      on run.id = event.sentinel_run_id
    where public.product_experience_livekit_bounded_failure_fixture_is_valid(
      run.result_status,
      run.metric_manifest
    ) is true
  ) then
    raise exception
      'existing_bounded_failure_fixture_product_finding_rejected'
      using errcode = 'P0001';
  end if;
end;
$bounded_failure_fixture_existing_finding_guard$;

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
    ('cognitive_product_quality_evaluator', 'compute_resolution_hash'),
    ('cognitive_product_quality_evaluator', 'evaluate_product_baseline'),
    ('cognitive_product_quality_evaluator', 'record_sentinel_evaluator_proof'),
    ('cognitive_product_quality_evaluator', 'read_product_quality_snapshot'),
    (
      'cognitive_product_quality_evaluator',
      'attest_livekit_bounded_failure_no_finding'
    ),
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
  );
$$;

revoke all on function
  cognitive_runtime.runtime_operation_allowed(text,text)
  from public,anon,authenticated,service_role;

create function
  cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(
    p_sentinel_run_id uuid,
    p_independently_derived_failure_category text,
    p_evaluator_output_hash text,
    p_attestation_hash text,
    p_evaluator_assertion text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_request_role text :=
    current_setting('request.jwt.claim.role', true);
  run_value public.product_experience_sentinel_runs%rowtype;
  derived_failure_category_value text;
  expected_attestation_hash text;
  attestation_value
    public.product_experience_livekit_no_finding_attestations%rowtype;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_product_quality_evaluator',
    'attest_livekit_bounded_failure_no_finding'
  );

  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    perform public.governance_assert_two_party_service_principal(
      'cognitive_product_quality_evaluator',
      p_evaluator_assertion,
      'independent_evaluation'
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

  select * into run_value
  from public.product_experience_sentinel_runs
  where id = p_sentinel_run_id
  for update;

  derived_failure_category_value :=
    public.product_experience_livekit_derived_failure_category(
      run_value.platform,
      run_value.result_status,
      run_value.metric_manifest
    );

  if run_value.id is null
     or run_value.sentinel_key <> 'livekit_experience_sentinel'
     or run_value.collector_capability_id is null
     or run_value.erased_at is not null
     or run_value.evaluation_expires_at <= transaction_timestamp()
     or public.product_experience_livekit_bounded_failure_fixture_is_valid(
       run_value.result_status,
       run_value.metric_manifest
     ) is not true
     or derived_failure_category_value is null
     or derived_failure_category_value = 'none'
     or (
       jsonb_typeof(
         run_value.metric_manifest->'metrics'->'stageFailureCategory'
       ) = 'string'
     ) is not true
     or (
       (
         run_value.metric_manifest->'metrics'->>'stageFailureCategory'
       ) = derived_failure_category_value
     ) is not true
     or (
       p_independently_derived_failure_category =
         derived_failure_category_value
     ) is not true
     or (p_evaluator_output_hash ~ '^[a-f0-9]{64}$') is not true
     or (p_attestation_hash ~ '^[a-f0-9]{64}$') is not true
     or exists (
       select 1
       from public.product_quality_findings finding
       where finding.sentinel_run_id = run_value.id
     )
     or exists (
       select 1
       from public.product_quality_finding_events event
       where event.sentinel_run_id = run_value.id
     )
     or exists (
       select 1
       from public.product_experience_sentinel_evaluator_proofs proof
       where proof.sentinel_run_id = run_value.id
     ) then
    raise exception
      'livekit_bounded_failure_no_finding_attestation_rejected'
      using errcode = 'P0001';
  end if;

  expected_attestation_hash :=
    public.product_experience_livekit_no_finding_attestation_hash(
      run_value.id,
      run_value.task_id,
      run_value.project_id,
      run_value.platform,
      run_value.environment,
      run_value.evidence_manifest_hash,
      run_value.source_build_hash,
      derived_failure_category_value,
      p_evaluator_output_hash
    );

  if (p_attestation_hash = expected_attestation_hash) is not true then
    raise exception
      'livekit_bounded_failure_no_finding_attestation_rejected'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.product_experience_livekit_no_finding_attestations attestation
    where attestation.sentinel_run_id = run_value.id
  ) then
    raise exception
      'livekit_bounded_failure_no_finding_attestation_replay_rejected'
      using errcode = 'P0001';
  end if;

  insert into
    public.product_experience_livekit_no_finding_attestations (
      sentinel_run_id,
      task_id,
      project_id,
      platform,
      environment,
      scenario_type,
      derived_failure_category,
      evidence_manifest_hash,
      source_build_hash,
      evaluator_output_hash,
      attestation_hash,
      evaluator_identity
    )
  values (
    run_value.id,
    run_value.task_id,
    run_value.project_id,
    run_value.platform,
    run_value.environment,
    'bounded_failure_fixture',
    derived_failure_category_value,
    run_value.evidence_manifest_hash,
    run_value.source_build_hash,
    p_evaluator_output_hash,
    p_attestation_hash,
    'cognitive_product_quality_evaluator'
  )
  returning * into attestation_value;

  return jsonb_build_object(
    'attestationId', attestation_value.id,
    'sentinelRunId', run_value.id,
    'scenarioType', 'bounded_failure_fixture',
    'derivedFailureCategory', derived_failure_category_value,
    'attestationHash', attestation_value.attestation_hash,
    'recordedAt', attestation_value.recorded_at,
    'findingCreated', false,
    'findingRecurrence', false,
    'resolutionRequired', false
  );
end;
$$;

revoke all on function
  cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(
    uuid,text,text,text,text
  )
  from public,anon,authenticated,service_role;
grant execute on function
  cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(
    uuid,text,text,text,text
  )
  to cognitive_product_quality_evaluator;

comment on table
  public.product_experience_livekit_no_finding_attestations is
  'Immutable, independently derived no-finding evidence for failed synthetic LiveKit bounded-failure fixtures; never a product finding or resolution.';
comment on function
  cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(
    uuid,text,text,text,text
  ) is
  'Evaluator-only isolated-runtime wrapper that attests one valid failed bounded fixture without creating, recurring, or resolving a product finding.';
