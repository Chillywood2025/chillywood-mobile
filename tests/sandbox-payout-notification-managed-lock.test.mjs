import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {loadBundle, lockTables, writeCapabilitiesSQL, cronReadCapabilitySQL, requireWriteCapabilities, deploy}
  from '../scripts/sandbox-payout-notification-exact-deploy.mjs';

async function createFixtureEngine() {
  const directory = process.env.PAYOUT_TEST_PGLITE_DIRECTORY;
  if (!directory) return new PGlite();
  assert.ok(path.isAbsolute(directory));
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  assert.equal(metadata.name, '@electric-sql/pglite');
  assert.equal(metadata.version, '0.4.6');
  const {PGlite: PG17} = await import(pathToFileURL(path.join(directory, 'dist/index.js')).href);
  return new PG17();
}

test('managed writer locks application tables but only reads independent owner cron', async t => {
  const db = await createFixtureEngine(); t.after(() => db.close());
  const bundle = loadBundle();
  const version = Number((await db.query('show server_version_num')).rows[0].server_version_num);
  assert.equal(Math.floor(version / 10000), process.env.PAYOUT_TEST_PGLITE_DIRECTORY ? 17 : 18);
  // PostgreSQL forbids removing SUPERUSER from its bootstrap identity. Rename
  // that identity, then create the managed writer in this disposable WASM only.
  // Never run this setup against a real/native or managed cluster.
  await db.exec(`create role fixture_setup superuser;
    set session authorization fixture_setup;
    alter role postgres rename to fixture_admin;
    create role postgres nosuperuser;
    create role supabase_read_only_user nosuperuser;
    create schema private;create schema cron;create schema supabase_migrations;`);
  assert.equal(lockTables(bundle).length, 26);
  assert.equal(lockTables(bundle).includes('cron.job'), false);
  for (const table of lockTables(bundle)) await db.exec(`create table ${table}(fixture_value integer);alter table ${table} owner to postgres`);
  await db.exec(`create table cron.job(fixture_value integer);
    alter table cron.job owner to fixture_admin;
    grant usage on schema public,private,cron,supabase_migrations to postgres,supabase_read_only_user;
    grant select on all tables in schema public,private,cron,supabase_migrations to supabase_read_only_user;
    grant select on cron.job to postgres;`);
  const capabilities = async () => {
    await db.exec('set session authorization supabase_read_only_user;begin read only');
    try {
      assert.equal((await db.query('show transaction_read_only')).rows[0].transaction_read_only, 'on');
      return (await db.query(`select ${writeCapabilitiesSQL(bundle)} as "writeCapabilities",${cronReadCapabilitySQL} as "cronReadCapability"`)).rows[0];
    } finally {await db.exec('rollback;set session authorization fixture_setup');}
  };
  const lock = async table => {
    await db.exec('set session authorization postgres;begin');
    try {await db.exec(`lock table ${table} in share row exclusive mode`);}
    finally {await db.exec('rollback;set session authorization fixture_setup');}
  };
  const observed = await capabilities();
  requireWriteCapabilities(bundle, observed);
  assert.equal(observed.cronReadCapability, true);
  assert.equal(observed.writeCapabilities.every(c => c.canLock), true);
  await assert.rejects(lock('cron.job'), error => error.code === '42501');
  const state = {...structuredClone(bundle.manifest.baseline),
    context: {currentPostgres: false, currentReadOnly: true, sessionPostgres: false,
      sessionReadOnly: true, sessionAdmin: false, transactionReadOnly: true},
    historyCount: bundle.manifest.baselineHistory.count, priorHistorySHA256: bundle.manifest.baselineHistory.sha256,
    observerHistory: [], catalog: bundle.beforeCatalog, invariantsSha256: bundle.manifest.baselineInvariantsSha256,
    hooksSha256: bundle.manifest.baselineHooksSha256, ...observed};
  const plan = await deploy({bundle, query: async (_sql, readOnly) => {assert.equal(readOnly, true);return state;}});
  assert.equal(plan.status, 'plan_ready', 'SELECT-only cron does not require an unauthorized grant');
  await db.exec('revoke select on cron.job from postgres');
  const noCronRead = {...state, ...await capabilities()};
  assert.equal(noCronRead.cronReadCapability, false);
  for (const apply of [false, true]) {
    let writes = 0;
    await assert.rejects(deploy({bundle, apply, query: async (_sql, readOnly) => {
      if (!readOnly) writes++; return noCronRead;
    }}), {message: 'CRON_JOB_READ_CAPABILITY_REQUIRED'});
    assert.equal(writes, 0);
  }
  await db.exec('grant select on cron.job to postgres');
  // Application/control/history tables retain the actual strong-lock guard.
  // Each privilege below is granted only in this empty disposable fixture.
  const target = 'public.notifications';
  await db.exec(`alter table ${target} owner to fixture_admin;revoke all on ${target} from postgres;grant select on ${target} to postgres`);
  let blocked = await capabilities();
  assert.deepEqual(blocked.writeCapabilities.filter(c => !c.canLock), [{table: target, canLock: false}]);
  assert.throws(() => requireWriteCapabilities(bundle, blocked), {message: 'WRITE_LOCK_CAPABILITY_REQUIRED'});
  await assert.rejects(lock(target), error => error.code === '42501');
  for (const privilege of ['MAINTAIN', 'UPDATE', 'DELETE', 'TRUNCATE']) {
    await db.exec(`grant ${privilege} on ${target} to postgres`);
    requireWriteCapabilities(bundle, await capabilities());
    await lock(target);
    await db.exec(`revoke ${privilege} on ${target} from postgres`);
    blocked = await capabilities();
    assert.equal(blocked.writeCapabilities.find(c => c.table === target).canLock, false);
    await assert.rejects(lock(target), error => error.code === '42501');
  }
  await db.exec(`grant maintain on ${target} to postgres;revoke usage on schema cron from postgres`);
  assert.equal((await capabilities()).cronReadCapability, false, 'SELECT requires schema USAGE too');
  await db.exec('grant usage on schema cron to postgres');
  requireWriteCapabilities(bundle, await capabilities());
  await lock(target);
  await db.exec('revoke usage on schema private from postgres');
  const missingSchema = await capabilities();
  assert.ok(missingSchema.writeCapabilities.filter(c => c.table.startsWith('private.')).every(c => !c.canLock));
  assert.throws(() => requireWriteCapabilities(bundle, missingSchema), {message: 'WRITE_LOCK_CAPABILITY_REQUIRED'});
  await assert.rejects(lock('private.sandbox_cashout_executions'), error => error.code === '42501');
  await db.exec('grant usage on schema private to postgres');
  requireWriteCapabilities(bundle, await capabilities());
  assert.equal((await db.query("select rolsuper from pg_roles where rolname='postgres'")).rows[0].rolsuper, false);
});
