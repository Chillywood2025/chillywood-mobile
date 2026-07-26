begin;
select no_plan();

select has_function(
  'public',
  'governance_record_model_execution_attestation',
  array[
    'text','uuid','uuid','cognitive_platform','cognitive_environment',
    'text','text','text','text','text','text','text','text','boolean',
    'text','numeric','integer','text','text'
  ],
  'model execution attestation boundary exists'
);

select has_function(
  'public',
  'governance_model_independence_status_internal',
  array['uuid','text','integer'],
  'model independence status boundary exists'
);

select throws_ok(
  $$select public.governance_record_model_execution_attestation(
    'fake-provider-attestation',
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    'shared','production','product_user_experience',repeat('1',64),
    'family-a','model-a',repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),true,'cross_provider',0.1,100,
    'model_independence_attestation_service',
    'synthetic-assertion-not-provider-bound'
  )$$,
  'P0001',
  'model_provider_bound_attestation_required',
  'caller-declared model attestations fail closed'
);

select is(
  public.governance_model_independence_status_internal(
    'f1000000-0000-4000-8000-000000000001',
    'fake-provider-attestation',
    2
  )->>'status',
  'MODEL_INDEPENDENCE_PROVIDER_REQUIRED',
  'model independence status stays provider-required'
);

select is(
  (
    public.governance_model_independence_status_internal(
      'f1000000-0000-4000-8000-000000000001',
      'fake-provider-attestation',
      2
    )->>'independenceSatisfied'
  )::boolean,
  false,
  'model independence cannot be satisfied by legacy or fake rows'
);

select is(
  (
    public.governance_model_independence_status_internal(
      'f1000000-0000-4000-8000-000000000001',
      'fake-provider-attestation',
      2
    )->>'totalCount'
  )::integer,
  0,
  'legacy attestation rows do not count toward the fail-closed status'
);

select ok(
  pg_get_functiondef(
    'public.governance_model_independence_status_internal(uuid,text,integer)'
      ::regprocedure
  ) not like '%governance_model_execution_attestations%',
  'fail-closed model status does not trust the legacy attestation table'
);

select throws_ok(
  $$select public.governance_assert_switch_prerequisites(
    'f3000000-0000-4000-8000-000000000001',
    'cognitive_research_enabled',
    true
  )$$,
  'P0001',
  'cognitive_research_retention_processor_required',
  'research activation requires an automatic reviewed retention processor'
);

select throws_ok(
  $$select public.governance_assert_switch_prerequisites(
    'f3000000-0000-4000-8000-000000000001',
    'cognitive_memory_enabled',
    true
  )$$,
  'P0001',
  'cognitive_research_retention_processor_required',
  'non-personal memory activation requires an automatic reviewed retention processor'
);

select throws_ok(
  $$select public.governance_assert_switch_prerequisites(
    'f3000000-0000-4000-8000-000000000001',
    'cognitive_collective_deliberation_enabled',
    true
  )$$,
  'P0001',
  'model_independence_provider_required',
  'collective deliberation activation requires provider-bound independence'
);

select throws_ok(
  $$select public.governance_assert_switch_prerequisites(
    'f3000000-0000-4000-8000-000000000001',
    'cognitive_research_enabled',
    false
  )$$,
  'P0001',
  'two_party_execution_missing',
  'research disable passes the activation hold and reaches normal validation'
);

select throws_ok(
  $$select public.governance_assert_switch_prerequisites(
    'f3000000-0000-4000-8000-000000000001',
    'cognitive_memory_enabled',
    false
  )$$,
  'P0001',
  'two_party_execution_missing',
  'memory disable passes the activation hold and reaches normal validation'
);

select throws_ok(
  $$select public.governance_assert_switch_prerequisites(
    'f3000000-0000-4000-8000-000000000001',
    'cognitive_collective_deliberation_enabled',
    false
  )$$,
  'P0001',
  'two_party_execution_missing',
  'collective-deliberation disable passes the hold and reaches normal validation'
);

select has_trigger(
  'public',
  'cognitive_governance_switches',
  'cognitive_governance_switches_level01_activation_hold',
  'switch table has a runtime activation-hold trigger'
);

select ok(
  pg_get_functiondef(
    'public.governance_enforce_level01_activation_hold()'::regprocedure
  ) like '%session_user not in%'
  and pg_get_functiondef(
    'public.governance_enforce_level01_activation_hold()'::regprocedure
  ) like '%current_user not in%',
  'activation-hold administrative exception checks both session and execution identities'
);

create temporary table cognitive_switch_activation_hold_probe(
  switch_key text primary key,
  enabled boolean not null
);

create trigger cognitive_switch_activation_hold_probe_trigger
before insert or update of enabled, switch_key
on cognitive_switch_activation_hold_probe
for each row
execute function public.governance_enforce_level01_activation_hold();

grant select,insert,update on cognitive_switch_activation_hold_probe
  to service_role;

set local role service_role;

insert into cognitive_switch_activation_hold_probe(switch_key,enabled)
values
  ('cognitive_research_enabled',false),
  ('cognitive_memory_enabled',false),
  ('cognitive_collective_deliberation_enabled',false);

select throws_ok(
  $$update cognitive_switch_activation_hold_probe
    set enabled=true
    where switch_key='cognitive_research_enabled'$$,
  'P0001',
  'cognitive_research_retention_processor_required',
  'table boundary rejects direct runtime research activation'
);

select throws_ok(
  $$update cognitive_switch_activation_hold_probe
    set enabled=true
    where switch_key='cognitive_memory_enabled'$$,
  'P0001',
  'cognitive_research_retention_processor_required',
  'table boundary rejects direct runtime memory activation'
);

select throws_ok(
  $$update cognitive_switch_activation_hold_probe
    set enabled=true
    where switch_key='cognitive_collective_deliberation_enabled'$$,
  'P0001',
  'model_independence_provider_required',
  'table boundary rejects direct runtime collective activation'
);

reset role;

select is(
  (
    select count(*)::integer
    from cognitive_switch_activation_hold_probe
    where not enabled
  ),
  3,
  'all held switches remain false after rejected runtime updates'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches
    where switch_key in (
      'cognitive_research_enabled',
      'cognitive_memory_enabled',
      'cognitive_collective_deliberation_enabled'
    )
      and enabled
  ),
  0,
  'migration leaves every held governance switch disabled'
);

select ok(
  pg_get_functiondef(
    'public.governance_enforce_decision_model_independence()'::regprocedure
  ) like '%advisory_only%'
  and pg_get_functiondef(
    'public.governance_enforce_decision_model_independence()'::regprocedure
  ) like '%MODEL_INDEPENDENCE_PROVIDER_REQUIRED%',
  'advisory-only model decisions remain available and quorum-ineligible'
);

select * from finish();
rollback;
