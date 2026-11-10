begin read only;
set local statement_timeout='4s';
set local transaction_timeout='5s';
set local lock_timeout='500ms';
set local jit=off;
set local work_mem='1MB';
set local max_parallel_workers_per_gather=0;
set local search_path='';
select 'historyRelation'::text kind,pg_catalog.to_jsonb(r) metadata from (select c.oid,c.relkind,c.relowner::regrole::text owner,c.relacl::text acl,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relpersistence from pg_catalog.pg_class c where c.oid='supabase_migrations.schema_migrations'::regclass) r
union all
select 'historyTrigger'::text kind,pg_catalog.to_jsonb(r) metadata from (select t.tgname,t.tgisinternal,t.tgenabled,pg_catalog.pg_get_triggerdef(t.oid) definition,pg_catalog.pg_get_functiondef(t.tgfoid) function_definition from pg_catalog.pg_trigger t where t.tgrelid='supabase_migrations.schema_migrations'::regclass) r
union all
select 'historyConstraint'::text kind,pg_catalog.to_jsonb(r) metadata from (select co.conname,pg_catalog.pg_get_constraintdef(co.oid) definition,co.convalidated from pg_catalog.pg_constraint co where co.conrelid='supabase_migrations.schema_migrations'::regclass) r
union all
select 'historyRule'::text kind,pg_catalog.to_jsonb(r) metadata from (select rulename,pg_catalog.pg_get_ruledef(oid) definition from pg_catalog.pg_rewrite where ev_class='supabase_migrations.schema_migrations'::regclass) r;
rollback;
