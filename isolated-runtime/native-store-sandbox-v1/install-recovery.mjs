// Source-pinned readonly recovery preparation. No executor, retry or write path.
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {nativeStoreInstallProfile} from './install-profile.mjs';
import {aclItemsSQL,publicAclSQL,NATIVE_ROLES} from './install-delta.mjs';
import {catalogItemsSQL,canonicalItemArrayTextSQL,readbackSQL,validateSnapshot} from '../../scripts/native-store-install-prepare.mjs';
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const json=v=>literal(JSON.stringify(v))+'::jsonb';
const sha=s=>createHash('sha256').update(s).digest('hex');
const check=(v,c)=>{if(!v)throw Error(c);};
const digest=sql=>`(select encode(sha256(convert_to(${canonicalItemArrayTextSQL},'UTF8')),'hex') from (${sql}) recovery_items)`;
const historyItems="select jsonb_build_array(version,name,statements) item from supabase_migrations.schema_migrations";
const moneyItems='select jsonb_build_array(key,state) item from public.platform_money_kill_switches';
function source(){
 const profile=nativeStoreInstallProfile();
 const pin=JSON.parse(gunzipSync(fs.readFileSync(new URL('./install-atomic-rows.json.gz',import.meta.url)),{maxOutputLength:8*1024*1024}).toString('utf8'));
 const delta=JSON.parse(fs.readFileSync(new URL('./install-delta.json',import.meta.url),'utf8'));
 check(pin.sourceDigest===profile.sourceDigest&&pin.addedCatalogSha256===delta.addedCatalogSha256&&sha(JSON.stringify(pin.rows.map(r=>JSON.stringify(r)).sort()))===delta.addedCatalogSha256,'native_recovery_pin_mismatch');
 const names=[...new Set([...profile.sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(/giu)].map(m=>m[1]))];
 const list=a=>a.map(literal).join(',');
 const added=`case r->>0
 when 'function' then r->>1 in('sandbox_commerce_v1','native_store_sandbox_v1') or (r->>1='public' and r->>2 in(${list(names)}))
 when 'relation' then r->>1 in('sandbox_commerce_v1','native_store_sandbox_v1')
 when 'constraint' then r->>1 in('sandbox_commerce_v1','native_store_sandbox_v1')
 when 'schema' then r->>1 in('sandbox_commerce_v1','native_store_sandbox_v1')
 when 'role' then r->>1 in(${list(NATIVE_ROLES)})
 when 'membership' then r->>1 in(${list(NATIVE_ROLES)}) or r->>2 in(${list(NATIVE_ROLES)}) or r->>3 in(${list(NATIVE_ROLES)})
 when 'defaultAcl' then r->>1 in(${list(NATIVE_ROLES)}) or r->>2 in('sandbox_commerce_v1','native_store_sandbox_v1')
 else r->>0 in('column','index','policy','trigger') and (r->>1 like 'sandbox\\_commerce\\_v1.%' or r->>1 like 'native\\_store\\_sandbox\\_v1.%') end`;
 return {profile,pin,added,names};
}
const metadata=`jsonb_build_object('publicSchema',(select jsonb_build_array('schema',nspname,nspowner::regrole::text,nspacl::text) from pg_namespace where nspname='public'),
 'publicAcl',(${publicAclSQL.replace(/;$/u,'')}),'bootstrap',(select rolname from pg_roles where oid=10 and rolsuper))`;
// Must be captured BEFORE dispatch by the qualified reader in one RR snapshot.
// No after-the-fact metadata adoption is supported.
export function compactBeforeReadSQL(){
 const {profile,names}=source();
 return `begin isolation level repeatable read read only;
 set local search_path=pg_catalog,public;set local standard_conforming_strings=on;
 set local jit=off;set local work_mem='4MB';set local max_parallel_workers_per_gather=0;
 set local statement_timeout='20s';set local transaction_timeout='25s';set local lock_timeout='1s';set local idle_in_transaction_session_timeout='10s';
 do $reader$ begin
 if current_user<>'supabase_read_only_user' or session_user<>'supabase_read_only_user'
 or current_setting('transaction_read_only')<>'on' or current_setting('transaction_isolation')<>'repeatable read'
 or current_setting('server_version_num')<>'170006' then raise exception 'native_recovery_reader_invalid';end if;
 end $reader$;
 with baseline as materialized (${readbackSQL().trim().replace(/;$/u,'')})
 select state||jsonb_build_object('recoveryProtocol','native-compact-before-v1','sourceDigest',${literal(profile.sourceDigest)},
 'recoveryMetadata',${metadata},'addedRowsAbsent',state#>'{dependencies,freshNamespaces}'='true'::jsonb and state#>'{dependencies,freshRoles}'='true'::jsonb
 and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in('f','p') and p.proname in(${names.map(literal).join(',')}))) state
 from baseline;
 rollback;`;
}
export function validateCompactBefore(v){
 validateSnapshot(v);const {profile}=source();
 check(v.recoveryProtocol==='native-compact-before-v1'&&v.sourceDigest===profile.sourceDigest&&v.addedRowsAbsent===true,'native_recovery_before_required');
 const m=v.recoveryMetadata;
 check(m&&Object.keys(m).sort().join(',')==='bootstrap,publicAcl,publicSchema'&&typeof m.bootstrap==='string'&&m.bootstrap.length>0,'native_recovery_before_metadata');
 check(Array.isArray(m.publicSchema)&&m.publicSchema.length===4&&m.publicSchema[0]==='schema'&&m.publicSchema[1]==='public'&&typeof m.publicSchema[2]==='string'&&(m.publicSchema[3]===null||typeof m.publicSchema[3]==='string'),'native_recovery_before_metadata');
 check(Array.isArray(m.publicAcl)&&m.publicAcl.every(a=>Array.isArray(a)&&a.length===4&&a.slice(0,3).every(s=>typeof s==='string')&&typeof a[3]==='boolean'&&!NATIVE_ROLES.includes(a[1])),'native_recovery_before_metadata');
 return v;
}
export function buildCompactRecoverySQL({before,receipt}){
 validateCompactBefore(before);const {profile,pin,added}=source();
 check(Array.isArray(receipt)&&receipt.length===3&&/^\d{14}$/u.test(receipt[0]??'')&&/^native_store_sandbox_[a-z0-9_]{1,64}$/u.test(receipt[1]??'')&&Array.isArray(receipt[2])&&receipt[2].length===1&&receipt[2][0]===profile.sql.replace(/^begin;\n/u,'').replace(/\ncommit;\n$/u,''),'native_recovery_receipt_invalid');
 const m=before.recoveryMetadata,expectedAcl=[...m.publicAcl,...['sbx_v1_core_owner','native_store_sandbox_v1_owner'].map(r=>[m.publicSchema[2],r,'USAGE',false])];
 const token=sha(JSON.stringify({sourceDigest:profile.sourceDigest,before,receipt}));
 const normalized=`with observed as materialized (select r from (${catalogItemsSQL}) c(r) where ${added}),
 acls as materialized (${aclItemsSQL}),
 keyed as materialized (select r,case r->>0
 when 'function' then 'function:'||(r->>1)||'.'||(r->>2)||'('||(r->>3)||')'
 when 'relation' then 'relation:'||(r->>1)||'.'||(r->>2)
 when 'schema' then 'schema:'||(r->>1)
 when 'column' then 'column:'||(r->>1)||'.'||(r->>2) end k,
 case when r->>0='schema' then 3 else 5 end i from observed),
 acl_normalized as materialized (select case when k is null then r else jsonb_set(r,array[i::text],v) end r from keyed left join acls using(k)),
 trigger_normalized as materialized (select case when r->>0='trigger' and r->3='true'::jsonb then
 jsonb_set(jsonb_set(r,'{2}','"<internal>"'),'{9}',to_jsonb(regexp_replace(r->>9,'RI_ConstraintTrigger_[ac]_[0-9]+','RI_ConstraintTrigger_<internal>','g'))) else r end r from acl_normalized),
 actual as materialized (select case when r->>0='membership' and r->>3=${literal(m.bootstrap)} then jsonb_set(r,'{3}','"<bootstrap-superuser>"') else r end r from trigger_normalized),
 expected as materialized (select value r from jsonb_array_elements(${json(pin.rows)}))
 select not exists(select k from acls group by k having count(*)<>1)
 and not exists(select 1 from keyed left join acls using(k) where k is not null and jsonb_typeof(v) is distinct from 'array')
 and not exists(select 1 from keyed where r->>0='trigger' and r->3='true'::jsonb and (r->>10 is null or r->>11 is null))
 and not exists((select r from actual except all select r from expected) union all (select r from expected except all select r from actual))`;
 const retained=`select case when r->>0='schema' and r->>1='public' then jsonb_set(r,'{3}',${json(m.publicSchema[3])}) else r end item from (${catalogItemsSQL}) c(r) where not (${added})`;
 const sql=`begin isolation level repeatable read read only;
 set local search_path=pg_catalog,public;set local standard_conforming_strings=on;
 set local jit=off;set local work_mem='4MB';set local max_parallel_workers_per_gather=0;set local enable_hashagg=off;
 set local statement_timeout='20s';set local transaction_timeout='25s';set local lock_timeout='1s';set local idle_in_transaction_session_timeout='10s';
 do $recovery$ declare meta jsonb;catalog_hash text;history_hash text;money_hash text;history_count bigint;history_max text;
 exact_added boolean:=false;exact_acl boolean:=false;exact_history boolean:=false;receipt_count bigint;runtime jsonb;
 status text:='outcome_unknown';begin
 perform set_config('native.compact_recovery',${literal(JSON.stringify({protocol:'native-compact-recovery-v1',token,status:'outcome_unknown'}))},true);
 if current_user<>'supabase_read_only_user' or session_user<>'supabase_read_only_user'
 or current_setting('transaction_read_only')<>'on' or current_setting('transaction_isolation')<>'repeatable read'
 or current_setting('server_version_num')<>'170006' then raise exception 'native_recovery_reader_invalid';end if;
 select ${metadata} into meta;
 select ${digest(moneyItems)},(select count(*) from supabase_migrations.schema_migrations),(select max(version) from supabase_migrations.schema_migrations)
 into money_hash,history_count,history_max;
 select count(*),count(*)=1 and bool_and(jsonb_build_array(version,name,statements)=${json(receipt)}) into receipt_count,exact_history
 from supabase_migrations.schema_migrations where version=${literal(receipt[0])};
 if receipt_count=0 and money_hash=${literal(before.moneyControlsSha256)} and meta=${json(m)} and history_count=${before.historyCount} then
  select ${digest(catalogItemsSQL)} into catalog_hash;
  select ${digest(historyItems)} into history_hash;
  if catalog_hash=${literal(before.catalogSha256)} and history_hash=${literal(before.historySha256)} and history_count=${before.historyCount} and history_max=${literal(before.historyMaximum)} then status:='unchanged_observed';end if;
 end if;
 if status<>'unchanged_observed' and money_hash=${literal(before.moneyControlsSha256)} and meta->>'bootstrap'=${literal(m.bootstrap)} then
  if exact_history and history_count=${before.historyCount+1} then
   select ${digest(historyItems+' where version<>'+literal(receipt[0]))}=${literal(before.historySha256)}
    and (select max(version) from supabase_migrations.schema_migrations where version<>${literal(receipt[0])})=${literal(before.historyMaximum)} into exact_history;
   select not exists((select value from jsonb_array_elements(meta->'publicAcl') except all select value from jsonb_array_elements(${json(expectedAcl)})) union all
    (select value from jsonb_array_elements(${json(expectedAcl)}) except all select value from jsonb_array_elements(meta->'publicAcl'))) into exact_acl;
   if exact_history and exact_acl and ${digest(retained)}=${literal(before.catalogSha256)} then
    ${normalized} into exact_added;
    if exact_added then
     status:='exact_source_receipt_observed_runtime_unqualified';
     -- Metadata equality cannot exclude concurrent administrative ALTER FUNCTION.
     -- Do not invoke any SECURITY DEFINER runtime reader from this default packet.
     -- The existing bounded private reader remains a separate operational step
     -- requiring real administrative-DDL coordination, never a caller boolean.
    end if;
   end if;
  end if;
 end if;
 perform set_config('native.compact_recovery',jsonb_build_object('protocol','native-compact-recovery-v1','token',${literal(token)},'sourceDigest',${literal(profile.sourceDigest)},
 'status',status,'runtime',runtime,'administrativeConcurrencyExcluded',false,'retryAllowed',false,'deploymentAllowed',false)::text,true);
 end $recovery$;
 select current_setting('native.compact_recovery',true)::jsonb as native_compact_recovery;
 rollback;`;
 return Object.freeze({protocol:'native-compact-recovery-packet-v1',sourceDigest:profile.sourceDigest,token,sql,administrativeConcurrencyExcluded:false,retryAllowed:false,deploymentAllowed:false});
}
export function classifyCompactRecovery(value,packet){
 const result=status=>({status,administrativeConcurrencyExcluded:false,retryAllowed:false,deploymentAllowed:false,activationAllowed:false});
 try{
  check(packet?.protocol==='native-compact-recovery-packet-v1'&&packet.sourceDigest===nativeStoreInstallProfile().sourceDigest&&/^[a-f0-9]{64}$/u.test(packet.token),'native_recovery_packet_invalid');
  check(value&&Object.keys(value).sort().join(',')==='administrativeConcurrencyExcluded,deploymentAllowed,protocol,retryAllowed,runtime,sourceDigest,status,token','native_recovery_result_invalid');
  check(value.protocol==='native-compact-recovery-v1'&&value.token===packet.token&&value.sourceDigest===packet.sourceDigest&&value.retryAllowed===false&&value.deploymentAllowed===false&&value.administrativeConcurrencyExcluded===false&&value.runtime===null,'native_recovery_result_invalid');
  if(value.status==='unchanged_observed'&&value.runtime===null)return result('unchanged_observed');
  if(value.status==='exact_source_receipt_observed_runtime_unqualified')return result(value.status);
 }catch{/* Missing, partial, stale, malformed or failed read stays unknown. */}
 return result('outcome_unknown');
}
