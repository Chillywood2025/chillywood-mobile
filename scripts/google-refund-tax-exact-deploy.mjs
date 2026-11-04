#!/usr/bin/env node
// Source-only preparation: the committed qualification is pending. No Edge,
// provider, credential provisioning, activation, or migration-history repair.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {collectSourceBundle,gitReader,sha256} from '../ops/creator-backend-rollout/prepare-edge.mjs';
import {diagnosticManagementQuery,validateReadContext,HELPER_ERROR_CODES} from './live-room-exact-deploy.mjs';
import {holdsSQL as existingHoldsSQL} from './native-tip-exact-deploy.mjs';

export const PROJECT='bmkkhihfbmsnnmcqkoly';
export const VERSION='20261104120922';
export const NAME='google_refund_tax_history_checkpoints';
export const HASH='6929bccfbdb7f440afc3b8aa37ab1e9bc4001799e301f23840054eb3ef55a2c9';
export const MIGRATION=`supabase/migrations/${VERSION}_${NAME}.sql`;
export const TOOL='scripts/google-refund-tax-exact-deploy.mjs';
export const MANIFEST='scripts/google-refund-tax-deployment-manifest.json';
export const ORIGINAL_HISTORY=Object.freeze({count:583,maximum:'20261101215711',sha256:'8ef39413e785edf6381b2d52f4c427415a4528e15314e2419c19a4e181ba5310'});
export const PREDECESSORS=Object.freeze([
  {version:'20261104032615',name:'native_tip_catalog_amount_policy',sha256:'f18d738818dcc68ab6ff61f737a4755be4dcc4fd02846249c01647c1f5d3fc2b'},
  {version:'20261103005000',name:'native_production_ingress_observations',sha256:'f18382b2899ed69a3e422538f451f11f1519b53b1ce780d12221cbeb50a48efe'},
  {version:'20261102194000',name:'sandbox_creator_cashout_execution',sha256:'a41152e19ab73a959a514a8495f5b00dc9c4ff50f436fb15e16c908ac2483e46'},
]);
export const ENDPOINTS=Object.freeze([
  {name:'google-play-external-reporter',verifyJwt:false},
  {name:'stripe-merch-cost-reconcile',verifyJwt:true},
  {name:'stripe-auction-cost-reconcile',verifyJwt:true},
]);
export const ADDED_TABLES=Object.freeze(['private.google_refund_tax_history']);
export const ADDED_FUNCTIONS=Object.freeze(['private.lock_google_refund_tax_history_context(uuid)',
  'public.begin_google_refund_tax_history(uuid,text)','public.save_google_refund_tax_history(uuid,uuid,uuid,jsonb,jsonb)']);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const literal=s=>`'${String(s).replaceAll("'","''")}'`;
const hashSQL=s=>`encode(sha256(convert_to(${s},'UTF8')),'hex')`;
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
const isHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/u.test(s);
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
function requireJwt(config,name,expected){
  const sections=[...config.matchAll(/^\[functions\.([^\]]+)\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)].filter(m=>m[1]===name);
  requireThat(sections.length===1,'EDGE_JWT_MISMATCH');
  const values=[...sections[0][2].matchAll(/^\s*verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/gm)];
  requireThat(values.length===1&&values[0][1]===String(expected),'EDGE_JWT_MISMATCH');
}
const contextSQL=`jsonb_build_object('currentPostgres',current_user='postgres','currentReadOnly',current_user='supabase_read_only_user','sessionPostgres',session_user='postgres','sessionReadOnly',session_user='supabase_read_only_user','sessionAdmin',session_user='supabase_admin','transactionReadOnly',current_setting('transaction_read_only')='on')`;
const targetVersions=[...PREDECESSORS.map(p=>p.version),VERSION].map(literal).join(',');
const functionOids=ADDED_FUNCTIONS.map(f=>`coalesce(to_regprocedure(${literal(f)}),0)`).join(',');
const relationOids=ADDED_TABLES.map(t=>`coalesce(to_regclass(${literal(t)}),0)`).join(',');
const scope=`n.nspname in ('public','private','auth')`;

// The defined existing catalog contract is immutable across this additive migration. There
// are no masked function bodies and no expectation generated from live drift.
export function catalogHashSQL(added=false){
  const fn=added?`p.oid in (${functionOids})`:`${scope} and p.oid not in (${functionOids})`;
  const rel=added?`c.oid in (${relationOids})`:`${scope} and c.oid not in (${relationOids})`;
  const rows=[
    `select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and ${fn}`,
    `select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relpersistence,c.relreplident,case when c.relkind in ('v','m') then pg_get_viewdef(c.oid) else null end) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','S','f') and ${rel}`,
    `select jsonb_build_array('column',n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated,a.attcollation::regcollation::text) from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relkind in ('r','p','v','m','S','f') and a.attnum>0 and not a.attisdropped and ${rel}`,
    `select jsonb_build_array('constraint',n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where ${rel}`,
    `select jsonb_build_array('index',n.nspname,c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where ${rel}`,
    `select jsonb_build_array('trigger',n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and ${rel}`,
    `select jsonb_build_array('policy',n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,(select array_agg(r::regrole::text order by r::regrole::text) from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where ${rel}`,
  ];
  if(!added)rows.push(
    `select jsonb_build_array('schema',nspname,nspowner::regrole::text,nspacl::text) from pg_namespace where nspname in ('public','private','auth')`,
    `select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolcanlogin,rolconnlimit,rolvaliduntil) from pg_roles`,
    `select jsonb_build_array('membership',roleid::regrole::text,member::regrole::text,admin_option,inherit_option,set_option) from pg_auth_members`,
    `select jsonb_build_array('event_trigger',evtname,evtevent,evtowner::regrole::text,evtfoid::regprocedure::text,evtenabled,evttags) from pg_event_trigger`,
    `select jsonb_build_array('default_acl',d.defaclrole::regrole::text,n.nspname,d.defaclobjtype,d.defaclacl::text) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or ${scope}`);
  return `(select ${hashSQL("coalesce(jsonb_agg(item order by item::text)::text,'[]')")} from (${rows.join('\nunion all\n')}) catalog_items)`;
}
export const invariantsHashSQL=catalogHashSQL();
export const addedCatalogHashSQL=catalogHashSQL(true);
export const SANDBOX_TABLES=Object.freeze(['control','qualifications','revocations','executions','recovery_authorities','recovery_revocations','allocations','observations','simulated_return_accounting','merch_allocations','merch_simulated_returns'].map(n=>`private.sandbox_cashout_${n}`));
export const DATA_TABLES=Object.freeze([
  'public.platform_money_kill_switches','private.creator_clip_export_worker','private.deleted_content_retention_settings','private.discovery_invalidation_worker_config',
  'public.monetization_products','public.monetization_product_store_mappings','public.creator_tip_settings',
  'private.google_play_external_program_config','private.google_play_external_capability_program_bindings','private.google_play_external_transactions','private.google_play_external_report_outbox',
  'private.google_play_external_launch_bindings','private.google_play_external_admissions','private.google_play_external_report_events',
  'private.creator_external_payment_capabilities','private.stripe_refund_tax_evidence','public.creator_tip_transactions',
  'private.creator_event_auction_quotes','private.creator_event_auction_receipts','private.creator_room_auction_quotes','private.creator_room_auction_receipts','private.auction_platform_settlement_contracts',
  'public.merch_orders','public.money_access_ledger_events','public.money_purchase_intents',
  'private.native_production_ingress_qualifications','private.native_production_ingress_revocations','private.native_production_ingress_observations',...SANDBOX_TABLES,
].sort());
export const dataHashSQL=`(select ${hashSQL("coalesce(jsonb_agg(item order by item::text)::text,'[]')")} from (${DATA_TABLES.map(t=>`select jsonb_build_array(${literal(t)},to_jsonb(t)) item from ${t} t`).join('\nunion all\n')}) guarded_data)`;
export const holdsSQL=`(${existingHoldsSQL}) and (select count(*)=1 and bool_and(enabled and collecting and primary_delivery_enabled) from private.discovery_invalidation_worker_config)
 and (select count(*)=1 and bool_and(not enabled) from private.sandbox_cashout_control)
 and ${SANDBOX_TABLES.slice(1).map(t=>`not exists(select 1 from ${t})`).join(' and ')}
 and not exists(select 1 from private.google_play_external_program_config)
 and not exists(select 1 from private.native_production_ingress_qualifications)
 and not exists(select 1 from private.native_production_ingress_revocations)`;
export const CLOSURE=Object.freeze([TOOL,MANIFEST,MIGRATION,'supabase/config.toml',
  'ops/creator-backend-rollout/prepare-edge.mjs','scripts/live-room-exact-deploy.mjs','scripts/studio-rolling-deploy.mjs','scripts/native-tip-exact-deploy.mjs',
  'scripts/native-tip-deployment-manifest.json','scripts/native-ingress-deployment-manifest.json',
  ...PREDECESSORS.map(p=>`supabase/migrations/${p.version}_${p.name}.sql`)]);

export function loadBundle(root=ROOT,source){
  const read=source?gitReader(root,source):p=>fs.existsSync(path.join(root,p))?fs.readFileSync(path.join(root,p),'utf8'):null;
  const manifest=JSON.parse(read(MANIFEST)),body=read(MIGRATION);
  requireThat(manifest.schema===1&&manifest.project===PROJECT&&manifest.migration?.version===VERSION&&manifest.migration.name===NAME&&manifest.migration.sha256===HASH,'MANIFEST_INVALID');
  requireThat(sha256(body)===HASH,'MIGRATION_HASH_MISMATCH');
  requireThat(JSON.stringify(manifest.originalHistory)===JSON.stringify(ORIGINAL_HISTORY)&&isHash(manifest.addedCatalogSha256),'MANIFEST_INVALID');
  const predecessors=PREDECESSORS.map(p=>{const body=read(`supabase/migrations/${p.version}_${p.name}.sql`);requireThat(sha256(body)===p.sha256,'PREDECESSOR_SOURCE_CHANGED');return {...p,statementsSha256:sha256(JSON.stringify([body]))};});
  const edge=ENDPOINTS.map(e=>{
    const entrypoint=`supabase/functions/${e.name}/index.ts`,bundle=collectSourceBundle(read,entrypoint);
    const files=bundle.files.map(f=>({path:f.name,sha256:sha256(f.content)}));
    const expected=manifest.edge?.find(x=>x.name===e.name);
    requireThat(expected?.verifyJwt===e.verifyJwt&&JSON.stringify(expected.files)===JSON.stringify(files),'EDGE_HASH_MISMATCH');
    requireJwt(read('supabase/config.toml'),e.name,e.verifyJwt);
    return {...e,files};
  });
  requireThat(manifest.edge.length===ENDPOINTS.length,'EDGE_HASH_MISMATCH');
  const ingressManifest=JSON.parse(read('scripts/native-ingress-deployment-manifest.json'));
  const expected=ingressManifest.edge;
  const revenuecatFiles=collectSourceBundle(read,'supabase/functions/revenuecat-webhook/index.ts').files.map(f=>({path:f.name,sha256:sha256(f.content)}));
  const sorted=files=>[...files].sort((a,b)=>a.path.localeCompare(b.path));
  requireThat(expected?.name==='revenuecat-webhook'&&expected.verifyJwt===false&&expected.files?.length===7
    &&JSON.stringify(sorted(expected.files))===JSON.stringify(sorted(revenuecatFiles)),'PREDECESSOR_EDGE_SOURCE_CHANGED');
  requireJwt(read('supabase/config.toml'),'revenuecat-webhook',false);
  return {manifest,body,predecessors,edge,revenuecatExpected:ingressManifest.edge,statementsSha256:sha256(JSON.stringify([body]))};
}
export function sourceBinding(root,source){
  requireThat(/^[a-f0-9]{40}$/u.test(source??''),'EXACT_SOURCE_REQUIRED');
  requireThat(git(root,'rev-parse','HEAD').trim()===source,'SOURCE_HEAD_MISMATCH');
  requireThat(git(root,'status','--porcelain','--untracked-files=no').trim()==='','TRACKED_SOURCE_DIRTY');
  const bundle=loadBundle(root,source);
  for(const file of new Set([...CLOSURE,...bundle.edge.flatMap(e=>e.files.map(f=>f.path)),...bundle.revenuecatExpected.files.map(f=>f.path)])){
    requireThat(git(root,'ls-files','--error-unmatch',file).trim()===file,'TOOL_NOT_COMMITTED');
    requireThat(fs.readFileSync(path.join(root,file),'utf8')===git(root,'show',`${source}:${file}`),'SOURCE_BYTES_CHANGED');
  }
  return {source,tree:git(root,'rev-parse','HEAD^{tree}').trim()};
}
export function requireQualified(bundle){
  const b=bundle.manifest.postPredecessorBaseline;
  requireThat(bundle.manifest.qualification==='independently_reviewed_post_predecessors'&&b,'POST_PREDECESSOR_REQUALIFICATION_REQUIRED');
  requireThat(b.historyCount===bundle.manifest.originalHistory.count+3&&b.historyMaximum===PREDECESSORS[0].version&&isHash(b.historySha256)&&isHash(b.catalogSha256)&&isHash(b.dataSha256)
    &&Number.isFinite(Date.parse(b.observedAt))&&b.revenuecat?.project===PROJECT&&b.revenuecat.status==='ACTIVE'&&b.revenuecat.name==='revenuecat-webhook'&&Number.isSafeInteger(b.revenuecat.version)&&b.revenuecat.version>0
    &&b.revenuecat.verifyJwt===false&&JSON.stringify(b.revenuecat.files)===JSON.stringify(bundle.revenuecatExpected.files),'QUALIFIED_BASELINE_INVALID');
  return b;
}
const originalHistorySQL=`(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]')")} from supabase_migrations.schema_migrations where version not in (${targetVersions}))`;
const priorHistorySQL=`(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]')")} from supabase_migrations.schema_migrations where version<>${literal(VERSION)})`;
const targetsSQL=`coalesce((select jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsSha256',${hashSQL('array_to_json(statements)::text')}) order by version) from supabase_migrations.schema_migrations where version in (${targetVersions})),'[]'::jsonb)`;
const absentSQL=`to_regclass('private.google_refund_tax_history') is null and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname,p.proname) in (('private','lock_google_refund_tax_history_context'),('public','begin_google_refund_tax_history'),('public','save_google_refund_tax_history')))`;
export function probeSql(){return `set local search_path=pg_catalog,public; select jsonb_build_object('database',current_database(),'context',${contextSQL},'originalHistorySha256',${originalHistorySQL},'historyCount',(select count(*) from supabase_migrations.schema_migrations),'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),'targets',${targetsSQL},'addedAbsent',(${absentSQL})) state;`;}
export function classifyProbe(bundle,state){
  validateReadContext(state?.context);
  const original=bundle.manifest.originalHistory;
  requireThat(state.database==='postgres'&&Array.isArray(state.targets)&&state.originalHistorySha256===original.sha256,'HISTORY_INVENTORY_MISMATCH');
  let seen=0;for(const p of bundle.predecessors){const row=state.targets.find(r=>r.version===p.version);if(!row)break;requireThat(row.name===p.name&&row.statementsSha256===p.statementsSha256,'PREDECESSOR_IDENTITY_MISMATCH');seen++;}
  const refund=state.targets.find(r=>r.version===VERSION);
  requireThat(state.targets.length===seen+(refund?1:0)&&(!refund||seen===3),'PREDECESSOR_ORDER_REQUIRES_REQUALIFICATION');
  requireThat(state.historyCount===original.count+state.targets.length&&state.historyMaximum===(refund?VERSION:seen?PREDECESSORS[0].version:original.maximum),'HISTORY_INVENTORY_MISMATCH');
  if(refund)requireThat(refund.name===NAME&&refund.statementsSha256===bundle.statementsSha256,'REFUND_IDENTITY_MISMATCH');
  else requireThat(state.addedAbsent===true,'PARTIAL_REFUND_OBJECTS');
  return refund?'applied_requires_full_readback':seen===3?'post_predecessors_require_independent_requalification':`blocked_until_${['tip','native_ingress','sandbox'][seen]}`;
}
export function readbackSql(){return `set local search_path=pg_catalog,public; select jsonb_build_object('database',current_database(),'context',${contextSQL},'originalHistorySha256',${originalHistorySQL},'priorHistorySha256',${priorHistorySQL},'historyCount',(select count(*) from supabase_migrations.schema_migrations),'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),'targets',${targetsSQL},'addedAbsent',(${absentSQL}),'catalogSha256',${invariantsHashSQL},'dataSha256',${dataHashSQL},'holds',coalesce((${holdsSQL}),false),'addedCatalogSha256',${addedCatalogHashSQL}) state;`;}
export function classifyState(bundle,state){
  const b=requireQualified(bundle),phase=classifyProbe(bundle,state);
  requireThat(['post_predecessors_require_independent_requalification','applied_requires_full_readback'].includes(phase),'EXACT_PREDECESSORS_REQUIRED');
  requireThat(state.priorHistorySha256===b.historySha256&&state.catalogSha256===b.catalogSha256&&state.dataSha256===b.dataSha256,'BASELINE_CONTRACT_MISMATCH');
  requireThat(state.holds===true,'PRODUCTION_HOLDS_MISMATCH');
  if(phase==='applied_requires_full_readback'){requireThat(state.addedCatalogSha256===bundle.manifest.addedCatalogSha256,'FINAL_CATALOG_MISMATCH');return 'applied';}
  return 'ready';
}
export function buildApplySql(bundle,state){
  const b=requireQualified(bundle);requireThat(classifyState(bundle,state)==='ready','APPLY_REQUIRES_ABSENT_TARGETS');
  const exact=`${originalHistorySQL}=${literal(bundle.manifest.originalHistory.sha256)} and ${priorHistorySQL}=${literal(b.historySha256)} and ${invariantsHashSQL}=${literal(b.catalogSha256)} and ${dataHashSQL}=${literal(b.dataSha256)} and (${holdsSQL})`;
  return `begin;
set local search_path=pg_catalog,public;
set local standard_conforming_strings=on;
set local lock_timeout='5s';
set local statement_timeout='45s';
set local idle_in_transaction_session_timeout='60s';
do $refund_apply$ begin
 if current_user<>'postgres' or current_setting('transaction_read_only')<>'off' then raise exception 'refund_deploy_write_authority_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('chillywood-google-refund-tax-exact-deployment',0));
 lock table supabase_migrations.schema_migrations,${DATA_TABLES.join(',')} in share row exclusive mode;
 if (${exact} and (select count(*)=${b.historyCount} from supabase_migrations.schema_migrations) and (${absentSQL})) is not true then raise exception 'refund_deploy_baseline_changed'; end if;
 execute ${literal(bundle.body)};
 insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(VERSION)},${literal(NAME)},array[${literal(bundle.body)}]::text[]);
 if (${exact} and (select count(*)=${b.historyCount+1} from supabase_migrations.schema_migrations)
 and exists(select 1 from supabase_migrations.schema_migrations where version=${literal(VERSION)} and name=${literal(NAME)} and ${hashSQL('array_to_json(statements)::text')}=${literal(bundle.statementsSha256)})
 and ${addedCatalogHashSQL}=${literal(bundle.manifest.addedCatalogSha256)} and not exists(select 1 from private.google_refund_tax_history)) is not true then raise exception 'refund_deploy_postcheck_failed'; end if;
end $refund_apply$;
notify pgrst,'reload schema';
commit;`;
}
// The SQL-only Management transport cannot verify an Edge prerequisite. A future
// reviewed caller must supply a current, exact readback, not a boolean assertion.
export async function deploy({bundle,apply=false,query,recheckSource,verifyPrerequisiteEdge}){
  if(apply)requireQualified(bundle); // Before network/credential-dependent work.
  const probe=await query(probeSql(),true),phase=classifyProbe(bundle,probe);
  if(!bundle.manifest.postPredecessorBaseline)return {status:phase,deployReady:false,wrote:false,probe};
  const before=await query(readbackSql(),true),mode=classifyState(bundle,before);
  if(!apply||mode==='applied')return {status:mode==='applied'?'already_applied_verified':'plan_ready',deployReady:false,wrote:false,before};
  requireThat(typeof recheckSource==='function','CURRENT_SOURCE_RECHECK_REQUIRED');
  requireThat(typeof verifyPrerequisiteEdge==='function','CURRENT_PREDECESSOR_EDGE_READBACK_REQUIRED');
  const edge=await verifyPrerequisiteEdge();
  requireThat(JSON.stringify(edge)===JSON.stringify(requireQualified(bundle).revenuecat),'CURRENT_PREDECESSOR_EDGE_READBACK_MISMATCH');
  await recheckSource();let responseConfirmed=false;
  try{await query(buildApplySql(bundle,before),false);responseConfirmed=true;}catch{/* Never retry a possibly committed write. */}
  try{const after=await query(readbackSql(),true);if(classifyState(bundle,after)==='applied')return {status:'applied_verified',wrote:true,responseConfirmed,after};}catch{/* No private payloads in output. */}
  return {status:'apply_unconfirmed',wrote:true,responseConfirmed};
}
export const safeError=e=>HELPER_ERROR_CODES.includes(e?.message)||['POST_PREDECESSOR_REQUALIFICATION_REQUIRED','CURRENT_PREDECESSOR_EDGE_READBACK_REQUIRED'].includes(e?.message)?e.message:'GOOGLE_REFUND_DEPLOY_BLOCKED';
async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){process.stdout.write('Usage: node scripts/google-refund-tax-exact-deploy.mjs --source FULL_COMMIT_SHA [--apply]\nPreparation only. Pending qualification rejects --apply before credentials/network. Current CLI has no verified predecessor Edge transport and cannot apply even after baseline qualification. No baseline overrides, activation, Edge deployments or write retries.\n');return;}
  requireThat(args.filter(x=>x==='--source').length===1,'EXACT_SOURCE_REQUIRED');
  const i=args.indexOf('--source'),source=args[i+1],rest=args.filter((_,j)=>j!==i&&j!==i+1);
  requireThat(rest.length===0||(rest.length===1&&rest[0]==='--apply'),'ARGUMENT_INVALID');
  const binding=sourceBinding(ROOT,source),bundle=loadBundle(ROOT,source),apply=rest.includes('--apply');
  if(apply){requireQualified(bundle);throw Error('CURRENT_PREDECESSOR_EDGE_READBACK_REQUIRED');}
  const result=await deploy({bundle,query:diagnosticManagementQuery(process.env.SUPABASE_ACCESS_TOKEN)});
  process.stdout.write(JSON.stringify({project:PROJECT,...binding,version:VERSION,sha256:HASH,status:result.status,deployReady:false,wrote:false})+'\n');
  if(result.status!=='already_applied_verified')process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{process.stderr.write(`${safeError(e)}\n`);process.exitCode=1;});
}
