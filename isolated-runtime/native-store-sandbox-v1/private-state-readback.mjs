// Pinned source-only private reader, installed in the same fresh atomic closure.
// No transport, role creation, target URL or table-read grants.
export const nativePrivateStateTables=Object.freeze({
 journal:Object.freeze(['connections','revocations','receipts','events','conflicts','deliveries','consumer_dispositions']),
 core:Object.freeze(['native_store_catalog_bindings','native_store_catalog_retirements','native_store_selections','native_store_claims','native_store_reservations','native_store_dispatch_attempts','native_store_core_links','native_store_pending_raw','native_store_protocol_qualifications','native_store_protocol_revocations','native_store_qualified_attempts','native_store_settlement_protocols','native_store_settlement_revocations','native_store_negative_tombstones','native_store_allocations','native_store_raw_effects','native_store_reservation_terminals',
 'resources','resource_versions','resource_bindings','catalog','offers','intents','requests','receipts','receipt_events','transaction_owners','grants','resource_grants','resource_delivery_holds','delivery_assets','delivery_asset_scans','video_terms',
 'paid_video_routes','paid_video_workers','paid_video_uploads','paid_video_tickets','paid_video_scan_results','paid_video_moderation','paid_video_requests','paid_video_catalog','paid_video_transfers','paid_video_verifiers','paid_video_object_receipts','paid_video_gateway_requests','paid_video_gateway_transfers','paid_video_receipt_links'])
});
const context=`if session_user <> 'supabase_read_only_user' or current_setting('transaction_read_only') <> 'on'
 or current_setting('transaction_isolation') <> 'repeatable read'
 or current_setting('statement_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
 or current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
 or exists(select 1 from pg_catalog.pg_roles where rolname=session_user and (rolsuper or rolcreaterole or rolcreatedb or rolreplication))
 then raise exception 'native_private_read_context_required' using errcode='42501';end if;`;
const empty=(schema,tables)=>`jsonb_build_object(${tables.map(t=>`'${t}',not exists(select 1 from ${schema}.${t} limit 1)`).join(',')})`;
export function nativePrivateStateInstallSQL(){return `begin;
set local statement_timeout='5s';set local lock_timeout='1s';set local transaction_timeout='5s';
do $$begin
 if not exists(select 1 from pg_roles where rolname='supabase_read_only_user' and not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication)
 then raise exception 'native_private_existing_reader_required';end if;
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE') or has_schema_privilege('native_store_sandbox_v1_owner','public','CREATE')
 or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where u.rolname='postgres' and r.rolname in('sbx_v1_core_owner','native_store_sandbox_v1_owner') and (m.set_option or m.inherit_option))
 then raise exception 'native_private_owner_interval_required';end if;
end $$;
grant native_store_sandbox_v1_owner to postgres with inherit false,set true;
set local role native_store_sandbox_v1_owner;
create function native_store_sandbox_v1.private_install_state_v1() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 ${context}
 return jsonb_build_object('disabled',(select enabled=false from native_store_sandbox_v1.control where singleton),'empty',${empty('native_store_sandbox_v1',nativePrivateStateTables.journal)});
end $$;
revoke all on function native_store_sandbox_v1.private_install_state_v1() from public,anon,authenticated,service_role;
grant execute on function native_store_sandbox_v1.private_install_state_v1() to sbx_v1_core_owner;
reset role;
grant native_store_sandbox_v1_owner to postgres with inherit false,set false;
grant sbx_v1_core_owner to postgres with inherit false,set true;
grant create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.native_store_private_install_state_v1() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 ${context}
 return jsonb_build_object('protocol','native-store-private-install-state-v1','reader',session_user,'transactionReadOnly',true,
 'journal',native_store_sandbox_v1.private_install_state_v1(),
 'controls',jsonb_build_object('lifecycleDisabled',(select state='disabled' from sandbox_commerce_v1.lifecycle where singleton),
 'preparationDisabled',(select not preparation_enabled from sandbox_commerce_v1.native_store_quote_controls where singleton),
 'gatewayUnconfigured',(select not enabled and route_id is null and verifier_id is null and worker_id is null and qualification_sha256 is null from sandbox_commerce_v1.paid_video_gateway_controls where singleton),
 'testStoreDispatchDisabled',(select not ingress_enabled and not provisioning_enabled and not initiation_enabled and connection_id is null and connection_revision is null from sandbox_commerce_v1.test_store_v3_controls where singleton)),
 'empty',${empty('sandbox_commerce_v1',nativePrivateStateTables.core)});
end $$;
revoke all on function public.native_store_private_install_state_v1() from public,anon,authenticated,service_role;
grant execute on function public.native_store_private_install_state_v1() to supabase_read_only_user;
reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
do $$begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
 or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where u.rolname='postgres' and r.rolname in('sbx_v1_core_owner','native_store_sandbox_v1_owner') and (m.set_option or m.inherit_option))
 then raise exception 'native_private_owner_interval_leaked';end if;
end $$;
commit;`;}
// Embedded module inherits the outer install/envelope resource budget; never re-arm it.
export function nativePrivateStateModuleSQL(){return nativePrivateStateInstallSQL().replace(/^begin;\nset local statement_timeout='5s';set local lock_timeout='1s';set local transaction_timeout='5s';\n/u,'').replace(/commit;$/u,'');}
export const nativePrivateStateReadSQL=`begin isolation level repeatable read read only;
set local jit=off;set local work_mem='1MB';set local max_parallel_workers_per_gather=0;
set local statement_timeout='5s';set local transaction_timeout='5s';set local lock_timeout='1s';
select public.native_store_private_install_state_v1();rollback;`;
export function validateNativePrivateState(v){
 const exact=(x,n)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join('|')===[...n].sort().join('|');
 const controls=['lifecycleDisabled','preparationDisabled','gatewayUnconfigured','testStoreDispatchDisabled'];
 if(!exact(v,['protocol','reader','transactionReadOnly','journal','controls','empty'])||v.protocol!=='native-store-private-install-state-v1'||v.reader!=='supabase_read_only_user'||v.transactionReadOnly!==true
 ||!exact(v.journal,['disabled','empty'])||v.journal.disabled!==true||!exact(v.journal.empty,nativePrivateStateTables.journal)||!exact(v.empty,nativePrivateStateTables.core)||!exact(v.controls,controls)
 ||![...Object.values(v.controls),...Object.values(v.empty),...Object.values(v.journal.empty)].every(x=>x===true))throw Error('NATIVE_PRIVATE_INSTALL_STATE_NOT_FRESH');
 return Object.freeze({protocol:'native-store-private-install-state-observation-v1',defaultOffAndEmptyObserved:true,deploymentAllowed:false,activationAllowed:false,retryAllowed:false});
}
