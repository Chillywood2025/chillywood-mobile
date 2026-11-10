-- Exact transaction-only owner interval; no original installer replay.
do $$begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off'
 or current_setting('transaction_isolation')<>'repeatable read'
 or has_schema_privilege('sbx_v1_core_owner','public','CREATE')
 or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 or exists(select 1 from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner'))
 then raise exception 'r2_forward_owner_interval_required';end if;
end $$;
-- R2 source resets to postgres before owned wrapper ACLs; restore both rights
-- after the fixed source and verify final catalog/memberships before commit.
grant sbx_v1_core_owner to postgres with inherit true,set true;
grant create on schema public to sbx_v1_core_owner;
