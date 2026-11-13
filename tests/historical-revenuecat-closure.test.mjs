import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as ingress from '../scripts/native-ingress-exact-deploy.mjs';
import * as social from '../scripts/google-refund-tax-social-exact-deploy.mjs';
import * as observer from '../scripts/google-refund-tax-observer-exact-deploy.mjs';
import {verifyInputs} from '../scripts/google-refund-tax-observer-proof/verify-inputs.mjs';
import {collectSourceBundle} from '../ops/creator-backend-rollout/prepare-edge.mjs';
import {HISTORICAL_CONFIG,HISTORICAL_ENTRYPOINT,materializeHistoricalBundle,materializeHistoricalProofPackage,readPinnedHistoricalSource} from './helpers/historical-revenuecat-closure.mjs';
const archives=[
 {name:'supabase/functions/public-creator-video-cards/index.ts',file:'tests/fixtures/historical-public-creator-video-cards-index.ts.txt'},
 {name:'scripts/social-engagement-deployment-manifest.json',file:'tests/fixtures/historical-social-engagement-deployment-manifest.json.txt'},
 ...['commerce-known-cost-accounting','stripe-refund-tax-evidence','stripe-fee-report-evidence'].map(name=>({name:`supabase/functions/_shared/${name}.ts`,file:`tests/fixtures/historical-${name}.ts.txt`})),
 {name:'supabase/functions/_shared/creator-cashout-execution.ts',file:'tests/fixtures/historical-creator-cashout-execution.ts.txt'},
 {name:'ops/automatic-commerce-cutover/run-native.mjs',file:'tests/fixtures/historical-automatic-commerce-run-native.mjs.txt'},
 {name:'tests/helpers/sandbox-cashout-historical-deployment-fixture.mjs',file:'tests/fixtures/historical-sandbox-cashout-historical-deployment-fixture.mjs.txt'},
 {name:'tests/helpers/native-deployment-database.mjs',file:'tests/fixtures/historical-native-deployment-database.mjs.txt'},
 {name:'supabase/functions/_shared/media-download-authority.ts',file:'tests/fixtures/historical-media-download-authority.ts.txt'},
 {name:HISTORICAL_ENTRYPOINT,file:'tests/fixtures/historical-revenuecat-webhook-index.ts.txt'},
 {name:HISTORICAL_CONFIG,file:'tests/fixtures/historical-supabase-config.toml.txt'},
 ...['contract','rpc','runtime'].map(name=>({name:`supabase/functions/_shared/isolated-paid-video-${name}.ts`,file:`tests/fixtures/historical-isolated-paid-video-${name}.ts.txt`})),
];

test('current exact-deployment loaders and offline proof remain fail-closed on changed source',()=>{
 for(const tool of [ingress,social,observer])assert.throws(()=>tool.loadBundle(),/EDGE_HASH_MISMATCH|PREDECESSOR_EDGE_SOURCE_CHANGED/);
 assert.throws(()=>verifyInputs(),{message:'PROOF_SOURCE_DRIFT:ops/automatic-commerce-cutover/run-native.mjs'});
 const command=new URL('../scripts/google-refund-tax-observer-proof/generate.mjs',import.meta.url).pathname;
 const result=spawnSync(process.execPath,[command,'--offline'],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.match(result.stderr,/PROOF_SOURCE_DRIFT/);
});

test('unchanged proof verifier and offline CLI independently reject each archived source successor',async()=>{
 const proof=materializeHistoricalProofPackage(),root=new URL('../../',proof);
 const {verifyInputs:verifyHistoricalInputs}=await import(new URL('verify-inputs.mjs',proof));
 assert.doesNotThrow(()=>verifyHistoricalInputs());
 for(const {name} of archives){
  const target=new URL(name,root);
  fs.copyFileSync(new URL('../'+name,import.meta.url),target);
  assert.throws(()=>verifyHistoricalInputs(),{message:`PROOF_SOURCE_DRIFT:${name}`});
  const result=spawnSync(process.execPath,[new URL('generate.mjs',proof).pathname,'--offline'],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.equal(result.stdout,'');
  assert.ok(result.stderr.includes(`PROOF_SOURCE_DRIFT:${name}`));
  fs.writeFileSync(target,readPinnedHistoricalSource(name));
  assert.doesNotThrow(()=>verifyHistoricalInputs());
 }
});

test('historical manifests reject mutated snapshots and complete current webhook source closure',t=>{
 const current=collectSourceBundle(file=>fs.existsSync(file)?fs.readFileSync(file,'utf8'):null,HISTORICAL_ENTRYPOINT);
 for(const tool of [ingress,social,observer]){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'historical-source-mutation-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  materializeHistoricalBundle(directory,tool);
  assert.doesNotThrow(()=>tool.loadBundle(directory));
  if(tool.CLOSURE.includes(HISTORICAL_CONFIG)){
   const config=readPinnedHistoricalSource(HISTORICAL_CONFIG).toString();
   const changed=config.replace('[functions.revenuecat-webhook]\nverify_jwt = false','[functions.revenuecat-webhook]\nverify_jwt = true');
   assert.notEqual(changed,config);
   fs.writeFileSync(path.join(directory,HISTORICAL_CONFIG),changed);
   assert.throws(()=>tool.loadBundle(directory),/EDGE_JWT_MISMATCH/);
   fs.writeFileSync(path.join(directory,HISTORICAL_CONFIG),config);
   assert.doesNotThrow(()=>tool.loadBundle(directory));
  }
  fs.appendFileSync(path.join(directory,HISTORICAL_ENTRYPOINT),'\n// changed snapshot');
  assert.throws(()=>tool.loadBundle(directory),/EDGE_HASH_MISMATCH|PREDECESSOR_EDGE_SOURCE_CHANGED/);
  for(const file of current.files){fs.mkdirSync(path.dirname(path.join(directory,file.name)),{recursive:true});fs.writeFileSync(path.join(directory,file.name),file.content);}
  assert.throws(()=>tool.loadBundle(directory),/EDGE_HASH_MISMATCH|PREDECESSOR_EDGE_SOURCE_CHANGED/);
 }
});

test('snapshot archive, absence and original lock tampering are rejected without current-source fallback',async()=>{
 const proof=materializeHistoricalProofPackage(),root=new URL('../../',proof);
 for(const file of ['tests/helpers/historical-revenuecat-closure.mjs','tests/fixtures/historical-revenuecat-closure.json',...archives.map(archive=>archive.file)]){
  const target=new URL(file,root);fs.mkdirSync(path.dirname(target.pathname),{recursive:true});fs.copyFileSync(new URL('../'+file,import.meta.url),target);
 }
 const helperURL=new URL('tests/helpers/historical-revenuecat-closure.mjs',root);
 const helper=await import(helperURL);
 for(const {name,file} of archives){
  const pinned=readPinnedHistoricalSource(name),snapshot=new URL(file,root);
  assert.deepEqual(helper.readPinnedHistoricalSource(name),pinned);
  assert.deepEqual(fs.readFileSync(new URL(name,root)),pinned);
  fs.appendFileSync(snapshot,'\n# archive corruption');
  assert.throws(()=>helper.readPinnedHistoricalSource(name),{message:`HISTORICAL_SOURCE_DRIFT:${name}`});
  fs.unlinkSync(snapshot);assert.throws(()=>helper.readPinnedHistoricalSource(name),/ENOENT/);
  fs.copyFileSync(new URL('../'+name,import.meta.url),snapshot);
  assert.throws(()=>helper.readPinnedHistoricalSource(name),{message:`HISTORICAL_SOURCE_DRIFT:${name}`});
  fs.writeFileSync(snapshot,pinned);
  assert.deepEqual(helper.readPinnedHistoricalSource(name),pinned);
 }
 assert.throws(()=>helper.readPinnedHistoricalSource('unlocked-source.txt'),/HISTORICAL_SOURCE_UNKNOWN/);
 const sourceLock=new URL('source-lock.json',proof),lock=JSON.parse(fs.readFileSync(sourceLock));
 for(const {name,file} of archives)for(const mutation of ['changed','missing','repinned']){
  const changedLock=structuredClone(lock);
  if(mutation==='missing')delete changedLock.files[name];
  else if(mutation==='repinned'){
   const current=fs.readFileSync(new URL('../'+name,import.meta.url));
   fs.writeFileSync(new URL(file,root),current);
   changedLock.files[name]=createHash('sha256').update(current).digest('hex');
  }else changedLock.files[name]='0'.repeat(64);
  fs.writeFileSync(sourceLock,JSON.stringify(changedLock));
  const changed=await import(new URL(helperURL.href+'?changed-lock='+encodeURIComponent(name)+'&mutation='+mutation));
  assert.throws(()=>changed.readPinnedHistoricalSource(name),/HISTORICAL_LOCK_DRIFT/);
 }
});

test('historical proof materializes every locked source and only its locked migration inventory', () => {
 const proof=materializeHistoricalProofPackage(),root=new URL('../../',proof);
 const lock=JSON.parse(fs.readFileSync(new URL('source-lock.json',proof)));
 for(const [name,digest] of Object.entries(lock.files))
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(name,root))).digest('hex'),digest,name);
 const expected=Object.keys(lock.files).filter(name=>name.startsWith('supabase/migrations/')&&name.endsWith('.sql'))
  .map(name=>name.slice('supabase/migrations/'.length)).sort();
 assert.ok(expected.length>0);
 assert.deepEqual(fs.readdirSync(new URL('supabase/migrations/',root)).filter(name=>name.endsWith('.sql')).sort(),expected,
  'historical helpers enumerate a separate complete locked tree, never current successors');
 const current=fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(name=>name.endsWith('.sql'));
 for(const successor of current.filter(name=>!expected.includes(name)))
  assert.equal(fs.existsSync(new URL('supabase/migrations/'+successor,root)),false,successor);
});
