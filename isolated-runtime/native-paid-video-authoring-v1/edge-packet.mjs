// Offline exact-source bundle preparation. No target, transport or activation.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';import {sha256} from '../../ops/creator-backend-rollout/prepare-edge.mjs';
import {nativePaidVideoSourceProfile,paidVideoEndpointNames} from './edge-profile.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const git=(...args)=>execFileSync('git',['--no-replace-objects',...args],{cwd:root,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
export function nativePaidVideoEdgePacket(source,{readFile=name=>fs.readFileSync(path.join(root,name))}={}){
 if(!/^[a-f0-9]{40}$/u.test(source??'')||git('rev-parse',source+'^{commit}').toString().trim()!==source)throw Error('Exact source commit required');
 const observed=new Map(),read=name=>{let value;try{value=readFile(name);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(value===null||value===undefined)return null;const bytes=Buffer.from(value);observed.set(name,bytes);return bytes.toString('utf8');};
 const profiles=paidVideoEndpointNames.map(name=>nativePaidVideoSourceProfile(read,name));
 for(const file of ['edge-packet.mjs','edge-profile.mjs','edge-runtime.mjs'])if(read('isolated-runtime/native-paid-video-authoring-v1/'+file)===null)throw Error('Missing packet implementation');
 for(const file of ['package.json','package-lock.json','ops/creator-backend-rollout/prepare-edge.mjs','isolated-runtime/native-store-sandbox-v1/edge-profile.mjs',
  'isolated-runtime/native-store-edge-tool/package.json','isolated-runtime/native-store-edge-tool/package-lock.json','supabase/functions/isolated-paid-video-authoring-v2/runtime_test.ts'])if(read(file)===null)throw Error('Missing runtime provenance');
 const config=read('supabase/config.toml');
 for(const p of profiles){
  const parts=config?.split(`[functions.${p.name}]`);if(parts?.length!==2)throw Error('Missing or duplicate JWT section');
  const matches=[...parts[1].split(/\n\s*\[/u)[0].matchAll(/^\s*verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/gmu)];
  if(matches.length!==1||matches[0][1]!=='true')throw Error('Paid-video JWT configuration mismatch');
 }
 for(const [name,bytes]of observed)if(!bytes.equals(git('show',`${source}:${name}`)))throw Error('Packet source differs from commit: '+name);
 const manifest={protocol:'native-paid-video-edge-packet-v1',source,tree:git('rev-parse',source+'^{tree}').toString().trim(),
  edges:profiles.map(p=>({name:p.name,entrypoint_path:p.entrypoint_path,verify_jwt:p.verify_jwt,sourceDigest:p.sourceDigest,runtimeLockDigest:p.runtimeLockDigest,
   denoVersion:p.denoVersion,files:p.files,bundle:p.bundle})),
  provenance:[...observed].map(([name,bytes])=>({name,sha256:sha256(bytes)})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0),
  runtimeQualified:false,hostedQualified:false,storageQualified:false,deploymentAllowed:false,activationAllowed:false};
 return {...manifest,packetDigest:sha256(JSON.stringify(manifest))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node edge-packet.mjs EXACT_SOURCE_COMMIT');
 console.log(JSON.stringify(nativePaidVideoEdgePacket(process.argv[2]),null,2));
}
