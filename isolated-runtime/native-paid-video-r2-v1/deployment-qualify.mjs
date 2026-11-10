// Exact LOCAL source qualification. No target URL, executor or observation file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {r2DeploymentFixture} from './deployment-fixture.mjs';
import {nativeR2Source} from './source.mjs';
import {r2PrivateStateModuleSQL,r2PrivateStateTables} from './private-state-readback.mjs';
import {sha} from '../native-store-play-handoff-v1/deployment-catalog-support.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const paths=['deployment-grant.sql','source.sql','deployment-revoke.sql','private-state.sql'].map(x=>'isolated-runtime/native-paid-video-r2-v1/'+x);
export async function qualifyR2Source({bin,expectedSourceSha256,onProgress=()=>{}}){
 const source=nativeR2Source();assert.equal(source.sourceSha256,expectedSourceSha256,'Exact reviewed R2 source hash required');
 fs.writeFileSync(path.join(here,'source.sql'),source.sql);fs.writeFileSync(path.join(here,'private-state.sql'),r2PrivateStateModuleSQL());
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'r2-delta-')),f=await r2DeploymentFixture({bin,output,full:true,onProgress});
 try{
  const {normalizedCTE,readSettings}=await import('./deployment.mjs');
  const rows=()=>JSON.parse(f.q(`begin isolation level repeatable read read only;${readSettings}with ${normalizedCTE}
   select jsonb_agg(jsonb_build_object('key',k::text,'rowSha256',h) order by k::text collate "C") from measured;rollback;`,'supabase_read_only_user'));
  const extensions=paths.map(p=>{const data=fs.readFileSync(path.join(root,p));return{path:p,sha256:sha(data),bytes:data.length};});
  const before=rows();f.q(`begin isolation level repeatable read;${readSettings}${paths.map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n')}
   set constraints all immediate;commit;`,'postgres');const after=rows();
  const old=new Map(before.map(x=>[x.key,x])),next=new Map(after.map(x=>[x.key,x]));assert.equal(old.size,before.length);assert.equal(next.size,after.length);
  const added=after.filter(x=>!old.has(x.key)),removed=before.filter(x=>!next.has(x.key)),changed=after.filter(x=>old.has(x.key)&&old.get(x.key).rowSha256!==x.rowSha256)
   .map(x=>({key:x.key,beforeSha256:old.get(x.key).rowSha256,afterSha256:x.rowSha256,
    oidMustBeRetained:JSON.stringify(JSON.parse(x.key))!==JSON.stringify(['trigger','sandbox_commerce_v1.paid_video_uploads','identity_immutable'])}));
  assert.deepEqual(removed,[]);
  assert.deepEqual(added.filter(x=>JSON.parse(x.key)[0]==='schemaPrivilege').map(x=>JSON.parse(x.key)).sort(),[
   ['schemaPrivilege','public','sbx_v1_r2_gateway','USAGE'],['schemaPrivilege','public','sbx_v1_r2_scanner','USAGE']].sort());
  const functions=changed.filter(x=>JSON.parse(x.key)[0]==='function').map(x=>JSON.parse(x.key)[2]).sort();assert.deepEqual(functions,source.replacements.map(x=>x.name).sort());
  assert.deepEqual(changed.filter(x=>JSON.parse(x.key)[0]!=='function').map(x=>JSON.parse(x.key)).sort(),[
   ['column','sandbox_commerce_v1.delivery_asset_scans','object_version'],['column','sandbox_commerce_v1.delivery_assets','object_version'],
   ['trigger','sandbox_commerce_v1.paid_video_uploads','identity_immutable']].sort());
  const allowlist={added,changed,removed};
  const manifest={protocol:'native-r2-forward-source-catalog-v1',qualification:'local_source_delta_only',source:'39378202a8e677dd3c01eb71a96ab9ceb5525de3',tree:'f39edb815fa4ffeb53eff32ba85f67415fb074db',
   baseSourceDigest:'e07d2e3266789b1d5e5c9665e03245f6edf1abb43643e16b06d718ef4c77e33d',baseModules:48,r2SourceSha256:source.sourceSha256,
   predecessorFunctions:source.replacements,retainedFunctions:source.retained,predecessorSources:source.predecessors,extensions,extensionDigest:sha(JSON.stringify(extensions)),
   addedCount:added.length,changedCount:changed.length,portableDeltaSha256:sha(JSON.stringify(allowlist)),newTables:r2PrivateStateTables.map(x=>'sandbox_commerce_v1.'+x),
   qualificationCounts:{before:before.length,after:after.length},deploymentAllowed:false,activationAllowed:false,retryAllowed:false};
  fs.writeFileSync(path.join(here,'deployment-allowlist.json'),JSON.stringify(allowlist,null,2)+'\n');
  fs.writeFileSync(path.join(here,'deployment-source.json'),JSON.stringify(manifest,null,2)+'\n');
  return{added:added.length,changed:changed.length,removed:removed.length,catalogBefore:before.length,catalogAfter:after.length,sourceSha256:source.sourceSha256};
 }finally{f.stop();fs.rmSync(output,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv[2],'--local-bin');assert.equal(process.argv[4],'--source-sha');assert.equal(process.argv.length,6);
 console.log(JSON.stringify(await qualifyR2Source({bin:process.argv[3],expectedSourceSha256:process.argv[5],onProgress:x=>console.log(JSON.stringify(x))})));
}
