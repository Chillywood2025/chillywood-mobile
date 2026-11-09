#!/usr/bin/env node
// Fixed native-install snapshot preparation, not an apply executor. Reuses the
// existing read-transport identity guard unchanged. No write SQL or override.
import fs from 'node:fs';import path from 'node:path';import process from 'node:process';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {validateReadContext,diagnosticManagementQuery,sha256} from './live-room-exact-deploy.mjs';
import {nativeStoreInstallProfile} from '../isolated-runtime/native-store-sandbox-v1/install-profile.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const PROJECT='bmkkhihfbmsnnmcqkoly';
const prefix='isolated-runtime/native-store-sandbox-v1/';
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
const hash=x=>`encode(sha256(convert_to(${x},'UTF8')),'hex')`;
// Exact jsonb_agg(item ORDER BY item::text COLLATE C)::text bytes, without
// retaining a second full JSONB aggregate tree. SQL NULL is a JSON null element,
// not omitted by string_agg. Empty input is []. Atomic JSONB snapshots unchanged.
export const canonicalItemArrayTextSQL=`('['||coalesce(string_agg(coalesce(item::text,'null'),', ' order by item::text collate "C"),'')||']')`;
const digest=sql=>`(select ${hash(canonicalItemArrayTextSQL)} from (${sql}) items)`;
const scope="('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1')";
// Target-local catalog fingerprint, never compared with fixture OIDs. A future
// apply contract must explicitly account for NEW owner roles and public USAGE
// ACL entries. Do not reuse cashout's unchanged-existing-catalog comparison.
export const catalogItemsSQL=`
 select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${scope} and p.prokind in('f','p')
 union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relpersistence,c.relreplident,c.relispartition,pg_get_expr(c.relpartbound,c.oid),case when c.relkind in('v','m') then pg_get_viewdef(c.oid,true) end) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${scope} and c.relkind in('r','p','v','m','S')
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ${scope} and a.attnum>0 and not a.attisdropped and c.relkind in('r','p','v','m','S')
 union all select jsonb_build_array('constraint',n.nspname,co.conrelid::regclass::text,co.conname,pg_get_constraintdef(co.oid),co.convalidated) from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname in ${scope}
 union all select jsonb_build_array('index',i.indrelid::regclass::text,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${scope}
 union all select jsonb_build_array('policy',p.polrelid::regclass::text,p.polname,p.polcmd,p.polpermissive,(select array_agg(r::regrole::text order by r::regrole::text collate "C") from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${scope}
 union all select jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgname,t.tgisinternal,t.tgfoid::regprocedure::text,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred,pg_get_triggerdef(t.oid),co.conrelid::regclass::text,co.conname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace left join pg_constraint co on co.oid=t.tgconstraint where n.nspname in ${scope}
 union all select jsonb_build_array('schema',nspname,nspowner::regrole::text,nspacl::text) from pg_namespace where nspname in ${scope}
 union all select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig) from pg_roles
 union all select jsonb_build_array('membership',roleid::regrole::text,member::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) from pg_auth_members
 union all select jsonb_build_array('defaultAcl',defaclrole::regrole::text,coalesce(n.nspname,''),defaclobjtype,defaclacl::text) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 union all select jsonb_build_array('eventTrigger',e.evtname,e.evtevent,e.evtenabled,e.evttags,e.evtowner::regrole::text,pg_get_functiondef(e.evtfoid),p.proacl::text,p.proowner::regrole::text) from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid
`;
export const catalogDigestSQL=digest(catalogItemsSQL);
const moneyKeys="('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled')";
export function readbackSQL(){
 const dependency=fs.readFileSync(path.join(ROOT,prefix+'dependency-probe.sql'),'utf8').trim().replace(/;$/u,'');
 return `with dependencies as (${dependency}) select jsonb_build_object(
 'context',jsonb_build_object('currentPostgres',current_user='postgres','currentReadOnly',current_user='supabase_read_only_user','sessionPostgres',session_user='postgres','sessionReadOnly',session_user='supabase_read_only_user','sessionAdmin',session_user='supabase_admin','transactionReadOnly',current_setting('transaction_read_only')='on'),
 'serverVersionNum',current_setting('server_version_num'),'historyCount',(select count(*) from supabase_migrations.schema_migrations),
 'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),
 'historySha256',${digest("select jsonb_build_array(version,name,statements) item from supabase_migrations.schema_migrations")},
 'catalogSha256',${catalogDigestSQL},'dependencies',(select jsonb_build_object from dependencies),
 'moneyControlsSha256',${digest("select jsonb_build_array(key,state) item from public.platform_money_kill_switches")},
 'moneyHeld',(select count(*)=9 and bool_and(state=case when key in('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end) from public.platform_money_kill_switches where key in ${moneyKeys})
 ) state;`;
}
export function validateSnapshot(s){
 validateReadContext(s?.context);
 requireThat(s.serverVersionNum==='170006','NATIVE_SERVER_UNQUALIFIED');
 requireThat(Number.isSafeInteger(s.historyCount)&&s.historyCount>0&&/^\d{14}$/u.test(s.historyMaximum??''),'NATIVE_HISTORY_INVALID');
 for(const key of ['historySha256','catalogSha256','moneyControlsSha256'])requireThat(/^[a-f0-9]{64}$/u.test(s[key]??''),'NATIVE_SNAPSHOT_INVALID');
 requireThat(s.moneyHeld===true,'NATIVE_MONEY_HOLDS_MISMATCH');
 const d=s.dependencies;requireThat(d?.protocol==='native-store-install-dependencies-v1'&&d.serverVersionNum===s.serverVersionNum&&d.transactionReadOnly==='on'
  &&d.currentUser==='supabase_read_only_user'&&d.sessionUser==='supabase_read_only_user'&&d.freshNamespaces===true&&d.freshRoles===true,'NATIVE_DEPENDENCIES_UNQUALIFIED');
 const expected=dependencyRelations();requireThat(Array.isArray(d.relations)&&d.relations.length===expected.length&&new Set(d.relations.map(r=>r.relation)).size===expected.length,'NATIVE_DEPENDENCIES_UNQUALIFIED');
 for(const r of d.relations)requireThat(expected.includes(r.relation)&&r.present===true&&r.postgresSelect===true&&r.postgresMaintain===true&&Array.isArray(r.missingColumns)&&r.missingColumns.length===0,'NATIVE_DEPENDENCIES_UNQUALIFIED');
 return {status:'snapshot_observed_unqualified',historyCount:s.historyCount,historyMaximum:s.historyMaximum,
  historySha256:s.historySha256,catalogSha256:s.catalogSha256,moneyControlsSha256:s.moneyControlsSha256,
  dependencySha256:sha256(JSON.stringify(d)),deploymentAllowed:false,wrote:false};
}
export function dependencyRelations(){return [...fs.readFileSync(path.join(ROOT,prefix+'dependency-probe.sql'),'utf8').matchAll(/\('((?:auth|public)\.[a-z_0-9]+)',array\[/gu)].map(m=>m[1]);}
export async function prepareSnapshot(query){const snapshot=await query(readbackSQL(),true);return validateSnapshot(snapshot);}
export function sourceBinding(source){
 const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 requireThat(/^[a-f0-9]{40}$/u.test(source??''),'EXACT_SOURCE_REQUIRED');requireThat(git('rev-parse','HEAD')===source,'SOURCE_HEAD_MISMATCH');
 requireThat(git('status','--porcelain','--untracked-files=no')==='','TRACKED_SOURCE_DIRTY');const p=nativeStoreInstallProfile();
 const delta=JSON.parse(fs.readFileSync(path.join(ROOT,prefix+'install-delta.json'),'utf8'));
 requireThat(delta.protocol==='native-store-install-delta-v1'&&delta.sourceDigest===p.sourceDigest&&delta.qualification==='source_delta_only'&&delta.deploymentAllowed===false&&/^[a-f0-9]{64}$/u.test(delta.addedCatalogSha256??''),'NATIVE_SOURCE_DELTA_INVALID');
 const files=[...new Set([...p.files.map(f=>f.path),prefix+'install-profile.mjs',prefix+'private-state-readback.mjs',prefix+'install-source.json',prefix+'dependency-probe.sql',
  prefix+'install-delta.mjs',prefix+'install-delta.json',prefix+'install-atomic.mjs',prefix+'install-atomic-rows.json.gz',prefix+'install-envelope.mjs',
  'isolated-runtime/sandbox-commerce-v1/candidates/paid-video-combined-readiness/source-manifest.json',
  'scripts/native-store-install-prepare.mjs','scripts/live-room-exact-deploy.mjs','scripts/studio-rolling-deploy.mjs','package.json','package-lock.json'])];
 for(const file of files){requireThat(git('ls-files','--error-unmatch',file)===file,'SOURCE_NOT_COMMITTED');requireThat(fs.readFileSync(path.join(ROOT,file)).equals(execFileSync('git',['show',`${source}:${file}`],{cwd:ROOT,maxBuffer:8*1024*1024})),'SOURCE_BYTES_CHANGED');}
 return {source,tree:git('rev-parse','HEAD^{tree}'),sourceDigest:p.sourceDigest,modules:p.files.length,expectedAddedCatalogSha256:delta.addedCatalogSha256};
}
async function main(){
 const args=process.argv.slice(2);requireThat(args.length===2&&args[0]==='--source','ARGUMENT_INVALID');const binding=sourceBinding(args[1]);
 const result=await prepareSnapshot(diagnosticManagementQuery(process.env.SUPABASE_ACCESS_TOKEN));
 requireThat(JSON.stringify(sourceBinding(args[1]))===JSON.stringify(binding),'SOURCE_BYTES_CHANGED');
 process.stdout.write(JSON.stringify({project:PROJECT,...binding,...result})+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{
 const allowed=['MANAGEMENT_READ_CONTEXT_MISMATCH','NATIVE_SERVER_UNQUALIFIED','NATIVE_HISTORY_INVALID','NATIVE_SNAPSHOT_INVALID','NATIVE_MONEY_HOLDS_MISMATCH','NATIVE_DEPENDENCIES_UNQUALIFIED','EXACT_SOURCE_REQUIRED','SOURCE_HEAD_MISMATCH','TRACKED_SOURCE_DIRTY','SOURCE_NOT_COMMITTED','SOURCE_BYTES_CHANGED','ARGUMENT_INVALID'];
 process.stderr.write(JSON.stringify({status:'blocked',code:allowed.includes(e?.message)?e.message:'NATIVE_INSTALL_PREPARATION_BLOCKED',deploymentAllowed:false,wrote:false})+'\n');process.exitCode=1;
});
