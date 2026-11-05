select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object(
   'signature',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
   'sourceSHA256',encode(extensions.digest(p.prosrc,'sha256'),'hex'),
   'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,
   'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'volatility',p.provolatile,
   'config',p.proconfig,'result',pg_get_function_result(p.oid),
   'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
   'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='public' and (p.proname in ('authorize_notification_activity_worker','claim_notification_activity_batch','complete_notification_activity_push','finish_notification_activity')
    or p.proname like 'prepare_notification_activity%' or p.proname like 'reserve_notification_activity_push%'
    or p.proname like '%sandbox_creator_cashout%'))
   or (n.nspname='private' and (p.proname like '%notification%' or p.proname like '%sandbox_cashout%'
    or p.proname in ('refresh_merch_reconciliation_alerts','merch_reconciliation_health_snapshot','defer_duplicate_room_start')))),
 'tables',(select jsonb_agg(jsonb_build_object('name',n.nspname||'.'||c.relname,'owner',pg_get_userbyid(c.relowner),
   'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
   'anonSelect',has_table_privilege('anon',c.oid,'SELECT'),'authenticatedSelect',has_table_privilege('authenticated',c.oid,'SELECT'),
   'serviceSelect',has_table_privilege('service_role',c.oid,'SELECT'),
   'anonWrite',has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE'),
   'authenticatedWrite',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE'),
   'serviceWrite',has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE')) order by n.nspname,c.relname)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where (n.nspname='public' and c.relname in ('notifications','notification_preferences','user_push_tokens','wave1_push_installation_ownership',
   'notification_activity_events','notification_activity_pushes','notification_activity_worker_config'))
     or (n.nspname='private' and (c.relname in ('room_start_notification_bindings','room_start_notification_deliveries','merch_reconciliation_alert_state')
       or c.relname like 'sandbox_cashout_%') and c.relkind in ('r','p'))),
 'typeConstraint',(select pg_get_constraintdef(oid) from pg_constraint
   where conrelid='public.notifications'::regclass and conname='notifications_notification_type_check'),
 'typeConstraintState',(select jsonb_build_object('validated',convalidated,'enforced',coalesce((to_jsonb(c)->>'conenforced')::boolean,true)) from pg_constraint c
   where conrelid='public.notifications'::regclass and conname='notifications_notification_type_check'),
 'executionTriggers',(select jsonb_agg(jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled) order by tgname)
   from pg_trigger where tgrelid='private.sandbox_cashout_executions'::regclass and not tgisinternal)
) as contracts;
