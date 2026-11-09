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
  'supabase/functions/_shared/native-store-sandbox-command-v1.ts','supabase/functions/_shared/stripe-connect.ts',
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
