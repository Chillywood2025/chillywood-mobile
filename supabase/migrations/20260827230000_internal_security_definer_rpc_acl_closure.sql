-- Keep source-bearing and cross-user operational helpers behind their
-- postgres-owned SECURITY DEFINER callers. Revoking PUBLIC alone does not
-- remove Supabase's direct default grants to API roles.

revoke all on function public."admin_reports_target_state"(text, text)
  from public, anon, authenticated, service_role;

revoke all on function public."dmca_resolve_uploader_user_id"(text, text)
  from public, anon, authenticated, service_role;

revoke all on function public."account_purge_deidentification_counts"(text)
  from public, anon, authenticated, service_role;

-- This helper has an explicit service integration contract in the account
-- purge migrations. Its authenticated operational callers also continue to
-- invoke it as the postgres owner through their guarded definer wrappers.
grant execute on function public."account_purge_deidentification_counts"(text)
  to service_role;
