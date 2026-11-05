begin transaction read only;
set local search_path=pg_catalog,public;
select jsonb_build_object(
 'ledgerRulesAbsent',not exists(select 1 from pg_rewrite where ev_class='supabase_migrations.schema_migrations'::regclass),
 'observedAt',now(),'serverVersion',current_setting('server_version'),
 'historyCount',(select count(*) from supabase_migrations.schema_migrations),
 'priorHistorySHA256',(select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]'),'sha256'),'hex')
  from supabase_migrations.schema_migrations where version<>'20261105010859'),
 'observerHistory',(select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,
   'statementsSHA256',encode(extensions.digest(array_to_json(statements)::text,'sha256'),'hex'))),'[]'::jsonb)
   from supabase_migrations.schema_migrations where version='20261105010859'),
 'sandboxPredecessor',(select jsonb_build_object('version',version,'name',name,
   'statementsSHA256',encode(extensions.digest(array_to_json(statements)::text,'sha256'),'hex'))
   from supabase_migrations.schema_migrations where version='20261102194000'),
 'sandboxEnabled',(select enabled from private.sandbox_cashout_control where singleton),
 'sandboxExecutions',(select count(*) from private.sandbox_cashout_executions),
 'sandboxQualifications',(select count(*) from private.sandbox_cashout_qualifications),
 'workerEnabled',(select enabled from public.notification_activity_worker_config where singleton),
 'workerConfigSHA256',(select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(c) order by singleton)::text,'[]'),'sha256'),'hex') from public.notification_activity_worker_config c),
 'workerSchedule',(select jsonb_agg(jsonb_build_object('schedule',schedule,'active',active,'commandSHA256',encode(extensions.digest(command,'sha256'),'hex')) order by jobid)
   from cron.job where jobname='notification-activity-worker'),
 'moneySwitches',(select jsonb_object_agg(key,state) from public.platform_money_kill_switches),
 'discovery',(select jsonb_build_object('enabled',enabled,'collecting',collecting,'primaryDeliveryEnabled',primary_delivery_enabled) from private.discovery_invalidation_worker_config),
 'observerEvents',(select count(*) from public.notification_activity_events where event_kind='sandbox_cashout_status_updated'),
 'observerInAppRows',(select count(*) from public.notifications where notification_type='sandbox_cashout_status_updated'),
 'observerPushRows',(select count(*) from public.notification_activity_pushes p join public.notification_activity_events e on e.id=p.event_id where e.event_kind='sandbox_cashout_status_updated')
) as state;
rollback;
