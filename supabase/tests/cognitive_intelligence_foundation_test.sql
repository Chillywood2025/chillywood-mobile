begin;
select no_plan();
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.cognitive_actor','cognitive_control_plane',true);

-- Inventory and hard off-state.
select has_table('public', 'cognitive_projects', 'project boundary exists');
select has_table('public', 'intelligence_tasks', 'task boundary exists');
select has_table('public', 'execution_plan_snapshots', 'immutable plan snapshots exist');
select has_table('public', 'cognitive_capabilities', 'typed capabilities exist');
select has_table('public', 'cognitive_capability_events', 'capability lifecycle exists');
select has_table('public', 'cognitive_budget_events', 'budget lifecycle exists');
select has_table('public', 'cognitive_resource_leases', 'resource leases exist');
select has_table('public', 'cognitive_resource_lease_events', 'resource lease lifecycle exists');
select has_table('public', 'cognitive_owner_review_requests', 'owner escalation requests exist');
select has_table('public', 'cognitive_approval_bindings', 'approval snapshot bindings exist');
select has_table('public', 'cognitive_state_transition_events', 'state lifecycle exists');
select has_table('public', 'research_claim_sources', 'relational claim sources exist');
select has_table('public', 'research_contradictions', 'contradiction evidence exists');
select has_table('public', 'research_retrieval_events', 'retrieval lifecycle exists');
select has_table('public', 'cognitive_research_authorities', 'research authority registry exists');
select has_table('public', 'execution_evidence_records', 'trusted execution evidence exists');
select has_table('public', 'cognitive_current_findings', 'current finding state exists');
select has_table('public', 'finding_lifecycle_events', 'immutable finding lifecycle exists');
select has_table('public', 'cognitive_erasure_events', 'erasure tombstones exist');

select is(
  (select count(*)::integer from pg_class
   where oid in (
     select format('public.%I', name)::regclass
     from unnest(array[
       'cognitive_projects','intelligence_tasks','research_sources','research_claims',
       'research_claim_sources','research_contradictions','research_retrieval_events',
       'knowledge_entities','knowledge_relationships','architecture_components',
       'architecture_dependencies','decision_records','hypotheses','solution_candidates',
       'experiments','experiment_results','execution_plans','execution_plan_snapshots',
       'execution_runs','execution_evidence_records','evaluation_results','lessons',
       'playbooks','model_invocations','tool_invocations','intelligence_budgets',
       'cognitive_capabilities','cognitive_capability_events','cognitive_budget_events',
       'cognitive_resource_leases','cognitive_resource_lease_events',
       'cognitive_state_transition_events','cognitive_current_findings',
       'finding_lifecycle_events','cognitive_erasure_events',
       'cognitive_owner_review_requests','cognitive_approval_bindings'
       ,'cognitive_research_authorities'
     ]) name
   ) and relrowsecurity),
  38,
  'RLS enabled on all 38 cognitive tables'
);
select is(
  (select count(*)::integer from pg_class
   where oid in (
     select format('public.%I', name)::regclass
     from unnest(array[
       'cognitive_projects','intelligence_tasks','research_sources','research_claims',
       'research_claim_sources','research_contradictions','research_retrieval_events',
       'knowledge_entities','knowledge_relationships','architecture_components',
       'architecture_dependencies','decision_records','hypotheses','solution_candidates',
       'experiments','experiment_results','execution_plans','execution_plan_snapshots',
       'execution_runs','execution_evidence_records','evaluation_results','lessons',
       'playbooks','model_invocations','tool_invocations','intelligence_budgets',
       'cognitive_capabilities','cognitive_capability_events','cognitive_budget_events',
       'cognitive_resource_leases','cognitive_resource_lease_events',
       'cognitive_state_transition_events','cognitive_current_findings',
       'finding_lifecycle_events','cognitive_erasure_events',
       'cognitive_owner_review_requests','cognitive_approval_bindings'
       ,'cognitive_research_authorities'
     ]) name
   ) and relforcerowsecurity),
  38,
  'FORCE RLS enabled on all 38 cognitive tables'
);
select ok(not has_table_privilege('anon', 'public.intelligence_tasks', 'SELECT'), 'anon cannot read tasks');
select ok(not has_table_privilege('anon', 'public.intelligence_tasks', 'INSERT'), 'anon cannot create tasks');
select ok(not has_table_privilege('authenticated', 'public.intelligence_tasks', 'INSERT'), 'authenticated cannot create tasks');
select ok(not has_table_privilege('authenticated', 'public.execution_plans', 'UPDATE'), 'authenticated cannot alter plans');
select ok(not has_table_privilege('authenticated', 'public.cognitive_capabilities', 'INSERT'), 'authenticated cannot issue capabilities');
select ok(not has_table_privilege('authenticated', 'public.cognitive_capabilities', 'UPDATE'), 'authenticated cannot activate capabilities');
select ok(not has_table_privilege('service_role', 'public.intelligence_tasks', 'UPDATE'), 'service role cannot bypass task transition RPC');
select ok(not has_table_privilege('service_role', 'public.cognitive_capabilities', 'UPDATE'), 'service role cannot mutate capability state directly');
select ok(not has_table_privilege('service_role', 'public.execution_runs', 'UPDATE'), 'execution evidence cannot be rewritten');
select ok(not has_table_privilege('service_role', 'public.evaluation_results', 'UPDATE'), 'evaluation evidence cannot be rewritten');
select ok(not has_table_privilege('service_role', 'public.intelligence_tasks', 'INSERT'), 'service role cannot fabricate a task directly');
select ok(not has_table_privilege('service_role', 'public.execution_plans', 'INSERT'), 'service role cannot fabricate a plan directly');
select ok(not has_table_privilege('service_role', 'public.cognitive_capabilities', 'INSERT'), 'service role cannot fabricate a capability directly');
select ok(not has_table_privilege('service_role', 'public.cognitive_state_transition_events', 'INSERT'), 'service role cannot fabricate lifecycle evidence directly');
select ok(not has_table_privilege('service_role', 'public.cognitive_research_authorities', 'INSERT'), 'service role cannot add a research trust anchor');
select ok(not has_table_privilege('service_role', 'public.cognitive_research_authorities', 'UPDATE'), 'service role cannot rewrite a research trust anchor');
select ok(not has_table_privilege('service_role', 'public.cognitive_research_authorities', 'DELETE'), 'service role cannot delete a research trust anchor');

-- Recursive credential-shape detection covers direct and embedded encoded data.
select ok(
  public.cognitive_text_has_secret('ghp_abcdefghijklmnopqrstuvwxyz'),
  'GitHub token-shaped identifiers are classified as secrets'
);
select ok(
  public.cognitive_text_has_secret(
    'fixture.' || encode(convert_to('access_token=synthetic-fixture-value','UTF8'),'base64') || '.metadata'
  ),
  'embedded base64 credential-like text is classified as secret'
);
select ok(
  public.cognitive_text_has_secret(
    'fixture.' || rtrim(
      translate(
        encode(
          convert_to(
            encode(convert_to('refresh_token=synthetic-fixture-value','UTF8'),'base64'),
            'UTF8'
          ),
          'base64'
        ),
        '+/',
        '-_'
      ),
      '='
    ) || '.metadata'
  ),
  'nested embedded base64url credential-like text is classified as secret'
);
select ok(
  (
    with recursive encoded(depth, value) as (
      select 0, 'access_token=synthetic-fixture-value'::text
      union all
      select depth + 1,
        rtrim(
          translate(
            replace(encode(convert_to(value,'UTF8'),'base64'), E'\n', ''),
            '+/',
            '-_'
          ),
          '='
        )
      from encoded
      where depth < 3
    )
    select public.cognitive_text_has_secret('prefix.' || value || '.suffix')
    from encoded
    where depth = 3
  ),
  'triple-nested embedded base64url credential-like text is classified as secret'
);
select ok(
  (
    with recursive encoded(depth, value) as (
      select 0, 'access_token=synthetic-fixture-value'::text
      union all
      select depth + 1,
        replace(encode(convert_to(value,'UTF8'),'base64'), E'\n', '')
      from encoded
      where depth < 3
    )
    select public.cognitive_text_has_secret(
      regexp_replace(value, '(.{8})', E'\\1 ', 'g')
    )
    from encoded
    where depth = 3
  ),
  'whitespace-folded nested base64 credential-like text is classified as secret'
);
select ok(
  public.cognitive_text_has_secret(
    'access%255Ftoken%253Dsynthetic-fixture-value'
  ),
  'nested percent-encoded credential-like text is classified as secret'
);
select ok(
  public.cognitive_text_has_secret('service_role.synthetic-fixture-value'),
  'dotted service-role credential-like text is classified as secret'
);
select ok(
  public.cognitive_text_has_secret(
    encode(convert_to('api_key=synthetic-fixture-value','UTF8'),'hex')
  ),
  'hexadecimal credential-like text is classified as secret'
);
select ok(
  not public.cognitive_json_is_sanitized(
    jsonb_build_object(
      'metadata',
      jsonb_build_array(
        'safe-prefix',
        encode(convert_to('api_key=synthetic-fixture-value','UTF8'),'base64')
      )
    )
  ),
  'nested JSON containing encoded credential-like text is rejected'
);

select has_function(
  'public',
  'cognitive_transition_task',
	  array['uuid','uuid','cognitive_platform','cognitive_environment','cognitive_task_status','cognitive_task_status','text','text','uuid','text'],
  'task transition RPC exists'
);
select has_function(
  'public',
  'cognitive_consume_capability',
	  array['text','text','text','text','uuid','uuid','text','text','cognitive_platform','cognitive_environment','text','text','text','bigint','numeric','text','text','text'],
  'atomic capability consumption RPC exists'
);
select ok(not has_function_privilege(
  'authenticated',
  'public.cognitive_transition_task(uuid,uuid,public.cognitive_platform,public.cognitive_environment,public.cognitive_task_status,public.cognitive_task_status,text,text,uuid,text)',
  'EXECUTE'
), 'authenticated cannot transition tasks');
select ok(has_function_privilege(
  'service_role',
  'public.cognitive_transition_task(uuid,uuid,public.cognitive_platform,public.cognitive_environment,public.cognitive_task_status,public.cognitive_task_status,text,text,uuid,text)',
  'EXECUTE'
), 'service role can invoke controlled task transition');
select is(
  (select proconfig::text from pg_proc where oid =
	    'public.cognitive_transition_task(uuid,uuid,public.cognitive_platform,public.cognitive_environment,public.cognitive_task_status,public.cognitive_task_status,text,text,uuid,text)'::regprocedure),
  '{"search_path=\"\""}',
  'task RPC has fixed empty search_path'
);
select is(
  (select proconfig::text from pg_proc where oid =
	    'public.cognitive_consume_capability(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,bigint,numeric,text,text,text)'::regprocedure),
  '{"search_path=\"\""}',
  'capability RPC has fixed empty search_path'
);

select is(public.cognitive_json_is_sanitized('{"source":"official"}'::jsonb), true, 'bounded safe JSON accepted');
select is(public.cognitive_json_is_sanitized('{"password":"synthetic"}'::jsonb), false, 'nested secret key rejected');
select is(public.cognitive_json_is_sanitized('{"__proto__":{"x":1}}'::jsonb), false, 'prototype pollution key rejected');
select is(
  public.cognitive_json_is_sanitized(jsonb_build_object(
    'value',
    encode(convert_to(encode(convert_to('service_role=synthetic-secret-value','UTF8'),'base64'),'UTF8'),'base64')
  )),
  false,
  'double-base64 encoded secret-like text is rejected'
);
select is(
  public.cognitive_json_is_sanitized('{"first":"service_","second":"role=synthetic-secret-value"}'::jsonb),
  false,
  'split nested secret-like text is rejected'
);
select is(
  public.cognitive_json_is_sanitized(jsonb_build_object(
    'value',
    rtrim(translate(
      encode(convert_to('access_token=synthetic-fixture-value','UTF8'),'base64'),
      '+/',
      '-_'
    ), '=')
  )),
  false,
  'unpadded base64url secret-like text is rejected'
);
select is(
  public.cognitive_json_is_sanitized(
    '{"url":"https://example.test/path?to%6ben=synthetic-fixture-value"}'::jsonb
  ),
  false,
  'percent-encoded credential URL is rejected'
);
select is(
  public.cognitive_json_is_sanitized('{"identifier":"AKIASYNTHETICFIXTURE"}'::jsonb),
  false,
  'AWS access-key-shaped identifier is rejected'
);
select is(
  public.platform_staff_normalize_permission_key('admin.cognitive.read'),
  'admin.cognitive.read',
  'cognitive source readback is an exact closed staff permission'
);
select is(
  public.platform_staff_normalize_permission_key('admin.cognitive.execute'),
  null,
  'unrecognized cognitive execution permission fails closed'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname='public'
     and policyname like '%_cognitive_exact_read'
     and qual like '%cognitive_can_read_scope%'),
  37,
  'all cognitive read policies delegate to the exact scoped authorization helper'
);
select ok(
  (select prosrc from pg_proc
   where oid='public.cognitive_can_read_scope(uuid,uuid,public.cognitive_platform)'::regprocedure)
    like '%admin.cognitive.read%'
  and
  (select prosrc from pg_proc
   where oid='public.cognitive_can_read_scope(uuid,uuid,public.cognitive_platform)'::regprocedure)
    like '%super_admin%',
  'the scoped authorization helper requires Owner/super-admin or admin.cognitive.read'
);

insert into public.cognitive_projects(
  id, repository_full_name
) values (
  '10000000-0000-0000-0000-000000000001',
  'Chillywood2025/chillywood-mobile'
);
select is(
  (select activation_state from public.cognitive_projects where id='10000000-0000-0000-0000-000000000001'),
  'off',
  'project is hard off'
);
select is(
  (select production_authority from public.cognitive_projects where id='10000000-0000-0000-0000-000000000001'),
  false,
  'project has no production authority'
);

insert into public.intelligence_tasks(
  id, project_id, platform, environment, repository_full_name, branch_name,
  task_key, objective_hash, actor_identity, deadman_at
) values
(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios', 'ci', 'Chillywood2025/chillywood-mobile', 'codex/task-ios',
  'task-ios-fixture', repeat('a',64), 'operator-fixture', now()+interval '1 hour'
),
(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'android', 'ci', 'Chillywood2025/chillywood-mobile', 'codex/task-android',
  'task-android-fixture', repeat('b',64), 'operator-fixture', now()+interval '1 hour'
);
select is((select count(*)::integer from public.intelligence_tasks), 2, 'two platform-isolated tasks inserted');

set local role authenticated;
select is(
  (select count(*)::integer from public.intelligence_tasks),
  0,
  'ordinary authenticated caller cannot read cognitive task memory'
);
select throws_ok(
  $$insert into public.intelligence_tasks(
    project_id,platform,environment,repository_full_name,branch_name,
    task_key,objective_hash,actor_identity,deadman_at
  ) values (
    '10000000-0000-0000-0000-000000000001','ios','ci',
    'Chillywood2025/chillywood-mobile','codex/client-forbidden',
    'client-write-forbidden',repeat('f',64),'untrusted-client',now()+interval '1 hour'
  )$$,
  '42501',
  null,
  'ordinary authenticated caller cannot write cognitive task state'
);
reset role;

insert into auth.users(id,is_sso_user,is_anonymous)
values ('09000000-0000-0000-0000-000000000001',false,false);
insert into public.platform_role_memberships(role,user_id,email,status)
values (
  'operator','09000000-0000-0000-0000-000000000001',
  'cognitive-review@example.invalid','active'
);
insert into public.platform_staff_permission_grants(
  target_user_id,target_email,permission_key,status
) values (
  '09000000-0000-0000-0000-000000000001',
  'cognitive-review@example.invalid','admin.cognitive.read','active'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','09000000-0000-0000-0000-000000000001',
    'email','cognitive-review@example.invalid',
    'role','authenticated',
    'app_metadata',jsonb_build_object(
      'cognitive_project_ids',jsonb_build_array('10000000-0000-0000-0000-000000000001'),
      'cognitive_task_ids',jsonb_build_array('20000000-0000-0000-0000-000000000001'),
      'cognitive_platforms',jsonb_build_array('ios')
    )
  )::text,
  true
);
select is(
  (select count(*)::integer from public.intelligence_tasks),
  1,
  'scoped Admin reads only the exact assigned cognitive task'
);
select is(
  (select count(*)::integer from public.intelligence_tasks where platform='android'),
  0,
  'scoped Admin cannot cross the assigned cognitive platform'
);
reset role;
select set_config('request.jwt.claims','{}',true);

select throws_ok(
  $$insert into public.intelligence_tasks(project_id,platform,environment,repository_full_name,branch_name,task_key,objective_hash,actor_identity,deadman_at)
    values ('10000000-0000-0000-0000-000000000001','ios','ci','Other/repo','codex/task-bad','task-bad-repo',repeat('c',64),'operator-fixture',now()+interval '1 hour')$$,
  '23514', null, 'wrong repository rejected'
);
select throws_ok(
  $$insert into public.intelligence_tasks(project_id,platform,environment,repository_full_name,branch_name,task_key,objective_hash,actor_identity,deadman_at)
    values ('10000000-0000-0000-0000-000000000001','ios','ci','Chillywood2025/chillywood-mobile','main','task-main-branch',repeat('c',64),'operator-fixture',now()+interval '1 hour')$$,
  '23514', null, 'main branch rejected'
);

select is(
  public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','received','planning','cognitive_control_plane',repeat('d',64),
    null,null
  )::text,
  'planning',
  'valid task transition succeeds'
);
select throws_ok(
  $$select public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','planning','completed','cognitive_control_plane',repeat('e',64),
    null,null
  )$$,
  'P0001', 'invalid_cognitive_task_transition', 'planned to completed fails closed'
);
select throws_ok(
  $$select public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'android','ci','planning','awaiting_approval','cognitive_control_plane',repeat('e',64),
    null,null
  )$$,
  'P0001', 'task_scope_or_expected_state_mismatch', 'cross-platform transition rejected'
);
select throws_ok(
  $$select public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'android','ci','received','planning','product_intelligence_operator',repeat('e',64),
    null,null
  )$$,
  '42501', 'cognitive_service_actor_mismatch',
  'caller-supplied actor cannot differ from the authenticated service actor'
);
select is(
  (select count(*)::integer from public.cognitive_state_transition_events where task_id='20000000-0000-0000-0000-000000000001'),
  1,
  'valid transition creates one immutable event'
);
select throws_ok(
  $$delete from public.cognitive_state_transition_events where task_id='20000000-0000-0000-0000-000000000001'$$,
  '42501', 'immutable_cognitive_evidence', 'transition history cannot be deleted'
);
select throws_ok(
  $$insert into public.cognitive_state_transition_events(
    task_id,project_id,platform,environment,entity_type,entity_id,
    prior_status,next_status,actor_identity,transition_hash
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','task','20000000-0000-0000-0000-000000000001',
    'planning','awaiting_approval','ghp_abcdefghijklmnopqrstuvwxyz',repeat('d',64)
  )$$,
  '23514', null,
  'immutable audit actor identifiers reject secret-shaped values'
);

-- Relational research provenance and cross-task denial.
insert into public.research_sources(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  data_class,retention_until,source_reference_hash,canonical_url_hash,content_hash,
  authority_id,canonical_host,ownership_identity,publisher,
  publication_date,retrieval_date,freshness_deadline,source_type,is_primary,
  bounded_excerpt,citation_metadata,trusted_for_tool_execution
) values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','research-fixture','source-official-fixture','accepted',
  'research_cache',now()+interval '30 days',repeat('1',64),repeat('2',64),repeat('3',64),
  'expo-docs','docs.expo.dev','expo','Expo',
  now()-interval '2 days',now()-interval '1 day',now()+interval '8 days',
  'official_documentation',true,'Bounded fixture excerpt.',
  '{"title":"Official fixture","locator":"section-1"}'::jsonb,false
);
insert into public.research_claims(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  data_class,retention_until,claim_hash,bounded_claim,confidence,category,
  freshness_deadline,contradiction_state,support_state
) values (
  '31000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','research-fixture','claim-technical-fixture','pending',
  'research_cache',now()+interval '30 days',repeat('4',64),'Fixture technical claim.',0.9,
  'technical',now()+interval '7 days','none','pending'
);
insert into public.research_sources(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  data_class,retention_until,source_reference_hash,canonical_url_hash,content_hash,
  authority_id,canonical_host,ownership_identity,publisher,
  publication_date,retrieval_date,freshness_deadline,source_type,is_primary,
  bounded_excerpt,citation_metadata,trusted_for_tool_execution
) values (
  '30000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'android','ci','research-fixture','source-android-fixture','accepted',
  'research_cache',now()+interval '30 days',repeat('a',64),repeat('b',64),repeat('c',64),
  'android-docs','developer.android.com','google','Google',
  now()-interval '2 days',now()-interval '1 day',now()+interval '7 days',
  'official_documentation',true,'Bounded Android fixture excerpt.',
  '{"title":"Android fixture","locator":"section-1"}'::jsonb,false
);
select throws_ok(
  $$insert into public.research_sources(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
    data_class,retention_until,source_reference_hash,canonical_url_hash,content_hash,
    authority_id,canonical_host,ownership_identity,publisher,
    publication_date,retrieval_date,freshness_deadline,source_type,is_primary,
    bounded_excerpt,citation_metadata,trusted_for_tool_execution
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','research-fixture','source-forged-authority','accepted',
    'research_cache',now()+interval '30 days',repeat('d',64),repeat('e',64),repeat('f',64),
    'expo-docs','docs.expo.dev','expo','Forged Publisher',
    now()-interval '2 days',now()-interval '1 day',now()+interval '7 days',
    'official_documentation',true,'Bounded fixture excerpt.',
    '{"title":"Forged fixture","locator":"section-1"}'::jsonb,false
  )$$,
  '23503', null,
  'research source authority and publisher are relationally enforced'
);
select throws_ok(
  $$insert into public.research_sources(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
    data_class,retention_until,source_reference_hash,canonical_url_hash,content_hash,
    authority_id,canonical_host,ownership_identity,publisher,
    publication_date,retrieval_date,freshness_deadline,source_type,is_primary,
    bounded_excerpt,citation_metadata,trusted_for_tool_execution
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','research-fixture','source-invalid-citation','accepted',
    'research_cache',now()+interval '30 days',repeat('d',64),repeat('e',64),repeat('f',64),
    'expo-docs','docs.expo.dev','expo','Expo',
    now()-interval '2 days',now()-interval '1 day',now()+interval '7 days',
    'official_documentation',true,'Bounded fixture excerpt.',
    '{"title":"Fixture","locator":"section-1","authority":"self-asserted"}'::jsonb,false
  )$$,
  '23514', null,
  'research citation schema rejects caller-authored authority metadata'
);
select throws_ok(
  $$insert into public.research_sources(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
    data_class,retention_until,source_reference_hash,canonical_url_hash,content_hash,
    authority_id,canonical_host,ownership_identity,publisher,
    publication_date,retrieval_date,freshness_deadline,source_type,is_primary,
    bounded_excerpt,citation_metadata,trusted_for_tool_execution,created_at
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','research-fixture','source-future-time','accepted',
    'research_cache',now()+interval '30 days',repeat('d',64),repeat('e',64),repeat('f',64),
    'expo-docs','docs.expo.dev','expo','Expo',
    now()-interval '2 days',now(),now()+interval '7 days',
    'official_documentation',true,'Bounded fixture excerpt.',
    '{"title":"Fixture","locator":"section-1"}'::jsonb,false,
    now()+interval '1 day'
  )$$,
  '23514', null,
  'research source cannot forge a future evidence timestamp'
);
select lives_ok(
  $$insert into public.research_claim_sources(
    claim_id,source_id,task_id,project_id,platform,environment,relationship
  ) values (
    '31000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','supports'
  )$$,
  'same-task research provenance accepted'
);
select throws_ok(
  $$update public.research_claims
    set freshness_deadline=now()+interval '9 days'
    where id='31000000-0000-0000-0000-000000000001'$$,
  'P0001', 'research_claim_freshness_exceeds_source',
  'a linked claim cannot be extended beyond its supporting source'
);
insert into public.research_claims(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  data_class,retention_until,claim_hash,bounded_claim,confidence,category,
  freshness_deadline,contradiction_state,support_state
) values (
  '31000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','research-fixture','claim-overlong-freshness','pending',
  'research_cache',now()+interval '30 days',repeat('5',64),
  'Fixture claim whose validity outlives its source.',0.8,
  'technical',now()+interval '9 days','none','pending'
);
select throws_ok(
  $$insert into public.research_claim_sources(
    claim_id,source_id,task_id,project_id,platform,environment,relationship
  ) values (
    '31000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','supports'
  )$$,
  'P0001', 'research_claim_freshness_exceeds_source',
  'a claim cannot link to support that expires before the claim'
);
insert into public.research_retrieval_events(
  source_id,task_id,project_id,platform,environment,request_url_hash,
  resolved_address_hashes,response_hash,result
) values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci',repeat('2',64),array[repeat('3',64)],repeat('3',64),'accepted'
);
select throws_ok(
  $$insert into public.research_retrieval_events(
    source_id,task_id,project_id,platform,environment,request_url_hash,
    resolved_address_hashes,response_hash,result
  ) values (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci',repeat('9',64),array[repeat('3',64)],repeat('3',64),'accepted'
  )$$,
  'P0001', 'research_retrieval_binding_rejected',
  'retrieval evidence cannot be attached to a different request URL'
);
select set_config('request.jwt.claim.cognitive_actor','product_intelligence_operator',true);
select is(
  public.cognitive_transition_entity(
    'research_claim','31000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','pending','supported','product_intelligence_operator',repeat('a',64),
    null,null,null,null
  ),
  'supported',
  'technical claim requires and accepts same-scope primary provenance'
);
select set_config('request.jwt.claim.cognitive_actor','cognitive_control_plane',true);
select throws_ok(
  $$insert into public.research_claim_sources(
    claim_id,source_id,task_id,project_id,platform,environment,relationship
  ) values (
    '31000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','supports'
  )$$,
  '23503', null, 'cross-task/platform research linkage rejected'
);
select throws_ok(
  $$update public.research_sources set bounded_excerpt='changed' where id='30000000-0000-0000-0000-000000000001'$$,
  '42501', 'immutable_cognitive_evidence', 'research source evidence is immutable'
);

-- Immutable plan/approval/capability binding and atomic replay protection.
insert into public.autonomous_system_emergency_states(system_id,status,reason)
values ('product_intelligence_operator','active','local fixture only')
on conflict (system_id) do update set status='active', reason='local fixture only';

create temporary table cognitive_test_snapshot (
  canonical_snapshot jsonb not null,
  snapshot_hash text not null
);
insert into cognitive_test_snapshot(canonical_snapshot,snapshot_hash)
select value,encode(extensions.digest(convert_to(value::text,'UTF8'),'sha256'),'hex')
from (
  select jsonb_build_object(
    'repository','Chillywood2025/chillywood-mobile',
    'branch','codex/task-ios',
    'actions',jsonb_build_array('repository_apply_patch'),
    'paths',jsonb_build_array('docs/intelligence/'),
    'tests',jsonb_build_array('cognitive-red-team'),
    'rollback','scoped revert'
  ) value
) fixture;

insert into public.autonomous_approval_requests(
  id,system_id,action_id,requested_by_actor_type,approval_level,status,title,reason,
  risk_summary,proposed_action,allowed_write_scope,forbidden_scope,rollback_plan,
  kill_switch_plan,proof_plan,validation_plan,expires_at,approved_by,approved_at,
  metadata,platform
) values (
  '40000000-0000-0000-0000-000000000001',
  'product_intelligence_operator','approve_cognitive_execution','operator',3,'approved',
  'Local cognitive fixture','Local disposable database test','No production authority',
  'Patch one scoped documentation file','["docs/intelligence/"]'::jsonb,
  '["production","money","rights","auth","rls"]'::jsonb,
  'Revert scoped fixture commit','Emergency stop','Run required tests',
  'Verify immutable evidence',now()+interval '1 hour',
  '40000000-0000-0000-0000-000000000002',now(),
  jsonb_build_object(
    'approval_scope_hash',repeat('d',64),
    'plan_snapshot_hash',(select snapshot_hash from cognitive_test_snapshot),
    'allowed_operations',jsonb_build_array('repository_apply_patch')
  ),'ios'
);

insert into public.execution_plans(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  data_class,retention_until,
  plan_version,branch_name,requested_actions,path_allowlist,required_test_ids,
  rollback_plan_hash,source_commit,graph_digest
) values (
  '41000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','planner-fixture','plan-snapshot-fixture','draft',
  'operational_metadata',now()+interval '30 days',1,
  'codex/task-ios',array['repository_apply_patch'],array['docs/intelligence/'],
  array['cognitive-red-team'],repeat('e',64),repeat('a',40),repeat('f',64)
);
insert into public.execution_plan_snapshots(
  id,plan_id,task_id,project_id,platform,environment,snapshot_hash,
  canonical_snapshot,approval_scope_hash,approval_request_id
) values (
  '42000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci',(select snapshot_hash from cognitive_test_snapshot),
  (select canonical_snapshot from cognitive_test_snapshot),
  repeat('d',64),'40000000-0000-0000-0000-000000000001'
);
insert into public.cognitive_approval_bindings(
  approval_request_id,snapshot_id,task_id,project_id,platform,environment,
  snapshot_hash,approval_scope_hash,bound_by,binding_hash
) values (
  '40000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci',(select snapshot_hash from cognitive_test_snapshot),repeat('d',64),
  '40000000-0000-0000-0000-000000000002',repeat('b',64)
);
insert into public.autonomous_approval_request_events(
  request_id,event_type,actor_type,actor_id,event_summary,metadata,platform
) values (
  '40000000-0000-0000-0000-000000000001','preflight_passed','owner',
  '40000000-0000-0000-0000-000000000002','Local strict cognitive preflight',
  jsonb_build_object(
    'approval_scope_hash',repeat('d',64),
    'plan_snapshot_hash',(select snapshot_hash from cognitive_test_snapshot)
  ),'ios'
);
select throws_ok(
  $$insert into public.execution_plan_snapshots(
    id,plan_id,task_id,project_id,platform,environment,snapshot_hash,
    canonical_snapshot,approval_scope_hash,approval_request_id
  ) values (
    '42000000-0000-0000-0000-000000000002',
    '41000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci',repeat('9',64),
    (select canonical_snapshot from cognitive_test_snapshot),
    repeat('d',64),'40000000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'snapshot hash does not match canonical content',
  'caller-asserted snapshot hash cannot replace the database-computed hash'
);
insert into public.autonomous_approval_requests(
  id,system_id,action_id,requested_by_actor_type,approval_level,status,title,reason,
  risk_summary,proposed_action,allowed_write_scope,forbidden_scope,rollback_plan,
  kill_switch_plan,proof_plan,validation_plan,expires_at,approved_by,approved_at,
  metadata,platform
) values (
  '40000000-0000-0000-0000-000000000003',
  'product_intelligence_operator','approve_cognitive_execution','operator',3,'approved',
  'Unbound local fixture','Must fail closed','Missing immutable binding',
  'No execution','["docs/intelligence/"]'::jsonb,'["production"]'::jsonb,
  'No execution','Emergency stop','No proof','No validation',now()+interval '1 hour',
  '40000000-0000-0000-0000-000000000002',now(),
  jsonb_build_object(
    'approval_scope_hash',repeat('d',64),
    'plan_snapshot_hash',(select snapshot_hash from cognitive_test_snapshot),
    'allowed_operations',jsonb_build_array('repository_apply_patch')
  ),'ios'
);
select is(
  public.cognitive_approval_is_fresh(
    '40000000-0000-0000-0000-000000000003',
    'repository_apply_patch','ios',repeat('d',64),
    (select snapshot_hash from cognitive_test_snapshot)
  ),
  false,
  'approved row without immutable binding and fresh preflight cannot authorize execution'
);
select is(
  public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','planning','awaiting_approval','cognitive_control_plane',repeat('1',64),
    null,null
  )::text,
  'awaiting_approval',
  'planning may enter awaiting approval without fabricating approval'
);
select throws_ok(
  $$select public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','awaiting_approval','approved','cognitive_control_plane',repeat('1',64),
    null,null
  )$$,
  'P0001',
  'cognitive_transition_approval_snapshot_required',
  'task cannot become approved without the immutable approval snapshot'
);
select is(
  public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','awaiting_approval','approved','cognitive_control_plane',repeat('1',64),
    '40000000-0000-0000-0000-000000000001',
    (select snapshot_hash from cognitive_test_snapshot)
  )::text,
  'approved',
  'task approval succeeds only with the bound snapshot and fresh owner preflight'
);
select throws_ok(
  $$update public.execution_plan_snapshots set snapshot_hash=repeat('9',64)
    where id='42000000-0000-0000-0000-000000000001'$$,
  '42501','immutable_cognitive_evidence','plan snapshot cannot be changed after approval'
);

insert into public.cognitive_capabilities(
  id,capability_id,bearer_hash,nonce_hash,task_id,project_id,repository_full_name,
  branch_name,platform,environment,risk_level,provider,operation,path_scopes,
  issued_at,not_before,expires_at,maximum_calls,remaining_calls,maximum_bytes,
  remaining_bytes,maximum_cost,remaining_cost,approval_request_id,
  approval_scope_hash,plan_snapshot_id,plan_snapshot_hash
) values (
  '43000000-0000-0000-0000-000000000001','capability-fixture-001',
  encode(extensions.digest(convert_to('bearer-fixture','UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('nonce-fixture','UTF8'),'sha256'),'hex'),
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Chillywood2025/chillywood-mobile','codex/task-ios','ios','ci','medium',
  'repository','repository_apply_patch',array['docs/intelligence/'],
  now()-interval '1 minute',now()-interval '1 minute',now()+interval '1 hour',
  2,2,1000,1000,2,2,'40000000-0000-0000-0000-000000000001',
  repeat('d',64),'42000000-0000-0000-0000-000000000001',
  (select snapshot_hash from cognitive_test_snapshot)
);
select throws_ok(
  $$update public.cognitive_capabilities
    set capability_id='ghp_abcdefghijklmnopqrstuvwxyz'
    where id='43000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'capability identifiers reject secret-shaped values'
);
select throws_ok(
  $$update public.cognitive_capabilities
    set capability_id='AKIASYNTHETICFIXTURE'
    where id='43000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'capability identifiers reject AWS credential-shaped values'
);
select throws_ok(
  $$insert into public.tool_invocations(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
    data_class,retention_until,capability_id,call_id,operation,
    result_envelope_hash,result_untrusted,result_sanitized,result_truncated,output_bytes
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','cognitive_control_plane','tool-secret-call-fixture','received',
    'operational_metadata',now()+interval '30 days',
    '43000000-0000-0000-0000-000000000001',
    'ghp_abcdefghijklmnopqrstuvwxyz','repository_apply_patch',
    repeat('7',64),true,true,false,0
  )$$,
  '23514', null,
  'tool invocation call identifiers reject secret-shaped values'
);
select is(
  public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','approved','executing','cognitive_control_plane',repeat('2',64),
    '40000000-0000-0000-0000-000000000001',
    (select snapshot_hash from cognitive_test_snapshot)
  )::text,
  'executing',
  'approved task cannot execute until a same-scope active capability exists'
);
select throws_ok(
  $$select public.cognitive_consume_capability(
    'capability-fixture-001','wrong-bearer','nonce-fixture','call-wrong-proof',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/task-ios','ios','ci',
    'repository','repository_apply_patch','docs/intelligence/COGNITIVE_SECURITY_MODEL.md',
    100,0,repeat('d',64),(select snapshot_hash from cognitive_test_snapshot),repeat('2',64)
  )$$,
  'P0001','capability_scope_or_proof_rejected','opaque bearer proof is required'
);
select throws_ok(
  $$select public.cognitive_consume_capability(
    'capability-fixture-001','bearer-fixture','nonce-fixture','call-wrong-platform',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/task-ios','android','ci',
    'repository','repository_apply_patch','docs/intelligence/COGNITIVE_SECURITY_MODEL.md',
    100,0,repeat('d',64),(select snapshot_hash from cognitive_test_snapshot),repeat('3',64)
  )$$,
  'P0001','capability_scope_or_proof_rejected','iOS capability cannot authorize Android'
);
select throws_ok(
  $$select public.cognitive_consume_capability(
    'capability-fixture-001','bearer-fixture','nonce-fixture',
    'ghp_abcdefghijklmnopqrstuvwxyz',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/task-ios','ios','ci',
    'repository','repository_apply_patch','docs/intelligence/COGNITIVE_SECURITY_MODEL.md',
    100,0,repeat('d',64),(select snapshot_hash from cognitive_test_snapshot),repeat('3',64)
  )$$,
  'P0001','capability_scope_or_proof_rejected',
  'capability consumption rejects a secret-shaped call identifier before use'
);
select is(
  public.cognitive_consume_capability(
    'capability-fixture-001','bearer-fixture','nonce-fixture','call-valid-001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/task-ios','ios','ci',
    'repository','repository_apply_patch','docs/intelligence/COGNITIVE_SECURITY_MODEL.md',
    100,0,repeat('d',64),(select snapshot_hash from cognitive_test_snapshot),repeat('4',64)
  ),
  1,
  'valid capability use atomically consumes usage sequence one'
);
select is(
  public.cognitive_accept_tool_result(
    'capability-fixture-001','call-valid-001','bearer-fixture','nonce-fixture',
    '{"accepted":true,"value":"safe-result"}'::jsonb
  ),
  encode(
    extensions.digest(
      convert_to('{"value": "safe-result", "accepted": true}'::jsonb::text,'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'postflight computes the accepted envelope hash inside the trusted database boundary'
);
select throws_ok(
  $$select public.cognitive_consume_capability(
    'capability-fixture-001','bearer-fixture','nonce-fixture','call-valid-001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/task-ios','ios','ci',
    'repository','repository_apply_patch','docs/intelligence/COGNITIVE_SECURITY_MODEL.md',
    100,0,repeat('d',64),(select snapshot_hash from cognitive_test_snapshot),repeat('4',64)
  )$$,
  '23505','capability_replay','capability call ID replay is rejected'
);
select is(
  (select remaining_calls from public.cognitive_capabilities where capability_id='capability-fixture-001'),
  1,
  'rejected replay does not consume another call'
);
select throws_ok(
  $$insert into public.cognitive_capability_events(
    capability_id,task_id,project_id,platform,environment,call_id,
    usage_sequence,event_type,request_hash
  ) values (
    '43000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'android','ci','cross-task-event',2,'consumed',repeat('6',64)
  )$$,
  '23503',
  null,
  'capability lifecycle evidence cannot cross task or platform scope'
);
select throws_ok(
  $$insert into public.cognitive_capability_events(
    capability_id,task_id,project_id,platform,environment,call_id,
    usage_sequence,event_type,request_hash
  ) values (
    '43000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','ghp_abcdefghijklmnopqrstuvwxyz',2,'rejected',repeat('6',64)
  )$$,
  '23514', null,
  'capability lifecycle call identifiers reject secret-shaped values'
);

insert into public.intelligence_budgets(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  data_class,retention_until,
  immutable_ceiling_hash,max_model_tokens,max_model_cost,max_tool_calls,max_tool_bytes,
  max_child_tasks,max_recursion_depth,max_retries,deadline_at
) values (
  '44000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','budget-fixture','budget-atomic-fixture','active',
  'operational_metadata',now()+interval '30 days',
  repeat('5',64),1000,5,3,1000,2,2,2,now()+interval '1 hour'
);
select is(
  public.cognitive_reserve_budget(
    '44000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','reservation-001',100,1,2,500,1,
    1,0,1,repeat('6',64),(select snapshot_hash from cognitive_test_snapshot)
  ),
  true,
  'budget reservation succeeds atomically'
);
select throws_ok(
  $$select public.cognitive_reserve_budget(
    '44000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','reservation-overflow',100,1,2,600,2,
    1,0,1,repeat('7',64),(select snapshot_hash from cognitive_test_snapshot)
  )$$,
  'P0001','cognitive_budget_reservation_rejected','mid-plan budget overflow fails closed'
);
select is(
  public.cognitive_settle_budget(
    '44000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'reservation-001',80,0.5,1,400,0
  ),
  true,
  'budget settles actual usage without negative balance'
);
select is(
  (select used_tool_calls from public.intelligence_budgets where id='44000000-0000-0000-0000-000000000001'),
  1,
  'settled tool usage is retained'
);

-- Task-scoped finding dedupe and immutable resolution.
select lives_ok(
  $$select public.cognitive_record_finding(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','finding-fixture-key','executor_scope','path:_lib/x.ts','p1',repeat('5',64)
  )$$,
  'first finding detection succeeds'
);
select lives_ok(
  $$select public.cognitive_record_finding(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','finding-fixture-key','executor_scope','path:_lib/x.ts','p1',repeat('6',64)
  )$$,
  'finding recurrence is atomically deduped'
);
select throws_ok(
  $$select public.cognitive_record_finding(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','finding-secret-type-probe','ghp_abcdefghijklmnopqrstuvwxyz',
    'path:_lib/safe.ts','p1',repeat('5',64)
  )$$,
  'P0001','cognitive_finding_payload_rejected',
  'finding type cannot retain a secret-shaped identifier'
);
select throws_ok(
  $$select public.cognitive_record_finding(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','finding-secret-scope-probe','executor_scope',
    'scope.YWNjZXNzX3Rva2VuPXN5bnRoZXRpYy1maXh0dXJlLXZhbHVl',
    'p1',repeat('5',64)
  )$$,
  'P0001','cognitive_finding_payload_rejected',
  'finding target cannot retain an encoded secret-shaped value'
);
select throws_ok(
  $$select public.cognitive_record_finding(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','finding-private-scope-probe','executor_scope',
    'user@example.invalid','p1',repeat('5',64)
  )$$,
  'P0001','cognitive_finding_payload_rejected',
  'finding target cannot retain a private identifier'
);
select throws_ok(
  $$select public.cognitive_record_finding(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','finding-percent-scope-probe','executor_scope',
    'access%255Ftoken%253Dsynthetic-fixture-value',
    'p1',repeat('5',64)
  )$$,
  'P0001','cognitive_finding_payload_rejected',
  'finding target cannot retain nested percent-encoded secret material'
);
select throws_ok(
  $$select public.cognitive_record_finding(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','finding-folded-scope-probe','executor_scope',
    (
      with recursive encoded(depth, value) as (
        select 0, 'access_token=synthetic-fixture-value'::text
        union all
        select depth + 1,
          replace(encode(convert_to(value,'UTF8'),'base64'), E'\n', '')
        from encoded
        where depth < 3
      )
      select regexp_replace(value, '(.{8})', E'\\1 ', 'g')
      from encoded
      where depth = 3
    ),
    'p1',repeat('5',64)
  )$$,
  'P0001','cognitive_finding_payload_rejected',
  'finding target cannot retain whitespace-folded encoded secret material'
);
select throws_ok(
  $$select public.cognitive_record_finding(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','finding-dotted-secret-probe','executor_scope',
    'service_role.synthetic-fixture-value',
    'p1',repeat('5',64)
  )$$,
  'P0001','cognitive_finding_payload_rejected',
  'finding target cannot retain dotted service-role credential material'
);
select throws_ok(
  $$select public.cognitive_record_finding(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','finding-hex-secret-probe','executor_scope',
    encode(convert_to('api_key=synthetic-fixture-value','UTF8'),'hex'),
    'p1',repeat('5',64)
  )$$,
  'P0001','cognitive_finding_payload_rejected',
  'finding target cannot retain hexadecimal credential material'
);
select is(
  (select occurrence_count from public.cognitive_current_findings
   where task_id='20000000-0000-0000-0000-000000000001' and finding_key='finding-fixture-key'),
  2,
  'finding occurrence count increments'
);
select is(
  (select count(*)::integer from public.finding_lifecycle_events where task_id='20000000-0000-0000-0000-000000000001'),
  2,
  'each detection creates immutable lifecycle evidence'
);
select lives_ok(
  $$select public.cognitive_resolve_finding(
    '20000000-0000-0000-0000-000000000001','finding-fixture-key',repeat('7',64)
  )$$,
  'finding resolves through RPC'
);
select is(
  (select current_status from public.cognitive_current_findings
   where task_id='20000000-0000-0000-0000-000000000001' and finding_key='finding-fixture-key'),
  'resolved',
  'current finding state is resolved'
);
select is(
  (select count(*)::integer from public.finding_lifecycle_events
   where task_id='20000000-0000-0000-0000-000000000001' and event_type='resolved'),
  1,
  'resolution creates immutable event'
);
select lives_ok(
  $$select public.cognitive_erase_finding_details(
    '20000000-0000-0000-0000-000000000001',
    'finding-fixture-key',
    repeat('8',64),
    'cognitive_control_plane'
  )$$,
  'bounded finding details can be erased through the controlled RPC'
);
select is(
  (select finding_type || ':' || target_scope
   from public.cognitive_current_findings
   where task_id='20000000-0000-0000-0000-000000000001'
     and finding_key='finding-fixture-key'),
  'erased_finding:erased_scope',
  'finding erasure retains only bounded non-personal tombstone state'
);
select is(
  (select count(*)::integer from public.finding_lifecycle_events
   where task_id='20000000-0000-0000-0000-000000000001' and event_type='erased'),
  1,
  'finding erasure creates immutable lifecycle evidence'
);
select is(
  (select count(*)::integer from public.cognitive_erasure_events
   where task_id='20000000-0000-0000-0000-000000000001'
     and target_table='cognitive_current_findings'),
  1,
  'finding erasure creates a non-personal tombstone audit event'
);
select throws_ok(
  $$delete from public.finding_lifecycle_events where task_id='20000000-0000-0000-0000-000000000001'$$,
  '42501', 'immutable_cognitive_evidence', 'finding lifecycle cannot be deleted'
);

-- Learning is a closed typed numeric contract.
select throws_ok(
  $$insert into public.lessons(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
    learning_type,numeric_value,evaluation_result_id,outcome_evidence_hash
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','learning-fixture','lesson-authority-change','proposed',
    'approval_level',0,'99999999-0000-0000-0000-000000000001',repeat('8',64)
  )$$,
  '23514', null, 'learning cannot change approval authority'
);

-- Erasure records preserve only tombstone metadata.
select throws_ok(
  $$insert into public.solution_candidates(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
    summary,evidence_metadata,data_class,retention_until
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','privacy-fixture','unerasable-user-derived-candidate','received',
    '{"private":"synthetic"}'::jsonb,'{}'::jsonb,'user_derived',now()+interval '1 day'
  )$$,
  '23514', null,
  'tables outside the erasure RPC cannot retain user-derived content'
);
insert into public.knowledge_entities(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  summary,evidence_metadata,data_class,retention_until,legal_hold
) values (
  '70000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','privacy-fixture','user-derived-entity','current',
  '{"classification":"synthetic user-derived fixture"}'::jsonb,
  '{"source":"synthetic"}'::jsonb,
  'user_derived',now()+interval '1 day',false
);
select set_config('request.jwt.claim.cognitive_actor','privacy_compliance_operator',true);
select is(
  public.cognitive_erase_task_user_data(
    '20000000-0000-0000-0000-000000000001',repeat('8',64),
    'privacy_compliance_operator'
  ),
  1,
  'erasure RPC redacts one user-derived memory row'
);
select set_config('request.jwt.claim.cognitive_actor','cognitive_control_plane',true);
select is(
  (select summary from public.knowledge_entities where id='70000000-0000-0000-0000-000000000001'),
  '{}'::jsonb,
  'erasure removes retained user-derived summary content'
);
select is(
  (select data_class::text from public.knowledge_entities where id='70000000-0000-0000-0000-000000000001'),
  'operational_metadata',
  'erased memory retains only non-personal operational tombstone state'
);
select lives_ok(
  $$insert into public.cognitive_erasure_events(
    task_id,project_id,platform,environment,target_table,target_id,prior_data_class,
    tombstone_hash,legal_hold,erased_at,actor_identity
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','research_sources','30000000-0000-0000-0000-000000000001',
    'user_derived',repeat('9',64),false,now(),'erasure-fixture'
  )$$,
  'non-personal erasure tombstone accepted'
);
select throws_ok(
  $$delete from public.cognitive_erasure_events where target_id='30000000-0000-0000-0000-000000000001'$$,
  '42501', 'immutable_cognitive_evidence', 'erasure lifecycle cannot be deleted'
);

-- Resource leases prevent silent conflicting active writes.
create temporary table cognitive_test_lease(lease_id uuid not null);
insert into cognitive_test_lease(lease_id)
select public.cognitive_acquire_resource_lease(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','path','path:_lib/leased.ts','write',
  now()+interval '1 hour',repeat('a',64)
);
select is(
  (select count(*)::integer from public.cognitive_resource_lease_events
   where lease_id=(select lease_id from cognitive_test_lease) and event_type='acquired'),
  1,
  'resource acquisition creates immutable lease evidence'
);
select is(
  public.cognitive_release_resource_lease(
    (select lease_id from cognitive_test_lease),
    '20000000-0000-0000-0000-000000000001',
    'released',repeat('b',64)
  ),
  true,
  'resource lease is released through the scoped RPC'
);
select is(
  (select count(*)::integer from public.cognitive_resource_lease_events
   where lease_id=(select lease_id from cognitive_test_lease) and event_type='released'),
  1,
  'resource release creates immutable lease evidence'
);
select lives_ok(
  $$insert into public.cognitive_resource_leases(
    task_id,project_id,platform,environment,resource_type,resource_key,mode,
    issued_at,expires_at,heartbeat_at
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','path','path:_lib/x.ts','write',now(),now()+interval '1 hour',now()
  )$$,
  'first resource write lease accepted'
);
select throws_ok(
  $$insert into public.cognitive_resource_leases(
    task_id,project_id,platform,environment,resource_type,resource_key,mode,
    issued_at,expires_at,heartbeat_at
  ) values (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'android','ci','path','path:_lib/x.ts','write',now(),now()+interval '1 hour',now()
  )$$,
  '23505', null, 'conflicting resource write lease rejected'
);

-- Revocation is immediate, passing evaluation is mandatory, and rollback
-- failure performs real quarantine/escalation mutations.
select is(
  public.cognitive_revoke_capability(
    'capability-fixture-001','bounded fixture revocation',repeat('c',64)
  ),
  true,
  'capability revocation succeeds through the controlled lifecycle RPC'
);
select throws_ok(
  $$select public.cognitive_accept_tool_result(
    'capability-fixture-001','call-valid-001','bearer-fixture','nonce-fixture',
    '{"accepted":true,"value":"late-result"}'::jsonb
  )$$,
  'P0001','tool_result_postflight_rejected',
  'a result arriving after capability revocation is rejected'
);
insert into public.cognitive_capabilities(
  id,capability_id,bearer_hash,nonce_hash,task_id,project_id,repository_full_name,
  branch_name,platform,environment,risk_level,provider,operation,path_scopes,
  issued_at,not_before,expires_at,maximum_calls,remaining_calls,maximum_bytes,
  remaining_bytes,maximum_cost,remaining_cost,approval_request_id,
  approval_scope_hash,plan_snapshot_id,plan_snapshot_hash
) values (
  '43000000-0000-0000-0000-000000000002','capability-fixture-002',
  encode(extensions.digest(convert_to('bearer-fixture-2','UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('nonce-fixture-2','UTF8'),'sha256'),'hex'),
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Chillywood2025/chillywood-mobile','codex/task-ios','ios','ci','medium',
  'repository','repository_apply_patch',array['docs/intelligence/'],
  now()-interval '1 minute',now()-interval '1 minute',now()+interval '1 hour',
  1,1,1000,1000,2,2,'40000000-0000-0000-0000-000000000001',
  repeat('d',64),'42000000-0000-0000-0000-000000000001',
  (select snapshot_hash from cognitive_test_snapshot)
);
select is(
  public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','executing','evaluating','cognitive_control_plane',repeat('d',64),
    '40000000-0000-0000-0000-000000000001',
    (select snapshot_hash from cognitive_test_snapshot)
  )::text,
  'evaluating',
  'execution enters evaluation only with the immutable approval/snapshot binding'
);
select throws_ok(
  $$select public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','evaluating','completed','cognitive_control_plane',repeat('e',64),
    '40000000-0000-0000-0000-000000000001',
    (select snapshot_hash from cognitive_test_snapshot)
  )$$,
  'P0001','cognitive_transition_passing_evaluation_required',
  'task completion cannot be fabricated without a trusted passing evaluation'
);
select is(
  public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','evaluating','rollback_pending','cognitive_control_plane',repeat('f',64),
    null,null
  )::text,
  'rollback_pending',
  'failed evaluation may enter bounded rollback'
);
select is(
  public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','rollback_pending','rollback_running','cognitive_control_plane',repeat('1',64),
    null,null
  )::text,
  'rollback_running',
  'rollback enters its controlled running state'
);
select is(
  public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','rollback_running','rollback_failed','cognitive_control_plane',repeat('2',64),
    null,null
  )::text,
  'quarantined',
  'rollback failure atomically returns the quarantined terminal state'
);
select is(
  (select status::text from public.intelligence_tasks where id='20000000-0000-0000-0000-000000000001'),
  'quarantined',
  'rollback failure quarantines the task'
);
select is(
  (select status::text from public.cognitive_capabilities where capability_id='capability-fixture-002'),
  'revoked',
  'rollback failure revokes remaining task capabilities'
);
select is(
  (select count(*)::integer from public.cognitive_owner_review_requests
   where task_id='20000000-0000-0000-0000-000000000001' and request_type='rollback_failed'),
  1,
  'rollback failure creates one owner-review escalation'
);
select is(
  (select count(*)::integer from public.cognitive_current_findings
   where task_id='20000000-0000-0000-0000-000000000001'
     and finding_key='rollback-failed-quarantine' and current_status='open'),
  1,
  'rollback failure records one current critical quarantine finding'
);

insert into public.hypotheses(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  summary,evidence_metadata,data_class,retention_until,legal_hold
) values (
  '39000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','cognitive_control_plane','judge-transition-fixture','received',
  '{}'::jsonb,'{}'::jsonb,'operational_metadata',statement_timestamp()+interval '30 days',false
);
select set_config('request.jwt.claim.cognitive_actor','independent_evaluation_judge',true);
select throws_ok(
  $$select public.cognitive_transition_entity(
    'hypothesis','39000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','received','planned','independent_evaluation_judge',repeat('7',64),
    null,null,null,null
  )$$,
  '42501','cognitive_service_actor_mismatch',
  'independent evaluator cannot mutate general cognitive entity state'
);
select set_config('request.jwt.claim.cognitive_actor','cognitive_control_plane',true);

select throws_ok(
  $$insert into public.intelligence_tasks(
    id,project_id,task_key,platform,environment,objective_hash,status,actor_identity,
    repository_full_name,branch_name,deadman_at,retention_until,data_class
  ) values (
    '29000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','user-derived-task-fixture','ios','ci',
    repeat('8',64),'received','cognitive_control_plane',
    'Chillywood2025/chillywood-mobile','codex/cognitive-user-derived-fixture',
    statement_timestamp()+interval '1 hour',statement_timestamp()+interval '30 days','user_derived'
  )$$,
  '23514',null,
  'task rows cannot retain user-derived objective material'
);
select throws_ok(
  $$insert into public.research_sources
    select (jsonb_populate_record(
      null::public.research_sources,
      to_jsonb(source) || jsonb_build_object(
        'id','39000000-0000-0000-0000-000000000002',
        'dedupe_key','ancient-source-fixture',
        'retrieval_date','2000-01-01T00:00:00Z',
        'freshness_deadline','2126-01-01T00:00:00Z'
      )
    )).*
    from public.research_sources source
    where source.id='30000000-0000-0000-0000-000000000001'$$,
  '23514',null,
  'ancient caller-declared research freshness is rejected'
);

insert into public.intelligence_tasks(
  id,project_id,task_key,platform,environment,repository_full_name,branch_name,
  objective_hash,status,actor_identity,deadman_at,retention_until,data_class
) values (
  '29000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001','research-ingestion-fixture','shared','ci',
  'Chillywood2025/chillywood-mobile','codex/cognitive-research-ingestion',
  repeat('9',64),'received','research_source_broker',
  statement_timestamp()+interval '1 hour',statement_timestamp()+interval '30 days',
  'operational_metadata'
);
select set_config('request.jwt.claim.cognitive_actor','research_source_broker',true);
select throws_ok(
  $$select public.cognitive_record_research_source(
    '29000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'shared','ci','expo-docs','https://docs.expo.dev/research-source-fixture',
    'Expo',null,statement_timestamp(),statement_timestamp()+interval '30 days',
    'official_documentation',true,'Bounded broker-computed fixture excerpt.',
    'Official fixture','research-source-fixture',array[repeat('a',64)],
    'research_source_broker'
  )$$,
  'P0001','cognitive_research_broker_authority_unavailable',
  'caller-written source evidence cannot substitute for an unconfigured broker receipt authority'
);
select is(
  (select count(*)::integer from public.research_sources
   where task_id='29000000-0000-0000-0000-000000000002'),
  0,
  'unattested caller evidence is not persisted as research'
);
select set_config('request.jwt.claim.cognitive_actor','cognitive_control_plane',true);

-- Static schema properties that back remaining behavioral tests.
select col_is_pk('public', 'cognitive_projects', 'id', 'project identity is primary');
select col_not_null('public', 'intelligence_tasks', 'project_id', 'task project is required');
select col_not_null('public', 'intelligence_tasks', 'platform', 'task platform is required');
select col_not_null('public', 'intelligence_tasks', 'environment', 'task environment is required');
select col_not_null('public', 'cognitive_capabilities', 'approval_scope_hash', 'capability approval scope is required');
select col_not_null('public', 'cognitive_capabilities', 'plan_snapshot_hash', 'capability snapshot binding is required');
select col_not_null('public', 'execution_runs', 'snapshot_hash', 'run immutable snapshot hash is required');
select col_not_null('public', 'evaluation_results', 'evaluator_identity', 'evaluator identity is required');
select col_not_null('public', 'evaluation_results', 'executor_identity', 'executor identity is required');
select col_not_null('public', 'execution_plan_snapshots', 'data_class', 'snapshot data class is required');
select col_not_null('public', 'execution_plan_snapshots', 'retention_until', 'snapshot retention deadline is required');
select col_not_null('public', 'execution_plan_snapshots', 'legal_hold', 'snapshot legal-hold state is explicit');
select has_index('public', 'cognitive_capabilities', 'cognitive_capabilities_active_scope_idx', 'capability scope query is indexed');
select has_index('public', 'cognitive_resource_leases', 'cognitive_resource_lease_write_active_idx', 'write lease conflict is indexed');
select has_index('public', 'cognitive_state_transition_events', 'cognitive_state_transition_scope_idx', 'state lifecycle query is indexed');
select has_index('public', 'research_claim_sources', 'research_claim_sources_scope_idx', 'claim provenance query is indexed');

select * from finish();
rollback;
