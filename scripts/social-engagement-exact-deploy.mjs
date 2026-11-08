#!/usr/bin/env node
// Two immutable additive social migrations. No generic migration replay,
// provider activation, historical receipt repair, or retry of an uncertain write.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256,splitSQL,diagnosticManagementQuery,validateReadContext,redundantNotNull} from './live-room-exact-deploy.mjs';

export const PROJECT='bmkkhihfbmsnnmcqkoly';
export const TOOL='scripts/social-engagement-exact-deploy.mjs';
export const MANIFEST='scripts/social-engagement-deployment-manifest.json';
export const MIGRATIONS=Object.freeze([
  {version:'20261107173220',name:'creator_video_social_engagement',sha256:'139f5b6222023682f605cdda160ec7de780bfcbd61748549d6c4c21c6d394c44'},
  {version:'20261107191000',name:'comment_likes',sha256:'4ae184fa4ecfc3358feb5a1485b9e49322fc637d09f3f97dad66aa9843304f8a'},
].map(x=>Object.freeze({...x,path:`supabase/migrations/${x.version}_${x.name}.sql`})));
export const FUNCTIONS=Object.freeze(['read_authorized_creator_video_engagement','read_creator_video_engagement_batch','set_creator_video_like','set_creator_video_repost','read_creator_video_reposts','read_comment_likes_batch','set_comment_like']);
export const SCHEMAS=Object.freeze(['video_engagement_private','comment_likes_private']);
export const SOURCE_TABLES=Object.freeze(['auth.users','public.videos','public.creator_video_comments','public.profile_post_comments','public.profile_posts','public.user_profiles','public.account_deletion_requests']);
export const TRIGGERS=Object.freeze(['creator_video_comments_exact_count','creator_video_reposts_profile_privacy','creator_video_reposts_account_ban','creator_video_reposts_account_deletion','profile_comment_likes_cleanup','video_comment_likes_cleanup']);
export const CLOSURE=Object.freeze([TOOL,MANIFEST,...MIGRATIONS.map(x=>x.path),'scripts/live-room-exact-deploy.mjs','scripts/studio-rolling-deploy.mjs']);
export const HELPERS=Object.freeze(['public.wave1_current_caller_authority_internal()','public.is_account_access_restricted(text)','public.can_view_profile_content(text)','public.media_scan_public_safe(text)','public.can_read_creator_video_row(text,text,text,text,text,text,text,text)']);
const REQUIRED_COLUMNS=Object.freeze({
 'auth.users':{id:'uuid',banned_until:'timestamp with time zone'},
 'public.videos':{id:'uuid',owner_id:'uuid',visibility:'text',moderation_status:'text',scan_status:'text',quarantined_at:'timestamp with time zone',storage_path:'text',storage_object_key:'text',playback_url:'text'},
 'public.creator_video_comments':{id:'uuid',video_id:'uuid',parent_comment_id:'uuid',deleted_at:'timestamp with time zone',moderation_status:'text'},
 'public.profile_post_comments':{id:'uuid',post_id:'uuid',parent_comment_id:'uuid',deleted_at:'timestamp with time zone',moderation_status:'text'},
 'public.profile_posts':{id:'uuid',user_id:'text',deleted_at:'timestamp with time zone',visibility:'text',moderation_status:'text'},
 'public.user_profiles':{user_id:'text',shares_visibility:'text',profile_access_visibility:'text',profile_visibility:'text'},
 'public.account_deletion_requests':{user_id:'uuid',status:'text'},
});
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
const literal=s=>`'${String(s).replaceAll("'","''")}'`;
const list=xs=>xs.map(literal).join(',');
const hashSQL=s=>`encode(sha256(convert_to(${s},'UTF8')),'hex')`;
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const head=s=>s.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/u,'').trim();
export function migrationStatements(body){
  const statements=splitSQL(body).filter(x=>head(x));
  requireThat(/^begin\s*;$/iu.test(head(statements[0]))&&/^commit\s*;$/iu.test(head(statements.at(-1))),'TRANSACTION_ENVELOPE_INVALID');
  const inner=statements.slice(1,-1);
  requireThat(inner.length>0&&inner.every(x=>! /^(?:begin|commit|rollback|start\s+transaction|end|abort|savepoint|release|prepare\s+transaction)\b/iu.test(head(x))),'TRANSACTION_ENVELOPE_INVALID');
  return inner;
}
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
  const manifest=JSON.parse(read(MANIFEST));
  requireThat(manifest.schema===1&&manifest.project===PROJECT&&JSON.stringify(manifest.migrations)===JSON.stringify(MIGRATIONS),'MANIFEST_INVALID');
  requireThat(/^[a-f0-9]{64}$/u.test(manifest.targetCatalogSha256??''),'MANIFEST_INVALID');
  const migrations=MIGRATIONS.map(entry=>{
    const body=read(entry.path);requireThat(sha256(body)===entry.sha256,'MIGRATION_HASH_MISMATCH');
    return {...entry,body,statements:migrationStatements(body),statementsSha256:sha256(JSON.stringify([body]))};
  });
  return {manifest,migrations};
}

// Stable schema-qualified identities avoid OIDs and search_path-dependent text.
// This projection is shared by current/baseline and new-target fingerprints.
export function catalogSQL(target){
  const schema=target?`n.nspname in (${list(SCHEMAS)})`:`n.nspname in ('public','private','auth')`;
  const functionFilter=target?`(${schema} or (n.nspname='public' and p.proname in (${list(FUNCTIONS)})))`:
    `(${schema} and not(n.nspname='public' and p.proname in (${list(FUNCTIONS)})))`;
  const triggerFilter=target?`(${schema} or (n.nspname in ('public','auth') and t.tgname in (${list(TRIGGERS)})))`:
    `(${schema} and not t.tgname in (${list(TRIGGERS)}))`;
  return `(select ${hashSQL('coalesce(jsonb_agg(item order by item::text collate "C")::text,\'[]\')')} from (
 select jsonb_build_array('schema',n.nspname,n.nspowner::regrole::text,n.nspacl::text) item from pg_namespace n where ${schema}
union all select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),pg_get_function_arguments(p.oid),p.procost,p.prorows,p.prosupport::regproc::text,p.prosrc,(select lanname from pg_language where oid=p.prolang),p.prokind,p.provolatile,p.prosecdef,p.proisstrict,p.proleakproof,p.proparallel,p.proconfig,p.proacl::text,p.proowner::regrole::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${functionFilter} and p.prokind in ('f','p')
 union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${schema}
 union all select jsonb_build_array('column',n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where ${schema} and a.attnum>0 and not a.attisdropped
 union all select jsonb_build_array('policy',n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,(select array_agg(r::regrole::text order by r::regrole::text) from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where ${schema}
 union all select jsonb_build_array('trigger',n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and ${triggerFilter}
 union all select jsonb_build_array('constraint',n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where ${schema} and not ${redundantNotNull('k')}
 union all select jsonb_build_array('index',n.nspname,c.relname,pg_get_indexdef(i.indexrelid)) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where ${schema}
 ${target?'':`union all select jsonb_build_array('default_acl',d.defaclrole::regrole::text,coalesce(n.nspname,''),d.defaclobjtype,d.defaclacl::text) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 union all select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolbypassrls) from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
 union all select jsonb_build_array('membership',roleid::regrole::text,member::regrole::text,admin_option) from pg_auth_members
 union all select jsonb_build_array('event_trigger',evtname,evtevent,evtfoid::regprocedure::text,evtenabled,evttags) from pg_event_trigger`}
 ) projection)`;
}
export const priorHistoryHashSQL=`(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]')")} from supabase_migrations.schema_migrations where version not in (${list(MIGRATIONS.map(x=>x.version))}))`;
export const controlsHashSQL=`(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(key,state) order by key)::text,'[]')")} from public.platform_money_kill_switches)`;
export const holdsSQL=`(select count(*)=3 and bool_and(state='off') from public.platform_money_kill_switches where key in ('live_money_enabled','cashout_enabled','payouts_enabled'))`;
export const backfillSQL=`not exists(select 1 from (
 select video_id,count(*)::bigint expected from public.creator_video_comments where parent_comment_id is null and deleted_at is null and moderation_status in ('clean','reported') group by video_id
 ) source full join (select video_id,sum(comment_count)::bigint actual from video_engagement_private.counts group by video_id) stored using(video_id)
 where coalesce(expected,0)<>coalesce(actual,0))
 and not exists(select 1 from video_engagement_private.counts where like_count<>0 or repost_count<>0)
 and not exists(select 1 from video_engagement_private.likes)
 and not exists(select 1 from video_engagement_private.reposts)
 and not exists(select 1 from comment_likes_private.likes)
 and not exists(select 1 from comment_likes_private.counts)`;
const absentSQL=`not exists(select 1 from pg_namespace where nspname in (${list(SCHEMAS)})) and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${list(FUNCTIONS)})) and not exists(select 1 from pg_trigger where not tgisinternal and tgname in (${list(TRIGGERS)}))`;
const contextSQL=`jsonb_build_object('currentPostgres',current_user='postgres','currentReadOnly',current_user='supabase_read_only_user','sessionPostgres',session_user='postgres','sessionReadOnly',session_user='supabase_read_only_user','sessionAdmin',session_user='supabase_admin','transactionReadOnly',current_setting('transaction_read_only')='on')`;
export function prerequisitesSQL(bundle){
  const helpers=bundle.manifest.helpers??[];
  requireThat(JSON.stringify(helpers.map(x=>x.signature))===JSON.stringify(HELPERS)&&helpers.every(x=>Array.isArray(x.bodySha256)&&x.bodySha256.length>0&&x.bodySha256.every(y=>/^[a-f0-9]{64}$/u.test(y))),'MANIFEST_INVALID');
  requireThat(helpers.every(x=>x.metadata&&Object.keys(x.metadata).sort().join(',')==='acl,arg_defaults,arg_modes,arg_names,cost,language,parallel,rows,strict,support,volatility'),'MANIFEST_INVALID');
  return [...helpers.map(x=>`exists(select 1 from pg_proc p where oid=to_regprocedure(${literal(x.signature)}) and ${hashSQL('prosrc')} in (${list(x.bodySha256)}) and proowner::regrole::text='postgres' and proconfig=array['search_path=""']::text[] and prokind='f' and prorettype='boolean'::regtype and not proleakproof and prosecdef=${x.signature==='public.media_scan_public_safe(text)'?'false':'true'}
      and jsonb_build_object('language',(select lanname from pg_language where oid=p.prolang),'volatility',provolatile,'strict',proisstrict,'parallel',proparallel,'acl',proacl::text,'arg_names',proargnames,'arg_modes',proargmodes,'arg_defaults',pg_get_expr(proargdefaults,0),'cost',procost,'rows',prorows,'support',prosupport::regproc::text)=${literal(JSON.stringify(x.metadata))}::jsonb)`),
    ...Object.entries(REQUIRED_COLUMNS).flatMap(([table,columns])=>[
`exists(select 1 from pg_class where oid=to_regclass(${literal(table)}) and relkind='r' and ${table==='auth.users'?'true':'relrowsecurity'})`,
      ...Object.entries(columns).map(([name,type])=>`exists(select 1 from pg_attribute where attrelid=to_regclass(${literal(table)}) and attname=${literal(name)} and not attisdropped and format_type(atttypid,atttypmod)=${literal(type)})`),
    ])].join(' and ');
}
export function readbackSql(bundle){
  return `begin isolation level read committed read only;set local search_path=pg_catalog,public;set local statement_timeout='20s';set local idle_in_transaction_session_timeout='15s';
do $social_read$ begin if not pg_try_advisory_xact_lock_shared(176214,683) or not pg_try_advisory_xact_lock_shared(176214,707) then raise exception 'social_operation_in_progress';end if;end $social_read$;
select jsonb_build_object('schema',1,'database',current_database(),'context',${contextSQL},'priorHistorySha256',${priorHistoryHashSQL},'catalogSha256',${catalogSQL(false)},'controlsSha256',${controlsHashSQL},'holds',coalesce((${holdsSQL}),false),'prerequisites',coalesce((${prerequisitesSQL(bundle)}),false),'absent',(${absentSQL}),'targetCatalogSha256',${catalogSQL(true)},'targets',coalesce((select jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsSha256',${hashSQL('array_to_json(statements)::text')}) order by version) from supabase_migrations.schema_migrations where version in (${list(MIGRATIONS.map(x=>x.version))})),'[]'::jsonb)) state;commit;`;
}
export function classifyState(bundle,state){
  validateReadContext(state?.context);
  requireThat(state?.schema===1&&state.database==='postgres'&&Array.isArray(state.targets)&&['priorHistorySha256','catalogSha256','controlsSha256','targetCatalogSha256'].every(k=>/^[a-f0-9]{64}$/u.test(state[k]??'')),'READBACK_INVALID');
  requireThat(state.holds===true,'PRODUCTION_HOLDS_MISMATCH');
  requireThat(state.prerequisites===true,'PREREQUISITE_MISMATCH');
  if(state.targets.length===0){requireThat(state.absent===true,'PARTIAL_OR_DIFFERENT_CATALOG');return 'ready';}
  requireThat(state.targets.length===2&&bundle.migrations.every(e=>state.targets.some(t=>t.version===e.version&&t.name===e.name&&t.statementsSha256===e.statementsSha256)),'PARTIAL_OR_DIFFERENT_HISTORY');
  requireThat(state.targetCatalogSha256===bundle.manifest.targetCatalogSha256,'FINAL_CATALOG_MISMATCH');
  return 'applied';
}
export function buildApplySql(bundle,before){
  requireThat(classifyState(bundle,before)==='ready','APPLY_REQUIRES_ABSENT_TARGETS');
  const unchanged=`${priorHistoryHashSQL}=${literal(before.priorHistorySha256)} and ${catalogSQL(false)}=${literal(before.catalogSha256)} and ${controlsHashSQL}=${literal(before.controlsSha256)} and (${holdsSQL}) and (${prerequisitesSQL(bundle)})`;
  return `begin isolation level read committed;set local search_path=pg_catalog,public;set local standard_conforming_strings=on;set local check_function_bodies=on;set local lock_timeout='5s';set local statement_timeout='60s';set local idle_in_transaction_session_timeout='60s';
do $social_apply$ begin
if current_user<>'postgres' or current_setting('transaction_read_only')<>'off' then raise exception 'social_write_authority_required';end if;
if not pg_try_advisory_xact_lock(176214,683) or not pg_try_advisory_xact_lock(176214,707) then raise exception 'social_operation_in_progress';end if;
lock table supabase_migrations.schema_migrations,public.platform_money_kill_switches,${SOURCE_TABLES.join(',')} in share row exclusive mode;
if ((${unchanged}) and (${absentSQL}) and not exists(select 1 from supabase_migrations.schema_migrations where version in (${list(MIGRATIONS.map(x=>x.version))}))) is not true then raise exception 'social_baseline_changed';end if;
${bundle.migrations.map(e=>`${e.statements.map(s=>`execute ${literal(s)};`).join('\n')}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(e.version)},${literal(e.name)},array[${literal(e.body)}]::text[]);`).join('\n')}
if (${backfillSQL}) is not true then raise exception 'social_backfill_failed';end if;
if ((${unchanged}) and ${catalogSQL(true)}=${literal(bundle.manifest.targetCatalogSha256)} and ${bundle.migrations.map(e=>`exists(select 1 from supabase_migrations.schema_migrations where version=${literal(e.version)} and name=${literal(e.name)} and ${hashSQL('array_to_json(statements)::text')}=${literal(e.statementsSha256)})`).join(' and ')}) is not true then raise exception 'social_postcheck_failed';end if;
end $social_apply$;notify pgrst,'reload schema';commit;`;
}
export async function deploy({bundle,apply=false,query,recheckSource=()=>{}}){
  const before=await query(readbackSql(bundle),true),mode=classifyState(bundle,before);
  if(!apply||mode==='applied')return {status:mode==='applied'?'already_applied_verified':'plan_ready',wrote:false,before};
  recheckSource();let responseConfirmed=false;
  try{await query(buildApplySql(bundle,before),false);responseConfirmed=true;}catch{/* Read-only reconciliation, never retry. */}
  let after;
  try{after=await query(readbackSql(bundle),true);
    if(classifyState(bundle,after)==='applied'&&['priorHistorySha256','catalogSha256','controlsSha256'].every(k=>after[k]===before[k]))
      return {status:'applied_verified',wrote:true,responseConfirmed,after};
  }catch{/* No untrusted error details escape. */}
  return {status:'apply_unconfirmed',wrote:true,responseConfirmed};
}
export const safeError=()=> 'SOCIAL_DEPLOY_BLOCKED';
async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){process.stdout.write('Usage: node scripts/social-engagement-exact-deploy.mjs --source FULL_COMMIT_SHA [--apply]\nRead-only by default. Exactly two immutable social migrations; separate production authorization required for --apply. Existing SUPABASE_ACCESS_TOKEN only. No provider/OTA activation or write retries.\n');return;}
  requireThat(args.filter(x=>x==='--source').length===1,'EXACT_SOURCE_REQUIRED');
  const i=args.indexOf('--source'),source=args[i+1],rest=args.filter((_,j)=>j!==i&&j!==i+1);
  requireThat(rest.length===0||(rest.length===1&&rest[0]==='--apply'),'ARGUMENT_INVALID');
  const binding=sourceBinding(ROOT,source),bundle=loadBundle(ROOT,source);
  const result=await deploy({bundle,apply:rest.includes('--apply'),query:diagnosticManagementQuery(process.env.SUPABASE_ACCESS_TOKEN),recheckSource:()=>{sourceBinding(ROOT,source);loadBundle(ROOT,source);}});
  process.stdout.write(JSON.stringify({project:PROJECT,...binding,status:result.status,wrote:result.wrote,responseConfirmed:result.responseConfirmed})+'\n');
  if(!['plan_ready','already_applied_verified','applied_verified'].includes(result.status))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write(JSON.stringify({status:'blocked',code:safeError()})+'\n');process.exitCode=1;});
