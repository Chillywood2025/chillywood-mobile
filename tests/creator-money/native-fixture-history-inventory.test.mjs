import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceMigrationInventory,chronologicalMigrationInventory,expectedNativeFixtureVersions,assertNativeFixtureHistory} from '../helpers/native-fixture-history-inventory.mjs';

test('full native fixture history binds exact source inventory and fixed predecessor receipts',()=>{
 const files=sourceMigrationInventory();
 assert.deepEqual(files,fs.readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort());
 const inventory=chronologicalMigrationInventory();
 assert.deepEqual([...inventory.before,...inventory.after],files,'Every source file belongs to exactly one chronological stage');
 assert.ok(inventory.before.every(file=>file.split('_')[0]<'20261109151349'));
 assert.ok(inventory.after.every(file=>file.split('_')[0]>'20261110120025'));
 for(const [stage,extra] of [['original',1],['authoring',3],['r2',4],['current',5]]){
  const versions=expectedNativeFixtureVersions(stage);
  assert.equal(versions.length,(stage==='current'?files.length:inventory.before.length)+extra);
  const observation={historyCount:versions.length,historyReceipts:versions.map(version=>({version}))};
  assertNativeFixtureHistory(observation,stage);
  assert.throws(()=>assertNativeFixtureHistory({...observation,historyCount:observation.historyCount-1},stage));
  assert.throws(()=>assertNativeFixtureHistory({...observation,historyReceipts:observation.historyReceipts.slice(1)},stage));
  const changed=structuredClone(observation);changed.historyReceipts[0].version='20990101000000';
  assert.throws(()=>assertNativeFixtureHistory(changed,stage),'equal count cannot hide replacement');
  const duplicated=structuredClone(observation);duplicated.historyReceipts[0]=duplicated.historyReceipts[1];
  assert.throws(()=>assertNativeFixtureHistory(duplicated,stage),'equal count cannot hide duplication');
 }
 assert.throws(()=>expectedNativeFixtureVersions('unknown'));
});
