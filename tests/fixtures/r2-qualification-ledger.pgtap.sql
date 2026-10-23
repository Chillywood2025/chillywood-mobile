-- Only the native generated clone harness installs the proposal before this.
-- NOT under supabase/tests: normal schema replay must never discover the ledger.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(12);
select is((select count(*)::integer from r2_qualification_test_private.run),0,'proposal creates no run or approval');
select ok((select relrowsecurity from pg_class where oid='r2_qualification_test_private.run'::regclass),'ledger RLS enabled');
select ok((select relforcerowsecurity from pg_class where oid='r2_qualification_test_private.run'::regclass),'ledger FORCE RLS enabled');
select is((select count(*)::integer from pg_policy where polrelid='r2_qualification_test_private.run'::regclass),0,'no permissive ledger policy');
select ok(not has_schema_privilege('anon','r2_qualification_test_private','USAGE'),'anon has no private schema access');
select ok(not has_schema_privilege('authenticated','r2_qualification_test_private','USAGE'),'authenticated has no private schema access');
select ok(not has_schema_privilege('service_role','r2_qualification_test_private','USAGE'),'service has no direct ledger access');
select ok(not has_function_privilege('anon','public.read_r2_qualification_test_run(text,text)','EXECUTE'),'anon cannot read run');
select ok(not has_function_privilege('authenticated','public.cas_r2_qualification_test_run(text,text,integer,jsonb)','EXECUTE'),'authenticated cannot CAS run');
select ok(has_function_privilege('service_role','public.read_r2_qualification_test_run(text,text)','EXECUTE')
 and has_function_privilege('service_role','public.cas_r2_qualification_test_run(text,text,integer,jsonb)','EXECUTE'),'only proposed service RPC grants exist');
select ok((select bool_and(prosecdef and proconfig=array['search_path=""']) from pg_proc
 where oid in ('public.read_r2_qualification_test_run(text,text)'::regprocedure,'public.cas_r2_qualification_test_run(text,text,integer,jsonb)'::regprocedure)),
 'definer RPC search paths remain empty');
with a as (select '{"schema":1,"runId":"r2-retention-qualification-20261023-01","manifestHash":"f93701090ba98aa8696421b0e14fb9be6cc36b0ef293061dd751e82cdb8db9f9","revision":0,"phase":"new","pending":null,"completed":[],"reconciliations":0,"requestBudgetReserved":0,"observations":[],"updatedAt":"2026-10-23T00:00:00.000Z"}'::jsonb s),
b as (select s,s||'{"revision":1,"pending":"put_control","requestBudgetReserved":1}'::jsonb n from a)
select ok(r2_qualification_test_private.valid_transition(s,n,false,'2026-10-24T19:59:59.999Z')
 and not r2_qualification_test_private.valid_transition(s,n,false,'2026-10-24T20:00:00.000Z')
 and not r2_qualification_test_private.valid_transition(s,n,false,'2026-10-24T20:00:00.001Z'),
 'unmodified deadline predicate rejects exact cutoff and later') from b;
select * from finish();
rollback;
