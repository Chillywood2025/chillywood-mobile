begin;
select no_plan();

select has_table(
  'public',
  'cognitive_research_backup_retention_attestations',
  'provider backup state has an immutable attestation table'
);
select has_table(
  'public',
  'cognitive_research_retention_processor_attestations',
  'automatic retention processor has an immutable attestation table'
);
select has_table(
  'public',
  'cognitive_research_retention_processor_heartbeats',
  'automatic retention runs have immutable heartbeat evidence'
);
select has_table(
  'public',
  'cognitive_research_retention_processor_revocations',
  'retention processor attestations have an immutable revocation path'
);

select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'cognitive_research_backup_retention_attestations',
        'cognitive_research_retention_processor_attestations',
        'cognitive_research_retention_processor_heartbeats',
        'cognitive_research_retention_processor_revocations'
      )
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  4,
  'every retention-processor evidence table uses RLS and FORCE RLS'
);

select ok(
  has_function_privilege(
    'cognitive_public_research_broker',
    'cognitive_runtime.run_attested_research_retention_maintenance(uuid,uuid,uuid,text,text,timestamptz,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'cognitive_level01_scheduler',
    'cognitive_runtime.run_attested_research_retention_maintenance(uuid,uuid,uuid,text,text,timestamptz,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'cognitive_runtime.run_attested_research_retention_maintenance(uuid,uuid,uuid,text,text,timestamptz,integer,text)',
    'EXECUTE'
  ),
  'only the research broker runtime role can invoke scheduled maintenance'
);

select ok(
  not has_function_privilege(
    'cognitive_public_research_broker',
    'public.cognitive_expire_public_research_maintenance(uuid,uuid,public.cognitive_platform,public.cognitive_environment,integer,text)',
    'EXECUTE'
  )
  and not has_table_privilege(
    'cognitive_public_research_broker',
    'public.cognitive_research_retention_processor_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'the broker cannot bypass the attested wrapper or write evidence tables'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)',
    'EXECUTE'
  ),
  'ordinary clients cannot persist provider or processor attestations'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.governance_revoke_research_retention_activation(uuid,uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.governance_revoke_research_retention_activation(uuid,uuid,text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.governance_revoke_research_retention_activation(uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'revocation is available only through the existing two-party worker boundary'
);

select ok(
  pg_get_functiondef(
    'public.governance_research_retention_activation_hash(text,text,text,text,text)'
      ::regprocedure
  ) like '%provider_project_backups_absent%'
  and pg_get_functiondef(
    'public.governance_research_retention_activation_hash(text,text,text,text,text)'
      ::regprocedure
  ) like '%chillywood-level01-public-research-broker%'
  and pg_get_functiondef(
    'public.governance_research_retention_activation_hash(text,text,text,text,text)'
      ::regprocedure
  ) like '%17 * * * *%',
  'activation hash binds the exact provider backup state, broker, and schedule'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_research_retention_processor_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) like '%cognitive_user_derived_memory_enabled%'
  and pg_get_functiondef(
    'public.cognitive_research_retention_processor_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) like '%restored_data_requires_tombstone_replay%'
  and pg_get_functiondef(
    'public.cognitive_research_retention_processor_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) like '%maximum_lag_seconds%',
  'readiness requires user-derived memory off, tombstone replay, and a fresh heartbeat'
);

insert into public.cognitive_projects(
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  'd1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off','none',false
);
insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,status,actor_identity,deadman_at,retention_until,
  data_class
) values (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','Chillywood2025/chillywood-mobile',
  'codex/retention-processor-test','retention-processor-test',repeat('1',64),
  'received','retention-processor-test',
  transaction_timestamp()+interval '1 day',
  transaction_timestamp()+interval '30 days','operational_metadata'
);
insert into public.cognitive_retention_policy_states(
  task_id,project_id,platform,environment,policy_hash,policy_state,
  user_derived_memory_allowed,raw_user_reports_allowed,
  raw_private_messages_allowed,raw_private_media_allowed,
  raw_user_analytics_allowed,private_model_input_allowed
) values (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',repeat('2',64),
  'owner_counsel_decision_required',false,false,false,false,false,false
);
insert into public.cognitive_governance_switches(
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at
) values (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','cognitive_user_derived_memory_enabled',false,
  'collective-governance-v1',null,null
);
insert into public.cognitive_service_identities(
  service_identity,credential_hash,status,issued_at,expires_at
) values (
  'research_source_broker',
  encode(extensions.digest(convert_to(
    'retention-processor-test-token-0000000000000000','UTF8'
  ),'sha256'),'hex'),
  'active',transaction_timestamp(),transaction_timestamp()+interval '1 day'
) on conflict (service_identity) do update set
  credential_hash=excluded.credential_hash,status='active',
  issued_at=excluded.issued_at,expires_at=excluded.expires_at,revoked_at=null;

set local session_replication_role = replica;
insert into public.cognitive_research_backup_retention_attestations(
  id,execution_id,evaluator_proof_id,task_id,project_id,platform,environment,
  provider,provider_plan,backup_state,backup_window_days,restore_available,
  point_in_time_recovery,restored_data_requires_tombstone_replay,
  provider_evidence_hash,provider_verified_at,expires_at
) values (
  'd3000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','supabase','free',
  'provider_project_backups_absent',0,false,false,true,repeat('3',64),
  transaction_timestamp(),transaction_timestamp()+interval '1 day'
);
insert into public.cognitive_research_retention_processor_attestations(
  id,execution_id,evaluator_proof_id,backup_attestation_id,task_id,project_id,
  platform,environment,repository_full_name,source_commit,runtime_provider,
  worker_name,runtime_principal,database_role,schedule_cron,
  schedule_timezone,batch_limit,maximum_batches,timeout_ms,
  maximum_lag_seconds,retention_policy_id,retention_policy_hash,
  worker_version_hash,provider_configuration_hash,attestation_hash,expires_at
) values (
  'd6000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','Chillywood2025/chillywood-mobile',repeat('4',40),
  'cloudflare_workers','chillywood-level01-public-research-broker',
  'cognitive_public_research_broker','cognitive_public_research_broker',
  '17 * * * *','UTC',100,1,50000,7200,
  'chillywood-cognitive-retention-v1',repeat('2',64),
  repeat('5',64),repeat('6',64),repeat('7',64),
  transaction_timestamp()+interval '1 day'
);
set local session_replication_role = origin;

select is(
  public.cognitive_research_retention_processor_ready(
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production'
  ),
  false,
  'activation stays fail closed before the automatic processor heartbeat'
);

create temporary table retention_processor_result as
select public.cognitive_run_attested_research_retention_maintenance(
  'd6000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',
  case
    when date_trunc('hour',transaction_timestamp())+interval '17 minutes'
      <= transaction_timestamp()
    then date_trunc('hour',transaction_timestamp())+interval '17 minutes'
    else date_trunc('hour',transaction_timestamp())-interval '43 minutes'
  end,
  100,'retention-processor-test-token-0000000000000000'
) result;

select ok(
  (
    select (result->>'total_count')::integer = 0
      and (result->>'no_work')::boolean
      and not (result->>'replayed')::boolean
      and result->>'attestation_hash' = repeat('7',64)
    from retention_processor_result
  ),
  'first attested automatic maintenance run records a bounded no-work heartbeat'
);

select ok(
  public.cognitive_research_retention_processor_ready(
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production'
  ),
  'a fresh exact heartbeat satisfies the non-personal retention prerequisite'
);

select is(
  (
    public.cognitive_run_attested_research_retention_maintenance(
      'd6000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'shared','production',
      case
        when date_trunc('hour',transaction_timestamp())+interval '17 minutes'
          <= transaction_timestamp()
        then date_trunc('hour',transaction_timestamp())+interval '17 minutes'
        else date_trunc('hour',transaction_timestamp())-interval '43 minutes'
      end,
      100,'retention-processor-test-token-0000000000000000'
    )->>'replayed'
  )::boolean,
  true,
  'the same scheduled slot replays immutable evidence without a second run'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_research_maintenance_runs
    where task_id = 'd2000000-0000-4000-8000-000000000001'
  ),
  1,
  'schedule replay has exactly one underlying maintenance run'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_research_retention_processor_heartbeats
    where processor_attestation_id =
      'd6000000-0000-4000-8000-000000000001'
  ),
  1,
  'schedule replay has exactly one immutable heartbeat'
);

select throws_ok(
  $$update public.cognitive_research_retention_processor_heartbeats
    set no_work=false
    where processor_attestation_id =
      'd6000000-0000-4000-8000-000000000001'$$,
  '42501',
  'immutable_cognitive_evidence',
  'heartbeat evidence cannot be rewritten'
);

set local session_replication_role = replica;
insert into public.cognitive_research_retention_processor_revocations(
  id,execution_id,evaluator_proof_id,processor_attestation_id,
  task_id,project_id,platform,environment,reason_hash,event_hash
) values (
  'd7000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',repeat('8',64),repeat('9',64)
);
set local session_replication_role = origin;

select is(
  public.cognitive_research_retention_processor_ready(
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production'
  ),
  false,
  'revocation immediately closes the activation prerequisite'
);

select throws_ok(
  $$select public.cognitive_run_attested_research_retention_maintenance(
    'd6000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production',
    case
      when date_trunc('hour',transaction_timestamp())+interval '17 minutes'
        <= transaction_timestamp()
      then date_trunc('hour',transaction_timestamp())+interval '17 minutes'
      else date_trunc('hour',transaction_timestamp())-interval '43 minutes'
    end,
    100,'retention-processor-test-token-0000000000000000'
  )$$,
  'P0001',
  'attested_research_retention_maintenance_rejected',
  'revocation prevents replay and new automatic maintenance'
);

select throws_ok(
  $$select public.cognitive_run_attested_research_retention_maintenance(
    'd6000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production',
    date_trunc('hour',transaction_timestamp())-interval '43 minutes',
    99,'retention-processor-test-token-0000000000000000'
  )$$,
  'P0001',
  'attested_research_retention_maintenance_rejected',
  'wrong automatic batch contract fails closed'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches
    where switch_key in (
      'cognitive_research_enabled',
      'cognitive_memory_enabled',
      'cognitive_user_derived_memory_enabled'
    )
      and enabled
  ),
  0,
  'migration enables no research, memory, or user-derived-memory switch'
);

select * from finish();
rollback;
