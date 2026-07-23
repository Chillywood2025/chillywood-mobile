\set ON_ERROR_STOP on
set search_path = public, extensions;

begin;
select plan(14);

insert into public.intelligence_tasks(id, dedupe_key, status, summary)
values
  ('d2900000-0000-0000-0000-000000000001', 'd29-task-a', 'planned', '{"owner":"task-a"}'),
  ('d2900000-0000-0000-0000-000000000002', 'd29-task-b', 'planned', '{"owner":"task-b"}');

insert into public.research_sources(id, dedupe_key, source_reference, publisher, retrieval_date, source_type)
values ('d3200000-0000-0000-0000-000000000001', 'd32-source-evidence', 'https://example.invalid/evidence', 'Fixture Publisher', current_date, 'product_research');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d2800000-0000-0000-0000-000000000001","email":"member@example.invalid"}';
select throws_ok(
  $$insert into public.intelligence_tasks(dedupe_key) values ('d28-authenticated-write')$$,
  '42501',
  null,
  'D-28 authenticated client cannot insert a cognitive row'
);
select is(
  (select count(*)::integer from public.intelligence_tasks),
  0,
  'D-29 ordinary authenticated JWT sees no cognitive rows'
);
set local request.jwt.claims = '{"sub":"d2800000-0000-0000-0000-000000000001","email":"member@example.invalid","task_id":"d2900000-0000-0000-0000-000000000002","role":"owner"}';
select is(
  (select count(*)::integer from public.intelligence_tasks),
  0,
  'D-29 crafted task_id and role claims do not cross the RLS boundary'
);
reset role;

select lives_ok(
  $$insert into public.intelligence_tasks(dedupe_key, evidence_metadata)
    values ('d30-deep-secret', '{"level1":{"level2":{"level3":{"access_token":"credential-fixture-value"}}}}')$$,
  'D-30 deep access_token key is accepted by the current JSONB sanitizer (hostile observation)'
);
select is(
  public.cognitive_json_is_sanitized('{"level1":{"level2":{"level3":{"access_token":"credential-fixture-value"}}}}'),
  true,
  'D-30 sanitizer reports deeply nested access_token metadata as sanitized (hostile observation)'
);

update public.intelligence_tasks set status = 'resolved' where id = 'd2900000-0000-0000-0000-000000000001';
select throws_ok(
  $$delete from public.research_sources where id = 'd3200000-0000-0000-0000-000000000001'$$,
  'immutable cognitive evidence cannot be updated or deleted',
  'D-32 immutable evidence deletion is rejected'
);
select is(
  (select count(*)::integer from public.research_sources where id = 'd3200000-0000-0000-0000-000000000001'),
  1,
  'D-32 evidence remains preserved'
);
select is(
  (select status from public.intelligence_tasks where id = 'd2900000-0000-0000-0000-000000000001'),
  'resolved',
  'D-32 mutable task state resolves independently of evidence preservation'
);
select is(
  (select count(*)::integer from public.execution_runs where evidence_metadata @> '{"resolved_task_id":"d2900000-0000-0000-0000-000000000001"}'),
  0,
  'D-32 no immutable resolution audit is required (hostile observation)'
);

select throws_ok(
  $$insert into public.model_invocations(dedupe_key, model_label, prompt_policy_version, cost_usd)
    values ('d38-negative-model-cost', 'fixture-model', 'v1', -0.01)$$,
  '23514',
  null,
  'D-38 negative model cost is rejected'
);
select throws_ok(
  $$insert into public.model_invocations(dedupe_key, model_label, prompt_policy_version, cost_usd)
    values ('d38-overflow-model-cost', 'fixture-model', 'v1', 999999999999999999999999.99)$$,
  '22003',
  null,
  'D-38 overflow model cost is rejected'
);
select throws_ok(
  $$insert into public.intelligence_budgets(dedupe_key, max_tool_calls, max_duration_seconds, max_cost_usd, spent_cost_usd)
    values ('d38-negative-budget', 10, 600, -1, 0)$$,
  '23514',
  null,
  'D-38 negative maximum budget is rejected'
);

select ok(
  (select count(*) = 1 from pg_trigger where tgrelid = 'public.research_sources'::regclass and tgname = 'research_sources_immutable'),
  'D-32 evidence immutability trigger is present'
);
select ok(
  not has_table_privilege('authenticated', 'public.intelligence_tasks', 'INSERT'),
  'D-28 authenticated has no insert grant'
);

select * from finish();
rollback;
