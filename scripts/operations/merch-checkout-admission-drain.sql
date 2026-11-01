-- Read-only, fresh standalone snapshot on the same primary AFTER pause commit.
-- Conservatively report ALL transactions, not just recognizable RPC text.
-- Ignore neither idle-in-transaction sessions nor prepared transactions.
select jsonb_build_object(
 'observedAt',clock_timestamp(),
 'database',current_database(),
 'databaseOid',(select oid::bigint from pg_database where datname=current_database()),
 'systemIdentifier',(select system_identifier::text from pg_control_system()),
 'postmasterStart',pg_postmaster_start_time(),
 'serverAddress',inet_server_addr(), 'serverPort',inet_server_port(),
 'primary',not pg_is_in_recovery(),
 'trackActivities',current_setting('track_activities'),
 'readAllStats',pg_has_role(current_user,'pg_read_all_stats','USAGE'),
 'hiddenActivityRows',(select count(*) from pg_stat_activity where query='<insufficient privilege>'),
 'unknownActivityRows',(select count(*) from pg_stat_activity
  where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend'
   and (state is null or state='disabled' or (state<>'idle' and xact_start is null))),
 'transactions',coalesce((select jsonb_agg(jsonb_build_object(
  'pid',pid,'backendStart',backend_start,'user',usename,'state',state,
  'transactionStart',xact_start,'queryStart',query_start,
  'waitType',wait_event_type,'waitEvent',wait_event,'blockers',pg_blocking_pids(pid)))
  from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()
   and (xact_start is not null or state like 'idle in transaction%' or wait_event_type='Lock')),'[]'::jsonb),
 'preparedTransactions',(select count(*) from pg_prepared_xacts where database=current_database())
);
