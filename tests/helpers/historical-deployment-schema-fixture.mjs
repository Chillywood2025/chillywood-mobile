// Explicit November 4/5 deployment checkpoint, not current-schema proof. The
// successors require predecessors intentionally absent in these rollback tests
// or replace bodies pinned by the original reviewed deployment catalog.
import assert from 'node:assert/strict';
import {createDatabase} from './database-runtime-authority-fixture.mjs';
import {POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS} from './sandbox-cashout-historical-deployment-fixture.mjs';

export async function createHistoricalDeploymentDatabase({excludeMigrations = [], ...options} = {}) {
  const excluded = [...new Set([...excludeMigrations, ...POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS])];
  const fixture = await createDatabase({...options, applyRepair: true, repairInMigrationOrder: true,
    includeHeldStudio: true, excludeMigrations: excluded});
  assert.deepEqual(fixture.replayReport.excludedMigrations, excluded);
  assert.ok(POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS.every(file => !fixture.replayReport.files.includes(file)),
    'historical deployment scope defers exactly the named automatic-commerce successors');
  return fixture;
}
