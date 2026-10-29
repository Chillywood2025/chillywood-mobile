-- Captured managed Storage table authority, 2026-10-29; native synthetic fixture only.
-- Read-only source capture SHA256: dd0c5232b52c3d932126586ee22a89eae1a01ac1639136a9098b703fdcb32724
-- Apply only after the native runner verifies its exact isolated container and owned clone.
-- No policy, trigger, constraint, index, default, function, schema ACL, or global role changes.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '10s';
do $fixture$
declare
  before_definitions jsonb;
  after_definitions jsonb;
  actual_authority jsonb;
begin
  if current_database() !~ '^native_pgtap_[0-9a-f]{12}$' or session_user <> 'postgres' then
    raise exception 'managed_storage_authority_requires_owned_native_fixture';
  end if;
  lock table storage.buckets, storage.objects in access exclusive mode;
  if (select count(*) from pg_class c where c.oid in ('storage.objects'::regclass, 'storage.buckets'::regclass)
      and pg_get_userbyid(c.relowner) = 'postgres' and c.relacl is null
      and not c.relrowsecurity and not c.relforcerowsecurity) <> 2 then
    raise exception 'managed_storage_authority_unexpected_template_metadata';
  end if;
  if (select count(*) from pg_roles where rolname in
      ('postgres', 'supabase_storage_admin', 'service_role', 'authenticated', 'anon')) <> 5 then
    raise exception 'managed_storage_authority_existing_roles_required';
  end if;
  select jsonb_build_object(
    'attributes', (select jsonb_agg(to_jsonb(a) order by a.attrelid, a.attnum) from pg_attribute a
      where a.attrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'defaults', (select jsonb_agg(to_jsonb(d) order by d.adrelid, d.adnum) from pg_attrdef d
      where d.adrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'constraints', (select jsonb_agg(to_jsonb(c) order by c.oid) from pg_constraint c
      where c.conrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)
         or c.confrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'indexes', (select jsonb_agg(to_jsonb(i) order by i.indexrelid) from pg_index i
      where i.indrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'policies', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p
      where p.polrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'triggers', (select jsonb_agg(to_jsonb(t) order by t.oid) from pg_trigger t
      where t.tgrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'storage_functions', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p
      where p.pronamespace = 'storage'::regnamespace),
    'storage_schema', (select to_jsonb(n) from pg_namespace n where n.oid = 'storage'::regnamespace),
    'roles', (select jsonb_agg(to_jsonb(r) order by r.oid) from pg_roles r)) into before_definitions;
  alter table storage.buckets enable row level security;
  alter table storage.objects enable row level security;
  alter table storage.buckets owner to supabase_storage_admin;
  alter table storage.objects owner to supabase_storage_admin;
  grant select, insert, update, delete, truncate, references, trigger, maintain
    on storage.buckets, storage.objects to supabase_storage_admin, postgres with grant option;
  grant select, insert, update, delete, truncate, references, trigger, maintain
    on storage.buckets, storage.objects to service_role;
  grant select, insert, update, delete on storage.buckets, storage.objects to anon, authenticated;
  select jsonb_build_object(
    'attributes', (select jsonb_agg(to_jsonb(a) order by a.attrelid, a.attnum) from pg_attribute a
      where a.attrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'defaults', (select jsonb_agg(to_jsonb(d) order by d.adrelid, d.adnum) from pg_attrdef d
      where d.adrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'constraints', (select jsonb_agg(to_jsonb(c) order by c.oid) from pg_constraint c
      where c.conrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)
         or c.confrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'indexes', (select jsonb_agg(to_jsonb(i) order by i.indexrelid) from pg_index i
      where i.indrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'policies', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p
      where p.polrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'triggers', (select jsonb_agg(to_jsonb(t) order by t.oid) from pg_trigger t
      where t.tgrelid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
    'storage_functions', (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p
      where p.pronamespace = 'storage'::regnamespace),
    'storage_schema', (select to_jsonb(n) from pg_namespace n where n.oid = 'storage'::regnamespace),
    'roles', (select jsonb_agg(to_jsonb(r) order by r.oid) from pg_roles r)) into after_definitions;
  if before_definitions is distinct from after_definitions then
    raise exception 'managed_storage_authority_changed_definitions_or_global_roles';
  end if;
  select jsonb_agg(jsonb_build_object(
    'relation', 'storage.' || c.relname, 'owner', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
    'effective_acl', (select jsonb_agg(jsonb_build_object(
      'grantor', pg_get_userbyid(a.grantor),
      'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'privilege', a.privilege_type, 'grantable', a.is_grantable)
      order by pg_get_userbyid(a.grantor) collate "C",
        (case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end) collate "C",
        a.privilege_type collate "C", a.is_grantable)
      from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a))
    order by c.relname collate "C")
  into actual_authority from pg_class c where c.oid in ('storage.objects'::regclass, 'storage.buckets'::regclass);
  if actual_authority is distinct from $captured$[{"relation":"storage.buckets","owner":"supabase_storage_admin","rls":true,"force_rls":false,"effective_acl":[{"grantee":"anon","grantor":"supabase_storage_admin","grantable":false,"privilege":"DELETE"},{"grantee":"anon","grantor":"supabase_storage_admin","grantable":false,"privilege":"INSERT"},{"grantee":"anon","grantor":"supabase_storage_admin","grantable":false,"privilege":"SELECT"},{"grantee":"anon","grantor":"supabase_storage_admin","grantable":false,"privilege":"UPDATE"},{"grantee":"authenticated","grantor":"supabase_storage_admin","grantable":false,"privilege":"DELETE"},{"grantee":"authenticated","grantor":"supabase_storage_admin","grantable":false,"privilege":"INSERT"},{"grantee":"authenticated","grantor":"supabase_storage_admin","grantable":false,"privilege":"SELECT"},{"grantee":"authenticated","grantor":"supabase_storage_admin","grantable":false,"privilege":"UPDATE"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"DELETE"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"INSERT"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"MAINTAIN"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"REFERENCES"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"SELECT"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"TRIGGER"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"TRUNCATE"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"UPDATE"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"DELETE"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"INSERT"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"MAINTAIN"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"REFERENCES"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"SELECT"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"TRIGGER"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"TRUNCATE"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"UPDATE"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"DELETE"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"INSERT"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"MAINTAIN"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"REFERENCES"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"SELECT"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"TRIGGER"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"TRUNCATE"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"UPDATE"}]},{"relation":"storage.objects","owner":"supabase_storage_admin","rls":true,"force_rls":false,"effective_acl":[{"grantee":"anon","grantor":"supabase_storage_admin","grantable":false,"privilege":"DELETE"},{"grantee":"anon","grantor":"supabase_storage_admin","grantable":false,"privilege":"INSERT"},{"grantee":"anon","grantor":"supabase_storage_admin","grantable":false,"privilege":"SELECT"},{"grantee":"anon","grantor":"supabase_storage_admin","grantable":false,"privilege":"UPDATE"},{"grantee":"authenticated","grantor":"supabase_storage_admin","grantable":false,"privilege":"DELETE"},{"grantee":"authenticated","grantor":"supabase_storage_admin","grantable":false,"privilege":"INSERT"},{"grantee":"authenticated","grantor":"supabase_storage_admin","grantable":false,"privilege":"SELECT"},{"grantee":"authenticated","grantor":"supabase_storage_admin","grantable":false,"privilege":"UPDATE"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"DELETE"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"INSERT"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"MAINTAIN"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"REFERENCES"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"SELECT"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"TRIGGER"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"TRUNCATE"},{"grantee":"postgres","grantor":"supabase_storage_admin","grantable":true,"privilege":"UPDATE"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"DELETE"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"INSERT"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"MAINTAIN"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"REFERENCES"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"SELECT"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"TRIGGER"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"TRUNCATE"},{"grantee":"service_role","grantor":"supabase_storage_admin","grantable":false,"privilege":"UPDATE"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"DELETE"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"INSERT"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"MAINTAIN"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"REFERENCES"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"SELECT"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"TRIGGER"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"TRUNCATE"},{"grantee":"supabase_storage_admin","grantor":"supabase_storage_admin","grantable":true,"privilege":"UPDATE"}]}]$captured$::jsonb then
    raise exception 'managed_storage_authority_capture_mismatch';
  end if;
end;
$fixture$;
commit;
