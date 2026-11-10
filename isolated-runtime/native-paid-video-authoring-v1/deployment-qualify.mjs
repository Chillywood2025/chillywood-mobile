// Offline/source qualification only. Complete LOCAL PostgreSQL fixture only.
// No target URL, credentials, arbitrary source/body input or remote executor.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {authoringDeploymentFixture} from './deployment-fixture.mjs';
import {authoringPrivateStateModuleSQL,authoringPrivateStateTables} from './private-state-readback.mjs';
import {sha} from '../native-store-play-handoff-v1/deployment-catalog-support.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
export const extensionPaths=Object.freeze([
 'isolated-runtime/native-paid-video-authoring-v1/deployment-grant.sql',
 'ops/isolated-paid-video-operations-v2/operations.sql',
 'ops/isolated-paid-video-operations-v2/monotonic-removal.sql',
 'isolated-runtime/native-paid-video-authoring-v1/authoring.sql',
 'isolated-runtime/native-paid-video-authoring-v1/deployment-revoke.sql',
 'isolated-runtime/native-paid-video-authoring-v1/private-state.sql',
]);
export async function qualifyAuthoringSource({bin,onProgress=()=>{}}){
 assert.equal(fs.readFileSync(path.join(here,'private-state.sql'),'utf8'),authoringPrivateStateModuleSQL());
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'authoring-delta-'));
 const f=await authoringDeploymentFixture({bin,output,onProgress});
 try{
  const {normalizedCTE,readSettings}=await import('./deployment.mjs');
  const rows=()=>JSON.parse(f.q(`begin isolation level repeatable read read only;${readSettings}
   with ${normalizedCTE} select jsonb_agg(jsonb_build_object('key',k::text,'rowSha256',h) order by k::text collate "C") from measured;rollback;`,'supabase_read_only_user'));
  const extensions=extensionPaths.map(p=>{const data=fs.readFileSync(path.join(root,p));return{path:p,sha256:sha(data),bytes:data.length};});
  const before=rows();
  f.q(`begin isolation level repeatable read;${readSettings}
   ${extensionPaths.map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n')}
   set constraints all immediate;commit;`,'postgres');
  const after=rows(),old=new Map(before.map(r=>[r.key,r])),next=new Map(after.map(r=>[r.key,r]));
  assert.equal(old.size,before.length);assert.equal(next.size,after.length);
  const added=after.filter(r=>!old.has(r.key)),removed=before.filter(r=>!next.has(r.key));
  const changed=after.filter(r=>old.has(r.key)&&old.get(r.key).rowSha256!==r.rowSha256)
   .map(r=>({key:r.key,beforeSha256:old.get(r.key).rowSha256,afterSha256:r.rowSha256,oidMustBeRetained:true}));
  assert.deepEqual(removed,[]);assert.equal(changed.length,5);
  const names=changed.map(r=>JSON.parse(r.key).slice(1,3).join('.')).sort();
  assert.deepEqual(names,['public.isolated_paid_video_worker_v1','sandbox_commerce_v1.paid_video_command_v2',
   'sandbox_commerce_v1.paid_video_gateway_ready','sandbox_commerce_v1.paid_video_moderate','sandbox_commerce_v1.paid_video_probe_admit'].sort());
  const allowlist={added,changed,removed};
  const manifest={protocol:'native-authoring-forward-source-catalog-v1',qualification:'local_source_delta_only',
   source:'cac579c2161874a739ecb21e1ed090f181d83a37',tree:'7fcd0b4820056b5b259753b5ac20a3cdc09660e8',
   baseSourceDigest:'e07d2e3266789b1d5e5c9665e03245f6edf1abb43643e16b06d718ef4c77e33d',baseModules:48,
   extensions,extensionDigest:sha(JSON.stringify(extensions)),addedCount:added.length,changedCount:changed.length,
   portableDeltaSha256:sha(JSON.stringify(allowlist)),newTables:authoringPrivateStateTables.map(t=>'sandbox_commerce_v1.'+t),
   qualificationCounts:{before:before.length,after:after.length},deploymentAllowed:false,activationAllowed:false,retryAllowed:false};
  fs.writeFileSync(path.join(here,'deployment-allowlist.json'),JSON.stringify(allowlist,null,2)+'\n');
  fs.writeFileSync(path.join(here,'deployment-source.json'),JSON.stringify(manifest,null,2)+'\n');
  return{added:added.length,changed:changed.length,removed:removed.length,before:before.length,after:after.length,extensionDigest:manifest.extensionDigest};
 }finally{f.stop();fs.rmSync(output,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.deepEqual(process.argv.slice(2,3),['--local-bin']);assert.equal(process.argv.length,4);
 console.log(JSON.stringify(await qualifyAuthoringSource({bin:process.argv[3],onProgress:x=>console.log(JSON.stringify(x))})));
}
