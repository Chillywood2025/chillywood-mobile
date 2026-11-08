// Fixed fresh/default-off source closure. No network, target URL, apply switch,
// fixture SQL, migration history mutation or provider configuration.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const baselinePath='isolated-runtime/sandbox-commerce-v1/candidates/paid-video-combined-readiness/source-manifest.json';
const nativePrefix='isolated-runtime/native-store-sandbox-v1/';
export function nativeStoreInstallProfile(){
 const pinned=JSON.parse(fs.readFileSync(path.join(root,nativePrefix+'install-source.json'),'utf8'));
 const baselineBytes=fs.readFileSync(path.join(root,baselinePath));
 if(sha(baselineBytes)!==pinned.baselineManifestSha256)throw Error('native_install_baseline_drift');
 const baseline=JSON.parse(baselineBytes);
 if(baseline.protocol!=='scpv-combined-source-profile-v1'||baseline.freshInactiveInstallOnly!==true)throw Error('native_install_baseline_invalid');
 const files=baseline.orderedModules.map(m=>{const sql=fs.readFileSync(path.join(root,m.path),'utf8');if(sha(sql)!==m.sha256)throw Error('native_install_source_drift:'+m.path);return {path:m.path,sha256:m.sha256,sql};});
 const finalizer=files.pop();if(finalizer.path!=='isolated-runtime/sandbox-commerce-v1/permissions-finalize.sql')throw Error('native_install_finalizer_invalid');
 for(const name of ['journal.sql','quote.sql','claim.sql','install-check.sql']){
  if(name==='quote.sql')files.push({...baselineModule('paid-video-install-grant-v2.sql')});
  if(name==='install-check.sql')files.push({...baselineModule('paid-video-install-revoke-v2.sql')});
  const sourcePath=nativePrefix+name,sql=fs.readFileSync(path.join(root,sourcePath),'utf8');
  if(sha(sql)!==pinned.files[sourcePath])throw Error('native_install_source_drift:'+sourcePath);
  files.push({path:sourcePath,sha256:sha(sql),sql});
 }
 function baselineModule(name){const module=baseline.orderedModules.find(m=>m.path==='isolated-runtime/sandbox-commerce-v1/'+name);
  const sql=fs.readFileSync(path.join(root,module.path),'utf8');if(sha(sql)!==module.sha256)throw Error('native_install_source_drift');return {path:module.path,sha256:module.sha256,sql};}
 files.push(finalizer);
 return {protocol:'native-store-default-off-install-source-v1',baselineManifestSha256:sha(fs.readFileSync(path.join(root,baselinePath))),
  sourceDigest:sha(JSON.stringify(files.map(({path,sha256})=>({path,sha256})))),files,
  sql:'begin;\n'+files.map(f=>`\n-- SOURCE ${f.path} SHA256 ${f.sha256}\n${f.sql}`).join('\n')+'\ncommit;\n'};
}
