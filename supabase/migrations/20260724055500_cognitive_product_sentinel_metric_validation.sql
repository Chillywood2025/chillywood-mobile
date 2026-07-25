-- Forward-only validation for the capability-bound product-sentinel collector.
--
-- The protected collector stores a common envelope around several sentinel
-- metric families.  The common envelope is not sufficient on its own: every
-- family must also satisfy its reviewed, platform-correct metric contract.

create function public.product_experience_detailed_metric_manifest_is_valid(
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
declare
  observation_kind text;
  metrics jsonb;
  numeric_value numeric;
begin
  if jsonb_typeof(p_metric_manifest) <> 'object'
     or jsonb_typeof(p_metric_manifest->'metrics') <> 'object' then
    return false;
  end if;

  observation_kind := p_metric_manifest->>'observationKind';
  metrics := p_metric_manifest->'metrics';

  if p_sentinel_key = 'livekit_experience_sentinel' then
    if observation_kind <> 'livekit_experience'
       or not metrics ?& array[
         'tokenRequestStarted','tokenRequested','tokenReturned',
         'tokenResultStatus','websocketConnected','iceGatheringObserved',
         'iceCheckingObserved','iceState','peerConnectionEstablished',
         'roomConnected','localTrackPublished','remoteParticipantJoined',
         'remoteTrackSubscribed','firstAudioVideoObserved',
         'connectingResolved','backgrounded','foregrounded',
         'backgroundForegroundRecovery','cleanupDisconnected',
         'buildRuntimeMatched','installedUiObserved',
         'installedUiEvidenceHash','localMediaSource','networkState',
         'permissionState','providerState','remoteMediaKind',
         'stageFailureCategory','headlessParticipantUsed',
         'tokenIssuedElapsedMs','roomConnectElapsedMs',
         'uiStateResolutionElapsedMs','firstRemoteMediaElapsedMs'
       ] then
      return false;
    end if;

    foreach observation_kind in array array[
      'tokenRequestStarted','tokenRequested','tokenReturned',
      'websocketConnected','iceGatheringObserved','iceCheckingObserved',
      'peerConnectionEstablished','roomConnected','localTrackPublished',
      'remoteParticipantJoined','remoteTrackSubscribed',
      'firstAudioVideoObserved','connectingResolved','backgrounded',
      'foregrounded','backgroundForegroundRecovery','cleanupDisconnected',
      'buildRuntimeMatched','installedUiObserved','headlessParticipantUsed'
    ] loop
      if jsonb_typeof(metrics->observation_kind) <> 'boolean' then
        return false;
      end if;
    end loop;

    foreach observation_kind in array array[
      'tokenIssuedElapsedMs','roomConnectElapsedMs',
      'uiStateResolutionElapsedMs','firstRemoteMediaElapsedMs'
    ] loop
      if jsonb_typeof(metrics->observation_kind) <> 'number' then
        return false;
      end if;
      numeric_value := (metrics->>observation_kind)::numeric;
      if numeric_value not between 0 and 600000 then
        return false;
      end if;
    end loop;

    if metrics->>'iceState' not in (
         'new','checking','connected','completed','failed',
         'disconnected','closed','unknown'
       )
       or metrics->>'localMediaSource' not in (
         'test_tone','silent_audio','color_bars','none'
       )
       or metrics->>'networkState' not in (
         'ready','interrupted','unknown'
       )
       or metrics->>'permissionState' not in (
         'granted','denied','unknown','not_applicable'
       )
       or metrics->>'providerState' not in (
         'healthy','degraded','blocked','unknown'
       )
       or metrics->>'remoteMediaKind' not in (
         'audio','video','audio_video','none'
       )
       or metrics->>'tokenResultStatus' not in (
         'success','denied','error','timeout','not_attempted'
       )
       or metrics->>'stageFailureCategory' not in (
         'none','permission_failure','build_runtime_mismatch',
         'network_interruption','token_backend_failure',
         'websocket_failure','ice_turn_failure',
         'room_connection_failure','local_publish_failure',
         'remote_participant_missing','remote_subscription_failure',
         'first_media_missing','installed_ui_connecting_stuck',
         'background_foreground_recovery_failed','cleanup_failure',
         'provider_degradation','deadline_exceeded'
       )
       or (
         metrics->'installedUiEvidenceHash' <> 'null'::jsonb
         and (
           jsonb_typeof(metrics->'installedUiEvidenceHash') <> 'string'
           or metrics->>'installedUiEvidenceHash' !~ '^[a-f0-9]{64}$'
         )
       )
       or (metrics->'installedUiObserved')::boolean <>
          (metrics->'installedUiEvidenceHash' <> 'null'::jsonb)
       or (metrics->'firstAudioVideoObserved')::boolean <>
          (metrics->>'remoteMediaKind' <> 'none')
       or (metrics->'tokenReturned')::boolean <>
          (metrics->>'tokenResultStatus' = 'success')
       or (metrics->'tokenRequested')::boolean <>
          (metrics->'tokenRequestStarted')::boolean then
      return false;
    end if;

    if p_result_status = 'passed' and (
         metrics->>'stageFailureCategory' <> 'none'
         or metrics->'tokenReturned' <> 'true'::jsonb
         or metrics->'websocketConnected' <> 'true'::jsonb
         or metrics->>'iceState' not in ('connected','completed')
         or metrics->'peerConnectionEstablished' <> 'true'::jsonb
         or metrics->'roomConnected' <> 'true'::jsonb
         or metrics->'localTrackPublished' <> 'true'::jsonb
         or metrics->'remoteParticipantJoined' <> 'true'::jsonb
         or metrics->'remoteTrackSubscribed' <> 'true'::jsonb
         or metrics->'firstAudioVideoObserved' <> 'true'::jsonb
         or metrics->'connectingResolved' <> 'true'::jsonb
         or metrics->'cleanupDisconnected' <> 'true'::jsonb
         or (metrics->>'tokenIssuedElapsedMs')::numeric > 3000
         or (metrics->>'roomConnectElapsedMs')::numeric > 12000
         or (metrics->>'uiStateResolutionElapsedMs')::numeric > 15000
         or (metrics->>'firstRemoteMediaElapsedMs')::numeric > 20000
       ) then
      return false;
    end if;
    return true;
  end if;

  if p_sentinel_key = 'visual_product_experience_sentinel' then
    if observation_kind = 'visual_layout' then
      if not metrics ?& array[
           'cardViewportWidthRatio','cardViewportHeightRatio',
           'cardsAboveFold','densityScore','aspectRatioClass',
           'titleLineCount','minimumTouchTargetPt','baselineState',
           'baselineComparisonHash'
         ]
         or jsonb_typeof(metrics->'cardViewportWidthRatio') <> 'number'
         or (metrics->>'cardViewportWidthRatio')::numeric not between 0 and 2
         or jsonb_typeof(metrics->'cardViewportHeightRatio') <> 'number'
         or (metrics->>'cardViewportHeightRatio')::numeric not between 0 and 2
         or jsonb_typeof(metrics->'cardsAboveFold') <> 'number'
         or (metrics->>'cardsAboveFold')::numeric not between 0 and 100
         or jsonb_typeof(metrics->'densityScore') <> 'number'
         or (metrics->>'densityScore')::numeric not between 0 and 1
         or jsonb_typeof(metrics->'titleLineCount') <> 'number'
         or (metrics->>'titleLineCount')::numeric not between 0 and 20
         or jsonb_typeof(metrics->'minimumTouchTargetPt') <> 'number'
         or (metrics->>'minimumTouchTargetPt')::numeric not between 0 and 256
         or metrics->>'aspectRatioClass' not in (
           '16:9','4:5','1:1','mixed','unknown'
         )
         or metrics->>'baselineState' not in (
           'needs_product_baseline_review','approved_baseline'
         )
         or metrics->>'baselineComparisonHash' !~ '^[a-f0-9]{64}$'
         or (
           p_result_status = 'passed'
           and metrics->>'baselineState' <> 'approved_baseline'
         ) then
        return false;
      end if;
      return true;
    elsif observation_kind = 'touch_target' then
      if not metrics ?& array[
           'thresholdDp','minimumWidthDp','minimumHeightDp',
           'isActuallyInteractive','clickableAncestorPresent',
           'screenDensityDpi'
         ]
         or p_platform <> 'android'
         or jsonb_typeof(metrics->'thresholdDp') <> 'number'
         or (metrics->>'thresholdDp')::numeric <> 48
         or jsonb_typeof(metrics->'minimumWidthDp') <> 'number'
         or (metrics->>'minimumWidthDp')::numeric not between 0 and 1000
         or jsonb_typeof(metrics->'minimumHeightDp') <> 'number'
         or (metrics->>'minimumHeightDp')::numeric not between 0 and 1000
         or jsonb_typeof(metrics->'screenDensityDpi') <> 'number'
         or (metrics->>'screenDensityDpi')::numeric not between 72 and 1000
         or jsonb_typeof(metrics->'isActuallyInteractive') <> 'boolean'
         or jsonb_typeof(metrics->'clickableAncestorPresent') <> 'boolean'
         or (
           p_result_status = 'failed'
           and (
             metrics->'isActuallyInteractive' <> 'true'::jsonb
             or metrics->'clickableAncestorPresent' <> 'false'::jsonb
             or (
               (metrics->>'minimumWidthDp')::numeric >= 48
               and (metrics->>'minimumHeightDp')::numeric >= 48
             )
           )
         ) then
        return false;
      end if;
      return true;
    end if;
    return false;
  end if;

  if p_sentinel_key <> 'installed_journey_sentinel' then
    return false;
  end if;

  if observation_kind = 'installed_journey' then
    if not metrics ?& array[
         'journeyStepCount','unresolvedStateCount','expectedState',
         'observedState','maxDurationMs','elapsedDurationMs','resultState',
         'screenshotEvidenceHash','sourceRuntimeHash'
       ]
       or jsonb_typeof(metrics->'journeyStepCount') <> 'number'
       or (metrics->>'journeyStepCount')::integer not between 1 and 256
       or jsonb_typeof(metrics->'unresolvedStateCount') <> 'number'
       or (metrics->>'unresolvedStateCount')::integer not between 0 and 256
       or (metrics->>'unresolvedStateCount')::integer >
          (metrics->>'journeyStepCount')::integer
       or metrics->>'expectedState' not in (
         'signed_out','signed_in','session_restored','home_feed_visible',
         'explore_visible','search_visible','library_visible',
         'profile_visible','settings_visible','content_player_visible',
         'public_profile_visible','chat_visible','live_surface_visible',
         'watch_party_visible','loading','empty','error','offline',
         'permission_denied','blank','crashed','no_state_change',
         'route_unavailable','unknown_blocked'
       )
       or metrics->>'observedState' not in (
         'signed_out','signed_in','session_restored','home_feed_visible',
         'explore_visible','search_visible','library_visible',
         'profile_visible','settings_visible','content_player_visible',
         'public_profile_visible','chat_visible','live_surface_visible',
         'watch_party_visible','loading','empty','error','offline',
         'permission_denied','blank','crashed','no_state_change',
         'route_unavailable','unknown_blocked'
       )
       or jsonb_typeof(metrics->'maxDurationMs') <> 'number'
       or (metrics->>'maxDurationMs')::integer not between 1 and 10000
       or jsonb_typeof(metrics->'elapsedDurationMs') <> 'number'
       or (metrics->>'elapsedDurationMs')::integer not between 0 and 600000
       or metrics->>'resultState' not in (
         'success','loading','error','blocked','offline',
         'permission_denied','blank','crashed'
       )
       or metrics->>'screenshotEvidenceHash' !~ '^[a-f0-9]{64}$'
       or metrics->>'sourceRuntimeHash' !~ '^[a-f0-9]{64}$'
       or (
         p_result_status = 'passed'
         and (
           metrics->>'resultState' <> 'success'
           or (metrics->>'unresolvedStateCount')::integer <> 0
           or (metrics->>'elapsedDurationMs')::integer >
              (metrics->>'maxDurationMs')::integer
         )
       ) then
      return false;
    end if;
    return true;
  elsif observation_kind = 'route_timing' then
    if not metrics ?& array[
         'elapsedDurationMs','networkState','timeoutObserved'
       ]
       or jsonb_typeof(metrics->'elapsedDurationMs') <> 'number'
       or (metrics->>'elapsedDurationMs')::numeric not between 0 and 600000
       or metrics->>'networkState' not in (
         'ready','offline','degraded','unknown','provider_blocked'
       )
       or jsonb_typeof(metrics->'timeoutObserved') <> 'boolean'
       or (
         p_result_status = 'passed'
         and metrics->'timeoutObserved' <> 'false'::jsonb
       )
       or (
         p_result_status = 'failed'
         and metrics->'timeoutObserved' <> 'true'::jsonb
       ) then
      return false;
    end if;
    return true;
  elsif observation_kind = 'search_accessibility' then
    if not metrics ?& array[
         'inputPresent','inputFocusable','inputClickable',
         'accessibilityLabelPresent','queryAccepted','clearSucceeded',
         'keyboardDismissed'
       ] then
      return false;
    end if;
    foreach observation_kind in array array[
      'inputPresent','inputFocusable','inputClickable',
      'accessibilityLabelPresent','queryAccepted','clearSucceeded',
      'keyboardDismissed'
    ] loop
      if jsonb_typeof(metrics->observation_kind) <> 'boolean' then
        return false;
      end if;
    end loop;
    if p_result_status = 'passed' and (
         metrics->'inputPresent' <> 'true'::jsonb
         or metrics->'inputFocusable' <> 'true'::jsonb
         or metrics->'inputClickable' <> 'true'::jsonb
         or metrics->'accessibilityLabelPresent' <> 'true'::jsonb
         or metrics->'queryAccepted' <> 'true'::jsonb
         or metrics->'clearSucceeded' <> 'true'::jsonb
         or metrics->'keyboardDismissed' <> 'true'::jsonb
       ) then
      return false;
    end if;
    return true;
  elsif observation_kind = 'crash_anr' then
    if not metrics ?& array['fatalExceptionCount','anrCount']
       or jsonb_typeof(metrics->'fatalExceptionCount') <> 'number'
       or (metrics->>'fatalExceptionCount')::integer not between 0 and 1000
       or jsonb_typeof(metrics->'anrCount') <> 'number'
       or (metrics->>'anrCount')::integer not between 0 and 1000
       or (
         p_result_status = 'passed'
         and (
           (metrics->>'fatalExceptionCount')::integer <> 0
           or (metrics->>'anrCount')::integer <> 0
         )
       )
       or (
         p_result_status = 'failed'
         and (
           (metrics->>'fatalExceptionCount')::integer
           + (metrics->>'anrCount')::integer < 1
         )
       ) then
      return false;
    end if;
    return true;
  end if;

  return false;
exception
  when others then
    return false;
end;
$$;
revoke all on function public.product_experience_detailed_metric_manifest_is_valid(
  text,public.cognitive_platform,text,jsonb
) from public,anon,authenticated,service_role;

create or replace function public.product_experience_require_collector_capability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.collector_capability_id is null
     or not public.cognitive_lock_task_writes_allowed(
       new.task_id, new.project_id, new.platform, new.environment
     )
     or not public.product_experience_detailed_metric_manifest_is_valid(
       new.sentinel_key, new.platform, new.result_status,
       new.metric_manifest
     )
     or not exists (
       select 1
       from public.cognitive_product_quality_service_capabilities capability
       where capability.id = new.collector_capability_id
         and capability.service_identity = 'cognitive_sentinel_collector'
         and capability.operation = 'collect_sentinel_run'
         and capability.task_id = new.task_id
         and capability.project_id = new.project_id
         and capability.platform = new.platform
         and capability.environment = new.environment
         and new.sentinel_key = any(capability.allowed_sentinel_keys)
         and transaction_timestamp() < capability.expires_at
         and not exists (
           select 1
           from public.cognitive_product_quality_service_capability_revocations revocation
           where revocation.capability_id = capability.id
         )
     ) then
    raise exception 'product_experience_collector_capability_required'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.product_experience_require_collector_capability()
  from public,anon,authenticated,service_role;

comment on function public.product_experience_detailed_metric_manifest_is_valid(
  text,public.cognitive_platform,text,jsonb
) is
  'Validates the platform-correct, sentinel-specific bounded metric family inside the common collector envelope. LiveKit server, room, media, and installed-UI stages remain distinct; Android touch targets use the reviewed 48dp threshold.';
