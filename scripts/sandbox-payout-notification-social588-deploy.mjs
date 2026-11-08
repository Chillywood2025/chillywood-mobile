#!/usr/bin/env node
// Social588 successor of the legacy586 exact observer runner. The immutable
// observer migration and old baseline hashes are preserved, not recaptured.
// Offline by default; --check is read-only.
// --apply requires separate action-specific authorization. Never retries a write.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {sha256, diagnosticManagementQuery, validateReadContext, HELPER_ERROR_CODES, redundantNotNull} from './live-room-exact-deploy.mjs';
import {catalogSQL as socialCatalogSQL, loadBundle as loadSocialBundle, MIGRATIONS as SOCIAL_MIGRATIONS, FUNCTIONS as SOCIAL_FUNCTIONS, TRIGGERS as SOCIAL_TRIGGERS, CLOSURE as SOCIAL_CLOSURE} from './social-engagement-exact-deploy.mjs';
import {loadBundle as loadLegacyBundle, CLOSURE as LEGACY_CLOSURE} from './sandbox-payout-notification-exact-deploy.mjs';

export const PROJECT='bmkkhihfbmsnnmcqkoly';
export const VERSION='20261105010859';
export const NAME='sandbox_cashout_status_notifications';
export const HASH='032e549b053e368eef177e23579cd2f6a6db6bce34a908b68ba6ac82b4edb0dc';
export const MIGRATION=`supabase/migrations/${VERSION}_${NAME}.sql`;
export const TOOL='scripts/sandbox-payout-notification-social588-deploy.mjs';
export const MANIFEST='scripts/sandbox-payout-notification-social588-manifest.json';
export const EXECUTION_CONTRACT=Object.freeze({applicationAndHistoryLocks:26,cron:'observed_not_locked',independentCronEditsExcluded:false,freshDeploymentApprovalRequired:true});
const CONTRACT='scripts/sandbox-payout-notification-contract';
export const CLOSURE=Object.freeze([...new Set([TOOL,MANIFEST,MIGRATION,`${CONTRACT}/catalog.sql`,`${CONTRACT}/readiness.sql`,`${CONTRACT}/before.json`,`${CONTRACT}/after.json`,...SOCIAL_CLOSURE,...LEGACY_CLOSURE])]);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
const literal=x=>`'${String(x).replaceAll("'","''")}'`;
const hashSQL=x=>`encode(sha256(convert_to(${x},'UTF8')),'hex')`;
const digest=sql=>`(select ${hashSQL("coalesce(jsonb_agg(item order by item::text collate \"C\")::text,'[]')")} from (${sql}) items)`;
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const changedFunctions=`(n.nspname||'.'||p.proname in ('private.sandbox_cashout_notification_state','private.enqueue_sandbox_cashout_notification','private.resolve_account_notification_activity','private.resolve_account_notification_before_sandbox_cashout','public.reserve_notification_activity_push','public.reserve_notification_activity_push_before_sandbox_cashout'))`;
const list=xs=>xs.map(literal).join(',');
const socialFunction=`(n.nspname='public' and p.proname in (${list(SOCIAL_FUNCTIONS)}))`;
// Only additive objects owned by the two exact social migrations are projected
// out of the legacy586 hash. Their independent complete target catalog and FK
// trigger contract must match before and after the observer operation.
const socialForeignKey=`exists(select 1 from pg_constraint fk join pg_namespace fn on fn.oid=fk.connamespace where fk.oid=t.tgconstraint and fk.contype='f' and fn.nspname in ('video_engagement_private','comment_likes_private'))`;
const socialTrigger=`((not t.tgisinternal and n.nspname in ('public','auth') and t.tgname in (${list(SOCIAL_TRIGGERS)})) or (t.tgisinternal and ${socialForeignKey}))`;
// Preserve every other application/auth catalog contract, including raw ACLs,
// views, role memberships and PG18 non-redundant NOT NULL constraints.
const legacyProjectionSQL=digest(`
 select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth','supabase_migrations') and p.prokind in ('f','p') and not ${changedFunctions}
 union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relpersistence,c.relreplident,c.relispartition,pg_get_expr(c.relpartbound,c.oid),case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) else null end) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','supabase_migrations') and c.relkind in ('r','p','v','m','S')
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private','auth','supabase_migrations') and a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m','S')
 union all select jsonb_build_array('constraint',co.conrelid::regclass::text,co.conname,pg_get_constraintdef(co.oid),co.convalidated) from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname in ('public','private','auth','supabase_migrations') and co.conrelid<>0 and not (co.conrelid='public.notifications'::regclass and co.conname='notifications_notification_type_check') and not ${redundantNotNull('co')}
 union all select jsonb_build_array('index',i.indrelid::regclass::text,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','supabase_migrations')
 union all select jsonb_build_array('policy',p.polrelid::regclass::text,p.polname,p.polcmd,p.polpermissive,(select array_agg(r::regrole::text order by r::regrole::text) from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','supabase_migrations')
 union all select jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','supabase_migrations') and not (t.tgrelid='private.sandbox_cashout_executions'::regclass and t.tgname='sandbox_cashout_status_notification')
 union all select jsonb_build_array('schema',nspname,nspowner::regrole::text,nspacl::text) from pg_namespace where nspname in ('public','private','auth','supabase_migrations')
 union all select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolbypassrls) from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
 union all select jsonb_build_array('membership',roleid::regrole::text,member::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) from pg_auth_members`);
function replaceExactly(sql,from,to){requireThat(sql.split(from).length===2,'SUCCESSOR_PROJECTION_INVALID');return sql.replace(from,()=>to);}
export const invariantsSQL=replaceExactly(replaceExactly(legacyProjectionSQL,
 `and not ${changedFunctions}`,`and not ${changedFunctions} and not ${socialFunction}`),
 "and not (t.tgrelid='private.sandbox_cashout_executions'::regclass and t.tgname='sandbox_cashout_status_notification')",
 `and not (t.tgrelid='private.sandbox_cashout_executions'::regclass and t.tgname='sandbox_cashout_status_notification') and not ${socialTrigger}`);
// pg-generated RI trigger names contain OIDs. Compare exact semantic fields,
// constraint identity and both sides instead; do not ignore disabled RI hooks.
export const socialForeignKeysSQL=`(select coalesce(jsonb_agg(jsonb_build_array(n.nspname||'.'||child.relname,fk.conname,tn.nspname||'.'||target.relname,p.proname,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred,t.tgnargs,encode(t.tgargs,'hex'),t.tgattr::text,pg_get_expr(t.tgqual,t.tgrelid)) order by (n.nspname||'.'||child.relname) collate "C",fk.conname collate "C",(tn.nspname||'.'||target.relname) collate "C",p.proname collate "C"),'[]'::jsonb) from pg_trigger t join pg_constraint fk on fk.oid=t.tgconstraint join pg_namespace n on n.oid=fk.connamespace join pg_class child on child.oid=fk.conrelid join pg_class target on target.oid=t.tgrelid join pg_namespace tn on tn.oid=target.relnamespace join pg_proc p on p.oid=t.tgfoid where t.tgisinternal and fk.contype='f' and n.nspname in ('video_engagement_private','comment_likes_private') and p.pronamespace='pg_catalog'::regnamespace)`;
export const socialHistorySQL=`(select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsSHA256',${hashSQL('array_to_json(statements)::text')}) order by version),'[]'::jsonb) from supabase_migrations.schema_migrations where version in (${list(SOCIAL_MIGRATIONS.map(x=>x.version))}))`;
export function expectedSocialForeignKeys(){
 const keys=[['video_engagement_private.likes','video_id','public.videos'],['video_engagement_private.likes','user_id','auth.users'],
 ['video_engagement_private.reposts','video_id','public.videos'],['video_engagement_private.reposts','user_id','auth.users'],
 ['video_engagement_private.counts','video_id','public.videos'],['video_engagement_private.write_limits','user_id','auth.users'],
 ['comment_likes_private.likes','user_id','auth.users'],['comment_likes_private.limits','user_id','auth.users']];
 const rows=keys.flatMap(([child,column,parent])=>[
  [child,`${child.split('.')[1]}_${column}_fkey`,parent,'RI_FKey_cascade_del',9,'O',false,false,0,'','',null],
  [child,`${child.split('.')[1]}_${column}_fkey`,parent,'RI_FKey_noaction_upd',17,'O',false,false,0,'','',null],
  [child,`${child.split('.')[1]}_${column}_fkey`,child,'RI_FKey_check_ins',5,'O',false,false,0,'','',null],
  [child,`${child.split('.')[1]}_${column}_fkey`,child,'RI_FKey_check_upd',17,'O',false,false,0,'','',null],
 ]);
 return rows.sort((a,b)=>{for(let i=0;i<4;i++){if(a[i]<b[i])return -1;if(a[i]>b[i])return 1;}return 0;});
}
const contextSQL=`jsonb_build_object('currentPostgres',current_user='postgres','currentReadOnly',current_user='supabase_read_only_user','sessionPostgres',session_user='postgres','sessionReadOnly',session_user='supabase_read_only_user','sessionAdmin',session_user='supabase_admin','transactionReadOnly',current_setting('transaction_read_only')='on')`;
// DDL can invoke event hooks outside application schemas. Bind their executable
// definitions and activation metadata without disabling any existing hook.
export const hooksSQL=digest(`select jsonb_build_array(e.evtname,e.evtevent,e.evtenabled,e.evttags,e.evtowner::regrole::text,n.nspname,p.proname,pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid join pg_namespace n on n.oid=p.pronamespace`);
export function sourceBinding(root,source){
 requireThat(/^[a-f0-9]{40}$/u.test(source??''),'EXACT_SOURCE_REQUIRED');
 requireThat(git(root,'rev-parse','HEAD').trim()===source,'SOURCE_HEAD_MISMATCH');
 requireThat(git(root,'status','--porcelain','--untracked-files=no').trim()==='','TRACKED_SOURCE_DIRTY');
 for(const file of CLOSURE){
  requireThat(git(root,'ls-files','--error-unmatch',file).trim()===file,'TOOL_NOT_COMMITTED');
  requireThat(!fs.lstatSync(path.join(root,file)).isSymbolicLink(),'SOURCE_BYTES_CHANGED');
  requireThat(fs.readFileSync(path.join(root,file),'utf8')===git(root,'show',`${source}:${file}`),'SOURCE_BYTES_CHANGED');
 }
 return {source,tree:git(root,'rev-parse','HEAD^{tree}').trim()};
}
export function loadBundle(root=ROOT,source){
 const read=file=>source?git(root,'show',`${source}:${file}`):fs.readFileSync(path.join(root,file),'utf8');
 const manifest=JSON.parse(read(MANIFEST)),body=read(MIGRATION);
 const legacy=loadLegacyBundle(root,source);
 requireThat(['baselineHistory','baselineInvariantsSha256','baselineHooksSha256','baseline','migration'].every(k=>isDeepStrictEqual(manifest[k],legacy.manifest[k])),'LEGACY_BASELINE_CHANGED');
 requireThat(manifest.schema===2&&manifest.project===PROJECT&&manifest.migration.version===VERSION&&manifest.migration.name===NAME&&manifest.migration.sha256===HASH,'MANIFEST_INVALID');
 requireThat(sha256(body)===HASH,'MIGRATION_HASH_MISMATCH');
 requireThat(manifest.migration.path===MIGRATION&&manifest.migration.statementsSHA256===sha256(JSON.stringify([body])),'MANIFEST_INVALID');
 requireThat(manifest.baselineHistory.count===586&&manifest.baselineHistory.sha256==='f50756dbebc7d524e019607aa6ac59912fb619778275e1c9486f14200cea3af5','BASELINE_HISTORY_INVENTORY_INVALID');
 requireThat([manifest.baselineInvariantsSha256,manifest.baselineHooksSha256].every(x=>/^[a-f0-9]{64}$/u.test(x??'')),'SCHEMA_CONTRACTS_REQUIRED');
 const beforeCatalog=JSON.parse(read(`${CONTRACT}/before.json`)),afterCatalog=JSON.parse(read(`${CONTRACT}/after.json`));
 requireThat(beforeCatalog.functions.length===92&&afterCatalog.functions.length===96&&isDeepStrictEqual(beforeCatalog.tables,afterCatalog.tables),'MANIFEST_INVALID');
 const social=loadSocialBundle(root,source);
 requireThat(manifest.socialCatalogSha256===social.manifest.targetCatalogSha256,'SOCIAL_CONTRACT_INVALID');
 const socialHistory=social.migrations.map(x=>({version:x.version,name:x.name,statementsSHA256:x.statementsSha256}));
 const readiness=read(`${CONTRACT}/readiness.sql`).replace(/^begin transaction read only;\s*set local search_path=pg_catalog,public;\s*/u,'').replace(/;\s*rollback;\s*$/u,'');
 const readinessQuery=replaceExactly(readiness,`where version<>'${VERSION}'`,`where version not in (${list([VERSION,...SOCIAL_MIGRATIONS.map(x=>x.version)])})`);
 return {manifest,body,beforeCatalog,afterCatalog,socialHistory,catalogQuery:read(`${CONTRACT}/catalog.sql`).trim().replace(/;$/u,''),readinessQuery,statementsSha256:sha256(JSON.stringify([body]))};
}
export const lockTables=bundle=>[...guardedTables(bundle).filter(t=>t!=='cron.job'),'supabase_migrations.schema_migrations'].sort();
// PostgreSQL 17/18 accepts MAINTAIN or table UPDATE/DELETE/TRUNCATE for
// SHARE ROW EXCLUSIVE. SELECT alone cannot acquire this lock. Inspect the
// intended writer's privileges while retaining the read-only management role.
export const writeCapabilitiesSQL=bundle=>`(select jsonb_agg(jsonb_build_object('table',name,'canLock',coalesce(has_schema_privilege('postgres',split_part(name,'.',1),'USAGE') and has_table_privilege('postgres',to_regclass(name),'UPDATE,DELETE,TRUNCATE,MAINTAIN'),false)) order by name collate "C") from (values ${lockTables(bundle).map(t=>`(${literal(t)})`).join(',')}) targets(name))`;
export const cronReadCapabilitySQL=`coalesce(has_schema_privilege('postgres','cron','USAGE') and has_table_privilege('postgres',to_regclass('cron.job'),'SELECT'),false)`;
export function readbackSql(bundle){return `set local search_path=pg_catalog,public;select r.state||jsonb_build_object('context',${contextSQL},'catalog',c.contracts,'invariantsSha256',${invariantsSQL},'hooksSha256',${hooksSQL},'socialCatalogSha256',${socialCatalogSQL(true)},'socialForeignKeys',${socialForeignKeysSQL},'socialHistory',${socialHistorySQL},'writeCapabilities',${writeCapabilitiesSQL(bundle)},'cronReadCapability',${cronReadCapabilitySQL}) state from (${bundle.readinessQuery}) r cross join (${bundle.catalogQuery}) c;`;}
export function requireWriteCapabilities(bundle,state){
 const capabilities=state?.writeCapabilities,expected=lockTables(bundle);
 requireThat(Array.isArray(capabilities)&&capabilities.length===expected.length&&capabilities.every((c,i)=>c&&Object.keys(c).sort().join(',')==='canLock,table'&&c.table===expected[i]&&typeof c.canLock==='boolean'),'WRITE_CAPABILITY_READBACK_INVALID');
 requireThat(state.cronReadCapability===true,'CRON_JOB_READ_CAPABILITY_REQUIRED');
 requireThat(capabilities.every(c=>c.canLock),'WRITE_LOCK_CAPABILITY_REQUIRED');
}
const baselineKeys=bundle=>Object.keys(bundle.manifest.baseline);
export function classifyState(bundle,state){
 validateReadContext(state?.context);
 requireThat(state&&Array.isArray(state.observerHistory)&&/^[a-f0-9]{64}$/u.test(state.invariantsSha256??''),'READBACK_INVALID');
 requireThat(state.invariantsSha256===bundle.manifest.baselineInvariantsSha256,'BASELINE_CONTRACT_MISMATCH');
 requireThat(state.hooksSha256===bundle.manifest.baselineHooksSha256,'BASELINE_CONTRACT_MISMATCH');
 requireThat(state.socialCatalogSha256===bundle.manifest.socialCatalogSha256&&isDeepStrictEqual(state.socialHistory,bundle.socialHistory)&&isDeepStrictEqual(state.socialForeignKeys,expectedSocialForeignKeys()),'SOCIAL_CONTRACT_MISMATCH');
 requireThat(state.priorHistorySHA256===bundle.manifest.baselineHistory.sha256&&state.historyCount===bundle.manifest.baselineHistory.count+2+state.observerHistory.length,'HISTORY_INVENTORY_MISMATCH');
 requireThat(baselineKeys(bundle).every(k=>isDeepStrictEqual(state[k],bundle.manifest.baseline[k])),'BASELINE_CONTRACT_MISMATCH');
 if(state.observerHistory.length===0){requireThat(isDeepStrictEqual(state.catalog,bundle.beforeCatalog),'PARTIAL_OR_DIFFERENT_CATALOG');requireWriteCapabilities(bundle,state);return 'ready';}
 requireThat(isDeepStrictEqual(state.observerHistory,[{version:VERSION,name:NAME,statementsSHA256:bundle.statementsSha256}]),'PARTIAL_OR_DIFFERENT_HISTORY');
 requireThat(isDeepStrictEqual(state.catalog,bundle.afterCatalog),'FINAL_CATALOG_MISMATCH');return 'applied';
}
export function guardedTables(bundle){return [...new Set([...bundle.beforeCatalog.tables.map(t=>t.name),'public.platform_money_kill_switches','private.discovery_invalidation_worker_config','private.creator_clip_export_worker','private.deleted_content_retention_settings','cron.job'])].sort();}
export function buildApplySql(bundle,before){
 requireThat(classifyState(bundle,before)==='ready','APPLY_REQUIRES_ABSENT_TARGETS');
 // Cron stays in the observed digest, but is deliberately not locked. This
 // detects visible drift, not an external edit after the final observation.
 const tables=guardedTables(bundle),data=digest(tables.map(t=>`select jsonb_build_array(${literal(t)},to_jsonb(t)) item from ${t} t`).join(' union all '));
 const common=`s->>'priorHistorySHA256'=${literal(bundle.manifest.baselineHistory.sha256)} and ${baselineKeys(bundle).map(k=>`s->${literal(k)}=${literal(JSON.stringify(bundle.manifest.baseline[k]))}::jsonb`).join(' and ')} and ${invariantsSQL}=${literal(bundle.manifest.baselineInvariantsSha256)} and ${hooksSQL}=${literal(bundle.manifest.baselineHooksSha256)} and ${socialCatalogSQL(true)}=${literal(bundle.manifest.socialCatalogSha256)} and ${socialHistorySQL}=${literal(JSON.stringify(bundle.socialHistory))}::jsonb and ${socialForeignKeysSQL}=${literal(JSON.stringify(expectedSocialForeignKeys()))}::jsonb`;
 return `begin;set local search_path=pg_catalog,public;set local standard_conforming_strings=on;set local lock_timeout='5s';set local statement_timeout='45s';set local idle_in_transaction_session_timeout='60s';
 do $payout_observer_apply$ declare s jsonb; preserved_data text; begin
 if current_user<>'postgres' or current_setting('transaction_read_only')<>'off' then raise exception 'observer_write_authority_required';end if;
 if exists(select 1 from jsonb_array_elements(${writeCapabilitiesSQL(bundle)}) c where (c->>'canLock')::boolean is not true) then raise exception 'observer_write_lock_capability_required';end if;
 if (${cronReadCapabilitySQL}) is not true then raise exception 'observer_cron_read_capability_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('chillywood-payout-notification-exact-deployment',0));
 lock table ${lockTables(bundle).join(',')} in share row exclusive mode;
 select state into s from (${bundle.readinessQuery}) r;
 if (${common} and (s->>'historyCount')::integer=${bundle.manifest.baselineHistory.count+2} and s->'observerHistory'='[]'::jsonb and (select contracts from (${bundle.catalogQuery}) c)=${literal(JSON.stringify(bundle.beforeCatalog))}::jsonb) is not true then raise exception 'observer_baseline_changed';end if;
 preserved_data:=${data};
 execute ${literal(bundle.body)};
 insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(VERSION)},${literal(NAME)},array[${literal(bundle.body)}]::text[]);
 select state into s from (${bundle.readinessQuery}) r;
 if (${common} and (s->>'historyCount')::integer=${bundle.manifest.baselineHistory.count+3} and s->'observerHistory'=${literal(JSON.stringify([{version:VERSION,name:NAME,statementsSHA256:bundle.statementsSha256}]))}::jsonb and (select contracts from (${bundle.catalogQuery}) c)=${literal(JSON.stringify(bundle.afterCatalog))}::jsonb and ${data}=preserved_data) is not true then raise exception 'observer_postcheck_failed';end if;
 end $payout_observer_apply$;notify pgrst,'reload schema';commit;`;
}
export async function deploy({bundle,apply=false,query,recheckSource}){
 const before=await query(readbackSql(bundle),true),mode=classifyState(bundle,before);
 if(mode==='applied')return {status:'already_applied_verified',wrote:false};
 if(!apply)return {status:'plan_ready',wrote:false};
 requireThat(typeof recheckSource==='function','SOURCE_RECHECK_REQUIRED');
 await recheckSource();let responseConfirmed=false;const diagnostics={};
 try{await query(buildApplySql(bundle,before),false);responseConfirmed=true;}catch(e){diagnostics.writeFailureCode=safeError(e);/* Unknown outcome: read once; never resubmit. */}
 try{const after=await query(readbackSql(bundle),true);if(classifyState(bundle,after)==='applied'&&after.invariantsSha256===before.invariantsSha256)return {status:'applied_verified',wrote:true,responseConfirmed,...diagnostics};}catch(e){diagnostics.readbackFailureCode=safeError(e);/* Only finite allowlisted codes escape. */}
 return {status:'apply_unconfirmed',wrote:true,responseConfirmed,...diagnostics};
}
export const safeError=e=>[...HELPER_ERROR_CODES,'PARTIAL_OR_DIFFERENT_CATALOG','WRITE_CAPABILITY_READBACK_INVALID','CRON_JOB_READ_CAPABILITY_REQUIRED','WRITE_LOCK_CAPABILITY_REQUIRED'].includes(e?.message)?e.message:'PAYOUT_NOTIFICATION_DEPLOY_BLOCKED';
async function main(){
 requireThat(fileURLToPath(import.meta.url)===path.join(ROOT,TOOL),'TOOL_NOT_COMMITTED');
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--help'){process.stdout.write('Usage: node scripts/sandbox-payout-notification-social588-deploy.mjs --source FULL_COMMIT_SHA [--check | --apply]\nRequires exact legacy586 plus the two reviewed social migrations. Default: offline review packet. --check: read-only live preflight. --apply: separately authorized exact migration only; no retries, provider calls, activation or backfill.\nLocks 26 application/history relations. Cron is observed, not frozen; fresh approval of concurrent independent cron-edit risk is required.\n');return;}
 requireThat(args.filter(x=>x==='--source').length===1,'EXACT_SOURCE_REQUIRED');const i=args.indexOf('--source'),source=args[i+1],rest=args.filter((_,j)=>j!==i&&j!==i+1);
 requireThat(rest.length===0||(rest.length===1&&['--check','--apply'].includes(rest[0])),'ARGUMENT_INVALID');
 const binding=sourceBinding(ROOT,source),bundle=loadBundle(ROOT,source);
 const identity={project:PROJECT,...binding,version:VERSION,name:NAME,sha256:HASH,executionContract:EXECUTION_CONTRACT};
 if(!rest.length){process.stdout.write(JSON.stringify({...identity,status:'offline_review_only',wrote:false,readbackSql:readbackSql(bundle)})+'\n');return;}
 const result=await deploy({bundle,apply:rest[0]==='--apply',query:diagnosticManagementQuery(process.env.SUPABASE_ACCESS_TOKEN),recheckSource:()=>{sourceBinding(ROOT,source);loadBundle(ROOT,source);}});
 process.stdout.write(JSON.stringify({...identity,...result})+'\n');if(result.status==='apply_unconfirmed')process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(JSON.stringify({status:'blocked',code:safeError(e)})+'\n');process.exitCode=1;});
