#!/usr/bin/env node
// One immutable evidence-only migration. No Edge/provider IO or credential setup.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256,diagnosticManagementQuery,validateReadContext,HELPER_ERROR_CODES} from './live-room-exact-deploy.mjs';
import {loadBundle as loadTipBundle,FUNCTIONS as TIP_FUNCTIONS,DATA_TABLES,dataHashSQL,holdsSQL,TOOL as TIP_TOOL,MANIFEST as TIP_MANIFEST,MIGRATION as TIP_MIGRATION,VERSION as TIP_VERSION,NAME as TIP_NAME} from './native-tip-exact-deploy.mjs';

export const PROJECT='bmkkhihfbmsnnmcqkoly';
export const VERSION='20261103005000';
export const NAME='native_production_ingress_observations';
export const MIGRATION=`supabase/migrations/${VERSION}_${NAME}.sql`;
export const HASH='f18382b2899ed69a3e422538f451f11f1519b53b1ce780d12221cbeb50a48efe';
export const TOOL='scripts/native-ingress-exact-deploy.mjs';
export const MANIFEST='scripts/native-ingress-deployment-manifest.json';
export const EDGE_FILES=Object.freeze([
  'supabase/functions/revenuecat-webhook/index.ts',
  'supabase/functions/revenuecat-webhook/store-policy.mjs',
  'supabase/functions/_shared/provider-readiness.ts',
  'supabase/functions/_shared/notification-payload.mjs',
  'supabase/functions/_shared/expo-push-receipts.ts',
  'supabase/functions/_shared/expo-push-receipt-policy.mjs',
  'supabase/functions/_shared/notification-display-labels.ts',
]);
export const CLOSURE=Object.freeze([TOOL,MANIFEST,MIGRATION,TIP_TOOL,TIP_MANIFEST,TIP_MIGRATION,'scripts/live-room-exact-deploy.mjs','scripts/studio-rolling-deploy.mjs',...EDGE_FILES]);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
const literal=s=>`'${String(s).replaceAll("'","''")}'`;
const hashSQL=s=>`encode(sha256(convert_to(${s},'UTF8')),'hex')`;
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
export const DISPATCH=Object.freeze({signature:'public.begin_creator_money_checkout(uuid,uuid)',before:'a4d8298b3cdc3b5ce299c2191fb8b434f14672944745ded191a0dac5ccefb877',after:'2ddcf62a2a176d57b357011b2fb67d542db1fb5ee669485ce9170242ec38f9cc'});
export const ADDED_FUNCTIONS=Object.freeze(['public.record_native_production_ingress_observation(jsonb)','private.assert_creator_native_dispatch_environment(text)']);
export const ADDED_TABLES=Object.freeze(['private.native_production_ingress_qualifications','private.native_production_ingress_revocations','private.native_production_ingress_observations']);
const RELATIONS=[...DATA_TABLES,'public.money_purchase_intents','public.creator_money_purchase_quotes','public.provider_events','public.revenuecat_webhook_ingress_events'];
const relationOids=RELATIONS.map(r=>`to_regclass(${literal(r)})`).join(',');
const addedRelationOids=ADDED_TABLES.map(r=>`to_regclass(${literal(r)})`).join(',');
const addedFunctionOids=ADDED_FUNCTIONS.map(r=>`coalesce(to_regprocedure(${literal(r)}),0)`).join(',');
const maskedOids=[DISPATCH,...TIP_FUNCTIONS].map(f=>`to_regprocedure(${literal(f.signature)})`).join(',');
const contextSQL=`jsonb_build_object('currentPostgres',current_user='postgres','currentReadOnly',current_user='supabase_read_only_user','sessionPostgres',session_user='postgres','sessionReadOnly',session_user='supabase_read_only_user','sessionAdmin',session_user='supabase_admin','transactionReadOnly',current_setting('transaction_read_only')='on')`;
// The immutable 583-entry predecessor is checked separately from exact tip/native
// rows. Native sorts before tip; historyMaximum must NOT become native's version.
export const priorHistoryHashSQL=`(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]')")} from supabase_migrations.schema_migrations where version not in (${literal(VERSION)},${literal(TIP_VERSION)}))`;
export const invariantsHashSQL=`(select ${hashSQL("coalesce(jsonb_agg(item order by item::text)::text,'[]')")} from (
 select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),case when p.oid in (${maskedOids}) then replace(pg_get_functiondef(p.oid),p.prosrc,'<EXACT_NATIVE_INGRESS_OR_TIP_BODY>') else pg_get_functiondef(p.oid) end,p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind in ('f','p') and p.oid not in (${addedFunctionOids})
 union all select jsonb_build_array('schema',nspname,nspowner::regrole::text,nspacl::text) from pg_namespace where nspname in ('public','private')
 union all select jsonb_build_array('relation',c.oid::regclass::text,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) from pg_class c where c.oid in (${relationOids})
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid in (${relationOids}) and a.attnum>0 and not a.attisdropped
 union all select jsonb_build_array('policy',polrelid::regclass::text,polname,polcmd,polpermissive,(select array_agg(r::regrole::text order by r::regrole::text) from unnest(polroles) r),pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) from pg_policy where polrelid in (${relationOids})
 union all select jsonb_build_array('trigger',tgrelid::regclass::text,tgname,pg_get_triggerdef(oid),tgenabled) from pg_trigger where tgrelid in (${relationOids}) and not tgisinternal
 union all select jsonb_build_array('constraint',conrelid::regclass::text,conname,pg_get_constraintdef(oid),convalidated) from pg_constraint where conrelid in (${relationOids})
 union all select jsonb_build_array('index',indrelid::regclass::text,pg_get_indexdef(indexrelid),indisvalid,indisready) from pg_index where indrelid in (${relationOids})
 union all select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolbypassrls) from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
 union all select jsonb_build_array('membership',roleid::regrole::text,member::regrole::text,admin_option) from pg_auth_members
 ) guarded_catalog)`;
export const addedCatalogHashSQL=`(select ${hashSQL("coalesce(jsonb_agg(item order by item::text)::text,'[]')")} from (
 select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid in (${addedFunctionOids})
 union all select jsonb_build_array('relation',c.oid::regclass::text,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) from pg_class c where c.oid in (${addedRelationOids})
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid in (${addedRelationOids}) and a.attnum>0 and not a.attisdropped
 union all select jsonb_build_array('policy',polrelid::regclass::text,polname,polcmd,polpermissive,(select array_agg(r::regrole::text order by r::regrole::text) from unnest(polroles) r),pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) from pg_policy where polrelid in (${addedRelationOids})
 union all select jsonb_build_array('trigger',tgrelid::regclass::text,tgname,pg_get_triggerdef(oid),tgenabled) from pg_trigger where tgrelid in (${addedRelationOids}) and not tgisinternal
 union all select jsonb_build_array('constraint',conrelid::regclass::text,conname,pg_get_constraintdef(oid),convalidated) from pg_constraint where conrelid in (${addedRelationOids})
 union all select jsonb_build_array('index',indrelid::regclass::text,pg_get_indexdef(indexrelid),indisvalid,indisready) from pg_index where indrelid in (${addedRelationOids})
 ) added_catalog)`;
const absentSQL=[...ADDED_TABLES.map(r=>`to_regclass(${literal(r)}) is null`),...ADDED_FUNCTIONS.map(r=>`to_regprocedure(${literal(r)}) is null`)].join(' and ');
const presentSQL=[...ADDED_TABLES.map(r=>`to_regclass(${literal(r)}) is not null`),...ADDED_FUNCTIONS.map(r=>`to_regprocedure(${literal(r)}) is not null`)].join(' and ');
const dispatchSQL=phase=>`exists(select 1 from pg_proc p where p.oid=to_regprocedure(${literal(DISPATCH.signature)}) and ${hashSQL('p.prosrc')}=${literal(DISPATCH[phase])})`;
const tipSQL=bundle=>`exists(select 1 from supabase_migrations.schema_migrations m where version=${literal(TIP_VERSION)} and name=${literal(TIP_NAME)} and ${hashSQL('array_to_json(m.statements)::text')}=${literal(bundle.tip.statementsSha256)}) and ${TIP_FUNCTIONS.map(f=>`exists(select 1 from pg_proc p where p.oid=to_regprocedure(${literal(f.signature)}) and ${hashSQL('p.prosrc')}=${literal(f.after)})`).join(' and ')}`;
const exactTargetSQL=bundle=>`exists(select 1 from supabase_migrations.schema_migrations m where version=${literal(VERSION)} and name=${literal(NAME)} and ${hashSQL('array_to_json(m.statements)::text')}=${literal(bundle.statementsSha256)})`;

export function sourceBinding(root,source){
  requireThat(/^[a-f0-9]{40}$/u.test(source??''),'EXACT_SOURCE_REQUIRED');
  requireThat(git(root,'rev-parse','HEAD').trim()===source,'SOURCE_HEAD_MISMATCH');
  requireThat(git(root,'status','--porcelain','--untracked-files=no').trim()==='','TRACKED_SOURCE_DIRTY');
  for(const file of CLOSURE){
    requireThat(git(root,'ls-files','--error-unmatch',file).trim()===file,'TOOL_NOT_COMMITTED');
    requireThat(fs.readFileSync(path.join(root,file),'utf8')===git(root,'show',`${source}:${file}`),'SOURCE_BYTES_CHANGED');
  }
  return {source,tree:git(root,'rev-parse','HEAD^{tree}').trim()};
}
export function loadBundle(root=ROOT,source){
  const read=file=>source?git(root,'show',`${source}:${file}`):fs.readFileSync(path.join(root,file),'utf8');
  const manifest=JSON.parse(read(MANIFEST)),body=read(MIGRATION),tip=loadTipBundle(root,source);
  requireThat(manifest.schema===1&&manifest.project===PROJECT&&manifest.migration?.version===VERSION&&manifest.migration.name===NAME&&manifest.migration.sha256===HASH,'MANIFEST_INVALID');
  requireThat(manifest.baselineHistory?.count===583&&manifest.baselineHistory.maximum==='20261101215711'&&manifest.baselineHistory.sha256===tip.manifest.baselineHistory.sha256,'BASELINE_HISTORY_INVENTORY_INVALID');
  requireThat([manifest.invariantsSha256,manifest.dataSha256,manifest.addedCatalogSha256].every(x=>/^[a-f0-9]{64}$/u.test(x??'')),'MANIFEST_INVALID');
  requireThat(sha256(body)===HASH,'MIGRATION_HASH_MISMATCH');
  requireThat(manifest.edge?.name==='revenuecat-webhook'&&manifest.edge.verifyJwt===false&&manifest.edge.files?.length===EDGE_FILES.length,'EDGE_CLOSURE_INVALID');
  for(const [i,item] of manifest.edge.files.entries())requireThat(item.path===EDGE_FILES[i]&&sha256(read(item.path))===item.sha256,'EDGE_HASH_MISMATCH');
  return {manifest,body,tip,statementsSha256:sha256(JSON.stringify([body]))};
}
export function readbackSql(bundle){
  return `set local search_path=pg_catalog,public; select jsonb_build_object('schema',1,'database',current_database(),'context',${contextSQL},
 'priorHistorySha256',${priorHistoryHashSQL},'historyCount',(select count(*) from supabase_migrations.schema_migrations),'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),
 'invariantsSha256',${invariantsHashSQL},'dataSha256',${dataHashSQL},'holds',coalesce((${holdsSQL}),false),'tipPrerequisite',coalesce((${tipSQL(bundle)}),false),
 'baselineDispatch',(${dispatchSQL('before')}),'finalDispatch',(${dispatchSQL('after')}),'addedAbsent',(${absentSQL}),'addedPresent',(${presentSQL}),'addedCatalogSha256',${addedCatalogHashSQL},
 'targets',coalesce((select jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsSha256',${hashSQL('array_to_json(m.statements)::text')})) from supabase_migrations.schema_migrations m where version=${literal(VERSION)}),'[]'::jsonb)) state;`;
}
export function classifyState(bundle,state){
  validateReadContext(state?.context);
  requireThat(state?.schema===1&&state.database==='postgres'&&Array.isArray(state.targets),'READBACK_INVALID');
  requireThat(state.holds===true,'PRODUCTION_HOLDS_MISMATCH');
  requireThat(state.tipPrerequisite===true,'EXACT_TIP_PREREQUISITE_REQUIRED');
  requireThat(state.priorHistorySha256===bundle.manifest.baselineHistory.sha256&&state.historyCount===bundle.manifest.baselineHistory.count+1+state.targets.length&&state.historyMaximum===TIP_VERSION,'HISTORY_INVENTORY_MISMATCH');
  requireThat(state.invariantsSha256===bundle.manifest.invariantsSha256&&state.dataSha256===bundle.manifest.dataSha256,'BASELINE_CONTRACT_MISMATCH');
  if(state.targets.length===0){requireThat(state.baselineDispatch===true&&state.finalDispatch===false&&state.addedAbsent===true&&state.addedPresent===false,'BASELINE_CONTRACT_MISMATCH');return 'ready';}
  requireThat(state.targets.length===1&&state.targets[0].version===VERSION&&state.targets[0].name===NAME&&state.targets[0].statementsSha256===bundle.statementsSha256,'PARTIAL_OR_DIFFERENT_HISTORY');
  requireThat(state.finalDispatch===true&&state.baselineDispatch===false&&state.addedPresent===true&&state.addedAbsent===false&&state.addedCatalogSha256===bundle.manifest.addedCatalogSha256,'FINAL_CATALOG_MISMATCH');return 'applied';
}
export function buildApplySql(bundle,baseline){
  requireThat(classifyState(bundle,baseline)==='ready','APPLY_REQUIRES_ABSENT_TARGETS');
  const {manifest,body}=bundle;
  const common=`${priorHistoryHashSQL}=${literal(manifest.baselineHistory.sha256)} and ${invariantsHashSQL}=${literal(manifest.invariantsSha256)} and ${dataHashSQL}=${literal(manifest.dataSha256)} and (${holdsSQL}) and (${tipSQL(bundle)})`;
  return `begin;
set local search_path=pg_catalog,public;
set local standard_conforming_strings=on;
set local lock_timeout='5s';
set local statement_timeout='45s';
set local idle_in_transaction_session_timeout='60s';
do $ingress_apply$ begin
 if current_user<>'postgres' or current_setting('transaction_read_only')<>'off' then raise exception 'native_ingress_write_authority_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('chillywood-native-ingress-exact-deployment',0));
 lock table supabase_migrations.schema_migrations,${DATA_TABLES.join(',')} in share row exclusive mode;
 if (${common} and (select count(*)=${manifest.baselineHistory.count+1} from supabase_migrations.schema_migrations)
 and not exists(select 1 from supabase_migrations.schema_migrations where version=${literal(VERSION)}) and (${absentSQL}) and (${dispatchSQL('before')})) is not true then raise exception 'native_ingress_baseline_changed'; end if;
 execute ${literal(body)};
 insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(VERSION)},${literal(NAME)},array[${literal(body)}]::text[]);
 if (${common} and (select count(*)=${manifest.baselineHistory.count+2} from supabase_migrations.schema_migrations)
 and (${exactTargetSQL(bundle)}) and (${dispatchSQL('after')}) and (${presentSQL}) and ${addedCatalogHashSQL}=${literal(manifest.addedCatalogSha256)}
 and ${ADDED_TABLES.map(r=>`(select count(*)=0 from ${r})`).join(' and ')}) is not true then raise exception 'native_ingress_postcheck_failed'; end if;
end $ingress_apply$;
notify pgrst,'reload schema';
commit;`;
}
export async function deploy({bundle,apply=false,query,recheckSource=()=>{}}){
  const before=await query(readbackSql(bundle),true),mode=classifyState(bundle,before);
  if(!apply||mode==='applied')return {status:mode==='applied'?'already_applied_verified':'plan_ready',wrote:false,before};
  recheckSource();let responseConfirmed=false;
  try{await query(buildApplySql(bundle,before),false);responseConfirmed=true;}catch{/* Never retry an uncertain write. */}
  let after;
  try{after=await query(readbackSql(bundle),true);if(classifyState(bundle,after)==='applied')return {status:'applied_verified',wrote:true,responseConfirmed,after};}catch{/* No private database details emitted. */}
  return {status:'apply_unconfirmed',wrote:true,responseConfirmed,after};
}
export const safeError=e=>HELPER_ERROR_CODES.includes(e?.message)?e.message:'NATIVE_INGRESS_DEPLOY_BLOCKED';
async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){process.stdout.write('Usage: node scripts/native-ingress-exact-deploy.mjs --source FULL_COMMIT_SHA [--apply]\nDefault read-only. Exact evidence-only migration after verified tip deployment. Requires existing SUPABASE_ACCESS_TOKEN. No Edge deployment, credentials, qualification records, money activation or write retries.\n');return;}
  requireThat(args.filter(x=>x==='--source').length===1,'EXACT_SOURCE_REQUIRED');
  const index=args.indexOf('--source'),source=args[index+1],rest=args.filter((_,i)=>i!==index&&i!==index+1);
  requireThat(rest.length===0||(rest.length===1&&rest[0]==='--apply'),'ARGUMENT_INVALID');
  const binding=sourceBinding(ROOT,source),bundle=loadBundle(ROOT,source);
  const result=await deploy({bundle,apply:rest.includes('--apply'),query:diagnosticManagementQuery(process.env.SUPABASE_ACCESS_TOKEN),recheckSource:()=>{sourceBinding(ROOT,source);loadBundle(ROOT,source);}});
  process.stdout.write(JSON.stringify({project:PROJECT,...binding,version:VERSION,name:NAME,sha256:HASH,status:result.status,wrote:result.wrote,responseConfirmed:result.responseConfirmed})+'\n');
  if(!['plan_ready','already_applied_verified','applied_verified'].includes(result.status))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(JSON.stringify({status:'blocked',code:safeError(e)})+'\n');process.exitCode=1;});
