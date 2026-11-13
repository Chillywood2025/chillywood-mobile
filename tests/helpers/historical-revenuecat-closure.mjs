// Test-only frozen source. No deployment/qualification tool uses this reader.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as observer from '../../scripts/google-refund-tax-observer-exact-deploy.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const proof='scripts/google-refund-tax-observer-proof/';
const lock=JSON.parse(fs.readFileSync(path.join(root,proof,'source-lock.json'),'utf8'));
const supplemental=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/historical-revenuecat-closure.json'),'utf8')).files;
export const HISTORICAL_ENTRYPOINT='supabase/functions/revenuecat-webhook/index.ts';
export const HISTORICAL_CONFIG='supabase/config.toml';
const archives={
 'supabase/functions/_shared/google-refund-tax-reconciliation.ts':{file:'tests/fixtures/historical-google-refund-tax-reconciliation.ts.txt',sha256:'e2af9aa4d712d3ec7898221c4ebccb11f6d277e7ee10af0a14ac410f2862f730'},
 'supabase/functions/_shared/stripe-history-checkpoint.ts':{file:'tests/fixtures/historical-stripe-history-checkpoint.ts.txt',sha256:'8d9bf829a7d8dc88cc838ee51bacc8cccb9b7820f5cae2c8eba849e4c404b243'},
 'supabase/functions/google-play-external-reporter/index.ts':{file:'tests/fixtures/historical-google-play-external-reporter-index.ts.txt',sha256:'ea1bdbf135a4144f4a3fb05621ca59d1568245e7ee83b5ac59a3de85c91ab4c5'},
 'tests/helpers/pure-typescript-module.mjs':{file:'tests/fixtures/historical-pure-typescript-module.mjs.txt',sha256:'c77907372ff881ed8b198eb048f4591d21b57887ee1d3050c091f505d0fe0e5a'},
 'supabase/functions/public-creator-video-cards/index.ts':{file:'tests/fixtures/historical-public-creator-video-cards-index.ts.txt',sha256:'7bb50f113dfa82441a3903ff2f42bb93de318375478f7b532ea94a829eb5e959'},
 'scripts/social-engagement-deployment-manifest.json':{file:'tests/fixtures/historical-social-engagement-deployment-manifest.json.txt',sha256:'7d4cacdf5c09b286ff0595be61a521cef349479082594653fbbde1c62c51adc4'},
 'supabase/functions/_shared/commerce-known-cost-accounting.ts':{file:'tests/fixtures/historical-commerce-known-cost-accounting.ts.txt',sha256:'e18102bc2f2abe5d76a122fa36da606963641e559fb08809c84867c135f98bcb'},
 'supabase/functions/_shared/stripe-refund-tax-evidence.ts':{file:'tests/fixtures/historical-stripe-refund-tax-evidence.ts.txt',sha256:'d98403ba574b48f132afd06f0ea6651fda5083bff55e747e2b8d7e8dd54f5921'},
 'supabase/functions/_shared/stripe-fee-report-evidence.ts':{file:'tests/fixtures/historical-stripe-fee-report-evidence.ts.txt',sha256:'0ca9f8b55382d20149cace1846a7668dee60962dcb8341a3cb156f2f23c2026e'},
 'supabase/functions/_shared/creator-cashout-execution.ts':{file:'tests/fixtures/historical-creator-cashout-execution.ts.txt',sha256:'cca96d7dd7d4e3a13c5a96320f97ccf766c74f9f2a96bd7509037a2fd09ad715'},
 'ops/automatic-commerce-cutover/run-native.mjs':{file:'tests/fixtures/historical-automatic-commerce-run-native.mjs.txt',sha256:'b33b9e1709205f0a277a6e94fd3c472da80b7c01fb4ee2fa4d31571dd4a74d63'},
 'tests/helpers/sandbox-cashout-historical-deployment-fixture.mjs':{file:'tests/fixtures/historical-sandbox-cashout-historical-deployment-fixture.mjs.txt',sha256:'d08119fa635aeda412a6e40922904d4bb6446c582e594e9bcc115afe5bd0034a'},
 'tests/helpers/native-deployment-database.mjs':{file:'tests/fixtures/historical-native-deployment-database.mjs.txt',sha256:'edd13e10dcbf52a8ca100770a027298da3f073d8e8771b7e01a79ef409d15c7a'},
 'supabase/functions/_shared/media-download-authority.ts':{file:'tests/fixtures/historical-media-download-authority.ts.txt',sha256:'268ddef29ebcb54a793eecd19e94ab616849455fcf55ed7892ecea1babfcd24e'},
 [HISTORICAL_ENTRYPOINT]:{file:'tests/fixtures/historical-revenuecat-webhook-index.ts.txt',sha256:'b6d07180aa97d203bda4385f8946c8bcb90bedce5f1be549914e0940d1287935'},
 [HISTORICAL_CONFIG]:{file:'tests/fixtures/historical-supabase-config.toml.txt',sha256:'ebcc4972b4fc1497241222cdb846f7561ecdb7690146728d6e71170829c64115'},
 'supabase/functions/_shared/isolated-paid-video-contract.ts':{file:'tests/fixtures/historical-isolated-paid-video-contract.ts.txt',sha256:'c5bd58b23512d32457efddc4e272afa67a5654370c09f2380ef6243984687ffe'},
 'supabase/functions/_shared/isolated-paid-video-rpc.ts':{file:'tests/fixtures/historical-isolated-paid-video-rpc.ts.txt',sha256:'47976601f0694393d26614f57a6ab5915542cb3ad39171dab0b5a24ecc903f2e'},
 'supabase/functions/_shared/isolated-paid-video-runtime.ts':{file:'tests/fixtures/historical-isolated-paid-video-runtime.ts.txt',sha256:'651904284540b0d23ce8f059fe066bf5676f5087c324537790d957b66198eaae'},
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readPinnedHistoricalSource(name){
 for(const [source,archive] of Object.entries(archives))if(lock.files[source]!==archive.sha256)throw Error('HISTORICAL_LOCK_DRIFT');
 const expected=Object.hasOwn(lock.files,name)?lock.files[name]:supplemental[name];
 if(!expected)throw Error(`HISTORICAL_SOURCE_UNKNOWN:${name}`);
 const file=archives[name]?.file??name;
 const bytes=fs.readFileSync(path.join(root,file));
 if(sha(bytes)!==expected)throw Error(`HISTORICAL_SOURCE_DRIFT:${name}`);
 return bytes;
}
function put(directory,file,bytes){
 fs.mkdirSync(path.dirname(path.join(directory,file)),{recursive:true});
 fs.writeFileSync(path.join(directory,file),bytes);
}
export function materializeHistoricalBundle(directory,tool){
 const manifest=JSON.parse(readPinnedHistoricalSource(tool.MANIFEST));
 const edges=Array.isArray(manifest.edge)?manifest.edge:[manifest.edge];
 const edgeFiles=[...edges.flatMap(e=>e?.files??[]),...(manifest.revenuecatSource?.files??[])];
 for(const file of new Set([...tool.CLOSURE,...edgeFiles.map(f=>f.path)])){
  // Some .mjs dependencies are pinned by the source-locked manifest, rather
  // than duplicated in source-lock.json. Both paths require the original hash.
  const edge=edgeFiles.find(f=>f.path===file);
  const bytes=edge&&!Object.hasOwn(archives,file)?fs.readFileSync(path.join(root,file)):readPinnedHistoricalSource(file);
  if(edge&&sha(bytes)!==edge.sha256)throw Error(`HISTORICAL_SOURCE_DRIFT:${file}`);
  put(directory,file,bytes);
 }
}
export function loadHistoricalBundle(tool=observer){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'historical-revenuecat-closure-'));
 try{materializeHistoricalBundle(directory,tool);return tool.loadBundle(directory);}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
}
export function materializeHistoricalProofPackage(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'historical-refund-proof-'));
 try{
  for(const file of Object.keys(lock.files))put(directory,file,readPinnedHistoricalSource(file));
  // Copy the unchanged executable package; its original verifier runs against
  // the pinned historical tree. No runtime Git/history or network dependency.
  fs.cpSync(path.join(root,proof),path.join(directory,proof),{recursive:true});
  for(const file of Object.keys(supplemental))put(directory,file,readPinnedHistoricalSource(file));
  materializeHistoricalBundle(directory,observer);
  fs.symlinkSync(path.join(root,'node_modules'),path.join(directory,'node_modules'),'dir');
  // Unlocked imported local helpers are unchanged executable test tooling.
  for(const name of ['scripts/sandbox-cashout-deployment-manifest.json'])
   put(directory,name,readPinnedHistoricalSource(name));
  process.on('exit',()=>fs.rmSync(directory,{recursive:true,force:true}));
  return pathToFileURL(path.join(directory,proof));
 }catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error;}
}
