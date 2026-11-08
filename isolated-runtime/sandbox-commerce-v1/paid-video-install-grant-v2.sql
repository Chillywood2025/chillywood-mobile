-- Same fresh transaction only. Use immediately before frozen paid-video media
-- wrappers, and again immediately before paid-video-access/gateway wrappers.
reset role;
do $$ begin
 if current_user<>'postgres' or session_user<>'postgres' or not exists(
  select 1 from sandbox_commerce_v1.paid_video_install_context
  where singleton and installer=current_user and transaction_id=pg_current_xact_id())
  or (select state from sandbox_commerce_v1.lifecycle where singleton)<>'disabled'
 then raise exception 'paid_video_fresh_install_transaction_required'; end if;
end $$;
grant usage,create on schema public to sbx_v1_core_owner;
