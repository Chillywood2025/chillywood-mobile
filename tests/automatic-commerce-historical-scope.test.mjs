import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {contract} from '../ops/automatic-commerce-cutover/prepare.mjs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {assertAutomaticCommerceSuccessors,createAutomaticCommerceHistoricalDatabase} from './helpers/automatic-commerce-historical-fixture.mjs';
import {nativeProductionMigrationFiles} from './helpers/native-production-migration-inventory.mjs';
const source=fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort();

test('automatic cutover defers only the complete explicit production successor inventory',()=>{
 assertAutomaticCommerceSuccessors(source);
 const webFixture='20261113230934_stripe_video_explicit_web_test_fixture.sql';
 assert.ok(nativeProductionMigrationFiles.includes(webFixture));
 assert.throws(()=>assertAutomaticCommerceSuccessors(source,nativeProductionMigrationFiles.filter(file=>file!==webFixture)),assert.AssertionError);
 for(const deferred of [nativeProductionMigrationFiles.slice(1),[...nativeProductionMigrationFiles,nativeProductionMigrationFiles[0]],
  [...nativeProductionMigrationFiles].reverse(),['20261108095500_paid_party_ticket_capacity_accounting.sql',...nativeProductionMigrationFiles]])
  assert.throws(()=>assertAutomaticCommerceSuccessors(source,deferred),assert.AssertionError);
 assert.throws(()=>assertAutomaticCommerceSuccessors([...source,'20261112000000_unknown_successor.sql']),assert.AssertionError);
 assert.throws(()=>assertAutomaticCommerceSuccessors(source.filter(file=>file!==nativeProductionMigrationFiles[0])),assert.AssertionError);
});

test('historical capture keeps exact predecessors while default current replay includes all successors',async()=>{
 const held=['20261102093836','20261102094308','20261104120922','20261105010859'].map(version=>{
  const found=source.filter(file=>file.startsWith(version+'_'));assert.equal(found.length,1);return found[0];
 });
 const existing=[...contract.migrations.map(m=>path.basename(m.path)),...held];
 const databaseFactory=async()=>({async exec(){},async close(){}});
 const historical=await createAutomaticCommerceHistoricalDatabase({excludeMigrations:existing,databaseFactory});
 const excluded=[...existing,...nativeProductionMigrationFiles];
 assert.deepEqual(historical.replayReport.excludedMigrations,excluded);
 assert.deepEqual(historical.replayReport.files,source.filter(file=>!excluded.includes(file)));
 assert.deepEqual(historical.replayReport.overlayFiles,[]);
 const current=await createDatabase({databaseFactory});
 assert.deepEqual(current.replayReport.files,source);
 assert.ok(nativeProductionMigrationFiles.every(file=>current.replayReport.files.includes(file)));
 const runner=fs.readFileSync(new URL('../ops/automatic-commerce-cutover/run-native.mjs',import.meta.url),'utf8');
 assert.match(runner,/await createAutomaticCommerceHistoricalDatabase\(/u);
 assert.match(runner,/captured\.every\(f=>f\.matches===true\)/u,'the frozen native definition assertion is retained');
});
