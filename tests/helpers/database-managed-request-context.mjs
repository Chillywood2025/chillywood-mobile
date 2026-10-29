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
