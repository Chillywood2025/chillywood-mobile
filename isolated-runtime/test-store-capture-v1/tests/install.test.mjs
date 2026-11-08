import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { reviewedCaptureInstall, reviewedCaptureMigration, captureMigrationPath, repoRoot, packageRoot } from '../install.mjs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

test('offline emitter binds exact source, fresh-object transaction and unchanged crypto donor',()=>{
  const proof=reviewedCaptureInstall();assert.equal(proof.defaultEnabled,false);assert.equal(proof.replacementAllowed,false);
  assert.equal(proof.sourceHashes['supabase/functions/_shared/revenuecat-router-envelope.ts'],'2c856a0551724761cb8e3a1de10111b68bc796a222fda1f6731c3fea95869d87');
  assert.equal(proof.sourceHashes['supabase/functions/_shared/isolated-test-store-qualification.ts'],'5076554531ca31633d7d4cc0b63d7eae7e7fead47f533eb09c149cc2723f032c');
  assert.match(proof.sql,/^begin;set local lock_timeout='250ms';set local statement_timeout='5s';set local transaction_timeout='5s';/u);
  assert.match(proof.sql,/\ncommit;\n$/u);
  assert.doesNotMatch(proof.sql,/create\s+or\s+replace|create[^;\n]*\bif\s+not\s+exists|pg_get_functiondef|pg_auth_members|auth\.users|sandbox_commerce_v1\./iu);
  assert.doesNotMatch(proof.sql,/proj44662861|appa71ade7a3f|c5629a24|bmkkhihfbmsnnmcqkoly/u);
});
test('canonical local migration is byte-identical to the qualified emitted transaction',()=>{
  const source=reviewedCaptureInstall(), migration=reviewedCaptureMigration();
  assert.equal(migration.migrationPath,'supabase/migrations/20261107233954_isolated_test_store_capture_v1.sql');
  assert.equal(migration.sql,source.sql);
  assert.equal(migration.sourceHashes[captureMigrationPath],source.sqlSha256);
  assert.deepEqual(fs.readFileSync(path.join(repoRoot,captureMigrationPath)),Buffer.from(source.sql,'utf8'));
});
test('offline emitter rejects wrong digest, external-execution flags and source omissions or mutations',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rcq-source-check-'));
  try{
    const manifest=JSON.parse(fs.readFileSync(path.join(packageRoot,'source-manifest.json'),'utf8'));
    for(const name of [...Object.keys(manifest.files),'isolated-runtime/test-store-capture-v1/source-manifest.json']){
      const target=path.join(temp,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(repoRoot,name),target);
    }
    const emitter=path.join(temp,'isolated-runtime/test-store-capture-v1/install.mjs');
    const run=(...args)=>spawnSync(process.execPath,[emitter,...args],{encoding:'utf8'});
    const good=run('--plan');assert.equal(good.status,0,good.stderr);const plan=JSON.parse(good.stdout);
    const emitted=run('--emit-sql','--expected-digest',plan.sqlSha256);assert.equal(emitted.status,0,emitted.stderr);
    assert.equal(emitted.stdout,reviewedCaptureInstall().sql);
    assert.notEqual(run('--emit-sql','--expected-digest','0'.repeat(64)).status,0);
    assert.notEqual(run('--execute','https://synthetic.invalid').status,0);
    const migration=path.join(temp,captureMigrationPath), originalMigration=fs.readFileSync(migration);
    fs.appendFileSync(migration,'-- changed migration despite updated manifest\n');
    // A reviewer updating only the manifest must not turn drift into parity.
    const changed=structuredClone(manifest);
    changed.files[captureMigrationPath]=createHash('sha256').update(fs.readFileSync(migration)).digest('hex');
    fs.writeFileSync(path.join(temp,'isolated-runtime/test-store-capture-v1/source-manifest.json'),JSON.stringify(changed));
    assert.equal(run('--plan').status,0,'The negative control passes source hashing before parity rejects');
    const parity=spawnSync(process.execPath,['--input-type=module','-e',
      'const modulePath=process.argv[1];process.argv[1]=undefined;const {reviewedCaptureMigration}=await import(modulePath);reviewedCaptureMigration();',emitter],{encoding:'utf8'});
    assert.notEqual(parity.status,0);assert.match(parity.stderr,/Migration differs from exact qualified capture transaction/u);
    fs.writeFileSync(migration,originalMigration);
    fs.writeFileSync(path.join(temp,'isolated-runtime/test-store-capture-v1/source-manifest.json'),JSON.stringify(manifest));
    const sql=path.join(temp,'isolated-runtime/test-store-capture-v1/capture.sql');fs.appendFileSync(sql,'-- stale mutation\n');
    assert.notEqual(run('--plan').status,0);
    delete manifest.files['isolated-runtime/test-store-capture-v1/capture.sql'];
    fs.writeFileSync(path.join(temp,'isolated-runtime/test-store-capture-v1/source-manifest.json'),JSON.stringify(manifest));
    assert.match(run('--plan').stderr,/Missing required capture source/u);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
