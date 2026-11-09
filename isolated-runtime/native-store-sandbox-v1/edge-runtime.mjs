// Local-only execution of the exact prepared bundle. No hosted target or secrets.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {nativeStoreCommandSourceProfile} from './edge-profile.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.argv.length!==4||process.argv[2]!=='--deno')throw Error('Usage: node edge-runtime.mjs --deno /absolute/deno');
const deno=path.resolve(process.argv[3]),env={PATH:process.env.PATH??'',...(process.env.DENO_DIR?{DENO_DIR:process.env.DENO_DIR}:{})};
const version=spawnSync(deno,['--version'],{encoding:'utf8',env,timeout:15000});if(version.status!==0||!version.stdout.startsWith('deno 2.9.6 '))throw Error('Exact Deno 2.9.6 required');
const profile=nativeStoreCommandSourceProfile(name=>{try{return fs.readFileSync(path.join(root,name),'utf8');}catch{return null;}});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-store-edge-runtime-'));
try{
 for(const file of profile.bundle.files){const dest=path.join(dir,file.name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,file.content);}
 const test='supabase/functions/native-store-sandbox-command-v1/runtime_test.ts';fs.mkdirSync(path.dirname(path.join(dir,test)),{recursive:true});fs.copyFileSync(path.join(root,test),path.join(dir,test));
 const result=spawnSync(deno,['test','--config',profile.runtimeConfigPath,'--cached-only','--allow-net=127.0.0.1','--allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY',test],{cwd:dir,env,encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
 process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');if(result.status!==0)throw Error('Frozen local endpoint runtime qualification failed');
 console.log(JSON.stringify({protocol:'native-store-local-edge-runtime-proof-v1',denoVersion:profile.denoVersion,sourceDigest:profile.sourceDigest,runtimeLockDigest:profile.runtimeLockDigest,localRuntimeQualified:true,hostedQualified:false,providerQualified:false,dispatchAllowed:false}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
