#!/usr/bin/env node
// Exact nine-file room/discovery rollout. Default is read-only; no write retry.
// This does not deploy Edge code or activate money, rendering, or deletion.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {managementQuery} from './studio-rolling-deploy.mjs';

export const PROJECT='bmkkhihfbmsnnmcqkoly';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const MANIFEST='scripts/live-room-deployment-manifest.json';
export const TOOL='scripts/live-room-exact-deploy.mjs';
export const VERSIONS=Object.freeze(['20261101194927','20261101194952','20261101201430','20261101202330','20261101204701','20261101204816','20261101210306','20261101211908','20261101214821']);
const EDGE_PATHS=Object.freeze(['_shared/chat-call-livekit-authority.ts','_shared/exact-subject-authority.ts','_shared/live-cost-guard.ts','_shared/livekit-routing.ts','_shared/livekit-session-generation.ts','_shared/security-request-context.ts','_shared/watch-party-livekit-authority.ts','livekit-token/index.ts'].map(x=>'supabase/functions/'+x));
const EXPECTED_HASHES=Object.freeze(['da046f100ab5e9ed4a3a9cb6701c4be2214c8e27498183bdaf60b7e7b3d14a2b','b245acef636754796f4eede185db22d0cd629d93e5f32c87c437eb7725dd6a9b','bf42e3c2fa318faac98a9ba5c3332a9cd053af482e8cbbf1bd886830e06db862','f3f0408f4df80ab3104c62a4f3593a6ddd226f3a9776cebe8e9fcf0ed73ae3c1','4fba6138afe82149c5bebbdf29aa8cb9fefdcb1257655531c2366bb529b89968','568c7ed0fe3ef6c59d3a3c52b5c61e104cfaf72d1a994db872da2c3e5876fcf7','50a33b52d1b196be9486f1938d583143d8b14ba11fd5375e9f69cbb36a6fc46d','583cb1e503a057caa2de7bde5842a2c7c13eed0121f35d8e589a4f4e63185b16','daa5f1a595bcbc87c11a471893eec5819f4f9e189bf877e5252c25eca346d48c']);
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
export const sha256=s=>createHash('sha256').update(s).digest('hex');
const literal=s=>`'${String(s).replaceAll("'","''")}'`;
const hashSQL=s=>`encode(sha256(convert_to(${s},'UTF8')),'hex')`;
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});

// SQL-aware top-level boundaries. Dollar bodies/comments cannot masquerade as
// transaction commands. No stripping or rewriting of immutable migration bytes.
export function splitSQL(source){
  const statements=[];let start=0,i=0,quote=null,escapeString=false,block=0,line=false;
  while(i<source.length){
    if(line){if(source[i]==='\n')line=false;i++;continue;}
    if(block){if(source.slice(i,i+2)==='/*'){block++;i+=2;}else if(source.slice(i,i+2)==='*/'){block--;i+=2;}else i++;continue;}
    if(quote){if(source.startsWith(quote,i)){if(quote.length===1&&source[i+1]===quote){i+=2;continue;}i+=quote.length;quote=null;escapeString=false;}else if(escapeString&&source[i]==='\\')i+=2;else i++;continue;}
    if(source.slice(i,i+2)==='--'){line=true;i+=2;continue;}
    if(source.slice(i,i+2)==='/*'){block=1;i+=2;continue;}
    if(source[i]==="'"||source[i]==='"'){escapeString=source[i]==="'"&&/[eE]/u.test(source[i-1]??'')&&!/[\w$]/u.test(source[i-2]??'');quote=source[i++];continue;}
    if(source[i]==='$'){const m=source.slice(i).match(/^\$[a-zA-Z_0-9]*\$/u);if(m){quote=m[0];i+=quote.length;continue;}}
    if(source[i]===';'){statements.push(source.slice(start,i+1));start=i+1;}i++;
  }
  requireThat(!quote&&!block,'UNTERMINATED_SQL');
  if(source.slice(start).trim())statements.push(source.slice(start));
  return statements;
}
const head=s=>s.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/u,'').trim();
const normalize=s=>s.replaceAll('"','').replace(/\s+/gu,' ').trim().replace(/\s*,\s*/gu,',');
function splitComma(s){let depth=0,start=0,result=[];for(let i=0;i<s.length;i++){if(s[i]==='(')depth++;if(s[i]===')')depth--;if(s[i]===','&&depth===0){result.push(s.slice(start,i).trim());start=i+1;}}requireThat(depth===0,'UNBALANCED_SIGNATURE');result.push(s.slice(start).trim());return result;}
function aclRoles(acl){
  requireThat(typeof acl==='string'&&/^\{.*\}$/u.test(acl),'EXPLICIT_BASELINE_ACL_REQUIRED');
  return acl.slice(1,-1).split(',').filter(Boolean).map(item=>{const m=item.match(/^([\w]*)=X\/(\w+)$/u);requireThat(m,'UNSUPPORTED_BASELINE_ACL');return m[1];}).sort();
}

// Bounded parser for these immutable nine files only. Unknown CREATE/ALTER/ACL
// function syntax fails closed. Defaults are also rechecked in the live catalog.
export function projectFunctions(migrations,baseline){
  const functions=new Map(baseline.map(x=>[normalize(x.signature),{...x,roles:aclRoles(x.acl)}]));
  for(const {body} of migrations)for(const raw of splitSQL(body)){
    const s=head(raw);if(!s)continue;
    requireThat(!/^(?:begin|commit|rollback|start\s+transaction|end|abort)\b/iu.test(s),'TRANSACTION_CONTROL_FORBIDDEN');
    if(/^create(?:\s+or\s+replace)?\s+function\b/iu.test(s)){
      const m=s.match(/^create(\s+or\s+replace)?\s+function\s+((?:public|private)\."?\w+"?)\s*\(([\s\S]*?)\)\s*returns\b([\s\S]*?)\bas\s*(\$[\w]*\$)([\s\S]*)\5\s*;$/iu);
      requireThat(m,'UNSUPPORTED_FUNCTION_DEFINITION');
      const name=normalize(m[2]),types=m[3].trim()?splitComma(m[3]).map(arg=>{
        const a=arg.match(/^\w+\s+((?:(?:public|private)\.)?\w+(?:\[\])?)(?:\s+default\s+(?:null|false|true|\d+))?$/iu);
        requireThat(a,'UNSUPPORTED_FUNCTION_ARGUMENT');return a[1].toLowerCase().replace(/^timestamptz$/u,'timestamp with time zone');
      }):[];
      const signature=`${name}(${types.join(',')})`,old=functions.get(signature);
      requireThat(m[1]?!!old:!old,'FUNCTION_REPLACEMENT_PRECONDITION');
      requireThat(/\bset\s+search_path\s*=\s*''/iu.test(m[4]),'EMPTY_FUNCTION_SEARCH_PATH_REQUIRED');
      const roles=old?.roles??(name.startsWith('public.')?['','anon','authenticated','postgres','service_role']:['','postgres']);
      const language=m[4].match(/\blanguage\s+(sql|plpgsql)\b/iu)?.[1]?.toLowerCase();
      requireThat(language,'UNSUPPORTED_FUNCTION_LANGUAGE');
      const returns=m[4].split(/\blanguage\b/iu)[0].replaceAll('"','').replace(/\btimestamptz\b/giu,'timestamp with time zone').replace(/\s/gu,'').replaceAll('public.','').toLowerCase();
      const config=['search_path=""'];
      if(/\bset\s+timezone\s*=\s*'UTC'/iu.test(m[4]))config.push('TimeZone=UTC');
      requireThat([...m[4].matchAll(/\bset\s+\w+\s*=/giu)].length===config.length,'UNSUPPORTED_FUNCTION_CONFIG');
      functions.set(signature,{signature,name,bodySha256:sha256(m[6]),securityDefiner:/\bsecurity\s+definer\b/iu.test(m[4]),config,owner:old?.owner??'postgres',roles,language,returns,volatility:/\bstable\b/iu.test(m[4])?'s':/\bimmutable\b/iu.test(m[4])?'i':'v'});
    }else if(/^alter\s+function\b/iu.test(s)){
      const m=s.match(/^alter\s+function\s+((?:public|private)\."?\w+"?\s*\([^)]*\))\s+rename\s+to\s+(\w+)\s*;$/iu);
      requireThat(m,'UNSUPPORTED_FUNCTION_ALTER');const old=normalize(m[1]),entry=functions.get(old);requireThat(entry,'UNKNOWN_RENAME_TARGET');
      const name=old.split('.')[0]+'.'+m[2],signature=name+old.slice(old.indexOf('('));requireThat(!functions.has(signature),'RENAME_DESTINATION_EXISTS');
      functions.delete(old);functions.set(signature,{...entry,name,signature});
    }else if(/^(?:grant|revoke)\b[\s\S]*?\bon\s+function\b/iu.test(s)){
      const m=s.match(/^(grant\s+execute|revoke\s+all)\s+on\s+function\s+([\s\S]*?)\s+(to|from)\s+([\w,\s]+)\s*;$/iu);
      requireThat(m&&((m[1].startsWith('grant')&&m[3]==='to')||(m[1].startsWith('revoke')&&m[3]==='from')),'UNSUPPORTED_FUNCTION_ACL');
      const roles=m[4].split(',').map(x=>x.trim().toLowerCase()).map(x=>x==='public'?'':x);
      for(const target of splitComma(m[2])){const entry=functions.get(normalize(target));requireThat(entry,'UNKNOWN_FUNCTION_ACL_TARGET');
        entry.roles=(m[3]==='to'?[...new Set([...entry.roles,...roles])]:entry.roles.filter(x=>!roles.includes(x))).sort();}
    }else requireThat(!/^drop\s+function\b/iu.test(s),'FUNCTION_DROP_FORBIDDEN');
  }
  return [...functions.values()].sort((a,b)=>a.signature.localeCompare(b.signature));
}

export function sourceBinding(root,source){
  requireThat(/^[a-f0-9]{40}$/u.test(source??''),'EXACT_SOURCE_REQUIRED');
  requireThat(git(root,'rev-parse','HEAD').trim()===source,'SOURCE_HEAD_MISMATCH');
  requireThat(git(root,'status','--porcelain','--untracked-files=no').trim()==='','TRACKED_SOURCE_DIRTY');
  for(const file of [TOOL,MANIFEST,'scripts/studio-rolling-deploy.mjs'])requireThat(git(root,'ls-files','--error-unmatch',file).trim()===file,'TOOL_NOT_COMMITTED');
  return {source,tree:git(root,'rev-parse','HEAD^{tree}').trim()};
}
export function loadBundle(root=ROOT,source){
  const sourceFiles=[];
  const read=file=>{if(source)requireThat(git(root,'ls-files','--error-unmatch',file).trim()===file,'SOURCE_FILE_NOT_COMMITTED');
    const value=source?git(root,'show',`${source}:${file}`):fs.readFileSync(path.join(root,file),'utf8');sourceFiles.push({file,sha256:sha256(value)});return value;};
  const manifest=JSON.parse(read(MANIFEST));
  requireThat(manifest.schema===1&&manifest.project===PROJECT&&manifest.migrations.length===9,'MANIFEST_INVALID');
  requireThat(manifest.baselineFunctions.length===31,'BASELINE_FUNCTION_INVENTORY_INVALID');
  requireThat(manifest.baselineHistory?.count===574&&manifest.baselineHistory.maximum==='20261101215711','BASELINE_HISTORY_INVENTORY_INVALID');
  const migrations=manifest.migrations.map((item,index)=>{
    requireThat(item.version===VERSIONS[index]&&item.sha256===EXPECTED_HASHES[index]&&item.path===`supabase/migrations/${item.version}_${item.name}.sql`,'MIGRATION_SCOPE_INVALID');
    const body=read(item.path);requireThat(sha256(body)===item.sha256,'MIGRATION_HASH_MISMATCH');
    return {...item,body,statementsSha256:sha256(JSON.stringify([body]))};
  });
  requireThat(manifest.edgeFiles.length===8,'EDGE_CLOSURE_INVALID');
  for(const [index,item] of manifest.edgeFiles.entries()){
    requireThat(item.path===EDGE_PATHS[index],'EDGE_SCOPE_INVALID');
    requireThat(sha256(read(item.path))===item.sha256,'EDGE_HASH_MISMATCH');
  }
  const functions=projectFunctions(migrations,manifest.baselineFunctions);
  // 98 touched identities plus six unchanged renderer authority sentinels.
  requireThat(functions.length===104,'FINAL_FUNCTION_INVENTORY_INVALID');
  const kinds=schemaTargets(migrations).reduce((counts,t)=>({...counts,[t.kind]:(counts[t.kind]??0)+1}),{});
  requireThat(kinds.column===16&&kinds.constraint===3&&kinds.index===7&&kinds.policy===9&&kinds.relation===7&&kinds.trigger===26,'SCHEMA_TARGET_INVENTORY_INVALID');
  return {manifest,migrations,functions,sourceFiles};
}

// No secrets or row payloads: only catalog definitions/ACLs and immutable ledger
// statements are hashed. Drift between preflight and locked transaction aborts.
const historyHash=`(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]')")} from supabase_migrations.schema_migrations)`;
function catalogHashSQL(bundle){
  const names=[...new Set([...bundle.functions,...bundle.manifest.baselineFunctions].map(x=>x.name))].map(literal).join(',');
  const relations=[...new Set([...schemaTargets(bundle.migrations).map(x=>x.relation),'public.platform_money_kill_switches','private.creator_clip_export_worker','private.deleted_content_retention_settings'])];
  const relationNames=relations.map(literal).join(','),relationOids=relations.map(x=>`to_regclass(${literal(x)})`).join(',');
  return `(select ${hashSQL("coalesce(jsonb_agg(item order by item::text)::text,'[]')")} from (
 select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname in (${names}) and p.prokind in ('f','p')
 union all select jsonb_build_array('policy',to_jsonb(p)) from pg_policies p where schemaname||'.'||tablename in (${relationNames})
 union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid in (${relationOids})
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text) from pg_attribute a where a.attrelid in (${relationOids}) and a.attnum>0 and not a.attisdropped
 union all select jsonb_build_array('trigger',tgrelid::regclass::text,tgname,pg_get_triggerdef(oid),tgenabled) from pg_trigger where tgrelid in (${relationOids}) and not tgisinternal
 union all select jsonb_build_array('constraint',conrelid::regclass::text,conname,pg_get_constraintdef(oid)) from pg_constraint where conrelid in (${relationOids})
 union all select jsonb_build_array('default_acl',defaclrole::regrole::text,defaclnamespace,defaclobjtype,defaclacl::text) from pg_default_acl where defaclrole=(select oid from pg_roles where rolname='postgres') and defaclnamespace in (0,(select oid from pg_namespace where nspname='public'),(select oid from pg_namespace where nspname='private'))
 union all select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolbypassrls) from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
) catalog_items)`;
}
const signatureSQL=`n.nspname||'.'||p.proname||'('||coalesce((select string_agg(case when tn.nspname='pg_catalog' then format_type(t.oid,null) else tn.nspname||'.'||t.typname end,',' order by a.ord) from unnest(p.proargtypes) with ordinality a(type_oid,ord) join pg_type t on t.oid=a.type_oid join pg_namespace tn on tn.oid=t.typnamespace),'')||')'`;
const rolesSQL=`coalesce((select array_agg(case when x.grantee=0 then '' else x.grantee::regrole::text end order by case when x.grantee=0 then '' else x.grantee::regrole::text end) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.privilege_type='EXECUTE' and not x.is_grantable),array[]::text[])`;
const textArray=xs=>`array[${xs.map(literal).join(',')}]::text[]`;
export function schemaTargets(migrations){
  const targets=new Map(),add=(kind,relation,name='')=>{const key=[kind,relation,name].join(':');targets.set(key,{key,kind,relation,name});};
  for(const {body} of migrations)for(const raw of splitSQL(body)){
    const s=head(raw);let m;
    if((m=s.match(/^create\s+table\s+((?:public|private)\.\w+)/iu)))add('relation',m[1]);
    if((m=s.match(/^alter\s+table\s+((?:public|private)\.\w+)\s+([\s\S]*)/iu))){
      for(const a of m[2].matchAll(/\badd\s+column\s+(\w+)/giu))add('column',m[1],a[1]);
      for(const a of m[2].matchAll(/\badd\s+constraint\s+(\w+)/giu))add('constraint',m[1],a[1]);
    }
    if((m=s.match(/^create\s+(?:unique\s+)?index\s+(\w+)\s+on\s+((?:public|private)\.\w+)/iu)))add('index',m[2],m[1]);
    if(/^create\s+(?:constraint\s+)?trigger\b/iu.test(s)){
      m=s.match(/^create\s+(?:constraint\s+)?trigger\s+(\w+)[\s\S]*?\bon\s+((?:public|private|auth)\.\w+)/iu);
      requireThat(m,'UNSUPPORTED_TRIGGER_TARGET');add('trigger',m[2],m[1]);
    }
    if((m=s.match(/^create\s+policy\s+(\w+)\s+on\s+((?:public|private)\.\w+)/iu)))add('policy',m[2],m[1]);
  }
  return [...targets.values()].sort((a,b)=>a.key.localeCompare(b.key));
}
function schemaValue(t){
  const rel=`to_regclass(${literal(t.relation)})`,name=literal(t.name);
  if(t.kind==='column')return `(select jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),
    (select jsonb_agg(jsonb_build_array(c.conname,pg_get_constraintdef(c.oid),c.convalidated) order by c.conname) from pg_constraint c where c.conrelid=a.attrelid and a.attnum=any(c.conkey))) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=${rel} and a.attname=${name} and a.attnum>0 and not a.attisdropped)`;
  if(t.kind==='constraint')return `(select jsonb_build_array(pg_get_constraintdef(oid),convalidated,condeferrable,condeferred) from pg_constraint where conrelid=${rel} and conname=${name})`;
  if(t.kind==='index')return `(select jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indisunique) from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid=${rel} and c.relname=${name})`;
  if(t.kind==='trigger')return `(select jsonb_build_array(pg_get_triggerdef(oid),tgenabled,tgisinternal) from pg_trigger where tgrelid=${rel} and tgname=${name})`;
  if(t.kind==='policy')return `(select jsonb_build_array(polcmd,polpermissive,(select array_agg(r::regrole::text order by r::regrole::text) from unnest(polroles) r),pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) from pg_policy where polrelid=${rel} and polname=${name})`;
  requireThat(t.kind==='relation','SCHEMA_KIND_INVALID');
  return `(select jsonb_build_array(c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,
    (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    (select jsonb_agg(jsonb_build_array(x.conname,pg_get_constraintdef(x.oid),x.convalidated) order by x.conname) from pg_constraint x where x.conrelid=c.oid),
    (select jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) order by i.indexrelid::regclass::text) from pg_index i where i.indrelid=c.oid)) from pg_class c where c.oid=${rel})`;
}
export function schemaContractsSql(bundle){
  return `set local search_path=pg_catalog,public; select jsonb_agg(jsonb_build_object('key',key,'sha256',${hashSQL('value::text')}) order by key) state from (${schemaTargets(bundle.migrations).map(t=>`select ${literal(t.key)} key, ${schemaValue(t)} value`).join(' union all ')}) items;`;
}
function schemaCheck(bundle){
  const targets=schemaTargets(bundle.migrations),expected=bundle.manifest.schemaContracts;
  requireThat(Array.isArray(expected)&&expected.length===targets.length,'SCHEMA_CONTRACTS_REQUIRED');
  return targets.map(t=>{const e=expected.find(e=>e.key===t.key);requireThat(e&&/^[a-f0-9]{64}$/u.test(e.sha256),'SCHEMA_CONTRACT_INVALID');return `${hashSQL(`(${schemaValue(t)})::text`)}=${literal(e.sha256)}`;}).join(' and ');
}
function functionCheck(entries,{baseline=false}={}){
  return entries.map(e=>`exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${signatureSQL}=${literal(e.signature)} and p.prokind='f'
    and ${hashSQL('p.prosrc')}=${literal(e.bodySha256)} and p.prosecdef=${e.securityDefiner} and p.proconfig=${textArray(e.config)}
    and p.proowner::regrole::text=${literal(e.owner)} and ${rolesSQL}=${textArray(e.roles??aclRoles(e.acl))}
    and p.provolatile=${literal(e.volatility)} and (select lanname from pg_language where oid=p.prolang)=${literal(e.language)}
    and replace(lower(regexp_replace(pg_get_function_result(p.oid),'[[:space:]]','','g')),'public.','')=${literal(e.returns)}
    and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.is_grantable)
    ${baseline?`and md5(pg_get_functiondef(p.oid))=${literal(e.definitionMd5)}`:''})`).join(' and ');
}
const newTables=['room_discovery_host_consents','live_stage_discovery_publications','circle_discovery_hint_recipients','room_attendance_hint_receipts','party_room_admission_sessions','room_start_notification_bindings','room_start_notification_deliveries'];
const noNewTables=newTables.map(t=>`to_regclass('private.${t}') is null`).join(' and ');
const defaultACL=`not exists(select 1 from pg_default_acl where defaclrole=(select oid from pg_roles where rolname=current_user) and defaclobjtype='f' and defaclnamespace in (0,(select oid from pg_namespace where nspname='private')))
 and (select count(*)=1 and bool_and((select array_agg(x.grantee::regrole::text order by x.grantee::regrole::text) from aclexplode(defaclacl) x where x.privilege_type='EXECUTE' and not x.is_grantable)=array['anon','authenticated','postgres','service_role']::text[]) from pg_default_acl where defaclrole=(select oid from pg_roles where rolname=current_user) and defaclobjtype='f' and defaclnamespace=(select oid from pg_namespace where nspname='public'))`;
export const holdsSQL=`current_user='postgres'
 and (select count(*)=4 and bool_and(case when key='stripe_connect_enabled' then state='sandbox_only' else state='off' end) from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled'))
 and (select count(*)=1 and bool_and(enabled and collecting) from private.discovery_invalidation_worker_config)
 and (select count(*)=1 and bool_and(not enabled) from private.creator_clip_export_worker)
 and (select count(*)=1 and bool_and(not capture_enabled and not media_staging_enabled and not text_expiry_enabled and not media_expiry_enabled and not activation_ready and not legacy_object_deletes_blocked) from private.deleted_content_retention_settings)`;
function finalChecks(bundle){
  const roomPolicy=`(select count(*)=1 and bool_and(polname='watch_party_rooms_scoped_read' and polpermissive and polroles=array[(select oid from pg_roles where rolname='authenticated')]::oid[] and pg_get_expr(polqual,polrelid)='can_browse_watch_party_room(party_id)' and polwithcheck is null) from pg_policy where polrelid='public.watch_party_rooms'::regclass and polcmd in ('r','*'))`;
  const privateTables=newTables.map(t=>`exists(select 1 from pg_class c where c.oid=to_regclass('private.${t}') and c.relrowsecurity and c.relforcerowsecurity and c.relowner::regrole::text='postgres') and not has_table_privilege('anon','private.${t}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_table_privilege('authenticated','private.${t}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`).join(' and ');
  return {functions:functionCheck(bundle.functions),schema:schemaCheck(bundle),privacy:`${roomPolicy} and (select relrowsecurity and not relforcerowsecurity from pg_class where oid='public.watch_party_rooms'::regclass)`,privateTables,
    holds:`${holdsSQL} and (select bool_and(primary_delivery_enabled) from private.discovery_invalidation_worker_config)`};
}
const historyMatch=e=>`exists(select 1 from supabase_migrations.schema_migrations m where version=${literal(e.version)} and name=${literal(e.name)} and ${hashSQL('array_to_json(m.statements)::text')}=${literal(e.statementsSha256)})`;
export function readbackSql(bundle){
  // Final expressions reference new relations/columns, so read them separately
  // only when all immutable target records are present.
  return `set local search_path=pg_catalog,public; select jsonb_build_object('schema',1,'database',current_database(),
 'historySha256',${historyHash},'catalogSha256',${catalogHashSQL(bundle)},'holds',(${holdsSQL}),
 'historyCount',(select count(*) from supabase_migrations.schema_migrations),'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),
 'baselineFunctions',(${functionCheck(bundle.manifest.baselineFunctions,{baseline:true})}),'defaults',(${defaultACL}),
 'objectsAbsent',(${noNewTables}),
 'targets',coalesce((select jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsSha256',${hashSQL('array_to_json(m.statements)::text')}) order by version) from supabase_migrations.schema_migrations m where version in (${VERSIONS.map(literal).join(',')})),'[]'::jsonb)) state;`;
}
export function finalReadbackSql(bundle){
  return `set local search_path=pg_catalog,public; select jsonb_build_object(${Object.entries(finalChecks(bundle)).flatMap(([k,v])=>[literal(k),`coalesce((${v}),false)`]).join(',')}) state;`;
}
export function classifyState(bundle,state,final){
  requireThat(state?.schema===1&&state.database==='postgres'&&/^[a-f0-9]{64}$/u.test(state.historySha256??'')&&/^[a-f0-9]{64}$/u.test(state.catalogSha256??'')&&Array.isArray(state.targets),'READBACK_INVALID');
  requireThat(state.holds===true,'PRODUCTION_HOLDS_MISMATCH');
  requireThat(state.historyCount===bundle.manifest.baselineHistory.count+(state.targets.length?9:0)&&state.historyMaximum===bundle.manifest.baselineHistory.maximum,'HISTORY_INVENTORY_MISMATCH');
  if(state.targets.length===0){requireThat(state.baselineFunctions===true&&state.defaults===true&&state.objectsAbsent===true,'BASELINE_CONTRACT_MISMATCH');return 'ready';}
  requireThat(state.targets.length===9&&bundle.migrations.every(e=>state.targets.some(a=>a.version===e.version&&a.name===e.name&&a.statementsSha256===e.statementsSha256)),'PARTIAL_OR_DIFFERENT_HISTORY');
  requireThat(final&&Object.keys(final).sort().join(',')==='functions,holds,privacy,privateTables,schema'&&Object.values(final).every(v=>v===true),'FINAL_CATALOG_MISMATCH');return 'applied';
}
export function buildApplySql(bundle,baseline){
  requireThat(classifyState(bundle,baseline)==='ready','APPLY_REQUIRES_ABSENT_TARGETS');
  const checks=Object.values(finalChecks(bundle)).map(s=>`coalesce((${s}),false)`).join(' and ');
  return `begin;
set local search_path=pg_catalog,public;
set local standard_conforming_strings=on;
set local lock_timeout='5s';
set local statement_timeout='45s';
set local idle_in_transaction_session_timeout='60s';
do $room_apply$ begin
perform pg_advisory_xact_lock(hashtextextended('chillywood-live-room-exact-nine-deployment',0));
lock table supabase_migrations.schema_migrations in share row exclusive mode;
lock table public.watch_party_rooms,public.watch_party_room_memberships,public.room_broadcast_sessions,public.discovery_feed_items,public.circle_spectator_feed_items,public.creator_events,public.titles,private.discovery_invalidation_worker_config,private.discovery_invalidation_outbox,public.platform_money_kill_switches,private.creator_clip_export_worker,private.deleted_content_retention_settings in share row exclusive mode;
 if ${historyHash}<>${literal(baseline.historySha256)} or ${catalogHashSQL(bundle)}<>${literal(baseline.catalogSha256)} or not (${holdsSQL}) or not (${defaultACL}) or not (${noNewTables}) or not (${functionCheck(bundle.manifest.baselineFunctions,{baseline:true})}) or exists(select 1 from supabase_migrations.schema_migrations where version in (${VERSIONS.map(literal).join(',')})) then raise exception 'live_room_baseline_changed'; end if;
${bundle.migrations.map(e=>`execute ${literal(e.body)};\ninsert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(e.version)},${literal(e.name)},array[${literal(e.body)}]::text[]);`).join('\n')}
-- live-room-postflight
 if not (${checks} and ${bundle.migrations.map(historyMatch).join(' and ')}) then raise exception 'live_room_final_catalog_mismatch'; end if;
end $room_apply$;
notify pgrst,'reload schema';
commit;`;
}
export async function deploy({bundle,apply=false,query,recheckSource=()=>{}}){
  const before=await query(readbackSql(bundle),true);
  const beforeFinal=before.targets?.length?await query(finalReadbackSql(bundle),true):undefined;
  const mode=classifyState(bundle,before,beforeFinal);
  if(!apply||mode==='applied')return {status:mode==='applied'?'already_applied_verified':'plan_ready',wrote:false,before};
  recheckSource();let responseConfirmed=false;
  try{await query(buildApplySql(bundle,before),false);responseConfirmed=true;}catch{/* Never retry an uncertain write. */}
  let after,final;
  try{after=await query(readbackSql(bundle),true);if(after.targets?.length)final=await query(finalReadbackSql(bundle),true);}catch{return {status:'apply_unconfirmed',wrote:true,responseConfirmed};}
  try{if(classifyState(bundle,after,final)==='applied')return {status:'applied_verified',wrote:true,responseConfirmed,after};}catch{return {status:'apply_unconfirmed',wrote:true,responseConfirmed,after};}
  // A read of the old snapshot does not prove an uncertain write cannot commit
  // later. Keep the outcome unresolved; operator reconciliation must precede retry.
  return {status:'apply_unconfirmed',wrote:true,responseConfirmed,after};
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){process.stdout.write('Usage: node scripts/live-room-exact-deploy.mjs --source FULL_COMMIT_SHA [--apply]\nRead-only default. Exact nine migrations only. Existing SUPABASE_ACCESS_TOKEN required; no secret-file access. No write retry. Deploy matching LiveKit separately after verified database closure.\n');return;}
  requireThat(args.filter(x=>x==='--source').length===1,'EXACT_SOURCE_REQUIRED');const index=args.indexOf('--source'),source=args[index+1],rest=args.filter((_,i)=>i!==index&&i!==index+1);
  requireThat(rest.length===0||(rest.length===1&&rest[0]==='--apply'),'ARGUMENT_INVALID');
  const binding=sourceBinding(ROOT,source),bundle=loadBundle(ROOT,source);
  const result=await deploy({bundle,apply:rest.includes('--apply'),query:managementQuery(process.env.SUPABASE_ACCESS_TOKEN),recheckSource:()=>{sourceBinding(ROOT,source);requireThat(JSON.stringify(loadBundle(ROOT,source).sourceFiles)===JSON.stringify(bundle.sourceFiles),'SOURCE_BYTES_CHANGED');}});
  process.stdout.write(JSON.stringify({project:PROJECT,...binding,status:result.status,wrote:result.wrote,responseConfirmed:result.responseConfirmed,versions:VERSIONS,historySha256:(result.after??result.before)?.historySha256})+'\n');
  if(!['plan_ready','already_applied_verified','applied_verified'].includes(result.status))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(JSON.stringify({status:'blocked',code:/^[A-Z_]+$/u.test(e?.message??'')?e.message:'LIVE_ROOM_DEPLOY_BLOCKED'})+'\n');process.exitCode=1;});
