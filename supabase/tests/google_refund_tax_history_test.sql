begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(9);
select has_table('private','google_refund_tax_history','Google tax history is private');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
 where oid='private.google_refund_tax_history'::regclass),'history FORCE RLS');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) r(role)
 cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(privilege)
 where has_table_privilege(r.role,'private.google_refund_tax_history',p.privilege)),
 'no API role can read or write checkpoints directly');
select ok(has_function_privilege('service_role','public.begin_google_refund_tax_history(uuid,text)','execute'),
 'server can claim bounded tax history');
select ok(has_function_privilege('service_role','public.save_google_refund_tax_history(uuid,uuid,uuid,jsonb,jsonb)','execute'),
 'server can save lease-bound evidence');
select ok(not has_function_privilege('anon','public.begin_google_refund_tax_history(uuid,text)','execute')
 and not has_function_privilege('authenticated','public.begin_google_refund_tax_history(uuid,text)','execute'),
 'clients cannot claim provider history');
select ok(not has_function_privilege('anon','public.save_google_refund_tax_history(uuid,uuid,uuid,jsonb,jsonb)','execute')
 and not has_function_privilege('authenticated','public.save_google_refund_tax_history(uuid,uuid,uuid,jsonb,jsonb)','execute'),
 'clients cannot certify tax evidence');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) r(role)
 where has_function_privilege(r.role,'private.lock_google_refund_tax_history_context(uuid)','execute')),
 'internal lock helper has no API execution grant');
select is((select count(*)::integer from private.google_refund_tax_history),0,
 'migration creates no provider history or qualification');
select * from finish();
rollback;
