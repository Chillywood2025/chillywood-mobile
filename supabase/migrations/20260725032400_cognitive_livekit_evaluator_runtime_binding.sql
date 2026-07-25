-- Restore the exact isolated evaluator boundary for deterministic LiveKit
-- bounded-failure no-finding attestations. Keep the complete effective runtime
-- operation inventory and correct the volatility of the table-reading derived
-- category function without changing its signature or behavior.

create or replace function
  public.product_experience_livekit_derived_failure_category(
    p_platform public.cognitive_platform,
    p_result_status text,
    p_metric_manifest jsonb
  )
returns text
language plpgsql
stable
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

comment on function
  public.product_experience_livekit_derived_failure_category(
    public.cognitive_platform,text,jsonb
  )
is
  'Stable deterministic LiveKit category derivation over the table-bound bounded-failure fixture validator.';
comment on function
  cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(
    uuid,text,text,text,text
  )
is
  'Evaluator-only isolated-runtime attestation for one exact failed synthetic LiveKit fixture; callers cannot supply a verdict or relabel its derived category.';
