-- Review-only local pgTAP reproductions for Reviewer B.
-- These assertions document observed database behavior at implementation commit
-- bd8fd0c709db8ff843b69fa9b9a5039a74d09a94. They do not define desired
-- production behavior and must never be deployed as a migration.

begin;
select plan(47);

insert into public.platform_role_memberships(id, role, user_id, status)
values
  (910001, 'operator', '00000000-0000-0000-0000-000000000021', 'active'),
  (910002, 'owner', '00000000-0000-0000-0000-000000000022', 'active'),
  (910003, 'super_admin', '00000000-0000-0000-0000-000000000023', 'active');

set local role service_role;
insert into public.intelligence_tasks(id, dedupe_key, platform, status, summary)
values
  ('b0000000-0000-0000-0000-000000000001', 'review-task-ios-a', 'ios', 'denied', '{"task":"a"}'),
  ('b0000000-0000-0000-0000-000000000002', 'review-task-android-b', 'android', 'pending', '{"task":"b"}');
reset role;

select is(
  (select count(*)::integer from pg_class where relnamespace = 'public'::regnamespace
    and relname in (
      'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
      'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
      'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
      'model_invocations','tool_invocations','intelligence_budgets'
    ) and relkind = 'r'),
  20,
  'review confirms exactly twenty cognitive tables'
);

select is(
  (select count(*)::integer from pg_class where relnamespace = 'public'::regnamespace
    and relname in (
      'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
      'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
      'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
      'model_invocations','tool_invocations','intelligence_budgets'
    ) and relrowsecurity and relforcerowsecurity),
  20,
  'all cognitive tables enable and force RLS'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public'
    and tablename in (
      'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
      'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
      'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
      'model_invocations','tool_invocations','intelligence_budgets'
    )),
  20,
  'one SELECT-only policy exists per cognitive table'
);

select is(
  (select count(*)::integer from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
        'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
        'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
        'model_invocations','tool_invocations','intelligence_budgets'
      )
      and has_table_privilege('anon', format('public.%I', table_name), 'SELECT,INSERT,UPDATE,DELETE')),
  0,
  'anon has no cognitive table DML privilege'
);

select is(
  (select count(*)::integer from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
        'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
        'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
        'model_invocations','tool_invocations','intelligence_budgets'
      )
      and has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')),
  20,
  'authenticated has SELECT grants on all twenty tables, constrained by RLS'
);

select is(
  (select count(*)::integer from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
        'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
        'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
        'model_invocations','tool_invocations','intelligence_budgets'
      )
      and has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT,UPDATE,DELETE')),
  0,
  'authenticated has no cognitive write privilege'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000020"}', true);
select is((select count(*)::integer from public.intelligence_tasks), 0, 'normal authenticated user reads no cognitive rows');
select throws_ok(
  $$insert into public.intelligence_tasks(dedupe_key) values ('review-normal-client-write')$$,
  '42501',
  null,
  'normal authenticated user cannot insert cognitive state'
);
create function pg_temp.has_platform_role(text[])
returns boolean language sql immutable as $$select true$$;
select is(
  (select count(*)::integer from public.intelligence_tasks),
  0,
  'pg_temp has_platform_role shadow cannot override schema-qualified RLS helper'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000021"}', true);
select is(
  (select count(*)::integer from public.intelligence_tasks
   where id in ('b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002')),
  2,
  'operator can read every reviewed cognitive task'
);
select is(
  (select count(distinct platform)::integer from public.intelligence_tasks
   where id in ('b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002')),
  2,
  'operator read policy is not platform-scoped'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000022"}', true);
select is(
  (select count(*)::integer from public.intelligence_tasks
   where id in ('b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002')),
  2,
  'owner can read every reviewed cognitive task'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000023"}', true);
select is((select count(*)::integer from public.intelligence_tasks), 0, 'super_admin is omitted from cognitive read policy');
reset role;

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public'
     and table_name in (
       'research_sources','research_claims','knowledge_entities','knowledge_relationships','architecture_components',
       'architecture_dependencies','decision_records','hypotheses','solution_candidates','experiments','experiment_results',
       'execution_plans','execution_runs','evaluation_results','lessons','playbooks','model_invocations','tool_invocations'
     ) and column_name = 'task_id'),
  0,
  'eighteen task-derived tables have no task_id'
);

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public'
     and table_name in (
       'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
       'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
       'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
       'model_invocations','tool_invocations','intelligence_budgets'
     ) and column_name = 'tenant_id'),
  0,
  'no cognitive table models a tenant boundary'
);

select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'intelligence_budgets' and column_name = 'task_id'),
  'YES',
  'the only task_id, on intelligence_budgets, is nullable'
);

set local role service_role;
select lives_ok(
  $$update public.intelligence_tasks set status = 'executing' where id = 'b0000000-0000-0000-0000-000000000001'$$,
  'denied to executing transition is accepted'
);
select is((select status from public.intelligence_tasks where id = 'b0000000-0000-0000-0000-000000000001'), 'executing', 'arbitrary status update persists');

select lives_ok(
  $$insert into public.execution_plans(
      id,dedupe_key,platform,status,branch_name,path_allowlist,tool_allowlist,max_tool_calls,max_duration_seconds,
      max_cost_usd,rollback_plan,owner_approval_id,executor_approval_id
    ) values (
      'b1000000-0000-0000-0000-000000000001','review-synthetic-approval','ios','preflight_passed',
      'codex/review-fixture',array['docs/'],array['git diff'],10,600,1.00,'review rollback fixture',
      'b2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002'
    )$$,
  'synthetic approval identifiers and preflight-passed status are accepted without foreign keys'
);

select lives_ok(
  $$insert into public.execution_runs(
      id,dedupe_key,platform,status,plan_id,production_deployed,money_moved,user_rights_changed,public_release_executed
    ) values (
      'b3000000-0000-0000-0000-000000000001','review-cross-platform-run','android','completed',
      'b1000000-0000-0000-0000-000000000001',false,false,false,false
    )$$,
  'Android run may reference an iOS plan and be marked completed directly'
);

select lives_ok(
  $$insert into public.evaluation_results(
      dedupe_key,platform,status,completion_supported,evaluator_independent,evaluator_write_allowed
    ) values ('review-unlinked-evaluation','web','approved',true,true,false)$$,
  'completion-supporting evaluation is accepted without an execution run'
);

select lives_ok(
  $$update public.execution_plans
    set status='superseded', branch_name='codex/review-mutated', path_allowlist=array['supabase/'],
        rollback_plan='mutated after immutable run'
    where id='b1000000-0000-0000-0000-000000000001'$$,
  'plan context remains mutable after an immutable execution run references it'
);

select lives_ok(
  $$insert into public.research_claims(
      dedupe_key,platform,status,source_ids,claim,confidence,freshness_deadline
    ) values (
      'review-nonexistent-source','shared','pending',array['b4000000-0000-0000-0000-000000000099'::uuid],
      'sanitized review claim fixture',0.5,now()+interval '1 day'
    )$$,
  'research claim accepts nonexistent source IDs because the UUID array has no foreign key'
);

select lives_ok(
  $$insert into public.research_sources(
      id,dedupe_key,platform,status,source_reference,publisher,retrieval_date,source_type
    ) values (
      'b4000000-0000-0000-0000-000000000001','review-source-immutable','shared','pending',
      'https://example.invalid/review-fixture','Review Fixture',current_date,'official_documentation'
    )$$,
  'research source fixture is accepted'
);

select throws_ok(
  $$update public.research_sources set publisher='Changed' where id='b4000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table research_sources',
  'service_role lacks UPDATE privilege on immutable research source'
);
select throws_ok(
  $$delete from public.research_sources where id='b4000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table research_sources',
  'service_role lacks DELETE privilege on immutable research source'
);
reset role;

select throws_ok(
  $$update public.research_sources set publisher='Changed' where id='b4000000-0000-0000-0000-000000000001'$$,
  'immutable cognitive evidence cannot be updated or deleted',
  'immutability trigger rejects privileged research source UPDATE'
);
select throws_ok(
  $$delete from public.research_sources where id='b4000000-0000-0000-0000-000000000001'$$,
  'immutable cognitive evidence cannot be updated or deleted',
  'immutability trigger rejects privileged research source DELETE'
);

set local role service_role;

select is(public.cognitive_json_is_sanitized('{"api_key":"[review-fixture]"}'::jsonb), true, 'api_key-shaped metadata is accepted');
select is(public.cognitive_json_is_sanitized('{"access_token":"[review-fixture]"}'::jsonb), true, 'access_token-shaped metadata is accepted');
select is(public.cognitive_json_is_sanitized('{"signed_url":"https://example.invalid/review-fixture"}'::jsonb), true, 'signed_url-shaped metadata is accepted');

select lives_ok(
  $$insert into public.lessons(dedupe_key,status,summary)
    values ('review-authority-lesson','active','{"approval_level":0,"forbidden_scope":[]}'::jsonb)$$,
  'lesson can persist fields that the source learning policy declares forbidden'
);

select lives_ok(
  $$insert into public.knowledge_entities(dedupe_key,summary)
    values ('review-oversized-json',jsonb_build_object('payload',repeat('x',1048576)))$$,
  'one-megabyte JSONB metadata is accepted without a size bound'
);

select lives_ok(
  $$insert into public.research_claims(
      dedupe_key,source_ids,claim,confidence,freshness_deadline,private_user_data_used
    ) values ('review-private-content-flag',array[]::uuid[],'private-user-derived review fixture',0.5,now()+interval '1 day',false)$$,
  'private-user-derived text can be stored while the boolean flag remains false'
);

select lives_ok(
  $$insert into public.intelligence_tasks(dedupe_key,status,retention_until,expires_at)
    values ('review-expired-pending','pending',now()-interval '1 day',now()-interval '1 day')$$,
  'pending task with past expiry and retention timestamps is accepted'
);

select lives_ok(
  $$insert into public.intelligence_budgets(
      id,dedupe_key,task_id,max_tool_calls,max_duration_seconds,max_cost_usd,spent_cost_usd,consumed_tool_calls
    ) values (
      'b5000000-0000-0000-0000-000000000001','review-resettable-budget',
      'b0000000-0000-0000-0000-000000000001',10,600,1.00,1.00,10
    )$$,
  'exhausted budget fixture is accepted'
);
select lives_ok(
  $$update public.intelligence_budgets
    set max_tool_calls=100, max_cost_usd=25.00, spent_cost_usd=0, consumed_tool_calls=0
    where id='b5000000-0000-0000-0000-000000000001'$$,
  'service writer can reset and expand an exhausted budget'
);

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema='public' and table_name='tool_invocations'
     and column_name in ('capability_id','task_id','provider','repository','branch_name','issued_at','nonce','revoked_at','approval_id')),
  0,
  'tool invocation rows have none of the required capability binding columns'
);

select is(
  (select count(*)::integer from pg_constraint
   where conrelid in (
     'public.intelligence_tasks'::regclass,'public.research_claims'::regclass,'public.hypotheses'::regclass,
     'public.experiments'::regclass,'public.execution_plans'::regclass,'public.execution_runs'::regclass,
     'public.evaluation_results'::regclass,'public.intelligence_budgets'::regclass,'public.lessons'::regclass,'public.playbooks'::regclass
   ) and contype='c' and pg_get_constraintdef(oid) ilike '%status%in%'),
  0,
  'no domain state table has an allowed-status state-machine constraint'
);

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema='public' and table_name in (
     'intelligence_tasks','research_sources','research_claims','knowledge_entities','knowledge_relationships',
     'architecture_components','architecture_dependencies','decision_records','hypotheses','solution_candidates',
     'experiments','experiment_results','execution_plans','execution_runs','evaluation_results','lessons','playbooks',
     'model_invocations','tool_invocations','intelligence_budgets'
   ) and column_name='retention_until' and is_nullable='YES'),
  20,
  'retention_until is optional on all twenty tables'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgrelid in (
     'public.intelligence_tasks'::regclass,'public.knowledge_entities'::regclass,'public.execution_plans'::regclass,
     'public.intelligence_budgets'::regclass,'public.lessons'::regclass,'public.playbooks'::regclass
   ) and not tgisinternal and pg_get_triggerdef(oid) ilike '%updated_at%'),
  0,
  'mutable cognitive rows have no updated_at maintenance trigger'
);

select is(
  (select count(*)::integer from pg_index i
   join pg_class t on t.oid=i.indrelid
   where t.relnamespace='public'::regnamespace and t.relname in (
     'knowledge_relationships','architecture_dependencies','experiments','execution_runs','evaluation_results','intelligence_budgets'
   ) and pg_get_indexdef(i.indexrelid) ~ '\\((source_entity_id|target_entity_id|source_component_id|target_component_id|hypothesis_id|plan_id|execution_run_id|task_id)\\)'),
  0,
  'specialized foreign-key columns have no leading-column indexes'
);

select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('cognitive_json_is_sanitized','reject_cognitive_evidence_mutation') and p.prosecdef
  ),
  'new cognitive helper functions are not SECURITY DEFINER'
);

select ok(
  not has_function_privilege('anon','public.cognitive_json_is_sanitized(jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.cognitive_json_is_sanitized(jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.cognitive_json_is_sanitized(jsonb)','EXECUTE'),
  'sanitizer execution grants are restricted to service_role'
);

select ok(
  not has_schema_privilege('anon','public','CREATE')
  and not has_schema_privilege('authenticated','public','CREATE'),
  'client roles cannot create pg_temp-style replacements in public schema'
);

select is(
  (select count(*)::integer from information_schema.views where table_schema='public' and table_name like '%cognitive%'),
  0,
  'migration creates no cognitive views that could bypass RLS'
);

select is(
  (select count(*)::integer from information_schema.sequences where sequence_schema='public' and sequence_name like '%cognitive%'),
  0,
  'migration creates no cognitive sequences'
);

select * from finish();
rollback;
