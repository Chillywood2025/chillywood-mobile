-- Bounded catalog contract of ONLY the new independent capture namespace and
-- its one public ingest RPC. No legacy schema, function body or user row read.
-- Execute with transaction-local search_path='' for stable deparsing.
select jsonb_build_object(
 'protocol','rcq-owned-dependency-contract-v1',
 'schema',(select jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',coalesce(nspacl::text,''))
  from pg_namespace where nspname='rc_qualification_capture_v1'),
 'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,
  'super',rolsuper,'createRole',rolcreaterole,'createDb',rolcreatedb,'bypassRls',rolbypassrls,'config',rolconfig) order by rolname)
  from pg_roles where rolname in ('rcq_v1_owner','rcq_v1_operator','rcq_v1_consumer')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
  'arguments',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),
  'acl',coalesce(p.proacl::text,''),'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'))
  order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='rc_qualification_capture_v1'
   or (n.nspname='public' and p.proname='isolated_test_store_capture_ingest_v1')),
 'relations',(select jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
  'acl',coalesce(c.relacl::text,''),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
  'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'notNull',a.attnotnull,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select jsonb_agg(jsonb_build_object('name',k.conname,'kind',k.contype,'validated',k.convalidated,
    'definition',pg_get_constraintdef(k.oid)) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
  'policies',(select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'roles',(select jsonb_agg(pg_get_userbyid(r) order by pg_get_userbyid(r)) from unnest(p.polroles) r),
    'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
    from pg_policy p where p.polrelid=c.oid),
  'triggers',(select jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) order by t.tgname)
    from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by c.relname)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='rc_qualification_capture_v1' and c.relkind not in ('i','I'))
);
