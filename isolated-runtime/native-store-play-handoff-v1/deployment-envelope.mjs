// Offline builder only. Explicit fixed migration identity, never apply_migration.
// Transport authorization, project identity, Git archive and administrative-DDL
// coordination are external requirements; no caller boolean grants them here.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Buffer} from 'node:buffer';
import {HERE,ROOT,PROJECT,IDENTITY,manifest,allowlist,verifySource,sha,quote,snapshotSelectSQL,snapshotReadSQL,readSettings,validateObservation,privateChecksSQL,beforeComparisonFields,historyCTE,priorHistoryDigestSQL,roleSafetySQL} from './deployment.mjs';
import {nativeStoreInstallProfile} from '../native-store-sandbox-v1/install-profile.mjs';
const json=x=>quote(JSON.stringify(x))+'::jsonb';
const fail=(ok,why)=>{if(!ok)throw Error(why);};
const equalFields=(observed,expected,fields)=>fields.map(k=>`${observed}->${quote(k)} is distinct from ${expected}->${quote(k)}`).join('\n or ');
const equalBaselineFields=(observed,baseline,fields)=>fields.map(k=>`${observed}->${quote(k)} is distinct from ${json(baseline[k])}`).join('\n or ');
const retainedFields=['database','serverStartedAt','retainedCount','retainedSha256','retainedOidSha256','moneyControlsSha256'];
const ownerGuard=`if not (${roleSafetySQL}) then raise exception 'play_role_safety_invalid';end if;
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE') or has_schema_privilege('native_store_sandbox_v1_owner','public','CREATE') or exists(select 1 from pg_auth_members m where m.member='postgres'::regrole and m.roleid in('sbx_v1_core_owner'::regrole,'native_store_sandbox_v1_owner'::regrole) and(m.set_option or m.inherit_option)) then raise exception 'play_owner_interval_leaked';end if;`;
const sourceSQL=()=>verifySource().map(f=>`-- BEGIN EXACT SOURCE ${f.path} sha256=${f.sha256}\n${f.data.toString('utf8')}-- END EXACT SOURCE ${f.path}\n`).join('\n');
const catalogChecks=(expected)=>`
 if not (observed->>'historyBoundarySafe')::boolean or not (observed->>'withinBounds')::boolean or not (observed->>'addedExact')::boolean or not (observed->>'afterChangedExact')::boolean
 or (observed->>'addedPresent')::int<>${allowlist.added.length}
 or (observed->>'catalogCount')::int<>(${expected}->>'catalogCount')::int+${allowlist.added.length}
 or (observed->>'duplicateKeys')::int<>0 or (observed->>'ambiguousACLs')::int<>0
 or not (observed->>'ownerPrivilegesRestored')::boolean or not (observed->>'moneyHeld')::boolean
 or ${equalFields('observed',expected,retainedFields)}
 then raise exception 'play_exact_catalog_mismatch';end if;`;
export function fixedDeploymentBody(){
 return `-- Fixed forward-only migration ${IDENTITY.version}_${IDENTITY.name}.
-- Transport project must independently equal ${PROJECT}; this SQL label is not proof.
-- This body runs only inside the reviewed envelope. No activation or provider changes.
do $context$ begin
 if current_database()<>'postgres' or current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off'
 or current_setting('transaction_isolation')<>'repeatable read' or current_setting('server_version_num')<>'170006'
 or current_setting('transaction_timeout')<>'25s' or current_setting('statement_timeout')<>'20s'
 then raise exception 'play_deployment_context_invalid';end if;
 ${ownerGuard}
end $context$;
create temporary table play_forward_before(state jsonb not null) on commit drop;
insert into play_forward_before ${snapshotSelectSQL()};
do $fresh$ declare observed jsonb;begin
 select state into strict observed from play_forward_before;
 if not (observed->>'historyBoundarySafe')::boolean or not (observed->>'withinBounds')::boolean or not (observed->>'beforeChangedExact')::boolean or (observed->>'addedPresent')::int<>0
 or not (observed->>'baseReceiptExact')::boolean or not (observed->>'moneyHeld')::boolean
 or (observed->>'duplicateKeys')::int<>0 or (observed->>'ambiguousACLs')::int<>0
 then raise exception 'play_deployment_not_fresh';end if;
 if (observed->>'historyMaximum')>=${quote(IDENTITY.version)} then raise exception 'play_history_order_invalid';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version=${quote(IDENTITY.version)} or name=${quote(IDENTITY.name)}) then raise exception 'play_history_collision';end if;
end $fresh$;
${privateChecksSQL()}
${sourceSQL()}
${privateChecksSQL({after:true})}
-- Original source checks run after owner SET/INHERIT and schema CREATE restoration.
set constraints all immediate;
do $catalog$ declare observed jsonb;expected jsonb;begin
 select state into strict expected from play_forward_before;
 ${snapshotSelectSQL()} into observed;
${catalogChecks('expected')}
 if ${equalFields('observed','expected',['historyCount','historyMaximum','historySha256'])} then raise exception 'play_history_changed_before_receipt';end if;
end $catalog$;
`;
}
export function sourceArtifact(){
 const sql=fixedDeploymentBody();
 return Object.freeze({protocol:'native-store-play-fixed-deployment-v1',...IDENTITY,bodySha256:sha(sql),bodyBytes:Buffer.byteLength(sql),extensionDigest:manifest.extensionDigest,addedCount:allowlist.added.length,changedCount:9,
  sourceSlices:verifySource().map(({data,...r})=>r),allowlistSha256:sha(fs.readFileSync(path.join(HERE,'deployment-allowlist.json'))),deploymentAllowed:false,activationAllowed:false,retryAllowed:false});
}
export function verifyFixedArtifact(){
 const expected=sourceArtifact(),stored=JSON.parse(fs.readFileSync(path.join(HERE,'deployment-artifact.json'),'utf8'));
 fail(JSON.stringify(expected)===JSON.stringify(stored),'play_deployment_artifact_changed');
 fail(fs.readFileSync(path.join(HERE,'deployment.sql'),'utf8')===fixedDeploymentBody(),'play_deployment_body_changed');
 return expected;
}
export function verifyCommittedDeploymentSource(source){
 fail(/^[a-f0-9]{40}$/u.test(source??''),'play_exact_source_commit_required');
 const git=(...args)=>execFileSync('git',['--no-replace-objects',...args],{cwd:ROOT,maxBuffer:32*1024*1024});
 fail(git('rev-parse','HEAD').toString().trim()===source,'play_source_head_mismatch');
 fail(git('status','--porcelain','--untracked-files=no').toString().trim()==='','play_tracked_source_dirty');
 const prefix='isolated-runtime/native-store-play-handoff-v1/';
 const seeds=['deployment.mjs','deployment-envelope.mjs','deployment-catalog-support.mjs','deployment-allowlist.json','deployment-source.json','deployment.sql','deployment-artifact.json','deployment-observe.sql','private-state-readback.mjs'].map(x=>prefix+x);
 seeds.push(...manifest.extensions.map(x=>x.path),'scripts/native-store-install-prepare.mjs','isolated-runtime/native-store-sandbox-v1/install-delta.mjs','isolated-runtime/native-store-sandbox-v1/private-state-readback.mjs',
  'isolated-runtime/native-store-sandbox-v1/install-source.json','isolated-runtime/native-store-sandbox-v1/install-delta.json','isolated-runtime/native-store-sandbox-v1/dependency-probe.sql',...nativeStoreInstallProfile().files.map(x=>x.path));
 const seen=new Set(),pending=[...seeds],files=[];
 while(pending.length){
  const name=pending.pop();if(seen.has(name))continue;seen.add(name);
  fail(!name.startsWith('..')&&!path.isAbsolute(name),'play_source_path_invalid');
  const bytes=fs.readFileSync(path.join(ROOT,name));
  fail(bytes.equals(git('show',source+':'+name)),'play_source_bytes_changed');
  files.push({path:name,sha256:sha(bytes)});
  if(name.endsWith('.mjs'))for(const match of bytes.toString('utf8').matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/gu))pending.push(path.relative(ROOT,path.resolve(ROOT,path.dirname(name),match[1])));
 }
 files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 return Object.freeze({source,tree:git('rev-parse',source+'^{tree}').toString().trim(),closureSha256:sha(JSON.stringify(files)),files});
}
export function buildDeploymentEnvelope({baseline,source}){
 const binding=verifyCommittedDeploymentSource(source);
 return Object.freeze({...assembleEnvelope(baseline),binding,localFixtureOnly:false});
}
// Deliberately separate, explicitly unqualified local test preparation. It never
// acquires a target or transport. Public preparation always verifies Git above.
export function buildLocalFixtureDeploymentEnvelope({baseline,fixtureToken}){
 fail(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(fixtureToken??''),'play_local_fixture_token_required');
 const packet=assembleEnvelope(baseline);
 const guard=`do $local_fixture_only$ declare matches boolean;begin
 if inet_server_addr() is distinct from '127.0.0.1'::inet or inet_client_addr() is distinct from '127.0.0.1'::inet
 or not exists(select 1 from pg_roles where oid=10 and rolname='fixture_admin' and rolsuper and rolcanlogin)
 or to_regclass('play_deployment_local_fixture.marker') is null then raise exception 'play_local_fixture_required';end if;
 execute 'select count(*)=1 and bool_and(token=$1) from play_deployment_local_fixture.marker' into matches using ${quote(fixtureToken)}::uuid;
 if matches is distinct from true then raise exception 'play_local_fixture_required';end if;
end $local_fixture_only$;`;
 const sql=packet.sql.replace('begin isolation level repeatable read;',()=>`begin isolation level repeatable read;\n${guard}`);
 return Object.freeze({...packet,sql,sqlSha256:sha(sql),binding:null,localFixtureOnly:true,fixtureToken});
}
function assembleEnvelope(baseline){
 validateObservation(baseline,{before:true});const artifact=verifyFixedArtifact(),body=fixedDeploymentBody();
 const expected=json(Object.fromEntries([...new Set([...beforeComparisonFields,...retainedFields])].map(k=>[k,baseline[k]])));
 fail(baseline.historyMaximum<IDENTITY.version,'play_history_order_invalid');
 fail(!baseline.historyReceipts.some(r=>r.version===IDENTITY.version||r.name===IDENTITY.name),'play_history_collision');
 // SQL literal encoding is used for the exact statement, never a reserialized
 // fixture string. The independent expected array framing is PostgreSQL's
 // array_to_json(ARRAY[body]::text[])::text, verified in local native tests.
 const statementsText=JSON.stringify([body]),receipt=Object.freeze({...IDENTITY,bodySha256:artifact.bodySha256,statementArraySha256:sha(statementsText),statementsText});
 const sql=`begin isolation level repeatable read;
${readSettings}
do $writer$ begin
 if current_database()<>'postgres' or current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off' or current_setting('server_version_num')<>'170006' then raise exception 'play_writer_invalid';end if;
 ${ownerGuard}
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-exact-install',0)) then raise exception 'play_deployment_busy';end if;
end $writer$;
lock table supabase_migrations.schema_migrations,public.platform_money_kill_switches in share row exclusive mode nowait;
do $baseline$ declare observed jsonb;begin
 ${snapshotSelectSQL()} into observed;
 if ${equalBaselineFields('observed',baseline,beforeComparisonFields)} then raise exception 'play_target_baseline_changed';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version=${quote(IDENTITY.version)} or name=${quote(IDENTITY.name)}) then raise exception 'play_history_collision';end if;
end $baseline$;
${body}
-- Exactly one manually versioned row, in the same transaction as every DDL.
insert into supabase_migrations.schema_migrations(version,name,statements)
values(${quote(IDENTITY.version)},${quote(IDENTITY.name)},array[${quote(body)}]::text[]);
-- History triggers may alter state: validate receipt, complete prior history,
-- catalog, private core state and owner restoration AFTER insertion.
${privateChecksSQL({after:true})}
set constraints all immediate;
do $final$ declare observed jsonb;begin
 ${snapshotSelectSQL()} into observed;
${catalogChecks(expected)}
 if (select count(*) from supabase_migrations.schema_migrations)<>${baseline.historyCount+1}
 or (select count(*) from supabase_migrations.schema_migrations where version=${quote(IDENTITY.version)} and name=${quote(IDENTITY.name)} and array_ndims(statements)=1 and array_lower(statements,1)=1 and cardinality(statements)=1
 and created_by is null and idempotency_key is null and rollback is null
 and statements[1]=${quote(body)} and encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex')=${quote(receipt.statementArraySha256)})<>1
 or (with ${historyCTE} select ${priorHistoryDigestSQL(IDENTITY.version)})<>${quote(baseline.historySha256)}
 then raise exception 'play_exact_history_receipt_mismatch';end if;
 ${ownerGuard}
end $final$;
drop table play_forward_before;
commit;
`;
 return Object.freeze({protocol:'native-store-play-deployment-envelope-v1',sql,sqlSha256:sha(sql),receipt,artifact,baselineSha256:sha(JSON.stringify(baseline)),targetTransportRequirement:PROJECT,deploymentAllowed:false,activationAllowed:false,retryAllowed:false});
}
function classifyOutcome({before,after,packet},localFixtureOnly){
 const result=status=>({status,retryAllowed:false,deploymentAllowed:false,activationAllowed:false,currentPrivateRuntimeState:'UNQUALIFIED'});
 try{
  validateObservation(before,{before:true});validateObservation(after);
  fail(packet?.localFixtureOnly===localFixtureOnly,'play_recovery_source_context_invalid');
  const independentlyBuilt=localFixtureOnly?buildLocalFixtureDeploymentEnvelope({baseline:before,fixtureToken:packet.fixtureToken}):buildDeploymentEnvelope({baseline:before,source:packet?.binding?.source});
  fail(packet?.sql===independentlyBuilt.sql&&packet.sqlSha256===independentlyBuilt.sqlSha256&&JSON.stringify(packet.receipt)===JSON.stringify(independentlyBuilt.receipt),'play_recovery_packet_invalid');
  fail(Date.parse(after.capturedAt)>=Date.parse(before.capturedAt),'play_recovery_observation_order');
  const unchanged=['database','serverStartedAt','catalogCount','catalogSha256','retainedCount','retainedSha256','retainedOidSha256','allOidSha256','historyCount','historyMaximum','historySha256','moneyControlsSha256'];
  if(unchanged.every(k=>before[k]===after[k])&&after.addedPresent===0&&after.beforeChangedExact===true)return result('unchanged_observed');
  fail(retainedFields.every(k=>before[k]===after[k])&&after.catalogCount===before.catalogCount+allowlist.added.length&&after.addedExact===true&&after.afterChangedExact===true,'play_recovery_catalog_invalid');
  fail(after.historyCount===before.historyCount+1,'play_recovery_history_count');
  const receipt=after.historyReceipts.filter(r=>r.version===IDENTITY.version);
  fail(receipt.length===1&&receipt[0].extraMetadataNull===true&&receipt[0].name===IDENTITY.name&&receipt[0].statementsCount===1&&receipt[0].arrayDimensions===1&&receipt[0].arrayLower===1&&receipt[0].statementArraySha256===packet.receipt.statementArraySha256&&receipt[0].statementHashes.length===1&&receipt[0].statementHashes[0]===packet.receipt.bodySha256,'play_recovery_receipt_invalid');
  fail(JSON.stringify(after.historyReceipts.filter(r=>r.version!==IDENTITY.version))===JSON.stringify(before.historyReceipts),'play_recovery_history_invalid');
  return result('exact_source_receipt_observed_committed_install_state_only');
 }catch{return result('outcome_unknown');}
}
export const classifyDeploymentOutcome=args=>classifyOutcome(args,false);
export const classifyLocalFixtureDeploymentOutcome=args=>classifyOutcome(args,true);
export function writeFixedArtifact(){
 fs.writeFileSync(path.join(HERE,'deployment.sql'),fixedDeploymentBody());
 fs.writeFileSync(path.join(HERE,'deployment-artifact.json'),JSON.stringify(sourceArtifact(),null,2)+'\n');
 fs.writeFileSync(path.join(HERE,'deployment-observe.sql'),snapshotReadSQL());
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){fail(process.argv.length===3&&process.argv[2]==='--write-artifact','offline_artifact_command_required');writeFixedArtifact();}
