import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifySource,allowlist,catalogCapacity,historyCapacity,snapshotReadSQL,sha,IDENTITY,r2CreatorGrantorSQL} from './deployment.mjs';
import {verifyFixedArtifact,buildDeploymentEnvelope} from './deployment-envelope.mjs';
import {r2PrivateStateModuleSQL,r2PrivateStateReadSQL,r2PrivateStateTables,validateR2PrivateState} from './private-state-readback.mjs';
test('fixed source and CLI identity preserve installed Play and exact catalog changes',()=>{
 assert.equal(verifySource().length,4);const artifact=verifyFixedArtifact();
 assert.equal(artifact.activationAllowed,false);assert.equal(artifact.deploymentAllowed,false);assert.equal(artifact.retryAllowed,false);
 assert.deepEqual(allowlist.removed,[]);
 assert.deepEqual(allowlist.changed.filter(x=>!x.oidMustBeRetained).map(x=>JSON.parse(x.key)),[['trigger','sandbox_commerce_v1.paid_video_uploads','identity_immutable']]);
 assert.equal(allowlist.changed.some(x=>JSON.parse(x.key)[2]==='native_store_apply_effect'),false);
 assert.equal(allowlist.changed.some(x=>JSON.parse(x.key)[0]==='schema'),false);
 assert.equal(IDENTITY.version,'20261110120025');assert.equal(IDENTITY.name,'native_paid_video_r2_bounded_v1');
 assert.equal(fs.readFileSync(new URL('./private-state.sql',import.meta.url),'utf8'),r2PrivateStateModuleSQL());
});
test('observation preserves complete actual-scale bounds and no runtime execution',()=>{
 assert.deepEqual(catalogCapacity,{rawRows:60000,oidRows:35000});assert.deepEqual(historyCapacity,{statementsPerReceipt:1024,totalStatements:20000});
 const sql=snapshotReadSQL();assert.match(sql,/begin isolation level repeatable read read only/u);
 assert.doesNotMatch(sql.replace(/^--.*$/gmu,''),/\bDO\b|\bcreate\s+(?:temporary\s+)?(?:table|function)\b|\bSET ROLE\b/iu);
 assert.match(sql,/p\.oid::text/u);assert.match(sql,/created_by,idempotency_key,statements,rollback/u);
 assert.match(sql,/limit 60001/u);assert.match(sql,/limit 35001/u);
 assert.throws(()=>buildDeploymentEnvelope({baseline:{capturedAt:'2000-01-01T00:00:00Z'},source:'0'.repeat(40)}),/fresh_observation/u);
});
test('only exact R2 creator memberships normalize the bootstrap grantor in rows and OID keys',()=>{
 const memberships=allowlist.added.filter(x=>JSON.parse(x.key)[0]==='membership');
 assert.equal(memberships.length,2);
 for(const entry of memberships){
  const k=JSON.parse(entry.key);assert.ok(['sbx_v1_r2_gateway','sbx_v1_r2_scanner'].includes(k[1]));
  assert.deepEqual(k.slice(2),['postgres',{bootstrapSuperuserOid:10}]);
  // PostgreSQL JSONB array text uses comma-space separators.
  assert.equal(entry.rowSha256,sha(JSON.stringify([...k,true,false,false]).replaceAll(',',', ').replaceAll(':',': ')));
 }
 const sql=snapshotReadSQL();assert.equal(sql.split(r2CreatorGrantorSQL).length,3);
 assert.match(r2CreatorGrantorSQL,/m\.grantor=10/u);assert.match(r2CreatorGrantorSQL,/oid=10 and rolsuper/u);
 assert.match(r2CreatorGrantorSQL,/m\.admin_option and not m\.inherit_option and not m\.set_option/u);
 assert.match(r2CreatorGrantorSQL,/else to_jsonb\(m\.grantor::regrole::text\)/u);
 const builder=fs.readFileSync(new URL('./deployment-envelope.mjs',import.meta.url),'utf8');
 assert.match(builder,/oid=10 and rolname='fixture_admin' and rolsuper and rolcanlogin/u);
 assert.match(builder,/inet_server_addr\(\) is distinct from '127\.0\.0\.1'::inet/u);
});
test('fixed reader rejects malformed and overflowing metadata; occupied state is not activation',()=>{
 const empty={protocol:'native-paid-video-r2-private-state-v1',reader:'supabase_read_only_user',transactionReadOnly:true,profileEnabled:false,lifecycleActive:false,rolesSafe:true,
  empty:Object.fromEntries(r2PrivateStateTables.map(x=>[x,true])),metadata:{withinBounds:true,profileCount:0,routeCount:0,workerCount:0,verifierCount:0,membershipCount:2,
   profileDefinitionsSha256:sha(''),routeDefinitionsSha256:sha(''),workerDefinitionsSha256:sha(''),verifierDefinitionsSha256:sha(''),membershipsSha256:sha('membership fixture'),profileBindingsCurrent:false}};
 assert.equal(validateR2PrivateState(empty).defaultOffAndEmptyObserved,true);
 for(const key of r2PrivateStateTables){const v=structuredClone(empty);v.empty[key]=false;if(key==='r2_profiles')v.metadata.profileCount=1;assert.equal(validateR2PrivateState(v).defaultOffAndEmptyObserved,false);}
 for(const bad of [{...empty,reader:'postgres'},{...empty,transactionReadOnly:false},{...empty,rolesSafe:false},{...empty,raw:'secret'},
  {...empty,metadata:{...empty.metadata,profileCount:1}},{...empty,metadata:{...empty.metadata,workerCount:65}}])assert.throws(()=>validateR2PrivateState(bad));
 assert.throws(()=>validateR2PrivateState({...empty,metadata:{...empty.metadata,withinBounds:false}}),/BOUNDS_EXCEEDED/u);
 assert.match(r2PrivateStateReadSQL,/transaction_timeout='5s'/u);
 assert.doesNotMatch(r2PrivateStateModuleSQL(),/select \*|jsonb_agg/iu);
});
