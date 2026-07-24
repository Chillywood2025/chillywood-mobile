begin;

select plan(8);

select ok(
  public.product_experience_livekit_scenario_is_valid(
    'passed',
    '{
      "scenarioType":"success_baseline",
      "headlessParticipantUsed":true,
      "backgrounded":false,
      "foregrounded":false,
      "backgroundForegroundRecovery":false
    }'::jsonb
  ),
  'ordinary success does not require background/foreground recovery'
);

select ok(
  public.product_experience_livekit_scenario_is_valid(
    'failed',
    '{
      "scenarioType":"bounded_failure_fixture",
      "stageFailureCategory":"deadline_exceeded",
      "headlessParticipantUsed":true,
      "backgrounded":false,
      "foregrounded":false,
      "backgroundForegroundRecovery":false
    }'::jsonb
  ),
  'bounded failure fixture remains a distinct reviewed scenario'
);

select ok(
  not public.product_experience_livekit_scenario_is_valid(
    'passed',
    '{
      "scenarioType":"bounded_failure_fixture",
      "stageFailureCategory":"none",
      "headlessParticipantUsed":true,
      "backgrounded":false,
      "foregrounded":false,
      "backgroundForegroundRecovery":false
    }'::jsonb
  ),
  'a healthy run cannot satisfy the bounded failure fixture'
);

select ok(
  public.product_experience_livekit_scenario_is_valid(
    'passed',
    '{
      "scenarioType":"background_foreground_recovery",
      "headlessParticipantUsed":true,
      "backgrounded":true,
      "foregrounded":true,
      "backgroundForegroundRecovery":true
    }'::jsonb
  ),
  'passing recovery scenario requires complete recovery evidence'
);

select ok(
  not public.product_experience_livekit_scenario_is_valid(
    'passed',
    '{
      "scenarioType":"background_foreground_recovery",
      "headlessParticipantUsed":true,
      "backgrounded":false,
      "foregrounded":false,
      "backgroundForegroundRecovery":false
    }'::jsonb
  ),
  'passing recovery scenario rejects absent recovery evidence'
);

select ok(
  not public.product_experience_livekit_scenario_is_valid(
    'passed',
    '{
      "scenarioType":"success_baseline",
      "headlessParticipantUsed":true,
      "backgrounded":true,
      "foregrounded":true,
      "backgroundForegroundRecovery":true
    }'::jsonb
  ),
  'ordinary baseline cannot silently carry recovery evidence'
);

select ok(
  not public.product_experience_livekit_scenario_is_valid(
    'failed',
    '{
      "scenarioType":"bounded_failure_fixture",
      "headlessParticipantUsed":false,
      "backgrounded":false,
      "foregrounded":false,
      "backgroundForegroundRecovery":false
    }'::jsonb
  ),
  'every LiveKit scenario requires the distinct headless participant attempt'
);

select ok(
  (
    select pg_catalog.pg_get_functiondef(procedure.oid) like
      '%product_experience_livekit_scenario_is_valid%'
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname =
        'product_experience_detailed_metric_manifest_is_valid'
  ),
  'authoritative persisted-metric validation includes the scenario contract'
);

select * from finish();
rollback;
