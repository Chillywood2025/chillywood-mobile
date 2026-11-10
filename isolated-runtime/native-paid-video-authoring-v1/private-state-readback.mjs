// Fixed booleans and bounded qualification hashes. No raw rows or authority.
export const bindingReadCapacity=Object.freeze({templates:64,retirements:64,operationsBindingBytes:16384,retirementReasonBytes:4096});
export const authoringPrivateStateTables=Object.freeze([
 'paid_video_native_authoring_profiles','paid_video_native_catalog_templates',
 'paid_video_native_template_retirements','paid_video_native_publications',
 'paid_video_operations_config','paid_video_operations_requests','paid_video_reviewers',
 'paid_video_reviews','paid_video_removals',
]);
export function authoringPrivateStateModuleSQL(){return `-- Forward-only observation capability, not table access or runtime authority.
do $$begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off'
  or not exists(select 1 from pg_roles where rolname='supabase_read_only_user' and not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication)
  or ${authoringPrivateStateTables.map(t=>`to_regclass('sandbox_commerce_v1.${t}') is null`).join(' or ')}
 then raise exception 'authoring_private_reader_prerequisites_required';end if;
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 then raise exception 'authoring_private_owner_interval_required';end if;
end $$;
grant sbx_v1_core_owner to postgres with inherit false,set true;
grant create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.native_paid_video_authoring_private_state_v1() returns jsonb
language plpgsql stable security definer set search_path='' as $$declare bindings jsonb;begin
 if session_user<>'supabase_read_only_user' or current_user<>'sbx_v1_core_owner'
  or current_setting('transaction_read_only')<>'on' or current_setting('transaction_isolation')<>'repeatable read'
  or current_setting('statement_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
  or current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
  or exists(select 1 from pg_catalog.pg_roles where rolname=session_user and (rolsuper or rolcreaterole or rolcreatedb or rolreplication))
 then raise exception 'authoring_private_read_context_required' using errcode='42501';end if;
 -- Bound complete input inventories BEFORE aggregating definition hashes. The
 -- extra row is a rejection sentinel, never an accepted truncated inventory.
 with profiles as materialized(select configuration_digest,route_id,worker_id,verifier_id,qualification_sha256,enabled from sandbox_commerce_v1.paid_video_native_authoring_profiles limit 2),
 templates as materialized(select id,revision,catalog_id,store,project_id,app_id,wire_product_id,qualification_sha256,enabled from sandbox_commerce_v1.paid_video_native_catalog_templates limit 65),
 retirements as materialized(select template_id,template_revision,reason from sandbox_commerce_v1.paid_video_native_template_retirements limit 65),
 operations as materialized(select binding from sandbox_commerce_v1.paid_video_operations_config limit 2),
 bounds as materialized(select (select count(*)<=1 from profiles) and (select count(*)<=64 from templates)
  and (select count(*)<=64 and coalesce(bool_and(octet_length(reason)<=4096),true) from retirements)
  and (select count(*)<=1 and coalesce(bool_and(octet_length(binding::text)<=16384),true) from operations) ok),
 profile_hashes as materialized(select encode(sha256(convert_to((to_jsonb(p)-'enabled')::text,'UTF8')),'hex') h from profiles p where (select ok from bounds)),
 template_hashes as materialized(select id,revision,enabled,encode(sha256(convert_to((to_jsonb(t)-'enabled')::text,'UTF8')),'hex') h,
  exists(select 1 from retirements r where r.template_id=t.id and r.template_revision=t.revision) retired from templates t where (select ok from bounds)),
 retirement_hashes as materialized(select encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') h from retirements r where (select ok from bounds))
 select jsonb_build_object('withinBounds',b.ok,
  'profileCount',(select count(*) from profiles),'templateCount',(select count(*) from templates),
  'retirementCount',(select count(*) from retirements),'operationsCount',(select count(*) from operations),
  'profileDefinitionsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from profile_hashes) end,
  'templateDefinitionsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from template_hashes) end,
  'templateAvailabilitySha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(jsonb_build_array(h,enabled,retired)::text,'UTF8')),'hex'),'' order by h collate "C"),''),'UTF8')),'hex') from template_hashes) end,
  'templateRetirementsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from retirement_hashes) end,
  'operationsBindingSha256',case when b.ok then (select encode(sha256(convert_to(binding::text,'UTF8')),'hex') from operations) end,
  'profileMatchesGateway',b.ok and exists(select 1 from profiles p join sandbox_commerce_v1.paid_video_gateway_controls c on c.singleton
   where row(p.route_id,p.worker_id,p.verifier_id,p.qualification_sha256) is not distinct from row(c.route_id,c.worker_id,c.verifier_id,c.qualification_sha256))) into bindings from bounds b;
 return jsonb_build_object('protocol','native-paid-video-authoring-private-state-v1','reader',session_user,'transactionReadOnly',true,
  'authoringEnabled',exists(select 1 from sandbox_commerce_v1.paid_video_native_authoring_profiles where enabled limit 1),
  'templatesEnabled',exists(select 1 from sandbox_commerce_v1.paid_video_native_catalog_templates where enabled limit 1),
  'operationsEnabled',exists(select 1 from sandbox_commerce_v1.paid_video_operations_config where enabled limit 1),
  'reviewersActive',exists(select 1 from sandbox_commerce_v1.paid_video_reviewers where active limit 1),
  'bindings',bindings,'empty',jsonb_build_object(${authoringPrivateStateTables.map(t=>`'${t}',not exists(select 1 from sandbox_commerce_v1.${t} limit 1)`).join(',')}));
end $$;
revoke all on function public.native_paid_video_authoring_private_state_v1() from public,anon,authenticated,service_role,postgres;
grant execute on function public.native_paid_video_authoring_private_state_v1() to supabase_read_only_user;
reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
do $$begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
  or (select count(*)<>2 or bool_or(a.grantee not in('sbx_v1_core_owner'::regrole,'supabase_read_only_user'::regrole)
    or a.grantor<>'sbx_v1_core_owner'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable)
   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid='public.native_paid_video_authoring_private_state_v1()'::regprocedure)
 then raise exception 'authoring_private_reader_finalization_required';end if;
end $$;
`;}
export const authoringPrivateStateReadSQL=`begin isolation level repeatable read read only;
set local jit=off;set local work_mem='1MB';set local max_parallel_workers_per_gather=0;
set local statement_timeout='5s';set local transaction_timeout='5s';set local lock_timeout='1s';
select public.native_paid_video_authoring_private_state_v1();rollback;`;
export function validateAuthoringPrivateState(value){
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
 const flags=['authoringEnabled','templatesEnabled','operationsEnabled','reviewersActive'];
 const bindingHashes=['profileDefinitionsSha256','templateDefinitionsSha256','templateAvailabilitySha256','templateRetirementsSha256'];
 const b=value?.bindings;
 if(!exact(value,['protocol','reader','transactionReadOnly',...flags,'bindings','empty'])
  ||value.protocol!=='native-paid-video-authoring-private-state-v1'||value.reader!=='supabase_read_only_user'||value.transactionReadOnly!==true
  ||!flags.every(k=>typeof value[k]==='boolean')||!exact(value.empty,authoringPrivateStateTables)||!Object.values(value.empty).every(v=>typeof v==='boolean'))
  throw Error('AUTHORING_PRIVATE_STATE_INVALID');
 if(!exact(b,['withinBounds','profileCount','templateCount','retirementCount','operationsCount',...bindingHashes,'operationsBindingSha256','profileMatchesGateway'])
  ||typeof b.withinBounds!=='boolean'||typeof b.profileMatchesGateway!=='boolean')throw Error('AUTHORING_PRIVATE_BINDINGS_INVALID');
 if(!b.withinBounds)throw Error('AUTHORING_PRIVATE_BINDING_BOUNDS_EXCEEDED');
 for(const [k,max] of [['profileCount',1],['templateCount',64],['retirementCount',64],['operationsCount',1]])
  if(!Number.isSafeInteger(b[k])||b[k]<0||b[k]>max)throw Error('AUTHORING_PRIVATE_BINDINGS_INVALID');
 if(!bindingHashes.every(k=>/^[a-f0-9]{64}$/u.test(b[k]??''))
  ||(b.operationsCount===0?b.operationsBindingSha256!==null:!/^[a-f0-9]{64}$/u.test(b.operationsBindingSha256??'')))throw Error('AUTHORING_PRIVATE_BINDINGS_INVALID');
 for(const [count,table] of [['profileCount','paid_video_native_authoring_profiles'],['templateCount','paid_video_native_catalog_templates'],['retirementCount','paid_video_native_template_retirements'],['operationsCount','paid_video_operations_config']])
  if((b[count]===0)!==value.empty[table])throw Error('AUTHORING_PRIVATE_BINDINGS_INVALID');
 if((b.profileMatchesGateway||value.authoringEnabled)&&b.profileCount!==1
  ||value.templatesEnabled&&b.templateCount===0||value.operationsEnabled&&b.operationsCount!==1
  ||value.reviewersActive&&value.empty.paid_video_reviewers)throw Error('AUTHORING_PRIVATE_BINDINGS_INVALID');
 const allDataTablesEmpty=Object.values(value.empty).every(v=>v===true);
 return Object.freeze({protocol:'native-paid-video-authoring-private-state-observation-v1',stateObserved:true,
  ...Object.fromEntries(flags.map(k=>[k,value[k]])),allDataTablesEmpty,
  bindings:Object.freeze({...b}),
  defaultOffAndEmptyObserved:flags.every(k=>!value[k])&&allDataTablesEmpty,
  deploymentAllowed:false,activationAllowed:false,retryAllowed:false});
}
