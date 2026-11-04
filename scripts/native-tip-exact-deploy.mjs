#!/usr/bin/env node
// One immutable migration only. Default read-only; no write retry or provider IO.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256,diagnosticManagementQuery,validateReadContext,HELPER_ERROR_CODES} from './live-room-exact-deploy.mjs';

export const PROJECT='bmkkhihfbmsnnmcqkoly';
export const VERSION='20261104032615';
export const NAME='native_tip_catalog_amount_policy';
export const MIGRATION=`supabase/migrations/${VERSION}_${NAME}.sql`;
export const HASH='f18d738818dcc68ab6ff61f737a4755be4dcc4fd02846249c01647c1f5d3fc2b';
export const TOOL='scripts/native-tip-exact-deploy.mjs';
export const MANIFEST='scripts/native-tip-deployment-manifest.json';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CLOSURE=[TOOL,MANIFEST,MIGRATION,'scripts/live-room-exact-deploy.mjs','scripts/studio-rolling-deploy.mjs'];
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
const literal=s=>`'${String(s).replaceAll("'","''")}'`;
const hashSQL=s=>`encode(sha256(convert_to(${s},'UTF8')),'hex')`;
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
// SHA256 of pg_proc.prosrc, not of the surrounding pg_get_functiondef text.
export const FUNCTIONS=Object.freeze([
  {signature:'public.list_creator_supported_prices_pre_subscription_binding(text,text,text,uuid)',before:'bb4ea523133f7a1f05acbe6e01506f2489e5765fe7b86820e7876bc710f097cb',after:'2201d35ead606860b21132c975f7489070bc604ec0bef9d39398e4962bc12277'},
  {signature:'public.create_money_purchase_intent_pre_protected_video_closeout(text,text,uuid,jsonb)',before:'23f8f49b628b3cf30f044d172b9fd779961313b29de396872b2807ca652ed1ea',after:'05215d2e9e0cd96dddb729ba6f4d319aecf93190e0465a41201fbb8a0dd605e0'},
  {signature:'private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)',before:'69d4582f35aef3fd6606e74a96158354cd0f6d47ed057de23892cd6c51d651a6',after:'4c53266065c65086db44ddd861693c3a301990ace222e12a9bf0e0f21afe3d01'},
]);
// All public wrappers and authority helpers are included in the catalog digest,
// not merely the three bodies. Only those bodies are masked; their metadata is not.
export const DATA_TABLES=Object.freeze(['public.monetization_products','public.monetization_product_store_mappings','public.creator_tip_settings','public.platform_money_kill_switches','private.creator_clip_export_worker','private.deleted_content_retention_settings']);
const RELATIONS=[...DATA_TABLES,'public.money_purchase_intents','public.creator_money_purchase_quotes','private.creator_tip_route_fee_evidence','private.creator_external_payment_capabilities'];
const targetOids=FUNCTIONS.map(f=>`to_regprocedure(${literal(f.signature)})`).join(',');
const relationOids=RELATIONS.map(r=>`to_regclass(${literal(r)})`).join(',');
const contextSQL=`jsonb_build_object('currentPostgres',current_user='postgres','currentReadOnly',current_user='supabase_read_only_user','sessionPostgres',session_user='postgres','sessionReadOnly',session_user='supabase_read_only_user','sessionAdmin',session_user='supabase_admin','transactionReadOnly',current_setting('transaction_read_only')='on')`;
// Excluding the target proves every prior version/name/body remains unchanged.
const priorHistoryHash=`(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]')")} from supabase_migrations.schema_migrations where version<>${literal(VERSION)})`;
export const invariantsHashSQL=`(select ${hashSQL("coalesce(jsonb_agg(item order by item::text)::text,'[]')")} from (
 select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),case when p.oid in (${targetOids}) then replace(pg_get_functiondef(p.oid),p.prosrc,'<EXACT_NATIVE_TIP_BODY>') else pg_get_functiondef(p.oid) end,p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind in ('f','p')
 union all select jsonb_build_array('relation',c.oid::regclass::text,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) from pg_class c where c.oid in (${relationOids})
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid in (${relationOids}) and a.attnum>0 and not a.attisdropped
 union all select jsonb_build_array('policy',polrelid::regclass::text,polname,polcmd,polpermissive,(select array_agg(r::regrole::text order by r::regrole::text) from unnest(polroles) r),pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) from pg_policy where polrelid in (${relationOids})
 union all select jsonb_build_array('trigger',tgrelid::regclass::text,tgname,pg_get_triggerdef(oid),tgenabled) from pg_trigger where tgrelid in (${relationOids}) and not tgisinternal
 union all select jsonb_build_array('constraint',conrelid::regclass::text,conname,pg_get_constraintdef(oid),convalidated) from pg_constraint where conrelid in (${relationOids})
 union all select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolbypassrls) from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
 union all select jsonb_build_array('membership',roleid::regrole::text,member::regrole::text,admin_option) from pg_auth_members
 ) guarded_catalog)`;
export const dataHashSQL=`(select ${hashSQL("coalesce(jsonb_agg(item order by item::text)::text,'[]')")} from (${DATA_TABLES.map(r=>`select jsonb_build_array(${literal(r)},to_jsonb(t)) item from ${r} t`).join('\nunion all\n')}) guarded_data)`;
export const holdsSQL=`(select count(*)=9 and bool_and(state=case when key in ('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end) from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled'))
 and (select count(*)=1 and bool_and(not enabled) from private.creator_clip_export_worker)
 and (select count(*)=1 and bool_and(not capture_enabled and not media_staging_enabled and not text_expiry_enabled and not media_expiry_enabled and not activation_ready and not legacy_object_deletes_blocked) from private.deleted_content_retention_settings)`;
const functionsSQL=phase=>FUNCTIONS.map(f=>`exists(select 1 from pg_proc p where p.oid=to_regprocedure(${literal(f.signature)}) and ${hashSQL('p.prosrc')}=${literal(f[phase])}
 and p.prokind='f' and p.prosecdef and p.proconfig=array['search_path=""']::text[] and p.proowner::regrole::text='postgres' and p.proacl::text='{postgres=X/postgres}'
 and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE'))`).join(' and ');

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
  const manifest=JSON.parse(read(MANIFEST)),body=read(MIGRATION);
  requireThat(manifest.schema===1&&manifest.project===PROJECT&&manifest.migration?.version===VERSION&&manifest.migration.name===NAME&&manifest.migration.sha256===HASH,'MANIFEST_INVALID');
  requireThat(manifest.baselineHistory?.count===583&&manifest.baselineHistory.maximum==='20261101215711'&&manifest.baselineHistory.sha256==='8ef39413e785edf6381b2d52f4c427415a4528e15314e2419c19a4e181ba5310','BASELINE_HISTORY_INVENTORY_INVALID');
  requireThat([manifest.invariantsSha256,manifest.dataSha256].every(x=>/^[a-f0-9]{64}$/u.test(x??'')),'MANIFEST_INVALID');
  requireThat(sha256(body)===HASH,'MIGRATION_HASH_MISMATCH');
  return {manifest,body,statementsSha256:sha256(JSON.stringify([body]))};
}
export function readbackSql(bundle){
  return `set local search_path=pg_catalog,public; select jsonb_build_object('schema',1,'database',current_database(),'context',${contextSQL},
 'priorHistorySha256',${priorHistoryHash},'historyCount',(select count(*) from supabase_migrations.schema_migrations),'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),
 'invariantsSha256',${invariantsHashSQL},'dataSha256',${dataHashSQL},'holds',coalesce((${holdsSQL}),false),
 'baselineFunctions',(${functionsSQL('before')}),'finalFunctions',(${functionsSQL('after')}),
 'targets',coalesce((select jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsSha256',${hashSQL('array_to_json(m.statements)::text')})) from supabase_migrations.schema_migrations m where version=${literal(VERSION)}),'[]'::jsonb)) state;`;
}
export function classifyState(bundle,state){
  validateReadContext(state?.context);
  requireThat(state?.schema===1&&state.database==='postgres'&&Array.isArray(state.targets),'READBACK_INVALID');
  requireThat(state.holds===true,'PRODUCTION_HOLDS_MISMATCH');
  requireThat(state.priorHistorySha256===bundle.manifest.baselineHistory.sha256&&state.historyCount===bundle.manifest.baselineHistory.count+state.targets.length&&state.historyMaximum===(state.targets.length?VERSION:bundle.manifest.baselineHistory.maximum),'HISTORY_INVENTORY_MISMATCH');
  requireThat(state.invariantsSha256===bundle.manifest.invariantsSha256&&state.dataSha256===bundle.manifest.dataSha256,'BASELINE_CONTRACT_MISMATCH');
  if(state.targets.length===0){requireThat(state.baselineFunctions===true&&state.finalFunctions===false,'BASELINE_CONTRACT_MISMATCH');return 'ready';}
  requireThat(state.targets.length===1&&state.targets[0].version===VERSION&&state.targets[0].name===NAME&&state.targets[0].statementsSha256===bundle.statementsSha256,'PARTIAL_OR_DIFFERENT_HISTORY');
  requireThat(state.finalFunctions===true&&state.baselineFunctions===false,'FINAL_CATALOG_MISMATCH');return 'applied';
}
export function buildApplySql(bundle,baseline){
  requireThat(classifyState(bundle,baseline)==='ready','APPLY_REQUIRES_ABSENT_TARGETS');
  const {manifest,body}=bundle;
  return `begin;
set local search_path=pg_catalog,public;
set local standard_conforming_strings=on;
set local lock_timeout='5s';
set local statement_timeout='45s';
set local idle_in_transaction_session_timeout='60s';
do $tip_apply$ begin
 if current_user<>'postgres' or current_setting('transaction_read_only')<>'off' then raise exception 'native_tip_write_authority_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('chillywood-native-tip-exact-deployment',0));
 lock table supabase_migrations.schema_migrations,${DATA_TABLES.join(',')} in share row exclusive mode;
 if (${priorHistoryHash}=${literal(manifest.baselineHistory.sha256)} and (select count(*)=${manifest.baselineHistory.count} from supabase_migrations.schema_migrations)
 and not exists(select 1 from supabase_migrations.schema_migrations where version=${literal(VERSION)})
 and ${invariantsHashSQL}=${literal(manifest.invariantsSha256)} and ${dataHashSQL}=${literal(manifest.dataSha256)} and (${holdsSQL}) and (${functionsSQL('before')})) is not true then raise exception 'native_tip_baseline_changed'; end if;
 execute ${literal(body)};
 insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(VERSION)},${literal(NAME)},array[${literal(body)}]::text[]);
 if ((${functionsSQL('after')}) and (${holdsSQL}) and ${invariantsHashSQL}=${literal(manifest.invariantsSha256)} and ${dataHashSQL}=${literal(manifest.dataSha256)}
 and ${priorHistoryHash}=${literal(manifest.baselineHistory.sha256)} and (select count(*)=${manifest.baselineHistory.count+1} from supabase_migrations.schema_migrations)
 and exists(select 1 from supabase_migrations.schema_migrations m where version=${literal(VERSION)} and name=${literal(NAME)} and ${hashSQL('array_to_json(m.statements)::text')}=${literal(bundle.statementsSha256)})) is not true then raise exception 'native_tip_postcheck_failed'; end if;
end $tip_apply$;
notify pgrst,'reload schema';
commit;`;
}
export async function deploy({bundle,apply=false,query,recheckSource=()=>{}}){
  const before=await query(readbackSql(bundle),true),mode=classifyState(bundle,before);
  if(!apply||mode==='applied')return {status:mode==='applied'?'already_applied_verified':'plan_ready',wrote:false,before};
  recheckSource();let responseConfirmed=false;
  try{await query(buildApplySql(bundle,before),false);responseConfirmed=true;}catch{/* Never retry an uncertain write. */}
  let after;
  try{after=await query(readbackSql(bundle),true);if(classifyState(bundle,after)==='applied')return {status:'applied_verified',wrote:true,responseConfirmed,after};}catch{/* No raw database or provider error is emitted. */}
  // Even the old snapshot cannot prove the timed-out transaction cannot commit.
  return {status:'apply_unconfirmed',wrote:true,responseConfirmed,after};
}
export const safeError=e=>HELPER_ERROR_CODES.includes(e?.message)?e.message:'NATIVE_TIP_DEPLOY_BLOCKED';
async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){process.stdout.write('Usage: node scripts/native-tip-exact-deploy.mjs --source FULL_COMMIT_SHA [--apply]\nDefault read-only. Exact PR669 migration only. Requires existing SUPABASE_ACCESS_TOKEN. No write retries, token/config changes, Edge/OTA deployment or provider activation.\n');return;}
  requireThat(args.filter(x=>x==='--source').length===1,'EXACT_SOURCE_REQUIRED');
  const index=args.indexOf('--source'),source=args[index+1],rest=args.filter((_,i)=>i!==index&&i!==index+1);
  requireThat(rest.length===0||(rest.length===1&&rest[0]==='--apply'),'ARGUMENT_INVALID');
  const binding=sourceBinding(ROOT,source),bundle=loadBundle(ROOT,source);
  const result=await deploy({bundle,apply:rest.includes('--apply'),query:diagnosticManagementQuery(process.env.SUPABASE_ACCESS_TOKEN),recheckSource:()=>{sourceBinding(ROOT,source);loadBundle(ROOT,source);}});
  process.stdout.write(JSON.stringify({project:PROJECT,...binding,version:VERSION,name:NAME,sha256:HASH,status:result.status,wrote:result.wrote,responseConfirmed:result.responseConfirmed})+'\n');
  if(!['plan_ready','already_applied_verified','applied_verified'].includes(result.status))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(JSON.stringify({status:'blocked',code:safeError(e)})+'\n');process.exitCode=1;});
