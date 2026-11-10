begin read only;
set local statement_timeout='4s';
set local transaction_timeout='5s';
set local lock_timeout='500ms';
set local jit=off;
set local work_mem='1MB';
set local max_parallel_workers_per_gather=0;
set local search_path='';
select 'context'::text kind,pg_catalog.to_jsonb(r) metadata from (select current_user,session_user,current_database(),current_setting('server_version_num') server_version_num,current_setting('transaction_read_only') transaction_read_only,pg_catalog.pg_postmaster_start_time() database_start,pg_catalog.clock_timestamp() observed_at) r
union all
select 'activity'::text kind,pg_catalog.to_jsonb(r) metadata from (select state,count(*)::int sessions from pg_catalog.pg_stat_activity where backend_type='client backend' and pid<>pg_catalog.pg_backend_pid() group by state order by state) r;
rollback;
