import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {nativePaidVideoSourceProfile,paidVideoEndpointNames} from '../../isolated-runtime/native-paid-video-authoring-v1/edge-profile.mjs';
const read=name=>{try{return fs.readFileSync(new URL('../../'+name,import.meta.url),'utf8');}catch{return null;}};
test('both normal authoring endpoints bind the exact private source closure and pinned SDK, without hosted authority',()=>{
 for(const name of paidVideoEndpointNames){const p=nativePaidVideoSourceProfile(read,name);assert.equal(p.verify_jwt,true);
  assert.equal(p.files.length,21);
  assert.equal(p.runtimeQualified,false);assert.equal(p.hostedQualified,false);assert.equal(p.storageQualified,false);assert.equal(p.activationAllowed,false);
  assert.equal(p.runtimeLockDigest,'f54ff0bb8cb3384b4a8e1d30e392abb737eb6e86f8e1d6afbe9b213d7142ada9');
  assert.ok(p.files.some(f=>f.name==='ops/isolated-paid-video-worker/private-object.mjs'));
  assert.ok(p.files.some(f=>f.name==='ops/isolated-paid-video-worker/upload-broker.mjs'));
  for(const file of ['r2-native.mjs','r2-protocol.mjs','r2-http.mjs'])assert.ok(p.files.some(f=>f.name==='ops/isolated-paid-video-worker/'+file));
  assert.ok(p.files.some(f=>f.name==='supabase/functions/_shared/isolated-paid-video-r2-upload.ts'));
  assert.ok(p.files.some(f=>f.name==='isolated-runtime/sandbox-commerce-v1/paid-video-contract-v1.json'));
  assert.equal(p.bundle.import_map_path,p.runtimeConfigPath);assert.equal(p.denoVersion,'2.9.6');
 }
});
test('normal authoring bundle refuses unreviewed dependencies, endpoint substitution and runtime drift',()=>{
 for(const name of paidVideoEndpointNames){const entry=`supabase/functions/${name}/index.ts`;
  for(const spec of ['../../../ops/unreviewed.mjs','../../../ops/isolated-paid-video-worker/r2-gateway.mjs','../../../ops/isolated-paid-video-worker/r2-scanner-runtime.mjs','https://arbitrary.invalid/runtime.ts','npm:unreviewed'])assert.throws(()=>nativePaidVideoSourceProfile(file=>file===entry?read(file)+`\nimport '${spec}';`:read(file),name));
  for(const suffix of ['deno.json','deno.lock'])assert.throws(()=>nativePaidVideoSourceProfile(file=>file===`supabase/functions/${name}/${suffix}`?'{}':read(file),name));
 }assert.throws(()=>nativePaidVideoSourceProfile(read,'isolated-paid-video-range-v1'));
});
