-- Fresh combined install only, after journal/quote/claim/reservation and before the shared
-- permissions-finalize.sql. No existing shared-table privileges are changed.
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.native_store_install_commit_check() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (select state from sandbox_commerce_v1.lifecycle where singleton) is distinct from 'disabled'
  or (select preparation_enabled from sandbox_commerce_v1.native_store_quote_controls where singleton) is distinct from false
  or has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles member_role on member_role.oid=m.member
    where member_role.rolname='postgres' and r.rolname in('sbx_v1_core_owner','sbx_v1_authority_owner','sbx_v1_operator') and (m.set_option or m.inherit_option))
  or exists(select 1 from sandbox_commerce_v1.native_store_catalog_bindings)
  or exists(select 1 from sandbox_commerce_v1.native_store_selections)
  or exists(select 1 from sandbox_commerce_v1.native_store_claims)
  or exists(select 1 from sandbox_commerce_v1.native_store_dispatch_attempts)
  or exists(select 1 from sandbox_commerce_v1.native_store_reservations)
 then raise exception 'native_store_install_finalization_required';end if;
 return null;
end $$;
revoke all on function sandbox_commerce_v1.native_store_install_commit_check() from public,anon,authenticated,service_role;
-- The existing immutable install-context row was created earlier in this same
-- transaction; a separate marker schedules our final check at COMMIT.
create table sandbox_commerce_v1.native_store_install_marker(singleton boolean primary key check(singleton));
alter table sandbox_commerce_v1.native_store_install_marker enable row level security;
alter table sandbox_commerce_v1.native_store_install_marker force row level security;
create policy owner_only on sandbox_commerce_v1.native_store_install_marker for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.native_store_install_marker from public,anon,authenticated,service_role;
create trigger immutable before update or delete on sandbox_commerce_v1.native_store_install_marker for each row execute function sandbox_commerce_v1.native_store_quote_immutable();
create trigger immutable_truncate before truncate on sandbox_commerce_v1.native_store_install_marker for each statement execute function sandbox_commerce_v1.native_store_quote_immutable();
create constraint trigger native_store_finalized_before_commit after insert on sandbox_commerce_v1.native_store_install_marker
 deferrable initially deferred for each row execute function sandbox_commerce_v1.native_store_install_commit_check();
insert into sandbox_commerce_v1.native_store_install_marker values(true);
reset role;
