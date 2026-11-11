import assert from 'node:assert/strict';
import fs from 'node:fs';

// Expected local fixture inventory comes from source, never the observed DB or
// a stale catalog-size constant. Deployment receipts remain separately bound
// to their immutable content by the existing install/observation checks.
export function sourceMigrationInventory(){
 const files=fs.readdirSync(new URL('../../supabase/migrations/',import.meta.url))
  .filter(name=>name.endsWith('.sql')).sort();
 assert.ok(files.length>0);
 for(const name of files)assert.match(name,/^\d{12}(?:\d{2})?_.+\.sql$/u);
 const versions=files.map(name=>name.split('_')[0]);
 assert.equal(new Set(versions).size,files.length,'Source migration versions must be unique');
 return files;
}
const fixed=Object.freeze({original:['20261109151349'],
 authoring:['20261109151349','20261110021153','20261110021650'],
 r2:['20261109151349','20261110021153','20261110021650','20261110060000'],
 current:['20261109151349','20261110021153','20261110021650','20261110060000','20261110120025']});
export function chronologicalMigrationInventory(){
 const all=sourceMigrationInventory(),before=[],after=[];
 for(const file of all){
  const version=file.split('_')[0];
  if(version<'20261109151349')before.push(file);
  else{
   // No source migration currently interleaves immutable native stages. If one
   // is added, fail rather than silently executing it at the wrong stage.
   assert.ok(version>'20261110120025','Interleaved source requires explicit native-stage replay');
   after.push(file);
  }
 }
 assert.deepEqual([...before,...after],all);
 return {before,after,all};
}
export function expectedNativeFixtureVersions(stage){
 assert.ok(Object.hasOwn(fixed,stage),'Unknown predecessor stage');
 const inventory=chronologicalMigrationInventory();
 const versions=[...(stage==='current'?inventory.all:inventory.before).map(name=>name.split('_')[0]),...fixed[stage]].sort();
 assert.equal(new Set(versions).size,versions.length,'Source and fixed receipts must not overlap');
 return versions;
}
export function assertNativeFixtureHistory(observation,stage){
 const versions=expectedNativeFixtureVersions(stage);
 assert.equal(observation.historyCount,versions.length);
 assert.deepEqual(observation.historyReceipts.map(row=>row.version).sort(),versions);
}
