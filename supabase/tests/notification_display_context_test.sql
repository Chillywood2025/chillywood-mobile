begin;
select no_plan();
select ok(has_function_privilege('authenticated','public.read_my_notification_display_context(uuid[])','execute'),'authenticated can read own display context');
select ok(not has_function_privilege('anon','public.read_my_notification_display_context(uuid[])','execute'),'anonymous cannot hydrate inbox');
select ok(not has_function_privilege('service_role','public.read_my_notification_display_context(uuid[])','execute'),'service cannot impersonate inbox session');
select ok(has_function_privilege('service_role','public.read_creator_money_notification_display_context(uuid,uuid,text)','execute'),'service can resolve verified ledger metadata');
select ok(not has_function_privilege('authenticated','public.read_creator_money_notification_display_context(uuid,uuid,text)','execute'),'clients cannot probe another buyer ledger');
select ok(not has_function_privilege('anon','public.read_creator_money_notification_display_context(uuid,uuid,text)','execute'),'anonymous cannot probe ledger');
select ok(not has_function_privilege('authenticated','private.notification_money_display_from_ledger(uuid,uuid,text)','execute'),'private ledger resolver cannot bypass entry point');
select ok(not has_function_privilege('service_role','private.notification_target_display(uuid,text,text)','execute'),'worker cannot call arbitrary target resolver');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'public.read_my_notification_display_context(uuid[])'::regprocedure,
  'public.read_creator_money_notification_display_context(uuid,uuid,text)'::regprocedure)), 'entry points pin definer search path');
select is(private.notification_display_label(E'Exact\nName'||chr(8238),80),'Exact Name','labels remove line and bidi injection');
select throws_ok($$select public.read_my_notification_display_context(array[]::uuid[])$$,'42501','notification_display_current_session_required','even empty reads require exact current session');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.read_creator_money_notification_display_context('ed190000-0000-4000-8000-000000000001','ed190000-0000-4000-8000-000000000002','vip_access_active'),'{}'::jsonb,'missing ledger does not invent names');
reset role;
select * from finish();
rollback;
