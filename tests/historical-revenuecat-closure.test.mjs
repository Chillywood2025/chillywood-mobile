import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as ingress from '../scripts/native-ingress-exact-deploy.mjs';
import * as social from '../scripts/google-refund-tax-social-exact-deploy.mjs';
import * as observer from '../scripts/google-refund-tax-observer-exact-deploy.mjs';
import {verifyInputs} from '../scripts/google-refund-tax-observer-proof/verify-inputs.mjs';
import {collectSourceBundle} from '../ops/creator-backend-rollout/prepare-edge.mjs';
import {HISTORICAL_ENTRYPOINT,materializeHistoricalBundle,materializeHistoricalProofPackage,readPinnedHistoricalSource} from './helpers/historical-revenuecat-closure.mjs';

test('current exact-deployment loaders and offline proof remain fail-closed on changed source',()=>{
 for(const tool of [ingress,social,observer])assert.throws(()=>tool.loadBundle(),/EDGE_HASH_MISMATCH|PREDECESSOR_EDGE_SOURCE_CHANGED/);
 assert.throws(()=>verifyInputs(),/PROOF_SOURCE_DRIFT:supabase\/functions\/revenuecat-webhook\/index.ts/);
 const command=new URL('../scripts/google-refund-tax-observer-proof/generate.mjs',import.meta.url).pathname;
 const result=spawnSync(process.execPath,[command,'--offline'],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.match(result.stderr,/PROOF_SOURCE_DRIFT/);
});

test('historical manifests reject mutated snapshots and complete current webhook source closure',t=>{
 const current=collectSourceBundle(file=>fs.existsSync(file)?fs.readFileSync(file,'utf8'):null,HISTORICAL_ENTRYPOINT);
 for(const tool of [ingress,social,observer]){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'historical-source-mutation-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  materializeHistoricalBundle(directory,tool);
  assert.doesNotThrow(()=>tool.loadBundle(directory));
  fs.appendFileSync(path.join(directory,HISTORICAL_ENTRYPOINT),'\n// changed snapshot');
  assert.throws(()=>tool.loadBundle(directory),/EDGE_HASH_MISMATCH|PREDECESSOR_EDGE_SOURCE_CHANGED/);
  for(const file of current.files){fs.mkdirSync(path.dirname(path.join(directory,file.name)),{recursive:true});fs.writeFileSync(path.join(directory,file.name),file.content);}
  assert.throws(()=>tool.loadBundle(directory),/EDGE_HASH_MISMATCH|PREDECESSOR_EDGE_SOURCE_CHANGED/);
 }
});

test('snapshot archive, absence and original lock tampering are rejected without current-source fallback',async()=>{
 const proof=materializeHistoricalProofPackage(),root=new URL('../../',proof);
 for(const file of ['tests/helpers/historical-revenuecat-closure.mjs','tests/fixtures/historical-revenuecat-closure.json','tests/fixtures/historical-revenuecat-webhook-index.ts.txt']){
  const target=new URL(file,root);fs.mkdirSync(path.dirname(target.pathname),{recursive:true});fs.copyFileSync(new URL('../'+file,import.meta.url),target);
 }
 const helperURL=new URL('tests/helpers/historical-revenuecat-closure.mjs',root);
 const helper=await import(helperURL);
 assert.deepEqual(helper.readPinnedHistoricalSource(HISTORICAL_ENTRYPOINT),readPinnedHistoricalSource(HISTORICAL_ENTRYPOINT));
 const snapshot=new URL('tests/fixtures/historical-revenuecat-webhook-index.ts.txt',root);
 fs.appendFileSync(snapshot,'\n// archive corruption');
 assert.throws(()=>helper.readPinnedHistoricalSource(HISTORICAL_ENTRYPOINT),/HISTORICAL_SOURCE_DRIFT/);
 fs.unlinkSync(snapshot);assert.throws(()=>helper.readPinnedHistoricalSource(HISTORICAL_ENTRYPOINT),/ENOENT/);
 const sourceLock=new URL('source-lock.json',proof),lock=JSON.parse(fs.readFileSync(sourceLock));
 lock.files[HISTORICAL_ENTRYPOINT]='0'.repeat(64);fs.writeFileSync(sourceLock,JSON.stringify(lock));
 const changed=await import(new URL(helperURL.href+'?changed-lock'));
 assert.throws(()=>changed.readPinnedHistoricalSource(HISTORICAL_ENTRYPOINT),/HISTORICAL_LOCK_DRIFT/);
});
