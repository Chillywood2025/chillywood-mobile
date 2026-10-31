begin;
select plan(12);
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where relnamespace='private'::regnamespace
 and relname in('merch_return_cases','merch_return_case_events','merch_return_case_hold_events')),'case history and aggregate evidence force RLS');
select ok(not has_table_privilege('authenticated','private.merch_return_cases','SELECT'),'no raw cross-order case listing');
select ok(not has_table_privilege('service_role','private.merch_return_cases','INSERT'),'no service case bypass');
select ok(not has_table_privilege('authenticated','private.merch_return_case_events','UPDATE'),'parties cannot rewrite history');
select ok(not has_table_privilege('service_role','private.merch_return_case_hold_events','DELETE'),'aggregate holds cannot be erased');
select ok(not has_function_privilege('anon','public.submit_merch_return_case(uuid,uuid,text,text)','EXECUTE'),'anonymous submit denied');
select ok(not has_function_privilege('service_role','public.respond_merch_return_case(uuid,uuid,text,text)','EXECUTE'),'staff action cannot use service bypass');
select ok(has_function_privilege('authenticated','public.read_merch_return_cases(uuid)','EXECUTE'),'exact actor read RPC available');
select ok(has_function_privilege('authenticated','public.submit_merch_return_case(uuid,uuid,text,text)','EXECUTE'),'exact buyer submit RPC available');
select ok(has_function_privilege('authenticated','public.list_merch_return_review_cases(integer)','EXECUTE'),'scoped staff queue RPC available');
select ok(not has_function_privilege('authenticated','private.merch_return_case_staff()','EXECUTE'),'internal staff authority is not public');
select ok(not has_function_privilege('service_role','public.merch_order_projection_before_cases(public.merch_orders)','EXECUTE'),'old projection cannot bypass case aggregation');
select * from finish();
rollback;
