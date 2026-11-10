begin read only;
set local statement_timeout='4s';
set local transaction_timeout='5s';
set local lock_timeout='500ms';
set local jit=off;
set local work_mem='1MB';
set local max_parallel_workers_per_gather=0;
set local search_path='';
select 'defaultAcl'::text kind,pg_catalog.to_jsonb(r) metadata from (select d.oid,d.defaclrole::regrole::text owner,n.nspname,d.defaclobjtype,d.defaclacl::text acl from pg_catalog.pg_default_acl d left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace order by d.oid) r
union all
select 'role'::text kind,pg_catalog.to_jsonb(r) metadata from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig from pg_catalog.pg_roles where rolname in('postgres','anon','authenticated','service_role','supabase_admin','supabase_read_only_user') order by rolname) r
union all
select 'membership'::text kind,pg_catalog.to_jsonb(r) metadata from (select roleid::regrole::text role,member::regrole::text member,grantor::regrole::text grantor,admin_option,inherit_option,set_option from pg_catalog.pg_auth_members order by roleid,member) r
union all
select 'schema'::text kind,pg_catalog.to_jsonb(r) metadata from (select oid,nspname,nspowner::regrole::text owner,nspacl::text acl from pg_catalog.pg_namespace where nspname in('public','supabase_migrations')) r;
rollback;
