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
const digest='b6d07180aa97d203bda4385f8946c8bcb90bedce5f1be549914e0940d1287935';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readPinnedHistoricalSource(name){
 const expected=Object.hasOwn(lock.files,name)?lock.files[name]:supplemental[name];
 if(!expected)throw Error(`HISTORICAL_SOURCE_UNKNOWN:${name}`);
 if(lock.files[HISTORICAL_ENTRYPOINT]!==digest)throw Error('HISTORICAL_LOCK_DRIFT');
 const file=name===HISTORICAL_ENTRYPOINT?'tests/fixtures/historical-revenuecat-webhook-index.ts.txt':name;
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
  const bytes=edge&&file!==HISTORICAL_ENTRYPOINT?fs.readFileSync(path.join(root,file)):readPinnedHistoricalSource(file);
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
