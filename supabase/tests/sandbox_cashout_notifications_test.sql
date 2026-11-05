begin;
select no_plan();
select is(private.sandbox_cashout_notification_state('prepared'),'requested','request is not payout success');
select is(private.sandbox_cashout_notification_state('funding_unknown'),'processing','ambiguous funding is processing');
select is(private.sandbox_cashout_notification_state('funded'),'processing','transfer is not bank payment');
select is(private.sandbox_cashout_notification_state('payout_pending'),'processing','pending is not paid');
select is(private.sandbox_cashout_notification_state('paid'),'test_paid','provider test paid is explicitly test-only');
select is(private.sandbox_cashout_notification_state('return_confirmed'),'returning','balance return proof is not completed recovery');
select is(private.sandbox_cashout_notification_state('returned'),'returned','completed recovery is distinct');
select is(private.sandbox_cashout_notification_state('unexpected'),null::text,'unknown phases fail closed');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in
  ('private.sandbox_cashout_executions'::regclass,'public.notification_activity_events'::regclass,
   'public.notification_activity_pushes'::regclass)),'execution and notification records retain FORCE RLS');
select ok(not has_function_privilege(r,fn,'execute'),r||' cannot invoke '||fn)
  from unnest(array['anon','authenticated','service_role']) r cross join unnest(array[
    'private.enqueue_sandbox_cashout_notification()',
    'private.sandbox_cashout_notification_state(text)',
    'private.resolve_account_notification_before_sandbox_cashout(public.notification_activity_events)',
    'public.reserve_notification_activity_push_before_sandbox_cashout(uuid,uuid,uuid)']) fn;
select ok(not has_table_privilege('authenticated','public.notification_activity_events','insert'),'client cannot forge payout notice');
select ok(not has_table_privilege('service_role','private.sandbox_cashout_executions','update'),'service cannot bypass canonical observation RPC');
select ok(has_function_privilege('service_role','public.reserve_notification_activity_push(uuid,uuid,uuid)','execute'),'only current reservation entry point remains available');
select ok(not has_function_privilege('authenticated','public.reserve_notification_activity_push(uuid,uuid,uuid)','execute'),'recipient cannot fetch phone tokens');
select ok(exists(select 1 from pg_trigger where tgrelid='private.sandbox_cashout_executions'::regclass
  and tgname='sandbox_cashout_status_notification' and not tgisinternal and tgenabled='O'),'notification observer is attached');
select is((select count(*)::int from pg_trigger where tgrelid='private.creator_cashout_executions'::regclass
  and tgfoid='private.enqueue_sandbox_cashout_notification()'::regprocedure),0,'no live payout notification hook or authority added');
select ok((select bool_and(proconfig @> array['search_path=""']) from pg_proc where oid in
  ('private.enqueue_sandbox_cashout_notification()'::regprocedure,
   'private.resolve_account_notification_activity(public.notification_activity_events)'::regprocedure,
   'public.reserve_notification_activity_push(uuid,uuid,uuid)'::regprocedure)),'definers use an empty search path');
select * from finish();
rollback;
