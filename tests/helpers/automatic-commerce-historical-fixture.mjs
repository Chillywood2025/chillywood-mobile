// Test-only reconstruction of the frozen automatic-commerce cutover baseline.
// Current-schema fixtures continue to apply all production successors.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from './database-runtime-authority-fixture.mjs';
import {nativeProductionMigrationFiles} from './native-production-migration-inventory.mjs';

export function assertAutomaticCommerceSuccessors(source, deferred=nativeProductionMigrationFiles) {
 assert.deepEqual([...deferred],source.filter(file=>file.endsWith('.sql')&&file>='20261110225744_').sort(),
  'every post-cutover production successor requires explicit historical inventory review');
}

export async function createAutomaticCommerceHistoricalDatabase({excludeMigrations=[],...options}={}) {
 const source=fs.readdirSync(new URL('../../supabase/migrations/',import.meta.url));
 assertAutomaticCommerceSuccessors(source);
 const excluded=[...excludeMigrations,...nativeProductionMigrationFiles];
 assert.equal(new Set(excluded).size,excluded.length,'historical exclusions must be unique');
 const fixture=await createDatabase({...options,excludeMigrations:excluded});
 assert.deepEqual(fixture.replayReport.excludedMigrations,excluded);
 assert.ok(nativeProductionMigrationFiles.every(file=>!fixture.replayReport.files.includes(file)));
 return fixture;
}
