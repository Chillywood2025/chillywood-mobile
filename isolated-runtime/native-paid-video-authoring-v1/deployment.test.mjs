import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifySource,allowlist,catalogCapacity,historyCapacity,snapshotReadSQL,sha} from './deployment.mjs';
import {verifyFixedArtifact,buildDeploymentEnvelope} from './deployment-envelope.mjs';
import {authoringPrivateStateModuleSQL,authoringPrivateStateReadSQL,authoringPrivateStateTables,validateAuthoringPrivateState} from './private-state-readback.mjs';
test('fixed forward artifact contains only exact operations, authoring and reader source',()=>{
 const files=verifySource();assert.equal(files.length,6);assert.equal(allowlist.changed.length,5);
 assert.ok(allowlist.changed.every(x=>x.oidMustBeRetained));assert.deepEqual(allowlist.removed,[]);
 const artifact=verifyFixedArtifact();assert.equal(artifact.activationAllowed,false);assert.equal(artifact.deploymentAllowed,false);
 assert.equal(artifact.retryAllowed,false);assert.equal(artifact.changedCount,5);
 assert.equal(fs.readFileSync(new URL('./private-state.sql',import.meta.url),'utf8'),authoringPrivateStateModuleSQL());
});
test('observation preserves actual-scale bounds and never executes runtime functions',()=>{
 assert.deepEqual(catalogCapacity,{rawRows:60000,oidRows:35000});
 assert.deepEqual(historyCapacity,{statementsPerReceipt:1024,totalStatements:20000});
 const sql=snapshotReadSQL();assert.match(sql,/begin isolation level repeatable read read only/u);
 assert.doesNotMatch(sql.replace(/^--.*$/gmu,''),/\bDO\b|\bcreate\s+(?:temporary\s+)?(?:table|function)\b|\bSET ROLE\b/iu);
 assert.match(sql,/p\.oid::text/u);assert.match(sql,/created_by,idempotency_key,statements,rollback/u);
 assert.match(sql,/limit 60001/u);assert.match(sql,/limit 35001/u);
 assert.throws(()=>buildDeploymentEnvelope({baseline:{capturedAt:'2000-01-01T00:00:00Z'},source:'0'.repeat(40)}),/fresh_observation/u);
});
test('fixed private reader validates every table and reflects occupied/active state without authority',()=>{
 const empty={protocol:'native-paid-video-authoring-private-state-v1',reader:'supabase_read_only_user',transactionReadOnly:true,
  authoringEnabled:false,templatesEnabled:false,operationsEnabled:false,reviewersActive:false,
  empty:Object.fromEntries(authoringPrivateStateTables.map(k=>[k,true])),
  bindings:{withinBounds:true,profileCount:0,templateCount:0,retirementCount:0,operationsCount:0,
   profileDefinitionsSha256:sha(''),templateDefinitionsSha256:sha(''),templateAvailabilitySha256:sha(''),
   templateRetirementsSha256:sha(''),operationsBindingSha256:null,profileMatchesGateway:false}};
 assert.equal(validateAuthoringPrivateState(empty).defaultOffAndEmptyObserved,true);
 const counts={paid_video_native_authoring_profiles:'profileCount',paid_video_native_catalog_templates:'templateCount',paid_video_native_template_retirements:'retirementCount',paid_video_operations_config:'operationsCount'};
 const occupy=key=>{const v=structuredClone(empty);v.empty[key]=false;if(counts[key])v.bindings[counts[key]]=1;if(key==='paid_video_operations_config')v.bindings.operationsBindingSha256=sha('{}');return v;};
 for(const key of authoringPrivateStateTables)assert.equal(validateAuthoringPrivateState(occupy(key)).defaultOffAndEmptyObserved,false);
 for(const [key,table] of [['authoringEnabled','paid_video_native_authoring_profiles'],['templatesEnabled','paid_video_native_catalog_templates'],['operationsEnabled','paid_video_operations_config'],['reviewersActive','paid_video_reviewers']]){
  assert.equal(validateAuthoringPrivateState({...occupy(table),[key]:true}).defaultOffAndEmptyObserved,false);
  assert.throws(()=>validateAuthoringPrivateState({...empty,[key]:'false'}));
 }
 for(const bad of [{...empty,reader:'postgres'},{...empty,transactionReadOnly:false},{...empty,raw:'private'},{...empty,empty:{}}])assert.throws(()=>validateAuthoringPrivateState(bad));
 assert.match(authoringPrivateStateReadSQL,/transaction_timeout='5s'/u);
 assert.doesNotMatch(authoringPrivateStateModuleSQL(),/select \*|jsonb_agg/iu);
 assert.throws(()=>validateAuthoringPrivateState({...empty,bindings:{...empty.bindings,withinBounds:false}}),/BOUNDS_EXCEEDED/u);
 assert.throws(()=>validateAuthoringPrivateState({...empty,bindings:{...empty.bindings,templateCount:65}}),/BINDINGS_INVALID/u);
 assert.throws(()=>validateAuthoringPrivateState({...empty,bindings:{...empty.bindings,operationsBindingSha256:'raw'}}),/BINDINGS_INVALID/u);
});
