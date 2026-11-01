import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('actual native Premium fixture distinguishes scheduled notice from effective paid renewal',async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
 try {
  const source=fs.readFileSync(new URL('../../scripts/test-revenuecat-premium-quarantine-concurrency.mjs',import.meta.url),'utf8');
  const start=source.indexOf('const googleUser = randomUUID();');
  const end=source.indexOf('// Exact three-user ordering proof.',start);
  assert.ok(start>0&&end>start,'native fixture boundaries must remain explicit');
  // Replay the exact native SQL and assertions sequentially. Real lock queues
  // remain a separate hosted requirement; this catches stale fixture contracts.
  const fixture=source.slice(start,end).replaceAll('query(`','await query(`');
  const literal=value=>`'${String(value).replaceAll("'","''")}'`;
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const query=async sql=>{
   const results=await db.exec(sql);
   return String(Object.values(results.at(-1).rows[0]??{})[0]??'');
  };
  const cases=[];
  const raceExactCall=async(id,sql,first,second)=>{
   assert.equal(await query(sql),first,`${id} first result`);
   assert.equal(await query(sql),second,`${id} duplicate result`);
   cases.push(id);
  };
  const run=new Function('assert','randomUUID','literal','hash','query','raceExactCall',`return (async()=>{${fixture}})();`);
  await run(assert,randomUUID,literal,hash,query,raceExactCall);
  assert.deepEqual(cases,['renewal','product-change-notice','effective-product-renewal','restore','current-owner']);
 } finally {await db.close();}
});
