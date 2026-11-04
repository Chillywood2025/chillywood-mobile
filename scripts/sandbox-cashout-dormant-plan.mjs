#!/usr/bin/env node
// Offline preparation only. No credential access, network, SQL execution or deployment.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {collectSourceBundle,gitReader,sha256} from '../ops/creator-backend-rollout/prepare-edge.mjs';

export const PROJECT='bmkkhihfbmsnnmcqkoly';
export const VERSION='20261102194000';
export const NAME='sandbox_creator_cashout_execution';
export const MIGRATION=`supabase/migrations/${VERSION}_${NAME}.sql`;
export const MIGRATION_SHA256='a41152e19ab73a959a514a8495f5b00dc9c4ff50f436fb15e16c908ac2483e46';
export const TIP_VERSION='20261104032615';
export const TIP_NAME='native_tip_catalog_amount_policy';
export const TIP_PATH=`supabase/migrations/${TIP_VERSION}_${TIP_NAME}.sql`;
export const INGRESS_VERSION='20261103005000';
export const INGRESS_NAME='native_production_ingress_observations';
export const INGRESS_PATH=`supabase/migrations/${INGRESS_VERSION}_${INGRESS_NAME}.sql`;
const INGRESS_SHA256='f18382b2899ed69a3e422538f451f11f1519b53b1ce780d12221cbeb50a48efe';
const TIP_SHA256='f18d738818dcc68ab6ff61f737a4755be4dcc4fd02846249c01647c1f5d3fc2b';
const BASE_HISTORY_SHA256='8ef39413e785edf6381b2d52f4c427415a4528e15314e2419c19a4e181ba5310';
const CLEANUP_SHA256='7a8667ed05c5e4f5ef563570df16baecf14e01eb9a51e38d3caf7335729fcea3';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const literal=x=>`'${String(x).replaceAll("'","''")}'`;
const hashSQL=x=>`encode(sha256(convert_to(${x},'UTF8')),'hex')`;
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
export const ENDPOINTS=Object.freeze([
  {name:'sandbox-creator-cashout',verify_jwt:true},
  {name:'sandbox-creator-cashout-webhook',verify_jwt:false},
]);
export const DEPENDENCIES=Object.freeze([
  'auth.jwt','auth.sessions','auth.uid','auth.users','private.auction_platform_settlement_contracts',
  'private.commerce_tax_checkout_bindings','private.creator_event_auction_quotes','private.creator_event_auction_receipts',
  'private.creator_room_auction_quotes','private.creator_room_auction_receipts','private.guard_event_ticket_terms_immutable',
  'public.beta_access_memberships','public.calculate_creator_instant_cashout_fee','public.creator_payout_accounts',
  'public.is_account_access_restricted','public.merch_orders','public.monetization_product_store_mappings',
  'public.monetization_products','public.money_access_ledger_events','public.money_purchase_intents',
  'public.platform_money_kill_switches','public.platform_role_memberships','public.platform_subject_has_role_internal',
  'public.provider_events','public.resolve_sandbox_monetization_tester','public.revenuecat_consumable_transaction_intents',
  'public.sandbox_monetization_testers','public.stripe_merch_events','public.whole_app_exact_current_session_authority_internal',
]);

export function prepareDormantPlan({repo=ROOT,source}){
  requireThat(/^[a-f0-9]{40}$/u.test(source??''),'EXACT_SOURCE_REQUIRED');
  const read=gitReader(repo,source);
  const body=read(MIGRATION),tip=read(TIP_PATH),ingress=read(INGRESS_PATH);
  requireThat(typeof body==='string'&&sha256(body)===MIGRATION_SHA256,'SANDBOX_MIGRATION_BYTES_CHANGED');
  requireThat(typeof tip==='string'&&sha256(tip)===TIP_SHA256,'TIP_PREDECESSOR_BYTES_CHANGED');
  requireThat(typeof ingress==='string'&&sha256(ingress)===INGRESS_SHA256,'INGRESS_PREDECESSOR_BYTES_CHANGED');
  requireThat(sha256(read('supabase/functions/_shared/creator-cashout-execution.ts')??'')===CLEANUP_SHA256,'BOUNDED_CLEANUP_SOURCE_REQUIRED');
  const tables=[...body.matchAll(/create table (private\.\w+)\s*\(/gu)].map(m=>m[1]);
  const functions=[...body.matchAll(/create function ((?:private|public)\.\w+)\s*\(/gu)].map(m=>m[1]);
  requireThat(tables.length===11&&functions.length===21,'TARGET_INVENTORY_CHANGED');
  const endpoints=ENDPOINTS.map(({name,verify_jwt})=>{
    const entrypoint_path=`supabase/functions/${name}/index.ts`;
    const payload={project_id:PROJECT,name,verify_jwt,entrypoint_path,...collectSourceBundle(read,entrypoint_path)};
    return {payload,sha256:sha256(JSON.stringify(payload)),files:payload.files.map(f=>({path:f.name,sha256:sha256(f.content)}))};
  });
  const tree=execFileSync('git',['rev-parse',`${source}^{tree}`],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  return {
    kind:'offline-sandbox-cashout-dormant-preparation',schema:1,source,tree,project:PROJECT,
    productionExecuted:false,deployReady:false,activationIncluded:false,credentialsRead:false,
    migration:{version:VERSION,name:NAME,path:MIGRATION,sha256:MIGRATION_SHA256,statementsSha256:sha256(JSON.stringify([body])),body},
    tipPredecessor:{version:TIP_VERSION,name:TIP_NAME,sha256:TIP_SHA256,statementsSha256:sha256(JSON.stringify([tip]))},
    ingressPredecessor:{version:INGRESS_VERSION,name:INGRESS_NAME,sha256:INGRESS_SHA256,statementsSha256:sha256(JSON.stringify([ingress]))},
    baselineBeforeTip:{count:583,maximum:'20261101215711',sha256:BASE_HISTORY_SHA256},
    tables,functions,endpoints,
    requirement:'After exact tip then native ingress deployment, capture and independently review a fresh complete ledger/catalog/schema baseline. Source-qualify an identity-preserving atomic executor before applying this migration. This packet has no executor and cannot authorize deployment.',
  };
}

// One metadata-only SELECT. No secrets, credential values or private user rows.
// Existence by name is intentionally not promoted to complete schema compatibility.
export function preflightSQL(plan){
  requireThat(plan?.project===PROJECT&&plan.migration?.sha256===MIGRATION_SHA256,'PLAN_INVALID');
  const targets=[VERSION,TIP_VERSION,INGRESS_VERSION].map(literal).join(',');
  return `select jsonb_build_object(
 'database',current_database(),'projectExpected',${literal(PROJECT)},
 'historyCount',(select count(*) from supabase_migrations.schema_migrations),
 'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),
 'priorHistorySha256',(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]')")} from supabase_migrations.schema_migrations where version not in (${targets})),
 'targets',coalesce((select jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsSha256',${hashSQL('array_to_json(statements)::text')}) order by version) from supabase_migrations.schema_migrations where version in (${targets})),'[]'::jsonb),
 'sandboxObjectsAbsent',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname in (${plan.tables.map(literal).join(',')}))
 and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname in (${plan.functions.map(literal).join(',')}))
 and not exists(select 1 from pg_trigger where (tgrelid=to_regclass('public.money_access_ledger_events') and tgname='hold_sandbox_cashout_changed_source') or (tgrelid=to_regclass('public.merch_orders') and tgname='hold_sandbox_cashout_changed_merch')),
 'dependenciesPresent',(select bool_and(to_regclass(name) is not null or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=refs.name)) from (values ${DEPENDENCIES.map(x=>`(${literal(x)})`).join(',')}) refs(name)),
 'liveControlsOff',(select count(*)=3 and bool_and(state='off') from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled','cashout_enabled')),
 'sandboxGates',(select count(*)=3 and bool_and(state='sandbox_only') from public.platform_money_kill_switches where key in ('stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled')),
 'discoveryOn',(select count(*)=1 and bool_and(enabled and collecting and primary_delivery_enabled) from private.discovery_invalidation_worker_config),
 'preexistingCatalogSha256',(select ${hashSQL("coalesce(jsonb_agg(item order by item::text)::text,'[]')")} from (
  select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth') and p.prokind in ('f','p')
  union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and c.relkind in ('r','p','v','S')
  union all select jsonb_build_array('column',n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private','auth') and a.attnum>0 and not a.attisdropped
  union all select jsonb_build_array('trigger',tgrelid::regclass::text,tgname,pg_get_triggerdef(oid),tgenabled) from pg_trigger where not tgisinternal
  union all select jsonb_build_array('constraint',conrelid::regclass::text,conname,pg_get_constraintdef(oid),convalidated) from pg_constraint where conrelid<>0
  union all select jsonb_build_array('policy',to_jsonb(p)) from pg_policies p where schemaname in ('public','private','auth')
 ) catalog_items)) state;`;
}

export function assessPreflight(plan,state){
  requireThat(state?.database==='postgres'&&state.projectExpected===PROJECT&&Array.isArray(state.targets),'READBACK_INVALID');
  requireThat(state.liveControlsOff===true&&state.sandboxGates===true&&state.discoveryOn===true,'PRODUCTION_HOLDS_MISMATCH');
  requireThat(state.dependenciesPresent===true,'DEPENDENCY_MISSING');
  requireThat(state.priorHistorySha256===BASE_HISTORY_SHA256,'HISTORY_DRIFT_REQUIRES_REQUALIFICATION');
  requireThat(/^[a-f0-9]{64}$/u.test(state.preexistingCatalogSha256??''),'CATALOG_FINGERPRINT_REQUIRED');
  const sandbox=state.targets.find(t=>t.version===VERSION),tip=state.targets.find(t=>t.version===TIP_VERSION),ingress=state.targets.find(t=>t.version===INGRESS_VERSION);
  requireThat(state.targets.length===(sandbox?1:0)+(tip?1:0)+(ingress?1:0),'UNEXPECTED_HISTORY_TARGETS');
  if(sandbox)return {status:'existing_sandbox_requires_full_readback',deployReady:false};
  requireThat(state.sandboxObjectsAbsent===true,'PARTIAL_SANDBOX_OBJECTS');
  if(!tip){
    requireThat(!ingress,'PREDECESSOR_ORDER_REQUIRES_REQUALIFICATION');
    requireThat(state.historyCount===583&&state.historyMaximum==='20261101215711','HISTORY_DRIFT_REQUIRES_REQUALIFICATION');
    return {status:'blocked_until_exact_tip_deployment',deployReady:false};
  }
  requireThat(tip.name===TIP_NAME&&tip.statementsSha256===plan.tipPredecessor.statementsSha256,'TIP_IDENTITY_MISMATCH');
  if(!ingress){
    requireThat(state.historyCount===584&&state.historyMaximum===TIP_VERSION,'HISTORY_DRIFT_REQUIRES_REQUALIFICATION');
    return {status:'blocked_until_exact_native_ingress_deployment',deployReady:false};
  }
  requireThat(ingress.name===INGRESS_NAME&&ingress.statementsSha256===plan.ingressPredecessor.statementsSha256,'INGRESS_IDENTITY_MISMATCH');
  requireThat(state.historyCount===585&&state.historyMaximum===TIP_VERSION,'HISTORY_DRIFT_REQUIRES_REQUALIFICATION');
  return {status:'post_predecessors_snapshot_requires_independent_requalification',deployReady:false,catalogSha256:state.preexistingCatalogSha256};
}

function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){
    process.stdout.write('Usage: node scripts/sandbox-cashout-dormant-plan.mjs --source FULL_COMMIT_SHA --out NEW_DIRECTORY\nOffline only. Never deploys or reads credentials. No --apply, activation, baseline override or migration replay.\n');return;
  }
  requireThat(args.length===4&&args[0]==='--source'&&args[2]==='--out','ARGUMENT_INVALID');
  const plan=prepareDormantPlan({source:args[1]});
  // Never overwrite an earlier review/receipt. The caller must choose a new path.
  fs.mkdirSync(args[3]);
  const out=name=>path.join(args[3],name);
  fs.writeFileSync(out(`${VERSION}_${NAME}.sql`),plan.migration.body,{flag:'wx'});
  fs.writeFileSync(out('preflight.sql'),preflightSQL(plan),{flag:'wx'});
  for(const entry of plan.endpoints)fs.writeFileSync(out(`${entry.payload.name}.json`),JSON.stringify(entry.payload,null,2)+'\n',{flag:'wx'});
  const summary={...plan,migration:{...plan.migration,body:undefined},endpoints:plan.endpoints.map(({payload,...entry})=>({...entry,name:payload.name,verify_jwt:payload.verify_jwt}))};
  fs.writeFileSync(out('plan.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify({status:'prepared_not_deployable',source:plan.source,tree:plan.tree,version:VERSION,files:5})+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch{process.stderr.write('SANDBOX_DORMANT_PREPARATION_BLOCKED\n');process.exitCode=1;}
}
