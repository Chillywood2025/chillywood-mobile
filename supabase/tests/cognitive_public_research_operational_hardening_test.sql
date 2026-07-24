begin;
select no_plan();

insert into public.cognitive_projects(
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  'f1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off','none',false
);

insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,status,actor_identity,deadman_at,retention_until,
  data_class
) values (
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production','Chillywood2025/chillywood-mobile',
  'codex/cognitive-public-research-hardening-test',
  'public-research-hardening-test',repeat('1',64),'received',
  'research-test-fixture',transaction_timestamp()+interval '1 day',
  transaction_timestamp()+interval '30 days','operational_metadata'
);

insert into public.autonomous_system_emergency_states(
  system_id,status,reason,updated_at,metadata
) values (
  'product_intelligence_operator','active',
  'public research hardening fixture',transaction_timestamp(),
  '{"fixture":"public-research-hardening"}'::jsonb
) on conflict (system_id) do update set
  status=excluded.status,reason=excluded.reason,updated_at=excluded.updated_at,
  metadata=excluded.metadata;

insert into public.cognitive_service_identities(
  service_identity,credential_hash,status,issued_at,expires_at
) values
(
  'research_source_broker',
  encode(extensions.digest(
    convert_to('research-broker-test-token-0000000000000000','UTF8'),
    'sha256'
  ),'hex'),
  'active',transaction_timestamp(),transaction_timestamp()+interval '1 day'
),
(
  'independent_evaluation_judge',
  encode(extensions.digest(
    convert_to('research-evaluator-test-token-00000000000000','UTF8'),
    'sha256'
  ),'hex'),
  'active',transaction_timestamp(),transaction_timestamp()+interval '1 day'
)
on conflict (service_identity) do update set
  credential_hash=excluded.credential_hash,status='active',
  issued_at=excluded.issued_at,expires_at=excluded.expires_at,revoked_at=null;

insert into public.cognitive_retention_policy_states(
  task_id,project_id,platform,environment,policy_hash,policy_state,
  user_derived_memory_allowed,raw_user_reports_allowed,
  raw_private_messages_allowed,raw_private_media_allowed,
  raw_user_analytics_allowed,private_model_input_allowed
) values (
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production',repeat('2',64),
  'owner_counsel_decision_required',false,false,false,false,false,false
);

insert into public.cognitive_governance_switches(
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at
) values
(
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production','cognitive_research_enabled',true,
  'collective-governance-v1',
  'f0000000-0000-4000-8000-000000000001',transaction_timestamp()
),
(
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production','cognitive_memory_enabled',true,
  'collective-governance-v1',
  'f0000000-0000-4000-8000-000000000001',transaction_timestamp()
),
(
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production','cognitive_user_derived_memory_enabled',false,
  'collective-governance-v1',null,null
);

-- Seed one already-expired, non-personal source/claim pair. This bypasses no
-- runtime path: it is a postgres-only fixture used solely to prove one-way
-- expiry, idempotency, and immutable tombstone auditing.
insert into public.research_sources(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,
  status,summary,evidence_metadata,data_class,retention_until,
  authority_id,canonical_host,ownership_identity,source_reference_hash,
  canonical_url_hash,content_hash,publisher,publication_date,retrieval_date,
  freshness_deadline,source_type,is_primary,bounded_excerpt,citation_metadata,
  trusted_for_tool_execution
) values (
  'f3000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production','research-test-fixture',
  'expired-source-fixture','accepted','{}'::jsonb,'{}'::jsonb,
  'research_cache',transaction_timestamp()-interval '1 minute',
  'apple-docs','developer.apple.com','apple',
  encode(extensions.digest(convert_to(
    'https://developer.apple.com/documentation/expired','UTF8'
  ),'sha256'),'hex'),
  encode(extensions.digest(convert_to(
    'https://developer.apple.com/documentation/expired','UTF8'
  ),'sha256'),'hex'),
  encode(extensions.digest(convert_to(
    'Expired public behavior is documented.','UTF8'
  ),'sha256'),'hex'),
  'Apple',transaction_timestamp()-interval '2 days',
  transaction_timestamp()-interval '1 day',
  transaction_timestamp()+interval '1 hour','official_documentation',true,
  'Expired public behavior is documented.',
  jsonb_build_object(
    'title','Expired documentation fixture',
    'locator','https://developer.apple.com/documentation/expired'
  ),false
);

insert into public.research_retrieval_events(
  source_id,task_id,project_id,platform,environment,request_url_hash,
  resolved_address_hashes,response_hash,result
) select
  id,task_id,project_id,platform,environment,canonical_url_hash,
  array[repeat('3',64)],content_hash,'accepted'
from public.research_sources
where id='f3000000-0000-4000-8000-000000000001';

insert into public.research_claims(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,
  status,summary,evidence_metadata,data_class,retention_until,
  claim_hash,bounded_claim,confidence,category,freshness_deadline,
  contradiction_state,support_state
) values (
  'f4000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production','research-test-fixture',
  'expired-claim-fixture','pending','{}'::jsonb,'{}'::jsonb,
  'research_cache',transaction_timestamp()-interval '1 minute',
  encode(extensions.digest(convert_to(
    'Expired public behavior is documented.','UTF8'
  ),'sha256'),'hex'),
  'Expired public behavior is documented.',0.900,'technical',
  transaction_timestamp()+interval '1 hour','none','supported'
);
update public.research_claims set status='supported'
where id='f4000000-0000-4000-8000-000000000001';
insert into public.research_claim_sources(
  claim_id,source_id,task_id,project_id,platform,environment,relationship
) values (
  'f4000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production','supports'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.cognitive_record_public_research_source(uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,boolean,text,jsonb,text[],text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_derive_public_research_evaluation(uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_expire_public_research(uuid,uuid,public.cognitive_platform,public.cognitive_environment,integer,text)',
    'EXECUTE'
  ),
  'ordinary clients cannot call research broker, evaluator, or expiry mutations'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

select throws_ok(
  $$select public.cognitive_record_public_research_source(
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production','apple-docs','developer.apple.com',
    'official_documentation','Apple','apple',
    repeat('4',64),repeat('5',64),repeat('6',64),null,
    transaction_timestamp(),transaction_timestamp()+interval '1 day',
    true,'Official platform behavior is supported.',
    '{"title":"Official","locator":"https://developer.apple.com/documentation/example"}'::jsonb,
    array[repeat('7',64)],
    'research-broker-test-token-0000000000000000'
  )$$,
  'P0001','public_research_source_rejected',
  'publication date is mandatory at the database broker boundary'
);

create temporary table research_source_fixture(source_id uuid);
insert into research_source_fixture
select (result->>'source_id')::uuid
from (
  select public.cognitive_record_public_research_source(
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'shared','production','apple-docs','developer.apple.com',
    'official_documentation','Apple','apple',
    encode(extensions.digest(convert_to(
      'https://developer.apple.com/documentation/example','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'https://developer.apple.com/documentation/example','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'Official platform behavior is supported.','UTF8'
    ),'sha256'),'hex'),
    transaction_timestamp()-interval '1 day',
    transaction_timestamp(),transaction_timestamp()+interval '1 day',
    true,'Official platform behavior is supported.',
    jsonb_build_object(
      'title','Official documentation',
      'locator','https://developer.apple.com/documentation/example'
    ),
    array[repeat('8',64)],
    'research-broker-test-token-0000000000000000'
  ) result
) persisted;

select ok(
  (
    select publication_date is not null
      and retention_until<=created_at+interval '30 days'
      and citation_metadata->>'locator'=
        'https://developer.apple.com/documentation/example'
    from public.research_sources
    where id=(select source_id from research_source_fixture)
  ),
  'broker source persistence binds publication, locator, and 30-day retention'
);

select throws_ok(
  format(
    $$select public.cognitive_record_public_research_claim_evidence(
      'f2000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001',
      'shared','production','repository_architecture_ux',
      'A caller conclusion absent from the retrieved excerpt.','product',0.8,
      transaction_timestamp()+interval '1 day','none',array[%L::uuid],
      'research-broker-test-token-0000000000000000'
    )$$,
    (select source_id from research_source_fixture)
  ),
  'P0001','public_research_claim_provenance_rejected',
  'caller-authored support is rejected without extractive source evidence'
);

create temporary table research_claim_fixture(claim_id uuid);
insert into research_claim_fixture
select public.cognitive_record_public_research_claim_evidence(
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production','platform_policy_research',
  'Official platform behavior is supported.','technical',0.9,
  transaction_timestamp()+interval '1 day','none',
  array[(select source_id from research_source_fixture)],
  'research-broker-test-token-0000000000000000'
);

select ok(
  (
    select claim_hash=encode(extensions.digest(
      convert_to(bounded_claim,'UTF8'),'sha256'
    ),'hex')
      and retention_until<=created_at+interval '30 days'
      and status='supported' and support_state='supported'
    from public.research_claims
    where id=(select claim_id from research_claim_fixture)
  ),
  'claim hash, support state, and 30-day retention are database-derived'
);

create temporary table research_evaluation_fixture(evaluation_id uuid);
insert into research_evaluation_fixture
select public.cognitive_derive_public_research_evaluation(
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'shared','production','research_claim',
  (select claim_id from research_claim_fixture),
  'research-evaluator-test-token-00000000000000'
);

select ok(
  (
    select evaluation.evaluation_status='pass'
      and evaluation.evidence_hash=manifest.manifest_hash
      and manifest.derived_status='pass'
      and manifest.evidence_manifest->'reasons'='[]'::jsonb
    from public.cognitive_subject_evaluations evaluation
    join public.cognitive_subject_evidence_manifests manifest
      on manifest.id=evaluation.evidence_manifest_id
    where evaluation.id=(select evaluation_id from research_evaluation_fixture)
  ),
  'independent evaluation persists one database-derived proof hash and reasons'
);

select is(
  (
    public.cognitive_expire_public_research(
      'f2000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001',
      'shared','production',10,
      'research-broker-test-token-0000000000000000'
    )->>'total_count'
  )::integer,
  2,
  'bounded expiry tombstones the expired source and claim exactly once'
);

select ok(
  (
    select source.erased_at is not null
      and source.status='expired'
      and source.bounded_excerpt='[expired public research]'
      and claim.erased_at is not null
      and claim.status='stale'
      and claim.bounded_claim='[expired research claim]'
      and (
        select count(*) from public.cognitive_research_retention_events
        where target_id in (source.id,claim.id)
      )=2
      and (
        select count(*) from public.cognitive_erasure_events
        where target_id in (source.id,claim.id)
      )=2
    from public.research_sources source
    cross join public.research_claims claim
    where source.id='f3000000-0000-4000-8000-000000000001'
      and claim.id='f4000000-0000-4000-8000-000000000001'
  ),
  'expiry removes bounded text and preserves immutable central audit events'
);

select is(
  (
    public.cognitive_expire_public_research(
      'f2000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001',
      'shared','production',10,
      'research-broker-test-token-0000000000000000'
    )->>'total_count'
  )::integer,
  0,
  'expiry replay is idempotent'
);

reset role;
select throws_ok(
  $$update public.cognitive_research_retention_events
    set event_type='expired_tombstone'$$,
  '42501','immutable_cognitive_evidence',
  'retention events are immutable'
);

select * from finish();
rollback;
