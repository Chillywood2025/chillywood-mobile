// October repair before/after evidence at the reviewed pre-automatic-commerce
// checkpoint. Never use this overlay to qualify the current production chain.
import {createDatabase} from './database-runtime-authority-fixture.mjs';
import {POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS} from './sandbox-cashout-historical-deployment-fixture.mjs';

export const runtimeRepairDeferredSuccessors = POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS;

export function createHistoricalRuntimeDatabase({excludeMigrations = [], ...options} = {}) {
  return createDatabase({applyRepair: false, repairInMigrationOrder: false, includeHeldStudio: false, ...options,
    excludeMigrations: [...excludeMigrations, ...runtimeRepairDeferredSuccessors]});
}
