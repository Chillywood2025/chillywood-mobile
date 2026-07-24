-- Distinguish ordinary, bounded-failure, and background/foreground LiveKit
-- sessions. Recovery evidence is mandatory only for the recovery scenario,
-- while every scenario continues to require the reviewed detailed metric
-- contract and a real headless participant attempt.

create function public.product_experience_livekit_scenario_is_valid(
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
  if jsonb_typeof(p_metrics) <> 'object'
     or not p_metrics ?& array[
       'scenarioType',
       'headlessParticipantUsed',
       'backgrounded',
       'foregrounded',
       'backgroundForegroundRecovery'
     ]
     or jsonb_typeof(p_metrics->'headlessParticipantUsed') <> 'boolean'
     or jsonb_typeof(p_metrics->'backgrounded') <> 'boolean'
     or jsonb_typeof(p_metrics->'foregrounded') <> 'boolean'
     or jsonb_typeof(
       p_metrics->'backgroundForegroundRecovery'
     ) <> 'boolean'
     or p_metrics->'headlessParticipantUsed' <> 'true'::jsonb then
    return false;
  end if;

  scenario_type := p_metrics->>'scenarioType';
  if scenario_type not in (
       'success_baseline',
       'bounded_failure_fixture',
       'background_foreground_recovery'
     ) then
    return false;
  end if;

  if scenario_type = 'bounded_failure_fixture' then
    return p_result_status = 'failed'
      and p_metrics->>'stageFailureCategory' <> 'none'
      and p_metrics->'backgrounded' = 'false'::jsonb
      and p_metrics->'foregrounded' = 'false'::jsonb
      and p_metrics->'backgroundForegroundRecovery' = 'false'::jsonb;
  end if;

  if scenario_type = 'success_baseline' then
    return p_metrics->'backgrounded' = 'false'::jsonb
      and p_metrics->'foregrounded' = 'false'::jsonb
      and p_metrics->'backgroundForegroundRecovery' = 'false'::jsonb;
  end if;

  return p_result_status <> 'passed'
    or (
      p_metrics->'backgrounded' = 'true'::jsonb
      and p_metrics->'foregrounded' = 'true'::jsonb
      and p_metrics->'backgroundForegroundRecovery' = 'true'::jsonb
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
       jsonb_typeof(p_metric_manifest) <> 'object'
       or jsonb_typeof(p_metric_manifest->'metrics') <> 'object'
       or not public.product_experience_livekit_scenario_is_valid(
         p_result_status,
         p_metric_manifest->'metrics'
       )
     ) then
    return false;
  end if;

  if p_sentinel_key = 'visual_product_experience_sentinel' then
    if jsonb_typeof(p_metric_manifest) <> 'object'
       or jsonb_typeof(p_metric_manifest->'metrics') <> 'object' then
      return false;
    end if;
    case p_metric_manifest->>'observationKind'
      when 'visual_layout' then
        return public.product_experience_option_c_visual_layout_is_valid(
          p_platform, p_result_status, p_metric_manifest->'metrics'
        );
      when 'touch_target' then
        return public.product_experience_option_c_touch_target_is_valid(
          p_platform, p_result_status, p_metric_manifest->'metrics'
        );
      else
        return false;
    end case;
  end if;

  return public.product_experience_metric_manifest_is_valid_pre_option_c(
    p_sentinel_key, p_platform, p_result_status, p_metric_manifest
  );
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

comment on function
  public.product_experience_livekit_scenario_is_valid(text,jsonb) is
  'Fail-closed LiveKit scenario contract: a bounded-failure canary must contain a real failed stage, ordinary sessions do not imply recovery, and a passing recovery session requires exact background/foreground evidence.';

comment on function
  public.product_experience_detailed_metric_manifest_is_valid(
    text,public.cognitive_platform,text,jsonb
  ) is
  'Validates Option C visual evidence, scenario-bound LiveKit evidence, and the preserved installed-journey contract with platform-correct units.';
