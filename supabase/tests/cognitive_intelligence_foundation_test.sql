begin;
select plan(44);

select has_table('public', 'intelligence_tasks', 'intelligence tasks exist');
select has_table('public', 'research_sources', 'research sources exist');
select has_table('public', 'research_claims', 'research claims exist');
select has_table('public', 'knowledge_entities', 'knowledge entities exist');
select has_table('public', 'knowledge_relationships', 'knowledge relationships exist');
select has_table('public', 'architecture_components', 'architecture components exist');
select has_table('public', 'architecture_dependencies', 'architecture dependencies exist');
select has_table('public', 'decision_records', 'decision records exist');
select has_table('public', 'hypotheses', 'hypotheses exist');
select has_table('public', 'solution_candidates', 'solution candidates exist');
select has_table('public', 'experiments', 'experiments exist');
select has_table('public', 'experiment_results', 'experiment results exist');
select has_table('public', 'execution_plans', 'execution plans exist');
select has_table('public', 'execution_runs', 'execution runs exist');
select has_table('public', 'evaluation_results', 'evaluation results exist');
select has_table('public', 'lessons', 'lessons exist');
select has_table('public', 'playbooks', 'playbooks exist');
select has_table('public', 'model_invocations', 'model invocations exist');
select has_table('public', 'tool_invocations', 'tool invocations exist');
select has_table('public', 'intelligence_budgets', 'intelligence budgets exist');

select is((select count(*)::integer from information_schema.tables where table_schema='public' and table_name in (
  'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
  'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
  'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
  'model_invocations','tool_invocations','intelligence_budgets'
)), 20, 'all twenty cognitive tables are present');
select is((select count(*)::integer from pg_class where oid in (
  select format('public.%I', name)::regclass from unnest(array[
    'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
    'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
    'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
    'model_invocations','tool_invocations','intelligence_budgets'
  ]) name
) and relrowsecurity), 20, 'RLS is enabled on every cognitive table');
select is((select count(*)::integer from pg_class where oid in (
  select format('public.%I', name)::regclass from unnest(array[
    'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
    'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
    'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
    'model_invocations','tool_invocations','intelligence_budgets'
  ]) name
) and relforcerowsecurity), 20, 'forced RLS is enabled on every cognitive table');
select is((select count(*)::integer from information_schema.tables where table_schema='public' and table_name like 'intelligence_%' and has_table_privilege('anon', format('public.%I', table_name), 'INSERT')), 0, 'anonymous clients cannot insert intelligence rows');
select ok(not has_table_privilege('authenticated', 'public.execution_plans', 'INSERT'), 'authenticated clients cannot create execution plans');
select ok(has_table_privilege('service_role', 'public.execution_plans', 'INSERT'), 'service role may create bounded execution plans');
select ok(has_table_privilege('authenticated', 'public.intelligence_tasks', 'SELECT'), 'authenticated role has explicit read grant constrained by RLS');
select ok(has_function_privilege('service_role', 'public.cognitive_json_is_sanitized(jsonb)', 'EXECUTE'), 'service role can run the redaction constraint helper');
select ok(not has_function_privilege('anon', 'public.cognitive_json_is_sanitized(jsonb)', 'EXECUTE'), 'anonymous clients cannot invoke the redaction helper');
select is(public.cognitive_json_is_sanitized('{"password":"do-not-store"}'::jsonb), false, 'secret-like JSON is rejected');
select is(public.cognitive_json_is_sanitized('{"source":"official documentation"}'::jsonb), true, 'sanitized source metadata is accepted');

select throws_ok($$insert into public.intelligence_tasks(dedupe_key,platform) values ('task-invalid-platform','desktop')$$,
  '22P02', null, 'unknown platform values are rejected');
select lives_ok($$insert into public.intelligence_tasks(id,dedupe_key,platform,status,summary)
  values ('10000000-0000-0000-0000-000000000001','task-safe-fixture','shared','planned','{"objective":"fixture"}')$$,
  'sanitized intelligence task is accepted');
select lives_ok($$insert into public.execution_plans(id,dedupe_key,platform,status,branch_name,path_allowlist,tool_allowlist,max_tool_calls,max_duration_seconds,max_cost_usd,rollback_plan,expires_at)
  values ('20000000-0000-0000-0000-000000000001','plan-safe-fixture','shared','planned','codex/cognitive-platform-foundation',array['docs/'],array['git diff'],10,600,1.00,'revert draft commit',now()+interval '1 hour')$$,
  'bounded draft-branch execution plan is accepted');
select throws_ok($$insert into public.execution_plans(dedupe_key,branch_name,max_tool_calls,max_duration_seconds,max_cost_usd,rollback_plan)
  values ('plan-main-denied','main',10,600,1.00,'revert')$$,
  '23514', null, 'direct main execution plans are rejected');
select throws_ok($$insert into public.execution_plans(dedupe_key,branch_name,max_tool_calls,max_duration_seconds,max_cost_usd,rollback_plan,owner_approval_id,executor_approval_id)
  values ('plan-self-approval','codex/safe',10,600,1.00,'revert','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'executor self-approval is rejected');
select lives_ok($$insert into public.execution_runs(dedupe_key,plan_id,status,production_deployed,money_moved,user_rights_changed,public_release_executed)
  values ('run-safe-fixture','20000000-0000-0000-0000-000000000001','completed',false,false,false,false)$$,
  'source-only execution evidence is accepted');
select throws_ok($$insert into public.execution_runs(dedupe_key,plan_id,money_moved)
  values ('run-money-denied','20000000-0000-0000-0000-000000000001',true)$$,
  '23514', null, 'money movement cannot be recorded as a cognitive execution');
select lives_ok($$insert into public.research_sources(id,dedupe_key,source_reference,publisher,retrieval_date,source_type,is_primary,trusted_for_tool_execution)
  values ('40000000-0000-0000-0000-000000000001','source-official-fixture','https://example.invalid/official','Fixture Publisher',current_date,'official_documentation',true,false)$$,
  'sanitized untrusted research provenance is accepted');
select throws_ok($$update public.research_sources set publisher='Changed' where id='40000000-0000-0000-0000-000000000001'$$,
  'immutable cognitive evidence cannot be updated or deleted', 'raw research evidence is immutable');
select throws_ok($$insert into public.model_invocations(dedupe_key,model_label,prompt_policy_version,private_user_data_used)
  values ('model-private-denied','fixture-model','v1',true)$$,
  '23514', null, 'private user data cannot be used for model training or invocation memory');
select lives_ok($$insert into public.intelligence_budgets(dedupe_key,task_id,max_tool_calls,max_duration_seconds,max_cost_usd,spent_cost_usd,consumed_tool_calls)
  values ('budget-safe-fixture','10000000-0000-0000-0000-000000000001',10,600,5.00,1.00,2)$$,
  'bounded cognitive budget is accepted');
select throws_ok($$insert into public.intelligence_budgets(dedupe_key,max_tool_calls,max_duration_seconds,max_cost_usd,spent_cost_usd,consumed_tool_calls)
  values ('budget-overrun-denied',5,600,2.00,3.00,6)$$,
  '23514', null, 'cost and tool-call budget overruns are rejected');
select throws_ok($$insert into public.experiments(dedupe_key,production_activation_allowed)
  values ('experiment-production-denied',true)$$,
  '23514', null, 'foundation experiments cannot activate production');

select * from finish();
rollback;
