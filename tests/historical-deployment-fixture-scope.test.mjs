import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createHistoricalDeploymentDatabase} from './helpers/historical-deployment-schema-fixture.mjs';
import {POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS} from './helpers/sandbox-cashout-historical-deployment-fixture.mjs';
import {repairMigrationPath} from './helpers/database-runtime-authority-fixture.mjs';

const source = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(file => file.endsWith('.sql')).sort();
const assertDeferredInventory = files => assert.deepEqual(files,
  source.filter(file => file >= '20261106001341_automatic_premium_commerce_admission.sql'),
  'every post-checkpoint successor requires explicit review in the deferred inventory');

test('historical inventory rejects missing, duplicate, reordered or earlier migrations', () => {
  const files = [...POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS];
  assertDeferredInventory(files);
  assert.deepEqual(files.slice(-4), ['20261106170725_tip_commerce_gate_entry.sql',
    '20261107173220_creator_video_social_engagement.sql','20261107191000_comment_likes.sql',
    '20261107233954_isolated_test_store_capture_v1.sql']);
  for (const mutant of [files.slice(0,-1), [...files,files.at(-1)], [...files].reverse(),
    ['20261105010859_sandbox_cashout_status_notifications.sql',...files]])
    assert.throws(() => assertDeferredInventory(mutant), assert.AssertionError);
});

test('historical deployment replay defers only explicit successors and retains chronological repair', async () => {
  assertDeferredInventory(POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS);
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
