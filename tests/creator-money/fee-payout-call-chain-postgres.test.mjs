import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase,splitSQL} from '../helpers/database-runtime-authority-fixture.mjs';

test('exact pgTAP payout call-chain inventories retain the preserved root checks and fee guards',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 try {
  for(const [file,label] of [
   ['creator_money_authority_integrity_closeout_test.sql','payout reservation counts in-flight allocations and requires fresh USD provider proof under creator lock'],
   ['creator_money_refund_settlement_doctrine_test.sql','payout request sizing and allocation consume the reserve-aware server amount'],
   ['wave1_session_not_after_authority_test.sql','current payout wrapper reaches corrected session root only after explicit fee acceptance and recovery admission; old root has no API bypass'],
  ]) {
   const statement=splitSQL(fs.readFileSync(`supabase/tests/${file}`,'utf8')).find(s=>s.includes(`'${label}'`));
   assert.ok(statement,file);const start=statement.indexOf('select ok('),end=statement.lastIndexOf(`,\n  '${label}'`);
   assert.ok(start>=0&&end>start,file);
   const expression=statement.slice(start+'select ok('.length,end);
   assert.equal((await db.query(`select (${expression}) as verified`)).rows[0].verified,true,label);
  }
 }finally{await db.close();}
});
