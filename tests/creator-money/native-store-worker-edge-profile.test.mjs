import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {nativeStoreWorkerSourceProfile} from '../../isolated-runtime/native-store-sandbox-v1/worker-edge-profile.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=name=>{try{return fs.readFileSync(path.join(root,name),'utf8');}catch{return null;}};
for(const endpoint of ['native-store-ingress-v1','native-store-reconcile-v1']) {
 test(`${endpoint} exact local closure and lock, no authority`,()=>{
  const p=nativeStoreWorkerSourceProfile(endpoint,read);
  assert.equal(p.verify_jwt,endpoint==='native-store-reconcile-v1');
  assert.equal(p.runtimeQualified,false);assert.equal(p.hostedQualified,false);assert.equal(p.dispatchAllowed,false);
  assert.deepEqual(p.externalImports,['npm:@supabase/supabase-js@2.110.6']);
  assert.ok(p.bundle.files.some(f=>f.name===p.runtimeLockPath));assert.ok(p.bundle.files.some(f=>f.name===p.runtimeConfigPath));
  assert.equal(p.bundle.import_map_path,p.runtimeConfigPath);
  const section=read('supabase/config.toml').split(`[functions.${endpoint}]`)[1].split('\n[')[0];assert.match(section,new RegExp(`^verify_jwt = ${p.verify_jwt}$`,'m'));
 });
 test(`${endpoint} missing or substituted runtime rejected`,()=>{
  const p=nativeStoreWorkerSourceProfile(endpoint,read);
  for(const file of [p.entrypoint_path,p.runtimeConfigPath,p.runtimeLockPath])assert.throws(()=>nativeStoreWorkerSourceProfile(endpoint,n=>n===file?null:read(n)));
  assert.throws(()=>nativeStoreWorkerSourceProfile(endpoint,n=>n===p.runtimeLockPath?read(n).replace('sha512-','sha1-'):read(n)));
  const changed=nativeStoreWorkerSourceProfile(endpoint,n=>n===p.entrypoint_path?read(n)+'\n// change\n':read(n));assert.notEqual(changed.sourceDigest,p.sourceDigest);
 });
 test(`${endpoint} arbitrary external dependency rejected`,()=>{
  for(const spec of ['npm:other@1','https://example.invalid/x.ts','node:fs'])assert.throws(()=>nativeStoreWorkerSourceProfile(endpoint,n=>n.endsWith('/provider-readiness.ts')?read(n)+`\nimport "${spec}";`:read(n)),/external import/);
 });
}
test('only fixed endpoints; mandatory exact cached-only loopback qualification',()=>{
 assert.throws(()=>nativeStoreWorkerSourceProfile('other',read),/Unsupported/);
 const ci=read('.github/workflows/required-validation.yml');for(const n of ['ingress','reconcile'])assert.ok(ci.includes(`cache --config supabase/functions/native-store-${n}-v1/deno.json --frozen supabase/functions/native-store-${n}-v1/index.ts`));
 assert.ok(ci.includes('worker-edge-runtime.mjs --deno'));const runner=read('isolated-runtime/native-store-sandbox-v1/worker-edge-runtime.mjs');assert.match(runner,/--cached-only/);assert.match(runner,/--allow-net=127.0.0.1/);assert.doesNotMatch(runner,/--no-lock|--allow-all|--unsafely-ignore/);
});
