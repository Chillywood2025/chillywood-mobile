import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {loadBundle, readbackSql, classifyState, buildApplySql, deploy, MANIFEST, MIGRATION, VERSION, NAME}
  from '../scripts/sandbox-payout-notification-exact-deploy.mjs';

// Optional explicit, local-only PostgreSQL 17 WASM engine. The default is the
// pinned repository PGlite engine. Neither is native-server concurrency proof.
async function alternateDatabaseFactory() {
  const directory = process.env.PAYOUT_TEST_PGLITE_DIRECTORY;
  assert.ok(path.isAbsolute(directory), 'test engine must be an absolute local directory');
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  assert.equal(metadata.name, '@electric-sql/pglite');
  assert.equal(metadata.version, '0.4.6', 'alternate fixture is pinned PostgreSQL 17 PGlite');
  const {PGlite} = await import(pathToFileURL(path.join(directory, 'dist/index.js')).href);
  const {pgcrypto} = await import(pathToFileURL(path.join(directory, 'dist/contrib/pgcrypto.js')).href);
  const {pg_trgm} = await import(pathToFileURL(path.join(directory, 'dist/contrib/pg_trgm.js')).href);
  return new PGlite({extensions: {pgcrypto, pg_trgm}});
}

test('disposable full-schema exact observer deployment preserves history, controls and catalog atomically', {timeout: 300000}, async t => {
  const original = loadBundle(), manifestBytes = fs.readFileSync(MANIFEST, 'utf8');
  t.after(() => assert.equal(fs.readFileSync(MANIFEST, 'utf8'), manifestBytes));
  const bundle = structuredClone(original);
  const {db} = await createDatabase({includeHeldStudio: true, applyRepair: true,
    repairInMigrationOrder: true, implicitApiGrants: false, excludeMigrations: [path.basename(MIGRATION)],
    databaseFactory: process.env.PAYOUT_TEST_PGLITE_DIRECTORY ? alternateDatabaseFactory : null});
  t.after(() => db.close());
  const version = (await db.query('show server_version_num')).rows[0].server_version_num;
  assert.equal(Math.floor(Number(version) / 10000), process.env.PAYOUT_TEST_PGLITE_DIRECTORY ? 17 : 18);
  await db.exec(`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text not null primary key,statements text[],name text,
      created_by text,idempotency_key text unique,rollback text[]);
    insert into supabase_migrations.schema_migrations(version,name,statements) select (20000000000000+i)::text,'synthetic_predecessor_'||i,array['select 1;'] from generate_series(1,585) i;
    create role supabase_read_only_user bypassrls; grant pg_read_all_data to supabase_read_only_user;
    grant select on public.notification_preferences to anon;
    update private.discovery_invalidation_worker_config set enabled=true,collecting=true,primary_delivery_enabled=true,token_sha256=repeat('a',64);
    insert into public.notification_activity_worker_config(singleton,enabled,token_sha256) values(true,true,repeat('b',64))
      on conflict(singleton) do update set enabled=true,token_sha256=excluded.token_sha256;
    insert into cron.job(jobname,schedule,command,active) values('notification-activity-worker','10 seconds','select 1',true);
    create view public.observer_fixture_unrelated_view as select 1::integer value;`);
  const predecessor = fs.readFileSync('supabase/migrations/20261102194000_sandbox_creator_cashout_execution.sql', 'utf8');
  await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',
    ['20261102194000', 'sandbox_creator_cashout_execution', [predecessor]]);
  for (const [key, state] of Object.entries(bundle.manifest.baseline.moneySwitches))
    await db.query('update public.platform_money_kill_switches set state=$2 where key=$1', [key, state]);
  const read = async () => {
    await db.exec('set session authorization supabase_read_only_user;begin read only;');
    try {return (await db.exec(readbackSql(bundle))).at(-1).rows[0].state;}
    finally {await db.exec('rollback;set session authorization postgres;');}
  };
  const before = await read();
  assert.equal(before.historyCount, 586);
  assert.deepEqual(before.catalog, bundle.beforeCatalog, 'reviewed selected source/live catalog, including explicit anon grant, matches independently');
  assert.equal(before.sandboxPredecessor.statementsSHA256, bundle.manifest.baseline.sandboxPredecessor.statementsSHA256);
  // Only a disposable in-memory bundle adopts synthetic fixture state. Never
  // write these values into source qualification or production evidence.
  for (const key of Object.keys(bundle.manifest.baseline)) bundle.manifest.baseline[key] = before[key];
  bundle.manifest.baselineHistory.sha256 = before.priorHistorySHA256;
  bundle.manifest.baselineInvariantsSha256 = before.invariantsSha256;
  bundle.manifest.baselineHooksSha256 = before.hooksSha256;
  const priorHistory = (await db.query('select * from supabase_migrations.schema_migrations order by version')).rows;
  assert.equal(classifyState(bundle, before), 'ready');
  const sql = buildApplySql(bundle, before);
  assert.match(sql, /lock_timeout='5s'/);
  assert.match(sql, /statement_timeout='45s'/);
  assert.match(sql, /idle_in_transaction_session_timeout='60s'/);
  const rejectApply = async (query = sql, expression = /observer_(baseline_changed|postcheck_failed)/) => {
    await assert.rejects(db.exec(query), expression); await db.exec('rollback');
    assert.equal(classifyState(bundle, await read()), 'ready');
    assert.deepEqual((await db.query('select * from supabase_migrations.schema_migrations order by version')).rows, priorHistory);
  };
  // Force a failure after the exact DDL has executed, before its ledger insert.
  const midFailure = sql.replace('insert into supabase_migrations.schema_migrations',
    "raise exception 'synthetic_mid_apply_failure'; insert into supabase_migrations.schema_migrations");
  assert.notEqual(midFailure, sql);
  await rejectApply(midFailure, /synthetic_mid_apply_failure/);
  // An unexpected catalog side effect introduced between DDL and history must
  // fail postflight and roll back both the side effect and the observer.
  const postFailure = sql.replace('insert into supabase_migrations.schema_migrations',
    'alter view public.observer_fixture_unrelated_view set (security_invoker=true); insert into supabase_migrations.schema_migrations');
  await rejectApply(postFailure, /observer_postcheck_failed/);
  // The same guard catches unrelated table data and control/cron changes.
  for (const mutation of [
    "update public.platform_money_kill_switches set updated_at=updated_at+interval '1 second' where key='payouts_enabled';",
    "update cron.job set schedule='1 minute' where jobname='notification-activity-worker';",
    'grant select on private.sandbox_cashout_qualifications to service_role;',
  ]) await rejectApply(sql.replace('insert into supabase_migrations.schema_migrations', mutation + ' insert into supabase_migrations.schema_migrations'));
  // A stale HTTP preflight cannot authorize changed live catalog under locks.
  await db.exec('alter view public.observer_fixture_unrelated_view set (security_invoker=true)');
  await assert.rejects(db.exec(sql), /observer_baseline_changed/); await db.exec('rollback');
  await db.exec('alter view public.observer_fixture_unrelated_view reset (security_invoker)');
  assert.equal(classifyState(bundle, await read()), 'ready');
  // The exact live ledger shape matters too: defaults and triggers could add
  // unreviewed side effects even though the insert names only three columns.
  await db.exec("alter table supabase_migrations.schema_migrations alter column created_by set default 'unexpected'");
  const defaultDrift = await read(); assert.throws(() => classifyState(bundle, defaultDrift));
  await assert.rejects(db.exec(sql), /observer_baseline_changed/); await db.exec('rollback');
  await db.exec('alter table supabase_migrations.schema_migrations alter column created_by drop default');
  await db.exec(`create function supabase_migrations.fixture_trigger() returns trigger language plpgsql as $$begin return new;end$$;
    create trigger fixture_unexpected before insert on supabase_migrations.schema_migrations for each row execute function supabase_migrations.fixture_trigger();`);
  const triggerDrift = await read(); assert.throws(() => classifyState(bundle, triggerDrift));
  await assert.rejects(db.exec(sql), /observer_baseline_changed/); await db.exec('rollback');
  await db.exec('drop trigger fixture_unexpected on supabase_migrations.schema_migrations;drop function supabase_migrations.fixture_trigger()');
  assert.equal(classifyState(bundle, await read()), 'ready');
  await db.exec('create rule fixture_skip_insert as on insert to supabase_migrations.schema_migrations do instead nothing');
  const ruleDrift = await read(); assert.equal(ruleDrift.ledgerRulesAbsent, false);
  assert.throws(() => classifyState(bundle, ruleDrift));
  await assert.rejects(db.exec(sql), /observer_baseline_changed/); await db.exec('rollback');
  await db.exec('drop rule fixture_skip_insert on supabase_migrations.schema_migrations');
  assert.equal(classifyState(bundle, await read()), 'ready');
  await db.exec(`create function extensions.fixture_observer_hook() returns event_trigger language plpgsql as $$begin return;end$$;
    create event trigger fixture_observer_hook on ddl_command_end execute function extensions.fixture_observer_hook();`);
  const hookDrift = await read();
  assert.notEqual(hookDrift.hooksSha256, before.hooksSha256);
  assert.equal(hookDrift.invariantsSha256, before.invariantsSha256, 'out-of-schema hooks are separately guarded');
  assert.throws(() => classifyState(bundle, hookDrift));
  await assert.rejects(db.exec(sql), /observer_baseline_changed/); await db.exec('rollback');
  await db.exec('drop event trigger fixture_observer_hook;drop function extensions.fixture_observer_hook()');
  assert.equal(classifyState(bundle, await read()), 'ready');
  // Partial observer objects are rejected without a target history record.
  await db.exec('begin'); await db.exec(bundle.body);
  const partial = (await db.exec(readbackSql(bundle))).at(-1).rows[0].state;
  partial.context = before.context;
  assert.throws(() => classifyState(bundle, partial));
  await db.exec('rollback');
  await db.exec(sql);
  const after = await read();
  assert.equal(classifyState(bundle, after), 'applied');
  assert.equal(after.historyCount, 587);
  assert.equal(after.invariantsSha256, before.invariantsSha256);
  assert.deepEqual(after.catalog, bundle.afterCatalog);
  assert.deepEqual(after.catalog.tables, before.catalog.tables);
  assert.equal(after.catalog.functions.length, before.catalog.functions.length + 4);
  assert.equal(after.catalog.executionTriggers.length, (before.catalog.executionTriggers?.length ?? 0) + 1);
  for (const key of Object.keys(bundle.manifest.baseline)) assert.deepEqual(after[key], before[key]);
  const history = (await db.query('select version,name,statements from supabase_migrations.schema_migrations where version=$1', [VERSION])).rows;
  assert.deepEqual(history, [{version: VERSION, name: NAME, statements: [bundle.body]}]);
  assert.deepEqual((await db.query('select * from supabase_migrations.schema_migrations where version<>$1 order by version', [VERSION])).rows, priorHistory);
  assert.equal((await deploy({bundle, apply: true, query: async (_sql, readOnly) => {
    assert.equal(readOnly, true); return read();
  }})).status, 'already_applied_verified');
  await db.query("update supabase_migrations.schema_migrations set statements=array['tampered'] where version=$1", [VERSION]);
  const wrongBody = await read(); assert.throws(() => classifyState(bundle, wrongBody));
  assert.deepEqual(loadBundle().manifest, original.manifest);
});
