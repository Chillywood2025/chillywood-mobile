// Source preparation only. No target, credentials, deployment or activation.
import path from 'node:path';
import {importSpecifiers,sha256} from '../../ops/creator-backend-rollout/prepare-edge.mjs';
import {nativeStoreCommandSourceProfile} from '../native-store-sandbox-v1/edge-profile.mjs';

export const paidVideoEndpointNames=Object.freeze(['isolated-paid-video-authoring-v2','isolated-paid-video-upload-v2']);
export function nativePaidVideoSourceProfile(readSource,name){
 if(!paidVideoEndpointNames.includes(name))throw Error('Unsupported paid-video endpoint');
 const runtime=nativeStoreCommandSourceProfile(readSource),entrypoint=`supabase/functions/${name}/index.ts`;
 const configPath=`supabase/functions/${name}/deno.json`,lockPath=`supabase/functions/${name}/deno.lock`;
 if(readSource(configPath)!==readSource(runtime.runtimeConfigPath)||readSource(lockPath)!==readSource(runtime.runtimeLockPath))throw Error('Paid-video frozen runtime mismatch');
 const permitted=new Set(['ops/isolated-paid-video-worker/private-object.mjs','ops/isolated-paid-video-worker/upload-broker.mjs',
  'ops/isolated-paid-video-worker/r2-native.mjs','ops/isolated-paid-video-worker/r2-protocol.mjs','ops/isolated-paid-video-worker/r2-http.mjs',
  'isolated-runtime/sandbox-commerce-v1/paid-video-contract-v1.json']);
 const external=['node:assert/strict','node:buffer','node:crypto','npm:@supabase/supabase-js@2'],files=new Map(),seen=new Set();
 const visit=file=>{
  if(seen.has(file))return;seen.add(file);
  if(!(file.startsWith('supabase/functions/_shared/')||file.startsWith(`supabase/functions/${name}/`)||permitted.has(file)))throw Error('Unsupported paid-video dependency');
  const content=readSource(file);if(typeof content!=='string')throw Error('Missing paid-video source');files.set(file,content);
  if(/\.[cm]?[jt]sx?$/u.test(file))for(const spec of importSpecifiers(content)){
   if(spec.startsWith('.'))visit(path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)));
   else if(!external.includes(spec))throw Error('Unsupported paid-video import');
  }
 };
 visit(entrypoint);visit(configPath);visit(lockPath);
 const bundle={files:[...files].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,content])=>({name,content})),import_map_path:configPath};
 const hashes=bundle.files.map(({name,content})=>({name,sha256:sha256(content)}));
 return {protocol:'native-paid-video-edge-source-v1',name,entrypoint_path:entrypoint,verify_jwt:true,
  runtimeConfigPath:configPath,runtimeLockPath:lockPath,runtimeLockDigest:runtime.runtimeLockDigest,
  denoVersion:runtime.denoVersion,resolvedExternalImports:runtime.resolvedExternalImports,
  files:hashes,sourceDigest:sha256(JSON.stringify(hashes)),bundle,
  runtimeQualified:false,hostedQualified:false,storageQualified:false,activationAllowed:false};
}
