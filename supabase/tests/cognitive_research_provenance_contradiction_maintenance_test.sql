begin;
select no_plan();

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
  'codex/research-chain-test','research-chain-test',repeat('1',64),
  'received','research-chain-test',
  transaction_timestamp()+interval '1 day',
  transaction_timestamp()+interval '30 days','operational_metadata'
);
insert into public.autonomous_system_emergency_states(
  system_id,status,reason,updated_at,metadata
) values (
  'product_intelligence_operator','active','research chain fixture',
  transaction_timestamp(),'{"fixture":"research-chain"}'::jsonb
) on conflict (system_id) do update set
  status=excluded.status,reason=excluded.reason,updated_at=excluded.updated_at,
  metadata=excluded.metadata;
insert into public.cognitive_service_identities(
  service_identity,credential_hash,status,issued_at,expires_at
) values
(
  'research_source_broker',
  encode(extensions.digest(convert_to(
    'research-chain-broker-token-000000000000000','UTF8'
  ),'sha256'),'hex'),
  'active',transaction_timestamp(),transaction_timestamp()+interval '1 day'
),
(
  'independent_evaluation_judge',
  encode(extensions.digest(convert_to(
    'research-chain-evaluator-token-0000000000000','UTF8'
  ),'sha256'),'hex'),
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
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production',repeat('2',64),
  'owner_counsel_decision_required',false,false,false,false,false,false
);
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

select ok(
  not has_function_privilege(
    'authenticated',
    'public.cognitive_record_public_research_source_v2(uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,text,text,text,text,text,timestamptz,jsonb,timestamptz,timestamptz,boolean,text,jsonb,text[],text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_record_public_research_contradiction_detection(uuid,uuid,public.cognitive_platform,public.cognitive_environment,uuid,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_resolve_public_research_contradiction(uuid,uuid,public.cognitive_platform,public.cognitive_environment,uuid,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_expire_public_research_maintenance(uuid,uuid,public.cognitive_platform,public.cognitive_environment,integer,text)',
    'EXECUTE'
  ),
  'ordinary clients cannot reach research provenance, contradiction, or maintenance writers'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

create temporary table research_chain_sources(
  support_source_id uuid,
  contradiction_source_id uuid
);
with support as (
  select public.cognitive_record_public_research_source_v2(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production','apple-docs','developer.apple.com',
    'official_documentation','Apple','apple',
    encode(extensions.digest(convert_to(
      'https://developer.apple.com/documentation/research-support','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'https://developer.apple.com/documentation/research-support','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'The reviewed public behavior remains supported.','UTF8'
    ),'sha256'),'hex'),
    date_trunc(
      'milliseconds',transaction_timestamp()-interval '1 day'
    ),
    jsonb_build_object(
      'mode','published_metadata',
      'machineValue',to_char(
        date_trunc(
          'milliseconds',transaction_timestamp()-interval '1 day'
        ),
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'semanticIdentity','published-at:reviewed-machine-metadata',
      'evidenceHash',encode(extensions.digest(convert_to(concat_ws(
        '|','published_metadata',to_char(
          date_trunc(
            'milliseconds',transaction_timestamp()-interval '1 day'
          ),
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),'published-at:reviewed-machine-metadata'
      ),'UTF8'),'sha256'),'hex')
    ),
    transaction_timestamp(),transaction_timestamp()+interval '1 day',
    true,'The reviewed public behavior remains supported.',
    jsonb_build_object(
      'title','Support source',
      'locator','https://developer.apple.com/documentation/research-support'
    ),array[repeat('3',64)],
    'research-chain-broker-token-000000000000000'
  ) result
), contradiction as (
  select public.cognitive_record_public_research_source_v2(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production','apple-docs','developer.apple.com',
    'official_documentation','Apple','apple',
    encode(extensions.digest(convert_to(
      'https://developer.apple.com/documentation/research-contradiction','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'https://developer.apple.com/documentation/research-contradiction','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'Retrieved machine evidence contradicts the stored claim.','UTF8'
    ),'sha256'),'hex'),
    date_trunc(
      'milliseconds',transaction_timestamp()-interval '1 day'
    ),
    jsonb_build_object(
      'mode','published_metadata',
      'machineValue',to_char(
        date_trunc(
          'milliseconds',transaction_timestamp()-interval '1 day'
        ),
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'semanticIdentity','published-at:reviewed-contradiction-metadata',
      'evidenceHash',encode(extensions.digest(convert_to(concat_ws(
        '|','published_metadata',to_char(
          date_trunc(
            'milliseconds',transaction_timestamp()-interval '1 day'
          ),
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),'published-at:reviewed-contradiction-metadata'
      ),'UTF8'),'sha256'),'hex')
    ),
    transaction_timestamp(),transaction_timestamp()+interval '1 day',
    true,'Retrieved machine evidence contradicts the stored claim.',
    jsonb_build_object(
      'title','Contradiction source',
      'locator',
      'https://developer.apple.com/documentation/research-contradiction'
    ),array[repeat('4',64)],
    'research-chain-broker-token-000000000000000'
  ) result
)
insert into research_chain_sources
select
  (support.result->>'source_id')::uuid,
  (contradiction.result->>'source_id')::uuid
from support,contradiction;

select is(
  (
    select publication_provenance->>'mode'
    from public.research_sources
    where id=(select support_source_id from research_chain_sources)
  ),
  'published_metadata',
  'source v2 persists broker-derived publication provenance'
);

create temporary table research_chain_claim(claim_id uuid);
insert into research_chain_claim
select public.cognitive_record_public_research_claim_evidence(
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','repository_architecture_ux',
  'The reviewed public behavior remains supported.','product',0.900,
  transaction_timestamp()+interval '1 day','none',
  array[(select support_source_id from research_chain_sources)],
  'research-chain-broker-token-000000000000000'
);

select throws_ok(
  format(
    'select public.cognitive_record_public_research_claim_evidence(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,array[%L::uuid],%L)',
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production','repository_architecture_ux',
    'The reviewed public behavior remains supported.','product',0.9,
    transaction_timestamp()+interval '1 day','resolved',
    (select support_source_id from research_chain_sources),
    'research-chain-broker-token-000000000000000'
  ),
  'P0001','caller_contradiction_state_rejected',
  'caller-asserted resolved claims are rejected before persistence'
);

create temporary table research_chain_contradiction(
  contradiction_id uuid,
  event_id uuid
);
insert into research_chain_contradiction
select
  (result->>'contradiction_id')::uuid,
  (result->>'event_id')::uuid
from (
  select public.cognitive_record_public_research_contradiction_detection(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production',
    (select claim_id from research_chain_claim),
    (select contradiction_source_id from research_chain_sources),
    'Retrieved machine evidence contradicts the stored claim.',
    'research-chain-broker-token-000000000000000'
  ) result
) persisted;

select is(
  (
    select contradiction_state||':'||support_state
    from public.research_claims
    where id=(select claim_id from research_chain_claim)
  ),
  'detected:contradicted',
  'detected contradiction blocks claim support'
);

select lives_ok(
  format(
    'select public.cognitive_resolve_public_research_contradiction(%L,%L,%L,%L,%L,%L,%L,%L)',
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production',
    (select contradiction_id from research_chain_contradiction),
    (select support_source_id from research_chain_sources),
    'The reviewed public behavior remains supported.',
    'research-chain-evaluator-token-0000000000000'
  ),
  'independent evaluator can append a bounded resolution proof'
);

select ok(
  (
    select count(*)=2
      and bool_and(
        event_type='detected'
        or (
          event_type='resolved' and proof_hash is not null
          and proof_manifest->>'detectionEvidenceHash'=prior_event_hash
        )
      )
    from public.cognitive_research_contradiction_events
    where contradiction_id=(
      select contradiction_id from research_chain_contradiction
    )
  )
  and (
    select contradiction_state='resolved'
      and status='supported' and support_state='supported'
    from public.research_claims
    where id=(select claim_id from research_chain_claim)
  ),
  'resolution is bound to immutable detection and evaluator proof events'
);

reset role;
select throws_ok(
  format(
    'update public.research_contradictions set resolution_state=%L where id=%L',
    'open',(select contradiction_id from research_chain_contradiction)
  ),
  '42501','immutable_cognitive_evidence',
  'resolved contradiction state cannot be rewritten'
);

update public.intelligence_tasks
set deadman_at=transaction_timestamp()-interval '1 minute'
where id='e2000000-0000-4000-8000-000000000001';
update public.cognitive_governance_switches set
  enabled=false,enabled_by=null,enabled_at=null
where task_id='e2000000-0000-4000-8000-000000000001'
  and switch_key in ('cognitive_research_enabled','cognitive_memory_enabled');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

select lives_ok(
  $$select public.cognitive_expire_public_research_maintenance(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production',10,
    'research-chain-broker-token-000000000000000'
  )$$,
  'public-memory expiry remains reachable after task and research switches expire'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_research_maintenance_runs
    where task_id='e2000000-0000-4000-8000-000000000001'
  ),
  1,
  'every maintenance attempt writes one immutable audit receipt'
);

select * from finish();
rollback;
