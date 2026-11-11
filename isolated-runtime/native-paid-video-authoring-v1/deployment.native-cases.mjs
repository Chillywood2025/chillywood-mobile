// Real local SQL only. Managed identities and full catalog scale are disposable.
import assert from 'node:assert/strict';
import {assertNativeFixtureHistory} from '../../tests/helpers/native-fixture-history-inventory.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {authoringDeploymentFixture} from './deployment-fixture.mjs';
import {snapshotReadSQL,validateObservation,verifySource,allowlist,IDENTITY,quote,sha} from './deployment.mjs';
import {buildLocalFixtureDeploymentEnvelope,classifyLocalFixtureDeploymentOutcome,classifyDeploymentOutcome,verifyFixedArtifact} from './deployment-envelope.mjs';
import {authoringPrivateStateReadSQL,validateAuthoringPrivateState,authoringPrivateStateTables} from './private-state-readback.mjs';
import {nativePrivateStateReadSQL,validateNativePrivateState} from '../native-store-sandbox-v1/private-state-readback.mjs';
import {playPrivateStateReadSQL,validatePlayPrivateState} from '../native-store-play-handoff-v1/private-state-readback.mjs';
const unchangedFields=['catalogCount','catalogSha256','retainedCount','retainedSha256','retainedOidSha256','allOidSha256','historyCount','historyMaximum','historySha256','moneyControlsSha256'];
export async function runAuthoringDeploymentNativeCases({bin,full=false,combinedRuntime=false,onProgress=()=>{}}){
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'authoring-forward-proof-')),cases=[];
 const f=await authoringDeploymentFixture({bin,output,full,onProgress});
 try{
  const q=f.q,observe=()=>JSON.parse(q(snapshotReadSQL(),'supabase_read_only_user'));
  const reject=(sql,pattern,user='postgres')=>{const r=f.run('psql',f.args(user),sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
  const unchanged=baseline=>{const now=observe();validateObservation(now,{before:true});for(const k of unchangedFields)assert.deepEqual(now[k],baseline[k],k);assert.deepEqual(now.historyReceipts,baseline.historyReceipts);};
  verifySource();verifyFixedArtifact();
  validateNativePrivateState(JSON.parse(q(nativePrivateStateReadSQL,'supabase_read_only_user')));
  assert.equal(validatePlayPrivateState(JSON.parse(q(playPrivateStateReadSQL,'supabase_read_only_user'))).defaultOffAndEmptyObserved,true);
  const before=observe();validateObservation(before,{before:true});
  if(full){assert.ok(before.catalogCount>47000);assertNativeFixtureHistory(before,'authoring');assert.equal(before.historyReceipts.find(r=>r.version==='20260824034109').statementsCount,619);}
  const packet=buildLocalFixtureDeploymentEnvelope({baseline:before,fixtureToken:f.fixtureToken});
  assert.equal(packet.sql.match(/set local transaction_timeout='25s'/gu).length,1);
  assert.equal(packet.sql.match(/set local statement_timeout='20s'/gu).length,1);
  assert.equal(packet.sql.match(/insert into supabase_migrations\.schema_migrations/gu).length,1);
  assert.equal(packet.sql.includes('-- SOURCE isolated-runtime/'),false,'Never replay original48');
  assert.equal(classifyDeploymentOutcome({before,after:before,packet}).status,'outcome_unknown');
  reject(packet.sql.replaceAll(f.fixtureToken,randomUUID()),/authoring_local_fixture_required/u);
  cases.push('Exact original48/shared/Play predecessors; genuine reader and bounded complete catalog; local token cannot confer target authority.');
  for(const [column,value] of [['created_by',"'fixture-author'"],['idempotency_key',"'fixture-idempotency'"],['rollback',"array['fixture rollback']::text[]"]]){
   q(`update supabase_migrations.schema_migrations set ${column}=${value} where version='20261109151349';`);
   reject(packet.sql,/authoring_target_baseline_changed/u);
   q(`update supabase_migrations.schema_migrations set ${column}=null where version='20261109151349';`);
  }
  reject(packet.sql.replace('-- History triggers may alter state:',"update supabase_migrations.schema_migrations set created_by='unexpected',idempotency_key='unexpected',rollback=array['unexpected'] where version='20261109151349';\n-- History triggers may alter state:"),/authoring_exact_history_receipt_mismatch/u);
  unchanged(before);cases.push('All existing history columns are bound before DDL and revalidated after exact receipt insertion.');
  for(const [key,wrong] of [['catalogSha256','0'.repeat(64)],['allOidSha256','0'.repeat(64)],['moneyControlsSha256','0'.repeat(64)]]){
   reject(buildLocalFixtureDeploymentEnvelope({baseline:{...before,[key]:wrong},fixtureToken:f.fixtureToken}).sql,/authoring_target_baseline_changed/u);
  }
  q("update sandbox_commerce_v1.lifecycle set state='active' where singleton;");
  reject(packet.sql,/authoring_control_not_disabled:lifecycle/u);
  q("update sandbox_commerce_v1.lifecycle set state='disabled' where singleton;");
  cases.push('Stale catalog/OID/money baselines and active generation controls abort before forward source.');
  const marker='drop table authoring_forward_before;';
  reject(packet.sql.replace(marker,"do $$begin raise exception 'fixture_late_failure';end$$;\n"+marker),/fixture_late_failure/u);
  unchanged(before);cases.push('Forced late failure rolls back every new table, function, trigger, privilege and migration receipt.');
  const started=performance.now();q(packet.sql,'postgres');const wallMs=Math.round(performance.now()-started);
  assert.ok(wallMs<25000);const after=observe();validateObservation(after);
  assert.equal(after.catalogCount,before.catalogCount+allowlist.added.length);assert.equal(after.afterChangedExact,true);assert.equal(after.addedExact,true);
  for(const key of ['retainedCount','retainedSha256','retainedOidSha256','moneyControlsSha256'])assert.equal(after[key],before[key],key);
  assert.equal(after.historyCount,before.historyCount+1);
  assert.deepEqual(after.historyReceipts.filter(r=>r.version!==IDENTITY.version),before.historyReceipts);
  assert.equal(classifyLocalFixtureDeploymentOutcome({before,after,packet}).status,'exact_source_receipt_observed_committed_install_state_only');
  reject(packet.sql,/authoring_target_baseline_changed/u);
  onProgress({phase:'forward-committed-local-only',full,catalogBefore:before.catalogCount,catalogAfter:after.catalogCount,historyBefore:before.historyCount,wallMs});
  cases.push('Exact forward source commits once within original 20s/25s guards; all retained OIDs and complete 12/14-digit history survive.');
  const read=()=>JSON.parse(q(authoringPrivateStateReadSQL,'supabase_read_only_user'));
  assert.equal(validateAuthoringPrivateState(read()).defaultOffAndEmptyObserved,true);
  for(const role of ['anon','authenticated','service_role','postgres']){
   assert.equal(q(`select has_function_privilege(${quote(role)},'public.native_paid_video_authoring_private_state_v1()','EXECUTE');`),'f');
   reject(`set role ${role};select public.native_paid_video_authoring_private_state_v1();`,/permission denied/u,'fixture_admin');
  }
  for(const table of authoringPrivateStateTables){
   assert.equal(q(`select has_table_privilege('supabase_read_only_user','sandbox_commerce_v1.${table}','SELECT');`),'f');
   reject(`select * from sandbox_commerce_v1.${table};`,/permission denied/u,'supabase_read_only_user');
  }
  reject(authoringPrivateStateReadSQL.replace(' read only',' read write'),/authoring_private_read_context_required/u,'supabase_read_only_user');
  reject(authoringPrivateStateReadSQL.replaceAll("'5s'","'6s'"),/authoring_private_read_context_required/u,'supabase_read_only_user');
  reject(authoringPrivateStateReadSQL.replace('repeatable read','read committed'),/authoring_private_read_context_required/u,'supabase_read_only_user');
  assert.equal(q("select has_function_privilege('service_role','public.isolated_paid_video_worker_v1(text,uuid,uuid,text,text)','EXECUTE') or has_function_privilege('sbx_v1_operator','sandbox_commerce_v1.paid_video_moderate(uuid,text,text)','EXECUTE');"),'f');
  cases.push('Fixed reader is genuine-session read-only only; nine tables remain private; legacy worker/operator grants stay closed.');
  if(combinedRuntime){assert.equal(full,false);const {runCombinedOperationsCases}=await import('./operations-runtime.native-cases.mjs');
   const runtime=await runCombinedOperationsCases({q,h:{q,rejects:(sql,pattern)=>reject(sql,pattern,'fixture_admin')}});cases.push(...runtime.cases);
   const qualified=read(),expected=table=>sha(JSON.parse(q(`select jsonb_agg((to_jsonb(t)-'enabled')::text) from sandbox_commerce_v1.${table} t;`)).map(sha).sort().join(''));
   assert.equal(qualified.bindings.withinBounds,true);assert.equal(qualified.bindings.profileMatchesGateway,true);
   assert.equal(qualified.bindings.profileDefinitionsSha256,expected('paid_video_native_authoring_profiles'));
   assert.equal(qualified.bindings.templateDefinitionsSha256,expected('paid_video_native_catalog_templates'));
   assert.equal(qualified.bindings.operationsBindingSha256,sha(q('select binding::text from sandbox_commerce_v1.paid_video_operations_config;')));
   q("update sandbox_commerce_v1.paid_video_gateway_controls set qualification_sha256=repeat('a',64) where singleton;");
   assert.equal(read().bindings.profileMatchesGateway,false);
   q('update sandbox_commerce_v1.paid_video_gateway_controls set qualification_sha256=(select qualification_sha256 from sandbox_commerce_v1.paid_video_native_authoring_profiles) where singleton;');
   q('update sandbox_commerce_v1.paid_video_native_catalog_templates set enabled=false;');
   const disabled=read();assert.equal(disabled.bindings.templateDefinitionsSha256,qualified.bindings.templateDefinitionsSha256);
   assert.notEqual(disabled.bindings.templateAvailabilitySha256,qualified.bindings.templateAvailabilitySha256);
   q("insert into sandbox_commerce_v1.paid_video_native_template_retirements select id,revision,'synthetic retirement proof' from sandbox_commerce_v1.paid_video_native_catalog_templates limit 1;");
   const retired=read();assert.equal(retired.bindings.retirementCount,1);assert.notEqual(retired.bindings.templateAvailabilitySha256,disabled.bindings.templateAvailabilitySha256);
   assert.notEqual(retired.bindings.templateRetirementsSha256,disabled.bindings.templateRetirementsSha256);
   cases.push('Qualified profile/template/operations hashes match independently computed exact definitions; gateway mismatch, template disable and immutable retirement change only their specified readback.');
  }
  q(`insert into sandbox_commerce_v1.paid_video_operations_requests(request_id,raw,result) values('${randomUUID()}','private-synthetic-payload','{}');`);
  const occupied=read();assert.equal(occupied.empty.paid_video_operations_requests,false);
  assert.equal(validateAuthoringPrivateState(occupied).defaultOffAndEmptyObserved,false);
  assert.equal(JSON.stringify(occupied).includes('private-synthetic-payload'),false);
  cases.push('Occupied state returns false emptiness without exposing row data or claiming deployment/activation authority.');
  if(combinedRuntime){
   q('insert into sandbox_commerce_v1.paid_video_native_catalog_templates select gen_random_uuid(),t.revision,t.catalog_id,t.store,t.project_id,t.app_id,t.wire_product_id,t.qualification_sha256,false from (select * from sandbox_commerce_v1.paid_video_native_catalog_templates limit 1)t cross join generate_series(1,65);');
  }else q("insert into sandbox_commerce_v1.paid_video_operations_config(binding) values(jsonb_build_object('oversized',repeat('x',16385)));");
  const overflow=read();assert.equal(overflow.bindings.withinBounds,false);
  for(const key of ['profileDefinitionsSha256','templateDefinitionsSha256','templateAvailabilitySha256','templateRetirementsSha256','operationsBindingSha256'])assert.equal(overflow.bindings[key],null);
  assert.throws(()=>validateAuthoringPrivateState(overflow),/BOUNDS_EXCEEDED/u);
  cases.push('Private binding readback rejects overflow before hash aggregation and never accepts truncated qualification evidence.');
  return{protocol:'native-authoring-forward-local-proof-v1',full,combinedRuntime,realPostgres:true,hostedQualified:false,
   catalogBefore:before.catalogCount,catalogAfter:after.catalogCount,historyBefore:before.historyCount,wallMs,cases,cleanupVerified:true};
 }finally{f.stop();fs.rmSync(output,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.deepEqual(process.argv.slice(2,3),['--local-bin']);assert.ok(process.argv.slice(4).every(x=>['--full','--combined-runtime'].includes(x)));
 console.log(JSON.stringify(await runAuthoringDeploymentNativeCases({bin:process.argv[3],full:process.argv.includes('--full'),combinedRuntime:process.argv.includes('--combined-runtime'),onProgress:x=>console.log(JSON.stringify(x))})));
}
