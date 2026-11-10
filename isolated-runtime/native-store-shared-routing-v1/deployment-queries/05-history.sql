begin read only;
set local statement_timeout='4s';
set local transaction_timeout='5s';
set local lock_timeout='500ms';
set local jit=off;
set local work_mem='1MB';
set local max_parallel_workers_per_gather=0;
set local search_path='';
select 'historyRow'::text kind,pg_catalog.to_jsonb(r) metadata from (select version,name,pg_catalog.cardinality(statements) statement_count,pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.array_to_json(statements)::text,'UTF8')),'hex') statements_sha256 from supabase_migrations.schema_migrations where version='20261109151349' or name like '%legacy_exclusion%' order by version) r
union all
select 'historySummary'::text kind,pg_catalog.to_jsonb(r) metadata from (select count(*)::int history_count,max(version) latest_version from supabase_migrations.schema_migrations) r
union all
select 'historyColumn'::text kind,pg_catalog.to_jsonb(r) metadata from (select a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_catalog.pg_get_expr(d.adbin,d.adrelid) default_expression from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='supabase_migrations.schema_migrations'::regclass and a.attnum>0 and not a.attisdropped order by a.attnum) r;
rollback;
