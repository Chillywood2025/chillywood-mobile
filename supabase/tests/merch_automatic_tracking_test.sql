begin;
select plan(12);
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
 where relnamespace='private'::regnamespace and relkind='r' and relname like 'merch_tracking_%'),'tracking tables force RLS');
select ok(not has_table_privilege('authenticated','private.merch_tracking_assignments','INSERT'),'seller assignment goes through exact-session RPC');
select ok(not has_table_privilege('service_role','private.merch_tracking_assignments','UPDATE'),'worker cannot rebind tracking identity');
select ok(not has_table_privilege('service_role','private.merch_tracking_qualification','INSERT'),'worker cannot activate provider');
select ok(not has_table_privilege('authenticated','private.merch_checkout_destination','SELECT'),'checkout destination is private');
select ok(not has_function_privilege('anon','public.get_merch_tracking(uuid)','EXECUTE'),'anonymous order tracking denied');
select ok(has_function_privilege('authenticated','public.assign_merch_tracking(uuid,text,text)','EXECUTE'),'authenticated seller RPC available with internal session/ownership check');
select ok(not has_function_privilege('authenticated','public.complete_merch_tracking_job(uuid,uuid,jsonb,boolean)','EXECUTE'),'seller cannot attest delivery');
select ok(has_function_privilege('service_role','public.complete_merch_tracking_job(uuid,uuid,jsonb,boolean)','EXECUTE'),'worker completion available');
select ok(not has_function_privilege('service_role','public.process_stripe_merch_before_destination(text,text,text,jsonb)','EXECUTE'),'old webhook wrapper cannot bypass destination capture');
select ok(not private.merch_tracking_configured('00000000-0000-4000-8000-000000000099'::uuid),'unknown merchant is not qualified');
select ok(not has_table_privilege('service_role','private.merch_checkout_destination_conflicts','DELETE'),'destination conflict cannot be erased by worker');
select * from finish();
rollback;
