begin;
select plan(28);
select has_table(
  'public',
  'cognitive_livekit_final_source_identity_bindings',
  'the immutable final source identity manifest exists'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_final_source_identity_bindings
    where binding_version = 'livekit-final-source-identity-v3'
  ),
  2,
  'one exact binding exists for each platform'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid =
      'public.cognitive_livekit_final_source_identity_bindings'::regclass
  ),
  'the manifest enables and forces RLS'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.cognitive_livekit_final_source_identity_bindings',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.cognitive_livekit_final_source_identity_bindings',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'public.cognitive_livekit_final_source_identity_bindings',
    'SELECT'
  ),
  'application roles cannot read the internal identity manifest'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid =
      'public.cognitive_livekit_final_source_identity_bindings'::regclass
      and tgname =
        'cognitive_livekit_final_source_identity_bindings_immutable'
      and not tgisinternal
  ),
  'the manifest rejects update and delete'
);
select throws_ok(
  $$update public.cognitive_livekit_final_source_identity_bindings
    set channel = channel
    where target_platform = 'android'$$,
  '42501',
  'immutable_cognitive_evidence',
  'the manifest update path is behaviorally immutable'
);
select throws_ok(
  $$delete from public.cognitive_livekit_final_source_identity_bindings
    where target_platform = 'android'$$,
  '42501',
  'immutable_cognitive_evidence',
  'the manifest delete path is behaviorally immutable'
);
select ok(
  to_regprocedure(
    'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)'
  ) is not null,
  'the exact cross-binding predicate exists'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid =
      'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)'::regprocedure
  ),
  array['search_path=""'],
  'the cross-binding predicate has an empty search_path'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  ),
  'the internal cross-binding predicate is not application-executable'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid =
      'public.cognitive_livekit_platform_activation_outcomes'::regclass
      and tgname = 'cognitive_livekit_platform_run_identity_v3'
      and not tgisinternal
      and tgenabled = 'O'
  )
  and not exists (
    select 1
    from pg_trigger
    where tgrelid =
      'public.cognitive_livekit_platform_activation_outcomes'::regclass
      and tgname = 'cognitive_livekit_platform_run_identity_v2'
      and not tgisinternal
  ),
  'v3 replaces the incomplete v2 enabled-outcome guard'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid =
      'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
  ),
  array['search_path=""'],
  'the enabled-outcome trigger function has an empty search_path'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cognitive_require_livekit_platform_run_identity_v3()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_require_livekit_platform_run_identity_v3()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.cognitive_require_livekit_platform_run_identity_v3()',
    'EXECUTE'
  ),
  'the trigger function is not directly application-executable'
);
select ok(
  not exists (
    select 1
    from public.cognitive_livekit_final_source_identity_bindings binding
    where binding.expected_source_build_hash <> encode(
      extensions.digest(
        convert_to(binding.delivered_source_commit,'UTF8'),
        'sha256'
      ),
      'hex'
    )
  ),
  'each run source hash is derived from its delivered source commit'
);
create function pg_temp.livekit_v3_mutation_is_rejected(
  p_field text,
  p_manifest_platform public.cognitive_platform default 'android',
  p_identity_platform public.cognitive_platform default 'android',
  p_source_build_hash text default null
)
returns boolean
language sql
stable
as $$
  select not public.cognitive_livekit_final_source_identity_matches_v3(
    case when p_field = 'platform'
      then case p_manifest_platform when 'android' then 'ios'::public.cognitive_platform else 'android'::public.cognitive_platform end
      else p_manifest_platform end,
    case when p_field = 'commit' then repeat('a',40)
      else binding.final_source_commit end,
    case when p_field = 'tree' then repeat('b',40)
      else binding.final_source_tree_hash end,
    case when p_field = 'deployment' then repeat('0',64)
      else binding.final_deployment_hash end,
    case when p_field = 'app' then 'com.example.invalid'
      else binding.application_identifier end,
    case when p_field = 'distribution' then 'invalid_distribution'
      else binding.distribution end,
    case when p_field = 'build' then 'invalid' else binding.build_number end,
    case when p_field = 'runtime' then 'wrong-runtime'
      else binding.runtime_version end,
    case when p_field = 'channel' then 'wrong-channel' else binding.channel end,
    case when p_field = 'update' then '00000000-0000-0000-0000-000000000000'::uuid
      else binding.internal_update_id end,
    case when p_field = 'artifact' then repeat('0',64)
      else binding.installed_artifact_hash end,
    coalesce(
      p_source_build_hash,
      case when p_field = 'source' then repeat('0',64)
        else binding.expected_source_build_hash
      end
    ),
    case when p_field = 'runtime_hash' then repeat('0',64)
      else binding.expected_runtime_identity_hash end
  )
  from public.cognitive_livekit_final_source_identity_bindings binding
  where binding.target_platform = p_identity_platform;
$$;
with negative_cases(field_name) as (
  values ('platform'),('commit'),('tree'),('deployment'),('app'),
    ('distribution'),('build'),('runtime'),('channel'),('update'),
    ('artifact'),('source'),('runtime_hash')
)
select is(
  (select count(*)::integer from negative_cases
   where pg_temp.livekit_v3_mutation_is_rejected(field_name)),
  13,
  'every receipt, artifact, source, and runtime comparator fails alone'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_activation_outcomes
  ),
  0,
  'the correction creates no activation outcome'
);
create function pg_temp.sha256(p_value text) returns text language sql immutable as $$
  select encode(extensions.digest(convert_to(p_value,'UTF8'),'sha256'),'hex');
$$;
create temporary table b1_canaries(user_id uuid,event_id uuid,suffix text) on commit drop;
insert into b1_canaries values
  ('61000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','a'),
  ('61000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000002','b');
insert into auth.users(id,is_sso_user,is_anonymous)
select user_id,false,false from b1_canaries;
insert into public.chat_call_livekit_canary_users(user_id,enabled,enrolled_by)
select user_id,true,'61000000-0000-0000-0000-000000000001' from b1_canaries;
insert into public.provider_events(id,provider_event_id,provider,user_id,app_user_id,
  environment,event_type,status,idempotency_key,raw_payload_hash)
select event_id,'b1-sandbox-premium-' || suffix,'revenuecat',user_id,
  user_id::text,'sandbox','INITIAL_PURCHASE','processed',
  'b1-sandbox-premium-' || suffix,pg_temp.sha256('b1-provider-' || suffix)
from b1_canaries;
insert into public.user_entitlements(user_id,entitlement_key,status,source,
  starts_at,expires_at,metadata)
select user_id,'premium','active','revenuecat',transaction_timestamp(),
  transaction_timestamp() + interval '1 hour',
  '{"environment":"sandbox","sandbox":true}'::jsonb from b1_canaries;
insert into public.access_grants(user_id,grant_type,source_type,source_id,provider,
  provider_event_id,environment,status,starts_at,expires_at)
select user_id,'premium','provider_event',event_id,'revenuecat',event_id,
  'sandbox','sandbox_only',transaction_timestamp(),
  transaction_timestamp() + interval '1 hour' from b1_canaries;
create temporary table b1_sandbox_premium_proof on commit drop as
  select public.cognitive_livekit_sandbox_premium_proof_v1() proof;
select ok(
  (select proof->>'eligible' = 'true' and
    (proof->>'qualifiedRevenueCatSandboxRowCount')::integer = 2 and
    (proof->>'qualifiedPremiumUserCount')::integer = 2 from b1_sandbox_premium_proof),
  'preflight uses a provider-backed sanitized sandbox Premium proof'
);
create temporary table b1_livekit_platform_state(
  platform public.cognitive_platform primary key,task_id uuid not null,capability_prefix text not null,
  receipt_id uuid not null,authorization_id uuid not null,distribution text not null,build_number text not null,
  runtime_version text not null,channel text not null,update_id uuid not null,artifact_hash text not null,receipt_hash text not null,
  rollback_hash text not null,runtime_identity_hash text not null,source_build_hash text not null
) on commit drop;
insert into b1_livekit_platform_state values
  ('android','40000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-',
   '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','google_play_internal_testing',
   '86','1.0.0-android-chat-call-action-v1','android-chat-livekit-qa','e3379ac9-61f0-40db-a014-81975be123e5',
   'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
   '0fbe0c0d5bf2fe593b23f8970fe03e85c2e32e9195ec93ac9533d254b9014759',repeat('7',64),
   '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0',
   'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050'),
  ('ios','40000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-',
   '10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','internal_testflight',
   '8','1.0.0-iosqa1','ios-qa','019fb099-f7c3-7130-97aa-a4bb1c49792f',
   '24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8',
   '37d14e930e6787973866b0a5f38c28e1484dac0cb187f4ecb5de363147528e48',repeat('9',64),
   '17d0bf8d12eed354ab5784cc94a3373620c4a9dc09b9aeda81bdb13103351bcf',
   '73792a29b2de5445bc7fc718abd6463d812ffec6b566b00ab930045a32d266cb');
insert into public.cognitive_projects(id,repository_full_name,source_state,
  activation_state,scheduler_state,production_authority) values (
  '50000000-0000-0000-0000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off','none',false
);
insert into public.intelligence_tasks(id,project_id,platform,environment,
  repository_full_name,branch_name,task_key,objective_hash,actor_identity,deadman_at) values (
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'shared','production','Chillywood2025/chillywood-mobile',
  'codex/assurance-livekit-v3-trigger-contract',
  'assurance-livekit-v3-shared-fixture',repeat('1',64),
  'assurance-livekit-v3-trigger-contract',
  transaction_timestamp() + interval '1 day'
);
insert into public.intelligence_tasks (
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,actor_identity,deadman_at
)
select task_id,'50000000-0000-0000-0000-000000000001',platform,'production',
  'Chillywood2025/chillywood-mobile','codex/assurance-livekit-v3-trigger-contract',
  'assurance-livekit-v3-' || platform || '-fixture',
  repeat(case platform when 'android' then '2' else '8' end,64),
  'assurance-livekit-v3-trigger-contract',
  transaction_timestamp() + interval '1 day'
from b1_livekit_platform_state;
insert into public.product_experience_baseline_versions (
  id,task_id,project_id,platform,environment,baseline_key,
  baseline_version,baseline_hash
) values (
  '70000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'shared','production','livekit_experience_deadlines',1,repeat('3',64)
);
insert into public.cognitive_product_quality_service_capabilities (
  id,service_identity,operation,task_id,project_id,platform,environment,
  assertion_hash,allowed_sentinel_keys,registered_by,expires_at
)
select (state.capability_prefix || lpad(operation.ordinal::text,12,'0'))::uuid,
  operation.service_identity,operation.operation,state.task_id,
  '50000000-0000-0000-0000-000000000001',state.platform,'production',
  repeat(operation.assertion_digit,64),case when operation.ordinal < 4
    then array['livekit_experience_sentinel'] else '{}'::text[] end,
  '60000000-0000-0000-0000-000000000001',transaction_timestamp() + interval '1 hour'
from b1_livekit_platform_state state
cross join (values
  (1,'cognitive_livekit_experience_collector','collect_livekit_sentinel_run','4'),
  (2,'cognitive_livekit_experience_collector','issue_livekit_failure_fixture','5'),
  (3,'cognitive_livekit_experience_collector','consume_livekit_failure_fixture','6'),
  (4,'cognitive_product_quality_triage','triage_product_quality','7')
) operation(ordinal,service_identity,operation,assertion_digit);
insert into public.cognitive_livekit_platform_preflight_receipts (
  id,shared_task_id,target_task_id,project_id,target_platform,owner_user_id,
  baseline_version_id,collect_capability_id,issue_capability_id,
  consume_capability_id,triage_capability_id,
  collector_assertion_fingerprint,evaluator_assertion_fingerprint,
  application_identifier,distribution,app_version,build_number,
  runtime_version,channel,internal_update_id,installed_artifact_hash,
  sandbox_premium_proof_hash,premium_proof_kind,
  role_free_account_attested,manual_grant_absent,real_charge_absent,
  telemetry_contract_hash,source_commit,source_tree_hash,
  independent_review_hash,tests_hash,deployment_hash,rollback_hash,
  receipt_hash,created_at,expires_at
)
select receipt_id,'30000000-0000-0000-0000-000000000001',task_id,
  '50000000-0000-0000-0000-000000000001',platform,
  '60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
  (capability_prefix || '000000000001')::uuid,(capability_prefix || '000000000002')::uuid,
  (capability_prefix || '000000000003')::uuid,(capability_prefix || '000000000004')::uuid,
  repeat('1',64),repeat('2',64),'com.chillywood.mobile',distribution,'1.0.0',
  build_number,runtime_version,channel,update_id,artifact_hash,
  (select proof->>'proofHash' from b1_sandbox_premium_proof),
  'store_sandbox_revenuecat_backend_installed_v1',true,true,true,repeat('4',64),
  'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
  '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',repeat('5',64),repeat('6',64),
  '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
  receipt_hash,rollback_hash,transaction_timestamp() - interval '2 minutes',
  transaction_timestamp() + interval '8 minutes'
from b1_livekit_platform_state;
create function pg_temp.insert_enabled_outcome(
  p_outcome_id uuid,
  p_authorization_id uuid,
  p_platform public.cognitive_platform
)
returns void
language sql
as $$
  insert into public.cognitive_livekit_platform_activation_outcomes(
    id,authorization_id,shared_task_id,target_task_id,project_id,
    target_platform,owner_user_id,enabled,sentinel_run_count,
    evaluator_proof_count,normal_triage_consumption_count,
    fixture_attestation_count,fixture_triage_consumption_count,
    open_finding_count,canary_receipt_hash,
    emergency_stop_receipt_hash,principal_rollback_receipt_hash,outcome_hash
  ) values (
    p_outcome_id,p_authorization_id,
    '30000000-0000-0000-0000-000000000001',
    case p_platform when 'android'
      then '40000000-0000-0000-0000-000000000001'::uuid
      else '40000000-0000-0000-0000-000000000002'::uuid end,
    '50000000-0000-0000-0000-000000000001',p_platform,
    '60000000-0000-0000-0000-000000000001',
    true,9,0,0,0,0,0,
    repeat('a',64),repeat('b',64),repeat('c',64),
    pg_temp.sha256('outcome|' || p_outcome_id::text)
  );
$$;
create function pg_temp.livekit_v3_rejects_new_authorization(
  p_mutation text
)
returns boolean
language plpgsql
as $$
declare authorization_id_value uuid := case p_mutation
  when 'authorization_source_commit'
    then '21000000-0000-0000-0000-000000000001'::uuid
  else '21000000-0000-0000-0000-000000000002'::uuid
end;
begin
  begin
    insert into public.cognitive_livekit_platform_canary_authorizations(
      id,preflight_receipt_id,shared_task_id,target_task_id,project_id,
      target_platform,owner_user_id,baseline_version_id,source_commit,
      source_tree_hash,independent_review_hash,tests_hash,deployment_hash,
      rollback_hash,authorization_hash,opened_at,expires_at
    ) values (
      authorization_id_value,
      '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001','android',
      '60000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      case when p_mutation = 'authorization_source_commit'
        then repeat('a',40)
        else 'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6' end,
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      repeat('5',64),
      case when p_mutation = 'authorization_tests_hash'
        then repeat('a',64) else repeat('6',64) end,
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      '0fbe0c0d5bf2fe593b23f8970fe03e85c2e32e9195ec93ac9533d254b9014759',
      pg_temp.sha256('negative-authorization|' || p_mutation),
      transaction_timestamp() - interval '1 minute',
      transaction_timestamp() + interval '19 minutes'
    );
    perform pg_temp.insert_enabled_outcome(
      case p_mutation when 'authorization_source_commit'
        then 'a1000000-0000-0000-0000-000000000001'::uuid
        else 'a1000000-0000-0000-0000-000000000002'::uuid end,
      authorization_id_value,'android'
    );
    raise exception 'negative_control_was_not_rejected'
      using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'livekit_final_source_identity_cross_binding_rejected'
    then raise; end if;
  end;
  return true;
end;
$$;
create temporary table b1_negative_controls(
  mutation text primary key,
  rejected boolean not null
) on commit drop;
insert into b1_negative_controls values
  ('authorization_source_commit',
   pg_temp.livekit_v3_rejects_new_authorization(
     'authorization_source_commit')),
  ('authorization_tests_hash',
   pg_temp.livekit_v3_rejects_new_authorization(
     'authorization_tests_hash'));
insert into public.cognitive_livekit_platform_canary_authorizations (
  id,preflight_receipt_id,shared_task_id,target_task_id,project_id,
  target_platform,owner_user_id,baseline_version_id,source_commit,
  source_tree_hash,independent_review_hash,tests_hash,deployment_hash,
  rollback_hash,authorization_hash,opened_at,expires_at
)
select authorization_id,receipt_id,'30000000-0000-0000-0000-000000000001',
  task_id,'50000000-0000-0000-0000-000000000001',platform,
  '60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
  'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
  '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
  repeat('5',64),repeat('6',64),
  '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
  receipt_hash,repeat(case platform when 'android' then '8' else '9' end,64),
  transaction_timestamp() - interval '1 minute',
  transaction_timestamp() + interval '19 minutes'
from b1_livekit_platform_state;
insert into public.cognitive_governance_switches (
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at,updated_at
) select task_id,'50000000-0000-0000-0000-000000000001',platform,'production',
  'cognitive_livekit_experience_sentinel_enabled',true,
  'provider-independent-' || platform || '-livekit-canary-v1',
  '60000000-0000-0000-0000-000000000001',
  transaction_timestamp(),transaction_timestamp()
from b1_livekit_platform_state;
create temporary table b1_livekit_fixture_state on commit drop as
with routes(route_or_surface,ordinal) as (
  values ('live-stage',2),('watch-party-live',5),('chat-call',8)
), fixture as (
  select platform_state.*,route_or_surface,ordinal,
    pg_temp.sha256('fixture|' || platform || '|' || route_or_surface) fixture_id,
    pg_temp.sha256('attestation|' || platform || '|' || route_or_surface) attestation_hash,
    'cognitive-test-b1-' || platform || '-' || replace(route_or_surface,'-','') room_name,
    pg_temp.sha256('correlation|' || platform || '|' || route_or_surface) correlation_hash,
    pg_temp.sha256(
      'evidence|' || platform || '|' || route_or_surface ||
      '|bounded_failure_fixture'
    ) evidence_hash,
    pg_temp.sha256('idempotency|' || platform || '|' || ordinal) idempotency_hash,
    date_trunc('milliseconds',
      transaction_timestamp() - interval '5 seconds'
    ) observation_started_at,
    date_trunc('milliseconds',
      transaction_timestamp() - interval '1 second'
    ) observation_finished_at,
    transaction_timestamp() - interval '20 seconds' issued_at,
    transaction_timestamp() + interval '100 seconds' expires_at,
    transaction_timestamp() claimed_at
  from routes cross join b1_livekit_platform_state platform_state
)
select fixture.*,
  public.product_experience_livekit_synthetic_room_hash(room_name) room_hash
from fixture;
insert into public.product_experience_livekit_failure_fixture_issuances(
  fixture_id,task_id,project_id,platform,environment,principal,
  source_commit,capability_id,fixture_type,condition,
  fixture_attestation_hash,synthetic_room_name,synthetic_room_name_hash,
  room_run_correlation_hash,issued_at,expires_at,issuance_hash
)
select fixture_id,task_id,
  '50000000-0000-0000-0000-000000000001',platform,'production',
  'cognitive_livekit_experience_collector',
  'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
  (capability_prefix || '000000000002')::uuid,
  'controlled_test_endpoint_timeout',
  public.product_experience_livekit_failure_fixture_condition(
    'controlled_test_endpoint_timeout'
  ),
  attestation_hash,room_name,room_hash,correlation_hash,issued_at,expires_at,
  public.product_experience_livekit_fixture_issuance_hash(
    fixture_id,task_id,
    '50000000-0000-0000-0000-000000000001',platform,'production',
    'cognitive_livekit_experience_collector',
    'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
    (capability_prefix || '000000000002')::uuid,
    'controlled_test_endpoint_timeout',
    public.product_experience_livekit_failure_fixture_condition(
      'controlled_test_endpoint_timeout'
    ),
    attestation_hash,room_name,room_hash,correlation_hash,issued_at,expires_at
  )
from b1_livekit_fixture_state;
insert into public.product_experience_livekit_failure_fixture_consumptions(
  fixture_id,task_id,project_id,platform,environment,principal,
  source_commit,fixture_attestation_hash,synthetic_room_name,
  synthetic_room_name_hash,room_run_correlation_hash,route_or_surface,
  runtime_identity_hash,source_build_hash,evidence_manifest_hash,
  collection_idempotency_hash,observation_started_at,
  observation_finished_at,claimed_at,consumption_hash
)
select fixture_id,task_id,
  '50000000-0000-0000-0000-000000000001',platform,'production',
  'cognitive_livekit_experience_collector',
  'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
  attestation_hash,room_name,room_hash,correlation_hash,route_or_surface,
  runtime_identity_hash,source_build_hash,
  evidence_hash,idempotency_hash,observation_started_at,
  observation_finished_at,claimed_at,
  public.product_experience_livekit_fixture_consumption_hash(
    fixture_id,task_id,
    '50000000-0000-0000-0000-000000000001',platform,'production',
    'cognitive_livekit_experience_collector',
    'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
    attestation_hash,room_name,room_hash,correlation_hash,route_or_surface,
    runtime_identity_hash,source_build_hash,
    evidence_hash,idempotency_hash,observation_started_at,
    observation_finished_at,claimed_at
  )
from b1_livekit_fixture_state;
create function pg_temp.livekit_metric(
  p_platform public.cognitive_platform,
  p_route text,
  p_scenario text
)
returns jsonb
language plpgsql
stable
as $$
declare
  fixture b1_livekit_fixture_state%rowtype;
  healthy boolean := p_scenario <> 'bounded_failure_fixture';
  recovering boolean := p_scenario = 'background_foreground_recovery';
  evidence_hash_value text :=
    pg_temp.sha256('evidence|' || p_platform || '|' || p_route || '|' || p_scenario);
  metrics jsonb;
begin
  metrics := jsonb_build_object(
    'scenarioType',p_scenario,'tokenRequestStarted',true,
    'tokenRequested',true,'tokenReturned',true,
    'tokenResultStatus','success','websocketConnected',healthy,
    'iceGatheringObserved',healthy,'iceCheckingObserved',healthy,
    'iceState',case when healthy then 'connected' else 'new' end,
    'peerConnectionEstablished',healthy,'roomConnected',healthy,
    'localTrackPublished',healthy,'remoteParticipantJoined',healthy,
    'remoteTrackSubscribed',healthy,'firstAudioVideoObserved',healthy,
    'connectingResolved',healthy,'backgrounded',recovering,
    'foregrounded',recovering,'backgroundForegroundRecovery',recovering,
    'cleanupDisconnected',true,'buildRuntimeMatched',true,
    'installedUiObserved',p_scenario = 'bounded_failure_fixture',
    'installedUiEvidenceHash',case
      when p_scenario = 'bounded_failure_fixture'
        then to_jsonb(pg_temp.sha256('installed-ui|' || p_route))
      else 'null'::jsonb end,
    'localMediaSource',case when healthy then 'test_tone' else 'none' end,
    'networkState','ready','permissionState','granted',
    'providerState',case when healthy then 'healthy' else 'degraded' end,
    'remoteMediaKind',case when healthy then 'audio' else 'none' end,
    'stageFailureCategory',case
      when healthy then 'none' else 'websocket_failure' end,
    'headlessParticipantUsed',true,'tokenIssuedElapsedMs',500,
    'roomConnectElapsedMs',case when healthy then 1000 else 0 end,
    'uiStateResolutionElapsedMs',1000,
    'firstRemoteMediaElapsedMs',case when healthy then 1000 else 0 end
  );
  if p_scenario <> 'bounded_failure_fixture' then
    return jsonb_build_object(
      'schemaVersion','product-sentinel-v1',
      'sanitizationVersion','bounded-nonpersonal-v1',
      'observationKind','livekit_experience',
      'evidenceHashes',jsonb_build_array(evidence_hash_value),
      'metrics',metrics || jsonb_build_object('assuranceFixtureStatus','ok','assuranceFixtureState','state')
    );
  end if;
  select * into fixture from b1_livekit_fixture_state
  where platform = p_platform and route_or_surface = p_route;
  metrics := metrics || jsonb_build_object(
    'headlessObservationStartedAt',to_char(
      fixture.observation_started_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'headlessObservationFinishedAt',to_char(
      (fixture.observation_started_at + interval '1 second') at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'headlessParticipantIdentityHash',
      pg_temp.sha256('headless|' || p_platform || '|' || p_route),
    'installedObservationStartedAt',to_char(
      (fixture.observation_started_at + interval '2 seconds') at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'installedObservationFinishedAt',to_char(
      fixture.observation_finished_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'installedParticipantIdentityHash',
      pg_temp.sha256('installed|' || p_platform || '|' || p_route),
    'installedRoomRunCorrelationHash',fixture.correlation_hash,
    'installedRuntimeIdentityHash',fixture.runtime_identity_hash,
    'installedSourceBuildHash',fixture.source_build_hash,
    'participantIdentityDistinct',true,
    'roomRunCorrelationHash',fixture.correlation_hash,
    'tokenClaimsValidated',true
  );
  return jsonb_build_object(
    'schemaVersion','product-sentinel-v1',
    'sanitizationVersion','bounded-nonpersonal-v1',
    'observationKind','livekit_experience',
    'evidenceHashes',
      jsonb_build_array(fixture.attestation_hash,fixture.evidence_hash),
    'failureFixtureBinding',jsonb_build_object(
      'condition',
        public.product_experience_livekit_failure_fixture_condition(
          'controlled_test_endpoint_timeout'
        ),
      'fixtureAttestationHash',fixture.attestation_hash,
      'fixtureId',fixture.fixture_id,
      'fixtureType','controlled_test_endpoint_timeout',
      'principal','cognitive_livekit_experience_collector',
      'roomRunCorrelationHash',fixture.correlation_hash,
      'sourceCommit','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      'syntheticRoomNameHash',fixture.room_hash
    ),
    'metrics',metrics
  );
end;
$$;
with combinations(route_or_surface,scenario_type,ordinal) as (
  values
    ('live-stage','success_baseline',1),
    ('live-stage','bounded_failure_fixture',2),
    ('live-stage','background_foreground_recovery',3),
    ('watch-party-live','success_baseline',4),
    ('watch-party-live','bounded_failure_fixture',5),
    ('watch-party-live','background_foreground_recovery',6),
    ('chat-call','success_baseline',7),
    ('chat-call','bounded_failure_fixture',8),
    ('chat-call','background_foreground_recovery',9)
)
insert into public.product_experience_sentinel_runs(
  id,task_id,project_id,platform,environment,sentinel_key,
  route_or_surface,runtime_identity_hash,evidence_manifest_hash,
  metric_manifest,result_status,physical_proof_status,
  collector_capability_id,collection_idempotency_hash,
  source_build_hash,observation_started_at,observation_finished_at,
  evaluation_expires_at
)
select (
    case platform_state.platform when 'android'
      then '90000000-0000-0000-0000-' else '92000000-0000-0000-0000-' end ||
    lpad(ordinal::text,12,'0')
  )::uuid,
  platform_state.task_id,
  '50000000-0000-0000-0000-000000000001',platform_state.platform,'production',
  'livekit_experience_sentinel',route_or_surface,
  platform_state.runtime_identity_hash,
  pg_temp.sha256(
    'evidence|' || platform_state.platform || '|' || route_or_surface || '|' || scenario_type
  ),
  pg_temp.livekit_metric(platform_state.platform,route_or_surface,scenario_type),
  case when scenario_type = 'bounded_failure_fixture'
    then 'failed' else 'blocked' end,
  case when scenario_type = 'bounded_failure_fixture'
    then 'installed_ui_observed' else 'source_only' end,
  (platform_state.capability_prefix || '000000000001')::uuid,
  pg_temp.sha256('idempotency|' || platform_state.platform || '|' || ordinal),
  platform_state.source_build_hash,
  coalesce(
    (select observation_started_at from b1_livekit_fixture_state
     where b1_livekit_fixture_state.platform = platform_state.platform
       and b1_livekit_fixture_state.route_or_surface = combinations.route_or_surface
       and scenario_type = 'bounded_failure_fixture'),
    transaction_timestamp() - interval '30 seconds'
  ),
  coalesce(
    (select observation_finished_at from b1_livekit_fixture_state
     where b1_livekit_fixture_state.platform = platform_state.platform
       and b1_livekit_fixture_state.route_or_surface = combinations.route_or_surface
       and scenario_type = 'bounded_failure_fixture'),
    transaction_timestamp()
  ),
  transaction_timestamp() + interval '1 hour'
from combinations cross join b1_livekit_platform_state platform_state;
create function pg_temp.livekit_v3_rejects_new_run(p_mutation text)
returns boolean
language plpgsql
as $$
declare
  run_id_value uuid := case p_mutation
    when 'run_source_build_hash'
      then '91000000-0000-0000-0000-000000000001'::uuid
    else '91000000-0000-0000-0000-000000000002'::uuid
  end;
begin
  begin
    insert into public.product_experience_sentinel_runs(
      id,task_id,project_id,platform,environment,sentinel_key,
      route_or_surface,runtime_identity_hash,evidence_manifest_hash,
      metric_manifest,result_status,physical_proof_status,
      collector_capability_id,collection_idempotency_hash,
      source_build_hash,observation_started_at,observation_finished_at,
      evaluation_expires_at
    ) values (
      run_id_value,'40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001','android','production',
      'livekit_experience_sentinel','live-stage',
      case when p_mutation = 'run_runtime_identity_hash'
        then repeat('a',64)
        else '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
      end,
      pg_temp.sha256('negative-evidence|' || p_mutation),
      jsonb_set(
        pg_temp.livekit_metric('android','live-stage','success_baseline'),
        '{evidenceHashes}',
        jsonb_build_array(pg_temp.sha256('negative-evidence|' || p_mutation))
      ),
      'blocked','source_only',
      '80000000-0000-0000-0000-000000000001',
      pg_temp.sha256('negative-idempotency|' || p_mutation),
      case when p_mutation = 'run_source_build_hash'
        then repeat('a',64)
        else 'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050'
      end,
      transaction_timestamp() - interval '10 seconds',
      transaction_timestamp(),transaction_timestamp() + interval '1 hour'
    );
    perform pg_temp.insert_enabled_outcome(
      case p_mutation when 'run_source_build_hash'
        then 'a2000000-0000-0000-0000-000000000001'::uuid
        else 'a2000000-0000-0000-0000-000000000002'::uuid end,
      '20000000-0000-0000-0000-000000000001','android'
    );
    raise exception 'negative_control_was_not_rejected'
      using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'livekit_final_source_identity_cross_binding_rejected'
    then raise; end if;
  end;
  return true;
end;
$$;
insert into b1_negative_controls values
  (
    'run_source_build_hash',
    pg_temp.livekit_v3_rejects_new_run('run_source_build_hash')
  ),
  (
    'run_runtime_identity_hash',
    pg_temp.livekit_v3_rejects_new_run('run_runtime_identity_hash')
  );
select is(
  (select rejected from b1_negative_controls
   where mutation = 'authorization_source_commit'),
  true,
  'enabled finalization rejects one changed authorization source commit'
);
select is(
  (select rejected from b1_negative_controls
   where mutation = 'authorization_tests_hash'),
  true,
  'enabled finalization rejects one changed authorization tests hash'
);
select is(
  (select rejected from b1_negative_controls
   where mutation = 'run_source_build_hash'),
  true,
  'enabled finalization rejects one changed run source hash'
);
select is(
  (select rejected from b1_negative_controls
   where mutation = 'run_runtime_identity_hash'),
  true,
  'enabled finalization rejects one changed run runtime hash'
);
select lives_ok(
  $$select pg_temp.insert_enabled_outcome(
    'a0000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001','android'
  )$$,
  'the actual enabled v3 finalization trigger accepts one exact tuple'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_activation_outcomes
    where id = 'a0000000-0000-0000-0000-000000000001'
      and enabled
  ),
  1,
  'the positive enabled outcome is inserted exactly once in the transaction'
);
create temporary table b1_match_predicate_witness(name text,passed boolean) on commit drop;
insert into b1_match_predicate_witness values
  ('predicate denies Android parent delivered commit',pg_temp.livekit_v3_mutation_is_rejected(
    'explicit_source','android','android',pg_temp.sha256('268f5d7e93e2cc5044286a956f870fe35dbf2638'))),
  ('predicate denies Android diverged commit',pg_temp.livekit_v3_mutation_is_rejected(
    'explicit_source','android','android',pg_temp.sha256('00acb77770ee5c04ab7bbd5aab64cbb93a7d442f'))),
  ('predicate denies iOS parent delivered commit',pg_temp.livekit_v3_mutation_is_rejected(
    'explicit_source','ios','ios',pg_temp.sha256('81039cad0daf601594381d8f35b80f916e5795a2'))),
  ('predicate denies iOS diverged commit',pg_temp.livekit_v3_mutation_is_rejected(
    'explicit_source','ios','ios',pg_temp.sha256('00acb77770ee5c04ab7bbd5aab64cbb93a7d442f'))),
  ('predicate denies Android identity for iOS',pg_temp.livekit_v3_mutation_is_rejected('none','ios','android')),
  ('predicate denies iOS identity for Android',pg_temp.livekit_v3_mutation_is_rejected('none','android','ios')),
  ('predicate denies runtime mismatch',pg_temp.livekit_v3_mutation_is_rejected('runtime')),
  ('predicate denies update mismatch',pg_temp.livekit_v3_mutation_is_rejected('update')),
  ('predicate denies artifact mismatch',pg_temp.livekit_v3_mutation_is_rejected('artifact')),
  ('predicate denies final receipt tree mismatch',pg_temp.livekit_v3_mutation_is_rejected('tree'));
select is((select count(*)::integer from b1_match_predicate_witness where passed),10,
  'the immutable match predicate denies all ten named non-bound identity rows');
create function pg_temp.livekit_enabled_replay_denied(
  p_outcome_id uuid,
  p_authorization_id uuid,
  p_platform public.cognitive_platform
)
returns boolean
language plpgsql
as $$
declare violated_constraint text;
begin
  begin
    perform pg_temp.insert_enabled_outcome(
      p_outcome_id,p_authorization_id,p_platform
    );
    return false;
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    return violated_constraint =
      'cognitive_livekit_platform_activation_outcomes_authorization_id_key';
  end;
end;
$$;
select is(
  pg_temp.livekit_enabled_replay_denied(
    'a3000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001','android'
  ),true,
  'replayed exact Android enabled finalization is denied'
);
select lives_ok(
  $$select pg_temp.insert_enabled_outcome(
    'a0000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002','ios'
  )$$,
  'the actual enabled v3 finalization trigger accepts exact iOS evidence'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_activation_outcomes
    where id = 'a0000000-0000-0000-0000-000000000002'
      and target_platform = 'ios' and enabled
  ),1,
  'the valid exact iOS enabled outcome is inserted once'
);
select is(
  pg_temp.livekit_enabled_replay_denied(
    'a3000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002','ios'
  ),true,
  'replayed exact iOS enabled finalization is denied'
);
select * from finish();
rollback;
