// Fixed state and nonsecret metadata only. No data-row, key or activation API.
export const r2PrivateStateTables=Object.freeze(['r2_profiles','r2_bindings','r2_dispatches','r2_commits','r2_receipts','r2_tickets']);
export const r2ReaderCapacity=Object.freeze({profiles:1,routes:64,workers:64,verifiers:64,memberships:32});
const hash=s=>`encode(sha256(convert_to(${s},'UTF8')),'hex')`;
const aggregate=(cte,row)=>`(select ${hash(`coalesce(string_agg(h,'' order by h collate "C"),'')`)} from (select ${hash(row+'::text')} h from ${cte} where (select ok from bounds)) bounded_hashes)`;
export function r2PrivateStateModuleSQL(){return `-- Fixed read-only observation; never grant raw private access.
do $$begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off'
 or not exists(select 1 from pg_roles where rolname='supabase_read_only_user' and not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication)
 or ${r2PrivateStateTables.map(t=>`to_regclass('sandbox_commerce_v1.${t}') is null`).join(' or ')}
 or has_schema_privilege('sbx_v1_core_owner','public','CREATE')
 or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 then raise exception 'r2_private_reader_prerequisites_required';end if;
end $$;
grant sbx_v1_core_owner to postgres with inherit false,set true;
grant create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.native_paid_video_r2_private_state_v1() returns jsonb
language plpgsql stable security definer set search_path='' as $$declare metadata jsonb;begin
 if session_user<>'supabase_read_only_user' or current_user<>'sbx_v1_core_owner'
 or current_setting('transaction_read_only')<>'on' or current_setting('transaction_isolation')<>'repeatable read'
 or current_setting('statement_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
 or current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
 or exists(select 1 from pg_roles where rolname=session_user and (rolsuper or rolcreaterole or rolcreatedb or rolreplication))
 then raise exception 'r2_private_read_context_required' using errcode='42501';end if;
 with profiles as materialized(select id,configuration_digest,route_id,worker_id,verifier_id,key_id,gateway_key,qualification_sha256,capacity_evidence_sha256,qualified_max_bytes,enabled from sandbox_commerce_v1.r2_profiles limit 2),
 routes as materialized(select id,provider,bucket,route_evidence_sha256,active from sandbox_commerce_v1.paid_video_routes limit 65),
 workers as materialized(select id,hmac_key,qualified_binary_sha256,active from sandbox_commerce_v1.paid_video_workers limit 65),
 verifiers as materialized(select id,hmac_key,evidence_sha256,active from sandbox_commerce_v1.paid_video_verifiers limit 65),
 memberships as materialized(select roleid::regrole::text role_name,member::regrole::text member_name,grantor::regrole::text grantor_name,admin_option,inherit_option,set_option from pg_auth_members
  where roleid in('sbx_v1_r2_gateway'::regrole,'sbx_v1_r2_scanner'::regrole) limit 33),
 bounds as materialized(select (select count(*)<=1 from profiles) and (select count(*)<=64 from routes)
  and (select count(*)<=64 from workers) and (select count(*)<=64 from verifiers) and (select count(*)<=32 from memberships) ok)
 select jsonb_build_object('withinBounds',b.ok,'profileCount',(select count(*) from profiles),
  'routeCount',(select count(*) from routes),'workerCount',(select count(*) from workers),'verifierCount',(select count(*) from verifiers),'membershipCount',(select count(*) from memberships),
  'profileDefinitionsSha256',case when b.ok then ${aggregate('profiles p',"(to_jsonb(p)-'gateway_key'-'enabled')")} end,
  'routeDefinitionsSha256',case when b.ok then ${aggregate('routes r',"(to_jsonb(r)-'active')")} end,
  'workerDefinitionsSha256',case when b.ok then ${aggregate('workers w',"(to_jsonb(w)-'hmac_key'-'active')")} end,
  'verifierDefinitionsSha256',case when b.ok then ${aggregate('verifiers v',"(to_jsonb(v)-'hmac_key'-'active')")} end,
  'membershipsSha256',case when b.ok then ${aggregate('memberships m','to_jsonb(m)')} end,
  'profileBindingsCurrent',b.ok and exists(select 1 from profiles p join routes r on r.id=p.route_id join workers w on w.id=p.worker_id join verifiers v on v.id=p.verifier_id
   where r.active and r.provider='cloudflare_r2' and r.bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' and w.active and v.active
   and w.hmac_key<>v.hmac_key and w.hmac_key<>p.gateway_key and v.hmac_key<>p.gateway_key
   and not exists(select 1 from workers x where x.hmac_key in(v.hmac_key,p.gateway_key))
   and not exists(select 1 from verifiers x where x.hmac_key=p.gateway_key)
   and not exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles x where x.configuration_digest=p.configuration_digest)))
 into metadata from bounds b;
 return jsonb_build_object('protocol','native-paid-video-r2-private-state-v1','reader',session_user,'transactionReadOnly',true,
  'profileEnabled',exists(select 1 from sandbox_commerce_v1.r2_profiles where enabled limit 1),
  'lifecycleActive',exists(select 1 from sandbox_commerce_v1.lifecycle where singleton and state='active'),
  'rolesSafe',(select count(*)=2 and bool_and(not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls and not rolinherit) from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner')),
  'metadata',metadata,'empty',jsonb_build_object(${r2PrivateStateTables.map(t=>`'${t}',not exists(select 1 from sandbox_commerce_v1.${t} limit 1)`).join(',')}));
end $$;
revoke all on function public.native_paid_video_r2_private_state_v1() from public,anon,authenticated,service_role,postgres,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
grant execute on function public.native_paid_video_r2_private_state_v1() to supabase_read_only_user;
reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
do $$begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
 or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 or (select count(*)<>2 or bool_or(a.grantee not in('sbx_v1_core_owner'::regrole,'supabase_read_only_user'::regrole) or a.grantor<>'sbx_v1_core_owner'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable)
  from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.native_paid_video_r2_private_state_v1()'::regprocedure)
 then raise exception 'r2_private_reader_finalization_required';end if;
end $$;
`;}
export const r2PrivateStateReadSQL=`begin isolation level repeatable read read only;
set local jit=off;set local work_mem='1MB';set local max_parallel_workers_per_gather=0;
set local statement_timeout='5s';set local transaction_timeout='5s';set local lock_timeout='1s';
select public.native_paid_video_r2_private_state_v1();rollback;`;
export function validateR2PrivateState(v){
 const exact=(x,k)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
 const m=v?.metadata,hashes=['profileDefinitionsSha256','routeDefinitionsSha256','workerDefinitionsSha256','verifierDefinitionsSha256','membershipsSha256'];
 if(!exact(v,['protocol','reader','transactionReadOnly','profileEnabled','lifecycleActive','rolesSafe','metadata','empty'])
  ||v.protocol!=='native-paid-video-r2-private-state-v1'||v.reader!=='supabase_read_only_user'||v.transactionReadOnly!==true||v.rolesSafe!==true
  ||typeof v.profileEnabled!=='boolean'||typeof v.lifecycleActive!=='boolean'||!exact(v.empty,r2PrivateStateTables)||!Object.values(v.empty).every(x=>typeof x==='boolean')
  ||!exact(m,['withinBounds','profileCount','routeCount','workerCount','verifierCount','membershipCount',...hashes,'profileBindingsCurrent'])
  ||typeof m.withinBounds!=='boolean'||typeof m.profileBindingsCurrent!=='boolean')throw Error('R2_PRIVATE_STATE_INVALID');
 if(!m.withinBounds)throw Error('R2_PRIVATE_METADATA_BOUNDS_EXCEEDED');
 for(const [k,max] of [['profileCount',1],['routeCount',64],['workerCount',64],['verifierCount',64],['membershipCount',32]])if(!Number.isSafeInteger(m[k])||m[k]<0||m[k]>max)throw Error('R2_PRIVATE_STATE_INVALID');
 if(!hashes.every(k=>/^[a-f0-9]{64}$/u.test(m[k]??''))||(m.profileCount===0)!==v.empty.r2_profiles||((v.profileEnabled||m.profileBindingsCurrent)&&m.profileCount!==1))throw Error('R2_PRIVATE_STATE_INVALID');
 const allDataTablesEmpty=Object.values(v.empty).every(Boolean);
 return Object.freeze({protocol:'native-paid-video-r2-private-observation-v1',stateObserved:true,profileEnabled:v.profileEnabled,lifecycleActive:v.lifecycleActive,
  allDataTablesEmpty,defaultOffAndEmptyObserved:allDataTablesEmpty&&!v.profileEnabled&&!v.lifecycleActive,metadata:Object.freeze({...m}),deploymentAllowed:false,activationAllowed:false,retryAllowed:false});
}
