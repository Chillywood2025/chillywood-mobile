// Local source preparation only. No target, secrets, network or deploy action.
import { collectSourceBundle, importSpecifiers, sha256 } from '../../ops/creator-backend-rollout/prepare-edge.mjs';

export function nativeStoreWorkerSourceProfile(name, readSource) {
  if (!['native-store-ingress-v1', 'native-store-reconcile-v1'].includes(name)) throw Error('Unsupported native worker endpoint');
  const entrypoint = `supabase/functions/${name}/index.ts`;
  const bundle = collectSourceBundle(readSource, entrypoint);
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
  if(JSON.stringify(externalImports)!==JSON.stringify(['npm:@supabase/supabase-js@2.110.6']))throw Error('Unsupported native endpoint external import');
  return {
    protocol: 'native-store-worker-source-profile-v1', name, entrypoint_path: entrypoint, verify_jwt: name === 'native-store-reconcile-v1',
    runtimeConfigPath:configPath, runtimeLockPath:lockPath, runtimeLockDigest:sha256(lockText),
    resolvedExternalImports:['npm:@supabase/supabase-js@2.110.6'], denoVersion:'2.9.6',
    files, sourceDigest: sha256(JSON.stringify(files)), externalImports,
    // Source preparation alone does not assert the local runtime test ran or hosted parity.
    runtimeQualified: false, hostedQualified: false, dispatchAllowed: false,
    bundle,
  };
}
