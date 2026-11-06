#!/usr/bin/env node
// Exact source-only preparation. Never opens a socket, loads a credential,
// executes SQL, retries a write, or changes any historical deployment manifest.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {bridgeDefinition,restoreDefinition,sha256,literal,replacementSQL,DRAIN_SQL,BRIDGE_FUNCTION,BRIDGE_FUNCTION_SQL,BRIDGE_TRIGGER} from './bridge.mjs';
import {hashSQL,catalogHashSQL} from './catalog.mjs';

export const PROJECT='bmkkhihfbmsnnmcqkoly';
export const DIRECTORY='ops/automatic-commerce-cutover';
export const MAX_PAYLOAD_BYTES=900000;
export const MAX_PHYSICAL_LINE_BYTES=2048;
export const contract=JSON.parse(fs.readFileSync(new URL('./contract.json',import.meta.url),'utf8'));
const check=(ok,code)=>{if(!ok)throw Error(code);};
const safeRelation=x=>{check(/^(?:auth|public|private)\.[a-z_][a-z_0-9]*$/u.test(x),'RELATION_SCOPE_INVALID');return x;};
const checkHash=x=>/^[a-f0-9]{64}$/u.test(x??'');
// Flat arrays avoid a deep concatenation expression. Chunk by Unicode codepoint
// and encoded SQL-literal byte width, never through a quote escape or surrogate.
// Isolate every dollar so data cannot terminate the enclosing DO dollar quote.
export function textChunks(value,limit=1800){
 check(typeof value==='string'&&!value.includes('\0')&&!/[\uD800-\uDFFF]/u.test(value),'SQL_TEXT_INVALID');
 check(Number.isInteger(limit)&&limit>=8&&limit<=1800,'SQL_CHUNK_LIMIT_INVALID');
 const chunks=[];let part='',bytes=0;
 const flush=()=>{if(part){chunks.push(part);part='';bytes=0;}};
 for(const character of value){
  if(character==='$'){flush();chunks.push(character);continue;}
  const width=Buffer.byteLength(character)+(character==="'"?1:0);
  if(bytes+width>limit)flush();part+=character;bytes+=width;
 }
 flush();return chunks.length?chunks:[''];
}
export const sqlText=value=>`pg_catalog.array_to_string(array[\n${textChunks(value).map(chunk=>literal(chunk)).join(',\n')}\n]::text[],'')`;
const boundedReplacementSQL=(functions,from,to)=>replacementSQL(functions,from,to,sqlText);
export const CONTROL_TABLES=Object.freeze(['private.sandbox_cashout_control','private.sandbox_cashout_qualifications','private.creator_cashout_provider_qualifications','private.creator_connect_live_observation_policy','public.monetization_system_settings']);
const historyHashSQL=(exclude=[])=>`(select ${hashSQL("coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]')")} from supabase_migrations.schema_migrations ${exclude.length?`where version not in (${exclude.map(literal).join(',')})`:''})`;
const metadataSQL=`jsonb_build_object('acl',p.proacl::text,'cost',p.procost,'kind',p.prokind,'rows',p.prorows,
 'owner',p.proowner::regrole::text,'result',pg_get_function_result(p.oid),'strict',p.proisstrict,'support',p.prosupport::regproc::text,
 'argModes',p.proargmodes,'argNames',p.proargnames,'language',l.lanname,'parallel',p.proparallel,'leakproof',p.proleakproof,
 'proconfig',p.proconfig,'volatility',p.provolatile,'argDefaults',pg_get_expr(p.proargdefaults,0),
 'securityDefiner',p.prosecdef,'identityArguments',pg_get_function_identity_arguments(p.oid))`;
export function functionStateSQL(bundle,phase){
 check(['original','bridge'].includes(phase),'FUNCTION_PHASE_INVALID');
 return `jsonb_array_length(cutover_functions)=${bundle.functions.length}
 and (select count(distinct f.value->>'signature')=${bundle.functions.length} from jsonb_array_elements(cutover_functions) f)
 and not exists(select 1 from jsonb_array_elements(cutover_functions) f
 left join pg_proc p on p.oid=to_regprocedure(f.value->>'signature') left join pg_language l on l.oid=p.prolang
 where (p.oid is not null and ${hashSQL('pg_get_functiondef(p.oid)')}=f.value->>${literal(phase+'Sha256')}
 and ${metadataSQL}=f.value->'metadata') is not true)`;
}
const triggerCountSQL=`(select count(*) from pg_trigger where tgname=${literal(BRIDGE_TRIGGER)})`;
const bridgeAbsentSQL=`to_regprocedure(${literal(BRIDGE_FUNCTION)}) is null and ${triggerCountSQL}=0`;
function bridgePresentSQL(bundle){return `exists(select 1 from pg_proc p where p.oid=to_regprocedure(${literal(BRIDGE_FUNCTION)})
 and p.proowner::regrole::text='postgres' and p.proacl::text='{postgres=X/postgres}' and not p.prosecdef
 and p.provolatile='v' and p.proconfig=array['search_path=""']::text[]
 and p.prosrc=E'\\nbegin\\n raise exception ''automatic_commerce_cutover_retry'' using errcode=''55P03'';\\nend\\n')
 and ${triggerCountSQL}=${bundle.plan.authorityRelations.length}
 and ${bundle.plan.authorityRelations.map(t=>`exists(select 1 from pg_trigger where tgrelid=to_regclass(${literal(t)}) and tgname=${literal(BRIDGE_TRIGGER)} and tgfoid=to_regprocedure(${literal(BRIDGE_FUNCTION)}) and tgtype=30 and tgenabled='O' and not tgisinternal and tgconstraint=0 and tgnargs=0 and tgqual is null)`).join(' and\n ')}`;}
const tableDataHash=(table,order)=>`(select ${hashSQL(`coalesce(jsonb_agg(to_jsonb(t) order by ${order})::text,'[]')`)} from ${table} t)`;
function controlsSQL(bundle){const c=bundle.plan.controls;return `${tableDataHash('public.platform_money_kill_switches','key')}=${literal(c.moneySwitchesSha256)}
 and ${tableDataHash('private.sandbox_cashout_control','singleton')}=${literal(c.sandboxCashoutControlSha256)}
 and ${tableDataHash('public.monetization_system_settings','id')}=${literal(c.monetizationSettingsSha256)}
 and (select count(*)=1 and bool_and(id and not premium_purchase_enabled and not paid_content_checkout_enabled and not creator_pricing_enabled
 and not tips_enabled and not merch_store_enabled and not cashout_enabled and not payouts_enabled and not stripe_connect_production_enabled and not live_money_enabled) from public.monetization_system_settings)
 and (select count(*)=3 and bool_and(state='off') from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled','cashout_enabled'))
 and (select count(*)=1 and bool_and(not enabled) from private.sandbox_cashout_control)
 and (select count(*)=0 from private.sandbox_cashout_qualifications)
 and (select count(*)=0 from private.creator_cashout_provider_qualifications)
 and (select count(*)=0 from private.creator_connect_live_observation_policy)`;}
const temporaryKeys=bundle=>[`function:${BRIDGE_FUNCTION}`,...bundle.plan.authorityRelations.map(t=>`trigger:${t}.${BRIDGE_TRIGGER}`)];
const versions=bundle=>bundle.migrations.map(m=>m.version);
const exactOriginalHistorySQL=bundle=>`${historyHashSQL(versions(bundle))}=${literal(bundle.plan.history.sha256)}`;
const noTargetHistorySQL=bundle=>`not exists(select 1 from supabase_migrations.schema_migrations where version in (${versions(bundle).map(literal).join(',')}))`;
export const exactFinalHistorySQL=bundle=>`jsonb_array_length(cutover_migrations)=${bundle.migrations.length}
 and (select count(distinct m.version)=${bundle.migrations.length} from jsonb_to_recordset(cutover_migrations) m(version text))
 and not exists(select 1 from jsonb_to_recordset(cutover_migrations) m(version text,name text,source text)
 left join supabase_migrations.schema_migrations h on h.version=m.version
 where (h.version is not null and h.name=m.name and h.statements=array[m.source]::text[]) is not true)`;
const baselineHistorySQL=bundle=>`${exactOriginalHistorySQL(bundle)} and ${noTargetHistorySQL(bundle)} and (select count(*)=${bundle.plan.history.count} and max(version)=${literal(bundle.plan.history.maxVersion)} from supabase_migrations.schema_migrations)`;

export function loadBundle(readSource,definitions,plan=contract){
 check(plan.schema===1&&plan.project===PROJECT&&plan.applicationSource==='abed523a21535d7854b3dbad51f1aa8b70bdb17d'&&plan.migrations?.length===13,'CONTRACT_IDENTITY_INVALID');
 check(plan.forwardCorrection?.version==='20261106170725'&&plan.forwardCorrection.sha256==='cf5bd9c7014e9812af03b737f3e87b892862bb76b5ac2ec079bdbc08f6468d28'&&plan.migrations.at(-1).sha256===plan.forwardCorrection.sha256,'FORWARD_CORRECTION_REQUIRED');
 check(Array.isArray(definitions)&&Array.isArray(plan.functions)&&plan.functions.length===407,'BASELINE_DEFINITIONS_REQUIRED');
 check(plan.history.count===586&&plan.history.maxVersion==='20261104032615'&&checkHash(plan.history.sha256),'HISTORY_CONTRACT_INVALID');
 check(plan.authorityRelations.length===15&&new Set(plan.authorityRelations).size===15,'AUTHORITY_SCOPE_INVALID');plan.authorityRelations.forEach(safeRelation);
 const byHash=new Map(definitions.filter(f=>typeof f.definition==='string').map(f=>[sha256(f.definition),f.definition]));
 const functions=plan.functions.map(f=>{const source=byHash.get(f.originalSha256);check(source,'BASELINE_DEFINITION_BYTES_MISSING');const bridge=bridgeDefinition(source);
  check(sha256(bridge)===f.bridgeSha256&&restoreDefinition(bridge)===source,'BRIDGE_TRANSFORM_MISMATCH');return{...f,original:{definition:source,sha256:f.originalSha256},bridge:{definition:bridge,sha256:f.bridgeSha256}};});
 check(new Set(functions.map(f=>f.signature)).size===functions.length,'DUPLICATE_FUNCTION_SIGNATURE');
 const migrations=plan.migrations.map((m,i)=>{check(/^20261106\d{6}$/u.test(m.version)&&m.path===`supabase/migrations/${m.version}_${m.name}.sql`&&(i===0||m.version>plan.migrations[i-1].version),'MIGRATION_ORDER_INVALID');
  const source=readSource(m.path);check(typeof source==='string'&&sha256(source)===m.sha256&&Buffer.byteLength(source)===m.bytes,'MIGRATION_SOURCE_CHANGED');
  if(m.topLevelWrapper)check(source.startsWith('begin;\n')&&source.endsWith('commit;\n'),'TOP_LEVEL_WRAPPER_CHANGED');
  const body=m.topLevelWrapper?source.slice(7,-8):source;check(sha256(body)===m.bodySha256&&Buffer.byteLength(body)===m.bodyBytes,'MIGRATION_TRANSFORM_CHANGED');return{...m,source,body};});
 return {plan,functions,migrations};
}
export function requireQualification(bundle){const q=bundle.plan.qualification,c=bundle.plan.catalog;
 check(q.status==='qualified','CUTOVER_NOT_QUALIFIED');
 for(const name of ['nativeSemantics','fullNativeReplay','independentReview'])check(q[name]?.status==='passed'&&checkHash(q[name]?.artifactSha256),'CUTOVER_QUALIFICATION_INCOMPLETE');
 check(c&&Array.isArray(c.affectedKeys)&&c.affectedKeys.length>bundle.functions.length&&checkHash(c.finalSha256)&&checkHash(c.originalSha256)&&checkHash(c.bridgeSha256)&&checkHash(c.untouchedSha256),'CATALOG_CONTRACT_REQUIRED');
 check(q.closure?.status==='passed'&&checkHash(q.closure.artifactSha256),'ENTRY_CLOSURE_UNQUALIFIED');
}
export const functionConstants=bundle=>bundle.functions.map(f=>({signature:f.signature,originalSha256:f.original.sha256,bridgeSha256:f.bridge.sha256,metadata:f.metadata}));
export const migrationConstants=bundle=>bundle.migrations.map(m=>({version:m.version,name:m.name,source:m.source,source_sha256:m.sha256,source_bytes:m.bytes,body_sha256:m.bodySha256,body_bytes:m.bodyBytes,strip_wrapper:m.topLevelWrapper}));
export function expectedConstants(bundle,includeMigrations=true){return {
 functions:JSON.stringify(functionConstants(bundle)),
 keys:JSON.stringify({affected:bundle.plan.catalog.affectedKeys,temporary:temporaryKeys(bundle)}),
 ...(includeMigrations?{migrations:JSON.stringify(migrationConstants(bundle))}:{})
};}
function constantsSQL(bundle,includeMigrations){return Object.entries(expectedConstants(bundle,includeMigrations)).map(([key,value])=>`${hashSQL(`cutover_${key}_source`)}=${literal(sha256(value))}`).join(' and ');}
function boundedPayload(sql){
 check(Buffer.byteLength(sql)<=MAX_PAYLOAD_BYTES,'CUTOVER_PAYLOAD_TOO_LARGE');
 check(sql.split(/\r\n|\r|\n/u).every(line=>Buffer.byteLength(line)<=MAX_PHYSICAL_LINE_BYTES),'CUTOVER_LINE_TOO_LARGE');return sql;
}
// Only immutable expected data is shared. Every observed catalog/history/control
// query is independently evaluated at its original pre/post-lock/DDL boundary.
function constantDeclarations(bundle,includeMigrations){return `
 ${Object.entries(expectedConstants(bundle,includeMigrations)).map(([key,value])=>`cutover_${key}_source constant text:=${sqlText(value)};`).join('\n ')}
 cutover_functions constant jsonb:=cutover_functions_source::jsonb;
 cutover_affected_keys constant text[]:=array(select jsonb_array_elements_text(cutover_keys_source::jsonb->'affected'));
 cutover_ignored_keys constant text[]:=cutover_affected_keys||array(select jsonb_array_elements_text(cutover_keys_source::jsonb->'temporary'));
 ${includeMigrations?'cutover_migrations constant jsonb:=cutover_migrations_source::jsonb;':''}`;}
function envelope(bundle,body,includeMigrations=false){return boundedPayload(`begin isolation level read committed;set local search_path=pg_catalog,public;set local standard_conforming_strings=on;
set local lock_timeout='3s';set local statement_timeout='50s';set local idle_in_transaction_session_timeout='15s';
do $automatic_cutover$ declare untouched_before text;${constantDeclarations(bundle,includeMigrations)} begin
 if current_user<>'postgres' or current_setting('transaction_read_only')<>'off' or current_setting('session_replication_role')<>'origin' or current_setting('check_function_bodies')<>'on'
 then raise exception 'cutover_write_context_invalid';end if;
 if not pg_try_advisory_xact_lock(176214,683) then raise exception 'cutover_operation_in_progress' using errcode='55P03';end if;
 ${checkSQL(constantsSQL(bundle,includeMigrations),'cutover_expected_constants_changed')}
 ${body}
end $automatic_cutover$;notify pgrst,'reload schema';commit;\n`);}
function lockSQL(bundle,mode){return `lock table ${['supabase_migrations.schema_migrations',...bundle.plan.authorityRelations,...CONTROL_TABLES].sort().join(',')} in ${mode} mode;`;}
function checkSQL(predicate,code){return `if (${predicate}) is not true then raise exception ${literal(code)};end if;`;}
function scopeSQL(){return catalogHashSQL({includeReference:'cutover_affected_keys'});}
function untouchedSQL(){return catalogHashSQL({excludeReference:'cutover_ignored_keys'});}
function unchangedScopeSQL(bundle){return `${untouchedSQL(bundle)}=${literal(bundle.plan.catalog.untouchedSha256)}`;}
function originalScopeSQL(bundle){return `${scopeSQL(bundle)}=${literal(bundle.plan.catalog.originalSha256)}`;}
function bridgeScopeSQL(bundle){return `${scopeSQL(bundle)}=${literal(bundle.plan.catalog.bridgeSha256)}`;}
function temporaryInstallSQL(bundle){return `execute ${literal(BRIDGE_FUNCTION_SQL)};\n`+bundle.plan.authorityRelations.map(t=>`execute ${literal(`create trigger ${BRIDGE_TRIGGER} before insert or update or delete on ${safeRelation(t)} for each statement execute function ${BRIDGE_FUNCTION};`)};`).join('\n');}
function temporaryRemoveSQL(bundle){return bundle.plan.authorityRelations.map(t=>`execute ${literal(`drop trigger ${BRIDGE_TRIGGER} on ${safeRelation(t)};`)};`).join('\n')+`\nexecute ${literal(`drop function ${BRIDGE_FUNCTION};`)};`;}

export function buildBridgeSql(bundle){requireQualification(bundle);const invariant=untouchedSQL(bundle);return envelope(bundle,`
 ${lockSQL(bundle,'share row exclusive')}
 ${checkSQL(`${baselineHistorySQL(bundle)} and (${controlsSQL(bundle)}) and (${functionStateSQL(bundle,'original')}) and (${bridgeAbsentSQL}) and (${originalScopeSQL(bundle)}) and (${unchangedScopeSQL(bundle)})`,'cutover_baseline_changed')}
 untouched_before:=${invariant};
 ${temporaryInstallSQL(bundle)}
 ${boundedReplacementSQL(bundle.functions,'original','bridge')}
 ${checkSQL(`${baselineHistorySQL(bundle)} and (${controlsSQL(bundle)}) and (${functionStateSQL(bundle,'bridge')}) and (${bridgePresentSQL(bundle)}) and (${bridgeScopeSQL(bundle)}) and (${unchangedScopeSQL(bundle)}) and ${invariant}=untouched_before`,'cutover_bridge_postcheck_failed')}
 `);}

export function buildRestoreSql(bundle){requireQualification(bundle);const invariant=untouchedSQL(bundle);return envelope(bundle,`
 ${lockSQL(bundle,'share row exclusive')}
 ${checkSQL(`${baselineHistorySQL(bundle)} and (${controlsSQL(bundle)}) and (${functionStateSQL(bundle,'bridge')}) and (${bridgePresentSQL(bundle)}) and (${bridgeScopeSQL(bundle)}) and (${unchangedScopeSQL(bundle)})`,'cutover_restore_requires_exact_bridge')}
 untouched_before:=${invariant};
 ${boundedReplacementSQL(bundle.functions,'bridge','original')}
 ${temporaryRemoveSQL(bundle)}
 ${checkSQL(`${baselineHistorySQL(bundle)} and (${controlsSQL(bundle)}) and (${functionStateSQL(bundle,'original')}) and (${bridgeAbsentSQL}) and (${originalScopeSQL(bundle)}) and (${unchangedScopeSQL(bundle)}) and ${invariant}=untouched_before`,'cutover_restore_postcheck_failed')}
 `);}

export const executeMigrationsSQL=`declare migration record; migration_body text; begin
 for migration in select m.* from jsonb_array_elements(cutover_migrations) with ordinality e(value,position)
 cross join lateral jsonb_to_record(e.value)
 as m(version text,name text,source text,source_sha256 text,source_bytes integer,body_sha256 text,body_bytes integer,strip_wrapper boolean)
 order by e.position loop
  migration_body:=case when migration.strip_wrapper then substring(migration.source from 8 for char_length(migration.source)-15) else migration.source end;
  if (migration.strip_wrapper is not null and octet_length(migration.source)=migration.source_bytes
   and ${hashSQL('migration.source')}=migration.source_sha256
   and (not migration.strip_wrapper or (left(migration.source,7)=E'begin;\\n' and right(migration.source,8)=E'commit;\\n'))
   and octet_length(migration_body)=migration.body_bytes and ${hashSQL('migration_body')}=migration.body_sha256) is not true
  then raise exception 'cutover_migration_constant_changed';end if;
  execute migration_body;
  insert into supabase_migrations.schema_migrations(version,name,statements) values(migration.version,migration.name,array[migration.source]::text[]);
 end loop;
end;`;
export function buildFinalizeSql(bundle){requireQualification(bundle);const invariant=untouchedSQL(bundle);return envelope(bundle,`
 ${checkSQL(`${baselineHistorySQL(bundle)} and (${controlsSQL(bundle)}) and (${functionStateSQL(bundle,'bridge')}) and (${bridgePresentSQL(bundle)}) and (${bridgeScopeSQL(bundle)}) and (${unchangedScopeSQL(bundle)})`,'cutover_finalize_requires_exact_bridge')}
 ${DRAIN_SQL}
 ${lockSQL(bundle,'access exclusive')}
 ${checkSQL(`${baselineHistorySQL(bundle)} and (${controlsSQL(bundle)}) and (${functionStateSQL(bundle,'bridge')}) and (${bridgePresentSQL(bundle)}) and (${bridgeScopeSQL(bundle)}) and (${unchangedScopeSQL(bundle)})`,'cutover_bridge_changed_after_lock')}
 untouched_before:=${invariant};
 ${boundedReplacementSQL(bundle.functions,'bridge','original')}
 ${temporaryRemoveSQL(bundle)}
 ${checkSQL(originalScopeSQL(bundle),'cutover_original_catalog_not_restored')}
 ${executeMigrationsSQL}
 ${checkSQL(`${exactOriginalHistorySQL(bundle)} and (${exactFinalHistorySQL(bundle)}) and (select count(*)=${bundle.plan.history.count+bundle.migrations.length} and max(version)=${literal(versions(bundle).at(-1))} from supabase_migrations.schema_migrations)
 and (${controlsSQL(bundle)}) and (${bridgeAbsentSQL}) and ${scopeSQL(bundle)}=${literal(bundle.plan.catalog.finalSha256)} and (${unchangedScopeSQL(bundle)}) and ${invariant}=untouched_before
 and (select count(*)=1 and bool_and(id and not enabled and last_claimed_at is null) from private.creator_provider_observation_control)
 and (select count(*)=0 from private.creator_provider_observation_jobs)
 and (select count(*)=0 from private.creator_eligibility_declarations)`,'cutover_final_postcheck_failed')}
 `,true);}

export function readbackSql(bundle){return boundedPayload(`begin isolation level read committed read only;set local search_path=pg_catalog,public;set local standard_conforming_strings=on;
set local statement_timeout='20s';set local idle_in_transaction_session_timeout='15s';
do $cutover_readback_gate$ begin
 if current_setting('transaction_isolation')<>'read committed' or current_setting('transaction_read_only')<>'on'
 then raise exception 'cutover_readback_context_invalid';end if;
 if not pg_try_advisory_xact_lock_shared(176214,683) then raise exception 'cutover_operation_in_progress' using errcode='55P03';end if;
end $cutover_readback_gate$;
with cutover_inputs as (select ${Object.entries(expectedConstants(bundle)).map(([key,value])=>`${sqlText(value)}::text cutover_${key}_source`).join(',\n')}),
cutover_parsed as (select *,cutover_functions_source::jsonb cutover_functions,cutover_migrations_source::jsonb cutover_migrations,
 array(select jsonb_array_elements_text(cutover_keys_source::jsonb->'affected')) cutover_affected_keys from cutover_inputs),
cutover_constants as (select *,cutover_affected_keys||array(select jsonb_array_elements_text(cutover_keys_source::jsonb->'temporary')) cutover_ignored_keys from cutover_parsed)
select jsonb_build_object('schema',1,'database',current_database(),'project',${literal(PROJECT)},'constants',(${constantsSQL(bundle,true)}),
 'operationGateHeld',exists(select 1 from pg_locks where locktype='advisory' and classid=176214 and objid=683 and objsubid=2 and mode='ShareLock' and granted and pid=pg_backend_pid()
 and database=(select oid from pg_database where datname=current_database())),
 'historyCount',(select count(*) from supabase_migrations.schema_migrations),
 'originalHistory',(${exactOriginalHistorySQL(bundle)}),'baselineHistory',(${baselineHistorySQL(bundle)}),'finalHistory',(${exactFinalHistorySQL(bundle)}),
 'controls',(${controlsSQL(bundle)}),'originalFunctions',(${functionStateSQL(bundle,'original')}),'bridgeFunctions',(${functionStateSQL(bundle,'bridge')}),
 'bridgeAbsent',(${bridgeAbsentSQL}),'bridgePresent',(${bridgePresentSQL(bundle)}),
 'affectedCatalogSha256',${bundle.plan.catalog?scopeSQL(bundle):'null'},'untouchedCatalogSha256',${bundle.plan.catalog?untouchedSQL(bundle):'null'}) state from cutover_constants;commit;`);}
export function classifyState(bundle,state){
 check(state?.schema===1&&state.database==='postgres'&&state.project===PROJECT&&state.constants===true&&state.operationGateHeld===true&&state.originalHistory===true&&state.controls===true&&state.untouchedCatalogSha256===bundle.plan.catalog.untouchedSha256,'READBACK_PRECONDITION_FAILED');
 if(state.baselineHistory&&state.historyCount===586&&state.originalFunctions&&state.bridgeAbsent&&state.affectedCatalogSha256===bundle.plan.catalog.originalSha256)return 'original';
 if(state.baselineHistory&&state.historyCount===586&&state.bridgeFunctions&&state.bridgePresent&&state.affectedCatalogSha256===bundle.plan.catalog.bridgeSha256)return 'bridged';
 if(state.finalHistory&&state.historyCount===599&&state.bridgeAbsent&&state.affectedCatalogSha256===bundle.plan.catalog.finalSha256)return 'applied';
 throw Error('PARTIAL_OR_DIFFERENT_STATE_HOLD');
}

// Run only after exact final catalog/history classification, because these
// relations intentionally do not exist in the original state.
export const seedReadbackSql=`begin read only;set local statement_timeout='15s';
select jsonb_build_object('observerDisabled',(select count(*)=1 and bool_and(id and not enabled) from private.creator_provider_observation_control),
 'observationJobs',(select count(*) from private.creator_provider_observation_jobs),
 'declarations',(select count(*) from private.creator_eligibility_declarations)) state;commit;`;

export function sourceBinding(root,source){check(/^[a-f0-9]{40}$/u.test(source??''),'EXACT_TOOL_SOURCE_REQUIRED');const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
 check(git('rev-parse','HEAD').trim()===source&&git('status','--porcelain','--untracked-files=no').trim()==='','SOURCE_HEAD_OR_WORKTREE_CHANGED');
 const files=git('ls-tree','-r','--name-only',source,DIRECTORY).trim().split('\n');check(files.length>=5,'TOOL_NOT_COMMITTED');
 for(const f of files)check(fs.readFileSync(path.join(root,f),'utf8')===git('show',`${source}:${f}`),'TOOL_SOURCE_CHANGED');
 return {source,tree:git('rev-parse',`${source}^{tree}`).trim(),read:f=>git('show',`${source}:${f}`)};
}
export function prepareArguments({mode,source,captures,root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')}){check(['readback','bridge','finalize','restore'].includes(mode)&&captures.length>0,'USAGE_cli_MODE_FULL_TOOL_COMMIT_BASELINE_CAPTURE_JSON');
 const binding=sourceBinding(root,source);
 const frozen=JSON.parse(binding.read(`${DIRECTORY}/contract.json`));check(JSON.stringify(frozen)===JSON.stringify(contract),'LOADED_CONTRACT_CHANGED');
 const definitions=captures.flatMap(file=>JSON.parse(fs.readFileSync(file,'utf8'))),bundle=loadBundle(binding.read,definitions,frozen);
 const query=mode==='readback'?readbackSql(bundle):mode==='bridge'?buildBridgeSql(bundle):mode==='restore'?buildRestoreSql(bundle):buildFinalizeSql(bundle);
 return {project_id:PROJECT,query,qualificationSource:source,querySha256:sha256(query)};
}
