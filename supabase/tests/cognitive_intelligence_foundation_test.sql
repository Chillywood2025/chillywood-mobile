begin;
select no_plan();

-- Inventory and hard off-state.
select has_table('public', 'cognitive_projects', 'project boundary exists');
select has_table('public', 'intelligence_tasks', 'task boundary exists');
select has_table('public', 'execution_plan_snapshots', 'immutable plan snapshots exist');
select has_table('public', 'cognitive_capabilities', 'typed capabilities exist');
select has_table('public', 'cognitive_capability_events', 'capability lifecycle exists');
select has_table('public', 'cognitive_budget_events', 'budget lifecycle exists');
select has_table('public', 'cognitive_resource_leases', 'resource leases exist');
select has_table('public', 'cognitive_state_transition_events', 'state lifecycle exists');
select has_table('public', 'research_claim_sources', 'relational claim sources exist');
select has_table('public', 'research_contradictions', 'contradiction evidence exists');
select has_table('public', 'research_retrieval_events', 'retrieval lifecycle exists');
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
       'cognitive_resource_leases','cognitive_state_transition_events',
       'cognitive_current_findings','finding_lifecycle_events','cognitive_erasure_events'
     ]) name
   ) and relrowsecurity),
  34,
  'RLS enabled on all 34 cognitive tables'
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
       'cognitive_resource_leases','cognitive_state_transition_events',
       'cognitive_current_findings','finding_lifecycle_events','cognitive_erasure_events'
     ]) name
   ) and relforcerowsecurity),
  34,
  'FORCE RLS enabled on all 34 cognitive tables'
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

select has_function(
  'public',
  'cognitive_transition_task',
  array['uuid','uuid','cognitive_platform','cognitive_environment','cognitive_task_status','cognitive_task_status','text','text'],
  'task transition RPC exists'
);
select has_function(
  'public',
  'cognitive_consume_capability',
  array['text','text','uuid','uuid','text','text','cognitive_platform','cognitive_environment','text','text','text','bigint','numeric','text','text','text'],
  'atomic capability consumption RPC exists'
);
select ok(not has_function_privilege(
  'authenticated',
  'public.cognitive_transition_task(uuid,uuid,public.cognitive_platform,public.cognitive_environment,public.cognitive_task_status,public.cognitive_task_status,text,text)',
  'EXECUTE'
), 'authenticated cannot transition tasks');
select ok(has_function_privilege(
  'service_role',
  'public.cognitive_transition_task(uuid,uuid,public.cognitive_platform,public.cognitive_environment,public.cognitive_task_status,public.cognitive_task_status,text,text)',
  'EXECUTE'
), 'service role can invoke controlled task transition');
select is(
  (select proconfig::text from pg_proc where oid =
    'public.cognitive_transition_task(uuid,uuid,public.cognitive_platform,public.cognitive_environment,public.cognitive_task_status,public.cognitive_task_status,text,text)'::regprocedure),
  '{"search_path=\"\""}',
  'task RPC has fixed empty search_path'
);
select is(
  (select proconfig::text from pg_proc where oid =
    'public.cognitive_consume_capability(text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,bigint,numeric,text,text,text)'::regprocedure),
  '{"search_path=\"\""}',
  'capability RPC has fixed empty search_path'
);

select is(public.cognitive_json_is_sanitized('{"source":"official"}'::jsonb), true, 'bounded safe JSON accepted');
select is(public.cognitive_json_is_sanitized('{"password":"synthetic"}'::jsonb), false, 'nested secret key rejected');
select is(public.cognitive_json_is_sanitized('{"__proto__":{"x":1}}'::jsonb), false, 'prototype pollution key rejected');
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
     and qual like '%super_admin%'
     and qual like '%admin.cognitive.read%'),
  34,
  'all cognitive read policies require Owner/super-admin or the exact scoped permission'
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
    'ios','ci','received','planning','operator-fixture',repeat('d',64)
  )::text,
  'planning',
  'valid task transition succeeds'
);
select throws_ok(
  $$select public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','planning','completed','operator-fixture',repeat('e',64)
  )$$,
  'P0001', 'invalid_cognitive_task_transition', 'planned to completed fails closed'
);
select throws_ok(
  $$select public.cognitive_transition_task(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'android','ci','planning','awaiting_approval','operator-fixture',repeat('e',64)
  )$$,
  'P0001', 'task_scope_or_expected_state_mismatch', 'cross-platform transition rejected'
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

-- Relational research provenance and cross-task denial.
insert into public.research_sources(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  data_class,retention_until,source_reference_hash,canonical_url_hash,content_hash,
  publisher,publication_date,retrieval_date,freshness_deadline,source_type,is_primary,
  bounded_excerpt,trusted_for_tool_execution
) values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','research-fixture','source-official-fixture','accepted',
  'research_cache',now()+interval '30 days',repeat('1',64),repeat('2',64),repeat('3',64),
  'Official Fixture',now()-interval '2 days',now()-interval '1 day',now()+interval '7 days',
  'official_documentation',true,'Bounded fixture excerpt.',false
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
  publisher,publication_date,retrieval_date,freshness_deadline,source_type,is_primary,
  bounded_excerpt,trusted_for_tool_execution
) values (
  '30000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'android','ci','research-fixture','source-android-fixture','accepted',
  'research_cache',now()+interval '30 days',repeat('a',64),repeat('b',64),repeat('c',64),
  'Android Fixture',now()-interval '2 days',now()-interval '1 day',now()+interval '7 days',
  'official_documentation',true,'Bounded Android fixture excerpt.',false
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
select is(
  public.cognitive_transition_entity(
    'research_claim','31000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','pending','supported','research-fixture',repeat('a',64)
  ),
  'supported',
  'technical claim requires and accepts same-scope primary provenance'
);
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

insert into public.autonomous_approval_requests(
  id,system_id,action_id,requested_by_actor_type,approval_level,status,title,reason,
  risk_summary,proposed_action,allowed_write_scope,forbidden_scope,rollback_plan,
  kill_switch_plan,proof_plan,validation_plan,expires_at,approved_by,approved_at,
  metadata,platform
) values (
  '40000000-0000-0000-0000-000000000001',
  'product_intelligence_operator','repository_apply_patch','operator',3,'approved',
  'Local cognitive fixture','Local disposable database test','No production authority',
  'Patch one scoped documentation file','["docs/intelligence/"]'::jsonb,
  '["production","money","rights","auth","rls"]'::jsonb,
  'Revert scoped fixture commit','Emergency stop','Run required tests',
  'Verify immutable evidence',now()+interval '1 hour',
  '40000000-0000-0000-0000-000000000002',now(),
  jsonb_build_object('approval_scope_hash',repeat('d',64)),'ios'
);

insert into public.execution_plans(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  plan_version,branch_name,requested_actions,path_allowlist,required_test_ids,
  rollback_plan_hash,source_commit,graph_digest
) values (
  '41000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','planner-fixture','plan-snapshot-fixture','draft',1,
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
  'ios','ci',repeat('c',64),
  jsonb_build_object(
    'repository','Chillywood2025/chillywood-mobile',
    'branch','codex/task-ios',
    'actions',jsonb_build_array('repository_apply_patch'),
    'paths',jsonb_build_array('docs/intelligence/'),
    'tests',jsonb_build_array('cognitive-red-team'),
    'rollback','scoped revert'
  ),
  repeat('d',64),'40000000-0000-0000-0000-000000000001'
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
  repeat('1',64),repeat('2',64),
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Chillywood2025/chillywood-mobile','codex/task-ios','ios','ci','medium',
  'repository','repository_apply_patch',array['docs/intelligence/'],
  now()-interval '1 minute',now()-interval '1 minute',now()+interval '1 hour',
  2,2,1000,1000,2,2,'40000000-0000-0000-0000-000000000001',
  repeat('d',64),'42000000-0000-0000-0000-000000000001',repeat('c',64)
);
select throws_ok(
  $$select public.cognitive_consume_capability(
    'capability-fixture-001','call-wrong-platform',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/task-ios','android','ci',
    'repository','repository_apply_patch','docs/intelligence/COGNITIVE_SECURITY_MODEL.md',
    100,0,repeat('d',64),repeat('c',64),repeat('3',64)
  )$$,
  'P0001','capability_scope_or_budget_rejected','iOS capability cannot authorize Android'
);
select is(
  public.cognitive_consume_capability(
    'capability-fixture-001','call-valid-001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/task-ios','ios','ci',
    'repository','repository_apply_patch','docs/intelligence/COGNITIVE_SECURITY_MODEL.md',
    100,0,repeat('d',64),repeat('c',64),repeat('4',64)
  ),
  1,
  'valid capability use atomically consumes usage sequence one'
);
select throws_ok(
  $$select public.cognitive_consume_capability(
    'capability-fixture-001','call-valid-001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/task-ios','ios','ci',
    'repository','repository_apply_patch','docs/intelligence/COGNITIVE_SECURITY_MODEL.md',
    100,0,repeat('d',64),repeat('c',64),repeat('4',64)
  )$$,
  '23505','capability_replay','capability call ID replay is rejected'
);
select is(
  (select remaining_calls from public.cognitive_capabilities where capability_id='capability-fixture-001'),
  1,
  'rejected replay does not consume another call'
);

insert into public.intelligence_budgets(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  immutable_ceiling_hash,max_model_tokens,max_model_cost,max_tool_calls,max_tool_bytes,
  max_child_tasks,max_recursion_depth,max_retries,deadline_at
) values (
  '44000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ios','ci','budget-fixture','budget-atomic-fixture','active',
  repeat('5',64),1000,5,3,1000,2,2,2,now()+interval '1 hour'
);
select is(
  public.cognitive_reserve_budget(
    '44000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','reservation-001',100,1,2,500,1
  ),
  true,
  'budget reservation succeeds atomically'
);
select throws_ok(
  $$select public.cognitive_reserve_budget(
    '44000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'ios','ci','reservation-overflow',100,1,2,600,2
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
select has_index('public', 'cognitive_capabilities', 'cognitive_capabilities_active_scope_idx', 'capability scope query is indexed');
select has_index('public', 'cognitive_resource_leases', 'cognitive_resource_lease_write_active_idx', 'write lease conflict is indexed');
select has_index('public', 'cognitive_state_transition_events', 'cognitive_state_transition_scope_idx', 'state lifecycle query is indexed');
select has_index('public', 'research_claim_sources', 'research_claim_sources_scope_idx', 'claim provenance query is indexed');

select * from finish();
rollback;
