begin;
select plan(9);
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='private.creator_event_provider_coverage_receipts'::regclass),'provider facts force RLS');
select ok(not has_table_privilege('authenticated','private.creator_event_provider_coverage_receipts','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','private.creator_event_provider_coverage_receipts','SELECT,INSERT,UPDATE,DELETE'),
  'API roles cannot read or fabricate immutable provider coverage');
select ok(not has_function_privilege('authenticated',
  'public.record_creator_event_broadcast_provider_coverage(uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb,uuid,text,text)','execute')
  and has_function_privilege('service_role',
  'public.record_creator_event_broadcast_provider_coverage(uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb,uuid,text,text)','execute'),
  'only authenticated backend producer can append provider timing');
select ok(not has_function_privilege('service_role','private.creator_event_verified_coverage(uuid,jsonb)','execute')
  and not has_function_privilege('authenticated','private.creator_event_verified_coverage(uuid,jsonb)','execute'),
  'coverage evaluator is private issuer-only');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'private.creator_event_verified_coverage(uuid,jsonb)'::regprocedure,
  'public.record_creator_event_broadcast_provider_coverage(uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb,uuid,text,text)'::regprocedure)),
  'definer boundaries pin empty search path');
select ok(exists(select 1 from pg_trigger where tgrelid='private.creator_event_provider_coverage_receipts'::regclass
  and tgname='creator_event_provider_coverage_immutable' and not tgisinternal),'provider facts cannot be overwritten or deleted');
select is(private.creator_event_provider_ns('"1800000000000000001"'::jsonb),1800000000000000001::numeric,'nanosecond decimal strings remain exact');
select ok(private.creator_event_provider_ns('1800000000000000001'::jsonb) is null
  and private.creator_event_provider_ns('"9223372036854775808"'::jsonb) is null,'numeric JSON and overflowing int64 cannot become evidence');
select is((select count(*) from private.creator_event_provider_coverage_receipts),0::bigint,'migration invents no historical coverage');
select * from finish();
rollback;
