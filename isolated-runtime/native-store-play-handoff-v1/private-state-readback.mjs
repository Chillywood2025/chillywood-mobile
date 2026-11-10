// Fixed boolean-only Play state reader. No transport or activation authority.
export const playPrivateStateTables=Object.freeze([
 'native_store_play_handoff_setups','native_store_play_setup_revocations',
 'native_store_play_enrollments','native_store_play_enrollment_revocations',
 'native_store_play_handoff_attempts','native_store_play_settlement_protocols',
 'native_store_play_settlement_revocations','native_store_play_allocations','native_store_play_raw_effects',
]);
export function playPrivateStateModuleSQL(){return `-- Forward-only private observation capability; no raw table grants or activation.
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
  'empty',jsonb_build_object(${playPrivateStateTables.map(t=>`'${t}',not exists(select 1 from sandbox_commerce_v1.${t} limit 1)`).join(',')}));
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
`;}
export const playPrivateStateReadSQL=`begin isolation level repeatable read read only;
set local jit=off;set local work_mem='1MB';set local max_parallel_workers_per_gather=0;
set local statement_timeout='5s';set local transaction_timeout='5s';set local lock_timeout='1s';
select public.native_store_play_private_state_v1();rollback;`;
export function validatePlayPrivateState(value){
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
 if(!exact(value,['protocol','reader','transactionReadOnly','controlPresent','handoffEnabled','empty'])
  ||value.protocol!=='native-store-play-private-state-v1'||value.reader!=='supabase_read_only_user'
  ||value.transactionReadOnly!==true||value.controlPresent!==true||typeof value.handoffEnabled!=='boolean'
  ||!exact(value.empty,playPrivateStateTables)||!Object.values(value.empty).every(v=>typeof v==='boolean'))
  throw Error('PLAY_PRIVATE_STATE_INVALID');
 const allDataTablesEmpty=Object.values(value.empty).every(v=>v===true);
 return Object.freeze({protocol:'native-store-play-private-state-observation-v1',stateObserved:true,
  handoffEnabled:value.handoffEnabled,allDataTablesEmpty,defaultOffAndEmptyObserved:!value.handoffEnabled&&allDataTablesEmpty,
  deploymentAllowed:false,activationAllowed:false,retryAllowed:false});
}
