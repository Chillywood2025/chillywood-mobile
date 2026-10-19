import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeFixture } from './helpers/studio-authority-fixture.mjs';
import { PROJECT, sha256, loadBundle, functionContracts, sourceBinding, readbackSql,
  classifyState, buildApplySql, deploy, managementQuery } from '../scripts/studio-rolling-deploy.mjs';

const bundle = loadBundle();
const ready = () => ({ schema: 1, database: 'postgres', historySha256: 'a'.repeat(64), catalogSha256: 'b'.repeat(64),
  prerequisites: true, relationsReady: true, targets: [], objectsAbsent: true, predecessorFunction: true,
  final: { functions: false, triggers: false, grants: false, policies: false } });
const applied = () => ({ ...ready(), targets: bundle.migrations.map(({ version, name, statementsSha256 }) => ({ version, name, statementsSha256 })),
  objectsAbsent: false, predecessorFunction: false, final: { functions: true, triggers: true, grants: true, policies: true } });

test('scope is exactly the preserved held migration and two reviewed successors', () => {
  assert.deepEqual(bundle.migrations.map(item => item.version), ['20261015073423', '20261019020049', '20261019020052']);
  assert.equal(bundle.migrations[0].sha256, '51f4bb3324e0dedb3691b4d961d00fcd14a0619ea7c056a041b6564eb3dd2a10');
  assert.equal(bundle.functions.length, 23);
  assert.equal(bundle.triggers.length, 5);
  assert.throws(() => functionContracts('create function public.unknown() returns void language sql as $$select 1$$;'), /FUNCTION_SEARCH_PATH_UNSUPPORTED/);
  assert.throws(() => functionContracts("create function public.unknown() returns void language sql set search_path='' as $other$select 1$other$;"), /FUNCTION_CONTRACT_PARSE_FAILED/);
});

test('read-only is default and an exact complete deployment is idempotent', async () => {
  for (const [state, status] of [[ready(), 'plan_ready'], [applied(), 'already_applied_verified']]) {
    const calls = [];
    const result = await deploy({ bundle, query: async (sql, readOnly) => { calls.push({ sql, readOnly }); return state; } });
    assert.equal(result.status, status); assert.equal(result.wrote, false);
    assert.equal(calls.length, 1); assert.equal(calls[0].readOnly, true);
  }
  let writes = 0;
  assert.equal((await deploy({ bundle, apply: true, query: async (_sql, readOnly) => { if (!readOnly) writes++; return applied(); } })).status, 'already_applied_verified');
  assert.equal(writes, 0);
});

test('partial, wrong-history, catalog and prerequisite states cannot authorize a write', async () => {
  const malformed = [
    { ...ready(), prerequisites: false }, { ...ready(), relationsReady: false }, { ...ready(), objectsAbsent: false },
    { ...ready(), predecessorFunction: false }, { ...ready(), database: 'wrong' },
    { ...applied(), targets: applied().targets.slice(1) },
    { ...applied(), targets: applied().targets.map((item, index) => index ? item : { ...item, statementsSha256: '0'.repeat(64) }) },
    { ...applied(), final: { ...applied().final, grants: false } },
  ];
  for (const state of malformed) {
    let writes = 0;
    await assert.rejects(deploy({ bundle, apply: true, query: async (_sql, readOnly) => { if (!readOnly) writes++; return state; } }));
    assert.equal(writes, 0);
  }
});

test('source changes veto apply after the read-only baseline', async () => {
  let writes = 0;
  await assert.rejects(deploy({ bundle, apply: true, query: async (_sql, readOnly) => { if (!readOnly) writes++; return ready(); },
    recheckSource: () => { throw new Error('TRACKED_SOURCE_DIRTY'); } }), /TRACKED_SOURCE_DIRTY/);
  assert.equal(writes, 0);
});

test('lost apply response is read back without a write retry', async () => {
  for (const [lastState, status] of [[applied(), 'applied_verified'], [ready(), 'not_applied_readback'], [null, 'apply_unconfirmed']]) {
    const calls = [];
    const result = await deploy({ bundle, apply: true, query: async (_sql, readOnly) => {
      calls.push(readOnly);
      if (!readOnly) throw new Error('sensitive-provider-body-must-not-be-reported');
      if (calls.length === 1) return ready();
      if (!lastState) throw new Error('readback unavailable');
      return lastState;
    } });
    assert.equal(result.status, status); assert.equal(result.responseConfirmed, false);
    assert.deepEqual(calls, [true, false, true]);
  }
});

test('management transport pins the project, read_only flag, and sanitized errors', async () => {
  const calls = [];
  const query = managementQuery('synthetic-test-token', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => JSON.stringify([{ state: ready() }]) };
  });
  await query('select synthetic_fixture', true);
  assert.equal(calls[0].url, `https://api.supabase.com/v1/projects/${PROJECT}/database/query`);
  assert.equal(JSON.parse(calls[0].options.body).read_only, true);
  assert.equal(calls[0].options.headers.authorization, 'Bearer synthetic-test-token');
  await assert.rejects(managementQuery('test', async () => ({ ok: false, text: async () => 'private payload' }))('', true), /^Error: MANAGEMENT_REQUEST_FAILED$/);
  await assert.rejects(managementQuery('test', async () => ({ ok: true, text: async () => '{}' }))('', true), /MANAGEMENT_RESPONSE_INVALID/);
  assert.throws(() => managementQuery(''), /SUPABASE_ACCESS_TOKEN_REQUIRED/);
});

test('source binding rejects wrong heads, modified tracked content and untracked tooling', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-source-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Synthetic test'); git('config', 'user.email', 'fixture@example.invalid');
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'scripts/studio-rolling-deploy.mjs'), '// fixture');
  fs.writeFileSync(path.join(dir, 'scripts/studio-rolling-deployment-manifest.json'), '{}');
  git('add', 'scripts/studio-rolling-deployment-manifest.json'); git('commit', '-qm', 'fixture');
  let head = git('rev-parse', 'HEAD');
  assert.throws(() => sourceBinding(dir, head));
  git('add', 'scripts/studio-rolling-deploy.mjs'); git('commit', '-qm', 'fixture tool');
  head = git('rev-parse', 'HEAD'); assert.equal(sourceBinding(dir, head).source, head);
  assert.throws(() => sourceBinding(dir, '0'.repeat(40)), /SOURCE_HEAD_MISMATCH/);
  fs.appendFileSync(path.join(dir, 'scripts/studio-rolling-deploy.mjs'), '\n// dirty');
  assert.throws(() => sourceBinding(dir, head), /TRACKED_SOURCE_DIRTY/);
});

test('migration inputs must be committed and are read from the exact Git object', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-git-input-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Synthetic test'); git('config', 'user.email', 'fixture@example.invalid');
  for (const { file } of bundle.sourceFiles) {
    const destination = path.join(dir, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.resolve(file), destination);
  }
  const missing = bundle.migrations[2].file;
  git('add', ...bundle.sourceFiles.map(item => item.file).filter(file => file !== missing));
  git('commit', '-qm', 'synthetic incomplete source');
  assert.throws(() => loadBundle(dir, git('rev-parse', 'HEAD')));
  git('add', missing); git('commit', '-qm', 'synthetic complete source');
  const head = git('rev-parse', 'HEAD');
  assert.equal(loadBundle(dir, head).migrations[0].sha256, bundle.migrations[0].sha256);
  fs.appendFileSync(path.join(dir, bundle.migrations[0].file), '\n-- uncommitted replacement');
  assert.equal(loadBundle(dir, head).migrations[0].body, bundle.migrations[0].body);
  assert.throws(() => loadBundle(dir), /MIGRATION_HASH_MISMATCH/);
});

test('real three-migration payload rolls back intermediate failures and verifies a complete commit', async t => {
  const fixture = await makeFixture();
  t.after(() => fixture.db.close());
  await fixture.db.exec('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
  await fixture.db.exec('create table storage.objects(id uuid primary key,bucket_id text,name text);');
  const prerequisite = { version: 'fixture_predecessor', name: 'synthetic_only', statementsSha256: sha256(JSON.stringify(['select 1;'])) };
  await fixture.db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)', [prerequisite.version, prerequisite.name, ['select 1;']]);
  // This controlled SQL fixture uses real predecessor functions and migration
  // bodies. Its synthetic ledger is explicitly separate from production pins.
  const local = { ...bundle, manifest: { ...bundle.manifest, prerequisites: [prerequisite] } };
  const read = async () => (await fixture.db.exec(readbackSql(local))).at(-1).rows[0].state;
  const before = await read(); assert.equal(classifyState(local, before), 'ready');
  const sql = buildApplySql(local, before);
  const failed = sql.replace(local.migrations[2].body, () => "do $$ begin raise exception 'synthetic_failure_after_brand'; end $$;");
  await assert.rejects(fixture.db.exec(failed), /synthetic_failure_after_brand/);
  await fixture.db.exec('rollback');
  assert.equal(classifyState(local, await read()), 'ready');
  assert.equal((await fixture.db.query("select count(*)::int n from supabase_migrations.schema_migrations")).rows[0].n, 1);
  assert.equal((await fixture.db.query("select to_regclass('public.platform_brand_publications') object")).rows[0].object, null);
  const badFinal = sql.replace('do $studio_postflight$', 'grant execute on function public.publish_platform_brand_profile(jsonb) to anon;\ndo $studio_postflight$');
  await assert.rejects(fixture.db.exec(badFinal), /studio_rolling_final_catalog_mismatch/);
  await fixture.db.exec('rollback');
  assert.equal(classifyState(local, await read()), 'ready');
  await fixture.db.query("insert into supabase_migrations.schema_migrations values('changed','changed',array['select 2;'])");
  await assert.rejects(fixture.db.exec(sql), /studio_rolling_baseline_changed/);
  await fixture.db.exec('rollback');
  await fixture.db.query("delete from supabase_migrations.schema_migrations where version='changed'");
  await fixture.db.exec(buildApplySql(local, await read()));
  const after = await read(); assert.equal(classifyState(local, after), 'applied');
  assert.equal(after.targets.length, 3);
  let writes = 0;
  const result = await deploy({ bundle: local, apply: true, query: async (_sql, readOnly) => { if (!readOnly) writes++; return read(); } });
  assert.equal(result.status, 'already_applied_verified'); assert.equal(writes, 0);
});
