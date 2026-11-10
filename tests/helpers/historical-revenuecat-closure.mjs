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
