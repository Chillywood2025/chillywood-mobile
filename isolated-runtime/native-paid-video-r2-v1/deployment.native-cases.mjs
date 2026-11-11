// Real local SQL only. Managed identities and full catalog scale are disposable.
import assert from 'node:assert/strict';
import {assertNativeFixtureHistory} from '../../tests/helpers/native-fixture-history-inventory.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {r2DeploymentFixture} from './deployment-fixture.mjs';
import {snapshotReadSQL,validateObservation,verifySource,allowlist,IDENTITY,quote,sha} from './deployment.mjs';
import {buildLocalFixtureDeploymentEnvelope,classifyLocalFixtureDeploymentOutcome,classifyDeploymentOutcome,verifyFixedArtifact} from './deployment-envelope.mjs';
import {r2PrivateStateReadSQL,validateR2PrivateState,r2PrivateStateTables} from './private-state-readback.mjs';
import {nativePrivateStateReadSQL,validateNativePrivateState} from '../native-store-sandbox-v1/private-state-readback.mjs';
import {playPrivateStateReadSQL,validatePlayPrivateState} from '../native-store-play-handoff-v1/private-state-readback.mjs';
const unchangedFields=['catalogCount','catalogSha256','retainedCount','retainedSha256','retainedOidSha256','allOidSha256','historyCount','historyMaximum','historySha256','moneyControlsSha256'];
export async function runR2DeploymentNativeCases({bin,full=false,onProgress=()=>{}}){
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'r2-forward-proof-')),cases=[];
 const f=await r2DeploymentFixture({bin,output,full,onProgress});
 try{
  const q=f.q,observe=()=>JSON.parse(q(snapshotReadSQL(),'supabase_read_only_user'));
  const reject=(sql,pattern,user='postgres')=>{const r=f.run('psql',f.args(user),sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
  const unchanged=baseline=>{const now=observe();validateObservation(now,{before:true});for(const k of unchangedFields)assert.deepEqual(now[k],baseline[k],k);assert.deepEqual(now.historyReceipts,baseline.historyReceipts);};
  verifySource();verifyFixedArtifact();
  validateNativePrivateState(JSON.parse(q(nativePrivateStateReadSQL,'supabase_read_only_user')));
  assert.equal(validatePlayPrivateState(JSON.parse(q(playPrivateStateReadSQL,'supabase_read_only_user'))).defaultOffAndEmptyObserved,true);
  const before=observe();validateObservation(before,{before:true});
  if(full){assert.ok(before.catalogCount>47000);assertNativeFixtureHistory(before,'r2');assert.equal(before.historyReceipts.find(r=>r.version==='20260824034109').statementsCount,619);}
  const packet=buildLocalFixtureDeploymentEnvelope({baseline:before,fixtureToken:f.fixtureToken});
  assert.equal(packet.sql.match(/set local transaction_timeout='25s'/gu).length,1);
  assert.equal(packet.sql.match(/set local statement_timeout='20s'/gu).length,1);
  assert.equal(packet.sql.match(/insert into supabase_migrations\.schema_migrations/gu).length,1);
  assert.equal(packet.sql.includes('-- SOURCE isolated-runtime/'),false,'Never replay original48');
  assert.equal(classifyDeploymentOutcome({before,after:before,packet}).status,'outcome_unknown');
  reject(packet.sql.replaceAll(f.fixtureToken,randomUUID()),/r2_local_fixture_required/u);
  cases.push('Exact original48/shared/Play/Studio predecessors; genuine reader and bounded complete catalog; local token cannot confer target authority.');
  assert.equal(allowlist.changed.some(x=>JSON.parse(x.key)[0]==='schema'),false);
  assert.equal(allowlist.added.filter(x=>JSON.parse(x.key)[0]==='schemaPrivilege').length,2);
  cases.push('Two exact owner-issued non-grantable USAGE facts are added while every prior shared-schema ACL and owner remains retained.');
  for(const [column,value] of [['created_by',"'fixture-author'"],['idempotency_key',"'fixture-idempotency'"],['rollback',"array['fixture rollback']::text[]"]]){
   q(`update supabase_migrations.schema_migrations set ${column}=${value} where version='20261109151349';`);
   reject(packet.sql,/r2_target_baseline_changed/u);
   q(`update supabase_migrations.schema_migrations set ${column}=null where version='20261109151349';`);
  }
  reject(packet.sql.replace('-- History triggers may alter state:',"update supabase_migrations.schema_migrations set created_by='unexpected',idempotency_key='unexpected',rollback=array['unexpected'] where version='20261109151349';\n-- History triggers may alter state:"),/r2_exact_history_receipt_mismatch/u);
  unchanged(before);cases.push('All existing history columns are bound before DDL and revalidated after exact receipt insertion.');
  const afterSource='-- Original source checks run after owner SET/INHERIT and schema CREATE restoration.';
  for(const change of [
   'grant create on schema public to sbx_v1_r2_gateway;',
   'grant usage on schema public to sbx_v1_r2_gateway with grant option;',
   'grant usage on schema public to sbx_v1_operator with grant option;grant sbx_v1_operator to postgres with inherit false,set true;set local role sbx_v1_operator;grant usage on schema public to sbx_v1_r2_gateway;reset role;grant sbx_v1_operator to postgres with inherit false,set false;',
  ]){reject(packet.sql.replace(afterSource,change+'\n'+afterSource),/r2_exact_catalog_mismatch/u);unchanged(before);}
  cases.push('Additional CREATE, grant option and wrong-grantor schema grants remain visible, abort atomically and cannot hide in the two fixed USAGE facts.');
  for(const [key,wrong] of [['catalogSha256','0'.repeat(64)],['allOidSha256','0'.repeat(64)],['moneyControlsSha256','0'.repeat(64)]]){
   reject(buildLocalFixtureDeploymentEnvelope({baseline:{...before,[key]:wrong},fixtureToken:f.fixtureToken}).sql,/r2_target_baseline_changed/u);
  }
  q("update sandbox_commerce_v1.lifecycle set state='active' where singleton;");
  reject(packet.sql,/authoring_control_not_disabled:lifecycle/u);
  q("update sandbox_commerce_v1.lifecycle set state='disabled' where singleton;");
  cases.push('Stale catalog/OID/money baselines and active generation controls abort before forward source.');
  const marker='drop table r2_forward_before;';
  reject(packet.sql.replace(marker,"do $$begin raise exception 'fixture_late_failure';end$$;\n"+marker),/fixture_late_failure/u);
  unchanged(before);cases.push('Forced late failure rolls back every new table, function, trigger, privilege and migration receipt.');
  const started=performance.now();q(packet.sql,'postgres');const wallMs=Math.round(performance.now()-started);
  assert.ok(wallMs<25000);const after=observe();validateObservation(after);
  assert.equal(after.catalogCount,before.catalogCount+allowlist.added.length);assert.equal(after.afterChangedExact,true);assert.equal(after.addedExact,true);
  for(const key of ['retainedCount','retainedSha256','retainedOidSha256','moneyControlsSha256'])assert.equal(after[key],before[key],key);
  assert.equal(after.historyCount,before.historyCount+1);
  assert.deepEqual(after.historyReceipts.filter(r=>r.version!==IDENTITY.version),before.historyReceipts);
  assert.equal(classifyLocalFixtureDeploymentOutcome({before,after,packet}).status,'exact_source_receipt_observed_committed_install_state_only');
  reject(packet.sql,/r2_target_baseline_changed/u);
  onProgress({phase:'forward-committed-local-only',full,catalogBefore:before.catalogCount,catalogAfter:after.catalogCount,historyBefore:before.historyCount,wallMs});
  cases.push('Exact forward source commits once within original 20s/25s guards; all retained OIDs and complete 12/14-digit history survive.');
  const read=()=>JSON.parse(q(r2PrivateStateReadSQL,'supabase_read_only_user'));
  assert.equal(validateR2PrivateState(read()).defaultOffAndEmptyObserved,true);
  for(const role of ['anon','authenticated','service_role','postgres','sbx_v1_r2_gateway','sbx_v1_r2_scanner']){
   assert.equal(q(`select has_function_privilege(${quote(role)},'public.native_paid_video_r2_private_state_v1()','EXECUTE');`),'f');
   reject(`set role ${role};select public.native_paid_video_r2_private_state_v1();`,/permission denied/u,'fixture_admin');
  }
  for(const table of r2PrivateStateTables){
   assert.equal(q(`select has_table_privilege('supabase_read_only_user','sandbox_commerce_v1.${table}','SELECT');`),'f');
   reject(`select * from sandbox_commerce_v1.${table};`,/permission denied/u,'supabase_read_only_user');
  }
  reject(r2PrivateStateReadSQL.replace(' read only',' read write'),/r2_private_read_context_required/u,'supabase_read_only_user');
  reject(r2PrivateStateReadSQL.replaceAll("'5s'","'6s'"),/r2_private_read_context_required/u,'supabase_read_only_user');
  reject(r2PrivateStateReadSQL.replace('repeatable read','read committed'),/r2_private_read_context_required/u,'supabase_read_only_user');
  assert.equal(q("select has_function_privilege('service_role','public.isolated_paid_video_worker_v1(text,uuid,uuid,text,text)','EXECUTE') or has_function_privilege('sbx_v1_operator','sandbox_commerce_v1.paid_video_moderate(uuid,text,text)','EXECUTE');"),'f');
  assert.equal(q("select has_function_privilege('service_role','public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb)','EXECUTE') or has_function_privilege('service_role','public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text)','EXECUTE');"),'f');
  assert.equal(q("select has_function_privilege('sbx_v1_r2_gateway','public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb)','EXECUTE') and has_function_privilege('sbx_v1_r2_scanner','public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text)','EXECUTE');"),'t');
  cases.push('Fixed reader is genuine-session read-only only; six R2 tables remain private; legacy worker/operator grants stay closed.');
  const profile=randomUUID(),route=randomUUID(),worker=randomUUID(),verifier=randomUUID(),keyId=randomUUID();
  const gatewayKey=randomBytes(32).toString('hex'),workerKey=randomBytes(32).toString('hex'),verifierKey=randomBytes(32).toString('hex');
  q(`insert into sandbox_commerce_v1.paid_video_routes values('${route}','cloudflare_r2','synthetic-reader-r2',repeat('1',64),true);
   insert into sandbox_commerce_v1.paid_video_workers values('${worker}',decode('${workerKey}','hex'),repeat('2',64),true);
   insert into sandbox_commerce_v1.paid_video_verifiers values('${verifier}',decode('${verifierKey}','hex'),repeat('3',64),true);
   insert into sandbox_commerce_v1.r2_profiles values('${profile}','8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0','${route}','${worker}','${verifier}','${keyId}',decode('${gatewayKey}','hex'),repeat('4',64),repeat('c',64),16777216,false);`);
  const occupied=read();assert.equal(occupied.empty.r2_profiles,false);assert.equal(occupied.profileEnabled,false);assert.equal(occupied.metadata.profileBindingsCurrent,true);
  assert.equal(validateR2PrivateState(occupied).defaultOffAndEmptyObserved,false);
  const hashRows=(table,omit)=>sha(JSON.parse(q(`select jsonb_agg((to_jsonb(t)${omit.map(x=>`-'${x}'`).join('')})::text) from sandbox_commerce_v1.${table} t;`)).map(sha).sort().join(''));
  assert.equal(occupied.metadata.profileDefinitionsSha256,hashRows('r2_profiles',['gateway_key','enabled']));
  assert.equal(occupied.metadata.routeDefinitionsSha256,hashRows('paid_video_routes',['active']));
  assert.equal(occupied.metadata.workerDefinitionsSha256,hashRows('paid_video_workers',['hmac_key','active']));
  assert.equal(occupied.metadata.verifierDefinitionsSha256,hashRows('paid_video_verifiers',['hmac_key','active']));
  for(const secret of [gatewayKey,workerKey,verifierKey,profile,route,'synthetic-reader-r2'])assert.equal(JSON.stringify(occupied).includes(secret),false);
  q(`update sandbox_commerce_v1.r2_profiles set enabled=true where id='${profile}';`);
  assert.equal(read().profileEnabled,true);assert.equal(read().metadata.profileDefinitionsSha256,occupied.metadata.profileDefinitionsSha256);
  q(`update sandbox_commerce_v1.paid_video_routes set active=false where id='${route}';`);assert.equal(read().metadata.profileBindingsCurrent,false);
  q(`update sandbox_commerce_v1.paid_video_routes set active=true where id='${route}';
   insert into sandbox_commerce_v1.paid_video_workers values('${randomUUID()}',decode('${gatewayKey}','hex'),repeat('5',64),true);`);
  assert.equal(read().metadata.profileBindingsCurrent,false);
  cases.push('Occupied qualified profile/route/worker/verifier hashes match independent canonical calculations without keys or IDs; disable and key-separation mismatch are observed.');
  q(`insert into sandbox_commerce_v1.paid_video_workers select gen_random_uuid(),decode('${workerKey}','hex'),repeat('6',64),false from generate_series(1,65);`);
  const overflow=read();assert.equal(overflow.metadata.withinBounds,false);
  for(const key of ['profileDefinitionsSha256','routeDefinitionsSha256','workerDefinitionsSha256','verifierDefinitionsSha256','membershipsSha256'])assert.equal(overflow.metadata[key],null);
  assert.throws(()=>validateR2PrivateState(overflow),/BOUNDS_EXCEEDED/u);
  cases.push('Profile metadata inventory overflow rejects before aggregation with null hashes, never truncated qualification evidence.');
  return{protocol:'native-r2-forward-local-proof-v1',full,realPostgres:true,hostedQualified:false,
   catalogBefore:before.catalogCount,catalogAfter:after.catalogCount,historyBefore:before.historyCount,wallMs,cases,cleanupVerified:true};
 }finally{f.stop();fs.rmSync(output,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.deepEqual(process.argv.slice(2,3),['--local-bin']);assert.ok(process.argv.slice(4).every(x=>['--full'].includes(x)));
 console.log(JSON.stringify(await runR2DeploymentNativeCases({bin:process.argv[3],full:process.argv.includes('--full'),onProgress:x=>console.log(JSON.stringify(x))})));
 if(process.argv.includes('--full')){const {runR2BootstrapMembershipCases}=await import('./bootstrap-membership.native-cases.mjs');
  console.log(JSON.stringify(await runR2BootstrapMembershipCases({bin:process.argv[3],full:true,onProgress:x=>console.log(JSON.stringify(x))})));}
}
