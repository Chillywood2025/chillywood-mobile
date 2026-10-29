// Supabase-managed request helpers for the disposable schema replay only.
// Keep both PostgREST claim formats, including legacy-claim precedence and
// empty-setting handling, aligned with the upstream Auth migrations:
// https://github.com/supabase/auth/blob/master/migrations/20220224000811_update_auth_functions.up.sql
// https://github.com/supabase/auth/blob/master/migrations/20220531120530_add_auth_jwt_function.up.sql
export const managedRequestContextSQL = `
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim',true),''),
      nullif(current_setting('request.jwt.claims',true),''))::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')::text
  $$;
  create function auth.email() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.email',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email')::text
  $$;
`;

// Supabase PostgreSQL's initial schema grants API roles USAGE on extensions.
// This allows pgTAP/extension functions to resolve after SET ROLE without
// granting table access, schema CREATE, or changing any application policy.
export const managedExtensionUsageSQL =
  'grant usage on schema extensions to anon,authenticated,service_role;';

// Only for isolated fixture bootstrap; the managed UUID default is catalog-captured.
export const managedStorageObjectIDDefaultSQL = `
-- Test-only fidelity correction from the captured managed schema:
-- tests/fixtures/database-managed-schema-20261015.json, storage.objects.id.
-- Keep grants, policies, RLS, triggers, and the delete statement guard intact.
do $managed_storage_object_default$
declare
  column_type oid;
  default_expression text;
begin
  select attribute.atttypid, pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid)
    into column_type, default_expression
  from pg_catalog.pg_attribute attribute
  left join pg_catalog.pg_attrdef default_value
    on default_value.adrelid=attribute.attrelid and default_value.adnum=attribute.attnum
  where attribute.attrelid='storage.objects'::regclass
    and attribute.attname='id' and not attribute.attisdropped;
  if not found or column_type <> 'uuid'::regtype then
    raise exception 'managed_storage_fixture_id_shape_mismatch';
  end if;
  if default_expression is null then
    alter table storage.objects alter column id set default pg_catalog.gen_random_uuid();
  elsif default_expression not in ('gen_random_uuid()', 'pg_catalog.gen_random_uuid()') then
    raise exception 'managed_storage_fixture_id_default_mismatch';
  end if;
end;
$managed_storage_object_default$;
`;
