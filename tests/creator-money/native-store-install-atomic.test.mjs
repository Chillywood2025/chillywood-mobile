import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {nativeStoreAtomicInstallSQL} from '../../isolated-runtime/native-store-sandbox-v1/install-atomic.mjs';
import {nativeStoreInstallProfile} from '../../isolated-runtime/native-store-sandbox-v1/install-profile.mjs';
test('semantic rows are bound to existing portable source digest without SQL string hashing',()=>{
 const compressed=fs.readFileSync(new URL('../../isolated-runtime/native-store-sandbox-v1/install-atomic-rows.json.gz',import.meta.url));
 const bytes=gunzipSync(compressed,{maxOutputLength:8*1024*1024});
 assert.deepEqual(gzipSync(bytes,{level:9}),compressed);
 assert.throws(()=>gunzipSync(compressed.subarray(0,compressed.length-8)));
 const pin=JSON.parse(bytes.toString('utf8'));
 const delta=JSON.parse(fs.readFileSync(new URL('../../isolated-runtime/native-store-sandbox-v1/install-delta.json',import.meta.url),'utf8'));
 assert.equal(pin.sourceDigest,nativeStoreInstallProfile().sourceDigest);
 assert.equal(createHash('sha256').update(JSON.stringify(pin.rows.map(r=>JSON.stringify(r)).sort())).digest('hex'),delta.addedCatalogSha256);
 assert.equal(pin.rows.length,Object.values(delta.counts).reduce((a,b)=>a+b,0));
});
test('atomic assembler uses actual same-transaction baseline, multiset semantics and deferred checks before sole commit',()=>{
 const sql=nativeStoreAtomicInstallSQL();
 assert.match(sql,/create temporary table native_atomic_before\(snapshot jsonb\) on commit drop/u);
 assert.match(sql,/set constraints all immediate;/u);assert.match(sql,/except all/iu);
 assert.match(sql,/native_atomic_existing_catalog_changed/u);assert.match(sql,/native_atomic_public_acl_changed/u);
 assert.ok(sql.indexOf('native_atomic_added_catalog_changed')<sql.lastIndexOf('commit;'));
 // Dollar delimiters inside pinned function definitions must survive JS replacement.
 assert.ok(sql.includes('$$'));assert.match(sql,/commit;$/u);
 assert.doesNotMatch(sql,/insert into supabase_migrations|https:\/\//u);
});
