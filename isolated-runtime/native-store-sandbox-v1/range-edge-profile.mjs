// Local source preparation only. No target, secrets, network or deploy action.
import path from 'node:path';
import { importSpecifiers, sha256 } from '../../ops/creator-backend-rollout/prepare-edge.mjs';

export function nativeStoreRangeSourceProfile(readSource) {
  const name = 'native-store-paid-video-range-v1';
  const entrypoint = `supabase/functions/${name}/index.ts`;
  // Explicit private-media exception, not a relaxation of the shared Edge
  // collector. S3 and typed R2 remain distinct. The gateway/scanner executable
  // and its credentials never enter either prepared Edge bundle.
  const permittedOps=new Set(['ops/isolated-paid-video-worker/private-object.mjs','ops/isolated-paid-video-worker/native-private-object.mjs',
    'ops/isolated-paid-video-worker/r2-native.mjs','ops/isolated-paid-video-worker/r2-protocol.mjs',
    'ops/isolated-paid-video-worker/r2-http.mjs','ops/isolated-paid-video-worker/r2-native-range.mjs']);
  const sources=new Map();
  const visit=file=>{
    if(sources.has(file))return;
    if(!(file.startsWith('supabase/functions/_shared/')||file.startsWith(`supabase/functions/${name}/`)||permittedOps.has(file)))throw Error('Unsupported native range dependency');
    const content=readSource(file);if(typeof content!=='string')throw Error('Missing native range source');sources.set(file,content);
    if(/\.[cm]?[jt]sx?$/u.test(file))for(const spec of importSpecifiers(content)){
      if(spec.startsWith('.'))visit(path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)));
      else if(!['node:assert/strict','node:buffer','node:crypto','npm:@supabase/supabase-js@2'].includes(spec))throw Error('Unsupported native range import');
    }
  };
  visit(entrypoint);visit(`supabase/functions/${name}/deno.json`);
  const bundle={files:[...sources].map(([name,content])=>({name,content}))};
  const configPath = `supabase/functions/${name}/deno.json`, lockPath = `supabase/functions/${name}/deno.lock`;
  const config = JSON.parse(readSource(configPath) ?? 'null');
  if (JSON.stringify(config) !== JSON.stringify({imports:{'npm:@supabase/supabase-js@2':'npm:@supabase/supabase-js@2.110.6'},lock:{path:'./deno.lock',frozen:true}})) throw Error('Unexpected native endpoint runtime configuration');
  const lockText=readSource(lockPath);if(typeof lockText!=='string')throw Error('Missing frozen runtime lock');
  const lock=JSON.parse(lockText), expectedPackages=['@supabase/auth-js@2.110.6','@supabase/functions-js@2.110.6','@supabase/phoenix@0.4.4','@supabase/postgrest-js@2.110.6','@supabase/realtime-js@2.110.6','@supabase/storage-js@2.110.6','@supabase/supabase-js@2.110.6','iceberg-js@0.8.1','tslib@2.8.1'];
  if(lock.version!=='5'||JSON.stringify(lock.specifiers)!==JSON.stringify({'npm:@supabase/supabase-js@2.110.6':'2.110.6'})
    ||JSON.stringify(Object.keys(lock.npm??{}).sort())!==JSON.stringify(expectedPackages)
    ||Object.values(lock.npm).some(v=>!/^sha512-[A-Za-z0-9+/]{86}==$/u.test(v.integrity??'')))throw Error('Unexpected native endpoint runtime lock');
  bundle.files.push({name:lockPath,content:lockText});bundle.files.sort((a,b)=>a.name.localeCompare(b.name));
  // The API bundle explicitly carries the function-local map and real lock.
  // Hosted lock enforcement still requires deployment/readback qualification.
  bundle.import_map_path=configPath;
  const files = bundle.files.map(({name, content}) => ({name, sha256: sha256(content)}));
  const externalImports = [...new Set(bundle.files.filter(({name}) => /\.[cm]?[jt]sx?$/u.test(name)).flatMap(({content}) => importSpecifiers(content).filter(value => /^(?:npm|jsr|https?|node):/u.test(value))))].sort();
  if(JSON.stringify(externalImports)!==JSON.stringify(['node:assert/strict','node:buffer','node:crypto','npm:@supabase/supabase-js@2']))throw Error('Unsupported native endpoint external import');
  return {
    protocol: 'native-store-range-source-profile-v1', name, entrypoint_path: entrypoint, verify_jwt: true,
    runtimeConfigPath:configPath, runtimeLockPath:lockPath, runtimeLockDigest:sha256(lockText),
    resolvedExternalImports:['npm:@supabase/supabase-js@2.110.6'], denoVersion:'2.9.6',
    files, sourceDigest: sha256(JSON.stringify(files)), externalImports,
    // Source preparation alone does not assert the local runtime test ran or hosted parity.
    runtimeQualified: false, hostedQualified: false, dispatchAllowed: false,
    bundle,
  };
}
