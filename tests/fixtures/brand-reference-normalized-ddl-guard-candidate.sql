-- BEGIN immutable normalized helper DDL safeguard
-- Freeze the complete pg_proc rows, including owner and ACL, after grants and
-- before creating any dependent index. Do not inspect only command object IDs:
-- a batched GRANT/REVOKE can report a command without an individual function OID.
-- No application row, cache, new metadata table, or shared guard is involved.
-- Experimental cascade repair: the same private-purpose, non-executable
-- invoker guard lives in the existing extensions schema, so dropping private
-- cannot remove its checker before sql_drop. Namespace change requires review
-- before migration integration. Deliberately removing this guard or its own
-- namespace remains outside the active-guard lifetime guarantee.
do $install_brand_index_guard$
declare
 protected_oids oid[];
 expected jsonb;
begin
 protected_oids:=array[
   'private.platform_brand_index_jsonb_bytes_v1(jsonb)'::regprocedure::oid,
   'private.platform_brand_index_normalize_v1(text)'::regprocedure::oid];
 select jsonb_agg((to_jsonb(p)-'proacl')||jsonb_build_object('namespace_name',n.nspname,
   'acl',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
     from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a)) order by p.oid)
 into expected
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where p.oid=any(protected_oids);
 if jsonb_array_length(expected) is distinct from 2 then
   raise exception using errcode='55000',message='brand_index_helper_install_incomplete';
 end if;
 execute format($guard_definition$
create function extensions.guard_platform_brand_index_helper_ddl_v1()
returns event_trigger
language plpgsql volatile security invoker parallel unsafe set search_path='' as $guard_body$
declare
 protected_oids constant oid[]:=%L::oid[];
 expected constant jsonb:=%L::jsonb;
 actual jsonb;
begin
 select jsonb_agg((to_jsonb(p)-'proacl')||jsonb_build_object('namespace_name',n.nspname,
   'acl',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
     from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a)) order by p.oid)
 into actual
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where p.oid=any(protected_oids);
 if actual is distinct from expected then
   raise exception using errcode='55000',message='brand_index_helper_immutable',
     detail='Versioned Brand index helpers, their owners, ACLs and namespace must remain unchanged while their indexes exist.',
     hint='Introduce a reviewed new helper version and rebuild dependent indexes before retiring this version.';
 end if;
end
$guard_body$;
$guard_definition$,protected_oids,expected);
end
$install_brand_index_guard$;
revoke all on function extensions.guard_platform_brand_index_helper_ddl_v1()
 from public,anon,authenticated,service_role;
create event trigger platform_brand_index_helper_ddl_v1
 on ddl_command_end execute function extensions.guard_platform_brand_index_helper_ddl_v1();
create event trigger platform_brand_index_helper_drop_v1
 on sql_drop execute function extensions.guard_platform_brand_index_helper_ddl_v1();
-- END immutable normalized helper DDL safeguard
