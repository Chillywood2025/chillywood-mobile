import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createHistoricalDeploymentDatabase} from './helpers/historical-deployment-schema-fixture.mjs';
import {POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS} from './helpers/sandbox-cashout-historical-deployment-fixture.mjs';
import {repairMigrationPath} from './helpers/database-runtime-authority-fixture.mjs';

test('historical deployment replay defers only explicit successors and retains chronological repair', async () => {
  const source = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(file => file.endsWith('.sql')).sort();
  const target = '20261105010859_sandbox_cashout_status_notifications.sql';
  const excluded = [target, ...POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS];
  assert.ok(excluded.every(file => source.includes(file)), 'every deferred filename is an actual source migration');
  const databaseFactory = async () => ({async exec() {}, async close() {}});
  const {replayReport} = await createHistoricalDeploymentDatabase({excludeMigrations: [target], databaseFactory});
  assert.deepEqual(replayReport.files, source.filter(file => !excluded.includes(file)));
  assert.deepEqual(replayReport.excludedMigrations, excluded);
  assert.deepEqual(replayReport.overlayFiles, [], 'deployment fixtures do not append an October repair over later bodies');
  assert.equal(replayReport.files.filter(file => file === path.basename(repairMigrationPath)).length, 1);
});
