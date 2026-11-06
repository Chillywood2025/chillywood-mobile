import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase,splitSQL} from './helpers/database-runtime-authority-fixture.mjs';
import {pgtapSQLPreflight} from './helpers/pgtap-sql-preflight.mjs';
import {readPgtapSource} from './helpers/pgtap-source.mjs';

test('reviewed merch publication native SQL fixture passes current full-schema semantics', {timeout:180000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 try {
  await db.exec(pgtapSQLPreflight);
  const source=readPgtapSource('reviewed_merch_publication_mode_test.sql');let assertions=0;
  for(const statement of splitSQL(source)) {
   const results=await db.exec(statement);
   assertions+=results.flatMap(r=>r.rows??[]).flatMap(Object.values).filter(v=>typeof v==='string'&&v.startsWith('ok ')).length;
  }
  assert.equal(assertions,23,'every native SQL assertion ran');
  console.log(`${assertions} reviewed-publication SQL assertions passed; native pgTAP NOT claimed`);
 } finally {await db.close();}
});
