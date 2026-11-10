import * as historicalTool from '../scripts/google-refund-tax-social-exact-deploy.mjs';
import {loadHistoricalBundle} from './helpers/historical-revenuecat-closure.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sha256} from '../ops/creator-backend-rollout/prepare-edge.mjs';
import {classifyProbe,classifyState,buildApplySql,deploy,requireQualified,probeSql,readbackSql,
  ORIGINAL_HISTORY,PROJECT,VERSION,NAME,HASH,MIGRATION} from '../scripts/google-refund-tax-social-exact-deploy.mjs';

const bundle=loadHistoricalBundle(historicalTool);
const context={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
const before=()=>({database:'postgres',context,originalHistorySha256:ORIGINAL_HISTORY.sha256,
  historyCount:588,historyMaximum:'20261107191000',
  targets:[...bundle.predecessors,...bundle.social].map(({version,name,statementsSha256})=>({version,name,statementsSha256})),
  addedAbsent:true,socialCatalogSha256:bundle.manifest.socialCatalogSha256,
  priorHistorySha256:'a'.repeat(64),catalogSha256:'b'.repeat(64),dataSha256:'c'.repeat(64),holds:true});
const qualified=()=>({...bundle,manifest:{...bundle.manifest,qualification:'independently_reviewed_social_successor',postPredecessorBaseline:{
  historyCount:588,historyMaximum:'20261107191000',historySha256:'a'.repeat(64),catalogSha256:'b'.repeat(64),dataSha256:'c'.repeat(64),
  socialCatalogSha256:bundle.manifest.socialCatalogSha256,observedAt:'2026-11-08T00:00:00Z',
  revenuecat:{project:PROJECT,status:'ACTIVE',name:'revenuecat-webhook',version:94,verifyJwt:false,files:bundle.revenuecatExpected.files}}}});
const after=()=>({...before(),historyCount:589,addedAbsent:false,addedCatalogSha256:bundle.manifest.addedCatalogSha256,
  targets:[...before().targets,{version:VERSION,name:NAME,statementsSha256:bundle.statementsSha256}]});

test('successor preserves immutable migration and requires full social baseline before any write',async()=>{
  assert.equal(sha256(fs.readFileSync(MIGRATION,'utf8')),HASH);
  assert.equal(bundle.manifest.postPredecessorBaseline,null);
  assert.throws(()=>requireQualified(bundle),/REQUALIFICATION_REQUIRED/);
  await assert.rejects(deploy({bundle,apply:true,query:()=>assert.fail('no transport')}),/REQUALIFICATION_REQUIRED/);
  const result=await deploy({bundle,query:async(_sql,readOnly)=>{assert.equal(readOnly,true);return before();}});
  assert.deepEqual([result.status,result.wrote,result.deployReady],['post_social_requires_independent_requalification',false,false]);
});
test('exact five predecessors and separate social catalog reject missing, duplicate and restamped history',()=>{
  assert.equal(classifyProbe(bundle,before()),'post_social_requires_independent_requalification');
  assert.equal(classifyProbe(bundle,after()),'applied_requires_full_readback');
  for(const mutation of [s=>s.targets.pop(),s=>s.targets.push(s.targets[0]),s=>s.targets[3].name='changed',
    s=>s.targets[4].statementsSha256='f'.repeat(64),s=>s.historyMaximum=VERSION,s=>s.historyCount=586,
    s=>s.originalHistorySha256='d'.repeat(64),s=>s.socialCatalogSha256='d'.repeat(64),s=>s.context.transactionReadOnly=false]){
    const state=structuredClone(before());mutation(state);assert.throws(()=>classifyProbe(bundle,state));
  }
  assert.ok(probeSql().includes('20261107173220'));assert.ok(readbackSql().includes('socialCatalogSha256'));
});
test('qualified synthetic baseline retains exact invariant, social, holds and guarded data checks',()=>{
  const q=qualified();assert.equal(classifyState(q,before()),'ready');assert.equal(classifyState(q,after()),'applied');
  for(const key of ['priorHistorySha256','catalogSha256','socialCatalogSha256','dataSha256'])assert.throws(()=>classifyState(q,{...before(),[key]:'d'.repeat(64)}));
  assert.throws(()=>classifyState(q,{...before(),holds:false}));
  assert.throws(()=>classifyState(q,{...after(),addedCatalogSha256:'d'.repeat(64)}));
  const sql=buildApplySql(q,before());assert.match(sql,/count\(\*\)=588/);assert.match(sql,/count\(\*\)=589/);
  assert.match(sql,/refund_deploy_baseline_changed/);assert.match(sql,/refund_deploy_postcheck_failed/);
  assert.equal((sql.match(/insert into supabase_migrations.schema_migrations/g)||[]).length,1);
  assert.ok(sql.includes(bundle.manifest.socialCatalogSha256));
  assert.throws(()=>buildApplySql(q,after()),/ABSENT_TARGETS/);
});
test('unknown write reconciles once without retry; no stale source or Edge prerequisite is accepted',async()=>{
  for(const final of [after(),before(),null]){
    let reads=0,writes=0;
    const q=qualified(),result=await deploy({bundle:q,apply:true,recheckSource:()=>{},verifyPrerequisiteEdge:async()=>q.manifest.postPredecessorBaseline.revenuecat,
      query:async(_sql,readOnly)=>{if(!readOnly){writes++;throw Error('lost response');}reads++;if(reads<3)return before();if(!final)throw Error('read failed');return final;}});
    assert.equal(writes,1);assert.equal(reads,3);assert.equal(result.status,final?.historyCount===589?'applied_verified':'apply_unconfirmed');
  }
  await assert.rejects(deploy({bundle:qualified(),apply:true,recheckSource:()=>{},verifyPrerequisiteEdge:async()=>({}),query:async(_sql,readOnly)=>{assert.ok(readOnly);return before();}}),/EDGE_READBACK_MISMATCH/);
});
test('live history and source observations cannot promote the pending qualification',()=>{
  assert.equal(bundle.manifest.qualification,'pending_social_successor_requalification');
  const wrong=qualified();wrong.manifest.postPredecessorBaseline.historyCount=586;assert.throws(()=>requireQualified(wrong));
  const bad=qualified();bad.manifest.postPredecessorBaseline.socialCatalogSha256='d'.repeat(64);assert.throws(()=>requireQualified(bad));
  assert.match(fs.readFileSync('scripts/google-refund-tax-social-exact-deploy.mjs','utf8'),/if\(apply\)\{requireQualified\(bundle\);throw Error\('CURRENT_PREDECESSOR_EDGE_READBACK_REQUIRED'\);\}/);
});
