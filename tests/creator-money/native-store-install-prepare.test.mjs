import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';import process from 'node:process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {nativeStoreInstallProfile} from '../../isolated-runtime/native-store-sandbox-v1/install-profile.mjs';
import {dependencyRelations,prepareSnapshot,readbackSQL,validateSnapshot} from '../../scripts/native-store-install-prepare.mjs';
const context={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
const snapshot=()=>({context,serverVersionNum:'170006',historyCount:588,historyMaximum:'20261107191000',historySha256:'a'.repeat(64),catalogSha256:'b'.repeat(64),moneyControlsSha256:'c'.repeat(64),moneyHeld:true,
 dependencies:{protocol:'native-store-install-dependencies-v1',serverVersionNum:'170006',transactionReadOnly:'on',currentUser:'supabase_read_only_user',sessionUser:'supabase_read_only_user',freshNamespaces:true,freshRoles:true,
 relations:dependencyRelations().map(relation=>({relation,present:true,postgresSelect:true,postgresMaintain:true,missingColumns:[]}))}});
test('snapshot preparation is one read-only request and never deployment qualification',async()=>{
 let calls=0;const result=await prepareSnapshot(async(sql,readOnly)=>{calls++;assert.equal(readOnly,true);assert.equal(sql,readbackSQL());return snapshot();});
 assert.equal(calls,1);assert.equal(result.status,'snapshot_observed_unqualified');assert.equal(result.deploymentAllowed,false);assert.equal(result.wrote,false);
});
test('read-only transaction under postgres is still rejected, not substituted for required identity',()=>{
 for(const patch of [{currentPostgres:true,currentReadOnly:false,sessionPostgres:true,sessionReadOnly:false},{transactionReadOnly:false},{sessionReadOnly:false,sessionAdmin:true}])assert.throws(()=>validateSnapshot({...snapshot(),context:{...context,...patch}}),/MANAGEMENT_READ_CONTEXT_MISMATCH/u);
});
test('incomplete dependencies, holds, history and schema collisions fail closed',()=>{
 for(const mutate of [s=>s.moneyHeld=false,s=>s.serverVersionNum='180000',s=>s.catalogSha256='bad',s=>s.historyCount=0,
  s=>s.dependencies.freshRoles=false,s=>s.dependencies.freshNamespaces=false,s=>s.dependencies.relations.pop(),
  s=>s.dependencies.relations[0].postgresMaintain=false,s=>s.dependencies.relations[0].missingColumns=['id']]){
  const s=snapshot();mutate(s);assert.throws(()=>validateSnapshot(s));
 }
});
test('collector preserves definitions, ACLs, memberships, default ACLs and event triggers without a write path',()=>{
 const sql=readbackSQL();for(const token of ['pg_get_functiondef','pg_default_acl','pg_auth_members','pg_event_trigger','schema_migrations','moneyControlsSha256'])assert.ok(sql.includes(token));
 assert.equal(dependencyRelations().length,21);assert.equal(/\b(?:insert|update|delete|create|alter|drop|grant|revoke)\s+(?:into|table|function|role|schema|all|execute)\b/iu.test(sql),false);
});
test('CLI rejects apply and source override switches before any transport',()=>{
 const file=new URL('../../scripts/native-store-install-prepare.mjs',import.meta.url);
 for(const args of [['--apply'],['--source','a'.repeat(40),'--apply'],['--source','a'.repeat(40),'--baseline','fixture']]){
  const result=spawnSync(process.execPath,[file.pathname,...args],{encoding:'utf8'});assert.equal(result.status,1);
  assert.deepEqual(JSON.parse(result.stderr),{status:'blocked',code:'ARGUMENT_INVALID',deploymentAllowed:false,wrote:false});
 }
});
test('source binding accepts a clean exact committed closure, rejects wrong head and tracked mutation',async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-prep-source-'));
 const prefix='isolated-runtime/native-store-sandbox-v1/';
 try{
  const files=[...new Set([...nativeStoreInstallProfile().files.map(f=>f.path),prefix+'install-profile.mjs',prefix+'install-source.json',prefix+'dependency-probe.sql',
   prefix+'install-delta.mjs',prefix+'install-delta.json',prefix+'install-atomic.mjs',prefix+'install-atomic-rows.json.gz',prefix+'install-envelope.mjs',
   'isolated-runtime/sandbox-commerce-v1/candidates/paid-video-combined-readiness/source-manifest.json','scripts/native-store-install-prepare.mjs',
   'scripts/live-room-exact-deploy.mjs','scripts/studio-rolling-deploy.mjs','package.json','package-lock.json'])];
  for(const f of files){fs.mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(dir,f));}
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q');git('add','.');git('-c','user.name=Synthetic Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Synthetic source binding fixture');const head=git('rev-parse','HEAD');
  const {sourceBinding}=await import(pathToFileURL(path.join(dir,'scripts/native-store-install-prepare.mjs')).href);
  assert.equal(sourceBinding(head).source,head);assert.equal(sourceBinding(head).modules,40);
  assert.throws(()=>sourceBinding('0'.repeat(40)),/SOURCE_HEAD_MISMATCH/u);
  fs.appendFileSync(path.join(dir,prefix+'claim.sql'),'\n-- mutation during hypothetical transport');
  assert.throws(()=>sourceBinding(head),/TRACKED_SOURCE_DIRTY/u);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
