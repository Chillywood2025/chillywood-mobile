// Exact native helper SQL/trigger effects only. Hosted independent backends
// remain mandatory for its90 blocking and27 nonblocking schedules.
import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeSetupDatabase} from './helpers/native-runner-setup-preflight.mjs';
import {runOrdinaryProfileMetadataSequential} from '../scripts/lib/ordinary-profile-metadata-races.mjs';

test('native profile helper executes all exact setup/transition/media SQL sequentially',{timeout:180000},async()=>{
 const db=nativeSetupDatabase();
 try {
  const result=await runOrdinaryProfileMetadataSequential({query:db.query,lit:value=>`'${String(value).replaceAll("'","''")}'`});
  assert.deepEqual(result,{evidence:'sequential SQL only; native contention not executed',transitions:108,tampering:4,media:3});
 }finally{await db.close();}
});
