-- Only inside the bounded forward envelope after its exact predecessor/empty checks.
-- Never replay the original transaction-bound paid-video install grant modules.
do $$begin
 if current_user<>'postgres' or session_user<>'postgres'
  or current_setting('transaction_read_only')<>'off'
  or current_setting('transaction_isolation')<>'repeatable read'
  or has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or exists(select 1 from pg_auth_members where member='postgres'::regrole
   and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 then raise exception 'authoring_forward_owner_interval_required';end if;
end $$;
-- operations.sql resets to postgres before its owned-wrapper ACL statements.
-- Exact inherited owner rights are temporary and revoked before final checks.
grant sbx_v1_core_owner to postgres with inherit true,set true;
grant create on schema public to sbx_v1_core_owner;
