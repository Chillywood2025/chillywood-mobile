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
    'public.cognitive_consume_github_draft_pr_capability(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_accept_github_draft_pr_tool_result(text,text,text,text,jsonb,text,text,text,text,text,text,text)',
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

select throws_ok(
  $$insert into public.cognitive_level01_credential_attestations(
      id,task_id,project_id,platform,environment,credential_kind,state,
      public_fingerprint_hash,scope_manifest_hash,verified_at,expires_at
    ) values (
      'e5000000-0000-4000-8000-000000000000',
      'e2000000-0000-4000-8000-000000000001',
      'e1000000-0000-4000-8000-000000000001',
      'shared','production','github_draft_pr','configured',
      repeat('1',64),repeat('2',64),
      transaction_timestamp() - interval '3 minutes',
      transaction_timestamp() + interval '20 minutes'
    )$$,
  'P0001',
  'github_draft_pr_attestation_scope_rejected',
  'GitHub attestation rejects a substituted permission-scope manifest'
);

insert into public.cognitive_level01_credential_attestations(
  id,task_id,project_id,platform,environment,credential_kind,state,
  public_fingerprint_hash,scope_manifest_hash,verified_at,expires_at
) values (
  'e5000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','github_draft_pr','configured',
  repeat('1',64),
  'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554',
  transaction_timestamp() - interval '2 minutes',
  transaction_timestamp() + interval '20 minutes'
);

select ok(
  public.cognitive_github_draft_pr_runtime_attestation_is_current(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production',
    'e5000000-0000-4000-8000-000000000001',
    repeat('1',64),
    'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554',
    transaction_timestamp()
  ),
  'accepted GitHub installation fingerprint is current before rotation'
);

select is(
  public.cognitive_github_draft_pr_plan_contract_hash(
    repeat('1',64),'documentation_draft_pr',repeat('2',64),repeat('a',40),
    repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64),
    repeat('7',64),repeat('8',64),repeat('9',64),repeat('b',64),
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',repeat('c',64)
  ),
  '097820b3d149b20dc1a8a69404286e2b923a7ed6913acec823cbf31f93c47703',
  'database plan hash matches the deterministic cross-runtime contract'
);

select isnt(
  public.cognitive_github_draft_pr_plan_contract_hash(
    repeat('1',64),'documentation_draft_pr',repeat('2',64),repeat('a',40),
    repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64),
    repeat('7',64),repeat('8',64),repeat('9',64),repeat('b',64),
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',repeat('c',64)
  ),
  public.cognitive_github_draft_pr_plan_contract_hash(
    repeat('1',64),'documentation_draft_pr',repeat('2',64),repeat('a',40),
    repeat('3',64),repeat('4',64),repeat('5',64),repeat('d',64),
    repeat('7',64),repeat('8',64),repeat('9',64),repeat('b',64),
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',repeat('c',64)
  ),
  'content substitution changes the immutable approved plan hash'
);

insert into public.cognitive_level01_credential_attestations(
  id,task_id,project_id,platform,environment,credential_kind,state,
  public_fingerprint_hash,scope_manifest_hash,verified_at,expires_at
) values (
  'e5000000-0000-4000-8000-000000000002',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared','production','github_draft_pr','configured',
  repeat('2',64),
  'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554',
  transaction_timestamp() - interval '1 minute',
  transaction_timestamp() + interval '20 minutes'
);

select ok(
  not public.cognitive_github_draft_pr_runtime_attestation_is_current(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production',
    'e5000000-0000-4000-8000-000000000001',
    repeat('1',64),
    'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554',
    transaction_timestamp()
  )
  and public.cognitive_github_draft_pr_runtime_attestation_is_current(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'shared','production',
    'e5000000-0000-4000-8000-000000000002',
    repeat('2',64),
    'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554',
    transaction_timestamp()
  ),
  'installation rotation invalidates the earlier capability fingerprint'
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
    'forbidden-camel-case-source-call',
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-canary/home-tab-target',
    'shared',
    'production',
    'github',
    'github_open_draft_pr',
    'components/AuthScreen.tsx',
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
    repeat('b',40),
    repeat('c',64),
    repeat('d',64),
    repeat('e',64),
    repeat('f',64),
    repeat('1',64),
    repeat('2',64),
    repeat('3',64),
    repeat('4',64),
    repeat('5',64),
    repeat('6',64),
    repeat('7',64),
    repeat('8',64),
    'github-broker-service-token-test-only'
  )$$,
  'P0001',
  'github_draft_pr_exact_source_path_rejected',
  'camel-case auth filenames cannot bypass the exact source-canary path'
);

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
    repeat('b',64),
    repeat('c',64),
    repeat('d',64),
    repeat('e',64),
    repeat('f',64),
    repeat('1',64),
    repeat('2',64),
    repeat('3',64),
    repeat('4',64),
    repeat('5',64),
    repeat('6',64),
    'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554',
    'github-broker-service-token-test-only'
  )$$,
  'P0001',
  'github_draft_pr_exact_binding_rejected',
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
    'public.cognitive_consume_github_draft_pr_capability_pre_exact_binding(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text)'::regprocedure
  ) like '%governance_lock_approved_execution_liveness%'
  and pg_get_functiondef(
    'public.cognitive_accept_github_draft_pr_tool_result_pre_exact_binding(text,text,text,text,jsonb,text,text,text,text,text)'::regprocedure
  ) like '%governance_lock_approved_execution_liveness%',
  'capability consumption and postflight both lock approval liveness'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_consume_github_draft_pr_capability_pre_exact_binding(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text)'::regprocedure
  ) like '%execution_value.target_resource_hash <> p_source_state_hash%'
  and pg_get_functiondef(
    'public.cognitive_consume_github_draft_pr_capability_pre_exact_binding(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text)'::regprocedure
  ) like '%moderation%providers%ranking%rights%',
  'authorization is bound to exact source state and filename-level protected scopes'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_consume_github_draft_pr_pre_source(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  ) like '%cognitive_github_draft_pr_runtime_attestation_is_current%'
  and pg_get_functiondef(
    'public.cognitive_consume_github_draft_pr_pre_source(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  ) like '%cognitive_github_draft_pr_plan_contract_hash%'
  and pg_get_functiondef(
    'public.cognitive_consume_github_draft_pr_pre_source(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  ) like '%ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554%',
  'draft execution binds exact plan and current least-privilege credential'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_consume_github_draft_pr_capability(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  ) like '%p_path = ''components/haptic-tab.tsx''%'
  and pg_get_functiondef(
    'public.cognitive_consume_github_draft_pr_capability(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  ) not like '%^(src|components|app)/%',
  'database source-canary authorization is positively bound to the Home tab component'
);

select * from finish();
rollback;
