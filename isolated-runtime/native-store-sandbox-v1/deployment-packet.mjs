// Offline binding only: no target, credentials, transport, apply or activation.
import fs from 'node:fs';
import {Buffer} from 'node:buffer';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {sha256} from '../../ops/creator-backend-rollout/prepare-edge.mjs';
import {sourceBinding} from '../../scripts/native-store-install-prepare.mjs';
import {nativeStoreInstallProfile} from './install-profile.mjs';
import {nativeStoreAtomicInstallSQL} from './install-atomic.mjs';
import {nativeStoreCommandSourceProfile} from './edge-profile.mjs';
import {nativeStoreRangeSourceProfile} from './range-edge-profile.mjs';
import {nativeStoreWorkerSourceProfile} from './worker-edge-profile.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='isolated-runtime/native-store-sandbox-v1/';
const readLocal=name=>fs.readFileSync(path.join(root,name));
const git=(...args)=>execFileSync('git',['--no-replace-objects',...args],{cwd:root,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
export function nativeStoreDeploymentPacket(sourceCommit,{readFile=readLocal}={}) {
 if(!/^[a-f0-9]{40}$/u.test(sourceCommit??''))throw Error('Exact source commit required');
 if(git('rev-parse',sourceCommit+'^{commit}').toString().trim()!==sourceCommit)throw Error('Source commit mismatch');
 const binding=sourceBinding(sourceCommit);
 const observed=new Map();
 const read=name=>{let bytes;try{bytes=readFile(name);}catch(e){if(e.code==='ENOENT')return null;throw e;}if(bytes===null||bytes===undefined)return null;const value=Buffer.from(bytes);observed.set(name,value);return value.toString('utf8');};
 const required=name=>{const value=read(name);if(value===null)throw Error('Missing packet source: '+name);return value;};
 const sql=nativeStoreInstallProfile(),atomicSQL=nativeStoreAtomicInstallSQL();
 const delta=JSON.parse(required(prefix+'install-delta.json'));
 if(delta.protocol!=='native-store-install-delta-v1'||delta.sourceDigest!==sql.sourceDigest||!/^[a-f0-9]{64}$/u.test(delta.addedCatalogSha256??''))throw Error('SQL catalog/source mismatch');
 // The existing assembler validates its semantic catalog pin. Bind those exact
 // source and generator bytes separately from all Edge runtime closures.
 for(const f of sql.files)if(sha256(read(f.path))!==f.sha256)throw Error('SQL source mismatch');
 for(const name of ['deployment-packet.mjs','dependency-probe.sql','install-envelope.mjs','install-source.json','install-atomic-rows.json.gz','install-profile.mjs','install-atomic.mjs','install-delta.mjs','private-state-readback.mjs','edge-profile.mjs','range-edge-profile.mjs','worker-edge-profile.mjs'])required(prefix+name);
 required('isolated-runtime/sandbox-commerce-v1/candidates/paid-video-combined-readiness/source-manifest.json');
 required('ops/creator-backend-rollout/prepare-edge.mjs');
 for(const name of ['scripts/native-store-install-prepare.mjs','scripts/live-room-exact-deploy.mjs','scripts/studio-rolling-deploy.mjs','package.json','package-lock.json'])required(name);
 const profiles=[nativeStoreCommandSourceProfile(read),nativeStoreRangeSourceProfile(read),nativeStoreWorkerSourceProfile('native-store-ingress-v1',read),nativeStoreWorkerSourceProfile('native-store-reconcile-v1',read)];
 const config=read('supabase/config.toml');
 for(const p of profiles){
  const tag=`[functions.${p.name}]`,parts=config.split(tag);if(parts.length!==2)throw Error('Missing/duplicate JWT section');
  const section=parts[1].split(/\n\s*\[/u)[0],declarations=[...section.matchAll(/^\s*verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/gmu)];
  if(declarations.length!==1||(declarations[0][1]==='true')!==p.verify_jwt)throw Error('JWT configuration mismatch');
 }
 // A caller cannot relabel changed files as an old app commit. Binary pins are
 // compared as bytes too; git replacement objects are explicitly disabled.
 for(const [name,bytes] of observed)if(!bytes.equals(git('show',`${sourceCommit}:${name}`)))throw Error('Source differs from app commit: '+name);
 const manifest={protocol:'native-store-offline-deployment-packet-v1',appSourceCommit:sourceCommit,appSourceTree:binding.tree,
  sql:{protocol:sql.protocol,moduleCount:sql.files.length,sourceDigest:sql.sourceDigest,addedCatalogSha256:delta.addedCatalogSha256,atomicSqlSha256:sha256(atomicSQL)},
  edges:profiles.map(p=>({name:p.name,entrypoint:p.entrypoint_path,verify_jwt:p.verify_jwt,sourceDigest:p.sourceDigest,runtimeLockDigest:p.runtimeLockDigest,denoVersion:p.denoVersion,files:p.files})),
  provenance:[...observed].map(([name,bytes])=>({name,sha256:sha256(bytes)})).sort((a,b)=>a.name.localeCompare(b.name)),
  qualification:{sourceBound:true,runtimeQualified:false,hostedQualified:false,providerQualified:false,capacityQualified:false,appBuildQualified:false,deploymentAllowed:false,activationAllowed:false},
  outstanding:['Hosted SQL/default-off parity and capacity window not established by this packet','Hosted Edge bundle/JWT/environment readback not established','Installed app build and actual no-charge provider evidence remain independently required','Provider routing, credentials and operational activation are not supplied or authorized by this packet']};
 return {...manifest,packetDigest:sha256(JSON.stringify(manifest))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node deployment-packet.mjs EXACT_APP_SOURCE_COMMIT');
 console.log(JSON.stringify(nativeStoreDeploymentPacket(process.argv[2]),null,2));
}
