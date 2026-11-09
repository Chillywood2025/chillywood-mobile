import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {describeNativeInstallDelta,verifyNativeInstallDelta,NATIVE_ROLES,deltaSnapshotSQL} from '../../isolated-runtime/native-store-sandbox-v1/install-delta.mjs';
import {nativeStoreInstallProfile} from '../../isolated-runtime/native-store-sandbox-v1/install-profile.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../../isolated-runtime/native-store-sandbox-v1/install-delta.json',import.meta.url),'utf8'));
test('pinned added catalog belongs to fixed source closure and remains non-authoritative',()=>{
 assert.equal(manifest.sourceDigest,nativeStoreInstallProfile().sourceDigest);assert.match(manifest.addedCatalogSha256,/^[a-f0-9]{64}$/u);
 assert.equal(manifest.publicFunctions.length,42);assert.equal(new Set(manifest.publicFunctions).size,42);
 assert.equal(manifest.publicFunctions.filter(name=>name.startsWith('native_store_sandbox_dispatch_v1(')).length,1);
 assert.equal(manifest.counts.membership,8);assert.equal(manifest.counts.role,4);assert.equal(NATIVE_ROLES.length,4);
 assert.equal(manifest.qualification,'source_delta_only');assert.equal(manifest.deploymentAllowed,false);
});
test('preexisting fresh-role/object names are never accepted as additive install',()=>{
 const before={rows:[['role','sbx_v1_core_owner']],publicAcl:[]},after={rows:[],publicAcl:[]};
 assert.throws(()=>describeNativeInstallDelta(before,after),/native_delta_names_not_fresh/u);
 assert.throws(()=>verifyNativeInstallDelta(null,null),/native_delta_snapshot_invalid/u);
});
test('old objects cannot disappear and public CREATE cannot be normalized away',()=>{
 const schema=['schema','public','postgres','{postgres=UC/postgres}'];
 const before={rows:[schema,['function','public','existing','',null,null,'postgres']],publicAcl:[['postgres','postgres','CREATE',false]]};
 assert.throws(()=>describeNativeInstallDelta(before,{rows:[schema],publicAcl:before.publicAcl}),/native_delta_existing_catalog_changed/u);
 const same={rows:[schema],publicAcl:[['postgres','postgres','CREATE',false]]};
 assert.throws(()=>describeNativeInstallDelta(same,{...same,publicAcl:[...same.publicAcl,['postgres','sbx_v1_core_owner','CREATE',false]]}),/native_delta_public_acl_changed/u);
});
test('read-only snapshot retains owning FK constraint and semantic ACL identities',()=>{
 for(const token of ['co.conname','co.conrelid','aclexplode','pg_get_userbyid','bootstrapSuperuser'])assert.ok(deltaSnapshotSQL.includes(token));
 assert.equal(/\b(?:insert|update|delete)\s+(?:into|from)\b/iu.test(deltaSnapshotSQL),false);
});
