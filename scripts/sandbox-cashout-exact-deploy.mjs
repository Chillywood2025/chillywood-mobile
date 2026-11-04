#!/usr/bin/env node
// Exact dormant schema only. The committed production manifest is unqualified.
// No credential setup, Edge upload, provider operation, activation or write retry.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256,diagnosticManagementQuery,validateReadContext,HELPER_ERROR_CODES,redundantNotNull} from './live-room-exact-deploy.mjs';
import {loadBundle as loadIngress,CLOSURE as INGRESS_CLOSURE,VERSION as INGRESS_VERSION,NAME as INGRESS_NAME,HASH as INGRESS_HASH,DISPATCH,addedCatalogHashSQL as ingressCatalogSQL} from './native-ingress-exact-deploy.mjs';
import {VERSION as TIP_VERSION,NAME as TIP_NAME,HASH as TIP_HASH,FUNCTIONS as TIP_FUNCTIONS,DATA_TABLES,holdsSQL} from './native-tip-exact-deploy.mjs';
import {collectSourceBundle} from '../ops/creator-backend-rollout/prepare-edge.mjs';
import {TABLES,FUNCTIONS,TRIGGERS,EXISTING_SOURCE_TABLES} from './sandbox-cashout-deployment-contract.mjs';

export const PROJECT='bmkkhihfbmsnnmcqkoly';
export const VERSION='20261102194000';
export const NAME='sandbox_creator_cashout_execution';
export const MIGRATION=`supabase/migrations/${VERSION}_${NAME}.sql`;
export const HASH='a41152e19ab73a959a514a8495f5b00dc9c4ff50f436fb15e16c908ac2483e46';
export const TOOL='scripts/sandbox-cashout-exact-deploy.mjs';
export const MANIFEST='scripts/sandbox-cashout-deployment-manifest.json';
export const BASE_HISTORY_HASH='8ef39413e785edf6381b2d52f4c427415a4528e15314e2419c19a4e181ba5310';
export const ENDPOINTS=Object.freeze([{name:'sandbox-creator-cashout',verify_jwt:true},{name:'sandbox-creator-cashout-webhook',verify_jwt:false}]);
export const EDGE_FILES=Object.freeze(['_shared/creator-cashout-execution.ts','_shared/exact-subject-authority.ts','_shared/stripe-connect.ts','sandbox-creator-cashout/index.ts','sandbox-creator-cashout-webhook/index.ts'].map(x=>'supabase/functions/'+x));
export const CLOSURE=Object.freeze([...new Set([TOOL,MANIFEST,MIGRATION,'scripts/sandbox-cashout-deployment-contract.mjs','ops/creator-backend-rollout/prepare-edge.mjs','package.json','package-lock.json',...INGRESS_CLOSURE,...EDGE_FILES])]);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
const literal=x=>`'${String(x).replaceAll("'","''")}'`;
const hashSQL=x=>`encode(sha256(convert_to(${x},'UTF8')),'hex')`;
const digest=sql=>`(select ${hashSQL("coalesce(jsonb_agg(item order by item::text collate \"C\")::text,'[]')")} from (${sql}) items)`;
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const newRelations=TABLES.map(x=>`coalesce(to_regclass(${literal(x)}),0)`).join(',');
const functionNames=FUNCTIONS.map(x=>literal(x.slice(0,x.indexOf('(')))).join(',');
const functionFilter=`n.nspname||'.'||p.proname in (${functionNames})`;
const expectedTriggers=TRIGGERS.map(x=>`(t.tgrelid=to_regclass(${literal(x.table)}) and t.tgname=${literal(x.name)})`).join(' or ');
// FKs add RI triggers to old referenced relations. Bind them to their exact new
// constraint, not PostgreSQL's OID-derived trigger name; retain all old RI triggers.
const addedTrigger=`((${expectedTriggers}) or (t.tgisinternal and coalesce(co.conrelid in (${newRelations}),false)))`;
const triggerItem=`jsonb_build_array('trigger',t.tgrelid::regclass::text,case when t.tgisinternal then null else t.tgname end,t.tgisinternal,t.tgfoid::regprocedure::text,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred,co.conrelid::regclass::text,co.conname,case when t.tgisinternal then null else pg_get_triggerdef(t.oid) end)`;
const catalogSQL=added=>`
 select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth') and p.prokind in ('f','p') and ${added?'':'not '}(${functionFilter})
 union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relpersistence,c.relreplident,c.relispartition,pg_get_expr(c.relpartbound,c.oid),case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) else null end) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and c.relkind in ('r','p','v','m','S') and c.oid ${added?'':'not '}in (${newRelations})
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private','auth') and a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m','S') and a.attrelid ${added?'':'not '}in (${newRelations})
 union all select jsonb_build_array('constraint',co.conrelid::regclass::text,co.conname,pg_get_constraintdef(co.oid),co.convalidated) from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname in ('public','private','auth') and co.conrelid<>0 and co.conrelid ${added?'':'not '}in (${newRelations}) and not ${redundantNotNull('co')}
 union all select jsonb_build_array('index',i.indrelid::regclass::text,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and i.indrelid ${added?'':'not '}in (${newRelations})
 union all select jsonb_build_array('policy',p.polrelid::regclass::text,p.polname,p.polcmd,p.polpermissive,(select array_agg(r::regrole::text order by r::regrole::text) from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and p.polrelid ${added?'':'not '}in (${newRelations})
 union all select ${triggerItem} from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace left join pg_constraint co on co.oid=t.tgconstraint where n.nspname in ('public','private','auth') and ${added?'':'not '}(${addedTrigger})
 ${added?'':`union all select jsonb_build_array('schema',nspname,nspowner::regrole::text,nspacl::text) from pg_namespace where nspname in ('public','private','auth')
 union all select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolbypassrls) from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
 union all select jsonb_build_array('membership',roleid::regrole::text,member::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) from pg_auth_members`}`;
export const existingCatalogSQL=digest(catalogSQL(false));
export const addedCatalogSQL=digest(catalogSQL(true));
export const GUARDED_TABLES=Object.freeze([...new Set([...DATA_TABLES,'private.discovery_invalidation_worker_config'])].sort());
export const LOCK_TABLES=Object.freeze([...new Set(['supabase_migrations.schema_migrations',...GUARDED_TABLES,...EXISTING_SOURCE_TABLES])].sort());
export const guardedDataSQL=digest(GUARDED_TABLES.map(x=>`select jsonb_build_array(${literal(x)},to_jsonb(t)) item from ${x} t`).join(' union all '));
export const sourceDataSQL=digest(EXISTING_SOURCE_TABLES.map(x=>`select jsonb_build_array(${literal(x)},to_jsonb(t)) item from ${x} t`).join(' union all '));
const discoverySQL=`(select count(*)=1 and bool_and(enabled and collecting and primary_delivery_enabled) from private.discovery_invalidation_worker_config)`;
const controlsSQL=`(${holdsSQL}) and (${discoverySQL})`;
const historyHash=(exclude=[])=>`(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]')")} from supabase_migrations.schema_migrations ${exclude.length?`where version not in (${exclude.map(literal).join(',')})`:''})`;
const exactHistory=(version,name,body)=>`exists(select 1 from supabase_migrations.schema_migrations where version=${literal(version)} and name=${literal(name)} and ${hashSQL('array_to_json(statements)::text')}=${literal(sha256(JSON.stringify([body])))})`;
const exactBody=(signature,hash)=>`exists(select 1 from pg_proc where oid=to_regprocedure(${literal(signature)}) and ${hashSQL('prosrc')}=${literal(hash)})`;
const tipSQL=b=>`${exactHistory(TIP_VERSION,TIP_NAME,b.ingress.tip.body)} and ${TIP_FUNCTIONS.map(f=>exactBody(f.signature,f.after)).join(' and ')}`;
const ingressSQL=b=>`${exactHistory(INGRESS_VERSION,INGRESS_NAME,b.ingress.body)} and ${exactBody(DISPATCH.signature,DISPATCH.after)} and ${ingressCatalogSQL}=${literal(b.ingress.manifest.addedCatalogSha256)}`;
const absentSQL=`not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname in (${TABLES.map(literal).join(',')})) and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${functionFilter}) and not exists(select 1 from pg_trigger t where ${expectedTriggers})`;
const inventorySQL=`(select count(*)=11 and bool_and(c.relkind='r' and c.relowner::regrole::text='postgres' and c.relrowsecurity and c.relforcerowsecurity) from pg_class c where c.oid in (${newRelations}))
 and (select count(*)=21 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${functionFilter})
 and ${FUNCTIONS.map(f=>`to_regprocedure(${literal(f)}) is not null`).join(' and ')}
 and (select count(*)=14 from pg_trigger t where not t.tgisinternal and (${expectedTriggers}))`;
const seedSQL=`(select count(*)=1 and bool_and(singleton and not enabled) from private.sandbox_cashout_control) and ${TABLES.filter(x=>!x.endsWith('_control')).map(x=>`(select count(*)=0 from ${x})`).join(' and ')}`;
const contextSQL=`jsonb_build_object('currentPostgres',current_user='postgres','currentReadOnly',current_user='supabase_read_only_user','sessionPostgres',session_user='postgres','sessionReadOnly',session_user='supabase_read_only_user','sessionAdmin',session_user='supabase_admin','transactionReadOnly',current_setting('transaction_read_only')='on')`;

export function sourceBinding(root,source){
 requireThat(/^[a-f0-9]{40}$/u.test(source??''),'EXACT_SOURCE_REQUIRED');
 requireThat(git(root,'rev-parse','HEAD')===source,'SOURCE_HEAD_MISMATCH');
 requireThat(git(root,'status','--porcelain','--untracked-files=no')==='','TRACKED_SOURCE_DIRTY');
 for(const file of CLOSURE){requireThat(git(root,'ls-files','--error-unmatch',file)===file,'TOOL_NOT_COMMITTED');requireThat(fs.readFileSync(path.join(root,file),'utf8')===execFileSync('git',['show',`${source}:${file}`],{cwd:root,encoding:'utf8'}),'SOURCE_BYTES_CHANGED');}
 return {source,tree:git(root,'rev-parse','HEAD^{tree}')};
}
export function loadBundle(root=ROOT,source){
 const read=file=>{try{return source?execFileSync('git',['show',`${source}:${file}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}):fs.readFileSync(path.join(root,file),'utf8');}catch{return null;}};
 const manifest=JSON.parse(read(MANIFEST)),body=read(MIGRATION),ingress=loadIngress(root,source);
 requireThat(manifest.schema===1&&manifest.project===PROJECT&&manifest.migration?.version===VERSION&&manifest.migration.name===NAME&&manifest.migration.sha256===HASH,'MANIFEST_INVALID');
 requireThat(sha256(body)===HASH,'MIGRATION_HASH_MISMATCH');
 requireThat(TABLES.length===11&&FUNCTIONS.length===21&&TRIGGERS.length===14,'SCHEMA_TARGET_INVENTORY_INVALID');
 requireThat(['unqualified','qualified'].includes(manifest.qualification?.status),'MANIFEST_INVALID');
 requireThat(manifest.edges?.length===ENDPOINTS.length,'EDGE_CLOSURE_INVALID');
 for(const [i,endpoint] of ENDPOINTS.entries()){
  const expected=manifest.edges[i],bundle=collectSourceBundle(read,`supabase/functions/${endpoint.name}/index.ts`);
  requireThat(expected.name===endpoint.name&&expected.verify_jwt===endpoint.verify_jwt&&expected.files?.length===bundle.files.length,'EDGE_CLOSURE_INVALID');
  for(const [j,file] of bundle.files.entries())requireThat(expected.files[j]?.path===file.name&&expected.files[j]?.sha256===sha256(file.content),'EDGE_HASH_MISMATCH');
 }
 return {manifest,body,ingress,originalHistorySha256:BASE_HISTORY_HASH,statementsSha256:sha256(JSON.stringify([body]))};
}
export function readbackSql(bundle){return `set local search_path=pg_catalog,public;select jsonb_build_object('schema',1,'database',current_database(),'context',${contextSQL},
 'historyCount',(select count(*) from supabase_migrations.schema_migrations),'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),'originalHistorySha256',${historyHash([VERSION,TIP_VERSION,INGRESS_VERSION])},'predecessorHistorySha256',${historyHash([VERSION])},
 'controls',coalesce((${controlsSQL}),false),'tip',coalesce((${tipSQL(bundle)}),false),'ingress',coalesce((${ingressSQL(bundle)}),false),
 'existingCatalogSha256',${existingCatalogSQL},'guardedDataSha256',${guardedDataSQL},'sourceDataSha256',${sourceDataSQL},'addedAbsent',(${absentSQL}),'addedInventory',(${inventorySQL}),'addedCatalogSha256',${addedCatalogSQL},
 'targets',coalesce((select jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsSha256',${hashSQL('array_to_json(statements)::text')})) from supabase_migrations.schema_migrations where version=${literal(VERSION)}),'[]'::jsonb)) state;`;}
export const seedReadbackSql=`set local search_path=pg_catalog,public;select jsonb_build_object('context',${contextSQL},'dormantSeed',(${seedSQL})) state;`;

export function requireQualification(bundle){
 const q=bundle.manifest.qualification,b=q.baseline;
 requireThat(q.status==='qualified','SANDBOX_BASELINE_UNQUALIFIED');
 requireThat(b?.historyCount===585&&b.historyMaximum===TIP_VERSION&&b.originalHistorySha256===bundle.originalHistorySha256,'BASELINE_HISTORY_INVENTORY_INVALID');
 requireThat([b.predecessorHistorySha256,b.existingCatalogSha256,b.guardedDataSha256,bundle.manifest.addedCatalogSha256].every(x=>/^[a-f0-9]{64}$/u.test(x??'')),'SCHEMA_CONTRACTS_REQUIRED');
 const receipts=q.predecessorReceipts;
 requireThat(receipts?.length===2,'ORDERED_PREDECESSOR_RECEIPTS_REQUIRED');
 for(const [i,[version,name,hash]] of [[TIP_VERSION,TIP_NAME,TIP_HASH],[INGRESS_VERSION,INGRESS_NAME,INGRESS_HASH]].entries()){
  const r=receipts[i];requireThat(r.project===PROJECT&&r.version===version&&r.name===name&&r.migrationSha256===hash&&r.status==='applied_verified'&&/^[a-f0-9]{40}$/u.test(r.source??'')&&/^[a-f0-9]{40}$/u.test(r.tree??'')&&Number.isFinite(Date.parse(r.appliedAt)),'ORDERED_PREDECESSOR_RECEIPTS_REQUIRED');
 }
 requireThat(Date.parse(receipts[0].appliedAt)<Date.parse(receipts[1].appliedAt)&&Number.isFinite(Date.parse(q.observedAt))&&Date.parse(q.observedAt)>=Date.parse(receipts[1].appliedAt),'ORDERED_PREDECESSOR_RECEIPTS_REQUIRED');
 return b;
}
export function classifyState(bundle,state){
 validateReadContext(state?.context);requireThat(state?.schema===1&&state.database==='postgres'&&Array.isArray(state.targets),'READBACK_INVALID');
 requireThat(state.controls===true,'PRODUCTION_HOLDS_MISMATCH');
 requireThat(state.originalHistorySha256===bundle.originalHistorySha256,'HISTORY_INVENTORY_MISMATCH');
 if(!state.tip){requireThat(!state.ingress&&state.targets.length===0&&state.addedAbsent===true&&state.historyCount===583&&state.historyMaximum==='20261101215711','HISTORY_INVENTORY_MISMATCH');return 'blocked_until_exact_tip_deployment';}
 if(!state.ingress){requireThat(state.targets.length===0&&state.addedAbsent===true&&state.historyCount===584&&state.historyMaximum===TIP_VERSION,'HISTORY_INVENTORY_MISMATCH');return 'blocked_until_exact_native_ingress_deployment';}
 if(bundle.manifest.qualification.status!=='qualified')return 'unqualified_post_predecessor_baseline';
 const b=requireQualification(bundle);
 requireThat(state.predecessorHistorySha256===b.predecessorHistorySha256&&state.historyCount===b.historyCount+state.targets.length&&state.historyMaximum===TIP_VERSION,'HISTORY_INVENTORY_MISMATCH');
 requireThat(state.existingCatalogSha256===b.existingCatalogSha256&&state.guardedDataSha256===b.guardedDataSha256,'BASELINE_CONTRACT_MISMATCH');
 if(state.targets.length===0){requireThat(state.addedAbsent===true&&state.addedInventory===false,'PARTIAL_SANDBOX_OBJECTS');return 'ready';}
 requireThat(state.targets.length===1&&state.targets[0].version===VERSION&&state.targets[0].name===NAME&&state.targets[0].statementsSha256===bundle.statementsSha256,'PARTIAL_OR_DIFFERENT_HISTORY');
 requireThat(state.addedAbsent===false&&state.addedInventory===true&&state.addedCatalogSha256===bundle.manifest.addedCatalogSha256,'FINAL_CATALOG_MISMATCH');return 'applied';
}
export function buildApplySql(bundle,before){
 requireQualification(bundle);requireThat(classifyState(bundle,before)==='ready','APPLY_REQUIRES_ABSENT_TARGETS');
 requireThat(/^[a-f0-9]{64}$/u.test(before.sourceDataSha256??''),'READBACK_INVALID');
 const b=bundle.manifest.qualification.baseline,common=`${historyHash([VERSION])}=${literal(b.predecessorHistorySha256)} and ${historyHash([VERSION,TIP_VERSION,INGRESS_VERSION])}=${literal(bundle.originalHistorySha256)} and ${existingCatalogSQL}=${literal(b.existingCatalogSha256)} and ${guardedDataSQL}=${literal(b.guardedDataSha256)} and ${sourceDataSQL}=${literal(before.sourceDataSha256)} and (${controlsSQL}) and (${tipSQL(bundle)}) and (${ingressSQL(bundle)})`;
 return `begin;set local search_path=pg_catalog,public;set local standard_conforming_strings=on;set local lock_timeout='5s';set local statement_timeout='45s';set local idle_in_transaction_session_timeout='60s';
 do $sandbox_apply$ begin
 if current_user<>'postgres' or current_setting('transaction_read_only')<>'off' then raise exception 'sandbox_write_authority_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('chillywood-sandbox-cashout-exact-deployment',0));
 lock table ${LOCK_TABLES.join(',')} in share row exclusive mode;
 lock table auth.users in share mode;
 if (${common} and (select count(*)=585 and max(version)=${literal(TIP_VERSION)} from supabase_migrations.schema_migrations) and (${absentSQL}) and not exists(select 1 from supabase_migrations.schema_migrations where version=${literal(VERSION)})) is not true then raise exception 'sandbox_baseline_changed';end if;
 execute ${literal(bundle.body)};
 insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(VERSION)},${literal(NAME)},array[${literal(bundle.body)}]::text[]);
 if (${common} and (select count(*)=586 and max(version)=${literal(TIP_VERSION)} from supabase_migrations.schema_migrations) and ${exactHistory(VERSION,NAME,bundle.body)} and (${inventorySQL}) and ${addedCatalogSQL}=${literal(bundle.manifest.addedCatalogSha256)} and (${seedSQL})) is not true then raise exception 'sandbox_postcheck_failed';end if;
 end $sandbox_apply$;notify pgrst,'reload schema';commit;`;
}
async function confirmDormant(query){const r=await query(seedReadbackSql,true);validateReadContext(r?.context);requireThat(r.dormantSeed===true,'DORMANT_SEED_MISMATCH');}
export async function deploy({bundle,apply=false,query,recheckSource=()=>{}}){
 const before=await query(readbackSql(bundle),true),mode=classifyState(bundle,before);
 if(apply)requireQualification(bundle);
 if(mode==='applied'){await confirmDormant(query);return {status:'already_applied_verified',wrote:false,before};}
 if(mode!=='ready'||!apply)return {status:mode==='ready'?'plan_ready':mode,wrote:false,before};
 recheckSource();let responseConfirmed=false;
 try{await query(buildApplySql(bundle,before),false);responseConfirmed=true;}catch{/* An unknown write is never retried. */}
 try{const after=await query(readbackSql(bundle),true);if(classifyState(bundle,after)==='applied'&&after.sourceDataSha256===before.sourceDataSha256){await confirmDormant(query);return {status:'applied_verified',wrote:true,responseConfirmed,after};}}catch{/* Only bounded diagnostic state may leave the CLI. */}
 return {status:'apply_unconfirmed',wrote:true,responseConfirmed};
}
const ERRORS=[...HELPER_ERROR_CODES,'SANDBOX_BASELINE_UNQUALIFIED','ORDERED_PREDECESSOR_RECEIPTS_REQUIRED','PARTIAL_SANDBOX_OBJECTS','DORMANT_SEED_MISMATCH'];
export const safeError=e=>ERRORS.includes(e?.message)?e.message:'SANDBOX_DEPLOY_BLOCKED';
async function main(){
 const args=process.argv.slice(2);if(args.length===1&&args[0]==='--help'){process.stdout.write('Usage: node scripts/sandbox-cashout-exact-deploy.mjs --source FULL_COMMIT_SHA [--apply]\nDefault read-only; committed production baseline is unqualified. No baseline override, snapshot qualification, Edge/provider operation, activation or write retry.\n');return;}
 requireThat(args.filter(x=>x==='--source').length===1,'EXACT_SOURCE_REQUIRED');const i=args.indexOf('--source'),source=args[i+1],rest=args.filter((_,j)=>j!==i&&j!==i+1);requireThat(rest.length===0||(rest.length===1&&rest[0]==='--apply'),'ARGUMENT_INVALID');
 const binding=sourceBinding(ROOT,source),bundle=loadBundle(ROOT,source);if(rest.includes('--apply'))requireQualification(bundle);
 const result=await deploy({bundle,apply:rest.includes('--apply'),query:diagnosticManagementQuery(process.env.SUPABASE_ACCESS_TOKEN),recheckSource:()=>{sourceBinding(ROOT,source);loadBundle(ROOT,source);}});
 process.stdout.write(JSON.stringify({project:PROJECT,...binding,version:VERSION,name:NAME,sha256:HASH,status:result.status,wrote:result.wrote,responseConfirmed:result.responseConfirmed})+'\n');if(!['plan_ready','already_applied_verified','applied_verified'].includes(result.status))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(JSON.stringify({status:'blocked',code:safeError(e)})+'\n');process.exitCode=1;});
