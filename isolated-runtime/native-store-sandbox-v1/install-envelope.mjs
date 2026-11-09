// Offline transaction preparation only. No connector, apply CLI, target read,
// migration identity allocation, or authorization inferred from observations.
import {createHash} from 'node:crypto';
import {nativeStoreAtomicInstallSQL} from './install-atomic.mjs';
import {nativeStoreInstallProfile} from './install-profile.mjs';
import {catalogDigestSQL,dependencyRelations,validateSnapshot} from '../../scripts/native-store-install-prepare.mjs';
import {verifyNativeInstallDelta} from './install-delta.mjs';
import {validateReadContext} from '../../scripts/live-room-exact-deploy.mjs';
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const sha=s=>createHash('sha256').update(s).digest('hex');
export const NATIVE_INSTALL_REVIEW=Object.freeze({migration:null,baseline:null});
export const envelopeHistorySQL="select coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version collate \"C\"),'[]'::jsonb) from supabase_migrations.schema_migrations";
const historyDigestSQL="(select encode(sha256(convert_to(coalesce(jsonb_agg(item order by item::text collate \"C\")::text,'[]'),'UTF8')),'hex') from (select jsonb_build_array(version,name,statements) item from supabase_migrations.schema_migrations) h)";
const moneyDigestSQL="(select encode(sha256(convert_to(coalesce(jsonb_agg(item order by item::text collate \"C\")::text,'[]'),'UTF8')),'hex') from (select jsonb_build_array(key,state) item from public.platform_money_kill_switches) m)";
export const envelopeLockRelations=()=>[...new Set([...dependencyRelations(),'supabase_migrations.schema_migrations'])].sort();
const check=(v,c)=>{if(!v)throw Error(c);};
export function buildNativeInstallEnvelope(review=NATIVE_INSTALL_REVIEW){
 const r=structuredClone(review);check(r?.baseline&&r?.migration,'native_envelope_review_required');
 validateSnapshot(r.baseline);
 const profile=nativeStoreInstallProfile(),m=r.migration;
 check(m&&Object.keys(m).sort().join(',')==='name,sourceDigest,version'&&/^\d{14}$/u.test(m.version??'')&&/^native_store_sandbox_[a-z0-9_]{1,64}$/u.test(m.name??'')&&m.sourceDigest===profile.sourceDigest,'native_envelope_identity_invalid');
 const body=profile.sql.replace(/^begin;\n/u,'').replace(/\ncommit;\n$/u,'');
 const receipt=[m.version,m.name,[body]],b=r.baseline;
 const locks=envelopeLockRelations();
 const before=`
 set local search_path=pg_catalog,public;
 set local standard_conforming_strings=on;
 set local jit=off;set local work_mem='8MB';set local max_parallel_workers_per_gather=0;
 set local lock_timeout='1s';set local statement_timeout='20s';
 set local transaction_timeout='25s';set local idle_in_transaction_session_timeout='10s';
 do $native_envelope_lock$ begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off' or current_setting('server_version_num')<>'170006' then raise exception 'native_envelope_writer_invalid';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-exact-install',0)) then raise exception 'native_envelope_busy';end if;
 end $native_envelope_lock$;
 lock table ${locks.join(',')} in share row exclusive mode nowait;
 do $native_envelope_before$ begin
 if ${historyDigestSQL}<>${literal(b.historySha256)} or (select count(*) from supabase_migrations.schema_migrations)<>${b.historyCount}
 or (select max(version) from supabase_migrations.schema_migrations) is distinct from ${literal(b.historyMaximum)}
 or ${catalogDigestSQL}<>${literal(b.catalogSha256)} or ${moneyDigestSQL}<>${literal(b.moneyControlsSha256)}
 then raise exception 'native_envelope_baseline_changed';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version=${literal(m.version)}) then raise exception 'native_envelope_history_collision';end if;
 end $native_envelope_before$;
 create temporary table native_envelope_history(rows jsonb) on commit drop;
 insert into native_envelope_history ${envelopeHistorySQL};
 `;
 const append=`
 insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(m.version)},${literal(m.name)},array[${literal(body)}]::text[]);
 do $native_envelope_after$ declare expected jsonb;actual jsonb;begin
 select rows||jsonb_build_array(${literal(JSON.stringify(receipt))}::jsonb) into strict expected from native_envelope_history;
 ${envelopeHistorySQL} into actual;
 if exists((select value from jsonb_array_elements(expected) except all select value from jsonb_array_elements(actual)) union all
 (select value from jsonb_array_elements(actual) except all select value from jsonb_array_elements(expected))) then raise exception 'native_envelope_history_changed';end if;
 if ${moneyDigestSQL}<>${literal(b.moneyControlsSha256)} then raise exception 'native_envelope_money_changed';end if;
 end $native_envelope_after$;
 `;
 const atomic=nativeStoreAtomicInstallSQL();
 check(atomic.startsWith('begin;')&&atomic.includes('reset role;\n -- Force the original'),'native_envelope_atomic_shape');
 // The receipt is inserted BEFORE the existing atomic catalog/default-off
 // verification. Any late failure rolls the receipt and all install DDL back.
 const sql=atomic.replace('begin;',()=> 'begin;'+before).replace('reset role;\n -- Force the original',()=> 'reset role;'+append+'\n -- Force the original');
 Object.freeze(receipt[2]);Object.freeze(receipt);Object.freeze(locks);
 return Object.freeze({protocol:'native-store-install-envelope-v1',sql,sourceDigest:profile.sourceDigest,bodySha256:sha(body),receipt,
  lockRelations:locks,deploymentAllowed:false,administrativeConcurrencyExcluded:false});
}

/** Classify ONE independently obtained readback after an uncertain write.
 * Never retries or supplies a write callback. Even exact evidence is not hosted
 * activation qualification, and a failed/partial read stays unknown. */
export function classifyNativeInstallOutcome({before,after,receipt}){
 const result=status=>({status,retryAllowed:false,deploymentAllowed:false});
 try{
  validateReadContext(before?.context);validateReadContext(after?.context);
  check(before.serverVersionNum==='170006'&&after.serverVersionNum==='170006','native_envelope_server_invalid');
  check(Array.isArray(before.history)&&Array.isArray(after.history)&&Array.isArray(receipt)&&receipt.length===3,'native_envelope_readback_invalid');
  check(/^\d{14}$/u.test(receipt[0]??'')&&/^native_store_sandbox_[a-z0-9_]{1,64}$/u.test(receipt[1]??'')&&Array.isArray(receipt[2])&&receipt[2].length===1
   &&receipt[2][0]===nativeStoreInstallProfile().sql.replace(/^begin;\n/u,'').replace(/\ncommit;\n$/u,''),'native_envelope_receipt_invalid');
  for(const c of [before.catalog,after.catalog])check(c&&Array.isArray(c.rows)&&c.rows.length>0&&Array.isArray(c.publicAcl)&&c.acls&&typeof c.bootstrapSuperuser==='string','native_envelope_catalog_missing');
  check(typeof before.moneyControlsSha256==='string'&&/^[a-f0-9]{64}$/u.test(before.moneyControlsSha256)&&before.moneyControlsSha256===after.moneyControlsSha256,'native_envelope_money_changed');
  const sort=rows=>rows.map(r=>JSON.stringify(r)).sort();
  if(JSON.stringify(sort(before.history))===JSON.stringify(sort(after.history))&&JSON.stringify(before.catalog)===JSON.stringify(after.catalog))return result('unchanged_observed');
  check(!before.history.some(r=>r[0]===receipt[0]),'native_envelope_history_collision');
  check(JSON.stringify(sort([...before.history,receipt]))===JSON.stringify(sort(after.history)),'native_envelope_history_changed');
  verifyNativeInstallDelta(before.catalog,after.catalog);
  // Control/data readback needs a separately qualified privileged read path;
  // catalog/receipt alone must not imply inactive controls or empty runtime data.
  return result('exact_source_receipt_observed_runtime_unqualified');
 }catch{return result('outcome_unknown');}
}
