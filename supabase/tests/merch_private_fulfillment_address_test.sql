begin;
select plan(10);
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
 where relnamespace='private'::regnamespace and relkind='r' and relname in
 ('merch_fulfillment_addresses','merch_fulfillment_address_conflicts','merch_fulfillment_address_access')),'address evidence and audit force RLS');
select ok(not has_table_privilege('authenticated','private.merch_fulfillment_addresses','SELECT'),'participant cannot list raw addresses');
select ok(not has_table_privilege('service_role','private.merch_fulfillment_addresses','INSERT'),'capture only through verified callback');
select ok(not has_table_privilege('service_role','private.merch_fulfillment_addresses','UPDATE'),'worker cannot rewrite destination');
select ok(not has_table_privilege('authenticated','private.merch_fulfillment_address_access','SELECT'),'audit is not a shared feed');
select ok(not has_table_privilege('service_role','private.merch_fulfillment_address_conflicts','DELETE'),'conflicts cannot be silently erased');
select ok(not has_function_privilege('anon','public.get_merch_fulfillment_address(uuid)','EXECUTE'),'anonymous read denied');
select ok(has_function_privilege('authenticated','public.get_merch_fulfillment_address(uuid)','EXECUTE'),'exact-session participant RPC is available');
select ok(not has_function_privilege('service_role','public.get_merch_fulfillment_address(uuid)','EXECUTE'),'service cannot bypass participant read');
select ok(not has_function_privilege('service_role','public.process_stripe_merch_before_fulfillment_address(text,text,text,jsonb)','EXECUTE'),'old callback cannot bypass new evidence capture');
select * from finish();
rollback;
