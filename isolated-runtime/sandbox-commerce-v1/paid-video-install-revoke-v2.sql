-- Immediately after each bounded CREATE interval, before the final baseline
-- permissions-finalize.sql. Do not commit between these files.
reset role;
do $$ begin
 if current_user<>'postgres' or session_user<>'postgres' or not exists(
  select 1 from sandbox_commerce_v1.paid_video_install_context
  where singleton and installer=current_user and transaction_id=pg_current_xact_id())
 then raise exception 'paid_video_fresh_install_transaction_required'; end if;
end $$;
revoke create on schema public from sbx_v1_core_owner;
do $$ begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE') then raise exception 'paid_video_install_create_not_revoked'; end if;
end $$;
