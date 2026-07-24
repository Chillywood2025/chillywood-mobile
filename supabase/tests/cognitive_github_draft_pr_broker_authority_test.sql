begin;
select no_plan();

insert into public.cognitive_projects(
  id, repository_full_name, source_state, activation_state,
  scheduler_state, production_authority
) values (
  'e1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off',
  'bounded_level01',
  false
);

insert into public.intelligence_tasks(
  id, project_id, platform, environment, repository_full_name,
  branch_name, task_key, objective_hash, status, actor_identity,
  deadman_at, retention_until, data_class
) values (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared',
  'production',
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-github-broker-test',
  'cognitive-github-broker-authority-test',
  repeat('1', 64),
  'received',
  'github-broker-test-fixture',
  transaction_timestamp() + interval '1 day',
  transaction_timestamp() + interval '30 days',
  'operational_metadata'
);

insert into public.autonomous_system_emergency_states(
  system_id, status, reason, updated_at, metadata
) values (
  'product_intelligence_operator',
  'active',
  'github broker authority fixture',
  transaction_timestamp(),
  '{"fixture":"github-draft-pr-broker"}'::jsonb
)
on conflict (system_id) do update
set
  status = excluded.status,
  reason = excluded.reason,
  updated_at = excluded.updated_at,
  metadata = excluded.metadata;

insert into public.cognitive_service_identities(
  service_identity, credential_hash, status, issued_at, expires_at
) values (
  'cognitive_github_draft_pr_broker',
  encode(
    extensions.digest(
      convert_to('github-broker-service-token-test-only', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'active',
  transaction_timestamp(),
  transaction_timestamp() + interval '1 day'
);

select ok(
  (
    select count(*) = 2
    from pg_class
    where oid in (
      'public.cognitive_github_draft_pr_authorizations'::regclass,
      'public.cognitive_github_draft_pr_tool_events'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  'GitHub broker authorization and postflight tables force RLS'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.cognitive_record_github_draft_pr_provider_readback(uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,timestamptz,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_consume_github_draft_pr_capability(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_accept_github_draft_pr_tool_result(text,text,text,text,jsonb,text,text,text,text,text)',
    'EXECUTE'
  ),
  'ordinary authenticated clients cannot call GitHub broker mutation RPCs'
);

select ok(
  not has_table_privilege(
    'service_role',
    'public.cognitive_github_draft_pr_authorizations',
    'INSERT'
  )
  and not has_table_privilege(
    'service_role',
    'public.cognitive_github_draft_pr_tool_events',
    'INSERT'
  ),
  'service role has no direct GitHub broker audit-table write path'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$select public.cognitive_record_github_draft_pr_provider_readback(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared',
    'production',
    repeat('2',64),
    repeat('3',64),
    repeat('4',64),
    transaction_timestamp() + interval '30 minutes',
    'another-service-token-cannot-impersonate'
  )$$,
  '42501',
  'cognitive_service_token_rejected',
  'another service token cannot impersonate the GitHub broker'
);

create temporary table github_broker_fixture(
  provider_readback_id uuid primary key
);
grant select, insert on github_broker_fixture to service_role;

insert into github_broker_fixture(provider_readback_id)
select (
  public.cognitive_record_github_draft_pr_provider_readback(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared',
    'production',
    repeat('2',64),
    repeat('3',64),
    repeat('4',64),
    transaction_timestamp() + interval '30 minutes',
    'github-broker-service-token-test-only'
  )->>'provider_readback_id'
)::uuid;

select throws_ok(
  $$select public.cognitive_consume_github_draft_pr_capability(
    'missing-capability',
    repeat('b',32),
    repeat('n',32),
    'missing-capability-call',
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-canary/docs-test',
    'shared',
    'production',
    'github',
    'github_open_draft_pr',
    'docs/intelligence/canaries/docs-test.md',
    'e3000000-0000-4000-8000-000000000001',
    128,
    0,
    repeat('5',64),
    repeat('6',64),
    repeat('7',64),
    'e4000000-0000-4000-8000-000000000001',
    repeat('8',64),
    repeat('9',64),
    repeat('a',40),
    'absent',
    'github-broker-service-token-test-only'
  )$$,
  'P0001',
  'github_draft_pr_capability_authorization_rejected',
  'broker cannot act without an exact capability, lease, and approved execution'
);

reset role;

select is(
  (
    select count(*)
    from public.cognitive_provider_credential_receipts receipt
    where receipt.id = (
      select provider_readback_id from github_broker_fixture
    )
      and receipt.receipt_type = 'provider_readback'
      and receipt.credential_kind = 'github_draft_pr'
      and receipt.provider = 'github'
      and receipt.state = 'configured'
  ),
  1::bigint,
  'dedicated broker persists one bounded GitHub provider readback'
);

select ok(
  (
    select receipt.producer_identity_hash = encode(
      extensions.digest(
        convert_to('cognitive_github_draft_pr_broker', 'UTF8'),
        'sha256'
      ),
      'hex'
    )
      and receipt.producer_identity_hash <> encode(
        extensions.digest(
          convert_to('capability_and_tool_broker', 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    from public.cognitive_provider_credential_receipts receipt
    where receipt.id = (
      select provider_readback_id from github_broker_fixture
    )
  ),
  'provider readback records the dedicated broker identity'
);

select ok(
  (
    select evidence.evidence_type = 'provider_attested'
      and evidence.expires_at <= evidence.observed_at + interval '65 minutes'
    from public.cognitive_provider_credential_receipts receipt
    join public.cognitive_verified_external_evidence evidence
      on evidence.id = receipt.external_evidence_id
    where receipt.id = (
      select provider_readback_id from github_broker_fixture
    )
  ),
  'provider readback is bound to expiring immutable external evidence'
);

select throws_ok(
  $$update public.cognitive_provider_credential_receipts
    set state = 'revoked'
    where id = (
      select provider_readback_id from github_broker_fixture
    )$$,
  '42501',
  'immutable_cognitive_evidence',
  'GitHub provider readback cannot be rewritten'
);

select ok(
  (
    select pg_get_constraintdef(oid) like
      '%cognitive_github_draft_pr_broker%'
    from pg_constraint
    where conrelid = 'public.cognitive_service_identities'::regclass
      and conname =
        'cognitive_service_identities_service_identity_check'
  ),
  'service identity registry explicitly recognizes the dedicated broker'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_consume_github_draft_pr_capability(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text)'::regprocedure
  ) like '%governance_lock_approved_execution_liveness%'
  and pg_get_functiondef(
    'public.cognitive_accept_github_draft_pr_tool_result(text,text,text,text,jsonb,text,text,text,text,text)'::regprocedure
  ) like '%governance_lock_approved_execution_liveness%',
  'capability consumption and postflight both lock approval liveness'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_consume_github_draft_pr_capability(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text)'::regprocedure
  ) like '%execution_value.target_resource_hash <> p_source_state_hash%'
  and pg_get_functiondef(
    'public.cognitive_consume_github_draft_pr_capability(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text)'::regprocedure
  ) like '%moderation%providers%ranking%rights%',
  'authorization is bound to exact source state and filename-level protected scopes'
);

select * from finish();
rollback;
