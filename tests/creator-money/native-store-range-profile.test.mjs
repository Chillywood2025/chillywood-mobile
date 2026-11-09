import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {nativeStoreRangeSourceProfile} from '../../isolated-runtime/native-store-sandbox-v1/range-edge-profile.mjs';
const read=name=>{try{return fs.readFileSync(new URL('../../'+name,import.meta.url),'utf8');}catch{return null;}};
test('range profile binds exact private transport closure and pinned SDK without hosted authority',()=>{
 const p=nativeStoreRangeSourceProfile(read);assert.equal(p.files.length,14);assert.equal(p.runtimeQualified,false);assert.equal(p.hostedQualified,false);assert.equal(p.verify_jwt,true);
 assert.ok(p.files.some(x=>x.name==='ops/isolated-paid-video-worker/private-object.mjs'));assert.ok(p.files.some(x=>x.name==='ops/isolated-paid-video-worker/native-private-object.mjs'));
 assert.equal(p.runtimeLockDigest,'f54ff0bb8cb3384b4a8e1d30e392abb737eb6e86f8e1d6afbe9b213d7142ada9');
});
test('range closure rejects arbitrary external or repository imports and runtime drift',()=>{
 const entry='supabase/functions/native-store-paid-video-range-v1/index.ts';
 for(const spec of ['../../../ops/unreviewed.mjs','https://arbitrary.invalid/runtime.ts','npm:unreviewed'])assert.throws(()=>nativeStoreRangeSourceProfile(name=>name===entry?read(name)+`\nimport '${spec}';`:read(name)));
 for(const name of ['deno.json','deno.lock'])assert.throws(()=>nativeStoreRangeSourceProfile(file=>file===`supabase/functions/native-store-paid-video-range-v1/${name}`?'{}':read(file)));
});
