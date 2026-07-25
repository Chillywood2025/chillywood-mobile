begin;
select no_plan();

select has_function(
  'public',
  'governance_research_retention_activation_hash',
  array[
    'text','text','text','text','text','timestamp with time zone',
    'timestamp with time zone'
  ],
  'v2 activation hash binds provider verification and expiry timestamps'
);

select ok(
  lower(pg_get_functiondef(
    'public.cognitive_public_research_runtime_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  )) like '%cognitive_research_retention_processor_ready(%'
  and lower(pg_get_functiondef(
    'public.cognitive_public_research_runtime_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  )) like '%for share%',
  'the existing live-write readiness function retains locked checks and adds retention readiness'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_record_public_research_source_v2(uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,text,text,text,text,text,timestamptz,jsonb,timestamptz,timestamptz,boolean,text,jsonb,text[],text)'
      ::regprocedure
  ) like '%cognitive_public_research_runtime_ready(%'
  and pg_get_functiondef(
    'public.cognitive_record_public_research_claim_evidence_internal(uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,numeric,timestamptz,text,uuid[],text)'
      ::regprocedure
  ) like '%cognitive_public_research_runtime_ready(%'
  and pg_get_functiondef(
    'public.cognitive_record_public_research_contradiction_detection(uuid,uuid,public.cognitive_platform,public.cognitive_environment,uuid,uuid,text,text)'
      ::regprocedure
  ) like '%cognitive_public_research_runtime_ready(%'
  and pg_get_functiondef(
    'public.cognitive_resolve_public_research_contradiction(uuid,uuid,public.cognitive_platform,public.cognitive_environment,uuid,uuid,text,text)'
      ::regprocedure
  ) like '%cognitive_public_research_runtime_ready(%',
  'source, claim, contradiction detection, and contradiction resolution share the hardened live boundary'
);

select ok(
  (
    select count(*) = 5
      and count(distinct trigger.tgrelid) = 5
      and bool_and(trigger.tgrelid in (
        'public.research_sources'::regclass,
        'public.research_claims'::regclass,
        'public.cognitive_subject_evidence_manifests'::regclass,
        'public.research_contradictions'::regclass,
        'public.cognitive_research_contradiction_events'::regclass
      ))
    from pg_catalog.pg_trigger trigger
    where trigger.tgname in (
      'cognitive_research_source_live_write_barrier',
      'cognitive_research_claim_live_write_barrier',
      'cognitive_research_evaluation_live_write_barrier',
      'cognitive_research_contradiction_live_write_barrier',
      'cognitive_research_contradiction_event_live_write_barrier'
    )
      and not trigger.tgisinternal
      and trigger.tgenabled = 'O'
  )
  and pg_get_functiondef(
    'public.cognitive_research_live_write_lock_and_assert(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) like '%pg_advisory_xact_lock(%'
  and pg_get_functiondef(
    'public.cognitive_research_live_write_lock_and_assert(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) like '%clock_timestamp()%'
  and pg_get_functiondef(
    'public.cognitive_research_retention_processor_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) like '%clock_timestamp()%'
  and pg_get_functiondef(
    'public.cognitive_research_retention_processor_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) not like '%transaction_timestamp()%'
  and pg_get_functiondef(
    'public.governance_revoke_research_retention_activation(uuid,uuid,text,text,text)'
      ::regprocedure
  ) like '%cognitive_research_retention_scope_lock_key(%',
  'five exact mutation barriers and revocation share one wall-clock scope lock domain'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.cognitive_research_retention_scope_lock_key(uuid,uuid,public.cognitive_platform,public.cognitive_environment)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.cognitive_research_live_write_lock_and_assert(uuid,uuid,public.cognitive_platform,public.cognitive_environment)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.governance_revoke_research_retention_activation(uuid,uuid,text,text,text)',
    'execute'
  ),
  'new internal lock helpers are closed while existing governance grants remain unchanged'
);

select isnt(
  public.governance_research_retention_activation_hash(
    repeat('1',40),repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),transaction_timestamp(),
    transaction_timestamp()+interval '30 minutes'
  ),
  public.governance_research_retention_activation_hash(
    repeat('1',40),repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),transaction_timestamp()+interval '1 second',
    transaction_timestamp()+interval '30 minutes'
  ),
  'provider verification timestamp drift changes the exact target hash'
);

select isnt(
  public.governance_research_retention_activation_hash(
    repeat('1',40),repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),transaction_timestamp(),
    transaction_timestamp()+interval '30 minutes'
  ),
  public.governance_research_retention_activation_hash(
    repeat('1',40),repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),transaction_timestamp(),
    transaction_timestamp()+interval '31 minutes'
  ),
  'attestation expiry drift changes the exact target hash'
);

select ok(
  pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%version_state_value.state <> ''completed''%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%approval_value.current_state <> ''completed''%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%proof_value.execution_receipt_hash <>%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%p_expires_at > version_value.expires_at%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%emergency_value.status <> ''active''%',
  'persistence includes current approval, receipt, Owner-window, and emergency checks'
);

select ok(
  pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%p_provider_verified_at >= decision_value.created_at%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%p_provider_verified_at >= approval_value.created_at%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%p_provider_verified_at >= execution_value.claimed_at%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%p_expires_at <= p_provider_verified_at%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%clock_timestamp()%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) not like '%p_provider_verified_at < execution_value.claimed_at%',
  'provider evidence is strictly earlier than decision, approval, and claim, expiry follows verification, and persistence uses wall-clock time'
);

select ok(
  (
    select pg_get_constraintdef(constraint_row.oid)
      like '%expires_at > provider_verified_at%'
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conname =
      'cognitive_research_backup_retention_temporal_v3_check'
      and constraint_row.conrelid =
        'public.cognitive_research_backup_retention_attestations'::regclass
  ),
  'the stored provider attestation enforces expiry after provider verification'
);

insert into public.cognitive_projects(
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  'e1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off','none',false
);

insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,status,actor_identity,deadman_at,retention_until,
  data_class
) values (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','Chillywood2025/chillywood-mobile',
  'codex/research-retention-p1-fixture',
  'research-retention-p1-fixture',repeat('1',64),'received',
  'research-retention-p1-fixture',
  transaction_timestamp()+interval '1 day',
  transaction_timestamp()+interval '30 days','operational_metadata'
);

insert into public.autonomous_system_emergency_states(
  system_id,status,reason,updated_at,metadata
) values (
  'product_intelligence_operator','active',
  'research retention P1 fixture',transaction_timestamp(),
  '{"fixture":"research-retention-p1"}'::jsonb
) on conflict (system_id) do update set
  status=excluded.status,
  reason=excluded.reason,
  updated_at=excluded.updated_at,
  metadata=excluded.metadata;

insert into public.cognitive_retention_policy_states(
  task_id,project_id,platform,environment,policy_hash,policy_state,
  user_derived_memory_allowed,raw_user_reports_allowed,
  raw_private_messages_allowed,raw_private_media_allowed,
  raw_user_analytics_allowed,private_model_input_allowed
) values (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production',repeat('e',64),
  'owner_counsel_decision_required',false,false,false,false,false,false
);

insert into public.cognitive_service_identities(
  service_identity,credential_hash,status,issued_at,expires_at
) values
(
  'research_source_broker',
  encode(extensions.digest(convert_to(
    'research-retention-broker-token-0000000000','UTF8'
  ),'sha256'),'hex'),
  'active',transaction_timestamp(),transaction_timestamp()+interval '1 day'
),
(
  'independent_evaluation_judge',
  encode(extensions.digest(convert_to(
    'research-retention-evaluator-token-000000','UTF8'
  ),'sha256'),'hex'),
  'active',transaction_timestamp(),transaction_timestamp()+interval '1 day'
)
on conflict (service_identity) do update set
  credential_hash=excluded.credential_hash,
  status='active',
  issued_at=excluded.issued_at,
  expires_at=excluded.expires_at,
  revoked_at=null;

create function pg_temp.all_research_live_entrypoints_reject(
  p_task_id uuid,
  p_project_id uuid
)
returns boolean
language plpgsql
as $$
declare
  bounded_excerpt_value text := 'bounded public research fixture';
  locator_value text := 'https://developer.apple.com/test/research-retention';
  publication_date_value timestamptz :=
    transaction_timestamp()-interval '1 day';
  provenance_semantic_value text := 'published:research-retention-fixture';
  rejected_count integer := 0;
begin
  begin
    perform public.cognitive_record_public_research_source_v2(
      p_task_id,p_project_id,'shared','production',
      'apple-docs','developer.apple.com',
      'official_documentation','Apple','apple',
      encode(extensions.digest(convert_to(
        'apple-docs-research-retention-fixture','UTF8'
      ),'sha256'),'hex'),
      encode(extensions.digest(convert_to(
        locator_value,'UTF8'
      ),'sha256'),'hex'),
      encode(extensions.digest(convert_to(
        bounded_excerpt_value,'UTF8'
      ),'sha256'),'hex'),
      publication_date_value,
      jsonb_build_object(
        'mode','published_metadata',
        'machineValue',publication_date_value::text,
        'semanticIdentity',provenance_semantic_value,
        'evidenceHash',encode(extensions.digest(convert_to(concat_ws(
          '|','published_metadata',publication_date_value::text,
          provenance_semantic_value
        ),'UTF8'),'sha256'),'hex')
      ),
      transaction_timestamp(),transaction_timestamp()+interval '1 day',
      true,bounded_excerpt_value,
      jsonb_build_object('title','fixture','locator',locator_value),
      array[repeat('5',64)],
      'research-retention-broker-token-0000000000'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'public_research_source_v2_rejected' then raise; end if;
    rejected_count := rejected_count + 1;
  end;

  begin
    perform public.cognitive_record_public_research_claim_evidence(
      p_task_id,p_project_id,'shared','production',
      'platform_policy_research','bounded claim','technical',0.9,
      transaction_timestamp()+interval '1 day','none',
      array['01000000-0000-4000-8000-000000000001'::uuid],
      'research-retention-broker-token-0000000000'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'public_research_claim_evidence_rejected' then raise; end if;
    rejected_count := rejected_count + 1;
  end;

  begin
    perform public.cognitive_derive_public_research_evaluation(
      p_task_id,p_project_id,'shared','production','research_claim',
      '01000000-0000-4000-8000-000000000002',
      'research-retention-evaluator-token-000000'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'public_research_evaluation_rejected' then raise; end if;
    rejected_count := rejected_count + 1;
  end;

  begin
    perform public.cognitive_record_public_research_contradiction_detection(
      p_task_id,p_project_id,'shared','production',
      '01000000-0000-4000-8000-000000000003',
      '01000000-0000-4000-8000-000000000004',
      'bounded contradiction evidence',
      'research-retention-broker-token-0000000000'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'research_contradiction_detection_rejected' then raise; end if;
    rejected_count := rejected_count + 1;
  end;

  begin
    perform public.cognitive_resolve_public_research_contradiction(
      p_task_id,p_project_id,'shared','production',
      '01000000-0000-4000-8000-000000000005',
      '01000000-0000-4000-8000-000000000006',
      'bounded resolution evidence',
      'research-retention-evaluator-token-000000'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'research_contradiction_resolution_rejected' then raise; end if;
    rejected_count := rejected_count + 1;
  end;

  return rejected_count = 5;
end;
$$;

set local session_replication_role=replica;
insert into public.cognitive_governance_switches(
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at
) values
(
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','cognitive_research_enabled',true,
  'collective-governance-v1',
  'e0000000-0000-4000-8000-000000000001',transaction_timestamp()
),
(
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','cognitive_memory_enabled',true,
  'collective-governance-v1',
  'e0000000-0000-4000-8000-000000000001',transaction_timestamp()
),
(
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','cognitive_user_derived_memory_enabled',false,
  'collective-governance-v1',null,null
);

insert into public.cognitive_research_backup_retention_attestations(
  id,execution_id,evaluator_proof_id,task_id,project_id,platform,environment,
  provider,provider_plan,backup_state,backup_window_days,restore_available,
  point_in_time_recovery,restored_data_requires_tombstone_replay,
  provider_evidence_hash,provider_verified_at,expires_at
) values (
  'e3000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
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
  'e6000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','Chillywood2025/chillywood-mobile',repeat('4',40),
  'cloudflare_workers','chillywood-level01-public-research-broker',
  'cognitive_public_research_broker','cognitive_public_research_broker',
  '17 * * * *','UTC',100,1,50000,7200,
  'chillywood-cognitive-retention-v1',repeat('e',64),
  repeat('5',64),repeat('6',64),repeat('7',64),
  transaction_timestamp()+interval '1 day'
);

insert into public.cognitive_research_retention_processor_heartbeats(
  id,processor_attestation_id,maintenance_run_id,task_id,project_id,
  platform,environment,scheduled_at,source_count,claim_count,total_count,
  no_work,attestation_hash,event_hash,completed_at,created_at
) values (
  'e7000000-0000-4000-8000-000000000001',
  'e6000000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production',
  case
    when date_trunc('hour',transaction_timestamp())+interval '17 minutes'
      <= transaction_timestamp()
    then date_trunc('hour',transaction_timestamp())+interval '17 minutes'
    else date_trunc('hour',transaction_timestamp())-interval '43 minutes'
  end,
  0,0,0,true,repeat('7',64),repeat('8',64),
  transaction_timestamp(),transaction_timestamp()
);
set local session_replication_role=origin;

select ok(
  public.cognitive_public_research_runtime_ready(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production'
  ),
  'fresh current retention evidence permits the shared live-write boundary'
);

set local session_replication_role=replica;
update public.cognitive_research_retention_processor_heartbeats
set
  completed_at=transaction_timestamp()-interval '3 hours',
  created_at=transaction_timestamp()-interval '3 hours',
  scheduled_at=case
    when date_trunc('hour',transaction_timestamp()-interval '3 hours')
      +interval '17 minutes'
      <= transaction_timestamp()-interval '3 hours'
    then date_trunc('hour',transaction_timestamp()-interval '3 hours')
      +interval '17 minutes'
    else date_trunc('hour',transaction_timestamp()-interval '3 hours')
      -interval '43 minutes'
  end
where id='e7000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

select is(
  public.cognitive_public_research_runtime_ready(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production'
  ),
  false,
  'a stale retention heartbeat blocks every shared live-write entrypoint'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select ok(
  pg_temp.all_research_live_entrypoints_reject(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001'
  ),
  'a stale heartbeat is rejected through all five effective research entrypoints'
);
reset role;

set local session_replication_role=replica;
update public.cognitive_research_retention_processor_heartbeats
set
  completed_at=transaction_timestamp(),
  created_at=transaction_timestamp(),
  scheduled_at=case
    when date_trunc('hour',transaction_timestamp())+interval '17 minutes'
      <= transaction_timestamp()
    then date_trunc('hour',transaction_timestamp())+interval '17 minutes'
    else date_trunc('hour',transaction_timestamp())-interval '43 minutes'
  end
where id='e7000000-0000-4000-8000-000000000001';
update public.cognitive_research_retention_processor_attestations
set
  created_at=transaction_timestamp()-interval '2 hours',
  expires_at=transaction_timestamp()-interval '1 minute'
where id='e6000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

select is(
  public.cognitive_public_research_runtime_ready(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production'
  ),
  false,
  'an expired processor attestation blocks every shared live-write entrypoint'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select ok(
  pg_temp.all_research_live_entrypoints_reject(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001'
  ),
  'an expired processor is rejected through all five effective research entrypoints'
);
reset role;

set local session_replication_role=replica;
update public.cognitive_research_retention_processor_attestations
set
  created_at=transaction_timestamp(),
  expires_at=transaction_timestamp()+interval '1 day'
where id='e6000000-0000-4000-8000-000000000001';
insert into public.cognitive_research_retention_processor_revocations(
  id,execution_id,evaluator_proof_id,processor_attestation_id,
  task_id,project_id,platform,environment,reason_hash,event_hash
) values (
  'e9000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000001',
  'eb000000-0000-4000-8000-000000000001',
  'e6000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production',repeat('9',64),repeat('a',64)
);
set local session_replication_role=origin;

select is(
  public.cognitive_public_research_runtime_ready(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production'
  ),
  false,
  'revocation immediately blocks every shared live-write entrypoint'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select ok(
  pg_temp.all_research_live_entrypoints_reject(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001'
  ),
  'a revoked processor is rejected through all five effective research entrypoints'
);
reset role;

-- Build one exact completed Owner/worker/evaluator fixture. Foreign-key trigger
-- checks are disabled only for fixture construction; the function under test
-- runs normally as service_role and inserts through all real constraints.
create temporary table retention_activation_fixture as
select
  transaction_timestamp()-interval '12 minutes' as provider_verified_at,
  transaction_timestamp()+interval '30 minutes' as expires_at;
alter table retention_activation_fixture add column activation_hash text;
alter table retention_activation_fixture
  add column late_provider_verified_at timestamptz;
alter table retention_activation_fixture add column late_activation_hash text;
alter table retention_activation_fixture add column invalid_expires_at timestamptz;
alter table retention_activation_fixture
  add column invalid_expiry_activation_hash text;
update retention_activation_fixture set activation_hash =
  public.governance_research_retention_activation_hash(
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    repeat('e',64),provider_verified_at,expires_at
  ),
  late_provider_verified_at =
    transaction_timestamp()-interval '7 minutes',
  invalid_expires_at =
    provider_verified_at-interval '1 second';
update retention_activation_fixture set
  late_activation_hash =
    public.governance_research_retention_activation_hash(
      repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
      repeat('e',64),late_provider_verified_at,expires_at
    ),
  invalid_expiry_activation_hash =
    public.governance_research_retention_activation_hash(
      repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
      repeat('e',64),provider_verified_at,invalid_expires_at
    );
grant select on retention_activation_fixture to service_role;

insert into public.platform_role_memberships(user_id,email,role,status)
values (
  'ec000000-0000-4000-8000-000000000001',null,'owner','active'
);

set local session_replication_role=replica;
insert into public.governance_decision_manifests(
  id,deliberation_id,evidence_packet_id,selected_proposal_id,task_id,
  project_id,platform,environment,decision_key,source_commit,
  architecture_graph_digest,evidence_manifest_hash,research_claim_hashes,
  selected_option_hash,rejected_option_hashes,council_attestation_hash,
  votes_hash,vetoes_hash,dissent_hash,stakeholder_impact_hash,risk_level,
  required_test_ids,capability_scope_hash,budget_hash,maximum_executions,
  rollback_hash,decision_hash,status,expires_at,finalized_at,created_at
) select
  'ed000000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000002',
  'ed000000-0000-4000-8000-000000000003',
  'ed000000-0000-4000-8000-000000000004',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','research-retention-p1-decision',repeat('a',40),
  repeat('1',64),repeat('2',64),'{}'::text[],activation_hash,'{}'::text[],
  repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64),
  repeat('7',64),'low',array['research-retention-p1-test'],
  repeat('8',64),repeat('1',64),1,repeat('f',64),repeat('4',64),
  'finalized',transaction_timestamp()+interval '1 hour',
  transaction_timestamp()-interval '10 minutes 30 seconds',
  transaction_timestamp()-interval '11 minutes'
from retention_activation_fixture;

insert into public.governance_owner_approval_records(
  id,decision_manifest_id,task_id,project_id,platform,environment,
  approval_key,objective_hash,owner_user_id,current_version,current_state,
  maximum_executions,executions_claimed,executions_completed,approval_hash,
  created_at,updated_at
) values (
  'ee000000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','research-retention-p1-approval',repeat('9',64),
  'ec000000-0000-4000-8000-000000000001',1,'completed',1,1,1,
  repeat('3',64),transaction_timestamp()-interval '10 minutes',
  transaction_timestamp()-interval '2 minutes'
);

insert into public.governance_owner_approval_versions(
  id,approval_record_id,decision_manifest_id,task_id,project_id,
  platform,environment,version_number,prior_version_id,owner_user_id,
  owner_identity_hash,decision_manifest_hash,plan_snapshot_hash,
  source_commit,architecture_graph_digest,approval_scope_hash,objective_hash,
  repository_full_name,branch_name,provider,operation,target_resource_hash,
  path_scope_hashes,table_scope_hashes,function_scope_hashes,budget_hash,
  maximum_cost,maximum_calls,maximum_bytes,maximum_executions,tests_hash,
  required_test_ids,evaluator_requirement_hash,rollback_hash,approval_hash,
  material_delta,approved_at,valid_from,expires_at,created_at
) select
  'ef000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production',1,null,
  'ec000000-0000-4000-8000-000000000001',repeat('7',64),
  repeat('4',64),repeat('2',64),repeat('a',40),repeat('1',64),
  repeat('8',64),repeat('9',64),'Chillywood2025/chillywood-mobile',
  'codex/research-retention-p1-fixture','public_research',
  'public_research_ingest',activation_hash,'{}'::text[],'{}'::text[],
  '{}'::text[],repeat('1',64),0,1,4096,1,repeat('a',64),
  array['research-retention-p1-test'],repeat('5',64),repeat('f',64),
  repeat('3',64),false,transaction_timestamp()-interval '9 minutes 30 seconds',
  transaction_timestamp()-interval '9 minutes',
  transaction_timestamp()+interval '45 minutes',
  transaction_timestamp()-interval '9 minutes 30 seconds'
from retention_activation_fixture;

insert into public.governance_owner_approval_version_states(
  approval_version_id,approval_record_id,task_id,project_id,platform,
  environment,state,maximum_executions,executions_claimed,
  executions_completed,completed_at
) values (
  'ef000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','completed',1,1,1,
  transaction_timestamp()-interval '2 minutes'
);

insert into public.governance_approved_action_executions(
  id,approval_record_id,approval_version_id,task_id,project_id,
  repository_full_name,branch_name,platform,environment,provider,operation,
  claim_sequence,state,service_identity,service_identity_hash,
  worker_assertion_hash,decision_manifest_hash,plan_snapshot_hash,
  approval_hash,target_resource_hash,budget_hash,tests_hash,
  evaluator_requirement_hash,rollback_hash,execution_receipt_hash,
  evaluator_proof_hash,claimed_at,began_at,completed_at,updated_at
) select
  'f0000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000001',
  'ef000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'codex/research-retention-p1-fixture','shared','production',
  'public_research','public_research_ingest',1,'completed',
  'cognitive_approved_action_worker',repeat('8',64),repeat('9',64),
  repeat('4',64),repeat('2',64),repeat('3',64),activation_hash,
  repeat('1',64),repeat('a',64),repeat('5',64),repeat('f',64),
  repeat('6',64),repeat('7',64),
  transaction_timestamp()-interval '8 minutes',
  transaction_timestamp()-interval '7 minutes',
  transaction_timestamp()-interval '2 minutes',
  transaction_timestamp()-interval '2 minutes'
from retention_activation_fixture;

insert into public.governance_approved_execution_evaluator_proofs(
  id,execution_id,approval_record_id,approval_version_id,task_id,project_id,
  platform,environment,evaluator_identity,evaluator_identity_hash,
  execution_receipt_hash,evaluator_proof_hash,evaluator_requirement_hash,
  verdict,created_at
) values (
  'f1000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000001',
  'ef000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','cognitive_independent_evaluator',repeat('9',64),
  repeat('6',64),repeat('7',64),repeat('5',64),'passed',
  transaction_timestamp()-interval '3 minutes'
);

insert into public.governance_two_party_service_assertions(
  service_identity,assertion_hash,allowed_operations,registered_by,
  status,issued_at,expires_at
) values (
  'cognitive_approved_action_worker',
  encode(extensions.digest(convert_to(
    'research-retention-worker-assertion-000000000000','UTF8'
  ),'sha256'),'hex'),
  array['public_research_ingest'],
  'ec000000-0000-4000-8000-000000000001','active',
  transaction_timestamp()-interval '10 minutes',
  transaction_timestamp()+interval '1 day'
) on conflict (service_identity) do update set
  assertion_hash=excluded.assertion_hash,
  allowed_operations=excluded.allowed_operations,
  registered_by=excluded.registered_by,
  status='active',
  issued_at=excluded.issued_at,
  expires_at=excluded.expires_at,
  revoked_at=null,
  revoked_by=null,
  revocation_hash=null;
set local session_replication_role=origin;

select ok(
  (
    select
      fixture.provider_verified_at < decision.created_at
      and fixture.provider_verified_at < decision.finalized_at
      and fixture.provider_verified_at < approval.created_at
      and fixture.provider_verified_at < version.approved_at
      and fixture.provider_verified_at < version.created_at
      and fixture.provider_verified_at < execution.claimed_at
      and fixture.expires_at > fixture.provider_verified_at
    from retention_activation_fixture fixture
    join public.governance_decision_manifests decision
      on decision.id='ed000000-0000-4000-8000-000000000001'
    join public.governance_owner_approval_records approval
      on approval.id='ee000000-0000-4000-8000-000000000001'
    join public.governance_owner_approval_versions version
      on version.id='ef000000-0000-4000-8000-000000000001'
    join public.governance_approved_action_executions execution
      on execution.id='f0000000-0000-4000-8000-000000000001'
  ),
  'the positive fixture collects provider evidence before decision, Owner approval, and execution claim'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

select throws_ok(
  $$select public.governance_persist_research_retention_activation(
    'f0000000-0000-4000-8000-000000000001',
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    (select provider_verified_at+interval '1 second'
     from retention_activation_fixture),
    repeat('e',64),(select expires_at from retention_activation_fixture),
    'cognitive_approved_action_worker',
    'research-retention-worker-assertion-000000000000'
  )$$,
  'P0001',
  'research_retention_activation_attestation_rejected',
  'caller drift in provider verification time is rejected by target binding'
);

select throws_ok(
  $$select public.governance_persist_research_retention_activation(
    'f0000000-0000-4000-8000-000000000001',
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    (select provider_verified_at from retention_activation_fixture),
    repeat('e',64),(select expires_at+interval '1 second'
     from retention_activation_fixture),
    'cognitive_approved_action_worker',
    'research-retention-worker-assertion-000000000000'
  )$$,
  'P0001',
  'research_retention_activation_attestation_rejected',
  'caller drift in attestation expiry is rejected by target binding'
);

reset role;
set local session_replication_role=replica;
update public.governance_decision_manifests
set selected_option_hash=(
  select late_activation_hash from retention_activation_fixture
)
where id='ed000000-0000-4000-8000-000000000001';
update public.governance_owner_approval_versions
set target_resource_hash=(
  select late_activation_hash from retention_activation_fixture
)
where id='ef000000-0000-4000-8000-000000000001';
update public.governance_approved_action_executions
set target_resource_hash=(
  select late_activation_hash from retention_activation_fixture
)
where id='f0000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role service_role;
select throws_ok(
  $$select public.governance_persist_research_retention_activation(
    'f0000000-0000-4000-8000-000000000001',
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    (select late_provider_verified_at from retention_activation_fixture),
    repeat('e',64),(select expires_at from retention_activation_fixture),
    'cognitive_approved_action_worker',
    'research-retention-worker-assertion-000000000000'
  )$$,
  'P0001',
  'research_retention_activation_attestation_rejected',
  'hash-bound provider evidence collected after the execution claim is rejected'
);

reset role;
set local session_replication_role=replica;
update public.governance_decision_manifests
set selected_option_hash=(
  select invalid_expiry_activation_hash from retention_activation_fixture
)
where id='ed000000-0000-4000-8000-000000000001';
update public.governance_owner_approval_versions
set target_resource_hash=(
  select invalid_expiry_activation_hash from retention_activation_fixture
)
where id='ef000000-0000-4000-8000-000000000001';
update public.governance_approved_action_executions
set target_resource_hash=(
  select invalid_expiry_activation_hash from retention_activation_fixture
)
where id='f0000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role service_role;
select throws_ok(
  $$select public.governance_persist_research_retention_activation(
    'f0000000-0000-4000-8000-000000000001',
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    (select provider_verified_at from retention_activation_fixture),
    repeat('e',64),(select invalid_expires_at
     from retention_activation_fixture),
    'cognitive_approved_action_worker',
    'research-retention-worker-assertion-000000000000'
  )$$,
  'P0001',
  'research_retention_activation_attestation_rejected',
  'hash-bound expiry at or before provider verification is rejected'
);

reset role;
set local session_replication_role=replica;
update public.governance_decision_manifests
set selected_option_hash=(
  select activation_hash from retention_activation_fixture
)
where id='ed000000-0000-4000-8000-000000000001';
update public.governance_owner_approval_versions
set target_resource_hash=(
  select activation_hash from retention_activation_fixture
)
where id='ef000000-0000-4000-8000-000000000001';
update public.governance_approved_action_executions
set target_resource_hash=(
  select activation_hash from retention_activation_fixture
)
where id='f0000000-0000-4000-8000-000000000001';
update public.governance_approved_execution_evaluator_proofs
set execution_receipt_hash=repeat('0',64)
where id='f1000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role service_role;
select throws_ok(
  $$select public.governance_persist_research_retention_activation(
    'f0000000-0000-4000-8000-000000000001',
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    (select provider_verified_at from retention_activation_fixture),
    repeat('e',64),(select expires_at from retention_activation_fixture),
    'cognitive_approved_action_worker',
    'research-retention-worker-assertion-000000000000'
  )$$,
  'P0001',
  'research_retention_activation_attestation_rejected',
  'mismatched evaluator receipt is rejected'
);

reset role;
set local session_replication_role=replica;
update public.governance_approved_execution_evaluator_proofs
set execution_receipt_hash=repeat('6',64)
where id='f1000000-0000-4000-8000-000000000001';
update public.governance_owner_approval_records
set current_state='expired'
where id='ee000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role service_role;
select throws_ok(
  $$select public.governance_persist_research_retention_activation(
    'f0000000-0000-4000-8000-000000000001',
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    (select provider_verified_at from retention_activation_fixture),
    repeat('e',64),(select expires_at from retention_activation_fixture),
    'cognitive_approved_action_worker',
    'research-retention-worker-assertion-000000000000'
  )$$,
  'P0001',
  'research_retention_activation_attestation_rejected',
  'expired Owner approval state is rejected'
);

reset role;
set local session_replication_role=replica;
update public.governance_owner_approval_records
set current_state='completed'
where id='ee000000-0000-4000-8000-000000000001';
update public.governance_owner_approval_version_states
set state='superseded'
where approval_version_id='ef000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role service_role;
select throws_ok(
  $$select public.governance_persist_research_retention_activation(
    'f0000000-0000-4000-8000-000000000001',
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    (select provider_verified_at from retention_activation_fixture),
    repeat('e',64),(select expires_at from retention_activation_fixture),
    'cognitive_approved_action_worker',
    'research-retention-worker-assertion-000000000000'
  )$$,
  'P0001',
  'research_retention_activation_attestation_rejected',
  'superseded approval version is rejected'
);

reset role;
set local session_replication_role=replica;
update public.governance_owner_approval_version_states
set state='completed'
where approval_version_id='ef000000-0000-4000-8000-000000000001';
update public.governance_approved_action_executions
set completed_at=transaction_timestamp()-interval '10 minutes'
where id='f0000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role service_role;
select throws_ok(
  $$select public.governance_persist_research_retention_activation(
    'f0000000-0000-4000-8000-000000000001',
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    (select provider_verified_at from retention_activation_fixture),
    repeat('e',64),(select expires_at from retention_activation_fixture),
    'cognitive_approved_action_worker',
    'research-retention-worker-assertion-000000000000'
  )$$,
  'P0001',
  'research_retention_activation_attestation_rejected',
  'execution completed outside the approved validity window is rejected'
);

reset role;
set local session_replication_role=replica;
update public.governance_approved_action_executions
set completed_at=transaction_timestamp()-interval '2 minutes'
where id='f0000000-0000-4000-8000-000000000001';
update public.autonomous_system_emergency_states
set status='emergency_stop'
where system_id='product_intelligence_operator';
set local session_replication_role=origin;
set local role service_role;
select throws_ok(
  $$select public.governance_persist_research_retention_activation(
    'f0000000-0000-4000-8000-000000000001',
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    (select provider_verified_at from retention_activation_fixture),
    repeat('e',64),(select expires_at from retention_activation_fixture),
    'cognitive_approved_action_worker',
    'research-retention-worker-assertion-000000000000'
  )$$,
  'P0001',
  'research_retention_activation_attestation_rejected',
  'emergency stop rejects retention activation persistence'
);

reset role;
set local session_replication_role=replica;
update public.autonomous_system_emergency_states
set status='active'
where system_id='product_intelligence_operator';
set local session_replication_role=origin;
set local role service_role;

create temporary table retention_activation_result as
select public.governance_persist_research_retention_activation(
  'f0000000-0000-4000-8000-000000000001',
  repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
  (select provider_verified_at from retention_activation_fixture),
  repeat('e',64),(select expires_at from retention_activation_fixture),
  'cognitive_approved_action_worker',
  'research-retention-worker-assertion-000000000000'
) result;

select ok(
  (
    select result->>'attestation_hash'=
      (select activation_hash from retention_activation_fixture)
      and (result->>'provider_verified_at')::timestamptz=
        (select provider_verified_at from retention_activation_fixture)
      and (result->>'expires_at')::timestamptz=
        (select expires_at from retention_activation_fixture)
    from retention_activation_result
  ),
  'one current exact Owner/worker/evaluator chain persists timestamp-bound retention evidence'
);

select throws_ok(
  $$select public.governance_persist_research_retention_activation(
    'f0000000-0000-4000-8000-000000000001',
    repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),
    (select provider_verified_at from retention_activation_fixture),
    repeat('e',64),(select expires_at from retention_activation_fixture),
    'cognitive_approved_action_worker',
    'research-retention-worker-assertion-000000000000'
  )$$,
  'P0001',
  'research_retention_activation_attestation_rejected',
  'the completed activation execution cannot be replayed'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.cognitive_research_retention_processor_attestations
    where execution_id='f0000000-0000-4000-8000-000000000001'
  ),
  1,
  'the valid activation persists exactly one processor attestation'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches
    where enabled
      and switch_key in (
        'cognitive_research_enabled',
        'cognitive_memory_enabled',
        'cognitive_scheduled_level01_enabled'
      )
      and task_id<>'e2000000-0000-4000-8000-000000000001'
  ),
  0,
  'hardening migration enables no live switch or schedule'
);

select * from finish();
rollback;
