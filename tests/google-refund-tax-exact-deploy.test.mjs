import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {loadHistoricalRefundBundle,materializeHistoricalRefundClosure,readHistoricalRefundSource} from './helpers/google-refund-tax-historical-deployment-fixture.mjs';
import {loadBundle,requireQualified,sourceBinding,classifyProbe,classifyState,buildApplySql,deploy,safeError,
  CLOSURE,TOOL,MANIFEST,MIGRATION,VERSION,NAME,HASH,ORIGINAL_HISTORY,PROJECT} from '../scripts/google-refund-tax-exact-deploy.mjs';

const bundle=loadHistoricalRefundBundle();
const context={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
const probe=(count=3)=>({database:'postgres',context:{...context},originalHistorySha256:ORIGINAL_HISTORY.sha256,
  historyCount:583+count,historyMaximum:count?bundle.predecessors[0].version:ORIGINAL_HISTORY.maximum,
  targets:bundle.predecessors.slice(0,count).map(({version,name,statementsSha256})=>({version,name,statementsSha256})),addedAbsent:true});
const ready=()=>({...probe(),priorHistorySha256:'a'.repeat(64),catalogSha256:'b'.repeat(64),dataSha256:'c'.repeat(64),holds:true,addedCatalogSha256:'0'.repeat(64)});
const baseline={historyCount:586,historyMaximum:bundle.predecessors[0].version,historySha256:'a'.repeat(64),catalogSha256:'b'.repeat(64),dataSha256:'c'.repeat(64),observedAt:'2026-11-04T00:00:00.000Z',
  revenuecat:{project:PROJECT,status:'ACTIVE',name:'revenuecat-webhook',version:94,verifyJwt:false,files:bundle.revenuecatExpected.files}};
const qualified=()=>({...bundle,manifest:{...bundle.manifest,qualification:'independently_reviewed_post_predecessors',postPredecessorBaseline:structuredClone(baseline)}});
const applied=()=>({...ready(),historyCount:587,historyMaximum:VERSION,addedAbsent:false,addedCatalogSha256:bundle.manifest.addedCatalogSha256,
  targets:[...probe().targets,{version:VERSION,name:NAME,statementsSha256:bundle.statementsSha256}]});

test('historical refund closure does not qualify the changed current Edge implementation',()=>{
  assert.throws(()=>loadBundle(),/EDGE_HASH_MISMATCH/);
});

test('pending production qualification cannot reach a writable or read request',async()=>{
  assert.equal(bundle.manifest.postPredecessorBaseline,null);
  assert.equal(bundle.manifest.qualification,'pending_post_predecessors');
  assert.throws(()=>requireQualified(bundle),/REQUALIFICATION_REQUIRED/);
  assert.throws(()=>classifyState(bundle,ready()),/REQUALIFICATION_REQUIRED/);
  assert.throws(()=>buildApplySql(bundle,ready()),/REQUALIFICATION_REQUIRED/);
  await assert.rejects(deploy({bundle,apply:true,query:async()=>{assert.fail('pending apply cannot request transport');}}),/REQUALIFICATION_REQUIRED/);
  for(let n=0;n<=3;n++){
    let calls=0;const result=await deploy({bundle,query:async(_sql,readOnly)=>{calls++;assert.equal(readOnly,true);return probe(n);}});
    assert.equal(calls,1);assert.equal(result.wrote,false);assert.equal(result.deployReady,false);
    assert.equal(result.status,['blocked_until_tip','blocked_until_native_ingress','blocked_until_sandbox','post_predecessors_require_independent_requalification'][n]);
  }
});

test('probe rejects skipped order, rewritten identities, unknown history and unsafe context',()=>{
  const bad=[
    {...probe(0),targets:[probe().targets[1]],historyCount:584,historyMaximum:bundle.predecessors[1].version},
    {...probe(),historyCount:585},{...probe(),historyMaximum:bundle.predecessors[1].version},
    {...probe(),originalHistorySha256:'d'.repeat(64)},{...probe(),addedAbsent:false},
    {...probe(),targets:[...probe().targets,{version:'20261102093836',name:'held_clip',statementsSha256:'a'.repeat(64)}]},
    {...probe(),targets:probe().targets.map((r,i)=>i===1?{...r,name:'restamped'}:r)},
    {...probe(),targets:probe().targets.map((r,i)=>i===2?{...r,statementsSha256:'d'.repeat(64)}:r)},
    {...probe(),context:{...context,transactionReadOnly:false}},
    {...probe(),context:{...context,currentReadOnly:false,currentPostgres:true}},
    {...probe(),context:{...context,sessionReadOnly:false,sessionPostgres:true}},
  ];
  for(const s of bad)assert.throws(()=>classifyProbe(bundle,s));
  assert.equal(classifyProbe(bundle,applied()),'applied_requires_full_readback');
  assert.throws(()=>classifyProbe(bundle,{...applied(),targets:applied().targets.map(r=>r.version===VERSION?{...r,name:'wrong'}:r)}),/REFUND_IDENTITY_MISMATCH/);
});

test('qualified snapshots require complete immutable baseline and Edge prerequisite metadata',()=>{
  const q=qualified();assert.equal(classifyState(q,ready()),'ready');assert.equal(classifyState(q,applied()),'applied');
  for(const s of [{...ready(),holds:false},{...ready(),priorHistorySha256:'d'.repeat(64)},
    {...ready(),catalogSha256:'d'.repeat(64)},{...ready(),dataSha256:'d'.repeat(64)},
    {...applied(),addedCatalogSha256:'d'.repeat(64)}])assert.throws(()=>classifyState(q,s));
  for(const patch of [{historyCount:585},{historyMaximum:VERSION},{observedAt:'invalid'},
    {revenuecat:{...baseline.revenuecat,verifyJwt:true}},{revenuecat:{...baseline.revenuecat,version:0}},
    {revenuecat:{...baseline.revenuecat,project:'wrong'}},{revenuecat:{...baseline.revenuecat,status:'INACTIVE'}},
    {revenuecat:{...baseline.revenuecat,files:baseline.revenuecat.files.slice(1)}}]){
    const bad=qualified();Object.assign(bad.manifest.postPredecessorBaseline,patch);assert.throws(()=>requireQualified(bad));
  }
  assert.throws(()=>buildApplySql(q,applied()),/APPLY_REQUIRES_ABSENT_TARGETS/);
  const sql=buildApplySql(q,ready());
  assert.equal((sql.match(/insert into supabase_migrations.schema_migrations/gu)??[]).length,1);
  assert.match(sql,/lock_timeout='5s'/);assert.match(sql,/statement_timeout='45s'/);assert.match(sql,/idle_in_transaction_session_timeout='60s'/);
  assert.match(sql,/refund_deploy_baseline_changed/);assert.match(sql,/refund_deploy_postcheck_failed/);
  assert.equal(sql.includes('deploy_edge_function'),false);assert.equal(sql.includes('20261102093836'),false);assert.equal(sql.includes('20261102094308'),false);
});

test('current exact predecessor Edge readback and clean source are mandatory before write',async()=>{
  for(const edge of [undefined,{...baseline.revenuecat,version:95},{...baseline.revenuecat,verifyJwt:true},{...baseline.revenuecat,files:[]}]){
    let calls=0;await assert.rejects(deploy({bundle:qualified(),apply:true,query:async(_sql,readOnly)=>{assert.equal(readOnly,true);return calls++?ready():probe();},
      verifyPrerequisiteEdge:edge?async()=>edge:undefined,recheckSource:()=>{}}));assert.equal(calls,2);
  }
  await assert.rejects(deploy({bundle:qualified(),apply:true,query:async(_sql,readOnly)=>{assert.equal(readOnly,true);return ready();},verifyPrerequisiteEdge:async()=>baseline.revenuecat}),/CURRENT_SOURCE_RECHECK_REQUIRED/);
  let writes=0;await assert.rejects(deploy({bundle:qualified(),apply:true,query:async(_sql,readOnly)=>{if(!readOnly)writes++;return ready();},
    verifyPrerequisiteEdge:async()=>baseline.revenuecat,recheckSource:()=>{throw Error('dirty source');}}),/dirty source/);assert.equal(writes,0);
  await assert.rejects(deploy({bundle:qualified(),apply:true,query:async(_sql,readOnly)=>{if(!readOnly)writes++;return ready();},
    verifyPrerequisiteEdge:async()=>baseline.revenuecat,recheckSource:async()=>{await new Promise(resolve=>setTimeout(resolve,10));throw Error('asynchronous dirty source');}}),/asynchronous dirty source/);assert.equal(writes,0);
});

test('uncertain write is read back once, never retried; confirmed application is idempotent',async()=>{
  for(const after of [ready(),applied(),null,{...applied(),holds:false}]){
    let calls=0,writes=0,rechecks=0,edgeReads=0;
    const result=await deploy({bundle:qualified(),apply:true,recheckSource:()=>rechecks++,verifyPrerequisiteEdge:async()=>{edgeReads++;return baseline.revenuecat;},query:async(_sql,readOnly)=>{
      calls++;if(!readOnly){writes++;throw Error('private transport detail');}
      if(calls===1)return probe();if(calls===2)return ready();if(after===null)throw Error('read failure');return after;
    }});
    assert.equal(writes,1);assert.equal(rechecks,1);assert.equal(edgeReads,1);assert.equal(calls,4);
    assert.equal(result.status,after?.historyCount===587&&after.holds?'applied_verified':'apply_unconfirmed');assert.equal(result.responseConfirmed,false);
  }
  let reads=0;const result=await deploy({bundle:qualified(),apply:true,query:async(_sql,readOnly)=>{assert.equal(readOnly,true);reads++;return applied();}});
  assert.equal(result.status,'already_applied_verified');assert.equal(reads,2);assert.equal(result.wrote,false);
});

test('historical frozen source closure, runtime JWT and argument guards cannot be bypassed',t=>{
  assert.equal(bundle.body,fs.readFileSync(MIGRATION,'utf8'));assert.equal(bundle.manifest.migration.sha256,HASH);
  assert.deepEqual(bundle.edge.map(e=>[e.name,e.verifyJwt,e.files.length]),[
    ['google-play-external-reporter',false,10],['stripe-merch-cost-reconcile',true,9],['stripe-auction-cost-reconcile',true,8]]);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'refund-exact-deploy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const files=new Set([...CLOSURE,...bundle.edge.flatMap(e=>e.files.map(f=>f.path)),...bundle.revenuecatExpected.files.map(f=>f.path)]);
  materializeHistoricalRefundClosure(dir);
  fs.symlinkSync(path.resolve('node_modules'),path.join(dir,'node_modules'),'dir');
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:'pipe'}).trim();
  git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('add',...files);git('commit','-m','synthetic source closure');
  const source=git('rev-parse','HEAD');assert.equal(sourceBinding(dir,source).source,source);
  assert.equal(loadBundle(dir,source).body,bundle.body);
  const run=args=>spawnSync(process.execPath,[TOOL,...args],{cwd:dir,env:{...process.env,SUPABASE_ACCESS_TOKEN:''},encoding:'utf8'});
  const pending=run(['--source',source,'--apply']);assert.equal(pending.status,1);assert.match(pending.stderr,/POST_PREDECESSOR_REQUALIFICATION_REQUIRED/);assert.equal(pending.stderr.includes('TOKEN'),false);
  for(const args of [['--source',source,'--baseline','any'],['--source',source,'--force'],['--source',source,'--apply','--apply']]){
    const result=run(args);assert.equal(result.status,1);assert.match(result.stderr,/ARGUMENT_INVALID/);
  }
  fs.appendFileSync(path.join(dir,MIGRATION),'\n-- changed');assert.throws(()=>sourceBinding(dir,source),/TRACKED_SOURCE_DIRTY/);assert.throws(()=>loadBundle(dir),/MIGRATION_HASH_MISMATCH/);
  fs.writeFileSync(path.join(dir,MIGRATION),bundle.body);
  for(const edge of new Set([bundle.edge[0].files[0].path,
    'supabase/functions/_shared/google-refund-tax-reconciliation.ts',
    'supabase/functions/_shared/stripe-history-checkpoint.ts',
    'supabase/functions/google-play-external-reporter/index.ts'])){
    const original=readHistoricalRefundSource(edge);
    fs.appendFileSync(path.join(dir,edge),'\n// changed');assert.throws(()=>loadBundle(dir),/EDGE_HASH_MISMATCH/);
    const current=fs.readFileSync(edge,'utf8');
    if(current!==original){fs.writeFileSync(path.join(dir,edge),current);assert.throws(()=>loadBundle(dir),/EDGE_HASH_MISMATCH/);}
    fs.writeFileSync(path.join(dir,edge),original);
  }
  const configPath=path.join(dir,'supabase/config.toml'),config=fs.readFileSync(configPath,'utf8');
  const section=/\[functions\.google-play-external-reporter\]([\s\S]*?)(?=\n\[|$)/;
  for(const changed of [
    config.replace(section,s=>s.replace(/^verify_jwt\s*=\s*false/m,'verify_jwt = true')),
    config.replace(section,s=>s.replace(/^verify_jwt\s*=\s*false/m,'# verify_jwt = false\nverify_jwt = true')),
    config.replace(section,s=>s.replace(/^verify_jwt\s*=\s*false/m,'verify_jwt = false\nverify_jwt = true')),
    config+'\n[functions.google-play-external-reporter]\nverify_jwt = false\n',
  ]){assert.notEqual(changed,config);fs.writeFileSync(configPath,changed);assert.throws(()=>loadBundle(dir),/EDGE_JWT_MISMATCH/);}
  fs.writeFileSync(configPath,config);
  const future=qualified().manifest;fs.writeFileSync(path.join(dir,MANIFEST),JSON.stringify(future,null,2)+'\n');git('add',MANIFEST);git('commit','-m','synthetic future qualification, no real evidence');
  const futureResult=run(['--source',git('rev-parse','HEAD'),'--apply']);assert.equal(futureResult.status,1);assert.match(futureResult.stderr,/CURRENT_PREDECESSOR_EDGE_READBACK_REQUIRED/);assert.equal(futureResult.stderr.includes('TOKEN'),false);
  assert.equal(safeError(Error('SECRET_DETAIL')),'GOOGLE_REFUND_DEPLOY_BLOCKED');
});
