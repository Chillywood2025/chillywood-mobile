-- Native generated-clone harness verifies the migrated canonical ledger first.
-- Kept in fixtures because its admission clock is frozen only in that clone.
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
select ok(not has_function_privilege('anon','public.read_r2_qualification_test_run(text,text)','EXECUTE')
 and not has_function_privilege('anon','public.cas_r2_qualification_test_run(text,text,integer,jsonb)','EXECUTE'),'anon cannot read or CAS run');
select ok(not has_function_privilege('authenticated','public.read_r2_qualification_test_run(text,text)','EXECUTE')
 and not has_function_privilege('authenticated','public.cas_r2_qualification_test_run(text,text,integer,jsonb)','EXECUTE'),'authenticated cannot read or CAS run');
select ok(has_function_privilege('service_role','public.read_r2_qualification_test_run(text,text)','EXECUTE')
 and has_function_privilege('service_role','public.cas_r2_qualification_test_run(text,text,integer,jsonb)','EXECUTE'),'only proposed service RPC grants exist');
select ok((select bool_and(prosecdef and proconfig=array['search_path=""']) from pg_proc
 where oid in ('public.read_r2_qualification_test_run(text,text)'::regprocedure,'public.cas_r2_qualification_test_run(text,text,integer,jsonb)'::regprocedure)),
 'definer RPC search paths remain empty');
with a as (select '{"schema":1,"runId":"r2-retention-qualification-20261023-01","manifestHash":"2e3acd9b1075aa82d485dfb543776e7f72ff709ba03c2bd3f016a74e6a662201","revision":0,"phase":"new","pending":null,"completed":[],"reconciliations":0,"requestBudgetReserved":0,"observations":[],"updatedAt":"2026-10-23T00:00:00.000Z"}'::jsonb s),
b as (select s,s||'{"revision":1,"pending":"put_control","requestBudgetReserved":2}'::jsonb n from a)
select ok(r2_qualification_test_private.valid_transition(s,n,false,'2026-10-24T19:59:59.999Z')
 and not r2_qualification_test_private.valid_transition(s,n,false,'2026-10-24T20:00:00.000Z')
 and not r2_qualification_test_private.valid_transition(s,n,false,'2026-10-24T20:00:00.001Z'),
 'unmodified deadline predicate rejects exact cutoff and later') from b;
select * from finish();
rollback;
