import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
import {nativeStoreInstallProfile} from '../../isolated-runtime/native-store-sandbox-v1/install-profile.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='isolated-runtime/native-store-sandbox-v1/',baseline='isolated-runtime/sandbox-commerce-v1/candidates/paid-video-combined-readiness/source-manifest.json';
test('fixed closure retains combined source, appends only native inactive files with bounded grant intervals',()=>{
 const p=nativeStoreInstallProfile();assert.equal(p.files.length,40);assert.equal(p.files.at(-1).path,'isolated-runtime/sandbox-commerce-v1/permissions-finalize.sql');
 assert.equal(p.files.filter(f=>f.path.endsWith('/paid-video-install-grant-v2.sql')).length,3);
 assert.equal(p.files.filter(f=>f.path.endsWith('/paid-video-install-revoke-v2.sql')).length,3);
 assert.equal(p.files.some(f=>/fixture/u.test(f.path)),false);assert.match(p.sql,/^begin;/u);assert.match(p.sql,/commit;\s*$/u);
});
test('isolated copy rejects changed/reordered baseline and changed native bytes instead of silently rebuilding trust',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-install-drift-'));try{
  const profile=nativeStoreInstallProfile();for(const name of new Set([...profile.files.map(f=>f.path),baseline,prefix+'install-profile.mjs',prefix+'install-source.json'])){
   const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);
  }
  const {nativeStoreInstallProfile:check}=await import(pathToFileURL(path.join(dir,prefix+'install-profile.mjs')).href);
  assert.equal(check().sourceDigest,profile.sourceDigest);
  const original=fs.readFileSync(path.join(dir,baseline),'utf8'),manifest=JSON.parse(original);manifest.orderedModules.reverse();
  fs.writeFileSync(path.join(dir,baseline),JSON.stringify(manifest));assert.throws(check,/native_install_baseline_drift/u);
  fs.writeFileSync(path.join(dir,baseline),original);fs.appendFileSync(path.join(dir,prefix+'claim.sql'),'\n-- drift');assert.throws(check,/native_install_source_drift/u);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
