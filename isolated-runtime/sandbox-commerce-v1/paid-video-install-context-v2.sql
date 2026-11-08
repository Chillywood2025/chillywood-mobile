-- Fresh combined install only, after the frozen graph/delivery source. Run all
-- profile files in the same explicit transaction. No existing role is elevated.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.paid_video_install_context (
 singleton boolean primary key default true check(singleton), installer name not null,
 transaction_id xid8 not null, started_at timestamptz not null default transaction_timestamp()
);
alter table sandbox_commerce_v1.paid_video_install_context enable row level security;
alter table sandbox_commerce_v1.paid_video_install_context force row level security;
create policy core_owner on sandbox_commerce_v1.paid_video_install_context for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.paid_video_install_context from public,anon,authenticated,service_role;
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_install_context
 for each row execute function sandbox_commerce_v1.protect_resource_identity();
create function sandbox_commerce_v1.paid_video_install_commit_check_v2()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or (select state from sandbox_commerce_v1.lifecycle where singleton) is distinct from 'disabled'
  or (select enabled from sandbox_commerce_v1.paid_video_gateway_controls where singleton) is distinct from false
 then raise exception 'paid_video_install_finalization_required'; end if;
 return null;
end $$;
revoke all on function sandbox_commerce_v1.paid_video_install_commit_check_v2() from public,anon,authenticated,service_role;
-- A forgotten revoke or attempted activation aborts COMMIT, including when a
-- caller omits the final source file. Missing gateway tables also fail closed.
create constraint trigger finalized_before_commit after insert on sandbox_commerce_v1.paid_video_install_context
 deferrable initially deferred for each row execute function sandbox_commerce_v1.paid_video_install_commit_check_v2();
insert into sandbox_commerce_v1.paid_video_install_context(singleton,installer,transaction_id)
 values(true,session_user,pg_current_xact_id());
reset role;
