import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {nativeStoreCommandSourceProfile} from '../../isolated-runtime/native-store-sandbox-v1/edge-profile.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=name=>{try{return fs.readFileSync(path.join(root,name),'utf8');}catch{return null;}};
test('native command preparation includes exact transitive local closure and explicit authenticated boundary',()=>{
 const result=nativeStoreCommandSourceProfile(read);
 assert.equal(result.verify_jwt,true);assert.equal(result.hostedQualified,false);assert.equal(result.runtimeQualified,false);assert.equal(result.dispatchAllowed,false);
 assert.deepEqual(result.files.map(file=>file.name),[
  'supabase/functions/_shared/exact-subject-authority.ts','supabase/functions/_shared/livekit-session-generation.ts',
  'supabase/functions/_shared/native-store-sandbox-command-v1.ts','supabase/functions/_shared/native-store-sandbox-dispatch-contract-v1.ts','supabase/functions/_shared/stripe-connect.ts',
  'supabase/functions/native-store-sandbox-command-v1/deno.json','supabase/functions/native-store-sandbox-command-v1/deno.lock',
  'supabase/functions/native-store-sandbox-command-v1/index.ts',
 ]);
 assert.deepEqual(result.externalImports,['npm:@supabase/supabase-js@2']);
 assert.match(result.sourceDigest,/^[a-f0-9]{64}$/u);
 const config=read('supabase/config.toml');
 assert.equal(config.split('[functions.native-store-sandbox-command-v1]').length,2);
 const section=config.split('[functions.native-store-sandbox-command-v1]')[1].split('\n[')[0];
 assert.match(section,/^verify_jwt = true$/mu);
 assert.equal('project_id' in result,false);assert.equal('apply' in result,false);
});
test('missing transitive source is rejected and changed source changes fingerprint',()=>{
 assert.throws(()=>nativeStoreCommandSourceProfile(name=>name.endsWith('/exact-subject-authority.ts')?null:read(name)),/Missing frozen source/u);
 const baseline=nativeStoreCommandSourceProfile(read);
 const changed=nativeStoreCommandSourceProfile(name=>{const source=read(name);return source&&name.endsWith('/exact-subject-authority.ts')?source+'\n// reviewed source change\n':source;});
 assert.notEqual(changed.sourceDigest,baseline.sourceDigest);
});

test('endpoint-only exact runtime map and real integrity lock are mandatory bundle inputs',()=>{
 const baseline=nativeStoreCommandSourceProfile(read);
 assert.equal(baseline.bundle.import_map_path,baseline.runtimeConfigPath);
 assert.deepEqual(baseline.resolvedExternalImports,['npm:@supabase/supabase-js@2.110.6']);
 assert.ok(baseline.bundle.files.some(f=>f.name===baseline.runtimeLockPath));
 for(const [file,change] of [[baseline.runtimeConfigPath,s=>s.replace('2.110.6','2')],[baseline.runtimeConfigPath,s=>s.replace('true','false')],[baseline.runtimeLockPath,()=>null],[baseline.runtimeLockPath,s=>s.replace('sha512-','sha1-')]])
  assert.throws(()=>nativeStoreCommandSourceProfile(name=>name===file?change(read(name)):read(name)),/runtime/u);
 const changed=nativeStoreCommandSourceProfile(name=>name===baseline.runtimeLockPath?read(name)+'\n':read(name));assert.notEqual(changed.sourceDigest,baseline.sourceDigest);
});

test('unmapped added external imports cannot masquerade as the pinned SDK closure',()=>{
 for(const specifier of ['npm:unreviewed@1','https://example.invalid/module.ts','node:fs'])assert.throws(()=>nativeStoreCommandSourceProfile(name=>name.endsWith('/stripe-connect.ts')?read(name)+`\nimport "${specifier}";\n`:read(name)),/external import/u);
});
test('mandatory CI uses exact isolated Deno tooling and frozen endpoint configuration',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/required-validation.yml'),'utf8');
 assert.match(workflow,/npm ci --ignore-scripts --no-audit --no-fund --prefix isolated-runtime\/native-store-edge-tool/u);
 assert.match(workflow,/cache --config supabase\/functions\/native-store-sandbox-command-v1\/deno.json --frozen supabase\/functions\/native-store-sandbox-command-v1\/index.ts/u);
 assert.match(workflow,/node isolated-runtime\/native-store-sandbox-v1\/edge-runtime.mjs --deno/u);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'isolated-runtime/native-store-edge-tool/package.json'),'utf8'));assert.equal(manifest.dependencies['@deno/linux-x64-glibc'],'2.9.6');
 const runner=fs.readFileSync(path.join(root,'isolated-runtime/native-store-sandbox-v1/edge-runtime.mjs'),'utf8');assert.match(runner,/--cached-only/u);assert.match(runner,/--allow-net=127.0.0.1/u);assert.doesNotMatch(runner,/--no-lock|--allow-all|--unsafely-ignore-certificate-errors/u);
});
