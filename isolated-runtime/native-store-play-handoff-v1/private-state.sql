-- Forward-only private observation capability; no raw table grants or activation.
do $$begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off'
  or not exists(select 1 from pg_roles where rolname='supabase_read_only_user' and not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication)
  or to_regclass('sandbox_commerce_v1.native_store_play_handoff_control') is null
  or to_regclass('sandbox_commerce_v1.native_store_play_raw_effects') is null
 then raise exception 'play_private_reader_prerequisites_required';end if;
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member
   where u.rolname='postgres' and r.rolname='sbx_v1_core_owner' and (m.set_option or m.inherit_option))
 then raise exception 'play_private_owner_interval_required';end if;
end $$;
grant sbx_v1_core_owner to postgres with inherit false,set true;
grant create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.native_store_play_private_state_v1() returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if session_user<>'supabase_read_only_user' or current_user<>'sbx_v1_core_owner'
  or current_setting('transaction_read_only')<>'on' or current_setting('transaction_isolation')<>'repeatable read'
  or current_setting('statement_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
  or current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
  or exists(select 1 from pg_catalog.pg_roles where rolname=session_user and (rolsuper or rolcreaterole or rolcreatedb or rolreplication))
 then raise exception 'play_private_read_context_required' using errcode='42501';end if;
 return jsonb_build_object('protocol','native-store-play-private-state-v1','reader',session_user,'transactionReadOnly',true,
  'controlPresent',exists(select 1 from sandbox_commerce_v1.native_store_play_handoff_control where singleton),
  'handoffEnabled',exists(select 1 from sandbox_commerce_v1.native_store_play_handoff_control where singleton and enabled),
  'empty',jsonb_build_object('native_store_play_handoff_setups',not exists(select 1 from sandbox_commerce_v1.native_store_play_handoff_setups limit 1),'native_store_play_setup_revocations',not exists(select 1 from sandbox_commerce_v1.native_store_play_setup_revocations limit 1),'native_store_play_enrollments',not exists(select 1 from sandbox_commerce_v1.native_store_play_enrollments limit 1),'native_store_play_enrollment_revocations',not exists(select 1 from sandbox_commerce_v1.native_store_play_enrollment_revocations limit 1),'native_store_play_handoff_attempts',not exists(select 1 from sandbox_commerce_v1.native_store_play_handoff_attempts limit 1),'native_store_play_settlement_protocols',not exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_protocols limit 1),'native_store_play_settlement_revocations',not exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_revocations limit 1),'native_store_play_allocations',not exists(select 1 from sandbox_commerce_v1.native_store_play_allocations limit 1),'native_store_play_raw_effects',not exists(select 1 from sandbox_commerce_v1.native_store_play_raw_effects limit 1)));
end $$;
revoke all on function public.native_store_play_private_state_v1() from public,anon,authenticated,service_role,postgres;
grant execute on function public.native_store_play_private_state_v1() to supabase_read_only_user;
reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
do $$begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member
   where u.rolname='postgres' and r.rolname='sbx_v1_core_owner' and (m.set_option or m.inherit_option))
  or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid='public.native_store_play_private_state_v1()'::regprocedure
    and (a.grantee not in('sbx_v1_core_owner'::regrole,'supabase_read_only_user'::regrole)
     or a.grantor<>'sbx_v1_core_owner'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable))
 then raise exception 'play_private_reader_finalization_required';end if;
end $$;
