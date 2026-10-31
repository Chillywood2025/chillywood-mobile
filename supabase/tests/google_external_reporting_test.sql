begin;
select plan(14);
select has_function('public','admit_google_play_external_session',array['text','uuid','integer','uuid','text','integer'],
  'fresh native-input quote admission exists');
select has_function('public','bind_google_play_external_checkout',array['uuid','uuid','text','uuid','text','integer'],
  'exact reserved-quote binder exists');
select ok(has_function_privilege('authenticated',
  'public.admit_google_play_external_session(text,uuid,integer,uuid,text,integer)','EXECUTE'),
  'current authenticated buyer can request own automatic admission');
select ok(not has_function_privilege('anon',
  'public.admit_google_play_external_session(text,uuid,integer,uuid,text,integer)','EXECUTE'),
  'anonymous callers cannot request admission');
select ok(not has_function_privilege('authenticated',
  'public.bind_google_play_external_checkout(uuid,uuid,text,uuid,text,integer)','EXECUTE'),
  'client cannot bind arbitrary financial quote');
select ok(has_function_privilege('service_role',
  'public.bind_google_play_external_checkout(uuid,uuid,text,uuid,text,integer)','EXECUTE'),
  'authenticated checkout service can bind its verified quote');
select ok(not has_function_privilege('authenticated','public.claim_google_play_external_report(uuid)','EXECUTE'),
  'client cannot claim private report/token');
select ok(not has_function_privilege('authenticated','public.finish_google_play_external_report(uuid,uuid,jsonb)','EXECUTE'),
  'client cannot fabricate report acknowledgement');
select ok(not has_function_privilege('service_role',
  'private.enqueue_google_play_external_report(text,uuid,jsonb,text)','EXECUTE'),
  'outbox insertion is internal to reviewed financial projection');
select ok(not has_table_privilege('authenticated','private.google_play_external_launch_bindings','SELECT'),
  'buyers cannot read tokens including another buyer token');
select ok(not has_table_privilege('service_role','private.google_play_external_launch_bindings','SELECT'),
  'ordinary service table reads cannot export tokens');
select ok(not has_table_privilege('authenticated','private.google_play_external_report_outbox','INSERT'),
  'client cannot insert fake financial reporting obligation');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname in('google_play_external_program_config','google_play_external_admissions',
    'google_play_external_launch_bindings','google_play_external_transactions','google_play_external_report_outbox',
    'google_play_external_report_events') and c.relrowsecurity and c.relforcerowsecurity),6,
  'all six private reporting tables enable and force RLS');
select ok(not has_function_privilege('authenticated',
  'private.process_stripe_tip_webhook_lifecycle_before_google(text,uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE'),
  'preserved legacy projection cannot bypass atomic outbox wrapper');
select * from finish();
rollback;
