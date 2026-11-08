import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {captureCurrentDatabaseReplay, createDatabase, liveSnapshotPath, repairMigrationPath, splitSQL} from './helpers/database-runtime-authority-fixture.mjs';
import {createHistoricalRuntimeDatabase, runtimeRepairDeferredSuccessors} from './helpers/runtime-authority-historical-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const migrationDirectory = path.join(root, 'supabase/migrations');
const sourceFiles = fs.readdirSync(migrationDirectory).filter(file => file.endsWith('.sql')).sort();
const repairName = path.basename(repairMigrationPath);
const paidAccessName = '20261106013309_sandbox_paid_access_mode_authority.sql';

test('native capture and exporter report every source migration exactly once in executed order', async () => {
  const {sql, replayReport} = await captureCurrentDatabaseReplay();
  assert.deepEqual(replayReport.files, sourceFiles);
  assert.equal(replayReport.files.filter(file => file === repairName).length, 1);
  assert.ok(replayReport.files.indexOf(repairName) < replayReport.files.indexOf(paidAccessName));
  assert.deepEqual(replayReport.excludedMigrations, []);
  assert.deepEqual(replayReport.overlayFiles, []);
  let statements = 0;
  const executed = [];
  for (const file of sourceFiles) {
    const skipped = new Set(replayReport.skipped.filter(entry => entry.file === file).map(entry => entry.index));
    const sourceStatements = splitSQL(fs.readFileSync(path.join(migrationDirectory, file), 'utf8'));
    const command = statement => statement.replace(/--[^\n]*/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '').trim();
    const roleSensitive = sourceStatements.some(statement => /^set\s+local\s+role\b/iu.test(command(statement)));
    let atomic = null;
    for (const [index, statement] of sourceStatements.entries()) {
      const head = statement.replace(/--[^\n]*/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '').trim();
      if (roleSensitive && /^begin\s*;?$/iu.test(head)) { assert.equal(atomic, null); atomic = ''; }
      if (atomic !== null) {
        assert.ok(!skipped.has(index), 'literal atomic blocks cannot skip source statements');
        atomic += statement;
        if (head && !/^(begin|commit|rollback)\s*;?$/iu.test(head)) statements++;
        if (/^commit\s*;?$/iu.test(head)) { executed.push(atomic); atomic = null; }
        continue;
      }
      if (!head || /^(begin|commit|rollback)\s*;?$/iu.test(head)) continue;
      statements++;
      if (!skipped.has(index)) executed.push(/^lock table/iu.test(head) ? `begin;${statement};commit;` : statement);
    }
    assert.equal(atomic, null, 'every role-sensitive source transaction closes');
  }
  assert.equal(replayReport.statements, statements, 'repair statements are not omitted or counted twice');
  assert.ok(sql.endsWith(executed.join('\n')), 'captured SQL really executes the reported chronology, with no late repair overlay');
  assert.equal(execFileSync(process.execPath, ['scripts/export-event-reservation-runtime-fixture.mjs'],
    {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']}), sql);
  const brand = fs.readFileSync(path.join(root, 'tests/brand-reference-guards-native.mjs'), 'utf8');
  assert.match(brand, /await captureCurrentDatabaseReplay\(\)/u, 'Brand uses the exercised native capture');
  assert.doesNotMatch(brand, /replayReport\.files\.push/u, 'Brand must not invent a second repair report entry');
});

test('default current-schema replay retains November paid-access and free-buyer authority', {timeout: 180000}, async t => {
  const {db, replayReport} = await createDatabase({implicitApiGrants: false});
  t.after(() => db.close());
  assert.deepEqual(replayReport.files, sourceFiles);
  assert.deepEqual(replayReport.overlayFiles, []);
  const definition = async identity => (await db.query('select pg_get_functiondef($1::regprocedure) definition', [identity])).rows[0].definition;
  const room = await definition('public.watch_party_room_access_pre_live_decouple(text,text)');
  assert.match(room, /private\.ordinary_creator_subject_for_mode/u, 'new host authoring still requires the exact sale mode');
  assert.match(room, /private\.creator_paid_delivery_subject_safe/u, 'purchased viewer delivery retains its newer guard');
  assert.doesNotMatch(room, /wave1_creator_money_subject_authorized_internal/u, 'October repair cannot restore the old host/viewer gate');
  assert.match(await definition('public.resolve_sandbox_monetization_tester(text,text)'), /ordinary_commerce_buyer_current/u,
    'the compatibility resolver remains the newer free-buyer authority, not the October tester-membership gate');
});

test('historical repair omission and after-snapshot overlay are explicit and separately reported', async () => {
  const captured = [];
  const databaseFactory = async () => ({async exec(sql) { captured.push(sql); }, async close() {}});
  const before = await createHistoricalRuntimeDatabase({includeHeldStudio: true, overlayLiveDrift: true, databaseFactory});
  const expected = sourceFiles.filter(file => file !== repairName && !runtimeRepairDeferredSuccessors.includes(file));
  assert.deepEqual(before.replayReport.files, expected);
  assert.deepEqual(before.replayReport.excludedMigrations, [...runtimeRepairDeferredSuccessors]);
  assert.deepEqual(before.replayReport.overlayFiles, [path.basename(liveSnapshotPath)]);
  assert.equal(captured.at(-1), fs.readFileSync(liveSnapshotPath, 'utf8'));
  captured.length = 0;
  const after = await createHistoricalRuntimeDatabase({includeHeldStudio: true, overlayLiveDrift: true, applyRepair: true, databaseFactory});
  assert.deepEqual(after.replayReport.files, expected);
  assert.deepEqual(after.replayReport.overlayFiles, [path.basename(liveSnapshotPath), repairName]);
  assert.equal(captured.at(-2), fs.readFileSync(liveSnapshotPath, 'utf8'));
  assert.equal(captured.at(-1), after.repairSql);
  await assert.rejects(createDatabase({overlayLiveDrift: true, databaseFactory}), /explicit historical repair overlay/u);
});
