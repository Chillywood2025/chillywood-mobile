// Execute both exact prepared bundles under the pinned SDK. Loopback only.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {nativePaidVideoSourceProfile,paidVideoEndpointNames} from './edge-profile.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.argv.length!==4||process.argv[2]!=='--deno'||!path.isAbsolute(process.argv[3]))throw Error('Usage: node edge-runtime.mjs --deno /absolute/deno');
const deno=process.argv[3],env={PATH:process.env.PATH??'',...(process.env.DENO_DIR?{DENO_DIR:process.env.DENO_DIR}:{})};
const version=spawnSync(deno,['--version'],{encoding:'utf8',env,timeout:15000});if(version.status!==0||!version.stdout.startsWith('deno 2.9.6 '))throw Error('Exact Deno 2.9.6 required');
const read=name=>{try{return fs.readFileSync(path.join(root,name),'utf8');}catch{return null;}};
const profiles=paidVideoEndpointNames.map(name=>nativePaidVideoSourceProfile(read,name)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-paid-video-edge-'));
try{
 for(const profile of profiles)for(const file of profile.bundle.files){const dest=path.join(dir,file.name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,file.content);}
 const test='supabase/functions/isolated-paid-video-authoring-v2/runtime_test.ts';fs.copyFileSync(path.join(root,test),path.join(dir,test));
 const result=spawnSync(deno,['test','--config',profiles[0].runtimeConfigPath,'--cached-only','--allow-net=127.0.0.1',
  '--allow-env=PAID_VIDEO_STORAGE_MODE,PAID_VIDEO_R2_GATEWAY_V1_ENABLED,PAID_VIDEO_R2_GATEWAY_ORIGIN,PAID_VIDEO_R2_BUCKET,PAID_VIDEO_R2_ROUTE_ID,PAID_VIDEO_R2_PROFILE_ID,PAID_VIDEO_R2_GATEWAY_KEY_ID,PAID_VIDEO_R2_QUALIFICATION_SHA256,SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,PAID_VIDEO_GATEWAY_V2_ENABLED,PAID_VIDEO_S3_ROUTE_ID,PAID_VIDEO_S3_BUCKET,PAID_VIDEO_S3_REGION,PAID_VIDEO_S3_ACCESS_KEY_ID,PAID_VIDEO_S3_SECRET_ACCESS_KEY,PAID_VIDEO_UPLOAD_VERIFIER_ID,PAID_VIDEO_UPLOAD_VERIFIER_KEY_HEX',test],
  {cwd:dir,env,encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
 process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');if(result.status!==0)throw Error('Paid-video frozen runtime qualification failed');
 console.log(JSON.stringify({protocol:'native-paid-video-local-edge-proof-v1',denoVersion:profiles[0].denoVersion,
  sources:profiles.map(p=>({name:p.name,sourceDigest:p.sourceDigest,runtimeLockDigest:p.runtimeLockDigest})),localRuntimeQualified:true,hostedQualified:false,storageQualified:false,activationAllowed:false}));
}finally{fs.rmSync(dir,{recursive:true});}
